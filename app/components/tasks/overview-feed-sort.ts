import { ArrowDownAZ, ArrowUpDown, ArrowUpAZ, Clock } from "lucide-react"

export type OverviewFeedSort = "newest" | "oldest" | "user_asc" | "user_desc"

export const OVERVIEW_FEED_SORT_OPTIONS: { value: OverviewFeedSort; label: string }[] = [
  { value: "oldest", label: "Oldest first" },
  { value: "newest", label: "Newest first" },
  { value: "user_asc", label: "User (A–Z)" },
  { value: "user_desc", label: "User (Z–A)" },
]

export function getOverviewFeedSortIcon(sort: OverviewFeedSort) {
  switch (sort) {
    case "oldest":
      return Clock
    case "user_asc":
      return ArrowDownAZ
    case "user_desc":
      return ArrowUpAZ
    case "newest":
    default:
      return ArrowUpDown
  }
}

export function getOverviewFeedSortLabel(sort: OverviewFeedSort): string {
  return OVERVIEW_FEED_SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Oldest first"
}

export function sortByTimestamp<T>(
  items: T[],
  getTimestamp: (item: T) => string | null | undefined,
  sort: OverviewFeedSort,
): T[] {
  const copy = [...items]
  if (sort === "oldest") {
    return copy.sort(
      (a, b) =>
        new Date(getTimestamp(a) ?? 0).getTime() - new Date(getTimestamp(b) ?? 0).getTime(),
    )
  }
  return copy.sort(
    (a, b) =>
      new Date(getTimestamp(b) ?? 0).getTime() - new Date(getTimestamp(a) ?? 0).getTime(),
  )
}

export function sortByUserLabel<T>(
  items: T[],
  getLabel: (item: T) => string,
  sort: OverviewFeedSort,
  getTimestamp: (item: T) => string | null | undefined,
): T[] {
  const copy = [...items]
  const compareNames = (a: T, b: T) => getLabel(a).localeCompare(getLabel(b), undefined, { sensitivity: "base" })
  if (sort === "user_asc") {
    return copy.sort((a, b) => {
      const byName = compareNames(a, b)
      if (byName !== 0) return byName
      return new Date(getTimestamp(b) ?? 0).getTime() - new Date(getTimestamp(a) ?? 0).getTime()
    })
  }
  if (sort === "user_desc") {
    return copy.sort((a, b) => {
      const byName = compareNames(b, a)
      if (byName !== 0) return byName
      return new Date(getTimestamp(b) ?? 0).getTime() - new Date(getTimestamp(a) ?? 0).getTime()
    })
  }
  return sortByTimestamp(copy, getTimestamp, sort)
}
