import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export interface ChatMessage {
  id: string
  content: string
  user: {
    userId: string
    displayName: string
    avatar?: string
    email?: string
  }
  createdAt: string
  created_by?: number
  attachment?: string
  reply_to_id?: number | null
}

export function useThreadedChat(threadId: number, currentUserId?: number, currentUserInfo?: { displayName: string; avatar?: string; email?: string }, initialMentions?: any[], pageSize: number = 20) {
  const supabase = createClientComponentClient()
  const [mentions, setMentions] = useState<any[]>(initialMentions || [])
  const [usersById, setUsersById] = useState<Record<number, any>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [oldestLoaded, setOldestLoaded] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Load thread mentions via batch RPC (single-thread use uses one-item batch).
  const fetchMentionsBatch = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_thread_mentions_batch', {
      p_thread_ids: [threadId],
    })
    if (error) {
      setError('Failed to load messages')
      return []
    }
    const rows = Array.isArray(data) ? data : []
    return rows
      .filter((row: any) => Number(row?.thread_id) === Number(threadId))
      .map((row: any) => ({
        id: row.id,
        comment: row.comment ?? '',
        attachment: row.attachment ?? null,
        created_by: row.created_by ?? null,
        created_at: row.created_at ?? null,
        reply_to_id: row.reply_to_id ?? null,
        thread_id: row.thread_id,
        users: {
          id: row.user_id ?? row.created_by ?? null,
          full_name: row.user_full_name ?? null,
          email: row.user_email ?? null,
          photo: row.user_photo ?? null,
        },
      }))
      .sort((a: any, b: any) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime())
  }, [supabase, threadId])

  // Kept for API compatibility with existing UI; this now returns the full batch-loaded thread.
  const fetchMentionsPage = useCallback(async (before?: string) => {
    setIsLoadingMore(true)
    const data = await fetchMentionsBatch()
    setIsLoadingMore(false)
    if (!before) return data || []
    return (data || []).filter((row: any) => new Date(row.created_at ?? 0).getTime() < new Date(before).getTime())
  }, [fetchMentionsBatch])

  // Initial load: fetch most recent N messages
  useEffect(() => {
    let isMounted = true;
    setError(null);

    if (initialMentions && initialMentions.length > 0) {
      // Filter out any invalid mentions before setting
      const validMentions = initialMentions.filter(m => m && m.id != null && m.created_at && m.created_by != null);
      setMentions(validMentions);
      setHasMore(validMentions.length === pageSize);
      setOldestLoaded(validMentions.length > 0 ? validMentions[validMentions.length - 1].created_at : null);
      // Build user map
      const userMap: Record<number, any> = {};
      for (const m of validMentions) {
        if (m.users) userMap[m.created_by] = m.users;
      }
      setUsersById(userMap);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetchMentionsPage().then(data => {
      if (!isMounted) return;
      setMentions(data);
      setHasMore(data.length === pageSize);
      setOldestLoaded(data.length > 0 ? data[data.length - 1].created_at : null);
      // Build user map
      const userMap: Record<number, any> = {};
      for (const m of data || []) {
        if (m.users) userMap[m.created_by] = m.users;
      }
      setUsersById(userMap);
      setIsLoading(false);
    });
    return () => { isMounted = false; };
  }, [threadId, pageSize, fetchMentionsPage, initialMentions]);

  // Infinite scroll: load older messages
  const loadOlderMessages = useCallback(async () => {
    if (!oldestLoaded || isLoadingMore || !hasMore) return
    const older = await fetchMentionsPage(oldestLoaded)
    setMentions(prev => [...prev, ...older])
    setHasMore(false)
    setOldestLoaded(older.length > 0 ? older[older.length - 1].created_at : oldestLoaded)
    // Update user map
    const userMap: Record<number, any> = {}
    for (const m of older || []) {
      if (m.users) userMap[m.created_by] = m.users
    }
    setUsersById(prev => ({ ...prev, ...userMap }))
  }, [oldestLoaded, isLoadingMore, hasMore, fetchMentionsPage, pageSize])

  // Helper to refresh mentions
  const refreshMentions = useCallback(async () => {
    const data = await fetchMentionsBatch()
    setMentions(data || [])
    // Build user map
    const userMap: Record<number, any> = {}
    for (const m of data || []) {
      if (m.users) userMap[m.created_by] = m.users
    }
    setUsersById(userMap)
  }, [fetchMentionsBatch])

  // Real-time subscription for new messages only
  useEffect(() => {
    if (!mentions.length) return
    const latestCreatedAt = mentions[0].created_at
    const sub = supabase
      .channel('mentions-thread-' + threadId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mentions', filter: 'thread_id=eq.' + threadId }, async payload => {
        if (payload.new.created_at > latestCreatedAt) {
          let newMention = payload.new;
          // Use local user map if possible
          let userInfo = usersById[newMention.created_by];
          if (!newMention.users && userInfo) {
            newMention = { ...newMention, users: userInfo };
          }
          // If still missing, fetch from API
          if (!newMention.users) {
            const { data: userData } = await supabase
              .from('view_users_i_can_see')
              .select('id, full_name, email, photo')
              .eq('id', newMention.created_by)
              .single();
            if (userData) {
              newMention = { ...newMention, users: userData };
            }
          }
          setMentions(prev => {
            // Filter out any optimistic messages with the same content to prevent duplicates
            const filtered = prev.filter(m => !(m.isOptimistic && m.comment === newMention.comment && m.created_by === newMention.created_by))
            return [newMention, ...filtered]
          });
          if (newMention.users) {
            setUsersById(prev => ({ ...prev, [newMention.created_by]: newMention.users }));
          }
        }
      })
      .subscribe()
    // Visibility change: refresh mentions when tab becomes active
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshMentions();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      supabase.removeChannel(sub)
      document.removeEventListener('visibilitychange', handleVisibility);
    }
  }, [supabase, threadId, mentions, usersById, refreshMentions])

  // Send a new message (mention)
  const sendMessage = useCallback(async (
    text: string,
    currentUserId?: number,
    options?: { replyToId?: number | null; attachment?: string | null }
  ) => {
    if (!text.trim() || !currentUserId) return
    // Optimistically add a temp message
    const tempId = `temp-${Date.now()}`
    const optimisticMessage = {
      id: tempId,
      comment: text,
      attachment: options?.attachment || null,
      reply_to_id: options?.replyToId || null,
      created_by: currentUserId,
      created_at: new Date().toISOString(),
      users: currentUserInfo ? {
        id: currentUserId,
        full_name: currentUserInfo.displayName,
        photo: currentUserInfo.avatar,
        email: '',
      } : undefined,
      isOptimistic: true,
    }
    setMentions(prev => [...prev, optimisticMessage])
    const { error } = await supabase.from('mentions').insert({
      comment: text,
      thread_id: threadId,
      created_by: currentUserId,
      reply_to_id: options?.replyToId || null,
      attachment: options?.attachment || null,
    })
    if (error) {
      setError('Failed to send message: ' + error.message)
      setMentions(prev => prev.filter(m => m.id !== tempId))
    }
  }, [threadId, currentUserInfo, supabase])

  // Edit a message (mention)
  const editMessage = useCallback(async (id: string, newContent: string) => {
    const { error } = await supabase
      .from('mentions')
      .update({ comment: newContent })
      .eq('id', id)
    if (error) setError('Failed to edit message: ' + error.message)
    else await refreshMentions()
  }, [supabase, refreshMentions])

  // Delete a message (mention)
  const deleteMessage = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('mentions')
      .delete()
      .eq('id', id)
    if (error) setError('Failed to delete message: ' + error.message)
    else await refreshMentions()
  }, [supabase, refreshMentions])

  // Map mentions to ChatMessage type
  const messages: ChatMessage[] = useMemo(() => mentions
    .filter(m => m && m.id != null) // Filter out invalid mentions
    .map(m => {
    const baseMessage = {
      id: String(m.id),
      content: m.comment || '',
      createdAt: m.created_at || new Date().toISOString(),
      created_by: m.created_by,
      attachment: m.attachment || undefined,
      reply_to_id: m.reply_to_id || undefined,
    }
    // Use m.users if present (optimistic or real)
    if (m.users) {
      return {
        ...baseMessage,
        user: {
          userId: m.users.id?.toString() || (currentUserId ? currentUserId.toString() : 'unknown'),
          displayName: m.users.full_name || m.users.email || 'You',
          avatar: m.users.photo,
          email: m.users.email || undefined,
        },
      }
    }
    // Fallback to previous logic
    if (currentUserId && m.created_by === currentUserId) {
      return {
        ...baseMessage,
        user: {
          userId: currentUserId.toString(),
          displayName: currentUserInfo?.displayName || 'You',
          avatar: currentUserInfo?.avatar,
          email: currentUserInfo?.email,
        },
      }
    }
    return {
      ...baseMessage,
      user: {
        userId: usersById[m.created_by]?.id?.toString() || 'unknown',
        displayName:
          usersById[m.created_by]?.full_name ||
          usersById[m.created_by]?.email ||
          'Unknown',
        avatar:
          usersById[m.created_by]?.photo ||
          (usersById[m.created_by]?.email
            ? `https://www.gravatar.com/avatar/$
                {typeof window !== 'undefined' && window.btoa
                  ? window.btoa(usersById[m.created_by]?.email.trim().toLowerCase())
                  : ''
                }?d=identicon`
            : undefined),
        email: usersById[m.created_by]?.email || undefined,
      },
    }
  }), [mentions, usersById, currentUserId, currentUserInfo]);

  return { messages, sendMessage, editMessage, deleteMessage, isLoading, error, hasMore, loadOlderMessages, isLoadingMore }
} 