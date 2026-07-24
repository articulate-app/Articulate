"use client"

import React, { useEffect, useMemo, useState } from "react"
import { FileIcon, Film, ImageIcon } from "lucide-react"
import { cn } from "../../app/lib/utils"
import {
  collectAttachmentIdsFromArtifact,
  extractArtifactAssets,
  extractArtifactBlocks,
  type ArtifactAsset,
  type ArtifactBlock,
  type TaskArtifact,
} from "../../app/lib/artifacts/artifact-types"
import {
  resolveAttachmentSignedUrls,
  type SignedAttachmentUrl,
} from "../../app/lib/services/attachment-signed-url"

function blockText(block: ArtifactBlock): string {
  if (typeof block.text === "string" && block.text) return block.text
  if (typeof block.html === "string" && block.html) {
    return block.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  }
  return ""
}

function HeadingBlock({ block }: { block: ArtifactBlock }) {
  const level = Math.min(Math.max(Number(block.level) || 2, 1), 4)
  const className =
    level === 1
      ? "text-xl font-semibold text-gray-900"
      : level === 2
        ? "text-lg font-semibold text-gray-900"
        : level === 3
          ? "text-base font-semibold text-gray-900"
          : "text-sm font-semibold text-gray-900"
  const Tag = (`h${level}` as "h1" | "h2" | "h3" | "h4")
  return (
    <Tag data-block-id={block.id ?? undefined} className={className}>
      {blockText(block)}
    </Tag>
  )
}

function ParagraphBlock({ block }: { block: ArtifactBlock }) {
  if (typeof block.html === "string" && block.html.trim()) {
    return (
      <div
        data-block-id={block.id ?? undefined}
        className="prose prose-sm max-w-none text-gray-800"
        dangerouslySetInnerHTML={{ __html: block.html }}
      />
    )
  }
  return (
    <p data-block-id={block.id ?? undefined} className="whitespace-pre-wrap text-sm text-gray-800">
      {blockText(block)}
    </p>
  )
}

function ListBlock({ block }: { block: ArtifactBlock }) {
  const items = Array.isArray(block.items) ? block.items : []
  const ordered = block.listStyle === "ordered"
  const Tag = ordered ? "ol" : "ul"
  return (
    <Tag
      data-block-id={block.id ?? undefined}
      className={cn("text-sm text-gray-800", ordered ? "list-decimal pl-5" : "list-disc pl-5")}
    >
      {items.map((item, index) => {
        const text = typeof item === "string" ? item : item?.text ?? ""
        const checked = typeof item === "object" && item ? !!item.checked : null
        return (
          <li key={index} className="my-0.5">
            {checked != null ? (
              <label className="inline-flex items-start gap-2">
                <input type="checkbox" checked={checked} readOnly className="mt-1" />
                <span>{text}</span>
              </label>
            ) : (
              text
            )}
          </li>
        )
      })}
    </Tag>
  )
}

