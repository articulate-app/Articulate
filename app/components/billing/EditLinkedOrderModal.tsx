"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Trash2 } from 'lucide-react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { toast } from '../ui/use-toast'

interface LinkedOrder {
  id: number
  issued_invoice_id: number
  invoice_order_id: number
  amount_override_total: number
  amount_override_subtotal: number
  amount_override_vat: number
  invoice_orders: {
    id: number
    billing_period_start: string
    billing_period_end: string
    subtotal_amount: number
    vat_amount: number
    total_amount: number
    projects: {
      name: string
      color: string
    } | null
  }
}

interface EditLinkedOrderModalProps {
  linkedOrder: LinkedOrder | null
  isOpen: boolean
  onClose: () => void
  onOrderUpdated: () => void
}

export function EditLinkedOrderModal({ 
  linkedOrder, 
  isOpen, 
  onClose, 
  onOrderUpdated 
}: EditLinkedOrderModalProps) {
  console.log('EditLinkedOrderModal - Props received:', { linkedOrder, isOpen })
  
  const [formData, setFormData] = useState({
    amount_override_total: 0,
    amount_override_subtotal: 0,
    amount_override_vat: 0
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const supabase = createClientComponentClient()

  // Update form data when linked order changes
  useEffect(() => {
    if (linkedOrder) {
      console.log('EditLinkedOrderModal - Initializing form with data:', {
        amount_override_subtotal: linkedOrder.amount_override_subtotal,
        amount_override_vat: linkedOrder.amount_override_vat,
        amount_override_total: linkedOrder.amount_override_total,
        original_subtotal: linkedOrder.invoice_orders?.subtotal_amount,
        original_vat: linkedOrder.invoice_orders?.vat_amount,
        original_total: linkedOrder.invoice_orders?.total_amount
      })
      
      // If there are no overrides yet, use the original order amounts
      // If there are overrides, use those values
      const hasOverrides = linkedOrder.amount_override_subtotal !== null && linkedOrder.amount_override_subtotal !== undefined
      
      const subtotal = hasOverrides ? linkedOrder.amount_override_subtotal : (linkedOrder.invoice_orders?.subtotal_amount || 0)
      const vat = hasOverrides ? linkedOrder.amount_override_vat : (linkedOrder.invoice_orders?.vat_amount || 0)
      const total = hasOverrides ? linkedOrder.amount_override_total : (linkedOrder.invoice_orders?.total_amount || 0)
      
      console.log('EditLinkedOrderModal - Calculated form values:', { 
        hasOverrides, 
        subtotal, 
        vat, 
        total 
      })
      
      setFormData({
        amount_override_total: total,
        amount_override_subtotal: subtotal,
        amount_override_vat: vat
      })
    }
  }, [linkedOrder])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!linkedOrder) return

    setIsSubmitting(true)
    try {
      const { error } = await supabase
        .from('issued_invoice_orders')
        .update({
          amount_override_total: formData.amount_override_total,
          amount_override_subtotal: formData.amount_override_subtotal,
          amount_override_vat: formData.amount_override_vat
        })
        .eq('id', linkedOrder.id)

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Linked order updated successfully',
      })

      onOrderUpdated()
      onClose()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update linked order',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!linkedOrder) return

    setIsDeleting(true)
    try {
      const { error } = await supabase
        .from('issued_invoice_orders')
        .delete()
        .eq('id', linkedOrder.id)

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Linked order removed successfully',
      })

      onOrderUpdated()
      onClose()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove linked order',
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleInputChange = (field: keyof typeof formData, value: number) => {
    setFormData(prev => {
      const newData = {
        ...prev,
        [field]: value
      }
      
      // Auto-recalculate when subtotal changes
      if (field === 'amount_override_subtotal') {
        const vatRate = 0.23 // 23% VAT rate
        const vatAmount = Math.round(value * vatRate * 100) / 100
        const totalAmount = value + vatAmount
        
        newData.amount_override_vat = vatAmount
        newData.amount_override_total = totalAmount
      }
      
      return newData
    })
  }

  const formatCurrency = (amount: number, currency: string = 'EUR') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  if (!linkedOrder || !linkedOrder.invoice_orders) {
    console.log('EditLinkedOrderModal - linkedOrder or invoice_orders is null, not rendering')
    return null
  }

  console.log('EditLinkedOrderModal - Rendering modal with linkedOrder:', linkedOrder)
  console.log('EditLinkedOrderModal - isOpen:', isOpen)
  console.log('EditLinkedOrderModal - About to render Dialog component')

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md z-[9999]">
        <DialogHeader>
          <DialogTitle>
            Edit Linked Order
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Order Info */}
          <div className="bg-gray-50 p-3 rounded-md">
            <div className="text-sm font-medium text-gray-900">
              {linkedOrder.invoice_orders?.projects?.name || 
               linkedOrder.invoice_orders?.id ? 
               `Order #${linkedOrder.invoice_orders.id}` : 
               'Unknown Order'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {linkedOrder.invoice_orders?.billing_period_start && linkedOrder.invoice_orders?.billing_period_end ? 
                `${formatDate(linkedOrder.invoice_orders.billing_period_start)} - ${formatDate(linkedOrder.invoice_orders.billing_period_end)}` : 
                'Period not available'}
            </div>
            <div className="text-xs text-gray-500">
              Original: {formatCurrency(linkedOrder.invoice_orders?.total_amount || 0)}
            </div>
          </div>

          {/* Amount Fields */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="amount_override_subtotal" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Subtotal Amount
              </Label>
              <Input
                id="amount_override_subtotal"
                type="number"
                step="0.01"
                value={formData.amount_override_subtotal}
                onChange={(e) => handleInputChange('amount_override_subtotal', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="h-9"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="amount_override_vat" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                VAT Amount
              </Label>
              <Input
                id="amount_override_vat"
                type="number"
                step="0.01"
                value={formData.amount_override_vat}
                onChange={(e) => handleInputChange('amount_override_vat', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="h-9"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="amount_override_total" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Total Amount
              </Label>
              <Input
                id="amount_override_total"
                type="number"
                step="0.01"
                value={formData.amount_override_total}
                onChange={(e) => handleInputChange('amount_override_total', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="h-9"
              />
            </div>
          </div>

          <DialogFooter className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={handleDelete}
              disabled={isSubmitting || isDeleting}
              className="text-red-600 border-red-300 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {isDeleting ? 'Removing...' : 'Remove Order'}
            </Button>
            <div className="flex space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting || isDeleting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || isDeleting}
                className="bg-black text-white hover:bg-gray-800"
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
} 