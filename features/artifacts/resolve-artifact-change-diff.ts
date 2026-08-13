/**
 * Single source of truth for artifact before/after change sides.
 * All touch points (overview, artifact page, chat previews) must go through here
 * so counters, track-changes HTML, and hunks stay consistent.
 */

import {
  artifactDiffPlainFromContent,
  canonicalArtifactDiffText,
  extractPrimaryArtifactHtml,
} from "../../app/lib/artifact-selection-patch"
import {
  computeDiffCharStats,
} from "../tasks/utils/component-content-diff"
import {
  buildArtifactTrackChangesHtml,
  resolveArtifactDiffHtml,
  splitTopLevelBlocks,
} from "./artifact-rich-diff-html"

export type ArtifactChangeSidesInput = {
  beforeText?: string | null
  beforeContentJson?: unknown
  afterText?: string | null
  afterContentJson?: unknown
  beforeHtml?: string | null
  afterHtml?: string | null
  /**
   * When the live worker omitted before_content_json, freeze the on-screen
   * artifact body as the before baseline (HTML-accurate).
   */
  baselineContentJson?: unknown
  baselineContentText?: string | null
}

export type ArtifactPreviewChangeSource = {
  phase?: string | null
  isBusy: boolean
  /** True while worker heartbeats only carry section_html / snippet. */
  streaming?: boolean
  beforeContentText?: string | null
  beforeContentJson?: unknown
  contentText?: string | null
  contentJson?: unknown
  diffContentText?: string | null
  sectionHtml?: string | null
  sectionBeforeHtml?: string | null
  streamSnippet?: string | null
  /** Fallback after body when the live entry omitted content (task stack artifact row). */
  fallbackAfterText?: string | null
  fallbackAfterContentJson?: unknown
  /** Baseline while generating (usually the on-screen artifact before the edit lands). */
  baselineContentJson?: unknown
  baselineContentText?: string | null
}

/** Progressive HTML from live heartbeats (same fields chat preview cards use). */
export function progressiveLiveAfterHtml(live: {
  streaming?: boolean
  sectionHtml?: string | null
  streamSnippet?: string | null
}): string | null {
  if (!live.streaming) return null
  const html = live.sectionHtml?.trim() || live.streamSnippet?.trim() || ""
  return html || null
}

/**
 * Normalize live/saved artifact preview fields into change-sides inputs.
 * Section HTML is scoped only when both before+after section hints exist —
 * otherwise a section-only after vs full-document before yields false −N removals.
 */
export function resolveArtifactPreviewChangeInput(
  source: ArtifactPreviewChangeSource,
): ArtifactChangeSidesInput | null {
  const hasBefore =
    Boolean(source.beforeContentText?.trim())
    || Boolean(source.beforeContentJson)
    || Boolean(source.baselineContentJson)
    || Boolean(source.baselineContentText?.trim())

  if (source.isBusy) {
    const beforeHtml = source.sectionBeforeHtml?.trim() || null
    const afterHtml =
      source.sectionHtml?.trim()
      || source.streamSnippet?.trim()
      || null
    const useSectionScope = Boolean(beforeHtml) && Boolean(afterHtml)
    const hasFullAfter = Boolean(
      source.contentJson
      || source.contentText?.trim()
      || source.diffContentText?.trim()
      || source.fallbackAfterText?.trim()
      || source.fallbackAfterContentJson,
    )
    // Heartbeats keep baseline contentJson frozen — while streaming, always
    // prefer progressive section_html so pane/stack match the chat preview.
    const useProgressiveAfter =
      !useSectionScope
      && Boolean(afterHtml)
      && (source.streaming === true || !hasFullAfter)
    if (!hasBefore && !useProgressiveAfter && !hasFullAfter) return null
    return {
      beforeText: useSectionScope ? beforeHtml : source.beforeContentText,
      beforeContentJson: useSectionScope ? null : source.beforeContentJson,
      // Prefer full after body when section scope is incomplete — a lone
      // sectionHtml vs full before invents huge −N counters in chat/history.
      afterText: useSectionScope || useProgressiveAfter
        ? afterHtml
        : (
          source.diffContentText
          || source.contentText
          || source.fallbackAfterText
          || afterHtml
        ),
      afterContentJson: useSectionScope || useProgressiveAfter
        ? null
        : (source.contentJson ?? source.fallbackAfterContentJson ?? null),
      beforeHtml: useSectionScope ? beforeHtml : null,
      afterHtml: useSectionScope || useProgressiveAfter ? afterHtml : null,
      baselineContentJson: source.baselineContentJson ?? source.beforeContentJson,
      baselineContentText: source.baselineContentText ?? source.beforeContentText,
    }
  }

  if (!hasBefore) return null

  if (source.phase === "saved" || !source.isBusy) {
    return {
      beforeText: source.beforeContentText,
      beforeContentJson: source.beforeContentJson,
      afterText: source.contentText || source.fallbackAfterText || source.diffContentText,
      afterContentJson: source.contentJson ?? source.fallbackAfterContentJson ?? null,
      beforeHtml: null,
      afterHtml: null,
      baselineContentJson: source.beforeContentJson,
      baselineContentText: source.beforeContentText,
    }
  }

  return null
}

