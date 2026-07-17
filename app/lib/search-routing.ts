import type { GlobalSearchResultTab } from "./global-search-types"

export const PANE_QUERY_KEYS = [
  "layout",
  "centerTaskId",
  "centerProjectId",
  "centerMentionId",
  "centerThreadId",
  "centerUserId",
  "centerTeamId",
  "id",
  "detailId",
  "detailType",
  "rightView",
  "rightTaskId",
  "rightProjectId",
  "rightThreadId",
  "rightUserId",
  "rightTeamId",
  "rightMentionId",
  "taskAiOpen",
  "aiThreadId",
] as const

export const SHARED_SEARCH_PARAMS = ["q", ...PANE_QUERY_KEYS] as const

export type SearchObjectRoute = "all" | "task" | "project" | "mention" | "user" | "team" | "ai_thread"

export const WORKSPACE_OBJECT_QUERY_KEY = "object"

export const OBJECT_ROUTE_PATHS: Record<SearchObjectRoute, string> = {
  all: "/",
  task: "/tasks",
  project: "/projects",
  mention: "/mentions",
  user: "/users",
  team: "/teams",
  ai_thread: "/ai-threads",
}

const ROUTE_OBJECT_ENTRIES = Object.entries(OBJECT_ROUTE_PATHS) as Array<[SearchObjectRoute, string]>
const SEARCH_OBJECT_ROUTE_SET = new Set<SearchObjectRoute>(Object.keys(OBJECT_ROUTE_PATHS) as SearchObjectRoute[])

export type WorkspaceObject = SearchObjectRoute

export type WorkspaceUrlState = {
  object: WorkspaceObject
  q: string
  layout?: string
  centerTaskId?: string
  centerProjectId?: string
  centerMentionId?: string
  centerThreadId?: string
  centerUserId?: string
  rightTaskId?: string
  rightProjectId?: string
  rightView?: string
  taskAiOpen?: string
  aiThreadId?: string
  groupBy?: string
  groupOrder?: string
  tasksView?: string
  topView?: string
  bottomView?: string
  split?: string
  splitView?: string
  assignedTo?: string
  deliveryDateFrom?: string
  deliveryDateTo?: string
  publicationDateFrom?: string
  publicationDateTo?: string
}

type SearchParamsLike = {
  get: (name: string) => string | null
}

function normalizeWorkspaceObject(value: string | null | undefined): WorkspaceObject {
  if (value && SEARCH_OBJECT_ROUTE_SET.has(value as WorkspaceObject)) {
    return value as WorkspaceObject
  }
  return "all"
}

export function objectRouteFromPathname(pathname: string): SearchObjectRoute {
  for (const [objectRoute, routePath] of ROUTE_OBJECT_ENTRIES) {
    if (routePath === "/") continue
    if (pathname === routePath || pathname.startsWith(`${routePath}/`)) return objectRoute
  }
  return "all"
}

export function parseWorkspaceUrlState(searchParams: URLSearchParams): WorkspaceUrlState {
  const read = (key: keyof WorkspaceUrlState): string | undefined => {
    const value = searchParams.get(key)
    return value != null && value !== "" ? value : undefined
  }
  return {
    object: normalizeWorkspaceObject(searchParams.get(WORKSPACE_OBJECT_QUERY_KEY)),
    q: searchParams.get("q")?.trim() ?? "",
    layout: read("layout"),
    centerTaskId: read("centerTaskId"),
    centerProjectId: read("centerProjectId"),
    centerMentionId: read("centerMentionId"),
    centerThreadId: read("centerThreadId"),
    centerUserId: read("centerUserId"),
    rightTaskId: read("rightTaskId"),
    rightProjectId: read("rightProjectId"),
    rightView: read("rightView"),
    taskAiOpen: read("taskAiOpen"),
    aiThreadId: read("aiThreadId"),
    groupBy: read("groupBy"),
    groupOrder: read("groupOrder"),
    tasksView: read("tasksView"),
    topView: read("topView"),
    bottomView: read("bottomView"),
    split: read("split"),
    splitView: read("splitView"),
    assignedTo: read("assignedTo"),
    deliveryDateFrom: read("deliveryDateFrom"),
    deliveryDateTo: read("deliveryDateTo"),
    publicationDateFrom: read("publicationDateFrom"),
    publicationDateTo: read("publicationDateTo"),
  }
}

export function buildWorkspaceUrl(state: WorkspaceUrlState, currentSearchParams?: URLSearchParams): string {
  const next = new URLSearchParams(currentSearchParams?.toString() ?? "")
  next.set(WORKSPACE_OBJECT_QUERY_KEY, state.object)
  if (state.q) next.set("q", state.q)
  else next.delete("q")
  const optionalKeys: Array<keyof WorkspaceUrlState> = [
    "layout",
    "centerTaskId",
    "centerProjectId",
    "centerMentionId",
    "centerThreadId",
    "centerUserId",
    "rightTaskId",
    "rightProjectId",
    "rightView",
    "taskAiOpen",
    "aiThreadId",
    "groupBy",
    "groupOrder",
    "tasksView",
    "topView",
    "bottomView",
    "split",
    "splitView",
    "assignedTo",
    "deliveryDateFrom",
    "deliveryDateTo",
    "publicationDateFrom",
    "publicationDateTo",
  ]
  for (const key of optionalKeys) {
    const value = state[key]
    if (typeof value === "string" && value.length > 0) next.set(key, value)
  }
  const query = next.toString()
  return query ? `/?${query}` : "/"
}

