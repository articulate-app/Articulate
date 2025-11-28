"use client"

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { toast } from '../ui/use-toast'
import { deleteAllocation, replacePaymentAllocations } from '../../lib/payments'
import { useQueryClient } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface EditAllocationModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  allocation: {
    payment_id: number
    issued_invoice_id?: number
    received_invoice_id?: number
    amount_applied: number
    payment_date: string
    payment_amount: number
    payment_currency: string
    method: string
    external_ref: string
    payer_team_name: string
    direction?: 'ar' | 'ap'
  } | null
  invoiceId: number
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
    day: 'numeric'
  })
}

export default function EditAllocationModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  allocation, 
  invoiceId 
}: EditAllocationModalProps) {
  const [newAmount, setNewAmount] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const queryClient = useQueryClient()
  const supabase = createClientComponentClient()

  // Update the amount when allocation changes
  React.useEffect(() => {
    if (allocation) {
      setNewAmount(allocation.amount_applied.toString())
    }
  }, [allocation])

  const handleSubmit = async () => {
    if (!allocation) return

    const parsedAmount = parseFloat(newAmount)
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid amount',
        variant: 'destructive',
      })
      return
    }

    if (parsedAmount > allocation.payment_amount) {
      toast({
        title: 'Amount Too High',
        description: 'Amount cannot exceed the total payment amount',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)
    try {
      const direction = allocation.direction || 'ar'
      
      if (direction === 'ap') {
        // For AP payments, update supplier_payment_allocations
        const invoiceIdToUpdate = allocation.received_invoice_id
        if (!invoiceIdToUpdate) throw new Error('Invoice ID is missing')
        
        // Delete old allocation
        const { error: deleteError } = await supabase
          .from('supplier_payment_allocations')
          .delete()
          .eq('payment_id', allocation.payment_id)
          .eq('received_invoice_id', invoiceIdToUpdate)
        
        if (deleteError) throw deleteError
        
        // Insert new allocation
        const { error: insertError } = await supabase
          .from('supplier_payment_allocations')
          .insert({
            payment_id: allocation.payment_id,
            received_invoice_id: invoiceIdToUpdate,
            amount_applied: parsedAmount
          })
        
        if (insertError) throw insertError
      } else {
        // For AR payments, use existing functions
        await deleteAllocation(allocation.payment_id, allocation.issued_invoice_id!)
        
        const { error } = await replacePaymentAllocations(allocation.payment_id, [{
          issued_invoice_id: allocation.issued_invoice_id!,
          amount_applied: parsedAmount
        }])

        if (error) throw error
      }

      // Just invalidate the specific invoice data - let parent handle the rest
      await queryClient.invalidateQueries({ queryKey: ["issued-invoice", invoiceId] })
      await queryClient.invalidateQueries({ queryKey: ["invoice-payment-allocations", invoiceId] })
      await queryClient.invalidateQueries({ queryKey: ['payment', allocation.payment_id] })
      
      toast({
        title: 'Success',
        description: 'Allocation updated successfully',
      })
      onSuccess()
      onClose()
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update allocation',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!allocation) return

    setIsLoading(true)
    try {
      const direction = allocation.direction || 'ar'
      
      if (direction === 'ap') {
        // For AP payments, delete from supplier_payment_allocations
        const invoiceIdToDelete = allocation.received_invoice_id
        if (!invoiceIdToDelete) throw new Error('Invoice ID is missing')
        
        const { error } = await supabase
          .from('supplier_payment_allocations')
          .delete()
          .eq('payment_id', allocation.payment_id)
          .eq('received_invoice_id', invoiceIdToDelete)
        
        if (error) throw error
      } else {
        // For AR payments, use existing function
        if (!allocation.issued_invoice_id) throw new Error('Invoice ID is missing')
        const { error } = await deleteAllocation(allocation.payment_id, allocation.issued_invoice_id)
        if (error) throw error
      }

      // Just invalidate the specific invoice data - let parent handle the rest
      await queryClient.invalidateQueries({ queryKey: ["issued-invoice", invoiceId] })
      await queryClient.invalidateQueries({ queryKey: ["invoice-payment-allocations", invoiceId] })
      await queryClient.invalidateQueries({ queryKey: ['payment', allocation.payment_id] })
      
      toast({
        title: 'Success',
        description: 'Allocation removed successfully',
      })
      onSuccess()
      onClose()
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove allocation',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (!allocation) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Payment Allocation</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Payment Info */}
          <div className="bg-gray-50 rounded-lg p-3">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Payment Details</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Date:</span>
                <span>{formatDate(allocation.payment_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Amount:</span>
                <span>{formatCurrency(allocation.payment_amount, allocation.payment_currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Payer:</span>
                <span>{allocation.payer_team_name}</span>
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="amount">Allocation Amount</Label>
            <Input
              id="amount"
              type="number"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              placeholder="Enter amount"
              min="0"
              max={allocation.payment_amount}
              step="0.01"
            />
            <p className="text-xs text-gray-500">
              Maximum: {formatCurrency(allocation.payment_amount, allocation.payment_currency)}
            </p>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isLoading}
          >
            Remove Allocation
          </Button>
          <div className="flex space-x-2">
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? 'Updating...' : 'Update'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
