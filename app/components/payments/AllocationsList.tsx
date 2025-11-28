"use client"

import React, { useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Trash2, Plus } from 'lucide-react'
import { toast } from '../ui/use-toast'
import type { Allocation } from '../../lib/payments'

interface InvoiceOption {
  id: number
  invoice_number: string
  invoice_date: string
  currency_code: string
  total_amount: number
  amount_paid: number
  credited_amount: number
  balance_due: number
  status: string
}

interface AllocationsListProps {
  currency: string
  paymentAmount: number
  allocations: Allocation[]
  availableInvoices: InvoiceOption[]
  isLoadingInvoices: boolean
  onAddAllocation: (invoiceId: number, amount: number) => void
  onUpdateAllocation: (index: number, amount: number) => void
  onRemoveAllocation: (index: number) => void
  invoiceSearch: string
  onInvoiceSearchChange: (search: string) => void
}

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

export function AllocationsList({ 
  currency, 
  paymentAmount, 
  allocations, 
  availableInvoices,
  isLoadingInvoices,
  onAddAllocation, 
  onUpdateAllocation,
  onRemoveAllocation,
  invoiceSearch,
  onInvoiceSearchChange
}: AllocationsListProps) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null)
  const [allocationAmount, setAllocationAmount] = useState('')

  const totalAllocated = allocations.reduce((sum, allocation) => sum + allocation.amount_applied, 0)
  const remainingAmount = paymentAmount - totalAllocated

  const getInvoiceDetails = (invoiceId: number) => {
    return availableInvoices.find(inv => inv.id === invoiceId)
  }

  const getAllocatedInvoiceIds = () => {
    return new Set(allocations.map(a => a.issued_invoice_id))
  }

  const getAvailableInvoices = () => {
    const allocatedIds = getAllocatedInvoiceIds()
    return availableInvoices.filter(invoice => !allocatedIds.has(invoice.id))
  }

  const handleAddAllocation = () => {
    if (!selectedInvoiceId || !allocationAmount) {
      toast({
        title: 'Error',
        description: 'Please select an invoice and enter an amount',
        variant: 'destructive',
      })
      return
    }

    const amount = parseFloat(allocationAmount)
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'Error',
        description: 'Please enter a valid amount',
        variant: 'destructive',
      })
      return
    }

    const invoice = getInvoiceDetails(selectedInvoiceId)
    if (!invoice) {
      toast({
        title: 'Error',
        description: 'Invalid invoice selected',
        variant: 'destructive',
      })
      return
    }

    // Validate amount doesn't exceed invoice balance
    if (amount > invoice.balance_due) {
      toast({
        title: 'Error',
        description: `Amount cannot exceed invoice balance of ${formatCurrency(invoice.balance_due, currency)}`,
        variant: 'destructive',
      })
      return
    }

    // Validate amount doesn't exceed remaining payment amount
    if (amount > remainingAmount) {
      toast({
        title: 'Error',
        description: `Amount cannot exceed remaining payment amount of ${formatCurrency(remainingAmount, currency)}`,
        variant: 'destructive',
      })
      return
    }

    onAddAllocation(selectedInvoiceId, amount)
    setSelectedInvoiceId(null)
    setAllocationAmount('')
  }

  const handleAmountChange = (index: number, newAmount: string) => {
    const amount = parseFloat(newAmount) || 0
    
    // Get the invoice details for validation
    const allocation = allocations[index]
    const invoice = getInvoiceDetails(allocation.issued_invoice_id)
    
    if (invoice && amount > invoice.balance_due) {
      toast({
        title: 'Warning',
        description: `Amount cannot exceed invoice balance of ${formatCurrency(invoice.balance_due, currency)}`,
        variant: 'destructive',
      })
      return
    }

    onUpdateAllocation(index, amount)
  }

  const isAddDisabled = !currency || !selectedInvoiceId || !allocationAmount || 
                       parseFloat(allocationAmount) <= 0 || parseFloat(allocationAmount) > remainingAmount

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">Add Invoice</h3>
        <div className="text-xs text-gray-500">
          Allocated: {formatCurrency(totalAllocated, currency)} • 
          Remaining: {formatCurrency(remainingAmount, currency)}
        </div>
      </div>

      {/* Add New Allocation */}
      <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
        {/* Combined Invoice Search/Selection */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Invoice
            </Label>
            <div className="relative">
              <select
                value={selectedInvoiceId || ''}
                onChange={(e) => {
                  const invoiceId = e.target.value ? parseInt(e.target.value) : null
                  setSelectedInvoiceId(invoiceId)
                  if (invoiceId) {
                    const invoice = getAvailableInvoices().find(inv => inv.id === invoiceId)
                    if (invoice) {
                      onInvoiceSearchChange(invoice.invoice_number)
                    }
                  } else {
                    onInvoiceSearchChange('')
                  }
                }}
                className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                disabled={!currency || isLoadingInvoices}
              >
                <option value="">
                  {isLoadingInvoices ? 'Loading invoices...' : 'Select Invoice'}
                </option>
                {getAvailableInvoices().map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    #{invoice.invoice_number} • {formatDate(invoice.invoice_date)} • {formatCurrency(invoice.balance_due, currency)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Amount
            </Label>
            <div className="flex gap-1">
              <Input
                type="number"
                step="0.01"
                min="0"
                max={remainingAmount}
                value={allocationAmount}
                onChange={(e) => setAllocationAmount(e.target.value)}
                placeholder="0.00"
                className="h-8 text-xs flex-1"
                disabled={!currency}
              />
              <Button
                type="button"
                onClick={handleAddAllocation}
                disabled={isAddDisabled}
                size="sm"
                className="h-8 px-2 text-xs"
              >
                Add
              </Button>
            </div>
          </div>
        </div>

        {!currency && (
          <p className="text-xs text-gray-500 italic">Select a payment currency first to add allocations</p>
        )}
      </div>

      {/* Allocations Table */}
      {allocations.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Invoice</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Alloc. Amount</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Balance Due</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((allocation, index) => {
                const invoice = getInvoiceDetails(allocation.issued_invoice_id)
                return (
                  <tr key={index} className="border-b border-gray-100">
                    <td className="px-3 py-2">
                      {invoice ? (
                        <div>
                          <div className="font-medium">#{invoice.invoice_number}</div>
                          <div className="text-xs text-gray-500">{formatDate(invoice.invoice_date)}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">Invoice not found</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max={invoice?.balance_due || 0}
                        value={allocation.amount_applied.toFixed(2)}
                        onChange={(e) => handleAmountChange(index, e.target.value)}
                        className="h-7 text-xs w-20"
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {invoice ? formatCurrency(invoice.balance_due, currency) : '-'}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        onClick={() => onRemoveAllocation(index)}
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Validation Messages */}
      {remainingAmount < 0 && (
        <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
          Total allocations exceed payment amount by {formatCurrency(Math.abs(remainingAmount), currency)}
        </div>
      )}
    </div>
  )
} 