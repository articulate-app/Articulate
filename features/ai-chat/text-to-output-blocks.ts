export type TableOutputBlock = {
  type: "table"
  headers: string[]
  rows: string[][]
}

export type ParagraphOutputBlock = {
  type: "paragraph"
  text: string
}

export type TextOutputBlock = ParagraphOutputBlock | TableOutputBlock

export function escapeHtmlForOutput(value: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function isMarkdownTableSeparator(line: string) {
  const trimmed = line.trim()
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)
}

export function splitMarkdownTableRow(line: string) {
  let trimmed = line.trim()

  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1)
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1)

  return trimmed.split("|").map((cell) => cell.trim())
}

export function parseMarkdownTable(lines: string[], startIndex: number) {
  const headerLine = lines[startIndex]
  const separatorLine = lines[startIndex + 1]

  if (!headerLine || !separatorLine) return null
  if (!headerLine.includes("|")) return null
  if (!isMarkdownTableSeparator(separatorLine)) return null

  const headers = splitMarkdownTableRow(headerLine)
  if (headers.length < 2) return null

  const rows: string[][] = []
  let index = startIndex + 2

  while (index < lines.length) {
    const line = lines[index]

    if (!line.trim()) break
    if (!line.includes("|")) break

    const row = splitMarkdownTableRow(line)
    if (row.length < 2) break

    rows.push(row)
    index += 1
  }

  return {
    block: {
      type: "table" as const,
      headers,
      rows,
    },
    nextIndex: index,
  }
}

export function paragraphBlockFromLines(lines: string[]): ParagraphOutputBlock | null {
  const text = lines.join("\n").trim()
  if (!text) return null

  return {
    type: "paragraph",
    text: `<p>${escapeHtmlForOutput(text).replace(/\n/g, "<br>")}</p>`,
  }
}

export function textToOutputBlocks(text: string): TextOutputBlock[] {
  const trimmed = String(text ?? "").trim()
  if (!trimmed) return []

  const lines = trimmed.split(/\r?\n/)
  const blocks: TextOutputBlock[] = []
  let paragraphLines: string[] = []
  let index = 0

  const flushParagraph = () => {
    const block = paragraphBlockFromLines(paragraphLines)
    if (block) blocks.push(block)
    paragraphLines = []
  }

  while (index < lines.length) {
    const maybeTable = parseMarkdownTable(lines, index)

    if (maybeTable) {
      flushParagraph()
      blocks.push(maybeTable.block)
      index = maybeTable.nextIndex
      continue
    }

    const line = lines[index]

    if (!line.trim()) {
      flushParagraph()
      index += 1
      continue
    }

    paragraphLines.push(line)
    index += 1
  }

  flushParagraph()

  return blocks
}

export function htmlToPlainTextForReparse(html: string): string {
  return String(html ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<\/(h[1-6]|div|blockquote|tr|p)>/gi, "\n\n")
    .replace(/<\/(ul|ol|table|section|article)>/gi, "\n\n")
    .replace(/<(?:p|h[1-6]|div|ul|ol|blockquote|tr|table|thead|tbody|tfoot)[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

type BlockWithAttachment = { type: string }

export function reparseTextBlocksInPlace<T extends BlockWithAttachment>(
  blocks: T[],
  markdownSource: string
): Array<T | TextOutputBlock> {
  const parsed = textToOutputBlocks(markdownSource)
  if (parsed.length === 0) return blocks

  const hasAttachments = blocks.some((block) => block.type === "attachment")
  if (!hasAttachments) return parsed

  const out: Array<T | TextOutputBlock> = []
  let inserted = false

  for (const block of blocks) {
    if (block.type === "attachment") {
      out.push(block)
      continue
    }
    if (block.type === "paragraph" || block.type === "text" || block.type === "table") {
      if (!inserted) {
        out.push(...parsed)
        inserted = true
      }
      continue
    }
    out.push(block)
  }

  if (!inserted) out.unshift(...parsed)
  return out
}

export function markdownFromRenderableBlocks(
  blocks: Array<{ type: string; text?: string; headers?: string[]; rows?: string[][] }>
): string {
  const parts: string[] = []

  for (const block of blocks) {
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text)
      continue
    }
    if (block.type === "paragraph" && typeof block.text === "string") {
      parts.push(htmlToPlainTextForReparse(block.text))
      continue
    }
    if (block.type === "table" && Array.isArray(block.headers) && Array.isArray(block.rows)) {
      const headerLine = `| ${block.headers.join(" | ")} |`
      const separatorLine = `| ${block.headers.map(() => "---").join(" | ")} |`
      const rowLines = block.rows.map((row) => `| ${row.join(" | ")} |`)
      parts.push([headerLine, separatorLine, ...rowLines].join("\n"))
    }
  }

  return parts.join("\n\n").trim()
}

/** Plain markdown table for clipboard copy. */
export function tableBlockToClipboardText(headers: string[], rows: string[][]): string {
  const escapeCell = (value: string) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")
  const safeHeaders = (headers ?? []).map(escapeCell)
  if (safeHeaders.length === 0) {
    const width = Math.max(0, ...rows.map((row) => row.length))
    if (width === 0) return ""
    const inferred = Array.from({ length: width }, (_, index) => `Col ${index + 1}`)
    return tableBlockToClipboardText(inferred, rows)
  }
  const headerLine = `| ${safeHeaders.join(" | ")} |`
  const separatorLine = `| ${safeHeaders.map(() => "---").join(" | ")} |`
  const rowLines = (rows ?? []).map((row) =>
    `| ${safeHeaders.map((_, index) => escapeCell(row[index] ?? "")).join(" | ")} |`,
  )
  return [headerLine, separatorLine, ...rowLines].join("\n")
}

export function enhanceBlocksWithMarkdownTables<T extends BlockWithAttachment>(
  blocks: T[],
  fallbackMarkdown?: string | null
): Array<T | TextOutputBlock> {
  const markdown =
    (typeof fallbackMarkdown === "string" && fallbackMarkdown.trim()) ||
    markdownFromRenderableBlocks(blocks as Array<{ type: string; text?: string; headers?: string[]; rows?: string[][] }>)

  if (!markdown.includes("|")) return blocks

  const reparsed = textToOutputBlocks(markdown)
  if (!reparsed.some((block) => block.type === "table")) return blocks

  return reparseTextBlocksInPlace(blocks, markdown)
}
