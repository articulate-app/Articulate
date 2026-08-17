// supabase/functions/ai-chat/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";


import { createClient } from "https://esm.sh/@supabase/supabase-js@2";



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



function createAiTokenQuotaContext(args: {
  client: any;
  threadId: string;
  clientRequestId: string;
  signal?: AbortSignal | null;
}): AiTokenQuotaContext {
  return {
    client: args.client,
    threadId: args.threadId,
    clientRequestId: args.clientRequestId,
    runId: null,
    signal: args.signal ?? null,
    counters: new Map<string, number>(),
    latestUsage: null,
  };
}



async function bindAiTokenQuotaRun(context: AiTokenQuotaContext | null | undefined, runId: string | null) {
  if (!context || !runId) return;
  context.runId = runId;
  const { error } = await context.client.rpc("ai_bind_token_usage_run", {
    p_client_request_id: context.clientRequestId,
    p_run_id: runId,
  });
  if (error) {
    console.error("ai token usage run binding failed", { run_id: runId, error: error.message });
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

function estimateContextTokens(value: unknown): number {
  if (value == null) return 0;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return 0;
  return Math.max(1, Math.ceil(new TextEncoder().encode(text).byteLength / 3.2));
}

function buildContextComposition(args: {
  systemPrompt: string;
  recentMessages: any[];
  turnContextPrompt: string;
  currentContent: any;
  tools: any[];
}) {
  const summaryMessages = args.recentMessages.filter((message) =>
    message?.role === "system" && String(message?.content ?? "").startsWith("SUMMARY OF EARLIER CONVERSATION")
  );
  const normalRecent = args.recentMessages.filter((message) => !summaryMessages.includes(message));
  const composition = {
    system: estimateContextTokens(args.systemPrompt),
    tools: estimateContextTokens(args.tools),
    summary: estimateContextTokens(summaryMessages),
    recent_messages: estimateContextTokens(normalRecent),
    turn_context: estimateContextTokens(args.turnContextPrompt),
    current_request: estimateContextTokens(args.currentContent),
  };
  return {
    ...composition,
    total_estimated_tokens: Object.values(composition).reduce((sum, value) => sum + value, 0),
  };
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
    usage.input_tokens_details?.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? usage.cached_tokens ?? 0,
  ) || 0);
  const cacheWrite = Math.max(0, Number(
    usage.cache_write_tokens ?? usage.input_tokens_details?.cache_write_tokens ?? usage.prompt_tokens_details?.cache_write_tokens ?? 0,
  ) || 0);
  const cost = Math.max(0, Number(usage.cost ?? usage.total_cost ?? 0) || 0);
  return {
    prompt_tokens: Math.round(prompt),
    completion_tokens: Math.round(completion),
    total_tokens: Math.round(total),
    cached_prompt_tokens: Math.round(cached),
    cache_write_tokens: Math.round(cacheWrite),
    cost,
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
    p_cache_write_tokens: usage.cache_write_tokens,
    p_total_tokens: usage.total_tokens,
    p_succeeded: args.succeeded,
    p_error_code: args.errorCode ?? (parseFailed ? "provider_usage_missing" : null),
    p_metadata: {
      usage_parse_failed: parseFailed,
      cache_write_tokens: usage.cache_write_tokens,
      cache_hit_rate: usage.prompt_tokens > 0 ? usage.cached_prompt_tokens / usage.prompt_tokens : 0,
    },
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
  provider?: string;
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
  const reserveStartedAtMs = performance.now();
  const { data: reservation, error: reservationError } = await args.context.client.rpc("ai_reserve_token_call", {
    p_thread_id: args.context.threadId,
    p_client_request_id: args.context.clientRequestId,
    p_call_key: callKey,
    p_stage: args.stage,
    p_provider: args.provider ?? "openai",
    p_model: model,
    p_estimated_prompt_tokens: estimatedPrompt,
    p_estimated_completion_tokens: estimatedCompletion,
    p_run_id: args.context.runId,
    p_metadata: { endpoint: new URL(args.url).pathname },
  });
  console.log("ai-chat timing token_reserve", {
    stage: args.stage,
    ms: Math.round(performance.now() - reserveStartedAtMs),
    allowed: reservation?.allowed === true,
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
    const fetchStartedAtMs = performance.now();
    const response = await fetch(args.url, args.init);
    console.log("ai-chat timing provider_headers", {
      stage: args.stage,
      status: response.status,
      ms: Math.round(performance.now() - fetchStartedAtMs),
    });
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



function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}



async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson(value));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}



function cleanUuidOrNull(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}



async function updateAiChatRun(
  client: any,
  runId: string | null | undefined,
  values: Record<string, unknown>,
) {
  if (!runId) return null;
  const { data, error } = await client.rpc("ai_update_chat_run", {
    p_run_id: runId,
    p_status: values.status ?? null,
    p_assistant_message_id: values.assistant_message_id ?? null,
    p_model_provider: values.model_provider ?? null,
    p_model_name: values.model_name ?? null,
    p_error_code: values.error_code ?? null,
    p_error_message: values.error_message ?? null,
    p_metrics: values.metrics ?? {},
    p_mark_model_requested: values.mark_model_requested === true,
    p_mark_first_event: values.mark_first_event === true,
    p_mark_first_token: values.mark_first_token === true,
  });
  if (error) console.error("ai-chat run update failed", { run_id: runId, error: error.message });
  return data ?? null;
}



function publicRunError(error: unknown): {
  code: string;
  message: string;
  status?: number;
  retryable?: boolean;
  usage?: any;
} {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  if (error instanceof AiTokenLimitError) {
    return {
      code: error.code,
      message: error.message,
      status: 429,
      retryable: false,
      usage: error.usage ?? null,
    };
  }
  if (error instanceof AiTokenAccountingError) {
    return { code: error.code, message: "AI usage accounting is temporarily unavailable.", status: 503, retryable: true };
  }
  if (/abort|run_cancelled|run_not_active/i.test(message)) return { code: "cancelled", message: "The request was cancelled." };
  if (/artifact_busy/i.test(message)) {
    return { code: "artifact_busy", message: "That artifact is being updated. Please retry in a moment.", status: 409, retryable: true };
  }
  if (/artifact_save_timeout/i.test(message)) {
    return { code: "artifact_save_timeout", message: "Saving the artifact took too long. No overwrite was confirmed.", status: 504, retryable: true };
  }
  if (/timeout/i.test(message)) return { code: "deadline_exceeded", message: "The request took too long." };
  if (/revision_conflict|artifact_revision_conflict/i.test(message)) {
    // Not retryable at the chat/requeue layer — workers may do at most one
    // in-process version refresh. Blind retries stampede the connection pool.
    return { code: "artifact_revision_conflict", message: "The artifact changed while the AI was working.", status: 409, retryable: false };
  }
  if (/external_source_(unavailable|authentication_required)|private_source_unavailable/i.test(message)) {
    return {
      code: "external_source_unavailable",
      message: "I couldn't read that source. Upload the file, paste the relevant text, or provide a publicly accessible URL. No changes were saved.",
      status: 422,
      retryable: false,
    };
  }
  if (/artifact_build_start_failed/i.test(message)) {
    return {
      code: "artifact_build_start_failed",
      message: "I couldn't start the durable artifact build. No partial fallback content was saved.",
      status: 503,
      retryable: true,
    };
  }
  return { code: "ai_chat_failed", message: "The AI request could not be completed." };
}



const SUPABASE_URL = Deno.env.get("SUPABASE_URL");


const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");


const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");


const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");


const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");


const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");



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




function isImageAttachment(a: any) {
  return typeof a?.mime_type === "string" && a.mime_type.startsWith("image/");
}



async function signedImageUrl(supabaseService: any, filePath: string) {
    // Replace "attachments" with your actual Supabase Storage bucket name
const { data, error } = await supabaseService.storage
    .from("attachments")
    .createSignedUrl(filePath, 60 * 10);

  if (error || !data?.signedUrl) {
    throw new Error(`Could not sign image URL: ${error?.message ?? "unknown error"}`);
  }

  return data.signedUrl;
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


function scheduleThreadTitle(args: {
  threadId: string;
  authorization: string;
  requestText: string;
  force?: boolean;
}) {
  const promise = invokeJsonEdgeFunction(
    "ai-thread-title",
    {
      thread_id: args.threadId,
      source_text: args.requestText,
      force: args.force === true,
    },
    20000,
    args.authorization,
    null,
  ).catch((error) => {
    console.warn("ai-thread-title dispatch failed", {
      thread_id: args.threadId,
      error: error?.message ?? String(error),
    });
  });

  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(promise);
  else void promise;
}




// Attachment extraction moved to the source domain endpoint.



const DEFAULT_PROVIDER = "openai";



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


const OPENAI_MODEL_SMART = "gpt-5.5";


const OPENAI_MODEL_DEFAULT = OPENAI_MODEL_FAST;



// Placeholder Anthropic model ids. Confirm/update these when wiring the
// Anthropic executor; they are normal backend config, not Edge Function secrets.
const ANTHROPIC_MODEL_FAST = "claude-haiku";


const ANTHROPIC_MODEL_SMART = "claude-sonnet";


const ANTHROPIC_MODEL_DEFAULT = ANTHROPIC_MODEL_SMART;



const DEFAULT_MODEL = OPENAI_MODEL_DEFAULT;


const DEFAULT_TEMP = 0.7;



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
    provider: "openai",
    defaultMaxCompletionTokens: accounting.defaultMaxCompletionTokens,
  });
}


async function fetchOpenRouter(
  url: string,
  init: RequestInit = {},
  accounting: {
    quota?: AiTokenQuotaContext | null;
    stage: string;
    defaultMaxCompletionTokens?: number;
    tokenBased?: boolean;
  },
): Promise<Response> {
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
        // Do not force a provider max_tokens value. Models on OpenRouter expose
        // different output limits; quota reservation can remain conservative
        // without making otherwise compatible models ineligible.
        // OpenRouter includes usage automatically in the final streamed chunk.
        // Do not force deprecated usage/stream_options flags.
        delete parsed.stream_options;
        delete parsed.usage;
        nextInit.body = JSON.stringify(parsed);
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
    provider: "openrouter",
    defaultMaxCompletionTokens: accounting.defaultMaxCompletionTokens,
  });
}


