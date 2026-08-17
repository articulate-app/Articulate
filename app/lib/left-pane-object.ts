import { getCurrentObjectRoute, type SearchObjectRoute } from "./search-routing"

export const LEFT_PANE_OBJECTS = [
  "tasks",
  "projects",
  "mentions",
  "users",
  "ai_chats",
  "artifacts",
] as const

export type LeftPaneObject = (typeof LEFT_PANE_OBJECTS)[number] | "all"

const LEFT_PANE_OBJECT_SET = new Set<string>([...LEFT_PANE_OBJECTS, "all"])

export function isLeftPaneObject(value: string | null | undefined): value is LeftPaneObject {
  return typeof value === "string" && LEFT_PANE_OBJECT_SET.has(value)
}

export function normalizeLeftPaneObject(value: string | null | undefined): LeftPaneObject {
  // Home ("all") is not a left-pane object; map legacy URLs to tasks.
  if (value === "all" || value === "home") return "tasks"
  if (value === "ai-threads") return "ai_chats"
  if (value === "artifact") return "artifacts"
  return isLeftPaneObject(value) && value !== "all" ? value : "tasks"
}

export function leftPaneObjectFromPath(pathname: string): LeftPaneObject {
  if (pathname === "/") return "tasks"
  if (pathname === "/projects" || pathname.startsWith("/projects/")) return "projects"
  if (pathname === "/mentions" || pathname.startsWith("/mentions/")) return "mentions"
  if (pathname === "/users" || pathname.startsWith("/users/")) return "users"
  // Teams moved to user/project preferences — legacy /teams URLs fall back to tasks.
  if (pathname === "/teams" || pathname.startsWith("/teams/")) return "tasks"
  if (pathname === "/ai-threads" || pathname.startsWith("/ai-threads/")) return "ai_chats"
  // Artifact deep links (`/artifacts/:id`) are standalone — only exact `/artifacts` is the list.
  if (pathname === "/artifacts") return "artifacts"
  return "tasks"
}

function objectRouteToLeftPaneObject(value: SearchObjectRoute): LeftPaneObject {
  if (value === "all") return "tasks"
  if (value === "task") return "tasks"
  if (value === "project") return "projects"
  if (value === "mention") return "mentions"
  if (value === "user") return "users"
  if (value === "ai_thread") return "ai_chats"
  if (value === "artifact") return "artifacts"
  // Teams are no longer left-pane objects.
  if (value === "team") return "tasks"
  return "tasks"
}

export type PrimarySectionKey = "tasks" | "projects" | "mentions" | "users" | "ai-threads" | "artifacts"

export function getPrimarySectionFromPath(pathname: string): PrimarySectionKey | null {
  if (pathname.startsWith("/tasks")) return "tasks"
  if (pathname.startsWith("/projects")) return "projects"
  if (pathname.startsWith("/users")) return "users"
  if (pathname.startsWith("/mentions")) return "mentions"
  if (pathname.startsWith("/ai-threads")) return "ai-threads"
  if (pathname === "/artifacts") return "artifacts"
  return null
}

export function leftPaneObjectToPath(value: LeftPaneObject): string {
  if (value === "all") return "/tasks"
  if (value === "projects") return "/projects"
  if (value === "mentions") return "/mentions"
  if (value === "users") return "/users"
  if (value === "ai_chats") return "/ai-threads"
  if (value === "artifacts") return "/artifacts"
  return "/tasks"
}

export function leftPaneObjectLabel(value: LeftPaneObject): string {
  if (value === "all") return "Tasks"
  if (value === "tasks") return "Tasks"
  if (value === "projects") return "Projects"
  if (value === "mentions") return "Mentions"
  if (value === "users") return "Users"
  if (value === "artifacts") return "Outputs"
  return "AI chats"
}

/**
 * Lean priority used by callers that only need the primary object types.
 */
export const OBJECT_PILL_PRIORITY: LeftPaneObject[] = ["tasks", "projects"]

/**
 * Greedy-fit priority for visible pills. Lower-priority types overflow first when space is tight.
 */
export const OBJECT_PILL_VISIBLE_PRIORITY: LeftPaneObject[] = [
  "tasks",
  "projects",
  "users",
  "mentions",
  "ai_chats",
  "artifacts",
]

/** Width thresholds (px of the *available* left-pane toolbar space, not the viewport). */
export const ADAPTIVE_OBJECT_SWITCHER_BREAKPOINTS = {
  /**
   * Below this, fall back to the compact single dropdown.
   * Keep low — hybrid greedy-fit already collapses pills; a high floor traps the UI in dropdown
   * whenever the left pane is a typical split width (~250–320px).
   */
  compactMax: 120,
  /** Convenience breakpoint for tests / callers; pills themselves fit greedily by width. */
  wideMin: 520,
} as const

