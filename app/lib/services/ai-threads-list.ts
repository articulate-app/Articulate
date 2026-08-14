/**
 * AI chats directory list — same source/order as the AI pane clock (HistoryDropdown).
 */

import { getSupabaseBrowser } from "../../../lib/supabase-browser"
import type { GlobalSearchDocument } from "../global-search-types"

const DEFAULT_PAGE_SIZE = 50

type VisibleAiThreadRow = {
  id: string
  title: string | null
  scope?: string | null
  visibility?: string | null
  project_id?: number | null
  task_id?: number | null
  created_at: string
  last_message_at?: string | null
}

export function mapVisibleAiThreadToSearchDocument(row: VisibleAiThreadRow): GlobalSearchDocument {
  const id = String(row.id)
  const title = (row.title ?? "").trim() || "New chat"
  const lastMessageAt = typeof row.last_message_at === "string" ? row.last_message_at : null
  const createdAt = typeof row.created_at === "string" ? row.created_at : null
  return {
    entity_type: "ai_thread",
    entity_id: id,
    title,
    subtitle: null,
    preview: null,
    created_at: createdAt,
    score: null,
    url: null,
    project_id: row.project_id ?? null,
    task_id: row.task_id ?? null,
    thread_id: null,
    display_payload: {
      title,
      meta: [
        ...(lastMessageAt ? [{ label: "last_message_at", value: lastMessageAt }] : []),
        ...(createdAt ? [{ label: "created_at", value: createdAt }] : []),
        ...(row.scope ? [{ label: "scope", value: String(row.scope) }] : []),
        ...(row.visibility ? [{ label: "visibility", value: String(row.visibility) }] : []),
      ],
    },
    raw: {
      id,
      title: row.title,
      scope: row.scope ?? null,
      visibility: row.visibility ?? null,
      project_id: row.project_id ?? null,
      task_id: row.task_id ?? null,
      created_at: createdAt,
      last_message_at: lastMessageAt,
      updated_at: lastMessageAt ?? createdAt,
    },
  }
}

/** Same ordering as `useThreads` / HistoryDropdown clock. */
export async function fetchVisibleAiThreadsPage(args: {
  offset?: number
  limit?: number
}): Promise<GlobalSearchDocument[]> {
  const supabase = getSupabaseBrowser()
  const from = Math.max(0, args.offset ?? 0)
  const limit = Math.max(1, args.limit ?? DEFAULT_PAGE_SIZE)
  const to = from + limit - 1
  const { data, error } = await supabase
    .from("v_ai_threads_visible")
    .select("id, title, scope, visibility, project_id, task_id, created_at, last_message_at")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to)
  if (error) throw error
  return (Array.isArray(data) ? data : [])
    .map((row) => {
      const id = row?.id != null ? String(row.id) : ""
      if (!id) return null
      return mapVisibleAiThreadToSearchDocument({
        id,
        title: typeof row.title === "string" ? row.title : null,
        scope: typeof row.scope === "string" ? row.scope : null,
        visibility: typeof row.visibility === "string" ? row.visibility : null,
        project_id: typeof row.project_id === "number" ? row.project_id : null,
        task_id: typeof row.task_id === "number" ? row.task_id : null,
        created_at: typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
        last_message_at: typeof row.last_message_at === "string" ? row.last_message_at : null,
      })
    })
    .filter(Boolean) as GlobalSearchDocument[]
}
