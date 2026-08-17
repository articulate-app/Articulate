// supabase/functions/ai-chat/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";


import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { brandKitForAiFromProject, collectBrandTemplateVisualRefs } from "../_shared/project-brand-kit.ts";



// Kept inline because this function is also deployed through the Supabase
// dashboard, which uploads index.ts without sibling/shared source files.
type AiTokenQuotaContext = {
  client: any;
  threadId: string;
  clientRequestId: string;
  runId: string | null;
  signal: AbortSignal | null;
  counters: Map<string, number>;
  latestUsage: any | null;
};



class AiTokenLimitError extends Error {
  code: string;
  usage: any;
  status = 429;
  retryable = false;

  constructor(code: string, usage: any) {
    const wouldExceed = code.endsWith("_would_be_exceeded");
    const team = code.startsWith("team_");
    super(wouldExceed
      ? `This request would exceed the remaining daily ${team ? "team" : "user"} AI token allowance.`
      : team
      ? "Your team has reached its daily AI token limit. Review the team limit to continue."
      : "You have reached your daily AI token limit. Review your limit to continue.");
    this.name = "AiTokenLimitError";
    this.code = code;
    this.usage = usage ?? null;
  }
}



class AiTokenAccountingError extends Error {
  code: string;
  status = 503;
  retryable = true;

  constructor(code: string, message = code) {
    super(message);
    this.name = "AiTokenAccountingError";
    this.code = code;
  }
}



function nextTokenCallKey(context: AiTokenQuotaContext, stage: string) {
  const normalized = String(stage || "unknown").replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 90) || "unknown";
  const ordinal = (context.counters.get(normalized) ?? 0) + 1;
  context.counters.set(normalized, ordinal);
  return `${normalized}:${ordinal}`;
}



function positiveTokenInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}



function estimatePromptTokens(bodyText: string) {
  // Reserve conservatively to keep concurrent requests from spending the same
  // allowance. Provider-reported usage replaces this estimate after the call.
  return Math.max(1, Math.ceil(new TextEncoder().encode(bodyText).byteLength / 3.2));
}



function parseRequestedCompletionTokens(body: any, fallback: number) {
  const explicit = positiveTokenInt(
    body?.max_output_tokens ?? body?.max_completion_tokens ?? body?.max_tokens,
  );
  return Math.min(explicit ?? fallback, 100_000);
}



function normalizeProviderUsage(raw: any) {
  const usage = raw?.usage ?? raw?.response?.usage ?? raw ?? {};
  const prompt = Math.max(0, Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0);
  const completion = Math.max(0, Number(usage.output_tokens ?? usage.completion_tokens ?? 0) || 0);
  const total = Math.max(0, Number(usage.total_tokens ?? (prompt + completion)) || 0);
  const cached = Math.max(0, Number(
    usage.input_tokens_details?.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0,
  ) || 0);
  return {
    prompt_tokens: Math.round(prompt),
    completion_tokens: Math.round(completion),
    total_tokens: Math.round(total),
    cached_prompt_tokens: Math.round(cached),
  };
}



function extractUsageFromProviderBody(text: string, contentType: string) {
  let lastUsage: any = null;
  let providerResponseId: string | null = null;
  const inspect = (value: any) => {
    if (!value || typeof value !== "object") return;
    providerResponseId = providerResponseId ?? value.id ?? value.response?.id ?? null;
    const candidate = value.usage ?? value.response?.usage;
    if (candidate) lastUsage = candidate;
  };

  if (/json/i.test(contentType) && !/event-stream/i.test(contentType)) {
    try { inspect(JSON.parse(text)); } catch { /* handled as missing usage */ }
  } else {
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try { inspect(JSON.parse(payload)); } catch { /* ignore non-JSON SSE data */ }
    }
  }
  return { usage: normalizeProviderUsage(lastUsage), providerResponseId };
}



async function finalizeTokenEvent(args: {
  context: AiTokenQuotaContext;
  eventId: string;
  response?: Response | null;
  succeeded: boolean;
  errorCode?: string | null;
}) {
  let usage = normalizeProviderUsage(null);
  let providerResponseId: string | null = null;
  let parseFailed = false;
  if (args.response) {
    try {
      const text = await args.response.text();
      const parsed = extractUsageFromProviderBody(
        text,
        args.response.headers.get("content-type") ?? "",
      );
      usage = parsed.usage;
      providerResponseId = parsed.providerResponseId;
    } catch (error: any) {
      parseFailed = true;
      console.warn("ai token provider usage parse failed", {
        event_id: args.eventId,
        error: error?.message ?? String(error),
      });
    }
    providerResponseId = args.response.headers.get("x-request-id") ?? providerResponseId;
  }

  const { data, error } = await args.context.client.rpc("ai_finalize_token_call", {
    p_event_id: args.eventId,
    p_run_id: args.context.runId,
    p_provider_request_id: providerResponseId,
    p_provider_http_status: args.response?.status ?? null,
    p_prompt_tokens: usage.prompt_tokens,
    p_completion_tokens: usage.completion_tokens,
    p_cached_prompt_tokens: usage.cached_prompt_tokens,
    p_total_tokens: usage.total_tokens,
    p_succeeded: args.succeeded,
    p_error_code: args.errorCode ?? (parseFailed ? "provider_usage_missing" : null),
    p_metadata: { usage_parse_failed: parseFailed },
  });
  if (error) {
    console.error("ai token call finalization failed", { event_id: args.eventId, error: error.message });
    return;
  }
  if (data?.usage) args.context.latestUsage = data.usage;
}



function keepTokenAccountingAlive(promise: Promise<unknown>) {
  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(promise);
  else void promise;
}



async function fetchOpenAiWithTokenAccounting(args: {
  url: string;
  init: RequestInit;
  context: AiTokenQuotaContext;
  stage: string;
  defaultMaxCompletionTokens?: number;
}): Promise<Response> {
  const bodyText = typeof args.init.body === "string" ? args.init.body : "";
  let body: any = {};
  try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { /* estimate raw body */ }
  const model = String(body?.model ?? "unknown");
  const estimatedPrompt = estimatePromptTokens(bodyText);
  const estimatedCompletion = parseRequestedCompletionTokens(
    body,
    Math.max(256, args.defaultMaxCompletionTokens ?? 4096),
  );
  const callKey = nextTokenCallKey(args.context, args.stage);
  const { data: reservation, error: reservationError } = await args.context.client.rpc("ai_reserve_token_call", {
    p_thread_id: args.context.threadId,
    p_client_request_id: args.context.clientRequestId,
    p_call_key: callKey,
    p_stage: args.stage,
    p_provider: "openai",
    p_model: model,
    p_estimated_prompt_tokens: estimatedPrompt,
    p_estimated_completion_tokens: estimatedCompletion,
    p_run_id: args.context.runId,
    p_metadata: { endpoint: new URL(args.url).pathname },
  });
  if (reservationError) {
    throw new AiTokenAccountingError("token_accounting_unavailable", reservationError.message);
  }
  args.context.latestUsage = reservation?.usage ?? args.context.latestUsage;
  if (reservation?.allowed !== true) {
    const code = String(reservation?.code ?? "token_accounting_unavailable");
    if ([
      "user_token_limit_exceeded", "team_token_limit_exceeded",
      "user_token_limit_would_be_exceeded", "team_token_limit_would_be_exceeded",
    ].includes(code)) {
      throw new AiTokenLimitError(code, reservation?.usage ?? null);
    }
    throw new AiTokenAccountingError(code);
  }

  const eventId = String(reservation.event_id ?? "");
  try {
    const response = await fetch(args.url, args.init);
    const clone = response.clone();
    keepTokenAccountingAlive(finalizeTokenEvent({
      context: args.context,
      eventId,
      response: clone,
      succeeded: response.ok,
      errorCode: response.ok ? null : `provider_http_${response.status}`,
    }));
    return response;
  } catch (error: any) {
    await finalizeTokenEvent({
      context: args.context,
      eventId,
      response: null,
      succeeded: false,
      errorCode: error?.name === "AbortError" ? "provider_aborted" : "provider_fetch_failed",
    });
    throw error;
  }
}



const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};



function createTimingTrace(meta: Record<string, any> = {}) {
  const t0 = performance.now();
  const marks: Record<string, number> = {};
  return {
    mark(name: string, extra: Record<string, any> = {}) {
      const ms = Math.round(performance.now() - t0);
      marks[name] = ms;
      console.log("ai-chat timing", { ...meta, stage: name, ms, ...extra });
      return ms;
    },
    getMarks() {
      return { ...marks };
    },
  };
}



function cleanUuidOrNull(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}



const SUPABASE_URL = Deno.env.get("SUPABASE_URL");


const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");


const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_KEY!;


const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");



const EDGE_FUNCTIONS_BASE = `${(SUPABASE_URL || "").replace(/\/$/, "")}/functions/v1`;



function getEdgeFunctionAuthHeaders(userAuthorization?: string | null, runId?: string | null) {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const jwt = userAuthorization?.replace(/^Bearer\s+/i, "").trim() || serviceKey || anonKey || "";
  return {
    "Content-Type": "application/json",
    ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    ...(anonKey || jwt ? { apikey: anonKey ?? jwt } : {}),
    ...(runId ? { "x-ai-run-id": runId } : {}),
  };
}



function isBlockedHostname(hostname: string) {
  const h = hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(h)) return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^10\./.test(h) || /^127\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(h) || /^192\.168\./.test(h)) return true;
  return false;
}



function sanitizePublicUrl(input: string) {
  const value = String(input || "").trim();
  if (!value) throw new Error("URL is required");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http/https URLs are allowed");
  if (isBlockedHostname(url.hostname)) throw new Error("That host is not allowed");
  if (url.username || url.password) throw new Error("Authenticated URLs are not allowed");
  return url.toString();
}



function htmlToText(html: string) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}




async function fetchPublicWebpage(url: string) {
  const targetUrl = sanitizePublicUrl(url);
  const tryFetch = async (resource: string, headers: Record<string, string> = {}) => {
    let current = sanitizePublicUrl(resource);
    let resp: Response | null = null;
    for (let redirectCount = 0; redirectCount <= 5; redirectCount++) {
      resp = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ai-chat/1.0; +https://openai.com)",
          Accept: "text/html,application/xhtml+xml,application/xml,text/plain,application/json;q=0.9,*/*;q=0.8",
          ...headers,
        },
        signal: AbortSignal.timeout(15000),
      });
      if (![301, 302, 303, 307, 308].includes(resp.status)) break;
      const location = resp.headers.get("location");
      if (!location) break;
      current = sanitizePublicUrl(new URL(location, current).toString());
      if (redirectCount === 5) throw new Error("external_source_too_many_redirects");
    }
    if (!resp) throw new Error("external_source_unavailable");
    const text = await resp.text();
    return { resp, text };
  };

  let fetched;
  try {
    fetched = await tryFetch(targetUrl);
  } catch (err) {
    console.warn("Direct webpage fetch failed", { host: new URL(targetUrl).hostname, error: String(err) });
  }

  if (fetched?.resp.status === 401 || fetched?.resp.status === 403 || fetched?.resp.status === 407) {
    throw new Error("external_source_authentication_required");
  }

  const parsedTarget = new URL(targetUrl);
  const mirrorAllowed = !parsedTarget.search && !parsedTarget.username && !parsedTarget.password;
  if ((!fetched || !fetched.resp.ok) && mirrorAllowed) {
    const jinaUrl = `https://r.jina.ai/http://${targetUrl.replace(/^https?:\/\//, "")}`;
    fetched = await tryFetch(jinaUrl, { "X-Return-Format": "markdown" });
  }

  if (!fetched) throw new Error("external_source_unavailable");

  const { resp, text } = fetched;
  const contentType = resp.headers.get("content-type") || "";
  const finalUrl = resp.url || targetUrl;
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text);
  const title = titleMatch ? htmlToText(titleMatch[1]) : null;
  const normalizedText = /html|xml/i.test(contentType) ? htmlToText(text) : text.trim();

  return {
    ok: resp.ok,
    status: resp.status,
    url: targetUrl,
    final_url: finalUrl,
    content_type: contentType,
    title,
    text: normalizedText.slice(0, 20000),
    truncated: normalizedText.length > 20000,
  };
}



async function invokeJsonEdgeFunction(
  functionName: string,
  body: Record<string, unknown>,
  timeoutMs = 20000,
  authorization?: string | null,
  runId?: string | null,
) {
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL is missing");
  const url = `${EDGE_FUNCTIONS_BASE}/${functionName}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: getEdgeFunctionAuthHeaders(authorization, runId),
    body: JSON.stringify({ ...(body ?? {}), ...(runId ? { run_id: runId } : {}) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await resp.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!resp.ok) {
    throw new Error(`${functionName} failed (${resp.status}): ${typeof data?.error === 'string' ? data.error : data?.error?.message || text || 'Unknown error'}`);
  }
  return data;
}



function normalizeToolStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => typeof v === "string" ? v.trim() : "")
      .filter((v) => v.length > 0);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}



// Provider credentials stay in Supabase secrets. Model ids are NOT secrets.
// Keep one API-key secret per provider (for example OPENAI_API_KEY,
// ANTHROPIC_API_KEY) and keep the friendly model catalog in backend code.
// This avoids proliferating model-id secrets or env vars like AI_MODEL_OPENAI_FAST/SMART/DEFAULT,
// while still letting the FE send stable model_key values such as "auto",
// "openai.gpt-5.5", or "claude.sonnet".
//
// NOTE: only the OpenAI executor is implemented in this function today. Claude
// entries are present so the FE contract can be introduced now; selecting them
// intentionally returns a provider-adapter error until the Anthropic executor is
// added.
const OPENAI_MODEL_FAST = "gpt-5.4-mini";


const OPENAI_MODEL_ROUTER = OPENAI_MODEL_FAST;



function openAiModelSupportsTemperature(model: any): boolean {
  const key = String(model ?? "").trim().toLowerCase();
  // Some newer OpenAI reasoning / GPT-5-series models reject explicit
  // temperature values in both Responses and Chat Completions. They either do
  // not support the parameter at all or only allow the implicit default. Keep
  // temperature as a UI/thread concept, but omit it from the API payload for
  // those models so model routing can safely switch between fast/smart models.
  if (!key) return true;
  if (key.startsWith("gpt-5")) return false;
  if (key.startsWith("o3") || key.startsWith("o4")) return false;
  if (key.includes("reasoning")) return false;
  return true;
}



function sanitizeOpenAiPayload<T extends Record<string, any>>(payload: T): T {
  if (!payload || typeof payload !== "object") return payload;
  if (Object.prototype.hasOwnProperty.call(payload, "temperature") && !openAiModelSupportsTemperature(payload.model)) {
    const model = payload.model;
    delete (payload as any).temperature;
    console.log("ai-chat openai payload sanitized", {
      model,
      removed: "temperature",
      reason: "model_does_not_support_temperature",
    });
  }
  return payload;
}



async function fetchOpenAi(
  url: string,
  init: RequestInit = {},
  accounting: {
    quota?: AiTokenQuotaContext | null;
    stage: string;
    defaultMaxCompletionTokens?: number;
    tokenBased?: boolean;
  },
): Promise<Response> {
  // Centralized guard for OpenAI payload quirks. This prevents individual call
  // sites (route classifiers, title generation, streamed Responses, etc.) from
  // breaking when a selected model does not accept a parameter that older models
  // accepted. Keep call-site payloads readable; sanitize just before transport.
  const nextInit: RequestInit = { ...init };
  if (accounting.quota?.signal) {
    nextInit.signal = nextInit.signal
      ? AbortSignal.any([nextInit.signal, accounting.quota.signal])
      : accounting.quota.signal;
  }
  const rawBody = (nextInit as any).body;
  if (typeof rawBody === "string") {
    try {
      const parsed = JSON.parse(rawBody);
      if (parsed && typeof parsed === "object") {
        if (
          accounting.tokenBased !== false && accounting.quota && accounting.defaultMaxCompletionTokens &&
          parsed.max_output_tokens == null && parsed.max_completion_tokens == null && parsed.max_tokens == null
        ) {
          if (/\/responses$/.test(url)) parsed.max_output_tokens = accounting.defaultMaxCompletionTokens;
          else if (/\/chat\/completions$/.test(url)) parsed.max_completion_tokens = accounting.defaultMaxCompletionTokens;
        }
        nextInit.body = JSON.stringify(sanitizeOpenAiPayload(parsed));
      }
    } catch {
      // Non-JSON body. Leave untouched.
    }
  }
  if (accounting.tokenBased === false || !accounting.quota) return await fetch(url, nextInit);
  return await fetchOpenAiWithTokenAccounting({
    url,
    init: nextInit,
    context: accounting.quota,
    stage: accounting.stage,
    defaultMaxCompletionTokens: accounting.defaultMaxCompletionTokens,
  });
}




function canonicalEntityLink(entityType: string, id: string | number) {
  return `app://${entityType}/${id}`;
}

function canonicalArtifactDownloadLink(id: string, format = "html", versionNumber?: number | null) {
  const query = new URLSearchParams({ format });
  if (versionNumber && versionNumber > 0) query.set("version", String(versionNumber));
  return `app://artifact/${id}/download?${query.toString()}`;
}

function canonicalTaskLink(taskId: number) { return Number.isInteger(taskId) && taskId > 0 ? `app://task/${taskId}` : null; }
function canonicalProjectLink(projectId: number) { return Number.isInteger(projectId) && projectId > 0 ? `app://project/${projectId}` : null; }

function decorateEntity(row: any, entityType: "task" | "project" | "user" | "artifact") {
  if (!row || typeof row !== "object") return row;
  const rawId = entityType === "project"
    ? row.id ?? row.project_id
    : entityType === "user"
      ? row.id ?? row.user_id
      : entityType === "artifact"
        ? row.id ?? row.artifact_id
        : row.id;
  const id = entityType === "artifact" ? cleanUuidOrNull(rawId) : positiveInt(rawId);
  if (!id) return { ...row, entity_type: entityType };

  const label = entityType === "task"
    ? row.title
    : entityType === "project"
      ? row.name ?? row.project_name
      : entityType === "user"
        ? row.full_name ?? row.assigned_to_name ?? `User ${id}`
        : row.title ?? `Artifact ${id}`;

  const app_link = canonicalEntityLink(entityType, id);
  const base = {
    ...row,
    entity_type: entityType,
    app_link,
    markdown_link: label ? `[${label}](${app_link})` : app_link,
  };
  if (entityType !== "artifact") return base;

  const versionNumber = positiveInt(row.version_number ?? row.current_version);
  return {
    ...base,
    download_links: {
      html: canonicalArtifactDownloadLink(String(id), "html", versionNumber),
      markdown: canonicalArtifactDownloadLink(String(id), "md", versionNumber),
      text: canonicalArtifactDownloadLink(String(id), "txt", versionNumber),
      json: canonicalArtifactDownloadLink(String(id), "json", versionNumber),
      original: canonicalArtifactDownloadLink(String(id), "original", versionNumber),
    },
  };
}

const decorateTask = (row: any) => decorateEntity(row, "task");
const decorateProject = (row: any) => decorateEntity(row, "project");

/** Top-level brand layout templates for tools — easy for the model to spot (not artifacts). */
function brandLayoutTemplatesSummary(projectRow: { brand_kit?: unknown } | null | undefined) {
  const kit = brandKitForAiFromProject(projectRow);
  const templates = kit?.design_templates ?? [];
  const visuals = collectBrandTemplateVisualRefs(kit, 12);
  return {
    count: templates.length,
    visual_image_count: visuals.length,
    note:
      templates.length > 0
        ? "These are Brand → Templates on the project (layout refs for creatives). They are not artifacts or attachments."
        : "No Brand layout templates saved on this project yet.",
    templates: templates.map((template) => ({
      id: template.id,
      title: template.title,
      notes: template.notes,
      asset_count: template.assets.length,
      assets: template.assets.map((asset) => ({
        id: asset.id,
        media_type: asset.media_type,
        title: asset.title,
        url: asset.url,
        storage_path: asset.storage_path,
      })),
    })),
  };
}

function approvedImageBanksSummary(projectRow: { brand_kit?: unknown } | null | undefined) {
  const kit = brandKitForAiFromProject(projectRow);
  const banks = kit?.approved_image_banks ?? [];
  return {
    count: banks.length,
    note:
      banks.length > 0
        ? "Approved stock / image libraries for this project. Prefer these when sourcing photography."
        : "No approved image banks configured on this project yet.",
    banks: banks.map((bank) => ({
      id: bank.id,
      provider: bank.provider,
      label: bank.label,
      url: bank.url,
      notes: bank.notes,
    })),
  };
}

function withBrandKitForAi(projectRow: any) {
  if (!projectRow) return projectRow;
  const brand_kit = brandKitForAiFromProject(projectRow);
  return {
    ...projectRow,
    brand_kit,
    brand_layout_templates: brandLayoutTemplatesSummary(projectRow),
    approved_image_banks: approvedImageBanksSummary(projectRow),
  };
}

function normalizeProjectLookupName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

function fuzzyStringScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 100;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (longer.includes(shorter)) {
    return Math.max(70, Math.round((shorter.length / longer.length) * 100));
  }
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return Math.max(0, Math.round((1 - distance / maxLen) * 100));
}

function scoreProjectNameMatch(projectName: string, query: string): number {
  const name = normalizeProjectLookupName(projectName);
  const q = normalizeProjectLookupName(query);
  if (!name || !q) return 0;
  if (name === q) return 100;
  if (name.startsWith(q) || q.startsWith(name)) return 92;
  if (name.includes(q) || q.includes(name)) return 82;

  const nameTokens = name.split(" ").filter(Boolean);
  const queryTokens = q.split(" ").filter(Boolean);
  let tokenScore = 0;
  if (queryTokens.length > 0) {
    const overlaps = queryTokens.map((qt) => {
      let best = 0;
      for (const nt of nameTokens) best = Math.max(best, fuzzyStringScore(nt, qt));
      return best;
    });
    const avg = overlaps.reduce((sum, value) => sum + value, 0) / overlaps.length;
    const allStrong = overlaps.every((value) => value >= 70);
    tokenScore = Math.round(avg * (allStrong ? 0.85 : 0.65));
  }

  const fullFuzzy = Math.round(fuzzyStringScore(name, q) * 0.9);
  return Math.max(tokenScore, fullFuzzy);
}

