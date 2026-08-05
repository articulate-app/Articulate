export type ContentEntityType = "owned" | "competitor"

export type ContentSourceType =
  | "blog"
  | "news"
  | "insights"
  | "resources"
  | "media_centre"
  | "research"
  | "stories"
  | "knowledge"
  | "other"

export const EDITORIAL_PATH_HINTS = [
  "blog",
  "news",
  "noticias",
  "insights",
  "resources",
  "stories",
  "media-centre",
  "media-center",
  "knowledge",
  "articles",
  "press",
  "research",
  "reports",
] as const

export const ARTICLE_SCHEMA_TYPES = new Set([
  "article",
  "blogposting",
  "newsarticle",
  "reportagenewsarticle",
  "analysisnewsarticle",
  "techarticle",
  "scholarlyarticle",
])

export const NEGATIVE_PATH_HINTS = [
  "/product",
  "/products",
  "/service",
  "/services",
  "/pricing",
  "/careers",
  "/jobs",
  "/docs/",
  "/documentation",
  "/login",
  "/cart",
  "/tag/",
  "/category/",
  "/author/",
  "/page/",
  "/search",
] as const

export function normalizeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const url = new URL(withProtocol)
    if (!url.hostname.includes(".")) return null
    url.hash = ""
    ;["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"]
      .forEach((key) => url.searchParams.delete(key))
    const path = url.pathname.replace(/\/+$/, "") || ""
    return `${url.origin}${path}${url.search}`
  } catch {
    return null
  }
}

export function normalizeDomain(raw: string | null | undefined): string | null {
  const normalized = normalizeHttpUrl(raw)
  if (!normalized) return null
  try {
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, "") || null
  } catch {
    return null
  }
}

export function normalizeKeywordKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

export function inferSourceTypeFromUrl(url: string): ContentSourceType {
  const lower = url.toLowerCase()
  if (lower.includes("insight")) return "insights"
  if (lower.includes("resource")) return "resources"
  if (lower.includes("media-centre") || lower.includes("media-center") || lower.includes("press")) {
    return "media_centre"
  }
  if (lower.includes("research") || lower.includes("report")) return "research"
  if (lower.includes("stor")) return "stories"
  if (lower.includes("knowledge")) return "knowledge"
  if (lower.includes("news") || lower.includes("noticia") || lower.includes("actualit")) {
    return "news"
  }
  if (lower.includes("blog") || lower.includes("article")) return "blog"
  return "other"
}

export type DiscoverySignal = { code: string; weight: number; detail?: string }

export function scoreEditorialSourceCandidate(args: {
  sourceUrl: string
  samplePages?: Array<{
    url?: string | null
    title?: string | null
    schemaTypes?: string[] | null
    publishedAt?: string | null
    author?: string | null
    ogType?: string | null
    hasFeed?: boolean
    inSitemap?: boolean
  }>
  hasFeed?: boolean
  hasSitemap?: boolean
  aiConfidenceLow?: number
  aiConfidenceHigh?: number
}): {
  confidence: number
  signals: DiscoverySignal[]
  sourceType: ContentSourceType
  needsAi: boolean
} {
  const low = args.aiConfidenceLow ?? 0.35
  const high = args.aiConfidenceHigh ?? 0.75
  const signals: DiscoverySignal[] = []
  let score = 0
  const samples = args.samplePages ?? []

  if (EDITORIAL_PATH_HINTS.some((hint) => args.sourceUrl.toLowerCase().includes(hint))) {
    signals.push({ code: "path_hint", weight: 0.08 })
    score += 0.08
  }
  if (args.hasFeed || samples.some((s) => s.hasFeed)) {
    signals.push({ code: "feed", weight: 0.22 })
    score += 0.22
  }
  if (args.hasSitemap || samples.some((s) => s.inSitemap)) {
    signals.push({ code: "sitemap", weight: 0.18 })
    score += 0.18
  }

  const schemaHits = samples.filter((s) =>
    (s.schemaTypes ?? []).some((t) => ARTICLE_SCHEMA_TYPES.has(String(t).toLowerCase())),
  ).length
  if (schemaHits > 0) {
    const weight = Math.min(0.28, 0.12 + schemaHits * 0.04)
    signals.push({ code: "article_schema", weight, detail: String(schemaHits) })
    score += weight
  }

  const dated = samples.filter((s) => Boolean(s.publishedAt)).length
  if (dated >= 2) {
    signals.push({ code: "publication_dates", weight: 0.16 })
    score += 0.16
  } else if (dated === 1) {
    signals.push({ code: "publication_date_single", weight: 0.06 })
    score += 0.06
  }

  if (samples.filter((s) => Boolean(s.author)).length > 0) {
    signals.push({ code: "author", weight: 0.06 })
    score += 0.06
  }
  if (samples.some((s) => (s.ogType ?? "").toLowerCase() === "article")) {
    signals.push({ code: "og_type_article", weight: 0.1 })
    score += 0.1
  }
  if (samples.length >= 3) {
    signals.push({ code: "repeated_url_pattern", weight: 0.12 })
    score += 0.12
  }

  let negatives = 0
  for (const sample of samples) {
    const url = (sample.url ?? "").toLowerCase()
    if (NEGATIVE_PATH_HINTS.some((hint) => url.includes(hint))) negatives += 1
  }
  if (negatives > 0) {
    const weight = -Math.min(0.35, negatives * 0.1)
    signals.push({ code: "negative_path", weight })
    score += weight
  }

  const confidence = Math.max(0, Math.min(1, Number(score.toFixed(4))))
  return {
    confidence,
    signals,
    sourceType: inferSourceTypeFromUrl(args.sourceUrl),
    needsAi: confidence >= low && confidence < high,
  }
}

