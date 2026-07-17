"use client"

import { create } from "zustand"
import {
  renderComponentOutputPreviewHtml,
} from "../../features/tasks/utils/component-output-preview-render"
import {
  buildComponentEditPreviewIdentityKey,
  hashPreviewContent,
} from "../lib/component-edit-preview-lifecycle"

export type ComponentEditPreviewContentJsonBlock = {
  type: string
  text?: string
  [key: string]: unknown
}

export type ComponentEditStreamPhase = "started" | "delta" | "completed" | "saved" | "failed" | "restored"

export type ComponentEditStreamSnapshot = {
  phase: ComponentEditStreamPhase
  componentTitle: string
  operation: "append" | "replace" | null
  baseContentText: string
  afterContentText: string
  contentText: string
  contentJson: ComponentEditPreviewContentJsonBlock[] | null
  editStrategy: string | null
  patches: import("../../app/lib/ai/chat").ComponentEditPatch[] | null
  displayHtml: string
  hasPreviewContent: boolean
  isStreaming: boolean
  errorMessage: string | null
  updatedAt: string
}

export type ComponentEditStreamEntry = {
  key: string
  threadId: string | null
  taskId: number
  channelId: number
  componentId: string
  taskComponentOutputId: string | null
  componentTitle: string
  operation: "append" | "replace" | null
  baseContentText: string
  afterContentText: string
  contentText: string
  contentJson: ComponentEditPreviewContentJsonBlock[] | null
  editStrategy: string | null
  patches: import("../../app/lib/ai/chat").ComponentEditPatch[] | null
  displayHtml: string
  hasPreviewContent: boolean
  phase: ComponentEditStreamPhase
  isStreaming: boolean
  errorMessage: string | null
  updatedAt: string
  assistantTempId: string | null
  /** Frozen chat artifacts keyed by assistant message id (temp or persisted). */
  chatArtifactsByAssistantId: Record<string, ComponentEditStreamSnapshot>
  /** Captured once per pending edit for append operations. */
  baseContentCaptured: boolean
  /** Last completed preview content hash — duplicate completed events are ignored. */
  lastCompletedContentHash: string | null
  /** Identity key for the active pending edit lifecycle. */
  pendingEditIdentityKey: string | null
  /** Human edit won over AI preview — offer reload/compare/retry, never auto-overwrite. */
  revisionConflict?: boolean
}

export type ComponentEditFocusRequest = {
  taskId: number
  channelId: number
  componentId: string
  componentTitle: string
  highlightToken: number
}

/**
 * Stable preview identity: the backend-supplied `preview_key` when present, otherwise one card
 * per task + channel + component (output id may arrive later). Key changes migrate in-place via
 * {@link findStreamEntryForComponent}, so mixed keyed/unkeyed phases still resolve to one card.
 */
export function componentEditStreamKey(
  taskId: number,
  channelId: number,
  componentId: string,
  _taskComponentOutputId?: string | null,
  previewKey?: string | null,
): string {
  const trimmed = typeof previewKey === "string" ? previewKey.trim() : ""
  if (trimmed.length > 0) return trimmed
  return `${taskId}:${channelId}:${componentId}`
}

function findStreamEntryForComponent(
  streams: Record<string, ComponentEditStreamEntry>,
  taskId: number,
  channelId: number,
  componentId: string,
): ComponentEditStreamEntry | null {
  const key = componentEditStreamKey(taskId, channelId, componentId)
  if (streams[key]) return streams[key]
  return (
    Object.values(streams).find(
      (row) =>
        row.taskId === taskId && row.channelId === channelId && row.componentId === componentId,
    ) ?? null
  )
}

export function isLiveComponentEditStreamPhase(phase: ComponentEditStreamPhase): boolean {
  return phase === "started" || phase === "delta" || phase === "completed"
}

export function isTerminalComponentEditStreamPhase(phase: ComponentEditStreamPhase): boolean {
  return phase === "saved" || phase === "failed" || phase === "restored"
}

