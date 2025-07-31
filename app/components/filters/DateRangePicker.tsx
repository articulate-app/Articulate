"use client"

import { useState } from "react"
import { Calendar, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"

interface DateRangePickerProps {
  value: { from?: Date; to?: Date }
  onChange: (value: { from?: Date; to?: Date }) => void
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeField, setActiveField] = useState<"from" | "to">("from")

  const handleDateClick = (date: Date) => {
    if (activeField === "from") {
      onChange({ from: date, to: value.to })
      setActiveField("to")
    } else {
      onChange({ from: value.from, to: date })
      setIsOpen(false)
    }
  }

  const clearDates = () => {
    onChange({})
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <input
            type="text"
            readOnly
            value={value.from ? format(value.from, "MMM d, yyyy") : ""}
            placeholder="From"
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={() => {
              setIsOpen(true)
              setActiveField("from")
            }}
          />
        </div>
        <div className="flex-1">
          <input
            type="text"
            readOnly
            value={value.to ? format(value.to, "MMM d, yyyy") : ""}
            placeholder="To"
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={() => {
              setIsOpen(true)
              setActiveField("to")
            }}
          />
        </div>
        <button
          type="button"
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
          onClick={clearDates}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-10 mt-2 w-full rounded-md border border-gray-200 bg-white p-4 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium">
              Select {activeField === "from" ? "start" : "end"} date
            </h3>
            <button
              type="button"
              className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {/* Calendar header */}
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(day => (
              <div key={day} className="text-center text-xs font-medium text-gray-500">
                {day}
              </div>
            ))}
            {/* Calendar days */}
            {/* TODO: Implement actual calendar grid with date-fns */}
            <div className="col-span-7 text-center text-sm text-gray-500">
              Calendar implementation coming soon
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 