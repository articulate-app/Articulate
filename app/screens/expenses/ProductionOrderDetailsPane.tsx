"use client"

import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { SharedInvoiceCreateModal } from '../../components/documents/SharedInvoiceCreateModal'
import { AddExistingSupplierInvoiceModal } from '../../components/expenses/AddExistingSupplierInvoiceModal'
import { ProductionOrderTasksSection } from '../../components/expenses/ProductionOrderTasksSection'
import EditSupplierInvoiceAllocationModal from '../../components/expenses/EditSupplierInvoiceAllocationModal'
import { Edit, Trash2, MoreHorizontal, X, CreditCard } from 'lucide-react'
// formatCurrency is defined locally in this file
import type { ProductionOrderList } from '../../lib/types/expenses'

const formatCurrency = (amount: number, currencyCode: string | null = 'EUR') => {
  if (amount === null || amount === undefined) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode || 'EUR',
  }).format(amount)
}

interface ProductionOrderDetailsPaneProps {
  productionOrderId: number
  onClose: () => void
  initialProductionOrder?: any
  showHeader?: boolean
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
    case 'open':
      return 'default'
    case 'closed':
      return 'secondary'
    default:
      return 'outline'
  }
}

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'open':
      return 'Open'
    case 'closed':
      return 'Closed'
    default:
      return status
  }
}

