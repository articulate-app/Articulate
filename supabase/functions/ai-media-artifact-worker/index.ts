import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  brandKitForAiFromProject,
  collectBrandTemplateVisualRefs,
  formatBrandKitForMediaPrompt,
  type BrandTemplateVisualRef,
} from "../_shared/project-brand-kit.ts";
import {
  decideArtifactRevisionConflictRetry,
  isArtifactRevisionConflictValue,
} from "../_shared/artifact-revision-conflict.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const OPENAI_IMAGE_MODEL = Deno.env.get("OPENAI_IMAGE_MODEL") || "gpt-image-2";
const OPENAI_VIDEO_MODEL = Deno.env.get("OPENAI_VIDEO_MODEL") || "sora-2";
const GEMINI_API_KEY = String(Deno.env.get("GEMINI_API_KEY") ?? "").trim();
const GEMINI_IMAGE_MODEL = Deno.env.get("GEMINI_IMAGE_MODEL") || "gemini-2.5-flash-image";
const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN") || "";
const REPLICATE_VIDEO_MODEL = Deno.env.get("REPLICATE_VIDEO_MODEL") || "";
const MEDIA_PLAN_MODEL = Deno.env.get("OPENAI_ARTIFACT_MODEL") || Deno.env.get("OPENAI_MODEL_FAST") || "gpt-5.4-mini";
const PUBLIC_MEDIA_BUCKET = "public-media";
const MAX_BRAND_TEMPLATE_VISUALS = 6;
const MAX_BRAND_TEMPLATE_BYTES = 8_000_000;
/** Default image provider when the planner omits provider. Prefer Gemini when configured. */
const DEFAULT_IMAGE_PROVIDER = (() => {
  const configured = String(Deno.env.get("MEDIA_IMAGE_PROVIDER") ?? "").trim().toLowerCase();
  if (configured === "gemini" || configured === "openai") return configured;
  return GEMINI_API_KEY ? "gemini" : "openai";
})();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ai-build-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class MediaError extends Error {
  code: string;
  retryable: boolean;
  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function uuidOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}
function delay(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function safeName(value: unknown, fallback: string) {
  return (String(value ?? fallback).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || fallback);
}
function artifactType(value: unknown) { return String(value ?? "").trim().toLowerCase(); }
function isVideoType(type: string) { return ["video", "video_clip", "motion", "animation"].includes(type); }
function isImageType(type: string) { return ["image", "images", "illustration", "photo", "visual"].includes(type); }
function isMixedType(type: string) { return ["mixed", "document_with_images", "article_with_images", "carousel", "storyboard", "presentation"].includes(type); }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Models sometimes nest prompt under provider_input; normalize before generation. */
function normalizeMediaItem(raw: unknown): Record<string, unknown> | null {
  const item = asRecord(raw);
  if (!item) return null;
  const providerInput = asRecord(item.provider_input) ?? {};
  const prompt = String(
    item.prompt
      ?? providerInput.prompt
      ?? item.image_prompt
      ?? item.text
      ?? "",
  ).trim();
  const kind = String(item.kind ?? "image").trim().toLowerCase() || "image";
  const providerRaw = String(item.provider ?? "").trim().toLowerCase();
  const provider = providerRaw === "google"
    ? "gemini"
    : (providerRaw || null);
  return {
    ...item,
    kind,
    prompt: prompt || null,
    file_name: item.file_name ?? item.filename ?? null,
    alt_text: item.alt_text ?? item.alt ?? null,
    caption: item.caption ?? null,
    size: item.size ?? null,
    seconds: item.seconds ?? null,
    provider,
    provider_input: Object.keys(providerInput).length ? providerInput : null,
  };
}

function normalizeMediaPlan(plan: { content_text?: unknown; content_json?: unknown; items?: unknown }) {
  const items = Array.isArray(plan?.items)
    ? plan.items.map(normalizeMediaItem).filter(Boolean)
    : [];
  return {
    content_text: String(plan?.content_text ?? ""),
    content_json: plan?.content_json ?? null,
    items: items as Record<string, unknown>[],
  };
}

function resolveImageProvider(item: unknown): "gemini" | "openai" {
  const record = asRecord(item);
  const raw = String(record?.provider ?? DEFAULT_IMAGE_PROVIDER).trim().toLowerCase();
  if (raw === "gemini" || raw === "google") {
    if (!GEMINI_API_KEY) {
      if (OPENAI_API_KEY) return "openai";
      throw new MediaError("gemini_api_key_missing", "GEMINI_API_KEY is missing.");
    }
    return "gemini";
  }
  return "openai";
}

/** Map planner size strings to Gemini aspectRatio values. */
function geminiAspectRatio(size: unknown): string | null {
  const key = String(size ?? "").trim().toLowerCase();
  if (!key || key === "auto") return null;
  const map: Record<string, string> = {
    "1024x1024": "1:1",
    "1200x1200": "1:1",
    "1:1": "1:1",
    "1536x1024": "3:2",
    "3:2": "3:2",
    "16:9": "16:9",
    "1920x1080": "16:9",
    "1024x1536": "2:3",
    "2:3": "2:3",
    "9:16": "9:16",
    "1080x1920": "9:16",
    "4:3": "4:3",
    "3:4": "3:4",
    "4:5": "4:5",
    "5:4": "5:4",
    "21:9": "21:9",
  };
  if (map[key]) return map[key];
  const match = key.match(/^(\d+)\s*[x×]\s*(\d+)$/);
  if (match) {
    const w = Number(match[1]);
    const h = Number(match[2]);
    if (w > 0 && h > 0) {
      const ratio = w / h;
      if (Math.abs(ratio - 1) < 0.08) return "1:1";
      if (ratio > 1.7) return "16:9";
      if (ratio > 1.4) return "3:2";
      if (ratio > 1.2) return "4:3";
      if (ratio < 0.6) return "9:16";
      if (ratio < 0.75) return "2:3";
      if (ratio < 0.9) return "3:4";
    }
  }
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x2000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, Array.from(slice) as unknown as number[]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function mimeExtension(mimeType: string): string {
  const key = String(mimeType ?? "").toLowerCase();
  if (key.includes("jpeg") || key.includes("jpg")) return "jpg";
  if (key.includes("webp")) return "webp";
  if (key.includes("gif")) return "gif";
  return "png";
}

async function appendEvent(supabase: any, args: { buildId: string; unitId?: string | null; eventType: string; phase?: string; payload?: any }) {
  const { error } = await supabase.rpc("ai_append_build_event_v1", {
    p_build_id: args.buildId, p_event_type: args.eventType, p_phase: args.phase ?? "progress", p_unit_id: args.unitId ?? null, p_payload: args.payload ?? {},
  });
  if (error) console.warn("media event append failed", error.message);
}

async function pumpLater(auth: string, buildId: string, waitMs = 12000) {
  await delay(waitMs);
  await fetch(`${SUPABASE_URL}/functions/v1/ai-build-orchestrator`, {
    method: "POST", headers: { Authorization: auth, "Content-Type": "application/json", "X-AI-Build-Id": buildId }, body: JSON.stringify({ build_id: buildId, action: "pump" }),
  }).catch((error) => console.warn("media pump failed", String(error)));
}

function normalizedSelection(spec: any) {
  const value = spec?.selection ?? spec?.metadata?.selection ?? spec?.metadata?.selected_artifact_context ?? null;
  if (!value || typeof value !== "object") return null;
  return {
    anchor_type: String(value.anchor_type ?? value.source_type ?? "document").slice(0, 50),
    attachment_id: uuidOrNull(value.attachment_id),
    block_id: String(value.block_id ?? value.anchor_block_key ?? "").slice(0, 120) || null,
    selected_text: String(value.selected_text ?? "").slice(0, 30000) || null,
    selection_start: Number.isInteger(Number(value.selection_start)) ? Number(value.selection_start) : null,
    selection_end: Number.isInteger(Number(value.selection_end)) ? Number(value.selection_end) : null,
    x: Number.isFinite(Number(value.anchor_x ?? value.x)) ? Number(value.anchor_x ?? value.x) : null,
    y: Number.isFinite(Number(value.anchor_y ?? value.y)) ? Number(value.anchor_y ?? value.y) : null,
    width: Number.isFinite(Number(value.anchor_width ?? value.width)) ? Number(value.anchor_width ?? value.width) : null,
    height: Number.isFinite(Number(value.anchor_height ?? value.height)) ? Number(value.anchor_height ?? value.height) : null,
    time_start: Number.isFinite(Number(value.anchor_time_start ?? value.time_start)) ? Number(value.anchor_time_start ?? value.time_start) : null,
    time_end: Number.isFinite(Number(value.anchor_time_end ?? value.time_end)) ? Number(value.anchor_time_end ?? value.time_end) : null,
    full_content_hash: String(value.full_content_hash ?? "").slice(0, 200) || null,
  };
}

function brandPromptPrefix(context: any): string | null {
  return formatBrandKitForMediaPrompt(
    brandKitForAiFromProject(context?.project),
    context?.project?.name ?? null,
  );
}

function withBrandPrompt(basePrompt: string, context: any): string {
  const brand = brandPromptPrefix(context);
  const prompt = String(basePrompt ?? "").trim();
  if (!brand) return prompt;
  if (!prompt) return brand;
  if (/brand kit for|prefer these tokens over web/i.test(prompt)) return prompt;
  return `${brand}\n\nCreative brief:\n${prompt}`;
}

type BrandTemplateVisualBytes = {
  ref: BrandTemplateVisualRef
  bytes: Uint8Array
  mimeType: string
  label: string
}

function publicMediaUrl(storagePath: string): string {
  const trimmed = storagePath.replace(/^\/+/, "")
  return `${SUPABASE_URL}/storage/v1/object/public/${PUBLIC_MEDIA_BUCKET}/${trimmed}`
}

function resolveBrandVisualFetchUrl(ref: BrandTemplateVisualRef): string | null {
  if (ref.storage_path) return publicMediaUrl(ref.storage_path)
  const url = String(ref.url ?? "").trim()
  if (!url) return null
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  // Relative/public-media path stored in url by mistake.
  return publicMediaUrl(url)
}

function mimeFromBytesOrName(bytes: Uint8Array, hint: string | null): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png"
  }
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42) {
    return "image/webp"
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif"
  const lower = String(hint ?? "").toLowerCase()
  if (lower.includes("jpeg") || lower.includes("jpg")) return "image/jpeg"
  if (lower.includes("webp")) return "image/webp"
  if (lower.includes("gif")) return "image/gif"
  return "image/png"
}

