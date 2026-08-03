/** URL helpers for the canonical source center-pane selection. */

export const CENTER_SOURCE_ID_PARAM = "centerSourceId"

type ReadableParams = { get: (key: string) => string | null }

function nonEmpty(value: string | null): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

export function getCenterSourceIdFromParams(params: ReadableParams): string | null {
  return nonEmpty(params.get(CENTER_SOURCE_ID_PARAM))
}

export function clearSourceCenterSelectionParams(next: URLSearchParams) {
  next.delete(CENTER_SOURCE_ID_PARAM)
}

export function applySourceCenterSelectionParams(
  next: URLSearchParams,
  args: { sourceId: string },
) {
  next.set(CENTER_SOURCE_ID_PARAM, args.sourceId)
}

/** Canonical deep-link path for a source. */
export function buildSourcePath(sourceId: string): string {
  return `/sources/${encodeURIComponent(sourceId)}`
}
