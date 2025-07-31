import React, { useEffect, useState } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Button } from "../ui/button"
import { ThreadParticipants } from "./thread-participants"

/**
 * Props for the CommentsSection component.
 */
export interface CommentsSectionProps {
  /** The ID of the task to which the comments are linked. */
  taskId: number
  threads: Thread[]
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
export function CommentsSection({ taskId, threads, onThreadIdChange }: CommentsSectionProps) {
  // Use threads from props, do not fetch on mount
  const [isLoading, setIsLoading] = useState(true)
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(threads.length > 0 ? threads[0].id : null)
  const [hasError, setHasError] = useState<string | null>(null)
  const [isCreatingThread, setIsCreatingThread] = useState(false)
  const [projectId, setProjectId] = useState<number | null>(null)
  const supabase = createClientComponentClient()

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setHasError(null);
    supabase
      .from('tasks')
      .select('project_id_int')
      .eq('id', taskId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (isMounted) {
          if (error) {
            setHasError('Failed to fetch project for task: ' + error.message)
          } else if (data && data.project_id_int) {
            setProjectId(Number(data.project_id_int))
          }
        }
      })
    return () => { isMounted = false }
  }, [taskId, supabase])

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
      // setThreads((prev) => [...prev, data]) // This line is removed as per the edit hint
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
      // setThreads(threads || []) // This line is removed as per the edit hint
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
            {threads.map((thread: Thread) => (
              <option key={thread.id} value={thread.id}>
                {thread.title || `Thread #${thread.id}`}
              </option>
            ))}
          </select>
          {/* Thread creation and deletion logic can be re-enabled if needed, but is omitted for now */}
        </div>
      </div>
      <div className="flex-1">
        {selectedThreadId ? (
          <div className="flex flex-col h-full">
            {projectId !== null && (
              <ThreadParticipants threadId={selectedThreadId} projectId={projectId} />
            )}
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