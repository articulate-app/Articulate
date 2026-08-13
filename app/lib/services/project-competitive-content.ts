"use client"

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import {
  CONTENT_SOURCE_TYPES,
  normalizeDomain,
  normalizeHttpUrl,
  type ContentSourceStatus,
  type ContentSourceType,
  type DiscoveryMethod,
  type SyncStatus,
} from "@/lib/competitive-content"
import { assertOwnedFlagsImmutable } from "@/lib/project-competitive-content"
import type { ContentCompetitiveSummary } from "@/lib/project-competitive-content-summary"
import { getProjectWebsiteUrl } from "@/lib/services/project-brand-social"
import {
  createProjectCompetitor,
  discoverCompetitorSocialProfilesFromWebsite,
  listProjectCompetitors,
  updateProjectCompetitor,
} from "@/lib/services/project-competitors"

export const PROJECT_COMPETITIVE_WEBSITES_QUERY_KEY = "project-competitive-websites" as const
export const PROJECT_COMPETITIVE_SOURCES_QUERY_KEY = "project-competitive-sources" as const
export const PROJECT_COMPETITIVE_ARTICLES_QUERY_KEY = "project-competitive-articles" as const
export const PROJECT_COMPETITIVE_CONTENT_SUMMARY_QUERY_KEY =
  "project-competitive-content-summary" as const
export const PROJECT_KEYWORD_GAP_QUERY_KEY = "project-keyword-gap" as const
export const PROJECT_OWNED_CONTENT_PERFORMANCE_QUERY_KEY =
  "project-owned-content-performance" as const
export const PROJECT_SEARCH_CONSOLE_QUERY_KEY = "project-search-console" as const

export type CompetitiveContentSyncResult = {
  ok: boolean
  status?: string
  error?: string
  results?: Array<Record<string, unknown>>
}

export type ProjectCompetitiveWebsite = {
  id: number
  project_id: number
  entity_type: "owned" | "competitor"
  competitor_id: number | null
  root_url: string
  normalized_domain: string
  market_code: string | null
  default_language_code: string | null
  include_subdomains: boolean
  is_active: boolean
  last_discovered_at: string | null
  last_synced_at: string | null
  last_sync_status: SyncStatus | null
  last_sync_error: string | null
  created_at: string
  updated_at: string
}

export type ProjectCompetitiveContentSource = {
  id: number
  project_id: number
  website_id: number
  entity_type: "owned" | "competitor"
  competitor_id: number | null
  source_url: string
  normalized_source_url: string
  source_type: ContentSourceType
  language_code: string | null
  sitemap_url: string | null
  feed_url: string | null
  include_paths: string[]
  exclude_paths: string[]
  discovery_method: DiscoveryMethod
  discovery_confidence: number | null
  discovery_signals: unknown[]
  status: ContentSourceStatus
  is_manual_override: boolean
  last_discovered_at: string | null
  last_synced_at: string | null
  last_sync_status: SyncStatus | null
  last_sync_error: string | null
  created_at: string
  updated_at: string
}

export type ProjectCompetitiveArticle = {
  id: number
  project_id: number
  website_id: number
  content_source_id: number | null
  entity_type: "owned" | "competitor"
  competitor_id: number | null
  entity_id: string
  entity_name: string | null
  is_owned: boolean
  url: string
  canonical_url: string
  title: string | null
  description: string | null
  author: string | null
  language_code: string | null
  published_at: string | null
  modified_at: string | null
  image_url: string | null
  page_type: string | null
  summary: string | null
  markdown_excerpt: string | null
  content_hash: string | null
  primary_keyword: string | null
  content_source_url: string | null
  content_source_type: ContentSourceType | null
  content_source_language: string | null
  website_root_url: string | null
  website_domain: string | null
  first_seen_at: string
  last_seen_at: string
  scraped_at: string | null
  keywords_extracted_at: string | null
  ranking_synced_at: string | null
  created_at: string
  updated_at: string
}

