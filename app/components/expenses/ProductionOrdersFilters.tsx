"use client"

import React, { useState, useEffect } from 'react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Calendar } from '../ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { CalendarIcon, X } from 'lucide-react'
import { format } from 'date-fns'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { ProductionOrderFilters } from '../../lib/types/expenses'

interface ProductionOrdersFiltersProps {
  filters: ProductionOrderFilters
  onFiltersChange: (filters: Partial<ProductionOrderFilters>) => void
}

interface FilterOption {
  value: string
  label: string
}

export function ProductionOrdersFilters({ filters, onFiltersChange }: ProductionOrdersFiltersProps) {
  const supabase = createClientComponentClient()
  const [isPeriodOpen, setIsPeriodOpen] = useState(false)
  const [statusOptions, setStatusOptions] = useState<FilterOption[]>([])
  const [currencyOptions, setCurrencyOptions] = useState<FilterOption[]>([])
  const [payerTeamOptions, setPayerTeamOptions] = useState<FilterOption[]>([])
  const [supplierTeamOptions, setSupplierTeamOptions] = useState<FilterOption[]>([])

  // Fetch filter options
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        // Fetch status options
        const { data: statusData } = await supabase
          .from('v_production_orders_list')
          .select('status')
          .not('status', 'is', null)
        
        const uniqueStatuses = Array.from(new Set(statusData?.map(item => item.status) || []))
        setStatusOptions(uniqueStatuses.map(status => ({ value: status, label: getStatusLabel(status) })))

        // Fetch currency options
        const { data: currencyData } = await supabase
          .from('v_production_orders_list')
          .select('currency_code')
          .not('currency_code', 'is', null)
        
        const uniqueCurrencies = Array.from(new Set(currencyData?.map(item => item.currency_code) || []))
        setCurrencyOptions(uniqueCurrencies.map(currency => ({ value: currency, label: currency })))

        // Fetch payer team options
        const { data: payerTeamData } = await supabase
          .from('v_production_orders_list')
          .select('payer_team_id, payer_team_name')
          .not('payer_team_id', 'is', null)
          .not('payer_team_name', 'is', null)
        
        const uniquePayerTeams = Array.from(new Map(payerTeamData?.map(item => [item.payer_team_id, item.payer_team_name]) || []).entries())
        setPayerTeamOptions(uniquePayerTeams.map(([id, name]) => ({ value: id.toString(), label: name })))

        // Fetch supplier team options
        const { data: supplierTeamData } = await supabase
          .from('v_production_orders_list')
          .select('supplier_team_id, supplier_team_name')
          .not('supplier_team_id', 'is', null)
          .not('supplier_team_name', 'is', null)
        
        const uniqueSupplierTeams = Array.from(new Map(supplierTeamData?.map(item => [item.supplier_team_id, item.supplier_team_name]) || []).entries())
        setSupplierTeamOptions(uniqueSupplierTeams.map(([id, name]) => ({ value: id.toString(), label: name })))

      } catch (error) {
        console.error('Failed to fetch filter options:', error)
      }
    }

    fetchFilterOptions()
  }, [supabase])

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open':
        return 'Open'
      case 'closed':
        return 'Closed'
      default:
        return status
    }
  }

  const handleStatusChange = (value: string) => {
    const newStatuses = filters.status.includes(value)
      ? filters.status.filter(s => s !== value)
      : [...filters.status, value]
    onFiltersChange({ status: newStatuses })
  }

  const handleCurrencyChange = (value: string) => {
    const newCurrencies = filters.currency_code.includes(value)
      ? filters.currency_code.filter(c => c !== value)
      : [...filters.currency_code, value]
    onFiltersChange({ currency_code: newCurrencies })
  }

  const handlePayerTeamChange = (value: string) => {
    const newPayerTeams = filters.payer_team_id.includes(value)
      ? filters.payer_team_id.filter(t => t !== value)
      : [...filters.payer_team_id, value]
    onFiltersChange({ payer_team_id: newPayerTeams })
  }

  const handleSupplierTeamChange = (value: string) => {
    const newSupplierTeams = filters.supplier_team_id.includes(value)
      ? filters.supplier_team_id.filter(t => t !== value)
      : [...filters.supplier_team_id, value]
    onFiltersChange({ supplier_team_id: newSupplierTeams })
  }

  const handlePeriodChange = (from: Date | undefined, to: Date | undefined) => {
    onFiltersChange({ period: { from, to } })
  }

  const clearAllFilters = () => {
    onFiltersChange({
      status: [],
      currency_code: [],
      payer_team_id: [],
      supplier_team_id: [],
      period: {}
    })
  }

  const hasActiveFilters = 
    filters.status.length > 0 ||
    filters.currency_code.length > 0 ||
    filters.payer_team_id.length > 0 ||
    filters.supplier_team_id.length > 0 ||
    filters.period.from ||
    filters.period.to

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">Filters</h3>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters}>
            Clear all
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Status Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
          <Select onValueChange={handleStatusChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filters.status.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {filters.status.map(status => (
                <Badge key={status} variant="secondary" className="text-xs">
                  {getStatusLabel(status)}
                  <button
                    onClick={() => handleStatusChange(status)}
                    className="ml-1 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Currency Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
          <Select onValueChange={handleCurrencyChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select currency" />
            </SelectTrigger>
            <SelectContent>
              {currencyOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filters.currency_code.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {filters.currency_code.map(currency => (
                <Badge key={currency} variant="secondary" className="text-xs">
                  {currency}
                  <button
                    onClick={() => handleCurrencyChange(currency)}
                    className="ml-1 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Payer Team Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Payer Team</label>
          <Select onValueChange={handlePayerTeamChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select payer team" />
            </SelectTrigger>
            <SelectContent>
              {payerTeamOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filters.payer_team_id.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {filters.payer_team_id.map(teamId => {
                const team = payerTeamOptions.find(t => t.value === teamId)
                return (
                  <Badge key={teamId} variant="secondary" className="text-xs">
                    {team?.label || teamId}
                    <button
                      onClick={() => handlePayerTeamChange(teamId)}
                      className="ml-1 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )
              })}
            </div>
          )}
        </div>

        {/* Supplier Team Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Supplier Team</label>
          <Select onValueChange={handleSupplierTeamChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select supplier team" />
            </SelectTrigger>
            <SelectContent>
              {supplierTeamOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filters.supplier_team_id.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {filters.supplier_team_id.map(teamId => {
                const team = supplierTeamOptions.find(t => t.value === teamId)
                return (
                  <Badge key={teamId} variant="secondary" className="text-xs">
                    {team?.label || teamId}
                    <button
                      onClick={() => handleSupplierTeamChange(teamId)}
                      className="ml-1 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )
              })}
            </div>
          )}
        </div>

        {/* Period Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Period</label>
          <Popover open={isPeriodOpen} onOpenChange={setIsPeriodOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.period.from && filters.period.to
                  ? `${format(filters.period.from, 'MMM yyyy')} - ${format(filters.period.to, 'MMM yyyy')}`
                  : 'Select period'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={{
                  from: filters.period.from,
                  to: filters.period.to
                }}
                onSelect={(range) => {
                  handlePeriodChange(range?.from, range?.to)
                  if (range?.from && range?.to) {
                    setIsPeriodOpen(false)
                  }
                }}
                numberOfMonths={2}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {(filters.period.from || filters.period.to) && (
            <div className="flex flex-wrap gap-1 mt-2">
              <Badge variant="secondary" className="text-xs">
                {filters.period.from && filters.period.to
                  ? `${format(filters.period.from, 'MMM yyyy')} - ${format(filters.period.to, 'MMM yyyy')}`
                  : filters.period.from
                  ? `From ${format(filters.period.from, 'MMM yyyy')}`
                  : `To ${format(filters.period.to!, 'MMM yyyy')}`}
                <button
                  onClick={() => handlePeriodChange(undefined, undefined)}
                  className="ml-1 hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

