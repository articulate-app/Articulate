import * as Y from "yjs"

export const YDOC_FRAGMENT_NAME = "default"

export type TipTapMark = {
  type: string
  attrs?: Record<string, unknown>
}

export type TipTapNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
  text?: string
  marks?: TipTapMark[]
}

export type TipTapDoc = TipTapNode & { type: "doc" }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function extractTipTapDoc(contentJson: unknown): TipTapDoc | null {
  const row = asRecord(contentJson)
  if (!row) return null
  if (row.type === "doc" && Array.isArray(row.content)) return row as TipTapDoc
  const nested = asRecord(row.tiptap)
  if (nested?.type === "doc" && Array.isArray(nested.content)) return nested as TipTapDoc
  return null
}

export function normalizePlainText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
}

/** Compare editorial text, ignoring Y.XmlText mark chrome such as `<bold>`. */
export function editorialPlainText(value: string): string {
  return normalizePlainText(String(value ?? "").replace(/<\/?[a-zA-Z][^>]*>/g, " "))
}

export function isEditoriallyEquivalent(left: string, right: string): boolean {
  return editorialPlainText(left) === editorialPlainText(right)
}

const INCLUDEPICTURE_RE =
  /INCLUDEPICTURE\s+(?:&quot;|&ldquo;|"|“)(https?:[^"”&]+)(?:&quot;|&rdquo;|"|”)?(?:\s*\\?\*\s*MERGEFORMAT(?:INET)?)?/gi

function looksLikeEmailHtmlDocument(html: string): boolean {
  const source = String(html ?? "")
  return /<!doctype\s+html/i.test(source)
    || /<html\b/i.test(source)
    || (/role\s*=\s*["']presentation["']/i.test(source) && /<table\b/i.test(source))
}

/** True when HTML/plain text still contains markdown headings or Word image fields. */
export function hasLeftoverMarkdown(value: string): boolean {
  const text = String(value ?? "")
  if (!text.trim()) return false
  return /INCLUDEPICTURE/i.test(text)
    || /(?:^|>|<br\s*\/?>|\n)\s*#{1,6}\s+\S/.test(text)
    || /!\[[^\]]*\]\(https?:[^)]+\)/.test(text)
}

/**
 * Turn leftover markdown-in-HTML (`<p># Title</p>`, INCLUDEPICTURE) into real
 * headings and figures so TipTap does not show the markers as plain text.
 */
export function normalizeLeftoverMarkdownHtml(html: string): string {
  const raw = String(html ?? "")
  if (!raw.trim() || looksLikeEmailHtmlDocument(raw)) return raw
  if (!hasLeftoverMarkdown(raw)) return raw

  let next = raw.replace(INCLUDEPICTURE_RE, (_match, url) => {
    const src = String(url ?? "").trim()
    if (!/^https?:\/\//i.test(src)) return _match
    return `<figure><img src="${src}" alt="" /></figure>`
  })
  next = next.replace(/<p>\s*(<figure>[\s\S]*?<\/figure>)\s*<\/p>/gi, "$1")
  next = next.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (full, inner) => {
    if (!/#|!\[/.test(inner)) return full
    const lines = String(inner).split(/<br\s*\/?>|\n/i)
    const parts: string[] = []
    let paragraph: string[] = []
    const flushParagraph = () => {
      const text = paragraph.join("<br>").trim()
      if (text) parts.push(`<p>${text}</p>`)
      paragraph = []
    }
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        flushParagraph()
        continue
      }
      const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed)
      if (heading) {
        flushParagraph()
        const level = Math.min(3, heading[1]!.length)
        parts.push(`<h${level}>${heading[2]!.trim()}</h${level}>`)
        continue
      }
      const image = /^!\[([^\]]*)\]\((https?:[^)]+)\)$/.exec(trimmed)
      if (image) {
        flushParagraph()
        parts.push(`<figure><img src="${image[2]}" alt="${image[1]}" /></figure>`)
        continue
      }
      paragraph.push(trimmed)
    }
    flushParagraph()
    return parts.join("") || full
  })
  return next.replace(/<p>\s*<\/p>/gi, "")
}

export function tipTapJsonToPlainText(node: TipTapNode | null | undefined): string {
  if (!node) return ""
  if (node.type === "text") return String(node.text ?? "")
  if (node.type === "hardBreak") return "\n"
  const children = Array.isArray(node.content) ? node.content : []
  const joined = children.map((child) => tipTapJsonToPlainText(child)).join("")
  if (
    node.type === "paragraph"
    || node.type === "heading"
    || node.type === "listItem"
    || node.type === "taskItem"
    || node.type === "tableRow"
  ) {
    return joined ? `${joined}\n` : ""
  }
  return joined
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, "\u00a0")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function markAttrs(marks: TipTapMark[] | undefined): Record<string, unknown> | undefined {
  if (!marks?.length) return undefined
  const attrs: Record<string, unknown> = {}
  for (const mark of marks) {
    const name = String(mark.type ?? "").trim()
    if (!name) continue
    const markAttrs = mark.attrs && Object.keys(mark.attrs).length > 0 ? mark.attrs : true
    attrs[name] = markAttrs
  }
  return Object.keys(attrs).length > 0 ? attrs : undefined
}

