"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import { Loader2, Info } from 'lucide-react'
import { createDraftIssuedInvoice } from '../../lib/services/billing'
import { toast } from '../ui/use-toast'
import { InvoiceOrder } from '../../lib/types/billing'

const formatCurrency = (amount: number, currencyCode: string | null = 'EUR') => {
  const safeCurrencyCode = currencyCode || 'EUR'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: safeCurrencyCode,
  }).format(amount)
}

interface CreateDraftInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  selectedOrders: InvoiceOrder[]
  onSuccess: (invoiceId: number) => void
}

interface OrderAmount {
  orderId: number
  remainingAmount: number
  billedAmount: number
  isPartial: boolean
}

export function CreateDraftInvoiceModal({ 
  isOpen, 
  onClose, 
  selectedOrders, 
  onSuccess 
}: CreateDraftInvoiceModalProps) {
  const [orderAmounts, setOrderAmounts] = useState<OrderAmount[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [customInvoiceSubtotal, setCustomInvoiceSubtotal] = useState<string>('')
  const [useCustomSubtotal, setUseCustomSubtotal] = useState(false)

  // Initialize order amounts when modal opens
  useEffect(() => {
    if (isOpen && selectedOrders.length > 0) {
      const amounts = selectedOrders.map(order => ({
        orderId: order.id,
        remainingAmount: order.remaining_subtotal || order.total_amount, // Use remaining_subtotal or fallback to total_amount
        billedAmount: order.remaining_subtotal || order.total_amount, // Default to remaining_subtotal or fallback to total_amount
        isPartial: false
      }))
      setOrderAmounts(amounts)
      
      // Initialize custom subtotal as sum of all remaining amounts
      const totalRemaining = amounts.reduce((sum, order) => sum + order.remainingAmount, 0)
      setCustomInvoiceSubtotal(totalRemaining.toFixed(2))
      setUseCustomSubtotal(false)
    }
  }, [isOpen, selectedOrders])

  const handleAmountChange = (orderId: number, newAmount: string) => {
    const amount = parseFloat(newAmount) || 0
    setOrderAmounts(prev => prev.map(order => {
      if (order.orderId === orderId) {
        const remaining = order.remainingAmount
        const billed = Math.min(amount, remaining) // Ensure we don't exceed remaining
        return {
          ...order,
          billedAmount: billed,
          isPartial: billed < remaining
        }
      }
      return order
    }))
  }

  const handleBillRemainingForAll = () => {
    setOrderAmounts(prev => prev.map(order => ({
      ...order,
      billedAmount: order.remainingAmount,
      isPartial: false
    })))
  }

  const handleCreateInvoice = async () => {
    setIsCreating(true)
    try {
      // Prepare the parameters for the RPC call
      const orderIds = orderAmounts.map(order => order.orderId)
      const overrides: { [key: string]: number } = {}
      
      // Add overrides for partial amounts
      orderAmounts.forEach(order => {
        if (order.billedAmount > 0) {
          overrides[order.orderId.toString()] = order.billedAmount
        }
      })

      // Add custom invoice subtotal if enabled
      const invoiceSubtotal = useCustomSubtotal ? parseFloat(customInvoiceSubtotal) || 0 : null

      console.log('Creating draft invoice with:', { orderIds, overrides, invoiceSubtotal })

      const { data: invoiceId, error } = await createDraftIssuedInvoice(orderIds, overrides, invoiceSubtotal)
      
      if (error) {
        throw error
      }

      toast({
        title: 'Success',
        description: 'Draft invoice created successfully',
      })

      onSuccess(invoiceId!)
      onClose()
    } catch (err: any) {
      console.error('Error creating draft invoice:', err)
      toast({
        title: 'Error',
        description: err?.message || 'Failed to create draft invoice',
        variant: 'destructive',
      })
    } finally {
      setIsCreating(false)
    }
  }

  const totalBilledAmount = orderAmounts.reduce((sum, order) => sum + order.billedAmount, 0)
  const totalRemainingAmount = orderAmounts.reduce((sum, order) => sum + order.remainingAmount, 0)
  const hasPartialInvoicing = orderAmounts.some(order => order.isPartial)
  const customSubtotalValue = parseFloat(customInvoiceSubtotal) || 0
  const unallocatedAmount = useCustomSubtotal ? customSubtotalValue - totalBilledAmount : 0

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Draft Invoice</DialogTitle>
          <DialogDescription>
            Create a draft invoice from {selectedOrders.length} selected order{selectedOrders.length !== 1 ? 's' : ''}.
            You can set a custom invoice subtotal and allocate amounts to orders independently.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Invoice Subtotal Section */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="flex items-center space-x-2 mb-3">
              <Info className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-medium text-blue-900">Invoice Subtotal</h3>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="use-custom-subtotal"
                  checked={useCustomSubtotal}
                  onChange={(e) => setUseCustomSubtotal(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="use-custom-subtotal" className="text-sm font-medium text-blue-900">
                  Set custom invoice subtotal (independent of order allocations)
                </Label>
              </div>
              
              {useCustomSubtotal && (
                <div className="space-y-2">
                  <Label htmlFor="custom-subtotal" className="text-sm font-medium text-blue-900">
                    Invoice Subtotal Amount
                  </Label>
                  <Input
                    id="custom-subtotal"
                    type="number"
                    step="0.01"
                    min="0"
                    value={customInvoiceSubtotal}
                    onChange={(e) => setCustomInvoiceSubtotal(e.target.value)}
                    disabled={isCreating}
                    placeholder="Enter invoice subtotal"
                    className="max-w-xs"
                  />
                  <p className="text-xs text-blue-700">
                    This amount will be the invoice subtotal regardless of how much you allocate to orders.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Summary</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBillRemainingForAll}
                disabled={isCreating}
              >
                Bill Remaining for All
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Total Allocated:</span>
                <span className="ml-2 font-medium">
                  {formatCurrency(totalBilledAmount, selectedOrders[0]?.currency_code)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Orders:</span>
                <span className="ml-2 font-medium">{selectedOrders.length}</span>
              </div>
              {useCustomSubtotal && (
                <>
                  <div>
                    <span className="text-gray-500">Invoice Subtotal:</span>
                    <span className="ml-2 font-medium">
                      {formatCurrency(customSubtotalValue, selectedOrders[0]?.currency_code)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Unallocated:</span>
                    <span className={`ml-2 font-medium ${unallocatedAmount < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatCurrency(unallocatedAmount, selectedOrders[0]?.currency_code)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Orders List */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-900">Order Allocations</h3>
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
                      <div className="text-sm text-gray-500">Remaining</div>
                      <div className="font-medium">
                        {formatCurrency(order.remainingAmount, originalOrder.currency_code)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="flex-1">
                      <Label htmlFor={`amount-${order.orderId}`} className="text-sm font-medium text-gray-700">
                        Allocated Amount
                      </Label>
                      <Input
                        id={`amount-${order.orderId}`}
                        type="number"
                        step="0.01"
                        min="0"
                        max={order.remainingAmount}
                        value={order.billedAmount.toFixed(2)}
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
                      Remaining: {formatCurrency(order.remainingAmount - order.billedAmount, originalOrder.currency_code)}
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
            onClick={handleCreateInvoice} 
            disabled={isCreating || totalBilledAmount === 0 || (useCustomSubtotal && customSubtotalValue <= 0)}
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Draft Invoice'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 