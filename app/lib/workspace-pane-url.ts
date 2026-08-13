/**
 * Compatibility layer: existing URL params ↔ pane-neutral WorkspaceTab.
 *
 * Does not replace center* / right* params yet — it translates them so features
 * can reason about WHAT/WHERE without hardcoding pane position.
 */

import {
  getActiveCenterSelection,
  buildCenterPaneSelectionSearchParams,
  buildCenterPaneTabSelectionSearchParams,
  parseResearchTab,
  RESEARCH_QUERY_PARAM,
  RESEARCH_TAB_PARAM,
  type ResearchTab,
  type CreateCenterType,
} from "./center-pane-selection-url"
import { buildOpenBrowserPaneParams } from "../components/tasks/browser-pane-url"
import {
  AI_WORKSPACE_TAB_ID,
  CREATE_WORKSPACE_TAB_ID,
  DETAILS_WORKSPACE_TAB_ID,
  LIST_WORKSPACE_TAB_ID,
  RESEARCH_WORKSPACE_TAB_ID,
  SEARCH_RESULTS_WORKSPACE_TAB_ID,
  TASK_LIST_WORKSPACE_TAB_ID,
  buildWorkspaceTabKey,
  isListWorkspaceViewType,
  normalizeWorkspaceViewType,
  workspaceTabFromParts,
  type WorkspacePaneId,
  type WorkspaceTab,
  type WorkspaceViewType,
} from "./workspace-view"
import {
  listViewToSearchObjectRoute,
  workspaceListViewLabel,
  type WorkspaceListViewType,
} from "./workspace-list-views"

/** Active view in the left workspace pane. Distinct from legacy `leftView` (list/kanban). */
export const LEFT_PANE_VIEW_PARAM = "leftPaneView" as const
/** Explicit empty left pane — skips default AI homepage seed. */
export const LEFT_PANE_EMPTY_VIEW = "none" as const
/** Query string for a `search-results` workspace tab (pane-scoped). */
export const LEFT_SEARCH_QUERY_PARAM = "leftSearchQuery" as const
export const CENTER_SEARCH_QUERY_PARAM = "centerSearchQuery" as const
export const RIGHT_SEARCH_QUERY_PARAM = "rightSearchQuery" as const

const LEFT_PANE_ENTITY_ID_PARAMS = [
  "leftTaskId",
  "leftProjectId",
  "leftUserId",
  "leftTeamId",
  "leftThreadId",
  "leftMentionId",
  "leftArtifactId",
  "leftSourceId",
  "leftTemplateId",
  "leftSuggestionId",
  "leftTab",
] as const

export type WorkspacePaneActiveViews = {
  left: WorkspaceTab | null
  middle: WorkspaceTab | null
  right: WorkspaceTab | null
  focusedPane: WorkspacePaneId | null
}

type ReadableParams = { get: (key: string) => string | null }

function nonEmpty(value: string | null): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function ensurePaneInLayout(next: URLSearchParams, pane: WorkspacePaneId) {
  const layout = new Set((next.get("layout") || "left,middle").split(",").filter(Boolean))
  if (pane === "left") layout.add("left")
  if (pane === "middle") layout.add("middle")
  if (pane === "right") layout.add("right")
  // Preserve common "details open" signal used by existing openers.
  if (!layout.has("left") && !layout.has("middle") && layout.has("right")) {
    // solo-right (AI focus) — leave as-is
  } else if (pane === "middle" && !layout.has("right") && next.get("layout") === "right") {
    next.set("layout", "middle,right")
    return
  }
  next.set("layout", Array.from(layout).join(","))
}

/**
 * Research / lists / entities on the right are peer tabs beside AI (like Browser).
 * Keep `taskAiOpen=true` so the AI tab strip stays when switching away from the chat.
 */
function applyRightPanePeerAiOpen(
  next: URLSearchParams,
  current: URLSearchParams,
  viewParams?: { keepAiOpen?: boolean } | null,
) {
  const keep =
    viewParams?.keepAiOpen === true ||
    current.get("rightView") === "ai" ||
    current.get("taskAiOpen") === "true"
  next.set("taskAiOpen", keep ? "true" : "false")
}

export function clearLeftPaneSelectionParams(next: URLSearchParams): void {
  next.delete(LEFT_PANE_VIEW_PARAM)
  next.delete(LEFT_SEARCH_QUERY_PARAM)
  for (const key of LEFT_PANE_ENTITY_ID_PARAMS) next.delete(key)
}

function syncLegacyObjectParam(next: URLSearchParams, type: WorkspaceListViewType): void {
  if (type === "template-list") return
  next.set("object", listViewToSearchObjectRoute(type))
}