export type ArticleKeywordMetric = {
  keyword: string
  keyword_type: string
  search_volume: number | null
  competition: number | null
  ranking_position: number | null
  clicks: number | null
  impressions: number | null
}

export type ArticleImpactSort =
  | "recent"
  | "updated_oldest"
  | "updated_newest"
  | "impact"
  | "gsc_clicks"
  | "gsc_impressions"
  | "ga_views"
  | "ga_sessions"

export type ProjectCompetitiveArticleImpact = {
  id: number
  project_id: number
  website_id: number
  content_source_id: number | null
  entity_type: "owned" | "competitor"
  competitor_id: number | null
  entity_id: string
  entity_name: string | null
  is_owned: boolean
  url: string
  canonical_url: string
  title: string | null
  description: string | null
  language_code: string | null
  published_at: string | null
  modified_at: string | null
  image_url: string | null
  primary_keyword: string | null
  content_source_type: ContentSourceType | null
  first_seen_at: string
  last_seen_at: string
  updated_at: string
  keywords: ArticleKeywordMetric[]
  gsc_clicks: number | null
  gsc_impressions: number | null
  gsc_ctr: number | null
  gsc_position: number | null
  ga_sessions: number | null
  ga_users: number | null
  ga_pageviews: number | null
  impact_score: number | null
}

export type KeywordGapRow = {
  keyword: string
  normalized_keyword: string
  search_volume: number | null
  competitors_count: number
  competitor_articles_count: number
  best_competitor_position: number | null
  owned_articles_count: number
  owned_ranking_position: number | null
  opportunity_status: string
}

export type OwnedContentPerformance = {
  project_id: number
  date_from: string | null
  date_to: string | null
  search_console_connected: boolean
  analytics_connected: boolean
  search_console: {
    clicks: number | null
    impressions: number | null
    ctr: number | null
    position_avg: number | null
  } | null
  analytics: {
    page_views: number | null
    users: number | null
    sessions: number | null
    engaged_sessions: number | null
    engagement_rate: number | null
  } | null
}

export type ProjectSearchConsoleProperty = {
  id: number
  project_id: number
  website_id: number | null
  provider: string
  property_url: string
  site_type: string | null
  is_active: boolean
  last_synced_at: string | null
  last_sync_status: SyncStatus | null
  last_sync_error: string | null
  created_at: string
  updated_at: string
}

export type SearchConsoleBreakdownRow = {
  label: string
  clicks: number | null
  impressions: number | null
  ctr: number | null
  position_avg: number | null
}

export type SearchConsoleBreakdown = {
  project_id: number
  date_from: string | null
  date_to: string | null
  connected: boolean
  properties: Array<{
    id: number
    property_url: string
    last_synced_at: string | null
    last_sync_status: SyncStatus | null
    last_sync_error: string | null
  }>
  totals: {
    clicks: number | null
    impressions: number | null
    ctr: number | null
    position_avg: number | null
    rows: number | null
  } | null
  queries: SearchConsoleBreakdownRow[]
  pages: SearchConsoleBreakdownRow[]
}

export { CONTENT_SOURCE_TYPES }

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function mapSource(row: Record<string, unknown>): ProjectCompetitiveContentSource {
  return {
    ...(row as unknown as ProjectCompetitiveContentSource),
    include_paths: asStringArray(row.include_paths),
    exclude_paths: asStringArray(row.exclude_paths),
    discovery_signals: Array.isArray(row.discovery_signals) ? row.discovery_signals : [],
  }
}

export async function listProjectCompetitiveWebsites(
  projectId: number,
): Promise<ProjectCompetitiveWebsite[]> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("project_competitive_websites")
    .select("*")
    .eq("project_id", projectId)
    .order("entity_type", { ascending: true })
    .order("normalized_domain", { ascending: true })

  if (error) throw error
  return (data ?? []) as ProjectCompetitiveWebsite[]
}

