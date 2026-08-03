"use client"

import React from "react"
import { Filter, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { IconTooltip } from "./icon-tooltip"
import { GlobalSearchPreviewPanel } from "../search/global-search-preview-panel"
import {
  type GlobalSearchDocument,
  type GlobalSearchItemEntityType,
} from "../../lib/global-search-types"

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
  /** When provided, renders the inline filter button (desktop header + mobile tasks search). */
  onFilterClick?: () => void
  placeholder?: string
  /** Cmd/Ctrl+K focuses the input. Default true. */
  enableShortcut?: boolean
  className?: string
}

/**
 * The shared global-search field + live preview dropdown. This is the single source of truth for
 * search input behavior across the app (desktop `TaskHeaderBar` and mobile object headers) so both
 * surfaces type into the same `q`/committed state, show identical preview results via
 * `GlobalSearchPreviewPanel`, and open results through the same `onPreviewResultSelect` handler.
 * Do NOT fork this into a mobile-only variant.
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
  const [inputValue, setInputValue] = React.useState(searchValue)

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

  const handleClear = React.useCallback(() => {
    setInputValue("")
    onClearSearch?.()
    onSearchOpenChange?.(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [onClearSearch, onSearchOpenChange])

  return (
    <div
      ref={searchWrapperRef}
      className={cn("relative w-full", isSearchOpen && "z-[60]", className)}
    >
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
            const value = event.currentTarget.value
            // No type pill → same as "Show all search results" (object=all mixed results).
            if (selectedTypeFilters.length === 0) {
              onShowAll?.(value)
            } else {
              onSearchCommit?.(value)
            }
            onSearchOpenChange?.(false)
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
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50">
          <GlobalSearchPreviewPanel
            enabled={isSearchOpen}
            searchValue={searchValue}
            inputValue={inputValue}
            onInputValueChange={setInputValue}
            onSearchChange={onSearchChange}
            onSearchCommit={onSearchCommit}
            onClearSearch={onClearSearch}
            selectedTypeFilters={selectedTypeFilters}
            onToggleTypeFilter={onToggleTypeFilter}
            onPreviewResultSelect={onPreviewResultSelect}
            onShowAll={onShowAll}
            onRequestClose={() => onSearchOpenChange?.(false)}
            className="shadow-xl"
          />
        </div>
      ) : null}
    </div>
  )
}
