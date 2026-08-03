"use client"

import { useState } from "react"
import { TaskOverviewPreviewSection } from "../tasks/task-overview-preview-section"
import { ProjectAnalyticsTab } from "./ProjectAnalyticsTab"
import { ProjectAiVisibilityTab } from "./ProjectAiVisibilityTab"
import { ProjectKeywordTrackingTab } from "./ProjectKeywordTrackingTab"
import { ProjectSuggestionsTab } from "./ProjectSuggestionsTab"
import { ProjectOverviewUpdatesComments } from "./project-overview-updates-comments"
import { ProjectOverviewWatchers } from "./project-overview-watchers"
import { ArtifactWorkspace } from "../../../features/artifacts/ArtifactWorkspace"

export type ProjectOverviewTab =
  | "activity"
  | "comments"
  | "analytics"
  | "ai-visibility"
  | "keywords"
  | "tasks"
  | "suggestions"
  | "files"
  | "artifacts"

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
  const [suggestionsReady, setSuggestionsReady] = useState(false)

  return (
    <div className="min-w-0 space-y-0">
      <ProjectOverviewWatchers projectId={projectId} />

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
        title="Suggestions"
        onViewAll={() => onNavigateTab("suggestions")}
        active={keywordsReady}
        onVisible={() => setSuggestionsReady(true)}
      >
        {suggestionsReady ? (
          <ProjectSuggestionsTab projectId={projectId} variant="preview" />
        ) : null}
      </TaskOverviewPreviewSection>

      <TaskOverviewPreviewSection
        title="Artifacts"
        onViewAll={() => onNavigateTab("artifacts")}
        active={suggestionsReady}
      >
        <div className="min-h-0">
          <ArtifactWorkspace
            projectId={projectId}
            layout="stack"
            hideHeading
          />
        </div>
      </TaskOverviewPreviewSection>

      <ProjectOverviewUpdatesComments
        projectId={projectId}
        onViewAllActivity={() => onNavigateTab("activity")}
        onViewAllComments={() => onNavigateTab("comments")}
      />
    </div>
  )
}
