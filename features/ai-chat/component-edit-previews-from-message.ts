import type { ComponentEditStreamPhase } from "../../app/store/component-edit-stream"
import {
  findAiMessageChangeSetItemForPreview,
  parseAiMessageChangeSetItems,
  type AiMessageChangeSetItem,
} from "./ai-message-change-set"

export type PersistedComponentEditPreview = {
  phase: ComponentEditStreamPhase
  message_id: string | null
  preview_key: string | null
  task_id: number
  channel_id: number
  component_id: string
  component_title: string
  task_component_output_id: string | null
  operation: "append" | "replace" | null
  base_content_text: string | null
  content_text: string
  content_json: Array<{ type: string; text?: string; [key: string]: unknown }> | null
  error_message: string | null
  updated_at: string | null
}

const RENDERABLE_PHASES = new Set<ComponentEditStreamPhase>(["completed", "saved"])

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

function normalizePhase(value: unknown): ComponentEditStreamPhase | null {
  if (value === "started" || value === "delta" || value === "completed" || value === "saved" || value === "failed") {
    return value
  }
  return null
}

function normalizeOperation(value: unknown): "append" | "replace" | null {
  if (value === "append" || value === "replace") return value
  return null
}

function normalizeContentJson(value: unknown): PersistedComponentEditPreview["content_json"] {
  if (!Array.isArray(value)) return null
  const blocks: PersistedComponentEditPreview["content_json"] = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    blocks.push(item as { type: string; text?: string; [key: string]: unknown })
  }
  return blocks.length > 0 ? blocks : null
}

export function componentEditPreviewGroupKey(args: {
  messageId: string
  taskId: number
  channelId: number
  componentId: string
  previewKey?: string | null
}): string {
  const previewKey = typeof args.previewKey === "string" ? args.previewKey.trim() : ""
  if (previewKey.length > 0) return `${args.messageId}:${previewKey}`
  return `${args.messageId}:${args.taskId}:${args.channelId}:${args.componentId}`
}

function isPreviewNewer(
  candidate: PersistedComponentEditPreview,
  existing: PersistedComponentEditPreview,
): boolean {
  const candidateTs = candidate.updated_at ? Date.parse(candidate.updated_at) : Number.NaN
  const existingTs = existing.updated_at ? Date.parse(existing.updated_at) : Number.NaN
  if (Number.isFinite(candidateTs) && Number.isFinite(existingTs)) {
    return candidateTs >= existingTs
  }
  if (candidate.phase === "saved" && existing.phase !== "saved") return true
  if (existing.phase === "saved" && candidate.phase !== "saved") return false
  return true
}

export function normalizePersistedComponentEditPreview(
  raw: unknown,
): PersistedComponentEditPreview | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const phase = normalizePhase(row.phase)
  const taskId = toFiniteNumber(row.task_id)
  const channelId = toFiniteNumber(row.channel_id)
  const componentId = toTrimmedString(row.component_id)
  if (!phase || taskId == null || channelId == null || !componentId) return null

  const contentJson = normalizeContentJson(row.content_json)
  const contentText =
    toTrimmedString(row.content_text)
    ?? toTrimmedString(row.after_content_text)
    ?? (contentJson
      ? contentJson
          .filter((block) => block.type === "paragraph" || block.type === "text")
          .map((block) => (typeof block.text === "string" ? block.text : ""))
          .join("\n")
          .trim()
      : "")

  return {
    phase,
    message_id: toTrimmedString(row.message_id),
    preview_key: toTrimmedString(row.preview_key),
    task_id: taskId,
    channel_id: channelId,
    component_id: componentId,
    component_title: toTrimmedString(row.component_title) ?? "Component",
    task_component_output_id: toTrimmedString(row.task_component_output_id),
    operation: normalizeOperation(row.operation),
    base_content_text:
      toTrimmedString(row.base_content_text) ?? toTrimmedString(row.before_content_text),
    content_text: contentText,
    content_json: contentJson,
    error_message: toTrimmedString(row.error_message),
    updated_at: toTrimmedString(row.updated_at),
  }
}

