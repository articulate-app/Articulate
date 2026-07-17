"use client"

import React, { useCallback, useMemo, useRef, useState, useEffect, useReducer, type MutableRefObject } from "react"
import { createPortal } from "react-dom"
import { getSupabaseBrowser } from "../../lib/supabase-browser"
import type { AiAttachmentMeta } from "./types"
import { ArrowUp, FolderKanban, ListTodo, Paperclip, Plus, Square, User, X } from "lucide-react"
import { getImageUrl } from "../../app/lib/public-media"
import { sendConversationAiChatStream } from "./send-conversation-ai-chat"
import {
  saveChannelSnapshotBeforeAiEdit,
  shouldSaveChannelSnapshotBeforeAiSend,
} from "./save-channel-snapshot-before-ai-edit"
import type {
  AiChatStreamAction,
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
import type { AiChatUsageSnapshot } from "../../app/lib/ai/ai-chat-v2-types"
import { buildAiChatV2RequestFields, resolveFactualLegacySendContext } from "./build-ai-run-targets"
import { cancelAiChatRun } from "./ai-chat-run-api"
import { resolveComponentOutputUpdatedAtFromQueryCache } from "./resolve-component-output-from-cache"
import { useQueryClient } from "@tanstack/react-query"
import type { InFlightAiTurnMeta } from "./types"
import { buildAiChatTaggedRefs } from "./build-ai-chat-tagged-refs"
import {
  type MentionPickerRow,
  buildLevel1MentionRows,
  buildLevel2MentionRows,
  buildChannelMentionRows,
  nextSelectableMentionIndex,
  mentionRowIsSelectable,
} from "./composer-mention-rows"
import {
  type MentionChannel,
  type TaskChannelComponentsBucket,
  mapTcComponentsAllChannelsRpc,
  taskChannelCompositeKey,
} from "./mention-task-channel-components"
import { getLoadedTaskRowsSnapshot } from "../../src/hooks/use-task-group-tasks-query"
import {
  type AiContextTag,
  type AiMessageSegment,
  type AiTagType,
  clearComposerEditor,
  composerTagDedupeKey,
  createTagChip,
  ensureSelectionChips,
  ensureTextSelectionChip,
  focusEnd,
  getCaretClientRect,
  getTextBeforeSelection,
  insertNodeAtCaret,
  insertPlainTextAtCaret,
  insertPlainTextWithLineBreaksAtCaret,
  parseActiveMentionAtCaret,
  readTagFromChip,
  replacePlainTextRangeWithChip,
  serializeComposerEditor,
  setComposerPlainText,
} from "./composer-inline-editor"
import { buildUserMessageContentJson, type AiUserMessageContentJson } from "./ai-chat-user-message-content"
import { persistUserMessageMentionMetadata } from "./persist-user-message-mention-metadata"
import { resolveNormalizedPastedTextForChatInput } from "./composer-paste"
import { logAiChatDebug } from "./debug"
import { shouldSyncMentionOnComposerClick } from "./composer-mention-guards"
import { buildComposerSelectionTags } from "./composer-selection-tag"
import {
  resolveComponentOutputSelectionDiagnostics,
  type AiActiveFieldContext,
} from "./active-field-context"
import {
  resolveAiChatOutboundContext,
  type AiAmbientContext,
} from "./ai-target-context"
import { useAiChatModelSelection } from "./ai-chat-model-selection"
import { AiChatModelPicker } from "./AiChatModelPicker"
import { AiChatUsageIndicator } from "./AiChatUsageIndicator"
import { chipLabelForSelection, useAiChatTextSelectionStore } from "./ai-chat-text-selection"
import { sanitizeStorageFileName } from "../../utils/storage"

type ProjectMention = { id: number; name: string; color?: string | null; logo?: string | null }
type TaskMention = {
  id: number
  title: string
  projectName?: string | null
  projectLogo?: string | null
  projectColor?: string | null
}
type UserMention = { id: number; full_name: string | null; email: string | null; photo: string | null }
type MentionEntityFilter = "all" | "task" | "project" | "user"
type MentionGroupId = "task" | "project" | "user"
export type MentionSuggestion =
  | { kind: "project"; id: number; label: string; project: ProjectMention }
  | { kind: "task"; id: number; label: string; task: TaskMention }
  | { kind: "user"; id: number; label: string; user: UserMention }

/** “Open task detail” — high contrast so it stays visible on light UI. */
const PICKER_DRILL_CHEVRON_BTN =
  "flex h-full min-h-[2.25rem] w-9 min-w-9 shrink-0 items-center justify-center border-l border-gray-300 bg-gray-100 text-lg font-semibold leading-none text-gray-800 hover:bg-gray-200 hover:text-gray-950 active:bg-gray-300/90"

const MENTION_RECENT_KEY = "ai-composer-mention-recent-v1"
const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"])
const SUPPORTED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"])
const IMAGE_ATTACHMENTS_ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif"

function isSupportedImageAttachment(file: File): boolean {
  const mime = (file.type || "").toLowerCase()
  if (SUPPORTED_IMAGE_MIME_TYPES.has(mime)) return true
  const lowerName = file.name.toLowerCase()
  const ext = lowerName.includes(".") ? lowerName.slice(lowerName.lastIndexOf(".") + 1) : ""
  return SUPPORTED_IMAGE_EXTENSIONS.has(ext)
}

type RecentStoredMention = {
  kind: "project" | "task" | "user"
  id: number
  label: string
  projectName?: string | null
  color?: string | null
  logo?: string | null
  email?: string | null
  photo?: string | null
}

function loadRecentMentions(): RecentStoredMention[] {
  try {
    const raw = sessionStorage.getItem(MENTION_RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentStoredMention[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function suggestionToStored(s: MentionSuggestion): RecentStoredMention {
  if (s.kind === "project") {
    return {
      kind: "project",
      id: s.project.id,
      label: s.project.name,
      color: s.project.color ?? null,
      logo: s.project.logo ?? null,
    }
  }
  if (s.kind === "task") {
    return {
      kind: "task",
      id: s.task.id,
      label: s.task.title,
      projectName: s.task.projectName ?? null,
    }
  }
  return {
    kind: "user",
    id: s.user.id,
    label: s.label,
    email: s.user.email ?? null,
    photo: s.user.photo ?? null,
  }
}

function storedToSuggestion(r: RecentStoredMention): MentionSuggestion | null {
  if (!Number.isFinite(r.id) || !r.label) return null
  if (r.kind === "project") {
    return {
      kind: "project",
      id: r.id,
      label: r.label,
      project: { id: r.id, name: r.label, color: r.color ?? null, logo: r.logo ?? null },
    }
  }
  if (r.kind === "task") {
    return {
      kind: "task",
      id: r.id,
      label: r.label,
      task: { id: r.id, title: r.label, projectName: r.projectName ?? null },
    }
  }
  return {
    kind: "user",
    id: r.id,
    label: r.label,
    user: { id: r.id, full_name: r.label, email: r.email ?? null, photo: r.photo ?? null },
  }
}

function pushRecentMention(s: MentionSuggestion) {
  try {
    const row = suggestionToStored(s)
    const cur = loadRecentMentions()
    const filtered = cur.filter((x) => !(x.kind === row.kind && x.id === row.id))
    const next = [row, ...filtered].slice(0, 24)
    sessionStorage.setItem(MENTION_RECENT_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota / private mode */
  }
}

interface ComposerProps {
  threadId: string
  onOptimistic?: (temp: {
    id: string
    content: string
    attachments?: AiAttachmentMeta[]
    content_json?: AiUserMessageContentJson | null
  }) => void
  onAssistantStreamStart?: (temp: { id: string; content: string }) => void
  onAssistantStreamChunk?: (tempId: string, chunk: string) => void
  onAssistantStreamStatus?: (tempId: string, statusText: string | null) => void
  onAssistantStreamComplete?: (tempId: string, payload: { content?: string; messageId?: string | null }) => void
  onAssistantStreamError?: (tempId: string) => void
  /** Stream `__AI_ACTION__` events (e.g. content_saved). */
  onAiChatAction?: (action: AiChatStreamAction) => void
  /** Stream `__AI_THREAD_TITLE__` events for live thread title updates. */
  onThreadTitleEvent?: (tempId: string, event: AiChatThreadTitleEvent) => void
  /** Stream `__AI_ASSET__` events for inline asset rendering. */
  onAssetEvent?: (tempId: string, event: AiChatAssetEvent) => void
  /** Stream `__AI_MESSAGE_OUTPUT__` final output payload. */
  onMessageOutputEvent?: (tempId: string, event: AiChatMessageOutputEvent) => void
  /** Stream `__AI_COMPONENT_OUTPUT__` final output payload. */
  onComponentOutputEvent?: (tempId: string, event: AiChatComponentOutputEvent) => void
  /** Stream `component_edit_preview` tool-arg previews. */
  onComponentEditPreviewEvent?: (tempId: string, event: AiChatComponentEditPreviewEvent) => void
  /** Stream `ai_change_preview` generic write-action previews. */
  onAiChangePreviewEvent?: (tempId: string, event: AiChatChangePreviewEvent) => void
  /** Stream `__AI_COMPONENT_LIBRARY_TRACE__` component-source summary. */
  onComponentLibraryTraceEvent?: (tempId: string, event: AiChatComponentLibraryTraceEvent) => void
  /** Stream `__AI_COMPONENT_PLAN_TRACE__` structure decision. */
  onComponentPlanTraceEvent?: (tempId: string, event: AiChatComponentPlanTraceEvent) => void
  /** Stream `__AI_REQUEST_PLAN__` execution-plan audit. */
  onRequestPlanEvent?: (tempId: string, event: AiChatRequestPlanEvent) => void
  onAiChatV2RunEvent?: (tempId: string, event: AiChatV2RunEvent) => void
  onRunId?: (tempId: string, runId: string) => void
  onRunTerminalState?: (tempId: string, state: AiRunTerminalState) => void
  onUsageUpdate?: (usage: AiChatUsageSnapshot | null) => void
  threadUsage?: AiChatUsageSnapshot | null
  isThreadUsageLoading?: boolean
  isSendBlockedByUsage?: boolean
  canReviewLimits?: boolean
  /** Thread-level read context for V2 targets (never writable). */
  threadScope?: {
    project_id?: number | null
    task_id?: number | null
    channel_id?: number | null
  } | null
  inFlightTurnRef?: MutableRefObject<InFlightAiTurnMeta | null>
  activeChannelId?: number | null
  preFillMessage?: string
  mode?: "build_component" | "build_briefing" | null
  componentId?: string | null
  autoRun?: boolean
  activeFieldContext?: AiActiveFieldContext
  /** Visible UI context only — never used as write target without an explicit pill. */
  ambientContext?: AiAmbientContext | null
  ambientTaskTitle?: string | null
  ambientChannelName?: string | null
  taskId?: number
  /** Contextual suggestions for empty-query @ menu (tasks/projects/users already known to the host). */
  mentionDirectSeed?: MentionSuggestion[]
  onScopeModeChange?: (scope: "task" | "global" | "project", projectId?: number | null) => void
  droppedFiles?: File[]
  onDroppedFilesHandled?: () => void
  /** Set while a request is in flight so the user can abort streaming. */
  streamAbortRef?: MutableRefObject<AbortController | null>
  /** When true, show stop control instead of send. */
  isAssistantStreaming?: boolean
  /** Submit handler replaces normal ai-chat send (e.g. inline message edit). */
  onSubmitOverride?: (payload: {
    messageText: string
    messageTags: AiContextTag[]
    messageFiles: File[]
    messageSegments?: AiMessageSegment[]
  }) => Promise<void>
  /** When set, follow-up sends target the clarified component output context. */
  clarificationFollowUpRef?: MutableRefObject<null>
  /** Called after a clarification follow-up message is sent. */
  onClarificationFollowUpSent?: () => void
  /** Seed plain text for `inlineEdit` variant. */
  initialPlainTextForEditor?: string | null
  editorSeedKey?: string | number
  variant?: "default" | "inlineEdit"
}

const EDITOR_MIN_H = 80
const EDITOR_MAX_H = 400

function projectAbbrev(name: string | null | undefined): string {
  const t = (name ?? "").trim()
  if (t.length === 0) return ""
  if (t.length <= 3) return t.toUpperCase()
  return t.slice(0, 3).toUpperCase()
}

export function Composer({
  threadId,
  onOptimistic,
  onAssistantStreamStart,
  onAssistantStreamChunk,
  onAssistantStreamStatus,
  onAssistantStreamComplete,
  onAssistantStreamError,
  onAiChatAction,
  onThreadTitleEvent,
  onAssetEvent,
  onMessageOutputEvent,
  onComponentOutputEvent,
  onComponentEditPreviewEvent,
  onAiChangePreviewEvent,
  onComponentLibraryTraceEvent,
  onComponentPlanTraceEvent,
  onRequestPlanEvent,
  onAiChatV2RunEvent,
  onRunId,
  onRunTerminalState,
  onUsageUpdate,
  threadUsage,
  isThreadUsageLoading = false,
  isSendBlockedByUsage = false,
  canReviewLimits = false,
  threadScope,
  inFlightTurnRef,
  activeChannelId,
  preFillMessage,
  mode,
  componentId,
  autoRun = false,
  activeFieldContext,
  ambientContext,
  ambientTaskTitle,
  ambientChannelName,
  taskId,
  mentionDirectSeed,
  droppedFiles,
  onDroppedFilesHandled,
  streamAbortRef,
  isAssistantStreaming = false,
  clarificationFollowUpRef,
  onClarificationFollowUpSent,
  onSubmitOverride,
  initialPlainTextForEditor,
  editorSeedKey,
  variant = "default",
}: ComposerProps) {
  const supabase = getSupabaseBrowser()
  const queryClient = useQueryClient()
  const { modelKey, setModelKey } = useAiChatModelSelection()
  const pendingTextSelection = useAiChatTextSelectionStore((s) => s.pending)
  const clearPendingSelection = useAiChatTextSelectionStore((s) => s.clearPendingSelection)
  const appliedSelectionTokenRef = useRef<number | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  /** Plain-text offsets for the active `@query` segment; survives focus loss when clicking the picker. */
  const mentionReplaceRangeRef = useRef<{ start: number; end: number } | null>(null)
  const mentionListRef = useRef<HTMLDivElement | null>(null)
  const taskMentionLoadingRef = useRef(false)
  const taskMentionCursorRef = useRef<any | null>(null)
  const taskMentionHasMoreRef = useRef(false)
  const taskRemoteQueryKeyRef = useRef<string>("")
  const taskRemoteCtxRef = useRef<{ filter: MentionEntityFilter; query: string } | null>(null)
  const taskRemoteFetchGen = useRef(0)
  const [files, setFiles] = useState<File[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [projectOptions, setProjectOptions] = useState<ProjectMention[]>([])
  const [localTaskOptions, setLocalTaskOptions] = useState<TaskMention[]>([])
  const [remoteTaskOptions, setRemoteTaskOptions] = useState<TaskMention[]>([])
  const [taskMentionLoadingMore, setTaskMentionLoadingMore] = useState(false)
  const [isMentionPickerOpen, setIsMentionPickerOpen] = useState(false)
  /** Which trigger opened the picker: `@` (tasks/users/projects/components) or `#` (channels). */
  const [mentionTrigger, setMentionTrigger] = useState<"@" | "#">("@")
  const [activeMentionIndex, setActiveMentionIndex] = useState(0)
  const [mentionAnchor, setMentionAnchor] = useState<{ left: number; top: number } | null>(null)
  const [mentionFilter, setMentionFilter] = useState<MentionEntityFilter>("all")
  /** Level 2: task expanded — channels + inline components in one panel. */
  const [mentionExpandedTask, setMentionExpandedTask] = useState<TaskMention | null>(null)
  const [mentionChannelsByTaskId, setMentionChannelsByTaskId] = useState<Record<number, MentionChannel[]>>({})
  /** Per `${taskId}:${channelId}` only — never a task-wide or cross-channel pool. */
  const [componentsByTaskChannel, setComponentsByTaskChannel] = useState<
    Record<string, TaskChannelComponentsBucket>
  >({})
  const [mentionChannelsLoadingTaskId, setMentionChannelsLoadingTaskId] = useState<number | null>(null)
  const mentionChannelsByTaskIdRef = useRef(mentionChannelsByTaskId)
  mentionChannelsByTaskIdRef.current = mentionChannelsByTaskId
  const channelsInFlightRef = useRef<number | null>(null)
  /** Avoid `task_group_tasks_filtered` effect re-running when only local snapshot count changes. */
  const localTaskOptionsLenRef = useRef(0)
  localTaskOptionsLenRef.current = localTaskOptions.length
  const [userOptions, setUserOptions] = useState<UserMention[]>([])
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 })
  const refreshEditorEmpty = useCallback(() => {}, [])
  const [, bumpEditor] = useReducer((n: number) => n + 1, 0)
  const [recentEpoch, bumpRecentEpoch] = useReducer((n: number) => n + 1, 0)

  const [shouldUseBuildModeOnNextSend, setShouldUseBuildModeOnNextSend] = useState(false)
  const lastArmedBuildIntentRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const projectTriggerRef = useRef<HTMLButtonElement | null>(null)
  /** After Escape/outside dismiss, avoid reopening the menu on the same `@…` until input changes or caret leaves the segment. */
  const mentionUserDismissedRef = useRef(false)
  const mentionPickerKeyRef = useRef<{
    pickerRows: MentionPickerRow[]
    activeMentionIndex: number
    handlePickRow: (row: MentionPickerRow) => void
    dismissMentionPicker: () => void
  }>({
    pickerRows: [],
    activeMentionIndex: 0,
    handlePickRow: () => {},
    dismissMentionPicker: () => {},
  })
  const handleMentionMenuKeyDownRef = useRef<(e: React.KeyboardEvent | KeyboardEvent) => void>(() => {})
  const lastMentionSyncReasonRef = useRef<"input" | "keyup" | "click" | "programmatic">("programmatic")

  const syncMentionFromEditor = useCallback((reason: "input" | "keyup" | "click" | "programmatic" = "programmatic") => {
    const root = editorRef.current
    if (!root) return
    lastMentionSyncReasonRef.current = reason
    const textBefore = getTextBeforeSelection(root)
    const active = parseActiveMentionAtCaret(textBefore)
    if (mentionUserDismissedRef.current) {
      if (!active) mentionUserDismissedRef.current = false
      else return
    }
    if (!active) {
      mentionReplaceRangeRef.current = null
      setMentionQuery(null)
      setIsMentionPickerOpen(false)
      setMentionAnchor(null)
      setMentionFilter("all")
      setMentionExpandedTask(null)
      setMentionTrigger("@")
      return
    }
    mentionReplaceRangeRef.current = { start: active.startPlainOffset, end: textBefore.length }
    setMentionTrigger(active.trigger)
    setMentionQuery(active.query)
    if (active.query.trim().length > 0) {
      setMentionFilter("all")
    }
    if (active.trigger === "#") {
      // Channel picker is a single flat list — never the task browse levels.
      setMentionExpandedTask(null)
      setMentionFilter("all")
    }
    setIsMentionPickerOpen(true)
    const rect = getCaretClientRect(root)
    if (rect) {
      setMentionAnchor({
        left: Math.max(8, rect.left),
        top: Math.max(8, rect.top),
      })
    }
  }, [])

  const resizeEditor = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    el.style.height = "auto"
    const next = Math.min(Math.max(el.scrollHeight, EDITOR_MIN_H), EDITOR_MAX_H)
    el.style.height = `${next}px`
  }, [])

  useEffect(() => {
    if (variant === "inlineEdit") return
    if (preFillMessage) {
      const el = editorRef.current
      if (el) {
        setComposerPlainText(el, preFillMessage)
        focusEnd(el)
        resizeEditor()
        refreshEditorEmpty()
        syncMentionFromEditor("programmatic")
      }
    }
  }, [variant, preFillMessage, refreshEditorEmpty, resizeEditor, syncMentionFromEditor])

  const textSelectionChipData = useMemo(() => {
    if (!pendingTextSelection) return null
    const text = pendingTextSelection.context.selected_text.trim()
    if (!text) return null
    return { text, tooltip: chipLabelForSelection(pendingTextSelection.context) }
  }, [pendingTextSelection])

  // Keep an inline chip (styled like an @-mention) at the very top of the composer input,
  // mirroring the store. The passage itself travels as selected_text_context on send.
  useEffect(() => {
    if (variant === "inlineEdit") return
    const el = editorRef.current
    if (!el) return
    ensureTextSelectionChip(el, textSelectionChipData)
    refreshEditorEmpty()
    resizeEditor()
  }, [textSelectionChipData, variant, refreshEditorEmpty, resizeEditor, threadId])

  // When a new passage is attached, focus the composer so the user can type a free-form
  // instruction. We never pre-fill the message text.
  useEffect(() => {
    if (variant === "inlineEdit") return
    const token = pendingTextSelection?.token ?? null
    if (token == null || appliedSelectionTokenRef.current === token) return
    appliedSelectionTokenRef.current = token
    const el = editorRef.current
    if (!el) return
    focusEnd(el)
    resizeEditor()
  }, [pendingTextSelection, variant, resizeEditor])

  useEffect(() => {
    const hasExplicitBuildIntent = mode === "build_component" && !!componentId && !autoRun && !!preFillMessage
    if (!hasExplicitBuildIntent) return
    const intentSignature = `${componentId}:${preFillMessage}`
    if (lastArmedBuildIntentRef.current === intentSignature) return
    lastArmedBuildIntentRef.current = intentSignature
    if (!shouldUseBuildModeOnNextSend) {
      setShouldUseBuildModeOnNextSend(true)
    }
  }, [mode, componentId, autoRun, preFillMessage, shouldUseBuildModeOnNextSend])

  useEffect(() => {
    const syncViewport = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight })
    syncViewport()
    window.addEventListener("resize", syncViewport)
    window.addEventListener("scroll", syncViewport, true)
    return () => {
      window.removeEventListener("resize", syncViewport)
      window.removeEventListener("scroll", syncViewport, true)
    }
  }, [])

  useEffect(() => {
    logAiChatDebug("Composer.mount", { threadId, variant })
    return () => {
      logAiChatDebug("Composer.unmount", { threadId, variant })
    }
  }, [threadId, variant])

  useEffect(() => {
    if (!droppedFiles || droppedFiles.length === 0) return
    if (variant === "inlineEdit") return
    const accepted = droppedFiles.filter((file) => isSupportedImageAttachment(file))
    const rejected = droppedFiles.filter((file) => !isSupportedImageAttachment(file))
    if (accepted.length > 0) {
      setFiles((prev) => [...prev, ...accepted])
    }
    if (rejected.length > 0) {
      setAttachmentError("Unsupported attachment type. Allowed: PNG, JPG, JPEG, WEBP, GIF.")
    } else {
      setAttachmentError(null)
    }
    onDroppedFilesHandled?.()
  }, [droppedFiles, onDroppedFilesHandled, variant])

  useEffect(() => {
    if (variant !== "inlineEdit") return
    setFiles([])
    setAttachmentError(null)
  }, [variant, editorSeedKey])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (!list) return
    const next = Array.from(list)
    const accepted = next.filter((file) => isSupportedImageAttachment(file))
    const rejected = next.filter((file) => !isSupportedImageAttachment(file))
    if (accepted.length > 0) {
      setFiles((prev) => [...prev, ...accepted])
    }
    if (rejected.length > 0) {
      setAttachmentError("Unsupported attachment type. Allowed: PNG, JPG, JPEG, WEBP, GIF.")
    } else {
      setAttachmentError(null)
    }
    e.target.value = ""
  }

  const removePendingFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const uploadAttachments = useCallback(
    async (filesToUpload: File[]): Promise<AiAttachmentMeta[]> => {
      const attachments: AiAttachmentMeta[] = []
      for (const file of filesToUpload) {
        const safeFileName = sanitizeStorageFileName(file.name)
        const path = `ai/${threadId}/${Date.now()}_${crypto.randomUUID()}_${safeFileName}`
        const { data: up, error } = await supabase.storage.from("attachments").upload(path, file, { upsert: false })
        if (error) throw error
        attachments.push({ file_name: file.name, file_path: up.path, mime_type: file.type, size: file.size })
      }
      return attachments
    },
    [supabase, threadId]
  )

  const selectionTags = useMemo(
    () => buildComposerSelectionTags(activeFieldContext),
    [
      activeFieldContext?.channelId,
      activeFieldContext?.componentId,
      activeFieldContext?.componentTitle,
      activeFieldContext?.entityId,
      activeFieldContext?.fieldType,
      activeFieldContext?.label,
      activeFieldContext?.selectedContextType,
      activeFieldContext?.taskComponentId,
      activeFieldContext?.taskId,
      activeFieldContext?.taskTitle,
      activeFieldContext?.channelName,
      activeFieldContext?.componentSelectionSource,
      activeFieldContext?.contextSource,
    ]
  )

  const prevComposerThreadIdRef = useRef(threadId)

  useEffect(() => {
    if (prevComposerThreadIdRef.current === threadId) return
    prevComposerThreadIdRef.current = threadId
    const el = editorRef.current
    if (!el) return
    clearComposerEditor(el)
    mentionReplaceRangeRef.current = null
    setMentionQuery(null)
    setIsMentionPickerOpen(false)
    setMentionAnchor(null)
    setMentionFilter("all")
    setMentionExpandedTask(null)
    mentionUserDismissedRef.current = false
    refreshEditorEmpty()
    resizeEditor()
  }, [threadId, refreshEditorEmpty, resizeEditor])

  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    ensureSelectionChips(el, selectionTags)
    refreshEditorEmpty()
    resizeEditor()
  }, [selectionTags, refreshEditorEmpty, resizeEditor, threadId])

  useEffect(() => {
    if (variant !== "inlineEdit" || initialPlainTextForEditor == null) return
    const el = editorRef.current
    if (!el) return
    setComposerPlainText(el, initialPlainTextForEditor)
    ensureSelectionChips(el, selectionTags)
    focusEnd(el)
    resizeEditor()
    refreshEditorEmpty()
    syncMentionFromEditor("programmatic")
  }, [
    variant,
    initialPlainTextForEditor,
    editorSeedKey,
    selectionTags,
    refreshEditorEmpty,
    resizeEditor,
    syncMentionFromEditor,
  ])

  const runSend = useCallback(
    async (args: {
      messageText: string
      messageFiles: File[]
      messageTags: AiContextTag[]
      messageSegments: AiMessageSegment[]
      clearComposerInput: boolean
    }) => {
      const { messageText, messageFiles, messageTags, messageSegments, clearComposerInput } = args
      const trimmed = messageText.trim()
      if (!trimmed && messageFiles.length === 0) return
      if (isSending) return
      if (isSendBlockedByUsage) return
      setAttachmentError(null)

      const selectedTextForSend = pendingTextSelection?.context ?? null

      const {
        tagged_task_ids: taggedTaskIds,
        tagged_project_ids: taggedProjectIds,
        tagged_user_ids: taggedUserIds,
        tagged_channel_ids: taggedChannelIds,
        tagged_task_channel_refs: taggedTaskChannelRefs,
        tagged_task_component_refs: taggedTaskComponentRefs,
      } = buildAiChatTaggedRefs(messageTags)
      const optimisticUserTempId = `temp-${Date.now()}`

      if (clearComposerInput) {
        setFiles([])
        mentionReplaceRangeRef.current = null
        setMentionQuery(null)
        setIsMentionPickerOpen(false)
        setMentionAnchor(null)
        setMentionFilter("all")
        setMentionExpandedTask(null)
        mentionUserDismissedRef.current = false
        const root = editorRef.current
        if (root) {
          clearComposerEditor(root)
          refreshEditorEmpty()
          resizeEditor()
        }
      }
      setIsSending(true)

      // The passage is captured in `selectedTextForSend`; drop the chip immediately on send so it
      // never lingers in the composer (regardless of streaming outcome).
      if (selectedTextForSend) {
        clearPendingSelection()
      }

      const normalizedPreFillMessage = (preFillMessage ?? "").trim()
      const matchesExplicitBuildPrompt = normalizedPreFillMessage.length > 0 && trimmed === normalizedPreFillMessage
      const useBuildModeForThisSend =
        mode === "build_component" &&
        !!componentId &&
        !autoRun &&
        shouldUseBuildModeOnNextSend &&
        matchesExplicitBuildPrompt

      const outboundContext = resolveAiChatOutboundContext({
        messageTags,
        explicitBuild:
          (useBuildModeForThisSend || (mode === "build_component" && componentId && autoRun)) && componentId
            ? {
                componentId,
                taskId: activeFieldContext?.taskId ?? (mode === "build_component" ? taskId ?? null : null),
                channelId:
                  activeFieldContext?.channelId ?? (mode === "build_component" ? activeChannelId ?? null : null),
                taskComponentOutputId: activeFieldContext?.taskComponentOutputId ?? null,
                componentTitle: activeFieldContext?.componentTitle ?? null,
              }
            : null,
      })

      console.log(
        "[ai-chat] component output selection",
        resolveComponentOutputSelectionDiagnostics(activeFieldContext, {}, {
          taggedComponentRefs: taggedTaskComponentRefs,
        }),
        { outboundContext, ambientContext },
      )

      const effectiveMode = outboundContext.mode ?? (useBuildModeForThisSend ? "build_component" : null)
      const effectiveComponentId = outboundContext.componentId
      const shouldStreamResponse =
        !autoRun && (!effectiveMode || effectiveMode === "build_component" || effectiveMode === "assistant_only")
      if (shouldUseBuildModeOnNextSend) {
        setShouldUseBuildModeOnNextSend(false)
      }

      const writeMode = effectiveMode
      const factualSendContext = resolveFactualLegacySendContext({
        activeFieldContext,
        selectedTextContext: selectedTextForSend,
        outboundContext,
        visibleTaskId: taskId ?? null,
        visibleChannelId: activeChannelId ?? null,
      })
      const writeComponentId = factualSendContext.componentId
      const writeTaskId = factualSendContext.taskId
      const writeChannelId = factualSendContext.channelId
      const writeTaskComponentOutputId = factualSendContext.taskComponentOutputId
      const writeSelectedContextType = factualSendContext.selectedContextType
      const writeSelectedComponentLabel = factualSendContext.selectedComponentLabel
      const writeContextSource = factualSendContext.contextSource

      const abortCtl = streamAbortRef ? new AbortController() : null
      if (streamAbortRef && abortCtl) streamAbortRef.current = abortCtl
      try {
        const attachments = await uploadAttachments(messageFiles)
        const userContentJson = buildUserMessageContentJson({
          tags: messageTags,
          segments: messageSegments,
        })
        onOptimistic?.({
          id: optimisticUserTempId,
          content: trimmed,
          attachments,
          content_json: userContentJson,
        })
        // Snapshot before edit needs a task/channel; derive from the explicit write scope, then
        // fall back to the tagged component/channel refs (never from ambient-only context).
        const snapshotRef =
          taggedTaskComponentRefs?.[0] ?? taggedTaskChannelRefs?.[0] ?? null
        const resolvedTaskForSnapshot = writeTaskId ?? snapshotRef?.task_id ?? null
        const resolvedChannelForSnapshot = writeChannelId ?? snapshotRef?.channel_id ?? null
        if (
          shouldSaveChannelSnapshotBeforeAiSend({
            taskId: resolvedTaskForSnapshot,
            channelId: resolvedChannelForSnapshot,
            mode: writeMode,
            hasComponentOutputContext: writeSelectedContextType === "component_output",
            taggedTaskComponentRefCount: taggedTaskComponentRefs?.length ?? 0,
            autoRun,
          })
        ) {
          await saveChannelSnapshotBeforeAiEdit({
            taskId: resolvedTaskForSnapshot,
            channelId: resolvedChannelForSnapshot,
            changeSummary: trimmed.slice(0, 160) || "Before AI edit",
            aiThreadId: threadId,
          })
        }

        const clientRequestId = crypto.randomUUID()
        const resolvedOutputRevision = (() => {
          if (activeFieldContext?.outputUpdatedAt?.trim()) {
            return activeFieldContext.outputUpdatedAt.trim()
          }
          const outputId = activeFieldContext?.taskComponentOutputId?.trim() || null
          const resolvedTaskId = activeFieldContext?.taskId ?? taskId ?? null
          const resolvedChannelId = activeFieldContext?.channelId ?? activeChannelId ?? null
          const resolvedComponentId =
            activeFieldContext?.taskComponentId
            ?? (activeFieldContext?.componentId != null ? String(activeFieldContext.componentId) : null)
          if (
            outputId
            && resolvedTaskId != null
            && resolvedChannelId != null
            && resolvedComponentId
          ) {
            return resolveComponentOutputUpdatedAtFromQueryCache(queryClient, {
              taskId: resolvedTaskId,
              channelId: resolvedChannelId,
              componentId: resolvedComponentId,
              taskComponentOutputId: outputId,
            })
          }
          return null
        })()
        const v2Request = buildAiChatV2RequestFields({
          clientRequestId,
          messageTags,
          attachments,
          activeFieldContext,
          selectedTextContext: selectedTextForSend,
          explicitBuild:
            (useBuildModeForThisSend || (mode === "build_component" && componentId && autoRun)) && componentId
              ? {
                  componentId,
                  taskId: activeFieldContext?.taskId ?? (mode === "build_component" ? taskId ?? null : null),
                  channelId:
                    activeFieldContext?.channelId ?? (mode === "build_component" ? activeChannelId ?? null : null),
                  taskComponentOutputId: activeFieldContext?.taskComponentOutputId ?? null,
                  componentTitle: activeFieldContext?.componentTitle ?? null,
                }
              : null,
          clarificationContext: null,
          outboundContext,
          taggedTaskChannelRefs,
          taggedTaskComponentRefs,
          ambientContext: ambientContext ?? null,
          visibleTaskId: taskId ?? null,
          visibleChannelId: activeChannelId ?? null,
          threadScope: threadScope ?? null,
          outputRevision: resolvedOutputRevision,
        })
        if (inFlightTurnRef) {
          inFlightTurnRef.current = {
            clientRequestId,
            assistantTempId: null,
            runId: null,
            terminalState: null,
          }
        }

        await sendConversationAiChatStream({
          threadId,
          message: trimmed,
          displayMessage: trimmed,
          attachments,
          activeChannelId: factualSendContext.activeChannelId ?? outboundContext.activeChannelId,
          taggedTaskIds,
          taggedProjectIds,
          taggedUserIds,
          taggedChannelIds,
          taggedTaskChannelRefs,
          taggedTaskComponentRefs,
          mode: writeMode,
          componentId: writeComponentId,
          taskId: writeTaskId,
          channelId: writeChannelId,
          taskComponentOutputId: writeTaskComponentOutputId,
          selectedContextType: writeSelectedContextType,
          selectedComponentLabel: writeSelectedComponentLabel,
          contextSource: writeContextSource,
          ambientContext: ambientContext ?? null,
          modelKey,
          selectedTextContext: selectedTextForSend,
          autoRun,
          stream: shouldStreamResponse,
          includeOptimisticUser: false,
          clientRequestId,
          v2Request,
          inFlightTurn: inFlightTurnRef?.current ?? null,
          signal: abortCtl?.signal,
          onAssistantStreamStart: (temp) => {
            if (inFlightTurnRef?.current) inFlightTurnRef.current.assistantTempId = temp.id
            onAssistantStreamStart?.(temp)
          },
          onAssistantStreamChunk,
          onAssistantStreamStatus,
          onAssistantStreamComplete,
          onAssistantStreamError,
          onAssistantStreamIdle: () => {
            if (streamAbortRef) streamAbortRef.current = null
            setIsSending(false)
          },
          onAiChatAction,
          onThreadTitleEvent,
          onAssetEvent,
          onMessageOutputEvent,
          onComponentOutputEvent,
          onComponentEditPreviewEvent,
          onAiChangePreviewEvent,
          onComponentLibraryTraceEvent,
          onComponentPlanTraceEvent,
          onRequestPlanEvent,
          onAiChatV2RunEvent,
          onRunId,
          onRunTerminalState,
          onUsageUpdate,
        })
        onClarificationFollowUpSent?.()
        if (userContentJson) {
          await persistUserMessageMentionMetadata({
            threadId,
            content: trimmed,
            contentJson: userContentJson,
          })
        }
      } catch (e) {
        console.error("send failed", e)
        setAttachmentError("Failed to send message or upload attachments. Please try again.")
      } finally {
        if (streamAbortRef) streamAbortRef.current = null
        setIsSending(false)
      }
    },
    [
      isSending,
      supabase,
      threadId,
      uploadAttachments,
      onOptimistic,
      onAssistantStreamStart,
      onAssistantStreamChunk,
      onAssistantStreamStatus,
      onAssistantStreamComplete,
      onAssistantStreamError,
      onAiChatAction,
      onThreadTitleEvent,
      onAssetEvent,
      onMessageOutputEvent,
      onComponentOutputEvent,
      onComponentEditPreviewEvent,
      onAiChangePreviewEvent,
      onComponentLibraryTraceEvent,
      onComponentPlanTraceEvent,
      onRequestPlanEvent,
      activeChannelId,
      mode,
      componentId,
      autoRun,
      preFillMessage,
      shouldUseBuildModeOnNextSend,
      activeFieldContext,
      ambientContext,
      modelKey,
      pendingTextSelection,
      clearPendingSelection,
      taskId,
      refreshEditorEmpty,
      resizeEditor,
      streamAbortRef,
      clarificationFollowUpRef,
      onClarificationFollowUpSent,
      threadScope,
      inFlightTurnRef,
      onAiChatV2RunEvent,
      onRunId,
      onRunTerminalState,
      onUsageUpdate,
      isSendBlockedByUsage,
    ]
  )

  const send = useCallback(async () => {
    const root = editorRef.current
    if (!root) return
    const { messageText, tags, segments } = serializeComposerEditor(root)
    if (onSubmitOverride) {
      const trimmed = messageText.trim()
      if (!trimmed && files.length === 0) return
      if (isSending) return
      setIsSending(true)
      try {
        await onSubmitOverride({
          messageText,
          messageTags: tags,
          messageFiles: [...files],
          messageSegments: segments,
        })
      } finally {
        setIsSending(false)
      }
      return
    }
    await runSend({
      messageText,
      messageFiles: [...files],
      messageTags: tags,
      messageSegments: segments,
      clearComposerInput: true,
    })
  }, [runSend, files, onSubmitOverride, isSending])

  useEffect(() => {
    if (mentionQuery == null) return
    if (mentionFilter === "task" || mentionFilter === "user") {
      setProjectOptions([])
      return
    }
    let cancelled = false
    ;(async () => {
      logAiChatDebug("query.trigger.v_projects_minimal", {
        source: "mention-query-effect",
        mentionFilter,
        queryLength: mentionQuery.trim().length,
        syncReason: lastMentionSyncReasonRef.current,
      })
      const query = mentionQuery.trim()
      const request = supabase.from("v_projects_minimal").select("id,name,color,logo").order("name", { ascending: true })
      const { data, error } = query ? await request.ilike("name", `%${query}%`) : await request
      if (cancelled) return
      if (error) {
        console.error("Failed to load project mentions:", error)
        setProjectOptions([])
        return
      }
      setProjectOptions((data || []) as ProjectMention[])
    })()
    return () => {
      cancelled = true
    }
  }, [mentionQuery, mentionFilter, supabase])

  useEffect(() => {
    if (mentionQuery == null) return
    if (mentionFilter === "project" || mentionFilter === "user") {
      setLocalTaskOptions([])
      return
    }
    const allLoaded = getLoadedTaskRowsSnapshot()
    const query = mentionQuery.trim().toLowerCase()
    const localCandidates = allLoaded
      .filter((row) => Number.isFinite(Number(row.id)))
      .map((row) => ({
        id: Number(row.id),
        title: String(row.title || "").trim(),
        projectName: row.project_name || null,
        projectLogo: row.project_logo ?? null,
        projectColor: row.project_color ?? null,
      }))
      .filter((row) => row.title.length > 0)
      .filter((row) => {
        if (!query) return true
        const haystack = `${row.title} ${row.projectName || ""}`.toLowerCase()
        return haystack.includes(query)
      })
      .slice(0, 25)
    setLocalTaskOptions(localCandidates)
  }, [mentionQuery, mentionFilter])

  const mapRpcRowsToTasks = useCallback(
    (rows: Array<Record<string, unknown>>): TaskMention[] =>
      rows
        .filter((row) => Number.isFinite(Number(row.id)))
        .map((row) => ({
          id: Number(row.id),
          title: String(row.title ?? "").trim(),
          projectName: (row.project_name as string | null | undefined) ?? null,
          projectLogo: (row.project_logo as string | null | undefined) ?? null,
          projectColor: (row.project_color as string | null | undefined) ?? null,
        }))
        .filter((row) => row.title.length > 0),
    []
  )

  const fetchRemoteTaskMentions = useCallback(
    async (opts: { reset: boolean; queryKey: string; q: string }) => {
      if (taskMentionLoadingRef.current && !opts.reset) return
      if (!opts.reset && !taskMentionHasMoreRef.current) return

      taskMentionLoadingRef.current = true
      if (!opts.reset) setTaskMentionLoadingMore(true)

      const q = opts.q
      const cursor = opts.reset ? null : taskMentionCursorRef.current

      try {
        const { data, error } = await supabase.rpc("task_group_tasks_filtered", {
          p_q: q.length > 0 ? q : "",
          p_project_ids: null,
          p_status_names: null,
          p_assignee_ids: null,
          p_content_type_ids: null,
          p_production_type_ids: null,
          p_language_ids: null,
          p_is_overdue: null,
          p_is_publication_overdue: null,
          p_group_by: "all",
          p_group_key: "all",
          p_row_sort_by: "updated_at",
          p_row_sort_order: "desc",
          p_limit: 20,
          p_cursor: cursor,
          p_channels: null,
          p_delivery_date_gte: null,
          p_delivery_date_lt: null,
          p_publication_date_gte: null,
          p_publication_date_lt: null,
        })
        if (taskRemoteQueryKeyRef.current !== opts.queryKey) return
        if (error) {
          console.error("Failed to load task mentions:", error)
          if (opts.reset) setRemoteTaskOptions([])
          taskMentionCursorRef.current = null
          taskMentionHasMoreRef.current = false
          return
        }
        const payload = (data as { rows?: Array<Record<string, unknown>>; next_cursor?: unknown } | null) ?? {}
        const rawRows = payload.rows ?? []
        const nextCur = payload.next_cursor ?? null
        const mapped = mapRpcRowsToTasks(rawRows)

        taskMentionCursorRef.current = nextCur
        taskMentionHasMoreRef.current = nextCur != null && rawRows.length > 0

        setRemoteTaskOptions((prev) => {
          if (opts.reset) return mapped
          const seen = new Set(prev.map((t) => t.id))
          const next = [...prev]
          for (const t of mapped) {
            if (!seen.has(t.id)) {
              seen.add(t.id)
              next.push(t)
            }
          }
          return next
        })
      } finally {
        taskMentionLoadingRef.current = false
        setTaskMentionLoadingMore(false)
      }
    },
    [mapRpcRowsToTasks, supabase]
  )

  const handleMentionListScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (mentionExpandedTask) return
      if (mentionFilter === "project" || mentionFilter === "user") return
      const el = e.currentTarget
      if (taskMentionLoadingRef.current || !taskMentionHasMoreRef.current) return
      if (el.scrollTop + el.clientHeight < el.scrollHeight - 48) return
      const ctx = taskRemoteCtxRef.current
      const qk = taskRemoteQueryKeyRef.current
      if (!ctx || !qk || `${ctx.filter}:${ctx.query}` !== qk) return
      logAiChatDebug("query.trigger.task_group_tasks_filtered", {
        source: "mention-list-scroll",
        mentionFilter: ctx.filter,
        queryLength: ctx.query.length,
      })
      void fetchRemoteTaskMentions({ reset: false, queryKey: qk, q: ctx.query })
    },
    [mentionFilter, fetchRemoteTaskMentions, mentionExpandedTask]
  )

  /**
   * Remote task search: deps must NOT include `localTaskOptions.length`. That caused repeated
   * `task_group_tasks_filtered` calls whenever the in-memory snapshot grew (same query, new dependency).
   * `localTaskOptionsLenRef` reads the current length without re-subscribing the effect.
   */
  useEffect(() => {
    if (mentionQuery == null) return
    if (mentionFilter === "project" || mentionFilter === "user") {
      taskRemoteFetchGen.current += 1
      taskMentionCursorRef.current = null
      taskMentionHasMoreRef.current = false
      taskRemoteQueryKeyRef.current = ""
      taskRemoteCtxRef.current = null
      setRemoteTaskOptions([])
      return
    }
    const query = mentionQuery.trim()
    const loadRemoteForAll = mentionFilter === "all" && query.length >= 2 && localTaskOptionsLenRef.current < 8
    const loadRemoteForTaskScope = mentionFilter === "task" && (query.length === 0 || query.length >= 2)
    if (!loadRemoteForAll && !loadRemoteForTaskScope) {
      if (mentionFilter === "all" && query.length < 2) {
        taskMentionCursorRef.current = null
        taskMentionHasMoreRef.current = false
        taskRemoteQueryKeyRef.current = ""
        taskRemoteCtxRef.current = null
        setRemoteTaskOptions([])
      }
      if (mentionFilter === "task" && query.length === 1) {
        taskMentionCursorRef.current = null
        taskMentionHasMoreRef.current = false
        taskRemoteQueryKeyRef.current = ""
        taskRemoteCtxRef.current = null
        setRemoteTaskOptions([])
      }
      return
    }

    const queryKey = `${mentionFilter}:${query}`
    taskRemoteQueryKeyRef.current = queryKey
    taskRemoteCtxRef.current = { filter: mentionFilter, query }
    const gen = ++taskRemoteFetchGen.current
    taskMentionCursorRef.current = null
    taskMentionHasMoreRef.current = true

    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        if (cancelled || gen !== taskRemoteFetchGen.current) return
        logAiChatDebug("query.trigger.task_group_tasks_filtered", {
          source: "mention-query-effect",
          mentionFilter,
          queryLength: query.length,
          syncReason: lastMentionSyncReasonRef.current,
        })
        await fetchRemoteTaskMentions({ reset: true, queryKey, q: query })
      })()
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [mentionQuery, mentionFilter, fetchRemoteTaskMentions])

  useEffect(() => {
    if (mentionQuery == null) return
    const shouldLoadUsers =
      mentionFilter === "user" || (mentionFilter === "all" && mentionQuery.trim().length > 0)
    if (!shouldLoadUsers) {
      setUserOptions([])
      return
    }
    let cancelled = false
    ;(async () => {
      logAiChatDebug("query.trigger.v_users_minimal_i_can_see", {
        source: "mention-query-effect",
        mentionFilter,
        queryLength: mentionQuery.trim().length,
        syncReason: lastMentionSyncReasonRef.current,
      })
      const q = mentionQuery.trim()
      let request = supabase
        .from("v_users_minimal_i_can_see")
        .select("id,full_name,email,photo")
        .order("full_name", { ascending: true })
        .limit(25)
      if (q.length > 0) {
        request = request.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      }
      const { data, error } = await request
      if (cancelled) return
      if (error) {
        console.error("Failed to load user mentions:", error)
        setUserOptions([])
        return
      }
      setUserOptions(
        ((data || []) as UserMention[]).map((row) => ({
          id: Number(row.id),
          full_name: row.full_name,
          email: row.email,
          photo: row.photo,
        }))
      )
    })()
    return () => {
      cancelled = true
    }
  }, [mentionQuery, mentionFilter, supabase])

  const mentionSuggestionsFull = useMemo<MentionSuggestion[]>(() => {
    const results: MentionSuggestion[] = []
    const seen = new Set<string>()
    for (const project of projectOptions) {
      const key = `project:${project.id}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push({
        kind: "project",
        id: project.id,
        label: project.name,
        project,
      })
    }
    for (const task of [...localTaskOptions, ...remoteTaskOptions]) {
      const key = `task:${task.id}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push({
        kind: "task",
        id: task.id,
        label: task.title,
        task,
      })
    }
    for (const user of userOptions) {
      const key = `user:${user.id}`
      if (seen.has(key)) continue
      seen.add(key)
      const displayName = (user.full_name || user.email || `User ${user.id}`).trim()
      results.push({
        kind: "user",
        id: user.id,
        label: displayName,
        user,
      })
    }
    return results
  }, [localTaskOptions, projectOptions, remoteTaskOptions, userOptions])

  const mentionSuggestionsFiltered = useMemo(() => {
    if (mentionFilter === "project") {
      return mentionSuggestionsFull.filter((s) => s.kind === "project")
    }
    if (mentionFilter === "task") {
      return mentionSuggestionsFull.filter((s) => s.kind === "task")
    }
    if (mentionFilter === "user") {
      return mentionSuggestionsFull.filter((s) => s.kind === "user")
    }
    const q = (mentionQuery ?? "").trim()
    if (q.length === 0) return []
    return mentionSuggestionsFull
  }, [mentionFilter, mentionQuery, mentionSuggestionsFull])

  const directCombined = useMemo(() => {
    const seen = new Set<string>()
    const out: MentionSuggestion[] = []
    const add = (s: MentionSuggestion | null) => {
      if (!s) return
      const k = `${s.kind}:${s.id}`
      if (seen.has(k)) return
      seen.add(k)
      out.push(s)
    }
    for (const r of loadRecentMentions()) {
      add(storedToSuggestion(r))
    }
    for (const s of mentionDirectSeed ?? []) {
      add(s)
    }
    return out.slice(0, 6)
  }, [mentionDirectSeed, recentEpoch])

  const loadTaskExpansionData = useCallback(
    async (task: TaskMention) => {
      const tid = task.id
      const cached = mentionChannelsByTaskIdRef.current[tid]
      if (cached) return
      if (channelsInFlightRef.current === tid) return
      channelsInFlightRef.current = tid
      setMentionChannelsLoadingTaskId(tid)
      try {
        const { data, error } = await supabase.rpc("tc_components_for_task_all_channels", {
          p_task_id: tid,
        })
        if (error) {
          console.error("tc_components_for_task_all_channels mention load failed", error)
          setMentionChannelsByTaskId((prev) => ({ ...prev, [tid]: [] }))
          return
        }
        const { channels, componentsByTaskChannel: groupedComponents } = mapTcComponentsAllChannelsRpc(data)
        const nextBuckets: Record<string, TaskChannelComponentsBucket> = {}
        for (const channel of channels) {
          const key = taskChannelCompositeKey(tid, channel.channel_id)
          nextBuckets[key] = {
            loading: false,
            loaded: true,
            error: null,
            items: groupedComponents[key] ?? [],
          }
        }
        if (process.env.NODE_ENV === "development") {
          const rows = (data as Array<Record<string, unknown>> | null) ?? []
          console.debug("[mention] task-channel components", {
            taskId: tid,
            source: "tc_components_for_task_all_channels",
            rawRpcRowCount: rows.length,
            channelCount: channels.length,
          })
        }
        setMentionChannelsByTaskId((prev) => ({ ...prev, [tid]: channels }))
        setComponentsByTaskChannel((prev) => ({ ...prev, ...nextBuckets }))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error("tc_components_for_task_all_channels mention load exception", msg)
        setMentionChannelsByTaskId((prev) => ({ ...prev, [tid]: [] }))
      } finally {
        channelsInFlightRef.current = null
        setMentionChannelsLoadingTaskId(null)
      }
    },
    [supabase]
  )

  const expandTask = useCallback(
    (task: TaskMention) => {
      mentionUserDismissedRef.current = false
      setMentionExpandedTask(task)
      setActiveMentionIndex(0)
      void loadTaskExpansionData(task)
    },
    [loadTaskExpansionData]
  )

  const mentionCurrentTask = useMemo(() => {
    const centerTaskId = ambientContext?.center_task_id
    if (centerTaskId == null || !Number.isFinite(centerTaskId)) return null
    const title = ambientTaskTitle?.trim() || `Task ${centerTaskId}`
    return {
      task: { id: centerTaskId, title },
      channelId: ambientContext?.active_channel_id ?? null,
    }
  }, [ambientContext, ambientTaskTitle])

  /** Tasks whose channels seed the `#` channel picker — the ambient/current task in context. */
  const channelMentionTasks = useMemo(() => {
    const out: Array<{ id: number; title: string; channels: MentionChannel[] }> = []
    const seen = new Set<number>()
    const push = (id: number, title: string) => {
      if (!Number.isFinite(id) || seen.has(id)) return
      seen.add(id)
      out.push({ id, title, channels: mentionChannelsByTaskId[id] ?? [] })
    }
    if (mentionCurrentTask) push(mentionCurrentTask.task.id, mentionCurrentTask.task.title)
    return out
  }, [mentionCurrentTask, mentionChannelsByTaskId])

  // Load the ambient task's channels when the `#` picker opens.
  useEffect(() => {
    if (!isMentionPickerOpen || mentionTrigger !== "#") return
    const current = mentionCurrentTask
    if (current && !mentionChannelsByTaskIdRef.current[current.task.id]) {
      void loadTaskExpansionData({ id: current.task.id, title: current.task.title })
    }
  }, [isMentionPickerOpen, mentionTrigger, mentionCurrentTask, loadTaskExpansionData])

  const pickerRows = useMemo((): MentionPickerRow[] => {
    if (mentionTrigger === "#") {
      return buildChannelMentionRows({
        tasks: channelMentionTasks,
        query: mentionQuery ?? "",
        loading: mentionChannelsLoadingTaskId != null,
      })
    }
    if (mentionExpandedTask) {
      const tid = mentionExpandedTask.id
      const channels = Object.prototype.hasOwnProperty.call(mentionChannelsByTaskId, tid)
        ? mentionChannelsByTaskId[tid]
        : null
      const channelsLoading = mentionChannelsLoadingTaskId === tid
      const slice: Record<string, TaskChannelComponentsBucket | undefined> = {}
      if (channels) {
        for (const ch of channels) {
          const key = taskChannelCompositeKey(tid, ch.channel_id)
          slice[key] = componentsByTaskChannel[key]
        }
      }
      return buildLevel2MentionRows({
        task: mentionExpandedTask,
        channels,
        channelsLoading,
        componentsByTaskChannel: slice,
        query: mentionQuery ?? "",
      })
    }
    return buildLevel1MentionRows({
      mentionFilter,
      mentionQuery,
      mentionSuggestionsFiltered,
      directCombined,
      currentTask: mentionCurrentTask,
    })
  }, [
    mentionTrigger,
    channelMentionTasks,
    mentionExpandedTask,
    mentionChannelsByTaskId,
    mentionChannelsLoadingTaskId,
    componentsByTaskChannel,
    mentionFilter,
    mentionQuery,
    mentionSuggestionsFiltered,
    directCombined,
    mentionCurrentTask,
  ])

  useEffect(() => {
    if (!isMentionPickerOpen) return
    setActiveMentionIndex((prev) => {
      if (pickerRows.length === 0) return 0
      return Math.min(prev, pickerRows.length - 1)
    })
  }, [isMentionPickerOpen, pickerRows.length])

  useEffect(() => {
    if (!isMentionPickerOpen || !mentionListRef.current) return
    const node = mentionListRef.current.querySelector(`[data-mention-index="${activeMentionIndex}"]`)
    node?.scrollIntoView({ block: "nearest" })
  }, [activeMentionIndex, isMentionPickerOpen, pickerRows.length])

  const insertAiTagsIntoEditor = useCallback(
    (tagsToAdd: AiContextTag[], options?: { recent?: MentionSuggestion }) => {
      const root = editorRef.current
      if (!root) return

      /** Replace an existing chip that shares a dedupe key so re-tagging updates in place. */
      const updateExistingChip = (key: string, tag: AiContextTag): boolean => {
        const chips = Array.from(root.querySelectorAll<HTMLElement>('[data-ai-tag="1"]'))
        for (const chip of chips) {
          const parsed = readTagFromChip(chip)
          if (!parsed) continue
          if (composerTagDedupeKey(parsed) !== key) continue
          chip.replaceWith(createTagChip({ ...tag, source: parsed.source }))
          return true
        }
        return false
      }

      const closePicker = () => {
        mentionReplaceRangeRef.current = null
        setMentionQuery(null)
        setIsMentionPickerOpen(false)
        setMentionAnchor(null)
        setMentionFilter("all")
        setMentionExpandedTask(null)
        setMentionTrigger("@")
      }

      const { tags: existing } = serializeComposerEditor(root)
      const seenKeys = new Set(existing.map(composerTagDedupeKey))
      const filtered: AiContextTag[] = []
      for (const tag of tagsToAdd) {
        const key = composerTagDedupeKey(tag)
        if (seenKeys.has(key)) {
          // Same token added again — refresh the existing chip instead of inserting a duplicate.
          updateExistingChip(key, tag)
          continue
        }
        seenKeys.add(key)
        filtered.push(tag)
      }

      if (filtered.length === 0) {
        closePicker()
        requestAnimationFrame(() => root.focus())
        return
      }

      // First chip replaces the active `@mention` range; the rest are inserted after it,
      // separated by spaces so each renders as its own short chip (e.g. `@Task #Blog @Intro`).
      const firstChip = createTagChip(filtered[0])
      const storedRange = mentionReplaceRangeRef.current
      const textBefore = getTextBeforeSelection(root)
      let inserted = false
      if (storedRange) {
        inserted = replacePlainTextRangeWithChip(root, storedRange.start, storedRange.end, firstChip)
      }
      if (!inserted) {
        const activeMention = parseActiveMentionAtCaret(textBefore)
        if (activeMention) {
          inserted = replacePlainTextRangeWithChip(root, activeMention.startPlainOffset, textBefore.length, firstChip)
        }
      }
      if (!inserted) {
        insertNodeAtCaret(root, firstChip)
      }

      for (let i = 1; i < filtered.length; i += 1) {
        insertPlainTextAtCaret(root, " ")
        insertNodeAtCaret(root, createTagChip(filtered[i]))
      }
      // Trailing space so the user can immediately keep typing after the last chip.
      insertPlainTextAtCaret(root, " ")

      closePicker()
      if (options?.recent) pushRecentMention(options.recent)
      bumpRecentEpoch()
      bumpEditor()
      refreshEditorEmpty()
      resizeEditor()
      syncMentionFromEditor("programmatic")
      requestAnimationFrame(() => root.focus())
    },
    [refreshEditorEmpty, resizeEditor, syncMentionFromEditor]
  )

  const insertAiTagIntoEditor = useCallback(
    (tag: AiContextTag, options?: { recent?: MentionSuggestion }) => {
      insertAiTagsIntoEditor([tag], options)
    },
    [insertAiTagsIntoEditor]
  )

  const handleSelectMention = useCallback(
    (suggestion: MentionSuggestion) => {
      let tag: AiContextTag
      if (suggestion.kind === "project") {
        const project = suggestion.project
        tag = {
          type: "project",
          id: project.id,
          label: project.name,
          source: "mention",
          color: project.color,
          logo: project.logo,
        }
      } else if (suggestion.kind === "task") {
        const task = suggestion.task
        tag = {
          type: "task",
          id: task.id,
          label: task.title,
          source: "mention",
          projectName: task.projectName,
        }
      } else {
        const user = suggestion.user
        const label = (user.full_name || user.email || `User ${user.id}`).trim()
        tag = {
          type: "user",
          id: user.id,
          label,
          source: "mention",
          email: user.email,
          logo: user.photo,
        }
      }
      insertAiTagIntoEditor(tag, { recent: suggestion })
    },
    [insertAiTagIntoEditor]
  )

  const handlePickRow = useCallback(
    (row: MentionPickerRow) => {
      if (row.kind === "back") {
        setMentionExpandedTask(null)
        setActiveMentionIndex(0)
        return
      }
      if (row.kind === "loading" || row.kind === "task_header") return
      if (row.kind === "current_task") {
        const tag: AiContextTag = {
          type: "task",
          id: row.task.id,
          label: row.task.title,
          source: "mention",
          contextSource: "user_selected_current_task",
          taskId: row.task.id,
          taskTitle: row.task.title,
          channelId: row.channelId ?? undefined,
          channelName: ambientChannelName ?? null,
        }
        insertAiTagIntoEditor(tag)
        return
      }
      if (row.kind === "channel_mention") {
        // `#` trigger — insert only a channel chip (writes tagged_channel_ids, no implied task).
        const channelTag: AiContextTag = {
          type: "channel",
          id: row.channelId,
          label: row.channelName,
          source: "mention",
          channelId: row.channelId,
          channelName: row.channelName,
          taskId: row.taskId,
          taskTitle: row.taskTitle,
        }
        insertAiTagIntoEditor(channelTag)
        return
      }
      if (row.kind === "channel") {
        // Separate short chips: `@Task` + `#Channel` (no combined `Task / Channel` label).
        const taskTag: AiContextTag = {
          type: "task",
          id: row.task.id,
          label: row.task.title,
          source: "mention",
          taskId: row.task.id,
          taskTitle: row.task.title,
          projectName: row.task.projectName,
        }
        const channelTag: AiContextTag = {
          type: "channel",
          id: row.channelId,
          label: row.channelName,
          source: "mention",
          channelId: row.channelId,
          channelName: row.channelName,
          taskId: row.task.id,
          taskTitle: row.task.title,
        }
        insertAiTagsIntoEditor([taskTag, channelTag])
        return
      }
      if (row.kind === "component") {
        // Separate short chips: `@Task` + `#Channel` + `@Component`.
        const taskTag: AiContextTag = {
          type: "task",
          id: row.task.id,
          label: row.task.title,
          source: "mention",
          taskId: row.task.id,
          taskTitle: row.task.title,
          projectName: row.task.projectName,
        }
        const channelTag: AiContextTag = {
          type: "channel",
          id: row.channelId,
          label: row.channelName,
          source: "mention",
          channelId: row.channelId,
          channelName: row.channelName,
          taskId: row.task.id,
          taskTitle: row.task.title,
        }
        const componentTag: AiContextTag = {
          type: "task_component",
          id: row.componentId,
          label: row.componentTitle,
          source: "mention",
          taskId: row.task.id,
          taskTitle: row.task.title,
          channelId: row.channelId,
          channelName: row.channelName,
          componentId: row.componentId,
          componentTitle: row.componentTitle,
          projectName: row.task.projectName,
        }
        insertAiTagsIntoEditor([taskTag, channelTag, componentTag])
        return
      }
      if (row.kind === "group") {
        setMentionExpandedTask(null)
        setMentionFilter(row.id)
        setActiveMentionIndex(0)
        return
      }
      handleSelectMention(row.suggestion)
    },
    [handleSelectMention, insertAiTagIntoEditor, insertAiTagsIntoEditor, ambientChannelName]
  )

  /** Close tag popup only; leaves editor text and chips unchanged. */
  const dismissMentionPicker = useCallback(() => {
    mentionUserDismissedRef.current = true
    mentionReplaceRangeRef.current = null
    setIsMentionPickerOpen(false)
    setMentionQuery(null)
    setMentionAnchor(null)
    setMentionFilter("all")
    setMentionExpandedTask(null)
    setMentionTrigger("@")
  }, [])

  const stopMentionMenuKeyEvent = useCallback((event: React.KeyboardEvent | KeyboardEvent) => {
    if ("nativeEvent" in event) {
      event.nativeEvent?.stopImmediatePropagation?.()
      return
    }
    event.stopImmediatePropagation?.()
  }, [])

  const handleMentionMenuKeyDown = useCallback(
    (e: React.KeyboardEvent | KeyboardEvent) => {
      if (!isMentionPickerOpen) return
      if (e.key === "ArrowDown") {
        e.preventDefault()
        stopMentionMenuKeyEvent(e)
        if (pickerRows.length > 0) {
          setActiveMentionIndex((prev) => nextSelectableMentionIndex(pickerRows, prev, 1))
        }
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        stopMentionMenuKeyEvent(e)
        if (pickerRows.length > 0) {
          setActiveMentionIndex((prev) => nextSelectableMentionIndex(pickerRows, prev, -1))
        }
        return
      }
      if (e.key === "ArrowRight") {
        const row = pickerRows[activeMentionIndex]
        if (!mentionExpandedTask && row?.kind === "suggestion" && row.suggestion.kind === "task") {
          e.preventDefault()
          stopMentionMenuKeyEvent(e)
          expandTask(row.suggestion.task)
        }
        return
      }
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault()
        stopMentionMenuKeyEvent(e)
        if (pickerRows.length > 0) {
          const row = pickerRows[activeMentionIndex]
          if (row && mentionRowIsSelectable(row)) handlePickRow(row)
        }
        return
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        stopMentionMenuKeyEvent(e)
        const row = pickerRows[activeMentionIndex]
        if (!row) return
        if (!mentionExpandedTask && row.kind === "suggestion" && row.suggestion.kind === "task") {
          expandTask(row.suggestion.task)
          return
        }
        if (mentionRowIsSelectable(row)) handlePickRow(row)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        stopMentionMenuKeyEvent(e)
        dismissMentionPicker()
      }
    },
    [
      isMentionPickerOpen,
      pickerRows,
      activeMentionIndex,
      handlePickRow,
      dismissMentionPicker,
      expandTask,
      mentionExpandedTask,
      stopMentionMenuKeyEvent,
    ]
  )

  handleMentionMenuKeyDownRef.current = handleMentionMenuKeyDown

  useEffect(() => {
    if (!isMentionPickerOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      handleMentionMenuKeyDownRef.current(e)
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [isMentionPickerOpen])

  useEffect(() => {
    if (!isMentionPickerOpen) return
    const onMouseDown = (e: MouseEvent) => {
      const el = e.target as Node
      if (mentionListRef.current?.contains(el)) return
      if (editorRef.current?.contains(el)) return
      if (projectTriggerRef.current?.contains(el)) return
      dismissMentionPicker()
    }
    document.addEventListener("mousedown", onMouseDown, true)
    return () => document.removeEventListener("mousedown", onMouseDown, true)
  }, [isMentionPickerOpen, dismissMentionPicker])

  const onEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Backspace" && mentionExpandedTask && isMentionPickerOpen) {
      const root = editorRef.current
      if (root) {
        const textBefore = getTextBeforeSelection(root)
        const active = parseActiveMentionAtCaret(textBefore)
        if (active && active.query.length === 0) {
          e.preventDefault()
          setMentionExpandedTask(null)
          setActiveMentionIndex(0)
          return
        }
      }
    }
    if (
      isMentionPickerOpen &&
      (e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowRight" ||
        e.key === "Enter" ||
        e.key === "Tab" ||
        e.key === "Escape")
    ) {
      handleMentionMenuKeyDown(e)
      return
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (isAssistantStreaming) return
      void send()
    }
  }

  const projectPickerLayout = useMemo(() => {
    if (!mentionAnchor || !viewportSize.height || !viewportSize.width) return null
    const desiredWidth = mentionExpandedTask ? 320 : 272
    const horizontalMargin = 8
    const left = Math.max(
      horizontalMargin,
      Math.min(mentionAnchor.left, viewportSize.width - desiredWidth - horizontalMargin)
    )
    const spaceAbove = mentionAnchor.top - 12
    const spaceBelow = viewportSize.height - mentionAnchor.top - 28
    const placeAbove = spaceAbove >= 180 || spaceAbove >= spaceBelow
    const maxHeight = Math.max(120, Math.min(300, placeAbove ? spaceAbove : spaceBelow))
    return {
      left,
      top: placeAbove ? mentionAnchor.top - 8 : mentionAnchor.top + 20,
      width: desiredWidth,
      maxHeight,
      placeAbove,
    }
  }, [mentionAnchor, viewportSize, mentionExpandedTask])

  const openMentionPickerFromButton = useCallback(() => {
    const root = editorRef.current
    if (!root) return
    mentionUserDismissedRef.current = false
    root.focus()
    setMentionFilter("all")
    setMentionExpandedTask(null)
    insertPlainTextAtCaret(root, "@")
    bumpEditor()
    resizeEditor()
    refreshEditorEmpty()
    syncMentionFromEditor("programmatic")
    const rect = getCaretClientRect(root)
    if (rect) {
      setMentionAnchor({ left: Math.max(8, rect.left), top: Math.max(8, rect.top) })
    }
  }, [refreshEditorEmpty, resizeEditor, syncMentionFromEditor])

  const onEditorInput = () => {
    mentionUserDismissedRef.current = false
    bumpEditor()
    resizeEditor()
    refreshEditorEmpty()
    syncMentionFromEditor("input")
  }

  const onEditorPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const normalized = resolveNormalizedPastedTextForChatInput(e.clipboardData)
    if (!normalized) return

    e.preventDefault()
    const root = editorRef.current
    if (!root) return
    insertPlainTextWithLineBreaksAtCaret(root, normalized)
    onEditorInput()
  }

  mentionPickerKeyRef.current = {
    pickerRows,
    activeMentionIndex,
    handlePickRow,
    dismissMentionPicker,
  }

  return (
    <div className={variant === "inlineEdit" ? "" : "pt-2"}>
      {files.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${index}`}
              className="inline-flex items-center gap-2 rounded border bg-gray-50 px-2 py-1 text-xs text-gray-700"
            >
              <Paperclip className="h-3 w-3 text-gray-500" />
              <span className="max-w-[220px] truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => removePendingFile(index)}
                className="text-gray-400 hover:text-gray-700"
                aria-label={`Remove ${file.name}`}
                title={`Remove ${file.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div
        className={
          variant === "inlineEdit"
            ? "relative bg-transparent px-0 pb-0 pt-0"
            : "relative rounded border px-2 pb-1 pt-1"
        }
      >
        <div className="relative">
          <div
            ref={editorRef}
            role="textbox"
            aria-multiline="true"
            aria-placeholder="Ask anything, or use @ to reference a task, component, project or user…"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Ask anything, or use @ to reference a task, component, project or user…"
            className="ai-chat-composer-input relative z-10 min-h-[80px] max-h-[400px] w-full overflow-y-auto whitespace-pre-wrap break-words border-0 p-1 text-sm outline-none empty:before:pointer-events-none empty:before:text-gray-400 empty:before:content-[attr(data-placeholder)]"
            onInput={onEditorInput}
            onPaste={onEditorPaste}
            onKeyDown={onEditorKeyDown}
            onKeyUp={() => syncMentionFromEditor("keyup")}
            onClick={(e) => {
              const t = e.target as HTMLElement
              const isRemoveSelectionChip = Boolean(t.closest('[data-ai-selection-chip-remove="1"]'))
              if (isRemoveSelectionChip) {
                e.preventDefault()
                clearPendingSelection()
                onEditorInput()
                return
              }
              const isRemoveChipClick = Boolean(t.closest('[data-ai-tag-remove="1"]'))
              if (isRemoveChipClick) {
                e.preventDefault()
                const chip = t.closest('[data-ai-tag="1"]')
                chip?.remove()
                onEditorInput()
                return
              }
              if (shouldSyncMentionOnComposerClick({ isMentionPickerOpen, isRemoveChipClick })) {
                syncMentionFromEditor("click")
              }
            }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between px-1 pb-1">
          <div className="flex items-center gap-2">
            <button
              ref={projectTriggerRef}
              type="button"
              onClick={openMentionPickerFromButton}
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-gray-500 hover:bg-gray-100/80 hover:text-gray-700"
              aria-label="Add tags or context"
              title="Add tags or context"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Attach files"
              title="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            {variant !== "inlineEdit" ? (
              <AiChatModelPicker modelKey={modelKey} onModelKeyChange={setModelKey} disabled={isSending} />
            ) : null}
            {variant !== "inlineEdit" ? (
              <AiChatUsageIndicator usage={threadUsage} isLoading={isThreadUsageLoading} />
            ) : null}
          </div>
          {isAssistantStreaming ? (
            <button
              type="button"
              onClick={() => {
                const runId = inFlightTurnRef?.current?.runId
                if (runId) {
                  void cancelAiChatRun(runId).finally(() => {
                    streamAbortRef?.current?.abort()
                  })
                  return
                }
                streamAbortRef?.current?.abort()
              }}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-gray-300 bg-white text-gray-800 shadow-sm hover:bg-gray-50"
              aria-label="Stop generating"
              title="Stop generating"
            >
              <Square className="h-3 w-3 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void send()}
              disabled={isSending || isSendBlockedByUsage}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-white disabled:opacity-50"
              aria-label="Send"
              title={isSendBlockedByUsage ? "Daily AI token limit reached" : "Send"}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={IMAGE_ATTACHMENTS_ACCEPT}
          onChange={onFileChange}
          className="hidden"
        />
        {attachmentError ? <div className="px-1 pb-1 text-xs text-red-600">{attachmentError}</div> : null}
        {isMentionPickerOpen && projectPickerLayout && typeof document !== "undefined"
          ? createPortal(
              <div
                ref={mentionListRef}
                tabIndex={-1}
                className="fixed z-[9999] overflow-y-auto rounded border border-gray-200/90 bg-white text-xs shadow-[0_1px_3px_rgba(0,0,0,0.05)] outline-none"
                style={{
                  left: `${projectPickerLayout.left}px`,
                  top: `${projectPickerLayout.top}px`,
                  width: `${projectPickerLayout.width}px`,
                  maxHeight: `${projectPickerLayout.maxHeight}px`,
                  transform: projectPickerLayout.placeAbove ? "translateY(-100%)" : "none",
                }}
                onScroll={handleMentionListScroll}
                onKeyDown={handleMentionMenuKeyDown}
              >
                {pickerRows.length === 0 ? (
                  <div className="px-2 py-1.5 text-gray-500">No matches found</div>
                ) : (
                  <>
                    {pickerRows.map((row, index) => {
                      const qEmpty = (mentionQuery ?? "").trim().length === 0
                      const firstSuggestionIndex = pickerRows.findIndex((candidate) => candidate.kind === "suggestion")
                      const firstGroupIndex = pickerRows.findIndex((candidate) => candidate.kind === "group")
                      const showQuickHeader =
                        mentionFilter === "all" &&
                        qEmpty &&
                        directCombined.length > 0 &&
                        index === firstSuggestionIndex &&
                        row.kind === "suggestion"
                      const showBrowseDivider =
                        mentionFilter === "all" &&
                        qEmpty &&
                        directCombined.length > 0 &&
                        row.kind === "group" &&
                        index === firstGroupIndex
                      const rowKey =
                        row.kind === "group"
                          ? `group-${row.id}`
                          : row.kind === "suggestion"
                            ? `suggestion-${row.suggestion.kind}-${row.suggestion.id}-i${index}`
                            : row.kind === "current_task"
                              ? `current-task-${row.task.id}`
                              : row.kind === "back"
                              ? `back-${index}`
                              : row.kind === "loading"
                                ? `loading-${index}`
                                : row.kind === "task_header"
                                  ? `th-${row.task.id}`
                                  : row.kind === "channel_mention"
                                    ? `chm-${row.taskId}-${row.channelId}-${index}`
                                    : row.kind === "channel"
                                    ? `ch-${row.task.id}-${row.channelId}-${index}`
                                    : row.kind === "component"
                                      ? `comp-${row.task.id}-${row.channelId}-${row.componentId}-${index}`
                                        : `row-${index}`
                      const rowActive = index === activeMentionIndex
                      const rowBtnBase =
                        "flex w-full min-w-0 items-center gap-1.5 px-2 py-1 text-left hover:bg-gray-50/90 cursor-pointer"
                      const stopPickerFocus = (e: React.MouseEvent) => e.preventDefault()
                      return (
                        <React.Fragment key={rowKey}>
                          {showQuickHeader ? (
                            <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                              Quick picks
                            </div>
                          ) : null}
                          {showBrowseDivider ? (
                            <div className="border-t border-gray-100 px-2 pt-1.5 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                              Browse
                            </div>
                          ) : null}
                          {row.kind === "current_task" ? (
                            <button
                              type="button"
                              tabIndex={-1}
                              data-mention-index={index}
                              title={`Current task: ${row.task.title}`}
                              onMouseDown={stopPickerFocus}
                              onMouseEnter={() => setActiveMentionIndex(index)}
                              onClick={() => handlePickRow(row)}
                              className={`${rowBtnBase} text-gray-800 ${rowActive ? "bg-gray-50" : ""}`}
                              aria-selected={rowActive}
                            >
                              <ListTodo className="h-3.5 w-3.5 shrink-0 text-blue-500" aria-hidden />
                              <span className="shrink-0 font-medium text-gray-700">Current task</span>
                              <span className="min-w-0 flex-1 truncate text-left text-gray-500">{row.task.title}</span>
                            </button>
                          ) : row.kind === "back" ? (
                            <button
                              type="button"
                              tabIndex={-1}
                              data-mention-index={index}
                              title="Back"
                              onMouseDown={stopPickerFocus}
                              onMouseEnter={() => setActiveMentionIndex(index)}
                              onClick={() => handlePickRow(row)}
                              className={`${rowBtnBase} text-gray-600 ${rowActive ? "bg-gray-50" : ""}`}
                              aria-selected={rowActive}
                            >
                              <span className="text-gray-400" aria-hidden>
                                ‹
                              </span>
                              <span className="min-w-0 flex-1 truncate">{row.label}</span>
                            </button>
                          ) : row.kind === "loading" ? (
                            <div data-mention-index={index} className="px-2 py-1.5 pl-6 text-gray-400">
                              Loading…
                            </div>
                          ) : row.kind === "task_header" ? (
                            <div
                              data-mention-index={index}
                              className="border-b border-gray-100 px-2 py-1.5 pl-2 text-[11px] font-semibold text-gray-700"
                            >
                              {row.task.title}
                            </div>
                          ) : row.kind === "channel_mention" ? (
                            <button
                              type="button"
                              tabIndex={-1}
                              data-mention-index={index}
                              title={`Tag channel #${row.channelName}`}
                              onMouseDown={stopPickerFocus}
                              onMouseEnter={() => setActiveMentionIndex(index)}
                              onClick={() => handlePickRow(row)}
                              className={`${rowBtnBase} text-gray-800 ${rowActive ? "bg-gray-50" : ""}`}
                              aria-selected={rowActive}
                            >
                              <span className="shrink-0 font-medium text-amber-500" aria-hidden>
                                #
                              </span>
                              <span className="min-w-0 flex-1 truncate text-left">{row.channelName}</span>
                              <span className="shrink-0 truncate text-[10px] text-gray-400">{row.taskTitle}</span>
                            </button>
                          ) : row.kind === "channel" ? (
                            <button
                              type="button"
                              tabIndex={-1}
                              data-mention-index={index}
                              title={`Tag channel ${row.channelName}`}
                              onMouseDown={stopPickerFocus}
                              onMouseEnter={() => setActiveMentionIndex(index)}
                              onClick={() => handlePickRow(row)}
                              className={`${rowBtnBase} pl-4 text-gray-800 ${rowActive ? "bg-gray-50" : ""}`}
                              aria-selected={rowActive}
                            >
                              <ListTodo className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                              <span className="min-w-0 flex-1 truncate text-left">{row.channelName}</span>
                            </button>
                          ) : row.kind === "component" ? (
                            <button
                              type="button"
                              tabIndex={-1}
                              data-mention-index={index}
                              title={row.componentTitle}
                              onMouseDown={stopPickerFocus}
                              onMouseEnter={() => setActiveMentionIndex(index)}
                              onClick={() => handlePickRow(row)}
                              className={`${rowBtnBase} pl-8 text-gray-800 ${rowActive ? "bg-gray-50" : ""}`}
                              aria-selected={rowActive}
                            >
                              <span className="min-w-0 flex-1 truncate text-left">{row.componentTitle}</span>
                            </button>
                          ) : row.kind === "group" ? (
                            <button
                              type="button"
                              tabIndex={-1}
                              data-mention-index={index}
                              title={`Browse ${row.label}`}
                              onMouseDown={stopPickerFocus}
                              onMouseEnter={() => setActiveMentionIndex(index)}
                              onClick={() => handlePickRow(row)}
                              className={`${rowBtnBase} text-gray-700 ${rowActive ? "bg-gray-50" : ""}`}
                              aria-selected={rowActive}
                            >
                              {row.id === "task" ? (
                                <ListTodo className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                              ) : row.id === "user" ? (
                                <User className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                              ) : (
                                <FolderKanban className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                              )}
                              <span className="min-w-0 flex-1 truncate">{row.label}</span>
                              <span className="flex-shrink-0 text-base font-semibold text-gray-600" aria-hidden>
                                ›
                              </span>
                            </button>
                          ) : (
                            (() => {
                              const suggestion = row.suggestion
                              const userDisplay =
                                suggestion.kind === "user"
                                  ? (suggestion.user.full_name || suggestion.user.email || `User ${suggestion.user.id}`).trim()
                                  : ""
                              const userTitle =
                                suggestion.kind === "user"
                                  ? [userDisplay, suggestion.user.email && suggestion.user.full_name ? suggestion.user.email : null]
                                      .filter(Boolean)
                                      .join(" · ")
                                  : ""
                              const taskTitleFull =
                                suggestion.kind === "task"
                                  ? [suggestion.task.title, suggestion.task.projectName || null].filter(Boolean).join(" — ")
                                  : ""
                              return (
                                <div
                                  className={`flex w-full items-stretch ${rowActive ? "bg-gray-50" : ""}`}
                                  data-mention-index={index}
                                  onMouseEnter={() => setActiveMentionIndex(index)}
                                >
                                  <button
                                    type="button"
                                    tabIndex={-1}
                                    title={
                                      suggestion.kind === "project"
                                        ? suggestion.project.name
                                        : suggestion.kind === "task"
                                          ? taskTitleFull
                                          : userTitle || userDisplay
                                    }
                                    onMouseDown={stopPickerFocus}
                                    onClick={() => handlePickRow(row)}
                                    className={`${rowBtnBase} min-w-0 flex-1`}
                                    aria-selected={rowActive}
                                  >
                                    {suggestion.kind === "project" ? (
                                      <>
                                        <FolderKanban className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                                        {getImageUrl(suggestion.project.logo ?? null) ? (
                                          <img
                                            src={getImageUrl(suggestion.project.logo ?? null) || undefined}
                                            alt=""
                                            className="h-4 w-4 shrink-0 rounded-sm object-cover"
                                          />
                                        ) : (
                                          <span
                                            className="h-2 w-2 shrink-0 rounded-full"
                                            style={{ backgroundColor: suggestion.project.color || "#9ca3af" }}
                                          />
                                        )}
                                        <span className="min-w-0 flex-1 truncate text-gray-800">{suggestion.project.name}</span>
                                      </>
                                    ) : suggestion.kind === "task" ? (
                                      <>
                                        <ListTodo className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                                        <span className="min-w-0 flex-1 truncate text-gray-800">{suggestion.task.title}</span>
                                        {getImageUrl(suggestion.task.projectLogo ?? null) ? (
                                          <img
                                            src={getImageUrl(suggestion.task.projectLogo ?? null) || undefined}
                                            alt=""
                                            className="h-4 w-4 shrink-0 rounded-sm object-cover"
                                            title={suggestion.task.projectName ?? undefined}
                                          />
                                        ) : suggestion.task.projectName ? (
                                          <span
                                            className="max-w-[2.75rem] shrink-0 truncate rounded bg-gray-100 px-1 text-center text-[9px] font-semibold uppercase tracking-tight text-gray-600"
                                            style={
                                              suggestion.task.projectColor
                                                ? { backgroundColor: `${suggestion.task.projectColor}22`, color: "#374151" }
                                                : undefined
                                            }
                                            title={suggestion.task.projectName}
                                          >
                                            {projectAbbrev(suggestion.task.projectName)}
                                          </span>
                                        ) : null}
                                      </>
                                    ) : (
                                      <>
                                        <User className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                                        {getImageUrl(suggestion.user.photo ?? null) ? (
                                          <img
                                            src={getImageUrl(suggestion.user.photo ?? null) || undefined}
                                            alt=""
                                            className="h-4 w-4 shrink-0 rounded-full object-cover"
                                          />
                                        ) : (
                                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[9px] font-medium text-gray-600">
                                            {(suggestion.user.full_name || suggestion.user.email || "?").charAt(0).toUpperCase()}
                                          </span>
                                        )}
                                        <span className="min-w-0 flex-1 truncate text-gray-800">{userDisplay}</span>
                                      </>
                                    )}
                                  </button>
                                  {suggestion.kind === "task" ? (
                                    <button
                                      type="button"
                                      tabIndex={-1}
                                      title="Browse channels for this task"
                                      onMouseDown={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        expandTask(suggestion.task)
                                      }}
                                      className={PICKER_DRILL_CHEVRON_BTN}
                                      aria-label="Browse task channels"
                                    >
                                      <span aria-hidden className="translate-x-px">
                                        ›
                                      </span>
                                    </button>
                                  ) : null}
                                </div>
                              )
                            })()
                          )}
                        </React.Fragment>
                      )
                    })}
                    {taskMentionLoadingMore ? (
                      <div className="border-t border-gray-50 px-2 py-1 text-center text-[10px] text-gray-400">Loading more…</div>
                    ) : null}
                  </>
                )}
              </div>,
              document.body
            )
          : null}
      </div>
    </div>
  )
}
