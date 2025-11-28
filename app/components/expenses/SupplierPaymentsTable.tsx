"use client"

import React, { useState, useEffect } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { InfiniteList } from '../ui/infinite-list'
import { Badge } from '../ui/badge'
import { buildSupplierPaymentTrailingQuery } from '../../lib/services/expenses'
import type { SupplierPaymentFilters, SupplierPaymentSortConfig, SupplierPaymentList } from '../../lib/types/expenses'

interface SupplierPaymentsTableProps {
  filters: SupplierPaymentFilters
  sort: SupplierPaymentSortConfig
  onSortChange: (sort: SupplierPaymentSortConfig) => void
  onPaymentSelect: (payment: SupplierPaymentList) => void
  selectedPayment?: SupplierPaymentList | null
}

const formatCurrency = (amount: number, currencyCode: string | null = 'EUR') => {
  if (amount === null || amount === undefined) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode || 'EUR',
  }).format(amount)
}

const formatDate = (dateString: string) => {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'pending':
      return 'outline'
    case 'completed':
      return 'default'
    case 'failed':
      return 'destructive'
    default:
      return 'default'
  }
}

const SortableHeader: React.FC<{
  field: SupplierPaymentSortConfig['field']
  currentSort: SupplierPaymentSortConfig
  onSortChange: (sort: SupplierPaymentSortConfig) => void
  children: React.ReactNode
}> = ({ field, currentSort, onSortChange, children }) => {
  const isActive = currentSort.field === field
  const isAscending = currentSort.direction === 'asc'

  const handleClick = () => {
    const newDirection = isActive && isAscending ? 'desc' : 'asc'
    onSortChange({ field, direction: newDirection })
  }

  return (
    <th 
      className="px-3 py-2 text-left text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-50 select-none"
      onClick={handleClick}
    >
      <div className="flex items-center space-x-1">
        <span>{children}</span>
        {isActive ? (
          isAscending ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )
        ) : (
          <div className="w-4 h-4" />
        )}
      </div>
    </th>
  )
}

export function SupplierPaymentsTable({ filters, sort, onSortChange, onPaymentSelect, selectedPayment }: SupplierPaymentsTableProps) {
  const trailingQuery = buildSupplierPaymentTrailingQuery(filters, sort)
  
  // Create a query key that includes filters and sort to ensure cache invalidation
  const queryKey = `supplier-payments-${JSON.stringify(filters)}-${JSON.stringify(sort)}`
  
  // Prevent hydration mismatch
  const [isClient, setIsClient] = useState(false)
  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return (
      <div className="flex flex-col h-full">
        <div className="relative h-full min-h-0 flex-1">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-20 bg-white border-b shadow-sm">
              <tr>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Date</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Supplier</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Amount</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Currency</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Method</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Status</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Allocated</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Unallocated</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={8} className="text-center text-gray-500 py-8">Loading...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const handleRowClick = (payment: SupplierPaymentList) => {
    onPaymentSelect(payment)
  }

  const renderNoResults = () => (
    <tr>
      <td colSpan={8} className="text-center text-gray-500 py-8">No supplier payments found</td>
    </tr>
  )

  const renderEndMessage = () => (
    <tr>
      <td colSpan={8} className="text-center text-gray-400 py-4">No more supplier payments</td>
    </tr>
  )

  const renderSkeleton = (count: number) => (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i}>
          <td colSpan={8} className="py-4 animate-pulse bg-muted" />
        </tr>
      ))}
    </>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="relative h-full min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse min-w-max">
          <thead className="sticky top-0 z-20 bg-white border-b shadow-sm">
            <tr>
              <SortableHeader field="payment_date" currentSort={sort} onSortChange={onSortChange}>
                Date
              </SortableHeader>
              <SortableHeader field="supplier_team_name" currentSort={sort} onSortChange={onSortChange}>
                Supplier
              </SortableHeader>
              <SortableHeader field="payment_amount" currentSort={sort} onSortChange={onSortChange}>
                Amount
              </SortableHeader>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">
                Currency
              </th>
              <SortableHeader field="method" currentSort={sort} onSortChange={onSortChange}>
                Method
              </SortableHeader>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">
                Status
              </th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">
                Allocated
              </th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">
                Unallocated
              </th>
            </tr>
          </thead>
          <tbody>
            <InfiniteList<'v_supplier_payments_summary'>
              tableName="v_supplier_payments_summary"
              columns="*"
              pageSize={50}
              trailingQuery={trailingQuery}
              queryKey={queryKey}
              isTableBody={true}
              renderNoResults={renderNoResults}
              renderEndMessage={renderEndMessage}
              renderSkeleton={renderSkeleton}
            >
              {(payments: SupplierPaymentList[]) => 
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
                      {payment.supplier_team_name}
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedPayment?.payment_id === payment.payment_id ? 'bg-gray-50' : ''
                    }`}>
                      {formatCurrency(payment.payment_amount, payment.payment_currency)}
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedPayment?.payment_id === payment.payment_id ? 'bg-gray-50' : ''
                    }`}>
                      {payment.payment_currency}
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedPayment?.payment_id === payment.payment_id ? 'bg-gray-50' : ''
                    }`}>
                      {payment.method}
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedPayment?.payment_id === payment.payment_id ? 'bg-gray-50' : ''
                    }`}>
                      <Badge variant={getStatusBadgeVariant(payment.status)}>
                        {payment.status}
                      </Badge>
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedPayment?.payment_id === payment.payment_id ? 'bg-gray-50' : ''
                    }`}>
                      {formatCurrency(payment.amount_allocated, payment.payment_currency)}
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedPayment?.payment_id === payment.payment_id ? 'bg-gray-50' : ''
                    }`}>
                      {formatCurrency(payment.unallocated_amount, payment.payment_currency)}
                    </td>
                  </tr>
                ))
              }
            </InfiniteList>
          </tbody>
        </table>
      </div>
    </div>
  )
} 