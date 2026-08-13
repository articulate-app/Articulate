export type GscSearchAnalyticsRow = {
  keys?: string[]
  clicks?: number
  impressions?: number
  ctr?: number
  position?: number
}

export function isoDateUTC(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDaysUTC(date: Date, days: number): Date {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export function normalizeHttpUrl(input: string): string | null {
  const trimmed = input.trim()
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
    return trimmed
  }
}

export function classifyIndexInspection(args: {
  verdict?: string | null
  coverageState?: string | null
  robotsTxtState?: string | null
  indexingState?: string | null
  pageFetchState?: string | null
  googleCanonical?: string | null
  userCanonical?: string | null
  richResultsStatus?: string | null
}): string {
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

export function chunkDateRange(args: {
  startDate: string
  endDate: string
  chunkDays: number
}): Array<{ startDate: string; endDate: string }> {
  const start = new Date(`${args.startDate}T00:00:00.000Z`)
  const end = new Date(`${args.endDate}T00:00:00.000Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return []
  }
  const chunks: Array<{ startDate: string; endDate: string }> = []
  let cursor = start
  while (cursor <= end) {
    const chunkEnd = addDaysUTC(cursor, args.chunkDays - 1)
    const cappedEnd = chunkEnd > end ? end : chunkEnd
    chunks.push({
      startDate: isoDateUTC(cursor),
      endDate: isoDateUTC(cappedEnd),
    })
    cursor = addDaysUTC(cappedEnd, 1)
  }
  return chunks
}
