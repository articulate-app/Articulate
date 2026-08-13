/**
 * Pane-neutral workspace view model.
 *
 * WHAT is open (WorkspaceTab / WorkspaceViewType) is separate from
 * WHERE it is open (WorkspacePaneId). Left, middle, or right can render any view type.
 */

export type WorkspacePaneId = "left" | "middle" | "right"

/**
 * First-class workspace view kinds. Aliases (keyword-research, prompt-research,
 * task-details, …) are normalized via `normalizeWorkspaceViewType`.
 */
export type WorkspaceViewType =
  | "task"
  | "task-list"
  | "project-list"
  | "mention-list"
  | "user-list"
  | "ai-thread-list"
  | "artifact-list"
  | "template-list"
  | "suggestion"
  | "project"
  | "user"
  | "team"
  | "thread"
  | "artifact"
  | "source"
  | "template"
  | "research"
  | "create"
  | "search-results"
  | "ai"
  | "browser"
  | "details"

export type WorkspaceTab = {
  /** Stable tab identity: `${type}:${id}` */
  key: string
  type: WorkspaceViewType
  /** Entity / session / thread id used in the key (may be a sentinel like "main" / "default"). */
  id: string
  title?: string

  taskId?: number
  projectId?: number
  artifactId?: string
  sourceId?: string
  aiThreadId?: string
  url?: string

  /** Extra view-specific params (research tab, create type, artifact version, …). */
  params?: Record<string, unknown>
}

export const RESEARCH_WORKSPACE_TAB_ID = "default"
export const CREATE_WORKSPACE_TAB_ID = "default"
export const SEARCH_RESULTS_WORKSPACE_TAB_ID = "main"
export const AI_WORKSPACE_TAB_ID = "main"
export const DETAILS_WORKSPACE_TAB_ID = "main"
/** Singleton identity for full-list workspace views (tasks / projects / …). */
export const LIST_WORKSPACE_TAB_ID = "main"
/** @deprecated Prefer LIST_WORKSPACE_TAB_ID. */
export const TASK_LIST_WORKSPACE_TAB_ID = LIST_WORKSPACE_TAB_ID

export function buildWorkspaceTabKey(type: WorkspaceViewType, id: string): string {
  return `${type}:${id}`
}

export function parseWorkspaceTabKey(
  key: string,
): { type: string; id: string } | null {
  const idx = key.indexOf(":")
  if (idx <= 0) return null
  return { type: key.slice(0, idx), id: key.slice(idx + 1) }
}

/** Normalize legacy / alias view names to the canonical WorkspaceViewType. */
export function normalizeWorkspaceViewType(
  raw: string | null | undefined,
): WorkspaceViewType | null {
  if (!raw) return null
  switch (raw) {
    case "task":
    case "task-details":
      return "task"
    case "task-list":
    case "tasks":
      return "task-list"
    case "project-list":
    case "projects":
      return "project-list"
    case "mention-list":
    case "mentions":
      return "mention-list"
    case "user-list":
    case "users":
      return "user-list"
    case "ai-thread-list":
    case "ai-list":
    case "ai_chats":
    case "ai-threads":
      return "ai-thread-list"
    case "artifact-list":
    case "artifacts":
      return "artifact-list"
    case "template-list":
    case "templates":
      return "template-list"
    case "suggestion":
      return "suggestion"
    case "project":
    case "project-details":
    case "project_briefing":
      return "project"
    case "user":
      return "user"
    case "team":
      return "team"
    case "thread":
    case "thread-chat":
    case "mention":
      return "thread"
    case "artifact":
      return "artifact"
    case "source":
      return "source"
    case "template":
      return "template"
    case "research":
    case "keyword-research":
    case "prompt-research":
      return "research"
    case "create":
      return "create"
    case "search-results":
    case "search":
      return "search-results"
    case "ai":
      return "ai"
    case "browser":
    case "publishing":
      return "browser"
    case "details":
      return "details"
    default:
      return null
  }
}

export function isEntityWorkspaceViewType(
  type: WorkspaceViewType,
): boolean {
  return (
    type === "task" ||
    type === "suggestion" ||
    type === "project" ||
    type === "user" ||
    type === "team" ||
    type === "thread" ||
    type === "artifact" ||
    type === "source" ||
    type === "template" ||
    type === "research" ||
    type === "create" ||
    type === "search-results"
  )
}

export function isListWorkspaceViewType(
  type: WorkspaceViewType,
): type is Extract<
  WorkspaceViewType,
  | "task-list"
  | "project-list"
  | "mention-list"
  | "user-list"
  | "ai-thread-list"
  | "artifact-list"
  | "template-list"
> {
  return (
    type === "task-list" ||
    type === "project-list" ||
    type === "mention-list" ||
    type === "user-list" ||
    type === "ai-thread-list" ||
    type === "artifact-list" ||
    type === "template-list"
  )
}

export function isToolWorkspaceViewType(type: WorkspaceViewType): boolean {
  return type === "ai" || type === "browser" || isListWorkspaceViewType(type)
}

/** Default “other” pane for move/open-in-other (left→middle, middle↔right). */
export function getOtherWorkspacePane(pane: WorkspacePaneId): WorkspacePaneId {
  if (pane === "left") return "middle"
  if (pane === "middle") return "right"
  return "middle"
}

/**
 * Established UX defaults: lists open in left; entities in middle; AI/browser in right.
 * Callers must pass an explicit pane — use these only as documented defaults.
 */
export const DEFAULT_WORKSPACE_PANE: Record<
  Exclude<WorkspaceViewType, "details">,
  WorkspacePaneId
> = {
  task: "middle",
  "task-list": "left",
  "project-list": "left",
  "mention-list": "left",
  "user-list": "left",
  "ai-thread-list": "left",
  "artifact-list": "left",
  "template-list": "left",
  suggestion: "middle",
  project: "middle",
  user: "middle",
  team: "middle",
  thread: "middle",
  artifact: "middle",
  source: "middle",
  template: "middle",
  research: "middle",
  create: "middle",
  "search-results": "middle",
  ai: "left",
  browser: "right",
}

export function workspaceTabFromParts(args: {
  type: WorkspaceViewType
  id: string
  title?: string | null
  params?: Record<string, unknown>
}): WorkspaceTab {
  const id = String(args.id).trim()
  const type = args.type
  const tab: WorkspaceTab = {
    key: buildWorkspaceTabKey(type, id),
    type,
    id,
    title: args.title?.trim() || undefined,
    params: args.params,
  }
  if (type === "task" || type === "suggestion") {
    const n = Number(id)
    if (Number.isFinite(n)) tab.taskId = n
  } else if (type === "project") {
    const n = Number(id)
    if (Number.isFinite(n)) tab.projectId = n
  } else if (type === "artifact") {
    tab.artifactId = id
  } else if (type === "source") {
    tab.sourceId = id
  } else if (type === "ai") {
    tab.aiThreadId = id === AI_WORKSPACE_TAB_ID ? undefined : id
  }
  return tab
}
