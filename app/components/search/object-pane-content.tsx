"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Shared left gutter for left-pane content — matches the global header Create button
 * (`TaskHeaderBar` uses the same `pl-4` / `px-4` inset).
 */
export const OBJECT_PANE_SECTION_X_CLASS = "px-4"

/** Active search chip row — shared spacing for every object pane shell. */
export const OBJECT_PANE_CHIP_ROW_CLASS = "mt-1 mb-2 shrink-0 px-4"

export function objectPaneCenteredStateClass(className?: string) {
  return cn("flex h-full items-center justify-center px-4 text-sm text-gray-500", className)
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
  /** Accept React 19 `useRef<T>(null)` RefObjects (current includes null). */
  scrollRef?: React.RefObject<HTMLDivElement | null>
  className?: string
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div
        ref={scrollRef as React.Ref<HTMLDivElement> | undefined}
        className={cn("min-h-0 flex-1 overflow-auto", className)}
      >
        {children}
      </div>
    </div>
  )
}