const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_task_channels",
      description: "List channels configured for a task. Use only when the user explicitly asks to inspect channel configuration; artifact creation never requires a channel.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "integer" },
        },
        required: [],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "read_task",
      description: "Read one existing task by id. Use this when the user tagged a task or explicitly references a specific task.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "integer" },
        },
        required: ["task_id"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "read_tasks",
      description: "Read multiple existing tasks by id. Use this when the user tagged multiple tasks.",
      parameters: {
        type: "object",
        properties: {
          task_ids: {
            type: "array",
            items: { type: "integer" },
          },
        },
        required: ["task_ids"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "ai_create_project",
      description: "Create a new project and its owning team. The project name and team name are required; description and other project settings can be added later. This is a top-level creation operation and must not be redirected into the currently visible task or artifact.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          project_name: { type: "string" },
          team_name: { type: "string" },
          project_slug: { type: ["string", "null"], description: "Optional URL slug. Omit it to let the server create a unique slug." },
        },
        required: ["project_name", "team_name"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "read_project",
      description: "Read one existing project by id. Use this when the user tagged a project or explicitly references a specific project. Use `project_languages` as the source of truth for the project's languages.  The legacy `projects.languages` field may contain raw IDs only and should not be used to infer language names when `project_languages` is available. Includes brand_kit (colors, fonts, logo, design_description, design_templates) and brand_layout_templates. Brand layout templates live in Brand kit — not in artifacts or attachments.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "integer" },
        },
        required: ["project_id"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "extract_project_brand",
      description: "Extract and save a project's brand kit (colors, fonts, typography, spacing, logo) from a website URL using Firecrawl branding. Use when the user asks to extract/import/update brand identity for a named project (e.g. 'update the brand kit of project Articulate' or imperfect names like 'articulat'). Prefer project_name from the current or earlier conversation turns — do not require tags, thread project scope, or a tagged task. If a project was already identified earlier in this chat, reuse that project_name/project_id. The tool fuzzy-resolves visible projects by name server-side. If multiple/no confident matches, it returns candidates and you should ask for clarification. If url is omitted, uses the project's existing project_url. Prefer replace_all=false unless the user wants a full replace.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "integer",
            nullable: true,
            description: "Exact project id when already known from a previous tool result in this conversation.",
          },
          project_name: {
            type: "string",
            nullable: true,
            description: "Project name as said by the user in this or an earlier turn (including typos/abbreviations). Used to find the project without tags or thread scope.",
          },
          url: {
            type: "string",
            nullable: true,
            description: "Website URL to extract from. When provided, also updates the project's project_url. When omitted, uses the existing project_url.",
          },
          replace_all: {
            type: "boolean",
            nullable: true,
            description: "When true, discard existing brand overrides and replace the full kit. Default false.",
          },
        },
        required: [],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "read_projects",
      description: "Read multiple existing projects by id. Use this when the user tagged multiple projects. Use `project_languages` as the source of truth for the project's languages. The legacy `projects.languages` field may contain raw IDs only and should not be used to infer language names when `project_languages` is available.",
      parameters: {
        type: "object",
        properties: {
          project_ids: {
            type: "array",
            items: { type: "integer" },
          },
        },
        required: ["project_ids"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "list_visible_projects",
      description: "List projects the current user can access. Use this for questions like 'other projects', 'which projects do I have access to', 'show projects', or to compare the current project with other visible projects.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", nullable: true },
          query: { type: "string", nullable: true },
          exclude_project_ids: {
            type: "array",
            items: { type: "integer" },
            nullable: true,
          },
        },
        required: [],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "read_user",
      description: "Read one existing user by id.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "integer" },
        },
        required: ["user_id"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "read_users",
      description: "Read multiple existing users by id.",
      parameters: {
        type: "object",
        properties: {
          user_ids: {
            type: "array",
            items: { type: "integer" },
          },
        },
        required: ["user_ids"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "list_visible_users",
      description: "List users the current user can see. Use this for questions about the team, who is available, or to find a user by name.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", nullable: true },
          query: { type: "string", nullable: true },
        },
        required: [],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "list_user_projects",
      description: "List projects assigned to a known user. Use this after identifying a user when the user asks about that person's projects.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "integer" },
          limit: { type: "integer", nullable: true },
        },
        required: ["user_id"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "list_user_tasks",
      description: "List tasks assigned to a known user. Use this after identifying a user when the user asks about that person's tasks.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "integer" },
          limit: { type: "integer", nullable: true },
        },
        required: ["user_id"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "list_project_tasks",
      description: "Read tasks from one exact project with server-side status filtering and pagination when the user wants to inspect or discuss the list. Use this to inspect project tasks. New artifact builds should receive exact selected task ids in ai_start_artifact_build; the autonomous task-selector loop can select subsequent tasks without making channels or planning templates the persistence model.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          project_id: { type: "integer" },
          status_names: {
            type: ["array", "null"],
            items: { type: "string" },
            description: "Optional exact status names selected semantically from the user's request, for example ['Not started']. Matching is case-insensitive.",
          },
          status_filter: {
            type: ["array", "null"],
            items: { type: "string" },
            description: "Backward-compatible alias for status_names. Prefer status_names plus include_null_status.",
          },
          include_null_status: {
            type: ["boolean", "null"],
            description: "Include tasks whose status is null or blank when the request includes tasks with no status.",
          },
          limit: { type: ["integer", "null"], minimum: 1, maximum: 200 },
          offset: { type: ["integer", "null"], minimum: 0 },
        },
        required: ["project_id"],
      },
    },
  },

  {
  type: "function",
  function: {
    name: "search_tasks",
    description: "Search tasks across workspace",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" }
      }
    }
  }
},

  {
  type: "function",
  function: {
    name: "search_mentions",
    description: "Search messages/mentions",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" }
      }
    }
  }
},

  {
    type: "function",
    function: {
      name: "read_user_occupation_summary",
      description: "Read occupation summary stats for a known user.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "integer" },
        },
        required: ["user_id"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "read_user_occupation",
      description: "Read daily occupation history for a known user.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "integer" },
          limit: { type: "integer", nullable: true },
        },
        required: ["user_id"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "read_user_backlog",
      description: "Read backlog summary for a known user.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "integer" },
        },
        required: ["user_id"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "list_visible_users_occupation_today",
      description: "List visible users with today's occupation so the assistant can compare who is freer today.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", nullable: true },
          query: { type: "string", nullable: true },
        },
        required: [],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "read_public_webpage",
      description: "Read a public webpage or public URL. Use this to browse a project website (from project_url via read_project), blog indexes, and individual pages for research, linkbuilding, or grounding. For internal linkbuilding, discover opportunities yourself by reading the project site and relevant blog posts with this tool — do not ask the user for URLs until browsing fails.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
        },
        required: ["url"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "keyword_research",
      description: "Look up keyword search demand and SEO metrics using the keyword research tool. Use this when the user asks whether a keyword has many searches, wants keyword ideas, wants SEO-oriented topic suggestions, or asks for ideas for SEO-heavy content formats such as blog posts, articles, landing pages, service pages, category pages, pillar pages, or website copy. In those SEO-heavy content requests, call this tool before drafting suggestions so the recommendations are grounded in real keyword opportunities. When the user gives only one broad topic, you should still use this tool and then rely on the returned related keyword ideas to shape the answer. Do not stop at generic content ideas if the tool returned keyword opportunities. For multiple keywords, pass them all in keywords.",
      parameters: {
        type: "object",
        properties: {
          keywords: { type: "array", items: { type: "string" } },
          regionId: { type: "string", nullable: true },
          languageId: { type: "string", nullable: true },
          pageSize: { type: "integer", nullable: true },
        },
        required: ["keywords"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "google_top_results",
      description: "Fetch the first Google results for a keyword or query. Use this when the user asks what appears first in Google for a keyword, topic, or search phrase.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          regionId: { type: "string", nullable: true },
          languageId: { type: "string", nullable: true },
        },
        required: ["query"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "list_project_social_profiles",
      description: "List the brand and competitor social profiles linked on a project (network + profile URL + last sync). Use when the user asks which social accounts are tracked for a brand/client or its competitors, or before reading social stats.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "integer",
            nullable: true,
            description: "Exact project id when already known.",
          },
          project_name: {
            type: "string",
            nullable: true,
            description: "Project/brand name as said by the user (e.g. JCDecaux). Fuzzy-resolved among visible projects.",
          },
        },
        required: [],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "read_project_social_stats",
      description: "Read competitive social media statistics for a project's owned brand and its competitors (posts, interactions, impressions/views, followers, share of voice, optional timeseries). Use when the user asks about social performance, follower counts, engagement, competitor social comparison, or Competition-tab metrics. Resolve the project by project_id or project_name.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "integer",
            nullable: true,
            description: "Exact project id when already known.",
          },
          project_name: {
            type: "string",
            nullable: true,
            description: "Project/brand name as said by the user (e.g. JCDecaux). Fuzzy-resolved among visible projects.",
          },
          date_from: {
            type: "string",
            nullable: true,
            description: "Inclusive period start (ISO date or datetime). Defaults to last 30 days when omitted with date_to.",
          },
          date_to: {
            type: "string",
            nullable: true,
            description: "Inclusive period end (ISO date or datetime). Defaults to today when omitted with date_from.",
          },
          networks: {
            type: "array",
            nullable: true,
            items: {
              type: "string",
              enum: ["linkedin", "instagram", "facebook", "youtube", "tiktok", "x"],
            },
            description: "Optional network filter. Omit for all linked networks.",
          },
          include_timeseries: {
            type: "boolean",
            nullable: true,
            description: "When true, include daily post/follower timeseries points (can be large). Default false — entity totals are enough for most answers.",
          },
          include_top_posts: {
            type: "boolean",
            nullable: true,
            description: "When true, include each entity's top posts. Default false.",
          },
        },
        required: [],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "list_publishing_destinations",
      description: "List publishing destinations available to the user (external websites/CMS destinations for agentic publishing), including destination memory (guidance + entry points). Use before publish_content or configure_publishing_destination to resolve existing candidates. A missing destination is a solvable dependency — do NOT tell the user to configure settings manually; call configure_publishing_destination when you have enough platform/URL information.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "integer", nullable: true, description: "Optional project scope. When omitted, returns personal/owner destinations plus project destinations when project context is known." },
        },
        required: [],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "configure_publishing_destination",
      description: "Create or update a publishing destination conversationally (e.g. user says “Squarespace, account.squarespace.com”). Normalizes URLs, infers a display name, avoids duplicates, can start browser connection/authentication, and can immediately continue a pending publication via pending_publication. Never send the user to Project Settings just because a destination row is missing.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "integer", nullable: true },
          project_name: { type: "string", nullable: true, description: "Project/brand display name for naming + discovery hints (e.g. Articulate)." },
          destination_id: { type: "string", nullable: true, description: "Update an existing destination when known." },
          name: { type: "string", nullable: true, description: "Optional display name. When omitted, inferred from project + platform." },
          service_or_platform: { type: "string", nullable: true, description: "e.g. Squarespace, WordPress, Mailchimp." },
          start_url: { type: "string", nullable: true, description: "Publishing/login URL. Bare hosts like account.squarespace.com are accepted." },
          purpose: { type: "string", nullable: true },
          content_type: { type: "string", nullable: true, description: "article | newsletter | social_post | landing_page | other" },
          guidance: { type: "string", nullable: true },
          connect: { type: "boolean", nullable: true, description: "Start browser connection when not connected. Defaults true unless pending_publication is provided (publication starts auth itself)." },
          pending_publication: {
            type: "object",
            nullable: true,
            description: "When configuring as a dependency of publishing, include the original publish payload so publication starts immediately after destination setup/auth.",
            properties: {
              artifact_id: { type: "string", nullable: true },
              publish_mode: { type: "string", enum: ["now", "scheduled"], nullable: true },
              scheduled_at: { type: "string", nullable: true },
              timezone: { type: "string", nullable: true },
              content: {
                type: "object",
                nullable: true,
                properties: {
                  type: { type: "string", nullable: true },
                  title: { type: "string", nullable: true },
                  body: { type: "string", nullable: true },
                  excerpt: { type: "string", nullable: true },
                  seo: { type: "object", nullable: true },
                  media: { type: "array", nullable: true, items: { type: "object" } },
                  metadata: { type: "object", nullable: true },
                },
              },
            },
          },
        },
        required: [],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "publish_content",
      description: "Start publishing content now OR schedule it for later via the Publishing Engine. Supports publish_mode=now|scheduled. For scheduling, resolve natural-language times into an ISO-8601 timestamptz using the user's timezone (pass timezone as IANA, e.g. Europe/Lisbon). Ask only when the date/time is genuinely ambiguous. Artifact is optional — pass artifact_id OR structured content. Resolve destinations semantically via list_publishing_destinations. If none exist but the user provided a platform/URL, call configure_publishing_destination (with pending_publication) instead of refusing.",
      parameters: {
        type: "object",
        properties: {
          destination_id: { type: "string", description: "UUID of the publishing destination from list_publishing_destinations." },
          artifact_id: { type: "string", nullable: true, description: "Optional artifact UUID to publish." },
          project_id: { type: "integer", nullable: true },
          publish_mode: {
            type: "string",
            enum: ["now", "scheduled"],
            nullable: true,
            description: "Defaults to now. Use scheduled when the user asks to publish later.",
          },
          scheduled_at: {
            type: "string",
            nullable: true,
            description: "Required when publish_mode=scheduled. Absolute ISO-8601 / RFC3339 timestamp (UTC or offset).",
          },
          timezone: {
            type: "string",
            nullable: true,
            description: "IANA timezone used to interpret/display the schedule (e.g. Europe/Lisbon).",
          },
          content: {
            type: "object",
            nullable: true,
            description: "Inline content when no artifact exists.",
            properties: {
              type: { type: "string", nullable: true },
              title: { type: "string", nullable: true },
              body: { type: "string", nullable: true },
              excerpt: { type: "string", nullable: true },
              seo: {
                type: "object",
                nullable: true,
                properties: {
                  title: { type: "string", nullable: true },
                  description: { type: "string", nullable: true },
                },
              },
              media: { type: "array", nullable: true, items: { type: "object" } },
              metadata: { type: "object", nullable: true },
            },
          },
        },
        required: ["destination_id"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "list_scheduled_publications",
      description: "List one-time scheduled publications for the user (status=scheduled). Use before reschedule/cancel/publish-now so you can resolve the intended item semantically.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "integer", nullable: true },
        },
        required: [],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "reschedule_publication",
      description: "Change scheduled_at for an internally scheduled publication that has not executed yet. Resolve the target via list_scheduled_publications. External/native schedules cannot be changed with this tool alone.",
      parameters: {
        type: "object",
        properties: {
          publication_run_id: { type: "string" },
          scheduled_at: { type: "string", description: "New ISO-8601 timestamptz." },
          timezone: { type: "string", nullable: true },
        },
        required: ["publication_run_id", "scheduled_at"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "cancel_scheduled_publication",
      description: "Cancel a scheduled publication. Internal schedules cancel locally. External/native schedules require explicit user confirmation then confirm_external_cancel=true.",
      parameters: {
        type: "object",
        properties: {
          publication_run_id: { type: "string" },
          confirm_external_cancel: {
            type: "boolean",
            nullable: true,
            description: "Set true only after the user explicitly confirms cancelling an external native schedule.",
          },
        },
        required: ["publication_run_id"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "publish_scheduled_now",
      description: "Execute an internally scheduled publication immediately instead of waiting for the scheduled time.",
      parameters: {
        type: "object",
        properties: {
          publication_run_id: { type: "string" },
        },
        required: ["publication_run_id"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "get_publication_state",
      description: "Read the active publication run state for the current user/thread (or a specific publication_run_id). Use when the user refers to an ongoing publication (“continue”, “what’s happening”, “stop”, “publish it now”) without naming an ID. Surfaces needs_user questions and awaiting_publish_confirmation.",
      parameters: {
        type: "object",
        properties: {
          publication_run_id: { type: "string", nullable: true, description: "Optional specific run UUID. When omitted, returns active runs for this user/thread." },
          active_only: { type: "boolean", nullable: true },
          project_id: { type: "integer", nullable: true },
        },
        required: [],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "continue_publication",
      description: "Resume an active publication after user input (or after the user answered a browser-agent clarification in chat). Pass the user's natural-language instruction. Do not invent browser selectors.",
      parameters: {
        type: "object",
        properties: {
          publication_run_id: { type: "string", description: "UUID of the active publication run." },
          instruction: { type: "string", nullable: true, description: "User instruction for the publishing agent (e.g. “use Blog”)." },
        },
        required: ["publication_run_id"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "confirm_publication",
      description: "Confirm the final irreversible publish/send for a run that is awaiting_publish_confirmation. Only call when the user explicitly confirms publishing that specific run (e.g. “publish it”, “yes publish”). Do not treat unrelated conversation as confirmation.",
      parameters: {
        type: "object",
        properties: {
          publication_run_id: { type: "string" },
        },
        required: ["publication_run_id"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "cancel_publication",
      description: "Cancel an active publication run when the user asks to stop/cancel it.",
      parameters: {
        type: "object",
        properties: {
          publication_run_id: { type: "string" },
        },
        required: ["publication_run_id"],
      },
    },
  },

  {
  type: "function",
  function: {
    name: "ai_update_project_fields",
    description: "Update editable project setup fields such as description, goal, target audience, targets, deliverables, editorial line, topics, sectors, creation mode, and plan mode. Use this to quickly set up or refine a project. Read the project first if the target project is unclear.",
    parameters: {
      type: "object",
      properties: {
        project_id: { type: "integer", nullable: true },
        description: { type: "string", nullable: true },
        goal: { type: "string", nullable: true },
        target_audience: { type: "string", nullable: true },
        targets: { type: "string", nullable: true },
        deliverables: { type: "string", nullable: true },
        editorial_line: { type: "string", nullable: true },
        topics: { type: "array", items: { type: "string" }, nullable: true },
        sectors: { type: "array", items: { type: "string" }, nullable: true },
        creation_mode: {
          type: "string",
          enum: ["autopilot", "human_loop", "manual"],
          nullable: true,
        },
        plan_mode: {
          type: "string",
          enum: ["autopilot", "human_loop", "manual"],
          nullable: true,
        },
      },
      required: [],
    },
  },
},

  {
    type: "function",
    function: {
      name: "ai_create_task",
      description: "Create a new task when the user asks for one. Gather the needed details if they are missing, then create it directly.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          project_id: { type: "integer", nullable: true },
          assigned_to_id: { type: "integer", nullable: true },
          delivery_date: { type: "string", nullable: true, description: "YYYY-MM-DD. Omit or pass null if unknown; never pass an empty string." },
          publication_date: { type: "string", nullable: true, description: "YYYY-MM-DD. Omit or pass null if unknown; never pass an empty string." },
          briefing: { type: "string", nullable: true },
          notes: { type: "string", nullable: true },
          language_id: { type: "integer", nullable: true },
          language: { type: "string", nullable: true },
          language_code: { type: "string", nullable: true },
          content_type_id: { type: "integer", nullable: true },
          content_type: { type: "string", nullable: true },
          production_type_id: { type: "integer", nullable: true },
          production_type: { type: "string", nullable: true },
          project_status_id: { type: "integer", nullable: true },
          project_status: { type: "string", nullable: true },
          channel_ids: { type: "array", items: { type: "integer" }, nullable: true },
          watcher_user_ids: { type: "array", items: { type: "integer" }, nullable: true },
          keyword: {
            type: ["string", "null"],
            description: "Primary SEO keyword for the task. Shared across every artifact under this task regardless of channel, content type or language.",
          },
          secondary_keywords: {
            type: ["string", "null"],
            description: "Secondary SEO keywords for the task (comma/semicolon-separated). Shared across every artifact under this task.",
          },
        },
        required: ["title"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "ai_update_task_fields",
      description: "Update fields on an existing task. Use this when the user asks to set/change delivery dates, publication dates, assignees, language, content type, production type, project status, briefing, notes, or similar fields for tasks that already exist. Never call ai_create_task to update an existing task. If the task id is unknown, provide the user’s task reference and project_id; the backend resolves it semantically against visible tasks.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "integer", nullable: true, description: "Existing task id. Preferred when known." },
          title: { type: "string", nullable: true, description: "User-provided task reference, used only to resolve the existing task when task_id is unknown." },
          new_title: { type: "string", nullable: true, description: "New task title. Use title only for lookup and new_title for the replacement value." },
          project_id: { type: "integer", nullable: true, description: "Project id for title-based lookup." },
          assigned_to_id: { type: "integer", nullable: true },
          assigned_to: { type: "string", nullable: true, description: "Imperfect assignee reference from the user, such as a first name. The server resolves it against visible users." },
          assignee: { type: "string", nullable: true, description: "Alias of assigned_to." },
          owner: { type: "string", nullable: true, description: "Alias of assigned_to when the user says owner." },
          delivery_date: { type: "string", nullable: true, description: "YYYY-MM-DD, or null to clear." },
          publication_date: { type: "string", nullable: true, description: "YYYY-MM-DD, or null to clear." },
          language_id: { type: "integer", nullable: true },
          language: { type: "string", nullable: true, description: "Language name or code, e.g. English or en." },
          language_code: { type: "string", nullable: true },
          content_type_id: { type: "integer", nullable: true },
          content_type: { type: "string", nullable: true, description: "Content type name/title, e.g. artigo." },
          production_type_id: { type: "integer", nullable: true },
          production_type: { type: "string", nullable: true, description: "Production type name/title, e.g. novo." },
          project_status_id: { type: "integer", nullable: true },
          project_status: { type: "string", nullable: true },
          keyword: { type: "string", nullable: true, description: "Primary SEO keyword for the task (task-level; shared by all artifacts under the task)." },
          meta_title: { type: "string", nullable: true },
          meta_description: { type: "string", nullable: true },
          h1: { type: "string", nullable: true },
          h2: { type: "string", nullable: true },
          alt_text: { type: "string", nullable: true },
          filename: { type: "string", nullable: true },
          internal_links: { type: "string", nullable: true },
          tags: { type: "string", nullable: true },
          category: { type: "string", nullable: true },
          secondary_keywords: { type: "string", nullable: true, description: "Secondary SEO keywords for the task (task-level; shared by all artifacts)." },
          source_urls: { type: "array", items: { type: "string" }, nullable: true },
          briefing: { type: "string", nullable: true },
          notes: { type: "string", nullable: true },
        },
        required: [],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "ai_bulk_update_project_tasks_fields",
      description: "Bulk update metadata fields on existing tasks in a project. Use this for requests like ‘set all these articles in project X to language English, production type Novo, content type Artigo’. This updates task fields only; it never writes artifact content.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "integer", nullable: true },
          task_ids: { type: "array", items: { type: "integer" }, nullable: true, description: "Optional explicit task ids. If omitted, updates project tasks selected by task_filter or the full project scope." },
          task_filter: {
            type: "object",
            nullable: true,
            additionalProperties: false,
            description: "Structured factual task selector produced by the semantic request planner. Never infer this from literal keywords inside the tool handler.",
            properties: {
              match: { type: "string", enum: ["all"] },
              conditions: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    field: { type: "string", enum: ["project_status_id", "assigned_to_id", "language_id", "content_type_id", "production_type_id", "delivery_date", "publication_date"] },
                    operator: { type: "string", enum: ["is_empty", "is_not_empty", "equals", "not_equals"] },
                    value: { type: ["integer", "string", "null"] },
                  },
                  required: ["field", "operator", "value"],
                },
              },
            },
            required: ["match", "conditions"],
          },
          only_if_empty: { type: "boolean", nullable: true, description: "When true, preserve non-empty values. The semantic planner decides this from the complete user request." },
          assigned_to_id: { type: "integer", nullable: true },
          delivery_date: { type: "string", nullable: true },
          publication_date: { type: "string", nullable: true },
          language_id: { type: "integer", nullable: true },
          language: { type: "string", nullable: true },
          language_code: { type: "string", nullable: true },
          content_type_id: { type: "integer", nullable: true },
          content_type: { type: "string", nullable: true },
          production_type_id: { type: "integer", nullable: true },
          production_type: { type: "string", nullable: true },
          project_status_id: { type: "integer", nullable: true },
          project_status: { type: "string", nullable: true },
          briefing: { type: "string", nullable: true },
          notes: { type: "string", nullable: true }
        },
        required: [],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "ai_manage_watchers",
      description: "Read or replace project/task watchers. For set, pass the full desired watcher_user_ids list.",
      parameters: { type: "object", additionalProperties: false, properties: {
        entity_type: { type: "string", enum: ["project", "task"] },
        action: { type: "string", enum: ["read", "candidates", "set"] },
        project_id: { type: ["integer", "null"] }, task_id: { type: ["integer", "null"] },
        watcher_user_ids: { type: ["array", "null"], items: { type: "integer" } },
      }, required: ["entity_type", "action"] },
    },
  },

  {
    type: "function",
    function: {
      name: "ai_update_project_configuration",
      description: "Update project fields and optionally replace project languages, channels, content types, keywords, and watchers. Only include sections the user explicitly asked to change.",
      parameters: { type: "object", additionalProperties: true, properties: {
        project_id: { type: "integer" }, name: { type: ["string", "null"] }, description: { type: ["string", "null"] },
        goal: { type: ["string", "null"] }, target_audience: { type: ["string", "null"] },
        targets: { type: ["string", "null"] }, deliverables: { type: ["string", "null"] },
        editorial_line: { type: ["string", "null"] }, topics: { type: ["array", "null"], items: { type: "string" } },
        sectors: { type: ["array", "null"], items: { type: "string" } },
        language_ids: { type: ["array", "null"], items: { type: "integer" } },
        primary_language_id: { type: ["integer", "null"] },
        channels: { type: ["array", "null"], items: { type: "object", properties: {
          channel_id: { type: "integer" }, is_enabled: { type: ["boolean", "null"] },
          is_default: { type: ["boolean", "null"] }, position: { type: ["integer", "null"] },
        }, required: ["channel_id"] } },
        content_types: { type: ["array", "null"], items: { type: "object", properties: {
          content_type_id: { type: "integer" }, seo_required: { type: ["boolean", "null"] },
        }, required: ["content_type_id"] } },
        keywords: { type: ["array", "null"], items: { type: "object", properties: {
          keyword: { type: "string" }, language_code: { type: ["string", "null"] }, region_code: { type: ["string", "null"] },
        }, required: ["keyword"] } },
        watcher_user_ids: { type: ["array", "null"], items: { type: "integer" } },
      }, required: ["project_id"] },
    },
  },

  {
    type: "function",
    function: {
      name: "ai_manage_task_channels",
      description: "Attach, remove, or replace the channel configuration for one task. This changes task metadata only and does not affect artifacts.",
      parameters: { type: "object", additionalProperties: false, properties: {
        task_id: { type: "integer" }, action: { type: "string", enum: ["attach", "remove", "replace"] },
        channel_ids: { type: "array", items: { type: "integer" } },
      }, required: ["task_id", "action", "channel_ids"] },
    },
  },

  {
    type: "function",
    function: {
      name: "ai_manage_project_templates",
      description: "Create, update, or delete a reusable planning template in the project library. Templates guide artifact planning and are not output records.",
      parameters: { type: "object", additionalProperties: true, properties: {
        project_id: { type: "integer" }, action: { type: "string", enum: ["create", "update", "delete"] },
        template_id: { type: ["integer", "null"] },
        title: { type: ["string", "null"] }, description: { type: ["string", "null"] }, rules: { type: ["object", "null"] },
      }, required: ["project_id", "action"] },
    },
  },

  {
    type: "function",
    function: {
      name: "ai_duplicate_task",
      description: "Duplicate one task into a target project with its task fields, channels, and optional watchers. Artifact copying is a separate artifact operation.",
      parameters: { type: "object", additionalProperties: false, properties: {
        source_task_id: { type: "integer" }, target_project_id: { type: "integer" }, title: { type: "string" },
        include_watchers: { type: ["boolean", "null"] },
      }, required: ["source_task_id", "target_project_id", "title"] },
    },
  },

  {
    type: "function",
    function: {
      name: "ai_bulk_create_tasks",
      description: "Create multiple tasks, potentially across projects. Each item may include channels and watchers.",
      parameters: { type: "object", additionalProperties: false, properties: {
        tasks: { type: "array", items: { type: "object", additionalProperties: true, properties: {
          project_id: { type: "integer" }, title: { type: "string" }, briefing: { type: ["string", "null"] },
          assigned_to_id: { type: ["integer", "null"] }, content_type_id: { type: ["integer", "null"] },
          production_type_id: { type: ["integer", "null"] }, language_id: { type: ["integer", "null"] },
          project_status_id: { type: ["integer", "null"] }, delivery_date: { type: ["string", "null"] },
          publication_date: { type: ["string", "null"] }, channel_ids: { type: ["array", "null"], items: { type: "integer" } },
          watcher_user_ids: { type: ["array", "null"], items: { type: "integer" } },
        }, required: ["project_id", "title"] } },
      }, required: ["tasks"] },
    },
  },

  {
    type: "function",
    function: {
      name: "read_attachments",
      description: "List task or project attachments as source context. The run must already authorize the owning task/project.",
      parameters: { type: "object", additionalProperties: false, properties: {
        entity_type: { type: "string", enum: ["task", "project"] }, entity_id: { type: "integer" },
      }, required: ["entity_type", "entity_id"] },
    },
  },

  {
    type: "function",
    function: {
      name: "ai_request_clarification",
      description: "Ask one structured clarification question when execution is blocked by missing user input. Options may be generated for any decision and are not limited to database entities. Preserve server-provided option ids and values when a prior tool returned grounded candidates.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: { type: "string", description: "Ask in the same language as the user's current request." },
          options: {
            type: "array",
            maxItems: 50,
            items: {
              type: "object",
              additionalProperties: true,
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                description: { type: ["string", "null"] },
                value: {},
                kind: { type: ["string", "null"] },
                entity_ref: { type: ["object", "null"], additionalProperties: true },
                recommended: { type: "boolean" },
                disabled: { type: "boolean" },
              },
              required: ["id", "label"],
            },
          },
          allow_multiple: { type: "boolean" },
          min_selections: { type: ["integer", "null"] },
          max_selections: { type: ["integer", "null"] },
          allow_free_text: { type: "boolean" },
          target_scope: { type: ["string", "null"] },
        },
        required: ["question", "options", "allow_multiple", "allow_free_text"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "ai_list_task_artifacts",
      description: "Read the artifact workspace for one exact task. Artifacts are independent deliverables; channel and language are optional metadata, not identity keys.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          task_id: { type: "integer" },
          include_content: { type: "boolean" },
          limit: { type: "integer", minimum: 1, maximum: 500 },
        },
        required: ["task_id"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "ai_list_project_artifacts",
      description: "List artifacts owned directly by one project, including documents or media that are not attached to a task.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          project_id: { type: "integer" },
          include_content: { type: "boolean" },
          limit: { type: "integer", minimum: 1, maximum: 500 },
        },
        required: ["project_id"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "ai_read_artifact",
      description: "Read one exact task artifact and optionally one historical version. Use only artifact ids returned by factual context or a prior artifact listing.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          artifact_id: { type: "string" },
          version_number: { type: ["integer", "null"] },
          content_mode: { type: "string", enum: ["full", "summary"], description: "Use full for an explicit read or download request; summary for navigation." },
        },
        required: ["artifact_id"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "ai_list_ai_thread_artifacts",
      description: "List artifacts created in the current AI chat, including documents and media that are not yet attached to a task.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: { include_content: { type: "boolean" }, limit: { type: "integer", minimum: 1, maximum: 500 } },
        required: [],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "ai_search_artifacts",
      description: "Search artifacts the user can already see across tasks, projects and AI chats (including deliverables created in another thread). Use when the user names/refers to an existing document or media deliverable and you need its artifact_id before updating or deciding to create. Prefer ai_list_task_artifacts / ai_list_project_artifacts / ai_list_ai_thread_artifacts when that exact scope is already known. Returns ranked matches with app_link; then use ai_read_artifact or ai_start_artifact_build operation=update with the returned id.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: {
            type: "string",
            description: "Title or distinctive phrase from the deliverable (e.g. brand + topic). Minimum 2 characters.",
          },
          limit: { type: "integer", minimum: 1, maximum: 50 },
          task_id: { type: ["integer", "null"], description: "Optional: narrow to one task." },
          project_id: { type: ["integer", "null"], description: "Optional: narrow to one project (includes task-owned artifacts in that project)." },
          ai_thread_id: { type: ["string", "null"], description: "Optional: narrow to one AI thread's owned artifacts." },
          artifact_types: {
            type: ["array", "null"],
            items: { type: "string" },
            description: "Optional artifact_type filters (e.g. document, image).",
          },
        },
        required: ["query"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "ai_attach_artifact_to_task",
      description: "Attach an existing chat-owned artifact to one exact authorized task. The artifact keeps its origin chat and version history.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          artifact_id: { type: "string" }, task_id: { type: "integer" },
          channel_id: { type: ["integer", "null"] }, language_id: { type: ["integer", "null"] },
        },
        required: ["artifact_id", "task_id"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "ai_start_artifact_build",
      description: "Start a durable, cancellable and parallel artifact build when the user needs a lasting workspace deliverable (not for every chat answer). Decide the minimum useful number of artifacts for the current mission — zero is valid when a chat reply is enough. Keep one deliverable in one artifact; use separate artifacts when format, language, channel, source dependency, approval or publication lifecycle differs. Do not split article sections into separate artifacts. To improve/rewrite an existing tagged artifact, set artifact_id + operation=update and leave source_artifact_id/source_handle null (in-place new version). Only set source_* when creating a DIFFERENT derived artifact. Existing channels/languages are optional artifact metadata. Add a concise metadata.reason for each artifact so the live build monitor can show why it was created separately. A chat-owned artifact may have task_id=null and can later be attached with ai_attach_artifact_to_task. The backend creates exact artifact identities, dependencies, versions and work units.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          request_text: { type: "string" },
          shared_context: { type: ["string", "null"] },
          project_name: { type: ["string", "null"], description: "Optional project/brand name mentioned by the user (e.g. Articulate). Backend fuzzy-resolves a visible project and attaches project_id for creates when no task owner is set, so brand_kit can drive media." },
          concurrency_limit: { type: "integer", minimum: 1, maximum: 8 },
          artifacts: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                handle: { type: "string", description: "Unique mission-local handle such as article_en or video_script_pt." },
                task_id: { type: ["integer", "null"], description: "Optional task owner for creates. When the user asks to generate/update a deliverable for a specific task you resolved (read_task/search_tasks), you MUST pass that task_id — @-tags are not required. For operation=update with artifact_id, omit — ownership is resolved from the existing artifact. Do NOT invent a task_id from an unrelated open pane when the request is about a different named task." },
                project_id: { type: ["integer", "null"], description: "Optional project owner for creates when the artifact should not belong to a task. When the user names a brand/client, pass the project_id from read_project (or project_name) so brand_kit is used. For operation=update with artifact_id, omit ambient thread/project scope project_id (causes artifact_target_not_in_project on task-owned artifacts)." },
                project_name: { type: ["string", "null"], description: "Optional project/brand name for creates when project_id is unknown; backend resolves a visible project." },
                artifact_id: { type: ["string", "null"], description: "Exact existing artifact UUID for an in-place update; null for creation. When set with operation=update, do not also set source_artifact_id/source_handle to the same artifact." },
                operation: { type: "string", enum: ["create", "update", "translate", "adapt", "transcribe", "summarize", "merge", "generate"] },
                artifact_type: { type: "string", description: "Examples: article, script, caption, transcript, research, document, image, images, article_with_images, carousel, presentation, video. For social copy + carousel/slide SCRIPT (headlines and captions only), use document or caption — not carousel. Use carousel/presentation only when the user asks to GENERATE visual slide images/assets. Use image/images/video for pure media generation. Set media_items only when visuals must be generated now." },
                artifact_role: { type: ["string", "null"] },
                title: { type: "string", description: "Concise editorial deliverable title, never the raw user command." },
                channel_id: { type: ["integer", "null"] },
                language_id: { type: ["integer", "null"] },
                source_artifact_id: { type: ["string", "null"], description: "Different parent artifact UUID when deriving a NEW artifact. For in-place updates of an existing artifact_id, leave null — never set this to the same artifact being updated." },
                source_ids: { type: ["array", "null"], items: { type: "string" }, description: "Optional input source ids to use for this artifact." },
                source_version_number: { type: ["integer", "null"] },
                source_handle: { type: ["string", "null"], description: "Mission-local handle of a DIFFERENT artifact in this plan to derive from. Never equal to this artifact's own handle. For in-place updates, leave null." },
                derivation_type: { type: ["string", "null"], description: "Examples: translated_from, adapted_from, generated_from, transcribed_from." },
                depends_on_handles: { type: "array", items: { type: "string" } },
                instruction: { type: "string" },
                priority: { type: "integer" },
                metadata: { type: "object", additionalProperties: true },
                selection: { type: ["object", "null"], additionalProperties: true, description: "Optional text/block/image/video selection as factual context (not a write lock). Prefer copying SELECTED ARTIFACT CONTEXT fields (selected_text, selection_before, selection_after, selection_start, selection_end). Do not reduce it to text_range alone. The worker receives the full artifact and may edit elsewhere for coherence." },
                media_items: { type: ["array", "null"], maxItems: 12, items: { type: "object", additionalProperties: true }, description: "Optional explicit image/video asset plan; otherwise the media worker plans the minimum useful set." },
              },
              required: ["handle", "operation", "artifact_type", "title", "instruction"],
            },
          },
        },
        required: ["request_text", "artifacts"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "ai_get_artifact_build",
      description: "Read the durable status, artifact work units and sequenced events for one known build id.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          build_id: { type: "string" },
          after_sequence: { type: "integer" },
        },
        required: ["build_id"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "ai_cancel_artifact_build",
      description: "Cancel one known durable build and prevent any further artifact saves.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          build_id: { type: "string" },
          reason: { type: ["string", "null"] },
        },
        required: ["build_id"],
      },
    },
  },

  {
  type: "function",
  function: {
    name: "ai_list_artifact_versions",
    description: "List immutable versions for one exact artifact. Use this when the user asks about history, previous drafts, changes, or rollback options.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        artifact_id: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
        offset: { type: "integer", minimum: 0 }
      },
      required: ["artifact_id"]
    }
  }
},
{
  type: "function",
  function: {
    name: "ai_restore_artifact_version",
    description: "Restore one exact historical artifact version by appending a new current version. Never overwrite or delete the historical version.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        artifact_id: { type: "string" },
        version_number: { type: "integer", minimum: 1 },
        change_summary: { type: ["string", "null"] }
      },
      required: ["artifact_id", "version_number"]
    }
  }
},

  {
    type: "function",
    function: {
      name: "ai_create_source",
      description: "Create an input source from a URL, uploaded attachment, pasted text, note, dataset or reference. A source may be scoped to a task, project or AI thread, or remain unattached. Sources are inputs; artifacts are outputs.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          source_type: { type: "string", enum: ["url","file","pasted_text","web_research","task_reference","artifact_reference","note","dataset","other"] },
          title: { type: "string" },
          task_id: { type: ["integer","null"] },
          project_id: { type: ["integer","null"] },
          ai_thread_id: { type: ["string","null"] },
          source_url: { type: ["string","null"] },
          attachment_id: { type: ["string","null"] },
          content_text: { type: ["string","null"] },
          content_json: { type: ["object","null"], additionalProperties: true },
          metadata: { type: ["object","null"], additionalProperties: true },
          fetch_url_now: { type: ["boolean","null"] },
          unattached: { type: ["boolean","null"], description: "When true, keep this source in the user's unattached source workspace instead of attaching it to the current AI thread." }
        },
        required: ["source_type","title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ai_list_sources",
      description: "List input sources in a task, project, AI thread, or the user's unattached source workspace. Returns summaries; call ai_read_source for full content.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          task_id: { type: ["integer","null"] },
          project_id: { type: ["integer","null"] },
          ai_thread_id: { type: ["string","null"] },
          unattached_only: { type: ["boolean","null"] },
          limit: { type: ["integer","null"] },
          offset: { type: ["integer","null"] }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ai_read_source",
      description: "Read one source and its canonical extracted or pasted content. A source may point to an original URL or attachment.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          source_id: { type: "string" },
          version_number: { type: ["integer","null"] }
        },
        required: ["source_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ai_attach_source_scope",
      description: "Attach an existing source to a task, project or AI thread without duplicating it. Omitted scopes are preserved unless replace is true.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          source_id: { type: "string" },
          task_id: { type: ["integer","null"] },
          project_id: { type: ["integer","null"] },
          ai_thread_id: { type: ["string","null"] },
          replace: { type: ["boolean","null"] }
        },
        required: ["source_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ai_refresh_url_source",
      description: "Refetch a URL source and append a new source version. Use only for sources whose source_type is url.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { source_id: { type: "string" } },
        required: ["source_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ai_start_agent_run",
      description: "Start a durable autonomous run that selects eligible tasks one at a time and builds the artifacts required by the user's mission. Artifact work within the selected task may run in parallel.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          request_text: { type: "string" },
          project_id: { type: ["integer","null"] },
          task_ids: { type: ["array","null"], items: { type: "integer" } },
          selection_policy: { type: ["object","null"], additionalProperties: true },
          max_tasks: { type: ["integer","null"] },
          artifact_concurrency: { type: ["integer","null"] }
        },
        required: ["request_text"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ai_get_agent_run",
      description: "Read the current state, selected tasks and child artifact builds of one autonomous agent run.",
      parameters: { type: "object", additionalProperties: false, properties: { agent_run_id: { type: "string" } }, required: ["agent_run_id"] }
    }
  },
  {
    type: "function",
    function: {
      name: "ai_set_agent_run_state",
      description: "Pause, resume or cancel an autonomous agent run.",
      parameters: { type: "object", additionalProperties: false, properties: { agent_run_id: { type: "string" }, status: { type: "string", enum: ["running","paused","cancelled"] } }, required: ["agent_run_id","status"] }
    }
  }
];



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



