/**
 * Search Console aggregation helpers.
 * CTR = sum(clicks) / sum(impressions)
 * Average position must be impression-weighted — never a plain mean of daily averages.
 */

export type SearchMetricRow = {
  clicks?: number | null
  impressions?: number | null
  position?: number | null
}

export type AggregatedSearchMetrics = {
  clicks: number
  impressions: number
  ctr: number | null
  positionAvg: number | null
}

export function aggregateSearchMetrics(
  rows: SearchMetricRow[],
): AggregatedSearchMetrics {
  let clicks = 0
  let impressions = 0
  let positionWeighted = 0

  for (const row of rows) {
    const rowClicks = Number(row.clicks ?? 0)
    const rowImpressions = Number(row.impressions ?? 0)
    const rowPosition = Number(row.position ?? 0)
    if (!Number.isFinite(rowClicks) || !Number.isFinite(rowImpressions)) continue
    clicks += rowClicks
    impressions += rowImpressions
    if (Number.isFinite(rowPosition) && rowImpressions > 0) {
      positionWeighted += rowPosition * rowImpressions
    }
  }

  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : null,
    positionAvg: impressions > 0 ? positionWeighted / impressions : null,
  }
}

export function isBrandedQuery(
  query: string,
  brandTerms: string[],
  exclusions: string[] = [],
): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return false
  if (exclusions.some((term) => normalized.includes(term.trim().toLowerCase()))) {
    return false
  }
  return brandTerms.some((term) => {
    const t = term.trim().toLowerCase()
    return t.length > 0 && normalized.includes(t)
  })
}

export type IndexIssueCategory =
  | "not_indexed"
  | "blocked_by_robots"
  | "blocked_by_noindex"
  | "fetch_error"
  | "server_error"
  | "soft_404"
  | "redirect"
  | "duplicate"
  | "canonical_mismatch"
  | "discovered_not_indexed"
  | "crawled_not_indexed"
  | "rich_result_issue"
  | "unknown"
  | "indexed"

export function classifyIndexInspection(args: {
  verdict?: string | null
  coverageState?: string | null
  robotsTxtState?: string | null
  indexingState?: string | null
  pageFetchState?: string | null
  googleCanonical?: string | null
  userCanonical?: string | null
  richResultsStatus?: string | null
}): IndexIssueCategory {
  const coverage = (args.coverageState ?? "").toLowerCase()
  const robots = (args.robotsTxtState ?? "").toLowerCase()
  const indexing = (args.indexingState ?? "").toLowerCase()
  const fetchState = (args.pageFetchState ?? "").toLowerCase()
  const verdict = (args.verdict ?? "").toLowerCase()
  const rich = (args.richResultsStatus ?? "").toLowerCase()

  if (robots.includes("disallowed")) return "blocked_by_robots"
  if (indexing.includes("noindex") || coverage.includes("noindex")) {
    return "blocked_by_noindex"
  }
  if (fetchState.includes("soft_404") || coverage.includes("soft 404")) {
    return "soft_404"
  }
  if (fetchState.includes("server_error") || coverage.includes("server error")) {
    return "server_error"
  }
  if (
    fetchState.includes("not_found")
    || fetchState.includes("access_denied")
    || fetchState.includes("fetch_error")
  ) {
    return "fetch_error"
  }
  if (coverage.includes("redirect") || indexing.includes("redirect")) {
    return "redirect"
  }
  if (coverage.includes("duplicate") || indexing.includes("duplicate")) {
    return "duplicate"
  }
  if (coverage.includes("discovered") && coverage.includes("not indexed")) {
    return "discovered_not_indexed"
  }
  if (coverage.includes("crawled") && coverage.includes("not indexed")) {
    return "crawled_not_indexed"
  }

  const googleCanon = (args.googleCanonical ?? "").trim().toLowerCase()
  const userCanon = (args.userCanonical ?? "").trim().toLowerCase()
  if (googleCanon && userCanon && googleCanon !== userCanon) {
    return "canonical_mismatch"
  }

  if (rich && rich !== "pass" && rich !== "ok" && rich !== "valid") {
    return "rich_result_issue"
  }

  if (
    verdict === "pass"
    || coverage.includes("indexed")
    || indexing.includes("indexed")
  ) {
    return "indexed"
  }

  if (verdict === "fail" || coverage.includes("not indexed")) {
    return "not_indexed"
  }

  return "unknown"
}

export function normalizeSearchPageUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`)
    parsed.hash = ""
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "")
    let pathname = parsed.pathname || "/"
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1)
    }
    return `${parsed.protocol}//${host}${pathname}${parsed.search}`
  } catch {
    return trimmed.toLowerCase()
  }
}
