import type { GlobalSearchDetailTarget } from "../lib/global-search-types"
import {
  CREATE_CENTER_VIEW,
  KEYWORD_RESEARCH_CENTER_VIEW,
  PROMPT_RESEARCH_CENTER_VIEW,
  RESEARCH_CENTER_VIEW,
} from "../lib/center-pane-selection-url"
import {
  buildCenterPaneTabKey,
  CREATE_TAB_ID,
  RESEARCH_TAB_ID,
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
  if (entityType === "artifact") return "artifact"
  if (entityType === "source") return "source"
  // AI chats use type "ai" via openWorkspaceView — not a detail entity type.
  return null
}

export function resolveActiveCenterPaneTab(args: {
  selectedTaskId: string | number | null | undefined
  isSuggestion: boolean
  selectedTaskTitle?: string | null
  selectedDetailTarget: GlobalSearchDetailTarget | null | undefined
  stackTeamId?: string | number | null
  centerView?: string | null
  /** Tab identity is artifact id only — version is viewer state. */
  centerArtifactId?: string | null
  centerArtifactTitle?: string | null
  /** Tab identity is source id. */
  centerSourceId?: string | null
  centerSourceTitle?: string | null
  /** Tab identity is projectId:templateId. */
  centerTemplateId?: string | null
  centerTemplateTitle?: string | null
  /** When AI is open as a middle-pane tab. */
  aiThreadId?: string | null
  /** When Browser is open as a middle-pane tab. */
  browserTabId?: string | null
}): { key: string; kind: CenterPaneTabKind; id: string; title: string } | null {
  const {
    selectedTaskId: selectedTaskIdRaw,
    isSuggestion,
    selectedTaskTitle,
    selectedDetailTarget,
    stackTeamId: stackTeamIdRaw,
    centerView,
    centerArtifactId: centerArtifactIdRaw,
    centerArtifactTitle,
    centerSourceId: centerSourceIdRaw,
    centerSourceTitle,
    centerTemplateId: centerTemplateIdRaw,
    centerTemplateTitle,
    aiThreadId: aiThreadIdRaw,
    browserTabId: browserTabIdRaw,
  } = args
  const selectedTaskId =
    selectedTaskIdRaw == null || selectedTaskIdRaw === "" ? null : String(selectedTaskIdRaw)
  const stackTeamId =
    stackTeamIdRaw == null || stackTeamIdRaw === "" ? null : String(stackTeamIdRaw)
  const centerArtifactId =
    centerArtifactIdRaw == null || centerArtifactIdRaw === ""
      ? null
      : String(centerArtifactIdRaw).trim()
  const centerSourceId =
    centerSourceIdRaw == null || centerSourceIdRaw === ""
      ? null
      : String(centerSourceIdRaw).trim()
  const centerTemplateId =
    centerTemplateIdRaw == null || centerTemplateIdRaw === ""
      ? null
      : String(centerTemplateIdRaw).trim()
  const aiThreadId =
    aiThreadIdRaw == null || aiThreadIdRaw === "" ? null : String(aiThreadIdRaw).trim()
  const browserTabId =
    browserTabIdRaw == null || browserTabIdRaw === "" ? null : String(browserTabIdRaw).trim()

  // Pane-neutral tool views hosted in the middle pane.
  if (centerView === "ai") {
    const id = aiThreadId || "main"
    return {
      key: buildCenterPaneTabKey("ai", id),
      kind: "ai",
      id,
      title: "AI",
    }
  }
  if (centerView === "browser") {
    const id = browserTabId || "main"
    return {
      key: buildCenterPaneTabKey("browser", id),
      kind: "browser",
      id,
      title: "Browser",
    }
  }
  if (centerView === "task-list" || centerView === "tasks") {
    return {
      key: buildCenterPaneTabKey("task-list", "main"),
      kind: "task-list",
      id: "main",
      title: "Tasks",
    }
  }
  if (centerView === "search-results") {
    return {
      key: buildCenterPaneTabKey("search-results", "main"),
      kind: "search-results",
      id: "main",
      title: "Search",
    }
  }
  if (
    centerView === "project-list" ||
    centerView === "mention-list" ||
    centerView === "user-list" ||
    centerView === "ai-thread-list" ||
    centerView === "artifact-list" ||
    centerView === "template-list"
  ) {
    return {
      key: buildCenterPaneTabKey(centerView, "main"),
      kind: centerView,
      id: "main",
      title:
        centerView === "project-list"
          ? "Projects"
          : centerView === "mention-list"
            ? "Inbox"
            : centerView === "user-list"
              ? "Users"
              : centerView === "ai-thread-list"
                ? "AI chats"
                : centerView === "template-list"
                  ? "Templates"
                  : "Artifacts",
    }
  }

  // Artifact tabs are first-class middle-pane entities (identity = artifact id, not title).
  if (centerArtifactId) {
    return {
      key: buildCenterPaneTabKey("artifact", centerArtifactId),
      kind: "artifact",
      id: centerArtifactId,
      title: centerArtifactTitle?.trim() || `Artifact ${centerArtifactId.slice(0, 8)}`,
    }
  }

  if (centerSourceId) {
    return {
      key: buildCenterPaneTabKey("source", centerSourceId),
      kind: "source",
      id: centerSourceId,
      title: centerSourceTitle?.trim() || `Source ${centerSourceId.slice(0, 8)}`,
    }
  }

  if (centerTemplateId) {
    return {
      key: buildCenterPaneTabKey("template", centerTemplateId),
      kind: "template",
      id: centerTemplateId,
      title: centerTemplateTitle?.trim() || `Template ${centerTemplateId.slice(0, 12)}`,
    }
  }

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
    if (centerView === CREATE_CENTER_VIEW) {
      return {
        key: buildCenterPaneTabKey("create", CREATE_TAB_ID),
        kind: "create",
        id: CREATE_TAB_ID,
        title: "Create",
      }
    }
    if (
      centerView === RESEARCH_CENTER_VIEW ||
      centerView === KEYWORD_RESEARCH_CENTER_VIEW ||
      centerView === PROMPT_RESEARCH_CENTER_VIEW
    ) {
      return {
        key: buildCenterPaneTabKey("research", RESEARCH_TAB_ID),
        kind: "research",
        id: RESEARCH_TAB_ID,
        title: "Research",
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
            : kind === "artifact"
              ? `Artifact ${id.slice(0, 8)}`
              : `Thread ${id}`),
  }
}

export function toPaneTabStripItems(tabs: CenterPaneTab[]) {
  return tabs.map((tab) => ({ key: tab.key, label: tab.title }))
}
