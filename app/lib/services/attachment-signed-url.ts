"use client"

import { getSupabaseBrowser } from "../../../lib/supabase-browser"

export type AttachmentRecord = {
  id: string
  file_name: string | null
  file_path: string | null
  mime_type: string | null
  size: number | null
  media_type: string | null
  width: number | null
  height: number | null
  duration_seconds: number | null
  caption: string | null
  alt_text: string | null
}

export type SignedAttachmentUrl = {
  attachmentId: string
  signedUrl: string
  expiresInSeconds: number
  record: AttachmentRecord
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number; record: AttachmentRecord }>()
const failedIds = new Set<string>()

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function normalizeAttachmentRecord(row: Record<string, unknown>): AttachmentRecord | null {
  const id = toTrimmedString(row.id)
  if (!id) return null
  return {
    id,
    file_name: toTrimmedString(row.file_name),
    file_path: toTrimmedString(row.file_path),
    mime_type: toTrimmedString(row.mime_type),
    size: typeof row.size === "number" && Number.isFinite(row.size) ? row.size : null,
    media_type: toTrimmedString(row.media_type),
    width: typeof row.width === "number" && Number.isFinite(row.width) ? row.width : null,
    height: typeof row.height === "number" && Number.isFinite(row.height) ? row.height : null,
    duration_seconds:
      typeof row.duration_seconds === "number" && Number.isFinite(row.duration_seconds)
        ? row.duration_seconds
        : null,
    caption: toTrimmedString(row.caption),
    alt_text: toTrimmedString(row.alt_text),
  }
}

/**
 * Resolve attachment row(s) by id and return signed storage URLs.
 * Uses an in-memory cache keyed by attachment id (refreshes ~60s before expiry).
 */
export async function resolveAttachmentSignedUrls(
  attachmentIds: string[],
  options?: { expiresInSeconds?: number; bucket?: string },
): Promise<Record<string, SignedAttachmentUrl>> {
  const expiresInSeconds = options?.expiresInSeconds ?? 3600
  const bucket = options?.bucket ?? "attachments"
  const uniqueIds = [...new Set(attachmentIds.map((id) => id.trim()).filter(Boolean))]
  if (uniqueIds.length === 0) return {}

  const now = Date.now()
  const result: Record<string, SignedAttachmentUrl> = {}
  const missing: string[] = []

  for (const id of uniqueIds) {
    if (failedIds.has(id)) continue
    const cached = signedUrlCache.get(id)
    if (cached && cached.expiresAt > now + 60_000) {
      result[id] = {
        attachmentId: id,
        signedUrl: cached.url,
        expiresInSeconds,
        record: cached.record,
      }
      continue
    }
    missing.push(id)
  }

  if (missing.length === 0) return result

  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase
    .from("attachments")
    .select(
      "id, file_name, file_path, mime_type, size, media_type, width, height, duration_seconds, caption, alt_text",
    )
    .in("id", missing)

  if (error) throw error

  const recordsById = new Map<string, AttachmentRecord>()
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const record = normalizeAttachmentRecord(row)
    if (record) recordsById.set(record.id, record)
  }

  await Promise.all(
    missing.map(async (id) => {
      const record = recordsById.get(id)
      if (!record?.file_path) {
        failedIds.add(id)
        return
      }
      const { data: signed, error: signError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(record.file_path, expiresInSeconds)
      if (signError || !signed?.signedUrl) {
        failedIds.add(id)
        return
      }
      signedUrlCache.set(id, {
        url: signed.signedUrl,
        expiresAt: now + expiresInSeconds * 1000,
        record,
      })
      result[id] = {
        attachmentId: id,
        signedUrl: signed.signedUrl,
        expiresInSeconds,
        record,
      }
    }),
  )

  return result
}

export async function resolveAttachmentSignedUrl(
  attachmentId: string,
  options?: { expiresInSeconds?: number; bucket?: string },
): Promise<SignedAttachmentUrl | null> {
  const map = await resolveAttachmentSignedUrls([attachmentId], options)
  return map[attachmentId.trim()] ?? null
}
