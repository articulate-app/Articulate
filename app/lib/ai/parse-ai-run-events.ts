import type { AiChatV2RunEvent, AiTargetKind } from "./ai-chat-v2-types"
import { parseAiChatUsageSnapshot } from "./ai-chat-usage-parse"

export function parseAiChatV2RunEvent(parsed: Record<string, unknown>): AiChatV2RunEvent | null {
  const type = typeof parsed.type === "string" ? parsed.type : null
  if (!type) return null

  if (type === "message.completed") {
    const run_id = typeof parsed.run_id === "string" ? parsed.run_id : null
    const message_id = typeof parsed.message_id === "string" ? parsed.message_id : null
    if (!run_id || !message_id) return null
    const usage = parseAiChatUsageSnapshot(parsed.usage)
    return { type, run_id, message_id, usage: usage ?? undefined }
  }

  if (type === "run.failed") {
    const run_id = typeof parsed.run_id === "string" ? parsed.run_id : null
    const code = typeof parsed.code === "string" ? parsed.code : "run_failed"
    const message = typeof parsed.message === "string" ? parsed.message : "Run failed"
    const retryable = parsed.retryable === true
    if (!run_id) return null
    const usage = parseAiChatUsageSnapshot(parsed.usage)
    return { type, run_id, code, retryable, message, usage: usage ?? undefined }
  }

  if (type === "run.interrupted") {
    const run_id = typeof parsed.run_id === "string" ? parsed.run_id : null
    if (!run_id) return null
    const usage = parseAiChatUsageSnapshot(parsed.usage)
    return {
      type,
      run_id,
      code: typeof parsed.code === "string" ? parsed.code : null,
      retryable: parsed.retryable === true ? true : parsed.retryable === false ? false : null,
      message: typeof parsed.message === "string" ? parsed.message : null,
      usage: usage ?? undefined,
    }
  }

  if (type === "run.cancelled") {
    const run_id = typeof parsed.run_id === "string" ? parsed.run_id : null
    if (!run_id) return null
    const usage = parseAiChatUsageSnapshot(parsed.usage)
    return { type, run_id, usage: usage ?? undefined }
  }

  if (type === "target.progress") {
    const run_id = typeof parsed.run_id === "string" ? parsed.run_id : null
    if (!run_id) return null
    if (typeof parsed.target_kind !== "string") return null
    return {
      type,
      run_id,
      target_kind: parsed.target_kind as AiTargetKind,
      label: typeof parsed.label === "string" ? parsed.label : null,
      status: typeof parsed.status === "string" ? parsed.status : null,
      detail: typeof parsed.detail === "string" ? parsed.detail : null,
      project_id: typeof parsed.project_id === "number" ? parsed.project_id : null,
      task_id: typeof parsed.task_id === "number" ? parsed.task_id : null,
      channel_id: typeof parsed.channel_id === "number" ? parsed.channel_id : null,
      component_id: typeof parsed.component_id === "string" ? parsed.component_id : null,
      output_id: typeof parsed.output_id === "string" ? parsed.output_id : null,
      tool_call_id: typeof parsed.tool_call_id === "string" ? parsed.tool_call_id : null,
      group_id: typeof parsed.group_id === "string" ? parsed.group_id : null,
    }
  }

  if (type === "ambiguous_target_confirmation_required") {
    const run_id = typeof parsed.run_id === "string" ? parsed.run_id : null
    const question = typeof parsed.question === "string" ? parsed.question.trim() : ""
    if (!run_id || !question) return null
    const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : []
    const candidates: Array<{ id: string; label: string; target_kind?: AiTargetKind | null }> = []
    for (const row of rawCandidates) {
      if (!row || typeof row !== "object") continue
      const record = row as Record<string, unknown>
      const id = typeof record.id === "string" ? record.id.trim() : ""
      const label = typeof record.label === "string" ? record.label.trim() : ""
      if (!id || !label) continue
      candidates.push({
        id,
        label,
        target_kind:
          typeof record.target_kind === "string" ? (record.target_kind as AiTargetKind) : null,
      })
    }
    if (candidates.length === 0) return null
    return { type, run_id, question, candidates }
  }

  return null
}

export function isV2RunTerminalEventType(type: string): boolean {
  return (
    type === "message.completed"
    || type === "run.failed"
    || type === "run.cancelled"
    || type === "run.interrupted"
  )
}
