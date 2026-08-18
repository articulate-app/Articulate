import { normalizeMixedRichText } from "../../app/lib/rich-text-normalization"
import { getAssistantContentBlocks } from "./assistant-content-blocks"
import {
  collapseRedundantAppEntityLinkLines,
  decorateAppEntityAnchorsAsChips,
  htmlContainsRawAppEntityMarkdownLink,
  linkifyBareAppEntityUrls,
  stripListMarkersFromAppEntityOnlyLines,
} from "./assistant-app-entity-links"
import { softenAssistantMarkdownProse } from "./assistant-markdown-prose"
import { assistantMarked } from "./assistant-marked"
import { htmlToPlainTextForReparse, markdownFromRenderableBlocks } from "./text-to-output-blocks"

function hasHtmlMarkup(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

/** Remove leaked `__AI_*__{…}` control payloads if stream parsing ever fails open. */
export function stripLeakedAiStreamMarkers(value: string): string {
  return String(value ?? "")
    .replace(/__AI_[A-Z0-9_]+__\s*\{.*?\}(?=\s*__AI_|\s*$)/gs, "")
    .replace(/__AI_[A-Z0-9_]+__/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Preserve user-entered newlines for display (pre-wrap container). */
export function formatUserMessageForDisplay(content: string | null | undefined): string {
  return String(content ?? "").replace(/\r\n/g, "\n")
}

export function blockTextToMarkdown(text: string | null | undefined): string {
  const raw = String(text ?? "").trim()
  if (!raw) return ""
  if (hasHtmlMarkup(raw)) return htmlToPlainTextForReparse(raw)
  return raw.replace(/\r\n/g, "\n")
}

type MarkdownBlockLike = {
  type: string
  text?: string
  headers?: string[]
  rows?: string[][]
}

/**
 * Convert assistant plain text / markdown / mixed HTML into rich HTML with paragraph spacing.
 * Bare `app://…` URLs become clickable entity chips (same visual language as composer tags).
 */
function prepareAssistantMarkdownForDisplay(
  markdown: string,
  labels: Record<string, string> | null,
): string {
  return linkifyBareAppEntityUrls(
    stripListMarkersFromAppEntityOnlyLines(
      collapseRedundantAppEntityLinkLines(
        softenAssistantMarkdownProse(markdown.replace(/\n{3,}/g, "\n\n")),
      ),
    ),
    labels,
  )
}

export function formatAssistantContentForDisplay(
  content: string | null | undefined,
  options?: { appLinkLabels?: Record<string, string> | null },
): string {
  const raw = stripLeakedAiStreamMarkers(String(content ?? "").replace(/\r\n/g, "\n"))
  if (!raw.trim()) return ""

  const labels = options?.appLinkLabels ?? null

  // Prefer plain-text → assistantMarked when the payload still has raw
  // `[label](app://…)` (including multilabel breaks). This avoids marked/HTML
  // paths leaving the brackets visible.
  const plainSource = hasHtmlMarkup(raw) ? htmlToPlainTextForReparse(raw) : raw
  if (
    plainSource.trim()
    && (/\]\s*\(\s*app:\/\//i.test(plainSource) || /app:\/\/(?:artifact|ai-build)\//i.test(plainSource))
  ) {
    const prepared = prepareAssistantMarkdownForDisplay(plainSource, labels)
    const parsed = String(assistantMarked.parse(prepared))
    const chipped = decorateAppEntityAnchorsAsChips(parsed)
    if (!htmlContainsRawAppEntityMarkdownLink(chipped)) return chipped
  }

  if (hasHtmlMarkup(raw)) {
    const plain = htmlToPlainTextForReparse(raw)
    if (plain.trim()) {
      const linked = prepareAssistantMarkdownForDisplay(plain, labels)
      return decorateAppEntityAnchorsAsChips(normalizeMixedRichText(linked))
    }
    return decorateAppEntityAnchorsAsChips(
      normalizeMixedRichText(prepareAssistantMarkdownForDisplay(raw, labels)),
    )
  }

  // Plain assistant output is Markdown. Render it with the chat-specific marked
  // instance so single newlines are preserved (`breaks: true`) instead of being
  // flattened by the rich-text normalizer.
  const normalized = prepareAssistantMarkdownForDisplay(raw, labels)
  return decorateAppEntityAnchorsAsChips(String(assistantMarked.parse(normalized)))
}

export function markdownFromAssistantBlocks(blocks: MarkdownBlockLike[]): string {
  return markdownFromRenderableBlocks(
    blocks.map((block) => {
      if (block.type === "paragraph" || block.type === "text") {
        return { ...block, text: blockTextToMarkdown(block.text) }
      }
      return block
    }),
  )
}

export function formatAssistantBlocksForDisplay(
  blocks: MarkdownBlockLike[],
  options?: { appLinkLabels?: Record<string, string> | null },
): string {
  const markdown = markdownFromAssistantBlocks(blocks)
  return formatAssistantContentForDisplay(markdown, options)
}

export function extractAssistantMarkdownFromMessage(args: {
  content: string | null | undefined
  contentJson?: unknown | null
}): string {
  const blocks = getAssistantContentBlocks(args.contentJson) ?? []
  const normalizedBlocks = blocks
    .map((item) => (item && typeof item === "object" ? (item as MarkdownBlockLike) : null))
    .filter((item): item is MarkdownBlockLike => item != null)

  if (normalizedBlocks.length > 0) {
    const markdown = markdownFromAssistantBlocks(normalizedBlocks)
    if (markdown.trim()) return markdown
  }

  return String(args.content ?? "").replace(/\r\n/g, "\n")
}

export function buildAssistantContentJsonFromMarkdown(
  markdown: string,
  existingBlocks: MarkdownBlockLike[] = [],
): Array<{ type: string; text?: string }> {
  const attachments = existingBlocks.filter((block) => block.type === "attachment")
  const trimmed = markdown.trim()
  const textBlocks = trimmed ? [{ type: "text", text: trimmed }] : []
  return [...textBlocks, ...attachments]
}

export type AssistantMarkdownRenderSegment = {
  kind: "markdown"
  blocks: MarkdownBlockLike[]
}

export type AssistantTableRenderSegment = {
  kind: "table"
  block: MarkdownBlockLike & { type: "table"; headers: string[]; rows: string[][] }
}

export type AssistantAttachmentRenderSegment = {
  kind: "attachment"
  block: MarkdownBlockLike & { type: "attachment" }
}

export type AssistantRenderSegment =
  | AssistantMarkdownRenderSegment
  | AssistantTableRenderSegment
  | AssistantAttachmentRenderSegment

/** Group consecutive text/paragraph blocks so markdown lists and headings render together. */
export function groupAssistantBlocksForRender(blocks: MarkdownBlockLike[]): AssistantRenderSegment[] {
  const segments: AssistantRenderSegment[] = []
  let markdownBuffer: MarkdownBlockLike[] = []

  const flushMarkdown = () => {
    if (markdownBuffer.length === 0) return
    segments.push({ kind: "markdown", blocks: [...markdownBuffer] })
    markdownBuffer = []
  }

  for (const block of blocks) {
    if (block.type === "text" || block.type === "paragraph") {
      markdownBuffer.push(block)
      continue
    }
    flushMarkdown()
    if (block.type === "table" && Array.isArray(block.headers) && Array.isArray(block.rows)) {
      segments.push({
        kind: "table",
        block: {
          ...block,
          type: "table",
          headers: block.headers.map(String),
          rows: block.rows.map((row) => (Array.isArray(row) ? row.map(String) : [])),
        },
      })
      continue
    }
    if (block.type === "attachment") {
      segments.push({ kind: "attachment", block: { ...block, type: "attachment" } })
    }
  }

  flushMarkdown()
  return segments
}

export const AI_CHAT_USER_MESSAGE_CLASS = "ai-chat-user-message"
export const AI_CHAT_ASSISTANT_MESSAGE_CLASS = "ai-chat-assistant-message"
