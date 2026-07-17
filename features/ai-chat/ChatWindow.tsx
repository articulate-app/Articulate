"use client"

import React, { useMemo, useRef, useState, useEffect, useCallback, useLayoutEffect } from "react"
import { ChevronDown } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import type { AiAttachmentMeta, AiMessage, InFlightAssistantMessage, AiThread, InFlightAiTurnMeta } from "./types"
import { useMessages, useThreadContext, useUpdateVisibility, useContentTypesRealtime, MESSAGES_PAGE_SIZE_DEFAULT } from "./hooks"
import { MessageBubble } from "./MessageBubble"
import { Composer, type MentionSuggestion } from "./Composer"
import { getLoadedTaskRowsSnapshot } from "../../src/hooks/use-task-group-tasks-query"
import { useCurrentUserStore } from "../../app/store/current-user"
import { sendConversationAiChatStream } from "./send-conversation-ai-chat"
import { useAiChatModelSelection } from "./ai-chat-model-selection"
import { SelectionAskAiMenu } from "./SelectionAskAiMenu"
import {
  computeRangeTextParts,
  useAiChatTextSelectionStore,
  type AiSelectedTextContext,
} from "./ai-chat-text-selection"
import type { TaggedTaskChannelRef, TaggedTaskComponentRef } from "./build-ai-chat-tagged-refs"
import type {
  AiChatStreamAction,
  AiChatContentSavedAction,
  AiChatThreadTitleEvent,
  AiChatAssetEvent,
  AiChatMessageOutputEvent,
  AiChatComponentOutputEvent,
  AiChatComponentEditPreviewEvent,
  AiChatChangePreviewEvent,
  AiChatComponentLibraryTraceEvent,
  AiChatComponentPlanTraceEvent,
  AiChatRequestPlanEvent,
  AiChatV2RunEvent,
} from "../../app/lib/ai/chat"
import type { AiRunTerminalState } from "../../app/lib/ai/ai-chat-v2-types"
import { targetProgressFromV2Event, useAiRunProgressStore } from "../../app/store/ai-run-progress-store"
import { ambiguousTargetToClarification } from "./parse-ai-run-events"
import { AiRunTargetProgressPanel } from "./AiRunTargetProgressPanel"
import { AiRunFailureCard } from "./AiRunFailureCard"
import { useAiChatThreadUsage } from "./use-ai-chat-thread-usage"
import { AiChatUsageLimitCard } from "./AiChatUsageLimitCard"
import { canCurrentUserManageAiLimits } from "../../app/lib/services/ai-token-limits"
import { isUsageSendBlocked } from "./ai-chat-usage"
import {
  fetchAiChatRun,
  reconcileRunStatusToTerminal,
} from "./ai-chat-run-api"
import { reduceRunTerminalState } from "./ai-run-terminal"
import { buildAiChatV2RequestFields } from "./build-ai-run-targets"
import { taskChannelBootstrapQueryKey } from "../../app/hooks/use-task-channel-bootstrap"
import { ContentSavedInlineCard } from "./content-saved-inline-card"
import { ComponentClarificationCard } from "./component-clarification-card"
import {
  activeFieldContextFromClarification,
  buildClarificationDedupeKey,
  buildClarificationResponsePayload,
  buildClarificationUserMessageContentJson,
  clarificationActionToRequest,
  clarificationHasExplicitComponentContext,
  parseClarificationFromMessageContentJson,
  parseClarificationRequestRecord,
  reduceClarificationRequest,
  resolveActiveClarificationFromMessages,
  resolveClarificationDisplayForMessage,
  serializeClarificationRequestPayload,
  type AiClarificationRequest,
} from "./ai-clarification"
import { applyPreflightSkipsFromContentJson } from "./orchestrated-build-preflight"
import { invalidateTaskChannelContentQueries } from "./invalidate-task-channel-content"
import { applyContentSavedAction } from "./apply-content-saved-action"
import { buildRenderableMessages, prunePendingMessagesAgainstServer } from "./message-reconciliation"
import {
  AI_CHAT_OPTIMISTIC_USER_EVENT,
  type AiChatOptimisticUserDetail,
} from "./dispatch-ai-chat-optimistic-user"
import {
  AI_THREAD_RESTORED_EVENT,
  type AiThreadRestoredEventDetail,
} from "./ai-thread-restore-events"
import { fetchTaskChannelBootstrap } from "../../app/lib/services/task-channel-bootstrap"
import type { TaskChannelBootstrapResponse } from "../../app/lib/types/task-channel-bootstrap"
import { isPersistedAiThreadId } from "./thread-id"
import { enhanceBlocksWithMarkdownTables } from "./text-to-output-blocks"
import { buildAssistantContentJsonFromMarkdown } from "./ai-chat-message-format"
import { getAssistantContentBlocks } from "./assistant-content-blocks"
import type { AiActiveFieldContext } from "./active-field-context"
import type { AiAmbientContext } from "./ai-target-context"
import { useComponentEditStreamStore } from "../../app/store/component-edit-stream"
import { useComponentPlanTraceStore } from "../../app/store/component-plan-trace-store"
import { useAiRequestPlanStore } from "../../app/store/ai-request-plan-store"
import { useAiChangePreviewStreamStore } from "../../app/store/ai-change-preview-stream"
import { useAiOrchestratedBuildStore } from "../../app/store/ai-orchestrated-build-store"
import { ComponentEditStreamPreview } from "./ComponentEditStreamPreview"
import { AiChangePreviewCard } from "./AiChangePreviewCard"
import { OrchestratedBuildCard } from "./OrchestratedBuildCard"
import { applyAiChangePreviewEvent } from "./apply-ai-change-preview-event"
import {
  buildPersistedAiChangePreviewDescriptorsFromMessages,
  hydrateAiChangePreviewsFromMessages,
} from "./ai-change-previews-from-message"
import {
  discoverOrchestratedBuildsFromMessageContentJson,
  isOrchestratedBuildChangePreview,
} from "./discover-orchestrated-build"
import { useOrchestratedBuildPoll } from "./use-orchestrated-build-poll"
import { ComponentPlanTraceCards } from "./ComponentPlanTraceCards"
import { RequestPlanCard } from "./RequestPlanCard"
import { parseComponentTracesFromMessage } from "./component-plan-trace"
import { parseRequestPlanFromMessage } from "./request-plan"
import {
  buildPersistedPreviewDescriptorsFromMessages,
} from "./component-edit-previews-from-message"
import {
  buildAssistantMessagePreviewLayout,
  buildAssistantClipboardText,
  resolvePreviewContentDescriptors,
} from "./component-edit-preview-message"
import {
  hydrateComponentEditPreviewsFromMessages,
  previewDescriptorStreamKey,
} from "./hydrate-component-edit-previews"
import {
  buildEditStreamOptimisticOutputBlocks,
  buildEditStreamMergedPlainText,
  isLiveComponentEditStream,
  normalizePreviewContentJson,
  type ComponentEditStreamContext,
} from "./component-edit-stream-utils"
import { applyComponentEditPreviewEvent } from "./apply-component-edit-preview-event"
import { detectComponentLinkedMessageOutput } from "./component-linked-message-output"
import { resolveComponentOutputPlainTextFromQueryCache, resolveComponentTitleFromQueryCache } from "./resolve-component-output-from-cache"
import { isGenericComponentPreviewTitle } from "./component-edit-preview-guards"
import { dispatchTasksShallowNavigation } from "../../app/lib/tasks-shallow-nav"
import { usePathname } from "next/navigation"
import { useChatScrollFollow } from "./use-chat-scroll-follow"

interface ChatWindowProps {
  thread: AiThread
  taskId?: number
  activeChannelId?: number | null
  // Chat context for Build with AI flows
  chatContext?: {
    componentId?: string | null
    briefingMode?: boolean
    preFillMessage?: string
    mode?: "build_component" | "build_briefing" | null
    autoRun?: boolean
  }
  activeFieldContext?: AiActiveFieldContext
  onScopeModeChange?: (scope: "task" | "global" | "project", projectId?: number | null) => void
  onThreadTitlePreview?: (threadId: string, title: string | null) => void
  onThreadTitlePersist?: (threadId: string, title: string) => void
}

const ASSET_PLACEHOLDER_PATTERN = /\[\[asset:[a-zA-Z0-9_-]+\]\]/g

type StreamingBlock =
  | { type: "text"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | {
      type: "attachment"
      attachment_id?: string | null
      asset_key?: string | null
      media_type?: string | null
      mime_type?: string | null
      file_path?: string | null
      signed_url?: string | null
      width_pct?: number | null
      alt_text?: string | null
      caption?: string | null
      missing_attachment?: boolean | null
      attachment?: Record<string, unknown> | null
    }

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeStreamTextChunk(chunk: string): string {
  return chunk.replace(ASSET_PLACEHOLDER_PATTERN, "")
}

function normalizeAiRenderableBlocks(value: unknown): StreamingBlock[] {
  const source = getAssistantContentBlocks(value) ?? []
  const out: StreamingBlock[] = []
  for (const item of source) {
    if (!item || typeof item !== "object") continue
    const block = item as Record<string, unknown>
    if (block.type === "text") {
      const text = typeof block.text === "string" ? block.text : ""
      out.push({ type: "text", text })
      continue
    }
    if (block.type === "paragraph") {
      const text = typeof block.text === "string" ? block.text : ""
      out.push({ type: "paragraph", text })
      continue
    }
    if (block.type === "table") {
      out.push({
        type: "table",
        headers: Array.isArray(block.headers) ? block.headers.map(String) : [],
        rows: Array.isArray(block.rows)
          ? block.rows.map((row) => (Array.isArray(row) ? row.map(String) : []))
          : [],
      })
      continue
    }
    if (block.type === "attachment") {
      out.push({
        type: "attachment",
        attachment_id: typeof block.attachment_id === "string" ? block.attachment_id : null,
        asset_key: typeof block.asset_key === "string" ? block.asset_key : null,
        media_type: typeof block.media_type === "string" ? block.media_type : null,
        mime_type: typeof block.mime_type === "string" ? block.mime_type : null,
        file_path: typeof block.file_path === "string" ? block.file_path : null,
        signed_url: typeof block.signed_url === "string" ? block.signed_url : null,
        width_pct: toFiniteNumber(block.width_pct),
        alt_text: typeof block.alt_text === "string" ? block.alt_text : null,
        caption: typeof block.caption === "string" ? block.caption : null,
        attachment:
          block.attachment && typeof block.attachment === "object"
            ? (block.attachment as Record<string, unknown>)
            : null,
        missing_attachment: typeof block.missing_attachment === "boolean" ? block.missing_attachment : null,
      })
    }
  }
  return out
}

function toAttachmentMeta(value: Record<string, unknown> | null | undefined): AiAttachmentMeta | null {
  if (!value) return null
  const filePathRaw = typeof value.file_path === "string" ? value.file_path : null
  const signedUrl = typeof value.signed_url === "string" ? value.signed_url : null
  const attachmentId =
    typeof value.attachment_id === "string"
      ? value.attachment_id
      : typeof value.id === "string"
        ? value.id
        : undefined
  const filePath = filePathRaw || (signedUrl ? `remote/${attachmentId ?? crypto.randomUUID()}` : null)
  if (!filePath) return null
  const fileName =
    typeof value.file_name === "string"
      ? value.file_name
      : typeof value.name === "string"
        ? value.name
        : filePath.split("/").at(-1) || "attachment"
  const mimeType =
    typeof value.mime_type === "string"
      ? value.mime_type
      : typeof value.content_type === "string"
        ? value.content_type
        : "application/octet-stream"
  const size = toFiniteNumber(value.size) ?? 0
  const previewUrl = typeof value.signed_url === "string" ? value.signed_url : null
  return {
    id: attachmentId,
    file_name: fileName,
    file_path: filePath,
    mime_type: mimeType,
    size,
    preview_url: previewUrl ?? signedUrl,
  }
}

function mergeUniqueAttachments(existing: AiAttachmentMeta[] | null | undefined, incoming: AiAttachmentMeta[]): AiAttachmentMeta[] {
  const next = [...(existing ?? [])]
  const seen = new Set(next.map((item) => item.id || item.file_path))
  for (const attachment of incoming) {
    const key = attachment.id || attachment.file_path
    if (!key || seen.has(key)) continue
    seen.add(key)
    next.push(attachment)
  }
  return next
}

function blockAttachmentId(block: StreamingBlock): string | null {
  if (block.type !== "attachment") return null
  return typeof block.attachment_id === "string" ? block.attachment_id : null
}

function appendTextBlock(blocks: StreamingBlock[], text: string): StreamingBlock[] {
  if (!text) return blocks
  const next = [...blocks]
  const last = next[next.length - 1]
  if (last && last.type === "text") {
    next[next.length - 1] = { ...last, text: `${last.text}${text}` }
    return next
  }
  next.push({ type: "text", text })
  return next
}

function toAssetIndex(assets: unknown): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}
  const arr = Array.isArray(assets) ? assets : []
  for (const item of arr) {
    if (!item || typeof item !== "object") continue
    const asset = item as Record<string, unknown>
    const attachmentId = typeof asset.attachment_id === "string" ? asset.attachment_id : null
    const id = typeof asset.id === "string" ? asset.id : null
    const embeddedId =
      asset.attachment && typeof asset.attachment === "object"
        ? typeof (asset.attachment as Record<string, unknown>).id === "string"
          ? ((asset.attachment as Record<string, unknown>).id as string)
          : null
        : null
    if (attachmentId) out[attachmentId] = asset
    if (id) out[id] = asset
    if (embeddedId) out[embeddedId] = asset
  }
  return out
}

function hydrateBlocksWithAssets(blocks: StreamingBlock[], assets: unknown): StreamingBlock[] {
  const byId = toAssetIndex(assets)
  return blocks.map((block) => {
    if (block.type !== "attachment") return block
    const aid = blockAttachmentId(block)
    const matched = aid ? byId[aid] : null
    const attachment =
      block.attachment ??
      (matched && matched.attachment && typeof matched.attachment === "object"
        ? (matched.attachment as Record<string, unknown>)
        : null)
    return {
      ...block,
      attachment,
      signed_url:
        block.signed_url ??
        (matched && typeof matched.signed_url === "string" ? matched.signed_url : null),
      file_path:
        block.file_path ??
        (matched && typeof matched.file_path === "string" ? matched.file_path : null),
      mime_type:
        block.mime_type ??
        (matched && typeof matched.mime_type === "string" ? matched.mime_type : null),
      media_type:
        block.media_type ??
        (matched && typeof matched.media_type === "string" ? matched.media_type : null),
      alt_text:
        block.alt_text ??
        (matched && typeof matched.alt_text === "string" ? matched.alt_text : null),
      caption:
        block.caption ??
        (matched && typeof matched.caption === "string" ? matched.caption : null),
      missing_attachment: attachment || matched ? false : true,
    } as StreamingBlock
  })
}

