"use client"

import React, { useState, useEffect } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { InfiniteList } from '../ui/infinite-list'
import { Badge } from '../ui/badge'
import { buildCreditNoteTrailingQuery } from '../../lib/creditNotes'
import type { CreditNoteFilters, CreditNoteSortConfig, CreditNoteSummary } from '../../lib/types/billing'

interface CreditNotesListProps {
  filters: CreditNoteFilters
  sort: CreditNoteSortConfig
  onSortChange: (sort: CreditNoteSortConfig) => void
  onCreditNoteSelect: (creditNote: CreditNoteSummary) => void
  selectedCreditNote?: CreditNoteSummary | null
  hasRightPaneOpen?: boolean
}

const formatCurrency = (amount: number, currencyCode: string | null = 'EUR') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode || 'EUR',
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
  field: CreditNoteSortConfig['field']
  currentSort: CreditNoteSortConfig
  onSortChange: (sort: CreditNoteSortConfig) => void
  children: React.ReactNode
}> = ({ field, currentSort, onSortChange, children }) => {
  const isActive = currentSort.field === field
  const isAscending = currentSort.direction === 'asc'

  const handleClick = () => {
    onSortChange({
      field,
      direction: isActive && isAscending ? 'desc' : 'asc',
    })
  }

  return (
    <th 
      className="px-3 py-2 text-left text-sm font-medium text-gray-500 cursor-pointer hover:text-gray-700 select-none"
      onClick={handleClick}
    >
      <div className="flex items-center space-x-1">
        <span>{children}</span>
        {isActive && (
          isAscending ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
        )}
      </div>
    </th>
  )
}

export function CreditNotesList({ filters, sort, onSortChange, onCreditNoteSelect, selectedCreditNote, hasRightPaneOpen }: CreditNotesListProps) {
  const trailingQuery = buildCreditNoteTrailingQuery(filters, sort)
  
  // Create a query key that includes filters and sort to ensure cache invalidation
  const queryKey = `credit-notes-${JSON.stringify(filters)}-${JSON.stringify(sort)}`
  
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
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Credit Number</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Date</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Invoice</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Amount (no VAT)</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Status</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Reason</th>
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

  const handleRowClick = (creditNote: CreditNoteSummary) => {
    onCreditNoteSelect(creditNote)
  }

  const renderNoResults = () => (
    <tr>
      <td colSpan={6} className="text-center text-gray-500 py-8">No credit notes found</td>
    </tr>
  )

  const renderEndMessage = () => (
    <tr>
      <td colSpan={6} className="text-center text-gray-400 py-4">No more credit notes</td>
    </tr>
  )

  const renderSkeleton = (count: number) => (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <tr key={index} className="animate-pulse">
          <td className="px-3 py-2">
            <div className="h-4 bg-gray-200 rounded w-24"></div>
          </td>
          <td className="px-3 py-2">
            <div className="h-4 bg-gray-200 rounded w-20"></div>
          </td>
          <td className="px-3 py-2">
            <div className="h-4 bg-gray-200 rounded w-20"></div>
          </td>
          <td className="px-3 py-2">
            <div className="h-4 bg-gray-200 rounded w-16"></div>
          </td>
          <td className="px-3 py-2">
            <div className="h-4 bg-gray-200 rounded w-16"></div>
          </td>
          <td className="px-3 py-2">
            <div className="h-4 bg-gray-200 rounded w-32"></div>
          </td>
        </tr>
      ))}
    </>
  )

  // Shift scrollport left when pane open and stabilize content width
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
              <SortableHeader field="credit_number" currentSort={sort} onSortChange={onSortChange}>
                Credit Number
              </SortableHeader>
              <SortableHeader field="credit_date" currentSort={sort} onSortChange={onSortChange}>
                Date
              </SortableHeader>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 min-w-[120px]">Invoice</th>
              <SortableHeader field="total_amount" currentSort={sort} onSortChange={onSortChange}>
                Amount (no VAT)
              </SortableHeader>
              <SortableHeader field="status" currentSort={sort} onSortChange={onSortChange}>
                Status
              </SortableHeader>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 min-w-[150px]">Reason</th>
            </tr>
          </thead>
          <tbody>
            <InfiniteList<'v_credit_notes_summary'>
              tableName="v_credit_notes_summary"
              columns="credit_note_id,credit_number,credit_date,invoice_number,invoice_date,currency_code,subtotal_amount,vat_amount,total_amount,status,reason,created_at,updated_at,issued_invoice_id"
              pageSize={50}
              trailingQuery={trailingQuery}
              queryKey={queryKey}
              isTableBody={true}
              renderNoResults={renderNoResults}
              renderEndMessage={renderEndMessage}
              renderSkeleton={renderSkeleton}
            >
              {(creditNotes: CreditNoteSummary[]) => 
                creditNotes.map((creditNote) => (
                  <tr 
                    key={creditNote.credit_note_id} 
                    className={`hover:bg-gray-50 cursor-pointer border-b border-gray-100 ${
                      selectedCreditNote?.credit_note_id === creditNote.credit_note_id ? 'bg-gray-50' : ''
                    }`}
                    onClick={() => handleRowClick(creditNote)}
                  >
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedCreditNote?.credit_note_id === creditNote.credit_note_id ? 'bg-gray-50' : ''
                    }`}>
                      {creditNote.credit_number}
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedCreditNote?.credit_note_id === creditNote.credit_note_id ? 'bg-gray-50' : ''
                    }`}>
                      {formatDate(creditNote.credit_date)}
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedCreditNote?.credit_note_id === creditNote.credit_note_id ? 'bg-gray-50' : ''
                    }`}>
                      {creditNote.invoice_number}
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedCreditNote?.credit_note_id === creditNote.credit_note_id ? 'bg-gray-50' : ''
                    }`}>
                      {formatCurrency(creditNote.subtotal_amount, creditNote.currency_code)}
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedCreditNote?.credit_note_id === creditNote.credit_note_id ? 'bg-gray-50' : ''
                    }`}>
                      <Badge variant={creditNote.status === 'issued' ? 'default' : 'secondary'}>
                        {creditNote.status}
                      </Badge>
                    </td>
                    <td className={`px-3 py-2 text-sm border-b border-gray-100 truncate align-middle ${
                      selectedCreditNote?.credit_note_id === creditNote.credit_note_id ? 'bg-gray-50' : ''
                    }`}>
                      {creditNote.reason || '-'}
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