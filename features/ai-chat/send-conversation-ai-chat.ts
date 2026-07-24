"use client"

import {
  consumeTextStream,
  type AiStreamTerminalEvent,
  type AiChatStreamAction,
  type AiChatThreadTitleEvent,
  type AiChatAssetEvent,
  type AiChatComponentOutputEvent,
  type AiChatMessageOutputEvent,
  type AiChatComponentEditPreviewEvent,
  type AiChatChangePreviewEvent,
  type AiChatComponentLibraryTraceEvent,
  type AiChatComponentPlanTraceEvent,
  type AiChatExecutionTraceEvent,
  type AiChatRequestPlanEvent,
} from "../../app/lib/ai/chat"
import { getSupabaseBrowser } from "../../lib/supabase-browser"
import { invokeEdgeFunctionFetch } from "@/lib/edge-functions"
import type { AiAttachmentMeta, InFlightAiTurnMeta } from "./types"
import type { AiChatV2RequestFields } from "../../app/lib/ai/ai-chat-v2-types"
import {
  extractRunIdFromJsonBody,
  extractRunIdFromResponse,
  fetchAiChatRun,
  isRequestIdReusedError,
  reconcileRunStatusToTerminal,
} from "./ai-chat-run-api"
import {
  reduceRunTerminalState,
  shouldUseLegacyStreamCompletion,
  terminalStateFromV2Event,
} from "./ai-run-terminal"
import type { AiRunTerminalState, AiChatUsageSnapshot } from "../../app/lib/ai/ai-chat-v2-types"
import type { AiChatV2RunEvent } from "../../app/lib/ai/chat"
import {
  isRealTaskComponentOutputId,
  isWritableComponentId,
  type TaggedTaskChannelRef,
  type TaggedTaskComponentRef,
} from "./build-ai-chat-tagged-refs"
import type { AiAmbientContext, AiContextSource, AiSelectedContextType } from "./ai-target-context"
import { DEFAULT_AI_CHAT_MODEL_KEY, type AiChatModelKey } from "./ai-chat-model-selection"
import {
  selectedContextTypeForSource,
  type AiSelectedTextContext,
} from "./ai-chat-text-selection"
import type {
  ArtifactSelectedContextType,
  SelectedArtifactContext,
} from "../../app/lib/artifacts/artifact-types"
import { parseAiChatErrorPayload } from "./ai-chat-usage"
import {
  createAiChatRunDiagnosticsTracker,
  logAiChatRunDiagnostics,
} from "./ai-chat-run-diagnostics"
import { useAiRunProgressStore } from "../../app/store/ai-run-progress-store"

