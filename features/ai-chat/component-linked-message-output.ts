/**
 * Strict event contracts for component output mutation.
 *
 * Allow-list for the task-component output cache:
 * - `__AI_COMPONENT_EDIT_PREVIEW__` when `phase === "saved"` and `ok === true`
 * - A normal persisted component-output query / bootstrap response
 *
 * Never mutate from `__AI_MESSAGE_OUTPUT__`, clarifications, status events,
 * request-plan summaries, or execution-trace events.
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
  /** Whether the body should be suppressed in the chat bubble (preview already shows it). */
  isComponentLinked: boolean
  /**
   * Identity for associating with an existing preview card.
   * Never use this to write message_output body into the component output cache.
   */
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** True when a message_output (or its content_json) carries a clarification_request. */
export function messageOutputHasClarificationRequest(payload: Record<string, unknown>): boolean {
  if (asRecord(payload.clarification_request)) return true

  const contentJson = asRecord(payload.content_json)
  if (contentJson) {
    if (asRecord(contentJson.clarification_request)) return true
    const nestedMessageOutput = asRecord(contentJson.message_output)
    if (nestedMessageOutput && asRecord(nestedMessageOutput.clarification_request)) return true
  }

  const nested = asRecord(payload.message_output)
  if (nested && asRecord(nested.clarification_request)) return true

  return false
}

/**
 * Build acknowledgement / hidden message_output — the build timeline is the visible ack.
 * Matches live `__AI_MESSAGE_OUTPUT__` and persisted assistant `content_json`.
 */
export function shouldSuppressBuildAckChatBubble(
  payload: Record<string, unknown> | null | undefined,
): boolean {
  if (!payload) return false

  const check = (row: Record<string, unknown>): boolean => {
    const outputKind = toTrimmedString(row.output_kind)?.toLowerCase()
    if (outputKind === "build_ack" || outputKind === "artifact_build_control") return true

    const uiVisibility = toTrimmedString(row.ui_visibility)?.toLowerCase()
    if (uiVisibility === "hidden") return true

    const buildAck = asRecord(row.build_ack)
    if (buildAck?.suppress_chat_bubble === true) return true

    return false
  }

  if (check(payload)) return true

  const contentJson = asRecord(payload.content_json)
  if (contentJson && check(contentJson)) return true

  const nested = asRecord(payload.message_output)
  if (nested && check(nested)) return true

  if (contentJson) {
    const nestedInContent = asRecord(contentJson.message_output)
    if (nestedInContent && check(nestedInContent)) return true
  }

  return false
}

/**
 * Detect whether a message_output body should be suppressed in chat because an edit-preview
 * card already shows the component body. Never grants permission to mutate outputs.
 *
 * Clarification message_outputs are never component-linked — they are always chat content.
 */
export function detectComponentLinkedMessageOutput(
  payload: Record<string, unknown>,
  opts: { hasExistingPreviewForMessage?: boolean } = {},
): ComponentLinkedMessageOutput {
  if (messageOutputHasClarificationRequest(payload)) {
    return { isComponentLinked: false, card: null }
  }

  // Build acknowledgements are not component-linked; callers suppress via
  // `shouldSuppressBuildAckChatBubble` instead.
  if (shouldSuppressBuildAckChatBubble(payload)) {
    return { isComponentLinked: false, card: null }
  }

  const taskId = toFiniteNumber(payload.task_id)
  const channelId = toFiniteNumber(payload.channel_id)
  const componentId = toTrimmedString(payload.component_id)
  const taskComponentOutputId = toTrimmedString(payload.task_component_output_id)
  const hasExistingPreview = Boolean(opts.hasExistingPreviewForMessage)

  // Scope / identity alone is never enough: message_output is always chat content.
  // Only suppress the bubble body when a live edit-preview card already covers this turn
  // (avoids duplicating the component body next to the preview card).
  if (!hasExistingPreview) return { isComponentLinked: false, card: null }

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
