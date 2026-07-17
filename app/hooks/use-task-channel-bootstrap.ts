"use client"

import { useQuery } from "@tanstack/react-query"
import { fetchTaskChannelBootstrap } from "@/lib/services/task-channel-bootstrap"
import type { TaskChannelBootstrapResponse } from "@/lib/types/task-channel-bootstrap"

export const taskChannelBootstrapQueryKey = (
  taskId: number | null | undefined,
  channelId: number | null | undefined,
) => ["task-channel-bootstrap", taskId ?? null, channelId ?? null] as const

type UseTaskChannelBootstrapOptions = {
  enabled?: boolean
}

/**
 * Single source of truth for channel-scoped panel data (SEO, composed output, components, available).
 */
export function useTaskChannelBootstrap(
  taskId: number | null | undefined,
  channelId: number | null | undefined,
  accessToken: string | null | undefined,
  options?: UseTaskChannelBootstrapOptions,
) {
  // Note: `accessToken` is intentionally NOT part of the enabled gate. The bootstrap fetch
  // authenticates via the supabase client (the token argument is unused by the service), so
  // requiring a token here would wrongly disable the query whenever the caller omits it.
  const enabled =
    (options?.enabled ?? true) &&
    taskId != null &&
    Number.isFinite(Number(taskId)) &&
    channelId != null &&
    Number.isFinite(Number(channelId))

  return useQuery<TaskChannelBootstrapResponse>({
    queryKey: [...taskChannelBootstrapQueryKey(taskId, channelId)],
    enabled,
    queryFn: async ({ signal }) =>
      fetchTaskChannelBootstrap(taskId!, channelId!, accessToken ?? "", { signal }),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  })
}
