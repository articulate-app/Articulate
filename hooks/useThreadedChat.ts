import { useEffect, useState, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export interface ChatMessage {
  id: string
  content: string
  user: {
    userId: string
    displayName: string
    avatar?: string
  }
  createdAt: string
}

export function useThreadedChat(threadId: number, currentUserId?: number, currentUserInfo?: { displayName: string; avatar?: string }) {
  const supabase = createClientComponentClient()
  const [mentions, setMentions] = useState<any[]>([])
  const [usersById, setUsersById] = useState<Record<number, any>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    setError(null)
    async function fetchMentions() {
      const { data, error } = await supabase
        .from('mentions')
        .select('*, users:created_by(full_name, email, photo, id)')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
      if (!isMounted) return
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
      setIsLoading(false)
    }
    fetchMentions()
    // Subscribe to realtime changes
    const sub = supabase
      .channel('mentions-thread-' + threadId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mentions', filter: 'thread_id=eq.' + threadId }, payload => {
        if (payload.eventType === 'INSERT') {
          setMentions(prev => [...prev, payload.new])
        } else if (payload.eventType === 'DELETE') {
          setMentions(prev => prev.filter(m => m.id !== payload.old.id))
        } else if (payload.eventType === 'UPDATE') {
          setMentions(prev => prev.map(m => m.id === payload.new.id ? payload.new : m))
        }
      })
      .subscribe()
    return () => {
      isMounted = false
      supabase.removeChannel(sub)
    }
  }, [threadId])

  // Map mentions to ChatMessage type
  const messages: ChatMessage[] = mentions.map(m => {
    // Use m.users if present (optimistic or real)
    if (m.users) {
      return {
        id: m.id.toString(),
        content: m.comment,
        user: {
          userId: m.users.id?.toString() || (currentUserId ? currentUserId.toString() : 'unknown'),
          displayName: m.users.full_name || m.users.email || 'You',
          avatar: m.users.photo,
        },
        createdAt: m.created_at,
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
        },
        createdAt: m.created_at,
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
      },
      createdAt: m.created_at,
    }
  })

  // Send a new message (mention)
  const sendMessage = useCallback(async (text: string, currentUserId?: number) => {
    if (!text.trim() || !currentUserId) return
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

  return { messages, sendMessage, editMessage, deleteMessage, isLoading, error }
} 