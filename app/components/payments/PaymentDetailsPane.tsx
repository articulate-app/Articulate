"use client"

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Plus, X, Edit, MoreHorizontal, CreditCard } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Badge } from '../ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { toast } from '../ui/use-toast'
import { 
  getPaymentSummary, 
  getPaymentAllocations,
  replacePaymentAllocations, 
  deletePayment,
  deleteAllocation 
} from '../../lib/payments'
import { getSupplierPaymentSummary, deleteSupplierPayment } from '../../lib/services/expenses'
import { PaymentCreateModal } from './PaymentCreateModal'
import EditAllocationModal from '../billing/EditAllocationModal'
import { updatePaymentInCaches } from './payment-cache-utils'
import type { PaymentSummary, PaymentAllocation } from '../../lib/types/billing'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { SharedInvoiceCreateModal } from '../documents/SharedInvoiceCreateModal'
import { AddExistingInvoiceToPaymentModal } from './AddExistingInvoiceToPaymentModal'

interface PaymentDetailsPaneProps {
  paymentId: number
  initialPayment?: any // Preloaded payment data from the list (can be AR or AP)
  direction?: 'ar' | 'ap'
  onClose: () => void
  onPaymentUpdate: (payment: any) => void
  onPaymentDelete: (paymentId: number) => void
  onOpenInvoice?: (invoiceId: number) => void
  onRelatedDocumentSelect?: (document: any, type: string) => void
  showHeader?: boolean
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

export function PaymentDetailsPane({ paymentId, initialPayment, direction = 'ar', onClose, onPaymentUpdate, onPaymentDelete, onOpenInvoice, onRelatedDocumentSelect, showHeader = false }: PaymentDetailsPaneProps) {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [localPayment, setLocalPayment] = useState<Partial<PaymentSummary>>({})
  const [allocations, setAllocations] = useState<any[]>([])
  const [existingAllocations, setExistingAllocations] = useState<any[]>([])
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null)
  const [allocationAmount, setAllocationAmount] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false)
  const [isEditAllocationModalOpen, setIsEditAllocationModalOpen] = useState(false)
  const [selectedAllocation, setSelectedAllocation] = useState<any>(null)
  const [showInvoiceOptionsModal, setShowInvoiceOptionsModal] = useState(false)
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false)
  const [showSelectInvoiceModal, setShowSelectInvoiceModal] = useState(false)
  const [showDeleteAllocationConfirm, setShowDeleteAllocationConfirm] = useState(false)
  const [allocationToDelete, setAllocationToDelete] = useState<any>(null)

  // Use initial payment data if available, otherwise fetch
  const { data: payment, isLoading: isLoadingPayment, error, refetch } = useQuery<any>({
    queryKey: ['payment', paymentId, direction],
    queryFn: async () => {
      if (direction === 'ap') {
        const { data, error } = await getSupplierPaymentSummary(paymentId)
        if (error) throw new Error(error.message || 'Failed to load payment')
        return data!
      } else {
        const { data, error } = await getPaymentSummary(paymentId)
        if (error) throw new Error(error.message || 'Failed to load payment')
        return data!
      }
    },
    enabled: !!paymentId && !initialPayment, // Only fetch if we don't have initial data
    initialData: initialPayment, // Use the preloaded data
  })

  // Fetch open invoices when payment changes
  useEffect(() => {
    if (payment) {
      console.log('[PaymentDetailsPane] payment changed, updating localPayment:', payment);
      setLocalPayment(payment)
      // Fetch allocations separately
      fetchAllocations()
    }
  }, [payment])

  // Update localPayment when initialPayment changes (from document updates)
  useEffect(() => {
    if (initialPayment) {
      setLocalPayment(prev => ({
        ...prev,
        ...initialPayment, // Merge all fields from initialPayment
      }))
    }
  }, [initialPayment])

  // Fetch allocations for the payment
  const fetchAllocations = async () => {
    if (!payment) return
    
    try {
      if (direction === 'ap') {
        // For AP payments, fetch from v_supplier_invoice_payments_min
        const { data, error } = await supabase
          .from('v_supplier_invoice_payments_min')
          .select('*')
          .eq('payment_id', payment.payment_id)
        
        if (error) throw error
        setExistingAllocations(data || [])
        
        // Calculate total allocated amount for AP payments
        const totalAllocated = (data && data.length > 0) 
          ? data.reduce((sum, alloc) => sum + (alloc.amount_applied || 0), 0) 
          : 0
        
        const updatedPayment = {
          ...payment,
          amount_allocated: totalAllocated,
          unallocated_amount: payment.payment_amount - totalAllocated,
          is_overallocated: (payment.payment_amount - totalAllocated) < 0
        }
        setLocalPayment(updatedPayment)
      } else {
        // For AR payments, use existing function
        const { data, error } = await getPaymentAllocations(payment.payment_id)
        if (error) throw error
        setExistingAllocations(data || [])
      }
    } catch (error) {
      console.error('Error fetching allocations:', error)
    }
  }


  // Helper function to update payment summary optimistically
  const updatePaymentSummaryOptimistically = (operation: 'add' | 'remove', allocationAmount: number) => {
    if (!payment) return
    
    const currentAmountAllocated = payment.amount_allocated || 0
    const currentUnallocatedAmount = payment.unallocated_amount || 0
    
    let newAmountAllocated: number
    let newUnallocatedAmount: number
    
    if (operation === 'add') {
      newAmountAllocated = currentAmountAllocated + allocationAmount
      newUnallocatedAmount = Math.max(0, currentUnallocatedAmount - allocationAmount)
    } else {
      newAmountAllocated = Math.max(0, currentAmountAllocated - allocationAmount)
      newUnallocatedAmount = currentUnallocatedAmount + allocationAmount
    }
    
    const updatedPayment = {
      ...payment,
      amount_allocated: newAmountAllocated,
      unallocated_amount: newUnallocatedAmount,
      is_overallocated: newUnallocatedAmount < 0
    }
    
    // Update local state immediately
    setLocalPayment(updatedPayment)
    
    // Update caches for optimistic updates
    updatePaymentInCaches(queryClient, updatedPayment)
    
    // Dispatch event to notify other components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('payment-summary-updated', { 
        detail: { paymentId: payment.payment_id, updatedPayment } 
      }))
    }
  }

  const initiateDeleteAllocation = (allocation: any) => {
    setAllocationToDelete(allocation)
    setShowDeleteAllocationConfirm(true)
  }

  const confirmDeleteAllocation = async () => {
    if (!allocationToDelete) return

    // Extract invoice ID correctly based on direction and data structure
    let invoiceId: number
    if (direction === 'ap') {
      invoiceId = allocationToDelete.received_invoice_id
    } else {
      // For AR, the data from getPaymentAllocations uses 'invoice_id' field
      invoiceId = allocationToDelete.invoice_id || allocationToDelete.issued_invoice_id
    }

    if (!invoiceId) {
      toast({
        title: 'Error',
        description: 'Invoice ID not found',
        variant: 'destructive',
      })
      return
    }

    const allocationAmount = allocationToDelete.amount_applied || allocationToDelete.amount_allocated || 0

    try {
      setIsLoading(true)
      
      // Optimistically update the payment summary
      updatePaymentSummaryOptimistically('remove', allocationAmount)
      
      if (direction === 'ap') {
        // For AP payments, delete from supplier_payment_allocations
        const { error } = await supabase
          .from('supplier_payment_allocations')
          .delete()
          .eq('payment_id', paymentId)
          .eq('received_invoice_id', invoiceId)
        
        if (error) throw error
        
        // Update local allocations state for AP
        setExistingAllocations(prev => prev.filter(a => a.received_invoice_id !== invoiceId))
      } else {
        // For AR payments, use existing function
        const { error } = await deleteAllocation(paymentId, invoiceId)
        if (error) throw error
        
        // Update local allocations state for AR (check both field names)
        setExistingAllocations(prev => prev.filter(a => 
          a.invoice_id !== invoiceId && a.issued_invoice_id !== invoiceId
        ))
      }
      
      // Refresh allocations to recalculate totals
      await fetchAllocations()
      
      toast({
        title: 'Success',
        description: 'Allocation deleted successfully',
      })
    } catch (error) {
      console.error('Failed to delete allocation:', error)
      
      // Rollback optimistic update on error
      updatePaymentSummaryOptimistically('add', allocationAmount)
      
      toast({
        title: 'Error',
        description: 'Failed to delete allocation',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
      setShowDeleteAllocationConfirm(false)
      setAllocationToDelete(null)
    }
  }


  const handleSavePayment = async () => {
    if (!payment) return
    
    setIsLoading(true)
    try {
      // For now, we'll just update the local state
      // In a real implementation, you'd call an update API
      const updatedPayment = { ...payment, ...localPayment }
      onPaymentUpdate(updatedPayment)
      setIsEditing(false)
      toast({
        title: 'Success',
        description: 'Payment updated successfully',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update payment',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeletePayment = () => {
    setShowDeleteConfirmation(true)
  }

  const confirmDeletePayment = async () => {
    if (!payment) return

    setIsLoading(true)
    try {
      if (direction === 'ap') {
        await deleteSupplierPayment(payment.payment_id)
      } else {
        await deletePayment(payment.payment_id)
      }
      // Let the parent component handle the deletion with optimistic updates
      onPaymentDelete(payment.payment_id)
      onClose()
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete payment',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
      setShowDeleteConfirmation(false)
    }
  }

  const handleAddAllocation = () => {
    if (!selectedInvoiceId || !allocationAmount) return
    
    const amount = parseFloat(allocationAmount)
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'Error',
        description: 'Please enter a valid amount',
        variant: 'destructive',
      })
      return
    }

    const newAllocation = {
      issued_invoice_id: selectedInvoiceId,
      amount_applied: amount,
    }

    setAllocations(prev => [...prev, newAllocation])
    setSelectedInvoiceId(null)
    setAllocationAmount('')
  }

  const handleRemoveAllocation = (index: number) => {
    setAllocations(prev => prev.filter((_, i) => i !== index))
  }

  const handleSaveAllocations = async () => {
    if (!payment) return
    
    setIsLoading(true)
    try {
      // Calculate total allocation amount for optimistic update
      const totalAllocationAmount = allocations.reduce((sum, allocation) => sum + allocation.amount_applied, 0)
      
      // Optimistically update the payment summary
      updatePaymentSummaryOptimistically('add', totalAllocationAmount)
      
      const { error } = await replacePaymentAllocations(payment.payment_id, allocations)
      if (error) throw error
      
      // Refresh payment data
      await refetch()
      setAllocations([])
      toast({
        title: 'Success',
        description: 'Allocations updated successfully',
      })
    } catch (error) {
      // Rollback optimistic update on error
      const totalAllocationAmount = allocations.reduce((sum, allocation) => sum + allocation.amount_applied, 0)
      updatePaymentSummaryOptimistically('remove', totalAllocationAmount)
      
      toast({
        title: 'Error',
        description: 'Failed to update allocations',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoadingPayment) {
    return (
      <div className="flex-1 overflow-auto p-4">
        <div className="flex items-center justify-center h-32 text-gray-500">Loading...</div>
      </div>
    )
  }

  if (error || !payment) {
    return (
      <div className="flex-1 overflow-auto p-4">
        <div className="flex items-center justify-center h-32 text-red-500">Error loading payment</div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      {showHeader && (
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">
            {direction === 'ar' ? 'AR' : 'AP'} Payment #{payment.payment_id}
          </h2>
          <div className="flex items-center space-x-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Payment
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowInvoiceOptionsModal(true)}>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Add Invoice
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {}} className="text-red-600">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Payment
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
      <div className="p-4 space-y-6">

      {/* Payment Summary */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">Summary</h3>
        <div className="bg-white space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500">Payment ID</span>
            <span className="text-sm text-gray-900">{payment.payment_id}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500">Payment Date</span>
            <span className="text-sm text-gray-900">{formatDate(localPayment.payment_date || payment.payment_date)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500">Amount</span>
            <span className="text-sm text-gray-900">{formatCurrency(localPayment.payment_amount || payment.payment_amount, localPayment.payment_currency || payment.payment_currency)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500">Currency</span>
            <span className="text-sm text-gray-900">{localPayment.payment_currency || payment.payment_currency}</span>
          </div>
          <div className="flex justify-between items-start">
            <span className="text-xs font-medium text-gray-500">From</span>
            <span className="text-sm text-gray-900 text-right">{localPayment.payer_team_name || payment?.payer_team_name || initialPayment?.from_team_name || initialPayment?.payer_team_name}</span>
          </div>
          <div className="flex justify-between items-start">
            <span className="text-xs font-medium text-gray-500">To</span>
            <span className="text-sm text-gray-900 text-right">{localPayment.paid_to_team_name || payment?.paid_to_team_name || initialPayment?.to_team_name || initialPayment?.paid_to_team_name}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500">Status</span>
            <Badge variant="secondary" className="text-xs">{localPayment.status || payment?.status || initialPayment?.status}</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500">Allocated</span>
            <span className="text-sm text-gray-900">{formatCurrency(localPayment.amount_allocated || 0, payment.payment_currency)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500">Unallocated</span>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-900">
                {formatCurrency(localPayment.unallocated_amount ?? payment.unallocated_amount, payment.payment_currency)}
              </span>
              {(localPayment.is_overallocated || payment.is_overallocated) && (
                <Badge variant="destructive" className="text-xs">
                  Over-allocated
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>


      {/* Allocations */}
      <div data-allocation-section>
        <h3 className="text-sm font-medium text-gray-900 mb-3">Invoices</h3>
        
        {/* Existing Allocations */}
        {existingAllocations.length > 0 ? (
          <div className="mb-4">
            <div className="space-y-2">
              {existingAllocations.map((allocation, index) => (
                <div 
                  key={index} 
                  className="flex items-center justify-between p-3 bg-white border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => {
                    // Extract invoice ID correctly based on direction and data structure
                    const invoiceIdForEdit = direction === 'ap' 
                      ? allocation.received_invoice_id 
                      : (allocation.invoice_id || allocation.issued_invoice_id)
                    
                    setSelectedAllocation({
                      payment_id: paymentId,
                      issued_invoice_id: direction === 'ar' ? invoiceIdForEdit : undefined,
                      received_invoice_id: direction === 'ap' ? invoiceIdForEdit : undefined,
                      amount_applied: allocation.amount_applied || allocation.amount_allocated,
                      payment_date: payment?.payment_date,
                      payment_amount: payment?.payment_amount,
                      payment_currency: payment?.payment_currency,
                      method: payment?.method,
                      external_ref: payment?.external_ref,
                      payer_team_name: payment?.payer_team_name,
                      direction: direction
                    })
                    setIsEditAllocationModalOpen(true)
                  }}
                >
                  <div className="flex-1">
                    <div 
                      className="font-medium text-sm text-gray-900 hover:text-gray-700 hover:underline cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        const invoiceId = direction === 'ap' 
                          ? allocation.received_invoice_id 
                          : (allocation.invoice_id || allocation.issued_invoice_id)
                        
                        // Use onRelatedDocumentSelect for third pane navigation if available
                        if (onRelatedDocumentSelect) {
                          // Handle AP vs AR field differences
                          const isAP = direction === 'ap'
                          const supplierTeamName = isAP ? allocation.supplier_team_name : allocation.issuer_team_name
                          const supplierTeamId = isAP ? allocation.supplier_team_id : allocation.issuer_team_id
                          
                          onRelatedDocumentSelect({
                            // Document structure fields
                            id: invoiceId,
                            doc_id: invoiceId,
                            doc_kind: 'invoice',
                            direction: direction,
                            doc_number: allocation.invoice_number || `INV-${invoiceId}`,
                            doc_date: allocation.invoice_date || new Date().toISOString(),
                            from_team_name: supplierTeamName,
                            to_team_name: allocation.payer_team_name,
                            subtotal_amount: allocation.invoice_subtotal || allocation.subtotal_amount || 0,
                            vat_amount: allocation.invoice_vat || allocation.vat_amount || 0,
                            total_amount: allocation.invoice_total || allocation.total_amount || 0,
                            currency_code: allocation.currency_code || payment?.payment_currency,
                            status: allocation.invoice_status || 'issued',
                            
                            // Invoice structure fields - handle AP vs AR differences
                            invoice_number: allocation.invoice_number,
                            invoice_date: allocation.invoice_date,
                            due_date: allocation.due_date,
                            issuer_team_id: isAP ? allocation.supplier_team_id : allocation.issuer_team_id,
                            issuer_team_name: isAP ? allocation.supplier_team_name : allocation.issuer_team_name,
                            payer_team_id: allocation.payer_team_id,
                            payer_team_name: allocation.payer_team_name,
                            supplier_team_id: isAP ? allocation.supplier_team_id : allocation.issuer_team_id,
                            supplier_team_name: isAP ? allocation.supplier_team_name : allocation.issuer_team_name,
                            created_at: allocation.created_at,
                            updated_at: allocation.updated_at,
                            
                            // Additional fields from payment context
                            amount_paid: allocation.amount_applied || allocation.amount_allocated,
                            balance_due: (allocation.invoice_total || allocation.total_amount || 0) - (allocation.amount_applied || allocation.amount_allocated || 0)
                          }, 'invoice')
                        } else {
                          // Fallback to onOpenInvoice for backward compatibility
                          onOpenInvoice?.(invoiceId)
                        }
                      }}
                    >
                      Invoice #{allocation.invoice_number}
                    </div>
                    <div className="text-xs text-gray-500">
                      Amount: {formatCurrency(allocation.amount_applied || allocation.amount_allocated, payment?.payment_currency || 'EUR')}
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        // Extract invoice ID correctly based on direction and data structure
                        const invoiceIdForEdit = direction === 'ap' 
                          ? allocation.received_invoice_id 
                          : (allocation.invoice_id || allocation.issued_invoice_id)
                        
                        setSelectedAllocation({
                          payment_id: paymentId,
                          issued_invoice_id: direction === 'ar' ? invoiceIdForEdit : undefined,
                          received_invoice_id: direction === 'ap' ? invoiceIdForEdit : undefined,
                          amount_applied: allocation.amount_applied || allocation.amount_allocated,
                          payment_date: payment?.payment_date,
                          payment_amount: payment?.payment_amount,
                          payment_currency: payment?.payment_currency,
                          method: payment?.method,
                          external_ref: payment?.external_ref,
                          payer_team_name: payment?.payer_team_name,
                          direction: direction
                        })
                        setIsEditAllocationModalOpen(true)
                      }}
                      className="text-gray-600 hover:text-gray-800"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        initiateDeleteAllocation(allocation)
                      }}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500">No invoices</div>
        )}
        

        {/* Allocations List */}
        {allocations.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700">Pending Allocations</h4>
            {allocations.map((allocation, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium">Invoice {allocation.issued_invoice_id}</p>
                  <p className="text-xs text-gray-500">
                    {formatCurrency(allocation.amount_applied, payment.payment_currency || 'EUR')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveAllocation(index)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button 
              onClick={handleSaveAllocations}
              disabled={isLoading}
              className="w-full"
            >
              Save Allocations
            </Button>
          </div>
        )}
      </div>

      {/* Select Invoice Button - Fixed at bottom */}
      <div className="absolute left-0 right-0 p-4 border-t border-gray-200 bg-white flex-shrink-0 z-50" style={{ bottom: '0px' }}>
        <Button
          onClick={() => setShowInvoiceOptionsModal(true)}
          className="w-full bg-black text-white hover:bg-gray-800"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Invoice
        </Button>
      </div>
      
      {/* Invoice Options Modal */}
      <Dialog open={showInvoiceOptionsModal} onOpenChange={setShowInvoiceOptionsModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4 px-4"
              onClick={() => {
                setShowInvoiceOptionsModal(false)
                setShowCreateInvoiceModal(true)
              }}
            >
              <div className="text-left">
                <div className="font-medium">Create a new invoice</div>
                <div className="text-sm text-gray-500 mt-1">
                  Create a new invoice and link it to this payment
                </div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4 px-4"
              onClick={() => {
                setShowInvoiceOptionsModal(false)
                setShowSelectInvoiceModal(true)
              }}
            >
              <div className="text-left">
                <div className="font-medium">Select existing invoice</div>
                <div className="text-sm text-gray-500 mt-1">
                  Link an existing invoice to this payment
                </div>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Create Invoice Modal */}
      {showCreateInvoiceModal && (
        <SharedInvoiceCreateModal
          isOpen={showCreateInvoiceModal}
          onClose={() => setShowCreateInvoiceModal(false)}
          onSuccess={() => {
            setShowCreateInvoiceModal(false)
            refetch()
            fetchAllocations()
          }}
          fromContext={{
            // Issuer team = payment's "To" Team
            issuerTeamId: payment?.paid_to_team_id || initialPayment?.to_team_id,
            issuerTeamName: payment?.paid_to_team_name || initialPayment?.to_team_name,
            // Payer team = payment's "From" Team
            payerTeamId: payment?.payer_team_id || initialPayment?.from_team_id,
            payerTeamName: payment?.payer_team_name || initialPayment?.from_team_name,
            subtotalAmount: payment?.unallocated_amount || payment?.payment_amount,
            currencyCode: payment?.payment_currency,
          }}
        />
      )}
      
      {/* Select Existing Invoice Modal */}
      {showSelectInvoiceModal && (
        <Dialog open={showSelectInvoiceModal} onOpenChange={setShowSelectInvoiceModal}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Select Existing Invoice</DialogTitle>
            </DialogHeader>
            <AddExistingInvoiceToPaymentModal
              paymentId={payment?.payment_id || paymentId}
              direction={direction}
              fromTeamId={payment?.payer_team_id || initialPayment?.from_team_id || 0}
              toTeamId={payment?.paid_to_team_id || initialPayment?.to_team_id || 0}
              paymentCurrency={payment?.payment_currency || 'EUR'}
              onClose={() => setShowSelectInvoiceModal(false)}
              onInvoiceLinked={(invoice) => {
                setShowSelectInvoiceModal(false)
                refetch()
                fetchAllocations()
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Payment Confirmation Dialog */}
      <Dialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Payment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this payment? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              This will permanently delete the payment and all its allocations.
            </p>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowDeleteConfirmation(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeletePayment}
              disabled={isLoading}
            >
              {isLoading ? 'Deleting...' : 'Delete Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Allocation Confirmation Dialog */}
      <Dialog open={showDeleteAllocationConfirm} onOpenChange={setShowDeleteAllocationConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Invoice Allocation</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this invoice from the payment?
            </DialogDescription>
          </DialogHeader>
          {allocationToDelete && (
            <div className="py-4">
              <p className="text-sm text-gray-600 mb-2">
                This will remove the allocation for:
              </p>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-sm">Invoice #{allocationToDelete.invoice_number}</p>
                <p className="text-sm text-gray-600">
                  Amount: {formatCurrency(allocationToDelete.amount_applied || allocationToDelete.amount_allocated, payment?.payment_currency || 'EUR')}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowDeleteAllocationConfirm(false)
                setAllocationToDelete(null)
              }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteAllocation}
              disabled={isLoading}
            >
              {isLoading ? 'Deleting...' : 'Delete Allocation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Payment Modal */}
      {isEditModalOpen && (payment || initialPayment) && (
        <PaymentCreateModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onPaymentCreated={(paymentId, updatedPayment) => {
            setIsEditModalOpen(false)
            
            // Update local payment state immediately for optimistic UI
            if (updatedPayment) {
              setLocalPayment(prev => ({
                ...prev,
                ...updatedPayment,
              }));
              
              // Call parent's onPaymentUpdate for optimistic updates in parent components
              onPaymentUpdate(updatedPayment)
            }
            
            // Refetch to ensure data consistency
            refetch()
          }}
          initialStep={1}
          editingPayment={{
            ...payment,
            payment_id: payment?.payment_id || paymentId,
            // Map v_documents_min fields to payment modal fields
            payer_team_id: payment?.payer_team_id || initialPayment?.from_team_id,
            paid_to_team_id: payment?.paid_to_team_id || initialPayment?.to_team_id,
            payer_team_name: payment?.payer_team_name || initialPayment?.from_team_name,
            paid_to_team_name: payment?.paid_to_team_name || initialPayment?.to_team_name,
            payment_date: payment?.payment_date || initialPayment?.doc_date,
            payment_amount: payment?.payment_amount || initialPayment?.total_amount,
            payment_currency: payment?.payment_currency || initialPayment?.currency_code,
            status: payment?.status || initialPayment?.status,
          }}
        />
      )}

      {/* Add Allocation Modal */}
      <PaymentCreateModal
        isOpen={isAllocationModalOpen}
        onClose={() => setIsAllocationModalOpen(false)}
        onPaymentCreated={(paymentId, updatedPayment) => {
          setIsAllocationModalOpen(false)
          refetch()
        }}
        initialStep={2}
        editingPayment={payment}
      />

      {/* Edit Allocation Modal */}
      <EditAllocationModal
        isOpen={isEditAllocationModalOpen}
        onClose={() => {
          setIsEditAllocationModalOpen(false)
          setSelectedAllocation(null)
        }}
        onSuccess={() => {
          setIsEditAllocationModalOpen(false)
          setSelectedAllocation(null)
          refetch()
        }}
        allocation={selectedAllocation}
        invoiceId={0} // This won't be used for editing existing allocations
      />
      </div>
    </div>
  )
} 
 
 
 






 