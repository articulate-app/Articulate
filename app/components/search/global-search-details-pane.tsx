"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { BriefingsPage } from "../project-briefings/BriefingsPage"
import { UserDetailsPage } from "../users/UserDetailsPageTabs"
import { TeamDetailsPage } from "../teams/TeamDetailsPage"
import { CenterPaneThreadChat } from "../comments-section/center-pane-thread-chat"
import { mergeWorkspaceUrlState, replaceWorkspaceUrlState } from "../../lib/workspace-url-state"
import type { GlobalSearchDetailTarget } from "../../lib/global-search-types"

const PROJECT_ALLOWED_TABS = new Set([
  "overview",
  "billing",
  "activity",
  "comments",
  "files",
  "analytics",
  "ai-visibility",
  "keywords",
  "ai-usage",
  "briefings",
  "library",
  "tasks",
  "suggestions",
  "artifacts",
])

const USER_ALLOWED_TABS = new Set([
  "overview",
  "projects",
  "comments",
  "skills",
  "tasks",
  "preferences",
  "reviews",
  "occupation",
  // Keep this for legacy/deep links that may still exist.
  "activity",
])

const TEAM_ALLOWED_TABS = new Set(["overview", "members", "projects", "billing", "activity"])

function ThreadDetailsPane({
  threadId,
  focusedMentionId,
}: {
  threadId: string | number
  focusedMentionId?: string | number | null
  initialTitle?: string | null
  onOpenTask: (taskId: number) => void
  onOpenProject: (projectId: number) => void
  onClose?: () => void
  isDetailsFocused?: boolean
  onFocusToggle?: () => void
}) {
  const numericThreadId = Number(threadId)
  if (!Number.isFinite(numericThreadId) || numericThreadId <= 0) return null
  const numericMentionId =
    focusedMentionId == null || focusedMentionId === ""
      ? null
      : Number(focusedMentionId)

  return (
    <CenterPaneThreadChat
      threadId={numericThreadId}
      focusedMentionId={Number.isFinite(numericMentionId) ? numericMentionId : null}
      onThreadCreated={(nextThreadId) => {
        mergeWorkspaceUrlState(
          {
            centerThreadId: String(nextThreadId),
            centerMentionId: null,
            rightThreadId: null,
            rightMentionId: null,
          },
          { source: "center-thread-created" },
        )
      }}
    />
  )
}

