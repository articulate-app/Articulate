export type ExtractedLinkUrl = {
  url: string
  anchorText: string | null
}

const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi
const RAW_URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`\]\)]+/gi

export function isMediaOrStorageUrl(url: string): boolean {
  const normalized = String(url || "").toLowerCase()
  return (
    normalized.includes("/storage/v1/object/")
    || normalized.includes("/storage/v1/object/sign/")
    || normalized.includes("/storage/v1/object/public/")
    || normalized.includes("/attachments/task-outputs/")
    || normalized.includes("task-outputs/")
    || /\.(png|jpe?g|gif|webp|svg|mp4|mov|webm|avi|m4v)(\?|#|$)/i.test(normalized)
  )
}

export function cleanDetectedUrl(raw: string): string {
  let value = raw.trim()
  value = value.replace(/^[\s"'`([{<]+/, "")
  value = value.replace(/[\s"'`>]+$/, "")
  value = value.replace(/[.,!?;:]+$/, "")

  const balancePairs: Array<[string, string]> = [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ]
  for (const [open, close] of balancePairs) {
    while (value.endsWith(close)) {
      const opens = value.split(open).length - 1
      const closes = value.split(close).length - 1
      if (closes > opens) {
        value = value.slice(0, -1)
      } else {
        break
      }
    }
  }

  return value.trim()
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function decodeHtmlEntities(text: string): string {
  if (!text) return ""
  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea")
    textarea.innerHTML = text
    return textarea.value
  }
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ")
}

function pushUniqueLink(
  results: ExtractedLinkUrl[],
  seen: Set<string>,
  url: string,
  anchorText: string | null,
) {
  const trimmed = cleanDetectedUrl(url)
  if (!trimmed || isMediaOrStorageUrl(trimmed)) return
  const key = `${trimmed.toLowerCase()}::${(anchorText ?? "").trim()}`
  if (seen.has(key)) return
  seen.add(key)
  results.push({ url: trimmed, anchorText: anchorText?.trim() || null })
}

/**
 * Extract links from a rich-text/HTML/Markdown string without stripping HTML before Markdown pass.
 */
export function extractUrlsFromRichTextString(text: string): ExtractedLinkUrl[] {
  const raw = text ?? ""
  if (!raw.trim()) return []

  const decoded = decodeHtmlEntities(raw)
  const results: ExtractedLinkUrl[] = []
  const seen = new Set<string>()

  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(decoded, "text/html")
    for (const anchorEl of Array.from(doc.querySelectorAll("a[href]"))) {
      const href = String(anchorEl.getAttribute("href") ?? "").trim()
      if (!href) continue
      pushUniqueLink(results, seen, href, stripHtmlTags(anchorEl.innerHTML || "") || null)
    }
  } else {
    const htmlAnchorPattern = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
    let htmlMatch: RegExpExecArray | null = null
    while ((htmlMatch = htmlAnchorPattern.exec(decoded)) != null) {
      pushUniqueLink(results, seen, htmlMatch[1], stripHtmlTags(htmlMatch[2] || "") || null)
    }
  }

  MARKDOWN_LINK_PATTERN.lastIndex = 0
  let markdownMatch: RegExpExecArray | null = null
  const urlsWithAnchorText = new Set<string>()
  while ((markdownMatch = MARKDOWN_LINK_PATTERN.exec(decoded)) != null) {
    const url = cleanDetectedUrl(markdownMatch[2])
    if (url) urlsWithAnchorText.add(url.toLowerCase())
    pushUniqueLink(results, seen, markdownMatch[2], markdownMatch[1]?.trim() || null)
  }

  RAW_URL_PATTERN.lastIndex = 0
  let rawUrlMatch: RegExpExecArray | null = null
  while ((rawUrlMatch = RAW_URL_PATTERN.exec(decoded)) != null) {
    const cleaned = cleanDetectedUrl(rawUrlMatch[0])
    if (cleaned && urlsWithAnchorText.has(cleaned.toLowerCase())) continue
    pushUniqueLink(results, seen, rawUrlMatch[0], null)
  }

  return results
}

function extractUrlsFromStructuredValue(value: unknown): ExtractedLinkUrl[] {
  const results: ExtractedLinkUrl[] = []
  const seen = new Set<string>()

  const pushLink = (url: unknown, anchorText?: unknown) => {
    if (typeof url !== "string") return
    pushUniqueLink(
      results,
      seen,
      url,
      typeof anchorText === "string" ? anchorText.trim() || null : null,
    )
  }

  const collectText = (node: unknown): string => {
    if (!node) return ""
    if (typeof node === "string") return node
    if (Array.isArray(node)) return node.map(collectText).filter(Boolean).join(" ").trim()
    if (typeof node !== "object") return ""
    const obj = node as Record<string, unknown>
    const ownText = typeof obj.text === "string" ? obj.text : ""
    const nestedText = Object.values(obj)
      .map(collectText)
      .filter(Boolean)
      .join(" ")
      .trim()
    return `${ownText} ${nestedText}`.trim()
  }

  const walk = (node: unknown) => {
    if (node == null) return
    if (typeof node === "string") {
      for (const entry of extractUrlsFromRichTextString(node)) {
        pushLink(entry.url, entry.anchorText)
      }
      return
    }
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node !== "object") return

    const obj = node as Record<string, unknown>
    const nodeText = typeof obj.text === "string" ? obj.text : undefined
    const nodeType = typeof obj.type === "string" ? obj.type.toLowerCase() : ""
    const isTextualNode = nodeType === "paragraph" || nodeType === "text" || nodeType === "link"

    if (typeof nodeText === "string" && nodeText.trim()) {
      for (const entry of extractUrlsFromRichTextString(nodeText)) {
        pushLink(entry.url, entry.anchorText)
      }
    }

    if (isTextualNode && typeof obj.href === "string") pushLink(obj.href, nodeText)

    if (isTextualNode && obj.attrs && typeof obj.attrs === "object") {
      const attrs = obj.attrs as Record<string, unknown>
      if (typeof attrs.href === "string") pushLink(attrs.href, nodeText)
    }

    if (Array.isArray(obj.marks) && typeof obj.text === "string") {
      for (const mark of obj.marks) {
        if (!mark || typeof mark !== "object") continue
        const markObj = mark as Record<string, unknown>
        const markType = typeof markObj.type === "string" ? markObj.type : ""
        if (markType !== "link") continue
        const markAttrs = markObj.attrs && typeof markObj.attrs === "object"
          ? (markObj.attrs as Record<string, unknown>)
          : null
        if (markAttrs && typeof markAttrs.href === "string") {
          pushLink(markAttrs.href, obj.text)
        }
      }
    }

    if (nodeType === "link") {
      const attrs = obj.attrs && typeof obj.attrs === "object"
        ? (obj.attrs as Record<string, unknown>)
        : null
      if (attrs && typeof attrs.href === "string") {
        pushLink(attrs.href, collectText(obj.content))
      }
    }

    Object.values(obj).forEach(walk)
  }

  walk(value)
  return results
}

