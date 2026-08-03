"use client"

import React from "react"
import { useQuery } from "@tanstack/react-query"
import { Clock, Lightbulb, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDebounce } from "../../hooks/use-debounce"
import { SearchResultRow } from "./SearchResultRow"
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
import {
  OPEN_KEYWORD_RESEARCH_EVENT,
  type OpenKeywordResearchDetail,
} from "../ui/sidebar-home-feed"

const DEFAULT_PREVIEW_TYPES = [
  "task",
  "project",
  "mention",
  "user",
  "ai_thread",
  "artifact",
] as const satisfies readonly GlobalSearchItemEntityType[]

export type GlobalSearchPreviewPanelProps = {
  selectedTypeFilters?: GlobalSearchItemEntityType[]
  onToggleTypeFilter?: (type: GlobalSearchItemEntityType) => void
  onPreviewResultSelect?: (item: GlobalSearchDocument) => void
  onSearchCommit?: (value?: string) => void
  onShowAll?: (value?: string) => void
  onClearSearch?: () => void
  /** Sync draft query to the shared global-search controller (optional). */
  onSearchChange?: (value: string) => void
  /** Initial / controlled query (e.g. committed URL `q`). */
  searchValue?: string
  /** When true, renders a search field above the preview body. */
  showInput?: boolean
  inputPlaceholder?: string
  /** Called after an action that should dismiss the host dropdown/popover. */
  onRequestClose?: () => void
  className?: string
  /** Enable fetching. Host should set true while the panel is visible. */
  enabled?: boolean
  /**
   * Controlled input (when provided with onInputValueChange). Used by GlobalSearchBox
   * so the header field and panel share one value.
   */
  inputValue?: string
  onInputValueChange?: (value: string) => void
  autoFocusInput?: boolean
}

/**
 * Shared preview body used by the header search dropdown and the middle-pane "+" menu.
 * Keep this the single source of truth for type pills, recent searches, recently opened,
 * live preview rows, and the keyword-volumes shortcut row.
 */
