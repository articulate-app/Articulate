"use client"

/**
 * Central policy: when a Task List workspace view selects a task, open Task Detail
 * in another available workspace pane so the list stays visible.
 */

import { openWorkspaceView, type OpenWorkspaceViewInput, type OpenWorkspaceViewOptions } from "./open-workspace-view"
import { getOtherWorkspacePane, type WorkspacePaneId, type WorkspaceTab } from "./workspace-view"

function isWorkspacePaneInLayout(pane: WorkspacePaneId, params: URLSearchParams): boolean {
  const layout = (params.get("layout") || "left,middle").split(",").filter(Boolean)
  return layout.includes(pane)
}

/**
 * Prefer the other workspace pane when it is already part of the layout (or can
 * be added without collapsing to a single pane). Otherwise open as another tab
 * in the host pane.
 */
export function resolveTaskDetailPaneFromTaskList(hostPane: WorkspacePaneId): WorkspacePaneId {
  if (typeof window === "undefined") return getOtherWorkspacePane(hostPane)
  const params = new URLSearchParams(window.location.search)
  const other = getOtherWorkspacePane(hostPane)
  const layout = (params.get("layout") || "left,middle").split(",").filter(Boolean)
  const workspacePanes = layout.filter((p) => p === "middle" || p === "right")
  // If both workspace panes are already present, always use the other one.
  if (workspacePanes.includes("middle") && workspacePanes.includes("right")) {
    return other
  }
  // If only the host is present, still open in the other pane and let
  // openWorkspaceView ensure it joins the layout (normal 2-pane desktop).
  // On explicitly solo layouts (single pane), keep the host.
  if (workspacePanes.length <= 1 && isWorkspacePaneInLayout(hostPane, params)) {
    const focus = params.get("focus")
    if (focus === "left" || focus === hostPane) {
      // Focused/solo host — keep detail in-host as another tab.
      return hostPane
    }
  }
  return other
}

export function openTaskDetailFromTaskList(
  hostPane: WorkspacePaneId,
  view: Extract<OpenWorkspaceViewInput, { type: "task" | "suggestion" }> | OpenWorkspaceViewInput,
  options?: Omit<OpenWorkspaceViewOptions, "pane">,
): WorkspaceTab {
  const pane = resolveTaskDetailPaneFromTaskList(hostPane)
  return openWorkspaceView(view, {
    ...options,
    pane,
    source: options?.source || `task-list-select:${hostPane}->${pane}`,
  })
}
