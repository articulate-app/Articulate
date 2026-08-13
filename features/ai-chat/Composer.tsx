"use client"

import React, { useCallback, useMemo, useRef, useState, useEffect, useReducer, type MutableRefObject } from "react"
import { createPortal } from "react-dom"
import { getSupabaseBrowser } from "../../lib/supabase-browser"
import type { AiAttachmentMeta } from "./types"
import { ArrowUp, BookOpen, ChevronDown, ChevronUp, FileText, FolderKanban, LayoutTemplate, ListTodo, Paperclip, Plus, Square, User, X } from "lucide-react"
import { AttachmentFileChip } from "./AttachmentFileChip"
import { ArtifactContextChip } from "./artifact-context-chip"
import {
  selectQueuedMessagesForThread,
  useAiChatMessageQueueStore,
} from "./ai-chat-message-queue-store"
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
  AiChatExecutionTraceEvent,
  AiChatV2RunEvent,
} from "../../app/lib/ai/chat"
import type { AiRunTerminalState } from "../../app/lib/ai/ai-chat-v2-types"
import type { AiChatUsageSnapshot } from "../../app/lib/ai/ai-chat-v2-types"
import { buildAiChatV2RequestFields, resolveFactualLegacySendContext } from "./build-ai-run-targets"
import { cancelAiChatRun } from "./ai-chat-run-api"
import { isPersistedAiThreadId } from "./thread-id"
import { resolveComponentOutputUpdatedAtFromQueryCache } from "./resolve-component-output-from-cache"
import { useQueryClient } from "@tanstack/react-query"
import type { InFlightAiTurnMeta } from "./types"
import { buildAiChatTaggedRefs } from "./build-ai-chat-tagged-refs"
import { createSourceFromFile } from "../../app/lib/services/sources"
import type { TaggedSourceRef } from "../../app/lib/sources/source-types"
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
import {
  buildSelectionPillsFromContexts,
  buildUserMessageContentJson,
  type AiUserMessageContentJson,
} from "./ai-chat-user-message-content"
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
import {
  chipLabelForArtifactSelection,
  useArtifactSelectionStore,
} from "../artifacts/artifact-selection"
import { sanitizeStorageFileName } from "../../utils/storage"
import { parseProjectBrandKit } from "../../app/lib/project-brand-kit"

type ProjectMention = { id: number; name: string; color?: string | null; logo?: string | null }
type TaskMention = {
  id: number
  title: string
  projectName?: string | null
  projectLogo?: string | null
  projectColor?: string | null
}
type UserMention = { id: number; full_name: string | null; email: string | null; photo: string | null }
type ArtifactMention = {
  id: string
  title: string | null
  task_id: number | null
  project_id: number | null
  current_version: number | null
}
type SourceMention = {
  id: string
  title: string | null
  task_id: number | null
  project_id: number | null
  status: string | null
}
type MentionEntityFilter = "all" | "task" | "project" | "user" | "artifact" | "source" | "template"
type MentionGroupId = "task" | "project" | "user" | "artifact" | "source" | "template"
export type MentionSuggestion =
  | { kind: "project"; id: number; label: string; project: ProjectMention }
  | { kind: "task"; id: number; label: string; task: TaskMention }
  | { kind: "user"; id: number; label: string; user: UserMention }
  | { kind: "artifact"; id: string; label: string; artifact: ArtifactMention }
  | { kind: "source"; id: string; label: string; source: SourceMention }
  | {
      kind: "brand_template"
      id: string
      label: string
      template: {
        id: string
        title: string | null
        project_id: number
        project_name?: string | null
        asset_count: number
        notes?: string | null
      }
    }

/** “Open task detail” — high contrast so it stays visible on light UI. */
const PICKER_DRILL_CHEVRON_BTN =
  "flex h-full min-h-[2.25rem] w-9 min-w-9 shrink-0 items-center justify-center border-l border-gray-300 bg-gray-100 text-lg font-semibold leading-none text-gray-800 hover:bg-gray-200 hover:text-gray-950 active:bg-gray-300/90"

const MENTION_RECENT_KEY = "ai-composer-mention-recent-v1"
const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"])
const SUPPORTED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"])
const SOURCE_FILE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "pdf",
  "docx",
  "doc",
  "txt",
  "md",
  "markdown",
  "csv",
  "json",
  "html",
  "htm",
  "xlsx",
  "xls",
])
const ATTACHMENTS_ACCEPT =
  ".png,.jpg,.jpeg,.webp,.gif,.pdf,.docx,.doc,.txt,.md,.csv,.json,.html,.htm,.xlsx,.xls,image/png,image/jpeg,image/webp,image/gif,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"

function isSupportedImageAttachment(file: File): boolean {
  const mime = (file.type || "").toLowerCase()
  if (SUPPORTED_IMAGE_MIME_TYPES.has(mime)) return true
  const lowerName = file.name.toLowerCase()
  const ext = lowerName.includes(".") ? lowerName.slice(lowerName.lastIndexOf(".") + 1) : ""
  return SUPPORTED_IMAGE_EXTENSIONS.has(ext)
}

