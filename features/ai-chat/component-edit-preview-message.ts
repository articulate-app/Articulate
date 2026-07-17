import type { AiMessage } from "./types"
import {
  parseComponentEditPreviewsFromMessage,
  pickLatestRenderableComponentEditPreviewsByGroup,
  type PersistedComponentEditPreview,
} from "./component-edit-previews-from-message"
import { normalizeMixedRichText } from "../../app/lib/rich-text-normalization"
import {
  resolveComponentEditStreamPreviewView,
  type ComponentEditStreamEntry,
  type ComponentEditStreamSnapshot,
} from "../../app/store/component-edit-stream"
import {
  buildDefaultPreviewContentHtml,
  buildMergedPreviewAfterText,
  normalizeDiffPlainText,
} from "../tasks/utils/component-content-diff"

export type ComponentEditPreviewContentDescriptor = {
  componentTitle: string
  operation: "append" | "replace" | null
  baseContentText: string
  contentText: string
  displayHtml: string
  afterText: string
  defaultContentHtml: string
  isRemovedState: boolean
}

export type AssistantMessagePreviewLayout = {
  introHtml: string
  outroHtml: string
  copyableText: string
  hasVisibleText: boolean
}

const MIN_DUPLICATE_MATCH_CHARS = 12
const MIN_EXACT_DUPLICATE_MATCH_CHARS = 8
const HIGH_SIMILARITY_RATIO = 0.85

function stripHtmlToPlainText(value: string): string {
  if (!value.trim()) return ""
  if (typeof window === "undefined") {
    return value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  }
  const parser = new DOMParser()
  const doc = parser.parseFromString(value, "text/html")
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim()
}

export function normalizeForPreviewMatch(value: string): string {
  return normalizeDiffPlainText(value).replace(/\s+/g, " ").trim().toLowerCase()
}

export function splitAssistantContentIntoBlocks(html: string): string[] {
  const normalized = normalizeMixedRichText(html) || html
  if (!normalized.trim()) return []

  const paragraphTags = normalized.match(/<p[^>]*>[\s\S]*?<\/p>/gi)
  if (paragraphTags && paragraphTags.length > 0) {
    return paragraphTags.map((paragraph) => paragraph.trim()).filter(Boolean)
  }

  const withBreaks = normalized
    .replace(/<\/div>\s*<div[^>]*>/gi, "</div>\n\n<div>")
    .replace(/<br\s*\/?>/gi, "\n")
  const chunks = withBreaks
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  if (chunks.length > 1) {
    return chunks.map((chunk) => (chunk.startsWith("<") ? chunk : `<p>${chunk}</p>`))
  }

  const plain = stripHtmlToPlainText(normalized)
  if (plain.includes("\n\n")) {
    return plain
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => `<p>${part}</p>`)
  }

  return [normalized]
}

function joinHtmlBlocks(blocks: string[]): string {
  return blocks.filter(Boolean).join("")
}

function buildDescriptorFromParts(args: {
  componentTitle: string
  operation: "append" | "replace" | null
  baseContentText: string
  contentText: string
  displayHtml: string
}): ComponentEditPreviewContentDescriptor {
  const afterText = buildMergedPreviewAfterText({
    operation: args.operation,
    beforeText: args.baseContentText,
    contentText: args.contentText,
    displayHtml: args.displayHtml,
  })
  const defaultPreview = buildDefaultPreviewContentHtml({
    operation: args.operation,
    baseContentText: args.baseContentText,
    contentText: args.contentText,
    displayHtml: args.displayHtml,
  })
  return {
    componentTitle: args.componentTitle || "Component",
    operation: args.operation,
    baseContentText: args.baseContentText,
    contentText: args.contentText,
    displayHtml: args.displayHtml,
    afterText,
    defaultContentHtml: defaultPreview.html,
    isRemovedState: defaultPreview.isRemovedState,
  }
}

