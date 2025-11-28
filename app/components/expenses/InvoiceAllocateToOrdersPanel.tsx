"use client"

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Trash2, Plus } from 'lucide-react'
import { toast } from '../ui/use-toast'
import { 
  getInvoiceAllocations, 
  createInvoiceAllocation, 
  deleteInvoiceAllocation,
  searchProductionOrders 
} from '../../lib/services/expenses'
import type { ReceivedInvoiceAllocation, ProductionOrder } from '../../lib/types/expenses'

interface InvoiceAllocateToOrdersPanelProps {
  invoiceId: number
  currencyCode: string
  supplierTeamId: number
}

interface AllocationRow {
  id?: number
  production_order_id: number
  amount_subtotal_allocated: number
  production_order?: ProductionOrder
}

export function InvoiceAllocateToOrdersPanel({ invoiceId, currencyCode, supplierTeamId }: InvoiceAllocateToOrdersPanelProps) {
  const queryClient = useQueryClient()
  const [allocations, setAllocations] = useState<AllocationRow[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [newAllocation, setNewAllocation] = useState<Partial<AllocationRow>>({})
  const [productionOrderSearch, setProductionOrderSearch] = useState('')
  const [availableProductionOrders, setAvailableProductionOrders] = useState<ProductionOrder[]>([])

  // Fetch existing allocations
  const { data: existingAllocations, isLoading } = useQuery({
    queryKey: ['invoice-allocations', invoiceId],
    queryFn: () => getInvoiceAllocations(invoiceId),
    enabled: !!invoiceId
  })

  // Load existing allocations when data is fetched
  useEffect(() => {
    if (existingAllocations) {
      setAllocations(existingAllocations.map((allocation: any) => ({
        id: allocation.id,
        production_order_id: allocation.production_order_id,
        amount_subtotal_allocated: allocation.amount_subtotal_allocated,
        production_order: allocation.production_orders
      })))
    }
  }, [existingAllocations])

  // Search production orders
  const searchProductionOrdersMutation = useMutation({
    mutationFn: (search: string) => searchProductionOrders(search, supplierTeamId, currencyCode),
    onSuccess: (data) => {
      // Transform the data to match ProductionOrder type
      const transformedData = data.map((order: any) => ({
        ...order,
        subtotal_allocated: 0, // Default values since these aren't returned by search
        subtotal_remaining: order.subtotal_amount,
        is_subtotal_fully_allocated: false
      }))
      setAvailableProductionOrders(transformedData)
    }
  })

  // Create allocation mutation
  const createAllocationMutation = useMutation({
    mutationFn: (allocation: AllocationRow) => 
      createInvoiceAllocation({
        received_invoice_id: invoiceId,
        production_order_id: allocation.production_order_id,
        amount_subtotal_allocated: allocation.amount_subtotal_allocated
      }),
    onSuccess: (data) => {
      // Add the new allocation to the list
      setAllocations(prev => [...prev, { ...newAllocation, id: data.id } as AllocationRow])
      setNewAllocation({})
      setIsAdding(false)
      queryClient.invalidateQueries({ queryKey: ['invoice-allocations', invoiceId] })
      toast({
        title: "Allocation created",
        description: "Successfully allocated invoice to production order.",
      })
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create allocation.",
        variant: "destructive"
      })
    }
  })

  // Delete allocation mutation
  const deleteAllocationMutation = useMutation({
    mutationFn: (allocationId: number) => deleteInvoiceAllocation(allocationId),
    onSuccess: (_, allocationId) => {
      setAllocations(prev => prev.filter(a => a.id !== allocationId))
      queryClient.invalidateQueries({ queryKey: ['invoice-allocations', invoiceId] })
      toast({
        title: "Allocation removed",
        description: "Successfully removed allocation.",
      })
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove allocation.",
        variant: "destructive"
      })
    }
  })

  const handleAddAllocation = () => {
    if (!newAllocation.production_order_id || !newAllocation.amount_subtotal_allocated) {
      toast({
        title: "Validation Error",
        description: "Please select a production order and enter an amount.",
        variant: "destructive"
      })
      return
    }

    if (newAllocation.amount_subtotal_allocated <= 0) {
      toast({
        title: "Validation Error",
        description: "Amount must be greater than 0.",
        variant: "destructive"
      })
      return
    }

    createAllocationMutation.mutate(newAllocation as AllocationRow)
  }

  const handleRemoveAllocation = (allocationId: number) => {
    deleteAllocationMutation.mutate(allocationId)
  }

  const handleProductionOrderSearch = (search: string) => {
    setProductionOrderSearch(search)
    if (search.length >= 2) {
      searchProductionOrdersMutation.mutate(search)
    } else {
      setAvailableProductionOrders([])
    }
  }

  const handleSelectProductionOrder = (order: ProductionOrder) => {
    setNewAllocation(prev => ({ ...prev, production_order_id: order.id }))
    setProductionOrderSearch(order.project_name)
    setAvailableProductionOrders([])
  }

  const selectedProductionOrder = availableProductionOrders.find(
    order => order.id === newAllocation.production_order_id
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">Allocate to Orders</h3>
        {!isAdding && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsAdding(true)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Allocation
          </Button>
        )}
      </div>

      {/* Add new allocation form */}
      {isAdding && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <div>
            <Label htmlFor="production-order">Production Order</Label>
            <div className="relative">
              <Input
                id="production-order"
                value={productionOrderSearch}
                onChange={(e) => handleProductionOrderSearch(e.target.value)}
                placeholder="Search production orders..."
                className="w-full"
              />
              {availableProductionOrders.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-auto">
                  {availableProductionOrders.map((order) => (
                    <div
                      key={order.id}
                      className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                      onClick={() => handleSelectProductionOrder(order)}
                    >
                      <div className="font-medium">{order.project_name}</div>
                      <div className="text-gray-500 text-xs">
                        {order.billing_period_start} - {order.billing_period_end}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="amount">Amount (Subtotal)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={newAllocation.amount_subtotal_allocated || ''}
              onChange={(e) => setNewAllocation(prev => ({ 
                ...prev, 
                amount_subtotal_allocated: parseFloat(e.target.value) || 0 
              }))}
              placeholder="0.00"
              className="w-full"
            />
          </div>

          <div className="flex space-x-2">
            <Button 
              size="sm" 
              onClick={handleAddAllocation}
              disabled={createAllocationMutation.isPending}
            >
              {createAllocationMutation.isPending ? 'Adding...' : 'Add Allocation'}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                setIsAdding(false)
                setNewAllocation({})
                setProductionOrderSearch('')
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Existing allocations */}
      {allocations.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Production Order
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Amount
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((allocation) => (
                <tr key={allocation.id} className="border-b border-gray-100">
                  <td className="px-3 py-2">
                    <div>
                      <div className="font-medium">
                        {allocation.production_order?.project_name || `Order ${allocation.production_order_id}`}
                      </div>
                      <div className="text-xs text-gray-500">
                        {allocation.production_order?.billing_period_start} - {allocation.production_order?.billing_period_end}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: currencyCode,
                    }).format(allocation.amount_subtotal_allocated)}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => allocation.id && handleRemoveAllocation(allocation.id)}
                      disabled={deleteAllocationMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {allocations.length === 0 && !isAdding && (
        <div className="text-center text-gray-500 py-4">
          No allocations yet. Click "Add Allocation" to get started.
        </div>
      )}
    </div>
  )
} 