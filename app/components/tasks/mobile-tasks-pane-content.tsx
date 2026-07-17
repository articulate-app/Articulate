"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { CalendarView } from "../calendar-view/calendar-view"
import { KanbanView } from "../kanban-view/kanban-view"
import type { Task } from "../../lib/types/tasks"
import type { MobileViewMode } from "./mobile-navigation"

const SPLIT_VIEW_LABELS: Record<MobileViewMode, string> = {
  list: "List",
  calendar: "Calendar",
  kanban: "Kanban",
}

export function getMobileSplitViewLabel(view: MobileViewMode): string {
  return SPLIT_VIEW_LABELS[view] ?? "View"
}

interface MobileTasksPaneContentProps {
  view: MobileViewMode
  /** When embedded in the mobile split bottom pane, hide duplicate toolbars/toggles. */
  variant?: "default" | "split-bottom"
  toolbarPaneKey?: string
  registerPaneOverflowMenu?: (fn: (() => React.ReactNode) | null) => void
  taskList: ReactNode
  searchValue: string
  setSearchValue: (value: string) => void
  selectedTaskId?: string | number | null
  selectedTaskData: unknown
  onTaskSelect: (task: unknown) => void
  onTaskUpdate?: (updatedFields: Partial<Task>) => void
}

/** Renders list, calendar, or kanban for mobile task panes (primary or split secondary). */
export function MobileTasksPaneContent({
  view,
  variant = "default",
  toolbarPaneKey,
  registerPaneOverflowMenu,
  taskList,
  searchValue,
  setSearchValue,
  selectedTaskId,
  selectedTaskData,
  onTaskSelect,
  onTaskUpdate,
}: MobileTasksPaneContentProps) {
  const isSplitBottom = variant === "split-bottom"

  if (view === "list") {
    return <div className="h-full min-h-0 overflow-hidden">{taskList}</div>
  }

  if (view === "kanban") {
    return (
      <div className={cn("h-full min-h-0", "overflow-x-auto overflow-y-hidden")}>
        <KanbanView
          onTaskSelect={onTaskSelect}
          searchValue={searchValue}
          selectedTaskId={selectedTaskId}
          onOptimisticUpdate={onTaskUpdate}
          expandButton={null}
          enabled={true}
          hideToolbar={isSplitBottom}
          toolbarPaneKey={toolbarPaneKey ?? (isSplitBottom ? "kanban-mobile-split-bottom" : undefined)}
          registerPaneOverflowMenu={registerPaneOverflowMenu}
        />
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <CalendarView
        onTaskClick={onTaskSelect}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        selectedTaskId={selectedTaskId}
        selectedTask={(selectedTaskData as Task | null) ?? null}
        expandButton={null}
        onOptimisticUpdate={onTaskUpdate}
        enabled={true}
        hideToolbar={isSplitBottom}
        hideViewToggle={isSplitBottom}
        toolbarMode={isSplitBottom ? "today-only" : "full"}
        toolbarPaneKey={toolbarPaneKey ?? (isSplitBottom ? "calendar-mobile-split-bottom" : undefined)}
        registerPaneOverflowMenu={registerPaneOverflowMenu}
      />
    </div>
  )
}