function descriptorFromPersisted(preview: PersistedComponentEditPreview): ComponentEditPreviewContentDescriptor {
  let displayHtml = ""
  if (preview.content_json?.length) {
    const paragraphText = preview.content_json
      .filter((block) => block.type === "paragraph" || block.type === "text")
      .map((block) => (typeof block.text === "string" ? block.text : ""))
      .join("\n")
      .trim()
    if (paragraphText) displayHtml = normalizeMixedRichText(paragraphText) || paragraphText
  }
  if (!displayHtml && preview.content_text.trim()) {
    displayHtml = normalizeMixedRichText(preview.content_text) || preview.content_text
  }
  return buildDescriptorFromParts({
    componentTitle: preview.component_title,
    operation: preview.operation,
    baseContentText: preview.base_content_text ?? "",
    contentText: preview.content_text,
    displayHtml,
  })
}

function descriptorFromStreamView(
  view: ComponentEditStreamEntry | ComponentEditStreamSnapshot,
): ComponentEditPreviewContentDescriptor {
  return buildDescriptorFromParts({
    componentTitle: view.componentTitle,
    operation: view.operation,
    baseContentText: view.baseContentText,
    contentText: view.contentText,
    displayHtml: view.displayHtml,
  })
}

export function resolvePreviewContentDescriptors(args: {
  message: Pick<AiMessage, "role" | "content_json">
  messageId: string
  editPreviewKeys: string[]
  editStreamEntries: Record<string, ComponentEditStreamEntry>
}): ComponentEditPreviewContentDescriptor[] {
  if (args.message.role !== "assistant") return []

  const persisted = pickLatestRenderableComponentEditPreviewsByGroup(
    parseComponentEditPreviewsFromMessage(args.message.content_json),
    args.messageId,
  )
  if (persisted.length > 0) {
    return persisted.map(descriptorFromPersisted)
  }

  const out: ComponentEditPreviewContentDescriptor[] = []
  for (const key of args.editPreviewKeys) {
    const stream = args.editStreamEntries[key]
    const view = resolveComponentEditStreamPreviewView(stream, args.messageId)
    if (view) out.push(descriptorFromStreamView(view))
  }
  return out
}

/** @deprecated Use resolvePreviewContentDescriptors */
export function resolvePreviewContentDescriptor(args: {
  message: Pick<AiMessage, "role" | "content_json">
  messageId: string
  editPreviewKey: string | null
  editStreamEntries: Record<string, ComponentEditStreamEntry>
}): ComponentEditPreviewContentDescriptor | null {
  const keys = args.editPreviewKey ? [args.editPreviewKey] : []
  return resolvePreviewContentDescriptors({
    message: args.message,
    messageId: args.messageId,
    editPreviewKeys: keys,
    editStreamEntries: args.editStreamEntries,
  })[0] ?? null
}

function buildDuplicateMatchCandidatesFromPreviews(
  previews: ComponentEditPreviewContentDescriptor[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const preview of previews) {
    for (const candidate of buildDuplicateMatchCandidates(preview)) {
      if (seen.has(candidate)) continue
      seen.add(candidate)
      out.push(candidate)
    }
  }
  return out
}

/** Preview-card content only — not full merged before/after text. */
export function buildDuplicateMatchCandidates(preview: ComponentEditPreviewContentDescriptor): string[] {
  const candidates = [
    preview.contentText,
    normalizeDiffPlainText(preview.displayHtml),
    normalizeDiffPlainText(preview.defaultContentHtml),
  ]
  const unique: string[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const normalized = normalizeForPreviewMatch(candidate)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    unique.push(normalized)
  }
  return unique
}

/**
 * A block is duplicate only when it substantially equals preview content.
 * Blocks that merely contain preview text alongside narration are preserved.
 */
export function blockMatchesPreviewDuplicate(blockHtml: string, candidates: string[]): boolean {
  const blockPlain = normalizeForPreviewMatch(stripHtmlToPlainText(blockHtml))
  if (!blockPlain) return false

  return candidates.some((candidate) => {
    if (!candidate) return false
    if (blockPlain === candidate) return blockPlain.length >= MIN_EXACT_DUPLICATE_MATCH_CHARS

    if (blockPlain.length < MIN_DUPLICATE_MATCH_CHARS || candidate.length < MIN_DUPLICATE_MATCH_CHARS) {
      return false
    }

    const shorter = blockPlain.length <= candidate.length ? blockPlain : candidate
    const longer = blockPlain.length > candidate.length ? blockPlain : candidate
    if (!longer.includes(shorter)) return false
    return shorter.length / longer.length >= HIGH_SIMILARITY_RATIO
  })
}

