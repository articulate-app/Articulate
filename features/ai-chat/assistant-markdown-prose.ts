/**
 * Soften common model markdown habits that break chat prose:
 * - newlines inside quoted names ("EN\\n\\nJuly 2026")
 * - **bold** spanning blank lines / list markers
 * - short bullet lists right after bold used as inline structure
 */

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

/** Keep quoted template/title names on one line. */
export function collapseNewlinesInsideQuotes(markdown: string): string {
  let out = String(markdown ?? "")
  // Straight double quotes
  out = out.replace(/"([^"\n]*(?:\n+[^"\n]*)+)"/g, (_m, inner: string) => `"${collapseWhitespace(inner)}"`)
  // Curly double quotes
  out = out.replace(/“([^”\n]*(?:\n+[^”\n]*)+)”/g, (_m, inner: string) => `“${collapseWhitespace(inner)}”`)
  return out
}

/**
 * Flatten **…** that spans newlines so marked can bold it, and strip list markers
 * the model nestled inside the emphasis (e.g. structure of a newsletter).
 */
export function flattenMultilineBoldSpans(markdown: string): string {
  return String(markdown ?? "").replace(/\*\*([\s\S]+?)\*\*/g, (_match, inner: string) => {
    if (!/\n/.test(inner)) return `**${inner}**`

    const hasList = /(^|\n)[ \t]*[-*+][ \t]+\S/.test(inner)
    const hasBlankLines = /\n\s*\n/.test(inner)
    let flat = inner.replace(/(^|\n)[ \t]*[-*+][ \t]+/g, "$1")

    if (hasList || hasBlankLines) {
      flat = flat
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join(", ")
    } else {
      flat = flat.replace(/\s*\n\s*/g, " ")
    }

    return `**${collapseWhitespace(flat)}**`
  })
}

/**
 * Models often write: **label**\\n- a\\n- b — rest of sentence
 * Convert that mid-prose structure into inline text so chat doesn't show a bullet.
 */
export function flattenInlineStructureListsAfterBold(markdown: string): string {
  return String(markdown ?? "").replace(
    /(\*\*[^*\n]+\*\*)\n((?:[ \t]*[-*+][ \t]+[^\n]+\n?)+)/g,
    (match, bold: string, listBlock: string) => {
      const items = listBlock
        .split("\n")
        .map((line) => line.replace(/^[ \t]*[-*+][ \t]+/, "").trim())
        .filter(Boolean)

      if (items.length < 1 || items.length > 6) return match

      // Keep real multi-paragraph lists (long early items) as lists.
      const earlyItems = items.slice(0, -1)
      if (earlyItems.some((item) => item.length > 90)) return match

      // Keyword / topic lists are real lists. Only flatten when the last item
      // continues the surrounding sentence (em dash, "mas", "and", …).
      const last = items[items.length - 1] ?? ""
      const continuesProse = /[—–]|,\s+(?:mas|and|but|e)\b/i.test(last)
      if (!continuesProse && items.length >= 3) return match

      return `${bold}: ${items.join(", ")}`
    },
  )
}

function isLetterChar(value: string): boolean {
  if (!value) return false
  const code = value.charCodeAt(0)
  return (
    (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
    || (code >= 192 && code <= 687)
  )
}

function isQuoteOpenerPrev(value: string): boolean {
  return isLetterChar(value) || value === "," || value === "." || value === ";" || value === ":"
}

/** Insert missing spaces around quotes glued to letters or punctuation. */
export function repairGluedQuoteSpacing(markdown: string): string {
  const source = String(markdown ?? "")
    .replace(/(\S)(“)/g, (match, prev: string) => (
      isLetterChar(prev) || /[,.;:]/.test(prev) ? `${prev} “` : match
    ))
    .replace(/(”)(\S)/g, (match, _quote: string, next: string) => (
      isLetterChar(next) ? `” ${next}` : match
    ))

  let out = ""
  let isOpen = false
  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index]
    if (ch !== '"') {
      out += ch
      continue
    }
    const prev = out[out.length - 1] ?? ""
    const next = source[index + 1] ?? ""
    if (!isOpen) {
      if (prev && isQuoteOpenerPrev(prev)) out += " "
      out += '"'
      isOpen = true
      continue
    }
    out += '"'
    if (isLetterChar(next)) out += " "
    isOpen = false
  }
  return out
}

/** Split packed list markers that the model (or HTML reparse) left on one line. */
export function splitPackedMarkdownLists(markdown: string): string {
  return String(markdown ?? "")
    .replace(/([^\n])[ \t]+([*+-][ \t]+\S+)/g, "$1\n$2")
    .replace(/([^\n])[ \t]+(\d+\.[ \t]+\S+)/g, "$1\n$2")
}

/** Apply all chat-prose markdown softeners before marked/HTML render. */
export function softenAssistantMarkdownProse(markdown: string): string {
  let out = String(markdown ?? "")
  out = collapseNewlinesInsideQuotes(out)
  out = flattenMultilineBoldSpans(out)
  out = flattenInlineStructureListsAfterBold(out)
  out = splitPackedMarkdownLists(out)
  out = repairGluedQuoteSpacing(out)
  return out
}
