import { getSupabaseBrowser } from "../../../lib/supabase-browser"

export const PROJECT_SITE_INDEX_STATUS_QUERY_KEY = "project-site-index-status" as const
export const PROJECT_SITE_PAGES_QUERY_KEY = "project-site-pages" as const

export type ProjectSiteIndexRun = {
  id: string
  project_id: number
  provider: string
  mode: string
  status: string
  root_url: string
  discovered_count: number
  enriched_count: number
  error_code: string | null
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type ProjectSiteIndexStatus = {
  ok: boolean
  project_id: number
  active_page_count: number
  latest_run: ProjectSiteIndexRun | null
  error?: string
}

export type ProjectSitePage = {
  id: number
  project_id: number
  url: string
  canonical_url: string
  title: string | null
  description: string | null
  page_type: string | null
  language_code: string | null
  summary: string | null
  is_active: boolean
  scraped_at: string | null
  last_seen_at: string
  discovered_at: string
  updated_at: string
}

export type ProjectSitePagesQuery = {
  projectId: number
  search?: string
  pageType?: string | null
  languageCode?: string | null
  activeOnly?: boolean
  page?: number
  pageSize?: number
}

export type ProjectSitePagesResult = {
  rows: ProjectSitePage[]
  total: number
  page: number
  pageSize: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeRun(raw: unknown): ProjectSiteIndexRun | null {
  const record = asRecord(raw)
  if (!record) return null
  const id = toTrimmedString(record.id)
  const projectId = toFiniteNumber(record.project_id)
  const rootUrl = toTrimmedString(record.root_url)
  const status = toTrimmedString(record.status)
  if (!id || projectId == null || !rootUrl || !status) return null
  return {
    id,
    project_id: projectId,
    provider: toTrimmedString(record.provider) ?? "firecrawl",
    mode: toTrimmedString(record.mode) ?? "map_and_enrich",
    status,
    root_url: rootUrl,
    discovered_count: toFiniteNumber(record.discovered_count) ?? 0,
    enriched_count: toFiniteNumber(record.enriched_count) ?? 0,
    error_code: toTrimmedString(record.error_code),
    error_message: toTrimmedString(record.error_message),
    started_at: toTrimmedString(record.started_at),
    completed_at: toTrimmedString(record.completed_at),
    created_at: toTrimmedString(record.created_at) ?? new Date().toISOString(),
    updated_at: toTrimmedString(record.updated_at) ?? new Date().toISOString(),
  }
}

export function isProjectSiteIndexRunActive(status: string | null | undefined): boolean {
  const normalized = (status ?? "").trim().toLowerCase()
  return normalized === "running" || normalized === "queued" || normalized === "pending"
}

export async function fetchProjectSiteIndexStatus(
  projectId: number,
): Promise<ProjectSiteIndexStatus> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.functions.invoke("ai-project-site-index", {
    body: {
      action: "status",
      project_id: projectId,
    },
  })
  if (error) {
    throw new Error(error.message || "Failed to load website index status")
  }
  const record = asRecord(data)
  if (!record || record.ok === false) {
    throw new Error(toTrimmedString(record?.error) ?? "Failed to load website index status")
  }
  return {
    ok: true,
    project_id: toFiniteNumber(record.project_id) ?? projectId,
    active_page_count: toFiniteNumber(record.active_page_count) ?? 0,
    latest_run: normalizeRun(record.latest_run),
  }
}

export type RefreshProjectSiteIndexResult = {
  ok: boolean
  project_id: number
  index_run_id?: string
  root_url?: string
  discovered_count?: number
  enriched_count?: number
  error?: string
}

export async function refreshProjectSiteIndex(args: {
  projectId: number
  mode?: "map_and_enrich" | "map_only"
  mapLimit?: number
  enrichLimit?: number
}): Promise<RefreshProjectSiteIndexResult> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.functions.invoke("ai-project-site-index", {
    body: {
      action: "refresh",
      project_id: args.projectId,
      mode: args.mode ?? "map_and_enrich",
      map_limit: args.mapLimit ?? 1000,
      enrich_limit: args.enrichLimit ?? 30,
    },
  })
  const record = asRecord(data)
  if (error) {
    return {
      ok: false,
      project_id: args.projectId,
      error: error.message || toTrimmedString(record?.error) || "Refresh failed",
      index_run_id: toTrimmedString(record?.index_run_id) ?? undefined,
    }
  }
  if (!record || record.ok === false) {
    return {
      ok: false,
      project_id: args.projectId,
      error: toTrimmedString(record?.error) ?? "Refresh failed",
      index_run_id: toTrimmedString(record?.index_run_id) ?? undefined,
    }
  }
  return {
    ok: true,
    project_id: toFiniteNumber(record.project_id) ?? args.projectId,
    index_run_id: toTrimmedString(record.index_run_id) ?? undefined,
    root_url: toTrimmedString(record.root_url) ?? undefined,
    discovered_count: toFiniteNumber(record.discovered_count) ?? undefined,
    enriched_count: toFiniteNumber(record.enriched_count) ?? undefined,
  }
}

export async function fetchProjectSitePages(
  query: ProjectSitePagesQuery,
): Promise<ProjectSitePagesResult> {
  const supabase = getSupabaseBrowser()
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.max(1, Math.min(100, query.pageSize ?? 25))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let builder = supabase
    .from("project_site_pages")
    .select(
      "id,project_id,url,canonical_url,title,description,page_type,language_code,summary,is_active,scraped_at,last_seen_at,discovered_at,updated_at",
      { count: "exact" },
    )
    .eq("project_id", query.projectId)
    .order("last_seen_at", { ascending: false })
    .range(from, to)

  if (query.activeOnly !== false) {
    builder = builder.eq("is_active", true)
  }
  if (query.pageType?.trim()) {
    builder = builder.eq("page_type", query.pageType.trim())
  }
  if (query.languageCode?.trim()) {
    builder = builder.eq("language_code", query.languageCode.trim())
  }
  const search = query.search?.trim()
  if (search) {
    const escaped = search.replace(/[%_,]/g, "")
    builder = builder.or(
      `title.ilike.%${escaped}%,url.ilike.%${escaped}%,summary.ilike.%${escaped}%,canonical_url.ilike.%${escaped}%`,
    )
  }

  const { data, error, count } = await builder
  if (error) throw new Error(error.message || "Failed to load website pages")

  const rows = (Array.isArray(data) ? data : []).map((row) => {
    const record = row as ProjectSitePage
    return record
  })

  return {
    rows,
    total: count ?? rows.length,
    page,
    pageSize,
  }
}

/** Distinct page types / languages for filters (active pages by default). */
export async function fetchProjectSitePageFilterOptions(projectId: number): Promise<{
  pageTypes: string[]
  languages: string[]
}> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase
    .from("project_site_pages")
    .select("page_type,language_code")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .limit(2000)
  if (error) throw new Error(error.message || "Failed to load page filters")

  const pageTypes = new Set<string>()
  const languages = new Set<string>()
  for (const row of Array.isArray(data) ? data : []) {
    const record = asRecord(row)
    if (!record) continue
    const pageType = toTrimmedString(record.page_type)
    const language = toTrimmedString(record.language_code)
    if (pageType) pageTypes.add(pageType)
    if (language) languages.add(language)
  }
  return {
    pageTypes: [...pageTypes].sort((a, b) => a.localeCompare(b)),
    languages: [...languages].sort((a, b) => a.localeCompare(b)),
  }
}
