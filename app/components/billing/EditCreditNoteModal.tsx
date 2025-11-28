"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { toast } from '../ui/use-toast'
import { updateCreditNote } from '../../lib/creditNotes'
import type { CreateCreditNoteData } from '../../lib/types/billing'

interface EditCreditNoteModalProps {
  creditNote: any
  isOpen: boolean
  onClose: () => void
  onCreditNoteUpdated: (creditNote: any) => void
}

export function EditCreditNoteModal({ 
  creditNote, 
  isOpen, 
  onClose, 
  onCreditNoteUpdated 
}: EditCreditNoteModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState<Partial<CreateCreditNoteData>>({
    credit_number: '',
    credit_date: '',
    currency_code: '',
    subtotal_amount: 0,
    vat_amount: 0,
    total_amount: 0,
    reason: '',
  })

  // Initialize form data when credit note changes
  useEffect(() => {
    if (creditNote) {
      setFormData({
        credit_number: creditNote.credit_number || '',
        credit_date: creditNote.credit_date || '',
        currency_code: creditNote.currency_code || '',
        subtotal_amount: creditNote.subtotal_amount || 0,
        vat_amount: creditNote.vat_amount || 0,
        total_amount: creditNote.total_amount || 0,
        reason: creditNote.reason || '',
      })
    }
  }, [creditNote])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.credit_date || !formData.total_amount) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)

    try {
      const { data: updatedCreditNote, error } = await updateCreditNote(creditNote.credit_note_id, formData as CreateCreditNoteData)

      if (error) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to update credit note',
          variant: 'destructive',
        })
        return
      }

      if (!updatedCreditNote) {
        toast({
          title: 'Error',
          description: 'Credit note updated but no data returned',
          variant: 'destructive',
        })
        return
      }

      toast({
        title: 'Success',
        description: 'Credit note updated successfully',
      })
      
      onCreditNoteUpdated(updatedCreditNote)
      onClose()
      
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update credit note',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    onClose()
  }

  const calculateTotal = () => {
    const subtotal = formData.subtotal_amount || 0
    const vat = formData.vat_amount || 0
    return subtotal + vat
  }

  const handleSubtotalChange = (value: number) => {
    setFormData(prev => {
      const vatAmount = prev.vat_amount || 0
      const totalAmount = value + vatAmount
      
      return {
        ...prev,
        subtotal_amount: value,
        total_amount: totalAmount
      }
    })
  }

  const handleVatChange = (value: number) => {
    setFormData(prev => ({
      ...prev,
      vat_amount: value,
      total_amount: (prev.subtotal_amount || 0) + value
    }))
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Credit Note</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Credit Number */}
          <div>
            <Label htmlFor="credit_number">Credit Number</Label>
            <Input
              id="credit_number"
              value={formData.credit_number || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, credit_number: e.target.value }))}
              placeholder="Auto-generated if left empty"
            />
          </div>

          {/* Credit Date */}
          <div>
            <Label htmlFor="credit_date">Credit Date *</Label>
            <Input
              id="credit_date"
              type="date"
              value={formData.credit_date || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, credit_date: e.target.value }))}
              required
            />
          </div>

          {/* Currency */}
          <div>
            <Label htmlFor="currency_code">Currency</Label>
            <Input
              id="currency_code"
              value={formData.currency_code || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, currency_code: e.target.value }))}
              required
            />
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label htmlFor="subtotal_amount">Subtotal</Label>
              <Input
                id="subtotal_amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.subtotal_amount || ''}
                onChange={(e) => handleSubtotalChange(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="vat_amount">VAT</Label>
              <Input
                id="vat_amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.vat_amount || ''}
                onChange={(e) => handleVatChange(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="total_amount">Total *</Label>
              <Input
                id="total_amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.total_amount || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, total_amount: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          {/* Auto-calculated total display */}
          <div className="text-sm text-gray-600">
            Auto-calculated total: {calculateTotal().toFixed(2)} {formData.currency_code}
          </div>

          {/* Reason */}
          <div>
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              value={formData.reason || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
              placeholder="Enter reason for credit note..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Updating...' : 'Update Credit Note'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
