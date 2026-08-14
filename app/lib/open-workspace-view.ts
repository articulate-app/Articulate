"use client"

/**
 * Central API for opening any workspace view in left, middle, or right.
 *
 * Features should call `openWorkspaceView` instead of manipulating
 * center* / rightView / leftPaneView params directly.
 */

import { shallowReplaceSearchParams } from "./tasks-shallow-nav"
import {
  applyWorkspaceViewToSearchParams,
  clearPaneActiveViewParams,
  getActiveLeftWorkspaceTab,
  getActiveMiddleWorkspaceTab,
  getActiveRightWorkspaceTab,
  type ApplyWorkspaceViewArgs,
} from "./workspace-pane-url"
import {
  AI_WORKSPACE_TAB_ID,
  CREATE_WORKSPACE_TAB_ID,
  LIST_WORKSPACE_TAB_ID,
  RESEARCH_WORKSPACE_TAB_ID,
  SEARCH_RESULTS_WORKSPACE_TAB_ID,
  START_WORKSPACE_TAB_ID,
  TASK_LIST_WORKSPACE_TAB_ID,
  buildWorkspaceTabKey,
  getOtherWorkspacePane,
  isListWorkspaceViewType,
  type WorkspacePaneId,
  type WorkspaceTab,
  type WorkspaceViewType,
} from "./workspace-view"
import {
  getFocusedWorkspacePane,
  useFocusedWorkspacePaneStore,
} from "../store/focused-workspace-pane"
import {
  useCenterPaneTabsStore,
  type CenterPaneTabKind,
} from "../store/center-pane-tabs"
import {
  useRightPaneTabsStore,
  type RightPaneBrowserAssociations,
  type RightPaneTabKind,
} from "../store/right-pane-tabs"
import { useLeftPaneTabsStore, type LeftPaneTabKind } from "../store/left-pane-tabs"
import { workspaceListViewLabel } from "./workspace-list-views"
import { moveItemBeforeKey } from "./pane-tab-order"
import {
  parseAiRightTabKey,
  useAiPaneChromeStore,
} from "../../features/ai-chat/ai-pane-chrome-store"

export type OpenWorkspaceViewOptions = {
  pane: WorkspacePaneId
  /** Prefer an existing matching tab (default) or always insert a new browser/ai instance. */
  tabMode?: "reuse" | "new"
  focus?: boolean
  pathname?: string
  source?: string
  /** Explicit destination when moving (three-pane). Defaults to getOtherWorkspacePane(from). */
  toPane?: WorkspacePaneId
}

export type OpenWorkspaceViewInput = {
  type: WorkspaceViewType
  id?: string | number | null
  title?: string | null
  taskId?: number
  projectId?: number
  artifactId?: string
  sourceId?: string
  aiThreadId?: string
  url?: string
  params?: ApplyWorkspaceViewArgs["params"] & Record<string, unknown>
}

export { getOtherWorkspacePane }

function resolveViewId(view: OpenWorkspaceViewInput): string {
  if (isListWorkspaceViewType(view.type)) {
    return LIST_WORKSPACE_TAB_ID
  }
  if (view.type === "ai") {
    return (
      view.aiThreadId?.trim() ||
      (typeof view.params?.aiThreadId === "string" ? view.params.aiThreadId.trim() : "") ||
      (view.id != null ? String(view.id).trim() : "") ||
      AI_WORKSPACE_TAB_ID
    )
  }
  if (view.type === "browser") {
    if (view.params?.browserTabId) return String(view.params.browserTabId)
    if (view.id != null && String(view.id).trim()) return String(view.id).trim()
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `browser-${Date.now()}`
  }
  if (view.type === "research") return RESEARCH_WORKSPACE_TAB_ID
  if (view.type === "create") return CREATE_WORKSPACE_TAB_ID
  if (view.type === "search-results") return SEARCH_RESULTS_WORKSPACE_TAB_ID
  if (view.type === "start") return START_WORKSPACE_TAB_ID
  if (view.type === "artifact") {
    return view.artifactId?.trim() || (view.id != null ? String(view.id).trim() : "")
  }
  if (view.type === "source") {
    return view.sourceId?.trim() || (view.id != null ? String(view.id).trim() : "")
  }
  if (view.type === "task" || view.type === "suggestion") {
    if (view.taskId != null) return String(view.taskId)
    return view.id != null ? String(view.id).trim() : ""
  }
  if (view.type === "project") {
    if (view.projectId != null) return String(view.projectId)
    return view.id != null ? String(view.id).trim() : ""
  }
  return view.id != null ? String(view.id).trim() : ""
}

