/**
 * AI Chat Utility
 * Helper functions for calling the ai-chat Edge Function
 */

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import type { AiChatV2RunEvent } from "./ai-chat-v2-types"
import { isV2RunTerminalEventType, parseAiChatV2RunEvent } from "./parse-ai-run-events"
import {
  createAiChatStatusSequenceGate,
  type AiChatStatusSequenceGate,
} from "./ai-chat-status-sequence"

export interface AiChatRequest {
  thread_id: string
  message?: string | null
  display_message?: string | null
  attachments?: {
    file_name: string
    file_path: string
    mime_type?: string | null
    size?: number | null
  }[]
  active_channel_id?: number | null
  mode?: "build_component" | "build_briefing" | string | null
  component_id?: string | null
  /** Friendly model selection (e.g. "auto", "openai.smart"); backend maps to provider/model ids. */
  model_key?: string | null
  auto_run?: boolean
  tagged_task_ids?: number[]
  tagged_project_ids?: number[]
  tagged_user_ids?: number[]
  tagged_channel_ids?: number[]
  clarification_response?: {
    clarification_message_id?: string | null
    selected_option?: string | null
    selected_options?: string[]
    free_text?: string | null
  } | null
}

export interface AiChatResponse {
  message: {
    id: string
    thread_id: string
    role: "assistant"
    content: string
    content_json: any | null
    // ... usage + pricing metadata
  }
}

export interface AiStreamTerminalEvent {
  messageId?: string | null
  runId?: string | null
}

export type { AiChatV2RunEvent }

export interface ConsumeTextStreamHandlers {
  onTextChunk: (chunk: string) => void
  onStatusText?: (text: string) => void
  onTerminalEvent?: (event: AiStreamTerminalEvent) => void
  /** Fired only for backend `__AI_STATUS__` payloads that end the assistant turn (`type: done`, etc.). */
  onDoneStatusMarker?: (event: AiStreamTerminalEvent) => void
  /** Structured UI actions from `__AI_ACTION__{...}` (never shown as assistant text). */
  onAiAction?: (action: AiChatStreamAction) => void
  /** Thread title streaming updates from `__AI_THREAD_TITLE__{...}` (never shown as assistant text). */
  onThreadTitleEvent?: (event: AiChatThreadTitleEvent) => void
  /** Inline asset payload from `__AI_ASSET__{...}` (never shown as assistant text). */
  onAssetEvent?: (event: AiChatAssetEvent) => void
  /** Final build-component payload from `__AI_COMPONENT_OUTPUT__{...}`. */
  onComponentOutputEvent?: (event: AiChatComponentOutputEvent) => void
  /** Final assistant-message payload from `__AI_MESSAGE_OUTPUT__{...}`. */
  onMessageOutputEvent?: (event: AiChatMessageOutputEvent) => void
  /** Incremental component output preview from `__AI_COMPONENT_EDIT_PREVIEW__`. */
  onComponentEditPreviewEvent?: (event: AiChatComponentEditPreviewEvent) => void
  /** Generic write-action preview from `__AI_CHANGE_PREVIEW__` (never shown as assistant text). */
  onAiChangePreviewEvent?: (event: AiChatChangePreviewEvent) => void
  /** Component library source summary from `__AI_COMPONENT_LIBRARY_TRACE__` (never shown as assistant text). */
  onComponentLibraryTraceEvent?: (event: AiChatComponentLibraryTraceEvent) => void
  /** Component structure decision from `__AI_COMPONENT_PLAN_TRACE__` (never shown as assistant text). */
  onComponentPlanTraceEvent?: (event: AiChatComponentPlanTraceEvent) => void
  /** Request Plan V3 execution audit from `__AI_REQUEST_PLAN__` (never shown as assistant text). */
  onRequestPlanEvent?: (event: AiChatRequestPlanEvent) => void
  /** Progressive execution timeline from `__AI_EXECUTION_TRACE__` (never shown as assistant text). */
  onExecutionTraceEvent?: (event: AiChatExecutionTraceEvent) => void
  /** Protocol V2 run lifecycle events (`message.completed`, `run.failed`, target progress, …). */
  onAiChatV2RunEvent?: (event: AiChatV2RunEvent) => void
  /** Fired when an `__AI_STATUS__` payload passes sequence dedupe and will be processed. */
  onAiStatusPayload?: (parsed: Record<string, unknown>) => void
}

/** Persisted output / component update (ai-chat → task channel). */
export type AiChatContentSavedAction = {
  type: "content_saved"
  task_id: number
  channel_id: number
  component_id: string
  component_title: string
  operation: "append" | "replace"
  preview_text: string
  task_link: string
  saved_count: number
}

export type AiChatClarificationRequestAction = {
  type: "clarification_request"
  phase?: "clarification" | string | null
  question: string
  /** Opaque option records — frontend renders by shape, not by kind/label. */
  options: Array<Record<string, unknown>>
  /** @deprecated Prefer `options` with `entity_ref`. */
  component_options?: Array<Record<string, unknown>>
  picker?: Record<string, unknown> | null
  allow_multiple?: boolean
  min_selections?: number | null
  max_selections?: number | null
  allow_free_text?: boolean
  pending_request?: unknown
  /** Request Plan V3 id when this clarification continues a planned mutation. */
  request_plan_id?: string | null
  task_id?: number | null
  channel_id?: number | null
  component_id?: string | null
  task_component_output_id?: string | null
  target_scope?: string | null
  selected_component_label?: string | null
  tagged_task_component_refs?: Array<{
    task_id: number
    channel_id: number
    component_id: string
    component_title?: string
    task_title?: string
    channel_name?: string
  }>
}

export type AiChatStreamAction = AiChatContentSavedAction | AiChatClarificationRequestAction

export type ComponentEditPatch = {
  start?: number
  end?: number
  before?: string
  after?: string
  [key: string]: unknown
}

export type AiChatComponentEditPreviewEvent = {
  type: "component_edit_preview"
  phase: "started" | "delta" | "completed" | "saved" | "failed"
  ok?: boolean | null
  preview_key?: string | null
  task_id: number
  channel_id: number
  component_id: string
  component_title?: string
  task_component_output_id?: string | null
  operation?: "append" | "replace" | null
  base_content_text?: string
  before_content_text?: string
  after_content_text?: string
  before_content_json?: unknown
  after_content_json?: unknown
  edit_strategy?: string | null
  patches?: ComponentEditPatch[]
  content_text?: string
  content_text_delta?: string
  content_json?: unknown
  error_message?: string
}

export type AiChatChangePreviewChange = {
  field: string
  label?: string | null
  before?: unknown
  after?: unknown
}

export type AiChatChangePreviewItem = {
  label: string
  count?: number | null
  values?: string[] | null
}

export type AiChatChangePreviewEvent = {
  type: "ai_change_preview"
  phase: "started" | "delta" | "completed" | "saved" | "failed"
  ok?: boolean | null
  change_id: string
  preview_key?: string | null
  group_id?: string | null
  tool_name?: string | null
  round?: number | null
  entity_type: string
  entity_id?: string | number | null
  task_id?: number | null
  channel_id?: number | null
  project_id?: number | null
  component_id?: string | null
  task_component_output_id?: string | null
  operation?: string | null
  title?: string | null
  summary?: string | null
  reason?: string | null
  error?: string | null
  /** Distinct orchestrated-build scope counts (do not conflate channels with tasks). */
  task_count?: number | null
  channel_count?: number | null
  task_ids?: number[] | null
  requires_clarification?: boolean | null
  no_build_created?: boolean | null
  clarification_reason?: string | null
  preview_items?: AiChatChangePreviewItem[]
  changes?: AiChatChangePreviewChange[]
}

