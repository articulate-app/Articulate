/**
 * Single source of truth for workspace types exposed by the shared left/middle/right `+` menu.
 */

import type { WorkspaceViewType } from "./workspace-view"
import type { WorkspaceListViewType } from "./workspace-list-views"

export type WorkspaceNewTabListActionType = WorkspaceListViewType

export type WorkspaceNewTabToolActionType =
  | "research"
  | "browser"
  | Extract<WorkspaceViewType, "ai">
  | "message"

export type WorkspaceNewTabQuickActionType =
  | WorkspaceNewTabListActionType
  | WorkspaceNewTabToolActionType

export type WorkspaceNewTabQuickAction = {
  type: WorkspaceNewTabQuickActionType
  /** Menu label. */
  label: string
}

/** List / inbox views in the shared `+` menu. */
export const WORKSPACE_NEW_TAB_LIST_ACTIONS: readonly WorkspaceNewTabQuickAction[] = [
  { type: "task-list", label: "Tasks" },
  { type: "project-list", label: "Projects" },
  { type: "template-list", label: "Templates" },
  { type: "mention-list", label: "Inbox" },
  { type: "user-list", label: "Users" },
  { type: "ai-thread-list", label: "AI chats" },
  { type: "artifact-list", label: "Outputs" },
] as const

/** Tools / compose actions in the shared `+` menu. */
export const WORKSPACE_NEW_TAB_TOOL_ACTIONS: readonly WorkspaceNewTabQuickAction[] = [
  { type: "research", label: "Research" },
  { type: "browser", label: "Browser" },
  { type: "ai", label: "AI chat" },
  { type: "message", label: "Message" },
] as const

/** @deprecated Prefer LIST + TOOL action arrays. */
export const WORKSPACE_NEW_TAB_QUICK_ACTIONS: readonly WorkspaceNewTabQuickAction[] = [
  ...WORKSPACE_NEW_TAB_LIST_ACTIONS,
  ...WORKSPACE_NEW_TAB_TOOL_ACTIONS,
] as const

/**
 * Conceptual inventory of workspace views the shared `+` menu can open.
 */
export const WORKSPACE_NEW_TAB_VIEW_TYPES: readonly WorkspaceViewType[] = [
  "task-list",
  "project-list",
  "template-list",
  "mention-list",
  "user-list",
  "ai-thread-list",
  "artifact-list",
  "task",
  "project",
  "user",
  "team",
  "thread",
  "research",
  "browser",
  "ai",
] as const
