import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const VISION_MODEL = Deno.env.get("OPENAI_SOURCE_VISION_MODEL") ?? Deno.env.get("OPENAI_MODEL_FAST") ?? "gpt-5.4-mini";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function uuidOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function stripHtml(html: string) {
  return String(html ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<\/h[1-6]\s*>/gi, "\n\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

/** Copy into a fresh ArrayBuffer so mammoth never receives a view/SharedArrayBuffer. */
function toStandaloneArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const mammothMod = await import("npm:mammoth@1.6.0");
  const mammoth = (mammothMod as { default?: typeof mammothMod } & Record<string, unknown>).default
    ?? mammothMod;
  const extractRawText = (mammoth as { extractRawText?: (options: Record<string, unknown>) => Promise<{ value?: string }> })
    .extractRawText;
  if (typeof extractRawText !== "function") {
    throw new Error("mammoth_extractRawText_unavailable");
  }

  const arrayBuffer = toStandaloneArrayBuffer(bytes);
  try {
    const result = await extractRawText({ arrayBuffer });
    return String(result?.value ?? "").trim();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // Deno npm interop occasionally fails option detection; retry with a Uint8Array buffer.
    if (!message.includes("Could not find file in options")) throw error;
    const result = await extractRawText({ buffer: new Uint8Array(arrayBuffer) });
    return String(result?.value ?? "").trim();
  }
}

async function describeImage(bytes: Uint8Array, mimeType: string, fileName: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Extract visible text, structure and factual visual information from this source image. Return concise markdown. Do not invent hidden content.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Source file: ${fileName}` },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType || "image/png"};base64,${bytesToBase64(bytes)}` },
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(90000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message ?? `source_image_model_http_${response.status}`);
  return String(data?.choices?.[0]?.message?.content ?? "").trim();
}

