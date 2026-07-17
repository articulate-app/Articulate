"use client"

import React from "react"
import { TaskContentTab } from "../../../features/tasks/components/TaskContentTab"
import { TaskOverviewAttachmentsPreview } from "./task-overview-attachments-preview"
import { TaskOverviewReviewsPreview } from "./task-overview-reviews-preview"
import { TaskOverviewUpdatesComments } from "./task-overview-updates-comments"
import { TaskOverviewRelatedIdeas, type TaskRelatedIdeaPreviewRow } from "./task-overview-related-ideas"
import type { ReviewData } from "@/lib/types/tasks"
import type { TaskCommentsPanelProps } from "../comments-section/task-comments-panel"
import type { AiActiveFieldContext } from "../../../features/ai-chat/active-field-context"

type TaskOverviewPreviewsProps = {
  taskId: number
  projectId?: number
  contentTypeId?: number
  languageId?: number
  taskTitle?: string
  contentTypeTitle?: string
  taskMetaTitle?: string
  taskMetaDescription?: string
  taskKeyword?: string
  taskSlug?: string
  projectLogoUrl?: string | null
  taskSourceUrls?: string[] | string | null
  taskBuildInstructions?: string
  canLoad?: boolean
  bootstrapTaskChannels?: unknown
  bootstrapAttachments: unknown[]
  reviewData?: ReviewData | null
  preferredChannelId: number | null
  onChannelChange: (channelId: number | null) => void
  onActiveFieldChange?: (context: AiActiveFieldContext) => void
  onNavigateTab: (tab: "content" | "attachments" | "reviews" | "activity" | "comments") => void
  commentsPanelProps: TaskCommentsPanelProps
  accessToken?: string | null
  relatedIdeas?: TaskRelatedIdeaPreviewRow[]
  isRelatedIdeasLoading?: boolean
  isRelatedIdeasRefreshing?: boolean
  ideaActionById?: Record<string, "accepted" | "dismissed" | null>
  contentTypeLabelById?: Map<string, string>
  onDismissRelatedIdea?: (ideaId: string) => void
  onAcceptRelatedIdea?: (idea: TaskRelatedIdeaPreviewRow) => void
  onRefreshRelatedIdeas?: () => void
}

export function TaskOverviewPreviews({
  taskId,
  projectId,
  contentTypeId,
  languageId,
  taskTitle,
  contentTypeTitle,
  taskMetaTitle,
  taskMetaDescription,
  taskKeyword,
  taskSlug,
  projectLogoUrl,
  taskSourceUrls,
  taskBuildInstructions,
  canLoad = true,
  bootstrapTaskChannels,
  bootstrapAttachments,
  reviewData,
  preferredChannelId,
  onChannelChange,
  onActiveFieldChange,
  onNavigateTab,
  commentsPanelProps,
  accessToken,
  relatedIdeas = [],
  isRelatedIdeasLoading = false,
  isRelatedIdeasRefreshing = false,
  ideaActionById,
  contentTypeLabelById,
  onDismissRelatedIdea,
  onAcceptRelatedIdea,
  onRefreshRelatedIdeas,
}: TaskOverviewPreviewsProps) {
  return (
    <section className="px-4 pb-0">
      {canLoad ? (
        <div className="mb-4 min-h-0">
          <TaskContentTab
            taskId={taskId}
            projectId={projectId}
            contentTypeId={contentTypeId}
            languageId={languageId}
            taskTitle={taskTitle}
            contentTypeTitle={contentTypeTitle}
            taskMetaTitle={taskMetaTitle}
            taskMetaDescription={taskMetaDescription}
            taskKeyword={taskKeyword}
            taskSlug={taskSlug}
            projectLogoUrl={projectLogoUrl}
            taskSourceUrls={taskSourceUrls}
            canLoad={canLoad}
            onChannelChange={onChannelChange}
            onActiveFieldChange={onActiveFieldChange}
            taskBuildInstructions={taskBuildInstructions}
            skipInitialTaskChannelsFetch
            bootstrapTaskChannels={bootstrapTaskChannels}
            accessToken={accessToken}
            preferredChannelId={preferredChannelId}
          />
        </div>
      ) : null}
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