export type AiChatThreadTitleEvent =
  | { type: "thread_title"; phase: "started" }
  | { type: "thread_title"; phase: "delta"; delta: string }
  | { type: "thread_title"; phase: "completed"; title?: string | null }

export type AiChatAssetEvent = Record<string, unknown>
export type AiChatComponentOutputEvent = Record<string, unknown>
export type AiChatMessageOutputEvent = Record<string, unknown>
/** Raw `__AI_COMPONENT_LIBRARY_TRACE__` payload; normalized downstream in the ai-chat feature layer. */
export type AiChatComponentLibraryTraceEvent = Record<string, unknown>
/** Raw `__AI_COMPONENT_PLAN_TRACE__` payload; normalized downstream in the ai-chat feature layer. */
export type AiChatComponentPlanTraceEvent = Record<string, unknown>
/** Raw `__AI_REQUEST_PLAN__` payload; normalized downstream in the ai-chat feature layer. */
export type AiChatRequestPlanEvent = Record<string, unknown>
/** Raw `__AI_EXECUTION_TRACE__` payload; normalized downstream in the ai-chat feature layer. */
export type AiChatExecutionTraceEvent = Record<string, unknown>

const AI_STATUS_PREFIX = "__AI_STATUS__"
const AI_ACTION_PREFIX = "__AI_ACTION__"
const AI_PENDING_ACTION_PREFIX = "__AI_PENDING_ACTION__"
const AI_THREAD_TITLE_PREFIX = "__AI_THREAD_TITLE__"
const AI_ASSET_PREFIX = "__AI_ASSET__"
const AI_COMPONENT_OUTPUT_PREFIX = "__AI_COMPONENT_OUTPUT__"
const AI_COMPONENT_EDIT_PREVIEW_PREFIX = "__AI_COMPONENT_EDIT_PREVIEW__"
const AI_CHANGE_PREVIEW_PREFIX = "__AI_CHANGE_PREVIEW__"
const AI_COMPONENT_LIBRARY_TRACE_PREFIX = "__AI_COMPONENT_LIBRARY_TRACE__"
const AI_COMPONENT_PLAN_TRACE_PREFIX = "__AI_COMPONENT_PLAN_TRACE__"
const AI_REQUEST_PLAN_PREFIX = "__AI_REQUEST_PLAN__"
const AI_EXECUTION_TRACE_PREFIX = "__AI_EXECUTION_TRACE__"
const AI_MESSAGE_OUTPUT_PREFIX = "__AI_MESSAGE_OUTPUT__"
const ASSET_PLACEHOLDER_PATTERN = /\[\[asset:[a-zA-Z0-9_-]+\]\]/g

/** Only hold back a suffix that could still complete `__AI_STATUS__`; fixed 12-char holdback dropped real text (e.g. before `.` or line breaks). */
function maxSuffixMatchingSentinelPrefix(buffer: string, sentinel: string): number {
  const max = Math.min(buffer.length, sentinel.length - 1)
  for (let k = max; k >= 1; k -= 1) {
    if (sentinel.startsWith(buffer.slice(-k))) return k
  }
  return 0
}

type ParsedJsonObjectResult =
  | { status: "incomplete" }
  | { status: "complete"; endIndexExclusive: number; raw: string }

function parseTopLevelJsonObject(
  source: string,
  objectStartIndex: number
): ParsedJsonObjectResult {
  if (objectStartIndex >= source.length) return { status: "incomplete" }
  if (source[objectStartIndex] !== "{") return { status: "incomplete" }

  let depth = 0
  let inString = false
  let isEscaped = false

  for (let i = objectStartIndex; i < source.length; i += 1) {
    const char = source[i]

    if (inString) {
      if (isEscaped) {
        isEscaped = false
        continue
      }
      if (char === "\\") {
        isEscaped = true
        continue
      }
      if (char === "\"") {
        inString = false
      }
      continue
    }

    if (char === "\"") {
      inString = true
      continue
    }

    if (char === "{") {
      depth += 1
      continue
    }
    if (char === "}") {
      depth -= 1
      if (depth === 0) {
        return {
          status: "complete",
          endIndexExclusive: i + 1,
          raw: source.slice(objectStartIndex, i + 1),
        }
      }
      continue
    }
  }

  return { status: "incomplete" }
}

/**
 * Friendly transient status copy for known ai-chat tools. The backend `text` field always wins when
 * present; these are only used as a fallback when a recognized tool emits a status without copy.
 */
const TOOL_STATUS_LABELS: Record<string, { started?: string; completed?: string }> = {
  ai_import_component_structure: {
    started: "Importing the source structure…",
    completed: "Finished importing the source structure.",
  },
}

function normalizeToolStatusPhase(value: unknown): "started" | "completed" | null {
  if (typeof value !== "string") return null
  const phase = value.trim().toLowerCase()
  if (phase === "started" || phase === "start" || phase === "running" || phase === "in_progress") {
    return "started"
  }
  if (
    phase === "completed"
    || phase === "complete"
    || phase === "done"
    || phase === "finished"
    || phase === "success"
  ) {
    return "completed"
  }
  return null
}

/** Map a status payload to friendly copy from a recognized tool name + phase (no chain-of-thought). */
function resolveToolStatusLabel(parsed: Record<string, unknown>): string | null {
  const toolName =
    (typeof parsed.tool === "string" && parsed.tool)
    || (typeof parsed.tool_name === "string" && parsed.tool_name)
    || (typeof parsed.name === "string" && parsed.name)
    || (typeof parsed.function === "string" && parsed.function)
    || null
  if (!toolName) return null
  const labels = TOOL_STATUS_LABELS[toolName]
  if (!labels) return null
  const phase = normalizeToolStatusPhase(parsed.phase ?? parsed.status ?? parsed.state)
  if (phase === "started") return labels.started ?? null
  if (phase === "completed") return labels.completed ?? null
  return null
}

function emitStatusTextFromJson(
  jsonPayload: string,
  handlers: ConsumeTextStreamHandlers
): void {
  try {
    const parsed = JSON.parse(jsonPayload) as Record<string, unknown>
    if (typeof parsed?.text === "string" && parsed.text.trim().length > 0) {
      handlers.onStatusText?.(parsed.text)
      return
    }
    const friendlyLabel = resolveToolStatusLabel(parsed)
    if (friendlyLabel) {
      handlers.onStatusText?.(friendlyLabel)
    }
  } catch {
    // Ignore malformed status payloads to keep stream resilient.
  }
}

function processAiAssetJsonPayload(jsonPayload: string, handlers: ConsumeTextStreamHandlers): void {
  try {
    const parsed = JSON.parse(jsonPayload) as Record<string, unknown>
    console.debug("[ai-chat] __AI_ASSET__ parsed", {
      attachment_id: typeof parsed.attachment_id === "string" ? parsed.attachment_id : null,
      asset_key: typeof parsed.asset_key === "string" ? parsed.asset_key : null,
    })
    handlers.onAssetEvent?.(parsed)
  } catch {
    /* ignore malformed */
  }
}

function processAiComponentEditPreviewJsonPayload(
  jsonPayload: string,
  handlers: ConsumeTextStreamHandlers,
): void {
  try {
    const parsed = JSON.parse(jsonPayload) as Record<string, unknown>
    const event = parseComponentEditPreviewEvent(parsed)
    if (!event) return
    console.debug("[ai-chat] __AI_COMPONENT_EDIT_PREVIEW__ parsed", {
      phase: event.phase,
      task_id: event.task_id,
      channel_id: event.channel_id,
      component_id: event.component_id,
    })
    handlers.onComponentEditPreviewEvent?.(event)
  } catch {
    /* ignore malformed */
  }
}

