"use client"

import React from "react"
import { TaskOverviewAttachmentsPreview } from "./task-overview-attachments-preview"
import { TaskOverviewReviewsPreview } from "./task-overview-reviews-preview"
import { TaskOverviewUpdatesComments } from "./task-overview-updates-comments"
import { TaskOverviewRelatedIdeas, type TaskRelatedIdeaPreviewRow } from "./task-overview-related-ideas"
import { TaskOverviewPreviewSection } from "./task-overview-preview-section"
import { TaskSeoAndAiSeoTab } from "../../../features/tasks/components/task-seo-and-ai-seo-tab"
import { ArtifactWorkspace } from "../../../features/artifacts/ArtifactWorkspace"
import type { ReviewData } from "@/lib/types/tasks"
import type { TaskCommentsPanelProps } from "../comments-section/task-comments-panel"
import type { AiActiveFieldContext } from "../../../features/ai-chat/active-field-context"

type TaskOverviewPreviewsProps = {
  taskId: number
  projectId?: number
  languageId?: number
  canLoad?: boolean
  readOnly?: boolean
  bootstrapAttachments: unknown[]
  reviewData?: ReviewData | null
  preferredChannelId: number | null
  onNavigateTab: (
    tab: "attachments" | "reviews" | "activity" | "comments" | "artifacts" | "seo",
  ) => void
  commentsPanelProps: TaskCommentsPanelProps
  relatedIdeas?: TaskRelatedIdeaPreviewRow[]
  isRelatedIdeasLoading?: boolean
  isRelatedIdeasRefreshing?: boolean
  ideaActionById?: Record<string, "accepted" | "dismissed" | null>
  contentTypeLabelById?: Map<string, string>
  onDismissRelatedIdea?: (ideaId: string) => void
  onAcceptRelatedIdea?: (idea: TaskRelatedIdeaPreviewRow) => void
  onRefreshRelatedIdeas?: () => void
  /** Kept optional for call-site compatibility; unused after overview artifact cards. */
  onActiveFieldChange?: (context: AiActiveFieldContext) => void
  onArtifactTextSelectForComment?: (selection: {
    artifactId: string
    quote: string
  } | null) => void
  seedSeo?: {
    primaryKeyword?: string | null
    secondaryKeywords?: string | string[] | null
    updatedAt?: string | null
    languageCode?: string | null
    languageName?: string | null
  } | null
}

export function TaskOverviewPreviews({
  taskId,
  projectId,
  languageId,
  canLoad = true,
  readOnly = false,
  bootstrapAttachments,
  reviewData,
  preferredChannelId,
  onNavigateTab,
  commentsPanelProps,
  relatedIdeas = [],
  isRelatedIdeasLoading = false,
  isRelatedIdeasRefreshing = false,
  ideaActionById,
  contentTypeLabelById,
  onDismissRelatedIdea,
  onAcceptRelatedIdea,
  onRefreshRelatedIdeas,
  onArtifactTextSelectForComment,
  seedSeo = null,
}: TaskOverviewPreviewsProps) {
  return (
    <section className="px-4 pb-0">
      {onDismissRelatedIdea && onAcceptRelatedIdea ? (
        <TaskOverviewRelatedIdeas
          ideas={relatedIdeas}
          isLoading={isRelatedIdeasLoading}
          isRefreshing={isRelatedIdeasRefreshing}
          ideaActionById={ideaActionById}
          contentTypeLabelById={contentTypeLabelById}
          onDismiss={onDismissRelatedIdea}
          onAccept={onAcceptRelatedIdea}
          onRefresh={onRefreshRelatedIdeas}
          active
        />
      ) : null}
      {canLoad ? (
        <TaskOverviewPreviewSection
          title="SEO and AI SEO"
          onViewAll={() => onNavigateTab("seo")}
          active
        >
          <TaskSeoAndAiSeoTab
            taskId={taskId}
            embedded
            readOnly={readOnly}
            seedSeo={seedSeo}
          />
        </TaskOverviewPreviewSection>
      ) : null}
      {canLoad ? (
        <TaskOverviewPreviewSection
          title="Artifacts"
          onViewAll={() => onNavigateTab("artifacts")}
          active
        >
          <div className="min-h-0">
            <ArtifactWorkspace
              taskId={taskId}
              projectId={projectId ?? null}
              defaultChannelId={preferredChannelId}
              defaultLanguageId={languageId ?? null}
              layout="stack"
              hideHeading
              onArtifactTextSelectForComment={onArtifactTextSelectForComment}
            />
          </div>
        </TaskOverviewPreviewSection>
      ) : null}
      <TaskOverviewAttachmentsPreview
        taskId={taskId}
        bootstrapAttachments={bootstrapAttachments}
        onViewAll={() => onNavigateTab("attachments")}
        active
      />
      <TaskOverviewReviewsPreview
        taskId={taskId}
        reviewData={reviewData}
        onViewAll={() => onNavigateTab("reviews")}
        active
      />
      <TaskOverviewUpdatesComments
        taskId={taskId}
        commentsPanelProps={commentsPanelProps}
        onViewAllActivity={() => onNavigateTab("activity")}
        onViewAllComments={() => onNavigateTab("comments")}
        active
      />
    </section>
  )
}
