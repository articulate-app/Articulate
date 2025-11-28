"use client"

import React, { useState, useEffect } from 'react'
import { ChevronUp, ChevronDown, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { InfiniteList } from '../ui/infinite-list'
import { Badge } from '../ui/badge'
import { formatDocumentType, formatDocumentKind } from '../../lib/services/documents'
import type { DocumentsFilters, DocumentsSortConfig, DocumentRow } from '../../lib/types/documents'

type DocumentColumnId = 
  | 'doc_number'
  | 'doc_date'
  | 'direction'
  | 'doc_kind'
  | 'from_team_name'
  | 'to_team_name'
  | 'subtotal_amount'
  | 'total_amount'
  | 'status'
  | 'projects_text'

interface DocumentColumnConfig {
  id: DocumentColumnId
  label: string
  minWidth: number
  width?: number
  sortable?: boolean
  sortField?: DocumentsSortConfig['field']
}

interface DocumentsTableProps {
  filters: DocumentsFilters
  sort: DocumentsSortConfig
  onSortChange: (sort: DocumentsSortConfig) => void
  onDocumentSelect: (document: DocumentRow) => void
  selectedDocument: DocumentRow | null
  trailingQuery: (query: any) => any
  hasRightPaneOpen?: boolean
}

const formatCurrency = (amount: number, currencyCode: string): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  if (!status) return 'default' // Handle undefined/null status
  switch (status.toLowerCase()) {
    case 'paid':
      return 'default'
    case 'issued':
    case 'sent':
      return 'secondary'
    case 'cancelled':
      return 'destructive'
    case 'draft':
    case 'pending':
      return 'outline'
    default:
      return 'outline'
  }
}

