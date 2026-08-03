/**
 * Client-safe AI Overview text cleanup (no Node Buffer deps).
 */

export function stripMarkdownNoise(value: string): string {
  let text = value

  // Footnote-style citations: [[1]](url) or [1](url)
  text = text.replace(/\[\[\d+\]\]\([^)]+\)/g, "")
  text = text.replace(/\[\d+\]\([^)]+\)/g, "")

  // Images and standard markdown links — keep label, drop URL
  text = text.replace(/!\[[^\]]*]\([^)]+\)/g, "")
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")

  // Bare URLs stuck to words (…ordenado.https://…)
  text = text.replace(/(https?:\/\/[^\s)\]]+)/gi, " ")
  text = text.replace(/www\.[^\s)\]]+/gi, " ")

  // Headings / emphasis / leftover citation brackets
  text = text.replace(/^#{1,6}\s+/gm, "")
  text = text.replace(/[*_`~]+/g, "")
  text = text.replace(/\[\d+\]/g, "")

  // Prefer sentence breaks over giant run-ons (after punctuation only;
  // do not split CamelCase brand names like ActivoBank).
  text = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{2,}/g, "\n\n")
    .replace(/([.!?…])([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/g, "$1 $2")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim()

  return text
}

export function truncateAiOverviewText(value: string, max = 600): string {
  const trimmed = value.replace(/\s+/g, " ").trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trim()}…`
}
