import type { TaggedTaskComponentRef } from "./build-ai-chat-tagged-refs"
import { buildComponentOutputActiveFieldContext, type AiActiveFieldContext } from "./active-field-context"
import type { AiChatClarificationRequestAction } from "../../app/lib/ai/chat"
import type { AiMessage } from "./types"

/** Opaque entity ids from the backend — never derived from labels. */
export type ClarificationEntityRef = {
  entity_type?: string | null
  project_id?: number | null
  task_id?: number | null
  channel_id?: number | null
  component_id?: string | null
  task_component_output_id?: string | null
  user_id?: number | null
}

/** Shape-driven option — renderer must not switch on kind/label/id semantics. */
export type AiClarificationOption = {
  id: string
  label: string
  description?: string | null
  value?: unknown
  kind?: string | null
  entity_ref?: ClarificationEntityRef | null
  recommended?: boolean
  disabled?: boolean
}

export type AiClarificationContext = {
  task_id?: number | null
  channel_id?: number | null
  component_id?: string | null
  task_component_output_id?: string | null
  selected_component_label?: string | null
  tagged_task_component_refs?: TaggedTaskComponentRef[]
  target_scope?: string | null
}

export type AiClarificationRequest = {
  id: string
  question: string
  options: AiClarificationOption[]
  allow_multiple: boolean
  min_selections: number | null
  max_selections: number | null
  allow_free_text: boolean
  pending_request?: unknown
  /** Links this clarification to a Request Plan V3 row when the backend supplies it. */
  request_plan_id?: string | null
  context: AiClarificationContext | null
  assistantMessageId?: string | null
  runId?: string | null
  /** @deprecated Kept only for reload of older persisted payloads. */
  component_options?: AiClarificationOption[]
  /** @deprecated Optional search hint from older payloads. */
  picker?: { searchable?: boolean; option_count?: number } | null
}

/**
 * Clarification answer payload. Sends option ids plus opaque `value` / `entity_ref`
 * from the selected options — never reconstruct entity ids from labels.
 */
export type AiClarificationResponsePayload = {
  clarification_message_id: string | null
  request_plan_id?: string | null
  selected_option: string | null
  selected_options: string[]
  free_text: string | null
  value?: unknown
  entity_ref?: ClarificationEntityRef | ClarificationEntityRef[] | null
}

export type AiClarificationRequestPayload = {
  type: "clarification_request"
  question: string
  options: Array<{
    id: string
    label: string
    description?: string | null
    value?: unknown
    kind?: string | null
    entity_ref?: ClarificationEntityRef | null
    recommended?: boolean
    disabled?: boolean
  }>
  allow_multiple?: boolean
  min_selections?: number | null
  max_selections?: number | null
  allow_free_text?: boolean
  pending_request?: unknown
  request_plan_id?: string | null
  task_id?: number | null
  channel_id?: number | null
  component_id?: string | null
  task_component_output_id?: string | null
  target_scope?: string | null
  selected_component_label?: string | null
  tagged_task_component_refs?: TaggedTaskComponentRef[]
}

function parseNumericId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function parseComponentId(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (value == null) return null
  const asString = String(value).trim()
  return asString.length > 0 ? asString : null
}

function parseEntityRef(value: unknown): ClarificationEntityRef | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  const ref: ClarificationEntityRef = {
    entity_type: typeof record.entity_type === "string" ? record.entity_type : null,
    project_id: parseNumericId(record.project_id),
    task_id: parseNumericId(record.task_id),
    channel_id: parseNumericId(record.channel_id),
    component_id: parseComponentId(record.component_id),
    task_component_output_id:
      parseComponentId(record.task_component_output_id) ?? parseComponentId(record.output_id),
    user_id: parseNumericId(record.user_id),
  }
  if (
    ref.project_id == null
    && ref.task_id == null
    && ref.channel_id == null
    && !ref.component_id
    && !ref.task_component_output_id
    && ref.user_id == null
    && !ref.entity_type
  ) {
    return null
  }
  return ref
}

