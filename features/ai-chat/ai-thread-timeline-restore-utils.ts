function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** A single component output reverted by a thread restore. */
export type AiThreadRestoredItem = {
  task_id: number | null
  channel_id: number | null
  component_id: string | null
  task_component_id: string | null
  briefing_component_id: number | null
  task_component_output_id: string | null
  component_title: string | null
  restored_content_text: string | null
  restored_content_json: unknown
  content_format: string | null
}

/** The assistant confirmation message created by the restore RPC. */
export type AiThreadRestoreCreatedMessage = {
  id: string
  thread_id: string | null
  role: string
  content: string | null
  content_json: unknown
  created_at: string | null
  created_by: number | null
}

export type AiThreadTimelineRestoreResult = {
  ok: boolean
  restoredItemCount: number
  restoredToMessageId: string | null
  restoreMessageId: string | null
  changeSetId: string | null
  restoredItems: AiThreadRestoredItem[]
  createdChatMessage: AiThreadRestoreCreatedMessage | null
}

function normalizeRestoredItem(value: unknown): AiThreadRestoredItem | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  const taskComponentOutputId = toTrimmedString(row.task_component_output_id)
  const componentId = toTrimmedString(row.component_id) ?? toTrimmedString(row.task_component_id)
  if (!taskComponentOutputId && !componentId) return null
  return {
    task_id: toFiniteNumber(row.task_id),
    channel_id: toFiniteNumber(row.channel_id),
    component_id: componentId,
    task_component_id: toTrimmedString(row.task_component_id) ?? componentId,
    briefing_component_id: toFiniteNumber(row.briefing_component_id),
    task_component_output_id: taskComponentOutputId,
    component_title: toTrimmedString(row.component_title),
    restored_content_text: typeof row.restored_content_text === "string" ? row.restored_content_text : null,
    restored_content_json: row.restored_content_json ?? null,
    content_format: toTrimmedString(row.content_format),
  }
}

function normalizeCreatedChatMessage(value: unknown): AiThreadRestoreCreatedMessage | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  const id = toTrimmedString(row.id)
  if (!id) return null
  return {
    id,
    thread_id: toTrimmedString(row.thread_id),
    role: toTrimmedString(row.role) ?? "assistant",
    content: typeof row.content === "string" ? row.content : null,
    content_json: row.content_json ?? null,
    created_at: toTrimmedString(row.created_at),
    created_by: toFiniteNumber(row.created_by),
  }
}

export function parseAiThreadTimelineRestoreResult(data: unknown): AiThreadTimelineRestoreResult {
  const empty: AiThreadTimelineRestoreResult = {
    ok: false,
    restoredItemCount: 0,
    restoredToMessageId: null,
    restoreMessageId: null,
    changeSetId: null,
    restoredItems: [],
    createdChatMessage: null,
  }
  if (data == null) return empty
  if (typeof data === "number") return { ...empty, ok: data > 0, restoredItemCount: data }
  if (Array.isArray(data)) {
    return data.length > 0 ? parseAiThreadTimelineRestoreResult(data[0]) : empty
  }
  if (typeof data !== "object") return empty

  const row = data as Record<string, unknown>
  const restoredItems = Array.isArray(row.restored_items)
    ? row.restored_items
        .map((item) => normalizeRestoredItem(item))
        .filter((item): item is AiThreadRestoredItem => item != null)
    : []

  return {
    ok: row.ok === true || restoredItems.length > 0,
    restoredItemCount:
      toFiniteNumber(row.restored_item_count) ?? toFiniteNumber(row.restoredItemCount) ?? restoredItems.length,
    restoredToMessageId: toTrimmedString(row.restored_to_message_id),
    restoreMessageId: toTrimmedString(row.restore_message_id),
    changeSetId: toTrimmedString(row.change_set_id) ?? toTrimmedString(row.restore_change_set_id),
    restoredItems,
    createdChatMessage: normalizeCreatedChatMessage(row.created_chat_message),
  }
}
