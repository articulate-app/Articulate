"use client"

import React, { useState, useEffect } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { InfiniteList } from '../ui/infinite-list'
import { Badge } from '../ui/badge'
import { buildPaymentTrailingQuery } from '../../lib/payments'
import type { PaymentFilters, PaymentSortConfig, PaymentSummary } from '../../lib/types/billing'

interface Allocation {
  issued_invoice_id: number
  invoice_number?: string
  amount_applied: number
}

interface AllocationPillsProps {
  allocations?: Allocation[]
}

const AllocationPills: React.FC<AllocationPillsProps> = ({ allocations }) => {
  if (!allocations || allocations.length === 0) {
    return <span className="text-gray-400">-</span>
  }

  const maxVisible = 5
  const visibleAllocations = allocations.slice(0, maxVisible)
  const remainingCount = allocations.length - maxVisible

  return (
    <div className="flex flex-wrap gap-1">
      {visibleAllocations.map((allocation, index) => (
        <Badge
          key={`${allocation.issued_invoice_id}-${index}`}
          variant="secondary"
          className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700"
        >
          #{allocation.invoice_number || allocation.issued_invoice_id}
        </Badge>
      ))}
      {remainingCount > 0 && (
        <Badge
          variant="secondary"
          className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600"
        >
          +{remainingCount}
        </Badge>
      )}
    </div>
  )
}

interface PaymentsListProps {
  filters: PaymentFilters
  sort: PaymentSortConfig
  onSortChange: (sort: PaymentSortConfig) => void
  onPaymentSelect: (payment: PaymentSummary) => void
  selectedPayment?: PaymentSummary | null
  hasRightPaneOpen?: boolean
}

const formatCurrency = (amount: number, currencyCode: string | null = 'EUR') => {
  const safeCurrencyCode = currencyCode || 'EUR'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: safeCurrencyCode,
  }).format(amount)
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}


const SortableHeader: React.FC<{
  field: PaymentSortConfig['field']
  currentSort: PaymentSortConfig
  onSortChange: (sort: PaymentSortConfig) => void
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

export function PaymentsList({ filters, sort, onSortChange, onPaymentSelect, selectedPayment, hasRightPaneOpen }: PaymentsListProps) {
  const trailingQuery = buildPaymentTrailingQuery(filters, sort)
  
  // Create a query key that includes filters and sort to ensure cache invalidation
  const queryKey = `payments-${JSON.stringify(filters)}-${JSON.stringify(sort)}`
  
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
  }, [isClient, hasRightPaneOpen])

  if (!isClient) {
    return (
      <div className="flex flex-col h-full">
        <div className="relative h-full min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse" style={{ minWidth: '1000px' }}>
            <thead className="sticky top-0 z-20 bg-white border-b shadow-sm">
              <tr>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Date</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Amount</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Currency</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Method</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Allocated</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Unallocated</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">External Ref</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7} className="text-center text-gray-500 py-8">Loading...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const handleRowClick = (payment: PaymentSummary) => {
    onPaymentSelect(payment)
  }

  const renderNoResults = () => (
    <tr>
      <td colSpan={6} className="text-center text-gray-500 py-8">No payments found</td>
    </tr>
  )

  const renderEndMessage = () => (
    <tr>
      <td colSpan={6} className="text-center text-gray-400 py-4">No more payments</td>
    </tr>
  )

  const renderSkeleton = (count: number) => (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i}>
                      <td colSpan={6} className="py-4 animate-pulse bg-white" />
        </tr>
      ))}
    </>
  )

  // When right pane open, shift scrollport left so vertical scrollbar aligns with viewport edge
  const rightPadding = hasRightPaneOpen ? '384px' : '0px'

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
              <SortableHeader
                field="payment_date"
                currentSort={sort}
                onSortChange={onSortChange}
              >
                Date
              </SortableHeader>
              <SortableHeader
                field="payment_amount"
                currentSort={sort}
                onSortChange={onSortChange}
              >
                Amount
              </SortableHeader>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 min-w-[100px]">Allocated</th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 min-w-[120px]">Unallocated</th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 min-w-[120px]">Payer Team</th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 min-w-[150px]">Invoices</th>
              <SortableHeader
                field="external_ref"
                currentSort={sort}
                onSortChange={onSortChange}
              >
                External Ref
              </SortableHeader>
            </tr>
          </thead>
          <tbody>
            <InfiniteList<'v_client_payments_summary'>
              tableName="v_client_payments_summary"
              columns="payment_id,payer_team_id,payer_team_name,payment_date,payment_amount,payment_currency,external_ref,notes,amount_allocated,unallocated_amount,is_overallocated,allocations,created_at,updated_at"
              pageSize={50}
              trailingQuery={trailingQuery}
              queryKey={queryKey}
              isTableBody={true}
              renderNoResults={renderNoResults}
              renderEndMessage={renderEndMessage}
              renderSkeleton={renderSkeleton}
            >
              {(payments: PaymentSummary[]) => 
                payments.map((payment) => (
                  <tr 
                    key={payment.payment_id} 
                    className={`hover:bg-gray-50 cursor-pointer border-b border-gray-100 ${
                      selectedPayment?.payment_id === payment.payment_id ? 'bg-gray-50' : ''
                    }`}
                    onClick={() => handleRowClick(payment)}
                  >
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedPayment?.payment_id === payment.payment_id ? 'bg-gray-50' : ''
                    }`}>
                      {formatDate(payment.payment_date)}
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedPayment?.payment_id === payment.payment_id ? 'bg-gray-50' : ''
                    }`}>
                      {formatCurrency(payment.payment_amount, payment.payment_currency)}
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedPayment?.payment_id === payment.payment_id ? 'bg-gray-50' : ''
                    }`}>
                      {formatCurrency(payment.amount_allocated, payment.payment_currency)}
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedPayment?.payment_id === payment.payment_id ? 'bg-gray-50' : ''
                    }`}>
                      <div className="flex items-center space-x-2">
                        <span>{formatCurrency(payment.unallocated_amount, payment.payment_currency)}</span>
                        {payment.is_overallocated && (
                          <Badge variant="destructive" className="text-xs">
                            Over-allocated
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedPayment?.payment_id === payment.payment_id ? 'bg-gray-50' : ''
                    }`}>
                      {payment.payer_team_name || '-'}
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 align-middle ${
                      selectedPayment?.payment_id === payment.payment_id ? 'bg-gray-50' : ''
                    }`}>
                      <AllocationPills allocations={payment.allocations} />
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedPayment?.payment_id === payment.payment_id ? 'bg-gray-50' : ''
                    }`}>
                      {payment.external_ref || '-'}
                    </td>
                  </tr>
                ))
              }
            </InfiniteList>
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
} 
 
 
 