export async function ensureOwnedWebsiteFromProjectUrl(args: {
  projectId: number
  projectUrl: string | null | undefined
}): Promise<ProjectCompetitiveWebsite | null> {
  assertOwnedFlagsImmutable({})
  const rootUrl = normalizeHttpUrl(args.projectUrl)
  const domain = normalizeDomain(args.projectUrl)
  if (!rootUrl || !domain) return null

  const supabase = createClientComponentClient()
  const existing = await listProjectCompetitiveWebsites(args.projectId)
  const owned = existing.find(
    (row) => row.entity_type === "owned" && row.normalized_domain === domain,
  )
  if (owned) return owned

  const { data, error } = await supabase
    .from("project_competitive_websites")
    .insert({
      project_id: args.projectId,
      entity_type: "owned",
      competitor_id: null,
      root_url: rootUrl,
      normalized_domain: domain,
      is_active: true,
    })
    .select("*")
    .single()

  if (error) throw error
  return data as ProjectCompetitiveWebsite
}

/**
 * Owned-side twin of `monitorCompetitorWebsiteByUrl`: register the project's own
 * website, confirm the editorial sections we detect (falling back to the root
 * URL) and start the article sync, so our own articles show up next to
 * competitor articles without any extra setup step.
 */
export async function monitorOwnedWebsiteFromProject(args: {
  projectId: number
  projectUrl?: string | null
}): Promise<{
  websiteId: number
  sourceIds: number[]
  discover: CompetitiveContentSyncResult
  sync: CompetitiveContentSyncResult
} | null> {
  const projectUrl =
    args.projectUrl ?? (await getProjectWebsiteUrl(args.projectId))
  const website = await ensureOwnedWebsiteFromProjectUrl({
    projectId: args.projectId,
    projectUrl,
  })
  if (!website) return null

  const discover = await discoverEditorialSources({
    projectId: args.projectId,
    websiteId: website.id,
  })

  const sources = await listProjectCompetitiveSources(args.projectId)
  const websiteSources = sources.filter((source) => source.website_id === website.id)
  const sourceIds: number[] = []

  for (const source of websiteSources) {
    if (source.status === "suggested" || source.status === "ignored") {
      await updateContentSource(source.id, { status: "confirmed" })
    }
    sourceIds.push(source.id)
  }

  if (sourceIds.length === 0) {
    const manual = await createManualContentSource({
      projectId: args.projectId,
      websiteId: website.id,
      entityType: "owned",
      sourceUrl: website.root_url,
      sourceType: "blog",
    })
    sourceIds.push(manual.id)
  }

  const sync = await syncCompetitiveContent({
    projectId: args.projectId,
    websiteId: website.id,
    runType: "article_sync",
  })

  // Keywords are a separate job; without this pass the Content tab stays empty.
  await syncCompetitiveContent({
    projectId: args.projectId,
    websiteId: website.id,
    runType: "keyword_extraction",
  }).catch((error) => {
    console.warn("Owned website keyword extraction failed", error)
  })

  return { websiteId: website.id, sourceIds, discover, sync }
}

/**
 * One-click competitor content monitoring: create/find competitor from URL,
 * attach website, discover+confirm editorial sources (or fall back to root URL),
 * then kick off article sync.
 */
