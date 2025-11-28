"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Search, FileText, Check, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Badge } from '../ui/badge'
import type { InvoiceOrder } from '../../lib/types/billing'

const formatCurrency = (amount: number, currencyCode: string | null = 'EUR') => {
  const safeCurrencyCode = currencyCode || 'EUR'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: safeCurrencyCode,
  }).format(amount)
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

interface InvoiceOrderSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  onBack: () => void // Go back to step 1
  onOrdersSelected: (orders: InvoiceOrder[], allocations?: Array<{ order_id: number; amount: number }>) => void
  invoiceId?: number // The created invoice ID for context
  payerTeamId?: number // Filter orders by payer_team_id
  issuerTeamId?: number // Filter orders by issuer_team_id (supplier for AP invoices)
  isAR?: boolean // Whether this is an AR invoice (uses production orders) or AP (uses invoice orders)
  isCreatingInvoice?: boolean // Whether the invoice is being created
  preselectedOrderId?: number // Pre-select this order when modal opens
  preselectedOrderAmount?: number // Pre-allocate this amount to the preselected order
}

export function InvoiceOrderSelectionModal({ 
  isOpen, 
  onClose,
  onBack,
  onOrdersSelected,
  invoiceId,
  payerTeamId,
  issuerTeamId,
  isAR = false,
  preselectedOrderId,
  preselectedOrderAmount,
  isCreatingInvoice = false
}: InvoiceOrderSelectionModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set())
  const [allocations, setAllocations] = useState<Array<{ order_id: number; amount: number }>>([])
  const supabase = createClientComponentClient()

  // Pre-select order and amount when modal opens with context
  useEffect(() => {
    if (isOpen && preselectedOrderId && preselectedOrderAmount) {
      setSelectedOrders(new Set([preselectedOrderId]))
      setAllocations([{ order_id: preselectedOrderId, amount: preselectedOrderAmount }])
    } else if (!isOpen) {
      // Reset when modal closes
      setSelectedOrders(new Set())
      setAllocations([])
      setSearchTerm('')
    }
  }, [isOpen, preselectedOrderId, preselectedOrderAmount])

  // Fetch available orders that can be invoiced
  const { data: orders, isLoading } = useQuery({
    queryKey: ['available-orders-for-selection', searchTerm, payerTeamId, issuerTeamId, isAR],
    queryFn: async () => {
      // Choose the correct table based on AR/AP
      // AR (Accounts Receivable): User is issuer → select invoice orders (work done for client)
      // AP (Accounts Payable): User is payer → select production orders (work done by supplier)
      const tableName = isAR ? 'v_invoice_orders_list' : 'v_production_orders_list'
      
      let query = supabase
        .from(tableName)
        .select('*')
        .gt(isAR ? 'remaining_subtotal' : 'remaining_subtotal_novat', 0) // Only orders with remaining amount
      
      // Only apply status filter for invoice orders (AR), not production orders (AP)
      if (isAR) {
        query = query.neq('status', 'issued') // Exclude fully issued orders
      }

      // Filter by team
      if (isAR) {
        // For AR (invoice orders): filter by payer_team_id (client)
        if (payerTeamId) {
          query = query.eq('payer_team_id', payerTeamId)
        }
      } else {
        // For AP (production orders): filter by BOTH payer_team_id (agency) AND supplier_team_id (supplier)
        if (payerTeamId) {
          query = query.eq('payer_team_id', payerTeamId)
        }
        if (issuerTeamId) {
          query = query.eq('supplier_team_id', issuerTeamId)
        }
      }

      if (searchTerm) {
        query = query.or(`project_name.ilike.%${searchTerm}%`)
      }

      query = query.order(isAR ? 'billing_period_start' : 'period_month', { ascending: false })

      const { data, error } = await query
      if (error) throw error
      
      let filteredData = data || []
      
      // If we have an invoiceId (editing mode), exclude orders already allocated to this invoice
      if (invoiceId && !isAR) {
        // For AP invoices, fetch existing allocations and filter them out
        const { data: existingAllocations, error: allocError } = await supabase
          .from('received_invoice_allocations')
          .select('production_order_id')
          .eq('received_invoice_id', invoiceId)
        
        if (!allocError && existingAllocations) {
          const allocatedOrderIds = new Set(existingAllocations.map(a => a.production_order_id))
          filteredData = filteredData.filter(order => !allocatedOrderIds.has(order.id))
        }
      } else if (invoiceId && isAR) {
        // For AR invoices, fetch existing allocations and filter them out
        const { data: existingAllocations, error: allocError } = await supabase
          .from('issued_invoice_orders')
          .select('invoice_order_id')
          .eq('issued_invoice_id', invoiceId)
        
        if (!allocError && existingAllocations) {
          const allocatedOrderIds = new Set(existingAllocations.map(a => a.invoice_order_id))
          filteredData = filteredData.filter(order => !allocatedOrderIds.has(order.id))
        }
      }
      
      return filteredData
    },
    enabled: isOpen
  })

  const handleOrderToggle = (orderId: number) => {
    const newSelected = new Set(selectedOrders)
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId)
      // Remove allocation when order is deselected
      setAllocations(prev => prev.filter(alloc => alloc.order_id !== orderId))
    } else {
      newSelected.add(orderId)
      // Add default allocation when order is selected
      const order = orders?.find(o => o.id === orderId)
      if (order) {
        const defaultAmount = isAR ? order.remaining_subtotal_novat : order.remaining_subtotal
        setAllocations(prev => [...prev, { order_id: orderId, amount: defaultAmount || 0 }])
      }
    }
    setSelectedOrders(newSelected)
  }

  const handleAllocationChange = (orderId: number, amount: number) => {
    setAllocations(prev => 
      prev.map(alloc => 
        alloc.order_id === orderId 
          ? { ...alloc, amount }
          : alloc
      )
    )
  }

  const handleFullAllocation = (orderId: number) => {
    const order = orders?.find(o => o.id === orderId)
    if (order) {
      const fullAmount = isAR ? order.remaining_subtotal_novat : order.remaining_subtotal
      handleAllocationChange(orderId, fullAmount || 0)
    }
  }

  const handleSelectAll = () => {
    if (selectedOrders.size === orders?.length) {
      setSelectedOrders(new Set())
      setAllocations([])
    } else {
      const allOrderIds = new Set(orders?.map(order => order.id) || [])
      setSelectedOrders(allOrderIds)
      
      // Add default allocations for all orders
      const newAllocations = orders?.map(order => ({
        order_id: order.id,
        amount: isAR ? order.remaining_subtotal_novat : order.remaining_subtotal
      })) || []
      setAllocations(newAllocations)
    }
  }

  const handleConfirmSelection = () => {
    if (selectedOrders.size === 0) return
    
    const selectedOrderObjects = orders?.filter(order => selectedOrders.has(order.id)) || []
    // Pass both orders and allocations to the parent
    onOrdersSelected(selectedOrderObjects, allocations)
    
    // Reset state
    setSelectedOrders(new Set())
    setAllocations([])
    setSearchTerm('')
  }

  const handleClose = () => {
    setSelectedOrders(new Set())
    setSearchTerm('')
    onClose()
  }

  const selectedOrdersArray = orders?.filter(order => selectedOrders.has(order.id)) || []
  const totalSelectedAmount = allocations.reduce((sum, alloc) => sum + alloc.amount, 0)

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Invoice Orders</DialogTitle>
          <p className="text-sm text-gray-500">
            Choose invoice orders to allocate to this invoice. Only orders with remaining amounts are shown.
            {invoiceId && ` (Invoice #${invoiceId})`}
          </p>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search by project name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Selection Controls */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              disabled={!orders || orders.length === 0}
            >
              {selectedOrders.size === orders?.length ? 'Deselect All' : 'Select All'}
            </Button>
            
            {selectedOrders.size > 0 && (
              <div className="text-sm text-gray-600">
                {selectedOrders.size} order{selectedOrders.size !== 1 ? 's' : ''} selected
                {totalSelectedAmount > 0 && (
                  <span className="ml-2 font-medium">
                    (Total Allocation: {formatCurrency(totalSelectedAmount)})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Orders List */}
          <div className="flex-1 overflow-y-auto border rounded-md">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">Loading invoice orders...</div>
            ) : orders && orders.length > 0 ? (
              <div className="divide-y">
                {orders.map((order: any) => {
                  const isSelected = selectedOrders.has(order.id)
                  const allocation = allocations.find(alloc => alloc.order_id === order.id)
                  const remainingAmount = isAR ? order.remaining_subtotal : order.remaining_subtotal_novat
                  
                  return (
                    <div
                      key={order.id}
                      className={`p-4 transition-colors ${
                        isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div 
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer ${
                              isSelected 
                                ? 'bg-blue-500 border-blue-500 text-white' 
                                : 'border-gray-300'
                            }`}
                            onClick={() => handleOrderToggle(order.id)}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                          </div>
                          
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <FileText className="h-4 w-4 text-gray-400" />
                              <span className="font-medium">{order.project_name || `Order #${order.id}`}</span>
                              {order.status && (
                                <Badge variant={order.status === 'not_issued' ? 'default' : 'secondary'}>
                                  {order.status?.replace('_', ' ')}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-gray-500 mt-1">
                              {isAR ? (
                                // Invoice orders have billing_period_start and billing_period_end
                                `${formatDate(order.billing_period_start)} - ${formatDate(order.billing_period_end)}`
                              ) : (
                                // Production orders have period_month
                                formatDate(order.period_month)
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <div className="font-medium">
                              {formatCurrency(
                                isAR ? order.total_amount : order.subtotal_amount, 
                                order.currency_code
                              )}
                            </div>
                            <div className="text-sm text-green-600 font-medium">
                              Remaining: {formatCurrency(remainingAmount, order.currency_code)}
                            </div>
                          </div>
                          
                          {/* Allocation Amount Input - only show for selected orders */}
                          {isSelected && (
                            <div className="flex items-center space-x-2">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max={remainingAmount}
                                value={allocation?.amount || 0}
                                onChange={(e) => {
                                  const amount = parseFloat(e.target.value) || 0
                                  handleAllocationChange(order.id, amount)
                                }}
                                className="w-24 h-8 text-sm"
                                placeholder="0.00"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleFullAllocation(order.id)}
                                className="h-8 px-2 text-xs"
                              >
                                Full
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                {searchTerm ? 'No invoice orders found for your search.' : 'No available invoice orders found.'}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="outline" onClick={onBack}>
            ← Back to Invoice Details
          </Button>
          <Button 
            onClick={handleConfirmSelection}
            disabled={selectedOrders.size === 0 || isCreatingInvoice}
          >
            {isCreatingInvoice && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isCreatingInvoice ? 'Creating Invoice...' : `Proceed with ${selectedOrders.size} Order${selectedOrders.size !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