export type ArtifactChangeSides = {
  beforeHtml: string
  afterHtml: string
  beforePlain: string
  afterPlain: string
  stats: { added: number; removed: number }
  hasChanges: boolean
  trackChangesHtml: string
  trackChangesHtmlChangedOnly: string
}

function resolveBeforeHtml(input: ArtifactChangeSidesInput): string {
  const fromLive = resolveArtifactDiffHtml({
    contentText: input.beforeText,
    contentJson: input.beforeContentJson,
    htmlHint: input.beforeHtml ?? null,
  })
  if (fromLive.trim()) return fromLive

  // Prefer frozen baseline JSON/HTML over plain-only before text so we never
  // compare paragraph-wrapped plain ↔ rich block HTML (false full-doc greens).
  const baselineHtml = extractPrimaryArtifactHtml(input.baselineContentJson)
  if (baselineHtml?.trim()) return baselineHtml

  return resolveArtifactDiffHtml({
    contentText: input.baselineContentText ?? input.beforeText,
    contentJson: input.baselineContentJson,
    htmlHint: null,
  })
}

function resolveAfterHtml(input: ArtifactChangeSidesInput): string {
  return resolveArtifactDiffHtml({
    contentText: input.afterText,
    contentJson: input.afterContentJson,
    htmlHint: input.afterHtml ?? null,
  })
}

/** Stats from the same HTML→plain pipeline used for rendering. */
export function computeArtifactChangeStats(beforeHtml: string, afterHtml: string): {
  added: number
  removed: number
} {
  const beforePlain = canonicalArtifactDiffText(beforeHtml)
  const afterPlain = canonicalArtifactDiffText(afterHtml)
  if (!beforePlain && !afterPlain) return { added: 0, removed: 0 }
  if (!beforePlain) return { added: afterPlain.length, removed: 0 }
  if (!afterPlain) return { added: 0, removed: beforePlain.length }
  // Word-level over the full document so small edits (e.g. removing "why") count.
  return computeDiffCharStats(beforePlain, afterPlain)
}

/**
 * Detect plain-dump before vs structured rich after (or a lost baseline), which
 * previously produced false +N / −almost-entire-doc counters after refresh.
 */