export async function monitorCompetitorWebsiteByUrl(args: {
  projectId: number
  websiteUrl: string
  competitorName?: string | null
}): Promise<{
  competitorId: number
  websiteId: number
  sourceIds: number[]
  discover: CompetitiveContentSyncResult
  sync: CompetitiveContentSyncResult
}> {
  const rootUrl = normalizeHttpUrl(args.websiteUrl)
  const domain = normalizeDomain(args.websiteUrl)
  if (!rootUrl || !domain) throw new Error("Invalid website URL")

  const name =
    args.competitorName?.trim() ||
    domain.replace(/^www\./, "").split(".")[0]?.replace(/-/g, " ") ||
    domain

  const existingCompetitors = await listProjectCompetitors(args.projectId)
  const existing =
    existingCompetitors.find(
      (row) =>
        normalizeDomain(row.website_url) === domain ||
        row.name.trim().toLowerCase() === name.toLowerCase(),
    ) ?? null

  let competitorId: number
  if (!existing) {
    const created = await createProjectCompetitor({
      projectId: args.projectId,
      name: name.charAt(0).toUpperCase() + name.slice(1),
      websiteUrl: rootUrl,
    })
    competitorId = created.id
  } else {
    competitorId = existing.id
    if (!existing.website_url) {
      await updateProjectCompetitor({ competitorId, websiteUrl: rootUrl })
    }
  }

  const websites = await listProjectCompetitiveWebsites(args.projectId)
  const website =
    websites.find(
      (row) =>
        row.entity_type === "competitor" &&
        row.competitor_id === competitorId &&
        row.normalized_domain === domain,
    ) ??
    (await createCompetitiveWebsite({
      projectId: args.projectId,
      entityType: "competitor",
      competitorId,
      rootUrl,
    }))

  const discover = await discoverEditorialSources({
    projectId: args.projectId,
    websiteId: website.id,
  })

  // Refresh sources and auto-confirm anything discovered for this website
  const sources = await listProjectCompetitiveSources(args.projectId)
  const websiteSources = sources.filter((source) => source.website_id === website.id)
  const sourceIds: number[] = []

  for (const source of websiteSources) {
    if (source.status === "suggested" || source.status === "ignored") {
      await updateContentSource(source.id, { status: "confirmed" })
    }
    sourceIds.push(source.id)
  }

  if (sourceIds.length === 0) {
    const manual = await createManualContentSource({
      projectId: args.projectId,
      websiteId: website.id,
      entityType: "competitor",
      competitorId,
      sourceUrl: rootUrl,
      sourceType: "blog",
    })
    sourceIds.push(manual.id)
  }

  const sync = await syncCompetitiveContent({
    projectId: args.projectId,
    websiteId: website.id,
    runType: "article_sync",
  })

  return {
    competitorId,
    websiteId: website.id,
    sourceIds,
    discover,
    sync,
  }
}

/**
 * Single add action for a competitor: one URL creates the competitor, starts
 * content monitoring, and links the social profiles the site advertises.
 * A social discovery failure never invalidates the created competitor.
 */
export async function addCompetitorFromUrl(args: {
  projectId: number
  websiteUrl: string
  competitorName?: string | null
}): Promise<{
  competitorId: number
  socialProfilesCreated: number
  socialSyncStarted: boolean
  socialError: string | null
  content: Awaited<ReturnType<typeof monitorCompetitorWebsiteByUrl>>
}> {
  const content = await monitorCompetitorWebsiteByUrl(args)

  let socialProfilesCreated = 0
  let socialSyncStarted = false
  let socialError: string | null = null
  try {
    const social = await discoverCompetitorSocialProfilesFromWebsite({
      projectId: args.projectId,
      competitorId: content.competitorId,
      websiteUrl: args.websiteUrl,
    })
    socialProfilesCreated = social.created
    socialSyncStarted = social.sync.started
    socialError = social.sync.error
  } catch (error) {
    socialError = error instanceof Error ? error.message : "Social discovery failed"
  }

  return {
    competitorId: content.competitorId,
    socialProfilesCreated,
    socialSyncStarted,
    socialError,
    content,
  }
}

