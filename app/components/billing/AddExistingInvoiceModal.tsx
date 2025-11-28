"use client"

import React, { useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { toast } from '../ui/use-toast'
import { InfiniteList } from '../ui/infinite-list'

interface AddExistingInvoiceModalProps {
  orderId: number
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

export function AddExistingInvoiceModal({ orderId, onClose, onInvoiceLinked }: AddExistingInvoiceModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [isLinking, setIsLinking] = useState(false)
  const [allocationAmount, setAllocationAmount] = useState<string>('')
  const supabase = createClientComponentClient()

  // Update allocation amount when invoice is selected
  const handleInvoiceSelect = (invoice: any) => {
    setSelectedInvoice(invoice)
    // Default to the invoice's subtotal amount
    setAllocationAmount(invoice.subtotal_amount?.toString() || '0')
  }

  // Build trailing query to filter invoices that are not already linked to this order
  const trailingQuery = (query: any) => {
    let q = query
      .order('invoice_date', { ascending: false })

    if (searchQuery) {
      q = q.or(`invoice_number.ilike.%${searchQuery}%,payer_team_name.ilike.%${searchQuery}%`)
    }

    return q
  }

  const handleLinkInvoice = async () => {
    if (!selectedInvoice) return

    const allocationSubtotal = parseFloat(allocationAmount) || 0
    if (allocationSubtotal <= 0) {
      toast({
        title: 'Error',
        description: 'Allocation amount must be greater than 0',
        variant: 'destructive',
      })
      return
    }

    setIsLinking(true)
    try {
      // Calculate VAT and total based on the allocation subtotal
      const vatRatio = selectedInvoice.subtotal_amount > 0 ? selectedInvoice.vat_amount / selectedInvoice.subtotal_amount : 0
      const allocationVat = Math.round(allocationSubtotal * vatRatio * 100) / 100
      const allocationTotal = allocationSubtotal + allocationVat

      const { error } = await supabase
        .from('issued_invoice_orders')
        .insert({
          issued_invoice_id: selectedInvoice.id,
          invoice_order_id: orderId,
          amount_override_subtotal: allocationSubtotal,
          amount_override_vat: allocationVat,
          amount_override_total: allocationTotal
        })

      if (error) throw error

      onInvoiceLinked({
        issued_invoice_id: selectedInvoice.id,
        amount_override_subtotal: allocationSubtotal,
        amount_override_vat: allocationVat,
        amount_override_total: allocationTotal,
        currency_code: selectedInvoice.currency_code,
        status: selectedInvoice.status,
        created_at: selectedInvoice.created_at
      })
    } catch (err: any) {
      console.error('Error linking invoice:', err)
      toast({
        title: 'Error',
        description: err.message || 'Failed to link invoice to order',
        variant: 'destructive',
      })
    } finally {
      setIsLinking(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          placeholder="Search invoices by number or payer..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Invoice List */}
      <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
        <InfiniteList<'v_issued_invoices_list'>
          queryKey={`available-invoices-${orderId}-${searchQuery}`}
          tableName="v_issued_invoices_list"
          trailingQuery={trailingQuery}
          isTableBody={false}
          renderNoResults={() => (
            <div className="text-center text-gray-500 py-8">
              {searchQuery ? 'No invoices match your search' : 'No available invoices found'}
            </div>
          )}
          renderEndMessage={() => null}
          renderSkeleton={(count) => (
            <div className="space-y-2 p-4">
              {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="p-3 border border-gray-200 rounded animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          )}
        >
          {(invoices) => (
            <div className="space-y-1 p-4">
              {invoices.map((invoice: any) => (
                <div
                  key={invoice.id}
                  className={`flex items-center justify-between p-3 border border-gray-200 rounded cursor-pointer transition-colors ${
                    selectedInvoice?.id === invoice.id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => handleInvoiceSelect(invoice)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-900">
                        Invoice #{invoice.invoice_number}
                      </span>
                      <Badge variant={invoice.status === 'draft' ? 'secondary' : 'default'}>
                        {invoice.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {invoice.payer_team_name} • {formatDate(invoice.invoice_date)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(invoice.subtotal_amount, invoice.currency_code)}
                    </div>
                    <div className="text-xs text-gray-500">
                      Subtotal
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </InfiniteList>
      </div>

      {/* Allocation Amount Input */}
      {selectedInvoice && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Allocation Amount (Subtotal)
          </label>
          <div className="flex items-center space-x-2">
            <Input
              type="number"
              step="0.01"
              min="0"
              max={selectedInvoice.subtotal_amount || 0}
              value={allocationAmount}
              onChange={(e) => setAllocationAmount(e.target.value)}
              placeholder="Enter allocation amount"
              className="flex-1"
            />
            <span className="text-sm text-gray-500">
              / {formatCurrency(selectedInvoice.subtotal_amount || 0, selectedInvoice.currency_code)}
            </span>
          </div>
          <div className="text-xs text-gray-500">
            This is the amount that will be allocated to this order from the selected invoice.
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-end space-x-2 pt-4 border-t">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button 
          onClick={handleLinkInvoice}
          disabled={!selectedInvoice || isLinking}
        >
          {isLinking ? 'Linking...' : 'Link Invoice'}
        </Button>
      </div>
    </div>
  )
}