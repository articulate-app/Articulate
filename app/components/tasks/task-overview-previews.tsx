"use client"

import { TaskOverviewAttachmentsPreview } from "./task-overview-attachments-preview"
import { TaskOverviewReviewsPreview } from "./task-overview-reviews-preview"
import { TaskOverviewUpdatesComments } from "./task-overview-updates-comments"
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
  /** @deprecated Tabs removed from task details; kept optional for call-site compat. */
  onNavigateTab?: (
    tab: "attachments" | "reviews" | "activity" | "comments" | "artifacts" | "seo",
  ) => void
  commentsPanelProps: TaskCommentsPanelProps
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
  commentsPanelProps,
  onArtifactTextSelectForComment,
  seedSeo = null,
}: TaskOverviewPreviewsProps) {
  return (
    <>
      <TaskOverviewPreviewSection
        title="Artifacts"
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
      <TaskOverviewPreviewSection
        title="SEO and AI SEO"
        active
        isLoading={!canLoad}
      >
        {canLoad ? (
          <TaskSeoAndAiSeoTab
            taskId={taskId}
            embedded
            readOnly={readOnly}
            seedSeo={seedSeo}
          />
        ) : null}
      </TaskOverviewPreviewSection>
      <TaskOverviewAttachmentsPreview
        taskId={taskId}
        bootstrapAttachments={bootstrapAttachments}
        active
      />
      <TaskOverviewReviewsPreview
        taskId={taskId}
        reviewData={reviewData}
        active
      />
      <TaskOverviewUpdatesComments
        taskId={taskId}
        commentsPanelProps={commentsPanelProps}
        active
      />
    </>
  )
}
