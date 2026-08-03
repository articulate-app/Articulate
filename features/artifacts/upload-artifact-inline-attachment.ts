import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { sanitizeStorageFileName } from "../../utils/storage"

export type UploadedArtifactInlineAttachment = {
  attachmentId: string
  url: string
  mediaType: "image" | "video"
  fileName: string
}

/**
 * Upload an inline image/video for an artifact body (TipTap attachmentBlock).
 * Uses the same `attachments` bucket + `table_name=artifacts` pattern as the media worker.
 */
export async function uploadArtifactInlineAttachment(
  artifactId: string,
  file: File,
): Promise<UploadedArtifactInlineAttachment | null> {
  const id = artifactId?.trim()
  if (!id) return null
  const supabase = createClientComponentClient()
  const mediaType = file.type.toLowerCase().startsWith("video/") ? "video" : "image"
  const safeName = sanitizeStorageFileName(file.name || `${mediaType}.bin`)
  const filePath = `artifacts/${id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`

  const { error: uploadError } = await supabase.storage
    .from("attachments")
    .upload(filePath, file, { upsert: false, contentType: file.type || undefined })
  if (uploadError) throw uploadError

  const { data: inserted, error: dbError } = await supabase
    .from("attachments")
    .insert({
      table_name: "artifacts",
      record_id: id,
      file_name: file.name || safeName,
      file_path: filePath,
      mime_type: file.type || null,
      size: file.size,
      media_type: mediaType,
    })
    .select("id, file_path, file_name")
    .single()

  if (dbError || !inserted?.id) {
    // Retry without media_type for older schemas.
    const retry = await supabase
      .from("attachments")
      .insert({
        table_name: "artifacts",
        record_id: id,
        file_name: file.name || safeName,
        file_path: filePath,
        mime_type: file.type || null,
        size: file.size,
      })
      .select("id, file_path, file_name")
      .single()
    if (retry.error || !retry.data?.id) {
      throw retry.error ?? dbError ?? new Error("Could not create attachment")
    }
    const { data: signed } = await supabase.storage
      .from("attachments")
      .createSignedUrl(retry.data.file_path, 60 * 60 * 24 * 7)
    if (!signed?.signedUrl) throw new Error("Could not sign attachment URL")
    return {
      attachmentId: retry.data.id,
      url: signed.signedUrl,
      mediaType,
      fileName: retry.data.file_name || safeName,
    }
  }

  const { data: signed } = await supabase.storage
    .from("attachments")
    .createSignedUrl(inserted.file_path, 60 * 60 * 24 * 7)
  if (!signed?.signedUrl) throw new Error("Could not sign attachment URL")

  return {
    attachmentId: inserted.id,
    url: signed.signedUrl,
    mediaType,
    fileName: inserted.file_name || safeName,
  }
}
