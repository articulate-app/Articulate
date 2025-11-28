"use client"

import { useState, useEffect } from "react"
import { X, Filter } from "lucide-react"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { ScrollArea } from "../ui/scroll-area"
import { MultiSelect } from "../ui/multi-select"
import { DateRangePicker } from "../ui/date-range-picker"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { cn } from "@/lib/utils"
import { useRouter, useSearchParams } from 'next/navigation'
import { SlidePanel } from "../ui/slide-panel"
import { useFilterOptions } from "../../hooks/use-filter-options"
import type { FilterOptions } from "../../lib/services/filters"

interface TaskFiltersProps {
  isOpen: boolean
  onClose: () => void
  onApplyFilters: (mappedFilters: TaskFilters, displayFilters: TaskFilters) => void
  activeFilters: TaskFilters
  filterOptions?: FilterOptions // Optional prop to avoid network calls
  noWrapper?: boolean // If true, don't render SlidePanel wrapper
}

export interface TaskFilters {
  assignedTo: string[]
  status: string[]
  deliveryDate: { from?: Date; to?: Date }
  publicationDate: { from?: Date; to?: Date }
  project: string[]
  contentType: string[]
  productionType: string[]
  language: string[]
  channels: string[]
  overdueStatus: string[]
}

interface FilterOption {
  id: string
  label: string
  color?: string
}

export function TaskFilters({ isOpen, onClose, onApplyFilters, activeFilters, filterOptions, noWrapper = false }: TaskFiltersProps) {
  const [filters, setFilters] = useState<TaskFilters>(activeFilters)
  const router = useRouter()
  const params = useSearchParams()

  // Fetch filter options only when panel is open and no valid filterOptions prop provided
  const hasValidFilterOptions = filterOptions && 
    filterOptions.statuses && filterOptions.statuses.length > 0 &&
    filterOptions.projects && filterOptions.projects.length > 0
  const shouldFetchOptions = isOpen && !hasValidFilterOptions
  const { data: fetchedOptions, isLoading: isOptionsLoading } = useFilterOptions({ enabled: shouldFetchOptions })
  
  // Use provided filterOptions or fallback to fetched options
  const options = filterOptions || fetchedOptions
  
  // Debug log
  console.log('[TaskFilters] isOpen:', isOpen, 'hasValidFilterOptions:', hasValidFilterOptions, 'shouldFetchOptions:', shouldFetchOptions, 'options keys:', options ? Object.keys(options) : 'none')

  // Helper: update URL params when filters change
  const syncFiltersToUrl = (newFilters: TaskFilters) => {
    const newParams = new URLSearchParams(params.toString())
    Object.entries(newFilters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        if (value.length > 0) newParams.set(key, value.join(','))
        else newParams.delete(key)
      } else if (typeof value === 'object' && value !== null) {
        const { from, to } = value as { from?: Date; to?: Date }
        if (from) newParams.set(`${key}From`, from instanceof Date ? from.toISOString() : from)
        else newParams.delete(`${key}From`)
        if (to) newParams.set(`${key}To`, to instanceof Date ? to.toISOString() : to)
        else newParams.delete(`${key}To`)
      }
    })
    router.replace(`?${newParams.toString()}`)
  }

  // Sync local state with activeFilters prop
  useEffect(() => {
    if (isOpen) {
      setFilters(activeFilters)
    }
  }, [isOpen, activeFilters])

  const handleApplyFilters = () => {
    // No need for complex mapping anymore - status names are used directly
    onApplyFilters(filters, filters)
    syncFiltersToUrl(filters)
  }

  const handleClearFilters = () => {
    const empty: TaskFilters = {
      assignedTo: [],
      status: [],
      deliveryDate: {},
      publicationDate: {},
      project: [],
      contentType: [],
      productionType: [],
      language: [],
      channels: [],
      overdueStatus: []
    }
    setFilters(empty)
    onApplyFilters(empty, empty)
    syncFiltersToUrl(empty)
  }

  if (!isOpen) return null

  const filterContent = (
    <>
      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          {/* Assigned To */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Assigned To</label>
            <MultiSelect
              options={(options?.users || []).map(u => ({ id: u.value, label: u.label }))}
              value={filters.assignedTo}
              onChange={vals => setFilters(f => ({ ...f, assignedTo: vals }))}
            />
          </div>

          {/* Status - Using deduplicated status names */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <MultiSelect
              options={(options?.statuses || []).map(s => ({ 
                id: s.value, // Use status name as id since that's what we filter by
                label: s.label, 
                color: s.color 
              }))}
              value={filters.status}
              onChange={vals => setFilters(f => ({ ...f, status: vals }))}
            />
          </div>

          {/* Delivery Date */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Delivery Date</label>
            <DateRangePicker
              value={filters.deliveryDate}
              onChange={(range) => setFilters({ ...filters, deliveryDate: range })}
            />
          </div>

          {/* Publication Date */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Publication Date</label>
            <DateRangePicker
              value={filters.publicationDate}
              onChange={(range) => setFilters({ ...filters, publicationDate: range })}
            />
          </div>

          {/* Project */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Project</label>
            <MultiSelect
              options={(options?.projects || []).map(p => ({ id: p.value, label: p.label }))}
              value={filters.project}
              onChange={vals => setFilters(f => ({ ...f, project: vals }))}
            />
          </div>

          {/* Content Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Content Type</label>
            <MultiSelect
              options={(options?.contentTypes || []).map(c => ({ id: c.value, label: c.label }))}
              value={filters.contentType}
              onChange={vals => setFilters(f => ({ ...f, contentType: vals }))}
            />
          </div>

          {/* Production Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Production Type</label>
            <MultiSelect
              options={(options?.productionTypes || []).map(pt => ({ id: pt.value, label: pt.label }))}
              value={filters.productionType}
              onChange={vals => setFilters(f => ({ ...f, productionType: vals }))}
            />
          </div>

          {/* Language */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Language</label>
            <MultiSelect
              options={(options?.languages || []).map(l => ({ id: l.value, label: l.label }))}
              value={filters.language}
              onChange={vals => setFilters(f => ({ ...f, language: vals }))}
            />
          </div>

          {/* Channels */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Channels</label>
            <MultiSelect
              options={[
                { id: 'facebook', label: 'Facebook' },
                { id: 'youtube', label: 'YouTube' },
                { id: 'instagram', label: 'Instagram' },
                { id: 'twitter', label: 'Twitter' },
                { id: 'linkedin', label: 'LinkedIn' }
              ]}
              value={filters.channels}
              onChange={(value) => setFilters({ ...filters, channels: value })}
              placeholder="Select channels..."
            />
          </div>

          {/* Overdue Status */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Overdue Status</label>
            <MultiSelect
              options={[
                { id: 'delivery_overdue', label: 'Delivery overdue' },
                { id: 'publication_overdue', label: 'Publication overdue' }
              ]}
              value={filters.overdueStatus}
              onChange={vals => setFilters(f => ({ ...f, overdueStatus: vals }))}
            />
          </div>
        </div>
      </ScrollArea>
      {/* Footer */}
      <div className="flex items-center justify-between border-t p-4">
        <Button variant="ghost" onClick={handleClearFilters}>
          Clear All
        </Button>
        <Button onClick={handleApplyFilters}>Apply Filters</Button>
      </div>
    </>
  )

  if (noWrapper) {
    return filterContent
  }

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      position="right"
      className="w-full max-w-md"
      title="Filters"
    >
      {filterContent}
    </SlidePanel>
  )
} 