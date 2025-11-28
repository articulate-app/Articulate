"use client"

import React from 'react'
import { X, Filter } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { DateRangePicker } from '../ui/date-range-picker'
import { MultiSelect } from '../ui/multi-select'
import { ScrollArea } from '../ui/scroll-area'
import { useMediaQuery } from '../../hooks/use-media-query'
import type { CreditNoteFilters } from '../../lib/types/billing'

interface CreditNotesFiltersProps {
  isOpen: boolean
  onClose: () => void
  filters: CreditNoteFilters
  onFiltersChange: (filters: CreditNoteFilters) => void
}

const CURRENCY_OPTIONS = [
  { id: 'EUR', label: 'EUR' },
  { id: 'USD', label: 'USD' },
  { id: 'GBP', label: 'GBP' },
]

const STATUS_OPTIONS = [
  { id: 'issued', label: 'Issued' },
  { id: 'void', label: 'Void' },
]

export function CreditNotesFilters({ isOpen, onClose, filters, onFiltersChange }: CreditNotesFiltersProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")

  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, search: value })
  }

  const handleDateRangeChange = (range: { from?: Date; to?: Date }) => {
    onFiltersChange({
      ...filters,
      dateFrom: range.from?.toISOString().split('T')[0],
      dateTo: range.to?.toISOString().split('T')[0],
    })
  }

  const handleCurrencyChange = (currencies: string[]) => {
    onFiltersChange({ ...filters, currency: currencies })
  }

  const handleStatusChange = (statuses: string[]) => {
    onFiltersChange({ ...filters, status: statuses })
  }

  const clearAllFilters = () => {
    onFiltersChange({
      search: '',
      currency: [],
      status: [],
      dateFrom: undefined,
      dateTo: undefined,
    })
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (filters.search) count++
    if (filters.currency.length > 0) count++
    if (filters.status.length > 0) count++
    if (filters.dateFrom || filters.dateTo) count++
    return count
  }

  if (!isOpen) return null

  return (
    <div className={`
      fixed inset-y-0 right-0 bg-background z-50 w-full md:w-96 shadow-lg
      ${isMobile ? "slide-up" : "slide-in-right"}
    `}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Filters</h2>
            {getActiveFilterCount() > 0 && (
              <span className="bg-gray-200 text-gray-800 text-xs font-medium px-2 py-1 rounded-full">
                {getActiveFilterCount()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="text-muted-foreground"
            >
              Clear all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filter Content */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-6">
            {/* Search */}
            <div>
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Search credit number or invoice number..."
                value={filters.search}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>

            {/* Date Range */}
            <div>
              <Label>Date Range</Label>
              <DateRangePicker
                value={{
                  from: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
                  to: filters.dateTo ? new Date(filters.dateTo) : undefined,
                }}
                onChange={handleDateRangeChange}
              />
            </div>

            {/* Currency */}
            <div>
              <Label>Currency</Label>
              <MultiSelect
                options={CURRENCY_OPTIONS}
                value={filters.currency}
                onChange={handleCurrencyChange}
                placeholder="Select currencies..."
              />
            </div>

            {/* Status */}
            <div>
              <Label>Status</Label>
              <MultiSelect
                options={STATUS_OPTIONS}
                value={filters.status}
                onChange={handleStatusChange}
                placeholder="Select statuses..."
              />
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
} 