export function splitAssistantMessageAroundPreviewBlocks(args: {
  blocks: string[]
  duplicateBlockIndexes: number[]
}): { introHtml: string; outroHtml: string } {
  const duplicateSet = new Set(args.duplicateBlockIndexes)
  const introBlocks: string[] = []
  const outroBlocks: string[] = []
  let seenDuplicate = false

  for (let index = 0; index < args.blocks.length; index += 1) {
    const block = args.blocks[index]
    if (duplicateSet.has(index)) {
      seenDuplicate = true
      continue
    }
    if (!seenDuplicate) introBlocks.push(block)
    else outroBlocks.push(block)
  }

  return {
    introHtml: joinHtmlBlocks(introBlocks),
    outroHtml: joinHtmlBlocks(outroBlocks),
  }
}

export function buildAssistantMessagePreviewLayout(args: {
  messageContent: string | null | undefined
  previews: ComponentEditPreviewContentDescriptor[]
}): AssistantMessagePreviewLayout {
  const rawContent = (args.messageContent ?? "").trim()
  if (!rawContent || args.previews.length === 0) {
    const plain = stripHtmlToPlainText(normalizeMixedRichText(rawContent) || rawContent)
    return {
      introHtml: rawContent,
      outroHtml: "",
      copyableText: plain,
      hasVisibleText: plain.length > 0,
    }
  }

  const candidates = buildDuplicateMatchCandidatesFromPreviews(args.previews)
  const blocks = splitAssistantContentIntoBlocks(rawContent)
  const duplicateBlockIndexes = blocks
    .map((block, index) => (blockMatchesPreviewDuplicate(block, candidates) ? index : -1))
    .filter((index) => index >= 0)

  if (duplicateBlockIndexes.length === 0) {
    const messagePlain = stripHtmlToPlainText(normalizeMixedRichText(rawContent) || rawContent)
    return {
      introHtml: rawContent,
      outroHtml: "",
      copyableText: messagePlain,
      hasVisibleText: messagePlain.length > 0,
    }
  }

  const { introHtml, outroHtml } = splitAssistantMessageAroundPreviewBlocks({
    blocks,
    duplicateBlockIndexes,
  })
  const copyableText = [stripHtmlToPlainText(introHtml), stripHtmlToPlainText(outroHtml)]
    .filter(Boolean)
    .join("\n\n")
    .trim()

  return {
    introHtml,
    outroHtml,
    copyableText,
    hasVisibleText: copyableText.length > 0,
  }
}

export function getAssistantCopyableText(
  msg: Pick<AiMessage, "content" | "content_json" | "role">,
  layout: AssistantMessagePreviewLayout,
): string {
  if (msg.role !== "assistant") return ""
  if (layout.copyableText.trim()) return layout.copyableText.trim()
  const raw = (msg.content ?? "").trim()
  if (!raw) return ""
  return stripHtmlToPlainText(normalizeMixedRichText(raw) || raw).trim()
}

function buildPreviewClipboardText(previews: ComponentEditPreviewContentDescriptor[]): string {
  const sections = previews
    .map((preview) => {
      const body =
        stripHtmlToPlainText(preview.defaultContentHtml)
        || normalizeDiffPlainText(preview.contentText)
        || normalizeDiffPlainText(preview.afterText)
      const trimmedBody = body.trim()
      if (!trimmedBody) return ""
      const title = preview.componentTitle.trim()
      return title ? `${title}\n${trimmedBody}` : trimmedBody
    })
    .filter(Boolean)
  return sections.join("\n\n").trim()
}

export function buildAssistantClipboardText(args: {
  msg: Pick<AiMessage, "content" | "content_json" | "role">
  layout: AssistantMessagePreviewLayout
  previews: ComponentEditPreviewContentDescriptor[]
}): string {
  const responseText = getAssistantCopyableText(args.msg, args.layout)
  const previewText = buildPreviewClipboardText(args.previews)
  if (!previewText) return responseText
  if (!responseText) return `Preview:\n${previewText}`
  return `AI response:\n${responseText}\n\nPreview:\n${previewText}`
}
