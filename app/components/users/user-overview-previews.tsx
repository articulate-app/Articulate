"use client"

import { useCallback, useState, type ReactNode } from "react"
import { TaskOverviewPreviewSection } from "../tasks/task-overview-preview-section"
import { UserOccupationSection } from "./user-occupation-section"
import { UserSharedCommentsTab } from "./user-shared-comments-tab"
import { UserReviewsSection } from "./user-reviews-section"
import { UserProjectsListSection } from "./user-projects-list-section"
import type { UserTask } from "../../lib/services/users"

type UserOverviewPreviewsProps = {
  userId: number
  onNavigateComments: () => void
  onNavigateReviews: () => void
  onNavigateOccupation: () => void
  onNavigateProjects: () => void
  onOpenProject?: (projectId: number) => void
  onOpenTaskKeepingDetail?: (task: UserTask) => void
}

const SECTION_CLASS = "py-8"

/**
 * Mount heavy previews one-at-a-time as they enter the viewport
 * (same lazy chain pattern as project overview).
 */
export function UserOverviewPreviews({
  userId,
  onNavigateComments,
  onNavigateReviews,
  onNavigateOccupation,
  onNavigateProjects,
  onOpenProject,
  onOpenTaskKeepingDetail,
}: UserOverviewPreviewsProps) {
  const [occupationReady, setOccupationReady] = useState(false)
  const [projectsReady, setProjectsReady] = useState(false)
  const [reviewsReady, setReviewsReady] = useState(false)
  const [commentsReady, setCommentsReady] = useState(false)
  const [commentsHeaderActions, setCommentsHeaderActions] = useState<ReactNode>(null)

  const handleCommentsHeaderActions = useCallback((actions: ReactNode | null) => {
    setCommentsHeaderActions((prev) => (prev === actions ? prev : actions))
  }, [])

  return (
    <div className="min-w-0 space-y-0">
      <TaskOverviewPreviewSection
        title="Occupation"
        onViewAll={onNavigateOccupation}
        active
        onVisible={() => setOccupationReady(true)}
        className={SECTION_CLASS}
      >
        {occupationReady ? <UserOccupationSection userId={userId} compact /> : null}
      </TaskOverviewPreviewSection>

      <UserProjectsListSection
        userId={userId}
        asPreview
        onViewAll={onNavigateProjects}
        onOpenProject={onOpenProject}
        active={occupationReady}
        onVisible={() => setProjectsReady(true)}
      />

      <UserReviewsSection
        userId={userId}
        asPreview
        onViewAll={onNavigateReviews}
        active={projectsReady}
        onVisible={() => setReviewsReady(true)}
      />

      <TaskOverviewPreviewSection
        title="Comments"
        onViewAll={onNavigateComments}
        active={reviewsReady}
        onVisible={() => setCommentsReady(true)}
        headerActions={commentsHeaderActions}
        className={SECTION_CLASS}
      >
        {commentsReady ? (
          <UserSharedCommentsTab
            profileUserId={userId}
            isActive
            variant="preview"
            onOpenTaskKeepingDetail={onOpenTaskKeepingDetail}
            onHeaderActionsChange={handleCommentsHeaderActions}
          />
        ) : null}
      </TaskOverviewPreviewSection>
    </div>
  )
}