const SortableHeader: React.FC<{
  field: DocumentsSortConfig['field']
  currentSort: DocumentsSortConfig
  onSortChange: (sort: DocumentsSortConfig) => void
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

export function DocumentsTable({
  filters,
  sort,
  onSortChange,
  onDocumentSelect,
  selectedDocument,
  trailingQuery,
  hasRightPaneOpen = false,
}: DocumentsTableProps) {
  // Create a query key that includes filters and sort to ensure cache invalidation
  const queryKey = `documents-${JSON.stringify(filters)}-${JSON.stringify(sort)}`
  
  // Prevent hydration mismatch
  const [isClient, setIsClient] = useState(false)
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)
  const [containerHeight, setContainerHeight] = useState<number>(400)
  const resizingRef = React.useRef<boolean>(false)
  
  const defaultColumns: DocumentColumnConfig[] = [
    { id: 'doc_number', label: 'Number', minWidth: 120, sortable: true, sortField: 'doc_number' },
    { id: 'doc_date', label: 'Date', minWidth: 120, sortable: true, sortField: 'doc_date' },
    { id: 'direction', label: 'Direction', minWidth: 100, sortable: false },
    { id: 'doc_kind', label: 'Type', minWidth: 120, sortable: false },
    { id: 'from_team_name', label: 'From', minWidth: 150, sortable: true, sortField: 'from_team_name' },
    { id: 'to_team_name', label: 'To', minWidth: 150, sortable: true, sortField: 'to_team_name' },
    { id: 'subtotal_amount', label: 'Subtotal', minWidth: 130, sortable: true, sortField: 'subtotal_amount' },
    { id: 'total_amount', label: 'Total', minWidth: 130, sortable: true, sortField: 'total_amount' },
    { id: 'status', label: 'Status', minWidth: 100, sortable: false },
    { id: 'projects_text', label: 'Projects', minWidth: 150, sortable: false },
  ]
  
  const [columns, setColumns] = useState<DocumentColumnConfig[]>(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('documentsTable:columns') : null
    if (stored) {
      try {
        const parsed: DocumentColumnConfig[] = JSON.parse(stored)
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

  useEffect(() => {
    setIsClient(true)
  }, [])

  // Persist column state
  useEffect(() => {
    if (!isClient) return
    window.localStorage.setItem('documentsTable:columns', JSON.stringify(columns))
  }, [columns, isClient])

  // Helper to start resizing a specific column
  const startResize = (colId: DocumentColumnId, startClientX: number) => {
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
    }
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => {
      window.removeEventListener('resize', updateDimensions)
    }
  }, [isClient, hasRightPaneOpen])

  if (!isClient) {
    return (
      <div className="flex flex-col h-full">
        <div className="relative h-full min-h-0 flex-1">
          <table className="w-full border-collapse" style={{ minWidth: '1400px' }}>
            <thead className="sticky top-0 z-20 bg-white border-b shadow-sm">
              <tr>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Number</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Date</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Direction</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Type</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">From</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">To</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Subtotal</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Total</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Status</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Projects</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={10} className="text-center text-gray-500 py-8">Loading...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const handleRowClick = (document: DocumentRow) => {
    onDocumentSelect(document)
  }

  // Calculate padding for the scroll container when right pane is open
  const rightPadding = hasRightPaneOpen ? '384px' : '0px'

  const renderNoResults = () => (
    <tr>
      <td colSpan={10} className="text-center text-gray-500 py-8">No documents match your filters.</td>
    </tr>
  )

  const renderEndMessage = () => (
    <tr>
      <td colSpan={10} className="text-center text-gray-400 py-4">No more documents</td>
    </tr>
  )

  const renderSkeleton = (count: number) => (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i}>
          <td colSpan={10} className="py-4 animate-pulse bg-muted" />
        </tr>
      ))}
    </>
  )

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
          <table className="w-full border-collapse" style={{ minWidth: '1200px', tableLayout: 'fixed' }}>
            <thead className="sticky top-0 z-20 bg-white border-b shadow-sm">
              <tr>
                {columns.map((col) => {
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
                      className={`${commonClass} ${col.sortable ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                      style={style}
                      onClick={onClick}
                    >
                      <div className="flex items-center gap-1">
                        <span>{col.label}</span>
                        {col.sortable && isActive && (
                          <div className="flex items-center">
                            {sort.direction === 'asc' ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </div>
                        )}
                      </div>
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation()
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
            <InfiniteList<'v_documents_min', DocumentRow>
              tableName="v_documents_min"
              columns="*"
              pageSize={50}
              trailingQuery={trailingQuery}
              queryKey={queryKey}
              isTableBody={true}
              renderNoResults={renderNoResults}
              renderEndMessage={renderEndMessage}
              renderSkeleton={renderSkeleton}
            >
              {(documents: DocumentRow[]) => 
                documents.map((document) => {
                  const isSelected = selectedDocument?.doc_id === document.doc_id

                  return (
                    <tr 
                      key={`${document.doc_kind}-${document.doc_id}`} 
                      className={`hover:bg-gray-50 cursor-pointer border-b border-gray-100 ${
                        isSelected ? 'bg-gray-50' : ''
                      }`}
                      onClick={() => handleRowClick(document)}
                    >
                      {columns.map((col) => {
                        const widthPx = (col.width ?? col.minWidth)
                        const cellStyle = { width: `${widthPx}px`, minWidth: `${col.minWidth}px` }
                        let content: React.ReactNode = null
                        
                        switch (col.id) {
                          case 'doc_number':
                            content = <span className="font-medium text-gray-900">{document.doc_number}</span>
                            break
                          case 'doc_date':
                            content = formatDate(document.doc_date)
                            break
                          case 'direction':
                            content = (
                              <div className={`flex items-center gap-1 text-xs font-medium ${document.direction === 'ar' ? 'text-green-600' : 'text-red-600'}`}>
                                {document.direction === 'ar' ? (
                                  <>
                                    <ArrowDownLeft className="w-3 h-3" />
                                    <span>AR</span>
                                  </>
                                ) : (
                                  <>
                                    <ArrowUpRight className="w-3 h-3" />
                                    <span>AP</span>
                                  </>
                                )}
                              </div>
                            )
                            break
                          case 'doc_kind':
                            content = (
                              <Badge variant="outline" className="text-xs">
                                {formatDocumentKind(document.doc_kind)}
                              </Badge>
                            )
                            break
                          case 'from_team_name':
                            content = document.from_team_name
                            break
                          case 'to_team_name':
                            content = document.to_team_name
                            break
                          case 'subtotal_amount':
                            content = (
                              <span className="text-left">
                                {formatCurrency(document.subtotal_amount, document.currency_code)}
                              </span>
                            )
                            break
                          case 'total_amount':
                            content = (
                              <span className="text-left font-medium">
                                {formatCurrency(document.total_amount, document.currency_code)}
                              </span>
                            )
                            break
                          case 'status':
                            content = (
                              <Badge variant={getStatusBadgeVariant(document.status)}>
                                {document.status}
                              </Badge>
                            )
                            break
                          case 'projects_text':
                            content = document.projects_text || '—'
                            break
                          default:
                            content = '—'
                        }
                        
                        return (
                          <td 
                            key={col.id} 
                            className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle" 
                            style={{ ...cellStyle, maxWidth: cellStyle.width } as React.CSSProperties}
                          >
                            {content}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              }
            </InfiniteList>
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