function setNodeAttrs(element: Y.XmlElement, attrs?: Record<string, unknown>) {
  if (!attrs) return
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "ychange" || value == null) continue
    element.setAttribute(key, value as string | number | boolean)
  }
}

function createYNode(node: TipTapNode): Y.XmlElement | Y.XmlText {
  if (node.type === "text") {
    const text = new Y.XmlText()
    const value = String(node.text ?? "")
    if (value) text.insert(0, value, markAttrs(node.marks))
    return text
  }
  if (node.type === "hardBreak") {
    return new Y.XmlElement("hardBreak")
  }
  const element = new Y.XmlElement(node.type || "paragraph")
  setNodeAttrs(element, node.attrs)
  const children = (node.content ?? []).map((child) => createYNode(child))
  if (children.length > 0) element.insert(0, children)
  return element
}

export function replaceYDocWithTipTapJson(
  document: Y.Doc,
  json: TipTapDoc,
  origin: string,
): Uint8Array {
  const before = Y.encodeStateVector(document)
  const fragment = document.getXmlFragment(YDOC_FRAGMENT_NAME)
  const content = Array.isArray(json.content) ? json.content : []
  document.transact(() => {
    if (fragment.length > 0) fragment.delete(0, fragment.length)
    if (content.length > 0) fragment.insert(0, content.map((node) => createYNode(node)))
  }, origin)
  return Y.encodeStateAsUpdate(document, before)
}

export function yXmlPlainText(document: Y.Doc): string {
  const fragment = document.getXmlFragment(YDOC_FRAGMENT_NAME)
  const walk = (node: unknown): string => {
    if (!node) return ""
    if (node instanceof Y.XmlText) {
      const delta = node.toDelta() as Array<{ insert?: unknown }>
      if (Array.isArray(delta) && delta.length > 0) {
        return delta.map((op) => (typeof op.insert === "string" ? op.insert : "")).join("")
      }
      return String(node.toString()).replace(/<[^>]+>/g, "")
    }
    if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
      let out = ""
      for (let i = 0; i < node.length; i += 1) out += walk(node.get(i))
      if (node instanceof Y.XmlElement) {
        const name = node.nodeName
        if (name === "paragraph" || name === "heading" || name === "listItem" || name === "taskItem") {
          return out ? `${out}\n` : ""
        }
        if (name === "hardBreak") return "\n"
      }
      return out
    }
    return ""
  }
  return normalizePlainText(walk(fragment))
}

function marksFromDeltaAttrs(attrs?: Record<string, unknown>): TipTapMark[] | undefined {
  if (!attrs) return undefined
  const marks: TipTapMark[] = []
  for (const [type, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue
    if (value === true) marks.push({ type })
    else if (typeof value === "object") marks.push({ type, attrs: value as Record<string, unknown> })
  }
  return marks.length ? marks : undefined
}

function yNodeToTipTap(node: unknown): TipTapNode[] {
  if (node instanceof Y.XmlText) {
    const delta = node.toDelta() as Array<{ insert?: string; attributes?: Record<string, unknown> }>
    return delta
      .map((op) => {
        const text = String(op.insert ?? "")
        if (!text) return null
        const marks = marksFromDeltaAttrs(op.attributes)
        return {
          type: "text" as const,
          text,
          ...(marks ? { marks } : {}),
        }
      })
      .filter((row): row is TipTapNode => row != null)
  }
  if (node instanceof Y.XmlElement) {
    if (node.nodeName === "hardBreak") return [{ type: "hardBreak" }]
    const children: TipTapNode[] = []
    for (let i = 0; i < node.length; i += 1) children.push(...yNodeToTipTap(node.get(i)))
    const attrs = node.getAttributes()
    return [{
      type: node.nodeName,
      ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
      ...(children.length > 0 ? { content: children } : {}),
    }]
  }
  return []
}

export function yXmlToTipTapDoc(document: Y.Doc): TipTapDoc {
  const fragment = document.getXmlFragment(YDOC_FRAGMENT_NAME)
  const content: TipTapNode[] = []
  for (let i = 0; i < fragment.length; i += 1) content.push(...yNodeToTipTap(fragment.get(i)))
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] }
}

