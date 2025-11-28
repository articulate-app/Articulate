"use client"

import React, { useState, useEffect } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { InfiniteList } from '../ui/infinite-list'
import { Badge } from '../ui/badge'
import { buildSupplierInvoiceTrailingQuery } from '../../lib/services/expenses'
import type { SupplierInvoiceFilters, SupplierInvoiceSortConfig, SupplierInvoiceList } from '../../lib/types/expenses'

interface SupplierInvoicesTableProps {
  filters: SupplierInvoiceFilters
  sort: SupplierInvoiceSortConfig
  onSortChange: (sort: SupplierInvoiceSortConfig) => void
  onInvoiceSelect: (invoice: SupplierInvoiceList) => void
  selectedInvoice?: SupplierInvoiceList | null
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
    case 'received':
      return 'default'
    case 'partially_paid':
      return 'secondary'
    case 'paid':
      return 'default'
    case 'void':
      return 'destructive'
    case 'draft':
      return 'outline'
    default:
      return 'default'
  }
}

const SortableHeader: React.FC<{
  field: SupplierInvoiceSortConfig['field']
  currentSort: SupplierInvoiceSortConfig
  onSortChange: (sort: SupplierInvoiceSortConfig) => void
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

export function SupplierInvoicesTable({ filters, sort, onSortChange, onInvoiceSelect, selectedInvoice }: SupplierInvoicesTableProps) {
  const trailingQuery = buildSupplierInvoiceTrailingQuery(filters, sort)
  
  // Create a query key that includes filters and sort to ensure cache invalidation
  const queryKey = `supplier-invoices-${JSON.stringify(filters)}-${JSON.stringify(sort)}`
  
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
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Invoice #</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Status</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Invoice Date</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Supplier</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Currency</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Total Amount</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Amount Paid</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Credited</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Balance Due</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={9} className="text-center text-gray-500 py-8">Loading...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const handleRowClick = (invoice: SupplierInvoiceList) => {
    onInvoiceSelect(invoice)
  }

  const renderNoResults = () => (
    <tr>
      <td colSpan={9} className="text-center text-gray-500 py-8">No supplier invoices found</td>
    </tr>
  )

  const renderEndMessage = () => (
    <tr>
      <td colSpan={9} className="text-center text-gray-400 py-4">No more supplier invoices</td>
    </tr>
  )

  const renderSkeleton = (count: number) => (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i}>
          <td colSpan={9} className="py-4 animate-pulse bg-muted" />
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
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">
                Invoice #
              </th>
              <SortableHeader field="status" currentSort={sort} onSortChange={onSortChange}>
                Status
              </SortableHeader>
              <SortableHeader field="invoice_date" currentSort={sort} onSortChange={onSortChange}>
                Invoice Date
              </SortableHeader>
              <SortableHeader field="supplier_team_name" currentSort={sort} onSortChange={onSortChange}>
                Supplier
              </SortableHeader>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">
                Currency
              </th>
              <SortableHeader field="total_amount" currentSort={sort} onSortChange={onSortChange}>
                Total Amount
              </SortableHeader>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">
                Amount Paid
              </th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">
                Credited
              </th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">
                Balance Due
              </th>
            </tr>
          </thead>
          <tbody>
            <InfiniteList<'v_received_invoices_list'>
              tableName="v_received_invoices_list"
              columns="*"
              pageSize={50}
              trailingQuery={trailingQuery}
              queryKey={queryKey}
              isTableBody={true}
              renderNoResults={renderNoResults}
              renderEndMessage={renderEndMessage}
              renderSkeleton={renderSkeleton}
            >
              {(invoices: SupplierInvoiceList[]) => 
                invoices.map((invoice) => (
                  <tr 
                    key={invoice.id} 
                    className={`hover:bg-gray-50 cursor-pointer border-b border-gray-100 ${
                      selectedInvoice?.id === invoice.id ? 'bg-gray-50' : ''
                    }`}
                    onClick={() => handleRowClick(invoice)}
                  >
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedInvoice?.id === invoice.id ? 'bg-gray-50' : ''
                    }`}>
                      {invoice.invoice_number}
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedInvoice?.id === invoice.id ? 'bg-gray-50' : ''
                    }`}>
                      <Badge variant={getStatusBadgeVariant(invoice.status)}>
                        {invoice.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedInvoice?.id === invoice.id ? 'bg-gray-50' : ''
                    }`}>
                      {formatDate(invoice.invoice_date)}
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedInvoice?.id === invoice.id ? 'bg-gray-50' : ''
                    }`}>
                      {invoice.supplier_team_name}
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedInvoice?.id === invoice.id ? 'bg-gray-50' : ''
                    }`}>
                      {invoice.currency_code}
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedInvoice?.id === invoice.id ? 'bg-gray-50' : ''
                    }`}>
                      {formatCurrency(invoice.total_amount, invoice.currency_code)}
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedInvoice?.id === invoice.id ? 'bg-gray-50' : ''
                    }`}>
                      {formatCurrency(invoice.amount_paid, invoice.currency_code)}
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedInvoice?.id === invoice.id ? 'bg-gray-50' : ''
                    }`}>
                      {formatCurrency(invoice.credited_amount, invoice.currency_code)}
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedInvoice?.id === invoice.id ? 'bg-gray-50' : ''
                    }`}>
                      {formatCurrency(invoice.balance_due, invoice.currency_code)}
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