export function ProductionOrderDetailsPane({
  productionOrderId,
  onClose,
  initialProductionOrder,
  showHeader = false
}: ProductionOrderDetailsPaneProps) {
  const supabase = createClientComponentClient()
  const [invoices, setInvoices] = useState<any[]>([])
  const [showInvoiceOptionsModal, setShowInvoiceOptionsModal] = useState(false)
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false)
  const [showSelectInvoiceModal, setShowSelectInvoiceModal] = useState(false)
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  const [invoiceToDelete, setInvoiceToDelete] = useState<any>(null)
  const [showEditAllocationModal, setShowEditAllocationModal] = useState(false)
  const [selectedAllocation, setSelectedAllocation] = useState<any>(null)

  // Fetch production order details
  const { data: productionOrder, isLoading } = useQuery({
    queryKey: ['production-order', productionOrderId],
    queryFn: async () => {
      if (initialProductionOrder) {
        return { data: initialProductionOrder, error: null }
      }

      const { data, error } = await supabase
        .from('v_production_orders_list')
        .select('*')
        .eq('id', productionOrderId)
        .single()

      return { data, error }
    },
    initialData: initialProductionOrder ? { data: initialProductionOrder, error: null } : undefined,
  })

  // Helper function to get supplier team ID consistently
  const getSupplierTeamId = () => {
    return initialProductionOrder?.from_team_id || productionOrder?.data?.supplier_team_id
  }

  // Helper function to get period month consistently
  const getPeriodMonth = () => {
    return productionOrder?.data?.period_month
  }

  // Helper function to refresh invoices
  const refreshInvoices = async () => {
    try {
      const { data: invoiceData, error } = await supabase
        .from('v_po_received_invoices')
        .select('*')
        .eq('production_order_id', productionOrderId)
        .order('invoice_date', { ascending: false })

      if (error) throw error
      setInvoices(invoiceData || [])
    } catch (error) {
      console.error('Failed to fetch invoices:', error)
      setInvoices([])
    }
  }

  // Handle invoice allocation deletion (show confirmation)
  const handleDeleteInvoiceAllocation = (invoice: any) => {
    setInvoiceToDelete(invoice)
    setShowDeleteConfirmation(true)
  }

  // Confirm and execute deletion
  const confirmDeleteInvoiceAllocation = async () => {
    if (!invoiceToDelete) return

    try {
      const { error } = await supabase
        .from('received_invoice_allocations')
        .delete()
        .eq('received_invoice_id', invoiceToDelete.received_invoice_id)
        .eq('production_order_id', productionOrderId)

      if (error) throw error

      // Refresh invoices list
      refreshInvoices()

      const { toast } = await import('../../components/ui/use-toast')
      toast({
        title: 'Success',
        description: 'Invoice allocation removed successfully',
      })
    } catch (error: any) {
      console.error('Failed to delete invoice allocation:', error)
      const { toast } = await import('../../components/ui/use-toast')
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove invoice allocation',
        variant: 'destructive',
      })
    } finally {
      setShowDeleteConfirmation(false)
      setInvoiceToDelete(null)
    }
  }

  // Fetch related invoices
  useEffect(() => {
    if (productionOrder?.data || initialProductionOrder) {
      refreshInvoices()
    }
  }, [productionOrder?.data, initialProductionOrder, supabase])

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

  if (!productionOrder?.data) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          <p>Production order not found</p>
        </div>
      </div>
    )
  }

  const po = productionOrder.data

  return (
    <div className="flex-1 overflow-auto">
      {showHeader && (
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">
            AP Order #{po.id}
          </h2>
          <div className="flex items-center space-x-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {}}>
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Order
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowInvoiceOptionsModal(true)}>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Add Invoice
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {}} className="text-red-600">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Order
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      <div className="p-4 max-w-4xl mx-auto space-y-6 pb-20">
      {/* Summary Section */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">Summary</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Period</span>
            <span className="text-sm text-gray-900">{po.period_month}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Status</span>
            <Badge variant={getStatusBadgeVariant(po.status)}>
              {getStatusLabel(po.status)}
            </Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Supplier Team</span>
            <span className="text-sm text-gray-900">{initialProductionOrder?.from_team_name || po.supplier_team_name}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Payer Team</span>
            <span className="text-sm text-gray-900">{initialProductionOrder?.to_team_name || po.payer_team_name}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Currency</span>
            <span className="text-sm text-gray-900">{po.currency_code}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Subtotal Amount</span>
            <span className="text-sm text-gray-900">{formatCurrency(po.subtotal_amount, po.currency_code)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Remaining (no VAT)</span>
            <span className="text-sm text-gray-900">
              {formatCurrency(
                (po.subtotal_amount || 0) - invoices.reduce((sum, inv) => sum + (inv.amount_subtotal_allocated || 0), 0),
                po.currency_code
              )}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Fully Allocated</span>
            <span className="text-sm text-gray-900">
              {invoices.reduce((sum, inv) => sum + (inv.amount_subtotal_allocated || 0), 0) >= (po.subtotal_amount || 0) ? 'Yes' : 'No'}
            </span>
          </div>
        </div>
      </div>

      {/* Projects Section */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">Projects</h3>
        {po.projects && po.projects.length > 0 ? (
          <div className="space-y-3">
            {po.projects.map((project: any, index: number) => (
              <div key={index} className="p-3 bg-white border rounded-lg">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-500">Project</span>
                    <span className="text-sm text-gray-900 font-medium">{project.project_name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-500">Task Count</span>
                    <span className="text-sm text-gray-900">{project.task_count}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-500">Subtotal (no VAT)</span>
                    <span className="text-sm text-gray-900">{formatCurrency(project.project_subtotal_novat, po.currency_code)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-500">Delivery Period</span>
                    <span className="text-sm text-gray-900">
                      {formatDate(project.earliest_delivery_date)} - {formatDate(project.latest_delivery_date)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500 text-sm">
            No projects found
          </div>
        )}
      </div>

      {/* Tasks Section */}
      <div>
        <ProductionOrderTasksSection
          productionOrderId={productionOrderId}
          onTaskClick={(taskId) => {
            // TODO: Handle task click - open task details
            console.log('Task clicked:', taskId)
          }}
        />
      </div>

      {/* Invoices Section */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">Invoices</h3>
        {invoices.length > 0 ? (
          <div className="mb-4">
            <div className="space-y-2">
              {invoices.map((invoice) => (
                <div 
                  key={invoice.received_invoice_id} 
                  className="flex items-center justify-between p-3 bg-white border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm text-gray-900">
                      Invoice #{invoice.invoice_number}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDate(invoice.invoice_date)} • Amount: {formatCurrency(invoice.amount_subtotal_allocated, invoice.currency_code)}
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
                          received_invoice_id: invoice.received_invoice_id,
                          production_order_id: productionOrderId,
                          amount_subtotal_allocated: invoice.amount_subtotal_allocated,
                          invoice_number: invoice.invoice_number,
                          invoice_date: invoice.invoice_date,
                          currency_code: invoice.currency_code
                        })
                        setShowEditAllocationModal(true)
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
                        handleDeleteInvoiceAllocation(invoice)
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
          <div className="text-center py-4 text-gray-500 text-sm">
            No invoices
          </div>
        )}
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowInvoiceOptionsModal(true)}
          className="w-full mt-3"
        >
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
                <div className="text-sm text-gray-500 mt-1">Create and link a new AP invoice</div>
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
                <div className="text-sm text-gray-500 mt-1">Link an existing AP invoice</div>
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
            // Refresh invoices list
            refreshInvoices()
          }}
          fromContext={{
            issuerTeamId: initialProductionOrder?.from_team_id || productionOrder?.data?.supplier_team_id,
            issuerTeamName: initialProductionOrder?.from_team_name || productionOrder?.data?.supplier_team_name,
            payerTeamId: initialProductionOrder?.to_team_id || productionOrder?.data?.payer_team_id,
            payerTeamName: initialProductionOrder?.to_team_name || productionOrder?.data?.payer_team_name,
            subtotalAmount: productionOrder?.data?.subtotal_amount,
            currencyCode: productionOrder?.data?.currency_code,
            orderId: productionOrderId,
            orderSubtotal: productionOrder?.data?.subtotal_amount
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
            <AddExistingSupplierInvoiceModal
              productionOrderId={productionOrderId}
              payerTeamId={initialProductionOrder?.to_team_id || productionOrder?.data?.payer_team_id || 0}
              supplierTeamId={initialProductionOrder?.from_team_id || productionOrder?.data?.supplier_team_id || 0}
              onClose={() => setShowSelectInvoiceModal(false)}
              onInvoiceLinked={(invoice) => {
                // Refresh invoices list
                refreshInvoices()
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Invoice Allocation</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to remove this invoice allocation? This will unlink the invoice from this production order.
            </p>
            {invoiceToDelete && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Invoice</span>
                  <span className="font-medium">#{invoiceToDelete.invoice_number}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Allocated Amount</span>
                  <span className="font-medium">{formatCurrency(invoiceToDelete.amount_subtotal_allocated, invoiceToDelete.currency_code)}</span>
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end space-x-2">
            <Button 
              variant="outline" 
              onClick={() => setShowDeleteConfirmation(false)}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteInvoiceAllocation}
            >
              Remove Allocation
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Allocation Modal */}
      <EditSupplierInvoiceAllocationModal
        isOpen={showEditAllocationModal}
        onClose={() => {
          setShowEditAllocationModal(false)
          setSelectedAllocation(null)
        }}
        onSuccess={() => {
          refreshInvoices()
        }}
        allocation={selectedAllocation}
      />
      </div>
    </div>
  )
}
