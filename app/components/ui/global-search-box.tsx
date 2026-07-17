"use client"

import React from "react"
import { useQuery } from "@tanstack/react-query"
import { Filter, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { IconTooltip } from "./icon-tooltip"
import { useDebounce } from "../../hooks/use-debounce"
import { SearchResultRow } from "../search/SearchResultRow"
import {
  getGlobalSearchEntityLabel,
  isGlobalSearchEntityType,
  type GlobalSearchDocument,
  type GlobalSearchItemEntityType,
} from "../../lib/global-search-types"
import {
  fetchGlobalRecentlyOpened,
  fetchGlobalSearchHistoryRecent,
  fetchGlobalSearchPreviewItems,
} from "../../lib/services/global-search"

export interface GlobalSearchBoxProps {
  /** Committed query (URL `q`). Syncs the input on external changes. */
  searchValue: string
  /** Debounced draft updates (typing). */
  onSearchChange?: (value: string) => void
  /** Commit (Enter / history / show-all). */
  onSearchCommit?: (value?: string) => void
  onClearSearch?: () => void
  isSearchOpen?: boolean
  onSearchOpenChange?: (isOpen: boolean) => void
  selectedTypeFilters?: GlobalSearchItemEntityType[]
  onToggleTypeFilter?: (type: GlobalSearchItemEntityType) => void
  onPreviewResultSelect?: (item: GlobalSearchDocument) => void
  onShowAll?: (value?: string) => void
  /** When provided, renders the inline filter button (desktop). Omit on mobile (filters live elsewhere). */
  onFilterClick?: () => void
  placeholder?: string
  /** Cmd/Ctrl+K focuses the input. Default true. */
  enableShortcut?: boolean
  className?: string
}

/**
 * The shared global-search field + live preview dropdown. This is the single source of truth for
 * search input behavior across the app (desktop `TaskHeaderBar` and mobile object headers) so both
 * surfaces type into the same `q`/committed state, show identical preview results via `SearchResultRow`,
 * and open results through the same `onPreviewResultSelect` handler. Do NOT fork this into a mobile-only
 * variant.
 */
export function GlobalSearchBox({
  searchValue,
  onSearchChange,
  onSearchCommit,
  onClearSearch,
  isSearchOpen = false,
  onSearchOpenChange,
  selectedTypeFilters = [],
  onToggleTypeFilter,
  onPreviewResultSelect,
  onShowAll,
  onFilterClick,
  placeholder,
  enableShortcut = true,
  className,
}: GlobalSearchBoxProps) {
  const searchWrapperRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const filtersRailRef = React.useRef<HTMLDivElement | null>(null)
  const previewRequestIdRef = React.useRef(0)
  const [inputValue, setInputValue] = React.useState(searchValue)
  const [previewItems, setPreviewItems] = React.useState<GlobalSearchDocument[]>([])
  const [isPreviewLoading, setIsPreviewLoading] = React.useState(false)
  const debouncedQuery = useDebounce(inputValue, 150).trim()

  React.useEffect(() => {
    setInputValue(searchValue)
  }, [searchValue])

  React.useEffect(() => {
    if (!isSearchOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!searchWrapperRef.current?.contains(event.target as Node)) {
        onSearchOpenChange?.(false)
      }
    }
    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [isSearchOpen, onSearchOpenChange])

  React.useEffect(() => {
    if (!enableShortcut) return
    const handleGlobalShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return
      if (event.altKey || event.shiftKey) return
      event.preventDefault()
      onSearchOpenChange?.(true)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
    document.addEventListener("keydown", handleGlobalShortcut)
    return () => document.removeEventListener("keydown", handleGlobalShortcut)
  }, [enableShortcut, onSearchOpenChange])

  const hasQuery = inputValue.trim().length > 0
  const visibleTypeFilters = React.useMemo(
    () =>
      selectedTypeFilters.length > 0
        ? selectedTypeFilters
        : (["task", "project", "mention", "project_briefing", "user", "team", "ai_thread"] as const),
    [selectedTypeFilters],
  )
  const getPreviewLabel = React.useCallback(
    (type: GlobalSearchDocument["entity_type"]) =>
      isGlobalSearchEntityType(type) ? getGlobalSearchEntityLabel(type) : "Recent chats",
    [],
  )
  const historyQuery = useQuery({
    queryKey: ["global-search", "header-history", 7],
    queryFn: ({ signal }) => fetchGlobalSearchHistoryRecent(7, signal),
    enabled: isSearchOpen && !hasQuery,
    staleTime: 30_000,
  })
  const recentlyOpenedQuery = useQuery({
    queryKey: ["global-search", "header-recently-opened", 8],
    queryFn: ({ signal }) => fetchGlobalRecentlyOpened({ limit: 8, signal }),
    enabled: isSearchOpen && !hasQuery,
    staleTime: 30_000,
  })

  React.useEffect(() => {
    if (!onSearchChange) return
    onSearchChange(debouncedQuery)
  }, [debouncedQuery, onSearchChange])

  React.useEffect(() => {
    const el = filtersRailRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      let deltaX = e.deltaX
      let deltaY = e.deltaY
      if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        deltaX *= 16
        deltaY *= 16
      } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        deltaX *= el.clientWidth
        deltaY *= el.clientHeight
      }
      const delta = e.shiftKey ? deltaY : Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY
      if (delta === 0) return
      e.preventDefault()
      el.scrollLeft += delta
    }
    el.addEventListener("wheel", onWheel, { passive: false, capture: true })
    return () => el.removeEventListener("wheel", onWheel, true)
  }, [visibleTypeFilters.length])

  React.useEffect(() => {
    if (!isSearchOpen || debouncedQuery.length === 0) {
      previewRequestIdRef.current += 1
      setPreviewItems([])
      setIsPreviewLoading(false)
      return
    }
    const requestId = previewRequestIdRef.current + 1
    previewRequestIdRef.current = requestId
    const controller = new AbortController()
    setIsPreviewLoading(true)
    void fetchGlobalSearchPreviewItems({
      query: debouncedQuery,
      entityTypes: selectedTypeFilters.length > 0 ? selectedTypeFilters : null,
      limit: 7,
      signal: controller.signal,
    })
      .then((items) => {
        if (previewRequestIdRef.current !== requestId) return
        setPreviewItems(items)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        if (previewRequestIdRef.current !== requestId) return
        console.error("Failed to load preview items", error)
        setPreviewItems([])
      })
      .finally(() => {
        if (previewRequestIdRef.current !== requestId) return
        setIsPreviewLoading(false)
      })
    return () => {
      controller.abort()
    }
  }, [debouncedQuery, isSearchOpen, selectedTypeFilters])

  const handleClear = React.useCallback(() => {
    setInputValue("")
    onClearSearch?.()
    onSearchOpenChange?.(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [onClearSearch, onSearchOpenChange])

  return (
    <div ref={searchWrapperRef} className={cn("relative w-full", className)}>
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder || "Search tasks, projects, people..."}
        value={inputValue}
        onChange={(e) => {
          const nextValue = e.target.value
          if (nextValue === "") {
            handleClear()
            return
          }
          setInputValue(nextValue)
        }}
        onFocus={() => onSearchOpenChange?.(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            onSearchCommit?.(event.currentTarget.value)
          } else if (event.key === "Escape") {
            onSearchOpenChange?.(false)
          }
        }}
        autoComplete="off"
        className="w-full rounded-md border py-2 pl-10 pr-20 text-base focus:outline-none focus:ring-2 focus:ring-gray-200"
      />
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      {inputValue ? (
        <IconTooltip label="Clear search">
          <button
            type="button"
            aria-label="Clear search"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleClear}
            className={cn(
              "absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none",
              onFilterClick ? "right-10" : "right-2",
            )}
          >
            <X className="h-4 w-4" />
          </button>
        </IconTooltip>
      ) : null}
      {onFilterClick ? (
        <IconTooltip label="Filter">
          <button
            type="button"
            aria-label="Filter tasks"
            onClick={onFilterClick}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
            tabIndex={0}
          >
            <Filter className="h-5 w-5" />
          </button>
        </IconTooltip>
      ) : null}

      {isSearchOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 flex max-h-[56dvh] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl md:max-h-[32rem]">
          <div
            ref={filtersRailRef}
            className="ai-chat-tabs-scroll flex shrink-0 flex-nowrap gap-1.5 overflow-x-auto overflow-y-hidden border-b border-gray-100 px-3 py-3 scroll-smooth"
          >
            {visibleTypeFilters.map((type) => {
              const isSelected = selectedTypeFilters.includes(type)
              return (
                <button
                  key={type}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onToggleTypeFilter?.(type)}
                  className={
                    isSelected
                      ? "inline-flex h-8 max-w-[9rem] shrink-0 items-center truncate whitespace-nowrap rounded-full bg-gray-900 px-2.5 py-1 text-xs font-medium text-white"
                      : "inline-flex h-8 max-w-[9rem] shrink-0 items-center truncate whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                  }
                >
                  {getGlobalSearchEntityLabel(type)}
                </button>
              )
            })}
          </div>

          {!hasQuery ? (
            <div className="min-h-0 max-h-[24rem] overflow-y-auto px-2 py-2">
              <div className="px-2 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                Recent searches
              </div>
              {historyQuery.isLoading ? (
                <div className="px-3 py-6 text-sm text-gray-500">Loading recent searches...</div>
              ) : historyQuery.data?.length === 0 ? (
                <div className="px-3 py-6 text-sm text-gray-500">No recent searches.</div>
              ) : (
                (historyQuery.data ?? []).map((item) => (
                  <button
                    key={`${item.term}:${item.created_at ?? ""}`}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onSearchCommit?.(item.term)}
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {item.term}
                  </button>
                ))
              )}
              <div className="mt-3 border-t border-gray-100 px-2 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                Recently opened
              </div>
              {recentlyOpenedQuery.isLoading ? (
                <div className="px-3 py-3 text-sm text-gray-500">Loading recently opened...</div>
              ) : recentlyOpenedQuery.data?.length === 0 ? (
                <div className="px-3 py-3 text-sm text-gray-500">No recently opened items.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {(recentlyOpenedQuery.data ?? []).map((item, index) => (
                    <SearchResultRow
                      key={`recently-opened:${item.entity_type}:${item.entity_id ?? index}`}
                      item={item}
                      onSelect={(result) => onPreviewResultSelect?.(result)}
                      className="px-2 py-2"
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="min-h-0 max-h-[24rem] overflow-y-auto px-2 py-2">
              {isPreviewLoading && previewItems.length === 0 ? (
                <div className="px-3 py-6 text-sm text-gray-500">Searching...</div>
              ) : previewItems.length === 0 ? (
                <div className="px-3 py-6 text-sm text-gray-500">No preview results.</div>
              ) : (
                previewItems.map((item, index) => (
                  <SearchResultRow
                    key={getPreviewLabel(item.entity_type) + ":" + (item.entity_id ?? index)}
                    item={item}
                    onSelect={(result) => onPreviewResultSelect?.(result)}
                    className="px-3 py-2"
                    variant="preview"
                  />
                ))
              )}
            </div>
          )}

          {hasQuery ? (
            <div className="shrink-0 border-t border-gray-100 px-3 py-3">
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onShowAll?.(inputValue)}
                className="w-full rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Show all search results
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
