"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { getSupabaseBrowser } from "../../lib/supabase-browser"
import type { AiAttachmentMeta } from "./types"
import { AttachmentFileChip } from "./AttachmentFileChip"
import { cn } from "../../app/lib/utils"

const signedAttachmentPreviewCache = new Map<string, string>()
const failedSignedAttachmentCache = new Set<string>()
/** In-flight dedupe so parallel mounts don't each call createSignedUrl. */
const inflightSignedUrlByPath = new Map<string, Promise<string | null>>()

function getAttachmentKey(attachment: AiAttachmentMeta): string {
  return attachment.file_path?.trim() || attachment.id || ""
}

function isImageAttachment(attachment: AiAttachmentMeta): boolean {
  return (attachment.mime_type || "").toLowerCase().startsWith("image/")
}

async function signAttachmentPath(path: string): Promise<string | null> {
  const normalized = path.trim()
  if (!normalized) return null
  const cached = signedAttachmentPreviewCache.get(normalized)
  if (cached) return cached
  if (failedSignedAttachmentCache.has(normalized)) return null

  const existing = inflightSignedUrlByPath.get(normalized)
  if (existing) return existing

  const supabase = getSupabaseBrowser()
  const promise = (async () => {
    // Bucket `attachments` is private — never use /object/public/…
    const { data, error } = await supabase.storage
      .from("attachments")
      .createSignedUrl(normalized, 600)
    if (error || !data?.signedUrl) {
      failedSignedAttachmentCache.add(normalized)
      return null
    }
    signedAttachmentPreviewCache.set(normalized, data.signedUrl)
    return data.signedUrl
  })().finally(() => {
    inflightSignedUrlByPath.delete(normalized)
  })

  inflightSignedUrlByPath.set(normalized, promise)
  return promise
}

async function signAttachmentPaths(paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.map((p) => p.trim()).filter(Boolean))]
  const out: Record<string, string> = {}
  const missing: string[] = []

  for (const path of unique) {
    const cached = signedAttachmentPreviewCache.get(path)
    if (cached) {
      out[path] = cached
      continue
    }
    if (failedSignedAttachmentCache.has(path)) continue
    missing.push(path)
  }

  if (missing.length === 0) return out

  if (missing.length > 1) {
    try {
      const supabase = getSupabaseBrowser()
      const { data, error } = await supabase.storage
        .from("attachments")
        .createSignedUrls(missing, 600)
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const path = typeof row.path === "string" ? row.path : ""
          const url = typeof row.signedUrl === "string" ? row.signedUrl : ""
          if (!path || !url || row.error) {
            if (path) failedSignedAttachmentCache.add(path)
            continue
          }
          signedAttachmentPreviewCache.set(path, url)
          out[path] = url
        }
        return out
      }
    } catch {
      // Fall through to per-path signing with in-flight dedupe.
    }
  }

  const pairs = await Promise.all(
    missing.map(async (path) => {
      const url = await signAttachmentPath(path)
      return url ? { path, url } : null
    }),
  )
  for (const pair of pairs) {
    if (!pair) continue
    out[pair.path] = pair.url
  }
  return out
}

function LazyFileChip({
  attachment,
}: {
  attachment: AiAttachmentMeta
}) {
  const path = attachment.file_path?.trim() || ""
  const initialHref =
    attachment.preview_url?.trim()
    || (path ? signedAttachmentPreviewCache.get(path) : null)
    || null
  const [href, setHref] = useState<string | null>(initialHref)
  const [isOpening, setIsOpening] = useState(false)

  const openSigned = useCallback(async () => {
    if (!path || isOpening) return
    setIsOpening(true)
    try {
      // Prefer a fresh/cache-backed sign on click — message preview_url may be expired.
      const url = await signAttachmentPath(path)
      if (!url) return
      setHref(url)
      window.open(url, "_blank", "noopener,noreferrer")
    } finally {
      setIsOpening(false)
    }
  }, [isOpening, path])

  return (
    <button
      type="button"
      onClick={() => void openSigned()}
      disabled={isOpening || !path}
      className="appearance-none border-0 bg-transparent p-0 text-left disabled:opacity-60"
      title={attachment.file_name}
      aria-label={`Open ${attachment.file_name}`}
    >
      <AttachmentFileChip
        fileName={attachment.file_name}
        mimeType={attachment.mime_type}
        readOnly
        className={cn(path && "cursor-pointer transition-colors hover:border-gray-300 hover:bg-gray-50")}
      />
    </button>
  )
}

export function Attachments({
  items,
  className,
}: {
  items?: AiAttachmentMeta[] | null
  className?: string
}) {
  const [signedUrlsByKey, setSignedUrlsByKey] = useState<Record<string, string>>({})
  const attachmentItems = items ?? []

  const imageItems = useMemo(
    () => attachmentItems.filter((attachment) => isImageAttachment(attachment)),
    [attachmentItems],
  )
  const fileItems = useMemo(
    () => attachmentItems.filter((attachment) => !isImageAttachment(attachment)),
    [attachmentItems],
  )

  const imageSignature = useMemo(
    () => imageItems.map((attachment) => getAttachmentKey(attachment)).join("|"),
    [imageItems],
  )

  // Only images need a signed URL on mount (thumbnails). PDFs/DOCX/etc. sign on click.
  useEffect(() => {
    let cancelled = false

    const existing: Record<string, string> = {}
    const missingPaths: string[] = []

    for (const attachment of imageItems) {
      const key = getAttachmentKey(attachment)
      const path = attachment.file_path?.trim()
      if (!key || !path) continue
      if (attachment.preview_url?.trim()) {
        existing[key] = attachment.preview_url.trim()
        continue
      }
      const cached = signedAttachmentPreviewCache.get(path)
      if (cached) {
        existing[key] = cached
      } else if (!failedSignedAttachmentCache.has(path)) {
        missingPaths.push(path)
      }
    }

    if (Object.keys(existing).length > 0) {
      setSignedUrlsByKey((prev) => ({ ...prev, ...existing }))
    }

    if (missingPaths.length === 0) return () => { cancelled = true }

    void (async () => {
      const signedByPath = await signAttachmentPaths(missingPaths)
      if (cancelled) return
      const nextMap: Record<string, string> = {}
      for (const attachment of imageItems) {
        const key = getAttachmentKey(attachment)
        const path = attachment.file_path?.trim()
        if (!key || !path) continue
        const url = signedByPath[path]
        if (url) nextMap[key] = url
      }
      if (Object.keys(nextMap).length > 0) {
        setSignedUrlsByKey((prev) => ({ ...prev, ...nextMap }))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [imageSignature, imageItems])

  if (attachmentItems.length === 0) return null

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {imageItems.map((attachment) => {
        const key = getAttachmentKey(attachment)
        const path = attachment.file_path?.trim() || ""
        const signedUrl =
          attachment.preview_url
          ?? signedUrlsByKey[key]
          ?? (path ? signedAttachmentPreviewCache.get(path) : null)
          ?? null

        if (!signedUrl) {
          return (
            <AttachmentFileChip
              key={key}
              fileName={attachment.file_name}
              mimeType={attachment.mime_type}
              readOnly
            />
          )
        }

        return (
          <a
            key={key}
            href={signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block max-w-[280px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            title={attachment.file_name}
          >
            <img
              src={signedUrl}
              alt={attachment.file_name}
              loading="lazy"
              className="block max-h-56 w-full object-cover"
            />
          </a>
        )
      })}

      {fileItems.map((attachment) => (
        <LazyFileChip
          key={getAttachmentKey(attachment)}
          attachment={attachment}
        />
      ))}
    </div>
  )
}
