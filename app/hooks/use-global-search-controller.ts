"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { useTasksUI } from "../store/tasks-ui"
import { useCurrentUserStore } from "../store/current-user"
import {
  GLOBAL_SEARCH_ENTITY_TYPES,
  type GlobalSearchCountsMap,
  type GlobalSearchDocument,
  type GlobalSearchDetailTarget,
  type GlobalSearchEntityType,
  type GlobalSearchItemEntityType,
  type GlobalSearchResultTab,
  type GlobalSearchSection,
  isGlobalSearchEntityType,
  isGlobalSearchItemEntityType,
} from "../lib/global-search-types"
import {
  addGlobalSearchHistory,
  fetchGlobalSearchAllTabCounts,
  fetchGlobalSearchAllTabItems,
  fetchGlobalSearchDiscoverySections,
  fetchGlobalSearchDiscoveryCounts,
  fetchGlobalSearchDocumentsByType,
  trackGlobalObjectOpen,
} from "../lib/services/global-search"
import { bumpAndInvalidateHomeSidebarRecent } from "../lib/home-sidebar-recents-cache"
import type { TaskFiltersForUrl } from "../lib/tasks-filter-url"
import { buildSeeMoreTasksSearchParams } from "../lib/tasks-filter-url"
import { applyAiThreadOpenParams } from "../lib/ai-thread-route"
import {
  TASKS_SHALLOW_NAV_EVENT,
  isRecentObjectNavigation,
  markLatestSearchSubmit,
  markObjectNavigation,
  shallowPushSearchParams,
  shallowReplaceSearchParams,
} from "../lib/tasks-shallow-nav"
import { buildRightPaneSelectionSearchParams } from "../lib/right-pane-selection-url"
import { buildCenterPaneSelectionSearchParams } from "../lib/center-pane-selection-url"
import {
  buildObjectRoute,
  buildSearchSubmitRoute,
  getCurrentObjectRoute,
  resolveSearchDataSource,
  tabToObjectRoute,
} from "../lib/search-routing"
import {
  globalSearchDocumentToRowPayload,
  seedEntityPreviewFromSearchDocument,
} from "../lib/entity-preview-from-search"
import { openArtifactCenterTab } from "../../features/artifacts/open-artifact-center-tab"

function optionalString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "string" && value.trim()) return value.trim()
  return null
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function isAiThreadItem(item: GlobalSearchDocument): boolean {
  return item.entity_type === "ai_thread"
}

function markMentionAsSeenInMeta(meta: NonNullable<GlobalSearchDocument["display_payload"]>["meta"] | undefined) {
  if (!meta) return meta
  const hasIsUnread = meta.some((entry) => (entry.label?.trim() ?? "").toLowerCase() === "is_unread")
  if (!hasIsUnread) return meta
  return meta.map((entry) =>
    (entry.label?.trim() ?? "").toLowerCase() === "is_unread" ? { ...entry, value: "false" } : entry,
  )
}

function markMentionAsSeenInDocument(item: GlobalSearchDocument, mentionId: string): GlobalSearchDocument {
  if (item.entity_type !== "mention") return item
  if (String(item.entity_id ?? "") !== mentionId) return item
  if (!item.display_payload) return item
  return {
    ...item,
    display_payload: {
      ...item.display_payload,
      meta: markMentionAsSeenInMeta(item.display_payload.meta),
    },
  }
}

function markMentionAsSeenInSections(sections: GlobalSearchSection[], mentionId: string): GlobalSearchSection[] {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) => markMentionAsSeenInDocument(item, mentionId)),
    sections: section.sections ? markMentionAsSeenInSections(section.sections, mentionId) : section.sections,
  }))
}

function getTrackingEntityType(item: GlobalSearchDocument): string {
  if (item.entity_type === "ai_thread") return "ai_thread"
  return item.entity_type
}

function getTrackingEntityId(item: GlobalSearchDocument): string | null {
  if (item.entity_type === "ai_thread") {
    return optionalString(item.entity_id)
  }
  if (item.entity_type === "mention") {
    return optionalString(item.entity_id)
  }
  return optionalString(item.entity_id)
}

function readDetailTargetFromSearchParams(searchParams: SearchParamsLike, isShellPath: boolean): GlobalSearchDetailTarget | null {
  const centerProjectId = optionalString(searchParams.get("centerProjectId"))
  if (centerProjectId) {
    return {
      entityType: "project",
      entityId: centerProjectId,
      projectId: centerProjectId,
      threadId: null,
      mentionId: null,
    }
  }
  const centerUserId = optionalString(searchParams.get("centerUserId"))
  if (centerUserId) {
    return {
      entityType: "user",
      entityId: centerUserId,
      projectId: null,
      threadId: null,
      mentionId: null,
    }
  }
  const centerTeamId = optionalString(searchParams.get("centerTeamId"))
  if (centerTeamId) {
    return {
      entityType: "team",
      entityId: centerTeamId,
      projectId: null,
      threadId: null,
      mentionId: null,
    }
  }
  const centerThreadId = optionalString(searchParams.get("centerThreadId"))
  if (centerThreadId) {
    return {
      entityType: "mention",
      entityId: centerThreadId,
      projectId: null,
      threadId: centerThreadId,
      mentionId:
        optionalString(searchParams.get("centerMentionId")) ??
        optionalString(searchParams.get("rightMentionId")) ??
        optionalString(searchParams.get("mentionId")),
    }
  }

  const rightProjectId = optionalString(searchParams.get("rightProjectId"))
  if (rightProjectId) {
    return {
      entityType: "project",
      entityId: rightProjectId,
      projectId: rightProjectId,
      threadId: null,
      mentionId: null,
    }
  }
  const rightUserId = optionalString(searchParams.get("rightUserId"))
  if (rightUserId) {
    return {
      entityType: "user",
      entityId: rightUserId,
      projectId: null,
      threadId: null,
      mentionId: null,
    }
  }
  const rightTeamId = optionalString(searchParams.get("rightTeamId"))
  if (rightTeamId) {
    return {
      entityType: "team",
      entityId: rightTeamId,
      projectId: null,
      threadId: null,
      mentionId: null,
    }
  }
  // When the right pane hosts the thread (`rightView=thread`), do not also treat it as the
  // middle-pane detail target — that dual-opens Message/thread in center + right.
  const rightThreadId = optionalString(searchParams.get("rightThreadId"))
  if (rightThreadId && searchParams.get("rightView") !== "thread" && rightThreadId !== "new") {
    return {
      entityType: "mention",
      entityId: rightThreadId,
      projectId: null,
      threadId: rightThreadId,
      mentionId: optionalString(searchParams.get("rightMentionId")),
    }
  }

  if (isShellPath) {
    const entityRaw = searchParams.get("entity")
    if (!isGlobalSearchEntityType(entityRaw) || entityRaw === "task") return null
    const entityId = optionalString(searchParams.get("id"))
    if (!entityId) return null
    return {
      entityType: entityRaw,
      entityId,
      projectId: entityRaw === "project" || entityRaw === "project_briefing" ? entityId : null,
      threadId: entityRaw === "mention" ? optionalString(searchParams.get("threadId")) : null,
      mentionId: entityRaw === "mention" ? optionalString(searchParams.get("mentionId")) : null,
    }
  }

  // Stacked detail (e.g. user profile) + task `id` on /tasks — must parse before `id` short-circuit.
  const detailTypeRaw = searchParams.get("detailType")
  const detailIdStacked = optionalString(searchParams.get("detailId"))
  if (
    detailTypeRaw &&
    detailIdStacked &&
    isGlobalSearchEntityType(detailTypeRaw) &&
    detailTypeRaw !== "task"
  ) {
    return {
      entityType: detailTypeRaw,
      entityId: detailIdStacked,
      projectId: detailTypeRaw === "project" || detailTypeRaw === "project_briefing" ? detailIdStacked : null,
      threadId: detailTypeRaw === "mention" ? detailIdStacked : null,
      mentionId: detailTypeRaw === "mention" ? optionalString(searchParams.get("mentionId")) : null,
      briefingTypeId: optionalNumber(searchParams.get("briefingTypeId")),
    }
  }

  if (searchParams.get("id")) return null

  return null
}

