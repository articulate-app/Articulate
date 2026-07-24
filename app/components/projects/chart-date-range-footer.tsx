"use client"

import { DateRangePicker } from "../ui/date-range-picker"

type DateRangeValue = {
  from?: Date
  to?: Date
}

type ChartDateRangeFooterProps = {
  value: DateRangeValue
  onChange: (range: DateRangeValue) => void
  className?: string
}

/** Minimal date-range control for the bottom of overview charts. */
export function ChartDateRangeFooter({
  value,
  onChange,
  className,
}: ChartDateRangeFooterProps) {
  return (
    <div className={className ?? "mt-3 flex items-center justify-end gap-2"}>
      <span className="text-[11px] text-gray-500">Range</span>
      <div className="w-36 min-w-0 sm:w-40">
        <DateRangePicker value={value} onChange={onChange} />
      </div>
    </div>
  )
}

export const CHART_LINE_STROKE = "#2563eb"

export function formatChartAxisDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    if (Number.isNaN(date.getTime())) return dateStr
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  } catch {
    return dateStr
  }
}
