"use client"

import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react"
import { X as XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  AI_PANE_TAB_ACTIVE_CLASS,
  AI_PANE_TAB_CHIP_CLASS,
  AI_PANE_TAB_INACTIVE_CLASS,
  AI_PANE_TAB_SCROLL_CLASS,
  AI_PANE_TAB_SELECTED_CLASS,
  AI_PANE_TAB_STRIP_CLASS,
} from "../../../features/ai-chat/tab-strip-tokens"
import type { WorkspacePaneId } from "../../lib/workspace-view"
import { resolveWorkspaceTabKind } from "../../lib/workspace-tab-icon"
import { WorkspaceTabKindIcon } from "../workspace/workspace-tab-kind-icon"

export type PaneTabStripItem = {
  key: string
  label: string
  /** Optional leading icon (keep ≤12px so it fits the compact chip). */
  icon?: ReactNode
  /** Object kind — used to show the matching workspace icon when `icon` is omitted. */
  kind?: string
}

export type PaneTabDropMeta = {
  title?: string
  /**
   * Destination strip key that should sit immediately after the dropped tab.
   * `null` means append at the end of the strip.
   */
  beforeKey?: string | null
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
  /** Pane that owns this strip — enables drag-and-drop. */
  paneId?: WorkspacePaneId
  /** Drop a tab that was dragged from another pane (optional insert position). */
  onDropTabFromOtherPane?: (
    tabKey: string,
    fromPane: WorkspacePaneId,
    meta?: PaneTabDropMeta,
  ) => void
  /** Reorder a tab within this pane (same-pane drag). */
  onReorderTab?: (tabKey: string, meta: PaneTabDropMeta) => void
}

const WORKSPACE_TAB_DND_MIME = "application/x-articulate-workspace-tab"

type WorkspaceTabDragPayload = {
  pane: WorkspacePaneId
  key: string
  title?: string
}

function rangeKeys(tabs: PaneTabStripItem[], fromKey: string, toKey: string): string[] {
  const fromIndex = tabs.findIndex((tab) => tab.key === fromKey)
  const toIndex = tabs.findIndex((tab) => tab.key === toKey)
  if (fromIndex < 0 || toIndex < 0) return [toKey]
  const start = Math.min(fromIndex, toIndex)
  const end = Math.max(fromIndex, toIndex)
  return tabs.slice(start, end + 1).map((tab) => tab.key)
}

function sameKeyList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index])
}

function readWorkspaceTabDragPayload(event: ReactDragEvent): WorkspaceTabDragPayload | null {
  const raw =
    event.dataTransfer.getData(WORKSPACE_TAB_DND_MIME) ||
    event.dataTransfer.getData("text/plain")
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as WorkspaceTabDragPayload
    if (
      (parsed.pane === "left" || parsed.pane === "middle" || parsed.pane === "right") &&
      typeof parsed.key === "string" &&
      parsed.key.includes(":")
    ) {
      return parsed
    }
  } catch {
    // ignore
  }
  return null
}

function isWorkspaceTabDrag(event: ReactDragEvent): boolean {
  const types = [...event.dataTransfer.types]
  return types.includes(WORKSPACE_TAB_DND_MIME) || types.includes("text/plain")
}

function insertIndexForTabPointer(event: ReactDragEvent, tabIndex: number): number {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const mid = rect.left + rect.width / 2
  return event.clientX < mid ? tabIndex : tabIndex + 1
}

function DropInsertLine() {
  return (
    <div
      className="pointer-events-none flex w-1.5 shrink-0 items-stretch justify-center self-stretch py-1"
      aria-hidden
    >
      <span className="w-px flex-1 rounded-full bg-gray-400" />
    </div>
  )
}

/**
 * Horizontal tab strip matching the AI pane chrome (scrollable, close on each tab).
 * Supports Chrome-like Shift-range and ⌘/Ctrl toggle multi-select for bulk close.
 * Drag-and-drop: cross-pane move (`onDropTabFromOtherPane`) and same-pane reorder (`onReorderTab`).
 */
