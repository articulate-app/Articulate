"use client"

import { useEffect, useMemo, useRef, type RefObject } from "react"
import { useSearchParams } from "next/navigation"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { SearchResultRow } from "./SearchResultRow"
import type { GlobalSearchDocument } from "../../lib/global-search-types"
import { groupByFriendlyDateBucket } from "../../lib/friendly-date-buckets"
import { filterLeftPaneListItems } from "../../lib/left-pane-list-filter"
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

export function MentionsFullResultsPane({
  onResultSelect,
  viewScope,
  filterQuery = "",
  embedInParentScroll = false,
  scrollRootRef = null,
}: {
  onResultSelect: (item: GlobalSearchDocument) => void
  viewScope: string
  /** Local list filter — does not hit the network per keystroke. */
  filterQuery?: string
  /** Parent page owns the single scrollbar (Inbox page layout). */
  embedInParentScroll?: boolean
  scrollRootRef?: RefObject<HTMLElement | null> | null
}) {
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const localScrollContainerRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = scrollRootRef ?? localScrollContainerRef
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
  }, [embedInParentScroll, query, scrollContainerRef])

  const mentionItems = useMemo(() => {
    const rows = query.data?.pages.flat() ?? []
    const deduped = dedupeMentions(rows)
    const normalized =
      mentionMode === "sent"
        ? deduped.map((item) => {
            if (item.entity_type !== "mention" || !item.display_payload) return item
            return {
              ...item,
              display_payload: {
                ...item.display_payload,
                meta: (item.display_payload.meta ?? []).map((entry) =>
                  (entry.label?.trim() ?? "").toLowerCase() === "is_unread"
                    ? { ...entry, value: "false" }
                    : entry,
                ),
              },
            }
          })
        : deduped
    return filterLeftPaneListItems(normalized, filterQuery)
  }, [filterQuery, mentionMode, query.data?.pages])

  const groupedItems = useMemo(
    () => groupByFriendlyDateBucket(mentionItems, (item) => getMentionCreatedAt(item)),
    [mentionItems],
  )

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

  const body = query.isLoading ? (
    <div
      className={cn(
        "flex items-center justify-center px-6 text-sm text-gray-500",
        embedInParentScroll ? "py-10" : "h-full text-xs",
      )}
    >
      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      Loading mentions...
    </div>
  ) : groupedItems.length === 0 ? (
    <div
      className={cn(
        "flex items-center justify-center px-6 text-sm text-gray-500",
        embedInParentScroll ? "py-10" : "h-full text-xs",
      )}
    >
      No mentions found.
    </div>
  ) : (
    <div className={cn(embedInParentScroll ? "w-full" : "py-1 pb-4")}>
      {groupedItems.map((group) => (
        <section key={group.label} className={cn(!embedInParentScroll && "pt-1")}>
          <div
            className={cn(
              "sticky top-0 z-10 bg-white/95 py-1.5 text-[11px] font-normal text-gray-400 backdrop-blur-sm",
              embedInParentScroll ? "px-1" : "px-3",
            )}
          >
            {group.label}
          </div>
          <div className={cn(embedInParentScroll && "divide-y divide-gray-100")}>
            {group.items.map((item, index) => (
              <SearchResultRow
                key={`${viewScope}:list:mention:${String(item.entity_id ?? item.title)}:${group.label}:${index}`}
                item={item}
                onSelect={handleMentionSelect}
                className={embedInParentScroll ? "h-auto min-h-10 px-1 py-2" : undefined}
              />
            ))}
          </div>
        </section>
      ))}
      <div ref={sentinelRef} />
      {query.isFetchingNextPage ? (
        <div className="flex items-center justify-center gap-2 py-3 text-xs text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading more...
        </div>
      ) : null}
    </div>
  )

  if (embedInParentScroll) {
    return <div className="min-w-0">{body}</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div ref={localScrollContainerRef} className="min-h-0 flex-1 overflow-auto">
        {body}
      </div>
    </div>
  )
}
