"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query"
import debounce from "lodash.debounce"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ChevronDown,
  GripVertical,
  Loader2,
  Maximize2,
  Trash2,
} from "lucide-react"
import { AddDashedButton } from "../../app/components/ui/add-dashed-button"
import { ArtifactDocumentEditor } from "./artifact-document-editor"
import { ArtifactRichDiffBody } from "./artifact-rich-diff-body"
import { openArtifactCenterTab } from "./open-artifact-center-tab"
import {
  buildArtifactDocumentSelection,
  openArtifactSelectionInAiPane,
} from "./open-artifact-selection-in-ai-pane"
import { computeArtifactContentHash } from "./artifact-selection"
import {
  progressiveLiveAfterHtml,
  resolveArtifactChangeSides,
  resolveArtifactPreviewChangeInput,
} from "./resolve-artifact-change-diff"
import {
  buildHtmlEmailContentJson,
  isHtmlEmailArtifact,
} from "./artifact-html-document"
import { isArtifactLiveEditLocked } from "./artifact-live-edit-lock"
import {
  deleteArtifact,
  getArtifact,
  listAiThreadArtifacts,
  listProjectArtifacts,
  listTaskArtifacts,
  reorderArtifacts,
  saveWorkspaceArtifact,
  attachArtifactToTask,
  attachArtifactToProject,
  createTaskArtifact,
} from "../../app/lib/services/artifacts"
import type {
  ArtifactContentJson,
  SelectedArtifactContext,
  TaskArtifact,
} from "../../app/lib/artifacts/artifact-types"
import { isArtifactRevisionConflictError } from "../../app/lib/artifacts/artifact-types"
import {
  useAiBuildArtifactPreviewStore,
  type AiBuildArtifactPreviewEntry,
} from "../../app/store/ai-build-artifact-preview-store"
import { useArtifactsRealtime } from "../../app/hooks/use-artifacts-realtime"
import { useCurrentUserStore } from "../../app/store/current-user"
import { useCenterPaneTabsStore } from "../../app/store/center-pane-tabs"
import { buildCenterPaneTabKey } from "../../app/store/center-pane-tabs"
import { cn } from "../../app/lib/utils"
import { getActivityRelativeTimeLabel } from "../../app/components/activity-row-timestamp"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../app/components/ui/alert-dialog"
import { SelectionAskAiMenu } from "../ai-chat/SelectionAskAiMenu"
import { computeRangeTextParts } from "../ai-chat/ai-chat-text-selection"
import {
  isArtifactAttachDrag,
  readArtifactAttachDragData,
} from "./artifact-attach-dnd"
import { ArtifactVersionHistoryPopover } from "./artifact-version-history-popover"

export type ArtifactWorkspaceProps = {
  /** Task workspace when taskId is set. */
  taskId?: number | null
  /** Project-owned artifacts (and optionally grouped task artifacts via project list). */
  projectId?: number | null
  /** AI chat workspace when taskId/projectId are null and aiThreadId is set. */
  aiThreadId?: string | null
  defaultChannelId?: number | null
  defaultLanguageId?: number | null
  className?: string
  /** Compact navigator + selected content (task/project details). */
  layout?: "stack" | "navigator"
  /** Hide the local "Artifacts" heading when nested under an outer section title. */
  hideHeading?: boolean
  /** Overview: selected artifact text becomes a reference above the pinned comment composer. */
  onArtifactTextSelectForComment?: (selection: {
    artifactId: string
    quote: string
  } | null) => void
}

type ArtifactDraft = {
  contentText: string
  contentJson: ArtifactContentJson | null
  /** Server version when this draft was created; discarded when list advances past it. */
  baseVersion: number
}

type LivePreviewEntry = AiBuildArtifactPreviewEntry

/** Prefer higher version, then newer updatedAt, then higher sequence. */
function isFresherLivePreview(candidate: LivePreviewEntry, current: LivePreviewEntry): boolean {
  const candidateVersion = candidate.currentVersion ?? 0
  const currentVersion = current.currentVersion ?? 0
  if (candidateVersion !== currentVersion) return candidateVersion > currentVersion
  if (candidate.updatedAt !== current.updatedAt) {
    return candidate.updatedAt > current.updatedAt
  }
  return candidate.sequence > current.sequence
}

function SortableArtifactShell({
  id,
  disabled,
  children,
}: {
  id: string
  disabled?: boolean
  children: (args: {
    setNodeRef: (node: HTMLElement | null) => void
    style: React.CSSProperties
    attributes: ReturnType<typeof useSortable>["attributes"]
    listeners: ReturnType<typeof useSortable>["listeners"]
    isDragging: boolean
  }) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : undefined,
  }
  return <>{children({ setNodeRef, style, attributes, listeners, isDragging })}</>
}

type StackArtifactChangeDiff = {
  beforeText: string | null
  beforeContentJson: ArtifactContentJson | null
  afterText: string | null
  afterContentJson: ArtifactContentJson | null
  beforeHtml: string | null
  afterHtml: string | null
  baselineContentJson: ArtifactContentJson | null
  baselineContentText: string | null
}

function resolveStackArtifactChangeDiff(args: {
  artifact: TaskArtifact
  live: LivePreviewEntry | null
  isLiveBusy: boolean
}): StackArtifactChangeDiff | null {
  const { artifact, live, isLiveBusy } = args
  if (!live) return null
  const input = resolveArtifactPreviewChangeInput({
    phase: live.phase,
    isBusy: isLiveBusy,
    streaming: live.streaming === true,
    beforeContentText: live.beforeContentText,
    beforeContentJson: live.beforeContentJson,
    contentText: live.contentText,
    contentJson: live.contentJson,
    diffContentText: live.diffContentText,
    sectionHtml: live.sectionHtml,
    sectionBeforeHtml: live.sectionBeforeHtml,
    streamSnippet: live.streamSnippet,
    fallbackAfterText: artifact.content_text,
    fallbackAfterContentJson: artifact.content_json,
    baselineContentJson: artifact.content_json,
    baselineContentText: artifact.content_text,
  })
  if (!input) return null
  return {
    beforeText: input.beforeText ?? null,
    beforeContentJson: (input.beforeContentJson as ArtifactContentJson | null) ?? null,
    afterText: input.afterText ?? null,
    afterContentJson: (input.afterContentJson as ArtifactContentJson | null) ?? null,
    beforeHtml: input.beforeHtml ?? null,
    afterHtml: input.afterHtml ?? null,
    baselineContentJson: (input.baselineContentJson as ArtifactContentJson | null) ?? null,
    baselineContentText: input.baselineContentText ?? null,
  }
}

