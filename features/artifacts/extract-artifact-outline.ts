import type { ArtifactBlock, ArtifactContentJson } from "../../app/lib/artifacts/artifact-types"
import { extractArtifactBlocks } from "../../app/lib/artifacts/artifact-types"

export type ArtifactOutlineHeading = {
  level: 1 | 2 | 3 | 4
  text: string
  /** Stable key for list rendering / scroll targets. */
  id: string
}

function clampHeadingLevel(value: number): 1 | 2 | 3 | 4 {
  if (value <= 1) return 1
  if (value === 2) return 2
  if (value === 3) return 3
  return 4
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function pushHeading(
  out: ArtifactOutlineHeading[],
  level: number,
  text: string,
) {
  const cleaned = stripTags(text)
  if (!cleaned) return
  const headingLevel = clampHeadingLevel(level)
  out.push({
    level: headingLevel,
    text: cleaned,
    id: `h${headingLevel}-${out.length}-${cleaned.slice(0, 32)}`,
  })
}

function extractHeadingsFromHtml(html: string, out: ArtifactOutlineHeading[]) {
  if (!html.trim() || typeof DOMParser === "undefined") return
  const doc = new DOMParser().parseFromString(html, "text/html")
  doc.body.querySelectorAll("h1, h2, h3, h4").forEach((node) => {
    const tag = node.tagName.toUpperCase()
    const level = Number(tag.slice(1))
    pushHeading(out, level, node.textContent ?? "")
  })
}

function extractHeadingsFromMarkdown(text: string, out: ArtifactOutlineHeading[]) {
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^(#{1,4})\s+(.+?)\s*$/)
    if (!match) continue
    pushHeading(out, match[1].length, match[2])
  }
}

function extractHeadingsFromBlock(block: ArtifactBlock, out: ArtifactOutlineHeading[]) {
  const type = String(block.type ?? "")
  if (type === "heading") {
    const level = Number(block.level) || 2
    const text =
      typeof block.text === "string"
        ? block.text
        : typeof block.html === "string"
          ? stripTags(block.html)
          : ""
    pushHeading(out, level, text)
    return
  }
  if (typeof block.html === "string" && block.html.trim()) {
    extractHeadingsFromHtml(block.html, out)
    return
  }
  if (typeof block.text === "string" && block.text.trim()) {
    extractHeadingsFromMarkdown(block.text, out)
  }
}

/**
 * Build a lightweight H1–H4 outline from artifact content_json / content_text.
 */
export function extractArtifactOutline(args: {
  contentJson?: ArtifactContentJson | null
  contentText?: string | null
}): ArtifactOutlineHeading[] {
  const out: ArtifactOutlineHeading[] = []
  const blocks = extractArtifactBlocks(args.contentJson)
  if (blocks.length > 0) {
    for (const block of blocks) extractHeadingsFromBlock(block, out)
  }
  if (out.length === 0 && typeof args.contentText === "string" && args.contentText.trim()) {
    const text = args.contentText
    if (/<[hH][1-4][\s>]/.test(text)) {
      extractHeadingsFromHtml(text, out)
    } else {
      extractHeadingsFromMarkdown(text, out)
    }
  }
  return out
}
