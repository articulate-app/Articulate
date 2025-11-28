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
}

export function useThreadedChat(threadId: number, currentUserId?: number, currentUserInfo?: { displayName: string; avatar?: string; email?: string }, initialMentions?: any[], pageSize: number = 20) {
  console.log('[useThreadedChat] called for threadId:', threadId);
  const supabase = createClientComponentClient()
  const [mentions, setMentions] = useState<any[]>(initialMentions || [])
  const [usersById, setUsersById] = useState<Record<number, any>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [oldestLoaded, setOldestLoaded] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Helper to fetch a page of mentions (for infinite scroll)
  const fetchMentionsPage = useCallback(async (before?: string) => {
    setIsLoadingMore(true)
    let query = supabase
      .from('mentions')
      .select('*, users:created_by(full_name, email, photo, id)')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(pageSize)
    if (before) {
      query = query.lt('created_at', before)
    }
    const { data, error } = await query
    if (error) {
      setError('Failed to load messages')
      setIsLoadingMore(false)
      return []
    }
    setIsLoadingMore(false)
    return data || []
  }, [supabase, threadId, pageSize])

  // Initial load: fetch most recent N messages
  useEffect(() => {
    console.log('[useThreadedChat] fetching initial mentions for threadId:', threadId);
    let isMounted = true;
    setError(null);

    if (initialMentions && initialMentions.length > 0) {
      setMentions(initialMentions);
      setHasMore(initialMentions.length === pageSize);
      setOldestLoaded(initialMentions.length > 0 ? initialMentions[initialMentions.length - 1].created_at : null);
      // Build user map
      const userMap: Record<number, any> = {};
      for (const m of initialMentions) {
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
    setHasMore(older.length === pageSize)
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
    const { data, error } = await supabase
      .from('mentions')
      .select('*, users:created_by(full_name, email, photo, id)')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
    if (error) {
      setError('Failed to load messages')
      setMentions([])
    } else {
      setMentions(data || [])
      // Build user map
      const userMap: Record<number, any> = {}
      for (const m of data || []) {
        if (m.users) userMap[m.created_by] = m.users
      }
      setUsersById(userMap)
    }
  }, [supabase, threadId])

  // Real-time subscription for new messages only
  useEffect(() => {
    console.log('[useThreadedChat] setting up real-time subscription for threadId:', threadId);
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
  const sendMessage = useCallback(async (text: string, currentUserId?: number) => {
    console.log('sendMessage called with:', { text, currentUserId });
    if (!text.trim() || !currentUserId) return
    console.log('Inserting mention:', {
      comment: text,
      thread_id: threadId,
      created_by: currentUserId,
    });
    // Optimistically add a temp message
    const tempId = `temp-${Date.now()}`
    const optimisticMessage = {
      id: tempId,
      comment: text,
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
    })
    if (error) {
      setError('Failed to send message: ' + error.message)
      setMentions(prev => prev.filter(m => m.id !== tempId))
    }
  }, [threadId, currentUserInfo])

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
  const messages: ChatMessage[] = useMemo(() => mentions.map(m => {
    // Use m.users if present (optimistic or real)
    if (m.users) {
      return {
        id: m.id.toString(),
        content: m.comment,
        user: {
          userId: m.users.id?.toString() || (currentUserId ? currentUserId.toString() : 'unknown'),
          displayName: m.users.full_name || m.users.email || 'You',
          avatar: m.users.photo,
          email: m.users.email || undefined,
        },
        createdAt: m.created_at,
        created_by: m.created_by,
      }
    }
    // Fallback to previous logic
    if (currentUserId && m.created_by === currentUserId) {
      return {
        id: m.id.toString(),
        content: m.comment,
        user: {
          userId: currentUserId.toString(),
          displayName: currentUserInfo?.displayName || 'You',
          avatar: currentUserInfo?.avatar,
          email: currentUserInfo?.email,
        },
        createdAt: m.created_at,
        created_by: m.created_by,
      }
    }
    return {
      id: m.id.toString(),
      content: m.comment,
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
      createdAt: m.created_at,
      created_by: m.created_by,
    }
  }), [mentions, usersById, currentUserId, currentUserInfo]);

  return { messages, sendMessage, editMessage, deleteMessage, isLoading, error, hasMore, loadOlderMessages, isLoadingMore }
} 