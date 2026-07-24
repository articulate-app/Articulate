"use client"

import { cn } from "@/lib/utils"

export type UserStatCard = {
  id: string
  label: string
  value: React.ReactNode
  hint?: string
  footer?: React.ReactNode
  valueClassName?: string
}

/** @deprecated Use UserStatCard */
export type UserOverviewStatCard = UserStatCard & { hint?: string }

/**
 * Settings-style label/value rows — responsive and scroll-friendly
 * (replaces the horizontal card carousel that was hard to use in narrow panes).
 */
export function UserMetricRows({
  rows,
  className,
  columns = 1,
}: {
  rows: UserStatCard[]
  className?: string
  /** 1 = stacked list; 2 = two columns on sm+ */
  columns?: 1 | 2
}) {
  return (
    <div
      className={cn(
        columns === 2 ? "grid gap-x-8 sm:grid-cols-2" : "min-w-0",
        className,
      )}
    >
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex items-start justify-between gap-3 border-b border-gray-100 py-2.5 last:border-b-0"
        >
          <div className="min-w-0">
            <div className="text-sm text-gray-900">{row.label}</div>
            {row.hint ? <div className="mt-0.5 text-xs text-gray-500">{row.hint}</div> : null}
            {row.footer ? <div className="mt-0.5">{row.footer}</div> : null}
          </div>
          <div
            className={cn(
              "shrink-0 text-sm font-medium tabular-nums text-gray-900",
              row.valueClassName,
            )}
          >
            {row.value}
          </div>
        </div>
      ))}
    </div>
  )
}

/** @deprecated Prefer UserMetricRows */
export function UserStatCardsCarousel({
  cards,
  className,
}: {
  cards: UserStatCard[]
  gridColumns?: number
  className?: string
}) {
  return <UserMetricRows rows={cards} className={className} columns={2} />
}

/**
 * User overview summary metrics (Upcoming, Overdue, Publication, Projects).
 */
export function UserOverviewStatCards({ cards }: { cards: UserOverviewStatCard[] }) {
  return <UserMetricRows rows={cards} columns={2} className="mb-0" />
}

/**
 * Occupation summary metrics (Today, Yesterday, 7d, 30d, Backlog).
 */
export function UserOccupationStatCards({ cards }: { cards: UserStatCard[] }) {
  return <UserMetricRows rows={cards} columns={2} className="mb-4" />
}
