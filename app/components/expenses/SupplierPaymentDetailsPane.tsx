"use client"

import React, { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { toast } from '../ui/use-toast'
import { Plus, Edit, Trash2 } from 'lucide-react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { SupplierPaymentCreateModal } from './SupplierPaymentCreateModal'
import { SupplierInvoiceSelectionModal } from './SupplierInvoiceSelectionModal'
import { EditSupplierAllocationModal } from './EditSupplierAllocationModal'
import { SupplierInvoiceCreateModal } from './SupplierInvoiceCreateModal'
import { updateSupplierPaymentAllocationsInCaches } from './supplier-payment-cache-utils'
import type { SupplierPaymentList } from '../../lib/types/expenses'

interface SupplierPaymentDetailsPaneProps {
  paymentId: number
  onClose: () => void
  onPaymentUpdate: (payment: any) => void
  initialPayment?: any
  onOpenInvoice?: (invoiceId: number) => void
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
    case 'posted':
      return 'default'
    case 'pending':
      return 'secondary'
    case 'cancelled':
      return 'destructive'
    default:
      return 'outline'
  }
}

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'posted':
      return 'Posted'
    case 'pending':
      return 'Pending'
    case 'cancelled':
      return 'Cancelled'
    default:
      return status
  }
}

export function SupplierPaymentDetailsPane({
  paymentId,
  onClose,
  onPaymentUpdate,
  initialPayment,
  onOpenInvoice
}: SupplierPaymentDetailsPaneProps) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()
  const [invoices, setInvoices] = useState<any[]>([])
  const [isEditAllocationModalOpen, setIsEditAllocationModalOpen] = useState(false)
  const [isInvoiceSelectionModalOpen, setIsInvoiceSelectionModalOpen] = useState(false)
  const [isSelectInvoiceModalOpen, setIsSelectInvoiceModalOpen] = useState(false)
  const [isDeleteAllocationConfirmationOpen, setIsDeleteAllocationConfirmationOpen] = useState(false)
  const [isCreateInvoiceModalOpen, setIsCreateInvoiceModalOpen] = useState(false)
  const [selectedAllocation, setSelectedAllocation] = useState<any>(null)
  const [allocationToDelete, setAllocationToDelete] = useState<number | null>(null)

  // Fetch payment details
  const { data: payment, isLoading } = useQuery({
    queryKey: ['supplier-payment', paymentId],
    queryFn: async () => {
      if (initialPayment) {
        return { data: initialPayment, error: null }
      }

      const { data, error } = await supabase
        .from('v_supplier_payments_summary')
        .select('*')
        .eq('payment_id', paymentId)
        .single()

      return { data, error }
    },
    initialData: initialPayment ? { data: initialPayment, error: null } : undefined,
  })

  // Fetch related invoices
  useEffect(() => {
    if (!payment?.data) return

    const fetchInvoices = async () => {
      try {
        const { data: invoiceData, error } = await supabase
          .from('v_supplier_invoice_payments_min')
          .select('*')
          .eq('payment_id', payment.data.payment_id)

        if (error) throw error
        setInvoices(invoiceData || [])
      } catch (error) {
        console.error('Failed to fetch invoices:', error)
        setInvoices([])
      }
    }

    fetchInvoices()
  }, [payment?.data, supabase])


  // Delete allocation function
  const handleDeleteAllocation = (invoiceId: number) => {
    setAllocationToDelete(invoiceId)
    setIsDeleteAllocationConfirmationOpen(true)
  }

  const confirmDeleteAllocation = async () => {
    if (!allocationToDelete) return

    try {
      // Get current allocations to calculate new totals
      const { data: currentAllocations } = await supabase
        .from('supplier_payment_allocations')
        .select('*')
        .eq('payment_id', paymentId)
      
      // Remove the allocation to be deleted
      const newAllocations = currentAllocations?.filter(alloc => 
        alloc.received_invoice_id !== allocationToDelete
      ) || []
      
      // Optimistically update the caches first
      updateSupplierPaymentAllocationsInCaches(queryClient, paymentId, newAllocations)
      
      // Delete the allocation from database
      const { error } = await supabase
        .from('supplier_payment_allocations')
        .delete()
        .eq('payment_id', paymentId)
        .eq('received_invoice_id', allocationToDelete)

      if (error) throw error

      // Refresh invoices list
      const { data: invoiceData } = await supabase
        .from('v_supplier_invoice_payments_min')
        .select('*')
        .eq('payment_id', paymentId)

      setInvoices(invoiceData || [])

      toast({
        title: 'Success',
        description: 'Allocation deleted successfully',
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete allocation',
        variant: 'destructive',
      })
    } finally {
      setIsDeleteAllocationConfirmationOpen(false)
      setAllocationToDelete(null)
    }
  }

  // Handle invoice selection and create allocation
  const handleSelectInvoice = async (invoice: any, amount: number) => {
    try {
      // Create allocation with the specified amount
      const { error } = await supabase
        .from('supplier_payment_allocations')
        .insert({
          payment_id: paymentId,
          received_invoice_id: invoice.id,
          amount_applied: amount
        })

      if (error) throw error

      // Refresh invoices list
      const { data: invoiceData } = await supabase
        .from('v_supplier_invoice_payments_min')
        .select('*')
        .eq('payment_id', paymentId)

      setInvoices(invoiceData || [])

      toast({
        title: 'Success',
        description: 'Invoice allocated successfully',
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to allocate invoice',
        variant: 'destructive',
      })
    }
  }


  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    )
  }

  if (!payment?.data) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          <p>Payment not found</p>
        </div>
      </div>
    )
  }

  const paymentData = payment.data

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6 pb-20">
      {/* Details Section */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">Details</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Payment ID</span>
            <span className="text-sm text-gray-900">{paymentData.payment_id}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Payment Date</span>
            <span className="text-sm text-gray-900">{formatDate(paymentData.payment_date)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Status</span>
            <Badge variant={getStatusBadgeVariant(paymentData.status)}>
              {getStatusLabel(paymentData.status)}
            </Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Amount</span>
            <span className="text-sm text-gray-900">{formatCurrency(paymentData.payment_amount, paymentData.payment_currency)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Amount Allocated</span>
            <span className="text-sm text-gray-900">{formatCurrency(paymentData.amount_allocated || 0, paymentData.payment_currency)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Unallocated Amount</span>
            <span className="text-sm text-gray-900">{formatCurrency(paymentData.unallocated_amount || paymentData.payment_amount, paymentData.payment_currency)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Currency</span>
            <span className="text-sm text-gray-900">{paymentData.payment_currency}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Method</span>
            <span className="text-sm text-gray-900">{paymentData.method}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Payer Team</span>
            <span className="text-sm text-gray-900">{paymentData.payer_team_name}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Paid To Team</span>
            <span className="text-sm text-gray-900">{paymentData.supplier_team_name}</span>
          </div>
          {paymentData.external_ref && (
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-500">External Reference</span>
              <span className="text-sm text-gray-900">{paymentData.external_ref}</span>
            </div>
          )}
          {paymentData.notes && (
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-gray-500">Notes</span>
              <span className="text-sm text-gray-900 text-right max-w-xs">{paymentData.notes}</span>
            </div>
          )}
        </div>
      </div>

      {/* Invoices Section */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">Invoices</h3>
        {invoices.length > 0 ? (
          <div className="space-y-2">
            {invoices.map((invoice, index) => (
              <div 
                key={index} 
                className="flex items-center justify-between p-3 bg-white border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => {
                  setSelectedAllocation({
                    payment_id: paymentId,
                    received_invoice_id: invoice.received_invoice_id,
                    amount_applied: invoice.amount_applied,
                    payment_date: paymentData?.payment_date,
                    payment_amount: paymentData?.payment_amount,
                    payment_currency: paymentData?.payment_currency,
                    method: paymentData?.method,
                    external_ref: paymentData?.external_ref,
                    payer_team_name: paymentData?.payer_team_name
                  })
                  setIsEditAllocationModalOpen(true)
                }}
              >
                <div className="flex-1">
                  <div 
                    className="font-medium text-sm text-gray-900 hover:text-gray-700 hover:underline cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenInvoice?.(invoice.received_invoice_id)
                    }}
                  >
                    Invoice #{invoice.invoice_number}
                  </div>
                  <div className="text-xs text-gray-500">
                    Amount: {formatCurrency(invoice.amount_applied, paymentData.payment_currency)}
                  </div>
                </div>
                <div className="flex items-center space-x-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedAllocation({
                        payment_id: paymentId,
                        received_invoice_id: invoice.received_invoice_id,
                        amount_applied: invoice.amount_applied,
                        payment_date: paymentData?.payment_date,
                        payment_amount: paymentData?.payment_amount,
                        payment_currency: paymentData?.payment_currency,
                        method: paymentData?.method,
                        external_ref: paymentData?.external_ref,
                        payer_team_name: paymentData?.payer_team_name
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
                      handleDeleteAllocation(invoice.received_invoice_id)
                    }}
                    className="text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500">No invoices</div>
        )}
      </div>

      {/* Select Invoice Button - Fixed at bottom */}
      <div className="absolute left-0 right-0 p-4 border-t border-gray-200 bg-white flex-shrink-0 z-50" style={{ bottom: '0px' }}>
        <Button
          onClick={() => setIsInvoiceSelectionModalOpen(true)}
          className="w-full bg-black text-white hover:bg-gray-800"
        >
          <Plus className="w-4 h-4 mr-1" />
          Select Invoice
        </Button>
      </div>


      {/* Invoice Selection Modal */}
      <SupplierInvoiceSelectionModal
        isOpen={isInvoiceSelectionModalOpen}
        onClose={() => setIsInvoiceSelectionModalOpen(false)}
        onSelectExisting={() => setIsSelectInvoiceModalOpen(true)}
        onCreateNew={() => {
          setIsCreateInvoiceModalOpen(true)
        }}
      />

      {/* Add Allocation Modal */}
      <SupplierPaymentCreateModal
        isOpen={isSelectInvoiceModalOpen}
        onClose={() => setIsSelectInvoiceModalOpen(false)}
        onPaymentCreated={(paymentId) => {
          // Refresh the invoices list after adding allocations
          const fetchInvoices = async () => {
            try {
              const { data: invoiceData } = await supabase
                .from('v_supplier_invoice_payments_min')
                .select('*')
                .eq('payment_id', paymentId)

              setInvoices(invoiceData || [])
            } catch (error) {
              console.error('Failed to fetch invoices:', error)
            }
          }
          fetchInvoices()
        }}
        addAllocationMode={true}
        existingPaymentId={paymentId}
      />


      {/* Edit Allocation Modal */}
      <EditSupplierAllocationModal
        isOpen={isEditAllocationModalOpen}
        onClose={() => {
          setIsEditAllocationModalOpen(false)
          setSelectedAllocation(null)
        }}
        onSuccess={() => {
          setIsEditAllocationModalOpen(false)
          setSelectedAllocation(null)
          // Refresh invoices list
          const fetchInvoices = async () => {
            try {
              const { data: invoiceData } = await supabase
                .from('v_supplier_invoice_payments_min')
                .select('*')
                .eq('payment_id', paymentId)

              setInvoices(invoiceData || [])
            } catch (error) {
              console.error('Failed to fetch invoices:', error)
            }
          }
          fetchInvoices()
        }}
        allocation={selectedAllocation}
      />

      {/* Delete Allocation Confirmation Dialog */}
      <Dialog open={isDeleteAllocationConfirmationOpen} onOpenChange={setIsDeleteAllocationConfirmationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Allocation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this allocation? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsDeleteAllocationConfirmationOpen(false)
                setAllocationToDelete(null)
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteAllocation}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Supplier Invoice Modal */}
      <SupplierInvoiceCreateModal
        isOpen={isCreateInvoiceModalOpen}
        onClose={() => setIsCreateInvoiceModalOpen(false)}
        onSuccess={(invoiceId: number) => {
          // Refresh the invoices list after creating a new invoice
          const fetchInvoices = async () => {
            try {
              const { data: invoiceData } = await supabase
                .from('v_supplier_invoice_payments_min')
                .select('*')
                .eq('payment_id', paymentId)

              setInvoices(invoiceData || [])
            } catch (error) {
              console.error('Failed to fetch invoices:', error)
            }
          }
          fetchInvoices()
        }}
      />
    </div>
  )
}