/** Pull likely project/brand name phrases from free text for soft ownership attach. */
function inferProjectNameCandidatesFromText(text: string): string[] {
  const source = String(text ?? "");
  const candidates: string[] = [];
  const patterns = [
    /\b(?:for|para)\s+(?:the\s+|o\s+|a\s+|projecto?\s+|projeto\s+|marca\s+|brand\s+|client[ea]?\s+)?([A-ZÁÉÍÓÚÂÊÔÃÕÀÜ][\w&'’.-]*(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÀÜ][\w&'’.-]*){0,3})/gi,
    /\b(?:project|projeto|projecto|marca|brand|client[ea]?)\s+["']?([A-Za-zÁÉÍÓÚÂÊÔÃÕÀÜ][\w&'’ .-]{1,40})["']?/gi,
    /\b(?:for|para)\s+([a-záéíóúâêôãõàü][\w&'’.-]{2,40})\b/gi,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) != null) {
      const value = String(match[1] ?? "").trim().replace(/[.,;:!?]+$/g, "");
      if (value.length >= 3 && value.length <= 60) candidates.push(value);
    }
  }
  return [...new Set(candidates)];
}

/**
 * Resolve a visible project by id and/or name. Name lookup does not require
 * thread/task tags — it searches projects the caller can already see.
 * Supports imperfect names (typos / truncated tokens) via fuzzy scoring.
 */
async function resolveVisibleProjectTarget(args: {
  db: any;
  projectId?: unknown;
  projectName?: unknown;
  query?: unknown;
  allowScopeFallbackIds?: number[];
}): Promise<{
  ok: true;
  project: { id: number; name: string | null; color?: string | null; logo?: string | null };
  resolution: "project_id" | "project_name" | "scope_fallback";
  match_score?: number;
} | {
  ok: false;
  error: string;
  needs_clarification: boolean;
  candidates?: Array<{ id: number; name: string | null; score: number }>;
}> {
  const explicitId = positiveInt(args.projectId);
  if (explicitId) {
    const { data, error } = await args.db
      .from("v_projects_minimal")
      .select("id,name,color,logo")
      .eq("id", explicitId)
      .maybeSingle();
    if (error) {
      return { ok: false, error: error.message, needs_clarification: false };
    }
    if (!data) {
      return {
        ok: false,
        error: `Project ${explicitId} was not found or is not visible.`,
        needs_clarification: true,
      };
    }
    return {
      ok: true,
      project: {
        id: Number(data.id),
        name: data.name ?? null,
        color: data.color ?? null,
        logo: data.logo ?? null,
      },
      resolution: "project_id",
      match_score: 100,
    };
  }

  const lookup =
    String(args.projectName ?? "").trim() ||
    String(args.query ?? "").trim();

  if (lookup) {
    // Broad visible set so typos like "articulat"/"artikulate" can still score.
    const { data, error } = await args.db
      .from("v_projects_minimal")
      .select("id,name,color,logo")
      .order("name", { ascending: true })
      .limit(150);
    if (error) {
      return { ok: false, error: error.message, needs_clarification: false };
    }

    const ranked = (data ?? [])
      .map((row: any) => ({
        id: Number(row.id),
        name: (row.name ?? null) as string | null,
        color: row.color ?? null,
        logo: row.logo ?? null,
        score: scoreProjectNameMatch(String(row.name ?? ""), lookup),
      }))
      .filter((row: { id: number; score: number }) => Number.isFinite(row.id) && row.score >= 55)
      .sort((a: { score: number; name: string | null }, b: { score: number; name: string | null }) =>
        b.score - a.score || String(a.name ?? "").localeCompare(String(b.name ?? "")),
      );

    if (ranked.length === 0) {
      return {
        ok: false,
        error: `No visible project matched "${lookup}". Ask the user to clarify the project name.`,
        needs_clarification: true,
        candidates: [],
      };
    }

    const best = ranked[0];
    const second = ranked[1];
    const clearWinner =
      best.score >= 88 ||
      (best.score >= 70 && (!second || best.score - second.score >= 12));
    const isAmbiguous = !clearWinner && ranked.length > 1 && second && second.score >= best.score - 10;

    if (isAmbiguous || !clearWinner) {
      return {
        ok: false,
        error: `Could not confidently match "${lookup}". Ask the user which project to use.`,
        needs_clarification: true,
        candidates: ranked.slice(0, 8).map((row: any) => ({
          id: row.id,
          name: row.name,
          score: row.score,
        })),
      };
    }

    return {
      ok: true,
      project: {
        id: best.id,
        name: best.name,
        color: best.color,
        logo: best.logo,
      },
      resolution: "project_name",
      match_score: best.score,
    };
  }

  const scopeId = (args.allowScopeFallbackIds ?? []).find((id) => Number.isFinite(id) && id > 0) ?? null;
  if (scopeId) {
    const { data, error } = await args.db
      .from("v_projects_minimal")
      .select("id,name,color,logo")
      .eq("id", scopeId)
      .maybeSingle();
    if (!error && data) {
      return {
        ok: true,
        project: {
          id: Number(data.id),
          name: data.name ?? null,
          color: data.color ?? null,
          logo: data.logo ?? null,
        },
        resolution: "scope_fallback",
        match_score: 100,
      };
    }
  }

  return {
    ok: false,
    error: "Provide project_id or project_name so the target project can be resolved.",
    needs_clarification: true,
  };
}
const decorateUser = (row: any) => decorateEntity(row, "user");
const decorateArtifact = (row: any) => decorateEntity(row, "artifact");


function decorateArtifactPayload(data: any) {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map((item) => decorateArtifactPayload(item));

  const out: any = { ...data };
  if (Array.isArray(out.artifacts)) out.artifacts = out.artifacts.map((item: any) => decorateArtifact(item));
  if (Array.isArray(out.rows)) out.rows = out.rows.map((item: any) => decorateArtifact(item));
  if (out.snapshot && typeof out.snapshot === "object") {
    out.snapshot = decorateArtifact({
      ...out.snapshot,
      id: out.snapshot.id ?? out.artifact_id,
      version_number: out.version_number ?? out.snapshot.current_version,
    });
  }
  if (out.artifact && typeof out.artifact === "object") out.artifact = decorateArtifact(out.artifact);
  if (out.artifact_id && !out.app_link) Object.assign(out, decorateArtifact({ ...out, id: out.artifact_id }));
  return out;
}

/** Decorated artifact links from a freshly created/updated artifact build. */
function extractDecoratedArtifactsFromBuildStart(data: any, fallbackSpecs: any[] = []) {
  const planArtifacts = Array.isArray(data?.build?.plan?.artifacts)
    ? data.build.plan.artifacts
    : [];
  const handleMap =
    data?.handle_map && typeof data.handle_map === "object" && !Array.isArray(data.handle_map)
      ? data.handle_map
      : (data?.build?.plan?.handle_map && typeof data.build.plan.handle_map === "object"
        ? data.build.plan.handle_map
        : {});

  const rows = planArtifacts.length > 0
    ? planArtifacts
    : (Array.isArray(fallbackSpecs) ? fallbackSpecs : []).map((spec: any) => {
      const handle = typeof spec?.handle === "string" ? spec.handle : "";
      const mappedId = handle && handleMap?.[handle] != null ? String(handleMap[handle]) : null;
      return {
        ...spec,
        artifact_id: cleanUuidOrNull(spec?.artifact_id) ?? cleanUuidOrNull(mappedId),
      };
    });

  const decorated = rows
    .map((row: any) => {
      const id = cleanUuidOrNull(row?.artifact_id ?? row?.id);
      if (!id) return null;
      return decorateArtifact({
        id,
        title: typeof row?.title === "string" && row.title.trim()
          ? row.title.trim()
          : `Artifact ${id.slice(0, 8)}`,
        version_number: row?.expected_version ?? row?.version_number ?? row?.current_version,
      });
    })
    .filter(Boolean);

  if (decorated.length > 0) return decorated;

  // Last resort: unit_key = artifact:<uuid>
  const units = Array.isArray(data?.units) ? data.units : [];
  return units
    .map((unit: any) => {
      const key = String(unit?.unit_key ?? "");
      const match = key.match(/^artifact:([0-9a-f-]{36})$/i);
      const id = cleanUuidOrNull(match?.[1] ?? unit?.input_snapshot?.artifact_id);
      if (!id) return null;
      const title =
        typeof unit?.input_snapshot?.artifact_spec?.title === "string"
          ? unit.input_snapshot.artifact_spec.title.trim()
          : null;
      return decorateArtifact({ id, title: title || `Artifact ${id.slice(0, 8)}` });
    })
    .filter(Boolean);
}


function extractJsonObjectFromText(raw: string) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  // Parse direct JSON first, then recover one embedded object when the model wraps it in text.
  try {
    const direct = JSON.parse(text);
    if (direct && typeof direct === "object" && !Array.isArray(direct)) return direct;
  } catch {
    // Continue to an embedded-object extraction attempt.
  }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}



// Model tool schemas live in ai-chat; this endpoint contains execution only.




function safeJsonParse(value: string | null | undefined) {
  try {
    return JSON.parse(value ?? "{}");
  } catch {
    return null;
  }
}



function logToolEvent(event: string, payload: Record<string, unknown> = {}) {
  try {
    console.log(JSON.stringify({ tag: "ai_chat_tool", event, ...payload }));
  } catch {
    console.log(`[ai_chat_tool] ${event}`);
  }
}



function normalizeOptionalDateInput(value: any): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") return null;
  // Keep only ISO calendar dates. Supabase/Postgres date columns reject empty
  // strings, and model tool calls often use "" when the user gave no date.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return null;
}



function normalizeOptionalTextInput(value: any): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}




function firstPresentArg(args: any, keys: string[]) {
  for (const key of keys) {
    if (hasOwnProp(args, key)) return args[key];
  }
  return undefined;
}



function positiveInt(value: any): number | null {
  const n = Number(value ?? 0);
  return Number.isInteger(n) && n > 0 ? n : null;
}




function normalizeKeywordRegionId(value: any): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (/^[a-z]{2}$/.test(lower)) return lower;
  const countryMatch = /^country([a-z]{2})$/i.exec(raw);
  if (countryMatch) return countryMatch[1].toLowerCase();
  const geoMatch = /^(?:geoTargetConstants\/)?\/?(\d{3,})$/.exec(raw);
  if (geoMatch) return `geoTargetConstants/${geoMatch[1]}`;
  const adsConst = /^geoTargetConstants\/\d+$/i.test(raw);
  if (adsConst) return raw.replace(/^geotargetconstants/i, "geoTargetConstants");
  return raw;
}



function isTaskFieldUnset(row: any, field: string): boolean {
  const pairedDisplayFields: Record<string, string[]> = {
    project_status_id: ["project_status_name"],
    assigned_to_id: ["assigned_to_name"],
    language_id: ["language_code"],
    content_type_id: ["content_type_title"],
    production_type_id: ["production_type_title"],
  };
  const values = [row?.[field], ...(pairedDisplayFields[field] ?? []).map((pairedField) => row?.[pairedField])];
  return values.every((value) => value === null || value === undefined || String(value).trim() === "");
}



function taskMatchesStructuredFilter(row: any, rawFilter: any): boolean {
  const filter = normalizeTaskMutationFilter(rawFilter);
  if (!filter) return true;
  return filter.conditions.every((condition: any) => {
    const field = String(condition.field);
    const operator = String(condition.operator);
    if (operator === "is_empty") return isTaskFieldUnset(row, field);
    if (operator === "is_not_empty") return !isTaskFieldUnset(row, field);
    const current = row?.[field];
    const expected = condition.value;
    const equal = /_id$/.test(field)
      ? positiveInt(current) === positiveInt(expected)
      : String(current ?? "").trim() === String(expected ?? "").trim();
    return operator === "equals" ? equal : !equal;
  });
}



async function resolveCatalogReference(
  db: any,
  table: string,
  rawValue: any,
  explicitId?: any,
  quota?: AiTokenQuotaContext | null,
): Promise<{ id: number | null; label: string | null; error: string | null }> {
  const directId = positiveInt(explicitId);
  if (directId) {
    const { data, error } = await db.from(table).select("*").eq("id", directId).maybeSingle();
    if (error) return { id: null, label: String(directId), error: error.message };
    if (!data) return { id: null, label: String(directId), error: `Could not find ${table} record with id ${directId}.` };
    return { id: directId, label: String(data.title ?? data.name ?? data.code ?? directId), error: null };
  }

  const reference = String(rawValue ?? "").trim();
  if (!reference) return { id: null, label: null, error: null };

  const { data, error } = await db.from(table).select("*").limit(500);
  if (error) return { id: null, label: reference, error: error.message };
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return { id: null, label: reference, error: `No visible ${table} candidates are available.` };

  const resolution = await resolveCatalogReferences({
    entityType: table,
    references: [reference],
    candidates: rows.map((row: any) => ({
      id: String(row.id),
      label: String(row.title ?? row.name ?? row.label ?? row.code ?? row.slug ?? row.id),
      aliases: [row.code, row.slug, row.value, row.description]
        .map((value: any) => String(value ?? "").trim())
        .filter(Boolean),
      metadata: { id: positiveInt(row.id) },
    })),
    quota,
  });
  if (resolution.matches.length === 1) {
    const match = resolution.matches[0];
    return { id: positiveInt(match.candidate_id), label: match.candidate_label, error: null };
  }
  return { id: null, label: reference, error: `Could not safely resolve ${table} from “${reference}”.` };
}


async function buildTaskFieldUpdatePayload(db: any, rawArgs: any, quota?: AiTokenQuotaContext | null): Promise<{ payload: any; resolved: any; errors: string[] }> {
  const payload: any = {};
  const resolved: any = {};
  const errors: string[] = [];

  if (hasOwnProp(rawArgs, "delivery_date")) payload.delivery_date = normalizeOptionalDateInput(rawArgs.delivery_date);
  if (hasOwnProp(rawArgs, "publication_date")) payload.publication_date = normalizeOptionalDateInput(rawArgs.publication_date);
  if (hasOwnProp(rawArgs, "new_title")) payload.title = normalizeOptionalTextInput(rawArgs.new_title);
  if (hasOwnProp(rawArgs, "assigned_to_id")) payload.assigned_to_id = Number(rawArgs.assigned_to_id ?? 0) || null;
  if (hasOwnProp(rawArgs, "briefing")) payload.briefing = normalizeOptionalTextInput(rawArgs.briefing);
  if (hasOwnProp(rawArgs, "notes")) payload.notes = normalizeOptionalTextInput(rawArgs.notes);
  if (hasOwnProp(rawArgs, "keyword")) payload.keyword = normalizeOptionalTextInput(rawArgs.keyword);
  if (hasOwnProp(rawArgs, "meta_title")) payload.meta_title = normalizeOptionalTextInput(rawArgs.meta_title);
  if (hasOwnProp(rawArgs, "meta_description")) payload.meta_description = normalizeOptionalTextInput(rawArgs.meta_description);
  if (hasOwnProp(rawArgs, "h1")) payload.h1 = normalizeOptionalTextInput(rawArgs.h1);
  if (hasOwnProp(rawArgs, "h2")) payload.h2 = normalizeOptionalTextInput(rawArgs.h2);
  if (hasOwnProp(rawArgs, "alt_text")) payload.alt_text = normalizeOptionalTextInput(rawArgs.alt_text);
  if (hasOwnProp(rawArgs, "filename")) payload.filename = normalizeOptionalTextInput(rawArgs.filename);
  if (hasOwnProp(rawArgs, "internal_links")) payload.internal_links = normalizeOptionalTextInput(rawArgs.internal_links);
  if (hasOwnProp(rawArgs, "tags")) payload.tags = normalizeOptionalTextInput(rawArgs.tags);
  if (hasOwnProp(rawArgs, "category")) payload.category = normalizeOptionalTextInput(rawArgs.category);
  if (hasOwnProp(rawArgs, "secondary_keywords")) payload.secondary_keywords = normalizeOptionalTextInput(rawArgs.secondary_keywords);
  if (hasOwnProp(rawArgs, "source_urls")) payload.source_urls = normalizeToolStringArray(rawArgs.source_urls);

  const languageValue = firstPresentArg(rawArgs, ["language", "language_code", "language_name"]);
  if (hasOwnProp(rawArgs, "language_id") || languageValue !== undefined) {
    const ref = await resolveCatalogReference(db, "languages", languageValue, rawArgs.language_id, quota);
    if (ref.error) errors.push(ref.error);
    else if (ref.id) {
      payload.language_id = ref.id;
      resolved.language = ref.label;
    }
  }

  const contentTypeValue = firstPresentArg(rawArgs, ["content_type", "content_type_title", "content_type_name"]);
  if (hasOwnProp(rawArgs, "content_type_id") || contentTypeValue !== undefined) {
    const ref = await resolveCatalogReference(db, "content_types", contentTypeValue, rawArgs.content_type_id, quota);
    if (ref.error) errors.push(ref.error);
    else if (ref.id) {
      payload.content_type_id = ref.id;
      resolved.content_type = ref.label;
    }
  }

  const productionTypeValue = firstPresentArg(rawArgs, ["production_type", "production_type_title", "production_type_name"]);
  if (hasOwnProp(rawArgs, "production_type_id") || productionTypeValue !== undefined) {
    const ref = await resolveCatalogReference(db, "production_types", productionTypeValue, rawArgs.production_type_id, quota);
    if (ref.error) errors.push(ref.error);
    else if (ref.id) {
      payload.production_type_id = ref.id;
      resolved.production_type = ref.label;
    }
  }

  const statusValue = firstPresentArg(rawArgs, ["project_status", "project_status_title", "project_status_name", "status"]);
  if (hasOwnProp(rawArgs, "project_status_id") || statusValue !== undefined) {
    const ref = await resolveCatalogReference(db, "project_statuses", statusValue, rawArgs.project_status_id, quota);
    if (ref.error) errors.push(ref.error);
    else if (ref.id) {
      payload.project_status_id = ref.id;
      resolved.project_status = ref.label;
    }
  }

  return { payload, resolved, errors };
}




function hasOwnProp(value: any, key: string): boolean {
  return !!value && Object.prototype.hasOwnProperty.call(value, key);
}



const TASK_SELECT_FOR_WRITE = `
  id,title,briefing,notes,keyword,secondary_keywords,tags,meta_title,meta_description,h1,h2,alt_text,project_id_int,project_name,project_status_id,project_status_name,
  content_type_id,content_type_title,production_type_id,production_type_title,language_id,language_code,assigned_to_id,assigned_to_name,
  delivery_date,publication_date,updated_at
`;







function uniqueInts(values: any[] | undefined): number[] {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v > 0))];
}

function uniqueStrings(values: any[] | undefined): string[] {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((v) => String(v ?? "").trim())
    .filter((v) => v.length > 0))];
}


async function loadProjectLanguages(db: any, projectId: number) {
  const { data, error } = await db
    .from("project_languages")
    .select(`
      language_id,
      is_primary,
      languages (
        id,
        name:long_name,
        code
      )
    `)
    .eq("project_id", projectId)
    .eq("is_deleted", false);

  if (error) {
    console.error("read_project languages error", error);
    return [];
  }

  return data ?? [];
}



function currentDateIso() {
  return new Date().toISOString().slice(0, 10);
}




function normalizeResponsesUsage(usage: any) {
  if (!usage) return null;
  return {
    prompt_tokens: usage.input_tokens ?? usage.prompt_tokens ?? null,
    completion_tokens: usage.output_tokens ?? usage.completion_tokens ?? null,
    total_tokens: usage.total_tokens ?? null,
    prompt_tokens_details: usage.input_tokens_details ?? usage.prompt_tokens_details ?? null,
  };
}



async function resolveCatalogReferences(args: {
  entityType: string;
  references: string[];
  candidates: any[];
  quota?: AiTokenQuotaContext | null;
}) {
  const references = (Array.isArray(args.references) ? args.references : [])
    .map((value) => String(value ?? "").trim().slice(0, 500))
    .filter(Boolean)
    .slice(0, 50);
  const candidates = (Array.isArray(args.candidates) ? args.candidates : [])
    .map((candidate: any) => ({
      id: String(candidate?.id ?? "").trim(),
      label: String(candidate?.label ?? candidate?.title ?? candidate?.name ?? "").trim().slice(0, 500),
      aliases: (Array.isArray(candidate?.aliases) ? candidate.aliases : [])
        .map((value: any) => String(value ?? "").trim().slice(0, 300))
        .filter(Boolean)
        .slice(0, 20),
      metadata: safeClarificationJsonValue(candidate?.metadata ?? null),
    }))
    .filter((candidate: any) => candidate.id && candidate.label)
    .slice(0, 500);
  if (references.length === 0 || candidates.length === 0) {
    return { matches: [], unresolved_references: references, candidates, usage: null };
  }

  const payload = {
    model: OPENAI_MODEL_ROUTER,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "catalogue_reference_resolution_v3",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            matches: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  reference_index: { type: "integer" },
                  candidate_id: { type: "string" },
                  confidence: { type: "string", enum: ["high", "medium", "low"] },
                  reason: { type: "string" },
                },
                required: ["reference_index", "candidate_id", "confidence", "reason"],
              },
            },
            unresolved_reference_indexes: { type: "array", items: { type: "integer" } },
          },
          required: ["matches", "unresolved_reference_indexes"],
        },
      },
    },
    messages: [
      {
        role: "system",
        content: [
          `Resolve imperfect user references to factual ${String(args.entityType)} catalogue rows.`,
          "Users are not required to tag entities, use exact spelling, write the full label, use the database language, or preserve singular/plural and tense.",
          "Use the complete candidate list and actively select the best reasonable semantic match. Do not ask for clarification merely because the wording is abbreviated, misspelled, translated, informal, or not identical to the database label.",
          "Short forms such as Ivo should resolve to a visible full name such as Ivo Relvas when it is the best available match. Ordinary variants such as complete versus Completed should resolve to the matching row.",
          "Use high confidence for an obvious match and medium confidence for a strong best match whose wording is imperfect. Both are executable catalogue resolutions.",
          "Never invent an id. Return one match per reference. A concise reason is a user-visible factual selection summary, not private chain-of-thought.",
          "Leave a reference unresolved only when there is no reasonable candidate or two or more candidates are genuinely tied after considering their complete labels, aliases, metadata, and the reference itself.",
        ].join(" "),
      },
      { role: "user", content: JSON.stringify({ references, candidates }) },
    ],
  };
  const response = await fetchOpenAi("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, { quota: args.quota, stage: `catalog_${String(args.entityType).replace(/\W+/g, "_")}_resolution`, defaultMaxCompletionTokens: 1200 });
  if (!response.ok) throw new Error(`Catalogue reference resolution failed: ${await response.text()}`);
  const data = await response.json();
  const parsed: any = extractJsonObjectFromText(String(data?.choices?.[0]?.message?.content ?? "")) ?? {};
  const candidateById = new Map(candidates.map((candidate: any) => [String(candidate.id), candidate]));
  const acceptedReferenceIndexes = new Set<number>();
  const matches = (Array.isArray(parsed.matches) ? parsed.matches : []).flatMap((match: any) => {
    const referenceIndex = Number(match?.reference_index);
    const candidate = candidateById.get(String(match?.candidate_id ?? ""));
    const confidence = String(match?.confidence ?? "low");
    if (!Number.isInteger(referenceIndex) || referenceIndex < 0 || referenceIndex >= references.length || !candidate || !["high", "medium"].includes(confidence) || acceptedReferenceIndexes.has(referenceIndex)) return [];
    acceptedReferenceIndexes.add(referenceIndex);
    return [{
      reference_index: referenceIndex,
      reference: references[referenceIndex],
      candidate_id: candidate.id,
      candidate_label: candidate.label,
      confidence,
      reason: String(match?.reason ?? "").trim().slice(0, 500),
      metadata: candidate.metadata ?? null,
    }];
  });
  return {
    matches,
    unresolved_references: references.filter((_reference, index) => !acceptedReferenceIndexes.has(index)),
    candidates,
    usage: normalizeResponsesUsage(data?.usage),
  };
}



