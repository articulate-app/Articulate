"use client"

import React, { useState, useEffect } from 'react'
import { X, Filter } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { ScrollArea } from '../ui/scroll-area'
import { MultiSelect } from '../ui/multi-select'
import { DateRangePicker } from '../ui/date-range-picker'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SlidePanel } from '../ui/slide-panel'
import { fetchProjects } from '../../lib/services/billing'
import { useQuery } from '@tanstack/react-query'
import type { InvoiceOrderFilters } from '../../lib/types/billing'

interface InvoiceOrdersFiltersProps {
  isOpen: boolean
  onClose: () => void
  filters: InvoiceOrderFilters
  onFiltersChange: (filters: InvoiceOrderFilters) => void
}

const STATUS_OPTIONS = [
  { id: 'not_issued', label: 'Not Issued' },
  { id: 'partially_issued', label: 'Partially Issued' },
  { id: 'issued', label: 'Issued' },
]

const REMAINING_OPTIONS = [
  { id: 'all', label: 'All Orders' },
  { id: 'has_remaining', label: 'Has Remaining' },
]

export function InvoiceOrdersFilters({ isOpen, onClose, filters, onFiltersChange }: InvoiceOrdersFiltersProps) {
  const [localFilters, setLocalFilters] = useState<InvoiceOrderFilters>(filters)
  
  // Prevent hydration mismatch
  const [isClient, setIsClient] = useState(false)
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Fetch projects for the filter
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await fetchProjects()
      if (error) throw error
      return data
    },
    enabled: isOpen,
  })

  // Sync local state with props
  useEffect(() => {
    if (isOpen) {
      setLocalFilters(filters)
    }
  }, [isOpen, filters])

  const handleApplyFilters = () => {
    onFiltersChange(localFilters)
    onClose()
  }

  const handleClearFilters = () => {
    const emptyFilters: InvoiceOrderFilters = {
      project: [],
      period: {},
      status: [],
      invoiced: 'all',
      remaining: 'all',
      search: '',
    }
    setLocalFilters(emptyFilters)
    onFiltersChange(emptyFilters)
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (localFilters.project.length > 0) count++
    if (localFilters.period.from || localFilters.period.to) count++
    if (localFilters.status.length > 0) count++
    if (localFilters.search) count++
    if (localFilters.remaining === 'has_remaining') count++
    return count
  }

  const projectOptions = projects.map(project => ({
    id: String(project.id),
    label: project.name,
  }))

  const statusOptions = STATUS_OPTIONS.map(option => ({
    id: option.id,
    label: option.label,
  }))



  if (!isOpen || !isClient) return null

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      title="Filter Invoice Orders"
    >
      <div className="space-y-6">
        {/* Search */}
        <div className="space-y-2">
          <Label htmlFor="search">Search</Label>
          <Input
            id="search"
            placeholder="Search by project name or invoice ID..."
            value={localFilters.search}
            onChange={(e) => setLocalFilters(f => ({ ...f, search: e.target.value }))}
          />
        </div>

        {/* Project */}
        <div className="space-y-2">
          <Label>Project</Label>
          <MultiSelect
            options={projectOptions}
            value={localFilters.project}
            onChange={(vals) => setLocalFilters(f => ({ ...f, project: vals }))}
            placeholder="Select projects..."
          />
        </div>

        {/* Period */}
        <div className="space-y-2">
          <Label>Billing Period</Label>
          <DateRangePicker
            value={localFilters.period}
            onChange={(range) => setLocalFilters(f => ({ ...f, period: range }))}
          />
        </div>

        {/* Status */}
        <div className="space-y-2">
          <Label>Status</Label>
          <MultiSelect
            options={statusOptions}
            value={localFilters.status}
            onChange={(vals) => setLocalFilters(f => ({ ...f, status: vals }))}
            placeholder="Select statuses..."
          />
        </div>

        {/* Remaining */}
        <div className="space-y-2">
          <Label>Remaining</Label>
          <MultiSelect
            options={REMAINING_OPTIONS}
            value={[localFilters.remaining || 'all']}
            onChange={(vals) => setLocalFilters(f => ({ ...f, remaining: vals[0] as 'all' | 'has_remaining' }))}
            placeholder="Select remaining filter..."
          />
        </div>



        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="outline" onClick={handleClearFilters}>
            Clear All
          </Button>
          <Button onClick={handleApplyFilters}>
            Apply Filters
          </Button>
        </div>
      </div>
    </SlidePanel>
  )
} 