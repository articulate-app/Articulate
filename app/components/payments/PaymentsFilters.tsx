"use client"

import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { SlidePanel } from '../ui/slide-panel'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { MultiSelect } from '../ui/multi-select'
import { DateRangePicker } from '../ui/date-range-picker'
import type { PaymentFilters } from '../../lib/types/billing'

interface PaymentsFiltersProps {
  isOpen: boolean
  onClose: () => void
  filters: PaymentFilters
  onFiltersChange: (filters: PaymentFilters) => void
}

const CURRENCY_OPTIONS = [
  { id: 'EUR', label: 'EUR' },
  { id: 'USD', label: 'USD' },
  { id: 'GBP', label: 'GBP' },
]

const METHOD_OPTIONS = [
  { id: 'Bank Transfer', label: 'Bank Transfer' },
  { id: 'Credit Card', label: 'Credit Card' },
  { id: 'Check', label: 'Check' },
  { id: 'Cash', label: 'Cash' },
  { id: 'Wire Transfer', label: 'Wire Transfer' },
]

export function PaymentsFilters({ isOpen, onClose, filters, onFiltersChange }: PaymentsFiltersProps) {
  const [localFilters, setLocalFilters] = useState<PaymentFilters>(filters)
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
    const emptyFilters: PaymentFilters = {
      search: '',
      currency: [],
      method: [],
      payerTeamId: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    }
    setLocalFilters(emptyFilters)
    onFiltersChange(emptyFilters)
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (localFilters.search) count++
    if (localFilters.currency.length > 0) count++
    if (localFilters.method.length > 0) count++
    if (localFilters.payerTeamId) count++
    if (localFilters.dateFrom || localFilters.dateTo) count++
    return count
  }

  const teamOptions = teams.map(team => ({
    id: String(team.id),
    label: team.name,
  }))

  const currencyOptions = CURRENCY_OPTIONS.map(option => ({
    id: option.id,
    label: option.label,
  }))

  const methodOptions = METHOD_OPTIONS.map(option => ({
    id: option.id,
    label: option.label,
  }))

  if (!isOpen || !isClient) return null

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      title="Filter Payments"
    >
      <div className="space-y-6">
        {/* Search */}
        <div className="space-y-2">
          <Label htmlFor="search">Search</Label>
          <Input
            id="search"
            placeholder="Search by external ref, notes, or method..."
            value={localFilters.q}
            onChange={(e) => setLocalFilters(prev => ({ ...prev, q: e.target.value }))}
          />
        </div>

        {/* Currency */}
        <div className="space-y-2">
          <Label>Currency</Label>
          <MultiSelect
            options={currencyOptions}
            value={localFilters.currency}
            onChange={(vals) => setLocalFilters(prev => ({ ...prev, currency: vals }))}
            placeholder="Select currencies..."
          />
        </div>

        {/* Method */}
        <div className="space-y-2">
          <Label>Payment Method</Label>
          <MultiSelect
            options={methodOptions}
            value={localFilters.method}
            onChange={(vals) => setLocalFilters(prev => ({ ...prev, method: vals }))}
            placeholder="Select payment methods..."
          />
        </div>

        {/* Payer Team */}
        <div className="space-y-2">
          <Label>Payer Team</Label>
          <MultiSelect
            options={teamOptions}
            value={localFilters.payerTeamId ? [String(localFilters.payerTeamId)] : []}
            onChange={(vals) => setLocalFilters(prev => ({ ...prev, payerTeamId: vals.length > 0 ? Number(vals[0]) : undefined }))}
            placeholder="Select payer teams..."
          />
        </div>

        {/* Date Range */}
        <div className="space-y-2">
          <Label>Payment Date Range</Label>
          <DateRangePicker
            value={localFilters.period}
            onChange={(range) => setLocalFilters(prev => ({ ...prev, period: range }))}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleClearFilters}
            className="flex-1 mr-2"
          >
            Clear All
          </Button>
          <Button
            onClick={handleApplyFilters}
            className="flex-1 ml-2"
          >
            Apply Filters ({getActiveFilterCount()})
          </Button>
        </div>
      </div>
    </SlidePanel>
  )
} 
 
 
 
 
 