async function loadVisibleTaskCatalog(db: any, projectId?: number | null) {
  let query = db
    .from("tasks")
    .select("id,title,project_id_int,project_name,project_status_id,project_status_name,assigned_to_id,assigned_to_name,language_id,language_code,content_type_id,content_type_title,production_type_id,production_type_title,delivery_date,publication_date")
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (positiveInt(projectId)) query = query.eq("project_id_int", positiveInt(projectId));
  const { data, error } = await query;
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    id: String(row.id),
    label: String(row.title ?? ""),
    aliases: [],
    metadata: {
      task_id: positiveInt(row.id),
      project_id: positiveInt(row.project_id_int),
      project_name: row.project_name ?? null,
      project_status_id: positiveInt(row.project_status_id),
      project_status_name: row.project_status_name ?? null,
      assigned_to_id: positiveInt(row.assigned_to_id),
      assigned_to_name: row.assigned_to_name ?? null,
      language_id: positiveInt(row.language_id),
      language_code: row.language_code ?? null,
      content_type_id: positiveInt(row.content_type_id),
      content_type_title: row.content_type_title ?? null,
      production_type_id: positiveInt(row.production_type_id),
      production_type_title: row.production_type_title ?? null,
      delivery_date: row.delivery_date ?? null,
      publication_date: row.publication_date ?? null,
    },
  })).filter((row: any) => row.id && row.label);
}




const TASK_MUTATION_FILTER_FIELDS_V3 = new Set([
  "project_status_id",
  "assigned_to_id",
  "language_id",
  "content_type_id",
  "production_type_id",
  "delivery_date",
  "publication_date",
]);



const TASK_MUTATION_FILTER_OPERATORS_V3 = new Set([
  "is_empty",
  "is_not_empty",
  "equals",
  "not_equals",
]);



function normalizeTaskMutationFilter(value: any) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const conditions = (Array.isArray(source.conditions) ? source.conditions : []).flatMap((condition: any) => {
    const field = String(condition?.field ?? "").trim();
    const operator = String(condition?.operator ?? "").trim();
    if (!TASK_MUTATION_FILTER_FIELDS_V3.has(field) || !TASK_MUTATION_FILTER_OPERATORS_V3.has(operator)) return [];
    const rawValue = condition?.value ?? null;
    const normalizedValue = /_id$/.test(field)
      ? positiveInt(rawValue)
      : rawValue == null
      ? null
      : String(rawValue).trim().slice(0, 300) || null;
    if (["equals", "not_equals"].includes(operator) && normalizedValue == null) return [];
    return [{ field, operator, value: normalizedValue }];
  }).slice(0, 20);
  return conditions.length > 0 ? { match: "all", conditions } : null;
}



async function loadVisibleUserCatalog(db: any) {
  const { data, error } = await db
    .from("v_users_minimal_i_can_see")
    .select("id,full_name,email")
    .order("full_name", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    id: String(row.id),
    label: String(row.full_name ?? row.email ?? `User ${row.id}`),
    aliases: row.email ? [String(row.email)] : [],
    metadata: { user_id: positiveInt(row.id), email: row.email ?? null },
  })).filter((row: any) => row.id && row.label);
}



function sanitizeClarificationOptionId(value: any) {
  const id = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return id || null;
}



function safeClarificationJsonValue(value: any, depth = 0): any {
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 2000);
  if (depth >= 4) return null;
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => safeClarificationJsonValue(entry, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 50).map(([key, entry]) => [
      String(key).slice(0, 100),
      safeClarificationJsonValue(entry, depth + 1),
    ]));
  }
  return String(value).slice(0, 2000);
}



function nonNegativeIntOrNull(value: any) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}



function normalizeClarificationEntityRef(value: any) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entityType = String(value.entity_type ?? value.type ?? "").trim().slice(0, 50);
  const ref = safeClarificationJsonValue({
    entity_type: entityType || null,
    project_id: positiveInt(value.project_id),
    task_id: positiveInt(value.task_id),
    channel_id: positiveInt(value.channel_id),
    artifact_id: cleanUuidOrNull(value.artifact_id),
    user_id: positiveInt(value.user_id),
  });
  return Object.values(ref ?? {}).some((entry) => entry != null) ? ref : null;
}



function normalizeClarificationOptions(options: any[] | null | undefined) {
  const normalized = (Array.isArray(options) ? options : [])
    .map((rawOption: any, index: number) => {
      const option = rawOption && typeof rawOption === "object" && !Array.isArray(rawOption)
        ? rawOption
        : { label: String(rawOption ?? "") };
      const id = sanitizeClarificationOptionId(option.id ?? option.label ?? `option_${index + 1}`) ?? `option_${index + 1}`;
      const label = String(option.label ?? option.id ?? "").trim().slice(0, 200);
      if (!id || !label) return null;
      return safeClarificationJsonValue({
        id,
        label,
        description: String(option.description ?? "").trim().slice(0, 1000) || null,
        value: option.value == null ? null : safeClarificationJsonValue(option.value),
        kind: String(option.kind ?? "").trim().slice(0, 80) || null,
        entity_ref: normalizeClarificationEntityRef(option.entity_ref),
        recommended: option.recommended === true,
        disabled: option.disabled === true,
      });
    })
    .filter((option: any) => option?.id && option?.label)
    .slice(0, 50);

  return normalized;
}




async function executeClarificationTool(runtime: any) {
  const { db, ctx, thread, activeChannelId, toolName, rawArgs, finalize, canonicalTaskId, canonicalChannelId, supabaseService, attachments } = runtime;

if (toolName === "ai_request_clarification") {
    const clarification = {
      type: "clarification_request",
      question: String(rawArgs?.question ?? "").trim().slice(0, 1000),
      options: normalizeClarificationOptions(rawArgs?.options),
      allow_multiple: rawArgs?.allow_multiple === true,
      min_selections: nonNegativeIntOrNull(rawArgs?.min_selections),
      max_selections: positiveInt(rawArgs?.max_selections),
      allow_free_text: rawArgs?.allow_free_text !== false,
      target_scope: String(rawArgs?.target_scope ?? "none").slice(0, 80),
      pending_request: { text: String(ctx?.current_user_request ?? "").trim(), action: "clarify", target_scope: String(rawArgs?.target_scope ?? "none") },
    };
    if (!clarification.question) return finalize({ name: toolName, ok: false, error: "clarification_question_required", data: null });
    return finalize({ name: toolName, ok: true, skipped: true, requires_clarification: true, error: null, data: { clarification_request: clarification } });
  }

  return null;
}


async function executeArtifactTool(runtime: any) {
  const { db, ctx, thread, activeChannelId, toolName, rawArgs, finalize, canonicalTaskId, canonicalChannelId, supabaseService, attachments } = runtime;

if (toolName === "ai_list_task_artifacts") {
    const taskId = positiveInt(rawArgs.task_id);
    if (!taskId) return finalize({ name: toolName, ok: false, error: "task_id_required", data: null });
    const { data, error } = await db.rpc("ai_list_task_artifacts_v1", {
      p_task_id: taskId,
      p_include_content: rawArgs.include_content === true,
      p_limit: Math.max(1, Math.min(Number(rawArgs.limit ?? 100) || 100, 500)),
    });
    return finalize({ name: toolName, ok: !error && data?.ok !== false, error: error?.message ?? data?.error ?? null, data: decorateArtifactPayload(data) });
  }

if (toolName === "ai_list_project_artifacts") {
    const projectId = positiveInt(rawArgs.project_id);
    if (!projectId) return finalize({ name: toolName, ok: false, error: "project_id_required", data: null });
    const { data, error } = await db.rpc("ai_list_project_artifacts_v1", {
      p_project_id: projectId,
      p_include_content: rawArgs.include_content === true,
      p_limit: Math.max(1, Math.min(Number(rawArgs.limit ?? 100) || 100, 500)),
    });
    return finalize({ name: toolName, ok: !error && data?.ok !== false, error: error?.message ?? data?.error ?? null, data: decorateArtifactPayload(data) });
  }

if (toolName === "ai_read_artifact") {
    const artifactId = cleanUuidOrNull(rawArgs.artifact_id);
    if (!artifactId) return finalize({ name: toolName, ok: false, error: "artifact_id_required", data: null });
    const { data, error } = await db.rpc("ai_get_artifact_v2", {
      p_artifact_id: artifactId,
      p_version_number: positiveInt(rawArgs.version_number),
    });
    const decorated = decorateArtifactPayload(data);
    if (rawArgs.content_mode === "summary" && decorated?.snapshot) {
      const snapshot = decorated.snapshot;
      decorated.snapshot = {
        id: snapshot.id,
        artifact_type: snapshot.artifact_type,
        artifact_role: snapshot.artifact_role,
        title: snapshot.title,
        status: snapshot.status,
        task_id: snapshot.task_id,
        channel_id: snapshot.channel_id,
        language_id: snapshot.language_id,
        current_version: snapshot.current_version,
        metadata: snapshot.metadata,
        content_preview: String(snapshot.content_text ?? "").replace(/\s+/g, " ").slice(0, 1200),
        asset_data: snapshot.asset_data,
        app_link: snapshot.app_link,
        markdown_link: snapshot.markdown_link,
        download_links: snapshot.download_links,
      };
    }
    return finalize({ name: toolName, ok: !error && data?.ok !== false, error: error?.message ?? data?.error ?? null, data: decorated });
  }

if (toolName === "ai_list_ai_thread_artifacts") {
    if (!thread?.id) return finalize({ name: toolName, ok: false, error: "thread_id_required", data: null });
    const { data, error } = await db.rpc("ai_list_ai_thread_artifacts_v1", {
      p_thread_id: thread.id,
      p_include_content: rawArgs.include_content === true,
      p_limit: Math.max(1, Math.min(Number(rawArgs.limit ?? 100) || 100, 500)),
    });
    return finalize({ name: toolName, ok: !error && data?.ok !== false, error: error?.message ?? data?.error ?? null, data: decorateArtifactPayload(data) });
  }

if (toolName === "ai_search_artifacts") {
    const query = String(rawArgs.query ?? rawArgs.q ?? "").trim();
    if (query.length < 2) {
      return finalize({ name: toolName, ok: false, error: "query_required", data: null });
    }
    const artifactTypes = Array.isArray(rawArgs.artifact_types)
      ? rawArgs.artifact_types
          .map((value: unknown) => String(value ?? "").trim())
          .filter((value: string) => value.length > 0)
          .slice(0, 20)
      : null;
    const { data, error } = await db.rpc("ai_search_artifacts_v1", {
      p_q: query.slice(0, 200),
      p_limit: Math.max(1, Math.min(Number(rawArgs.limit ?? 8) || 8, 50)),
      p_task_id: positiveInt(rawArgs.task_id),
      p_project_id: positiveInt(rawArgs.project_id),
      p_ai_thread_id: cleanUuidOrNull(rawArgs.ai_thread_id),
      p_artifact_types: artifactTypes && artifactTypes.length > 0 ? artifactTypes : null,
    });
    return finalize({
      name: toolName,
      ok: !error && data?.ok !== false,
      error: error?.message ?? data?.error ?? null,
      data: decorateArtifactPayload(data),
    });
  }

if (toolName === "ai_list_artifact_versions") {
    const artifactId = cleanUuidOrNull(rawArgs.artifact_id);
    if (!artifactId) return finalize({ name: toolName, ok: false, error: "artifact_id_required", data: null });
    const { data, error } = await db.rpc("ai_list_artifact_versions_v1", {
      p_artifact_id: artifactId,
      p_limit: Math.max(1, Math.min(Number(rawArgs.limit ?? 50) || 50, 200)),
      p_offset: Math.max(0, Number(rawArgs.offset ?? 0) || 0),
    });
    return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data: data ?? null });
  }

if (toolName === "ai_restore_artifact_version") {
    const artifactId = cleanUuidOrNull(rawArgs.artifact_id);
    const versionNumber = positiveInt(rawArgs.version_number);
    if (!artifactId || !versionNumber) return finalize({ name: toolName, ok: false, error: "artifact_id_and_version_required", data: null });
    const { data, error } = await db.rpc("ai_restore_artifact_version_v1", {
      p_artifact_id: artifactId,
      p_version_number: versionNumber,
      p_change_summary: String(rawArgs.change_summary ?? "").trim().slice(0, 1000) || null,
    });
    return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data: decorateArtifactPayload(data ?? null) });
  }

if (toolName === "ai_attach_artifact_to_task") {
    const artifactId = cleanUuidOrNull(rawArgs.artifact_id);
    const taskId = positiveInt(rawArgs.task_id);
    if (!artifactId || !taskId) return finalize({ name: toolName, ok: false, error: "artifact_id_and_task_id_required", data: null });
    const { data, error } = await db.rpc("ai_attach_artifact_to_task_v1", {
      p_artifact_id: artifactId, p_task_id: taskId,
      p_channel_id: positiveInt(rawArgs.channel_id), p_language_id: positiveInt(rawArgs.language_id),
    });
    return finalize({ name: toolName, ok: !error && data?.ok !== false, error: error?.message ?? data?.error ?? null, data: decorateArtifactPayload(data) });
  }