export function inferGlobalReplace(before: string, after: string): { from: string; to: string } | null {
  const left = String(before ?? "")
  const right = String(after ?? "")
  if (!left || !right || left === right) return null
  let start = 0
  const limit = Math.min(left.length, right.length)
  while (start < limit && left.charCodeAt(start) === right.charCodeAt(start)) start += 1
  let leftEnd = left.length
  let rightEnd = right.length
  while (leftEnd > start && rightEnd > start && left.charCodeAt(leftEnd - 1) === right.charCodeAt(rightEnd - 1)) {
    leftEnd -= 1
    rightEnd -= 1
  }
  const from = left.slice(start, leftEnd)
  const to = right.slice(start, rightEnd)
  if (!from || from === to) return null
  if (left.split(from).join(to) !== right) return null

  // Prefer the longest repeated phrase that still explains the whole change.
  // First-mismatch often swallows the gap between two identical replacements.
  for (let len = from.length - 1; len >= 4; len -= 1) {
    const candidateFrom = from.slice(0, len)
    const parts = left.split(candidateFrom)
    if (parts.length < 3) continue
    if (!right.startsWith(parts[0]!) || !right.endsWith(parts[parts.length - 1]!)) continue
    const afterRest = right.slice(parts[0]!.length)
    const idx = afterRest.indexOf(parts[1]!)
    if (idx < 0) continue
    const candidateTo = afterRest.slice(0, idx)
    if (candidateFrom === candidateTo) continue
    if (left.split(candidateFrom).join(candidateTo) !== right) continue
    const trimmedFrom = candidateFrom.replace(/\s+$/g, "")
    const trimmedTo = candidateTo.replace(/\s+$/g, "")
    if (trimmedFrom && trimmedFrom !== trimmedTo && left.split(trimmedFrom).join(trimmedTo) === right) {
      return { from: trimmedFrom, to: trimmedTo }
    }
    return { from: candidateFrom, to: candidateTo }
  }

  return { from, to }
}

export function replaceInTipTapDoc(
  doc: TipTapDoc,
  replacements: Array<{ from: string; to: string }>,
): { doc: TipTapDoc; count: number } {
  const pairs = replacements.filter((row) => row.from && row.from !== row.to)
  if (pairs.length === 0) return { doc, count: 0 }
  let count = 0

  const applyText = (value: string): string => {
    let next = value
    for (const { from, to } of pairs) {
      if (!from || !next.includes(from)) continue
      const parts = next.split(from)
      count += parts.length - 1
      next = parts.join(to)
    }
    return next
  }

  const walk = (node: TipTapNode): TipTapNode => {
    if (node.type === "text") {
      const before = String(node.text ?? "")
      const text = applyText(before)
      return text === before ? node : { ...node, text }
    }
    if (!Array.isArray(node.content) || node.content.length === 0) return node
    const content = node.content.map(walk)
    const onlyInline = content.every((child) => child.type === "text" || child.type === "hardBreak")
    if (onlyInline) {
      const joined = content.map((child) => (child.type === "text" ? String(child.text ?? "") : "\n")).join("")
      const leftover = pairs.filter((row) => joined.includes(row.from))
      if (leftover.length > 0) {
        let next = joined
        for (const { from, to } of leftover) {
          const parts = next.split(from)
          count += Math.max(0, parts.length - 1)
          next = parts.join(to)
        }
        const marks = content.find((child) => child.type === "text")?.marks
        return {
          ...node,
          content: [{ type: "text", text: next, ...(marks ? { marks } : {}) }],
        }
      }
    }
    return { ...node, content }
  }

  return { doc: promoteLiteralHtmlAnchors(walk(doc) as TipTapDoc), count }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function wrapMarks(html: string, marks?: TipTapMark[]): string {
  let out = html
  for (const mark of marks ?? []) {
    if (mark.type === "bold") out = `<strong>${out}</strong>`
    else if (mark.type === "italic") out = `<em>${out}</em>`
    else if (mark.type === "underline") out = `<u>${out}</u>`
    else if (mark.type === "strike") out = `<s>${out}</s>`
    else if (mark.type === "code") out = `<code>${out}</code>`
    else if (mark.type === "highlight") out = `<mark>${out}</mark>`
    else if (mark.type === "link") {
      const href = escapeHtml(String(mark.attrs?.href ?? ""))
      out = `<a href="${href}">${out}</a>`
    }
  }
  return out
}

export function tipTapJsonToHtml(node: TipTapNode | null | undefined): string {
  if (!node) return ""
  if (node.type === "text") return wrapMarks(escapeHtml(String(node.text ?? "")), node.marks)
  if (node.type === "hardBreak") return "<br>"
  if (node.type === "horizontalRule") return "<hr>"
  const inner = (node.content ?? []).map((child) => tipTapJsonToHtml(child)).join("")
  if (node.type === "doc") return inner
  if (node.type === "paragraph") return `<p>${inner}</p>`
  if (node.type === "heading") {
    const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 2) || 2))
    return `<h${level}>${inner}</h${level}>`
  }
  if (node.type === "bulletList") return `<ul>${inner}</ul>`
  if (node.type === "orderedList") return `<ol>${inner}</ol>`
  if (node.type === "listItem") return `<li>${inner}</li>`
  if (node.type === "blockquote") return `<blockquote>${inner}</blockquote>`
  if (node.type === "codeBlock") return `<pre><code>${inner}</code></pre>`
  if (node.type === "table") return `<table>${inner}</table>`
  if (node.type === "tableRow") return `<tr>${inner}</tr>`
  if (node.type === "tableHeader") return `<th>${inner}</th>`
  if (node.type === "tableCell") return `<td>${inner}</td>`
  if (node.type === "attachmentBlock" || node.type === "image") {
    const src = escapeHtml(String(node.attrs?.src ?? ""))
    const alt = escapeHtml(String(node.attrs?.alt ?? node.attrs?.fileName ?? ""))
    const attachmentId = escapeHtml(String(node.attrs?.attachmentId ?? ""))
    if (!src) return ""
    return attachmentId
      ? `<figure data-attachment-id="${attachmentId}"><img src="${src}" alt="${alt}" /></figure>`
      : `<figure><img src="${src}" alt="${alt}" /></figure>`
  }
  return inner
}

