import type { ArtifactContentJson } from "../../app/lib/artifacts/artifact-types"
import { extractPlainText } from "../tasks/utils/keyword-density"

/** Prefer structured HTML blocks, then content_text (HTML or plain). */
export function artifactHtmlSource(args: {
  contentText?: string | null
  contentJson?: ArtifactContentJson | null
}): string {
  const blocks = Array.isArray(args.contentJson?.blocks) ? args.contentJson!.blocks! : []
  if (blocks.length > 0) {
    const html = blocks
      .map((block) => {
        if (typeof block.html === "string" && block.html.trim()) return block.html
        if (typeof block.text === "string" && block.text.trim()) return block.text
        return ""
      })
      .filter(Boolean)
      .join("\n")
    if (html.trim()) return html
  }
  if (typeof args.contentText === "string" && args.contentText.trim()) {
    return args.contentText
  }
  return ""
}

/**
 * Plain text with each anchor's href appended so URL presence maps work even when
 * the visible label is not the URL itself.
 */
export function artifactPlainTextWithHrefs(args: {
  contentText?: string | null
  contentJson?: ArtifactContentJson | null
}): string {
  const html = artifactHtmlSource(args)
  if (!html.trim()) return artifactPlainText(args)
  if (typeof DOMParser === "undefined") {
    return extractPlainText(html)
  }
  const doc = new DOMParser().parseFromString(html, "text/html")
  for (const anchor of Array.from(doc.querySelectorAll("a[href]"))) {
    const href = String(anchor.getAttribute("href") ?? "").trim()
    if (!href) continue
    anchor.appendChild(doc.createTextNode(` ${href}`))
  }
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim()
}

/** Plain text used for word/char counts and keyword density. */
export function artifactPlainText(args: {
  contentText?: string | null
  contentJson?: ArtifactContentJson | null
}): string {
  if (typeof args.contentText === "string" && args.contentText.trim()) {
    return /</.test(args.contentText) ? extractPlainText(args.contentText) : args.contentText
  }
  const html = artifactHtmlSource(args)
  return html ? extractPlainText(html) : ""
}

export function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).filter(Boolean).length
}

export function formatWordCountLabel(count: number): string {
  return `${count.toLocaleString()} words`
}

export function formatCharCountLabel(count: number): string {
  if (count >= 10_000) return `${Math.round(count / 1000)}k chars`
  if (count >= 1000) {
    const value = (count / 1000).toFixed(1).replace(/\.0$/, "")
    return `${value}k chars`
  }
  return `${count.toLocaleString()} chars`
}

/** Density share of keyword occurrences vs total words (0–100). */
export function keywordUtilizationPct(occurrences: number, wordCount: number): number {
  if (wordCount <= 0 || occurrences <= 0) return 0
  return (occurrences / wordCount) * 100
}

/** Primary-keyword traffic light: ideal 3–6%. */
export function densityTone(pct: number): "ok" | "warn" | "bad" {
  if (pct >= 3 && pct <= 6) return "ok"
  if ((pct >= 1 && pct < 3) || (pct > 6 && pct <= 10)) return "warn"
  return "bad"
}

export function densityToneClass(tone: "ok" | "warn" | "bad"): string {
  if (tone === "ok") return "text-emerald-700"
  if (tone === "warn") return "text-amber-700"
  return "text-red-600"
}
