export type AiTargetKind =
  | "project"
  | "task"
  | "channel"
  | "component"
  | "output"
  | "user"
  | "attachment"
  | "artifact"
  | "source"

export type AiRunTargetSource =
  | "user_confirmation"
  | "explicit_click"
  | "explicit_selection"
  | "explicit_tag"
  | "text_selection"
  | "message_resolution"
  | "ambient"
  | "thread_read"

export type AiRunTarget = {
  target_kind: AiTargetKind
  project_id?: number | null
  task_id?: number | null
  channel_id?: number | null
  component_id?: string | null
  output_id?: string | null
  user_id?: number | null
  attachment_id?: string | null
  artifact_id?: string | null
  artifact_version_number?: number | null
  source_id?: string | null
  source: AiRunTargetSource
  /** Compatibility only — frontend never grants write authority. */
  allow_write?: false
  allow_descendants?: boolean
  label?: string | null
}

export type AiChatIntentHint =
  | "ask"
  | "write"
  | "edit"
  | "create"
  | "update"
  | "save"
  | "delete"
  | "assign"
  | "duplicate"
  | "bulk_write"
  | "rollback"

export type AiChatV2ScopeSource =
  | "explicit_click"
  | "explicit_tag"
  | "text_selection"
  | "ambient"
  | "thread"
  | "none"

export type AiChatV2Scope = {
  source: AiChatV2ScopeSource
  project_id: number | null
  task_id: number | null
  channel_id: number | null
  component_id: string | null
  task_component_output_id: string | null
  output_revision: string | null
}

export type AiChatV2RequestFields = {
  protocol_version: 2
  client_request_id: string
  /** Omitted during migration — semantic intent is backend/LLM authority only. */
  intent_hint?: AiChatIntentHint | null
  scope: AiChatV2Scope
  targets: AiRunTarget[]
  attachment_ids: string[]
}

export type AiRunTerminalKind = "completed" | "failed" | "cancelled" | "interrupted"

export type AiRunTerminalState = {
  kind: AiRunTerminalKind
  run_id: string | null
  message_id?: string | null
  code?: string | null
  retryable?: boolean | null
  message?: string | null
}

export type AiChatTokenUsageScope = {
  used_tokens: number
  reserved_tokens: number
  projected_tokens: number
  limit_tokens: number | null
  remaining_tokens: number | null
  percent_used: number | null
  projected_percent: number | null
  warning_percent: number | null
  warning: boolean
  projected_warning: boolean
  maxed_out: boolean
  projected_maxed_out: boolean
  resets_at: string | null
  timezone: string | null
}

export type AiChatUsageSnapshot = {
  user: AiChatTokenUsageScope
  team: AiChatTokenUsageScope
}

export type AiChatRunErrorPayload = {
  code?: string | null
  message?: string | null
  retryable?: boolean | null
}

export type AiChatRunTargetProgress = {
  key: string
  run_id: string
  target_kind: AiTargetKind
  label: string | null
  status: "pending" | "active" | "completed" | "failed" | "waiting_confirmation"
  detail: string | null
  project_id?: number | null
  task_id?: number | null
  channel_id?: number | null
  component_id?: string | null
  output_id?: string | null
  updated_at: string
}

export type AiChatV2RunEvent =
  | { type: "message.completed"; run_id: string; message_id: string; usage?: AiChatUsageSnapshot | null }
  | {
      type: "run.failed"
      run_id: string
      code: string
      retryable: boolean
      message: string
      usage?: AiChatUsageSnapshot | null
    }
  | { type: "run.cancelled"; run_id: string; usage?: AiChatUsageSnapshot | null }
  | {
      type: "run.interrupted"
      run_id: string
      code?: string | null
      retryable?: boolean | null
      message?: string | null
      usage?: AiChatUsageSnapshot | null
    }
  | {
      type: "target.progress"
      run_id: string
      target_kind: AiTargetKind
      label?: string | null
      status?: string | null
      detail?: string | null
      project_id?: number | null
      task_id?: number | null
      channel_id?: number | null
      component_id?: string | null
      output_id?: string | null
      tool_call_id?: string | null
      group_id?: string | null
    }
  | {
      type: "ambiguous_target_confirmation_required"
      run_id: string
      question: string
      candidates: Array<{ id: string; label: string; target_kind?: AiTargetKind | null }>
    }

export type AiChatRunReconcileResponse = {
  run: {
    id: string
    status: "running" | "completed" | "failed" | "cancelled" | "interrupted"
    client_request_id?: string | null
    code?: string | null
    message?: string | null
    retryable?: boolean | null
  }
  message?: {
    id: string
    content?: string | null
    content_json?: unknown | null
  } | null
  targets?: AiChatRunTargetProgress[]
  usage?: AiChatUsageSnapshot | null
  error?: AiChatRunErrorPayload | null
}