function isSameDetailTarget(
  current: GlobalSearchDetailTarget | null,
  next: GlobalSearchDetailTarget | null,
): boolean {
  if (current === next) return true
  if (!current || !next) return false
  return (
    current.entityType === next.entityType &&
    current.entityId === next.entityId &&
    current.projectId === next.projectId &&
    current.taskId === next.taskId &&
    current.threadId === next.threadId &&
    current.mentionId === next.mentionId &&
    current.briefingTypeId === next.briefingTypeId
  )
}

function clearNonTaskDetailParams(nextParams: URLSearchParams) {
  nextParams.delete("detailType")
  nextParams.delete("detailId")
  nextParams.delete("mentionId")
  nextParams.delete("briefingTypeId")
  const tab = nextParams.get("tab")
  if (tab === "overview" || tab === "briefings") {
    nextParams.delete("tab")
  }
}

const EMPTY_TASK_FILTERS: TaskFiltersForUrl = {
  assignedTo: [],
  status: [],
  deliveryDate: {},
  publicationDate: {},
  project: [],
  contentType: [],
  productionType: [],
  language: [],
  channels: [],
  overdueStatus: [],
}

const TASK_CONTEXT_ONLY_PARAMS = [
  "tasksView",
  "topView",
  "groupBy",
  "groupOrder",
  "assignedTo",
  "status",
  "project",
  "contentType",
  "productionType",
  "language",
  "channels",
  "overdueStatus",
  "deliveryDateFrom",
  "deliveryDateTo",
  "publicationDateFrom",
  "publicationDateTo",
  "showTasks",
  "showSuggestions",
  "view",
  "filter",
] as const

function clearTaskContextSearchParams(nextParams: URLSearchParams) {
  for (const key of TASK_CONTEXT_ONLY_PARAMS) {
    nextParams.delete(key)
  }
}

function getTaskFiltersForDiscoverySection(
  sectionType: string,
  currentUserId: number | null,
): TaskFiltersForUrl | null {
  if (sectionType === "tasks_assigned_to_me" || sectionType === "assigned_to_me") {
    return {
      ...EMPTY_TASK_FILTERS,
      assignedTo: currentUserId != null ? [String(currentUserId)] : [],
    }
  }
  if (sectionType === "tasks_overdue_delivery" || sectionType === "overdue_delivery") {
    return {
      ...EMPTY_TASK_FILTERS,
      overdueStatus: ["delivery_overdue"],
    }
  }
  if (sectionType === "tasks_overdue_publication" || sectionType === "overdue_publication") {
    return {
      ...EMPTY_TASK_FILTERS,
      overdueStatus: ["publication_overdue"],
    }
  }
  if (sectionType === "tasks_upcoming_delivery" || sectionType === "upcoming_delivery") {
    return {
      ...EMPTY_TASK_FILTERS,
      deliveryDate: { from: new Date() },
    }
  }
  if (sectionType === "tasks_upcoming_publication" || sectionType === "upcoming_publication") {
    return {
      ...EMPTY_TASK_FILTERS,
      publicationDate: { from: new Date() },
    }
  }
  return null
}

type RouterLike = {
  push: (url: string, opts?: { scroll?: boolean }) => void
  replace: (url: string, opts?: { scroll?: boolean }) => void
}

type SearchParamsLike = {
  get: (name: string) => string | null
  toString: () => string
}

type UseGlobalSearchControllerArgs = {
  pathname: string
  router: RouterLike
  searchParams: SearchParamsLike
}

function readResultTabFromSearchParams(searchParams: SearchParamsLike): GlobalSearchResultTab {
  const typeValue = searchParams.get("type")
  return isGlobalSearchItemEntityType(typeValue) ? typeValue : "all"
}

function getRouteTab(pathname: string, searchParams: SearchParamsLike): GlobalSearchResultTab {
  const objectRoute = getCurrentObjectRoute(pathname, searchParams)
  if (objectRoute === "all") return readResultTabFromSearchParams(searchParams)
  if (objectRoute === "task") return "task"
  if (objectRoute === "project") return "project"
  if (objectRoute === "mention") return "mention"
  if (objectRoute === "user") return "user"
  if (objectRoute === "team") return "team"
  if (objectRoute === "artifact") return "artifact"
  return "ai_thread"
}

function isPrimarySearchRoute(pathname: string): boolean {
  void pathname
  // Controller is mounted only inside the unified workspace shell.
  return true
}

function isTasksWorkspaceRoute(pathname: string, searchParams: SearchParamsLike): boolean {
  return getCurrentObjectRoute(pathname, searchParams) === "task"
}

const SHELL_ALLOWED_PARAMS = new Set([
  "object",
  "q",
  "type",
  "entity",
  "id",
  "tab",
  "detailType",
  "detailId",
  "briefingTypeId",
  "threadId",
  "mentionId",
  "aiThreadId",
  "rightView",
  "rightTaskId",
  "rightThreadId",
  "rightProjectId",
  "rightUserId",
  "rightTeamId",
  "rightMentionId",
  "rightTab",
  "centerProjectId",
  "centerTaskId",
  "centerUserId",
  "centerTeamId",
  "centerThreadId",
  "centerMentionId",
  "centerArtifactId",
  "centerSourceId",
  "centerTab",
  "centerView",
  "centerSuggestionId",
  "middleTaskId",
  "middleProjectId",
  "middleUserId",
  "middleThreadId",
  "taskAiOpen",
  "focus",
  "aiFocus",
  "layout",
  "itemKind",
  "tasksView",
  "mode",
  "groupBy",
  "groupOrder",
  "project",
  "projectId",
  "version",
  "artifactVersion",
  "artifactHistory",
  "researchTab",
  "rQuery",
  "rRegion",
  "createType",
  "chatPreFill",
  "chatMode",
  "newAiThread",
  // Preferences / settings modal — must survive home shell sanitize
  "settings",
  "settingsCategory",
])


function getShellStateParams(searchParams: SearchParamsLike): URLSearchParams {
  const source = new URLSearchParams(searchParams.toString())
  const next = new URLSearchParams()
  for (const [key, value] of source.entries()) {
    if (!SHELL_ALLOWED_PARAMS.has(key)) continue
    next.set(key, value)
  }
  return next
}

function routeTabToEntityType(tab: GlobalSearchResultTab): GlobalSearchItemEntityType | null {
  if (tab === "all") return null
  if (tab === "project_briefing") return "project"
  return tab
}

function getSearchScopeFromTypes(types: GlobalSearchItemEntityType[]): GlobalSearchResultTab {
  return types[0] ?? "all"
}