export function isSuspiciousFullRewriteStats(args: {
  beforeHtml: string
  afterHtml: string
  beforePlain: string
  afterPlain: string
  stats: { added: number; removed: number }
}): boolean {
  const { beforeHtml, afterHtml, beforePlain, afterPlain, stats } = args
  if (!beforePlain || !afterPlain) return false
  const compactBefore = beforePlain.replace(/\s+/g, " ").trim()
  const compactAfter = afterPlain.replace(/\s+/g, " ").trim()
  const maxLen = Math.max(compactBefore.length, compactAfter.length)
  if (maxLen < 400) return false

  const lengthDelta = Math.abs(compactBefore.length - compactAfter.length) / maxLen
  const removedRatio = stats.removed / Math.max(1, beforePlain.length)
  const addedRatio = stats.added / Math.max(1, afterPlain.length)
  if (removedRatio < 0.75 || addedRatio < 0.75 || lengthDelta > 0.25) return false

  const beforeHasHeading = /<h[1-6]\b/i.test(beforeHtml)
  const afterHasHeading = /<h[1-6]\b/i.test(afterHtml)
  // Classic failure mode: plain before wrapped as a few <p>s vs rich after with H2s.
  if (!beforeHasHeading && afterHasHeading) return true

  // Both structured but LCS still claims nearly everything moved — trust plains.
  return removedRatio > 0.9 && addedRatio > 0.9 && lengthDelta < 0.12
}

export function resolveArtifactChangeSides(
  input: ArtifactChangeSidesInput,
): ArtifactChangeSides {
  const beforeHtml = resolveBeforeHtml(input)
  const afterHtml = resolveAfterHtml(input)
  const beforePlain =
    canonicalArtifactDiffText(beforeHtml)
    || artifactDiffPlainFromContent(input.beforeText, input.beforeContentJson)
    || artifactDiffPlainFromContent(input.baselineContentText, input.baselineContentJson)
  const afterPlain =
    canonicalArtifactDiffText(afterHtml)
    || artifactDiffPlainFromContent(input.afterText, input.afterContentJson)

  let stats = computeArtifactChangeStats(beforeHtml || beforePlain, afterHtml || afterPlain)
  let trackBeforeHtml = beforeHtml
  let trackAfterHtml = afterHtml

  if (
    isSuspiciousFullRewriteStats({
      beforeHtml,
      afterHtml,
      beforePlain,
      afterPlain,
      stats,
    })
  ) {
    // Collapse whitespace — HTML→plain injects newlines between blocks that a
    // plain dump does not, which otherwise looks like a full rewrite.
    const compactBefore = beforePlain.replace(/\s+/g, " ").trim()
    const compactAfter = afterPlain.replace(/\s+/g, " ").trim()
    stats = computeDiffCharStats(compactBefore, compactAfter)
    if (compactBefore === compactAfter) {
      stats = { added: 0, removed: 0 }
      trackBeforeHtml = afterHtml
      trackAfterHtml = afterHtml
    } else if (!/<h[1-6]\b/i.test(beforeHtml) && /<h[1-6]\b/i.test(afterHtml)) {
      // Keep compact plain stats, but never collapse track HTML to identical
      // after/after — that produced +N with an empty changed-only preview.
      // Diff the plain text as simple paragraphs instead of LCS plain↔rich.
      const escape = (value: string) =>
        value
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
      trackBeforeHtml = `<p>${escape(compactBefore)}</p>`
      trackAfterHtml = `<p>${escape(compactAfter)}</p>`
    }
  }

  const hasChanges =
    Boolean(beforePlain || afterPlain)
    && beforePlain !== afterPlain
    && (stats.added > 0 || stats.removed > 0)
  return {
    beforeHtml,
    afterHtml,
    beforePlain,
    afterPlain,
    stats,
    hasChanges,
    trackChangesHtml: buildArtifactTrackChangesHtml(trackBeforeHtml, trackAfterHtml, {
      changedOnly: false,
    }),
    trackChangesHtmlChangedOnly: buildArtifactTrackChangesHtml(trackBeforeHtml, trackAfterHtml, {
      changedOnly: true,
    }),
  }
}

export type ArtifactChangeSegment = {
  /** Pre-built track-changes HTML (already marked). */
  html: string
  addedChars: number
  removedChars: number
}

/**
 * Split a full-document HTML diff into small rich segments for chat preview cards.
 * Prefers real inserts (especially tables) and drops noise-only deletions.
 */