const STREAM_STATUS_PREFIX = "__AI_STATUS__";
const STREAM_EXECUTION_TRACE_PREFIX = "__AI_EXECUTION_TRACE__";
const STREAM_CHANGE_PREVIEW_PREFIX = "__AI_CHANGE_PREVIEW__";



function positiveInt(value: any): number | null {
  const n = Number(value ?? 0);
  return Number.isInteger(n) && n > 0 ? n : null;
}




function normalizeOptionalString(value: any, max = 20000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}



type SelectedArtifactContext = {
  source_type: string; artifact_id: string; artifact_version_number?: number | null;
  anchor_type: string; attachment_id?: string | null; block_id?: string | null;
  selected_text?: string | null; selection_before?: string | null; selection_after?: string | null;
  selection_start?: number | null; selection_end?: number | null; full_content_hash?: string | null;
  anchor_x?: number | null; anchor_y?: number | null; anchor_width?: number | null; anchor_height?: number | null;
  anchor_time_start?: number | null; anchor_time_end?: number | null; anchor_data?: any;
};



function normalizeSelectedArtifactContext(value: any): SelectedArtifactContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const artifactId = cleanUuidOrNull(value.artifact_id);
  if (!artifactId) return null;
  const numberOrNull = (v: any) => Number.isFinite(Number(v)) ? Number(v) : null;
  return {
    source_type: String(value.source_type ?? "task_artifact").slice(0, 50),
    artifact_id: artifactId,
    artifact_version_number: positiveInt(value.artifact_version_number ?? value.version_number),
    anchor_type: String(value.anchor_type ?? value.source_type ?? "document").slice(0, 50),
    attachment_id: cleanUuidOrNull(value.attachment_id),
    block_id: normalizeOptionalString(value.block_id ?? value.anchor_block_key, 120),
    selected_text: normalizeOptionalString(value.selected_text ?? value.anchor_quote, 30000),
    selection_before: normalizeOptionalString(value.selection_before ?? value.anchor_context_before, 5000),
    selection_after: normalizeOptionalString(value.selection_after ?? value.anchor_context_after, 5000),
    selection_start: numberOrNull(value.selection_start ?? value.anchor_start),
    selection_end: numberOrNull(value.selection_end ?? value.anchor_end),
    full_content_hash: normalizeOptionalString(value.full_content_hash, 200),
    anchor_x: numberOrNull(value.anchor_x ?? value.x), anchor_y: numberOrNull(value.anchor_y ?? value.y),
    anchor_width: numberOrNull(value.anchor_width ?? value.width), anchor_height: numberOrNull(value.anchor_height ?? value.height),
    anchor_time_start: numberOrNull(value.anchor_time_start ?? value.time_start),
    anchor_time_end: numberOrNull(value.anchor_time_end ?? value.time_end),
    anchor_data: value.anchor_data && typeof value.anchor_data === "object" ? value.anchor_data : null,
  };
}



function buildSelectedArtifactContextPrompt(ctx: SelectedArtifactContext | null): string {
  if (!ctx) return "";
  return [
    "SELECTED ARTIFACT CONTEXT",
    "Factual selection/anchor on an artifact. Interpret against the user request; do not treat this block as an automatic mutation instruction.",
    `artifact_id: ${ctx.artifact_id}`, `artifact_version_number: ${ctx.artifact_version_number ?? "current"}`,
    `anchor_type: ${ctx.anchor_type}`, ctx.attachment_id ? `attachment_id: ${ctx.attachment_id}` : null,
    ctx.block_id ? `block_id: ${ctx.block_id}` : null,
    ctx.selection_start != null ? `selection_range: ${ctx.selection_start}-${ctx.selection_end}` : null,
    ctx.anchor_x != null ? `normalized_region: x=${ctx.anchor_x}, y=${ctx.anchor_y}, width=${ctx.anchor_width}, height=${ctx.anchor_height}` : null,
    ctx.anchor_time_start != null ? `time_range_seconds: ${ctx.anchor_time_start}-${ctx.anchor_time_end ?? ctx.anchor_time_start}` : null,
    ctx.selection_before ? `BEFORE:
${ctx.selection_before}` : null,
    ctx.selected_text ? `SELECTED:
${ctx.selected_text}` : null,
    ctx.selection_after ? `AFTER:
${ctx.selection_after}` : null,
  ].filter(Boolean).join("\n");
}



function parseJsonObjectMaybe(value: any): any | null {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try { return JSON.parse(value); } catch { return null; }
}



function normalizeModelChoiceKey(value: any): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "-");
}



function getConfiguredModelRegistry() {
  return {
    auto: { provider: "auto", model: "auto", label: "Auto" },
    "openai.fast": { provider: "openai", model: OPENAI_MODEL_FAST, label: "OpenAI fast" },
    "openai.5.4-mini": { provider: "openai", model: OPENAI_MODEL_FAST, label: "OpenAI 5.4 mini" },
    "openai5.4-mini": { provider: "openai", model: OPENAI_MODEL_FAST, label: "OpenAI 5.4 mini" },
    "openai5.4mini": { provider: "openai", model: OPENAI_MODEL_FAST, label: "OpenAI 5.4 mini" },
    "gpt-5.4-mini": { provider: "openai", model: OPENAI_MODEL_FAST, label: "OpenAI 5.4 mini" },
    "gpt5.4mini": { provider: "openai", model: OPENAI_MODEL_FAST, label: "OpenAI 5.4 mini" },
    "openai.gpt-5.4-mini": { provider: "openai", model: OPENAI_MODEL_FAST, label: "OpenAI 5.4 mini" },
    "openai.smart": { provider: "openai", model: OPENAI_MODEL_SMART, label: "OpenAI smart" },
    "openai.5.5": { provider: "openai", model: OPENAI_MODEL_SMART, label: "OpenAI 5.5" },
    "openai5.5": { provider: "openai", model: OPENAI_MODEL_SMART, label: "OpenAI 5.5" },
    "gpt-5.5": { provider: "openai", model: OPENAI_MODEL_SMART, label: "OpenAI 5.5" },
    "gpt5.5": { provider: "openai", model: OPENAI_MODEL_SMART, label: "OpenAI 5.5" },
    "openai.gpt-5.5": { provider: "openai", model: OPENAI_MODEL_SMART, label: "OpenAI 5.5" },
    "openai.default": { provider: "openai", model: OPENAI_MODEL_DEFAULT, label: "OpenAI default" },
    "claude.fast": { provider: "anthropic", model: ANTHROPIC_MODEL_FAST, label: "Claude fast" },
    "claude.smart": { provider: "anthropic", model: ANTHROPIC_MODEL_SMART, label: "Claude smart" },
    "claude.default": { provider: "anthropic", model: ANTHROPIC_MODEL_DEFAULT, label: "Claude default" },
    "anthropic.fast": { provider: "anthropic", model: ANTHROPIC_MODEL_FAST, label: "Claude fast" },
    "anthropic.smart": { provider: "anthropic", model: ANTHROPIC_MODEL_SMART, label: "Claude smart" },
    "anthropic.default": { provider: "anthropic", model: ANTHROPIC_MODEL_DEFAULT, label: "Claude default" },
  } as Record<string, { provider: string; model: string; label: string }>;
}