function resolveDefaultTab(
  visibleTabs: GlobalSearchResultTab[],
  preferredTab?: GlobalSearchResultTab,
): GlobalSearchResultTab {
  if (preferredTab && visibleTabs.includes(preferredTab)) return preferredTab
  if (visibleTabs.includes("all")) return "all"
  return visibleTabs[0] ?? "all"
}

type ObjectDataSource =
  | "global_discovery"
  | "global_search"
  | "tasks"
  | "project_list"
  | "project_search"
  | "user_list"
  | "user_search"
  | "team_list"
  | "team_search"
  | "mention_list"
  | "mention_search"
  | "ai_thread_list"
  | "ai_thread_search"
  | "artifact_list"
  | "artifact_search"

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown }
  const message = String(candidate.message ?? "")
  return (
    candidate.name === "AbortError" ||
    candidate.code === "20" ||
    message.includes("AbortError")
  )
}

function resolveObjectDataSource(pathname: string, objectRoute: ReturnType<typeof getCurrentObjectRoute>, q?: string): ObjectDataSource {
  const hasQuery = Boolean(q?.trim())
  void pathname
  if (objectRoute === "all") return hasQuery ? "global_search" : "global_discovery"
  if (objectRoute === "task") return "tasks"
  if (objectRoute === "project") return hasQuery ? "project_search" : "project_list"
  if (objectRoute === "user") return hasQuery ? "user_search" : "user_list"
  if (objectRoute === "team") return hasQuery ? "team_search" : "team_list"
  if (objectRoute === "mention") return hasQuery ? "mention_search" : "mention_list"
  if (objectRoute === "ai_thread") return hasQuery ? "ai_thread_search" : "ai_thread_list"
  if (objectRoute === "artifact") return hasQuery ? "artifact_search" : "artifact_list"
  return hasQuery ? "global_search" : "global_discovery"
}

const DEFAULT_VISIBLE_RESULT_TYPES: GlobalSearchItemEntityType[] = [
  ...GLOBAL_SEARCH_ENTITY_TYPES.filter((type) => type !== "team" && type !== "project_briefing"),
  "ai_thread",
  "artifact",
]

