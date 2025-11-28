"use client"

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Search, FileText } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { toast } from '../ui/use-toast'

interface AvailableOrder {
  id: number
  billing_period_start: string
  billing_period_end: string
  subtotal_amount: number
  vat_amount: number
  total_amount: number
  currency_code: string
  remaining_subtotal: number
  project_name: string
}

interface AddInvoiceOrderModalProps {
  invoiceId: number
  invoiceCurrency: string
  isOpen: boolean
  onClose: () => void
  onOrderAdded: () => void
}

export function AddInvoiceOrderModal({ 
  invoiceId, 
  invoiceCurrency, 
  isOpen, 
  onClose, 
  onOrderAdded 
}: AddInvoiceOrderModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<AvailableOrder | null>(null)
  const [allocationAmount, setAllocationAmount] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const supabase = createClientComponentClient()

  // Fetch available invoice orders
  const { data: orders, isLoading } = useQuery({
    queryKey: ['available-invoice-orders', searchTerm, invoiceCurrency],
    queryFn: async () => {
      let query = supabase
        .from('v_invoice_orders_list')
        .select(`
          id,
          billing_period_start,
          billing_period_end,
          subtotal_amount,
          vat_amount,
          total_amount,
          currency_code,
          remaining_subtotal,
          project_name
        `)
        .gt('remaining_subtotal', 0)
        .eq('currency_code', invoiceCurrency)

      if (searchTerm) {
        query = query.ilike('project_name', `%${searchTerm}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return data || []
    },
    enabled: isOpen
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOrder) return

    setIsSubmitting(true)
    try {
      // Parse allocation amount, default to order subtotal if not specified
      const parsedAllocationAmount = allocationAmount ? parseFloat(allocationAmount) : selectedOrder.subtotal_amount
      
      // Create invoice order link
      const { error } = await supabase
        .from('issued_invoice_orders')
        .insert({
          issued_invoice_id: invoiceId,
          invoice_order_id: selectedOrder.id,
          amount_override_total: parsedAllocationAmount + selectedOrder.vat_amount,
          amount_override_subtotal: parsedAllocationAmount,
          amount_override_vat: selectedOrder.vat_amount
        })

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Invoice order added successfully',
      })

      onOrderAdded()
      onClose()
      setSelectedOrder(null)
      setAllocationAmount('')
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add invoice order',
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Invoice Order</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden flex flex-col space-y-4">
          {/* Search */}
          <div className="space-y-2">
            <Label htmlFor="search" className="text-sm font-medium">
              Search Invoice Orders
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                id="search"
                placeholder="Search by project name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Order List */}
          <div className="flex-1 overflow-y-auto border rounded-md">
            {isLoading ? (
              <div className="p-4 text-center text-gray-500">Loading invoice orders...</div>
            ) : orders && orders.length > 0 ? (
              <div className="divide-y">
                {orders.map((order: any) => (
                  <div
                    key={order.id}
                    className={`p-4 cursor-pointer hover:bg-gray-50 ${
                      selectedOrder?.id === order.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                    }`}
                    onClick={() => {
                      setSelectedOrder(order)
                      setAllocationAmount('')
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <FileText className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">{order.project_name || `Order #${order.id}`}</span>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {formatDate(order.billing_period_start)} - {formatDate(order.billing_period_end)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          {formatCurrency(order.total_amount, order.currency_code)}
                        </div>
                        <div className="text-sm text-gray-500">
                          Remaining: {formatCurrency(order.remaining_subtotal, order.currency_code)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-gray-500">
                {searchTerm ? 'No invoice orders found matching your search' : 'No available invoice orders found'}
              </div>
            )}
          </div>

          {/* Allocation Amount */}
          {selectedOrder && (
            <div className="space-y-2">
              <Label htmlFor="allocation-amount" className="text-sm font-medium">
                Allocation Amount (Subtotal)
              </Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="allocation-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  max={selectedOrder.subtotal_amount}
                  value={allocationAmount}
                  onChange={(e) => setAllocationAmount(e.target.value)}
                  placeholder={selectedOrder.subtotal_amount.toString()}
                  className="flex-1"
                />
                <span className="text-sm text-gray-500 whitespace-nowrap">
                  / {formatCurrency(selectedOrder.subtotal_amount, selectedOrder.currency_code)}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                This is the amount that will be allocated to this order from the selected invoice.
              </p>
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
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={!selectedOrder || isSubmitting}
            className="bg-black text-white hover:bg-gray-800"
          >
            {isSubmitting ? 'Adding...' : 'Add Order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 