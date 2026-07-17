"use client"

import { useCallback, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import {
  MOBILE_SPLIT_DEFAULT_TOP_PERCENT,
  MOBILE_SPLIT_MIN_PANE_PERCENT,
  clampMobileSplitTopPercent,
} from "./mobile-vertical-split-utils"

type MobileVerticalSplitLayoutProps = {
  top: ReactNode
  bottom: ReactNode
  initialTopPercent?: number
  onTopPercentChange?: (topPercent: number) => void
  className?: string
}

/**
 * Touch-friendly vertical split for mobile task views. Uses pointer capture so dragging
 * works with touch and mouse without scrolling the page.
 */
export function MobileVerticalSplitLayout({
  top,
  bottom,
  initialTopPercent = MOBILE_SPLIT_DEFAULT_TOP_PERCENT,
  onTopPercentChange,
  className,
}: MobileVerticalSplitLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [topPercent, setTopPercent] = useState(() => clampMobileSplitTopPercent(initialTopPercent))
  const draggingRef = useRef(false)
  const startYRef = useRef(0)
  const startTopRef = useRef(topPercent)

  const commitTopPercent = useCallback(
    (next: number) => {
      const clamped = clampMobileSplitTopPercent(next)
      setTopPercent(clamped)
      onTopPercentChange?.(clamped)
    },
    [onTopPercentChange],
  )

  const clearDragSideEffects = useCallback(() => {
    draggingRef.current = false
    document.body.style.touchAction = ""
    document.body.style.userSelect = ""
    document.body.style.overflow = ""
  }, [])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      draggingRef.current = true
      startYRef.current = event.clientY
      startTopRef.current = topPercent
      event.currentTarget.setPointerCapture(event.pointerId)
      document.body.style.touchAction = "none"
      document.body.style.userSelect = "none"
      document.body.style.overflow = "hidden"
    },
    [topPercent],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current || !containerRef.current) return
      event.preventDefault()
      const height = containerRef.current.getBoundingClientRect().height
      if (height <= 0) return
      const deltaPercent = ((event.clientY - startYRef.current) / height) * 100
      commitTopPercent(startTopRef.current + deltaPercent)
    },
    [commitTopPercent],
  )

  const handlePointerEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      clearDragSideEffects()
    },
    [clearDragSideEffects],
  )

  const bottomPercent = 100 - topPercent

  return (
    <div
      ref={containerRef}
      className={cn("grid h-full min-h-0 flex-1 overflow-hidden", className)}
      style={{
        gridTemplateRows: `${topPercent}fr auto ${bottomPercent}fr`,
      }}
    >
      <section className="min-h-0 overflow-hidden">{top}</section>

      <div
        role="separator"
        aria-orientation="horizontal"
        aria-valuenow={Math.round(topPercent)}
        aria-valuemin={MOBILE_SPLIT_MIN_PANE_PERCENT}
        aria-valuemax={100 - MOBILE_SPLIT_MIN_PANE_PERCENT}
        className="relative z-10 flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center border-y border-gray-200 bg-white"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div className="h-1 w-10 rounded-full bg-gray-300" aria-hidden />
      </div>

      <section className="flex min-h-0 flex-col overflow-hidden">{bottom}</section>
    </div>
  )
}