function resolveModelAlias(value: any) {
  const raw = String(value ?? "").trim();
  const key = normalizeModelChoiceKey(value);
  if (!key) return null;
  const registry = getConfiguredModelRegistry();
  if (registry[key]) return { ...registry[key], key };

  if (/^openrouter:/i.test(raw)) {
    const model = raw.replace(/^openrouter:/i, "").trim();
    if (model) return { provider: "openrouter", model, label: model, key: `openrouter:${model}` };
  }

  // Accept raw OpenAI/Anthropic model ids when the FE sends provider separately.
  // This preserves escape hatches for admins while the normal UI uses model keys.
  if (key.startsWith("gpt-") || key.startsWith("o")) return { provider: "openai", model: String(value).trim(), label: String(value).trim(), key: `openai.raw:${String(value).trim()}` };
  if (key.startsWith("claude-")) return { provider: "anthropic", model: String(value).trim(), label: String(value).trim(), key: `anthropic.raw:${String(value).trim()}` };
  return null;
}



function classifyAutoModelTier(args: {
  requestText?: string | null;
  hasAttachments?: boolean;
  allowTools?: boolean;
}) {
  const text = String(args.requestText ?? "").trim();
  let score = 0;
  if (text.length > 1200) score += 2;
  if (text.length > 3000) score += 2;
  if (args.hasAttachments) score += 2;
  if (args.allowTools) score += 1;
  // Keep auto-routing deliberately structural. Do not keyword-match user intent
  // here; operation/scope routing is handled by the model-based routers above.
  if (text.length > 800) score += 1;
  const tier = score >= 2 ? "smart" : "fast";
  return {
    tier,
    score,
    reason: tier === "smart"
      ? "Auto selected the smarter model because the request looks broad, tool-heavy, analytical, or long."
      : "Auto selected the faster model because the request looks narrow or short.",
  };
}



function resolveAiModelSelection(args: {
  body?: any;
  thread?: any;
  requestText?: string | null;
  hasAttachments?: boolean;
  allowTools?: boolean;
}) {
  const body = args.body ?? {};
  const thread = args.thread ?? {};
  const requestedChoice = body.model_key ?? body.model_selection ?? body.ai_model ?? body.model ?? null;
  const requestedProvider = String(body.model_provider ?? "").trim() || null;
  const requestedModelName = String(body.model_name ?? "").trim() || null;
  const requestedTemperature = Number(body.temperature);
  const threadProvider = String(thread.model_provider ?? "").trim() || null;
  const threadModel = String(thread.model_name ?? "").trim() || null;
  const threadTemperature = typeof thread.temperature === "number" ? thread.temperature : null;

  let source = "default";
  let provider = DEFAULT_PROVIDER;
  let model = DEFAULT_MODEL;
  let modelKey = "openai.default";
  let label = "OpenAI default";
  let auto: any = null;

  const directAlias = resolveModelAlias(requestedChoice);
  if (directAlias && directAlias.provider !== "auto") {
    source = "request_model_key";
    provider = requestedProvider || directAlias.provider;
    model = requestedModelName || directAlias.model;
    modelKey = directAlias.key;
    label = directAlias.label;
  } else if (requestedProvider && requestedModelName) {
    source = "request_provider_model";
    provider = requestedProvider;
    model = requestedModelName;
    modelKey = `${requestedProvider}.raw:${requestedModelName}`;
    label = `${requestedProvider} ${requestedModelName}`;
  } else if (directAlias?.provider === "auto" || normalizeModelChoiceKey(requestedChoice) === "auto") {
    source = "request_auto";
    auto = classifyAutoModelTier(args);
    provider = "openai";
    model = auto.tier === "smart" ? OPENAI_MODEL_SMART : OPENAI_MODEL_FAST;
    modelKey = auto.tier === "smart" ? "openai.smart" : "openai.fast";
    label = auto.tier === "smart" ? "OpenAI smart" : "OpenAI fast";
  } else if (threadProvider && threadModel && normalizeModelChoiceKey(threadModel) !== "auto") {
    source = "thread";
    provider = threadProvider;
    model = threadModel;
    modelKey = `${threadProvider}.thread:${threadModel}`;
    label = `${threadProvider} ${threadModel}`;
  } else {
    // Default to auto-style behavior if no explicit model is set. This makes the
    // backend adaptive even before the FE model picker is shipped.
    source = "auto_default";
    auto = classifyAutoModelTier(args);
    provider = "openai";
    model = auto.tier === "smart" ? OPENAI_MODEL_SMART : OPENAI_MODEL_FAST;
    modelKey = auto.tier === "smart" ? "openai.smart" : "openai.fast";
    label = auto.tier === "smart" ? "OpenAI smart" : "OpenAI fast";
  }

  const temperature = Number.isFinite(requestedTemperature)
    ? requestedTemperature
    : (threadTemperature ?? DEFAULT_TEMP);

  return { provider, name: model, model, modelKey, label, source, auto, temperature };
}



function assertExecutableAiProvider(provider: string) {
  if (provider === "openai") {
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing");
    return;
  }
  if (provider === "openrouter") {
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is missing");
    return;
  }
  if (provider === "anthropic") {
    // Anthropic model keys are already registry-aware so the FE can be wired now.
    // However this function still uses OpenAI Responses/tool-call streaming payloads.
    // Add an Anthropic executor/adapter before enabling Claude in production.
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is missing");
    throw new Error("Anthropic/Claude model selection is configured but not executable in ai-chat yet. Add the provider adapter before enabling this option.");
  }
  throw new Error(`Unsupported AI provider: ${provider}`);
}



type OpenRouterModelMetadata = { supportsTools: boolean; contextLength: number | null };
let openRouterModelMetadataCache: { expiresAt: number; models: Map<string, OpenRouterModelMetadata> } | null = null;

async function openRouterModelMetadata(model: string): Promise<OpenRouterModelMetadata> {
  if (!OPENROUTER_API_KEY) return { supportsTools: false, contextLength: null };
  const now = Date.now();
  if (openRouterModelMetadataCache && openRouterModelMetadataCache.expiresAt > now) {
    return openRouterModelMetadataCache.models.get(model) ?? { supportsTools: false, contextLength: null };
  }
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`openrouter_models_failed:${response.status}`);
    const payload = await response.json();
    const models = new Map<string, OpenRouterModelMetadata>();
    for (const row of Array.isArray(payload?.data) ? payload.data : []) {
      const id = String(row?.id ?? "").trim();
      if (!id) continue;
      const supported = Array.isArray(row?.supported_parameters)
        ? row.supported_parameters.map((value: unknown) => String(value ?? "").trim())
        : [];
      const parsedContext = Number(row?.context_length);
      models.set(id, {
        supportsTools: supported.includes("tools"),
        contextLength: Number.isFinite(parsedContext) && parsedContext > 0 ? Math.round(parsedContext) : null,
      });
    }
    openRouterModelMetadataCache = { expiresAt: now + 5 * 60 * 1000, models };
    return models.get(model) ?? { supportsTools: false, contextLength: null };
  } catch (error) {
    console.warn("ai-chat OpenRouter model metadata lookup failed", { model, error: String(error) });
    return { supportsTools: false, contextLength: null };
  }
}

async function openRouterModelSupportsTools(model: string): Promise<boolean> {
  return (await openRouterModelMetadata(model)).supportsTools;
}

function nativeModelContextLimit(provider: string, model: string): number | null {
  if (provider !== "openai") return null;
  if (model === "gpt-5.4-mini") return 400_000;
  if (model === "gpt-5.5") return 1_050_000;
  return null;
}

const modelPricingCache = new Map<string, { expiresAt: number; data: any }>();



async function computeCost(supabaseService: any, provider: string, model: string, usage: any) {
  if (!usage) return {};
  const directCost = Number(usage?.cost);
  if (provider === "openrouter" && Number.isFinite(directCost) && directCost >= 0) {
    return { input_cost: null, output_cost: null, total_cost: directCost, currency: "USD" };
  }
  const cacheKey = `${provider}:${model}`;
  const cached = modelPricingCache.get(cacheKey);
  let data = cached && cached.expiresAt > Date.now() ? cached.data : null;
  if (!data) {
    const result = await supabaseService
      .from("ai_model_pricing")
      .select("currency,input_token_price,output_token_price")
      .eq("provider", provider)
      .eq("model_name", model)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    data = result.data ?? null;
    if (data) modelPricingCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60 * 1000, data });
  }

  if (!data) return {};

  const input_cost = (usage.prompt_tokens ?? 0) / 1000 * Number(data.input_token_price);
  const output_cost = (usage.completion_tokens ?? 0) / 1000 * Number(data.output_token_price);
  return {
    input_cost,
    output_cost,
    total_cost: input_cost + output_cost,
    currency: data.currency,
  };
}




async function persistUserMessage(args: {
  db: any;
  thread_id: string;
  content: string;
  displayContent?: string | null;
}) {
  const { db, thread_id, content, displayContent = null } = args;
  const internalContent = String(content ?? "");
  const visibleContent = String(displayContent ?? "").trim() || internalContent;
  const contentJson = visibleContent !== internalContent
    ? {
        display_message: visibleContent,
        internal_message: internalContent,
        has_internal_message: true,
      }
    : null;

  const insertPayload: Record<string, any> = {
    thread_id,
    role: "user",
    content: visibleContent,
  };
  if (contentJson) insertPayload.content_json = contentJson;

  const { data, error } = await db
    .from("ai_messages")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}




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
  const { ctx, thread, activeChannelId, toolCall, trace, round, attachments = [] } = args;
  const toolName = String(toolCall?.function?.name ?? toolCall?.name ?? "");
  const rawArgs = safeJsonParse(toolCall?.function?.arguments ?? toolCall?.arguments);
  trace?.mark("tool_call_requested", { tool_name: toolName, round, has_args: !!rawArgs && Object.keys(rawArgs).length > 0 });
  logToolEvent("requested", { thread_id: thread?.id ?? null, round, tool_name: toolName, args: rawArgs });
  try {
    const result = await invokeJsonEdgeFunction(
      "ai-tools",
      {
        tool_name: toolName,
        arguments: rawArgs,
        context: {
          thread_id: thread?.id ?? null,
          ai_run_id: ctx?.ai_run_id ?? null,
          current_user_request: ctx?.current_user_request ?? "",
          selected_artifact_context: ctx?.selected_artifact_context ?? null,
          project_id: ctx?.project_id ?? thread?.project_id ?? null,
          task_id: ctx?.task_id ?? thread?.task_id ?? null,
          channel_id: ctx?.channel_id ?? activeChannelId ?? null,
          round: round ?? 0,
          attachments,
        },
      },
      120000,
      ctx?.request_auth_header,
      ctx?.ai_run_id,
    );
    const normalized: any = result && typeof result === "object"
      ? { name: toolName, ok: !!result.ok, skipped: !!result.skipped, error: result.error ?? null, data: result.data ?? null, requires_clarification: result.requires_clarification === true }
      : { name: toolName, ok: false, skipped: false, error: "invalid_tool_endpoint_response", data: null };
    trace?.mark("tool_call_completed", { tool_name: toolName, round, ok: normalized.ok, skipped: normalized.skipped, has_data: normalized.data != null });
    logToolEvent("completed", { thread_id: thread?.id ?? null, round, tool_name: toolName, ok: normalized.ok, skipped: normalized.skipped, error: normalized.error });
    return normalized;
  } catch (error: any) {
    const failed = { name: toolName, ok: false, skipped: false, error: error?.message ?? String(error), data: null };
    trace?.mark("tool_call_completed", { tool_name: toolName, round, ok: false, skipped: false, has_data: false });
    logToolEvent("completed", { thread_id: thread?.id ?? null, round, tool_name: toolName, ok: false, skipped: false, error: failed.error });
    return failed;
  }
}


const MODEL_TOOLS = TOOLS;


function normalizeAmbientContext(raw: unknown): {
  center_task_id: number | null;
  active_channel_id: number | null;
  center_artifact_id: string | null;
  center_artifact_title: string | null;
  taskTab: string | null;
} | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const centerArtifactId = cleanUuidOrNull(row.center_artifact_id);
  const centerArtifactTitle =
    typeof row.center_artifact_title === "string" && row.center_artifact_title.trim()
      ? row.center_artifact_title.trim().slice(0, 240)
      : null;
  const taskTab =
    typeof row.taskTab === "string" && row.taskTab.trim()
      ? row.taskTab.trim().slice(0, 80)
      : typeof row.task_tab === "string" && row.task_tab.trim()
        ? row.task_tab.trim().slice(0, 80)
        : null;
  return {
    center_task_id: positiveInt(row.center_task_id),
    active_channel_id: positiveInt(row.active_channel_id),
    center_artifact_id: centerArtifactId,
    center_artifact_title: centerArtifactTitle,
    taskTab,
  };
}