function clearMiddleSelectionParams(next: URLSearchParams) {
  // Clear middle selection only — do not touch right* entity params so panes stay independent.
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
  next.delete("centerArtifactId")
  next.delete("centerSourceId")
  next.delete("centerTemplateId")
  next.delete("version")
  next.delete("artifactHistory")
  next.delete("rQuery")
  next.delete("researchTab")
  next.delete("rRegion")
  next.delete("krQuery")
  next.delete("prQuery")
  next.delete("createType")
  next.delete("stackTeamId")
  next.delete(CENTER_SEARCH_QUERY_PARAM)
  // Legacy generic id used for task selection in some routes.
  next.delete("id")
}

function clearRightEntitySelectionParams(next: URLSearchParams) {
  next.delete("rightTaskId")
  next.delete("rightProjectId")
  next.delete("rightUserId")
  next.delete("rightTeamId")
  next.delete("rightThreadId")
  next.delete("rightMentionId")
  next.delete("rightTab")
  next.delete("rightArtifactId")
  next.delete("rightSourceId")
  next.delete("rightTemplateId")
  next.delete("rightSuggestionId")
  next.delete(RIGHT_SEARCH_QUERY_PARAM)
}

/** True when rightView encodes an entity (not ai/browser/details/list tools). */
export function isRightViewEntityType(rightView: string | null | undefined): boolean {
  const type = normalizeWorkspaceViewType(rightView)
  if (!type) return false
  return (
    type !== "ai" &&
    type !== "browser" &&
    type !== "details" &&
    !isListWorkspaceViewType(type)
  )
}

/**
 * Resolve the active left-pane workspace tab from URL.
 * Prefers `leftPaneView`; falls back to legacy `object=` list routes.
 */
export function getActiveLeftWorkspaceTab(params: ReadableParams): WorkspaceTab | null {
  const leftViewRaw = params.get(LEFT_PANE_VIEW_PARAM)
  // After moving the last left tab away, URL is marked empty so we do not re-seed Tasks.
  if (leftViewRaw === LEFT_PANE_EMPTY_VIEW) return null
  const leftView = normalizeWorkspaceViewType(leftViewRaw)

  if (leftView && isListWorkspaceViewType(leftView)) {
    return workspaceTabFromParts({
      type: leftView,
      id: LIST_WORKSPACE_TAB_ID,
      title: workspaceListViewLabel(leftView),
    })
  }

  if (leftView === "ai") {
    const threadId = nonEmpty(params.get("aiThreadId")) || AI_WORKSPACE_TAB_ID
    return workspaceTabFromParts({
      type: "ai",
      id: threadId,
      title: "AI",
      params: { aiThreadId: nonEmpty(params.get("aiThreadId")) },
    })
  }

  if (leftView === "browser") {
    const browserTabId = nonEmpty(params.get("browserTabId")) || "main"
    return workspaceTabFromParts({
      type: "browser",
      id: browserTabId,
      title: "Browser",
      params: {
        browserTabId,
        publicationRunId: nonEmpty(params.get("publicationRunId")),
      },
    })
  }

  if (leftView === "task") {
    const id = nonEmpty(params.get("leftTaskId"))
    if (id) return workspaceTabFromParts({ type: "task", id })
  }
  if (leftView === "suggestion") {
    const id = nonEmpty(params.get("leftSuggestionId"))
    if (id) return workspaceTabFromParts({ type: "suggestion", id })
  }
  if (leftView === "project") {
    const id = nonEmpty(params.get("leftProjectId"))
    if (id) {
      return workspaceTabFromParts({
        type: "project",
        id,
        params: { tab: nonEmpty(params.get("leftTab")) },
      })
    }
  }
  if (leftView === "user") {
    const id = nonEmpty(params.get("leftUserId"))
    if (id) {
      return workspaceTabFromParts({
        type: "user",
        id,
        params: { tab: nonEmpty(params.get("leftTab")) },
      })
    }
  }
  if (leftView === "team") {
    const id = nonEmpty(params.get("leftTeamId"))
    if (id) {
      return workspaceTabFromParts({
        type: "team",
        id,
        params: { tab: nonEmpty(params.get("leftTab")) },
      })
    }
  }
  if (leftView === "thread") {
    const id = nonEmpty(params.get("leftThreadId"))
    if (id) {
      return workspaceTabFromParts({
        type: "thread",
        id,
        params: { mentionId: nonEmpty(params.get("leftMentionId")) },
      })
    }
  }
  if (leftView === "artifact") {
    const id = nonEmpty(params.get("leftArtifactId"))
    if (id) return workspaceTabFromParts({ type: "artifact", id })
  }
  if (leftView === "source") {
    const id = nonEmpty(params.get("leftSourceId"))
    if (id) return workspaceTabFromParts({ type: "source", id })
  }
  if (leftView === "template") {
    const id = nonEmpty(params.get("leftTemplateId"))
    if (id) return workspaceTabFromParts({ type: "template", id })
  }
  if (leftView === "research") {
    return workspaceTabFromParts({
      type: "research",
      id: RESEARCH_WORKSPACE_TAB_ID,
      title: "Research",
      params: {
        researchTab: parseResearchTab(params.get(RESEARCH_TAB_PARAM)) ?? "keywords",
        researchQuery: nonEmpty(params.get(RESEARCH_QUERY_PARAM)),
      },
    })
  }
  if (leftView === "create") {
    return workspaceTabFromParts({
      type: "create",
      id: CREATE_WORKSPACE_TAB_ID,
      title: "Create",
    })
  }
  if (leftView === "search-results") {
    const searchQuery = nonEmpty(params.get(LEFT_SEARCH_QUERY_PARAM)) ?? ""
    return workspaceTabFromParts({
      type: "search-results",
      id: SEARCH_RESULTS_WORKSPACE_TAB_ID,
      title: searchQuery || "Search",
      params: { searchQuery },
    })
  }

  // Left homepage: AI chat when `leftPaneView` is absent (not explicitly emptied).
  // Object lists must set `leftPaneView` via `openWorkspaceView` (sidebar already does).
  if (!leftViewRaw) {
    const threadId = nonEmpty(params.get("aiThreadId")) || AI_WORKSPACE_TAB_ID
    return workspaceTabFromParts({
      type: "ai",
      id: threadId,
      title: "AI",
      params: { aiThreadId: nonEmpty(params.get("aiThreadId")) },
    })
  }

  return null
}