type HtmlToken =
  | { kind: "text"; value: string }
  | { kind: "open"; name: string; attrs: Record<string, string> }
  | { kind: "close"; name: string }
  | { kind: "void"; name: string; attrs: Record<string, string> }

const VOID_TAGS = new Set(["br", "hr", "img"])

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([:A-Za-z_][:A-Za-z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
  let match: RegExpExecArray | null
  while ((match = re.exec(raw)) != null) {
    attrs[match[1]!.toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "")
  }
  return attrs
}

function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = []
  const source = String(html ?? "")
  const re = /<!--[\s\S]*?-->|<\/([A-Za-z][\w:-]*)\s*>|<([A-Za-z][\w:-]*)\b([^>]*?)(\/?)>|([^<]+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) != null) {
    if (match[0].startsWith("<!--")) continue
    if (match[1]) {
      tokens.push({ kind: "close", name: match[1].toLowerCase() })
      continue
    }
    if (match[2]) {
      const name = match[2].toLowerCase()
      const attrs = parseAttrs(match[3] ?? "")
      if (VOID_TAGS.has(name) || match[4] === "/") {
        tokens.push({ kind: "void", name, attrs })
      } else {
        tokens.push({ kind: "open", name, attrs })
      }
      continue
    }
    if (match[5]) tokens.push({ kind: "text", value: decodeEntities(match[5]) })
  }
  return tokens
}

const BLOCK_TAGS: Record<string, { type: string; attrs?: (attrs: Record<string, string>) => Record<string, unknown> }> = {
  p: { type: "paragraph" },
  h1: { type: "heading", attrs: () => ({ level: 1 }) },
  h2: { type: "heading", attrs: () => ({ level: 2 }) },
  h3: { type: "heading", attrs: () => ({ level: 3 }) },
  ul: { type: "bulletList" },
  ol: { type: "orderedList" },
  li: { type: "listItem" },
  blockquote: { type: "blockquote" },
  pre: { type: "codeBlock" },
  table: { type: "table" },
  tr: { type: "tableRow" },
  th: { type: "tableHeader" },
  td: { type: "tableCell" },
}

const TABLE_UNWRAP_TAGS = new Set(["thead", "tbody", "tfoot"])
const TABLE_SKIP_TAGS = new Set(["colgroup", "col"])

function ensureCellBlocks(nodes: TipTapNode[]): TipTapNode[] {
  if (nodes.length === 0) return [{ type: "paragraph" }]
  const out: TipTapNode[] = []
  let inline: TipTapNode[] = []
  const flushInline = () => {
    if (inline.length === 0) return
    out.push({ type: "paragraph", content: inline })
    inline = []
  }
  for (const node of nodes) {
    if (node.type === "text" || node.type === "hardBreak") {
      inline.push(node)
      continue
    }
    flushInline()
    if (
      node.type === "paragraph"
      || node.type === "heading"
      || node.type === "bulletList"
      || node.type === "orderedList"
      || node.type === "blockquote"
    ) {
      out.push(node)
    } else {
      out.push({ type: "paragraph", content: [node] })
    }
  }
  flushInline()
  return out.length > 0 ? out : [{ type: "paragraph" }]
}

const MARK_TAGS: Record<string, (attrs: Record<string, string>) => TipTapMark> = {
  strong: () => ({ type: "bold" }),
  b: () => ({ type: "bold" }),
  em: () => ({ type: "italic" }),
  i: () => ({ type: "italic" }),
  u: () => ({ type: "underline" }),
  s: () => ({ type: "strike" }),
  strike: () => ({ type: "strike" }),
  code: () => ({ type: "code" }),
  mark: () => ({ type: "highlight" }),
  a: (attrs) => ({
    type: "link",
    attrs: {
      href: attrs.href ?? "",
      target: attrs.target ?? null,
    },
  }),
}

