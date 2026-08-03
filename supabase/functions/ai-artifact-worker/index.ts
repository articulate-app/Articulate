import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  applyArtifactPatches,
  artifactDiffPlainFromContent,
  buildHtmlFlatIndexMap,
  ensureRichTextBlocksHaveHtml,
  extractPrimaryArtifactHtml,
  finalizeArtifactUpdateContent,
  mergeArtifactSelection,
  type ArtifactSelectionLike,
} from "./artifact-selection-patch.ts";

function cleanPersistedArtifactMetadata(meta: unknown): Record<string, unknown> {
  const next =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? { ...(meta as Record<string, unknown>) }
      : {}
  delete next.selection_patch
  delete next.selection_context
  return next
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const ARTIFACT_MODEL = Deno.env.get("OPENAI_ARTIFACT_MODEL") ?? Deno.env.get("OPENAI_BUILD_MODEL") ?? Deno.env.get("OPENAI_MODEL_FAST") ?? "gpt-5.4-mini";
const MAX_COMPLETION_TOKENS = Math.max(2000, Math.min(30000, Number(Deno.env.get("OPENAI_ARTIFACT_MAX_COMPLETION_TOKENS") ?? 16000) || 16000));
// Keep streaming previews snappy in-session, but avoid flooding durable events
// (refresh rehydrates from the event tail — dozens of full-body previews hurt).
// Heartbeats only (no body). Keep very sparse: each appendEvent is an RPC and
// full-doc rewrites OOM the isolate when combined with huge tool-arg buffers.
const PREVIEW_EMIT_MIN_CHARS = 4000;
const PREVIEW_EMIT_MIN_MS = 6000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ai-build-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class ArtifactBuildError extends Error {
  code: string;
  retryable: boolean;
  usage: any;
  constructor(code: string, message: string, retryable = false, usage: any = null) {
    super(message);
    this.name = "ArtifactBuildError";
    this.code = code;
    this.retryable = retryable;
    this.usage = usage;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function uuidOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Body fields must not be recursively starved — nested /8 caps were truncating HTML to ~800 chars. */
const COMPACT_FULL_STRING_KEYS = new Set([
  "content_text",
  "html",
  "content_html",
  "selected_text",
  "selection_before",
  "selection_after",
  "replacement_markdown",
  "text",
]);

function compact(value: any, max = 30000, keyHint = ""): any {
  if (value == null) return null;
  if (typeof value === "string") {
    const budget = COMPACT_FULL_STRING_KEYS.has(keyHint) ? Math.max(max, 200000) : max;
    return value.slice(0, budget);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 160).map((item) => compact(item, Math.max(4000, Math.floor(max / 4)), keyHint));
  }
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [key, item] of Object.entries(value).slice(0, 200)) {
      const childMax = COMPACT_FULL_STRING_KEYS.has(key) || key === "content_json" || key === "blocks"
        ? Math.max(max, 200000)
        : Math.max(2000, Math.floor(max / 4));
      out[key] = compact(item, childMax, key);
    }
    return out;
  }
  return value;
}

/**
 * Keep the document body for the model without blowing the edge-isolate heap.
 * Prefer HTML (source of truth); cap both fields so retries of long articles
 * do not hit WORKER_RESOURCE_LIMIT.
 */
function compactArtifactForModel(artifact: any, max = 80000): any {
  if (!artifact || typeof artifact !== "object") return compact(artifact, max);
  const {
    content_text: contentText,
    content_json: contentJson,
    asset_data: assetData,
    ...rest
  } = artifact;
  const htmlBudget = 100000;
  const textBudget = 50000;
  let nextJson = contentJson ?? null;
  if (nextJson && typeof nextJson === "object" && Array.isArray((nextJson as any).blocks)) {
    nextJson = {
      ...(nextJson as Record<string, unknown>),
      blocks: (nextJson as { blocks: Array<Record<string, unknown>> }).blocks.map((block) => {
        if (!block || typeof block !== "object") return block;
        const html = typeof block.html === "string" ? block.html : null;
        if (!html || html.length <= htmlBudget) return block;
        return { ...block, html: html.slice(0, htmlBudget) };
      }),
    };
  }
  return {
    ...compact(rest, max),
    content_text: typeof contentText === "string" ? contentText.slice(0, textBudget) : contentText ?? null,
    content_json: nextJson,
    // Assets are referenced from HTML figures; omit bulky blobs from the model prompt.
    asset_data: assetData && typeof assetData === "object"
      ? { assets: Array.isArray((assetData as any).assets) ? (assetData as any).assets.slice(0, 40).map((asset: any) => ({
          id: asset?.id ?? asset?.attachment_id ?? null,
          attachment_id: asset?.attachment_id ?? null,
          type: asset?.type ?? null,
          file_name: asset?.file_name ?? asset?.fileName ?? null,
        })) : [] }
      : null,
  };
}

function normalizeUsage(raw: any) {
  const usage = raw?.usage ?? raw ?? {};
  const prompt = Math.max(0, Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0);
  const completion = Math.max(0, Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || 0);
  const total = Math.max(0, Number(usage.total_tokens ?? prompt + completion) || 0);
  const cached = Math.max(0, Number(usage.prompt_tokens_details?.cached_tokens ?? usage.input_tokens_details?.cached_tokens ?? 0) || 0);
  return { prompt_tokens: Math.round(prompt), completion_tokens: Math.round(completion), total_tokens: Math.round(total), cached_prompt_tokens: Math.round(cached) };
}

function mergeUsage(a: any, b: any) {
  const left = normalizeUsage(a);
  const right = normalizeUsage(b);
  return {
    prompt_tokens: left.prompt_tokens + right.prompt_tokens,
    completion_tokens: left.completion_tokens + right.completion_tokens,
    total_tokens: left.total_tokens + right.total_tokens,
    cached_prompt_tokens: left.cached_prompt_tokens + right.cached_prompt_tokens,
  };
}

