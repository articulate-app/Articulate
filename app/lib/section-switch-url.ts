import type { LeftPaneObject, PrimarySectionKey } from "./left-pane-object"
import { buildObjectRoute, type SearchObjectRoute } from "./search-routing"

const SECTION_TO_PATH: Record<PrimarySectionKey | "all", string> = {
  all: "/",
  tasks: "/tasks",
  projects: "/projects",
  mentions: "/mentions",
  users: "/users",
  "ai-threads": "/ai-threads",
  artifacts: "/artifacts",
}

const LEFT_OBJECT_TO_SECTION: Record<LeftPaneObject, PrimarySectionKey | "all"> = {
  all: "all",
  tasks: "tasks",
  projects: "projects",
  mentions: "mentions",
  users: "users",
  ai_chats: "ai-threads",
  artifacts: "artifacts",
}

const SECTION_TO_OBJECT_ROUTE: Record<PrimarySectionKey | "all", SearchObjectRoute> = {
  all: "all",
  tasks: "task",
  projects: "project",
  mentions: "mention",
  users: "user",
  "ai-threads": "ai_thread",
  artifacts: "artifact",
}

export function buildSectionSwitchUrl(
  nextSection: PrimarySectionKey | "all",
  currentSearchParams: URLSearchParams,
): string {
  const targetObject = SECTION_TO_OBJECT_ROUTE[nextSection]
  const fallbackPathname = SECTION_TO_PATH[nextSection]
  const { pathname, searchParams: next } = buildObjectRoute(targetObject, currentSearchParams)
  // Normal section switches should not carry split center-pane layout state.
  next.delete("split")
  next.delete("splitView")
  next.delete("topView")
  next.delete("bottomView")
  // Switching to a non-task object must not retain a task-only selection (an open task/suggestion
  // detail, etc.) — those params don't apply to projects/users/mentions/ai-chats and would
  // otherwise leave the view in a stale task state. (mode/groupBy/groupOrder/filters are already
  // dropped by buildObjectRoute, which only keeps shared + pane params.)
  if (nextSection !== "tasks") {
    next.delete("centerTaskId")
    next.delete("rightTaskId")
    next.delete("centerSuggestionId")
    next.delete("itemKind")
    next.delete("id")
  }
  // Keep defensive fallback in case helper mapping diverges.
  const resolvedPathname = pathname || fallbackPathname
  const query = next.toString()
  return query ? `${resolvedPathname}?${query}` : resolvedPathname
}

export function leftObjectToSectionKey(value: LeftPaneObject): PrimarySectionKey | "all" {
  return LEFT_OBJECT_TO_SECTION[value]
}
