import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import {
  extractPrimaryArtifactHtml,
} from "../../app/lib/artifact-selection-patch"
import type { TaskArtifact } from "../../app/lib/artifacts/artifact-types"
import {
  buildExportDocxNumberingConfig,
  fetchImageBytesForDocx,
  htmlToDocxElementsAsync,
} from "../tasks/utils/task-content-docx-render"

function safeFilename(value: unknown, fallback = "artifact"): string {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
  return normalized || fallback
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement("a")
    anchor.href = objectUrl
    anchor.download = filename
    anchor.rel = "noopener"
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function collectAttachmentIds(html: string): string[] {
  const ids = new Set<string>()
  const re = /data-attachment-id=["']([^"']+)["']/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) != null) {
    const id = match[1]?.trim()
    if (id) ids.add(id)
  }
  return [...ids]
}

/**
 * Refresh signed URLs for inline TipTap figures so DOCX can fetch image bytes.
 */
async function resolveInlineAttachmentUrls(html: string): Promise<string> {
  const ids = collectAttachmentIds(html)
  if (ids.length === 0 || typeof DOMParser === "undefined") return html

  const supabase = createClientComponentClient()
  const { data: rows, error } = await supabase
    .from("attachments")
    .select("id, file_path, mime_type")
    .in("id", ids)
  if (error || !Array.isArray(rows) || rows.length === 0) return html

  const urlById = new Map<string, string>()
  await Promise.all(
    rows.map(async (row) => {
      const id = typeof row?.id === "string" ? row.id : ""
      const filePath = typeof row?.file_path === "string" ? row.file_path.trim() : ""
      if (!id || !filePath) return
      const bucket = filePath.includes("/project-files/") || filePath.startsWith("project-files/")
        ? "project-files"
        : "attachments"
      const objectPath = filePath
        .replace(/^\/+/, "")
        .replace(new RegExp(`^(?:object/)?(?:public/)?${bucket}/`), "")
        .replace(new RegExp(`^${bucket}/`), "")
      const { data: signed } = await supabase.storage
        .from(bucket)
        .createSignedUrl(objectPath, 60 * 30)
      if (signed?.signedUrl) urlById.set(id, signed.signedUrl)
    }),
  )
  if (urlById.size === 0) return html

  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html")
  const root = doc.getElementById("root")
  if (!root) return html
  root.querySelectorAll("figure[data-attachment-id]").forEach((figure) => {
    const attachmentId = figure.getAttribute("data-attachment-id")?.trim()
    if (!attachmentId) return
    const url = urlById.get(attachmentId)
    if (!url) return
    let img = figure.querySelector("img")
    if (!img) {
      img = doc.createElement("img")
      figure.insertBefore(img, figure.firstChild)
    }
    img.setAttribute("src", url)
  })
  return root.innerHTML
}

/**
 * Build and download a Word (.docx) file from the artifact's rich HTML,
 * preserving headings, links, lists, and embedded images where fetchable.
 */
export async function exportArtifactAsDocx(args: {
  artifact: Pick<TaskArtifact, "id" | "title" | "content_json" | "content_text">
}): Promise<void> {
  const title = String(args.artifact.title ?? "Artifact").trim() || "Artifact"
  let html = extractPrimaryArtifactHtml(args.artifact.content_json) ?? ""
  if (!html.trim()) {
    const text = String(args.artifact.content_text ?? "").trim()
    if (!text) throw new Error("This artifact has no content to export")
    html = /<[a-z][\s\S]*>/i.test(text)
      ? text
      : `<p>${text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>")}</p>`
  }

  html = await resolveInlineAttachmentUrls(html)

  const children = await htmlToDocxElementsAsync(html, {
    Paragraph,
    TextRun,
    HeadingLevel,
    ExternalHyperlink,
    ImageRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    fetchImageBytes: fetchImageBytesForDocx,
  })

  const hasLeadingTitle = /^(\s|<[^>]+>)*<h1\b/i.test(html)
  const titleParagraph = new Paragraph({
    text: title,
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 240 },
  })

  const doc = new Document({
    styles: {
      default: {
        hyperlink: {
          run: {
            color: "0563C1",
            underline: {
              type: "single",
            },
          },
        },
      },
    },
    numbering: {
      config: buildExportDocxNumberingConfig({ LevelFormat, AlignmentType }),
    },
    sections: [
      {
        properties: {},
        children: hasLeadingTitle ? children : [titleParagraph, ...children],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  triggerBlobDownload(blob, `${safeFilename(title, `artifact-${args.artifact.id}`)}.docx`)
}
