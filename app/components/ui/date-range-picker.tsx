"use client"

import * as React from "react"
import {
  endOfMonth,
  endOfYear,
  format,
  isSameDay,
  startOfMonth,
  startOfYear,
  subDays,
} from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { DateRange } from "react-day-picker"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DateRangePickerProps {
  value?: { from?: Date; to?: Date }
  onChange?: (value: { from?: Date; to?: Date }) => void
  className?: string
}

type QuickPresetKey =
  | "today"
  | "yesterday"
  | "last-7-days"
  | "last-30-days"
  | "this-month"
  | "last-month"
  | "this-year"
  | "last-year"
  | "custom"

const PRESET_LABELS: Record<QuickPresetKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "last-7-days": "Last 7 days",
  "last-30-days": "Last 30 days",
  "this-month": "This month",
  "last-month": "Last month",
  "this-year": "This year",
  "last-year": "Last year",
  custom: "Custom range",
}

function getPresetRange(preset: Exclude<QuickPresetKey, "custom">, today = new Date()): DateRange {
  switch (preset) {
    case "today":
      return { from: today, to: today }
    case "yesterday": {
      const day = subDays(today, 1)
      return { from: day, to: day }
    }
    case "last-7-days":
      return { from: subDays(today, 6), to: today }
    case "last-30-days":
      return { from: subDays(today, 29), to: today }
    case "this-month":
      return { from: startOfMonth(today), to: today }
    case "last-month": {
      const start = startOfMonth(subDays(startOfMonth(today), 1))
      return { from: start, to: endOfMonth(start) }
    }
    case "this-year":
      return { from: startOfYear(today), to: today }
    case "last-year": {
      const start = startOfYear(subDays(startOfYear(today), 1))
      return { from: start, to: endOfYear(start) }
    }
  }
}

function matchPreset(from?: Date, to?: Date): QuickPresetKey {
  if (!from || !to) return "custom"
  const presets: Array<Exclude<QuickPresetKey, "custom">> = [
    "today",
    "yesterday",
    "last-7-days",
    "last-30-days",
    "this-month",
    "last-month",
    "this-year",
    "last-year",
  ]
  for (const preset of presets) {
    const range = getPresetRange(preset)
    if (
      range.from
      && range.to
      && isSameDay(from, range.from)
      && isSameDay(to, range.to)
    ) {
      return preset
    }
  }
  return "custom"
}

export function DateRangePicker({
  value,
  onChange,
  className,
}: DateRangePickerProps) {
  const [date, setDate] = React.useState<DateRange | undefined>(
    value?.from && value?.to
      ? {
          from: value.from,
          to: value.to,
        }
      : undefined,
  )
  const [activePreset, setActivePreset] = React.useState<QuickPresetKey>(() =>
    matchPreset(value?.from, value?.to),
  )

  React.useEffect(() => {
    if (value?.from && value?.to) {
      setDate({
        from: value.from,
        to: value.to,
      })
      setActivePreset(matchPreset(value.from, value.to))
    }
  }, [value])

  const applyPreset = (preset: QuickPresetKey) => {
    setActivePreset(preset)

    if (!onChange || preset === "custom") return

    const nextRange = getPresetRange(preset)
    setDate(nextRange)
    onChange({ from: nextRange.from, to: nextRange.to })
  }

  const triggerLabel = (() => {
    if (!date?.from) return "Pick a date range"
    const preset = matchPreset(date.from, date.to)
    if (preset !== "custom") return PRESET_LABELS[preset]
    if (date.to) {
      return `${format(date.from, "MMM d, yyyy")} – ${format(date.to, "MMM d, yyyy")}`
    }
    return format(date.from, "MMM d, yyyy")
  })()

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        {/*
          Avoid PopoverTrigger asChild + Button: nested compose-refs can infinite-loop
          under React 18 when many pickers mount together (project overview previews).
        */}
        <PopoverTrigger
          id="date"
          type="button"
          className={cn(
            "inline-flex h-10 w-full items-center justify-start rounded-md border border-input bg-background px-3 py-2 text-sm font-normal ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            !date && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          <span className="truncate">{triggerLabel}</span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4" align="start">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={(range) => {
                setDate(range)
                setActivePreset(matchPreset(range?.from, range?.to))
                if (onChange) {
                  onChange({
                    from: range?.from,
                    to: range?.to,
                  })
                }
              }}
              numberOfMonths={2}
              className="flex flex-col space-y-4"
              classNames={{
                months: "flex space-x-4",
                month: "space-y-4",
                caption: "flex justify-center pt-1 relative items-center",
                caption_label: "text-sm font-medium",
                nav: "space-x-1 flex items-center",
                nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
                nav_button_previous: "absolute left-1",
                nav_button_next: "absolute right-1",
                table: "w-full border-collapse space-y-1",
                head_row: "flex justify-between",
                head_cell: "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]",
                row: "flex w-full mt-2 justify-between",
                cell: cn(
                  "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent/50",
                  "[&:has([aria-selected].day-range-end)]:rounded-r-md",
                  "[&:has([aria-selected].day-range-start)]:rounded-l-md",
                  "[&:has([aria-selected].day-range-start)]:bg-accent",
                  "[&:has([aria-selected].day-range-end)]:bg-accent",
                ),
                day: cn(
                  "h-8 w-8 p-0 font-normal aria-selected:opacity-100",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus:bg-accent focus:text-accent-foreground focus:rounded-md",
                ),
                day_range_start: "day-range-start rounded-l-md",
                day_range_end: "day-range-end rounded-r-md",
                day_selected:
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
              }}
            />

            <div className="mt-2 w-full border-t pt-3 text-xs sm:mt-0 sm:w-40 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
              <div className="mb-2 font-medium text-gray-700">
                Quick ranges
              </div>
              <div className="space-y-1">
                {(
                  [
                    "today",
                    "yesterday",
                    "last-7-days",
                    "last-30-days",
                    "this-month",
                    "last-month",
                    "this-year",
                    "last-year",
                    "custom",
                  ] as QuickPresetKey[]
                ).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-gray-100",
                      activePreset === key && "bg-gray-100 font-medium",
                    )}
                    onClick={() => applyPreset(key)}
                  >
                    <span>{PRESET_LABELS[key]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