if (toolName === "ai_start_artifact_build") {
    if (!ctx?.ai_run_id || !thread?.id) {
      return finalize({ name: toolName, ok: false, error: "active_run_and_thread_required", data: null });
    }
    const requestText = String(rawArgs.request_text ?? ctx?.current_user_request ?? "").trim();
    const allowedOperations = new Set(["create", "update", "translate", "adapt", "transcribe", "summarize", "merge", "generate"]);
    const seenHandles = new Set<string>();
    let artifactSpecs: any[] = [];
    try {
      const taggedTaskIds = uniqueInts([
        ...(Array.isArray(ctx?.tagged_task_ids) ? ctx.tagged_task_ids : []),
        ...(Array.isArray(rawArgs.tagged_task_ids) ? rawArgs.tagged_task_ids : []),
      ]);
      const taggedProjectIds = uniqueInts([
        ...(Array.isArray(ctx?.tagged_project_ids) ? ctx.tagged_project_ids : []),
        ...(Array.isArray(rawArgs.tagged_project_ids) ? rawArgs.tagged_project_ids : []),
      ]);
      artifactSpecs = (Array.isArray(rawArgs.artifacts) ? rawArgs.artifacts : []).slice(0, 100).map((raw: any, index: number) => {
        const handle = String(raw?.handle ?? `artifact_${index + 1}`).trim().slice(0, 100);
        const operation = allowedOperations.has(String(raw?.operation ?? "")) ? String(raw.operation) : (cleanUuidOrNull(raw?.artifact_id) ? "update" : "create");
        // Tags win when present. Explicit model task_id/project_id is also accepted when the
        // model resolved a named target (e.g. read_task / read_project) — visibility is checked
        // below. Do not require @-tags for creates; that previously orphaned task-targeted
        // artifacts even after a successful read_task.
        const modelTaskId = Object.prototype.hasOwnProperty.call(raw ?? {}, "task_id")
          ? positiveInt(raw?.task_id)
          : null;
        const modelProjectId = Object.prototype.hasOwnProperty.call(raw ?? {}, "project_id")
          ? positiveInt(raw?.project_id)
          : null;
        let taskId: number | null = null;
        let projectId: number | null = null;
        if (modelTaskId != null && (taggedTaskIds.length === 0 || taggedTaskIds.includes(modelTaskId))) {
          taskId = modelTaskId;
        } else if (taggedTaskIds.length === 1) {
          taskId = taggedTaskIds[0] ?? null;
        }
        if (modelProjectId != null && (taggedProjectIds.length === 0 || taggedProjectIds.includes(modelProjectId))) {
          projectId = modelProjectId;
        } else if (taskId == null && taggedProjectIds.length === 1) {
          projectId = taggedProjectIds[0] ?? null;
        } else if (
          taskId == null
          && modelProjectId != null
          && (operation === "create" || operation === "generate")
        ) {
          // Creates may attach a visible project without a tag (brand creatives).
          projectId = modelProjectId;
        }
        const title = String(raw?.title ?? "").trim().slice(0, 240);
        const artifactType = String(raw?.artifact_type ?? "document").trim().slice(0, 100);
        if (!handle || seenHandles.has(handle)) throw new Error("artifact_handles_must_be_unique");
        seenHandles.add(handle);
        if (!title) throw new Error("artifact_editorial_title_required");
        if (!artifactType) throw new Error("artifact_type_required");
        const projectNameHint = String(
          raw?.project_name
            ?? raw?.metadata?.project_name
            ?? raw?.metadata?.brand_project_name
            ?? "",
        ).trim().slice(0, 120) || null;
        return {
          handle,
          task_id: taskId,
          project_id: projectId,
          project_name_hint: projectNameHint,
          artifact_id: cleanUuidOrNull(raw?.artifact_id),
          operation,
          artifact_type: artifactType,
          artifact_role: String(raw?.artifact_role ?? "").trim().slice(0, 100) || null,
          title,
          channel_id: positiveInt(raw?.channel_id),
          language_id: positiveInt(raw?.language_id),
          source_artifact_id: cleanUuidOrNull(raw?.source_artifact_id),
          source_ids: [...new Set((Array.isArray(raw?.source_ids) ? raw.source_ids : []).map(cleanUuidOrNull).filter(Boolean))],
          source_version_number: positiveInt(raw?.source_version_number),
          source_handle: String(raw?.source_handle ?? "").trim().slice(0, 100) || null,
          derivation_type: String(raw?.derivation_type ?? "").trim().slice(0, 100) || null,
          depends_on_handles: [...new Set((Array.isArray(raw?.depends_on_handles) ? raw.depends_on_handles : [])
            .map((value: any) => String(value ?? "").trim().slice(0, 100))
            .filter(Boolean))],
          instruction: String(raw?.instruction ?? requestText).trim().slice(0, 30000) || requestText,
          priority: Number.isInteger(Number(raw?.priority)) ? Number(raw.priority) : 100,
          metadata: raw?.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
            ? safeClarificationJsonValue(raw.metadata)
            : {},
          selection: (() => {
            const modelSelection = raw?.selection && typeof raw.selection === "object" ? raw.selection : null;
            const contextSelection = ctx?.selected_artifact_context && typeof ctx.selected_artifact_context === "object"
              ? ctx.selected_artifact_context
              : null;
            if (!modelSelection && !contextSelection) return null;
            // Prefer richer chat selection fields when the model only passes text_range.
            const merged: Record<string, unknown> = {
              ...(contextSelection ?? {}),
              ...(modelSelection ?? {}),
            };
            const pickString = (...keys: string[]) => {
              for (const key of keys) {
                const fromModel = modelSelection?.[key];
                const fromContext = contextSelection?.[key];
                if (typeof fromModel === "string" && fromModel.trim()) return fromModel;
                if (typeof fromContext === "string" && fromContext.trim()) return fromContext;
              }
              return null;
            };
            const pickNumber = (...keys: string[]) => {
              for (const key of keys) {
                const fromModel = modelSelection?.[key];
                const fromContext = contextSelection?.[key];
                if (Number.isFinite(Number(fromModel))) return Number(fromModel);
                if (Number.isFinite(Number(fromContext))) return Number(fromContext);
              }
              return null;
            };
            const selectedText = pickString("selected_text", "anchor_quote", "text");
            const selectionBefore = pickString("selection_before", "anchor_context_before");
            const selectionAfter = pickString("selection_after", "anchor_context_after");
            let selectionStart = pickNumber("selection_start", "anchor_start");
            let selectionEnd = pickNumber("selection_end", "anchor_end");
            const textRange = (modelSelection?.text_range && typeof modelSelection.text_range === "object"
              ? modelSelection.text_range
              : null)
              ?? (contextSelection?.text_range && typeof contextSelection.text_range === "object"
                ? contextSelection.text_range
                : null);
            if (textRange) {
              if (selectionStart == null && Number.isFinite(Number((textRange as any).start))) selectionStart = Number((textRange as any).start);
              if (selectionEnd == null && Number.isFinite(Number((textRange as any).end))) selectionEnd = Number((textRange as any).end);
            }
            if (selectedText) merged.selected_text = selectedText;
            if (selectionBefore) merged.selection_before = selectionBefore;
            if (selectionAfter) merged.selection_after = selectionAfter;
            if (selectionStart != null) merged.selection_start = selectionStart;
            if (selectionEnd != null) merged.selection_end = selectionEnd;
            if (selectionStart != null && selectionEnd != null) {
              merged.text_range = { start: selectionStart, end: selectionEnd };
            }
            if (!merged.anchor_type) merged.anchor_type = pickString("anchor_type") ?? "text_range";
            return safeClarificationJsonValue(merged);
          })(),
          media_items: Array.isArray(raw?.media_items) ? safeClarificationJsonValue(raw.media_items.slice(0, 12)) : null,
        };
      });
    } catch (planError: any) {
      return finalize({ name: toolName, ok: false, error: planError?.message ?? "invalid_artifact_plan", data: null });
    }
    if (!requestText || artifactSpecs.length === 0) {
      return finalize({ name: toolName, ok: false, error: "request_text_and_artifact_plan_required", data: null });
    }

    // Soft-attach project ownership for brand creatives when the user named a project
    // and no task/project tag was provided. Prefer explicit project_id / project_name;
    // fall back to confident name matches from the request text.
    const topLevelProjectName = String(rawArgs.project_name ?? "").trim();
    const needsProjectResolve = artifactSpecs.some((spec: any) =>
      (spec.operation === "create" || spec.operation === "generate")
      && !spec.task_id
      && !spec.project_id
    );
    if (needsProjectResolve || artifactSpecs.some((spec: any) => spec.project_name_hint)) {
      const nameCandidates = [
        topLevelProjectName,
        ...artifactSpecs.map((spec: any) => String(spec.project_name_hint ?? "").trim()),
      ].filter(Boolean);
      if (needsProjectResolve) {
        const inferred = inferProjectNameCandidatesFromText([
          requestText,
          ...artifactSpecs.map((spec: any) => String(spec.instruction ?? "")),
          ...artifactSpecs.map((spec: any) => String(spec.title ?? "")),
        ].join("\n"));
        nameCandidates.push(...inferred);
      }
      const resolvedByName = new Map<string, number>();
      for (const candidate of [...new Set(nameCandidates.map((value) => value.trim().toLowerCase()))]) {
        const resolved = await resolveVisibleProjectTarget({
          db,
          projectName: candidate,
        });
        if (resolved.ok) {
          resolvedByName.set(candidate, resolved.project.id);
        }
      }
      artifactSpecs = artifactSpecs.map((spec: any) => {
        if (spec.task_id || spec.project_id) return spec;
        if (spec.operation !== "create" && spec.operation !== "generate") return spec;
        const hint = String(spec.project_name_hint ?? topLevelProjectName ?? "").trim().toLowerCase();
        if (hint && resolvedByName.has(hint)) {
          return { ...spec, project_id: resolvedByName.get(hint) ?? null };
        }
        // If every confident name resolved to the same project, attach it.
        const uniqueProjectIds = [...new Set([...resolvedByName.values()])];
        if (uniqueProjectIds.length === 1) {
          return { ...spec, project_id: uniqueProjectIds[0] ?? null };
        }
        return spec;
      });
    }

    // Drop non-RPC helper fields and validate create project_ids are visible.
    artifactSpecs = artifactSpecs.map((spec: any) => {
      const { project_name_hint: _hint, ...rest } = spec;
      return rest;
    });
    const createProjectIds = uniqueInts(
      artifactSpecs
        .filter((spec: any) => (spec.operation === "create" || spec.operation === "generate") && spec.project_id)
        .map((spec: any) => spec.project_id),
    );
    if (createProjectIds.length > 0) {
      const { data: visibleProjects, error: projectVisibilityError } = await db
        .from("v_projects_minimal")
        .select("id")
        .in("id", createProjectIds);
      if (projectVisibilityError) {
        return finalize({ name: toolName, ok: false, error: projectVisibilityError.message, data: null });
      }
      const visibleProjectIds = new Set((visibleProjects ?? []).map((row: any) => Number(row.id)));
      artifactSpecs = artifactSpecs.map((spec: any) => {
        if (!spec.project_id) return spec;
        if (visibleProjectIds.has(Number(spec.project_id))) return spec;
        // Invisible / ambient-only project ids must not attach ownership.
        return { ...spec, project_id: null };
      });
    }

    // In-place updates must not treat the target as its own source
    // (DB check: task_artifacts_source_not_self / dependency cycle).
    artifactSpecs = artifactSpecs.map((spec: any) => {
      const next = { ...spec };
      if (next.artifact_id && next.source_artifact_id && next.source_artifact_id === next.artifact_id) {
        next.source_artifact_id = null;
        next.source_version_number = null;
      }
      if (next.source_handle && next.source_handle === next.handle) {
        next.source_handle = null;
      }
      if (Array.isArray(next.depends_on_handles)) {
        next.depends_on_handles = next.depends_on_handles.filter((h: string) => h && h !== next.handle);
      }
      return next;
    });

    // Updates: ownership comes from the existing artifact row, not ambient scope.
    // Passing thread/project scope project_id against a task-owned artifact raises
    // artifact_target_not_in_project in ai_create_artifact_build_v2.
    const updateArtifactIds = uniqueStrings(
      artifactSpecs
        .filter((spec: any) => spec.artifact_id && spec.operation !== "create" && spec.operation !== "generate")
        .map((spec: any) => spec.artifact_id),
    );
    if (updateArtifactIds.length > 0) {
      const { data: ownedArtifacts, error: ownedError } = await db
        .from("artifacts")
        .select("id, task_id, project_id, ai_thread_id, title")
        .in("id", updateArtifactIds);
      if (ownedError) {
        return finalize({ name: toolName, ok: false, error: ownedError.message, data: null });
      }
      const byId = new Map(
        (ownedArtifacts ?? []).map((row: any) => [String(row.id), row]),
      );
      artifactSpecs = artifactSpecs.map((spec: any) => {
        if (!spec.artifact_id || spec.operation === "create" || spec.operation === "generate") return spec;
        const row = byId.get(String(spec.artifact_id));
        if (!row) return spec;
        const next = { ...spec };
        if (row.task_id != null && Number(row.task_id) > 0) {
          next.task_id = Number(row.task_id);
          next.project_id = null;
        } else if (row.project_id != null && Number(row.project_id) > 0) {
          next.project_id = Number(row.project_id);
          next.task_id = null;
        } else {
          // Thread-owned (or unbound): do not attach ambient project/task.
          next.task_id = null;
          next.project_id = null;
        }
        if (!next.title && typeof row.title === "string" && row.title.trim()) {
          next.title = row.title.trim().slice(0, 240);
        }
        return next;
      });
    }

    for (const spec of artifactSpecs) {
      for (const dependency of spec.depends_on_handles) {
        if (!seenHandles.has(dependency)) return finalize({ name: toolName, ok: false, error: `artifact_dependency_handle_not_found:${dependency}`, data: null });
      }
      if (spec.source_handle && !seenHandles.has(spec.source_handle)) {
        return finalize({ name: toolName, ok: false, error: `artifact_source_handle_not_found:${spec.source_handle}`, data: null });
      }
    }
    const dependencyMap = new Map<string, string[]>();
    for (const spec of artifactSpecs) {
      dependencyMap.set(spec.handle, [...new Set([
        ...spec.depends_on_handles,
        ...(spec.source_handle ? [spec.source_handle] : []),
      ])]);
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visitDependency = (handle: string): boolean => {
      if (visiting.has(handle)) return false;
      if (visited.has(handle)) return true;
      visiting.add(handle);
      for (const dependency of dependencyMap.get(handle) ?? []) {
        if (!visitDependency(dependency)) return false;
      }
      visiting.delete(handle);
      visited.add(handle);
      return true;
    };
    for (const handle of dependencyMap.keys()) {
      if (!visitDependency(handle)) return finalize({ name: toolName, ok: false, error: "artifact_dependency_cycle", data: null });
    }

    const taskIdsToValidate = uniqueInts(artifactSpecs.map((spec: any) => spec.task_id));
    if (taskIdsToValidate.length > 0) {
      const { data: visibleTasks, error: taskVisibilityError } = await db.from("tasks").select("id").in("id", taskIdsToValidate).eq("is_deleted", false);
      if (taskVisibilityError) return finalize({ name: toolName, ok: false, error: taskVisibilityError.message, data: null });
      const visibleTaskIds = new Set((visibleTasks ?? []).map((row: any) => Number(row.id)));
      const inaccessible = taskIdsToValidate.filter((id) => !visibleTaskIds.has(id));
      if (inaccessible.length > 0) return finalize({ name: toolName, ok: false, error: `task_not_visible:${inaccessible.join(",")}`, data: null });
    }

    const { data, error } = await db.rpc("ai_create_artifact_build_v2", {
      p_run_id: ctx.ai_run_id,
      p_thread_id: thread.id,
      p_request_text: requestText,
      p_plan: {
        version: 1,
        shared_context: String(rawArgs.shared_context ?? "").trim().slice(0, 30000) || null,
        artifacts: artifactSpecs,
      },
      p_idempotency_key: `run:${ctx.ai_run_id}:artifact-build`,
      // Optimistic parallel start. If a worker hits WORKER_RESOURCE_LIMIT (546),
      // the orchestrator degrades concurrency_limit → 1 and requeues the unit
      // so the remaining queue drains sequentially.
      p_concurrency_limit: Math.max(1, Math.min(Number(rawArgs.concurrency_limit ?? 3) || 3, 8)),
    });
    if (error || data?.ok === false) {
      const failMessage = error?.message ?? data?.error ?? "build_creation_failed";
      console.error("ai_start_artifact_build creation failed", {
        code: error?.code ?? null,
        message: failMessage,
        details: error?.details ?? null,
        hint: error?.hint ?? null,
      });
      const hint =
        /artifact_target_not_in_project/i.test(String(failMessage))
          ? " For updates, omit ambient project_id; pass artifact_id only (task/project ownership is resolved server-side)."
          : "";
      return finalize({
        name: toolName,
        ok: false,
        error: `artifact_build_start_failed: ${failMessage}${hint}`,
        data: null,
      });
    }
    const buildId = cleanUuidOrNull(data?.build?.id);
    if (!buildId) return finalize({ name: toolName, ok: false, error: "build_id_missing_after_creation", data: null });

    let dispatchError: string | null = null;
    try {
      await invokeJsonEdgeFunction(
        "ai-build-orchestrator",
        { build_id: buildId, action: "pump" },
        15000,
        ctx?.request_auth_header,
        ctx?.ai_run_id,
      );
    } catch (dispatch: any) {
      dispatchError = dispatch?.message ?? String(dispatch);
      console.error("ai_start_artifact_build initial dispatch failed", { build_id: buildId, error: dispatchError });
    }

    const artifacts = extractDecoratedArtifactsFromBuildStart(data, artifactSpecs);
    const primaryArtifact = artifacts[0] ?? null;
    const artifactLinksMarkdown = artifacts
      .map((row: any) => row?.markdown_link)
      .filter((link: any) => typeof link === "string" && link.trim())
      .join("\n");
    return finalize({
      name: toolName,
      ok: true,
      error: null,
      data: {
        ...data,
        build_id: buildId,
        // Prefer artifact deep-links so the model can cite the deliverable by name.
        // Keep build_app_link for diagnostics; do not paste it into user-facing replies.
        app_link: primaryArtifact?.app_link ?? `app://ai-build/${buildId}`,
        markdown_link: primaryArtifact?.markdown_link ?? null,
        // Ready-to-paste block: one markdown chip per artifact (multi-artifact builds).
        artifact_links_markdown: artifactLinksMarkdown || null,
        build_app_link: `app://ai-build/${buildId}`,
        artifacts,
        dispatch_started: dispatchError == null,
        dispatch_error: dispatchError,
        artifact_count: artifactSpecs.length,
        task_count: uniqueInts(artifactSpecs.map((item: any) => item.task_id)).length,
        workspace_mode: "artifacts",
      },
    });
  }

if (toolName === "ai_get_artifact_build") {
    const buildId = cleanUuidOrNull(rawArgs.build_id);
    if (!buildId) return finalize({ name: toolName, ok: false, error: "build_id_required", data: null });
    const { data, error } = await db.rpc("ai_get_artifact_build_v1", {
      p_build_id: buildId,
      p_after_sequence: Math.max(0, Number(rawArgs.after_sequence ?? 0) || 0),
      p_event_limit: 500,
    });
    return finalize({ name: toolName, ok: !error && data?.ok !== false, error: error?.message ?? data?.error ?? null, data });
  }


if (toolName === "ai_save_build_artifact_internal") {
    const buildId = cleanUuidOrNull(rawArgs.build_id);
    const unitId = cleanUuidOrNull(rawArgs.unit_id);
    const leaseToken = cleanUuidOrNull(rawArgs.lease_token);
    const artifactId = cleanUuidOrNull(rawArgs.artifact_id);
    const expectedVersion = Number(rawArgs.expected_version ?? 0);
    const snapshot = rawArgs.snapshot && typeof rawArgs.snapshot === "object" && !Array.isArray(rawArgs.snapshot) ? rawArgs.snapshot : null;
    if (!buildId || !unitId || !leaseToken || !artifactId || !snapshot) return finalize({ name: toolName, ok: false, error: "build_artifact_save_arguments_required", data: null });
    const { data, error } = await db.rpc("ai_save_build_artifact_v2", {
      p_build_id: buildId,
      p_unit_id: unitId,
      p_lease_token: leaseToken,
      p_artifact_id: artifactId,
      p_expected_version: Number.isInteger(expectedVersion) ? expectedVersion : 0,
      p_snapshot: snapshot,
      p_change_summary: String(rawArgs.change_summary ?? "Generated artifact").slice(0, 1000),
    });
    return finalize({ name: toolName, ok: !error && data?.ok !== false, error: error?.message ?? data?.error ?? data?.message ?? data?.code ?? null, data: decorateArtifactPayload(data) });
  }

if (toolName === "ai_cancel_artifact_build") {
    const buildId = cleanUuidOrNull(rawArgs.build_id);
    if (!buildId) return finalize({ name: toolName, ok: false, error: "build_id_required", data: null });
    const { data, error } = await db.rpc("ai_cancel_artifact_build_v1", {
      p_build_id: buildId,
      p_reason: String(rawArgs.reason ?? "User cancelled the build.").slice(0, 1000),
    });
    return finalize({ name: toolName, ok: !error && data?.ok !== false, error: error?.message ?? data?.error ?? null, data });
  }

  return null;
}




async function executeProjectTool(runtime: any) {
  const { db, ctx, thread, activeChannelId, toolName, rawArgs, finalize, canonicalTaskId, canonicalChannelId, supabaseService, attachments } = runtime;

if (toolName === "ai_create_project") {
    const projectName = String(rawArgs.project_name ?? rawArgs.name ?? "").trim();
    const teamName = String(rawArgs.team_name ?? rawArgs.team ?? "").trim();
    if (!projectName || !teamName) {
      return finalize({
        name: toolName,
        ok: false,
        error: "project_name_and_team_name_required",
        data: null,
      });
    }
    if (!ctx?.ai_run_id) {
      return finalize({ name: toolName, ok: false, error: "run_id_required", data: null });
    }
    const { data, error } = await db.rpc("ai_create_project_v1", {
      p_run_id: ctx.ai_run_id,
      p_project_name: projectName,
      p_team_name: teamName,
      p_project_slug: String(rawArgs.project_slug ?? "").trim() || null,
    });
    if (error) return finalize({ name: toolName, ok: false, error: error.message, data: null });
    return finalize({ name: toolName, ok: true, error: null, data });
  }

if (toolName === "ai_update_project_fields") {
  const candidateProjectIds = [
    Number(rawArgs.project_id ?? 0),
    Number(thread?.project_id ?? 0),
    Number(ctx?.project_id ?? 0),
  ].filter((v: number, idx: number, arr: number[]) =>
    Number.isFinite(v) && v > 0 && arr.indexOf(v) === idx
  );

  const projectId = candidateProjectIds[0] ?? null;
  if (!projectId) {
    return finalize({
      name: toolName,
      ok: false,
      error: "project_id is required when no current project is available.",
    });
  }

  const payload: Record<string, any> = {};
  const editableFields = [
    "description",
    "goal",
    "target_audience",
    "targets",
    "deliverables",
    "editorial_line",
    "creation_mode",
    "plan_mode",
  ];

  for (const field of editableFields) {
    if (Object.prototype.hasOwnProperty.call(rawArgs, field)) {
      payload[field] = rawArgs[field] ?? null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(rawArgs, "topics")) {
    payload.topics = Array.isArray(rawArgs.topics)
      ? rawArgs.topics.map((v: any) => String(v).trim()).filter(Boolean)
      : null;
  }

  if (Object.prototype.hasOwnProperty.call(rawArgs, "sectors")) {
    payload.sectors = Array.isArray(rawArgs.sectors)
      ? rawArgs.sectors.map((v: any) => String(v).trim()).filter(Boolean)
      : null;
  }

  if (Object.keys(payload).length === 0) {
    return finalize({
      name: toolName,
      ok: false,
      error: "At least one editable project field must be provided.",
    });
  }

  const { data, error } = await db
    .from("projects")
    .update(payload)
    .eq("id", projectId)
    .select(`
      id,
      name,
      description,
      goal,
      target_audience,
      targets,
      deliverables,
      editorial_line,
      topics,
      sectors,
      creation_mode,
      plan_mode,
      updated_at
    `)
    .single();

  return finalize({
    name: toolName,
    ok: !error,
    error: error?.message ?? null,
    data: data ? decorateProject(data) : null,
  });
}

if (toolName === "read_project") {
  const projectId = positiveInt(rawArgs.project_id) ?? positiveInt(ctx?.project_id) ?? positiveInt(thread?.project_id);

  const { data, error } = await db
    .from("projects")
    .select(`
      id,name,slug,color,logo,description,status,goal,target_audience,targets,deliverables,
      editorial_line,topics,languages,project_url,sectors,assigned_competitors,
      brand_kit,active,team_id,created_at,updated_at
    `)
    .eq("id", projectId)
    .maybeSingle();

  const projectLanguages = await loadProjectLanguages(db, projectId);

  return finalize({
    name: toolName,
    ok: !error && !!data,
    error: error?.message ?? null,
    data: decorateProject(withBrandKitForAi({
      ...data,
      project_languages: projectLanguages,
    })),
  });
}

if (toolName === "read_projects") {
  const projectIds = uniqueInts(rawArgs.project_ids);

  const { data, error } = await db
    .from("projects")
    .select(`
      id,name,slug,color,logo,description,status,goal,target_audience,targets,deliverables,
      editorial_line,topics,languages,project_url,sectors,assigned_competitors,
      brand_kit,active,team_id,created_at,updated_at
    `)
    .in("id", projectIds);

  const { data: langs } = await db
    .from("project_languages")
    .select(`
      project_id,
      language_id,
      is_primary,
      languages (
        id,
        name:long_name,
        code
      )
    `)
    .in("project_id", projectIds)
    .eq("is_deleted", false);

  const langsByProject = new Map<number, any[]>();

  for (const row of langs ?? []) {
    const list = langsByProject.get(row.project_id) ?? [];
    list.push(row);
    langsByProject.set(row.project_id, list);
  }

  return finalize({
    name: toolName,
    ok: !error,
    error: error?.message ?? null,
    data: (data ?? []).map((project) =>
      decorateProject(withBrandKitForAi({
        ...project,
        project_languages: langsByProject.get(project.id) ?? [],
      })),
    ),
  });
}

if (toolName === "extract_project_brand") {
  const namedLookup = String(
    rawArgs.project_name ?? rawArgs.projectName ?? rawArgs.query ?? rawArgs.name ?? "",
  ).trim();
  const resolved = await resolveVisibleProjectTarget({
    db,
    projectId: rawArgs.project_id ?? rawArgs.projectId,
    projectName: namedLookup || null,
    // Only use thread/scope when the user did not name a project.
    allowScopeFallbackIds: namedLookup
      ? []
      : [
          Number(thread?.project_id ?? 0),
          Number(ctx?.project_id ?? 0),
        ],
  });

  if (!resolved.ok) {
    return finalize({
      name: toolName,
      ok: false,
      error: resolved.error,
      needs_clarification: resolved.needs_clarification === true,
      data: {
        candidates: resolved.candidates ?? [],
      },
    });
  }

  const projectId = resolved.project.id;
  const replaceAll = rawArgs.replace_all === true || rawArgs.replaceAll === true;
  let url: string | null = null;
  try {
    const rawUrl = String(rawArgs.url ?? rawArgs.website_url ?? rawArgs.project_url ?? "").trim();
    if (rawUrl) url = sanitizePublicUrl(rawUrl);
  } catch (error: any) {
    return finalize({
      name: toolName,
      ok: false,
      error: error?.message ?? "Invalid website URL",
      data: null,
    });
  }

  if (url) {
    const { error: urlUpdateError } = await db
      .from("projects")
      .update({ project_url: url })
      .eq("id", projectId);
    if (urlUpdateError) {
      return finalize({
        name: toolName,
        ok: false,
        error: urlUpdateError.message ?? "Failed to update project_url",
        data: null,
      });
    }
  }

  try {
    const result = await invokeJsonEdgeFunction(
      "extract-project-brand",
      {
        project_id: projectId,
        ...(url ? { url } : {}),
        replace_all: replaceAll,
        apply_legacy: true,
      },
      90000,
      ctx?.request_auth_header,
      ctx?.ai_run_id,
    );

    if (!result?.ok) {
      return finalize({
        name: toolName,
        ok: false,
        error: result?.error ?? result?.error_code ?? "Brand extract failed",
        data: {
          project_id: projectId,
          project_name: resolved.project.name,
          resolution: resolved.resolution,
          run_id: result?.run_id ?? null,
          root_url: result?.root_url ?? url,
        },
      });
    }

    return finalize({
      name: toolName,
      ok: true,
      error: null,
      data: decorateProject(withBrandKitForAi({
        id: projectId,
        project_id: projectId,
        name: resolved.project.name,
        resolution: resolved.resolution,
        match_score: resolved.match_score ?? null,
        run_id: result.run_id ?? null,
        root_url: result.root_url ?? url,
        brand_kit: result.brand_kit,
        applied_legacy: result.applied_legacy === true,
        app_link: canonicalProjectLink(projectId),
      })),
    });
  } catch (error: any) {
    return finalize({
      name: toolName,
      ok: false,
      error: error?.message ?? "Brand extract failed",
      data: {
        project_id: projectId,
        project_name: resolved.project.name,
        resolution: resolved.resolution,
        root_url: url,
      },
    });
  }
}

if (toolName === "list_visible_projects") {
    const limit = Math.max(1, Math.min(Number(rawArgs.limit ?? 12) || 12, 50));
    const query = String(rawArgs.query ?? "").trim();
    const excludeIds = uniqueInts(rawArgs.exclude_project_ids);
    let q = db.from("v_projects_minimal").select(`id,name,color,logo`).order("name", { ascending: true }).limit(limit);
    if (query) q = q.ilike("name", `%${query}%`);
    if (excludeIds.length > 0) q = q.not("id", "in", `(${excludeIds.join(",")})`);
    const { data, error } = await q;
    return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data: (data ?? []).map(decorateProject) });
  }

