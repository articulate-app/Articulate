"use client"

import React, { useState, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { MoreHorizontal, X } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu'
import { ProductionOrdersTable } from '../../components/expenses/ProductionOrdersTable'
import { ProductionOrdersFilters } from '../../components/expenses/ProductionOrdersFilters'
import { SearchFilterBar } from '../../components/ui/search-filter-bar'
import { parseProductionOrderFiltersFromUrl, parseProductionOrderSortFromUrl } from '../../lib/services/expenses'
import { useDebounce } from '../../hooks/use-debounce'
import { ProductionOrderDetailsPane } from './ProductionOrderDetailsPane'
import type { ProductionOrderFilters, ProductionOrderSortConfig, ProductionOrderList } from '../../lib/types/expenses'

export function ProductionOrdersTab() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  
  // State for selected production order and filters
  const [selectedProductionOrder, setSelectedProductionOrder] = useState<any>(null)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filters, setFilters] = useState<ProductionOrderFilters>({
    q: '',
    status: [],
    currency_code: [],
    payer_team_id: [],
    supplier_team_id: [],
    period: {},
  })
  const [sort, setSort] = useState<ProductionOrderSortConfig>({ field: 'period_month', direction: 'desc' })
  
  // Separate search input state to avoid immediate URL updates
  const [searchInput, setSearchInput] = useState('')
  
  // Debounced search for better performance
  const debouncedSearch = useDebounce(searchInput, 300)

  // Hydrate from URL on mount
  useEffect(() => {
    const urlFilters = parseProductionOrderFiltersFromUrl(new URLSearchParams(params.toString()))
    const urlSort = parseProductionOrderSortFromUrl(new URLSearchParams(params.toString()))
    
    setFilters(urlFilters)
    setSort(urlSort)
    setSearchInput(urlFilters.q)
  }, [params])

  // Update URL when filters or sort change
  useEffect(() => {
    const newParams = new URLSearchParams()
    
    if (debouncedSearch) newParams.set('q', debouncedSearch)
    if (filters.status.length > 0) newParams.set('status', filters.status.join(','))
    if (filters.currency_code.length > 0) newParams.set('currency', filters.currency_code.join(','))
    if (filters.payer_team_id.length > 0) newParams.set('payerTeamId', filters.payer_team_id.join(','))
    if (filters.supplier_team_id.length > 0) newParams.set('supplierTeamId', filters.supplier_team_id.join(','))
    if (filters.period.from) newParams.set('from', filters.period.from.toISOString().split('T')[0])
    if (filters.period.to) newParams.set('to', filters.period.to.toISOString().split('T')[0])
    if (sort.field !== 'period_month') newParams.set('sort', sort.field)
    if (sort.direction !== 'desc') newParams.set('dir', sort.direction)
    if (selectedProductionOrder) newParams.set('productionOrder', selectedProductionOrder.id.toString())

    const newUrl = `${pathname}?${newParams.toString()}`
    if (newUrl !== `${pathname}?${params.toString()}`) {
      router.replace(newUrl)
    }
  }, [filters, sort, debouncedSearch, selectedProductionOrder, pathname, params, router])

  // Update filters when debounced search changes
  useEffect(() => {
    setFilters(prev => ({ ...prev, q: debouncedSearch }))
  }, [debouncedSearch])

  const handleProductionOrderSelect = (productionOrder: ProductionOrderList) => {
    setSelectedProductionOrder(productionOrder)
  }

  const handleProductionOrderClose = () => {
    setSelectedProductionOrder(null)
  }

  const handleFilterChange = (newFilters: Partial<ProductionOrderFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }))
  }

  const handleSortChange = (newSort: ProductionOrderSortConfig) => {
    setSort(newSort)
  }

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
  }

  const handleCopyLink = () => {
    if (selectedProductionOrder) {
      const url = `${window.location.origin}${pathname}?productionOrder=${selectedProductionOrder.id}`
      navigator.clipboard.writeText(url)
    }
  }

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className={`flex-1 flex flex-col ${selectedProductionOrder ? 'border-r border-gray-200' : ''}`}>
        {/* Search and Filter Bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <SearchFilterBar
            searchValue={searchInput}
            onSearchChange={handleSearchChange}
            onFilterClick={() => setIsFilterOpen(!isFilterOpen)}
            searchPlaceholder="Search production orders..."
          />
        </div>

        {/* Filters Panel */}
        {isFilterOpen && (
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <ProductionOrdersFilters
              filters={filters}
              onFiltersChange={handleFilterChange}
            />
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-hidden">
          <ProductionOrdersTable
            filters={filters}
            sort={sort}
            onSortChange={handleSortChange}
            onProductionOrderSelect={handleProductionOrderSelect}
            selectedProductionOrderId={selectedProductionOrder?.id}
          />
        </div>
      </div>

      {/* Production Order Details Pane */}
      {selectedProductionOrder && (
        <div className="w-1/2 border-l border-gray-200 bg-white">
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-900">
                  Production Order #{selectedProductionOrder.id}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-2 hover:bg-gray-100 rounded-md">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleCopyLink}>
                      <span>Copy link</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  onClick={handleProductionOrderClose}
                  className="p-2 hover:bg-gray-100 rounded-md"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Details Content */}
            <div className="flex-1 overflow-auto">
              <ProductionOrderDetailsPane
                productionOrderId={selectedProductionOrder.id}
                onClose={handleProductionOrderClose}
                initialProductionOrder={selectedProductionOrder}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

