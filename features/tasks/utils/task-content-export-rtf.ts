import type { ExportStructuredNode } from "./task-content-export-html"

function escapeRtfText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "\\line ")
}

function htmlInlineToRtf(html: string): string {
  const trimmed = (html ?? "").trim()
  if (!trimmed) return ""

  if (typeof DOMParser === "undefined") {
    return escapeRtfText(trimmed.replace(/<[^>]+>/g, ""))
  }

  const doc = new DOMParser().parseFromString(`<div>${trimmed}</div>`, "text/html")
  const container = doc.body.firstElementChild
  if (!container) return escapeRtfText(trimmed.replace(/<[^>]+>/g, ""))

  const walk = (node: Node, active: { bold: boolean; italic: boolean }): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = escapeRtfText(node.textContent ?? "")
      if (!text) return ""
      let out = text
      if (active.bold) out = `\\b ${out}\\b0 `
      if (active.italic) out = `\\i ${out}\\i0 `
      return out
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return ""

    const el = node as Element
    const tag = el.tagName.toLowerCase()
    if (tag === "br") return "\\line "

    const nextActive = { ...active }
    if (tag === "strong" || tag === "b") nextActive.bold = true
    if (tag === "em" || tag === "i") nextActive.italic = true

    if (tag === "a") {
      const href = (el.getAttribute("href") || "").trim()
      const inner = Array.from(el.childNodes).map((child) => walk(child, nextActive)).join("")
      if (href) {
        const escapedHref = escapeRtfText(href)
        return `{\\field{\\*\\fldinst{HYPERLINK "${escapedHref}"}}{\\fldrslt ${inner || escapedHref}}}`
      }
      return inner
    }

    return Array.from(el.childNodes).map((child) => walk(child, nextActive)).join("")
  }

  return Array.from(container.childNodes).map((child) => walk(child, { bold: false, italic: false })).join("")
}

const RTF_HEADING_STYLE: Record<number, { sizeHalfPoints: number; styleIndex: number; outlineLevel: number }> = {
  1: { sizeHalfPoints: 40, styleIndex: 1, outlineLevel: 0 },
  2: { sizeHalfPoints: 32, styleIndex: 2, outlineLevel: 1 },
  3: { sizeHalfPoints: 28, styleIndex: 3, outlineLevel: 2 },
  4: { sizeHalfPoints: 26, styleIndex: 4, outlineLevel: 3 },
  5: { sizeHalfPoints: 24, styleIndex: 5, outlineLevel: 4 },
  6: { sizeHalfPoints: 22, styleIndex: 6, outlineLevel: 5 },
}

/**
 * Builds an RTF document that maps headings to Word's built-in Heading paragraph styles.
 *
 * Word recognizes the reserved RTF style names "heading 1".."heading 6" (lowercase, per the RTF
 * spec) and links them to its built-in Heading styles. Each heading paragraph is emitted with the
 * matching `\sN` style reference plus `\outlinelevelN`, so pasting produces real Word Heading
 * styles (not just visually bold/larger direct formatting).
 */
export function structuredNodesToRtfDocument(nodes: ExportStructuredNode[]): string {
  if (nodes.length === 0) return ""

  const stylesheet = [
    "{\\s0\\ql\\sbasedon0\\snext0\\f0\\fs22 Normal;}",
    ...Object.entries(RTF_HEADING_STYLE).map(
      ([level, cfg]) =>
        `{\\s${cfg.styleIndex}\\sbasedon0\\snext0\\outlinelevel${cfg.outlineLevel}\\b\\fs${cfg.sizeHalfPoints} heading ${level};}`,
    ),
  ].join("")

  const bodyParts: string[] = [
    "{\\rtf1\\ansi\\deff0",
    "{\\fonttbl{\\f0\\fnil\\fcharset0 Calibri;}}",
    `{\\stylesheet${stylesheet}}`,
  ]

  for (const node of nodes) {
    if (node.type === "heading") {
      const level = Math.min(Math.max(node.level, 1), 6)
      const cfg = RTF_HEADING_STYLE[level]
      const inline = htmlInlineToRtf(node.inlineHtml)
      bodyParts.push(
        `\\pard\\plain\\s${cfg.styleIndex}\\outlinelevel${cfg.outlineLevel}\\b\\fs${cfg.sizeHalfPoints} ${inline}\\par`,
      )
      continue
    }
    if (node.type === "paragraph") {
      const inline = htmlInlineToRtf(node.inlineHtml)
      if (inline) bodyParts.push(`\\pard\\plain\\s0\\fs22 ${inline}\\par`)
      continue
    }
    if (node.type === "list") {
      if (typeof DOMParser === "undefined") {
        const plain = node.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        if (plain) bodyParts.push(`\\pard\\plain\\s0\\fs22 ${escapeRtfText(plain)}\\par`)
        continue
      }
      const doc = new DOMParser().parseFromString(node.html, "text/html")
      const items = doc.body.querySelectorAll("li")
      items.forEach((li, index) => {
        const prefix = node.listTag === "ol" ? `${index + 1}. ` : "\\bullet  "
        const inline = htmlInlineToRtf(li.innerHTML)
        bodyParts.push(`\\pard\\plain\\s0\\fs22 ${prefix}${inline}\\par`)
      })
      continue
    }
    if (node.type === "figure") {
      const plain = node.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      if (plain) bodyParts.push(`\\pard\\plain\\s0\\fs22\\i ${escapeRtfText(plain)}\\i0\\par`)
    }
  }

  bodyParts.push("}")
  return bodyParts.join("\n")
}

export function clipboardSupportsRtfPayload(): boolean {
  if (typeof ClipboardItem === "undefined") return false
  const supports = (ClipboardItem as typeof ClipboardItem & { supports?: (type: string) => boolean }).supports
  if (typeof supports !== "function") return false
  try {
    return supports.call(ClipboardItem, "text/rtf")
  } catch {
    return false
  }
}