function buildMergedPlainText(
  entry: Pick<ComponentEditStreamEntry, "operation" | "baseContentText" | "afterContentText" | "contentText">,
): string {
  if (entry.afterContentText.trim()) {
    return entry.afterContentText.trim()
  }
  if (entry.operation === "append") {
    return [entry.baseContentText.trim(), entry.contentText.trim()].filter(Boolean).join("\n\n")
  }
  return entry.contentText.trim()
}

function buildDisplayHtml(
  entry: Pick<
    ComponentEditStreamEntry,
    "phase" | "operation" | "baseContentText" | "afterContentText" | "contentText" | "contentJson" | "componentTitle"
  >,
): string {
  const contentText = entry.afterContentText.trim() || entry.contentText
  return renderComponentOutputPreviewHtml({
    phase: entry.phase,
    operation: entry.operation,
    baseContentText: entry.baseContentText,
    contentText,
    contentJson: entry.contentJson,
    componentTitle: entry.componentTitle,
  })
}

function finalizeEntry(entry: ComponentEditStreamEntry): ComponentEditStreamEntry {
  const displayHtml = buildDisplayHtml(entry)
  const mergedPlain = buildMergedPlainText(entry)
  const hasPreviewContent =
    mergedPlain.length > 0 || displayHtml.replace(/<[^>]+>/g, "").trim().length > 0
  return {
    ...entry,
    displayHtml,
    hasPreviewContent,
    updatedAt: new Date().toISOString(),
  }
}

function isGenericComponentPreviewTitle(title: string | null | undefined): boolean {
  const normalized = (title ?? "").trim().toLowerCase()
  return normalized.length === 0 || normalized === "component" || normalized === "component output"
}

function buildChatArtifactSnapshot(
  entry: ComponentEditStreamEntry,
): ComponentEditStreamSnapshot {
  return {
    phase: entry.phase,
    componentTitle: entry.componentTitle,
    operation: entry.operation,
    baseContentText: entry.baseContentText,
    afterContentText: entry.afterContentText,
    contentText: entry.contentText,
    contentJson: entry.contentJson,
    editStrategy: entry.editStrategy,
    patches: entry.patches,
    displayHtml: entry.displayHtml,
    hasPreviewContent: entry.hasPreviewContent,
    isStreaming: false,
    errorMessage: entry.errorMessage,
    updatedAt: entry.updatedAt,
  }
}

export function resolveComponentEditStreamPreviewView(
  stream: ComponentEditStreamEntry | null | undefined,
  assistantMessageId?: string | null,
): (ComponentEditStreamEntry | ComponentEditStreamSnapshot) | null {
  if (!stream) return null
  if (assistantMessageId && stream.chatArtifactsByAssistantId[assistantMessageId]) {
    return stream.chatArtifactsByAssistantId[assistantMessageId]
  }
  if (assistantMessageId && stream.assistantTempId === assistantMessageId) {
    return stream
  }
  if (!assistantMessageId) return stream
  return null
}

function createDefaultEntry(args: {
  key: string
  threadId?: string | null
  taskId: number
  channelId: number
  componentId: string
  taskComponentOutputId?: string | null
  componentTitle?: string
  assistantTempId?: string | null
  operation?: "append" | "replace" | null
}): ComponentEditStreamEntry {
  return finalizeEntry({
    key: args.key,
    threadId: args.threadId ?? null,
    taskId: args.taskId,
    channelId: args.channelId,
    componentId: args.componentId,
    taskComponentOutputId: args.taskComponentOutputId ?? null,
    componentTitle: (args.componentTitle ?? "").trim() || "Component",
    operation: args.operation ?? null,
    baseContentText: "",
    afterContentText: "",
    contentText: "",
    contentJson: null,
    editStrategy: null,
    patches: null,
    displayHtml: "",
    hasPreviewContent: false,
    phase: "started",
    isStreaming: true,
    errorMessage: null,
    updatedAt: new Date().toISOString(),
    assistantTempId: args.assistantTempId ?? null,
    chatArtifactsByAssistantId: {},
    baseContentCaptured: false,
    lastCompletedContentHash: null,
    pendingEditIdentityKey: null,
  })
}

