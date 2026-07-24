"use client"

import { useEffect, useRef } from "react"
import { X as XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { AI_PANE_TAB_ACTIVE_CLASS, AI_PANE_TAB_FILLER_CLASS, AI_PANE_TAB_INACTIVE_CLASS, AI_PANE_TAB_STRIP_CLASS } from "../../../features/ai-chat/tab-strip-tokens"

export type PaneTabStripItem = {
  key: string
  label: string
}

type PaneTabStripProps = {
  tabs: PaneTabStripItem[]
  activeKey: string | null
  onSelect: (key: string) => void
  onClose: (key: string) => void
  className?: string
}

/**
 * Horizontal tab strip matching the AI pane chrome (scrollable, close on each tab).
 * Generic — no rename/delete menus; callers own those affordances if needed.
 */
export function PaneTabStrip({
  tabs,
  activeKey,
  onSelect,
  onClose,
  className,
}: PaneTabStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

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

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 items-stretch", className)}>
      <div
        ref={scrollRef}
        className="ai-chat-tabs-scroll min-h-0 min-w-0 overflow-x-auto overflow-y-hidden"
      >
        <div className={AI_PANE_TAB_STRIP_CLASS}>
          {tabs.map((tab) => {
            const isActive = activeKey === tab.key
            return (
              <div
                key={tab.key}
                data-pane-tab-key={tab.key}
                className={cn(
                  "flex h-full min-h-14 w-40 shrink-0 cursor-pointer self-stretch border-r border-gray-200 bg-white",
                  isActive ? AI_PANE_TAB_ACTIVE_CLASS : AI_PANE_TAB_INACTIVE_CLASS,
                )}
                onClick={() => onSelect(tab.key)}
              >
                <div className="flex h-full min-h-0 w-full min-w-0 items-center gap-1 px-3">
                  <span className="min-w-0 flex-1 truncate text-sm" title={tab.label}>
                    {tab.label}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onClose(tab.key)
                    }}
                    className="rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                    title="Close tab"
                    aria-label={`Close ${tab.label}`}
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
