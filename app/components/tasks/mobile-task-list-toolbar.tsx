"use client"

import { useCallback, useMemo } from "react"
import { Calendar, LayoutGrid, List } from "lucide-react"
import { cn } from "@/lib/utils"
import { IconTooltip } from "../ui/icon-tooltip"
import { FilterCascadingDropdown } from "./FilterCascadingDropdown"
import type { TaskFilters as TaskFiltersState } from "../../store/tasks-ui"
import type { FilterOptions } from "../../lib/services/filters"
import type { MobileViewMode } from "./mobile-navigation"
import { useCurrentUserStore } from "../../store/current-user"

type TaskScopePill = "all" | "my_tasks" | "due_soon"

const EMPTY_TASK_FILTERS: TaskFiltersState = {
  assignedTo: [],
  status: [],
  deliveryDate: {},
  publicationDate: {},
  project: [],
  contentType: [],
  productionType: [],
  language: [],
  channels: [],
  overdueStatus: [],
}

function startOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function isSameLocalDay(a?: Date, b?: Date) {
  if (!a || !b) return false
  return toDateKey(a) === toDateKey(b)
}

const SCOPE_PILLS: { id: TaskScopePill; label: string }[] = [
  { id: "all", label: "All" },
  { id: "my_tasks", label: "My tasks" },
  { id: "due_soon", label: "Due soon" },
]

const VIEW_ITEMS: { id: MobileViewMode; label: string; icon: typeof List }[] = [
  { id: "list", label: "List", icon: List },
  { id: "kanban", label: "Kanban", icon: LayoutGrid },
  { id: "calendar", label: "Calendar", icon: Calendar },
]

/**
 * Mobile task-list chrome: scope pills, view switcher, and the same filter control as desktop.
 */
export function MobileTaskListToolbar({
  filters,
  setFilters,
  commitFilters,
  viewMode,
  onViewChange,
  editFields,
  filterOptions,
  router,
  pathname,
  params,
}: {
  filters: TaskFiltersState
  setFilters: (filters: TaskFiltersState) => void
  commitFilters: (filters: TaskFiltersState) => void
  viewMode: MobileViewMode
  onViewChange: (view: MobileViewMode) => void
  editFields?: unknown
  filterOptions?: FilterOptions
  router: { replace: (href: string, opts?: { scroll?: boolean }) => void }
  pathname: string
  params: URLSearchParams
}) {
  const publicUserId = useCurrentUserStore((s) => s.publicUserId)

  const dueSoonRange = useMemo(() => {
    const from = startOfLocalDay()
    const to = startOfLocalDay()
    to.setDate(to.getDate() + 7)
    return { from, to }
  }, [])

  const activeScope = useMemo((): TaskScopePill => {
    const userKey = publicUserId != null ? String(publicUserId) : null
    const isMyTasks =
      !!userKey &&
      filters.assignedTo.length === 1 &&
      filters.assignedTo[0] === userKey &&
      !filters.deliveryDate?.from &&
      !filters.deliveryDate?.to
    if (isMyTasks) return "my_tasks"

    const isDueSoon =
      isSameLocalDay(filters.deliveryDate?.from, dueSoonRange.from) &&
      isSameLocalDay(filters.deliveryDate?.to, dueSoonRange.to) &&
      filters.assignedTo.length === 0
    if (isDueSoon) return "due_soon"
    return "all"
  }, [dueSoonRange.from, dueSoonRange.to, filters.assignedTo, filters.deliveryDate, publicUserId])

  const applyScope = useCallback(
    (scope: TaskScopePill) => {
      if (scope === "all") {
        commitFilters(EMPTY_TASK_FILTERS)
        return
      }
      if (scope === "my_tasks") {
        if (publicUserId == null) return
        commitFilters({
          ...EMPTY_TASK_FILTERS,
          assignedTo: [String(publicUserId)],
        })
        return
      }
      commitFilters({
        ...EMPTY_TASK_FILTERS,
        deliveryDate: { from: dueSoonRange.from, to: dueSoonRange.to },
      })
    },
    [commitFilters, dueSoonRange.from, dueSoonRange.to, publicUserId],
  )

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2 border-b border-gray-100 bg-white px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overflow-y-hidden whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SCOPE_PILLS.map((tab) => {
          const isActive = activeScope === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => applyScope(tab.id)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center rounded-full px-3 text-sm font-medium transition-colors",
                isActive
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-800",
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {VIEW_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = viewMode === item.id
          return (
            <IconTooltip key={item.id} label={item.label}>
              <button
                type="button"
                className={cn(
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800",
                  isActive && "bg-gray-100 text-gray-900 hover:bg-gray-100 hover:text-gray-900",
                )}
                aria-label={item.label}
                aria-pressed={isActive}
                onClick={() => onViewChange(item.id)}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
            </IconTooltip>
          )
        })}
        <div className="mx-0.5 h-5 w-px shrink-0 bg-gray-200" aria-hidden />
        <FilterCascadingDropdown
          editFields={editFields}
          filterOptions={filterOptions}
          filters={filters}
          setFilters={setFilters}
          router={router}
          pathname={pathname}
          params={params}
          variant="icon"
          className="h-9 w-9 shrink-0 [&_svg]:h-[18px] [&_svg]:w-[18px]"
        />
      </div>
    </div>
  )
}
