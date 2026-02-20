"use client"

import * as React from "react"
import {
  endOfMonth,
  endOfYear,
  format,
  startOfMonth,
  startOfYear,
  subDays,
} from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { DateRange } from "react-day-picker"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
  const [activePreset, setActivePreset] =
    React.useState<QuickPresetKey>("custom")

  React.useEffect(() => {
    if (value?.from && value?.to) {
      setDate({
        from: value.from,
        to: value.to,
      })
    }
  }, [value])

  const applyPreset = (preset: QuickPresetKey) => {
    setActivePreset(preset)

    if (!onChange) return

    const today = new Date()

    let from: Date | undefined
    let to: Date | undefined

    switch (preset) {
      case "today":
        from = today
        to = today
        break
      case "yesterday":
        from = subDays(today, 1)
        to = subDays(today, 1)
        break
      case "last-7-days":
        from = subDays(today, 6)
        to = today
        break
      case "last-30-days":
        from = subDays(today, 29)
        to = today
        break
      case "this-month":
        from = startOfMonth(today)
        to = today
        break
      case "last-month": {
        const start = startOfMonth(subDays(startOfMonth(today), 1))
        const end = endOfMonth(start)
        from = start
        to = end
        break
      }
      case "this-year":
        from = startOfYear(today)
        to = today
        break
      case "last-year": {
        const start = startOfYear(subDays(startOfYear(today), 1))
        const end = endOfYear(start)
        from = start
        to = end
        break
      }
      case "custom":
      default:
        // Let the user pick a range manually
        return
    }

    const nextRange: DateRange = { from, to }
    setDate(nextRange)
    onChange({ from, to })
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            type="button"
            variant={"outline"}
            className={cn(
              "w-full justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} -{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
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
                setActivePreset("custom")
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
                  "[&:has([aria-selected].day-range-end)]:bg-accent"
                ),
                day: cn(
                  "h-8 w-8 p-0 font-normal aria-selected:opacity-100",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus:bg-accent focus:text-accent-foreground focus:rounded-md"
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
                {[
                  { key: "today", label: "Today" },
                  { key: "yesterday", label: "Yesterday" },
                  { key: "last-7-days", label: "Last 7 days" },
                  { key: "last-30-days", label: "Last 30 days" },
                  { key: "this-month", label: "This month" },
                  { key: "last-month", label: "Last month" },
                  { key: "this-year", label: "This year" },
                  { key: "last-year", label: "Last year" },
                  { key: "custom", label: "Custom range" },
                ].map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-gray-100",
                      activePreset === preset.key && "bg-gray-100 font-medium",
                    )}
                    onClick={() => applyPreset(preset.key as QuickPresetKey)}
                  >
                    <span>{preset.label}</span>
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