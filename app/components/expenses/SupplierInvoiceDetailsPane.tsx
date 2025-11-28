"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { getSupplierInvoiceDetails, getSupplierInvoicePDFSignedUrl, getInvoiceAllocations } from '../../lib/services/expenses'
import { Dropzone } from '../dropzone'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { toast } from '../ui/use-toast'
import { SupplierPaymentCreateModal } from './SupplierPaymentCreateModal'
import { SupplierCreditNoteCreateModal } from './SupplierCreditNoteCreateModal'
import { EditProductionOrderAllocationModal } from './EditProductionOrderAllocationModal'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { InvoiceOrderSelectionModal } from '../billing/InvoiceOrderSelectionModal'
import { AddSupplierPaymentModal } from '../billing/AddSupplierPaymentModal'
import { AddSupplierCreditNoteModal } from '../billing/AddSupplierCreditNoteModal'
import type { SupplierInvoiceList } from '../../lib/types/expenses'
import { EditableSupplierInvoiceFields } from './EditableSupplierInvoiceFields'
import { EditSupplierInvoiceModal } from './EditSupplierInvoiceModal'
import { EditSupplierAllocationModal } from './EditSupplierAllocationModal'
import { CreditCard, MoreHorizontal, Edit, Trash2, X } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'

