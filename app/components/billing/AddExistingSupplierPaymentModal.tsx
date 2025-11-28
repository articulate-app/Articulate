"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Search, CreditCard } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { toast } from '../ui/use-toast'

interface SupplierPayment {
  payment_id: number
  external_ref: string
  payment_amount: number
  payment_currency: string
  payment_date: string
  method: string
  paid_to_team_name: string
  amount_allocated: number
  unallocated_amount: number
}

interface AddExistingSupplierPaymentModalProps {
  invoiceId: number
  invoiceCurrency: string
  isOpen: boolean
  onClose: () => void
  onPaymentAdded: () => void
  onCreateNewPayment?: () => void
}

export function AddExistingSupplierPaymentModal({ 
  invoiceId, 
  invoiceCurrency, 
  isOpen, 
  onClose, 
  onPaymentAdded,
  onCreateNewPayment
}: AddExistingSupplierPaymentModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPayment, setSelectedPayment] = useState<SupplierPayment | null>(null)
  const [allocationAmount, setAllocationAmount] = useState<number>(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const supabase = createClientComponentClient()

  // Fetch available supplier payments from v_supplier_payments_summary
  const { data: payments, isLoading } = useQuery({
    queryKey: ['available-supplier-payments', searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('v_supplier_payments_summary')
        .select('*')
        .gt('unallocated_amount', 0)
        .eq('payment_currency', invoiceCurrency)

      if (searchTerm) {
        query = query.or(`external_ref.ilike.%${searchTerm}%,paid_to_team_name.ilike.%${searchTerm}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return data || []
    },
    enabled: isOpen
  })

  // Update allocation amount when payment is selected
  useEffect(() => {
    if (selectedPayment) {
      setAllocationAmount(selectedPayment.unallocated_amount)
    }
  }, [selectedPayment])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPayment || allocationAmount <= 0) return

    setIsSubmitting(true)
    try {
      // Create supplier payment allocation
      const { error } = await supabase
        .from('supplier_payment_allocations')
        .insert({
          payment_id: selectedPayment.payment_id,
          received_invoice_id: invoiceId,
          amount_applied: allocationAmount
        })

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Payment allocated successfully',
      })

      onPaymentAdded()
      onClose()
      setSelectedPayment(null)
      setAllocationAmount(0)
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to allocate payment',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'EUR',
    }).format(amount)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Payment</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden flex flex-col space-y-4">
          {/* Search */}
          <div className="space-y-2">
            <Label htmlFor="search" className="text-sm font-medium">
              Search Payments
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                id="search"
                placeholder="Search by external reference or supplier team..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Payment List */}
          <div className="flex-1 overflow-y-auto border rounded-md">
            {isLoading ? (
              <div className="p-4 text-center text-gray-500">Loading payments...</div>
            ) : payments && payments.length > 0 ? (
              <div className="divide-y">
                {payments.map((payment: SupplierPayment) => (
                  <div
                    key={payment.payment_id}
                    className={`p-4 cursor-pointer hover:bg-gray-50 ${
                      selectedPayment?.payment_id === payment.payment_id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                    }`}
                    onClick={() => setSelectedPayment(payment)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <CreditCard className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">{payment.external_ref}</span>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {payment.paid_to_team_name} • {payment.method} • {new Date(payment.payment_date).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          {formatCurrency(payment.payment_amount, payment.payment_currency)}
                        </div>
                        <div className="text-sm text-gray-500">
                          Available: {formatCurrency(payment.unallocated_amount, payment.payment_currency)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-gray-500">
                {searchTerm ? 'No payments found matching your search' : 'No available payments found'}
              </div>
            )}
          </div>

          {/* Allocation Amount */}
          {selectedPayment && (
            <div className="space-y-2">
              <Label htmlFor="allocation-amount" className="text-sm font-medium">
                Allocation Amount
              </Label>
              <Input
                id="allocation-amount"
                type="number"
                step="0.01"
                min="0"
                max={selectedPayment.unallocated_amount}
                value={allocationAmount}
                onChange={(e) => setAllocationAmount(parseFloat(e.target.value) || 0)}
                placeholder="Enter amount to allocate"
              />
              <div className="text-sm text-gray-500">
                Available: {formatCurrency(selectedPayment.unallocated_amount, selectedPayment.payment_currency)}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <div className="flex space-x-2">
            {onCreateNewPayment && (
              <Button
                type="button"
                variant="outline"
                onClick={onCreateNewPayment}
                disabled={isSubmitting}
              >
                Create New Payment
              </Button>
            )}
            <Button
              type="submit"
              onClick={handleSubmit}
              disabled={!selectedPayment || allocationAmount <= 0 || isSubmitting}
              className="bg-black text-white hover:bg-gray-800"
            >
              {isSubmitting ? 'Adding...' : 'Add Selected Payment'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