function collectUntilClose(tokens: HtmlToken[], start: number, name: string): { nodes: TipTapNode[]; next: number } {
  const nodes: TipTapNode[] = []
  let i = start
  const marks: TipTapMark[] = []
  const pushText = (value: string) => {
    if (!value) return
    nodes.push({
      type: "text",
      text: value,
      ...(marks.length ? { marks: marks.map((mark) => ({ ...mark, attrs: mark.attrs ? { ...mark.attrs } : undefined })) } : {}),
    })
  }
  while (i < tokens.length) {
    const token = tokens[i]!
    if (token.kind === "close" && token.name === name) return { nodes, next: i + 1 }
    if (token.kind === "text") {
      pushText(token.value)
      i += 1
      continue
    }
    if (token.kind === "void" && token.name === "br") {
      nodes.push({ type: "hardBreak" })
      i += 1
      continue
    }
    if (token.kind === "void" && token.name === "hr") {
      nodes.push({ type: "horizontalRule" })
      i += 1
      continue
    }
    if (token.kind === "void" && token.name === "img") {
      const src = String(token.attrs.src ?? "").trim()
      if (src) {
        nodes.push({
          type: "attachmentBlock",
          attrs: {
            src,
            alt: token.attrs.alt ?? "",
            attachmentId: token.attrs["data-attachment-id"] ?? "",
            mediaType: "image",
          },
        })
      }
      i += 1
      continue
    }
    if (token.kind === "open" && MARK_TAGS[token.name]) {
      marks.push(MARK_TAGS[token.name]!(token.attrs))
      i += 1
      continue
    }
    if (token.kind === "close" && MARK_TAGS[token.name]) {
      const markType = MARK_TAGS[token.name]!({}).type
      let idx = -1
      for (let m = marks.length - 1; m >= 0; m -= 1) {
        if (marks[m]?.type === markType) {
          idx = m
          break
        }
      }
      if (idx >= 0) marks.splice(idx, 1)
      i += 1
      continue
    }
    if (token.kind === "open" && TABLE_SKIP_TAGS.has(token.name)) {
      i = collectUntilClose(tokens, i + 1, token.name).next
      continue
    }
    if (token.kind === "open" && TABLE_UNWRAP_TAGS.has(token.name)) {
      const nested = collectUntilClose(tokens, i + 1, token.name)
      nodes.push(...nested.nodes)
      i = nested.next
      continue
    }
    if (token.kind === "open" && BLOCK_TAGS[token.name]) {
      const spec = BLOCK_TAGS[token.name]!
      const nested = collectUntilClose(tokens, i + 1, token.name)
      const child: TipTapNode = {
        type: spec.type,
        ...(spec.attrs ? { attrs: spec.attrs(token.attrs) } : {}),
        content: nested.nodes.length ? nested.nodes : undefined,
      }
      if (spec.type === "listItem" && !(nested.nodes[0]?.type === "paragraph")) {
        child.content = [{ type: "paragraph", content: nested.nodes }]
      }
      if (spec.type === "tableHeader" || spec.type === "tableCell") {
        child.content = ensureCellBlocks(nested.nodes)
      }
      if (spec.type === "table") {
        child.content = (nested.nodes ?? []).filter((node) => node.type === "tableRow")
      }
      nodes.push(child)
      i = nested.next
      continue
    }
    i += 1
  }
  return { nodes, next: i }
}

function unescapeEscapedAnchors(html: string): string {
  return String(html ?? "").replace(
    /&lt;a([\s\S]*?)&gt;([\s\S]*?)&lt;\/a&gt;/gi,
    (_match, attrs, text) => `<a${decodeEntities(String(attrs ?? ""))}>${text}</a>`,
  )
}

function parseHtmlToTipTapDoc(html: string): TipTapDoc {
  const tokens = tokenizeHtml(html)
  const { nodes } = collectUntilClose(tokens, 0, "")
  const blocks = nodes.filter((node) => node.type !== "text" || Boolean(node.text?.trim()))
  if (blocks.length === 0) {
    return { type: "doc", content: [{ type: "paragraph" }] }
  }
  const onlyInline = blocks.every((node) => node.type === "text" || node.type === "hardBreak")
  if (onlyInline) {
    return { type: "doc", content: [{ type: "paragraph", content: blocks }] }
  }
  return {
    type: "doc",
    content: blocks.map((node) => (
      node.type === "text" || node.type === "hardBreak"
        ? { type: "paragraph", content: [node] }
        : node
    )),
  }
}

const LITERAL_ANCHOR_RE = /<a\b[^>]*href\s*=/i

function nodeHasLiteralAnchor(node: TipTapNode): boolean {
  if (node.type === "text") return LITERAL_ANCHOR_RE.test(String(node.text ?? ""))
  return (node.content ?? []).some((child) => nodeHasLiteralAnchor(child))
}

function rawInlineHtml(node: TipTapNode): string {
  if (node.type === "text") {
    const text = String(node.text ?? "")
    if (LITERAL_ANCHOR_RE.test(text)) return text
    return wrapMarks(escapeHtml(text), node.marks)
  }
  if (node.type === "hardBreak") return "<br>"
  return (node.content ?? []).map((child) => rawInlineHtml(child)).join("")
}

/** Turn leftover `<a href>` strings inside text nodes into real link marks. */
export function promoteLiteralHtmlAnchors(doc: TipTapDoc): TipTapDoc {
  if (!nodeHasLiteralAnchor(doc)) return doc
  const walk = (node: TipTapNode): TipTapNode => {
    if (!Array.isArray(node.content) || node.content.length === 0) return node
    const hasLiteral = node.content.some((child) => (
      child.type === "text" && LITERAL_ANCHOR_RE.test(String(child.text ?? ""))
    ))
    if (hasLiteral && (node.type === "paragraph" || node.type === "heading" || node.type === "listItem")) {
      const tag = node.type === "heading"
        ? `h${Math.min(6, Math.max(1, Number(node.attrs?.level ?? 2) || 2))}`
        : node.type === "listItem"
          ? "li"
          : "p"
      const parsed = parseHtmlToTipTapDoc(`<${tag}>${node.content.map((child) => rawInlineHtml(child)).join("")}</${tag}>`)
      return parsed.content?.[0] ?? { ...node, content: node.content.map(walk) }
    }
    return { ...node, content: node.content.map(walk) }
  }
  return { type: "doc", content: (doc.content ?? []).map(walk) }
}

