import type { MainViewMode } from "../components/tasks/tasks-pane-toolbar"

export const SPLIT_VIEW_OPTIONS: MainViewMode[] = ["list", "calendar", "kanban"]

export const SPLIT_VIEW_LABELS: Record<MainViewMode, string> = {
  list: "List",
  calendar: "Calendar",
  kanban: "Kanban",
}

/** Split-pane views available given the primary (top) pane view. */
export function getSplitViewOptions(primaryView: MainViewMode): MainViewMode[] {
  return SPLIT_VIEW_OPTIONS.filter((view) => view !== primaryView)
}

export function getSplitViewLabel(view: MainViewMode): string {
  return SPLIT_VIEW_LABELS[view] ?? "View"
}
