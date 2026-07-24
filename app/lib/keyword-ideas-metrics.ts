export type KeywordMonthlySearchVolume = {
  year: number
  month: number
  monthlySearches: number
}

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  JANUARY: 1,
  FEBRUARY: 2,
  MARCH: 3,
  APRIL: 4,
  MAY: 5,
  JUNE: 6,
  JULY: 7,
  AUGUST: 8,
  SEPTEMBER: 9,
  OCTOBER: 10,
  NOVEMBER: 11,
  DECEMBER: 12,
}

/** Map Google Ads language constant ids → project keyword tracking codes. */
export const ADS_LANGUAGE_ID_TO_PROJECT_CODE: Record<string, string> = {
  "1000": "EN",
  "1014": "PT",
  "1003": "ES",
  "1002": "FR",
  "1001": "DE",
}

export function parseMonthlySearchVolumes(raw: unknown): KeywordMonthlySearchVolume[] {
  if (!Array.isArray(raw)) return []
  const rows: KeywordMonthlySearchVolume[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const record = entry as Record<string, unknown>
    const year = Number(record.year)
    const monthRaw = record.month
    const month =
      typeof monthRaw === "number"
        ? monthRaw
        : typeof monthRaw === "string"
          ? MONTH_NAME_TO_NUMBER[monthRaw.toUpperCase()] ?? Number(monthRaw)
          : NaN
    const monthlySearches = Number(record.monthlySearches ?? record.monthly_searches)
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) continue
    rows.push({
      year,
      month,
      monthlySearches: Number.isFinite(monthlySearches) ? monthlySearches : 0,
    })
  }
  rows.sort((a, b) => a.year - b.year || a.month - b.month)
  return rows
}
