import { Marked, type Tokens } from "marked"

import { isAppEntityHref } from "./assistant-app-entity-links"
import { artifactDocumentGlyphHtml } from "./artifact-context-chip-html"

function parseAppEntityKindForChip(
  href: string,
): "task" | "project" | "user" | "artifact" | "ai-build" | "source" | "ai-agent-run" {
  const trimmed = href.trim()
  if (/^app:\/\/ai-build\//i.test(trimmed)) return "ai-build"
  if (/^app:\/\/artifact\//i.test(trimmed)) return "artifact"
  if (/^app:\/\/source\//i.test(trimmed)) return "source"
  if (/^app:\/\/ai-agent-run\//i.test(trimmed)) return "ai-agent-run"
  const m = trimmed.match(/^app:\/\/(task|project|user)\/\d+$/i)
  const t = (m?.[1] || "task").toLowerCase()
  if (t === "project" || t === "user") return t
  return "task"
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
}

function entityBadgeLetter(href: string): string {
  const trimmed = href.trim()
  if (/^app:\/\/artifact\//i.test(trimmed) || /^app:\/\/ai-build\//i.test(trimmed)) return "A"
  if (/^app:\/\/source\//i.test(trimmed)) return "S"
  if (/^app:\/\/ai-agent-run\//i.test(trimmed)) return "R"
  const m = trimmed.match(/^app:\/\/(task|project|user)\//i)
  const t = (m?.[1] || "task").toLowerCase()
  if (t === "project") return "P"
  if (t === "user") return "U"
  return "T"
}

const INLINE_ENTITY_CHIP_CLASS =
  "ai-msg-entity-chip inline-flex max-w-[min(280px,100%)] cursor-pointer select-none items-center gap-1 align-baseline rounded-md border border-gray-200/90 bg-gray-100 px-1.5 py-0.5 text-xs font-medium leading-snug text-gray-800 shadow-sm no-underline transition-colors hover:border-gray-300 hover:bg-gray-200/95 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-white"

/** Match AttachmentFileChip layout for artifact / build cards in assistant messages. */
const ARTIFACT_FILE_CHIP_CLASS =
  "ai-msg-entity-chip ai-msg-artifact-file-chip my-1 inline-flex max-w-[260px] cursor-pointer select-none items-center gap-2.5 align-middle rounded-2xl border border-gray-200 bg-white px-2.5 py-2 text-left text-[13px] font-medium leading-snug text-gray-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] no-underline transition-colors hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-white"

function stripHtmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
}

function renderArtifactFileChipAnchor(href: string, bodyHtml: string, titleAttr: string): string {
  const label = stripHtmlToText(bodyHtml) || "Artifact"
  const safeLabel = escapeAttr(label)
  return (
    `<a href="${escapeAttr(href)}"${titleAttr} data-app-entity="artifact" class="${ARTIFACT_FILE_CHIP_CLASS}">` +
    artifactDocumentGlyphHtml() +
    `<span class="min-w-0 flex-1 py-0.5">` +
    `<span class="block truncate text-[13px] font-medium leading-tight text-gray-900">${safeLabel}</span>` +
    `<span class="mt-0.5 block truncate text-[12px] font-normal leading-tight text-gray-500">Artifact</span>` +
    `</span></a>`
  )
}

/**
 * Markdown instance for assistant chat only (does not touch global `marked`).
 * Renders `app://task|project|user/...` links as inline chip-like anchors.
 */
export const assistantMarked = new Marked()

assistantMarked.use({
  renderer: {
    strong({ tokens }) {
      if (tokens?.length === 1 && tokens[0].type === "link") {
        const lt = tokens[0] as Tokens.Link
        if (isAppEntityHref(lt.href)) {
          return this.link(lt)
        }
      }
      return `<strong>${this.parser.parseInline(tokens)}</strong>`
    },
    em({ tokens }) {
      if (tokens?.length === 1 && tokens[0].type === "link") {
        const lt = tokens[0] as Tokens.Link
        if (isAppEntityHref(lt.href)) {
          return this.link(lt)
        }
      }
      return `<em>${this.parser.parseInline(tokens)}</em>`
    },
    link({ href, title, tokens }) {
      const h = href?.trim() ?? ""
      const body = this.parser.parseInline(tokens)
      if (!isAppEntityHref(h)) {
        const t = title ? ` title="${escapeAttr(title)}"` : ""
        return `<a href="${escapeAttr(h)}"${t}>${body}</a>`
      }

      const tAttr = title ? ` title="${escapeAttr(title)}"` : ""
      const kind = parseAppEntityKindForChip(h)
      if (kind === "artifact" || kind === "ai-build") {
        return renderArtifactFileChipAnchor(h, body, tAttr)
      }

      const letter = entityBadgeLetter(h)
      return (
        `<a href="${escapeAttr(h)}"${tAttr} data-app-entity="${kind}" class="${INLINE_ENTITY_CHIP_CLASS}">` +
        `<span class="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-white text-[9px] font-bold leading-none text-gray-600 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]" aria-hidden="true">${letter}</span>` +
        `<span class="min-w-0 flex-1 truncate">${body}</span></a>`
      )
    },
  },
})

assistantMarked.setOptions({ breaks: true, gfm: true })
