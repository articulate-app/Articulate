"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { toast } from '../ui/use-toast'
import { Loader2, FileText } from 'lucide-react'
import { createAndIssueInvoiceRPC, updateIssuedInvoice } from '../../lib/services/billing'
import type { InvoiceOrder, CreateInvoiceWithAllocations } from '../../lib/types/billing'

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

interface OrderAllocation {
  orderId: number
  remainingSubtotal: number
  allocatedSubtotal: number
  isPartial: boolean
}

interface InvoiceAllocationModalProps {
  isOpen: boolean
  onClose: () => void
  selectedOrders: InvoiceOrder[]
  invoiceId: number | null
  invoiceFormData?: any // Form data for creating new invoice
  onSuccess: (invoiceId: number) => void
}

export function InvoiceAllocationModal({ 
  isOpen, 
  onClose, 
  selectedOrders,
  invoiceId,
  invoiceFormData,
  onSuccess
}: InvoiceAllocationModalProps) {
  const [orderAllocations, setOrderAllocations] = useState<OrderAllocation[]>([])
  const [isAllocating, setIsAllocating] = useState(false)
  const supabase = createClientComponentClient()

  // Helper function to upload PDF with proper path convention (key-only format)
  const uploadPdfForInvoice = async (file: File, invoiceId: number, teamId: number): Promise<string | null> => {
    try {
      const storageKey = `${teamId}/${invoiceId}/${file.name}`
      
      const { data, error } = await supabase.storage
        .from('invoices')
        .upload(storageKey, file, { upsert: true })

      if (error) throw error
      return storageKey
    } catch (error) {
      console.error('Error uploading PDF:', error)
      throw error
    }
  }

  // Initialize allocations when modal opens
  useEffect(() => {
    if (isOpen && selectedOrders.length > 0) {
      const allocations = selectedOrders.map(order => ({
        orderId: order.id,
        remainingSubtotal: order.remaining_subtotal || order.subtotal_amount,
        allocatedSubtotal: order.remaining_subtotal || order.subtotal_amount,
        isPartial: false
      }))
      setOrderAllocations(allocations)
    }
  }, [isOpen, selectedOrders])

  const handleAllocationChange = (orderId: number, newAmount: string) => {
    const amount = parseFloat(newAmount) || 0
    setOrderAllocations(prev => prev.map(allocation => {
      if (allocation.orderId === orderId) {
        const remaining = allocation.remainingSubtotal
        const allocated = Math.min(amount, remaining)
        return {
          ...allocation,
          allocatedSubtotal: allocated,
          isPartial: allocated < remaining
        }
      }
      return allocation
    }))
  }

  const handleAllocateAll = () => {
    setOrderAllocations(prev => prev.map(allocation => ({
      ...allocation,
      allocatedSubtotal: allocation.remainingSubtotal,
      isPartial: false
    })))
  }

  const handleAllocateOrders = async () => {
    // Validate allocations
    const totalAllocated = orderAllocations.reduce((sum, allocation) => sum + allocation.allocatedSubtotal, 0)
    
    if (totalAllocated === 0) {
      toast({
        title: 'Error',
        description: 'At least one order must have an allocation greater than 0',
        variant: 'destructive',
      })
      return
    }

    setIsAllocating(true)

    try {
      if (invoiceId === null && invoiceFormData) {
        // This is a new invoice - create it using the RPC function with the selected orders
        const orderIds = orderAllocations
          .filter(allocation => allocation.allocatedSubtotal > 0)
          .map(allocation => allocation.orderId)
        
        // Build subtotal overrides from allocations
        const subtotalOverrides: { [key: string]: number } = {}
        orderAllocations.forEach(allocation => {
          if (allocation.allocatedSubtotal > 0) {
            subtotalOverrides[allocation.orderId.toString()] = allocation.allocatedSubtotal
          }
        })
        
        const payload: CreateInvoiceWithAllocations = {
          p_invoice_order_ids: orderIds,
          p_subtotal_overrides: subtotalOverrides,
          p_invoice_number: invoiceFormData.invoice_number,
          p_external_invoice_id: invoiceFormData.external_invoice_id || null,
          p_invoice_date: invoiceFormData.invoice_date || null,
          p_pdf_path: null, // Will upload after creation
          p_notes: invoiceFormData.notes || null,
          p_header_subtotal: invoiceFormData.header_subtotal || null,
          p_header_vat: invoiceFormData.header_vat || null,
          p_header_total: invoiceFormData.header_total || null
        }

        const { data: newInvoiceId, error } = await createAndIssueInvoiceRPC(payload)

        if (error) {
          throw error
        }

        // If PDF file exists, upload it with proper path and update invoice
        if (invoiceFormData.pdf_file && newInvoiceId) {
          try {
            const uploadedPath = await uploadPdfForInvoice(
              invoiceFormData.pdf_file, 
              newInvoiceId, 
              invoiceFormData.issuer_team_id || 0
            )
            
            // Update invoice with PDF path
            await updateIssuedInvoice(newInvoiceId, { pdf_path: uploadedPath || undefined })
            
            console.log('PDF uploaded and linked to invoice:', uploadedPath)
          } catch (pdfError) {
            console.error('PDF upload failed:', pdfError)
            toast({
              title: 'Warning',
              description: 'Invoice created but PDF upload failed. You can upload it later.',
              variant: 'destructive'
            })
          }
        }

        toast({
          title: 'Success',
          description: `Invoice created and ${orderIds.length} orders allocated successfully`,
        })

        onSuccess(newInvoiceId!)
        
      } else if (invoiceId !== null) {
        // This is an existing invoice - add order allocations to it
        const orderAllocationsToCreate = orderAllocations
          .filter(allocation => allocation.allocatedSubtotal > 0)
          .map(allocation => ({
            issued_invoice_id: invoiceId,
            invoice_order_id: allocation.orderId,
            amount_override_subtotal: allocation.allocatedSubtotal,
            amount_override_vat: Math.round(allocation.allocatedSubtotal * 0.23 * 100) / 100, // 23% VAT
            amount_override_total: allocation.allocatedSubtotal + Math.round(allocation.allocatedSubtotal * 0.23 * 100) / 100
          }))

        const { error } = await supabase
          .from('issued_invoice_orders')
          .insert(orderAllocationsToCreate)

        if (error) {
          throw error
        }

        toast({
          title: 'Success',
          description: `Successfully allocated ${orderAllocationsToCreate.length} orders to invoice`,
        })

        onSuccess(invoiceId)
      } else {
        throw new Error('No invoice ID or form data provided')
      }
      
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create invoice or allocate orders',
        variant: 'destructive',
      })
    } finally {
      setIsAllocating(false)
    }
  }

  const totalAllocated = orderAllocations.reduce((sum, allocation) => sum + allocation.allocatedSubtotal, 0)
  const totalRemaining = orderAllocations.reduce((sum, allocation) => sum + allocation.remainingSubtotal, 0)
  const hasPartialAllocations = orderAllocations.some(allocation => allocation.isPartial)

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Allocate Orders to Invoice #{invoiceId}</DialogTitle>
          <p className="text-sm text-gray-500">
            Specify how much to allocate from each selected order to this invoice.
          </p>
        </DialogHeader>

        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-blue-900">Allocation Summary</h3>
                <p className="text-sm text-blue-700">
                  {orderAllocations.filter(a => a.allocatedSubtotal > 0).length} of {orderAllocations.length} orders allocated
                </p>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold text-blue-900">
                  {formatCurrency(totalAllocated)}
                </div>
                <div className="text-sm text-blue-700">
                  of {formatCurrency(totalRemaining)} available
                </div>
              </div>
            </div>
            
            {hasPartialAllocations && (
              <div className="mt-2">
                <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                  Partial allocations detected
                </Badge>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={handleAllocateAll}
              disabled={isAllocating}
            >
              Allocate All Remaining
            </Button>
            
            <div className="text-sm text-gray-600">
              {orderAllocations.length} order{orderAllocations.length !== 1 ? 's' : ''} selected
            </div>
          </div>

          {/* Orders List */}
          <div className="space-y-4">
            {selectedOrders.map((order, index) => {
              const allocation = orderAllocations.find(a => a.orderId === order.id)
              if (!allocation) return null

              return (
                <div key={order.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <FileText className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">{order.project_name || `Order #${order.id}`}</span>
                        <Badge variant={!order.is_issued ? 'default' : 'secondary'}>
                          {order.status?.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-500">
                        {formatDate(order.billing_period_start)} - {formatDate(order.billing_period_end)}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        Total: {formatCurrency(order.total_amount, order.currency_code)} • 
                        Remaining: {formatCurrency(allocation.remainingSubtotal, order.currency_code)}
                      </div>
                    </div>
                    
                    <div className="ml-4 w-48">
                      <Label htmlFor={`allocation-${order.id}`} className="text-sm font-medium">
                        Allocate Amount
                      </Label>
                      <Input
                        id={`allocation-${order.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        max={allocation.remainingSubtotal}
                        value={allocation.allocatedSubtotal}
                        onChange={(e) => handleAllocationChange(order.id, e.target.value)}
                        disabled={isAllocating}
                        className="mt-1"
                      />
                      {allocation.isPartial && (
                        <p className="text-xs text-orange-600 mt-1">
                          Partial allocation ({formatCurrency(allocation.remainingSubtotal - allocation.allocatedSubtotal)} remaining)
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isAllocating}>
            Cancel
          </Button>
          <Button 
            onClick={handleAllocateOrders}
            disabled={isAllocating || totalAllocated === 0}
          >
            {isAllocating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Allocate Orders
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
