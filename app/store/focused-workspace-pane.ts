import { create } from "zustand"
import type { WorkspacePaneId } from "../lib/workspace-view"

/**
 * Last workspace pane the user interacted with (middle / right).
 * Used so sidebar / global opens land in the focused pane — not a hardcoded
 * entity→pane map. Persisted lightly in memory only (not URL).
 */
type FocusedWorkspacePaneState = {
  focusedPane: WorkspacePaneId | null
  setFocusedPane: (pane: WorkspacePaneId) => void
}

export const useFocusedWorkspacePaneStore = create<FocusedWorkspacePaneState>((set) => ({
  focusedPane: null,
  setFocusedPane: (pane) => set({ focusedPane: pane }),
}))

/** Read current focus outside React; falls back to middle when unset. */
export function getFocusedWorkspacePane(): WorkspacePaneId {
  return useFocusedWorkspacePaneStore.getState().focusedPane ?? "middle"
}
