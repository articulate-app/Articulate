"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/** Horizontal inset for section headers — matches `SearchResultRow` (`px-3`). */
export const OBJECT_PANE_SECTION_X_CLASS = "px-3"

/** Active search chip row — shared spacing for every object pane shell. */
export const OBJECT_PANE_CHIP_ROW_CLASS = "mt-1 mb-2 shrink-0 px-2"

export function objectPaneCenteredStateClass(className?: string) {
  return cn("flex h-full items-center justify-center px-3 text-sm text-gray-500", className)
}

/**
 * Shared scrollable content shell for object panes (All, Projects, Users, …).
 * Outer page chrome (toolbar, search box, chip row) lives in `TasksLayout`; this
 * wrapper only standardizes the results area below that chrome.
 */
export function ObjectPaneScrollShell({
  children,
  scrollRef,
  className,
}: {
  children: React.ReactNode
  scrollRef?: React.RefObject<HTMLDivElement>
  className?: string
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div ref={scrollRef} className={cn("min-h-0 flex-1 overflow-auto", className)}>
        {children}
      </div>
    </div>
  )
}
