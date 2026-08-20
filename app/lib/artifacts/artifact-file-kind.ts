import {
  getAttachmentFileKind,
  type AttachmentFileKind,
} from "../../../features/ai-chat/attachment-file-meta"

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asTrimmed(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/**
 * Directory / list icon for an output — same Word / PDF / image / file glyphs as templates.
 */
export function resolveArtifactDirectoryFileKind(input: {
  title?: string | null
  artifactType?: string | null
  importFileName?: string | null
  importMime?: string | null
  importKind?: string | null
}): AttachmentFileKind {
  const fromImport = getAttachmentFileKind({
    fileName: input.importFileName,
    mimeType: input.importMime,
  })
  if (fromImport !== "file") return fromImport

  const fromTitle = getAttachmentFileKind({ fileName: input.title })
  if (fromTitle !== "file") return fromTitle

  const artifactType = (input.artifactType ?? "").trim().toLowerCase()
  if (artifactType === "image" || artifactType === "gallery" || artifactType === "image_gallery") {
    return "image"
  }
  if ((input.importKind ?? "").trim().toLowerCase() === "url") return "file"

  if (
    !artifactType
    || artifactType === "document"
    || artifactType === "article"
    || artifactType === "rich_text"
  ) {
    return "word"
  }
  return "file"
}

export function resolveArtifactDirectoryFileKindFromRow(row: {
  title?: unknown
  artifact_type?: unknown
  import_file_name?: unknown
  import_kind?: unknown
  import_mime?: unknown
  metadata?: unknown
}): AttachmentFileKind {
  const metadata = asRecord(row.metadata)
  return resolveArtifactDirectoryFileKind({
    title: asTrimmed(row.title),
    artifactType: asTrimmed(row.artifact_type),
    importFileName:
      asTrimmed(row.import_file_name)
      ?? asTrimmed(metadata?.import_file_name),
    importMime:
      asTrimmed(row.import_mime)
      ?? asTrimmed(metadata?.import_mime)
      ?? asTrimmed(metadata?.mime_type),
    importKind:
      asTrimmed(row.import_kind)
      ?? asTrimmed(metadata?.import_kind),
  })
}
