"use client"

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import { X as XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  AI_PANE_TAB_ACTIVE_CLASS,
  AI_PANE_TAB_FILLER_CLASS,
  AI_PANE_TAB_INACTIVE_CLASS,
  AI_PANE_TAB_SELECTED_CLASS,
  AI_PANE_TAB_STRIP_CLASS,
} from "../../../features/ai-chat/tab-strip-tokens"

export type PaneTabStripItem = {
  key: string
  label: string
}

type PaneTabStripProps = {
  tabs: PaneTabStripItem[]
  activeKey: string | null
  onSelect: (key: string) => void
  /** Close one tab, or every key in the list (Chrome-style multi-close). */
  onClose: (key: string | string[]) => void
  className?: string
  /** Notified when the multi-selection set changes (for overflow menus, etc.). */
  onSelectionChange?: (keys: string[]) => void
}

function rangeKeys(tabs: PaneTabStripItem[], fromKey: string, toKey: string): string[] {
  const fromIndex = tabs.findIndex((tab) => tab.key === fromKey)
  const toIndex = tabs.findIndex((tab) => tab.key === toKey)
  if (fromIndex < 0 || toIndex < 0) return [toKey]
  const start = Math.min(fromIndex, toIndex)
  const end = Math.max(fromIndex, toIndex)
  return tabs.slice(start, end + 1).map((tab) => tab.key)
}

/**
 * Horizontal tab strip matching the AI pane chrome (scrollable, close on each tab).
 * Supports Chrome-like Shift-range and ⌘/Ctrl toggle multi-select for bulk close.
 */
export function PaneTabStrip({
  tabs,
  activeKey,
  onSelect,
  onClose,
  className,
  onSelectionChange,
}: PaneTabStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const anchorKeyRef = useRef<string | null>(activeKey)
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() => (activeKey ? [activeKey] : []))

  const commitSelection = (keys: string[], anchorKey?: string | null) => {
    const unique = Array.from(new Set(keys))
    if (anchorKey !== undefined) anchorKeyRef.current = anchorKey
    setSelectedKeys(unique)
    onSelectionChange?.(unique)
  }

  // Drop selection entries that no longer exist; keep anchor valid.
  useEffect(() => {
    const keySet = new Set(tabs.map((tab) => tab.key))
    setSelectedKeys((prev) => {
      const next = prev.filter((key) => keySet.has(key))
      if (next.length === prev.length && next.every((key, index) => key === prev[index])) {
        return prev
      }
      onSelectionChange?.(next)
      return next
    })
    if (anchorKeyRef.current && !keySet.has(anchorKeyRef.current)) {
      anchorKeyRef.current = activeKey
    }
  }, [tabs, activeKey, onSelectionChange])

  // Plain activation from outside should collapse multi-select to the active tab.
  useEffect(() => {
    if (!activeKey) return
    setSelectedKeys((prev) => {
      if (prev.length <= 1 && prev[0] === activeKey) return prev
      // Only auto-collapse when selection is a single foreign tab (external activate).
      if (prev.length === 1 && prev[0] !== activeKey) {
        anchorKeyRef.current = activeKey
        onSelectionChange?.([activeKey])
        return [activeKey]
      }
      return prev
    })
  }, [activeKey, onSelectionChange])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return
      let deltaX = e.deltaX
      let deltaY = e.deltaY
      if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        deltaX *= 16
        deltaY *= 16
      } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        deltaX *= el.clientWidth
        deltaY *= el.clientHeight
      }
      const delta = e.shiftKey
        ? deltaY
        : Math.abs(deltaX) > Math.abs(deltaY)
          ? deltaX
          : deltaY
      if (delta === 0) return
      e.preventDefault()
      el.scrollLeft += delta
    }
    el.addEventListener("wheel", onWheel, { passive: false, capture: true })
    return () => el.removeEventListener("wheel", onWheel, true)
  }, [tabs.length])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !activeKey) return
    const active = el.querySelector<HTMLElement>(`[data-pane-tab-key="${CSS.escape(activeKey)}"]`)
    active?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [activeKey, tabs.length])

  if (tabs.length === 0) return null

  const selectedSet = new Set(selectedKeys)
  const isMultiSelected = selectedKeys.length > 1

  const handleTabClick = (key: string, event: ReactMouseEvent) => {
    const isToggle = event.metaKey || event.ctrlKey
    const isRange = event.shiftKey

    if (isRange) {
      const anchor = anchorKeyRef.current ?? activeKey ?? key
      const keys = rangeKeys(tabs, anchor, key)
      commitSelection(keys)
      return
    }

    if (isToggle) {
      const next = selectedSet.has(key)
        ? selectedKeys.filter((entry) => entry !== key)
        : [...selectedKeys, key]
      // Keep at least the clicked tab selected so close still has a target.
      // Do not move the Shift-range anchor (Chrome keeps the last plain-click anchor).
      if (next.length > 0) commitSelection(next)
      else commitSelection([key], key)
      return
    }

    commitSelection([key], key)
    onSelect(key)
  }

  const handleCloseClick = (key: string, event: ReactMouseEvent) => {
    event.stopPropagation()
    if (isMultiSelected && selectedSet.has(key)) {
      onClose(selectedKeys)
      commitSelection([], null)
      return
    }
    onClose(key)
    const nextSelected = selectedKeys.filter((entry) => entry !== key)
    commitSelection(nextSelected.length > 0 ? nextSelected : [], anchorKeyRef.current)
  }

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 items-stretch", className)}>
      <div
        ref={scrollRef}
        className="ai-chat-tabs-scroll min-h-0 min-w-0 overflow-x-auto overflow-y-hidden"
      >
        <div className={AI_PANE_TAB_STRIP_CLASS}>
          {tabs.map((tab) => {
            const isActive = activeKey === tab.key
            const isSelected = selectedSet.has(tab.key)
            return (
              <div
                key={tab.key}
                data-pane-tab-key={tab.key}
                aria-selected={isActive}
                data-multi-selected={isSelected && isMultiSelected ? "true" : undefined}
                className={cn(
                  "flex h-full min-h-0 w-40 shrink-0 cursor-pointer self-stretch border-r border-gray-200 bg-white",
                  isActive ? AI_PANE_TAB_ACTIVE_CLASS : AI_PANE_TAB_INACTIVE_CLASS,
                  isSelected && isMultiSelected && AI_PANE_TAB_SELECTED_CLASS,
                )}
                onClick={(event) => handleTabClick(tab.key, event)}
              >
                <div className="flex h-full min-h-0 w-full min-w-0 items-center gap-1 px-3">
                  <span className="min-w-0 flex-1 truncate text-sm" title={tab.label}>
                    {tab.label}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => handleCloseClick(tab.key, event)}
                    className="rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                    title={
                      isMultiSelected && isSelected
                        ? `Close ${selectedKeys.length} tabs`
                        : "Close tab"
                    }
                    aria-label={
                      isMultiSelected && isSelected
                        ? `Close ${selectedKeys.length} selected tabs`
                        : `Close ${tab.label}`
                    }
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className={AI_PANE_TAB_FILLER_CLASS} aria-hidden />
    </div>
  )
}
