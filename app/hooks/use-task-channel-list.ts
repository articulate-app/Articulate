"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { resolveTaskChannelInitMode } from "@/lib/task-channel-init"

export type TaskChannelRow = {
  channel_id: number
  name: string
}

type UseTaskChannelListArgs = {
  taskId: number | null | undefined
  bootstrapTaskChannels?: unknown
  skipInitialTaskChannelsFetch?: boolean
  preferredChannelId?: number | null
  onChannelChange?: (channelId: number | null) => void
  enabled?: boolean
}

/**
 * Shared task-channel list + selection (same init rules as TaskContentTab).
 */
export function useTaskChannelList({
  taskId,
  bootstrapTaskChannels,
  skipInitialTaskChannelsFetch = true,
  preferredChannelId = null,
  onChannelChange,
  enabled = true,
}: UseTaskChannelListArgs) {
  const supabase = createClientComponentClient()
  const [channels, setChannels] = useState<TaskChannelRow[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const taskIdRef = useRef(taskId)
  taskIdRef.current = taskId

  const fetchTaskChannels = useCallback(
    async (signal?: AbortSignal) => {
      if (!taskId) return []
      const { data, error: fetchError } = await supabase
        .from("task_channels")
        .select(`channel_id, channels!inner(id, name)`)
        .eq("task_id", taskId)
        .abortSignal(signal as AbortSignal)

      if (fetchError) throw fetchError

      const taskChannels = ((data || []) as any[])
        .map((tc) => {
          const channel = Array.isArray(tc.channels) ? tc.channels[0] : tc.channels
          return {
            channel_id: Number(tc.channel_id),
            name: String(channel?.name ?? ""),
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))

      if (taskIdRef.current !== taskId) return []
      setChannels(taskChannels)
      setError(null)
      return taskChannels
    },
    [supabase, taskId],
  )

  const applySelection = useCallback(
    (list: TaskChannelRow[], prev: number | null, preferred: number | null) => {
      if (list.length === 0) return null
      if (preferred != null && list.some((c) => c.channel_id === preferred)) return preferred
      if (prev != null && list.some((c) => c.channel_id === prev)) return prev
      return list[0].channel_id
    },
    [],
  )

  useEffect(() => {
    if (!enabled || !taskId) {
      setChannels([])
      setSelectedChannelId(null)
      setError(null)
      return
    }

    const controller = new AbortController()
    let cancelled = false

    const init = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const initMode = resolveTaskChannelInitMode({
          skipInitialTaskChannelsFetch,
          bootstrapTaskChannels,
        })

        if (initMode.mode === "bootstrap") {
          if (cancelled || taskIdRef.current !== taskId) return
          const list = initMode.channels
          setChannels(list)
          setSelectedChannelId((prev) => {
            const next = applySelection(list, prev, preferredChannelId)
            if (next !== prev) {
              Promise.resolve().then(() => onChannelChange?.(next))
            }
            return next
          })
          return
        }

        const list = await fetchTaskChannels(controller.signal)
        if (cancelled || taskIdRef.current !== taskId) return
        setSelectedChannelId((prev) => {
          const next = applySelection(list, prev, preferredChannelId)
          if (next !== prev) {
            Promise.resolve().then(() => onChannelChange?.(next))
          }
          return next
        })
      } catch (err: unknown) {
        if (cancelled || taskIdRef.current !== taskId) return
        const message = err instanceof Error ? err.message : "Could not load channels"
        if (!/abort/i.test(message)) {
          setError(message)
        }
      } finally {
        if (!cancelled && taskIdRef.current === taskId) {
          setIsLoading(false)
        }
      }
    }

    void init()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [
    enabled,
    taskId,
    bootstrapTaskChannels,
    skipInitialTaskChannelsFetch,
    preferredChannelId,
    fetchTaskChannels,
    applySelection,
    onChannelChange,
  ])

  const selectChannel = useCallback(
    (channelId: number) => {
      setSelectedChannelId(channelId)
      onChannelChange?.(channelId)
    },
    [onChannelChange],
  )

  return {
    channels,
    selectedChannelId,
    selectChannel,
    isLoading,
    error,
    retry: () => {
      void fetchTaskChannels()
    },
  }
}
