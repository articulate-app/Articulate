"use client"

import React from 'react'
import { X } from 'lucide-react'
import { Button } from '../ui/button'
import { MultiSelect } from '../ui/multi-select'
import { DateRangePicker } from '../filters/DateRangePicker'
import type { SupplierInvoiceFilters } from '../../lib/types/expenses'

interface SupplierInvoicesFiltersProps {
  isOpen: boolean
  onClose: () => void
  filters: SupplierInvoiceFilters
  onFiltersChange: (filters: SupplierInvoiceFilters) => void
}

const statusOptions = [
  { id: 'received', label: 'Received' },
  { id: 'partially_paid', label: 'Partially Paid' },
  { id: 'paid', label: 'Paid' },
  { id: 'void', label: 'Void' },
  { id: 'draft', label: 'Draft' },
]

const currencyOptions = [
  { id: 'EUR', label: 'EUR' },
  { id: 'USD', label: 'USD' },
  { id: 'GBP', label: 'GBP' },
]

export function SupplierInvoicesFilters({ isOpen, onClose, filters, onFiltersChange }: SupplierInvoicesFiltersProps) {
  const handleStatusChange = (values: string[]) => {
    onFiltersChange({ ...filters, status: values })
  }

  const handleCurrencyChange = (values: string[]) => {
    onFiltersChange({ ...filters, currency_code: values })
  }

  const handleIssuerTeamChange = (values: string[]) => {
    onFiltersChange({ ...filters, issuer_team_id: values })
  }

  const handlePeriodChange = (period: { from?: Date; to?: Date }) => {
    onFiltersChange({ ...filters, period })
  }

  const handleClearAll = () => {
    onFiltersChange({
      q: '',
      status: [],
      currency_code: [],
      issuer_team_id: [],
      period: {},
    })
  }

  const hasActiveFilters = 
    filters.status.length > 0 ||
    filters.currency_code.length > 0 ||
    filters.issuer_team_id.length > 0 ||
    filters.period.from ||
    filters.period.to

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-start justify-end">
      <div className="bg-white w-96 h-full shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Filter Supplier Invoices</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Filters Content */}
        <div className="flex-1 overflow-auto p-4 space-y-6">
          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <MultiSelect
              options={statusOptions}
              value={filters.status}
              onChange={handleStatusChange}
              placeholder="Select statuses..."
            />
          </div>

          {/* Currency Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Currency
            </label>
            <MultiSelect
              options={currencyOptions}
              value={filters.currency_code}
              onChange={handleCurrencyChange}
              placeholder="Select currencies..."
            />
          </div>

          {/* Issuer Team Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Supplier Team
            </label>
            <MultiSelect
              options={[]} // TODO: Fetch from API
              value={filters.issuer_team_id}
              onChange={handleIssuerTeamChange}
              placeholder="Select supplier teams..."
            />
          </div>

          {/* Date Range Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Invoice Date Range
            </label>
            <DateRangePicker
              value={filters.period}
              onChange={handlePeriodChange}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex space-x-2">
            <Button
              variant="outline"
              onClick={handleClearAll}
              disabled={!hasActiveFilters}
              className="flex-1"
            >
              Clear All
            </Button>
            <Button onClick={onClose} className="flex-1">
              Apply Filters
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
} 