/**
 * Normalize a backend option into the generic shape. Legacy component fields
 * (top-level task_id/component_id) become `entity_ref` without category switching.
 */
export function parseClarificationOption(row: unknown): AiClarificationOption | null {
  if (!row || typeof row !== "object") return null
  const record = row as Record<string, unknown>
  const id = typeof record.id === "string" ? record.id.trim() : ""
  const label =
    (typeof record.label === "string" ? record.label.trim() : "")
    || (typeof record.component_name === "string" ? record.component_name.trim() : "")
  if (!id || !label) return null

  const entityRef =
    parseEntityRef(record.entity_ref)
    ?? (() => {
      const taskId = parseNumericId(record.task_id)
      const channelId = parseNumericId(record.channel_id)
      const componentId = parseComponentId(record.component_id)
      const outputId =
        parseComponentId(record.task_component_output_id) ?? parseComponentId(record.output_id)
      if (taskId == null && channelId == null && !componentId && !outputId) return null
      return {
        entity_type: typeof record.kind === "string" ? record.kind : null,
        task_id: taskId,
        channel_id: channelId,
        component_id: componentId,
        task_component_output_id: outputId,
      } satisfies ClarificationEntityRef
    })()

  return {
    id,
    label,
    description:
      typeof record.description === "string" && record.description.trim()
        ? record.description.trim()
        : null,
    value: "value" in record ? record.value : undefined,
    kind: typeof record.kind === "string" ? record.kind : null,
    entity_ref: entityRef,
    recommended: record.recommended === true,
    disabled: record.disabled === true,
  }
}

function parseClarificationOptions(value: unknown): AiClarificationOption[] {
  if (!Array.isArray(value)) return []
  const options: AiClarificationOption[] = []
  const seen = new Set<string>()
  for (const row of value) {
    const parsed = parseClarificationOption(row)
    if (!parsed || seen.has(parsed.id)) continue
    seen.add(parsed.id)
    options.push(parsed)
  }
  return options
}

function parseAllowFreeText(value: unknown): boolean {
  return value === true
}

function parseTaggedTaskComponentRefs(value: unknown): TaggedTaskComponentRef[] {
  if (!Array.isArray(value)) return []
  const refs: TaggedTaskComponentRef[] = []
  for (const row of value) {
    if (!row || typeof row !== "object") continue
    const record = row as Record<string, unknown>
    const taskId = parseNumericId(record.task_id)
    const channelId = parseNumericId(record.channel_id)
    const componentId = parseComponentId(record.component_id)
    if (taskId == null || channelId == null || !componentId) continue
    refs.push({
      task_id: taskId,
      channel_id: channelId,
      component_id: componentId,
      component_title:
        typeof record.component_title === "string" ? record.component_title : undefined,
      task_title: typeof record.task_title === "string" ? record.task_title : undefined,
      channel_name: typeof record.channel_name === "string" ? record.channel_name : undefined,
    })
  }
  return refs
}

function parseClarificationContext(row: Record<string, unknown>): AiClarificationContext | null {
  const nestedContext =
    row.context && typeof row.context === "object"
      ? (row.context as Record<string, unknown>)
      : row

  const taskId = parseNumericId(nestedContext.task_id)
  const channelId = parseNumericId(nestedContext.channel_id ?? nestedContext.active_channel_id)
  const componentId = parseComponentId(nestedContext.component_id)
  const targetScope =
    typeof nestedContext.target_scope === "string" && nestedContext.target_scope.trim().length > 0
      ? nestedContext.target_scope.trim()
      : null

  if (taskId == null && channelId == null && !componentId && !targetScope) {
    return null
  }

  const taggedRefs = parseTaggedTaskComponentRefs(nestedContext.tagged_task_component_refs)
  const fallbackRef: TaggedTaskComponentRef | null =
    taskId != null && channelId != null && componentId
      ? {
          task_id: taskId,
          channel_id: channelId,
          component_id: componentId,
          component_title:
            typeof nestedContext.selected_component_label === "string"
              ? nestedContext.selected_component_label
              : undefined,
        }
      : null

  return {
    task_id: taskId,
    channel_id: channelId,
    component_id: componentId,
    task_component_output_id:
      typeof nestedContext.task_component_output_id === "string"
        ? nestedContext.task_component_output_id
        : null,
    selected_component_label:
      typeof nestedContext.selected_component_label === "string"
        ? nestedContext.selected_component_label
        : null,
    tagged_task_component_refs:
      taggedRefs.length > 0
        ? taggedRefs
        : fallbackRef
          ? [fallbackRef]
          : undefined,
    target_scope: targetScope,
  }
}

