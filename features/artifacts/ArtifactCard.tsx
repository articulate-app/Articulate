"use client"

import React, { useMemo, useState } from "react"
import {
  AlertCircle,
  Check,
  Link2,
  Loader2,
  MessageSquarePlus,
  Sparkles,
} from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { cn } from "../../app/lib/utils"
import type { TaskArtifact } from "../../app/lib/artifacts/artifact-types"
import { attachArtifactToTask } from "../../app/lib/services/artifacts"
import type { AiBuildArtifactPreviewEntry } from "../../app/store/ai-build-artifact-preview-store"
import { ArtifactDocumentRenderer } from "./artifact-document-renderer"
import {
  computeArtifactContentHash,
  useArtifactSelectionStore,
} from "./artifact-selection"

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
  onAskAi?: (artifact: TaskArtifact) => void
  onComment?: (artifact: TaskArtifact) => void
  compact?: boolean
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
  onAskAi,
  onComment,
  compact = false,
}: ArtifactCardProps) {
  const queryClient = useQueryClient()
  const setPendingSelection = useArtifactSelectionStore((s) => s.setPendingSelection)
  const [isAttaching, setIsAttaching] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [taskIdInput, setTaskIdInput] = useState(
    defaultTaskId != null ? String(defaultTaskId) : "",
  )
  const [showAttachForm, setShowAttachForm] = useState(false)

  const displayArtifact = useMemo<TaskArtifact>(() => {
    if (!livePreview) return artifact
    return {
      ...artifact,
      title: livePreview.title ?? artifact.title,
      content_text: livePreview.contentText || artifact.content_text,
      content_json: livePreview.contentJson ?? artifact.content_json,
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
  }, [artifact, livePreview])

  const isChatOnly =
    displayArtifact.task_id == null && !!displayArtifact.ai_thread_id
  const phase = livePreview?.phase ?? "ready"
  const isLive = !!livePreview && phase !== "saved" && phase !== "failed"

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

  const selectDocument = () => {
    setPendingSelection({
      source_type: "task_artifact",
      artifact_id: displayArtifact.id,
      artifact_version_number: displayArtifact.current_version,
      anchor_type: "document",
      title: displayArtifact.title,
      full_content_hash: computeArtifactContentHash(displayArtifact.content_text ?? ""),
    })
    onAskAi?.(displayArtifact)
  }

  return (
    <div
      className={cn(
        "w-full min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-sm",
        className,
      )}
      data-artifact-id={displayArtifact.id}
    >
      <div className="flex items-start gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-900">
            {displayArtifact.title?.trim() || "Artifact"}
          </div>
          <p className="text-[11px] text-gray-500">
            v{displayArtifact.current_version}
            {displayArtifact.artifact_type ? ` · ${displayArtifact.artifact_type}` : ""}
            {displayArtifact.artifact_role ? ` · ${displayArtifact.artifact_role}` : ""}
            {typeof displayArtifact.metadata?.channel_name === "string"
              && displayArtifact.metadata.channel_name.trim()
              ? ` · ${displayArtifact.metadata.channel_name}`
              : ""}
            {typeof displayArtifact.metadata?.language_name === "string"
              && displayArtifact.metadata.language_name.trim()
              ? ` · ${displayArtifact.metadata.language_name}`
              : ""}
            {isChatOnly ? " · Chat workspace" : displayArtifact.task_id != null ? ` · Task ${displayArtifact.task_id}` : ""}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
            phase === "failed"
              ? "bg-destructive/10 text-destructive"
              : phase === "saved" || phase === "ready"
                ? "bg-emerald-50 text-emerald-800"
                : "bg-gray-50 text-gray-600",
          )}
        >
          {isLive ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
          {phase === "saved" ? <Check className="h-3 w-3" aria-hidden /> : null}
          {phase === "failed" ? <AlertCircle className="h-3 w-3" aria-hidden /> : null}
          {phaseLabel(phase)}
        </span>
      </div>

      {livePreview?.errorMessage ? (
        <p className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
          {livePreview.errorMessage}
        </p>
      ) : null}

      {!compact ? (
        <div className="border-t border-gray-100 px-3 py-3">
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
        </div>
      ) : displayArtifact.content_text?.trim() ? (
        <p className="border-t border-gray-100 px-3 py-2 text-[11px] leading-snug text-gray-600 line-clamp-4">
          {displayArtifact.content_text.trim()}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 px-3 py-2">
        <button
          type="button"
          onClick={selectDocument}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
        >
          <Sparkles className="h-3 w-3" aria-hidden />
          Ask AI
        </button>
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
