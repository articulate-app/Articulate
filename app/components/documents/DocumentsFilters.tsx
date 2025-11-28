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
import { useQuery } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { DocumentsFilters as DocumentsFiltersType } from '../../lib/types/documents'

interface DocumentsFiltersProps {
  isOpen: boolean
  onClose: () => void
  filters: DocumentsFiltersType
  onFiltersChange: (filters: DocumentsFiltersType) => void
}

const DIRECTION_OPTIONS = [
  { id: 'ar', label: 'AR (Accounts Receivable)' },
  { id: 'ap', label: 'AP (Accounts Payable)' },
]

const KIND_OPTIONS = [
  { id: 'invoice', label: 'Invoice' },
  { id: 'credit_note', label: 'Credit Note' },
  { id: 'invoice_order', label: 'Invoice Order' },
  { id: 'production_order', label: 'Production Order' },
  { id: 'client_payment', label: 'Client Payment' },
  { id: 'supplier_payment', label: 'Supplier Payment' },
]

const STATUS_OPTIONS = [
  { id: 'draft', label: 'Draft' },
  { id: 'issued', label: 'Issued' },
  { id: 'sent', label: 'Sent' },
  { id: 'paid', label: 'Paid' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'pending', label: 'Pending' },
]

const CURRENCY_OPTIONS = [
  { id: 'EUR', label: 'EUR' },
  { id: 'USD', label: 'USD' },
  { id: 'GBP', label: 'GBP' },
]

export function DocumentsFilters({ isOpen, onClose, filters, onFiltersChange }: DocumentsFiltersProps) {
  const [localFilters, setLocalFilters] = useState<DocumentsFiltersType>(filters)
  const supabase = createClientComponentClient()
  
  // Prevent hydration mismatch
  const [isClient, setIsClient] = useState(false)
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Fetch teams for the filter
  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('id, title')
        .order('title')
      if (error) throw error
      return data.map(team => ({ id: team.id, name: team.title }))
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
    const emptyFilters: DocumentsFiltersType = {
      q: '',
      direction: '',
      kind: [],
      status: [],
      currency: '',
      fromTeam: [],
      toTeam: [],
      fromDate: '',
      toDate: '',
      projects: [],
    }
    setLocalFilters(emptyFilters)
    onFiltersChange(emptyFilters)
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (localFilters.q) count++
    if (localFilters.direction) count++
    if (localFilters.kind.length > 0) count++
    if (localFilters.status.length > 0) count++
    if (localFilters.currency) count++
    if (localFilters.fromTeam.length > 0) count++
    if (localFilters.toTeam.length > 0) count++
    if (localFilters.fromDate || localFilters.toDate) count++
    if (localFilters.projects.length > 0) count++
    return count
  }

  const teamOptions = teams.map(team => ({
    id: String(team.id),
    label: team.name,
  }))

  const directionOptions = DIRECTION_OPTIONS.map(option => ({
    id: option.id,
    label: option.label,
  }))

  const kindOptions = KIND_OPTIONS.map(option => ({
    id: option.id,
    label: option.label,
  }))

  const statusOptions = STATUS_OPTIONS.map(option => ({
    id: option.id,
    label: option.label,
  }))

  const currencyOptions = CURRENCY_OPTIONS.map(option => ({
    id: option.id,
    label: option.label,
  }))

  if (!isOpen || !isClient) return null

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      title="Filter Documents"
    >
      <div className="space-y-6">
        {/* Search */}
        <div className="space-y-2">
          <Label htmlFor="search">Search</Label>
          <Input
            id="search"
            placeholder="Search by document number, team names, or projects..."
            value={localFilters.q}
            onChange={(e) => setLocalFilters(prev => ({ ...prev, q: e.target.value }))}
          />
        </div>

        {/* Direction */}
        <div className="space-y-2">
          <Label>Direction</Label>
          <MultiSelect
            options={directionOptions}
            value={localFilters.direction ? [localFilters.direction] : []}
            onChange={(vals) => setLocalFilters(prev => ({ 
              ...prev, 
              direction: vals.length > 0 ? vals[0] : ''
            }))}
            placeholder="Select direction..."
          />
        </div>

        {/* Document Kind */}
        <div className="space-y-2">
          <Label>Document Type</Label>
          <MultiSelect
            options={kindOptions}
            value={localFilters.kind}
            onChange={(vals) => setLocalFilters(prev => ({ ...prev, kind: vals }))}
            placeholder="Select document types..."
          />
        </div>

        {/* Status */}
        <div className="space-y-2">
          <Label>Status</Label>
          <MultiSelect
            options={statusOptions}
            value={localFilters.status}
            onChange={(vals) => setLocalFilters(prev => ({ ...prev, status: vals }))}
            placeholder="Select statuses..."
          />
        </div>

        {/* Currency */}
        <div className="space-y-2">
          <Label>Currency</Label>
          <MultiSelect
            options={currencyOptions}
            value={localFilters.currency ? [localFilters.currency] : []}
            onChange={(vals) => setLocalFilters(prev => ({ 
              ...prev, 
              currency: vals.length > 0 ? vals[0] : ''
            }))}
            placeholder="Select currency..."
          />
        </div>

        {/* From Team */}
        <div className="space-y-2">
          <Label>From Team</Label>
          <MultiSelect
            options={teamOptions}
            value={localFilters.fromTeam}
            onChange={(vals) => setLocalFilters(prev => ({ 
              ...prev, 
              fromTeam: vals
            }))}
            placeholder="Select from teams..."
          />
        </div>

        {/* To Team */}
        <div className="space-y-2">
          <Label>To Team</Label>
          <MultiSelect
            options={teamOptions}
            value={localFilters.toTeam}
            onChange={(vals) => setLocalFilters(prev => ({ 
              ...prev, 
              toTeam: vals
            }))}
            placeholder="Select to teams..."
          />
        </div>

        {/* Date Range */}
        <div className="space-y-2">
          <Label>Document Date Range</Label>
          <DateRangePicker
            value={{
              from: localFilters.fromDate ? new Date(localFilters.fromDate) : undefined,
              to: localFilters.toDate ? new Date(localFilters.toDate) : undefined,
            }}
            onChange={(range) => setLocalFilters(prev => ({ 
              ...prev, 
              fromDate: range.from ? range.from.toISOString().split('T')[0] : '',
              toDate: range.to ? range.to.toISOString().split('T')[0] : ''
            }))}
          />
        </div>

        {/* Projects */}
        <div className="space-y-2">
          <Label>Projects</Label>
          <Input
            placeholder="Enter project names (comma-separated)..."
            value={localFilters.projects.join(', ')}
            onChange={(e) => setLocalFilters(prev => ({ 
              ...prev, 
              projects: e.target.value.split(',').map(p => p.trim()).filter(Boolean)
            }))}
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