export function htmlToTipTapDoc(html: string): TipTapDoc {
  const source = unescapeEscapedAnchors(normalizeLeftoverMarkdownHtml(String(html ?? "").trim()))
  if (!source) return { type: "doc", content: [{ type: "paragraph" }] }
  return promoteLiteralHtmlAnchors(parseHtmlToTipTapDoc(source))
}

function extractBlocksHtml(contentJson: unknown): string {
  const row = asRecord(contentJson)
  const blocks = Array.isArray(row?.blocks) ? row.blocks : []
  return blocks
    .map((block) => {
      const rec = asRecord(block)
      return typeof rec?.html === "string" ? rec.html.trim() : ""
    })
    .filter(Boolean)
    .join("")
}

export function blockPlainText(node: TipTapNode | null | undefined): string {
  return normalizePlainText(tipTapJsonToPlainText(node))
}

const RETYPEABLE_BLOCKS = new Set(["paragraph", "heading", "blockquote", "codeBlock"])
export const CONFLICT_SPAN_MAX = 240

function cloneTipTapDoc(doc: TipTapDoc): TipTapDoc {
  return JSON.parse(JSON.stringify(doc)) as TipTapDoc
}

function headingLevel(node: TipTapNode): number {
  return Math.min(6, Math.max(1, Number(node.attrs?.level ?? 2) || 2))
}

function sameBlockShape(left: TipTapNode, right: TipTapNode): boolean {
  if (left.type !== right.type) return false
  if (left.type === "heading") return headingLevel(left) === headingLevel(right)
  return true
}

function canRetypeBlock(from: TipTapNode, to: TipTapNode): boolean {
  return RETYPEABLE_BLOCKS.has(from.type) && RETYPEABLE_BLOCKS.has(to.type)
}

function collectRetypeTargets(nodes: TipTapNode[], into: TipTapNode[] = []): TipTapNode[] {
  for (const node of nodes) {
    if (RETYPEABLE_BLOCKS.has(node.type) && blockPlainText(node)) into.push(node)
    if (
      node.content
      && (node.type === "bulletList" || node.type === "orderedList" || node.type === "blockquote" || node.type === "listItem")
    ) {
      collectRetypeTargets(node.content, into)
    }
  }
  return into
}

/** Copy inline marks (links, bold) from patched blocks onto live blocks with the same text. */
export function applyPatchedInlineMarks(live: TipTapDoc, patched: TipTapDoc): {
  doc: TipTapDoc
  changed: number
} {
  const doc = cloneTipTapDoc(live)
  const patchedDoc = promoteLiteralHtmlAnchors(cloneTipTapDoc(patched))
  const used = new Set<number>()
  let changed = 0
  const targets = patchedDoc.content ?? []
  for (const node of doc.content ?? []) {
    const text = blockPlainText(node)
    if (!text) continue
    const targetIndex = targets.findIndex((target, index) => (
      !used.has(index) && blockPlainText(target) === text
    ))
    if (targetIndex < 0) continue
    const target = targets[targetIndex]!
    used.add(targetIndex)
    if (JSON.stringify(node.content ?? []) === JSON.stringify(target.content ?? [])) continue
    node.content = JSON.parse(JSON.stringify(target.content ?? [])) as TipTapNode[]
    changed += 1
  }
  return { doc, changed }
}

/** Copy block type/attrs from the incoming doc onto live blocks with the same text. */
export function applyMatchingBlockShapes(live: TipTapDoc, patched: TipTapDoc): {
  doc: TipTapDoc
  changed: number
} {
  const targets = collectRetypeTargets(patched.content ?? [])
  const used = new Set<number>()
  const doc = cloneTipTapDoc(live)
  let changed = 0
  const visit = (nodes: TipTapNode[]) => {
    for (const node of nodes) {
      const text = blockPlainText(node)
      if (text) {
        const targetIndex = targets.findIndex((target, index) => (
          !used.has(index) && blockPlainText(target) === text && canRetypeBlock(node, target)
        ))
        if (targetIndex >= 0) {
          const target = targets[targetIndex]!
          used.add(targetIndex)
          if (!sameBlockShape(node, target)) {
            node.type = target.type
            node.attrs = target.attrs ? { ...target.attrs } : undefined
            changed += 1
          }
        }
      }
      if (
        node.content
        && (node.type === "bulletList" || node.type === "orderedList" || node.type === "blockquote" || node.type === "listItem")
      ) {
        visit(node.content)
      }
    }
  }
  visit(doc.content ?? [])
  return { doc, changed }
}

/** @deprecated Use applyMatchingBlockShapes — kept for existing imports. */
export function applyHeadingPromotions(live: TipTapDoc, patched: TipTapDoc) {
  return applyMatchingBlockShapes(live, patched)
}

