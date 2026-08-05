"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  Check,
  Download,
  GitCompare,
  History,
  Link2,
  Loader2,
  Save,
  Trash2,
  X,
} from "lucide-react"
import { usePathname } from "next/navigation"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Popover, PopoverContent, PopoverTrigger } from "../../app/components/ui/popover"
import { toast } from "../../app/components/ui/use-toast"
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
import { cn } from "../../app/lib/utils"
import type {
  ArtifactContentJson,
  ArtifactExportFormat,
  SelectedArtifactContext,
  TaskArtifact,
} from "../../app/lib/artifacts/artifact-types"
import {
  extractArtifactAssets,
  isArtifactRevisionConflictError,
} from "../../app/lib/artifacts/artifact-types"
import {
  deleteArtifact,
  exportArtifactDownload,
  getArtifact,
  listArtifactVersions,
  restoreArtifactVersion,
  saveWorkspaceArtifact,
} from "../../app/lib/services/artifacts"
import { getActivityRelativeTimeLabel } from "../../app/components/activity-row-timestamp"
import { useArtifactsRealtime } from "../../app/hooks/use-artifacts-realtime"
import { useCurrentUserStore } from "../../app/store/current-user"
import { useAiBuildArtifactPreviewStore } from "../../app/store/ai-build-artifact-preview-store"
import { useFollowGrowingContent } from "./use-follow-growing-content"
import { useCenterPaneTabsStore } from "../../app/store/center-pane-tabs"
import { buildCenterPaneTabKey } from "../../app/store/center-pane-tabs"
import {
  ARTIFACT_HISTORY_PARAM,
  ARTIFACT_VERSION_PARAM,
  buildArtifactPath,
  getArtifactHistoryOpenFromParams,
} from "../../app/lib/artifact-selection-url"
import { buildCenterPaneSelectionSearchParams } from "../../app/lib/center-pane-selection-url"
import { shallowReplaceSearchParams } from "../../app/lib/tasks-shallow-nav"
import { SelectionAskAiMenu } from "../ai-chat/SelectionAskAiMenu"
import { computeRangeTextParts } from "../ai-chat/ai-chat-text-selection"
import {
  artifactDiffPlainFromContent,
  extractPrimaryArtifactHtml,
} from "../../app/lib/artifact-selection-patch"
import { ArtifactDocumentEditor } from "./artifact-document-editor"
import { ArtifactCommentsDock } from "./artifact-comments-dock"
import { ArtifactFindReplacePopover } from "./artifact-find-replace-popover"
import { ArtifactSeoDock } from "./artifact-seo-dock"
import { ArtifactVersionHistoryList } from "./artifact-version-history-popover"
import { ArtifactRichDiffBody } from "./artifact-rich-diff-body"
import {
  buildComponentPreviewDiff,
  computeDiffCharStats,
  hasRenderableDiff,
} from "../tasks/utils/component-content-diff"
import { exportArtifactAsDocx } from "./artifact-docx-export"
import {
  openArtifactSelectionInAiPane,
} from "./open-artifact-selection-in-ai-pane"
import { computeArtifactContentHash } from "./artifact-selection"
import { artifactHasAnnotatableMedia } from "./artifact-media-annotate-dialog"
import debounce from "lodash.debounce"

export type ArtifactPaneProps = {
  artifactId: string
  version?: number | null
  onClose?: () => void
  className?: string
}

const DOWNLOAD_FORMATS: Array<{ format: ArtifactExportFormat; label: string }> = [
  { format: "docx", label: "Word (.docx)" },
  { format: "html", label: "HTML" },
  { format: "md", label: "Markdown" },
  { format: "txt", label: "Plain text" },
  { format: "json", label: "JSON" },
  { format: "original", label: "Original asset" },
]

/**
 * Canonical artifact center-pane tab: identity is `artifact:<id>` (version is viewer state only).
 */
