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

async function extractSpreadsheetText(bytes: Uint8Array): Promise<string> {
  const xlsxMod = await import("npm:xlsx@0.18.5");
  const XLSX = (xlsxMod as { default?: typeof xlsxMod } & Record<string, unknown>).default ?? xlsxMod;
  const read = (XLSX as {
    read?: (data: Uint8Array | ArrayBuffer, opts: Record<string, unknown>) => {
      SheetNames?: string[]
      Sheets?: Record<string, unknown>
    }
  }).read;
  const sheetToCsv = (XLSX as {
    utils?: { sheet_to_csv?: (sheet: unknown) => string }
  }).utils?.sheet_to_csv;
  if (typeof read !== "function" || typeof sheetToCsv !== "function") {
    throw new Error("xlsx_parse_unavailable");
  }
  // Prefer a standalone ArrayBuffer — Deno/npm interop can choke on SharedArrayBuffer views.
  const arrayBuffer = toStandaloneArrayBuffer(bytes);
  let workbook: { SheetNames?: string[]; Sheets?: Record<string, unknown> };
  try {
    workbook = read(new Uint8Array(arrayBuffer), { type: "array", cellDates: true });
  } catch {
    workbook = read(arrayBuffer, { type: "array", cellDates: true });
  }
  const names = Array.isArray(workbook.SheetNames) ? workbook.SheetNames : [];
  const sheets = workbook.Sheets ?? {};
  const parts: string[] = [];
  for (const name of names) {
    const sheet = sheets[name];
    if (!sheet) continue;
    const csv = String(sheetToCsv(sheet) ?? "").trim();
    if (!csv) continue;
    parts.push(names.length > 1 ? `## ${name}\n${csv}` : csv);
  }
  const text = parts.join("\n\n").trim();
  if (!text) throw new Error("xlsx_empty_workbook");
  return text;
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

type ExtractedPdfImage = {
  attachment_id: string
  file_path: string
  file_name: string
  page: number
  width: number
  height: number
  mime_type: string
}

function expandChannelsToRgba(
  data: Uint8Array,
  width: number,
  height: number,
  channels: number,
): Uint8Array {
  const pixelCount = width * height
  if (channels === 4 && data.length >= pixelCount * 4) return data
  const rgba = new Uint8Array(pixelCount * 4)
  if (channels === 1) {
    for (let i = 0; i < pixelCount; i += 1) {
      const v = data[i] ?? 0
      const o = i * 4
      rgba[o] = v
      rgba[o + 1] = v
      rgba[o + 2] = v
      rgba[o + 3] = 255
    }
    return rgba
  }
  if (channels === 3) {
    for (let i = 0; i < pixelCount; i += 1) {
      const s = i * 3
      const o = i * 4
      rgba[o] = data[s] ?? 0
      rgba[o + 1] = data[s + 1] ?? 0
      rgba[o + 2] = data[s + 2] ?? 0
      rgba[o + 3] = 255
    }
    return rgba
  }
  // Unknown channel layout — pad what we can.
  for (let i = 0; i < pixelCount; i += 1) {
    const s = i * Math.max(1, channels)
    const o = i * 4
    rgba[o] = data[s] ?? 0
    rgba[o + 1] = data[s + Math.min(1, channels - 1)] ?? rgba[o]
    rgba[o + 2] = data[s + Math.min(2, channels - 1)] ?? rgba[o]
    rgba[o + 3] = channels >= 4 ? (data[s + 3] ?? 255) : 255
  }
  return rgba
}

async function encodeRawImagePng(args: {
  data: Uint8Array
  width: number
  height: number
  channels: number
}): Promise<Uint8Array> {
  const { encode } = await import("npm:fast-png@6.2.0")
  const rgba = expandChannelsToRgba(args.data, args.width, args.height, args.channels)
  const encoded = encode({
    width: args.width,
    height: args.height,
    data: rgba,
    depth: 8,
    channels: 4,
  })
  return encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded)
}

