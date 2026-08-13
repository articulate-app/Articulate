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

      return `${bold}: ${items.join(", ")}`
    },
  )
}

/** Apply all chat-prose markdown softeners before marked/HTML render. */
export function softenAssistantMarkdownProse(markdown: string): string {
  let out = String(markdown ?? "")
  out = collapseNewlinesInsideQuotes(out)
  out = flattenMultilineBoldSpans(out)
  out = flattenInlineStructureListsAfterBold(out)
  return out
}
