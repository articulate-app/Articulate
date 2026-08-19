"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Download,
  GitCompare,
  History,
  Link2,
  Loader2,
  MoreHorizontal,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { usePathname } from "next/navigation"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../../app/components/ui/dropdown-menu"
import { toast } from "../../app/components/ui/use-toast"
import {
  PANE_CHROME_ICON_BUTTON_CLASS,
  PANE_CHROME_ICON_CLASS,
} from "../../app/components/tasks/pane-header-tokens"
import {
  artifactPlainText,
  countWords,
  formatCharCountLabel,
  formatWordCountLabel,
} from "./artifact-content-stats"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../app/components/ui/dialog"
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
import { useOverflowGutterWidth } from "../../app/hooks/use-overflow-gutter-width"
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
import { ArtifactDocumentEditor } from "./artifact-document-editor"
import { ArtifactCommentsDock, type ArtifactCommentPendingSelection } from "./artifact-comments-dock"
import { ArtifactFindReplacePopover } from "./artifact-find-replace-popover"
import { ArtifactSeoDock } from "./artifact-seo-dock"
import { ArtifactVersionHistoryList } from "./artifact-version-history-popover"
import { ArtifactRichDiffBody } from "./artifact-rich-diff-body"
import {
  progressiveLiveAfterHtml,
  resolveArtifactChangeSides,
} from "./resolve-artifact-change-diff"
import {
  buildHtmlEmailContentJson,
  isHtmlEmailArtifact,
} from "./artifact-html-document"
import {
  applyArtifactCachePatch,
  artifactCachePatchFromSavedLivePreview,
} from "./artifact-query-cache"
import {
  isArtifactDraftStaleForServerVersion,
  isOwnArtifactSaveEcho,
  resolveArtifactDraftExpectedVersion,
  resolveSavedLiveArtifactBase,
} from "./artifact-live-save-base"
import { isArtifactLiveEditLocked } from "./artifact-live-edit-lock"
import {
  canAutosaveArtifactSnapshot,
  isCollaborativeArtifactSurface,
  shouldLockArtifactDuringAiGeneration,
} from "../../app/lib/collaboration/editor-sync"
import { exportArtifactAsDocx } from "./artifact-docx-export"
import {
  openArtifactSelectionInAiPane,
} from "./open-artifact-selection-in-ai-pane"
import { computeArtifactContentHash } from "./artifact-selection"
import { artifactHasAnnotatableMedia } from "./artifact-media-annotate-dialog"
import { ArtifactPublishMenu } from "./artifact-publish-menu"
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
  /** Submenu open state so we fetch versions before the panel mounts. */
  const [versionsSubOpen, setVersionsSubOpen] = useState(false)
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [showPublishMenu, setShowPublishMenu] = useState(false)
  /** Show previous→current changes in the document body (not a separate top panel). */
  const [showChanges, setShowChanges] = useState(false)
  /** Highlighted artifact text waiting to be attached to a new comment thread. */
  const [pendingCommentSelection, setPendingCommentSelection] =
    useState<ArtifactCommentPendingSelection | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const linkCopiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftTitleRef = useRef(draftTitle)
  const draftContentJsonRef = useRef(draftContentJson)
  const draftContentTextRef = useRef(draftContentText)
  /** Ignore TipTap onChange while applying server/AI content so stale editor HTML cannot overwrite the draft. */
  const applyingServerContentRef = useRef(false)
  /** True only after a real user edit — server/AI content loads must not count as a dirty draft. */
  const userDirtyRef = useRef(false)
  /** Server version at the start of a manual edit; never advance it implicitly. */
  const draftBaseVersionRef = useRef<number | null>(null)
  /** Last version this editor persisted — realtime echo must not look like a conflict. */
  const lastOwnSavedVersionRef = useRef(0)
  const saveInFlightRef = useRef(false)
  const [editorForceNonce, setEditorForceNonce] = useState(0)
  draftTitleRef.current = draftTitle
  draftContentJsonRef.current = draftContentJson
  draftContentTextRef.current = draftContentText

  useEffect(() => {
    lastOwnSavedVersionRef.current = 0
  }, [artifactId])

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
    enabled: !!artifactId && (showVersions || versionsSubOpen),
    staleTime: 30_000,
  })

  const livePreviews = useAiBuildArtifactPreviewStore((s) => s.previews)
  const pruneConsumedSavedPreviews = useAiBuildArtifactPreviewStore(
    (s) => s.pruneConsumedSavedPreviews,
  )
  const ensureBeforeBaseline = useAiBuildArtifactPreviewStore(
    (s) => s.ensureBeforeBaseline,
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

  const snapshot = artifactQuery.data?.snapshot ?? null

  const isCollaborativeEditor = isCollaborativeArtifactSurface({
    artifactId,
    contentJson: snapshot?.content_json,
    metadata: snapshot?.metadata,
  })
  const isLiveAi =
    shouldLockArtifactDuringAiGeneration(isCollaborativeEditor)
    && isArtifactLiveEditLocked(livePreview)

  useEffect(() => {
    const version = snapshot?.current_version
    if (version == null || version <= 0) return
    pruneConsumedSavedPreviews(artifactId, version)
  }, [artifactId, pruneConsumedSavedPreviews, snapshot?.current_version])

  useEffect(() => {
    if (!livePreview || !snapshot) return
    if (livePreview.phase === "saved" || livePreview.phase === "failed") return
    if (livePreview.beforeContentJson) return
    ensureBeforeBaseline({
      artifactId,
      contentJson: snapshot.content_json,
      contentText: snapshot.content_text,
    })
  }, [artifactId, ensureBeforeBaseline, livePreview, snapshot])

  useEffect(() => {
    const patch = artifactCachePatchFromSavedLivePreview(livePreview, snapshot)
    if (!patch) return
    applyArtifactCachePatch(queryClient, patch)
  }, [livePreview, queryClient, snapshot])
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
    const progressiveHtml = livePreview ? progressiveLiveAfterHtml(livePreview) : null
    // Stream heartbeats only carry section_html — overlay that so the open pane
    // matches the chat preview card in real time.
    if (isLiveAi && livePreview && progressiveHtml) {
      const preferHtmlEmail =
        isHtmlEmailArtifact(snapshot)
        || /<!doctype\s+html|<html\b|role\s*=\s*["']presentation["']/i.test(progressiveHtml)
      return {
        ...snapshot,
        title: livePreview.title ?? snapshot.title,
        content_text: progressiveHtml,
        content_json: preferHtmlEmail
          ? buildHtmlEmailContentJson(progressiveHtml, snapshot.content_json)
          : {
              ...(typeof snapshot.content_json === "object" && snapshot.content_json
                ? snapshot.content_json
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
    }
    // Authoritative non-streaming preview overlay (full content_json arrived).
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
          ? supabase.from("tasks").select("id, title, project_id_int").eq("id", taskId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        projectId != null
          ? supabase.from("projects").select("id, name").eq("id", projectId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])
      return {
        taskTitle: typeof taskRes.data?.title === "string" ? taskRes.data.title.trim() : null,
        taskProjectId:
          typeof taskRes.data?.project_id_int === "number" ? taskRes.data.project_id_int : null,
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

  const lastSyncedArtifactKeyRef = useRef<string | null>(null)

  const beginUserEdit = () => {
    if (!userDirtyRef.current) {
      draftBaseVersionRef.current = displayArtifact?.current_version ?? 0
    }
    userDirtyRef.current = true
  }

  useEffect(() => {
    if (!displayArtifact) return
    const serverVersion = displayArtifact.current_version ?? 0
    const liveKey =
      isLiveAi && livePreview
        ? `:live:${livePreview.sequence}:${livePreview.updatedAt}`
        : ""
    const syncKey = `${displayArtifact.id}:${serverVersion}${liveKey}`
    const title = displayArtifact.title?.trim()
    if (title) {
      updateTitle(buildCenterPaneTabKey("artifact", artifactId), title)
    }

    // Same artifact+version (and same live frame): ignore query identity churn.
    if (lastSyncedArtifactKeyRef.current === syncKey) {
      return
    }

    const previousKey = lastSyncedArtifactKeyRef.current
    lastSyncedArtifactKeyRef.current = syncKey

    // Live AI frames always win — force the editor onto the streaming body.
    if (isLiveAi) {
      applyingServerContentRef.current = true
      userDirtyRef.current = false
      draftBaseVersionRef.current = null
      setDraftTitle(displayArtifact.title ?? "")
      setDraftContentJson(displayArtifact.content_json)
      setDraftContentText(displayArtifact.content_text)
      setEditorForceNonce((n) => n + 1)
      const clear = window.setTimeout(() => {
        applyingServerContentRef.current = false
      }, 50)
      return () => window.clearTimeout(clear)
    }

    const draftMatchesServer =
      (draftContentTextRef.current ?? null) === (displayArtifact.content_text ?? null)
      && JSON.stringify(draftContentJsonRef.current)
        === JSON.stringify(displayArtifact.content_json)
      && (draftTitleRef.current.trim() || displayArtifact.title) === (displayArtifact.title ?? "")

    // Version bump after our own autosave with no further local edits — soft sync.
    const isFirstSync = previousKey == null || !previousKey.startsWith(`${displayArtifact.id}:`)
    if (!isFirstSync && draftMatchesServer) {
      userDirtyRef.current = false
      draftBaseVersionRef.current = null
      setDraftTitle(displayArtifact.title ?? "")
      setDraftContentJson(displayArtifact.content_json)
      setDraftContentText(displayArtifact.content_text)
      return
    }

    // Keep local content ONLY when the user actually typed since the last server
    // sync. Server/AI loads must not count as a dirty draft — that was pinning
    // the editor to the old version after AI builds saved a new one.
    const previousId = previousKey?.slice(0, previousKey.indexOf(":")) ?? null
    const isSameArtifact = previousId === displayArtifact.id
    const ownSaveEcho = isOwnArtifactSaveEcho({
      saveInFlight: saveInFlightRef.current,
      lastOwnSavedVersion: lastOwnSavedVersionRef.current,
      serverVersion,
    })
    // Our autosave's realtime/query echo is not an external revision. Rebase
    // the draft onto the version we just wrote so the next save is not stale.
    if (ownSaveEcho && isSameArtifact && serverVersion > 0) {
      draftBaseVersionRef.current = Math.max(
        draftBaseVersionRef.current ?? 0,
        serverVersion,
      )
    }
    const staleUserDraft =
      isSameArtifact
      && userDirtyRef.current
      && !draftMatchesServer
      && !version
      && !ownSaveEcho
      && isArtifactDraftStaleForServerVersion(
        draftBaseVersionRef.current,
        serverVersion,
      )

    if (staleUserDraft) {
      // A newer AI/server version arrived after this edit started. Keeping the
      // old editor body would make the user see stale content and could later
      // attempt to overwrite the newer revision.
      setConflictMessage("A newer version was saved. The editor has refreshed.")
    }

    if (
      isSameArtifact
      && userDirtyRef.current
      && !draftMatchesServer
      && !version
      && !staleUserDraft
    ) {
      // Rebase silently — TipTap already owns the document; avoid force remount.
      setDraftTitle((prev) => prev || (displayArtifact.title ?? ""))
      return
    }

    applyingServerContentRef.current = true
    userDirtyRef.current = false
    draftBaseVersionRef.current = null
    setDraftTitle(displayArtifact.title ?? "")
    setDraftContentJson(displayArtifact.content_json)
    setDraftContentText(displayArtifact.content_text)
    setEditorForceNonce((n) => n + 1)
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
    isLiveAi,
    livePreview?.sequence,
    livePreview?.updatedAt,
    updateTitle,
    version,
  ])

  /** TipTap force key: nonce only. Version/content fingerprints remount the caret on autosave. */
  const editorForceContentKey = `${artifactId}:${editorForceNonce}`

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
    if (
      !canAutosaveArtifactSnapshot(
        isCollaborativeArtifactSurface({
          artifactId: displayArtifact.id,
          contentJson: displayArtifact.content_json,
          metadata: displayArtifact.metadata,
        }),
      )
    ) {
      return
    }
    if (Date.now() < conflictCooldownUntilRef.current) return
    if (saveInFlightRef.current) {
      pendingAutosaveRef.current = true
      return
    }
    const effectiveArtifact = resolveSavedLiveArtifactBase(displayArtifact, livePreview)
    const expectedVersion = resolveArtifactDraftExpectedVersion(
      draftBaseVersionRef.current,
      Math.max(
        effectiveArtifact.current_version ?? 0,
        knownServerVersionRef.current,
      ),
    )
    if (expectedVersion <= 0) return
    // Drop no-op autosaves (TipTap echo after force-sync).
    const nextText = draftContentTextRef.current ?? effectiveArtifact.content_text
    const nextJson = draftContentJsonRef.current ?? effectiveArtifact.content_json
    if (
      nextText === effectiveArtifact.content_text
      && JSON.stringify(nextJson) === JSON.stringify(effectiveArtifact.content_json)
      && (draftTitleRef.current.trim() || effectiveArtifact.title) === effectiveArtifact.title
    ) {
      return
    }

    saveInFlightRef.current = true
    setIsSaving(true)
    setConflictMessage(null)
    try {
      const result = await saveWorkspaceArtifact({
        artifactId: effectiveArtifact.id,
        expectedVersion,
        snapshot: {
          title: draftTitleRef.current.trim() || effectiveArtifact.title,
          status: effectiveArtifact.status,
          content_text: nextText,
          content_json: nextJson,
          asset_data: effectiveArtifact.asset_data,
        },
        changeSource: "manual",
        changedBy: currentUserId,
        aiThreadId: effectiveArtifact.ai_thread_id,
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
        lastOwnSavedVersionRef.current = Math.max(
          lastOwnSavedVersionRef.current,
          result.version_number,
        )
      }
      if (userDirtyRef.current) {
        draftBaseVersionRef.current = knownServerVersionRef.current
      }
      if ("snapshot" in result && result.snapshot) {
        applyArtifactCachePatch(queryClient, result.snapshot)
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
    try {
      if (isCollaborativeArtifactSurface({ artifactId, contentJson: displayArtifact?.content_json, metadata: displayArtifact?.metadata })) {
        const { flushAndProjectArtifact } = await import("../../app/lib/collaboration/flush")
        const { projectYDocToArtifact } = await import("../../app/lib/collaboration/projection")
        const { peekArtifactCollabSession } = await import("../../app/lib/collaboration/provider-registry")
        const { getSupabaseBrowser } = await import("../../lib/supabase-browser")
        await flushAndProjectArtifact({
          artifactId,
          project: async (seq) => {
            const session = peekArtifactCollabSession(artifactId)
            if (!session) return
            await projectYDocToArtifact({
              supabase: getSupabaseBrowser(),
              artifactId,
              document: session.document,
              seq,
              previousContentJson: displayArtifact?.content_json ?? null,
            })
          },
        })
      }
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
  const commentsDockRef = useRef<HTMLDivElement | null>(null)
  const [commentsDockHeight, setCommentsDockHeight] = useState(0)
  const commentsGutterWidth = useOverflowGutterWidth(bodyScrollRef)
  const liveContentKey = `${livePreview?.sequence ?? 0}:${(
    livePreview?.sectionHtml
    ?? livePreview?.streamSnippet
    ?? livePreview?.contentText
    ?? displayArtifact?.content_text
    ?? ""
  ).length}`
  useFollowGrowingContent({
    containerRef: bodyScrollRef,
    contentKey: liveContentKey,
    enabled: isLivePreview,
  })

  useEffect(() => {
    const node = commentsDockRef.current
    if (!node) {
      setCommentsDockHeight(0)
      return
    }
    const update = () => {
      setCommentsDockHeight(Math.ceil(node.getBoundingClientRect().height))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [artifactQuery.isLoading, displayArtifact?.id])

  const changeDiff = useMemo(() => {
    if (!displayArtifact) return null
    // Live AI: only scope to a section when BOTH before+after section HTML exist.
    // Otherwise compare full before baseline → progressive after (same as chat).
    if (isLiveAi && livePreview) {
      const beforeHtml = livePreview.sectionBeforeHtml?.trim() || null
      const afterHtml =
        livePreview.sectionHtml?.trim()
        || livePreview.streamSnippet?.trim()
        || null
      const useSectionScope = Boolean(beforeHtml) && Boolean(afterHtml)
      const useProgressiveAfter =
        !useSectionScope && Boolean(afterHtml) && livePreview.streaming === true
      return {
        beforeText: useSectionScope ? beforeHtml : livePreview.beforeContentText,
        beforeContentJson: useSectionScope ? null : livePreview.beforeContentJson,
        afterText: useSectionScope || useProgressiveAfter
          ? afterHtml
          : (
            afterHtml
            || livePreview.diffContentText
            || livePreview.contentText
            || displayArtifact.content_text
          ),
        // Never pass frozen baseline contentJson as "after" while streaming —
        // resolveArtifactDiffHtml would prefer it over progressive HTML.
        afterContentJson: useSectionScope || useProgressiveAfter
          ? null
          : (livePreview.contentJson ?? displayArtifact.content_json),
        beforeHtml: useSectionScope ? beforeHtml : null,
        afterHtml: useSectionScope || useProgressiveAfter ? afterHtml : null,
        // Prefer the frozen pre-edit JSON from the worker/store over the live
        // row (which may already equal "after" once the version is saved).
        baselineContentJson:
          livePreview.beforeContentJson
          ?? snapshot?.content_json
          ?? displayArtifact.content_json,
        baselineContentText:
          livePreview.beforeContentText
          ?? snapshot?.content_text
          ?? displayArtifact.content_text,
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
      beforeHtml: null as string | null,
      afterHtml: null as string | null,
      baselineContentJson: previous.content_json,
      baselineContentText: previous.content_text,
    }
  }, [
    displayArtifact,
    draftContentJson,
    draftContentText,
    isLiveAi,
    livePreview,
    previousVersionNumber,
    previousVersionQuery.data?.snapshot,
    snapshot?.content_json,
    snapshot?.content_text,
    viewedVersionNumber,
  ])

  const changeSides = useMemo(() => {
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

  const hasChangeDiff = Boolean(changeSides?.hasChanges)
  const changeDiffStats = changeSides?.stats ?? null

  // Reset the changes view only on a hard context switch (other artifact or
  // explicit version viewer) — not on every re-render or when AI settles.
  useEffect(() => {
    setShowChanges(false)
  }, [artifactId, version])

  // During live AI, default to track-changes. When the run settles, KEEP the
  // diff on-screen so the user sees what changed without hunting for the
  // counters; the toggle (or applying a suggestion) exits it.
  const hasDisplayArtifact = Boolean(displayArtifact)
  const hasAnnotatableMedia = Boolean(
    displayArtifact && artifactHasAnnotatableMedia(displayArtifact),
  )
  useEffect(() => {
    if (!hasDisplayArtifact) {
      setShowChanges((prev) => (prev ? false : prev))
      return
    }
    if (hasAnnotatableMedia) {
      setShowChanges((prev) => (prev ? false : prev))
      return
    }
    if (isLiveAi && hasChangeDiff) {
      setShowChanges((prev) => (prev ? prev : true))
      return
    }
    if (!hasChangeDiff) {
      setShowChanges((prev) => (prev ? false : prev))
    }
  }, [hasChangeDiff, artifactId, version, hasDisplayArtifact, hasAnnotatableMedia, isLiveAi])

  const contentStats = useMemo(() => {
    const plain = artifactPlainText({
      contentText: draftContentText ?? displayArtifact?.content_text ?? null,
      contentJson: draftContentJson ?? displayArtifact?.content_json ?? null,
    })
    return {
      words: countWords(plain),
      chars: plain.length,
    }
  }, [
    displayArtifact?.content_json,
    displayArtifact?.content_text,
    draftContentJson,
    draftContentText,
  ])

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

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-white", className)}>
      <div className="flex h-10 min-h-10 shrink-0 items-center gap-2 bg-white px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {displayArtifact.project_id != null && bindingQuery.data?.projectName ? (
            <button
              type="button"
              className="max-w-[40%] shrink-0 truncate text-left text-sm text-gray-500 hover:text-gray-800 hover:underline"
              onClick={() => openBoundProject(displayArtifact.project_id!)}
            >
              {bindingQuery.data.projectName}
            </button>
          ) : null}
          <input
            value={draftTitle}
            onChange={(event) => {
              beginUserEdit()
              setDraftTitle(event.target.value)
              scheduleAutosave()
            }}
            disabled={isLivePreview}
            className="min-w-0 flex-1 truncate border-0 bg-transparent text-sm font-medium text-gray-900 outline-none placeholder:text-gray-400 focus-visible:ring-0 disabled:opacity-70"
            placeholder="Untitled artifact"
            aria-label="Artifact title"
          />
          {isLivePreview ? (
            <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
              Live preview
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            className={PANE_CHROME_ICON_BUTTON_CLASS}
            aria-label="Download"
            title="Download"
            disabled={isLivePreview}
            onClick={() => void handleDownload("docx")}
          >
            <Download className={PANE_CHROME_ICON_CLASS} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={PANE_CHROME_ICON_BUTTON_CLASS}
                aria-label="More actions"
                title="More"
              >
                <MoreHorizontal className={PANE_CHROME_ICON_CLASS} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              {hasChangeDiff ? (
                <DropdownMenuItem
                  onSelect={() => setShowChanges((value) => !value)}
                  className="gap-2"
                >
                  <GitCompare className="h-4 w-4" />
                  {showChanges ? "Show document" : "Show changes"}
                  {changeDiffStats ? (
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-normal">
                      {changeDiffStats.added > 0 ? (
                        <span className="text-emerald-700">+{changeDiffStats.added}</span>
                      ) : null}
                      {changeDiffStats.removed > 0 ? (
                        <span className="text-red-700">−{changeDiffStats.removed}</span>
                      ) : null}
                    </span>
                  ) : null}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                disabled={isLivePreview}
                onSelect={() => setShowFindReplace(true)}
                className="gap-2"
              >
                <Search className="h-4 w-4" />
                Find and replace
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  void handleCopyShareLink()
                }}
                className="gap-2"
              >
                {linkCopied ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                {linkCopied ? "Link copied" : "Copy share link"}
              </DropdownMenuItem>
              <DropdownMenuSub open={versionsSubOpen} onOpenChange={setVersionsSubOpen}>
                <DropdownMenuSubTrigger className="gap-2">
                  <History className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">Version history</span>
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 opacity-60" />
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-[min(92vw,22rem)] p-2" sideOffset={6}>
                  <div className="mb-2 space-y-0.5 border-b border-gray-100 px-1 pb-2">
                    <p className="text-xs font-medium text-gray-900">Version history</p>
                    <p className="text-[11px] text-gray-500">
                      {displayArtifact.updated_at
                        ? `Edited ${getActivityRelativeTimeLabel(displayArtifact.updated_at)}`
                        : "No edit time"}
                      {" · "}
                      {formatWordCountLabel(contentStats.words)}
                      {" · "}
                      {formatCharCountLabel(contentStats.chars)}
                    </p>
                  </div>
                  <ArtifactVersionHistoryList
                    isLoading={versionsQuery.isLoading}
                    versions={versionsQuery.data?.versions ?? []}
                    onView={(versionNumber) => {
                      setVersionInUrl(versionNumber)
                      setVersionsSubOpen(false)
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
                        setVersionsSubOpen(false)
                      })
                    }}
                  />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                disabled={isLivePreview}
                onSelect={() => setShowPublishMenu(true)}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Publish
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">
                  <Download className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">Download as…</span>
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 opacity-60" />
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-[160px]">
                  {DOWNLOAD_FORMATS.map((entry) => (
                    <DropdownMenuItem
                      key={entry.format}
                      onSelect={() => {
                        if (entry.format === "original" && assets.length > 1) {
                          setDownloadError(
                            "This artifact has multiple assets — use Download next to each asset.",
                          )
                          return
                        }
                        void handleDownload(
                          entry.format,
                          entry.format === "original" ? assets[0]?.attachment_id : null,
                        )
                      }}
                    >
                      {entry.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              {displayArtifact.task_id != null || displayArtifact.project_id != null ? (
                <>
                  <DropdownMenuSeparator />
                  {displayArtifact.task_id != null ? (
                    <DropdownMenuItem
                      onSelect={() => openBoundTask(displayArtifact.task_id!)}
                    >
                      Open task
                      {bindingQuery.data?.taskTitle
                        ? ` · ${bindingQuery.data.taskTitle}`
                        : ""}
                    </DropdownMenuItem>
                  ) : null}
                  {displayArtifact.project_id != null ? (
                    <DropdownMenuItem
                      onSelect={() => openBoundProject(displayArtifact.project_id!)}
                    >
                      Open project
                      {bindingQuery.data?.projectName
                        ? ` · ${bindingQuery.data.projectName}`
                        : ""}
                    </DropdownMenuItem>
                  ) : null}
                </>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={isLivePreview || isDeleting}
                className="gap-2 text-red-600 focus:text-red-700"
                onSelect={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Find/replace stays available via the … menu */}
      <ArtifactFindReplacePopover
        contentJson={draftContentJson ?? displayArtifact.content_json}
        contentText={draftContentText ?? displayArtifact.content_text}
        disabled={isLivePreview}
        open={showFindReplace}
        onOpenChange={setShowFindReplace}
        hideTrigger
        onApply={({ contentJson, contentText }) => {
          if (isLivePreview) return
          setShowChanges(false)
          applyingServerContentRef.current = true
          beginUserEdit()
          setDraftContentJson(contentJson)
          setDraftContentText(contentText)
          setEditorForceNonce((n) => n + 1)
          scheduleAutosave()
          window.setTimeout(() => {
            applyingServerContentRef.current = false
          }, 50)
        }}
      />

      <Dialog open={showVersions} onOpenChange={setShowVersions}>
        <DialogContent className="max-w-sm p-4">
          <DialogHeader>
            <DialogTitle className="text-sm">Version history</DialogTitle>
          </DialogHeader>
          <p className="mb-2 text-[11px] text-gray-500">
            {displayArtifact.updated_at
              ? `Edited ${getActivityRelativeTimeLabel(displayArtifact.updated_at)}`
              : "No edit time"}
            {" · "}
            {formatWordCountLabel(contentStats.words)}
            {" · "}
            {formatCharCountLabel(contentStats.chars)}
          </p>
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
        </DialogContent>
      </Dialog>

      {/* Controlled publish popover opened from the … menu */}
      <ArtifactPublishMenu
        artifactId={artifactId}
        projectId={typeof snapshot?.project_id === "number" ? snapshot.project_id : null}
        disabled={isLivePreview}
        pathname={pathname || "/"}
        hideTrigger
        open={showPublishMenu}
        onOpenChange={setShowPublishMenu}
      />

      {conflictMessage ? (
        <div className="mx-3 mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
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
        <p className="mx-3 mt-2 text-xs text-red-600">{downloadError}</p>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden">
      <div ref={bodyScrollRef} className="absolute inset-0 overflow-auto [scrollbar-gutter:stable]">
        <div className="mx-auto flex max-w-3xl flex-col">
          {showChanges && hasChangeDiff && changeSides && !livePreview?.streaming ? (
            <ArtifactRichDiffBody
              beforeHtml={changeSides.beforeHtml}
              afterHtml={changeSides.afterHtml}
              prebuiltHtml={changeSides.trackChangesHtml}
            />
          ) : (
            <ArtifactDocumentEditor
              artifact={{
                ...displayArtifact,
                title: draftTitle,
                // While AI streams, prefer the progressive overlay — drafts stay
                // on the pre-edit baseline and would otherwise hide the live body.
                content_json: isLivePreview
                  ? displayArtifact.content_json
                  : (draftContentJson ?? displayArtifact.content_json),
                content_text: isLivePreview
                  ? displayArtifact.content_text
                  : (draftContentText ?? displayArtifact.content_text),
              }}
              forceContentKey={editorForceContentKey}
              readOnly={isLivePreview}
              hideHtmlToolbar
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
                beginUserEdit()
                setDraftContentJson(contentJson)
                scheduleAutosave()
              }}
              onContentTextChange={(contentText) => {
                if (isLivePreview || applyingServerContentRef.current) return
                beginUserEdit()
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

          {!showChanges ? (
            <ArtifactSeoDock
              variant="inline"
              artifactId={displayArtifact.id}
              artifactVersion={displayArtifact.current_version ?? 0}
              artifactTitle={draftTitle || displayArtifact.title}
              taskId={displayArtifact.task_id}
              projectId={displayArtifact.project_id}
              channelId={displayArtifact.channel_id}
              contentText={draftContentText ?? displayArtifact.content_text}
              contentJson={draftContentJson ?? displayArtifact.content_json}
              metadata={displayArtifact.metadata}
              assetData={displayArtifact.asset_data}
              aiThreadId={displayArtifact.ai_thread_id}
              readOnly={isLivePreview}
              onContentChange={({ contentText, contentJson }) => {
                if (isLivePreview) return
                if (!applyingServerContentRef.current) beginUserEdit()
                setDraftContentText(contentText)
                setDraftContentJson(contentJson)
                scheduleAutosave()
              }}
            />
          ) : null}
          <div
            aria-hidden="true"
            className="pointer-events-none shrink-0"
            style={{ height: commentsDockHeight > 0 ? commentsDockHeight + 8 : 0 }}
          />
        </div>
      </div>
      <div
        className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-end"
        style={{ paddingRight: commentsGutterWidth }}
      >
        <div
          ref={commentsDockRef}
          className="pointer-events-auto mx-auto w-full max-w-3xl bg-white"
        >
          <ArtifactCommentsDock
            artifact={displayArtifact}
            pendingSelection={pendingCommentSelection}
            onClearPendingSelection={() => setPendingCommentSelection(null)}
          />
        </div>
      </div>
      </div>

      <SelectionAskAiMenu
        containerSelector='[data-ai-selectable="artifact"]'
        resolve={resolveArtifactTextSelection}
        onAsk={(context) => {
          attachArtifactSelection(context, displayArtifact)
        }}
        onComment={(context) => {
          setPendingCommentSelection({
            quote: context.selected_text ?? "",
            selectionStart: context.selection_start ?? null,
            selectionEnd: context.selection_end ?? null,
            contextBefore: context.selection_before ?? null,
            contextAfter: context.selection_after ?? null,
            versionNumber: context.artifact_version_number ?? null,
          })
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
