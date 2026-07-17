import { sanitizeComponentOutputHtml } from "../../../app/lib/rich-text-normalization"

export type ClipboardCopyTarget = "wordpress" | "word"

export function mapHtmlHeadingTagToDocxLevel(tag: string): 1 | 2 | 3 | 4 | 5 | 6 | null {
  switch (tag.toLowerCase()) {
    case "h1": return 1
    case "h2": return 2
    case "h3": return 3
    case "h4": return 4
    case "h5": return 5
    case "h6": return 6
    default: return null
  }
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function extractText(el: Element): string {
  return (el.textContent || "").replaceAll("\u00A0", " ").trim()
}

function isExportBlockElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  return (
    tag === "p"
    || tag === "h1"
    || tag === "h2"
    || tag === "h3"
    || tag === "h4"
    || tag === "h5"
    || tag === "h6"
    || tag === "ul"
    || tag === "ol"
    || tag === "figure"
  )
}

function isBlockishDivParagraph(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  if (tag !== "div") return false
  if (el.querySelector("p,h1,h2,h3,h4,h5,h6,ul,ol,figure")) return false
  return !!extractText(el)
}

export function collectExportBlockElements(html: string): Element[] {
  if (!html?.trim() || typeof DOMParser === "undefined") return []
  const parser = new DOMParser()
  const parsed = parser.parseFromString(`<div>${html}</div>`, "text/html")
  const container = parsed.body.firstElementChild ?? parsed.body

  const blocks: Element[] = []
  const walk = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    if (isExportBlockElement(el)) {
      blocks.push(el)
      return
    }
    if (isBlockishDivParagraph(el)) {
      blocks.push(el)
      return
    }
    el.childNodes.forEach(walk)
  }
  container.childNodes.forEach(walk)
  return blocks
}

function serializeInlineExportHtml(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtmlText(node.textContent ?? "")
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ""

  const el = node as Element
  const tag = el.tagName.toLowerCase()
  if (tag === "ul" || tag === "ol") return ""

  if (tag === "br") return "<br/>"

  const children = Array.from(el.childNodes).map(serializeInlineExportHtml).join("")
  if (tag === "strong" || tag === "b") return `<strong>${children}</strong>`
  if (tag === "em" || tag === "i") return `<em>${children}</em>`
  if (tag === "a") {
    const href = (el.getAttribute("href") || "").trim()
    if (href && !/^\s*(javascript|data|vbscript):/i.test(href)) {
      return `<a href="${escapeHtmlText(href)}">${children}</a>`
    }
    return children
  }

  return children
}

function serializeElementInlineHtml(el: Element): string {
  const parts: string[] = []
  el.childNodes.forEach((child) => {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const childTag = (child as Element).tagName.toLowerCase()
      if (childTag === "ul" || childTag === "ol") return
    }
    parts.push(serializeInlineExportHtml(child))
  })
  return parts.join("")
}

function renderExportListHtml(el: Element, listTag: "ul" | "ol"): string {
  const items = Array.from(el.children).filter((child) => child.tagName.toLowerCase() === "li")
  const itemHtml = items.map((li) => {
    const nestedLists = Array.from(li.children).filter((child) => {
      const childTag = child.tagName.toLowerCase()
      return childTag === "ul" || childTag === "ol"
    })
    const inlineHtml = serializeElementInlineHtml(li)
    const nestedHtml = nestedLists
      .map((nested) => renderExportListHtml(nested, nested.tagName.toLowerCase() as "ul" | "ol"))
      .join("")
    return `<li>${inlineHtml}${nestedHtml}</li>`
  }).join("")
  return `<${listTag}>${itemHtml}</${listTag}>`
}

export type ExportStructuredHeadingNode = {
  type: "heading"
  level: 1 | 2 | 3 | 4 | 5 | 6
  inlineHtml: string
}

export type ExportStructuredParagraphNode = {
  type: "paragraph"
  inlineHtml: string
}

export type ExportStructuredListNode = {
  type: "list"
  listTag: "ul" | "ol"
  html: string
}

export type ExportStructuredFigureNode = {
  type: "figure"
  html: string
}

export type ExportStructuredNode =
  | ExportStructuredHeadingNode
  | ExportStructuredParagraphNode
  | ExportStructuredListNode
  | ExportStructuredFigureNode

