"use client"

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

export const PUBLIC_MEDIA_BUCKET = "public-media" as const

const supabase = createClientComponentClient()

const ALLOWED_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const
type AllowedImageExtension = (typeof ALLOWED_IMAGE_EXTENSIONS)[number]

function getFileExtension(file: File): AllowedImageExtension | null {
  const fromName = file.name.split(".").pop()?.toLowerCase().trim()
  if (fromName && (ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(fromName)) {
    return fromName as AllowedImageExtension
  }

  // Fallback to mime type when filename is missing/odd.
  const fromType = file.type.toLowerCase()
  if (fromType === "image/png") return "png"
  if (fromType === "image/webp") return "webp"
  if (fromType === "image/jpg") return "jpg"
  if (fromType === "image/jpeg") return "jpeg"
  return null
}

/**
 * Returns the URL to render in <img src="...">, supporting legacy full URLs.
 * - null/empty => null
 * - starts with http => return as-is
 * - otherwise treat as a storage path in `PUBLIC_MEDIA_BUCKET` and return getPublicUrl(...)
 */
export function getImageUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (trimmed.toLowerCase().startsWith("http")) return trimmed

  const { data } = supabase.storage.from(PUBLIC_MEDIA_BUCKET).getPublicUrl(trimmed)
  return data.publicUrl || null
}

/**
 * Upload an image to Supabase Storage and return the final storage path.
 *
 * `path` should be a directory prefix like:
 * - projects/<projectId>
 * - users/<userId>
 *
 * The final stored path will be `${path}/${uuid}.${ext}`.
 */
export async function uploadImage({
  bucket,
  path,
  file,
  upsert = true,
}: {
  bucket: string
  path: string
  file: File
  upsert?: boolean
}): Promise<{ storagePath: string | null; error: Error | null }> {
  const ext = getFileExtension(file)
  if (!ext) {
    return {
      storagePath: null,
      error: new Error("Unsupported image type. Please upload a png, jpg, or webp."),
    }
  }

  const normalizedPrefix = path.replace(/\/+$/g, "")
  const storagePath = `${normalizedPrefix}/${crypto.randomUUID()}.${ext}`

  const supabase = createClientComponentClient()
  const { error } = await supabase.storage.from(bucket).upload(storagePath, file, {
    upsert,
    contentType: file.type || undefined,
  })

  return { storagePath: error ? null : storagePath, error: error as any }
}


