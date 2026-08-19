export function decodeBasicHtmlEntities(value: string) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export function htmlToPlainTextWithLineBreaks(html: string) {
  return decodeBasicHtmlEntities(
    String(html ?? "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<\/t[dh]>/gi, "\t")
      .replace(/<[^>]+>/g, "")
  )
}

export function normalizePastedTextForChatInput(text: string) {
  return String(text ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t+/g, "\n")
    .replace(/^\s*[-•*]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function shouldUseHtmlFallback(plain: string, html: string) {
  if (!html) return false

  const plainText = String(plain ?? "")
  const htmlText = String(html ?? "")

  const htmlSuggestsLineBreaks =
    /<br\s*\/?>|<\/(p|div|li|tr|h[1-6])>|<\/t[dh]>/i.test(htmlText)

  if (!htmlSuggestsLineBreaks) return false

  if (plainText.includes("\n")) return false

  return plainText.length > 40
}

export function resolveNormalizedPastedTextForChatInput(data: DataTransfer): string | null {
  const plain = data.getData("text/plain")
  const html = data.getData("text/html")

  const rawText = shouldUseHtmlFallback(plain, html)
    ? htmlToPlainTextWithLineBreaks(html)
    : plain

  const normalized = normalizePastedTextForChatInput(rawText)
  return normalized.length > 0 ? normalized : null
}

const CHAT_RICH_TAG_RE =
  /<\s*(strong|b|em|i|u|s|strike|del|h[1-6]|ul|ol|li|a|blockquote|code|pre|table|thead|tbody|tr|th|td|sub|sup)\b/i

export function extractClipboardHtmlFragment(html: string): string {
  const raw = String(html ?? "")
  const start = raw.indexOf("<!--StartFragment-->")
  const end = raw.indexOf("<!--EndFragment-->")
  if (start >= 0 && end > start) {
    return raw.slice(start + "<!--StartFragment-->".length, end)
  }
  const body = raw.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  if (body?.[1]) return body[1]
  return raw
}

export function htmlLooksRich(html: string): boolean {
  const value = String(html ?? "")
  if (!value.trim()) return false
  if (CHAT_RICH_TAG_RE.test(value)) return true
  const paragraphCount = (value.match(/<p\b/gi) ?? []).length
  return paragraphCount >= 2
}

const CHAT_ALLOWED_TAGS = new Set([
  "H1", "H2", "H3", "H4", "H5", "H6",
  "P", "UL", "OL", "LI",
  "STRONG", "B", "EM", "I", "U", "S", "STRIKE", "DEL",
  "BR", "A", "BLOCKQUOTE", "CODE", "PRE", "SUB", "SUP",
  "SPAN", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD", "HR",
])

const CHAT_DROP_TAGS = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "NOSCRIPT",
  "IMG", "VIDEO", "SOURCE", "FIGURE", "SVG",
])

function isSafeHref(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (/^\s*(javascript|data|vbscript):/i.test(trimmed)) return false
  return /^(https?:|mailto:|tel:|\/|#)/i.test(trimmed)
}

export function sanitizeChatComposerHtml(html: string): string {
  if (typeof DOMParser === "undefined") return ""
  const fragment = extractClipboardHtmlFragment(html)
  const doc = new DOMParser().parseFromString(fragment, "text/html")

  const sanitizeElement = (element: Element) => {
    Array.from(element.children).forEach(sanitizeElement)
    const tag = element.tagName.toUpperCase()
    if (CHAT_DROP_TAGS.has(tag)) {
      element.remove()
      return
    }
    if (!CHAT_ALLOWED_TAGS.has(tag)) {
      const parent = element.parentNode
      if (parent) {
        while (element.firstChild) parent.insertBefore(element.firstChild, element)
        parent.removeChild(element)
      }
      return
    }

    Array.from(element.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase()
      if (tag === "A" && (name === "href" || name === "target" || name === "rel")) {
        if (name === "href" && !isSafeHref(attr.value)) {
          element.removeAttribute(attr.name)
        }
        if (name === "target") element.setAttribute("rel", "noopener noreferrer")
        return
      }
      if (tag === "SPAN" && name === "data-ai-mention") return
      if ((tag === "TD" || tag === "TH") && (name === "colspan" || name === "rowspan")) return
      element.removeAttribute(attr.name)
    })

    if (tag === "SPAN" && !element.getAttribute("data-ai-mention")) {
      const parent = element.parentNode
      if (parent) {
        while (element.firstChild) parent.insertBefore(element.firstChild, element)
        parent.removeChild(element)
      }
    }
  }

  Array.from(doc.body.children).forEach(sanitizeElement)
  return doc.body.innerHTML.trim()
}

export type PastedChatContent =
  | { kind: "html"; html: string }
  | { kind: "text"; text: string }

export type RichHtmlPart =
  | { type: "html"; html: string }
  | { type: "mention"; index: number }

const MENTION_MARKER_RE = /<span\b[^>]*\bdata-ai-mention="(\d+)"[^>]*>\s*<\/span>/gi

export function splitRichHtmlByMentionMarkers(html: string): RichHtmlPart[] {
  const parts: RichHtmlPart[] = []
  const value = String(html ?? "")
  let cursor = 0
  for (const match of value.matchAll(MENTION_MARKER_RE)) {
    const index = match.index ?? 0
    if (index > cursor) {
      parts.push({ type: "html", html: value.slice(cursor, index) })
    }
    parts.push({ type: "mention", index: Number(match[1]) })
    cursor = index + match[0].length
  }
  if (cursor < value.length) {
    parts.push({ type: "html", html: value.slice(cursor) })
  }
  return parts.filter((part) => part.type === "mention" || part.html.trim().length > 0)
}

export function resolvePastedContentForChatInput(data: DataTransfer): PastedChatContent | null {
  const html = data.getData("text/html")
  if (html && htmlLooksRich(html)) {
    const sanitized = sanitizeChatComposerHtml(html)
    if (sanitized && htmlLooksRich(sanitized)) {
      return { kind: "html", html: sanitized }
    }
  }
  const text = resolveNormalizedPastedTextForChatInput(data)
  return text ? { kind: "text", text } : null
}
