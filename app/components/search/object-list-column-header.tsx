"use client"

import { cn } from "@/lib/utils"
import type { GlobalSearchItemEntityType } from "../../lib/global-search-types"

/** Matches compact task list header band (36px) so object panes don’t jump when switching. */
export const OBJECT_LIST_HEADER_SHELL_CLASS =
  "sticky top-0 z-40 border-b bg-white shadow-sm"

export const OBJECT_LIST_HEADER_ROW_CLASS =
  "flex h-9 min-h-9 w-full items-center px-3 text-left text-xs font-medium text-gray-500"

export type ObjectListColumnHeaderLabels = {
  primary?: string
  secondary?: string
  tertiary?: string
}

/** Column labels aligned to what `SearchResultRow` shows for each object type. */
export function getObjectListColumnHeaderLabels(
  entityType: GlobalSearchItemEntityType | "task",
): Required<ObjectListColumnHeaderLabels> {
  switch (entityType) {
    case "project":
      return { primary: "Project", secondary: "Watchers", tertiary: "" }
    case "user":
      return { primary: "Name", secondary: "", tertiary: "" }
    case "mention":
      return { primary: "Mention", secondary: "From", tertiary: "Date" }
    case "ai_thread":
      return { primary: "Chat", secondary: "", tertiary: "Updated" }
    case "artifact":
      return { primary: "Title", secondary: "Project", tertiary: "Created" }
    case "team":
      return { primary: "Team", secondary: "Members", tertiary: "" }
    case "project_briefing":
      return { primary: "Briefing", secondary: "", tertiary: "Updated" }
    case "task":
    default:
      return { primary: "Title", secondary: "Assignee", tertiary: "Due date" }
  }
}

/**
 * Inner label row shared by the task compact `<thead>` and non-task object lists.
 * Same three slots / widths as `CompactTaskTableHeader`.
 */
export function ObjectListColumnHeaderContent({
  primary = "Title",
  secondary = "Assignee",
  tertiary = "Due date",
}: ObjectListColumnHeaderLabels) {
  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <span className="min-w-0 flex-1 truncate">{primary}</span>
      <div className="ml-2 flex shrink-0 items-center justify-end gap-3">
        <span className="shrink-0">{secondary || "\u00a0"}</span>
        <span className="w-[5.5rem] shrink-0 text-right">{tertiary || "\u00a0"}</span>
      </div>
    </div>
  )
}

/** Sticky column-header strip for projects / users / mentions / AI chat lists. */
export function ObjectListColumnHeader({
  primary = "Title",
  secondary = "Assignee",
  tertiary = "Due date",
  className,
}: ObjectListColumnHeaderLabels & { className?: string }) {
  return (
    <div className={cn(OBJECT_LIST_HEADER_SHELL_CLASS, className)} role="row">
      <div className={OBJECT_LIST_HEADER_ROW_CLASS} role="columnheader">
        <ObjectListColumnHeaderContent
          primary={primary}
          secondary={secondary}
          tertiary={tertiary}
        />
      </div>
    </div>
  )
}