if (toolName === "ai_update_project_configuration") {
    const projectId = positiveInt(rawArgs.project_id);
    const editable = ["name", "description", "goal", "target_audience", "targets", "deliverables", "editorial_line", "topics", "sectors", "creation_mode", "plan_mode", "ai_autorun_days_before"];
    const projectPayload: any = {};
    for (const field of editable) if (hasOwnProp(rawArgs, field)) projectPayload[field] = rawArgs[field];
    if (Object.keys(projectPayload).length) {
      const { error } = await db.from("projects").update(projectPayload).eq("id", projectId);
      if (error) return finalize({ name: toolName, ok: false, error: error.message, data: null });
    }
    if (Array.isArray(rawArgs.language_ids)) {
      const desired = uniqueInts(rawArgs.language_ids);
      const { data: existing } = await db.from("project_languages").select("id,language_id,is_deleted").eq("project_id", projectId);
      for (const row of existing ?? []) {
        const shouldDelete = !desired.includes(Number(row.language_id));
        const { error } = await db.from("project_languages").update({ is_deleted: shouldDelete, is_primary: !shouldDelete && Number(row.language_id) === positiveInt(rawArgs.primary_language_id) }).eq("id", row.id);
        if (error) return finalize({ name: toolName, ok: false, error: error.message, data: null });
      }
      const existingIds = uniqueInts((existing ?? []).map((row: any) => row.language_id));
      const missing = desired.filter((id) => !existingIds.includes(id));
      if (missing.length) {
        const { error } = await db.from("project_languages").insert(missing.map((languageId) => ({ project_id: projectId, language_id: languageId, is_primary: languageId === positiveInt(rawArgs.primary_language_id), is_deleted: false })));
        if (error) return finalize({ name: toolName, ok: false, error: error.message, data: null });
      }
    }
    if (Array.isArray(rawArgs.channels)) {
      const desiredIds = uniqueInts(rawArgs.channels.map((row: any) => row?.channel_id));
      const { data: existing } = await db.from("project_channels").select("channel_id").eq("project_id", projectId);
      for (const row of existing ?? []) if (!desiredIds.includes(Number(row.channel_id))) {
        const { error } = await db.rpc("project_channel_remove", { p_project_id: projectId, p_channel_id: row.channel_id });
        if (error) return finalize({ name: toolName, ok: false, error: error.message, data: null });
      }
      for (const row of rawArgs.channels) {
        const { error } = await db.rpc("project_channel_set", { p_project_id: projectId, p_channel_id: positiveInt(row.channel_id), p_is_enabled: row.is_enabled !== false, p_is_default: row.is_default === true, p_position: positiveInt(row.position) });
        if (error) return finalize({ name: toolName, ok: false, error: error.message, data: null });
      }
    }
    if (Array.isArray(rawArgs.content_types)) {
      const { error: deleteError } = await db.from("project_content_type_settings").delete().eq("project_id", projectId);
      if (deleteError) return finalize({ name: toolName, ok: false, error: deleteError.message, data: null });
      if (rawArgs.content_types.length) {
        const { error } = await db.from("project_content_type_settings").insert(rawArgs.content_types.map((row: any) => ({ project_id: projectId, content_type_id: positiveInt(row.content_type_id), seo_required: row.seo_required ?? null })));
        if (error) return finalize({ name: toolName, ok: false, error: error.message, data: null });
      }
    }
    const keywordResults: any[] = [];
    for (const row of Array.isArray(rawArgs.keywords) ? rawArgs.keywords.slice(0, 100) : []) {
      const { data, error } = await db.rpc("fn_add_project_keyword", { p_project_id: projectId, p_keyword: String(row.keyword ?? "").trim(), p_language_code: row.language_code ?? null, p_region_code: row.region_code ?? null });
      if (error) return finalize({ name: toolName, ok: false, error: error.message, data: null });
      keywordResults.push(data);
    }
    let watcherResult: any = null;
    if (Array.isArray(rawArgs.watcher_user_ids)) {
      const { data, error } = await db.rpc("set_project_watchers", { p_project_id: projectId, p_watcher_user_ids: uniqueInts(rawArgs.watcher_user_ids) });
      if (error) return finalize({ name: toolName, ok: false, error: error.message, data: null });
      watcherResult = data;
    }
    const [project, languages, channels, contentTypes] = await Promise.all([
      db.from("projects").select("*").eq("id", projectId).single(),
      db.from("project_languages").select("*").eq("project_id", projectId).eq("is_deleted", false),
      db.from("project_channels").select("*").eq("project_id", projectId).order("position"),
      db.from("project_content_type_settings").select("*").eq("project_id", projectId),
    ]);
    return finalize({ name: toolName, ok: !project.error, error: project.error?.message ?? null, data: { project: project.data, languages: languages.data ?? [], channels: channels.data ?? [], content_types: contentTypes.data ?? [], keywords: keywordResults, watchers: watcherResult } });
  }

if (toolName === "ai_manage_project_templates") {
    const projectId = positiveInt(rawArgs.project_id);
    if (!projectId) return finalize({ name: toolName, ok: false, error: "project_id_required", data: null });
    const action = String(rawArgs.action ?? "create");
    if (action === "delete") {
      const templateId = positiveInt(rawArgs.template_id);
      if (!templateId) return finalize({ name: toolName, ok: false, error: "template_id_required", data: null });
      const { error } = await db.rpc("pbc_delete_project_component", { p_project_id: projectId, p_project_component_id: templateId });
      return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data: { project_id: projectId, deleted_id: templateId } });
    }
    if (action === "update") {
      const templateId = positiveInt(rawArgs.template_id);
      if (!templateId) return finalize({ name: toolName, ok: false, error: "template_id_required", data: null });
      const payload: any = {};
      if (hasOwnProp(rawArgs, "title")) payload.title = normalizeOptionalTextInput(rawArgs.title);
      if (hasOwnProp(rawArgs, "description")) payload.description = normalizeOptionalTextInput(rawArgs.description);
      if (hasOwnProp(rawArgs, "rules")) payload.rules = rawArgs.rules ?? null;
      const { data, error } = await db.from("project_briefing_components").update(payload).eq("project_id", projectId).eq("id", templateId).select("*").single();
      return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data });
    }
    const title = String(rawArgs.title ?? "").trim();
    if (!title) return finalize({ name: toolName, ok: false, error: "title_required", data: null });
    const { data: templateId, error } = await db.rpc("create_project_component", {
      p_project_id: projectId,
      p_title: title,
      p_description: normalizeOptionalTextInput(rawArgs.description),
      p_rules: rawArgs.rules ?? null,
    });
    return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data: error ? null : { project_id: projectId, template_id: templateId, title } });
  }

  return null;
}


async function executeTaskTool(runtime: any) {
  const { db, ctx, thread, activeChannelId, toolName, rawArgs, finalize, canonicalTaskId, canonicalChannelId, supabaseService, attachments } = runtime;

if (toolName === "read_task") {
    const taskId = positiveInt(rawArgs.task_id) ?? canonicalTaskId;
    const { data, error } = await db.from("tasks").select(`
      id,title,briefing,notes,keyword,secondary_keywords,tags,meta_title,meta_description,h1,h2,alt_text,
      related_products,linkbuilding,internal_links,project_id_int,project_name,project_color,
      project_status_name,content_type_title,production_type_title,language_code,
      assigned_to_id,assigned_to_name,delivery_date,publication_date,updated_at
    `).eq("id", taskId).maybeSingle();
    return finalize({ name: toolName, ok: !error && !!data, error: error?.message ?? null, data: decorateTask(data) });
  }

if (toolName === "read_tasks") {
    const finalTaskIds = uniqueInts(rawArgs.task_ids);
    const { data, error } = await db.from("tasks").select(`
      id,title,briefing,notes,keyword,secondary_keywords,tags,project_id_int,project_name,project_status_name,
      content_type_title,production_type_title,language_code,assigned_to_id,assigned_to_name,
      delivery_date,publication_date,updated_at
    `).in("id", finalTaskIds);
    return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data: (data ?? []).map(decorateTask) });
  }

if (toolName === "list_project_tasks") {
    const projectId = positiveInt(rawArgs.project_id);
    if (!projectId || !ctx?.ai_run_id) {
      return finalize({ name: toolName, ok: false, error: "run_id_and_project_id_required", data: null });
    }
    const suppliedStatusNames = Array.isArray(rawArgs.status_names)
      ? rawArgs.status_names
      : Array.isArray(rawArgs.status_filter)
      ? rawArgs.status_filter
      : [];
    const nullStatusSentinels = new Set(["__null__", "null", "no status"]);
    const normalizedStatusNames = suppliedStatusNames
      .map((value: any) => String(value ?? "").trim())
      .filter(Boolean);
    const includeNullStatus = rawArgs.include_null_status === true ||
      normalizedStatusNames.some((value: string) => nullStatusSentinels.has(value.toLocaleLowerCase()));
    const statusNames = [...new Set(normalizedStatusNames
      .filter((value: string) => !nullStatusSentinels.has(value.toLocaleLowerCase())))]
      .slice(0, 50);
    const limit = Math.max(1, Math.min(Number(rawArgs.limit ?? 100) || 100, 200));
    const offset = Math.max(0, Number(rawArgs.offset ?? 0) || 0);
    const { data, error } = await db.rpc("ai_list_project_tasks_v2", {
      p_run_id: ctx.ai_run_id,
      p_project_id: projectId,
      p_status_names: statusNames.length > 0 ? statusNames : null,
      p_include_null_status: includeNullStatus,
      p_limit: limit,
      p_offset: offset,
    });
    const rows = (Array.isArray(data?.rows) ? data.rows : []).map(decorateTask);
    if (!error && data?.ok !== false) {
      const previousDiscovery = ctx.ai_project_task_discoveries?.[String(projectId)] ?? null;
      const sameFilter = previousDiscovery &&
        JSON.stringify(previousDiscovery.status_names ?? []) === JSON.stringify(statusNames) &&
        previousDiscovery.include_null_status === includeNullStatus;
      ctx.ai_project_task_discoveries = {
        ...(ctx.ai_project_task_discoveries ?? {}),
        [String(projectId)]: {
          project_id: projectId,
          task_ids: uniqueInts([
            ...(sameFilter ? previousDiscovery.task_ids ?? [] : []),
            ...rows.map((row: any) => row?.id ?? row?.task_id),
          ]),
          status_names: statusNames,
          include_null_status: includeNullStatus,
          offset,
          returned_count: rows.length,
          has_more: data?.has_more === true,
        },
      };
    }
    return finalize({
      name: toolName,
      ok: !error && data?.ok !== false,
      error: error?.message ?? data?.error ?? null,
      data: {
        ...(data ?? {}),
        rows,
      },
    });
  }

if (toolName === "search_tasks") {
    const { data, error } = await db.rpc(
      "ai_search_visible_tasks",
      {
        p_q: rawArgs.query,
        p_limit: rawArgs.limit ?? 8
      }
    );

    return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data: (data?.rows ?? []).map(decorateTask) });
  }

if (toolName === "ai_update_task_fields") {
    const safeArgs = { ...(rawArgs ?? {}), ...(canonicalTaskId ? { task_id: canonicalTaskId } : {}) };
    const requestedTaskId = Number(safeArgs.task_id ?? safeArgs.id ?? 0) || null;
    const lookupTitle = String(safeArgs.title ?? "").trim();
    const lookupProjectId = Number(safeArgs.project_id ?? ctx.project_id ?? thread.project_id ?? 0) || null;

    let task: any = null;
    if (requestedTaskId) {
      const { data, error } = await db.from("tasks").select(TASK_SELECT_FOR_WRITE).eq("id", requestedTaskId).eq("is_deleted", false).maybeSingle();
      if (error) return finalize({ name: toolName, ok: false, error: error.message, data: null });
      task = data;
    } else if (lookupTitle && lookupProjectId) {
      const taskCatalog = await loadVisibleTaskCatalog(db, lookupProjectId);
      const taskResolution = await resolveCatalogReferences({
        entityType: "task",
        references: [lookupTitle],
        candidates: taskCatalog,
        quota: ctx?.ai_token_quota,
      });
      if (taskResolution.matches.length !== 1) {
        return finalize({
          name: toolName,
          ok: false,
          error: `Could not resolve task “${lookupTitle}” unambiguously in project ${lookupProjectId}.`,
          data: taskCatalog.slice(0, 50),
        });
      }
      const resolvedTaskId = positiveInt(taskResolution.matches[0].candidate_id);
      const { data, error } = await db.from("tasks").select(TASK_SELECT_FOR_WRITE).eq("id", resolvedTaskId).eq("is_deleted", false).maybeSingle();
      if (error) return finalize({ name: toolName, ok: false, error: error.message, data: null });
      task = data;
    } else {
      return finalize({ name: toolName, ok: false, error: "Provide task_id, or a task reference plus project_id, to update a task.", data: null });
    }

    if (!task?.id) {
      return finalize({ name: toolName, ok: false, error: "Existing task not found; create a new task only if the user explicitly asked to create one.", data: null });
    }

    const assigneeReference = String(firstPresentArg(safeArgs, ["assigned_to", "assignee", "owner", "assigned_to_name"]) ?? "").trim();
    if (!positiveInt(safeArgs.assigned_to_id) && assigneeReference) {
      const userCatalog = await loadVisibleUserCatalog(db);
      const assigneeResolution = await resolveCatalogReferences({
        entityType: "user",
        references: [assigneeReference],
        candidates: userCatalog,
        quota: ctx?.ai_token_quota,
      });
      if (assigneeResolution.matches.length === 1) {
        safeArgs.assigned_to_id = positiveInt(assigneeResolution.matches[0].candidate_id);
      } else {
        return finalize({
          name: toolName,
          ok: false,
          error: `Could not resolve assignee “${assigneeReference}” unambiguously.`,
          data: { candidates: userCatalog.slice(0, 50).map((candidate: any) => ({ id: Number(candidate.id), label: candidate.label })) },
          sanitized_args: safeArgs,
        });
      }
    }
    const fieldBuild = await buildTaskFieldUpdatePayload(db, safeArgs, ctx?.ai_token_quota);
    if (fieldBuild.errors.length) {
      return finalize({ name: toolName, ok: false, error: fieldBuild.errors.join(" "), data: decorateTask(task), sanitized_args: safeArgs });
    }
    const updatePayload: any = fieldBuild.payload;

    if (!Object.keys(updatePayload).length) {
      return finalize({ name: toolName, ok: false, error: "No supported task fields were provided to update.", data: decorateTask(task) });
    }

    const isStatementTimeout = (message: unknown) =>
      /statement timeout|canceling statement/i.test(String(message ?? ""));

    let data: any = null;
    let error: any = null;
    // Contended task rows (AI build + SEO field writes) can hit statement_timeout;
    // retry a couple of times before surfacing the failure to the model.
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await db
        .from("tasks")
        .update(updatePayload)
        .eq("id", Number(task.id))
        .select(TASK_SELECT_FOR_WRITE)
        .single();
      data = result.data;
      error = result.error;
      if (!error && data) break;
      if (!isStatementTimeout(error?.message) || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }

    return finalize({
      name: toolName,
      ok: !error && !!data,
      error: error?.message ?? null,
      data: data ? {
        ...decorateTask(data),
        action: "updated_existing_task",
        keyword_scope: hasOwnProp(safeArgs, "keyword") || hasOwnProp(safeArgs, "secondary_keywords") ? "task" : null,
      } : null,
    });
  }

if (toolName === "ai_bulk_update_project_tasks_fields") {
    const projectId = Number(rawArgs.project_id ?? ctx.project_id ?? thread.project_id ?? 0) || null;
    if (!projectId) {
      return finalize({ name: toolName, ok: false, error: "project_id is required for bulk task field updates.", data: null });
    }

    const fieldBuild = await buildTaskFieldUpdatePayload(db, rawArgs, ctx?.ai_token_quota);
    if (fieldBuild.errors.length) {
      return finalize({ name: toolName, ok: false, error: fieldBuild.errors.join(" "), data: null });
    }
    const requestedPayload = fieldBuild.payload;
    if (!Object.keys(requestedPayload).length) {
      return finalize({ name: toolName, ok: false, error: "No supported task fields were provided to update.", data: null });
    }

    const explicitTaskIds = uniqueInts(rawArgs.task_ids);
    const taskFilter = normalizeTaskMutationFilter(rawArgs.task_filter);
    if (rawArgs.task_filter != null && !taskFilter) {
      return finalize({ name: toolName, ok: false, error: "The structured task_filter is invalid or empty.", data: null });
    }

    const allRows: any[] = [];
    const pageSize = 500;
    for (let offset = 0; offset < 5000; offset += pageSize) {
      let query = db
        .from("tasks")
        .select(TASK_SELECT_FOR_WRITE)
        .eq("project_id_int", projectId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (explicitTaskIds.length > 0) query = query.in("id", explicitTaskIds);
      const { data: pageRows, error: rowsError } = await query;
      if (rowsError) {
        return finalize({ name: toolName, ok: false, error: rowsError.message, data: null });
      }
      const page = Array.isArray(pageRows) ? pageRows : [];
      allRows.push(...page);
      if (page.length < pageSize || explicitTaskIds.length > 0) break;
    }

    const rows = allRows.filter((row: any) => taskMatchesStructuredFilter(row, taskFilter));
    const onlyIfEmpty = rawArgs.only_if_empty !== false;
    const updated: any[] = [];
    const skipped: any[] = [];

    for (const row of rows) {
      const rowPayload: any = {};
      for (const [field, value] of Object.entries(requestedPayload)) {
        if (!onlyIfEmpty || isTaskFieldUnset(row, field)) rowPayload[field] = value;
      }

      if (!Object.keys(rowPayload).length) {
        skipped.push({ id: row.id, title: row.title, reason: "requested fields already set" });
        continue;
      }

      const { data: updatedRow, error: updateError } = await db
        .from("tasks")
        .update(rowPayload)
        .eq("id", Number(row.id))
        .select(TASK_SELECT_FOR_WRITE)
        .single();

      if (updateError) {
        skipped.push({ id: row.id, title: row.title, reason: updateError.message });
      } else if (updatedRow) {
        updated.push(decorateTask(updatedRow));
      }
    }

    return finalize({
      name: toolName,
      ok: true,
      error: null,
      data: {
        action: "bulk_updated_existing_project_tasks",
        project_id: projectId,
        only_if_empty: onlyIfEmpty,
        task_filter: taskFilter,
        selected_task_ids: explicitTaskIds,
        scanned_count: allRows.length,
        matched_count: rows.length,
        excluded_count: allRows.length - rows.length,
        requested_fields: Object.keys(requestedPayload),
        resolved: fieldBuild.resolved,
        updated_count: updated.length,
        skipped_count: skipped.length,
        updated,
        skipped,
      },
    });
  }

if (toolName === "ai_create_task") {
    const title = String(rawArgs.title ?? "").trim();
    if (!title) return finalize({ name: toolName, ok: false, error: "Task title is required.", data: null });

    const projectId = positiveInt(rawArgs.project_id) ?? positiveInt(ctx?.project_id) ?? positiveInt(thread?.project_id);
    const fieldBuild = await buildTaskFieldUpdatePayload(db, rawArgs, ctx?.ai_token_quota);
    if (fieldBuild.errors.length) return finalize({ name: toolName, ok: false, error: fieldBuild.errors.join(" "), data: null });
    const payload = fieldBuild.payload;

    const isStatementTimeout = (message: unknown) =>
      /statement timeout|canceling statement/i.test(String(message ?? ""));

    if (projectId) {
      const { data: existingRows, error: existingError } = await db
        .from("tasks")
        .select("id,title")
        .eq("project_id_int", projectId)
        .eq("title", title)
        .eq("is_deleted", false)
        .limit(5);
      if (existingError) return finalize({ name: toolName, ok: false, error: existingError.message, data: null });
      const rows = existingRows ?? [];
      if (rows.length > 0) {
        return finalize({
          name: toolName,
          ok: false,
          error: "existing_task_confirmation_required",
          data: {
            candidates: rows.map((row: any) => ({ id: row.id, title: row.title })),
            instruction: "The task already exists. Ask whether to update it or create a distinct task.",
          },
        });
      }
    }

    let created: any = null;
    let error: any = null;
    // Contended create paths (watchers/notifications/triggers) can hit statement_timeout.
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await db.rpc("create_task_minimal", {
        p_project_id: projectId,
        p_title: title,
        p_briefing: payload.briefing ?? null,
        p_project_status_id: payload.project_status_id ?? null,
        p_assigned_to_id: payload.assigned_to_id ?? null,
        p_content_type_id: payload.content_type_id ?? null,
        p_production_type_id: payload.production_type_id ?? null,
        p_language_id: payload.language_id ?? null,
        p_delivery_date: payload.delivery_date ?? null,
        p_publication_date: payload.publication_date ?? null,
        p_channel_ids: uniqueInts(rawArgs.channel_ids),
        p_watcher_user_ids: uniqueInts(rawArgs.watcher_user_ids),
      });
      created = result.data;
      error = result.error;
      if (!error && created?.task_id) break;
      if (!isStatementTimeout(error?.message) || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
    if (error || !created?.task_id) {
      return finalize({
        name: toolName,
        ok: false,
        error: error?.message ?? "task_creation_failed",
        data: null,
      });
    }

    const postCreateUpdate: Record<string, any> = {};
    for (const field of ["notes", "keyword", "meta_title", "meta_description", "h1", "h2", "alt_text", "filename", "internal_links", "tags", "category", "secondary_keywords", "source_urls"]) {
      if (Object.prototype.hasOwnProperty.call(payload, field)) postCreateUpdate[field] = payload[field];
    }
    if (Object.keys(postCreateUpdate).length > 0) {
      let updateError: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await db.from("tasks").update(postCreateUpdate).eq("id", created.task_id);
        updateError = result.error;
        if (!updateError) break;
        if (!isStatementTimeout(updateError?.message) || attempt === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
      if (updateError) {
        return finalize({
          name: toolName,
          ok: false,
          error: updateError.message,
          data: { ...created, task_created: true },
        });
      }
    }

    return finalize({ name: toolName, ok: true, error: null, data: { ...created, action: "created_task" } });
  }

if (toolName === "ai_duplicate_task") {
    const { data, error } = await db.rpc("ai_duplicate_task_v1", {
      p_run_id: ctx?.ai_run_id, p_source_task_id: positiveInt(rawArgs.source_task_id),
      p_target_project_id: positiveInt(rawArgs.target_project_id), p_title: String(rawArgs.title ?? "").trim(),
      p_include_outputs: false, p_include_watchers: rawArgs.include_watchers !== false,
    });
    return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data });
  }

if (toolName === "ai_bulk_create_tasks") {
    const items = Array.isArray(rawArgs.tasks) ? rawArgs.tasks.slice(0, 100) : [];
    const created: any[] = [];
    const failed: any[] = [];
    for (const item of items) {
      const { data, error } = await db.rpc("create_task_minimal", {
        p_project_id: positiveInt(item.project_id), p_title: String(item.title ?? "").trim(),
        p_briefing: normalizeOptionalTextInput(item.briefing), p_project_status_id: positiveInt(item.project_status_id),
        p_assigned_to_id: positiveInt(item.assigned_to_id), p_content_type_id: positiveInt(item.content_type_id),
        p_production_type_id: positiveInt(item.production_type_id), p_language_id: positiveInt(item.language_id),
        p_delivery_date: normalizeOptionalDateInput(item.delivery_date), p_publication_date: normalizeOptionalDateInput(item.publication_date),
        p_channel_ids: uniqueInts(item.channel_ids), p_watcher_user_ids: uniqueInts(item.watcher_user_ids),
      });
      if (error) failed.push({ project_id: item.project_id, title: item.title, error: error.message });
      else created.push(data);
    }
    return finalize({ name: toolName, ok: failed.length === 0, error: failed.length ? "Some tasks could not be created." : null, data: { created_count: created.length, failed_count: failed.length, created, failed } });
  }

  return null;
}


