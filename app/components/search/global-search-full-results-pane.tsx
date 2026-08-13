"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getGlobalSearchEntityLabel,
  type GlobalSearchDocument,
  type GlobalSearchItemEntityType,
} from "../../lib/global-search-types"
import { groupByFriendlyDateBucket } from "../../lib/friendly-date-buckets"
import { filterLeftPaneListItems, LEFT_PANE_CLIENT_FILTER_TYPES } from "../../lib/left-pane-list-filter"
import {
  fetchHomeRecentProjects,
  fetchHomeRecentUsers,
} from "../../lib/services/home-sidebar-recents"
import { SearchResultRow } from "./SearchResultRow"
import { MentionsFullResultsPane } from "./mentions-full-results-pane"
import { ObjectPaneScrollShell, objectPaneCenteredStateClass } from "./object-pane-content"
import { ObjectDirectoryResultRow } from "../workspace/object-directory-result-row"

const PAGE_SIZE = 25
const DIRECTORY_RECENCY_LIMIT = 500
const DIRECTORY_CONTENT_CLASS = "mx-auto w-full max-w-2xl"

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown }
  return (
    candidate.name === "AbortError" ||
    candidate.code === "20" ||
    String(candidate.message ?? "").includes("AbortError")
  )
}

type ResultObjectScopeKey = "all" | "tasks" | "projects" | "mentions" | "users" | "teams" | "ai_threads" | "artifacts"
type ResultsByObject = Record<ResultObjectScopeKey, GlobalSearchDocument[]>

const EMPTY_RESULTS_BY_OBJECT: ResultsByObject = {
  all: [],
  tasks: [],
  projects: [],
  mentions: [],
  users: [],
  teams: [],
  ai_threads: [],
  artifacts: [],
}

function toObjectScopeKey(type: GlobalSearchItemEntityType): ResultObjectScopeKey {
  if (type === "task") return "tasks"
  if (type === "project") return "projects"
  if (type === "mention") return "mentions"
  if (type === "user") return "users"
  if (type === "team") return "teams"
  if (type === "artifact") return "artifacts"
  return "ai_threads"
}

function buildScopedResultKey(
  viewScope: string,
  sectionType: string,
  item: GlobalSearchDocument,
  index: number,
): string {
  const idPart =
    item.entity_id ??
    item.task_id ??
    item.project_id ??
    item.thread_id ??
    item.url ??
    item.display_payload?.title ??
    item.title
  return `${viewScope}:${sectionType}:${item.entity_type}:${String(idPart)}:${index}`
}

function getMetaValue(item: GlobalSearchDocument, key: string): string | null {
  const meta = item.display_payload?.meta ?? []
  const match = meta.find((entry) => (entry.label?.trim() ?? "").toLowerCase() === key.toLowerCase())
  return match?.value?.trim() ?? null
}

function getAiThreadDate(item: GlobalSearchDocument): string | null {
  return (
    getMetaValue(item, "last_message_at") ??
    getMetaValue(item, "created_at") ??
    (typeof item.raw?.updated_at === "string" ? item.raw.updated_at : null) ??
    (typeof item.raw?.last_message_at === "string" ? item.raw.last_message_at : null) ??
    item.created_at ??
    null
  )
}

