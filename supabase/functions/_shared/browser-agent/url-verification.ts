/**
 * Hard rule: never invent, infer, or pattern-synthesize a specific resource URL.
 * Specific image/product/post/article URLs must come from a verifiable source
 * (search results, API, page DOM, browser navigation, or existing content).
 *
 * All heuristics here are domain-agnostic. Do not add hostname allowlists.
 */

const LISTING_PATH = /\/(search|photos|images|vectors|footage|collections|category|categories|galleries|results|browse|explore)\b/i
const SEARCH_PARAM_KEYS = new Set(["q", "k", "query", "phrase", "search", "s", "keyword", "keywords"])
const ID_LIKE_SEGMENT = /(?:^|[-_~])(?:gm)?(?:\d{5,}|[a-f0-9]{8,})(?:[-_/]|$)/i

export function looksLikeCollectionOrSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    for (const key of parsed.searchParams.keys()) {
      if (SEARCH_PARAM_KEYS.has(key.toLowerCase())) return true
    }
    const path = parsed.pathname
    if (!LISTING_PATH.test(path)) return false
    return !ID_LIKE_SEGMENT.test(path)
  } catch {
    return false
  }
}

export function looksLikeSpecificResourceUrl(url: string): boolean {
  if (looksLikeCollectionOrSearchUrl(url)) return false
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "")
    if (!path || path === "/") return false
    const segments = path.split("/").filter(Boolean)
    if (segments.length === 0) return false
    if (ID_LIKE_SEGMENT.test(path)) return true
    return segments.length >= 2
  } catch {
    return false
  }
}

export function hrefsFromUnknown(value: unknown): string[] {
  if (!value) return []
  if (typeof value === "string") {
    return /^https?:\/\//i.test(value.trim()) ? [value.trim()] : []
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => hrefsFromUnknown(item))
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    return [
      ...hrefsFromUnknown(record.href),
      ...hrefsFromUnknown(record.url),
      ...hrefsFromUnknown(record.canonical_url),
      ...hrefsFromUnknown(record.links),
    ]
  }
  return []
}

export function isVerifiedPageHref(href: string, pageHrefs: Iterable<string>): boolean {
  const target = href.trim()
  if (!target) return false
  const allowed = new Set<string>()
  for (const item of pageHrefs) {
    const value = String(item ?? "").trim()
    if (value) allowed.add(value)
  }
  if (allowed.has(target)) return true
  try {
    const normalized = new URL(target).href
    for (const item of allowed) {
      try {
        if (new URL(item).href === normalized) return true
      } catch {
        // ignore
      }
    }
  } catch {
    return false
  }
  return false
}

export function recommendBrowserFallback(input: {
  url?: string | null
  text?: string | null
  links?: Array<string | { href?: string | null }> | null
}): boolean {
  const url = String(input.url ?? "").trim()
  const text = String(input.text ?? "").replace(/\s+/g, " ").trim()
  const hrefs = (input.links ?? [])
    .map((item) => (typeof item === "string" ? item : String(item?.href ?? "").trim()))
    .filter(Boolean)
  const specific = hrefs.filter((href) => looksLikeSpecificResourceUrl(href))
  const isListing = looksLikeCollectionOrSearchUrl(url)
  if (isListing && specific.length < 3) return true
  if (isListing && hrefs.length > 0 && hrefs.every((href) => looksLikeCollectionOrSearchUrl(href))) {
    return true
  }
  if (isListing && text.length < 400 && hrefs.length < 5) return true
  return false
}

export function filterVerifiedResourceUrls(
  candidates: Array<string | { href?: string | null; text?: string | null }>,
  pageHrefs: Iterable<string>,
): Array<{ text: string; href: string; verified: true }> {
  const out: Array<{ text: string; href: string; verified: true }> = []
  const seen = new Set<string>()
  for (const item of candidates) {
    const href = typeof item === "string" ? item.trim() : String(item.href ?? "").trim()
    const text = typeof item === "string" ? "" : String(item.text ?? "").trim()
    if (!href || seen.has(href) || !isVerifiedPageHref(href, pageHrefs)) continue
    seen.add(href)
    out.push({ text, href, verified: true })
  }
  return out
}
