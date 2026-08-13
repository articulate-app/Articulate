export type AttachmentFileKind =
  | "image"
  | "pdf"
  | "word"
  | "spreadsheet"
  | "text"
  | "csv"
  | "json"
  | "html"
  | "file"

export function getAttachmentExtension(fileName: string | null | undefined): string {
  const name = (fileName || "").trim()
  const idx = name.lastIndexOf(".")
  if (idx < 0 || idx === name.length - 1) return ""
  return name.slice(idx + 1).toLowerCase()
}

export function getAttachmentFileKind(args: {
  fileName?: string | null
  mimeType?: string | null
}): AttachmentFileKind {
  const mime = (args.mimeType || "").toLowerCase()
  const ext = getAttachmentExtension(args.fileName)

  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) {
    return "image"
  }
  if (mime === "application/pdf" || ext === "pdf") return "pdf"
  if (
    mime.includes("wordprocessingml")
    || mime.includes("msword")
    || ext === "doc"
    || ext === "docx"
  ) {
    return "word"
  }
  if (
    mime.includes("spreadsheetml")
    || mime === "application/vnd.ms-excel"
    || mime.includes("ms-excel")
    || ext === "xlsx"
    || ext === "xls"
  ) {
    return "spreadsheet"
  }
  if (mime === "text/csv" || ext === "csv") return "csv"
  if (mime === "application/json" || ext === "json") return "json"
  if (mime === "text/html" || ext === "html" || ext === "htm") return "html"
  if (
    mime.startsWith("text/")
    || ext === "txt"
    || ext === "md"
    || ext === "markdown"
  ) {
    return "text"
  }
  return "file"
}

/** Short ChatGPT-style type label under the file name. */
export function getAttachmentTypeLabel(kind: AttachmentFileKind): string {
  switch (kind) {
    case "image":
      return "Image"
    case "pdf":
      return "PDF"
    case "word":
      return "Document"
    case "spreadsheet":
      return "Spreadsheet"
    case "text":
      return "Text"
    case "csv":
      return "CSV"
    case "json":
      return "JSON"
    case "html":
      return "HTML"
    default:
      return "File"
  }
}

export function truncateAttachmentFileName(fileName: string, maxChars = 32): string {
  const value = fileName.trim()
  if (value.length <= maxChars) return value
  return `${value.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`
}