export function parseComponentEditPreviewsFromMessage(
  contentJson: unknown,
): PersistedComponentEditPreview[] {
  if (!contentJson || typeof contentJson !== "object") return []
  const previews = (contentJson as Record<string, unknown>).component_edit_previews
  if (!Array.isArray(previews)) return []
  return previews
    .map((row) => normalizePersistedComponentEditPreview(row))
    .filter((row): row is PersistedComponentEditPreview => row != null)
}

export function pickLatestRenderableComponentEditPreview(
  previews: PersistedComponentEditPreview[],
): PersistedComponentEditPreview | null {
  const renderable = previews.filter((preview) => RENDERABLE_PHASES.has(preview.phase))
  if (renderable.length === 0) return null

  return renderable.reduce((latest, candidate) => {
    if (isPreviewNewer(candidate, latest)) return candidate
    return latest
  })
}

export function pickLatestRenderableComponentEditPreviewsByGroup(
  previews: PersistedComponentEditPreview[],
  fallbackMessageId: string,
): PersistedComponentEditPreview[] {
  const byGroup = new Map<string, PersistedComponentEditPreview>()

  for (const preview of previews) {
    if (!RENDERABLE_PHASES.has(preview.phase)) continue
    const messageId = preview.message_id ?? fallbackMessageId
    if (!messageId) continue
    const key = componentEditPreviewGroupKey({
      messageId,
      taskId: preview.task_id,
      channelId: preview.channel_id,
      componentId: preview.component_id,
      previewKey: preview.preview_key,
    })
    const existing = byGroup.get(key)
    if (!existing || isPreviewNewer(preview, existing)) {
      byGroup.set(key, preview)
    }
  }

  return Array.from(byGroup.values()).sort((left, right) => {
    const titleCompare = left.component_title.localeCompare(right.component_title)
    if (titleCompare !== 0) return titleCompare
    return left.component_id.localeCompare(right.component_id)
  })
}

export function enrichPersistedComponentEditPreviewFromChangeSetItem(
  preview: PersistedComponentEditPreview,
  changeSetItem: AiMessageChangeSetItem | null,
): PersistedComponentEditPreview {
  if (!changeSetItem) return preview
  return {
    ...preview,
    base_content_text: preview.base_content_text ?? changeSetItem.before_content_text,
    content_text: preview.content_text.trim()
      ? preview.content_text
      : (changeSetItem.after_content_text ?? preview.content_text),
    operation: preview.operation ?? changeSetItem.operation,
    task_component_output_id:
      preview.task_component_output_id ?? changeSetItem.task_component_output_id,
  }
}

export function buildPersistedPreviewDescriptorsFromMessages(
  threadId: string,
  messages: Array<{ id: string; role: string; thread_id?: string; content_json?: unknown | null }>,
): Array<{ threadId: string; messageId: string; preview: PersistedComponentEditPreview }> {
  const out: Array<{ threadId: string; messageId: string; preview: PersistedComponentEditPreview }> = []
  for (const message of messages) {
    if (message.role !== "assistant") continue
    if (message.thread_id && message.thread_id !== threadId) continue
    const changeSetItems = parseAiMessageChangeSetItems(message.content_json)
    const previews = pickLatestRenderableComponentEditPreviewsByGroup(
      parseComponentEditPreviewsFromMessage(message.content_json),
      message.id,
    )
    for (const preview of previews) {
      const enriched = enrichPersistedComponentEditPreviewFromChangeSetItem(
        preview,
        findAiMessageChangeSetItemForPreview({
          items: changeSetItems,
          taskId: preview.task_id,
          channelId: preview.channel_id,
          componentId: preview.component_id,
          taskComponentOutputId: preview.task_component_output_id,
        }),
      )
      out.push({ threadId, messageId: message.id, preview: enriched })
    }
  }
  return out
}