/** Extract a growing JSON string field from incomplete tool-call argument fragments. */
function extractPartialJsonStringField(argsSoFar: string, field: string): string | null {
  const marker = `"${field}"`;
  const idx = argsSoFar.indexOf(marker);
  if (idx < 0) return null;
  let i = idx + marker.length;
  while (i < argsSoFar.length && /[\s:]/.test(argsSoFar[i]!)) i += 1;
  if (argsSoFar[i] !== '"') return null;
  i += 1;
  let out = "";
  while (i < argsSoFar.length) {
    const ch = argsSoFar[i]!;
    if (ch === "\\") {
      const next = argsSoFar[i + 1];
      if (next == null) break;
      if (next === "n") out += "\n";
      else if (next === "r") out += "\r";
      else if (next === "t") out += "\t";
      else if (next === '"') out += '"';
      else if (next === "\\") out += "\\";
      else if (next === "/") out += "/";
      else if (next === "u" && /^[0-9a-fA-F]{4}/.test(argsSoFar.slice(i + 2, i + 6))) {
        out += String.fromCharCode(parseInt(argsSoFar.slice(i + 2, i + 6), 16));
        i += 6;
        continue;
      } else out += next;
      i += 2;
      continue;
    }
    if (ch === '"') break;
    out += ch;
    i += 1;
  }
  return out;
}

function normalizeArtifactContentJson(contentJson: any, contentText: string) {
  if (contentJson && typeof contentJson === "object" && Array.isArray(contentJson.sections) && (!Array.isArray(contentJson.blocks) || contentJson.blocks.length === 0)) {
    const sections = contentJson.sections;
    const blocks: any[] = [];
    sections.forEach((section: any, index: number) => {
      const heading = String(section?.heading ?? section?.title ?? "").trim();
      const body = String(section?.body ?? section?.content ?? section?.text ?? "").trim();
      const level = Math.min(Math.max(Number(section?.level) || 2, 1), 4);
      if (heading) {
        blocks.push({ id: `section-h-${index + 1}`, type: "heading", level, text: heading });
      }
      if (body) {
        blocks.push({ id: `section-b-${index + 1}`, type: "rich_text", text: body });
      }
    });
    if (blocks.length > 0) {
      return ensureRichTextBlocksHaveHtml({
        ...(contentJson && typeof contentJson === "object" ? contentJson : {}),
        version: Number(contentJson?.version) || 1,
        blocks,
      }, contentText);
    }
  }
  return ensureRichTextBlocksHaveHtml(contentJson, contentText);
}

function resolveUnitSelection(context: any): ArtifactSelectionLike | null {
  const spec = context?.unit?.input_snapshot?.artifact_spec ?? {};
  const merged = mergeArtifactSelection(spec?.selection ?? null, null);
  return merged as ArtifactSelectionLike | null;
}

async function appendEvent(supabase: any, args: { buildId: string; unitId?: string | null; eventType: string; phase?: string; payload?: any }) {
  const { error } = await supabase.rpc("ai_append_build_event_v1", {
    p_build_id: args.buildId,
    p_event_type: args.eventType,
    p_phase: args.phase ?? "progress",
    p_unit_id: args.unitId ?? null,
    p_payload: args.payload ?? {},
  });
  if (error) console.error("ai-artifact-worker event append failed", error);
}

async function pumpNext(authorization: string, buildId: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/ai-build-orchestrator`, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json", "X-AI-Build-Id": buildId },
      body: JSON.stringify({ build_id: buildId, action: "pump" }),
    });
  } catch (error) {
    console.error("ai-artifact-worker next pump failed", error);
  }
}

async function callAiTools(authorization: string, toolName: string, args: any, context: any) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-tools`, {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ tool_name: toolName, arguments: args ?? {}, context: context ?? {} }),
    signal: AbortSignal.timeout(120000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ArtifactBuildError("tool_endpoint_failed", String(data?.error?.message ?? data?.error ?? `ai-tools_http_${response.status}`), response.status >= 500);
  return data;
}

const WORKER_READ_TOOLS = [
  {
    type: "function",
    function: {
      name: "read_source",
      description: "Read a source input by id when the source summary in the initial context is insufficient.",
      parameters: { type: "object", additionalProperties: false, properties: { source_id: { type: "string" }, version_number: { type: ["integer", "null"] } }, required: ["source_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "read_artifact",
      description: "Read an existing artifact or source artifact when editing, translating or adapting it.",
      parameters: { type: "object", additionalProperties: false, properties: { artifact_id: { type: "string" }, version_number: { type: ["integer", "null"] }, content_mode: { type: ["string", "null"], enum: ["full", "summary", null] } }, required: ["artifact_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "read_public_webpage",
      description: "Read one public webpage only when the current task requires external page content that is not already available as a source.",
      parameters: { type: "object", additionalProperties: false, properties: { url: { type: "string" } }, required: ["url"] },
    },
  },
];

const SAVE_FULL_TOOL = {
  type: "function",
  function: {
    name: "save_artifact_version",
    description: "Save the complete updated artifact document. Prefer apply_artifact_patches for surgical edits. Use this for create/large rewrites when returning the full body is simpler. Put the authoritative body in content_json.blocks[].html (preserve <figure data-attachment-id> media you are not changing). content_text is a shorter plain mirror. Call exactly once per successful run (either this or apply_artifact_patches).",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: { type: "string", enum: ["draft", "ready", "review"] },
        summary: { type: "string" },
        title: { type: ["string", "null"] },
        content_text: { type: "string" },
        content_json: { type: "object", additionalProperties: true },
        asset_data: { type: ["object", "null"], additionalProperties: true },
        metadata: { type: ["object", "null"], additionalProperties: true },
        change_summary: { type: ["string", "null"] },
      },
      required: ["status", "summary", "content_text", "content_json"],
    },
  },
};

const APPLY_PATCHES_TOOL = {
  type: "function",
  function: {
    name: "apply_artifact_patches",
    description: "Surgically edit the current artifact by applying one or more model-specified patches, then save. You choose every target — do not ask the server to infer sections. Prefer old_html/new_html exact substrings from the artifact HTML in the prompt. Alternatively use plain_start/plain_end on artifact_plain_for_offsets with expected_text that must equal that slice. Or remove_attachment_id for a figure. Multiple non-overlapping patches are applied together.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: { type: "string", enum: ["draft", "ready", "review"] },
        summary: { type: "string" },
        title: { type: ["string", "null"] },
        change_summary: { type: ["string", "null"] },
        patches: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              old_html: { type: ["string", "null"] },
              new_html: { type: ["string", "null"] },
              old_text: { type: ["string", "null"] },
              new_text: { type: ["string", "null"] },
              occurrence: { type: ["integer", "null"] },
              plain_start: { type: ["integer", "null"] },
              plain_end: { type: ["integer", "null"] },
              expected_text: { type: ["string", "null"] },
              remove_attachment_id: { type: ["string", "null"] },
            },
          },
        },
      },
      required: ["status", "summary", "patches"],
    },
  },
};

