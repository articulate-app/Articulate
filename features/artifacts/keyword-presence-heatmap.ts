import {
  countKeywordOccurrences,
  normalizeKeywordMatchText,
} from "../tasks/utils/keyword-density"

export type KeywordHeatmapSegment = {
  id: string
  /** Plain text for this slice of the article. */
  text: string
  /** Short preview for the list. */
  preview: string
  hitCount: number
  /** 0–1 position along the document. */
  startRatio: number
  endRatio: number
}

export type PresenceMatchMode = "keyword" | "substring"

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function buildKeywordPhraseRegex(keywordNormalized: string): RegExp | null {
  const parts = keywordNormalized.split(" ").filter(Boolean)
  if (parts.length === 0) return null
  const pattern = parts.map(escapeRegExp).join("\\s+")
  return new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, "giu")
}

function countSubstringOccurrences(haystack: string, needle: string): number {
  const query = String(needle ?? "").trim()
  if (!query || !haystack) return 0
  const source = haystack.toLowerCase()
  const target = query.toLowerCase()
  let count = 0
  let from = 0
  while (from <= source.length - target.length) {
    const idx = source.indexOf(target, from)
    if (idx < 0) break
    count += 1
    from = idx + Math.max(1, target.length)
  }
  return count
}

function splitChunksForHeatmap(source: string): string[] {
  let chunks = source
    .split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ0-9«"'(])|(?:\n\s*){2,}|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (chunks.length < 4) {
    const words = source.split(/\s+/).filter(Boolean)
    const windowSize = Math.max(40, Math.ceil(words.length / 24))
    chunks = []
    for (let i = 0; i < words.length; i += windowSize) {
      chunks.push(words.slice(i, i + windowSize).join(" "))
    }
  }

  const maxCells = 48
  if (chunks.length > maxCells) {
    const merged: string[] = []
    const group = Math.ceil(chunks.length / maxCells)
    for (let i = 0; i < chunks.length; i += group) {
      merged.push(chunks.slice(i, i + group).join(" "))
    }
    chunks = merged
  }
  return chunks
}

function countHitsInChunk(
  text: string,
  query: string,
  mode: PresenceMatchMode,
): number {
  if (mode === "substring") return countSubstringOccurrences(text, query)
  return countKeywordOccurrences(text, query)
}

/** Split article text into paragraph-ish segments for a presence heatmap. */
export function buildPresenceHeatmap(
  plainText: string,
  query: string,
  mode: PresenceMatchMode = "keyword",
): KeywordHeatmapSegment[] {
  const source = String(plainText ?? "").replace(/\s+/g, " ").trim()
  if (!source) return []

  const normalizedQuery =
    mode === "keyword" ? normalizeKeywordMatchText(query) : String(query ?? "").trim()
  if (!normalizedQuery) return []

  const chunks = splitChunksForHeatmap(source)
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0) || 1
  let cursor = 0
  return chunks.map((text, index) => {
    const hitCount = countHitsInChunk(text, query, mode)
    const startRatio = cursor / totalChars
    cursor += text.length
    const endRatio = cursor / totalChars
    const preview =
      text.length > 110 ? `${text.slice(0, 107).trimEnd()}…` : text
    return {
      id: `seg-${index}`,
      text,
      preview,
      hitCount,
      startRatio,
      endRatio,
    }
  })
}

/** Split article text into paragraph-ish segments for a keyword presence heatmap. */
export function buildKeywordPresenceHeatmap(
  plainText: string,
  keyword: string,
): KeywordHeatmapSegment[] {
  return buildPresenceHeatmap(plainText, keyword, "keyword")
}

function splitPreviewByRegex(
  preview: string,
  regex: RegExp | null,
): Array<{ text: string; hit: boolean }> {
  if (!regex || !preview.trim()) return [{ text: preview, hit: false }]

  const parts: Array<{ text: string; hit: boolean }> = []
  let lastIndex = 0
  const source = preview
  const live = new RegExp(regex.source, regex.flags)
  let match: RegExpExecArray | null
  while ((match = live.exec(source)) != null) {
    if (match.index > lastIndex) {
      parts.push({ text: source.slice(lastIndex, match.index), hit: false })
    }
    parts.push({ text: match[0], hit: true })
    lastIndex = match.index + match[0].length
    if (match[0].length === 0) live.lastIndex += 1
  }
  if (lastIndex < source.length) {
    parts.push({ text: source.slice(lastIndex), hit: false })
  }
  return parts.length > 0 ? parts : [{ text: preview, hit: false }]
}

/** Highlight matches inside a plain preview string. */
export function splitPreviewByQuery(
  preview: string,
  query: string,
  mode: PresenceMatchMode = "keyword",
): Array<{ text: string; hit: boolean }> {
  if (mode === "substring") {
    const needle = String(query ?? "").trim()
    if (!needle || !preview.trim()) return [{ text: preview, hit: false }]
    return splitPreviewByRegex(preview, new RegExp(escapeRegExp(needle), "gi"))
  }
  const keywordNormalized = normalizeKeywordMatchText(query)
  return splitPreviewByRegex(preview, buildKeywordPhraseRegex(keywordNormalized))
}

/** Highlight keyword matches inside a plain preview string (returns React-safe parts via markers). */
export function splitPreviewByKeyword(
  preview: string,
  keyword: string,
): Array<{ text: string; hit: boolean }> {
  return splitPreviewByQuery(preview, keyword, "keyword")
}

function flashArtifactTarget(el: HTMLElement) {
  el.scrollIntoView({ behavior: "smooth", block: "center" })
  el.classList.add("ring-2", "ring-amber-300", "rounded-sm")
  window.setTimeout(() => {
    el.classList.remove("ring-2", "ring-amber-300", "rounded-sm")
  }, 1200)
}

export function scrollArtifactPaneToQuote(quote: string): boolean {
  if (typeof document === "undefined") return false
  const root = document.querySelector<HTMLElement>('[data-ai-selectable="artifact"]')
  if (!root) return false
  const needle = quote.trim().slice(0, 80).toLowerCase()
  if (!needle) return false

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null = walker.nextNode()
  while (node) {
    const value = (node.textContent ?? "").replace(/\s+/g, " ")
    const idx = value.toLowerCase().indexOf(needle.slice(0, Math.min(40, needle.length)))
    if (idx >= 0) {
      const parent = node.parentElement
      if (parent) {
        flashArtifactTarget(parent)
        return true
      }
    }
    node = walker.nextNode()
  }
  return false
}

/** Scroll to the first `<a>` whose href matches (link heatmap). */
export function scrollArtifactPaneToUrl(url: string, fallbackQuote?: string): boolean {
  if (typeof document === "undefined") return false
  const root = document.querySelector<HTMLElement>('[data-ai-selectable="artifact"]')
  if (!root) return false
  const target = String(url ?? "").trim().toLowerCase().replace(/\/$/, "")
  if (!target) return fallbackQuote ? scrollArtifactPaneToQuote(fallbackQuote) : false

  for (const anchor of Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    const href = String(anchor.getAttribute("href") ?? "").trim().toLowerCase().replace(/\/$/, "")
    if (!href) continue
    if (href === target || href.includes(target) || target.includes(href)) {
      flashArtifactTarget(anchor)
      return true
    }
  }

  return fallbackQuote ? scrollArtifactPaneToQuote(fallbackQuote) : scrollArtifactPaneToQuote(url)
}
