"use client"

import React, { useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { toast } from '../ui/use-toast'
import { InfiniteList } from '../ui/infinite-list'
import { getDocumentsDefaultDateFrom } from '../../lib/services/documents-postgrest-rpc'

interface AddExistingInvoiceModalProps {
  orderId: number
  onClose: () => void
  onInvoiceLinked: (invoice: any) => void
}

type InvoiceSelectOption = {
  /** Issued invoice id (maps from documents: doc_id) */
  id: number
  invoice_number: string | null
  invoice_date: string | null
  subtotal_amount: number | null
  vat_amount?: number | null
  total_amount?: number | null
  currency_code?: string | null
  status: string | null
  payer_team_name: string | null
  created_at?: string | null
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
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceSelectOption | null>(null)
  const [isLinking, setIsLinking] = useState(false)
  const [allocationAmount, setAllocationAmount] = useState<string>('')
  const supabase = createClientComponentClient()

  // Update allocation amount when invoice is selected
  const handleInvoiceSelect = (invoice: InvoiceSelectOption) => {
    setSelectedInvoice(invoice)
    // Default to the invoice's subtotal amount
    setAllocationAmount(invoice.subtotal_amount?.toString() || '0')
  }

  const dateFrom = getDocumentsDefaultDateFrom()

  function mapDocumentToInvoiceOption(doc: any): InvoiceSelectOption {
    // NOTE: We intentionally use fn_documents_list (via v_documents_min) instead of v_issued_invoices_list,
    // because the view breaks under invoker/RLS and causes infinite-loading in this modal.
    return {
      id: Number(doc.doc_id),
      invoice_number: doc.doc_number ?? null,
      invoice_date: doc.doc_date ?? null,
      subtotal_amount: doc.subtotal_amount ?? null,
      vat_amount: doc.vat_amount ?? null,
      total_amount: doc.total_amount ?? null,
      currency_code: doc.currency_code ?? null,
      status: doc.status ?? null,
      payer_team_name: doc.to_team_name ?? null, // AR invoice payer is the "to" team
      created_at: doc.created_at ?? null,
    }
  }

  // Build trailing query for documents list RPC (AR invoices only)
  const trailingQuery = (query: any) => {
    let q = query
      .eq('direction', 'ar')
      // buildDocumentsMinListRpcBodyFromPostgrestSearchParams only maps doc_kind when encoded as `in.(...)`
      .in('doc_kind', ['invoice'])
      .gte('doc_date', dateFrom)
      .order('doc_date', { ascending: false })

    if (searchQuery) {
      // Let the RPC apply the search across doc_number / team names.
      // This gets translated into p_search by buildDocumentsMinListRpcBodyFromPostgrestSearchParams.
      q = q.or(`doc_number.ilike.%${searchQuery}%,to_team_name.ilike.%${searchQuery}%`)
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
      const vatRatio = (selectedInvoice.subtotal_amount || 0) > 0
        ? Number(selectedInvoice.vat_amount || 0) / Number(selectedInvoice.subtotal_amount || 1)
        : 0
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
      <InfiniteList<'v_documents_min'>
        queryKey={`available-invoices-${orderId}-${searchQuery}`}
        tableName="v_documents_min"
        trailingQuery={trailingQuery}
        isTableBody={false}
        requireUserScrollForNextPage
        className="max-h-96 border border-gray-200 rounded-lg"
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
        {(docs) => {
          const invoices = (docs as any[]).map(mapDocumentToInvoiceOption)
          return (
          <div className="space-y-1 p-4">
            {invoices.map((invoice) => (
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
                      Invoice #{invoice.invoice_number ?? invoice.id}
                    </span>
                    <Badge variant={invoice.status === 'draft' ? 'secondary' : 'default'}>
                      {invoice.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {invoice.payer_team_name} • {invoice.invoice_date ? formatDate(invoice.invoice_date) : '—'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">
                    {formatCurrency(invoice.subtotal_amount || 0, invoice.currency_code || 'EUR')}
                  </div>
                  <div className="text-xs text-gray-500">
                    Subtotal
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}}
      </InfiniteList>

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