// Keep this prompt byte-stable across requests: it forms the OpenAI prompt-cache
// prefix (tools + system message). Anything per-turn/volatile belongs in
// buildTurnContextPrompt, which is appended near the end of the message list.
function buildArtifactOnlySystemPrompt() {
  return [
    "You are the AI workspace assistant.",
    "Use the complete user request, recent conversation, explicit scope and factual tool results to understand intent semantically. Do not depend on exact spelling, tags, UI selection, language-specific keywords or literal aliases.",
    "DELIVERABLES: Artifacts are durable workspace records (structured text, media, presentations, files, datasets). Create or update an artifact when the user needs a lasting deliverable they can open, version, attach to a task/project, or download later. Do NOT create an artifact for every content-shaped request — short answers, clarifications, comparisons and one-off chat replies may stay in chat. Do NOT refuse artifacts when they are clearly the right durable home. When the user asks to adapt a Word/template/URL into a downloadable document, an artifact document is the correct durable home (ChatGPT-style file) so they can open and download it — that is not an unsolicited extra deliverable. After a successful create/update of a downloadable document, include the tool's exact download_links (app://artifact/.../download) in the final reply so the user can download immediately (e.g. Word/DOCX). Prefer that over inventing a separate ad-hoc file pipeline. System/project libraries contain reusable planning templates only — never treat them as output records.",
    "SOURCE ARCHITECTURE: sources are inputs, not outputs. A source may belong to a task, project or AI thread, or remain unattached. Import URLs, uploaded files, pasted text and research with source tools; then use those sources when answering or when building artifacts.",
    "LANGUAGE: Match conversational replies and clarifications to the language of the user's latest message. For deliverable content adapted from sources, templates or URLs, keep the language of that source material unless the user explicitly asks to translate or rewrite in another language.",
    "EDITORIAL QUALITY: Prefer specific, direct, natural writing over generic AI filler. Avoid unnecessary throat-clearing, inflated claims, canned transitions, repetitive conclusions, vague superlatives and formulaic phrases such as 'in today’s fast-paced world', 'delve into', 'unlock', 'seamless', 'crucial role', or equivalents in the output language. Vary sentence and paragraph rhythm; do not force every section into the same structure. Never remove terminology, tone, claims or phrasing that the user, source, brand rules or learned preferences explicitly require. Explicit instructions and factual source fidelity always outrank these defaults.",
    "Artifacts may belong to a task, project or AI thread. task_id, channel_id and language_id are optional metadata. Do not ask for any of them unless the user's actual goal requires that choice.",
    "FACTUAL CONTEXT ONLY: CURRENT SCOPE, AMBIENT UI CONTEXT, OPEN CENTER-PANE ARTIFACT, FACTUAL UI/THREAD TARGETS, RECENT THREAD ARTIFACTS and SELECTED ARTIFACT CONTEXT are facts about what is open, tagged or recently touched. Interpret the user's actual request against that context. Do not treat any of those facts as an automatic instruction to create, update, attach ownership, or skip a response.",
    "OPEN CENTER-PANE TASK / PROJECT: ambient center_task_id or scoped project_id may reflect an open pane. Ownership for creates/updates should follow the user request and tool facts (including ai_attach_artifact_to_task when attaching later), not the mere presence of an open pane.",
    "COPY + CAROUSEL SCRIPT: when the user asks for post copy plus a carousel/slide breakdown (headline + short line per slide), create ONE document/caption artifact with the ready-to-publish copy and the slide script in text. Do NOT use artifact_type=carousel and do NOT set media_items unless they explicitly ask to generate the slide images/visuals.",
    "When an artifact is warranted, decide whether to create/update one artifact or several. Use separate artifacts when they have independent formats, languages, publication lifecycles, tool requirements or version histories. Use depends_on_handles/source_handle for dependencies so independent artifacts can build in parallel.",
    "When updating an existing artifact, use ai_start_artifact_build with artifact_id + operation=update (leave source_artifact_id/source_handle null). Use source_* only when creating a different derived artifact. Do not invent a second deliverable when the request is clearly about an existing one already identified in context.",
    "FIND EXISTING DELIVERABLES: when the user refers to a document/media by name or topic and its artifact_id is not already in factual context/tool results, call ai_search_artifacts (works across tasks/projects/other chats the user can see). If a strong match exists and the request is to revise/improve/mark changes on that deliverable, update it. Create a new artifact only when there is no suitable match or the user explicitly wants a new/separate deliverable. Prefer ai_list_task_artifacts / ai_list_project_artifacts / ai_list_ai_thread_artifacts when that scope is already known.",
    "Task-level SEO keywords (keyword, secondary_keywords) live on the task via ai_update_task_fields / ai_create_task and apply to every artifact under that task. Use them for pure SEO keyword edits. meta_title / meta_description / h1 / h2 are separate task SEO fields.",
    "Tags and ambient UI facts are optional context. Users often name the project, task or deliverable in plain language with no tags. Resolve those names with tools when needed.",
    "When project_id is missing from CURRENT SCOPE / TARGETS but the user names a client, brand, website or blog (e.g. Dimas, Articulate): call list_visible_projects, pick the best semantic match, then read_project. Ask which project only when multiple candidates remain equally plausible.",
    "BRAND KIT: when the user asks to extract/import/update brand colors, fonts, logo or visual identity for a project, call extract_project_brand with project_name (and url if given). Accept imperfect names/typos. If the project was named earlier in this conversation, reuse that project_name or the project_id from a prior tool result — do not ask again unless ambiguous. Do not require tags, an AI-thread project association, or a tagged task. If the tool returns needs_clarification/candidates, ask which project. Do not invent brand tokens.",
    "ON-BRAND CREATIVES: when generating ads/images/video for a named brand/client that matches a visible project, resolve that project (list_visible_projects + read_project) and pass project_id (or project_name) on ai_start_artifact_build creates so the worker receives brand_kit. Prefer the project's brand_kit (colors, fonts, logo, layout templates, and approved_image_banks) over web/training knowledge of well-known brands. When approved_image_banks are present, prefer those stock libraries for photography choices and respect any license/notes — do not invent other stock sources unless the user asks. Layout templates include visual image references — the media worker attaches those images multimodally when generating creatives; you do not need to re-upload them. Use web knowledge only to fill gaps the kit does not cover — never invent conflicting brand tokens when a non-empty kit exists.",
    "BRAND LAYOUT TEMPLATES: when asked whether a project has visual/layout templates, call read_project and inspect brand_layout_templates (and brand_kit.design_templates). Do not conclude they are missing based on empty artifacts or attachments lists — templates are stored on the project Brand kit. When TAGGED BRAND TEMPLATES are present, treat those specific templates as the user's preferred layout references for this turn; call read_project for the tagged project_id to load full visual details.",
    "HTML NEWSLETTER / EMAIL CODE: when the user asks for a newsletter in HTML (or to follow an HTML email template), create/update an artifact with artifact_role=newsletter_html and instruct the worker to return a complete email-ready HTML document (doctype/head/style + nested presentation tables). Do not ask for copy-only unless the user explicitly wants copy without HTML. The UI can preview and edit raw HTML — do not flatten email HTML into a simple TipTap table or prose blocks.",
    "For task/project/user names, inspect factual candidates with read/search tools and choose the best semantic match. Ask only when the candidates are genuinely ambiguous.",
    "SOCIAL / COMPETITION STATS: when the user asks about social followers, engagement, posts, impressions, share of voice, or competitor social performance for a brand/project, resolve the project (list_visible_projects or project_name) then call read_project_social_stats. Use list_project_social_profiles to see which networks/accounts are linked. Never invent follower or engagement numbers — only report tool results. Default periods are the last 30 days unless the user specifies otherwise; pass date_from/date_to and set include_timeseries=true only when they ask about trends over time.",
    "PUBLISHING: when the user asks to publish/post/send content to a website, blog, CMS, newsletter destination or similar, resolve the project, then list_publishing_destinations. Choose the destination semantically from factual candidates — tolerate misspellings and multilingual wording. Ask only when candidates are genuinely ambiguous. If NO suitable destination exists, treat that as a solvable dependency: ask only for genuinely missing platform/URL info; once the user provides it (e.g. “é squarespace account.squarespace.com”), call configure_publishing_destination with start_url + service_or_platform + project context and include pending_publication with the original publish payload (inline content or artifact_id) so publication continues automatically after sign-in. NEVER tell the user to open Publishing Settings / Integrations to add a destination manually. Pass artifact_id when publishing an existing artifact; otherwise pass structured content inline — do not create a task/project/artifact merely to publish. For “publish now” use publish_mode=now. For later times, resolve ISO scheduled_at + IANA timezone (default Europe/Lisbon when Portugal context is clear) with publish_mode=scheduled. When there is an active publication, use get_publication_state / continue_publication / confirm_publication / cancel_publication. If the user says they signed in / finished login, call continue_publication on the awaiting-auth run. For scheduled items use list_scheduled_publications, reschedule_publication, cancel_scheduled_publication, publish_scheduled_now. If status is awaiting_publish_confirmation and the user explicitly confirms, call confirm_publication. Explicit setup requests (“add our Squarespace blog”, “connect Articulate for publishing”) use the same configure_publishing_destination tool. BROWSER PREVIEW: when configure_publishing_destination / publish_content returns a live browser session, the chat UI shows an embedded preview automatically — do NOT paste live.browser-use.com / CDP / Live View URLs into the reply as external links. You may mention the destination entry URL (e.g. lovable.dev/…) as configuration context, but never as a substitute for the in-chat browser preview.",
    "SELECTED ARTIFACT CONTEXT: when present, it identifies an artifact (and optional span/region). Pass the full selection object unchanged on updates when relevant. It is location/intent context only — not a lock to that span. The artifact worker sees the full document and should make any related edits needed for coherence. Act according to the user request.",
    "IN-PLACE UPDATE OWNERSHIP: for operation=update with artifact_id, omit ambient project_id/task_id unless they are already the artifact's own task/project. Do not attach a project_id just because the thread is scoped to a project — that fails with artifact_target_not_in_project for task-owned artifacts.",
    "ARTIFACT UPDATE FAILURES: if ai_start_artifact_build fails, fix the arguments and retry when the user request still requires an update. Never substitute a chat-only rewrite (and never change the artifact language) in place of a failed requested edit.",
    "Several tools may be used in one run. You may create records, then use their returned IDs in later tool rounds.",
    "Never invent IDs, URLs, database facts or tool results.",
    "WRITE CLAIM GROUNDING: Never say that you corrected, changed, updated, attached, linked, saved, deleted, published, configured or otherwise mutated workspace data unless at least one corresponding mutating tool result in this run completed with ok=true and skipped=false. Read/list/search tools do not count as writes. If no write succeeded, say explicitly that nothing was changed.",
    "Artifact read/list tools return app_link, markdown_link and download_links. When mentioning an artifact in the reply, paste markdown_link exactly once on its own line (e.g. `[Title](app://artifact/<id>)`) — do not wrap it in a bullet/numbered list, and do not also print the title as plain text above/beside the link. Never paste bare app:// URLs, never paste app://ai-build/... / build_app_link, and never invent web URLs. After ai_start_artifact_build for multiple artifacts, paste every entry from data.artifacts[].markdown_link (or data.artifact_links_markdown) — one chip per artifact on its own line — not a single build link.",
    "INTERNAL LINKBUILDING (artifacts + web content): when creating or updating blog/article and similar site content where it fits the user request, include natural internal links to other blog posts and key site pages (product, category, contact, about, etc.). Resolve project_id (scope, targets, or list_visible_projects + read_project) for project_url, then use read_public_webpage on the site and blog listing/detail pages to discover factual link opportunities. Only ask the user for blog URLs after browsing fails. Never invent a site-index or crawl tool that is not in your tool list.",
    "When ai_start_artifact_build succeeds, skip empty acknowledgements like 'Build started' or 'Queued' — the build timeline already shows that. Do write short Cursor-style narration: a brief plan before tools, then a substantive reply after tools (what changed, what to check next). Keep narration visible even when an artifact build is running.",
    "RESPONSE SHAPE: Prefer interleaved progress — short approach text, then tools, then a clear final answer. Do not leave the user with tools-only silence when a short explanation would help. For downloadable adaptations, end with a concise result summary plus the download link(s) — not only tool-status narration.",
    "CHAT PROSE FORMATTING: Keep conversational recommendations as continuous prose. Do not insert blank lines inside quoted names/titles (e.g. write \"EN July 2026\", not a line break mid-quote). Do not wrap multi-line structures in **bold**, and do not use mid-sentence bullet lists for short enumerations — prefer commas or a short inline phrase (e.g. one aggregator theme, short intro, 4 article blocks with Read on).",
    "Use ai_request_clarification only when an essential user decision or source is missing after using available context and tools. Do not let backend metadata gaps manufacture clarifications.",
    "The factual context sections (CURRENT SCOPE, AMBIENT UI CONTEXT, OPEN CENTER-PANE ARTIFACT, FACTUAL UI/THREAD TARGETS, TAGGED BRAND TEMPLATES, RECENT THREAD ARTIFACTS, SELECTED ARTIFACT CONTEXT) are provided in a dedicated context message near the end of the conversation.",
  ].join("\n\n");
}


function buildTurnContextPrompt(args: {
  scope: any;
  selectedArtifactContext: SelectedArtifactContext | null;
  targets: any[];
  ambientContext?: {
    center_task_id: number | null;
    active_channel_id: number | null;
    center_artifact_id: string | null;
    center_artifact_title: string | null;
    taskTab: string | null;
  } | null;
  recentThreadArtifacts?: Array<{
    id: string;
    title: string | null;
    current_version?: number | null;
    task_id?: number | null;
    project_id?: number | null;
  }>;
  taggedBrandTemplates?: Array<{
    template_id: string;
    title: string | null;
    project_id: number | null;
    notes?: string | null;
    asset_count?: number | null;
  }>;
}) {
  const selectedPrompt = buildSelectedArtifactContextPrompt(args.selectedArtifactContext);
  const recentArtifacts = Array.isArray(args.recentThreadArtifacts) ? args.recentThreadArtifacts : [];
  const taggedBrandTemplates = Array.isArray(args.taggedBrandTemplates) ? args.taggedBrandTemplates : [];
  const ambient = args.ambientContext ?? null;
  const ambientArtifactHint = ambient?.center_artifact_id
    ? {
        artifact_id: ambient.center_artifact_id,
        title: ambient.center_artifact_title,
      }
    : null;
  return [
    "FACTUAL CONTEXT FOR THE CURRENT REQUEST (facts about what is open, tagged or recently touched — not instructions):",
    `CURRENT SCOPE: ${JSON.stringify(args.scope ?? {})}`,
    `AMBIENT UI CONTEXT: ${JSON.stringify(ambient ?? {})}`,
    ambientArtifactHint
      ? `OPEN CENTER-PANE ARTIFACT: ${JSON.stringify(ambientArtifactHint)}`
      : null,
    `FACTUAL UI/THREAD TARGETS: ${JSON.stringify(args.targets ?? [])}`,
    taggedBrandTemplates.length > 0
      ? `TAGGED BRAND TEMPLATES: ${JSON.stringify(taggedBrandTemplates)}`
      : null,
    recentArtifacts.length > 0
      ? `RECENT THREAD ARTIFACTS: ${JSON.stringify(recentArtifacts)}`
      : null,
    selectedPrompt,
  ].filter(Boolean).join("\n\n");
}


async function loadRecentThreadArtifacts(db: any, threadId: string) {
  // Prefer the shared RPC (includes artifacts touched by builds on this thread, not only
  // rows whose ai_thread_id still points here — task-owned artifacts often keep an older thread).
  const { data: rpcData, error: rpcError } = await db.rpc("ai_list_ai_thread_artifacts_v1", {
    p_thread_id: threadId,
    p_include_content: false,
    p_limit: 8,
  });
  if (!rpcError && rpcData?.ok !== false) {
    const items = Array.isArray(rpcData?.artifacts)
      ? rpcData.artifacts
      : Array.isArray(rpcData?.items)
        ? rpcData.items
        : [];
    if (items.length > 0) {
      return items.slice(0, 8).map((row: any) => ({
        id: String(row.id),
        title: row.title ?? null,
        current_version: row.current_version ?? null,
        task_id: positiveInt(row.task_id),
        project_id: positiveInt(row.project_id),
      }));
    }
  } else if (rpcError) {
    console.error("loadRecentThreadArtifacts rpc failed", { threadId, error: rpcError.message });
  }

  // Fallback: direct ai_thread_id match + build work-unit artifact ids.
  const [{ data: owned, error: ownedError }, { data: builds, error: buildsError }] = await Promise.all([
    db
      .from("artifacts")
      .select("id,title,current_version,task_id,project_id,updated_at")
      .eq("ai_thread_id", threadId)
      .order("updated_at", { ascending: false })
      .limit(8),
    db
      .from("ai_build_jobs")
      .select("id")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (ownedError) {
    console.error("loadRecentThreadArtifacts owned failed", { threadId, error: ownedError.message });
  }
  if (buildsError) {
    console.error("loadRecentThreadArtifacts builds failed", { threadId, error: buildsError.message });
  }

  const byId = new Map<string, any>();
  for (const row of Array.isArray(owned) ? owned : []) {
    if (row?.id) byId.set(String(row.id), row);
  }

  const buildIds = (Array.isArray(builds) ? builds : []).map((row: any) => row?.id).filter(Boolean);
  if (buildIds.length > 0) {
    const { data: units, error: unitsError } = await db
      .from("ai_build_work_units")
      .select("input_snapshot,result,updated_at")
      .in("build_id", buildIds)
      .eq("unit_type", "artifact")
      .limit(80);
    if (unitsError) {
      console.error("loadRecentThreadArtifacts units failed", { threadId, error: unitsError.message });
    } else {
      const artifactIds = new Set<string>();
      for (const unit of Array.isArray(units) ? units : []) {
        const fromInput = cleanUuidOrNull(unit?.input_snapshot?.artifact_id);
        if (fromInput) artifactIds.add(fromInput);
        const saved = Array.isArray(unit?.result?.saved) ? unit.result.saved : [];
        for (const item of saved) {
          const fromSaved = cleanUuidOrNull(item?.artifact_id);
          if (fromSaved) artifactIds.add(fromSaved);
        }
      }
      const missing = Array.from(artifactIds).filter((id) => !byId.has(id));
      if (missing.length > 0) {
        const { data: extras, error: extrasError } = await db
          .from("artifacts")
          .select("id,title,current_version,task_id,project_id,updated_at")
          .in("id", missing)
          .limit(20);
        if (extrasError) {
          console.error("loadRecentThreadArtifacts extras failed", { threadId, error: extrasError.message });
        } else {
          for (const row of Array.isArray(extras) ? extras : []) {
            if (row?.id) byId.set(String(row.id), row);
          }
        }
      }
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")))
    .slice(0, 8)
    .map((row: any) => ({
      id: String(row.id),
      title: row.title ?? null,
      current_version: row.current_version ?? null,
      task_id: positiveInt(row.task_id),
      project_id: positiveInt(row.project_id),
    }));
}


function conversationContentFromAiMessage(row: any): string {
  const contentJson = parseJsonObjectMaybe(row.content_json) ?? {};
  const primary = String(contentJson.internal_message ?? row.content ?? "").trim();
  if (primary) return primary.slice(0, 30000);

  // Hidden artifact-build turns still must remain visible to the model on follow-ups.
  const buildIds = (Array.isArray(contentJson.build_ids) ? contentJson.build_ids : [])
    .map((id: any) => String(id ?? "").trim())
    .filter(Boolean);
  const toolResults = Array.isArray(contentJson.tool_results) ? contentJson.tool_results : [];
  const actionBits: string[] = [];
  for (const result of toolResults) {
    const name = String(result?.name ?? "").trim();
    if (!name || result?.ok !== true) continue;
    const summary = result?.data_summary && typeof result.data_summary === "object"
      ? result.data_summary
      : null;
    if (!summary) continue;
    if (name === "ai_start_artifact_build") {
      const buildId = summary.build_id ?? summary.id ?? null;
      const title = summary.title ?? null;
      const artifactId = summary.artifact_id ?? null;
      actionBits.push(
        [
          "started durable artifact build",
          buildId ? `build_id=${buildId}` : null,
          artifactId ? `artifact_id=${artifactId}` : null,
          title ? `title=${JSON.stringify(String(title))}` : null,
        ].filter(Boolean).join(" "),
      );
    } else if (summary.artifact_id) {
      actionBits.push(`${name} artifact_id=${summary.artifact_id}`);
    }
  }

  if (buildIds.length === 0 && actionBits.length === 0) return "";

  return [
    "[Prior assistant action — durable artifact work; chat bubble was hidden]",
    buildIds.length > 0 ? `build_ids: ${buildIds.join(", ")}` : null,
    actionBits.length > 0 ? actionBits.join("; ") : null,
    "For follow-ups that revise this deliverable (meta description, SEO, rewrite, improve), update the existing artifact with operation=update + artifact_id (or ai_update_task_fields for task SEO fields). Do not create a new unrelated artifact.",
  ].filter(Boolean).join("\n").slice(0, 30000);
}


// TTFT scales with prompt size (model prefill). Messages older than the thread's
// rolling context summary cutoff are represented by the summary; the char budget
// below is only a safety net for threads whose summary has not caught up yet.
const RECENT_CONVERSATION_MESSAGE_LIMIT = 24;
const RECENT_CONVERSATION_CHAR_BUDGET = 40_000;
const RECENT_CONVERSATION_FULL_RECENT_COUNT = 6;
const RECENT_CONVERSATION_OLDER_CHAR_CAP = 6_000;

async function loadRecentConversation(db: any, thread: any, excludeMessageId?: string | null) {
  const threadId = String(thread?.id ?? "");
  const summaryText = String(thread?.context_summary ?? "").trim();
  const summaryCutoffAt = thread?.context_summary_until_created_at ?? null;
  let query = db
    .from("ai_messages")
    .select("id,role,content,content_json,created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(RECENT_CONVERSATION_MESSAGE_LIMIT);
  if (summaryText && summaryCutoffAt) query = query.gt("created_at", summaryCutoffAt);
  const { data, error } = await query;
  if (error) throw error;
  const newestFirst = (Array.isArray(data) ? data : [])
    .filter((row: any) => !excludeMessageId || String(row.id) !== String(excludeMessageId))
    .map((row: any) => ({
      role: row.role === "assistant" ? "assistant" : "user",
      content: conversationContentFromAiMessage(row),
    }))
    .filter((row: any) => row.content.trim());

  const selected: Array<{ role: string; content: string }> = [];
  let usedChars = 0;
  for (let index = 0; index < newestFirst.length; index++) {
    const message = newestFirst[index];
    const isRecent = index < RECENT_CONVERSATION_FULL_RECENT_COUNT;
    const content = !isRecent && message.content.length > RECENT_CONVERSATION_OLDER_CHAR_CAP
      ? `${message.content.slice(0, RECENT_CONVERSATION_OLDER_CHAR_CAP)}\n…[older message truncated]`
      : message.content;
    if (!isRecent && usedChars + content.length > RECENT_CONVERSATION_CHAR_BUDGET) break;
    selected.push({ role: message.role, content });
    usedChars += content.length;
  }
  const ordered = selected.reverse();
  if (summaryText) {
    ordered.unshift({
      role: "system",
      content: `SUMMARY OF EARLIER CONVERSATION (older turns are archived; treat these facts as prior context):\n\n${summaryText}`,
    });
  }
  return ordered;
}


// Rolling thread summary: fold turns that fall out of the recent window into a
// compact summary instead of dropping them. Runs asynchronously after each run,
// so it never adds latency to the request path.
// Hybrid trigger (message count OR unsummarized volume) with large fold batches:
// refreshing too often would re-invalidate the prompt-cache prefix and burn
// summary-model calls, so after each fold ~12 messages must accumulate again.
const THREAD_SUMMARY_TRIGGER_MESSAGE_COUNT = 20;
const THREAD_SUMMARY_TRIGGER_CHAR_COUNT = 30_000;
const THREAD_SUMMARY_KEEP_RECENT_MESSAGES = 8;
const THREAD_SUMMARY_MAX_SOURCE_CHARS = 60_000;
const THREAD_SUMMARY_MODEL = Deno.env.get("OPENAI_MODEL_FAST") || "gpt-5.4-mini";

async function refreshThreadContextSummary(supabaseService: any, threadId: string) {
  try {
    const { data: threadRow, error: threadError } = await supabaseService
      .from("ai_threads")
      .select("id,context_summary,context_summary_until_created_at")
      .eq("id", threadId)
      .single();
    if (threadError || !threadRow) return;
    const cutoffAt = threadRow.context_summary_until_created_at ?? null;
    let query = supabaseService
      .from("ai_messages")
      .select("id,role,content,content_json,created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (cutoffAt) query = query.gt("created_at", cutoffAt);
    const { data: rows, error } = await query;
    if (error || !Array.isArray(rows)) return;

    const withContent = rows.map((row: any) => ({
      ...row,
      conversation_content: conversationContentFromAiMessage(row),
    }));
    const unsummarizedChars = withContent.reduce(
      (total: number, row: any) => total + row.conversation_content.length,
      0,
    );
    const shouldRefresh = withContent.length >= THREAD_SUMMARY_TRIGGER_MESSAGE_COUNT ||
      (withContent.length > THREAD_SUMMARY_KEEP_RECENT_MESSAGES && unsummarizedChars >= THREAD_SUMMARY_TRIGGER_CHAR_COUNT);
    if (!shouldRefresh) return;

    const toSummarize = withContent.slice(0, withContent.length - THREAD_SUMMARY_KEEP_RECENT_MESSAGES);
    if (toSummarize.length === 0) return;
    const previousSummary = String(threadRow.context_summary ?? "").trim();
    const transcript = toSummarize
      .map((row: any) =>
        row.conversation_content.trim()
          ? `${row.role === "assistant" ? "Assistant" : "User"}: ${row.conversation_content}`
          : null
      )
      .filter(Boolean)
      .join("\n\n")
      .slice(0, THREAD_SUMMARY_MAX_SOURCE_CHARS);
    if (!transcript) return;

    const response = await fetchOpenAi("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: THREAD_SUMMARY_MODEL,
        messages: [
          {
            role: "system",
            content: "You maintain a rolling summary of an AI workspace chat thread. Merge the previous summary (if any) with the new messages into ONE compact structured summary in the conversation's dominant language. Use exactly these headings: GOALS, DECISIONS, CONSTRAINTS, WORKSPACE ENTITIES, COMPLETED ACTIONS, OPEN ITEMS. Under each heading use concise bullets and omit empty headings only when truly irrelevant. Preserve exact names, IDs, agreed deliverable formats, task/project/artifact references and unresolved dependencies. Keep thread-specific style constraints when they matter to this work, but do not turn generic cross-thread user preferences into thread memory. Max ~450 words. Output only the structured summary.",
          },
          {
            role: "user",
            content: [
              previousSummary ? `PREVIOUS SUMMARY:\n${previousSummary}` : null,
              `NEW MESSAGES TO FOLD IN:\n${transcript}`,
            ].filter(Boolean).join("\n\n"),
          },
        ],
        max_completion_tokens: 2000,
      }),
      signal: AbortSignal.timeout(45_000),
    }, { stage: "thread_summary", tokenBased: false });
    if (!response.ok) {
      console.warn("ai-chat thread summary generation failed", { thread_id: threadId, status: response.status });
      return;
    }
    const completion = await response.json();
    const summary = String(completion?.choices?.[0]?.message?.content ?? "").trim();
    if (!summary) return;

    const last = toSummarize[toSummarize.length - 1];
    const { error: updateError } = await supabaseService
      .from("ai_threads")
      .update({
        context_summary: summary.slice(0, 8000),
        context_summary_until_message_id: last.id,
        context_summary_until_created_at: last.created_at,
        context_summary_updated_at: new Date().toISOString(),
      })
      .eq("id", threadId);
    if (updateError) {
      console.warn("ai-chat thread summary update failed", { thread_id: threadId, error: updateError.message });
      return;
    }
    console.log("ai-chat thread summary refreshed", { thread_id: threadId, folded_messages: toSummarize.length });
  } catch (error) {
    console.warn("ai-chat thread summary refresh failed", { thread_id: threadId, error: String(error) });
  }
}

function scheduleThreadContextSummary(supabaseService: any, threadId: string) {
  const promise = refreshThreadContextSummary(supabaseService, threadId);
  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(promise);
  else void promise;
}


async function buildCurrentUserMessageContent(supabaseService: any, text: string, attachments: any[]) {
  const imageAttachments = (Array.isArray(attachments) ? attachments : []).filter(isImageAttachment);
  if (imageAttachments.length === 0) return text;
  const content: any[] = [{ type: "text", text }];
  for (const attachment of imageAttachments.slice(0, 8)) {
    try {
      const url = await signedImageUrl(supabaseService, String(attachment.file_path ?? ""));
      content.push({ type: "image_url", image_url: { url, detail: "auto" } });
    } catch (error) {
      console.warn("ai-chat could not sign selected image attachment", { attachment_id: attachment?.id ?? null, error: String(error) });
    }
  }
  return content;
}


function mergeUsage(total: any, current: any) {
  const a = normalizeProviderUsage(total);
  const b = normalizeProviderUsage(current);
  return {
    prompt_tokens: a.prompt_tokens + b.prompt_tokens,
    completion_tokens: a.completion_tokens + b.completion_tokens,
    total_tokens: a.total_tokens + b.total_tokens,
    cached_prompt_tokens: a.cached_prompt_tokens + b.cached_prompt_tokens,
    cache_write_tokens: a.cache_write_tokens + b.cache_write_tokens,
    cost: (a.cost ?? 0) + (b.cost ?? 0),
  };
}



function compactToolValue(value: any, depth = 0): any {
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.length > 16000 ? `${value.slice(0, 15999)}…` : value;
  if (depth >= 5) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => compactToolValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 80).map(([key, item]) => [key, compactToolValue(item, depth + 1)]));
  }
  return String(value);
}

