"use client"

import * as React from "react"
import { ChevronDown, Search } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { DateRange } from "react-day-picker"
import { FilterOption, FilterKey, DateRangeValue } from "./filter-types"

interface FilterSectionProps {
  id: FilterKey
  label: string
  type: 'multi-select' | 'date-range'
  isSearchable?: boolean
  options?: FilterOption[]
  value: number[] | DateRangeValue
  searchQuery?: string
  onSearchChange?: (value: string) => void
  onChange: (value: number[] | DateRangeValue) => void
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

export function FilterSection({
  id,
  label,
  type,
  isSearchable,
  options = [],
  value,
  searchQuery = '',
  onSearchChange,
  onChange,
  isOpen,
  onOpenChange
}: FilterSectionProps) {
  const filteredOptions = React.useMemo(() => {
    if (!searchQuery) return options
    const query = searchQuery.toLowerCase()
    return options.filter(option => 
      option.label.toLowerCase().includes(query)
    )
  }, [options, searchQuery])

  if (type === 'multi-select') {
    const selectedIds = value as number[]
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-700">{label}</h3>
        <Popover open={isOpen} onOpenChange={onOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between"
            >
              <span className="truncate">
                {selectedIds.length > 0
                  ? `${selectedIds.length} selected`
                  : 'Select options'}
              </span>
              <ChevronDown className="w-4 h-4 ml-2" />
            </Button>
          </PopoverTrigger>
          <PopoverContent 
            className="w-[300px] p-0 shadow-lg z-50" 
            align="start"
            side="bottom"
            sideOffset={4}
          >
            {isSearchable && (
              <div className="p-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search..."
                    className="pl-8"
                    value={searchQuery}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange?.(e.target.value)}
                  />
                </div>
              </div>
            )}
            <div className="max-h-[300px] overflow-y-auto">
              {filteredOptions.map(option => (
                <label
                  key={option.id}
                  className="flex items-center p-2 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(option.id)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const newValue = e.target.checked
                        ? [...selectedIds, option.id]
                        : selectedIds.filter(id => id !== option.id)
                      onChange(newValue)
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm">
                    {option.label}
                    {option.color && (
                      <span
                        className="ml-2 inline-block w-3 h-3 rounded-full"
                        style={{ backgroundColor: option.color }}
                      />
                    )}
                  </span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    )
  }

  if (type === 'date-range') {
    const dateRange = value as DateRangeValue
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-700">{label}</h3>
        <Popover open={isOpen} onOpenChange={onOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between"
            >
              <span className="truncate">
                {dateRange.from || dateRange.to
                  ? `${dateRange.from ? format(new Date(dateRange.from), 'MMM d, yyyy') : 'Start'} - ${dateRange.to ? format(new Date(dateRange.to), 'MMM d, yyyy') : 'End'}`
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
                from: dateRange.from ? new Date(dateRange.from) : undefined,
                to: dateRange.to ? new Date(dateRange.to) : undefined
              }}
              onSelect={(range: DateRange | undefined) => onChange(range ? {
                from: range.from?.toISOString() || null,
                to: range.to?.toISOString() || null
              } : { from: null, to: null })}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      </div>
    )
  }

  return null
} 