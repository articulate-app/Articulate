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
  pendingParticipants?: any[]
  setPendingParticipants?: (p: any[]) => void
  removedParticipants?: any[]
  setRemovedParticipants?: (p: any[]) => void
  /**
   * New props: threads, latestMentions, activeThreadId (from Edge Function)
   */
  threads?: Thread[]
  latestMentions?: Record<number, Mention | null>
  activeThreadId?: number | null
  handleDeleteThread?: (threadId: number) => void
}

export function StickyAddCommentInput({ taskId, onCommentAdded, pendingParticipants = [], setPendingParticipants, removedParticipants = [], setRemovedParticipants, threads = [], latestMentions = {}, activeThreadId: propActiveThreadId = null, handleDeleteThread }: StickyAddCommentInputProps) {
  // Remove all local fetching state
  // const [threads, setThreads] = useState<Thread[]>([])
  // const [latestMentions, setLatestMentions] = useState<Record<number, Mention | null>>({})
  // const [activeThreadId, setActiveThreadId] = useState<number | null>(null)
  // const [isLoading, setIsLoading] = useState(true)

  // Use propActiveThreadId as the active thread
  const activeThreadId = propActiveThreadId;

  // When a new comment is added, call parent handler
  const handleCommentAdded = useCallback(() => {
    onCommentAdded?.()
  }, [onCommentAdded])

  // When switching threads (if needed)
  // const handleSelectThread = (threadId: number) => {
  //   setActiveThreadId(threadId)
  // }

  // Remove isLoading logic
  if (!activeThreadId) {
    // Pending mode: show chat input, then pendingParticipants avatars and add/search UI below
    return (
      <div className="sticky bottom-0 left-0 right-0 bg-white border-t z-20" style={{ boxShadow: "0 -2px 8px rgba(0,0,0,0.03)" }}>
        <AddCommentInput
          key={String(activeThreadId)}
          taskId={taskId}
          threadId={activeThreadId}
          onCommentAdded={handleCommentAdded}
          onThreadCreated={(thread) => {
            // Parent should update activeThreadId prop
          }}
          pendingParticipants={pendingParticipants}
          setPendingParticipants={setPendingParticipants}
        />
      </div>
    )
  }

  return (
    <div className="sticky bottom-0 left-0 right-0 bg-white border-t z-20" style={{ boxShadow: "0 -2px 8px rgba(0,0,0,0.03)" }}>
      <AddCommentInput
        key={String(activeThreadId)}
        taskId={taskId}
        threadId={activeThreadId}
        onCommentAdded={handleCommentAdded}
        onThreadCreated={(thread) => {
          // Parent should update activeThreadId prop
        }}
      />
      
    </div>
  )
} 