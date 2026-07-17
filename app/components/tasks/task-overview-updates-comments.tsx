"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "../ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { IconTooltip } from "../ui/icon-tooltip"
import {
  TaskCommentsFooterPart,
  TaskCommentsHeaderRow,
  TaskCommentsInputPart,
  TaskCommentsListPart,
  type TaskCommentsPanelProps,
} from "../comments-section/task-comments-panel"
import { TaskOverviewPreviewSection } from "./task-overview-preview-section"
import {
  OVERVIEW_FEED_SORT_OPTIONS,
  getOverviewFeedSortIcon,
  getOverviewFeedSortLabel,
  type OverviewFeedSort,
} from "./overview-feed-sort"

const TaskActivityTimeline = dynamic(
  () => import("../task-activity/task-activity-timeline").then((m) => m.TaskActivityTimeline),
  { ssr: false },
)

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
  const [sort, setSort] = useState<OverviewFeedSort>("newest")
  const [sortOpen, setSortOpen] = useState(false)
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
    hideStatusFilter: true,
    hideThreadToolbar: true,
    clientSort: sort,
  }

  const showCollapse =
    isExpanded
    && (commentsPanelProps.isThreadView || (commentsPanelProps.threadsList?.length ?? 0) > 5)

  const SortIcon = getOverviewFeedSortIcon(sort)

  const filterPills = (
    <div className="flex flex-wrap items-center gap-1.5">
      {FEED_FILTER_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setFeedFilter(option.value)}
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
    </div>
  )

  const headerActions = (
    <div className="flex items-center gap-1">
      <Popover open={sortOpen} onOpenChange={setSortOpen}>
        <IconTooltip label={`Sort: ${getOverviewFeedSortLabel(sort)}`}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-gray-500"
              aria-label={`Sort: ${getOverviewFeedSortLabel(sort)}`}
            >
              <SortIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </IconTooltip>
        <PopoverContent align="end" className="w-40 p-1">
          {OVERVIEW_FEED_SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs hover:bg-gray-50",
                sort === option.value && "bg-gray-50 font-medium",
              )}
              onClick={() => {
                setSort(option.value)
                setSortOpen(false)
              }}
            >
              <span>{option.label}</span>
              {sort === option.value ? <Check className="h-3.5 w-3.5 text-gray-600" /> : null}
            </button>
          ))}
        </PopoverContent>
      </Popover>
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
      />
    </div>
  )

  const previewLimit = isExpanded ? 20 : 8

  return (
    <TaskOverviewPreviewSection
      title="Activity"
      onViewAll={feedFilter === "comments" ? onViewAllComments : onViewAllActivity}
      viewAllLabel={feedFilter === "comments" ? "All comments" : "View all"}
      active={active}
      onVisible={handleVisible}
      belowTitle={filterPills}
      headerActions={headerActions}
    >
      <div className="flex flex-col gap-2">
        <div
          className={cn(
            "overflow-y-auto",
            isExpanded ? "max-h-[min(640px,70vh)]" : "max-h-[min(400px,48vh)]",
          )}
        >
          {feedFilter === "all" ? (
            <>
              <TaskActivityTimeline
                taskId={taskId}
                compact
                previewLimit={Math.max(4, Math.floor(previewLimit / 2))}
                clientSort={sort}
              />
              <div className="my-1 border-t border-gray-200" />
              <TaskCommentsListPart {...embedPanelProps} focusOnly />
            </>
          ) : feedFilter === "updates" ? (
            <TaskActivityTimeline
              taskId={taskId}
              compact
              previewLimit={previewLimit}
              clientSort={sort}
            />
          ) : (
            <TaskCommentsListPart {...embedPanelProps} focusOnly />
          )}
        </div>
        {showCollapse ? (
          <button
            type="button"
            className="self-start text-xs text-gray-500 hover:text-gray-700"
            onClick={() => setIsExpanded(false)}
          >
            Show less
          </button>
        ) : (feedFilter === "updates" || feedFilter === "all") && !isExpanded ? (
          <button
            type="button"
            className="self-start text-xs text-gray-500 hover:text-gray-700"
            onClick={() => setIsExpanded(true)}
          >
            Show more
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
