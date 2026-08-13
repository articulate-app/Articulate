import type { KeywordMonthlySearchVolume } from "./keyword-ideas-metrics"
import type { KeywordIdeaRow } from "./keyword-ideas-merge"
import { normalizeKeywordKey } from "./google-autocomplete"
import {
  getDataForSeoCredentialsFromEnv,
  resolveDataForSeoLanguageCode,
  resolveDataForSeoLocationCode,
} from "./dataforseo-related-keywords"

const DATAFORSEO_KEYWORD_IDEAS_URL =
  "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live"

const DATAFORSEO_KEYWORD_SUGGESTIONS_URL =
  "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live"

export type DataForSeoCategoryIdeasOptions = {
  keyword: string
  languageId?: string | null
  regionId?: string | null
  limit?: number
  login?: string
  password?: string
  signal?: AbortSignal
}

type DataForSeoMonthlySearch = {
  year?: number
  month?: number
  search_volume?: number
}

type DataForSeoFlatIdeaItem = {
  keyword?: string
  keyword_info?: {
    search_volume?: number | null
    competition?: number | null
    monthly_searches?: DataForSeoMonthlySearch[] | null
  }
  keyword_properties?: {
    keyword_difficulty?: number | null
  }
}

type DataForSeoTask = {
  status_code?: number
  status_message?: string
  result?: Array<{
    items?: DataForSeoFlatIdeaItem[] | null
  }> | null
}

type DataForSeoResponse = {
  status_code?: number
  status_message?: string
  tasks?: DataForSeoTask[]
}

function toBasicAuthHeader(login: string, password: string): string {
  const token = Buffer.from(`${login}:${password}`, "utf8").toString("base64")
  return `Basic ${token}`
}

function mapMonthlySearches(
  raw: DataForSeoMonthlySearch[] | null | undefined,
): KeywordMonthlySearchVolume[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => ({
      year: Number(entry.year),
      month: Number(entry.month),
      monthlySearches: Number(entry.search_volume) || 0,
    }))
    .filter(
      (entry) =>
        Number.isFinite(entry.year) &&
        Number.isFinite(entry.month) &&
        entry.month >= 1 &&
        entry.month <= 12,
    )
    .sort((a, b) => a.year - b.year || a.month - b.month)
}

function competitionIndexFromFlatItem(item: DataForSeoFlatIdeaItem): number {
  const difficulty = item.keyword_properties?.keyword_difficulty
  if (typeof difficulty === "number" && Number.isFinite(difficulty)) {
    return Math.max(0, Math.min(100, Math.round(difficulty)))
  }
  const competition = item.keyword_info?.competition
  if (typeof competition === "number" && Number.isFinite(competition)) {
    return Math.max(0, Math.min(100, Math.round(competition * 100)))
  }
  return 0
}

/** Map DataForSEO Labs keyword_ideas / keyword_suggestions flat items. */
export function mapDataForSeoFlatIdeaItems(
  items: DataForSeoFlatIdeaItem[] | null | undefined,
): KeywordIdeaRow[] {
  if (!Array.isArray(items)) return []

  const rows: KeywordIdeaRow[] = []
  for (const item of items) {
    const keyword = item.keyword?.trim()
    if (!keyword) continue
    const volume = Number(item.keyword_info?.search_volume)
    rows.push({
      keyword,
      avgMonthlySearches: Number.isFinite(volume) ? volume : 0,
      competitionIndex: competitionIndexFromFlatItem(item),
      monthlySearchVolumes: mapMonthlySearches(item.keyword_info?.monthly_searches),
    })
  }
  return rows
}

/**
 * True when Ads + related + autocomplete left almost nothing useful —
 * escalate to category-based keyword ideas (Mangools-style expansion).
 */
export function isKeywordExpansionSparse(args: {
  seedKeyword: string
  adsIdeas: KeywordIdeaRow[]
  relatedIdeas: KeywordIdeaRow[]
  autocompleteSuggestions: string[]
  /** Min non-seed ideas with volume before we consider the set rich enough. */
  minVolumeIdeas?: number
}): boolean {
  const seedKey = normalizeKeywordKey(args.seedKeyword)
  const minVolumeIdeas = Math.max(1, args.minVolumeIdeas ?? 3)

  const volumeIdeas = new Set<string>()
  for (const idea of [...args.adsIdeas, ...args.relatedIdeas]) {
    const key = normalizeKeywordKey(idea.keyword)
    if (!key || key === seedKey) continue
    if (idea.avgMonthlySearches > 0) volumeIdeas.add(key)
  }

  if (volumeIdeas.size >= minVolumeIdeas) return false

  const autocompleteExtras = args.autocompleteSuggestions.filter((suggestion) => {
    const key = normalizeKeywordKey(suggestion)
    return Boolean(key && key !== seedKey)
  }).length

  // Autocomplete alone can still salvage a sparse Ads response.
  return volumeIdeas.size + autocompleteExtras < minVolumeIdeas
}

