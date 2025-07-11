import React, { useEffect, useState, useCallback } from "react"
import { AddCommentInput } from "./add-comment-input"
import { ThreadParticipantsInline } from "./thread-participants-inline"
import { ThreadSwitcherPopover } from "./thread-switcher-popover"
import type { Thread } from '../../types/task'

interface Mention {
  id: number
  thread_id: number
  comment: string | null
  created_at: string
}

interface StickyAddCommentInputProps {
  taskId: number
  onCommentAdded?: () => void
}

export function StickyAddCommentInput({ taskId, onCommentAdded }: StickyAddCommentInputProps) {
  const [threads, setThreads] = useState<Thread[]>([])
  const [latestMentions, setLatestMentions] = useState<Record<number, Mention | null>>({})
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch all threads for the task
  useEffect(() => {
    async function fetchThreadsAndMentions() {
      setIsLoading(true)
      try {
        const supabase = (await import("@supabase/auth-helpers-nextjs")).createClientComponentClient()
        const { data: threads } = await supabase
          .from('threads')
          .select('id, title, created_at, task_id')
          .eq('task_id', taskId)
        setThreads((threads || []).map((t: any) => ({
          id: t.id,
          title: t.title,
          created_at: t.created_at,
          task_id: t.task_id
        })))
        if (!threads || threads.length === 0) {
          setActiveThreadId(null)
          setLatestMentions({})
          return
        }
        // Fetch latest mentions for all threads
        const threadIds = threads.map((t: any) => t.id)
        const { data: mentions } = await supabase
          .from('mentions')
          .select('id, thread_id, comment, created_at')
          .in('thread_id', threadIds)
          .order('created_at', { ascending: false })
        // Map threadId -> latest mention
        const map: Record<number, Mention | null> = {}
        for (const threadId of threadIds) {
          map[threadId] = (mentions || []).find((m: any) => m.thread_id === threadId) || null
        }
        setLatestMentions(map)
        // Pick the thread with the most recent mention (or most recent created_at)
        const sorted = [...threads].sort((a, b) => {
          const aMention = map[a.id]?.created_at || a.created_at
          const bMention = map[b.id]?.created_at || b.created_at
          return new Date(bMention).getTime() - new Date(aMention).getTime()
        })
        setActiveThreadId(sorted[0]?.id ?? null)
      } finally {
        setIsLoading(false)
      }
    }
    fetchThreadsAndMentions()
  }, [taskId])

  // When a new comment is added, reload threads/mentions
  const handleCommentAdded = useCallback(() => {
    onCommentAdded?.()
    // Refetch threads and mentions
    setIsLoading(true)
    setTimeout(() => setIsLoading(false), 500) // trigger useEffect
  }, [onCommentAdded])

  // When switching threads
  const handleSelectThread = (threadId: number) => {
    setActiveThreadId(threadId)
  }

  if (isLoading) return null
  if (!activeThreadId) return null

  return (
    <div className="sticky bottom-0 left-0 right-0 bg-white border-t z-20" style={{ boxShadow: "0 -2px 8px rgba(0,0,0,0.03)" }}>
      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
        <ThreadParticipantsInline threadId={activeThreadId} />
        <ThreadSwitcherPopover
          taskId={taskId}
          threads={threads}
          activeThreadId={activeThreadId}
          onSelectThread={handleSelectThread}
        />
      </div>
      <AddCommentInput
        taskId={taskId}
        threadId={activeThreadId}
        onCommentAdded={handleCommentAdded}
        onThreadCreated={setActiveThreadId}
      />
    </div>
  )
} 