export function PaneTabStrip({
  tabs,
  activeKey,
  onSelect,
  onClose,
  className,
  onSelectionChange,
  paneId,
  onDropTabFromOtherPane,
  onReorderTab,
}: PaneTabStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const anchorKeyRef = useRef<string | null>(activeKey)
  const onSelectionChangeRef = useRef(onSelectionChange)
  onSelectionChangeRef.current = onSelectionChange
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() => (activeKey ? [activeKey] : []))
  const selectedKeysRef = useRef(selectedKeys)
  selectedKeysRef.current = selectedKeys
  /** Index in `tabs` where the dragged tab would insert (0…tabs.length). */
  const [dropInsertIndex, setDropInsertIndex] = useState<number | null>(null)

  // Referentially unstable `tabs` arrays from parents must not re-trigger effects.
  const tabKeysSignature = tabs.map((tab) => tab.key).join("\0")

  const commitSelection = (keys: string[], anchorKey?: string | null) => {
    const unique = Array.from(new Set(keys))
    if (anchorKey !== undefined) anchorKeyRef.current = anchorKey
    setSelectedKeys(unique)
    onSelectionChangeRef.current?.(unique)
  }

  // Reconcile multi-select with tab list + external activation.
  // Only call setState when the list actually changes. Parents often pass a new `tabs` array
  // each render; scheduling setState (even with a bailout updater) still counts toward
  // React's nested-update limit and surfaces as "Maximum update depth exceeded".
  useEffect(() => {
    const keySet = new Set(tabKeysSignature.length > 0 ? tabKeysSignature.split("\0") : [])
    if (anchorKeyRef.current && !keySet.has(anchorKeyRef.current)) {
      anchorKeyRef.current = activeKey
    }

    const prev = selectedKeysRef.current
    let next = prev.filter((key) => keySet.has(key))

    // Plain activation from outside should collapse multi-select to the active tab
    // (only when selection is a single foreign tab — keep intentional multi-select).
    if (activeKey && !(next.length <= 1 && next[0] === activeKey)) {
      if (next.length === 1 && next[0] !== activeKey) {
        anchorKeyRef.current = activeKey
        next = [activeKey]
      }
    }

    if (sameKeyList(next, prev)) return
    setSelectedKeys(next)
    onSelectionChangeRef.current?.(next)
  }, [tabKeysSignature, activeKey])

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

  if (tabs.length === 0 && !onDropTabFromOtherPane && !onReorderTab) return null

  const selectedSet = new Set(selectedKeys)
  const isMultiSelected = selectedKeys.length > 1
  const canDrag = Boolean(paneId && (onDropTabFromOtherPane || onReorderTab))
  const canAcceptDrop = Boolean(paneId && (onDropTabFromOtherPane || onReorderTab))

  const clearDropIndicator = () => setDropInsertIndex(null)

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

  const handleDragStart = (key: string, event: ReactDragEvent) => {
    if (!paneId) return
    const label = tabs.find((tab) => tab.key === key)?.label
    const payload: WorkspaceTabDragPayload = {
      pane: paneId,
      key,
      title: label?.trim() || undefined,
    }
    const serialized = JSON.stringify(payload)
    event.dataTransfer.setData(WORKSPACE_TAB_DND_MIME, serialized)
    event.dataTransfer.setData("text/plain", serialized)
    event.dataTransfer.effectAllowed = "move"
  }

  const acceptTabDrag = (event: ReactDragEvent) => {
    if (!canAcceptDrop || !isWorkspaceTabDrag(event)) return false
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    return true
  }

  const handleStripDragOver = (event: ReactDragEvent) => {
    if (!acceptTabDrag(event)) return
    // Empty strip / trailing filler — append.
    if (tabs.length === 0) {
      setDropInsertIndex(0)
      return
    }
    setDropInsertIndex(tabs.length)
  }

  const handleTabDragOver = (tabIndex: number, event: ReactDragEvent) => {
    if (!acceptTabDrag(event)) return
    event.stopPropagation()
    setDropInsertIndex(insertIndexForTabPointer(event, tabIndex))
  }

  const handleDragLeave = (event: ReactDragEvent) => {
    const related = event.relatedTarget as Node | null
    if (!scrollRef.current?.contains(related)) {
      clearDropIndicator()
    }
  }

  const handleDrop = (event: ReactDragEvent) => {
    const insertIndex = dropInsertIndex
    clearDropIndicator()
    if (!paneId) return
    event.preventDefault()
    event.stopPropagation()
    const payload = readWorkspaceTabDragPayload(event)
    if (!payload) return

    const index = insertIndex ?? tabs.length
    // Same-pane no-op: dropping onto the slot immediately before/after self.
    if (payload.pane === paneId) {
      if (!onReorderTab) return
      const fromIndex = tabs.findIndex((tab) => tab.key === payload.key)
      if (fromIndex >= 0 && (index === fromIndex || index === fromIndex + 1)) return
      const beforeKey = index >= tabs.length ? null : tabs[index]?.key ?? null
      // If beforeKey is the dragged tab itself, use the next tab after removal.
      const resolvedBefore =
        beforeKey === payload.key ? (tabs[index + 1]?.key ?? null) : beforeKey
      onReorderTab(payload.key, {
        title: payload.title,
        beforeKey: resolvedBefore,
      })
      return
    }

    if (!onDropTabFromOtherPane) return
    const beforeKey = index >= tabs.length ? null : tabs[index]?.key ?? null
    onDropTabFromOtherPane(payload.key, payload.pane, {
      title: payload.title,
      beforeKey,
    })
  }

  return (
    <div
      className={cn("flex min-h-0 min-w-0 flex-1 items-stretch", className)}
      onDragOver={handleStripDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div ref={scrollRef} className={`${AI_PANE_TAB_SCROLL_CLASS} flex-1`}>
        <div className={AI_PANE_TAB_STRIP_CLASS}>
          {tabs.length === 0 && dropInsertIndex === 0 ? <DropInsertLine /> : null}
          {tabs.map((tab, tabIndex) => {
            const isActive = activeKey === tab.key
            const isSelected = selectedSet.has(tab.key)
            return (
              <div key={tab.key} className="flex min-w-0 shrink-0 items-stretch">
                {dropInsertIndex === tabIndex ? <DropInsertLine /> : null}
                <div
                  data-pane-tab-key={tab.key}
                  aria-selected={isActive}
                  data-multi-selected={isSelected && isMultiSelected ? "true" : undefined}
                  draggable={canDrag}
                  onDragStart={(event) => handleDragStart(tab.key, event)}
                  onDragOver={(event) => handleTabDragOver(tabIndex, event)}
                  className={cn(
                    AI_PANE_TAB_CHIP_CLASS,
                    "group/tab",
                    isActive ? AI_PANE_TAB_ACTIVE_CLASS : AI_PANE_TAB_INACTIVE_CLASS,
                    isSelected && isMultiSelected && AI_PANE_TAB_SELECTED_CLASS,
                    canDrag && "cursor-grab active:cursor-grabbing",
                  )}
                  onClick={(event) => handleTabClick(tab.key, event)}
                >
                  {tab.icon || resolveWorkspaceTabKind(tab) ? (
                    <span className="inline-flex h-3 w-3 shrink-0 items-center justify-center text-current opacity-70 [&>svg]:h-3 [&>svg]:w-3">
                      {tab.icon ?? <WorkspaceTabKindIcon kind={resolveWorkspaceTabKind(tab)} />}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate" title={tab.label}>
                    {tab.label}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => handleCloseClick(tab.key, event)}
                    className="rounded p-0.5 text-gray-400 opacity-0 hover:bg-black/5 hover:text-gray-700 group-hover/tab:opacity-100 focus-visible:opacity-100"
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
          {tabs.length > 0 && dropInsertIndex === tabs.length ? <DropInsertLine /> : null}
        </div>
      </div>
      <div
        className="min-h-0 w-0 flex-none self-stretch"
        aria-hidden
        onDragOver={handleStripDragOver}
      />
    </div>
  )
}
