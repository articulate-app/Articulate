"use client"

import type { QueryClient } from "@tanstack/react-query"
import type { AiChatContentSavedAction } from "../../app/lib/ai/chat"
import { taskChannelBootstrapQueryKey } from "../../app/hooks/use-task-channel-bootstrap"
import type { TaskChannelBootstrapResponse } from "../../app/lib/types/task-channel-bootstrap"
import { streamTextToPreviewBlocks } from "./component-edit-stream-utils"
import { invalidateTaskChannelContentQueries } from "./invalidate-task-channel-content"

/** React Query key aligned with `tc_components_for_task_channel` usage (invalidate-only). */
export const tcComponentsForTaskChannelQueryKey = (taskId: number, channelId: number) =>
  ["tc_components_for_task_channel", taskId, channelId] as const

/**
 * Bootstrap cache patch + targeted invalidation after legacy content_saved actions.
 * Component edit previews are driven exclusively by component_edit_preview events.
 */
export function applyContentSavedAction(queryClient: QueryClient, action: AiChatContentSavedAction): void {
  const { task_id, channel_id, component_id, preview_text, component_title, operation } = action
  const bootstrapKey = [...taskChannelBootstrapQueryKey(task_id, channel_id)]
  const now = new Date().toISOString()
  const matchId = String(component_id)
  const previewBlocks = preview_text.trim() ? streamTextToPreviewBlocks(preview_text) : []

  queryClient.setQueryData<TaskChannelBootstrapResponse | undefined>(bootstrapKey, (old) => {
    if (!old) return old
    let touched = false

    const composed_output = old.composed_output.map((row) => {
      const rid = row.task_component_id != null ? String(row.task_component_id) : null
      if (rid === matchId) {
        touched = true
        const existingBlocks = Array.isArray(row.content)
          ? row.content
          : Array.isArray(row.content_json)
            ? row.content_json
            : []
        const nextBlocks =
          operation === "append" && existingBlocks.length > 0
            ? [...existingBlocks, ...previewBlocks]
            : previewBlocks.length > 0
              ? previewBlocks
              : existingBlocks
        return {
          ...row,
          content_text: preview_text.length > 0 ? preview_text : row.content_text,
          content: nextBlocks.length > 0 ? nextBlocks : row.content,
          content_json: nextBlocks.length > 0 ? nextBlocks : row.content_json,
          resolved_content_json: nextBlocks.length > 0 ? nextBlocks : row.resolved_content_json,
          title: component_title.length > 0 ? component_title : row.title,
          updated_at: now,
        }
      }
      return row
    })

    const components = old.components.map((row) => {
      const rid = row.task_component_id != null ? String(row.task_component_id) : null
      if (rid === matchId) {
        touched = true
        return {
          ...row,
          title: component_title.length > 0 ? component_title : row.title,
        }
      }
      return row
    })

    if (!touched) return old
    return {
      ...old,
      composed_output,
      components,
      meta: { ...old.meta, fetched_at: now },
    }
  })

  void queryClient.invalidateQueries({ queryKey: bootstrapKey, refetchType: "none" })
  void queryClient.invalidateQueries({
    queryKey: ["task-channel-composed-output", task_id, channel_id],
    refetchType: "none",
  })
  void queryClient.invalidateQueries({
    queryKey: [...tcComponentsForTaskChannelQueryKey(task_id, channel_id)],
    refetchType: "none",
  })
  invalidateTaskChannelContentQueries(queryClient, {
    taskId: task_id,
    channelId: channel_id,
    outputId: null,
    includeBootstrap: false,
  })
  void queryClient.refetchQueries({ queryKey: bootstrapKey, type: "active" })
}
