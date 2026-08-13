"use client"

import React, { useMemo, useState } from "react"
import {
  AlertCircle,
  Download,
  GripVertical,
  Loader2,
  Maximize2,
  MessageSquarePlus,
} from "lucide-react"
import { cn } from "../../app/lib/utils"
import type { TaskArtifact, SelectedArtifactContext } from "../../app/lib/artifacts/artifact-types"
import {
  extractArtifactAssets,
  extractArtifactBlocks,
} from "../../app/lib/artifacts/artifact-types"
import { toast } from "../../app/components/ui/use-toast"
import { artifactContentToPreviewHtml } from "./artifact-preview-html"
import { isHtmlEmailArtifact } from "./artifact-html-document"
import { ArtifactHtmlDocumentView } from "./artifact-html-document-view"
import type { AiBuildArtifactPreviewEntry } from "../../app/store/ai-build-artifact-preview-store"
import { ComponentOutputReadonlyBody } from "../tasks/components/ComponentOutputReadonlyBody"
import { AI_CHAT_PREVIEW_BODY_WRAPPER_CLASS } from "../tasks/components/component-output-body-shared"
import {
  artifactDiffPlainFromContent,
  canonicalArtifactDiffText,
} from "../../app/lib/artifact-selection-patch"
import {
  buildComponentPreviewDiff,
  computeDiffCharStats,
  hasRenderableDiff,
} from "../tasks/utils/component-content-diff"
import { setArtifactAttachDragData } from "./artifact-attach-dnd"
import { ArtifactDocumentRenderer } from "./artifact-document-renderer"
import { ArtifactRichDiffBody } from "./artifact-rich-diff-body"
import { openArtifactSelectionInAiPane } from "./open-artifact-selection-in-ai-pane"
import {
  ArtifactMediaAnnotateDialog,
  artifactHasAnnotatableMedia,
} from "./artifact-media-annotate-dialog"
import { exportArtifactAsDocx } from "./artifact-docx-export"

function phaseLabel(phase: AiBuildArtifactPreviewEntry["phase"] | "ready"): string {
  switch (phase) {
    case "plan_ready":
      return "Plan ready"
    case "started":
      return "Building"
    case "media":
      return "Generating media"
    case "preview":
      return "Preview"
    case "saved":
      return "Saved"
    case "failed":
      return "Failed"
    default:
      return "Ready"
  }
}

function PreviewDiffCharStats({
  added,
  removed,
  onClick,
  canToggle,
}: {
  added: number
  removed: number
  onClick?: () => void
  canToggle?: boolean
}) {
  if (added === 0 && removed === 0) return null
  const className = canToggle
    ? "inline-flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-muted"
    : "inline-flex items-center gap-1.5"
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick?.()
      }}
      disabled={!canToggle}
      className={className}
      aria-label={canToggle ? "Toggle diff view" : undefined}
    >
      {added > 0 ? <span className="font-medium text-emerald-600">+{added}</span> : null}
      {removed > 0 ? <span className="font-medium text-red-600">−{removed}</span> : null}
    </button>
  )
}

export type ArtifactCardProps = {
  artifact: TaskArtifact
  livePreview?: AiBuildArtifactPreviewEntry | null
  className?: string
  /** Allow dragging chat-only artifacts onto an open task/project to attach. */
  allowAttachToTask?: boolean
  onComment?: (artifact: TaskArtifact) => void
  compact?: boolean
  /** AI chat live preview: cap body height and scroll (component-edit style). */
  chatPreview?: boolean
  /** Open full artifact in the center pane (Maximize). */
  onOpen?: () => void
}

/**
 * Artifact card for chat or task workspace.
 * Chat-only artifacts can be drag-attached onto an open task/project.
 */
