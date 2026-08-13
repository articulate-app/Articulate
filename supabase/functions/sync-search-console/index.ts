import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  addDaysUTC,
  chunkDateRange,
  classifyIndexInspection,
  isoDateUTC,
  normalizeHttpUrl,
  type GscSearchAnalyticsRow,
} from "../_shared/search-console/helpers.ts"

/**
 * Secrets:
 * - GSC_CLIENT_ID / GSC_CLIENT_SECRET (or GA_*)
 * - Optional platform GSC_REFRESH_TOKEN / GA_REFRESH_TOKEN fallback
 * - SEARCH_CONSOLE_CRON_SECRET (optional; falls back to COMPETITIVE_CONTENT_CRON_SECRET)
 * - SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 *
 * POST body:
 * {
 *   project_id: number
 *   job_type?: "performance" | "backfill" | "sitemaps" | "url_inspection" | "all"
 *   trigger?: "manual" | "automatic" | "oauth_connect"
 *   search_type?: string
 *   date_from?: string
 *   date_to?: string
 *   recent_window_days?: number
 *   inspection_limit?: number
 * }
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const CRON_SECRET =
  Deno.env.get("SEARCH_CONSOLE_CRON_SECRET")
  ?? Deno.env.get("COMPETITIVE_CONTENT_CRON_SECRET")
  ?? ""

const GSC_CLIENT_ID =
  Deno.env.get("GSC_CLIENT_ID") ?? Deno.env.get("GA_CLIENT_ID") ?? ""
const GSC_CLIENT_SECRET =
  Deno.env.get("GSC_CLIENT_SECRET") ?? Deno.env.get("GA_CLIENT_SECRET") ?? ""
const GSC_REFRESH_TOKEN =
  Deno.env.get("GSC_REFRESH_TOKEN") ?? Deno.env.get("GA_REFRESH_TOKEN") ?? ""

const REQUEST_BUDGET_MS = 130_000
const DEFAULT_RECENT_WINDOW_DAYS = 3
const DEFAULT_BACKFILL_CHUNK_DAYS = 28
const DEFAULT_INSPECTION_LIMIT = 10
const MAX_ROW_LIMIT = 25000

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-search-console-sync-secret, x-competitive-content-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type ServiceClient = ReturnType<typeof createClient>
type JobType =
  | "performance"
  | "backfill"
  | "sitemaps"
  | "url_inspection"
  | "all"
type Trigger = "manual" | "automatic" | "oauth_connect"

type PropertyRow = {
  id: number
  project_id: number
  property_url: string
  site_type: string | null
  earliest_metric_date: string | null
  latest_metric_date: string | null
  backfill_status: string | null
  backfill_progress: Record<string, unknown> | null
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

async function getProjectGoogleConnection(
  service: ServiceClient,
  projectId: number,
): Promise<{
  refresh_token: string | null
  access_token: string | null
  access_token_expires_at: string | null
} | null> {
  const { data } = await service
    .from("project_google_oauth_connections")
    .select("refresh_token, access_token, access_token_expires_at")
    .eq("project_id", projectId)
    .eq("status", "active")
    .maybeSingle()
  if (!data) return null
  return {
    refresh_token:
      typeof data.refresh_token === "string" ? data.refresh_token.trim() : null,
    access_token:
      typeof data.access_token === "string" ? data.access_token.trim() : null,
    access_token_expires_at:
      typeof data.access_token_expires_at === "string"
        ? data.access_token_expires_at
        : null,
  }
}

async function getGoogleAccessToken(refreshToken: string): Promise<{
  token: string | null
  error: string | null
}> {
  if (!GSC_CLIENT_ID || !GSC_CLIENT_SECRET) {
    return {
      token: null,
      error: "GA_CLIENT_ID/GA_CLIENT_SECRET (or GSC_*) missing on edge function",
    }
  }
  if (!refreshToken) {
    return { token: null, error: "Missing Google refresh token" }
  }
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
  const data = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    const detail =
      typeof data.error_description === "string"
        ? data.error_description
        : typeof data.error === "string"
          ? data.error
          : `HTTP ${response.status}`
    console.warn("GSC token refresh failed", detail)
    return { token: null, error: `Failed to refresh Google token: ${detail}` }
  }
  const token = typeof data.access_token === "string" ? data.access_token : null
  return {
    token,
    error: token ? null : "Google token response missing access_token",
  }
}

async function createSyncRun(
  service: ServiceClient,
  args: {
    projectId: number
    propertyId: number | null
    jobType: string
    trigger: Trigger
    dateFrom?: string | null
    dateTo?: string | null
    searchType: string
  },
): Promise<number | null> {
  const { data, error } = await service
    .from("project_search_console_sync_runs")
    .insert({
      project_id: args.projectId,
      property_id: args.propertyId,
      job_type: args.jobType,
      status: "running",
      run_trigger: args.trigger,
      requested_date_from: args.dateFrom ?? null,
      requested_date_to: args.dateTo ?? null,
      search_type: args.searchType,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single()
  if (error) {
    console.warn("createSyncRun failed", error.message)
    return null
  }
  return Number(data.id)
}

async function finishSyncRun(
  service: ServiceClient,
  runId: number | null,
  patch: Record<string, unknown>,
) {
  if (!runId) return
  await service
    .from("project_search_console_sync_runs")
    .update({
      ...patch,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
}

async function querySearchAnalytics(args: {
  accessToken: string
  siteUrl: string
  startDate: string
  endDate: string
  dimensions: string[]
  searchType: string
  startRow?: number
}): Promise<{ rows: GscSearchAnalyticsRow[]; responseOk: boolean; errorText?: string; isPartial: boolean }> {
  const apiUrl =
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(args.siteUrl)}/searchAnalytics/query`

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate: args.startDate,
      endDate: args.endDate,
      dimensions: args.dimensions,
      searchType: args.searchType,
      rowLimit: MAX_ROW_LIMIT,
      startRow: args.startRow ?? 0,
      aggregationType: "auto",
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!response.ok) {
    return {
      rows: [],
      responseOk: false,
      errorText: (await response.text()).slice(0, 500),
      isPartial: false,
    }
  }

  const payload = await response.json()
  const rows = Array.isArray(payload.rows) ? payload.rows as GscSearchAnalyticsRow[] : []
  return {
    rows,
    responseOk: true,
    isPartial: rows.length >= MAX_ROW_LIMIT,
  }
}

async function upsertMetricRows(
  service: ServiceClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0
  let updated = 0
  const batchSize = 200
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error, count } = await service
      .from(table)
      .upsert(batch, { onConflict, count: "exact" })
    if (error) {
      console.warn(`upsert ${table} failed`, error.message)
      continue
    }
    inserted += count ?? batch.length
    updated += 0
  }
  return { inserted, updated }
}

async function loadSitePageMap(
  service: ServiceClient,
  projectId: number,
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  const { data } = await service
    .from("project_site_pages")
    .select("id, url, canonical_url")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .limit(5000)

  for (const page of data ?? []) {
    const canonical = normalizeHttpUrl(String(page.canonical_url ?? page.url ?? ""))
    const url = normalizeHttpUrl(String(page.url ?? ""))
    if (canonical) map.set(canonical, Number(page.id))
    if (url) map.set(url, Number(page.id))
  }
  return map
}

async function syncPerformanceWindow(args: {
  service: ServiceClient
  projectId: number
  property: PropertyRow
  accessToken: string
  startDate: string
  endDate: string
  searchType: string
  sitePageMap: Map<string, number>
}): Promise<{
  rowsReceived: number
  rowsInserted: number
  isPartial: boolean
  errorText?: string
  minDate: string | null
  maxDate: string | null
}> {
  const {
    service,
    projectId,
    property,
    accessToken,
    startDate,
    endDate,
    searchType,
    sitePageMap,
  } = args

  let rowsReceived = 0
  let rowsInserted = 0
  let isPartial = false
  let minDate: string | null = null
  let maxDate: string | null = null

  // Property daily
  {
    const result = await querySearchAnalytics({
      accessToken,
      siteUrl: property.property_url,
      startDate,
      endDate,
      dimensions: ["date"],
      searchType,
    })
    if (!result.responseOk) {
      return {
        rowsReceived: 0,
        rowsInserted: 0,
        isPartial: false,
        errorText: result.errorText,
        minDate: null,
        maxDate: null,
      }
    }
    isPartial = isPartial || result.isPartial
    rowsReceived += result.rows.length
    const upserts = result.rows.map((row) => {
      const metricDate = String(row.keys?.[0] ?? "")
      if (metricDate) {
        if (!minDate || metricDate < minDate) minDate = metricDate
        if (!maxDate || metricDate > maxDate) maxDate = metricDate
      }
      return {
        project_id: projectId,
        property_id: property.id,
        metric_date: metricDate,
        search_type: searchType,
        aggregation_type: "auto",
        country: "",
        device: "",
        clicks: row.clicks ?? null,
        impressions: row.impressions ?? null,
        ctr: row.ctr ?? null,
        position: row.position ?? null,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    }).filter((r) => r.metric_date)

    const stats = await upsertMetricRows(
      service,
      "project_search_console_property_daily",
      upserts,
      "property_id,metric_date,search_type,country,device,aggregation_type",
    )
    rowsInserted += stats.inserted
  }

  // Query daily
  {
    let startRow = 0
    for (let page = 0; page < 4; page += 1) {
      const result = await querySearchAnalytics({
        accessToken,
        siteUrl: property.property_url,
        startDate,
        endDate,
        dimensions: ["date", "query"],
        searchType,
        startRow,
      })
      if (!result.responseOk) break
      isPartial = isPartial || result.isPartial
      rowsReceived += result.rows.length
      const upserts = result.rows.map((row) => {
        const metricDate = String(row.keys?.[0] ?? "")
        const query = String(row.keys?.[1] ?? "")
        return {
          project_id: projectId,
          property_id: property.id,
          metric_date: metricDate,
          query,
          search_type: searchType,
          aggregation_type: "auto",
          country: "",
          device: "",
          clicks: row.clicks ?? null,
          impressions: row.impressions ?? null,
          ctr: row.ctr ?? null,
          position: row.position ?? null,
          first_seen_at: metricDate || null,
          last_seen_at: metricDate || null,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      }).filter((r) => r.metric_date && r.query)

      const stats = await upsertMetricRows(
        service,
        "project_search_console_query_daily",
        upserts,
        "property_id,metric_date,query,search_type,country,device,aggregation_type",
      )
      rowsInserted += stats.inserted
      if (!result.isPartial) break
      startRow += MAX_ROW_LIMIT
    }
  }

  // Page daily
  {
    let startRow = 0
    for (let page = 0; page < 4; page += 1) {
      const result = await querySearchAnalytics({
        accessToken,
        siteUrl: property.property_url,
        startDate,
        endDate,
        dimensions: ["date", "page"],
        searchType,
        startRow,
      })
      if (!result.responseOk) break
      isPartial = isPartial || result.isPartial
      rowsReceived += result.rows.length
      const upserts = result.rows.map((row) => {
        const metricDate = String(row.keys?.[0] ?? "")
        const pageUrl = String(row.keys?.[1] ?? "")
        const canonical = normalizeHttpUrl(pageUrl)
        return {
          project_id: projectId,
          property_id: property.id,
          site_page_id: canonical ? sitePageMap.get(canonical) ?? null : null,
          metric_date: metricDate,
          page_url: pageUrl,
          canonical_url: canonical,
          search_type: searchType,
          aggregation_type: "auto",
          country: "",
          device: "",
          clicks: row.clicks ?? null,
          impressions: row.impressions ?? null,
          ctr: row.ctr ?? null,
          position: row.position ?? null,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      }).filter((r) => r.metric_date && r.page_url)

      const stats = await upsertMetricRows(
        service,
        "project_search_console_page_daily",
        upserts,
        "property_id,metric_date,page_url,search_type,country,device,aggregation_type",
      )
      rowsInserted += stats.inserted
      if (!result.isPartial) break
      startRow += MAX_ROW_LIMIT
    }
  }

  // Page × query (partial by API design)
  {
    let startRow = 0
    for (let page = 0; page < 4; page += 1) {
      const result = await querySearchAnalytics({
        accessToken,
        siteUrl: property.property_url,
        startDate,
        endDate,
        dimensions: ["date", "page", "query"],
        searchType,
        startRow,
      })
      if (!result.responseOk) break
      // Page×query rows are inherently sampled in GSC; that is row-level
      // (is_partial on each upsert), not a reason to leave the whole backfill
      // stuck in "partial" forever.
      isPartial = isPartial || result.isPartial
      rowsReceived += result.rows.length

      for (const row of result.rows) {
        const keys = Array.isArray(row.keys) ? row.keys : []
        const metricDate = String(keys[0] ?? "")
        const pageUrl = String(keys[1] ?? "")
        const queryText = String(keys[2] ?? "")
        if (!metricDate || !pageUrl || !queryText) continue
        const canonical = normalizeHttpUrl(pageUrl)
        const payload = {
          project_id: projectId,
          property_id: property.id,
          site_page_id: canonical ? sitePageMap.get(canonical) ?? null : null,
          metric_date: metricDate,
          page_url: pageUrl,
          canonical_url: canonical,
          query: queryText,
          search_type: searchType,
          aggregation_type: "auto",
          clicks: row.clicks ?? null,
          impressions: row.impressions ?? null,
          ctr: row.ctr ?? null,
          position: row.position ?? null,
          is_partial: true,
          updated_at: new Date().toISOString(),
        }
        const { error } = await service
          .from("project_search_console_page_query_daily")
          .upsert(payload, {
            onConflict: "property_id,metric_date,page_url,query,coalesce(country,),coalesce(device,)",
          })
        if (error) {
          await service.from("project_search_console_page_query_daily").insert(payload)
        } else {
          rowsInserted += 1
        }
      }
      if (!result.isPartial) break
      startRow += MAX_ROW_LIMIT
    }
  }

  return { rowsReceived, rowsInserted, isPartial, minDate, maxDate }
}

async function syncSitemaps(args: {
  service: ServiceClient
  projectId: number
  property: PropertyRow
  accessToken: string
}): Promise<Record<string, unknown>> {
  const { service, projectId, property, accessToken } = args
  const apiUrl =
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property.property_url)}/sitemaps`

  const response = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    return { status: "failed", error: (await response.text()).slice(0, 500) }
  }

  const payload = await response.json()
  const sitemaps = Array.isArray(payload.sitemap) ? payload.sitemap : []
  let upserted = 0

  for (const sitemap of sitemaps) {
    const path = String(sitemap.path ?? "")
    if (!path) continue
    const contents = Array.isArray(sitemap.contents) ? sitemap.contents : []
    // Intentionally ignore deprecated indexed URL counts from sitemap resource.
    const { error } = await service.from("project_search_console_sitemaps").upsert(
      {
        project_id: projectId,
        property_id: property.id,
        path,
        sitemap_type: typeof sitemap.type === "string" ? sitemap.type : null,
        is_pending: Boolean(sitemap.isPending),
        is_sitemap_index: Boolean(sitemap.isSitemapsIndex),
        last_submitted_at: sitemap.lastSubmitted ?? null,
        last_downloaded_at: sitemap.lastDownloaded ?? null,
        submitted_urls_count: typeof sitemap.contents?.[0]?.submitted === "number"
          ? sitemap.contents[0].submitted
          : null,
        warnings_count: typeof sitemap.warnings === "string" || typeof sitemap.warnings === "number"
          ? Number(sitemap.warnings)
          : null,
        errors_count: typeof sitemap.errors === "string" || typeof sitemap.errors === "number"
          ? Number(sitemap.errors)
          : null,
        contents,
        raw_payload: sitemap,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "property_id,path" },
    )
    if (!error) upserted += 1
  }

  return { status: "completed", upserted, count: sitemaps.length }
}

async function inspectQueuedUrls(args: {
  service: ServiceClient
  projectId: number
  property: PropertyRow
  accessToken: string
  limit: number
  deadline: number
}): Promise<Record<string, unknown>> {
  const { service, projectId, property, accessToken, limit, deadline } = args

  // Seed queue from monitored pages when empty
  const { count } = await service
    .from("project_search_console_inspect_queue")
    .select("id", { count: "exact", head: true })
    .eq("property_id", property.id)
    .eq("status", "queued")

  if ((count ?? 0) === 0) {
    const { data: pages } = await service
      .from("project_site_pages")
      .select("id, url, canonical_url, discovered_at, scraped_at, updated_at")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(50)

    for (const page of pages ?? []) {
      const url = String(page.canonical_url ?? page.url ?? "")
      if (!url) continue
      const { data: existing } = await service
        .from("project_search_console_inspect_queue")
        .select("id")
        .eq("property_id", property.id)
        .eq("url", url)
        .in("status", ["queued", "running"])
        .maybeSingle()
      if (existing) continue
      await service.from("project_search_console_inspect_queue").insert({
        project_id: projectId,
        property_id: property.id,
        site_page_id: page.id,
        url,
        priority: 80,
        status: "queued",
        scheduled_for: new Date().toISOString(),
      })
    }
  }

  const { data: queue } = await service
    .from("project_search_console_inspect_queue")
    .select("*")
    .eq("property_id", property.id)
    .eq("status", "queued")
    .lte("scheduled_for", new Date().toISOString())
    .order("priority", { ascending: true })
    .order("scheduled_for", { ascending: true })
    .limit(limit)

  let inspected = 0
  let failed = 0
  let quotaErrors = 0

  for (const item of queue ?? []) {
    if (Date.now() > deadline) break

    await service
      .from("project_search_console_inspect_queue")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        attempts: Number(item.attempts ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)

    const apiUrl =
      `https://searchconsole.googleapis.com/v1/urlInspection/index:inspect`
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inspectionUrl: item.url,
        siteUrl: property.property_url,
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (response.status === 429) {
      quotaErrors += 1
      failed += 1
      await service
        .from("project_search_console_inspect_queue")
        .update({
          status: "queued",
          last_error: "quota_exceeded",
          scheduled_for: addDaysUTC(new Date(), 1).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
      break
    }

    if (!response.ok) {
      failed += 1
      const text = (await response.text()).slice(0, 500)
      await service
        .from("project_search_console_inspect_queue")
        .update({
          status: "failed",
          last_error: text,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
      continue
    }

    const payload = await response.json()
    const result = payload?.inspectionResult ?? {}
    const indexStatus = result?.indexStatusResult ?? {}
    const richResults = result?.richResultsResult ?? {}
    const category = classifyIndexInspection({
      verdict: indexStatus.verdict ?? result.verdict,
      coverageState: indexStatus.coverageState,
      robotsTxtState: indexStatus.robotsTxtState,
      indexingState: indexStatus.indexingState,
      pageFetchState: indexStatus.pageFetchState,
      googleCanonical: indexStatus.googleCanonical,
      userCanonical: indexStatus.userCanonical,
      richResultsStatus: richResults.verdict,
    })

    await service.from("project_site_page_index_snapshots").insert({
      project_id: projectId,
      site_page_id: item.site_page_id,
      property_id: property.id,
      inspected_url: item.url,
      inspection_date: new Date().toISOString(),
      inspection_status: "succeeded",
      verdict: indexStatus.verdict ?? result.verdict ?? null,
      coverage_state: indexStatus.coverageState ?? null,
      robots_txt_state: indexStatus.robotsTxtState ?? null,
      indexing_state: indexStatus.indexingState ?? null,
      page_fetch_state: indexStatus.pageFetchState ?? null,
      last_crawl_time: indexStatus.lastCrawlTime ?? null,
      google_canonical: indexStatus.googleCanonical ?? null,
      user_canonical: indexStatus.userCanonical ?? null,
      crawled_as: indexStatus.crawledAs ?? null,
      sitemap_urls: Array.isArray(indexStatus.sitemap) ? indexStatus.sitemap : [],
      referring_urls: Array.isArray(indexStatus.referringUrls)
        ? indexStatus.referringUrls
        : [],
      inspection_result_link: result.inspectionResultLink ?? null,
      rich_results_status: richResults.verdict ?? null,
      rich_results_items: Array.isArray(richResults.detectedItems)
        ? richResults.detectedItems
        : [],
      issues: Array.isArray(indexStatus.sitemap) ? [] : [],
      internal_issue_category: category,
      raw_payload: payload,
    })

    await service
      .from("project_search_console_inspect_queue")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", item.id)

    inspected += 1
  }

  return { status: "completed", inspected, failed, quota_errors: quotaErrors }
}

async function runForProperty(args: {
  service: ServiceClient
  projectId: number
  property: PropertyRow
  accessToken: string
  jobType: JobType
  trigger: Trigger
  searchType: string
  dateFrom?: string | null
  dateTo?: string | null
  recentWindowDays: number
  inspectionLimit: number
  deadline: number
}): Promise<Record<string, unknown>> {
  const {
    service,
    projectId,
    property,
    accessToken,
    jobType,
    trigger,
    searchType,
    recentWindowDays,
    inspectionLimit,
    deadline,
  } = args

  const sitePageMap = await loadSitePageMap(service, projectId)
  const results: Record<string, unknown> = {}

  const jobs: Array<"performance" | "backfill" | "sitemaps" | "url_inspection"> =
    jobType === "all"
      ? (trigger === "oauth_connect"
        ? ["backfill", "sitemaps", "url_inspection"]
        : ["performance", "sitemaps", "url_inspection"])
      : [jobType]

  for (const job of jobs) {
    if (Date.now() > deadline) {
      results[job] = { status: "partial", reason: "time_budget" }
      continue
    }

    if (job === "sitemaps") {
      const runId = await createSyncRun(service, {
        projectId,
        propertyId: property.id,
        jobType: "sitemaps",
        trigger,
        searchType,
      })
      const sitemapResult = await syncSitemaps({
        service,
        projectId,
        property,
        accessToken,
      })
      await finishSyncRun(service, runId, {
        status: sitemapResult.status === "failed" ? "failed" : "completed",
        rows_received: Number(sitemapResult.count ?? 0),
        rows_inserted: Number(sitemapResult.upserted ?? 0),
        error_message: typeof sitemapResult.error === "string"
          ? sitemapResult.error
          : null,
        metadata: sitemapResult,
      })
      results.sitemaps = sitemapResult
      continue
    }

    if (job === "url_inspection") {
      const runId = await createSyncRun(service, {
        projectId,
        propertyId: property.id,
        jobType: "url_inspection",
        trigger,
        searchType,
      })
      const inspectResult = await inspectQueuedUrls({
        service,
        projectId,
        property,
        accessToken,
        limit: inspectionLimit,
        deadline,
      })
      await finishSyncRun(service, runId, {
        status: "completed",
        rows_received: Number(inspectResult.inspected ?? 0),
        rows_inserted: Number(inspectResult.inspected ?? 0),
        quota_errors: Number(inspectResult.quota_errors ?? 0),
        metadata: inspectResult,
      })
      results.url_inspection = inspectResult
      continue
    }

    const end = args.dateTo
      ? new Date(`${args.dateTo}T00:00:00.000Z`)
      : addDaysUTC(new Date(), -1)
    let start: Date
    if (args.dateFrom) {
      start = new Date(`${args.dateFrom}T00:00:00.000Z`)
    } else if (job === "backfill") {
      start = addDaysUTC(end, -480)
    } else if (property.latest_metric_date) {
      start = addDaysUTC(
        new Date(`${property.latest_metric_date}T00:00:00.000Z`),
        -recentWindowDays,
      )
    } else {
      start = addDaysUTC(end, -28)
    }

    const startDate = isoDateUTC(start)
    const endDate = isoDateUTC(end)
    const chunks = job === "backfill"
      ? chunkDateRange({
        startDate,
        endDate,
        chunkDays: DEFAULT_BACKFILL_CHUNK_DAYS,
      })
      : [{ startDate, endDate }]

    const runId = await createSyncRun(service, {
      projectId,
      propertyId: property.id,
      jobType: job,
      trigger,
      dateFrom: startDate,
      dateTo: endDate,
      searchType,
    })

    if (job === "backfill") {
      await service
        .from("project_search_console_properties")
        .update({
          backfill_status: "running",
          backfill_progress: {
            start_date: startDate,
            end_date: endDate,
            chunks_total: chunks.length,
            chunks_done: 0,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", property.id)
    }

    let rowsReceived = 0
    let rowsInserted = 0
    let isPartial = false
    let errorText: string | undefined
    let minDate: string | null = property.earliest_metric_date
    let maxDate: string | null = property.latest_metric_date
    let chunksDone = 0

    for (const chunk of chunks) {
      if (Date.now() > deadline) {
        isPartial = true
        break
      }
      const windowResult = await syncPerformanceWindow({
        service,
        projectId,
        property,
        accessToken,
        startDate: chunk.startDate,
        endDate: chunk.endDate,
        searchType,
        sitePageMap,
      })
      rowsReceived += windowResult.rowsReceived
      rowsInserted += windowResult.rowsInserted
      isPartial = isPartial || windowResult.isPartial
      if (windowResult.errorText) errorText = windowResult.errorText
      if (windowResult.minDate && (!minDate || windowResult.minDate < minDate)) {
        minDate = windowResult.minDate
      }
      if (windowResult.maxDate && (!maxDate || windowResult.maxDate > maxDate)) {
        maxDate = windowResult.maxDate
      }
      chunksDone += 1

      if (job === "backfill") {
        await service
          .from("project_search_console_properties")
          .update({
            backfill_progress: {
              start_date: startDate,
              end_date: endDate,
              chunks_total: chunks.length,
              chunks_done: chunksDone,
              current_chunk: chunk,
            },
            earliest_metric_date: minDate,
            latest_metric_date: maxDate,
            updated_at: new Date().toISOString(),
          })
          .eq("id", property.id)
      }
    }

    const status = errorText
      ? "failed"
      : isPartial
      ? "partial"
      : "completed"

    await service
      .from("project_search_console_properties")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: status === "completed" ? "succeeded" : status,
        last_sync_error: errorText ?? null,
        earliest_metric_date: minDate,
        latest_metric_date: maxDate,
        backfill_status: job === "backfill"
          ? (status === "failed" ? "failed" : status === "partial" ? "partial" : "completed")
          : property.backfill_status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", property.id)

    await finishSyncRun(service, runId, {
      status,
      completed_date_from: startDate,
      completed_date_to: endDate,
      rows_received: rowsReceived,
      rows_inserted: rowsInserted,
      is_partial: isPartial,
      error_message: errorText ?? null,
      metadata: { chunks_total: chunks.length, chunks_done: chunksDone },
    })

    results[job] = {
      status,
      rows_received: rowsReceived,
      rows_inserted: rowsInserted,
      is_partial: isPartial,
      date_from: startDate,
      date_to: endDate,
      error: errorText ?? null,
    }
  }

  return results
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405)
  }

  const deadline = Date.now() + REQUEST_BUDGET_MS

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const projectId = Number(body.project_id)
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return json({ error: "project_id is required" }, 400)
    }

    const jobType = (typeof body.job_type === "string" ? body.job_type : "all") as JobType
    const trigger = (typeof body.trigger === "string" ? body.trigger : "manual") as Trigger
    const searchType = typeof body.search_type === "string" && body.search_type
      ? body.search_type
      : "web"
    const recentWindowDays = Number(body.recent_window_days ?? DEFAULT_RECENT_WINDOW_DAYS)
    const inspectionLimit = Number(body.inspection_limit ?? DEFAULT_INSPECTION_LIMIT)
    const dateFrom = typeof body.date_from === "string" ? body.date_from : null
    const dateTo = typeof body.date_to === "string" ? body.date_to : null

    const authHeader = req.headers.get("Authorization") ?? ""
    const bearer = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : ""
    const cronHeader =
      req.headers.get("x-search-console-sync-secret")
      ?? req.headers.get("x-competitive-content-sync-secret")
    const isServiceRole = Boolean(
      SUPABASE_SERVICE_ROLE_KEY && bearer && bearer === SUPABASE_SERVICE_ROLE_KEY,
    )
    const isCron = Boolean(
      (CRON_SECRET && cronHeader && cronHeader === CRON_SECRET)
      || (CRON_SECRET && bearer && bearer === CRON_SECRET)
      || isServiceRole,
    )

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    if (!isCron) {
      const { data: userData, error: userError } = await userClient.auth.getUser()
      if (userError || !userData.user) {
        return json({ error: "Unauthorized" }, 401)
      }
      const { data: canEdit } = await userClient.rpc("fn_can_edit_project_check", {
        p_project_id: projectId,
      })
      if (!canEdit) {
        return json({ error: "Forbidden" }, 403)
      }
    }

    const providedAccessToken =
      typeof body.access_token === "string" && body.access_token.trim()
        ? body.access_token.trim()
        : null

    let accessToken = providedAccessToken
    let tokenError: string | null = null

    if (!accessToken) {
      const connection = await getProjectGoogleConnection(service, projectId)
      const cached = connection?.access_token
      const expiresAt = connection?.access_token_expires_at
        ? Date.parse(connection.access_token_expires_at)
        : NaN
      const cachedStillValid =
        Boolean(cached)
        && Number.isFinite(expiresAt)
        && expiresAt > Date.now() + 60_000

      if (cachedStillValid && cached) {
        accessToken = cached
      } else {
        const refreshToken = connection?.refresh_token || GSC_REFRESH_TOKEN
        const refreshed = await getGoogleAccessToken(refreshToken || "")
        accessToken = refreshed.token
        tokenError = refreshed.error
      }
    }

    if (!accessToken) {
      return json({
        ok: false,
        status: "skipped",
        error: tokenError
          || "Failed to refresh project Google OAuth token",
        reason: tokenError
          || "Failed to refresh project Google OAuth token",
      })
    }

    const { data: properties } = await service
      .from("project_search_console_properties")
      .select(
        "id, project_id, property_url, site_type, earliest_metric_date, latest_metric_date, backfill_status, backfill_progress",
      )
      .eq("project_id", projectId)
      .eq("is_active", true)

    if (!properties || properties.length === 0) {
      return json({
        ok: false,
        status: "skipped",
        reason: "No active Search Console property",
      })
    }

    const propertyResults: Record<string, unknown>[] = []
    for (const property of properties as PropertyRow[]) {
      if (Date.now() > deadline) {
        propertyResults.push({
          property_id: property.id,
          status: "partial",
          reason: "time_budget",
        })
        continue
      }
      const result = await runForProperty({
        service,
        projectId,
        property,
        accessToken,
        jobType,
        trigger,
        searchType,
        dateFrom,
        dateTo,
        recentWindowDays: Number.isFinite(recentWindowDays)
          ? Math.max(1, recentWindowDays)
          : DEFAULT_RECENT_WINDOW_DAYS,
        inspectionLimit: Number.isFinite(inspectionLimit)
          ? Math.max(1, Math.min(inspectionLimit, 50))
          : DEFAULT_INSPECTION_LIMIT,
        deadline,
      })
      propertyResults.push({
        property_id: property.id,
        property_url: property.property_url,
        ...result,
      })
    }

    return json({
      ok: true,
      project_id: projectId,
      job_type: jobType,
      trigger,
      search_type: searchType,
      properties: propertyResults,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed"
    console.error("sync-search-console error", message)
    return json({ error: message }, 500)
  }
})