async function fetchBrandVisualBytes(
  service: any,
  ref: BrandTemplateVisualRef,
): Promise<BrandTemplateVisualBytes | null> {
  try {
    if (ref.storage_path) {
      const { data, error } = await service.storage
        .from(PUBLIC_MEDIA_BUCKET)
        .download(ref.storage_path)
      if (!error && data) {
        const bytes = new Uint8Array(await data.arrayBuffer())
        if (bytes.length === 0 || bytes.length > MAX_BRAND_TEMPLATE_BYTES) return null
        return {
          ref,
          bytes,
          mimeType: mimeFromBytesOrName(bytes, ref.url),
          label: ref.title || ref.template_title || "brand template",
        }
      }
    }

    const url = resolveBrandVisualFetchUrl(ref)
    if (!url) return null
    const response = await fetch(url, { redirect: "follow" })
    if (!response.ok) return null
    const contentType = String(response.headers.get("content-type") ?? "").toLowerCase()
    if (contentType && !contentType.startsWith("image/") && !contentType.includes("octet-stream")) {
      return null
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length === 0 || bytes.length > MAX_BRAND_TEMPLATE_BYTES) return null
    return {
      ref,
      bytes,
      mimeType: mimeFromBytesOrName(bytes, contentType || ref.url),
      label: ref.title || ref.template_title || "brand template",
    }
  } catch (error) {
    console.warn("brand template visual fetch failed", {
      asset_id: ref.asset_id,
      error: String(error),
    })
    return null
  }
}

async function loadBrandTemplateVisuals(
  service: any,
  context: any,
): Promise<BrandTemplateVisualBytes[]> {
  const kit = brandKitForAiFromProject(context?.project)
  const refs = collectBrandTemplateVisualRefs(kit, MAX_BRAND_TEMPLATE_VISUALS)
  if (!refs.length) return []
  const loaded: BrandTemplateVisualBytes[] = []
  for (const ref of refs) {
    const visual = await fetchBrandVisualBytes(service, ref)
    if (visual) loaded.push(visual)
  }
  return loaded
}

function brandTemplateVisualPromptNote(visuals: BrandTemplateVisualBytes[]): string | null {
  if (!visuals.length) return null
  const labels = visuals
    .map((visual, index) => `${index + 1}. ${visual.label}`)
    .join("; ")
  return [
    `Attached reference images (${visuals.length}) are project brand layout templates: ${labels}.`,
    "Match their composition, hierarchy, spacing, safe zones, and overall framing.",
    "Create a new on-brand creative — do not copy protected logos, trademarks, or recognizable faces verbatim.",
  ].join(" ")
}

function plannerUserContent(args: {
  context: any
  spec: any
  selection: any
  brandVisualUrls: string[]
}) {
  const { context, spec, selection, brandVisualUrls } = args
  const payload = {
    request: String(context?.build?.request_text ?? context?.unit?.instruction ?? "").slice(0, 8000),
    instruction: String(context?.unit?.instruction ?? "").slice(0, 8000),
    artifact: {
      id: context?.artifact?.id ?? null,
      title: context?.artifact?.title ?? null,
      artifact_type: context?.artifact?.artifact_type ?? null,
      artifact_role: context?.artifact?.artifact_role ?? null,
      content_preview: String(context?.artifact?.content_text ?? "").slice(0, 2000) || null,
    },
    artifact_spec: {
      title: spec?.title ?? null,
      artifact_type: spec?.artifact_type ?? null,
      instruction: String(spec?.instruction ?? "").slice(0, 8000),
      metadata: spec?.metadata ?? null,
    },
    task: context?.task ? { id: context.task.id ?? context.task_id ?? null, title: context.task.title ?? null } : null,
    project: context?.project
      ? {
          id: context.project.id ?? null,
          name: context.project.name ?? null,
          editorial_line: context.project.editorial_line ?? null,
          color: context.project.color ?? null,
          logo: context.project.logo ?? null,
          project_url: context.project.project_url ?? null,
        }
      : null,
    brand_kit: brandKitForAiFromProject(context?.project),
    brand_template_visuals_attached: brandVisualUrls.length,
    selection,
  }

  if (!brandVisualUrls.length) {
    return JSON.stringify(payload)
  }

  return [
    {
      type: "text",
      text: [
        JSON.stringify(payload),
        "",
        "The following images are brand layout templates from the project Brand kit.",
        "Study their composition and encode those layout cues into every media_items[].prompt.",
      ].join("\n"),
    },
    ...brandVisualUrls.map((url) => ({
      type: "image_url",
      image_url: { url, detail: "low" },
    })),
  ]
}

