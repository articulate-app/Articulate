import type {
  ArtifactBlock,
  ArtifactCommentAnchor,
  TaskArtifact,
} from "./artifact-types"
import { extractArtifactBlocks } from "./artifact-types"

export type ArtifactAnchorReattachResult = {
  attached: boolean
  /** True when the comment is shown on a newer version than the original anchor. */
  versionDrift: boolean
  originalVersion: number
  currentVersion: number
  /** Human-readable reason when the anchor could not be reattached exactly. */
  driftLabel: string | null
  resolved: {
    blockId: string | null
    start: number | null
    end: number | null
    attachmentId: string | null
    x: number | null
    y: number | null
    width: number | null
    height: number | null
    timeStart: number | null
    timeEnd: number | null
    quote: string | null
  }
}

function findBlockById(blocks: ArtifactBlock[], blockId: string | null | undefined): ArtifactBlock | null {
  const id = blockId?.trim()
  if (!id) return null
  return blocks.find((block) => typeof block.id === "string" && block.id === id) ?? null
}

function findTextRangeByQuoteContext(args: {
  contentText: string
  quote: string | null | undefined
  before: string | null | undefined
  after: string | null | undefined
  preferredStart?: number | null
}): { start: number; end: number } | null {
  const quote = args.quote?.trim()
  if (!quote) return null
  const full = args.contentText
  if (!full) return null

  const preferred = args.preferredStart
  if (
    typeof preferred === "number"
    && preferred >= 0
    && full.slice(preferred, preferred + quote.length) === quote
  ) {
    return { start: preferred, end: preferred + quote.length }
  }

  const before = args.before?.trim() ?? ""
  const after = args.after?.trim() ?? ""
  if (before || after) {
    const needle = `${before}${quote}${after}`
    const idx = full.indexOf(needle)
    if (idx >= 0) {
      const start = idx + before.length
      return { start, end: start + quote.length }
    }
  }

  const idx = full.indexOf(quote)
  if (idx < 0) return null
  return { start: idx, end: idx + quote.length }
}

/**
 * Reattach a comment anchor onto a (possibly newer) artifact version.
 * 1) Prefer stable block id + stored coordinates/time
 * 2) For text, fall back to quote + before/after context
 * 3) Label original version when exact reattach fails
 */
export function reattachArtifactCommentAnchor(args: {
  artifact: Pick<TaskArtifact, "current_version" | "content_text" | "content_json" | "asset_data">
  anchor: ArtifactCommentAnchor
}): ArtifactAnchorReattachResult {
  const currentVersion = args.artifact.current_version
  const originalVersion = args.anchor.artifactVersionNumber
  const versionDrift = currentVersion !== originalVersion
  const blocks = extractArtifactBlocks(args.artifact.content_json)
  const contentText = args.artifact.content_text ?? ""

  const baseResolved = {
    blockId: args.anchor.anchorBlockKey ?? null,
    start: args.anchor.anchorStart ?? null,
    end: args.anchor.anchorEnd ?? null,
    attachmentId: args.anchor.attachmentId ?? null,
    x: args.anchor.anchorX ?? null,
    y: args.anchor.anchorY ?? null,
    width: args.anchor.anchorWidth ?? null,
    height: args.anchor.anchorHeight ?? null,
    timeStart: args.anchor.anchorTimeStart ?? null,
    timeEnd: args.anchor.anchorTimeEnd ?? null,
    quote: args.anchor.anchorQuote ?? null,
  }

  const driftLabel = versionDrift
    ? `Originally on version ${originalVersion}`
    : null

  // Media / coordinate anchors: keep stored coords if attachment still present or coords exist.
  if (
    args.anchor.anchorType === "image_point"
    || args.anchor.anchorType === "image_rect"
    || args.anchor.anchorType === "video_time"
    || args.anchor.anchorType === "video_region"
    || args.anchor.anchorType === "asset"
  ) {
    const hasCoords =
      args.anchor.anchorX != null
      || args.anchor.anchorTimeStart != null
      || args.anchor.attachmentId
    return {
      attached: !!hasCoords,
      versionDrift,
      originalVersion,
      currentVersion,
      driftLabel: hasCoords ? (versionDrift ? driftLabel : null) : `Could not reattach — ${driftLabel ?? "anchor missing"}`,
      resolved: baseResolved,
    }
  }

  // Block anchor via stable id.
  if (args.anchor.anchorType === "block" || args.anchor.anchorBlockKey) {
    const block = findBlockById(blocks, args.anchor.anchorBlockKey)
    if (block) {
      return {
        attached: true,
        versionDrift,
        originalVersion,
        currentVersion,
        driftLabel: versionDrift ? driftLabel : null,
        resolved: { ...baseResolved, blockId: typeof block.id === "string" ? block.id : null },
      }
    }
  }

  // Text: try exact offsets, then quote + context.
  if (args.anchor.anchorType === "text_range" || args.anchor.anchorQuote) {
    const start = args.anchor.anchorStart
    const end = args.anchor.anchorEnd
    const quote = args.anchor.anchorQuote?.trim() ?? ""
    if (
      typeof start === "number"
      && typeof end === "number"
      && start >= 0
      && end > start
      && contentText.slice(start, end) === quote
    ) {
      return {
        attached: true,
        versionDrift,
        originalVersion,
        currentVersion,
        driftLabel: versionDrift ? driftLabel : null,
        resolved: baseResolved,
      }
    }

    const found = findTextRangeByQuoteContext({
      contentText,
      quote: args.anchor.anchorQuote,
      before: args.anchor.anchorContextBefore,
      after: args.anchor.anchorContextAfter,
      preferredStart: args.anchor.anchorStart,
    })
    if (found) {
      return {
        attached: true,
        versionDrift,
        originalVersion,
        currentVersion,
        driftLabel: versionDrift ? driftLabel : null,
        resolved: { ...baseResolved, start: found.start, end: found.end },
      }
    }

    return {
      attached: false,
      versionDrift,
      originalVersion,
      currentVersion,
      driftLabel: `Could not reattach — originally on version ${originalVersion}`,
      resolved: baseResolved,
    }
  }

  // Document-level: always "attached".
  return {
    attached: true,
    versionDrift,
    originalVersion,
    currentVersion,
    driftLabel: versionDrift ? driftLabel : null,
    resolved: baseResolved,
  }
}