export function extractUrlsFromOutputValue(output: unknown): ExtractedLinkUrl[] {
  if (typeof output === "string") {
    const trimmed = output.trim()
    if (!trimmed) return []

    try {
      const parsed = JSON.parse(trimmed)
      const structured = extractUrlsFromStructuredValue(parsed)
      const fromString = extractUrlsFromRichTextString(trimmed)
      const merged = [...structured]
      const seen = new Set(structured.map((entry) => `${entry.url}::${entry.anchorText ?? ""}`))
      for (const entry of fromString) {
        const key = `${entry.url}::${entry.anchorText ?? ""}`
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(entry)
      }
      return merged
    } catch {
      return extractUrlsFromRichTextString(trimmed)
    }
  }

  if (output && typeof output === "object") {
    return extractUrlsFromStructuredValue(output)
  }

  return []
}

export type ComponentOutputForLinkExtraction = {
  content_text?: string | null
  content?: unknown
  content_json?: unknown
  resolved_content_json?: unknown
}

export type OutputContentBlockForLinkExtraction = {
  type: string
  text?: string
}

export function extractUrlsFromComponentOutputSources(args: {
  output: ComponentOutputForLinkExtraction | null | undefined
  blocks: OutputContentBlockForLinkExtraction[]
}): ExtractedLinkUrl[] {
  const { output, blocks } = args
  if (!output) return []

  const seen = new Set<string>()
  const results: ExtractedLinkUrl[] = []

  const append = (entries: ExtractedLinkUrl[]) => {
    for (const entry of entries) {
      const key = `${entry.url.toLowerCase()}::${(entry.anchorText ?? "").trim()}`
      if (!key || seen.has(key)) continue
      seen.add(key)
      results.push(entry)
    }
  }

  for (const block of blocks) {
    if (block.type !== "paragraph") continue
    const text = typeof block.text === "string" ? block.text : ""
    if (!text.trim()) continue
    append(extractUrlsFromOutputValue(text))
  }

  if (output.content_text?.trim()) {
    append(extractUrlsFromOutputValue(output.content_text))
  }

  append(extractUrlsFromOutputValue(output.content))
  append(extractUrlsFromOutputValue(output.content_json))
  append(extractUrlsFromOutputValue(output.resolved_content_json))

  return results
}