/** Shared block model for DOCX and clipboard — same detection rules as collectExportBlockElements. */
export function htmlToExportStructuredNodes(html: string): ExportStructuredNode[] {
  if (!html?.trim()) return []
  if (typeof DOMParser === "undefined") return []

  const blocks = collectExportBlockElements(html)
  const nodes: ExportStructuredNode[] = []

  for (const el of blocks) {
    const tag = el.tagName.toLowerCase()
    const headingLevel = mapHtmlHeadingTagToDocxLevel(tag)
    if (headingLevel != null) {
      nodes.push({ type: "heading", level: headingLevel, inlineHtml: serializeElementInlineHtml(el) })
      continue
    }
    if (tag === "ul" || tag === "ol") {
      nodes.push({ type: "list", listTag: tag, html: renderExportListHtml(el, tag) })
      continue
    }
    if (tag === "figure") {
      const img = el.querySelector("img")
      if (img) {
        const src = (img.getAttribute("src") || "").trim()
        const alt = (img.getAttribute("alt") || extractText(el) || "Image").trim()
        if (src) {
          nodes.push({
            type: "figure",
            html: `<figure><img src="${escapeHtmlText(src)}" alt="${escapeHtmlText(alt)}" /></figure>`,
          })
          continue
        }
      }
      const alt = extractText(el) || "Image"
      nodes.push({
        type: "figure",
        html: `<p><em>[Image: ${escapeHtmlText(alt)}]</em></p>`,
      })
      continue
    }
    if (tag === "p" || tag === "div") {
      nodes.push({ type: "paragraph", inlineHtml: serializeElementInlineHtml(el) })
    }
  }

  return nodes
}

function cleanHeadingInlineHtml(inlineHtml: string): string {
  return inlineHtml
    .replace(/(<br\s*\/?>\s*)+$/gi, "")
    .replace(/^\s*(<br\s*\/?>\s*)+/gi, "")
    .trim()
}

const WORD_HEADING_INLINE_STYLES: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "mso-style-name:'Heading 1'; mso-style-id:Heading1; mso-outline-level:1; font-size:20pt; font-weight:bold; margin:18pt 0 8pt;",
  2: "mso-style-name:'Heading 2'; mso-style-id:Heading2; mso-outline-level:2; font-size:16pt; font-weight:bold; margin:16pt 0 7pt;",
  3: "mso-style-name:'Heading 3'; mso-style-id:Heading3; mso-outline-level:3; font-size:14pt; font-weight:bold; margin:14pt 0 6pt;",
  4: "mso-style-name:'Heading 4'; mso-style-id:Heading4; mso-outline-level:4; font-size:12pt; font-weight:bold; margin:12pt 0 6pt;",
  5: "mso-style-name:'Heading 5'; mso-style-id:Heading5; mso-outline-level:5; font-size:11pt; font-weight:bold; margin:10pt 0 5pt;",
  6: "mso-style-name:'Heading 6'; mso-style-id:Heading6; mso-outline-level:6; font-size:10pt; font-weight:bold; margin:8pt 0 4pt;",
}