function shortHostFromUrl(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  try {
    const url = new URL(text.includes("://") ? text : `https://${text}`);
    return url.hostname.replace(/^www\./i, "") + (url.pathname && url.pathname !== "/" ? url.pathname.replace(/\/$/, "") : "");
  } catch {
    return text.slice(0, 80);
  }
}

function collectNamedRows(data: any): any[] {
  if (!data || typeof data !== "object") return [];
  for (const key of [
    "destinations",
    "artifacts",
    "rows",
    "items",
    "tasks",
    "projects",
    "pages",
    "results",
  ]) {
    if (Array.isArray(data[key])) return data[key];
  }
  return Array.isArray(data) ? data : [];
}

/** Compact user-facing tool outcome for the progressive timeline (never full payloads). */
function summarizeToolResultForTimeline(toolName: string, result: any): {
  result_summary: string;
  entities: Array<{ type: string; id?: string | number; label: string }>;
  data_summary: any;
} {
  const data = result?.data && typeof result.data === "object" ? result.data : null;
  const ok = !!result?.ok;
  const entities: Array<{ type: string; id?: string | number; label: string }> = [];
  const rows = collectNamedRows(data);
  const titles = rows
    .map((row: any) => String(row?.title ?? row?.name ?? row?.project_name ?? "").trim())
    .filter(Boolean)
    .slice(0, 6);
  for (const title of titles.slice(0, 4)) {
    entities.push({ type: "component", label: title });
  }

  const count =
    (typeof data?.count === "number" && Number.isFinite(data.count) ? data.count : null)
    ?? (typeof data?.total === "number" && Number.isFinite(data.total) ? data.total : null)
    ?? (rows.length > 0 ? rows.length : null);

  const compactRows = rows.slice(0, 12).map((row: any) => ({
    id: row?.id ?? row?.artifact_id ?? row?.destination_id ?? null,
    title: row?.title ?? row?.name ?? row?.project_name ?? null,
    url: row?.url ?? row?.start_url ?? row?.canonical_url ?? row?.final_url ?? null,
    status: row?.status ?? null,
    markdown_link: row?.markdown_link ?? null,
  }));

  let data_summary: any = null;
  if (data) {
    data_summary = compactToolValue({
      id: data.id ?? null,
      task_id: data.task_id ?? null,
      project_id: data.project_id ?? null,
      artifact_id: data.artifact_id ?? null,
      build_id: data.build_id ?? data.build?.id ?? null,
      count,
      action: data.action ?? null,
      title: data.title ?? data.name ?? null,
      url: data.url ?? data.final_url ?? data.source_url ?? null,
      titles: titles.length > 0 ? titles : null,
      artifact_count: data.artifact_count ?? null,
      // Expandable timeline payload: keep a short list of concrete results.
      items: compactRows.length > 0 ? compactRows : null,
      destinations: Array.isArray(data.destinations)
        ? data.destinations.slice(0, 12).map((row: any) => ({
          id: row?.id ?? null,
          name: row?.name ?? null,
          start_url: row?.start_url ?? null,
          status: row?.status ?? null,
        }))
        : null,
      artifacts: Array.isArray(data.artifacts)
        ? data.artifacts.slice(0, 8).map((row: any) => ({
          id: row?.id ?? row?.artifact_id ?? null,
          title: row?.title ?? null,
          markdown_link: row?.markdown_link ?? null,
        }))
        : null,
      pages: Array.isArray(data.pages)
        ? data.pages.slice(0, 8).map((row: any) => ({
          id: row?.id ?? null,
          title: row?.title ?? null,
          url: row?.url ?? row?.canonical_url ?? null,
        }))
        : null,
    });
  }

  if (!ok) {
    const err = String(result?.error ?? "").trim().slice(0, 120);
    return {
      result_summary: err ? `${toolName} failed: ${err}` : `${toolName} failed.`,
      entities,
      data_summary,
    };
  }

  switch (toolName) {
    case "ai_list_task_artifacts":
    case "ai_list_project_artifacts":
    case "ai_list_ai_thread_artifacts":
    case "ai_search_artifacts": {
      if (!count) return { result_summary: "Listed artifacts — none found.", entities, data_summary };
      const sample = titles.length ? `: ${titles.join("; ")}` : ".";
      return {
        result_summary: `Listed ${count} artifact${count === 1 ? "" : "s"}${sample}`,
        entities,
        data_summary,
      };
    }
    case "ai_read_artifact": {
      const title = String(data?.snapshot?.title ?? data?.title ?? titles[0] ?? "").trim();
      return {
        result_summary: title ? `Read artifact — ${title}` : "Finished reading artifact.",
        entities: title ? [{ type: "artifact", label: title, id: data?.artifact_id ?? data?.snapshot?.id ?? data?.id }] : entities,
        data_summary,
      };
    }
    case "read_public_webpage": {
      const host = shortHostFromUrl(data?.url ?? data?.final_url ?? data?.source_url);
      const title = String(data?.title ?? "").trim();
      if (host) entities.unshift({ type: "url", id: String(data?.url ?? host), label: host });
      return {
        result_summary: title
          ? `Read webpage — ${title}`
          : host
            ? `Read webpage — ${host}`
            : "Finished reading webpage.",
        entities: entities.slice(0, 4),
        data_summary,
      };
    }
    case "list_visible_projects": {
      if (!count) return { result_summary: "Listed projects — none found.", entities, data_summary };
      const sample = titles.length ? `: ${titles.join("; ")}` : ".";
      return {
        result_summary: `Listed ${count} project${count === 1 ? "" : "s"}${sample}`,
        entities: titles.slice(0, 4).map((label) => ({ type: "component", label })),
        data_summary,
      };
    }
    case "read_project": {
      const name = String(data?.name ?? data?.project_name ?? titles[0] ?? "").trim();
      return {
        result_summary: name ? `Read project — ${name}` : "Finished reading project.",
        entities: name ? [{ type: "component", label: name, id: data?.id ?? data?.project_id }] : entities,
        data_summary,
      };
    }
    case "search_tasks": {
      if (!count) return { result_summary: "Searched tasks — none found.", entities, data_summary };
      const sample = titles.length ? `: ${titles.join("; ")}` : ".";
      return {
        result_summary: `Found ${count} task${count === 1 ? "" : "s"}${sample}`,
        entities: titles.slice(0, 4).map((label, index) => ({
          type: "task",
          id: rows[index]?.id ?? undefined,
          label,
        })),
        data_summary,
      };
    }
    case "search_project_site_pages": {
      if (!count) return { result_summary: "Searched site pages — none found.", entities, data_summary };
      const sample = titles.length ? `: ${titles.join("; ")}` : ".";
      return {
        result_summary: `Found ${count} site page${count === 1 ? "" : "s"}${sample}`,
        entities,
        data_summary,
      };
    }
    case "ai_start_artifact_build": {
      const arts = Array.isArray(data?.artifacts) ? data.artifacts : [];
      const artTitles = arts
        .map((row: any) => String(row?.title ?? "").trim())
        .filter(Boolean)
        .slice(0, 6);
      const n = Number(data?.artifact_count ?? artTitles.length) || artTitles.length || 1;
      const sample = artTitles.length ? `: ${artTitles.join("; ")}` : ".";
      return {
        result_summary: `Started build for ${n} artifact${n === 1 ? "" : "s"}${sample}`,
        entities: artTitles.slice(0, 4).map((label, index) => ({
          type: "artifact",
          id: arts[index]?.id ?? arts[index]?.artifact_id ?? undefined,
          label,
        })),
        data_summary,
      };
    }
    case "ai_update_task_fields": {
      const title = String(data?.title ?? "").trim();
      return {
        result_summary: title ? `Updated task — ${title}` : "Finished updating task fields.",
        entities: title ? [{ type: "task", id: data?.id ?? data?.task_id, label: title }] : entities,
        data_summary,
      };
    }
    default: {
      if (titles.length > 0) {
        return {
          result_summary: `Finished ${toolName.replace(/^ai_/, "").replace(/_/g, " ")} — ${titles.join("; ")}`,
          entities,
          data_summary,
        };
      }
      if (count != null) {
        return {
          result_summary: `Finished ${toolName.replace(/^ai_/, "").replace(/_/g, " ")} — ${count} result${count === 1 ? "" : "s"}.`,
          entities,
          data_summary,
        };
      }
      return {
        result_summary: `Finished ${toolName.replace(/^ai_/, "").replace(/_/g, " ")}.`,
        entities,
        data_summary,
      };
    }
  }
}

type OutboundStreamStats = {
  openai_delta_count: number;
  openai_delta_chars: number;
  first_openai_delta_ms: number | null;
  last_openai_delta_ms: number | null;
  outbound_enqueue_count: number;
  outbound_text_enqueue_count: number;
  outbound_text_chars: number;
  first_outbound_enqueue_ms: number | null;
  first_outbound_text_ms: number | null;
  last_outbound_enqueue_ms: number | null;
};

function createOutboundStreamStats(): OutboundStreamStats {
  return {
    openai_delta_count: 0,
    openai_delta_chars: 0,
    first_openai_delta_ms: null,
    last_openai_delta_ms: null,
    outbound_enqueue_count: 0,
    outbound_text_enqueue_count: 0,
    outbound_text_chars: 0,
    first_outbound_enqueue_ms: null,
    first_outbound_text_ms: null,
    last_outbound_enqueue_ms: null,
  };
}

async function consumeOpenAiChatCompletionStream(args: {
  response: Response;
  onContentDelta?: (delta: string) => void | Promise<void>;
  streamStats?: OutboundStreamStats;
  streamStartedAtMs?: number;
}): Promise<{
  content: string;
  toolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  usage: any;
}> {
  const reader = args.response.body?.getReader();
  if (!reader) throw new Error("openai_stream_unavailable");
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage: any = null;
  const toolCallsByIndex = new Map<number, { id: string; type: string; function: { name: string; arguments: string } }>();
  const startedAt = args.streamStartedAtMs ?? performance.now();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let chunk: any = null;
      try { chunk = JSON.parse(data); } catch { continue; }
      if (chunk?.usage) usage = chunk.usage;
      const delta = chunk?.choices?.[0]?.delta ?? {};
      if (typeof delta.content === "string" && delta.content) {
        content += delta.content;
        if (args.streamStats) {
          const elapsed = Math.round(performance.now() - startedAt);
          args.streamStats.openai_delta_count += 1;
          args.streamStats.openai_delta_chars += delta.content.length;
          if (args.streamStats.first_openai_delta_ms == null) {
            args.streamStats.first_openai_delta_ms = elapsed;
          }
          args.streamStats.last_openai_delta_ms = elapsed;
        }
        // Stream narrative text as it arrives so the chat stays alive between
        // tool rounds. Tool-call rounds may later reset the bubble and move
        // this preamble into the execution timeline as narration.
        await args.onContentDelta?.(delta.content);
      }
      if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
        for (const toolDelta of delta.tool_calls) {
          const index = Number(toolDelta?.index ?? 0);
          const existing = toolCallsByIndex.get(index) ?? {
            id: "",
            type: "function",
            function: { name: "", arguments: "" },
          };
          if (typeof toolDelta?.id === "string" && toolDelta.id) existing.id = toolDelta.id;
          if (typeof toolDelta?.type === "string" && toolDelta.type) existing.type = toolDelta.type;
          if (typeof toolDelta?.function?.name === "string" && toolDelta.function.name) {
            existing.function.name = toolDelta.function.name;
          }
          if (typeof toolDelta?.function?.arguments === "string") {
            existing.function.arguments += toolDelta.function.arguments;
          }
          toolCallsByIndex.set(index, existing);
        }
      }
    }
  }

  const toolCalls = [...toolCallsByIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, value]) => value)
    .filter((value) => value.id && value.function.name);

  return { content, toolCalls, usage };
}

function toolResultForModel(result: any) {
  if (String(result?.name ?? "") === "ai_read_artifact" && result?.ok) {
    const full = JSON.stringify({
      ok: true,
      skipped: !!result?.skipped,
      error: null,
      data: result?.data ?? null,
    });
    // An explicit artifact read should provide the complete document when it
    // fits the conversation context. Larger editing jobs belong in the durable
    // artifact worker, which reads the canonical snapshot directly.
    return full.length <= 180000
      ? full
      : JSON.stringify({
          ok: true,
          error: "artifact_content_too_large_for_synchronous_chat",
          data: compactToolValue(result?.data, 4),
        }).slice(0, 180000);
  }

  const compact = compactToolValue({ ok: !!result?.ok, skipped: !!result?.skipped, error: result?.error ?? null, data: result?.data ?? null });
  let text = JSON.stringify(compact);
  if (text.length > 60000) text = JSON.stringify({ ok: !!result?.ok, error: result?.error ?? null, data: compactToolValue(result?.data, 3) }).slice(0, 60000);
  return text;
}

function toolResultForPersistence(result: any) {
  const data = result?.data ?? null;
  const toolName = String(result?.name ?? "");
  const isPublishingTool = [
    "publish_content",
    "configure_publishing_destination",
    "continue_publication",
    "confirm_publication",
    "get_publication_state",
    "publish_scheduled_now",
    "cancel_scheduled_publication",
    "cancel_publication",
  ].includes(toolName);

  // Publishing previews need live_view_url / destination ids in the persisted summary
  // so the chat UI can render PublicationBrowserPreviewCard (full tool data is otherwise dropped).
  const publishingSummary = isPublishingTool && data && typeof data === "object"
    ? {
        publication_run_id: data.publication_run_id ?? data.publicationRunId ?? null,
        destination_id: data.destination_id ?? data.destinationId ?? null,
        destination_name: data.destination_name ?? data.destinationName ?? null,
        artifact_id: data.artifact_id ?? data.artifactId ?? null,
        status: data.status ?? data.destination_status ?? null,
        live_view_url: data.live_view_url ?? data.liveViewUrl ?? null,
        connect_run_id: data.connect_run_id ?? data.connectRunId ?? null,
        show_browser_preview:
          data.show_browser_preview === true ||
          data.showBrowserPreview === true ||
          Boolean(data.live_view_url || data.liveViewUrl || data.publication_run_id),
        open_browser_tab: data.open_browser_tab === true || data.openBrowserTab === true,
        needs_authentication: data.needs_authentication === true,
        continuing_publication: data.continuing_publication === true,
      }
    : {};

  return {
    name: toolName,
    ok: !!result?.ok,
    skipped: !!result?.skipped,
    error: result?.error ?? null,
    data_summary: data && typeof data === "object" ? compactToolValue({
      id: data.id ?? null,
      task_id: data.task_id ?? null,
      project_id: data.project_id ?? null,
      artifact_id: data.artifact_id ?? null,
      build_id: data.build_id ?? data.build?.id ?? null,
      count: data.count ?? data.total ?? null,
      action: data.action ?? null,
      title: data.title ?? null,
      ...publishingSummary,
    }) : compactToolValue(data),
  };
}

function isMutatingToolName(name: unknown): boolean {
  const toolName = String(name ?? "").trim();
  return /^(?:ai_(?:update|create|save|attach|restore|duplicate|bulk_update|bulk_create|manage|start_artifact_build|set_agent_run_state)|configure_publishing_destination|publish_content|continue_publication|confirm_publication|cancel_publication|reschedule_publication|cancel_scheduled_publication|publish_scheduled_now)/.test(toolName);
}

