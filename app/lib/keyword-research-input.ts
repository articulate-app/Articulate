/**
 * Keyword research input contract (seed + URL modes).
 */

export type KeywordResearchSeedInput = {
  mode: "seed"
  projectId?: number
  seedKeyword: string
  languageCode?: string
  locationCode?: string
}

export type KeywordResearchUrlInput = {
  mode: "url"
  projectId?: number
  articleId?: number
  url: string
  languageCode?: string
  locationCode?: string
  useStoredContent?: boolean
  /** Optional seed extracted from article content before Ads/DataForSEO enrichment */
  contentSeedKeyword?: string
}

export type KeywordResearchInput = KeywordResearchSeedInput | KeywordResearchUrlInput

export type GoogleAdsKeywordSeedPayload =
  | { keywordSeed: { keywords: string[] } }
  | { urlSeed: { url: string } }
  | { keywordSeed: { keywords: string[] }; urlSeed: { url: string } }

/**
 * Collapse punctuation/diacritics so "pré-diabetes", "pré diabetes", and
 * "pre diabetes" compare as the same planner concept.
 */
export function keywordOrthographicKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "")
}

/**
 * Expand a typed seed into Google Ads Keyword Planner variants.
 * Planner often indexes the space / ASCII form and returns `{}` for the
 * hyphenated accented spelling (e.g. "pré-diabetes" → empty, "pre diabetes" → volume).
 *
 * Order matters: putting the accented hyphen form first can suppress the
 * ASCII exact-match row, so planner-friendly forms are listed first.
 */
export function expandKeywordSeedVariants(seed: string): string[] {
  const base = seed.trim().replace(/\s+/g, " ")
  if (!base) return []

  const seen = new Set<string>()
  const out: string[] = []
  const push = (value: string) => {
    const trimmed = value.trim().replace(/\s+/g, " ")
    if (!trimmed) return
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(trimmed)
  }

  const ascii = base.normalize("NFD").replace(/\p{M}/gu, "")
  // Planner-friendly first.
  push(ascii.replace(/-/g, " "))
  push(ascii.replace(/-/g, ""))
  push(ascii)
  push(base.replace(/-/g, " "))
  push(base.replace(/-/g, ""))
  // Keep the typed form last so it does not dominate the seed list.
  push(base)

  return out.slice(0, 20)
}

/** Higher = closer surface form (hyphen/space), used when inheriting seed metrics. */
export function keywordSeedVariantAffinity(seed: string, candidate: string): number {
  const normalizeSeparators = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim()

  if (normalizeSeparators(seed) === normalizeSeparators(candidate)) return 2
  if (keywordOrthographicKey(seed) === keywordOrthographicKey(candidate)) return 1
  return 0
}

/**
 * Build Google Ads generateKeywordIdeas seed payload.
 * URL mode prefers urlSeed; optional contentSeedKeyword adds keywordSeed too.
 */
export function buildGoogleAdsKeywordSeed(
  input: KeywordResearchInput,
): GoogleAdsKeywordSeedPayload {
  if (input.mode === "seed") {
    const keyword = input.seedKeyword.trim()
    if (!keyword) throw new Error("seedKeyword is required")
    return { keywordSeed: { keywords: expandKeywordSeedVariants(keyword) } }
  }

  const url = input.url.trim()
  if (!url) throw new Error("url is required")
  const contentSeed = input.contentSeedKeyword?.trim()
  if (contentSeed) {
    return {
      urlSeed: { url },
      keywordSeed: { keywords: expandKeywordSeedVariants(contentSeed) },
    }
  }
  return { urlSeed: { url } }
}

export function resolveKeywordResearchMode(body: {
  mode?: unknown
  keyword?: unknown
  url?: unknown
}): "seed" | "url" {
  if (body.mode === "url") return "url"
  if (body.mode === "seed") return "seed"
  if (typeof body.url === "string" && body.url.trim() && !String(body.keyword ?? "").trim()) {
    return "url"
  }
  return "seed"
}