export async function createCompetitiveWebsite(args: {
  projectId: number
  entityType: "owned" | "competitor"
  competitorId?: number | null
  rootUrl: string
  marketCode?: string | null
  defaultLanguageCode?: string | null
  includeSubdomains?: boolean
}): Promise<ProjectCompetitiveWebsite> {
  assertOwnedFlagsImmutable({})
  if (args.entityType === "competitor" && !args.competitorId) {
    throw new Error("competitorId is required for competitor websites")
  }
  if (args.entityType === "owned" && args.competitorId) {
    throw new Error("owned websites cannot reference a competitor")
  }

  const rootUrl = normalizeHttpUrl(args.rootUrl)
  const domain = normalizeDomain(args.rootUrl)
  if (!rootUrl || !domain) throw new Error("Invalid website URL")

  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("project_competitive_websites")
    .insert({
      project_id: args.projectId,
      entity_type: args.entityType,
      competitor_id: args.entityType === "competitor" ? args.competitorId : null,
      root_url: rootUrl,
      normalized_domain: domain,
      market_code: args.marketCode ?? null,
      default_language_code: args.defaultLanguageCode ?? null,
      include_subdomains: args.includeSubdomains ?? false,
      is_active: true,
    })
    .select("*")
    .single()

  if (error) throw error
  return data as ProjectCompetitiveWebsite
}

export async function updateCompetitiveWebsite(
  websiteId: number,
  patch: Partial<{
    root_url: string
    market_code: string | null
    default_language_code: string | null
    include_subdomains: boolean
    is_active: boolean
  }>,
): Promise<ProjectCompetitiveWebsite> {
  const supabase = createClientComponentClient()
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.root_url !== undefined) {
    const rootUrl = normalizeHttpUrl(patch.root_url)
    const domain = normalizeDomain(patch.root_url)
    if (!rootUrl || !domain) throw new Error("Invalid website URL")
    payload.root_url = rootUrl
    payload.normalized_domain = domain
  }
  if (patch.market_code !== undefined) payload.market_code = patch.market_code
  if (patch.default_language_code !== undefined) {
    payload.default_language_code = patch.default_language_code
  }
  if (patch.include_subdomains !== undefined) {
    payload.include_subdomains = patch.include_subdomains
  }
  if (patch.is_active !== undefined) payload.is_active = patch.is_active

  const { data, error } = await supabase
    .from("project_competitive_websites")
    .update(payload)
    .eq("id", websiteId)
    .select("*")
    .single()

  if (error) throw error
  return data as ProjectCompetitiveWebsite
}

export async function deleteCompetitiveWebsite(websiteId: number): Promise<void> {
  const supabase = createClientComponentClient()
  const { error } = await supabase
    .from("project_competitive_websites")
    .delete()
    .eq("id", websiteId)
  if (error) throw error
}

export async function listProjectCompetitiveSources(
  projectId: number,
): Promise<ProjectCompetitiveContentSource[]> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("project_competitive_content_sources")
    .select("*")
    .eq("project_id", projectId)
    .order("status", { ascending: true })
    .order("discovery_confidence", { ascending: false, nullsFirst: false })

  if (error) throw error
  return (data ?? []).map((row) => mapSource(row as Record<string, unknown>))
}

export async function createManualContentSource(args: {
  projectId: number
  websiteId: number
  entityType: "owned" | "competitor"
  competitorId?: number | null
  sourceUrl: string
  sourceType?: ContentSourceType
  languageCode?: string | null
  includePaths?: string[]
  excludePaths?: string[]
}): Promise<ProjectCompetitiveContentSource> {
  assertOwnedFlagsImmutable({})
  const sourceUrl = normalizeHttpUrl(args.sourceUrl)
  if (!sourceUrl) throw new Error("Invalid source URL")

  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("project_competitive_content_sources")
    .insert({
      project_id: args.projectId,
      website_id: args.websiteId,
      entity_type: args.entityType,
      competitor_id: args.entityType === "competitor" ? args.competitorId ?? null : null,
      source_url: sourceUrl,
      normalized_source_url: sourceUrl,
      source_type: args.sourceType ?? "other",
      language_code: args.languageCode ?? null,
      include_paths: args.includePaths ?? [],
      exclude_paths: args.excludePaths ?? [],
      discovery_method: "manual",
      discovery_confidence: 1,
      discovery_signals: [{ code: "manual", weight: 1 }],
      status: "confirmed",
      is_manual_override: true,
      last_discovered_at: new Date().toISOString(),
    })
    .select("*")
    .single()

  if (error) throw error
  return mapSource(data as Record<string, unknown>)
}

