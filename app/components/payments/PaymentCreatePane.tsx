"use client"

import React, { useState, useEffect } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Badge } from '../ui/badge'
import { toast } from '../ui/use-toast'
import { createPayment, listOpenInvoices, type CreatePaymentArgs, type Allocation } from '../../lib/payments'
import { useCurrentUserStore } from '../../store/current-user'
import type { CreatePaymentData, FromInvoiceContext, OpenInvoice, PaymentAllocation } from '../../lib/types/billing'

interface PaymentCreatePaneProps {
  onClose: () => void
  onPaymentCreated: (paymentId: number) => void
  fromInvoice?: FromInvoiceContext
  hideHeader?: boolean // New prop to hide header when used in right pane
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

const formatCurrency = (amount: number, currencyCode: string = 'EUR') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format(amount)
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function PaymentCreatePane({ onClose, onPaymentCreated, fromInvoice, hideHeader = false }: PaymentCreatePaneProps) {
  const currentUserId = useCurrentUserStore((s) => s.publicUserId)
  const [isLoading, setIsLoading] = useState(false)
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null)
  const [allocationAmount, setAllocationAmount] = useState('')

  const [formData, setFormData] = useState<Partial<CreatePaymentData>>({
    payment_date: new Date().toISOString().split('T')[0],
    payment_currency: fromInvoice?.currency || 'EUR',
    method: 'Bank Transfer',
    payer_team_id: fromInvoice?.payerTeamId,
    paid_to_team_id: fromInvoice?.paidToTeamId,
    payment_amount: fromInvoice?.subtotalAmount || fromInvoice?.suggestedAmount,
  })

  // Load open invoices and set up initial allocations for fromInvoice context
  useEffect(() => {
    if (fromInvoice) {
      // Pre-add the invoice allocation with the full subtotal amount
      setAllocations([{
        issued_invoice_id: fromInvoice.invoiceId,
        amount_applied: fromInvoice.subtotalAmount || fromInvoice.suggestedAmount || 0
      }])

      // Set the selected invoice to the current invoice
      setSelectedInvoiceId(fromInvoice.invoiceId)

      // Load open invoices for this payer/currency
      loadOpenInvoices(fromInvoice.payerTeamId, fromInvoice.currency)
    }
  }, [fromInvoice])

  // Helper function to update payment amount based on total allocations
  const updatePaymentAmountFromAllocations = () => {
    const totalAllocated = allocations.reduce((sum, allocation) => sum + allocation.amount_applied, 0)
    setFormData(prev => ({ ...prev, payment_amount: totalAllocated }))
  }

  const loadOpenInvoices = async (payerTeamId: number, currency: string) => {
    try {
      const { data, error } = await listOpenInvoices(payerTeamId, currency)
      if (error) throw error
      setOpenInvoices(data)
    } catch (error) {
      console.error('Failed to load open invoices:', error)
      toast({
        title: 'Error',
        description: 'Failed to load open invoices',
        variant: 'destructive',
      })
    }
  }

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
      if (!currentUserId) {
        toast({
          title: 'Error',
          description: 'User not authenticated',
          variant: 'destructive',
        })
        return
      }

      const paymentArgs: CreatePaymentArgs = {
        payerTeamId: formData.payer_team_id!,
        receivedByUserId: currentUserId,
        paymentDate: formData.payment_date!,
        amount: formData.payment_amount!,
        currency: formData.payment_currency!,
        method: formData.method!,
        externalRef: formData.external_ref,
        notes: formData.notes,
        allocations: allocations.length > 0 ? allocations : []
      }

      const { data: paymentId, error } = await createPayment(paymentArgs)

