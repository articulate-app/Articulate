"use client"

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { toast } from '../ui/use-toast'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useQueryClient } from '@tanstack/react-query'

interface EditSupplierInvoiceAllocationModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  allocation: {
    received_invoice_id: number
    production_order_id: number
    amount_subtotal_allocated: number
    invoice_number: string
    invoice_date: string
    currency_code: string
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

export default function EditSupplierInvoiceAllocationModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  allocation
}: EditSupplierInvoiceAllocationModalProps) {
  const [newAmount, setNewAmount] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const queryClient = useQueryClient()
  const supabase = createClientComponentClient()

  // Update the amount when allocation changes
  React.useEffect(() => {
    if (allocation) {
      setNewAmount(allocation.amount_subtotal_allocated.toString())
    }
  }, [allocation])

  const handleSubmit = async () => {
    if (!allocation) return

    const parsedAmount = parseFloat(newAmount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid amount greater than 0',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)
    try {
      // Update the allocation amount
      const { error } = await supabase
        .from('received_invoice_allocations')
        .update({ amount_subtotal_allocated: parsedAmount })
        .eq('received_invoice_id', allocation.received_invoice_id)
        .eq('production_order_id', allocation.production_order_id)

      if (error) throw error
      
      toast({
        title: 'Success',
        description: 'Allocation updated successfully',
      })
      onSuccess()
      onClose()
    } catch (error: any) {
      console.error('Error updating allocation:', error)
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
          <DialogTitle>Edit Invoice Allocation</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Invoice Info */}
          <div className="space-y-2 p-3 bg-gray-50 rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Invoice</span>
              <span className="font-medium">#{allocation.invoice_number}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Date</span>
              <span>{formatDate(allocation.invoice_date)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Current Allocation</span>
              <span className="font-medium">{formatCurrency(allocation.amount_subtotal_allocated, allocation.currency_code)}</span>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="amount">New Allocation Amount</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              placeholder="Enter amount"
            />
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
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

