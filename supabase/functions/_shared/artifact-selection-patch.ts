/**
 * Pure helpers for targeted artifact selection edits.
 * Used by the AI artifact worker and unit tests.
 *
 * Design:
 * - Use the user's exact selection (no heading→section expansion).
 * - When HTML exists, stitch the replacement into HTML so surrounding
 *   headings/bolds/lists are never regenerated from flattened content_text.
 */

export type ArtifactSelectionLike = {
  selected_text?: string | null
  selection_before?: string | null
  selection_after?: string | null
  selection_start?: number | null
  selection_end?: number | null
  text_range?: { start?: number | null; end?: number | null } | null
  artifact_id?: string | null
  version_number?: number | null
  anchor_type?: string | null
  [key: string]: unknown
}

export type ResolvedTextSelection = {
  start: number
  end: number
  selectedText: string
  expanded: boolean
  mode: "text"
}

export type ResolvedHtmlSelection = {
  start: number
  end: number
  selectedHtml: string
  selectedText: string
  expanded: boolean
  mode: "html"
  level: number | null
}

function normalizeWs(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
}

/** Plain text used for chat selections / content_text: tags stripped, no block separators. */
export function htmlToFlatContentText(html: string): string {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // TipTap media nodes persist debug/control chrome as text spans inside <figure>.
    // Strip the whole figure (keep a space) so diffs/previews never show "pins 0 · display…".
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, " ")
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
}

