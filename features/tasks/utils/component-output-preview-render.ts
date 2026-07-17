import { normalizeComponentOutputToHtml } from "../../../app/lib/rich-text-normalization"

export type ComponentOutputPreviewPhase =
  | "started"
  | "delta"
  | "completed"
  | "saved"
  | "failed"
  | "restored"
  | null
  | undefined

export type ComponentOutputPreviewBlock = {
  type: string
  text?: string
}

export const COMPONENT_OUTPUT_STREAMING_PREVIEW_CLASS = "component-output-streaming-preview"

export function isComponentOutputStreamingPhase(phase: ComponentOutputPreviewPhase): boolean {
  return phase === "started" || phase === "delta"
}

export function isStreamingComponentOutputPreviewHtml(html: string): boolean {
  return (html ?? "").includes(COMPONENT_OUTPUT_STREAMING_PREVIEW_CLASS)
}

/** Stable streaming preview: plain text with preserved line breaks — no Markdown/HTML parsing. */
export function renderStreamingComponentOutputPreview(contentText: string): string {
  const raw = contentText ?? ""
  if (!raw.trim()) return ""
  const escaped = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  return `<div class="${COMPONENT_OUTPUT_STREAMING_PREVIEW_CLASS}">${escaped}</div>`
}

export function buildStreamingPreviewBlocks(contentText: string): Array<{ type: "paragraph"; text: string }> {
  const html = renderStreamingComponentOutputPreview(contentText)
  if (!html) return []
  return [{ type: "paragraph", text: html }]
}

export function renderFinalComponentOutputFromBlocks(
  blocks: ComponentOutputPreviewBlock[],
  componentTitle?: string | null,
): string {
  const paragraphText = blocks
    .filter((block) => block.type === "paragraph" || block.type === "text")
    .map((block) => (typeof block.text === "string" ? block.text : ""))
    .join("\n")
    .trim()
  if (!paragraphText) return "<p></p>"
  if (isStreamingComponentOutputPreviewHtml(paragraphText)) {
    return paragraphText
  }
  return normalizeComponentOutputToHtml(paragraphText, componentTitle) || "<p></p>"
}

function mergedPlainTextForPreview(args: {
  operation: "append" | "replace" | null
  baseContentText: string
  contentText: string
}): string {
  if (args.operation === "append") {
    return [args.baseContentText.trim(), args.contentText.trim()].filter(Boolean).join("\n\n")
  }
  return args.contentText.trim()
}

function streamingPlainTextForPreview(args: {
  operation: "append" | "replace" | null
  baseContentText: string
  contentText: string
}): string {
  if (args.operation === "append") {
    return args.contentText.trim()
  }
  return mergedPlainTextForPreview(args)
}

/** Single entry point for component output preview HTML (chat + content tab). */
export function renderComponentOutputPreviewHtml(args: {
  phase: ComponentOutputPreviewPhase
  operation?: "append" | "replace" | null
  baseContentText?: string
  contentText?: string
  contentJson?: ComponentOutputPreviewBlock[] | null
  componentTitle?: string | null
}): string {
  const operation = args.operation ?? null
  const baseContentText = args.baseContentText ?? ""
  const contentText = args.contentText ?? ""

  if (isComponentOutputStreamingPhase(args.phase)) {
    return renderStreamingComponentOutputPreview(
      streamingPlainTextForPreview({ operation, baseContentText, contentText }),
    )
  }

  if (args.contentJson?.length) {
    return renderFinalComponentOutputFromBlocks(args.contentJson, args.componentTitle)
  }

  const merged = mergedPlainTextForPreview({ operation, baseContentText, contentText })
  if (!merged) return ""
  return normalizeComponentOutputToHtml(merged, args.componentTitle) || merged
}
