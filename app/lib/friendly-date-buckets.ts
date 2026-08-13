import { differenceInCalendarDays, isToday, isYesterday } from "date-fns"

export const FRIENDLY_DATE_BUCKET_ORDER = [
  "Today",
  "Yesterday",
  "Past week",
  "This month",
  "Older",
] as const

export type FriendlyDateBucket = (typeof FRIENDLY_DATE_BUCKET_ORDER)[number]

/** User-friendly relative date buckets for inbox-style lists. */
export function getFriendlyDateBucket(value: string | Date | null | undefined): FriendlyDateBucket {
  if (!value) return "Older"
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "Older"
  if (isToday(date)) return "Today"
  if (isYesterday(date)) return "Yesterday"
  const daysAgo = differenceInCalendarDays(new Date(), date)
  if (daysAgo >= 2 && daysAgo <= 6) return "Past week"
  const now = new Date()
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) {
    return "This month"
  }
  return "Older"
}

export function groupByFriendlyDateBucket<T>(
  items: T[],
  getDate: (item: T) => string | Date | null | undefined,
): Array<{ label: FriendlyDateBucket; items: T[] }> {
  const groups = new Map<FriendlyDateBucket, T[]>()
  for (const item of items) {
    const label = getFriendlyDateBucket(getDate(item))
    const existing = groups.get(label)
    if (existing) existing.push(item)
    else groups.set(label, [item])
  }
  return FRIENDLY_DATE_BUCKET_ORDER.filter((label) => (groups.get(label)?.length ?? 0) > 0).map(
    (label) => ({ label, items: groups.get(label) ?? [] }),
  )
}
