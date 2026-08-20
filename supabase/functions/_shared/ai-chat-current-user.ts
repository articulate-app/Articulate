export type AiChatCurrentUser = {
  user_id: number
  full_name: string | null
  first_name: string | null
}

function firstNameFromFullName(fullName: string | null): string | null {
  if (!fullName) return null
  const first = fullName.split(/\s+/).find((part) => part.length > 0) ?? null
  return first || null
}

export function normalizeAiChatCurrentUser(row: {
  id?: unknown
  full_name?: unknown
} | null | undefined): AiChatCurrentUser | null {
  const userId = Number(row?.id)
  if (!Number.isFinite(userId) || userId <= 0) return null
  const fullName =
    typeof row?.full_name === "string" && row.full_name.trim()
      ? row.full_name.trim()
      : null
  return {
    user_id: userId,
    full_name: fullName,
    first_name: firstNameFromFullName(fullName),
  }
}

/** Factual block for the turn context — who the signed-in speaker is. */
export function buildCurrentUserContextPrompt(
  user: AiChatCurrentUser | null | undefined,
): string | null {
  if (!user) return null
  return `CURRENT USER (the signed-in person you are talking to — not a project, task, brand, or source): ${JSON.stringify({
    user_id: user.user_id,
    full_name: user.full_name,
    first_name: user.first_name,
  })}`
}

export async function loadAiChatCurrentUser(db: any): Promise<AiChatCurrentUser | null> {
  if (!db) return null
  const { data: actorId } = await db.rpc("current_user_id")
  const fromRpc = Number(actorId)
  if (Number.isFinite(fromRpc) && fromRpc > 0) {
    const { data } = await db.from("users").select("id, full_name").eq("id", fromRpc).maybeSingle()
    return normalizeAiChatCurrentUser(data ?? { id: fromRpc, full_name: null })
  }

  const auth = await db.auth.getUser()
  const authUserId = auth.data?.user?.id
  if (!authUserId) return null
  const { data } = await db.from("users").select("id, full_name").eq("auth_user_id", authUserId).maybeSingle()
  return normalizeAiChatCurrentUser(data)
}
