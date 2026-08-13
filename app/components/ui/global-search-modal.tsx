"use client"

import React from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { GlobalSearchPreviewPanel } from "../search/global-search-preview-panel"
import {
  type GlobalSearchDocument,
  type GlobalSearchItemEntityType,
} from "../../lib/global-search-types"

export type GlobalSearchModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  searchValue: string
  onSearchChange?: (value: string) => void
  onSearchCommit?: (value?: string) => void
  onClearSearch?: () => void
  selectedTypeFilters?: GlobalSearchItemEntityType[]
  onToggleTypeFilter?: (type: GlobalSearchItemEntityType) => void
  onPreviewResultSelect?: (item: GlobalSearchDocument) => void
  onShowAll?: (value?: string) => void
  /** Cmd/Ctrl+K opens the modal. Default true. */
  enableShortcut?: boolean
}

/**
 * ChatGPT-style centered search modal wired to the shared global-search controller.
 */
export function GlobalSearchModal({
  open,
  onOpenChange,
  searchValue,
  onSearchChange,
  onSearchCommit,
  onClearSearch,
  selectedTypeFilters = [],
  onToggleTypeFilter,
  onPreviewResultSelect,
  onShowAll,
  enableShortcut = true,
}: GlobalSearchModalProps) {
  const [isMounted, setIsMounted] = React.useState(false)
  const [inputValue, setInputValue] = React.useState(searchValue)
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  React.useEffect(() => {
    setInputValue(searchValue)
  }, [searchValue])

  React.useEffect(() => {
    if (!enableShortcut) return
    const handleGlobalShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return
      if (event.altKey || event.shiftKey) return
      event.preventDefault()
      onOpenChange(true)
    }
    document.addEventListener("keydown", handleGlobalShortcut)
    return () => document.removeEventListener("keydown", handleGlobalShortcut)
  }, [enableShortcut, onOpenChange])

  React.useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onOpenChange(false)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      cancelAnimationFrame(frame)
    }
  }, [open, onOpenChange])

  const handleClose = React.useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  const handleClear = React.useCallback(() => {
    setInputValue("")
    onClearSearch?.()
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [onClearSearch])

  if (!isMounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[12vh] sm:pt-[14vh]">
      <button
        type="button"
        aria-label="Close search"
        className="absolute inset-0 bg-black/40"
        onClick={handleClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className={cn(
          "relative z-10 flex h-[min(72vh,36rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl",
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-4 py-3">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search..."
            value={inputValue}
            onChange={(event) => {
              const nextValue = event.target.value
              if (nextValue === "") {
                handleClear()
                return
              }
              setInputValue(nextValue)
              onSearchChange?.(nextValue)
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
                handleClose()
              }
            }}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-base text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <GlobalSearchPreviewPanel
            searchValue={searchValue}
            onSearchChange={onSearchChange}
            onSearchCommit={(value) => {
              onSearchCommit?.(value)
              handleClose()
            }}
            onClearSearch={onClearSearch}
            onShowAll={(value) => {
              onShowAll?.(value)
              handleClose()
            }}
            selectedTypeFilters={selectedTypeFilters}
            onToggleTypeFilter={onToggleTypeFilter}
            onPreviewResultSelect={(item) => {
              onPreviewResultSelect?.(item)
              handleClose()
            }}
            onRequestClose={handleClose}
            enabled={open}
            inputValue={inputValue}
            onInputValueChange={(next) => {
              setInputValue(next)
              onSearchChange?.(next)
            }}
            className="h-full max-h-none rounded-none border-0 shadow-none"
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
