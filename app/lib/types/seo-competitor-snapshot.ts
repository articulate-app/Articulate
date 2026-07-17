export interface BootstrapSeoOverrideData {
  primary_keyword: string | null
  secondary_keywords: string[] | string | null
  seo_required_override: boolean | null
}

export interface BootstrapSeoData {
  effective: {
    seo_required: boolean | null
    seo_source: string | null
  } | null
  override: BootstrapSeoOverrideData | null
}

export interface TopResultsResult {
  position: number
  title: string
  link: string
  displayLink: string | null
  snippet: string | null
}

export interface TopResultsResponse {
  q: string
  results: TopResultsResult[]
  total: number
  params: {
    lr: string | null
    cr: string | null
    num: number
  }
  serpKey: string
  cached: boolean
  error: string | null
}

export interface TopResultsRequestParams {
  q: string
  languageId: string | null
  regionId: string | null
  num: number
}

export interface PrefetchCompetitorStructuresRequest {
  taskId: number
  channelId: number
  keyword: string
  competitors: Array<{
    competitorId: number
    url: string
  }>
}

export interface PrefetchCompetitorStructuresResponse {
  jobId: string | null
  queued: number
  completed?: boolean
}

export type PrefetchJobStatus = "queued" | "running" | "completed" | "failed"

export type PrefetchJobState = {
  id: number
  keyword: string
  status: PrefetchJobStatus
  requestedCount: number
  processedCount: number
  error: string | null
}

export interface CompetitorFlatHeading {
  level: 1 | 2 | 3
  tag: "h1" | "h2" | "h3"
  text: string
}

export type CompetitorPageType =
  | "article"
  | "product"
  | "homepage"
  | "category"
  | "landing"
  | "unknown"

export interface CompetitorStructureResponse {
  url: string
  title: string | null
  headings: {
    h1: string[]
    h2: string[]
    h3: string[]
  }
  flatHeadings: CompetitorFlatHeading[]
  available: boolean
  pageType: CompetitorPageType
  source: "firecrawl" | "fallback"
  cached: boolean
  error: string | null
}

export interface SeoSnapshotStructure {
  pageTitle: string | null
  h1: string[]
  h2: string[]
  h3: string[]
  flatHeadings: CompetitorFlatHeading[]
  source: string | null
  pageType: CompetitorPageType | null
  fetchedAt: string | null
  error?: string | null
  available?: boolean | null
}

export interface SeoSnapshotCompetitor {
  id: number
  taskId: number
  channelId: number
  keyword: string
  position: number
  title: string
  url: string
  displayLink: string | null
  selected: boolean
  createdAt: string
  updatedAt: string
  structure: SeoSnapshotStructure | null
}

export type SnapshotCompetitor = SeoSnapshotCompetitor

export interface SeoSnapshot {
  taskId: number
  channelId: number
  primaryKeyword: string | null
  secondaryKeywords: string[]
  keywords: string[]
  competitors: SeoSnapshotCompetitor[]
}

export type SnapshotCompetitorStructure = SeoSnapshotStructure

export interface SaveKeywordCompetitorInput {
  position: number
  title: string
  url: string
  displayLink?: string | null
}

function splitSecondaryKeywords(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean)
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  return []
}

export function deriveKeywordsFromBootstrapSeo(bootstrapSeo: BootstrapSeoData | null | undefined): string[] {
  const primary = bootstrapSeo?.override?.primary_keyword?.trim() ?? ""
  const secondary = splitSecondaryKeywords(bootstrapSeo?.override?.secondary_keywords)
  const deduped = new Set<string>()
  const orderedKeywords = [primary, ...secondary].filter(Boolean)
  for (const keyword of orderedKeywords) {
    const key = keyword.toLowerCase()
    if (deduped.has(key)) continue
    deduped.add(key)
  }
  return Array.from(deduped).map((lowerKeyword) => {
    const original = orderedKeywords.find((keyword) => keyword.toLowerCase() === lowerKeyword)
    return original ?? lowerKeyword
  })
}
