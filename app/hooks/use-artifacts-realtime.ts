"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { getSupabaseBrowser } from "../../lib/supabase-browser"

type UseArtifactsRealtimeArgs = {
  taskId?: number | null
  projectId?: number | null
  aiThreadId?: string | null
  artifactId?: string | null
  /** Active build ids for durable ai_build_events subscriptions. */
  buildIds?: string[] | null
  enabled?: boolean
}

/**
 * Subscribe to artifact row/version changes and durable build events.
 * Invalidates React Query caches so task/project/artifact panes refresh immediately.
 */
export function useArtifactsRealtime({
  taskId = null,
  projectId = null,
  aiThreadId = null,
  artifactId = null,
  buildIds = null,
  enabled = true,
}: UseArtifactsRealtimeArgs) {
  const queryClient = useQueryClient()
  const buildIdsKey = (buildIds ?? []).filter(Boolean).join(",")

  useEffect(() => {
    if (!enabled) return
    const resolvedBuildIds = buildIdsKey ? buildIdsKey.split(",") : []
    const hasScope =
      (taskId != null && taskId > 0) ||
      (projectId != null && projectId > 0) ||
      !!aiThreadId ||
      !!artifactId ||
      resolvedBuildIds.length > 0
    if (!hasScope) return

    const supabase = getSupabaseBrowser()
    const channelName = [
      "artifacts-rt",
      taskId ?? "",
      projectId ?? "",
      aiThreadId ?? "",
      artifactId ?? "",
      ...resolvedBuildIds.slice(0, 4),
    ].join(":")

    const channel = supabase.channel(channelName)

    const invalidateLists = () => {
      if (taskId != null && taskId > 0) {
        void queryClient.invalidateQueries({ queryKey: ["task-artifacts", taskId] })
      }
      if (projectId != null && projectId > 0) {
        void queryClient.invalidateQueries({ queryKey: ["project-artifacts", projectId] })
      }
      if (aiThreadId) {
        void queryClient.invalidateQueries({ queryKey: ["ai-thread-artifacts", aiThreadId] })
      }
      if (artifactId) {
        void queryClient.invalidateQueries({ queryKey: ["artifact", artifactId] })
        void queryClient.invalidateQueries({ queryKey: ["artifact-versions", artifactId] })
      }
    }

    if (taskId != null && taskId > 0) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "artifacts", filter: `task_id=eq.${taskId}` },
        invalidateLists,
      )
    }
    if (projectId != null && projectId > 0) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "artifacts", filter: `project_id=eq.${projectId}` },
        invalidateLists,
      )
    }
    if (aiThreadId) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "artifacts",
          filter: `ai_thread_id=eq.${aiThreadId}`,
        },
        invalidateLists,
      )
    }
    if (artifactId) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "artifact_versions",
          filter: `artifact_id=eq.${artifactId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["artifact", artifactId] })
          void queryClient.invalidateQueries({ queryKey: ["artifact-versions", artifactId] })
          invalidateLists()
        },
      )
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "artifacts",
          filter: `id=eq.${artifactId}`,
        },
        invalidateLists,
      )
    }

    for (const buildId of resolvedBuildIds) {
      const trimmed = buildId.trim()
      if (!trimmed) continue
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ai_build_events",
          filter: `build_id=eq.${trimmed}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["ai-build-events", trimmed] })
          invalidateLists()
        },
      )
    }

    void channel.subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [aiThreadId, artifactId, buildIdsKey, enabled, projectId, queryClient, taskId])
}
