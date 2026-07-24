"use client"

import { useState } from "react"
import { TaskOverviewPreviewSection } from "../tasks/task-overview-preview-section"
import { ProjectAnalyticsTab } from "./ProjectAnalyticsTab"
import { ProjectAiVisibilityTab } from "./ProjectAiVisibilityTab"
import { ProjectAiUsageSection } from "./project-ai-usage-section"
import { ProjectKeywordTrackingTab } from "./ProjectKeywordTrackingTab"
import { ProjectOverviewUpdatesComments } from "./project-overview-updates-comments"

export type ProjectOverviewTab =
  | "activity"
  | "comments"
  | "analytics"
  | "ai-visibility"
  | "ai-usage"
  | "keywords"
  | "tasks"

type ProjectOverviewPreviewsProps = {
  projectId: number
  onNavigateTab: (tab: ProjectOverviewTab) => void
}

/**
 * Mount heavy chart previews one-at-a-time as they enter the viewport.
 * Mounting Analytics + AI Visibility + Keywords together (each with Radix
 * date pickers / selects) has triggered compose-refs update loops.
 */
export function ProjectOverviewPreviews({ projectId, onNavigateTab }: ProjectOverviewPreviewsProps) {
  const [analyticsReady, setAnalyticsReady] = useState(false)
  const [aiVisibilityReady, setAiVisibilityReady] = useState(false)
  const [keywordsReady, setKeywordsReady] = useState(false)
  const [aiUsageReady, setAiUsageReady] = useState(false)

  return (
    <div className="min-w-0 space-y-0">
      <TaskOverviewPreviewSection
        title="Analytics"
        onViewAll={() => onNavigateTab("analytics")}
        onVisible={() => setAnalyticsReady(true)}
      >
        {analyticsReady ? (
          <ProjectAnalyticsTab projectId={projectId} variant="preview" />
        ) : null}
      </TaskOverviewPreviewSection>

      <TaskOverviewPreviewSection
        title="AI Visibility"
        onViewAll={() => onNavigateTab("ai-visibility")}
        active={analyticsReady}
        onVisible={() => setAiVisibilityReady(true)}
      >
        {aiVisibilityReady ? (
          <ProjectAiVisibilityTab projectId={projectId} variant="preview" />
        ) : null}
      </TaskOverviewPreviewSection>

      <TaskOverviewPreviewSection
        title="Keyword Tracking"
        onViewAll={() => onNavigateTab("keywords")}
        active={aiVisibilityReady}
        onVisible={() => setKeywordsReady(true)}
      >
        {keywordsReady ? (
          <ProjectKeywordTrackingTab projectId={projectId} variant="preview" />
        ) : null}
      </TaskOverviewPreviewSection>

      <TaskOverviewPreviewSection
        title="AI usage"
        onViewAll={() => onNavigateTab("ai-usage")}
        active={keywordsReady}
        onVisible={() => setAiUsageReady(true)}
      >
        {aiUsageReady ? <ProjectAiUsageSection projectId={projectId} /> : null}
      </TaskOverviewPreviewSection>

      <ProjectOverviewUpdatesComments
        projectId={projectId}
        onViewAllActivity={() => onNavigateTab("activity")}
        onViewAllComments={() => onNavigateTab("comments")}
      />
    </div>
  )
}