async function planMedia(context: any) {
  const spec = context?.unit?.input_snapshot?.artifact_spec ?? {};
  const explicit = Array.isArray(spec?.media_items) ? spec.media_items : Array.isArray(spec?.metadata?.media_items) ? spec.metadata.media_items : null;
  if (explicit?.length) {
    return normalizeMediaPlan({
      content_text: String(spec?.metadata?.content_text ?? ""),
      content_json: spec?.metadata?.content_json ?? null,
      items: explicit.slice(0, 12).map((item: any) => ({
        ...item,
        prompt: withBrandPrompt(String(item?.prompt ?? item?.provider_input?.prompt ?? ""), context),
        provider: item?.provider ?? DEFAULT_IMAGE_PROVIDER,
      })),
    });
  }

  const type = artifactType(context?.artifact?.artifact_type);
  // Single-image artifacts already carry a production-ready instruction from the
  // orchestrator — skip the OpenAI planner (faster + avoids plan-stage crashes).
  if (isImageType(type) && !isMixedType(type) && !isVideoType(type)) {
    const prompt = withBrandPrompt(String(
      spec?.instruction
        ?? context?.unit?.instruction
        ?? context?.build?.request_text
        ?? "",
    ), context);
    if (prompt) {
      return normalizeMediaPlan({
        content_text: "",
        content_json: { version: 1, blocks: [] },
        items: [{
          kind: "image",
          prompt,
          file_name: `${safeName(context?.artifact?.title, "image")}.png`,
          alt_text: String(context?.artifact?.title ?? "Generated image").slice(0, 200) || "Generated image",
          caption: null,
          size: "1024x1024",
          seconds: null,
          provider: DEFAULT_IMAGE_PROVIDER,
          provider_input: null,
        }],
      });
    }
  }

  const maxItems = isVideoType(type) ? 4 : 8;
  const schema = {
    name: "artifact_media_plan", strict: false, schema: {
      type: "object", additionalProperties: false,
      properties: {
        content_text: { type: "string" },
        content_json: { type: ["object", "null"], additionalProperties: true },
        media_items: { type: "array", minItems: 1, maxItems, items: { type: "object", additionalProperties: false, properties: {
          kind: { type: "string", enum: ["image", "video"] }, prompt: { type: "string" }, file_name: { type: ["string", "null"] },
          alt_text: { type: ["string", "null"] }, caption: { type: ["string", "null"] }, size: { type: ["string", "null"] },
          seconds: { type: ["integer", "null"] }, provider: { type: ["string", "null"], enum: ["openai", "gemini", "replicate", null] },
          provider_input: { type: ["object", "null"], additionalProperties: true },
        }, required: ["kind", "prompt", "file_name", "alt_text", "caption", "size", "seconds", "provider", "provider_input"] } },
      }, required: ["content_text", "content_json", "media_items"],
    },
  };
  const selection = normalizedSelection(spec);
  const brandKit = brandKitForAiFromProject(context?.project)
  const brandVisualRefs = collectBrandTemplateVisualRefs(brandKit, MAX_BRAND_TEMPLATE_VISUALS)
  const brandVisualUrls = brandVisualRefs
    .map((ref) => resolveBrandVisualFetchUrl(ref))
    .filter((url): url is string => Boolean(url))
    .slice(0, MAX_BRAND_TEMPLATE_VISUALS)

  const planPayload: Record<string, unknown> = {
    model: MEDIA_PLAN_MODEL,
    response_format: { type: "json_schema", json_schema: schema },
    messages: [
      { role: "system", content: [
        "Plan the exact media assets needed for one artifact. Return concise production prompts, not explanations.",
        "An artifact may be a single image/video, several images/clips, or text mixed with media. Create the minimum useful set.",
        "For carousel/storyboard/presentation artifacts, use one media item per meaningful visual only when requested or useful.",
        "When a selected image/video region or time range is supplied, preserve the rest and describe only the requested targeted change.",
        "When brand_kit is present, bake its colors, fonts, and visual style into every media prompt so outputs look on-brand.",
        "When brand layout template images are attached, study their composition/hierarchy/framing and encode those layout cues into every media_items[].prompt. The media worker will also attach those images as visual references at generation time.",
        "Each media_items[].prompt must be a non-empty top-level string (do not nest the prompt only under provider_input).",
        `For image items, set provider to "${DEFAULT_IMAGE_PROVIDER}" unless the user explicitly asks for another image provider.`,
        "Do not claim a media file exists; the media worker will generate it after this plan.",
      ].join("\n") },
      { role: "user", content: plannerUserContent({
        context,
        spec,
        selection,
        brandVisualUrls,
      }) },
    ],
  };
  // gpt-5 / o-series reject explicit temperature (same as ai-chat).
  const planModelKey = String(MEDIA_PLAN_MODEL).trim().toLowerCase();
  if (!(planModelKey.startsWith("gpt-5") || planModelKey.startsWith("o3") || planModelKey.startsWith("o4"))) {
    planPayload.temperature = 0.2;
  }
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(planPayload),
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) throw new MediaError("media_plan_failed", data?.error?.message ?? `Media plan failed (${resp.status})`, true);
  const raw = String(data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.message?.parsed ?? "").trim();
  if (!raw && data?.choices?.[0]?.message?.parsed) {
    const parsed = data.choices[0].message.parsed;
    return normalizeMediaPlan({
      content_text: String(parsed.content_text ?? ""),
      content_json: parsed.content_json ?? null,
      items: (Array.isArray(parsed.media_items) ? parsed.media_items.slice(0, maxItems) : []).map((item: any) => ({
        ...item,
        prompt: withBrandPrompt(String(item?.prompt ?? item?.provider_input?.prompt ?? ""), context),
        provider: item?.provider ?? DEFAULT_IMAGE_PROVIDER,
      })),
    });
  }
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { throw new MediaError("media_plan_invalid", `Media planner returned invalid JSON: ${raw.slice(0, 400)}`, true); }
  return normalizeMediaPlan({
    content_text: String(parsed.content_text ?? ""),
    content_json: parsed.content_json ?? null,
    items: (Array.isArray(parsed.media_items) ? parsed.media_items.slice(0, maxItems) : []).map((item: any) => ({
      ...item,
      prompt: withBrandPrompt(String(item?.prompt ?? item?.provider_input?.prompt ?? ""), context),
      provider: item?.provider ?? DEFAULT_IMAGE_PROVIDER,
    })),
  });
}

async function attachmentRow(service: any, id: string) {
  const { data, error } = await service.from("attachments").select("*").eq("id", id).maybeSingle();
  if (error || !data) throw new MediaError("attachment_not_found", error?.message ?? "Selected attachment not found.");
  return data;
}
async function downloadAttachment(service: any, row: any) {
  const path = String(row?.file_path ?? "");
  const { data, error } = await service.storage.from("attachments").download(path);
  if (error || !data) throw new MediaError("attachment_download_failed", error?.message ?? "Could not download attachment.");
  return new Uint8Array(await data.arrayBuffer());
}


function imageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 2 > bytes.length) break;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && offset + 7 < bytes.length) {
        return { height: (bytes[offset + 3] << 8) | bytes[offset + 4], width: (bytes[offset + 5] << 8) | bytes[offset + 6] };
      }
      if (length < 2) break;
      offset += length;
    }
  }
  return null;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function concatBytes(parts: Uint8Array[]) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length); let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
