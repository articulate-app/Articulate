"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Loader2, MessageSquarePlus, X } from "lucide-react"
import { cn } from "../../app/lib/utils"
import {
  collectAttachmentIdsFromArtifact,
  extractArtifactAssets,
  extractArtifactBlocks,
  type TaskArtifact,
} from "../../app/lib/artifacts/artifact-types"
import {
  resolveAttachmentSignedUrls,
  type SignedAttachmentUrl,
} from "../../app/lib/services/attachment-signed-url"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "../../app/components/ui/dialog"
import { openArtifactSelectionInAiPane } from "./open-artifact-selection-in-ai-pane"
import { openArtifactCenterTab } from "./open-artifact-center-tab"

type MediaTarget = {
  attachmentId: string
  kind: "image" | "video"
  label: string
}

function resolvePrimaryMedia(artifact: Pick<TaskArtifact, "content_json" | "asset_data">): MediaTarget | null {
  const blocks = extractArtifactBlocks(artifact.content_json)
  for (const block of blocks) {
    const type = String(block.type ?? "")
    const attachmentId =
      typeof block.attachment_id === "string" && block.attachment_id.trim()
        ? block.attachment_id.trim()
        : ""
    if (!attachmentId) continue
    if (type === "image" || type === "video") {
      return {
        attachmentId,
        kind: type === "video" ? "video" : "image",
        label:
          (typeof block.caption === "string" && block.caption.trim())
          || (typeof block.file_name === "string" && block.file_name.trim())
          || (typeof block.alt === "string" && block.alt.trim())
          || type,
      }
    }
  }
  const assets = extractArtifactAssets(artifact.asset_data)
  for (const asset of assets) {
    const attachmentId = String(asset.attachment_id ?? "").trim()
    if (!attachmentId) continue
    const mediaType = String(asset.media_type ?? "").toLowerCase()
    const kind = mediaType.startsWith("video") ? "video" : "image"
    return {
      attachmentId,
      kind,
      label: asset.caption || asset.file_name || asset.alt_text || kind,
    }
  }
  return null
}

export function artifactHasAnnotatableMedia(
  artifact: Pick<TaskArtifact, "content_json" | "asset_data">,
): boolean {
  return resolvePrimaryMedia(artifact) != null
}

/**
 * Full-page media annotate surface: mark a point on image/video and send it to the AI composer
 * without leaving the chat (avoids opening the middle pane document editor).
 */
export function ArtifactMediaAnnotateDialog({
  open,
  onOpenChange,
  artifact,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  artifact: TaskArtifact
}) {
  const media = useMemo(() => resolvePrimaryMedia(artifact), [artifact])
  const attachmentIds = useMemo(
    () => (media ? [media.attachmentId] : collectAttachmentIdsFromArtifact(artifact)),
    [artifact, media],
  )
  const [signedById, setSignedById] = useState<Record<string, SignedAttachmentUrl>>({})
  const [marker, setMarker] = useState<{ x: number; y: number } | null>(null)
  const [note, setNote] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMarker(null)
    setNote("")
    setError(null)
  }, [open, artifact.id])

  useEffect(() => {
    let cancelled = false
    if (!open || attachmentIds.length === 0) {
      setSignedById({})
      return
    }
    void resolveAttachmentSignedUrls(attachmentIds).then((map) => {
      if (!cancelled) setSignedById(map)
    })
    return () => {
      cancelled = true
    }
  }, [attachmentIds.join("|"), open])

  const signed = media ? signedById[media.attachmentId] ?? null : null
  const href = signed?.signedUrl ?? null

  const handleSendToAi = async () => {
    if (!media) return
    if (media.kind === "image" && !marker) {
      setError("Click the image to mark a point first.")
      return
    }
    setIsSending(true)
    setError(null)
    try {
      const context =
        media.kind === "video"
          ? {
              source_type: "task_artifact" as const,
              artifact_id: artifact.id,
              artifact_version_number: artifact.current_version ?? 0,
              anchor_type: "asset" as const,
              attachment_id: media.attachmentId,
              title: artifact.title,
              selected_text: note.trim() || null,
            }
          : {
              source_type: "task_artifact" as const,
              artifact_id: artifact.id,
              artifact_version_number: artifact.current_version ?? 0,
              anchor_type: "image_point" as const,
              attachment_id: media.attachmentId,
              anchor_x: marker!.x,
              anchor_y: marker!.y,
              title: artifact.title,
              selected_text: note.trim() || null,
            }
      await openArtifactSelectionInAiPane({
        context,
        taskId: artifact.task_id ?? null,
        projectId: artifact.project_id ?? null,
        channelId: artifact.channel_id ?? null,
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send to AI chat")
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[120] flex h-[min(92vh,900px)] w-[min(96vw,1100px)] max-w-none flex-col gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <DialogTitle className="truncate text-sm font-semibold text-gray-900">
            {artifact.title?.trim() || "Creative"}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              onClick={() => {
                openArtifactCenterTab({
                  artifactId: artifact.id,
                  title: artifact.title,
                  version: artifact.current_version,
                })
                onOpenChange(false)
              }}
            >
              Open editor
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 bg-neutral-950">
          {!media ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-300">
              No media found on this artifact
            </div>
          ) : !href ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-300">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading media…
            </div>
          ) : media.kind === "video" ? (
            <video
              src={href}
              controls
              className="h-full w-full object-contain"
            />
          ) : (
            <button
              type="button"
              className="relative block h-full w-full cursor-crosshair"
              title="Click to mark a point"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                const x = (event.clientX - rect.left) / Math.max(rect.width, 1)
                const y = (event.clientY - rect.top) / Math.max(rect.height, 1)
                setMarker({
                  x: Math.min(1, Math.max(0, x)),
                  y: Math.min(1, Math.max(0, y)),
                })
                setError(null)
              }}
            >
              <img
                src={href}
                alt={media.label}
                className="pointer-events-none h-full w-full object-contain"
              />
              {marker ? (
                <span
                  className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-500 shadow"
                  style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
                />
              ) : null}
            </button>
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-gray-200 bg-white px-4 py-3">
          <p className="text-xs text-gray-500">
            {media?.kind === "image"
              ? marker
                ? "Point marked — add an optional note, then send to AI chat."
                : "Click the image to mark a point, then send it to AI chat."
              : "Add an optional note, then send this creative to AI chat."}
          </p>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder="Optional note for the AI…"
            className="w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
          />
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSending || !media}
              onClick={() => void handleSendToAi()}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50",
              )}
            >
              {isSending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MessageSquarePlus className="h-3.5 w-3.5" />
              )}
              Send to AI chat
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
