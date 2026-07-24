import type { QueryClient } from "@tanstack/react-query"
import { getUserProfile } from "./services/users"
import { getTeamProfile } from "./services/teams"
import { getProjectOverview } from "./services/projects-briefing"
import { getTaskById } from "../../lib/services/tasks"
import {
  isCenterPaneTabPlaceholderTitle,
  type CenterPaneTab,
  type CenterPaneTabKind,
} from "../store/center-pane-tabs"

export { listCenterPaneTabsNeedingTitleResolution } from "../store/center-pane-tabs"

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : ""
    if (trimmed) return trimmed
  }
  return null
}

function titleFromUserProfile(profile: { full_name?: string | null; auth_email?: string | null } | null | undefined) {
  return firstNonEmpty(profile?.full_name, profile?.auth_email)
}

function titleFromTeamProfile(profile: { title?: string | null; full_name?: string | null } | null | undefined) {
  return firstNonEmpty(profile?.title, profile?.full_name)
}

function titleFromProjectOverview(overview: { name?: string | null } | null | undefined) {
  return firstNonEmpty(overview?.name)
}

function titleFromTask(task: { title?: string | null } | null | undefined) {
  return firstNonEmpty(task?.title)
}

function readCachedTitle(
  queryClient: QueryClient,
  kind: CenterPaneTabKind,
  id: string,
): string | null {
  if (kind === "user") {
    return titleFromUserProfile(queryClient.getQueryData(["user-profile", Number(id)]))
  }
  if (kind === "team") {
    return titleFromTeamProfile(queryClient.getQueryData(["team-profile", Number(id)]))
  }
  if (kind === "project") {
    return titleFromProjectOverview(queryClient.getQueryData(["project-overview", Number(id)]))
  }
  if (kind === "task" || kind === "suggestion") {
    const matches = queryClient.getQueriesData<{ task?: { title?: string | null }; title?: string | null }>({
      queryKey: ["task", id],
    })
    for (const [, data] of matches) {
      const fromBootstrap = titleFromTask(data?.task)
      if (fromBootstrap) return fromBootstrap
      const fromRow = titleFromTask(data as { title?: string | null } | null)
      if (fromRow) return fromRow
    }
  }
  return null
}

async function fetchTitle(kind: CenterPaneTabKind, id: string, signal: AbortSignal): Promise<string | null> {
  if (kind === "user") {
    const userId = Number(id)
    if (!Number.isFinite(userId) || userId <= 0) return null
    const { data, error } = await getUserProfile(userId)
    if (error || signal.aborted) return null
    return titleFromUserProfile(data)
  }
  if (kind === "team") {
    const teamId = Number(id)
    if (!Number.isFinite(teamId) || teamId <= 0) return null
    const { data, error } = await getTeamProfile(teamId)
    if (error || signal.aborted) return null
    return titleFromTeamProfile(data)
  }
  if (kind === "project") {
    const projectId = Number(id)
    if (!Number.isFinite(projectId) || projectId <= 0) return null
    const { data, error } = await getProjectOverview(projectId)
    if (error || signal.aborted) return null
    return titleFromProjectOverview(data)
  }
  if (kind === "task" || kind === "suggestion") {
    try {
      const task = await getTaskById({ signal, id })
      if (signal.aborted) return null
      return titleFromTask(task)
    } catch {
      return null
    }
  }
  return null
}

/**
 * Resolve a friendly label for a center-pane tab. Prefers React Query cache, then fetches.
 */
export async function resolveCenterPaneTabTitle(args: {
  tab: CenterPaneTab
  queryClient: QueryClient
  signal: AbortSignal
}): Promise<string | null> {
  const { tab, queryClient, signal } = args
  if (!isCenterPaneTabPlaceholderTitle(tab.title, tab.kind, tab.id)) {
    return tab.title.trim() || null
  }
  const cached = readCachedTitle(queryClient, tab.kind, tab.id)
  if (cached) return cached
  if (signal.aborted) return null
  return fetchTitle(tab.kind, tab.id, signal)
}
