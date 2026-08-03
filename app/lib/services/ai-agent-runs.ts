"use client"

import { getSupabaseBrowser } from "../../../lib/supabase-browser"
import { invokeEdgeFunctionFetch } from "../edge-functions"
import type {
  AiAgentRun,
  AiAgentRunGetResult,
  AiAgentRunStateAction,
  AiAgentRunStatus,
  AiAgentRunTask,
  AiAgentRunTaskStatus,
} from "../ai-agent-runs/agent-run-types"

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

const RUN_STATUSES = new Set<AiAgentRunStatus>([
  "queued",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
])

const TASK_STATUSES = new Set<AiAgentRunTaskStatus>([
  "selected",
  "planning",
  "building",
  "completed",
  "failed",
  "skipped",
  "cancelled",
])

function normalizeRunStatus(value: unknown): AiAgentRunStatus {
  const raw = toTrimmedString(value)?.toLowerCase()
  if (raw && RUN_STATUSES.has(raw as AiAgentRunStatus)) return raw as AiAgentRunStatus
  return "queued"
}

function normalizeTaskStatus(value: unknown): AiAgentRunTaskStatus {
  const raw = toTrimmedString(value)?.toLowerCase()
  if (raw && TASK_STATUSES.has(raw as AiAgentRunTaskStatus)) return raw as AiAgentRunTaskStatus
  return "selected"
}

export function normalizeAiAgentRun(row: unknown): AiAgentRun | null {
  const record = asRecord(row)
  if (!record) return null
  const id = toTrimmedString(record.id)
  const aiThreadId = toTrimmedString(record.ai_thread_id)
  if (!id || !aiThreadId) return null
  const eligible = Array.isArray(record.eligible_task_ids)
    ? record.eligible_task_ids
        .map((v) => toFiniteNumber(v))
        .filter((v): v is number => v != null && v > 0)
    : null
  return {
    id,
    ai_thread_id: aiThreadId,
    project_id: toFiniteNumber(record.project_id),
    created_by: toFiniteNumber(record.created_by),
    request_text: toTrimmedString(record.request_text) ?? "",
    eligible_task_ids: eligible,
    selection_policy: asRecord(record.selection_policy),
    status: normalizeRunStatus(record.status),
    max_tasks: toFiniteNumber(record.max_tasks) ?? 20,
    task_concurrency: toFiniteNumber(record.task_concurrency) ?? 1,
    artifact_concurrency: toFiniteNumber(record.artifact_concurrency) ?? 4,
    selected_count: toFiniteNumber(record.selected_count) ?? 0,
    completed_count: toFiniteNumber(record.completed_count) ?? 0,
    failed_count: toFiniteNumber(record.failed_count) ?? 0,
    active_build_id: toTrimmedString(record.active_build_id),
    current_task_id: toFiniteNumber(record.current_task_id),
    last_error: asRecord(record.last_error),
    created_at: toTrimmedString(record.created_at),
    updated_at: toTrimmedString(record.updated_at),
    completed_at: toTrimmedString(record.completed_at),
  }
}

export function normalizeAiAgentRunTask(row: unknown): AiAgentRunTask | null {
  const record = asRecord(row)
  if (!record) return null
  const id = toTrimmedString(record.id)
  const agentRunId = toTrimmedString(record.agent_run_id)
  const taskId = toFiniteNumber(record.task_id)
  if (!id || !agentRunId || taskId == null) return null
  return {
    id,
    agent_run_id: agentRunId,
    task_id: taskId,
    sequence_number: toFiniteNumber(record.sequence_number) ?? 0,
    status: normalizeTaskStatus(record.status),
    build_id: toTrimmedString(record.build_id),
    selection_reason: toTrimmedString(record.selection_reason),
    artifact_plan: record.artifact_plan ?? null,
    error: asRecord(record.error),
    selected_at: toTrimmedString(record.selected_at),
    started_at: toTrimmedString(record.started_at),
    completed_at: toTrimmedString(record.completed_at),
  }
}

export async function getAiAgentRun(agentRunId: string): Promise<AiAgentRunGetResult> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_get_agent_run_v1", {
    p_agent_run_id: agentRunId,
  })
  if (error) throw error
  const root = asRecord(data) ?? {}
  const run = normalizeAiAgentRun(root.run)
  if (!run) throw new Error("ai_get_agent_run_v1 returned no run")
  const tasks = Array.isArray(root.tasks)
    ? (root.tasks.map(normalizeAiAgentRunTask).filter(Boolean) as AiAgentRunTask[])
    : []
  return {
    ok: true,
    run,
    tasks,
    app_link: toTrimmedString(root.app_link) ?? `app://ai-agent-run/${run.id}`,
  }
}

export async function setAiAgentRunState(args: {
  agentRunId: string
  status: AiAgentRunStateAction
}): Promise<AiAgentRunGetResult> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_set_agent_run_state_v1", {
    p_agent_run_id: args.agentRunId,
    p_status: args.status,
  })
  if (error) throw error
  const root = asRecord(data) ?? {}
  const run = normalizeAiAgentRun(root.run)
  if (!run) throw new Error("ai_set_agent_run_state_v1 returned no run")
  const tasks = Array.isArray(root.tasks)
    ? (root.tasks.map(normalizeAiAgentRunTask).filter(Boolean) as AiAgentRunTask[])
    : []

  if (args.status === "running") {
    void dispatchAgentSupervisorPump(args.agentRunId).catch(() => undefined)
  }

  return {
    ok: true,
    run,
    tasks,
    app_link: toTrimmedString(root.app_link) ?? `app://ai-agent-run/${run.id}`,
  }
}

async function dispatchAgentSupervisorPump(agentRunId: string): Promise<void> {
  const supabase = getSupabaseBrowser()
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-agent-supervisor`
  await invokeEdgeFunctionFetch({
    supabase,
    url,
    init: {
      method: "POST",
      body: JSON.stringify({ agent_run_id: agentRunId, action: "pump" }),
    },
    headers: { "Content-Type": "application/json" },
    debugLabel: "ai-agent-supervisor",
  })
}

export function buildAiAgentRunPath(agentRunId: string): string {
  return `/ai-agent-runs/${encodeURIComponent(agentRunId)}`
}
