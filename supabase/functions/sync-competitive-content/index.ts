import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  normalizeHttpUrl,
  normalizeKeywordKey,
  pathMatchesPatterns,
  simpleContentHash,
  type ContentEntityType,
} from "../_shared/competitive-content/helpers.ts"
import {
  FirecrawlClient,
  extractFeedLinks,
  extractSitemapLocs,
  fetchText,
} from "../_shared/firecrawl/client.ts"

/**
 * Secrets:
 * - FIRECRAWL_API_KEY
 * - COMPETITIVE_CONTENT_CRON_SECRET
 * - GSC_CLIENT_ID / GSC_CLIENT_SECRET (or GA_*); per-project refresh tokens in
 *   project_google_oauth_connections; optional platform GSC_REFRESH_TOKEN / GA_REFRESH_TOKEN fallback
 * - DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD (optional ranking)
 * - SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 *
 * POST body:
 * {
 *   project_id?: number
 *   website_id?: number
 *   content_source_id?: number
 *   run_type?: "daily" | "weekly" | "article_sync" | "keyword_extraction" | "search_console_sync"
 *   trigger: "manual" | "automatic"
 * }
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY") ?? ""
const FIRECRAWL_BASE_URL = (Deno.env.get("FIRECRAWL_BASE_URL") || "https://api.firecrawl.dev")
  .replace(/\/$/, "")
const COMPETITIVE_CONTENT_CRON_SECRET =
  Deno.env.get("COMPETITIVE_CONTENT_CRON_SECRET") ?? ""

const GSC_CLIENT_ID =
  Deno.env.get("GSC_CLIENT_ID") ?? Deno.env.get("GA_CLIENT_ID") ?? ""
const GSC_CLIENT_SECRET =
  Deno.env.get("GSC_CLIENT_SECRET") ?? Deno.env.get("GA_CLIENT_SECRET") ?? ""
const GSC_REFRESH_TOKEN =
  Deno.env.get("GSC_REFRESH_TOKEN") ?? Deno.env.get("GA_REFRESH_TOKEN") ?? ""

const DATAFORSEO_LOGIN = Deno.env.get("DATAFORSEO_LOGIN") ?? ""
const DATAFORSEO_PASSWORD = Deno.env.get("DATAFORSEO_PASSWORD") ?? ""

const DEFAULT_MAX_ARTICLES = 100
const REQUEST_BUDGET_MS = 130_000

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-competitive-content-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type ServiceClient = ReturnType<typeof createClient>
type SyncTrigger = "manual" | "automatic"
type RunType =
  | "daily"
  | "weekly"
  | "article_sync"
  | "keyword_extraction"
  | "search_console_sync"
  | "keyword_rank_sync"

type SourceRow = {
  id: number
  project_id: number
  website_id: number
  entity_type: ContentEntityType
  competitor_id: number | null
  source_url: string
  normalized_source_url: string
  source_type: string
  language_code: string | null
  sitemap_url: string | null
  feed_url: string | null
  include_paths: string[] | null
  exclude_paths: string[] | null
  status: string
  is_active?: boolean
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  })
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function toPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value)
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed)
  }
  return null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

async function assertManualAccess(args: {
  authorization: string | null
  projectIds: number[]
}): Promise<Response | null> {
  if (!args.authorization) return json({ ok: false, error: "missing authorization" }, 401)
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: args.authorization } },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ ok: false, error: "unauthorized" }, 401)

  for (const projectId of args.projectIds) {
    const { data, error } = await userClient.rpc("ai_assert_can_edit_project_v1", {
      p_project_id: projectId,
    })
    if (error || data === false) {
      return json({ ok: false, error: `forbidden for project ${projectId}` }, 403)
    }
  }
  return null
}

function isCronAuthorized(req: Request): boolean {
  const headerSecret = req.headers.get("x-competitive-content-sync-secret") ?? ""
  const auth = req.headers.get("authorization") ?? ""
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : ""
  if (COMPETITIVE_CONTENT_CRON_SECRET) {
    if (headerSecret === COMPETITIVE_CONTENT_CRON_SECRET) return true
    if (bearer === COMPETITIVE_CONTENT_CRON_SECRET) return true
  }
  if (bearer && bearer === SUPABASE_SERVICE_ROLE_KEY) return true
  return false
}

async function loadMaxArticles(service: ServiceClient): Promise<number> {
  const { data } = await service
    .from("app_runtime_settings")
    .select("value")
    .eq("key", "competitive_content_sync")
    .maybeSingle()
  const value = asRecord(data?.value) ?? {}
  return toPositiveInt(value.max_articles_per_source) ?? DEFAULT_MAX_ARTICLES
}

function articleAllowed(url: string, source: SourceRow): boolean {
  try {
    const article = new URL(url)
    const sourceUrl = new URL(source.normalized_source_url || source.source_url)
    if (
      article.hostname.replace(/^www\./, "") !==
      sourceUrl.hostname.replace(/^www\./, "")
    ) {
      return false
    }
    const include = asStringArray(source.include_paths)
    const exclude = asStringArray(source.exclude_paths)
    if (exclude.length > 0 && pathMatchesPatterns(article.pathname, exclude)) return false
    if (include.length > 0) return pathMatchesPatterns(article.pathname, include)
    const base = sourceUrl.pathname.replace(/\/$/, "") || "/"
    return article.pathname.startsWith(base)
  } catch {
    return false
  }
}

async function collectCandidateUrls(source: SourceRow, max: number): Promise<string[]> {
  const urls: string[] = []
  if (source.feed_url) {
    const xml = await fetchText(source.feed_url)
    if (xml) urls.push(...extractFeedLinks(xml))
  }
  if (source.sitemap_url) {
    const xml = await fetchText(source.sitemap_url)
    if (xml) urls.push(...extractSitemapLocs(xml).filter((u) => !/sitemap/i.test(u)))
  }

  // Fallback: try common feed under source
  if (urls.length === 0) {
    const origin = new URL(source.source_url).origin
    for (const candidate of [
      `${source.source_url.replace(/\/$/, "")}/feed`,
      `${origin}/feed`,
    ]) {
      const xml = await fetchText(candidate)
      if (xml && (xml.includes("<rss") || xml.includes("<feed"))) {
        urls.push(...extractFeedLinks(xml))
        break
      }
    }
  }

  return [...new Set(urls.map((u) => normalizeHttpUrl(u)).filter(Boolean) as string[])]
    .filter((u) => articleAllowed(u, source))
    .slice(0, max)
}

async function syncSourceArticles(args: {
  service: ServiceClient
  firecrawl: FirecrawlClient
  source: SourceRow
  maxArticles: number
  deadline: number
}): Promise<Record<string, unknown>> {
  const { service, firecrawl, source, maxArticles, deadline } = args
  const runInsert = await service
    .from("project_competitive_content_sync_runs")
    .insert({
      project_id: source.project_id,
      entity_type: source.entity_type,
      competitor_id: source.competitor_id,
      website_id: source.website_id,
      content_source_id: source.id,
      run_type: "article_sync",
      trigger_type: "manual",
      provider: "firecrawl",
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single()
  const runId = runInsert.data?.id as string | undefined

  let discovered = 0
  let created = 0
  let updated = 0
  let skipped = 0

  try {
    let candidateUrls = await collectCandidateUrls(source, maxArticles)

    if (candidateUrls.length === 0) {
      // Firecrawl map constrained to source URL
      const mapped = await firecrawl.mapUrl({
        url: source.source_url,
        limit: maxArticles,
        includeSubdomains: false,
      })
      candidateUrls = mapped.links
        .map((u) => normalizeHttpUrl(u))
        .filter((u): u is string => Boolean(u))
        .filter((u) => articleAllowed(u, source))
        .slice(0, maxArticles)
    }

    discovered = candidateUrls.length

    const { data: existingRows } = await service
      .from("project_competitive_content_articles")
      .select("id, canonical_url, content_hash")
      .eq("project_id", source.project_id)
      .eq("content_source_id", source.id)

    const existingByCanonical = new Map<string, { id: number; content_hash: string | null }>()
    for (const row of existingRows ?? []) {
      existingByCanonical.set(String(row.canonical_url), {
        id: Number(row.id),
        content_hash: row.content_hash == null ? null : String(row.content_hash),
      })
    }

    for (const url of candidateUrls) {
      if (Date.now() > deadline) break
      try {
        const scraped = await firecrawl.scrapeUrl({
          url,
          formats: ["markdown", "links"],
        })
        const canonical =
          normalizeHttpUrl(scraped.canonical) ??
          normalizeHttpUrl(scraped.url) ??
          url
        const hash = simpleContentHash([
          scraped.title,
          scraped.description,
          scraped.markdown?.slice(0, 4000),
        ])
        const existing = existingByCanonical.get(canonical)
        const payload = {
          project_id: source.project_id,
          website_id: source.website_id,
          content_source_id: source.id,
          entity_type: source.entity_type,
          competitor_id: source.competitor_id,
          url,
          canonical_url: canonical,
          title: scraped.title,
          description: scraped.description,
          author: scraped.author,
          language_code: scraped.language ?? source.language_code,
          published_at: scraped.publishedAt,
          modified_at: scraped.modifiedAt,
          image_url: scraped.imageUrl,
          page_type: "article",
          summary: scraped.description,
          content_markdown: scraped.markdown,
          markdown_excerpt: scraped.markdown?.slice(0, 2000) ?? null,
          content_hash: hash,
          schema_types: scraped.schemaTypes,
          metadata: scraped.metadata,
          raw_payload: { provider: "firecrawl" },
          is_active: true,
          last_seen_at: new Date().toISOString(),
          scraped_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        if (existing) {
          if (existing.content_hash === hash) {
            // Content unchanged, but still refresh dates/images when scrape found them.
            const touchPayload: Record<string, unknown> = {
              last_seen_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
            if (scraped.publishedAt) touchPayload.published_at = scraped.publishedAt
            if (scraped.modifiedAt) touchPayload.modified_at = scraped.modifiedAt
            if (scraped.imageUrl) touchPayload.image_url = scraped.imageUrl
            await service
              .from("project_competitive_content_articles")
              .update(touchPayload)
              .eq("id", existing.id)
            skipped += 1
          } else {
            await service
              .from("project_competitive_content_articles")
              .update({ ...payload, keywords_extracted_at: null })
              .eq("id", existing.id)
            updated += 1
          }
        } else {
          await service.from("project_competitive_content_articles").insert({
            ...payload,
            first_seen_at: new Date().toISOString(),
          })
          created += 1
        }
      } catch (error) {
        console.warn("article scrape failed", url, error)
        skipped += 1
      }
    }

    await service
      .from("project_competitive_content_sources")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: "succeeded",
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", source.id)

    if (runId) {
      await service
        .from("project_competitive_content_sync_runs")
        .update({
          status: "succeeded",
          completed_at: new Date().toISOString(),
          discovered_count: discovered,
          created_count: created,
          updated_count: updated,
          skipped_count: skipped,
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId)
    }

    return {
      content_source_id: source.id,
      status: "succeeded",
      discovered,
      created,
      updated,
      skipped,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await service
      .from("project_competitive_content_sources")
      .update({
        last_sync_status: "failed",
        last_sync_error: message.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", source.id)

    if (runId) {
      await service
        .from("project_competitive_content_sync_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: message.slice(0, 1000),
          discovered_count: discovered,
          created_count: created,
          updated_count: updated,
          skipped_count: skipped,
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId)
    }

    return {
      content_source_id: source.id,
      status: "failed",
      error: message,
    }
  }
}

function languageIdFromArticleCode(languageCode: string | null | undefined): string {
  const code = (languageCode ?? "").trim().toLowerCase().slice(0, 2)
  if (code === "pt") return "1014"
  if (code === "es") return "1003"
  if (code === "fr") return "1002"
  if (code === "de") return "1001"
  return "1000"
}

type KeywordIdeaRow = {
  keyword: string
  avgMonthlySearches?: number
  competitionIndex?: number
}

async function researchKeywordsForArticleUrl(args: {
  url: string
  languageCode?: string | null
}): Promise<KeywordIdeaRow[]> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/keyword-ideas`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "url",
      url: args.url,
      languageId: languageIdFromArticleCode(args.languageCode),
      // Default to Portugal geo to match product keyword research defaults.
      regionId: "2620",
      pageSize: 10,
    }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`keyword-ideas url mode failed (${response.status}): ${text.slice(0, 240)}`)
  }
  const json = await response.json()
  const results = Array.isArray(json?.results) ? json.results : []
  return results
    .map((item: Record<string, unknown>) => ({
      keyword: typeof item?.keyword === "string" ? item.keyword.trim() : "",
      avgMonthlySearches: Number(item?.avgMonthlySearches) || 0,
      competitionIndex: Number(item?.competitionIndex) || 0,
    }))
    .filter((item: KeywordIdeaRow) => Boolean(item.keyword))
    .sort(
      (a: KeywordIdeaRow, b: KeywordIdeaRow) =>
        (b.avgMonthlySearches ?? 0) - (a.avgMonthlySearches ?? 0),
    )
}

async function enrichKeywordsForProject(args: {
  service: ServiceClient
  projectId: number
  deadline: number
}): Promise<Record<string, unknown>> {
  const { service, projectId, deadline } = args
  // URL-mode Google Ads calls are slower; keep batches small per invocation.
  const { data: articles, error: listError } = await service
    .from("project_competitive_content_articles")
    .select(
      "id, project_id, entity_type, competitor_id, title, description, url, canonical_url, language_code, keywords_extracted_at",
    )
    .eq("project_id", projectId)
    .eq("is_active", true)
    .is("keywords_extracted_at", null)
    .order("id", { ascending: false })
    .limit(8)

  if (listError) {
    return { processed: 0, failed: 0, error: listError.message }
  }

  let processed = 0
  let failed = 0
  const errors: string[] = []

  for (const article of articles ?? []) {
    if (Date.now() > deadline) break
    const pageUrl = String(article.canonical_url || article.url || "").trim()
    if (!pageUrl) {
      failed += 1
      errors.push(`article ${article.id}: missing url`)
      continue
    }

    try {
      const ideas = await researchKeywordsForArticleUrl({
        url: pageUrl,
        languageCode: article.language_code as string | null,
      })

      if (ideas.length === 0) {
        throw new Error("keyword-ideas returned no results for URL")
      }

      const primary = ideas[0]!
      const secondary = ideas.slice(1, 6)

      await service
        .from("project_competitive_article_keywords")
        .delete()
        .eq("article_id", article.id)
        .in("keyword_type", ["inferred_primary", "inferred_secondary"])

      const nowIso = new Date().toISOString()
      const rows: Array<Record<string, unknown>> = [
        {
          project_id: projectId,
          article_id: article.id,
          entity_type: article.entity_type,
          competitor_id: article.competitor_id,
          keyword: primary.keyword,
          normalized_keyword: normalizeKeywordKey(primary.keyword),
          keyword_type: "inferred_primary",
          source: "keyword_research",
          language_code: article.language_code,
          search_volume: primary.avgMonthlySearches ?? null,
          competition: primary.competitionIndex ?? null,
          confidence: 0.85,
          first_seen_at: nowIso,
          last_seen_at: nowIso,
        },
        ...secondary.map((item) => ({
          project_id: projectId,
          article_id: article.id,
          entity_type: article.entity_type,
          competitor_id: article.competitor_id,
          keyword: item.keyword,
          normalized_keyword: normalizeKeywordKey(item.keyword),
          keyword_type: "inferred_secondary",
          source: "keyword_research",
          language_code: article.language_code,
          search_volume: item.avgMonthlySearches ?? null,
          competition: item.competitionIndex ?? null,
          confidence: 0.7,
          first_seen_at: nowIso,
          last_seen_at: nowIso,
        })),
      ]

      const { error: insertError } = await service
        .from("project_competitive_article_keywords")
        .insert(rows)
      if (insertError) throw new Error(`insert keywords: ${insertError.message}`)

      const { error: updateError } = await service
        .from("project_competitive_content_articles")
        .update({
          primary_keyword: primary.keyword,
          keywords_extracted_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", article.id)
      if (updateError) throw new Error(`update article: ${updateError.message}`)

      processed += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn("keyword extract failed", article.id, pageUrl, message)
      errors.push(`article ${article.id}: ${message.slice(0, 180)}`)
      failed += 1
    }
  }

  return { processed, failed, errors: errors.slice(0, 5) }
}

async function getProjectGoogleRefreshToken(
  service: ServiceClient,
  projectId: number,
): Promise<string | null> {
  const { data } = await service
    .from("project_google_oauth_connections")
    .select("refresh_token")
    .eq("project_id", projectId)
    .eq("status", "active")
    .maybeSingle()
  const token = typeof data?.refresh_token === "string" ? data.refresh_token.trim() : ""
  return token || null
}

async function getGoogleAccessToken(refreshToken: string): Promise<string | null> {
  if (!GSC_CLIENT_ID || !GSC_CLIENT_SECRET || !refreshToken) return null
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GSC_CLIENT_ID,
      client_secret: GSC_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) return null
  const data = await response.json()
  return typeof data.access_token === "string" ? data.access_token : null
}

async function syncSearchConsoleForProject(args: {
  service: ServiceClient
  projectId: number
}): Promise<Record<string, unknown>> {
  const { service, projectId } = args
  const projectRefreshToken = await getProjectGoogleRefreshToken(service, projectId)
  const refreshToken = projectRefreshToken || GSC_REFRESH_TOKEN
  const accessToken = await getGoogleAccessToken(refreshToken)
  if (!accessToken) {
    return {
      status: "skipped",
      reason: projectRefreshToken
        ? "Failed to refresh project Google OAuth token"
        : "GSC OAuth not configured (connect Google on the project, or set GSC_*/GA_* secrets)",
    }
  }

  const { data: properties } = await service
    .from("project_search_console_properties")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_active", true)

  if (!properties || properties.length === 0) {
    return { status: "skipped", reason: "no GSC property configured" }
  }

  const end = new Date()
  const start = new Date()
  start.setUTCDate(end.getUTCDate() - 28)
  const startDate = start.toISOString().slice(0, 10)
  const endDate = end.toISOString().slice(0, 10)

  let rowsUpserted = 0

  for (const property of properties) {
    const siteUrl = String(property.property_url)
    const apiUrl =
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["date", "page", "query"],
        rowLimit: 25000,
      }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!response.ok) {
      const text = await response.text()
      await service
        .from("project_search_console_properties")
        .update({
          last_sync_status: "failed",
          last_sync_error: text.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", property.id)
      continue
    }

    const payload = await response.json()
    const rows = Array.isArray(payload.rows) ? payload.rows : []

    const { data: articles } = await service
      .from("project_competitive_content_articles")
      .select("id, canonical_url, url")
      .eq("project_id", projectId)
      .eq("entity_type", "owned")
      .eq("is_active", true)

    const articleByCanonical = new Map<string, number>()
    for (const article of articles ?? []) {
      const key = normalizeHttpUrl(String(article.canonical_url ?? article.url))
      if (key) articleByCanonical.set(key, Number(article.id))
    }

    for (const row of rows) {
      const keys = Array.isArray(row.keys) ? row.keys : []
      const metricDate = String(keys[0] ?? "")
      const pageUrl = String(keys[1] ?? "")
      const queryText = String(keys[2] ?? "")
      if (!metricDate || !pageUrl || !queryText) continue
      const canonical = normalizeHttpUrl(pageUrl)
      const articleId = canonical ? articleByCanonical.get(canonical) ?? null : null

      const { error } = await service.from("project_search_console_page_query_daily").upsert(
        {
          project_id: projectId,
          property_id: property.id,
          article_id: articleId,
          metric_date: metricDate,
          page_url: pageUrl,
          canonical_url: canonical,
          query: queryText,
          clicks: row.clicks ?? null,
          impressions: row.impressions ?? null,
          ctr: row.ctr ?? null,
          position: row.position ?? null,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "property_id,metric_date,page_url,query,coalesce(country,),coalesce(device,)",
        },
      )

      // Unique index uses expression — upsert onConflict may not match.
      // Fallback: best-effort insert ignore duplicates.
      if (error) {
        await service.from("project_search_console_page_query_daily").insert({
          project_id: projectId,
          property_id: property.id,
          article_id: articleId,
          metric_date: metricDate,
          page_url: pageUrl,
          canonical_url: canonical,
          query: queryText,
          clicks: row.clicks ?? null,
          impressions: row.impressions ?? null,
          ctr: row.ctr ?? null,
          position: row.position ?? null,
        })
      } else {
        rowsUpserted += 1
      }

      // Also store as search_console_query keyword on article when matched
      if (articleId) {
        await service.from("project_competitive_article_keywords").upsert(
          {
            project_id: projectId,
            article_id: articleId,
            entity_type: "owned",
            competitor_id: null,
            keyword: queryText,
            normalized_keyword: normalizeKeywordKey(queryText),
            keyword_type: "search_console_query",
            source: "search_console",
            clicks: row.clicks ?? null,
            impressions: row.impressions ?? null,
            ctr: row.ctr ?? null,
            ranking_position: row.position ?? null,
            ranking_url: pageUrl,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "article_id,normalized_keyword,keyword_type,source" },
        )
      }
    }

    await service
      .from("project_search_console_properties")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: "succeeded",
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", property.id)
  }

  return { status: "succeeded", rows_upserted: rowsUpserted }
}

