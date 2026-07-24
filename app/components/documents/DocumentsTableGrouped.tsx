"use client"

import React, { useState, useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown, ArrowDownLeft, ArrowUpRight, ChevronRight, MoreHorizontal } from 'lucide-react'
import { InfiniteList } from '../ui/infinite-list'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { formatDocumentType, formatDocumentKind } from '../../lib/services/documents'
import { groupDocuments, getDocumentGroupKey, type GroupingMode, type DocumentGroup } from '../../lib/utils/document-grouping'
import { fetchDocumentGroupTotals, getTotalsForGroup, type DocumentGroupTotals } from '../../lib/services/document-group-totals'
import { useQuery } from '@tanstack/react-query'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import type { DocumentsFilters, DocumentsSortConfig, DocumentRow } from '../../lib/types/documents'
import { cn } from '@/lib/utils'

type TotalsMetric = 'result' | 'invoiced' | 'costs' | 'ar_credit' | 'ap_credit'

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

interface DocumentsTableGroupedProps {
  filters: DocumentsFilters
  sort: DocumentsSortConfig
  onSortChange: (sort: DocumentsSortConfig) => void
  onDocumentSelect: (document: DocumentRow) => void
  selectedDocument: DocumentRow | null
  trailingQuery: (query: any) => any
  hasRightPaneOpen?: boolean
  groupingMode?: GroupingMode
  onGroupingModeChange?: (mode: GroupingMode) => void
  optimisticGroupTotals?: DocumentGroupTotals[]
  /** Column ids to omit from the table (e.g. hide From in team-scoped views). */
  hiddenColumnIds?: DocumentColumnId[]
  /** Optional localStorage key override when column set differs from the full page. */
  columnsStorageKey?: string
  /** Fill parent height via flex instead of viewport-based pixel height. */
  fillHeight?: boolean
  /** Compact date labels (e.g. 1 Jul). */
  compactDates?: boolean
  /** Activity-style rows (label/detail + trailing value) instead of multi-column table. */
  listVariant?: 'table' | 'activity'
  /** When set, only render this many docs and offer a See all affordance. */
  previewLimit?: number
  onSeeAll?: () => void
}

const formatCurrency = (amount: number | null | undefined, currencyCode?: string | null): string => {
  const value = typeof amount === 'number' && Number.isFinite(amount) ? amount : Number(amount)
  const safeAmount = Number.isFinite(value) ? value : 0
  const code = currencyCode && /^[A-Za-z]{3}$/.test(currencyCode) ? currencyCode.toUpperCase() : 'EUR'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount)
  } catch {
    return `${safeAmount.toFixed(2)} ${code}`
  }
}

const formatDate = (dateString: string, compact = false): string => {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return '—'
  if (compact) {
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    })
  }
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  if (!status) return 'default'
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

