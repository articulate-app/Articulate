import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { fetchMentionsInbox } from "./global-search"

export type HomeRecentItem = {
  id: string
  title: string
  recentAt: string | null
}

const PAGE_SIZE = 20

function asRows(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : []
}

/** Drop imported future timestamps that would pin stale items above real recents. */
export function clampHomeRecentAt(value: string | null | undefined): string | null {
  if (!value) return null
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return null
  if (ms > Date.now() + 24 * 60 * 60 * 1000) return null
  return value
}

function mapRecentRow(row: Record<string, unknown>): HomeRecentItem | null {
  const id = row.id != null ? String(row.id) : null
  if (!id) return null
  const title =
    (typeof row.title === "string" && row.title.trim()) ||
    (typeof row.name === "string" && row.name.trim()) ||
    "Untitled"
  const recentAt = clampHomeRecentAt(
    typeof row.recent_at === "string"
      ? row.recent_at
      : row.recent_at instanceof Date
        ? row.recent_at.toISOString()
        : null,
  )
  return { id, title, recentAt }
}

export async function fetchHomeRecentProjects(args: {
  offset?: number
  limit?: number
}): Promise<HomeRecentItem[]> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("list_home_recent_projects", {
    p_limit: args.limit ?? PAGE_SIZE,
    p_offset: args.offset ?? 0,
  })
  if (error) throw error
  return asRows(data).map(mapRecentRow).filter(Boolean) as HomeRecentItem[]
}

export async function fetchHomeRecentTasks(args: {
  offset?: number
  limit?: number
}): Promise<HomeRecentItem[]> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("list_home_recent_tasks", {
    p_limit: args.limit ?? PAGE_SIZE,
    p_offset: args.offset ?? 0,
  })
  if (error) throw error
  return asRows(data).map(mapRecentRow).filter(Boolean) as HomeRecentItem[]
}

export async function fetchHomeRecentMentions(args: {
  offset?: number
  limit?: number
}): Promise<HomeRecentItem[]> {
  const rows = await fetchMentionsInbox({
    mode: "received",
    seenFilter: "all",
    offset: args.offset ?? 0,
    limit: args.limit ?? PAGE_SIZE,
  })
  return rows
    .map((row) => {
      const threadId = row.thread_id != null ? String(row.thread_id) : null
      const mentionId = row.entity_id != null ? String(row.entity_id) : null
      const title =
        row.display_payload?.preview?.trim() ||
        row.preview?.trim() ||
        row.title?.trim() ||
        "Mention"
      const recentAt = clampHomeRecentAt(row.created_at ?? null)
      // Skip future-dated imports so they cannot dominate the merged Recents list.
      if (!recentAt) return null
      return {
        id: threadId ?? mentionId ?? title,
        title,
        recentAt,
        mentionId,
        threadId,
      } as HomeRecentItem & { mentionId?: string | null; threadId?: string | null }
    })
    .filter(Boolean) as Array<HomeRecentItem & { mentionId?: string | null; threadId?: string | null }>
}

export async function fetchHomeRecentUsers(args: {
  offset?: number
  limit?: number
}): Promise<HomeRecentItem[]> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("list_home_recent_users", {
    p_limit: args.limit ?? PAGE_SIZE,
    p_offset: args.offset ?? 0,
  })
  if (error) throw error
  return asRows(data).map(mapRecentRow).filter(Boolean) as HomeRecentItem[]
}

export async function fetchHomeRecentAiChats(args: {
  offset?: number
  limit?: number
}): Promise<HomeRecentItem[]> {
  const supabase = createClientComponentClient()
  const from = args.offset ?? 0
  const to = from + (args.limit ?? PAGE_SIZE) - 1
  const { data, error } = await supabase
    .from("v_ai_threads_visible")
    .select("id, title, last_message_at, created_at")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to)
  if (error) throw error
  return asRows(data).map((row) => {
    const id = row.id != null ? String(row.id) : null
    if (!id) return null
    const title =
      (typeof row.title === "string" && row.title.trim()) || "New chat"
    const recentAt = clampHomeRecentAt(
      typeof row.last_message_at === "string"
        ? row.last_message_at
        : typeof row.created_at === "string"
          ? row.created_at
          : null,
    )
    return { id, title, recentAt }
  }).filter(Boolean) as HomeRecentItem[]
}

export const HOME_SIDEBAR_PAGE_SIZE = PAGE_SIZE