function processAiChangePreviewJsonPayload(
  jsonPayload: string,
  handlers: ConsumeTextStreamHandlers,
): void {
  try {
    const parsed = JSON.parse(jsonPayload) as Record<string, unknown>
    const event = parseAiChangePreviewEvent(parsed)
    if (!event) return
    console.debug("[ai-chat] __AI_CHANGE_PREVIEW__ parsed", {
      phase: event.phase,
      change_id: event.change_id,
      entity_type: event.entity_type,
      tool_name: event.tool_name,
    })
    handlers.onAiChangePreviewEvent?.(event)
  } catch {
    /* ignore malformed */
  }
}

function processAiComponentLibraryTraceJsonPayload(
  jsonPayload: string,
  handlers: ConsumeTextStreamHandlers,
): void {
  try {
    const parsed = JSON.parse(jsonPayload) as Record<string, unknown>
    console.debug("[ai-chat] __AI_COMPONENT_LIBRARY_TRACE__ parsed", {
      phase: typeof parsed.phase === "string" ? parsed.phase : null,
      task_id: typeof parsed.task_id === "number" ? parsed.task_id : null,
      channel_id: typeof parsed.channel_id === "number" ? parsed.channel_id : null,
      source_count: Array.isArray(parsed.sources) ? parsed.sources.length : 0,
    })
    handlers.onComponentLibraryTraceEvent?.(parsed)
  } catch {
    /* ignore malformed */
  }
}

function processAiComponentPlanTraceJsonPayload(
  jsonPayload: string,
  handlers: ConsumeTextStreamHandlers,
): void {
  try {
    const parsed = JSON.parse(jsonPayload) as Record<string, unknown>
    console.debug("[ai-chat] __AI_COMPONENT_PLAN_TRACE__ parsed", {
      phase: typeof parsed.phase === "string" ? parsed.phase : null,
      task_id: typeof parsed.task_id === "number" ? parsed.task_id : null,
      channel_id: typeof parsed.channel_id === "number" ? parsed.channel_id : null,
      mode: typeof parsed.mode === "string" ? parsed.mode : null,
      action_count: Array.isArray(parsed.actions) ? parsed.actions.length : 0,
    })
    handlers.onComponentPlanTraceEvent?.(parsed)
  } catch {
    /* ignore malformed */
  }
}

function processAiRequestPlanJsonPayload(
  jsonPayload: string,
  handlers: ConsumeTextStreamHandlers,
): void {
  try {
    const parsed = JSON.parse(jsonPayload) as Record<string, unknown>
    const plan =
      parsed.plan && typeof parsed.plan === "object" && !Array.isArray(parsed.plan)
        ? (parsed.plan as Record<string, unknown>)
        : null
    console.debug("[ai-chat] __AI_REQUEST_PLAN__ parsed", {
      phase: typeof parsed.phase === "string" ? parsed.phase : null,
      plan_id:
        (plan && typeof plan.plan_id === "string" && plan.plan_id)
        || (typeof parsed.plan_id === "string" ? parsed.plan_id : null),
      operation:
        (plan && typeof plan.operation === "string" && plan.operation)
        || (typeof parsed.operation === "string" ? parsed.operation : null),
      status:
        (plan && typeof plan.status === "string" && plan.status)
        || (typeof parsed.status === "string" ? parsed.status : null),
    })
    handlers.onRequestPlanEvent?.(parsed)
  } catch {
    /* ignore malformed */
  }
}

function processAiExecutionTraceJsonPayload(
  jsonPayload: string,
  handlers: ConsumeTextStreamHandlers,
): void {
  try {
    const parsed = JSON.parse(jsonPayload) as Record<string, unknown>
    console.debug("[ai-chat] __AI_EXECUTION_TRACE__ parsed", {
      step_id: typeof parsed.step_id === "string" ? parsed.step_id : null,
      phase: typeof parsed.phase === "string" ? parsed.phase : null,
      category: typeof parsed.category === "string" ? parsed.category : null,
      sequence: typeof parsed.sequence === "number" ? parsed.sequence : null,
    })
    handlers.onExecutionTraceEvent?.(parsed)
  } catch {
    /* ignore malformed */
  }
}

function processAiComponentOutputJsonPayload(
  jsonPayload: string,
  handlers: ConsumeTextStreamHandlers
): void {
  try {
    const parsed = JSON.parse(jsonPayload) as Record<string, unknown>
    console.debug("[ai-chat] __AI_COMPONENT_OUTPUT__ parsed", {
      task_component_output_id:
        typeof parsed.task_component_output_id === "string" ? parsed.task_component_output_id : null,
      component_id: typeof parsed.component_id === "string" ? parsed.component_id : null,
      task_component_id: typeof parsed.task_component_id === "string" ? parsed.task_component_id : null,
    })
    handlers.onComponentOutputEvent?.(parsed)
  } catch {
    /* ignore malformed */
  }
}

function processAiMessageOutputJsonPayload(
  jsonPayload: string,
  handlers: ConsumeTextStreamHandlers
): void {
  try {
    const parsed = JSON.parse(jsonPayload) as Record<string, unknown>
    handlers.onMessageOutputEvent?.(parsed)
  } catch {
    /* ignore malformed */
  }
}

function isStreamDoneStatusPayload(parsed: Record<string, unknown>): boolean {
  const t = typeof parsed.type === "string" ? parsed.type : null
  /** Backend contract: explicit turn complete (optional `phase: completed`). */
  return t === "done"
}

function shouldProcessSequencedStatusPayload(
  parsed: Record<string, unknown>,
  gate: AiChatStatusSequenceGate,
  handlers: ConsumeTextStreamHandlers,
): boolean {
  if (!gate.shouldProcessStatusPayload(parsed)) return false
  handlers.onAiStatusPayload?.(parsed)
  return true
}

function processAiV2RunPayload(
  parsed: Record<string, unknown>,
  handlers: ConsumeTextStreamHandlers,
  assignTerminal: (ev: AiStreamTerminalEvent) => void,
  gate?: AiChatStatusSequenceGate,
): boolean {
  if (gate && !shouldProcessSequencedStatusPayload(parsed, gate, handlers)) {
    return true
  }
  const event = parseAiChatV2RunEvent(parsed)
  if (!event) return false
  handlers.onAiChatV2RunEvent?.(event)
  const eventType = event.type
  if (eventType === "message.completed") {
    assignTerminal({ messageId: event.message_id, runId: event.run_id })
    handlers.onTerminalEvent?.({ messageId: event.message_id, runId: event.run_id })
    handlers.onDoneStatusMarker?.({ messageId: event.message_id, runId: event.run_id })
    return true
  }
  if (eventType === "run.failed" || eventType === "run.cancelled" || eventType === "run.interrupted") {
    assignTerminal({ messageId: null, runId: event.run_id })
    handlers.onTerminalEvent?.({ messageId: null, runId: event.run_id })
    handlers.onDoneStatusMarker?.({ messageId: null, runId: event.run_id })
    return true
  }
  return true
}

