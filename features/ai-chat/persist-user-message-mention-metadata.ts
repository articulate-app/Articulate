import { getSupabaseBrowser } from "../../lib/supabase-browser"
import type { AiUserMessageContentJson } from "./ai-chat-user-message-content"
import { toPersistedAiThreadId } from "./thread-id"

function hasPersistableUserDisplayMetadata(contentJson: AiUserMessageContentJson): boolean {
  return (
    (contentJson.mention_tags?.length ?? 0) > 0
    || (contentJson.segments?.length ?? 0) > 0
    || (contentJson.display_parts?.length ?? 0) > 0
  )
}

function serverHasPersistedDisplayMetadata(existing: Record<string, unknown>): boolean {
  if (Array.isArray(existing.mention_tags) && existing.mention_tags.length > 0) return true
  if (Array.isArray(existing.display_parts) && existing.display_parts.length > 0) return true
  return false
}

async function findLatestUserMessageRow(args: {
  threadId: string
  contentCandidates: string[]
}): Promise<{ id: string; content_json: unknown } | null> {
  const supabase = getSupabaseBrowser()
  for (const content of args.contentCandidates) {
    const trimmed = content.trim()
    if (!trimmed) continue
    const { data: row, error } = await supabase
      .from("ai_messages")
      .select("id, content_json")
      .eq("thread_id", args.threadId)
      .eq("role", "user")
      .eq("content", trimmed)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!error && row?.id) return row
  }
  return null
}

export async function persistUserMessageMentionMetadata(args: {
  threadId: string
  content: string
  contentJson: AiUserMessageContentJson | Record<string, unknown>
}): Promise<void> {
  const parsed =
    args.contentJson && typeof args.contentJson === "object"
      ? (args.contentJson as AiUserMessageContentJson)
      : {}
  if (!hasPersistableUserDisplayMetadata(parsed)) return

  const persistedThreadId = toPersistedAiThreadId(args.threadId)
  if (!persistedThreadId) return

  const internalMessage = typeof parsed.internal_message === "string" ? parsed.internal_message.trim() : ""
  const row = await findLatestUserMessageRow({
    threadId: persistedThreadId,
    contentCandidates: [internalMessage, args.content],
  })
  if (!row?.id) return

  const existing =
    row.content_json && typeof row.content_json === "object"
      ? (row.content_json as Record<string, unknown>)
      : {}
  if (serverHasPersistedDisplayMetadata(existing)) return

  const supabase = getSupabaseBrowser()
  const { error: updateError } = await supabase
    .from("ai_messages")
    .update({
      content_json: {
        ...existing,
        ...parsed,
      },
    })
    .eq("id", row.id)

  if (updateError) {
    console.warn("[ai-chat] failed to persist user display metadata", updateError)
  }
}