interface SupplierInvoiceDetailsPaneProps {
  invoiceId: number
  onClose: () => void
  onInvoiceUpdate: (invoice: any) => void
  initialInvoice?: any
  onRelatedDocumentSelect?: (document: any, type: string) => void
  showHeader?: boolean
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

export function SupplierInvoiceDetailsPane({ invoiceId, onClose, onInvoiceUpdate, initialInvoice, onRelatedDocumentSelect, showHeader = false }: SupplierInvoiceDetailsPaneProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [pdfAttachments, setPdfAttachments] = useState<any[]>([])
  const [pdfSignedUrls, setPdfSignedUrls] = useState<{ [key: string]: string }>({})
  const [payments, setPayments] = useState<any[]>([])
  const [creditNotes, setCreditNotes] = useState<any[]>([])
  const [invoicedTasks, setInvoicedTasks] = useState<any[]>([])
  const [productionOrderAllocations, setProductionOrderAllocations] = useState<any[]>([])
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [isCreditNoteModalOpen, setIsCreditNoteModalOpen] = useState(false)
  const [editingAllocation, setEditingAllocation] = useState<any>(null)
  const [isEditAllocationModalOpen, setIsEditAllocationModalOpen] = useState(false)
  const [removeConfirmation, setRemoveConfirmation] = useState<{ allocation: any; periodMonth: string } | null>(null)
  const [isRemovingAllocation, setIsRemovingAllocation] = useState(false)
  const [isAddPOModalOpen, setIsAddPOModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingPaymentAllocation, setEditingPaymentAllocation] = useState<any>(null)
  const [isEditPaymentAllocationModalOpen, setIsEditPaymentAllocationModalOpen] = useState(false)
  const [deletePaymentConfirmation, setDeletePaymentConfirmation] = useState<{payment: any, invoiceId: number} | null>(null)
  const [deleteCreditNoteConfirmation, setDeleteCreditNoteConfirmation] = useState<{creditNote: any, invoiceId: number} | null>(null)
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()


  // Fetch invoice details
  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['supplier-invoice', invoiceId],
    queryFn: async () => {
      const { data, error } = await getSupplierInvoiceDetails(invoiceId)
      if (error) throw error
      return data
    },
    enabled: !!invoiceId,
    initialData: initialInvoice
  })

  // Local state for optimistic updates
  const [localInvoice, setLocalInvoice] = useState<any>(null)

  // Update local invoice when query data changes
  useEffect(() => {
    if (invoice) {
      setLocalInvoice(invoice)
    }
  }, [invoice])

  // Wrapper function to handle invoice updates
  const handleInvoiceUpdate = (updatedInvoice: any) => {
    // Merge with existing invoice data if it's a partial update
    const fullUpdatedInvoice = { ...invoice, ...updatedInvoice }
    
    // Update local state for optimistic UI
    setLocalInvoice(fullUpdatedInvoice)
    
    // Also update the query cache to ensure consistency
    queryClient.setQueryData(['supplier-invoice', invoiceId], fullUpdatedInvoice)
    
    // Call parent's onInvoiceUpdate
    onInvoiceUpdate(fullUpdatedInvoice)
  }

  // Update PDF attachments when invoice data changes
  useEffect(() => {
    if (invoice?.pdf_path) {
      const attachment = {
        id: 'pdf-1',
        file_name: invoice.pdf_path.split('/').pop() || 'invoice.pdf',
        file_path: invoice.pdf_path,
        uploaded_at: new Date().toISOString(),
        uploaded_by: null,
        mime_type: 'application/pdf',
        size: 0
      }
      setPdfAttachments([attachment])
      
      // Generate signed URL for the PDF
      getSupplierInvoicePDFSignedUrl(invoice.pdf_path).then(({ data: signedUrl, error }) => {
        if (signedUrl && !error) {
          setPdfSignedUrls({ 'pdf-1': signedUrl })
        }
      })
    } else {
      setPdfAttachments([])
      setPdfSignedUrls({})
    }
  }, [invoice?.pdf_path])

  // Fetch payments for this invoice
  useEffect(() => {
    if (invoiceId) {
      const fetchPayments = async () => {
        try {
          const { data, error } = await supabase
            .from('v_supplier_invoice_payments_min')
            .select('*')
            .eq('received_invoice_id', invoiceId)
          
          if (error) throw error
          setPayments(data || [])
        } catch (error) {
          console.error('Failed to fetch payments:', error)
        }
      }
      
      fetchPayments()
    }
  }, [invoiceId, supabase])

  // Fetch credit notes for this invoice
  useEffect(() => {
    if (invoiceId) {
      const fetchCreditNotes = async () => {
        try {
          const { data, error } = await supabase
            .from('v_received_credit_notes_summary')
            .select('*')
            .eq('received_invoice_id', invoiceId)
          
          if (error) throw error
          setCreditNotes(data || [])
        } catch (error) {
          console.error('Failed to fetch credit notes:', error)
        }
      }
      
      fetchCreditNotes()
    }
  }, [invoiceId, supabase])

  // Fetch invoiced tasks for this invoice
  useEffect(() => {
    if (invoiceId) {
      const fetchInvoicedTasks = async () => {
        try {
          const { data, error } = await supabase
            .from('v_received_invoice_tasks_min')
            .select('task_id, title, delivery_date, project_id, production_order_id, period_month, task_agreed_subtotal')
            .eq('received_invoice_id', invoiceId)
            .order('delivery_date', { ascending: false })
            .order('task_id', { ascending: true })
          
          if (error) throw error
          setInvoicedTasks(data || [])
        } catch (error) {
          console.error('Failed to fetch invoiced tasks:', error)
        }
      }
      
      fetchInvoicedTasks()
    }
  }, [invoiceId, supabase])

  // Calculate allocated subtotal and fully allocated status
  const allocatedSubtotal = useMemo(() => {
    return productionOrderAllocations.reduce((sum, allocation) => {
      return sum + (allocation.amount_subtotal_allocated || 0)
    }, 0)
  }, [productionOrderAllocations])

  const isFullyAllocated = useMemo(() => {
    if (!invoice) return false
    return Math.abs(allocatedSubtotal - invoice.subtotal_amount) < 0.01 // Within 1 cent
  }, [allocatedSubtotal, invoice])

  // Calculate credited amount from credit notes
  const creditedAmount = useMemo(() => {
    return creditNotes.reduce((sum, creditNote) => {
      return sum + (creditNote.subtotal_amount || 0)
    }, 0)
  }, [creditNotes])

  // Calculate credit notes total amount (with VAT)
  const creditNotesTotalAmount = useMemo(() => {
    return creditNotes.reduce((sum, creditNote) => {
      return sum + (creditNote.total_amount || 0)
    }, 0)
  }, [creditNotes])

  // Calculate balance due (subtract payments and credit notes total amount)
  const calculatedBalanceDue = useMemo(() => {
    if (!invoice) return 0
    const paymentsTotal = payments.reduce((sum, payment) => {
      return sum + (payment.amount_applied || 0)
    }, 0)
    return invoice.total_amount - paymentsTotal - creditNotesTotalAmount
  }, [invoice, payments, creditNotesTotalAmount])

  // Fetch production order allocations
  useEffect(() => {
    if (invoiceId) {
      const fetchAllocations = async () => {
        try {
          const data = await getInvoiceAllocations(invoiceId)
          setProductionOrderAllocations(data || [])
        } catch (error) {
          console.error('Failed to fetch production order allocations:', error)
          setProductionOrderAllocations([])
        }
      }
      
      fetchAllocations()
    }
  }, [invoiceId])

  // PDF upload handlers
  const handlePdfUpload = async (files: File[] | FileList) => {
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return
    
    const file = fileArray[0]
    if (file.type !== 'application/pdf') {
      toast({
        title: 'Error',
        description: 'Please upload a PDF file',
        variant: 'destructive',
      })
      return
    }
    
    try {
      setIsUploading(true)
      
      // Sanitize PDF name
      const sanitizePdfName = (name: string) => {
        const base = name?.trim() || '';
        const clean = base.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
        return clean.endsWith('.pdf') ? clean : `${clean}.pdf`;
      }
      
      const safeName = sanitizePdfName(file.name)
      const path = `${invoice.payer_team_id}/${invoiceId}/${safeName}`
      
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('supplier-invoices')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError
      
      // Update invoice with PDF path
      const { error: updateError } = await supabase
        .from('received_supplier_invoices')
        .update({
          pdf_path: path
        })
        .eq('id', invoiceId)

      if (updateError) throw updateError
      
      // Update local state and invalidate query to refresh
      onInvoiceUpdate({ ...invoice, pdf_path: path })
      queryClient.invalidateQueries({ queryKey: ['supplier-invoice', invoiceId] })
      
      toast({
        title: 'Success',
        description: 'PDF uploaded successfully',
      })
    } catch (error) {
      console.error('PDF upload error:', error)
      toast({
        title: 'Error',
        description: 'Failed to upload PDF',
        variant: 'destructive',
      })
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemovePdf = async () => {
    try {
      setIsUploading(true)
      
      // Remove from storage
      if (invoice.pdf_path) {
        const { error: deleteError } = await supabase.storage
          .from('supplier-invoices')
          .remove([invoice.pdf_path])
        
        if (deleteError) console.warn('Failed to delete PDF from storage:', deleteError)
      }
      
      // Update invoice to remove PDF path
      const { error: updateError } = await supabase
        .from('received_supplier_invoices')
        .update({
          pdf_path: null
        })
        .eq('id', invoiceId)

      if (updateError) throw updateError
      
      // Update local state
      onInvoiceUpdate({ ...invoice, pdf_path: null })
      
      toast({
        title: 'Success',
        description: 'PDF removed successfully',
      })
    } catch (error) {
      console.error('PDF removal error:', error)
      toast({
        title: 'Error',
        description: 'Failed to remove PDF',
        variant: 'destructive',
      })
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemoveAllocation = async () => {
    if (!removeConfirmation) return

    const { allocation } = removeConfirmation
    setIsRemovingAllocation(true)
    setRemoveConfirmation(null)

    try {
      const { error } = await supabase
        .from('received_invoice_allocations')
        .delete()
        .eq('id', allocation.id)

      if (error) throw error

      // Update local state
      setProductionOrderAllocations(prev => prev.filter(a => a.id !== allocation.id))

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['supplier-invoice', invoiceId] })

      toast({
        title: 'Success',
        description: 'Production order allocation removed successfully'
      })
    } catch (error: any) {
      console.error('Error removing allocation:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove allocation',
        variant: 'destructive'
      })
    } finally {
      setIsRemovingAllocation(false)
    }
  }

  const handlePOAdded = async (orders: any[], allocations?: Array<{ order_id: number; amount: number }>) => {
    if (!allocations || allocations.length === 0) {
      toast({
        title: 'Error',
        description: 'No production orders selected',
        variant: 'destructive'
      })
      return
    }

    try {
      // Create allocations in the database
      const allocationRecords = allocations.map(alloc => ({
        received_invoice_id: invoiceId,
        production_order_id: alloc.order_id,
        amount_subtotal_allocated: alloc.amount
      }))

      const { error } = await supabase
        .from('received_invoice_allocations')
        .insert(allocationRecords)

      if (error) throw error

      // Refresh allocations
      const data = await getInvoiceAllocations(invoiceId)
      setProductionOrderAllocations(data || [])
      
      // Invalidate invoice query to refresh totals
      queryClient.invalidateQueries({ queryKey: ['supplier-invoice', invoiceId] })
      
      toast({
        title: 'Success',
        description: `${allocations.length} production order(s) added to invoice`
      })

      setIsAddPOModalOpen(false)
    } catch (error: any) {
      console.error('Failed to add production orders:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to add production orders',
        variant: 'destructive'
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500">
        Loading invoice details...
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="flex items-center justify-center h-32 text-red-500">
        Error loading invoice details.
      </div>
    )
  }

  const canCreatePayments = true
  const canCreateCreditNotes = true
  const canAllocateToOrders = true

  // Handlers for footer buttons
  const handleEditInvoice = () => {
    setIsEditModalOpen(true)
  }

  const handleRecordPayment = () => {
    setIsPaymentModalOpen(true)
  }

  const canRecordPayment = (invoice: any) => {
    return invoice && invoice.status !== 'void' && canCreatePayments
  }


  return (
    <div className="flex-1 overflow-auto">
      {showHeader && (
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">
            AP Invoice #{invoice?.invoice_number || invoice?.id}
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
                <DropdownMenuItem onClick={handleRecordPayment}>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Add Payment
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {}} className="text-red-600">
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
      <div className="p-4">
        <div className="max-w-4xl mx-auto space-y-6 pb-20">

        {/* Invoice Details */}
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-3">Invoice Details</h3>
          <div className="space-y-2">
            {(() => {
              const editableFields = EditableSupplierInvoiceFields({ invoice, onInvoiceUpdate: handleInvoiceUpdate })
              return (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-gray-500">Invoice Number</span>
                    <div className="flex-1 max-w-[200px]">{editableFields.invoiceNumber}</div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-gray-500">Invoice Date</span>
                    <div className="flex-1 max-w-[200px]">{editableFields.invoiceDate}</div>
                  </div>
                </>
              )
            })()}
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500">Status</span>
              <Badge variant={getStatusBadgeVariant(invoice.status)}>
                {invoice.status?.replace('_', ' ') || 'Unknown'}
              </Badge>
            </div>
            {(() => {
              const editableFields = EditableSupplierInvoiceFields({ invoice, onInvoiceUpdate: handleInvoiceUpdate })
              return (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-gray-500">Supplier</span>
                    <div className="flex-1 max-w-[200px]">{editableFields.supplier}</div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-gray-500">Payer</span>
                    <div className="flex-1 max-w-[200px]">{editableFields.payer}</div>
                  </div>
                </>
              )
            })()}
            <div className="flex justify-between items-start">
              <span className="text-xs font-medium text-gray-500">Projects</span>
              <div className="text-right">
                {invoice.projects_text ? (
                  <div className="flex flex-wrap gap-1 justify-end">
                    {invoice.projects_text.split(',').map((project: string, idx: number) => (
                      <span key={idx} className="inline-block px-2 py-1 text-xs rounded bg-gray-100 text-gray-700">
                        {project.trim()}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">—</span>
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
              <span className="text-xs font-medium text-gray-500">Subtotal (no VAT)</span>
              <div className="flex-1 max-w-[200px]">
                {(() => {
                  const editableFields = EditableSupplierInvoiceFields({ invoice, onInvoiceUpdate: handleInvoiceUpdate })
                  return editableFields.subtotal
                })()}
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500">VAT</span>
              <span className="text-sm text-gray-900">{formatCurrency(invoice.vat_amount, invoice.currency_code)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500">Total</span>
              <div className="flex-1 max-w-[200px]">
                {(() => {
                  const editableFields = EditableSupplierInvoiceFields({ invoice, onInvoiceUpdate: handleInvoiceUpdate })
                  return editableFields.total
                })()}
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500">Production orders (no VAT)</span>
              <span className="text-sm text-gray-900">{formatCurrency(allocatedSubtotal, invoice.currency_code)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500">Fully Allocated</span>
              <span className={`text-sm font-medium ${isFullyAllocated ? 'text-green-600' : 'text-red-600'}`}>
                {isFullyAllocated ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500">Paid (with VAT)</span>
              <span className="text-sm text-gray-900">{formatCurrency(invoice.amount_paid, invoice.currency_code)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500">Credited (no VAT)</span>
              <span className="text-sm text-gray-900">{formatCurrency(creditedAmount, invoice.currency_code)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500">Balance (with VAT)</span>
              <span className={`text-sm font-medium ${Math.abs(calculatedBalanceDue) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(calculatedBalanceDue, invoice.currency_code)}
              </span>
            </div>
          </div>
        </div>

        {/* Production Orders Section */}
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-3">Production orders</h3>
          <div className="space-y-2">
            {productionOrderAllocations && productionOrderAllocations.length > 0 ? (
              <>
                {productionOrderAllocations.map((allocation: any) => {
                  const order = allocation.production_orders
                  const allocatedAmount = allocation.amount_subtotal_allocated
                  const periodMonth = order.period_month ? formatDate(order.period_month) : '-'
                  return (
                    <div 
                      key={allocation.id} 
                      className="flex justify-between items-center py-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => {
                        if (onRelatedDocumentSelect && order) {
                          onRelatedDocumentSelect(order, 'production_order')
                        }
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900">
                          Period: {periodMonth}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Subtotal allocated: {formatCurrency(allocatedAmount, order.currency_code)}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingAllocation(allocation)
                            setIsEditAllocationModalOpen(true)
                          }}
                          className="text-xs text-gray-600 hover:text-gray-900"
                        >
                          edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setRemoveConfirmation({ allocation, periodMonth })
                          }}
                          className="text-xs text-gray-600 hover:text-gray-900"
                        >
                          remove
                        </button>
                      </div>
                    </div>
                  )
                })}
                
                {/* Add Production Order Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddPOModalOpen(true)}
                  className="w-full mt-2"
                >
                  Add Production Order
                </Button>
              </>
            ) : (
              <>
                <div className="text-sm text-gray-500 py-2">
                  No production orders allocated
                </div>
                
                {/* Add Production Order Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddPOModalOpen(true)}
                  className="w-full mt-2"
                >
                  Add Production Order
                </Button>
              </>
            )}
          </div>
        </div>

        {/* PDF Section */}
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-3">Invoice PDF</h3>
          <Dropzone
            tableName="received_supplier_invoices"
            recordId={invoiceId}
            bucketName="supplier-invoices"
            attachments={pdfAttachments}
            signedUrls={pdfSignedUrls}
            isUploading={isUploading}
            uploadError={null}
            uploadFiles={handlePdfUpload}
            deleteAttachment={handleRemovePdf}
            className="min-h-[120px]"
          />
        </div>

        {/* Payments Section */}
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-3">Payments</h3>
          {payments.length > 0 ? (
            <>
              <div className="space-y-2">
                {payments.map((payment, index) => (
                  <div 
                    key={index} 
                    className="flex justify-between items-center py-2 border-b border-gray-100 cursor-pointer hover:bg-gray-50"
                    onClick={() => {
                      // Open supplier payment details pane in third pane
                      if (onRelatedDocumentSelect) {
                        onRelatedDocumentSelect({
                          // Document structure fields
                          id: payment.payment_id,
                          payment_id: payment.payment_id,
                          doc_id: payment.payment_id,
                          doc_kind: 'payment',
                          direction: 'ap',
                          doc_number: `PAY-${payment.payment_id}`,
                          doc_date: payment.payment_date,
                          from_team_name: payment.from_team_name,
                          to_team_name: payment.to_team_name,
                          subtotal_amount: payment.amount_applied,
                          vat_amount: 0,
                          total_amount: payment.amount_applied,
                          currency_code: payment.payment_currency,
                          status: payment.payment_status,
                          
                          // Payment structure fields for PaymentDetailsPane
                          payer_team_id: payment.from_team_id,
                          payer_team_name: payment.from_team_name,
                          paid_to_team_id: payment.to_team_id,
                          paid_to_team_name: payment.to_team_name,
                          payment_date: payment.payment_date,
                          payment_amount: payment.amount_applied,
                          payment_currency: payment.payment_currency,
                          amount_allocated: payment.amount_applied,
                          unallocated_amount: 0,
                          is_overallocated: false,
                          created_at: payment.created_at,
                          updated_at: payment.updated_at
                        }, 'supplier_payment')
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
                          setDeletePaymentConfirmation({ payment, invoiceId: invoice.id })
                        }}
                        className="text-xs text-gray-600 hover:text-gray-900"
                      >
                        remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPaymentModalOpen(true)}
                className="w-full mt-2"
              >
                Add Payment
              </Button>
            </>
          ) : (
            <>
              <div className="text-center py-4 text-gray-500 text-sm">
                No payments found
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPaymentModalOpen(true)}
                className="w-full mt-2"
              >
                Add Payment
              </Button>
            </>
          )}
        </div>

        {/* Credit Notes Section */}
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-3">Credit Notes</h3>
          {creditNotes.length > 0 ? (
            <>
              <div className="space-y-2">
                {creditNotes.map((creditNote, index) => (
                  <div 
                    key={index} 
                    className="flex justify-between items-center py-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      // Open credit note details pane in third pane
                      if (onRelatedDocumentSelect) {
                        onRelatedDocumentSelect({
                          // Document structure fields
                          id: creditNote.credit_note_id,
                          credit_note_id: creditNote.credit_note_id,
                          doc_id: creditNote.credit_note_id,
                          doc_kind: 'credit_note',
                          direction: 'ap',
                          doc_number: creditNote.credit_number,
                          doc_date: creditNote.credit_date,
                          from_team_name: creditNote.supplier_team_name,
                          to_team_name: creditNote.payer_team_name,
                          subtotal_amount: creditNote.subtotal_amount,
                          vat_amount: creditNote.vat_amount,
                          total_amount: creditNote.total_amount,
                          currency_code: creditNote.currency_code,
                          status: creditNote.status,
                          
                          // Credit note structure fields
                          credit_number: creditNote.credit_number,
                          credit_date: creditNote.credit_date,
                          reason: creditNote.reason,
                          notes: creditNote.notes,
                          supplier_team_id: creditNote.supplier_team_id,
                          supplier_team_name: creditNote.supplier_team_name,
                          payer_team_id: creditNote.payer_team_id,
                          payer_team_name: creditNote.payer_team_name,
                          created_at: creditNote.created_at,
                          updated_at: creditNote.updated_at
                        }, 'credit_note')
                      }
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900">
                        {formatCurrency(creditNote.total_amount, creditNote.currency_code)}
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
                          setDeleteCreditNoteConfirmation({ creditNote, invoiceId: invoice.id })
                        }}
                        className="text-xs text-gray-600 hover:text-gray-900"
                      >
                        remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreditNoteModalOpen(true)}
                className="w-full mt-2"
              >
                Add Credit Note
              </Button>
            </>
          ) : (
            <>
              <div className="text-center py-4 text-gray-500 text-sm">
                No credit notes found
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreditNoteModalOpen(true)}
                className="w-full mt-2"
              >
                Add Credit Note
              </Button>
            </>
          )}
        </div>

        {/* Tasks Section */}
        <div className="mb-12">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Tasks</h3>
          <div className="space-y-2">
            {invoicedTasks.length > 0 ? (
              invoicedTasks.map((task, index) => (
                <div 
                  key={task.task_id} 
                  className={`flex items-center justify-between py-2 ${index !== invoicedTasks.length - 1 ? 'border-b border-gray-200' : ''}`}
                >
                  {/* Left side - Title with icon */}
                  <div className="flex items-center space-x-1 flex-1 min-w-0 pr-4">
                    <span 
                      className="text-sm text-gray-900 truncate cursor-pointer underline-offset-4 hover:underline"
                      onClick={() => {
                        // Open task details pane in third pane
                        if (onRelatedDocumentSelect) {
                        onRelatedDocumentSelect({
                          // Pass the raw task data from v_received_invoice_tasks_min
                          task_id: task.task_id,
                          title: task.title,
                          delivery_date: task.delivery_date,
                          project_id: task.project_id,
                          production_order_id: task.production_order_id,
                          period_month: task.period_month,
                          task_agreed_subtotal: task.task_agreed_subtotal,
                          // Additional fields for context
                          id: task.task_id,
                          doc_id: task.task_id,
                          doc_kind: 'task',
                          direction: 'ar',
                          doc_number: `TASK-${task.task_id}`,
                          doc_date: task.delivery_date
                        }, 'task')
                        }
                      }}
                    >
                      {task.title}
                    </span>
                    <svg 
                      className="w-4 h-4 text-gray-400 flex-shrink-0" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  
                  {/* Right side - Amount */}
                  <div className="text-sm text-gray-900 font-medium">
                    {formatCurrency(task.task_agreed_subtotal || 0, invoice?.currency_code || 'EUR')}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-gray-500">No tasks found</div>
            )}
          </div>
        </div>


        {/* Metadata */}
        <div className="pt-4 border-t border-gray-200">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Timestamps</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500">Created</span>
              <span className="text-sm text-gray-900">{formatDate(invoice.created_at)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500">Updated</span>
              <span className="text-sm text-gray-900">{formatDate(invoice.updated_at)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute left-0 right-0 p-4 border-t border-gray-200 bg-white flex-shrink-0 z-50" style={{ bottom: '0px' }}>
        <div className="flex space-x-2">
          <Button
            onClick={handleEditInvoice}
            className="w-1/2 bg-white text-black border border-gray-300 hover:bg-gray-50 rounded-none"
          >
            Edit Invoice
          </Button>
          {canRecordPayment(invoice) ? (
            <Button
              onClick={handleRecordPayment}
              className="w-1/2 bg-black text-white hover:bg-gray-800 rounded-none"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Record payment
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

      {/* Modals */}
      {invoice && (
        <>
          <AddSupplierPaymentModal
            invoiceId={invoice.id}
            invoiceCurrency={invoice.currency_code}
            invoiceNumber={invoice.invoice_number}
            payerTeamId={invoice.payer_team_id}
            payerTeamName={invoice.payer_team_name}
            paidToTeamId={invoice.supplier_team_id}
            paidToTeamName={invoice.supplier_team_name}
            balanceDue={calculatedBalanceDue}
            subtotalAmount={invoice.subtotal_amount}
            isOpen={isPaymentModalOpen}
            onClose={() => setIsPaymentModalOpen(false)}
            onPaymentAdded={async () => {
              // Refresh payments list
              try {
                const { data, error } = await supabase
                  .from('v_supplier_invoice_payments_min')
                  .select('*')
                  .eq('received_invoice_id', invoiceId)
                
                if (error) throw error
                setPayments(data || [])
                
                // Invalidate invoice query to refresh totals
                queryClient.invalidateQueries({ queryKey: ['supplier-invoice', invoiceId] })
              } catch (error) {
                console.error('Failed to refresh payments:', error)
              }
            }}
          />

          <AddSupplierCreditNoteModal
            invoiceId={invoice.id}
            invoiceCurrency={invoice.currency_code}
            invoiceNumber={invoice.invoice_number}
            supplierTeamId={invoice.supplier_team_id}
            supplierTeamName={invoice.supplier_team_name}
            payerTeamId={invoice.payer_team_id}
            payerTeamName={invoice.payer_team_name}
            subtotalAmount={invoice.subtotal_amount}
            vatRate={invoice.vat_amount && invoice.subtotal_amount ? (invoice.vat_amount / invoice.subtotal_amount) * 100 : 0}
            isOpen={isCreditNoteModalOpen}
            onClose={() => setIsCreditNoteModalOpen(false)}
            onCreditNoteAdded={async () => {
              // Refresh credit notes list
              try {
                const { data, error } = await supabase
                  .from('v_received_credit_notes_summary')
                  .select('*')
                  .eq('received_invoice_id', invoiceId)
                
                if (error) throw error
                setCreditNotes(data || [])
                
                // Invalidate invoice query to refresh totals
                queryClient.invalidateQueries({ queryKey: ['supplier-invoice', invoiceId] })
              } catch (error) {
                console.error('Failed to fetch credit notes:', error)
              }
            }}
          />
        </>
      )}

      {/* Edit Production Order Allocation Modal */}
      <EditProductionOrderAllocationModal
        allocation={editingAllocation}
        isOpen={isEditAllocationModalOpen}
        onClose={() => {
          setIsEditAllocationModalOpen(false)
          setEditingAllocation(null)
        }}
        onAllocationUpdated={async () => {
          // Refresh allocations
          try {
            const data = await getInvoiceAllocations(invoiceId)
            setProductionOrderAllocations(data || [])
          } catch (error) {
            console.error('Failed to refresh allocations:', error)
          }
          // Invalidate invoice query to refresh totals
          queryClient.invalidateQueries({ queryKey: ['supplier-invoice', invoiceId] })
        }}
      />

      {/* Remove Production Order Confirmation Modal */}
      <Dialog open={!!removeConfirmation} onOpenChange={() => setRemoveConfirmation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Production Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove the production order for "{removeConfirmation?.periodMonth}" from this invoice?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              This will remove the allocation but won't delete the invoice or production order.
            </p>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setRemoveConfirmation(null)}
              disabled={isRemovingAllocation}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleRemoveAllocation}
              disabled={isRemovingAllocation}
            >
              {isRemovingAllocation ? 'Removing...' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Production Order Modal */}
      {invoice && (
        <InvoiceOrderSelectionModal
          isOpen={isAddPOModalOpen}
          onClose={() => setIsAddPOModalOpen(false)}
          onBack={() => setIsAddPOModalOpen(false)}
          onOrdersSelected={handlePOAdded}
          payerTeamId={invoice.payer_team_id}
          issuerTeamId={invoice.supplier_team_id}
          invoiceId={invoice.id}
          isAR={false}
        />
      )}

      {/* Edit Payment Allocation Modal */}
      <EditSupplierAllocationModal
        isOpen={isEditPaymentAllocationModalOpen}
        onClose={() => {
          setIsEditPaymentAllocationModalOpen(false)
          setEditingPaymentAllocation(null)
        }}
        onSuccess={async () => {
          // Refresh the payment allocations immediately
          try {
            const { data, error } = await supabase
              .from('v_supplier_invoice_payments_min')
              .select('*')
              .eq('received_invoice_id', invoiceId)
            
            if (error) throw error
            setPayments(data || [])
          } catch (err: any) {
            console.error('Error refreshing payments:', err)
          }
          
          // Also refresh the invoice data
          queryClient.invalidateQueries({ queryKey: ['supplier-invoice', invoiceId] })
          
          // Close the modal
          setIsEditPaymentAllocationModalOpen(false)
          setEditingPaymentAllocation(null)
        }}
        allocation={editingPaymentAllocation}
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
                  // Delete the payment allocation from supplier_payment_allocations table
                  const { error: deleteError } = await supabase
                    .from('supplier_payment_allocations')
                    .delete()
                    .eq('payment_id', payment.payment_id)
                    .eq('received_invoice_id', invoiceId)
                  
                  if (deleteError) {
                    console.error('Error removing payment allocation:', deleteError)
                    toast({
                      title: 'Error',
                      description: 'Failed to remove payment allocation. Please try again.',
                      variant: 'destructive',
                    })
                    return
                  }
                  
                  // Refresh the payment data
                  const { data, error } = await supabase
                    .from('v_supplier_invoice_payments_min')
                    .select('*')
                    .eq('received_invoice_id', invoiceId)
                  
                  if (error) throw error
                  setPayments(data || [])
                  
                  // Also refresh the invoice data
                  queryClient.invalidateQueries({ queryKey: ['supplier-invoice', invoiceId] })
                  
                  toast({
                    title: 'Payment Removed',
                    description: `Payment allocation has been removed from this invoice.`,
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

      {/* Edit Invoice Modal */}
      <EditSupplierInvoiceModal
        invoice={invoice}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onInvoiceUpdated={(updatedInvoice) => {
          onInvoiceUpdate(updatedInvoice)
          queryClient.invalidateQueries({ queryKey: ['supplier-invoice', invoiceId] })
        }}
      />

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
              This will permanently delete the credit note from the system.
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
                  // Delete the credit note from received_credit_notes table
                  const { error: deleteError } = await supabase
                    .from('received_credit_notes')
                    .delete()
                    .eq('id', creditNote.credit_note_id)
                  
                  if (deleteError) {
                    console.error('Error removing credit note:', deleteError)
                    toast({
                      title: 'Error',
                      description: 'Failed to remove credit note. Please try again.',
                      variant: 'destructive',
                    })
                    return
                  }
                  
                  // Refresh the credit note data
                  const { data, error } = await supabase
                    .from('v_received_credit_notes_summary')
                    .select('*')
                    .eq('received_invoice_id', invoiceId)
                  
                  if (error) throw error
                  setCreditNotes(data || [])
                  
                  // Also refresh the invoice data
                  queryClient.invalidateQueries({ queryKey: ['supplier-invoice', invoiceId] })
                  
                  toast({
                    title: 'Credit Note Removed',
                    description: `Credit note has been removed from this invoice.`,
                  })
                } catch (err) {
                  console.error('Error removing credit note:', err)
                  toast({
                    title: 'Error',
                    description: 'Failed to remove credit note. Please try again.',
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
    </div>
  )
} 