function pngChunk(type: string, data: Uint8Array) {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length); out.set(typeBytes, 4); out.set(data, 8);
  view.setUint32(8 + data.length, crc32(concatBytes([typeBytes, data])));
  return out;
}
async function createSelectionMaskPng(width: number, height: number, selection: any) {
  const maxPixels = 16_000_000;
  if (width <= 0 || height <= 0 || width * height > maxPixels) return null;
  const x = Math.max(0, Math.min(1, Number(selection?.x ?? 0)));
  const y = Math.max(0, Math.min(1, Number(selection?.y ?? 0)));
  const w = selection?.anchor_type === "image_point" ? 0.12 : Math.max(0.001, Math.min(1 - x, Number(selection?.width ?? 0.12)));
  const h = selection?.anchor_type === "image_point" ? 0.12 : Math.max(0.001, Math.min(1 - y, Number(selection?.height ?? 0.12)));
  const left = Math.max(0, Math.floor((selection?.anchor_type === "image_point" ? x - w / 2 : x) * width));
  const top = Math.max(0, Math.floor((selection?.anchor_type === "image_point" ? y - h / 2 : y) * height));
  const right = Math.min(width, Math.ceil((selection?.anchor_type === "image_point" ? x + w / 2 : x + w) * width));
  const bottom = Math.min(height, Math.ceil((selection?.anchor_type === "image_point" ? y + h / 2 : y + h) * height));
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let row = 0; row < height; row++) {
    const rowStart = row * (width * 4 + 1); raw[rowStart] = 0;
    for (let col = 0; col < width; col++) {
      const i = rowStart + 1 + col * 4;
      raw[i] = 255; raw[i + 1] = 255; raw[i + 2] = 255;
      raw[i + 3] = col >= left && col < right && row >= top && row < bottom ? 0 : 255;
    }
  }
  const compressed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const ihdr = new Uint8Array(13); const view = new DataView(ihdr.buffer);
  view.setUint32(0, width); view.setUint32(4, height); ihdr[8] = 8; ihdr[9] = 6;
  return concatBytes([
    new Uint8Array([137,80,78,71,13,10,26,10]), pngChunk("IHDR", ihdr), pngChunk("IDAT", compressed), pngChunk("IEND", new Uint8Array())
  ]);
}

async function generateOpenAiImage(
  item: any,
  selection: any,
  service: any,
  prompt: string,
  size: string,
  brandVisuals: BrandTemplateVisualBytes[] = [],
) {
  let response: Response;
  const hasSelectionImage = Boolean(selection?.attachment_id)
  const useEdits = hasSelectionImage || brandVisuals.length > 0

  if (useEdits) {
    const form = new FormData();
    form.append("model", OPENAI_IMAGE_MODEL);
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("output_format", "png");

    const imageParts: Array<{ blob: Blob; filename: string }> = []

    if (hasSelectionImage) {
      const source = await attachmentRow(service, selection.attachment_id);
      if (!String(source.mime_type ?? "").startsWith("image/")) {
        throw new MediaError("selected_asset_not_image", "The selected asset is not an image.");
      }
      const bytes = await downloadAttachment(service, source);
      imageParts.push({
        blob: new Blob([bytes], { type: source.mime_type || "image/png" }),
        filename: source.file_name || "source.png",
      })
      if (["image_rect", "image_point"].includes(selection?.anchor_type)) {
        const dimensions = imageDimensions(bytes);
        if (dimensions) {
          const mask = await createSelectionMaskPng(dimensions.width, dimensions.height, selection);
          if (mask) form.append("mask", new Blob([mask], { type: "image/png" }), "selection-mask.png");
        }
      }
    }

    for (let index = 0; index < brandVisuals.length; index++) {
      const visual = brandVisuals[index]
      imageParts.push({
        blob: new Blob([visual.bytes], { type: visual.mimeType }),
        filename: `brand-template-${index + 1}.${mimeExtension(visual.mimeType)}`,
      })
    }

    const field = imageParts.length > 1 ? "image[]" : "image"
    for (const part of imageParts) {
      form.append(field, part.blob, part.filename)
    }

    response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }, body: form });
  } else {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: OPENAI_IMAGE_MODEL, prompt, n: 1, size, output_format: "png" }),
    });
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new MediaError("image_generation_failed", data?.error?.message ?? `Image generation failed (${response.status})`, true);
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new MediaError("image_generation_empty", "Image generation returned no image.");
  return {
    bytes: base64ToBytes(b64),
    mimeType: "image/png",
    extension: "png",
    provider: "openai",
    providerId: data?.id ?? null,
    model: OPENAI_IMAGE_MODEL,
    prompt,
  };
}

async function generateGeminiImage(
  item: any,
  selection: any,
  service: any,
  prompt: string,
  brandVisuals: BrandTemplateVisualBytes[] = [],
) {
  if (!GEMINI_API_KEY) throw new MediaError("gemini_api_key_missing", "GEMINI_API_KEY is missing.");
  const parts: Array<Record<string, unknown>> = [];

  if (brandVisuals.length > 0) {
    parts.push({
      text: brandTemplateVisualPromptNote(brandVisuals) ?? "Brand layout template images follow.",
    })
    for (const visual of brandVisuals) {
      parts.push({
        inline_data: {
          mime_type: visual.mimeType,
          data: bytesToBase64(visual.bytes),
        },
      })
    }
  }

  parts.push({ text: prompt });

  if (selection?.attachment_id) {
    const source = await attachmentRow(service, selection.attachment_id);
    if (!String(source.mime_type ?? "").startsWith("image/")) {
      throw new MediaError("selected_asset_not_image", "The selected asset is not an image.");
    }
    const bytes = await downloadAttachment(service, source);
    parts.push({
      inline_data: {
        mime_type: source.mime_type || "image/png",
        data: bytesToBase64(bytes),
      },
    });
  }

  const generationConfig: Record<string, unknown> = {
    responseModalities: ["TEXT", "IMAGE"],
  };
  const aspectRatio = geminiAspectRatio(item?.size);
  if (aspectRatio) {
    generationConfig.imageConfig = { aspectRatio };
  }

  const candidateModels = Array.from(new Set([
    GEMINI_IMAGE_MODEL,
    "gemini-2.5-flash-image",
    "gemini-2.0-flash-preview-image-generation",
  ].filter(Boolean)));

  let lastError = "Gemini image generation failed.";
  for (const modelName of candidateModels) {
    const model = encodeURIComponent(modelName);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig,
        }),
      },
    );
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      lastError = String(
        data?.error?.message ?? data?.error?.status ?? `Gemini image generation failed (${response.status})`,
      ).slice(0, 1000);
      // Try the next known image model on not-found / unsupported.
      if (response.status === 404 || /not found|not supported|unknown model/i.test(lastError)) {
        continue;
      }
      throw new MediaError("image_generation_failed", lastError, true);
    }

    const responseParts = data?.candidates?.[0]?.content?.parts;
    const imagePart = Array.isArray(responseParts)
      ? responseParts.find((part: any) => part?.inlineData?.data || part?.inline_data?.data)
      : null;
    const inline = imagePart?.inlineData ?? imagePart?.inline_data ?? null;
    const b64 = String(inline?.data ?? "").trim();
    if (!b64) {
      const blockReason = data?.promptFeedback?.blockReason ?? data?.candidates?.[0]?.finishReason ?? null;
      lastError = blockReason
        ? `Gemini returned no image (${blockReason}).`
        : "Gemini image generation returned no image.";
      continue;
    }
    const mimeType = String(inline?.mimeType ?? inline?.mime_type ?? "image/png");
    return {
      bytes: base64ToBytes(b64),
      mimeType,
      extension: mimeExtension(mimeType),
      provider: "gemini",
      providerId: data?.responseId ?? data?.response_id ?? null,
      model: modelName,
      prompt,
    };
  }

  throw new MediaError("image_generation_failed", lastError, true);
}

