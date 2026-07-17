"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { getGlobalSearchEntityLabel, type GlobalSearchResultTab } from "../../lib/global-search-types"
import { leftPaneObjectLabel } from "../../lib/left-pane-object"
import { cn } from "@/lib/utils"
import { HorizontalScrollRail } from "./horizontal-scroll-rail"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"

type Props = {
  tabs: GlobalSearchResultTab[]
  activeTab: GlobalSearchResultTab
  counts: Partial<Record<GlobalSearchResultTab, number>>
  onSelectTab: (tab: GlobalSearchResultTab) => void
  pillButtonClassName: string
}

const GAP_PX = 8

export function GlobalSearchEntityPillRow({
  tabs,
  activeTab,
  counts,
  onSelectTab,
  pillButtonClassName,
}: Props) {
  const tabLabel = (tab: GlobalSearchResultTab) =>
    tab === "all" ? leftPaneObjectLabel("all") : getGlobalSearchEntityLabel(tab)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isOtherOpen, setIsOtherOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(tabs.length)
  const [containerWidth, setContainerWidth] = useState(0)
  const [chipWidths, setChipWidths] = useState<Record<string, number>>({})
  const [otherWidth, setOtherWidth] = useState(100)

  const hiddenTabs = useMemo(() => tabs.slice(visibleCount), [tabs, visibleCount])
  const visibleTabs = useMemo(() => tabs.slice(0, visibleCount), [tabs, visibleCount])

  useEffect(() => {
    if (!hiddenTabs.includes(activeTab)) return
    setIsOtherOpen(true)
  }, [activeTab, hiddenTabs])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const updateWidth = () => setContainerWidth(container.clientWidth)
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (!tabs.length) {
      setVisibleCount(0)
      return
    }
    if (!containerWidth || Object.keys(chipWidths).length < tabs.length) {
      setVisibleCount(tabs.length)
      return
    }
    let used = 0
    let count = 0
    for (let i = 0; i < tabs.length; i += 1) {
      const tab = tabs[i]
      const width = chipWidths[tab] ?? 120
      const nextUsed = used + (count > 0 ? GAP_PX : 0) + width
      const hasMore = i < tabs.length - 1
      const reserveForOther = hasMore ? GAP_PX + otherWidth : 0
      if (nextUsed + reserveForOther <= containerWidth) {
        used = nextUsed
        count += 1
        continue
      }
      break
    }
    setVisibleCount(Math.max(1, count))
  }, [chipWidths, containerWidth, otherWidth, tabs])

  return (
    <>
      <div ref={containerRef} className="min-w-0 max-w-full">
        <HorizontalScrollRail className="w-full" contentClassName="gap-2">
          {visibleTabs.map((tab) => (
            <button
              key={`search-tab:${tab}`}
              type="button"
              onClick={() => onSelectTab(tab)}
              className={cn(
                pillButtonClassName,
                "shrink-0",
                activeTab === tab ? "bg-gray-900 text-white hover:bg-gray-900" : undefined,
              )}
            >
              {tabLabel(tab)}
              {typeof counts[tab] === "number" ? <span className="opacity-70"> {counts[tab]}</span> : null}
            </button>
          ))}
          {hiddenTabs.length > 0 ? (
            <DropdownMenu open={isOtherOpen} onOpenChange={setIsOtherOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(pillButtonClassName, "shrink-0 gap-1.5")}
                >
                  Other
                  <ChevronDown className="h-4 w-4 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[220px]">
                {hiddenTabs.map((tab) => (
                  <DropdownMenuItem
                    key={`other:${tab}`}
                    onSelect={() => {
                      onSelectTab(tab)
                      setIsOtherOpen(false)
                    }}
                    className={cn(
                      "flex items-center justify-between",
                      activeTab === tab ? "bg-gray-100 font-medium text-gray-900" : undefined,
                    )}
                  >
                    <span>{tabLabel(tab)}</span>
                    {typeof counts[tab] === "number" ? <span className="text-xs text-gray-500">{counts[tab]}</span> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </HorizontalScrollRail>
      </div>

      <div className="pointer-events-none absolute -left-[9999px] -top-[9999px] opacity-0">
        <div className="flex items-center gap-2">
          {tabs.map((tab) => (
            <button
              key={`measure:${tab}`}
              type="button"
              ref={(node) => {
                if (!node) return
                const nextWidth = Math.ceil(node.getBoundingClientRect().width)
                setChipWidths((current) => (current[tab] === nextWidth ? current : { ...current, [tab]: nextWidth }))
              }}
              className={cn(pillButtonClassName, "shrink-0")}
            >
              {tabLabel(tab)}
              {typeof counts[tab] === "number" ? <span className="opacity-70"> {counts[tab]}</span> : null}
            </button>
          ))}
          <button
            type="button"
            ref={(node) => {
              if (!node) return
              const nextWidth = Math.ceil(node.getBoundingClientRect().width)
              if (nextWidth !== otherWidth) setOtherWidth(nextWidth)
            }}
            className={cn(pillButtonClassName, "shrink-0 gap-1.5")}
          >
            Other
            <ChevronDown className="h-4 w-4 opacity-70" />
          </button>
        </div>
      </div>

    </>
  )
}
