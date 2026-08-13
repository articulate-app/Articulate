"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { BriefingsPage } from "../project-briefings/BriefingsPage"
import { UserDetailsPage } from "../users/UserDetailsPageTabs"
import { TeamDetailsPage } from "../teams/TeamDetailsPage"
import { CenterPaneThreadChat } from "../comments-section/center-pane-thread-chat"
import { mergeWorkspaceUrlState, replaceWorkspaceUrlState } from "../../lib/workspace-url-state"
import type { GlobalSearchDetailTarget } from "../../lib/global-search-types"
import type { WorkspacePaneId } from "../../lib/workspace-view"
import { WorkspaceHostPaneProvider } from "../workspace/workspace-host-pane-context"

const PROJECT_ALLOWED_TABS = new Set([
  "overview",
  "billing",
  "activity",
  "comments",
  "files",
  "analytics",
  "seo-search",
  "ai-visibility",
  "keywords",
  "competitors",
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
  paneId,
}: {
  threadId: string | number
  focusedMentionId?: string | number | null
  initialTitle?: string | null
  onOpenTask: (taskId: number) => void
  onOpenProject: (projectId: number) => void
  onClose?: () => void
  isDetailsFocused?: boolean
  onFocusToggle?: () => void
  paneId: WorkspacePaneId
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
        if (paneId === "right") {
          mergeWorkspaceUrlState(
            {
              rightThreadId: String(nextThreadId),
              rightMentionId: null,
              rightView: "thread",
            },
            { source: "right-thread-created" },
          )
          return
        }
        mergeWorkspaceUrlState(
          {
            centerThreadId: String(nextThreadId),
            centerMentionId: null,
          },
          { source: "center-thread-created" },
        )
      }}
    />
  )
}

