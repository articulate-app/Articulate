export type CenterPaneEntity = "task" | "project" | "user" | "team" | "thread"

export const KEYWORD_RESEARCH_CENTER_VIEW = "keyword-research"
/** Seed query for the keyword research middle-pane tab (from top search, etc.). */
export const KEYWORD_RESEARCH_QUERY_PARAM = "krQuery"

export type ActiveCenterSelection =
  | { type: "task-suggestion"; id: string }
  | { type: "task"; id: string }
  | { type: "user"; id: string }
  | { type: "project"; id: string }
  | { type: "team"; id: string }
  | { type: "thread"; id: string }
  | { type: "keyword-research" }

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
  if (params.get("centerView") === KEYWORD_RESEARCH_CENTER_VIEW) {
    return { type: "keyword-research" }
  }
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
  next.delete("centerMentionId")
  next.delete("centerTab")
  next.delete("centerView")
  next.delete(KEYWORD_RESEARCH_QUERY_PARAM)
  next.delete("rightTaskId")
  next.delete("id")
}

function clearCenterPaneSelection(next: URLSearchParams) {
  next.delete("centerTaskId")
  next.delete("centerProjectId")
  next.delete("centerUserId")
  next.delete("centerTeamId")
  next.delete("centerThreadId")
  next.delete("centerMentionId")
  next.delete("centerTab")
  next.delete("centerView")
  next.delete(KEYWORD_RESEARCH_QUERY_PARAM)
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
  /** Focused mention within a thread (center-pane thread selection). */
  mentionId?: string | number | null
}): URLSearchParams {
  const { currentSearchParams, entity, id, tab, mentionId = null } = args
  const next = new URLSearchParams(currentSearchParams.toString())
  clearGenericSelection(next)
  clearCenterPaneSelection(next)
  clearRightPaneSelection(next)
  clearCenterSplitLayout(next)
  next.delete("itemKind")
  next.delete("centerSuggestionId")
  next.delete("stackTeamId")
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
  if (mentionId != null && String(mentionId).trim()) {
    next.set("centerMentionId", String(mentionId))
  } else {
    next.delete("centerMentionId")
  }
  return next
}

/** Apply a middle-pane tab selection (including suggestions) onto URL search params. */
export function buildCenterPaneTabSelectionSearchParams(args: {
  currentSearchParams: URLSearchParams
  kind: "task" | "suggestion" | "project" | "user" | "team" | "thread" | "keyword-research"
  id: string | number
  /** Optional seed keyword when opening keyword research. */
  keywordQuery?: string | null
}): URLSearchParams {
  const { currentSearchParams, kind, id, keywordQuery = null } = args
  if (kind === "keyword-research") {
    const next = new URLSearchParams(currentSearchParams.toString())
    clearGenericSelection(next)
    clearCenterPaneSelection(next)
    clearRightPaneSelection(next)
    clearCenterSplitLayout(next)
    next.delete("itemKind")
    next.delete("centerSuggestionId")
    next.delete("stackTeamId")
    next.set("layout", "right")
    next.set("centerView", KEYWORD_RESEARCH_CENTER_VIEW)
    const trimmedQuery = typeof keywordQuery === "string" ? keywordQuery.trim() : ""
    if (trimmedQuery) next.set(KEYWORD_RESEARCH_QUERY_PARAM, trimmedQuery)
    else next.delete(KEYWORD_RESEARCH_QUERY_PARAM)
    return next
  }
  if (kind === "suggestion") {
    const next = new URLSearchParams(currentSearchParams.toString())
    clearGenericSelection(next)
    clearCenterPaneSelection(next)
    clearRightPaneSelection(next)
    clearCenterSplitLayout(next)
    next.set("layout", "right")
    next.set("itemKind", "suggestion")
    next.set("centerSuggestionId", String(id))
    next.delete("centerTaskId")
    next.delete("stackTeamId")
    return next
  }
  return buildCenterPaneSelectionSearchParams({
    currentSearchParams,
    entity: kind,
    id,
  })
}
