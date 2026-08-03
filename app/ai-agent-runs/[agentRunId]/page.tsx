"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  Square,
} from "lucide-react"
import Link from "next/link"
import { cn } from "../../lib/utils"
import type { AiAgentRunStatus } from "../../lib/ai-agent-runs/agent-run-types"
import {
  buildAiAgentRunPath,
  getAiAgentRun,
  setAiAgentRunState,
} from "../../lib/services/ai-agent-runs"
import { useAiAgentRunRealtime } from "../../hooks/use-ai-agent-run-realtime"
import { openArtifactCenterTab } from "../../../features/artifacts/open-artifact-center-tab"
import { buildArtifactPath } from "../../lib/artifact-selection-url"

const STATUS_STYLES: Record<AiAgentRunStatus, string> = {
  queued: "bg-gray-100 text-gray-700 border-gray-200",
  running: "bg-blue-50 text-blue-800 border-blue-200",
  paused: "bg-amber-50 text-amber-800 border-amber-200",
  completed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  failed: "bg-red-50 text-red-800 border-red-200",
  cancelled: "bg-gray-50 text-gray-600 border-gray-200",
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function planArtifactLinks(plan: unknown): Array<{ id: string; title: string }> {
  const root = asRecord(plan)
  if (!root) return []
  const candidates = [
    root.artifacts,
    root.planned_artifacts,
    root.items,
  ]
  for (const list of candidates) {
    if (!Array.isArray(list)) continue
    const out: Array<{ id: string; title: string }> = []
    for (const item of list) {
      const row = asRecord(item)
      if (!row) continue
      const id =
        (typeof row.artifact_id === "string" && row.artifact_id) ||
        (typeof row.id === "string" && row.id) ||
        ""
      if (!id) continue
      const title =
        (typeof row.title === "string" && row.title.trim()) ||
        `Artifact ${id.slice(0, 8)}`
      out.push({ id, title })
    }
    if (out.length) return out
  }
  return []
}

/**
 * Global autonomous-run monitor. Survives closing the originating chat.
 */
export default function AiAgentRunPage() {
  const params = useParams()
  const queryClient = useQueryClient()
  const agentRunId =
    typeof params?.agentRunId === "string" ? params.agentRunId.trim() : ""
  const [actionError, setActionError] = useState<string | null>(null)

  const runQuery = useQuery({
    queryKey: ["ai-agent-run", agentRunId],
    queryFn: () => getAiAgentRun(agentRunId),
    enabled: !!agentRunId,
    staleTime: 2_000,
    refetchInterval: (query) => {
      const status = query.state.data?.run.status
      return status === "queued" || status === "running" ? 5_000 : false
    },
  })

  const run = runQuery.data?.run ?? null
  const tasks = useMemo(() => {
    const list = runQuery.data?.tasks ?? []
    return [...list].sort((a, b) => a.sequence_number - b.sequence_number)
  }, [runQuery.data?.tasks])

  useAiAgentRunRealtime({
    agentRunId,
    activeBuildId: run?.active_build_id,
    enabled: !!agentRunId,
  })

  const stateMutation = useMutation({
    mutationFn: (status: "running" | "paused" | "cancelled") =>
      setAiAgentRunState({ agentRunId, status }),
    onSuccess: (data) => {
      setActionError(null)
      queryClient.setQueryData(["ai-agent-run", agentRunId], data)
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : "Failed to update run")
    },
  })

  const canPause = run?.status === "running" || run?.status === "queued"
  const canResume = run?.status === "paused"
  const canCancel =
    run?.status === "queued" ||
    run?.status === "running" ||
    run?.status === "paused"

  const currentTask = tasks.find((t) => t.task_id === run?.current_task_id) ?? null

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-6">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <span className="text-xs text-gray-400 font-mono">
          {buildAiAgentRunPath(agentRunId)}
        </span>
      </div>

      {runQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading agent run…
        </div>
      ) : runQuery.isError ? (
        <p className="text-sm text-red-600">
          {runQuery.error instanceof Error
            ? runQuery.error.message
            : "Failed to load agent run"}
        </p>
      ) : run ? (
        <>
          <header className="mb-6 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-gray-900">Autonomous run</h1>
              <span
                className={cn(
                  "rounded border px-2 py-0.5 text-xs font-medium capitalize",
                  STATUS_STYLES[run.status],
                )}
              >
                {run.status}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
              {run.request_text || "—"}
            </p>
            <div className="flex flex-wrap gap-3 text-xs text-gray-600">
              <span>
                Selected <strong className="text-gray-900">{run.selected_count}</strong>
              </span>
              <span>
                Completed <strong className="text-gray-900">{run.completed_count}</strong>
              </span>
              <span>
                Failed <strong className="text-gray-900">{run.failed_count}</strong>
              </span>
              {run.project_id != null ? (
                <span>
                  Project <strong className="text-gray-900">{run.project_id}</strong>
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {canPause ? (
                <button
                  type="button"
                  disabled={stateMutation.isPending}
                  onClick={() => stateMutation.mutate("paused")}
                  className="inline-flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  <Pause className="h-3.5 w-3.5" />
                  Pause
                </button>
              ) : null}
              {canResume ? (
                <button
                  type="button"
                  disabled={stateMutation.isPending}
                  onClick={() => stateMutation.mutate("running")}
                  className="inline-flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5" />
                  Resume
                </button>
              ) : null}
              {canCancel ? (
                <button
                  type="button"
                  disabled={stateMutation.isPending}
                  onClick={() => stateMutation.mutate("cancelled")}
                  className="inline-flex items-center gap-1.5 rounded border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  <Square className="h-3.5 w-3.5" />
                  Cancel
                </button>
              ) : null}
            </div>
            {actionError ? (
              <p className="text-xs text-red-600">{actionError}</p>
            ) : null}
          </header>

          <section className="mb-6 rounded border border-gray-200 p-3">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Current task
            </h2>
            {currentTask ? (
              <div className="space-y-1 text-sm text-gray-800">
                <p>
                  Task {currentTask.task_id}
                  <span className="ml-2 text-xs capitalize text-gray-500">
                    {currentTask.status}
                  </span>
                </p>
                {currentTask.selection_reason ? (
                  <p className="text-xs text-gray-500">{currentTask.selection_reason}</p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No active task</p>
            )}
            {run.active_build_id ? (
              <p className="mt-2 text-xs text-gray-600">
                Active build{" "}
                <span className="font-mono">{run.active_build_id}</span>
              </p>
            ) : null}
          </section>

          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
              Task history
            </h2>
            {tasks.length === 0 ? (
              <p className="text-sm text-gray-500">No tasks selected yet.</p>
            ) : (
              <ol className="space-y-3">
                {tasks.map((task) => {
                  const artifacts = planArtifactLinks(task.artifact_plan)
                  return (
                    <li
                      key={task.id}
                      className="rounded border border-gray-200 px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-gray-900">
                          #{task.sequence_number} · Task {task.task_id}
                        </p>
                        <span className="text-xs capitalize text-gray-500">
                          {task.status}
                        </span>
                      </div>
                      {task.selection_reason ? (
                        <p className="mt-1 text-xs text-gray-600">
                          {task.selection_reason}
                        </p>
                      ) : null}
                      {task.build_id ? (
                        <p className="mt-1 font-mono text-[11px] text-gray-500">
                          build {task.build_id}
                        </p>
                      ) : null}
                      {artifacts.length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {artifacts.map((artifact) => (
                            <li key={artifact.id}>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
                                onClick={() =>
                                  openArtifactCenterTab({
                                    artifactId: artifact.id,
                                    title: artifact.title,
                                  })
                                }
                              >
                                <ExternalLink className="h-3 w-3" />
                                {artifact.title}
                              </button>
                              <Link
                                href={buildArtifactPath(artifact.id)}
                                className="ml-2 text-[11px] text-gray-400 hover:text-gray-600"
                              >
                                open
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : task.artifact_plan != null ? (
                        <pre className="mt-2 max-h-32 overflow-auto rounded bg-gray-50 p-2 text-[11px] text-gray-600">
                          {JSON.stringify(task.artifact_plan, null, 2)}
                        </pre>
                      ) : null}
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
