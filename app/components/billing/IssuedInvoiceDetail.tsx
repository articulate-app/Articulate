"use client"

import React, { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, CreditCard, Minus, FileText, Loader2, Trash2, ChevronUp, ChevronDown, Search, Download, Expand, X, MoreHorizontal, FileSpreadsheet, Edit, CheckCircle, XCircle, RefreshCw, AlertCircle, Copy } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { fetchIssuedInvoice, issueInvoice, updateInvoiceOrderInCaches, uploadInvoicePDF, getInvoicePDFSignedUrl, updateIssuedInvoice, deleteInvoicePdf } from '../../lib/services/billing'
import { deleteCreditNote } from '../../lib/creditNotes'
import { addCreditNoteToCaches, updateCreditNoteInCaches, removeCreditNoteFromCaches } from '../credit-notes/credit-note-cache-utils'
import { toast } from '../ui/use-toast'
import { InvoiceDetailsForm } from './InvoiceDetailsForm'
import { LinkedOrdersTable } from './LinkedOrdersTable'
import { Dropzone } from '../dropzone'
import InvoicePaymentAllocations from './InvoicePaymentAllocations'
import { PaymentCreatePane } from '../payments/PaymentCreatePane'
import { CreditNoteCreateModal } from '../credit-notes/CreditNoteCreateModal'
import { IssuedInvoice } from '../../lib/types/billing'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { EditInvoiceModal } from './EditInvoiceModal'
import { AddExistingPaymentModal } from './AddExistingPaymentModal'
import { AddInvoiceOrderModal } from './AddInvoiceOrderModal'
import { AddPaymentModal } from './AddPaymentModal'
import { AddCreditNoteModal } from './AddCreditNoteModal'
import { EditCreditNoteModal } from './EditCreditNoteModal'
import EditAllocationModal from './EditAllocationModal'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { EditLinkedOrderModal } from './EditLinkedOrderModal'
import { unlinkInvoiceOrder } from '../../lib/services/billing'
import { TaskDetails } from '../tasks/TaskDetails'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useTaskEditFields } from '../../hooks/use-task-edit-fields'
import { useEffect } from 'react'
import { removeInvoiceFromAllCaches, updateInvoiceInCaches } from './invoice-cache-utils'
import { BillableTasksSection } from './BillableTasksSection'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { InvoiceLinesSection } from './InvoiceLinesSection'
import { EditableTextField } from '../ui/editable-text-field'
import { EditableInvoiceFields } from './EditableInvoiceFields'

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

interface IssuedInvoiceDetailProps {
  id: number
  isPane?: boolean
  showHeader?: boolean
  menuAction?: string | null
  onMenuActionHandled?: () => void
  onTaskSelect?: (taskId: number | null) => void
  selectedTaskId?: number | null
  onInvoiceOrderSelect?: (invoiceOrder: any | null) => void
  initialInvoice?: any
  onDocumentUpdate?: (updatedDocument: any) => void // For documents page integration
  onRelatedDocumentSelect?: (document: any, type: string) => void
  onClose?: () => void
}

const formatCurrency = (amount: number, currencyCode: string | null = 'EUR') => {
  const safeCurrencyCode = currencyCode || 'EUR'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: safeCurrencyCode,
  }).format(amount)
}

interface IssuedInvoiceLinesFullscreenViewProps {
  invoice: any
  invoiceLines: any[]
  onClose: () => void
  searchQuery: string
  onSearchChange: (query: string) => void
  onTaskClick?: (taskId: number) => void
}