export function splitArtifactChangeSegments(
  beforeHtml: string,
  afterHtml: string,
  options?: { maxChars?: number; maxSegments?: number },
): ArtifactChangeSegment[] {
  const maxSegments = Math.max(1, options?.maxSegments ?? 8)
  const sides = resolveArtifactChangeSides({ beforeHtml, afterHtml })
  if (!sides.hasChanges) return []

  const changedHtml = sides.trackChangesHtmlChangedOnly
  if (!changedHtml.trim() || changedHtml === "<p></p>") {
    return [
      {
        html: sides.trackChangesHtml,
        addedChars: sides.stats.added,
        removedChars: sides.stats.removed,
      },
    ]
  }

  const blocks = splitTopLevelBlocks(changedHtml)
  if (blocks.length === 0) {
    return [
      {
        html: changedHtml,
        addedChars: sides.stats.added,
        removedChars: sides.stats.removed,
      },
    ]
  }

  const afterPlainNormalized = canonicalArtifactDiffText(afterHtml)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()

  const candidates: Array<ArtifactChangeSegment & { score: number }> = []
  for (const block of blocks) {
    const stats = statsFromDiffMarkup(block)
    if (stats.added === 0 && stats.removed === 0) continue

    const plain = canonicalArtifactDiffText(block)
    const plainNorm = plain
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()

    // Pure deletion of text that still exists in the after doc = LCS noise
    // (e.g. SEO Meta Title card that never actually changed).
    if (
      stats.added === 0
      && stats.removed > 0
      && plainNorm
      && afterPlainNormalized.includes(plainNorm)
    ) {
      continue
    }

    const isTable = /<table\b/i.test(block)
    const score =
      (isTable ? 10_000 : 0)
      + stats.added * 4
      + (stats.added > 0 ? 200 : 0)
      - (stats.added === 0 ? stats.removed : 0)

    candidates.push({
      html: block,
      addedChars: stats.added,
      removedChars: stats.removed,
      score,
    })
  }

  if (candidates.length === 0) {
    return [
      {
        html: changedHtml,
        addedChars: sides.stats.added,
        removedChars: sides.stats.removed,
      },
    ]
  }

  // Prefer real inserts (tables first). Re-order selected cards back to document order.
  const selected = [...candidates]
    .sort((a, b) => b.score - a.score || (a.html.length - b.html.length))
    .slice(0, maxSegments)
  const order = new Map(candidates.map((row, index) => [row.html, index]))
  return selected
    .sort((a, b) => (order.get(a.html) ?? 0) - (order.get(b.html) ?? 0))
    .map(({ html, addedChars, removedChars }) => ({ html, addedChars, removedChars }))
}

function statsFromDiffMarkup(html: string): { added: number; removed: number } {
  if (typeof DOMParser === "undefined") {
    const addedMatches = html.match(/class="[^"]*artifact-diff-ins[^"]*"[^>]*>([^<]*)/gi) ?? []
    const removedMatches = html.match(/class="[^"]*artifact-diff-del[^"]*"[^>]*>([^<]*)/gi) ?? []
    const blockIns = /artifact-diff-block-ins/i.test(html)
      ? canonicalArtifactDiffText(html).length
      : 0
    const blockDel = /artifact-diff-block-del/i.test(html)
      ? canonicalArtifactDiffText(html).length
      : 0
    let added = addedMatches.reduce((sum, row) => {
      const text = row.replace(/^[^>]*>/, "")
      return sum + text.length
    }, 0)
    let removed = removedMatches.reduce((sum, row) => {
      const text = row.replace(/^[^>]*>/, "")
      return sum + text.length
    }, 0)
    if (added === 0 && blockIns) added = Math.min(blockIns, 520)
    if (removed === 0 && blockDel) removed = Math.min(blockDel, 520)
    return { added, removed }
  }
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, "text/html")
  const root = doc.getElementById("__root")
  let added = 0
  let removed = 0
  root?.querySelectorAll(".artifact-diff-ins, .artifact-diff-block-ins").forEach((node) => {
    added += (node.textContent ?? "").length
  })
  root?.querySelectorAll(".artifact-diff-del, .artifact-diff-block-del").forEach((node) => {
    removed += (node.textContent ?? "").length
  })
  return { added, removed }
}