async function executeChannelTool(runtime: any) {
  const { db, ctx, thread, activeChannelId, toolName, rawArgs, finalize, canonicalTaskId, canonicalChannelId, supabaseService, attachments } = runtime;

if (toolName === "list_task_channels") {
    const taskId = positiveInt(rawArgs.task_id) ?? positiveInt(thread?.task_id);
    if (!taskId) return finalize({ name: toolName, ok: false, error: "task_id_required", data: null });
    const { data, error } = await db.from("task_channels").select("task_id,channel_id,channels(id,name)").eq("task_id", taskId).order("channel_id");
    return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data: data ?? [] });
  }

if (toolName === "ai_manage_task_channels") {
    const taskId = positiveInt(rawArgs.task_id);
    const requestedIds = uniqueInts(rawArgs.channel_ids);
    const action = String(rawArgs.action ?? "attach");
    const { data: existingRows, error: existingError } = await db.from("task_channels").select("channel_id").eq("task_id", taskId);
    if (existingError) return finalize({ name: toolName, ok: false, error: existingError.message, data: null });
    const existingIds = uniqueInts((existingRows ?? []).map((row: any) => row.channel_id));
    const addIds = action === "remove" ? [] : requestedIds.filter((id) => !existingIds.includes(id));
    const removeIds = action === "attach" ? [] : action === "remove" ? requestedIds : existingIds.filter((id) => !requestedIds.includes(id));
    if (addIds.length) {
      const { error } = await db.from("task_channels").insert(addIds.map((channelId) => ({ task_id: taskId, channel_id: channelId })));
      if (error && error.code !== "23505") return finalize({ name: toolName, ok: false, error: error.message, data: null });
    }
    if (removeIds.length) {
      const { error } = await db.from("task_channels").delete().eq("task_id", taskId).in("channel_id", removeIds);
      if (error) return finalize({ name: toolName, ok: false, error: error.message, data: null });
    }
    const { data } = await db.from("task_channels").select("task_id,channel_id").eq("task_id", taskId).order("channel_id");
    return finalize({ name: toolName, ok: true, error: null, data: { task_id: taskId, channels: data ?? [], attached: addIds, detached: removeIds, outputs_preserved: true } });
  }

  return null;
}


async function executeAttachmentTool(runtime: any) {
  const { db, ctx, thread, activeChannelId, toolName, rawArgs, finalize, canonicalTaskId, canonicalChannelId, supabaseService, attachments } = runtime;

if (toolName === "read_attachments") {
    const entityType = String(rawArgs.entity_type ?? "");
    const entityId = positiveInt(rawArgs.entity_id);
    const tableNames = entityType === "project" ? ["project", "projects"] : ["task", "tasks"];
    const { data, error } = await db.from("attachments").select("id,table_name,record_id,file_name,file_path,mime_type,size,metadata,uploaded_at").in("table_name", tableNames).eq("record_id", String(entityId)).order("sort_order");
    if (error) return finalize({ name: toolName, ok: false, error: error.message, data: null });
    const enriched = (data ?? []).map((row: any) => ({ ...row, bucket: entityType === "project" ? "project-files" : "attachments" }));
    return finalize({ name: toolName, ok: true, error: null, data: { entity_type: entityType, entity_id: entityId, attachments: enriched, note: "Attachment bytes are not parsed in AI Chat. Create a source from the attachment when its contents are needed." } });
  }

  return null;
}



async function executePeopleTool(runtime: any) {
  const { db, ctx, thread, activeChannelId, toolName, rawArgs, finalize, canonicalTaskId, canonicalChannelId, supabaseService, attachments } = runtime;

if (toolName === "read_user") {
    const userId = Number(rawArgs.user_id);
    const { data, error } = await db.from("users").select(`
      id,email,full_name,brand,phone,start_date,end_date,active,photo
    `).eq("id", userId).maybeSingle();
    return finalize({ name: toolName, ok: !error && !!data, error: error?.message ?? null, data: decorateUser(data) });
  }

if (toolName === "read_users") {
    const userIds = uniqueInts(rawArgs.user_ids);
    const { data, error } = await db.from("users").select(`
      id,email,full_name,brand,phone,start_date,end_date,active,photo
    `).in("id", userIds);
    return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data: (data ?? []).map(decorateUser) });
  }

if (toolName === "list_visible_users") {
    const limit = Math.max(1, Math.min(Number(rawArgs.limit ?? 12) || 12, 50));
    const query = String(rawArgs.query ?? "").trim();
    let q = db.from("v_users_minimal_i_can_see").select(`id,full_name,email,photo`).order("full_name", { ascending: true }).limit(limit);
    if (query) q = q.or(`full_name.ilike.%${query}%,email.ilike.%${query}%`);
    const { data, error } = await q;
    return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data: (data ?? []).map(decorateUser) });
  }

if (toolName === "list_user_projects") {
    const userId = Number(rawArgs.user_id);
    const limit = Math.max(1, Math.min(Number(rawArgs.limit ?? 20) || 20, 100));
    const { data, error } = await db.from("v_user_projects_i_can_see").select(`user_id,project_id,project_name,project_color,project_status,start_date,due_date`).eq("user_id", userId).limit(limit);
    const decorated = (data ?? []).map((row:any) => ({ ...row, id: row.project_id, name: row.project_name, app_link: canonicalProjectLink(Number(row.project_id)), markdown_link: row.project_name ? `[${row.project_name}](${canonicalProjectLink(Number(row.project_id))})` : null, entity_type: "project" }));
    return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data: decorated });
  }

if (toolName === "list_user_tasks") {
    const userId = Number(rawArgs.user_id);
    const limit = Math.max(1, Math.min(Number(rawArgs.limit ?? 20) || 20, 100));
    const { data, error } = await db.from("v_user_tasks_i_can_see").select(`id,title,project_id,project_name,project_color,delivery_date,publication_date,project_status_id,project_status_name,is_overdue,is_publication_overdue,assigned_to_id,assigned_to_name,updated_at`).eq("assigned_to_id", userId).order("updated_at", { ascending: false }).limit(limit);
    const decorated = (data ?? []).map((row:any) => ({ ...row, app_link: canonicalTaskLink(Number(row.id)), markdown_link: row.title ? `[${row.title}](${canonicalTaskLink(Number(row.id))})` : null, entity_type: "task" }));
    return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data: decorated });
  }

if (toolName === "search_mentions") {
  const query = String(rawArgs.query ?? "").trim();
  const limit = Number(rawArgs.limit ?? 10) || 10;

  let data: any[] | null = null;
  let error: any = null;

  if (query) {
    const ftsRes = await db
      .from("mentions")
      .select("id, comment, created_at, thread_id, created_by")
      .textSearch("search_vector", query, { type: "websearch", config: "simple" })
      .order("created_at", { ascending: false })
      .limit(limit);

    data = ftsRes.data ?? null;
    error = ftsRes.error ?? null;
  }

  if ((!data || data.length === 0) && query) {
    const fallbackRes = await db
      .from("mentions")
      .select("id, comment, created_at, thread_id, created_by")
      .ilike("comment", `%${query}%`)
      .order("created_at", { ascending: false })
      .limit(limit);

    data = fallbackRes.data ?? data;
    error = fallbackRes.error ?? error;
  }

  return finalize({
    name: toolName,
    ok: !error,
    error: error?.message ?? null,
    data: data ?? [],
  });
}

if (toolName === "read_user_occupation_summary") {
    const { data, error } = await db.rpc("fn_get_user_occupation_summary", { p_user_id: Number(rawArgs.user_id) });
    return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data: Array.isArray(data) ? data[0] ?? null : data ?? null });
  }

if (toolName === "read_user_occupation") {
    const limit = Math.max(1, Math.min(Number(rawArgs.limit ?? 30) || 30, 120));
    const { data, error } = await db.rpc("fn_get_user_occupation", { p_user_id: Number(rawArgs.user_id) });
    const rows = Array.isArray(data) ? data.slice(-limit).reverse() : [];
    return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data: rows });
  }

if (toolName === "read_user_backlog") {
    const { data, error } = await db.rpc("fn_get_user_backlog", { p_user_id: Number(rawArgs.user_id) });
    return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data: Array.isArray(data) ? data[0] ?? null : data ?? null });
  }

if (toolName === "list_visible_users_occupation_today") {
    const limit = Math.max(1, Math.min(Number(rawArgs.limit ?? 20) || 20, 100));
    const query = String(rawArgs.query ?? "").trim();
    let usersQ = db.from("v_users_minimal_i_can_see").select("id,full_name,email,photo").order("full_name", { ascending: true }).limit(limit);
    if (query) usersQ = usersQ.or(`full_name.ilike.%${query}%,email.ilike.%${query}%`);
    const { data: users, error: usersErr } = await usersQ;
    if (usersErr) return finalize({ name: toolName, ok: false, error: usersErr.message, data: [] });
    const userIds = (users ?? []).map((u: any) => Number(u.id)).filter((v: number) => Number.isInteger(v) && v > 0);
    let occRows: any[] = [];
    if (userIds.length > 0) {
      const { data: occ, error: occErr } = await db
        .from("daily_user_occupation")
        .select("user_id,date,total_hours,occupation,is_ooh,ooh_type")
        .eq("date", currentDateIso())
        .in("user_id", userIds);
      if (occErr) return finalize({ name: toolName, ok: false, error: occErr.message, data: [] });
      occRows = occ ?? [];
    }
    const occByUser = new Map(occRows.map((r: any) => [Number(r.user_id), r]));
    const data = (users ?? []).map((u: any) => {
      const o = occByUser.get(Number(u.id));
      return {
        ...decorateUser(u),
        today_occupation: o?.occupation ?? 0,
        today_total_hours: o?.total_hours ?? 0,
        is_ooh: o?.is_ooh ?? false,
        ooh_type: o?.ooh_type ?? null,
        date: o?.date ?? currentDateIso(),
      };
    }).sort((a: any, b: any) => Number(a.is_ooh) - Number(b.is_ooh) || (a.today_occupation ?? 0) - (b.today_occupation ?? 0));
    return finalize({ name: toolName, ok: true, error: null, data });
  }

if (toolName === "ai_manage_watchers") {
    const entityType = String(rawArgs.entity_type ?? "");
    const action = String(rawArgs.action ?? "read");
    if (entityType === "project") {
      const projectId = positiveInt(rawArgs.project_id);
      const rpc = action === "set" ? "set_project_watchers" : action === "candidates" ? "project_watcher_candidates" : "project_watchers_current";
      const params = action === "set"
        ? { p_project_id: projectId, p_watcher_user_ids: uniqueInts(rawArgs.watcher_user_ids) }
        : { p_project_id: projectId };
      const { data, error } = await db.rpc(rpc, params);
      return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data });
    }
    const taskId = positiveInt(rawArgs.task_id);
    if (!taskId) return finalize({ name: toolName, ok: false, error: "task_id_required", data: null });
    if (action === "candidates") {
      const { data, error } = await db.rpc("list_eligible_task_watchers", { p_task_id: taskId });
      return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data });
    }
    if (action === "read") {
      const { data, error } = await db.rpc("list_task_watchers", { p_task_id: taskId });
      return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data });
    }
    const desired = uniqueInts(rawArgs.watcher_user_ids);
    const { data: current, error: currentError } = await db.rpc("list_task_watchers", { p_task_id: taskId });
    if (currentError) return finalize({ name: toolName, ok: false, error: currentError.message, data: null });
    const currentIds = uniqueInts((current ?? []).map((row: any) => row.user_id));
    const addIds = desired.filter((id) => !currentIds.includes(id));
    const removeIds = currentIds.filter((id) => !desired.includes(id));
    if (addIds.length) {
      const { error } = await db.rpc("add_task_watchers", { p_task_id: taskId, p_user_ids: addIds });
      if (error) return finalize({ name: toolName, ok: false, error: error.message, data: null });
    }
    for (const userId of removeIds) {
      const { error } = await db.rpc("remove_task_watcher", { p_task_id: taskId, p_user_id: userId });
      if (error) return finalize({ name: toolName, ok: false, error: error.message, data: null });
    }
    const { data, error } = await db.rpc("list_task_watchers", { p_task_id: taskId });
    return finalize({ name: toolName, ok: !error, error: error?.message ?? null, data: { task_id: taskId, watchers: data ?? [], added: addIds, removed: removeIds } });
  }

  return null;
}


async function executeResearchTool(runtime: any) {
  const { db, ctx, thread, activeChannelId, toolName, rawArgs, finalize, canonicalTaskId, canonicalChannelId, supabaseService, attachments } = runtime;

if (toolName === "read_public_webpage") {
    try {
      const data = await fetchPublicWebpage(String(rawArgs.url ?? ""));
      if (data?.ok !== true) ctx.ai_required_source_failed = true;
      return finalize({
        name: toolName,
        ok: data?.ok === true,
        error: data?.ok === true ? null : `external_source_http_${data?.status ?? "unknown"}`,
        data,
      });
    } catch (error: any) {
      ctx.ai_required_source_failed = true;
      return finalize({ name: toolName, ok: false, error: error?.message ?? String(error), data: null });
    }
  }

if (toolName === "search_project_site_pages") {
    const projectId =
      positiveInt(rawArgs.project_id)
      ?? positiveInt(ctx?.project_id)
      ?? positiveInt(thread?.project_id);
    if (!projectId) {
      return finalize({ name: toolName, ok: false, error: "project_id_required", data: null });
    }
    const pathContains = String(rawArgs.path_contains ?? rawArgs.pathContains ?? "").trim().toLowerCase();
    const limit = Math.max(1, Math.min(Number(rawArgs.limit ?? 20) || 20, 50));
    const { data, error } = await db.rpc("ai_search_project_site_pages_v1", {
      p_project_id: projectId,
      p_query: String(rawArgs.query ?? "").trim() || null,
      p_language_code: String(rawArgs.language_code ?? rawArgs.languageCode ?? "").trim() || null,
      p_limit: pathContains ? Math.min(50, limit * 3) : limit,
    });
    if (error) {
      return finalize({ name: toolName, ok: false, error: error.message, data: null });
    }
    const rows = Array.isArray(data) ? data : [];
    const filtered = pathContains
      ? rows.filter((row: any) => {
          const url = String(row?.canonical_url ?? row?.url ?? "").toLowerCase();
          return url.includes(pathContains);
        }).slice(0, limit)
      : rows.slice(0, limit);
    // Prefer blog/article pages when the query mentions blog/linkbuilding and no path filter was given.
    const queryText = String(rawArgs.query ?? "").toLowerCase();
    const prefersBlog = !pathContains && /(blog|article|linkbuild|internal.?link)/i.test(queryText);
    const ranked = prefersBlog
      ? [...filtered].sort((a: any, b: any) => {
          const score = (row: any) => {
            const url = String(row?.canonical_url ?? row?.url ?? "").toLowerCase();
            const type = String(row?.page_type ?? "").toLowerCase();
            let s = Number(row?.relevance ?? 0) || 0;
            if (url.includes("/blog")) s += 5;
            if (type.includes("article") || type.includes("blog")) s += 3;
            return s;
          };
          return score(b) - score(a);
        })
      : filtered;
    return finalize({
      name: toolName,
      ok: true,
      error: null,
      data: {
        project_id: projectId,
        query: String(rawArgs.query ?? "").trim() || null,
        path_contains: pathContains || null,
        pages: ranked.map((row: any) => ({
          id: row?.id ?? null,
          url: row?.canonical_url ?? row?.url ?? null,
          title: row?.title ?? null,
          description: row?.description ?? null,
          page_type: row?.page_type ?? null,
          language_code: row?.language_code ?? null,
          summary: row?.summary ?? null,
          relevance: row?.relevance ?? null,
        })),
        count: ranked.length,
      },
    });
  }

if (toolName === "keyword_research") {
  try {
    const keywords: string[] = [...new Set<string>((Array.isArray(rawArgs.keywords) ? rawArgs.keywords : [])
      .map((value: any) => String(value ?? "").trim())
      .filter(Boolean))].slice(0, 20);

    if (keywords.length === 0) {
      return finalize({
        name: toolName,
        ok: false,
        error: "At least one keyword is required.",
        data: [],
      });
    }

    const pageSize = Math.max(1, Math.min(Number(rawArgs.pageSize ?? 10) || 10, 25));
    // keyword-ideas accepts mode "seed" | "url" only (not "metrics"/"ideas").
    // Pass singular `keyword` and/or `keywords[]` — never invent invalid mode values.
    const response = await invokeJsonEdgeFunction("keyword-ideas", {
      keyword: keywords[0],
      keywords: keywords.length > 1 ? keywords : undefined,
      regionId: normalizeKeywordRegionId(rawArgs.regionId ?? rawArgs.region_id),
      languageId: rawArgs.languageId ?? rawArgs.language_id ?? undefined,
      pageSize,
      mode: "seed",
      taskId: canonicalTaskId,
      channelId: canonicalChannelId,
    }, 20000, ctx?.request_auth_header, ctx?.ai_run_id);

    const rows = Array.isArray(response?.results) ? response.results : [];

    const rowsByKeyword = new Map<string, any>(
      rows.map((row: any) => [
        String(row?.keyword ?? "").trim().toLowerCase(),
        row,
      ]),
    );

    const relatedKeywords = rows.slice(0, pageSize).map((row: any) => ({
      keyword: row?.keyword ?? null,
      avgMonthlySearches: row?.avgMonthlySearches ?? null,
      competitionIndex: row?.competitionIndex ?? null,
    }));

    const data = keywords.map((keyword, index) => {
      const exact = rowsByKeyword.get(keyword.toLowerCase());
      const base = {
        keyword,
        avgMonthlySearches: exact?.avgMonthlySearches ?? null,
        competitionIndex: exact?.competitionIndex ?? null,
        relatedKeywords: [] as typeof relatedKeywords,
        ideas: [] as typeof relatedKeywords,
        recommendedKeywords: [] as typeof relatedKeywords,
      };

      // Attach related ideas on the primary seed (and on single-keyword lookups).
      if (index === 0 && relatedKeywords.length > 0) {
        return {
          ...base,
          avgMonthlySearches:
            base.avgMonthlySearches ?? relatedKeywords[0]?.avgMonthlySearches ?? null,
          competitionIndex:
            base.competitionIndex ?? relatedKeywords[0]?.competitionIndex ?? null,
          relatedKeywords,
          ideas: relatedKeywords,
          recommendedKeywords: relatedKeywords.slice(0, 8),
        };
      }

      return base;
    });

    return finalize({
      name: toolName,
      ok: true,
      error: null,
      data,
    });
  } catch (error: any) {
    const message = error?.message ?? String(error);

    return finalize({
      name: toolName,
      ok: false,
      error: message,
      data: [],
    });
  }
}

if (toolName === "google_top_results") {
    try {
      const data = await invokeJsonEdgeFunction("top-results", {
        q: String(rawArgs.query ?? "").trim(),
        regionId: normalizeKeywordRegionId(rawArgs.regionId ?? rawArgs.region_id),
        languageId: rawArgs.languageId ?? rawArgs.language_id ?? undefined,
        task_id: canonicalTaskId,
        channel_id: canonicalChannelId,
      }, 20000, ctx?.request_auth_header, ctx?.ai_run_id);
      return finalize({ name: toolName, ok: true, error: null, data });
    } catch (error: any) {
      return finalize({ name: toolName, ok: false, error: error?.message ?? String(error), data: null });
    }
  }

if (toolName === "list_project_social_profiles") {
  const namedLookup = String(
    rawArgs.project_name ?? rawArgs.projectName ?? rawArgs.query ?? rawArgs.name ?? "",
  ).trim();
  const resolved = await resolveVisibleProjectTarget({
    db,
    projectId: rawArgs.project_id ?? rawArgs.projectId,
    projectName: namedLookup || null,
    allowScopeFallbackIds: namedLookup
      ? []
      : [
          Number(thread?.project_id ?? 0),
          Number(ctx?.project_id ?? 0),
        ].filter((id) => Number.isFinite(id) && id > 0),
  });
  if (!resolved.ok) {
    return finalize({
      name: toolName,
      ok: false,
      error: resolved.error,
      data: {
        needs_clarification: resolved.needs_clarification,
        candidates: resolved.candidates ?? [],
      },
    });
  }

  const projectId = resolved.project.id;
  const [brandRes, competitorRes, profilesRes] = await Promise.all([
    db
      .from("project_brand_social_profiles")
      .select("id,network,profile_url,is_active,last_sync_status,last_synced_at,last_sync_error")
      .eq("project_id", projectId)
      .order("network", { ascending: true }),
    db
      .from("project_competitors")
      .select("id,name,website_url,is_active")
      .eq("project_id", projectId)
      .order("name", { ascending: true }),
    db
      .from("project_competitor_social_profiles")
      .select("id,competitor_id,network,profile_url,is_active,last_sync_status,last_synced_at,last_sync_error")
      .eq("project_id", projectId)
      .order("network", { ascending: true }),
  ]);

  if (brandRes.error || competitorRes.error || profilesRes.error) {
    return finalize({
      name: toolName,
      ok: false,
      error:
        brandRes.error?.message
        ?? competitorRes.error?.message
        ?? profilesRes.error?.message
        ?? "failed_to_load_social_profiles",
      data: null,
    });
  }

  const profilesByCompetitor = new Map<number, any[]>();
  for (const row of profilesRes.data ?? []) {
    const list = profilesByCompetitor.get(row.competitor_id) ?? [];
    list.push({
      id: row.id,
      network: row.network,
      profile_url: row.profile_url,
      is_active: row.is_active !== false,
      last_sync_status: row.last_sync_status ?? null,
      last_synced_at: row.last_synced_at ?? null,
      last_sync_error: row.last_sync_error ?? null,
    });
    profilesByCompetitor.set(row.competitor_id, list);
  }

  return finalize({
    name: toolName,
    ok: true,
    error: null,
    data: {
      project_id: projectId,
      project_name: resolved.project.name,
      brand_profiles: (brandRes.data ?? []).map((row: any) => ({
        id: row.id,
        network: row.network,
        profile_url: row.profile_url,
        is_active: row.is_active !== false,
        last_sync_status: row.last_sync_status ?? null,
        last_synced_at: row.last_synced_at ?? null,
        last_sync_error: row.last_sync_error ?? null,
      })),
      competitors: (competitorRes.data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        website_url: row.website_url ?? null,
        is_active: row.is_active !== false,
        social_profiles: profilesByCompetitor.get(row.id) ?? [],
      })),
    },
  });
}