/** Parse `__AI_STATUS__{...}` line: terminal events, done marker (no visible text), or transient status text. */
function processAiStatusInlinePayload(
  jsonPayload: string,
  handlers: ConsumeTextStreamHandlers,
  assignTerminal: (ev: AiStreamTerminalEvent) => void,
  gate: AiChatStatusSequenceGate,
): void {
  try {
    const parsed = JSON.parse(jsonPayload) as Record<string, unknown>
    if (!gate.shouldProcessStatusPayload(parsed)) return
    handlers.onAiStatusPayload?.(parsed)
    const eventType = typeof parsed.type === "string" ? parsed.type : null
    if (eventType && isV2RunTerminalEventType(eventType)) {
      processAiV2RunPayload(parsed, handlers, assignTerminal)
      return
    }
    if (eventType === "target.progress" || eventType === "ambiguous_target_confirmation_required") {
      processAiV2RunPayload(parsed, handlers, assignTerminal)
      return
    }
    if (isStreamDoneStatusPayload(parsed)) {
      console.debug("[ai-chat] done marker received (__AI_STATUS__)", {
        type: parsed.type,
        phase: parsed.phase,
      })
      const ev = extractTerminalEvent(parsed) ?? { messageId: null }
      assignTerminal(ev)
      handlers.onTerminalEvent?.(ev)
      handlers.onDoneStatusMarker?.(ev)
      return
    }

    const maybeTerminal = extractTerminalEvent(parsed)
    if (maybeTerminal) {
      assignTerminal(maybeTerminal)
      handlers.onTerminalEvent?.(maybeTerminal)
      return
    }

    emitStatusTextFromJson(jsonPayload, handlers)
  } catch {
    // ignore malformed
  }
}

function parseStreamNumericId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function parseStreamComponentId(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (value == null) return null
  const asString = String(value).trim()
  return asString.length > 0 ? asString : null
}

export function parseComponentEditPreviewEvent(
  parsed: Record<string, unknown>,
): AiChatComponentEditPreviewEvent | null {
  if (parsed.type !== "component_edit_preview") return null
  const phaseRaw = typeof parsed.phase === "string" ? parsed.phase : null
  if (
    phaseRaw !== "started"
    && phaseRaw !== "delta"
    && phaseRaw !== "completed"
    && phaseRaw !== "saved"
    && phaseRaw !== "failed"
  ) {
    return null
  }
  const taskId = parseStreamNumericId(parsed.task_id)
  const channelId = parseStreamNumericId(parsed.channel_id)
  const componentId = parseStreamComponentId(parsed.component_id)
  if (taskId == null || channelId == null || !componentId) return null
  const operation =
    parsed.operation === "replace" || parsed.operation === "append" ? parsed.operation : null
  const readOptionalString = (value: unknown): string | undefined =>
    typeof value === "string" ? value : undefined
  const beforeContentText =
    readOptionalString(parsed.before_content_text) ?? readOptionalString(parsed.base_content_text)
  const afterContentText = readOptionalString(parsed.after_content_text)
  const patches = parseComponentEditPatches(parsed.patches)
  const editStrategy =
    typeof parsed.edit_strategy === "string" && parsed.edit_strategy.trim().length > 0
      ? parsed.edit_strategy.trim()
      : null
  return {
    type: "component_edit_preview",
    phase: phaseRaw,
    ok: typeof parsed.ok === "boolean" ? parsed.ok : null,
    preview_key:
      typeof parsed.preview_key === "string" && parsed.preview_key.trim().length > 0
        ? parsed.preview_key.trim()
        : null,
    task_id: taskId,
    channel_id: channelId,
    component_id: componentId,
    component_title: typeof parsed.component_title === "string" ? parsed.component_title : undefined,
    task_component_output_id:
      typeof parsed.task_component_output_id === "string" ? parsed.task_component_output_id : null,
    operation,
    base_content_text: beforeContentText,
    before_content_text: beforeContentText,
    after_content_text: afterContentText,
    before_content_json: parsed.before_content_json,
    after_content_json: parsed.after_content_json ?? parsed.content_json,
    edit_strategy: editStrategy,
    patches,
    content_text: afterContentText ?? readOptionalString(parsed.content_text),
    content_text_delta:
      typeof parsed.content_text_delta === "string" ? parsed.content_text_delta : undefined,
    content_json: parsed.after_content_json ?? parsed.content_json,
    error_message: typeof parsed.error_message === "string" ? parsed.error_message : undefined,
  }
}

function parseComponentEditPatches(value: unknown): ComponentEditPatch[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: ComponentEditPatch[] = []
  for (const row of value) {
    if (!row || typeof row !== "object") continue
    out.push(row as ComponentEditPatch)
  }
  return out.length > 0 ? out : undefined
}