/**
 * Resolve the active middle-pane workspace tab from URL (compat).
 * Prefer center* params; also support centerView=ai|browser.
 */
export function getActiveMiddleWorkspaceTab(params: ReadableParams): WorkspaceTab | null {
  const centerView = params.get("centerView")
  if (centerView === "ai") {
    const threadId = nonEmpty(params.get("aiThreadId")) || AI_WORKSPACE_TAB_ID
    return workspaceTabFromParts({
      type: "ai",
      id: threadId,
      title: "AI",
      params: { aiThreadId: nonEmpty(params.get("aiThreadId")) },
    })
  }
  if (centerView === "browser") {
    const browserTabId = nonEmpty(params.get("browserTabId")) || "main"
    return workspaceTabFromParts({
      type: "browser",
      id: browserTabId,
      title: "Browser",
      params: {
        browserTabId,
        publicationRunId: nonEmpty(params.get("publicationRunId")),
      },
    })
  }
  if (centerView === "task-list" || centerView === "tasks") {
    return workspaceTabFromParts({
      type: "task-list",
      id: TASK_LIST_WORKSPACE_TAB_ID,
      title: "Tasks",
    })
  }
  const centerListType = normalizeWorkspaceViewType(centerView)
  if (centerListType && isListWorkspaceViewType(centerListType)) {
    return workspaceTabFromParts({
      type: centerListType,
      id: LIST_WORKSPACE_TAB_ID,
      title: workspaceListViewLabel(centerListType),
    })
  }
  if (centerView === "search-results") {
    const searchQuery = nonEmpty(params.get(CENTER_SEARCH_QUERY_PARAM)) ?? ""
    return workspaceTabFromParts({
      type: "search-results",
      id: SEARCH_RESULTS_WORKSPACE_TAB_ID,
      title: searchQuery || "Search",
      params: { searchQuery },
    })
  }

  const selection = getActiveCenterSelection(params)
  if (!selection) return null

  switch (selection.type) {
    case "task":
      return workspaceTabFromParts({ type: "task", id: selection.id })
    case "task-suggestion":
      return workspaceTabFromParts({ type: "suggestion", id: selection.id })
    case "project":
      return workspaceTabFromParts({
        type: "project",
        id: selection.id,
        params: { tab: nonEmpty(params.get("centerTab")) },
      })
    case "user":
      return workspaceTabFromParts({
        type: "user",
        id: selection.id,
        params: { tab: nonEmpty(params.get("centerTab")) },
      })
    case "team":
      return workspaceTabFromParts({
        type: "team",
        id: selection.id,
        params: { tab: nonEmpty(params.get("centerTab")) },
      })
    case "thread":
      return workspaceTabFromParts({
        type: "thread",
        id: selection.id,
        params: { mentionId: nonEmpty(params.get("centerMentionId")) },
      })
    case "artifact":
      return workspaceTabFromParts({
        type: "artifact",
        id: selection.id,
        params: { version: selection.version },
      })
    case "source":
      return workspaceTabFromParts({ type: "source", id: selection.id })
    case "template":
      return workspaceTabFromParts({ type: "template", id: selection.id })
    case "research":
      return workspaceTabFromParts({
        type: "research",
        id: RESEARCH_WORKSPACE_TAB_ID,
        title: "Research",
        params: { researchTab: selection.tab },
      })
    case "create":
      return workspaceTabFromParts({
        type: "create",
        id: CREATE_WORKSPACE_TAB_ID,
        title: "Create",
        params: { createType: selection.createType },
      })
    case "keyword-research":
    case "prompt-research":
      return workspaceTabFromParts({
        type: "research",
        id: RESEARCH_WORKSPACE_TAB_ID,
        title: "Research",
      })
    default:
      return null
  }
}

