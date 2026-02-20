"use client"

import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
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
  onRelatedDocumentSelect?: (document: any, type: string) => void
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
  showHeader = false,
  onRelatedDocumentSelect
}: ProductionOrderDetailsPaneProps) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()
  const [showInvoiceOptionsModal, setShowInvoiceOptionsModal] = useState(false)
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false)
  const [showSelectInvoiceModal, setShowSelectInvoiceModal] = useState(false)
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  const [invoiceToDelete, setInvoiceToDelete] = useState<any>(null)
  const [showEditAllocationModal, setShowEditAllocationModal] = useState(false)
  const [selectedAllocation, setSelectedAllocation] = useState<any>(null)

  /**
   * AP production order pane is loaded via a single RPC (instead of multiple PostgREST views),
   * to reduce network chatter and avoid view/RLS issues.
   */
  const { data: pane, isLoading } = useQuery({
    queryKey: ['ap-production-order-pane', productionOrderId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_ap_production_order_pane', {
        p_production_order_id: productionOrderId,
      })
      if (error) throw error

      const resolved = Array.isArray(data) ? (data[0] ?? null) : (data ?? null)
      return {
        header: resolved?.header ?? null,
        tasks: resolved?.tasks ?? [],
        received_invoices: resolved?.received_invoices ?? [],
        projects: resolved?.projects ?? { items: [], text: null },
      }
    },
    // We still render the optimistic list-row values while loading, but we always fetch the RPC.
    refetchOnMount: 'always',
  })

  const paneHeader = (pane?.header ?? null) as any
  const displayHeader = (paneHeader ?? initialProductionOrder ?? null) as any
  const tasks = (pane?.tasks ?? []) as any[]
  const receivedInvoices = (pane?.received_invoices ?? []) as any[]
  const projects = (pane?.projects ?? { items: [], text: null }) as any

  const totalAllocatedNoVat = receivedInvoices.reduce(
    (sum, inv) => sum + (inv?.amount_subtotal_allocated ?? 0),
    0
  )
  const subtotalNoVat = displayHeader?.subtotal_amount ?? 0
  const remainingNoVat = subtotalNoVat - totalAllocatedNoVat

  // Handle invoice allocation deletion (show confirmation)
  const handleDeleteInvoiceAllocation = (invoice: any) => {
    setInvoiceToDelete(invoice)
    setShowDeleteConfirmation(true)
  }

  // Confirm and execute deletion
  const confirmDeleteInvoiceAllocation = async () => {
    if (!invoiceToDelete) return

    try {
      const receivedInvoiceId =
        invoiceToDelete.received_invoice_id ?? invoiceToDelete.received_invoice?.id ?? invoiceToDelete.id ?? invoiceToDelete.doc_id
      if (!receivedInvoiceId) {
        throw new Error('Missing received_invoice_id for allocation delete')
      }

      const { error } = await supabase
        .from('received_invoice_allocations')
        .delete()
        .eq('received_invoice_id', receivedInvoiceId)
        .eq('production_order_id', productionOrderId)

      if (error) throw error

      // Refresh the pane (single RPC)
      queryClient.invalidateQueries({ queryKey: ['ap-production-order-pane', productionOrderId] })

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

  if (!displayHeader) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          <p>Production order not found</p>
        </div>
      </div>
    )
  }

  // If RPC returns header=null, treat as not found/unauthorized.
  if (pane && pane.header === null) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          <p>Production order not found</p>
        </div>
      </div>
    )
  }

  const po = displayHeader

  return (
    <div className="flex-1 overflow-auto">
      {showHeader && (
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">
            AP Order #{po.doc_number ?? po.id}
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
            <span className="text-sm text-gray-900">{po.period_month ?? po.doc_month_key ?? '-'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Status</span>
            <Badge variant={getStatusBadgeVariant(po.status)}>
              {getStatusLabel(po.status)}
            </Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Supplier Team</span>
            <span className="text-sm text-gray-900">{po.supplier_team_name ?? po.from_team_name ?? initialProductionOrder?.from_team_name ?? '-'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Payer Team</span>
            <span className="text-sm text-gray-900">{po.payer_team_name ?? po.to_team_name ?? initialProductionOrder?.to_team_name ?? '-'}</span>
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
              {formatCurrency(remainingNoVat, po.currency_code)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-500">Fully Allocated</span>
            <span className="text-sm text-gray-900">
              {totalAllocatedNoVat >= (po.subtotal_amount || 0) ? 'Yes' : 'No'}
            </span>
          </div>
        </div>
      </div>

      {/* Projects Section */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">Projects</h3>
        {Array.isArray(projects?.items) && projects.items.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {projects.items.map((p: any) => {
                const projectId = p.project_id ?? p.id
                const projectName = p.project_name ?? p.name ?? 'Project'
                return (
                  <button
                    key={projectId ?? projectName}
                    type="button"
                    onClick={() => {
                      if (!onRelatedDocumentSelect || !projectId) return
                      onRelatedDocumentSelect(
                        {
                          id: projectId,
                          project_id: projectId,
                          name: projectName,
                        },
                        'project'
                      )
                    }}
                    className="inline-flex"
                    aria-label={`Open project ${projectName}`}
                  >
                    <Badge variant="secondary" className="cursor-pointer hover:bg-gray-200">
                      {projectName}
                    </Badge>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500 text-sm">No projects found</div>
        )}
      </div>

      {/* Tasks Section */}
      <div>
        <ProductionOrderTasksSection
          productionOrderId={productionOrderId}
          preloadedTasks={tasks as any}
          onTaskClick={(taskId, taskData) => {
            if (!onRelatedDocumentSelect) return
            onRelatedDocumentSelect(
              {
                id: taskId,
                task_id: taskId,
                doc_id: taskId,
                doc_kind: 'task',
                direction: 'ap',
                title: taskData?.title || `Task ${taskId}`,
                delivery_date: taskData?.delivery_date,
              },
              'task'
            )
          }}
        />
      </div>

      {/* Invoices Section */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">Invoices</h3>
        {receivedInvoices.length > 0 ? (
          <div className="mb-4">
            <div className="space-y-2">
              {receivedInvoices.map((invoice) => {
                const receivedInvoiceId =
                  invoice.received_invoice_id ?? invoice.received_invoice?.id ?? invoice.id ?? invoice.doc_id
                const invoiceNumber = invoice.invoice_number ?? invoice.doc_number ?? '-'
                const invoiceDate = invoice.invoice_date ?? invoice.doc_date
                const currencyCode = invoice.currency_code ?? invoice.payment_currency ?? po.currency_code
                const allocated = invoice.amount_subtotal_allocated ?? invoice.subtotal_amount ?? 0
                return (
                <div
                  key={receivedInvoiceId} 
                  className="flex items-center justify-between p-3 bg-white border rounded-lg hover:bg-gray-50 transition-colors"
                  role={onRelatedDocumentSelect ? 'button' : undefined}
                  tabIndex={onRelatedDocumentSelect ? 0 : undefined}
                  onClick={() => {
                    if (!onRelatedDocumentSelect || !receivedInvoiceId) return
                    onRelatedDocumentSelect(
                      {
                        id: receivedInvoiceId,
                        doc_id: receivedInvoiceId,
                        doc_kind: 'invoice',
                        direction: 'ap',
                        doc_number: invoiceNumber,
                        doc_date: invoiceDate,
                        currency_code: currencyCode,
                        subtotal_amount: invoice.subtotal_amount ?? allocated,
                        vat_amount: invoice.vat_amount,
                        total_amount: invoice.total_amount,
                        status: invoice.status,
                        from_team_id: po?.supplier_team_id ?? po?.from_team_id,
                        from_team_name: po?.supplier_team_name ?? po?.from_team_name,
                        to_team_id: po?.payer_team_id ?? po?.to_team_id,
                        to_team_name: po?.payer_team_name ?? po?.to_team_name,
                      },
                      'invoice'
                    )
                  }}
                  onKeyDown={(e) => {
                    if (!onRelatedDocumentSelect) return
                    if (e.key !== 'Enter' && e.key !== ' ') return
                    e.preventDefault()
                    ;(e.currentTarget as HTMLDivElement).click()
                  }}
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm text-gray-900">
                      Invoice #{invoiceNumber}
                    </div>
                    <div className="text-xs text-gray-500">
                      {invoiceDate ? formatDate(invoiceDate) : '-'} • Amount: {formatCurrency(allocated, currencyCode)}
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
                          received_invoice_id: receivedInvoiceId,
                          production_order_id: productionOrderId,
                          amount_subtotal_allocated: allocated,
                          invoice_number: invoiceNumber,
                          invoice_date: invoiceDate,
                          currency_code: currencyCode
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
              )})}
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
            // Refresh the pane (single RPC)
            queryClient.invalidateQueries({ queryKey: ['ap-production-order-pane', productionOrderId] })
          }}
          fromContext={{
            issuerTeamId: po?.supplier_team_id ?? po?.from_team_id ?? initialProductionOrder?.from_team_id,
            issuerTeamName: po?.supplier_team_name ?? po?.from_team_name ?? initialProductionOrder?.from_team_name,
            payerTeamId: po?.payer_team_id ?? po?.to_team_id ?? initialProductionOrder?.to_team_id,
            payerTeamName: po?.payer_team_name ?? po?.to_team_name ?? initialProductionOrder?.to_team_name,
            subtotalAmount: po?.subtotal_amount,
            currencyCode: po?.currency_code,
            orderId: productionOrderId,
            orderSubtotal: po?.subtotal_amount
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
              payerTeamId={po?.payer_team_id ?? po?.to_team_id ?? initialProductionOrder?.to_team_id ?? 0}
              supplierTeamId={po?.supplier_team_id ?? po?.from_team_id ?? initialProductionOrder?.from_team_id ?? 0}
              onClose={() => setShowSelectInvoiceModal(false)}
              onInvoiceLinked={(invoice) => {
                // Refresh the pane (single RPC)
                queryClient.invalidateQueries({ queryKey: ['ap-production-order-pane', productionOrderId] })
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
          queryClient.invalidateQueries({ queryKey: ['ap-production-order-pane', productionOrderId] })
        }}
        allocation={selectedAllocation}
      />
      </div>
    </div>
  )
}
