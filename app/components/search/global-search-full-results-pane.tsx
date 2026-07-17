"use client"

import { useEffect, useRef, useState } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getGlobalSearchEntityLabel,
  type GlobalSearchDocument,
  type GlobalSearchItemEntityType,
} from "../../lib/global-search-types"
import { SearchResultRow } from "./SearchResultRow"
import { MentionsFullResultsPane } from "./mentions-full-results-pane"
import { ObjectPaneScrollShell, objectPaneCenteredStateClass } from "./object-pane-content"

const PAGE_SIZE = 25

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown }
  return (
    candidate.name === "AbortError" ||
    candidate.code === "20" ||
    String(candidate.message ?? "").includes("AbortError")
  )
}

type ResultObjectScopeKey = "all" | "tasks" | "projects" | "mentions" | "users" | "teams" | "ai_threads"
type ResultsByObject = Record<ResultObjectScopeKey, GlobalSearchDocument[]>

const EMPTY_RESULTS_BY_OBJECT: ResultsByObject = {
  all: [],
  tasks: [],
  projects: [],
  mentions: [],
  users: [],
  teams: [],
  ai_threads: [],
}

function toObjectScopeKey(type: GlobalSearchItemEntityType): ResultObjectScopeKey {
  if (type === "task") return "tasks"
  if (type === "project") return "projects"
  if (type === "mention") return "mentions"
  if (type === "user") return "users"
  if (type === "team") return "teams"
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

export function GlobalSearchFullResultsPane({
  query,
  activeTab,
  viewScope,
  onResultSelect,
  getQueryKey,
  fetchPage,
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
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const shouldFetchRemote = activeTab !== "task" && activeTab !== "mention"
  const activeObjectKey = toObjectScopeKey(activeTab)
  const [resultsByObject, setResultsByObject] = useState<ResultsByObject>({ ...EMPTY_RESULTS_BY_OBJECT })
  const abortRetryAttemptsRef = useRef(0)

  const fullResultsQuery = useInfiniteQuery({
    queryKey: [...getQueryKey(activeTab), `scope:${viewScope}`, `query:${query.trim()}`],
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

  const items = resultsByObject[activeObjectKey]
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
          <div className="flex min-h-full flex-col">
            <div className="divide-y divide-gray-200">
              {items.map((item, index) => (
                <SearchResultRow
                  key={buildScopedResultKey(viewScope, "list", item, index)}
                  item={item}
                  onSelect={onResultSelect}
                />
              ))}
            </div>
            <div ref={sentinelRef} />
            {fullResultsQuery.isFetchingNextPage ? (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading more...
              </div>
            ) : null}
          </div>
        )}
    </ObjectPaneScrollShell>
  )
}
