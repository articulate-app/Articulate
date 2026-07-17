"use client"

import { useCallback, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { AiChatUsageSnapshot } from "../../app/lib/ai/ai-chat-v2-types"
import { fetchAiChatThreadUsage } from "./ai-chat-run-api"
import {
  AI_CHAT_THREAD_USAGE_QUERY_KEY,
} from "./ai-chat-usage"
import { usageNeedsPostTerminalRefetch } from "../../app/lib/ai/ai-chat-usage-parse"

const POST_TERMINAL_REFETCH_DELAYS_MS = [1000, 3000] as const

export function aiChatThreadUsageQueryKey(threadId: string) {
  return [AI_CHAT_THREAD_USAGE_QUERY_KEY, threadId] as const
}

export function useAiChatThreadUsage(threadId: string | null | undefined, enabled = true) {
  const queryClient = useQueryClient()
  const postTerminalTimersRef = useRef<number[]>([])

  const clearPostTerminalTimers = useCallback(() => {
    for (const timerId of postTerminalTimersRef.current) {
      window.clearTimeout(timerId)
    }
    postTerminalTimersRef.current = []
  }, [])

  useEffect(() => clearPostTerminalTimers, [clearPostTerminalTimers, threadId])

  const query = useQuery({
    queryKey: aiChatThreadUsageQueryKey(threadId ?? ""),
    queryFn: ({ signal }) => fetchAiChatThreadUsage(threadId as string, signal),
    enabled: Boolean(threadId) && enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const applyUsageSnapshot = useCallback(
    (usage: AiChatUsageSnapshot | null | undefined) => {
      if (!threadId || !usage) return
      queryClient.setQueryData(aiChatThreadUsageQueryKey(threadId), usage)
    },
    [queryClient, threadId],
  )

  const refreshUsage = useCallback(async () => {
    if (!threadId) return null
    await queryClient.invalidateQueries({ queryKey: aiChatThreadUsageQueryKey(threadId) })
    return queryClient.fetchQuery({
      queryKey: aiChatThreadUsageQueryKey(threadId),
      queryFn: ({ signal }) => fetchAiChatThreadUsage(threadId, signal),
    })
  }, [queryClient, threadId])

  const schedulePostTerminalUsageRefresh = useCallback(
    (usage: AiChatUsageSnapshot | null | undefined) => {
      if (!threadId || !usageNeedsPostTerminalRefetch(usage)) return
      clearPostTerminalTimers()
      let attempt = 0
      const scheduleNext = () => {
        if (attempt >= POST_TERMINAL_REFETCH_DELAYS_MS.length) return
        const delay = POST_TERMINAL_REFETCH_DELAYS_MS[attempt]
        attempt += 1
        const timerId = window.setTimeout(() => {
          void (async () => {
            const nextUsage = await refreshUsage()
            if (usageNeedsPostTerminalRefetch(nextUsage)) {
              scheduleNext()
            }
          })()
        }, delay)
        postTerminalTimersRef.current.push(timerId)
      }
      scheduleNext()
    },
    [clearPostTerminalTimers, refreshUsage, threadId],
  )

  const handleTerminalUsage = useCallback(
    (usage: AiChatUsageSnapshot | null | undefined) => {
      applyUsageSnapshot(usage)
      void refreshUsage().then((nextUsage) => {
        schedulePostTerminalUsageRefresh(nextUsage ?? usage)
      })
    },
    [applyUsageSnapshot, refreshUsage, schedulePostTerminalUsageRefresh],
  )

  return {
    usage: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    applyUsageSnapshot,
    refreshUsage,
    handleTerminalUsage,
  }
}
