"use client"

import React, { useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { toast } from '../ui/use-toast'
import { InfiniteList } from '../ui/infinite-list'

interface AddExistingInvoiceToPaymentModalProps {
  paymentId: number
  direction: 'ar' | 'ap'
  fromTeamId: number // payer team
  toTeamId: number // recipient team
  paymentCurrency: string
  onClose: () => void
  onInvoiceLinked: (invoice: any) => void
}

const formatCurrency = (amount: number, currencyCode: string | null = 'EUR') => {
  const safeCurrencyCode = currencyCode || 'EUR'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: safeCurrencyCode,
  }).format(amount)
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function AddExistingInvoiceToPaymentModal({ 
  paymentId, 
  direction,
  fromTeamId,
  toTeamId,
  paymentCurrency,
  onClose, 
  onInvoiceLinked 
}: AddExistingInvoiceToPaymentModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedInvoices, setSelectedInvoices] = useState<Map<number, { invoice: any; amount: string }>>(new Map())
  const [isLinking, setIsLinking] = useState(false)
  const supabase = createClientComponentClient()

  // Toggle invoice selection
  const handleInvoiceToggle = (invoice: any) => {
    setSelectedInvoices(prev => {
      const newMap = new Map(prev)
      if (newMap.has(invoice.id)) {
        newMap.delete(invoice.id)
      } else {
        // Default to the invoice's subtotal amount
        newMap.set(invoice.id, {
          invoice,
          amount: invoice.subtotal_amount?.toString() || '0'
        })
      }
      return newMap
    })
  }

  // Update allocation amount for a specific invoice
  const updateAllocationAmount = (invoiceId: number, amount: string) => {
    setSelectedInvoices(prev => {
      const newMap = new Map(prev)
      const existing = newMap.get(invoiceId)
      if (existing) {
        newMap.set(invoiceId, { ...existing, amount })
      }
      return newMap
    })
  }

  // Build trailing query to filter invoices by teams
  const trailingQuery = (query: any) => {
    let q = query
      .eq('payer_team_id', fromTeamId)
      .eq('issuer_team_id', toTeamId)
      .order('invoice_date', { ascending: false })

    if (searchQuery) {
      q = q.or(`invoice_number.ilike.%${searchQuery}%,issuer_team_name.ilike.%${searchQuery}%`)
    }

    return q
  }

  const handleLinkInvoices = async () => {
    if (selectedInvoices.size === 0) return

    // Validate all amounts
    const invalidAmounts = Array.from(selectedInvoices.values()).filter(
      ({ amount }) => parseFloat(amount) <= 0
    )
    
    if (invalidAmounts.length > 0) {
      toast({
        title: 'Error',
        description: 'All allocation amounts must be greater than 0',
        variant: 'destructive',
      })
      return
    }

    setIsLinking(true)
    try {
      // Prepare all allocations
      const allocations = Array.from(selectedInvoices.values()).map(({ invoice, amount }) => {
        if (direction === 'ap') {
          return {
            payment_id: paymentId,
            received_invoice_id: invoice.id,
            amount_applied: parseFloat(amount)
          }
        } else {
          return {
            payment_id: paymentId,
            issued_invoice_id: invoice.id,
            amount_applied: parseFloat(amount)
          }
        }
      })

      // Insert all allocations at once
      if (direction === 'ap') {
        const { error } = await supabase
          .from('supplier_payment_allocations')
          .insert(allocations)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('client_payment_allocations')
          .insert(allocations)
        if (error) throw error
      }

      toast({
        title: 'Success',
        description: `${selectedInvoices.size} invoice(s) linked to payment successfully`,
      })

      onInvoiceLinked({ count: selectedInvoices.size })
      onClose()
    } catch (error: any) {
      console.error('Error linking invoices to payment:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to link invoices to payment',
        variant: 'destructive',
      })
    } finally {
      setIsLinking(false)
    }
  }

  const renderInvoiceRow = (invoice: any) => {
    const isSelected = selectedInvoices.has(invoice.id)
    const selectedData = selectedInvoices.get(invoice.id)
    
    return (
      <div
        key={invoice.id}
        className={`p-4 border rounded-lg transition-colors ${
          isSelected
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }`}
      >
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => handleInvoiceToggle(invoice)}
            className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
          <div className="flex-1 space-y-2">
            <div 
              className="cursor-pointer"
              onClick={() => handleInvoiceToggle(invoice)}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-gray-900">
                  {invoice.invoice_number}
                </span>
                <Badge variant="secondary" className="text-xs">
                  {invoice.status}
                </Badge>
              </div>
              <div className="text-sm text-gray-500 space-y-0.5">
                <div>Date: {formatDate(invoice.invoice_date)}</div>
                <div>Subtotal: {formatCurrency(invoice.subtotal_amount, invoice.currency_code)}</div>
                <div>Total: {formatCurrency(invoice.total_amount, invoice.currency_code)}</div>
              </div>
            </div>
            
            {isSelected && (
              <div className="flex items-center gap-2 pt-2 border-t border-blue-200">
                <Label className="text-xs text-gray-600 whitespace-nowrap">
                  Allocation Amount:
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={selectedData?.amount || ''}
                  onChange={(e) => updateAllocationAmount(invoice.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Amount"
                  className="h-8 text-sm"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          type="text"
          placeholder="Search invoices..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Invoices List */}
      <div className="max-h-96 overflow-y-auto space-y-2">
        <InfiniteList<'v_received_invoices_list' | 'v_issued_invoices_list'>
          queryKey={`invoices-for-payment-${direction}-${fromTeamId}-${toTeamId}-${searchQuery}`}
          tableName={direction === 'ap' ? 'v_received_invoices_list' : 'v_issued_invoices_list'}
          trailingQuery={trailingQuery}
          isTableBody={false}
          columns="*"
          renderNoResults={() => (
            <div className="text-center py-8 text-gray-500">
              No invoices found
            </div>
          )}
          renderEndMessage={() => null}
          renderSkeleton={() => (
            <div className="p-4 border border-gray-200 rounded-lg animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          )}
        >
          {(invoices) => (
            <div className="space-y-2">
              {invoices.map((invoice) => renderInvoiceRow(invoice))}
            </div>
          )}
        </InfiniteList>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="outline" onClick={onClose} disabled={isLinking}>
          Cancel
        </Button>
        <Button 
          onClick={handleLinkInvoices} 
          disabled={selectedInvoices.size === 0 || isLinking}
        >
          {isLinking ? 'Linking...' : `Link ${selectedInvoices.size} Invoice${selectedInvoices.size !== 1 ? 's' : ''}`}
        </Button>
      </div>
    </div>
  )
}

