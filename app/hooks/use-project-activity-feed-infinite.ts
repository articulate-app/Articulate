"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import {
  listProjectActivityFeedPage,
  type ProjectActivityFeedRow,
  type ProjectActivityFeedCursor,
  type ProjectActivityFeedSortConfig,
  type ProjectActivityFeedFilters,
} from "../lib/services/project-activity"

interface UseProjectActivityFeedInfiniteOptions {
  projectId: number
  pageSize?: number
  sort?: ProjectActivityFeedSortConfig
  filters?: ProjectActivityFeedFilters | null
  enabled?: boolean
}

export function useProjectActivityFeedInfinite({
  projectId,
  pageSize = 50,
  sort = { field: "timestamp", direction: "desc" },
  filters,
  enabled = true,
}: UseProjectActivityFeedInfiniteOptions) {
  const filtersKey = filters
    ? JSON.stringify({
        search: filters.search ?? null,
        userIds: filters.userIds ?? null,
        actions: filters.actions ?? null,
        fromTimestamp: filters.fromTimestamp ?? null,
        toTimestamp: filters.toTimestamp ?? null,
      })
    : ""
  const queryKey = ["project-activity-feed", projectId, pageSize, sort.field, sort.direction, filtersKey] as const

  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: null as ProjectActivityFeedCursor | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await listProjectActivityFeedPage({
        projectId,
        pageSize,
        sort,
        cursor: pageParam ?? undefined,
        filters,
      })
      if (error) throw error
      return data ?? []
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length < pageSize) return undefined
      const last = lastPage[lastPage.length - 1]
      const sortValue = last[sort.field]
      return {
        sortField: sort.field,
        sortDirection: sort.direction,
        lastValue: sortValue != null ? String(sortValue) : null,
        lastUid: last.uid,
      }
    },
    enabled: enabled && Number.isFinite(projectId),
  })

  const logs = useMemo(() => {
    const all = query.data?.pages.flat() ?? []
    const seen = new Set<string>()
    const deduped: ProjectActivityFeedRow[] = []
    for (const row of all) {
      if (!row?.uid) continue
      if (seen.has(row.uid)) continue
      seen.add(row.uid)
      deduped.push(row)
    }
    return deduped
  }, [query.data])

  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const fetchNextPage = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage()
    }
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage])

  useEffect(() => {
    const sentinel = loadMoreRef.current
    if (!sentinel || !query.hasNextPage || query.isFetchingNextPage) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
          query.fetchNextPage()
        }
      },
      { threshold: 0.1, rootMargin: "50px" }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage])

  return {
    logs,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasMore: query.hasNextPage ?? false,
    error: query.error,
    fetchNextPage,
    loadMoreRef,
    refetch: query.refetch,
  }
}