/** Upsert by assistant message_id so stream + message_output never duplicate. */
export function buildClarificationDedupeKey(args: {
  assistantMessageId?: string | null
  runId?: string | null
  question?: string
}): string {
  const messageId = args.assistantMessageId?.trim()
  if (messageId) return messageId
  const runId = args.runId?.trim()
  if (runId) return runId
  return (args.question ?? "").trim()
}

/**
 * Idempotent merge for stream event + message_output + persisted content_json.
 * Keyed by message_id (via {@link buildClarificationDedupeKey}).
 */
export function reduceClarificationRequest(
  previous: AiClarificationRequest | null,
  incoming: AiClarificationRequest,
): AiClarificationRequest {
  const dedupeKey = buildClarificationDedupeKey(incoming)
  const normalized: AiClarificationRequest = { ...incoming, id: dedupeKey }
  if (!previous) return normalized

  const prevKey = buildClarificationDedupeKey(previous)
  if (prevKey === dedupeKey) {
    return {
      ...previous,
      ...normalized,
      id: dedupeKey,
      options: normalized.options.length > 0 ? normalized.options : previous.options,
      picker: normalized.picker ?? previous.picker,
      question: normalized.question || previous.question,
      allow_multiple: normalized.allow_multiple || previous.allow_multiple,
      min_selections: normalized.min_selections ?? previous.min_selections,
      max_selections: normalized.max_selections ?? previous.max_selections,
      allow_free_text: normalized.allow_free_text || previous.allow_free_text,
      pending_request:
        normalized.pending_request !== undefined
          ? normalized.pending_request
          : previous.pending_request,
      request_plan_id: normalized.request_plan_id ?? previous.request_plan_id ?? null,
      context: normalized.context ?? previous.context,
      assistantMessageId: normalized.assistantMessageId ?? previous.assistantMessageId,
      runId: normalized.runId ?? previous.runId,
    }
  }

  // Stream temp id → persisted message id for the same run: keep one card.
  if (
    previous.runId
    && normalized.runId
    && previous.runId === normalized.runId
    && previous.assistantMessageId?.startsWith("temp-")
    && normalized.assistantMessageId
    && !normalized.assistantMessageId.startsWith("temp-")
  ) {
    return { ...previous, ...normalized, id: dedupeKey }
  }

  return normalized
}

/** Opaque selected option values — single value or array; never interpreted. */
export function valuesFromSelectedClarificationOptions(
  options: AiClarificationOption[],
): unknown {
  const values = options
    .filter((option) => option && "value" in option && option.value !== undefined)
    .map((option) => option.value)
  if (values.length === 0) return null
  if (values.length === 1) return values[0]
  return values
}

export type ClarificationAnswerState = {
  selectedOptionIds: string[]
  freeText: string | null
  value: unknown
}

