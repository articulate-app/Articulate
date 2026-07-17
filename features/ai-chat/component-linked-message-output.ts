/**
 * Detection for component-linked `__AI_MESSAGE_OUTPUT__` events.
 *
 * Component edit/save turns emit BOTH `__AI_COMPONENT_EDIT_PREVIEW__` (which drives the inline
 * preview card) and `__AI_MESSAGE_OUTPUT__` (whose `content_text` is the SAME component body).
 * If that body is rendered as normal assistant text it duplicates the preview card and causes a
 * flicker. A message output is treated as component-linked when it carries a component identity,
 * is flagged as a component-output context, or the assistant message already produced preview
 * events — in which case its body must finalize the preview card instead of rendering as text.
 */

export type ComponentLinkedCardUpdate = {
  taskId: number
  channelId: number
  componentId: string
  taskComponentOutputId: string | null
  componentTitle: string | null
  operation: "append" | "replace" | null
  outputKind: string | null
  contentText: string
  contentJson: unknown
}

export type ComponentLinkedMessageOutput = {
  /** Whether the body must be suppressed (not rendered as plain assistant text). */
  isComponentLinked: boolean
  /** Present when the payload carries enough identity to finalize a specific preview card. */
  card: ComponentLinkedCardUpdate | null
}

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

function toOperation(value: unknown): "append" | "replace" | null {
  return value === "append" || value === "replace" ? value : null
}

export function detectComponentLinkedMessageOutput(
  payload: Record<string, unknown>,
  opts: { hasExistingPreviewForMessage?: boolean } = {},
): ComponentLinkedMessageOutput {
  const taskId = toFiniteNumber(payload.task_id)
  const channelId = toFiniteNumber(payload.channel_id)
  const componentId = toTrimmedString(payload.component_id)
  const taskComponentOutputId = toTrimmedString(payload.task_component_output_id)
  const selectedContextType = toTrimmedString(payload.selected_context_type)

  const hasFullIdentity =
    taskId != null && channelId != null && !!componentId && !!taskComponentOutputId
  const isComponentContext = selectedContextType === "component_output"
  const hasExistingPreview = Boolean(opts.hasExistingPreviewForMessage)

  const isComponentLinked = hasFullIdentity || isComponentContext || hasExistingPreview
  if (!isComponentLinked) return { isComponentLinked: false, card: null }

  // A card can only be keyed / finalized when task + channel + component are all present.
  if (taskId == null || channelId == null || !componentId) {
    return { isComponentLinked: true, card: null }
  }

  return {
    isComponentLinked: true,
    card: {
      taskId,
      channelId,
      componentId,
      taskComponentOutputId: taskComponentOutputId ?? null,
      componentTitle: toTrimmedString(payload.component_title),
      operation: toOperation(payload.operation),
      outputKind: toTrimmedString(payload.output_kind),
      contentText: typeof payload.content_text === "string" ? payload.content_text : "",
      contentJson: payload.content_json ?? null,
    },
  }
}