if (toolName === "read_project_social_stats") {
  const namedLookup = String(
    rawArgs.project_name ?? rawArgs.projectName ?? rawArgs.query ?? rawArgs.name ?? "",
  ).trim();
  const resolved = await resolveVisibleProjectTarget({
    db,
    projectId: rawArgs.project_id ?? rawArgs.projectId,
    projectName: namedLookup || null,
    allowScopeFallbackIds: namedLookup
      ? []
      : [
          Number(thread?.project_id ?? 0),
          Number(ctx?.project_id ?? 0),
        ].filter((id) => Number.isFinite(id) && id > 0),
  });
  if (!resolved.ok) {
    return finalize({
      name: toolName,
      ok: false,
      error: resolved.error,
      data: {
        needs_clarification: resolved.needs_clarification,
        candidates: resolved.candidates ?? [],
      },
    });
  }

  const projectId = resolved.project.id;
  const allowedNetworks = new Set([
    "linkedin",
    "instagram",
    "facebook",
    "youtube",
    "tiktok",
    "x",
  ]);
  const networks = Array.isArray(rawArgs.networks)
    ? [...new Set(
        rawArgs.networks
          .map((value: any) => String(value ?? "").trim().toLowerCase())
          .filter((value: string) => allowedNetworks.has(value)),
      )]
    : [];

  const includeTimeseries = rawArgs.include_timeseries === true
    || rawArgs.includeTimeseries === true;
  const includeTopPosts = rawArgs.include_top_posts === true
    || rawArgs.includeTopPosts === true;

  let dateFrom = String(rawArgs.date_from ?? rawArgs.dateFrom ?? "").trim() || null;
  let dateTo = String(rawArgs.date_to ?? rawArgs.dateTo ?? "").trim() || null;
  if (!dateFrom && !dateTo) {
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 29);
    dateFrom = start.toISOString();
    dateTo = end.toISOString();
  }

  const { data, error } = await db.rpc("fn_get_project_social_competitive_summary", {
    p_project_id: projectId,
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_networks: networks.length ? networks : null,
    p_entity_ids: null,
  });

  if (error) {
    return finalize({ name: toolName, ok: false, error: error.message, data: null });
  }

  const record = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const entities = Array.isArray(record.entities) ? record.entities : [];

  return finalize({
    name: toolName,
    ok: true,
    error: null,
    data: {
      project_id: projectId,
      project_name: resolved.project.name,
      date_from: record.date_from ?? dateFrom,
      date_to: record.date_to ?? dateTo,
      networks: networks.length ? networks : null,
      totals: record.totals ?? null,
      entities: entities.map((entity: any) => {
        const row = entity && typeof entity === "object" ? entity : {};
        return {
          entity_id: row.entity_id ?? null,
          entity_name: row.entity_name ?? null,
          entity_type: row.entity_type ?? null,
          is_owned: row.is_owned === true,
          posts_count: row.posts_count ?? 0,
          interactions_total: row.interactions_total ?? null,
          interactions_avg: row.interactions_avg ?? null,
          interactions_median: row.interactions_median ?? null,
          reactions_total: row.reactions_total ?? null,
          comments_total: row.comments_total ?? null,
          shares_total: row.shares_total ?? null,
          views_total: row.views_total ?? null,
          share_of_posts_pct: row.share_of_posts_pct ?? null,
          share_of_interactions_pct: row.share_of_interactions_pct ?? null,
          followers_latest: row.followers_latest ?? null,
          followers_start: row.followers_start ?? null,
          followers_delta: row.followers_delta ?? null,
          followers_delta_pct: row.followers_delta_pct ?? null,
          networks: Array.isArray(row.networks) ? row.networks : [],
          top_posts: includeTopPosts && Array.isArray(row.top_posts)
            ? row.top_posts.slice(0, 5)
            : undefined,
        };
      }),
      post_timeseries: includeTimeseries && Array.isArray(record.post_timeseries)
        ? record.post_timeseries
        : undefined,
      follower_timeseries: includeTimeseries && Array.isArray(record.follower_timeseries)
        ? record.follower_timeseries
        : undefined,
    },
  });
}

  return null;
}

