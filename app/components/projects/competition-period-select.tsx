"use client"

import { useState } from "react"
import {
  endOfMonth,
  format,
  isSameDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { DateRangePicker } from "../ui/date-range-picker"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"

type DateRangeValue = {
  from?: Date
  to?: Date
}

type PeriodPresetKey =
  | "last-7-days"
  | "last-14-days"
  | "last-30-days"
  | "last-90-days"
  | "this-month"
  | "last-month"

const PERIOD_PRESETS: Array<{ key: PeriodPresetKey; label: string }> = [
  { key: "last-7-days", label: "Last 7 days" },
  { key: "last-14-days", label: "Last 14 days" },
  { key: "last-30-days", label: "Last 30 days" },
  { key: "last-90-days", label: "Last 90 days" },
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
]

function presetRange(key: PeriodPresetKey, today = new Date()): DateRangeValue {
  switch (key) {
    case "last-7-days":
      return { from: subDays(today, 6), to: today }
    case "last-14-days":
      return { from: subDays(today, 13), to: today }
    case "last-30-days":
      return { from: subDays(today, 29), to: today }
    case "last-90-days":
      return { from: subDays(today, 89), to: today }
    case "this-month":
      return { from: startOfMonth(today), to: today }
    case "last-month": {
      const start = startOfMonth(subMonths(today, 1))
      return { from: start, to: endOfMonth(start) }
    }
  }
}

function matchPreset(value: DateRangeValue): PeriodPresetKey | null {
  if (!value.from || !value.to) return null
  for (const preset of PERIOD_PRESETS) {
    const range = presetRange(preset.key)
    if (
      range.from &&
      range.to &&
      isSameDay(value.from, range.from) &&
      isSameDay(value.to, range.to)
    ) {
      return preset.key
    }
  }
  return null
}

function periodLabel(value: DateRangeValue): string {
  const preset = matchPreset(value)
  if (preset) {
    return PERIOD_PRESETS.find((option) => option.key === preset)!.label
  }
  if (value.from && value.to) {
    return `${format(value.from, "d MMM")} – ${format(value.to, "d MMM yyyy")}`
  }
  if (value.from) return format(value.from, "d MMM yyyy")
  return "Select period"
}

type CompetitionPeriodSelectProps = {
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
  className?: string
  /**
   * `default` — quiet header control.
   * `dashed` — chart-title affordance (dashed underline), matching metric selects.
   */
  variant?: "default" | "dashed"
  /** Override the visible label (e.g. "over time" before a period is chosen). */
  label?: string
}

/**
 * Period control for Competition: the selected period reads as text with a
 * quiet chevron, and the options (plus a custom range) open on click.
 */
export function CompetitionPeriodSelect({
  value,
  onChange,
  className,
  variant = "default",
  label,
}: CompetitionPeriodSelectProps) {
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const activePreset = matchPreset(value)
  const displayLabel = label ?? periodLabel(value)
  const isDashed = variant === "dashed"

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setShowCustom(false)
      }}
    >
      <PopoverTrigger
        type="button"
        aria-label="Change period"
        className={cn(
          "group inline-flex items-center gap-1 rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300",
          isDashed
            ? "text-sm font-medium text-gray-900"
            : "text-sm text-gray-700 hover:text-gray-900",
          className,
        )}
      >
        <span
          className={cn(
            "truncate",
            isDashed &&
              "underline decoration-gray-400 decoration-dashed underline-offset-4 transition-colors group-hover:decoration-gray-700",
          )}
        >
          {displayLabel}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400 transition-colors group-hover:text-gray-600" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-1">
        {showCustom ? (
          <div className="p-3">
            <DateRangePicker
              inline
              value={value}
              onChange={(range) => {
                onChange(range)
                if (range?.from && range?.to) setOpen(false)
              }}
            />
          </div>
        ) : (
          <div className="min-w-[11rem] text-sm">
            {PERIOD_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => {
                  onChange(presetRange(preset.key))
                  setOpen(false)
                }}
                className={cn(
                  "flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-gray-100",
                  activePreset === preset.key && "bg-gray-100 font-medium",
                )}
              >
                {preset.label}
              </button>
            ))}
            <div className="my-1 h-px bg-gray-100" />
            <button
              type="button"
              onClick={() => setShowCustom(true)}
              className={cn(
                "flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-gray-100",
                activePreset == null && "bg-gray-100 font-medium",
              )}
            >
              Custom range…
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
