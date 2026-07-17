"use client"

import { useMemo, useState } from "react"
import { subDays } from "date-fns"

import { TaskOverviewPreviewSection } from "../tasks/task-overview-preview-section"
import { DateRangePicker } from "../ui/date-range-picker"
import { ProjectAnalyticsTab } from "./ProjectAnalyticsTab"
import { ProjectAiVisibilityTab } from "./ProjectAiVisibilityTab"
import { ProjectKeywordTrackingTab } from "./ProjectKeywordTrackingTab"
import { ProjectOverviewUpdatesComments } from "./project-overview-updates-comments"
import { TaskList } from "../tasks/TaskList"
import { TasksScopeProvider } from "../../contexts/tasks-scope-context"

export type ProjectOverviewTab =
  | "activity"
  | "comments"
  | "analytics"
  | "ai-visibility"
  | "keywords"
  | "tasks"

type ProjectOverviewPreviewsProps = {
  projectId: number
  onNavigateTab: (tab: ProjectOverviewTab) => void
}

type DateRangeValue = {
  from?: Date
  to?: Date
}

function ProjectOverviewTasksEmbed({
  projectId,
  onNavigateTab,
}: {
  projectId: number
  onNavigateTab: (tab: ProjectOverviewTab) => void
}) {
  const scopeValue = useMemo(
    () => ({
      scope: { type: "project" as const, projectId },
      basePath: `/projects/${projectId}`,
      preserveQueryKeys: { tab: "overview" as const },
    }),
    [projectId],
  )

  return (
    <TasksScopeProvider value={scopeValue}>
      <div className="h-[min(420px,55vh)] min-h-[240px] overflow-hidden rounded-md border border-gray-100">
        <TaskList
          embed
          pageSize={20}
          onTaskSelect={() => onNavigateTab("tasks")}
        />
      </div>
    </TasksScopeProvider>
  )
}

export function ProjectOverviewPreviews({ projectId, onNavigateTab }: ProjectOverviewPreviewsProps) {
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => {
    const today = new Date()
    return { from: subDays(today, 6), to: today }
  })

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-end gap-2">
        <span className="text-[11px] text-gray-500">Timeframe</span>
        <div className="min-w-0 w-40">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      <TaskOverviewPreviewSection
        title="Analytics"
        onViewAll={() => onNavigateTab("analytics")}
      >
        <ProjectAnalyticsTab
          projectId={projectId}
          variant="preview"
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />
      </TaskOverviewPreviewSection>

      <TaskOverviewPreviewSection
        title="AI Visibility"
        onViewAll={() => onNavigateTab("ai-visibility")}
      >
        <ProjectAiVisibilityTab
          projectId={projectId}
          variant="preview"
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />
      </TaskOverviewPreviewSection>

      <TaskOverviewPreviewSection
        title="Keyword Tracking"
        onViewAll={() => onNavigateTab("keywords")}
      >
        <ProjectKeywordTrackingTab
          projectId={projectId}
          variant="preview"
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />
      </TaskOverviewPreviewSection>

      <TaskOverviewPreviewSection
        title="Tasks"
        onViewAll={() => onNavigateTab("tasks")}
      >
        <ProjectOverviewTasksEmbed projectId={projectId} onNavigateTab={onNavigateTab} />
      </TaskOverviewPreviewSection>

      <ProjectOverviewUpdatesComments
        projectId={projectId}
        onViewAllActivity={() => onNavigateTab("activity")}
        onViewAllComments={() => onNavigateTab("comments")}
      />
    </div>
  )
}
