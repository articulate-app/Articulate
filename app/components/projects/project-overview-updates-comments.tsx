"use client"

import { useCallback, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { TaskOverviewPreviewSection } from "../tasks/task-overview-preview-section"
import { useProjectActivityFeedInfinite } from "../../hooks/use-project-activity-feed-infinite"
import { CommentsTab } from "./CommentsTab"

type OverviewFeedFilter = "all" | "updates" | "comments"

const ACTIVITY_PAGE_SIZE = 40
const PREVIEW_MAX_ROWS = 5

const FEED_FILTER_OPTIONS: { value: OverviewFeedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "updates", label: "Updates" },
  { value: "comments", label: "Comments" },
]

type ProjectOverviewUpdatesCommentsProps = {
  projectId: number
  onViewAllActivity: () => void
  onViewAllComments: () => void
}

export function ProjectOverviewUpdatesComments({
  projectId,
  onViewAllActivity,
  onViewAllComments,
}: ProjectOverviewUpdatesCommentsProps) {
  const [feedFilter, setFeedFilter] = useState<OverviewFeedFilter>("all")
  const [headerActions, setHeaderActions] = useState<ReactNode>(null)

  const handleHeaderActionsChange = useCallback((actions: ReactNode | null) => {
    setHeaderActions(actions)
  }, [])

  const {
    logs: activityLogs,
    isLoading: isActivityLoading,
    isFetchingNextPage: isLoadingMoreActivity,
    hasMore: hasMoreActivity,
    error: activityError,
    fetchNextPage: fetchNextActivityPage,
  } = useProjectActivityFeedInfinite({
    projectId,
    pageSize: ACTIVITY_PAGE_SIZE,
    sort: { field: "created_at", direction: "desc" },
    filters: null,
  })

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

  return (
    <TaskOverviewPreviewSection
      title="Activity"
      onViewAll={feedFilter === "comments" ? onViewAllComments : onViewAllActivity}
      viewAllLabel={feedFilter === "comments" ? "All comments" : "View all"}
      belowTitle={filterPills}
      headerActions={headerActions}
      isLoading={isActivityLoading && activityLogs.length === 0 && feedFilter !== "comments"}
      isError={!!activityError && feedFilter !== "comments"}
    >
      <CommentsTab
        projectId={projectId}
        variant="preview"
        previewMaxRows={PREVIEW_MAX_ROWS}
        onHeaderActionsChange={handleHeaderActionsChange}
        activityLogs={activityLogs}
        feedFilter={feedFilter}
        onLoadMoreActivity={fetchNextActivityPage}
        hasMoreActivity={hasMoreActivity}
        isLoadingMoreActivity={isLoadingMoreActivity}
      />
    </TaskOverviewPreviewSection>
  )
}