export async function updateContentSource(
  sourceId: number,
  patch: Partial<{
    status: ContentSourceStatus
    source_type: ContentSourceType
    language_code: string | null
    source_url: string
    include_paths: string[]
    exclude_paths: string[]
    is_manual_override: boolean
  }>,
): Promise<ProjectCompetitiveContentSource> {
  const supabase = createClientComponentClient()
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    is_manual_override: patch.is_manual_override ?? true,
  }

  if (patch.status !== undefined) payload.status = patch.status
  if (patch.source_type !== undefined) payload.source_type = patch.source_type
  if (patch.language_code !== undefined) payload.language_code = patch.language_code
  if (patch.include_paths !== undefined) payload.include_paths = patch.include_paths
  if (patch.exclude_paths !== undefined) payload.exclude_paths = patch.exclude_paths
  if (patch.source_url !== undefined) {
    const sourceUrl = normalizeHttpUrl(patch.source_url)
    if (!sourceUrl) throw new Error("Invalid source URL")
    payload.source_url = sourceUrl
    payload.normalized_source_url = sourceUrl
  }

  const { data, error } = await supabase
    .from("project_competitive_content_sources")
    .update(payload)
    .eq("id", sourceId)
    .select("*")
    .single()

  if (error) throw error
  return mapSource(data as Record<string, unknown>)
}

export async function listProjectCompetitiveArticles(args: {
  projectId: number
  dateFrom?: string | null
  dateTo?: string | null
  entityIds?: string[] | null
  languageCodes?: string[] | null
  sourceTypes?: string[] | null
  keywords?: string[] | null
  hasRanking?: boolean | null
  limit?: number
  offset?: number
}): Promise<ProjectCompetitiveArticle[]> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("fn_list_project_competitive_articles", {
    p_project_id: args.projectId,
    p_date_from: args.dateFrom ?? null,
    p_date_to: args.dateTo ?? null,
    p_entity_ids: args.entityIds ?? null,
    p_language_codes: args.languageCodes ?? null,
    p_source_types: args.sourceTypes ?? null,
    p_keywords: args.keywords ?? null,
    p_has_ranking: args.hasRanking ?? null,
    p_limit: args.limit ?? 100,
    p_offset: args.offset ?? 0,
  })

  if (error) throw error
  return (data ?? []) as ProjectCompetitiveArticle[]
}

