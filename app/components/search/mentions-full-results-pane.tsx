"use client"

import { useEffect, useMemo, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { SearchResultRow } from "./SearchResultRow"
import type { GlobalSearchDocument } from "../../lib/global-search-types"
import {
  fetchMentionsInbox,
  type MentionsInboxMode,
  type MentionsInboxSeenFilter,
} from "../../lib/services/global-search"

const PAGE_SIZE = 50

type MentionInboxTab = "received" | "sent" | "unseen"

function getMetaValue(item: GlobalSearchDocument, key: string): string | null {
  const meta = item.display_payload?.meta ?? []
  const match = meta.find((entry) => (entry.label?.trim() ?? "").toLowerCase() === key.toLowerCase())
  return match?.value?.trim() ?? null
}

function getMentionCreatedAt(item: GlobalSearchDocument): string | null {
  return (
    getMetaValue(item, "created_at") ??
    (typeof item.raw.created_at === "string" ? item.raw.created_at : null) ??
    item.created_at
  )
}

function isMentionUnread(item: GlobalSearchDocument): boolean {
  return getMetaValue(item, "is_unread") === "true"
}

function markMentionSeen(item: GlobalSearchDocument): GlobalSearchDocument {
  if (item.entity_type !== "mention" || !item.display_payload) return item
  const hasUnreadMeta = (item.display_payload.meta ?? []).some(
    (entry) => (entry.label?.trim() ?? "").toLowerCase() === "is_unread",
  )
  return {
    ...item,
    raw: {
      ...item.raw,
      is_seen: true,
    },
    display_payload: {
      ...item.display_payload,
      meta: hasUnreadMeta
        ? (item.display_payload.meta ?? []).map((entry) =>
            (entry.label?.trim() ?? "").toLowerCase() === "is_unread" ? { ...entry, value: "false" } : entry,
          )
        : [...(item.display_payload.meta ?? []), { label: "is_unread", value: "false" }],
    },
  }
}

function dedupeMentions(items: GlobalSearchDocument[]): GlobalSearchDocument[] {
  const seen = new Set<string>()
  const deduped: GlobalSearchDocument[] = []
  for (const item of items) {
    const key = item.entity_id ? `mention:${item.entity_id}` : `mention:fallback:${item.title}:${item.created_at ?? ""}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }
  return deduped
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function formatDateBucket(value: string | null): string {
  if (!value) return "Unknown date"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown date"

  const today = startOfDay(new Date())
  const target = startOfDay(date)
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000)
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date)
}

export function MentionsFullResultsPane({
  onResultSelect,
  viewScope,
}: {
  onResultSelect: (item: GlobalSearchDocument) => void
  viewScope: string
}) {
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const selectedTab: MentionInboxTab = (() => {
    const raw = searchParams.get("mentionsTab")
    if (raw === "sent" || raw === "unseen") return raw
    return "received"
  })()
  const mentionMode: MentionsInboxMode = selectedTab === "sent" ? "sent" : "received"
  const seenFilterForQuery: MentionsInboxSeenFilter = selectedTab === "unseen" ? "unseen" : "all"

  const query = useInfiniteQuery({
    queryKey: ["mentions-inbox", mentionMode, seenFilterForQuery, `scope:${viewScope}`],
    queryFn: ({ pageParam, signal }) =>
      fetchMentionsInbox({
        mode: mentionMode,
        seenFilter: seenFilterForQuery,
        offset: pageParam as number,
        limit: PAGE_SIZE,
        signal,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => (lastPage.length < PAGE_SIZE ? undefined : allPages.flat().length),
  })

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver((entries) => {
      const isVisible = entries.some((entry) => entry.isIntersecting)
      if (isVisible && query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage()
      }
    }, {
      root: scrollContainerRef.current,
      threshold: 0.1,
      rootMargin: "200px 0px 200px 0px",
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [query])

  const mentionItems = useMemo(() => {
    const rows = query.data?.pages.flat() ?? []
    const deduped = dedupeMentions(rows)
    if (mentionMode === "sent") {
      return deduped.map((item) => {
        if (item.entity_type !== "mention" || !item.display_payload) return item
        return {
          ...item,
          display_payload: {
            ...item.display_payload,
            meta: (item.display_payload.meta ?? []).map((entry) =>
              (entry.label?.trim() ?? "").toLowerCase() === "is_unread" ? { ...entry, value: "false" } : entry,
            ),
          },
        }
      })
    }
    return deduped
  }, [mentionMode, query.data?.pages])

  const groupedItems = useMemo(() => {
    const groups: Array<{ label: string; items: GlobalSearchDocument[] }> = []
    const map = new Map<string, GlobalSearchDocument[]>()
    for (const item of mentionItems) {
      const key = formatDateBucket(getMentionCreatedAt(item))
      const existing = map.get(key)
      if (existing) {
        existing.push(item)
      } else {
        map.set(key, [item])
      }
    }
    for (const [label, items] of map.entries()) {
      groups.push({ label, items })
    }
    return groups
  }, [mentionItems])

  const handleMentionSelect = (item: GlobalSearchDocument) => {
    const mentionId = item.entity_id
    if (mentionId) {
      queryClient.setQueriesData({ queryKey: ["mentions-inbox"] }, (currentData: any) => {
        if (!currentData?.pages || !Array.isArray(currentData.pages)) return currentData
        return {
          ...currentData,
          pages: currentData.pages.map((page: GlobalSearchDocument[]) =>
            page.map((entry) => {
              if (entry.entity_type !== "mention") return entry
              if (String(entry.entity_id ?? "") !== String(mentionId)) return entry
              return markMentionSeen(entry)
            }),
          ),
        }
      })
    }
    onResultSelect(item)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-auto">
        {query.isLoading ? (
          <div className="flex h-full items-center justify-center px-6 text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading mentions...
          </div>
        ) : groupedItems.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-sm text-gray-500">
            No mentions found.
          </div>
        ) : (
          <div className="pb-4">
            {groupedItems.map((group) => (
              <section key={group.label} className="pt-2">
                <div className="sticky top-0 z-10 bg-white px-3 py-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                  {group.label}
                </div>
                <div className="divide-y divide-gray-200">
                  {group.items.map((item, index) => (
                    <SearchResultRow
                      key={`${viewScope}:list:mention:${String(item.entity_id ?? item.title)}:${group.label}:${index}`}
                      item={item}
                      onSelect={handleMentionSelect}
                    />
                  ))}
                </div>
              </section>
            ))}
            <div ref={sentinelRef} />
            {query.isFetchingNextPage ? (
              <div className="flex items-center justify-center gap-2 py-3 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading more...
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
