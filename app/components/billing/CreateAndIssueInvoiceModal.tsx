"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import { Loader2, Upload, X } from 'lucide-react'
import { createAndIssueInvoice, updateIssuedInvoice, fetchIssuedInvoice } from '../../lib/services/billing'
import { toast } from '../ui/use-toast'
import { InvoiceOrder } from '../../lib/types/billing'
import { Dropzone } from '../dropzone'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useQueryClient } from '@tanstack/react-query'
import { updateInvoiceOrderInCaches } from './invoice-order-cache-utils'

const formatCurrency = (amount: number, currencyCode: string | null = 'EUR') => {
  const safeCurrencyCode = currencyCode || 'EUR'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: safeCurrencyCode,
  }).format(amount)
}

interface CreateAndIssueInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  selectedOrders: InvoiceOrder[]
  onSuccess: (invoiceId: number) => void
}

interface OrderAmount {
  orderId: number
  remainingSubtotal: number
  allocatedSubtotal: number
  isPartial: boolean
}

interface InvoiceFormData {
  invoice_number: string
  external_invoice_id: string
  invoice_date: string
  subtotal: number
  vat_amount: number
  total_amount: number
  notes: string
}

export function CreateAndIssueInvoiceModal({ 
  isOpen, 
  onClose, 
  selectedOrders, 
  onSuccess 
}: CreateAndIssueInvoiceModalProps) {
  const [orderAmounts, setOrderAmounts] = useState<OrderAmount[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfPath, setPdfPath] = useState<string | null>(null)
  const [formData, setFormData] = useState<InvoiceFormData>({
    invoice_number: '',
    external_invoice_id: '',
    invoice_date: new Date().toISOString().split('T')[0],
    subtotal: 0,
    vat_amount: 0,
    total_amount: 0,
    notes: ''
  })

  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

  // Initialize order amounts and form data when modal opens
  useEffect(() => {
    if (isOpen && selectedOrders.length > 0) {
      const amounts = selectedOrders.map(order => ({
        orderId: order.id,
        remainingSubtotal: order.remaining_subtotal || order.subtotal_amount,
        allocatedSubtotal: order.remaining_subtotal || order.subtotal_amount,
        isPartial: false
      }))
      setOrderAmounts(amounts)
      
      // Calculate totals based on subtotal allocations
      const totalAllocatedSubtotal = amounts.reduce((sum, order) => sum + order.allocatedSubtotal, 0)
      const vatRate = 0.23 // 23% VAT rate
      const subtotal = totalAllocatedSubtotal
      const vatAmount = Math.round(subtotal * vatRate * 100) / 100
      const totalAmount = subtotal + vatAmount
      
      setFormData({
        invoice_number: '',
        external_invoice_id: '',
        invoice_date: new Date().toISOString().split('T')[0],
        subtotal: Math.round(subtotal * 100) / 100,
        vat_amount: Math.round(vatAmount * 100) / 100,
        total_amount: Math.round(totalAmount * 100) / 100,
        notes: ''
      })
      
      // Reset PDF
      setPdfFile(null)
      setPdfPath(null)
    }
  }, [isOpen, selectedOrders])

  const handleAmountChange = (orderId: number, newAmount: string) => {
    const amount = parseFloat(newAmount) || 0
    setOrderAmounts(prev => prev.map(order => {
      if (order.orderId === orderId) {
        const remaining = order.remainingSubtotal
        const allocated = Math.min(amount, remaining)
        return {
          ...order,
          allocatedSubtotal: allocated,
          isPartial: allocated < remaining
        }
      }
      return order
    }))
  }

  const handleBillRemainingForAll = () => {
    setOrderAmounts(prev => prev.map(order => ({
      ...order,
      allocatedSubtotal: order.remainingSubtotal,
      isPartial: false
    })))
  }

  const handleFormChange = (field: keyof InvoiceFormData, value: string | number) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value }
      
      // Auto-recalculate when subtotal changes
      if (field === 'subtotal' && typeof value === 'number') {
        const vatRate = 0.23 // 23% VAT rate
        const vatAmount = Math.round(value * vatRate * 100) / 100
        const totalAmount = value + vatAmount
        
        newData.vat_amount = vatAmount
        newData.total_amount = totalAmount
      }
      
      return newData
    })
  }

  const handlePdfUpload = async (files: FileList | File[]) => {
    if (files.length === 0) return
    
    const file = Array.from(files)[0]
    if (file.type !== 'application/pdf') {
      toast({
        title: 'Error',
        description: 'Please upload a PDF file',
        variant: 'destructive',
      })
      return
    }

    // Store file in memory without uploading
    setPdfFile(file)
    setPdfPath(null) // Clear any previous path
  }

  const handleRemovePdf = async (attachment: any) => {
    setPdfFile(null)
    setPdfPath(null)
  }

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

  const handleCreateAndIssueInvoice = async () => {
    // Validation
    if (!formData.invoice_number.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter an invoice number',
        variant: 'destructive',
      })
      return
    }

    if (!formData.invoice_date) {
      toast({
        title: 'Error',
        description: 'Please select an invoice date',
        variant: 'destructive',
      })
      return
    }

    if (formData.subtotal <= 0) {
      toast({
        title: 'Error',
        description: 'Please enter a valid subtotal amount',
        variant: 'destructive',
      })
      return
    }

    const totalAllocated = orderAmounts.reduce((sum, order) => sum + order.allocatedSubtotal, 0)
    if (totalAllocated <= 0) {
      toast({
        title: 'Error',
        description: 'Please allocate amounts to at least one order',
        variant: 'destructive',
      })
      return
    }

    setIsCreating(true)
    try {
      // Prepare the parameters for the RPC call
      const orderIds = orderAmounts.map(order => order.orderId)
      const overrides: { [key: string]: number } = {}
      
      // Add overrides for allocated amounts
      orderAmounts.forEach(order => {
        if (order.allocatedSubtotal > 0) {
          overrides[order.orderId.toString()] = order.allocatedSubtotal
        }
      })

      console.log('Creating and issuing invoice with:', { 
        orderIds, 
        overrides, 
        formData, 
        pdfPath 
      })

      const { data: invoiceId, error } = await createAndIssueInvoice({
        invoiceOrderIds: orderIds,
        overrides,
        invoiceNumber: formData.invoice_number,
        invoiceDate: formData.invoice_date,
        pdfPath: null, // Will upload after creation
        subtotal: formData.subtotal,
        vatAmount: formData.vat_amount,
        totalAmount: formData.total_amount,
        externalInvoiceId: formData.external_invoice_id,
        notes: formData.notes
      })
      
      if (error) {
        throw error
      }

      // If PDF file exists, upload it with proper path and update invoice
      if (pdfFile && invoiceId) {
        try {
          // For now, we'll need to fetch the created invoice to get the issuer_team_id
          // This is because InvoiceOrder doesn't contain team information
          const { data: createdInvoice, error: fetchError } = await fetchIssuedInvoice(invoiceId)
          if (fetchError) throw fetchError
          
          const issuerTeamId = createdInvoice?.issuer_team_id
          if (issuerTeamId) {
            const uploadedPath = await uploadPdfForInvoice(pdfFile, invoiceId, issuerTeamId)
            
            // Update invoice with PDF path
            await updateIssuedInvoice(invoiceId, { pdf_path: uploadedPath || undefined })
            
            console.log('PDF uploaded and linked to invoice:', uploadedPath)
          }
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
        description: 'Invoice created and issued successfully',
      })

      onSuccess(invoiceId!)
      
      // Optimistically update the invoice order data in the store system
      // This ensures the UI updates immediately without requiring a page reload
      selectedOrders.forEach(order => {
        // Calculate the new values based on the allocations
        const allocatedAmount = orderAmounts.find(oa => oa.orderId === order.id)?.allocatedSubtotal || 0
        const currentIssuedSubtotal = order.issued_subtotal || 0
        const newIssuedSubtotal = currentIssuedSubtotal + allocatedAmount
        const newRemainingSubtotal = (order.remaining_subtotal || 0) - allocatedAmount
        
        // Update the invoice order with new values
        const updatedOrder = {
          ...order,
          issued_subtotal: newIssuedSubtotal,
          remaining_subtotal: Math.max(0, newRemainingSubtotal),
          // Update status based on remaining amount
          status: newRemainingSubtotal <= 0 ? 'issued' : 'partially_issued'
        }
        
        // Update in the store system for optimistic updates
        updateInvoiceOrderInCaches(queryClient, updatedOrder)
        
        // Trigger a store update event to notify components that need to refresh their local state
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('storeUpdated', { 
            detail: { 
              orderId: order.id,
              action: 'invoice_order_updated'
            } 
          }))
        }
      })
      
      // Also invalidate queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['v_invoice_orders_list'] })
      queryClient.invalidateQueries({ queryKey: ['v_issued_invoices_list'] })
      
      // Invalidate invoice order specific queries
      selectedOrders.forEach(order => {
        queryClient.invalidateQueries({ 
          queryKey: ['issued-invoices-for-order', order.id] 
        })
      })
      
      // Trigger a custom event to notify other components about the invoice creation
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('invoiceCreatedAndIssued', { 
          detail: { 
            invoiceId, 
            orderIds: selectedOrders.map(o => o.id),
            action: 'invoice_created_and_issued'
          } 
        }))
        
        // Also trigger a specific event for invoice order updates
        selectedOrders.forEach(order => {
          window.dispatchEvent(new CustomEvent('invoiceOrderUpdated', { 
            detail: { 
              orderId: order.id, 
              action: 'invoice_created',
              updatedOrder: {
                ...order,
                issued_subtotal: (order.issued_subtotal || 0) + (orderAmounts.find(oa => oa.orderId === order.id)?.allocatedSubtotal || 0),
                remaining_subtotal: Math.max(0, (order.remaining_subtotal || 0) - (orderAmounts.find(oa => oa.orderId === order.id)?.allocatedSubtotal || 0))
              }
            } 
          }))
        })
      }
      
      onClose()
    } catch (err: any) {
      console.error('Error creating and issuing invoice:', err)
      toast({
        title: 'Error',
        description: err?.message || 'Failed to create and issue invoice',
        variant: 'destructive',
      })
    } finally {
      setIsCreating(false)
    }
  }

  const totalAllocated = orderAmounts.reduce((sum, order) => sum + order.allocatedSubtotal, 0)
  const hasPartialInvoicing = orderAmounts.some(order => order.isPartial)

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create and Issue Invoice</DialogTitle>
          <DialogDescription>
            Create and issue an invoice from {selectedOrders.length} selected order{selectedOrders.length !== 1 ? 's' : ''}.
            Order allocations are done via subtotals. This will immediately issue the invoice and update order statuses.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Invoice Details */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-4">Invoice Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="invoice-number" className="text-sm font-medium text-gray-700">
                  Invoice Number *
                </Label>
                <Input
                  id="invoice-number"
                  value={formData.invoice_number}
                  onChange={(e) => handleFormChange('invoice_number', e.target.value)}
                  placeholder="Enter invoice number"
                  disabled={isCreating}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="external-invoice-id" className="text-sm font-medium text-gray-700">
                  External Invoice ID
                </Label>
                <Input
                  id="external-invoice-id"
                  value={formData.external_invoice_id}
                  onChange={(e) => handleFormChange('external_invoice_id', e.target.value)}
                  placeholder="Enter external invoice ID"
                  disabled={isCreating}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="invoice-date" className="text-sm font-medium text-gray-700">
                  Invoice Date *
                </Label>
                <Input
                  id="invoice-date"
                  type="date"
                  value={formData.invoice_date}
                  onChange={(e) => handleFormChange('invoice_date', e.target.value)}
                  disabled={isCreating}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Invoice PDF Upload */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-4">Invoice PDF</h3>
            {!pdfFile ? (
              <Dropzone
                tableName="issued_client_invoices"
                recordId={0} // Will be set after invoice creation
                bucketName="invoices"
                attachments={[]}
                signedUrls={{}}
                isUploading={isUploading}
                uploadError={null}
                uploadFiles={handlePdfUpload}
                deleteAttachment={handleRemovePdf}
                className="border-2 border-dashed border-gray-300 rounded-lg p-4"
              />
            ) : (
              <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="text-red-500">
                    📄
                  </div>
                  <span className="text-sm font-medium text-gray-900">{pdfFile.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemovePdf}
                  disabled={isCreating}
                  className="text-gray-400 hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Invoice Totals */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-4">Invoice Totals</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="subtotal" className="text-sm font-medium text-gray-700">
                  Subtotal *
                </Label>
                <Input
                  id="subtotal"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.subtotal}
                  onChange={(e) => handleFormChange('subtotal', parseFloat(e.target.value) || 0)}
                  disabled={isCreating}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="vat" className="text-sm font-medium text-gray-700">
                  VAT
                </Label>
                <Input
                  id="vat"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.vat_amount}
                  onChange={(e) => handleFormChange('vat_amount', parseFloat(e.target.value) || 0)}
                  disabled={isCreating}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="total" className="text-sm font-medium text-gray-700">
                  Total
                </Label>
                <Input
                  id="total"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.total_amount}
                  onChange={(e) => handleFormChange('total_amount', parseFloat(e.target.value) || 0)}
                  disabled={isCreating}
                  className="mt-1"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              VAT is automatically calculated at 23% when you change the subtotal.
            </p>
          </div>

          {/* Notes */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-4">Notes</h3>
            <Label htmlFor="notes" className="text-sm font-medium text-gray-700">
              Invoice Notes
            </Label>
            <Input
              id="notes"
              value={formData.notes}
              onChange={(e) => handleFormChange('notes', e.target.value)}
              placeholder="Enter any notes for the invoice"
              disabled={isCreating}
              className="mt-1"
            />
          </div>

          {/* Summary */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-900">Summary</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBillRemainingForAll}
                disabled={isCreating}
                className="text-blue-600 border-blue-300 hover:bg-blue-100"
              >
                Bill Remaining for All
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-blue-700">Total Allocated (Subtotal):</span>
                <span className="ml-2 font-medium text-blue-900">
                  {formatCurrency(totalAllocated, selectedOrders[0]?.currency_code)}
                </span>
              </div>
              <div>
                <span className="text-blue-700">Orders:</span>
                <span className="ml-2 font-medium text-blue-900">{selectedOrders.length}</span>
              </div>
              <div>
                <span className="text-blue-700">Invoice Subtotal:</span>
                <span className="ml-2 font-medium text-blue-900">
                  {formatCurrency(formData.subtotal, selectedOrders[0]?.currency_code)}
                </span>
              </div>
              <div>
                <span className="text-blue-700">Unallocated (Subtotal):</span>
                <span className={`ml-2 font-medium ${formData.subtotal - totalAllocated < 0 ? 'text-red-600' : 'text-blue-900'}`}>
                  {formatCurrency(formData.subtotal - totalAllocated, selectedOrders[0]?.currency_code)}
                </span>
              </div>
            </div>
            
            {totalAllocated > formData.subtotal && (
              <div className="mt-3 p-2 bg-red-100 border border-red-300 rounded text-sm text-red-700">
                ⚠️ Total allocated subtotal exceeds invoice subtotal. Please reduce allocations or increase invoice subtotal.
              </div>
            )}
          </div>

          {/* Orders List */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-900">Order Allocations (Subtotals)</h3>
            {orderAmounts.map((order) => {
              const originalOrder = selectedOrders.find(o => o.id === order.orderId)
              if (!originalOrder) return null

              return (
                <div key={order.orderId} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-medium text-gray-900">
                          Order #{order.orderId}
                        </span>
                        {order.isPartial && (
                          <Badge variant="secondary" className="text-xs">
                            Partial
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {originalOrder.project_name || 'No project'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Remaining (Subtotal)</div>
                      <div className="font-medium">
                        {formatCurrency(order.remainingSubtotal, originalOrder.currency_code)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="flex-1">
                      <Label htmlFor={`amount-${order.orderId}`} className="text-sm font-medium text-gray-700">
                        Allocated Subtotal
                      </Label>
                      <Input
                        id={`amount-${order.orderId}`}
                        type="number"
                        step="0.01"
                        min="0"
                        max={order.remainingSubtotal}
                        value={order.allocatedSubtotal.toFixed(2)}
                        onChange={(e) => handleAmountChange(order.orderId, e.target.value)}
                        disabled={isCreating}
                        className="mt-1"
                      />
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Currency</div>
                      <div className="font-medium">{originalOrder.currency_code}</div>
                    </div>
                  </div>

                  {order.isPartial && (
                    <div className="mt-2 text-sm text-gray-500">
                      Remaining (Subtotal): {formatCurrency(order.remainingSubtotal - order.allocatedSubtotal, originalOrder.currency_code)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button 
            onClick={handleCreateAndIssueInvoice} 
            disabled={isCreating || !formData.invoice_number.trim() || !formData.invoice_date || formData.subtotal <= 0 || totalAllocated <= 0 || totalAllocated > formData.subtotal}
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating and Issuing...
              </>
            ) : (
              'Create and Issue Invoice'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 