import { normalizeMixedRichText } from "../../../app/lib/rich-text-normalization"
import {
  isComponentOutputStreamingPhase,
  renderComponentOutputPreviewHtml,
  type ComponentOutputPreviewPhase,
} from "./component-output-preview-render"

export type DiffLineType = "unchanged" | "added" | "removed"

export type DiffLine = {
  type: DiffLineType
  text: string
}

function stripHtmlToPlainText(value: string): string {
  if (!value.trim()) return ""
  if (typeof window === "undefined") {
    return value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\r\n/g, "\n")
      .trim()
  }
  const parser = new DOMParser()
  const doc = parser.parseFromString(value, "text/html")
  return (doc.body.textContent ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .trim()
}

export function normalizeDiffPlainText(value: string | null | undefined): string {
  return stripHtmlToPlainText(value ?? "").replace(/\s+\n/g, "\n").trim()
}

function splitDiffLines(value: string): string[] {
  const plain = normalizeDiffPlainText(value)
  if (!plain) return []
  if (plain.includes("\n")) {
    return plain.split("\n").map((line) => line.trim()).filter(Boolean)
  }
  const sentences = plain.split(/(?<=[.!?])\s+/).map((line) => line.trim()).filter(Boolean)
  return sentences.length > 1 ? sentences : [plain]
}

function lcsTable(beforeLines: string[], afterLines: string[]): number[][] {
  const rows = beforeLines.length + 1
  const cols = afterLines.length + 1
  const table = Array.from({ length: rows }, () => Array<number>(cols).fill(0))
  for (let i = beforeLines.length - 1; i >= 0; i -= 1) {
    for (let j = afterLines.length - 1; j >= 0; j -= 1) {
      if (beforeLines[i] === afterLines[j]) {
        table[i][j] = table[i + 1][j + 1] + 1
      } else {
        table[i][j] = Math.max(table[i + 1][j], table[i][j + 1])
      }
    }
  }
  return table
}

export function computeLineDiff(beforeText: string, afterText: string): DiffLine[] {
  const beforeLines = splitDiffLines(normalizeDiffPlainText(beforeText))
  const afterLines = splitDiffLines(normalizeDiffPlainText(afterText))
  const table = lcsTable(beforeLines, afterLines)
  const out: DiffLine[] = []
  let i = 0
  let j = 0

  while (i < beforeLines.length && j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      out.push({ type: "unchanged", text: beforeLines[i] })
      i += 1
      j += 1
      continue
    }
    if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ type: "removed", text: beforeLines[i] })
      i += 1
    } else {
      out.push({ type: "added", text: afterLines[j] })
      j += 1
    }
  }

  while (i < beforeLines.length) {
    out.push({ type: "removed", text: beforeLines[i] })
    i += 1
  }
  while (j < afterLines.length) {
    out.push({ type: "added", text: afterLines[j] })
    j += 1
  }

  return out
}

export function buildComponentPreviewDiff(args: {
  operation: "append" | "replace" | null
  beforeText: string
  afterText: string
}): DiffLine[] {
  return computeLineDiff(args.beforeText, args.afterText)
}

export function computeDiffCharStats(beforeText: string, afterText: string): {
  added: number
  removed: number
} {
  const lines = computeLineDiff(beforeText, afterText)
  let added = 0
  let removed = 0
  for (const line of lines) {
    if (line.type === "added") added += line.text.length
    if (line.type === "removed") removed += line.text.length
  }
  return { added, removed }
}

export function formatDiffCharStatsLabel(stats: { added: number; removed: number }): string {
  return `+${stats.added} chars · -${stats.removed} chars`
}

export function buildDefaultPreviewContentHtml(args: {
  operation: "append" | "replace" | null
  baseContentText: string
  contentText: string
  displayHtml?: string | null
  phase?: ComponentOutputPreviewPhase
  contentJson?: Array<{ type: string; text?: string }> | null
  componentTitle?: string | null
}): { html: string; isRemovedState: boolean } {
  const before = normalizeDiffPlainText(args.baseContentText)
  const after = buildMergedPreviewAfterText({
    operation: args.operation,
    beforeText: args.baseContentText,
    contentText: args.contentText,
    displayHtml: args.displayHtml,
  })
  const delta = normalizeDiffPlainText(args.contentText)

  if (before.length > 0 && after.length === 0) {
    return { html: "", isRemovedState: true }
  }

  if (isComponentOutputStreamingPhase(args.phase)) {
    const streamingText = args.operation === "append" ? delta : after || delta
    const html = renderComponentOutputPreviewHtml({
      phase: args.phase,
      operation: args.operation,
      baseContentText: args.baseContentText,
      contentText: streamingText,
    })
    return { html, isRemovedState: false }
  }

  if (args.operation === "append") {
    const html = renderComponentOutputPreviewHtml({
      phase: args.phase ?? "completed",
      operation: args.operation,
      baseContentText: args.baseContentText,
      contentText: delta,
      contentJson: args.contentJson,
      componentTitle: args.componentTitle,
    })
    return { html, isRemovedState: false }
  }

  if (before.length > after.length && after.length <= before.length * 0.5) {
    const html = renderComponentOutputPreviewHtml({
      phase: args.phase ?? "completed",
      operation: args.operation,
      baseContentText: args.baseContentText,
      contentText: after || args.contentText,
      contentJson: args.contentJson,
      componentTitle: args.componentTitle,
    }) || normalizeMixedRichText(args.displayHtml || args.contentText || "") || ""
    return { html, isRemovedState: after.length === 0 }
  }

  const html =
    renderComponentOutputPreviewHtml({
      phase: args.phase ?? "completed",
      operation: args.operation,
      baseContentText: args.baseContentText,
      contentText: args.contentText,
      contentJson: args.contentJson,
      componentTitle: args.componentTitle,
    })
    || normalizeMixedRichText(args.displayHtml || args.contentText || "")
    || (after ? `<p>${after}</p>` : "")
  return { html, isRemovedState: false }
}

export function buildMergedPreviewAfterText(args: {
  operation: "append" | "replace" | null
  beforeText: string
  contentText: string
  displayHtml?: string | null
}): string {
  const before = normalizeDiffPlainText(args.beforeText)
  const delta = normalizeDiffPlainText(args.contentText)
  if (args.operation === "append") {
    return [before, delta].filter(Boolean).join("\n\n")
  }
  return normalizeDiffPlainText(args.displayHtml || args.contentText || "")
}

export function hasRenderableDiff(lines: DiffLine[]): boolean {
  return lines.some((line) => line.type === "added" || line.type === "removed")
}