export function groupUrlsByPrefix(urls: string[], rootOrigin: string): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const raw of urls) {
    try {
      const url = new URL(raw)
      if (url.origin !== rootOrigin && !raw.startsWith(rootOrigin)) continue
      const parts = url.pathname.split("/").filter(Boolean)
      if (parts.length < 2) continue
      const prefix = `${url.origin}/${parts[0]}/`
      const list = groups.get(prefix) ?? []
      list.push(raw)
      groups.set(prefix, list)
    } catch {
      // ignore
    }
  }
  return groups
}

export function extractKeywordCandidatesFromContent(args: {
  title?: string | null
  description?: string | null
  headings?: string[] | null
  bodyText?: string | null
  maxSecondary?: number
}): { primary: string | null; secondary: string[] } {
  const maxSecondary = args.maxSecondary ?? 5
  const bag: string[] = []
  if (args.title?.trim()) bag.push(args.title.trim())
  if (args.description?.trim()) bag.push(args.description.trim())
  for (const heading of args.headings ?? []) {
    if (heading?.trim()) bag.push(heading.trim())
  }

  const phrases = new Map<string, number>()
  for (const text of bag) {
    const cleaned = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
    if (!cleaned) continue
    const words = cleaned.split(" ").filter((w) => w.length > 2)
    for (let n = Math.min(4, words.length); n >= 2; n--) {
      for (let i = 0; i <= words.length - n; i++) {
        const phrase = words.slice(i, i + n).join(" ")
        phrases.set(phrase, (phrases.get(phrase) ?? 0) + (n === 2 ? 1 : 2))
      }
    }
    if (words.length === 1) phrases.set(words[0]!, (phrases.get(words[0]!) ?? 0) + 1)
  }

  const body = (args.bodyText ?? "").toLowerCase()
  if (body) {
    for (const [phrase, score] of phrases) {
      if (body.includes(phrase)) phrases.set(phrase, score + 1)
    }
  }

  const ranked = [...phrases.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([phrase]) => phrase)

  const primary = ranked[0] ?? (args.title?.trim().toLowerCase() || null)
  const secondary = ranked.filter((p) => p !== primary).slice(0, maxSecondary)
  return { primary, secondary }
}

export function simpleContentHash(parts: Array<string | null | undefined>): string {
  const raw = parts.map((p) => (p ?? "").trim()).join("\n||\n")
  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0
  }
  return `h${hash.toString(16)}`
}

export function pathMatchesPatterns(pathname: string, patterns: string[]): boolean {
  if (patterns.length === 0) return true
  return patterns.some((pattern) => {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
    return new RegExp(`^${escaped}$`, "i").test(pathname)
  })
}