function mapArticleImpactRow(row: Record<string, unknown>): ProjectCompetitiveArticleImpact {
  const parsedKeywords =
    typeof row.keywords === "string"
      ? (() => {
          try {
            return JSON.parse(row.keywords)
          } catch {
            return []
          }
        })()
      : row.keywords
  const rawKeywords = Array.isArray(parsedKeywords) ? parsedKeywords : []
  const keywords: ArticleKeywordMetric[] = rawKeywords
    .map((item) => {
      const record = item as Record<string, unknown>
      const keyword = typeof record.keyword === "string" ? record.keyword.trim() : ""
      if (!keyword) return null
      return {
        keyword,
        keyword_type: String(record.keyword_type ?? ""),
        search_volume:
          record.search_volume == null ? null : Number(record.search_volume),
        competition:
          record.competition == null ? null : Number(record.competition),
        ranking_position:
          record.ranking_position == null ? null : Number(record.ranking_position),
        clicks: record.clicks == null ? null : Number(record.clicks),
        impressions:
          record.impressions == null ? null : Number(record.impressions),
      }
    })
    .filter((item): item is ArticleKeywordMetric => Boolean(item))

  return {
    id: Number(row.id),
    project_id: Number(row.project_id),
    website_id: Number(row.website_id),
    content_source_id:
      row.content_source_id == null ? null : Number(row.content_source_id),
    entity_type: row.entity_type === "competitor" ? "competitor" : "owned",
    competitor_id: row.competitor_id == null ? null : Number(row.competitor_id),
    entity_id: String(row.entity_id ?? ""),
    entity_name: (row.entity_name as string | null) ?? null,
    is_owned: Boolean(row.is_owned),
    url: String(row.url ?? ""),
    canonical_url: String(row.canonical_url ?? row.url ?? ""),
    title: (row.title as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    language_code: (row.language_code as string | null) ?? null,
    published_at: (row.published_at as string | null) ?? null,
    modified_at: (row.modified_at as string | null) ?? null,
    image_url: (row.image_url as string | null) ?? null,
    primary_keyword: (row.primary_keyword as string | null) ?? null,
    content_source_type: (row.content_source_type as ContentSourceType | null) ?? null,
    first_seen_at: String(row.first_seen_at ?? ""),
    last_seen_at: String(row.last_seen_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    keywords,
    gsc_clicks: row.gsc_clicks == null ? null : Number(row.gsc_clicks),
    gsc_impressions:
      row.gsc_impressions == null ? null : Number(row.gsc_impressions),
    gsc_ctr: row.gsc_ctr == null ? null : Number(row.gsc_ctr),
    gsc_position: row.gsc_position == null ? null : Number(row.gsc_position),
    ga_sessions: row.ga_sessions == null ? null : Number(row.ga_sessions),
    ga_users: row.ga_users == null ? null : Number(row.ga_users),
    ga_pageviews: row.ga_pageviews == null ? null : Number(row.ga_pageviews),
    impact_score: row.impact_score == null ? null : Number(row.impact_score),
  }
}

export async function listProjectCompetitiveArticlesImpact(args: {
  projectId: number
  dateFrom?: string | null
  dateTo?: string | null
  metricDateFrom?: string | null
  metricDateTo?: string | null
  entityIds?: string[] | null
  sourceTypes?: string[] | null
  sort?: ArticleImpactSort
  limit?: number
  offset?: number
}): Promise<ProjectCompetitiveArticleImpact[]> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc(
    "fn_list_project_competitive_articles_impact",
    {
      p_project_id: args.projectId,
      p_date_from: args.dateFrom ?? null,
      p_date_to: args.dateTo ?? null,
      p_metric_date_from: args.metricDateFrom ?? null,
      p_metric_date_to: args.metricDateTo ?? null,
      p_entity_ids: args.entityIds ?? null,
      p_source_types: args.sourceTypes ?? null,
      p_sort: args.sort ?? "recent",
      p_limit: args.limit ?? 100,
      p_offset: args.offset ?? 0,
    },
  )

  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(mapArticleImpactRow)
}

export async function getProjectCompetitiveContentSummary(args: {
  projectId: number
  dateFrom?: string | null
  dateTo?: string | null
  entityIds?: string[] | null
  languageCodes?: string[] | null
  sourceTypes?: string[] | null
}): Promise<ContentCompetitiveSummary> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc(
    "fn_get_project_competitive_content_summary",
    {
      p_project_id: args.projectId,
      p_date_from: args.dateFrom ?? null,
      p_date_to: args.dateTo ?? null,
      p_entity_ids: args.entityIds ?? null,
      p_language_codes: args.languageCodes ?? null,
      p_source_types: args.sourceTypes ?? null,
    },
  )

  if (error) throw error
  return data as ContentCompetitiveSummary
}