/**
 * Resolve the active right-pane workspace tab from URL (compat).
 * Supports tools (ai/browser) and entity right* params.
 */
export function getActiveRightWorkspaceTab(params: ReadableParams): WorkspaceTab | null {
  const rightViewRaw = params.get("rightView")
  const rightView = normalizeWorkspaceViewType(rightViewRaw)

  if (rightView === "task-list" || rightViewRaw === "tasks") {
    return workspaceTabFromParts({
      type: "task-list",
      id: TASK_LIST_WORKSPACE_TAB_ID,
      title: "Tasks",
    })
  }
  if (rightView && isListWorkspaceViewType(rightView)) {
    return workspaceTabFromParts({
      type: rightView,
      id: LIST_WORKSPACE_TAB_ID,
      title: workspaceListViewLabel(rightView),
    })
  }

  // Entity views via rightView + right* ids (or legacy aliases).
  if (rightView && isRightViewEntityType(rightViewRaw)) {
    if (rightView === "task") {
      const id = nonEmpty(params.get("rightTaskId"))
      if (id) return workspaceTabFromParts({ type: "task", id })
    }
    if (rightView === "suggestion") {
      const id = nonEmpty(params.get("rightSuggestionId"))
      if (id) return workspaceTabFromParts({ type: "suggestion", id })
    }
    if (rightView === "project") {
      const id = nonEmpty(params.get("rightProjectId"))
      if (id) {
        return workspaceTabFromParts({
          type: "project",
          id,
          params: { tab: nonEmpty(params.get("rightTab")) },
        })
      }
    }
    if (rightView === "user") {
      const id = nonEmpty(params.get("rightUserId"))
      if (id) {
        return workspaceTabFromParts({
          type: "user",
          id,
          params: { tab: nonEmpty(params.get("rightTab")) },
        })
      }
    }
    if (rightView === "team") {
      const id = nonEmpty(params.get("rightTeamId"))
      if (id) {
        return workspaceTabFromParts({
          type: "team",
          id,
          params: { tab: nonEmpty(params.get("rightTab")) },
        })
      }
    }
    if (rightView === "thread") {
      const id = nonEmpty(params.get("rightThreadId"))
      if (id) {
        return workspaceTabFromParts({
          type: "thread",
          id,
          params: { mentionId: nonEmpty(params.get("rightMentionId")) },
        })
      }
    }
    if (rightView === "artifact") {
      const id = nonEmpty(params.get("rightArtifactId"))
      if (id) return workspaceTabFromParts({ type: "artifact", id })
    }
    if (rightView === "source") {
      const id = nonEmpty(params.get("rightSourceId"))
      if (id) return workspaceTabFromParts({ type: "source", id })
    }
    if (rightView === "template") {
      const id = nonEmpty(params.get("rightTemplateId"))
      if (id) return workspaceTabFromParts({ type: "template", id })
    }
    if (rightView === "research") {
      return workspaceTabFromParts({
        type: "research",
        id: RESEARCH_WORKSPACE_TAB_ID,
        title: "Research",
        params: {
          researchTab: parseResearchTab(params.get(RESEARCH_TAB_PARAM)) ?? "keywords",
          researchQuery: nonEmpty(params.get(RESEARCH_QUERY_PARAM)),
        },
      })
    }
    if (rightView === "create") {
      return workspaceTabFromParts({
        type: "create",
        id: CREATE_WORKSPACE_TAB_ID,
        title: "Create",
      })
    }
    if (rightView === "search-results") {
      const searchQuery = nonEmpty(params.get(RIGHT_SEARCH_QUERY_PARAM)) ?? ""
      return workspaceTabFromParts({
        type: "search-results",
        id: SEARCH_RESULTS_WORKSPACE_TAB_ID,
        title: searchQuery || "Search",
        params: { searchQuery },
      })
    }
  }

  // Infer entity from right* ids when rightView is details/missing (legacy).
  if (!rightView || rightView === "details") {
    const rightTaskId = nonEmpty(params.get("rightTaskId"))
    if (rightTaskId) return workspaceTabFromParts({ type: "task", id: rightTaskId })
    const rightProjectId = nonEmpty(params.get("rightProjectId"))
    if (rightProjectId) {
      return workspaceTabFromParts({
        type: "project",
        id: rightProjectId,
        params: { tab: nonEmpty(params.get("rightTab")) },
      })
    }
    const rightUserId = nonEmpty(params.get("rightUserId"))
    if (rightUserId) {
      return workspaceTabFromParts({
        type: "user",
        id: rightUserId,
        params: { tab: nonEmpty(params.get("rightTab")) },
      })
    }
    const rightTeamId = nonEmpty(params.get("rightTeamId"))
    if (rightTeamId) {
      return workspaceTabFromParts({
        type: "team",
        id: rightTeamId,
        params: { tab: nonEmpty(params.get("rightTab")) },
      })
    }
    const rightThreadId = nonEmpty(params.get("rightThreadId"))
    if (rightThreadId) {
      return workspaceTabFromParts({
        type: "thread",
        id: rightThreadId,
        params: { mentionId: nonEmpty(params.get("rightMentionId")) },
      })
    }
    const rightArtifactId = nonEmpty(params.get("rightArtifactId"))
    if (rightArtifactId) {
      return workspaceTabFromParts({ type: "artifact", id: rightArtifactId })
    }
    const rightTemplateId = nonEmpty(params.get("rightTemplateId"))
    if (rightTemplateId) {
      return workspaceTabFromParts({ type: "template", id: rightTemplateId })
    }
  }

  if (rightView === "browser" || rightViewRaw === "publishing") {
    const browserTabId = nonEmpty(params.get("browserTabId")) || "main"
    return workspaceTabFromParts({
      type: "browser",
      id: browserTabId,
      title: "Browser",
      params: {
        browserTabId,
        publicationRunId: nonEmpty(params.get("publicationRunId")),
      },
    })
  }

  if (rightView === "ai") {
    // rightView=ai is authoritative — do not require taskAiOpen === "true"
    // (missing/legacy flags used to leave isAiInRight false and nest AiPane's own strip).
    const threadId = nonEmpty(params.get("aiThreadId")) || AI_WORKSPACE_TAB_ID
    return workspaceTabFromParts({
      type: "ai",
      id: threadId,
      title: "AI",
      params: { aiThreadId: nonEmpty(params.get("aiThreadId")) },
    })
  }

  // Default-open AI (taskAiOpen unset/true, rightView absent) — treat as AI when
  // no entity is selected on the right. Callers that only check rightView=ai should
  // use this helper instead.
  if ((!rightView || rightView === "details") && params.get("taskAiOpen") !== "false") {
    // Only claim AI when nothing else is active on the right.
    return null
  }

  if (rightView === "details") {
    return workspaceTabFromParts({
      type: "details",
      id: DETAILS_WORKSPACE_TAB_ID,
      title: "Details",
    })
  }

  return null
}

