"use client"

import { useCallback } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import type { TaskCardColorMode } from "@/lib/task-card-colors"
import { dispatchTasksShallowNavigation } from "../../lib/tasks-shallow-nav"

/** Color-by options for the task list (null = "Off"). Single source for desktop + mobile menus. */
export const LIST_COLOR_OPTIONS: { value: TaskCardColorMode | null; label: string }[] = [
  { value: null, label: "Off" },
  { value: "contentType", label: "Content Type" },
  { value: "assignedTo", label: "Assigned To" },
  { value: "project", label: "Project" },
  { value: "status", label: "Status" },
]

export type ListColorByModel = {
  /** Active color mode, or null when explicitly "Off". */
  colorMode: TaskCardColorMode | null
  options: { value: TaskCardColorMode | null; label: string }[]
  /** Write `list_color_by` exactly like the desktop toolbar (replaceState + shallow nav dispatch). */
  setColorBy: (mode: TaskCardColorMode | null) => void
}

/**
 * Shared "Color by" model for the task list. Reads/writes the same `list_color_by` URL param the
 * desktop toolbar uses so the mobile drawer stays in sync with no divergent logic.
 */
export function useListColorByModel(): ListColorByModel {
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const raw = searchParams.get("list_color_by")
  const isOff = raw === "off"
  const active: TaskCardColorMode =
    raw === "contentType" || raw === "assignedTo" || raw === "project" || raw === "status" ? raw : "contentType"
  const colorMode: TaskCardColorMode | null = isOff ? null : active

  const setColorBy = useCallback(
    (mode: TaskCardColorMode | null) => {
      if (typeof window === "undefined") return
      const next = new URLSearchParams(searchParams.toString())
      next.set("list_color_by", mode === null ? "off" : mode)
      window.history.replaceState({}, "", `${pathname}?${next.toString()}`)
      dispatchTasksShallowNavigation()
    },
    [pathname, searchParams],
  )

  return { colorMode, options: LIST_COLOR_OPTIONS, setColorBy }
}