function guardUngroundedMutationClaim(text: string, toolResults: any[]) {
  const value = String(text ?? "").trim();
  if (!value || !Array.isArray(toolResults) || toolResults.length === 0) {
    return { text: value, changed: false };
  }
  const hasSuccessfulMutation = toolResults.some((result) =>
    result?.ok === true
    && result?.skipped !== true
    && isMutatingToolName(result?.name)
  );
  if (hasSuccessfulMutation) return { text: value, changed: false };

  const claimsMutation = /\b(?:corrigi|alterei|atualizei|associei|vinculei|liguei|anexei|adicionei|removi|eliminei|apaguei|guardei|gravei|publiquei|reagendei|cancelei|restaurei|dupliquei|configurei|fixed|changed|updated|attached|linked|removed|deleted|saved|published|rescheduled|cancelled|canceled|restored|duplicated|configured)\b/i.test(value);
  if (!claimsMutation) return { text: value, changed: false };

  const looksPortuguese = /\b(?:corrigi|alterei|atualizei|associei|vinculei|liguei|anexei|adicionei|removi|eliminei|apaguei|guardei|gravei|publiquei|reagendei|cancelei|restaurei|dupliquei|configurei)\b/i.test(value);
  return {
    changed: true,
    text: looksPortuguese
      ? "Não consegui aplicar a alteração pedida. As ferramentas executadas apenas consultaram dados ou falharam; nenhuma operação de escrita foi concluída e nada foi alterado."
      : "I could not apply the requested change. The tools only read data or failed; no write operation completed and nothing was changed.",
  };
}


async function runArtifactConversation(args: {
  db: any;
  supabaseService: any;
  thread: any;
  provider: string;
  model: string;
  messages: any[];
  tools: any[];
  ctx: any;
  trace: ReturnType<typeof createTimingTrace>;
  attachments: any[];
  onEvent?: (event: any) => void | Promise<void>;
  streamStats?: OutboundStreamStats;
  streamStartedAtMs?: number;
}) {
  const conversation = [...args.messages];
  const toolResults: any[] = [];
  const buildIds: string[] = [];
  let clarification: any | null = null;
  let assistantText = "";
  let usage: any = null;
  let markedFirstToken = false;
  const streamStartedAtMs = args.streamStartedAtMs ?? performance.now();

  for (let round = 0; round < 10; round++) {
    const isOpenRouter = args.provider === "openrouter";
    const payload: any = {
      model: args.model,
      messages: conversation,
      stream: true,
    };
    if (isOpenRouter) {
      const sessionId = String(args.thread?.id ?? "").trim().slice(0, 256);
      if (sessionId) payload.session_id = sessionId;
    }
    if (Array.isArray(args.tools) && args.tools.length > 0) {
      payload.tools = args.tools;
      payload.tool_choice = "auto";
      // OpenRouter standardizes tool calls across providers. Avoid forcing
      // parallel_tool_calls because not every compatible model exposes it.
      if (!isOpenRouter) payload.parallel_tool_calls = true;
    }
    if (!isOpenRouter) payload.stream_options = { include_usage: true };

    args.trace.mark(`${args.provider}_round_${round + 1}_request`);
    const response = isOpenRouter
      ? await fetchOpenRouter("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://www.whyarticulate.com",
            "X-Title": "Articulate",
          },
          body: JSON.stringify(payload),
          signal: args.ctx?.abort_signal ?? undefined,
        }, { quota: args.ctx?.ai_token_quota, stage: `chat_round_${round + 1}`, defaultMaxCompletionTokens: 10000 })
      : await fetchOpenAi("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify(sanitizeOpenAiPayload(payload)),
          signal: args.ctx?.abort_signal ?? undefined,
        }, { quota: args.ctx?.ai_token_quota, stage: `chat_round_${round + 1}`, defaultMaxCompletionTokens: 10000 });
    if (!response.ok) throw new Error(`${args.provider}_chat_failed:${response.status}:${await response.text()}`);
    const streamed = await consumeOpenAiChatCompletionStream({
      response,
      streamStats: args.streamStats,
      streamStartedAtMs,
      onContentDelta: async (delta) => {
        if (!markedFirstToken) {
          markedFirstToken = true;
          const runId = cleanUuidOrNull(args.ctx?.ai_run_id);
          if (runId) {
            void updateAiChatRun(args.supabaseService, runId, { mark_first_token: true });
          }
          console.log("ai-chat stream first openai delta", {
            run_id: runId,
            ms: Math.round(performance.now() - streamStartedAtMs),
            chars: delta.length,
          });
        }
        await args.onEvent?.({ type: "assistant_text_delta", delta });
      },
    });
    usage = mergeUsage(usage, streamed.usage);
    const toolCalls = streamed.toolCalls;
    const content = streamed.content;

    if (toolCalls.length === 0) {
      // Prefer the final no-tool round as the visible reply. Keep any earlier
      // substantive narration that never made it into a tool preamble.
      const finalText = content.trim();
      if (finalText) assistantText = finalText;
      break;
    }

    // Cursor-like: keep approach narration in the timeline, then clear the
    // bubble so the final answer does not append onto the preamble.
    if (content.trim()) {
      args.onEvent?.({
        type: "narration",
        phase: "completed",
        round,
        text: content.trim(),
      });
      args.onEvent?.({ type: "assistant_text_reset" });
    }

    conversation.push({ role: "assistant", content: content || null, tool_calls: toolCalls });
    for (let toolIndex = 0; toolIndex < toolCalls.length; toolIndex++) {
      const toolCall = toolCalls[toolIndex];
      const toolName = String(toolCall?.function?.name ?? "");
      const toolCallId = typeof toolCall?.id === "string" ? toolCall.id : "";
      args.onEvent?.({
        type: "tool_started",
        phase: "started",
        round,
        tool_name: toolName,
        tool_call_id: toolCallId || null,
        tool_index: toolIndex,
        text: `Using ${toolName}…`,
      });
      const result = await executeToolCall({
        db: args.db,
        ctx: args.ctx,
        thread: args.thread,
        activeChannelId: positiveInt(args.ctx?.channel_id),
        toolCall,
        trace: args.trace,
        round,
        supabaseService: args.supabaseService,
        attachments: args.attachments,
      });
      toolResults.push(result);
      const publishingTools = new Set([
        "publish_content",
        "configure_publishing_destination",
        "continue_publication",
        "confirm_publication",
        "get_publication_state",
        "publish_scheduled_now",
        "cancel_scheduled_publication",
        "cancel_publication",
      ]);
      const publishingData = result?.data && typeof result.data === "object" ? result.data : null;
      const publishingPreview = publishingTools.has(toolName) && result?.ok && publishingData
        ? {
            tool_name: toolName,
            ok: true,
            publication_run_id: publishingData.publication_run_id ?? publishingData.publicationRunId ?? null,
            destination_id: publishingData.destination_id ?? publishingData.destinationId ?? null,
            destination_name: publishingData.destination_name ?? publishingData.destinationName ?? null,
            artifact_id: publishingData.artifact_id ?? publishingData.artifactId ?? null,
            status: publishingData.status ?? publishingData.destination_status ?? null,
            live_view_url: publishingData.live_view_url ?? publishingData.liveViewUrl ?? null,
            connect_run_id: publishingData.connect_run_id ?? publishingData.connectRunId ?? null,
            show_browser_preview: true,
            open_browser_tab: publishingData.open_browser_tab === true || publishingData.openBrowserTab === true,
            needs_authentication: publishingData.needs_authentication === true,
            continuing_publication: publishingData.continuing_publication === true,
          }
        : null;
      const timelineSummary = summarizeToolResultForTimeline(toolName, result);
      args.onEvent?.({
        type: "tool_finished",
        phase: result?.ok ? "completed" : "failed",
        round,
        tool_name: toolName,
        tool_call_id: toolCallId || null,
        tool_index: toolIndex,
        ok: !!result?.ok,
        // Collapsed timeline line stays short; expandable details use
        // result_summary + data_summary (emitted after the tool returns — no TTFT cost).
        text: result?.ok ? `Finished ${toolName}.` : `${toolName} failed.`,
        result_summary: timelineSummary.result_summary,
        entities: timelineSummary.entities,
        data_summary: timelineSummary.data_summary,
        ...(publishingPreview ? { publishing_preview: publishingPreview } : {}),
      });
      conversation.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResultForModel(result),
      });
      const buildId = cleanUuidOrNull(result?.data?.build_id ?? result?.data?.build?.id);
      if (buildId) {
        buildIds.push(buildId);
        // Register the live build card as soon as dispatch succeeds — do not wait for message_output.
        const artifactTitle =
          (Array.isArray(result?.data?.artifacts) && result.data.artifacts[0]?.title)
          || result?.data?.title
          || result?.data?.artifact?.title
          || null;
        args.onEvent?.({
          type: "ai_change_preview",
          phase: result?.ok === false ? "failed" : "started",
          ok: result?.ok !== false,
          change_id: buildId,
          tool_name: toolName || "ai_start_artifact_build",
          entity_type: "ai_orchestrated_build",
          entity_id: buildId,
          build_id: buildId,
          title: typeof artifactTitle === "string" ? artifactTitle : null,
          summary: result?.ok === false ? "Artifact build failed to start" : "Artifact build started",
          round,
        });
      }
      if (result?.requires_clarification === true || result?.data?.clarification_request) {
        clarification = result?.data?.clarification_request ?? null;
      }
    }
    if (clarification) break;
  }

  if (clarification) assistantText = String(clarification.question ?? "").trim();
  if (!clarification) {
    const grounded = guardUngroundedMutationClaim(assistantText, toolResults);
    if (grounded.changed) {
      console.warn("ai-chat blocked ungrounded mutation claim", {
        run_id: cleanUuidOrNull(args.ctx?.ai_run_id),
        tool_names: toolResults.map((result) => String(result?.name ?? "")).filter(Boolean),
      });
      assistantText = grounded.text;
      await args.onEvent?.({ type: "assistant_text_reset" });
      await args.onEvent?.({ type: "assistant_text_delta", delta: assistantText });
    }
  }
  // Keep substantive final prose even when an artifact build was started — the
  // timeline shows the build, the bubble can still explain what is happening.

  return {
    assistantText,
    toolResults,
    buildIds: [...new Set(buildIds)],
    clarification,
    usage,
    streamStats: args.streamStats ?? null,
  };
}



async function persistAssistantMessage(args: {
  supabaseService: any;
  threadId: string;
  runId: string | null;
  provider: string;
  model: string;
  text: string;
  usage: any;
  toolResults: any[];
  buildIds: string[];
  clarification: any | null;
  latencyMs: number;
  scope: any;
  streamStats?: OutboundStreamStats | null;
  contextComposition?: Record<string, number> | null;
  contextLimit?: number | null;
}) {
  const costs = await computeCost(args.supabaseService, args.provider, args.model, args.usage);
  const hasVisibleText = Boolean(args.text?.trim()) || Boolean(args.clarification);
  const hidden = args.buildIds.length > 0 && !hasVisibleText;
  const contentJson: any = {
    output_kind: hidden ? "artifact_build_control" : args.clarification ? "clarification" : "text",
    ui_visibility: hidden ? "hidden" : "visible",
    ...(args.toolResults.length ? { tool_results: args.toolResults.map(toolResultForPersistence) } : {}),
    ...(args.buildIds.length ? { build_ids: args.buildIds, suppress_chat_bubble: hidden } : {}),
    ...(args.clarification ? { clarification_request: args.clarification } : {}),
  };
  const { data, error } = await args.supabaseService.from("ai_messages").insert({
    thread_id: args.threadId,
    role: "assistant",
    content: args.text,
    content_json: contentJson,
    model_provider: args.provider,
    model_name: args.model,
    usage_prompt_tokens: args.usage?.prompt_tokens ?? null,
    usage_completion_tokens: args.usage?.completion_tokens ?? null,
    usage_total_tokens: args.usage?.total_tokens ?? null,
    input_cost: costs.input_cost ?? null,
    output_cost: costs.output_cost ?? null,
    total_cost: costs.total_cost ?? null,
    latency_ms: args.latencyMs,
    scope_project_id: positiveInt(args.scope?.project_id),
    scope_task_id: positiveInt(args.scope?.task_id),
    scope_channel_id: positiveInt(args.scope?.channel_id),
    ...(args.runId ? { run_id: args.runId } : {}),
  }).select("*").single();
  if (error) throw error;
  if (args.runId) {
    const stream = args.streamStats;
    const openaiSpanMs =
      stream?.first_openai_delta_ms != null && stream?.last_openai_delta_ms != null
        ? Math.max(0, stream.last_openai_delta_ms - stream.first_openai_delta_ms)
        : null;
    const outboundTextSpanMs =
      stream?.first_outbound_text_ms != null && stream?.last_outbound_enqueue_ms != null
        ? Math.max(0, stream.last_outbound_enqueue_ms - stream.first_outbound_text_ms)
        : null;
    await updateAiChatRun(args.supabaseService, args.runId, {
      status: "completed",
      assistant_message_id: data.id,
      model_provider: args.provider,
      model_name: args.model,
      metrics: {
        latency_ms: args.latencyMs,
        usage_prompt_tokens: args.usage?.prompt_tokens ?? null,
        usage_completion_tokens: args.usage?.completion_tokens ?? null,
        usage_total_tokens: args.usage?.total_tokens ?? null,
        cached_prompt_tokens: args.usage?.cached_prompt_tokens ?? 0,
        cache_write_tokens: args.usage?.cache_write_tokens ?? 0,
        cache_hit_rate: (args.usage?.prompt_tokens ?? 0) > 0
          ? (args.usage?.cached_prompt_tokens ?? 0) / args.usage.prompt_tokens
          : null,
        context_composition: args.contextComposition ?? null,
        context_limit: args.contextLimit ?? null,
        context_estimated_prompt_tokens: args.contextComposition?.total_estimated_tokens ?? null,
        build_ids: args.buildIds,
        ...(stream
          ? {
              stream_openai_delta_count: stream.openai_delta_count,
              stream_openai_delta_chars: stream.openai_delta_chars,
              stream_first_openai_delta_ms: stream.first_openai_delta_ms,
              stream_last_openai_delta_ms: stream.last_openai_delta_ms,
              stream_openai_span_ms: openaiSpanMs,
              stream_outbound_enqueue_count: stream.outbound_enqueue_count,
              stream_outbound_text_enqueue_count: stream.outbound_text_enqueue_count,
              stream_outbound_text_chars: stream.outbound_text_chars,
              stream_first_outbound_enqueue_ms: stream.first_outbound_enqueue_ms,
              stream_first_outbound_text_ms: stream.first_outbound_text_ms,
              stream_last_outbound_enqueue_ms: stream.last_outbound_enqueue_ms,
              stream_outbound_text_span_ms: outboundTextSpanMs,
            }
          : {}),
      },
    });
    if (stream) {
      console.log("ai-chat stream stats", {
        run_id: args.runId,
        openai_delta_count: stream.openai_delta_count,
        openai_span_ms: openaiSpanMs,
        outbound_text_enqueue_count: stream.outbound_text_enqueue_count,
        outbound_text_span_ms: outboundTextSpanMs,
        first_openai_delta_ms: stream.first_openai_delta_ms,
        first_outbound_text_ms: stream.first_outbound_text_ms,
      });
    }
  }
  return data;
}


function normalizeRequestTargets(values: any[]) {
  const allowed = new Set(["project", "task", "user", "attachment", "channel", "artifact", "source"]);
  return (Array.isArray(values) ? values : []).map((value: any) => ({
    target_kind: String(value?.target_kind ?? ""),
    project_id: positiveInt(value?.project_id),
    task_id: positiveInt(value?.task_id),
    channel_id: positiveInt(value?.channel_id),
    user_id: positiveInt(value?.user_id),
    artifact_id: cleanUuidOrNull(value?.artifact_id),
    source_id: cleanUuidOrNull(value?.source_id),
    artifact_version_number: positiveInt(value?.artifact_version_number ?? value?.version_number),
    attachment_id: cleanUuidOrNull(value?.attachment_id),
    source: ["explicit_tag", "explicit_selection", "message_resolution", "ambient", "thread_read"].includes(String(value?.source ?? "")) ? String(value.source) : "thread_read",
    allow_write: false,
    label: normalizeOptionalString(value?.label, 500),
  })).filter((value: any) => {
    if (!allowed.has(value.target_kind)) return false;
    if (value.target_kind === "artifact") return !!value.artifact_id;
    if (value.target_kind === "source") return !!value.source_id;
    if (value.target_kind === "attachment") return !!value.attachment_id;
    return true;
  });
}