export function canonicalizeWorkspaceAliasPath(
  pathname: string,
  searchParams: URLSearchParams,
): { pathname: string; searchParams: URLSearchParams; changed: boolean } {
  const pathObject = objectRouteFromPathname(pathname)
  const next = new URLSearchParams(searchParams.toString())
  const currentObject = normalizeWorkspaceObject(next.get(WORKSPACE_OBJECT_QUERY_KEY))
  const targetObject = pathObject !== "all" ? pathObject : currentObject
  const normalizedObject = targetObject || "all"
  if (next.get(WORKSPACE_OBJECT_QUERY_KEY) !== normalizedObject) {
    next.set(WORKSPACE_OBJECT_QUERY_KEY, normalizedObject)
  }
  const shouldCanonicalizePath = pathname !== "/"
  const changed = shouldCanonicalizePath || next.toString() !== searchParams.toString()
  return {
    pathname: "/",
    searchParams: next,
    changed,
  }
}

export function getCurrentObjectRoute(pathname: string, searchParams?: SearchParamsLike): SearchObjectRoute {
  const queryObject = normalizeWorkspaceObject(searchParams?.get(WORKSPACE_OBJECT_QUERY_KEY))
  if (queryObject !== "all") return queryObject
  return objectRouteFromPathname(pathname)
}

export function copyPaneParams(from: URLSearchParams, to: URLSearchParams) {
  for (const key of PANE_QUERY_KEYS) {
    const value = from.get(key)
    if (value == null || value === "") continue
    to.set(key, value)
  }
}

function pickSharedSearchParams(currentSearchParams: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams()
  copyPaneParams(currentSearchParams, next)
  for (const key of SHARED_SEARCH_PARAMS) {
    if (key === "q") {
      const value = currentSearchParams.get(key)
      if (value != null && value !== "") next.set(key, value)
      continue
    }
    const value = currentSearchParams.get(key)
    if (value == null || value === "") continue
    next.set(key, value)
  }
  return next
}

export function buildObjectRoute(targetObject: SearchObjectRoute, currentSearchParams: URLSearchParams) {
  const pathname = "/"
  const searchParams = pickSharedSearchParams(currentSearchParams)
  searchParams.set(WORKSPACE_OBJECT_QUERY_KEY, targetObject)
  const query = searchParams.toString()
  return {
    pathname,
    searchParams,
    url: query ? `${pathname}?${query}` : pathname,
  }
}

export function buildSearchSubmitRoute(
  query: string,
  currentObject: SearchObjectRoute,
  currentSearchParams: URLSearchParams,
) {
  const { pathname, searchParams } = buildObjectRoute(currentObject, currentSearchParams)
  const normalized = query.trim()
  if (normalized) searchParams.set("q", normalized)
  else searchParams.delete("q")
  const nextQuery = searchParams.toString()
  return {
    pathname,
    searchParams,
    url: nextQuery ? `${pathname}?${nextQuery}` : pathname,
  }
}

export function clearSearchQuery(args: {
  pathname: string
  searchParams: URLSearchParams
}) {
  const nextSearchParams = new URLSearchParams(args.searchParams.toString())
  nextSearchParams.delete("q")
  const query = nextSearchParams.toString()
  return {
    pathname: args.pathname,
    searchParams: nextSearchParams,
    url: query ? `${args.pathname}?${query}` : args.pathname,
  }
}

export function getSearchMode(pathname: string, q: string | null | undefined) {
  const objectRoute = getCurrentObjectRoute(pathname)
  const normalizedQuery = q?.trim() ?? ""
  const hasQuery = normalizedQuery.length > 0
  if (objectRoute === "all" && !hasQuery) return "root-discovery" as const
  if (objectRoute === "all" && hasQuery) return "root-search" as const
  if (objectRoute === "task" && !hasQuery) return "tasks-home" as const
  if (objectRoute === "task" && hasQuery) return "tasks-search" as const
  if (hasQuery) return "object-search" as const
  return "object-home" as const
}

export type SearchDataSource =
  | "global_discovery"
  | "global_search"
  | "tasks"
  | "projects"
  | "mentions"
  | "users"
  | "teams"
  | "ai_threads"

export function resolveSearchDataSource({
  pathname,
  q,
  object,
}: {
  pathname: string
  q?: string | null
  object?: SearchObjectRoute | null
}): SearchDataSource {
  const normalized = q?.trim() ?? ""
  const routeObject = object ?? getCurrentObjectRoute(pathname)
  if (routeObject === "all") {
    if (!normalized) return "global_discovery"
    return "global_search"
  }

  if (routeObject === "task") return "tasks"
  if (routeObject === "project") return "projects"
  if (routeObject === "mention") return "mentions"
  if (routeObject === "user") return "users"
  if (routeObject === "team") return "teams"
  if (routeObject === "ai_thread") return "ai_threads"

  return "global_search"
}

export function tabToObjectRoute(tab: GlobalSearchResultTab): SearchObjectRoute {
  if (tab === "all") return "all"
  if (tab === "project_briefing") return "project"
  return tab
}
