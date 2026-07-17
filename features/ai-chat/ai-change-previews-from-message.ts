import {
  resolveAiChangePreviewKey,
  useAiChangePreviewStreamStore,
  type AiChangePreview,
  type AiChangePreviewChange,
  type AiChangePreviewItem,
  type AiChangePreviewPhase,
} from "../../app/store/ai-change-preview-stream"

export type PersistedAiChangePreview = AiChangePreview & { message_id: string | null }

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizePhase(value: unknown): AiChangePreviewPhase | null {
  if (
    value === "started"
    || value === "delta"
    || value === "completed"
    || value === "saved"
    || value === "failed"
  ) {
    return value
  }
  return null
}

function normalizeChanges(value: unknown): AiChangePreviewChange[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: AiChangePreviewChange[] = []
  for (const row of value) {
    if (!row || typeof row !== "object") continue
    const record = row as Record<string, unknown>
    const field = toTrimmedString(record.field)
    if (!field) continue
    out.push({
      field,
      label: typeof record.label === "string" ? record.label : null,
      before: "before" in record ? record.before : undefined,
      after: "after" in record ? record.after : undefined,
    })
  }
  return out.length > 0 ? out : undefined
}

function normalizePreviewItems(value: unknown): AiChangePreviewItem[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: AiChangePreviewItem[] = []
  for (const row of value) {
    if (!row || typeof row !== "object") continue
    const record = row as Record<string, unknown>
    const label = toTrimmedString(record.label)
    if (!label) continue
    const values = Array.isArray(record.values)
      ? record.values.filter((v): v is string => typeof v === "string")
      : null
    out.push({
      label,
      count:
        typeof record.count === "number" && Number.isFinite(record.count)
          ? record.count
          : values
            ? values.length
            : null,
      values: values && values.length > 0 ? values : null,
    })
  }
  return out.length > 0 ? out : undefined
}

export function normalizePersistedAiChangePreview(raw: unknown): PersistedAiChangePreview | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const phase = normalizePhase(row.phase)
  if (!phase) return null

  const entityType = toTrimmedString(row.entity_type) ?? "generic"
  const entityId =
    typeof row.entity_id === "string" || typeof row.entity_id === "number" ? row.entity_id : null
  const operation = toTrimmedString(row.operation)
  const toolName = toTrimmedString(row.tool_name)

  const preview: PersistedAiChangePreview = {
    type: "ai_change_preview",
    phase,
    ok: typeof row.ok === "boolean" ? row.ok : null,
    change_id: toTrimmedString(row.change_id) ?? "",
    preview_key: toTrimmedString(row.preview_key),
    group_id: toTrimmedString(row.group_id),
    tool_name: toolName,
    round: toFiniteNumber(row.round),
    entity_type: entityType,
    entity_id: entityId,
    task_id: toFiniteNumber(row.task_id),
    channel_id: toFiniteNumber(row.channel_id),
    project_id: toFiniteNumber(row.project_id),
    component_id: toTrimmedString(row.component_id),
    task_component_output_id: toTrimmedString(row.task_component_output_id),
    operation,
    title: toTrimmedString(row.title),
    summary: toTrimmedString(row.summary),
    reason: toTrimmedString(row.reason),
    error: toTrimmedString(row.error),
    task_count: toFiniteNumber(row.task_count),
    channel_count: toFiniteNumber(row.channel_count),
    task_ids: Array.isArray(row.task_ids)
      ? row.task_ids
          .map((value) => toFiniteNumber(value))
          .filter((value): value is number => value != null)
      : null,
    requires_clarification:
      row.requires_clarification === true
        ? true
        : row.requires_clarification === false
          ? false
          : null,
    no_build_created:
      row.no_build_created === true
        ? true
        : row.no_build_created === false
          ? false
          : null,
    clarification_reason: toTrimmedString(row.clarification_reason),
    preview_items: normalizePreviewItems(row.preview_items),
    changes: normalizeChanges(row.changes),
    message_id: toTrimmedString(row.message_id),
  }
  preview.change_id = resolveAiChangePreviewKey(preview)
  return preview
}

export function parseAiChangePreviewsFromMessage(contentJson: unknown): PersistedAiChangePreview[] {
  if (!contentJson || typeof contentJson !== "object") return []
  const previews = (contentJson as Record<string, unknown>).ai_change_previews
  if (!Array.isArray(previews)) return []
  const byKey = new Map<string, PersistedAiChangePreview>()
  for (const row of previews) {
    const normalized = normalizePersistedAiChangePreview(row)
    if (!normalized) continue
    // Keep the most advanced phase per change_id (saved/failed beat started).
    const existing = byKey.get(normalized.change_id)
    if (!existing || rankPhase(normalized.phase) >= rankPhase(existing.phase)) {
      byKey.set(normalized.change_id, normalized)
    }
  }
  return Array.from(byKey.values())
}

function rankPhase(phase: AiChangePreviewPhase): number {
  switch (phase) {
    case "started":
      return 0
    case "delta":
      return 1
    case "completed":
      return 2
    case "saved":
      return 3
    case "failed":
      return 3
    default:
      return 0
  }
}

export function buildPersistedAiChangePreviewDescriptorsFromMessages(
  threadId: string,
  messages: Array<{ id: string; role: string; thread_id?: string; content_json?: unknown | null }>,
): Array<{ threadId: string; messageId: string; preview: PersistedAiChangePreview }> {
  const out: Array<{ threadId: string; messageId: string; preview: PersistedAiChangePreview }> = []
  for (const message of messages) {
    if (message.role !== "assistant") continue
    if (message.thread_id && message.thread_id !== threadId) continue
    for (const preview of parseAiChangePreviewsFromMessage(message.content_json)) {
      out.push({ threadId, messageId: message.id, preview })
    }
  }
  return out
}

export function hydrateAiChangePreviewsFromMessages(
  descriptors: Array<{ threadId: string; messageId: string; preview: PersistedAiChangePreview }>,
): void {
  const store = useAiChangePreviewStreamStore.getState()
  for (const { threadId, messageId, preview } of descriptors) {
    store.hydrateAiChangePreviewForMessage({ threadId, messageId, preview })
  }
}
