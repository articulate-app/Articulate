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
  // Prefer word-level spans so a small edit inside a paragraph doesn't count the whole line.
  const rows = expandDiffLinesWithWordSpans(lines)
  let added = 0
  let removed = 0
  for (const row of rows) {
    if (row.kind === "words") {
      for (const token of row.tokens) {
        if (token.type === "added") added += token.text.length
        if (token.type === "removed") removed += token.text.length
      }
      continue
    }
    if (row.line.type === "added") added += row.line.text.length
    if (row.line.type === "removed") removed += row.line.text.length
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

export type DiffToken = {
  type: DiffLineType
  text: string
}

function splitDiffWords(value: string): string[] {
  const text = String(value ?? "")
  if (!text) return []
  return text.match(/\s+|[^\s]+/g) ?? [text]
}

/** Word-level LCS diff for highlighting only the changed spans inside a line. */
export function computeWordDiff(beforeText: string, afterText: string): DiffToken[] {
  const beforeWords = splitDiffWords(beforeText)
  const afterWords = splitDiffWords(afterText)
  if (beforeWords.length === 0 && afterWords.length === 0) return []
  if (beforeWords.join("") === afterWords.join("")) {
    return beforeWords.length > 0
      ? [{ type: "unchanged", text: beforeText }]
      : []
  }
  const table = lcsTable(beforeWords, afterWords)
  const out: DiffToken[] = []
  let i = 0
  let j = 0
  while (i < beforeWords.length && j < afterWords.length) {
    if (beforeWords[i] === afterWords[j]) {
      out.push({ type: "unchanged", text: beforeWords[i] })
      i += 1
      j += 1
      continue
    }
    if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ type: "removed", text: beforeWords[i] })
      i += 1
    } else {
      out.push({ type: "added", text: afterWords[j] })
      j += 1
    }
  }
  while (i < beforeWords.length) {
    out.push({ type: "removed", text: beforeWords[i] })
    i += 1
  }
  while (j < afterWords.length) {
    out.push({ type: "added", text: afterWords[j] })
    j += 1
  }
  return out
}

/**
 * Collapse adjacent remove+add line pairs into word-diff rows for richer rendering.
 * Unrelated consecutive changes stay as separate full-line tokens.
 */
export function expandDiffLinesWithWordSpans(lines: DiffLine[]): Array<
  | { kind: "line"; line: DiffLine }
  | { kind: "words"; tokens: DiffToken[] }
> {
  const out: Array<
    | { kind: "line"; line: DiffLine }
    | { kind: "words"; tokens: DiffToken[] }
  > = []
  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i]
    const next = lines[i + 1]
    if (current.type === "removed" && next?.type === "added") {
      const tokens = computeWordDiff(current.text, next.text)
      const hasShared = tokens.some((token) => token.type === "unchanged")
      if (hasShared) {
        out.push({ kind: "words", tokens })
        i += 1
        continue
      }
    }
    out.push({ kind: "line", line: current })
  }
  return out
}

export type DiffHunk = {
  lines: DiffLine[]
  beforeText: string
  afterText: string
  addedChars: number
  removedChars: number
}

/**
 * Split a line diff into contiguous change regions.
 * Unchanged runs longer than `maxUnchangedGap` separate hunks.
 */
export function splitDiffIntoHunks(
  lines: DiffLine[],
  options?: { maxUnchangedGap?: number },
): DiffHunk[] {
  if (!hasRenderableDiff(lines)) return []
  const maxGap = Math.max(0, options?.maxUnchangedGap ?? 2)

  type Range = { start: number; end: number }
  const changeIndexes: number[] = []
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].type !== "unchanged") changeIndexes.push(i)
  }
  if (changeIndexes.length === 0) return []

  const clusters: Range[] = []
  let clusterStart = changeIndexes[0]
  let prevChange = changeIndexes[0]
  for (let i = 1; i < changeIndexes.length; i += 1) {
    const idx = changeIndexes[i]
    const unchangedBetween = idx - prevChange - 1
    if (unchangedBetween > maxGap) {
      clusters.push({ start: clusterStart, end: prevChange + 1 })
      clusterStart = idx
    }
    prevChange = idx
  }
  clusters.push({ start: clusterStart, end: prevChange + 1 })

  return clusters.map((cluster) => {
    const contextBefore = Math.max(0, cluster.start - 1)
    const contextAfter = Math.min(lines.length, cluster.end + 1)
    const hunkLines = lines.slice(contextBefore, contextAfter)
    const beforeParts: string[] = []
    const afterParts: string[] = []
    for (const line of hunkLines) {
      if (line.type === "unchanged") {
        beforeParts.push(line.text)
        afterParts.push(line.text)
      } else if (line.type === "removed") {
        beforeParts.push(line.text)
      } else {
        afterParts.push(line.text)
      }
    }
    const beforeText = beforeParts.join("\n").trim()
    const afterText = afterParts.join("\n").trim()
    const stats = computeDiffCharStats(beforeText, afterText)
    return {
      lines: hunkLines,
      beforeText,
      afterText,
      addedChars: stats.added,
      removedChars: stats.removed,
    }
  })
}
