export type InlineMarkdownSegment =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string }

/**
 * Parse light inline markdown (`**bold**`, `*italic*`, `` `code` ``).
 * Used for AI status / thinking lines that are not full Markdown documents.
 */
export function parseInlineMarkdownSegments(text: string): InlineMarkdownSegment[] {
  if (!text) return []

  const segments: InlineMarkdownSegment[] = []
  // Bold checked before italic so ** wins over *.
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) != null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) })
    }
    const token = match[0]
    if (token.startsWith("**") && token.endsWith("**") && token.length >= 4) {
      segments.push({ type: "bold", value: token.slice(2, -2) })
    } else if (token.startsWith("`") && token.endsWith("`") && token.length >= 2) {
      segments.push({ type: "code", value: token.slice(1, -1) })
    } else if (token.startsWith("*") && token.endsWith("*") && token.length >= 2) {
      segments.push({ type: "italic", value: token.slice(1, -1) })
    } else {
      segments.push({ type: "text", value: token })
    }
    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) })
  }

  return segments.length > 0 ? segments : [{ type: "text", value: text }]
}
