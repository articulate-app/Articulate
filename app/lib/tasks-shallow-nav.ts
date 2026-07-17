/** Dispatched after `history.replaceState` updates the tasks URL (no Next.js soft navigation). */
export const TASKS_SHALLOW_NAV_EVENT = "articulate:tasks-shallow-nav" as const

let lastSubmittedQuerySnapshot: string | null = null
let lastSearchSubmitAtMs = 0
let lastObjectNavigationAtMs = 0

export function markLatestSearchSubmit(query: string | null) {
  lastSubmittedQuerySnapshot = query && query.trim().length > 0 ? query.trim() : null
  lastSearchSubmitAtMs = Date.now()
}

export function markObjectNavigation() {
  lastObjectNavigationAtMs = Date.now()
}

export function isRecentObjectNavigation(windowMs = 500) {
  return Date.now() - lastObjectNavigationAtMs < windowMs
}

export function dispatchTasksShallowNavigation() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(TASKS_SHALLOW_NAV_EVENT))
}

/** Updates `?search` without Next.js soft navigation (avoids `_rsc` round-trips for local toolbar state). */
export function shallowReplaceSearchParams(pathname: string, next: URLSearchParams, source = "unlabeled") {
  if (typeof window === "undefined") return
  const current = new URLSearchParams(window.location.search)
  const merged = new URLSearchParams(next.toString())

  // Guard against stale shallow updates briefly dropping the selected briefing row.
  const isProjectBriefingsContext =
    merged.get("detailType") === "project" && merged.get("tab") === "briefings"
  if (
    isProjectBriefingsContext &&
    !merged.get("briefingTypeId") &&
    current.get("briefingTypeId")
  ) {
    merged.set("briefingTypeId", current.get("briefingTypeId") as string)
  }

  const submitted = lastSubmittedQuerySnapshot
  const recentSubmit = Date.now() - lastSearchSubmitAtMs < 1000
  const attemptedQ = merged.get("q")
  if (recentSubmit && submitted && attemptedQ && attemptedQ !== submitted) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[blocked stale q url write]", {
        source,
        attemptedQ,
        submitted,
        pathname,
      })
    }
    merged.set("q", submitted)
  }

  const q = merged.toString()
  const nextUrl = q ? `${pathname}?${q}` : pathname
  const currentUrl = `${window.location.pathname}${window.location.search}`
  if (process.env.NODE_ENV === "development") {
    console.log("[url write]", {
      source,
      nextUrl,
      q: merged.get("q"),
      pathname,
    })
  }
  if (nextUrl === currentUrl) return
  window.history.replaceState({}, "", nextUrl)
  dispatchTasksShallowNavigation()
}

/** Updates full URL via replaceState and dispatches shallow-nav event. */
export function shallowReplaceFullUrl(nextUrl: string, source = "unlabeled") {
  if (typeof window === "undefined") return
  const currentUrl = `${window.location.pathname}${window.location.search}`
  if (process.env.NODE_ENV === "development") {
    console.log("[url write]", {
      source,
      nextUrl,
    })
  }
  if (nextUrl === currentUrl) return
  window.history.replaceState({}, "", nextUrl)
  dispatchTasksShallowNavigation()
}

/** Like `shallowReplaceSearchParams`, but uses pushState so browser Back returns to the prior URL. */
export function shallowPushSearchParams(pathname: string, next: URLSearchParams, source = "unlabeled") {
  if (typeof window === "undefined") return
  const q = next.toString()
  const nextUrl = q ? `${pathname}?${q}` : pathname
  const currentUrl = `${window.location.pathname}${window.location.search}`
  if (process.env.NODE_ENV === "development") {
    console.log("[url push]", { source, nextUrl, pathname })
  }
  if (nextUrl === currentUrl) return
  window.history.pushState({}, "", nextUrl)
  dispatchTasksShallowNavigation()
}
