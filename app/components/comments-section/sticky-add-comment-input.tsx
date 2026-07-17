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
  replyTo?: { id: number; author?: string; preview: string } | null
  onClearReply?: () => void
  pendingOutputAnchor?: {
    taskComponentOutputId: string
    attachmentId: string | null
    anchorType: "image_point"
    anchorX: number
    anchorY: number
    anchorData?: unknown
  } | null
  onConsumePendingOutputAnchor?: () => void
  focusComposerToken?: number
  /** Flush layout for task comments panel (no side padding). */
  embedded?: boolean
}

export function StickyAddCommentInput({ taskId, onCommentAdded, pendingParticipants = [], setPendingParticipants, removedParticipants = [], setRemovedParticipants, threads = [], latestMentions = {}, activeThreadId: propActiveThreadId = null, handleDeleteThread, replyTo, onClearReply, pendingOutputAnchor = null, onConsumePendingOutputAnchor, focusComposerToken = 0, embedded = false }: StickyAddCommentInputProps) {
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
      <div className="bg-white">
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
          replyTo={replyTo}
          onClearReply={onClearReply}
          pendingOutputAnchor={pendingOutputAnchor}
          onConsumePendingOutputAnchor={onConsumePendingOutputAnchor}
          focusComposerToken={focusComposerToken}
          embedded={embedded}
        />
      </div>
    )
  }

  return (
    <div className="bg-white">
      <AddCommentInput
        key={String(activeThreadId)}
        taskId={taskId}
        threadId={activeThreadId}
        onCommentAdded={handleCommentAdded}
        onThreadCreated={(thread) => {
          // Parent should update activeThreadId prop
        }}
        replyTo={replyTo}
        onClearReply={onClearReply}
        pendingOutputAnchor={pendingOutputAnchor}
        onConsumePendingOutputAnchor={onConsumePendingOutputAnchor}
        focusComposerToken={focusComposerToken}
        embedded={embedded}
      />
      
    </div>
  )
} 