async function executeSourceTool(runtime: any) {
  const { db, ctx, thread, toolName, rawArgs, finalize, supabaseService } = runtime;

  if (toolName === 'ai_create_source') {
    const sourceType = String(rawArgs.source_type ?? 'other');
    let sourceUrl = String(rawArgs.source_url ?? '').trim() || null;
    let contentText = rawArgs.content_text == null ? null : String(rawArgs.content_text);
    let metadata = rawArgs.metadata && typeof rawArgs.metadata === 'object' && !Array.isArray(rawArgs.metadata) ? rawArgs.metadata : {};
    const { data, error } = await db.rpc('ai_create_source_v1', {
      p_source_type: sourceType,
      p_title: String(rawArgs.title ?? '').trim().slice(0, 500),
      p_task_id: positiveInt(rawArgs.task_id),
      p_project_id: positiveInt(rawArgs.project_id),
      p_ai_thread_id: rawArgs.unattached === true ? null : (cleanUuidOrNull(rawArgs.ai_thread_id) ?? cleanUuidOrNull(thread?.id)),
      p_source_url: sourceUrl,
      p_attachment_id: cleanUuidOrNull(rawArgs.attachment_id),
      p_content_text: contentText,
      p_content_json: rawArgs.content_json && typeof rawArgs.content_json === 'object' ? rawArgs.content_json : null,
      p_metadata: metadata,
      p_change_source: 'ai_chat',
    });
    const sourceId = cleanUuidOrNull(data?.source?.id);
    const shouldImport = !error && sourceId && rawArgs.fetch_url_now !== false && (sourceType === 'url' || !!cleanUuidOrNull(rawArgs.attachment_id)) && !contentText;
    if (shouldImport) {
      const importPromise = invokeJsonEdgeFunction('ai-source-import-worker', { source_id: sourceId }, 120000, ctx?.request_auth_header, ctx?.ai_run_id)
        .catch((importError: any) => console.error('source import dispatch failed', { source_id: sourceId, error: importError?.message ?? String(importError) }));
      const edgeRuntime = (globalThis as any).EdgeRuntime;
      if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(importPromise);
    }
    return finalize({ name: toolName, ok: !error && data?.ok !== false, error: error?.message ?? data?.error ?? null, data: data ? { ...data, import_started: !!shouldImport } : data });
  }

  if (toolName === 'ai_list_sources') {
    const { data, error } = await db.rpc('ai_list_sources_v1', {
      p_task_id: positiveInt(rawArgs.task_id),
      p_project_id: positiveInt(rawArgs.project_id),
      p_ai_thread_id: cleanUuidOrNull(rawArgs.ai_thread_id),
      p_unattached_only: rawArgs.unattached_only === true,
      p_limit: Math.max(1, Math.min(Number(rawArgs.limit ?? 100) || 100, 500)),
      p_offset: Math.max(0, Number(rawArgs.offset ?? 0) || 0),
    });
    return finalize({ name: toolName, ok: !error && data?.ok !== false, error: error?.message ?? data?.error ?? null, data });
  }

  if (toolName === 'ai_read_source') {
    const sourceId = cleanUuidOrNull(rawArgs.source_id);
    if (!sourceId) return finalize({ name: toolName, ok: false, error: 'source_id_required', data: null });
    const { data, error } = await db.rpc('ai_get_source_v1', {
      p_source_id: sourceId,
      p_version_number: positiveInt(rawArgs.version_number),
    });
    // Sign extracted PDF images so the model can put real <img src> URLs in HTML.
    try {
      const source = data?.source
      const meta = source?.metadata && typeof source.metadata === "object" ? source.metadata : {}
      const images = Array.isArray(meta.extracted_images) ? meta.extracted_images : []
      if (!error && data?.ok !== false && images.length && supabaseService) {
        const extracted_images = []
        for (const img of images.slice(0, 24)) {
          const filePath = String(img?.file_path ?? "").replace(/^attachments\//, "")
          let url: string | null = null
          if (filePath) {
            const signed = await supabaseService.storage
              .from("attachments")
              .createSignedUrl(filePath, 60 * 60 * 6)
            url = signed.data?.signedUrl ?? null
          }
          extracted_images.push({ ...img, url })
        }
        data.source = {
          ...source,
          extracted_images,
          metadata: { ...meta, extracted_images, extracted_image_count: extracted_images.length },
        }
      }
    } catch (signError) {
      console.warn("ai_read_source image sign failed", String(signError))
    }
    return finalize({ name: toolName, ok: !error && data?.ok !== false, error: error?.message ?? data?.error ?? null, data });
  }

  if (toolName === 'ai_attach_source_scope') {
    const sourceId = cleanUuidOrNull(rawArgs.source_id);
    if (!sourceId) return finalize({ name: toolName, ok: false, error: 'source_id_required', data: null });
    const { data, error } = await db.rpc('ai_attach_source_scope_v1', {
      p_source_id: sourceId,
      p_task_id: positiveInt(rawArgs.task_id),
      p_project_id: positiveInt(rawArgs.project_id),
      p_ai_thread_id: cleanUuidOrNull(rawArgs.ai_thread_id),
      p_replace: rawArgs.replace === true,
    });
    return finalize({ name: toolName, ok: !error && data?.ok !== false, error: error?.message ?? data?.error ?? null, data });
  }

  if (toolName === 'ai_refresh_url_source') {
    const sourceId = cleanUuidOrNull(rawArgs.source_id);
    if (!sourceId) return finalize({ name: toolName, ok: false, error: 'source_id_required', data: null });
    try {
      const importPromise = invokeJsonEdgeFunction('ai-source-import-worker', { source_id: sourceId }, 120000, ctx?.request_auth_header, ctx?.ai_run_id);
      const edgeRuntime = (globalThis as any).EdgeRuntime;
      if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(importPromise); else await importPromise;
      return finalize({ name: toolName, ok: true, error: null, data: { source_id: sourceId, import_started: true } });
    } catch (error: any) {
      return finalize({ name: toolName, ok: false, error: error?.message ?? String(error), data: null });
    }
  }

  return null;
}

async function executeAgentTool(runtime: any) {
  const { db, ctx, thread, toolName, rawArgs, finalize } = runtime;
  if (toolName === 'ai_start_agent_run') {
    const threadId = cleanUuidOrNull(thread?.id);
    if (!threadId) return finalize({ name: toolName, ok: false, error: 'thread_id_required', data: null });
    const { data, error } = await db.rpc('ai_create_agent_run_v1', {
      p_thread_id: threadId,
      p_request_text: String(rawArgs.request_text ?? ctx?.current_user_request ?? '').trim(),
      p_project_id: positiveInt(rawArgs.project_id),
      p_task_ids: uniqueInts(rawArgs.task_ids),
      p_selection_policy: rawArgs.selection_policy && typeof rawArgs.selection_policy === 'object' ? rawArgs.selection_policy : {},
      p_max_tasks: Math.max(1, Math.min(Number(rawArgs.max_tasks ?? 20) || 20, 1000)),
      p_artifact_concurrency: Math.max(1, Math.min(Number(rawArgs.artifact_concurrency ?? 4) || 4, 8)),
    });
    const agentRunId = cleanUuidOrNull(data?.agent_run_id);
    if (!error && agentRunId) {
      try {
        await invokeJsonEdgeFunction('ai-agent-supervisor', { agent_run_id: agentRunId, action: 'pump' }, 15000, ctx?.request_auth_header, ctx?.ai_run_id);
      } catch (dispatchError: any) {
        console.error('agent supervisor initial dispatch failed', { agent_run_id: agentRunId, error: dispatchError?.message ?? String(dispatchError) });
      }
    }
    return finalize({ name: toolName, ok: !error && data?.ok !== false, error: error?.message ?? data?.error ?? null, data });
  }
  if (toolName === 'ai_get_agent_run') {
    const runId = cleanUuidOrNull(rawArgs.agent_run_id);
    if (!runId) return finalize({ name: toolName, ok: false, error: 'agent_run_id_required', data: null });
    const { data, error } = await db.rpc('ai_get_agent_run_v1', { p_agent_run_id: runId });
    return finalize({ name: toolName, ok: !error && data?.ok !== false, error: error?.message ?? data?.error ?? null, data });
  }
  if (toolName === 'ai_set_agent_run_state') {
    const runId = cleanUuidOrNull(rawArgs.agent_run_id);
    if (!runId) return finalize({ name: toolName, ok: false, error: 'agent_run_id_required', data: null });
    const { data, error } = await db.rpc('ai_set_agent_run_state_v1', { p_agent_run_id: runId, p_status: String(rawArgs.status ?? '') });
    if (!error && String(rawArgs.status ?? '') === 'running') {
      try { await invokeJsonEdgeFunction('ai-agent-supervisor', { agent_run_id: runId, action: 'pump' }, 15000, ctx?.request_auth_header, ctx?.ai_run_id); } catch { /* durable state remains */ }
    }
    return finalize({ name: toolName, ok: !error && data?.ok !== false, error: error?.message ?? data?.error ?? null, data });
  }
  return null;
}

async function executePublishingTool(runtime: any) {
  const { toolName, rawArgs, finalize, ctx, thread } = runtime;
  const auth = ctx?.request_auth_header ?? null;
  const runId = ctx?.ai_run_id ?? null;
  const threadId = cleanUuidOrNull(thread?.id ?? ctx?.thread_id);
  // This is request-scoped renderer/preload capability data forwarded by
  // ai-chat. It is intentionally separate from tool arguments so the model
  // cannot manufacture a Desktop execution environment.
  const clientExecutionContext = (() => {
    const capabilities = ctx?.client_capabilities;
    const desktop =
      capabilities?.client_runtime === "desktop" &&
      capabilities?.desktop_available === true &&
      capabilities?.native_browser_available === true &&
      capabilities?.desktop_browser_control === true;
    return {
      client_runtime: desktop ? "desktop" : "web",
      desktop_available: desktop,
      native_browser_available: desktop,
      desktop_browser_control: desktop,
      ...(desktop && typeof capabilities?.desktop_version === "string"
        ? { desktop_version: capabilities.desktop_version }
        : {}),
      ...(desktop && typeof capabilities?.desktop_session_id === "string"
        ? { desktop_session_id: capabilities.desktop_session_id }
        : {}),
    };
  })();

  if (toolName === "list_publishing_destinations") {
    const projectId =
      positiveInt(rawArgs.project_id) ??
      positiveInt(ctx?.project_id) ??
      positiveInt(thread?.project_id);
    try {
      const payloads: any[] = [];
      if (projectId != null) {
        payloads.push(
          await invokeJsonEdgeFunction(
            "agentic-publishing",
            { action: "list_destinations", project_id: projectId },
            30000,
            auth,
            runId,
          ),
        );
      }
      // Always include personal destinations so semantic resolution can see full candidates.
      payloads.push(
        await invokeJsonEdgeFunction(
          "agentic-publishing",
          { action: "list_destinations", owner_scope: true },
          30000,
          auth,
          runId,
        ),
      );
      const byId = new Map<string, any>();
      for (const data of payloads) {
        for (const row of Array.isArray(data?.destinations) ? data.destinations : []) {
          if (row?.id) byId.set(String(row.id), row);
        }
      }
      const destinations = Array.from(byId.values());
      return finalize({
        name: toolName,
        ok: true,
        error: null,
        data: {
          destinations: destinations.map((row: any) => ({
            id: row.id,
            name: row.name,
            start_url: row.start_url,
            status: row.status,
            project_id: row.project_id ?? null,
            memory: row.memory ?? {},
            guidance: row.memory?.guidance ?? null,
            entry_points: row.memory?.entry_points ?? null,
            last_successful_publication_url: row.memory?.last_successful_publication_url ?? null,
          })),
          count: destinations.length,
        },
      });
    } catch (error: any) {
      return finalize({
        name: toolName,
        ok: false,
        error: error?.message ?? String(error),
        data: null,
      });
    }
  }

  if (toolName === "configure_publishing_destination") {
    const projectId =
      positiveInt(rawArgs.project_id) ??
      positiveInt(ctx?.project_id) ??
      positiveInt(thread?.project_id);
    const pendingPublication =
      rawArgs.pending_publication &&
      typeof rawArgs.pending_publication === "object" &&
      !Array.isArray(rawArgs.pending_publication)
        ? rawArgs.pending_publication
        : null;
    const pendingArtifactId = cleanUuidOrNull(pendingPublication?.artifact_id);
    const pendingContent =
      pendingPublication?.content &&
      typeof pendingPublication.content === "object" &&
      !Array.isArray(pendingPublication.content)
        ? pendingPublication.content
        : null;
    const hasPendingPublication = Boolean(pendingArtifactId || pendingContent);
    // When a publication will start immediately, let start_publication own the auth browser
    // so we do not open two Browser Use sessions for the same objective.
    const connect =
      hasPendingPublication
        ? false
        : rawArgs.connect === false
          ? false
          : true;
    try {
      const configured = await invokeJsonEdgeFunction(
        "agentic-publishing",
        {
          action: "configure_destination",
          ...(projectId != null ? { project_id: projectId } : {}),
          ...(cleanUuidOrNull(rawArgs.destination_id)
            ? { destination_id: cleanUuidOrNull(rawArgs.destination_id) }
            : {}),
          ...(typeof rawArgs.name === "string" ? { name: rawArgs.name.trim() } : {}),
          ...(typeof rawArgs.project_name === "string"
            ? { project_name: rawArgs.project_name.trim() }
            : {}),
          ...(typeof rawArgs.service_or_platform === "string"
            ? { service_or_platform: rawArgs.service_or_platform.trim() }
            : typeof rawArgs.platform === "string"
              ? { service_or_platform: rawArgs.platform.trim() }
              : {}),
          ...(typeof rawArgs.start_url === "string"
            ? { start_url: rawArgs.start_url.trim() }
            : typeof rawArgs.url === "string"
              ? { start_url: rawArgs.url.trim() }
              : {}),
          ...(typeof rawArgs.purpose === "string" ? { purpose: rawArgs.purpose.trim() } : {}),
          ...(typeof rawArgs.content_type === "string"
            ? { content_type: rawArgs.content_type.trim() }
            : {}),
          ...(typeof rawArgs.guidance === "string" ? { guidance: rawArgs.guidance.trim() } : {}),
          connect,
          ...(threadId ? { ai_thread_id: threadId } : {}),
          ...clientExecutionContext,
        },
        120000,
        auth,
        runId,
      );
      const destination = configured?.destination ?? null;
      const destinationId = cleanUuidOrNull(configured?.destination_id ?? destination?.id);
      if (!destinationId) {
        return finalize({
          name: toolName,
          ok: false,
          error: configured?.error?.message ?? "configure_destination_failed",
          data: configured ?? null,
        });
      }

      let publication: any = null;
      if (hasPendingPublication) {
        const publishMode =
          String(pendingPublication?.publish_mode ?? pendingPublication?.mode ?? "")
            .trim()
            .toLowerCase() === "scheduled"
            ? "scheduled"
            : "now";
        const scheduledAt =
          typeof pendingPublication?.scheduled_at === "string"
            ? pendingPublication.scheduled_at.trim()
            : null;
        const timezone =
          typeof pendingPublication?.timezone === "string"
            ? pendingPublication.timezone.trim()
            : null;
        publication = await invokeJsonEdgeFunction(
          "agentic-publishing",
          {
            action: "start_publication",
            destination_id: destinationId,
            publish_mode: publishMode,
            ...(pendingArtifactId ? { artifact_id: pendingArtifactId } : {}),
            ...(pendingContent ? { content: pendingContent } : {}),
            ...(threadId ? { ai_thread_id: threadId } : {}),
            ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
            ...(timezone ? { timezone } : {}),
            ...clientExecutionContext,
          },
          120000,
          auth,
          runId,
        );
      }

      const run = publication?.run ?? null;
      const needsAuth = Boolean(
        publication?.needs_authentication || configured?.needs_authentication,
      );
      const liveViewUrl =
        publication?.live_view_url ??
        run?.live_view_url ??
        configured?.live_view_url ??
        null;
      const continuingPublication = Boolean(run?.id);
      return finalize({
        name: toolName,
        ok: true,
        error: null,
        data: {
          destination_id: destinationId,
          destination_name: destination?.name ?? null,
          destination_status: destination?.status ?? null,
          start_url: destination?.start_url ?? null,
          created: Boolean(configured?.created),
          reused_existing: Boolean(configured?.reused_existing),
          connecting: Boolean(configured?.connecting),
          already_connected: Boolean(configured?.already_connected),
          needs_authentication: needsAuth,
          publication_run_id: run?.id ?? null,
          connect_run_id: configured?.connect_run_id ?? null,
          status: run?.status ?? destination?.status ?? null,
          live_view_url: liveViewUrl,
          show_browser_preview: Boolean(liveViewUrl) || continuingPublication,
          open_browser_tab: false,
          continuing_publication: continuingPublication,
          message: continuingPublication
            ? needsAuth
              ? "Destination configured. A browser preview appears in chat — sign in there; publication resumes after login. Do not share Live View URLs as external links."
              : "Destination configured. Continuing the original publication…"
            : needsAuth
              ? "Destination configured. A browser preview appears in chat — sign in there, then say when you are done. Do not share Live View URLs as external links."
              : configured?.message ?? "Destination configured.",
        },
      });
    } catch (error: any) {
      return finalize({
        name: toolName,
        ok: false,
        error: error?.message ?? String(error),
        data: null,
      });
    }
  }

  if (toolName === "publish_content") {
    const destinationId = cleanUuidOrNull(rawArgs.destination_id);
    const artifactId = cleanUuidOrNull(rawArgs.artifact_id);
    const content =
      rawArgs.content && typeof rawArgs.content === "object" && !Array.isArray(rawArgs.content)
        ? rawArgs.content
        : null;
    const publishMode =
      String(rawArgs.publish_mode ?? rawArgs.mode ?? "").trim().toLowerCase() === "scheduled"
        ? "scheduled"
        : "now";
    const scheduledAt =
      typeof rawArgs.scheduled_at === "string" && rawArgs.scheduled_at.trim()
        ? rawArgs.scheduled_at.trim()
        : typeof rawArgs.scheduledAt === "string" && rawArgs.scheduledAt.trim()
          ? rawArgs.scheduledAt.trim()
          : null;
    const timezone =
      typeof rawArgs.timezone === "string" && rawArgs.timezone.trim()
        ? rawArgs.timezone.trim()
        : typeof rawArgs.schedule_timezone === "string" && rawArgs.schedule_timezone.trim()
          ? rawArgs.schedule_timezone.trim()
          : null;
    const scheduleStrategy =
      String(rawArgs.schedule_strategy ?? "").trim().toLowerCase() === "internal"
        ? "internal"
        : String(rawArgs.schedule_strategy ?? "").trim().toLowerCase() === "external"
          ? "external"
          : null;
    if (!destinationId) {
      return finalize({ name: toolName, ok: false, error: "destination_id_required", data: null });
    }
    if (!artifactId && !content) {
      return finalize({
        name: toolName,
        ok: false,
        error: "artifact_id_or_content_required",
        data: null,
      });
    }
    if (publishMode === "scheduled" && !scheduledAt) {
      return finalize({
        name: toolName,
        ok: false,
        error: "scheduled_at_required",
        data: null,
      });
    }
    try {
      const data = await invokeJsonEdgeFunction(
        "agentic-publishing",
        {
          action: "start_publication",
          destination_id: destinationId,
          publish_mode: publishMode,
          ...(artifactId ? { artifact_id: artifactId } : {}),
          ...(content ? { content } : {}),
          ...(threadId ? { ai_thread_id: threadId } : {}),
          ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
          ...(timezone ? { timezone } : {}),
          ...(scheduleStrategy ? { schedule_strategy: scheduleStrategy } : {}),
          ...clientExecutionContext,
        },
        120000,
        auth,
        runId,
      );
      const run = data?.run ?? null;
      const needsAuth = Boolean(data?.needs_authentication);
      const userQuestion = run?.metadata?.user_question ?? null;
      const isScheduledPark = run?.status === "scheduled";
      return finalize({
        name: toolName,
        ok: Boolean(run?.id),
        error: run?.id ? null : (data?.error?.message ?? "publication_start_failed"),
        data: {
          publication_run_id: run?.id ?? null,
          status: run?.status ?? null,
          live_view_url: data?.live_view_url ?? run?.live_view_url ?? null,
          destination_id: run?.destination_id ?? destinationId,
          destination_name: run?.metadata?.destination_name ?? null,
          artifact_id: run?.artifact_id ?? artifactId,
          source_type: run?.source_type ?? (artifactId ? "artifact" : "inline"),
          publish_mode: run?.publish_mode ?? publishMode,
          scheduled_at: run?.scheduled_at ?? scheduledAt,
          schedule_timezone: run?.schedule_timezone ?? timezone,
          schedule_strategy: run?.schedule_strategy ?? data?.schedule_strategy ?? null,
          scheduled_at_display: run?.scheduled_at_display ?? null,
          needs_authentication: needsAuth,
          user_question: userQuestion,
          open_browser_tab: false,
          show_browser_preview: !isScheduledPark,
          preferred_start_url: run?.metadata?.preferred_start_url ?? null,
          message: isScheduledPark
            ? (data?.message ?? "Publication scheduled.")
            : needsAuth
              ? "Publication created and waiting for destination sign-in. A browser preview appears in chat — after login, verification resumes the publication automatically."
              : publishMode === "scheduled"
                ? "Scheduling started. A browser preview appears in chat while the agent prepares native scheduling when available."
                : "Publication started. A compact browser preview appears in chat. The publishing agent will stop before the final irreversible publish action.",
        },
      });
    } catch (error: any) {
      return finalize({
        name: toolName,
        ok: false,
        error: error?.message ?? String(error),
        data: null,
      });
    }
  }

  if (toolName === "list_scheduled_publications") {
    try {
      const data = await invokeJsonEdgeFunction(
        "agentic-publishing",
        {
          action: "list_publications",
          scheduled_only: true,
          mine_only: true,
          ...(positiveInt(rawArgs.project_id) ? { project_id: positiveInt(rawArgs.project_id) } : {}),
        },
        30000,
        auth,
        runId,
      );
      const runs = Array.isArray(data?.runs) ? data.runs : [];
      return finalize({
        name: toolName,
        ok: true,
        error: null,
        data: {
          publications: runs.map((run: any) => ({
            publication_run_id: run.id,
            status: run.status,
            destination_id: run.destination_id,
            destination_name: run.metadata?.destination_name ?? null,
            artifact_id: run.artifact_id,
            title: run.metadata?.artifact_title ?? null,
            scheduled_at: run.scheduled_at,
            schedule_timezone: run.schedule_timezone,
            scheduled_at_display: run.scheduled_at_display,
            schedule_strategy: run.schedule_strategy,
          })),
          count: runs.length,
        },
      });
    } catch (error: any) {
      return finalize({
        name: toolName,
        ok: false,
        error: error?.message ?? String(error),
        data: null,
      });
    }
  }

  if (toolName === "reschedule_publication") {
    const publicationRunId = cleanUuidOrNull(rawArgs.publication_run_id ?? rawArgs.run_id);
    const scheduledAt =
      typeof rawArgs.scheduled_at === "string" ? rawArgs.scheduled_at.trim() : "";
    if (!publicationRunId || !scheduledAt) {
      return finalize({
        name: toolName,
        ok: false,
        error: "publication_run_id_and_scheduled_at_required",
        data: null,
      });
    }
    try {
      const data = await invokeJsonEdgeFunction(
        "agentic-publishing",
        {
          action: "reschedule_publication",
          run_id: publicationRunId,
          scheduled_at: scheduledAt,
          ...(typeof rawArgs.timezone === "string" ? { timezone: rawArgs.timezone } : {}),
        },
        60000,
        auth,
        runId,
      );
      const run = data?.run ?? null;
      return finalize({
        name: toolName,
        ok: Boolean(run?.id),
        error: run?.id ? null : (data?.error?.message ?? "reschedule_failed"),
        data: {
          publication_run_id: run?.id ?? publicationRunId,
          status: run?.status ?? null,
          scheduled_at: run?.scheduled_at ?? null,
          scheduled_at_display: run?.scheduled_at_display ?? null,
          requires_external_reschedule: Boolean(data?.requires_external_reschedule),
          message: run?.id
            ? `Rescheduled to ${run.scheduled_at_display ?? run.scheduled_at}.`
            : null,
        },
      });
    } catch (error: any) {
      return finalize({
        name: toolName,
        ok: false,
        error: error?.message ?? String(error),
        data: null,
      });
    }
  }

  if (toolName === "cancel_scheduled_publication") {
    const publicationRunId = cleanUuidOrNull(rawArgs.publication_run_id ?? rawArgs.run_id);
    if (!publicationRunId) {
      return finalize({ name: toolName, ok: false, error: "publication_run_id_required", data: null });
    }
    try {
      const data = await invokeJsonEdgeFunction(
        "agentic-publishing",
        {
          action: "cancel_publication",
          run_id: publicationRunId,
          ...(rawArgs.confirm_external_cancel === true || rawArgs.confirm === true
            ? { confirm_external_cancel: true }
            : {}),
        },
        120000,
        auth,
        runId,
      );
      const run = data?.run ?? null;
      return finalize({
        name: toolName,
        ok: Boolean(run?.id) || Boolean(data?.requires_confirmation),
        error: data?.error?.message ?? (run?.id ? null : "cancel_failed"),
        data: {
          publication_run_id: run?.id ?? publicationRunId,
          status: run?.status ?? null,
          requires_confirmation: Boolean(data?.requires_confirmation),
          cancelled_locally: Boolean(data?.cancelled_locally),
          external_cancel_started: Boolean(data?.external_cancel_started),
          show_browser_preview: Boolean(data?.external_cancel_started),
          live_view_url: run?.live_view_url ?? null,
          message: data?.requires_confirmation
            ? "External schedule cancellation needs explicit confirmation. Call again with confirm_external_cancel=true after the user confirms."
            : "Scheduled publication cancelled.",
        },
      });
    } catch (error: any) {
      return finalize({
        name: toolName,
        ok: false,
        error: error?.message ?? String(error),
        data: null,
      });
    }
  }

  if (toolName === "publish_scheduled_now") {
    const publicationRunId = cleanUuidOrNull(rawArgs.publication_run_id ?? rawArgs.run_id);
    if (!publicationRunId) {
      return finalize({ name: toolName, ok: false, error: "publication_run_id_required", data: null });
    }
    try {
      const data = await invokeJsonEdgeFunction(
        "agentic-publishing",
        { action: "publish_scheduled_now", run_id: publicationRunId },
        120000,
        auth,
        runId,
      );
      const run = data?.run ?? null;
      return finalize({
        name: toolName,
        ok: Boolean(run?.id),
        error: run?.id ? null : (data?.error?.message ?? "publish_now_failed"),
        data: {
          publication_run_id: run?.id ?? publicationRunId,
          status: run?.status ?? null,
          live_view_url: run?.live_view_url ?? null,
          show_browser_preview: Boolean(run?.live_view_url),
          executed_now: Boolean(data?.executed_now),
          requires_external_publish_now: Boolean(data?.requires_external_publish_now),
          message: data?.executed_now
            ? "Scheduled publication claimed and started now."
            : (data?.error?.message ?? "Could not publish scheduled item now."),
        },
      });
    } catch (error: any) {
      return finalize({
        name: toolName,
        ok: false,
        error: error?.message ?? String(error),
        data: null,
      });
    }
  }

  if (toolName === "get_publication_state") {
    const publicationRunId = cleanUuidOrNull(rawArgs.publication_run_id ?? rawArgs.run_id);
    try {
      if (publicationRunId) {
        const data = await invokeJsonEdgeFunction(
          "agentic-publishing",
          { action: "sync_publication", run_id: publicationRunId },
          60000,
          auth,
          runId,
        );
        const run = data?.run ?? null;
        return finalize({
          name: toolName,
          ok: Boolean(run?.id),
          error: run?.id ? null : "publication_not_found",
          data: {
            run,
            user_question: run?.metadata?.user_question ?? null,
            awaiting_publish_confirmation: run?.status === "awaiting_publish_confirmation",
            needs_user: run?.status === "needs_user",
          },
        });
      }
      // Prefer user/thread-scoped active runs over a single project filter so personal
      // destinations remain visible alongside project ones.
      const data = await invokeJsonEdgeFunction(
        "agentic-publishing",
        {
          action: "list_publications",
          mine_only: true,
          active_only: rawArgs.active_only !== false,
          ...(threadId ? { ai_thread_id: threadId } : {}),
          ...(positiveInt(rawArgs.project_id)
            ? { project_id: positiveInt(rawArgs.project_id) }
            : {}),
        },
        30000,
        auth,
        runId,
      );
      const runs = Array.isArray(data?.runs) ? data.runs : [];
      const primary = runs[0] ?? null;
      return finalize({
        name: toolName,
        ok: true,
        error: null,
        data: {
          runs,
          active_run: primary,
          count: runs.length,
          user_question: primary?.metadata?.user_question ?? null,
          awaiting_publish_confirmation: primary?.status === "awaiting_publish_confirmation",
          needs_user: primary?.status === "needs_user",
        },
      });
    } catch (error: any) {
      return finalize({
        name: toolName,
        ok: false,
        error: error?.message ?? String(error),
        data: null,
      });
    }
  }

  if (toolName === "continue_publication") {
    const publicationRunId = cleanUuidOrNull(rawArgs.publication_run_id ?? rawArgs.run_id);
    const instruction = String(rawArgs.instruction ?? rawArgs.message ?? "").trim();
    if (!publicationRunId) {
      return finalize({ name: toolName, ok: false, error: "publication_run_id_required", data: null });
    }
    try {
      // If the run is waiting on destination sign-in, complete connect (auto-resumes publication).
      const current = await invokeJsonEdgeFunction(
        "agentic-publishing",
        { action: "get_publication", run_id: publicationRunId },
        30000,
        auth,
        runId,
      );
      const currentRun = current?.run ?? null;
      const awaitingAuth = Boolean(currentRun?.metadata?.awaiting_destination_auth);
      const destinationId = cleanUuidOrNull(currentRun?.destination_id);
      if (awaitingAuth && destinationId) {
        const verified = await invokeJsonEdgeFunction(
          "agentic-publishing",
          {
            action: "complete_destination_connect",
            destination_id: destinationId,
            publication_run_id: publicationRunId,
          },
          120000,
          auth,
          runId,
        );
        const run = verified?.run ?? null;
        return finalize({
          name: toolName,
          ok: Boolean(verified?.authenticated || run?.id),
          error: verified?.authenticated || run?.id
            ? null
            : (verified?.message ?? "destination_connect_incomplete"),
          data: {
            publication_run_id: run?.id ?? publicationRunId,
            status: run?.status ?? null,
            live_view_url: verified?.live_view_url ?? run?.live_view_url ?? null,
            destination_id: destinationId,
            destination_name: run?.metadata?.destination_name ?? null,
            needs_authentication: verified?.authenticated === false,
            resumed_publication: Boolean(verified?.resumed_publication),
            show_browser_preview: true,
            message:
              verified?.message ??
              (verified?.authenticated
                ? "Destination connected. Continuing publication…"
                : "Sign-in could not be confirmed yet."),
          },
        });
      }

      const data = await invokeJsonEdgeFunction(
        "agentic-publishing",
        {
          action: "continue_after_user",
          run_id: publicationRunId,
          ...(instruction ? { message: instruction } : {}),
        },
        120000,
        auth,
        runId,
      );
      const run = data?.run ?? null;
      return finalize({
        name: toolName,
        ok: Boolean(run?.id),
        error: run?.id ? null : (data?.error?.message ?? "continue_failed"),
        data: {
          publication_run_id: run?.id ?? publicationRunId,
          status: run?.status ?? null,
          live_view_url: run?.live_view_url ?? null,
          show_browser_preview: true,
          message: instruction
            ? "Continued the publication with the user's instruction."
            : "Continued the publication from the current browser state.",
        },
      });
    } catch (error: any) {
      return finalize({
        name: toolName,
        ok: false,
        error: error?.message ?? String(error),
        data: null,
      });
    }
  }

  if (toolName === "confirm_publication") {
    const publicationRunId = cleanUuidOrNull(rawArgs.publication_run_id ?? rawArgs.run_id);
    if (!publicationRunId) {
      return finalize({ name: toolName, ok: false, error: "publication_run_id_required", data: null });
    }
    try {
      const data = await invokeJsonEdgeFunction(
        "agentic-publishing",
        { action: "confirm_publication", run_id: publicationRunId },
        120000,
        auth,
        runId,
      );
      const run = data?.run ?? null;
      return finalize({
        name: toolName,
        ok: Boolean(run?.id),
        error: run?.id ? null : (data?.error?.message ?? "confirm_failed"),
        data: {
          publication_run_id: run?.id ?? publicationRunId,
          status: run?.status ?? null,
          live_view_url: run?.live_view_url ?? null,
          show_browser_preview: true,
          message: "Final publish confirmed for this publication run.",
        },
      });
    } catch (error: any) {
      return finalize({
        name: toolName,
        ok: false,
        error: error?.message ?? String(error),
        data: null,
      });
    }
  }

  if (toolName === "cancel_publication") {
    const publicationRunId = cleanUuidOrNull(rawArgs.publication_run_id ?? rawArgs.run_id);
    if (!publicationRunId) {
      return finalize({ name: toolName, ok: false, error: "publication_run_id_required", data: null });
    }
    try {
      const data = await invokeJsonEdgeFunction(
        "agentic-publishing",
        { action: "cancel_publication", run_id: publicationRunId },
        60000,
        auth,
        runId,
      );
      const run = data?.run ?? null;
      return finalize({
        name: toolName,
        ok: Boolean(run?.id),
        error: run?.id ? null : (data?.error?.message ?? "cancel_failed"),
        data: {
          publication_run_id: run?.id ?? publicationRunId,
          status: run?.status ?? null,
          message: "Publication cancelled.",
        },
      });
    } catch (error: any) {
      return finalize({
        name: toolName,
        ok: false,
        error: error?.message ?? String(error),
        data: null,
      });
    }
  }

  return null;
}

const TOOL_HANDLER_BY_NAME = new Map<string, (runtime: any) => Promise<any>>([
  ["ai_save_build_artifact_internal", executeArtifactTool],

  ["ai_create_source", executeSourceTool],
  ["ai_list_sources", executeSourceTool],
  ["ai_read_source", executeSourceTool],
  ["ai_attach_source_scope", executeSourceTool],
  ["ai_refresh_url_source", executeSourceTool],
  ["ai_start_agent_run", executeAgentTool],
  ["ai_get_agent_run", executeAgentTool],
  ["ai_set_agent_run_state", executeAgentTool],

  ["ai_request_clarification", executeClarificationTool],

  ["ai_list_task_artifacts", executeArtifactTool],
  ["ai_list_project_artifacts", executeArtifactTool],
  ["ai_read_artifact", executeArtifactTool],
  ["ai_list_ai_thread_artifacts", executeArtifactTool],
  ["ai_search_artifacts", executeArtifactTool],
  ["ai_list_artifact_versions", executeArtifactTool],
  ["ai_restore_artifact_version", executeArtifactTool],
  ["ai_attach_artifact_to_task", executeArtifactTool],
  ["ai_start_artifact_build", executeArtifactTool],
  ["ai_get_artifact_build", executeArtifactTool],
  ["ai_cancel_artifact_build", executeArtifactTool],

  ["ai_create_project", executeProjectTool],
  ["ai_update_project_fields", executeProjectTool],
  ["read_project", executeProjectTool],
  ["read_projects", executeProjectTool],
  ["extract_project_brand", executeProjectTool],
  ["list_visible_projects", executeProjectTool],
  ["ai_update_project_configuration", executeProjectTool],
  ["ai_manage_project_templates", executeProjectTool],

  ["read_task", executeTaskTool],
  ["read_tasks", executeTaskTool],
  ["list_project_tasks", executeTaskTool],
  ["search_tasks", executeTaskTool],
  ["ai_update_task_fields", executeTaskTool],
  ["ai_bulk_update_project_tasks_fields", executeTaskTool],
  ["ai_create_task", executeTaskTool],
  ["ai_duplicate_task", executeTaskTool],
  ["ai_bulk_create_tasks", executeTaskTool],

  ["list_task_channels", executeChannelTool],
  ["ai_manage_task_channels", executeChannelTool],
  ["read_attachments", executeAttachmentTool],

  ["read_user", executePeopleTool],
  ["read_users", executePeopleTool],
  ["list_visible_users", executePeopleTool],
  ["list_user_projects", executePeopleTool],
  ["list_user_tasks", executePeopleTool],
  ["search_mentions", executePeopleTool],
  ["read_user_occupation_summary", executePeopleTool],
  ["read_user_occupation", executePeopleTool],
  ["read_user_backlog", executePeopleTool],
  ["list_visible_users_occupation_today", executePeopleTool],
  ["ai_manage_watchers", executePeopleTool],

  ["read_public_webpage", executeResearchTool],
  ["search_project_site_pages", executeResearchTool],
  ["keyword_research", executeResearchTool],
  ["google_top_results", executeResearchTool],
  ["list_project_social_profiles", executeResearchTool],
  ["read_project_social_stats", executeResearchTool],

  ["list_publishing_destinations", executePublishingTool],
  ["configure_publishing_destination", executePublishingTool],
  ["publish_content", executePublishingTool],
  ["get_publication_state", executePublishingTool],
  ["continue_publication", executePublishingTool],
  ["confirm_publication", executePublishingTool],
  ["cancel_publication", executePublishingTool],
  ["list_scheduled_publications", executePublishingTool],
  ["reschedule_publication", executePublishingTool],
  ["cancel_scheduled_publication", executePublishingTool],
  ["publish_scheduled_now", executePublishingTool],
]);


async function executeToolCall(args: {
  db: any;
  ctx: any;
  thread: any;
  activeChannelId: number | null;
  toolCall: any;
  trace?: ReturnType<typeof createTimingTrace>;
  round?: number;
  supabaseService?: any;
  attachments?: any[];
}) {
  const { db, ctx, thread, activeChannelId, toolCall, trace, round, supabaseService = db, attachments = [] } = args;
  const toolName = String(toolCall?.function?.name ?? toolCall?.name ?? "");
  const rawArgs = safeJsonParse(toolCall?.function?.arguments ?? toolCall?.arguments);
  trace?.mark("tool_call_requested", { tool_name: toolName, round, has_args: !!rawArgs && Object.keys(rawArgs).length > 0 });
  logToolEvent("requested", { thread_id: thread?.id ?? null, round, tool_name: toolName, args: rawArgs });
  const finalize = (result: any) => {
    trace?.mark("tool_call_completed", { tool_name: toolName, round, ok: !!result?.ok, skipped: !!result?.skipped, has_data: !!result && Object.prototype.hasOwnProperty.call(result, "data") });
    logToolEvent("completed", { thread_id: thread?.id ?? null, round, tool_name: toolName, ok: !!result?.ok, skipped: !!result?.skipped, error: result?.error ?? null });
    return result;
  };
  const canonicalTaskId = positiveInt(rawArgs.task_id ?? rawArgs.id) ?? positiveInt(ctx?.task_id) ?? positiveInt(thread?.task_id);
  const canonicalChannelId = positiveInt(rawArgs.channel_id) ?? positiveInt(ctx?.channel_id) ?? positiveInt(activeChannelId);

  const runtime = { db, ctx, thread, activeChannelId, toolName, rawArgs, finalize, canonicalTaskId, canonicalChannelId, supabaseService, attachments };
  const handler = TOOL_HANDLER_BY_NAME.get(toolName);
  if (!handler) return finalize({ name: toolName, ok: false, error: `Unsupported tool: ${toolName}`, data: null });
  const result = await handler(runtime);
  return result ?? finalize({ name: toolName, ok: false, error: `Tool handler returned no result: ${toolName}`, data: null });
}



async function handleAiToolsRequest(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: { code: "method_not_allowed" } }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization) return new Response(JSON.stringify({ error: { code: "authentication_required" } }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const body = await req.json().catch(() => ({}));
  const toolName = String((body as any)?.tool_name ?? "");
  const rawArgs = (body as any)?.arguments && typeof (body as any).arguments === "object" ? (body as any).arguments : {};
  const context = (body as any)?.context && typeof (body as any).context === "object" ? (body as any).context : {};
  if (!TOOL_HANDLER_BY_NAME.has(toolName)) return new Response(JSON.stringify({ name: toolName, ok: false, error: "unsupported_tool", data: null }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const userDb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const serviceDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const threadId = cleanUuidOrNull(context.thread_id);
  let thread: any = null;
  if (threadId) {
    const { data } = await userDb.from("ai_threads").select("*").eq("id", threadId).maybeSingle();
    thread = data ?? { id: threadId, task_id: positiveInt(context.task_id), project_id: positiveInt(context.project_id) };
  }
  const ctx = {
    ai_run_id: cleanUuidOrNull(context.ai_run_id),
    current_user_request: String(context.current_user_request ?? ""),
    selected_artifact_context: context.selected_artifact_context ?? null,
    request_auth_header: authorization,
    project_id: positiveInt(context.project_id),
    task_id: positiveInt(context.task_id),
    channel_id: positiveInt(context.channel_id),
  };
  const toolCall = { function: { name: toolName, arguments: JSON.stringify(rawArgs) } };
  try {
    const result = await executeToolCall({
      db: userDb,
      ctx,
      thread,
      activeChannelId: positiveInt(context.channel_id),
      toolCall,
      round: Number(context.round ?? 0) || 0,
      supabaseService: serviceDb,
      attachments: Array.isArray(context.attachments) ? context.attachments : [],
    });
    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("ai-tools execution failed", { tool_name: toolName, error: error?.message ?? String(error) });
    return new Response(JSON.stringify({ name: toolName, ok: false, error: error?.message ?? String(error), data: null }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
}

Deno.serve(handleAiToolsRequest);
