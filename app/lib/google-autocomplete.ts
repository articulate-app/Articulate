/**
 * Google Suggest / Autocomplete helpers for keyword idea expansion.
 * Soft-fails: callers should treat an empty list as "no suggestions".
 */

const LANGUAGE_ID_TO_HL: Record<string, string> = {
  "1000": "en",
  "1014": "pt",
  "1003": "es",
  "1002": "fr",
  "1001": "de",
}

const REGION_ID_TO_GL: Record<string, string> = {
  "2840": "us",
  "2826": "uk",
  "2620": "pt",
  "2724": "es",
  "2076": "br",
  "2276": "de",
  "2250": "fr",
}

const SUGGEST_ALPHABET = "abcdefghijklmnopqrstuvwxyz"

export function normalizeKeywordKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

export function mapLanguageIdToHl(languageId?: string | null): string | undefined {
  if (!languageId) return undefined
  const trimmed = languageId.trim()
  if (!trimmed) return undefined
  if (LANGUAGE_ID_TO_HL[trimmed]) return LANGUAGE_ID_TO_HL[trimmed]
  if (/^[a-z]{2}$/i.test(trimmed)) return trimmed.toLowerCase()
  return undefined
}

export function mapRegionIdToGl(regionId?: string | null): string | undefined {
  if (!regionId) return undefined
  const trimmed = regionId.trim()
  if (!trimmed || trimmed === "0") return undefined
  if (REGION_ID_TO_GL[trimmed]) return REGION_ID_TO_GL[trimmed]
  if (/^[a-z]{2}$/i.test(trimmed)) return trimmed.toLowerCase()
  return undefined
}

type SuggestFetchOptions = {
  query: string
  hl?: string
  gl?: string
  signal?: AbortSignal
}

/**
 * Fetches one Google Suggest page (Firefox client JSON format).
 * Response shape: [query, [suggestion, ...], ...]
 */
export async function fetchGoogleSuggestPage(
  options: SuggestFetchOptions,
): Promise<string[]> {
  const q = options.query.trim()
  if (!q) return []

  const params = new URLSearchParams({
    client: "firefox",
    q,
  })
  if (options.hl) params.set("hl", options.hl)
  if (options.gl) params.set("gl", options.gl)

  const url = `https://suggestqueries.google.com/complete/search?${params.toString()}`

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (compatible; ArticulateKeywordResearch/1.0)",
    },
    signal: options.signal ?? AbortSignal.timeout(4000),
  })

  if (!response.ok) {
    throw new Error(`Google Suggest HTTP ${response.status}`)
  }

  const data: unknown = await response.json()
  if (!Array.isArray(data) || data.length < 2 || !Array.isArray(data[1])) {
    return []
  }

  return data[1]
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
}

export type GoogleAutocompleteOptions = {
  keyword: string
  languageId?: string | null
  regionId?: string | null
  /** Max unique suggestions to return (default 40). */
  limit?: number
  /**
   * When true, also query `seed + " "` and `seed + " " + a-z` to expand long-tails.
   * Default true.
   */
  expandAlphabet?: boolean
  signal?: AbortSignal
}

/**
 * Expand a seed keyword via Google Autocomplete (optionally with alphabet soup).
 */
export async function fetchGoogleAutocompleteSuggestions(
  options: GoogleAutocompleteOptions,
): Promise<string[]> {
  const seed = options.keyword.trim()
  if (!seed) return []

  const limit = Math.max(1, Math.min(options.limit ?? 40, 80))
  const hl = mapLanguageIdToHl(options.languageId)
  const gl = mapRegionIdToGl(options.regionId)
  const expandAlphabet = options.expandAlphabet !== false

  const queries = [seed, `${seed} `]
  if (expandAlphabet) {
    for (const letter of SUGGEST_ALPHABET) {
      queries.push(`${seed} ${letter}`)
    }
  }

  const settled = await Promise.allSettled(
    queries.map((query) =>
      fetchGoogleSuggestPage({
        query,
        hl,
        gl,
        signal: options.signal,
      }),
    ),
  )

  const ordered: string[] = []
  const seen = new Set<string>()

  const pushUnique = (value: string) => {
    const key = normalizeKeywordKey(value)
    if (!key || seen.has(key)) return
    seen.add(key)
    ordered.push(value.trim().replace(/\s+/g, " "))
  }

  // Always keep the seed first so the UI still shows what the user searched.
  pushUnique(seed)

  for (const result of settled) {
    if (result.status !== "fulfilled") continue
    for (const suggestion of result.value) {
      pushUnique(suggestion)
      if (ordered.length >= limit) {
        return ordered.slice(0, limit)
      }
    }
  }

  return ordered.slice(0, limit)
}
