"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { getSupabaseBrowser } from "../../lib/supabase-browser"

type UseAiAgentRunRealtimeArgs = {
  agentRunId: string
  activeBuildId?: string | null
  enabled?: boolean
}

/**
 * Subscribe to autonomous run + task rows, and optional active child build events.
 */
export function useAiAgentRunRealtime({
  agentRunId,
  activeBuildId = null,
  enabled = true,
}: UseAiAgentRunRealtimeArgs) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled || !agentRunId) return
    const supabase = getSupabaseBrowser()
    const channelName = ["ai-agent-run-rt", agentRunId, activeBuildId ?? ""].join(":")
    const channel = supabase.channel(channelName)

    const invalidateRun = () => {
      void queryClient.invalidateQueries({ queryKey: ["ai-agent-run", agentRunId] })
    }

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "ai_agent_runs",
        filter: `id=eq.${agentRunId}`,
      },
      invalidateRun,
    )
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "ai_agent_run_tasks",
        filter: `agent_run_id=eq.${agentRunId}`,
      },
      invalidateRun,
    )

    if (activeBuildId) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ai_build_events",
          filter: `build_id=eq.${activeBuildId}`,
        },
        invalidateRun,
      )
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ai_build_jobs",
          filter: `id=eq.${activeBuildId}`,
        },
        invalidateRun,
      )
    }

    void channel.subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [activeBuildId, agentRunId, enabled, queryClient])
}