export function GlobalSearchPreviewPanel({
  selectedTypeFilters = [],
  onToggleTypeFilter,
  onPreviewResultSelect,
  onSearchCommit,
  onShowAll,
  onClearSearch,
  onSearchChange,
  searchValue = "",
  showInput = false,
  inputPlaceholder = "Search tasks, projects, people...",
  onRequestClose,
  className,
  enabled = true,
  inputValue: controlledInputValue,
  onInputValueChange,
  autoFocusInput = false,
}: GlobalSearchPreviewPanelProps) {
  const filtersRailRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const previewRequestIdRef = React.useRef(0)
  const [uncontrolledInputValue, setUncontrolledInputValue] = React.useState(searchValue)
  const [previewItems, setPreviewItems] = React.useState<GlobalSearchDocument[]>([])
  const [isPreviewLoading, setIsPreviewLoading] = React.useState(false)

  const isControlled = controlledInputValue !== undefined
  const inputValue = isControlled ? controlledInputValue : uncontrolledInputValue
  const setInputValue = React.useCallback(
    (next: string) => {
      if (isControlled) onInputValueChange?.(next)
      else setUncontrolledInputValue(next)
    },
    [isControlled, onInputValueChange],
  )

  const debouncedQuery = useDebounce(inputValue, 150).trim()
  const hasQuery = inputValue.trim().length > 0
  const trimmedQuery = inputValue.trim()

  React.useEffect(() => {
    if (isControlled) return
    setUncontrolledInputValue(searchValue)
  }, [isControlled, searchValue])

  React.useEffect(() => {
    if (!autoFocusInput || !showInput || !enabled) return
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(id)
  }, [autoFocusInput, enabled, showInput])

  const openKeywordResearch = React.useCallback(
    (query: string) => {
      if (typeof window === "undefined") return
      const detail: OpenKeywordResearchDetail = { query: query.trim() || null }
      window.dispatchEvent(new CustomEvent(OPEN_KEYWORD_RESEARCH_EVENT, { detail }))
      onRequestClose?.()
    },
    [onRequestClose],
  )

  const visibleTypeFilters = React.useMemo(
    () => (selectedTypeFilters.length > 0 ? selectedTypeFilters : DEFAULT_PREVIEW_TYPES),
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
    enabled: enabled && !hasQuery,
    staleTime: 0,
    refetchOnMount: "always",
  })

  const recentlyOpenedQuery = useQuery({
    queryKey: ["global-search", "header-recently-opened", 8],
    queryFn: async ({ signal }) => {
      const items = await fetchGlobalRecentlyOpened({ limit: 8, signal })
      return items.filter((item) => item.entity_type !== "team")
    },
    enabled: enabled && !hasQuery,
    staleTime: 0,
    refetchOnMount: "always",
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
    if (!enabled || debouncedQuery.length === 0) {
      previewRequestIdRef.current += 1
      setPreviewItems([])
      setIsPreviewLoading(false)
      return
    }
    const requestId = previewRequestIdRef.current + 1
    previewRequestIdRef.current = requestId
    const controller = new AbortController()
    const entityTypes = (
      selectedTypeFilters.length > 0
        ? selectedTypeFilters
        : ([...DEFAULT_PREVIEW_TYPES] as GlobalSearchItemEntityType[])
    ).filter((type) => type !== "project_briefing" && type !== "team")

    const mergePreviewItems = (
      tasks: GlobalSearchDocument[],
      others: GlobalSearchDocument[],
      limit: number,
    ) => {
      const seen = new Set<string>()
      const merged: GlobalSearchDocument[] = []
      for (const item of [...tasks, ...others]) {
        const key = `${item.entity_type}:${item.entity_id ?? item.title}`
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(item)
        if (merged.length >= limit) break
      }
      return merged
    }

    setIsPreviewLoading(true)

    const includeTasks = entityTypes.includes("task")
    const otherTypes = entityTypes.filter((type) => type !== "task")
    const shouldSplitTasksFirst =
      includeTasks && otherTypes.length > 0 && selectedTypeFilters.length === 0

    if (!shouldSplitTasksFirst) {
      void fetchGlobalSearchPreviewItems({
        query: debouncedQuery,
        entityTypes,
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
    }

    // Fast path: paint tasks first, then fill with other entity types.
    void fetchGlobalSearchPreviewItems({
      query: debouncedQuery,
      entityTypes: ["task"],
      limit: 5,
      signal: controller.signal,
    })
      .then((tasks) => {
        if (previewRequestIdRef.current !== requestId) return
        setPreviewItems(tasks)
        setIsPreviewLoading(false)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        if (previewRequestIdRef.current !== requestId) return
        console.error("Failed to load preview tasks", error)
      })

    void fetchGlobalSearchPreviewItems({
      query: debouncedQuery,
      entityTypes: otherTypes,
      limit: 4,
      signal: controller.signal,
    })
      .then((others) => {
        if (previewRequestIdRef.current !== requestId) return
        setPreviewItems((current) => {
          const tasks = current.filter((item) => item.entity_type === "task")
          return mergePreviewItems(tasks, others, 7)
        })
        setIsPreviewLoading(false)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        if (previewRequestIdRef.current !== requestId) return
        console.error("Failed to load preview non-task items", error)
        setIsPreviewLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [debouncedQuery, enabled, selectedTypeFilters])

  const handleClear = React.useCallback(() => {
    setInputValue("")
    onClearSearch?.()
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [onClearSearch, setInputValue])

  const handleSelectResult = React.useCallback(
    (item: GlobalSearchDocument) => {
      onPreviewResultSelect?.(item)
      onRequestClose?.()
    },
    [onPreviewResultSelect, onRequestClose],
  )

  return (
    <div
      className={cn(
        "flex max-h-[56dvh] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl md:max-h-[32rem]",
        className,
      )}
    >
      {showInput ? (
        <div className="relative shrink-0 border-b border-gray-100 px-3 py-2.5">
          <input
            ref={inputRef}
            type="text"
            placeholder={inputPlaceholder}
            value={inputValue}
            onChange={(e) => {
              const nextValue = e.target.value
              if (nextValue === "") {
                handleClear()
                return
              }
              setInputValue(nextValue)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                const value = event.currentTarget.value
                if (selectedTypeFilters.length === 0) {
                  onShowAll?.(value)
                } else {
                  onSearchCommit?.(value)
                }
                onRequestClose?.()
              } else if (event.key === "Escape") {
                onRequestClose?.()
              }
            }}
            autoComplete="off"
            className="w-full rounded-md border py-2 pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
          />
          <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          {inputValue ? (
            <button
              type="button"
              aria-label="Clear search"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleClear}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex shrink-0 items-center gap-1 border-b border-gray-100 px-2 py-2.5">
        <div
          ref={filtersRailRef}
          className="ai-chat-tabs-scroll flex min-w-0 flex-1 flex-nowrap gap-1.5 overflow-x-auto overflow-y-hidden scroll-smooth px-1"
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
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation()
            // Same path as the old "Get search volumes…" row: open Research middle pane
            // on the keywords tab, seeded with the current draft query.
            openKeywordResearch(inputValue)
          }}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-gray-100 px-2.5 py-1 text-gray-700 transition-colors hover:bg-gray-200"
          title={
            trimmedQuery
              ? `Get search volumes for “${trimmedQuery}”`
              : "Keyword research"
          }
          aria-label={
            trimmedQuery
              ? `Get search volumes for ${trimmedQuery}`
              : "Open keyword research"
          }
        >
          <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
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
                onClick={() => {
                  onSearchCommit?.(item.term)
                  onRequestClose?.()
                }}
                className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-normal text-gray-700 hover:bg-gray-50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 truncate">{item.term}</span>
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
            <div>
              {(recentlyOpenedQuery.data ?? []).map((item, index) => (
                <SearchResultRow
                  key={`recently-opened:${item.entity_type}:${item.entity_id ?? index}`}
                  item={item}
                  onSelect={handleSelectResult}
                  className="h-10 px-3"
                  variant="preview"
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
            <div className="px-3 py-4 text-sm text-gray-500">No matching tasks, projects, or people.</div>
          ) : (
            previewItems.map((item, index) => (
              <SearchResultRow
                key={getPreviewLabel(item.entity_type) + ":" + (item.entity_id ?? index)}
                item={item}
                onSelect={handleSelectResult}
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
            onClick={() => {
              onShowAll?.(inputValue)
              onRequestClose?.()
            }}
            className="w-full rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Show all search results
          </button>
        </div>
      ) : null}
    </div>
  )
}
