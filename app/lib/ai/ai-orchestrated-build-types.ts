export type AiOrchestratedBuildStatus =
  | "queued"
  | "running"
  | "completed"
  | "partially_completed"
  | "failed"
  | "cancelled"

export type AiOrchestratedBuildUnitStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "partially_succeeded"
  | "failed"
  | "conflict"
  | "cancelled"

export type AiOrchestratedBuildSavedComponent = {
  task_id: number
  channel_id: number
  component_id: string
  output_id: string
  title: string
  snippet: string
}

export type AiOrchestratedBuildFailedComponent = {
  task_id?: number
  channel_id?: number
  component_id?: string
  title?: string
  error: string
  error_code?: string | null
  code?: string | null
}

export type AiOrchestratedBuildUnitResult = {
  saved?: AiOrchestratedBuildSavedComponent[]
  failed?: AiOrchestratedBuildFailedComponent[]
}

export type AiOrchestratedBuildUnit = {
  id: string
  unit_key: string
  task_id: number
  status: AiOrchestratedBuildUnitStatus
  attempt: number
  result: AiOrchestratedBuildUnitResult
  error_code?: string | null
  error_message?: string | null
}

export type AiOrchestratedBuildEvent = {
  sequence: number
  event_type: string
  phase: string
  unit_id?: string | null
  payload: Record<string, unknown>
}

export type AiOrchestratedBuildRecord = {
  id: string
  status: AiOrchestratedBuildStatus
  total_units: number
  queued_units: number
  running_units: number
  succeeded_units: number
  failed_units: number
  last_event_sequence: number
  change_set_id?: string | null
}

export type AiOrchestratedBuildSnapshot = {
  ok: true
  build: AiOrchestratedBuildRecord
  units: AiOrchestratedBuildUnit[]
  events: AiOrchestratedBuildEvent[]
  next_sequence: number
}

export const AI_ORCHESTRATED_BUILD_ENTITY_TYPE = "ai_orchestrated_build"
export const AI_START_ORCHESTRATED_BUILD_TOOL = "ai_start_orchestrated_build"
/** Artifact-first build dispatch tool — process start, not a content mutation. */
export const AI_START_ARTIFACT_BUILD_TOOL = "ai_start_artifact_build"
/** Request-plan executor for artifact-first builds. */
export const ARTIFACT_BUILD_EXECUTOR = "artifact_build_executor"

/** Tools that only dispatch a build — never render as change-preview cards. */
export const BUILD_DISPATCH_TOOLS = new Set([
  AI_START_ORCHESTRATED_BUILD_TOOL,
  AI_START_ARTIFACT_BUILD_TOOL,
])

export function isBuildDispatchTool(toolName: string | null | undefined): boolean {
  if (!toolName) return false
  return BUILD_DISPATCH_TOOLS.has(toolName.trim())
}

export function isTerminalAiOrchestratedBuildStatus(
  status: AiOrchestratedBuildStatus | null | undefined,
): boolean {
  return (
    status === "completed"
    || status === "partially_completed"
    || status === "failed"
    || status === "cancelled"
  )
}

export function isActiveAiOrchestratedBuildStatus(
  status: AiOrchestratedBuildStatus | null | undefined,
): boolean {
  return status === "queued" || status === "running"
}
