"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
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
import { AiThreadsFullResultsPane } from "./ai-threads-full-results-pane"
import { ObjectPaneScrollShell, objectPaneCenteredStateClass } from "./object-pane-content"
import { ObjectDirectoryResultRow } from "../workspace/object-directory-result-row"
import { ArtifactDirectoryResultRow } from "../workspace/artifact-directory-result-row"
import { fetchUserProjectLabelsByUserIds } from "../../lib/services/users"
import { fetchArtifactDirectoryMeta } from "../../lib/services/artifacts"

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
  embedInParentScroll = false,
  scrollRootRef = null,
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
  /**
   * When true, skip the inner ObjectPaneScrollShell so a parent page owns the
   * single scrollbar (Projects / Templates page layout).
   */
  embedInParentScroll?: boolean
  /** Scroll root for infinite-scroll IntersectionObserver when embedded. */
  scrollRootRef?: RefObject<HTMLElement | null> | null
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const localScrollContainerRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = scrollRootRef ?? localScrollContainerRef
  const shouldFetchRemote =
    activeTab !== "task" && activeTab !== "mention" && activeTab !== "ai_thread"
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
    embedInParentScroll,
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

  const directoryUserIds = useMemo(() => {
    if (!directoryMode || activeTab !== "user") return [] as number[]
    const ids: number[] = []
    for (const item of items) {
      const n = Number(item.entity_id)
      if (Number.isFinite(n) && n > 0) ids.push(Math.trunc(n))
    }
    return Array.from(new Set(ids)).sort((a, b) => a - b)
  }, [activeTab, directoryMode, items])

  const userProjectsQuery = useQuery({
    queryKey: ["directory-user-project-labels", directoryUserIds],
    enabled: directoryUserIds.length > 0,
    staleTime: 60_000,
    queryFn: () => fetchUserProjectLabelsByUserIds(directoryUserIds),
  })

  const artifactIds = useMemo(() => {
    if (activeTab !== "artifact") return [] as string[]
    return Array.from(
      new Set(
        items
          .map((item) => String(item.entity_id ?? "").trim())
          .filter(Boolean),
      ),
    )
  }, [activeTab, items])

  const artifactMetaQuery = useQuery({
    queryKey: ["artifact-directory-meta", artifactIds],
    enabled: artifactIds.length > 0,
    staleTime: 60_000,
    queryFn: () => fetchArtifactDirectoryMeta(artifactIds),
  })

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
        embedInParentScroll={embedInParentScroll}
        scrollRootRef={scrollRootRef}
      />
    )
  }

  if (activeTab === "ai_thread") {
    return (
      <AiThreadsFullResultsPane
        onResultSelect={onResultSelect}
        viewScope={viewScope}
        searchQuery={query}
        embedInParentScroll={embedInParentScroll}
        scrollRootRef={scrollRootRef}
      />
    )
  }

  return (
    <ResultsShell
      embedInParentScroll={embedInParentScroll}
      scrollRef={embedInParentScroll ? undefined : localScrollContainerRef}
    >
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
        <div
          className={cn(
            "flex min-h-full flex-col py-1",
            activeTab === "artifact" ? "artifact-directory-list min-w-0 w-full overflow-x-hidden" : null,
            directoryMode && !embedInParentScroll ? DIRECTORY_CONTENT_CLASS : null,
            directoryMode && embedInParentScroll ? "w-full" : null,
          )}
        >
          {directoryMode && (activeTab === "user" || activeTab === "project") ? (
            <div
              className={cn(
                "sticky top-0 z-10 flex items-center gap-3 bg-white py-1.5",
                embedInParentScroll ? "px-1" : "border-b border-gray-100 px-4",
              )}
            >
              <span className="min-w-0 flex-1 text-sm font-medium text-gray-500">
                Name
              </span>
              <span className="w-36 shrink-0 text-right text-sm font-medium text-gray-500">
                {activeTab === "user" ? "Projects" : "Last update"}
              </span>
              <span className="w-7 shrink-0" aria-hidden />
            </div>
          ) : null}
          {activeTab === "artifact" ? (
            <div
              className={cn(
                "sticky top-0 z-10 flex min-w-0 items-center gap-2 bg-white py-1.5 text-sm font-medium text-gray-500",
                embedInParentScroll ? "px-1" : "border-b border-gray-100 px-3",
              )}
            >
              <span className="min-w-0 flex-1 truncate">Title</span>
              <span className="artifact-directory-col-project">Project</span>
              <span className="artifact-directory-col-created">Created</span>
              <span className="w-7 shrink-0" aria-hidden />
            </div>
          ) : null}
          {aiGroupedItems
            ? aiGroupedItems.map((group) => (
                <section key={group.label} className="pt-1">
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
                        key={buildScopedResultKey(viewScope, group.label, item, index)}
                        item={item}
                        onSelect={onResultSelect}
                        className={
                          embedInParentScroll ? "h-auto min-h-10 px-1 py-2" : undefined
                        }
                      />
                    ))}
                  </div>
                </section>
              ))
            : directoryMode && (activeTab === "user" || activeTab === "project") ? (
              <div className={cn(embedInParentScroll && "divide-y divide-gray-100")}>
                {items.map((item, index) => (
                  <ObjectDirectoryResultRow
                    key={buildScopedResultKey(viewScope, "list", item, index)}
                    item={item}
                    mode={activeTab === "user" ? "user" : "project"}
                    denseInset={embedInParentScroll}
                    recentAtOverride={
                      directoryRecentAtById.get(String(item.entity_id ?? "").trim()) ?? null
                    }
                    secondaryOverride={
                      activeTab === "user"
                        ? userProjectsQuery.data?.[String(item.entity_id ?? "").trim()] ?? null
                        : null
                    }
                    isSelected={
                      !!selectedEntityId &&
                      String(item.entity_id ?? "").trim() === String(selectedEntityId).trim()
                    }
                    onSelect={onResultSelect}
                  />
                ))}
              </div>
            ) : activeTab === "artifact" ? (
              <div className={cn(embedInParentScroll && "divide-y divide-gray-100")}>
                {items.map((item, index) => {
                  const artifactId = String(item.entity_id ?? "").trim()
                  const artifactMeta = artifactId
                    ? artifactMetaQuery.data?.[artifactId]
                    : null
                  return (
                    <ArtifactDirectoryResultRow
                      key={buildScopedResultKey(viewScope, "list", item, index)}
                      item={item}
                      denseInset={embedInParentScroll}
                      projectLabelOverride={artifactMeta?.projectName ?? null}
                      createdAtOverride={artifactMeta?.createdAt ?? null}
                      isSelected={
                        !!selectedEntityId &&
                        artifactId === String(selectedEntityId).trim()
                      }
                      onSelect={onResultSelect}
                    />
                  )
                })}
              </div>
            ) : (
              items.map((item, index) => (
                <SearchResultRow
                  key={buildScopedResultKey(viewScope, "list", item, index)}
                  item={item}
                  onSelect={onResultSelect}
                />
              ))
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
    </ResultsShell>
  )
}

function ResultsShell({
  embedInParentScroll,
  scrollRef,
  children,
}: {
  embedInParentScroll: boolean
  scrollRef?: RefObject<HTMLDivElement | null>
  children: ReactNode
}) {
  if (embedInParentScroll) {
    return <div className="min-w-0 w-full overflow-x-hidden">{children}</div>
  }
  return <ObjectPaneScrollShell scrollRef={scrollRef}>{children}</ObjectPaneScrollShell>
}