function TableBlock({ block }: { block: ArtifactBlock }) {
  const rows = Array.isArray(block.rows) ? block.rows : []
  if (rows.length === 0) return null
  return (
    <div data-block-id={block.id ?? undefined} className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-gray-100">
              {(row ?? []).map((cell, cellIndex) => (
                <td key={cellIndex} className="px-2 py-1.5 align-top text-gray-800">
                  {cell ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MediaBlock({
  block,
  signed,
  onSelectImagePoint,
  onSelectImageRect,
  onSelectVideoTime,
}: {
  block: ArtifactBlock
  signed: SignedAttachmentUrl | null
  onSelectImagePoint?: (args: { attachmentId: string; x: number; y: number }) => void
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
}) {
  const attachmentId = typeof block.attachment_id === "string" ? block.attachment_id : null
  const mime = (signed?.record.mime_type || block.mime_type || "").toLowerCase()
  const mediaType = (signed?.record.media_type || "").toLowerCase()
  const isImage = block.type === "image" || mediaType === "image" || mime.startsWith("image/")
  const isVideo = block.type === "video" || mediaType === "video" || mime.startsWith("video/")
  const href = signed?.signedUrl ?? null
  const label = block.caption || block.file_name || signed?.record.file_name || "Attachment"

  if (!attachmentId) {
    return (
      <div className="rounded-md border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-500">
        Missing attachment
      </div>
    )
  }

  if (isImage && href) {
    return (
      <figure data-block-id={block.id ?? undefined} data-attachment-id={attachmentId} className="space-y-1">
        <button
          type="button"
          className="block w-full overflow-hidden rounded-md border border-gray-200 bg-white text-left"
          onClick={(event) => {
            if (!onSelectImagePoint) return
            const rect = event.currentTarget.getBoundingClientRect()
            const x = (event.clientX - rect.left) / Math.max(rect.width, 1)
            const y = (event.clientY - rect.top) / Math.max(rect.height, 1)
            onSelectImagePoint({
              attachmentId,
              x: Math.min(1, Math.max(0, x)),
              y: Math.min(1, Math.max(0, y)),
            })
          }}
          onDoubleClick={(event) => {
            if (!onSelectImageRect) return
            // Simple default region around the click (~20% box).
            const rect = event.currentTarget.getBoundingClientRect()
            const cx = (event.clientX - rect.left) / Math.max(rect.width, 1)
            const cy = (event.clientY - rect.top) / Math.max(rect.height, 1)
            const width = 0.2
            const height = 0.2
            onSelectImageRect({
              attachmentId,
              x: Math.min(1, Math.max(0, cx - width / 2)),
              y: Math.min(1, Math.max(0, cy - height / 2)),
              width,
              height,
            })
          }}
        >
          <img
            src={href}
            alt={block.alt || signed?.record.alt_text || label}
            loading="lazy"
            className="block max-h-96 w-full object-contain"
          />
        </button>
        {block.caption ? <figcaption className="text-xs text-gray-500">{block.caption}</figcaption> : null}
      </figure>
    )
  }

  if (isVideo && href) {
    return (
      <figure data-block-id={block.id ?? undefined} data-attachment-id={attachmentId} className="space-y-1">
        <video
          src={href}
          controls
          className="max-h-96 w-full rounded-md border border-gray-200 bg-black"
          onPause={(event) => {
            if (!onSelectVideoTime) return
            const current = event.currentTarget.currentTime
            onSelectVideoTime({ attachmentId, timeStart: current, timeEnd: current })
          }}
        />
        {block.caption ? <figcaption className="text-xs text-gray-500">{block.caption}</figcaption> : null}
      </figure>
    )
  }

  return (
    <a
      href={href ?? undefined}
      target="_blank"
      rel="noreferrer"
      data-block-id={block.id ?? undefined}
      data-attachment-id={attachmentId}
      className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 hover:bg-gray-100"
    >
      <FileIcon className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
      <span className="min-w-0 truncate">{label}</span>
    </a>
  )
}

function AssetGallery({
  assets,
  signedById,
  onSelectAsset,
}: {
  assets: ArtifactAsset[]
  signedById: Record<string, SignedAttachmentUrl>
  onSelectAsset?: (attachmentId: string) => void
}) {
  if (assets.length === 0) return null
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500">Assets</h4>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {assets.map((asset) => {
          const signed = signedById[asset.attachment_id]
          const href = signed?.signedUrl
          const mime = (signed?.record.mime_type || asset.mime_type || "").toLowerCase()
          const mediaType = (asset.media_type || signed?.record.media_type || "").toLowerCase()
          const isImage = mediaType === "image" || mime.startsWith("image/")
          const isVideo = mediaType === "video" || mime.startsWith("video/")
          const label = asset.caption || asset.file_name || signed?.record.file_name || "Asset"
          return (
            <button
              key={asset.attachment_id}
              type="button"
              onClick={() => onSelectAsset?.(asset.attachment_id)}
              className="overflow-hidden rounded-md border border-gray-200 bg-white text-left"
              title={label}
            >
              {isImage && href ? (
                <img src={href} alt={asset.alt_text || label} loading="lazy" className="h-28 w-full object-cover" />
              ) : (
                <div className="flex h-28 items-center justify-center gap-2 bg-gray-50 text-xs text-gray-600">
                  {isVideo ? <Film className="h-4 w-4" /> : isImage ? <ImageIcon className="h-4 w-4" /> : <FileIcon className="h-4 w-4" />}
                  <span className="truncate px-2">{label}</span>
                </div>
              )}
              {asset.provenance && Object.keys(asset.provenance).length > 0 ? (
                <div className="border-t border-gray-100 px-2 py-1 text-[10px] text-gray-500">
                  Provenance available
                </div>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export type ArtifactDocumentRendererProps = {
  artifact: Pick<TaskArtifact, "content_json" | "asset_data" | "content_text" | "id" | "title">
  className?: string
  showAssetGallery?: boolean
  onSelectImagePoint?: (args: { attachmentId: string; x: number; y: number }) => void
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

/**
 * Renders `content_json.blocks` as the ordered document body and optionally `asset_data.assets`.
 * Media is resolved via attachment_id → signed URL. Zero, one, or many media assets are supported.
 */
export function ArtifactDocumentRenderer({
  artifact,
  className,
  showAssetGallery = true,
  onSelectImagePoint,
  onSelectImageRect,
  onSelectVideoTime,
  onSelectAsset,
}: ArtifactDocumentRendererProps) {
  const blocks = useMemo(() => extractArtifactBlocks(artifact.content_json), [artifact.content_json])
  const assets = useMemo(() => extractArtifactAssets(artifact.asset_data), [artifact.asset_data])
  const attachmentIds = useMemo(
    () => collectAttachmentIdsFromArtifact(artifact),
    [artifact],
  )
  const [signedById, setSignedById] = useState<Record<string, SignedAttachmentUrl>>({})

  useEffect(() => {
    let cancelled = false
    if (attachmentIds.length === 0) {
      setSignedById({})
      return
    }
    void resolveAttachmentSignedUrls(attachmentIds).then((map) => {
      if (!cancelled) setSignedById(map)
    })
    return () => {
      cancelled = true
    }
  }, [attachmentIds.join("|")])

  if (blocks.length === 0 && assets.length === 0) {
    const fallback = artifact.content_text?.trim()
    if (!fallback) {
      return (
        <div className={cn("text-sm text-gray-500", className)}>
          Empty artifact
        </div>
      )
    }
    return (
      <div className={cn("whitespace-pre-wrap text-sm text-gray-800", className)}>
        {fallback}
      </div>
    )
  }

  return (
    <div className={cn("space-y-3", className)} data-artifact-id={artifact.id}>
      {blocks.map((block, index) => {
        const key = (typeof block.id === "string" && block.id) || `block-${index}`
        switch (block.type) {
          case "heading":
            return <HeadingBlock key={key} block={block} />
          case "paragraph":
          case "rich_text":
            return <ParagraphBlock key={key} block={block} />
          case "list":
            return <ListBlock key={key} block={block} />
          case "table":
            return <TableBlock key={key} block={block} />
          case "image":
          case "video":
          case "file":
            return (
              <MediaBlock
                key={key}
                block={block}
                signed={
                  typeof block.attachment_id === "string"
                    ? signedById[block.attachment_id] ?? null
                    : null
                }
                onSelectImagePoint={onSelectImagePoint}
                onSelectImageRect={onSelectImageRect}
                onSelectVideoTime={onSelectVideoTime}
              />
            )
          default:
            return <ParagraphBlock key={key} block={block} />
        }
      })}
      {showAssetGallery ? (
        <AssetGallery assets={assets} signedById={signedById} onSelectAsset={onSelectAsset} />
      ) : null}
    </div>
  )
}