async function postDataForSeoLabs(
  url: string,
  body: Record<string, unknown>[],
  credentials: { login: string; password: string },
  signal?: AbortSignal,
  label = "DataForSEO",
): Promise<KeywordIdeaRow[]> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: toBasicAuthHeader(credentials.login, credentials.password),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(20000),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => "")
      console.warn(`${label} HTTP error:`, response.status, errorText)
      return []
    }

    const payload = (await response.json()) as DataForSeoResponse
    if (payload.status_code && payload.status_code !== 20000) {
      console.warn(`${label} status:`, payload.status_code, payload.status_message)
      return []
    }

    const task = payload.tasks?.[0]
    if (!task) return []
    if (task.status_code && task.status_code !== 20000) {
      console.warn(`${label} task status:`, task.status_code, task.status_message)
      return []
    }

    return mapDataForSeoFlatIdeaItems(task.result?.[0]?.items ?? [])
  } catch (error) {
    console.warn(`${label} failed:`, error)
    return []
  }
}

/**
 * Category / product-group keyword ideas (non-obvious, Mangools-like).
 * Soft-fails to [] when credentials are missing or the API errors.
 */
export async function fetchDataForSeoCategoryKeywordIdeas(
  options: DataForSeoCategoryIdeasOptions,
): Promise<KeywordIdeaRow[]> {
  const keyword = options.keyword.trim()
  if (!keyword) return []

  const credentials =
    options.login && options.password
      ? { login: options.login, password: options.password }
      : getDataForSeoCredentialsFromEnv()

  if (!credentials) return []

  const limit = Math.max(1, Math.min(1000, options.limit ?? 60))
  const locationCode = resolveDataForSeoLocationCode(options.regionId)
  const languageCode = resolveDataForSeoLanguageCode(options.languageId)

  return postDataForSeoLabs(
    DATAFORSEO_KEYWORD_IDEAS_URL,
    [
      {
        keywords: [keyword],
        location_code: locationCode,
        language_code: languageCode,
        closely_variants: false,
        ignore_synonyms: false,
        limit,
        order_by: ["relevance,desc", "keyword_info.search_volume,desc"],
        filters: [["keyword_info.search_volume", ">", 0]],
      },
    ],
    credentials,
    options.signal,
    "DataForSEO keyword ideas",
  )
}

/**
 * Full-text suggestions that contain the seed (or rearranged tokens).
 */
export async function fetchDataForSeoKeywordSuggestions(
  options: DataForSeoCategoryIdeasOptions,
): Promise<KeywordIdeaRow[]> {
  const keyword = options.keyword.trim()
  if (!keyword) return []

  const credentials =
    options.login && options.password
      ? { login: options.login, password: options.password }
      : getDataForSeoCredentialsFromEnv()

  if (!credentials) return []

  const limit = Math.max(1, Math.min(1000, options.limit ?? 60))
  const locationCode = resolveDataForSeoLocationCode(options.regionId)
  const languageCode = resolveDataForSeoLanguageCode(options.languageId)

  return postDataForSeoLabs(
    DATAFORSEO_KEYWORD_SUGGESTIONS_URL,
    [
      {
        keyword,
        location_code: locationCode,
        language_code: languageCode,
        include_seed_keyword: false,
        exact_match: false,
        ignore_synonyms: false,
        limit,
        order_by: ["keyword_info.search_volume,desc"],
        filters: [["keyword_info.search_volume", ">", 0]],
      },
    ],
    credentials,
    options.signal,
    "DataForSEO keyword suggestions",
  )
}

async function fetchCategoryIdeasViaEdge(
  options: Omit<DataForSeoCategoryIdeasOptions, "login" | "password">,
): Promise<KeywordIdeaRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!supabaseUrl || !serviceKey) return []

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/related-keywords`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        keyword: options.keyword,
        languageId: options.languageId ?? undefined,
        regionId: options.regionId ?? undefined,
        limit: options.limit ?? 60,
        includeCategoryIdeas: true,
        includeSuggestions: true,
        // Skip related-only path; this call is the sparse-seed escalation.
        includeRelated: false,
      }),
      signal: options.signal ?? AbortSignal.timeout(25000),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => "")
      console.warn("category-ideas edge error:", response.status, errorText)
      return []
    }

    const payload = (await response.json()) as { results?: KeywordIdeaRow[] }
    return Array.isArray(payload.results) ? payload.results : []
  } catch (error) {
    console.warn("category-ideas edge failed:", error)
    return []
  }
}

/**
 * Prefer direct DataForSEO credentials; fall back to Supabase edge secrets.
 * Merges category ideas + suggestions for sparse Ads seeds.
 */
export async function fetchCategoryKeywordIdeas(
  options: DataForSeoCategoryIdeasOptions,
): Promise<KeywordIdeaRow[]> {
  const hasDirect = Boolean(getDataForSeoCredentialsFromEnv() || (options.login && options.password))

  if (hasDirect) {
    const [ideas, suggestions] = await Promise.all([
      fetchDataForSeoCategoryKeywordIdeas(options),
      fetchDataForSeoKeywordSuggestions(options),
    ])
    return mergeIdeaRows([...ideas, ...suggestions])
  }

  return fetchCategoryIdeasViaEdge(options)
}

function mergeIdeaRows(rows: KeywordIdeaRow[]): KeywordIdeaRow[] {
  const byKey = new Map<string, KeywordIdeaRow>()
  for (const row of rows) {
    const key = normalizeKeywordKey(row.keyword)
    if (!key) continue
    const existing = byKey.get(key)
    if (!existing || row.avgMonthlySearches > existing.avgMonthlySearches) {
      byKey.set(key, row)
    }
  }
  return [...byKey.values()].sort((a, b) => b.avgMonthlySearches - a.avgMonthlySearches)
}