async function extractAndStorePdfImages(args: {
  serviceDb: any
  sourceId: string
  pdf: any
  pageCount: number
  maxImages?: number
  maxPages?: number
}): Promise<ExtractedPdfImage[]> {
  const { extractImages } = await import("npm:unpdf@1.8.0")
  const maxImages = args.maxImages ?? 24
  const maxPages = Math.min(args.pageCount || 1, args.maxPages ?? 20)
  const stored: ExtractedPdfImage[] = []
  const seen = new Set<string>()

  for (let page = 1; page <= maxPages && stored.length < maxImages; page += 1) {
    let images: any[] = []
    try {
      images = await extractImages(args.pdf, page)
    } catch (error) {
      console.warn("pdf extractImages failed", { page, error: String(error) })
      continue
    }
    if (!Array.isArray(images) || images.length === 0) continue

    for (let index = 0; index < images.length && stored.length < maxImages; index += 1) {
      const img = images[index]
      const width = Number(img?.width) || 0
      const height = Number(img?.height) || 0
      const channels = Number(img?.channels) || 0
      const raw = img?.data
      if (!width || !height || !channels || !(raw instanceof Uint8Array || ArrayBuffer.isView(raw))) {
        continue
      }
      // Skip tiny icons / logos that pollute newsletters.
      if (width < 64 || height < 64) continue
      const data = raw instanceof Uint8Array ? raw : new Uint8Array(raw.buffer)
      const dedupeKey = `${page}:${img?.key ?? index}:${width}x${height}:${data.length}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      let pngBytes: Uint8Array
      try {
        pngBytes = await encodeRawImagePng({ data, width, height, channels })
      } catch (error) {
        console.warn("pdf image png encode failed", { page, index, error: String(error) })
        continue
      }

      const fileName = `pdf-p${page}-img${index + 1}.png`
      const filePath = `sources/${args.sourceId}/extracted/${crypto.randomUUID()}/${fileName}`
      const { error: uploadError } = await args.serviceDb.storage
        .from("attachments")
        .upload(filePath, new Blob([pngBytes], { type: "image/png" }), {
          contentType: "image/png",
          upsert: false,
        })
      if (uploadError) {
        console.warn("pdf image upload failed", { filePath, error: uploadError.message })
        continue
      }

      const payload: Record<string, unknown> = {
        table_name: "sources",
        record_id: args.sourceId,
        file_name: fileName,
        file_path: filePath,
        mime_type: "image/png",
        size: pngBytes.length,
        media_type: "image",
        metadata: {
          extracted_from_pdf: true,
          source_id: args.sourceId,
          page,
          index: index + 1,
          width,
          height,
        },
      }
      let { data: row, error: insertError } = await args.serviceDb
        .from("attachments")
        .insert(payload)
        .select("id,file_path,file_name,mime_type")
        .single()
      if (insertError) {
        const minimal = {
          table_name: payload.table_name,
          record_id: payload.record_id,
          file_name: payload.file_name,
          file_path: payload.file_path,
          mime_type: payload.mime_type,
          size: payload.size,
          metadata: payload.metadata,
        }
        const retry = await args.serviceDb
          .from("attachments")
          .insert(minimal)
          .select("id,file_path,file_name,mime_type")
          .single()
        row = retry.data
        insertError = retry.error
      }
      if (insertError || !row?.id) {
        console.warn("pdf image attachment insert failed", insertError?.message)
        continue
      }

      stored.push({
        attachment_id: String(row.id),
        file_path: String(row.file_path ?? filePath),
        file_name: String(row.file_name ?? fileName),
        page,
        width,
        height,
        mime_type: "image/png",
      })
    }
  }

  return stored
}

async function extractAttachment(serviceDb: any, attachment: any, sourceId?: string | null) {
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
    // Deno rejects bare npm package paths; use npm: specifier (same pattern as mammoth).
    // unpdf ships a serverless PDF.js build that works in edge/Deno without workers.
    const { extractText, getDocumentProxy } = await import("npm:unpdf@1.8.0");
    const pdf = await getDocumentProxy(bytes);
    const extracted = await extractText(pdf, { mergePages: true });
    const text = typeof extracted?.text === "string"
      ? extracted.text
      : Array.isArray(extracted?.text)
        ? extracted.text.join("\n")
        : "";
    const pageCount =
      typeof extracted?.totalPages === "number"
        ? extracted.totalPages
        : typeof pdf?.numPages === "number"
          ? pdf.numPages
          : null;
    let extractedImages: ExtractedPdfImage[] = []
    if (sourceId) {
      try {
        extractedImages = await extractAndStorePdfImages({
          serviceDb,
          sourceId,
          pdf,
          pageCount: Number(pageCount) || 1,
        })
      } catch (error) {
        console.warn("pdf image extraction skipped", { sourceId, error: String(error) })
      }
    }
    const imageManifest = extractedImages.length
      ? [
          "",
          "## Extracted images from this PDF",
          "Use these hosted image URLs (from source metadata.extracted_images[].url) as <img src> in HTML email deliverables:",
          ...extractedImages.map(
            (img, i) =>
              `- image_${i + 1}: attachment_id=${img.attachment_id} page=${img.page} ${img.width}x${img.height} file=${img.file_name}`,
          ),
        ].join("\n")
      : ""
    return {
      content_text: `${String(text ?? "").trim()}${imageManifest}`.trim(),
      content_type: mimeType || "application/pdf",
      page_count: pageCount,
      extracted_images: extractedImages,
    };
  }
  if (mimeType.includes("word") || /\.docx$/i.test(fileName)) {
    const content_text = await extractDocxText(bytes);
    return {
      content_text,
      content_type: mimeType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
  }
  const isSpreadsheet =
    mimeType.includes("spreadsheetml")
    || mimeType === "application/vnd.ms-excel"
    || mimeType.includes("ms-excel")
    || /\.xlsx$/i.test(fileName)
    || /\.xls$/i.test(fileName)
    || (mimeType === "application/octet-stream" && (/\.xlsx$/i.test(fileName) || /\.xls$/i.test(fileName)));
  if (isSpreadsheet) {
    try {
      const content_text = await extractSpreadsheetText(bytes);
      return {
        content_text,
        content_type:
          mimeType && mimeType !== "application/octet-stream"
            ? mimeType
            : (/\.xls$/i.test(fileName)
              ? "application/vnd.ms-excel"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      };
    } catch (error) {
      console.warn("spreadsheet extraction failed", {
        fileName,
        mimeType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `spreadsheet_extract_failed:${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
      imported = await extractAttachment(serviceDb, attachment, sourceId);
    } else {
      return json({
        ok: true,
        source_id: sourceId,
        skipped: true,
        reason: "source_has_no_importable_url_or_attachment",
      });
    }

    const extractedImages = Array.isArray(imported.extracted_images)
      ? imported.extracted_images
      : []
    const nextContentJson = {
      ...(source.content_json && typeof source.content_json === "object" ? source.content_json : {}),
      ...(extractedImages.length ? { extracted_images: extractedImages } : {}),
    }
    const nextSnapshot = {
      ...source,
      status: "ready",
      source_url: imported.source_url ?? source.source_url ?? null,
      content_text: imported.content_text ?? source.content_text ?? null,
      content_json: Object.keys(nextContentJson).length ? nextContentJson : source.content_json ?? null,
      metadata: {
        ...(source.metadata ?? {}),
        imported_at: new Date().toISOString(),
        imported_content_type: imported.content_type ?? null,
        page_count: imported.page_count ?? null,
        binary_only: imported.binary_only === true,
        visual_source: imported.visual_source === true,
        extracted_image_count: extractedImages.length,
        extracted_images: extractedImages,
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