async function generateImage(item: any, selection: any, service: any, context: any = null) {
  const normalized = normalizeMediaItem(item) ?? {};
  const brandVisuals = await loadBrandTemplateVisuals(service, context)
  const promptParts = [String(normalized.prompt ?? "").trim()];
  const visualNote = brandTemplateVisualPromptNote(brandVisuals)
  if (visualNote && !/attached reference images|brand layout template/i.test(promptParts[0] ?? "")) {
    promptParts.unshift(visualNote)
  }
  if (selection?.anchor_type === "image_rect") promptParts.push(`Apply the requested change only inside normalized rectangle x=${selection.x}, y=${selection.y}, width=${selection.width}, height=${selection.height}; preserve everything outside it.`);
  if (selection?.anchor_type === "image_point") promptParts.push(`Focus the requested change near normalized point x=${selection.x}, y=${selection.y}; preserve unrelated areas.`);
  const prompt = promptParts.filter(Boolean).join("\n");
  if (!prompt) {
    throw new MediaError(
      "media_prompt_missing",
      "Media item is missing a prompt. Re-plan with a top-level prompt string.",
      true,
    );
  }
  const size = ["auto", "1024x1024", "1536x1024", "1024x1536"].includes(String(normalized.size ?? item?.size))
    ? String(normalized.size ?? item?.size)
    : "auto";

  // Prefer Gemini when we have visual templates — stronger multimodal layout matching.
  // Fall back to OpenAI on billing/quota/model failures so creatives still generate.
  let provider = resolveImageProvider(normalized);
  if (brandVisuals.length > 0 && GEMINI_API_KEY && provider === "openai") {
    provider = "gemini"
  }

  if (provider === "gemini") {
    try {
      return await generateGeminiImage(normalized, selection, service, prompt, brandVisuals);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "")
      const shouldFallbackToOpenAi =
        Boolean(OPENAI_API_KEY)
        && /prepayment|credits?|billing|quota|resource.?exhausted|429|rate.?limit|gemini_api_key_missing/i.test(message)
      if (!shouldFallbackToOpenAi) throw error
      console.warn("gemini image generation failed; falling back to openai", message.slice(0, 300))
      return await generateOpenAiImage(normalized, selection, service, prompt, size, brandVisuals);
    }
  }
  return await generateOpenAiImage(normalized, selection, service, prompt, size, brandVisuals);
}

async function createOpenAIVideo(item: any, selection: any, service: any) {
  const promptParts = [String(item.prompt ?? "").trim()];
  if (selection?.time_start != null) promptParts.push(`The requested change concerns approximately ${selection.time_start}s to ${selection.time_end ?? selection.time_start}s.`);
  const body: any = {
    model: OPENAI_VIDEO_MODEL,
    prompt: promptParts.join("\n"),
    size: ["1280x720", "720x1280", "1920x1080", "1080x1920"].includes(String(item.size)) ? item.size : "1280x720",
    seconds: [8, 16, 20].includes(Number(item.seconds)) ? Number(item.seconds) : 8,
  };
  const selectedId = selection?.attachment_id;
  if (selectedId) {
    const source = await attachmentRow(service, selectedId);
    const sourceVideoId = source?.metadata?.provider_video_id ?? source?.metadata?.openai_video_id ?? null;
    if (sourceVideoId) {
      const resp = await fetch("https://api.openai.com/v1/videos/edits", {
        method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ video: { id: sourceVideoId }, prompt: body.prompt }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) throw new MediaError("video_edit_failed", data?.error?.message ?? `Video edit failed (${resp.status})`, true);
      return { provider: "openai", providerJobId: data.id, request: body, statusUrl: `https://api.openai.com/v1/videos/${data.id}` };
    }
  }
  const resp = await fetch("https://api.openai.com/v1/videos", {
    method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) throw new MediaError("video_generation_failed", data?.error?.message ?? `Video generation failed (${resp.status})`, true);
  return { provider: "openai", providerJobId: data.id, request: body, statusUrl: `https://api.openai.com/v1/videos/${data.id}` };
}

async function createReplicateVideo(item: any) {
  if (!REPLICATE_API_TOKEN || !REPLICATE_VIDEO_MODEL) throw new MediaError("replicate_video_not_configured", "REPLICATE_API_TOKEN and REPLICATE_VIDEO_MODEL are required.");
  const input = { prompt: String(item.prompt ?? ""), ...(item.provider_input && typeof item.provider_input === "object" ? item.provider_input : {}) };
  const resp = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST", headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}`, "Content-Type": "application/json", Prefer: "wait=10", "Cancel-After": "20m" },
    body: JSON.stringify({ version: REPLICATE_VIDEO_MODEL, input }),
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) throw new MediaError("replicate_video_failed", data?.detail ?? `Replicate video request failed (${resp.status})`, true);
  return { provider: "replicate", providerJobId: data.id, request: { version: REPLICATE_VIDEO_MODEL, input }, statusUrl: data?.urls?.get ?? `https://api.replicate.com/v1/predictions/${data.id}`, initial: data };
}

