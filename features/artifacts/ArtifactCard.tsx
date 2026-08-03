"use client"

import React, { useMemo, useState } from "react"
import {
  AlertCircle,
  Check,
  GripVertical,
  Link2,
  Loader2,
  MessageSquarePlus,
} from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { cn } from "../../app/lib/utils"
import type { TaskArtifact } from "../../app/lib/artifacts/artifact-types"
import {
  extractArtifactAssets,
  extractArtifactBlocks,
} from "../../app/lib/artifacts/artifact-types"
import { artifactContentToPreviewHtml } from "./artifact-preview-html"
import { attachArtifactToTask } from "../../app/lib/services/artifacts"
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
import { useArtifactSelectionStore } from "./artifact-selection"

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
  /** Show Attach to task when the artifact lives only on an AI thread. */
  allowAttachToTask?: boolean
  defaultTaskId?: number | null
  defaultChannelId?: number | null
  defaultLanguageId?: number | null
  onAttached?: (artifact: TaskArtifact) => void
  onComment?: (artifact: TaskArtifact) => void
  compact?: boolean
  /** AI chat live preview: cap body height and scroll (component-edit style). */
  chatPreview?: boolean
}

/**
 * Artifact card for chat or task workspace.
 * Chat artifacts (task_id null, ai_thread_id set) offer Attach to task — no duplication / version reset.
 */
export function ArtifactCard({
  artifact,
  livePreview = null,
  className,
  allowAttachToTask = false,
  defaultTaskId = null,
  defaultChannelId = null,
  defaultLanguageId = null,
  onAttached,
  onComment,
  compact = false,
  chatPreview = false,
}: ArtifactCardProps) {
  const queryClient = useQueryClient()
  const setPendingSelection = useArtifactSelectionStore((s) => s.setPendingSelection)
  const [isAttaching, setIsAttaching] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [taskIdInput, setTaskIdInput] = useState(
    defaultTaskId != null ? String(defaultTaskId) : "",
  )
  const [showAttachForm, setShowAttachForm] = useState(false)
  const [showDiff, setShowDiff] = useState(true)

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
  }, [displayArtifact.content_json, displayArtifact.asset_data, displayArtifact.content_text])

  const handleAttach = async () => {
    const taskId = Number(taskIdInput)
    if (!Number.isFinite(taskId) || taskId <= 0) {
      setAttachError("Enter a valid task id")
      return
    }
    setIsAttaching(true)
    setAttachError(null)
    try {
      const result = await attachArtifactToTask({
        artifactId: displayArtifact.id,
        taskId,
        channelId: defaultChannelId,
        languageId: defaultLanguageId,
      })
      onAttached?.(result.artifact)
      await queryClient.invalidateQueries({ queryKey: ["task-artifacts"] })
      await queryClient.invalidateQueries({ queryKey: ["ai-thread-artifacts"] })
      setShowAttachForm(false)
    } catch (error) {
      setAttachError(error instanceof Error ? error.message : "Failed to attach artifact")
    } finally {
      setIsAttaching(false)
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
          <div className="truncate text-sm font-medium text-gray-900">
            {displayArtifact.title?.trim() || "Artifact"}
          </div>
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
          {phase === "failed" || isLive || phase === "saved" ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                phase === "failed"
                  ? "bg-destructive/10 text-destructive"
                  : phase === "saved"
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-gray-50 text-gray-600",
              )}
              title={phaseLabel(phase)}
              aria-label={phaseLabel(phase)}
            >
              {isLive ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
              {phase === "saved" ? <Check className="h-3 w-3" aria-hidden /> : null}
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
        <div className="border-t border-gray-100 px-3 py-3">
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
                onSelectImagePoint={({ attachmentId, x, y }) => {
                  setPendingSelection({
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
                  setPendingSelection({
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
                  setPendingSelection({
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
                  setPendingSelection({
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
                    setPendingSelection({
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
                    setPendingSelection({
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
                    setPendingSelection({
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
                    setPendingSelection({
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

      {(onComment || (allowAttachToTask && isChatOnly)) ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 px-3 py-2">
          {onComment ? (
            <button
              type="button"
              onClick={() => onComment(displayArtifact)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
            >
              <MessageSquarePlus className="h-3 w-3" aria-hidden />
              Comment
            </button>
          ) : null}
          {allowAttachToTask && isChatOnly ? (
            <button
              type="button"
              onClick={() => setShowAttachForm((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
            >
              <Link2 className="h-3 w-3" aria-hidden />
              Attach to task
            </button>
          ) : null}
        </div>
      ) : null}

      {showAttachForm ? (
        <div className="space-y-2 border-t border-gray-100 bg-gray-50 px-3 py-2">
          <label className="block text-[11px] font-medium text-gray-700">
            Task id
            <input
              type="number"
              value={taskIdInput}
              onChange={(event) => setTaskIdInput(event.target.value)}
              className="mt-1 w-full rounded border border-gray-200 bg-white px-2 py-1 text-sm"
              placeholder="e.g. 1234"
            />
          </label>
          {attachError ? <p className="text-[11px] text-red-600">{attachError}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isAttaching}
              onClick={() => void handleAttach()}
              className="inline-flex items-center gap-1 rounded bg-gray-900 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
            >
              {isAttaching ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Attach
            </button>
            <button
              type="button"
              onClick={() => setShowAttachForm(false)}
              className="rounded px-2.5 py-1 text-[11px] text-gray-600 hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
