export type WorkspaceOutputCreateScope = {
  taskId?: number | null
  projectId?: number | null
  aiThreadId?: string | null
}

/** Normalize a pasted http(s) URL. Adds https:// when the scheme is missing. */
export function normalizeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  try {
    const url = new URL(withProtocol)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    if (!url.hostname) return null
    return url.toString()
  } catch {
    return null
  }
}

export function titleFromHttpUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || url
  } catch {
    return url
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function toPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value)
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed)
  }
  return null
}

function toUuid(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return UUID_RE.test(trimmed) ? trimmed : null
}

export function hasWorkspaceOutputCreateScope(
  scope: WorkspaceOutputCreateScope | null | undefined,
): boolean {
  if (!scope) return false
  return (
    toPositiveInt(scope.taskId) != null ||
    toPositiveInt(scope.projectId) != null ||
    toUuid(scope.aiThreadId) != null
  )
}

export function readWorkspaceOutputCreateScopeFromSearch(
  searchParams: URLSearchParams,
): WorkspaceOutputCreateScope {
  return {
    aiThreadId: toUuid(searchParams.get("aiThreadId")),
    taskId: toPositiveInt(
      searchParams.get("taskId") ?? searchParams.get("selectedTaskId"),
    ),
    projectId: toPositiveInt(searchParams.get("projectId")),
  }
}

export function selectedArtifactIdFromSearch(
  searchParams: URLSearchParams,
): string | null {
  return (
    toUuid(searchParams.get("centerArtifactId")) ??
    toUuid(searchParams.get("leftArtifactId")) ??
    toUuid(searchParams.get("rightArtifactId"))
  )
}

export function scopeFromArtifactSnapshot(snapshot: {
  task_id?: number | null
  project_id?: number | null
  ai_thread_id?: string | null
}): WorkspaceOutputCreateScope {
  return {
    taskId: toPositiveInt(snapshot.task_id),
    projectId: toPositiveInt(snapshot.project_id),
    aiThreadId: toUuid(snapshot.ai_thread_id),
  }
}
