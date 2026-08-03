import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function uuidOrNull(value: unknown) {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function positiveInt(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function safeFilename(value: unknown, fallback = "artifact") {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return normalized || fallback;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function blocks(snapshot: any) {
  const value = snapshot?.content_json;
  return value && typeof value === "object" && Array.isArray(value.blocks) ? value.blocks : [];
}

function primaryRichHtml(snapshot: any): string | null {
  for (const block of blocks(snapshot)) {
    const html = typeof block?.html === "string" ? block.html.trim() : "";
    if (html) return html;
  }
  const text = String(snapshot?.content_text ?? "");
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return null;
}

function blocksToMarkdown(snapshot: any) {
  const rich = primaryRichHtml(snapshot);
  if (rich) {
    // Prefer plain text mirror when available; otherwise strip tags lightly.
    const plain = String(snapshot?.content_text ?? "").trim();
    if (plain && !/<[a-z][\s\S]*>/i.test(plain)) return plain;
    return rich
      .replace(/<\/(h[1-6]|p|div|li|tr)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  const contentBlocks = blocks(snapshot);
  if (!contentBlocks.length) return String(snapshot?.content_text ?? "");
  return contentBlocks.map((block: any) => {
    const type = String(block?.type ?? "paragraph");
    const title = String(block?.title ?? "").trim();
    const text = String(block?.text ?? "").trim();
    if (type === "heading") return `${"#".repeat(Math.max(1, Math.min(6, Number(block?.level) || 2)))} ${title || text}`;
    if (type === "list" && Array.isArray(block?.items)) return block.items.map((item: any) => `- ${String(item)}`).join("\n");
    if (type === "table" && Array.isArray(block?.rows)) return block.rows.map((row: any[]) => `| ${row.map(String).join(" | ")} |`).join("\n");
    if (type === "image") return `![${String(block?.alt ?? title)}](${String(block?.url ?? "")})${block?.caption ? `\n\n${block.caption}` : ""}`;
    return [title ? `## ${title}` : "", text].filter(Boolean).join("\n\n");
  }).filter(Boolean).join("\n\n");
}

function blocksToHtml(snapshot: any) {
  const rich = primaryRichHtml(snapshot);
  if (rich) return rich;
  const contentBlocks = blocks(snapshot);
  if (!contentBlocks.length) {
    const text = String(snapshot?.content_text ?? "");
    return text.split(/\n{2,}/).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("\n");
  }
  return contentBlocks.map((block: any) => {
    const type = String(block?.type ?? "paragraph");
    const title = String(block?.title ?? "").trim();
    const text = String(block?.text ?? "").trim();
    if (type === "heading") {
      const level = Math.max(1, Math.min(6, Number(block?.level) || 2));
      return `<h${level}>${escapeHtml(title || text)}</h${level}>`;
    }
    if (type === "list" && Array.isArray(block?.items)) return `<ul>${block.items.map((item: any) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
    if (type === "image") return `<figure><img src="${escapeHtml(block?.url ?? "")}" alt="${escapeHtml(block?.alt ?? title)}">${block?.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""}</figure>`;
    return `${title ? `<h2>${escapeHtml(title)}</h2>` : ""}${text ? `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>` : ""}`;
  }).join("\n");
}

function extractObjectPath(filePath: string, bucket: string) {
  const publicMarker = `/object/public/${bucket}/`;
  const marker = `/object/${bucket}/`;
  if (filePath.includes(publicMarker)) return filePath.split(publicMarker)[1];
  if (filePath.includes(marker)) return filePath.split(marker)[1];
  return filePath.replace(new RegExp(`^${bucket}/`), "");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!["GET", "POST"].includes(request.method)) return json({ error: { code: "method_not_allowed" } }, 405);

  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization) return json({ error: { code: "authentication_required" } }, 401);

  const url = new URL(request.url);
  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const artifactId = uuidOrNull(body.artifact_id ?? url.searchParams.get("artifact_id"));
  const versionNumber = positiveInt(body.version_number ?? url.searchParams.get("version"));
  const format = String(body.format ?? url.searchParams.get("format") ?? "html").trim().toLowerCase();
  const attachmentId = uuidOrNull(body.attachment_id ?? url.searchParams.get("attachment_id"));
  if (!artifactId) return json({ error: { code: "artifact_id_required" } }, 400);

  if (format === "docx") {
    return json({
      error: {
        code: "docx_client_export",
        message: "Word (.docx) export is generated in the app so images and rich formatting can be preserved.",
      },
    }, 400);
  }

  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc("ai_get_artifact_v2", {
    p_artifact_id: artifactId,
    p_version_number: versionNumber,
  });
  if (error || data?.ok === false) return json({ error: { code: "artifact_read_failed", message: error?.message ?? data?.error ?? null } }, 403);

  const snapshot = data?.snapshot ?? {};
  const baseName = safeFilename(snapshot.title, `artifact-${artifactId}`);

  if (format === "original") {
    const assets = Array.isArray(snapshot?.asset_data?.assets) ? snapshot.asset_data.assets : [];
    const asset = attachmentId
      ? assets.find((item: any) => uuidOrNull(item?.attachment_id ?? item?.file_id) === attachmentId)
      : assets.length === 1 ? assets[0] : null;
    const resolvedAttachmentId = uuidOrNull(asset?.attachment_id ?? asset?.file_id ?? attachmentId);
    if (!resolvedAttachmentId) {
      return json({
        error: {
          code: "original_asset_selection_required",
          message: assets.length > 1 ? "This artifact contains several assets. Provide attachment_id." : "No downloadable original asset is attached.",
        },
        assets,
      }, 409);
    }
    const { data: attachment, error: attachmentError } = await db
      .from("attachments")
      .select("id,file_name,file_path,mime_type")
      .eq("id", resolvedAttachmentId)
      .maybeSingle();
    if (attachmentError || !attachment) return json({ error: { code: "attachment_not_found_or_forbidden", message: attachmentError?.message ?? null } }, 404);
    const bucket = String(asset?.bucket ?? (String(attachment.file_path ?? "").includes("/project-files/") ? "project-files" : "attachments"));
    const objectPath = extractObjectPath(String(attachment.file_path ?? ""), bucket);
    const { data: file, error: fileError } = await db.storage.from(bucket).download(objectPath);
    if (fileError || !file) return json({ error: { code: "attachment_download_failed", message: fileError?.message ?? null } }, 500);
    return new Response(file, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": attachment.mime_type || file.type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeFilename(attachment.file_name, baseName)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  let content = "";
  let mimeType = "text/plain; charset=utf-8";
  let extension = "txt";
  if (format === "json") {
    content = JSON.stringify(snapshot, null, 2);
    mimeType = "application/json; charset=utf-8";
    extension = "json";
  } else if (["md", "markdown"].includes(format)) {
    content = blocksToMarkdown(snapshot);
    mimeType = "text/markdown; charset=utf-8";
    extension = "md";
  } else if (format === "html") {
    const bodyHtml = blocksToHtml(snapshot);
    content = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(snapshot.title ?? "Artifact")}</title></head><body>${bodyHtml}</body></html>`;
    mimeType = "text/html; charset=utf-8";
    extension = "html";
  } else {
    content = String(snapshot.content_text ?? blocksToMarkdown(snapshot));
  }

  return new Response(content, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${baseName}.${extension}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
