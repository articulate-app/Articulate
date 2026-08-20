"use client"

import { useCallback, useMemo } from "react"
import type { TaskFilters as TaskFiltersState } from "../../store/tasks-ui"
import { useCurrentUserStore } from "../../store/current-user"
import { MobileScopePills } from "../ui/mobile-scope-pills"

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

/**
 * Mobile task-list scope pills. View, filters, and create live in the shared header chrome.
 */
export function MobileTaskListToolbar({
  filters,
  commitFilters,
}: {
  filters: TaskFiltersState
  commitFilters: (filters: TaskFiltersState) => void
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

  return <MobileScopePills options={SCOPE_PILLS} value={activeScope} onChange={applyScope} />
}
