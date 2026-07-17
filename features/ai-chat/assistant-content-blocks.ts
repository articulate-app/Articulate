export function getAssistantContentBlocks(contentJson: unknown): unknown[] | null {
  if (Array.isArray(contentJson)) {
    return contentJson
  }

  if (contentJson && typeof contentJson === "object") {
    const record = contentJson as Record<string, unknown>
    if (Array.isArray(record.content)) {
      return record.content
    }
    if (Array.isArray(record.blocks)) {
      return record.blocks
    }
  }

  return null
}
