import type { InfiniteData, QueryClient } from "@tanstack/react-query"
import type { HomeRecentItem } from "./services/home-sidebar-recents"

export const HOME_SIDEBAR_RECENTS_QUERY_KEY = "home-sidebar-recents" as const

export type HomeSidebarRecentsFeedKey =
  | "projects"
  | "tasks"
  | "mentions"
  | "users"
  | "ai_chats"

export type HomeSidebarPinnedItem = {
  feedKey: HomeSidebarRecentsFeedKey
  id: string
  title: string
  pinnedAt: string
}

export const HOME_SIDEBAR_PINNED_STORAGE_KEY = "sidebar-pinned-items-v1"

export function homeSidebarRecentsQueryKey(feedKey: HomeSidebarRecentsFeedKey) {
  return [HOME_SIDEBAR_RECENTS_QUERY_KEY, feedKey] as const
}

/**
 * Optimistically move/insert an item to the top of the first page of a home-sidebar
 * infinite query so the UI updates before the RPC refetch completes.
 */
export function bumpHomeSidebarRecentCache(
  queryClient: QueryClient,
  feedKey: HomeSidebarRecentsFeedKey,
  item: Pick<HomeRecentItem, "id" | "title"> & { recentAt?: string | null },
): void {
  const id = String(item.id)
  if (!id) return
  const recentAt = item.recentAt ?? new Date().toISOString()
  const title = (item.title || "").trim() || "Untitled"
  const bumped: HomeRecentItem = { id, title, recentAt }

  queryClient.setQueryData<InfiniteData<HomeRecentItem[]>>(
    homeSidebarRecentsQueryKey(feedKey),
    (old) => {
      if (!old?.pages?.length) {
        return {
          pages: [[bumped]],
          pageParams: [0],
        }
      }
      const pages = old.pages.map((page) => page.filter((row) => row.id !== id))
      const first = pages[0] ?? []
      pages[0] = [bumped, ...first]
      return { ...old, pages }
    },
  )
}

export function invalidateHomeSidebarRecents(
  queryClient: QueryClient,
  feedKey?: HomeSidebarRecentsFeedKey,
): void {
  if (feedKey) {
    void queryClient.invalidateQueries({ queryKey: homeSidebarRecentsQueryKey(feedKey) })
    return
  }
  void queryClient.invalidateQueries({ queryKey: [HOME_SIDEBAR_RECENTS_QUERY_KEY] })
}

/** Optimistic bump + background invalidate (server remains source of truth). */
export function bumpAndInvalidateHomeSidebarRecent(
  queryClient: QueryClient,
  feedKey: HomeSidebarRecentsFeedKey,
  item: Pick<HomeRecentItem, "id" | "title"> & { recentAt?: string | null },
): void {
  bumpHomeSidebarRecentCache(queryClient, feedKey, item)
  invalidateHomeSidebarRecents(queryClient, feedKey)
}

export function readHomeSidebarPinnedItems(): HomeSidebarPinnedItem[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(HOME_SIDEBAR_PINNED_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((row) => {
        if (!row || typeof row !== "object") return null
        const feedKey = (row as HomeSidebarPinnedItem).feedKey
        const id = (row as HomeSidebarPinnedItem).id
        const title = (row as HomeSidebarPinnedItem).title
        const pinnedAt = (row as HomeSidebarPinnedItem).pinnedAt
        if (
          typeof feedKey !== "string" ||
          typeof id !== "string" ||
          typeof title !== "string" ||
          typeof pinnedAt !== "string"
        ) {
          return null
        }
        return { feedKey, id, title, pinnedAt } satisfies HomeSidebarPinnedItem
      })
      .filter(Boolean) as HomeSidebarPinnedItem[]
  } catch {
    return []
  }
}

export function writeHomeSidebarPinnedItems(items: HomeSidebarPinnedItem[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(HOME_SIDEBAR_PINNED_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // ignore quota / private mode
  }
}

export function pinnedItemKey(feedKey: HomeSidebarRecentsFeedKey, id: string): string {
  return `${feedKey}:${id}`
}