/** Readable plain text with block boundaries (for display / summaries). */
export function htmlToPlainText(html: string): string {
  return String(html ?? "")
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function stripLightMarkdown(value: string): string {
  return String(value ?? "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1$2")
    .replace(/^>\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
}

/**
 * Normalize artifact body text for honest before/after diffs.
 * HTML, markdown and flat content_text become comparable plain lines so
 * unchanged titles/paragraphs are not marked red/green after a format round-trip.
 */
export function canonicalArtifactDiffText(value: string | null | undefined): string {
  let text = String(value ?? "")
  if (!text.trim()) return ""
  if (/<[a-z][\s\S]*>/i.test(text)) {
    text = htmlToPlainText(text)
  }
  text = stripLightMarkdown(text)
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim()
}

/** Prefer HTML-derived plain text when content_json has html blocks. */
export function artifactDiffPlainFromContent(
  contentText: string | null | undefined,
  contentJson: unknown,
): string {
  const html = extractPrimaryArtifactHtml(contentJson)
  if (html) return canonicalArtifactDiffText(html)
  return canonicalArtifactDiffText(contentText)
}

export function extractPrimaryArtifactHtml(contentJson: unknown): string | null {
  if (!contentJson || typeof contentJson !== "object") return null
  const blocks = Array.isArray((contentJson as { blocks?: unknown }).blocks)
    ? (contentJson as { blocks: Array<Record<string, unknown>> }).blocks
    : []
  const htmlParts = blocks
    .map((block) => (typeof block?.html === "string" ? block.html.trim() : ""))
    .filter(Boolean)
  if (htmlParts.length > 0) return htmlParts.join("")
  return null
}

function normalizeHeadingMatchKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export type ArtifactHtmlSection = {
  headingText: string
  level: number
  start: number
  end: number
  sectionHtml: string
}

/** Split article HTML into heading→next-same-or-higher-level sections. */
export function listArtifactHtmlSections(html: string): ArtifactHtmlSection[] {
  const source = String(html ?? "")
  if (!source) return []
  const headingRe = /<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi
  const matches: Array<{ level: number; headingText: string; start: number }> = []
  let match: RegExpExecArray | null
  while ((match = headingRe.exec(source)) != null) {
    matches.push({
      level: Number(match[1]) || 2,
      headingText: normalizeHeadingMatchKey(match[2] ?? ""),
      start: match.index,
    })
  }
  if (matches.length === 0) return []
  return matches
    .map((row, index) => {
      let end = source.length
      for (let i = index + 1; i < matches.length; i++) {
        if (matches[i]!.level <= row.level) {
          end = matches[i]!.start
          break
        }
      }
      return {
        headingText: row.headingText,
        level: row.level,
        start: row.start,
        end,
        sectionHtml: source.slice(row.start, end),
      }
    })
    .filter((row) => row.headingText.length > 0)
}

/** Find a section whose heading matches `headingQuery` (substring / word overlap). */
export function extractHtmlSectionByHeading(
  html: string,
  headingQuery: string | null | undefined,
): ArtifactHtmlSection | null {
  const query = normalizeHeadingMatchKey(String(headingQuery ?? ""))
  if (!query) return null
  const sections = listArtifactHtmlSections(html)
  let best: { section: ArtifactHtmlSection; score: number } | null = null
  for (const section of sections) {
    const heading = section.headingText
    if (!heading) continue
    let score = 0
    if (heading === query || query.includes(heading) || heading.includes(query)) {
      score = heading.length + 100
    } else {
      const words = heading.split(" ").filter((w) => w.length > 3)
      const hit = words.filter((w) => query.includes(w)).length
      if (hit >= Math.min(3, words.length) && hit / Math.max(1, words.length) >= 0.6) {
        score = hit * 10 + heading.length
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { section, score }
  }
  return best?.section ?? null
}

/**
 * Convert leftover markdown list markers inside otherwise-HTML bodies into real
 * <ul>/<ol>/<li>. TipTap only renders proper list tags — `- item` text stays flat.
 */
export function normalizeMixedMarkdownInHtml(html: string): string {
  const raw = String(html ?? "").replace(/\r\n/g, "\n")
  if (!raw.trim()) return raw

  // `<p>- item</p>` / `<p>1. item</p>` → collect into lists
  const paragraphListRe = /(?:<p>\s*(?:[-*+]|\d+\.)\s+[\s\S]*?<\/p>\s*)+/gi
  let withParagraphLists = raw.replace(paragraphListRe, (block) => {
    const items: Array<{ ordered: boolean; text: string }> = []
    const itemRe = /<p>\s*(?:([-*+])|(\d+)\.)\s+([\s\S]*?)<\/p>/gi
    let itemMatch: RegExpExecArray | null
    while ((itemMatch = itemRe.exec(block)) != null) {
      items.push({
        ordered: Boolean(itemMatch[2]),
        text: String(itemMatch[3] ?? "").trim(),
      })
    }
    if (items.length === 0) return block
    const ordered = items.every((item) => item.ordered)
    const tag = ordered ? "ol" : "ul"
    return `<${tag}>${items.map((item) => `<li>${item.text}</li>`).join("")}</${tag}>`
  })

  if (!/(?:^|\n)\s*(?:[-*+]|\d+\.)\s+\S/.test(withParagraphLists)) {
    return withParagraphLists
  }

  const lines = withParagraphLists.split("\n")
  const out: string[] = []
  let listType: "ul" | "ol" | null = null
  let listItems: string[] = []

  const flushList = () => {
    if (!listType || listItems.length === 0) {
      listType = null
      listItems = []
      return
    }
    out.push(
      `<${listType}>${listItems.map((item) => `<li>${item}</li>`).join("")}</${listType}>`,
    )
    listType = null
    listItems = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const isHtmlBlock =
      /^<\/?(h[1-6]|p|ul|ol|li|blockquote|table|thead|tbody|tr|th|td|figure|div|pre|hr)\b/i.test(trimmed)
      || /<\/(h[1-6]|p|ul|ol|li|blockquote|table|figure|div|pre)\s*>$/i.test(trimmed)
    if (isHtmlBlock) {
      flushList()
      out.push(line)
      continue
    }
    const ul = /^\s*[-*+]\s+(.+)$/.exec(line)
    if (ul) {
      if (listType && listType !== "ul") flushList()
      listType = "ul"
      listItems.push(ul[1]!.trim())
      continue
    }
    const ol = /^\s*\d+\.\s+(.+)$/.exec(line)
    if (ol) {
      if (listType && listType !== "ol") flushList()
      listType = "ol"
      listItems.push(ol[1]!.trim())
      continue
    }
    flushList()
    out.push(line)
  }
  flushList()
  return out.join("\n")
}

type MediaFigureSpan = {
  attachmentId: string
  html: string
  beforeText: string
}

/**
 * TipTap persists debug/control chrome (pins badge, resize handle, ×) as real
 * DOM inside <figure>. Strip it before save/diff so content_text stays clean.
 */
export function sanitizeMediaFigureHtml(figureHtml: string): string {
  return String(figureHtml ?? "")
    .replace(/\sdata-debug-output-image-overlays=(["'])[^"']*\1/gi, ' data-debug-output-image-overlays="false"')
    .replace(/\sdata-editable-selected=(["'])[^"']*\1/gi, ' data-editable-selected="false"')
    .replace(/style=(["'])[\s\S]*?\1/gi, (styleAttr) => {
      // Drop dashed debug outlines from inline styles while keeping layout basics.
      const cleaned = styleAttr
        .replace(/outline\s*:[^;]+;?/gi, "")
        .replace(/border\s*:\s*2px dashed[^;]+;?/gi, "")
      return cleaned
    })
    .replace(/<span\b[^>]*>[\s\S]*?<\/span>/gi, "")
    .replace(/<button\b[^>]*>[\s\S]*?<\/button>/gi, "")
    .replace(/<div\b[^>]*data-output-image-(?:resize-handle|controls)[^>]*>[\s\S]*?<\/div>/gi, "")
}

export function scrubPersistedArtifactHtml(html: string): string {
  return String(html ?? "").replace(
    /<figure\b[^>]*>[\s\S]*?<\/figure>/gi,
    (figure) => sanitizeMediaFigureHtml(figure),
  )
}

/** Inline TipTap media nodes (`<figure data-attachment-id=...>`) that must survive AI rewrites. */
export function extractMediaFigures(html: string): MediaFigureSpan[] {
  const source = String(html ?? "")
  if (!source) return []
  const out: MediaFigureSpan[] = []
  const re = /<figure\b[^>]*data-attachment-id=["']([^"']+)["'][^>]*>[\s\S]*?<\/figure>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) != null) {
    const full = match[0] ?? ""
    const attachmentId = String(match[1] ?? "").trim()
    if (!attachmentId || !full) continue
    const beforeRaw = source.slice(Math.max(0, match.index - 160), match.index)
    const beforeText = htmlToFlatContentText(beforeRaw).slice(-80)
    out.push({ attachmentId, html: sanitizeMediaFigureHtml(full), beforeText })
  }
  return out
}

/**
 * Re-insert any previous media figures missing from the next HTML.
 * Best-effort: place after the nearest surviving preceding text; otherwise after the first block.
 */
export function preserveMediaFiguresInHtml(
  previousHtml: string | null | undefined,
  nextHtml: string,
): string {
  const previous = String(previousHtml ?? "")
  const next = String(nextHtml ?? "")
  if (!previous.trim() || !next.trim()) return next
  const figures = extractMediaFigures(previous)
  if (figures.length === 0) return next

  let out = next
  for (const figure of figures) {
    const alreadyPresent =
      out.includes(`data-attachment-id="${figure.attachmentId}"`)
      || out.includes(`data-attachment-id='${figure.attachmentId}'`)
    if (alreadyPresent) continue

    const anchor = figure.beforeText.trim()
    if (anchor) {
      const plain = htmlToFlatContentText(out)
      const at = plain.lastIndexOf(anchor)
      if (at >= 0) {
        // Map flat-text offset back to HTML via a coarse scan: insert after the HTML
        // position whose flat length first exceeds the end of the anchor.
        const targetFlat = at + anchor.length
        let flatLen = 0
        let htmlPos = 0
        const map = out.match(/<[^>]+>|[^<]+/g) ?? [out]
        for (const token of map) {
          if (token.startsWith("<")) {
            htmlPos += token.length
            continue
          }
          const decoded = token
            .replace(/&nbsp;/gi, " ")
            .replace(/&amp;/gi, "&")
            .replace(/&lt;/gi, "<")
            .replace(/&gt;/gi, ">")
            .replace(/&quot;/gi, '"')
          const nextFlat = flatLen + decoded.length
          if (nextFlat >= targetFlat) {
            htmlPos += Math.max(0, targetFlat - flatLen)
            out = `${out.slice(0, htmlPos)}${figure.html}${out.slice(htmlPos)}`
            flatLen = nextFlat
            break
          }
          flatLen = nextFlat
          htmlPos += token.length
        }
        if (out.includes(`data-attachment-id="${figure.attachmentId}"`)
          || out.includes(`data-attachment-id='${figure.attachmentId}'`)) {
          continue
        }
      }
    }

    const afterFirstBlock = /^(<(?:h[1-6]|p|div)\b[\s\S]*?<\/(?:h[1-6]|p|div)>)/i.exec(out)
    if (afterFirstBlock) {
      out = `${afterFirstBlock[1]}${figure.html}${out.slice(afterFirstBlock[1]!.length)}`
    } else {
      out = `${figure.html}${out}`
    }
  }
  return out
}

/**
 * Finalize model-produced artifact content for an update:
 * - keep rich_text HTML when present
 * - restore any media figures dropped by markdown regeneration
 */
export function finalizeArtifactUpdateContent(args: {
  previousContentJson: unknown
  previousContentText?: string | null
  contentText: string
  contentJson: unknown
}): {
  contentText: string
  contentJson: { version: number; blocks: Array<Record<string, unknown>> }
} {
  const normalized = ensureRichTextBlocksHaveHtml(args.contentJson, args.contentText)
  const previousHtml = extractPrimaryArtifactHtml(args.previousContentJson)
  const nextHtmlRaw = extractPrimaryArtifactHtml(normalized)
  const nextHtml = nextHtmlRaw ? normalizeMixedMarkdownInHtml(nextHtmlRaw) : null
  if (!previousHtml || !nextHtml) {
    const scrubbed = nextHtml ? scrubPersistedArtifactHtml(nextHtml) : null
    return {
      contentText: htmlToFlatContentText(scrubbed ?? "") || args.contentText,
      contentJson: scrubbed
        ? {
            version: Number(normalized.version) || 1,
            blocks: [{ id: "body", type: "rich_text", text: htmlToFlatContentText(scrubbed), html: scrubbed }],
          }
        : normalized,
    }
  }

  const preservedHtml = scrubPersistedArtifactHtml(
    preserveMediaFiguresInHtml(previousHtml, nextHtml),
  )
  if (preservedHtml === nextHtml) {
    return {
      contentText: htmlToFlatContentText(nextHtml) || args.contentText,
      contentJson: normalized,
    }
  }

  const blocks = Array.isArray(normalized.blocks) ? [...normalized.blocks] : []
  if (blocks.length === 1) {
    blocks[0] = {
      ...blocks[0],
      type: "rich_text",
      text: htmlToFlatContentText(preservedHtml),
      html: preservedHtml,
    }
  } else if (blocks.length === 0) {
    blocks.push({
      id: "body",
      type: "rich_text",
      text: htmlToFlatContentText(preservedHtml),
      html: preservedHtml,
    })
  } else {
    // Prefer a single rich_text body when we had to re-stitch media into joined HTML.
    return {
      contentText: htmlToFlatContentText(preservedHtml),
      contentJson: {
        version: Number(normalized.version) || 1,
        blocks: [{
          id: "body",
          type: "rich_text",
          text: htmlToFlatContentText(preservedHtml),
          html: preservedHtml,
        }],
      },
    }
  }

  return {
    contentText: htmlToFlatContentText(preservedHtml),
    contentJson: { version: Number(normalized.version) || 1, blocks },
  }
}

/** Merge sparse planner selection with the richer chat selected_artifact_context. */
export function mergeArtifactSelection(
  modelSelection: unknown,
  contextSelection: unknown,
): Record<string, unknown> | null {
  const model =
    modelSelection && typeof modelSelection === "object" && !Array.isArray(modelSelection)
      ? (modelSelection as Record<string, unknown>)
      : null
  const context =
    contextSelection && typeof contextSelection === "object" && !Array.isArray(contextSelection)
      ? (contextSelection as Record<string, unknown>)
      : null
  if (!model && !context) return null

  const merged: Record<string, unknown> = { ...(context ?? {}), ...(model ?? {}) }

  const pickString = (...keys: string[]) => {
    for (const key of keys) {
      const fromModel = model?.[key]
      const fromContext = context?.[key]
      if (typeof fromModel === "string" && fromModel.trim()) return fromModel
      if (typeof fromContext === "string" && fromContext.trim()) return fromContext
    }
    return null
  }
  const pickNumber = (...keys: string[]) => {
    for (const key of keys) {
      const fromModel = model?.[key]
      const fromContext = context?.[key]
      if (Number.isFinite(Number(fromModel))) return Number(fromModel)
      if (Number.isFinite(Number(fromContext))) return Number(fromContext)
    }
    return null
  }

  const selectedText = pickString("selected_text", "anchor_quote", "text")
  const selectionBefore = pickString("selection_before", "anchor_context_before")
  const selectionAfter = pickString("selection_after", "anchor_context_after")
  let selectionStart = pickNumber("selection_start", "anchor_start")
  let selectionEnd = pickNumber("selection_end", "anchor_end")

  const textRange =
    (model?.text_range && typeof model.text_range === "object"
      ? model.text_range
      : null)
    ?? (context?.text_range && typeof context.text_range === "object"
      ? context.text_range
      : null)
    ?? null
  if (textRange && typeof textRange === "object") {
    const range = textRange as { start?: unknown; end?: unknown }
    if (selectionStart == null && Number.isFinite(Number(range.start))) {
      selectionStart = Number(range.start)
    }
    if (selectionEnd == null && Number.isFinite(Number(range.end))) {
      selectionEnd = Number(range.end)
    }
  }

  if (selectedText) merged.selected_text = selectedText
  if (selectionBefore) merged.selection_before = selectionBefore
  if (selectionAfter) merged.selection_after = selectionAfter
  if (selectionStart != null) merged.selection_start = selectionStart
  if (selectionEnd != null) merged.selection_end = selectionEnd
  if (selectionStart != null && selectionEnd != null) {
    merged.text_range = { start: selectionStart, end: selectionEnd }
  }
  if (!merged.anchor_type) {
    merged.anchor_type = pickString("anchor_type") ?? "text_range"
  }

  return merged
}

/**
 * Map flat plain-text indices onto HTML source indices by walking text nodes.
 * Tags are skipped; entity-decoded text is treated as literal source characters.
 */
export function buildHtmlFlatIndexMap(html: string): {
  plain: string
  /** htmlStart index for each plain character */
  plainToHtml: number[]
} {
  const source = String(html ?? "")
  let plain = ""
  const plainToHtml: number[] = []
  let i = 0
  while (i < source.length) {
    if (source[i] === "<") {
      const close = source.indexOf(">", i + 1)
      if (close < 0) break
      i = close + 1
      continue
    }
    if (source[i] === "&") {
      const semi = source.indexOf(";", i + 1)
      if (semi > i && semi - i < 12) {
        const entity = source.slice(i, semi + 1)
        const decoded =
          entity === "&amp;" ? "&"
          : entity === "&lt;" ? "<"
          : entity === "&gt;" ? ">"
          : entity === "&quot;" ? '"'
          : entity === "&nbsp;" || entity === "&#160;" ? " "
          : null
        if (decoded != null) {
          plain += decoded
          plainToHtml.push(i)
          i = semi + 1
          continue
        }
      }
    }
    plain += source[i]
    plainToHtml.push(i)
    i += 1
  }
  return { plain, plainToHtml }
}

export function resolveTextSelection(
  contentText: string,
  selection: ArtifactSelectionLike | null | undefined,
): ResolvedTextSelection | null {
  const text = String(contentText ?? "")
  if (!text || !selection) return null

  let start =
    Number.isFinite(Number(selection.selection_start))
      ? Number(selection.selection_start)
      : Number.isFinite(Number(selection.text_range?.start))
        ? Number(selection.text_range?.start)
        : null
  let end =
    Number.isFinite(Number(selection.selection_end))
      ? Number(selection.selection_end)
      : Number.isFinite(Number(selection.text_range?.end))
        ? Number(selection.text_range?.end)
        : null

  const selectedTextRaw = String(selection.selected_text ?? "").trim()
  if ((start == null || end == null || end <= start) && selectedTextRaw) {
    const idx = text.indexOf(selectedTextRaw)
    if (idx >= 0) {
      start = idx
      end = idx + selectedTextRaw.length
    } else {
      const soft = normalizeWs(selectedTextRaw)
      const softSource = normalizeWs(text)
      const softIdx = softSource.indexOf(soft)
      if (softIdx >= 0) {
        const firstWord = selectedTextRaw.split(/\s+/).filter(Boolean)[0] ?? ""
        const approx = firstWord ? text.indexOf(firstWord) : -1
        if (approx >= 0) {
          start = approx
          end = Math.min(text.length, approx + selectedTextRaw.length + 8)
        }
      }
    }
  }

  if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end)) return null
  start = Math.max(0, Math.min(text.length, Math.floor(start)))
  end = Math.max(start, Math.min(text.length, Math.floor(end)))
  if (end <= start) return null

  // Exact user selection only — never expand heading → section.
  return {
    start,
    end,
    selectedText: text.slice(start, end),
    expanded: false,
    mode: "text",
  }
}

/**
 * Resolve the user's exact selection inside HTML (not heading-section expansion).
 * Prefers content_text offsets when the flat HTML plain matches content_text.
 */
export function resolveHtmlExactSelection(
  html: string,
  selection: ArtifactSelectionLike | null | undefined,
  contentText?: string | null,
): ResolvedHtmlSelection | null {
  const source = String(html ?? "")
  if (!source.trim() || !selection) return null

  const { plain, plainToHtml } = buildHtmlFlatIndexMap(source)
  if (!plain || plainToHtml.length === 0) return null

  const selectedTextRaw = String(selection.selected_text ?? "")
  let start: number | null = null
  let end: number | null = null

  const content = String(contentText ?? "")
  const textResolved = content ? resolveTextSelection(content, selection) : null

  if (textResolved && content && plain === content) {
    start = textResolved.start
    end = textResolved.end
    // If the client sent selected_text, require it to match the offset slice.
    if (selectedTextRaw) {
      const slice = plain.slice(start, end)
      if (slice !== selectedTextRaw && normalizeWs(slice) !== normalizeWs(selectedTextRaw)) {
        start = null
        end = null
      }
    }
  } else if (selectedTextRaw) {
    const exactIdx = plain.indexOf(selectedTextRaw)
    if (exactIdx >= 0) {
      start = exactIdx
      end = exactIdx + selectedTextRaw.length
    } else {
      const softPlain = normalizeWs(plain)
      const softNeedle = normalizeWs(selectedTextRaw)
      const softIdx = softPlain.indexOf(softNeedle)
      if (softIdx >= 0) {
        // Map soft index back approximately via first/last words.
        const firstWord = selectedTextRaw.trim().split(/\s+/).filter(Boolean)[0] ?? ""
        const lastWord =
          selectedTextRaw.trim().split(/\s+/).filter(Boolean).slice(-1)[0] ?? ""
        const approxStart = firstWord ? plain.indexOf(firstWord) : -1
        const approxEnd = lastWord ? plain.lastIndexOf(lastWord) : -1
        if (approxStart >= 0 && approxEnd >= approxStart) {
          start = approxStart
          end = approxEnd + lastWord.length
        }
      }
    }
  } else if (textResolved) {
    // Offsets from content_text may still align if prefixes match.
    const slice = content.slice(textResolved.start, textResolved.end)
    const idx = plain.indexOf(slice)
    if (idx >= 0) {
      start = idx
      end = idx + slice.length
    }
  }

  if (start == null || end == null || end <= start) return null
  start = Math.max(0, Math.min(plain.length, start))
  end = Math.max(start, Math.min(plain.length, end))
  if (end <= start) return null

  const htmlStart = plainToHtml[start]
  const lastPlain = Math.min(end, plainToHtml.length) - 1
  if (htmlStart == null || lastPlain < start) return null
  const htmlEndExclusive = plainToHtml[lastPlain]! + 1

  // Extend htmlEnd through any trailing entity that started at lastPlain.
  let htmlEnd = htmlEndExclusive
  if (source[plainToHtml[lastPlain]!] === "&") {
    const semi = source.indexOf(";", plainToHtml[lastPlain]!)
    if (semi >= 0) htmlEnd = Math.max(htmlEnd, semi + 1)
  }

  const selectedHtml = source.slice(htmlStart, htmlEnd)
  return {
    start: htmlStart,
    end: htmlEnd,
    selectedHtml,
    selectedText: plain.slice(start, end),
    expanded: false,
    mode: "html",
    level: null,
  }
}

/** @deprecated Use resolveHtmlExactSelection — kept as alias for older imports/tests. */
export function resolveHtmlSectionSelection(
  html: string,
  selection: ArtifactSelectionLike | null | undefined,
  contentText?: string | null,
): ResolvedHtmlSelection | null {
  return resolveHtmlExactSelection(html, selection, contentText)
}

export function applyHtmlSectionReplacement(
  html: string,
  resolved: ResolvedHtmlSelection,
  replacementHtml: string,
): string {
  const safeReplacement = String(replacementHtml ?? "").trim()
  return `${html.slice(0, resolved.start)}${safeReplacement}${html.slice(resolved.end)}`
}

export function applyTextRangeReplacement(
  contentText: string,
  resolved: ResolvedTextSelection,
  replacementText: string,
): string {
  return `${contentText.slice(0, resolved.start)}${replacementText}${contentText.slice(resolved.end)}`
}

/**
 * Convert model replacement markdown to an HTML fragment.
 * Single-paragraph replacements stay as one <p>; if the original selection was
 * clearly mid-flow prose without block markers, unwrap a lone <p>.
 */
export function simpleMarkdownToHtml(markdown: string): string {
  const raw = String(markdown ?? "").replace(/\r\n/g, "\n").trim()
  if (!raw) return ""
  if (/<\/?[a-z][\s\S]*>/i.test(raw)) return raw

  const lines = raw.split("\n")
  const parts: string[] = []
  let paragraph: string[] = []
  let listType: "ul" | "ol" | null = null
  let listItems: string[] = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    const text = inlineFormat(paragraph.join(" ").trim())
    if (text) parts.push(`<p>${text}</p>`)
    paragraph = []
  }
  const flushList = () => {
    if (!listType || listItems.length === 0) {
      listType = null
      listItems = []
      return
    }
    parts.push(
      `<${listType}>${listItems.map((item) => `<li>${inlineFormat(item)}</li>`).join("")}</${listType}>`,
    )
    listType = null
    listItems = []
  }

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim())
    if (heading) {
      flushParagraph()
      flushList()
      const level = Math.min(6, heading[1]!.length)
      parts.push(`<h${level}>${inlineFormat(heading[2]!.trim())}</h${level}>`)
      continue
    }
    const ul = /^\s*[-*+]\s+(.+)$/.exec(line)
    if (ul) {
      flushParagraph()
      if (listType && listType !== "ul") flushList()
      listType = "ul"
      listItems.push(ul[1]!.trim())
      continue
    }
    const ol = /^\s*\d+\.\s+(.+)$/.exec(line)
    if (ol) {
      flushParagraph()
      if (listType && listType !== "ol") flushList()
      listType = "ol"
      listItems.push(ol[1]!.trim())
      continue
    }
    if (!line.trim()) {
      flushParagraph()
      flushList()
      continue
    }
    flushList()
    paragraph.push(line.trim())
  }
  flushParagraph()
  flushList()
  return parts.join("") || `<p>${inlineFormat(raw)}</p>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function inlineFormat(value: string): string {
  let out = escapeHtml(value)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>")
  return out
}

/** Prefer inline fragment when replacing inside an existing paragraph. */
export function replacementHtmlForSelection(
  replacementMarkdown: string,
  selectedHtml: string,
): string {
  const generated = simpleMarkdownToHtml(replacementMarkdown)
  if (!generated) return ""

  const selected = String(selectedHtml ?? "")
  const selectedIsBlock =
    /<(p|h[1-6]|ul|ol|li|blockquote|table|div)\b/i.test(selected)
  const loneParagraph = /^<p>([\s\S]*)<\/p>$/i.exec(generated.trim())

  // Selection was inline prose inside a larger block — unwrap lone <p>.
  if (!selectedIsBlock && loneParagraph) {
    return loneParagraph[1] ?? generated
  }
  return generated
}

export function ensureRichTextBlocksHaveHtml(
  contentJson: unknown,
  contentText: string,
): { version: number; blocks: Array<Record<string, unknown>> } {
  const base =
    contentJson && typeof contentJson === "object"
      ? (contentJson as Record<string, unknown>)
      : {}
  const blocks = Array.isArray(base.blocks) ? [...(base.blocks as Array<Record<string, unknown>>)] : []

  if (blocks.length === 0) {
    const html = simpleMarkdownToHtml(contentText)
    return {
      version: Number(base.version) || 1,
      blocks: [{ id: "body", type: "rich_text", text: htmlToFlatContentText(html) || contentText, html }],
    }
  }

  const nextBlocks = blocks.map((block, index) => {
    const type = String(block.type ?? "")
    const html = typeof block.html === "string" ? block.html.trim() : ""
    if (html) {
      const normalizedHtml = normalizeMixedMarkdownInHtml(html)
      return normalizedHtml === html ? block : { ...block, html: normalizedHtml }
    }
    if (type === "heading") {
      const level = Math.min(Math.max(Number(block.level) || 2, 1), 6)
      const text = String(block.text ?? "").trim()
      return {
        ...block,
        html: text ? `<h${level}>${escapeHtml(text)}</h${level}>` : "",
      }
    }
    if (type === "list" && Array.isArray(block.items)) {
      const ordered = block.listStyle === "ordered"
      const tag = ordered ? "ol" : "ul"
      const items = block.items
        .map((item) => {
          const text = typeof item === "string" ? item : String((item as { text?: string })?.text ?? "")
          return `<li>${escapeHtml(text)}</li>`
        })
        .join("")
      return { ...block, html: `<${tag}>${items}</${tag}>` }
    }
    const text = String(block.text ?? "").trim()
    if (!text) return block
    if (blocks.length === 1 && contentText.trim()) {
      const generated = simpleMarkdownToHtml(contentText)
      return {
        ...block,
        id: block.id ?? `body-${index + 1}`,
        type: "rich_text",
        text: htmlToFlatContentText(generated) || text,
        html: generated,
      }
    }
    return {
      ...block,
      html: simpleMarkdownToHtml(text),
    }
  })

  return {
    version: Number(base.version) || 1,
    blocks: nextBlocks,
  }
}

export function buildPatchedArtifactContent(args: {
  contentText: string
  contentJson: unknown
  selection: ArtifactSelectionLike | null | undefined
  replacementMarkdown: string
}): {
  contentText: string
  contentJson: { version: number; blocks: Array<Record<string, unknown>> }
  changeMeta: {
    expanded: boolean
    mode: "html" | "text"
    selectedText: string
  }
} | null {
  const html = extractPrimaryArtifactHtml(args.contentJson)
  const replacementMarkdown = String(args.replacementMarkdown ?? "")
  if (!replacementMarkdown.trim()) return null

  if (html) {
    const htmlResolved = resolveHtmlExactSelection(html, args.selection, args.contentText)
    if (htmlResolved) {
      const replacementHtml = replacementHtmlForSelection(
        replacementMarkdown,
        htmlResolved.selectedHtml,
      )
      const nextHtml = applyHtmlSectionReplacement(html, htmlResolved, replacementHtml)
      const nextText = htmlToFlatContentText(nextHtml)
      const existingBlocks =
        args.contentJson && typeof args.contentJson === "object"
          && Array.isArray((args.contentJson as { blocks?: unknown }).blocks)
          ? (args.contentJson as { blocks: Array<Record<string, unknown>> }).blocks
          : [{ id: "body", type: "rich_text" }]
      const version =
        args.contentJson && typeof args.contentJson === "object"
          ? Number((args.contentJson as { version?: unknown }).version) || 1
          : 1

      // Preserve multi-block shapes when possible; most articles are one rich_text body.
      let nextBlocks: Array<Record<string, unknown>>
      if (existingBlocks.length === 1) {
        nextBlocks = [{
          ...existingBlocks[0],
          type: "rich_text",
          text: nextText,
          html: nextHtml,
        }]
      } else {
        nextBlocks = [{ id: "body", type: "rich_text", text: nextText, html: nextHtml }]
      }

      return {
        contentText: nextText,
        contentJson: { version, blocks: nextBlocks },
        changeMeta: {
          expanded: false,
          mode: "html",
          selectedText: htmlResolved.selectedText.slice(0, 500),
        },
      }
    }
    // HTML exists but selection could not be mapped — do NOT regenerate the
    // whole document from flat text (that destroys headings/bold). Fail closed.
    return null
  }

  const textResolved = resolveTextSelection(args.contentText, args.selection)
  if (!textResolved) return null
  const nextText = applyTextRangeReplacement(
    args.contentText,
    textResolved,
    replacementMarkdown,
  )
  return {
    contentText: nextText,
    contentJson: ensureRichTextBlocksHaveHtml(args.contentJson, nextText),
    changeMeta: {
      expanded: false,
      mode: "text",
      selectedText: textResolved.selectedText.slice(0, 500),
    },
  }
}

/** Model-authored surgical edit. We never invent the range — only apply what is specified. */
export type ArtifactModelPatch = {
  /** Exact HTML substring to replace (preferred). */
  old_html?: string | null
  /** Exact plain substring to replace when old_html is omitted (mapped via HTML flat text). */
  old_text?: string | null
  /** Replacement HTML (or plain text that will be lightly wrapped). Empty string deletes. */
  new_html?: string | null
  new_text?: string | null
  /** 0-based match index when old_html/old_text appears more than once. */
  occurrence?: number | null
  /** Inclusive-exclusive offsets into the same plain string derived from current HTML. */
  plain_start?: number | null
  plain_end?: number | null
  /** Must equal plain.slice(plain_start, plain_end) or the patch is rejected. */
  expected_text?: string | null
  /** Remove a media figure by attachment id (model-specified). */
  remove_attachment_id?: string | null
}

export type ApplyArtifactPatchesResult =
  | {
      ok: true
      contentText: string
      contentJson: { version: number; blocks: Array<Record<string, unknown>> }
      applied: number
      plain: string
      /** Rich HTML snippets for chat preview (includes nearest heading when useful). */
      previewBeforeHtml: string | null
      previewAfterHtml: string | null
    }
  | {
      ok: false
      error: string
      data?: Record<string, unknown>
    }

function nthIndexOf(haystack: string, needle: string, occurrence: number): number {
  if (!needle) return -1
  let from = 0
  for (let i = 0; i <= occurrence; i++) {
    const at = haystack.indexOf(needle, from)
    if (at < 0) return -1
    if (i === occurrence) return at
    from = at + Math.max(1, needle.length)
  }
  return -1
}

function replacementFromPatch(patch: ArtifactModelPatch): string {
  if (typeof patch.new_html === "string") return patch.new_html
  if (typeof patch.new_text === "string") {
    const raw = patch.new_text
    if (!raw) return ""
    if (/<\/?[a-z][\s\S]*>/i.test(raw)) return raw
    return simpleMarkdownToHtml(raw)
  }
  return ""
}

function contentJsonFromHtml(
  previousContentJson: unknown,
  nextHtml: string,
): { version: number; blocks: Array<Record<string, unknown>> } {
  const scrubbed = scrubPersistedArtifactHtml(normalizeMixedMarkdownInHtml(nextHtml))
  const nextText = htmlToFlatContentText(scrubbed)
  const base =
    previousContentJson && typeof previousContentJson === "object"
      ? (previousContentJson as Record<string, unknown>)
      : {}
  const existingBlocks = Array.isArray(base.blocks)
    ? (base.blocks as Array<Record<string, unknown>>)
    : []
  const version = Number(base.version) || 1
  if (existingBlocks.length === 1) {
    return {
      version,
      blocks: [{
        ...existingBlocks[0],
        type: "rich_text",
        text: nextText,
        html: scrubbed,
      }],
    }
  }
  return {
    version,
    blocks: [{ id: "body", type: "rich_text", text: nextText, html: scrubbed }],
  }
}

/** Nearest heading immediately before `at`, for rich preview cards. */
function precedingHeadingHtml(html: string, at: number): string {
  const before = html.slice(0, Math.max(0, at))
  const matches = [...before.matchAll(/<h([1-4])\b[^>]*>[\s\S]*?<\/h\1>/gi)]
  return matches[matches.length - 1]?.[0] ?? ""
}

function withOptionalHeading(heading: string, body: string): string {
  const trimmed = String(body ?? "")
  if (!heading) return trimmed
  if (/^<h[1-4]\b/i.test(trimmed.trim())) return trimmed
  return `${heading}${trimmed}`
}

/**
 * Apply model-specified patches to the current artifact HTML.
 * Ranges / old strings come only from the model — no heading/intent heuristics.
 */
export function applyArtifactPatches(args: {
  contentJson: unknown
  contentText?: string | null
  patches: ArtifactModelPatch[]
}): ApplyArtifactPatchesResult {
  const patches = Array.isArray(args.patches) ? args.patches : []
  if (patches.length === 0) {
    return { ok: false, error: "patches_required", data: { hint: "Pass at least one patch." } }
  }

  const initialHtml = extractPrimaryArtifactHtml(args.contentJson)
  if (!initialHtml?.trim()) {
    return {
      ok: false,
      error: "artifact_html_required",
      data: { hint: "Patches require content_json.blocks[].html." },
    }
  }

  type ResolvedOp = { htmlStart: number; htmlEnd: number; replacement: string; label: string }
  const ops: ResolvedOp[] = []

  for (let index = 0; index < patches.length; index++) {
    const patch = patches[index] ?? {}
    const occurrence = Math.max(0, Math.floor(Number(patch.occurrence ?? 0) || 0))
    const removeId = String(patch.remove_attachment_id ?? "").trim()

    if (removeId) {
      const re = new RegExp(
        `<figure\\b[^>]*data-attachment-id=["']${removeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>[\\s\\S]*?<\\/figure>`,
        "i",
      )
      const match = re.exec(initialHtml)
      if (!match || match.index == null) {
        return {
          ok: false,
          error: "attachment_not_found",
          data: { index, attachment_id: removeId },
        }
      }
      ops.push({
        htmlStart: match.index,
        htmlEnd: match.index + match[0].length,
        replacement: "",
        label: `remove_attachment:${removeId}`,
      })
      continue
    }

    const oldHtml = typeof patch.old_html === "string" ? patch.old_html : ""
    if (oldHtml) {
      const at = nthIndexOf(initialHtml, oldHtml, occurrence)
      if (at < 0) {
        return {
          ok: false,
          error: "old_html_not_found",
          data: {
            index,
            occurrence,
            old_html_preview: oldHtml.slice(0, 160),
            hint: "old_html must be an exact substring of the current artifact HTML.",
          },
        }
      }
      ops.push({
        htmlStart: at,
        htmlEnd: at + oldHtml.length,
        replacement: replacementFromPatch(patch),
        label: `old_html#${occurrence}`,
      })
      continue
    }

    const { plain, plainToHtml } = buildHtmlFlatIndexMap(initialHtml)
    const plainStart = Number(patch.plain_start)
    const plainEnd = Number(patch.plain_end)
    const hasRange =
      Number.isFinite(plainStart)
      && Number.isFinite(plainEnd)
      && plainEnd > plainStart

    if (hasRange) {
      const start = Math.max(0, Math.floor(plainStart))
      const end = Math.min(plain.length, Math.floor(plainEnd))
      if (end <= start || start >= plainToHtml.length) {
        return {
          ok: false,
          error: "plain_range_invalid",
          data: { index, plain_start: plainStart, plain_end: plainEnd, plain_length: plain.length },
        }
      }
      const slice = plain.slice(start, end)
      const expected = typeof patch.expected_text === "string" ? patch.expected_text : null
      if (expected == null) {
        return {
          ok: false,
          error: "expected_text_required",
          data: {
            index,
            hint: "plain_start/plain_end patches must include expected_text equal to plain.slice(start, end).",
          },
        }
      }
      if (slice !== expected) {
        return {
          ok: false,
          error: "expected_text_mismatch",
          data: {
            index,
            plain_start: start,
            plain_end: end,
            expected_preview: expected.slice(0, 160),
            actual_preview: slice.slice(0, 160),
            hint: "Offsets must refer to the plain text derived from the current HTML in the prompt.",
          },
        }
      }
      const htmlStart = plainToHtml[start]
      const lastPlain = Math.min(end, plainToHtml.length) - 1
      if (htmlStart == null || lastPlain < start) {
        return { ok: false, error: "plain_range_unmapped", data: { index } }
      }
      let htmlEnd = plainToHtml[lastPlain]! + 1
      if (initialHtml[plainToHtml[lastPlain]!] === "&") {
        const semi = initialHtml.indexOf(";", plainToHtml[lastPlain]!)
        if (semi >= 0) htmlEnd = Math.max(htmlEnd, semi + 1)
      }
      ops.push({
        htmlStart,
        htmlEnd,
        replacement: replacementFromPatch(patch),
        label: `plain_range:${start}-${end}`,
      })
      continue
    }

    const oldText = typeof patch.old_text === "string" ? patch.old_text : ""
    if (oldText) {
      const atPlain = nthIndexOf(plain, oldText, occurrence)
      if (atPlain < 0) {
        return {
          ok: false,
          error: "old_text_not_found",
          data: {
            index,
            occurrence,
            old_text_preview: oldText.slice(0, 160),
            hint: "old_text must be an exact substring of the HTML-derived plain text.",
          },
        }
      }
      const endPlain = atPlain + oldText.length
      const htmlStart = plainToHtml[atPlain]
      const lastPlain = Math.min(endPlain, plainToHtml.length) - 1
      if (htmlStart == null || lastPlain < atPlain) {
        return { ok: false, error: "old_text_unmapped", data: { index } }
      }
      let htmlEnd = plainToHtml[lastPlain]! + 1
      if (initialHtml[plainToHtml[lastPlain]!] === "&") {
        const semi = initialHtml.indexOf(";", plainToHtml[lastPlain]!)
        if (semi >= 0) htmlEnd = Math.max(htmlEnd, semi + 1)
      }
      ops.push({
        htmlStart,
        htmlEnd,
        replacement: replacementFromPatch(patch),
        label: `old_text#${occurrence}`,
      })
      continue
    }

    return {
      ok: false,
      error: "patch_target_required",
      data: {
        index,
        hint: "Each patch needs old_html, old_text, plain_start/plain_end+expected_text, or remove_attachment_id.",
      },
    }
  }

  // Detect overlapping HTML ranges before mutating.
  const sortedAsc = [...ops].sort((a, b) => a.htmlStart - b.htmlStart || a.htmlEnd - b.htmlEnd)
  for (let i = 1; i < sortedAsc.length; i++) {
    const prev = sortedAsc[i - 1]!
    const cur = sortedAsc[i]!
    if (cur.htmlStart < prev.htmlEnd) {
      return {
        ok: false,
        error: "overlapping_patches",
        data: { left: prev.label, right: cur.label },
      }
    }
  }

  let nextHtml = initialHtml
  const sortedDesc = [...ops].sort((a, b) => b.htmlStart - a.htmlStart || b.htmlEnd - a.htmlEnd)
  for (const op of sortedDesc) {
    nextHtml = `${nextHtml.slice(0, op.htmlStart)}${op.replacement}${nextHtml.slice(op.htmlEnd)}`
  }

  const previewBeforeParts: string[] = []
  const previewAfterParts: string[] = []
  for (const op of sortedAsc) {
    const heading = precedingHeadingHtml(initialHtml, op.htmlStart)
    const beforeBody = initialHtml.slice(op.htmlStart, op.htmlEnd)
    previewBeforeParts.push(withOptionalHeading(heading, beforeBody))
    previewAfterParts.push(withOptionalHeading(heading, op.replacement))
  }

  const contentJson = contentJsonFromHtml(args.contentJson, nextHtml)
  const contentText = htmlToFlatContentText(extractPrimaryArtifactHtml(contentJson) ?? nextHtml)
  const { plain } = buildHtmlFlatIndexMap(extractPrimaryArtifactHtml(contentJson) ?? nextHtml)

  return {
    ok: true,
    contentText,
    contentJson,
    applied: ops.length,
    plain,
    previewBeforeHtml: previewBeforeParts.join("\n").trim() || null,
    previewAfterHtml: previewAfterParts.join("\n").trim() || null,
  }
}

