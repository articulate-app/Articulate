"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { getSupabaseBrowser } from "../../lib/supabase-browser"

type UseSourcesRealtimeArgs = {
  sourceId?: string | null
  taskId?: number | null
  projectId?: number | null
  aiThreadId?: string | null
  enabled?: boolean
}

/**
 * Subscribe to `sources` row changes so pending → ready/failed updates
 * from ai-source-import-worker refresh the UI without polling.
 */
export function useSourcesRealtime({
  sourceId = null,
  taskId = null,
  projectId = null,
  aiThreadId = null,
  enabled = true,
}: UseSourcesRealtimeArgs) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled) return
    const hasScope =
      !!sourceId ||
      (taskId != null && taskId > 0) ||
      (projectId != null && projectId > 0) ||
      !!aiThreadId
    if (!hasScope) return

    const supabase = getSupabaseBrowser()
    const channelName = [
      "sources-rt",
      sourceId ?? "",
      taskId ?? "",
      projectId ?? "",
      aiThreadId ?? "",
    ].join(":")

    const channel = supabase.channel(channelName)

    const invalidate = () => {
      if (sourceId) {
        void queryClient.invalidateQueries({ queryKey: ["source", sourceId] })
      }
      if (taskId != null && taskId > 0) {
        void queryClient.invalidateQueries({ queryKey: ["sources", "task", taskId] })
      }
      if (projectId != null && projectId > 0) {
        void queryClient.invalidateQueries({ queryKey: ["sources", "project", projectId] })
      }
      if (aiThreadId) {
        void queryClient.invalidateQueries({ queryKey: ["sources", "thread", aiThreadId] })
      }
      void queryClient.invalidateQueries({ queryKey: ["sources"] })
    }

    if (sourceId) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sources",
          filter: `id=eq.${sourceId}`,
        },
        invalidate,
      )
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "source_versions",
          filter: `source_id=eq.${sourceId}`,
        },
        invalidate,
      )
    }
    if (taskId != null && taskId > 0) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sources",
          filter: `task_id=eq.${taskId}`,
        },
        invalidate,
      )
    }
    if (projectId != null && projectId > 0) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sources",
          filter: `project_id=eq.${projectId}`,
        },
        invalidate,
      )
    }
    if (aiThreadId) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sources",
          filter: `ai_thread_id=eq.${aiThreadId}`,
        },
        invalidate,
      )
    }

    void channel.subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [aiThreadId, enabled, projectId, queryClient, sourceId, taskId])
}