/** Approx rendered pill geometry (px) used to greedily fit pills without overflowing the row. */
const OBJECT_PILL_OVERFLOW_TRIGGER_WIDTH = 78
const OBJECT_PILL_GAP = 4

/** h-7 px-2.5 chip (~20px padding) + ~7px per label char at text-[13px]. */
function estimateObjectPillWidth(object: LeftPaneObject): number {
  return Math.ceil(20 + leftPaneObjectLabel(object).length * 7)
}

export type AdaptiveObjectSwitcherMode = "dropdown" | "hybrid"

export type AdaptiveObjectSwitcherState = {
  mode: AdaptiveObjectSwitcherMode
  visibleObjects: LeftPaneObject[]
  overflowObjects: LeftPaneObject[]
}

/**
 * Decide how the left-pane object switcher should render for a given amount of available horizontal
 * space. Pure + deterministic so it can be unit-tested and reused.
 *
 * Rules:
 * - Very limited space -> compact dropdown, everything in overflow.
 * - Otherwise greedily fit as many object pills as the width allows (all of them when wide), with
 *   leftovers in the overflow menu. Task chrome is icon-only / in "…", so object pills are not capped.
 * - The active object is always represented: surfaced as a visible pill when there is room, otherwise
 *   left in overflow (the overflow trigger then displays the active object's label).
 */
export function getAdaptiveObjectSwitcherState({
  containerWidth,
  activeObject: _activeObject,
  isTaskView: _isTaskView,
}: {
  containerWidth: number
  activeObject: LeftPaneObject
  /** Kept for call-site compatibility; no longer caps pills (greedy fit for all views). */
  isTaskView: boolean
}): AdaptiveObjectSwitcherState {
  const all = [...LEFT_PANE_OBJECTS] as LeftPaneObject[]
  const dropdownState: AdaptiveObjectSwitcherState = {
    mode: "dropdown",
    visibleObjects: [],
    overflowObjects: all,
  }
  const toState = (visible: LeftPaneObject[]): AdaptiveObjectSwitcherState => {
    // De-dupe while preserving order, then derive overflow as "everything not visible" (canonical order).
    const seen = new Set<LeftPaneObject>()
    const visibleObjects = visible.filter((o) => (seen.has(o) ? false : (seen.add(o), true)))
    const overflowObjects = all.filter((o) => !seen.has(o))
    return { mode: "hybrid", visibleObjects, overflowObjects }
  }

  if (!Number.isFinite(containerWidth) || containerWidth < ADAPTIVE_OBJECT_SWITCHER_BREAKPOINTS.compactMax) {
    return dropdownState
  }

  const candidates = OBJECT_PILL_VISIBLE_PRIORITY.filter((o) => all.includes(o as (typeof LEFT_PANE_OBJECTS)[number]))

  // Fast path: if every candidate fits with no overflow at all, show them directly (no "More").
  {
    let total = 0
    candidates.forEach((o, i) => {
      total += estimateObjectPillWidth(o) + (i > 0 ? OBJECT_PILL_GAP : 0)
    })
    if (total <= containerWidth) return toState(candidates)
  }

  // Greedy fit, reserving room for the overflow ("More" / active-object) trigger.
  let used = OBJECT_PILL_OVERFLOW_TRIGGER_WIDTH + OBJECT_PILL_GAP
  const visible: LeftPaneObject[] = []
  for (const object of candidates) {
    const need = estimateObjectPillWidth(object) + (visible.length > 0 ? OBJECT_PILL_GAP : 0)
    if (used + need <= containerWidth) {
      used += need
      visible.push(object)
    } else {
      break
    }
  }

  if (visible.length === 0) return dropdownState
  return toState(visible)
}

export function resolveLeftPaneObject(params: { get: (key: string) => string | null }, pathname: string): LeftPaneObject {
  const routeObject = getCurrentObjectRoute(pathname, params)
  if (routeObject) {
    return objectRouteToLeftPaneObject(routeObject)
  }
  if (pathname === "/") {
    const q = params.get("q")?.trim() ?? ""
    const explicitType = params.get("type")
    if (q.length > 0 && !explicitType) {
      return "tasks"
    }
    const explicitObject = params.get("leftObject") ?? params.get("leftView")
    if (explicitObject) {
      return normalizeLeftPaneObject(explicitObject)
    }
    return "tasks"
  }
  const fromCanonicalPath = leftPaneObjectFromPath(pathname)
  if (fromCanonicalPath !== "tasks" || pathname.startsWith("/tasks")) {
    return fromCanonicalPath
  }
  return normalizeLeftPaneObject(params.get("leftObject") ?? params.get("leftView") ?? fromCanonicalPath)
}
