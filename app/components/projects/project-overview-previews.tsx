"use client"

import { useState } from "react"
import { TaskOverviewPreviewSection } from "../tasks/task-overview-preview-section"
import { ProjectAnalyticsTab } from "./ProjectAnalyticsTab"
import { ProjectAiVisibilityTab } from "./ProjectAiVisibilityTab"
import { ProjectKeywordTrackingTab } from "./ProjectKeywordTrackingTab"
import { ProjectCompetitorsTab } from "./ProjectCompetitorsTab"
import { ProjectSuggestionsTab } from "./ProjectSuggestionsTab"
import { FilesTab } from "./FilesTab"
import { ProjectOverviewUpdatesComments } from "./project-overview-updates-comments"
import { ProjectSearchOverviewSection } from "./project-search-overview-section"
import { ArtifactWorkspace } from "../../../features/artifacts/ArtifactWorkspace"

export type ProjectOverviewTab =
  | "activity"
  | "comments"
  | "analytics"
  | "seo-search"
  | "ai-visibility"
  | "keywords"
  | "competitors"
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
  const [organicReady, setOrganicReady] = useState(false)
  const [analyticsReady, setAnalyticsReady] = useState(false)
  const [aiVisibilityReady, setAiVisibilityReady] = useState(false)
  const [keywordsReady, setKeywordsReady] = useState(false)
  const [competitorsReady, setCompetitorsReady] = useState(false)
  const [filesReady, setFilesReady] = useState(false)
  const [suggestionsReady, setSuggestionsReady] = useState(false)

  return (
    <div className="min-w-0 space-y-0">
      <TaskOverviewPreviewSection
        title="Organic search"
        onViewAll={() => onNavigateTab("seo-search")}
        onVisible={() => setOrganicReady(true)}
      >
        {organicReady ? (
          <ProjectSearchOverviewSection
            projectId={projectId}
            variant="preview"
            onOpenSeoTab={() => onNavigateTab("seo-search")}
            onOpenIntegrations={() => onNavigateTab("seo-search")}
          />
        ) : null}
      </TaskOverviewPreviewSection>

      <TaskOverviewPreviewSection
        title="Analytics"
        onViewAll={() => onNavigateTab("analytics")}
        active={organicReady}
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
        title="Competition"
        onViewAll={() => onNavigateTab("competitors")}
        active={keywordsReady}
        onVisible={() => setCompetitorsReady(true)}
      >
        {competitorsReady ? (
          <ProjectCompetitorsTab projectId={projectId} variant="preview" />
        ) : null}
      </TaskOverviewPreviewSection>

      <TaskOverviewPreviewSection
        title="Files"
        onViewAll={() => onNavigateTab("files")}
        active={competitorsReady}
        onVisible={() => setFilesReady(true)}
      >
        {filesReady ? <FilesTab projectId={projectId} hideTitle /> : null}
      </TaskOverviewPreviewSection>

      <TaskOverviewPreviewSection
        title="Suggestions"
        onViewAll={() => onNavigateTab("suggestions")}
        active={filesReady}
        onVisible={() => setSuggestionsReady(true)}
      >
        {suggestionsReady ? (
          <ProjectSuggestionsTab projectId={projectId} variant="preview" />
        ) : null}
      </TaskOverviewPreviewSection>

      <TaskOverviewPreviewSection
        title="Artifacts"
        outputsDropzone
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
