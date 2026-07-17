"use client"

import { useQuery } from "@tanstack/react-query"
import { fetchTaskChannelContent } from "@/lib/services/task-channel-content"
import type { TaskChannelContentResponse } from "@/lib/types/task-channel-content"

export const taskChannelContentQueryKey = (
  taskId: number | null | undefined,
  channelId: number | null | undefined,
) => ["task-channel-content", taskId ?? null, channelId ?? null] as const

export const taskChannelsQueryKey = (taskId: number | null | undefined) =>
  ["task-channels", taskId ?? null] as const

export const taskComponentOutputQueryKey = (outputId: string | null | undefined) =>
  ["task-component-output", outputId ?? null] as const

type UseTaskChannelContentOptions = {
  enabled?: boolean
}

/**
 * Content-tab source of truth for an attached task/channel.
 * Independent of legacy task-channel briefing type.
 */
export function useTaskChannelContent(
  taskId: number | null | undefined,
  channelId: number | null | undefined,
  options?: UseTaskChannelContentOptions,
) {
  const enabled =
    (options?.enabled ?? true) &&
    taskId != null &&
    Number.isFinite(Number(taskId)) &&
    channelId != null &&
    Number.isFinite(Number(channelId))

  return useQuery<TaskChannelContentResponse>({
    queryKey: [...taskChannelContentQueryKey(taskId, channelId)],
    enabled,
    queryFn: async ({ signal }) => fetchTaskChannelContent(taskId!, channelId!, { signal }),
    staleTime: 30_000,
    gcTime: 10 * 60_000,
  })
}
