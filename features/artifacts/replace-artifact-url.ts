import type { ArtifactContentJson } from "../../app/lib/artifacts/artifact-types"

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function urlVariants(url: string): string[] {
  const trimmed = url.trim()
  if (!trimmed) return []
  return Array.from(
    new Set([
      trimmed,
      trimmed.replace(/^https?:\/\//i, ""),
      trimmed.replace(/\/$/, ""),
      trimmed.replace(/^https?:\/\//i, "").replace(/\/$/, ""),
    ].filter(Boolean)),
  ).sort((a, b) => b.length - a.length)
}

/**
 * Replace all occurrences of `fromUrl` with `toUrl` in artifact text/json.
 */
export function replaceArtifactUrl(args: {
  fromUrl: string
  toUrl: string
  contentText: string | null | undefined
  contentJson: ArtifactContentJson | null | undefined
}): { contentText: string | null; contentJson: ArtifactContentJson | null; replaced: number } {
  const from = args.fromUrl.trim()
  const to = args.toUrl.trim()
  if (!from || !to || from === to) {
    return {
      contentText: args.contentText ?? null,
      contentJson: args.contentJson ?? null,
      replaced: 0,
    }
  }

  const ordered = urlVariants(from)
  let replaced = 0

  const replaceOnce = (value: string): string => {
    let next = value
    for (const variant of ordered) {
      if (!variant || !next.includes(variant)) continue
      const regex = new RegExp(escapeRegExp(variant), "g")
      const matches = next.match(regex)
      if (!matches?.length) continue
      replaced += matches.length
      const target = variant.startsWith("http")
        ? to
        : to.replace(/^https?:\/\//i, "")
      next = next.replace(regex, target)
    }
    return next
  }

  const contentText =
    typeof args.contentText === "string" ? replaceOnce(args.contentText) : null

  let contentJson = args.contentJson ?? null
  if (contentJson && Array.isArray(contentJson.blocks)) {
    contentJson = {
      ...contentJson,
      blocks: contentJson.blocks.map((block) => {
        const next = { ...block }
        if (typeof next.html === "string") next.html = replaceOnce(next.html)
        if (typeof next.text === "string") next.text = replaceOnce(next.text)
        return next
      }),
    }
  }

  return { contentText, contentJson, replaced }
}

/**
 * Remove all occurrences of `url` from artifact text/json.
 * Unwraps matching HTML anchors to keep visible anchor text when present.
 */
export function removeArtifactUrl(args: {
  url: string
  contentText: string | null | undefined
  contentJson: ArtifactContentJson | null | undefined
}): { contentText: string | null; contentJson: ArtifactContentJson | null; removed: number } {
  const target = args.url.trim()
  if (!target) {
    return {
      contentText: args.contentText ?? null,
      contentJson: args.contentJson ?? null,
      removed: 0,
    }
  }

  const ordered = urlVariants(target)
  let removed = 0

  const removeOnce = (value: string): string => {
    let next = value
    for (const variant of ordered) {
      if (!variant) continue
      const escaped = escapeRegExp(variant)
      // Unwrap <a href="…variant…">label</a> → label
      const anchorRegex = new RegExp(
        `<a\\b[^>]*href=["'][^"']*${escaped}[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>`,
        "gi",
      )
      next = next.replace(anchorRegex, (_match, label: string) => {
        removed += 1
        return label
      })
      // Strip remaining bare URL occurrences
      if (next.toLowerCase().includes(variant.toLowerCase())) {
        const bareRegex = new RegExp(escaped, "gi")
        const matches = next.match(bareRegex)
        if (matches?.length) {
          removed += matches.length
          next = next.replace(bareRegex, "")
        }
      }
    }
    return next.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n")
  }

  const contentText =
    typeof args.contentText === "string" ? removeOnce(args.contentText) : null

  let contentJson = args.contentJson ?? null
  if (contentJson && Array.isArray(contentJson.blocks)) {
    contentJson = {
      ...contentJson,
      blocks: contentJson.blocks.map((block) => {
        const next = { ...block }
        if (typeof next.html === "string") next.html = removeOnce(next.html)
        if (typeof next.text === "string") next.text = removeOnce(next.text)
        return next
      }),
    }
  }

  return { contentText, contentJson, removed }
}

export type LinkUsageSnippet = {
  id: string
  excerpt: string
}

/** Find short excerpts where a URL appears in artifact content. */
export function findArtifactLinkUsages(args: {
  url: string
  contentText: string | null | undefined
  contentJson: ArtifactContentJson | null | undefined
}): LinkUsageSnippet[] {
  const needles = urlVariants(args.url)
  const snippets: LinkUsageSnippet[] = []
  const seen = new Set<string>()

  const scan = (source: string, prefix: string) => {
    if (!source) return
    for (const needle of needles) {
      let from = 0
      while (from < source.length) {
        const idx = source.toLowerCase().indexOf(needle.toLowerCase(), from)
        if (idx < 0) break
        const start = Math.max(0, idx - 40)
        const end = Math.min(source.length, idx + needle.length + 40)
        let excerpt = source.slice(start, end).replace(/\s+/g, " ").trim()
        if (start > 0) excerpt = `…${excerpt}`
        if (end < source.length) excerpt = `${excerpt}…`
        const key = excerpt.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          snippets.push({ id: `${prefix}-${snippets.length}`, excerpt })
        }
        from = idx + needle.length
        if (snippets.length >= 12) return
      }
    }
  }

  if (typeof args.contentText === "string") scan(args.contentText, "text")
  const blocks = Array.isArray(args.contentJson?.blocks) ? args.contentJson!.blocks! : []
  blocks.forEach((block, index) => {
    if (typeof block.html === "string") scan(block.html, `html-${index}`)
    if (typeof block.text === "string") scan(block.text, `block-${index}`)
  })
  return snippets
}
