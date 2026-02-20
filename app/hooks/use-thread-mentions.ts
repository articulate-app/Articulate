import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useEffect } from 'react'

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
  threadId: number | null
  pageSize?: number
  enabled?: boolean
}

export function useThreadMentions({ threadId, pageSize = 50, enabled = true }: UseThreadMentionsOptions) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

  // Fetch mentions for the thread
  const { data: mentions, isLoading, error, refetch } = useQuery({
    queryKey: ['thread-mentions', threadId, pageSize],
    queryFn: async () => {
      if (!threadId) return []

      // Try the view first, fallback to mentions table if the view errors (no throwing)
      const viewResult = await supabase
        .from('v_thread_mentions_i_can_see')
        .select('*, users:created_by(id, full_name, email, photo)')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
        .limit(pageSize)

      if (!viewResult.error) {
        return (viewResult.data || []) as ThreadMention[]
      }

      const tableResult = await supabase
        .from('mentions')
        .select('*, users:created_by(id, full_name, email, photo)')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
        .limit(pageSize)

      if (tableResult.error) throw tableResult.error

      // Table doesn't include is_read; default false (read state is managed via seen_mentions)
      return ((tableResult.data || []) as any[]).map((m) => ({ ...m, is_read: false })) as ThreadMention[]
    },
    enabled: enabled && !!threadId,
  })

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
          queryClient.invalidateQueries({ queryKey: ['thread-mentions', threadId] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, queryClient, threadId, enabled])

  return {
    mentions: mentions || [],
    isLoading,
    error,
    refetch,
  }
}

