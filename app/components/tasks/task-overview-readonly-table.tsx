"use client"

import { useCallback, useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "../ui/button"
import { CompactRowContent } from "./compact-task-row"
import { UserScrollableList } from "../users/user-scrollable-list"

export interface TaskOverviewRowData {
  id: number
  title: string
  assigned_to_id: number | null
  assigned_to_name: string | null
  assignee_photo_url: string | null
  project_name: string | null
  project_color: string | null
  project_logo_url: string | null
  status_name: string | null
  status_color: string | null
  delivery_date: string | null
  publication_date: string | null
  is_delivery_overdue: boolean
  is_publication_overdue: boolean
}

export type TaskOverviewDateKind = "delivery" | "publication"

const PAGE_SIZE = 10

function toCompactTask(row: TaskOverviewRowData) {
  return {
    id: row.id,
    title: row.title,
    project_name: row.project_name,
    project_color: row.project_color,
    projectLogoUrl: row.project_logo_url,
    assigned_to_id: row.assigned_to_id,
    assigned_to_name: row.assigned_to_name,
    assignedToPhotoUrl: row.assignee_photo_url,
    delivery_date: row.delivery_date,
    publication_date: row.publication_date,
    is_overdue: row.is_delivery_overdue,
    is_publication_overdue: row.is_publication_overdue,
  }
}

function TaskOverviewCompactRow({
  row,
  dateKind,
  onActivate,
}: {
  row: TaskOverviewRowData
  dateKind: TaskOverviewDateKind
  onActivate: (row: TaskOverviewRowData) => void
}) {
  const dateField = dateKind === "publication" ? "publication_date" : "delivery_date"
  return (
    <button
      type="button"
      className={cn(
        "flex w-full min-w-0 items-center border-b border-gray-100 px-0 py-2 text-left last:border-b-0",
        "hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-inset",
      )}
      onClick={() => onActivate(row)}
    >
      <CompactRowContent task={toCompactTask(row)} dateField={dateField} />
    </button>
  )
}

export function SeeMoreOutlineButton({
  onClick,
  label = "See more",
  className,
}: {
  onClick: () => void
  label?: string
  className?: string
}) {
  return (
    <Button type="button" variant="outline" size="sm" className={cn("mt-2 h-8 w-full text-xs", className)} onClick={onClick}>
      {label}
    </Button>
  )
}

export function TaskOverviewReadonlySection({
  title,
  subtitle,
  dateKind,
  rows,
  onRowActivate,
  onSeeMore,
  seeMoreLabel = "See more",
  hideHeader = false,
}: {
  title?: string
  subtitle?: string
  dateKind: TaskOverviewDateKind
  rows: TaskOverviewRowData[]
  onRowActivate: (row: TaskOverviewRowData) => void
  /** Applies matching filters to the tasks URL (left pane). */
  onSeeMore?: () => void
  seeMoreLabel?: string
  /** When true, skip the large section title (selector already labels the list). */
  hideHeader?: boolean
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [rows, dateKind])

  const visibleRows = rows.slice(0, visibleCount)
  const hasMore = visibleCount < rows.length

  const onLoadMore = useCallback(() => {
    setVisibleCount((count) => Math.min(count + PAGE_SIZE, rows.length))
  }, [rows.length])

  return (
    <section className="min-w-0">
      {!hideHeader && title ? (
        <div className="mb-3">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p> : null}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="py-4 text-sm text-gray-500">No tasks in this section.</p>
      ) : (
        <div className="min-w-0">
          <UserScrollableList hasMore={hasMore} onLoadMore={onLoadMore} maxRows={10}>
            {visibleRows.map((row) => (
              <TaskOverviewCompactRow
                key={row.id}
                row={row}
                dateKind={dateKind}
                onActivate={onRowActivate}
              />
            ))}
          </UserScrollableList>
        </div>
      )}

      {onSeeMore ? <SeeMoreOutlineButton onClick={onSeeMore} label={seeMoreLabel} /> : null}
    </section>
  )
}