export function mergeMissingPatchedBlocks(
  live: TipTapDoc,
  patched: TipTapDoc,
  options?: { allowOrphanInsert?: boolean },
): {
  doc: TipTapDoc
  inserted: number
} {
  const doc = cloneTipTapDoc(live)
  const content = Array.isArray(doc.content) ? [...doc.content] : []
  const liveTexts = new Set(content.map((node) => blockPlainText(node)).filter(Boolean))
  const patchedBlocks = patched.content ?? []
  let inserted = 0
  for (let index = 0; index < patchedBlocks.length; index += 1) {
    const block = patchedBlocks[index]!
    const text = blockPlainText(block)
    if (!text || liveTexts.has(text)) continue
    let insertAt = -1
    for (let prev = index - 1; prev >= 0; prev -= 1) {
      const prevText = blockPlainText(patchedBlocks[prev]!)
      const found = content.findIndex((node) => blockPlainText(node) === prevText)
      if (found >= 0) {
        insertAt = found + 1
        break
      }
    }
    if (insertAt < 0) {
      for (let next = index + 1; next < patchedBlocks.length; next += 1) {
        const nextText = blockPlainText(patchedBlocks[next]!)
        const found = content.findIndex((node) => blockPlainText(node) === nextText)
        if (found >= 0) {
          insertAt = found
          break
        }
      }
    }
    if (insertAt < 0) {
      if (!options?.allowOrphanInsert) continue
      insertAt = content.length
    }
    content.splice(insertAt, 0, JSON.parse(JSON.stringify(block)) as TipTapNode)
    liveTexts.add(text)
    inserted += 1
  }
  doc.content = content
  return { doc, inserted }
}

export type ApplyConflictSpan = {
  current: string
  incoming: string
  expected?: string
}

export function clipConflictSpan(value: string, max = CONFLICT_SPAN_MAX): string {
  const text = normalizePlainText(value)
  if (text.length <= max) return text
  return text.slice(0, max).trim()
}

function firstSentence(value: string): string {
  const ranges = sentenceRanges(normalizePlainText(value))
  return clipConflictSpan(ranges[0]?.text ?? value)
}

function sentenceRanges(text: string): Array<{ start: number; end: number; text: string }> {
  const ranges: Array<{ start: number; end: number; text: string }> = []
  const re = /[^.!?…]+[.!?…]*(?:\s+|$)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) != null) {
    const value = match[0].trim()
    if (!value) continue
    ranges.push({ start: match.index, end: match.index + match[0].length, text: value })
  }
  return ranges
}

function phraseAround(text: string, start: number, end: number): string {
  const ranges = sentenceRanges(text)
  const from = Math.max(0, Math.min(start, text.length))
  const to = Math.max(from, Math.min(end, text.length))
  const hit = ranges.find((range) => from < range.end && to > range.start) ?? ranges[0]
  if (hit) return clipConflictSpan(hit.text)
  return clipConflictSpan(text.slice(from, to) || text)
}

function expandReplacementToPhrase(source: string, fragment: string): string {
  const haystack = normalizePlainText(source)
  const needle = normalizePlainText(fragment)
  if (!needle) return ""
  const idx = haystack.indexOf(needle)
  if (idx < 0) return phraseAround(needle, 0, needle.length)
  return phraseAround(haystack, idx, idx + needle.length)
}

export function firstDifferingPhrase(left: string, right: string): { current: string; incoming: string } {
  const a = normalizePlainText(left)
  const b = normalizePlainText(right)
  if (!a) return { current: firstSentence(b), incoming: firstSentence(b) }
  if (!b) return { current: firstSentence(a), incoming: "" }
  let start = 0
  const limit = Math.min(a.length, b.length)
  while (start < limit && a.charCodeAt(start) === b.charCodeAt(start)) start += 1
  let aEnd = a.length
  let bEnd = b.length
  while (aEnd > start && bEnd > start && a.charCodeAt(aEnd - 1) === b.charCodeAt(bEnd - 1)) {
    aEnd -= 1
    bEnd -= 1
  }
  return {
    current: phraseAround(a, start, aEnd),
    incoming: phraseAround(b, start, bEnd),
  }
}