function toOpenInput(view: OpenWorkspaceViewInput | WorkspaceTab): OpenWorkspaceViewInput {
  if ("key" in view && view.key) {
    return {
      type: view.type,
      id: view.id,
      title: view.title,
      taskId: view.taskId,
      projectId: view.projectId,
      artifactId: view.artifactId,
      sourceId: view.sourceId,
      aiThreadId: view.aiThreadId,
      url: view.url,
      params: view.params as OpenWorkspaceViewInput["params"],
    }
  }
  return view
}

const CENTER_KINDS = new Set<string>([
  "task",
  "task-list",
  "project-list",
  "mention-list",
  "user-list",
  "ai-thread-list",
  "artifact-list",
  "template-list",
  "suggestion",
  "project",
  "user",
  "team",
  "thread",
  "artifact",
  "source",
  "template",
  "research",
  "create",
  "search-results",
  "start",
  "ai",
  "browser",
])

/**
 * Target pane for sidebar / global navigation: currently focused workspace pane,
 * falling back to middle (primary default). Never hardcode entity→pane maps here.
 */
export function resolveFocusedWorkspacePane(
  preferred?: WorkspacePaneId | null,
): WorkspacePaneId {
  return preferred ?? getFocusedWorkspacePane()
}

function upsertLeftTab(view: OpenWorkspaceViewInput, id: string) {
  const title =
    view.title ||
    (isListWorkspaceViewType(view.type) ? workspaceListViewLabel(view.type) : undefined)
  useLeftPaneTabsStore.getState().upsertTab({
    kind: view.type as LeftPaneTabKind,
    id,
    title,
    activate: true,
  })
}

function upsertMiddleTab(view: OpenWorkspaceViewInput, id: string) {
  if (!CENTER_KINDS.has(view.type)) return
  useCenterPaneTabsStore.getState().upsertTab({
    kind: view.type as CenterPaneTabKind,
    id,
    title:
      view.title ||
      (isListWorkspaceViewType(view.type) ? workspaceListViewLabel(view.type) : undefined),
  })
}

function upsertRightTab(
  view: OpenWorkspaceViewInput,
  id: string,
  options: OpenWorkspaceViewOptions,
  browserAssociations?: RightPaneBrowserAssociations,
) {
  if (view.type === "ai") {
    useRightPaneTabsStore.getState().upsertTab({
      kind: "ai",
      title: view.title || "AI",
      activate: options.focus !== false,
    })
    return
  }
  if (view.type === "browser") {
    useRightPaneTabsStore.getState().upsertTab({
      kind: "browser",
      id,
      title: view.title || "Browser",
      browser: browserAssociations ?? {
        phase: (view.params?.phase as string | undefined) ?? "provisioning",
        publicationRunId: view.params?.publicationRunId ?? null,
        intentionallyStopped: false,
      },
      activate: options.focus !== false,
    })
    return
  }
  if (view.type === "details") {
    useRightPaneTabsStore.getState().upsertTab({
      kind: "details",
      title: view.title || "Details",
      activate: options.focus !== false,
    })
    return
  }
  useRightPaneTabsStore.getState().upsertTab({
    kind: view.type as RightPaneTabKind,
    id,
    title:
      view.title ||
      (isListWorkspaceViewType(view.type) ? workspaceListViewLabel(view.type) : undefined),
    activate: options.focus !== false,
  })
}

type NextSourceTab = {
  type: WorkspaceViewType
  id: string
  title?: string
}

/**
 * Remove a tab from a pane store. Returns the next tab that should own that pane's URL
 * (or null when the pane has no remaining tabs to activate).
 */
