/**
 * Map between legacy left-pane object routes and first-class workspace list view types.
 */

import type { LeftPaneObject } from "./left-pane-object"
import type { SearchObjectRoute } from "./search-routing"
import type { WorkspaceViewType } from "./workspace-view"
import { LIST_WORKSPACE_TAB_ID } from "./workspace-view"

export type WorkspaceListViewType = Extract<
  WorkspaceViewType,
  | "task-list"
  | "project-list"
  | "mention-list"
  | "user-list"
  | "ai-thread-list"
  | "artifact-list"
  | "template-list"
>

export const WORKSPACE_LIST_VIEW_TYPES: readonly WorkspaceListViewType[] = [
  "task-list",
  "project-list",
  "mention-list",
  "user-list",
  "ai-thread-list",
  "artifact-list",
  "template-list",
] as const

export function isWorkspaceListViewType(
  type: string | null | undefined,
): type is WorkspaceListViewType {
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

export function workspaceListViewLabel(type: WorkspaceListViewType): string {
  if (type === "task-list") return "Tasks"
  if (type === "project-list") return "Projects"
  if (type === "mention-list") return "Inbox"
  if (type === "user-list") return "Users"
  if (type === "ai-thread-list") return "AI chats"
  if (type === "template-list") return "Templates"
  return "Outputs"
}

/** Global-search / full-results tab key for a list view. Templates use a dedicated list. */
export function workspaceListViewSearchTab(
  type: Exclude<WorkspaceListViewType, "template-list">,
): "task" | "project" | "mention" | "user" | "ai_thread" | "artifact" {
  if (type === "task-list") return "task"
  if (type === "project-list") return "project"
  if (type === "mention-list") return "mention"
  if (type === "user-list") return "user"
  if (type === "ai-thread-list") return "ai_thread"
  return "artifact"
}

export function leftPaneObjectToListView(object: LeftPaneObject): WorkspaceListViewType {
  if (object === "projects") return "project-list"
  if (object === "mentions") return "mention-list"
  if (object === "users") return "user-list"
  if (object === "ai_chats") return "ai-thread-list"
  if (object === "artifacts") return "artifact-list"
  return "task-list"
}

export function leftPaneObjectForListViewType(type: WorkspaceListViewType): LeftPaneObject {
  if (type === "project-list") return "projects"
  if (type === "mention-list") return "mentions"
  if (type === "user-list") return "users"
  if (type === "ai-thread-list") return "ai_chats"
  if (type === "artifact-list") return "artifacts"
  return "tasks"
}

export function searchObjectRouteToListView(
  object: SearchObjectRoute | undefined,
): WorkspaceListViewType | null {
  if (!object || object === "all" || object === "team") return null
  if (object === "task") return "task-list"
  if (object === "project") return "project-list"
  if (object === "mention") return "mention-list"
  if (object === "user") return "user-list"
  if (object === "ai_thread") return "ai-thread-list"
  if (object === "artifact") return "artifact-list"
  return null
}

export function listViewToSearchObjectRoute(type: WorkspaceListViewType): SearchObjectRoute {
  if (type === "task-list") return "task"
  if (type === "project-list") return "project"
  if (type === "mention-list") return "mention"
  if (type === "user-list") return "user"
  if (type === "ai-thread-list") return "ai_thread"
  if (type === "template-list") return "all"
  return "artifact"
}

export function listViewWorkspaceTab(type: WorkspaceListViewType) {
  return {
    type,
    id: LIST_WORKSPACE_TAB_ID,
    title: workspaceListViewLabel(type),
  } as const
}
