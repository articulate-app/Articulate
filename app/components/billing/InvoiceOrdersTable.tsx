"use client"

import React, { useState, useEffect } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { InfiniteList } from '../ui/infinite-list'
import { Badge } from '../ui/badge'
import { buildTrailingQuery } from '../../lib/services/billing'
import type { InvoiceOrder, InvoiceOrderFilters, InvoiceOrderSortConfig } from '../../lib/types/billing'

interface InvoiceOrdersTableProps {
  filters: InvoiceOrderFilters
  sort: InvoiceOrderSortConfig
  selectedOrder: InvoiceOrder | null
  selectedOrders: Set<number>
  onOrderSelect: (order: InvoiceOrder) => void
  onOrderToggle: (orderId: number) => void
  onSortChange: (sort: InvoiceOrderSortConfig) => void
  hasRightPaneOpen?: boolean
  rightPaneCount?: number
  selectedTaskId?: number | null
}

const formatCurrency = (amount: number, currencyCode: string | null = 'EUR') => {
  const safeCurrencyCode = currencyCode || 'EUR'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: safeCurrencyCode,
  }).format(amount)
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const formatPeriod = (start: string, end: string) => {
  const startDate = new Date(start)
  const endDate = new Date(end)
  
  if (startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear()) {
    return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${endDate.getDate()}, ${endDate.getFullYear()}`
  }
  
  return `${formatDate(start)} – ${formatDate(end)}`
}

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'not_issued':
      return 'secondary'
    case 'partially_issued':
      return 'default'
    case 'issued':
      return 'default'
    default:
      return 'secondary'
  }
}

const formatStatusText = (status: string) => {
  switch (status) {
    case 'not_issued':
      return 'Not issued'
    case 'partially_issued':
      return 'Partially Issued'
    case 'issued':
      return 'Issued'
    default:
      return status
  }
}

const SortableHeader: React.FC<{
  field: InvoiceOrderSortConfig['field']
  currentSort: InvoiceOrderSortConfig
  onSortChange: (sort: InvoiceOrderSortConfig) => void
  children: React.ReactNode
}> = ({ field, currentSort, onSortChange, children }) => {
  const isActive = currentSort.field === field
  
  const handleClick = () => {
    const newDirection = isActive && currentSort.direction === 'asc' ? 'desc' : 'asc'
    onSortChange({ field, direction: newDirection })
  }
  
  return (
    <th 
      className="px-3 py-2 text-left text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-50 select-none"
      onClick={handleClick}
    >
      <div className="flex items-center space-x-1">
        <span>{children}</span>
        <div className="flex flex-col">
          <ChevronUp 
            className={`w-3 h-3 ${isActive && currentSort.direction === 'asc' ? 'text-gray-900' : 'text-gray-300'}`} 
          />
          <ChevronDown 
            className={`w-3 h-3 ${isActive && currentSort.direction === 'desc' ? 'text-gray-900' : 'text-gray-300'}`} 
          />
        </div>
      </div>
    </th>
  )
}

export function InvoiceOrdersTable({ filters, sort, selectedOrder, selectedOrders, onOrderSelect, onOrderToggle, onSortChange, hasRightPaneOpen, rightPaneCount = 0, selectedTaskId }: InvoiceOrdersTableProps) {
  const trailingQuery = buildTrailingQuery(filters, sort)
  
  // Create a query key that includes filters and sort to ensure cache invalidation
  const queryKey = `invoice-orders-${JSON.stringify(filters)}-${JSON.stringify(sort)}`
  
  // Prevent hydration mismatch
  const [isClient, setIsClient] = useState(false)
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)
  const [containerHeight, setContainerHeight] = useState<number>(400)
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Compute height to bottom of viewport
  useEffect(() => {
    if (!isClient) return
    const update = () => {
      const el = scrollContainerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setContainerHeight(Math.max(200, window.innerHeight - rect.top))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [isClient, hasRightPaneOpen, rightPaneCount, selectedTaskId])

  // Right padding/margin equal to open panes width (invoice drawer 384, issued invoice 384, task 384)
  const rightPadding = hasRightPaneOpen ? `${Math.min(rightPaneCount, 3) * 384}px` : '0px'



  if (!isClient) {
    return (
      <div className="flex flex-col h-full">
        <div className="relative h-full min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse" style={{ minWidth: '1000px' }}>
            <thead className="sticky top-0 z-20 bg-white border-b shadow-sm">
              <tr>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 min-w-[120px]">Project</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 min-w-[120px]">Period</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 min-w-[120px]">Amount (no VAT)</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 min-w-[120px]">Issued to Date</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 min-w-[120px]">Remaining</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 min-w-[120px]">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="text-center text-gray-500 py-8">Loading...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollContainerRef}
        className="relative overflow-auto"
        style={{
          marginRight: rightPadding,
          scrollbarGutter: 'stable',
          height: containerHeight,
          overflowY: 'auto',
        }}
      >
        <div style={{ width: `calc(100% + ${rightPadding})` }}>
        <table className="w-full border-collapse" style={{ minWidth: '1000px' }}>
                      <thead className="sticky top-0 z-20 bg-white border-b shadow-sm">
              <tr>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 w-12">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    onChange={(e) => {
                      // TODO: Implement select all functionality
                    }}
                  />
                </th>
                <SortableHeader field="project_name" currentSort={sort} onSortChange={onSortChange}>
                  Project
                </SortableHeader>
              <SortableHeader field="billing_period_start" currentSort={sort} onSortChange={onSortChange}>
                Period
              </SortableHeader>
              <SortableHeader field="subtotal_amount" currentSort={sort} onSortChange={onSortChange}>
                Amount (no VAT)
              </SortableHeader>
              <SortableHeader field="issued_subtotal" currentSort={sort} onSortChange={onSortChange}>
                Issued to Date
              </SortableHeader>
              <SortableHeader field="remaining_subtotal" currentSort={sort} onSortChange={onSortChange}>
                Remaining
              </SortableHeader>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 min-w-[120px]">
                Status
              </th>

            </tr>
          </thead>
          <tbody>
            <InfiniteList<'v_invoice_orders_list'>
              tableName="v_invoice_orders_list"
              columns="*"
              pageSize={50}
              trailingQuery={trailingQuery}
              queryKey={queryKey}
              isTableBody={true}
              renderNoResults={() => (
                <tr>
                  <td colSpan={6} className="text-center text-gray-500 py-8">No invoice orders found</td>
                </tr>
              )}
              renderEndMessage={() => (
                <tr>
                  <td colSpan={6} className="text-center text-gray-400 py-4">No more invoice orders</td>
                </tr>
              )}
              renderSkeleton={(count) => (
                <>
                  {Array.from({ length: count }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="py-4 animate-pulse bg-white" />
                    </tr>
                  ))}
                </>
              )}
            >
              {(orders) => (
                <>
                  {orders.map((order: InvoiceOrder) => (
                    <tr 
                      key={order.id} 
                      className={`hover:bg-gray-50 cursor-pointer border-b border-gray-100 ${
                        selectedOrder?.id === order.id ? 'bg-gray-50' : ''
                      }`}
                      onClick={(e) => {
                        // Don't trigger row selection if clicking on checkbox
                        if ((e.target as HTMLElement).tagName === 'INPUT') {
                          return
                        }
                        onOrderSelect(order)
                      }}
                    >
                      <td className="px-3 py-2 text-sm border-b border-gray-100 w-12">
                        <input
                          type="checkbox"
                          checked={selectedOrders.has(order.id)}
                          onChange={(e) => {
                            e.stopPropagation()
                            onOrderToggle(order.id)
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">
                        <div className="flex items-center space-x-2">
                          {order.project_color && (
                            <div 
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: order.project_color }}
                            />
                          )}
                          <span className="truncate">{order.project_name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">
                        {formatPeriod(order.billing_period_start, order.billing_period_end)}
                      </td>
                      <td className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">
                        {formatCurrency(order.subtotal_amount, order.currency_code)}
                      </td>
                      <td className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">
                        {formatCurrency(order.issued_subtotal || 0, order.currency_code)}
                      </td>
                      <td className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle font-medium">
                        {formatCurrency(order.remaining_subtotal || 0, order.currency_code)}
                      </td>
                      <td className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">
                        <Badge variant={getStatusBadgeVariant(order.status)}>
                          {formatStatusText(order.status)}
                        </Badge>
                      </td>

                    </tr>
                  ))}
                </>
              )}
            </InfiniteList>
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
} 