function removeTabFromPane(
  pane: WorkspacePaneId,
  type: WorkspaceViewType,
  id: string,
): NextSourceTab | null {
  const key = buildWorkspaceTabKey(type, id)
  if (pane === "left") {
    const nextKey = useLeftPaneTabsStore.getState().closeTab(key)
    const tab = useLeftPaneTabsStore.getState().tabs.find((entry) => entry.key === nextKey)
    return tab ? { type: tab.kind, id: tab.id, title: tab.title } : null
  }
  if (pane === "middle") {
    const next = useCenterPaneTabsStore.getState().closeTab(key)
    // Also drop the sticky `ai:main` placeholder if we moved a concrete thread.
    if (type === "ai") {
      useCenterPaneTabsStore.getState().closeTab(buildWorkspaceTabKey("ai", AI_WORKSPACE_TAB_ID))
    }
    const remaining = useCenterPaneTabsStore.getState().tabs
    const pick =
      (next && remaining.some((tab) => tab.key === next.key) ? next : null) ??
      remaining[remaining.length - 1] ??
      null
    return pick ? { type: pick.kind as WorkspaceViewType, id: pick.id, title: pick.title } : null
  }
  // Browser session state lives on the right-pane tab store regardless of display pane —
  // do not drop browser associations when moving the right display of a browser tab.
  if (type === "browser") {
    const state = useRightPaneTabsStore.getState()
    const nextAi = state.tabs.find((tab) => tab.kind === "ai")
    state.setActiveKey(nextAi?.key ?? null)
    return nextAi ? { type: "ai", id: AI_WORKSPACE_TAB_ID, title: nextAi.title || "AI" } : null
  }
  if (type === "ai") {
    // Moving AI off the right pane — deactivate sticky AI tab.
    useRightPaneTabsStore.getState().setActiveKey(null)
    const nextEntity = useRightPaneTabsStore
      .getState()
      .tabs.find((tab) => tab.kind !== "ai" && tab.kind !== "details" && tab.kind !== "browser")
    const nextBrowser = useRightPaneTabsStore.getState().tabs.find((tab) => tab.kind === "browser")
    const pick = nextEntity ?? nextBrowser
    if (!pick) return null
    const pickId =
      pick.id?.trim() ||
      (pick.key.includes(":") ? pick.key.slice(pick.key.indexOf(":") + 1) : pick.kind)
    return {
      type: pick.kind as WorkspaceViewType,
      id: pickId,
      title: pick.title,
    }
  }
  const nextKey = useRightPaneTabsStore.getState().closeTab(key)
  const tab = useRightPaneTabsStore.getState().tabs.find((entry) => entry.key === nextKey)
  if (!tab || tab.kind === "details") return null
  const tabId =
    tab.id?.trim() ||
    (tab.key.includes(":") ? tab.key.slice(tab.key.indexOf(":") + 1) : tab.kind)
  return {
    type: tab.kind as WorkspaceViewType,
    id: tabId,
    title: tab.title,
  }
}

function demoteAiHostsExcept(keepPane: WorkspacePaneId) {
  if (keepPane !== "left") {
    const left = useLeftPaneTabsStore.getState()
    for (const tab of left.tabs) {
      if (tab.kind === "ai") left.closeTab(tab.key)
    }
  }
  if (keepPane !== "middle") {
    const center = useCenterPaneTabsStore.getState()
    for (const tab of center.tabs) {
      if (tab.kind === "ai") center.closeTab(tab.key)
    }
  }
  if (keepPane !== "right") {
    useRightPaneTabsStore.getState().setActiveKey(null)
  }
}

/**
 * Open (or focus) a workspace view in the given pane.
 * Returns the resolved WorkspaceTab that was activated.
 */
