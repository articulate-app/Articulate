/**
 * Google AI Overview via DataForSEO Organic SERP (live/advanced).
 * Soft-fails: callers should treat null / empty as "no overview".
 */

import {
  resolveDataForSeoLanguageCode,
  resolveDataForSeoLocationCode,
} from "./dataforseo-related-keywords"
import { stripMarkdownNoise, truncateAiOverviewText } from "./ai-overview-text"

const DATAFORSEO_ORGANIC_URL =
  "https://api.dataforseo.com/v3/serp/google/organic/live/advanced"

export type AiOverviewEntity = {
  position: number
  name: string
  url: string | null
  snippet: string | null
}

export type AiOverviewResult = {
  present: boolean
  answerSummary: string
  results: AiOverviewEntity[]
  markdown: string | null
  checkUrl: string | null
  elapsedMs: number
  metadata: {
    toolCode: "google_ai_overview"
    toolName: "Google AI Overview"
    locationCode: number
    languageCode: string
    asynchronous?: boolean | null
    cost?: number | null
  }
}

export type FetchAiOverviewOptions = {
  keyword: string
  languageCode?: string | null
  /** Optional DataForSEO / Google Ads region id (e.g. 2620). */
  regionId?: string | null
  login?: string
  password?: string
  signal?: AbortSignal
  /** Extra charge on DataForSEO; needed for async overviews. Default true. */
  loadAsyncAiOverview?: boolean
}

type DataForSeoReference = {
  source?: string | null
  domain?: string | null
  url?: string | null
  title?: string | null
  text?: string | null
}

type DataForSeoAiOverviewElement = {
  type?: string
  title?: string | null
  text?: string | null
  markdown?: string | null
  links?: Array<{ url?: string | null; title?: string | null; text?: string | null }> | null
  references?: DataForSeoReference[] | null
}

type DataForSeoAiOverviewItem = {
  type?: string
  markdown?: string | null
  asynchronous_ai_overview?: boolean | null
  items?: DataForSeoAiOverviewElement[] | null
  references?: DataForSeoReference[] | null
}

