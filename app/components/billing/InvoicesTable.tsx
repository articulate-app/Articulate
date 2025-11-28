"use client"

import React, { useState, useEffect } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { InfiniteList } from '../ui/infinite-list'
import { Badge } from '../ui/badge'
import { buildInvoiceTrailingQuery } from '../../lib/services/billing'
import type { InvoiceFilters, InvoiceSortConfig, IssuedInvoiceList } from '../../lib/types/billing'

interface InvoicesTableProps {
  filters: InvoiceFilters
  sort: InvoiceSortConfig
  onSortChange: (sort: InvoiceSortConfig) => void
  onInvoiceSelect: (invoice: IssuedInvoiceList) => void
  selectedInvoice?: IssuedInvoiceList | null
  hasRightPaneOpen?: boolean
  selectedTaskId?: number | null
}

const formatCurrency = (amount: number, currencyCode: string | null = 'EUR') => {
  const safeCurrencyCode = currencyCode || 'EUR'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: safeCurrencyCode,
  }).format(amount)
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return '—'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'draft':
      return 'secondary'
    case 'issued':
      return 'default'
    case 'sent':
      return 'default'
    case 'paid':
      return 'default'
    case 'cancelled':
      return 'destructive'
    default:
      return 'secondary'
  }
}

const formatStatusText = (status: string) => {
  switch (status) {
    case 'issued':
      return 'Issued'
    case 'partially_paid':
      return 'Partially Paid'
    case 'pending_external':
      return 'Pending external'
    case 'paid':
      return 'Paid'
    case 'draft':
      return 'Draft'
    case 'sent':
      return 'Sent'
    case 'cancelled':
      return 'Cancelled'
    default:
      return status.charAt(0).toUpperCase() + status.slice(1)
  }
}

const SortableHeader: React.FC<{
  field: InvoiceSortConfig['field']
  currentSort: InvoiceSortConfig
  onSortChange: (sort: InvoiceSortConfig) => void
  children: React.ReactNode
  className?: string
}> = ({ field, currentSort, onSortChange, children, className = "" }) => {
  const isActive = currentSort.field === field
  const handleClick = () => onSortChange({ field, direction: currentSort.direction === 'asc' ? 'desc' : 'asc' })

  return (
    <th
      className={`px-3 py-2 text-left text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-50 select-none ${className}`}
      onClick={handleClick}
    >
      <div className="flex items-center space-x-1">
        <span>{children}</span>
        <div className="flex flex-col">
          {isActive && currentSort.direction === 'asc' ? (
            <ChevronUp className="w-4 h-4" />
          ) : isActive && currentSort.direction === 'desc' ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <div className="w-4 h-4" />
          )}
        </div>
      </div>
    </th>
  )
}

type InvoiceColumnId =
  | 'invoice_number'
  | 'status'
  | 'invoice_date'
  | 'payer_team_name'
  | 'subtotal_amount'
  | 'total_amount'
  | 'credited_subtotal_amount'
  | 'amount_paid'
  | 'allocated_subtotal_amount'
  | 'balance_due'
  | 'last_payment_date'
  | 'projects'
  | 'created_at'

interface InvoiceColumnConfig {
  id: InvoiceColumnId
  label: string
  minWidth: number
  width?: number
  sortable?: boolean
  sortField?: InvoiceSortConfig['field']
}

