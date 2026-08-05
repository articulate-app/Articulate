/**
 * Helpers for "vs previous period" comparison on competition overview.
 */

export type DateRangeBounds = {
  from: Date
  to: Date
}

/**
 * Preceding window of equal inclusive calendar-day length, ending the day
 * before `from`. Example: Jul 6–Aug 4 (30 days) → Jun 6–Jul 5.
 */
export function getPreviousPeriodRange(range: DateRangeBounds): DateRangeBounds {
  const fromStart = startOfLocalDay(range.from)
  const toStart = startOfLocalDay(range.to)
  const inclusiveDays =
    Math.round((toStart.getTime() - fromStart.getTime()) / 86_400_000) + 1
  const safeDays = Math.max(1, inclusiveDays)

  const prevTo = new Date(fromStart)
  prevTo.setDate(prevTo.getDate() - 1)

  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - (safeDays - 1))

  return { from: prevFrom, to: prevTo }
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function metricDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (current == null || previous == null) return null
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  return current - previous
}
