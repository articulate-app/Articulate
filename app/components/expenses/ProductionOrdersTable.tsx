"use client"

import React, { useMemo } from 'react'
import { InfiniteList } from '../ui/infinite-list'
import { buildProductionOrderTrailingQuery } from '../../lib/services/expenses'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { ProductionOrderFilters, ProductionOrderSortConfig, ProductionOrderList } from '../../lib/types/expenses'

interface ProductionOrdersTableProps {
  filters: ProductionOrderFilters
  sort: ProductionOrderSortConfig
  onSortChange: (sort: ProductionOrderSortConfig) => void
  onProductionOrderSelect: (productionOrder: ProductionOrderList) => void
  selectedProductionOrderId?: number
}

const formatCurrency = (amount: number, currencyCode: string | null = 'EUR') => {
  if (amount === null || amount === undefined) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode || 'EUR',
  }).format(amount)
}

const formatPeriodMonth = (periodMonth: string) => {
  if (!periodMonth) return '-'
  return periodMonth // Already in YYYY-MM format
}

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'open':
      return 'default'
    case 'closed':
      return 'secondary'
    default:
      return 'outline'
  }
}

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

export function ProductionOrdersTable({
  filters,
  sort,
  onSortChange,
  onProductionOrderSelect,
  selectedProductionOrderId
}: ProductionOrdersTableProps) {
  const trailingQuery = useMemo(() => buildProductionOrderTrailingQuery(filters, sort), [filters, sort])

  // Client-side search filter for project names
  const clientSideFilter = useMemo(() => {
    if (!filters.q) return undefined
    
    return (item: ProductionOrderList) => {
      const searchTerm = filters.q.toLowerCase()
      return item.projects.some(project => 
        project.project_name.toLowerCase().includes(searchTerm)
      )
    }
  }, [filters.q])

  const handleSort = (field: ProductionOrderSortConfig['field']) => {
    const newDirection = sort.field === field && sort.direction === 'asc' ? 'desc' : 'asc'
    onSortChange({ field, direction: newDirection })
  }

  const SortButton = ({ field, children }: { field: ProductionOrderSortConfig['field']; children: React.ReactNode }) => {
    const isActive = sort.field === field
    const isAsc = isActive && sort.direction === 'asc'
    const isDesc = isActive && sort.direction === 'desc'

    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-auto p-0 font-medium text-gray-900 hover:text-gray-700"
        onClick={() => handleSort(field)}
      >
        <span className="flex items-center gap-1">
          {children}
          {isAsc && <ChevronUp className="h-4 w-4" />}
          {isDesc && <ChevronDown className="h-4 w-4" />}
        </span>
      </Button>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Table Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-3">
          <div className="grid grid-cols-6 gap-4 text-sm font-medium text-gray-500 uppercase tracking-wider">
            <div>
              <SortButton field="period_month">Period</SortButton>
            </div>
            <div>
              <SortButton field="payer_team_name">Payer Team</SortButton>
            </div>
            <div>
              <SortButton field="supplier_team_name">Supplier Team</SortButton>
            </div>
            <div>
              <SortButton field="currency_code">Currency</SortButton>
            </div>
            <div>
              <SortButton field="subtotal_amount">Amount</SortButton>
            </div>
            <div>
              <SortButton field="status">Status</SortButton>
            </div>
          </div>
        </div>
      </div>

      {/* Table Body */}
      <div className="flex-1 overflow-auto">
        <InfiniteList
          tableName="v_production_orders_list"
          trailingQuery={trailingQuery}
          pageSize={50}
          renderNoResults={() => (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <p className="text-lg font-medium">No production orders found</p>
              <p className="text-sm mt-1">Try adjusting your filters or search terms</p>
            </div>
          )}
        >
          {(productionOrders: ProductionOrderList[]) => 
            productionOrders.map((productionOrder) => (
              <div
                key={productionOrder.id}
                className={`px-6 py-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                  selectedProductionOrderId === productionOrder.id ? 'bg-blue-50 border-blue-200' : ''
                }`}
                onClick={() => onProductionOrderSelect(productionOrder)}
              >
                <div className="grid grid-cols-6 gap-4 items-center">
                  <div className="text-sm text-gray-900">
                    {formatPeriodMonth(productionOrder.period_month)}
                  </div>
                  <div className="text-sm text-gray-900">
                    {productionOrder.payer_team_name}
                  </div>
                  <div className="text-sm text-gray-900">
                    {productionOrder.supplier_team_name}
                  </div>
                  <div className="text-sm text-gray-900">
                    {productionOrder.currency_code}
                  </div>
                  <div className="text-sm text-gray-900">
                    {formatCurrency(productionOrder.subtotal_amount, productionOrder.currency_code)}
                  </div>
                  <div>
                    <Badge variant={getStatusBadgeVariant(productionOrder.status)}>
                      {getStatusLabel(productionOrder.status)}
                    </Badge>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  {productionOrder.projects.length} project{productionOrder.projects.length !== 1 ? 's' : ''}
                </div>
              </div>
            ))
          }
        </InfiniteList>
      </div>
    </div>
  )
}
