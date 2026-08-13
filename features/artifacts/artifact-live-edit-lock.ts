import type { AiBuildArtifactPreviewEntry } from "../../app/store/ai-build-artifact-preview-store"

/** How long a non-streaming live preview may keep the editor locked. */
export const ARTIFACT_LIVE_LOCK_FRESH_MS = 90_000

/**
 * True only while an AI build is actively generating this artifact.
 * Settled/stale live cards must not block manual edits.
 */
export function isArtifactLiveEditLocked(
  live: Pick<AiBuildArtifactPreviewEntry, "phase" | "streaming" | "updatedAt"> | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!live) return false
  if (live.phase === "saved" || live.phase === "failed") return false
  if (live.streaming) return true
  if (live.phase !== "started" && live.phase !== "media" && live.phase !== "preview") {
    return false
  }
  const updatedMs = Date.parse(live.updatedAt)
  if (!Number.isFinite(updatedMs)) return false
  return nowMs - updatedMs < ARTIFACT_LIVE_LOCK_FRESH_MS
}