async function syncRankingsForProject(args: {
  service: ServiceClient
  projectId: number
  deadline: number
}): Promise<Record<string, unknown>> {
  if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
    return {
      status: "skipped",
      reason: "DATAFORSEO credentials not configured",
    }
  }

  const { service, projectId, deadline } = args
  const { data: articles } = await service
    .from("project_competitive_content_articles")
    .select("id, project_id, entity_type, competitor_id, canonical_url, url, primary_keyword")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .not("primary_keyword", "is", null)
    .order("ranking_synced_at", { ascending: true, nullsFirst: true })
    .limit(20)

  let processed = 0
  const auth = btoa(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`)

  for (const article of articles ?? []) {
    if (Date.now() > deadline) break
    const keyword = String(article.primary_keyword ?? "").trim()
    if (!keyword) continue

    try {
      // Use ranked keywords for URL when available; otherwise skip gracefully.
      const target = normalizeHttpUrl(String(article.canonical_url ?? article.url))
      if (!target) continue

      const response = await fetch(
        "https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live",
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([
            {
              target,
              language_name: "English",
              location_code: 2840,
              limit: 20,
            },
          ]),
          signal: AbortSignal.timeout(30_000),
        },
      )

      if (response.ok) {
        const payload = await response.json()
        const items =
          payload?.tasks?.[0]?.result?.[0]?.items ??
          payload?.tasks?.[0]?.result?.[0]?.items_count ??
          []
        const list = Array.isArray(items) ? items : []
        for (const item of list.slice(0, 20)) {
          const kw =
            item?.keyword_data?.keyword ??
            item?.keyword ??
            null
          const position =
            item?.ranked_serp_element?.serp_item?.rank_absolute ??
            item?.rank_group ??
            item?.rank_absolute ??
            null
          const volume =
            item?.keyword_data?.keyword_info?.search_volume ??
            item?.search_volume ??
            null
          if (!kw) continue
          await service.from("project_competitive_article_keywords").upsert(
            {
              project_id: projectId,
              article_id: article.id,
              entity_type: article.entity_type,
              competitor_id: article.competitor_id,
              keyword: String(kw),
              normalized_keyword: normalizeKeywordKey(String(kw)),
              keyword_type: "ranking",
              source: "dataforseo",
              search_volume: typeof volume === "number" ? volume : null,
              ranking_position: typeof position === "number" ? position : null,
              ranking_url: target,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: "article_id,normalized_keyword,keyword_type,source" },
          )
        }
      }

      await service
        .from("project_competitive_content_articles")
        .update({
          ranking_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", article.id)
      processed += 1
    } catch (error) {
      console.warn("ranking sync failed", article.id, error)
    }
  }

  return { status: "succeeded", processed }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405)

  const started = Date.now()
  const deadline = started + REQUEST_BUDGET_MS

  try {
    const body = asRecord(await req.json().catch(() => ({}))) ?? {}
    const trigger: SyncTrigger = body.trigger === "automatic" ? "automatic" : "manual"
    const projectId = toPositiveInt(body.project_id)
    const websiteId = toPositiveInt(body.website_id)
    const contentSourceId = toPositiveInt(body.content_source_id)
    const runType = (typeof body.run_type === "string" ? body.run_type : "daily") as RunType

    if (trigger === "automatic") {
      if (!isCronAuthorized(req)) return json({ ok: false, error: "unauthorized cron" }, 401)
    } else {
      if (!projectId) return json({ ok: false, error: "project_id required" }, 400)
      const denied = await assertManualAccess({
        authorization: req.headers.get("authorization"),
        projectIds: [projectId],
      })
      if (denied) return denied
    }

    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const results: Array<Record<string, unknown>> = []

    const doArticles =
      runType === "daily" || runType === "article_sync"
    const doKeywords =
      runType === "daily" || runType === "keyword_extraction"
    const doGsc =
      runType === "daily" || runType === "search_console_sync"
    const doRanks =
      runType === "weekly" || runType === "keyword_rank_sync"

    if (doArticles) {
      if (!FIRECRAWL_API_KEY) {
        return json({ ok: false, error: "FIRECRAWL_API_KEY not configured" }, 500)
      }
      const firecrawl = new FirecrawlClient(FIRECRAWL_API_KEY, FIRECRAWL_BASE_URL)
      const maxArticles = await loadMaxArticles(service)

      let query = service
        .from("project_competitive_content_sources")
        .select("*")
        .eq("status", "confirmed")

      if (projectId) query = query.eq("project_id", projectId)
      if (websiteId) query = query.eq("website_id", websiteId)
      if (contentSourceId) query = query.eq("id", contentSourceId)

      const { data: sources, error } = await query.limit(30)
      if (error) return json({ ok: false, error: error.message }, 500)

      const syncedWebsiteIds = new Set<number>()

      for (const source of (sources ?? []) as SourceRow[]) {
        if (Date.now() > deadline) break
        results.push({
          step: "article_sync",
          ...(await syncSourceArticles({
            service,
            firecrawl,
            source: {
              ...source,
              include_paths: asStringArray(source.include_paths),
              exclude_paths: asStringArray(source.exclude_paths),
            },
            maxArticles,
            deadline,
          })),
        })
        const sourceWebsiteId = toPositiveInt(source.website_id)
        if (sourceWebsiteId) syncedWebsiteIds.add(sourceWebsiteId)
      }

      if (syncedWebsiteIds.size > 0) {
        await service
          .from("project_competitive_websites")
          .update({
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .in("id", [...syncedWebsiteIds])
      }
    }

    if (doKeywords && projectId) {
      results.push({
        step: "keyword_extraction",
        ...(await enrichKeywordsForProject({ service, projectId, deadline })),
      })
    } else if (doKeywords && !projectId && trigger === "automatic") {
      const { data: projects } = await service
        .from("project_competitive_content_articles")
        .select("project_id")
        .is("keywords_extracted_at", null)
        .limit(20)
      const ids = [...new Set((projects ?? []).map((p) => Number(p.project_id)))]
      for (const id of ids) {
        if (Date.now() > deadline) break
        results.push({
          step: "keyword_extraction",
          project_id: id,
          ...(await enrichKeywordsForProject({ service, projectId: id, deadline })),
        })
      }
    }

    if (doGsc) {
      if (projectId) {
        results.push({
          step: "search_console_sync",
          ...(await syncSearchConsoleForProject({ service, projectId })),
        })
      } else if (trigger === "automatic") {
        const { data: props } = await service
          .from("project_search_console_properties")
          .select("project_id")
          .eq("is_active", true)
          .limit(30)
        const ids = [...new Set((props ?? []).map((p) => Number(p.project_id)))]
        for (const id of ids) {
          if (Date.now() > deadline) break
          results.push({
            step: "search_console_sync",
            project_id: id,
            ...(await syncSearchConsoleForProject({ service, projectId: id })),
          })
        }
      }
    }

    if (doRanks) {
      if (projectId) {
        results.push({
          step: "keyword_rank_sync",
          ...(await syncRankingsForProject({ service, projectId, deadline })),
        })
      } else if (trigger === "automatic") {
        const { data: rows } = await service
          .from("project_competitive_content_articles")
          .select("project_id")
          .eq("is_active", true)
          .not("primary_keyword", "is", null)
          .limit(50)
        const ids = [...new Set((rows ?? []).map((p) => Number(p.project_id)))]
        for (const id of ids) {
          if (Date.now() > deadline) break
          results.push({
            step: "keyword_rank_sync",
            project_id: id,
            ...(await syncRankingsForProject({ service, projectId: id, deadline })),
          })
        }
      }
    }

    const failed = results.filter((r) => r.status === "failed").length
    return json({
      ok: failed === 0,
      status: failed === 0 ? "succeeded" : "partial",
      run_type: runType,
      elapsed_ms: Date.now() - started,
      results,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json({ ok: false, error: message }, 500)
  }
})