async function fetchUrl(url: string) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("unsupported_source_url_protocol");
  const response = await fetch(parsed.toString(), {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AIWorkspaceSourceImporter/1.0)" },
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`source_fetch_http_${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  const raw = await response.text();
  return {
    source_url: response.url || parsed.toString(),
    content_text: (/html/i.test(contentType) ? stripHtml(raw) : raw.trim()).slice(0, 1000000),
    content_type: contentType,
  };
}

function storageObject(filePath: string, fallbackBucket: string) {
  const bucket = filePath.includes("/project-files/") ? "project-files" : fallbackBucket;
  const publicMarker = `/object/public/${bucket}/`;
  const marker = `/object/${bucket}/`;
  const objectPath = filePath.includes(publicMarker)
    ? filePath.split(publicMarker)[1]
    : filePath.includes(marker)
      ? filePath.split(marker)[1]
      : filePath.replace(new RegExp(`^${bucket}/`), "");
  return { bucket, objectPath };
}

async function extractAttachment(serviceDb: any, attachment: any) {
  const filePath = String(attachment?.file_path ?? "");
  const fileName = String(attachment?.file_name ?? attachment?.name ?? "source-file");
  const mimeType = String(attachment?.mime_type ?? "").toLowerCase();
  if (!filePath) throw new Error("attachment_file_path_missing");
  const { bucket, objectPath } = storageObject(filePath, "attachments");
  const { data, error } = await serviceDb.storage.from(bucket).download(objectPath);
  if (error || !data) throw new Error(error?.message ?? "attachment_download_failed");
  const bytes = new Uint8Array(await data.arrayBuffer());

  if (
    mimeType.includes("text")
    || mimeType.includes("markdown")
    || mimeType.includes("json")
    || mimeType.includes("html")
    || /\.(txt|md|markdown|html|csv|json)$/i.test(fileName)
  ) {
    return { content_text: new TextDecoder().decode(bytes), content_type: mimeType || "text/plain" };
  }
  if (mimeType.includes("pdf") || /\.pdf$/i.test(fileName)) {
    const { getDocument } = await import("pdfjs-dist/build/pdf.mjs");
    const pdf = await getDocument({ data: bytes }).promise;
    let text = "";
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str).join(" ") + "\n";
    }
    return { content_text: text.trim(), content_type: mimeType || "application/pdf", page_count: pdf.numPages };
  }
  if (mimeType.includes("word") || /\.docx$/i.test(fileName)) {
    const content_text = await extractDocxText(bytes);
    return {
      content_text,
      content_type: mimeType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
  }
  if (mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(fileName)) {
    return {
      content_text: await describeImage(bytes, mimeType || "image/png", fileName),
      content_type: mimeType || "image/png",
      visual_source: true,
    };
  }
  return { content_text: "", content_type: mimeType || "application/octet-stream", binary_only: true };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: { code: "method_not_allowed" } }, 405);
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization) return json({ error: { code: "authentication_required" } }, 401);
  const body = await request.json().catch(() => ({}));
  const sourceId = uuidOrNull((body as any).source_id);
  if (!sourceId) return json({ error: { code: "source_id_required" } }, 400);

  const userDb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: current, error: readError } = await userDb.rpc("ai_get_source_v1", {
      p_source_id: sourceId,
      p_version_number: null,
    });
    if (readError || current?.ok === false) {
      throw new Error(readError?.message ?? current?.error ?? "source_read_failed");
    }
    const source = current.source ?? {};
    let imported: any;
    if (String(source.source_type ?? "") === "url") {
      if (!source.source_url) throw new Error("source_url_missing");
      imported = await fetchUrl(String(source.source_url));
    } else if (source.attachment_id) {
      const { data: attachment, error: attachmentError } = await serviceDb
        .from("attachments")
        .select("id,file_name,file_path,mime_type,size,metadata")
        .eq("id", source.attachment_id)
        .maybeSingle();
      if (attachmentError || !attachment) {
        throw new Error(attachmentError?.message ?? "source_attachment_not_found");
      }
      imported = await extractAttachment(serviceDb, attachment);
    } else {
      return json({
        ok: true,
        source_id: sourceId,
        skipped: true,
        reason: "source_has_no_importable_url_or_attachment",
      });
    }

    const nextSnapshot = {
      ...source,
      status: "ready",
      source_url: imported.source_url ?? source.source_url ?? null,
      content_text: imported.content_text ?? source.content_text ?? null,
      metadata: {
        ...(source.metadata ?? {}),
        imported_at: new Date().toISOString(),
        imported_content_type: imported.content_type ?? null,
        page_count: imported.page_count ?? null,
        binary_only: imported.binary_only === true,
        visual_source: imported.visual_source === true,
      },
    };
    const { data: saved, error: saveError } = await userDb.rpc("ai_save_source_version_v1", {
      p_source_id: sourceId,
      p_expected_version: Number(source.current_version ?? current.version_number ?? 0),
      p_snapshot: nextSnapshot,
      p_change_source: "source_import_worker",
      p_change_summary: "Imported source content",
    });
    if (saveError || saved?.ok === false) {
      throw new Error(saveError?.message ?? saved?.error ?? "source_save_failed");
    }
    return json({ ok: true, source_id: sourceId, version_number: saved.version_number, source: saved.source });
  } catch (error: any) {
    console.error("source import failed", { source_id: sourceId, error: error?.message ?? String(error) });
    try {
      const { data: current } = await userDb.rpc("ai_get_source_v1", {
        p_source_id: sourceId,
        p_version_number: null,
      });
      if (current?.source) {
        await userDb.rpc("ai_save_source_version_v1", {
          p_source_id: sourceId,
          p_expected_version: Number(current.source.current_version ?? current.version_number ?? 0),
          p_snapshot: {
            ...current.source,
            status: "failed",
            metadata: {
              ...(current.source.metadata ?? {}),
              import_error: error?.message ?? String(error),
              import_failed_at: new Date().toISOString(),
            },
          },
          p_change_source: "source_import_worker",
          p_change_summary: "Source import failed",
        });
      }
    } catch {
      /* preserve original error */
    }
    return json(
      { ok: false, error: { code: "source_import_failed", message: error?.message ?? String(error) }, source_id: sourceId },
      500,
    );
  }
});