export function parseWorkspacePaneActiveViews(
  params: ReadableParams,
): WorkspacePaneActiveViews {
  const aiFocus = params.get("aiFocus") === "true"
  const focusRight = params.get("focus") === "right"
  let focusedPane: WorkspacePaneId | null = null
  if (aiFocus) focusedPane = "right"
  else if (focusRight) focusedPane = "middle"

  return {
    left: getActiveLeftWorkspaceTab(params),
    middle: getActiveMiddleWorkspaceTab(params),
    right: getActiveRightWorkspaceTab(params),
    focusedPane,
  }
}

/** Whether AI chat is the active view in the given pane (not "is right pane"). */
export function isAiActiveInPane(
  params: ReadableParams,
  pane: WorkspacePaneId,
): boolean {
  const active =
    pane === "left"
      ? getActiveLeftWorkspaceTab(params)
      : pane === "middle"
        ? getActiveMiddleWorkspaceTab(params)
        : getActiveRightWorkspaceTab(params)
  return active?.type === "ai"
}

/** Whether AI chat is open in any workspace pane. */
export function isAiOpenSomewhere(params: ReadableParams): boolean {
  return (
    getActiveLeftWorkspaceTab(params)?.type === "ai" ||
    getActiveMiddleWorkspaceTab(params)?.type === "ai" ||
    getActiveRightWorkspaceTab(params)?.type === "ai" ||
    (params.get("taskAiOpen") === "true" &&
      normalizeWorkspaceViewType(params.get("rightView")) === "ai")
  )
}