function StackArtifactExpandedBody({
  display,
  live,
  isLiveBusy,
  editorForceKey,
  mediaSelectHandlers,
  updateDraft,
  openFullscreen,
  showChanges,
}: {
  display: TaskArtifact
  live: LivePreviewEntry | null
  isLiveBusy: boolean
  editorForceKey: string
  mediaSelectHandlers?: {
    onSelectImagePoint?: (args: {
      attachmentId: string
      x: number
      y: number
    }) => void
    onSelectImageRect?: (args: {
      attachmentId: string
      x: number
      y: number
      width: number
      height: number
    }) => void
    onSelectVideoTime?: (args: {
      attachmentId: string
      timeStart: number
      timeEnd?: number | null
    }) => void
    onSelectAsset?: (attachmentId: string) => void
  }
  updateDraft: (
    artifactId: string,
    patch: Partial<ArtifactDraft>,
    base: TaskArtifact,
  ) => void
  openFullscreen: () => void
  showChanges: boolean
}) {
  const progressiveHtml = live ? progressiveLiveAfterHtml(live) : null
  const streamedDisplay = useMemo(() => {
    if (!progressiveHtml || !isLiveBusy) return display
    const preferHtmlEmail =
      isHtmlEmailArtifact(display)
      || /<!doctype\s+html|<html\b|role\s*=\s*["']presentation["']/i.test(progressiveHtml)
    return {
      ...display,
      title: live?.title ?? display.title,
      content_text: progressiveHtml,
      content_json: preferHtmlEmail
        ? buildHtmlEmailContentJson(progressiveHtml, display.content_json)
        : {
            ...(typeof display.content_json === "object" && display.content_json
              ? display.content_json
              : { version: 1 }),
            blocks: [
              {
                id: "body",
                type: "rich_text",
                html: progressiveHtml,
                text: progressiveHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 20000),
              },
            ],
          },
    }
  }, [display, isLiveBusy, live?.title, progressiveHtml])

  const changeDiff = useMemo(
    () => resolveStackArtifactChangeDiff({ artifact: display, live, isLiveBusy }),
    [display, isLiveBusy, live],
  )
  const sides = useMemo(() => {
    if (!changeDiff) return null
    return resolveArtifactChangeSides({
      beforeText: changeDiff.beforeText,
      beforeContentJson: changeDiff.beforeContentJson,
      afterText: changeDiff.afterText,
      afterContentJson: changeDiff.afterContentJson,
      beforeHtml: changeDiff.beforeHtml,
      afterHtml: changeDiff.afterHtml,
      baselineContentJson: changeDiff.baselineContentJson,
      baselineContentText: changeDiff.baselineContentText,
    })
  }, [changeDiff])

  const streamForceKey = progressiveHtml
    ? `${editorForceKey}:stream:${progressiveHtml.length}`
    : editorForceKey

  return (
    <div className="min-h-[12rem] max-h-[28rem] resize-y overflow-auto border-t border-gray-100">
      {showChanges && sides?.hasChanges && !progressiveHtml ? (
        <ArtifactRichDiffBody
          beforeHtml={sides.beforeHtml}
          afterHtml={sides.afterHtml}
          prebuiltHtml={sides.trackChangesHtml}
        />
      ) : (
        <ArtifactDocumentEditor
          artifact={streamedDisplay}
          forceContentKey={streamForceKey}
          readOnly={isLiveBusy}
          onContentJsonChange={(contentJson) => {
            updateDraft(display.id, { contentJson }, display)
          }}
          onContentTextChange={(contentText) => {
            updateDraft(display.id, { contentText }, display)
          }}
          onOpenFullscreen={openFullscreen}
          {...mediaSelectHandlers}
        />
      )}
    </div>
  )
}

function StackArtifactChangeToggle({
  display,
  live,
  isLiveBusy,
  showChanges,
  onToggle,
}: {
  display: TaskArtifact
  live: LivePreviewEntry | null
  isLiveBusy: boolean
  showChanges: boolean
  onToggle: () => void
}) {
  const changeDiff = useMemo(
    () => resolveStackArtifactChangeDiff({ artifact: display, live, isLiveBusy }),
    [display, isLiveBusy, live],
  )
  const sides = useMemo(() => {
    if (!changeDiff) return null
    return resolveArtifactChangeSides({
      beforeText: changeDiff.beforeText,
      beforeContentJson: changeDiff.beforeContentJson,
      afterText: changeDiff.afterText,
      afterContentJson: changeDiff.afterContentJson,
      beforeHtml: changeDiff.beforeHtml,
      afterHtml: changeDiff.afterHtml,
      baselineContentJson: changeDiff.baselineContentJson,
      baselineContentText: changeDiff.baselineContentText,
    })
  }, [changeDiff])
  if (!sides?.hasChanges) return null
  // Same chrome as chat preview cards: only +/− counters (no "Document"/"Changes" label).
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs",
        showChanges ? "bg-gray-100" : "hover:bg-gray-50",
      )}
      aria-pressed={showChanges}
      aria-label={showChanges ? "Show editable document" : "Show changes"}
      title={showChanges ? "Show editable document" : "Show changes"}
    >
      {sides.stats.added > 0 ? (
        <span className="font-medium text-emerald-600">+{sides.stats.added}</span>
      ) : null}
      {sides.stats.removed > 0 ? (
        <span className="font-medium text-red-600">−{sides.stats.removed}</span>
      ) : null}
    </button>
  )
}

/**
 * Renders artifacts for a task, project, or AI chat thread.
 * Live build previews merge in place by build_id + unit_id + artifact_id.
 */
