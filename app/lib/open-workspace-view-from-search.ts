/**
 * Open a global-search document as a workspace view in an explicit pane.
 * Used by the shared middle/right `+` menu so destination is never inferred from pane role.
 */

import type { QueryClient } from "@tanstack/react-query"
import type { GlobalSearchDocument } from "./global-search-types"
import { seedEntityPreviewFromSearchDocument } from "./entity-preview-from-search"
import { openWorkspaceView, type OpenWorkspaceViewOptions } from "./open-workspace-view"
import type { WorkspacePaneId } from "./workspace-view"

function optionalString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return null
}

function isAiThreadItem(item: GlobalSearchDocument): boolean {
  return item.entity_type === "ai_thread"
}

export type OpenWorkspaceViewFromSearchOptions = {
  pane: WorkspacePaneId
  pathname?: string
  source?: string
  queryClient?: QueryClient
}

/**
 * Map a search / recently-opened document to `openWorkspaceView` for `pane`.
 * Returns false when the item cannot be opened as a workspace view.
 */
export function openWorkspaceViewFromSearchDocument(
  item: GlobalSearchDocument,
  options: OpenWorkspaceViewFromSearchOptions,
): boolean {
  const { pane, pathname, source = "workspace-new-tab-search", queryClient } = options
  const openOpts: OpenWorkspaceViewOptions = { pane, pathname, source }

  if (queryClient) {
    seedEntityPreviewFromSearchDocument(queryClient, item)
  }

  if (isAiThreadItem(item)) {
    const threadId =
      optionalString(item.entity_id) ??
      optionalString(item.raw.thread_id) ??
      optionalString(item.raw.id)
    if (!threadId) return false
    openWorkspaceView(
      { type: "ai", aiThreadId: threadId, title: optionalString(item.title) },
      openOpts,
    )
    return true
  }

  if (item.entity_type === "artifact") {
    const artifactId =
      optionalString(item.entity_id) ??
      optionalString(item.raw.artifact_id) ??
      optionalString(item.raw.id)
    if (!artifactId) return false
    openWorkspaceView(
      {
        type: "artifact",
        artifactId,
        title: optionalString(item.title),
      },
      openOpts,
    )
    return true
  }

  if (item.entity_type === "task" && item.entity_id != null) {
    openWorkspaceView(
      {
        type: "task",
        id: String(item.entity_id),
        title: optionalString(item.title),
      },
      openOpts,
    )
    return true
  }

  if (item.entity_type === "project" || item.entity_type === "project_briefing") {
    const projectId =
      optionalString(item.project_id) ??
      optionalString(item.raw.project_id) ??
      optionalString(item.raw.projectId) ??
      optionalString(item.entity_id)
    if (!projectId) return false
    openWorkspaceView(
      {
        type: "project",
        id: projectId,
        title: optionalString(item.title),
        params:
          item.entity_type === "project_briefing"
            ? { tab: "briefings" }
            : undefined,
      },
      openOpts,
    )
    return true
  }

  if (item.entity_type === "user" && item.entity_id != null) {
    openWorkspaceView(
      {
        type: "user",
        id: String(item.entity_id),
        title: optionalString(item.title),
      },
      openOpts,
    )
    return true
  }

  if (item.entity_type === "team" && item.entity_id != null) {
    openWorkspaceView(
      {
        type: "team",
        id: String(item.entity_id),
        title: optionalString(item.title),
      },
      openOpts,
    )
    return true
  }

  if (item.entity_type === "mention") {
    const threadId =
      optionalString(item.thread_id) ??
      optionalString(item.raw.thread_id) ??
      optionalString(item.raw.threadId) ??
      optionalString(item.entity_id)
    if (!threadId) return false
    openWorkspaceView(
      {
        type: "thread",
        id: threadId,
        title: optionalString(item.title),
        params: {
          mentionId: optionalString(item.entity_id),
        },
      },
      openOpts,
    )
    return true
  }

  return false
}
