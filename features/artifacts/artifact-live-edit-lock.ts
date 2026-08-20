import type { AiBuildArtifactPreviewEntry } from "../../app/store/ai-build-artifact-preview-store"

/** Kept for callers that still check a live preview clock. Never used to lock editing. */
export const ARTIFACT_LIVE_LOCK_FRESH_MS = 90_000

/**
 * Manual editing of the current document is never locked.
 * Live previews may still stream; they must not make the editor read-only.
 */
export function isArtifactLiveEditLocked(
  _live?: Pick<AiBuildArtifactPreviewEntry, "phase" | "streaming" | "updatedAt"> | null,
  _nowMs: number = Date.now(),
): boolean {
  return false
}