export function openWorkspaceView(
  view: OpenWorkspaceViewInput | WorkspaceTab,
  options: OpenWorkspaceViewOptions,
): WorkspaceTab {
  const input = toOpenInput(view)

  let id = resolveViewId(input)
  if (input.type === "browser" && options.tabMode === "new") {
    // Callers that pre-start the session (beginManualBrowserOpen) already mint a fresh id.
    // Regenerating here would break claimManualBrowserOpen and orphan the Desktop view.
    const callerId =
      (input.id != null && String(input.id).trim()) ||
      (typeof input.params?.browserTabId === "string" && input.params.browserTabId.trim()) ||
      ""
    id =
      callerId ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `browser-${Date.now()}`)
  }

  if (
    !id &&
    input.type !== "research" &&
    input.type !== "create" &&
    input.type !== "details" &&
    !isListWorkspaceViewType(input.type)
  ) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[openWorkspaceView] missing id for", input.type, options.pane)
    }
  }

  // Preserve browser session associations when reopening/moving an existing browser tab.
  let browserAssociations: RightPaneBrowserAssociations | undefined
  if (input.type === "browser" && id) {
    const existing = useRightPaneTabsStore
      .getState()
      .tabs.find((tab) => tab.key === buildWorkspaceTabKey("browser", id))
    if (existing?.browser) {
      browserAssociations = {
        ...existing.browser,
        publicationRunId:
          (input.params?.publicationRunId as string | null | undefined) ??
          existing.browser.publicationRunId,
        phase:
          (input.params?.phase as string | undefined) ??
          existing.browser.phase ??
          "provisioning",
      }
    }
  }

  const listFallbackId = isListWorkspaceViewType(input.type)
    ? LIST_WORKSPACE_TAB_ID
    : RESEARCH_WORKSPACE_TAB_ID

  if (options.pane === "left") {
    upsertLeftTab(input, id || listFallbackId)
    if (input.type === "browser") {
      upsertRightTab(input, id, { ...options, focus: false }, browserAssociations)
    }
    if (input.type === "ai") {
      demoteAiHostsExcept("left")
    }
  } else if (options.pane === "middle") {
    upsertMiddleTab(input, id || listFallbackId)
    // Browser session still lives in the shared browser tab store.
    if (input.type === "browser") {
      upsertRightTab(input, id, { ...options, focus: false }, browserAssociations)
    }
    if (input.type === "ai") {
      demoteAiHostsExcept("middle")
    }
  } else {
    upsertRightTab(
      input,
      id ||
        (isListWorkspaceViewType(input.type) ? TASK_LIST_WORKSPACE_TAB_ID : AI_WORKSPACE_TAB_ID),
      options,
      browserAssociations,
    )
    if (input.type === "ai") {
      demoteAiHostsExcept("right")
    }
  }

  const current =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams()

  const next = applyWorkspaceViewToSearchParams({
    current,
    pane: options.pane,
    type: input.type,
    id,
    title: input.title,
    params: {
      ...input.params,
      aiThreadId: input.aiThreadId ?? input.params?.aiThreadId,
      browserTabId: input.type === "browser" ? id : input.params?.browserTabId,
    },
  })

  const pathname =
    options.pathname ||
    (typeof window !== "undefined" ? window.location.pathname : "/")

  if (typeof window !== "undefined") {
    shallowReplaceSearchParams(
      pathname,
      next,
      options.source || `open-workspace-view:${options.pane}:${input.type}`,
    )
    if (options.focus !== false) {
      useFocusedWorkspacePaneStore.getState().setFocusedPane(options.pane)
    }
  }

  return {
    key: buildWorkspaceTabKey(input.type, id || input.type),
    type: input.type,
    id: id || input.type,
    title: input.title || undefined,
    taskId: input.taskId,
    projectId: input.projectId,
    artifactId: input.artifactId,
    sourceId: input.sourceId,
    aiThreadId: input.aiThreadId,
    url: input.url,
    params: input.params,
  }
}

/**
 * Open the same view in the other pane without removing it from the current pane.
 */
export function openWorkspaceViewInOtherPane(
  view: OpenWorkspaceViewInput | WorkspaceTab,
  currentPane: WorkspacePaneId,
  options?: Omit<OpenWorkspaceViewOptions, "pane">,
): WorkspaceTab {
  return openWorkspaceView(view, {
    ...options,
    pane: options?.toPane ?? getOtherWorkspacePane(currentPane),
    source: options?.source || `open-workspace-view-other:${currentPane}`,
  })
}

/**
 * Move a workspace view from one pane to another.
 * Preserves view identity (AI thread id, browser tab id, entity id).
 * Does not create a new AI thread or browser session.
 */
