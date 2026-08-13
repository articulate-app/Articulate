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

/** Function/stop words that never make a useful SEO primary alone. EN + PT. */
const KEYWORD_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "for", "to", "of", "in", "on", "at", "by",
  "with", "from", "as", "is", "are", "was", "were", "be", "been", "being", "it",
  "its", "this", "that", "these", "those", "what", "which", "who", "whom", "how",
  "why", "when", "where", "than", "then", "into", "over", "under", "about",
  "after", "before", "between", "through", "during", "without", "within", "also",
  "just", "only", "more", "most", "some", "any", "all", "each", "every", "both",
  "few", "other", "such", "same", "own", "so", "too", "very", "can", "could",
  "should", "would", "will", "may", "might", "must", "do", "does", "did", "doing",
  "have", "has", "had", "having", "not", "no", "nor", "if", "else", "while",
  "until", "once", "here", "there", "out", "up", "down", "off", "again", "their",
  "them", "they", "we", "our", "you", "your", "he", "she", "his", "her", "him",
  "my", "me", "vs", "via", "per", "using", "use", "used", "get", "got", "make",
  "made", "like", "looks", "look", "great", "key", "top", "best", "new", "guide",
  "tips", "things", "way", "ways", "right", "stand", "out", "them", "they",
  "one", "ones", "two", "ten", "first", "last", "next", "another", "much",
  "o", "os", "as", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das",
  "em", "no", "na", "nos", "nas", "por", "para", "com", "sem", "sob", "sobre",
  "entre", "ao", "aos", "que", "se", "como", "quando", "onde", "porque", "qual",
  "quais", "mais", "menos", "muito", "já", "também", "só", "nao", "não", "é",
  "são", "ser", "foi", "era", "está", "estão", "este", "esta", "esse", "essa",
  "isso", "isto", "seu", "sua", "seus", "suas", "ele", "ela", "eles", "elas",
  "você", "eu", "nós", "e", "ou", "mas", "nem", "dicas", "tipos",
])

const FILLER_PHRASE_RE =
  /\b(how to|what is|what are|why it|why they|and how|looks like|to do|to improve|to build|to write|to stand|o que é|o que sao|por que)\b/i

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ")
}

/** Drop trailing brand suffixes like " — Articulate" / " | Brand". */
function stripBrandSuffix(title: string): string {
  return title.replace(/\s*[—–|]\s*[\p{L}\p{N} .&-]{2,40}\s*$/u, "").trim()
}

/**
 * Prefer the topical left side of "Topic: explanatory subtitle".
 * Blog titles often bury the real keyword before the colon.
 */
function titleTopicSeed(title: string): string {
  const cleaned = stripBrandSuffix(stripHtmlTags(title)).trim()
  const colon = cleaned.indexOf(":")
  if (colon > 2 && colon < cleaned.length - 5) {
    const left = cleaned.slice(0, colon).trim()
    const leftWords = left.split(/\s+/).filter(Boolean)
    if (leftWords.length >= 1 && leftWords.length <= 6) return left
  }
  return cleaned
}