type DataForSeoTask = {
  status_code?: number
  status_message?: string
  cost?: number
  result?: Array<{
    check_url?: string | null
    items?: Array<{ type?: string } & DataForSeoAiOverviewItem> | null
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

function defaultRegionForLanguage(languageCode: string): string {
  const hl = languageCode.toLowerCase()
  if (hl === "pt") return "2620"
  if (hl === "es") return "2724"
  if (hl === "fr") return "2250"
  if (hl === "de") return "2276"
  if (hl === "en") return "2840"
  return "2620"
}

/**
 * Map AI Overview references (+ element links) into ranked brand/source rows.
 */
export function parseAiOverviewEntities(
  overview: DataForSeoAiOverviewItem | null | undefined,
): AiOverviewEntity[] {
  if (!overview) return []

  const seen = new Set<string>()
  const entities: AiOverviewEntity[] = []

  const push = (args: {
    name?: string | null
    url?: string | null
    snippet?: string | null
  }) => {
    const name = (args.name || "").trim()
    const url = args.url?.trim() || null
    if (!name && !url) return
    const key = (url || name).toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    entities.push({
      position: entities.length + 1,
      name: name || url || "Source",
      url,
      snippet: args.snippet
        ? stripMarkdownNoise(args.snippet).slice(0, 220) || null
        : null,
    })
  }

  const refs = Array.isArray(overview.references) ? overview.references : []
  for (const ref of refs) {
    push({
      name: ref.source || ref.title || ref.domain || null,
      url: ref.url || null,
      snippet: ref.text || null,
    })
  }

  const elements = Array.isArray(overview.items) ? overview.items : []
  for (const element of elements) {
    const elementRefs = Array.isArray(element.references) ? element.references : []
    for (const ref of elementRefs) {
      push({
        name: ref.source || ref.title || ref.domain || null,
        url: ref.url || null,
        snippet: ref.text || element.text || null,
      })
    }
    const links = Array.isArray(element.links) ? element.links : []
    for (const link of links) {
      push({
        name: link.title || link.text || null,
        url: link.url || null,
        snippet: element.text || null,
      })
    }
  }

  return entities.slice(0, 12)
}

/**
 * Prefer structured element text over raw markdown (cleaner for UI).
 */
export function buildAiOverviewSummary(
  overview: DataForSeoAiOverviewItem | null | undefined,
): string {
  if (!overview) return ""

  const parts: string[] = []
  for (const element of overview.items ?? []) {
    const title =
      typeof element.title === "string" && element.title.trim()
        ? stripMarkdownNoise(element.title)
        : ""
    const body =
      typeof element.text === "string" && element.text.trim()
        ? stripMarkdownNoise(element.text)
        : typeof element.markdown === "string" && element.markdown.trim()
          ? stripMarkdownNoise(element.markdown)
          : ""

    if (title && body) {
      parts.push(`${title}. ${body}`)
    } else if (body) {
      parts.push(body)
    } else if (title) {
      parts.push(title)
    }
  }

  const fromElements = parts.filter(Boolean).join("\n\n").trim()
  if (fromElements) {
    return truncateAiOverviewText(fromElements, 900)
  }

  if (typeof overview.markdown === "string" && overview.markdown.trim()) {
    return truncateAiOverviewText(stripMarkdownNoise(overview.markdown), 900)
  }

  return ""
}

export { stripMarkdownNoise }

function findAiOverviewItem(
  items: Array<{ type?: string } & DataForSeoAiOverviewItem> | null | undefined,
): DataForSeoAiOverviewItem | null {
  if (!Array.isArray(items)) return null
  const match = items.find((item) => item?.type === "ai_overview")
  return match ?? null
}

/**
 * Fetch Google AI Overview for a keyword. Returns present:false when absent.
 */
export async function fetchGoogleAiOverview(
  options: FetchAiOverviewOptions,
): Promise<AiOverviewResult> {
  const started = Date.now()
  const keyword = options.keyword.trim()
  const languageCode = resolveDataForSeoLanguageCode(options.languageCode)
  const regionId = options.regionId?.trim() || defaultRegionForLanguage(languageCode)
  const locationCode = resolveDataForSeoLocationCode(regionId)

  const empty = (extra?: Partial<AiOverviewResult>): AiOverviewResult => ({
    present: false,
    answerSummary: "",
    results: [],
    markdown: null,
    checkUrl: null,
    elapsedMs: Date.now() - started,
    metadata: {
      toolCode: "google_ai_overview",
      toolName: "Google AI Overview",
      locationCode,
      languageCode,
      asynchronous: null,
      cost: null,
    },
    ...extra,
  })

  if (!keyword) return empty()

  const login = options.login || process.env.DATAFORSEO_ID?.trim()
  const password = options.password || process.env.DATAFORSEO_SECRET?.trim()
  if (!login || !password) {
    return empty()
  }

  const loadAsync = options.loadAsyncAiOverview !== false

  try {
    const response = await fetch(DATAFORSEO_ORGANIC_URL, {
      method: "POST",
      headers: {
        Authorization: toBasicAuthHeader(login, password),
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          keyword,
          location_code: locationCode,
          language_code: languageCode,
          device: "desktop",
          os: "windows",
          depth: 10,
          load_async_ai_overview: loadAsync,
        },
      ]),
      signal: options.signal ?? AbortSignal.timeout(45000),
    })

    if (!response.ok) {
      console.warn("DataForSEO AI Overview HTTP error", response.status)
      return empty()
    }

    const payload = (await response.json()) as DataForSeoResponse
    const task = payload.tasks?.[0]
    if (!task || (task.status_code && task.status_code !== 20000)) {
      console.warn(
        "DataForSEO AI Overview task error",
        task?.status_code,
        task?.status_message,
      )
      return empty()
    }

    const result = task.result?.[0]
    const overview = findAiOverviewItem(result?.items)
    if (!overview) {
      return empty({
        checkUrl: result?.check_url ?? null,
        metadata: {
          toolCode: "google_ai_overview",
          toolName: "Google AI Overview",
          locationCode,
          languageCode,
          asynchronous: null,
          cost: task.cost ?? null,
        },
      })
    }

    if (
      overview.asynchronous_ai_overview === true &&
      !overview.markdown &&
      !(overview.items && overview.items.length) &&
      !(overview.references && overview.references.length)
    ) {
      return empty({
        checkUrl: result?.check_url ?? null,
        metadata: {
          toolCode: "google_ai_overview",
          toolName: "Google AI Overview",
          locationCode,
          languageCode,
          asynchronous: true,
          cost: task.cost ?? null,
        },
      })
    }

    const results = parseAiOverviewEntities(overview)
    const answerSummary = buildAiOverviewSummary(overview)

    return {
      present: Boolean(answerSummary || results.length),
      answerSummary,
      results,
      markdown: overview.markdown ?? null,
      checkUrl: result?.check_url ?? null,
      elapsedMs: Date.now() - started,
      metadata: {
        toolCode: "google_ai_overview",
        toolName: "Google AI Overview",
        locationCode,
        languageCode,
        asynchronous: overview.asynchronous_ai_overview ?? null,
        cost: task.cost ?? null,
      },
    }
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error
    console.warn("DataForSEO AI Overview fetch failed", error)
    return empty()
  }
}
