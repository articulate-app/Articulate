"use client"

import {
  isTaskDetailsAiSplitMode,
  isTaskDetailsFocusContext,
} from "../../app/components/tasks/ai-pane-focus-url"

export type AppEntityLink =
  | { type: "task"; id: number }
  | { type: "project"; id: number }
  | { type: "user"; id: number }

export function parseAppEntityLink(href: string | null | undefined): AppEntityLink | null {
  if (!href) return null
  const match = href.trim().match(/^app:\/\/(task|project|user)\/(\d+)$/i)
  if (!match) return null
  const [, typeRaw, idRaw] = match
  const id = Number(idRaw)
  if (!Number.isFinite(id) || id <= 0) return null
  const type = typeRaw.toLowerCase() as AppEntityLink["type"]
  return { type, id }
}

export function isTasksShellPath(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/tasks")
}

export function getResolvedTaskIdFromSearchParams(params: URLSearchParams): number | null {
  for (const key of ["centerTaskId", "id", "rightTaskId"] as const) {
    const raw = params.get(key)
    if (!raw) continue
    const id = Number(raw)
    if (Number.isFinite(id) && id > 0) return id
  }
  return null
}

function isAiChatPaneOpen(params: URLSearchParams): boolean {
  return params.get("rightView") === "ai" && params.get("taskAiOpen") === "true"
}

function ensureRightPaneDetailsLayout(params: URLSearchParams) {
  const currentLayout = (params.get("layout") || "left,middle")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  if (!currentLayout.includes("right")) currentLayout.push("right")
  params.set("layout", currentLayout.join(","))
  params.set("rightView", "details")
  params.delete("focus")
}

function ensureRightPaneInLayout(params: URLSearchParams) {
  const currentLayout = (params.get("layout") || "left,middle")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  if (!currentLayout.includes("right")) currentLayout.push("right")
  params.set("layout", currentLayout.join(","))
}

/** Navigate to a task from AI chat without closing the AI pane or reopening the task list. */
export function applyAiChatTaskLinkNavigation(
  params: URLSearchParams,
  taskId: number,
): URLSearchParams | null {
  const currentTaskId = getResolvedTaskIdFromSearchParams(params)
  if (currentTaskId === taskId) return null

  const next = new URLSearchParams(params.toString())
  next.set("centerTaskId", String(taskId))
  next.delete("id")
  next.delete("rightTaskId")
  next.delete("itemKind")
  next.delete("centerSuggestionId")

  next.set("rightView", "ai")
  next.set("taskAiOpen", "true")

  if (isTaskDetailsAiSplitMode(next) || (isTaskDetailsFocusContext(next) && next.get("layout") === "right")) {
    next.set("layout", "right")
    next.set("focus", "right")
  } else if (isTaskDetailsFocusContext(next)) {
    next.set("focus", "right")
    ensureRightPaneInLayout(next)
  } else {
    ensureRightPaneInLayout(next)
  }

  return next
}

function buildTasksShellUrl(pathname: string, params: URLSearchParams): string {
  if (isTasksShellPath(pathname)) {
    return `${pathname}?${params.toString()}`
  }
  return `/tasks?${params.toString()}`
}

export function buildNextUrlForEntityLink(args: {
  currentPathname: string
  currentSearchParams: URLSearchParams
  parsedLink: AppEntityLink
  /** When true, preserve AI pane state and avoid switching rightView to details. */
  fromAiChat?: boolean
}): string | null {
  const { currentPathname, currentSearchParams, parsedLink, fromAiChat = false } = args
  const isTasksRoute = isTasksShellPath(currentPathname)

  if (parsedLink.type === "task") {
    if (fromAiChat && isAiChatPaneOpen(currentSearchParams)) {
      const nextParams = applyAiChatTaskLinkNavigation(currentSearchParams, parsedLink.id)
      if (!nextParams) return null
      return buildTasksShellUrl(currentPathname, nextParams)
    }

    const params = new URLSearchParams(currentSearchParams.toString())
    params.set("id", String(parsedLink.id))
    ensureRightPaneDetailsLayout(params)
    return buildTasksShellUrl(currentPathname, params)
  }

  if (parsedLink.type === "project") {
    if (isTasksRoute) {
      const params = new URLSearchParams(currentSearchParams.toString())
      params.set("project", String(parsedLink.id))
      params.set("projectId", String(parsedLink.id))
      return `${currentPathname}?${params.toString()}`
    }
    return `/projects/${parsedLink.id}`
  }

  return null
}
