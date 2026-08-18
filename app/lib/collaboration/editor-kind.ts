export type ArtifactEditorKind =
  | "rich_text"
  | "html_email"
  | "media"
  | "code"
  | "image"
  | "video"
  | "audio"

const SPECIALIZED = new Set<string>([
  "html_email",
  "html",
  "email",
  "media",
  "code",
  "image",
  "video",
  "audio",
])

const RICH_TEXT = new Set(["rich_text", "tiptap", "tiptap_json"])
const MEDIA_BLOCK_TYPES = new Set(["image", "video", "audio", "media"])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function editorKindFromContentBlocks(contentJson: unknown): ArtifactEditorKind | null {
  const blocks = asRecord(contentJson)?.blocks
  if (!Array.isArray(blocks) || blocks.length === 0) return null
  const types = blocks.map((block) => {
    const type = String(asRecord(block)?.type ?? "").trim().toLowerCase()
    if (type === "html_email" || type === "email") return "html_email"
    if (type === "code") return "code"
    if (MEDIA_BLOCK_TYPES.has(type)) return type === "media" ? "media" : type
    return "rich_text"
  })
  if (types.every((type) => type === "html_email")) return "html_email"
  if (types.every((type) => type === "code")) return "code"
  if (types.every((type) => type === "image")) return "image"
  if (types.every((type) => type === "video")) return "video"
  if (types.every((type) => type === "audio")) return "audio"
  if (types.every((type) => type === "media" || MEDIA_BLOCK_TYPES.has(type))) return "media"
  return null
}

function readHint(artifact: {
  content_json?: unknown
  metadata?: unknown
}, key: "editor_kind" | "content_format"): string {
  const contentJson = asRecord(artifact.content_json)
  const metadata = asRecord(artifact.metadata)
  return String(contentJson?.[key] ?? metadata?.[key] ?? "").trim().toLowerCase()
}

export function resolveArtifactEditorKind(artifact: {
  content_json?: unknown
  metadata?: unknown
} | null | undefined): ArtifactEditorKind {
  const editorKind = readHint(artifact ?? {}, "editor_kind")
  if (SPECIALIZED.has(editorKind)) return editorKind as ArtifactEditorKind
  if (RICH_TEXT.has(editorKind)) return "rich_text"
  const format = readHint(artifact ?? {}, "content_format")
  if (SPECIALIZED.has(format)) {
    if (format === "html" || format === "email") return "html_email"
    return format as ArtifactEditorKind
  }
  if (RICH_TEXT.has(format)) return "rich_text"
  return editorKindFromContentBlocks(artifact?.content_json) ?? "rich_text"
}

export function isCollaborativeRichTextEditorKind(
  editorKind: string | null | undefined,
): boolean {
  return RICH_TEXT.has(String(editorKind ?? "").trim().toLowerCase())
}
