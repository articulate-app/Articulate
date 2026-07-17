"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import {
  TaskCommentsFooterPart,
  TaskCommentsInputPart,
  TaskCommentsListPart,
  type TaskCommentsPanelProps,
} from "../comments-section/task-comments-panel"
import { TaskOverviewPreviewSection } from "./task-overview-preview-section"

type TaskOverviewCommentsPreviewProps = {
  commentsPanelProps: TaskCommentsPanelProps
  onViewAll: () => void
  active?: boolean
}

export function TaskOverviewCommentsPreview({
  commentsPanelProps,
  onViewAll,
  active = true,
}: TaskOverviewCommentsPreviewProps) {
  const taskIdNum = commentsPanelProps.taskIdNum
  const loadThreadHistory = commentsPanelProps.handleViewThreadHistory
  const previewThreadFetchKeyRef = useRef<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  const handleVisible = useCallback(() => {
    if (!taskIdNum) return
    const key = String(taskIdNum)
    if (previewThreadFetchKeyRef.current === key) return
    previewThreadFetchKeyRef.current = key
    void loadThreadHistory()
  }, [taskIdNum, loadThreadHistory])

  const handleCommentAdded = useCallback(() => {
    void loadThreadHistory({ force: true })
  }, [loadThreadHistory])

  useEffect(() => {
    previewThreadFetchKeyRef.current = null
    setIsExpanded(false)
  }, [taskIdNum])

  const embedPanelProps: TaskCommentsPanelProps = {
    ...commentsPanelProps,
    embedCollapsed: !isExpanded,
    embedThreadLimit: 5,
    onEmbedExpand: () => setIsExpanded(true),
  }

  const showCollapse =
    isExpanded
    && (commentsPanelProps.isThreadView
      || (commentsPanelProps.threadsList?.length ?? 0) > 5)

  return (
    <TaskOverviewPreviewSection
      title="Comments"
      onViewAll={onViewAll}
      active={active}
      onVisible={handleVisible}
    >
      <div className="flex flex-col gap-2">
        <div
          className={cn(
            "overflow-y-auto",
            isExpanded ? "max-h-[min(640px,70vh)]" : "max-h-[min(400px,48vh)]",
          )}
        >
          <TaskCommentsListPart {...embedPanelProps} focusOnly />
        </div>
        {showCollapse ? (
          <button
            type="button"
            className="self-start text-xs text-gray-500 hover:text-gray-700"
            onClick={() => setIsExpanded(false)}
          >
            Show less
          </button>
        ) : null}
        <TaskCommentsInputPart
          {...commentsPanelProps}
          onCommentAdded={handleCommentAdded}
        />
        <TaskCommentsFooterPart {...commentsPanelProps} />
      </div>
    </TaskOverviewPreviewSection>
  )
}