export type SendConversationAiChatStreamCallbacks = {
  onOptimistic?: (temp: { id: string; content: string; attachments?: AiAttachmentMeta[] }) => void
  onAssistantStreamStart?: (temp: { id: string; content: string }) => void
  onAssistantStreamChunk?: (tempId: string, chunk: string) => void
  onAssistantStreamStatus?: (tempId: string, statusText: string | null) => void
  onAssistantStreamComplete?: (tempId: string, payload: { content?: string; messageId?: string | null }) => void
  onAssistantStreamError?: (tempId: string) => void
  /**
   * Fired once when assistant streaming is fully finalized in the UI (done marker or stream end),
   * so the host can clear generating state before the HTTP response body finishes draining.
   */
  onAssistantStreamIdle?: () => void
  /** Structured stream actions (`__AI_ACTION__`, SSE JSON) — e.g. `content_saved`. */
  onAiChatAction?: (action: AiChatStreamAction) => void
  /** Streamed thread title records (`__AI_THREAD_TITLE__`). */
  onThreadTitleEvent?: (tempId: string, event: AiChatThreadTitleEvent) => void
  /** Streamed asset payload (`__AI_ASSET__`) for inline rendering. */
  onAssetEvent?: (tempId: string, event: AiChatAssetEvent) => void
  /** Final build-component payload (`__AI_COMPONENT_OUTPUT__`). */
  onComponentOutputEvent?: (tempId: string, event: AiChatComponentOutputEvent) => void
  /** Final assistant message payload (`__AI_MESSAGE_OUTPUT__`). */
  onMessageOutputEvent?: (tempId: string, event: AiChatMessageOutputEvent) => void
  /** Incremental component output preview (`component_edit_preview`). */
  onComponentEditPreviewEvent?: (tempId: string, event: AiChatComponentEditPreviewEvent) => void
  /** Generic write-action preview (`ai_change_preview`). */
  onAiChangePreviewEvent?: (tempId: string, event: AiChatChangePreviewEvent) => void
  /** Component library source summary (`__AI_COMPONENT_LIBRARY_TRACE__`). */
  onComponentLibraryTraceEvent?: (tempId: string, event: AiChatComponentLibraryTraceEvent) => void
  /** Incremental component structure decision (`__AI_COMPONENT_PLAN_TRACE__`). */
  onComponentPlanTraceEvent?: (tempId: string, event: AiChatComponentPlanTraceEvent) => void
  /** Request Plan V3 execution audit (`__AI_REQUEST_PLAN__`). */
  onRequestPlanEvent?: (tempId: string, event: AiChatRequestPlanEvent) => void
  /** Progressive execution timeline (`__AI_EXECUTION_TRACE__`). */
  onExecutionTraceEvent?: (tempId: string, event: AiChatExecutionTraceEvent) => void
  /** Protocol V2 run events (terminal state, target progress, ambiguity). */
  onAiChatV2RunEvent?: (tempId: string, event: AiChatV2RunEvent) => void
  /** Captured immediately from response headers / JSON before the stream body is consumed. */
  onRunId?: (tempId: string, runId: string) => void
  /** V2 durable terminal state for the in-flight turn. */
  onRunTerminalState?: (tempId: string, state: AiRunTerminalState) => void
  /** Latest usage snapshot from stream events, errors, or reconcile. */
  onUsageUpdate?: (usage: AiChatUsageSnapshot | null) => void
}

export type SendConversationAiChatStreamArgs = {
  threadId: string
  message: string
  /** Short user-facing label persisted/shown in chat history (full `message` still used for generation). */
  displayMessage?: string | null
  /** Structured user message metadata for pills / mention tags (persisted in content_json). */
  userMessageContentJson?: Record<string, unknown> | null
  attachments: AiAttachmentMeta[]
  activeChannelId: number | null
  taggedTaskIds: number[]
  taggedProjectIds: number[]
  taggedUserIds: number[]
  /** Structured channel scope (`#Blog`). Preferred over combined tagged_task_channel_refs. */
  taggedChannelIds?: number[]
  /** Optional — backend prefers tagged_task_component_refs[0] then tagged_task_channel_refs[0]. */
  taggedTaskChannelRefs?: TaggedTaskChannelRef[]
  taggedTaskComponentRefs?: TaggedTaskComponentRef[]
  mode: "build_component" | "build_briefing" | "assistant_only" | null
  componentId: string | null
  taskId?: number | null
  channelId?: number | null
  taskComponentOutputId?: string | null
  selectedContextType?: AiSelectedContextType | null
  selectedComponentLabel?: string | null
  contextSource?: AiContextSource | null
  ambientContext?: AiAmbientContext | null
  /** Friendly model selection; backend maps this to provider/model ids. Defaults to "auto". */
  modelKey?: AiChatModelKey | null
  /** Highlighted source text ("Ask/Edit selected text with AI"). Source material, not a write instruction. */
  selectedTextContext?: AiSelectedTextContext | null
  /** Artifact selection context (text/block/media). Source material, not an automatic edit. */
  selectedArtifactContext?: SelectedArtifactContext | null
  selectedArtifactContextType?: ArtifactSelectedContextType | null
  autoRun: boolean
  stream: boolean
  clarificationResponse?: {
    clarification_message_id?: string | null
    request_plan_id?: string | null
    selected_option?: string | null
    selected_options?: string[]
    free_text?: string | null
    value?: unknown
    entity_ref?: unknown
  } | null
  /** When false (e.g. user edited an existing message), skip the optimistic user row — DB already has the user message. */
  includeOptimisticUser?: boolean
  /** Stable id generated once per user send; reused for retry/reconnect of the same turn. */
  clientRequestId?: string | null
  /** Protocol V2 request fields (`protocol_version`, `targets`, `scope`, …). */
  v2Request?: AiChatV2RequestFields | null
  /** Optional mutable turn metadata shared with the host for cancel/reconcile. */
  inFlightTurn?: InFlightAiTurnMeta | null
  signal?: AbortSignal
} & SendConversationAiChatStreamCallbacks