type ComponentEditStreamState = {
  streams: Record<string, ComponentEditStreamEntry>
  focusRequest: ComponentEditFocusRequest | null
  restoredAssistantMessageIds: Record<string, true>
  upsertFromPreviewEvent: (args: {
    threadId?: string | null
    previewKey?: string | null
    taskId: number
    channelId: number
    componentId: string
    taskComponentOutputId?: string | null
    componentTitle?: string
    assistantTempId?: string | null
    operation?: "append" | "replace" | null
    phase: ComponentEditStreamPhase
    baseContentText?: string
    beforeContentText?: string
    afterContentText?: string
    contentText?: string
    contentTextDelta?: string
    contentJson?: ComponentEditPreviewContentJsonBlock[] | null
    editStrategy?: string | null
    patches?: import("../../app/lib/ai/chat").ComponentEditPatch[] | null
    errorMessage?: string | null
    round?: number | null
  }) => string
  clearStream: (key: string) => void
  clearAllPreviewStreams: () => void
  clearStreamsExceptThread: (threadId: string | null) => void
  requestFocus: (args: Omit<ComponentEditFocusRequest, "highlightToken">) => void
  consumeFocusRequest: () => ComponentEditFocusRequest | null
  assignAssistantTempId: (key: string, assistantTempId: string) => void
  aliasChatArtifactMessageId: (key: string, fromMessageId: string, toMessageId: string) => void
  getStream: (key: string) => ComponentEditStreamEntry | null
  getStreamsForTaskChannel: (taskId: number, channelId: number) => ComponentEditStreamEntry[]
  getActiveStreamForComponent: (
    taskId: number,
    channelId: number,
    componentId: string,
    taskComponentOutputId?: string | null,
  ) => ComponentEditStreamEntry | null
  hydratePersistedPreviewForMessage: (args: {
    threadId?: string | null
    previewKey?: string | null
    messageId: string
    taskId: number
    channelId: number
    componentId: string
    taskComponentOutputId?: string | null
    componentTitle?: string
    operation?: "append" | "replace" | null
    phase: ComponentEditStreamPhase
    baseContentText?: string
    contentText?: string
    contentJson?: ComponentEditPreviewContentJsonBlock[] | null
    errorMessage?: string | null
    updatedAt?: string | null
  }) => string
  updatePreviewArtifactContent: (args: {
    key: string
    messageId: string
    contentText: string
    contentJson: ComponentEditPreviewContentJsonBlock[] | null
    displayHtml: string
  }) => void
  finalizeAssistantMessagePreviews: (assistantTempId: string) => void
  markAssistantMessageRestored: (assistantMessageId: string) => void
  isAssistantMessageRestored: (assistantMessageId: string) => boolean
}