export function moveWorkspaceView(
  view: OpenWorkspaceViewInput | WorkspaceTab,
  fromPane: WorkspacePaneId,
  options?: Omit<OpenWorkspaceViewOptions, "pane">,
): WorkspaceTab {
  const input = toOpenInput(view)
  const id = resolveViewId(input)
  const toPane = options?.toPane ?? getOtherWorkspacePane(fromPane)

  // Close on the source store first, then point that pane's URL at a remaining tab
  // (or clear it). Never re-seed the moved view on the source pane.
  const nextSource = removeTabFromPane(fromPane, input.type, id || input.type)

  if (typeof window !== "undefined") {
    let params = new URLSearchParams(window.location.search)
    if (nextSource) {
      params = applyWorkspaceViewToSearchParams({
        current: params,
        pane: fromPane,
        type: nextSource.type,
        id: nextSource.id,
        title: nextSource.title,
      })
    } else {
      params = clearPaneActiveViewParams(params, fromPane)
    }
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}?${params.toString()}`,
    )
  }

  return openWorkspaceView(
    {
      ...input,
      id,
      // Keep the same browser tab id / AI thread id.
      params: {
        ...input.params,
        browserTabId: input.type === "browser" ? id : input.params?.browserTabId,
        aiThreadId:
          input.type === "ai"
            ? id !== AI_WORKSPACE_TAB_ID
              ? id
              : input.params?.aiThreadId
            : input.params?.aiThreadId,
        keepAiOpen: input.type === "browser" ? true : input.params?.keepAiOpen,
      },
    },
    {
      ...options,
      pane: toPane,
      tabMode: "reuse",
      source: options?.source || `move-workspace-view:${fromPane}->${toPane}`,
    },
  )
}

/**
 * After a cross-pane move, place the tab before `beforeKey` in the destination strip order.
 * `beforeKey` is the destination strip key that should sit immediately after the moved tab
 * (`null` = append). AI chrome keys (`ai:…`) map to the start of the non-AI section.
 */
export function placeMovedTabInPane(
  pane: WorkspacePaneId,
  tabKey: string,
  beforeKey: string | null | undefined,
) {
  if (!tabKey || tabKey.startsWith("ai:")) return

  if (pane === "left") {
    useLeftPaneTabsStore.getState().moveTabBefore(tabKey, beforeKey ?? null)
    return
  }

  if (pane === "middle") {
    // Middle strip is center tabs then AI chrome — dropping before an AI tab means end of center.
    const resolved =
      beforeKey && beforeKey.startsWith("ai:") ? null : (beforeKey ?? null)
    useCenterPaneTabsStore.getState().moveTabBefore(tabKey, resolved)
    return
  }

  // Right strip is AI chrome → entities → browsers. Dropping before AI places at start of entities.
  if (beforeKey?.startsWith("ai:")) {
    const firstContent = useRightPaneTabsStore
      .getState()
      .tabs.find((tab) => tab.kind !== "ai" && tab.kind !== "details" && tab.key !== tabKey)
    useRightPaneTabsStore.getState().moveTabBefore(tabKey, firstContent?.key ?? null)
    return
  }
  useRightPaneTabsStore.getState().moveTabBefore(tabKey, beforeKey ?? null)
}

/** Reorder an AI chrome tab among other AI tabs (shared middle/right strip). */
function reorderAiChromeTab(tabKey: string, beforeKey: string | null | undefined) {
  const id = parseAiRightTabKey(tabKey)
  if (!id) return
  const beforeAiId =
    beforeKey && beforeKey.startsWith("ai:") ? parseAiRightTabKey(beforeKey) : null
  const { tabs, sync, handlers } = useAiPaneChromeStore.getState()
  const keyed = tabs.map((tab) => ({
    key: tab.id,
    title: tab.title,
    isOptimistic: tab.isOptimistic,
  }))
  const next = moveItemBeforeKey(keyed, id, beforeAiId)
  if (next === keyed) return
  const orderedIds = next.map((tab) => tab.key)
  // Prefer AiPane openTabs as source of truth so the next chrome sync keeps this order.
  handlers?.reorderTabs?.(orderedIds)
  sync({
    tabs: next.map((tab) => ({
      id: tab.key,
      title: tab.title,
      isOptimistic: tab.isOptimistic,
    })),
  })
}

/**
 * Same-pane tab reorder from the strip drag-and-drop.
 * AI chrome tabs reorder among themselves; other keys use the pane tab store.
 */
export function reorderWorkspaceTabInPane(
  pane: WorkspacePaneId,
  tabKey: string,
  beforeKey: string | null | undefined,
) {
  if (!tabKey) return
  if (tabKey.startsWith("ai:")) {
    reorderAiChromeTab(tabKey, beforeKey)
    return
  }
  placeMovedTabInPane(pane, tabKey, beforeKey)
}

/** Resolve the active tab for a pane from the live URL (compat). */
export function getActiveWorkspaceTabForPane(pane: WorkspacePaneId): WorkspaceTab | null {
  if (typeof window === "undefined") return null
  const params = new URLSearchParams(window.location.search)
  if (pane === "left") return getActiveLeftWorkspaceTab(params)
  if (pane === "middle") return getActiveMiddleWorkspaceTab(params)
  return getActiveRightWorkspaceTab(params)
}

/**
 * Move the currently active tab in `fromPane` to the other pane.
 * No-op when the pane has no active workspace tab.
 */
export function moveActiveWorkspaceTab(
  fromPane: WorkspacePaneId,
  options?: Omit<OpenWorkspaceViewOptions, "pane">,
): WorkspaceTab | null {
  const active = getActiveWorkspaceTabForPane(fromPane)
  if (!active || active.type === "details") return null
  return moveWorkspaceView(active, fromPane, options)
}

/**
 * Move a workspace tab identified by its strip key (`type:id`) to another pane.
 * Used by cross-pane tab drag-and-drop.
 */
export function moveWorkspaceTabByKey(
  fromPane: WorkspacePaneId,
  tabKey: string,
  options?: Omit<OpenWorkspaceViewOptions, "pane"> & {
    title?: string | null
    /** Destination strip key that should sit immediately after the moved tab (`null` = end). */
    beforeKey?: string | null
  },
): WorkspaceTab | null {
  const colon = tabKey.indexOf(":")
  if (colon <= 0) return null
  const type = tabKey.slice(0, colon) as WorkspaceViewType
  const id = tabKey.slice(colon + 1)
  if (!type || !id || type === "details") return null

  // Prefer title already on the strip / drag payload — avoid title refetch on move.
  let title = options?.title?.trim() || undefined
  if (!title) {
    if (fromPane === "left") {
      title =
        useLeftPaneTabsStore.getState().tabs.find((tab) => tab.key === tabKey)?.title ||
        undefined
    } else if (fromPane === "middle") {
      title =
        useCenterPaneTabsStore.getState().tabs.find((tab) => tab.key === tabKey)?.title ||
        undefined
    } else {
      title =
        useRightPaneTabsStore.getState().tabs.find((tab) => tab.key === tabKey)?.title ||
        undefined
    }
  }

  const toPane = options?.toPane ?? getOtherWorkspacePane(fromPane)
  const moved = moveWorkspaceView(
    {
      type,
      id,
      title,
      aiThreadId: type === "ai" && id !== AI_WORKSPACE_TAB_ID ? id : undefined,
      artifactId: type === "artifact" ? id : undefined,
      sourceId: type === "source" ? id : undefined,
      params:
        type === "browser"
          ? { browserTabId: id, keepAiOpen: true }
          : type === "ai" && id !== AI_WORKSPACE_TAB_ID
            ? { aiThreadId: id }
            : undefined,
    },
    fromPane,
    options,
  )
  if (options && options.beforeKey !== undefined) {
    placeMovedTabInPane(toPane, moved.key, options.beforeKey)
  }
  return moved
}

/**
 * Duplicate/open the currently active tab into the other pane (non-destructive).
 */
export function openActiveWorkspaceTabInOtherPane(
  fromPane: WorkspacePaneId,
  options?: Omit<OpenWorkspaceViewOptions, "pane">,
): WorkspaceTab | null {
  const active = getActiveWorkspaceTabForPane(fromPane)
  if (!active || active.type === "details") return null
  return openWorkspaceViewInOtherPane(active, fromPane, options)
}
