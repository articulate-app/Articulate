export type TaskComponentOutputAttachment = {
  id: string
  file_name: string
  file_path: string
  mime_type: string | null
  signed_url?: string | null
  public_url?: string | null
  size: number | null
  media_type: "image" | "video" | "file" | null
  width: number | null
  height: number | null
  duration_seconds: number | null
  caption: string | null
  alt_text: string | null
  sort_order: number | null
  uploaded_by: number | null
  uploaded_at: string | null
  metadata: unknown
}

function toNumberOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function normalizeTaskComponentOutputAttachments(
  rows: unknown
): TaskComponentOutputAttachment[] {
  if (!Array.isArray(rows)) return []
  const normalized: TaskComponentOutputAttachment[] = []
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue
    const row = raw as Record<string, unknown>
    const id = typeof row.id === "string" ? row.id : ""
    const filePath = typeof row.file_path === "string" ? row.file_path : ""
    if (!id || !filePath) continue
    const mediaTypeRaw = typeof row.media_type === "string" ? row.media_type.toLowerCase() : ""
    const mediaType =
      mediaTypeRaw === "image"
        ? "image"
        : mediaTypeRaw === "video"
          ? "video"
          : mediaTypeRaw === "file"
            ? "file"
            : null
    normalized.push({
      id,
      file_name: typeof row.file_name === "string" ? row.file_name : "",
      file_path: filePath,
      mime_type: typeof row.mime_type === "string" ? row.mime_type : null,
      signed_url: typeof row.signed_url === "string" ? row.signed_url : null,
      public_url: typeof row.public_url === "string" ? row.public_url : null,
      size: toNumberOrNull(row.size),
      media_type: mediaType,
      width: toNumberOrNull(row.width),
      height: toNumberOrNull(row.height),
      duration_seconds: toNumberOrNull(row.duration_seconds),
      caption: typeof row.caption === "string" ? row.caption : null,
      alt_text: typeof row.alt_text === "string" ? row.alt_text : null,
      sort_order: toNumberOrNull(row.sort_order),
      uploaded_by: toNumberOrNull(row.uploaded_by),
      uploaded_at: typeof row.uploaded_at === "string" ? row.uploaded_at : null,
      metadata: row.metadata ?? null,
    })
  }
  return normalized.sort((a, b) => {
    const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER
    const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER
    if (aOrder !== bOrder) return aOrder - bOrder
    return (a.uploaded_at ?? "").localeCompare(b.uploaded_at ?? "")
  })
}