function taggedBrandTemplateContext(body: any) {
  const refs = Array.isArray(body?.tagged_brand_template_refs) ? body.tagged_brand_template_refs : [];
  const ids = (Array.isArray(body?.tagged_brand_template_ids) ? body.tagged_brand_template_ids : [])
    .map((value: unknown) => String(value ?? "").trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: Array<{
    template_id: string;
    title: string | null;
    project_id: number | null;
    notes?: string | null;
    asset_count?: number | null;
  }> = [];
  for (const ref of refs) {
    const templateId = String(ref?.template_id ?? ref?.id ?? "").trim();
    if (!templateId || seen.has(templateId)) continue;
    seen.add(templateId);
    out.push({
      template_id: templateId,
      title: normalizeOptionalString(ref?.title ?? ref?.label, 500),
      project_id: positiveInt(ref?.project_id),
      notes: normalizeOptionalString(ref?.notes, 2000),
      asset_count: positiveInt(ref?.asset_count),
    });
  }
  for (const templateId of ids) {
    if (seen.has(templateId)) continue;
    seen.add(templateId);
    out.push({
      template_id: templateId,
      title: null,
      project_id: null,
    });
  }
  return out;
}

function taggedBrandTemplateProjectTargets(body: any) {
  return taggedBrandTemplateContext(body)
    .map((ref) => ({
      target_kind: "project",
      project_id: ref.project_id,
      source: "explicit_tag",
      allow_write: false,
      label: ref.title,
    }))
    .filter((ref: any) => !!ref.project_id);
}


function taggedSourceTargets(body: any) {
  const ids = (Array.isArray(body?.tagged_source_ids) ? body.tagged_source_ids : [])
    .map(cleanUuidOrNull)
    .filter(Boolean);
  const refs = Array.isArray(body?.tagged_source_refs) ? body.tagged_source_refs : [];
  return [
    ...ids.map((source_id: string) => ({ target_kind: "source", source_id, source: "explicit_tag", allow_write: false, label: null })),
    ...refs.map((ref: any) => ({
      target_kind: "source",
      source_id: cleanUuidOrNull(ref?.source_id ?? ref?.id),
      task_id: positiveInt(ref?.task_id),
      project_id: positiveInt(ref?.project_id),
      source: "explicit_tag",
      allow_write: false,
      label: normalizeOptionalString(ref?.title ?? ref?.label, 500),
    })).filter((ref: any) => !!ref.source_id),
  ];
}


function taggedArtifactTargets(body: any) {
  const ids = (Array.isArray(body?.tagged_artifact_ids) ? body.tagged_artifact_ids : [])
    .map(cleanUuidOrNull)
    .filter(Boolean);
  const refs = Array.isArray(body?.tagged_artifact_refs) ? body.tagged_artifact_refs : [];
  return [
    ...ids.map((artifact_id: string) => ({
      target_kind: "artifact",
      artifact_id,
      source: "explicit_tag",
      allow_write: false,
      label: null,
    })),
    ...refs.map((ref: any) => ({
      target_kind: "artifact",
      artifact_id: cleanUuidOrNull(ref?.artifact_id ?? ref?.id),
      artifact_version_number: positiveInt(ref?.artifact_version_number ?? ref?.version_number),
      task_id: positiveInt(ref?.task_id),
      project_id: positiveInt(ref?.project_id),
      source: "explicit_tag",
      allow_write: false,
      label: normalizeOptionalString(ref?.title ?? ref?.label, 500),
    })).filter((ref: any) => !!ref.artifact_id),
  ];
}


async function handleAiChatRequest(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Use POST", { status: 405, headers: corsHeaders });

  const startedAt = performance.now();
  let activeRunId: string | null = null;
  let tokenQuotaContext: AiTokenQuotaContext | null = null;
  let supabaseService: any = null;
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace("Bearer ", "").trim();
    const isServiceCall = bearer === (SUPABASE_SERVICE_KEY ?? "");
    const supabaseUser = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } } });
    supabaseService = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);
    const db = isServiceCall ? supabaseService : supabaseUser;
    const body = await req.json().catch(() => ({}));
    const threadId = cleanUuidOrNull(body.thread_id);
    const requestText = String(body.message ?? "").trim();
    const displayText = String(body.display_message ?? requestText).trim() || requestText;
    if (!threadId) return new Response(JSON.stringify({ error: { code: "thread_id_required" } }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!requestText && !body.clarification_response) return new Response(JSON.stringify({ error: { code: "message_required" } }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const trace = createTimingTrace({ thread_id: threadId });
    let { data: thread } = await db.from("ai_threads").select("*").eq("id", threadId).maybeSingle();
    if (!thread && !isServiceCall) {
      // SECURITY DEFINER can see the row even when RLS select policies miss
      // (e.g. transient current_user_id mapping issues with a still-valid JWT).
      const { data: canRead } = await supabaseUser.rpc("ai_can_read_thread", { p_thread_id: threadId });
      if (canRead) {
        const { data: threadSvc } = await supabaseService.from("ai_threads").select("*").eq("id", threadId).maybeSingle();
        thread = threadSvc ?? null;
      }
    }
    if (!thread) {
      if (!isServiceCall) {
        const { data: exists } = await supabaseService.from("ai_threads").select("id").eq("id", threadId).maybeSingle();
        if (exists) {
          return new Response(JSON.stringify({ error: { code: "thread_access_denied" } }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
      return new Response(JSON.stringify({ error: { code: "thread_not_found" } }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    trace.mark("thread_loaded");

    const selectedArtifactContext = normalizeSelectedArtifactContext(body.selected_artifact_context);
    const ambientContext = normalizeAmbientContext(body.ambient_context);
    const requestedScope = body.scope && typeof body.scope === "object" ? body.scope : {};
    const scope = {
      source: String(requestedScope.source ?? (positiveInt(requestedScope.task_id ?? thread.task_id) ? "thread" : "none")),
      project_id: positiveInt(requestedScope.project_id ?? thread.project_id),
      task_id: positiveInt(requestedScope.task_id ?? thread.task_id),
      channel_id: positiveInt(requestedScope.channel_id),
    };
    const targets = normalizeRequestTargets([
      ...(Array.isArray(body.targets) ? body.targets : []),
      ...taggedArtifactTargets(body),
      ...taggedSourceTargets(body),
      ...taggedBrandTemplateProjectTargets(body),
    ]);
    const taggedBrandTemplates = taggedBrandTemplateContext(body);
    const attachmentIds = (Array.isArray(body.attachment_ids) ? body.attachment_ids : []).map(cleanUuidOrNull).filter(Boolean);
    const clientRequestId = cleanUuidOrNull(body.client_request_id) ?? crypto.randomUUID();
    const requestHash = await sha256Hex({ thread_id: threadId, message: requestText, display_message: displayText, scope, targets, selected_artifact_context: selectedArtifactContext, attachment_ids: attachmentIds, clarification_response: body.clarification_response ?? null });

    if (!isServiceCall) tokenQuotaContext = createAiTokenQuotaContext({ client: supabaseUser, threadId, clientRequestId, signal: req.signal });

    let userMessageId: string | null = null;
    // Quota-run binding overlaps with context loading below; the first token
    // reservation awaits it via the setup Promise.all before calling OpenAI.
    let bindQuotaRunPromise: Promise<void> = Promise.resolve();
    if (!isServiceCall) {
      const { data: existing } = await supabaseUser.rpc("ai_find_chat_run_by_request", { p_thread_id: threadId, p_client_request_id: clientRequestId, p_request_hash: requestHash });
      if (existing?.run?.id) return new Response(JSON.stringify({ ...existing, run_id: existing.run.id, replayed: true }), { status: String(existing.run.status ?? "") === "running" ? 202 : 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
      const { data: begun, error: beginError } = await supabaseUser.rpc("ai_begin_chat_run_v4", {
        p_thread_id: threadId,
        p_client_request_id: clientRequestId,
        p_protocol_version: 2,
        p_request_hash: requestHash,
        p_internal_message: requestText,
        p_display_message: displayText,
        p_message_metadata: { selected_artifact_context: selectedArtifactContext, clarification_response: body.clarification_response ?? null },
        p_scope: scope,
        p_targets: targets,
        p_intent_hint: null,
        p_model_key: body.model_key ?? body.model_selection ?? body.ai_model ?? null,
        p_attachment_ids: attachmentIds,
      });
      if (beginError) return new Response(JSON.stringify({ error: { code: "run_begin_failed", message: beginError.message } }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      activeRunId = cleanUuidOrNull(begun?.run_id);
      userMessageId = cleanUuidOrNull(begun?.user_message_id);
      trace.mark("run_begun");
      bindQuotaRunPromise = bindAiTokenQuotaRun(tokenQuotaContext, activeRunId);
    } else {
      const inserted = await persistUserMessage({ db: supabaseService, thread_id: threadId, content: requestText, displayContent: displayText });
      userMessageId = cleanUuidOrNull(inserted?.id);
      activeRunId = cleanUuidOrNull(body.run_id ?? req.headers.get("x-ai-run-id"));
    }

    const currentThreadTitle = String(thread?.title ?? "").trim();
    const titleIsGeneric = !currentThreadTitle || /^(new chat|untitled|nova conversa|sem título)$/i.test(currentThreadTitle);
    if (titleIsGeneric && requestText && body.auto_run !== true) {
      scheduleThreadTitle({
        threadId,
        authorization: authHeader,
        requestText: displayText,
      });
    }

    const resolvedModel = resolveAiModelSelection({ body, thread, requestText, hasAttachments: attachmentIds.length > 0, allowTools: true });
    assertExecutableAiProvider(resolvedModel.provider);
    const requestAttachments = Array.isArray(body.attachments) ? body.attachments : [];
    // Independent setup work runs in parallel (was 4 sequential awaits).
    const [recentMessages, recentThreadArtifacts, currentContent] = await Promise.all([
      loadRecentConversation(db, thread, userMessageId),
      loadRecentThreadArtifacts(db, threadId),
      buildCurrentUserMessageContent(supabaseService, requestText, requestAttachments),
      bindQuotaRunPromise,
    ]);
    trace.mark("context_loaded");
    const openRouterMetadata = resolvedModel.provider === "openrouter"
      ? await openRouterModelMetadata(resolvedModel.model)
      : null;
    const modelSupportsTools = resolvedModel.provider === "openrouter"
      ? openRouterMetadata?.supportsTools === true
      : resolvedModel.provider === "openai";
    const modelContextLimit = resolvedModel.provider === "openrouter"
      ? openRouterMetadata?.contextLength ?? null
      : nativeModelContextLimit(resolvedModel.provider, resolvedModel.model);
    const selectedTools = modelSupportsTools ? MODEL_TOOLS : [];
    // Static system prompt first (stable prompt-cache prefix); volatile per-turn
    // facts go into a context message just before the current user message.
    const systemPrompt = buildArtifactOnlySystemPrompt();
    const turnContextPrompt = buildTurnContextPrompt({
      scope,
      selectedArtifactContext,
      targets,
      ambientContext,
      recentThreadArtifacts,
      taggedBrandTemplates,
    });
    const modelMessages = [
      { role: "system", content: systemPrompt },
      ...recentMessages,
      ...(turnContextPrompt ? [{ role: "system", content: turnContextPrompt }] : []),
      ...(!modelSupportsTools ? [{ role: "system", content: "MODEL CAPABILITY: The explicitly selected model does not expose native function tools through OpenRouter. It remains available for conversation and content generation, but it cannot read or mutate workspace data in this run. Do not claim that a workspace change was applied." }] : []),
      { role: "user", content: currentContent },
    ];
    const contextComposition = buildContextComposition({
      systemPrompt,
      recentMessages,
      turnContextPrompt,
      currentContent,
      tools: selectedTools,
    });
    const ctx = {
      ai_run_id: activeRunId,
      current_user_request: requestText,
      selected_artifact_context: selectedArtifactContext,
      request_auth_header: authHeader,
      ai_token_quota: tokenQuotaContext,
      abort_signal: req.signal,
      project_id: scope.project_id,
      task_id: scope.task_id,
      channel_id: scope.channel_id,
    };

    const wantsStream = body.stream === true;
    const streamStats = createOutboundStreamStats();
    const streamStartedAtMs = performance.now();
    const execute = async (onEvent?: (event: any) => void | Promise<void>) => runArtifactConversation({
      db, supabaseService, thread, provider: resolvedModel.provider, model: resolvedModel.model, messages: modelMessages, tools: selectedTools,
      ctx, trace, attachments: requestAttachments, onEvent, streamStats, streamStartedAtMs,
    });

    const finalize = async (result: any) => {
      const latencyMs = Math.round(performance.now() - startedAt);
      const assistant = await persistAssistantMessage({
        supabaseService, threadId, runId: activeRunId, provider: resolvedModel.provider, model: resolvedModel.model,
        text: result.assistantText, usage: result.usage, toolResults: result.toolResults, buildIds: result.buildIds,
        clarification: result.clarification, latencyMs, scope, streamStats: result.streamStats ?? streamStats,
        contextComposition, contextLimit: modelContextLimit,
      });
      scheduleThreadContextSummary(supabaseService, threadId);
      return { assistant, run_id: activeRunId, ...result };
    };

    if (!wantsStream) {
      const result = await execute();
      const completed = await finalize(result);
      return new Response(JSON.stringify({ message: completed.assistant, run_id: activeRunId, build_ids: result.buildIds, clarification_request: result.clarification }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const encoder = new TextEncoder();
    // Defeat intermediary buffering (nginx / edge proxies often wait for ~2–4KB
    // or until the response ends before forwarding the first bytes). Use a
    // control marker — never raw padding that could leak into assistant text.
    const STREAM_FLUSH_PADDING = `${STREAM_STATUS_PREFIX}${JSON.stringify({
      type: "status",
      phase: "keepalive",
      text: "",
      pad: " ".repeat(2048),
    })}\n`;
    const stream = new ReadableStream({
      async start(controller) {
        let sequence = Date.now();
        let clearedStatusForText = false;
        let markedFirstEvent = false;
        let enqueuesSinceYield = 0;
        const noteEnqueue = (kind: "control" | "text", byteLength: number) => {
          const elapsed = Math.round(performance.now() - streamStartedAtMs);
          streamStats.outbound_enqueue_count += 1;
          if (streamStats.first_outbound_enqueue_ms == null) streamStats.first_outbound_enqueue_ms = elapsed;
          streamStats.last_outbound_enqueue_ms = elapsed;
          if (kind === "text") {
            streamStats.outbound_text_enqueue_count += 1;
            streamStats.outbound_text_chars += byteLength;
            if (streamStats.first_outbound_text_ms == null) {
              streamStats.first_outbound_text_ms = elapsed;
              console.log("ai-chat stream first outbound text", {
                run_id: activeRunId,
                ms: elapsed,
                chars: byteLength,
              });
            }
          }
        };
        const enqueueBytes = async (bytes: Uint8Array, kind: "control" | "text" = "control") => {
          controller.enqueue(bytes);
          noteEnqueue(kind, bytes.byteLength);
          enqueuesSinceYield += 1;
          // Yield so the Deno/Supabase runtime can flush TCP chunks to the client
          // instead of buffering the whole turn until controller.close().
          if (kind === "text" || enqueuesSinceYield >= 2) {
            enqueuesSinceYield = 0;
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
          }
        };
        const emitStatus = async (event: any) => {
          sequence += 1;
          const payload = { sequence, emitted_at: new Date().toISOString(), ...event };
          const eventType = typeof payload.type === "string" ? payload.type : "";
          if (eventType === "assistant_text_reset") {
            clearedStatusForText = false;
            await enqueueBytes(encoder.encode(`${STREAM_STATUS_PREFIX}${JSON.stringify({
              type: "assistant_text_reset",
              phase: "reset",
              sequence,
              emitted_at: new Date().toISOString(),
            })}\n`));
            return;
          }
          if (eventType === "narration") {
            const text = typeof payload.text === "string" ? payload.text.trim() : "";
            if (!text) return;
            const round = Number.isFinite(Number(payload.round)) ? Number(payload.round) : 0;
            sequence += 1;
            await enqueueBytes(encoder.encode(`${STREAM_EXECUTION_TRACE_PREFIX}${JSON.stringify({
              type: "execution_trace",
              sequence,
              emitted_at: new Date().toISOString(),
              step_id: `narration:${round}:${sequence}`,
              phase: "completed",
              category: "planning",
              text,
              details: {
                source: "assistant_narration",
                round,
              },
            })}\n`));
            return;
          }
          if (eventType === "assistant_text_delta") {
            const delta = typeof payload.delta === "string" ? payload.delta : "";
            if (!delta) return;
            if (!clearedStatusForText) {
              clearedStatusForText = true;
              sequence += 1;
              await enqueueBytes(encoder.encode(`${STREAM_STATUS_PREFIX}${JSON.stringify({
                type: "status",
                phase: "streaming",
                text: "",
                sequence,
                emitted_at: new Date().toISOString(),
              })}\n`));
            }
            // Plain text bytes — consumeTextStream paints these as they arrive.
            await enqueueBytes(encoder.encode(delta), "text");
            return;
          }
          if (eventType === "ai_change_preview") {
            await enqueueBytes(encoder.encode(`${STREAM_CHANGE_PREVIEW_PREFIX}${JSON.stringify(payload)}\n`));
            return;
          }
          await enqueueBytes(encoder.encode(`${STREAM_STATUS_PREFIX}${JSON.stringify(payload)}\n`));
          if (!markedFirstEvent && activeRunId) {
            markedFirstEvent = true;
            void updateAiChatRun(supabaseService, activeRunId, { mark_first_event: true });
          }
          const toolName = typeof payload.tool_name === "string" ? payload.tool_name.trim() : "";
          if (toolName && (eventType === "tool_started" || eventType === "tool_finished")) {
            const round = Number.isFinite(Number(payload.round)) ? Number(payload.round) : 0;
            const toolCallId = typeof payload.tool_call_id === "string" ? payload.tool_call_id.trim() : "";
            const toolIndex = Number.isFinite(Number(payload.tool_index)) ? Number(payload.tool_index) : null;
            const ok = payload.ok !== false;
            const phase =
              eventType === "tool_started"
                ? "started"
                : ok
                  ? "completed"
                  : "failed";
            const category =
              /^(list_|search_|read_|get_|ai_list_|ai_search_|ai_read_|ai_get_)/.test(toolName)
                ? "discovery"
                : /^(ai_start_|ai_build_)/.test(toolName)
                  ? "generation"
                  : /^(ai_update_|ai_create_|ai_save_|ai_attach_)/.test(toolName)
                    ? "mutation"
                    : "discovery";
            const text =
              typeof payload.text === "string" && payload.text.trim()
                ? payload.text.trim()
                : eventType === "tool_started"
                  ? `Using ${toolName}…`
                  : ok
                    ? `Finished ${toolName}.`
                    : `${toolName} failed.`;
            const stepId = toolCallId
              ? `tool:${round}:${toolCallId}`
              : toolIndex != null
                ? `tool:${round}:${toolName}:${toolIndex}`
                : `tool:${round}:${toolName}`;
            sequence += 1;
            const publishingPreview =
              payload.publishing_preview && typeof payload.publishing_preview === "object"
                ? payload.publishing_preview
                : null;
            await enqueueBytes(encoder.encode(`${STREAM_EXECUTION_TRACE_PREFIX}${JSON.stringify({
              type: "execution_trace",
              sequence,
              emitted_at: new Date().toISOString(),
              step_id: stepId,
              phase,
              category,
              text,
              details: {
                tool_name: toolName,
                round,
                ...(toolCallId ? { tool_call_id: toolCallId } : {}),
                ...(toolIndex != null ? { tool_index: toolIndex } : {}),
                source: "ai_status",
                ...(publishingPreview ? { publishing_preview: publishingPreview } : {}),
              },
            })}\n`));
          }
        };
        try {
          await emitStatus({ type: "status", phase: "started", text: "Reviewing the request and current context…" });
          // Force proxies to start forwarding before the model finishes.
          await enqueueBytes(encoder.encode(STREAM_FLUSH_PADDING));
          const result = await execute(emitStatus);
          const completed = await finalize(result);
          if (result.clarification) {
            await enqueueBytes(encoder.encode(`__AI_CLARIFICATION__${JSON.stringify(result.clarification)}\n`));
          }
          const persistedToolResults = Array.isArray(result.toolResults)
            ? result.toolResults.map(toolResultForPersistence)
            : [];
          await enqueueBytes(encoder.encode(`__AI_MESSAGE_OUTPUT__${JSON.stringify({
            type: "message_output",
            phase: "completed",
            thread_id: threadId,
            message_id: completed.assistant?.id ?? null,
            output_kind: result.buildIds.length && !(result.assistantText || "").trim() ? "artifact_build_control" : result.clarification ? "clarification" : "text",
            ui_visibility: result.buildIds.length && !(result.assistantText || "").trim() ? "hidden" : "visible",
            build_ids: result.buildIds,
            content_text: result.assistantText,
            clarification_request: result.clarification ?? null,
            assets: [],
            // Keep publishing discovery fields on the live client — stream finalize
            // otherwise replaces content_json with text blocks and drops tool_results.
            content_json: {
              output_kind: result.buildIds.length && !(result.assistantText || "").trim() ? "artifact_build_control" : result.clarification ? "clarification" : "text",
              ui_visibility: result.buildIds.length && !(result.assistantText || "").trim() ? "hidden" : "visible",
              ...(persistedToolResults.length ? { tool_results: persistedToolResults } : {}),
              ...(result.buildIds.length ? { build_ids: result.buildIds } : {}),
              ...(result.clarification ? { clarification_request: result.clarification } : {}),
            },
          })}\n`));
          await emitStatus({ type: "message.completed", phase: "completed", run_id: activeRunId, message_id: completed.assistant?.id ?? null, usage: result.usage });
          controller.close();
        } catch (error) {
          const publicError = publicRunError(error);
          if (activeRunId) await updateAiChatRun(supabaseService, activeRunId, { status: publicError.code === "cancelled" ? "cancelled" : "failed", error_code: publicError.code, error_message: publicError.message });
          try {
            await enqueueBytes(encoder.encode(`${STREAM_STATUS_PREFIX}${JSON.stringify({ type: "run.failed", phase: "failed", run_id: activeRunId, code: publicError.code, retryable: publicError.retryable, message: publicError.message })}\n`));
          } catch {
            // Controller may already be closed.
          }
          try { controller.close(); } catch { /* ignore */ }
        }
      },
    });
    // text/plain (not event-stream): the body uses __AI_*__ markers + raw text
    // deltas. Labeling it as SSE makes the browser client buffer/drop chunks.
    return new Response(stream, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Content-Type-Options": "nosniff",
        "X-Accel-Buffering": "no",
        ...(activeRunId ? { "X-AI-Run-Id": activeRunId } : {}),
      },
    });
  } catch (error) {
    const publicError = publicRunError(error);
    if (activeRunId && supabaseService) await updateAiChatRun(supabaseService, activeRunId, { status: publicError.code === "cancelled" ? "cancelled" : "failed", error_code: publicError.code, error_message: publicError.message });
    return new Response(JSON.stringify({ error: publicError, run_id: activeRunId, usage: publicError.usage ?? tokenQuotaContext?.latestUsage ?? null }), { status: publicError.status ?? 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}


Deno.serve(handleAiChatRequest);
