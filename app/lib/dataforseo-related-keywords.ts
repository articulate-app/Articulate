import type { KeywordMonthlySearchVolume } from "./keyword-ideas-metrics"
import type { KeywordIdeaRow } from "./keyword-ideas-merge"
import { mapLanguageIdToHl, mapRegionIdToGl } from "./google-autocomplete"

const DATAFORSEO_RELATED_URL =
  "https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live"

/** Google Ads / DataForSEO country codes we support in the planner. */
const DEFAULT_LOCATION_CODE = 2620 // Portugal
const DEFAULT_LANGUAGE_CODE = "pt"

export type DataForSeoRelatedKeywordsOptions = {
  keyword: string
  languageId?: string | null
  regionId?: string | null
  /** DataForSEO related-search depth (0–4). Default 2 (~72 max ideas). */
  depth?: number
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

type DataForSeoRelatedItem = {
  keyword_data?: {
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
}

type DataForSeoTask = {
  status_code?: number
  status_message?: string
  result?: Array<{
    items?: DataForSeoRelatedItem[] | null
  }> | null
}

type DataForSeoResponse = {
  status_code?: number
  status_message?: string
  tasks?: DataForSeoTask[]
}

export function resolveDataForSeoLocationCode(regionId?: string | null): number {
  const gl = mapRegionIdToGl(regionId)
  if (regionId && /^\d+$/.test(regionId.trim())) {
    return Number(regionId.trim())
  }
  // DataForSEO location_code matches our Google Ads geo ids for these countries.
  if (regionId && /^\d+$/.test(String(regionId))) return Number(regionId)
  if (gl === "us") return 2840
  if (gl === "uk") return 2826
  if (gl === "pt") return 2620
  if (gl === "es") return 2724
  if (gl === "br") return 2076
  if (gl === "de") return 2276
  if (gl === "fr") return 2250
  return DEFAULT_LOCATION_CODE
}

export function resolveDataForSeoLanguageCode(languageId?: string | null): string {
  const hl = mapLanguageIdToHl(languageId)
  if (hl) return hl
  return DEFAULT_LANGUAGE_CODE
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

function competitionIndexFromItem(item: DataForSeoRelatedItem): number {
  const difficulty = item.keyword_data?.keyword_properties?.keyword_difficulty
  if (typeof difficulty === "number" && Number.isFinite(difficulty)) {
    return Math.max(0, Math.min(100, Math.round(difficulty)))
  }
  const competition = item.keyword_data?.keyword_info?.competition
  if (typeof competition === "number" && Number.isFinite(competition)) {
    return Math.max(0, Math.min(100, Math.round(competition * 100)))
  }
  return 0
}

export function mapDataForSeoRelatedItems(
  items: DataForSeoRelatedItem[] | null | undefined,
): KeywordIdeaRow[] {
  if (!Array.isArray(items)) return []

  const rows: KeywordIdeaRow[] = []
  for (const item of items) {
    const keyword = item.keyword_data?.keyword?.trim()
    if (!keyword) continue
    const volume = Number(item.keyword_data?.keyword_info?.search_volume)
    rows.push({
      keyword,
      avgMonthlySearches: Number.isFinite(volume) ? volume : 0,
      competitionIndex: competitionIndexFromItem(item),
      monthlySearchVolumes: mapMonthlySearches(
        item.keyword_data?.keyword_info?.monthly_searches,
      ),
    })
  }
  return rows
}

export function getDataForSeoCredentialsFromEnv(): {
  login: string
  password: string
} | null {
  const login = process.env.DATAFORSEO_ID?.trim()
  const password = process.env.DATAFORSEO_SECRET?.trim()
  if (!login || !password) return null
  return { login, password }
}

/**
 * Fetch Google "searches related to" style keywords via DataForSEO Labs.
 * Soft-fails to [] when credentials are missing or the API errors.
 */
export async function fetchDataForSeoRelatedKeywords(
  options: DataForSeoRelatedKeywordsOptions,
): Promise<KeywordIdeaRow[]> {
  const keyword = options.keyword.trim()
  if (!keyword) return []

  const credentials =
    options.login && options.password
      ? { login: options.login, password: options.password }
      : getDataForSeoCredentialsFromEnv()

  if (!credentials) return []

  const depth = Math.max(1, Math.min(4, options.depth ?? 2))
  const limit = Math.max(1, Math.min(1000, options.limit ?? 50))
  const locationCode = resolveDataForSeoLocationCode(options.regionId)
  const languageCode = resolveDataForSeoLanguageCode(options.languageId)

  try {
    const response = await fetch(DATAFORSEO_RELATED_URL, {
      method: "POST",
      headers: {
        Authorization: toBasicAuthHeader(credentials.login, credentials.password),
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          keyword,
          location_code: locationCode,
          language_code: languageCode,
          depth,
          limit,
          include_seed_keyword: false,
        },
      ]),
      signal: options.signal ?? AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => "")
      console.warn("DataForSEO related keywords HTTP error:", response.status, errorText)
      return []
    }

    const payload = (await response.json()) as DataForSeoResponse
    if (payload.status_code && payload.status_code !== 20000) {
      console.warn(
        "DataForSEO related keywords status:",
        payload.status_code,
        payload.status_message,
      )
      return []
    }

    const task = payload.tasks?.[0]
    if (!task) return []
    if (task.status_code && task.status_code !== 20000) {
      console.warn(
        "DataForSEO related keywords task status:",
        task.status_code,
        task.status_message,
      )
      return []
    }

    const items = task.result?.[0]?.items ?? []
    return mapDataForSeoRelatedItems(items)
  } catch (error) {
    console.warn("DataForSEO related keywords failed:", error)
    return []
  }
}

/**
 * When Next.js does not have DataForSEO env vars, call the Supabase edge function
 * that holds DATAFORSEO_ID / DATAFORSEO_SECRET.
 */
export async function fetchDataForSeoRelatedKeywordsViaEdge(
  options: Omit<DataForSeoRelatedKeywordsOptions, "login" | "password">,
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
        depth: options.depth ?? 2,
        limit: options.limit ?? 50,
      }),
      signal: options.signal ?? AbortSignal.timeout(20000),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => "")
      console.warn("related-keywords edge error:", response.status, errorText)
      return []
    }

    const payload = (await response.json()) as { results?: KeywordIdeaRow[] }
    return Array.isArray(payload.results) ? payload.results : []
  } catch (error) {
    console.warn("related-keywords edge failed:", error)
    return []
  }
}

/** Prefer direct credentials; fall back to Supabase edge secrets. */
export async function fetchRelatedKeywordIdeas(
  options: DataForSeoRelatedKeywordsOptions,
): Promise<KeywordIdeaRow[]> {
  const direct = await fetchDataForSeoRelatedKeywords(options)
  if (direct.length > 0 || getDataForSeoCredentialsFromEnv()) {
    return direct
  }
  return fetchDataForSeoRelatedKeywordsViaEdge(options)
}