function parseClarificationAnswerFromUserMessage(
  message: AiMessage,
): (ClarificationAnswerState & { clarificationMessageId: string }) | null {
  if (message.role !== "user" || !message.content_json || typeof message.content_json !== "object") {
    return null
  }
  const root = message.content_json as Record<string, unknown>
  const response =
    root.clarification_response && typeof root.clarification_response === "object"
      ? (root.clarification_response as Record<string, unknown>)
      : null
  if (!response) return null
  const clarificationMessageId =
    typeof response.clarification_message_id === "string"
      ? response.clarification_message_id.trim()
      : ""
  if (!clarificationMessageId) return null

  const selectedOptions = Array.isArray(response.selected_options)
    ? response.selected_options
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean)
    : []
  const selectedOption =
    typeof response.selected_option === "string" && response.selected_option.trim()
      ? response.selected_option.trim()
      : null
  const selectedOptionIds =
    selectedOptions.length > 0
      ? selectedOptions
      : selectedOption
        ? [selectedOption]
        : []

  return {
    clarificationMessageId,
    selectedOptionIds,
    freeText:
      typeof response.free_text === "string" && response.free_text.trim()
        ? response.free_text.trim()
        : null,
    value: "value" in response ? response.value : null,
  }
}

/** Answered clarification for history — question + selection preserved, card disabled. */
export type ClarificationDisplayForMessage = {
  request: AiClarificationRequest
  answered: boolean
  answer: ClarificationAnswerState | null
}

export function resolveClarificationDisplayForMessage(
  messages: AiMessage[],
  messageIndex: number,
): ClarificationDisplayForMessage | null {
  const message = messages[messageIndex]
  if (!message || message.role !== "assistant") return null
  const request = parseClarificationFromMessageContentJson(message.content_json, {
    assistantMessageId: message.id,
  })
  if (!request) return null

  const clarificationMessageId = request.assistantMessageId ?? request.id
  let answer: ClarificationAnswerState | null = null
  for (let index = messageIndex + 1; index < messages.length; index += 1) {
    const parsed = parseClarificationAnswerFromUserMessage(messages[index])
    if (!parsed) continue
    if (parsed.clarificationMessageId !== clarificationMessageId) continue
    answer = {
      selectedOptionIds: parsed.selectedOptionIds,
      freeText: parsed.freeText,
      value: parsed.value,
    }
    break
  }

  return {
    request,
    answered: answer != null,
    answer,
  }
}

function serializeClarificationOption(option: AiClarificationOption): ClarificationOptionPayload {
  return {
    id: option.id,
    label: option.label,
    ...(option.description ? { description: option.description } : {}),
    ...(option.value !== undefined ? { value: option.value } : {}),
    ...(option.kind ? { kind: option.kind } : {}),
    ...(option.entity_ref ? { entity_ref: option.entity_ref } : {}),
    ...(option.recommended ? { recommended: true } : {}),
    ...(option.disabled ? { disabled: true } : {}),
  }
}

type ClarificationOptionPayload = {
  id: string
  label: string
  description?: string | null
  value?: unknown
  kind?: string | null
  entity_ref?: ClarificationEntityRef | null
  recommended?: boolean
  disabled?: boolean
}

export function serializeClarificationRequestPayload(
  request: AiClarificationRequest,
): AiClarificationRequestPayload {
  return {
    type: "clarification_request",
    question: request.question,
    options: request.options.map(serializeClarificationOption),
    ...(request.allow_multiple ? { allow_multiple: true } : {}),
    ...(request.min_selections != null ? { min_selections: request.min_selections } : {}),
    ...(request.max_selections != null ? { max_selections: request.max_selections } : {}),
    ...(request.allow_free_text ? { allow_free_text: true } : {}),
    ...(request.pending_request !== undefined
      ? { pending_request: request.pending_request }
      : {}),
    ...(request.request_plan_id ? { request_plan_id: request.request_plan_id } : {}),
    ...(request.context?.task_id != null ? { task_id: request.context.task_id } : {}),
    ...(request.context?.channel_id != null ? { channel_id: request.context.channel_id } : {}),
    ...(request.context?.component_id ? { component_id: request.context.component_id } : {}),
    ...(request.context?.task_component_output_id
      ? { task_component_output_id: request.context.task_component_output_id }
      : {}),
    ...(request.context?.target_scope ? { target_scope: request.context.target_scope } : {}),
    ...(request.context?.selected_component_label
      ? { selected_component_label: request.context.selected_component_label }
      : {}),
    ...(request.context?.tagged_task_component_refs
      ? { tagged_task_component_refs: request.context.tagged_task_component_refs }
      : {}),
  }
}