export type ApplyWorkspaceViewArgs = {
  current: URLSearchParams
  pane: WorkspacePaneId
  type: WorkspaceViewType
  id?: string | number | null
  title?: string | null
  params?: {
    aiThreadId?: string | null
    forceNewAiThread?: boolean
    browserTabId?: string | null
    publicationRunId?: string | null
    artifactVersion?: number | null
    openArtifactHistory?: boolean
    researchTab?: ResearchTab | null
    researchQuery?: string | null
    createType?: CreateCenterType | null
    mentionId?: string | number | null
    tab?: string | null
    keepAiOpen?: boolean
    searchQuery?: string | null
  }
}

/**
 * Write compat URL params so `pane` shows `type`/`id`.
 * Does not mutate tab stores — callers should upsert tabs separately.
 */
export function applyWorkspaceViewToSearchParams(args: ApplyWorkspaceViewArgs): URLSearchParams {
  const { current, pane, type, id, params: viewParams } = args
  const next = new URLSearchParams(current.toString())
  ensurePaneInLayout(next, pane)

  if (pane === "left") {
    clearLeftPaneSelectionParams(next)
    if (isListWorkspaceViewType(type)) {
      next.set(LEFT_PANE_VIEW_PARAM, type)
      syncLegacyObjectParam(next, type)
      return next
    }
    if (type === "ai") {
      next.set(LEFT_PANE_VIEW_PARAM, "ai")
      // Do not set taskAiOpen — that flag means the *right* AI pane is open.
      next.set("taskAiOpen", "false")
      if (viewParams?.forceNewAiThread) {
        next.delete("aiThreadId")
        next.set("newAiThread", "true")
      } else if (viewParams?.aiThreadId) {
        next.set("aiThreadId", viewParams.aiThreadId)
        next.delete("newAiThread")
      } else if (id && String(id) !== AI_WORKSPACE_TAB_ID) {
        next.set("aiThreadId", String(id))
        next.delete("newAiThread")
      }
      // Single AI host: demote middle/right AI if present.
      if (next.get("centerView") === "ai") next.delete("centerView")
      if (next.get("rightView") === "ai") next.set("rightView", "details")
      return next
    }
    if (type === "browser") {
      next.set(LEFT_PANE_VIEW_PARAM, "browser")
      const browserTabId = viewParams?.browserTabId || (id ? String(id) : null)
      if (browserTabId) next.set("browserTabId", browserTabId)
      if (viewParams?.publicationRunId) {
        next.set("publicationRunId", viewParams.publicationRunId)
      }
      return next
    }
    next.set(LEFT_PANE_VIEW_PARAM, type)
    const entityId = id != null ? String(id) : ""
    if (type === "task" && entityId) next.set("leftTaskId", entityId)
    else if (type === "suggestion" && entityId) next.set("leftSuggestionId", entityId)
    else if (type === "project" && entityId) {
      next.set("leftProjectId", entityId)
      if (viewParams?.tab && viewParams.tab !== "overview") next.set("leftTab", String(viewParams.tab))
    } else if (type === "user" && entityId) {
      next.set("leftUserId", entityId)
      if (viewParams?.tab && viewParams.tab !== "overview") next.set("leftTab", String(viewParams.tab))
    } else if (type === "team" && entityId) {
      next.set("leftTeamId", entityId)
      if (viewParams?.tab && viewParams.tab !== "overview") next.set("leftTab", String(viewParams.tab))
    } else if (type === "thread" && entityId) {
      next.set("leftThreadId", entityId)
      if (viewParams?.mentionId != null) next.set("leftMentionId", String(viewParams.mentionId))
    } else if (type === "artifact" && entityId) next.set("leftArtifactId", entityId)
    else if (type === "source" && entityId) next.set("leftSourceId", entityId)
    else if (type === "template" && entityId) next.set("leftTemplateId", entityId)
    else if (type === "research") {
      const tab = viewParams?.researchTab === "prompts" ? "prompts" : "keywords"
      next.set(RESEARCH_TAB_PARAM, tab)
      const query =
        typeof viewParams?.researchQuery === "string" ? viewParams.researchQuery.trim() : ""
      if (query) next.set(RESEARCH_QUERY_PARAM, query)
      else next.delete(RESEARCH_QUERY_PARAM)
    } else if (type === "search-results") {
      next.set(LEFT_PANE_VIEW_PARAM, "search-results")
      const query =
        typeof viewParams?.searchQuery === "string" ? viewParams.searchQuery.trim() : ""
      if (query) next.set(LEFT_SEARCH_QUERY_PARAM, query)
      else next.delete(LEFT_SEARCH_QUERY_PARAM)
    }
    return next
  }

  if (pane === "middle") {
    // Strict isolation: mutate only center* / middle active-view params.
    // Never clear or rewrite rightView / right* entity ids here.
    if (type === "ai") {
      clearMiddleSelectionParams(next)
      next.set("centerView", "ai")
      // Do not set taskAiOpen here — that flag means the *right* AI pane is open and
      // would trigger the default-open effect to also seed rightView=ai.
      next.delete("aiFocus")
      // AI should live in one pane only — demote right AI host if present.
      if (next.get("rightView") === "ai") {
        next.set("rightView", "details")
      }
      if (next.get(LEFT_PANE_VIEW_PARAM) === "ai") {
        clearLeftPaneSelectionParams(next)
        next.set(LEFT_PANE_VIEW_PARAM, "task-list")
        syncLegacyObjectParam(next, "task-list")
      }
      if (viewParams?.forceNewAiThread) {
        next.delete("aiThreadId")
        next.set("newAiThread", "true")
      } else if (viewParams?.aiThreadId) {
        next.set("aiThreadId", viewParams.aiThreadId)
        next.delete("newAiThread")
      } else if (id && String(id) !== AI_WORKSPACE_TAB_ID) {
        next.set("aiThreadId", String(id))
        next.delete("newAiThread")
      }
      return next
    }

    if (type === "browser") {
      clearMiddleSelectionParams(next)
      next.set("centerView", "browser")
      const browserTabId = viewParams?.browserTabId || (id ? String(id) : null)
      if (browserTabId) next.set("browserTabId", browserTabId)
      if (viewParams?.publicationRunId) {
        next.set("publicationRunId", viewParams.publicationRunId)
      }
      return next
    }

    if (isListWorkspaceViewType(type)) {
      clearMiddleSelectionParams(next)
      next.set("centerView", type)
      return next
    }

    // Entity / research / create — middle-only builders (no longer clear right*).
    if (type === "research") {
      return buildCenterPaneTabSelectionSearchParams({
        currentSearchParams: next,
        kind: "research",
        id: RESEARCH_WORKSPACE_TAB_ID,
        researchTab: viewParams?.researchTab,
        researchQuery: viewParams?.researchQuery,
      })
    }
    if (type === "create") {
      return buildCenterPaneTabSelectionSearchParams({
        currentSearchParams: next,
        kind: "create",
        id: CREATE_WORKSPACE_TAB_ID,
        createType: viewParams?.createType,
      })
    }
    if (type === "search-results") {
      clearMiddleSelectionParams(next)
      next.set("centerView", "search-results")
      const query =
        typeof viewParams?.searchQuery === "string" ? viewParams.searchQuery.trim() : ""
      if (query) next.set(CENTER_SEARCH_QUERY_PARAM, query)
      else next.delete(CENTER_SEARCH_QUERY_PARAM)
      return next
    }
    if (type === "suggestion") {
      return buildCenterPaneTabSelectionSearchParams({
        currentSearchParams: next,
        kind: "suggestion",
        id: id ?? "",
      })
    }
    if (type === "artifact") {
      return buildCenterPaneSelectionSearchParams({
        currentSearchParams: next,
        entity: "artifact",
        id: id ?? "",
        version: viewParams?.artifactVersion,
        openHistory: viewParams?.openArtifactHistory === true,
      })
    }
    if (type === "template") {
      return buildCenterPaneSelectionSearchParams({
        currentSearchParams: next,
        entity: "template",
        id: id ?? "",
      })
    }
    if (type === "thread") {
      return buildCenterPaneSelectionSearchParams({
        currentSearchParams: next,
        entity: "thread",
        id: id ?? "",
        mentionId: viewParams?.mentionId ?? null,
      })
    }
    if (
      type === "task" ||
      type === "project" ||
      type === "user" ||
      type === "team" ||
      type === "source"
    ) {
      return buildCenterPaneTabSelectionSearchParams({
        currentSearchParams: next,
        kind: type,
        id: id ?? "",
        tab: viewParams?.tab,
      })
    }
    return next
  }

  // ── right pane ──────────────────────────────────────────────────────────
  // Strict isolation: mutate only rightView / right* params. Preserve all center*.
  if (type === "ai") {
    ensurePaneInLayout(next, "right")
    next.set("rightView", "ai")
    next.set("taskAiOpen", "true")
    // AI should live in one pane only — clear middle AI host if present.
    if (next.get("centerView") === "ai") {
      next.delete("centerView")
    }
    if (next.get(LEFT_PANE_VIEW_PARAM) === "ai") {
      clearLeftPaneSelectionParams(next)
      next.set(LEFT_PANE_VIEW_PARAM, "task-list")
      syncLegacyObjectParam(next, "task-list")
    }
    if (viewParams?.forceNewAiThread) {
      next.delete("aiThreadId")
      next.set("newAiThread", "true")
      return next
    }
    const threadId =
      viewParams?.aiThreadId ||
      (id && String(id) !== AI_WORKSPACE_TAB_ID ? String(id) : "") ||
      next.get("aiThreadId") ||
      ""
    if (threadId) {
      next.set("aiThreadId", threadId)
      next.delete("newAiThread")
    }
    return next
  }

  if (type === "browser") {
    return buildOpenBrowserPaneParams(next, {
      browserTabId: viewParams?.browserTabId || (id ? String(id) : null),
      publicationRunId: viewParams?.publicationRunId,
      keepAiOpen: viewParams?.keepAiOpen !== false,
    })
  }

  if (isListWorkspaceViewType(type)) {
    clearRightEntitySelectionParams(next)
    next.set("rightView", type)
    applyRightPanePeerAiOpen(next, current, viewParams)
    return next
  }

  if (type === "search-results") {
    clearRightEntitySelectionParams(next)
    next.set("rightView", "search-results")
    applyRightPanePeerAiOpen(next, current, viewParams)
    const query =
      typeof viewParams?.searchQuery === "string" ? viewParams.searchQuery.trim() : ""
    if (query) next.set(RIGHT_SEARCH_QUERY_PARAM, query)
    else next.delete(RIGHT_SEARCH_QUERY_PARAM)
    return next
  }

  if (type === "details") {
    clearRightEntitySelectionParams(next)
    next.set("rightView", "details")
    next.set("taskAiOpen", "false")
    return next
  }

  // Entity / research / create in right pane.
  clearRightEntitySelectionParams(next)
  next.set("rightView", type)
  applyRightPanePeerAiOpen(next, current, viewParams)
  // Do not steal AI thread identity when showing an entity on the right.
  const entityId = id != null ? String(id) : ""

  if (type === "task" && entityId) next.set("rightTaskId", entityId)
  else if (type === "suggestion" && entityId) next.set("rightSuggestionId", entityId)
  else if (type === "project" && entityId) {
    next.set("rightProjectId", entityId)
    if (viewParams?.tab && viewParams.tab !== "overview") next.set("rightTab", viewParams.tab)
  } else if (type === "user" && entityId) {
    next.set("rightUserId", entityId)
    if (viewParams?.tab && viewParams.tab !== "overview") next.set("rightTab", viewParams.tab)
  } else if (type === "team" && entityId) {
    next.set("rightTeamId", entityId)
    if (viewParams?.tab && viewParams.tab !== "overview") next.set("rightTab", viewParams.tab)
  } else if (type === "thread" && entityId) {
    next.set("rightThreadId", entityId)
    if (viewParams?.mentionId != null) next.set("rightMentionId", String(viewParams.mentionId))
  } else if (type === "artifact" && entityId) {
    next.set("rightArtifactId", entityId)
  } else if (type === "source" && entityId) {
    next.set("rightSourceId", entityId)
  } else if (type === "template" && entityId) {
    next.set("rightTemplateId", entityId)
  } else if (type === "research") {
    next.set("rightView", "research")
    const tab = viewParams?.researchTab === "prompts" ? "prompts" : "keywords"
    next.set(RESEARCH_TAB_PARAM, tab)
    const query =
      typeof viewParams?.researchQuery === "string" ? viewParams.researchQuery.trim() : ""
    if (query) next.set(RESEARCH_QUERY_PARAM, query)
    else next.delete(RESEARCH_QUERY_PARAM)
  } else if (type === "create") {
    next.set("rightView", "create")
  }

  return next
}