/**
 * POST ai-chat and consume a streaming (or JSON) response — same contract as {@link Composer} `runSend`.
 */
export async function sendConversationAiChatStream(args: SendConversationAiChatStreamArgs): Promise<void> {
  const {
    threadId,
    message,
    displayMessage,
    userMessageContentJson,
    attachments,
    activeChannelId,
    taggedTaskIds,
    taggedProjectIds,
    taggedUserIds,
    taggedChannelIds,
    taggedTaskChannelRefs,
    taggedTaskComponentRefs,
    mode,
    componentId,
    taskId,
    channelId,
    taskComponentOutputId,
    selectedContextType,
    selectedComponentLabel,
    contextSource,
    ambientContext,
    modelKey,
    selectedTextContext,
    selectedArtifactContext,
    selectedArtifactContextType,
    autoRun,
    stream,
    clarificationResponse,
    includeOptimisticUser = true,
    clientRequestId,
    v2Request,
    inFlightTurn,
    onOptimistic,
    onAssistantStreamStart,
    onAssistantStreamChunk,
    onAssistantStreamStatus,
    onAssistantStreamComplete,
    onAssistantStreamError,
    onAssistantStreamIdle,
    onAiChatAction,
    onThreadTitleEvent,
    onAssetEvent,
    onComponentOutputEvent,
    onMessageOutputEvent,
    onComponentEditPreviewEvent,
    onAiChangePreviewEvent,
    onComponentLibraryTraceEvent,
    onComponentPlanTraceEvent,
    onRequestPlanEvent,
    onExecutionTraceEvent,
    onAiChatV2RunEvent,
    onRunId,
    onRunTerminalState,
    onUsageUpdate,
    signal,
  } = args

  const trimmed = message.trim()
  if (!trimmed && attachments.length === 0) return
  const trimmedDisplayMessage = displayMessage?.trim() || trimmed
  const resolvedUserContentJson =
    userMessageContentJson && typeof userMessageContentJson === "object"
      ? {
          ...userMessageContentJson,
          ...(trimmedDisplayMessage ? { display_message: trimmedDisplayMessage } : {}),
          ...(trimmed !== trimmedDisplayMessage ? { internal_message: trimmed } : {}),
        }
      : trimmedDisplayMessage !== trimmed
        ? {
            display_message: trimmedDisplayMessage,
            internal_message: trimmed,
          }
        : null

  // The FE never sends non-write-target ids as write fields. Briefing/global aliases (`g:5`) and
  // bare numeric ids are dropped from write-oriented component fields; only real
  // `task_component_outputs.id` UUIDs may be sent as task_component_output_id.
  const writableComponentId = isWritableComponentId(componentId) ? componentId : null
  const writableTaskComponentOutputId = isRealTaskComponentOutputId(taskComponentOutputId ?? null)
    ? (taskComponentOutputId as string)
    : null
  const writableTaggedTaskComponentRefs = (taggedTaskComponentRefs ?? []).filter((ref) =>
    isWritableComponentId(ref.component_id),
  )

  // Sanitize highlighted-text context: never leak g:* aliases, "title", or numeric ids as
  // component_id/output_id — only real task_channel_components.id / task_component_outputs.id UUIDs.
  const sanitizedSelectedTextContext: AiSelectedTextContext | null = (() => {
    if (!selectedTextContext || !selectedTextContext.selected_text?.trim()) return null
    const next: AiSelectedTextContext = { ...selectedTextContext }
    if (next.component_id != null && !isWritableComponentId(next.component_id)) {
      delete next.component_id
    }
    if (next.task_component_output_id != null && !isRealTaskComponentOutputId(next.task_component_output_id)) {
      delete next.task_component_output_id
    }
    return next
  })()
  const selectedTextContextType = sanitizedSelectedTextContext
    ? selectedContextTypeForSource(sanitizedSelectedTextContext.source_type)
    : null

  const sanitizedSelectedArtifactContext = (() => {
    if (!selectedArtifactContext?.artifact_id?.trim()) return null
    return selectedArtifactContext
  })()

  const isManualStreamingInteraction = stream
  let streamAssistantTempId: string | null = null

  if (includeOptimisticUser) {
    const optimisticUserTempId = `temp-${Date.now()}`
    onOptimistic?.({
      id: optimisticUserTempId,
      content: trimmedDisplayMessage,
      attachments,
      ...(resolvedUserContentJson ? { content_json: resolvedUserContentJson } : {}),
    })
  }

  if (isManualStreamingInteraction) {
    streamAssistantTempId = `temp-assistant-${Date.now()}`
    onAssistantStreamStart?.({ id: streamAssistantTempId, content: "" })
    // Local transient only — never persisted. Replaced by the first sequenced backend status.
    onAssistantStreamStatus?.(
      streamAssistantTempId,
      "Reviewing the request and current context…",
    )
  }

  try {
    const supabase = getSupabaseBrowser()
    const diagnostics = createAiChatRunDiagnosticsTracker()
    diagnostics.markRequestSent()
    const res = await invokeEdgeFunctionFetch({
      supabase,
      url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-chat`,
      debugLabel: "ai-chat",
      init: {
        method: "POST",
        signal,
        body: JSON.stringify({
          thread_id: threadId,
          message: trimmed,
          ...(trimmedDisplayMessage ? { display_message: trimmedDisplayMessage } : {}),
          ...(resolvedUserContentJson ? { content_json: resolvedUserContentJson } : {}),
          attachments,
          ...(activeChannelId != null ? { active_channel_id: activeChannelId } : {}),
          ...(channelId != null ? { channel_id: channelId } : {}),
          ...(taskId != null ? { task_id: taskId } : {}),
          tagged_task_ids: taggedTaskIds,
          tagged_project_ids: taggedProjectIds,
          tagged_user_ids: taggedUserIds,
          ...(taggedChannelIds && taggedChannelIds.length > 0
            ? { tagged_channel_ids: taggedChannelIds }
            : {}),
          ...(taggedTaskChannelRefs && taggedTaskChannelRefs.length > 0
            ? { tagged_task_channel_refs: taggedTaskChannelRefs }
            : {}),
          ...(writableTaggedTaskComponentRefs.length > 0
            ? { tagged_task_component_refs: writableTaggedTaskComponentRefs }
            : {}),
          mode,
          ...(writableComponentId ? { component_id: writableComponentId } : {}),
          ...(writableTaskComponentOutputId
            ? { task_component_output_id: writableTaskComponentOutputId }
            : {}),
          ...(sanitizedSelectedArtifactContext
            ? {
                selected_context_type:
                  selectedArtifactContextType
                  ?? selectedContextType
                  ?? "artifact_document",
              }
            : sanitizedSelectedTextContext
              ? { selected_context_type: selectedTextContextType }
              : selectedContextType && selectedContextType !== "general"
                ? { selected_context_type: selectedContextType }
                : {}),
          ...(selectedComponentLabel ? { selected_component_label: selectedComponentLabel } : {}),
          context_source: sanitizedSelectedArtifactContext
            ? "text_selection"
            : sanitizedSelectedTextContext
              ? "text_selection"
              : contextSource ?? "none",
          ...(sanitizedSelectedTextContext
            ? { selected_text_context: sanitizedSelectedTextContext }
            : {}),
          ...(sanitizedSelectedArtifactContext
            ? { selected_artifact_context: sanitizedSelectedArtifactContext }
            : {}),
          model_key: modelKey ?? DEFAULT_AI_CHAT_MODEL_KEY,
          ...(ambientContext ? { ambient_context: ambientContext } : {}),
          ...(clarificationResponse ? { clarification_response: clarificationResponse } : {}),
          auto_run: autoRun,
          stream,
          ...(v2Request ? v2Request : {}),
        }),
      },
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!res.ok) {
      const errText = await res.text()
      diagnostics.markResponseHeaders(extractRunIdFromResponse(res), res.headers.get("Server-Timing"))
      if (clientRequestId && isRequestIdReusedError(res.status, errText)) {
        throw new Error(`request_id_reused:${clientRequestId}`)
      }
      const parsedError = parseAiChatErrorPayload(errText)
      if (parsedError.usage) onUsageUpdate?.(parsedError.usage)
      if (isManualStreamingInteraction && streamAssistantTempId) {
        const assistantId = streamAssistantTempId
        const runId = extractRunIdFromResponse(res) ?? inFlightTurn?.runId ?? null
        if (runId) onRunId?.(assistantId, runId)
        if (parsedError.code || parsedError.message) {
          const terminalState: AiRunTerminalState = {
            kind: "failed",
            run_id: runId,
            code: parsedError.code,
            retryable: parsedError.retryable,
            message: parsedError.message,
          }
          if (inFlightTurn) inFlightTurn.terminalState = terminalState
          onRunTerminalState?.(assistantId, terminalState)
          diagnostics.markTerminalEvent()
          logAiChatRunDiagnostics(diagnostics.snapshot())
          onAssistantStreamComplete?.(assistantId, { content: undefined, messageId: null })
          onAssistantStreamStatus?.(assistantId, null)
          onAssistantStreamIdle?.()
          return
        }
      }
      throw new Error(errText)
    }

    if (!isManualStreamingInteraction || !streamAssistantTempId) return

    const assistantId = streamAssistantTempId
    let streamFinalizeRan = false
    let capturedRunId: string | null = inFlightTurn?.runId ?? null
    let v2Terminal: AiRunTerminalState | null = inFlightTurn?.terminalState ?? null

    const captureRunId = (runId: string | null) => {
      if (!runId) return
      capturedRunId = runId
      if (inFlightTurn) inFlightTurn.runId = runId
      onRunId?.(assistantId, runId)
    }

    const applyV2Terminal = (state: AiRunTerminalState) => {
      v2Terminal = reduceRunTerminalState(v2Terminal, state)
      if (inFlightTurn) inFlightTurn.terminalState = v2Terminal
      onRunTerminalState?.(assistantId, v2Terminal)
    }

    const headerRunId = extractRunIdFromResponse(res)
    captureRunId(headerRunId)
    diagnostics.markResponseHeaders(capturedRunId, res.headers.get("Server-Timing"))

    const finishAssistantStream = (
      source: "done_marker" | "request_completion" | "v2_terminal" | "reconcile",
      payload?: { messageId?: string | null; content?: string }
    ) => {
      if (streamFinalizeRan) {
        console.debug("[ai-chat] finishAssistantStream skipped (already finalized)", { source })
        return
      }
      if (
        capturedRunId &&
        v2Terminal == null &&
        source !== "reconcile" &&
        !shouldUseLegacyStreamCompletion({ runId: capturedRunId, terminal: v2Terminal })
      ) {
        return
      }
      if (
        capturedRunId &&
        v2Terminal == null &&
        source === "request_completion"
      ) {
        console.debug("[ai-chat] deferring finishAssistantStream — V2 run awaiting terminal event", {
          runId: capturedRunId,
        })
        return
      }
      streamFinalizeRan = true
      console.debug("[ai-chat] finishAssistantStream", { source, runId: capturedRunId })
      if (source === "v2_terminal" || source === "reconcile") {
        diagnostics.markTerminalEvent()
        logAiChatRunDiagnostics(diagnostics.snapshot())
      }
      onAssistantStreamStatus?.(assistantId, null)
      onAssistantStreamComplete?.(assistantId, {
        content: payload?.content,
        messageId: payload?.messageId ?? v2Terminal?.message_id ?? null,
      })
      onAssistantStreamIdle?.()
    }

    const handleV2RunEvent = (event: AiChatV2RunEvent) => {
      onAiChatV2RunEvent?.(assistantId, event)
      captureRunId(event.run_id)
      if ("usage" in event && event.usage) {
        onUsageUpdate?.(event.usage)
      }
      if (
        event.type === "message.completed"
        || event.type === "run.failed"
        || event.type === "run.cancelled"
        || event.type === "run.interrupted"
      ) {
        applyV2Terminal(terminalStateFromV2Event(event))
        finishAssistantStream("v2_terminal", {
          messageId: event.type === "message.completed" ? event.message_id : null,
        })
      }
    }

    const reconcileInFlightRun = async () => {
      if (!capturedRunId || v2Terminal) return
      try {
        const payload = await fetchAiChatRun(capturedRunId, signal)
        if (payload.usage) onUsageUpdate?.(payload.usage)
        if (payload.targets && payload.targets.length > 0) {
          useAiRunProgressStore.getState().hydrateFromReconciliation(capturedRunId, payload.targets)
        }
        const terminalKind = reconcileRunStatusToTerminal(payload.run.status)
        if (terminalKind) {
          const errorCode = payload.error?.code ?? payload.run.code ?? null
          const errorMessage = payload.error?.message ?? payload.run.message ?? null
          const retryable = payload.error?.retryable ?? payload.run.retryable ?? null
          applyV2Terminal({
            kind: terminalKind,
            run_id: capturedRunId,
            message_id: payload.message?.id ?? null,
            code: errorCode,
            message: errorMessage,
            retryable,
          })
          finishAssistantStream("reconcile", {
            messageId: payload.message?.id ?? null,
            content: typeof payload.message?.content === "string" ? payload.message.content : undefined,
          })
        }
      } catch (reconcileErr) {
        console.error("[ai-chat] run reconciliation failed", reconcileErr)
        applyV2Terminal({
          kind: "interrupted",
          run_id: capturedRunId,
        })
        finishAssistantStream("reconcile")
      }
    }

    const contentType = res.headers.get("content-type")?.toLowerCase() ?? ""
    if (res.body) {
      let streamResult: Awaited<ReturnType<typeof consumeTextStream>>
      try {
        streamResult = await consumeTextStream(res, {
          onTextChunk: (chunk) => {
            diagnostics.markFirstVisibleModelText()
            onAssistantStreamChunk?.(assistantId, chunk)
          },
          onStatusText: (statusText) => {
            onAssistantStreamStatus?.(assistantId, statusText)
          },
          onAiStatusPayload: () => {
            diagnostics.markFirstStatusEvent()
          },
          onDoneStatusMarker: (ev: AiStreamTerminalEvent) => {
            if (capturedRunId && !shouldUseLegacyStreamCompletion({ runId: capturedRunId, terminal: v2Terminal })) {
              return
            }
            finishAssistantStream("done_marker", { messageId: ev.messageId ?? null })
          },
          onAiChatV2RunEvent: handleV2RunEvent,
          onAiAction: (action) => {
            onAiChatAction?.(action)
          },
          onThreadTitleEvent: (event) => {
            onThreadTitleEvent?.(assistantId, event)
          },
          onAssetEvent: (event) => {
            onAssetEvent?.(assistantId, event)
          },
          onComponentOutputEvent: (event) => {
            onComponentOutputEvent?.(assistantId, event)
            const messageId =
              typeof event.message_id === "string"
                ? event.message_id
                : typeof event.final_message_id === "string"
                  ? event.final_message_id
                  : null
            if (shouldUseLegacyStreamCompletion({ runId: capturedRunId, terminal: v2Terminal })) {
              finishAssistantStream("request_completion", { messageId })
            }
          },
          onMessageOutputEvent: (event) => {
            onMessageOutputEvent?.(assistantId, event)
            const messageId =
              typeof event.message_id === "string"
                ? event.message_id
                : typeof event.id === "string"
                  ? event.id
                  : typeof event.final_message_id === "string"
                    ? event.final_message_id
                    : null
            if (shouldUseLegacyStreamCompletion({ runId: capturedRunId, terminal: v2Terminal })) {
              finishAssistantStream("request_completion", { messageId })
            }
          },
          onComponentEditPreviewEvent: (event) => {
            diagnostics.markFirstPreviewEvent()
            if (event.phase === "saved") diagnostics.markFirstSavedPreview()
            onComponentEditPreviewEvent?.(assistantId, event)
          },
          onAiChangePreviewEvent: (event) => {
            diagnostics.markFirstPreviewEvent()
            if (event.phase === "saved") diagnostics.markFirstSavedPreview()
            onAiChangePreviewEvent?.(assistantId, event)
          },
          onComponentLibraryTraceEvent: (event) => {
            onComponentLibraryTraceEvent?.(assistantId, event)
          },
          onComponentPlanTraceEvent: (event) => {
            onComponentPlanTraceEvent?.(assistantId, event)
          },
          onRequestPlanEvent: (event) => {
            onRequestPlanEvent?.(assistantId, event)
          },
          onExecutionTraceEvent: (event) => {
            onExecutionTraceEvent?.(assistantId, event)
          },
        })
      } catch (consumeErr) {
        console.error("consumeTextStream failed", consumeErr)
        if (!streamFinalizeRan && !v2Terminal) {
          await reconcileInFlightRun()
        }
        if (!streamFinalizeRan) {
          streamFinalizeRan = true
          console.debug("[ai-chat] finishAssistantStream called from stream consume failure")
          onAssistantStreamStatus?.(assistantId, null)
          onAssistantStreamComplete?.(assistantId, { content: undefined, messageId: v2Terminal?.message_id ?? null })
          onAssistantStreamIdle?.()
        }
        return
      }

      if (!v2Terminal && capturedRunId) {
        await reconcileInFlightRun()
      }

      try {
        const isJsonResponse = contentType.includes("application/json")
        const rawTrimmed = streamResult.rawText.trimStart()
        const rawLooksLikeJson = rawTrimmed.startsWith("{") || rawTrimmed.startsWith("[")
        if (isJsonResponse && rawLooksLikeJson) {
          try {
            const data = JSON.parse(streamResult.rawText || "{}")
            captureRunId(extractRunIdFromJsonBody(data))
            const parsedContent = typeof data?.message?.content === "string" ? data.message.content : ""
            const finalContent = parsedContent || streamResult.fullText
            const finalMessageId = typeof data?.message?.id === "string" ? data.message.id : null
            if (shouldUseLegacyStreamCompletion({ runId: capturedRunId, terminal: v2Terminal })) {
              finishAssistantStream("request_completion", {
                content: finalContent,
                messageId: finalMessageId,
              })
            }
          } catch {
            if (shouldUseLegacyStreamCompletion({ runId: capturedRunId, terminal: v2Terminal })) {
              finishAssistantStream("request_completion", {
                content: streamResult.fullText,
                messageId: streamResult.terminal?.messageId ?? null,
              })
            }
          }
        } else if (shouldUseLegacyStreamCompletion({ runId: capturedRunId, terminal: v2Terminal })) {
          finishAssistantStream("request_completion", {
            content: streamResult.fullText,
            messageId: streamResult.terminal?.messageId ?? null,
          })
        }

        if (streamFinalizeRan && isJsonResponse && rawLooksLikeJson) {
          try {
            const data = JSON.parse(streamResult.rawText || "{}")
            const lateMessageId = typeof data?.message?.id === "string" ? data.message.id : null
            if (lateMessageId) {
              onAssistantStreamComplete?.(assistantId, { content: undefined, messageId: lateMessageId })
            }
          } catch {
            /* ignore */
          }
        }
      } finally {
        if (!streamFinalizeRan) {
          onAssistantStreamStatus?.(assistantId, null)
        }
      }
    } else {
      const data = await res.json().catch(() => null)
      const finalContent = typeof data?.message?.content === "string" ? data.message.content : ""
      const finalMessageId = typeof data?.message?.id === "string" ? data.message.id : null
      onAssistantStreamComplete?.(assistantId, {
        content: finalContent,
        messageId: finalMessageId,
      })
      onAssistantStreamStatus?.(assistantId, null)
      onAssistantStreamIdle?.()
    }
  } catch (e) {
    const aborted = (e instanceof DOMException && e.name === "AbortError") || (e instanceof Error && e.name === "AbortError")
    if (aborted) {
      if (isManualStreamingInteraction && streamAssistantTempId) {
        onAssistantStreamComplete?.(streamAssistantTempId, { content: undefined, messageId: null })
        onAssistantStreamStatus?.(streamAssistantTempId, null)
        onAssistantStreamIdle?.()
      }
      return
    }
    console.error("sendConversationAiChatStream failed", e)
    if (isManualStreamingInteraction && streamAssistantTempId) {
      onAssistantStreamError?.(streamAssistantTempId)
      onAssistantStreamStatus?.(streamAssistantTempId, null)
    }
    throw e
  }
}
