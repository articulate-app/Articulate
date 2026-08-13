/**
 * Normalize text/keywords so hyphenated and spaced variants match
 * (e.g. "water-resistant materials" ↔ "water resistant materials").
 */
export function normalizeKeywordMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Match whole words/phrases even when surrounded by punctuation
 * (e.g. "coloproctologia.", "«keyword»", "(keyword)").
 * Uses Unicode letter/number boundaries so accents still count as word chars.
 */
function buildKeywordPhraseRegex(keywordNormalized: string): RegExp | null {
  const parts = keywordNormalized.split(" ").filter(Boolean)
  if (parts.length === 0) return null
  // Allow flexible whitespace between words after hyphen/space normalization.
  const pattern = parts.map(escapeRegExp).join("\\s+")
  return new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, "giu")
}

function countNormalizedKeywordOccurrences(text: string, keyword: string): number {
  const textNormalized = normalizeKeywordMatchText(text)
  const keywordNormalized = normalizeKeywordMatchText(keyword)
  if (!textNormalized || !keywordNormalized) return 0

  const regex = buildKeywordPhraseRegex(keywordNormalized)
  if (!regex) return 0

  const matches = textNormalized.match(regex)
  return matches ? matches.length : 0
}

/**
 * Calculate keyword density percentage in text
 */
export function calculateKeywordDensity(text: string, keyword: string): number {
  if (!text || !keyword) return 0

  const textNormalized = normalizeKeywordMatchText(text)
  if (!textNormalized) return 0

  const words = textNormalized.split(/\s+/).filter((w) => w.length > 0)
  const totalWords = words.length
  if (totalWords === 0) return 0

  const occurrences = countNormalizedKeywordOccurrences(text, keyword)
  return (occurrences / totalWords) * 100
}

/** Count keyword occurrences in plain text (hyphen/space insensitive). */
export function countKeywordOccurrences(text: string, keyword: string): number {
  if (!text || !keyword) return 0
  return countNormalizedKeywordOccurrences(text, keyword)
}

/**
 * Get color class for keyword density
 */
export function getDensityColor(density: number): { color: string; label: string } {
  if (density >= 3 && density <= 6) {
    return { color: "text-green-600", label: "OK" }
  } else if ((density >= 1 && density < 3) || (density > 6 && density <= 10)) {
    return { color: "text-yellow-600", label: "Warning" }
  } else {
    return { color: "text-red-600", label: "Critical" }
  }
}

/**
 * Check if density needs improvement (yellow or red)
 */
export function needsImprovement(density: number): boolean {
  return density < 3 || density > 6
}

/**
 * Extract plain text from HTML
 */
export function extractPlainText(html: string): string {
  if (!html) return ""

  // Remove HTML tags
  const text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Remove script tags
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "") // Remove style tags
    .replace(/<[^>]+>/g, " ") // Remove all HTML tags
    .replace(/&nbsp;/g, " ") // Replace &nbsp; with space
    .replace(/&[#\w]+;/g, " ") // Replace HTML entities
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim()

  return text
}