export function localizeApplyConflict(args: {
  expectedText?: string | null
  liveText: string
  patchedText: string
  replacements?: Array<{ from: string; to: string }>
}): ApplyConflictSpan {
  const expected = normalizePlainText(String(args.expectedText ?? ""))
  const live = normalizePlainText(args.liveText)
  const patched = normalizePlainText(args.patchedText)
  const explicit = (args.replacements ?? []).filter((row) => row.from && row.from !== row.to)
  const patchChange = explicit[0]
    ?? (expected && patched ? inferGlobalReplace(expected, patched) : null)
    ?? (live && patched ? inferGlobalReplace(live, patched) : null)
  const liveChange = expected && live ? inferGlobalReplace(expected, live) : null

  if (liveChange && patchChange && liveChange.from === patchChange.from && liveChange.to !== patchChange.to) {
    return {
      current: expandReplacementToPhrase(live, liveChange.to) || firstDifferingPhrase(live, patched).current,
      incoming: expandReplacementToPhrase(patched, patchChange.to) || firstDifferingPhrase(live, patched).incoming,
      expected: expandReplacementToPhrase(expected, liveChange.from) || firstSentence(expected),
    }
  }

  if (patchChange && patchChange.from.length <= CONFLICT_SPAN_MAX) {
    const current = live.includes(patchChange.from)
      ? expandReplacementToPhrase(live, patchChange.from)
      : liveChange
        ? expandReplacementToPhrase(live, liveChange.to)
        : firstDifferingPhrase(live, patched).current
    return {
      current,
      incoming: expandReplacementToPhrase(patched, patchChange.to) || firstSentence(patched),
      expected: expandReplacementToPhrase(expected, patchChange.from) || firstSentence(expected),
    }
  }

  const diff = firstDifferingPhrase(live, patched || expected)
  return {
    current: diff.current,
    incoming: diff.incoming,
    expected: expected ? firstSentence(expected) : undefined,
  }
}

export function resolveAiApplyDocument(args: {
  liveDoc: TipTapDoc
  patchedDoc: TipTapDoc
  expectedText?: string | null
  requireExactCurrent?: boolean
  replacements?: Array<{ from: string; to: string }>
}): { ok: true; doc: TipTapDoc; mode: string } | {
  ok: false
  reason: "expected_text_mismatch"
  currentText: string
  conflict: ApplyConflictSpan
} {
  const liveText = normalizePlainText(tipTapJsonToPlainText(args.liveDoc))
  const patchedText = normalizePlainText(tipTapJsonToPlainText(args.patchedDoc))
  const expected = normalizePlainText(String(args.expectedText ?? ""))
  const currentMatchesExpected = !expected || isEditoriallyEquivalent(liveText, expected)
  const shaped = applyMatchingBlockShapes(args.liveDoc, args.patchedDoc)
  const canMergeMissing = currentMatchesExpected || !args.requireExactCurrent
  const merged = mergeMissingPatchedBlocks(shaped.doc, args.patchedDoc, {
    allowOrphanInsert: canMergeMissing,
  })
  const mergedText = normalizePlainText(tipTapJsonToPlainText(merged.doc))
  const fail = (): {
    ok: false
    reason: "expected_text_mismatch"
    currentText: string
    conflict: ApplyConflictSpan
  } => ({
    ok: false,
    reason: "expected_text_mismatch",
    currentText: liveText,
    conflict: localizeApplyConflict({
      expectedText: expected,
      liveText,
      patchedText,
      replacements: args.replacements,
    }),
  })

  if (isEditoriallyEquivalent(liveText, patchedText) || isEditoriallyEquivalent(mergedText, patchedText)) {
    const marked = applyPatchedInlineMarks(merged.doc, args.patchedDoc)
    return {
      ok: true,
      doc: marked.doc,
      mode: marked.changed ? "marks" : (shaped.changed || merged.inserted ? "structure" : "already"),
    }
  }

  const explicit = (args.replacements ?? []).filter((row) => row.from && row.from !== row.to)
  const inferred = explicit.length === 0 && expected && patchedText
    ? inferGlobalReplace(expected, patchedText)
    : null
  const pairs = explicit.length > 0 ? explicit : (inferred ? [inferred] : [])
  if (pairs.length > 0 && pairs.every((row) => liveText.includes(row.from))) {
    const replaced = replaceInTipTapDoc(merged.doc, pairs)
    if (replaced.count > 0) {
      const marked = applyPatchedInlineMarks(replaced.doc, args.patchedDoc)
      return {
        ok: true,
        doc: marked.doc,
        mode: marked.changed ? "replace-live-marks" : "replace-live",
      }
    }
  }

  if (shaped.changed > 0 || merged.inserted > 0) {
    return { ok: true, doc: merged.doc, mode: "structure" }
  }

  if (args.requireExactCurrent && expected && !currentMatchesExpected) {
    return fail()
  }
  if (expected && !liveText.includes(expected) && !patchedText.includes(expected) && !currentMatchesExpected) {
    return fail()
  }
  if (currentMatchesExpected || !expected) {
    return { ok: true, doc: args.patchedDoc, mode: "full" }
  }
  return fail()
}

export function patchedContentToTipTapDoc(args: {
  contentJson?: unknown
  html?: string | null
  text?: string | null
}): TipTapDoc {
  const html = String(args.html ?? "").trim() || extractBlocksHtml(args.contentJson)
  if (html) return htmlToTipTapDoc(html)
  const fromJson = extractTipTapDoc(args.contentJson)
  if (fromJson) {
    const jsonHtml = tipTapJsonToHtml(fromJson)
    if (hasLeftoverMarkdown(jsonHtml) || hasLeftoverMarkdown(tipTapJsonToPlainText(fromJson))) {
      return htmlToTipTapDoc(jsonHtml)
    }
    return fromJson
  }
  const text = String(args.text ?? "").trim()
  if (text) return htmlToTipTapDoc(`<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`)
  return { type: "doc", content: [{ type: "paragraph" }] }
}
