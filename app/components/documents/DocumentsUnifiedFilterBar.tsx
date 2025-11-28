"use client"

import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { MultiSelect } from '../../components/ui/multi-select'
import { FilterBadges } from '../../../components/ui/filter-badges'
import { ChevronDown, Check, X, Plus } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { DocumentsFilters as DocumentsFiltersType } from '../../lib/types/documents'

interface DocumentsUnifiedFilterBarProps {
  filters: DocumentsFiltersType
  onFiltersChange: (filters: DocumentsFiltersType) => void
  activeFilterBadges: Array<{
    label: string
    value: string
    onRemove: () => void
  }>
  onClearAllFilters: () => void
  onAddInvoice: () => void
  onAddPayment: () => void
  onAddCreditNote: () => void
}

export function DocumentsUnifiedFilterBar({
  filters,
  onFiltersChange,
  activeFilterBadges,
  onClearAllFilters,
  onAddInvoice,
  onAddPayment,
  onAddCreditNote
}: DocumentsUnifiedFilterBarProps) {
  const directionOptions = [
    { value: '', label: 'All' },
    { value: 'ar', label: 'Accounts Receivable' },
    { value: 'ap', label: 'Accounts Payable' },
  ]

  const kindOptions = [
    { id: 'invoice', label: 'Invoices' },
    { id: 'order', label: 'Orders' },
    { id: 'credit_note', label: 'Credit Notes' },
    { id: 'payment', label: 'Payments' },
  ]

  const handleDirectionChange = (direction: string) => {
    onFiltersChange({ ...filters, direction })
  }

  const handleKindChange = (kinds: string[]) => {
    onFiltersChange({ ...filters, kind: kinds })
  }

  // Create filter badges for direction and kind
  const filterBadges = []
  
  // Add direction badge (only if not "All")
  if (filters.direction) {
    const directionLabel = directionOptions.find(opt => opt.value === filters.direction)?.label || filters.direction
    filterBadges.push({
      id: 'direction',
      label: 'Direction',
      value: directionLabel,
      onRemove: () => handleDirectionChange('')
    })
  }
  
  // Add kind badges (only if not "All"), deduplicated by label
  const kindsByLabel = new Map<string, string[]>()
  filters.kind.forEach((kind) => {
    const kindLabel = kindOptions.find(opt => opt.id === kind)?.label || kind
    if (!kindsByLabel.has(kindLabel)) {
      kindsByLabel.set(kindLabel, [])
    }
    kindsByLabel.get(kindLabel)!.push(kind)
  })
  
  kindsByLabel.forEach((kinds, label) => {
    filterBadges.push({
      id: `kind-${label}`,
      label: 'Type',
      value: label,
      onRemove: () => handleKindChange(filters.kind.filter(k => !kinds.includes(k)))
    })
  })
  
  // Add other active filter badges
  activeFilterBadges.forEach((badge, index) => {
    filterBadges.push({
      id: `active-${index}`,
      label: badge.label,
      value: badge.value,
      onRemove: badge.onRemove
    })
  })

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3">
      <div className="flex items-center flex-nowrap overflow-x-auto overflow-y-hidden whitespace-nowrap scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent min-h-[40px] w-full gap-2" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Add Button */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="inline-flex items-center gap-1 px-4 py-1 rounded-full border border-blue-200 text-blue-600 text-sm font-medium bg-blue-50 hover:bg-blue-100 hover:border-blue-300 transition shadow-none cursor-pointer">
              <Plus className="w-4 h-4" />
              <span>Add</span>
              <ChevronDown className="w-4 h-4" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={onAddInvoice}>
              Invoice
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onAddPayment}>
              Payment
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onAddCreditNote}>
              Credit Note
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Separator */}
        <span className="text-gray-300">|</span>

        {/* Direction Pill */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="inline-flex items-center gap-1 px-4 py-1 rounded-full border border-gray-300 text-gray-700 text-sm font-medium bg-white hover:bg-gray-100 transition shadow-none cursor-pointer">
              <span>
                Direction: {filters.direction 
                  ? directionOptions.find(opt => opt.value === filters.direction)?.label || "All"
                  : "All"
                }
              </span>
              <ChevronDown className="w-4 h-4" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {directionOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => handleDirectionChange(option.value)}
                className="flex items-center justify-between"
              >
                <span>{option.label}</span>
                {(filters.direction === option.value || (!filters.direction && option.value === '')) && (
                  <Check className="w-4 h-4" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Separator */}
        <span className="text-gray-300">|</span>

        {/* Document Type Pill */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="inline-flex items-center gap-1 px-4 py-1 rounded-full border border-gray-300 text-gray-700 text-sm font-medium bg-white hover:bg-gray-100 transition shadow-none cursor-pointer">
              <span>
                Doc type: {filters.kind.length === 0 
                  ? "All" 
                  : filters.kind.length === 1 
                    ? kindOptions.find(opt => opt.id === filters.kind[0])?.label || "All"
                    : `${filters.kind.length} types`
                }
              </span>
              <ChevronDown className="w-4 h-4" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {kindOptions.map((option) => (
              <DropdownMenuItem
                key={option.id}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleKindChange(
                    filters.kind.includes(option.id)
                      ? filters.kind.filter(k => k !== option.id)
                      : [...filters.kind, option.id]
                  )
                }}
                className="flex items-center justify-between"
              >
                <span>{option.label}</span>
                {filters.kind.includes(option.id) && (
                  <Check className="w-4 h-4" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Separator */}
        <span className="text-gray-300">|</span>

        {/* Time Frame Pill */}
        <Select value="all_time" onValueChange={() => {}}>
          <SelectTrigger className="inline-flex items-center gap-1 px-4 py-1 rounded-full border border-gray-300 text-gray-700 text-sm font-medium bg-white hover:bg-gray-100 transition shadow-none w-auto h-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="last_week">Last Week</SelectItem>
            <SelectItem value="current_month">Current Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="last_year">Last Year</SelectItem>
            <SelectItem value="year_to_date">Year to Date</SelectItem>
            <SelectItem value="all_time">All Time</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>

        {/* Other Active Filter Badges */}
        {activeFilterBadges.length > 0 && (
          <>
            {/* Separator */}
            <span className="text-gray-300">|</span>
            
            {activeFilterBadges.map((badge, index) => (
              <div key={index} className="inline-flex items-center gap-1 px-4 py-1 rounded-full border border-gray-300 text-gray-700 text-sm font-medium bg-white hover:bg-gray-100 transition shadow-none">
                <span className="capitalize mr-1">{badge.label}:</span>
                <span className="mr-1">{badge.value}</span>
                <button
                  onClick={badge.onRemove}
                  className="text-gray-400 hover:text-destructive transition"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            
            {/* Clear All Button */}
            {activeFilterBadges.length > 1 && (
              <>
                <span className="text-gray-300">|</span>
                <button
                  onClick={onClearAllFilters}
                  className="inline-flex items-center gap-1 px-4 py-1 rounded-full border border-red-200 text-red-600 text-sm font-medium bg-white hover:bg-red-50 hover:border-red-300 transition shadow-none"
                >
                  <span className="mr-1">Clear All</span>
                  <X className="h-3 w-3" />
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