      if (error) {
        // Handle specific backend errors
        let errorMessage = 'Failed to create payment'
        
        if (error.message?.includes('currency')) {
          errorMessage = 'Payment currency must match invoice currency'
        } else if (error.message?.includes('status')) {
          errorMessage = 'You can only allocate to issued or partially paid invoices'
        } else if (error.message?.includes('over-allocate')) {
          errorMessage = 'Allocation amount exceeds available balance'
        }

        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        })
        return
      }

      if (!paymentId) {
        toast({
          title: 'Error',
          description: 'Payment created but no ID returned',
          variant: 'destructive',
        })
        return
      }

      // Emit optimistic events
      if (typeof window !== 'undefined') {
        // Notify about payment creation
        window.dispatchEvent(new CustomEvent('payments:created', { 
          detail: { paymentId } 
        }))

        // If from invoice, notify about payment recorded
        if (fromInvoice) {
          window.dispatchEvent(new CustomEvent('invoice:paymentRecorded', { 
            detail: { 
              invoiceId: fromInvoice.invoiceId, 
              amount: allocations.find(a => a.issued_invoice_id === fromInvoice.invoiceId)?.amount_applied || 0
            } 
          }))
        }
      }

      toast({
        title: 'Success',
        description: 'Payment created successfully',
      })

      onPaymentCreated(paymentId)

      // Open payment details if requested
      if (fromInvoice?.openPaymentAfterCreate !== false) {
        // Note: This would need to be handled by the parent component
        // For now, we'll just close this pane
        onClose()
      }

    } catch (error) {
      console.error('Error creating payment:', error)
      toast({
        title: 'Error',
        description: 'Failed to create payment',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddAllocation = () => {
    if (!selectedInvoiceId || !allocationAmount) return
    
    const amount = parseFloat(allocationAmount)
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'Error',
        description: 'Please enter a valid amount',
        variant: 'destructive',
      })
      return
    }

    // Check if allocation already exists for this invoice
    if (allocations.some(a => a.issued_invoice_id === selectedInvoiceId)) {
      toast({
        title: 'Error',
        description: 'Allocation for this invoice already exists',
        variant: 'destructive',
      })
      return
    }

    // Get the invoice details to check balance due
    const invoice = openInvoices.find(inv => inv.id === selectedInvoiceId)
    const maxAllocation = invoice?.balance_due || 0
    
    // Cap the allocation at the invoice's balance due
    const cappedAmount = Math.min(amount, maxAllocation)
    
    // Show warning if allocation was capped
    if (cappedAmount < amount) {
      toast({
        title: 'Allocation Capped',
        description: `Allocation reduced to ${cappedAmount.toFixed(2)} (invoice balance due)`,
        variant: 'default',
      })
    }

    const newAllocation: Allocation = {
      issued_invoice_id: selectedInvoiceId,
      amount_applied: cappedAmount,
    }

    setAllocations(prev => {
      const updated = [...prev, newAllocation]
      // Update payment amount after state update
      setTimeout(() => {
        const totalAllocated = updated.reduce((sum, allocation) => sum + allocation.amount_applied, 0)
        setFormData(prev => ({ ...prev, payment_amount: totalAllocated }))
      }, 0)
      return updated
    })
    setSelectedInvoiceId(null)
    setAllocationAmount('')
  }

  const handleRemoveAllocation = (index: number) => {
    // If this is from invoice context, don't allow removing the main allocation
    if (fromInvoice && allocations[index]?.issued_invoice_id === fromInvoice.invoiceId) {
      toast({
        title: 'Error',
        description: 'Cannot remove the invoice allocation when recording payment from invoice',
        variant: 'destructive',
      })
      return
    }

    setAllocations(prev => {
      const updated = prev.filter((_, i) => i !== index)
      // Update payment amount after state update
      setTimeout(() => {
        const totalAllocated = updated.reduce((sum, allocation) => sum + allocation.amount_applied, 0)
        setFormData(prev => ({ ...prev, payment_amount: totalAllocated }))
      }, 0)
      return updated
    })
  }

  const updateAllocationAmount = (index: number, newAmount: number) => {
    setAllocations(prev => {
      const updated = prev.map((allocation, i) => {
        if (i === index) {
          // Get the invoice details to check balance due
          const invoice = openInvoices.find(inv => inv.id === allocation.issued_invoice_id)
          const maxAllocation = invoice?.balance_due || 0
          
          // Cap the allocation at the invoice's balance due
          const cappedAmount = Math.min(newAmount, maxAllocation)
          
          return { ...allocation, amount_applied: cappedAmount }
        }
        return allocation
      })
      
      // Update payment amount after state update
      setTimeout(() => {
        const totalAllocated = updated.reduce((sum, allocation) => sum + allocation.amount_applied, 0)
        setFormData(prev => ({ ...prev, payment_amount: totalAllocated }))
      }, 0)
      
      return updated
    })
  }

  const getInvoiceDetails = (invoiceId: number) => {
    return openInvoices.find(inv => inv.id === invoiceId)
  }

  const totalAllocated = allocations.reduce((sum, allocation) => sum + allocation.amount_applied, 0)
  const unallocated = (formData.payment_amount || 0) - totalAllocated

  return (
    <div className="h-full flex flex-col">
      {/* Header - only show if not hidden */}
      {!hideHeader && (
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {fromInvoice ? 'Record Payment' : 'Create Payment'}
            </h2>
            {fromInvoice && (
              <p className="text-sm text-gray-500 truncate">
                Payment for Invoice #{fromInvoice.invoiceId}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto p-4 space-y-6">
          
          {/* Payment Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900">Payment Details</h3>
            
            {/* Payer Team (hidden if from invoice) */}
            {!fromInvoice && (
              <div>
                <Label htmlFor="payer_team_id">Payer Team ID</Label>
                <Input
                  id="payer_team_id"
                  type="number"
                  value={formData.payer_team_id || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, payer_team_id: parseInt(e.target.value) }))}
                  required
                />
              </div>
            )}

            {/* Payment Date */}
            <div>
              <Label htmlFor="payment_date">Payment Date</Label>
              <Input
                id="payment_date"
                type="date"
                value={formData.payment_date}
                onChange={(e) => setFormData(prev => ({ ...prev, payment_date: e.target.value }))}
                required
              />
            </div>

            {/* Payment Amount */}
            <div>
              <Label htmlFor="payment_amount">Payment Amount</Label>
              <Input
                id="payment_amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.payment_amount || ''}
                onChange={(e) => {
                  const newAmount = parseFloat(e.target.value) || 0
                  setFormData(prev => ({ ...prev, payment_amount: newAmount }))
                  
                  // If this is from an invoice context, update the main invoice allocation
                  if (fromInvoice) {
                    const maxAllocation = fromInvoice.suggestedAmount || 0
                    const allocationAmount = Math.min(newAmount, maxAllocation)
                    
                    setAllocations(prev => prev.map(allocation => 
                      allocation.issued_invoice_id === fromInvoice.invoiceId 
                        ? { ...allocation, amount_applied: allocationAmount }
                        : allocation
                    ))
                  }
                }}
                required
              />
            </div>

            {/* Currency (read-only if from invoice) */}
            <div>
              <Label htmlFor="payment_currency">Currency</Label>
              <select
                id="payment_currency"
                value={formData.payment_currency}
                onChange={(e) => setFormData(prev => ({ ...prev, payment_currency: e.target.value }))}
                disabled={!!fromInvoice}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {CURRENCY_OPTIONS.map((currency) => (
                  <option key={currency.id} value={currency.id}>
                    {currency.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Method */}
            <div>
              <Label htmlFor="method">Payment Method</Label>
              <select
                id="method"
                value={formData.method}
                onChange={(e) => setFormData(prev => ({ ...prev, method: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {METHOD_OPTIONS.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.label}
                  </option>
                ))}
              </select>
            </div>

            {/* External Reference */}
            <div>
              <Label htmlFor="external_ref">External Reference</Label>
              <Input
                id="external_ref"
                value={formData.external_ref || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, external_ref: e.target.value }))}
                placeholder="e.g., Transfer reference, check number"
              />
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes about the payment"
                rows={3}
              />
            </div>
          </div>

          {/* Allocations */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">Allocations</h3>
              <div className="text-sm text-gray-600">
                Unallocated: {formatCurrency(unallocated, formData.payment_currency)}
              </div>
            </div>

            {/* Existing Allocations */}
            {allocations.length > 0 && (
              <div className="space-y-2">
                              {allocations.map((allocation, index) => {
                const invoice = getInvoiceDetails(allocation.issued_invoice_id)
                const isFromInvoiceAllocation = fromInvoice?.invoiceId === allocation.issued_invoice_id

                return (
                  <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-900">
                          Invoice #{allocation.issued_invoice_id}
                        </span>
                          {isFromInvoiceAllocation && (
                            <Badge variant="default" className="text-xs">
                              From Invoice
                            </Badge>
                          )}
                        </div>
                        {invoice && (
                          <div className="text-xs text-gray-500">
                            {formatDate(invoice.invoice_date)} • Balance: {formatCurrency(invoice.balance_due, invoice.currency)}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max={invoice?.balance_due || 0}
                          value={allocation.amount_applied}
                          onChange={(e) => updateAllocationAmount(index, parseFloat(e.target.value) || 0)}
                          className="w-24 text-right"
                          title={`Maximum allocation: ${formatCurrency(invoice?.balance_due || 0, invoice?.currency || 'EUR')}`}
                        />
                        {!isFromInvoiceAllocation && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveAllocation(index)}
                            className="p-1 h-8 w-8"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add New Allocation */}
            {(!fromInvoice || openInvoices.length > 1) && (
              <div className="border border-dashed border-gray-300 rounded p-4">
                <div className="flex items-center space-x-2">
                  <select
                    value={selectedInvoiceId || ''}
                    onChange={(e) => setSelectedInvoiceId(parseInt(e.target.value) || null)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select invoice...</option>
                    {openInvoices
                      .filter(invoice => !allocations.some(a => a.issued_invoice_id === invoice.id))
                      .map((invoice) => (
                        <option key={invoice.id} value={invoice.id}>
                          Invoice #{invoice.id} - {formatCurrency(invoice.balance_due, invoice.currency)}
                        </option>
                      ))}
                  </select>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={allocationAmount}
                    onChange={(e) => setAllocationAmount(e.target.value)}
                    placeholder="Amount"
                    className="w-24"
                  />
                  <Button
                    type="button"
                    onClick={handleAddAllocation}
                    disabled={!selectedInvoiceId || !allocationAmount}
                    size="sm"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Creating...' : (fromInvoice ? 'Record Payment' : 'Create Payment')}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
} 