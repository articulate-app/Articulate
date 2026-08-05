export type ChartInterval = "day" | "week" | "month"

function parseDateKey(value: string): Date | null {
  const day = String(value).slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return Number.isNaN(date.getTime()) ? null : date
}

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function formatShortAxisDate(dateKey: string): string {
  const date = parseDateKey(dateKey)
  if (!date) return dateKey
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

/** Bucket key for chart aggregation (UTC). */
export function bucketDateKey(rawDate: string, interval: ChartInterval): string | null {
  const date = parseDateKey(rawDate)
  if (!date) return null
  if (interval === "day") return toIsoDay(date)
  if (interval === "month") {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`
  }
  // ISO week starting Monday
  const day = date.getUTCDay() || 7
  const monday = new Date(date)
  monday.setUTCDate(date.getUTCDate() - day + 1)
  return toIsoDay(monday)
}

export function formatChartIntervalLabel(dateKey: string, interval: ChartInterval): string {
  const date = parseDateKey(dateKey)
  if (!date) return dateKey
  if (interval === "month") {
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
  }
  if (interval === "week") {
    return `Week of ${formatShortAxisDate(dateKey)}`
  }
  return formatShortAxisDate(dateKey)
}

type EntityMeta = {
  entity_id: string
  key: string
}

export function buildGroupedSeries(args: {
  points: Array<{ date: string; entity_id: string; value: number | null }>
  entityMeta: EntityMeta[]
  interval: ChartInterval
  mode: "sum" | "last"
}): Array<Record<string, number | string>> {
  const byBucket = new Map<string, Record<string, number | string>>()
  for (const point of args.points) {
    if (point.value == null) continue
    const bucket = bucketDateKey(point.date, args.interval)
    if (!bucket) continue
    const meta = args.entityMeta.find((entity) => entity.entity_id === point.entity_id)
    if (!meta) continue
    const row = byBucket.get(bucket) ?? { date: bucket }
    const previous = typeof row[meta.key] === "number" ? (row[meta.key] as number) : 0
    row[meta.key] = args.mode === "sum" ? previous + point.value : point.value
    byBucket.set(bucket, row)
  }
  return [...byBucket.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  )
}