function toAttachmentRecordFromBlock(block: Extract<StreamingBlock, { type: "attachment" }>): Record<string, unknown> | null {
  const explicit = block.attachment && typeof block.attachment === "object" ? block.attachment : null
  if (explicit) return explicit
  if (!block.attachment_id && !block.file_path && !block.signed_url) return null
  return {
    id: block.attachment_id ?? null,
    attachment_id: block.attachment_id ?? null,
    file_name: block.file_path?.split("/").at(-1) ?? "attachment",
    file_path: block.file_path ?? null,
    mime_type: block.mime_type ?? null,
    media_type: block.media_type ?? null,
    signed_url: block.signed_url ?? null,
    public_url: null,
    alt_text: block.alt_text ?? null,
    caption: block.caption ?? null,
  }
}

function collectAttachmentRecordsFromBlocks(blocks: StreamingBlock[]): Record<string, unknown>[] {
  const byId = new Map<string, Record<string, unknown>>()
  for (const block of blocks) {
    if (block.type !== "attachment") continue
    const record = toAttachmentRecordFromBlock(block)
    if (!record) continue
    const id =
      typeof record.id === "string"
        ? record.id
        : typeof record.attachment_id === "string"
          ? record.attachment_id
          : null
    if (!id) continue
    byId.set(id, record)
  }
  return Array.from(byId.values())
}

function mergeAttachmentRecords(
  existing: unknown,
  incoming: Record<string, unknown>[]
): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>()
  for (const row of Array.isArray(existing) ? existing : []) {
    if (!row || typeof row !== "object") continue
    const record = row as Record<string, unknown>
    const id =
      typeof record.id === "string"
        ? record.id
        : typeof record.attachment_id === "string"
          ? record.attachment_id
          : null
    if (!id) continue
    map.set(id, record)
  }
  for (const row of incoming) {
    const id =
      typeof row.id === "string"
        ? row.id
        : typeof row.attachment_id === "string"
          ? row.attachment_id
          : null
    if (!id) continue
    map.set(id, { ...(map.get(id) ?? {}), ...row })
  }
  return Array.from(map.values())
}

