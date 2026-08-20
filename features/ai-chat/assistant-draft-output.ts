import { softenAssistantMarkdownProse } from "./assistant-markdown-prose"

const MIN_DOCUMENT_CHARS = 280
const MIN_DOCUMENT_WORDS = 80
const MIN_LONG_PROSE_WORDS = 180

const ATX_HEADING_RE = /(?:^|\n)[ \t]{0,3}#{1,6}[ \t]+\S/
const HTML_HEADING_RE = /<h[1-3][\s>]/i
const OUTRO_HINT_RE =
  /(?:como b[oó]nus|se quiser(?:es)?|posso (?:adaptar|reduzir|encurtar|traduzir|fazer)|diz s[oó]|queres que|want me to|if you(?:'d| would) like|let me know|as a bonus|would you like)/i

export type AssistantDraftDocumentParts = {
  intro: string
  body: string
  outro: string
}

function stripHeadingMarks(value: string): string {
  return value
    .replace(/^#{1,6}\s+/, "")
    .replace(/[*_`]+/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function headingStartIndex(text: string): number {
  const atx = text.match(ATX_HEADING_RE)
  const html = text.match(HTML_HEADING_RE)
  const atxIndex = atx?.index ?? -1
  const htmlIndex = html?.index ?? -1
  const adjustedAtx = atxIndex >= 0 && text[atxIndex] === "\n" ? atxIndex + 1 : atxIndex
  if (adjustedAtx < 0) return htmlIndex
  if (htmlIndex < 0) return adjustedAtx
  return Math.min(adjustedAtx, htmlIndex)
}

function isConversationalOutroBlock(block: string): boolean {
  const text = block.trim()
  if (!text) return false
  if (OUTRO_HINT_RE.test(text)) return true
  return /\?\s*$/.test(text) && text.split(/\s+/).length <= 80
}

function peelTrailingOutro(markdown: string): { body: string; outro: string } {
  const blocks = markdown.split(/\n{2,}/)
  const outro: string[] = []
  while (blocks.length > 1) {
    const last = blocks[blocks.length - 1] ?? ""
    if (!isConversationalOutroBlock(last)) break
    outro.unshift(blocks.pop() ?? "")
  }
  return {
    body: blocks.join("\n\n").trim(),
    outro: outro.join("\n\n").trim(),
  }
}

/**
 * Split chat chatter from the document: leading setup before the first heading
 * stays as intro, trailing offers/questions as outro.
 */
export function splitAssistantDraftDocument(
  markdown: string | null | undefined,
): AssistantDraftDocumentParts {
  const text = softenAssistantMarkdownProse(String(markdown ?? "").replace(/\r\n/g, "\n")).trim()
  if (!text) return { intro: "", body: "", outro: "" }

  const headingAt = headingStartIndex(text)
  if (headingAt > 0) {
    const intro = text.slice(0, headingAt).trim()
    const peeled = peelTrailingOutro(text.slice(headingAt).trim())
    return { intro, body: peeled.body, outro: peeled.outro }
  }

  const peeled = peelTrailingOutro(text)
  return { intro: "", body: peeled.body, outro: peeled.outro }
}

/** Long-form assistant text that should render as a document card, not a chat bubble. */
export function isAssistantDraftDocument(markdown: string | null | undefined): boolean {
  const text = String(markdown ?? "").trim()
  if (text.length < MIN_DOCUMENT_CHARS) return false
  const words = text.split(/\s+/).filter(Boolean).length
  const hasHeading =
    /(?:^|\n)\s{0,3}#{1,6}\s+\S/.test(text)
    || /[^\n]#{1,6}\s+\S/.test(text)
    || /<h[1-6][\s>]/i.test(text)
  const paragraphs = text.split(/\n\s*\n/).filter((block) => block.trim().length > 40)
  if (hasHeading && words >= MIN_DOCUMENT_WORDS) return true
  return words >= MIN_LONG_PROSE_WORDS && paragraphs.length >= 3
}

export function titleFromDraftDocument(markdown: string | null | undefined): string {
  const text = String(markdown ?? "").trim()
  const atx = text.match(/(?:^|\n)\s{0,3}#{1,6}\s+(.+)/)
  if (atx?.[1]) {
    const title = stripHeadingMarks(atx[1])
    if (title) return title.slice(0, 120)
  }
  const htmlHeading = text.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)
  if (htmlHeading?.[1]) {
    const title = stripHeadingMarks(htmlHeading[1])
    if (title) return title.slice(0, 120)
  }
  const firstLine = text.split(/\n/).map((line) => line.trim()).find((line) => line.length > 8)
  return stripHeadingMarks(firstLine || "Draft").slice(0, 120) || "Draft"
}