const WORKER_TOOLS = [...WORKER_READ_TOOLS, APPLY_PATCHES_TOOL, SAVE_FULL_TOOL];

async function callModelRound(args: {
  supabase: any;
  context: any;
  unitId: string;
  buildId: string;
  round: number;
  messages: any[];
  tools: any[];
  /** Non-streaming avoids SSE + growing tool-arg buffers that OOM the isolate. */
  stream?: boolean;
  maxCompletionTokens?: number;
  onSaveArgsProgress?: (partial: { contentText: string; title: string | null }) => Promise<void> | void;
}) {
  const useStream = args.stream === true;
  const maxCompletionTokens = Math.max(
    1200,
    Math.min(MAX_COMPLETION_TOKENS, Number(args.maxCompletionTokens ?? MAX_COMPLETION_TOKENS) || MAX_COMPLETION_TOKENS),
  );
  const body: Record<string, unknown> = {
    model: ARTIFACT_MODEL,
    temperature: 0.2,
    max_completion_tokens: maxCompletionTokens,
    stream: useStream,
    messages: args.messages,
    tools: args.tools,
    tool_choice: "auto",
    parallel_tool_calls: false,
  };
  if (useStream) body.stream_options = { include_usage: true };
  const bodyText = JSON.stringify(body);
  const estimatedPrompt = Math.max(1, Math.ceil(new TextEncoder().encode(bodyText).byteLength / 3.2));
  const { data: reservation, error: reserveError } = await args.supabase.rpc("ai_reserve_token_call", {
    p_thread_id: args.context?.build?.thread_id,
    p_client_request_id: args.unitId,
    p_call_key: `artifact_agent_round_${args.round}`,
    p_stage: "artifact_agent",
    p_provider: "openai",
    p_model: ARTIFACT_MODEL,
    p_estimated_prompt_tokens: estimatedPrompt,
    p_estimated_completion_tokens: maxCompletionTokens,
    p_run_id: args.context?.build?.ai_run_id ?? null,
    p_metadata: { build_id: args.buildId, unit_id: args.unitId, artifact_id: args.context?.artifact?.id ?? null, round: args.round },
  });
  if (reserveError) throw new ArtifactBuildError("token_accounting_unavailable", reserveError.message, true);
  if (reservation?.allowed !== true) throw new ArtifactBuildError(String(reservation?.code ?? "token_limit_exceeded"), "The artifact build cannot continue within the current token allowance.", false, reservation?.usage ?? null);

  const eventId = String(reservation.event_id ?? "");
  let response: Response | null = null;
  let usage = normalizeUsage(null);
  let succeeded = false;
  let errorCode: string | null = null;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: bodyText,
      signal: AbortSignal.timeout(180000),
    });
    if (!response.ok) {
      const responseText = await response.text();
      let data: any = null;
      try { data = JSON.parse(responseText); } catch { data = null; }
      usage = normalizeUsage(data?.usage);
      errorCode = `provider_http_${response.status}`;
      throw new ArtifactBuildError(errorCode, String(data?.error?.message ?? responseText).slice(0, 2000), [408, 409, 429].includes(response.status) || response.status >= 500, usage);
    }

    if (!useStream) {
      const data = await response.json();
      usage = normalizeUsage(data?.usage);
      const message = data?.choices?.[0]?.message ?? {};
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      if (args.onSaveArgsProgress) {
        for (const toolCall of toolCalls) {
          const toolName = String(toolCall?.function?.name ?? "");
          if (toolName !== "save_artifact_version" && toolName !== "apply_artifact_patches") continue;
          let parsed: any = {};
          try { parsed = JSON.parse(String(toolCall?.function?.arguments ?? "{}")); } catch { parsed = {}; }
          const partialText = String(
            parsed.content_text
            ?? (Array.isArray(parsed.patches)
              ? parsed.patches.map((p: any) => String(p?.new_html ?? p?.new_text ?? "")).join("\n")
              : ""),
          );
          if (partialText.trim()) {
            await args.onSaveArgsProgress({
              contentText: partialText,
              title: typeof parsed.title === "string" ? parsed.title : null,
            });
          }
        }
      }
      succeeded = true;
      return {
        message: {
          role: "assistant",
          content: typeof message.content === "string" ? message.content : null,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        usage,
      };
    }

    const reader = response.body?.getReader();
    if (!reader) throw new ArtifactBuildError("provider_stream_unavailable", "OpenAI stream body was empty.", true);
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    const toolCallsByIndex = new Map<number, { id: string; type: string; function: { name: string; arguments: string } }>();
    let lastPreviewChars = 0;
    let lastPreviewAt = 0;

    const maybeEmitPreview = async () => {
      if (!args.onSaveArgsProgress) return;
      for (const toolCall of toolCallsByIndex.values()) {
        const toolName = toolCall.function.name;
        if (toolName !== "save_artifact_version" && toolName !== "apply_artifact_patches") continue;
        const partialText =
          extractPartialJsonStringField(toolCall.function.arguments, "content_text")
          || extractPartialJsonStringField(toolCall.function.arguments, "new_html");
        if (!partialText || partialText.length < PREVIEW_EMIT_MIN_CHARS) continue;
        const now = Date.now();
        if (
          partialText.length - lastPreviewChars < PREVIEW_EMIT_MIN_CHARS
          || now - lastPreviewAt < PREVIEW_EMIT_MIN_MS
        ) {
          continue;
        }
        lastPreviewChars = partialText.length;
        lastPreviewAt = now;
        const partialTitle = extractPartialJsonStringField(toolCall.function.arguments, "title");
        await args.onSaveArgsProgress({ contentText: partialText, title: partialTitle });
      }
    };

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
        if (chunk?.usage) usage = normalizeUsage(chunk.usage);
        const choice = chunk?.choices?.[0];
        const delta = choice?.delta ?? {};
        if (typeof delta.content === "string") content += delta.content;
        if (Array.isArray(delta.tool_calls)) {
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
          await maybeEmitPreview();
        }
      }
    }

    await maybeEmitPreview();
    succeeded = true;
    const tool_calls = [...toolCallsByIndex.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, value]) => value)
      .filter((value) => value.id && value.function.name);
    return {
      message: {
        role: "assistant",
        content: content || null,
        ...(tool_calls.length > 0 ? { tool_calls } : {}),
      },
      usage,
    };
  } catch (error: any) {
    if (error instanceof ArtifactBuildError) throw error;
    errorCode = error?.name === "TimeoutError" || error?.name === "AbortError" ? "provider_timeout" : "provider_fetch_failed";
    throw new ArtifactBuildError(errorCode, error?.message ?? String(error), true, usage);
  } finally {
    const { error: finalizeError } = await args.supabase.rpc("ai_finalize_token_call", {
      p_event_id: eventId,
      p_run_id: args.context?.build?.ai_run_id ?? null,
      p_provider_request_id: response?.headers.get("x-request-id") ?? null,
      p_provider_http_status: response?.status ?? null,
      p_prompt_tokens: usage.prompt_tokens,
      p_completion_tokens: usage.completion_tokens,
      p_cached_prompt_tokens: usage.cached_prompt_tokens,
      p_total_tokens: usage.total_tokens,
      p_succeeded: succeeded,
      p_error_code: errorCode,
      p_metadata: { build_id: args.buildId, unit_id: args.unitId, artifact_id: args.context?.artifact?.id ?? null, round: args.round },
    });
    if (finalizeError) console.error("ai-artifact-worker token finalization failed", finalizeError);
  }
}