export function GlobalSearchFullResultsPane({
  query,
  activeTab,
  viewScope,
  onResultSelect,
  getQueryKey,
  fetchPage,
  directoryMode = false,
  selectedEntityId = null,
}: {
  query: string
  activeTab: GlobalSearchItemEntityType
  viewScope: string
  onResultSelect: (item: GlobalSearchDocument) => void
  getQueryKey: (entityType: GlobalSearchItemEntityType) => unknown[]
  fetchPage: (args: {
    entityType: GlobalSearchItemEntityType
    offset: number
    limit: number
    signal?: AbortSignal
  }) => Promise<GlobalSearchDocument[]>
  /** Users/Projects directory: column headers + name/meta + ⋯ menu, no avatars. */
  directoryMode?: boolean
  /** Currently open entity id (e.g. centerProjectId) for row highlight. */
  selectedEntityId?: string | null
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const shouldFetchRemote = activeTab !== "task" && activeTab !== "mention"
  const usesClientFilter = LEFT_PANE_CLIENT_FILTER_TYPES.has(activeTab)
  const activeObjectKey = toObjectScopeKey(activeTab)
  const [resultsByObject, setResultsByObject] = useState<ResultsByObject>({ ...EMPTY_RESULTS_BY_OBJECT })
  const abortRetryAttemptsRef = useRef(0)

  const fullResultsQuery = useInfiniteQuery({
    // Client-filtered object lists keep a stable key so typing does not refetch.
    queryKey: [
      ...getQueryKey(activeTab),
      `scope:${viewScope}`,
      usesClientFilter ? "local-filter" : `query:${query.trim()}`,
    ],
    queryFn: ({ pageParam, signal }) =>
      fetchPage({
        entityType: activeTab,
        offset: pageParam as number,
        limit: PAGE_SIZE,
        signal,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const nextOffset = lastPage.length < PAGE_SIZE ? undefined : allPages.flat().length
      if (activeTab === "project") {
        console.log("[left-list][projects] nextCursor", nextOffset)
      } else if (activeTab === "user") {
        console.log("[left-list][users] nextCursor", nextOffset)
      }
      return nextOffset
    },
    enabled: shouldFetchRemote,
  })

  const directoryRecencyQuery = useQuery({
    queryKey: ["directory-recency", activeTab, DIRECTORY_RECENCY_LIMIT],
    queryFn: async () => {
      if (activeTab === "project") {
        return fetchHomeRecentProjects({ limit: DIRECTORY_RECENCY_LIMIT, offset: 0 })
      }
      return fetchHomeRecentUsers({ limit: DIRECTORY_RECENCY_LIMIT, offset: 0 })
    },
    enabled: directoryMode && (activeTab === "project" || activeTab === "user"),
    staleTime: 60_000,
  })

  const directoryRecentAtById = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of directoryRecencyQuery.data ?? []) {
      if (!row.id || !row.recentAt) continue
      map.set(row.id, row.recentAt)
    }
    return map
  }, [directoryRecencyQuery.data])

  useEffect(() => {
    if (!shouldFetchRemote) return
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver((entries) => {
      const isVisible = entries.some((entry) => entry.isIntersecting)
      if (isVisible && activeTab === "project") {
        console.log("[left-list][projects] sentinel visible")
        console.log("[left-list][projects] hasNextPage", fullResultsQuery.hasNextPage)
      } else if (isVisible && activeTab === "user") {
        console.log("[left-list][users] sentinel visible")
        console.log("[left-list][users] hasNextPage", fullResultsQuery.hasNextPage)
      }
      if (isVisible && fullResultsQuery.hasNextPage && !fullResultsQuery.isFetchingNextPage) {
        if (activeTab === "project") {
          console.log("[left-list][projects] fetchNextPage")
        } else if (activeTab === "user") {
          console.log("[left-list][users] fetchNextPage")
        }
        void fullResultsQuery.fetchNextPage()
      }
    }, {
      root: scrollContainerRef.current,
      threshold: 0.1,
      rootMargin: "200px 0px 200px 0px",
    })

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [
    fullResultsQuery,
    fullResultsQuery.fetchNextPage,
    fullResultsQuery.hasNextPage,
    fullResultsQuery.isFetchingNextPage,
    shouldFetchRemote,
  ])

  useEffect(() => {
    setResultsByObject({ ...EMPTY_RESULTS_BY_OBJECT })
    abortRetryAttemptsRef.current = 0
  }, [viewScope])

  useEffect(() => {
    const nextItems = fullResultsQuery.data?.pages.flat() ?? []
    setResultsByObject((current) => ({
      ...current,
      [activeObjectKey]: nextItems,
    }))
  }, [activeObjectKey, fullResultsQuery.data?.pages])

  const items = useMemo(() => {
    const loaded = resultsByObject[activeObjectKey]
    return usesClientFilter ? filterLeftPaneListItems(loaded, query) : loaded
  }, [activeObjectKey, query, resultsByObject, usesClientFilter])
  const aiGroupedItems = useMemo(
    () =>
      activeTab === "ai_thread"
        ? groupByFriendlyDateBucket(items, (item) => getAiThreadDate(item))
        : null,
    [activeTab, items],
  )
  const hasFetched = fullResultsQuery.status === "success"
  const fetchError = fullResultsQuery.error
  const hasAbortError = isAbortError(fetchError)

  useEffect(() => {
    if (!hasAbortError) return
    if (fullResultsQuery.isFetching) return
    if (abortRetryAttemptsRef.current >= 3) return
    abortRetryAttemptsRef.current += 1
    void fullResultsQuery.refetch()
  }, [fullResultsQuery.isFetching, fullResultsQuery.refetch, hasAbortError])

  if (activeTab === "mention") {
    return (
      <MentionsFullResultsPane
        onResultSelect={onResultSelect}
        viewScope={viewScope}
        filterQuery={query}
      />
    )
  }

  return (
    <ObjectPaneScrollShell scrollRef={scrollContainerRef}>
      {fullResultsQuery.isLoading ? (
        <div className={objectPaneCenteredStateClass()}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading {getGlobalSearchEntityLabel(activeTab).toLowerCase()}...
        </div>
      ) : fullResultsQuery.isError && !hasAbortError ? (
        <div className={cn(objectPaneCenteredStateClass(), "text-red-500")}>
          Unable to load {getGlobalSearchEntityLabel(activeTab).toLowerCase()} results.
        </div>
      ) : hasFetched && items.length === 0 ? (
        <div className={objectPaneCenteredStateClass()}>
          No {getGlobalSearchEntityLabel(activeTab).toLowerCase()} results found.
        </div>
      ) : !hasFetched || hasAbortError ? (
        <div className={objectPaneCenteredStateClass()}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading {getGlobalSearchEntityLabel(activeTab).toLowerCase()}...
        </div>
      ) : (
        <div className={cn("flex min-h-full flex-col py-1", directoryMode ? DIRECTORY_CONTENT_CLASS : null)}>
          {directoryMode && (activeTab === "user" || activeTab === "project") ? (
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-1.5">
              <span className="min-w-0 flex-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Name
              </span>
              <span className="w-28 shrink-0 text-right text-[11px] font-medium uppercase tracking-wide text-gray-400">
                {activeTab === "user" ? "Projects" : "Last update"}
              </span>
              <span className="w-7 shrink-0" aria-hidden />
            </div>
          ) : null}
          {aiGroupedItems
            ? aiGroupedItems.map((group) => (
                <section key={group.label} className="pt-1">
                  <div className="sticky top-0 z-10 bg-white/95 px-3 py-1.5 text-[11px] font-normal text-gray-400 backdrop-blur-sm">
                    {group.label}
                  </div>
                  {group.items.map((item, index) => (
                    <SearchResultRow
                      key={buildScopedResultKey(viewScope, group.label, item, index)}
                      item={item}
                      onSelect={onResultSelect}
                    />
                  ))}
                </section>
              ))
            : items.map((item, index) =>
                directoryMode && (activeTab === "user" || activeTab === "project") ? (
                  <ObjectDirectoryResultRow
                    key={buildScopedResultKey(viewScope, "list", item, index)}
                    item={item}
                    mode={activeTab === "user" ? "user" : "project"}
                    recentAtOverride={
                      directoryRecentAtById.get(String(item.entity_id ?? "").trim()) ?? null
                    }
                    isSelected={
                      !!selectedEntityId &&
                      String(item.entity_id ?? "").trim() === String(selectedEntityId).trim()
                    }
                    onSelect={onResultSelect}
                  />
                ) : (
                  <SearchResultRow
                    key={buildScopedResultKey(viewScope, "list", item, index)}
                    item={item}
                    onSelect={onResultSelect}
                  />
                ),
              )}
          <div ref={sentinelRef} />
          {fullResultsQuery.isFetchingNextPage ? (
            <div className="flex items-center justify-center gap-2 py-3 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading more...
            </div>
          ) : null}
        </div>
      )}
    </ObjectPaneScrollShell>
  )
}
