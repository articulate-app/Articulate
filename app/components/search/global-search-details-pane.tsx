"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { BriefingsPage } from "../project-briefings/BriefingsPage"
import { UserDetailsPage } from "../users/UserDetailsPageTabs"
import { TeamDetailsPage } from "../teams/TeamDetailsPage"
import { InboxThreadView } from "../inbox/inbox-thread-view"
import { replaceWorkspaceUrlState } from "../../lib/workspace-url-state"
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
  "briefings",
  "library",
  "tasks",
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
  initialTitle,
  onOpenTask,
  onOpenProject,
  onClose,
  isDetailsFocused = false,
  onFocusToggle,
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
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()
  const threadQuery = useQuery({
    queryKey: ["global-search-thread", threadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("threads")
        .select("id, title, project_id, task_id")
        .eq("id", threadId)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: Boolean(threadId),
    initialData: () =>
      queryClient.getQueryData(["global-search-thread", threadId]) ??
      (initialTitle
        ? {
            id: Number(threadId),
            title: initialTitle,
            project_id: null,
            task_id: null,
            __partial: true,
          }
        : undefined),
    staleTime: 0,
  })

  return (
    <InboxThreadView
      threadId={threadId as never}
      threadTitle={threadQuery.data?.title ?? initialTitle ?? null}
      projectId={threadQuery.data?.project_id ?? null}
      taskId={threadQuery.data?.task_id ?? null}
      focusedMentionId={focusedMentionId ?? null}
      onOpenTaskDetails={onOpenTask}
      onOpenProjectDetails={onOpenProject}
      onClose={onClose}
      isDetailsFocused={isDetailsFocused}
      onFocusToggle={onFocusToggle}
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
}) {
  const searchParams = useSearchParams()

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
      } else if (target.entityType === "user" && target.entityId) {
        next.set("centerUserId", String(target.entityId))
        if (currentTab && USER_ALLOWED_TABS.has(currentTab)) next.set("centerTab", currentTab)
        else next.delete("centerTab")
        next.delete("centerTaskId")
        next.delete("centerProjectId")
        next.delete("centerTeamId")
        next.delete("centerThreadId")
      } else if (target.entityType === "team" && target.entityId) {
        next.set("centerTeamId", String(target.entityId))
        if (currentTab && TEAM_ALLOWED_TABS.has(currentTab) && currentTab !== "overview") next.set("centerTab", currentTab)
        else next.delete("centerTab")
        next.delete("centerTaskId")
        next.delete("centerProjectId")
        next.delete("centerUserId")
        next.delete("centerThreadId")
      } else if (target.entityType === "mention") {
        const threadId = target.threadId ?? target.entityId
        if (threadId) next.set("centerThreadId", String(threadId))
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
      if (target.threadId ?? target.entityId) next.set("rightThreadId", String(target.threadId ?? target.entityId))
      if (target.mentionId) next.set("rightMentionId", String(target.mentionId))
      next.delete("rightProjectId")
      next.delete("rightUserId")
      next.delete("rightTeamId")
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
        onOpenTaskKeepingDetail={onOpenTaskKeepingDetail}
        onOpenTeamKeepingDetail={onOpenTeamKeepingDetail}
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