export function ArtifactCard({
  artifact,
  livePreview = null,
  className,
  allowAttachToTask = false,
  onComment,
  compact = false,
  chatPreview = false,
  onOpen,
}: ArtifactCardProps) {
  const [showDiff, setShowDiff] = useState(true)
  const [annotateOpen, setAnnotateOpen] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  const phase = livePreview?.phase ?? "ready"
  const isLive = !!livePreview && phase !== "saved" && phase !== "failed"

  const displayArtifact = useMemo<TaskArtifact>(() => {
    if (!livePreview) return artifact
    // Saved previews must not pin an older body once the list/get row has caught up.
    if (
      livePreview.phase === "saved"
      && (livePreview.currentVersion ?? 0) <= (artifact.current_version ?? 0)
    ) {
      return artifact
    }
    const preferBaseline =
      isLive
      && (Boolean(livePreview.beforeContentJson) || Boolean(livePreview.beforeContentText?.trim()))
    return {
      ...artifact,
      title: livePreview.title ?? artifact.title,
      content_text: preferBaseline
        ? (livePreview.beforeContentText ?? livePreview.contentText ?? artifact.content_text)
        : (livePreview.contentText || artifact.content_text),
      content_json: preferBaseline
        ? (livePreview.beforeContentJson ?? livePreview.contentJson ?? artifact.content_json)
        : (livePreview.contentJson ?? artifact.content_json),
      asset_data: livePreview.assetData ?? artifact.asset_data,
      current_version: livePreview.currentVersion ?? artifact.current_version,
      task_id: livePreview.taskId ?? artifact.task_id,
      channel_id: livePreview.channelId ?? artifact.channel_id,
      language_id: livePreview.languageId ?? artifact.language_id,
      ai_thread_id: livePreview.aiThreadId ?? artifact.ai_thread_id,
      artifact_type: livePreview.artifactType ?? artifact.artifact_type,
      artifact_role: livePreview.artifactRole ?? artifact.artifact_role,
      metadata: {
        ...(artifact.metadata ?? {}),
        ...(livePreview.channelName ? { channel_name: livePreview.channelName } : {}),
        ...(livePreview.languageName ? { language_name: livePreview.languageName } : {}),
      },
    }
  }, [artifact, isLive, livePreview])

  const isChatOnly =
    displayArtifact.task_id == null && !!displayArtifact.ai_thread_id
  /** Chat/project-unbound (or project-only) cards can be dragged onto an open task/project. */
  const canDragAttach =
    allowAttachToTask && displayArtifact.task_id == null && Boolean(displayArtifact.id)

  const attachSelection = (context: SelectedArtifactContext) => {
    void openArtifactSelectionInAiPane({
      context,
      taskId: displayArtifact.task_id ?? null,
      projectId: displayArtifact.project_id ?? null,
      channelId: displayArtifact.channel_id ?? null,
    })
  }

  const beforeText = useMemo(() => {
    return artifactDiffPlainFromContent(
      livePreview?.beforeContentText,
      livePreview?.beforeContentJson ?? null,
    )
  }, [livePreview?.beforeContentJson, livePreview?.beforeContentText])

  const afterText = useMemo(() => {
    // Hide full-doc rewrite noise while streaming; only trust post-save diffs.
    if (isLive) return beforeText
    if (typeof livePreview?.diffContentText === "string" && livePreview.diffContentText.trim()) {
      return canonicalArtifactDiffText(livePreview.diffContentText)
    }
    return artifactDiffPlainFromContent(
      displayArtifact.content_text,
      displayArtifact.content_json,
    )
  }, [
    beforeText,
    displayArtifact.content_json,
    displayArtifact.content_text,
    isLive,
    livePreview?.diffContentText,
  ])

  const diffLines = useMemo(() => {
    if (isLive || !beforeText || !afterText || beforeText === afterText) return []
    return buildComponentPreviewDiff({
      operation: "replace",
      beforeText,
      afterText,
    })
  }, [afterText, beforeText, isLive])

  const diffStats = useMemo(() => {
    if (isLive || !beforeText || !afterText || beforeText === afterText) return { added: 0, removed: 0 }
    return computeDiffCharStats(beforeText, afterText)
  }, [afterText, beforeText, isLive])

  const canShowDiff = hasRenderableDiff(diffLines)

  const richHtml = useMemo(
    () => artifactContentToPreviewHtml(displayArtifact),
    [displayArtifact],
  )

  const prefersTipTapBody = useMemo(() => {
    if (isHtmlEmailArtifact(displayArtifact)) return false
    const blocks = extractArtifactBlocks(displayArtifact.content_json)
    const assets = extractArtifactAssets(displayArtifact.asset_data)
    if (assets.length > 0) return false
    // Dedicated media blocks still use ArtifactDocumentRenderer; tables + rich_text
    // HTML (including embedded <table>) render through TipTap for chat previews.
    if (blocks.some((block) => {
      const type = String(block.type ?? "")
      return type === "image"
        || type === "video"
        || type === "audio"
        || type === "file"
        || type === "attachment"
        || type === "image_gallery"
        || type === "gallery"
        || type === "carousel"
    })) {
      return false
    }
    if (blocks.length > 0) return true
    return Boolean(displayArtifact.content_text?.trim())
  }, [displayArtifact])

  const hasAnnotatableMedia = useMemo(
    () => artifactHasAnnotatableMedia(displayArtifact),
    [displayArtifact],
  )

  const handleExpand = () => {
    if (hasAnnotatableMedia) {
      setAnnotateOpen(true)
      return
    }
    onOpen?.()
  }

  const handleDownloadWord = async () => {
    if (isLive || isDownloading) return
    setIsDownloading(true)
    try {
      await exportArtifactAsDocx({
        artifact: {
          id: displayArtifact.id,
          title: displayArtifact.title,
          content_json: displayArtifact.content_json,
          content_text: displayArtifact.content_text,
        },
      })
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Could not export Word file",
        variant: "destructive",
      })
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div
      className={cn(
        "w-full min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-sm",
        canDragAttach ? "cursor-grab active:cursor-grabbing" : null,
        className,
      )}
      data-artifact-id={displayArtifact.id}
      draggable={canDragAttach}
      onDragStart={(event) => {
        if (!canDragAttach) return
        setArtifactAttachDragData(event.dataTransfer, displayArtifact.id)
        event.dataTransfer.setDragImage(event.currentTarget, 16, 16)
      }}
      title={canDragAttach ? "Drag onto an open task or project to attach" : undefined}
    >
      <div className="flex items-start gap-2 px-3 py-2">
        {canDragAttach ? (
          <span
            className="mt-0.5 shrink-0 text-gray-400"
            aria-hidden
          >
            <GripVertical className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          {onOpen ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onOpen()
              }}
              className="block w-full truncate text-left text-sm font-medium text-gray-900 hover:underline"
            >
              {displayArtifact.title?.trim() || "Artifact"}
            </button>
          ) : (
            <div className="truncate text-sm font-medium text-gray-900">
              {displayArtifact.title?.trim() || "Artifact"}
            </div>
          )}
          <p className="text-[11px] text-gray-500">
            {displayArtifact.artifact_type ? `${displayArtifact.artifact_type}` : "Artifact"}
            {typeof displayArtifact.metadata?.channel_name === "string"
              && displayArtifact.metadata.channel_name.trim()
              ? ` · ${displayArtifact.metadata.channel_name}`
              : ""}
            {typeof displayArtifact.metadata?.language_name === "string"
              && displayArtifact.metadata.language_name.trim()
              ? ` · ${displayArtifact.metadata.language_name}`
              : ""}
            {!isChatOnly && displayArtifact.task_id != null ? ` · Task ${displayArtifact.task_id}` : ""}
            {canDragAttach ? " · Drag to attach" : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                void handleDownloadWord()
              }}
              disabled={isLive || isDownloading}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
              aria-label="Download Word"
              title="Download Word"
            >
              {isDownloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
            </button>
            {onOpen || hasAnnotatableMedia ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  handleExpand()
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                aria-label="Expand artifact"
                title="Expand"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {diffStats.added > 0 || diffStats.removed > 0 ? (
              <PreviewDiffCharStats
                added={diffStats.added}
                removed={diffStats.removed}
                canToggle={canShowDiff}
                onClick={() => {
                  if (!canShowDiff) return
                  setShowDiff((value) => !value)
                }}
              />
            ) : null}
          </div>
          {phase === "failed" || isLive ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                phase === "failed"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-gray-50 text-gray-600",
              )}
              title={phaseLabel(phase)}
              aria-label={phaseLabel(phase)}
            >
              {isLive ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
              {phase === "failed" ? (
                <>
                  <AlertCircle className="h-3 w-3" aria-hidden />
                  {phaseLabel(phase)}
                </>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>

      {livePreview?.errorMessage ? (
        <p className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
          {livePreview.errorMessage}
        </p>
      ) : null}

      {!compact ? (
        <div
          className={cn(
            "border-t border-gray-100 px-3 py-3",
            chatPreview && "max-h-40 overflow-x-hidden overflow-y-auto",
          )}
        >
          {chatPreview ? (
            showDiff && canShowDiff ? (
              <ArtifactRichDiffBody
                beforeText={beforeText}
                beforeContentJson={livePreview?.beforeContentJson}
                afterText={afterText}
                afterContentJson={displayArtifact.content_json}
                changedOnly
                compact
              />
            ) : isHtmlEmailArtifact(displayArtifact) ? (
              <ArtifactHtmlDocumentView
                html={richHtml}
                readOnly
                variant="preview"
              />
            ) : prefersTipTapBody ? (
              <ComponentOutputReadonlyBody
                html={richHtml}
                toolbarId={`artifact-card-${displayArtifact.id}`}
                className={cn(
                  AI_CHAT_PREVIEW_BODY_WRAPPER_CLASS,
                  "border-0 bg-transparent shadow-none",
                )}
                fromAiChat
                placeholder={isLive ? "Generating artifact…" : "Empty artifact"}
              />
            ) : (
              <ArtifactDocumentRenderer
                artifact={displayArtifact}
                onOpenFullscreen={handleExpand}
                onSelectImagePoint={({ attachmentId, x, y }) => {
                  attachSelection({
                    source_type: "task_artifact",
                    artifact_id: displayArtifact.id,
                    artifact_version_number: displayArtifact.current_version,
                    anchor_type: "image_point",
                    attachment_id: attachmentId,
                    anchor_x: x,
                    anchor_y: y,
                    title: displayArtifact.title,
                  })
                }}
                onSelectImageRect={({ attachmentId, x, y, width, height }) => {
                  attachSelection({
                    source_type: "task_artifact",
                    artifact_id: displayArtifact.id,
                    artifact_version_number: displayArtifact.current_version,
                    anchor_type: "image_rect",
                    attachment_id: attachmentId,
                    anchor_x: x,
                    anchor_y: y,
                    anchor_width: width,
                    anchor_height: height,
                    title: displayArtifact.title,
                  })
                }}
                onSelectVideoTime={({ attachmentId, timeStart, timeEnd }) => {
                  attachSelection({
                    source_type: "task_artifact",
                    artifact_id: displayArtifact.id,
                    artifact_version_number: displayArtifact.current_version,
                    anchor_type: "video_time",
                    attachment_id: attachmentId,
                    anchor_time_start: timeStart,
                    anchor_time_end: timeEnd ?? timeStart,
                    title: displayArtifact.title,
                  })
                }}
                onSelectAsset={(attachmentId) => {
                  attachSelection({
                    source_type: "task_artifact",
                    artifact_id: displayArtifact.id,
                    artifact_version_number: displayArtifact.current_version,
                    anchor_type: "asset",
                    attachment_id: attachmentId,
                    title: displayArtifact.title,
                  })
                }}
              />
            )
          ) : (
            <div>
              {showDiff && canShowDiff ? (
                <ArtifactRichDiffBody
                  beforeText={beforeText}
                  beforeContentJson={livePreview?.beforeContentJson}
                  afterText={afterText}
                  afterContentJson={displayArtifact.content_json}
                />
              ) : prefersTipTapBody ? (
                <ComponentOutputReadonlyBody
                  html={richHtml}
                  toolbarId={`artifact-card-${displayArtifact.id}`}
                  className={AI_CHAT_PREVIEW_BODY_WRAPPER_CLASS}
                  fromAiChat
                  placeholder={isLive ? "Generating artifact…" : "Empty artifact"}
                />
              ) : (
                <ArtifactDocumentRenderer
                  artifact={displayArtifact}
                  onSelectImagePoint={({ attachmentId, x, y }) => {
                    attachSelection({
                      source_type: "task_artifact",
                      artifact_id: displayArtifact.id,
                      artifact_version_number: displayArtifact.current_version,
                      anchor_type: "image_point",
                      attachment_id: attachmentId,
                      anchor_x: x,
                      anchor_y: y,
                      title: displayArtifact.title,
                    })
                  }}
                  onSelectImageRect={({ attachmentId, x, y, width, height }) => {
                    attachSelection({
                      source_type: "task_artifact",
                      artifact_id: displayArtifact.id,
                      artifact_version_number: displayArtifact.current_version,
                      anchor_type: "image_rect",
                      attachment_id: attachmentId,
                      anchor_x: x,
                      anchor_y: y,
                      anchor_width: width,
                      anchor_height: height,
                      title: displayArtifact.title,
                    })
                  }}
                  onSelectVideoTime={({ attachmentId, timeStart, timeEnd }) => {
                    attachSelection({
                      source_type: "task_artifact",
                      artifact_id: displayArtifact.id,
                      artifact_version_number: displayArtifact.current_version,
                      anchor_type: "video_time",
                      attachment_id: attachmentId,
                      anchor_time_start: timeStart,
                      anchor_time_end: timeEnd ?? timeStart,
                      title: displayArtifact.title,
                    })
                  }}
                  onSelectAsset={(attachmentId) => {
                    attachSelection({
                      source_type: "task_artifact",
                      artifact_id: displayArtifact.id,
                      artifact_version_number: displayArtifact.current_version,
                      anchor_type: "asset",
                      attachment_id: attachmentId,
                      title: displayArtifact.title,
                    })
                  }}
                />
              )}
            </div>
          )}
        </div>
      ) : displayArtifact.content_text?.trim() ? (
        <p className="border-t border-gray-100 px-3 py-2 text-[11px] leading-snug text-gray-600 line-clamp-4">
          {displayArtifact.content_text.trim()}
        </p>
      ) : null}

      {onComment ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 px-3 py-2">
          <button
            type="button"
            onClick={() => onComment(displayArtifact)}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
          >
            <MessageSquarePlus className="h-3 w-3" aria-hidden />
            Comment
          </button>
        </div>
      ) : null}
      <ArtifactMediaAnnotateDialog
        open={annotateOpen}
        onOpenChange={setAnnotateOpen}
        artifact={displayArtifact}
      />
    </div>
  )
}
