"use client"

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { useQuery } from "@tanstack/react-query"

export interface ThreadMentionBatchRow {
  id: number
  thread_id: number
  comment: string | null
  created_at: string | null
  created_by: number | null
  reply_to_id: number | null
  attachment: string | null
  users?: {
    id: number
    full_name: string | null
    email: string | null
    photo: string | null
  } | null
  user_id?: number | null
  user_full_name?: string | null
  user_email?: string | null
  user_photo?: string | null
}

function normalizeThreadIds(threadIds: number[]): number[] {
  return Array.from(new Set(
    threadIds
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0)
  )).sort((a, b) => a - b)
}

async function listThreadMentionsBatch(threadIds: number[]): Promise<ThreadMentionBatchRow[]> {
  const normalizedThreadIds = normalizeThreadIds(threadIds)
  if (normalizedThreadIds.length === 0) return []
  const supabase = createClientComponentClient()

  const rpcResult = await supabase.rpc("get_thread_mentions_batch", {
    p_thread_ids: normalizedThreadIds,
  })
  if (!rpcResult.error) {
    const rows = (rpcResult.data ?? []) as any[]
    return rows.map((row) => ({
      id: Number(row.id),
      thread_id: Number(row.thread_id),
      comment: row.comment ?? null,
      created_at: row.created_at ?? null,
      created_by: row.created_by != null ? Number(row.created_by) : null,
      reply_to_id: row.reply_to_id != null ? Number(row.reply_to_id) : null,
      attachment: row.attachment ?? null,
      users: {
        id: row.user_id != null ? Number(row.user_id) : (row.created_by != null ? Number(row.created_by) : 0),
        full_name: row.user_full_name ?? null,
        email: row.user_email ?? null,
        photo: row.user_photo ?? null,
      },
      user_id: row.user_id != null ? Number(row.user_id) : null,
      user_full_name: row.user_full_name ?? null,
      user_email: row.user_email ?? null,
      user_photo: row.user_photo ?? null,
    }))
  }

  const { data, error } = await supabase
    .from("mentions")
    .select("id, thread_id, comment, created_at, created_by, reply_to_id, attachment, users:created_by(id, full_name, email, photo)")
    .in("thread_id", normalizedThreadIds)
    .order("created_at", { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as ThreadMentionBatchRow[]
}

export function useThreadMentionsBatch(threadIds: number[], options?: { enabled?: boolean }) {
  const normalizedThreadIds = normalizeThreadIds(threadIds)
  const enabled = (options?.enabled ?? true) && normalizedThreadIds.length > 0
  return useQuery({
    queryKey: ["thread-mentions-batch", normalizedThreadIds.join("|")],
    enabled,
    queryFn: () => listThreadMentionsBatch(normalizedThreadIds),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
}

