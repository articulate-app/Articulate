"use client"

import { useState } from "react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"
import { format } from "date-fns"
import { DateRange } from "react-day-picker"

interface DateRangePickerProps {
  value: { from: string | null; to: string | null }
  onChange: (value: { from: string | null; to: string | null }) => void
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleSelect = (range: DateRange | undefined) => {
    onChange({
      from: range?.from?.toISOString() || null,
      to: range?.to?.toISOString() || null
    })
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between"
        >
          <span className="truncate">
            {value.from || value.to
              ? `${value.from ? format(new Date(value.from), 'MMM d, yyyy') : 'Start'} - ${value.to ? format(new Date(value.to), 'MMM d, yyyy') : 'End'}`
              : 'Select date range'}
          </span>
          <ChevronDown className="w-4 h-4 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-auto p-0 shadow-lg z-50" 
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <Calendar
          mode="range"
          selected={{
            from: value.from ? new Date(value.from) : undefined,
            to: value.to ? new Date(value.to) : undefined
          }}
          onSelect={handleSelect}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  )
} 