export function InvoicesTable({ filters, sort, onSortChange, onInvoiceSelect, selectedInvoice, hasRightPaneOpen, selectedTaskId }: InvoicesTableProps) {
  const trailingQuery = buildInvoiceTrailingQuery(filters, sort)
  
  // Create a query key that includes filters and sort to ensure cache invalidation
  const queryKey = `invoices-${JSON.stringify(filters)}-${JSON.stringify(sort)}`
  
  // Prevent hydration mismatch
  const [isClient, setIsClient] = useState(false)
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)
  const [containerHeight, setContainerHeight] = useState<number>(400)
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null)
  const resizingRef = React.useRef<boolean>(false)
  const defaultColumns: InvoiceColumnConfig[] = [
      { id: 'invoice_number', label: 'Invoice #', minWidth: 120, sortable: true, sortField: 'invoice_number' },
      { id: 'status', label: 'Status', minWidth: 100, sortable: true, sortField: 'status' },
      { id: 'invoice_date', label: 'Issued Date', minWidth: 120, sortable: true, sortField: 'invoice_date' },
      { id: 'payer_team_name', label: 'Invoiced to', minWidth: 150, sortable: true, sortField: 'payer_team_name' },
      { id: 'projects', label: 'Projects', minWidth: 150, sortable: true, sortField: 'projects_text' },
      { id: 'subtotal_amount', label: 'Amount (no VAT)', minWidth: 130, sortable: true, sortField: 'subtotal_amount' },
      { id: 'total_amount', label: 'Amount (with VAT)', minWidth: 140, sortable: true, sortField: 'total_amount' },
      { id: 'amount_paid', label: 'Paid (with VAT)', minWidth: 130, sortable: true, sortField: 'amount_paid' },
      { id: 'allocated_subtotal_amount', label: 'Allocated', minWidth: 100, sortable: true, sortField: 'allocated_subtotal_amount' },
      { id: 'credited_subtotal_amount', label: 'Credited (no VAT)', minWidth: 130, sortable: true, sortField: 'credited_subtotal_amount' },
      { id: 'balance_due', label: 'Balance (with VAT)', minWidth: 140, sortable: true, sortField: 'balance_due' },
      { id: 'last_payment_date', label: 'Last Payment', minWidth: 120, sortable: true, sortField: 'last_payment_date' },
  ]
  const [columns, setColumns] = useState<InvoiceColumnConfig[]>(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('invoicesTable:columns') : null
    if (stored) {
      try {
        const parsed: InvoiceColumnConfig[] = JSON.parse(stored)
        const map = new Map(defaultColumns.map(c => [c.id, c]))
        // Merge defaults into stored to add new props like sortable/sortField
        const merged = parsed.map((c) => ({ ...map.get(c.id)!, ...c }))
        // Append any missing columns
        defaultColumns.forEach(dc => { if (!merged.find(m => m.id === dc.id)) merged.push(dc) })
        return merged
      } catch {}
    }
    return defaultColumns
  })

  // Persist column state
  useEffect(() => {
    if (!isClient) return
    window.localStorage.setItem('invoicesTable:columns', JSON.stringify(columns))
  }, [isClient, columns])
  
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Compute height so the scroll container reaches the bottom of the viewport
  useEffect(() => {
    if (!isClient) return
    const updateDimensions = () => {
      const el = scrollContainerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const viewportH = window.innerHeight
      const computed = Math.max(200, viewportH - rect.top)
      setContainerHeight(computed)

      // removed debug update
    }
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    window.addEventListener('scroll', updateDimensions, true)
    return () => {
      window.removeEventListener('resize', updateDimensions)
      window.removeEventListener('scroll', updateDimensions, true)
    }
  }, [isClient, hasRightPaneOpen, selectedTaskId])

  // Drag & drop reorder handlers
  const handleHeaderDragStart = (index: number) => setDragStartIndex(index)
  const handleHeaderDragOver = (e: React.DragEvent<HTMLTableCellElement>) => {
    e.preventDefault()
  }
  const handleHeaderDrop = (index: number) => {
    if (dragStartIndex === null || dragStartIndex === index) return
    setColumns(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragStartIndex, 1)
      next.splice(index, 0, moved)
      return next
    })
    setDragStartIndex(null)
  }

  // Helper to start resizing a specific column
  const startResize = (colId: InvoiceColumnId, startClientX: number) => {
    resizingRef.current = true
    const startWidths = new Map(columns.map(c => [c.id, c.width ?? c.minWidth]))
    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - startClientX
      setColumns(prev => prev.map(c => c.id === colId ? { ...c, width: Math.max(c.minWidth, (startWidths.get(c.id) || c.minWidth) + dx) } : c))
    }
    const onMouseUp = () => {
      resizingRef.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  if (!isClient) {
    return (
      <div className="flex flex-col h-full">
        <div className="relative h-full min-h-0 flex-1">
          <table className="w-full border-collapse" style={{ minWidth: '1400px' }}>
            <thead className="sticky top-0 z-20 bg-white border-b shadow-sm">
                          <tr>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Invoice #</th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Status</th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Issued Date</th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Issuer</th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Invoiced to</th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Orders</th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Amount (No VAT)</th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Amount (with VAT)</th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Paid</th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Balance</th>
            </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={12} className="text-center text-gray-500 py-8">Loading...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const handleRowClick = (invoice: IssuedInvoiceList) => {
    onInvoiceSelect(invoice)
  }

  const renderNoResults = () => (
    <tr>
      <td colSpan={12} className="text-center text-gray-500 py-8">No invoices found</td>
    </tr>
  )

  const renderEndMessage = () => (
    <tr>
      <td colSpan={12} className="text-center text-gray-400 py-4">No more invoices</td>
    </tr>
  )

  const renderSkeleton = (count: number) => (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i}>
          <td colSpan={12} className="py-4 animate-pulse bg-muted" />
        </tr>
      ))}
    </>
  )

  // Calculate padding for the scroll container when right pane is open
  const rightPadding = hasRightPaneOpen 
    ? selectedTaskId 
      ? '768px' // Both invoice detail (384px) and task detail (384px) open
      : '384px' // Only invoice detail open
    : '0px'

  return (
    <div className="flex flex-col h-full">
        <div
          ref={scrollContainerRef}
          className="relative overflow-auto billing-scrollbar-always"
         style={{ 
           // Shift the scrollport left of the right pane so the vertical scrollbar aligns with the new viewport edge
           marginRight: rightPadding,
           // Dynamically fill to bottom of viewport
           height: containerHeight
         }}
      >
        
        {/* Keep perceived content width stable when the scrollport shifts left */}
        <div style={{ width: `calc(100% + ${rightPadding})` }}>
        <table className="w-full border-collapse" style={{ minWidth: '1400px', tableLayout: 'fixed' }}>
          <thead className="sticky top-0 z-20 bg-white border-b shadow-sm">
            <tr>
              {columns.map((col, index) => {
                const widthPx = (col.width ?? col.minWidth)
                const commonClass = 'px-3 py-2 text-left text-sm font-medium text-gray-500 select-none relative'
                const style = { width: `${widthPx}px`, minWidth: `${col.minWidth}px`, maxWidth: `${widthPx}px` }
                const isActive = col.sortable && sort.field === col.sortField
                const onClick = () => {
                  if (!col.sortable || !col.sortField) return
                  onSortChange({ field: col.sortField, direction: isActive && sort.direction === 'asc' ? 'desc' : 'asc' })
                }
                return (
                  <th
                    key={col.id}
                    className={commonClass}
                    style={style as React.CSSProperties}
                  >
                    {/* Drag handle (absolute) */}
                    <div
                      className="absolute left-0 top-0 h-full w-3 cursor-grab"
                      role="button"
                      aria-label={`Drag to move ${col.label}`}
                      draggable
                      onDragStart={() => handleHeaderDragStart(index)}
                      onDragOver={handleHeaderDragOver}
                      onDrop={() => handleHeaderDrop(index)}
                      data-drag="handle"
                    />
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!col.sortable || !col.sortField || resizingRef.current) return
                          onSortChange({ field: col.sortField, direction: isActive && sort.direction === 'asc' ? 'desc' : 'asc' })
                        }}
                        className="bg-transparent border-0 p-0 m-0 cursor-pointer text-left truncate"
                      >
                        {col.label}
                      </button>
                      {col.sortable && (
                        <div className="flex flex-col">
                          {isActive && sort.direction === 'asc' ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : isActive && sort.direction === 'desc' ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <div className="w-4 h-4" />
                          )}
                        </div>
                      )}
                    </div>
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        // start resize for this column using direct listeners
                        startResize(col.id, e.clientX)
                      }}
                      data-resize="handle"
                      className="absolute top-0 right-0 h-full w-4 cursor-col-resize"
                      style={{ userSelect: 'none' }}
                    />
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            <InfiniteList<'v_issued_invoices_list'>
              tableName="v_issued_invoices_list"
              columns="*"
              pageSize={50}
              trailingQuery={trailingQuery}
              queryKey={queryKey}
              isTableBody={true}
              renderNoResults={renderNoResults}
              renderEndMessage={renderEndMessage}
              renderSkeleton={renderSkeleton}
            >
              {(invoices: IssuedInvoiceList[]) => 
                invoices.map((invoice) => (
                  <tr 
                    key={invoice.id} 
                    className={`hover:bg-gray-50 cursor-pointer border-b border-gray-100 ${
                      selectedInvoice?.id === invoice.id ? 'bg-gray-50' : ''
                    }`}
                    onClick={() => handleRowClick(invoice)}
                  >
                    {columns.map((col) => {
                      const widthPx = (col.width ?? col.minWidth)
                      const cellStyle = { width: `${widthPx}px`, minWidth: `${col.minWidth}px` }
                      let content: React.ReactNode = null
                      switch (col.id) {
                        case 'invoice_number':
                          content = <span className="font-medium text-gray-900">{invoice.invoice_number}</span>
                          break
                        case 'status':
                          content = <Badge variant={getStatusBadgeVariant(invoice.status)}>{formatStatusText(invoice.status)}</Badge>
                          break
                        case 'invoice_date':
                          content = invoice.invoice_date ? formatDate(invoice.invoice_date) : '—'
                          break
                        case 'payer_team_name':
                          content = invoice.payer_team_name || '—'
                          break
                        case 'subtotal_amount':
                          content = invoice.subtotal_amount ? formatCurrency(invoice.subtotal_amount, invoice.currency_code) : '—'
                          break
                        case 'total_amount':
                          content = invoice.total_amount ? formatCurrency(invoice.total_amount, invoice.currency_code) : '—'
                          break
                        case 'credited_subtotal_amount':
                          content = invoice.credited_subtotal_amount ? formatCurrency(invoice.credited_subtotal_amount, invoice.currency_code) : '—'
                          break
                        case 'amount_paid':
                          content = invoice.amount_paid ? formatCurrency(invoice.amount_paid, invoice.currency_code) : '—'
                          break
                        case 'allocated_subtotal_amount':
                          content = invoice.allocated_subtotal_amount ? formatCurrency(invoice.allocated_subtotal_amount, invoice.currency_code) : '—'
                          break
                        case 'balance_due':
                          content = invoice.balance_due ? formatCurrency(invoice.balance_due, invoice.currency_code) : '—'
                          break
                        case 'last_payment_date':
                          content = invoice.last_payment_date ? formatDate(invoice.last_payment_date) : '—'
                          break
                        case 'projects':
                          content = invoice.projects && invoice.projects.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {invoice.projects.slice(0, 2).map((project, index) => (
                                <Badge key={index} variant="secondary" className="text-xs">
                                  {project}
                                </Badge>
                              ))}
                              {invoice.projects.length > 2 && (
                                <Badge variant="outline" className="text-xs">
                                  +{invoice.projects.length - 2}
                                </Badge>
                              )}
                            </div>
                          ) : '—'
                          break
                        case 'created_at':
                          content = invoice.created_at ? formatDate(invoice.created_at) : '—'
                          break
                        default:
                          content = '—'
                      }
                      return (
                        <td key={col.id} className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle" style={{ ...cellStyle, maxWidth: cellStyle.width } as React.CSSProperties}>
                          {content}
                        </td>
                      )
                    })}
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