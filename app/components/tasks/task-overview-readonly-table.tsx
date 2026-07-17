"use client"

import { format, isValid, parseISO } from "date-fns"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/UserAvatar"
import { Button } from "../ui/button"

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

/** Compact card label: e.g. `05 May` */
function formatOverviewShortDate(iso: string | null): string {
  if (!iso?.trim()) return "—"
  const normalized = iso.includes("T") ? iso : `${iso.trim()}T12:00:00`
  const d = parseISO(normalized)
  if (!isValid(d)) return "—"
  return format(d, "dd/MMM")
}

function TaskOverviewTaskCard({
  row,
  dateKind,
  onActivate,
}: {
  row: TaskOverviewRowData
  dateKind: TaskOverviewDateKind
  onActivate: (row: TaskOverviewRowData) => void
}) {
  const displayName = row.assigned_to_name ?? ""
  const statusName = row.status_name ?? ""
  const statusColor = row.status_color
  const projectName = row.project_name
  const projectColor = row.project_color

  const deliveryLabel = formatOverviewShortDate(row.delivery_date)
  const publicationLabel = formatOverviewShortDate(row.publication_date)

  const dateLabel = dateKind === "delivery" ? deliveryLabel : publicationLabel
  const dateEmphasized =
    dateKind === "delivery" ? row.is_delivery_overdue : row.is_publication_overdue

  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors hover:bg-gray-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2",
      )}
      onClick={() => onActivate(row)}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium leading-tight text-gray-900">
          {row.title}
        </span>
        <div className="flex max-w-[48%] shrink-0 items-center justify-end gap-1.5 text-right">
          {row.assigned_to_id ? (
            <>
              <UserAvatar name={displayName || "?"} photoUrl={row.assignee_photo_url} size="xs" />
              <span className="hidden min-w-0 truncate text-[11px] leading-tight text-gray-600 sm:inline max-w-[5rem]">
                {displayName || "?"}
              </span>
            </>
          ) : (
            <span className="text-[11px] text-gray-400">—</span>
          )}
          <span
            className={cn(
              "shrink-0 whitespace-nowrap text-[11px] tabular-nums leading-tight text-gray-600",
              dateEmphasized && "font-medium text-red-600",
            )}
          >
            {dateLabel}
          </span>
        </div>
      </div>

      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: projectName ? projectColor || "#9ca3af" : "#e5e7eb" }}
          aria-hidden
        />
        <span className="min-w-0 truncate text-[11px] leading-tight text-gray-700">
          {projectName ?? "\u00A0"}
        </span>
        {!statusName ? (
          <span className="text-[11px] text-gray-400">—</span>
        ) : (
          <span
            className={cn(
              "inline-flex max-w-[min(140px,40%)] shrink-0 items-center truncate rounded-full px-1.5 py-0 text-[10px] font-normal leading-none",
              statusColor ? "text-white" : "text-gray-700",
            )}
            style={{
              backgroundColor: statusColor || "#e5e7eb",
            }}
            title={statusName}
          >
            {statusName}
          </span>
        )}
      </div>
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
}: {
  title: string
  subtitle?: string
  dateKind: TaskOverviewDateKind
  rows: TaskOverviewRowData[]
  onRowActivate: (row: TaskOverviewRowData) => void
  /** Applies matching filters to the tasks URL (left pane). */
  onSeeMore?: () => void
  seeMoreLabel?: string
}) {
  return (
    <section className="min-w-0">
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
            No tasks in this section.
          </div>
        ) : (
          rows.map((row) => (
            <TaskOverviewTaskCard key={row.id} row={row} dateKind={dateKind} onActivate={onRowActivate} />
          ))
        )}
      </div>
      {onSeeMore ? <SeeMoreOutlineButton onClick={onSeeMore} label={seeMoreLabel} /> : null}
    </section>
  )
}
