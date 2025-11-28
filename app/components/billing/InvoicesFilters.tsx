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
import type { InvoiceFilters } from '../../lib/types/billing'

interface InvoicesFiltersProps {
  isOpen: boolean
  onClose: () => void
  filters: InvoiceFilters
  onFiltersChange: (filters: InvoiceFilters) => void
}

const STATUS_OPTIONS = [
  { id: 'draft', label: 'Draft' },
  { id: 'issued', label: 'Issued' },
  { id: 'sent', label: 'Sent' },
  { id: 'paid', label: 'Paid' },
  { id: 'cancelled', label: 'Cancelled' },
]

const BALANCE_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'due_only', label: 'Due Only' },
]

export function InvoicesFilters({ isOpen, onClose, filters, onFiltersChange }: InvoicesFiltersProps) {
  const [localFilters, setLocalFilters] = useState<InvoiceFilters>(filters)
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

  // Fetch distinct projects for the filter
  const { data: projects = [] } = useQuery({
    queryKey: ['distinct-projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_issued_invoices_list')
        .select('projects')
        .not('projects', 'is', null)
      
      if (error) throw error
      
      // Flatten and deduplicate projects
      const allProjects = data
        .flatMap(row => row.projects || [])
        .filter(Boolean)
      
      return Array.from(new Set(allProjects)).sort()
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
    const emptyFilters: InvoiceFilters = {
      q: '',
      status: [],
      issuerTeamId: [],
      payerTeamId: [],
      period: {},
      balance: 'all',
      projects: [],
    }
    setLocalFilters(emptyFilters)
    onFiltersChange(emptyFilters)
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (localFilters.q) count++
    if (localFilters.status.length > 0) count++
    if (localFilters.issuerTeamId.length > 0) count++
    if (localFilters.payerTeamId.length > 0) count++
    if (localFilters.period.from || localFilters.period.to) count++
    if (localFilters.balance !== 'all') count++
    if (localFilters.projects.length > 0) count++
    return count
  }

  const teamOptions = teams.map(team => ({
    id: String(team.id),
    label: team.name,
  }))

  const statusOptions = STATUS_OPTIONS.map(option => ({
    id: option.id,
    label: option.label,
  }))

  const balanceOptions = BALANCE_OPTIONS.map(option => ({
    id: option.id,
    label: option.label,
  }))

  if (!isOpen || !isClient) return null

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      title="Filter Invoices"
    >
      <div className="space-y-6">
        {/* Search */}
        <div className="space-y-2">
          <Label htmlFor="search">Search</Label>
          <Input
            id="search"
            placeholder="Search by invoice number or ID..."
            value={localFilters.q}
            onChange={(e) => setLocalFilters(prev => ({ ...prev, q: e.target.value }))}
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

        {/* Issuer Team */}
        <div className="space-y-2">
          <Label>Issuer Team</Label>
          <MultiSelect
            options={teamOptions}
            value={localFilters.issuerTeamId}
            onChange={(vals) => setLocalFilters(prev => ({ ...prev, issuerTeamId: vals }))}
            placeholder="Select issuer teams..."
          />
        </div>

        {/* Payer Team */}
        <div className="space-y-2">
          <Label>Payer Team</Label>
          <MultiSelect
            options={teamOptions}
            value={localFilters.payerTeamId}
            onChange={(vals) => setLocalFilters(prev => ({ ...prev, payerTeamId: vals }))}
            placeholder="Select payer teams..."
          />
        </div>

        {/* Date Range */}
        <div className="space-y-2">
          <Label>Invoice Date Range</Label>
          <DateRangePicker
            value={localFilters.period}
            onChange={(range) => setLocalFilters(prev => ({ ...prev, period: range }))}
          />
        </div>

        {/* Balance */}
        <div className="space-y-2">
          <Label>Balance</Label>
          <MultiSelect
            options={balanceOptions}
            value={localFilters.balance === 'all' ? [] : [localFilters.balance]}
            onChange={(vals) => setLocalFilters(prev => ({ 
              ...prev, 
              balance: vals.length > 0 ? vals[0] as 'all' | 'due_only' : 'all'
            }))}
            placeholder="Select balance filter..."
          />
        </div>

        {/* Projects */}
        <div className="space-y-2">
          <Label>Projects</Label>
          <MultiSelect
            options={projects.map(project => ({ id: project, label: project }))}
            value={localFilters.projects}
            onChange={(vals) => setLocalFilters(prev => ({ ...prev, projects: vals }))}
            placeholder="Select projects..."
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