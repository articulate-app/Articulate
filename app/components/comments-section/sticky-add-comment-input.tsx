import React, { useCallback } from "react"
import { AddCommentInput } from "./add-comment-input"
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
  onThreadCreated?: (thread: { id: number | string; isOptimistic?: boolean }) => void
  /** Collapse minimal composer after blur when empty */
  onCollapseRequest?: () => void
}

export function StickyAddCommentInput({
  taskId,
  onCommentAdded,
  pendingParticipants = [],
  setPendingParticipants,
  activeThreadId: propActiveThreadId = null,
  replyTo,
  onClearReply,
  pendingOutputAnchor = null,
  onConsumePendingOutputAnchor,
  focusComposerToken = 0,
  embedded = false,
  onThreadCreated,
  onCollapseRequest,
}: StickyAddCommentInputProps) {
  const activeThreadId = propActiveThreadId

  const handleCommentAdded = useCallback(() => {
    onCommentAdded?.()
  }, [onCommentAdded])

  return (
    <div className="bg-white">
      <AddCommentInput
        key={String(activeThreadId)}
        taskId={taskId}
        threadId={activeThreadId}
        onCommentAdded={handleCommentAdded}
        onThreadCreated={onThreadCreated}
        pendingParticipants={pendingParticipants}
        setPendingParticipants={setPendingParticipants}
        replyTo={replyTo}
        onClearReply={onClearReply}
        pendingOutputAnchor={pendingOutputAnchor}
        onConsumePendingOutputAnchor={onConsumePendingOutputAnchor}
        focusComposerToken={focusComposerToken}
        embedded={embedded}
        onCollapseRequest={onCollapseRequest}
      />
    </div>
  )
}
