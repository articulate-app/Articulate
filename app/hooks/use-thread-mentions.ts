import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useEffect } from 'react'
import { useThreadMentionsBatch } from './use-thread-mentions-batch'

export interface ThreadMention {
  id: number
  thread_id: number
  comment: string
  attachment: string | null
  reply_to_id: number | null
  created_at: string
  created_by: number
  is_read: boolean
  users?: {
    id: number
    full_name: string | null
    email: string | null
    photo: string | null
  }
}

interface UseThreadMentionsOptions {
  threadId: number | string | null
  pageSize?: number
  enabled?: boolean
}

export function useThreadMentions({ threadId, pageSize = 50, enabled = true }: UseThreadMentionsOptions) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

  const numericThreadId = threadId != null ? Number(threadId) : null
  const threadMentionsBatchQuery = useThreadMentionsBatch(
    numericThreadId != null && Number.isFinite(numericThreadId) ? [numericThreadId] : [],
    { enabled: enabled && numericThreadId != null && Number.isFinite(numericThreadId) }
  )
  const mentions = useMemo(() => {
    const rows = threadMentionsBatchQuery.data ?? []
    return rows
      .filter((row) => Number(row.thread_id) === Number(threadId))
      .slice(0, pageSize)
      .map((row) => ({
        id: row.id,
        thread_id: row.thread_id,
        comment: row.comment ?? '',
        attachment: row.attachment ?? null,
        reply_to_id: row.reply_to_id ?? null,
        created_at: row.created_at ?? new Date().toISOString(),
        created_by: row.created_by ?? 0,
        is_read: false,
        users: row.users ?? null,
      })) as ThreadMention[]
  }, [threadMentionsBatchQuery.data, threadId, pageSize])

  // Realtime subscription for new mentions in this thread
  useEffect(() => {
    if (!threadId || !enabled) return

    const channel = supabase
      .channel(`thread-mentions-${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mentions',
          filter: `thread_id=eq.${threadId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['thread-mentions-batch'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, queryClient, threadId, enabled])

  return {
    mentions: mentions || [],
    isLoading: threadMentionsBatchQuery.isLoading,
    error: threadMentionsBatchQuery.error,
    refetch: threadMentionsBatchQuery.refetch,
  }
}

