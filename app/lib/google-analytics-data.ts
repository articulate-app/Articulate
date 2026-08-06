/**
 * Google Analytics Data API (GA4) reads performed with a per-project OAuth
 * access token granted through https://www.googleapis.com/auth/analytics.readonly.
 */

export type GoogleAnalyticsDailyRow = {
  date: string
  channelGroup: string
  activeUsers: number
  sessions: number
  avgSessionDuration: number
}

export type GoogleAnalyticsReportRow = {
  dimensionValues?: Array<{ value?: string }>
  metricValues?: Array<{ value?: string }>
}

export const GOOGLE_ANALYTICS_TOTAL_CHANNEL = "Total Traffic" as const

/** GA4 resource names must be `properties/<id>`; UI and DB accept either shape. */
export function normalizeGaPropertyId(raw: string): string {
  const trimmed = raw.trim()
  return trimmed.startsWith("properties/") ? trimmed : `properties/${trimmed}`
}

/** GA `YYYYMMDD` -> ISO `YYYY-MM-DD`. */
export function parseGaDate(gaDate: string): string {
  if (!gaDate || gaDate.length !== 8) return gaDate
  return `${gaDate.slice(0, 4)}-${gaDate.slice(4, 6)}-${gaDate.slice(6, 8)}`
}

/**
 * Collapses raw GA rows into one row per (date, channel) plus a synthetic
 * "Total Traffic" channel per date. Average session duration is re-weighted by
 * sessions so totals stay meaningful.
 */
export function aggregateGoogleAnalyticsRows(
  rows: GoogleAnalyticsReportRow[],
): GoogleAnalyticsDailyRow[] {
  const byDateChannel = new Map<string, GoogleAnalyticsDailyRow>()
  const byDateTotal = new Map<
    string,
    { activeUsers: number; sessions: number; weightedDuration: number }
  >()

  for (const row of rows) {
    const gaDate = row.dimensionValues?.[0]?.value
    if (!gaDate) continue

    const date = parseGaDate(gaDate)
    const channelGroup = row.dimensionValues?.[1]?.value || "Unknown"
    const activeUsers = Number(row.metricValues?.[0]?.value ?? 0)
    const sessions = Number(row.metricValues?.[1]?.value ?? 0)
    const avgSessionDuration = Number(row.metricValues?.[2]?.value ?? 0)

    const key = `${date}__${channelGroup}`
    const existing = byDateChannel.get(key)
    if (existing) {
      const totalSessions = existing.sessions + sessions
      const weighted =
        existing.avgSessionDuration * existing.sessions +
        avgSessionDuration * sessions
      byDateChannel.set(key, {
        date,
        channelGroup,
        activeUsers: existing.activeUsers + activeUsers,
        sessions: totalSessions,
        avgSessionDuration: totalSessions > 0 ? weighted / totalSessions : 0,
      })
    } else {
      byDateChannel.set(key, {
        date,
        channelGroup,
        activeUsers,
        sessions,
        avgSessionDuration,
      })
    }

    const total =
      byDateTotal.get(date) ?? { activeUsers: 0, sessions: 0, weightedDuration: 0 }
    total.activeUsers += activeUsers
    total.sessions += sessions
    total.weightedDuration += sessions * avgSessionDuration
    byDateTotal.set(date, total)
  }

  const aggregated = [...byDateChannel.values()]
  for (const [date, total] of byDateTotal) {
    aggregated.push({
      date,
      channelGroup: GOOGLE_ANALYTICS_TOTAL_CHANNEL,
      activeUsers: total.activeUsers,
      sessions: total.sessions,
      avgSessionDuration:
        total.sessions > 0 ? total.weightedDuration / total.sessions : 0,
    })
  }

  return aggregated.sort(
    (a, b) => a.date.localeCompare(b.date) || a.channelGroup.localeCompare(b.channelGroup),
  )
}

export function summarizeGoogleAnalyticsRows(rows: GoogleAnalyticsDailyRow[]): {
  totalSessions: number
  totalActiveUsers: number
  channels: string[]
  firstDate: string | null
  lastDate: string | null
} {
  const totals = rows.filter(
    (row) => row.channelGroup === GOOGLE_ANALYTICS_TOTAL_CHANNEL,
  )
  const dates = rows.map((row) => row.date).sort()
  return {
    totalSessions: totals.reduce((sum, row) => sum + row.sessions, 0),
    totalActiveUsers: totals.reduce((sum, row) => sum + row.activeUsers, 0),
    channels: [
      ...new Set(
        rows
          .map((row) => row.channelGroup)
          .filter((channel) => channel !== GOOGLE_ANALYTICS_TOTAL_CHANNEL),
      ),
    ].sort(),
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
  }
}

/**
 * Calls GA4 `properties.runReport` with the caller's OAuth access token.
 * Requires the analytics.readonly scope on that token.
 */
export async function fetchGoogleAnalyticsDailyReport(args: {
  accessToken: string
  gaPropertyId: string
  startDate?: string
  endDate?: string
}): Promise<GoogleAnalyticsDailyRow[]> {
  const propertyName = normalizeGaPropertyId(args.gaPropertyId)
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/${propertyName}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "averageSessionDuration" },
        ],
        dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
        dateRanges: [
          {
            startDate: args.startDate ?? "90daysAgo",
            endDate: args.endDate ?? "yesterday",
          },
        ],
        orderBys: [
          {
            desc: false,
            dimension: { dimensionName: "date", orderType: "ALPHANUMERIC" },
          },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    },
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `GA4 runReport failed for ${propertyName} (${response.status}): ${text.slice(0, 300)}`,
    )
  }

  const payload = (await response.json()) as { rows?: GoogleAnalyticsReportRow[] }
  return aggregateGoogleAnalyticsRows(payload.rows ?? [])
}
