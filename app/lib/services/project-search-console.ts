import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { format } from "date-fns"
import {
  getPreviousPeriodRange,
  metricDelta,
  metricDeltaPct,
} from "@/lib/competition-previous-period"

export type GoogleIntegrationsStatus = {
  project_id: number
  oauth: {
    connected: boolean
    google_account_email?: string | null
    scopes?: string[]
    status?: string
    last_error?: string | null
  }
  analytics: {
    connected: boolean
    ga_property_id?: string
    default_uri?: string | null
    updated_at?: string
  }
  search_console: {
    connected: boolean
    id?: number
    property_url?: string
    site_type?: string | null
    last_synced_at?: string | null
    last_sync_status?: string | null
    last_sync_error?: string | null
    earliest_metric_date?: string | null
    latest_metric_date?: string | null
    backfill_status?: string | null
    backfill_progress?: Record<string, unknown>
  }
}

export type SearchOverviewMetrics = {
  clicks: number
  impressions: number
  ctr: number | null
  position_avg: number | null
}

export type SearchOverviewRow = {
  query?: string
  page?: string
  clicks: number
  impressions: number
  ctr: number | null
  position_avg: number | null
}

export type SearchOverviewResponse = {
  project_id: number
  connected: boolean
  property: {
    id?: number
    property_url?: string
    site_type?: string | null
    last_synced_at?: string | null
    last_sync_status?: string | null
    last_sync_error?: string | null
    earliest_metric_date?: string | null
    latest_metric_date?: string | null
    backfill_status?: string | null
  } | null
  search_type: string
  date_from: string | null
  date_to: string | null
  latest_metric_date: string | null
  last_synced_at: string | null
  coverage_note?: string
  current: SearchOverviewMetrics
  previous: SearchOverviewMetrics | null
  timeseries: Array<{
    date: string
    clicks: number
    impressions: number
    ctr: number | null
    position_avg: number | null
  }>
  top_queries: SearchOverviewRow[]
  top_pages: SearchOverviewRow[]
  opportunities: {
    high_impressions_low_ctr?: SearchOverviewRow[]
    positions_4_to_20?: SearchOverviewRow[]
  }
  indexation: {
    scope?: string
    monitored_pages?: number
    inspected?: number
    indexed?: number
    not_indexed?: number
    with_issues?: number
    not_inspected?: number
    last_inspection_at?: string | null
  }
}

export type SearchConsoleSyncResult = {
  ok: boolean
  status?: string
  error?: string
  job_type?: string
  properties?: Array<Record<string, unknown>>
}

function toDateParam(date: Date | null | undefined): string | null {
  if (!date) return null
  return format(date, "yyyy-MM-dd")
}

export async function getProjectGoogleIntegrationsStatus(
  projectId: number,
): Promise<GoogleIntegrationsStatus> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc(
    "fn_get_project_google_integrations_status",
    { p_project_id: projectId },
  )
  if (error) throw error
  return data as GoogleIntegrationsStatus
}

export async function getProjectSearchOverview(args: {
  projectId: number
  dateFrom: Date
  dateTo: Date
  searchType?: string
  limit?: number
}): Promise<SearchOverviewResponse> {
  const prev = getPreviousPeriodRange({ from: args.dateFrom, to: args.dateTo })
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("fn_get_project_search_overview", {
    p_project_id: args.projectId,
    p_date_from: toDateParam(args.dateFrom),
    p_date_to: toDateParam(args.dateTo),
    p_compare_date_from: toDateParam(prev.from),
    p_compare_date_to: toDateParam(prev.to),
    p_search_type: args.searchType ?? "web",
    p_limit: args.limit ?? 10,
  })
  if (error) throw error
  return data as SearchOverviewResponse
}

export async function getProjectSearchQueries(args: {
  projectId: number
  dateFrom: Date
  dateTo: Date
  searchType?: string
  limit?: number
  offset?: number
}): Promise<{
  total: number
  rows: SearchOverviewRow[]
  coverage_note?: string
}> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("fn_get_project_search_queries", {
    p_project_id: args.projectId,
    p_date_from: toDateParam(args.dateFrom),
    p_date_to: toDateParam(args.dateTo),
    p_search_type: args.searchType ?? "web",
    p_limit: args.limit ?? 100,
    p_offset: args.offset ?? 0,
  })
  if (error) throw error
  const payload = data as {
    total?: number
    rows?: SearchOverviewRow[]
    coverage_note?: string
  }
  return {
    total: payload.total ?? 0,
    rows: payload.rows ?? [],
    coverage_note: payload.coverage_note,
  }
}

