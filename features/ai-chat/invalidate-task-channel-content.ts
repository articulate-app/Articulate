import type { QueryClient } from "@tanstack/react-query"
import {
  taskChannelContentQueryKey,
  taskChannelsQueryKey,
  taskComponentOutputQueryKey,
} from "../../app/hooks/use-task-channel-content"
import { taskChannelBootstrapQueryKey } from "../../app/hooks/use-task-channel-bootstrap"

export const TASK_CHANNELS_INVALIDATED_EVENT = "task-channels-invalidated"

export type TaskChannelContentInvalidationArgs = {
  taskId?: number | null
  channelId?: number | null
  outputId?: string | null
  /** Also refresh legacy bootstrap SEO / available lists. */
  includeBootstrap?: boolean
}

/**
 * Invalidate Content-tab queries after a factual saved channel/component/output event.
 * Optimistic UI must not fabricate IDs — reconciliation remains authoritative.
 */
export function invalidateTaskChannelContentQueries(
  queryClient: QueryClient,
  args: TaskChannelContentInvalidationArgs,
): void {
  const taskId = args.taskId ?? null
  const channelId = args.channelId ?? null
  const outputId = args.outputId?.trim() || null

  if (taskId != null) {
    void queryClient.invalidateQueries({ queryKey: [...taskChannelsQueryKey(taskId)] })
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(TASK_CHANNELS_INVALIDATED_EVENT, {
          detail: { taskId, channelId },
        }),
      )
    }
  }
  if (taskId != null && channelId != null) {
    void queryClient.invalidateQueries({
      queryKey: [...taskChannelContentQueryKey(taskId, channelId)],
    })
    if (args.includeBootstrap !== false) {
      void queryClient.invalidateQueries({
        queryKey: [...taskChannelBootstrapQueryKey(taskId, channelId)],
      })
    }
    void queryClient.invalidateQueries({
      queryKey: ["task-channel-composed-output", taskId, channelId],
    })
    void queryClient.invalidateQueries({
      queryKey: ["tc_components_for_task_channel", taskId, channelId],
    })
  }
  if (taskId != null) {
    // Task overview / detail surfaces that embed channel structure.
    void queryClient.invalidateQueries({ queryKey: ["task", taskId] })
    void queryClient.invalidateQueries({ queryKey: ["task", String(taskId)] })
  }
  if (outputId) {
    void queryClient.invalidateQueries({
      queryKey: [...taskComponentOutputQueryKey(outputId)],
    })
  }
}
