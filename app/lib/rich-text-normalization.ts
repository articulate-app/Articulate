import { marked } from "marked"

const BLOCK_TAGS = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DIV", "DL", "FIELDSET", "FIGCAPTION",
  "FIGURE", "FOOTER", "FORM", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR",
  "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION",
  "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH", "UL",
])

function hasHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

function hasMarkdownSyntax(text: string): boolean {
  const value = text.trim()
  if (!value) return false
  return (
    /(^|\n|\s)#{1,6}\s+\S+/.test(value)
    || /(^|\n|\s)\d+\.\s+\S+/.test(value)
    || /(^|\n|\s)[-*+]\s+\S+/.test(value)
    || /\*\*[^*]+\*\*/.test(value)
    || /\[[^\]]+\]\([^)]+\)/.test(value)
  )
}

function ensureBlockStart(value: string, pattern: RegExp): string {
  let normalized = value
  let didChange = true
  while (didChange) {
    didChange = false
    normalized = normalized.replace(pattern, (_match, prefix, marker) => {
      const previous = String(prefix ?? "")
      const markerText = String(marker ?? "")
      if (previous.endsWith("\n")) return `${previous}${markerText}`
      didChange = true
      return `${previous}\n\n${markerText}`
    })
  }
  return normalized
}

function splitInlineListItems(value: string, itemPattern: RegExp): string {
  return value.replace(itemPattern, (_match, previous, marker) => {
    const prev = String(previous ?? "")
    const item = String(marker ?? "")
    if (prev.endsWith("\n")) return `${prev}${item}`
    return `${prev}\n${item}`
  })
}

function normalizeMarkdownBoundaries(value: string): string {
  let normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")

  // Bring markdown block markers onto their own lines even when mixed into prose.
  normalized = ensureBlockStart(normalized, /(^|[^\n])[ \t]+(#{1,6}\s+\S+)/g)
  normalized = ensureBlockStart(normalized, /(^|[^\n])[ \t]+(\d+\.\s+\S+)/g)
  normalized = ensureBlockStart(normalized, /(^|[^\n])[ \t]+([*+-]\s+\S+)/g)

  // Split packed list items like "1. A 2. B" and "- A - B".
  normalized = splitInlineListItems(normalized, /([^\n])[ \t]+(\d+\.\s+\S+)/g)
  normalized = splitInlineListItems(normalized, /([^\n])[ \t]+([*+-]\s+\S+)/g)

  // Preserve spacing around headings and between adjacent structural blocks.
  normalized = normalized.replace(/([^\n])\n(#{1,6}\s+)/g, "$1\n\n$2")
  normalized = normalized.replace(/^(#{1,6}\s+.+)\n(?!\n)/gm, "$1\n\n")
  normalized = normalized.replace(/\n{3,}/g, "\n\n")

  return normalized.trim()
}

function serializeInlineNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ""
  if (node.nodeType !== Node.ELEMENT_NODE) return ""

  const el = node as HTMLElement
  const tag = el.tagName.toUpperCase()
  if (tag === "BR") return "\n"

  const childText = Array.from(el.childNodes).map(serializeInlineNode).join("")
  if (!childText.trim()) return childText

  if (tag === "STRONG" || tag === "B") return `**${childText}**`
  if (tag === "EM" || tag === "I") return `*${childText}*`
  if (tag === "A") {
    const href = el.getAttribute("href")
    if (href) return `[${childText}](${href})`
    return childText
  }

  return childText
}

function parseMarkdownToHtml(markdown: string): string {
  return String(marked.parse(markdown, { gfm: true, breaks: true }))
}

function stripSingleOuterParagraph(html: string): string {
  if (typeof document === "undefined") return html
  const wrapper = document.createElement("div")
  wrapper.innerHTML = html
  const children = Array.from(wrapper.children)
  if (children.length === 1 && children[0].tagName.toUpperCase() === "P") {
    return (children[0] as HTMLElement).innerHTML
  }
  return html
}

function decodeHtmlEntities(value: string): string {
  if (!value) return ""
  if (typeof document !== "undefined") {
    // A <textarea> parses its content as character data, so raw tags like `<h3>` are preserved
    // verbatim while escaped entities such as `&lt;h3&gt;` are decoded back into real tags.
    const textarea = document.createElement("textarea")
    textarea.innerHTML = value
    return textarea.value
  }
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
}

const COMPONENT_OUTPUT_ALLOWED_TAGS = new Set([
  "H1", "H2", "H3", "H4", "H5", "H6", "P", "UL", "OL", "LI",
  "STRONG", "B", "EM", "I", "BR", "A", "BLOCKQUOTE",
  // Tables (AI artifacts / GFM) — keep structure mid-document or standalone.
  "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD", "COLGROUP", "COL", "CAPTION",
  // Inline media from TipTap attachment blocks in artifact/chat previews.
  "FIGURE", "IMG", "VIDEO", "SOURCE",
])

const COMPONENT_OUTPUT_DROP_TAGS = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "NOSCRIPT",
])

const SAFE_BG_COLOR_RE =
  /^(transparent|currentcolor|#[0-9a-f]{3,8}|rgba?\(\s*[\d.\s%,./]+\s*\)|hsla?\(\s*[\d.\s%,./]+\s*\))$/i

function sanitizeInlineBackgroundColor(styleValue: string): string | null {
  const match = styleValue.match(/(?:^|;)\s*background-color\s*:\s*([^;]+)/i)
  if (!match) return null
  const color = match[1]?.trim() ?? ""
  if (!color || !SAFE_BG_COLOR_RE.test(color)) return null
  return `background-color: ${color}`
}

function isSafeMediaUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (/^\s*(javascript|vbscript|data:text\/html)/i.test(trimmed)) return false
  return /^(https?:|blob:|data:image\/|data:video\/|\/)/i.test(trimmed)
}

export function sanitizeComponentOutputHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html
  const doc = new DOMParser().parseFromString(html, "text/html")

  const sanitizeElement = (element: Element) => {
    // Process children first so unwrapping does not skip nested nodes.
    Array.from(element.children).forEach(sanitizeElement)

    const tag = element.tagName.toUpperCase()
    if (COMPONENT_OUTPUT_DROP_TAGS.has(tag)) {
      element.remove()
      return
    }

    if (!COMPONENT_OUTPUT_ALLOWED_TAGS.has(tag)) {
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
        if (name === "href" && /^\s*(javascript|data|vbscript):/i.test(attr.value)) {
          element.removeAttribute(attr.name)
        }
        return
      }
      if ((tag === "TABLE" || tag === "FIGURE") && name === "class") return
      if (
        (tag === "TD" || tag === "TH")
        && (name === "colspan" || name === "rowspan" || name === "data-background-color")
      ) {
        return
      }
      if ((tag === "TD" || tag === "TH") && name === "style") {
        const safeStyle = sanitizeInlineBackgroundColor(attr.value)
        if (safeStyle) {
          element.setAttribute("style", safeStyle)
        } else {
          element.removeAttribute(attr.name)
        }
        return
      }
      if (tag === "FIGURE" && name.startsWith("data-")) return
      if ((tag === "IMG" || tag === "VIDEO" || tag === "SOURCE") && (name === "src" || name === "alt")) {
        if (name === "src" && !isSafeMediaUrl(attr.value)) {
          element.removeAttribute(attr.name)
        }
        return
      }
      if (tag === "VIDEO" && (name === "controls" || name === "playsinline")) return
      element.removeAttribute(attr.name)
    })
  }

  Array.from(doc.body.children).forEach(sanitizeElement)
  return doc.body.innerHTML
}

