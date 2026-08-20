import type { GlobalSearchDocument } from "./global-search-types"

export type ProjectListScope = "all" | "created" | "shared"

function asPositiveId(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.trunc(n)
}

/** Best-effort creator id from discovery/search project documents. */
export function resolveProjectCreatorId(item: GlobalSearchDocument): number | null {
  const raw = item.raw ?? {}
  const nested = raw.project && typeof raw.project === "object" && !Array.isArray(raw.project)
    ? (raw.project as Record<string, unknown>)
    : null
  const fromFields = [
    raw.created_by,
    raw.created_by_id,
    raw.owner_id,
    raw.owner_user_id,
    nested?.created_by,
    nested?.created_by_id,
    nested?.owner_id,
  ]
  for (const value of fromFields) {
    const id = asPositiveId(value)
    if (id != null) return id
  }
  const meta = item.display_payload?.meta ?? []
  for (const entry of meta) {
    const label = entry.label?.trim().toLowerCase() ?? ""
    if (label === "created_by" || label === "owner" || label === "owner_id") {
      const id = asPositiveId(entry.value)
      if (id != null) return id
    }
  }
  return null
}

export function filterProjectsByScope(
  items: GlobalSearchDocument[],
  scope: ProjectListScope,
  currentUserId: number | null,
): GlobalSearchDocument[] {
  if (scope === "all" || currentUserId == null) return items
  return items.filter((item) => {
    const creatorId = resolveProjectCreatorId(item)
    if (scope === "created") return creatorId === currentUserId
    if (creatorId == null) return true
    return creatorId !== currentUserId
  })
}
