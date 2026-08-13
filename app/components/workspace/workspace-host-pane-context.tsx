"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { WorkspacePaneId } from "../../lib/workspace-view"

/**
 * Which workspace pane is hosting the current view tree.
 * In-content navigations (watchers, related entities, …) must open into this pane
 * via `openWorkspaceView(..., { pane })` — never assume middle.
 */
const WorkspaceHostPaneContext = createContext<WorkspacePaneId>("middle")

export function WorkspaceHostPaneProvider({
  pane,
  children,
}: {
  pane: WorkspacePaneId
  children: ReactNode
}) {
  return (
    <WorkspaceHostPaneContext.Provider value={pane}>
      {children}
    </WorkspaceHostPaneContext.Provider>
  )
}

export function useWorkspaceHostPane(): WorkspacePaneId {
  return useContext(WorkspaceHostPaneContext)
}
