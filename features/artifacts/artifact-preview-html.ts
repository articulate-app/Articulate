import { normalizeComponentOutputToHtml } from "../../app/lib/rich-text-normalization"
import {
  extractArtifactBlocks,
  type ArtifactBlock,
  type TaskArtifact,
} from "../../app/lib/artifacts/artifact-types"
import { extractRawArtifactHtml, isHtmlEmailArtifact } from "./artifact-html-document"

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function tableBlockToHtml(block: ArtifactBlock): string {
  const headers = Array.isArray(block.headers)
    ? block.headers.map((cell) => String(cell ?? ""))
    : []
  const rows = Array.isArray(block.rows) ? block.rows : []
  if (headers.length === 0 && rows.length === 0) return ""
  const colCount = Math.max(headers.length, ...rows.map((row) => (row ?? []).length), 0)
  const thead =
    headers.length > 0
      ? `<thead><tr>${Array.from({ length: colCount }, (_, index) =>
          `<th>${escapeHtml(headers[index] ?? "")}</th>`,
        ).join("")}</tr></thead>`
      : ""
  const tbody = `<tbody>${rows
    .map(
      (row) =>
        `<tr>${Array.from({ length: colCount }, (_, index) =>
          `<td>${escapeHtml(String((row ?? [])[index] ?? ""))}</td>`,
        ).join("")}</tr>`,
    )
    .join("")}</tbody>`
  return `<table class="rte-table">${thead}${tbody}</table>`
}

function blocksToPreviewHtml(blocks: ArtifactBlock[]): string {
  const parts = blocks
    .map((block) => {
      const type = String(block.type ?? "")
      if (type === "heading") {
        const level = Math.min(Math.max(Number(block.level) || 2, 1), 4)
        const text =
          typeof block.text === "string"
            ? block.text
            : typeof block.html === "string"
              ? block.html.replace(/<[^>]+>/g, " ").trim()
              : ""
        return text ? `<h${level}>${escapeHtml(text)}</h${level}>` : ""
      }
      if (typeof block.html === "string" && block.html.trim()) return block.html
      if (type === "table") return tableBlockToHtml(block)
      if (type === "list" && Array.isArray(block.items)) {
        const ordered = block.listStyle === "ordered"
        const tag = ordered ? "ol" : "ul"
        const items = block.items
          .map((item) => {
            const text = typeof item === "string" ? item : item?.text ?? ""
            return `<li>${escapeHtml(text)}</li>`
          })
          .join("")
        return `<${tag}>${items}</${tag}>`
      }
      if (typeof block.text === "string" && block.text.trim()) {
        return block.text
          .split(/\n+/)
          .map((line) => `<p>${escapeHtml(line)}</p>`)
          .join("")
      }
      return ""
    })
    .filter(Boolean)
  return parts.join("")
}

/**
 * Build rich HTML for chat/center live previews: prefer content_json blocks
 * (rich_text html + table blocks), then sanitize markdown/HTML content_text.
 * HTML email documents return raw HTML (caller should iframe, not TipTap).
 */
export function artifactContentToPreviewHtml(
  artifact: Pick<TaskArtifact, "content_json" | "content_text" | "title" | "metadata" | "artifact_type" | "artifact_role">,
): string {
  if (isHtmlEmailArtifact(artifact)) {
    return extractRawArtifactHtml(artifact) || "<p></p>"
  }
  const blocks = extractArtifactBlocks(artifact.content_json)
  if (blocks.length > 0) {
    const fromBlocks = blocksToPreviewHtml(blocks).trim()
    if (fromBlocks) {
      return normalizeComponentOutputToHtml(fromBlocks, null) || fromBlocks
    }
  }
  return (
    normalizeComponentOutputToHtml(artifact.content_text ?? "", artifact.title) || "<p></p>"
  )
}

export function artifactPreviewIsHtmlEmail(
  artifact: Pick<TaskArtifact, "content_json" | "content_text" | "title" | "metadata" | "artifact_type" | "artifact_role">,
): boolean {
  return isHtmlEmailArtifact(artifact)
}
