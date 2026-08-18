export type ArtifactCollabPresence = {
  userId: number
  name: string
  avatar: string | null
  color: string
  clientId: string
  cursor: { from: number; to: number } | null
  selection: { from: number; to: number } | null
  editing: boolean
}

export function presenceFromState(
  state: Record<string, unknown> | null | undefined,
): ArtifactCollabPresence | null {
  if (!state) return null
  const userId = Number(state.userId ?? state.user_id)
  if (!Number.isInteger(userId) || userId <= 0) return null
  const cursor = asRange(state.cursor)
  const selection = asRange(state.selection) ?? cursor
  return {
    userId,
    name: String(state.name ?? "User"),
    avatar: typeof state.avatar === "string" ? state.avatar : null,
    color: String(state.color ?? "#2563eb"),
    clientId: String(state.clientId ?? state.client_id ?? ""),
    cursor,
    selection,
    editing: state.editing === true,
  }
}

function asRange(value: unknown): { from: number; to: number } | null {
  if (!value || typeof value !== "object") return null
  const row = value as { from?: unknown; to?: unknown }
  const from = Number(row.from)
  const to = Number(row.to)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return { from, to }
}