async function pollProviderJob(job: any) {
  if (job.provider === "openai") {
    const resp = await fetch(`https://api.openai.com/v1/videos/${job.provider_job_id}`, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) throw new MediaError("video_status_failed", data?.error?.message ?? `Video status failed (${resp.status})`, true);
    const status = String(data?.status ?? "");
    return { status: status === "completed" ? "completed" : status === "failed" ? "failed" : "pending", data };
  }
  const resp = await fetch(String(job.status_url), { headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` } });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) throw new MediaError("video_status_failed", data?.detail ?? `Replicate status failed (${resp.status})`, true);
  const status = String(data?.status ?? "");
  return { status: status === "succeeded" ? "completed" : ["failed", "canceled", "aborted"].includes(status) ? "failed" : "pending", data };
}

function outputUrl(value: any): string | null {
  if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  if (Array.isArray(value)) return value.map(outputUrl).find(Boolean) ?? null;
  if (value && typeof value === "object") return outputUrl(value.url ?? value.video ?? value.output);
  return null;
}
async function downloadCompletedVideo(job: any, result: any) {
  let response: Response;
  if (job.provider === "openai") {
    response = await fetch(`https://api.openai.com/v1/videos/${job.provider_job_id}/content`, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } });
  } else {
    const url = outputUrl(result?.output);
    if (!url) throw new MediaError("video_output_missing", "Video provider returned no output URL.");
    response = await fetch(url);
  }
  if (!response.ok) throw new MediaError("video_download_failed", `Video download failed (${response.status})`, true);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { bytes, mimeType: response.headers.get("content-type") || "video/mp4", extension: "mp4" };
}

async function storeAttachment(service: any, artifact: any, media: any, item: any, index: number) {
  const ext = media.extension || (media.mimeType?.includes("webp") ? "webp" : media.mimeType?.startsWith("video/") ? "mp4" : "png");
  const fileName = safeName(item.file_name, `${artifact.artifact_type || "artifact"}-${index + 1}.${ext}`);
  const filePath = `artifacts/${artifact.id}/${crypto.randomUUID()}/${fileName}`;
  const { error: uploadError } = await service.storage.from("attachments").upload(filePath, new Blob([media.bytes], { type: media.mimeType }), { contentType: media.mimeType, upsert: false });
  if (uploadError) throw new MediaError("media_upload_failed", uploadError.message, true);
  const payload: any = {
    table_name: "artifacts", record_id: artifact.id, file_name: fileName, file_path: filePath, mime_type: media.mimeType, size: media.bytes.length,
    media_type: media.mimeType.startsWith("video/") ? "video" : "image", alt_text: item.alt_text ?? null, caption: item.caption ?? null,
    metadata: { source: media.provider, model: media.model ?? null, prompt: media.prompt ?? item.prompt, provider_job_id: media.providerJobId ?? null, provider_video_id: media.provider === "openai" ? media.providerJobId ?? null : null },
  };
  let { data, error } = await service.from("attachments").insert(payload).select("*").single();
  if (error) {
    const minimal = { table_name: payload.table_name, record_id: payload.record_id, file_name: payload.file_name, file_path: payload.file_path, mime_type: payload.mime_type, size: payload.size, metadata: payload.metadata };
    const retry = await service.from("attachments").insert(minimal).select("*").single(); data = retry.data; error = retry.error;
  }
  if (error || !data) throw new MediaError("attachment_insert_failed", error?.message ?? "Could not create attachment record.");
  return data;
}

async function finalizeArtifact(args: { supabase: any; service: any; context: any; buildId: string; unitId: string; leaseToken: string; plan: any; media: any[] }) {
  const artifact = args.context.artifact;
  const generatedAssets = args.media.map((entry, index) => ({
    key: `asset_${crypto.randomUUID().slice(0, 8)}`, attachment_id: entry.attachment.id, media_type: entry.attachment.mime_type?.startsWith("video/") ? "video" : "image",
    file_name: entry.attachment.file_name, mime_type: entry.attachment.mime_type, alt_text: entry.item.alt_text ?? null, caption: entry.item.caption ?? null,
    provider: entry.provider, provider_job_id: entry.providerJobId ?? null,
    source_attachment_id: normalizedSelection(args.context?.unit?.input_snapshot?.artifact_spec ?? {})?.attachment_id ?? null,
  }));
  const selection = normalizedSelection(args.context?.unit?.input_snapshot?.artifact_spec ?? {});
  const existingAssets = Array.isArray(artifact?.asset_data?.assets) ? artifact.asset_data.assets : [];
  const preservedAssets = selection?.attachment_id
    ? existingAssets.filter((asset: any) => String(asset?.attachment_id ?? "") !== selection.attachment_id)
    : existingAssets;
  const assets = [...preservedAssets, ...generatedAssets];
  const plannedJson = args.plan.content_json && typeof args.plan.content_json === "object"
    ? args.plan.content_json
    : (artifact?.content_json && typeof artifact.content_json === "object" ? artifact.content_json : { version: 1, blocks: [] });
  let blocks = Array.isArray(plannedJson.blocks) ? [...plannedJson.blocks] : [];
  if (selection?.attachment_id) blocks = blocks.filter((block: any) => String(block?.attachment_id ?? "") !== selection.attachment_id);
  for (const asset of generatedAssets) blocks.push({ id: asset.key, type: asset.media_type, attachment_id: asset.attachment_id, alt: asset.alt_text, caption: asset.caption, metadata: { source_attachment_id: asset.source_attachment_id } });
  const contentJson = { ...plannedJson, version: Number(plannedJson.version) || 1, blocks };
  const contentText = String(args.plan.content_text ?? "").trim() || String(artifact?.content_text ?? "").trim() || generatedAssets.map((a) => a.caption || a.alt_text || a.file_name).join("\n");
  const snapshot = {
    title: artifact.title, status: "ready", content_text: contentText, content_json: contentJson,
    asset_data: { version: 1, assets }, metadata: { ...(artifact.metadata ?? {}), media_generated_by: "ai-media-artifact-worker", media_count: assets.length, generated_media_count: generatedAssets.length },
  };
  await appendEvent(args.supabase, { buildId: args.buildId, unitId: args.unitId, eventType: "artifact.preview", phase: "proposed", payload: { artifact_id: artifact.id, title: artifact.title, artifact_type: artifact.artifact_type, content_text: contentText, content_json: contentJson, asset_data: snapshot.asset_data, assets } });
  let expectedVersion = Number(args.context?.unit?.input_snapshot?.expected_version ?? artifact.current_version ?? 0);
  let { data: save, error } = await args.supabase.rpc("ai_save_build_artifact_v2", {
    p_build_id: args.buildId, p_unit_id: args.unitId, p_lease_token: args.leaseToken, p_artifact_id: artifact.id,
    p_expected_version: Number.isInteger(expectedVersion) ? expectedVersion : 0, p_snapshot: snapshot, p_change_summary: `Generated ${generatedAssets.length} media asset(s)`,
  });
  const isSoftConflict = (payload: unknown) => {
    const row = payload && typeof payload === "object" ? payload as Record<string, unknown> : null
    return row?.ok === false && isArtifactRevisionConflictValue(row)
  }
  // Never bump expected_version and rewrite the same snapshot. That
  // last-write-wins retry overwrites concurrent user/agent edits.
  if (
    (error && isArtifactRevisionConflictValue(error.message))
    || isSoftConflict(save)
  ) {
    const decision = decideArtifactRevisionConflictRetry({
      freshVersion: null,
      hasRebuiltSnapshotFromLatest: false,
    });
    if (decision.action === "retry") {
      expectedVersion = decision.expectedVersion;
      ;({ data: save, error } = await args.supabase.rpc("ai_save_build_artifact_v2", {
        p_build_id: args.buildId,
        p_unit_id: args.unitId,
        p_lease_token: args.leaseToken,
        p_artifact_id: artifact.id,
        p_expected_version: decision.expectedVersion,
        p_snapshot: snapshot,
        p_change_summary: `Generated ${generatedAssets.length} media asset(s)`,
      }));
    }
  }
  if (error || save?.ok === false) {
    const message = error?.message ?? save?.error ?? save?.message ?? save?.code ?? "Artifact save failed.";
    if (
      /revision_conflict|artifact_revision_conflict/i.test(String(message))
      || save?.code === "artifact_revision_conflict"
    ) {
      throw new MediaError("artifact_revision_conflict", message);
    }
    throw new MediaError("artifact_save_failed", message);
  }
  const saved = { artifact_id: artifact.id, task_id: artifact.task_id ?? null, ai_thread_id: artifact.ai_thread_id ?? null, artifact_type: artifact.artifact_type, title: artifact.title, version_number: save.version_number, assets };
  await appendEvent(args.supabase, { buildId: args.buildId, unitId: args.unitId, eventType: "artifact.version_saved", phase: "saved", payload: saved });
  const { data: completed, error: completeError } = await args.supabase.rpc("ai_complete_build_work_unit_v1", {
    p_build_id: args.buildId, p_unit_id: args.unitId, p_lease_token: args.leaseToken, p_status: "succeeded",
    p_result: { saved: [saved], failed: [], saved_count: 1, failed_count: 0 }, p_usage: {}, p_error_code: null, p_error_message: null,
  });
  if (completeError) throw new MediaError("work_unit_completion_failed", completeError.message);
  return { saved, build: completed?.build ?? null };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization) return json({ error: { code: "authentication_required" } }, 401);
  const body = await request.json().catch(() => ({}));
  const buildId = uuidOrNull((body as any).build_id ?? request.headers.get("X-AI-Build-Id"));
  const unitId = uuidOrNull((body as any).unit_id); const leaseToken = uuidOrNull((body as any).lease_token);
  if (!buildId || !unitId || !leaseToken) return json({ error: { code: "build_unit_lease_required" } }, 400);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const requestedArtifactId = uuidOrNull((body as any).artifact_id)
      ?? uuidOrNull((body as any)?.input_snapshot?.artifact_id);
    const { data: context, error } = await supabase.rpc("ai_get_artifact_generation_context_v4", {
      p_build_id: buildId,
      p_unit_id: unitId,
      p_lease_token: leaseToken,
      p_artifact_id: requestedArtifactId,
    });
    if (error || context?.ok === false) throw new MediaError("artifact_context_failed", error?.message ?? context?.error ?? "Could not load media artifact context.", true);
    const artifact = context.artifact; const type = artifactType(artifact?.artifact_type); const selection = normalizedSelection(context?.unit?.input_snapshot?.artifact_spec ?? {});
    await appendEvent(supabase, { buildId, unitId, eventType: "artifact.media_started", phase: "running", payload: { artifact_id: artifact.id, artifact_type: type, selection } });
    const { data: existingJobs, error: jobsError } = await service.from("artifact_media_jobs").select("*").eq("build_id", buildId).eq("unit_id", unitId).order("media_index");
    if (jobsError) throw new MediaError("media_jobs_read_failed", jobsError.message, true);
    let jobs: any[] = Array.isArray(existingJobs) ? existingJobs : [];
    const storedRequest = jobs[0]?.request ?? null;
    const plan = jobs.length
      ? normalizeMediaPlan({
          content_text: String(storedRequest?.plan_content_text ?? ""),
          content_json: storedRequest?.plan_content_json ?? null,
          items: jobs.map((job: any) => normalizeMediaItem(job.request?.item) ?? job.request?.item).filter(Boolean),
        })
      : await planMedia(context);
    // Text-only mixed artifacts (copy + carousel script) can finalize without generated assets.
    if (!plan.items.length) {
      if (String(plan.content_text ?? "").trim() || plan.content_json) {
        const result = await finalizeArtifact({ supabase, service, context, buildId, unitId, leaseToken, plan, media: [] });
        const pump = pumpLater(authorization, buildId, 100); const edge = (globalThis as any).EdgeRuntime; if (edge?.waitUntil) edge.waitUntil(pump);
        return json({ ok: true, build_id: buildId, unit_id: unitId, status: "succeeded", text_only: true, ...result });
      }
      throw new MediaError("media_plan_empty", "No media items were planned.", true);
    }

    // Multi-image carousels must checkpoint each slide into artifact_media_jobs and
    // yield between images. Generating all slides in one lease (~60s each) expires
    // the 5-minute work-unit lease around slide 3+.
    const imageOnly = !isVideoType(type) && !plan.items.some((item: any) => item.kind === "video");
    if (imageOnly) {
      if (!jobs.length) {
        const mediaItems = plan.items.filter((item: any) => item.kind === "image").slice(0, 12);
        if (!mediaItems.length) throw new MediaError("media_plan_empty", "No image items were planned.", true);
        for (let index = 0; index < mediaItems.length; index++) {
          const item = mediaItems[index];
          const imageProvider = resolveImageProvider(item);
          const { data: row, error: insertError } = await service.from("artifact_media_jobs").insert({
            build_id: buildId,
            unit_id: unitId,
            artifact_id: artifact.id,
            media_index: index,
            media_type: "image",
            provider: imageProvider,
            provider_job_id: `pending:image:${index}`,
            status: "pending",
            request: { item, plan_content_text: plan.content_text, plan_content_json: plan.content_json },
            result: {},
            next_poll_at: new Date().toISOString(),
            created_by: context?.build?.created_by ?? null,
          }).select("*").single();
          if (insertError || !row) throw new MediaError("media_job_insert_failed", insertError?.message ?? "Could not store image job.", true);
          jobs.push(row);
        }
      }

      const pendingJob = jobs.find((job: any) => job.status !== "completed" && job.media_type === "image");
      if (pendingJob) {
        const index = Number(pendingJob.media_index ?? 0);
        const item = normalizeMediaItem(pendingJob.request?.item)
          ?? normalizeMediaItem(plan.items[index])
          ?? plan.items[index]
          ?? {};
        // Persist normalized item so retries keep a top-level prompt.
        if (item?.prompt && pendingJob.request?.item?.prompt !== item.prompt) {
          await service.from("artifact_media_jobs").update({
            request: {
              ...(pendingJob.request ?? {}),
              item,
              plan_content_text: plan.content_text,
              plan_content_json: plan.content_json,
            },
            updated_at: new Date().toISOString(),
          }).eq("id", pendingJob.id);
        }
        await appendEvent(supabase, {
          buildId,
          unitId,
          eventType: "artifact.media_item_started",
          phase: "running",
          payload: {
            artifact_id: artifact.id,
            index,
            kind: "image",
            prompt: item?.prompt ?? null,
            provider: resolveImageProvider(item),
          },
        });
        const media = await generateImage(item, selection, service, context);
        const attachment = await storeAttachment(service, artifact, media, item, index);
        await service.from("artifact_media_jobs").update({
          status: "completed",
          provider: media.provider,
          provider_job_id: media.providerId ?? `image:${attachment.id}`,
          result: { attachment_id: attachment.id, model: media.model ?? null },
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", pendingJob.id);
        await appendEvent(supabase, {
          buildId,
          unitId,
          eventType: "artifact.media_item_saved",
          phase: "saved",
          payload: { artifact_id: artifact.id, index, kind: "image", attachment_id: attachment.id },
        });

        const { data: refreshedJobs, error: refreshError } = await service
          .from("artifact_media_jobs")
          .select("*")
          .eq("build_id", buildId)
          .eq("unit_id", unitId)
          .order("media_index");
        if (refreshError) throw new MediaError("media_jobs_read_failed", refreshError.message, true);
        jobs = Array.isArray(refreshedJobs) ? refreshedJobs : [];
        const stillPending = jobs.some((job: any) => job.status !== "completed");
        if (stillPending) {
          await appendEvent(supabase, {
            buildId,
            unitId,
            eventType: "artifact.media_queued",
            phase: "queued",
            payload: {
              artifact_id: artifact.id,
              completed: jobs.filter((j: any) => j.status === "completed").length,
              total: jobs.length,
            },
          });
          const { error: deferError } = await supabase.rpc("ai_defer_artifact_media_unit_v1", {
            p_build_id: buildId,
            p_unit_id: unitId,
            p_lease_token: leaseToken,
            p_delay_seconds: 2,
          });
          if (deferError) throw new MediaError("media_unit_defer_failed", deferError.message, true);
          const pump = pumpLater(authorization, buildId, 500);
          const edge = (globalThis as any).EdgeRuntime;
          if (edge?.waitUntil) edge.waitUntil(pump);
          return json({ ok: true, build_id: buildId, unit_id: unitId, status: "media_pending", jobs: jobs.length }, 202);
        }
      }

      const completedMedia = [];
      for (const job of jobs) {
        if (job.status !== "completed" || !job.result?.attachment_id) {
          throw new MediaError("image_job_incomplete", "A generated image job has no stored attachment.", true);
        }
        const attachment = await attachmentRow(service, job.result.attachment_id);
        completedMedia.push({
          item: job.request?.item ?? {},
          attachment,
          provider: job.provider,
          providerJobId: job.provider_job_id,
        });
      }
      const storedPlan = jobs[0]?.request ?? {};
      const result = await finalizeArtifact({
        supabase,
        service,
        context,
        buildId,
        unitId,
        leaseToken,
        plan: {
          content_text: storedPlan.plan_content_text ?? plan.content_text,
          content_json: storedPlan.plan_content_json ?? plan.content_json,
        },
        media: completedMedia,
      });
      const pump = pumpLater(authorization, buildId, 100);
      const edge = (globalThis as any).EdgeRuntime;
      if (edge?.waitUntil) edge.waitUntil(pump);
      return json({ ok: true, build_id: buildId, unit_id: unitId, status: "succeeded", ...result });
    }

    if (!jobs.length) {
      const mediaItems = plan.items.slice(0, 12);
      for (let index = 0; index < mediaItems.length; index++) {
        const item = mediaItems[index];
        if (item.kind === "image") {
          await appendEvent(supabase, {
            buildId,
            unitId,
            eventType: "artifact.media_item_started",
            phase: "running",
            payload: {
              artifact_id: artifact.id,
              index,
              kind: "image",
              prompt: item.prompt,
              provider: resolveImageProvider(item),
            },
          });
          const media = await generateImage(item, selection, service, context);
          const attachment = await storeAttachment(service, artifact, media, item, index);
          const { data: row, error: insertError } = await service.from("artifact_media_jobs").insert({
            build_id: buildId, unit_id: unitId, artifact_id: artifact.id, media_index: index, media_type: "image", provider: media.provider,
            provider_job_id: media.providerId ?? `image:${attachment.id}`, status: "completed",
            request: { item, plan_content_text: plan.content_text, plan_content_json: plan.content_json },
            result: { attachment_id: attachment.id, model: media.model ?? null }, completed_at: new Date().toISOString(), created_by: context?.build?.created_by ?? null,
          }).select("*").single();
          if (insertError || !row) throw new MediaError("media_job_insert_failed", insertError?.message ?? "Could not store image job.");
          jobs.push(row);
          await appendEvent(supabase, { buildId, unitId, eventType: "artifact.media_item_saved", phase: "saved", payload: { artifact_id: artifact.id, index, kind: "image", attachment_id: attachment.id } });
          continue;
        }
        if (item.kind !== "video") continue;
        const provider = String(item.provider ?? (REPLICATE_VIDEO_MODEL ? "replicate" : "openai"));
        const created = provider === "replicate" ? await createReplicateVideo(item) : await createOpenAIVideo(item, selection, service);
        const { data: row, error: insertError } = await service.from("artifact_media_jobs").insert({
          build_id: buildId, unit_id: unitId, artifact_id: artifact.id, media_index: index, media_type: "video", provider: created.provider,
          provider_job_id: created.providerJobId, status_url: created.statusUrl, status: "pending", request: { item, provider_request: created.request, plan_content_text: plan.content_text, plan_content_json: plan.content_json },
          result: (created as any).initial ?? {}, next_poll_at: new Date(Date.now() + 10000).toISOString(), created_by: context?.build?.created_by ?? null,
        }).select("*").single();
        if (insertError || !row) throw new MediaError("media_job_insert_failed", insertError?.message ?? "Could not store media job.");
        jobs.push(row);
      }
      const hasPendingVideo = jobs.some((job: any) => job.status !== "completed");
      if (!hasPendingVideo) {
        const completedMedia = [];
        for (const job of jobs) {
          const attachment = await attachmentRow(service, job.result.attachment_id);
          completedMedia.push({ item: job.request?.item ?? {}, attachment, provider: job.provider, providerJobId: job.provider_job_id });
        }
        const result = await finalizeArtifact({ supabase, service, context, buildId, unitId, leaseToken, plan, media: completedMedia });
        const pump = pumpLater(authorization, buildId, 100); const edge = (globalThis as any).EdgeRuntime; if (edge?.waitUntil) edge.waitUntil(pump);
        return json({ ok: true, build_id: buildId, unit_id: unitId, status: "succeeded", ...result });
      }
      await appendEvent(supabase, { buildId, unitId, eventType: "artifact.media_queued", phase: "queued", payload: { artifact_id: artifact.id, jobs: jobs.map((j: any) => ({ id: j.id, provider: j.provider, provider_job_id: j.provider_job_id, media_type: j.media_type })) } });
      const { error: deferError } = await supabase.rpc("ai_defer_artifact_media_unit_v1", { p_build_id: buildId, p_unit_id: unitId, p_lease_token: leaseToken, p_delay_seconds: 12 });
      if (deferError) throw new MediaError("media_unit_defer_failed", deferError.message, true);
      const pump = pumpLater(authorization, buildId, 12000); const edge = (globalThis as any).EdgeRuntime; if (edge?.waitUntil) edge.waitUntil(pump);
      return json({ ok: true, build_id: buildId, unit_id: unitId, status: "media_pending", jobs: jobs.length }, 202);
    }

    const completedMedia: any[] = []; let pending = false;
    for (const job of jobs) {
      const item = job.request?.item ?? {};
      if (job.status === "completed" && job.result?.attachment_id) {
        const attachment = await attachmentRow(service, job.result.attachment_id);
        completedMedia.push({ item, attachment, provider: job.provider, providerJobId: job.provider_job_id });
        continue;
      }
      if (job.media_type === "image") throw new MediaError("image_job_incomplete", "A generated image job has no stored attachment.");
      const polled = await pollProviderJob(job);
      if (polled.status === "failed") {
        await service.from("artifact_media_jobs").update({ status: "failed", result: polled.data, error: polled.data?.error ?? "provider_failed", updated_at: new Date().toISOString() }).eq("id", job.id);
        throw new MediaError("video_generation_failed", JSON.stringify(polled.data?.error ?? polled.data).slice(0, 1000));
      }
      if (polled.status === "pending") {
        pending = true;
        await service.from("artifact_media_jobs").update({ status: "pending", result: polled.data, next_poll_at: new Date(Date.now() + 12000).toISOString(), poll_count: Number(job.poll_count ?? 0) + 1, updated_at: new Date().toISOString() }).eq("id", job.id);
        await appendEvent(supabase, { buildId, unitId, eventType: "artifact.media_progress", phase: "running", payload: { artifact_id: artifact.id, provider_job_id: job.provider_job_id, status: polled.data?.status ?? "pending", progress: polled.data?.progress ?? null } });
        continue;
      }
      const media = await downloadCompletedVideo(job, polled.data);
      const attachment = await storeAttachment(service, artifact, { ...media, provider: job.provider, providerJobId: job.provider_job_id, prompt: item.prompt }, item, Number(job.media_index));
      await service.from("artifact_media_jobs").update({ status: "completed", result: { provider_result: polled.data, attachment_id: attachment.id }, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
      completedMedia.push({ item, attachment, provider: job.provider, providerJobId: job.provider_job_id });
    }
    if (pending) {
      const { error: deferError } = await supabase.rpc("ai_defer_artifact_media_unit_v1", { p_build_id: buildId, p_unit_id: unitId, p_lease_token: leaseToken, p_delay_seconds: 12 });
      if (deferError) throw new MediaError("media_unit_defer_failed", deferError.message, true);
      const pump = pumpLater(authorization, buildId, 12000); const edge = (globalThis as any).EdgeRuntime; if (edge?.waitUntil) edge.waitUntil(pump);
      return json({ ok: true, build_id: buildId, unit_id: unitId, status: "media_pending" }, 202);
    }
    const storedPlan = jobs[0]?.request ?? {};
    const result = await finalizeArtifact({ supabase, service, context, buildId, unitId, leaseToken, plan: { content_text: storedPlan.plan_content_text ?? plan.content_text, content_json: storedPlan.plan_content_json ?? plan.content_json }, media: completedMedia });
    const pump = pumpLater(authorization, buildId, 100); const edge = (globalThis as any).EdgeRuntime; if (edge?.waitUntil) edge.waitUntil(pump);
    return json({ ok: true, build_id: buildId, unit_id: unitId, status: "succeeded", ...result });
  } catch (error: any) {
    const mediaError = error instanceof MediaError ? error : new MediaError("media_worker_failed", error?.message ?? String(error), true);
    console.error("ai-media-artifact-worker failed", { build_id: buildId, unit_id: unitId, code: mediaError.code, message: mediaError.message });
    await appendEvent(supabase, {
      buildId,
      unitId,
      eventType: "artifact.media_failed",
      phase: "failed",
      payload: {
        code: mediaError.code,
        message: mediaError.message.slice(0, 1000),
        retryable: mediaError.retryable,
        image_provider: DEFAULT_IMAGE_PROVIDER,
        gemini_configured: Boolean(GEMINI_API_KEY),
      },
    }).catch(() => {});

    // Retryable: leave the lease open and return 503 so the orchestrator requeues.
    // Completing as failed here races with requeue and hides the real error code.
    if (mediaError.retryable) {
      return json({
        ok: false,
        build_id: buildId,
        unit_id: unitId,
        error: { code: mediaError.code, message: mediaError.message },
      }, 503);
    }

    const { data: failed } = await supabase.rpc("ai_complete_build_work_unit_v1", {
      p_build_id: buildId, p_unit_id: unitId, p_lease_token: leaseToken, p_status: "failed",
      p_result: { saved: [], failed: [{ error: mediaError.code }], saved_count: 0, failed_count: 1 }, p_usage: {}, p_error_code: mediaError.code, p_error_message: mediaError.message.slice(0, 2000),
    }).catch(() => ({ data: null } as any));
    // Return 200 so the orchestrator does not wrap this as worker_dispatch_http_500.
    return json({ ok: false, build_id: buildId, unit_id: unitId, error: { code: mediaError.code, message: mediaError.message }, build: failed?.build ?? null }, 200);
  }
});
