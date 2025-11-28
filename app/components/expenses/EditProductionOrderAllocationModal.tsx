"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { toast } from '../ui/use-toast'

interface ProductionOrderAllocation {
  id: number
  received_invoice_id: number
  production_order_id: number
  amount_subtotal_allocated: number
  production_orders: {
    id: number
    period_month: string
    subtotal_amount: number
    currency_code: string
  }
}

interface EditProductionOrderAllocationModalProps {
  allocation: ProductionOrderAllocation | null
  isOpen: boolean
  onClose: () => void
  onAllocationUpdated: () => void
}

export function EditProductionOrderAllocationModal({ 
  allocation, 
  isOpen, 
  onClose, 
  onAllocationUpdated 
}: EditProductionOrderAllocationModalProps) {
  const [formData, setFormData] = useState({
    amount_subtotal_allocated: 0
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const supabase = createClientComponentClient()

  // Update form data when allocation changes
  useEffect(() => {
    if (allocation) {
      setFormData({
        amount_subtotal_allocated: allocation.amount_subtotal_allocated || 0
      })
    }
  }, [allocation])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!allocation) return

    setIsSubmitting(true)
    try {
      const { error } = await supabase
        .from('received_invoice_allocations')
        .update({
          amount_subtotal_allocated: formData.amount_subtotal_allocated
        })
        .eq('id', allocation.id)

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Production order allocation updated successfully'
      })

      onAllocationUpdated()
      onClose()
    } catch (error: any) {
      console.error('Error updating allocation:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to update allocation',
        variant: 'destructive'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!allocation) return null

  const order = allocation.production_orders

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Production Order Allocation</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Period Month</Label>
              <div className="text-sm text-gray-900">
                {new Date(order.period_month).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long' 
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Original Subtotal</Label>
              <div className="text-sm text-gray-900">
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: order.currency_code || 'EUR',
                }).format(order.subtotal_amount)}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount_subtotal_allocated" className="text-sm font-medium text-gray-700">
                Allocated Subtotal *
              </Label>
              <Input
                id="amount_subtotal_allocated"
                type="number"
                step="0.01"
                value={formData.amount_subtotal_allocated}
                onChange={(e) => setFormData({
                  ...formData,
                  amount_subtotal_allocated: parseFloat(e.target.value) || 0
                })}
                onFocus={(e) => e.target.select()}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

