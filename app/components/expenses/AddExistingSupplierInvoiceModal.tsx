"use client"

import React, { useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { toast } from '../ui/use-toast'
import { InfiniteList } from '../ui/infinite-list'

interface AddExistingSupplierInvoiceModalProps {
  productionOrderId: number
  payerTeamId: number
  supplierTeamId: number
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

export function AddExistingSupplierInvoiceModal({ 
  productionOrderId, 
  payerTeamId, 
  supplierTeamId,
  onClose, 
  onInvoiceLinked 
}: AddExistingSupplierInvoiceModalProps) {
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

  // Build trailing query to filter supplier invoices by payer and supplier team
  const trailingQuery = (query: any) => {
    let q = query
      .eq('payer_team_id', payerTeamId)
      .eq('issuer_team_id', supplierTeamId)
      .order('invoice_date', { ascending: false })

    if (searchQuery) {
      q = q.or(`invoice_number.ilike.%${searchQuery}%,issuer_team_name.ilike.%${searchQuery}%`)
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
      const { error } = await supabase
        .from('received_invoice_allocations')
        .insert({
          received_invoice_id: selectedInvoice.id,
          production_order_id: productionOrderId,
          amount_subtotal_allocated: allocationSubtotal
        })

      if (error) throw error

      onInvoiceLinked({
        received_invoice_id: selectedInvoice.id,
        amount_subtotal_allocated: allocationSubtotal,
        currency_code: selectedInvoice.currency_code,
        status: selectedInvoice.status,
        created_at: selectedInvoice.created_at
      })
      
      toast({
        title: 'Success',
        description: 'Invoice linked successfully',
      })
      
      onClose()
    } catch (err: any) {
      console.error('Error linking invoice:', err)
      toast({
        title: 'Error',
        description: err.message || 'Failed to link invoice to production order',
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
          placeholder="Search invoices by number or supplier..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Invoice List */}
      <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
        <InfiniteList<'v_received_invoices_list'>
          queryKey={`available-supplier-invoices-${productionOrderId}-${searchQuery}`}
          tableName="v_received_invoices_list"
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
            <div className="space-y-2 p-4">
              {invoices.map((invoice: any) => (
                <div
                  key={invoice.id}
                  onClick={() => handleInvoiceSelect(invoice)}
                  className={`p-3 border rounded-lg cursor-pointer transition-all ${
                    selectedInvoice?.id === invoice.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-medium text-sm text-gray-900">
                        {invoice.invoice_number}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {invoice.issuer_team_name}
                      </div>
                    </div>
                    <Badge variant={invoice.status === 'paid' ? 'default' : 'secondary'}>
                      {invoice.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-600">
                    <span>{formatDate(invoice.invoice_date)}</span>
                    <span className="font-medium">{formatCurrency(invoice.total_amount, invoice.currency_code)}</span>
                  </div>
                  {invoice.balance_due > 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      Balance: {formatCurrency(invoice.balance_due, invoice.currency_code)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </InfiniteList>
      </div>

      {/* Selected Invoice Details & Allocation */}
      {selectedInvoice && (
        <div className="border-t pt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Allocation Amount (Subtotal)
            </label>
            <Input
              type="number"
              step="0.01"
              value={allocationAmount}
              onChange={(e) => setAllocationAmount(e.target.value)}
              placeholder="Enter allocation amount"
            />
            <p className="text-xs text-gray-500 mt-1">
              Invoice subtotal: {formatCurrency(selectedInvoice.subtotal_amount, selectedInvoice.currency_code)}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLinking}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleLinkInvoice}
              disabled={isLinking}
            >
              {isLinking ? 'Linking...' : 'Link Invoice'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