export function DocumentsTableGrouped({
  filters,
  sort,
  onSortChange,
  onDocumentSelect,
  selectedDocument,
  trailingQuery,
  hasRightPaneOpen = false,
  groupingMode = 'month',
  onGroupingModeChange,
  optimisticGroupTotals,
  hiddenColumnIds = [],
  columnsStorageKey = 'documentsTable:columns',
  fillHeight = false,
  compactDates = false,
  listVariant = 'table',
  previewLimit,
  onSeeAll,
}: DocumentsTableGroupedProps) {
  const isActivityList = listVariant === 'activity'
  const isPreviewMode = previewLimit != null
  const queryKey = `documents-${JSON.stringify(filters)}-${JSON.stringify(sort)}-${groupingMode}`
  const [isClient, setIsClient] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [containerHeight, setContainerHeight] = useState<number>(400)
  const resizingRef = useRef<boolean>(false)
  const hiddenColumnIdSet = React.useMemo(() => new Set(hiddenColumnIds), [hiddenColumnIds])
  
  // Collapse state for groups (key -> collapsed)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  
  // Track which groups have expanded totals (key -> expanded)
  const [expandedTotals, setExpandedTotals] = useState<Set<string>>(new Set())
  
  // Track selected metric to display in pills
  const [selectedMetric, setSelectedMetric] = useState<TotalsMetric>('result')
  
  // Track previous grouping mode to detect changes
  const previousGroupingModeRef = React.useRef<GroupingMode>(groupingMode)
  
  // Reset collapsed groups when grouping mode changes
  React.useEffect(() => {
    if (previousGroupingModeRef.current !== groupingMode) {
      setCollapsedGroups(new Set())
      setExpandedTotals(new Set())
      previousGroupingModeRef.current = groupingMode
      console.log(`[DocumentsTableGrouped] Grouping mode changed, collapsed groups and expanded totals reset`)
    }
  }, [groupingMode])
  
  // Track previous document keys to detect new additions
  const [previousDocKeys, setPreviousDocKeys] = useState<Set<string>>(new Set())
  
  // Sticky header state
  const [stickyGroupKey, setStickyGroupKey] = useState<string | null>(null)
  const groupHeaderRefs = useRef<Map<string, HTMLElement>>(new Map())
  
  // Track all group keys as they're rendered
  const allGroupKeysRef = useRef<Set<string>>(new Set())
  
  // Fetch group totals
  const { data: fetchedGroupTotals = [] } = useQuery({
    queryKey: ['document-group-totals', JSON.stringify(filters), groupingMode],
    queryFn: () => fetchDocumentGroupTotals(filters, groupingMode),
    staleTime: 30000, // Cache for 30 seconds
  })
  
  // Merge optimistic totals with fetched totals
  const groupTotals = optimisticGroupTotals || fetchedGroupTotals
  
  const defaultColumns: DocumentColumnConfig[] = fillHeight
    ? [
        { id: 'doc_date', label: 'Date', minWidth: 72, width: 72, sortable: true, sortField: 'doc_date' },
        { id: 'doc_kind', label: 'Type', minWidth: 110, width: 120, sortable: true, sortField: 'doc_kind' },
        { id: 'to_team_name', label: 'To', minWidth: 120, width: 140, sortable: true, sortField: 'to_team_name' },
        { id: 'subtotal_amount', label: 'Subtotal', minWidth: 90, width: 100, sortable: true, sortField: 'subtotal_amount' },
        { id: 'status', label: 'Status', minWidth: 80, width: 90, sortable: false },
        { id: 'projects_text', label: 'Projects', minWidth: 100, width: 140, sortable: false },
        { id: 'doc_number', label: 'Number', minWidth: 120, sortable: true, sortField: 'doc_number' },
        { id: 'direction', label: 'Direction', minWidth: 100, sortable: true, sortField: 'direction' },
        { id: 'from_team_name', label: 'From', minWidth: 150, sortable: true, sortField: 'from_team_name' },
        { id: 'total_amount', label: 'Total', minWidth: 130, sortable: true, sortField: 'total_amount' },
      ]
    : [
        { id: 'doc_number', label: 'Number', minWidth: 120, sortable: true, sortField: 'doc_number' },
        { id: 'doc_date', label: 'Date', minWidth: 120, sortable: true, sortField: 'doc_date' },
        { id: 'direction', label: 'Direction', minWidth: 100, sortable: true, sortField: 'direction' },
        { id: 'doc_kind', label: 'Type', minWidth: 120, sortable: true, sortField: 'doc_kind' },
        { id: 'from_team_name', label: 'From', minWidth: 150, sortable: true, sortField: 'from_team_name' },
        { id: 'to_team_name', label: 'To', minWidth: 150, sortable: true, sortField: 'to_team_name' },
        { id: 'subtotal_amount', label: 'Subtotal', minWidth: 130, sortable: true, sortField: 'subtotal_amount' },
        { id: 'total_amount', label: 'Total', minWidth: 130, sortable: true, sortField: 'total_amount' },
        { id: 'status', label: 'Status', minWidth: 100, sortable: false },
        { id: 'projects_text', label: 'Projects', minWidth: 150, sortable: false },
      ]
  
  const [columns, setColumns] = useState<DocumentColumnConfig[]>(() => {
    const baseDefaults = defaultColumns.filter((column) => !hiddenColumnIdSet.has(column.id))
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(columnsStorageKey) : null
    if (stored) {
      try {
        const parsed: DocumentColumnConfig[] = JSON.parse(stored)
        const map = new Map(baseDefaults.map(c => [c.id, c]))
        const merged = parsed
          .filter((c) => map.has(c.id))
          .map((c) => ({ ...map.get(c.id)!, ...c }))
        baseDefaults.forEach(dc => { if (!merged.find(m => m.id === dc.id)) merged.push(dc) })
        return merged
      } catch {}
    }
    return baseDefaults
  })

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (!isClient) return
    window.localStorage.setItem(columnsStorageKey, JSON.stringify(columns))
  }, [columns, columnsStorageKey, isClient])

  useEffect(() => {
    if (hiddenColumnIdSet.size === 0) return
    setColumns((current) => current.filter((column) => !hiddenColumnIdSet.has(column.id)))
  }, [hiddenColumnIdSet])

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

  useEffect(() => {
    if (!isClient || fillHeight) return
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
  }, [fillHeight, isClient, hasRightPaneOpen])

  // Handle scroll to update sticky header
  useEffect(() => {
    if (!isClient || groupingMode === 'none') return
    
    const container = scrollContainerRef.current
    if (!container) return
    
    const handleScroll = () => {
      const scrollTop = container.scrollTop
      const tableHeaderHeight = 41 // Height of main table header
      
      // Find which group header should be sticky
      let activeGroupKey: string | null = null
      groupHeaderRefs.current.forEach((el, key) => {
        const rect = el.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        const relativeTop = rect.top - containerRect.top
        
        if (relativeTop <= tableHeaderHeight && relativeTop > -rect.height) {
          activeGroupKey = key
        }
      })
      
      setStickyGroupKey(activeGroupKey)
    }
    
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [isClient, groupingMode])
  
  // Auto-expand groups when new documents are added (optimistic updates)
  useEffect(() => {
    if (!isClient) return
    
    // Listen for document additions
    const handleDocumentAdded = ((event: CustomEvent) => {
      const { document, groupKey } = event.detail
      if (groupKey && collapsedGroups.has(groupKey)) {
        // Auto-expand the group if it's collapsed
        setCollapsedGroups(prev => {
          const next = new Set(prev)
          next.delete(groupKey)
          return next
        })
      }
    }) as EventListener
    
    window.addEventListener('document:added', handleDocumentAdded)
    return () => window.removeEventListener('document:added', handleDocumentAdded)
  }, [isClient, collapsedGroups, groupingMode])

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupKey)) {
        next.delete(groupKey)
      } else {
        next.add(groupKey)
      }
      return next
    })
  }
  
  const toggleTotalsExpanded = (groupKey: string) => {
    setExpandedTotals(prev => {
      const next = new Set(prev)
      if (next.has(groupKey)) {
        next.delete(groupKey)
      } else {
        next.add(groupKey)
      }
      return next
    })
  }

  const handleRowClick = (document: DocumentRow) => {
    onDocumentSelect(document)
  }

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

  const renderGroupHeader = (group: DocumentGroup) => {
    const isCollapsed = collapsedGroups.has(group.key)
    const isTotalsExpanded = expandedTotals.has(group.key)
    const isSticky = stickyGroupKey === group.key
    const totals = getTotalsForGroup(groupTotals, group.key)
    
    if (isActivityList) {
      return (
        <tr
          ref={(el) => {
            if (el) groupHeaderRefs.current.set(group.key, el)
          }}
          className="cursor-pointer"
          onClick={() => toggleGroupCollapse(group.key)}
        >
          <td className="p-0">
            <div className="flex items-center justify-between border-b border-gray-100 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform',
                    isCollapsed ? '' : 'rotate-90',
                  )}
                />
                <span className="truncate text-sm font-medium text-gray-900">{group.label}</span>
                {totals ? (
                  <span className="shrink-0 text-xs tabular-nums text-gray-400">
                    {formatCurrency(totals.result, 'EUR')}
                  </span>
                ) : null}
              </div>
            </div>
          </td>
        </tr>
      )
    }

    return (
      <tr
        ref={(el) => {
          if (el) groupHeaderRefs.current.set(group.key, el)
        }}
        className={`group-header bg-white cursor-pointer hover:bg-gray-50 border-b border-gray-200 ${
          isSticky ? 'sticky z-10 shadow-sm border-t-0' : 'border-t-2'
        }`}
        style={isSticky ? { top: '37px' } : undefined}
        onClick={() => toggleGroupCollapse(group.key)}
      >
        <td colSpan={10} className="px-3 py-3 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ChevronRight 
                className={`w-4 h-4 text-gray-500 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
              />
              <span className="text-base font-semibold text-gray-900">
                {group.label}
              </span>
              
              {totals && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div 
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded-full cursor-pointer transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-xs font-medium text-gray-600">
                        {selectedMetric === 'result' && 'Result:'}
                        {selectedMetric === 'invoiced' && 'Invoiced:'}
                        {selectedMetric === 'costs' && 'Costs:'}
                        {selectedMetric === 'ar_credit' && 'AR Credits:'}
                        {selectedMetric === 'ap_credit' && 'AP Credits:'}
                      </span>
                      <span className="text-xs font-medium text-gray-900">
                        {selectedMetric === 'result' && formatCurrency(totals.result, 'EUR')}
                        {selectedMetric === 'invoiced' && formatCurrency(totals.invoiced, 'EUR')}
                        {selectedMetric === 'costs' && formatCurrency(totals.costs, 'EUR')}
                        {selectedMetric === 'ar_credit' && formatCurrency(totals.ar_credit, 'EUR')}
                        {selectedMetric === 'ap_credit' && formatCurrency(totals.ap_credit, 'EUR')}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem 
                      className="flex items-center justify-between py-2 px-3 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedMetric('result')
                      }}
                    >
                      <span className="text-sm text-gray-700">Result</span>
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(totals.result, 'EUR')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="flex items-center justify-between py-2 px-3 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedMetric('invoiced')
                      }}
                    >
                      <span className="text-sm text-gray-700">Invoiced</span>
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(totals.invoiced, 'EUR')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="flex items-center justify-between py-2 px-3 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedMetric('costs')
                      }}
                    >
                      <span className="text-sm text-gray-700">Costs</span>
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(totals.costs, 'EUR')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="flex items-center justify-between py-2 px-3 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedMetric('ar_credit')
                      }}
                    >
                      <span className="text-sm text-gray-700">AR Credits</span>
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(totals.ar_credit, 'EUR')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="flex items-center justify-between py-2 px-3 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedMetric('ap_credit')
                      }}
                    >
                      <span className="text-sm text-gray-700">AP Credits</span>
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(totals.ap_credit, 'EUR')}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <MoreHorizontal className="w-4 h-4 text-gray-500" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation()
                      // Expand all groups
                      setCollapsedGroups(new Set())
                    }}
                  >
                    Expand all
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation()
                      // Collapse all groups using tracked group keys
                      setCollapsedGroups(new Set(allGroupKeysRef.current))
                    }}
                  >
                    Collapse all
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </td>
      </tr>
    )
  }

  const renderDocumentRow = (document: DocumentRow) => {
    const isSelected = selectedDocument?.doc_id === document.doc_id && selectedDocument?.doc_kind === document.doc_kind

    if (isActivityList) {
      const toTeam = document.to_team_name?.trim() || '—'
      const amount =
        document.subtotal_amount ??
        document.total_amount ??
        (document as { subtotal?: number }).subtotal ??
        0
      return (
        <tr
          key={`${document.doc_kind}-${document.doc_id}`}
          className={cn('cursor-pointer', isSelected ? 'bg-gray-50' : 'hover:bg-gray-50/70')}
          onClick={() => handleRowClick(document)}
        >
          <td className="w-full p-0">
            <div className="flex w-full items-center justify-between gap-4 border-b border-gray-100 py-2.5">
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex min-w-0 items-baseline gap-1.5 text-sm text-gray-900">
                  <span className="shrink-0 text-gray-500">
                    {formatDate(document.doc_date, compactDates)}
                  </span>
                  <span className="truncate">
                    {document.doc_number}
                    <span className="text-gray-400"> · </span>
                    {formatDocumentKind(document.doc_kind)}
                  </span>
                </div>
                <p className="truncate text-xs text-gray-500" title={toTeam}>
                  {toTeam}
                  {document.status ? ` · ${document.status}` : ''}
                </p>
              </div>
              <div className="ml-auto shrink-0 whitespace-nowrap text-right text-sm font-medium tabular-nums text-gray-900">
                {formatCurrency(amount, document.currency_code)}
              </div>
            </div>
          </td>
        </tr>
      )
    }

    return (
      <tr 
        key={`${document.doc_kind}-${document.doc_id}`} 
        className={`cursor-pointer border-b border-gray-100 ${
          isSelected ? 'bg-gray-100' : 'hover:bg-gray-50'
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
              content = formatDate(document.doc_date, compactDates)
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
  }

  return (
    <div className={cn('flex min-h-0 flex-col', !isPreviewMode && 'h-full')}>
      <div
        ref={scrollContainerRef}
        className={cn(
          'relative min-h-0',
          isPreviewMode
            ? 'overflow-visible'
            : 'overflow-auto billing-scrollbar-always',
          fillHeight && !isPreviewMode && 'flex-1',
        )}
        style={
          isPreviewMode
            ? undefined
            : fillHeight
              ? { marginRight: rightPadding }
              : {
                  marginRight: rightPadding,
                  height: containerHeight,
                }
        }
      >
        <div style={fillHeight || isPreviewMode ? undefined : { width: `calc(100% + ${rightPadding})` }}>
          <table
            className="w-full border-collapse"
            style={{
              minWidth: fillHeight || isActivityList ? undefined : '1200px',
              tableLayout: isActivityList ? 'auto' : 'fixed',
              width: '100%',
            }}
          >
            {!isActivityList ? (
              <thead className="sticky top-0 z-20 border-b bg-white shadow-sm">
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
            ) : null}
            <tbody className="bg-white">
              <InfiniteList<'v_documents_min', DocumentRow>
                tableName="v_documents_min"
                columns="*"
                pageSize={previewLimit ?? 50}
                trailingQuery={trailingQuery}
                queryKey={`${queryKey}-preview:${previewLimit ?? 'all'}`}
                isTableBody={true}
                scrollContainerRef={scrollContainerRef}
                renderNoResults={renderNoResults}
                renderEndMessage={previewLimit != null ? () => null : renderEndMessage}
                renderSkeleton={renderSkeleton}
              >
                {(documents: DocumentRow[]) => {
                  const limitedDocs =
                    previewLimit != null ? documents.slice(0, previewLimit) : documents
                  const groups = groupDocuments(limitedDocs, groupingMode, sort)
                  const canSeeAll =
                    previewLimit != null &&
                    typeof onSeeAll === 'function' &&
                    documents.length >= previewLimit

                  // Track all group keys for collapse/expand all functionality
                  groups.forEach(group => allGroupKeysRef.current.add(group.key))
                  
                  return (
                    <>
                      {groups.map((group, groupIndex) => {
                        const isCollapsed = collapsedGroups.has(group.key)
                        
                        return (
                          <React.Fragment key={`group-${group.key}-${groupIndex}`}>
                            {renderGroupHeader(group)}
                            {!isCollapsed && group.documents.map((doc) => renderDocumentRow(doc))}
                          </React.Fragment>
                        )
                      })}
                      {canSeeAll ? (
                        <tr>
                          <td className="p-0">
                            <button
                              type="button"
                              onClick={onSeeAll}
                              className="w-full py-3 text-left text-sm font-medium text-blue-600 hover:text-blue-700"
                            >
                              See all
                            </button>
                          </td>
                        </tr>
                      ) : null}
                    </>
                  )
                }}
              </InfiniteList>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