export function useGlobalSearchController({
  pathname,
  searchParams,
}: UseGlobalSearchControllerArgs) {
  const [runtimeLocation, setRuntimeLocation] = useState(() => ({
    pathname: typeof window !== "undefined" ? window.location.pathname : pathname,
    search: typeof window !== "undefined" ? window.location.search : `?${searchParams.toString()}`,
  }))
  useEffect(() => {
    if (typeof window === "undefined") return
    const syncRuntimeLocation = () => {
      setRuntimeLocation((current) => {
        const next = {
          pathname: window.location.pathname,
          search: window.location.search,
        }
        if (current.pathname === next.pathname && current.search === next.search) {
          return current
        }
        return next
      })
    }
    syncRuntimeLocation()
    window.addEventListener(TASKS_SHALLOW_NAV_EVENT, syncRuntimeLocation)
    window.addEventListener("popstate", syncRuntimeLocation)
    return () => {
      window.removeEventListener(TASKS_SHALLOW_NAV_EVENT, syncRuntimeLocation)
      window.removeEventListener("popstate", syncRuntimeLocation)
    }
  }, [])

  const effectivePathname = runtimeLocation.pathname || pathname
  const effectiveSearchParams = useMemo(() => {
    const source = runtimeLocation.search.startsWith("?")
      ? runtimeLocation.search.slice(1)
      : runtimeLocation.search
    return new URLSearchParams(source)
  }, [runtimeLocation.search])
  const isPrimaryRoute = isPrimarySearchRoute(effectivePathname)
  const isTasksRoute = isTasksWorkspaceRoute(effectivePathname, effectiveSearchParams)
  const {
    searchValue,
    setSearchValue,
    searchDraftValue,
    setSearchDraftValue,
    setSelectedTaskId,
    setSelectedTaskSeed,
  } = useTasksUI()
  const currentUserId = useCurrentUserStore((s) => s.publicUserId)
  const queryClient = useQueryClient()
  const supabase = useMemo(() => createClientComponentClient(), [])

  const urlQuery = effectiveSearchParams.get("q") || ""
  const routeObject = getCurrentObjectRoute(effectivePathname, effectiveSearchParams)
  const urlTab = getRouteTab(effectivePathname, effectiveSearchParams)
  const lastSyncedUrlQueryRef = useRef(urlQuery)
  const [isOpen, setIsOpen] = useState(false)
  const [isFullResultsMode, setIsFullResultsMode] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [pendingSelectedTypes, setPendingSelectedTypes] = useState<GlobalSearchItemEntityType[]>([])
  const pendingSelectedTypesRef = useRef<GlobalSearchItemEntityType[]>([])
  const latestSearchInputRef = useRef(searchDraftValue)
  const [committedSelectedTypes, setCommittedSelectedTypes] = useState<GlobalSearchItemEntityType[]>([])
  const [activeResultTab, setActiveResultTab] = useState<GlobalSearchResultTab>(
    resolveDefaultTab(["all", ...DEFAULT_VISIBLE_RESULT_TYPES], urlTab),
  )
  const [selectedDetailTarget, setSelectedDetailTarget] = useState<GlobalSearchDetailTarget | null>(() =>
    readDetailTargetFromSearchParams(searchParams, isPrimaryRoute && !isTasksRoute),
  )
  const aiThreadOpenerRef = useRef<((threadId: string) => void) | null>(null)
  const taskResultOpenerRef = useRef<((item: GlobalSearchDocument) => void) | null>(null)
  const isPillNavigationLockedRef = useRef(false)
  const objectFetchRequestIdRef = useRef(0)

  useEffect(() => {
    const previousUrlQuery = lastSyncedUrlQueryRef.current
    const shouldSyncDraft = searchDraftValue === previousUrlQuery || searchDraftValue === searchValue

    if (searchValue !== urlQuery) {
      setSearchValue(urlQuery)
    }

    if (shouldSyncDraft && searchDraftValue !== urlQuery) {
      setSearchDraftValue(urlQuery)
    }
    latestSearchInputRef.current = shouldSyncDraft ? urlQuery : searchDraftValue
    lastSyncedUrlQueryRef.current = urlQuery
  }, [
    searchDraftValue,
    searchValue,
    setSearchDraftValue,
    setSearchValue,
    urlQuery,
  ])

  useEffect(() => {
    if (!isPrimaryRoute) return
    // Keep generic submits in global "All" mode even if URL transition
    // from /tasks -> / is still in flight.
    if (
      isTasksRoute &&
      searchValue.trim().length > 0 &&
      committedSelectedTypes.length === 0 &&
      activeResultTab === "all"
    ) {
      return
    }
    if (activeResultTab !== urlTab) {
      setActiveResultTab(urlTab)
    }
  }, [activeResultTab, committedSelectedTypes.length, isPrimaryRoute, isTasksRoute, searchValue, urlTab])

  useEffect(() => {
    const livePathname = typeof window !== "undefined" ? window.location.pathname : effectivePathname
    void livePathname
    if (!(isPrimaryRoute && !isTasksRoute && routeObject === "all")) return
    if (isRecentObjectNavigation()) return
    // Sanitize the live address bar — Next `searchParams` lag behind shallow writes
    // (e.g. aiFocus) and rewriting from them would strip focus/layout flags.
    const liveParams = effectiveSearchParams
    const sanitizedParams = getShellStateParams(liveParams)
    if (sanitizedParams.toString() === liveParams.toString()) return
    shallowReplaceSearchParams("/", sanitizedParams, "global-search-shell-sanitize")
  }, [effectivePathname, effectiveSearchParams, isPrimaryRoute, isTasksRoute, routeObject])

  const routeEntityType = routeTabToEntityType(urlTab)
  const visibleEntityTypes = useMemo(
    () => {
      const base = committedSelectedTypes.length > 0 ? [...committedSelectedTypes] : [...DEFAULT_VISIBLE_RESULT_TYPES]
      if (routeEntityType && !base.includes(routeEntityType)) {
        base.push(routeEntityType)
      }
      return base
    },
    [committedSelectedTypes, routeEntityType],
  )

  const visibleTabs = useMemo<GlobalSearchResultTab[]>(
    () => ["all", ...visibleEntityTypes],
    [visibleEntityTypes],
  )

  useEffect(() => {
    if (!visibleTabs.includes(activeResultTab)) {
      setActiveResultTab(resolveDefaultTab(visibleTabs))
    }
  }, [activeResultTab, visibleTabs])

  useEffect(() => {
    pendingSelectedTypesRef.current = pendingSelectedTypes
  }, [pendingSelectedTypes])

  useEffect(() => {
    const sourceParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(effectiveSearchParams.toString())
    const nextTarget = readDetailTargetFromSearchParams(sourceParams, isPrimaryRoute && !isTasksRoute)
    setSelectedDetailTarget((current) => (isSameDetailTarget(current, nextTarget) ? current : nextTarget))
  }, [effectiveSearchParams, isPrimaryRoute, isTasksRoute])

  const pendingTypesOrNull = pendingSelectedTypes.length > 0 ? pendingSelectedTypes : null
  const committedTypesOrNull = committedSelectedTypes.length > 0 ? committedSelectedTypes : null
  // Home / All discovery should never surface teams (moved to preferences).
  const allTabEntityTypesOrNull = committedTypesOrNull ?? DEFAULT_VISIBLE_RESULT_TYPES.filter(
    (type) => type !== "ai_thread" && type !== "artifact",
  )
  const objectDataSource = resolveObjectDataSource(effectivePathname, routeObject, searchValue)
  if (process.env.NODE_ENV === "development") {
    console.log("[object data source]", {
      pathname: effectivePathname,
      q: searchValue,
      source: objectDataSource,
    })
  }
  const searchDataSource = resolveSearchDataSource({
    pathname: effectivePathname,
    q: searchValue,
    object: routeObject,
  })

  const resetObjectResults = useCallback(() => {
    void queryClient.removeQueries({ queryKey: ["global-search", "full"] })
  }, [queryClient])

  useEffect(() => {
    const isObjectRoute = routeObject !== "all" && routeObject !== "task"
    if (!isObjectRoute) return
    console.log("[route transition fetch]", {
      effectivePathname,
      q: searchValue,
    })
    resetObjectResults()
    void queryClient.invalidateQueries({ queryKey: ["global-search", "full"] })
  }, [effectivePathname, queryClient, resetObjectResults, routeObject])
  const isDiscoveryMode = searchDataSource === "global_discovery"
  const isRootGlobalSearchMode = searchDataSource === "global_search"
  const shouldFetchRootAllCounts =
    isFullResultsMode && activeResultTab === "all" && (isDiscoveryMode || isRootGlobalSearchMode)
  const shouldFetchRootAllSections =
    isFullResultsMode && activeResultTab === "all" && (isDiscoveryMode || isRootGlobalSearchMode)

  const fullResultsCountsQuery = useQuery({
    queryKey: [
      "global-search",
      "full-counts",
      isDiscoveryMode ? "discovery" : "search",
      searchValue.trim(),
      committedSelectedTypes,
    ],
    queryFn: ({ signal }) =>
      isDiscoveryMode
        ? (console.log("[discovery fetch start]", {
            effectivePathname,
            q: searchValue,
            kind: "counts",
          }),
          fetchGlobalSearchDiscoveryCounts({
            entityTypes: allTabEntityTypesOrNull,
            signal,
          }).then((result) => {
            console.log("[discovery fetch success]", {
              kind: "counts",
              sectionCount: Object.keys(result ?? {}).length,
            })
            return result
          }))
        : fetchGlobalSearchAllTabCounts({
            query: searchValue.trim(),
            signal,
          }),
    enabled: shouldFetchRootAllCounts,
    staleTime: 10_000,
  })

  const allTabSectionsQuery = useQuery({
    queryKey: ["global-search", "all-tab-sections", isDiscoveryMode ? "discovery" : "search", searchValue.trim(), committedSelectedTypes],
    queryFn: ({ signal }) =>
      isDiscoveryMode
        ? (console.log("[discovery fetch start]", {
            effectivePathname,
            q: searchValue,
            kind: "sections",
          }),
          fetchGlobalSearchDiscoverySections({
            entityTypes: allTabEntityTypesOrNull,
            perTypeLimit: 10,
            signal,
          }).then((result) => {
            console.log("[discovery fetch success]", {
              kind: "sections",
              sectionCount: result.length,
            })
            return result
          }))
        : fetchGlobalSearchAllTabItems({
            query: searchValue.trim(),
            perTypeLimit: 10,
            signal,
          }),
    enabled: shouldFetchRootAllSections,
  })

  const saveHistoryMutation = useMutation({
    mutationFn: addGlobalSearchHistory,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["global-search", "header-history"] })
    },
  })

  useEffect(() => {
    if (!isFullResultsMode) {
      setIsSearching(false)
      return
    }

    if (activeResultTab === "all") {
      if (!allTabSectionsQuery.isFetching) {
        setIsSearching(false)
      }
      return
    }

    setIsSearching(false)
  }, [
    activeResultTab,
    allTabSectionsQuery.isFetching,
    fullResultsCountsQuery.isFetching,
    isDiscoveryMode,
    isFullResultsMode,
  ])

  const persistSearchTerm = useCallback(
    (query: string) => {
      const normalized = query.trim()
      if (!normalized) return
      saveHistoryMutation.mutate(normalized)
    },
    [saveHistoryMutation],
  )

  const setDraftQuery = useCallback(
    (value: string) => {
      latestSearchInputRef.current = value
      setSearchDraftValue(value)
    },
    [setSearchDraftValue],
  )

  const navigateWithParams = useCallback(
    (targetPath: string, nextParams: URLSearchParams, source = "global-search-controller") => {
      shallowReplaceSearchParams(targetPath, nextParams, source)
    },
    [],
  )

  const commitSearch = useCallback(
    (args?: {
      nextQuery?: string
      preferredTab?: GlobalSearchResultTab
      persistHistory?: boolean
    }) => {
      const rawQueryFromInput = args?.nextQuery
      const normalized = (rawQueryFromInput ?? latestSearchInputRef.current ?? searchDraftValue).trim()
      markLatestSearchSubmit(normalized || null)
      const pendingTypes = [...pendingSelectedTypesRef.current]
      const selectedSearchScope: GlobalSearchResultTab =
        args?.preferredTab ?? getSearchScopeFromTypes(pendingTypes)
      const scopedEntityType = routeTabToEntityType(selectedSearchScope)
      const nextCommittedTypes = scopedEntityType ? [scopedEntityType] : []
      // Prefer live window params so shallow URL state (object=task, panes, etc.) is preserved.
      const liveSearchParams =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams(searchParams.toString())
      setSearchDraftValue(normalized)
      setSelectedDetailTarget(null)
      setIsSearching(Boolean(normalized))
      if (!normalized) {
        setSearchValue("")
        setSearchDraftValue("")
        setIsOpen(false)
        setIsFullResultsMode(true)
        setCommittedSelectedTypes(nextCommittedTypes)
        if (isTasksRoute) {
          setActiveResultTab("all")
          const nextParams = new URLSearchParams(liveSearchParams.toString())
          nextParams.delete("q")
          clearNonTaskDetailParams(nextParams)
          shallowReplaceSearchParams(effectivePathname, nextParams, "commitSearch-empty")
        } else if (isPrimaryRoute) {
          const nextParams = new URLSearchParams(liveSearchParams.toString())
          nextParams.delete("q")
          navigateWithParams(effectivePathname, nextParams, "commitSearch-empty")
        } else {
          const nextParams = new URLSearchParams(liveSearchParams.toString())
          nextParams.delete("q")
          shallowReplaceSearchParams(effectivePathname, nextParams, "commitSearch-empty")
        }
        return
      }

      const nextVisibleTabs: GlobalSearchResultTab[] = [
        "all",
        ...(nextCommittedTypes.length > 0 ? nextCommittedTypes : DEFAULT_VISIBLE_RESULT_TYPES),
      ]
      const nextTab: GlobalSearchResultTab = selectedSearchScope
      const isGenericGlobalSubmit = nextTab === "all"
      setSearchValue(normalized)
      setCommittedSelectedTypes(nextCommittedTypes)
      setActiveResultTab(resolveDefaultTab(nextVisibleTabs, nextTab))
      setIsOpen(false)
      setIsFullResultsMode(true)
      void queryClient.invalidateQueries({ queryKey: ["global-search", "all-tab-sections"] })
      void queryClient.invalidateQueries({ queryKey: ["global-search", "full-counts"] })
      void queryClient.invalidateQueries({ queryKey: ["global-search", "full"] })

      if (isGenericGlobalSubmit) {
        const nextRoute = buildSearchSubmitRoute(normalized, "all", liveSearchParams)
        if (process.env.NODE_ENV === "development") {
          console.log("[search submit]", {
            rawQueryFromInput,
            submittedQuery: normalized,
            routeQ: liveSearchParams.get("q"),
            searchScope: selectedSearchScope,
            currentPathname: effectivePathname,
            targetPathname: nextRoute.pathname,
          })
        }
        navigateWithParams(nextRoute.pathname, nextRoute.searchParams, "commitSearch")
      } else if (isPrimaryRoute) {
        const targetObjectRoute = tabToObjectRoute(nextTab)
        const nextRoute = buildSearchSubmitRoute(
          normalized,
          targetObjectRoute,
          liveSearchParams,
        )
        const nextParams = nextRoute.searchParams
        if (targetObjectRoute !== "task") {
          clearTaskContextSearchParams(nextParams)
        }
        nextParams.delete("type")
        nextParams.delete("entity")
        nextParams.delete("id")
        nextParams.delete("threadId")
        nextParams.delete("mentionId")
        if (process.env.NODE_ENV === "development") {
          console.log("[search submit]", {
            rawQueryFromInput,
            submittedQuery: normalized,
            routeQ: liveSearchParams.get("q"),
            searchScope: selectedSearchScope,
            currentPathname: effectivePathname,
            targetPathname: nextRoute.pathname,
          })
        }
        navigateWithParams(nextRoute.pathname, nextParams, "commitSearch")
      } else {
        const nextParams = new URLSearchParams(liveSearchParams.toString())
        if (normalized) nextParams.set("q", normalized)
        else nextParams.delete("q")
        shallowReplaceSearchParams(effectivePathname, nextParams, "commitSearch")
      }

      if (args?.persistHistory !== false) {
        persistSearchTerm(normalized)
      }
    },
    [
      persistSearchTerm,
      searchDraftValue,
      isPrimaryRoute,
      isTasksRoute,
      navigateWithParams,
      effectivePathname,
      queryClient,
      searchParams,
      setSearchDraftValue,
      setSelectedTaskId,
      setSelectedTaskSeed,
      setSearchValue,
    ],
  )

  const handleHistorySelect = useCallback(
    (term: string) => {
      commitSearch({ nextQuery: term })
    },
    [commitSearch],
  )

  const handleShowMore = useCallback(
    (entityType: GlobalSearchItemEntityType, nextQuery?: string) => {
      commitSearch({ preferredTab: entityType, nextQuery })
    },
    [commitSearch],
  )

  const handleShowAll = useCallback((nextQuery?: string) => {
    // "Show all" always opens mixed global results (object=all), ignoring type pills.
    pendingSelectedTypesRef.current = []
    setPendingSelectedTypes([])
    commitSearch({ nextQuery, preferredTab: "all" })
  }, [commitSearch])

  const navigateToTasksSeeMore = useCallback(
    (sectionType: string) => {
      const base = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : searchParams.toString(),
      )
      const filters = getTaskFiltersForDiscoverySection(sectionType, currentUserId) ?? EMPTY_TASK_FILTERS
      const next = buildSeeMoreTasksSearchParams(base, filters)
      next.delete("view")
      next.delete("filter")
      markObjectNavigation()
      shallowPushSearchParams(effectivePathname, next, "home-tasks-see-more")
    },
    [currentUserId, effectivePathname, searchParams],
  )

  const handleAllTabShowMore = useCallback((section: GlobalSearchSection) => {
    const normalizedType = section.type.toLowerCase()
    if (isDiscoveryMode) {
      if (getTaskFiltersForDiscoverySection(section.type, currentUserId)) {
        navigateToTasksSeeMore(section.type)
        return
      }
      if (normalizedType === "projects" || normalizedType === "project") {
        const nextRoute = buildObjectRoute("project", new URLSearchParams(searchParams.toString()))
        shallowReplaceSearchParams(nextRoute.pathname, nextRoute.searchParams, "global-search-show-more")
        return
      }
      if (normalizedType === "mentions" || normalizedType === "mention") {
        const nextRoute = buildObjectRoute("mention", new URLSearchParams(searchParams.toString()))
        shallowReplaceSearchParams(nextRoute.pathname, nextRoute.searchParams, "global-search-show-more")
        return
      }
    }

    if (section.entity_type) {
      const nextTab: GlobalSearchResultTab = section.entity_type
      setActiveResultTab(nextTab)
      const normalizedQuery = searchValue.trim()
      const nextRoute = buildSearchSubmitRoute(
        normalizedQuery,
        tabToObjectRoute(nextTab),
        new URLSearchParams(searchParams.toString()),
      )
      const nextParams = nextRoute.searchParams
      nextParams.delete("type")
      nextParams.delete("entity")
      nextParams.delete("id")
      navigateWithParams(nextRoute.pathname, nextParams)
    }
  }, [currentUserId, isDiscoveryMode, navigateToTasksSeeMore, navigateWithParams, searchParams, searchValue])

  const togglePendingTypeFilter = useCallback((entityType: GlobalSearchItemEntityType) => {
    setPendingSelectedTypes((current) => {
      const next = current[0] === entityType ? [] : [entityType]
      pendingSelectedTypesRef.current = next
      return next
    })
  }, [])

  const registerAiThreadOpener = useCallback((opener: ((threadId: string) => void) | null) => {
    aiThreadOpenerRef.current = opener
  }, [])

  const registerTaskResultOpener = useCallback((opener: ((item: GlobalSearchDocument) => void) | null) => {
    taskResultOpenerRef.current = opener
  }, [])

  const selectResultTab = useCallback((tab: GlobalSearchResultTab) => {
    if (isPillNavigationLockedRef.current) return
    isPillNavigationLockedRef.current = true
    queueMicrotask(() => {
      isPillNavigationLockedRef.current = false
    })

    const nextTab = tab !== "all" && activeResultTab === tab ? "all" : tab
    setActiveResultTab(nextTab)
    setSelectedDetailTarget(null)
    const normalizedQuery = searchValue.trim()
    if (isPrimaryRoute) {
      const nextRoute = buildSearchSubmitRoute(
        normalizedQuery,
        tabToObjectRoute(nextTab),
        new URLSearchParams(searchParams.toString()),
      )
      const nextParams = nextRoute.searchParams
      nextParams.delete("type")
      nextParams.delete("entity")
      nextParams.delete("id")
      nextParams.delete("threadId")
      nextParams.delete("mentionId")
      navigateWithParams(nextRoute.pathname, nextParams)
      return
    }
    const nextParams = new URLSearchParams(searchParams.toString())
    if (normalizedQuery) nextParams.set("q", normalizedQuery)
    else nextParams.delete("q")
    clearNonTaskDetailParams(nextParams)
    shallowReplaceSearchParams(effectivePathname, nextParams, "global-search-select-tab")
  }, [activeResultTab, isPrimaryRoute, navigateWithParams, effectivePathname, searchParams, searchValue])

  const clearSearch = useCallback(() => {
    setSearchDraftValue("")
    setSearchValue("")
    setPendingSelectedTypes([])
    setCommittedSelectedTypes([])
    if (!isPrimaryRoute) {
      setActiveResultTab("all")
    }
    setIsFullResultsMode(true)
    setSelectedDetailTarget(null)
    if (isPrimaryRoute) {
      const nextParams = new URLSearchParams(searchParams.toString())
      nextParams.delete("q")
      navigateWithParams(effectivePathname, nextParams)
    } else {
      const nextParams = new URLSearchParams(searchParams.toString())
      nextParams.delete("q")
      clearNonTaskDetailParams(nextParams)
      shallowReplaceSearchParams(effectivePathname, nextParams, "global-search-clear-search")
    }
  }, [
    isPrimaryRoute,
    navigateWithParams,
    effectivePathname,
    searchParams,
    setPendingSelectedTypes,
    setSearchDraftValue,
    setSearchValue,
    setCommittedSelectedTypes,
    setActiveResultTab,
    setSelectedDetailTarget,
  ])

  const closeDetailTarget = useCallback(() => {
    setSelectedDetailTarget(null)
  }, [])

  const openSearchResult = useCallback(
    (item: GlobalSearchDocument) => {
      seedEntityPreviewFromSearchDocument(queryClient, item)

      const draftQuery = (latestSearchInputRef.current ?? searchDraftValue).trim()
      if (draftQuery) {
        persistSearchTerm(draftQuery)
      }

      const isUnifiedRoute = isPrimaryRoute && !isTasksRoute
      const trackOpen = () => {
        const entityId = getTrackingEntityId(item)
        if (!entityId) return
        const trackingType = getTrackingEntityType(item)
        const title =
          (typeof item.title === "string" && item.title.trim()) || entityId
        if (trackingType === "task") {
          bumpAndInvalidateHomeSidebarRecent(queryClient, "tasks", { id: entityId, title })
        } else if (trackingType === "project") {
          bumpAndInvalidateHomeSidebarRecent(queryClient, "projects", { id: entityId, title })
        } else if (trackingType === "user") {
          bumpAndInvalidateHomeSidebarRecent(queryClient, "users", { id: entityId, title })
        } else if (trackingType === "artifact") {
          bumpAndInvalidateHomeSidebarRecent(queryClient, "artifacts", { id: entityId, title })
        } else {
          void queryClient.invalidateQueries({ queryKey: ["home-sidebar-recents"] })
        }
        void trackGlobalObjectOpen({
          entityType: trackingType,
          entityId,
        })
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: ["global-search", "header-recently-opened"] })
          })
          .catch((error) => {
            console.debug("track_global_object_open failed", error)
          })
      }

      setIsOpen(false)
      const currentParams =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams(searchParams.toString())
      const isAiRightPane =
        currentParams.get("rightView") === "ai" && currentParams.get("taskAiOpen") === "true"

      const maybeMarkMentionSeen = async () => {
        if (item.entity_type !== "mention") return
        const mentionId = optionalString(item.entity_id)
        if (!mentionId || currentUserId == null) return
        const mentionNumericId = Number(mentionId)
        if (!Number.isFinite(mentionNumericId)) return
        queryClient.setQueriesData({ queryKey: ["global-search", "full"] }, (currentData: any) => {
          if (!currentData?.pages || !Array.isArray(currentData.pages)) return currentData
          return {
            ...currentData,
            pages: currentData.pages.map((page: GlobalSearchDocument[]) =>
              page.map((entry) => markMentionAsSeenInDocument(entry, mentionId)),
            ),
          }
        })
        queryClient.setQueriesData({ queryKey: ["global-search", "all-tab-sections"] }, (currentData: any) => {
          if (!Array.isArray(currentData)) return currentData
          return markMentionAsSeenInSections(currentData as GlobalSearchSection[], mentionId)
        })
        try {
          const { error } = await supabase
            .from("seen_mentions")
            .upsert(
            {
              mention_id: mentionNumericId,
              seen_by_id: currentUserId,
            },
            { onConflict: "mention_id,seen_by_id" },
          )
          if (error) {
            console.debug("seen_mentions upsert failed", error)
          }
        } catch (err) {
          console.debug("seen_mentions upsert exception", err)
        }
      }

      if (isAiThreadItem(item)) {
        const threadId =
          item.entity_id ??
          ((typeof item.raw.thread_id === "string" && item.raw.thread_id) ||
            (typeof item.raw.id === "string" && item.raw.id) ||
            null)
        if (!threadId) return
        aiThreadOpenerRef.current?.(threadId)
        if (isUnifiedRoute) {
          const next = applyAiThreadOpenParams(new URLSearchParams(searchParams.toString()), String(threadId))
          shallowReplaceSearchParams(effectivePathname, next, "global-search-open-result")
        }
        trackOpen()
        void maybeMarkMentionSeen()
        return
      }

      if (item.entity_type === "artifact") {
        const artifactId =
          optionalString(item.entity_id) ??
          optionalString(item.raw.artifact_id) ??
          optionalString(item.raw.id)
        if (!artifactId) return
        openArtifactCenterTab({
          artifactId,
          title: typeof item.title === "string" ? item.title : null,
          pathname: effectivePathname,
        })
        trackOpen()
        void maybeMarkMentionSeen()
        return
      }

      if (item.entity_type === "task" && item.entity_id) {
        const delegatedTaskOpen = taskResultOpenerRef.current
        if (delegatedTaskOpen) {
          delegatedTaskOpen(item)
        } else {
          setSelectedDetailTarget(null)
          setSelectedTaskSeed(globalSearchDocumentToRowPayload(item))
          setSelectedTaskId(String(item.entity_id))
          const nextParams = isAiRightPane
            ? buildCenterPaneSelectionSearchParams({
                currentSearchParams: currentParams,
                entity: "task",
                id: String(item.entity_id),
              })
            : buildRightPaneSelectionSearchParams({
                currentSearchParams: currentParams,
                entity: "task",
                id: String(item.entity_id),
              })
          if (isUnifiedRoute) {
            shallowReplaceSearchParams(effectivePathname, nextParams, "global-search-open-result")
          } else {
            nextParams.delete("itemKind")
            nextParams.delete("focus")
            clearNonTaskDetailParams(nextParams)
            shallowReplaceSearchParams(effectivePathname, nextParams, "global-search-open-result")
          }
        }
        trackOpen()
        void maybeMarkMentionSeen()
        return
      }

      const detailTarget: GlobalSearchDetailTarget = {
        entityType: item.entity_type as GlobalSearchEntityType,
        entityId:
          item.entity_type === "mention" && !isUnifiedRoute
            ? optionalString(item.thread_id ?? item.raw.thread_id ?? item.raw.threadId ?? item.entity_id)
            : optionalString(item.entity_id),
        projectId: optionalString(item.project_id ?? item.raw.project_id ?? item.raw.projectId),
        taskId: optionalString(item.task_id ?? item.raw.task_id ?? item.raw.taskId),
        threadId: optionalString(item.thread_id ?? item.raw.thread_id ?? item.raw.threadId),
        mentionId: item.entity_type === "mention" ? optionalString(item.entity_id) : null,
        briefingTypeId: optionalNumber(
          item.raw.briefing_type_id ??
            item.raw.briefingTypeId ??
            item.raw.briefing_id ??
            item.raw.briefingId,
        ),
        title: item.display_payload?.title ?? item.title,
      }

      setSelectedTaskId(null)
      setSelectedTaskSeed(null)
      setSelectedDetailTarget(detailTarget)
      if (isUnifiedRoute) {
        if (detailTarget.entityType === "mention") {
          const threadId =
            optionalString(item.thread_id ?? item.raw.thread_id ?? item.raw.threadId) ??
            optionalString(detailTarget.threadId)
          if (threadId) {
            // Threads always open in the middle/details pane so the right column stays free for AI.
            const next = buildCenterPaneSelectionSearchParams({
              currentSearchParams: currentParams,
              entity: "thread",
              id: threadId,
              mentionId: item.entity_id != null ? String(item.entity_id) : null,
            })
            if (!isAiRightPane && next.get("rightView") === "ai") {
              next.set("rightView", "details")
              next.delete("taskAiOpen")
            }
            shallowReplaceSearchParams(effectivePathname, next, "global-search-open-result")
          }
        } else if (detailTarget.entityType === "project" || detailTarget.entityType === "project_briefing") {
          const projectId = optionalString(item.project_id ?? item.raw.project_id ?? item.raw.projectId ?? item.entity_id)
          if (projectId) {
            const next = isAiRightPane
              ? buildCenterPaneSelectionSearchParams({
                  currentSearchParams: currentParams,
                  entity: "project",
                  id: projectId,
                  tab: detailTarget.entityType === "project_briefing" ? "briefings" : null,
                })
              : buildRightPaneSelectionSearchParams({
                  currentSearchParams: currentParams,
                  entity: "project",
                  id: projectId,
                  tab: detailTarget.entityType === "project_briefing" ? "briefings" : "overview",
                })
            if (detailTarget.entityType === "project_briefing" && detailTarget.briefingTypeId != null) {
              next.set("briefingTypeId", String(detailTarget.briefingTypeId))
            } else {
              next.delete("briefingTypeId")
            }
            shallowReplaceSearchParams(effectivePathname, next, "global-search-open-result")
          }
        } else if (detailTarget.entityType === "user" && item.entity_id != null) {
          const next = isAiRightPane
            ? buildCenterPaneSelectionSearchParams({
                currentSearchParams: currentParams,
                entity: "user",
                id: String(item.entity_id),
                tab: null,
              })
            : buildRightPaneSelectionSearchParams({
                currentSearchParams: currentParams,
                entity: "user",
                id: String(item.entity_id),
                tab: "overview",
              })
          shallowReplaceSearchParams(effectivePathname, next, "global-search-open-result")
        } else if (detailTarget.entityType === "team" && item.entity_id != null) {
          const next = isAiRightPane
            ? buildCenterPaneSelectionSearchParams({
                currentSearchParams: currentParams,
                entity: "team",
                id: String(item.entity_id),
                tab: null,
              })
            : buildRightPaneSelectionSearchParams({
                currentSearchParams: currentParams,
                entity: "team",
                id: String(item.entity_id),
                tab: "overview",
              })
          shallowReplaceSearchParams(effectivePathname, next, "global-search-open-result")
        }
      } else {
        if (detailTarget.entityType === "mention") {
          const threadId =
            optionalString(item.thread_id ?? item.raw.thread_id ?? item.raw.threadId) ??
            optionalString(detailTarget.threadId)
          if (threadId) {
            const next = buildCenterPaneSelectionSearchParams({
              currentSearchParams: currentParams,
              entity: "thread",
              id: threadId,
              mentionId: detailTarget.mentionId,
            })
            if (!isAiRightPane && next.get("rightView") === "ai") {
              next.set("rightView", "details")
              next.delete("taskAiOpen")
            }
            next.delete("itemKind")
            next.delete("focus")
            shallowReplaceSearchParams(effectivePathname, next, "global-search-open-result")
          }
        } else if (detailTarget.entityType === "project" || detailTarget.entityType === "project_briefing") {
          const projectId = optionalString(item.project_id ?? item.raw.project_id ?? item.raw.projectId ?? item.entity_id)
          if (projectId) {
            const next = isAiRightPane
              ? buildCenterPaneSelectionSearchParams({
                  currentSearchParams: currentParams,
                  entity: "project",
                  id: projectId,
                  tab: detailTarget.entityType === "project_briefing" ? "briefings" : null,
                })
              : buildRightPaneSelectionSearchParams({
                  currentSearchParams: currentParams,
                  entity: "project",
                  id: projectId,
                  tab: detailTarget.entityType === "project_briefing" ? "briefings" : "overview",
                })
            if (detailTarget.entityType === "project_briefing" && detailTarget.briefingTypeId != null) {
              next.set("briefingTypeId", String(detailTarget.briefingTypeId))
            } else {
              next.delete("briefingTypeId")
            }
            next.delete("itemKind")
            next.delete("focus")
            shallowReplaceSearchParams(effectivePathname, next, "global-search-open-result")
          }
        } else if (detailTarget.entityType === "user" && detailTarget.entityId != null) {
          const next = isAiRightPane
            ? buildCenterPaneSelectionSearchParams({
                currentSearchParams: currentParams,
                entity: "user",
                id: detailTarget.entityId,
                tab: null,
              })
            : buildRightPaneSelectionSearchParams({
                currentSearchParams: currentParams,
                entity: "user",
                id: detailTarget.entityId,
                tab: "overview",
              })
          next.delete("itemKind")
          next.delete("focus")
          shallowReplaceSearchParams(effectivePathname, next, "global-search-open-result")
        } else if (detailTarget.entityType === "team" && detailTarget.entityId != null) {
          const next = isAiRightPane
            ? buildCenterPaneSelectionSearchParams({
                currentSearchParams: currentParams,
                entity: "team",
                id: detailTarget.entityId,
                tab: null,
              })
            : buildRightPaneSelectionSearchParams({
                currentSearchParams: currentParams,
                entity: "team",
                id: detailTarget.entityId,
                tab: "overview",
              })
          next.delete("itemKind")
          next.delete("focus")
          shallowReplaceSearchParams(effectivePathname, next, "global-search-open-result")
        }
      }
      trackOpen()
      void maybeMarkMentionSeen()
    },
    [
      activeResultTab,
      isPrimaryRoute,
      isTasksRoute,
      navigateWithParams,
      effectivePathname,
      currentUserId,
      persistSearchTerm,
      queryClient,
      searchDraftValue,
      searchParams,
      searchValue,
      setSelectedDetailTarget,
      setSelectedTaskId,
      setSelectedTaskSeed,
      supabase,
    ],
  )

  const getFullResultsQueryKey = useCallback(
    (entityType: GlobalSearchItemEntityType) => {
      // Object lists filter locally — keep their cache key free of the typed query.
      const usesLocalFilter =
        entityType === "project" ||
        entityType === "user" ||
        entityType === "artifact" ||
        entityType === "ai_thread" ||
        entityType === "mention"
      return [
        "global-search",
        "full",
        routeObject,
        usesLocalFilter ? "object-list" : objectDataSource,
        usesLocalFilter ? "" : searchValue.trim(),
        entityType,
      ]
    },
    [objectDataSource, routeObject, searchValue],
  )

  const fetchFullResultsPage = useCallback(
    async ({
      entityType,
      offset,
      limit,
      signal,
    }: {
      entityType: GlobalSearchItemEntityType
      offset: number
      limit: number
      signal?: AbortSignal
    }) => {
      const requestId = ++objectFetchRequestIdRef.current
      console.log("[object fetch start]", {
        requestId,
        effectivePathname,
        q: searchValue,
        objectType: entityType,
      })
      const trimmedQuery = searchValue.trim()
      const isObjectRoute =
        routeObject !== "all" && routeObject !== "task"
      const hasQuery = Boolean(trimmedQuery)
      const isRootAllNoQuery = routeObject === "all" && !hasQuery

      try {
        if (isRootAllNoQuery) {
          // Root all + empty query is discovery mode in the all-tab query path.
          console.log("[object fetch success]", {
            objectType: entityType,
            count: 0,
            raw: [],
          })
          return []
        }

        let items: GlobalSearchDocument[] = []
        const sortAlphabetically =
          entityType === "project" || entityType === "user"
        // Left-pane object lists filter locally; always load discovery so typing never refetches.
        const preferDiscoveryList =
          isObjectRoute &&
          (entityType === "project" ||
            entityType === "user" ||
            entityType === "artifact" ||
            entityType === "ai_thread")
        const byTitleAsc = (left: GlobalSearchDocument, right: GlobalSearchDocument) => {
          const leftTitle = (left.display_payload?.title ?? left.title ?? "").trim()
          const rightTitle = (right.display_payload?.title ?? right.title ?? "").trim()
          return leftTitle.localeCompare(rightTitle, undefined, { sensitivity: "base", numeric: true })
        }
        if (!preferDiscoveryList && (hasQuery || !isObjectRoute)) {
          items = await fetchGlobalSearchDocumentsByType({
            query: trimmedQuery,
            entityType,
            offset,
            limit,
            signal,
          })
          if (sortAlphabetically) {
            items = [...items].sort(byTitleAsc)
          }
        } else {
          // Projects/users: pull a wide discovery page, sort A–Z, then slice for pagination.
          const discoveryLimit =
            sortAlphabetically || preferDiscoveryList
              ? Math.max(500, offset + limit)
              : Math.max(limit, offset + limit)
          const sections = await fetchGlobalSearchDiscoverySections({
            entityTypes: [entityType],
            perTypeLimit: discoveryLimit,
            // Do not inherit stale route-cancel signals for empty-query object list fetches.
          })
          const section =
            sections.find((entry) => entry.type === entityType) ??
            sections.find((entry) => entry.entity_type === entityType) ??
            sections.find((entry) =>
              entityType === "ai_thread"
                ? entry.type === "ai_threads" || entry.entity_type === "ai_thread"
                : false,
            )
          const discoveredItems = section?.items ?? []
          const ordered = sortAlphabetically
            ? [...discoveredItems].sort(byTitleAsc)
            : discoveredItems
          items = ordered.slice(offset, offset + limit)
        }
        if (requestId !== objectFetchRequestIdRef.current) {
          console.debug("[object fetch stale success ignored]", {
            requestId,
            currentRequestId: objectFetchRequestIdRef.current,
            objectType: entityType,
          })
          return items
        }
        console.log("[object fetch success]", {
          requestId,
          objectType: entityType,
          count: items.length,
          raw: items,
        })
        return items
      } catch (error) {
        if (isAbortError(error)) {
          console.debug("[object fetch aborted]", {
            requestId,
            effectivePathname,
            q: searchValue,
            objectType: entityType,
          })
          throw error
        }
        console.error("[object fetch error]", {
          requestId,
          effectivePathname,
          q: searchValue,
          objectType: entityType,
          error,
        })
        throw error
      } finally {
        console.log("[object fetch finally]", {
          requestId,
          effectivePathname,
          q: searchValue,
          objectType: entityType,
        })
      }
    },
    [effectivePathname, routeObject, searchValue],
  )

  const allTabSections = (allTabSectionsQuery.data ?? []) as GlobalSearchSection[]
  const allTabCounts = (fullResultsCountsQuery.data ?? {}) as GlobalSearchCountsMap
  const visibleCounts = visibleEntityTypes
    .map((entityType) => allTabCounts[entityType])
    .filter((count): count is number => typeof count === "number")
  const allCount = visibleCounts.length > 0 ? visibleCounts.reduce((sum, count) => sum + count, 0) : undefined

  return {
    draftQuery: searchDraftValue,
    committedQuery: searchValue,
    isOpen,
    setIsOpen,
    isFullResultsMode,
    setIsFullResultsMode,
    isSearching,
    activeResultTab,
    setActiveResultTab,
    selectResultTab,
    visibleTabs,
    visibleEntityTypes,
    pendingSelectedTypes,
    committedSelectedTypes,
    togglePendingTypeFilter,
    selectedDetailTarget,
    closeDetailTarget,
    historyItems: [],
    isHistoryLoading: false,
    previewItems: [],
    previewCounts: {},
    isDiscoveryMode,
    allTabSections,
    allTabCounts,
    fullResultsCounts: {
      ...allTabCounts,
      ...(typeof allCount === "number" ? { all: allCount } : {}),
    },
    isPreviewLoading: false,
    isAllTabLoading: allTabSectionsQuery.isLoading,
    isFullResultsCountsLoading: fullResultsCountsQuery.isFetching,
    setDraftQuery,
    clearSearch,
    commitSearch,
    handleHistorySelect,
    handleShowAll,
    handleShowMore,
    handleAllTabShowMore,
    handleHomeTasksSeeMore: navigateToTasksSeeMore,
    registerAiThreadOpener,
    registerTaskResultOpener,
    openSearchResult,
    getFullResultsQueryKey,
    fetchFullResultsPage,
  }
}