function normalizePhraseText(value: string): string {
  return stripHtmlTags(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isContentWord(word: string): boolean {
  return word.length > 2 && !KEYWORD_STOPWORDS.has(word)
}

function isUsefulKeywordPhrase(
  phrase: string,
  opts?: { allowShortTopic?: boolean },
): boolean {
  const words = phrase.split(" ").filter(Boolean)
  if (words.length === 0 || words.length > 5) return false
  if (words.length === 1) {
    const word = words[0]!
    if (!isContentWord(word)) return false
    if (opts?.allowShortTopic) return word.length >= 3
    return word.length >= 4
  }
  if (KEYWORD_STOPWORDS.has(words[0]!) || KEYWORD_STOPWORDS.has(words[words.length - 1]!)) {
    return false
  }
  if (words.some((word) => KEYWORD_STOPWORDS.has(word))) return false
  if (!words.some((word) => word.length >= 4 && isContentWord(word))) return false
  if (FILLER_PHRASE_RE.test(phrase)) return false
  return true
}

function scoreKeywordPhrase(
  phrase: string,
  opts: {
    fromTopic: boolean
    inDescription: boolean
    inBody: boolean
    earlyBonus?: number
  },
): number {
  const words = phrase.split(" ").filter(Boolean)
  let score = 0
  if (words.length === 2) score += 5
  else if (words.length === 3) score += 6
  else if (words.length === 4) score += 3
  else if (words.length === 1) score += 2
  else score += 1

  score += words.filter(isContentWord).length * 2
  score += words.reduce((sum, word) => sum + Math.min(word.length, 10), 0) * 0.15
  if (opts.fromTopic) score += 8
  if (opts.inDescription) score += 2
  if (opts.inBody) score += 1
  if (opts.earlyBonus) score += opts.earlyBonus
  if (FILLER_PHRASE_RE.test(phrase)) score -= 8
  return score
}

/**
 * Infer a search-like primary keyword from article metadata.
 * Uses the title topic (left of ":") first, drops stopword/filler n-grams,
 * and only then falls back to description/heading phrases.
 *
 * Keep in sync with app/lib/competitive-content.ts.
 */
export function extractKeywordCandidatesFromContent(args: {
  title?: string | null
  description?: string | null
  headings?: string[] | null
  bodyText?: string | null
  maxSecondary?: number
}): { primary: string | null; secondary: string[] } {
  const maxSecondary = args.maxSecondary ?? 5
  const topicSeed = args.title?.trim() ? titleTopicSeed(args.title) : ""
  const topicNormalized = topicSeed ? normalizePhraseText(topicSeed) : ""

  const sources: Array<{ text: string; fromTopic: boolean }> = []
  if (topicSeed) sources.push({ text: topicSeed, fromTopic: true })
  if (args.title?.trim()) {
    const full = stripBrandSuffix(stripHtmlTags(args.title.trim()))
    if (normalizePhraseText(full) !== topicNormalized) {
      sources.push({ text: full, fromTopic: false })
    }
  }
  if (args.description?.trim()) {
    sources.push({ text: args.description.trim(), fromTopic: false })
  }
  for (const heading of args.headings ?? []) {
    if (heading?.trim()) sources.push({ text: heading.trim(), fromTopic: false })
  }

  const phrases = new Map<string, number>()
  const descriptionNormalized = normalizePhraseText(args.description ?? "")
  const bodyNormalized = normalizePhraseText(args.bodyText ?? "").slice(0, 8000)

  for (const source of sources) {
    const cleaned = normalizePhraseText(source.text)
    if (!cleaned) continue
    const words = cleaned.split(" ").filter((word) => word.length > 2)
    if (words.length === 0) continue

    for (let n = Math.min(4, words.length); n >= 1; n--) {
      for (let i = 0; i <= words.length - n; i++) {
        const phrase = words.slice(i, i + n).join(" ")
        const allowShortTopic =
          source.fromTopic && phrase === topicNormalized
        if (!isUsefulKeywordPhrase(phrase, { allowShortTopic })) continue
        const earlyBonus = source.fromTopic
          ? Math.max(0, 3 - i * 0.5)
          : 0
        const score = scoreKeywordPhrase(phrase, {
          fromTopic: source.fromTopic,
          inDescription: Boolean(descriptionNormalized && descriptionNormalized.includes(phrase)),
          inBody: Boolean(bodyNormalized && bodyNormalized.includes(phrase)),
          earlyBonus,
        })
        phrases.set(phrase, Math.max(phrases.get(phrase) ?? 0, score))
      }
    }
  }

  if (
    topicNormalized
    && isUsefulKeywordPhrase(topicNormalized, { allowShortTopic: true })
  ) {
    phrases.set(
      topicNormalized,
      Math.max(
        phrases.get(topicNormalized) ?? 0,
        scoreKeywordPhrase(topicNormalized, {
          fromTopic: true,
          inDescription: Boolean(descriptionNormalized?.includes(topicNormalized)),
          inBody: Boolean(bodyNormalized?.includes(topicNormalized)),
        }) + 4,
      ),
    )
  }

  const ranked = [...phrases.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([phrase]) => phrase)

  let primary = ranked[0] ?? null
  if (!primary && topicNormalized) {
    const topicWords = topicNormalized
      .split(" ")
      .filter(isContentWord)
      .slice(0, 4)
    primary = topicWords.length > 0 ? topicWords.join(" ") : null
  }

  const secondary = ranked.filter((phrase) => phrase !== primary).slice(0, maxSecondary)
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