export function ArtifactWorkspace({
  taskId = null,
  projectId = null,
  aiThreadId = null,
  defaultChannelId = null,
  defaultLanguageId = null,
  className,
  layout = "navigator",
  hideHeading = false,
  onArtifactTextSelectForComment,
}: ArtifactWorkspaceProps) {
  const queryClient = useQueryClient()
  const currentUserId = useCurrentUserStore((s) => s.publicUserId)
  const closeCenterTab = useCenterPaneTabsStore((s) => s.closeTab)
  const updateCenterTabTitle = useCenterPaneTabsStore((s) => s.updateTitle)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const [expandedStackIds, setExpandedStackIds] = useState<Set<string>>(() => new Set())
  const [collapsedStackIds, setCollapsedStackIds] = useState<Set<string>>(() => new Set())
  const [collapsedStackTouched, setCollapsedStackTouched] = useState(false)
  const [stackShowChangesById, setStackShowChangesById] = useState<Record<string, boolean>>({})
  const [draftByArtifactId, setDraftByArtifactId] = useState<Record<string, ArtifactDraft>>({})
  const [titleDraftById, setTitleDraftById] = useState<Record<string, string>>({})
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isReordering, setIsReordering] = useState(false)
  const [optimisticOrderIds, setOptimisticOrderIds] = useState<string[] | null>(null)
  const [isAttachDragOver, setIsAttachDragOver] = useState(false)
  const [isAttachingDrop, setIsAttachingDrop] = useState(false)
  const [attachDropError, setAttachDropError] = useState<string | null>(null)
  const [isCreatingArtifact, setIsCreatingArtifact] = useState(false)
  const draftByArtifactIdRef = useRef(draftByArtifactId)
  draftByArtifactIdRef.current = draftByArtifactId
  const allArtifactsRef = useRef<TaskArtifact[]>([])
  const onArtifactTextSelectForCommentRef = useRef(onArtifactTextSelectForComment)
  onArtifactTextSelectForCommentRef.current = onArtifactTextSelectForComment

  const canAcceptArtifactAttach = (taskId != null && taskId > 0) || (projectId != null && projectId > 0)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Metadata-first for a fast title list; full bodies hydrate in the background.
  const taskMetaQuery = useQuery({
    queryKey: ["task-artifacts-meta", taskId],
    queryFn: () => listTaskArtifacts({ taskId: taskId!, includeContent: false }),
    enabled: taskId != null && taskId > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })

  const taskQuery = useQuery({
    queryKey: ["task-artifacts", taskId],
    queryFn: () => listTaskArtifacts({ taskId: taskId!, includeContent: true }),
    enabled: taskId != null && taskId > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })

  const projectMetaQuery = useQuery({
    queryKey: ["project-artifacts-meta", projectId],
    queryFn: () => listProjectArtifacts({ projectId: projectId!, includeContent: false }),
    enabled: (taskId == null || taskId <= 0) && projectId != null && projectId > 0,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })

  const projectQuery = useQuery({
    queryKey: ["project-artifacts", projectId],
    queryFn: () => listProjectArtifacts({ projectId: projectId!, includeContent: true }),
    // Full bodies once; avoid refetch storms when chat history hydrates many builds.
    enabled: (taskId == null || taskId <= 0) && projectId != null && projectId > 0,
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })

  const threadQuery = useQuery({
    queryKey: ["ai-thread-artifacts", aiThreadId],
    queryFn: () => listAiThreadArtifacts({ threadId: aiThreadId!, includeContent: true }),
    enabled:
      (taskId == null || taskId <= 0) &&
      (projectId == null || projectId <= 0) &&
      !!aiThreadId,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  })

  useArtifactsRealtime({
    taskId,
    projectId,
    aiThreadId,
    enabled: true,
  })

  const artifacts = useMemo(() => {
    if (taskId != null && taskId > 0) {
      return taskQuery.data?.artifacts ?? taskMetaQuery.data?.artifacts ?? []
    }
    if (projectId != null && projectId > 0) {
      return projectQuery.data?.artifacts ?? projectMetaQuery.data?.artifacts ?? []
    }
    return threadQuery.data?.artifacts ?? []
  }, [
    projectId,
    projectMetaQuery.data?.artifacts,
    projectQuery.data?.artifacts,
    taskId,
    taskMetaQuery.data?.artifacts,
    taskQuery.data?.artifacts,
    threadQuery.data?.artifacts,
  ])

  const livePreviews = useAiBuildArtifactPreviewStore((s) => s.previews)
  const pruneConsumedSavedPreviews = useAiBuildArtifactPreviewStore(
    (s) => s.pruneConsumedSavedPreviews,
  )
  const ensureBeforeBaseline = useAiBuildArtifactPreviewStore(
    (s) => s.ensureBeforeBaseline,
  )
  const liveByArtifactId = useMemo(() => {
    const map = new Map<string, LivePreviewEntry>()
    for (const entry of Object.values(livePreviews)) {
      const prev = map.get(entry.artifactId)
      if (!prev || isFresherLivePreview(entry, prev)) map.set(entry.artifactId, entry)
    }
    return map
  }, [livePreviews])

  // Freeze rich before JSON from the on-screen artifact so diffs stay HTML↔HTML.
  useEffect(() => {
    for (const artifact of artifacts) {
      const live = liveByArtifactId.get(artifact.id)
      if (!live) continue
      if (live.phase === "saved" || live.phase === "failed") continue
      if (live.beforeContentJson) continue
      ensureBeforeBaseline({
        artifactId: artifact.id,
        contentJson: artifact.content_json,
        contentText: artifact.content_text,
      })
    }
  }, [artifacts, ensureBeforeBaseline, liveByArtifactId])

  // Once the list has caught up to (or passed) a saved preview, drop the overlay
  // so overview/stack cannot pin an older AI body forever.
  useEffect(() => {
    for (const artifact of artifacts) {
      pruneConsumedSavedPreviews(artifact.id, artifact.current_version ?? 0)
    }
  }, [artifacts, pruneConsumedSavedPreviews])

  // Rebase or drop local drafts when the server version moves ahead.
  // Never wipe a dirty draft that still differs from the server — that is how
  // keystrokes typed during autosave were getting discarded after invalidate.
  useEffect(() => {
    setDraftByArtifactId((prev) => {
      let changed = false
      const next = { ...prev }
      for (const artifact of artifacts) {
        const draft = next[artifact.id]
        if (!draft) continue
        const serverVersion = artifact.current_version ?? 0
        if (draft.baseVersion >= serverVersion) continue

        const matchesServer =
          draft.contentText === (artifact.content_text ?? "")
          && JSON.stringify(draft.contentJson) === JSON.stringify(artifact.content_json)

        if (matchesServer) {
          delete next[artifact.id]
          changed = true
          continue
        }

        // Keep local edits; rebase so the next save targets the new version.
        next[artifact.id] = { ...draft, baseVersion: serverVersion }
        changed = true
      }
      return changed ? next : prev
    })
  }, [artifacts])

  const liveOnlyArtifacts = useMemo(() => {
    const known = new Set(artifacts.map((row) => row.id))
    const extras: TaskArtifact[] = []
    for (const entry of liveByArtifactId.values()) {
      if (known.has(entry.artifactId)) continue
      // Task overview: keep live extras for this task. Missing taskId is common on
      // early build events — still show them here so cards don't blink out.
      if (
        taskId != null
        && taskId > 0
        && entry.taskId != null
        && entry.taskId !== taskId
      ) {
        continue
      }
      // Project overview (no task): only show live extras that belong to THIS project.
      // Missing projectId must not leak across project sheets (previews historically omitted it).
      if (
        (taskId == null || taskId <= 0)
        && projectId != null
        && projectId > 0
      ) {
        if (entry.projectId == null || entry.projectId !== projectId) continue
      }
      if (
        (taskId == null || taskId <= 0) &&
        aiThreadId &&
        entry.aiThreadId &&
        entry.aiThreadId !== aiThreadId &&
        entry.threadId !== aiThreadId
      ) {
        continue
      }
      extras.push({
        id: entry.artifactId,
        task_id: entry.taskId,
        project_id: entry.projectId ?? null,
        ai_thread_id: entry.aiThreadId ?? aiThreadId,
        artifact_type: "document",
        artifact_role: null,
        title: entry.title,
        status: "draft",
        channel_id: entry.channelId,
        language_id: entry.languageId,
        content_text: entry.contentText,
        content_json: entry.contentJson,
        asset_data: entry.assetData,
        source_artifact_id: null,
        source_version_number: null,
        derivation_type: null,
        current_version: entry.currentVersion ?? 0,
        metadata: null,
        updated_at: null,
      })
    }
    return extras
  }, [aiThreadId, artifacts, liveByArtifactId, projectId, taskId])

  const allArtifacts = useMemo(() => {
    const base = [...liveOnlyArtifacts, ...artifacts]
    if (!optimisticOrderIds || optimisticOrderIds.length === 0) return base
    const byId = new Map(base.map((row) => [row.id, row]))
    const ordered: TaskArtifact[] = []
    for (const id of optimisticOrderIds) {
      const row = byId.get(id)
      if (row) {
        ordered.push(row)
        byId.delete(id)
      }
    }
    for (const row of byId.values()) ordered.push(row)
    return ordered
  }, [artifacts, liveOnlyArtifacts, optimisticOrderIds])
  allArtifactsRef.current = allArtifacts

  useEffect(() => {
    if (!optimisticOrderIds) return
    const serverIds = [...liveOnlyArtifacts, ...artifacts].map((row) => row.id)
    if (
      serverIds.length === optimisticOrderIds.length
      && serverIds.every((id, index) => id === optimisticOrderIds[index])
    ) {
      setOptimisticOrderIds(null)
    }
  }, [artifacts, liveOnlyArtifacts, optimisticOrderIds])

  const projectOwned = useMemo(
    () => allArtifacts.filter((row) => row.task_id == null && row.project_id != null),
    [allArtifacts],
  )
  const taskGrouped = useMemo(() => {
    const map = new Map<number, TaskArtifact[]>()
    for (const row of allArtifacts) {
      if (row.task_id == null) continue
      const list = map.get(row.task_id) ?? []
      list.push(row)
      map.set(row.task_id, list)
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [allArtifacts])

  /** Task overview already scopes to one task — skip "Task #…" group headers. */
  const showTaskGroupHeaders = projectId != null && (taskId == null || taskId <= 0)

  useEffect(() => {
    if (allArtifacts.length === 0) {
      setSelectedArtifactId(null)
      return
    }
    if (
      selectedArtifactId &&
      allArtifacts.some((row) => row.id === selectedArtifactId)
    ) {
      return
    }
    setSelectedArtifactId(allArtifacts[0]?.id ?? null)
  }, [allArtifacts, selectedArtifactId])

  const selectedArtifact =
    allArtifacts.find((row) => row.id === selectedArtifactId) ?? null
  const selectedLive = selectedArtifact
    ? liveByArtifactId.get(selectedArtifact.id) ?? null
    : null
  const displaySelected = useMemo<TaskArtifact | null>(() => {
    if (!selectedArtifact) return null
    const draft = draftByArtifactId[selectedArtifact.id]
    const draftIsStale =
      !!draft && draft.baseVersion < (selectedArtifact.current_version ?? 0)
    // Only overlay saved live content when it is newer than the list row.
    const withLive =
      selectedLive
      && selectedLive.phase === "saved"
      && selectedLive.currentVersion != null
      && selectedLive.currentVersion > (selectedArtifact.current_version ?? 0)
        ? {
            ...selectedArtifact,
            title: selectedLive.title ?? selectedArtifact.title,
            content_text: selectedLive.contentText || selectedArtifact.content_text,
            content_json: selectedLive.contentJson ?? selectedArtifact.content_json,
            asset_data: selectedLive.assetData ?? selectedArtifact.asset_data,
            current_version: selectedLive.currentVersion ?? selectedArtifact.current_version,
          }
        : selectedLive && selectedLive.phase !== "saved" && selectedLive.phase !== "failed"
          ? { ...selectedArtifact, title: selectedLive.title ?? selectedArtifact.title }
          : selectedArtifact
    if (!draft || draftIsStale) return withLive
    return {
      ...withLive,
      content_text: draft.contentText,
      content_json: draft.contentJson ?? withLive.content_json,
    }
  }, [draftByArtifactId, selectedArtifact, selectedLive])

  const attachArtifactSelection = useCallback(
    (context: SelectedArtifactContext, artifact?: TaskArtifact | null) => {
      void openArtifactSelectionInAiPane({
        context,
        taskId: artifact?.task_id ?? taskId,
        projectId: artifact?.project_id ?? projectId,
        channelId: defaultChannelId,
      })
    },
    [defaultChannelId, projectId, taskId],
  )

  const selectArtifactForChat = useCallback(
    (artifact: TaskArtifact) => {
      setSelectedArtifactId(artifact.id)
      attachArtifactSelection(buildArtifactDocumentSelection(artifact), artifact)
    },
    [attachArtifactSelection],
  )

  const resolveArtifactTextSelection = useCallback(
    (container: HTMLElement, range: Range): SelectedArtifactContext | null => {
      const artifactId = container.getAttribute("data-artifact-id")?.trim()
      if (!artifactId) return null
      const version = Number(container.getAttribute("data-artifact-version") ?? 0) || 0
      const title = container.getAttribute("data-artifact-title")
      const parts = computeRangeTextParts(container, range)
      if (!parts.selected_text.trim()) return null
      return {
        source_type: "task_artifact",
        artifact_id: artifactId,
        artifact_version_number: version,
        anchor_type: "text_range",
        selected_text: parts.selected_text,
        selection_before: parts.selection_before,
        selection_after: parts.selection_after,
        selection_start: parts.selection_start,
        selection_end: parts.selection_end,
        full_content_hash: computeArtifactContentHash(parts.full_text),
        title,
      }
    },
    [],
  )

  const mediaSelectHandlers = useMemo(() => {
    if (!displaySelected) return {}
    const artifact = displaySelected
    return {
      onSelectImagePoint: ({
        attachmentId,
        x,
        y,
      }: {
        attachmentId: string
        x: number
        y: number
      }) => {
        attachArtifactSelection(
          {
            source_type: "task_artifact",
            artifact_id: artifact.id,
            artifact_version_number: artifact.current_version ?? 0,
            anchor_type: "image_point",
            attachment_id: attachmentId,
            anchor_x: x,
            anchor_y: y,
            title: artifact.title,
          },
          artifact,
        )
      },
      onSelectImageRect: ({
        attachmentId,
        x,
        y,
        width,
        height,
      }: {
        attachmentId: string
        x: number
        y: number
        width: number
        height: number
      }) => {
        attachArtifactSelection(
          {
            source_type: "task_artifact",
            artifact_id: artifact.id,
            artifact_version_number: artifact.current_version ?? 0,
            anchor_type: "image_rect",
            attachment_id: attachmentId,
            anchor_x: x,
            anchor_y: y,
            anchor_width: width,
            anchor_height: height,
            title: artifact.title,
          },
          artifact,
        )
      },
      onSelectVideoTime: ({
        attachmentId,
        timeStart,
        timeEnd,
      }: {
        attachmentId: string
        timeStart: number
        timeEnd?: number | null
      }) => {
        attachArtifactSelection(
          {
            source_type: "task_artifact",
            artifact_id: artifact.id,
            artifact_version_number: artifact.current_version ?? 0,
            anchor_type: "video_time",
            attachment_id: attachmentId,
            anchor_time_start: timeStart,
            anchor_time_end: timeEnd ?? timeStart,
            title: artifact.title,
          },
          artifact,
        )
      },
      onSelectAsset: (attachmentId: string) => {
        attachArtifactSelection(
          {
            source_type: "task_artifact",
            artifact_id: artifact.id,
            artifact_version_number: artifact.current_version ?? 0,
            anchor_type: "asset",
            attachment_id: attachmentId,
            title: artifact.title,
          },
          artifact,
        )
      },
    }
  }, [attachArtifactSelection, displaySelected])

  // Titles can render as soon as the lightweight meta list arrives.
  const isLoading =
    taskId != null
      ? taskMetaQuery.isLoading && taskQuery.isLoading
      : projectId != null
        ? projectMetaQuery.isLoading && projectQuery.isLoading
        : threadQuery.isLoading
  const hasFullContentLoaded =
    taskId != null
      ? Boolean(taskQuery.data?.artifacts)
      : projectId != null
        ? Boolean(projectQuery.data?.artifacts)
        : Boolean(threadQuery.data?.artifacts)
  const error =
    taskId != null
      ? (taskQuery.error ?? taskMetaQuery.error)
      : projectId != null
        ? (projectQuery.error ?? projectMetaQuery.error)
        : threadQuery.error

  const liveByArtifactIdRef = useRef(liveByArtifactId)
  liveByArtifactIdRef.current = liveByArtifactId
  const currentUserIdRef = useRef(currentUserId)
  currentUserIdRef.current = currentUserId
  /** One in-flight save per artifact — coalesces keystrokes instead of stacking RPCs. */
  const savingArtifactIdsRef = useRef(new Set<string>())
  const pendingResaveIdsRef = useRef(new Set<string>())
  /** Newest observed server version per artifact — never save below this. */
  const knownServerVersionByIdRef = useRef<Record<string, number>>({})
  const conflictCooldownUntilByIdRef = useRef<Record<string, number>>({})

  useEffect(() => {
    for (const artifact of artifacts) {
      const version = artifact.current_version ?? 0
      const known = knownServerVersionByIdRef.current[artifact.id] ?? 0
      if (version > known) knownServerVersionByIdRef.current[artifact.id] = version
    }
  }, [artifacts])

  const saveArtifactRef = useRef(async (_artifactId: string) => {})
  saveArtifactRef.current = async (artifactId: string) => {
    if (Date.now() < (conflictCooldownUntilByIdRef.current[artifactId] ?? 0)) {
      pendingResaveIdsRef.current.delete(artifactId)
      return
    }
    if (savingArtifactIdsRef.current.has(artifactId)) {
      pendingResaveIdsRef.current.add(artifactId)
      return
    }

    const draft = draftByArtifactIdRef.current[artifactId]
    if (!draft) return
    const base =
      allArtifactsRef.current.find((row) => row.id === artifactId) ?? null
    if (!base) return
    const live = liveByArtifactIdRef.current.get(artifactId)
    if (live && live.phase !== "saved" && live.phase !== "failed") return

    const expectedVersion = Math.max(
      base.current_version ?? 0,
      knownServerVersionByIdRef.current[artifactId] ?? 0,
      draft.baseVersion ?? 0,
    )
    if (expectedVersion <= 0) return
    // TipTap echo after AI/list sync — don't write a no-op revision.
    if (
      draft.contentText === (base.content_text ?? "")
      && JSON.stringify(draft.contentJson) === JSON.stringify(base.content_json)
    ) {
      setDraftByArtifactId((prev) => {
        if (!prev[artifactId]) return prev
        const next = { ...prev }
        delete next[artifactId]
        return next
      })
      return
    }

    savingArtifactIdsRef.current.add(artifactId)
    setConflictMessage(null)
    try {
      const result = await saveWorkspaceArtifact({
        artifactId: base.id,
        expectedVersion,
        snapshot: {
          title: base.title,
          status: base.status,
          content_text: draft.contentText,
          content_json: draft.contentJson ?? base.content_json,
          asset_data: base.asset_data,
        },
        changeSource: "manual",
        changedBy: currentUserIdRef.current,
        aiThreadId: base.ai_thread_id,
      })
      if (
        isArtifactRevisionConflictError(result) ||
        ("code" in result && result.code === "artifact_revision_conflict")
      ) {
        const conflict = result as {
          expected_version: number | null
          current_version: number | null
        }
        pendingResaveIdsRef.current.delete(artifactId)
        debouncedSaveRef.current.cancel()
        conflictCooldownUntilByIdRef.current[artifactId] = Date.now() + 8_000
        if (conflict.current_version != null && conflict.current_version > 0) {
          knownServerVersionByIdRef.current[artifactId] = Math.max(
            knownServerVersionByIdRef.current[artifactId] ?? 0,
            conflict.current_version,
          )
        }
        // Drop the stale draft so TipTap cannot keep re-saving version N-k.
        setDraftByArtifactId((prev) => {
          if (!prev[artifactId]) return prev
          const next = { ...prev }
          delete next[artifactId]
          return next
        })
        setConflictMessage(
          `Revision conflict — newer version kept. Reloading…`,
        )
        await getArtifact({ artifactId: base.id })
        await queryClient.invalidateQueries({ queryKey: ["task-artifacts"] })
        await queryClient.invalidateQueries({ queryKey: ["project-artifacts"] })
        await queryClient.invalidateQueries({ queryKey: ["ai-thread-artifacts"] })
        await queryClient.invalidateQueries({ queryKey: ["artifact", artifactId] })
        return
      }
      if ("version_number" in result && typeof result.version_number === "number") {
        knownServerVersionByIdRef.current[artifactId] = Math.max(
          knownServerVersionByIdRef.current[artifactId] ?? 0,
          result.version_number,
        )
      }
      // Drop draft only if it still matches what we saved (no newer keystrokes).
      setDraftByArtifactId((prev) => {
        const current = prev[artifactId]
        if (
          !current
          || current.contentText !== draft.contentText
          || current.contentJson !== draft.contentJson
        ) {
          return prev
        }
        const next = { ...prev }
        delete next[artifactId]
        return next
      })
      await queryClient.invalidateQueries({ queryKey: ["task-artifacts"] })
      await queryClient.invalidateQueries({ queryKey: ["project-artifacts"] })
      await queryClient.invalidateQueries({ queryKey: ["ai-thread-artifacts"] })
    } finally {
      savingArtifactIdsRef.current.delete(artifactId)
      if (
        pendingResaveIdsRef.current.has(artifactId)
        && Date.now() >= (conflictCooldownUntilByIdRef.current[artifactId] ?? 0)
      ) {
        pendingResaveIdsRef.current.delete(artifactId)
        void saveArtifactRef.current(artifactId)
      } else {
        pendingResaveIdsRef.current.delete(artifactId)
      }
    }
  }

  const debouncedSaveRef = useRef(
    debounce((artifactId: string) => {
      void saveArtifactRef.current(artifactId)
    }, 600),
  )

  useEffect(() => {
    const debounced = debouncedSaveRef.current
    return () => {
      debounced.cancel()
    }
  }, [])

  const updateDraft = (artifactId: string, patch: Partial<ArtifactDraft>, fallback: TaskArtifact) => {
    if (Date.now() < (conflictCooldownUntilByIdRef.current[artifactId] ?? 0)) return
    const serverVersion = Math.max(
      fallback.current_version ?? 0,
      knownServerVersionByIdRef.current[artifactId] ?? 0,
    )
    setDraftByArtifactId((prev) => ({
      ...prev,
      [artifactId]: {
        contentText: patch.contentText ?? prev[artifactId]?.contentText ?? fallback.content_text ?? "",
        contentJson:
          patch.contentJson !== undefined
            ? patch.contentJson
            : (prev[artifactId]?.contentJson ?? fallback.content_json ?? null),
        baseVersion: serverVersion,
      },
    }))
    debouncedSaveRef.current(artifactId)
  }

  const invalidateArtifactLists = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["task-artifacts"] }),
      queryClient.invalidateQueries({ queryKey: ["project-artifacts"] }),
      queryClient.invalidateQueries({ queryKey: ["ai-thread-artifacts"] }),
      queryClient.invalidateQueries({ queryKey: ["artifact"] }),
    ])
  }, [queryClient])

  const commitTitle = useCallback(
    async (artifact: TaskArtifact, nextTitle: string) => {
      const trimmed = nextTitle.trim() || "Untitled artifact"
      const previous = artifact.title?.trim() || "Untitled artifact"
      setTitleDraftById((prev) => {
        const next = { ...prev }
        delete next[artifact.id]
        return next
      })
      if (trimmed === previous) return
      const live = liveByArtifactIdRef.current.get(artifact.id)
      if (live && live.phase !== "saved") return
      if (savingArtifactIdsRef.current.has(artifact.id)) {
        pendingResaveIdsRef.current.add(artifact.id)
        return
      }
      const draft = draftByArtifactIdRef.current[artifact.id]
      savingArtifactIdsRef.current.add(artifact.id)
      setConflictMessage(null)
      try {
        const result = await saveWorkspaceArtifact({
          artifactId: artifact.id,
          expectedVersion: artifact.current_version,
          snapshot: {
            title: trimmed,
            status: artifact.status,
            content_text: draft?.contentText ?? artifact.content_text,
            content_json: draft?.contentJson ?? artifact.content_json,
            asset_data: artifact.asset_data,
          },
          changeSource: "manual",
          changedBy: currentUserIdRef.current,
          aiThreadId: artifact.ai_thread_id,
          changeSummary: "Renamed artifact",
        })
        if (
          isArtifactRevisionConflictError(result) ||
          ("code" in result && result.code === "artifact_revision_conflict")
        ) {
          pendingResaveIdsRef.current.delete(artifact.id)
          setConflictMessage("Could not rename — a newer version exists. Reloading…")
          await invalidateArtifactLists()
          return
        }
        updateCenterTabTitle(buildCenterPaneTabKey("artifact", artifact.id), trimmed)
        await invalidateArtifactLists()
      } catch (error) {
        setConflictMessage(error instanceof Error ? error.message : "Failed to rename artifact")
      } finally {
        savingArtifactIdsRef.current.delete(artifact.id)
        if (pendingResaveIdsRef.current.has(artifact.id)) {
          pendingResaveIdsRef.current.delete(artifact.id)
          void saveArtifactRef.current(artifact.id)
        }
      }
    },
    [invalidateArtifactLists, updateCenterTabTitle],
  )

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return
    setIsDeleting(true)
    setConflictMessage(null)
    try {
      await deleteArtifact({ artifactId: pendingDeleteId })
      closeCenterTab(buildCenterPaneTabKey("artifact", pendingDeleteId))
      setPendingDeleteId(null)
      if (selectedArtifactId === pendingDeleteId) setSelectedArtifactId(null)
      setDraftByArtifactId((prev) => {
        const next = { ...prev }
        delete next[pendingDeleteId]
        return next
      })
      setTitleDraftById((prev) => {
        const next = { ...prev }
        delete next[pendingDeleteId]
        return next
      })
      await invalidateArtifactLists()
    } catch (error) {
      setConflictMessage(error instanceof Error ? error.message : "Failed to delete artifact")
    } finally {
      setIsDeleting(false)
    }
  }, [closeCenterTab, invalidateArtifactLists, pendingDeleteId, selectedArtifactId])

  const handleReorder = useCallback(
    async (activeId: string, overId: string) => {
      if (activeId === overId || isReordering) return
      const current = allArtifactsRef.current
      const oldIndex = current.findIndex((row) => row.id === activeId)
      const newIndex = current.findIndex((row) => row.id === overId)
      if (oldIndex < 0 || newIndex < 0) return
      const next = arrayMove(current, oldIndex, newIndex)
      const orderedIds = next.map((row) => row.id)
      setOptimisticOrderIds(orderedIds)
      setIsReordering(true)
      setConflictMessage(null)
      try {
        await reorderArtifacts({ orderedIds })
        await invalidateArtifactLists()
      } catch (error) {
        setOptimisticOrderIds(null)
        setConflictMessage(error instanceof Error ? error.message : "Failed to reorder artifacts")
        await invalidateArtifactLists()
      } finally {
        setIsReordering(false)
      }
    },
    [invalidateArtifactLists, isReordering],
  )

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over) return
      void handleReorder(String(active.id), String(over.id))
    },
    [handleReorder],
  )

  const clearAttachDragOver = useCallback(() => {
    setIsAttachDragOver(false)
  }, [])

  const handleAttachDragOver = useCallback(
    (event: React.DragEvent) => {
      if (!canAcceptArtifactAttach || !isArtifactAttachDrag(event.dataTransfer)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = "link"
      if (!isAttachDragOver) setIsAttachDragOver(true)
    },
    [canAcceptArtifactAttach, isAttachDragOver],
  )

  const handleAttachDrop = useCallback(
    async (event: React.DragEvent) => {
      if (!canAcceptArtifactAttach) return
      const artifactId = readArtifactAttachDragData(event.dataTransfer)
      if (!artifactId) return
      event.preventDefault()
      event.stopPropagation()
      setIsAttachDragOver(false)
      setAttachDropError(null)

      const alreadyOnTask =
        taskId != null
        && allArtifactsRef.current.some((row) => row.id === artifactId && row.task_id === taskId)
      const alreadyOnProject =
        taskId == null
        && projectId != null
        && allArtifactsRef.current.some(
          (row) => row.id === artifactId && row.project_id === projectId && row.task_id == null,
        )
      if (alreadyOnTask || alreadyOnProject) return

      setIsAttachingDrop(true)
      try {
        if (taskId != null && taskId > 0) {
          await attachArtifactToTask({
            artifactId,
            taskId,
            channelId: defaultChannelId,
            languageId: defaultLanguageId,
          })
        } else if (projectId != null && projectId > 0) {
          await attachArtifactToProject({ artifactId, projectId })
        }
        await queryClient.invalidateQueries({ queryKey: ["task-artifacts"] })
        await queryClient.invalidateQueries({ queryKey: ["project-artifacts"] })
        await queryClient.invalidateQueries({ queryKey: ["ai-thread-artifacts"] })
        await invalidateArtifactLists()
      } catch (error) {
        setAttachDropError(
          error instanceof Error ? error.message : "Failed to attach artifact",
        )
      } finally {
        setIsAttachingDrop(false)
      }
    },
    [
      canAcceptArtifactAttach,
      defaultChannelId,
      defaultLanguageId,
      invalidateArtifactLists,
      projectId,
      queryClient,
      taskId,
    ],
  )

  const attachDropProps = canAcceptArtifactAttach
    ? {
        onDragEnter: handleAttachDragOver,
        onDragOver: handleAttachDragOver,
        onDragLeave: (event: React.DragEvent) => {
          const related = event.relatedTarget as Node | null
          if (related && event.currentTarget.contains(related)) return
          clearAttachDragOver()
        },
        onDrop: (event: React.DragEvent) => {
          void handleAttachDrop(event)
        },
      }
    : {}

  const canCreateBlankArtifact = taskId != null && taskId > 0

  const handleCreateBlankArtifact = useCallback(async () => {
    if (!canCreateBlankArtifact || isCreatingArtifact) return
    setIsCreatingArtifact(true)
    setAttachDropError(null)
    try {
      const created = await createTaskArtifact({
        taskId: taskId!,
        title: "Untitled",
        artifactType: "document",
        channelId: defaultChannelId,
        languageId: defaultLanguageId,
        status: "draft",
      })
      await queryClient.invalidateQueries({ queryKey: ["task-artifacts"] })
      await queryClient.invalidateQueries({ queryKey: ["task-artifacts-meta"] })
      setExpandedStackIds((prev) => new Set(prev).add(created.id))
      setSelectedArtifactId(created.id)
    } catch (error) {
      setAttachDropError(
        error instanceof Error ? error.message : "Failed to create artifact",
      )
    } finally {
      setIsCreatingArtifact(false)
    }
  }, [
    canCreateBlankArtifact,
    defaultChannelId,
    defaultLanguageId,
    isCreatingArtifact,
    queryClient,
    taskId,
  ])

  const addArtifactButton =
    canCreateBlankArtifact ? (
      <AddDashedButton
        label="Add"
        className="mt-2"
        disabled={isCreatingArtifact}
        onClick={() => void handleCreateBlankArtifact()}
      />
    ) : null

  useEffect(() => {
    if (!onArtifactTextSelectForComment) return
    const handleMouseUp = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        return
      }
      const quote = selection.toString().replace(/\s+/g, " ").trim()
      if (!quote) return
      const node = selection.anchorNode
      const el =
        node instanceof Element
          ? node
          : node?.parentElement ?? null
      const container = el?.closest?.('[data-ai-selectable="artifact"]') as HTMLElement | null
      if (!container) return
      const artifactId = container.getAttribute("data-artifact-id")?.trim()
      if (!artifactId) return
      onArtifactTextSelectForCommentRef.current?.({ artifactId, quote })
    }
    document.addEventListener("mouseup", handleMouseUp)
    return () => document.removeEventListener("mouseup", handleMouseUp)
  }, [onArtifactTextSelectForComment])

  if (!taskId && !projectId && !aiThreadId) return null

  const heading =
    taskId != null ? "Artifacts" : projectId != null ? "Project artifacts" : "Chat artifacts"

  const titleValueFor = (artifact: TaskArtifact) =>
    titleDraftById[artifact.id] ?? artifact.title ?? ""

  const renderNavigatorItem = (artifact: TaskArtifact) => {
    const live = liveByArtifactId.get(artifact.id)
    const isSelected = artifact.id === selectedArtifactId
    const isPreview = !!live && live.phase !== "saved" && live.phase !== "failed"
    return (
      <SortableArtifactShell key={artifact.id} id={artifact.id} disabled={isReordering}>
        {({ setNodeRef, style, attributes, listeners }) => (
          <div
            ref={setNodeRef}
            style={style}
            className={cn(
              "flex w-full items-stretch gap-0.5 rounded-md border",
              isSelected
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-800",
            )}
          >
            <button
              type="button"
              className={cn(
                "flex shrink-0 cursor-grab items-center px-1.5 active:cursor-grabbing",
                isSelected ? "text-gray-400 hover:text-white" : "text-gray-400 hover:text-gray-700",
              )}
              aria-label="Drag to reorder"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => selectArtifactForChat(artifact)}
              className={cn(
                "min-w-0 flex-1 px-2 py-2 text-left transition-colors",
                isSelected ? "hover:bg-gray-800" : "hover:bg-gray-50",
              )}
            >
              <div className="truncate text-xs font-medium">
                {artifact.title?.trim() || "Untitled artifact"}
              </div>
              <div
                className={cn(
                  "mt-0.5 flex flex-wrap gap-1.5 text-[10px]",
                  isSelected ? "text-gray-300" : "text-gray-500",
                )}
              >
                <span>{artifact.artifact_type}</span>
                {artifact.updated_at ? (
                  <span>{getActivityRelativeTimeLabel(artifact.updated_at)}</span>
                ) : null}
                {isPreview ? <span>Preview</span> : null}
              </div>
            </button>
          </div>
        )}
      </SortableArtifactShell>
    )
  }

  const deleteDialog = (
    <AlertDialog
      open={!!pendingDeleteId}
      onOpenChange={(open) => {
        if (!open && !isDeleting) setPendingDeleteId(null)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete artifact?</AlertDialogTitle>
          <AlertDialogDescription>
            This archives the artifact and removes it from overview and search.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isDeleting}
            onClick={(event) => {
              event.preventDefault()
              void handleConfirmDelete()
            }}
            className="bg-red-600 hover:bg-red-700"
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  if (layout === "stack") {
    return (
      <div
        className={cn(
          className,
          canAcceptArtifactAttach
            && "rounded-lg transition-[box-shadow,background-color]",
          isAttachDragOver && "bg-sky-50/80 ring-2 ring-sky-300 ring-inset",
        )}
        {...attachDropProps}
      >
        {!hideHeading || isLoading || isAttachingDrop ? (
          <div className="mb-3 flex items-center justify-between gap-2">
            {!hideHeading ? (
              <h3 className="text-base font-medium text-gray-900">{heading}</h3>
            ) : (
              <span />
            )}
            {isLoading || isReordering || isAttachingDrop ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : null}
          </div>
        ) : null}
        {isAttachDragOver ? (
          <p className="mb-3 text-xs font-medium text-sky-800">
            Drop to attach to {taskId != null ? "this task" : "this project"}
          </p>
        ) : null}
        {attachDropError ? (
          <p className="mb-3 text-xs text-red-600">{attachDropError}</p>
        ) : null}
        {conflictMessage ? (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {conflictMessage}
          </div>
        ) : null}
        {error ? (
          <p className="text-sm text-red-600">
            {error instanceof Error ? error.message : "Failed to load artifacts"}
          </p>
        ) : null}
        {allArtifacts.length === 0 && !isLoading ? (
          addArtifactButton
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={allArtifacts.map((row) => row.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {allArtifacts.map((artifact, index) => {
                  const live = liveByArtifactId.get(artifact.id) ?? null
                  const draft = draftByArtifactId[artifact.id]
                  const liveIsNewer =
                    !!live
                    && live.currentVersion != null
                    && live.currentVersion > (artifact.current_version ?? 0)
                  const isLiveBusy = isArtifactLiveEditLocked(live)
                  // Keep the saved baseline while AI is generating so rich text does not
                  // disappear. Only overlay a newer saved live snapshot after persist.
                  const useLiveContent =
                    !!live
                    && !isLiveBusy
                    && !live.streaming
                    && !!live.contentJson
                    && live.phase === "saved"
                    && liveIsNewer
                  // Only treat draft as stale when a newer AI live snapshot should win.
                  // Version lag after autosave must keep showing local edits (rebase handles save).
                  const draftIsStale = !!draft && liveIsNewer
                  const display: TaskArtifact = {
                    ...artifact,
                    ...(isLiveBusy
                      ? { title: live!.title ?? artifact.title }
                      : {}),
                    ...(useLiveContent
                      ? {
                          title: live!.title ?? artifact.title,
                          content_text: live!.contentText || artifact.content_text,
                          content_json: live!.contentJson ?? artifact.content_json,
                          asset_data: live!.assetData ?? artifact.asset_data,
                          current_version: live!.currentVersion ?? artifact.current_version,
                        }
                      : {}),
                    ...(draft && !draftIsStale
                      ? {
                          content_text: draft.contentText,
                          content_json: draft.contentJson ?? artifact.content_json,
                        }
                      : {}),
                  }
                  // Force key must NOT include draft length / stream heartbeats —
                  // sequence+updatedAt remount TipTap on every preview upsert (cards flash).
                  const editorForceKey = isLiveBusy
                    ? `${artifact.id}:live:${live?.buildId ?? "building"}`
                    : `${artifact.id}:v:${artifact.current_version ?? 0}`
                  const effectivelyExpanded = collapsedStackIds.has(artifact.id)
                    ? false
                    : expandedStackIds.has(artifact.id)
                      || (!collapsedStackTouched && index < 1 && hasFullContentLoaded)
                  // Default Document (editable). Counters toggle into read-only track-changes.
                  // Explicit toggles in stackShowChangesById always win.
                  const showChanges = stackShowChangesById[artifact.id] ?? false
                  return (
                    <SortableArtifactShell
                      key={artifact.id}
                      id={artifact.id}
                      disabled={isReordering || isLiveBusy}
                    >
                      {({ setNodeRef, style, attributes, listeners }) => (
                        <div
                          ref={setNodeRef}
                          style={style}
                          className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
                        >
                          <div className="flex w-full items-center gap-1 px-2 py-2">
                            <button
                              type="button"
                              className="shrink-0 cursor-grab rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 active:cursor-grabbing"
                              aria-label="Drag to reorder"
                              {...attributes}
                              {...listeners}
                            >
                              <GripVertical className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                              aria-expanded={effectivelyExpanded}
                              aria-label={effectivelyExpanded ? "Collapse" : "Expand"}
                              onClick={() => {
                                setCollapsedStackTouched(true)
                                setExpandedStackIds((prev) => {
                                  const next = new Set(prev)
                                  if (effectivelyExpanded) {
                                    next.delete(artifact.id)
                                    setCollapsedStackIds((ids) => new Set(ids).add(artifact.id))
                                  } else {
                                    next.add(artifact.id)
                                    setCollapsedStackIds((ids) => {
                                      const cleared = new Set(ids)
                                      cleared.delete(artifact.id)
                                      return cleared
                                    })
                                  }
                                  return next
                                })
                              }}
                            >
                              <ChevronDown
                                className={cn(
                                  "h-4 w-4 transition-transform",
                                  effectivelyExpanded ? "rotate-0" : "-rotate-90",
                                )}
                                aria-hidden
                              />
                            </button>
                            <div className="min-w-0 flex-1">
                              <input
                                value={titleValueFor(display)}
                                onChange={(event) => {
                                  const value = event.target.value
                                  setTitleDraftById((prev) => ({ ...prev, [artifact.id]: value }))
                                }}
                                onBlur={() => {
                                  void commitTitle(display, titleValueFor(display))
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault()
                                    ;(event.target as HTMLInputElement).blur()
                                  }
                                  if (event.key === "Escape") {
                                    setTitleDraftById((prev) => {
                                      const next = { ...prev }
                                      delete next[artifact.id]
                                      return next
                                    })
                                    ;(event.target as HTMLInputElement).blur()
                                  }
                                }}
                                disabled={isLiveBusy}
                                className="w-full border-0 bg-transparent text-sm font-medium text-gray-900 outline-none focus-visible:ring-0"
                                placeholder="Untitled artifact"
                                aria-label="Artifact title"
                              />
                              <span className="mt-0.5 block text-[11px] text-gray-500">
                                {display.artifact_type ? `${display.artifact_type} · ` : ""}
                                {!isLiveBusy && display.updated_at ? (
                                  <ArtifactVersionHistoryPopover
                                    artifactId={display.id}
                                    align="start"
                                    onRestored={() => {
                                      setDraftByArtifactId((prev) => {
                                        const next = { ...prev }
                                        delete next[display.id]
                                        return next
                                      })
                                      setTitleDraftById((prev) => {
                                        const next = { ...prev }
                                        delete next[display.id]
                                        return next
                                      })
                                    }}
                                    trigger={
                                      <button
                                        type="button"
                                        className="underline decoration-gray-300 underline-offset-2 hover:text-gray-800"
                                        title="Version history"
                                      >
                                        Last saved{" "}
                                        {getActivityRelativeTimeLabel(display.updated_at)}
                                      </button>
                                    }
                                  />
                                ) : isLiveBusy ? (
                                  "generating…"
                                ) : null}
                              </span>
                            </div>
                            <StackArtifactChangeToggle
                              display={display}
                              live={live}
                              isLiveBusy={isLiveBusy}
                              showChanges={showChanges}
                              onToggle={() => {
                                setStackShowChangesById((prev) => ({
                                  ...prev,
                                  [artifact.id]: !showChanges,
                                }))
                              }}
                            />
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                              aria-label="Expand artifact"
                              title="Expand"
                              onClick={() => {
                                openArtifactCenterTab({
                                  artifactId: display.id,
                                  title: display.title,
                                })
                              }}
                            >
                              <Maximize2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-red-50 hover:text-red-700"
                              aria-label="Delete artifact"
                              disabled={isLiveBusy}
                              onClick={() => setPendingDeleteId(display.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {effectivelyExpanded ? (
                            <StackArtifactExpandedBody
                              display={display}
                              live={live}
                              isLiveBusy={isLiveBusy}
                              editorForceKey={editorForceKey}
                              mediaSelectHandlers={mediaSelectHandlers}
                              updateDraft={updateDraft}
                              showChanges={showChanges}
                              openFullscreen={() => {
                                openArtifactCenterTab({
                                  artifactId: display.id,
                                  title: display.title,
                                })
                              }}
                            />
                          ) : null}
                        </div>
                      )}
                    </SortableArtifactShell>
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
        {allArtifacts.length > 0 && !isLoading ? addArtifactButton : null}
        <SelectionAskAiMenu
          containerSelector='[data-ai-selectable="artifact"]'
          resolve={resolveArtifactTextSelection}
          onAsk={(context) => {
            const artifact =
              allArtifactsRef.current.find((row) => row.id === context.artifact_id) ?? null
            attachArtifactSelection(context, artifact)
          }}
        />
        {deleteDialog}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-3 overflow-hidden",
        className,
        canAcceptArtifactAttach
          && "rounded-lg transition-[box-shadow,background-color]",
        isAttachDragOver && "bg-sky-50/80 ring-2 ring-sky-300 ring-inset",
      )}
      {...attachDropProps}
    >
      {!hideHeading || isLoading || isAttachingDrop ? (
        <div className="flex shrink-0 items-center justify-between gap-2">
          {!hideHeading ? (
            <h3 className="text-base font-medium text-gray-900">{heading}</h3>
          ) : (
            <span />
          )}
          {isLoading || isReordering || isAttachingDrop ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          ) : null}
        </div>
      ) : null}

      {isAttachDragOver ? (
        <p className="shrink-0 text-xs font-medium text-sky-800">
          Drop to attach to {taskId != null ? "this task" : "this project"}
        </p>
      ) : null}
      {attachDropError ? (
        <p className="shrink-0 text-xs text-red-600">{attachDropError}</p>
      ) : null}

      {conflictMessage ? (
        <div className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {conflictMessage}
        </div>
      ) : null}

      {error ? (
        <p className="shrink-0 text-sm text-red-600">
          {error instanceof Error ? error.message : "Failed to load artifacts"}
        </p>
      ) : null}

      {allArtifacts.length === 0 && !isLoading ? (
        addArtifactButton
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row">
          <aside className="flex max-h-40 w-full shrink-0 flex-col gap-1.5 overflow-auto lg:max-h-none lg:w-56">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={allArtifacts.map((row) => row.id)}
                strategy={verticalListSortingStrategy}
              >
                {showTaskGroupHeaders && projectOwned.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                      Project
                    </p>
                    {projectOwned.map(renderNavigatorItem)}
                  </div>
                ) : null}
                {showTaskGroupHeaders && taskGrouped.length > 0
                  ? taskGrouped.map(([groupedTaskId, rows]) => (
                      <div key={groupedTaskId} className="space-y-1.5">
                        <p className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                          Task #{groupedTaskId}
                        </p>
                        {rows.map(renderNavigatorItem)}
                      </div>
                    ))
                  : null}
                {!showTaskGroupHeaders
                  || (projectOwned.length === 0 && taskGrouped.length === 0)
                  ? allArtifacts.map(renderNavigatorItem)
                  : null}
              </SortableContext>
            </DndContext>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-gray-200 bg-white">
            {displaySelected ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-gray-100 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <input
                      value={titleValueFor(displaySelected)}
                      onChange={(event) => {
                        const value = event.target.value
                        setTitleDraftById((prev) => ({
                          ...prev,
                          [displaySelected.id]: value,
                        }))
                      }}
                      onBlur={() => {
                        void commitTitle(displaySelected, titleValueFor(displaySelected))
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          ;(event.target as HTMLInputElement).blur()
                        }
                        if (event.key === "Escape") {
                          setTitleDraftById((prev) => {
                            const next = { ...prev }
                            delete next[displaySelected.id]
                            return next
                          })
                          ;(event.target as HTMLInputElement).blur()
                        }
                      }}
                      disabled={!!selectedLive && isArtifactLiveEditLocked(selectedLive)}
                      className="w-full border-0 bg-transparent text-sm font-semibold text-gray-900 outline-none focus-visible:ring-0"
                      placeholder="Untitled artifact"
                      aria-label="Artifact title"
                    />
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      {displaySelected.updated_at ? (
                        <ArtifactVersionHistoryPopover
                          artifactId={displaySelected.id}
                          align="start"
                          onRestored={() => {
                            setDraftByArtifactId((prev) => {
                              const next = { ...prev }
                              delete next[displaySelected.id]
                              return next
                            })
                            setTitleDraftById((prev) => {
                              const next = { ...prev }
                              delete next[displaySelected.id]
                              return next
                            })
                          }}
                          trigger={
                            <button
                              type="button"
                              className="underline decoration-gray-300 underline-offset-2 hover:text-gray-800"
                              title="Version history"
                            >
                              Last saved{" "}
                              {getActivityRelativeTimeLabel(displaySelected.updated_at)}
                            </button>
                          }
                        />
                      ) : null}
                      {selectedLive && isArtifactLiveEditLocked(selectedLive)
                        ? " · live preview"
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-0.5">
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                      aria-label="Expand artifact"
                      title="Expand"
                      onClick={() =>
                        openArtifactCenterTab({
                          artifactId: displaySelected.id,
                          title: displaySelected.title,
                        })
                      }
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-red-50 hover:text-red-700"
                      aria-label="Delete artifact"
                      disabled={!!selectedLive && isArtifactLiveEditLocked(selectedLive)}
                      onClick={() => setPendingDeleteId(displaySelected.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto">
                  <ArtifactDocumentEditor
                    artifact={displaySelected}
                    forceContentKey={
                      selectedLive && isArtifactLiveEditLocked(selectedLive)
                        ? `${displaySelected.id}:live:${selectedLive.sequence}:${selectedLive.updatedAt}`
                        : `${displaySelected.id}:v:${
                            allArtifacts.find((row) => row.id === displaySelected.id)
                              ?.current_version
                              ?? displaySelected.current_version
                              ?? 0
                          }`
                    }
                    readOnly={!!selectedLive && isArtifactLiveEditLocked(selectedLive)}
                    onContentJsonChange={(contentJson) => {
                      updateDraft(displaySelected.id, { contentJson }, displaySelected)
                    }}
                    onContentTextChange={(contentText) => {
                      updateDraft(displaySelected.id, { contentText }, displaySelected)
                    }}
                    onOpenFullscreen={() => {
                      openArtifactCenterTab({
                        artifactId: displaySelected.id,
                        title: displaySelected.title,
                      })
                    }}
                    {...mediaSelectHandlers}
                  />
                </div>
              </div>
            ) : (
              <p className="p-3 text-sm text-gray-500">Select an artifact</p>
            )}
          </div>
        </div>
      )}
      {allArtifacts.length > 0 && !isLoading ? addArtifactButton : null}      <SelectionAskAiMenu
        containerSelector='[data-ai-selectable="artifact"]'
        resolve={resolveArtifactTextSelection}
        onAsk={(context) => {
          const artifact =
            allArtifactsRef.current.find((row) => row.id === context.artifact_id) ?? displaySelected
          attachArtifactSelection(context, artifact)
        }}
      />
      {deleteDialog}
    </div>
  )
}
