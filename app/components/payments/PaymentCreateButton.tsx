"use client"

import React, { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '../ui/button'
import { SlidePanel } from '../ui/slide-panel'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { toast } from '../ui/use-toast'
import { createPayment, createPaymentLegacy, type CreatePaymentArgs } from '../../lib/payments'
import { useCurrentUserStore } from '../../store/current-user'
import type { CreatePaymentData } from '../../lib/types/billing'

interface PaymentCreateButtonProps {
  onPaymentCreated: (paymentId: number) => void
}

const CURRENCY_OPTIONS = [
  { id: 'EUR', label: 'EUR' },
  { id: 'USD', label: 'USD' },
  { id: 'GBP', label: 'GBP' },
]

const METHOD_OPTIONS = [
  { id: 'Bank Transfer', label: 'Bank Transfer' },
  { id: 'Credit Card', label: 'Credit Card' },
  { id: 'Check', label: 'Check' },
  { id: 'Cash', label: 'Cash' },
  { id: 'Wire Transfer', label: 'Wire Transfer' },
]

export function PaymentCreateButton({ onPaymentCreated }: PaymentCreateButtonProps) {
  const currentUserId = useCurrentUserStore((s) => s.publicUserId)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState<Partial<CreatePaymentData>>({
    payment_date: new Date().toISOString().split('T')[0],
    payment_currency: 'EUR',
    method: 'Bank Transfer',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.payer_team_id || !formData.payment_amount || !formData.payment_currency || !formData.method) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)
    try {
      const paymentArgs: CreatePaymentArgs = {
        payerTeamId: formData.payer_team_id!,
        paidToTeamId: formData.paid_to_team_id,
        receivedByUserId: currentUserId || undefined,
        paymentDate: formData.payment_date!,
        amount: formData.payment_amount!,
        currency: formData.payment_currency!,
        method: formData.method!,
        externalRef: formData.external_ref,
        notes: formData.notes,
      }
      const { data: paymentId, error } = await createPaymentLegacy(paymentArgs)
      
      if (error) throw error
      
      if (paymentId) {
        onPaymentCreated(paymentId)
        setIsOpen(false)
        setFormData({
          payment_date: new Date().toISOString().split('T')[0],
          payment_currency: 'EUR',
          method: 'Bank Transfer',
        })
        toast({
          title: 'Success',
          description: 'Payment created successfully',
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create payment',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="w-4 h-4 mr-2" />
        Create Payment
      </Button>

      <SlidePanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Create Payment"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Payer Team */}
          <div>
            <Label htmlFor="payer-team">Payer Team *</Label>
            <Input
              id="payer-team"
              type="number"
              value={formData.payer_team_id || ''}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                payer_team_id: e.target.value ? parseInt(e.target.value) : undefined 
              }))}
              placeholder="Enter payer team ID"
              required
            />
          </div>

          {/* Payment Date */}
          <div>
            <Label htmlFor="payment-date">Payment Date *</Label>
            <Input
              id="payment-date"
              type="date"
              value={formData.payment_date || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, payment_date: e.target.value }))}
              required
            />
          </div>

          {/* Amount */}
          <div>
            <Label htmlFor="payment-amount">Amount *</Label>
            <Input
              id="payment-amount"
              type="number"
              step="0.01"
              min="0"
              value={formData.payment_amount || ''}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                payment_amount: e.target.value ? parseFloat(e.target.value) : undefined 
              }))}
              placeholder="0.00"
              required
            />
          </div>

          {/* Currency */}
          <div>
            <Label htmlFor="payment-currency">Currency *</Label>
            <select
              id="payment-currency"
              value={formData.payment_currency || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, payment_currency: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              required
            >
              {CURRENCY_OPTIONS.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Method */}
          <div>
            <Label htmlFor="payment-method">Payment Method *</Label>
            <select
              id="payment-method"
              value={formData.method || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, method: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              required
            >
              {METHOD_OPTIONS.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* External Reference */}
          <div>
            <Label htmlFor="external-ref">External Reference</Label>
            <Input
              id="external-ref"
              value={formData.external_ref || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, external_ref: e.target.value }))}
              placeholder="External reference..."
            />
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Payment notes..."
              rows={3}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              className="flex-1 mr-2"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1 ml-2"
            >
              {isLoading ? 'Creating...' : 'Create Payment'}
            </Button>
          </div>
        </form>
      </SlidePanel>
    </>
  )
} 
 
 
 