export async function getProjectSearchPages(args: {
  projectId: number
  dateFrom: Date
  dateTo: Date
  searchType?: string
  limit?: number
  offset?: number
}): Promise<{ total: number; rows: SearchOverviewRow[] }> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("fn_get_project_search_pages", {
    p_project_id: args.projectId,
    p_date_from: toDateParam(args.dateFrom),
    p_date_to: toDateParam(args.dateTo),
    p_search_type: args.searchType ?? "web",
    p_limit: args.limit ?? 100,
    p_offset: args.offset ?? 0,
  })
  if (error) throw error
  const payload = data as { total?: number; rows?: SearchOverviewRow[] }
  return {
    total: payload.total ?? 0,
    rows: payload.rows ?? [],
  }
}

export async function getProjectIndexationSummary(projectId: number): Promise<{
  indexation: SearchOverviewResponse["indexation"]
  note?: string
}> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("fn_get_project_indexation_summary", {
    p_project_id: projectId,
  })
  if (error) throw error
  const payload = data as {
    indexation?: SearchOverviewResponse["indexation"]
    note?: string
  }
  return {
    indexation: payload.indexation ?? {},
    note: payload.note,
  }
}

export async function getProjectSearchSitemaps(projectId: number): Promise<{
  rows: Array<Record<string, unknown>>
  note?: string
}> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("fn_get_project_search_sitemaps", {
    p_project_id: projectId,
  })
  if (error) throw error
  const payload = data as { rows?: Array<Record<string, unknown>>; note?: string }
  return {
    rows: payload.rows ?? [],
    note: payload.note,
  }
}

export async function enqueueSitePageInspection(args: {
  projectId: number
  sitePageId?: number | null
  url?: string | null
}): Promise<{ ok: boolean; queue_id?: number; url?: string }> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("fn_enqueue_site_page_inspection", {
    p_project_id: args.projectId,
    p_site_page_id: args.sitePageId ?? null,
    p_url: args.url ?? null,
  })
  if (error) throw error
  return data as { ok: boolean; queue_id?: number; url?: string }
}

export async function syncProjectSearchConsole(args: {
  projectId: number
  jobType?: "performance" | "backfill" | "sitemaps" | "url_inspection" | "all"
  trigger?: "manual" | "automatic" | "oauth_connect"
  searchType?: string
}): Promise<SearchConsoleSyncResult> {
  // Refresh the Google token in Next.js (known-good app secrets), then hand the
  // access token to the edge sync. Direct edge invoke often fails when edge
  // OAuth secrets drift from the app client.
  const response = await fetch("/api/auth/google/search-console-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: args.projectId,
      jobType: args.jobType ?? "all",
      trigger: args.trigger ?? "manual",
      searchType: args.searchType ?? "web",
    }),
  })
  const data = await response.json().catch(() => ({}))
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {}
  if (!response.ok) {
    return {
      ok: false,
      error:
        (typeof record.error === "string" && record.error)
        || (typeof record.reason === "string" && record.reason)
        || `Search Console sync failed (${response.status})`,
      status: typeof record.status === "string" ? record.status : undefined,
    }
  }
  return {
    ok: record.ok !== false,
    status: typeof record.status === "string" ? record.status : undefined,
    error:
      typeof record.error === "string"
        ? record.error
        : typeof record.reason === "string"
          ? record.reason
          : undefined,
    job_type: typeof record.job_type === "string" ? record.job_type : undefined,
    properties: Array.isArray(record.properties)
      ? (record.properties as Array<Record<string, unknown>>)
      : undefined,
  }
}

export function searchMetricDeltas(
  current: SearchOverviewMetrics | null | undefined,
  previous: SearchOverviewMetrics | null | undefined,
) {
  return {
    clicks: {
      delta: metricDelta(current?.clicks, previous?.clicks),
      pct: metricDeltaPct(current?.clicks, previous?.clicks),
    },
    impressions: {
      delta: metricDelta(current?.impressions, previous?.impressions),
      pct: metricDeltaPct(current?.impressions, previous?.impressions),
    },
    ctr: {
      delta: metricDelta(current?.ctr, previous?.ctr),
      pct: metricDeltaPct(current?.ctr, previous?.ctr),
    },
    position: {
      delta: metricDelta(current?.position_avg, previous?.position_avg),
      // Lower position is better — invert pct sign for display callers if needed.
      pct: metricDeltaPct(current?.position_avg, previous?.position_avg),
    },
  }
}
