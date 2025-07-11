import React, { useEffect, useState } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Button } from "../ui/button"
import { MentionsList } from "./mentions-list"
import { ThreadParticipants } from "./thread-participants"

/**
 * Props for the CommentsSection component.
 */
export interface CommentsSectionProps {
  /** The ID of the task to which the comments are linked. */
  taskId: number
  onThreadIdChange?: (threadId: number | null) => void
}

interface Thread {
  id: number
  task_id: number
  created_by: string
  created_at: string
  title: string | null
}

/**
 * CommentsSection displays threaded comments for a given task.
 * Handles thread selection, mentions, and real-time updates.
 */
export function CommentsSection({ taskId, onThreadIdChange }: CommentsSectionProps) {
  const [threads, setThreads] = useState<Thread[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null)
  const [hasError, setHasError] = useState<string | null>(null)
  const [isCreatingThread, setIsCreatingThread] = useState(false)
  const supabase = createClientComponentClient()

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;
    setIsLoading(true);
    setHasError(null);
    supabase
      .from('threads')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true })
      // @ts-ignore
      .abortSignal ? .abortSignal(controller.signal) : .signal ? .signal(controller.signal) : undefined;
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          setHasError('Failed to load threads');
          setThreads([]);
        } else {
          setThreads(data || []);
          if (data && data.length > 0) {
            setSelectedThreadId(data[0].id);
            onThreadIdChange?.(data[0].id);
          } else {
            setSelectedThreadId(null);
            onThreadIdChange?.(null);
          }
        }
        setIsLoading(false);
      });
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [taskId]);

  const handleSelectThread = (id: number) => {
    setSelectedThreadId(id)
    onThreadIdChange?.(id)
  }

  const handleStartThread = async () => {
    setIsCreatingThread(true)
    setHasError(null)
    try {
      // Debug: log Supabase client, user, session
      console.log('Supabase client (comments):', supabase)
      const { data: authData, error: authError } = await supabase.auth.getUser()
      console.log('Auth user (comments):', authData.user, 'Auth error:', authError)
      if (typeof supabase.auth.getSession === 'function') {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        console.log('Session (comments):', sessionData, 'Session error:', sessionError)
      }
      if (authError || !authData?.user?.id) throw new Error('Could not get current user')
      const authUid = authData.user.id
      // 2. Look up public.users.id where auth_user_id = authUid
      const { data: userRows, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', authUid)
        .maybeSingle()
      if (userError || !userRows?.id) throw new Error('Could not find user row for current user')
      const publicUserId = userRows.id
      // Log the exact insert parameters for debugging
      const threadPayload = { task_id: taskId, created_by: publicUserId }
      console.log('Inserting thread with:', threadPayload)
      const { data, error } = await supabase
        .from('threads')
        .insert([threadPayload])
        .select('*')
        .single()
      // Log the result and error
      console.log('Insert result:', data)
      if (error || !data) {
        console.error('Thread creation error:', error, { task_id: taskId, created_by: publicUserId })
        throw error || new Error('No data returned')
      }
      setThreads((prev) => [...prev, data])
      setSelectedThreadId(data.id)
      onThreadIdChange?.(data.id)
    } catch (err: any) {
      setHasError('Failed to create thread')
      // Optionally log err
      console.error('Thread creation failed:', err)
    } finally {
      setIsCreatingThread(false)
    }
  }

  const handleDeleteThread = async () => {
    if (!selectedThreadId) return
    if (!window.confirm("Are you sure you want to delete this thread? This cannot be undone.")) return
    try {
      const { error } = await supabase.from('threads').delete().eq('id', selectedThreadId)
      if (error) {
        setHasError('Failed to delete thread: ' + error.message)
        console.error('Delete thread error:', error)
        return
      }
      // Refetch threads
      setIsLoading(true)
      const { data: threads, error: fetchError } = await supabase
        .from('threads')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })
      setThreads(threads || [])
      if (threads && threads.length > 0) {
        setSelectedThreadId(threads[0].id)
        onThreadIdChange?.(threads[0].id)
      } else {
        setSelectedThreadId(null)
        onThreadIdChange?.(null)
      }
      if (fetchError) {
        setHasError('Failed to fetch threads after delete: ' + fetchError.message)
        console.error('Fetch threads after delete error:', fetchError)
      }
    } catch (err) {
      setHasError('Failed to delete thread (unexpected error)')
      console.error('Delete thread unexpected error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-2 flex items-center gap-2 bg-muted/30 relative">
        {isLoading && <span className="text-muted-foreground text-sm">Loading threads...</span>}
        {hasError && <span className="text-destructive text-sm">{hasError}</span>}
        <div className="flex gap-2 items-center">
          <span className="text-xs text-muted-foreground">Thread:</span>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={selectedThreadId ?? ''}
            onChange={e => handleSelectThread(Number(e.target.value))}
            disabled={isLoading || isCreatingThread || threads.length === 0}
          >
            {threads.map(thread => (
              <option key={thread.id} value={thread.id}>
                {thread.title || `Thread #${thread.id}`}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ml-2 px-2 py-1 text-xs rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
            onClick={handleStartThread}
            disabled={isCreatingThread}
            aria-label="Add new thread"
          >
            + New Thread
          </button>
          <button
            type="button"
            className="ml-1 px-2 py-1 text-xs rounded bg-destructive text-white hover:bg-destructive/90 disabled:opacity-50"
            onClick={handleDeleteThread}
            disabled={!selectedThreadId || isLoading}
            aria-label="Delete selected thread"
            title="Delete selected thread"
          >
            🗑️
          </button>
        </div>
      </div>
      <div className="flex-1">
        {selectedThreadId ? (
          <div className="flex flex-col h-full">
            <ThreadParticipants threadId={selectedThreadId} />
            <MentionsList key={selectedThreadId} threadId={selectedThreadId} />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            No thread selected.
          </div>
        )}
      </div>
    </div>
  )
} 