export function parseClarificationRequestRecord(
  row: Record<string, unknown>,
  options?: {
    assistantMessageId?: string | null
    runId?: string | null
    fallbackId?: string
  },
): AiClarificationRequest | null {
  const type = typeof row.type === "string" ? row.type : null
  const phase = typeof row.phase === "string" ? row.phase : null
  const isClarificationType = type === "clarification_request" || type === "clarification"
  const isClarificationPhase =
    phase == null || phase === "clarification" || phase === "completed" || phase === "clarification_request"
  const nested =
    row.clarification_request && typeof row.clarification_request === "object"
      ? (row.clarification_request as Record<string, unknown>)
      : row.message_output && typeof row.message_output === "object"
        ? (() => {
            const messageOutput = row.message_output as Record<string, unknown>
            return messageOutput.clarification_request && typeof messageOutput.clarification_request === "object"
              ? (messageOutput.clarification_request as Record<string, unknown>)
              : null
          })()
        : row.clarification && typeof row.clarification === "object"
          ? (row.clarification as Record<string, unknown>)
          : null
  const source = nested ?? (isClarificationType && isClarificationPhase ? row : null)
  if (!source) return null

  const question =
    (typeof source.question === "string" ? source.question.trim() : "")
    || (typeof source.message === "string" ? source.message.trim() : "")
    || (typeof row.question === "string" ? row.question.trim() : "")
  if (!question) return null

  const fromOptions = parseClarificationOptions(source.options)
  const fromLegacyComponentOptions = parseClarificationOptions(source.component_options)
  const merged = [...fromOptions]
  const seen = new Set(fromOptions.map((option) => option.id))
  for (const option of fromLegacyComponentOptions) {
    if (seen.has(option.id)) continue
    seen.add(option.id)
    merged.push(option)
  }

  const picker =
    source.picker && typeof source.picker === "object"
      ? (source.picker as Record<string, unknown>)
      : null

  const runId =
    (typeof source.run_id === "string" && source.run_id.trim())
    || (typeof row.run_id === "string" && row.run_id.trim())
    || options?.runId
    || null
  const assistantMessageId = options?.assistantMessageId ?? null
  const id =
    buildClarificationDedupeKey({
      assistantMessageId,
      runId,
      question,
    })
    || options?.fallbackId
    || `clarification-${Date.now()}`

  const requestPlanId =
    (typeof source.request_plan_id === "string" && source.request_plan_id.trim())
    || (typeof row.request_plan_id === "string" && row.request_plan_id.trim())
    || (() => {
      const pending =
        source.pending_request && typeof source.pending_request === "object"
          ? (source.pending_request as Record<string, unknown>)
          : null
      return typeof pending?.request_plan_id === "string" && pending.request_plan_id.trim()
        ? pending.request_plan_id.trim()
        : null
    })()

  return {
    id,
    question,
    options: merged,
    allow_multiple: source.allow_multiple === true,
    min_selections:
      typeof source.min_selections === "number" && Number.isFinite(source.min_selections)
        ? source.min_selections
        : null,
    max_selections:
      typeof source.max_selections === "number" && Number.isFinite(source.max_selections)
        ? source.max_selections
        : null,
    allow_free_text:
      parseAllowFreeText(source.allow_free_text) || picker?.allow_free_text === true,
    pending_request: "pending_request" in source ? source.pending_request : undefined,
    request_plan_id: requestPlanId,
    context: parseClarificationContext(source),
    assistantMessageId,
    runId,
    picker: picker
      ? {
          searchable: picker.searchable !== false,
          option_count:
            typeof picker.option_count === "number" ? picker.option_count : merged.length,
        }
      : null,
  }
}

