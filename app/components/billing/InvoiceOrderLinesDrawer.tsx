"use client"

import React, { useState, useEffect } from 'react'
import { X, Search, Expand, Minimize2, ChevronUp, ChevronDown, ArrowLeft, Download, Unlink, FileText, MoreHorizontal, Copy, Edit, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { InfiniteList } from '../ui/infinite-list'
import { Badge } from '../ui/badge'
import { useQueryClient } from '@tanstack/react-query'
import { InvoiceOrder, InvoiceLine } from '../../lib/types/billing'
import { fetchIssuedInvoicesForOrder, unlinkInvoiceOrder, fetchInvoiceOrder, getInvoicePDFSignedUrl } from '../../lib/services/billing'
import { updateInvoiceOrderInCaches } from './invoice-order-cache-utils'
import { toast } from '../ui/use-toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog'
import { AddInvoiceModal } from './AddInvoiceModal'
import { AddExistingInvoiceModal } from './AddExistingInvoiceModal'
import { EditLinkedOrderModal } from './EditLinkedOrderModal'
import { CreateAndIssueInvoiceModal } from './CreateAndIssueInvoiceModal'
import { BillableTasksSection } from './BillableTasksSection'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'

interface InvoiceOrderLinesDrawerProps {
  order: InvoiceOrder
  onClose: () => void
  onOpenIssuedInvoice?: (invoiceId: number) => void
  onExpandInvoiceLines?: (order: InvoiceOrder, invoiceLines: any[]) => void
  onTaskClick?: (taskId: number, taskData?: any) => void
  hasOpenInvoiceDetail?: boolean // New prop to indicate if invoice detail pane is open
  hasOpenTaskDetails?: boolean // New prop to indicate if task details pane is open
  onRelatedDocumentSelect?: (document: any, type: string) => void // New prop for third pane navigation
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

interface InvoiceLinesFullscreenViewProps {
  order: InvoiceOrder
  invoiceLines: InvoiceLine[]
  onClose: () => void
  searchQuery: string
  onSearchChange: (query: string) => void
  onTaskClick?: (taskId: number, taskData?: any) => void
  onRelatedDocumentSelect?: (document: any, type: string) => void
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

interface SortableHeaderProps {
  field: 'description' | 'unit_price' | 'quantity' | 'total'
  currentSort: { field: string; direction: 'asc' | 'desc' }
  onSortChange: (field: 'description' | 'unit_price' | 'quantity' | 'total') => void
  children: React.ReactNode
  className?: string
}

const SortableHeader: React.FC<SortableHeaderProps> = ({ field, currentSort, onSortChange, children, className = "" }) => {
  const isActive = currentSort.field === field
  const handleClick = () => onSortChange(field)

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

export const InvoiceLinesFullscreenView: React.FC<InvoiceLinesFullscreenViewProps> = ({
  order,
  invoiceLines,
  onClose,
  searchQuery,
  onSearchChange,
  onTaskClick,
  onRelatedDocumentSelect
}) => {
  const [sortField, setSortField] = useState<'description' | 'unit_price' | 'quantity' | 'total'>('description')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSortChange = (field: 'description' | 'unit_price' | 'quantity' | 'total') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortLines = (lines: InvoiceLine[]) => {
    return [...lines].sort((a, b) => {
      let aValue: any = a[sortField]
      let bValue: any = b[sortField]
      
      if (sortField === 'description') {
        aValue = aValue.toLowerCase()
        bValue = bValue.toLowerCase()
      }
      
      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
      }
    })
  }

  const filteredAndSortedLines = (lines: InvoiceLine[]) => {
    // Filter based on search query
    let filtered = lines
    if (searchQuery) {
      filtered = lines.filter(line => 
        line.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    // Sort the filtered lines
    return sortLines(filtered)
  }

  const handleExportToExcel = (lines: InvoiceLine[]) => {
    const filteredData = filteredAndSortedLines(lines)
    
    // Create CSV content
    const headers = ['Description', 'Quantity', 'Unit Price', 'Total', 'Line Type', 'Task ID']
    const csvContent = [
      headers.join(','),
      ...filteredData.map(line => [
        `"${line.description.replace(/"/g, '""')}"`, // Escape quotes in description
        line.quantity,
        line.unit_price,
        line.total,
        line.line_type || '',
        line.task_id || ''
      ].join(','))
    ].join('\n')

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `invoice-lines-${order.project_name.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  const processedLines = filteredAndSortedLines(invoiceLines)

  return (
    <div className="h-screen bg-white flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-gray-900 truncate">
              Invoice Lines - {order.project_name}
            </h2>
            <p className="text-sm text-gray-500 truncate">
              {formatCurrency(order.total_amount, order.currency_code)} • {invoiceLines.length} lines
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              onClick={() => handleExportToExcel(invoiceLines)}
              className="flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Download Excel</span>
            </Button>
            <Button variant="ghost" onClick={onClose}>
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Invoice Order
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-6 border-b border-gray-200 flex-shrink-0">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search lines..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {processedLines.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              {searchQuery ? 'No lines match your search' : 'No lines found'}
            </div>
          ) : (
            <div className="w-full">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10 bg-white border-b shadow-sm">
                  <tr>
                    <SortableHeader field="description" currentSort={{ field: sortField, direction: sortDirection }} onSortChange={handleSortChange}>Description</SortableHeader>
                    <SortableHeader
                      field="quantity"
                      currentSort={{ field: sortField, direction: sortDirection }}
                      onSortChange={handleSortChange}
                      className="text-left"
                    >
                      Quantity
                    </SortableHeader>
                    <SortableHeader
                      field="unit_price"
                      currentSort={{ field: sortField, direction: sortDirection }}
                      onSortChange={handleSortChange}
                      className="text-left"
                    >
                      Unit Price
                    </SortableHeader>
                    <SortableHeader
                      field="total"
                      currentSort={{ field: sortField, direction: sortDirection }}
                      onSortChange={handleSortChange}
                      className="text-left"
                    >
                      Total
                    </SortableHeader>
                  </tr>
                </thead>
                <tbody>
                  {processedLines.map((line) => (
                    <tr
                      key={line.id}
                      className={`border-b border-gray-100 hover:bg-gray-50 ${line.task_id ? 'cursor-pointer' : ''}`}
                      onClick={line.task_id ? () => {
                        if (onRelatedDocumentSelect) {
                          // Open task in third pane
                          onRelatedDocumentSelect({
                            task_id: line.task_id,
                            title: `Task ${line.task_id}`,
                            delivery_date: null,
                            project_id: null,
                            id: line.task_id,
                            doc_id: line.task_id,
                            doc_kind: 'task',
                            direction: 'ar',
                            doc_number: `TASK-${line.task_id}`,
                            doc_date: new Date().toISOString()
                          }, 'task')
                        } else {
                          // Fallback to existing behavior
                          onTaskClick?.(line.task_id!)
                        }
                      } : undefined}
                    >
                      <td className="px-4 py-3 text-sm border-b border-gray-100">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-gray-900" title={line.description}>
                            {line.description}
                          </div>
                          {line.task_id && (
                            <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm border-b border-gray-100 text-left">
                        {line.quantity}
                      </td>
                      <td className="px-4 py-3 text-sm border-b border-gray-100 text-left">
                        {formatCurrency(line.unit_price, line.currency_code)}
                      </td>
                      <td className="px-4 py-3 text-sm border-b border-gray-100 text-left font-medium">
                        {formatCurrency(line.total, line.currency_code)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
    </div>
  )
}

export function InvoiceOrderLinesDrawer({ 
  order, 
  onClose, 
  onOpenIssuedInvoice, 
  onExpandInvoiceLines, 
  onTaskClick,
  hasOpenInvoiceDetail = false,
  hasOpenTaskDetails = false,
  onRelatedDocumentSelect
}: InvoiceOrderLinesDrawerProps) {
  const [localOrder, setLocalOrder] = useState<InvoiceOrder>(order)
  const [searchQuery, setSearchQuery] = useState('')
  const [issuedInvoices, setIssuedInvoices] = useState<any[]>([])
  const [isLoadingIssuedInvoices, setIsLoadingIssuedInvoices] = useState(false)
  const [loadedInvoiceLines, setLoadedInvoiceLines] = useState<any[]>([])
  const [unlinkingInvoiceId, setUnlinkingInvoiceId] = useState<number | null>(null)
  const [unlinkConfirmation, setUnlinkConfirmation] = useState<{ invoice: any; invoiceName: string } | null>(null)
  const [isMainInvoiceModalOpen, setIsMainInvoiceModalOpen] = useState(false)
  const [isAddInvoiceModalOpen, setIsAddInvoiceModalOpen] = useState(false)
  const [editingLinkedInvoice, setEditingLinkedInvoice] = useState<any>(null)
  const [isEditLinkedInvoiceModalOpen, setIsEditLinkedInvoiceModalOpen] = useState(false)
  const [isCreateAndIssueModalOpen, setIsCreateAndIssueModalOpen] = useState(false)
  const [isBillableTasksPaneOpen, setIsBillableTasksPaneOpen] = useState(false)
  const [cachedTasksData, setCachedTasksData] = useState<{ tasks: any[], totalCount: number } | null>(null)
  const queryClient = useQueryClient()

  
  // Prevent hydration mismatch
  const [isClient, setIsClient] = useState(false)
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Reset search query when order changes
  useEffect(() => {
    setSearchQuery('')
  }, [order.id])

  // Update local order when prop changes
  useEffect(() => {
    setLocalOrder(order)
  }, [order])

  // Fetch issued invoices when order changes
  useEffect(() => {
    const loadIssuedInvoices = async () => {
      setIsLoadingIssuedInvoices(true)
      try {
        const { data, error } = await fetchIssuedInvoicesForOrder(order.id)
        if (error) {
          console.error('Error fetching issued invoices:', error)
        } else {
          setIssuedInvoices(data)
        }
      } catch (err) {
        console.error('Error fetching issued invoices:', err)
      } finally {
        setIsLoadingIssuedInvoices(false)
      }
    }

    loadIssuedInvoices()
  }, [order.id])

  // Function to refresh the local order data from the store
  const refreshLocalOrderData = () => {
    // Try to get the latest data from the query client cache
    const cachedData = queryClient.getQueryData(['v_invoice_orders_list'])
    if (cachedData && Array.isArray(cachedData)) {
      const updatedOrder = cachedData.find((item: any) => item.id === order.id)
      if (updatedOrder) {
        setLocalOrder(updatedOrder)
        return
      }
    }
    
    // Fallback: fetch the latest order data
    const refreshOrderData = async () => {
      try {
        const { data: updatedOrder, error } = await fetchInvoiceOrder(order.id)
        if (!error && updatedOrder) {
          setLocalOrder(updatedOrder)
        }
      } catch (err) {
        console.error('Error refreshing order data:', err)
      }
    }
    refreshOrderData()
  }

  // Listen for store updates to refresh the local order data
  useEffect(() => {
    const handleStoreUpdate = () => {
      // Refresh the local order data by fetching the latest from the store
      // This ensures the summary shows the updated "Issued" and "Remaining" values
      refreshLocalOrderData()
    }

    // Listen for store updates
    window.addEventListener('storeUpdated', handleStoreUpdate)
    
    return () => {
      window.removeEventListener('storeUpdated', handleStoreUpdate)
    }
  }, [order.id])

  // Listen for invoice order summary updates
  useEffect(() => {
    const handleInvoiceOrderSummaryUpdate = (event: CustomEvent) => {
      const { orderId, updatedOrder } = event.detail
      if (orderId === order.id) {
        // Update the local order state with the new summary data
        setLocalOrder((prevOrder: InvoiceOrder) => ({
          ...prevOrder,
          remaining_subtotal: updatedOrder.remaining_subtotal,
          issued_subtotal: updatedOrder.issued_subtotal,
        }))
      }
    }

    const handleIssuedInvoiceUpdate = (event: CustomEvent) => {
      const { invoiceId, updatedInvoice } = event.detail
      // Update the issued invoices list with the new total
      setIssuedInvoices(prev => 
        prev.map(inv => 
          inv.issued_invoice_id === invoiceId 
            ? { ...inv, total_amount: updatedInvoice.total_amount }
            : inv
        )
      )
    }

    const handleInvoiceCreatedAndIssued = (event: CustomEvent) => {
      const { orderIds, action } = event.detail
      if (action === 'invoice_created_and_issued' && orderIds.includes(order.id)) {
        // Refresh the issued invoices list to show the new invoice
        const loadIssuedInvoices = async () => {
          try {
            const { data, error } = await fetchIssuedInvoicesForOrder(order.id)
            if (!error && data) {
              setIssuedInvoices(data)
            }
          } catch (err) {
            console.error('Error fetching issued invoices:', err)
          }
        }
        loadIssuedInvoices()
        
        // Get updated order data directly from the store to update the summary immediately
        // Add a small delay to ensure the store has been updated
        setTimeout(() => {
          refreshLocalOrderData()
        }, 100)
        
        // Also trigger a refresh of the order data
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshInvoiceOrderData', { 
            detail: { orderId: order.id } 
          }))
        }
      }
    }

    window.addEventListener('invoice-order-summary-updated', handleInvoiceOrderSummaryUpdate as EventListener)
    window.addEventListener('issued-invoice-updated', handleIssuedInvoiceUpdate as EventListener)
    window.addEventListener('invoiceCreatedAndIssued', handleInvoiceCreatedAndIssued as EventListener)
    
    return () => {
      window.removeEventListener('invoice-order-summary-updated', handleInvoiceOrderSummaryUpdate as EventListener)
      window.removeEventListener('issued-invoice-updated', handleIssuedInvoiceUpdate as EventListener)
      window.removeEventListener('invoiceCreatedAndIssued', handleInvoiceCreatedAndIssued as EventListener)
    }
  }, [order.id])







  if (!isClient) {
    return (
      <div className="w-96 bg-white border-l border-gray-200 flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">Invoice Lines</h2>
            <p className="text-sm text-gray-500 truncate">Loading...</p>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-500">Loading...</div>
        </div>
      </div>
    )
  }

  const trailingQuery = (query: any) => {
    let q = query.eq('invoice_order_id', localOrder.id)
    
    // Apply search filter if provided
    if (searchQuery) {
      q = q.ilike('description', `%${searchQuery}%`)
    }
    
    return q.order('id', { ascending: true })
  }

  const filteredLines = (lines: InvoiceLine[]) => {
    if (!searchQuery) return lines
    return lines.filter(line => 
      line.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }

  // Helper function to update invoice order summary optimistically
  const updateOrderSummaryOptimistically = (operation: 'add' | 'remove', invoiceAmount: number) => {
    const currentIssuedSubtotal = localOrder.issued_subtotal || 0
    const currentRemainingSubtotal = localOrder.remaining_subtotal || localOrder.subtotal_amount || 0
    
    let newIssuedSubtotal: number
    let newRemainingSubtotal: number
    
    if (operation === 'add') {
      newIssuedSubtotal = currentIssuedSubtotal + invoiceAmount
      newRemainingSubtotal = Math.max(0, currentRemainingSubtotal - invoiceAmount)
    } else {
      newIssuedSubtotal = Math.max(0, currentIssuedSubtotal - invoiceAmount)
      newRemainingSubtotal = currentRemainingSubtotal + invoiceAmount
    }
    
    // Determine new status (keep the same type as the existing status)
    let newStatus = localOrder.status
    if (newRemainingSubtotal <= 0) {
      newStatus = 'issued' as any
    } else if (newIssuedSubtotal > 0) {
      newStatus = 'partially_issued' as any
    } else {
      newStatus = 'not_issued' as any
    }
    
    const updatedOrder = {
      ...localOrder,
      issued_subtotal: newIssuedSubtotal,
      remaining_subtotal: newRemainingSubtotal,
      status: newStatus
    }
    
    // Update local state immediately
    setLocalOrder(updatedOrder)
    
    // Update caches for optimistic updates
    updateInvoiceOrderInCaches(queryClient, updatedOrder)
    
    // Dispatch event to notify other components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('invoice-order-summary-updated', { 
        detail: { orderId: localOrder.id, updatedOrder } 
      }))
    }
  }

  const handleCopyLink = async () => {
    try {
      const url = `${window.location.origin}/billing/invoice-orders?order=${localOrder.id}`
      await navigator.clipboard.writeText(url)
      toast({
        title: 'Link copied',
        description: 'Invoice order link has been copied to clipboard',
      })
    } catch (err) {
      console.error('Failed to copy link:', err)
      toast({
        title: 'Error',
        description: 'Failed to copy link',
        variant: 'destructive',
      })
    }
  }

  const handleUnlinkInvoice = (invoice: any) => {
    const invoiceName = `Invoice #${invoice.issued_invoice_id}`
    
    // Show confirmation modal
    setUnlinkConfirmation({ invoice, invoiceName })
  }

  const confirmUnlinkInvoice = async () => {
    if (!unlinkConfirmation) return

    const { invoice, invoiceName } = unlinkConfirmation

    setUnlinkingInvoiceId(invoice.issued_invoice_id)
    setUnlinkConfirmation(null) // Close modal

    // Optimistically update the summary before API call
    const invoiceAmount = invoice.amount_override_subtotal || 0
    updateOrderSummaryOptimistically('remove', invoiceAmount)
    
    // Optimistically remove the invoice from the local state
    setIssuedInvoices(prev => prev.filter(inv => inv.issued_invoice_id !== invoice.issued_invoice_id))

    try {
      const { error } = await unlinkInvoiceOrder(invoice.issued_invoice_id, localOrder.id)
      
      if (error) {
        console.error('Error unlinking invoice:', error)
        
        // Revert optimistic update on error
        updateOrderSummaryOptimistically('add', invoiceAmount)
        setIssuedInvoices(prev => [...prev, invoice])
        
        toast({
          title: 'Error',
          description: 'Failed to unlink invoice. Please try again.',
          variant: 'destructive',
        })
        return
      }

      toast({
        title: 'Invoice Unlinked',
        description: `${invoiceName} has been unlinked from this order.`,
      })
    } catch (err) {
      console.error('Error unlinking invoice:', err)
      
      // Revert optimistic update on error
      updateOrderSummaryOptimistically('add', invoiceAmount)
      setIssuedInvoices(prev => [...prev, invoice])
      
      toast({
        title: 'Error',
        description: 'Failed to unlink invoice. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setUnlinkingInvoiceId(null)
    }
  }

  return (
    <>
    <div className="fixed top-0 w-96 bg-white border-l border-gray-200 flex flex-col h-screen z-40 shadow-lg" style={{ 
      right: hasOpenInvoiceDetail ? '384px' : (hasOpenTaskDetails ? '384px' : '0px')
    }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 truncate">
            Invoice Order
          </h2>
        </div>
        <div className="flex items-center space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCopyLink}>
                <Copy className="w-4 h-4 mr-2" />
                Copy link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                const params = new URLSearchParams()
                params.set('ctx', 'order')
                params.set('id', localOrder.id.toString())
                params.set('focus', 'true')
                const url = `/billing/billable-tasks?${params.toString()}`
                window.location.href = url
              }}>
                <FileText className="w-4 h-4 mr-2" />
                See Billable Tasks
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
        </div>
      </div>

      {/* Content */}
      <div className="overflow-auto pb-20" style={{ height: 'calc(100% - 120px)' }}>
        {/* Summary Section */}
        <div className="p-4 bg-white">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Summary</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500">Amount (no VAT)</span>
              <span className="text-sm text-gray-900">{formatCurrency(localOrder.subtotal_amount, localOrder.currency_code)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500">Issued (no VAT)</span>
              <span className="text-sm text-gray-900">
                {formatCurrency(
                  issuedInvoices.reduce((sum, inv) => sum + (inv.amount_override_subtotal || 0), 0),
                  localOrder.currency_code
                )}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500">Remaining (no VAT)</span>
              <span className="text-sm text-gray-900">
                {formatCurrency(
                  (localOrder.subtotal_amount || 0) - issuedInvoices.reduce((sum, inv) => sum + (inv.amount_override_subtotal || 0), 0),
                  localOrder.currency_code
                )}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500">Fully Allocated</span>
              <span className="text-sm text-gray-900">
                {issuedInvoices.reduce((sum, inv) => sum + (inv.amount_override_subtotal || 0), 0) >= (localOrder.subtotal_amount || 0) ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500">Project</span>
              <span className="text-sm text-gray-900">{localOrder.project_name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500">Billing period</span>
              <span className="text-sm text-gray-900">{formatPeriod(localOrder.billing_period_start, localOrder.billing_period_end)}</span>
            </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500">Status</span>
            <Badge variant={getStatusBadgeVariant(localOrder.status)}>
              {formatStatusText(localOrder.status)}
            </Badge>
          </div>
          </div>
        </div>

        {/* Issued Invoices Section */}
        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Invoices</h3>
          <div>
          {isLoadingIssuedInvoices ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3 border border-gray-200 rounded animate-pulse">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-gray-200 rounded w-20"></div>
                    <div className="h-3 bg-gray-200 rounded w-16"></div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-16"></div>
                    <div className="h-6 bg-gray-200 rounded w-20"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : issuedInvoices.length > 0 ? (
            <div className="mb-4">
              <div className="space-y-2">
                {issuedInvoices.map((invoice) => (
                  <div 
                    key={invoice.issued_invoice_id}
                    className="flex items-center justify-between p-3 bg-white border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => {
                      if (onRelatedDocumentSelect) {
                        // Open invoice in third pane
                        onRelatedDocumentSelect({
                          id: invoice.issued_invoice_id,
                          doc_id: invoice.issued_invoice_id,
                          doc_kind: 'invoice',
                          direction: 'ar',
                          doc_number: `INV-${invoice.issued_invoice_id}`,
                          doc_date: invoice.invoice_date || invoice.created_at,
                          from_team_name: invoice.issuer_team_name,
                          to_team_name: invoice.payer_team_name,
                          subtotal_amount: invoice.amount_override_subtotal || 0,
                          vat_amount: 0,
                          total_amount: invoice.amount_override_subtotal || 0,
                          currency_code: invoice.currency_code,
                          status: invoice.status || 'issued',
                          invoice_number: invoice.invoice_number,
                          invoice_date: invoice.invoice_date,
                          due_date: invoice.due_date,
                          issuer_team_id: invoice.issuer_team_id,
                          issuer_team_name: invoice.issuer_team_name,
                          payer_team_id: invoice.payer_team_id,
                          payer_team_name: invoice.payer_team_name,
                          created_at: invoice.created_at,
                          updated_at: invoice.updated_at
                        }, 'invoice')
                      } else {
                        // Fallback to existing behavior
                        onOpenIssuedInvoice?.(invoice.issued_invoice_id)
                      }
                    }}
                  >
                    <div className="flex-1">
                      <div className="font-medium text-sm text-gray-900">
                        Invoice #{invoice.issued_invoice_id}
                      </div>
                      <div className="text-xs text-gray-500">
                        {invoice.invoice_date ? formatDate(invoice.invoice_date) : (invoice.created_at ? formatDate(invoice.created_at) : 'No date')} • Amount: {formatCurrency(invoice.amount_override_subtotal || 0, invoice.currency_code)}
                      </div>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingLinkedInvoice({
                            id: invoice.issued_invoice_id,
                            issued_invoice_id: invoice.issued_invoice_id,
                            invoice_order_id: order.id,
                            amount_override_subtotal: invoice.amount_override_subtotal || order.subtotal_amount,
                            amount_override_vat: invoice.amount_override_vat || order.vat_amount,
                            amount_override_total: invoice.total_amount,
                            invoice_orders: {
                              id: order.id,
                              billing_period_start: order.billing_period_start,
                              billing_period_end: order.billing_period_end,
                              subtotal_amount: order.subtotal_amount,
                              vat_amount: order.vat_amount,
                              total_amount: order.total_amount,
                              projects: {
                                name: order.project_name,
                                color: order.project_color
                              }
                            }
                          })
                          setIsEditLinkedInvoiceModalOpen(true)
                        }}
                        className="text-gray-600 hover:text-gray-800"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      {invoice.pdf_path && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={async (e) => {
                            e.stopPropagation()
                            try {
                              const { data: signedUrl, error } = await getInvoicePDFSignedUrl(invoice.pdf_path!)
                              if (error) {
                                console.error('Error getting PDF signed URL:', error)
                                return
                              }
                              if (signedUrl) {
                                window.open(signedUrl, '_blank')
                              }
                            } catch (error) {
                              console.error('Exception opening PDF:', error)
                            }
                          }}
                          className="text-gray-600 hover:text-gray-800"
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleUnlinkInvoice(invoice)
                        }}
                        disabled={unlinkingInvoiceId === invoice.issued_invoice_id}
                        className="text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500">No issued invoices</p>
            </div>
          )}
          </div>
        </div>

        {/* Add Invoice Button */}
        <div className="p-4">
          <Button
            onClick={() => setIsMainInvoiceModalOpen(true)}
            variant="outline"
            className="w-full bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
          >
            Add Invoice
          </Button>
        </div>

        {/* Billable Tasks Section */}
        <div className="p-4">
          <BillableTasksSection
            ctxType="order"
            ctxId={order.id}
            title="Tasks"
            onTaskClick={onTaskClick}
            onExpand={() => setIsBillableTasksPaneOpen(true)}
            onDataLoaded={(tasks, totalCount) => setCachedTasksData({ tasks, totalCount })}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="absolute left-0 right-0 p-4 border-t border-gray-200 bg-white flex-shrink-0 z-50" style={{ bottom: '0px' }}>
            <Button
              onClick={() => setIsMainInvoiceModalOpen(true)}
          className="w-full bg-black text-white hover:bg-gray-800"
            >
              Add Invoice
            </Button>
      </div>
    </div>

    {/* Expanded Billable Tasks Pane */}
    {isBillableTasksPaneOpen && (
      <div className="fixed top-0 w-96 bg-white border-l border-gray-200 flex flex-col h-screen z-40 shadow-lg" style={{ 
        right: hasOpenInvoiceDetail ? '384px' : (hasOpenTaskDetails ? '384px' : '0px')
      }}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              Billable Tasks
            </h2>
            <p className="text-sm text-gray-500 truncate">
              {localOrder.project_name}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setIsBillableTasksPaneOpen(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <BillableTasksSection
            ctxType="order"
            ctxId={order.id}
            title="Tasks"
            onTaskClick={onTaskClick}
            preloadedTasks={cachedTasksData?.tasks}
            preloadedTotalCount={cachedTasksData?.totalCount}
          />
        </div>
      </div>
    )}

    {/* Main Add Invoice Modal */}
    <AddInvoiceModal
      orderId={order.id}
      selectedOrders={[localOrder]}
      isOpen={isMainInvoiceModalOpen}
      onClose={() => setIsMainInvoiceModalOpen(false)}
      onInvoiceAdded={(invoice) => {
        if (invoice) {
          // This is for linking existing invoices - do optimistic update
          const invoiceAmount = invoice.amount_override_subtotal || invoice.subtotal_amount || 0
          updateOrderSummaryOptimistically('add', invoiceAmount)
          
          // Optimistically add the invoice to local state
          setIssuedInvoices(prev => [...prev, invoice])
          
          toast({
            title: 'Invoice Linked',
            description: `Invoice #${invoice.issued_invoice_id} has been linked to this order.`,
          })
        } else {
          // This is for create and issue - refresh data since it's handled by CreateAndIssueInvoiceModal optimistically
          const loadIssuedInvoices = async () => {
            try {
              const { data, error } = await fetchIssuedInvoicesForOrder(order.id)
              if (!error && data) {
                setIssuedInvoices(data)
              }
            } catch (err) {
              console.error('Error refreshing issued invoices:', err)
            }
          }
          loadIssuedInvoices()
        }
      }}
    />

    {/* Unlink Confirmation Modal */}
    <Dialog open={!!unlinkConfirmation} onOpenChange={() => setUnlinkConfirmation(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unlink Invoice</DialogTitle>
          <DialogDescription>
            Are you sure you want to unlink {unlinkConfirmation?.invoiceName} from this order?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setUnlinkConfirmation(null)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmUnlinkInvoice}>
            Unlink
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Add Existing Invoice Modal */}
    <Dialog open={isAddInvoiceModalOpen} onOpenChange={setIsAddInvoiceModalOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Existing Invoice</DialogTitle>
          <DialogDescription>
            Select an existing invoice to link to this order.
          </DialogDescription>
        </DialogHeader>
        <AddExistingInvoiceModal
          orderId={order.id}
          onClose={() => setIsAddInvoiceModalOpen(false)}
          onInvoiceLinked={(invoice) => {
            // Add the new invoice to the local state
            setIssuedInvoices(prev => [...prev, invoice])
            setIsAddInvoiceModalOpen(false)
            toast({
              title: 'Invoice Linked',
              description: `Invoice #${invoice.issued_invoice_id} has been linked to this order.`,
            })
          }}
        />
      </DialogContent>
    </Dialog>

    {/* Edit Linked Invoice Modal */}
    <EditLinkedOrderModal
      linkedOrder={editingLinkedInvoice}
      isOpen={isEditLinkedInvoiceModalOpen}
      onClose={() => {
        setIsEditLinkedInvoiceModalOpen(false)
        setEditingLinkedInvoice(null)
      }}
      onOrderUpdated={() => {
        // Refresh the issued invoices list
        const loadIssuedInvoices = async () => {
          try {
            const { data, error } = await fetchIssuedInvoicesForOrder(order.id)
            if (!error && data) {
              setIssuedInvoices(data)
            }
          } catch (err) {
            console.error('Error refreshing issued invoices:', err)
          }
        }
        loadIssuedInvoices()
      }}
    />

    {/* Create and Issue Invoice Modal */}
    <CreateAndIssueInvoiceModal
      isOpen={isCreateAndIssueModalOpen}
      onClose={() => setIsCreateAndIssueModalOpen(false)}
      selectedOrders={[localOrder]}
      onSuccess={(invoiceId: number) => {
        // Refresh the issued invoices list
        const loadIssuedInvoices = async () => {
          try {
            const { data, error } = await fetchIssuedInvoicesForOrder(order.id)
            if (!error && data) {
              setIssuedInvoices(data)
            }
          } catch (err) {
            console.error('Error refreshing issued invoices:', err)
          }
        }
        loadIssuedInvoices()
        
        // Also trigger a refresh of the invoice order data in the parent component
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('invoiceOrderUpdated', { 
            detail: { orderId: order.id, action: 'invoice_created' } 
          }))
        }
        
        setIsCreateAndIssueModalOpen(false)
        toast({
          title: 'Invoice Created and Issued',
          description: `Invoice #${invoiceId} has been created and issued.`,
        })
      }}
    />

  </>
  )
} 