function buildInitialMessages(
  context: any,
  selection: ArtifactSelectionLike | null,
) {
  const artifact = context?.artifact ?? {};
  const unit = context?.unit ?? {};
  const spec = unit?.input_snapshot?.artifact_spec ?? {};

  const system = [
    "You are a durable artifact-generation agent. Complete exactly the artifact in the current work unit.",
    "Sources are inputs; artifacts are outputs. Read a source only when its summary is insufficient.",
    "SELECTED ARTIFACT CONTEXT (if present) is factual UI context about what the user highlighted — not a write lock and not a scope limiter. Interpret the user request yourself.",
    "Prefer apply_artifact_patches for surgical edits: you specify exact old_html/new_html (or verified plain_start/plain_end+expected_text on artifact_plain_for_offsets). You may pass multiple non-overlapping patches.",
    "Use save_artifact_version when creating a new document or when a full rewrite is simpler. Always return the full updated document in that case.",
    "Put authoritative HTML in content_json.blocks[].html when using save_artifact_version. Preserve <figure data-attachment-id> media you are not changing.",
    "CRITICAL — LISTS: Use real HTML lists only: <ul><li>…</li></ul> or <ol><li>…</li></ol>. Never leave markdown bullets (- item) or bare numbered lines as plain text.",
    "Call exactly one of apply_artifact_patches or save_artifact_version to finish.",
    "Do not return placeholders or hidden reasoning.",
  ].join(" ");
  const artifactHtml = extractPrimaryArtifactHtml(artifact?.content_json) ?? ""
  const plainForOffsets = artifactHtml
    ? buildHtmlFlatIndexMap(artifactHtml).plain
    : (typeof artifact?.content_text === "string" ? artifact.content_text : "")
  const user = {
    request: context?.build?.request_text ?? unit?.instruction ?? "",
    task_instruction: unit?.instruction ?? "",
    operation: unit?.input_snapshot?.artifact_operation ?? spec?.operation ?? "create",
    artifact: compactArtifactForModel(artifact, 60000),
    // Same plain string used to validate plain_start/plain_end patches.
    artifact_plain_for_offsets: plainForOffsets.slice(0, 120000),
    artifact_plain_length: plainForOffsets.length,
    artifact_spec: compact(spec, 12000),
    task_keywords: compact(context?.task_keywords, 8000),
    source_summaries: compact(context?.sources ?? context?.source_summaries ?? [], 12000),
    selected_artifact_context: compact(selection ?? spec?.selection ?? null, 12000),
  };
  return [{ role: "system", content: system }, { role: "user", content: JSON.stringify(user) }];
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: { code: "method_not_allowed" } }, 405);

  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization) return json({ error: { code: "authentication_required" } }, 401);
  const body = await request.json().catch(() => ({}));
  const buildId = uuidOrNull((body as any).build_id ?? request.headers.get("X-AI-Build-Id"));
  const unitId = uuidOrNull((body as any).unit_id);
  const leaseToken = uuidOrNull((body as any).lease_token);
  if (!buildId || !unitId || !leaseToken) return json({ error: { code: "build_unit_lease_required" } }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let context: any = null;
  let usage = normalizeUsage(null);
  let saved: any[] = [];
  const failed: any[] = [];
  let terminalFailureRecorded = false;

  try {
    const { data: baseContext, error: baseError } = await supabase.rpc("ai_get_build_work_unit_context_v1", {
      p_build_id: buildId,
      p_unit_id: unitId,
      p_lease_token: leaseToken,
    });
    if (baseError || baseContext?.ok === false) throw new ArtifactBuildError("build_context_failed", baseError?.message ?? baseContext?.error ?? "Could not load the artifact work unit.");
    if (String(baseContext?.unit?.unit_type ?? "") !== "artifact") throw new ArtifactBuildError("artifact_unit_required", "The artifact worker received a non-artifact work unit.");
    const artifactId = uuidOrNull(baseContext?.unit?.input_snapshot?.artifact_id);
    if (!artifactId) throw new ArtifactBuildError("artifact_id_missing_from_unit", "The artifact work unit has no artifact id.");

    const { data: generationContext, error: contextError } = await supabase.rpc("ai_get_artifact_generation_context_v4", {
      p_build_id: buildId,
      p_unit_id: unitId,
      p_lease_token: leaseToken,
      p_artifact_id: artifactId,
    });
    if (contextError || generationContext?.ok === false) throw new ArtifactBuildError("artifact_generation_context_failed", contextError?.message ?? generationContext?.error ?? "Could not load artifact generation context.");
    context = generationContext;

    // Canonical plain from HTML so UI diffs don't treat format round-trips as full rewrites.
    const beforeContentText =
      artifactDiffPlainFromContent(
        typeof context?.artifact?.content_text === "string"
          ? context.artifact.content_text
          : typeof context?.source_artifact?.content_text === "string"
            ? context.source_artifact.content_text
            : null,
        context?.artifact?.content_json ?? context?.source_artifact?.content_json ?? null,
      ) || null;

    const selection = resolveUnitSelection(context);
    const hasSelectionContext = !!selection && (
      Boolean(String(selection.selected_text ?? "").trim())
      || (Number.isFinite(Number(selection.selection_start)) && Number.isFinite(Number(selection.selection_end)))
      || (selection.text_range != null && Number.isFinite(Number((selection.text_range as any)?.start)))
    );
    const existingAssetData =
      context?.artifact?.asset_data && typeof context.artifact.asset_data === "object"
        ? context.artifact.asset_data
        : { assets: [] };

    await appendEvent(supabase, {
      buildId,
      unitId,
      eventType: "artifact.started",
      phase: "running",
      payload: {
        artifact_id: artifactId,
        task_id: context?.artifact?.task_id ?? context?.unit?.task_id ?? null,
        project_id: context?.artifact?.project_id ?? context?.unit?.project_id ?? null,
        title: context?.artifact?.title ?? null,
        artifact_type: context?.artifact?.artifact_type ?? "document",
        operation: context?.unit?.input_snapshot?.artifact_operation ?? null,
        // Keep started events tiny — full HTML here was ~38KB × retries and
        // made chat preview render the whole article while generating.
        content_text: null,
        before_content_text: beforeContentText,
        content_json: null,
        asset_data: null,
        current_version: context?.artifact?.current_version ?? null,
        snippet: (beforeContentText ?? "").replace(/\s+/g, " ").slice(0, 180),
      },
    });

    await appendEvent(supabase, {
      buildId,
      unitId,
      eventType: "artifact.context_loaded",
      phase: "running",
      payload: {
        artifact_id: artifactId,
        template_count: Array.isArray(context?.project_templates) ? context.project_templates.length : 0,
        source_count: Array.isArray(context?.sources ?? context?.source_summaries) ? (context.sources ?? context.source_summaries).length : 0,
        internal_link_candidate_count: Array.isArray(context?.internal_link_candidates) ? context.internal_link_candidates.length : 0,
      },
    });

    await appendEvent(supabase, {
      buildId,
      unitId,
      eventType: "artifact.selection_resolved",
      phase: "running",
      payload: {
        artifact_id: artifactId,
        selection_is_context: hasSelectionContext,
        selected_text: selection?.selected_text ?? null,
        selection_start: selection?.selection_start ?? selection?.text_range?.start ?? null,
        selection_end: selection?.selection_end ?? selection?.text_range?.end ?? null,
      },
    });

    const emitLivePreview = async (partial: {
      contentText: string
      title?: string | null
      contentJson?: any
      sectionHtml?: string | null
    }) => {
      const contentText = String(partial.contentText ?? "");
      const sectionHtml = typeof partial.sectionHtml === "string" ? partial.sectionHtml.trim() : "";
      if (!contentText.trim() && !sectionHtml) return;
      await appendEvent(supabase, {
        buildId,
        unitId,
        eventType: "artifact.preview",
        phase: "proposed",
        payload: {
          artifact_id: artifactId,
          task_id: context?.artifact?.task_id ?? null,
          title: String(partial.title ?? context?.artifact?.title ?? "Artifact").slice(0, 240),
          artifact_type: context?.artifact?.artifact_type ?? "document",
          content_text: null,
          before_content_text: null,
          diff_content_text: null,
          content_json: null,
          asset_data: null,
          snippet: (sectionHtml || contentText).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 280),
          section_html: sectionHtml || null,
          streaming: true,
          stream_chars: (sectionHtml || contentText).length,
        },
      });
    };

    const isRevisionConflict = (value: unknown) =>
      /revision_conflict|artifact_revision_conflict/i.test(String(value ?? ""));

    const persistSnapshot = async (args: {
      snapshot: any;
      summary: string;
      changeSummary: string;
      sectionHtml?: string | null;
      sectionBeforeHtml?: string | null;
    }) => {
      const finalized = finalizeArtifactUpdateContent({
        previousContentJson: context?.artifact?.content_json ?? null,
        previousContentText: typeof context?.artifact?.content_text === "string" ? context.artifact.content_text : null,
        contentText: String(args.snapshot.content_text ?? ""),
        contentJson: args.snapshot.content_json ?? null,
      });
      const contentJson = normalizeArtifactContentJson(finalized.contentJson, finalized.contentText);
      const snapshot = {
        ...args.snapshot,
        content_text: finalized.contentText,
        content_json: contentJson,
        asset_data:
          args.snapshot.asset_data && typeof args.snapshot.asset_data === "object"
            ? args.snapshot.asset_data
            : existingAssetData,
      };
      const afterPlain = artifactDiffPlainFromContent(snapshot.content_text, snapshot.content_json);
      const isNoopChange = Boolean(
        beforeContentText
        && afterPlain
        && beforeContentText === afterPlain,
      );
      const sectionHtml = typeof args.sectionHtml === "string" && args.sectionHtml.trim()
        ? args.sectionHtml.trim()
        : null;
      const sectionBeforeHtml = typeof args.sectionBeforeHtml === "string" && args.sectionBeforeHtml.trim()
        ? args.sectionBeforeHtml.trim()
        : null;

      const blockSummary = Array.isArray(contentJson?.blocks)
        ? contentJson.blocks.slice(0, 100).map((block: any) => ({ id: block?.id ?? null, type: block?.type ?? null, title: block?.title ?? null, level: block?.level ?? null }))
        : [];
      await appendEvent(supabase, {
        buildId,
        unitId,
        eventType: "artifact.structure_decided",
        phase: "proposed",
        payload: { artifact_id: artifactId, block_count: blockSummary.length, blocks: blockSummary, noop: isNoopChange },
      });
      await appendEvent(supabase, {
        buildId,
        unitId,
        eventType: "artifact.preview",
        phase: "proposed",
        payload: {
          artifact_id: artifactId,
          task_id: context?.artifact?.task_id ?? null,
          title: snapshot.title,
          artifact_type: context?.artifact?.artifact_type ?? "document",
          content_text: snapshot.content_text,
          before_content_text: beforeContentText,
          // Identical canonical plain → no diff counts in the UI.
          diff_content_text: isNoopChange ? beforeContentText : afterPlain,
          content_json: snapshot.content_json,
          asset_data: snapshot.asset_data,
          snippet: String(sectionHtml ?? snapshot.content_text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 500),
          streaming: false,
          noop: isNoopChange,
          section_html: sectionHtml,
          section_before_html: sectionBeforeHtml,
        },
      });

      if (isNoopChange) {
        const currentVersion = Number(context?.artifact?.current_version ?? 0);
        return {
          result: {
            ok: true,
            data: {
              noop: true,
              version_number: Number.isInteger(currentVersion) ? currentVersion : null,
              artifact: { current_version: Number.isInteger(currentVersion) ? currentVersion : null },
            },
          },
          snapshot,
          summary: args.summary,
          noop: true,
          sectionHtml,
          sectionBeforeHtml,
        };
      }

      const toolContext = {
        thread_id: context?.build?.thread_id,
        ai_run_id: context?.build?.ai_run_id,
        current_user_request: context?.build?.request_text,
      };
      let expectedVersion = Number(
        context?.unit?.input_snapshot?.expected_version ?? context?.artifact?.current_version ?? 0,
      );
      let result = await callAiTools(authorization, "ai_save_build_artifact_internal", {
        build_id: buildId,
        unit_id: unitId,
        lease_token: leaseToken,
        artifact_id: artifactId,
        expected_version: Number.isInteger(expectedVersion) ? expectedVersion : 0,
        snapshot,
        change_summary: args.changeSummary.slice(0, 1000),
      }, toolContext);

      // At most one in-process retry with a fresh version. Never requeue storms.
      if (result?.ok === false && isRevisionConflict(result?.error ?? result?.data?.error)) {
        const { data: freshArtifact } = await supabase
          .from("artifacts")
          .select("current_version")
          .eq("id", artifactId)
          .maybeSingle();
        const freshVersion = Number(freshArtifact?.current_version);
        if (Number.isInteger(freshVersion)) {
          expectedVersion = freshVersion;
          if (context?.artifact) context.artifact.current_version = freshVersion;
          if (context?.unit?.input_snapshot) {
            context.unit.input_snapshot.expected_version = freshVersion;
          }
          result = await callAiTools(authorization, "ai_save_build_artifact_internal", {
            build_id: buildId,
            unit_id: unitId,
            lease_token: leaseToken,
            artifact_id: artifactId,
            expected_version: freshVersion,
            snapshot,
            change_summary: args.changeSummary.slice(0, 1000),
          }, toolContext);
        }
      }

      if (result?.ok === false && isRevisionConflict(result?.error ?? result?.data?.error)) {
        throw new ArtifactBuildError(
          "artifact_revision_conflict",
          String(result?.error ?? "artifact_revision_conflict"),
          false,
        );
      }

      return { result, snapshot, summary: args.summary, noop: false, sectionHtml, sectionBeforeHtml };
    };

    const messages: any[] = buildInitialMessages(
      context,
      hasSelectionContext ? selection : null,
    );
    let savedResult: any = null;
    for (let round = 1; round <= 6; round++) {
      const modelRound = await callModelRound({
        supabase,
        context,
        unitId,
        buildId,
        round,
        messages,
        tools: WORKER_TOOLS,
        // Non-streaming avoids growing SSE/tool-arg buffers that OOM the isolate
        // when the model rewrites large HTML.
        stream: false,
        maxCompletionTokens: MAX_COMPLETION_TOKENS,
        onSaveArgsProgress: async (partial) => {
          await emitLivePreview({
            ...partial,
            sectionHtml: /<[a-z][\s\S]*>/i.test(partial.contentText) ? partial.contentText : null,
          });
        },
      });
      usage = mergeUsage(usage, modelRound.usage);
      const message = modelRound.message ?? {};
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      messages.push({ role: "assistant", content: message.content ?? null, tool_calls: toolCalls });

      if (toolCalls.length === 0) {
        if (savedResult) break;
        throw new ArtifactBuildError(
          "artifact_not_saved",
          "The artifact agent finished without calling apply_artifact_patches or save_artifact_version.",
        );
      }

      for (const toolCall of toolCalls) {
        const name = String(toolCall?.function?.name ?? "");
        let toolArgs: any = {};
        try { toolArgs = JSON.parse(String(toolCall?.function?.arguments ?? "{}")); } catch { toolArgs = {}; }
        let result: any;

        if (name === "read_source") {
          result = await callAiTools(authorization, "ai_read_source", toolArgs, { thread_id: context?.build?.thread_id, ai_run_id: context?.build?.ai_run_id, current_user_request: context?.build?.request_text });
        } else if (name === "read_artifact") {
          result = await callAiTools(authorization, "ai_read_artifact", toolArgs, { thread_id: context?.build?.thread_id, ai_run_id: context?.build?.ai_run_id, current_user_request: context?.build?.request_text });
        } else if (name === "read_public_webpage") {
          result = await callAiTools(authorization, "read_public_webpage", toolArgs, { thread_id: context?.build?.thread_id, ai_run_id: context?.build?.ai_run_id, current_user_request: context?.build?.request_text });
        } else if (name === "apply_artifact_patches") {
          if (savedResult) {
            result = { ok: false, error: "artifact_already_saved", data: null };
          } else {
            const patched = applyArtifactPatches({
              contentJson: context?.artifact?.content_json ?? null,
              contentText: typeof context?.artifact?.content_text === "string"
                ? context.artifact.content_text
                : null,
              patches: Array.isArray(toolArgs.patches) ? toolArgs.patches : [],
            });
            if (!patched.ok) {
              result = { ok: false, error: patched.error, data: patched.data ?? null };
            } else {
              const snapshot = {
                title: String(toolArgs.title ?? context?.artifact?.title ?? "Artifact").slice(0, 240),
                status: String(toolArgs.status ?? "ready"),
                content_text: patched.contentText,
                content_json: patched.contentJson,
                asset_data: existingAssetData,
                metadata: {
                  ...cleanPersistedArtifactMetadata(context?.artifact?.metadata),
                  generation_summary: String(toolArgs.summary ?? "").slice(0, 2000),
                  generated_by: "ai-artifact-worker-agent",
                  patch_count: patched.applied,
                  ...(selection
                    ? {
                        selection_context: {
                          selected_text: selection.selected_text ?? null,
                          selection_start: selection.selection_start ?? selection.text_range?.start ?? null,
                          selection_end: selection.selection_end ?? selection.text_range?.end ?? null,
                        },
                      }
                    : {}),
                },
              };
              savedResult = await persistSnapshot({
                snapshot,
                summary: String(toolArgs.summary ?? ""),
                changeSummary: String(
                  toolArgs.change_summary
                  ?? toolArgs.summary
                  ?? context?.unit?.instruction
                  ?? `Applied ${patched.applied} artifact patch(es)`,
                ),
                sectionHtml: patched.previewAfterHtml,
                sectionBeforeHtml: patched.previewBeforeHtml,
              });
              result = savedResult.result;
              if (!result?.ok) savedResult = null;
              else {
                result = {
                  ...result,
                  data: {
                    ...(result.data && typeof result.data === "object" ? result.data : {}),
                    applied: patched.applied,
                  },
                };
              }
            }
          }
        } else if (name === "save_artifact_version") {
          if (savedResult) {
            result = { ok: false, error: "artifact_already_saved", data: null };
          } else {
            const contentText = String(toolArgs.content_text ?? "");
            const contentJson = normalizeArtifactContentJson(
              toolArgs.content_json && typeof toolArgs.content_json === "object" ? toolArgs.content_json : null,
              contentText,
            );
            const modelAssets =
              toolArgs.asset_data && typeof toolArgs.asset_data === "object"
                ? toolArgs.asset_data
                : null;
            const modelAssetCount = Array.isArray((modelAssets as any)?.assets)
              ? (modelAssets as any).assets.length
              : 0;
            const snapshot = {
              title: String(toolArgs.title ?? context?.artifact?.title ?? "Artifact").slice(0, 240),
              status: String(toolArgs.status ?? "ready"),
              content_text: contentText,
              content_json: contentJson,
              asset_data: modelAssetCount > 0 ? modelAssets : existingAssetData,
              metadata: {
                ...cleanPersistedArtifactMetadata(context?.artifact?.metadata),
                ...cleanPersistedArtifactMetadata(toolArgs.metadata),
                generation_summary: String(toolArgs.summary ?? "").slice(0, 2000),
                generated_by: "ai-artifact-worker-agent",
                ...(selection
                  ? {
                      selection_context: {
                        selected_text: selection.selected_text ?? null,
                        selection_start: selection.selection_start ?? selection.text_range?.start ?? null,
                        selection_end: selection.selection_end ?? selection.text_range?.end ?? null,
                      },
                    }
                  : {}),
              },
            };
            savedResult = await persistSnapshot({
              snapshot,
              summary: String(toolArgs.summary ?? ""),
              changeSummary: String(toolArgs.change_summary ?? toolArgs.summary ?? context?.unit?.instruction ?? "Generated artifact"),
            });
            result = savedResult.result;
            if (!result?.ok) savedResult = null;
          }
        } else if (name === "save_artifact_selection_patch") {
          result = {
            ok: false,
            error: "use_apply_artifact_patches",
            data: {
              hint: "Call apply_artifact_patches with model-specified old_html/new_html (or plain ranges with expected_text), or save_artifact_version for a full document.",
            },
          };
        } else {
          result = { ok: false, error: `unsupported_worker_tool:${name}`, data: null };
        }

        messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result).slice(0, 40000) });
      }

      if (savedResult) break;
    }

    if (!savedResult) throw new ArtifactBuildError("artifact_not_saved", "The artifact agent did not save the artifact.");
    const saveData = savedResult.result?.data ?? {};
    const snapshot = savedResult.snapshot;
    const wasNoop = savedResult.noop === true;
    const savedItem = {
      artifact_id: artifactId,
      task_id: context?.artifact?.task_id ?? null,
      project_id: context?.artifact?.project_id ?? null,
      ai_thread_id: context?.artifact?.ai_thread_id ?? null,
      artifact_type: context?.artifact?.artifact_type ?? "document",
      artifact_role: context?.artifact?.artifact_role ?? null,
      title: snapshot.title,
      channel_id: context?.artifact?.channel_id ?? null,
      language_id: context?.artifact?.language_id ?? null,
      version_number: saveData?.version_number ?? saveData?.artifact?.current_version ?? null,
      snippet: String(snapshot.content_text ?? "").replace(/\s+/g, " ").slice(0, 500),
      source_artifact_id: context?.artifact?.source_artifact_id ?? null,
      noop: wasNoop,
    };
    saved = [savedItem];

    await appendEvent(supabase, {
      buildId,
      unitId,
      eventType: "artifact.version_saved",
      phase: "saved",
      payload: {
        ...savedItem,
        content_text: snapshot.content_text,
        before_content_text: beforeContentText,
        // Same canonical plain as before → UI shows 0 +/- chars and no hunk cards.
        diff_content_text: wasNoop
          ? beforeContentText
          : artifactDiffPlainFromContent(snapshot.content_text, snapshot.content_json),
        content_json: snapshot.content_json,
        asset_data: snapshot.asset_data,
        section_html: savedResult.sectionHtml ?? null,
        section_before_html: savedResult.sectionBeforeHtml ?? null,
      },
    });

    const { data: completed, error: completeError } = await supabase.rpc("ai_complete_build_work_unit_v1", {
      p_build_id: buildId,
      p_unit_id: unitId,
      p_lease_token: leaseToken,
      p_status: "succeeded",
      p_result: { saved, failed: [], saved_count: 1, failed_count: 0 },
      p_usage: usage,
      p_error_code: null,
      p_error_message: null,
    });
    if (completeError) throw new ArtifactBuildError("work_unit_completion_failed", completeError.message);

    const pump = pumpNext(authorization, buildId);
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(pump); else await pump;
    return json({ ok: true, build_id: buildId, unit_id: unitId, status: "succeeded", saved, build: completed?.build ?? null });
  } catch (error: any) {
    const buildError = error instanceof ArtifactBuildError
      ? error
      : new ArtifactBuildError("artifact_worker_failed", error?.message ?? String(error), /timeout|fetch|5\d\d/i.test(String(error?.message ?? "")), usage);
    console.error("ai-artifact-worker failed", { build_id: buildId, unit_id: unitId, code: buildError.code, error: buildError.message });

    if (buildError.retryable) {
      const { data: retry, error: retryError } = await supabase.rpc("ai_requeue_build_work_unit_v1", {
        p_build_id: buildId,
        p_unit_id: unitId,
        p_lease_token: leaseToken,
        p_error_code: buildError.code,
        p_error_message: buildError.message,
        p_usage: buildError.usage ?? usage,
      });
      if (!retryError) {
        const pump = pumpNext(authorization, buildId);
        const edgeRuntime = (globalThis as any).EdgeRuntime;
        if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(pump); else await pump;
        return json({ ok: false, retry_scheduled: retry?.requeued === true, build_id: buildId, unit_id: unitId, error: { code: buildError.code, message: buildError.message } }, 202);
      }
    }

    failed.push({
      artifact_id: context?.artifact?.id ?? context?.unit?.input_snapshot?.artifact_id ?? null,
      task_id: context?.artifact?.task_id ?? context?.unit?.task_id ?? null,
      title: context?.artifact?.title ?? null,
      error: buildError.code,
      message: buildError.message,
    });
    try {
      await appendEvent(supabase, { buildId, unitId, eventType: "artifact.failed", phase: "failed", payload: failed[0] });
      const { error: failedCompletionError } = await supabase.rpc("ai_complete_build_work_unit_v1", {
        p_build_id: buildId,
        p_unit_id: unitId,
        p_lease_token: leaseToken,
        p_status: saved.length > 0 ? "partially_succeeded" : buildError.code === "artifact_revision_conflict" ? "conflict" : "failed",
        p_result: { saved, failed, saved_count: saved.length, failed_count: failed.length },
        p_usage: buildError.usage ?? usage,
        p_error_code: buildError.code,
        p_error_message: buildError.message,
      });
      terminalFailureRecorded = !failedCompletionError;
    } catch {
      // A cancelled or already-terminal lease can make completion a no-op.
    }

    const pump = pumpNext(authorization, buildId);
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(pump); else await pump;
    return json({ ok: false, build_id: buildId, unit_id: unitId, terminal_recorded: terminalFailureRecorded, error: { code: buildError.code, message: buildError.message } }, terminalFailureRecorded ? 200 : 500);
  }
});