export const useComponentEditStreamStore = create<ComponentEditStreamState>((set, get) => ({
  streams: {},
  focusRequest: null,
  restoredAssistantMessageIds: {},

  upsertFromPreviewEvent: (args) => {
    const key = componentEditStreamKey(
      args.taskId,
      args.channelId,
      args.componentId,
      args.taskComponentOutputId,
      args.previewKey,
    )
    set((state) => {
      const existing =
        findStreamEntryForComponent(state.streams, args.taskId, args.channelId, args.componentId) ??
        null
      const prev =
        existing ??
        createDefaultEntry({
          key,
          threadId: args.threadId,
          taskId: args.taskId,
          channelId: args.channelId,
          componentId: args.componentId,
          taskComponentOutputId: args.taskComponentOutputId,
          componentTitle: args.componentTitle,
          assistantTempId: args.assistantTempId,
          operation: args.operation,
        })

      const incomingAfterContentText =
        typeof args.afterContentText === "string" && args.afterContentText.length > 0
          ? args.afterContentText
          : ""
      const incomingBeforeContentText =
        typeof args.beforeContentText === "string"
          ? args.beforeContentText
          : typeof args.baseContentText === "string"
            ? args.baseContentText
            : undefined
      const incomingContentText =
        typeof args.contentText === "string" && args.contentText.length > 0 ? args.contentText : ""
      const incomingContentDelta =
        typeof args.contentTextDelta === "string" && args.contentTextDelta.length > 0
          ? args.contentTextDelta
          : ""
      const identityKey = buildComponentEditPreviewIdentityKey({
        threadId: args.threadId ?? prev.threadId,
        assistantMessageId: args.assistantTempId ?? prev.assistantTempId,
        round: args.round ?? null,
        taskId: args.taskId,
        channelId: args.channelId,
        componentId: args.componentId,
        taskComponentOutputId: args.taskComponentOutputId ?? prev.taskComponentOutputId,
        operation: args.operation ?? prev.operation,
        contentText: incomingAfterContentText || incomingContentText || null,
        contentTextDelta: incomingContentDelta || null,
      })

      if (
        args.phase === "completed"
        && prev.phase === "completed"
        && prev.lastCompletedContentHash
        && prev.lastCompletedContentHash
          === hashPreviewContent(incomingAfterContentText || incomingContentText || incomingContentDelta)
      ) {
        return state
      }

      const nextStreams = { ...state.streams }
      if (existing && existing.key !== key) {
        delete nextStreams[existing.key]
      }

      const next: ComponentEditStreamEntry = {
        ...prev,
        key,
        chatArtifactsByAssistantId: prev.chatArtifactsByAssistantId ?? {},
      }
      if (args.componentTitle?.trim() && !isGenericComponentPreviewTitle(args.componentTitle)) {
        next.componentTitle = args.componentTitle.trim()
      } else if (args.componentTitle?.trim() && isGenericComponentPreviewTitle(prev.componentTitle)) {
        next.componentTitle = args.componentTitle.trim()
      }
      if (args.threadId) next.threadId = args.threadId
      if (args.taskComponentOutputId) next.taskComponentOutputId = args.taskComponentOutputId
      if (args.operation) next.operation = args.operation
      if (args.assistantTempId) next.assistantTempId = args.assistantTempId
      if (args.editStrategy != null) next.editStrategy = args.editStrategy
      if (args.patches != null) next.patches = args.patches
      if (
        args.contentJson != null
        && (args.phase === "completed" || args.phase === "saved" || args.phase === "failed" || args.phase === "restored")
      ) {
        next.contentJson = args.contentJson
      }

      const applyBeforeContent = (baseText: string | undefined) => {
        if (typeof baseText !== "string") return
        next.baseContentText = baseText
        if (baseText.trim()) next.baseContentCaptured = true
      }

      const applyAfterContent = (afterText: string) => {
        if (!afterText) return
        next.afterContentText = afterText
        next.contentText = afterText
      }

      if (args.phase === "started") {
        next.isStreaming = true
        next.errorMessage = null
        next.pendingEditIdentityKey = identityKey
        if (isTerminalComponentEditStreamPhase(prev.phase)) {
          next.baseContentText = ""
          next.afterContentText = ""
          next.contentText = ""
          next.contentJson = null
          next.patches = null
          next.baseContentCaptured = false
          next.lastCompletedContentHash = null
        }
        applyBeforeContent(incomingBeforeContentText)
        if (incomingAfterContentText) {
          applyAfterContent(incomingAfterContentText)
        } else if (incomingContentText) {
          next.contentText = incomingContentText
        } else if (incomingContentDelta) {
          next.contentText = `${next.contentText}${incomingContentDelta}`
        }
      } else if (args.phase === "delta") {
        next.isStreaming = true
        next.pendingEditIdentityKey = identityKey
        applyBeforeContent(incomingBeforeContentText)
        if (incomingAfterContentText) {
          applyAfterContent(incomingAfterContentText)
        } else if (incomingContentText) {
          next.contentText = incomingContentText
        } else if (incomingContentDelta) {
          next.contentText = `${next.contentText}${incomingContentDelta}`
        }
      } else if (args.phase === "completed") {
        next.isStreaming = false
        next.pendingEditIdentityKey = identityKey
        applyBeforeContent(incomingBeforeContentText)
        if (incomingAfterContentText) {
          applyAfterContent(incomingAfterContentText)
        } else if (incomingContentText) {
          next.contentText = incomingContentText
        } else if (incomingContentDelta) {
          next.contentText = incomingContentDelta
        }
        next.lastCompletedContentHash = hashPreviewContent(
          next.afterContentText || next.contentText,
        )
      } else if (args.phase === "saved") {
        next.isStreaming = false
        next.errorMessage = null
        next.pendingEditIdentityKey = null
        next.baseContentCaptured = false
        next.lastCompletedContentHash = null
        applyBeforeContent(incomingBeforeContentText)
        if (incomingAfterContentText) {
          applyAfterContent(incomingAfterContentText)
        } else if (incomingContentText) {
          next.contentText = incomingContentText
        }
        if (next.operation === "append") {
          next.baseContentText = ""
        }
      } else if (args.phase === "failed") {
        next.isStreaming = false
        next.errorMessage = args.errorMessage ?? "Component edit failed"
        next.revisionConflict = /component_revision_conflict/i.test(args.errorMessage ?? "")
        next.pendingEditIdentityKey = null
        applyBeforeContent(incomingBeforeContentText)
        if (incomingAfterContentText) {
          applyAfterContent(incomingAfterContentText)
        } else if (incomingContentText) {
          next.contentText = incomingContentText
        }
      } else if (args.phase === "restored") {
        next.isStreaming = false
        next.errorMessage = null
        next.pendingEditIdentityKey = null
      }

      next.phase = args.phase

      const finalized = finalizeEntry(next)
      const assistantId = args.assistantTempId ?? finalized.assistantTempId
      const chatArtifactsByAssistantId = { ...finalized.chatArtifactsByAssistantId }
      if (
        assistantId
        && (isTerminalComponentEditStreamPhase(finalized.phase) || finalized.phase === "completed")
      ) {
        chatArtifactsByAssistantId[assistantId] = buildChatArtifactSnapshot(finalized)
      }

      return {
        streams: {
          ...nextStreams,
          [key]: {
            ...finalized,
            chatArtifactsByAssistantId,
          },
        },
      }
    })
    const saved = get().streams[key]
    if (saved) {
      console.log("[ComponentEditPreview] store", {
        phase: saved.phase,
        componentId: saved.componentId,
        contentTextLength: saved.contentText.length,
        assistantTempId: saved.assistantTempId,
      })
    }
    return key
  },

  clearStream: (key) => {
    set((state) => {
      if (!state.streams[key]) return state
      const next = { ...state.streams }
      delete next[key]
      return { streams: next }
    })
  },

  clearAllPreviewStreams: () => {
    set({ streams: {} })
  },

  clearStreamsExceptThread: (threadId) => {
    set((state) => {
      if (!threadId) return { streams: {} }
      const next: Record<string, ComponentEditStreamEntry> = {}
      for (const [key, stream] of Object.entries(state.streams)) {
        if (stream.threadId === threadId) next[key] = stream
      }
      return { streams: next }
    })
  },

  assignAssistantTempId: (key, assistantTempId) => {
    if (!assistantTempId) return
    set((state) => {
      const prev = state.streams[key]
      if (!prev || prev.assistantTempId === assistantTempId) return state
      return {
        streams: {
          ...state.streams,
          [key]: finalizeEntry({ ...prev, assistantTempId }),
        },
      }
    })
  },

  aliasChatArtifactMessageId: (key, fromMessageId, toMessageId) => {
    if (!fromMessageId || !toMessageId || fromMessageId === toMessageId) return
    set((state) => {
      const prev = state.streams[key]
      if (!prev) return state
      const artifact = prev.chatArtifactsByAssistantId[fromMessageId]
      if (!artifact) return state
      const chatArtifactsByAssistantId = { ...prev.chatArtifactsByAssistantId }
      chatArtifactsByAssistantId[toMessageId] = artifact
      return {
        streams: {
          ...state.streams,
          [key]: { ...prev, chatArtifactsByAssistantId },
        },
      }
    })
  },

  requestFocus: (args) => {
    set({
      focusRequest: {
        ...args,
        highlightToken: Date.now(),
      },
    })
  },

  consumeFocusRequest: () => {
    const req = get().focusRequest
    if (req) set({ focusRequest: null })
    return req
  },

  getStream: (key) => get().streams[key] ?? null,

  getStreamsForTaskChannel: (taskId, channelId) =>
    Object.values(get().streams).filter(
      (row) => row.taskId === taskId && row.channelId === channelId,
    ),

  getActiveStreamForComponent: (taskId, channelId, componentId, _taskComponentOutputId) => {
    const stream = findStreamEntryForComponent(get().streams, taskId, channelId, componentId)
    if (stream && isLiveComponentEditStreamPhase(stream.phase)) return stream
    return null
  },

  hydratePersistedPreviewForMessage: (args) => {
    const key = componentEditStreamKey(
      args.taskId,
      args.channelId,
      args.componentId,
      args.taskComponentOutputId,
      args.previewKey,
    )
    set((state) => {
      const existing =
        findStreamEntryForComponent(state.streams, args.taskId, args.channelId, args.componentId) ??
        null
      const prev =
        existing ??
        createDefaultEntry({
          key,
          threadId: args.threadId,
          taskId: args.taskId,
          channelId: args.channelId,
          componentId: args.componentId,
          taskComponentOutputId: args.taskComponentOutputId,
          componentTitle: args.componentTitle,
        })

      const nextStreams = { ...state.streams }
      if (existing && existing.key !== key) {
        delete nextStreams[existing.key]
      }

      if (
        prev.chatArtifactsByAssistantId[args.messageId]
        && isLiveComponentEditStreamPhase(prev.phase)
        && prev.assistantTempId === args.messageId
      ) {
        return state
      }

      const resolvedTitle = (args.componentTitle ?? prev.componentTitle).trim()
      const draft: ComponentEditStreamEntry = {
        ...prev,
        key,
        threadId: args.threadId ?? prev.threadId,
        taskComponentOutputId: args.taskComponentOutputId ?? prev.taskComponentOutputId,
        componentTitle:
          resolvedTitle && !isGenericComponentPreviewTitle(resolvedTitle)
            ? resolvedTitle
            : prev.componentTitle.trim() && !isGenericComponentPreviewTitle(prev.componentTitle)
              ? prev.componentTitle
              : resolvedTitle || "Component",
        operation: args.operation ?? prev.operation,
        phase: args.phase,
        isStreaming: false,
        errorMessage: args.errorMessage ?? null,
        contentText: args.contentText ?? prev.contentText,
        baseContentText: args.baseContentText ?? prev.baseContentText,
        contentJson: args.contentJson ?? prev.contentJson,
        updatedAt: args.updatedAt ?? prev.updatedAt,
        chatArtifactsByAssistantId: { ...prev.chatArtifactsByAssistantId },
      }
      const finalized = finalizeEntry(draft)
      finalized.chatArtifactsByAssistantId[args.messageId] = buildChatArtifactSnapshot(finalized)

      return {
        streams: {
          ...nextStreams,
          [key]: finalized,
        },
      }
    })
    return key
  },

  finalizeAssistantMessagePreviews: (assistantTempId) => {
    if (!assistantTempId) return
    set((state) => {
      let changed = false
      const nextStreams = { ...state.streams }
      for (const [streamKey, stream] of Object.entries(state.streams)) {
        if (stream.assistantTempId !== assistantTempId) continue
        if (stream.phase === "saved" || stream.phase === "failed" || stream.phase === "restored") continue

        const phase =
          stream.phase === "started" || stream.phase === "delta" ? "completed" : stream.phase
        const draft = finalizeEntry({
          ...stream,
          phase,
          isStreaming: false,
          chatArtifactsByAssistantId: { ...stream.chatArtifactsByAssistantId },
        })
        draft.chatArtifactsByAssistantId[assistantTempId] = buildChatArtifactSnapshot(draft)
        nextStreams[streamKey] = draft
        changed = true
      }
      return changed ? { streams: nextStreams } : state
    })
  },

  markAssistantMessageRestored: (assistantMessageId) => {
    if (!assistantMessageId) return
    set((state) => {
      let changed = false
      const nextStreams = { ...state.streams }
      const restoredAssistantMessageIds = {
        ...state.restoredAssistantMessageIds,
        [assistantMessageId]: true as const,
      }

      for (const [streamKey, stream] of Object.entries(state.streams)) {
        const artifact = stream.chatArtifactsByAssistantId[assistantMessageId]
        const matchesAssistant =
          stream.assistantTempId === assistantMessageId || artifact != null
        if (!matchesAssistant) continue

        const chatArtifactsByAssistantId = { ...stream.chatArtifactsByAssistantId }
        if (artifact) {
          chatArtifactsByAssistantId[assistantMessageId] = {
            ...artifact,
            phase: "restored",
            isStreaming: false,
            errorMessage: null,
            updatedAt: new Date().toISOString(),
          }
        }

        nextStreams[streamKey] = finalizeEntry({
          ...stream,
          phase: stream.assistantTempId === assistantMessageId ? "restored" : stream.phase,
          isStreaming: false,
          chatArtifactsByAssistantId,
        })
        changed = true
      }

      if (!changed && state.restoredAssistantMessageIds[assistantMessageId]) {
        return state
      }

      return {
        streams: changed ? nextStreams : state.streams,
        restoredAssistantMessageIds,
      }
    })
  },

  isAssistantMessageRestored: (assistantMessageId) =>
    Boolean(get().restoredAssistantMessageIds[assistantMessageId]),

  updatePreviewArtifactContent: (args) => {
    set((state) => {
      const prev = state.streams[args.key]
      if (!prev) return state

      const contentJson = args.contentJson
      const nextDraft: ComponentEditStreamEntry = {
        ...prev,
        contentText: args.contentText,
        contentJson,
        operation: "replace",
        isStreaming: false,
        updatedAt: new Date().toISOString(),
        chatArtifactsByAssistantId: { ...prev.chatArtifactsByAssistantId },
      }
      const finalized = finalizeEntry(nextDraft)
      const displayHtml = args.displayHtml || finalized.displayHtml
      finalized.displayHtml = displayHtml
      finalized.hasPreviewContent =
        args.contentText.trim().length > 0 || displayHtml.replace(/<[^>]+>/g, "").trim().length > 0

      const existingArtifact = prev.chatArtifactsByAssistantId[args.messageId]
      finalized.chatArtifactsByAssistantId[args.messageId] = {
        ...(existingArtifact ?? buildChatArtifactSnapshot(finalized)),
        phase: existingArtifact?.phase ?? finalized.phase,
        componentTitle: finalized.componentTitle,
        operation: "replace",
        baseContentText: finalized.baseContentText,
        contentText: args.contentText,
        contentJson,
        displayHtml,
        hasPreviewContent: finalized.hasPreviewContent,
        isStreaming: false,
        errorMessage: existingArtifact?.errorMessage ?? null,
        updatedAt: finalized.updatedAt,
      }

      if (prev.assistantTempId === args.messageId) {
        return {
          streams: {
            ...state.streams,
            [args.key]: finalized,
          },
        }
      }

      return {
        streams: {
          ...state.streams,
          [args.key]: {
            ...prev,
            chatArtifactsByAssistantId: finalized.chatArtifactsByAssistantId,
          },
        },
      }
    })
  },
}))
