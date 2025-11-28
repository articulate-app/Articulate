"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { toast } from '../ui/use-toast'

interface SelectSupplierInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectInvoice: (invoice: any, amount: number) => void
  paymentId: number
  paymentCurrency: string
  paymentAmount: number
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

export function SelectSupplierInvoiceModal({
  isOpen,
  onClose,
  onSelectInvoice,
  paymentId,
  paymentCurrency,
  paymentAmount
}: SelectSupplierInvoiceModalProps) {
  const [invoices, setInvoices] = useState<any[]>([])
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null)
  const [allocationAmount, setAllocationAmount] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClientComponentClient()

  // Fetch available supplier invoices
  useEffect(() => {
    if (!isOpen) return

    const fetchInvoices = async () => {
      setIsLoading(true)
      try {
        // Get invoices that are not already allocated to this payment
        const { data, error } = await supabase
          .from('v_received_invoices_list')
          .select('*')
          .eq('currency_code', paymentCurrency)
          .neq('status', 'void')
          .gt('balance_due', 0) // Only invoices with remaining balance
          .order('invoice_date', { ascending: false })

        if (error) throw error

        // Filter out invoices already allocated to this payment
        const { data: existingAllocations } = await supabase
          .from('supplier_payment_allocations')
          .select('received_invoice_id')
          .eq('payment_id', paymentId)

        const allocatedInvoiceIds = existingAllocations?.map(a => a.received_invoice_id) || []
        const availableInvoices = data?.filter(invoice => !allocatedInvoiceIds.includes(invoice.id)) || []

        setInvoices(availableInvoices)
      } catch (error: any) {
        console.error('Failed to fetch invoices:', error)
        toast({
          title: 'Error',
          description: 'Failed to load invoices',
          variant: 'destructive',
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchInvoices()
  }, [isOpen, paymentId, paymentCurrency, supabase])

  const getInvoiceDetails = (invoiceId: number) => {
    return invoices.find(inv => inv.id === invoiceId)
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
        description: `Amount cannot exceed invoice balance of ${formatCurrency(invoice.balance_due, paymentCurrency)}`,
        variant: 'destructive',
      })
      return
    }

    // Validate amount doesn't exceed payment amount
    if (amount > paymentAmount) {
      toast({
        title: 'Error',
        description: `Amount cannot exceed payment amount of ${formatCurrency(paymentAmount, paymentCurrency)}`,
        variant: 'destructive',
      })
      return
    }

    onSelectInvoice(invoice, amount)
    onClose()
  }

  const isAddDisabled = !selectedInvoiceId || !allocationAmount || 
                       parseFloat(allocationAmount) <= 0 || parseFloat(allocationAmount) > paymentAmount

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Invoice</DialogTitle>
          <DialogDescription>
            Select an invoice and amount to allocate to this payment.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="text-xs text-gray-500 text-right">
            Payment Amount: {formatCurrency(paymentAmount, paymentCurrency)}
          </div>

          {/* Add New Allocation */}
          <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
            {/* Combined Invoice Selection and Amount */}
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
                        const invoice = invoices.find(inv => inv.id === invoiceId)
                        if (invoice) {
                          setAllocationAmount(invoice.balance_due.toString())
                        }
                      } else {
                        setAllocationAmount('')
                      }
                    }}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    disabled={isLoading}
                  >
                    <option value="">
                      {isLoading ? 'Loading invoices...' : 'Select Invoice'}
                    </option>
                    {invoices.map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        #{invoice.invoice_number} • {formatDate(invoice.invoice_date)} • {formatCurrency(invoice.balance_due, paymentCurrency)}
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
                    max={paymentAmount}
                    value={allocationAmount}
                    onChange={(e) => setAllocationAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-8 text-xs flex-1"
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

            {selectedInvoiceId && (
              <div className="text-xs text-gray-500">
                Invoice Balance: {formatCurrency(getInvoiceDetails(selectedInvoiceId)?.balance_due || 0, paymentCurrency)}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