function stripLeadingMatchingHeading(html: string, title: string): string {
  const target = (title ?? "").trim().toLowerCase()
  if (!target || typeof DOMParser === "undefined") return html
  const doc = new DOMParser().parseFromString(html, "text/html")
  const first = doc.body.firstElementChild
  if (first && /^H[1-6]$/.test(first.tagName.toUpperCase())) {
    const headingText = (first.textContent ?? "").trim().toLowerCase()
    if (headingText === target) {
      first.remove()
      return doc.body.innerHTML.trim()
    }
  }
  return html
}

/**
 * Render AI component output (Markdown and/or raw/escaped HTML headings) into safe rich HTML.
 *
 * - Decodes escaped tags (`&lt;h3&gt;` → `<h3>`) so they render as real headings.
 * - Lets `marked` convert Markdown headings (`### FAQ`) while passing raw HTML headings through.
 * - Strips a leading heading that exactly matches the component title to avoid duplicate titles.
 * - Sanitizes to a small allow-list of tags, dropping scripts/styles/inline handlers.
 */
export function normalizeComponentOutputToHtml(
  contentText: string,
  componentTitle?: string | null
): string {
  const raw = contentText ?? ""
  if (!raw.trim()) return ""

  let source = decodeHtmlEntities(raw)
  // Force prose that immediately follows a block heading onto its own block so the CommonMark
  // HTML-block rule does not swallow the paragraph text into the heading element.
  source = source.replace(/(<\/h[1-6]>)[ \t]*\r?\n(?!\r?\n)/gi, "$1\n\n")
  // Markdown heading/list markers packed into a single paragraph need block boundaries
  // (same path as TipTap overview rendering) so chat previews keep H1/H2 spacing.
  if (!hasHtml(source)) {
    source = normalizeMarkdownBoundaries(source)
  }

  const parsed = String(marked.parse(source, { gfm: true, breaks: true }))
  const sanitized = sanitizeComponentOutputHtml(parsed)
  return stripLeadingMatchingHeading(sanitized, componentTitle ?? "")
}

export function normalizeMixedRichText(contentText: string): string {
  const raw = contentText ?? ""
  if (!raw.trim()) return ""

  if (!hasHtml(raw)) {
    const normalized = normalizeMarkdownBoundaries(raw)
    return parseMarkdownToHtml(normalized)
  }

  if (typeof DOMParser === "undefined") {
    const fallback = normalizeMarkdownBoundaries(raw)
    return parseMarkdownToHtml(fallback)
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(raw, "text/html")
  const candidates = Array.from(
    doc.body.querySelectorAll("p, li, div, section, article, blockquote, td, th")
  ) as HTMLElement[]

  candidates.forEach((el) => {
    const tag = el.tagName.toUpperCase()
    if (tag === "PRE" || tag === "CODE") return
    if (el.closest("pre,code")) return

    const hasDirectBlockChildren = Array.from(el.children).some((child) =>
      BLOCK_TAGS.has(child.tagName.toUpperCase())
    )
    if (hasDirectBlockChildren) return

    const inlineMixedText = Array.from(el.childNodes).map(serializeInlineNode).join("")
    if (!hasMarkdownSyntax(inlineMixedText)) return

    const normalizedMarkdown = normalizeMarkdownBoundaries(inlineMixedText)
    if (!normalizedMarkdown) return

    const normalizedHtml = parseMarkdownToHtml(normalizedMarkdown)
    if (tag === "LI") {
      el.innerHTML = stripSingleOuterParagraph(normalizedHtml)
      return
    }

    const tmpDoc = parser.parseFromString(normalizedHtml, "text/html")
    const fragment = doc.createDocumentFragment()
    Array.from(tmpDoc.body.childNodes).forEach((node) => {
      fragment.appendChild(node.cloneNode(true))
    })
    el.replaceWith(fragment)
  })

  return doc.body.innerHTML
}
