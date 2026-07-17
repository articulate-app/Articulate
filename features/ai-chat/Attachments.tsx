"use client"

import React, { useEffect, useMemo, useState } from "react"
import { getSupabaseBrowser } from "../../lib/supabase-browser"
import type { AiAttachmentMeta } from "./types"

const signedAttachmentPreviewCache = new Map<string, string>()
const failedSignedAttachmentCache = new Set<string>()

export function Attachments({ items }: { items?: AiAttachmentMeta[] | null }) {
  const supabase = getSupabaseBrowser()
  const [signedUrlsByKey, setSignedUrlsByKey] = useState<Record<string, string>>({})
  const attachmentItems = items ?? []

  const imageAttachments = useMemo(
    () => attachmentItems.filter((attachment) => (attachment.mime_type || "").toLowerCase().startsWith("image/")),
    [attachmentItems]
  )
  const imageAttachmentSignature = useMemo(
    () => imageAttachments.map((attachment) => getAttachmentKey(attachment)).join("|"),
    [imageAttachments]
  )

  useEffect(() => {
    let cancelled = false
    const currentImageAttachments = attachmentItems.filter((attachment) =>
      (attachment.mime_type || "").toLowerCase().startsWith("image/")
    )

    const existing: Record<string, string> = {}
    const missing: AiAttachmentMeta[] = []

    for (const attachment of currentImageAttachments) {
      const key = getAttachmentKey(attachment)
      const cached = signedAttachmentPreviewCache.get(key)
      if (cached) {
        existing[key] = cached
      } else if (!failedSignedAttachmentCache.has(key)) {
        missing.push(attachment)
      }
    }

    if (Object.keys(existing).length > 0) {
      setSignedUrlsByKey((prev) => ({ ...prev, ...existing }))
    }

    if (missing.length === 0) return () => { cancelled = true }

    void (async () => {
      const signedPairs = await Promise.all(
        missing.map(async (attachment) => {
          const key = getAttachmentKey(attachment)
          const { data, error } = await supabase.storage.from("attachments").createSignedUrl(attachment.file_path, 600)
          if (error || !data?.signedUrl) {
            failedSignedAttachmentCache.add(key)
            return null
          }
          return { key, url: data.signedUrl }
        })
      )

      if (cancelled) return
      const nextMap: Record<string, string> = {}
      for (const pair of signedPairs) {
        if (!pair) continue
        signedAttachmentPreviewCache.set(pair.key, pair.url)
        nextMap[pair.key] = pair.url
      }
      if (Object.keys(nextMap).length > 0) {
        setSignedUrlsByKey((prev) => ({ ...prev, ...nextMap }))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [imageAttachmentSignature, attachmentItems, supabase])

  if (attachmentItems.length === 0) return null

  return (
    <div className="mt-2 grid gap-2">
      {attachmentItems.map((attachment) => {
        const key = getAttachmentKey(attachment)
        const publicUrl = getPublicUrl(attachment.file_path)
        const signedUrl = attachment.preview_url ?? signedUrlsByKey[key] ?? signedAttachmentPreviewCache.get(key) ?? null
        const href = signedUrl || publicUrl
        const isImage = (attachment.mime_type || "").toLowerCase().startsWith("image/")
        const fileSizeText = formatFileSize(attachment.size)
        if (isImage) {
          if (failedSignedAttachmentCache.has(key)) {
            return (
              <div
                key={key}
                className="max-w-[340px] rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700"
                title={attachment.file_name}
              >
                <div className="truncate font-medium">{attachment.file_name}</div>
                <div className="mt-0.5 text-[11px] text-gray-500">
                  {attachment.mime_type || "image"}
                  {fileSizeText ? ` • ${fileSizeText}` : ""}
                </div>
              </div>
            )
          }
          return (
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="block max-w-[340px] overflow-hidden rounded-md border border-gray-200 bg-white"
              title={attachment.file_name}
            >
              <img
                src={href}
                alt={attachment.file_name}
                loading="lazy"
                className="block max-h-56 w-full object-cover"
              />
              <div className="truncate border-t border-gray-100 px-2 py-1 text-[11px] text-gray-600">
                {attachment.file_name}
                {fileSizeText ? ` (${fileSizeText})` : ""}
              </div>
            </a>
          )
        }
        return (
          <a
            key={key}
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="max-w-[340px] rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
          >
            <div className="truncate font-medium text-gray-800">{attachment.file_name}</div>
            <div className="mt-0.5 text-[11px] text-gray-500">
              {attachment.mime_type || "file"}
              {fileSizeText ? ` • ${fileSizeText}` : ""}
            </div>
          </a>
        )
      })}
    </div>
  )
}

function getPublicUrl(path: string) {
  // Rely on signed/public policy configured for the attachments bucket
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return path
  return `${base}/storage/v1/object/public/attachments/${path}`
}

function formatFileSize(size: number | null | undefined): string {
  if (!Number.isFinite(size) || !size || size <= 0) return ""
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function getAttachmentKey(attachment: AiAttachmentMeta): string {
  return attachment.id || attachment.file_path
}