export function parseClarificationFromMessageContentJson(
  contentJson: unknown,
  options?: { assistantMessageId?: string | null; runId?: string | null },
): AiClarificationRequest | null {
  if (!contentJson || typeof contentJson !== "object") return null
  return parseClarificationRequestRecord(contentJson as Record<string, unknown>, options)
}

function messageAnswersClarification(
  message: AiMessage,
  clarificationMessageId: string,
): boolean {
  if (message.role !== "user" || !message.content_json || typeof message.content_json !== "object") {
    return false
  }
  const root = message.content_json as Record<string, unknown>
  const response =
    root.clarification_response && typeof root.clarification_response === "object"
      ? (root.clarification_response as Record<string, unknown>)
      : null
  if (!response) return false
  const answeredId =
    typeof response.clarification_message_id === "string"
      ? response.clarification_message_id.trim()
      : ""
  return answeredId.length > 0 && answeredId === clarificationMessageId
}

export function resolveActiveClarificationFromMessages(
  messages: AiMessage[],
): AiClarificationRequest | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== "assistant") continue
    const parsed = parseClarificationFromMessageContentJson(message.content_json, {
      assistantMessageId: message.id,
    })
    if (!parsed) continue
    const clarificationMessageId = parsed.assistantMessageId ?? parsed.id
    const wasAnswered = messages
      .slice(index + 1)
      .some((later) => messageAnswersClarification(later, clarificationMessageId))
    if (wasAnswered) continue
    return parsed
  }
  return null
}

export function clarificationHasExplicitComponentContext(
  clarification: AiClarificationRequest,
): boolean {
  return Boolean(clarification.context?.component_id?.trim())
}

export function activeFieldContextFromClarification(
  clarification: AiClarificationRequest,
): AiActiveFieldContext | null {
  if (!clarificationHasExplicitComponentContext(clarification) || !clarification.context) {
    return null
  }
  const ref = clarification.context.tagged_task_component_refs?.[0]
  const componentTitle =
    clarification.context.selected_component_label?.trim()
    || ref?.component_title?.trim()
    || "Component"
  if (
    clarification.context.task_id == null
    || clarification.context.channel_id == null
    || !clarification.context.component_id
  ) {
    return null
  }

  return {
    ...buildComponentOutputActiveFieldContext({
      taskId: clarification.context.task_id,
      channelId: clarification.context.channel_id,
      taskComponentId: clarification.context.component_id,
      taskComponentOutputId: clarification.context.task_component_output_id ?? null,
      componentTitle,
      selectionSource: "component_action",
      taskTitle: ref?.task_title ?? null,
      channelName: ref?.channel_name ?? null,
    }),
    contextSource: "clarification",
  }
}

export function clarificationActionToRequest(
  action: AiChatClarificationRequestAction,
  options?: { assistantMessageId?: string | null; runId?: string | null; fallbackId?: string },
): AiClarificationRequest {
  const parsed = parseClarificationRequestRecord(action as unknown as Record<string, unknown>, options)
  if (parsed) return parsed
  const actionRecord = action as unknown as Record<string, unknown>
  const requestPlanId =
    typeof actionRecord.request_plan_id === "string" && actionRecord.request_plan_id.trim()
      ? actionRecord.request_plan_id.trim()
      : null
  return {
    id:
      buildClarificationDedupeKey({
        assistantMessageId: options?.assistantMessageId ?? null,
        runId: options?.runId ?? null,
        question: action.question.trim(),
      })
      || options?.fallbackId
      || `clarification-${Date.now()}`,
    question: action.question.trim(),
    options: parseClarificationOptions(action.options),
    allow_multiple: false,
    min_selections: null,
    max_selections: null,
    allow_free_text: parseAllowFreeText(action.allow_free_text),
    request_plan_id: requestPlanId,
    context: parseClarificationContext(actionRecord),
    assistantMessageId: options?.assistantMessageId ?? null,
    runId: options?.runId ?? null,
  }
}