export function GlobalSearchDetailsPane({
  target,
  onClose,
  onOpenTask,
  onOpenTaskKeepingDetail,
  onOpenTeamKeepingDetail,
  onOpenProject,
  isDetailsFocused = false,
  onFocusToggle,
  onResolvedTitle,
}: {
  target: GlobalSearchDetailTarget
  onClose: () => void
  onOpenTask: (taskId: number) => void
  /** When user/project/team detail stays open alongside TaskDetails (tasks shell). */
  onOpenTaskKeepingDetail?: (task: unknown) => void
  /** When user detail stays open under a stacked team pane (tasks shell). */
  onOpenTeamKeepingDetail?: (teamId: number) => void
  onOpenProject: (projectId: number) => void
  isDetailsFocused?: boolean
  onFocusToggle?: () => void
  /** When the detail entity resolves a display name, update the middle-pane tab label. */
  onResolvedTitle?: (title: string) => void
}) {
  const searchParams = useSearchParams()

  useEffect(() => {
    const knownTitle = target.title?.trim()
    if (knownTitle) onResolvedTitle?.(knownTitle)
  }, [onResolvedTitle, target.title])

  useEffect(() => {
    const currentParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(searchParams.toString())
    // A task suggestion (itemKind=suggestion + centerSuggestionId) is a complete, valid middle-pane
    // selection. Do not let a stale detail target re-assert center*/right* params over it — that
    // creates a router update loop (this pane re-adds e.g. centerUserId while the suggestion-selection
    // normalizer removes it). The suggestion owns the center pane; leave the URL untouched.
    if (currentParams.get("itemKind") === "suggestion" && currentParams.get("centerSuggestionId")) {
      return
    }
    const next = new URLSearchParams(currentParams.toString())
    const isAiRightPane = next.get("rightView") === "ai"
    const currentTab = next.get("rightTab") ?? next.get("centerTab") ?? next.get("tab")
    if (isAiRightPane) {
      if (target.entityType === "project" || target.entityType === "project_briefing") {
        const projectId = target.projectId ?? target.entityId
        if (projectId) next.set("centerProjectId", String(projectId))
        if (target.entityType === "project_briefing") next.set("centerTab", "briefings")
        else if (currentTab && PROJECT_ALLOWED_TABS.has(currentTab)) next.set("centerTab", currentTab)
        else next.delete("centerTab")
        next.delete("centerTaskId")
        next.delete("centerUserId")
        next.delete("centerTeamId")
        next.delete("centerThreadId")
        next.delete("centerMentionId")
      } else if (target.entityType === "user" && target.entityId) {
        next.set("centerUserId", String(target.entityId))
        if (currentTab && USER_ALLOWED_TABS.has(currentTab)) next.set("centerTab", currentTab)
        else next.delete("centerTab")
        next.delete("centerTaskId")
        next.delete("centerProjectId")
        next.delete("centerTeamId")
        next.delete("centerThreadId")
        next.delete("centerMentionId")
      } else if (target.entityType === "team" && target.entityId) {
        next.set("centerTeamId", String(target.entityId))
        if (currentTab && TEAM_ALLOWED_TABS.has(currentTab) && currentTab !== "overview") next.set("centerTab", currentTab)
        else next.delete("centerTab")
        next.delete("centerTaskId")
        next.delete("centerProjectId")
        next.delete("centerUserId")
        next.delete("centerThreadId")
        next.delete("centerMentionId")
      } else if (target.entityType === "mention") {
        const threadId = target.threadId ?? target.entityId
        if (threadId) next.set("centerThreadId", String(threadId))
        if (target.mentionId) next.set("centerMentionId", String(target.mentionId))
        else next.delete("centerMentionId")
        next.delete("centerTaskId")
        next.delete("centerProjectId")
        next.delete("centerUserId")
        next.delete("centerTeamId")
      }
      // In AI-right-pane mode, detail lives in center* params.
      next.delete("rightTaskId")
      next.delete("rightProjectId")
      next.delete("rightUserId")
      next.delete("rightTeamId")
      next.delete("rightThreadId")
      next.delete("rightMentionId")
      next.delete("rightTab")
      // Center-entity selection should not inherit stale split-top/bottom state.
      next.delete("split")
      next.delete("splitView")
      next.delete("topView")
      next.delete("bottomView")
    } else if (target.entityType === "project_briefing") {
      if (target.projectId ?? target.entityId) next.set("rightProjectId", String(target.projectId ?? target.entityId))
      next.delete("rightUserId")
      next.delete("rightTeamId")
      next.delete("rightThreadId")
      next.delete("rightMentionId")
      next.set("rightTab", "briefings")
      if (target.briefingTypeId) next.set("briefingTypeId", String(target.briefingTypeId))
    } else if (target.entityType === "project" || target.entityType === "user" || target.entityType === "team") {
      if (target.entityType === "project") {
        if (target.projectId ?? target.entityId) next.set("rightProjectId", String(target.projectId ?? target.entityId))
        next.delete("rightUserId")
        next.delete("rightTeamId")
        next.delete("rightThreadId")
        next.delete("rightMentionId")
        if (currentTab && !PROJECT_ALLOWED_TABS.has(currentTab)) next.delete("rightTab")
      } else if (target.entityType === "user") {
        if (target.entityId) next.set("rightUserId", String(target.entityId))
        next.delete("rightProjectId")
        next.delete("rightTeamId")
        next.delete("rightThreadId")
        next.delete("rightMentionId")
        if (currentTab && !USER_ALLOWED_TABS.has(currentTab)) next.delete("rightTab")
      } else {
        if (target.entityId) next.set("rightTeamId", String(target.entityId))
        next.delete("rightProjectId")
        next.delete("rightUserId")
        next.delete("rightThreadId")
        next.delete("rightMentionId")
        if (currentTab && !TEAM_ALLOWED_TABS.has(currentTab)) next.delete("rightTab")
      }
      // project: keep briefingTypeId so opening a briefing from Overview does not get stripped on the next effect run.
      if (target.entityType !== "project") {
        next.delete("briefingTypeId")
      }
    } else if (target.entityType === "mention") {
      // Threads always live in the center/details pane (right column is AI).
      const threadId = target.threadId ?? target.entityId
      if (threadId) next.set("centerThreadId", String(threadId))
      if (target.mentionId) next.set("centerMentionId", String(target.mentionId))
      else next.delete("centerMentionId")
      next.delete("rightThreadId")
      next.delete("rightMentionId")
      next.delete("rightProjectId")
      next.delete("rightUserId")
      next.delete("rightTeamId")
      next.delete("centerTaskId")
      next.delete("centerProjectId")
      next.delete("centerUserId")
      next.delete("centerTeamId")
    }
    // Pane state uses center*/right* params. Keep generic tab/entity/id clear in canonical section routes.
    next.delete("tab")
    next.delete("entity")
    next.delete("id")
    if (next.toString() !== currentParams.toString()) {
      replaceWorkspaceUrlState(Object.fromEntries(next.entries()), { source: "global-search-details-sync" })
    }
  }, [
    searchParams,
    target.briefingTypeId,
    target.entityType,
    target.entityId,
    target.projectId,
    target.threadId,
    target.mentionId,
  ])

  if (target.entityType === "project" || target.entityType === "project_briefing") {
    const projectId = target.projectId ?? target.entityId
    if (!projectId) return null
    return (
      <BriefingsPage
        projectId={Number(projectId) as never}
        onClose={onClose}
        isDetailsFocused={isDetailsFocused}
        onFocusToggle={onFocusToggle}
        onResolvedTitle={onResolvedTitle}
      />
    )
  }

  if (target.entityType === "user" && target.entityId) {
    return (
      <UserDetailsPage
        userId={Number(target.entityId) as never}
        onClose={onClose}
        isDetailsFocused={isDetailsFocused}
        onFocusToggle={onFocusToggle}
        onOpenTask={onOpenTask}
        onOpenTaskKeepingDetail={onOpenTaskKeepingDetail}
        onOpenTeamKeepingDetail={onOpenTeamKeepingDetail}
        onOpenProject={onOpenProject}
        onResolvedTitle={onResolvedTitle}
      />
    )
  }

  if (target.entityType === "team" && target.entityId) {
    return (
      <TeamDetailsPage
        teamId={Number(target.entityId) as never}
        onClose={onClose}
        isDetailsFocused={isDetailsFocused}
        onFocusToggle={onFocusToggle}
        onResolvedTitle={onResolvedTitle}
      />
    )
  }

  if (target.entityType === "mention") {
    const threadId = target.threadId ?? target.entityId
    if (!threadId) return null
    return (
      <ThreadDetailsPane
        threadId={threadId}
        initialTitle={target.title ?? null}
        focusedMentionId={target.mentionId ?? null}
        onOpenTask={onOpenTask}
        onOpenProject={onOpenProject}
        onClose={onClose}
        isDetailsFocused={isDetailsFocused}
        onFocusToggle={onFocusToggle}
      />
    )
  }

  return null
}
