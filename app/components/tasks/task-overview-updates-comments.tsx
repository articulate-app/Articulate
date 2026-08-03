"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import {
  TaskCommentsFooterPart,
  TaskCommentsHeaderRow,
  TaskCommentsInputPart,
  type TaskCommentsPanelProps,
} from "../comments-section/task-comments-panel"
import { TaskOverviewPreviewSection } from "./task-overview-preview-section"
import { TaskOverviewMergedFeed } from "./task-overview-merged-feed"

/** Mount target for the overview comment composer (AI-pane style dock). */
export const TASK_OVERVIEW_COMMENT_DOCK_ID = "task-overview-comment-dock"

type OverviewFeedFilter = "all" | "updates" | "comments"

type TaskOverviewUpdatesCommentsProps = {
  taskId: number
  commentsPanelProps: TaskCommentsPanelProps
  onViewAllActivity: () => void
  onViewAllComments: () => void
  active?: boolean
}

const FEED_FILTER_OPTIONS: { value: OverviewFeedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "updates", label: "Updates" },
  { value: "comments", label: "Comments" },
]

export function TaskOverviewUpdatesComments({
  taskId,
  commentsPanelProps,
  onViewAllActivity,
  onViewAllComments,
  active = true,
}: TaskOverviewUpdatesCommentsProps) {
  const taskIdNum = commentsPanelProps.taskIdNum
  const loadThreadHistory = commentsPanelProps.handleViewThreadHistory
  const previewThreadFetchKeyRef = useRef<string | null>(null)
  const [feedFilter, setFeedFilter] = useState<OverviewFeedFilter>("all")
  const [filterThreadId, setFilterThreadId] = useState<number | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [composerExpanded, setComposerExpanded] = useState(false)
  const [composerDock, setComposerDock] = useState<HTMLElement | null>(null)

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

  const setSelectedThreadId = commentsPanelProps.setSelectedThreadId
  const setIsAddingThread = commentsPanelProps.setIsAddingThread

  const handleSelectThreadFilter = useCallback(
    (threadId: number | null) => {
      setFilterThreadId(threadId)
      if (threadId != null) {
        setFeedFilter("comments")
      }
      setSelectedThreadId(threadId)
      setIsAddingThread(false)
    },
    [setSelectedThreadId, setIsAddingThread],
  )

  const handleSelectThread = useCallback(
    (threadId: number) => {
      setSelectedThreadId(threadId)
      setIsAddingThread(false)
      setComposerExpanded(true)
    },
    [setSelectedThreadId, setIsAddingThread],
  )

  useEffect(() => {
    previewThreadFetchKeyRef.current = null
    setIsExpanded(false)
    setComposerExpanded(false)
    setFeedFilter("all")
    setFilterThreadId(null)
  }, [taskIdNum])

  useEffect(() => {
    if (!active || !taskIdNum) return
    previewThreadFetchKeyRef.current = String(taskIdNum)
    void loadThreadHistory()
  }, [active, taskIdNum, loadThreadHistory])

  useEffect(() => {
    if (!active) {
      setComposerDock(null)
      return
    }
    const syncDock = () => {
      setComposerDock(document.getElementById(TASK_OVERVIEW_COMMENT_DOCK_ID))
    }
    syncDock()
    const timer = window.setTimeout(syncDock, 0)
    return () => window.clearTimeout(timer)
  }, [active, taskIdNum])

  const embedPanelProps: TaskCommentsPanelProps = {
    ...commentsPanelProps,
    hideStatusFilter: true,
    hideThreadToolbar: true,
    minimalComposer: true,
    composerExpanded,
    onComposerExpandedChange: setComposerExpanded,
    filterThreadId,
    onSelectThreadFilter: handleSelectThreadFilter,
  }

  const mentionCount = Array.isArray(commentsPanelProps.allMentions)
    ? filterThreadId != null
      ? commentsPanelProps.allMentions.filter(
          (m: any) => Number(m?.thread_id) === Number(filterThreadId),
        ).length
      : commentsPanelProps.allMentions.length
    : 0

  const previewLimit = isExpanded ? 40 : 12
  const includeActivities = feedFilter === "all" || feedFilter === "updates"
  const includeComments = feedFilter === "all" || feedFilter === "comments"

  const filterPills = (
    <div className="flex flex-wrap items-center gap-1.5">
      {FEED_FILTER_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => {
            setFeedFilter(option.value)
            if (option.value !== "comments") {
              setFilterThreadId(null)
            }
          }}
          className={cn(
            "inline-flex h-7 items-center rounded-full px-2.5 text-sm",
            feedFilter === option.value
              ? "bg-gray-100 text-gray-900"
              : "border-0 text-gray-500 hover:text-gray-700",
          )}
        >
          {option.label}
        </button>
      ))}
      {filterThreadId != null && feedFilter === "comments" ? (
        <button
          type="button"
          onClick={() => handleSelectThreadFilter(null)}
          className="inline-flex h-7 items-center rounded-full bg-gray-50 px-2.5 text-xs text-gray-600 hover:bg-gray-100"
        >
          Clear thread filter
        </button>
      ) : null}
    </div>
  )

  const headerActions = (
    <TaskCommentsHeaderRow
      taskIdNum={commentsPanelProps.taskIdNum}
      threadsList={commentsPanelProps.threadsList}
      selectedThreadId={commentsPanelProps.selectedThreadId}
      setSelectedThreadId={commentsPanelProps.setSelectedThreadId}
      setIsAddingThread={commentsPanelProps.setIsAddingThread}
      handleAddThread={commentsPanelProps.handleAddThread}
      openThreadView={commentsPanelProps.openThreadView}
      isThreadListLoading={commentsPanelProps.isThreadListLoading}
      handleViewThreadHistory={commentsPanelProps.handleViewThreadHistory}
      onThreadNavigate={commentsPanelProps.onThreadNavigate}
      filterThreadId={filterThreadId}
      onSelectThreadFilter={handleSelectThreadFilter}
    />
  )

  const composer = (
    <>
      <TaskCommentsInputPart
        {...embedPanelProps}
        onCommentAdded={handleCommentAdded}
      />
      <TaskCommentsFooterPart {...commentsPanelProps} />
    </>
  )

  return (
    <>
      <TaskOverviewPreviewSection
        title="Activity"
        onViewAll={feedFilter === "comments" ? onViewAllComments : onViewAllActivity}
        viewAllLabel={feedFilter === "comments" ? "All comments" : "View all"}
        active={active}
        onVisible={handleVisible}
        belowTitle={filterPills}
        headerActions={headerActions}
      >
        <TaskOverviewMergedFeed
          taskId={taskId}
          allMentions={commentsPanelProps.allMentions}
          threadsList={commentsPanelProps.threadsList}
          filterThreadId={feedFilter === "comments" ? filterThreadId : null}
          includeActivities={includeActivities}
          includeComments={includeComments}
          previewLimit={previewLimit}
          onSelectThread={handleSelectThread}
        />
        {!isExpanded && (mentionCount > 8 || includeActivities) ? (
          <button
            type="button"
            className="mt-1 text-xs text-gray-500 hover:text-gray-700"
            onClick={() => setIsExpanded(true)}
          >
            Show more
          </button>
        ) : null}
        {isExpanded ? (
          <button
            type="button"
            className="mt-1 text-xs text-gray-500 hover:text-gray-700"
            onClick={() => setIsExpanded(false)}
          >
            Show less
          </button>
        ) : null}
      </TaskOverviewPreviewSection>
      {composerDock ? createPortal(composer, composerDock) : null}
    </>
  )
}
