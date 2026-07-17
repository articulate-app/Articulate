export type CenterPaneEntity = "task" | "project" | "user" | "team" | "thread"

export type ActiveCenterSelection =
  | { type: "task-suggestion"; id: string }
  | { type: "task"; id: string }
  | { type: "user"; id: string }
  | { type: "project"; id: string }
  | { type: "team"; id: string }
  | { type: "thread"; id: string }

type ReadableParams = { get: (key: string) => string | null }

function nonEmpty(value: string | null): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

/**
 * Single source of truth for "what is selected in the center/detail pane", derived purely from URL
 * params. Used by desktop middle-pane rendering, mobile detail rendering + open detection, back/clear
 * logic, and row highlighting so every surface agrees on the active selection.
 *
 * A task suggestion (`itemKind=suggestion` + `centerSuggestionId`) is a first-class selection — it does
 * NOT require `centerTaskId`, `layout`, or `rightView` to be considered "open".
 */
export function getActiveCenterSelection(params: ReadableParams): ActiveCenterSelection | null {
  const itemKind = params.get("itemKind")
  const centerSuggestionId = nonEmpty(params.get("centerSuggestionId"))
  if (itemKind === "suggestion" && centerSuggestionId) {
    return { type: "task-suggestion", id: centerSuggestionId }
  }
  const centerTaskId = nonEmpty(params.get("centerTaskId"))
  if (centerTaskId) return { type: "task", id: centerTaskId }
  const centerUserId = nonEmpty(params.get("centerUserId"))
  if (centerUserId) return { type: "user", id: centerUserId }
  const centerProjectId = nonEmpty(params.get("centerProjectId"))
  if (centerProjectId) return { type: "project", id: centerProjectId }
  const centerTeamId = nonEmpty(params.get("centerTeamId"))
  if (centerTeamId) return { type: "team", id: centerTeamId }
  const centerThreadId = nonEmpty(params.get("centerThreadId"))
  if (centerThreadId) return { type: "thread", id: centerThreadId }
  return null
}

/** Clears every center-pane / detail selection param (used before setting a new selection). */
export function clearActiveCenterSelectionParams(next: URLSearchParams) {
  next.delete("itemKind")
  next.delete("centerSuggestionId")
  next.delete("centerTaskId")
  next.delete("centerUserId")
  next.delete("centerProjectId")
  next.delete("centerTeamId")
  next.delete("centerThreadId")
  next.delete("centerTab")
  next.delete("rightTaskId")
  next.delete("id")
}

function clearCenterPaneSelection(next: URLSearchParams) {
  next.delete("centerTaskId")
  next.delete("centerProjectId")
  next.delete("centerUserId")
  next.delete("centerTeamId")
  next.delete("centerThreadId")
  next.delete("centerTab")
}

function clearGenericSelection(next: URLSearchParams) {
  next.delete("entity")
  next.delete("id")
  next.delete("tab")
  next.delete("detailType")
  next.delete("detailId")
  next.delete("briefingTypeId")
  next.delete("threadId")
  next.delete("mentionId")
}

function clearRightPaneSelection(next: URLSearchParams) {
  next.delete("rightTaskId")
  next.delete("rightProjectId")
  next.delete("rightUserId")
  next.delete("rightTeamId")
  next.delete("rightThreadId")
  next.delete("rightMentionId")
  next.delete("rightTab")
}

function clearCenterSplitLayout(next: URLSearchParams) {
  next.delete("split")
  next.delete("splitView")
  next.delete("topView")
  next.delete("bottomView")
}

export function buildCenterPaneSelectionSearchParams(args: {
  currentSearchParams: URLSearchParams
  entity: CenterPaneEntity
  id: string | number
  tab?: string | null
}): URLSearchParams {
  const { currentSearchParams, entity, id, tab } = args
  const next = new URLSearchParams(currentSearchParams.toString())
  clearGenericSelection(next)
  clearCenterPaneSelection(next)
  clearRightPaneSelection(next)
  clearCenterSplitLayout(next)
  next.set("layout", "right")

  if (entity === "task") {
    next.set("centerTaskId", String(id))
    return next
  }
  if (entity === "project") {
    next.set("centerProjectId", String(id))
    if (tab && tab !== "overview") next.set("centerTab", tab)
    else next.delete("centerTab")
    return next
  }
  if (entity === "user") {
    next.set("centerUserId", String(id))
    if (tab && tab !== "overview") next.set("centerTab", tab)
    else next.delete("centerTab")
    return next
  }
  if (entity === "team") {
    next.set("centerTeamId", String(id))
    if (tab && tab !== "overview") next.set("centerTab", tab)
    else next.delete("centerTab")
    return next
  }

  next.set("centerThreadId", String(id))
  return next
}
