import { useCallback, useEffect, useMemo } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export interface InboxWatcherUser {
  id: number
  full_name: string | null
  email: string | null
  photo: string | null
}

export interface InboxThread {
  thread_id: number
  thread_title: string | null
  task_id: number | null
  project_id: number | null
  team_id: number | null
  user_id: number | null
  is_private: boolean | null
  pinned: boolean | null
  thread_created_at: string | null

  watchers: InboxWatcherUser[] | null
  other_watchers: InboxWatcherUser[] | null

  last_mention_id: number | null
  last_mention_at: string | null
  last_mention_by: number | null
  last_mention_snippet: string | null

  unread_count: number
}

interface UseInboxThreadsOptions {
  searchQuery?: string
  projectIds?: number[]
  taskIds?: number[]
  senderIds?: number[]
  dateFrom?: string | null // YYYY-MM-DD
  dateTo?: string | null // YYYY-MM-DD
  box?: 'received' | 'sent'
  currentUserId?: number | null
  pageSize?: number
}

export function useInboxThreadsInfinite(options: UseInboxThreadsOptions = {}) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

  const {
    searchQuery = '',
    projectIds = [],
    taskIds = [],
    senderIds = [],
    dateFrom,
    dateTo,
    box = 'received',
    currentUserId,
    pageSize = 50,
  } = options

  const queryKey = [
    'inbox-threads',
    box,
    currentUserId,
    searchQuery,
    projectIds.join(','),
    taskIds.join(','),
    senderIds.join(','),
    dateFrom ?? '',
    dateTo ?? '',
    pageSize,
  ] as const

  const fetchPage = useCallback(
    async (offset: number) => {
      let q = supabase
        .from('v_inbox_threads_i_can_see')
        .select(
          [
            'thread_id',
            'thread_title',
            'task_id',
            'project_id',
            'team_id',
            'user_id',
            'is_private',
            'pinned',
            'thread_created_at',
            'watchers',
            'other_watchers',
            'last_mention_id',
            'last_mention_at',
            'last_mention_by',
            'last_mention_snippet',
            'unread_count',
          ].join(',')
        )

      // Filters
      if (projectIds.length > 0) q = q.in('project_id', projectIds)
      if (taskIds.length > 0) q = q.in('task_id', taskIds)
      if (senderIds.length > 0) q = q.in('last_mention_by', senderIds)

      // Date range (by last_mention_at)
      if (dateFrom) q = q.gte('last_mention_at', `${dateFrom}T00:00:00.000Z`)
      if (dateTo) q = q.lte('last_mention_at', `${dateTo}T23:59:59.999Z`)

      // Search
      if (searchQuery.trim()) {
        const needle = searchQuery.trim().replaceAll(',', ' ')
        q = q.or(`thread_title.ilike.%${needle}%,last_mention_snippet.ilike.%${needle}%`)
      }

      // Box (received/sent) based on last_mention_by
      if (typeof currentUserId === 'number') {
        q = box === 'sent' ? q.eq('last_mention_by', currentUserId) : q.neq('last_mention_by', currentUserId)
      }

      // Sort + pagination
      q = q.order('last_mention_at', { ascending: false, nullsFirst: false }).range(offset, offset + pageSize - 1)

      const { data, error } = await q
      if (error) throw error
      return (data || []) as unknown as InboxThread[]
    },
    [
      supabase,
      box,
      currentUserId,
      searchQuery,
      projectIds,
      taskIds,
      senderIds,
      dateFrom,
      dateTo,
      pageSize,
    ]
  )

  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      return fetchPage(Number(pageParam) || 0)
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.length < pageSize) return undefined
      return allPages.reduce((acc, p) => acc + (p?.length ?? 0), 0)
    },
  })

  const threads = useMemo(() => {
    const all = query.data?.pages.flat() ?? []
    const seen = new Set<number>()
    const deduped: InboxThread[] = []
    for (const t of all) {
      if (typeof t?.thread_id !== 'number') continue
      if (seen.has(t.thread_id)) continue
      seen.add(t.thread_id)
      deduped.push(t)
    }
    return deduped
  }, [query.data])

  const refetchTopPage = useCallback(async () => {
    const fresh = await fetchPage(0)
    queryClient.setQueryData(queryKey, (old: any) => {
      if (!old || !Array.isArray(old.pages)) return old

      // Merge fresh page 0 into existing pages by thread_id (update in-place, insert new).
      const byId = new Map<number, InboxThread>()
      for (const row of fresh) byId.set(row.thread_id, row)

      const pages = old.pages.map((page: any[], idx: number) => {
        if (!Array.isArray(page)) return page
        if (idx === 0) {
          // Replace page 0 with fresh results
          return fresh
        }
        // For other pages, patch any updated rows (but do NOT reorder these pages)
        return page.map((t: InboxThread) => (byId.has(t.thread_id) ? { ...t, ...byId.get(t.thread_id)! } : t))
      })

      return { ...old, pages }
    })
  }, [fetchPage, queryClient, queryKey])

  // Realtime: patch cache in-place (no watcher refetch)
  useEffect(() => {
    if (!query.data) return

    const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim()

    const channel = supabase
      .channel('inbox-threads-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mentions' },
        (payload) => {
          const threadId = (payload.new as any)?.thread_id as number | undefined
          const createdAt = (payload.new as any)?.created_at as string | undefined
          const createdBy = (payload.new as any)?.created_by as number | undefined
          const mentionId = (payload.new as any)?.id as number | undefined
          const comment = (payload.new as any)?.comment as string | undefined
          if (!threadId) return

          queryClient.setQueriesData({ queryKey: ['inbox-threads'] }, (old: any) => {
            if (!old || !Array.isArray(old.pages)) return old

            const all: InboxThread[] = old.pages.flatMap((p: any) => (Array.isArray(p) ? p : []))
            const idx = all.findIndex((t) => t.thread_id === threadId)
            if (idx === -1) return old

            const existing = all[idx]
            const isFromMe = typeof currentUserId === 'number' && createdBy === currentUserId
            const nextUnread = isFromMe ? existing.unread_count : (existing.unread_count ?? 0) + 1

            const updated: InboxThread = {
              ...existing,
              last_mention_id: mentionId ?? existing.last_mention_id,
              last_mention_at: createdAt ?? existing.last_mention_at,
              last_mention_by: createdBy ?? existing.last_mention_by,
              last_mention_snippet: comment ? stripHtml(comment).slice(0, 160) : existing.last_mention_snippet,
              unread_count: nextUnread,
            }

            // Re-sort by moving updated thread to top of first page
            const without = all.filter((t) => t.thread_id !== threadId)
            const nextAll = [updated, ...without]
            const page0Size = Array.isArray(old.pages[0]) ? old.pages[0].length : pageSize
            return { ...old, pages: [nextAll.slice(0, page0Size), ...old.pages.slice(1)] }
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'seen_mentions' },
        async (payload) => {
          // For unread_count correctness, just refresh page 0 and merge.
          // This avoids refetching all pages (and avoids any watcher refetch).
          const seenBy = (payload.new as any)?.seen_by_id as number | undefined
          if (typeof currentUserId === 'number' && seenBy && seenBy !== currentUserId) return
          await refetchTopPage()
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'threads' },
        (payload) => {
          const id = (payload.new as any)?.id as number | undefined
          const title = (payload.new as any)?.title as string | null | undefined
          if (!id) return
          queryClient.setQueriesData({ queryKey: ['inbox-threads'] }, (old: any) => {
            if (!old || !Array.isArray(old.pages)) return old
            const pages = old.pages.map((page: InboxThread[]) =>
              Array.isArray(page) ? page.map((t) => (t.thread_id === id ? { ...t, thread_title: title ?? null } : t)) : page
            )
            return { ...old, pages }
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, queryClient, query.data, currentUserId, pageSize, refetchTopPage])

  return {
    threads,
    isLoading: query.isLoading,
    error: query.error,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetchTopPage,
  }
}

// Backwards-compatible alias
export function useInboxThreads(options: UseInboxThreadsOptions = {}) {
  return useInboxThreadsInfinite(options)
}

