/** URL helpers for the canonical artifact center-pane selection. */

export const CENTER_ARTIFACT_ID_PARAM = "centerArtifactId"
export const ARTIFACT_VERSION_PARAM = "version"
/** When set, ArtifactPane opens the version history panel. */
export const ARTIFACT_HISTORY_PARAM = "artifactHistory"

type ReadableParams = { get: (key: string) => string | null }

function nonEmpty(value: string | null): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

export function getCenterArtifactIdFromParams(params: ReadableParams): string | null {
  return nonEmpty(params.get(CENTER_ARTIFACT_ID_PARAM))
}

export function getArtifactVersionFromParams(params: ReadableParams): number | null {
  const raw = nonEmpty(params.get(ARTIFACT_VERSION_PARAM))
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/** True when the URL pins an older snapshot — that view is read-only. */
export function isHistoricalArtifactVersion(
  selectedVersion: number | null | undefined,
  liveCurrentVersion: number | null | undefined,
): boolean {
  if (selectedVersion == null || selectedVersion <= 0) return false
  if (liveCurrentVersion == null || liveCurrentVersion <= 0) return selectedVersion > 0
  return selectedVersion !== liveCurrentVersion
}

export function clearArtifactCenterSelectionParams(next: URLSearchParams) {
  next.delete(CENTER_ARTIFACT_ID_PARAM)
  next.delete(ARTIFACT_VERSION_PARAM)
  next.delete(ARTIFACT_HISTORY_PARAM)
}

export function applyArtifactCenterSelectionParams(
  next: URLSearchParams,
  args: { artifactId: string; version?: number | null; openHistory?: boolean },
) {
  next.set(CENTER_ARTIFACT_ID_PARAM, args.artifactId)
  if (args.version != null && Number.isInteger(args.version) && args.version > 0) {
    next.set(ARTIFACT_VERSION_PARAM, String(args.version))
  } else {
    next.delete(ARTIFACT_VERSION_PARAM)
  }
  if (args.openHistory) next.set(ARTIFACT_HISTORY_PARAM, "1")
  else next.delete(ARTIFACT_HISTORY_PARAM)
}

export function getArtifactHistoryOpenFromParams(params: ReadableParams): boolean {
  const raw = nonEmpty(params.get(ARTIFACT_HISTORY_PARAM))
  return raw === "1" || raw === "true"
}

/** Canonical deep-link path for an artifact. */
export function buildArtifactPath(artifactId: string, version?: number | null): string {
  const base = `/artifacts/${encodeURIComponent(artifactId)}`
  if (version != null && Number.isInteger(version) && version > 0) {
    return `${base}?${ARTIFACT_VERSION_PARAM}=${version}`
  }
  return base
}