function isSupportedComposerAttachment(file: File): boolean {
  if (isSupportedImageAttachment(file)) return true
  const mime = (file.type || "").toLowerCase()
  if (
    mime === "application/pdf" ||
    mime === "text/plain" ||
    mime === "text/markdown" ||
    mime === "text/csv" ||
    mime === "application/json" ||
    mime === "text/html" ||
    mime.includes("wordprocessingml") ||
    mime.includes("msword") ||
    mime.includes("spreadsheetml") ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.ms-excel.sheet.macroenabled.12"
  ) {
    return true
  }
  const lowerName = file.name.toLowerCase()
  const ext = lowerName.includes(".") ? lowerName.slice(lowerName.lastIndexOf(".") + 1) : ""
  return SOURCE_FILE_EXTENSIONS.has(ext)
}

type RecentStoredMention = {
  kind: "project" | "task" | "user" | "artifact" | "source" | "brand_template"
  id: number | string
  label: string
  projectName?: string | null
  color?: string | null
  logo?: string | null
  email?: string | null
  photo?: string | null
  taskId?: number | null
  projectId?: number | null
  artifactVersionNumber?: number | null
  assetCount?: number | null
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
  if (s.kind === "artifact") {
    return {
      kind: "artifact",
      id: s.artifact.id,
      label: s.label,
      taskId: s.artifact.task_id,
      projectId: s.artifact.project_id,
      artifactVersionNumber: s.artifact.current_version,
    }
  }
  if (s.kind === "source") {
    return {
      kind: "source",
      id: s.source.id,
      label: s.label,
      taskId: s.source.task_id,
      projectId: s.source.project_id,
    }
  }
  if (s.kind === "brand_template") {
    return {
      kind: "brand_template",
      id: s.template.id,
      label: s.label,
      projectId: s.template.project_id,
      projectName: s.template.project_name ?? null,
      assetCount: s.template.asset_count,
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
  if (!r.label) return null
  if (r.kind === "artifact") {
    const id = String(r.id).trim()
    if (!id) return null
    return {
      kind: "artifact",
      id,
      label: r.label,
      artifact: {
        id,
        title: r.label,
        task_id: r.taskId ?? null,
        project_id: r.projectId ?? null,
        current_version: r.artifactVersionNumber ?? null,
      },
    }
  }
  if (r.kind === "source") {
    const id = String(r.id).trim()
    if (!id) return null
    return {
      kind: "source",
      id,
      label: r.label,
      source: {
        id,
        title: r.label,
        task_id: r.taskId ?? null,
        project_id: r.projectId ?? null,
        status: null,
      },
    }
  }
  if (r.kind === "brand_template") {
    const id = String(r.id).trim()
    const projectId = Number(r.projectId)
    if (!id || !Number.isFinite(projectId) || projectId <= 0) return null
    return {
      kind: "brand_template",
      id,
      label: r.label,
      template: {
        id,
        title: r.label,
        project_id: projectId,
        project_name: r.projectName ?? null,
        asset_count: r.assetCount ?? 0,
      },
    }
  }
  const numericId = Number(r.id)
  if (!Number.isFinite(numericId)) return null
  if (r.kind === "project") {
    return {
      kind: "project",
      id: numericId,
      label: r.label,
      project: { id: numericId, name: r.label, color: r.color ?? null, logo: r.logo ?? null },
    }
  }
  if (r.kind === "task") {
    return {
      kind: "task",
      id: numericId,
      label: r.label,
      task: { id: numericId, title: r.label, projectName: r.projectName ?? null },
    }
  }
  return {
    kind: "user",
    id: numericId,
    label: r.label,
    user: { id: numericId, full_name: r.label, email: r.email ?? null, photo: r.photo ?? null },
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
  onAssistantStreamReset?: (tempId: string) => void
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
  /** Stream `__AI_EXECUTION_TRACE__` progressive timeline events. */
  onExecutionTraceEvent?: (tempId: string, event: AiChatExecutionTraceEvent) => void
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
  onAssistantStreamReset,
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
  onExecutionTraceEvent,
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
  mode: _legacyBuildMode,
  componentId: _legacyBuildComponentId,
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
  const pendingArtifactSelection = useArtifactSelectionStore((s) => s.pending)
  const clearPendingArtifactSelection = useArtifactSelectionStore((s) => s.clearPendingSelection)
  const appliedSelectionTokenRef = useRef<number | null>(null)
  const appliedArtifactSelectionTokenRef = useRef<number | null>(null)
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
  const queuedMessages = useAiChatMessageQueueStore(
    useCallback((state) => selectQueuedMessagesForThread(state, threadId), [threadId]),
  )
  const enqueueQueuedMessage = useAiChatMessageQueueStore((state) => state.enqueue)
  const prependQueuedMessage = useAiChatMessageQueueStore((state) => state.prepend)
  const removeQueuedMessage = useAiChatMessageQueueStore((state) => state.remove)
  const moveQueuedMessage = useAiChatMessageQueueStore((state) => state.move)
  const peekNextQueuedMessage = useAiChatMessageQueueStore((state) => state.peekNext)
  const shiftNextQueuedMessage = useAiChatMessageQueueStore((state) => state.shiftNext)
  const drainingQueueRef = useRef(false)
  /** After a failed drain, skip auto-retry of the same item until the queue changes. */
  const skipAutoDrainItemIdRef = useRef<string | null>(null)
  const [queueRetryNonce, setQueueRetryNonce] = useState(0)
  const isComposerBusy = isSending || isAssistantStreaming
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
  /** Level 2: task expanded — channels only (no TCC component mentions). */
  const [mentionExpandedTask, setMentionExpandedTask] = useState<TaskMention | null>(null)
  const [mentionChannelsByTaskId, setMentionChannelsByTaskId] = useState<Record<number, MentionChannel[]>>({})
  const [mentionChannelsLoadingTaskId, setMentionChannelsLoadingTaskId] = useState<number | null>(null)
  const mentionChannelsByTaskIdRef = useRef(mentionChannelsByTaskId)
  mentionChannelsByTaskIdRef.current = mentionChannelsByTaskId
  const channelsInFlightRef = useRef<number | null>(null)
  /** Avoid `task_group_tasks_filtered` effect re-running when only local snapshot count changes. */
  const localTaskOptionsLenRef = useRef(0)
  localTaskOptionsLenRef.current = localTaskOptions.length
  const [userOptions, setUserOptions] = useState<UserMention[]>([])
  const [artifactOptions, setArtifactOptions] = useState<ArtifactMention[]>([])
  const [sourceOptions, setSourceOptions] = useState<SourceMention[]>([])
  const [brandTemplateOptions, setBrandTemplateOptions] = useState<
    Array<{
      id: string
      title: string | null
      project_id: number
      project_name?: string | null
      asset_count: number
      notes?: string | null
    }>
  >([])
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 })
  const refreshEditorEmpty = useCallback(() => {}, [])
  const [, bumpEditor] = useReducer((n: number) => n + 1, 0)
  const [recentEpoch, bumpRecentEpoch] = useReducer((n: number) => n + 1, 0)

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
    if (pendingTextSelection) {
      const text = pendingTextSelection.context.selected_text.trim()
      if (!text) return null
      return { text, tooltip: chipLabelForSelection(pendingTextSelection.context) }
    }
    // Artifact context uses AttachmentFileChip-style card above the editor (not an inline pill).
    return null
  }, [pendingTextSelection])

  const pendingArtifactChip = useMemo(() => {
    if (!pendingArtifactSelection) return null
    const context = pendingArtifactSelection.context
    const title = context.title?.trim() || "Artifact"
    const full = chipLabelForArtifactSelection(context)
    const subtitle =
      full === title
        ? "Artifact"
        : full.startsWith(`${title} · `)
          ? full.slice(title.length + 3)
          : full
    return { title, subtitle }
  }, [pendingArtifactSelection])

  // Keep an inline chip (styled like an @-mention) at the very top of the composer input,
  // mirroring the store. The passage itself travels as selected_text_context /
  // selected_artifact_context on send.
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
    if (variant === "inlineEdit") return
    const token = pendingArtifactSelection?.token ?? null
    if (token == null || appliedArtifactSelectionTokenRef.current === token) return
    appliedArtifactSelectionTokenRef.current = token
    const el = editorRef.current
    if (!el) return
    focusEnd(el)
    resizeEditor()
  }, [pendingArtifactSelection, variant, resizeEditor])

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
    const accepted = droppedFiles.filter((file) => isSupportedComposerAttachment(file))
    const rejected = droppedFiles.filter((file) => !isSupportedComposerAttachment(file))
    if (accepted.length > 0) {
      setFiles((prev) => [...prev, ...accepted])
    }
    if (rejected.length > 0) {
      setAttachmentError(
        "Unsupported attachment type. Allowed: images, PDF, DOCX, XLSX, TXT, MD, CSV, JSON, HTML.",
      )
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
    const accepted = next.filter((file) => isSupportedComposerAttachment(file))
    const rejected = next.filter((file) => !isSupportedComposerAttachment(file))
    if (accepted.length > 0) {
      setFiles((prev) => [...prev, ...accepted])
    }
    if (rejected.length > 0) {
      setAttachmentError(
        "Unsupported attachment type. Allowed: images, PDF, DOCX, XLSX, TXT, MD, CSV, JSON, HTML.",
      )
    } else {
      setAttachmentError(null)
    }
    e.target.value = ""
  }

  const removePendingFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  /**
   * Chat attachments are sources: upload + attachments row + pending source import.
   * Returns attachment metas (for multimodal / message display) and source refs (for run targets).
   */
  const uploadAttachmentsAsSources = useCallback(
    async (
      filesToUpload: File[],
    ): Promise<{ attachments: AiAttachmentMeta[]; sourceRefs: TaggedSourceRef[] }> => {
      const attachments: AiAttachmentMeta[] = []
      const sourceRefs: TaggedSourceRef[] = []
      for (const file of filesToUpload) {
        const result = await createSourceFromFile({
          file,
          title: file.name,
          taskId: taskId ?? null,
          aiThreadId: threadId || null,
        })
        const attachment = result.attachment
        if (attachment) {
          attachments.push({
            id: attachment.id,
            file_name: attachment.file_name,
            file_path: attachment.file_path,
            mime_type: attachment.mime_type,
            size: attachment.size,
          })
        } else if (result.source.attachment_id) {
          // Fallback if older createSourceFromFile shape is returned without attachment meta.
          const safeFileName = sanitizeStorageFileName(file.name)
          attachments.push({
            id: result.source.attachment_id,
            file_name: file.name,
            file_path: `sources/${safeFileName}`,
            mime_type: file.type || "application/octet-stream",
            size: file.size,
          })
        }
        sourceRefs.push({
          source_id: result.source.id,
          title: result.source.title,
          task_id: result.source.task_id,
          project_id: result.source.project_id,
        })
      }
      return { attachments, sourceRefs }
    },
    [taskId, threadId],
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
    const previousThreadId = prevComposerThreadIdRef.current
    prevComposerThreadIdRef.current = threadId
    // Keep typed draft when an optimistic temp thread becomes the persisted UUID.
    if (
      typeof previousThreadId === "string"
      && previousThreadId.startsWith("temp-")
      && isPersistedAiThreadId(threadId)
    ) {
      return
    }
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
    }): Promise<boolean> => {
      const { messageText, messageFiles, messageTags, messageSegments, clearComposerInput } = args
      const trimmed = messageText.trim()
      if (!trimmed && messageFiles.length === 0) return false
      if (isSending) return false
      if (isSendBlockedByUsage) return false
      setAttachmentError(null)

      const selectedTextForSend = pendingTextSelection?.context ?? null
      const selectedArtifactForSend = pendingArtifactSelection?.context ?? null
      const selectedArtifactContextTypeForSend =
        pendingArtifactSelection?.selectedContextType ?? null

      const {
        tagged_task_ids: taggedTaskIds,
        tagged_project_ids: taggedProjectIds,
        tagged_user_ids: taggedUserIds,
        tagged_channel_ids: taggedChannelIds,
        tagged_task_channel_refs: taggedTaskChannelRefs,
        tagged_task_component_refs: taggedTaskComponentRefs,
        tagged_artifact_ids: taggedArtifactIds,
        tagged_artifact_refs: taggedArtifactRefs,
        tagged_source_ids: taggedSourceIdsFromTags,
        tagged_source_refs: taggedSourceRefsFromTags,
        tagged_brand_template_ids: taggedBrandTemplateIds,
        tagged_brand_template_refs: taggedBrandTemplateRefs,
      } = buildAiChatTaggedRefs(messageTags)
      const optimisticUserTempId = `temp-${Date.now()}`
      const selectionPills = buildSelectionPillsFromContexts({
        artifactContext: selectedArtifactForSend,
        artifactTooltip: selectedArtifactForSend
          ? chipLabelForArtifactSelection(selectedArtifactForSend)
          : null,
        textContext: selectedTextForSend,
        textTooltip: selectedTextForSend
          ? chipLabelForSelection(selectedTextForSend)
          : null,
      })
      const initialUserContentJson = buildUserMessageContentJson({
        tags: messageTags,
        segments: messageSegments,
        selectionPills,
      })
      // Show the user bubble immediately — before upload / network — so clearing the
      // composer never leaves a visible gap in the chat history.
      onOptimistic?.({
        id: optimisticUserTempId,
        content: trimmed,
        attachments: messageFiles.map((file, index) => ({
          id: `local-${optimisticUserTempId}-${index}`,
          file_name: file.name,
          file_path: "",
          mime_type: file.type || "application/octet-stream",
          size: file.size,
        })),
        content_json: initialUserContentJson,
      })

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

      // The passage is captured in `selectedTextForSend` / artifact context; drop the chip
      // immediately on send so it never lingers in the composer (regardless of streaming outcome).
      if (selectedTextForSend) {
        clearPendingSelection()
      }
      if (selectedArtifactForSend) {
        clearPendingArtifactSelection()
      }

      const outboundContext = resolveAiChatOutboundContext({
        messageTags,
        explicitBuild: null,
      })

      console.log(
        "[ai-chat] component output selection",
        resolveComponentOutputSelectionDiagnostics(activeFieldContext, {}, {
          taggedComponentRefs: taggedTaskComponentRefs,
        }),
        { outboundContext, ambientContext },
      )

      const effectiveMode = outboundContext.mode
      const effectiveComponentId = outboundContext.componentId
      const shouldStreamResponse =
        !autoRun && (!effectiveMode || effectiveMode === "build_component" || effectiveMode === "assistant_only")

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
        const { attachments, sourceRefs: uploadedSourceRefs } =
          await uploadAttachmentsAsSources(messageFiles)
        const sourceIdSet = new Set(taggedSourceIdsFromTags)
        const taggedSourceRefs = [...taggedSourceRefsFromTags]
        for (const ref of uploadedSourceRefs) {
          if (sourceIdSet.has(ref.source_id)) continue
          sourceIdSet.add(ref.source_id)
          taggedSourceRefs.push(ref)
        }
        const taggedSourceIds = Array.from(sourceIdSet)
        // Ensure uploaded sources are also represented as message tags for v2 run targets.
        const messageTagsWithUploads: AiContextTag[] = [
          ...messageTags,
          ...uploadedSourceRefs
            .filter((ref) => !taggedSourceIdsFromTags.includes(ref.source_id))
            .map((ref) => ({
              type: "source" as const,
              id: ref.source_id,
              label: ref.title?.trim() || "Source",
              source: "mention" as const,
              sourceId: ref.source_id,
              sourceTitle: ref.title ?? null,
              taskId: ref.task_id ?? undefined,
              projectId: ref.project_id ?? undefined,
            })),
        ]
        const userContentJson = buildUserMessageContentJson({
          tags: messageTagsWithUploads,
          segments: messageSegments,
          selectionPills,
        })
        // Refresh the same optimistic row with uploaded attachment metadata.
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
          messageTags: messageTagsWithUploads,
          attachments,
          activeFieldContext,
          selectedTextContext: selectedTextForSend,
          explicitBuild: null,
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
          taggedArtifactIds,
          taggedArtifactRefs,
          taggedSourceIds,
          taggedSourceRefs,
          taggedBrandTemplateIds,
          taggedBrandTemplateRefs,
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
          selectedArtifactContext: selectedArtifactForSend,
          selectedArtifactContextType: selectedArtifactContextTypeForSend,
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
          onAssistantStreamReset,
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
          onExecutionTraceEvent,
          onAiChatV2RunEvent,
          onRunId,
          onRunTerminalState,
          onUsageUpdate,
        })
        if (inFlightTurnRef?.current?.terminalState?.kind === "failed") {
          const code = inFlightTurnRef.current.terminalState.code
          setAttachmentError(
            code === "thread_not_found" || code === "thread_access_denied"
              ? "Could not reach this chat thread. The message stayed in the queue — try again."
              : "Failed to send message. Please try again.",
          )
          return false
        }
        onClarificationFollowUpSent?.()
        if (userContentJson) {
          await persistUserMessageMentionMetadata({
            threadId,
            content: trimmed,
            contentJson: userContentJson,
          })
        }
        return true
      } catch (e) {
        console.error("send failed", e)
        setAttachmentError("Failed to send message or upload attachments. Please try again.")
        return false
      } finally {
        if (streamAbortRef) streamAbortRef.current = null
        setIsSending(false)
      }
    },
    [
      isSending,
      supabase,
      threadId,
      uploadAttachmentsAsSources,
      onOptimistic,
      onAssistantStreamStart,
      onAssistantStreamChunk,
      onAssistantStreamReset,
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
      onExecutionTraceEvent,
      activeChannelId,
      autoRun,
      activeFieldContext,
      ambientContext,
      modelKey,
      pendingTextSelection,
      clearPendingSelection,
      pendingArtifactSelection,
      clearPendingArtifactSelection,
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

  const clearComposerAfterQueue = useCallback(() => {
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
  }, [refreshEditorEmpty, resizeEditor])

  const send = useCallback(async () => {
    const root = editorRef.current
    if (!root) return
    const { messageText, tags, segments } = serializeComposerEditor(root)
    const trimmed = messageText.trim()
    if (!trimmed && files.length === 0) return

    if (onSubmitOverride) {
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

    // While a turn is in flight, queue the next message instead of dropping it.
    if (isComposerBusy) {
      if (isSendBlockedByUsage) return
      skipAutoDrainItemIdRef.current = null
      enqueueQueuedMessage({
        threadId,
        messageText,
        messageTags: tags,
        messageSegments: segments,
        messageFiles: files.length > 0 ? [...files] : undefined,
      })
      clearComposerAfterQueue()
      return
    }

    await runSend({
      messageText,
      messageFiles: [...files],
      messageTags: tags,
      messageSegments: segments,
      clearComposerInput: true,
    })
  }, [
    runSend,
    files,
    onSubmitOverride,
    isSending,
    isComposerBusy,
    isSendBlockedByUsage,
    enqueueQueuedMessage,
    threadId,
    clearComposerAfterQueue,
  ])

  // Drain persistent queue when the current turn finishes.
  useEffect(() => {
    if (variant === "inlineEdit") return
    if (onSubmitOverride) return
    if (isComposerBusy || drainingQueueRef.current) return
    if (isSendBlockedByUsage) return
    if (queuedMessages.length === 0) return

    const peeked = peekNextQueuedMessage(threadId)
    if (!peeked) return
    if (skipAutoDrainItemIdRef.current === peeked.id) return

    const next = shiftNextQueuedMessage(threadId)
    if (!next) return

    drainingQueueRef.current = true
    void runSend({
      messageText: next.messageText,
      messageFiles: next.messageFiles ?? [],
      messageTags: next.messageTags,
      messageSegments: next.messageSegments,
      clearComposerInput: false,
    })
      .then((ok) => {
        // Keep failed drains in the queue so they are not silently dropped.
        if (!ok) {
          prependQueuedMessage(next)
          skipAutoDrainItemIdRef.current = next.id
          return
        }
        skipAutoDrainItemIdRef.current = null
      })
      .finally(() => {
        drainingQueueRef.current = false
      })
  }, [
    variant,
    onSubmitOverride,
    isComposerBusy,
    isSendBlockedByUsage,
    queuedMessages.length,
    peekNextQueuedMessage,
    shiftNextQueuedMessage,
    prependQueuedMessage,
    threadId,
    runSend,
    queueRetryNonce,
  ])

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
      if (mentionFilter === "project" || mentionFilter === "user" || mentionFilter === "artifact" || mentionFilter === "source" || mentionFilter === "template") return
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
    if (
      mentionFilter === "project" ||
      mentionFilter === "user" ||
      mentionFilter === "artifact" ||
      mentionFilter === "source" ||
      mentionFilter === "template"
    ) {
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

  useEffect(() => {
    if (mentionQuery == null) return
    const shouldLoad =
      mentionFilter === "artifact" || (mentionFilter === "all" && mentionQuery.trim().length >= 2)
    if (!shouldLoad) {
      setArtifactOptions([])
      return
    }
    let cancelled = false
    const q = mentionQuery.trim()
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        let request = supabase
          .from("artifacts")
          .select("id,title,task_id,project_id,current_version")
          .order("updated_at", { ascending: false })
          .limit(20)
        if (q.length > 0) {
          request = request.ilike("title", `%${q}%`)
        }
        const { data, error } = await request
        if (cancelled) return
        if (error) {
          console.error("Failed to load artifact mentions:", error)
          setArtifactOptions([])
          return
        }
        setArtifactOptions(
          ((data || []) as Array<Record<string, unknown>>).map((row) => ({
            id: String(row.id ?? ""),
            title: typeof row.title === "string" ? row.title : null,
            task_id: Number.isFinite(Number(row.task_id)) && Number(row.task_id) > 0
              ? Number(row.task_id)
              : null,
            project_id: Number.isFinite(Number(row.project_id)) && Number(row.project_id) > 0
              ? Number(row.project_id)
              : null,
            current_version: Number.isFinite(Number(row.current_version))
              ? Number(row.current_version)
              : null,
          })).filter((row) => row.id),
        )
      })()
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [mentionFilter, mentionQuery, supabase])

  useEffect(() => {
    if (mentionQuery == null) return
    const shouldLoad =
      mentionFilter === "source" || (mentionFilter === "all" && mentionQuery.trim().length >= 2)
    if (!shouldLoad) {
      setSourceOptions([])
      return
    }
    let cancelled = false
    const q = mentionQuery.trim().toLowerCase()
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        let request = supabase
          .from("sources")
          .select("id,title,task_id,project_id,status")
          .order("updated_at", { ascending: false })
          .limit(20)
        if (q.length > 0) {
          request = request.ilike("title", `%${q}%`)
        }
        const { data, error } = await request
        if (cancelled) return
        if (error) {
          console.error("Failed to load source mentions:", error)
          setSourceOptions([])
          return
        }
        setSourceOptions(
          ((data || []) as Array<Record<string, unknown>>)
            .map((row) => ({
              id: String(row.id ?? ""),
              title: typeof row.title === "string" ? row.title : null,
              task_id: Number.isFinite(Number(row.task_id)) && Number(row.task_id) > 0
                ? Number(row.task_id)
                : null,
              project_id: Number.isFinite(Number(row.project_id)) && Number(row.project_id) > 0
                ? Number(row.project_id)
                : null,
              status: typeof row.status === "string" ? row.status : null,
            }))
            .filter((row) => row.id),
        )
      })()
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [mentionFilter, mentionQuery, supabase])

  useEffect(() => {
    if (mentionQuery == null) return
    const shouldLoad =
      mentionFilter === "template" || (mentionFilter === "all" && mentionQuery.trim().length >= 1)
    if (!shouldLoad) {
      setBrandTemplateOptions([])
      return
    }
    let cancelled = false
    const q = mentionQuery.trim().toLowerCase()
    const projectIds = Array.from(
      new Set(
        [
          threadScope?.project_id ?? null,
          ...(projectOptions.map((p) => p.id) ?? []),
        ].filter((id): id is number => Number.isFinite(id) && Number(id) > 0),
      ),
    )
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        let request = supabase
          .from("projects")
          .select("id,name,brand_kit")
          .order("updated_at", { ascending: false })
          .limit(projectIds.length > 0 ? Math.min(projectIds.length, 12) : 20)
        if (projectIds.length > 0) {
          request = request.in("id", projectIds)
        }
        const { data, error } = await request
        if (cancelled) return
        if (error) {
          console.error("Failed to load brand template mentions:", error)
          setBrandTemplateOptions([])
          return
        }
        const rows: Array<{
          id: string
          title: string | null
          project_id: number
          project_name?: string | null
          asset_count: number
          notes?: string | null
        }> = []
        for (const project of (data ?? []) as Array<Record<string, unknown>>) {
          const projectId = Number(project.id)
          if (!Number.isFinite(projectId) || projectId <= 0) continue
          const projectName = typeof project.name === "string" ? project.name : null
          const kit = parseProjectBrandKit(project.brand_kit)
          for (const template of kit.design_templates) {
            const title = template.title?.trim() || "Untitled template"
            if (q && !title.toLowerCase().includes(q) && !(projectName ?? "").toLowerCase().includes(q)) {
              continue
            }
            rows.push({
              id: template.id,
              title,
              project_id: projectId,
              project_name: projectName,
              asset_count: template.assets.length,
              notes: template.notes,
            })
          }
        }
        setBrandTemplateOptions(rows.slice(0, 30))
      })()
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [mentionFilter, mentionQuery, projectOptions, supabase, threadScope?.project_id])

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
    for (const artifact of artifactOptions) {
      const key = `artifact:${artifact.id}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push({
        kind: "artifact",
        id: artifact.id,
        label: artifact.title?.trim() || `Artifact ${artifact.id.slice(0, 8)}`,
        artifact,
      })
    }
    for (const source of sourceOptions) {
      const key = `source:${source.id}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push({
        kind: "source",
        id: source.id,
        label: source.title?.trim() || `Source ${source.id.slice(0, 8)}`,
        source,
      })
    }
    for (const template of brandTemplateOptions) {
      const key = `brand_template:${template.id}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push({
        kind: "brand_template",
        id: template.id,
        label: template.title?.trim() || "Untitled template",
        template,
      })
    }
    return results
  }, [
    artifactOptions,
    brandTemplateOptions,
    localTaskOptions,
    projectOptions,
    remoteTaskOptions,
    sourceOptions,
    userOptions,
  ])

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
    if (mentionFilter === "artifact") {
      return mentionSuggestionsFull.filter((s) => s.kind === "artifact")
    }
    if (mentionFilter === "source") {
      return mentionSuggestionsFull.filter((s) => s.kind === "source")
    }
    if (mentionFilter === "template") {
      return mentionSuggestionsFull.filter((s) => s.kind === "brand_template")
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
        // Channels only — no task_channel_components.
        const { data, error } = await supabase
          .from("task_channels")
          .select("channel_id, channels!inner(id, name)")
          .eq("task_id", tid)
          .order("channel_id")
        if (error) {
          console.error("task_channels mention load failed", error)
          setMentionChannelsByTaskId((prev) => ({ ...prev, [tid]: [] }))
          return
        }
        const channels: MentionChannel[] = []
        for (const row of Array.isArray(data) ? data : []) {
          const channelId = Number((row as { channel_id?: unknown }).channel_id)
          if (!Number.isFinite(channelId)) continue
          const nestedRaw = (row as { channels?: unknown }).channels
          const nested = Array.isArray(nestedRaw) ? nestedRaw[0] : nestedRaw
          const nestedObj =
            nested && typeof nested === "object"
              ? (nested as { name?: unknown })
              : null
          const name =
            (typeof nestedObj?.name === "string" && nestedObj.name.trim())
            || `Channel ${channelId}`
          channels.push({ channel_id: channelId, name, slug: null })
        }
        channels.sort((a, b) => a.name.localeCompare(b.name))
        setMentionChannelsByTaskId((prev) => ({ ...prev, [tid]: channels }))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error("task_channels mention load exception", msg)
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
      return buildLevel2MentionRows({
        task: mentionExpandedTask,
        channels,
        channelsLoading,
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
      } else if (suggestion.kind === "artifact") {
        const artifact = suggestion.artifact
        tag = {
          type: "artifact",
          id: artifact.id,
          label: suggestion.label,
          source: "mention",
          artifactId: artifact.id,
          artifactTitle: artifact.title,
          artifactVersionNumber: artifact.current_version,
          taskId: artifact.task_id ?? undefined,
          projectId: artifact.project_id,
        }
      } else if (suggestion.kind === "source") {
        const source = suggestion.source
        tag = {
          type: "source",
          id: source.id,
          label: suggestion.label,
          source: "mention",
          sourceId: source.id,
          sourceTitle: source.title,
          taskId: source.task_id ?? undefined,
          projectId: source.project_id,
        }
      } else if (suggestion.kind === "brand_template") {
        const template = suggestion.template
        tag = {
          type: "brand_template",
          id: template.id,
          label: suggestion.label,
          source: "mention",
          brandTemplateId: template.id,
          brandTemplateTitle: template.title,
          projectId: template.project_id,
          projectName: template.project_name,
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
      {variant !== "inlineEdit" && queuedMessages.length > 0 ? (
        <div className="mb-2 space-y-1.5 rounded-md border border-gray-200 bg-white p-2 shadow-sm">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Queued ({queuedMessages.length})
            </span>
            <button
              type="button"
              onClick={() => {
                skipAutoDrainItemIdRef.current = null
                setQueueRetryNonce((n) => n + 1)
              }}
              disabled={isComposerBusy}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-800 disabled:opacity-40"
              title="Send the next queued message now"
            >
              Send next
            </button>
          </div>
          <ul className="max-h-36 space-y-1 overflow-y-auto">
            {queuedMessages.map((item, index) => (
              <li
                key={item.id}
                className="flex items-start gap-2 rounded border border-gray-100 bg-gray-50 px-2 py-1.5 text-xs text-gray-700"
              >
                <span className="mt-0.5 shrink-0 tabular-nums text-gray-400">{index + 1}</span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                  {item.messageText.trim() || "(attachment)"}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      skipAutoDrainItemIdRef.current = null
                      moveQueuedMessage(threadId, item.id, -1)
                    }}
                    disabled={index === 0}
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 disabled:pointer-events-none disabled:opacity-30"
                    aria-label="Move queued message up"
                    title="Move up"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      skipAutoDrainItemIdRef.current = null
                      moveQueuedMessage(threadId, item.id, 1)
                    }}
                    disabled={index >= queuedMessages.length - 1}
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 disabled:pointer-events-none disabled:opacity-30"
                    aria-label="Move queued message down"
                    title="Move down"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (skipAutoDrainItemIdRef.current === item.id) {
                        skipAutoDrainItemIdRef.current = null
                      }
                      removeQueuedMessage(threadId, item.id)
                    }}
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                    aria-label="Remove queued message"
                    title="Remove from queue"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div
        className={
          variant === "inlineEdit"
            ? "relative bg-transparent px-0 pb-0 pt-0"
            : "relative rounded-2xl border border-gray-200 bg-white px-2.5 pb-1.5 pt-2 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
        }
      >
        {files.length > 0 || pendingArtifactChip ? (
          <div className="mb-2 flex flex-wrap gap-2 px-0.5">
            {pendingArtifactChip ? (
              <ArtifactContextChip
                title={pendingArtifactChip.title}
                subtitle={pendingArtifactChip.subtitle}
                onRemove={() => clearPendingArtifactSelection()}
              />
            ) : null}
            {files.map((file, index) => (
              <AttachmentFileChip
                key={`${file.name}-${file.size}-${index}`}
                fileName={file.name}
                mimeType={file.type}
                onRemove={() => removePendingFile(index)}
              />
            ))}
          </div>
        ) : null}
        <div className="relative">
          <div
            ref={editorRef}
            role="textbox"
            aria-multiline="true"
            aria-placeholder="Ask anything, or use @…"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Ask anything, or use @…"
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
                clearPendingArtifactSelection()
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
          <div className="flex items-center gap-1.5">
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
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-white hover:bg-gray-800"
                aria-label="Stop generating"
                title="Stop generating"
              >
                <Square className="h-3 w-3 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void send()}
                disabled={isSendBlockedByUsage || isSending}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-white disabled:opacity-50"
                aria-label="Send"
                title={
                  isSendBlockedByUsage
                    ? "Daily AI token limit reached"
                    : "Send"
                }
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ATTACHMENTS_ACCEPT}
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
                              ) : row.id === "source" ? (
                                <BookOpen className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                              ) : row.id === "template" ? (
                                <LayoutTemplate className="h-3.5 w-3.5 shrink-0 text-orange-500" aria-hidden />
                              ) : row.id === "artifact" ? (
                                <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
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
                                          : suggestion.kind === "artifact"
                                            || suggestion.kind === "source"
                                            || suggestion.kind === "brand_template"
                                            ? suggestion.label
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
                                    ) : suggestion.kind === "artifact" ? (
                                      <>
                                        <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                                        <span className="min-w-0 flex-1 truncate text-gray-800">{suggestion.label}</span>
                                      </>
                                    ) : suggestion.kind === "source" ? (
                                      <>
                                        <BookOpen className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                                        <span className="min-w-0 flex-1 truncate text-gray-800">{suggestion.label}</span>
                                        {suggestion.source.status ? (
                                          <span className="shrink-0 text-[10px] capitalize text-gray-500">
                                            {suggestion.source.status}
                                          </span>
                                        ) : null}
                                      </>
                                    ) : suggestion.kind === "brand_template" ? (
                                      <>
                                        <LayoutTemplate className="h-3.5 w-3.5 shrink-0 text-orange-500" aria-hidden />
                                        <span className="min-w-0 flex-1 truncate text-gray-800">{suggestion.label}</span>
                                        {suggestion.template.project_name ? (
                                          <span
                                            className="max-w-[4.5rem] shrink-0 truncate text-[10px] text-gray-500"
                                            title={suggestion.template.project_name}
                                          >
                                            {suggestion.template.project_name}
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