const SortableHeader: React.FC<{
  field: 'description' | 'unit_price' | 'task_name'
  currentSort: { field: string; direction: 'asc' | 'desc' }
  onSortChange: (field: 'description' | 'unit_price' | 'task_name') => void
  children: React.ReactNode
  className?: string
}> = ({ field, currentSort, onSortChange, children, className = "" }) => {
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

const IssuedInvoiceLinesFullscreenView: React.FC<IssuedInvoiceLinesFullscreenViewProps> = ({
  invoice,
  invoiceLines,
  onClose,
  searchQuery,
  onSearchChange,
  onTaskClick
}) => {
  const [sortField, setSortField] = useState<'description' | 'unit_price' | 'task_name'>('description')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSortChange = (field: 'description' | 'unit_price' | 'task_name') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortLines = (lines: any[]) => {
    return [...lines].sort((a, b) => {
      let aValue: any = a[sortField]
      let bValue: any = b[sortField]
      
      if (sortField === 'description' || sortField === 'task_name') {
        aValue = (aValue || '').toLowerCase()
        bValue = (bValue || '').toLowerCase()
      }
      
      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
      }
    })
  }

  const filteredAndSortedLines = (lines: any[]) => {
    // Filter based on search query
    let filtered = lines
    if (searchQuery) {
      filtered = lines.filter(line => 
        (line.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (line.task_name || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    // Sort the filtered lines
    return sortLines(filtered)
  }

  const handleExportToExcel = (lines: any[]) => {
    const filteredData = filteredAndSortedLines(lines)
    
    // Create CSV content
    const headers = ['Task Name', 'Description', 'Unit Price']
    const csvContent = [
      headers.join(','),
      ...filteredData.map(line => [
        `"${(line.task_name || '').replace(/"/g, '""')}"`,
        `"${(line.description || '').replace(/"/g, '""')}"`,
        line.unit_price || 0
      ].join(','))
    ].join('\n')

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `invoice-lines-${invoice.invoice_number}-${new Date().toISOString().split('T')[0]}.csv`)
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
            Invoice Lines - {invoice.invoice_number}
          </h2>
          <p className="text-sm text-gray-500 truncate">
            {formatCurrency(invoice.total_amount, invoice.currency_code)} • {invoiceLines.length} lines
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
            Back to Invoice
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
                  <SortableHeader field="task_name" currentSort={{ field: sortField, direction: sortDirection }} onSortChange={handleSortChange}>Task Name</SortableHeader>
                  <SortableHeader
                    field="unit_price"
                    currentSort={{ field: sortField, direction: sortDirection }}
                    onSortChange={handleSortChange}
                    className="text-left"
                  >
                    Unit Price
                  </SortableHeader>
                </tr>
              </thead>
              <tbody>
                {processedLines.map((line, index) => (
                  <tr
                    key={`${line.description}-${index}`}
                    className={`border-b border-gray-100 hover:bg-gray-50 ${line.task_id ? 'cursor-pointer' : ''}`}
                    onClick={line.task_id ? () => onTaskClick?.(line.task_id!) : undefined}
                  >
                    <td className="px-4 py-3 text-sm border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-gray-900" title={line.description}>
                          {line.description || '—'}
                        </div>
                        {line.task_id && (
                          <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm border-b border-gray-100">
                      <div className="text-gray-900">
                        {line.task_name || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm border-b border-gray-100 text-left font-medium">
                      {formatCurrency(line.unit_price || 0, invoice.currency_code)}
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

export default function IssuedInvoiceDetail({ id, isPane = false, showHeader = false, menuAction, onMenuActionHandled, onTaskSelect, selectedTaskId, onInvoiceOrderSelect, initialInvoice, onDocumentUpdate, onRelatedDocumentSelect, onClose }: IssuedInvoiceDetailProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  
  // Get current sort configuration from URL params
  const sortBy = searchParams.get('sortBy') || 'invoice_date'
  const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'
  
  // Handle invoice order ID from URL
  const invoiceOrderId = searchParams.get('order')
  const sortConfig = { field: sortBy, direction: sortOrder as 'asc' | 'desc' }
  
  // State for invoice lines fullscreen view
  const [isInvoiceLinesFullscreenOpen, setIsInvoiceLinesFullscreenOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Linked order modal state
  const [editingLinkedOrder, setEditingLinkedOrder] = useState<any>(null)
  const [isEditLinkedOrderModalOpen, setIsEditLinkedOrderModalOpen] = useState(false)
  const [unlinkConfirmation, setUnlinkConfirmation] = useState<{ link: any; orderName: string } | null>(null)
  const [unlinkingOrderId, setUnlinkingOrderId] = useState<number | null>(null)

  // Task details pane state (only used when not in pane mode)
  const [localSelectedTaskId, setLocalSelectedTaskId] = useState<number | null>(null)
  const [isTaskDetailsExpanded, setIsTaskDetailsExpanded] = useState(false)

  // Use parent's task selection when in pane mode, local state otherwise
  const currentSelectedTaskId = isPane ? selectedTaskId : localSelectedTaskId
  const setCurrentSelectedTaskId = isPane ? (taskId: number | null) => onTaskSelect?.(taskId) : setLocalSelectedTaskId

  // Payment and modal state
  const [isPaymentPaneOpen, setIsPaymentPaneOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isAddExistingPaymentModalOpen, setIsAddExistingPaymentModalOpen] = useState(false)
  const [isAddInvoiceOrderModalOpen, setIsAddInvoiceOrderModalOpen] = useState(false)
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false)
  const [isInvoiceLinesExpanded, setIsInvoiceLinesExpanded] = useState(false)
  const [isAddPaymentModalOpen, setIsAddPaymentModalOpen] = useState(false)
  const [editingPaymentAllocation, setEditingPaymentAllocation] = useState<any>(null)
  const [isEditPaymentAllocationModalOpen, setIsEditPaymentAllocationModalOpen] = useState(false)
  const [deletePaymentConfirmation, setDeletePaymentConfirmation] = useState<{payment: any, invoiceId: number} | null>(null)
  const [isAddCreditNoteModalOpen, setIsAddCreditNoteModalOpen] = useState(false)
  const [editingCreditNote, setEditingCreditNote] = useState<any>(null)
  const [isEditCreditNoteModalOpen, setIsEditCreditNoteModalOpen] = useState(false)
  const [deleteCreditNoteConfirmation, setDeleteCreditNoteConfirmation] = useState<{creditNote: any, invoiceId: number} | null>(null)

  // Panes for full screen views
  const [isLinkedOrdersPaneOpen, setIsLinkedOrdersPaneOpen] = useState(false)
  const [isBillableTasksPaneOpen, setIsBillableTasksPaneOpen] = useState(false)
  const [isInvoiceLinesPaneOpen, setIsInvoiceLinesPaneOpen] = useState(false)
  const [isPaymentsPaneOpen, setIsPaymentsPaneOpen] = useState(false)
  
  // Invoice order details pane state
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<any>(null)

  // Internal pane navigation state
  const [currentPaneSection, setCurrentPaneSection] = useState<'details' | 'linked-orders' | 'billable-tasks' | 'payments' | null>(null)

  // Task details pane component that uses Edge Functions
  function TaskDetailsPane({ 
    taskId, 
    onClose, 
    isExpanded = false, 
    onExpand, 
    onCollapse 
  }: { 
    taskId: number; 
    onClose: () => void;
    isExpanded?: boolean;
    onExpand?: () => void;
    onCollapse?: () => void;
  }) {
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [accessToken, setAccessToken] = useState<string | null>(null)

    // Get current user and access token
    React.useEffect(() => {
      const getUserData = async () => {
        const supabase = createClientComponentClient()
        const { data: { user } } = await supabase.auth.getUser()
        const { data: { session } } = await supabase.auth.getSession()
        
        setCurrentUser(user)
        setAccessToken(session?.access_token || null)
      }
      
      getUserData()
    }, [])

    // Fetch task details using the Edge Function
    const { data: taskData, isLoading: isTaskLoading, error: taskError } = useQuery({
      queryKey: ['task', taskId, accessToken],
      queryFn: async () => {
        const supabase = createClientComponentClient()
        
        // Use the URL with query parameter as shown in the example
        const { data, error } = await supabase.functions.invoke(`task-details-bootstrap?task_id=${taskId}`)
        
        if (error) throw error
        return data
      },
      enabled: !!taskId && !!accessToken
    })

    // Get edit fields (may be cached)
    const { data: editFields } = useTaskEditFields(accessToken)

    if (isTaskLoading) {
      return (
        <div className="w-96 bg-white border-l border-gray-200 flex flex-col relative" style={{ height: 'calc(100vh - 70px)' }}>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-gray-500">Loading task...</div>
          </div>
        </div>
      )
    }

    if (taskError || !taskData?.task) {
      return (
        <div className="w-96 bg-white border-l border-gray-200 flex flex-col relative" style={{ height: 'calc(100vh - 70px)' }}>
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Task Details</h2>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-gray-500">Task not found</div>
          </div>
        </div>
      )
    }

    // Render the full TaskDetails component exactly like in the tasks page
    return (
      <div className={`bg-white flex flex-col ${isExpanded ? 'w-full h-full' : 'fixed top-0 w-96 border-l border-gray-200 h-screen z-60'}`} style={!isExpanded ? { right: '0px' } : {}}>
        <TaskDetails
          isCollapsed={false}
          selectedTask={taskData.task}
          onClose={onClose}
          onCollapse={onClose}
          isExpanded={isExpanded}
          onExpand={isExpanded ? undefined : onExpand}
          onRestore={isExpanded ? onCollapse : undefined}
          attachments={taskData.attachments || []}
          currentUser={currentUser}
          accessToken={accessToken}
        />
      </div>
    )
  }

  // Generate a unique instance ID for debugging
  const instanceId = React.useId()
  
  // Create Supabase client
  const supabase = createClientComponentClient()

  // Delete invoice mutation with optimistic updates
  const deleteInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!invoice?.id) throw new Error('No invoice ID provided')
      
      // Optimistically remove from caches first (TaskList pattern)
      removeInvoiceFromAllCaches(queryClient, displayInvoice.id)
      
      const { error } = await supabase
        .from('issued_client_invoices')
        .delete()
        .eq('id', displayInvoice.id)
      
      if (error) throw error
      return { success: true }
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Invoice deleted successfully',
      })
      // Navigate back to invoice list
      router.push('/billing/invoices')
    },
    onError: (err: any) => {
      toast({
        title: 'Error',
        description: err.message || 'Failed to delete invoice',
        variant: 'destructive',
      })
    }
  })

  // Issue invoice mutation
  const issueInvoiceMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await issueInvoice(id)
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      handleInvoiceUpdate(data)
      
      // Optimistically update invoice in all caches (including list) with sort config
      updateInvoiceInCaches(queryClient, data, sortConfig)
      
      // Also invalidate queries to ensure consistency (same pattern as payments)
      queryClient.invalidateQueries({ queryKey: ['issued-invoice', id] })
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          Array.isArray(query.queryKey) && 
          (query.queryKey[0] === 'v_issued_invoices_list' || 
           query.queryKey.includes('v_issued_invoices_list'))
      })
      
      // Trigger optimistic update for invoice orders
      if (data && data.issued_invoice_orders) {
        data.issued_invoice_orders.forEach((link: any) => {
          if (link.invoice_orders) {
            const updatedOrder = {
              ...link.invoice_orders,
              status: 'issued'
            }
            updateInvoiceOrderInCaches(updatedOrder)
          }
        })
      }
      
      toast({
        title: 'Success',
        description: 'Invoice issued successfully',
      })
    },
    onError: (err: any) => {
      toast({
        title: 'Error',
        description: err.message || 'Failed to issue invoice',
        variant: 'destructive',
      })
    }
  })

  // Use React Query to fetch and cache invoice data
  const { data: invoice, isLoading, error, refetch } = useQuery<IssuedInvoice>({
    queryKey: ['issued-invoice', id],
    queryFn: async () => {
      console.log(`[IssuedInvoiceDetail:${instanceId}] React Query fetching invoice ${id} (isPane: ${isPane}) at ${new Date().toISOString()}`)
      const { data, error } = await fetchIssuedInvoice(id)
      if (error) {
        throw new Error(error.message || 'Failed to load invoice')
      }
      return data
    }
  })

  // Local state for optimistic updates
  const [localInvoice, setLocalInvoice] = useState<IssuedInvoice | null>(null)

  // Update local invoice when query data changes
  useEffect(() => {
    if (invoice) {
      setLocalInvoice(invoice)
    }
  }, [invoice])


  // Handle invoice order ID from URL - find the order in the linked orders data
  useEffect(() => {
    if (invoiceOrderId && invoice?.issued_invoice_orders) {
      const orderId = parseInt(invoiceOrderId)
      const linkedOrder = displayInvoice.issued_invoice_orders.find((link: any) => link.invoice_order_id === orderId)
      if (linkedOrder?.invoice_orders) {
        setSelectedInvoiceOrder(linkedOrder.invoice_orders)
        onInvoiceOrderSelect?.(linkedOrder.invoice_orders)
      }
    } else {
      setSelectedInvoiceOrder(null)
      onInvoiceOrderSelect?.(null)
    }
  }, [invoiceOrderId, invoice?.issued_invoice_orders, onInvoiceOrderSelect])

  // Fetch recipients data
  const { data: recipientsData } = useQuery({
    queryKey: ['invoice-recipients', id],
    queryFn: async () => {
      const supabase = createClientComponentClient()
      const { data, error } = await supabase
        .from('v_issued_invoice_recipients')
        .select('*')
        .eq('issued_invoice_id', id)
        .single()
      
      if (error) {
        console.error('Error fetching recipients:', error)
        return null
      }
      
      return data
    },
    enabled: !!id
  })

  // Billable tasks state
  const [billableTasks, setBillableTasks] = useState<any[]>([])
  const [isLoadingBillableTasks, setIsLoadingBillableTasks] = useState(true)

  // Fetch billable tasks when the component mounts
  useEffect(() => {
    if (invoice?.id) {
      const fetchBillableTasks = async () => {
        try {
          setIsLoadingBillableTasks(true)
          const supabase = createClientComponentClient()
          
          const { data, error } = await supabase
            .from('v_billing_period_tasks')
            .select('task_id,title,delivery_date,publication_date,production_type_title,content_type_title,language_code,assigned_to_name,is_billable_candidate,project_name,project_status_name,project_status_color,is_overdue,is_publication_overdue')
            .eq('ctx_type', 'invoice')
            .eq('ctx_id', displayInvoice.id)
            .order('delivery_date', { ascending: false })
            .limit(50)

          if (error) throw error
          setBillableTasks(data || [])
        } catch (err: any) {
          console.error('Error fetching billable tasks:', err)
        } finally {
          setIsLoadingBillableTasks(false)
        }
      }
      
      fetchBillableTasks()
    }
  }, [invoice?.id])

  // Payments state
  const [payments, setPayments] = useState<any[]>([])
  const [isLoadingPayments, setIsLoadingPayments] = useState(true)

  // Credit notes state
  const [creditNotes, setCreditNotes] = useState<any[]>([])
  const [isLoadingCreditNotes, setIsLoadingCreditNotes] = useState(true)


  // PDF upload state
  const [pdfAttachments, setPdfAttachments] = useState<any[]>([])
  const [pdfSignedUrls, setPdfSignedUrls] = useState<{ [key: string]: string }>({})
  const [isUploadingPdf, setIsUploadingPdf] = useState(false)
  const [pdfUploadError, setPdfUploadError] = useState<string | null>(null)

  // Fetch payments when the component mounts
  useEffect(() => {
    if (invoice?.id) {
      const fetchPayments = async () => {
        try {
          setIsLoadingPayments(true)
          const { getInvoicePaymentAllocations } = await import('../../lib/payments')
          const { data, error } = await getInvoicePaymentAllocations(displayInvoice.id)
          
          if (error) throw error
          setPayments(data || [])
        } catch (err: any) {
          console.error('Error fetching payments:', err)
        } finally {
          setIsLoadingPayments(false)
        }
      }
      
      fetchPayments()
    }
  }, [invoice?.id])

  // Fetch credit notes when the component mounts
  useEffect(() => {
    if (invoice?.id) {
      const fetchCreditNotes = async () => {
        try {
          setIsLoadingCreditNotes(true)
          
          // Fetch credit notes for this invoice
          const { data, error } = await supabase
            .from('v_credit_notes_summary')
            .select('*')
            .eq('issued_invoice_id', displayInvoice.id)
          
          if (error) throw error
          setCreditNotes(data || [])
        } catch (err: any) {
          console.error('Error fetching credit notes:', err)
        } finally {
          setIsLoadingCreditNotes(false)
        }
      }
      
      fetchCreditNotes()
    }
  }, [invoice?.id])


  // Initialize PDF attachments when invoice loads - read from pdf_path column
  useEffect(() => {
    if (invoice?.pdf_path) {
      // Create attachment from pdf_path column
      const pdfAttachment = {
        id: 'current-pdf',
        file_name: displayInvoice.pdf_path?.split('/').pop() || 'displayInvoice.pdf',
        file_path: displayInvoice.pdf_path,
        uploaded_at: displayInvoice.updated_at || new Date().toISOString(),
        mime_type: 'application/pdf',
        size: null
      }
      
      setPdfAttachments([pdfAttachment])
      
      // Get signed URL for the PDF
      const fetchSignedUrl = async () => {
        try {
          const { data: signedUrl, error } = await supabase.storage
            .from('invoices')
            .createSignedUrl(displayInvoice.pdf_path!, 60 * 10) // 10 minutes
          
          if (error) {
            console.error('Error getting PDF signed URL:', error)
          } else if (signedUrl?.signedUrl) {
            setPdfSignedUrls({ 'current-pdf': signedUrl.signedUrl })
          }
        } catch (error) {
          console.error('Exception getting PDF signed URL:', error)
        }
      }
      
      fetchSignedUrl()
    } else {
      setPdfAttachments([])
      setPdfSignedUrls({})
    }
  }, [invoice?.pdf_path])

  // PDF upload handlers
  const handlePdfUpload = async (files: FileList | File[]) => {
    if (files.length === 0 || !invoice) return
    
    const file = Array.from(files)[0]
    if (file.type !== 'application/pdf') {
      setPdfUploadError('Please upload a PDF file')
      toast({
        title: 'Error',
        description: 'Please upload a PDF file',
        variant: 'destructive',
      })
      return
    }

    setIsUploadingPdf(true)
    setPdfUploadError(null)
    
    try {
      // Upload PDF with new path convention - store key-only format
      const storageKey = `${displayInvoice.issuer_team_id}/${displayInvoice.id}/${file.name}`
      const { data, error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(storageKey, file, { upsert: true })
      
      if (uploadError) throw uploadError

      // Update invoice with PDF path (key-only format)
      await updateIssuedInvoice(displayInvoice.id, { pdf_path: storageKey })
      
      // Refresh invoice data
      const { data: updatedInvoice, error: updateError } = await fetchIssuedInvoice(displayInvoice.id)
      if (updateError) throw updateError

      // Get signed URL for the uploaded PDF
      const { data: signedUrl, error: urlError } = await supabase.storage
        .from('invoices')
        .createSignedUrl(storageKey, 60 * 10) // 10 minutes
      if (urlError) throw urlError

      // Refresh the PDF list to include the new upload
      // The useEffect will handle updating the PDF attachments and signed URLs
      queryClient.invalidateQueries({ queryKey: ['issued-invoice', displayInvoice.id] })

      toast({
        title: 'Success',
        description: 'PDF uploaded successfully',
      })
    } catch (error: any) {
      console.error('Error uploading PDF:', error)
      setPdfUploadError(error?.message || 'Failed to upload PDF')
      toast({
        title: 'Error',
        description: error?.message || 'Failed to upload PDF',
        variant: 'destructive',
      })
    } finally {
      setIsUploadingPdf(false)
    }
  }

  const handlePdfDelete = async (attachment: any) => {
    if (!invoice) return
    
    try {
      // Step 1: Call RPC to clear the pdf_path in database and get the storage key
      const { data: pdfKey, error: rpcError } = await deleteInvoicePdf(displayInvoice.id)
      
      if (rpcError) throw rpcError

      // Step 2: Immediately clear local PDF state to prevent stale signed URL calls
      setPdfAttachments([])
      setPdfSignedUrls({})

      // Step 3: If we got a PDF key back, delete it from storage
      if (pdfKey) {
        const { error: storageError } = await supabase.storage
          .from('invoices')
          .remove([pdfKey])
        
        if (storageError) {
          console.error('Storage deletion failed (orphan file created):', storageError)
          // Don't throw here - the database is already consistent, just log the storage failure
        }
      }

      // Step 4: Refresh the invoice data to update UI
      queryClient.invalidateQueries({ queryKey: ['issued-invoice', displayInvoice.id] })
      
      toast({
        title: 'Success',
        description: 'PDF deleted successfully',
      })
    } catch (error: any) {
      console.error('Error deleting PDF:', error)
      toast({
        title: 'Error',
        description: error?.message || 'Failed to delete PDF',
        variant: 'destructive'
      })
    }
  }

  // Handle menu actions
  React.useEffect(() => {
    if (menuAction && invoice) {
      switch (menuAction) {
        case 'add-invoice-order':
          setIsAddInvoiceOrderModalOpen(true)
          onMenuActionHandled?.()
          break
        case 'add-payment':
          setIsAddExistingPaymentModalOpen(true)
          onMenuActionHandled?.()
          break
        case 'upload-invoice':
          // TODO: Implement upload invoice functionality
          console.log('Upload invoice action triggered')
          onMenuActionHandled?.()
          break
        case 'delete-invoice':
          // Only show confirmation dialog when not in pane mode
          // When in pane mode, the parent DocumentDetailsPane handles the confirmation
          if (!isPane) {
            setIsDeleteConfirmationOpen(true)
          }
          onMenuActionHandled?.()
          break
      }
    }
  }, [menuAction, invoice, onMenuActionHandled])

  // Handle errors with useEffect
  React.useEffect(() => {
    if (error) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load invoice',
        variant: 'destructive',
      })
    }
  }, [error])

  const handleInvoiceUpdate = (updatedInvoice: IssuedInvoice | Partial<IssuedInvoice>) => {
    // Merge with existing invoice data if it's a partial update
    const fullUpdatedInvoice = { ...invoice, ...updatedInvoice } as IssuedInvoice
    
    
    // Update the cache with the new data
    queryClient.setQueryData(['issued-invoice', id], fullUpdatedInvoice)
    
    // Update local invoice state for optimistic UI
    setLocalInvoice(fullUpdatedInvoice)

    // If we have a document update callback (from documents page), call it
    if (onDocumentUpdate) {
      // Convert the updated invoice to document format
      const updatedDocument = {
        doc_id: fullUpdatedInvoice.id,
        direction: 'ar' as const,
        doc_kind: 'invoice' as const,
        doc_number: fullUpdatedInvoice.invoice_number,
        doc_date: fullUpdatedInvoice.invoice_date,
        currency_code: fullUpdatedInvoice.currency_code,
        subtotal_amount: fullUpdatedInvoice.subtotal_amount,
        vat_amount: fullUpdatedInvoice.vat_amount,
        total_amount: fullUpdatedInvoice.total_amount,
        status: fullUpdatedInvoice.status,
        from_team_id: fullUpdatedInvoice.issuer_team_id,
        from_team_name: fullUpdatedInvoice.issuer_team_name,
        to_team_id: fullUpdatedInvoice.payer_team_id,
        to_team_name: fullUpdatedInvoice.payer_team_name,
        balance_due: fullUpdatedInvoice.balance_due,
        projects_text: fullUpdatedInvoice.projects_text,
        created_at: fullUpdatedInvoice.created_at,
        updated_at: fullUpdatedInvoice.updated_at
      }
      onDocumentUpdate(updatedDocument)
    }
  }

  const handleRecordPayment = () => {
    if (!invoice) return
    setIsAddPaymentModalOpen(true)
  }

  const handleEditInvoice = () => {
    if (!invoice) return
    setIsEditModalOpen(true)
  }

  const handleAddExistingPayment = () => {
    if (!invoice) return
    setIsAddExistingPaymentModalOpen(true)
  }

  const handleAddInvoiceOrder = () => {
    if (!invoice) return
    setIsAddInvoiceOrderModalOpen(true)
  }

  const handleIssueInvoice = () => {
    if (!invoice) return
    issueInvoiceMutation.mutate()
  }

  const handleDeleteInvoice = () => {
    // Only show confirmation dialog when not in pane mode
    // When in pane mode, the parent DocumentDetailsPane handles the confirmation
    if (!isPane) {
      setIsDeleteConfirmationOpen(true)
    }
  }

  const handleCopyLink = async () => {
    try {
      if (!invoice?.id) return
      const url = `${window.location.origin}/billing/invoices?invoice=${displayInvoice.id}`
      await navigator.clipboard.writeText(url)
      toast({
        title: 'Link copied',
        description: 'Invoice link has been copied to clipboard',
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

  const handleExportBillableTasksXLSX = async () => {
    if (!invoice) return
    
    try {
      const supabase = createClientComponentClient()
      const { data, error } = await supabase
        .from('v_billing_period_tasks')
        .select('task_id,title,delivery_date,production_type_title,content_type_title,language_code,assigned_to_name,is_billable_candidate')
        .eq('ctx_type', 'invoice')
        .eq('ctx_id', displayInvoice.id)
        .order('delivery_date', { ascending: false })

      if (error) throw error
      
      // Export to XLSX
      const { exportToXLSX } = await import('../../../lib/utils/export')
      exportToXLSX(data || [], `billable-tasks-invoice-${displayInvoice.id}`)
      
      toast({
        title: 'Success',
        description: 'Billable tasks exported to XLSX',
      })
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to export billable tasks',
        variant: 'destructive',
      })
    }
  }


  const handleExportPaymentsXLSX = async () => {
    if (!invoice) return
    
    try {
      // Get payment data - you may need to implement this based on your data structure
      const { exportToXLSX } = await import('../../../lib/utils/export')
      exportToXLSX([], `payments-invoice-${displayInvoice.id}`)
      
      toast({
        title: 'Success',
        description: 'Payments exported to XLSX',
      })
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to export payments',
        variant: 'destructive',
      })
    }
  }

  const confirmDeleteInvoice = () => {
    deleteInvoiceMutation.mutate()
    setIsDeleteConfirmationOpen(false)
  }

  const handlePaymentCreated = (paymentId: number) => {
    toast({
      title: 'Success',
      description: 'Payment recorded successfully',
    })
    setIsPaymentPaneOpen(false)
    
    // Emit event to refresh invoice data
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('invoice:paymentRecorded', { 
        detail: { invoiceId: invoice!.id } 
      }))
    }
    
    // Refetch invoice data
    queryClient.invalidateQueries({ queryKey: ['issued-invoice', id] })
  }

  const getBalanceDue = (invoice: IssuedInvoice): number => {
    // Return the actual balance due (total amount minus payments and credits)
    return invoice.balance_due || 0
  }

  const canRecordPayment = (invoice: IssuedInvoice): boolean => {
    return invoice.status !== 'draft' && invoice.status !== 'paid' && invoice.status !== 'cancelled'
  }

  const canIssueInvoice = (invoice: IssuedInvoice): boolean => {
    return invoice.status === 'draft'
  }

  const canEditInvoice = (invoice: IssuedInvoice): boolean => {
    return true // Allow editing for all invoices
  }

  // Listen for issued invoice updates from optimistic updates
  React.useEffect(() => {
    const handleIssuedInvoiceUpdate = (event: CustomEvent) => {
      const { invoiceId, updatedInvoice } = event.detail
      if (invoiceId === id) {
        // Update the cache with the new data
        queryClient.setQueryData(['issued-invoice', id], updatedInvoice)
      }
    }

    const handleInvoiceRefresh = (event: CustomEvent) => {
      const { invoiceId } = event.detail
      if (invoiceId === id) {
        // Refetch the invoice data
        refetch()
      }
    }

    window.addEventListener('issuedInvoiceUpdated', handleIssuedInvoiceUpdate as EventListener)
    window.addEventListener('invoice:refresh', handleInvoiceRefresh as EventListener)
    
    return () => {
      window.removeEventListener('issuedInvoiceUpdated', handleIssuedInvoiceUpdate as EventListener)
      window.removeEventListener('invoice:refresh', handleInvoiceRefresh as EventListener)
    }
  }, [id, queryClient, refetch])

  // Listen for invoice creation events to refresh data
  useEffect(() => {
    const handleInvoiceCreatedAndIssued = (event: CustomEvent) => {
      if (event.detail?.action === 'invoice_created_and_issued') {
        // Refresh the current invoice data if it's the one that was created
        if (event.detail.invoiceId === id) {
          refetch()
        }
        
        // Also refresh the invoice list to ensure consistency
        queryClient.invalidateQueries({ queryKey: ['v_issued_invoices_list'] })
      }
    }

    window.addEventListener('invoiceCreatedAndIssued', handleInvoiceCreatedAndIssued as EventListener)
    return () => {
      window.removeEventListener('invoiceCreatedAndIssued', handleInvoiceCreatedAndIssued as EventListener)
    }
  }, [id, refetch, queryClient])


  // Use initialInvoice data if available to render immediately
  const displayInvoice = localInvoice || initialInvoice || invoice

  if (isLoading && !displayInvoice) {
    return (
      <div className="flex h-screen bg-white">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center space-x-4">
              <div className="w-6 h-6 bg-gray-200 animate-pulse rounded"></div>
              <div className="w-32 h-6 bg-gray-200 animate-pulse rounded"></div>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-gray-500">Loading displayInvoice...</div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !displayInvoice) {
    return (
      <div className="flex h-screen bg-white">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="h-6 bg-gray-200 animate-pulse rounded w-32"></div>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-gray-500 mb-2">Invoice not found</div>
              <div className="text-sm text-gray-400">The invoice you're looking for doesn't exist or has been deleted.</div>
            </div>
          </div>
        </div>
      </div>
    )
  }


  if (isPane) {
    // Simplified pane version
    return (
      <div className="h-full flex flex-col">
        {showHeader && (
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">
              AR Invoice #{displayInvoice?.invoice_number || displayInvoice?.id}
            </h2>
            <div className="flex items-center space-x-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleEditInvoice}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit Invoice
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleAddExistingPayment}>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Add Payment
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDeleteInvoice} className="text-red-600">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Invoice
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
        {/* Scrollable content */}
        <div className="flex-1 overflow-auto p-4 space-y-6 pb-20">
          {/* Invoice Details */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">Invoice Details</h3>
            <div className="space-y-2">
              {(() => {
                const editableFields = EditableInvoiceFields({ invoice: displayInvoice, onInvoiceUpdate: handleInvoiceUpdate })
                return (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-gray-500">Invoice Number</span>
                      <div className="flex-1 max-w-[200px]">{editableFields.invoiceNumber}</div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-gray-500">External Invoice ID</span>
                      <div className="flex-1 max-w-[200px]">{editableFields.externalInvoiceId}</div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-gray-500">Invoice Date</span>
                      <div className="flex-1 max-w-[200px]">{editableFields.invoiceDate}</div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-gray-500">Due Date</span>
                      <div className="flex-1 max-w-[200px]">{editableFields.dueDate}</div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-gray-500">Status</span>
                      <Badge 
                        variant="secondary"
                        className="text-xs bg-black text-white"
                      >
                        {formatStatusText(displayInvoice.status)}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-gray-500">Supplier</span>
                      <div className="flex-1 max-w-[200px]">{editableFields.supplier}</div>
                    </div>
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-medium text-gray-500">Payer</span>
                      <div className="flex-1 max-w-[200px]">{editableFields.payer}</div>
                    </div>
                  </>
                )
              })()}
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-gray-500">Projects</span>
                <div className="text-right">
                  {displayInvoice.projects && displayInvoice.projects.length > 0 ? (
                    <div className="flex flex-wrap gap-1 justify-end">
                      {displayInvoice.projects.map((project: any, index: number) => (
                        <span 
                          key={index} 
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {project}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-900">-</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Amounts */}
              <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">Amounts</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-gray-500">Subtotal</span>
                <div className="flex-1 max-w-[200px]">
                  {(() => {
                    const editableFields = EditableInvoiceFields({ invoice: displayInvoice, onInvoiceUpdate: handleInvoiceUpdate })
                    return editableFields.subtotal
                  })()}
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-gray-500">VAT</span>
                <span className="text-sm text-gray-900">{formatCurrency(displayInvoice.vat_amount, displayInvoice.currency_code)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-gray-500">Total</span>
                <div className="flex-1 max-w-[200px]">
                  {(() => {
                    const editableFields = EditableInvoiceFields({ invoice: displayInvoice, onInvoiceUpdate: handleInvoiceUpdate })
                    return editableFields.total
                  })()}
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-gray-500">Invoice orders (no VAT)</span>
                <span className="text-sm text-gray-900">{formatCurrency(displayInvoice.allocated_subtotal_amount || 0, displayInvoice.currency_code)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-gray-500">Fully Allocated</span>
                <span className={`text-sm font-medium ${displayInvoice.is_fully_allocated === 'Yes' ? 'text-green-600' : 'text-red-600'}`}>
                  {displayInvoice.is_fully_allocated === 'Yes' ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-gray-500">Credited (no VAT)</span>
                <span className="text-sm text-gray-900">{formatCurrency(displayInvoice.credited_subtotal_amount || 0, displayInvoice.currency_code)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-gray-500">Paid (with VAT)</span>
                <span className="text-sm text-gray-900">{formatCurrency(displayInvoice.amount_paid || 0, displayInvoice.currency_code)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-gray-500">Balance (with VAT)</span>
                <span className={`text-sm font-medium ${Math.abs(displayInvoice.balance_due || 0) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(displayInvoice.balance_due || 0, displayInvoice.currency_code)}
                </span>
              </div>
            </div>
          </div>

          {/* PDF Upload */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">Invoice PDF</h3>
            <Dropzone
              tableName="invoices"
              recordId={displayInvoice.id}
              bucketName="invoices"
              attachments={pdfAttachments}
              signedUrls={pdfSignedUrls}
              isUploading={isUploadingPdf}
              uploadError={pdfUploadError}
              uploadFiles={handlePdfUpload}
              deleteAttachment={handlePdfDelete}
              className="min-h-[120px]"
            />
          </div>


          {/* Section Links */}
          <div className="space-y-2">
          {/* Linked Orders */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">Invoice orders</h3>
              <div className="space-y-2">
                {displayInvoice.issued_invoice_orders && displayInvoice.issued_invoice_orders.length > 0 ? (
                  displayInvoice.issued_invoice_orders.map((link: any) => {
                    const order = link.invoice_orders
                    const billedAmount = link.amount_override_subtotal !== null ? link.amount_override_subtotal : order.subtotal_amount
                    return (
                      <div key={link.id} className="flex justify-between items-center py-2 border-b border-gray-100">
                        <div className="flex-1 min-w-0">
                           <button
                             onClick={() => {
                               // Open invoice order details pane in third pane
                               if (onRelatedDocumentSelect) {
                                 onRelatedDocumentSelect({
                                   // Document structure fields
                                   id: order.id,
                                   doc_id: order.id,
                                   doc_kind: 'order',
                                   direction: 'ar',
                                   doc_number: `IO-${order.id}`,
                                   doc_date: order.billing_period_start || order.created_at,
                                   from_team_name: order.issuer_team_name,
                                   to_team_name: order.client_team_name,
                                   subtotal_amount: order.subtotal_amount,
                                   vat_amount: order.vat_amount,
                                   total_amount: order.total_amount,
                                   currency_code: order.currency_code,
                                   status: order.status,
                                   
                                   // Invoice order structure fields
                                   project_id: order.project_id,
                                   project_name: order.project_name,
                                   project_color: order.project_color,
                                   billing_period_start: order.billing_period_start,
                                   billing_period_end: order.billing_period_end,
                                   created_at: order.created_at,
                                   updated_at: order.updated_at
                                 }, 'invoice_order')
                               } else {
                                 // Fallback to existing behavior
                                 const newParams = new URLSearchParams(searchParams.toString())
                                 newParams.set('order', order.id.toString())
                                 router.replace(`?${newParams.toString()}`, { scroll: false })
                                 
                                 // Set the selected invoice order
                                 setSelectedInvoiceOrder(order)
                                 onInvoiceOrderSelect?.(order)
                               }
                             }}
                             className="text-sm text-gray-900 hover:text-blue-600 text-left w-full truncate underline-offset-4 hover:underline"
                           >
                            {order.projects?.name || 'Unknown Project'}
                          </button>
                          <div className="text-xs text-gray-500 mt-1">
                            {formatCurrency(billedAmount, order.currency_code)}
                            {order.billing_period_start && order.billing_period_end && (
                              <span className="ml-2">
                                • {new Date(order.billing_period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(order.billing_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <button
                            onClick={() => {
              setEditingLinkedOrder(link)
              setIsEditLinkedOrderModalOpen(true)
            }}
                            className="text-xs text-gray-600 hover:text-gray-900"
                          >
                            edit
                          </button>
                          <button
                            onClick={() => {
                              setUnlinkConfirmation({ link, orderName: order.projects?.name || 'Unknown Project' })
                            }}
                            className="text-xs text-gray-600 hover:text-gray-900"
                          >
                            remove
                          </button>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="text-center py-4 text-gray-500">No linked orders found</div>
                )}
              </div>
              
              <div className="mt-4 mb-12">
                <Button onClick={handleAddInvoiceOrder} variant="outline" size="sm" className="w-full">
                  Add Order
                </Button>
              </div>
            </div>

            {/* Tasks */}
            <div className="mb-12">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Tasks</h3>
              <div className="space-y-2">
                {billableTasks.length > 0 ? (
                  billableTasks.map((task, index) => (
                    <div 
                      key={task.task_id} 
                      className={`flex items-center justify-between py-2 ${index !== billableTasks.length - 1 ? 'border-b border-gray-200' : ''}`}
                    >
                      {/* Left side - Title with icon */}
                      <div className="flex items-center space-x-1 flex-1 min-w-0 pr-4">
                        <span 
                          className="text-sm text-gray-900 truncate cursor-pointer underline-offset-4 hover:underline"
                          onClick={() => {
                            // Open task details pane in third pane
                            if (onRelatedDocumentSelect) {
                              onRelatedDocumentSelect({
                                task_id: task.task_id,
                                title: task.title,
                                delivery_date: task.delivery_date,
                                project_id: task.project_id,
                                id: task.task_id,
                                doc_id: task.task_id,
                                doc_kind: 'task',
                                direction: 'ar',
                                doc_number: `TASK-${task.task_id}`,
                                doc_date: task.delivery_date || task.created_at
                              }, 'task')
                            } else {
                              // Fallback to existing behavior
                              setCurrentSelectedTaskId(task.task_id)
                            }
                          }}
                        >
                          {task.title}
                        </span>
                        <svg 
                          className="w-3 h-3 text-gray-400 flex-shrink-0 cursor-pointer" 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                          onClick={() => {
                            // Open task details pane in third pane
                            if (onRelatedDocumentSelect) {
                              onRelatedDocumentSelect({
                                task_id: task.task_id,
                                title: task.title,
                                delivery_date: task.delivery_date,
                                project_id: task.project_id,
                                id: task.task_id,
                                doc_id: task.task_id,
                                doc_kind: 'task',
                                direction: 'ar',
                                doc_number: `TASK-${task.task_id}`,
                                doc_date: task.delivery_date || task.created_at
                              }, 'task')
                            } else {
                              // Fallback to existing behavior
                              setCurrentSelectedTaskId(task.task_id)
                            }
                          }}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        {!task.is_billable_candidate && (
                          <Badge variant="outline" className="text-xs flex-shrink-0 ml-2">
                            Non-billable
                          </Badge>
                        )}
                      </div>
                      
                      {/* Right side - Delivery date and assignee */}
                      <div className="flex items-center space-x-3 flex-shrink-0">
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {task.delivery_date ? (() => {
                            const date = new Date(task.delivery_date)
                            return date.toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          })() : '—'}
                        </span>
                        {task.assigned_to_name && (
                          <div className="flex items-center space-x-1">
                            <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">
                              {task.assigned_to_name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-gray-500">No tasks found</div>
                )}
              </div>
            </div>

            {/* Payments */}
            <div className="pt-6">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Payments</h3>
              <div className="space-y-2">
                {isLoadingPayments ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100">
                        <div className="flex-1 min-w-0">
                          <div className="h-4 bg-gray-200 animate-pulse rounded w-1/2 mb-2"></div>
                          <div className="h-3 bg-gray-200 animate-pulse rounded w-1/3"></div>
                        </div>
                        <div className="h-3 bg-gray-200 animate-pulse rounded w-20 ml-4"></div>
                      </div>
                    ))}
                  </div>
                ) : payments.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">No payments found</div>
                ) : (
                  <div className="space-y-2">
                    {payments.map((payment) => (
                      <div 
                        key={payment.payment_id} 
                        className="flex justify-between items-center py-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => {
                          // Open payment details pane in third pane
                          if (onRelatedDocumentSelect) {
                            onRelatedDocumentSelect({
                              // Document structure fields
                              id: payment.payment_id,
                              doc_id: payment.payment_id,
                              doc_kind: 'payment',
                              direction: 'ar',
                              doc_number: payment.external_ref || `PAY-${payment.payment_id}`,
                              doc_date: payment.payment_date,
                              from_team_name: payment.payer_team_name,
                              to_team_name: payment.paid_to_team_name,
                              subtotal_amount: payment.payment_amount,
                              vat_amount: 0,
                              total_amount: payment.payment_amount,
                              currency_code: payment.payment_currency,
                              status: payment.status,
                              
                              // Payment structure fields
                              payment_id: payment.payment_id,
                              external_ref: payment.external_ref,
                              payment_date: payment.payment_date,
                              payment_amount: payment.payment_amount,
                              payment_currency: payment.payment_currency,
                              method: payment.method,
                              payer_team_id: payment.payer_team_id,
                              payer_team_name: payment.payer_team_name,
                              paid_to_team_id: payment.paid_to_team_id,
                              paid_to_team_name: payment.paid_to_team_name,
                              unallocated_amount: payment.unallocated_amount,
                              created_at: payment.created_at,
                              updated_at: payment.updated_at
                            }, 'payment')
                          }
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-900">
                            {formatCurrency(payment.amount_applied, payment.payment_currency)}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {payment.payment_date ? (() => {
                              const date = new Date(payment.payment_date)
                              return date.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            })() : '—'}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingPaymentAllocation(payment)
                              setIsEditPaymentAllocationModalOpen(true)
                            }}
                            className="text-xs text-gray-600 hover:text-gray-900"
                          >
                            edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeletePaymentConfirmation({ payment, invoiceId: displayInvoice.id })
                            }}
                            className="text-xs text-gray-600 hover:text-gray-900"
            >
                            remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="mt-6 mb-8">
                <Button onClick={() => setIsAddPaymentModalOpen(true)} variant="outline" size="sm" className="w-full">
                  Add Payment
            </Button>
              </div>
          </div>

            {/* Credit Notes */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">Credit Notes</h3>
              <div className="space-y-2">
                {isLoadingCreditNotes ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100">
                        <div className="flex-1 min-w-0">
                          <div className="h-4 bg-gray-200 animate-pulse rounded w-1/2 mb-2"></div>
                          <div className="h-3 bg-gray-200 animate-pulse rounded w-1/3"></div>
                        </div>
                        <div className="h-3 bg-gray-200 animate-pulse rounded w-20 ml-4"></div>
                      </div>
                    ))}
                  </div>
                ) : creditNotes.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">No credit notes found</div>
                ) : (
                  <div className="space-y-2">
                    {creditNotes.map((creditNote) => (
                      <div 
                        key={creditNote.credit_note_id} 
                        className="flex justify-between items-center py-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => {
                          // Open credit note details pane in third pane
                          if (onRelatedDocumentSelect) {
                            onRelatedDocumentSelect({
                              // Document structure fields
                              id: creditNote.credit_note_id,
                              doc_id: creditNote.credit_note_id,
                              doc_kind: 'credit_note',
                              direction: 'ar',
                              doc_number: creditNote.credit_number || `CN-${creditNote.credit_note_id}`,
                              doc_date: creditNote.credit_date,
                              from_team_name: creditNote.issuer_team_name,
                              to_team_name: creditNote.invoice_to_team_name,
                              subtotal_amount: creditNote.subtotal_amount,
                              vat_amount: creditNote.vat_amount,
                              total_amount: creditNote.total_amount,
                              currency_code: creditNote.currency_code,
                              status: creditNote.status,
                              
                              // Credit note structure fields
                              credit_note_id: creditNote.credit_note_id,
                              credit_number: creditNote.credit_number,
                              credit_date: creditNote.credit_date,
                              reason: creditNote.reason,
                              notes: creditNote.notes,
                              issuer_team_id: creditNote.issuer_team_id,
                              issuer_team_name: creditNote.issuer_team_name,
                              invoice_to_team_id: creditNote.invoice_to_team_id,
                              invoice_to_team_name: creditNote.invoice_to_team_name,
                              created_at: creditNote.created_at,
                              updated_at: creditNote.updated_at
                            }, 'credit_note')
                          }
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-900">
                            {formatCurrency(creditNote.subtotal_amount || 0, creditNote.currency_code)}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {creditNote.credit_date ? (() => {
                              const date = new Date(creditNote.credit_date)
                              return date.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            })() : '—'}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingCreditNote(creditNote)
                              setIsEditCreditNoteModalOpen(true)
                            }}
                            className="text-xs text-gray-600 hover:text-gray-900"
                          >
                            edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteCreditNoteConfirmation({ creditNote, invoiceId: displayInvoice.id })
                            }}
                            className="text-xs text-gray-600 hover:text-gray-900"
                          >
                            remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="mt-6 mb-8">
                <Button onClick={() => setIsAddCreditNoteModalOpen(true)} variant="outline" size="sm" className="w-full">
                  Add Credit Note
                </Button>
              </div>
            </div>

            {/* Recipients */}
            <div className="mt-8 mb-20">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Recipients</h3>
              <div className="flex flex-wrap gap-2">
                {recipientsData && recipientsData.recipient_names && recipientsData.recipient_names.length > 0 ? (
                  recipientsData.recipient_names.map((name: string, index: number) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                    >
                      {name.trim()}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-gray-500">No recipients</span>
                )}
              </div>
            </div>

          </div>
          </div>

         {/* Right Pane - Content based on selected section */}
         {currentPaneSection && (
           <div className="fixed top-0 w-96 bg-white border-l border-gray-200 flex flex-col h-screen z-50 shadow-lg" style={{ 
             right: selectedInvoiceOrder ? '384px' : '0px'
           }}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                  onClick={() => setCurrentPaneSection(null)}
                  className="p-1 h-8 w-8"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <h2 className="text-lg font-semibold text-gray-900">
                  {currentPaneSection === 'billable-tasks' && (
                    <>
                      Tasks
                      <span className="ml-2 text-sm font-normal text-gray-500">
                        ({(() => {
                          const taskCount = displayInvoice.issued_invoice_orders?.reduce((total: number, link: any) => {
                            return total + (link.invoice_orders?.tasks_count || 0)
                          }, 0) || 0
                          return taskCount
                        })()})
                      </span>
                    </>
                  )}
                </h2>
              </div>
              <div className="flex items-center space-x-2">
                {currentPaneSection === 'billable-tasks' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => {
                        const params = new URLSearchParams()
                        params.set('ctx', 'invoice')
                        params.set('id', displayInvoice.id.toString())
                        params.set('focus', 'true')
                        const url = `/billing/billable-tasks?${params.toString()}`
                        window.location.href = url
                      }}>
                        <Expand className="w-3 h-3 mr-2" />
                Expand
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExportBillableTasksXLSX()}>
                        <FileSpreadsheet className="w-3 h-3 mr-2" />
                        Download
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button variant="ghost" size="sm" onClick={() => setCurrentPaneSection(null)}>
                  <X className="w-4 h-4" />
              </Button>
            </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {currentPaneSection === 'billable-tasks' && (
                <div className="h-full flex flex-col">
                  <div className="flex-1 overflow-auto p-4">
                    {isLoadingBillableTasks ? (
            <div className="space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100">
                            <div className="flex-1 min-w-0">
                              <div className="h-4 bg-gray-200 animate-pulse rounded w-3/4 mb-2"></div>
                              <div className="h-3 bg-gray-200 animate-pulse rounded w-1/2"></div>
                            </div>
                            <div className="h-3 bg-gray-200 animate-pulse rounded w-16 ml-4"></div>
                          </div>
                        ))}
                      </div>
                    ) : billableTasks.length === 0 ? (
                      <div className="text-center py-4 text-gray-500">No billable tasks found</div>
                    ) : (
                      <div className="space-y-2">
                        {billableTasks.map((task) => (
                          <div key={task.task_id} className="flex justify-between items-center py-2 border-b border-gray-100">
                            <div className="flex-1 min-w-0">
                              <button
                                onClick={() => setCurrentSelectedTaskId(task.task_id)}
                                className="text-sm text-gray-900 hover:text-blue-600 text-left w-full truncate"
                              >
                                {task.title}
                              </button>
                            <div className="text-xs text-gray-500 mt-1">
                                {task.production_type_title} • {task.content_type_title} • {task.language_code}
                            </div>
                        </div>
                            <div className="text-xs text-gray-500 ml-4">
                              {task.delivery_date ? (() => {
                                const date = new Date(task.delivery_date)
                                return date.toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })
                              })() : '-'}
                      </div>
                    </div>
                  ))}
                    </div>
                  )}
                </div>
                </div>
              )}


          </div>
        </div>
        )}


        {/* Payment Creation Pane */}
        {isPaymentPaneOpen && (
          <div className="fixed inset-0 z-50 bg-white">
            <PaymentCreatePane
              onClose={() => setIsPaymentPaneOpen(false)}
              onPaymentCreated={handlePaymentCreated}
              fromInvoice={{
                invoiceId: displayInvoice.id,
                payerTeamId: displayInvoice.payer_team_id || 0,
                currency: displayInvoice.currency_code,
                suggestedAmount: getBalanceDue(displayInvoice!),
                openPaymentAfterCreate: true
              }}
            />
          </div>
        )}

        {/* Footer */}
        <div className="absolute left-0 right-0 p-4 border-t border-gray-200 bg-white flex-shrink-0 z-50" style={{ bottom: '0px' }}>
        <div className="flex space-x-2">
          <Button
            onClick={handleEditInvoice}
            className="w-1/2 bg-white text-black border border-gray-300 hover:bg-gray-50 rounded-none"
          >
            Edit Invoice
          </Button>
            {canRecordPayment(displayInvoice!) ? (
              <Button
                onClick={handleRecordPayment}
                className="w-1/2 bg-black text-white hover:bg-gray-800 rounded-none"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Record payment
              </Button>
            ) : canIssueInvoice(displayInvoice!) ? (
              <Button
                onClick={handleIssueInvoice}
                disabled={issueInvoiceMutation.isPending}
                className="w-1/2 bg-black text-white hover:bg-gray-800 rounded-none"
              >
                {issueInvoiceMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Issuing...
                  </>
                ) : (
                  'Issue Invoice'
                )}
              </Button>
            ) : (
              <Button
                disabled
                className="w-1/2 bg-gray-300 text-gray-500 rounded-none"
              >
                —
              </Button>
            )}
          </div>
        </div>

        {/* Delete Confirmation Dialog - only show when not in pane mode */}
        {!isPane && (
          <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Invoice</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this invoice? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteConfirmationOpen(false)}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={confirmDeleteInvoice}
                disabled={deleteInvoiceMutation.isPending}
              >
                {deleteInvoiceMutation.isPending ? 'Deleting...' : 'Delete Invoice'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        )}

        {/* Edit Invoice Modal */}
        <EditInvoiceModal
          invoice={displayInvoice!}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onInvoiceUpdated={handleInvoiceUpdate}
        />

        {/* Add Existing Payment Modal */}
        <AddExistingPaymentModal
          invoiceId={displayInvoice.id}
          invoiceCurrency={displayInvoice.currency_code}
          isOpen={isAddExistingPaymentModalOpen}
          onClose={() => setIsAddExistingPaymentModalOpen(false)}
          onPaymentAdded={async () => {
            // Refresh the payment allocations immediately
            try {
              const { getInvoicePaymentAllocations } = await import('../../lib/payments')
              const { data, error } = await getInvoicePaymentAllocations(displayInvoice.id)
              
              if (error) throw error
              setPayments(data || [])
            } catch (err: any) {
              console.error('Error refreshing payments:', err)
            }
            
            // Also refresh the invoice data
            queryClient.invalidateQueries({ queryKey: ['issued-invoice', displayInvoice.id] })
          }}
        />

        {/* Add Payment Modal */}
        <AddPaymentModal
          invoiceId={displayInvoice.id}
          invoiceCurrency={displayInvoice.currency_code}
          invoiceNumber={displayInvoice.invoice_number}
          payerTeamId={displayInvoice.payer_team_id || 0}
          payerTeamName={displayInvoice.payer_team_name}
          paidToTeamId={displayInvoice.issuer_team_id}
          paidToTeamName={displayInvoice.issuer_team_name}
          balanceDue={getBalanceDue(displayInvoice!)}
          subtotalAmount={displayInvoice.subtotal_amount}
          isOpen={isAddPaymentModalOpen}
          onClose={() => setIsAddPaymentModalOpen(false)}
          onPaymentAdded={async (paymentId) => {
            // Refresh the payment allocations immediately
            try {
              const { getInvoicePaymentAllocations } = await import('../../lib/payments')
              const { data, error } = await getInvoicePaymentAllocations(displayInvoice.id)
              
              if (error) throw error
              setPayments(data || [])
            } catch (err: any) {
              console.error('Error refreshing payments:', err)
            }
            
            // Also refresh the invoice data
            queryClient.invalidateQueries({ queryKey: ['issued-invoice', displayInvoice.id] })
          }}
        />

        {/* Edit Payment Allocation Modal */}
        <EditAllocationModal
          isOpen={isEditPaymentAllocationModalOpen}
          onClose={() => {
            setIsEditPaymentAllocationModalOpen(false)
            setEditingPaymentAllocation(null)
          }}
          onSuccess={async () => {
            // Refresh the payment allocations immediately
            try {
              const { getInvoicePaymentAllocations } = await import('../../lib/payments')
              const { data, error } = await getInvoicePaymentAllocations(displayInvoice.id)
              
              if (error) throw error
              setPayments(data || [])
            } catch (err: any) {
              console.error('Error refreshing payments:', err)
              // Also refresh the main invoice data to update amount_paid, balance_due, etc.
              queryClient.invalidateQueries({ queryKey: ["issued-invoice", displayInvoice.id] })            }
            
            // Close the modal
            setIsEditPaymentAllocationModalOpen(false)
            setEditingPaymentAllocation(null)
          }}
          allocation={editingPaymentAllocation}
          invoiceId={displayInvoice.id}
        />

        {/* Delete Payment Confirmation Dialog */}
        <Dialog open={!!deletePaymentConfirmation} onOpenChange={() => setDeletePaymentConfirmation(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Payment Allocation</DialogTitle>
              <DialogDescription>
                Are you sure you want to remove this payment allocation from the invoice?
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-gray-600">
                This will remove the payment from the invoice's total balance.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeletePaymentConfirmation(null)}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={async () => {
                  if (!deletePaymentConfirmation) return
                  
                  const { payment, invoiceId } = deletePaymentConfirmation
                  setDeletePaymentConfirmation(null)
                  
                  try {
                    const { deleteAllocation } = await import('../../lib/payments')
                    const { error } = await deleteAllocation(payment.payment_id, invoiceId)
                    
                    if (error) {
                      console.error('Error removing payment:', error)
                      toast({
                        title: 'Error',
                        description: 'Failed to remove payment allocation. Please try again.',
                        variant: 'destructive',
                      })
                      return
                    }
                    
                    // Refresh the payment allocations immediately
                    try {
                      const { getInvoicePaymentAllocations } = await import('../../lib/payments')
                      const { data, error } = await getInvoicePaymentAllocations(invoiceId)
                      
                      if (error) throw error
                      setPayments(data || [])
                    } catch (err: any) {
                      console.error('Error refreshing payments:', err)
                    }
                    
                    // Also refresh the invoice data
                    queryClient.invalidateQueries({ queryKey: ['issued-invoice', invoiceId] })
                    
                    toast({
                      title: 'Payment Removed',
                      description: `Payment allocation has been removed from this displayInvoice.`,
                    })
                  } catch (err) {
                    console.error('Error removing payment:', err)
                    toast({
                      title: 'Error',
                      description: 'Failed to remove payment allocation. Please try again.',
                      variant: 'destructive',
                    })
                  }
                }}
              >
                Remove Payment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      {/* Add Invoice Order Modal */}
      <AddInvoiceOrderModal
        invoiceId={displayInvoice.id}
        invoiceCurrency={displayInvoice.currency_code}
        isOpen={isAddInvoiceOrderModalOpen}
        onClose={() => setIsAddInvoiceOrderModalOpen(false)}
        onOrderAdded={async () => {
          // Refresh the invoice data
          await queryClient.invalidateQueries({ queryKey: ['issued-invoice', displayInvoice.id] })
          
          // Also update document caches if we have a document update callback (from documents page)
          if (onDocumentUpdate) {
            // Fetch the updated invoice data to get the new projects_text
            const { data: updatedInvoice } = await fetchIssuedInvoice(displayInvoice.id)
            if (updatedInvoice) {
              // Convert the updated invoice to document format
              const updatedDocument = {
                doc_id: updatedInvoice.id,
                direction: 'ar' as const,
                doc_kind: 'invoice' as const,
                doc_number: updatedInvoice.invoice_number,
                doc_date: updatedInvoice.invoice_date,
                currency_code: updatedInvoice.currency_code,
                subtotal_amount: updatedInvoice.subtotal_amount,
                vat_amount: updatedInvoice.vat_amount,
                total_amount: updatedInvoice.total_amount,
                status: updatedInvoice.status,
                from_team_id: updatedInvoice.issuer_team_id,
                from_team_name: updatedInvoice.issuer_team_name,
                to_team_id: updatedInvoice.payer_team_id,
                to_team_name: updatedInvoice.payer_team_name,
                balance_due: updatedInvoice.balance_due,
                projects_text: updatedInvoice.projects_text, // This should now include the new project
                created_at: updatedInvoice.created_at,
                updated_at: updatedInvoice.updated_at
              }
              onDocumentUpdate(updatedDocument)
            }
          }
        }}
      />

      {/* Add Credit Note Modal */}
      <AddCreditNoteModal
        invoiceId={displayInvoice.id}
        invoiceCurrency={displayInvoice.currency_code}
        invoiceNumber={displayInvoice.invoice_number}
        supplierTeamId={displayInvoice.issuer_team_id}
        supplierTeamName={displayInvoice.issuer_team_name}
        payerTeamId={displayInvoice.payer_team_id}
        payerTeamName={displayInvoice.payer_team_name}
        subtotalAmount={displayInvoice.subtotal_amount}
        vatRate={displayInvoice.vat_amount && displayInvoice.subtotal_amount ? (displayInvoice.vat_amount / displayInvoice.subtotal_amount) * 100 : 0}
        isOpen={isAddCreditNoteModalOpen}
        onClose={() => setIsAddCreditNoteModalOpen(false)}
        onCreditNoteAdded={async (creditNote) => {
          if (creditNote) {
            // Optimistically update the credit notes list
            setCreditNotes(prev => [creditNote, ...prev])
            
            // Update all caches for optimistic updates
            addCreditNoteToCaches(queryClient, creditNote)
          }
          
          // Also refresh the invoice data
          queryClient.invalidateQueries({ queryKey: ['issued-invoice', displayInvoice.id] })
        }}
      />

      {/* Edit Credit Note Modal */}
      <EditCreditNoteModal
        creditNote={editingCreditNote}
        isOpen={isEditCreditNoteModalOpen}
        onClose={() => {
          setIsEditCreditNoteModalOpen(false)
          setEditingCreditNote(null)
        }}
        onCreditNoteUpdated={async (updatedCreditNote) => {
          // Optimistically update the credit notes list
          setCreditNotes(prev => prev.map(cn => 
            cn.credit_note_id === updatedCreditNote.credit_note_id ? updatedCreditNote : cn
          ))
          
          // Update all caches for optimistic updates
          updateCreditNoteInCaches(queryClient, updatedCreditNote)
          
          // Also refresh the invoice data
          queryClient.invalidateQueries({ queryKey: ['issued-invoice', displayInvoice.id] })
        }}
      />

      {/* Edit Linked Order Modal */}
      <EditLinkedOrderModal
        linkedOrder={editingLinkedOrder}
        isOpen={isEditLinkedOrderModalOpen}
        onClose={() => {
          setIsEditLinkedOrderModalOpen(false)
          setEditingLinkedOrder(null)
        }}
        onOrderUpdated={() => {
          // Refresh the invoice data
          queryClient.invalidateQueries({ queryKey: ['issued-invoice', displayInvoice.id] })
        }}
      />

      {/* Unlink Confirmation Modal */}
      <Dialog open={!!unlinkConfirmation} onOpenChange={() => setUnlinkConfirmation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlink Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to unlink "{unlinkConfirmation?.orderName}" from this invoice?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              This will remove the connection but won't delete the invoice or order.
            </p>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setUnlinkConfirmation(null)}
              disabled={!!unlinkingOrderId}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={async () => {
                if (!unlinkConfirmation) return
                
                const { link, orderName } = unlinkConfirmation
                const orderId = link.invoice_order_id
                
                setUnlinkingOrderId(orderId)
                setUnlinkConfirmation(null)
                
                try {
                  const { error } = await unlinkInvoiceOrder(displayInvoice.id, orderId)
                  
                  if (error) {
                    console.error('Error unlinking order:', error)
                    toast({
                      title: 'Error',
                      description: 'Failed to unlink order. Please try again.',
                      variant: 'destructive',
                    })
                    return
                  }
                  
                  // Refresh the invoice data
                  queryClient.invalidateQueries({ queryKey: ['issued-invoice', displayInvoice.id] })
                  
                  toast({
                    title: 'Order Unlinked',
                    description: `"${orderName}" has been unlinked from this displayInvoice.`,
                  })
                } catch (err) {
                  console.error('Error unlinking order:', err)
                  toast({
                    title: 'Error',
                    description: 'Failed to unlink order. Please try again.',
                    variant: 'destructive',
                  })
                } finally {
                  setUnlinkingOrderId(null)
                }
              }}
              disabled={!!unlinkingOrderId}
            >
              {unlinkingOrderId ? 'Unlinking...' : 'Unlink Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Credit Note Confirmation Dialog */}
      <Dialog open={!!deleteCreditNoteConfirmation} onOpenChange={() => setDeleteCreditNoteConfirmation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Credit Note</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this credit note? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              This will permanently remove the credit note from the system.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCreditNoteConfirmation(null)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={async () => {
                if (!deleteCreditNoteConfirmation) return
                
                const { creditNote, invoiceId } = deleteCreditNoteConfirmation
                setDeleteCreditNoteConfirmation(null)
                
                try {
                  const { error } = await deleteCreditNote(creditNote.credit_note_id)
                  
                  if (error) {
                    console.error('Error deleting credit note:', error)
                    toast({
                      title: 'Error',
                      description: 'Failed to delete credit note. Please try again.',
                      variant: 'destructive',
                    })
                    return
                  }
                  
                  // Optimistically remove from the credit notes list
                  setCreditNotes(prev => prev.filter(cn => cn.credit_note_id !== creditNote.credit_note_id))
                  
                  // Remove from all caches
                  removeCreditNoteFromCaches(queryClient, creditNote.credit_note_id)
                  
                  // Also refresh the invoice data
                  queryClient.invalidateQueries({ queryKey: ['issued-invoice', invoiceId] })
                  
                  toast({
                    title: 'Credit Note Deleted',
                    description: `Credit note has been deleted successfully.`,
                  })
                } catch (err) {
                  console.error('Error deleting credit note:', err)
                  toast({
                    title: 'Error',
                    description: 'Failed to delete credit note. Please try again.',
                    variant: 'destructive',
                  })
                }
              }}
            >
              Delete Credit Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    )
  }


    // Main component view (when not in pane mode)
    return (
     <div className="flex h-screen bg-white" style={{ 
       marginRight: selectedInvoiceOrder ? '384px' : '0px'
     }}>
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  Invoice #{displayInvoice.invoice_number || displayInvoice.id}
                </h1>
                <p className="text-sm text-gray-500">
                  {formatCurrency(displayInvoice.total_amount, displayInvoice.currency_code)}
                </p>
              </div>
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
                  <DropdownMenuItem onClick={handleEditInvoice}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit Invoice
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleAddExistingPayment}>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Add Payment
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDeleteInvoice} className="text-red-600">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Invoice
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* This content is now handled by the pane view */}
                  <div className="text-center py-8 text-gray-500">
              Use the sections on the left to view invoice details, linked orders, billable tasks, invoice lines, and payments.
                  </div>
              </div>
            </div>
          </div>

      {/* Task Details Pane */}
      {currentSelectedTaskId && (
        <TaskDetailsPane
          taskId={currentSelectedTaskId}
          onClose={() => setCurrentSelectedTaskId(null)}
          isExpanded={isTaskDetailsExpanded}
          onExpand={() => setIsTaskDetailsExpanded(true)}
          onCollapse={() => setIsTaskDetailsExpanded(false)}
        />
          )}

      {/* Payment Creation Pane */}
      {isPaymentPaneOpen && (
        <div className="fixed inset-0 z-50 bg-white">
          <PaymentCreatePane
            onClose={() => setIsPaymentPaneOpen(false)}
            onPaymentCreated={handlePaymentCreated}
            fromInvoice={{
              invoiceId: displayInvoice.id,
              payerTeamId: displayInvoice.payer_team_id || 0,
              currency: displayInvoice.currency_code,
              suggestedAmount: getBalanceDue(displayInvoice!),
              openPaymentAfterCreate: true
            }}
          />
        </div>
      )}
    </div>
  )
}
