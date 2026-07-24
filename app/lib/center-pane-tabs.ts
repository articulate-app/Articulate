import type { GlobalSearchDetailTarget } from "../lib/global-search-types"
import { KEYWORD_RESEARCH_CENTER_VIEW } from "../lib/center-pane-selection-url"
import {
  buildCenterPaneTabKey,
  KEYWORD_RESEARCH_TAB_ID,
  type CenterPaneTab,
  type CenterPaneTabKind,
} from "../store/center-pane-tabs"

export function detailEntityTypeToCenterTabKind(
  entityType: string | null | undefined,
): CenterPaneTabKind | null {
  if (entityType === "task") return "task"
  if (entityType === "project" || entityType === "project_briefing") return "project"
  if (entityType === "user") return "user"
  if (entityType === "team") return "team"
  if (entityType === "mention") return "thread"
  // AI chats belong in the right pane only.
  return null
}

export function resolveActiveCenterPaneTab(args: {
  selectedTaskId: string | number | null | undefined
  isSuggestion: boolean
  selectedTaskTitle?: string | null
  selectedDetailTarget: GlobalSearchDetailTarget | null | undefined
  stackTeamId?: string | number | null
  centerView?: string | null
}): { key: string; kind: CenterPaneTabKind; id: string; title: string } | null {
  const {
    selectedTaskId: selectedTaskIdRaw,
    isSuggestion,
    selectedTaskTitle,
    selectedDetailTarget,
    stackTeamId: stackTeamIdRaw,
    centerView,
  } = args
  const selectedTaskId =
    selectedTaskIdRaw == null || selectedTaskIdRaw === "" ? null : String(selectedTaskIdRaw)
  const stackTeamId =
    stackTeamIdRaw == null || stackTeamIdRaw === "" ? null : String(stackTeamIdRaw)

  // Stacked team over user: the rendered middle content is the team.
  if (
    stackTeamId &&
    Number(stackTeamId) > 0 &&
    selectedDetailTarget?.entityType === "user" &&
    !selectedTaskId
  ) {
    const id = String(stackTeamId)
    return {
      key: buildCenterPaneTabKey("team", id),
      kind: "team",
      id,
      title: "Team",
    }
  }

  if (selectedTaskId) {
    const kind: CenterPaneTabKind = isSuggestion ? "suggestion" : "task"
    return {
      key: buildCenterPaneTabKey(kind, selectedTaskId),
      kind,
      id: selectedTaskId,
      title: selectedTaskTitle?.trim() || (isSuggestion ? `Suggestion ${selectedTaskId}` : `Task ${selectedTaskId}`),
    }
  }

  if (!selectedDetailTarget?.entityId && selectedDetailTarget?.entityType !== "mention") {
    if (centerView === KEYWORD_RESEARCH_CENTER_VIEW) {
      return {
        key: buildCenterPaneTabKey("keyword-research", KEYWORD_RESEARCH_TAB_ID),
        kind: "keyword-research",
        id: KEYWORD_RESEARCH_TAB_ID,
        title: "Keyword research",
      }
    }
    return null
  }

  const kind = detailEntityTypeToCenterTabKind(selectedDetailTarget.entityType)
  if (!kind) return null

  const id =
    kind === "thread"
      ? String(selectedDetailTarget.threadId ?? selectedDetailTarget.entityId ?? "")
      : kind === "project"
        ? String(
            selectedDetailTarget.projectId ??
              selectedDetailTarget.entityId ??
              "",
          )
        : String(selectedDetailTarget.entityId ?? "")

  if (!id) return null

  const titleFromTarget = selectedDetailTarget.title?.trim() ?? ""
  return {
    key: buildCenterPaneTabKey(kind, id),
    kind,
    id,
    title:
      titleFromTarget ||
      (kind === "user"
        ? `User ${id}`
        : kind === "project"
          ? `Project ${id}`
          : kind === "team"
            ? `Team ${id}`
            : `Thread ${id}`),
  }
}

export function toPaneTabStripItems(tabs: CenterPaneTab[]) {
  return tabs.map((tab) => ({ key: tab.key, label: tab.title }))
}