export function workspaceTabKeyForUrlTab(tab: WorkspaceTab): string {
  return tab.key || buildWorkspaceTabKey(tab.type, tab.id)
}

/**
 * Clear the active view URL for one pane without touching the other pane's content.
 * Used when moving a tab (close source, open destination).
 */
export function clearPaneActiveViewParams(
  current: URLSearchParams,
  pane: WorkspacePaneId,
): URLSearchParams {
  const next = new URLSearchParams(current.toString())
  if (pane === "left") {
    clearLeftPaneSelectionParams(next)
    // Mark empty explicitly so seed effects do not recreate the moved tab via object=/default.
    next.set(LEFT_PANE_VIEW_PARAM, LEFT_PANE_EMPTY_VIEW)
    return next
  }
  if (pane === "middle") {
    clearMiddleSelectionParams(next)
    return next
  }
  clearRightEntitySelectionParams(next)
  const rightType = normalizeWorkspaceViewType(next.get("rightView"))
  if (next.get("rightView") === "ai" || next.get("rightView") === "browser" || next.get("rightView") === "publishing") {
    next.set("rightView", "details")
  } else if (
    rightType &&
    (isRightViewEntityType(next.get("rightView")) || isListWorkspaceViewType(rightType))
  ) {
    next.set("rightView", "details")
  }
  // Keep taskAiOpen / aiThreadId — thread identity is pane-neutral.
  return next
}