function parseChangePreviewChanges(value: unknown): AiChatChangePreviewChange[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: AiChatChangePreviewChange[] = []
  for (const row of value) {
    if (!row || typeof row !== "object") continue
    const record = row as Record<string, unknown>
    const field =
      typeof record.field === "string" && record.field.trim().length > 0
        ? record.field
        : null
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

function parseChangePreviewItems(value: unknown): AiChatChangePreviewItem[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: AiChatChangePreviewItem[] = []
  for (const row of value) {
    if (!row || typeof row !== "object") continue
    const record = row as Record<string, unknown>
    const label =
      typeof record.label === "string" && record.label.trim().length > 0 ? record.label : null
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

export function parseAiChangePreviewEvent(
  parsed: Record<string, unknown>,
): AiChatChangePreviewEvent | null {
  if (parsed.type !== "ai_change_preview") return null
  const phaseRaw = typeof parsed.phase === "string" ? parsed.phase : null
  if (
    phaseRaw !== "started"
    && phaseRaw !== "delta"
    && phaseRaw !== "completed"
    && phaseRaw !== "saved"
    && phaseRaw !== "failed"
  ) {
    return null
  }

  const entityType =
    typeof parsed.entity_type === "string" && parsed.entity_type.trim().length > 0
      ? parsed.entity_type
      : "generic"

  const changeId =
    typeof parsed.change_id === "string" && parsed.change_id.trim().length > 0
      ? parsed.change_id.trim()
      : ""

  const previewKey =
    typeof parsed.preview_key === "string" && parsed.preview_key.trim().length > 0
      ? parsed.preview_key.trim()
      : null

  const entityId =
    typeof parsed.entity_id === "string" || typeof parsed.entity_id === "number"
      ? parsed.entity_id
      : null

  // Card identity: change_id → preview_key → tool_name:entity_type:entity_id.
  const resolvedChangeId =
    changeId
    || previewKey
    || `${typeof parsed.tool_name === "string" ? parsed.tool_name : "?"}:${entityType}:${
      entityId ?? "?"
    }`

  return {
    type: "ai_change_preview",
    phase: phaseRaw,
    ok: typeof parsed.ok === "boolean" ? parsed.ok : parsed.ok === null ? null : undefined,
    change_id: resolvedChangeId,
    preview_key: previewKey,
    group_id:
      typeof parsed.group_id === "string" && parsed.group_id.trim().length > 0
        ? parsed.group_id.trim()
        : null,
    tool_name: typeof parsed.tool_name === "string" ? parsed.tool_name : null,
    round: parseStreamNumericId(parsed.round),
    entity_type: entityType,
    entity_id: entityId,
    task_id: parseStreamNumericId(parsed.task_id),
    channel_id: parseStreamNumericId(parsed.channel_id),
    project_id: parseStreamNumericId(parsed.project_id),
    component_id: parseStreamComponentId(parsed.component_id),
    task_component_output_id:
      typeof parsed.task_component_output_id === "string" ? parsed.task_component_output_id : null,
    operation: typeof parsed.operation === "string" ? parsed.operation : null,
    title: typeof parsed.title === "string" ? parsed.title : null,
    summary: typeof parsed.summary === "string" ? parsed.summary : null,
    reason: typeof parsed.reason === "string" ? parsed.reason : null,
    error: typeof parsed.error === "string" ? parsed.error : null,
    task_count: parseStreamNumericId(parsed.task_count),
    channel_count: parseStreamNumericId(parsed.channel_count),
    task_ids: Array.isArray(parsed.task_ids)
      ? parsed.task_ids
          .map((value) => parseStreamNumericId(value))
          .filter((value): value is number => value != null)
      : null,
    requires_clarification:
      parsed.requires_clarification === true
        ? true
        : parsed.requires_clarification === false
          ? false
          : null,
    no_build_created:
      parsed.no_build_created === true
        ? true
        : parsed.no_build_created === false
          ? false
          : null,
    clarification_reason:
      typeof parsed.clarification_reason === "string" ? parsed.clarification_reason : null,
    preview_items: parseChangePreviewItems(parsed.preview_items),
    changes: parseChangePreviewChanges(parsed.changes),
  }
}

export function parseContentSavedAction(parsed: Record<string, unknown>): AiChatContentSavedAction | null {
  if (parsed.type !== "content_saved") return null
  const taskId = typeof parsed.task_id === "number" ? parsed.task_id : Number(parsed.task_id)
  const channelId = typeof parsed.channel_id === "number" ? parsed.channel_id : Number(parsed.channel_id)
  if (!Number.isFinite(taskId) || !Number.isFinite(channelId)) return null
  const componentId =
    typeof parsed.component_id === "string" ? parsed.component_id : String(parsed.component_id ?? "")
  if (!componentId.trim()) return null
  const op = parsed.operation === "replace" || parsed.operation === "append" ? parsed.operation : null
  if (!op) return null
  const componentTitle = typeof parsed.component_title === "string" ? parsed.component_title : ""
  const previewText = typeof parsed.preview_text === "string" ? parsed.preview_text : ""
  const taskLink = typeof parsed.task_link === "string" ? parsed.task_link : ""
  const savedCount =
    typeof parsed.saved_count === "number" ? parsed.saved_count : Number(parsed.saved_count ?? 0)
  return {
    type: "content_saved",
    task_id: taskId,
    channel_id: channelId,
    component_id: componentId,
    component_title: componentTitle,
    operation: op,
    preview_text: previewText,
    task_link: taskLink,
    saved_count: Number.isFinite(savedCount) ? savedCount : 0,
  }
}

export function parseClarificationRequestAction(
  parsed: Record<string, unknown>,
): AiChatClarificationRequestAction | null {
  const type = typeof parsed.type === "string" ? parsed.type : null
  if (type !== "clarification_request" && type !== "clarification") return null
  const phase = typeof parsed.phase === "string" ? parsed.phase : null
  if (type === "clarification_request" && phase && phase !== "clarification") {
    return null
  }

  const question =
    (typeof parsed.question === "string" ? parsed.question.trim() : "")
    || (typeof parsed.message === "string" ? parsed.message.trim() : "")
  if (!question) return null

  const options: Array<Record<string, unknown>> = []
  if (Array.isArray(parsed.options)) {
    for (const row of parsed.options) {
      if (!row || typeof row !== "object") continue
      const record = row as Record<string, unknown>
      const id = typeof record.id === "string" ? record.id.trim() : ""
      const label =
        (typeof record.label === "string" ? record.label.trim() : "")
        || (typeof record.component_name === "string" ? record.component_name.trim() : "")
      if (!id || !label) continue
      options.push(record)
    }
  }

  const taggedRefs: AiChatClarificationRequestAction["tagged_task_component_refs"] = []
  if (Array.isArray(parsed.tagged_task_component_refs)) {
    for (const row of parsed.tagged_task_component_refs) {
      if (!row || typeof row !== "object") continue
      const record = row as Record<string, unknown>
      const refTaskId = parseStreamNumericId(record.task_id)
      const refChannelId = parseStreamNumericId(record.channel_id)
      const refComponentId = parseStreamComponentId(record.component_id)
      if (refTaskId == null || refChannelId == null || !refComponentId) continue
      taggedRefs.push({
        task_id: refTaskId,
        channel_id: refChannelId,
        component_id: refComponentId,
        component_title:
          typeof record.component_title === "string" ? record.component_title : undefined,
        task_title: typeof record.task_title === "string" ? record.task_title : undefined,
        channel_name: typeof record.channel_name === "string" ? record.channel_name : undefined,
      })
    }
  }

  const taskId = parseStreamNumericId(parsed.task_id)
  const channelId = parseStreamNumericId(parsed.channel_id ?? parsed.active_channel_id)
  const componentId = parseStreamComponentId(parsed.component_id)

  return {
    type: "clarification_request",
    phase: phase ?? "clarification",
    question,
    options,
    ...(Array.isArray(parsed.component_options)
      ? { component_options: parsed.component_options as Array<Record<string, unknown>> }
      : {}),
    ...(parsed.picker && typeof parsed.picker === "object"
      ? { picker: parsed.picker as Record<string, unknown> }
      : {}),
    allow_multiple: parsed.allow_multiple === true,
    min_selections:
      typeof parsed.min_selections === "number" && Number.isFinite(parsed.min_selections)
        ? parsed.min_selections
        : null,
    max_selections:
      typeof parsed.max_selections === "number" && Number.isFinite(parsed.max_selections)
        ? parsed.max_selections
        : null,
    allow_free_text: parsed.allow_free_text === true,
    ...(Object.prototype.hasOwnProperty.call(parsed, "pending_request")
      ? { pending_request: parsed.pending_request }
      : {}),
    request_plan_id: (() => {
      if (typeof parsed.request_plan_id === "string" && parsed.request_plan_id.trim()) {
        return parsed.request_plan_id.trim()
      }
      const pending =
        parsed.pending_request && typeof parsed.pending_request === "object"
          ? (parsed.pending_request as Record<string, unknown>)
          : null
      return typeof pending?.request_plan_id === "string" && pending.request_plan_id.trim()
        ? pending.request_plan_id.trim()
        : null
    })(),
    task_id: taskId,
    channel_id: channelId,
    component_id: componentId,
    task_component_output_id:
      typeof parsed.task_component_output_id === "string" ? parsed.task_component_output_id : null,
    target_scope:
      typeof parsed.target_scope === "string" && parsed.target_scope.trim().length > 0
        ? parsed.target_scope.trim()
        : null,
    selected_component_label:
      typeof parsed.selected_component_label === "string" ? parsed.selected_component_label : null,
    ...(taggedRefs.length > 0 ? { tagged_task_component_refs: taggedRefs } : {}),
  }
}

function processAiActionJsonPayload(jsonPayload: string, handlers: ConsumeTextStreamHandlers): void {
  try {
    const parsed = JSON.parse(jsonPayload) as Record<string, unknown>
    const t = typeof parsed.type === "string" ? parsed.type : null
    if (t === "content_saved") {
      const action = parseContentSavedAction(parsed)
      if (action) {
        console.debug("[ai-chat] __AI_ACTION__ content_saved", {
          task_id: action.task_id,
          channel_id: action.channel_id,
          component_id: action.component_id,
        })
        handlers.onAiAction?.(action)
      }
      return
    }
    if (t === "clarification_request" || t === "clarification") {
      const action = parseClarificationRequestAction(parsed)
      if (action) {
        console.debug("[ai-chat] __AI_ACTION__ clarification_request", {
          task_id: action.task_id ?? null,
          channel_id: action.channel_id ?? null,
          component_id: action.component_id ?? null,
          option_count: action.options.length,
          allow_free_text: action.allow_free_text === true,
          allow_multiple: action.allow_multiple === true,
        })
        handlers.onAiAction?.(action)
      }
      return
    }
    if (t === "component_edit_preview") {
      const event = parseComponentEditPreviewEvent(parsed)
      if (event) handlers.onComponentEditPreviewEvent?.(event)
      return
    }
    if (t === "ai_change_preview") {
      const event = parseAiChangePreviewEvent(parsed)
      if (event) handlers.onAiChangePreviewEvent?.(event)
      return
    }
    console.debug("[ai-chat] __AI_ACTION__ unknown type", { type: t })
  } catch {
    /* ignore malformed */
  }
}

function parseThreadTitleEvent(parsed: Record<string, unknown>): AiChatThreadTitleEvent | null {
  if (parsed.type !== "thread_title") return null
  const phase = typeof parsed.phase === "string" ? parsed.phase : null
  if (phase === "started") {
    return { type: "thread_title", phase: "started" }
  }
  if (phase === "delta") {
    const delta = typeof parsed.delta === "string" ? parsed.delta : ""
    return { type: "thread_title", phase: "delta", delta }
  }
  if (phase === "completed") {
    if (parsed.title === null) {
      return { type: "thread_title", phase: "completed", title: null }
    }
    const title = typeof parsed.title === "string" ? parsed.title : undefined
    return { type: "thread_title", phase: "completed", title }
  }
  return null
}

function processAiThreadTitleJsonPayload(
  jsonPayload: string,
  handlers: ConsumeTextStreamHandlers
): void {
  try {
    const parsed = JSON.parse(jsonPayload) as Record<string, unknown>
    const event = parseThreadTitleEvent(parsed)
    if (!event) return
    handlers.onThreadTitleEvent?.(event)
  } catch {
    /* ignore malformed */
  }
}

function extractTerminalEvent(payload: unknown): AiStreamTerminalEvent | null {
  if (!payload || typeof payload !== "object") return null
  const value = payload as Record<string, unknown>
  const eventType = typeof value.type === "string" ? value.type : null
  if (eventType === "message.completed") {
    const runId = typeof value.run_id === "string" ? value.run_id : null
    const messageId = typeof value.message_id === "string" ? value.message_id : null
    if (!runId || !messageId) return null
    return { messageId, runId }
  }
  if (eventType === "run.failed" || eventType === "run.cancelled") {
    const runId = typeof value.run_id === "string" ? value.run_id : null
    if (!runId) return null
    return { messageId: null, runId }
  }
  const terminalTypes = new Set(["done", "complete", "final", "message_saved"])
  if (!eventType || !terminalTypes.has(eventType)) return null
  const messageFromObject =
    typeof value.message === "object" && value.message
      ? (value.message as Record<string, unknown>).id
      : undefined
  const messageId =
    (typeof value.message_id === "string" ? value.message_id : undefined) ??
    (typeof value.final_message_id === "string" ? value.final_message_id : undefined) ??
    (typeof messageFromObject === "string" ? messageFromObject : undefined) ??
    null
  return { messageId }
}

function extractTextChunk(payload: unknown): string | null {
  if (typeof payload === "string") return payload
  if (!payload || typeof payload !== "object") return null
  const value = payload as Record<string, unknown>
  if (typeof value.delta === "string") return value.delta
  if (typeof value.content === "string") return value.content
  if (typeof value.text === "string") return value.text
  if (typeof value.token === "string") return value.token
  return null
}

export async function consumeTextStream(
  response: Response,
  handlers: ConsumeTextStreamHandlers
): Promise<{ fullText: string; rawText: string; terminal: AiStreamTerminalEvent | null }> {
  if (!response.body) {
    return { fullText: "", rawText: "", terminal: null }
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
  const isSse = contentType.includes("text/event-stream")
  const isJsonContentType = contentType.includes("application/json")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ""
  let rawText = ""
  let terminal: AiStreamTerminalEvent | null = null
  let sseBuffer = ""
  let bufferedJsonText = ""
  let hasSwitchedFromJsonToPlainText = false
  let mixedPlainBuffer = ""
  const statusSequenceGate = createAiChatStatusSequenceGate()

  const emitText = (chunk: string) => {
    if (!chunk) return
    const visibleChunk = chunk.replace(ASSET_PLACEHOLDER_PATTERN, "")
    if (!visibleChunk) return
    fullText += visibleChunk
    handlers.onTextChunk(visibleChunk)
  }

  const processMixedPlainBuffer = (chunk: string, options?: { flushFinal: boolean }) => {
    if (chunk) mixedPlainBuffer += chunk
    const flushFinal = options?.flushFinal ?? false

    while (mixedPlainBuffer.length > 0) {
      const statusIdx = mixedPlainBuffer.indexOf(AI_STATUS_PREFIX)
      const actionIdx = mixedPlainBuffer.indexOf(AI_ACTION_PREFIX)
      const pendingActionIdx = mixedPlainBuffer.indexOf(AI_PENDING_ACTION_PREFIX)
      const threadTitleIdx = mixedPlainBuffer.indexOf(AI_THREAD_TITLE_PREFIX)
      const assetIdx = mixedPlainBuffer.indexOf(AI_ASSET_PREFIX)
      const componentOutputIdx = mixedPlainBuffer.indexOf(AI_COMPONENT_OUTPUT_PREFIX)
      const componentEditPreviewIdx = mixedPlainBuffer.indexOf(AI_COMPONENT_EDIT_PREVIEW_PREFIX)
      const changePreviewIdx = mixedPlainBuffer.indexOf(AI_CHANGE_PREVIEW_PREFIX)
      const componentLibraryTraceIdx = mixedPlainBuffer.indexOf(AI_COMPONENT_LIBRARY_TRACE_PREFIX)
      const componentPlanTraceIdx = mixedPlainBuffer.indexOf(AI_COMPONENT_PLAN_TRACE_PREFIX)
      const requestPlanIdx = mixedPlainBuffer.indexOf(AI_REQUEST_PLAN_PREFIX)
      const executionTraceIdx = mixedPlainBuffer.indexOf(AI_EXECUTION_TRACE_PREFIX)
      const messageOutputIdx = mixedPlainBuffer.indexOf(AI_MESSAGE_OUTPUT_PREFIX)

      let sentinelIndex = -1
      let kind:
        | "status"
        | "action"
        | "thread_title"
        | "asset"
        | "component_output"
        | "component_edit_preview"
        | "change_preview"
        | "component_library_trace"
        | "component_plan_trace"
        | "request_plan"
        | "execution_trace"
        | "message_output"
        | null = null
      const candidates: Array<{
        idx: number
        kind:
          | "status"
          | "action"
          | "thread_title"
          | "asset"
          | "component_output"
          | "component_edit_preview"
          | "change_preview"
          | "component_library_trace"
          | "component_plan_trace"
          | "request_plan"
          | "execution_trace"
          | "message_output"
      }> = []
      if (statusIdx >= 0) candidates.push({ idx: statusIdx, kind: "status" })
      if (actionIdx >= 0) candidates.push({ idx: actionIdx, kind: "action" })
      if (pendingActionIdx >= 0) candidates.push({ idx: pendingActionIdx, kind: "action" })
      if (threadTitleIdx >= 0) candidates.push({ idx: threadTitleIdx, kind: "thread_title" })
      if (assetIdx >= 0) candidates.push({ idx: assetIdx, kind: "asset" })
      if (componentOutputIdx >= 0) candidates.push({ idx: componentOutputIdx, kind: "component_output" })
      if (componentEditPreviewIdx >= 0) {
        candidates.push({ idx: componentEditPreviewIdx, kind: "component_edit_preview" })
      }
      if (changePreviewIdx >= 0) {
        candidates.push({ idx: changePreviewIdx, kind: "change_preview" })
      }
      if (componentLibraryTraceIdx >= 0) {
        candidates.push({ idx: componentLibraryTraceIdx, kind: "component_library_trace" })
      }
      if (componentPlanTraceIdx >= 0) {
        candidates.push({ idx: componentPlanTraceIdx, kind: "component_plan_trace" })
      }
      if (requestPlanIdx >= 0) {
        candidates.push({ idx: requestPlanIdx, kind: "request_plan" })
      }
      if (executionTraceIdx >= 0) {
        candidates.push({ idx: executionTraceIdx, kind: "execution_trace" })
      }
      if (messageOutputIdx >= 0) candidates.push({ idx: messageOutputIdx, kind: "message_output" })
      if (candidates.length > 0) {
        candidates.sort((a, b) => a.idx - b.idx)
        sentinelIndex = candidates[0].idx
        kind = candidates[0].kind
      }

      if (sentinelIndex < 0) {
        if (flushFinal) {
          emitText(mixedPlainBuffer)
          mixedPlainBuffer = ""
          return
        }
        const hold = Math.max(
          maxSuffixMatchingSentinelPrefix(mixedPlainBuffer, AI_STATUS_PREFIX),
          maxSuffixMatchingSentinelPrefix(mixedPlainBuffer, AI_ACTION_PREFIX),
          maxSuffixMatchingSentinelPrefix(mixedPlainBuffer, AI_PENDING_ACTION_PREFIX),
          maxSuffixMatchingSentinelPrefix(mixedPlainBuffer, AI_THREAD_TITLE_PREFIX),
          maxSuffixMatchingSentinelPrefix(mixedPlainBuffer, AI_ASSET_PREFIX),
          maxSuffixMatchingSentinelPrefix(mixedPlainBuffer, AI_COMPONENT_OUTPUT_PREFIX),
          maxSuffixMatchingSentinelPrefix(mixedPlainBuffer, AI_COMPONENT_EDIT_PREVIEW_PREFIX),
          maxSuffixMatchingSentinelPrefix(mixedPlainBuffer, AI_CHANGE_PREVIEW_PREFIX),
          maxSuffixMatchingSentinelPrefix(mixedPlainBuffer, AI_COMPONENT_LIBRARY_TRACE_PREFIX),
          maxSuffixMatchingSentinelPrefix(mixedPlainBuffer, AI_COMPONENT_PLAN_TRACE_PREFIX),
          maxSuffixMatchingSentinelPrefix(mixedPlainBuffer, AI_REQUEST_PLAN_PREFIX),
          maxSuffixMatchingSentinelPrefix(mixedPlainBuffer, AI_EXECUTION_TRACE_PREFIX),
          maxSuffixMatchingSentinelPrefix(mixedPlainBuffer, AI_MESSAGE_OUTPUT_PREFIX)
        )
        const safeFlushLength = mixedPlainBuffer.length - hold
        if (safeFlushLength > 0) {
          emitText(mixedPlainBuffer.slice(0, safeFlushLength))
          mixedPlainBuffer = mixedPlainBuffer.slice(safeFlushLength)
        }
        return
      }

      if (sentinelIndex > 0) {
        emitText(mixedPlainBuffer.slice(0, sentinelIndex))
        mixedPlainBuffer = mixedPlainBuffer.slice(sentinelIndex)
      }

      const prefix =
        kind === "status"
          ? AI_STATUS_PREFIX
          : kind === "action"
            ? (mixedPlainBuffer.startsWith(AI_PENDING_ACTION_PREFIX)
              ? AI_PENDING_ACTION_PREFIX
              : AI_ACTION_PREFIX)
            : kind === "thread_title"
              ? AI_THREAD_TITLE_PREFIX
              : kind === "asset"
                ? AI_ASSET_PREFIX
                : kind === "component_output"
                  ? AI_COMPONENT_OUTPUT_PREFIX
                  : kind === "component_edit_preview"
                    ? AI_COMPONENT_EDIT_PREVIEW_PREFIX
                    : kind === "change_preview"
                      ? AI_CHANGE_PREVIEW_PREFIX
                      : kind === "component_library_trace"
                        ? AI_COMPONENT_LIBRARY_TRACE_PREFIX
                        : kind === "component_plan_trace"
                          ? AI_COMPONENT_PLAN_TRACE_PREFIX
                          : kind === "request_plan"
                            ? AI_REQUEST_PLAN_PREFIX
                            : kind === "execution_trace"
                              ? AI_EXECUTION_TRACE_PREFIX
                              : AI_MESSAGE_OUTPUT_PREFIX
      if (mixedPlainBuffer.length < prefix.length) return

      let cursor = prefix.length
      while (cursor < mixedPlainBuffer.length && /\s/.test(mixedPlainBuffer[cursor])) {
        cursor += 1
      }
      if (cursor >= mixedPlainBuffer.length) return

      if (mixedPlainBuffer[cursor] !== "{") {
        mixedPlainBuffer = mixedPlainBuffer.slice(prefix.length)
        continue
      }

      const parsedObject = parseTopLevelJsonObject(mixedPlainBuffer, cursor)
      if (parsedObject.status === "incomplete") return

      if (kind === "status") {
        processAiStatusInlinePayload(parsedObject.raw, handlers, (ev) => {
          terminal = ev
        }, statusSequenceGate)
      } else if (kind === "action") {
        processAiActionJsonPayload(parsedObject.raw, handlers)
      } else if (kind === "thread_title") {
        processAiThreadTitleJsonPayload(parsedObject.raw, handlers)
      } else if (kind === "asset") {
        processAiAssetJsonPayload(parsedObject.raw, handlers)
      } else if (kind === "component_output") {
        processAiComponentOutputJsonPayload(parsedObject.raw, handlers)
      } else if (kind === "component_edit_preview") {
        processAiComponentEditPreviewJsonPayload(parsedObject.raw, handlers)
      } else if (kind === "change_preview") {
        processAiChangePreviewJsonPayload(parsedObject.raw, handlers)
      } else if (kind === "component_library_trace") {
        processAiComponentLibraryTraceJsonPayload(parsedObject.raw, handlers)
      } else if (kind === "component_plan_trace") {
        processAiComponentPlanTraceJsonPayload(parsedObject.raw, handlers)
      } else if (kind === "request_plan") {
        processAiRequestPlanJsonPayload(parsedObject.raw, handlers)
      } else if (kind === "execution_trace") {
        processAiExecutionTraceJsonPayload(parsedObject.raw, handlers)
      } else {
        processAiMessageOutputJsonPayload(parsedObject.raw, handlers)
      }

      let consumeUntil = parsedObject.endIndexExclusive
      if (mixedPlainBuffer[consumeUntil] === "\r" && mixedPlainBuffer[consumeUntil + 1] === "\n") {
        consumeUntil += 2
      } else if (mixedPlainBuffer[consumeUntil] === "\n") {
        consumeUntil += 1
      }
      mixedPlainBuffer = mixedPlainBuffer.slice(consumeUntil)
    }
  }

  const handleSseBlock = (rawBlock: string) => {
    const lines = rawBlock.split("\n")
    const dataLines = lines
      .map((line) => line.trimEnd())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
    if (dataLines.length === 0) return
    const payloadText = dataLines.join("\n")
    if (payloadText === "[DONE]") return
    try {
      const parsed = JSON.parse(payloadText) as unknown
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const po = parsed as Record<string, unknown>
        if (po.type === "content_saved") {
          const action = parseContentSavedAction(po)
          if (action) {
            console.debug("[ai-chat] SSE content_saved action", {
              task_id: action.task_id,
              channel_id: action.channel_id,
            })
            handlers.onAiAction?.(action)
          }
          return
        }
        if (po.type === "component_edit_preview") {
          const event = parseComponentEditPreviewEvent(po)
          if (event) handlers.onComponentEditPreviewEvent?.(event)
          return
        }
        if (po.type === "ai_change_preview") {
          const event = parseAiChangePreviewEvent(po)
          if (event) handlers.onAiChangePreviewEvent?.(event)
          return
        }
        if (po.type === "thread_title") {
          const event = parseThreadTitleEvent(po)
          if (event) handlers.onThreadTitleEvent?.(event)
          return
        }
        if (po.type === "asset") {
          handlers.onAssetEvent?.(po)
          return
        }
        if (po.type === "component_output") {
          handlers.onComponentOutputEvent?.(po)
          return
        }
        if (po.type === "component_library_trace") {
          handlers.onComponentLibraryTraceEvent?.(po)
          return
        }
        if (po.type === "component_plan_trace") {
          handlers.onComponentPlanTraceEvent?.(po)
          return
        }
        if (po.type === "request_plan") {
          handlers.onRequestPlanEvent?.(po)
          return
        }
        if (po.type === "execution_trace") {
          handlers.onExecutionTraceEvent?.(po)
          return
        }
        if (po.type === "message_output") {
          handlers.onMessageOutputEvent?.(po)
          return
        }
        if (po.type === "clarification_request" || po.type === "clarification") {
          const action = parseClarificationRequestAction(po)
          if (action) {
            handlers.onAiAction?.(action)
          }
          return
        }
        const v2Event = parseAiChatV2RunEvent(po)
        if (v2Event) {
          processAiV2RunPayload(po, handlers, (ev) => {
            terminal = ev
          }, statusSequenceGate)
          return
        }
      }
      const maybeTerminal = extractTerminalEvent(parsed)
      if (maybeTerminal) {
        terminal = maybeTerminal
        handlers.onTerminalEvent?.(maybeTerminal)
        if (isStreamDoneStatusPayload(parsed as Record<string, unknown>)) {
          console.debug("[ai-chat] done marker received (SSE)", {
            type: (parsed as Record<string, unknown>).type,
            phase: (parsed as Record<string, unknown>).phase,
          })
          handlers.onDoneStatusMarker?.(maybeTerminal)
        }
        return
      }
      const chunk = extractTextChunk(parsed)
      if (chunk) processMixedPlainBuffer(chunk)
      return
    } catch {
      processMixedPlainBuffer(payloadText)
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      const chunkText = decoder.decode(value, { stream: true })
      if (!chunkText) continue
      rawText += chunkText

      if (!isSse) {
        if (!isJsonContentType || hasSwitchedFromJsonToPlainText) {
          processMixedPlainBuffer(chunkText)
          continue
        }

        // Some backends can mislabel streamed plain text as JSON.
        // If payload does not look like JSON, switch to incremental plain-text mode.
        bufferedJsonText += chunkText
        const trimmed = bufferedJsonText.trimStart()
        if (!trimmed) continue
        const looksLikeJsonEnvelope = trimmed.startsWith("{") || trimmed.startsWith("[")
        if (!looksLikeJsonEnvelope) {
          hasSwitchedFromJsonToPlainText = true
          processMixedPlainBuffer(bufferedJsonText)
          bufferedJsonText = ""
        }
        continue
      }

      sseBuffer += chunkText
      let separatorIndex = sseBuffer.indexOf("\n\n")
      while (separatorIndex >= 0) {
        const block = sseBuffer.slice(0, separatorIndex)
        sseBuffer = sseBuffer.slice(separatorIndex + 2)
        handleSseBlock(block)
        separatorIndex = sseBuffer.indexOf("\n\n")
      }
    }
  } catch {
    // Aborted fetch / broken stream: flush buffered characters so partial replies are not dropped.
    if (!isSse && (!isJsonContentType || hasSwitchedFromJsonToPlainText)) {
      processMixedPlainBuffer("", { flushFinal: true })
    }
    if (!isSse && isJsonContentType && !hasSwitchedFromJsonToPlainText && bufferedJsonText.length > 0) {
      hasSwitchedFromJsonToPlainText = true
      processMixedPlainBuffer(bufferedJsonText)
      bufferedJsonText = ""
      processMixedPlainBuffer("", { flushFinal: true })
    }
  }

  if (isSse && sseBuffer.trim()) {
    handleSseBlock(sseBuffer)
  }

  const trailing = decoder.decode()
  if (trailing) {
    rawText += trailing
    if (!isSse) {
      if (!isJsonContentType || hasSwitchedFromJsonToPlainText) {
        processMixedPlainBuffer(trailing)
      } else {
        bufferedJsonText += trailing
      }
    }
  }

  if (!isSse && (!isJsonContentType || hasSwitchedFromJsonToPlainText)) {
    processMixedPlainBuffer("", { flushFinal: true })
  }

  // Mis-labeled JSON streams: never emit incremental text while flagged as JSON — flush remainder as plain.
  if (!isSse && isJsonContentType && !hasSwitchedFromJsonToPlainText && bufferedJsonText.length > 0) {
    hasSwitchedFromJsonToPlainText = true
    processMixedPlainBuffer(bufferedJsonText)
    bufferedJsonText = ""
    processMixedPlainBuffer("", { flushFinal: true })
  }

  return { fullText, rawText, terminal }
}

/**
 * Call the ai-chat Edge Function
 * For all interactive UI uses, autoRun should be false (default)
 */
export async function callAiChat(opts: {
  supabase: ReturnType<typeof createClientComponentClient>
  threadId: string
  message?: string | null
  activeChannelId?: number | null
  mode?: "build_component" | "build_briefing"
  componentId?: string | null
  modelKey?: string | null
  autoRun?: boolean
  attachments?: AiChatRequest['attachments']
  taggedTaskIds?: number[]
  taggedProjectIds?: number[]
  taggedUserIds?: number[]
  taggedChannelIds?: number[]
}): Promise<AiChatResponse> {
  const {
    supabase,
    threadId,
    message = "",
    activeChannelId = null,
    mode,
    componentId,
    modelKey = "auto",
    autoRun = false,
    attachments = [],
    taggedTaskIds = [],
    taggedProjectIds = [],
    taggedUserIds = [],
    taggedChannelIds = [],
  } = opts

  const { data, error } = await supabase.functions.invoke("ai-chat", {
    body: {
      thread_id: threadId,
      message,
      active_channel_id: activeChannelId,
      mode,
      component_id: componentId,
      model_key: modelKey ?? "auto",
      auto_run: autoRun,
      attachments,
      tagged_task_ids: taggedTaskIds,
      tagged_project_ids: taggedProjectIds,
      tagged_user_ids: taggedUserIds,
      ...(taggedChannelIds.length > 0 ? { tagged_channel_ids: taggedChannelIds } : {}),
    },
  })

  if (error) {
    console.error("AI chat error:", error)
    throw error
  }

  return data as AiChatResponse
}