export async function getProjectKeywordGap(args: {
  projectId: number
  dateFrom?: string | null
  dateTo?: string | null
  minVolume?: number
}): Promise<KeywordGapRow[]> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("fn_get_project_keyword_gap", {
    p_project_id: args.projectId,
    p_date_from: args.dateFrom ?? null,
    p_date_to: args.dateTo ?? null,
    p_min_volume: args.minVolume ?? 10,
  })

  if (error) throw error
  return (data ?? []) as KeywordGapRow[]
}

export async function getOwnedContentPerformance(args: {
  projectId: number
  dateFrom?: string | null
  dateTo?: string | null
}): Promise<OwnedContentPerformance> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("fn_get_owned_content_performance", {
    p_project_id: args.projectId,
    p_date_from: args.dateFrom ?? null,
    p_date_to: args.dateTo ?? null,
  })

  if (error) throw error
  return data as OwnedContentPerformance
}

export async function listSearchConsoleProperties(
  projectId: number,
): Promise<ProjectSearchConsoleProperty[]> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("project_search_console_properties")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })

  if (error) throw error
  return (data ?? []) as ProjectSearchConsoleProperty[]
}

export async function upsertSearchConsoleProperty(args: {
  projectId: number
  propertyUrl: string
  websiteId?: number | null
  siteType?: string | null
}): Promise<ProjectSearchConsoleProperty> {
  const propertyUrl = normalizeHttpUrl(args.propertyUrl) ?? args.propertyUrl.trim()
  if (!propertyUrl) throw new Error("Property URL is required")

  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("project_search_console_properties")
    .upsert(
      {
        project_id: args.projectId,
        property_url: propertyUrl,
        website_id: args.websiteId ?? null,
        site_type: args.siteType ?? null,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,property_url" },
    )
    .select("*")
    .single()

  if (error) throw error
  return data as ProjectSearchConsoleProperty
}

export async function getSearchConsoleBreakdown(args: {
  projectId: number
  dateFrom?: string | null
  dateTo?: string | null
  limit?: number
}): Promise<SearchConsoleBreakdown> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc(
    "fn_get_project_search_console_breakdown",
    {
      p_project_id: args.projectId,
      p_date_from: args.dateFrom ?? null,
      p_date_to: args.dateTo ?? null,
      p_limit: args.limit ?? 25,
    },
  )

  if (error) throw error
  return data as SearchConsoleBreakdown
}

export async function deleteSearchConsoleProperty(propertyId: number): Promise<void> {
  const supabase = createClientComponentClient()
  const { error } = await supabase
    .from("project_search_console_properties")
    .delete()
    .eq("id", propertyId)
  if (error) throw error
}

async function invokeEdgeFunction(
  name: string,
  body: Record<string, unknown>,
): Promise<CompetitiveContentSyncResult> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    return { ok: false, error: error.message }
  }
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {}
  return {
    ok: record.ok !== false,
    status: typeof record.status === "string" ? record.status : undefined,
    error: typeof record.error === "string" ? record.error : undefined,
    results: Array.isArray(record.results)
      ? (record.results as Array<Record<string, unknown>>)
      : undefined,
  }
}

export async function discoverEditorialSources(args: {
  projectId: number
  websiteId?: number
}): Promise<CompetitiveContentSyncResult> {
  return invokeEdgeFunction("discover-editorial-sources", {
    project_id: args.projectId,
    website_id: args.websiteId ?? null,
    trigger: "manual",
  })
}

export async function syncCompetitiveContent(args: {
  projectId: number
  websiteId?: number
  contentSourceId?: number
  runType?: "daily" | "weekly" | "article_sync" | "keyword_extraction" | "search_console_sync"
}): Promise<CompetitiveContentSyncResult> {
  return invokeEdgeFunction("sync-competitive-content", {
    project_id: args.projectId,
    website_id: args.websiteId ?? null,
    content_source_id: args.contentSourceId ?? null,
    run_type: args.runType ?? "daily",
    trigger: "manual",
  })
}
