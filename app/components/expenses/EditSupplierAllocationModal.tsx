"use client"

import React, { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { toast } from '../ui/use-toast'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { updateSupplierPaymentAllocationsInCaches } from './supplier-payment-cache-utils'

interface EditSupplierAllocationModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  allocation: {
    payment_id: number
    received_invoice_id: number
    amount_applied: number
    payment_date: string
    payment_amount: number
    payment_currency: string
    method: string
    external_ref: string
    payer_team_name: string
  } | null
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

export function EditSupplierAllocationModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  allocation
}: EditSupplierAllocationModalProps) {
  const [newAmount, setNewAmount] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

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
      // Optimistically update the caches first
      const updatedAllocation = {
        ...allocation,
        amount_applied: parsedAmount
      }
      
      // Get current allocations and update the specific one
      const { data: currentAllocations } = await supabase
        .from('supplier_payment_allocations')
        .select('*')
        .eq('payment_id', allocation.payment_id)
      
      const newAllocations = currentAllocations?.map(alloc => 
        alloc.received_invoice_id === allocation.received_invoice_id 
          ? { ...alloc, amount_applied: parsedAmount }
          : alloc
      ) || []
      
      // Update caches optimistically
      updateSupplierPaymentAllocationsInCaches(queryClient, allocation.payment_id, newAllocations)
      
      // Update the allocation amount in database
      const { error } = await supabase
        .from('supplier_payment_allocations')
        .update({ amount_applied: parsedAmount })
        .eq('payment_id', allocation.payment_id)
        .eq('received_invoice_id', allocation.received_invoice_id)

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Allocation updated successfully',
      })

      onSuccess()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update allocation',
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
          <DialogTitle>Edit Allocation</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-500">Payment Details</Label>
            <div className="text-sm">
              <div>Payment #{allocation.payment_id}</div>
              <div>Date: {formatDate(allocation.payment_date)}</div>
              <div>Total Amount: {formatCurrency(allocation.payment_amount, allocation.payment_currency)}</div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Allocation Amount</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              max={allocation.payment_amount}
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              placeholder="Enter amount"
            />
            <div className="text-xs text-gray-500">
              Maximum: {formatCurrency(allocation.payment_amount, allocation.payment_currency)}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? 'Updating...' : 'Update Allocation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
