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
 * Build Google Ads generateKeywordIdeas seed payload.
 * URL mode prefers urlSeed; optional contentSeedKeyword adds keywordSeed too.
 */
export function buildGoogleAdsKeywordSeed(
  input: KeywordResearchInput,
): GoogleAdsKeywordSeedPayload {
  if (input.mode === "seed") {
    const keyword = input.seedKeyword.trim()
    if (!keyword) throw new Error("seedKeyword is required")
    return { keywordSeed: { keywords: [keyword] } }
  }

  const url = input.url.trim()
  if (!url) throw new Error("url is required")
  const contentSeed = input.contentSeedKeyword?.trim()
  if (contentSeed) {
    return {
      urlSeed: { url },
      keywordSeed: { keywords: [contentSeed] },
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