function renderHeadingNodeToHtml(node: ExportStructuredHeadingNode, target: ClipboardCopyTarget): string {
  const level = Math.min(Math.max(node.level ?? 2, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6
  const inlineHtml = cleanHeadingInlineHtml(node.inlineHtml)
  if (target === "word") {
    return `<p class="MsoHeading${level}" style="${WORD_HEADING_INLINE_STYLES[level]}">${inlineHtml}</p>`
  }
  return `<h${level}>${inlineHtml}</h${level}>`
}

/** Renders structured export nodes to clipboard HTML. */
export function renderStructuredNodesToClipboardHtml(
  nodes: ExportStructuredNode[],
  target: ClipboardCopyTarget = "wordpress",
): string {
  if (nodes.length === 0) return ""

  const parts = nodes.map((node) => {
    if (node.type === "heading") return renderHeadingNodeToHtml(node, target)
    if (node.type === "list") return node.html
    if (node.type === "figure") return node.html
    const inlineHtml = node.inlineHtml.trim()
    if (target === "word") {
      return inlineHtml ? `<p style="margin:0 0 10pt;">${inlineHtml}</p>` : ""
    }
    return inlineHtml ? `<p>${inlineHtml}</p>` : ""
  }).filter(Boolean)

  const cleaned = cleanClipboardHtml(parts.join(""))
  if (target === "word") return cleaned
  return sanitizeComponentOutputHtml(cleaned)
}

/** Removes malformed heading content and empty paragraphs from clipboard HTML. */
export function cleanClipboardHtml(html: string): string {
  if (!html?.trim()) return html

  if (typeof DOMParser === "undefined") {
    return html
      .replace(/<h([1-6])([^>]*)>\s*(.*?)\s*(?:<br\s*\/?>\s*)+<\/h\1>/gis, "<h$1$2>$3</h$1>")
      .replace(/<p([^>]*)>\s*(.*?)\s*(?:<br\s*\/?>\s*)+<\/p>/gis, "<p$1>$2</p>")
      .replace(/<p>\s*<\/p>/gi, "")
      .replace(/<p[^>]*>\s*(?:<br\s*\/?>\s*)*<\/p>/gi, "")
  }

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html")
  const container = doc.body.firstElementChild
  if (!container) return html

  container.querySelectorAll("h1,h2,h3,h4,h5,h6,p").forEach((block) => {
    const tag = block.tagName.toLowerCase()
    const isHeading = tag.startsWith("h")

    while (block.lastChild) {
      if (block.lastChild.nodeType === Node.TEXT_NODE && !(block.lastChild.textContent ?? "").trim()) {
        block.removeChild(block.lastChild)
        continue
      }
      if (
        block.lastChild.nodeType === Node.ELEMENT_NODE
        && (block.lastChild as Element).tagName.toLowerCase() === "br"
      ) {
        block.removeChild(block.lastChild)
        continue
      }
      break
    }
    while (block.firstChild) {
      if (block.firstChild.nodeType === Node.TEXT_NODE && !(block.firstChild.textContent ?? "").trim()) {
        block.removeChild(block.firstChild)
        continue
      }
      if (
        block.firstChild.nodeType === Node.ELEMENT_NODE
        && (block.firstChild as Element).tagName.toLowerCase() === "br"
      ) {
        block.removeChild(block.firstChild)
        continue
      }
      break
    }

    if (!isHeading) {
      const text = (block.textContent ?? "").trim()
      const hasMedia = block.querySelector("img")
      const onlyBreaks = !text && Array.from(block.childNodes).every((child) => {
        if (child.nodeType === Node.TEXT_NODE) return !(child.textContent ?? "").trim()
        if (child.nodeType === Node.ELEMENT_NODE) {
          return (child as Element).tagName.toLowerCase() === "br"
        }
        return false
      })
      if ((!text && !hasMedia) || onlyBreaks) {
        block.remove()
      }
    }
  })

  return container.innerHTML
}

/**
 * Re-serialize export HTML using the same block detection rules as DOCX export.
 * Preserves semantic heading levels (h1-h6), lists, links, and inline formatting.
 */
export function htmlToSemanticExportHtml(
  html: string,
  target: ClipboardCopyTarget = "wordpress",
): string {
  if (!html?.trim()) return ""
  if (typeof DOMParser === "undefined") return html

  const nodes = htmlToExportStructuredNodes(html)
  if (nodes.length === 0) {
    return target === "word" ? cleanClipboardHtml(html) : sanitizeComponentOutputHtml(cleanClipboardHtml(html))
  }

  return renderStructuredNodesToClipboardHtml(nodes, target)
}

const CLIPBOARD_WORD_HEADING_STYLES = [
  "h1, .MsoHeading1 { mso-style-name:\"Heading 1\"; mso-style-id:Heading1; mso-outline-level:1; font-size:20pt; font-weight:bold; margin:18pt 0 8pt; }",
  "h2, .MsoHeading2 { mso-style-name:\"Heading 2\"; mso-style-id:Heading2; mso-outline-level:2; font-size:16pt; font-weight:bold; margin:16pt 0 7pt; }",
  "h3, .MsoHeading3 { mso-style-name:\"Heading 3\"; mso-style-id:Heading3; mso-outline-level:3; font-size:14pt; font-weight:bold; margin:14pt 0 6pt; }",
  "h4, .MsoHeading4 { mso-style-name:\"Heading 4\"; mso-style-id:Heading4; mso-outline-level:4; font-size:12pt; font-weight:bold; margin:12pt 0 6pt; }",
  "h5, .MsoHeading5 { mso-style-name:\"Heading 5\"; mso-style-id:Heading5; mso-outline-level:5; font-size:11pt; font-weight:bold; margin:10pt 0 5pt; }",
  "h6, .MsoHeading6 { mso-style-name:\"Heading 6\"; mso-style-id:Heading6; mso-outline-level:6; font-size:10pt; font-weight:bold; margin:8pt 0 4pt; }",
  "p { margin:0 0 10pt; }",
  "ul, ol { margin-top:0; margin-bottom:10pt; }",
  "li { margin-bottom:4pt; }",
].join(" ")

function buildClipboardHtmlDocument(fragmentHtml: string, headExtra: string): string {
  const trimmed = cleanClipboardHtml(fragmentHtml.trim())
  if (!trimmed) return trimmed

  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    "<meta charset=\"utf-8\">",
    headExtra,
    "</head>",
    "<body>",
    "<!--StartFragment-->",
    trimmed,
    "<!--EndFragment-->",
    "</body>",
    "</html>",
  ].join("")
}

/** Clean semantic HTML wrapper for WordPress / Gutenberg clipboard paste. */
export function wrapHtmlForWordPressClipboardPaste(fragmentHtml: string): string {
  return buildClipboardHtmlDocument(fragmentHtml, "")
}

/** Word-oriented HTML wrapper with MSO heading styles for Microsoft Word paste. */
export function wrapHtmlForWordClipboardPaste(fragmentHtml: string): string {
  return buildClipboardHtmlDocument(fragmentHtml, `<style>${CLIPBOARD_WORD_HEADING_STYLES}</style>`)
}

/** @deprecated Use wrapHtmlForWordPressClipboardPaste or wrapHtmlForWordClipboardPaste. */
export function wrapHtmlForRichClipboardPaste(fragmentHtml: string): string {
  return wrapHtmlForWordPressClipboardPaste(fragmentHtml)
}

export function wrapHtmlForClipboardPaste(fragmentHtml: string, target: ClipboardCopyTarget): string {
  return target === "word"
    ? wrapHtmlForWordClipboardPaste(fragmentHtml)
    : wrapHtmlForWordPressClipboardPaste(fragmentHtml)
}
