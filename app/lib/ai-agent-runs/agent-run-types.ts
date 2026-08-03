/** Durable autonomous supervisor run state. */

export type AiAgentRunStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"

export type AiAgentRunTaskStatus =
  | "selected"
  | "planning"
  | "building"
  | "completed"
  | "failed"
  | "skipped"
  | "cancelled"

export type AiAgentRun = {
  id: string
  ai_thread_id: string
  project_id: number | null
  created_by: number | null
  request_text: string
  eligible_task_ids: number[] | null
  selection_policy: Record<string, unknown> | null
  status: AiAgentRunStatus
  max_tasks: number
  task_concurrency: number
  artifact_concurrency: number
  selected_count: number
  completed_count: number
  failed_count: number
  active_build_id: string | null
  current_task_id: number | null
  last_error: Record<string, unknown> | null
  created_at: string | null
  updated_at: string | null
  completed_at: string | null
}

export type AiAgentRunTask = {
  id: string
  agent_run_id: string
  task_id: number
  sequence_number: number
  status: AiAgentRunTaskStatus
  build_id: string | null
  selection_reason: string | null
  artifact_plan: unknown
  error: Record<string, unknown> | null
  selected_at: string | null
  started_at: string | null
  completed_at: string | null
}

export type AiAgentRunGetResult = {
  ok: true
  run: AiAgentRun
  tasks: AiAgentRunTask[]
  app_link: string
}

export type AiAgentRunStateAction = "running" | "paused" | "cancelled"
