import type { QueryClient } from "@tanstack/react-query"
import { getUserProfile } from "./services/users"
import { getTeamProfile } from "./services/teams"
import { getProjectOverview } from "./services/projects-briefing"
import {
  getSuggestionTitlesByIds,
  getTaskTitleById,
  getTaskTitlesByIds,
} from "../../lib/services/tasks"
import { getArtifact } from "./services/artifacts"
import { getSource } from "./services/sources"
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
  if (kind === "suggestion") {
    const suggestion = queryClient.getQueryData<{ title?: string | null }>(["task-suggestion", id])
    const fromSuggestion = titleFromTask(suggestion)
    if (fromSuggestion) return fromSuggestion
    const suggestionNum = queryClient.getQueryData<{ title?: string | null }>([
      "task-suggestion",
      Number(id),
    ])
    return titleFromTask(suggestionNum)
  }
  if (kind === "task") {
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
  if (kind === "artifact") {
    const cached = queryClient.getQueryData<{ snapshot?: { title?: string | null } }>([
      "artifact",
      id,
      "current",
    ])
    return firstNonEmpty(cached?.snapshot?.title)
  }
  if (kind === "source") {
    const cached = queryClient.getQueryData<{ source?: { title?: string | null } }>([
      "source",
      id,
      "current",
    ])
    return firstNonEmpty(cached?.source?.title)
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
  if (kind === "task") {
    try {
      const title = await getTaskTitleById({ signal, id })
      if (signal.aborted) return null
      return firstNonEmpty(title)
    } catch {
      return null
    }
  }
  if (kind === "suggestion") {
    try {
      const map = await getSuggestionTitlesByIds({ signal, ids: [id] })
      if (signal.aborted) return null
      return firstNonEmpty(map.get(String(id)))
    } catch {
      return null
    }
  }
  if (kind === "artifact") {
    try {
      const result = await getArtifact({ artifactId: id })
      if (signal.aborted) return null
      return firstNonEmpty(result.snapshot.title)
    } catch {
      return null
    }
  }
  if (kind === "source") {
    try {
      const result = await getSource({ sourceId: id })
      if (signal.aborted) return null
      return firstNonEmpty(result.source.title)
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

/**
 * Batch-resolve titles for task/suggestion tabs (one request per kind).
 * Returns a map of tab key → title for tabs that still needed resolution.
 */
export async function resolveCenterPaneTabTitlesBatch(args: {
  tabs: CenterPaneTab[]
  queryClient: QueryClient
  signal: AbortSignal
}): Promise<Map<string, string>> {
  const { tabs, queryClient, signal } = args
  const out = new Map<string, string>()
  const needingFetch: CenterPaneTab[] = []

  for (const tab of tabs) {
    if (tab.kind !== "task" && tab.kind !== "suggestion") continue
    if (!isCenterPaneTabPlaceholderTitle(tab.title, tab.kind, tab.id)) {
      const trimmed = tab.title.trim()
      if (trimmed) out.set(tab.key, trimmed)
      continue
    }
    const cached = readCachedTitle(queryClient, tab.kind, tab.id)
    if (cached) {
      out.set(tab.key, cached)
      continue
    }
    needingFetch.push(tab)
  }

  if (needingFetch.length === 0 || signal.aborted) return out

  const taskIds = needingFetch.filter((t) => t.kind === "task").map((t) => t.id)
  const suggestionIds = needingFetch.filter((t) => t.kind === "suggestion").map((t) => t.id)

  const [taskTitles, suggestionTitles] = await Promise.all([
    taskIds.length > 0
      ? getTaskTitlesByIds({ signal, ids: taskIds }).catch(() => new Map<string, string>())
      : Promise.resolve(new Map<string, string>()),
    suggestionIds.length > 0
      ? getSuggestionTitlesByIds({ signal, ids: suggestionIds }).catch(() => new Map<string, string>())
      : Promise.resolve(new Map<string, string>()),
  ])

  if (signal.aborted) return out

  for (const tab of needingFetch) {
    const title =
      tab.kind === "suggestion"
        ? suggestionTitles.get(String(tab.id))
        : taskTitles.get(String(tab.id))
    if (title) out.set(tab.key, title)
  }

  return out
}
