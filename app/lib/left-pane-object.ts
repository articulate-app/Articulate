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
  // Homepage ("all") was removed from the switcher; map legacy URLs to tasks.
  if (value === "all") return "tasks"
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
  if (value === "all") return "/"
  if (value === "projects") return "/projects"
  if (value === "mentions") return "/mentions"
  if (value === "users") return "/users"
  if (value === "ai_chats") return "/ai-threads"
  if (value === "artifacts") return "/artifacts"
  return "/tasks"
}

export function leftPaneObjectLabel(value: LeftPaneObject): string {
  if (value === "all") return "Home"
  if (value === "tasks") return "Tasks"
  if (value === "projects") return "Projects"
  if (value === "mentions") return "Mentions"
  if (value === "users") return "Users"
  if (value === "artifacts") return "Artifacts"
  return "AI chats"
}

/**
 * Priority order for object pills that are surfaced directly (vs. tucked into the overflow menu).
 * On task views the object toggle is secondary to contextual (task) controls, so only the leanest
 * objects are eligible to be promoted to visible pills.
 */
export const OBJECT_PILL_PRIORITY: LeftPaneObject[] = ["tasks", "projects"]

/**
 * Full greedy-fit priority for visible pills (used on non-task views where there is room to expose
 * more object types). Mentions is least-used so it sinks to the bottom / overflow first.
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
  /** Below this, fall back to the compact single dropdown (truly limited space). */
  compactMax: 320,
  /** At/above this a task view may promote a third object pill; non-task views fit greedily. */
  wideMin: 520,
} as const

/** Approx rendered pill geometry (px) used to greedily fit pills without overflowing the row. */
const OBJECT_PILL_OVERFLOW_TRIGGER_WIDTH = 96
const OBJECT_PILL_GAP = 4
/** Object pills stay secondary to task controls, so cap how many can show on task views. */
const TASK_VIEW_MAX_PILLS_NARROW = 2
const TASK_VIEW_MAX_PILLS_WIDE = 3

/** h-8 px-3 pill (24px padding + 2px border) + ~7.5px per label char, rounded up. */
function estimateObjectPillWidth(object: LeftPaneObject): number {
  return Math.ceil(28 + leftPaneObjectLabel(object).length * 7.5)
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
 * - Non-task views fit as many object pills as the width allows (all of them when wide), with any
 *   leftovers in the overflow menu — they have spare room because task controls aren't competing.
 * - Task views keep object pills lean (max 2 narrow / 3 wide) so groupBy / filters / ordering keep
 *   priority and are never crowded out.
 * - The active object is always represented: surfaced as a visible pill when there is room, otherwise
 *   left in overflow (the overflow trigger then displays the active object's label).
 */
export function getAdaptiveObjectSwitcherState({
  containerWidth,
  activeObject,
  isTaskView,
}: {
  containerWidth: number
  activeObject: LeftPaneObject
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

  const orderedAll = OBJECT_PILL_VISIBLE_PRIORITY.filter((o) => all.includes(o))
  const isWide = containerWidth >= ADAPTIVE_OBJECT_SWITCHER_BREAKPOINTS.wideMin

  // Task views reserve room for task controls -> only the top-priority objects are candidates.
  const candidates = isTaskView
    ? orderedAll.slice(0, isWide ? TASK_VIEW_MAX_PILLS_WIDE : TASK_VIEW_MAX_PILLS_NARROW)
    : orderedAll

  // Fast path: if every candidate fits with no overflow at all, show them directly (no "More").
  if (candidates.length === all.length) {
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