export function GlobalSearchDetailsPane({
  target,
  paneId = "middle",
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
  /**
   * Host workspace pane. URL sync writes ONLY this pane's active-view params.
   * Defaults to middle for legacy shell call sites.
   */
  paneId?: WorkspacePaneId
  /** Pane close lives on CenterPaneTabBar when embedded in the tasks shell. */
  onClose?: () => void
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
    // selection. Do not let a stale detail target re-assert center* params over it.
    if (
      paneId === "middle" &&
      currentParams.get("itemKind") === "suggestion" &&
      currentParams.get("centerSuggestionId")
    ) {
      return
    }
    const next = new URLSearchParams(currentParams.toString())
    const currentTab =
      paneId === "right"
        ? next.get("rightTab") ?? next.get("tab")
        : next.get("centerTab") ?? next.get("tab")

    if (paneId === "middle") {
      // ── middle only ─────────────────────────────────────────────────────
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
        next.delete("centerView")
      } else if (target.entityType === "user" && target.entityId) {
        next.set("centerUserId", String(target.entityId))
        if (currentTab && USER_ALLOWED_TABS.has(currentTab)) next.set("centerTab", currentTab)
        else next.delete("centerTab")
        next.delete("centerTaskId")
        next.delete("centerProjectId")
        next.delete("centerTeamId")
        next.delete("centerThreadId")
        next.delete("centerMentionId")
        next.delete("centerView")
      } else if (target.entityType === "team" && target.entityId) {
        next.set("centerTeamId", String(target.entityId))
        if (currentTab && TEAM_ALLOWED_TABS.has(currentTab) && currentTab !== "overview") {
          next.set("centerTab", currentTab)
        } else next.delete("centerTab")
        next.delete("centerTaskId")
        next.delete("centerProjectId")
        next.delete("centerUserId")
        next.delete("centerThreadId")
        next.delete("centerMentionId")
        next.delete("centerView")
      } else if (target.entityType === "mention") {
        const threadId = target.threadId ?? target.entityId
        if (threadId) next.set("centerThreadId", String(threadId))
        if (target.mentionId) next.set("centerMentionId", String(target.mentionId))
        else next.delete("centerMentionId")
        next.delete("centerTaskId")
        next.delete("centerProjectId")
        next.delete("centerUserId")
        next.delete("centerTeamId")
        next.delete("centerView")
      }
      // Never touch right* — middle host must not dual-write.
    } else {
      // ── right only ──────────────────────────────────────────────────────
      if (target.entityType === "project_briefing") {
        if (target.projectId ?? target.entityId) {
          next.set("rightProjectId", String(target.projectId ?? target.entityId))
        }
        next.delete("rightUserId")
        next.delete("rightTeamId")
        next.delete("rightThreadId")
        next.delete("rightMentionId")
        next.delete("rightTaskId")
        next.set("rightTab", "briefings")
        next.set("rightView", "project")
        if (target.briefingTypeId) next.set("briefingTypeId", String(target.briefingTypeId))
      } else if (
        target.entityType === "project" ||
        target.entityType === "user" ||
        target.entityType === "team"
      ) {
        if (target.entityType === "project") {
          if (target.projectId ?? target.entityId) {
            next.set("rightProjectId", String(target.projectId ?? target.entityId))
          }
          next.delete("rightUserId")
          next.delete("rightTeamId")
          next.delete("rightThreadId")
          next.delete("rightMentionId")
          next.delete("rightTaskId")
          next.set("rightView", "project")
          if (currentTab && !PROJECT_ALLOWED_TABS.has(currentTab)) next.delete("rightTab")
        } else if (target.entityType === "user") {
          if (target.entityId) next.set("rightUserId", String(target.entityId))
          next.delete("rightProjectId")
          next.delete("rightTeamId")
          next.delete("rightThreadId")
          next.delete("rightMentionId")
          next.delete("rightTaskId")
          next.set("rightView", "user")
          if (currentTab && !USER_ALLOWED_TABS.has(currentTab)) next.delete("rightTab")
        } else {
          if (target.entityId) next.set("rightTeamId", String(target.entityId))
          next.delete("rightProjectId")
          next.delete("rightUserId")
          next.delete("rightThreadId")
          next.delete("rightMentionId")
          next.delete("rightTaskId")
          next.set("rightView", "team")
          if (currentTab && !TEAM_ALLOWED_TABS.has(currentTab)) next.delete("rightTab")
        }
        if (target.entityType !== "project") {
          next.delete("briefingTypeId")
        }
      } else if (target.entityType === "mention") {
        const threadId = target.threadId ?? target.entityId
        if (threadId) next.set("rightThreadId", String(threadId))
        if (target.mentionId) next.set("rightMentionId", String(target.mentionId))
        else next.delete("rightMentionId")
        next.delete("rightProjectId")
        next.delete("rightUserId")
        next.delete("rightTeamId")
        next.delete("rightTaskId")
        next.set("rightView", "thread")
      }
      // Never touch center* — right host must not dual-write.
    }

    // Pane state uses center*/right* params. Keep generic tab/entity/id clear.
    // `object=` is left as legacy list-route metadata — not authoritative for pane views.
    next.delete("tab")
    next.delete("entity")
    next.delete("id")
    if (next.toString() !== currentParams.toString()) {
      replaceWorkspaceUrlState(Object.fromEntries(next.entries()), {
        source: `global-search-details-sync:${paneId}`,
      })
    }
  }, [
    paneId,
    searchParams,
    target.briefingTypeId,
    target.entityType,
    target.entityId,
    target.projectId,
    target.threadId,
    target.mentionId,
  ])

  const body = (() => {
    if (target.entityType === "project" || target.entityType === "project_briefing") {
      const projectId = target.projectId ?? target.entityId
      if (!projectId) return null
      return (
        <BriefingsPage
          key={Number(projectId)}
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
          focusedMentionId={target.mentionId}
          initialTitle={target.title}
          onOpenTask={onOpenTask}
          onOpenProject={onOpenProject}
          onClose={onClose}
          isDetailsFocused={isDetailsFocused}
          onFocusToggle={onFocusToggle}
          paneId={paneId}
        />
      )
    }

    return null
  })()

  return <WorkspaceHostPaneProvider pane={paneId}>{body}</WorkspaceHostPaneProvider>
}