export function ChatWindow({
  thread,
  taskId,
  activeChannelId,
  chatContext,
  activeFieldContext,
  onScopeModeChange,
  onThreadTitlePreview,
  onThreadTitlePersist,
}: ChatWindowProps) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const { modelKey } = useAiChatModelSelection()
  const setPendingTextSelection = useAiChatTextSelectionStore((s) => s.setPendingSelection)
  const publicUserId = useCurrentUserStore((s) => s.publicUserId)
  const fullName = useCurrentUserStore((s) => s.fullName)
  const hasPersistedThreadId = isPersistedAiThreadId(thread.id)
  const {
    usage: threadUsage,
    isLoading: isThreadUsageLoading,
    applyUsageSnapshot,
    handleTerminalUsage,
  } = useAiChatThreadUsage(thread.id, hasPersistedThreadId)
  const [canReviewLimits, setCanReviewLimits] = useState(false)
  const { messages, isLoading: isMessagesLoading } = useMessages(thread?.id)
  const { context } = useThreadContext(thread?.id)
  const [pendingMsgs, setPendingMsgs] = useState<AiMessage[]>([])
  const [assistantActivity, setAssistantActivity] = useState<{ tempId: string; text: string } | null>(null)
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const [contentSavedCards, setContentSavedCards] = useState<Array<{ id: string; action: AiChatContentSavedAction }>>([])
  const [pendingClarification, setPendingClarification] = useState<AiClarificationRequest | null>(null)
  const [dismissedClarificationId, setDismissedClarificationId] = useState<string | null>(null)
  const [isClarificationResponding, setIsClarificationResponding] = useState(false)
  const clarificationFollowUpRef = useRef<null>(null)
  const lastClarificationIdRef = useRef<string | null>(null)
  const streamingAssistantTempIdRef = useRef<string | null>(null)
  /** When true, a clarification follow-up is in flight; clear only if no new clarification arrives. */
  const clarificationFollowUpPendingClearRef = useRef(false)
  const clarificationAppliedDuringFollowUpRef = useRef(false)

  const applyClarification = useCallback((request: AiClarificationRequest) => {
    const dedupeKey = buildClarificationDedupeKey(request)
    if (clarificationFollowUpPendingClearRef.current) {
      clarificationAppliedDuringFollowUpRef.current = true
    }
    setDismissedClarificationId((prev) => (prev === dedupeKey ? null : prev))
    lastClarificationIdRef.current = dedupeKey

    let normalized = reduceClarificationRequest(null, request)
    setPendingClarification((prev) => {
      normalized = reduceClarificationRequest(prev, request)
      return normalized
    })

    const assistantId = normalized.assistantMessageId ?? streamingAssistantTempIdRef.current
    if (!assistantId) return

    const clarificationPayload = serializeClarificationRequestPayload(normalized)
    setPendingMsgs((prev) =>
      prev.map((message) => {
        if (message.role !== "assistant") return message
        if (
          message.id !== assistantId
          && (message as InFlightAssistantMessage).reconciled_message_id !== assistantId
        ) {
          return message
        }
        const existingTerminal = (message as InFlightAssistantMessage).terminal_state
        const existingJson = message.content_json
        const nextContentJson =
          existingJson && typeof existingJson === "object" && !Array.isArray(existingJson)
            ? {
                ...(existingJson as Record<string, unknown>),
                clarification_request: clarificationPayload,
              }
            : Array.isArray(existingJson)
              ? {
                  blocks: existingJson,
                  clarification_request: clarificationPayload,
                }
              : {
                  clarification_request: clarificationPayload,
                }
        return {
          ...message,
          // Clarification is a successful terminal for the card; do not clear the card later.
          status: "complete",
          content_json: nextContentJson,
          terminal_state:
            existingTerminal?.kind === "completed"
            || existingTerminal?.kind === "failed"
            || existingTerminal?.kind === "cancelled"
            || existingTerminal?.kind === "interrupted"
              ? existingTerminal
              : {
                  kind: "completed",
                  run_id: normalized.runId ?? inFlightTurnRef.current?.runId ?? null,
                  message_id:
                    (message as InFlightAssistantMessage).reconciled_message_id ?? null,
                },
        } as InFlightAssistantMessage
      }),
    )
    setAssistantActivity((prev) => (prev?.tempId === assistantId ? null : prev))
  }, [])

  const clearClarification = useCallback((clarificationId?: string | null) => {
    if (clarificationId) {
      setDismissedClarificationId(clarificationId)
    }
    setPendingClarification(null)
  }, [])
  const updateVisibility = useUpdateVisibility()
  const chatEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const latestUserMessageRef = useRef<HTMLDivElement>(null)
  const userMessageScrollAnchorUntilRef = useRef(0)
  const {
    showJumpToBottom,
    scrollUserMessageIntoView,
    markNewContentBelow,
    jumpToBottom,
    scrollToBottomOnce,
  } = useChatScrollFollow({ scrollContainerRef })
  const prevMessageCountRef = useRef(0)
  const prevStreamSignatureRef = useRef("")
  const threadInitialScrollDoneRef = useRef<string | null>(null)
  const streamAbortRef = useRef<AbortController | null>(null)
  const inFlightTurnRef = useRef<InFlightAiTurnMeta | null>(null)
  const activeRunIdRef = useRef<string | null>(null)
  const assetByAttachmentIdRef = useRef<Record<string, AiAttachmentMeta>>({})
  const assetByAssetKeyRef = useRef<Record<string, AiAttachmentMeta>>({})
  const threadTitleStreamRef = useRef<{
    assistantTempId: string
    hasStarted: boolean
    buffer: string
    hasCompleted: boolean
  } | null>(null)
  const activeComponentEditStreamRef = useRef<ComponentEditStreamContext | null>(null)
  const editStreamEntries = useComponentEditStreamStore((state) => state.streams)
  const changePreviewEntries = useAiChangePreviewStreamStore((state) => state.previews)
  const orchestratedBuildEntries = useAiOrchestratedBuildStore((state) => state.builds)
  useOrchestratedBuildPoll(thread.id)
  const runProgressEntries = useAiRunProgressStore((state) => state.entriesByKey)
  const traceBuckets = useComponentPlanTraceStore((state) => state.buckets)
  const requestPlanBuckets = useAiRequestPlanStore((state) => state.buckets)
  const isAssistantStreaming = useMemo(
    () => pendingMsgs.some((m) => m.role === "assistant" && m.status === "streaming"),
    [pendingMsgs]
  )
  const isComponentBuildingFlow = chatContext?.mode === "build_component" || chatContext?.mode === "build_briefing"
  const patchTaskComponentOutput = useCallback(
    (params: {
      taskId: number
      channelId: number
      taskComponentOutputId?: string | null
      candidateTaskComponentIds?: string[]
      finalBlocks: StreamingBlock[]
      strategy?: "replace" | "append"
      contentText?: string | null
      outputKind?: string | null
      trace: string
    }) => {
      const {
        taskId: patchTaskId,
        channelId: patchChannelId,
        taskComponentOutputId,
        candidateTaskComponentIds,
        finalBlocks,
        strategy = "replace",
        contentText,
        outputKind,
        trace,
      } = params
      const candidateSet = new Set((candidateTaskComponentIds ?? []).filter((id) => typeof id === "string" && id.length > 0))
      const allQueryEntries = queryClient.getQueryCache().findAll()
      const allQueryKeys = allQueryEntries.map((query) => query.queryKey)
      console.debug("[ai-chat] query keys on component patch", {
        trace,
        taskId: patchTaskId,
        channelId: patchChannelId,
        queryKeys: allQueryKeys,
      })

      const keyHasLabel = (key: unknown, label: string): boolean => {
        if (Array.isArray(key)) return key.some((item) => keyHasLabel(item, label))
        if (key && typeof key === "object") {
          return Object.values(key as Record<string, unknown>).some((value) => keyHasLabel(value, label))
        }
        return typeof key === "string" && key.includes(label)
      }
      const keyHasValue = (key: unknown, value: number): boolean => {
        const target = String(value)
        if (Array.isArray(key)) return key.some((item) => keyHasValue(item, value))
        if (key && typeof key === "object") {
          return Object.values(key as Record<string, unknown>).some((entry) => keyHasValue(entry, value))
        }
        if (typeof key === "number") return key === value
        if (typeof key === "string") return key === target
        return false
      }
      const matchingQueries = allQueryEntries.filter((query) => {
        const key = query.queryKey
        const isBootstrap = keyHasLabel(key, "task-channel-bootstrap")
        const isComposed = keyHasLabel(key, "task-channel-composed-output")
        if (!isBootstrap && !isComposed) return false
        return keyHasValue(key, patchTaskId) && keyHasValue(key, patchChannelId)
      })
      const queryTargets =
        matchingQueries.length > 0
          ? matchingQueries
          : [
              { queryKey: ["task-channel-bootstrap", patchTaskId, patchChannelId] as unknown[] },
              { queryKey: ["task-channel-composed-output", patchTaskId, patchChannelId] as unknown[] },
            ]
      const applyRowPatch = (row: Record<string, unknown>): Record<string, unknown> => {
        const existingBlocks = normalizeAiRenderableBlocks(
          row.content ?? row.resolved_content_json ?? row.content_json ?? []
        )
        const mergedBlocks = strategy === "append" ? [...existingBlocks, ...finalBlocks] : finalBlocks
        const mergedAttachments = collectAttachmentRecordsFromBlocks(mergedBlocks)
        const next = {
          ...row,
          content: mergedBlocks,
          content_json: mergedBlocks,
          resolved_content_json: mergedBlocks,
          content_format: "json",
          output_kind: outputKind ?? row.output_kind ?? null,
          attachments: mergeAttachmentRecords(row.attachments, mergedAttachments),
          attachment_map: row.attachment_map ?? null,
        } as Record<string, unknown>
        if (contentText != null && finalBlocks.length === 0) {
          next.content_text = contentText
        }
        if (taskComponentOutputId) {
          next.task_component_output_id = taskComponentOutputId
        }
        return next
      }
      const rowMatches = (row: Record<string, unknown>): boolean => {
        const rowOutputId = typeof row.task_component_output_id === "string" ? row.task_component_output_id : null
        const rowTaskComponentId = typeof row.task_component_id === "string" ? row.task_component_id : null
        if (taskComponentOutputId && rowOutputId === taskComponentOutputId) return true
        if (rowTaskComponentId && candidateSet.has(rowTaskComponentId)) return true
        return false
      }

      for (const query of queryTargets) {
        const key = query.queryKey as unknown[]
        const isBootstrapKey = keyHasLabel(key, "task-channel-bootstrap")
        const isComposedKey = keyHasLabel(key, "task-channel-composed-output")
        if (isBootstrapKey) {
          queryClient.setQueryData<TaskChannelBootstrapResponse | undefined>(key, (old) => {
            if (!old) return old
            let patched = false
            const composed_output = (old.composed_output ?? []).map((row) => {
              const rowRecord = row as unknown as Record<string, unknown>
              if (!rowMatches(rowRecord)) return row
              patched = true
              return applyRowPatch(rowRecord) as unknown as typeof row
            })
            if (!patched) return old
            console.debug("[ai-chat] hydrated blocks applied to component output state", {
              trace,
              key,
              taskId: patchTaskId,
              channelId: patchChannelId,
              taskComponentOutputId: taskComponentOutputId ?? null,
              candidateTaskComponentIds: Array.from(candidateSet),
              blockCount: finalBlocks.length,
            })
            return { ...old, composed_output }
          })
        }
        if (isComposedKey) {
          queryClient.setQueryData<unknown>(key, (old: unknown) => {
            if (!Array.isArray(old)) return old
            let patched = false
            const nextRows = old.map((row) => {
              if (!row || typeof row !== "object") return row
              const rowRecord = row as Record<string, unknown>
              if (!rowMatches(rowRecord)) return row
              patched = true
              return applyRowPatch(rowRecord)
            })
            if (patched) {
              console.debug("[ai-chat] hydrated blocks applied to component output state", {
                trace,
                key,
                taskId: patchTaskId,
                channelId: patchChannelId,
                taskComponentOutputId: taskComponentOutputId ?? null,
                candidateTaskComponentIds: Array.from(candidateSet),
                blockCount: finalBlocks.length,
              })
            }
            return patched ? nextRows : old
          })
        }
      }
    },
    [queryClient]
  )

  const patchComponentEditStreamPreview = useCallback(
    (ctx: ComponentEditStreamContext) => {
      const stream = useComponentEditStreamStore.getState().getStream(ctx.key)
      if (!stream) return
      const optimisticBlocks = buildEditStreamOptimisticOutputBlocks(stream)
      const mergedText = buildEditStreamMergedPlainText(stream)
      if (optimisticBlocks.length === 0 && !mergedText.trim()) return
      patchTaskComponentOutput({
        taskId: ctx.taskId,
        channelId: ctx.channelId,
        taskComponentOutputId: ctx.taskComponentOutputId ?? stream.taskComponentOutputId,
        candidateTaskComponentIds: [ctx.componentId],
        finalBlocks: optimisticBlocks,
        strategy: "replace",
        contentText: mergedText,
        trace: "component-edit-stream-preview",
      })
    },
    [patchTaskComponentOutput],
  )

  const handleOpenComponentEditInContentTab = useCallback((streamKey: string) => {
    const stream = useComponentEditStreamStore.getState().getStream(streamKey)
    if (!stream) return
    useComponentEditStreamStore.getState().requestFocus({
      taskId: stream.taskId,
      channelId: stream.channelId,
      componentId: stream.componentId,
      componentTitle: stream.componentTitle,
    })
    const params = new URLSearchParams(searchParams.toString())
    params.set("taskTab", "content")
    params.set("activeChannelId", String(stream.channelId))
    const query = params.toString()
    const nextUrl = query ? `${pathname}?${query}` : pathname
    window.history.pushState(window.history.state, "", nextUrl)
    dispatchTasksShallowNavigation()
  }, [pathname, searchParams])

  useEffect(() => {
    if (isAssistantStreaming) return
    setAssistantActivity((prev) => (prev ? null : prev))
  }, [isAssistantStreaming])

  // Subscribe to content types realtime updates
  useContentTypesRealtime(taskId)

  const handleOptimistic = (temp: {
    id: string
    content: string
    attachments?: any[]
    content_json?: unknown
  }) => {
    console.debug("[ai-chat] optimistic user append requested", { tempId: temp.id, contentLength: temp.content.length })
    setPendingMsgs((prev) => [
      ...prev,
      {
        id: temp.id,
        thread_id: thread.id,
        role: "user",
        content: temp.content,
        content_json: temp.content_json ?? null,
        attachments: temp.attachments,
        status: "pending",
        created_at: new Date().toISOString(),
      },
    ])
  }

  useEffect(() => {
    const onExternalOptimisticUser = (event: Event) => {
      const detail = (event as CustomEvent<AiChatOptimisticUserDetail>).detail
      if (!detail?.threadId || detail.threadId !== thread.id) return
      const displayMessage = detail.displayMessage.trim()
      if (!displayMessage) return
      const internalMessage = detail.internalMessage?.trim() ?? ""
      const contentJson = detail.contentJson ?? null
      handleOptimistic({
        id: `temp-build-${Date.now()}`,
        content: displayMessage,
        attachments: [],
        content_json: contentJson
          ? {
              ...contentJson,
              ...(internalMessage ? { internal_message: internalMessage } : {}),
            }
          : internalMessage && internalMessage !== displayMessage
            ? {
                display_message: displayMessage,
                internal_message: internalMessage,
              }
            : { display_message: displayMessage },
      })
    }
    window.addEventListener(AI_CHAT_OPTIMISTIC_USER_EVENT, onExternalOptimisticUser)
    return () => window.removeEventListener(AI_CHAT_OPTIMISTIC_USER_EVENT, onExternalOptimisticUser)
  }, [thread.id])

  const handleAssistantStreamStart = (temp: { id: string; content: string }) => {
    streamingAssistantTempIdRef.current = temp.id
    console.debug("[ai-chat] optimistic assistant append", { tempId: temp.id })
    const clientRequestId = inFlightTurnRef.current?.clientRequestId ?? null
    const optimisticAssistant: InFlightAssistantMessage = {
      id: temp.id,
      thread_id: thread.id,
      role: "assistant",
      content: temp.content,
      content_json: [],
      created_at: new Date().toISOString(),
      status: "streaming",
      is_optimistic: true,
      reconciled_message_id: null,
      client_request_id: clientRequestId,
    }
    setPendingMsgs((prev) => [...prev, optimisticAssistant])
    threadTitleStreamRef.current = {
      assistantTempId: temp.id,
      hasStarted: false,
      buffer: "",
      hasCompleted: false,
    }
  }

  const handleAssistantStreamChunk = (tempId: string, chunk: string) => {
    const visibleChunk = normalizeStreamTextChunk(chunk)
    if (!visibleChunk) return
    console.debug("[ai-chat] assistant chunk commit", { tempId, chunkLength: visibleChunk.length })
    setPendingMsgs((prev) =>
      prev.map((message) =>
        message.id === tempId
          ? {
              ...message,
              content: `${message.content ?? ""}${visibleChunk}`,
              content_json: appendTextBlock(normalizeAiRenderableBlocks(message.content_json), visibleChunk),
              status: "streaming",
            }
          : message
      )
    )
  }

  const handleAssistantStreamStatus = (tempId: string, statusText: string | null) => {
    if (!statusText || statusText.trim().length === 0) {
      setAssistantActivity((prev) => (prev?.tempId === tempId ? null : prev))
      return
    }
    // Keep only latest transient activity line.
    setAssistantActivity({ tempId, text: statusText })
  }

  const handleRunId = useCallback((tempId: string, runId: string) => {
    activeRunIdRef.current = runId
    if (inFlightTurnRef.current) inFlightTurnRef.current.runId = runId
    setPendingMsgs((prev) =>
      prev.map((message) =>
        message.id === tempId ? { ...message, run_id: runId } : message,
      ),
    )
  }, [])

  const handleRunTerminalState = useCallback((tempId: string, state: AiRunTerminalState) => {
    if (inFlightTurnRef.current) inFlightTurnRef.current.terminalState = state
    if (state.run_id) {
      useAiRunProgressStore.getState().clearRun(state.run_id)
    }
    setPendingMsgs((prev) =>
      prev.map((message) => {
        if (message.id !== tempId || message.role !== "assistant") return message
        const nextStatus =
          state.kind === "failed"
            ? "failed"
            : state.kind === "interrupted"
              ? "complete"
              : (message as InFlightAssistantMessage).status
        return {
          ...message,
          status: nextStatus,
          terminal_state: state,
          run_id: state.run_id ?? (message as InFlightAssistantMessage).run_id ?? null,
        } as InFlightAssistantMessage
      }),
    )
    // Clear local transient status (e.g. "Reviewing…") on any terminal.
    setAssistantActivity((prev) => (prev?.tempId === tempId ? null : prev))
    // Authoritative quota refresh after every terminal (event usage is merged first when present).
    handleTerminalUsage(null)
  }, [handleTerminalUsage])

  const findUserMessageBeforeAssistant = useCallback(
    (assistantMessageId: string, timeline: AiMessage[]): AiMessage | null => {
      const index = timeline.findIndex((message) => message.id === assistantMessageId)
      if (index <= 0) return null
      for (let i = index - 1; i >= 0; i -= 1) {
        if (timeline[i]?.role === "user") return timeline[i] ?? null
      }
      return null
    },
    [],
  )

  const reconcileFailedAssistantRun = useCallback(
    async (assistantMessageId: string) => {
      const failedAssistant = pendingMsgs.find(
        (message) => message.id === assistantMessageId && message.role === "assistant",
      ) as InFlightAssistantMessage | undefined
      const runId =
        failedAssistant?.run_id
        ?? failedAssistant?.terminal_state?.run_id
        ?? inFlightTurnRef.current?.runId
        ?? null
      if (!runId) return
      try {
        const payload = await fetchAiChatRun(runId)
        if (payload.targets && payload.targets.length > 0) {
          useAiRunProgressStore.getState().hydrateFromReconciliation(runId, payload.targets)
        }
        const terminalKind = reconcileRunStatusToTerminal(payload.run.status)
        if (!terminalKind) return
        const terminalState = reduceRunTerminalState(failedAssistant?.terminal_state ?? null, {
          kind: terminalKind,
          run_id: runId,
          message_id: payload.message?.id ?? null,
          code: payload.error?.code ?? payload.run.code ?? null,
          message: payload.error?.message ?? payload.run.message ?? null,
          retryable: payload.error?.retryable ?? payload.run.retryable ?? null,
        })
        handleRunTerminalState(assistantMessageId, terminalState)
        if (typeof payload.message?.content === "string" && payload.message.content.trim()) {
          handleAssistantStreamComplete(assistantMessageId, {
            content: payload.message.content,
            messageId: payload.message.id ?? null,
          })
        }
      } catch (error) {
        console.error("[ai-chat] manual run reconcile failed", error)
      }
    },
    [handleRunTerminalState, pendingMsgs],
  )

  const handleAiChatV2RunEvent = useCallback(
    (tempId: string, event: AiChatV2RunEvent) => {
      const isTerminalUsageEvent =
        event.type === "message.completed"
        || event.type === "run.failed"
        || event.type === "run.interrupted"
      if (isTerminalUsageEvent) {
        // Merge server usage into quota UI (zero tokens is valid when no provider call ran).
        const usage = "usage" in event ? event.usage ?? null : null
        handleTerminalUsage(usage)
      } else if ("usage" in event && event.usage) {
        applyUsageSnapshot(event.usage)
      }
      if (event.type === "target.progress") {
        const progress = targetProgressFromV2Event(event)
        useAiRunProgressStore.getState().upsertTargetProgress(progress)
        const summary = useAiRunProgressStore.getState().getActiveSummaryLine(event.run_id)
        if (summary) setAssistantActivity({ tempId, text: summary })
        return
      }
      if (event.type === "ambiguous_target_confirmation_required") {
        applyClarification(
          ambiguousTargetToClarification({
            event,
            assistantMessageId: tempId,
          }),
        )
      }
    },
    [applyClarification, applyUsageSnapshot, handleTerminalUsage],
  )

  useEffect(() => {
    if (!publicUserId) {
      setCanReviewLimits(false)
      return
    }
    void canCurrentUserManageAiLimits(publicUserId).then(setCanReviewLimits)
  }, [publicUserId])

  const handleAssistantStreamComplete = (
    tempId: string,
    payload: { content?: string; messageId?: string | null }
  ) => {
    console.debug("[ai-chat] assistant complete reconcile", { tempId, messageId: payload.messageId ?? null, contentLength: (payload.content ?? "").length })
    const terminalState = inFlightTurnRef.current?.terminalState ?? null
    setPendingMsgs((prev) =>
      prev.map((message) => {
        if (message.id !== tempId) return message
        const content = payload.content != null ? normalizeStreamTextChunk(payload.content) : message.content ?? ""
        const existingBlocks = normalizeAiRenderableBlocks(message.content_json)
        const contentBlocks =
          content.trim().length > 0
            ? (buildAssistantContentJsonFromMarkdown(content, existingBlocks) as StreamingBlock[])
            : existingBlocks
        const existingClarification =
          message.content_json
          && typeof message.content_json === "object"
          && !Array.isArray(message.content_json)
          && (message.content_json as Record<string, unknown>).clarification_request
            ? (message.content_json as Record<string, unknown>).clarification_request
            : null
        const contentJson = existingClarification
          ? {
              blocks: contentBlocks,
              clarification_request: existingClarification,
            }
          : contentBlocks
        const existingTerminal = (message as InFlightAssistantMessage).terminal_state ?? terminalState
        const nextStatus =
          existingTerminal?.kind === "failed"
            ? "failed"
            : "complete"
        return {
          ...message,
          content,
          content_json: contentJson,
          status: nextStatus,
          terminal_state: existingTerminal ?? null,
          reconciled_message_id: payload.messageId ?? (message as InFlightAssistantMessage).reconciled_message_id ?? null,
        } as InFlightAssistantMessage
      })
    )
    setAssistantActivity((prev) => (prev?.tempId === tempId ? null : prev))
    // message.completed must not clear clarification cards — only alias temp → persisted id.
    if (payload.messageId) {
      const persistedMessageId = payload.messageId
      setPendingClarification((prev) => {
        if (!prev) return prev
        if (prev.assistantMessageId !== tempId && prev.id !== tempId) return prev
        return {
          ...prev,
          assistantMessageId: persistedMessageId,
          id: persistedMessageId,
        }
      })
      for (const [streamKey, stream] of Object.entries(useComponentEditStreamStore.getState().streams)) {
        if (stream.chatArtifactsByAssistantId[tempId]) {
          useComponentEditStreamStore
            .getState()
            .aliasChatArtifactMessageId(streamKey, tempId, payload.messageId)
        }
      }
      useComponentPlanTraceStore.getState().aliasAssistantMessageId(tempId, payload.messageId)
      useAiRequestPlanStore.getState().aliasAssistantMessageId(tempId, payload.messageId)
      useAiChangePreviewStreamStore.getState().aliasAssistantMessageId(tempId, payload.messageId)
      useAiOrchestratedBuildStore.getState().aliasAssistantMessageId(tempId, payload.messageId)
    }
    useComponentEditStreamStore.getState().finalizeAssistantMessagePreviews(tempId)
    const titleState = threadTitleStreamRef.current
    if (titleState?.assistantTempId === tempId && !titleState.hasCompleted) {
      onThreadTitlePreview?.(thread.id, null)
    }
    threadTitleStreamRef.current = null
  }

  const resolvePreviewComponentTitle = useCallback(
    (args: {
      taskId: number
      channelId: number
      componentId: string
      eventTitle?: string | null
    }) => {
      if (args.eventTitle && !isGenericComponentPreviewTitle(args.eventTitle)) {
        return args.eventTitle
      }
      const bootstrapTitle = resolveComponentTitleFromQueryCache(queryClient, args)
      return bootstrapTitle || args.eventTitle || "Component"
    },
    [queryClient],
  )

  const syncEditStreamPreviewToContentTab = useCallback(
    (ctx: ComponentEditStreamContext) => {
      const stream = useComponentEditStreamStore.getState().getStream(ctx.key)
      if (!stream || !isLiveComponentEditStream(stream)) return
      if (!stream.hasPreviewContent && !stream.isStreaming && stream.phase !== "started") return
      patchComponentEditStreamPreview(ctx)
    },
    [patchComponentEditStreamPreview],
  )

  const handleComponentEditPreviewEvent = useCallback(
    (tempId: string, event: AiChatComponentEditPreviewEvent) => {
      const baseContentText =
        typeof event.before_content_text === "string"
          ? event.before_content_text
          : typeof event.base_content_text === "string"
            ? event.base_content_text
            : event.phase === "started"
              ? resolveComponentOutputPlainTextFromQueryCache(queryClient, {
                  taskId: event.task_id,
                  channelId: event.channel_id,
                  componentId: event.component_id,
                  taskComponentOutputId: event.task_component_output_id,
                })
              : null
      const ctx = applyComponentEditPreviewEvent(event, tempId, {
        baseContentText: baseContentText ?? undefined,
        threadId: thread.id,
        // Live preview events are delivered only on this thread's own in-flight stream, so they
        // always belong to the current request. Do NOT gate by activeChannelId: a build can target
        // a different channel than the one currently open (e.g. building "Blog" while viewing
        // "Overview"). Gating here previously dropped every live event and the cards only appeared
        // once the final message was hydrated (which bypasses this guard). Thread scoping + per-message
        // grouping already prevent cross-thread leakage at render time.
        allowedChannelIds: [event.channel_id],
      })
      if (!ctx) return
      activeComponentEditStreamRef.current = ctx
      if (event.phase === "saved") {
        const stream = useComponentEditStreamStore.getState().getStream(ctx.key)
        if (stream) {
          const savedBlocks = buildEditStreamOptimisticOutputBlocks({
            ...stream,
            operation: "replace",
            baseContentText: "",
          })
          const savedText =
            typeof event.content_text === "string" && event.content_text.length > 0
              ? event.content_text
              : stream.contentText
          patchTaskComponentOutput({
            taskId: ctx.taskId,
            channelId: ctx.channelId,
            taskComponentOutputId: ctx.taskComponentOutputId ?? stream.taskComponentOutputId,
            candidateTaskComponentIds: [ctx.componentId],
            finalBlocks: savedBlocks,
            strategy: "replace",
            contentText: savedText,
            trace: "component-edit-stream-saved",
          })
        }
        invalidateTaskChannelContentQueries(queryClient, {
          taskId: event.task_id,
          channelId: event.channel_id,
          outputId: event.task_component_output_id ?? null,
        })
        return
      }
      syncEditStreamPreviewToContentTab(ctx)
    },
    [activeChannelId, patchTaskComponentOutput, queryClient, syncEditStreamPreviewToContentTab, taskId, thread.id],
  )

  const handleAiChangePreviewEvent = useCallback(
    (tempId: string, event: AiChatChangePreviewEvent) => {
      applyAiChangePreviewEvent(event, tempId, { threadId: thread.id })
      if (
        event.phase === "saved"
        && (event.entity_type === "task_channel" || event.entity_type === "task_channel_component" || event.component_id)
      ) {
        invalidateTaskChannelContentQueries(queryClient, {
          taskId: event.task_id,
          channelId: event.channel_id,
          outputId: event.task_component_output_id ?? null,
        })
      }
    },
    [queryClient, thread.id],
  )

  const handleComponentLibraryTraceEvent = useCallback(
    (tempId: string, event: AiChatComponentLibraryTraceEvent) => {
      useComponentPlanTraceStore.getState().upsertLibraryTrace({
        threadId: thread.id,
        assistantMessageId: tempId,
        payload: event,
      })
    },
    [thread.id],
  )

  const handleComponentPlanTraceEvent = useCallback(
    (tempId: string, event: AiChatComponentPlanTraceEvent) => {
      useComponentPlanTraceStore.getState().upsertPlanTrace({
        threadId: thread.id,
        assistantMessageId: tempId,
        payload: event,
      })
    },
    [thread.id],
  )

  const handleRequestPlanEvent = useCallback(
    (tempId: string, event: AiChatRequestPlanEvent) => {
      useAiRequestPlanStore.getState().upsertFromStreamEvent({
        threadId: thread.id,
        assistantMessageId: tempId,
        payload: event,
      })
    },
    [thread.id],
  )

  const handleAssistantStreamAsset = useCallback((tempId: string, event: AiChatAssetEvent) => {
    const payload = event as Record<string, unknown>
    console.debug("[ai-chat] __AI_ASSET__ parsed", {
      tempId,
      attachment_id: typeof payload.attachment_id === "string" ? payload.attachment_id : null,
      asset_key: typeof payload.asset_key === "string" ? payload.asset_key : null,
      signed_url: typeof payload.signed_url === "string" ? payload.signed_url : null,
    })
    const attachmentRecord =
      payload.attachment && typeof payload.attachment === "object"
        ? (payload.attachment as Record<string, unknown>)
        : null
    const fallbackRecord: Record<string, unknown> = {
      id: typeof payload.attachment_id === "string" ? payload.attachment_id : undefined,
      attachment_id: typeof payload.attachment_id === "string" ? payload.attachment_id : undefined,
      file_name: typeof payload.file_name === "string" ? payload.file_name : undefined,
      file_path: typeof payload.file_path === "string" ? payload.file_path : undefined,
      mime_type: typeof payload.mime_type === "string" ? payload.mime_type : undefined,
      size: toFiniteNumber(payload.size) ?? 0,
      signed_url: typeof payload.signed_url === "string" ? payload.signed_url : undefined,
    }
    const attachment = toAttachmentMeta(attachmentRecord ?? fallbackRecord)
    if (!attachment) return
    const assetKey = typeof payload.asset_key === "string" ? payload.asset_key : null
    if (attachment.id) {
      assetByAttachmentIdRef.current[attachment.id] = attachment
    }
    if (assetKey) {
      assetByAssetKeyRef.current[assetKey] = attachment
    }

    setPendingMsgs((prev) =>
      prev.map((message) => {
        if (message.id !== tempId || message.role !== "assistant") return message
        const existingBlocks = normalizeAiRenderableBlocks(message.content_json)
        const existingKey = attachment.id || attachment.file_path
        const hasExisting = existingBlocks.some((block) => {
          if (block.type !== "attachment") return false
          if (typeof block.attachment_id === "string" && block.attachment_id.length > 0) {
            return block.attachment_id === attachment.id
          }
          if (block.attachment && typeof block.attachment.file_path === "string") {
            return block.attachment.file_path === attachment.file_path
          }
          return false
        })
        if (hasExisting) return message
        const nextBlocks: StreamingBlock[] = [
          ...existingBlocks,
          {
            type: "attachment",
            attachment_id: attachment.id ?? null,
            asset_key: assetKey,
            media_type: typeof payload.media_type === "string" ? payload.media_type : null,
            mime_type: typeof payload.mime_type === "string" ? payload.mime_type : attachment.mime_type,
            file_path: typeof payload.file_path === "string" ? payload.file_path : attachment.file_path,
            signed_url: typeof payload.signed_url === "string" ? payload.signed_url : attachment.preview_url ?? null,
            width_pct: toFiniteNumber(payload.width_pct),
            alt_text: typeof payload.alt_text === "string" ? payload.alt_text : null,
            caption: typeof payload.caption === "string" ? payload.caption : null,
            missing_attachment: false,
            attachment: {
              id: attachment.id ?? undefined,
              attachment_id: attachment.id ?? undefined,
              file_name: attachment.file_name,
              file_path: attachment.file_path,
              mime_type: attachment.mime_type,
              size: attachment.size,
              signed_url: attachment.preview_url ?? null,
            },
          },
        ]
        return {
          ...message,
          attachments:
            existingKey != null
              ? mergeUniqueAttachments(message.attachments as AiAttachmentMeta[] | null | undefined, [attachment])
              : (message.attachments ?? []),
          content_json: nextBlocks,
          status: "streaming",
        }
      })
    )

    const isBuildComponentMode = chatContext?.mode === "build_component"
    const currentBuildComponentId =
      typeof chatContext?.componentId === "string" ? chatContext.componentId : null
    const metadataOutputId =
      payload.attachment && typeof payload.attachment === "object"
        ? (() => {
            const metadata = (payload.attachment as Record<string, unknown>).metadata
            if (!metadata || typeof metadata !== "object") return null
            return typeof (metadata as Record<string, unknown>).task_component_output_id === "string"
              ? ((metadata as Record<string, unknown>).task_component_output_id as string)
              : null
          })()
        : null
    const outputIdFromPayload =
      typeof payload.task_component_output_id === "string" ? payload.task_component_output_id : metadataOutputId
    if (
      isBuildComponentMode &&
      taskId != null &&
      activeChannelId != null &&
      currentBuildComponentId
    ) {
      patchTaskComponentOutput({
        taskId,
        channelId: activeChannelId,
        taskComponentOutputId: outputIdFromPayload,
        candidateTaskComponentIds: [currentBuildComponentId],
        finalBlocks: [
          {
            type: "attachment",
            attachment_id: typeof payload.attachment_id === "string" ? payload.attachment_id : null,
            asset_key: typeof payload.asset_key === "string" ? payload.asset_key : null,
            signed_url: typeof payload.signed_url === "string" ? payload.signed_url : null,
            file_path: typeof payload.file_path === "string" ? payload.file_path : null,
            mime_type: typeof payload.mime_type === "string" ? payload.mime_type : null,
            media_type: typeof payload.media_type === "string" ? payload.media_type : null,
            width_pct: toFiniteNumber(payload.width_pct) ?? 100,
            alt_text: typeof payload.alt_text === "string" ? payload.alt_text : null,
            caption: typeof payload.caption === "string" ? payload.caption : null,
            attachment:
              payload.attachment && typeof payload.attachment === "object"
                ? (payload.attachment as Record<string, unknown>)
                : null,
            missing_attachment: false,
          },
        ],
        strategy: "append",
        contentText: null,
        outputKind: null,
        trace: "asset-live-append",
      })
    }
  }, [activeChannelId, chatContext?.componentId, chatContext?.mode, patchTaskComponentOutput, taskId])

  const handleAssistantMessageOutput = useCallback((tempId: string, event: AiChatMessageOutputEvent) => {
    const payload = event as Record<string, unknown>
    const hasContentJson = payload.content_json != null
    const normalizedBlocks = hasContentJson
      ? normalizeAiRenderableBlocks(payload.content_json)
      : []
    const payloadAssets = Array.isArray(payload.assets) ? payload.assets : []
    const assetMetas = payloadAssets
      .map((asset) => (asset && typeof asset === "object" ? toAttachmentMeta(asset as Record<string, unknown>) : null))
      .filter((asset): asset is AiAttachmentMeta => asset != null)
    const messageId =
      typeof payload.message_id === "string"
        ? payload.message_id
        : typeof payload.id === "string"
          ? payload.id
          : null

    applyPreflightSkipsFromContentJson({
      contentJson: payload,
      threadId: thread.id,
      assistantMessageId: messageId ?? tempId,
      alternateAssistantMessageId: messageId && messageId !== tempId ? tempId : null,
    })
    if (payload.content_json != null) {
      applyPreflightSkipsFromContentJson({
        contentJson: payload.content_json,
        threadId: thread.id,
        assistantMessageId: messageId ?? tempId,
        alternateAssistantMessageId: messageId && messageId !== tempId ? tempId : null,
      })
    }

    for (const build of discoverOrchestratedBuildsFromMessageContentJson(payload)) {
      useAiOrchestratedBuildStore.getState().registerBuild({
        buildId: build.buildId,
        threadId: thread.id,
        assistantMessageId: messageId ?? tempId,
        title: build.title,
        summary: build.summary,
        changeSetId: build.changeSetId,
        startFailed: build.startFailed,
        errorCode: build.errorCode,
        errorMessage: build.errorMessage,
      })
    }
    if (payload.content_json != null) {
      for (const build of discoverOrchestratedBuildsFromMessageContentJson(payload.content_json)) {
        useAiOrchestratedBuildStore.getState().registerBuild({
          buildId: build.buildId,
          threadId: thread.id,
          assistantMessageId: messageId ?? tempId,
          title: build.title,
          summary: build.summary,
          changeSetId: build.changeSetId,
          startFailed: build.startFailed,
          errorCode: build.errorCode,
          errorMessage: build.errorMessage,
        })
      }
    }

    // Component edit/save turns emit both `__AI_COMPONENT_EDIT_PREVIEW__` and `__AI_MESSAGE_OUTPUT__`
    // carrying the SAME component body. Rendering that body as plain assistant text duplicates the
    // preview card and causes a flicker. For component-linked outputs we finalize the existing
    // preview card from this payload and keep only any streamed summary in the bubble.
    const hasExistingPreviewForMessage = Object.values(
      useComponentEditStreamStore.getState().streams,
    ).some((stream) => stream.assistantTempId === tempId)
    const componentLinked = detectComponentLinkedMessageOutput(payload, {
      hasExistingPreviewForMessage,
    })

    if (componentLinked.isComponentLinked) {
      const card = componentLinked.card
      if (card) {
        // Finalize (or create, if a preview event never arrived) the card in-place — never unmount.
        useComponentEditStreamStore.getState().upsertFromPreviewEvent({
          threadId: thread.id,
          taskId: card.taskId,
          channelId: card.channelId,
          componentId: card.componentId,
          taskComponentOutputId: card.taskComponentOutputId,
          componentTitle: card.componentTitle ?? undefined,
          assistantTempId: tempId,
          operation: card.operation ?? undefined,
          phase: "completed",
          contentText: card.contentText || undefined,
          contentJson: normalizePreviewContentJson(card.contentJson),
        })
      }

      setPendingMsgs((prev) =>
        prev.map((message) => {
          if (message.id !== tempId || message.role !== "assistant") return message
          const mergedAttachments = mergeUniqueAttachments(
            message.attachments as AiAttachmentMeta[] | null | undefined,
            assetMetas,
          )
          for (const attachment of mergedAttachments) {
            if (attachment.id) assetByAttachmentIdRef.current[attachment.id] = attachment
          }
          // Keep any streamed summary/narration; never replace it with the component body.
          return {
            ...message,
            attachments: mergedAttachments,
            status: "complete",
            reconciled_message_id:
              messageId ?? (message as InFlightAssistantMessage).reconciled_message_id ?? null,
          } as InFlightAssistantMessage
        }),
      )

      const clarificationAssistantId = messageId ?? tempId
      const clarificationFromPayload =
        parseClarificationFromMessageContentJson(payload.content_json, {
          assistantMessageId: clarificationAssistantId,
        })
        ?? parseClarificationRequestRecord(payload, { assistantMessageId: clarificationAssistantId })
      if (clarificationFromPayload) {
        applyClarification(clarificationFromPayload)
      }
      return
    }

    setPendingMsgs((prev) =>
      prev.map((message) => {
        if (message.id !== tempId || message.role !== "assistant") return message
        const mergedAttachments = mergeUniqueAttachments(
          message.attachments as AiAttachmentMeta[] | null | undefined,
          assetMetas
        )
        for (const attachment of mergedAttachments) {
          if (attachment.id) assetByAttachmentIdRef.current[attachment.id] = attachment
        }
        const mergedAttachmentById: Record<string, AiAttachmentMeta> = {}
        for (const attachment of mergedAttachments) {
          if (!attachment.id) continue
          mergedAttachmentById[attachment.id] = attachment
        }
        const hydratedFromPayload = hydrateBlocksWithAssets(normalizedBlocks, payload.assets)
        const hydratedBlocks: StreamingBlock[] = hydratedFromPayload.map((block) => {
          if (block.type !== "attachment") return block
          const aid = blockAttachmentId(block)
          const fromStreamAsset = aid ? assetByAttachmentIdRef.current[aid] : null
          const fromMerged = aid ? mergedAttachmentById[aid] : null
          if (block.attachment || block.signed_url || block.file_path) return block
          const fallback =
            (fromStreamAsset
              ? {
                  id: fromStreamAsset.id,
                  attachment_id: fromStreamAsset.id,
                  file_name: fromStreamAsset.file_name,
                  file_path: fromStreamAsset.file_path,
                  mime_type: fromStreamAsset.mime_type,
                  size: fromStreamAsset.size,
                  signed_url: fromStreamAsset.preview_url ?? null,
                }
              : null) ??
            (fromMerged
              ? {
                  id: fromMerged.id,
                  attachment_id: fromMerged.id,
                  file_name: fromMerged.file_name,
                  file_path: fromMerged.file_path,
                  mime_type: fromMerged.mime_type,
                  size: fromMerged.size,
                  signed_url: fromMerged.preview_url ?? null,
                }
              : null)
          return {
            ...block,
            attachment: fallback,
            signed_url: block.signed_url ?? (typeof fallback?.signed_url === "string" ? fallback.signed_url : null),
            file_path: block.file_path ?? (typeof fallback?.file_path === "string" ? fallback.file_path : null),
            mime_type: block.mime_type ?? (typeof fallback?.mime_type === "string" ? fallback.mime_type : null),
            missing_attachment: fallback ? false : true,
          }
        })
        const contentText = typeof payload.content_text === "string" ? payload.content_text : null
        const resolvedBlocks: StreamingBlock[] =
          contentText && contentText.trim()
            ? (buildAssistantContentJsonFromMarkdown(contentText, hydratedBlocks) as StreamingBlock[])
            : (enhanceBlocksWithMarkdownTables(hydratedBlocks, contentText) as StreamingBlock[])
        const existingClarification =
          message.content_json
          && typeof message.content_json === "object"
          && !Array.isArray(message.content_json)
          && (message.content_json as Record<string, unknown>).clarification_request
            ? (message.content_json as Record<string, unknown>).clarification_request
            : null
        const payloadClarification =
          payload.content_json
          && typeof payload.content_json === "object"
          && !Array.isArray(payload.content_json)
          && (payload.content_json as Record<string, unknown>).clarification_request
            ? (payload.content_json as Record<string, unknown>).clarification_request
            : null
        const clarificationPayload = payloadClarification ?? existingClarification
        const nextContentJson = clarificationPayload
          ? {
              blocks: resolvedBlocks.length > 0 ? resolvedBlocks : [],
              clarification_request: clarificationPayload,
            }
          : resolvedBlocks.length > 0
            ? resolvedBlocks
            : message.content_json ?? []
        return {
          ...message,
          content: contentText ?? "",
          content_json: nextContentJson,
          attachments: mergedAttachments,
          status: "complete",
          reconciled_message_id: messageId ?? (message as InFlightAssistantMessage).reconciled_message_id ?? null,
        } as InFlightAssistantMessage
      })
    )

    // Upsert by message_id — stream status + message_output share one card.
    const clarificationAssistantId = messageId ?? tempId
    const clarificationFromPayload =
      parseClarificationFromMessageContentJson(payload.content_json, {
        assistantMessageId: clarificationAssistantId,
      })
      ?? parseClarificationRequestRecord(payload, { assistantMessageId: clarificationAssistantId })
    if (clarificationFromPayload) {
      applyClarification(clarificationFromPayload)
    }
  }, [applyClarification, thread.id])

  const handleAssistantComponentOutput = useCallback(
    (tempId: string, event: AiChatComponentOutputEvent) => {
      const payload = event as Record<string, unknown>
      console.debug("[ai-chat] __AI_COMPONENT_OUTPUT__ parsed", {
        tempId,
        task_id: payload.task_id ?? null,
        channel_id: payload.channel_id ?? null,
        component_id: payload.component_id ?? null,
        task_component_id: payload.task_component_id ?? null,
        task_component_output_id: payload.task_component_output_id ?? null,
        has_content_json: payload.content_json != null,
      })
      const payloadTaskId = toFiniteNumber(payload.task_id)
      const payloadChannelId = toFiniteNumber(payload.channel_id)
      const shouldRefetchBootstrap = payloadTaskId != null && payloadChannelId != null
      const hasContentJson = payload.content_json != null
      const payloadTaskComponentOutputId =
        typeof payload.task_component_output_id === "string" ? payload.task_component_output_id : null
      const payloadComponentId = typeof payload.component_id === "string" ? payload.component_id : null
      const payloadTaskComponentId = typeof payload.task_component_id === "string" ? payload.task_component_id : null
      const candidateTaskComponentIds = [payloadComponentId, payloadTaskComponentId].filter(
        (id): id is string => typeof id === "string" && id.length > 0
      )

      const finalBlocks = hasContentJson
        ? hydrateBlocksWithAssets(normalizeAiRenderableBlocks(payload.content_json), payload.assets)
        : []

      setPendingMsgs((prev) =>
        prev.map((message) => {
          if (message.id !== tempId || message.role !== "assistant") return message
          return {
            ...message,
            content: "",
            content_json: finalBlocks.length > 0 ? finalBlocks : message.content_json ?? [],
            status: "complete",
          } as InFlightAssistantMessage
        })
      )

      if (shouldRefetchBootstrap && candidateTaskComponentIds.length > 0 && finalBlocks.length > 0) {
        patchTaskComponentOutput({
          taskId: payloadTaskId!,
          channelId: payloadChannelId!,
          taskComponentOutputId: payloadTaskComponentOutputId,
          candidateTaskComponentIds,
          finalBlocks,
          strategy: "replace",
          contentText: typeof payload.content_text === "string" ? payload.content_text : null,
          outputKind: typeof payload.output_kind === "string" ? payload.output_kind : null,
          trace: "component-output-final-event",
        })
      }

      if (shouldRefetchBootstrap) {
        void queryClient.invalidateQueries({
          queryKey: ["task-channel-bootstrap", payloadTaskId, payloadChannelId],
        })
        void queryClient.invalidateQueries({
          queryKey: ["task-channel-composed-output", payloadTaskId, payloadChannelId],
        })
        void queryClient.invalidateQueries({
          queryKey: ["tc_components_for_task_channel", payloadTaskId, payloadChannelId],
        })
      }

      if (!shouldRefetchBootstrap) return
      void (async () => {
        try {
          const bootstrap = await fetchTaskChannelBootstrap(payloadTaskId!, payloadChannelId!, "")
          const match = (bootstrap.composed_output ?? []).find((row) => {
            if (payloadTaskComponentOutputId && row.task_component_output_id === payloadTaskComponentOutputId) {
              return true
            }
            if (payloadComponentId && row.task_component_id === payloadComponentId) return true
            if (payloadTaskComponentId && row.task_component_id === payloadTaskComponentId) return true
            return false
          })
          if (!match) return
          const rowContent = match.content ?? match.resolved_content_json ?? match.content_json
          const resolvedBlocks = normalizeAiRenderableBlocks(rowContent).map((block) =>
            block.type === "attachment" ? { ...block, missing_attachment: block.attachment ? false : null } : block
          )
          if (resolvedBlocks.length === 0) return
          patchTaskComponentOutput({
            taskId: payloadTaskId!,
            channelId: payloadChannelId!,
            taskComponentOutputId: payloadTaskComponentOutputId ?? match.task_component_output_id ?? null,
            candidateTaskComponentIds,
            finalBlocks: resolvedBlocks,
            strategy: "replace",
            contentText: typeof payload.content_text === "string" ? payload.content_text : null,
            outputKind: typeof payload.output_kind === "string" ? payload.output_kind : null,
            trace: "component-output-bootstrap-refetch",
          })
          setPendingMsgs((prev) =>
            prev.map((message) => {
              if (message.id !== tempId || message.role !== "assistant") return message
              return {
                ...message,
                content: "",
                content_json: resolvedBlocks,
                status: "complete",
              } as InFlightAssistantMessage
            })
          )
        } catch (error) {
          console.error("Failed to refetch task-channel-bootstrap for component output", error)
        }
      })()
    },
    [patchTaskComponentOutput, queryClient]
  )

  const handleAiChatAction = useCallback(
    (action: AiChatStreamAction) => {
      if (action.type === "clarification_request") {
        applyClarification(
          clarificationActionToRequest(action, {
            assistantMessageId: streamingAssistantTempIdRef.current,
            runId: inFlightTurnRef.current?.runId ?? null,
          }),
        )
        return
      }
      if (action.type !== "content_saved") return
      const id = `saved-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
      setContentSavedCards((prev) => [...prev, { id, action }])
      if (taskId != null && action.task_id === taskId) {
        applyContentSavedAction(queryClient, action)
      }
    },
    [applyClarification, taskId, queryClient],
  )

  const handleAssistantStreamError = (tempId: string) => {
    console.debug("[ai-chat] assistant stream marked failed", { tempId })
    const existingTerminal = inFlightTurnRef.current?.terminalState
    if (existingTerminal?.kind === "failed" || existingTerminal?.kind === "interrupted") {
      setAssistantActivity((prev) => (prev?.tempId === tempId ? null : prev))
      return
    }
    for (const stream of Object.values(useComponentEditStreamStore.getState().streams)) {
      if (stream.assistantTempId !== tempId) continue
      useComponentEditStreamStore.getState().upsertFromPreviewEvent({
        taskId: stream.taskId,
        channelId: stream.channelId,
        componentId: stream.componentId,
        phase: "failed",
        errorMessage: "Assistant stream failed",
      })
    }
    activeComponentEditStreamRef.current = null
    setPendingMsgs((prev) =>
      prev.map((message) =>
        message.id === tempId && message.role === "assistant"
          ? { ...message, status: "failed" }
          : message
      )
    )
    setAssistantActivity((prev) => (prev?.tempId === tempId ? null : prev))
    const titleState = threadTitleStreamRef.current
    if (titleState?.assistantTempId === tempId && !titleState.hasCompleted) {
      onThreadTitlePreview?.(thread.id, null)
    }
    threadTitleStreamRef.current = null
  }

  const handleThreadTitleEvent = useCallback(
    (tempId: string, event: AiChatThreadTitleEvent) => {
      if (isComponentBuildingFlow) return
      if (tempId !== threadTitleStreamRef.current?.assistantTempId) return

      const current = threadTitleStreamRef.current
      if (!current) return

      if (event.phase === "started") {
        threadTitleStreamRef.current = {
          ...current,
          hasStarted: true,
          buffer: "",
          hasCompleted: false,
        }
        return
      }

      if (event.phase === "delta") {
        const nextBuffer = `${current.buffer}${event.delta ?? ""}`
        threadTitleStreamRef.current = {
          ...current,
          hasStarted: true,
          buffer: nextBuffer,
        }
        onThreadTitlePreview?.(thread.id, nextBuffer)
        return
      }

      const completedTitle = (event.title ?? current.buffer ?? "").trim()
      threadTitleStreamRef.current = {
        ...current,
        hasStarted: true,
        hasCompleted: true,
        buffer: completedTitle,
      }
      if (completedTitle.length > 0) {
        onThreadTitlePreview?.(thread.id, completedTitle)
        onThreadTitlePersist?.(thread.id, completedTitle)
      } else {
        onThreadTitlePreview?.(thread.id, null)
      }
    },
    [isComponentBuildingFlow, onThreadTitlePersist, onThreadTitlePreview, thread.id]
  )

  // Visible UI context only — never used as an explicit write target without a pill/action.
  const ambientContext = useMemo((): AiAmbientContext => {
    const taskTab = searchParams.get("taskTab")
    return {
      center_task_id: taskId ?? null,
      active_channel_id: activeChannelId ?? null,
      ...(taskTab ? { taskTab } : {}),
    }
  }, [taskId, activeChannelId, searchParams])

  const resolveChatSelection = useCallback(
    (container: HTMLElement, range: Range): AiSelectedTextContext | null => {
      const parts = computeRangeTextParts(container, range)
      if (!parts.selected_text.trim()) return null
      const messageId = container.getAttribute("data-message-id") || undefined
      const roleAttr = container.getAttribute("data-message-role")
      const role = roleAttr === "assistant" || roleAttr === "user" ? roleAttr : undefined
      return {
        source_type: "chat_message",
        selected_text: parts.selected_text,
        selection_before: parts.selection_before,
        selection_after: parts.selection_after,
        ...(messageId ? { message_id: messageId } : {}),
        ...(role ? { role } : {}),
      }
    },
    [],
  )

  const resendAfterUserMessageEdit = useCallback(
    async (args: {
      editedMessage: AiMessage
      newContent: string
      attachments: AiAttachmentMeta[]
      taggedTaskIds: number[]
      taggedProjectIds: number[]
      taggedUserIds: number[]
      taggedChannelIds?: number[]
      taggedTaskChannelRefs?: TaggedTaskChannelRef[]
      taggedTaskComponentRefs?: TaggedTaskComponentRef[]
    }) => {
      setPendingMsgs([])
      setAssistantActivity(null)
      const cutoff = args.editedMessage.created_at
      const editedId = args.editedMessage.id
      queryClient.setQueryData(
        ["ai-messages", thread.id, MESSAGES_PAGE_SIZE_DEFAULT],
        (old: AiMessage[] | undefined) => {
          if (!old) return []
          return old
            .filter((m) => m.id === editedId || m.created_at < cutoff)
            .map((m) => (m.id === editedId ? { ...m, content: args.newContent } : m))
        }
      )

      await sendConversationAiChatStream({
        threadId: thread.id,
        message: args.newContent,
        attachments: args.attachments,
        activeChannelId: activeChannelId ?? null,
        taggedTaskIds: args.taggedTaskIds,
        taggedProjectIds: args.taggedProjectIds,
        taggedUserIds: args.taggedUserIds,
        taggedChannelIds: args.taggedChannelIds,
        taggedTaskChannelRefs: args.taggedTaskChannelRefs,
        taggedTaskComponentRefs: args.taggedTaskComponentRefs,
        mode: chatContext?.mode ?? null,
        componentId: chatContext?.componentId ?? null,
        ambientContext,
        modelKey,
        autoRun: false,
        stream: true,
        includeOptimisticUser: false,
        onAssistantStreamStart: handleAssistantStreamStart,
        onAssistantStreamChunk: handleAssistantStreamChunk,
        onAssistantStreamStatus: handleAssistantStreamStatus,
        onAssistantStreamComplete: handleAssistantStreamComplete,
        onAssistantStreamError: handleAssistantStreamError,
        onAiChatAction: handleAiChatAction,
        onThreadTitleEvent: handleThreadTitleEvent,
        onAssetEvent: handleAssistantStreamAsset,
        onMessageOutputEvent: handleAssistantMessageOutput,
        onComponentOutputEvent: handleAssistantComponentOutput,
        onComponentEditPreviewEvent: handleComponentEditPreviewEvent,
        onAiChangePreviewEvent: handleAiChangePreviewEvent,
        onComponentLibraryTraceEvent: handleComponentLibraryTraceEvent,
        onComponentPlanTraceEvent: handleComponentPlanTraceEvent,
        onRequestPlanEvent: handleRequestPlanEvent,
      })
    },
    [
      queryClient,
      thread.id,
      activeChannelId,
      ambientContext,
      modelKey,
      chatContext?.mode,
      chatContext?.componentId,
      handleAssistantStreamStart,
      handleAssistantStreamChunk,
      handleAssistantStreamStatus,
      handleAssistantStreamComplete,
      handleAssistantStreamError,
      handleAiChatAction,
      handleThreadTitleEvent,
      handleAssistantStreamAsset,
      handleAssistantMessageOutput,
      handleAssistantComponentOutput,
      handleComponentEditPreviewEvent,
      handleAiChangePreviewEvent,
      handleComponentLibraryTraceEvent,
      handleComponentPlanTraceEvent,
      handleRequestPlanEvent,
    ]
  )

  const retryFailedAssistantRun = useCallback(
    async (assistantMessageId: string) => {
      const timeline = buildRenderableMessages(messages || [], pendingMsgs)
      const userMessage = findUserMessageBeforeAssistant(assistantMessageId, timeline)
      const failedAssistant = pendingMsgs.find(
        (message) => message.id === assistantMessageId && message.role === "assistant",
      ) as InFlightAssistantMessage | undefined
      const clientRequestId =
        failedAssistant?.client_request_id
        ?? inFlightTurnRef.current?.clientRequestId
        ?? null
      if (!userMessage?.content?.trim() || !clientRequestId) return

      setPendingMsgs((prev) => prev.filter((message) => message.id !== assistantMessageId))
      setAssistantActivity(null)

      const v2Request = buildAiChatV2RequestFields({
        clientRequestId,
        visibleTaskId: taskId ?? null,
        visibleChannelId: activeChannelId ?? null,
        ambientContext,
      })

      streamAbortRef.current?.abort()
      streamAbortRef.current = new AbortController()

      await sendConversationAiChatStream({
        threadId: thread.id,
        message: userMessage.content.trim(),
        attachments: userMessage.attachments ?? [],
        activeChannelId: activeChannelId ?? null,
        taggedTaskIds: [],
        taggedProjectIds: [],
        taggedUserIds: [],
        mode: chatContext?.mode ?? null,
        componentId: chatContext?.componentId ?? null,
        ambientContext,
        modelKey,
        autoRun: false,
        stream: true,
        includeOptimisticUser: false,
        clientRequestId,
        v2Request,
        inFlightTurn: inFlightTurnRef.current,
        signal: streamAbortRef.current.signal,
        onAssistantStreamStart: handleAssistantStreamStart,
        onAssistantStreamChunk: handleAssistantStreamChunk,
        onAssistantStreamStatus: handleAssistantStreamStatus,
        onAssistantStreamComplete: handleAssistantStreamComplete,
        onAssistantStreamError: handleAssistantStreamError,
        onAiChatAction: handleAiChatAction,
        onThreadTitleEvent: handleThreadTitleEvent,
        onAssetEvent: handleAssistantStreamAsset,
        onMessageOutputEvent: handleAssistantMessageOutput,
        onComponentOutputEvent: handleAssistantComponentOutput,
        onComponentEditPreviewEvent: handleComponentEditPreviewEvent,
        onAiChangePreviewEvent: handleAiChangePreviewEvent,
        onComponentLibraryTraceEvent: handleComponentLibraryTraceEvent,
        onComponentPlanTraceEvent: handleComponentPlanTraceEvent,
        onRequestPlanEvent: handleRequestPlanEvent,
        onAiChatV2RunEvent: handleAiChatV2RunEvent,
        onRunId: handleRunId,
        onRunTerminalState: handleRunTerminalState,
      })
    },
    [
      activeChannelId,
      ambientContext,
      chatContext?.componentId,
      chatContext?.mode,
      findUserMessageBeforeAssistant,
      handleAiChatAction,
      handleAiChatV2RunEvent,
      handleAssistantComponentOutput,
      handleAssistantMessageOutput,
      handleAssistantStreamAsset,
      handleAssistantStreamChunk,
      handleAssistantStreamComplete,
      handleAssistantStreamError,
      handleAssistantStreamStart,
      handleAssistantStreamStatus,
      handleComponentEditPreviewEvent,
      handleComponentLibraryTraceEvent,
      handleComponentPlanTraceEvent,
      handleRequestPlanEvent,
      handleAiChangePreviewEvent,
      handleRunId,
      handleRunTerminalState,
      handleThreadTitleEvent,
      messages,
      modelKey,
      pendingMsgs,
      taskId,
      thread.id,
    ],
  )

  // Reconcile pending rows against persisted rows on every server snapshot update.
  React.useEffect(() => {
    if (!messages?.length) return
    setPendingMsgs((prev) => prunePendingMessagesAgainstServer(messages, prev))
  }, [messages])

  // Drop local pending/in-flight messages when this thread is restored to a point,
  // so superseded messages disappear immediately without waiting for a refetch.
  React.useEffect(() => {
    const handleRestored = (event: Event) => {
      const detail = (event as CustomEvent<AiThreadRestoredEventDetail>).detail
      if (!detail || detail.threadId !== thread.id) return
      setPendingMsgs([])
      setAssistantActivity(null)
      setPendingClarification(null)
      setDismissedClarificationId(null)
    }
    window.addEventListener(AI_THREAD_RESTORED_EVENT, handleRestored as EventListener)
    return () => window.removeEventListener(AI_THREAD_RESTORED_EVENT, handleRestored as EventListener)
  }, [thread.id])

  // Clear pending messages when thread changes
  React.useEffect(() => {
    setPendingMsgs([])
    setAssistantActivity(null)
    setContentSavedCards([])
    setPendingClarification(null)
    setDismissedClarificationId(null)
    setIsClarificationResponding(false)
    clarificationFollowUpRef.current = null
    streamingAssistantTempIdRef.current = null
    assetByAttachmentIdRef.current = {}
    assetByAssetKeyRef.current = {}
    threadTitleStreamRef.current = null
    onThreadTitlePreview?.(thread.id, null)
    useComponentEditStreamStore.getState().clearStreamsExceptThread(thread.id)
    useComponentPlanTraceStore.getState().clearBucketsExceptThread(thread.id)
    useAiRequestPlanStore.getState().clearBucketsExceptThread(thread.id)
    useAiChangePreviewStreamStore.getState().clearPreviewsExceptThread(thread.id)
    useAiOrchestratedBuildStore.getState().clearBuildsExceptThread(thread.id)
  }, [thread.id, onThreadTitlePreview])

  const headerChips = useMemo(() => {
    const chips: string[] = []
    chips.push(thread.scope)
    if (thread.visibility) chips.push(thread.visibility)
    if (context?.effective_language_code) chips.push(context.effective_language_code)
    return chips
  }, [thread.scope, thread.visibility, context?.effective_language_code])

  const mentionDirectSeed = useMemo((): MentionSuggestion[] => {
    const out: MentionSuggestion[] = []
    const seen = new Set<string>()
    const push = (s: MentionSuggestion) => {
      const k = `${s.kind}:${s.id}`
      if (seen.has(k)) return
      seen.add(k)
      out.push(s)
    }

    const tid = context?.task_id ?? taskId
    const tTitle = context?.task_title
    if (tid && tTitle) {
      push({
        kind: "task",
        id: tid,
        label: tTitle,
        task: { id: tid, title: tTitle, projectName: context?.project_name ?? null },
      })
    } else if (tid && Number.isFinite(tid)) {
      push({
        kind: "task",
        id: tid,
        label: `Task ${tid}`,
        task: { id: tid, title: `Task ${tid}`, projectName: context?.project_name ?? null },
      })
    }

    const pid = context?.project_id
    const pName = context?.project_name
    if (pid && pName) {
      push({
        kind: "project",
        id: pid,
        label: pName,
        project: { id: pid, name: pName, color: null, logo: null },
      })
    }

    const urlProjectId = searchParams.get("projectId")
    if (urlProjectId && !pid) {
      const n = Number(urlProjectId)
      if (Number.isFinite(n)) {
        push({
          kind: "project",
          id: n,
          label: `Project ${n}`,
          project: { id: n, name: `Project ${n}`, color: null, logo: null },
        })
      }
    }

    if (publicUserId && Number.isFinite(publicUserId)) {
      const label = (fullName || `Me (${publicUserId})`).trim()
      push({
        kind: "user",
        id: publicUserId,
        label,
        user: { id: publicUserId, full_name: fullName, email: null, photo: null },
      })
    }

    const assignedRaw = searchParams.get("assignedTo")
    const firstAssignee = assignedRaw?.split(",")[0]?.trim()
    if (firstAssignee) {
      const aid = Number(firstAssignee)
      if (Number.isFinite(aid) && aid !== publicUserId) {
        push({
          kind: "user",
          id: aid,
          label: `Assignee`,
          user: { id: aid, full_name: "Assignee", email: null, photo: null },
        })
      }
    }

    for (const row of getLoadedTaskRowsSnapshot().slice(0, 8)) {
      if (out.length >= 12) break
      push({
        kind: "task",
        id: row.id,
        label: row.title || `Task ${row.id}`,
        task: {
          id: row.id,
          title: row.title || `Task ${row.id}`,
          projectName: row.project_name ?? null,
          projectLogo: row.project_logo ?? null,
          projectColor: row.project_color ?? null,
        },
      })
    }

    return out
  }, [context, taskId, fullName, publicUserId, searchParams.toString()])

  const doSetVisibility = async (next: any) => {
    await updateVisibility(thread.id, next, thread.is_collaborative)
  }

  const allMessages = useMemo(
    () => buildRenderableMessages(messages || [], pendingMsgs),
    [messages, pendingMsgs]
  )

  const activeClarification = useMemo(() => {
    const candidate = pendingClarification ?? resolveActiveClarificationFromMessages(allMessages)
    if (!candidate) return null
    if (dismissedClarificationId && dismissedClarificationId === candidate.id) return null
    return candidate
  }, [pendingClarification, allMessages, dismissedClarificationId])

  useEffect(() => {
    if (!pendingClarification) {
      clarificationFollowUpRef.current = null
    }
  }, [pendingClarification])

  const effectiveActiveFieldContext = useMemo(() => {
    if (
      activeClarification
      && clarificationHasExplicitComponentContext(activeClarification)
    ) {
      return activeFieldContextFromClarification(activeClarification) ?? activeFieldContext
    }
    return activeFieldContext
  }, [activeClarification, activeFieldContext])

  const ambientTaskTitle = context?.task_title ?? null

  const threadScope = useMemo(
    () => ({
      project_id: context?.project_id ?? thread.project_id ?? null,
      task_id: context?.task_id ?? thread.task_id ?? taskId ?? null,
      channel_id: activeChannelId ?? null,
    }),
    [context?.project_id, context?.task_id, thread.project_id, thread.task_id, taskId, activeChannelId],
  )

  const activeRunProgressEntries = useMemo(() => {
    const runId = activeRunIdRef.current
    if (!runId) return []
    return Object.values(runProgressEntries).filter((entry) => entry.run_id === runId)
  }, [runProgressEntries, assistantActivity, isAssistantStreaming])

  const sendClarificationFollowUp = useCallback(
    async (args: {
      selectedOptionIds?: string[] | null
      freeText?: string | null
    }) => {
      const clarification = activeClarification
      if (!clarification || isClarificationResponding) return

      const selectedOptionIds = (args.selectedOptionIds ?? [])
        .map((id) => id.trim())
        .filter(Boolean)
      const selectedLabels = selectedOptionIds
        .map((id) => clarification.options.find((option) => option.id === id)?.label)
        .filter((label): label is string => Boolean(label?.trim()))
      const freeText = args.freeText?.trim() || null
      const displayMessage = selectedLabels.join(", ") || freeText || ""
      if (!displayMessage) return

      const clarificationMessageId =
        clarification.assistantMessageId
        ?? clarification.id
        ?? null
      const selectedOptions = selectedOptionIds
        .map((id) => clarification.options.find((option) => option.id === id))
        .filter((option): option is NonNullable<typeof option> => Boolean(option))
      // Pass option ids plus opaque value/entity_ref from the selected options — never from labels.
      const clarificationResponse = buildClarificationResponsePayload({
        clarificationMessageId,
        requestPlanId: clarification.request_plan_id ?? null,
        selectedOptionIds,
        selectedOptions,
        freeText,
      })
      const userMessageContentJson = buildClarificationUserMessageContentJson({
        clarificationResponse,
        displayMessage,
      })

      setIsClarificationResponding(true)
      clarificationFollowUpPendingClearRef.current = true
      clarificationAppliedDuringFollowUpRef.current = false
      const respondingClarificationId = clarification.id
      handleOptimistic({
        id: `temp-clarification-${Date.now()}`,
        content: displayMessage,
        attachments: [],
        content_json: userMessageContentJson,
      })

      // Ambient page fields only — not continuation authority from clarification options.
      const ambientTaskId = taskId ?? null
      const ambientChannelId = activeChannelId ?? null
      const clientRequestId = crypto.randomUUID()
      const v2Request = buildAiChatV2RequestFields({
        clientRequestId,
        visibleTaskId: ambientTaskId,
        visibleChannelId: ambientChannelId,
        ambientContext,
        threadScope,
        outputRevision: null,
        explicitBuild: null,
      })

      try {
        await sendConversationAiChatStream({
          threadId: thread.id,
          message: displayMessage,
          displayMessage,
          userMessageContentJson,
          clarificationResponse,
          attachments: [],
          activeChannelId: ambientChannelId,
          taggedTaskIds: [],
          taggedProjectIds: [],
          taggedUserIds: [],
          mode: chatContext?.mode ?? null,
          componentId: null,
          taskId: ambientTaskId,
          channelId: ambientChannelId,
          taskComponentOutputId: null,
          selectedContextType: "task",
          selectedComponentLabel: null,
          contextSource: "ambient",
          ambientContext,
          modelKey,
          autoRun: false,
          stream: true,
          includeOptimisticUser: false,
          clientRequestId,
          v2Request,
          onAssistantStreamStart: handleAssistantStreamStart,
          onAssistantStreamChunk: handleAssistantStreamChunk,
          onAssistantStreamStatus: handleAssistantStreamStatus,
          onAssistantStreamComplete: handleAssistantStreamComplete,
          onAssistantStreamError: handleAssistantStreamError,
          onAiChatAction: handleAiChatAction,
          onThreadTitleEvent: handleThreadTitleEvent,
          onAssetEvent: handleAssistantStreamAsset,
          onMessageOutputEvent: handleAssistantMessageOutput,
          onComponentOutputEvent: handleAssistantComponentOutput,
          onComponentEditPreviewEvent: handleComponentEditPreviewEvent,
          onAiChangePreviewEvent: handleAiChangePreviewEvent,
          onComponentLibraryTraceEvent: handleComponentLibraryTraceEvent,
          onComponentPlanTraceEvent: handleComponentPlanTraceEvent,
          onRequestPlanEvent: handleRequestPlanEvent,
          onAiChatV2RunEvent: handleAiChatV2RunEvent,
          onRunId: handleRunId,
          onRunTerminalState: handleRunTerminalState,
        })
      } catch (error) {
        console.error("[ai-chat] clarification follow-up failed", error)
      } finally {
        setIsClarificationResponding(false)
        if (
          clarificationFollowUpPendingClearRef.current
          && !clarificationAppliedDuringFollowUpRef.current
        ) {
          clearClarification(respondingClarificationId)
        }
        clarificationFollowUpPendingClearRef.current = false
        clarificationAppliedDuringFollowUpRef.current = false
      }
    },
    [
      activeChannelId,
      activeClarification,
      ambientContext,
      chatContext?.mode,
      clearClarification,
      handleAiChatAction,
      handleAiChatV2RunEvent,
      handleAssistantComponentOutput,
      handleAssistantMessageOutput,
      handleAssistantStreamAsset,
      handleAssistantStreamChunk,
      handleAssistantStreamComplete,
      handleAssistantStreamError,
      handleAssistantStreamStart,
      handleAssistantStreamStatus,
      handleComponentEditPreviewEvent,
      handleAiChangePreviewEvent,
      handleComponentLibraryTraceEvent,
      handleComponentPlanTraceEvent,
      handleRequestPlanEvent,
      handleOptimistic,
      handleRunId,
      handleRunTerminalState,
      handleThreadTitleEvent,
      isClarificationResponding,
      modelKey,
      taskId,
      thread.id,
      threadScope,
    ],
  )

  const handleClarificationCardSubmit = useCallback(
    (payload: { selectedOptionIds: string[]; freeText?: string | null }) => {
      if (!activeClarification || isClarificationResponding) return
      void sendClarificationFollowUp({
        selectedOptionIds: payload.selectedOptionIds,
        freeText: payload.freeText ?? null,
      })
    },
    [activeClarification, isClarificationResponding, sendClarificationFollowUp],
  )

  const latestUserMessageIndex = useMemo(() => {
    for (let index = allMessages.length - 1; index >= 0; index -= 1) {
      if (allMessages[index]?.role === "user") return index
    }
    return -1
  }, [allMessages])

  const scrollLatestUserMessageIntoComfortView = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      scrollUserMessageIntoView(latestUserMessageRef.current, behavior)
    },
    [scrollUserMessageIntoView],
  )

  const persistedPreviewDescriptors = useMemo(
    () => buildPersistedPreviewDescriptorsFromMessages(thread.id, allMessages),
    [allMessages, thread.id],
  )

  useLayoutEffect(() => {
    hydrateComponentEditPreviewsFromMessages(persistedPreviewDescriptors)
  }, [persistedPreviewDescriptors])

  const persistedChangePreviewDescriptors = useMemo(
    () => buildPersistedAiChangePreviewDescriptorsFromMessages(thread.id, allMessages),
    [allMessages, thread.id],
  )

  useLayoutEffect(() => {
    hydrateAiChangePreviewsFromMessages(persistedChangePreviewDescriptors)
  }, [persistedChangePreviewDescriptors])

  useLayoutEffect(() => {
    const store = useAiOrchestratedBuildStore.getState()
    for (const message of allMessages) {
      if (message.role !== "assistant") continue
      applyPreflightSkipsFromContentJson({
        contentJson: message.content_json,
        threadId: thread.id,
        assistantMessageId: message.id,
      })
      const discovered = discoverOrchestratedBuildsFromMessageContentJson(message.content_json)
      for (const build of discovered) {
        store.registerBuild({
          buildId: build.buildId,
          threadId: thread.id,
          assistantMessageId: message.id,
          title: build.title,
          summary: build.summary,
          changeSetId: build.changeSetId,
          startFailed: build.startFailed,
          errorCode: build.errorCode,
          errorMessage: build.errorMessage,
        })
      }
    }
  }, [allMessages, thread.id])

  const orchestratedBuildIdsByAssistantId = useMemo(() => {
    const map = new Map<string, string[]>()
    const push = (messageId: string, buildId: string) => {
      if (!messageId || !buildId) return
      const existing = map.get(messageId) ?? []
      if (existing.includes(buildId)) return
      map.set(messageId, [...existing, buildId])
    }
    for (const entry of Object.values(orchestratedBuildEntries)) {
      if (entry.threadId && entry.threadId !== thread.id) continue
      for (const assistantMessageId of Object.keys(entry.assistantMessageIds ?? {})) {
        push(assistantMessageId, entry.buildId)
      }
    }
    return map
  }, [orchestratedBuildEntries, thread.id])

  const changePreviewKeysByAssistantId = useMemo(() => {
    const map = new Map<string, string[]>()
    const pushKey = (messageId: string, key: string) => {
      if (!messageId || !key) return
      const existing = map.get(messageId) ?? []
      if (existing.includes(key)) return
      map.set(messageId, [...existing, key])
    }
    for (const entry of Object.values(changePreviewEntries)) {
      if (entry.threadId && entry.threadId !== thread.id) continue
      for (const assistantMessageId of Object.keys(entry.assistantMessageIds ?? {})) {
        pushKey(assistantMessageId, entry.key)
      }
    }
    return map
  }, [changePreviewEntries, thread.id])

  /** Collapse related change-preview cards that share a `group_id` into one grouped card. */
  const changePreviewGroupsByAssistantId = useMemo(() => {
    const map = new Map<string, string[][]>()
    for (const [messageId, keys] of changePreviewKeysByAssistantId.entries()) {
      const groups: string[][] = []
      const groupIndexById = new Map<string, number>()
      for (const key of keys) {
        const entry = changePreviewEntries[key]
        if (entry && isOrchestratedBuildChangePreview(entry)) continue
        const groupId = entry?.group_id?.trim() || null
        if (groupId && groupId.startsWith("component-output:")) {
          const hasComponentPreview = Object.values(editStreamEntries).some(
            (stream) => stream.key === groupId || stream.key === entry?.preview_key,
          )
          if (hasComponentPreview) continue
        }
        if (groupId) {
          const existingIndex = groupIndexById.get(groupId)
          if (existingIndex != null) {
            groups[existingIndex].push(key)
            continue
          }
          groupIndexById.set(groupId, groups.length)
        }
        groups.push([key])
      }
      map.set(messageId, groups)
    }
    return map
  }, [changePreviewKeysByAssistantId, changePreviewEntries, editStreamEntries])

  const persistedTraceDescriptors = useMemo(() => {
    const out: Array<{
      messageId: string
      libraryTrace: ReturnType<typeof parseComponentTracesFromMessage>["libraryTrace"]
      planTrace: ReturnType<typeof parseComponentTracesFromMessage>["planTrace"]
    }> = []
    for (const message of allMessages) {
      if (message.role !== "assistant") continue
      const { libraryTrace, planTrace } = parseComponentTracesFromMessage(message.content_json)
      if (!libraryTrace && !planTrace) continue
      out.push({ messageId: message.id, libraryTrace, planTrace })
    }
    return out
  }, [allMessages])

  useLayoutEffect(() => {
    for (const descriptor of persistedTraceDescriptors) {
      useComponentPlanTraceStore.getState().setTracesForMessage({
        threadId: thread.id,
        assistantMessageId: descriptor.messageId,
        libraryTrace: descriptor.libraryTrace,
        planTrace: descriptor.planTrace,
      })
    }
  }, [persistedTraceDescriptors, thread.id])

  const persistedRequestPlanDescriptors = useMemo(() => {
    const out: Array<{
      messageId: string
      plan: NonNullable<ReturnType<typeof parseRequestPlanFromMessage>>
    }> = []
    for (const message of allMessages) {
      if (message.role !== "assistant") continue
      const plan = parseRequestPlanFromMessage(message.content_json)
      if (!plan) continue
      out.push({ messageId: message.id, plan })
    }
    return out
  }, [allMessages])

  useLayoutEffect(() => {
    for (const descriptor of persistedRequestPlanDescriptors) {
      useAiRequestPlanStore.getState().setPlanForMessage({
        threadId: thread.id,
        assistantMessageId: descriptor.messageId,
        plan: descriptor.plan,
      })
    }
  }, [persistedRequestPlanDescriptors, thread.id])

  const editStreamKeysByAssistantId = useMemo(() => {
    const map = new Map<string, string[]>()
    const pushKey = (messageId: string, key: string) => {
      if (!messageId || !key) return
      const existing = map.get(messageId) ?? []
      if (existing.includes(key)) return
      map.set(messageId, [...existing, key])
    }

    for (const { messageId, preview } of persistedPreviewDescriptors) {
      pushKey(messageId, previewDescriptorStreamKey(preview))
    }
    for (const stream of Object.values(editStreamEntries)) {
      if (stream.threadId && stream.threadId !== thread.id) continue
      if (!stream.phase) continue
      for (const artifactMessageId of Object.keys(stream.chatArtifactsByAssistantId ?? {})) {
        pushKey(artifactMessageId, stream.key)
      }
      if (stream.assistantTempId) {
        pushKey(stream.assistantTempId, stream.key)
      }
    }
    for (const pending of pendingMsgs) {
      if (pending.role !== "assistant") continue
      const linkedKeys = map.get(pending.id) ?? []
      const reconciledId = (pending as InFlightAssistantMessage).reconciled_message_id
      if (linkedKeys.length > 0 && reconciledId) {
        for (const key of linkedKeys) {
          pushKey(reconciledId, key)
        }
      }
    }
    return map
  }, [editStreamEntries, pendingMsgs, persistedPreviewDescriptors, thread.id])

  const renderedEditStreamKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const message of allMessages) {
      if (message.role !== "assistant") continue
      for (const key of editStreamKeysByAssistantId.get(message.id) ?? []) {
        keys.add(key)
      }
    }
    return keys
  }, [allMessages, editStreamKeysByAssistantId])

  const orphanEditStreamKeys = useMemo(
    () =>
      Object.values(editStreamEntries)
        .filter(
          (stream) =>
            stream.phase != null
            && (!stream.threadId || stream.threadId === thread.id)
            && !renderedEditStreamKeys.has(stream.key),
        )
        .map((stream) => stream.key),
    [editStreamEntries, renderedEditStreamKeys, thread.id],
  )

  const editStreamSignature = useMemo(
    () =>
      Object.values(editStreamEntries)
        .map((stream) => `${stream.key}:${stream.phase}:${stream.updatedAt}:${stream.contentText.length}`)
        .join("|"),
    [editStreamEntries],
  )
  
  // Scroll only when the user submits a new message; streaming must not force-scroll.
  const lastMessage = allMessages[allMessages.length - 1]
  const lastMessageSignature = `${lastMessage?.id ?? ""}:${lastMessage?.content ?? ""}:${lastMessage?.status ?? ""}`
  const streamScrollSignature = `${lastMessageSignature}|${editStreamSignature}|${contentSavedCards.length}|${assistantActivity?.text ?? ""}`

  useEffect(() => {
    threadInitialScrollDoneRef.current = null
    prevMessageCountRef.current = 0
    prevStreamSignatureRef.current = ""
    userMessageScrollAnchorUntilRef.current = 0
  }, [thread.id])

  useEffect(() => {
    if (!hasPersistedThreadId) return
    if (isMessagesLoading) return
    if (allMessages.length === 0) return
    if (threadInitialScrollDoneRef.current === thread.id) return

    threadInitialScrollDoneRef.current = thread.id

    const scrollToLatest = () => {
      scrollToBottomOnce("auto")
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToLatest)
    })
    const delayedTimer = window.setTimeout(scrollToLatest, 120)

    return () => {
      window.clearTimeout(delayedTimer)
    }
  }, [
    thread.id,
    hasPersistedThreadId,
    isMessagesLoading,
    allMessages.length,
    scrollToBottomOnce,
  ])

  useEffect(() => {
    const prevCount = prevMessageCountRef.current
    const nextCount = allMessages.length
    const addedMessages = nextCount > prevCount
    prevMessageCountRef.current = nextCount

    if (!addedMessages) return

    const last = allMessages[nextCount - 1]
    if (last?.role !== "user") return

    const isNewlySubmittedUserMessage =
      last.status === "pending"
      || pendingMsgs.some((message) => message.role === "user" && message.id === last.id)
    if (!isNewlySubmittedUserMessage) return

    userMessageScrollAnchorUntilRef.current = performance.now() + 4000

    const scheduleComfortScroll = () => {
      scrollLatestUserMessageIntoComfortView("smooth")
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(scheduleComfortScroll)
    })
    const delayedTimer = window.setTimeout(scheduleComfortScroll, 180)

    return () => {
      window.clearTimeout(delayedTimer)
    }
  }, [allMessages, pendingMsgs, scrollLatestUserMessageIntoComfortView])

  useEffect(() => {
    if (streamScrollSignature === prevStreamSignatureRef.current) return
    prevStreamSignatureRef.current = streamScrollSignature

    if (!isAssistantStreaming) return

    // While the just-submitted user message is still anchored, keep it pinned near
    // the top as streaming content grows below it. This also covers the case where
    // there was no room to anchor at submit time (e.g. sending from the bottom of
    // the thread) until the streaming bottom-padding is added. A manual scroll
    // clears the anchor window, so we never fight the user's own scrolling.
    if (performance.now() < userMessageScrollAnchorUntilRef.current) {
      scrollLatestUserMessageIntoComfortView("auto")
      return
    }

    markNewContentBelow()
  }, [
    streamScrollSignature,
    isAssistantStreaming,
    markNewContentBelow,
    scrollLatestUserMessageIntoComfortView,
  ])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    // An explicit manual scroll gesture releases the top-anchor lock so the user
    // keeps control of the viewport while the assistant is still streaming.
    const releaseAnchor = () => {
      userMessageScrollAnchorUntilRef.current = 0
    }

    container.addEventListener("wheel", releaseAnchor, { passive: true })
    container.addEventListener("touchmove", releaseAnchor, { passive: true })
    return () => {
      container.removeEventListener("wheel", releaseAnchor)
      container.removeEventListener("touchmove", releaseAnchor)
    }
  }, [scrollContainerRef])

  useEffect(() => {
    const messageElement = latestUserMessageRef.current
    if (!messageElement) return

    let resizeTimer: number | null = null
    const observer = new ResizeObserver(() => {
      if (performance.now() > userMessageScrollAnchorUntilRef.current) return
      if (resizeTimer != null) window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null
        scrollLatestUserMessageIntoComfortView("auto")
      }, 80)
    })

    observer.observe(messageElement)
    return () => {
      observer.disconnect()
      if (resizeTimer != null) window.clearTimeout(resizeTimer)
    }
  }, [latestUserMessageIndex, scrollLatestUserMessageIntoComfortView])

  return (
    <div
      className="relative h-full flex flex-col"
      onDragOver={(e) => {
        e.preventDefault()
        setIsDraggingFiles(true)
      }}
      onDragEnter={(e) => {
        e.preventDefault()
        setIsDraggingFiles(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        if (e.currentTarget === e.target) {
          setIsDraggingFiles(false)
        }
      }}
      onDrop={(e) => {
        e.preventDefault()
        setIsDraggingFiles(false)
        const fileList = Array.from(e.dataTransfer.files || [])
        if (fileList.length > 0) {
          setDroppedFiles(fileList)
        }
      }}
    >
      {isDraggingFiles ? (
        <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-md border-2 border-dashed border-gray-300 bg-white/90 text-sm text-gray-600">
          Drop files to attach
        </div>
      ) : null}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollContainerRef}
          className={`flex-1 overflow-x-hidden overflow-y-auto p-4 space-y-4 min-h-0 min-w-0 max-w-full${
            isAssistantStreaming ? " pb-[45vh] md:pb-[35vh]" : ""
          }`}
        >
        {allMessages.map((m, messageIndex) => {
          const editPreviewKeys = (m.role === "assistant"
            ? editStreamKeysByAssistantId.get(m.id) ?? []
            : []
          ).slice().sort((leftKey, rightKey) => {
            const leftTitle = editStreamEntries[leftKey]?.componentTitle ?? leftKey
            const rightTitle = editStreamEntries[rightKey]?.componentTitle ?? rightKey
            return leftTitle.localeCompare(rightTitle)
          })
          const previewDescriptors = resolvePreviewContentDescriptors({
            message: m,
            messageId: m.id,
            editPreviewKeys,
            editStreamEntries,
          })
          const changePreviewGroups =
            m.role === "assistant" ? changePreviewGroupsByAssistantId.get(m.id) ?? [] : []
          const previewLayout = buildAssistantMessagePreviewLayout({
            messageContent: m.content,
            previews: previewDescriptors,
          })
          const copyableAssistantText = buildAssistantClipboardText({
            msg: m,
            layout: previewLayout,
            previews: previewDescriptors,
          })
          const clarificationMessageId = activeClarification?.assistantMessageId
          const clarificationReconciledId = (m as InFlightAssistantMessage).reconciled_message_id ?? null
          const traceReconciledId = (m as InFlightAssistantMessage).reconciled_message_id ?? null
          const orchestratedBuildIds = (() => {
            if (m.role !== "assistant") return [] as string[]
            const direct = orchestratedBuildIdsByAssistantId.get(m.id) ?? []
            if (direct.length > 0) return direct
            if (clarificationReconciledId) {
              return orchestratedBuildIdsByAssistantId.get(clarificationReconciledId) ?? []
            }
            return []
          })()
          const traceCardsMessageId =
            m.role === "assistant"
              ? traceBuckets[m.id]
                ? m.id
                : traceReconciledId && traceBuckets[traceReconciledId]
                  ? traceReconciledId
                  : null
              : null
          const requestPlanMessageId =
            m.role === "assistant"
              ? requestPlanBuckets[m.id]
                ? m.id
                : traceReconciledId && requestPlanBuckets[traceReconciledId]
                  ? traceReconciledId
                  : null
              : null
          const clarificationCardId = activeClarification?.id ?? null
          const showsActiveClarificationCard =
            activeClarification != null
            && m.role === "assistant"
            && (
              clarificationMessageId
                ? m.id === clarificationMessageId
                  || clarificationReconciledId === clarificationMessageId
                  || clarificationCardId === m.id
                  || (clarificationCardId != null && clarificationCardId === clarificationReconciledId)
                : messageIndex === allMessages.length - 1
            )
          const historyClarification =
            m.role === "assistant" && !showsActiveClarificationCard
              ? resolveClarificationDisplayForMessage(allMessages, messageIndex)
              : null
          const clarificationForCard = showsActiveClarificationCard
            ? activeClarification
            : historyClarification?.request ?? null
          const clarificationAnswered = Boolean(historyClarification?.answered)
          const clarificationAnswer = historyClarification?.answer ?? null
          return (
            <div
              key={m.id}
              ref={messageIndex === latestUserMessageIndex ? latestUserMessageRef : undefined}
              className="w-full min-w-0 max-w-full"
            >
              <MessageBubble
                msg={m as any}
                isMine={m.role === "user"}
                taskId={taskId}
                threadContext={context ?? undefined}
                activeChannelId={activeChannelId}
                chatContext={chatContext}
                resendAfterUserMessageEdit={hasPersistedThreadId ? resendAfterUserMessageEdit : undefined}
                mentionDirectSeed={mentionDirectSeed}
                assistantIntroHtml={previewLayout.introHtml}
                assistantOutroHtml={previewLayout.outroHtml}
                copyableAssistantText={copyableAssistantText}
                traceCards={
                  traceCardsMessageId ? (
                    <ComponentPlanTraceCards assistantMessageId={traceCardsMessageId} />
                  ) : null
                }
                requestPlanCard={
                  requestPlanMessageId ? (
                    <RequestPlanCard assistantMessageId={requestPlanMessageId} />
                  ) : null
                }
                orchestratedBuild={
                  orchestratedBuildIds.length > 0 ? (
                    <div className="space-y-2 w-full min-w-0 max-w-full">
                      {orchestratedBuildIds.map((buildId) => (
                        <OrchestratedBuildCard
                          key={`${m.id}:${buildId}`}
                          buildId={buildId}
                          assistantMessageId={m.id}
                          threadId={thread.id}
                          taskId={taskId}
                          activeChannelId={activeChannelId}
                        />
                      ))}
                    </div>
                  ) : null
                }
                changePreview={
                  changePreviewGroups.length > 0 ? (
                    <div className="space-y-2 w-full min-w-0 max-w-full">
                      {changePreviewGroups.map((groupKeys) => (
                        <AiChangePreviewCard
                          key={`${m.id}:${groupKeys.join("|")}`}
                          previewKeys={groupKeys}
                        />
                      ))}
                    </div>
                  ) : null
                }
                componentEditPreview={
                  editPreviewKeys.length > 0 ? (
                    <div className="space-y-2 w-full min-w-0 max-w-full">
                      {editPreviewKeys.map((streamKey) => (
                        <ComponentEditStreamPreview
                          key={`${m.id}:${streamKey}`}
                          streamKey={streamKey}
                          assistantMessageId={m.id}
                          assistantMessageContentJson={m.content_json}
                          resolveComponentTitle={resolvePreviewComponentTitle}
                          onOpenInContentTab={handleOpenComponentEditInContentTab}
                          onPatchContentTab={patchTaskComponentOutput as any}
                        />
                      ))}
                    </div>
                  ) : null
                }
                clarificationCard={
                  clarificationForCard ? (
                    <ComponentClarificationCard
                      clarification={clarificationForCard}
                      isResponding={
                        !clarificationAnswered
                        && (isClarificationResponding || isAssistantStreaming)
                      }
                      answered={clarificationAnswered}
                      answer={clarificationAnswer}
                      onSubmit={handleClarificationCardSubmit}
                      onDismiss={
                        clarificationAnswered
                          ? undefined
                          : () => clearClarification(clarificationForCard.id)
                      }
                    />
                  ) : null
                }
                runFailureCard={
                  m.role === "assistant"
                  && (m as InFlightAssistantMessage).terminal_state
                  && ((m as InFlightAssistantMessage).terminal_state?.kind === "failed"
                    || (m as InFlightAssistantMessage).terminal_state?.kind === "interrupted") ? (
                    <AiRunFailureCard
                      terminalState={(m as InFlightAssistantMessage).terminal_state!}
                      onRetry={() => {
                        void retryFailedAssistantRun(m.id)
                      }}
                      onReconcile={() => {
                        void reconcileFailedAssistantRun(m.id)
                      }}
                    />
                  ) : null
                }
              />
            </div>
          )
        })}
        {orphanEditStreamKeys.map((streamKey) => (
          <ComponentEditStreamPreview
            key={`orphan-edit-preview-${streamKey}`}
            streamKey={streamKey}
            resolveComponentTitle={resolvePreviewComponentTitle}
            onOpenInContentTab={handleOpenComponentEditInContentTab}
            onPatchContentTab={patchTaskComponentOutput as any}
          />
        ))}
        {contentSavedCards.map(({ id, action }) => (
          <ContentSavedInlineCard key={id} action={action} />
        ))}
        {assistantActivity || activeRunProgressEntries.length > 0 ? (
          <AiRunTargetProgressPanel
            entries={activeRunProgressEntries}
            summaryLine={assistantActivity?.text ?? null}
          />
        ) : null}
        <div ref={chatEndRef} />
        </div>
        {showJumpToBottom ? (
          <button
            type="button"
            onClick={jumpToBottom}
            className="absolute bottom-4 right-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md transition-colors hover:bg-accent"
            aria-label="Scroll to latest messages"
            title="Scroll to latest"
          >
            <span className="relative inline-flex">
              <ChevronDown className="h-4 w-4" aria-hidden />
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary" aria-hidden />
            </span>
          </button>
        ) : null}
      </div>
      <div className="p-4 flex-shrink-0">
        {!hasPersistedThreadId ? (
          <div className="border-t pt-2">
            <div className="w-full border rounded p-2 text-sm bg-gray-50 text-gray-500">
              Creating new chat...
            </div>
          </div>
        ) : (
          <>
            {isUsageSendBlocked(threadUsage) ? (
              <AiChatUsageLimitCard usage={threadUsage} canReviewLimits={canReviewLimits} />
            ) : null}
            <Composer 
            threadId={thread.id} 
            taskId={taskId}
            onOptimistic={handleOptimistic} 
            onAssistantStreamStart={handleAssistantStreamStart}
            onAssistantStreamChunk={handleAssistantStreamChunk}
            onAssistantStreamStatus={handleAssistantStreamStatus}
            onAssistantStreamComplete={handleAssistantStreamComplete}
            onAssistantStreamError={handleAssistantStreamError}
            onAiChatAction={handleAiChatAction}
            onThreadTitleEvent={handleThreadTitleEvent}
            onAssetEvent={handleAssistantStreamAsset}
            onMessageOutputEvent={handleAssistantMessageOutput}
            onComponentOutputEvent={handleAssistantComponentOutput}
            onComponentEditPreviewEvent={handleComponentEditPreviewEvent}
            onAiChangePreviewEvent={handleAiChangePreviewEvent}
            onComponentLibraryTraceEvent={handleComponentLibraryTraceEvent}
            onComponentPlanTraceEvent={handleComponentPlanTraceEvent}
            onRequestPlanEvent={handleRequestPlanEvent}
            onAiChatV2RunEvent={handleAiChatV2RunEvent}
            onRunId={handleRunId}
            onRunTerminalState={handleRunTerminalState}
            onUsageUpdate={(usage) => {
              if (usage) applyUsageSnapshot(usage)
            }}
            threadUsage={threadUsage}
            isThreadUsageLoading={isThreadUsageLoading}
            isSendBlockedByUsage={isUsageSendBlocked(threadUsage)}
            canReviewLimits={canReviewLimits}
            threadScope={threadScope}
            inFlightTurnRef={inFlightTurnRef}
            activeChannelId={activeChannelId}
            preFillMessage={chatContext?.preFillMessage}
            mode={chatContext?.mode}
            componentId={chatContext?.componentId}
            autoRun={chatContext?.autoRun}
            activeFieldContext={effectiveActiveFieldContext}
            ambientContext={ambientContext}
            ambientTaskTitle={ambientTaskTitle}
            clarificationFollowUpRef={clarificationFollowUpRef}
            onClarificationFollowUpSent={undefined}
            onScopeModeChange={onScopeModeChange}
            mentionDirectSeed={mentionDirectSeed}
            droppedFiles={droppedFiles}
            onDroppedFilesHandled={() => setDroppedFiles([])}
            streamAbortRef={streamAbortRef}
            isAssistantStreaming={isAssistantStreaming}
          />
          </>
        )}
      </div>
      <SelectionAskAiMenu
        containerSelector='[data-ai-selectable="chat-message"]'
        resolve={resolveChatSelection}
        onAsk={(context) => setPendingTextSelection(context)}
      />
    </div>
  )
}