export function ArtifactPane({
  artifactId,
  version = null,
  onClose,
  className,
}: ArtifactPaneProps) {
  const queryClient = useQueryClient()
  const pathname = usePathname() || "/"
  const supabase = useMemo(() => createClientComponentClient(), [])
  const currentUserId = useCurrentUserStore((s) => s.publicUserId)
  const upsertCenterTab = useCenterPaneTabsStore((s) => s.upsertTab)
  const updateTitle = useCenterPaneTabsStore((s) => s.updateTitle)
  const closeCenterTab = useCenterPaneTabsStore((s) => s.closeTab)

  const [draftTitle, setDraftTitle] = useState("")
  const [draftContentJson, setDraftContentJson] = useState<ArtifactContentJson | null>(null)
  const [draftContentText, setDraftContentText] = useState<string | null>(null)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showVersions, setShowVersions] = useState(() => {
    if (typeof window === "undefined") return false
    return getArtifactHistoryOpenFromParams(new URLSearchParams(window.location.search))
  })
  const [showDownloadMenu, setShowDownloadMenu] = useState(false)
  /** Show previous→current changes in the document body (not a separate top panel). */
  const [showChanges, setShowChanges] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const linkCopiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftTitleRef = useRef(draftTitle)
  const draftContentJsonRef = useRef(draftContentJson)
  const draftContentTextRef = useRef(draftContentText)
  /** Ignore TipTap onChange while applying server/AI content so stale editor HTML cannot overwrite the draft. */
  const applyingServerContentRef = useRef(false)
  const [editorForceNonce, setEditorForceNonce] = useState(0)
  draftTitleRef.current = draftTitle
  draftContentJsonRef.current = draftContentJson
  draftContentTextRef.current = draftContentText

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (!getArtifactHistoryOpenFromParams(params)) return
    setShowVersions(true)
  }, [artifactId, pathname])

  useEffect(() => {
    if (!showVersions) return
    const next = new URLSearchParams(window.location.search)
    if (!next.has(ARTIFACT_HISTORY_PARAM)) return
    next.delete(ARTIFACT_HISTORY_PARAM)
    shallowReplaceSearchParams(pathname, next, "artifact-history-consumed")
  }, [pathname, showVersions])

  const artifactQuery = useQuery({
    queryKey: ["artifact", artifactId, version ?? "current"],
    queryFn: () => getArtifact({ artifactId, versionNumber: version }),
    enabled: !!artifactId,
    staleTime: 0,
    refetchOnMount: "always",
  })

  const versionsQuery = useQuery({
    queryKey: ["artifact-versions", artifactId],
    queryFn: () => listArtifactVersions({ artifactId, limit: 50 }),
    enabled: !!artifactId && showVersions,
    staleTime: 30_000,
  })

  const livePreviews = useAiBuildArtifactPreviewStore((s) => s.previews)
  const pruneConsumedSavedPreviews = useAiBuildArtifactPreviewStore(
    (s) => s.pruneConsumedSavedPreviews,
  )
  const livePreview = useMemo(() => {
    let best: (typeof livePreviews)[string] | null = null
    for (const entry of Object.values(livePreviews)) {
      if (entry.artifactId !== artifactId) continue
      if (!best) {
        best = entry
        continue
      }
      const bestVersion = best.currentVersion ?? 0
      const entryVersion = entry.currentVersion ?? 0
      if (entryVersion !== bestVersion) {
        if (entryVersion > bestVersion) best = entry
        continue
      }
      if (entry.updatedAt !== best.updatedAt) {
        if (entry.updatedAt > best.updatedAt) best = entry
        continue
      }
      if (entry.sequence > best.sequence) best = entry
    }
    return best
  }, [artifactId, livePreviews])

  const isLiveAi =
    !!livePreview
    && livePreview.phase !== "saved"
    && livePreview.phase !== "failed"

  const snapshot = artifactQuery.data?.snapshot ?? null

  useEffect(() => {
    const version = snapshot?.current_version
    if (version == null || version <= 0) return
    pruneConsumedSavedPreviews(artifactId, version)
  }, [artifactId, pruneConsumedSavedPreviews, snapshot?.current_version])
  const viewedVersionNumber =
    version
    ?? snapshot?.current_version
    ?? livePreview?.currentVersion
    ?? null
  const previousVersionNumber =
    viewedVersionNumber != null && viewedVersionNumber > 1
      ? viewedVersionNumber - 1
      : null

  const previousVersionQuery = useQuery({
    queryKey: ["artifact", artifactId, previousVersionNumber ?? "none"],
    queryFn: () => getArtifact({ artifactId, versionNumber: previousVersionNumber }),
    enabled: !!artifactId && previousVersionNumber != null && !isLiveAi,
    staleTime: 60_000,
  })
  const displayArtifact = useMemo<TaskArtifact | null>(() => {
    if (!snapshot) return null
    // Only overlay in-progress AI preview onto the open editor. Once saved,
    // trust the queried snapshot so we don't stick on a stale preview version.
    const useLiveContent =
      !!livePreview
      && isLiveAi
      && !livePreview.streaming
      && !!livePreview.contentJson
      && livePreview.phase === "preview"
    if (!useLiveContent || !livePreview) {
      return isLiveAi && livePreview
        ? { ...snapshot, title: livePreview.title ?? snapshot.title }
        : snapshot
    }
    return {
      ...snapshot,
      title: livePreview.title ?? snapshot.title,
      content_text: livePreview.contentText || snapshot.content_text,
      content_json: livePreview.contentJson ?? snapshot.content_json,
      asset_data: livePreview.assetData ?? snapshot.asset_data,
      current_version: livePreview.currentVersion ?? snapshot.current_version,
      project_id: snapshot.project_id,
      task_id: livePreview.taskId ?? snapshot.task_id,
      channel_id: livePreview.channelId ?? snapshot.channel_id,
      language_id: livePreview.languageId ?? snapshot.language_id,
      ai_thread_id: livePreview.aiThreadId ?? snapshot.ai_thread_id,
      artifact_type: livePreview.artifactType ?? snapshot.artifact_type,
      artifact_role: livePreview.artifactRole ?? snapshot.artifact_role,
    }
  }, [isLiveAi, livePreview, snapshot])

  const bindingQuery = useQuery({
    queryKey: [
      "artifact-bindings",
      displayArtifact?.task_id ?? null,
      displayArtifact?.project_id ?? null,
    ],
    enabled: !!displayArtifact && (
      displayArtifact.task_id != null
      || displayArtifact.project_id != null
    ),
    staleTime: 60_000,
    queryFn: async () => {
      const taskId = displayArtifact?.task_id ?? null
      const projectId = displayArtifact?.project_id ?? null
      const [taskRes, projectRes] = await Promise.all([
        taskId != null
          ? supabase.from("tasks").select("id, title").eq("id", taskId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        projectId != null
          ? supabase.from("projects").select("id, name").eq("id", projectId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])
      return {
        taskTitle: typeof taskRes.data?.title === "string" ? taskRes.data.title.trim() : null,
        projectName: typeof projectRes.data?.name === "string" ? projectRes.data.name.trim() : null,
      }
    },
  })

  const openBoundTask = (taskId: number) => {
    upsertCenterTab({ kind: "task", id: String(taskId), title: bindingQuery.data?.taskTitle })
    const current = new URLSearchParams(window.location.search)
    const next = buildCenterPaneSelectionSearchParams({
      currentSearchParams: current,
      entity: "task",
      id: taskId,
    })
    shallowReplaceSearchParams(pathname, next, "artifact-open-task")
  }

  const openBoundProject = (projectId: number) => {
    upsertCenterTab({
      kind: "project",
      id: String(projectId),
      title: bindingQuery.data?.projectName,
    })
    const current = new URLSearchParams(window.location.search)
    const next = buildCenterPaneSelectionSearchParams({
      currentSearchParams: current,
      entity: "project",
      id: projectId,
    })
    shallowReplaceSearchParams(pathname, next, "artifact-open-project")
  }

  useArtifactsRealtime({
    artifactId,
    taskId: displayArtifact?.task_id,
    projectId: displayArtifact?.project_id,
    aiThreadId: displayArtifact?.ai_thread_id,
    enabled: !!artifactId,
  })

  useEffect(() => {
    if (!displayArtifact) return
    applyingServerContentRef.current = true
    setDraftTitle(displayArtifact.title ?? "")
    setDraftContentJson(displayArtifact.content_json)
    setDraftContentText(displayArtifact.content_text)
    const title = displayArtifact.title?.trim()
    if (title) {
      updateTitle(buildCenterPaneTabKey("artifact", artifactId), title)
    }
    const clear = window.setTimeout(() => {
      applyingServerContentRef.current = false
    }, 50)
    return () => window.clearTimeout(clear)
  }, [
    artifactId,
    displayArtifact?.id,
    displayArtifact?.current_version,
    displayArtifact?.title,
    displayArtifact?.content_json,
    displayArtifact?.content_text,
    updateTitle,
  ])

  /** TipTap remount/force key from authoritative snapshot (not local draft keystrokes). */
  const editorForceContentKey = useMemo(() => {
    if (!displayArtifact) return `${artifactId}:0`
    const html = extractPrimaryArtifactHtml(displayArtifact.content_json) ?? ""
    const text = displayArtifact.content_text ?? ""
    const fingerprint = computeArtifactContentHash(html || text)
    return `${displayArtifact.id}:${displayArtifact.current_version ?? 0}:${fingerprint}:${editorForceNonce}`
  }, [artifactId, displayArtifact, editorForceNonce])

  const assets = useMemo(
    () => (displayArtifact ? extractArtifactAssets(displayArtifact.asset_data) : []),
    [displayArtifact],
  )

  const setVersionInUrl = (nextVersion: number | null) => {
    const next = new URLSearchParams(window.location.search)
    if (nextVersion != null && nextVersion > 0) next.set(ARTIFACT_VERSION_PARAM, String(nextVersion))
    else next.delete(ARTIFACT_VERSION_PARAM)
    shallowReplaceSearchParams(pathname, next, "artifact-version")
  }

  const saveInFlightRef = useRef(false)
  const pendingAutosaveRef = useRef(false)
  /** Newest server version observed (list/get/conflict). Never save below this. */
  const knownServerVersionRef = useRef(0)
  /** Pause autosave after a conflict until the query refreshes. */
  const conflictCooldownUntilRef = useRef(0)
  const handleSaveRef = useRef(async () => {})
  const debouncedAutosaveRef = useRef(
    debounce(() => {
      void handleSaveRef.current()
    }, 600),
  )

  useEffect(() => {
    const version = displayArtifact?.current_version ?? 0
    if (version > knownServerVersionRef.current) {
      knownServerVersionRef.current = version
    }
  }, [displayArtifact?.current_version])

  useEffect(() => {
    const debounced = debouncedAutosaveRef.current
    return () => {
      debounced.cancel()
    }
  }, [])

  const handleSave = async () => {
    if (!displayArtifact) return
    if (Date.now() < conflictCooldownUntilRef.current) return
    if (saveInFlightRef.current) {
      pendingAutosaveRef.current = true
      return
    }
    const expectedVersion = Math.max(
      displayArtifact.current_version ?? 0,
      knownServerVersionRef.current,
    )
    if (expectedVersion <= 0) return
    // Drop no-op autosaves (TipTap echo after force-sync).
    const nextText = draftContentTextRef.current ?? displayArtifact.content_text
    const nextJson = draftContentJsonRef.current ?? displayArtifact.content_json
    if (
      nextText === displayArtifact.content_text
      && JSON.stringify(nextJson) === JSON.stringify(displayArtifact.content_json)
      && (draftTitleRef.current.trim() || displayArtifact.title) === displayArtifact.title
    ) {
      return
    }

    saveInFlightRef.current = true
    setIsSaving(true)
    setConflictMessage(null)
    try {
      const result = await saveWorkspaceArtifact({
        artifactId: displayArtifact.id,
        expectedVersion,
        snapshot: {
          title: draftTitleRef.current.trim() || displayArtifact.title,
          status: displayArtifact.status,
          content_text: nextText,
          content_json: nextJson,
          asset_data: displayArtifact.asset_data,
        },
        changeSource: "manual",
        changedBy: currentUserId,
        aiThreadId: displayArtifact.ai_thread_id,
      })
      if (
        isArtifactRevisionConflictError(result) ||
        ("code" in result && result.code === "artifact_revision_conflict")
      ) {
        const conflict = result as {
          expected_version: number | null
          current_version: number | null
        }
        pendingAutosaveRef.current = false
        debouncedAutosaveRef.current.cancel()
        conflictCooldownUntilRef.current = Date.now() + 8_000
        if (conflict.current_version != null && conflict.current_version > 0) {
          knownServerVersionRef.current = Math.max(
            knownServerVersionRef.current,
            conflict.current_version,
          )
        }
        setConflictMessage(
          `Someone else saved a newer version. Reloading the latest content…`,
        )
        await getArtifact({ artifactId })
        await queryClient.invalidateQueries({ queryKey: ["artifact", artifactId] })
        await queryClient.invalidateQueries({ queryKey: ["artifact-versions", artifactId] })
        await queryClient.invalidateQueries({ queryKey: ["task-artifacts"] })
        await queryClient.invalidateQueries({ queryKey: ["project-artifacts"] })
        return
      }
      if ("version_number" in result && typeof result.version_number === "number") {
        knownServerVersionRef.current = Math.max(
          knownServerVersionRef.current,
          result.version_number,
        )
      }
      await queryClient.invalidateQueries({ queryKey: ["artifact", artifactId] })
      await queryClient.invalidateQueries({ queryKey: ["artifact-versions", artifactId] })
      await queryClient.invalidateQueries({ queryKey: ["task-artifacts"] })
      await queryClient.invalidateQueries({ queryKey: ["project-artifacts"] })
      setVersionInUrl(null)
    } catch (error) {
      setConflictMessage(error instanceof Error ? error.message : "Failed to save artifact")
    } finally {
      setIsSaving(false)
      saveInFlightRef.current = false
      if (
        pendingAutosaveRef.current
        && Date.now() >= conflictCooldownUntilRef.current
      ) {
        pendingAutosaveRef.current = false
        void handleSaveRef.current()
      } else {
        pendingAutosaveRef.current = false
      }
    }
  }

  handleSaveRef.current = handleSave

  const scheduleAutosave = () => {
    if (Date.now() < conflictCooldownUntilRef.current) return
    if (applyingServerContentRef.current) return
    debouncedAutosaveRef.current()
  }

  const handleDownload = async (format: ArtifactExportFormat, attachmentId?: string | null) => {
    setDownloadError(null)
    setShowDownloadMenu(false)
    try {
      if (format === "docx") {
        if (!displayArtifact) throw new Error("Artifact not loaded")
        await exportArtifactAsDocx({
          artifact: {
            id: artifactId,
            title: draftTitle || displayArtifact.title,
            content_json: draftContentJson ?? displayArtifact.content_json,
            content_text: draftContentText ?? displayArtifact.content_text,
          },
        })
        return
      }
      await exportArtifactDownload({
        artifactId,
        versionNumber: version ?? displayArtifact?.current_version ?? null,
        format,
        attachmentId,
      })
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Download failed")
    }
  }

  const handleCopyShareLink = async () => {
    try {
      const path = buildArtifactPath(artifactId, version ?? null)
      const url =
        typeof window !== "undefined"
          ? `${window.location.origin}${path}`
          : path
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
      if (linkCopiedTimeoutRef.current) clearTimeout(linkCopiedTimeoutRef.current)
      linkCopiedTimeoutRef.current = setTimeout(() => setLinkCopied(false), 1600)
      toast({ title: "Link copied", description: "Share link is on your clipboard." })
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Could not copy link")
    }
  }

  useEffect(() => {
    return () => {
      if (linkCopiedTimeoutRef.current) clearTimeout(linkCopiedTimeoutRef.current)
    }
  }, [])

  const handleDelete = async () => {
    setIsDeleting(true)
    setConflictMessage(null)
    try {
      await deleteArtifact({ artifactId })
      setShowDeleteConfirm(false)
      await queryClient.invalidateQueries({ queryKey: ["artifact", artifactId] })
      await queryClient.invalidateQueries({ queryKey: ["task-artifacts"] })
      await queryClient.invalidateQueries({ queryKey: ["project-artifacts"] })
      await queryClient.invalidateQueries({ queryKey: ["ai-thread-artifacts"] })
      closeCenterTab(buildCenterPaneTabKey("artifact", artifactId))
      onClose?.()
    } catch (error) {
      setConflictMessage(error instanceof Error ? error.message : "Failed to delete artifact")
    } finally {
      setIsDeleting(false)
    }
  }

  const attachArtifactSelection = useCallback(
    (context: SelectedArtifactContext, artifact?: TaskArtifact | null) => {
      void openArtifactSelectionInAiPane({
        context,
        taskId: artifact?.task_id ?? null,
        projectId: artifact?.project_id ?? null,
        channelId: artifact?.channel_id ?? null,
      })
      toast({
        title: "Sent to AI chat",
        description: "Selection attached in the composer — add a note and send.",
      })
    },
    [],
  )

  const resolveArtifactTextSelection = useCallback(
    (container: HTMLElement, range: Range): SelectedArtifactContext | null => {
      const resolvedArtifactId = container.getAttribute("data-artifact-id")?.trim()
      if (!resolvedArtifactId) return null
      const versionNumber = Number(container.getAttribute("data-artifact-version") ?? 0) || 0
      const title = container.getAttribute("data-artifact-title")
      const parts = computeRangeTextParts(container, range)
      if (!parts.selected_text.trim()) return null
      return {
        source_type: "task_artifact",
        artifact_id: resolvedArtifactId,
        artifact_version_number: versionNumber,
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

  const isLivePreview = isLiveAi
  const bodyScrollRef = useRef<HTMLDivElement | null>(null)
  const liveContentKey = `${livePreview?.sequence ?? 0}:${(livePreview?.contentText ?? displayArtifact?.content_text ?? "").length}`
  useFollowGrowingContent({
    containerRef: bodyScrollRef,
    contentKey: liveContentKey,
    enabled: isLivePreview,
  })

  const changeDiff = useMemo(() => {
    if (!displayArtifact) return null
    // Live AI: section-scoped before/after from the worker, shown in the body.
    if (isLiveAi && livePreview) {
      const beforeHtml = livePreview.sectionBeforeHtml?.trim() || null
      const afterHtml =
        livePreview.sectionHtml?.trim()
        || livePreview.streamSnippet?.trim()
        || null
      return {
        beforeText: beforeHtml || livePreview.beforeContentText,
        beforeContentJson: beforeHtml ? null : livePreview.beforeContentJson,
        afterText:
          afterHtml
          || livePreview.diffContentText
          || livePreview.contentText
          || displayArtifact.content_text,
        afterContentJson: afterHtml ? null : (livePreview.contentJson ?? displayArtifact.content_json),
        label: livePreview.targetSectionHeading
          ? `AI edit · ${livePreview.targetSectionHeading}`
          : "AI edit in progress",
      }
    }
    // Settled view: always compare previous version → viewed version from DB.
    const previous = previousVersionQuery.data?.snapshot
    if (!previous || previousVersionNumber == null || viewedVersionNumber == null) return null
    return {
      beforeText: previous.content_text,
      beforeContentJson: previous.content_json,
      afterText: draftContentText ?? displayArtifact.content_text,
      afterContentJson: draftContentJson ?? displayArtifact.content_json,
      label: "Recent changes",
    }
  }, [
    displayArtifact,
    draftContentJson,
    draftContentText,
    isLiveAi,
    livePreview,
    previousVersionNumber,
    previousVersionQuery.data?.snapshot,
    viewedVersionNumber,
  ])

  const changeDiffLines = useMemo(() => {
    if (!changeDiff) return []
    const beforePlain = artifactDiffPlainFromContent(
      changeDiff.beforeText,
      changeDiff.beforeContentJson,
    )
    const afterPlain = artifactDiffPlainFromContent(
      changeDiff.afterText,
      changeDiff.afterContentJson,
    )
    if (!beforePlain || !afterPlain || beforePlain === afterPlain) return []
    return buildComponentPreviewDiff({
      operation: "replace",
      beforeText: beforePlain,
      afterText: afterPlain,
    })
  }, [changeDiff])

  const hasChangeDiff = hasRenderableDiff(changeDiffLines)

  const changeDiffStats = useMemo(() => {
    if (!changeDiff || !hasChangeDiff) return null
    const beforePlain = artifactDiffPlainFromContent(
      changeDiff.beforeText,
      changeDiff.beforeContentJson,
    )
    const afterPlain = artifactDiffPlainFromContent(
      changeDiff.afterText,
      changeDiff.afterContentJson,
    )
    if (!beforePlain || !afterPlain) return null
    return computeDiffCharStats(beforePlain, afterPlain)
  }, [changeDiff, hasChangeDiff])

  // Show recent changes in the document body by default when a prior version differs.
  // Media creatives stay on the interactive document so annotate/click-point remains available.
  useEffect(() => {
    if (!displayArtifact) {
      setShowChanges(false)
      return
    }
    if (artifactHasAnnotatableMedia(displayArtifact)) {
      setShowChanges(false)
      return
    }
    setShowChanges(hasChangeDiff)
  }, [hasChangeDiff, artifactId, version, displayArtifact])

  if (artifactQuery.isLoading) {
    return (
      <div className={cn("flex h-full items-center justify-center text-gray-500", className)}>
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (artifactQuery.error || !displayArtifact) {
    return (
      <div className={cn("flex h-full flex-col items-center justify-center gap-2 p-6", className)}>
        <p className="text-sm text-red-600">
          {artifactQuery.error instanceof Error
            ? artifactQuery.error.message
            : "Artifact not found"}
        </p>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-50 hover:text-gray-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    )
  }

  const channelName =
    typeof displayArtifact.metadata?.channel_name === "string"
      ? displayArtifact.metadata.channel_name
      : null
  const languageName =
    typeof displayArtifact.metadata?.language_name === "string"
      ? displayArtifact.metadata.language_name
      : null

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-white", className)}>
      <div className="shrink-0 border-b border-gray-200 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <input
              value={draftTitle}
              onChange={(event) => {
                setDraftTitle(event.target.value)
                scheduleAutosave()
              }}
              className="w-full border-0 bg-transparent text-lg font-semibold text-gray-900 outline-none focus-visible:ring-0"
              placeholder="Untitled artifact"
            />
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              {displayArtifact.updated_at ? (
                <button
                  type="button"
                  className="underline decoration-gray-300 underline-offset-2 hover:text-gray-800"
                  onClick={() => setShowVersions(true)}
                  title="Open version history"
                >
                  Edited {getActivityRelativeTimeLabel(displayArtifact.updated_at)}
                </button>
              ) : null}
              {displayArtifact.task_id != null ? (
                <button
                  type="button"
                  className="max-w-[14rem] truncate rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 hover:underline"
                  title="Open task in center pane"
                  onClick={() => openBoundTask(displayArtifact.task_id!)}
                >
                  Task · {bindingQuery.data?.taskTitle || `#${displayArtifact.task_id}`}
                </button>
              ) : null}
              {displayArtifact.project_id != null ? (
                <button
                  type="button"
                  className="max-w-[12rem] truncate rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 hover:underline"
                  title="Open project in center pane"
                  onClick={() => openBoundProject(displayArtifact.project_id!)}
                >
                  Project · {bindingQuery.data?.projectName || `#${displayArtifact.project_id}`}
                </button>
              ) : null}
              {isLivePreview ? (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">Live preview</span>
              ) : null}
              {channelName || displayArtifact.channel_id != null ? (
                <span>Channel {channelName || `#${displayArtifact.channel_id}`}</span>
              ) : null}
              {languageName || displayArtifact.language_id != null ? (
                <span>Language {languageName || `#${displayArtifact.language_id}`}</span>
              ) : null}
            </div>
            {(displayArtifact.source_artifact_id || displayArtifact.derivation_type) && (
              <p className="text-[11px] text-gray-500">
                {displayArtifact.derivation_type
                  ? `Derived (${displayArtifact.derivation_type})`
                  : "Derived"}
                {displayArtifact.source_artifact_id
                  ? ` from ${displayArtifact.source_artifact_id.slice(0, 8)}…`
                  : ""}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isLivePreview || isSaving}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
              title="Save"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Save className="h-3.5 w-3.5" aria-hidden />
              )}
              <span>{isSaving ? "Saving…" : "Save"}</span>
            </button>
            {hasChangeDiff ? (
              <button
                type="button"
                onClick={() => setShowChanges((value) => !value)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium",
                  showChanges
                    ? "bg-amber-50 text-amber-900 hover:bg-amber-100"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                )}
                aria-pressed={showChanges}
                title={showChanges ? "Show document" : "Show changes in document"}
              >
                <GitCompare className="h-3.5 w-3.5" aria-hidden />
                <span>{showChanges ? "Document" : "Changes"}</span>
                {changeDiffStats ? (
                  <span className="inline-flex items-center gap-1 font-normal">
                    {changeDiffStats.added > 0 ? (
                      <span className="text-emerald-700">+{changeDiffStats.added}</span>
                    ) : null}
                    {changeDiffStats.removed > 0 ? (
                      <span className="text-red-700">−{changeDiffStats.removed}</span>
                    ) : null}
                  </span>
                ) : null}
              </button>
            ) : null}
            <ArtifactFindReplacePopover
              contentJson={draftContentJson ?? displayArtifact.content_json}
              contentText={draftContentText ?? displayArtifact.content_text}
              disabled={isLivePreview || showChanges}
              onApply={({ contentJson, contentText }) => {
                if (isLivePreview) return
                applyingServerContentRef.current = true
                setDraftContentJson(contentJson)
                setDraftContentText(contentText)
                setEditorForceNonce((n) => n + 1)
                scheduleAutosave()
                window.setTimeout(() => {
                  applyingServerContentRef.current = false
                }, 50)
              }}
            />
            <button
              type="button"
              onClick={() => void handleCopyShareLink()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              aria-label={linkCopied ? "Link copied" : "Copy share link"}
              title={linkCopied ? "Copied!" : "Copy share link"}
            >
              {linkCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Link2 className="h-3.5 w-3.5" />}
            </button>
            <Popover open={showVersions} onOpenChange={setShowVersions}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  aria-label="Version history"
                  title="Version history"
                >
                  <History className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="z-[120] w-[min(92vw,22rem)] p-2">
                <ArtifactVersionHistoryList
                  isLoading={versionsQuery.isLoading}
                  versions={versionsQuery.data?.versions ?? []}
                  onView={(versionNumber) => {
                    setVersionInUrl(versionNumber)
                    setShowVersions(false)
                  }}
                  onRestore={(versionNumber) => {
                    void restoreArtifactVersion({
                      artifactId,
                      versionNumber,
                    }).then(async () => {
                      await queryClient.invalidateQueries({ queryKey: ["artifact", artifactId] })
                      await queryClient.invalidateQueries({
                        queryKey: ["artifact-versions", artifactId],
                      })
                      setVersionInUrl(null)
                      setShowVersions(false)
                    })
                  }}
                />
              </PopoverContent>
            </Popover>
            <Popover open={showDownloadMenu} onOpenChange={setShowDownloadMenu}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  aria-label="Download"
                  title="Download"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="z-[120] w-44 p-1">
                {DOWNLOAD_FORMATS.map((entry) => (
                  <button
                    key={entry.format}
                    type="button"
                    className="block w-full rounded-sm px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                    onClick={() => {
                      if (entry.format === "original" && assets.length > 1) {
                        setDownloadError(
                          "This artifact has multiple assets — use Download next to each asset.",
                        )
                        setShowDownloadMenu(false)
                        return
                      }
                      void handleDownload(
                        entry.format,
                        entry.format === "original" ? assets[0]?.attachment_id : null,
                      )
                    }}
                  >
                    {entry.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isLivePreview || isDeleting}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              aria-label="Delete"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
        {conflictMessage ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="space-y-1">
              <p>{conflictMessage}</p>
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setConflictMessage(null)
                  void queryClient.invalidateQueries({ queryKey: ["artifact", artifactId] })
                  setVersionInUrl(null)
                }}
              >
                Reload current version
              </button>
            </div>
          </div>
        ) : null}
        {downloadError ? (
          <p className="mt-2 text-xs text-red-600">{downloadError}</p>
        ) : null}
      </div>

      <div ref={bodyScrollRef} className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex max-w-3xl flex-col">
          {showChanges && hasChangeDiff && changeDiff ? (
            <ArtifactRichDiffBody
              beforeText={changeDiff.beforeText}
              beforeContentJson={changeDiff.beforeContentJson}
              afterText={changeDiff.afterText}
              afterContentJson={changeDiff.afterContentJson}
              label={changeDiff.label || "Recent changes"}
              addedChars={changeDiffStats?.added ?? 0}
              removedChars={changeDiffStats?.removed ?? 0}
            />
          ) : (
            <ArtifactDocumentEditor
              artifact={{
                ...displayArtifact,
                title: draftTitle,
                content_json: draftContentJson ?? displayArtifact.content_json,
                content_text: draftContentText ?? displayArtifact.content_text,
              }}
              forceContentKey={editorForceContentKey}
              readOnly={isLivePreview}
              onSelectImagePoint={({ attachmentId, x, y }) => {
                attachArtifactSelection(
                  {
                    source_type: "task_artifact",
                    artifact_id: displayArtifact.id,
                    artifact_version_number: displayArtifact.current_version ?? 0,
                    anchor_type: "image_point",
                    attachment_id: attachmentId,
                    anchor_x: x,
                    anchor_y: y,
                    title: displayArtifact.title,
                  },
                  displayArtifact,
                )
              }}
              onSelectImageRect={({ attachmentId, x, y, width, height }) => {
                attachArtifactSelection(
                  {
                    source_type: "task_artifact",
                    artifact_id: displayArtifact.id,
                    artifact_version_number: displayArtifact.current_version ?? 0,
                    anchor_type: "image_rect",
                    attachment_id: attachmentId,
                    anchor_x: x,
                    anchor_y: y,
                    anchor_width: width,
                    anchor_height: height,
                    title: displayArtifact.title,
                  },
                  displayArtifact,
                )
              }}
              onSelectVideoTime={({ attachmentId, timeStart, timeEnd }) => {
                attachArtifactSelection(
                  {
                    source_type: "task_artifact",
                    artifact_id: displayArtifact.id,
                    artifact_version_number: displayArtifact.current_version ?? 0,
                    anchor_type: "video_time",
                    attachment_id: attachmentId,
                    anchor_time_start: timeStart,
                    anchor_time_end: timeEnd ?? timeStart,
                    title: displayArtifact.title,
                  },
                  displayArtifact,
                )
              }}
              onSelectAsset={(attachmentId) => {
                attachArtifactSelection(
                  {
                    source_type: "task_artifact",
                    artifact_id: displayArtifact.id,
                    artifact_version_number: displayArtifact.current_version ?? 0,
                    anchor_type: "asset",
                    attachment_id: attachmentId,
                    title: displayArtifact.title,
                  },
                  displayArtifact,
                )
              }}
              onContentJsonChange={(contentJson) => {
                if (isLivePreview || applyingServerContentRef.current) return
                setDraftContentJson(contentJson)
                scheduleAutosave()
              }}
              onContentTextChange={(contentText) => {
                if (isLivePreview || applyingServerContentRef.current) return
                setDraftContentText(contentText)
                scheduleAutosave()
              }}
            />
          )}

          {assets.length > 1 ? (
            <div className="space-y-1.5 px-4 py-4">
              <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Asset downloads
              </h3>
              {assets.map((asset) => (
                <button
                  key={asset.attachment_id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                  onClick={() => void handleDownload("original", asset.attachment_id)}
                >
                  <span className="truncate">
                    {asset.file_name || asset.caption || asset.attachment_id}
                  </span>
                  <Download className="h-3.5 w-3.5 shrink-0" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <ArtifactCommentsDock artifact={displayArtifact} />

      <ArtifactSeoDock
        artifactId={displayArtifact.id}
        artifactVersion={displayArtifact.current_version ?? 0}
        artifactTitle={draftTitle || displayArtifact.title}
        taskId={displayArtifact.task_id}
        projectId={displayArtifact.project_id}
        channelId={displayArtifact.channel_id}
        contentText={draftContentText ?? displayArtifact.content_text}
        contentJson={draftContentJson ?? displayArtifact.content_json}
        readOnly={isLivePreview}
        onContentChange={({ contentText, contentJson }) => {
          if (isLivePreview) return
          setDraftContentText(contentText)
          setDraftContentJson(contentJson)
          scheduleAutosave()
        }}
      />

      <SelectionAskAiMenu
        containerSelector='[data-ai-selectable="artifact"]'
        resolve={resolveArtifactTextSelection}
        onAsk={(context) => {
          attachArtifactSelection(context, displayArtifact)
        }}
      />

      <AlertDialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setShowDeleteConfirm(false)
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
              className="bg-red-600 hover:bg-red-700"
              onClick={(event) => {
                event.preventDefault()
                void handleDelete()
              }}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
