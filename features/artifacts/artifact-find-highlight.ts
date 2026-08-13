/**
 * Live yellow find highlights in the artifact pane via the CSS Custom Highlight API
 * (does not mutate TipTap / contentEditable DOM). Falls back to temporary <mark> wraps.
 */

const HIGHLIGHT_NAME = "artifact-find"
const ACTIVE_HIGHLIGHT_NAME = "artifact-find-active"
const FALLBACK_MARK_ATTR = "data-artifact-find-mark"

export type ArtifactFindHighlightOptions = {
  caseSensitive?: boolean
  /** 0-based index of the active match (stronger yellow). */
  activeIndex?: number
}

export type ArtifactFindHighlightResult = {
  matchCount: number
  activeIndex: number
}

function supportsCssHighlights(): boolean {
  return (
    typeof CSS !== "undefined"
    && "highlights" in CSS
    && typeof Highlight !== "undefined"
  )
}

function getArtifactRoots(): HTMLElement[] {
  if (typeof document === "undefined") return []
  const roots = Array.from(
    document.querySelectorAll<HTMLElement>('[data-ai-selectable="artifact"]'),
  )
  const withIframes: HTMLElement[] = [...roots]
  for (const root of roots) {
    for (const iframe of Array.from(root.querySelectorAll("iframe"))) {
      try {
        const doc = iframe.contentDocument
        if (doc?.body) withIframes.push(doc.body)
      } catch {
        // Cross-origin iframe — skip.
      }
    }
  }
  return withIframes
}

function clearFallbackMarks(root: HTMLElement) {
  const marks = Array.from(
    root.querySelectorAll<HTMLElement>(`mark[${FALLBACK_MARK_ATTR}]`),
  )
  for (const mark of marks) {
    const parent = mark.parentNode
    if (!parent) continue
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
    parent.normalize()
  }
}

export function clearArtifactFindHighlights() {
  if (supportsCssHighlights()) {
    CSS.highlights.delete(HIGHLIGHT_NAME)
    CSS.highlights.delete(ACTIVE_HIGHLIGHT_NAME)
  }
  for (const root of getArtifactRoots()) {
    clearFallbackMarks(root)
  }
}

function collectTextMatches(
  root: HTMLElement,
  query: string,
  caseSensitive: boolean,
): Range[] {
  const ranges: Range[] = []
  const needle = caseSensitive ? query : query.toLowerCase()
  if (!needle) return ranges

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (parent.closest("script, style, noscript")) return NodeFilter.FILTER_REJECT
      if (!(node.textContent ?? "").trim()) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  let node: Node | null = walker.nextNode()
  while (node) {
    const value = node.textContent ?? ""
    const haystack = caseSensitive ? value : value.toLowerCase()
    let from = 0
    while (from <= haystack.length - needle.length) {
      const at = haystack.indexOf(needle, from)
      if (at < 0) break
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + query.length)
      ranges.push(range)
      from = at + Math.max(1, needle.length)
    }
    node = walker.nextNode()
  }
  return ranges
}

function applyFallbackMarks(
  ranges: Range[],
  activeIndex: number,
): void {
  // Apply from the end so earlier ranges stay valid.
  for (let i = ranges.length - 1; i >= 0; i -= 1) {
    const range = ranges[i]
    if (!range || range.collapsed) continue
    const mark = document.createElement("mark")
    mark.setAttribute(FALLBACK_MARK_ATTR, i === activeIndex ? "active" : "match")
    mark.className =
      i === activeIndex
        ? "rounded-sm bg-yellow-400 px-0.5 text-inherit"
        : "rounded-sm bg-yellow-200 px-0.5 text-inherit"
    try {
      range.surroundContents(mark)
    } catch {
      // Partial element boundaries — skip this match.
    }
  }
}

/**
 * Highlight all matches for `query` inside artifact roots.
 * Returns match count; scrolls the active match into view.
 */
export function applyArtifactFindHighlights(
  query: string,
  options?: ArtifactFindHighlightOptions,
): ArtifactFindHighlightResult {
  clearArtifactFindHighlights()
  const needle = String(query ?? "")
  if (!needle.trim()) {
    return { matchCount: 0, activeIndex: 0 }
  }

  const caseSensitive = options?.caseSensitive === true
  const allRanges: Range[] = []
  for (const root of getArtifactRoots()) {
    allRanges.push(...collectTextMatches(root, needle, caseSensitive))
  }

  if (allRanges.length === 0) {
    return { matchCount: 0, activeIndex: 0 }
  }

  const activeIndex = Math.min(
    Math.max(0, options?.activeIndex ?? 0),
    allRanges.length - 1,
  )

  if (supportsCssHighlights()) {
    const rest = allRanges.filter((_, index) => index !== activeIndex)
    const active = allRanges[activeIndex]
    if (rest.length > 0) {
      CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...rest))
    }
    if (active) {
      CSS.highlights.set(ACTIVE_HIGHLIGHT_NAME, new Highlight(active))
    }
  } else {
    applyFallbackMarks(allRanges, activeIndex)
  }

  const activeRange = allRanges[activeIndex]
  if (activeRange) {
    const node = activeRange.startContainer
    const el =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as HTMLElement)
        : node.parentElement
    el?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  return { matchCount: allRanges.length, activeIndex }
}

export function cycleArtifactFindHighlight(
  query: string,
  currentActiveIndex: number,
  options?: Omit<ArtifactFindHighlightOptions, "activeIndex"> & { direction?: 1 | -1 },
): ArtifactFindHighlightResult {
  const direction = options?.direction ?? 1
  const probe = applyArtifactFindHighlights(query, {
    caseSensitive: options?.caseSensitive,
    activeIndex: 0,
  })
  if (probe.matchCount <= 0) return probe
  const next =
    (currentActiveIndex + direction + probe.matchCount * 10) % probe.matchCount
  return applyArtifactFindHighlights(query, {
    caseSensitive: options?.caseSensitive,
    activeIndex: next,
  })
}