/** Copy exact entity_ref ids into the structured response — never from labels. */
export function idsFromClarificationOption(option: AiClarificationOption | null | undefined): {
  task_id: number | null
  channel_id: number | null
  component_id: string | null
  task_component_output_id: string | null
} {
  const ref = option?.entity_ref
  return {
    task_id: ref?.task_id ?? null,
    channel_id: ref?.channel_id ?? null,
    component_id: ref?.component_id?.trim() || null,
    task_component_output_id: ref?.task_component_output_id?.trim() || null,
  }
}

function entityRefsFromSelectedClarificationOptions(
  options: AiClarificationOption[],
): ClarificationEntityRef | ClarificationEntityRef[] | null {
  const refs = options
    .map((option) => option.entity_ref)
    .filter((ref): ref is ClarificationEntityRef => Boolean(ref))
  if (refs.length === 0) return null
  if (refs.length === 1) return refs[0]
  return refs
}

export function buildClarificationResponsePayload(args: {
  clarificationMessageId?: string | null
  requestPlanId?: string | null
  selectedOptionIds?: string[] | null
  /** Selected option records — used only to copy opaque `value` / `entity_ref` unchanged. */
  selectedOptions?: AiClarificationOption[] | null
  freeText?: string | null
}): AiClarificationResponsePayload {
  const selectedOptionIds = (args.selectedOptionIds ?? [])
    .map((id) => id.trim())
    .filter(Boolean)
  const selectedOptions = (args.selectedOptions ?? []).filter((option) =>
    selectedOptionIds.includes(option.id),
  )
  const value = valuesFromSelectedClarificationOptions(selectedOptions)
  const entityRef = entityRefsFromSelectedClarificationOptions(selectedOptions)
  return {
    clarification_message_id: args.clarificationMessageId?.trim() || null,
    ...(args.requestPlanId?.trim()
      ? { request_plan_id: args.requestPlanId.trim() }
      : {}),
    selected_option: selectedOptionIds[0] ?? null,
    selected_options: selectedOptionIds,
    free_text: args.freeText?.trim() || null,
    ...(value !== null && value !== undefined ? { value } : {}),
    ...(entityRef ? { entity_ref: entityRef } : {}),
  }
}

export function buildClarificationUserMessageContentJson(args: {
  clarificationResponse: AiClarificationResponsePayload
  displayMessage: string
}): Record<string, unknown> {
  const display = args.displayMessage.trim()
  const clarificationResponse: AiClarificationResponsePayload = {
    clarification_message_id: args.clarificationResponse.clarification_message_id,
    ...(args.clarificationResponse.request_plan_id
      ? { request_plan_id: args.clarificationResponse.request_plan_id }
      : {}),
    selected_option: args.clarificationResponse.selected_option,
    selected_options: [...args.clarificationResponse.selected_options],
    free_text: args.clarificationResponse.free_text,
    ...(args.clarificationResponse.value !== undefined
      ? { value: args.clarificationResponse.value }
      : {}),
    ...(args.clarificationResponse.entity_ref
      ? { entity_ref: args.clarificationResponse.entity_ref }
      : {}),
  }
  return {
    clarification_response: clarificationResponse,
    ...(display ? { display_message: display } : {}),
  }
}

/** @deprecated Use entity_ref on options; kept for older call sites during transition. */
export function clarificationOptionHasComponentTarget(option: AiClarificationOption): boolean {
  return Boolean(option.entity_ref?.component_id)
}

/** @deprecated */
export type ComponentClarificationOption = AiClarificationOption

/** @deprecated */
export function isComponentClarificationOption(option: AiClarificationOption): boolean {
  return Boolean(option.entity_ref?.component_id)
}
