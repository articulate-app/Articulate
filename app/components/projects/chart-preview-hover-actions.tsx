"use client"

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { DateRangePicker } from "../ui/date-range-picker"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover"

type DateRangeValue = {
  from?: Date
  to?: Date
}

type ChartPreviewHoverActionsProps = {
  /** When false, children render without the hover action chrome. */
  enabled: boolean
  actions?: ReactNode
  className?: string
  children: ReactNode
}

const ACTION_BUTTON_CLASS =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white/95 text-gray-600 shadow-sm backdrop-blur hover:bg-white hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"

/**
 * Wraps a preview chart and reveals compact action controls on hover/focus.
 * Use only when the chart itself is available (has data).
 */
export function ChartPreviewHoverActions({
  enabled,
  actions,
  className,
  children,
}: ChartPreviewHoverActionsProps) {
  if (!enabled || !actions) {
    return <div className={cn("min-w-0", className)}>{children}</div>
  }

  return (
    <div className={cn("group relative min-w-0", className)}>
      {children}
      <div
        className={cn(
          "pointer-events-none absolute right-1 top-1 z-20 flex items-center gap-1",
          "opacity-0 transition-opacity",
          "group-hover:pointer-events-auto group-hover:opacity-100",
          "group-focus-within:pointer-events-auto group-focus-within:opacity-100",
          "[&:has([data-state=open])]:pointer-events-auto [&:has([data-state=open])]:opacity-100",
        )}
      >
        {actions}
      </div>
    </div>
  )
}

export const ChartPreviewActionButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(function ChartPreviewActionButton({ className, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(ACTION_BUTTON_CLASS, className)}
      {...props}
    />
  )
})

export function ChartPreviewDateRangeButton({
  value,
  onChange,
}: {
  value: DateRangeValue
  onChange: (range: DateRangeValue) => void
}) {
  const rangeLabel =
    value.from && value.to
      ? `${format(value.from, "MMM d, yyyy")} – ${format(value.to, "MMM d, yyyy")}`
      : "Pick a date range"

  return (
    <Popover modal={false}>
      {/*
        Avoid PopoverTrigger asChild + custom Button: overview previews already hit
        compose-refs issues with many pickers; style the trigger directly.
      */}
      <PopoverTrigger
        type="button"
        aria-label="Date range"
        title="Date range"
        className={ACTION_BUTTON_CLASS}
      >
        <CalendarIcon className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent align="end" className="z-[80] w-auto max-w-[min(100vw-1.5rem,44rem)] p-3" sideOffset={6}>
        <div className="space-y-2">
          <div className="text-[11px] font-medium text-gray-500">{rangeLabel}</div>
          <DateRangePicker inline value={value} onChange={onChange} />
        </div>
      </PopoverContent>
    </Popover>
  )
}
