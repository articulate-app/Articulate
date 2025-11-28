"use client"

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CreditCard, Edit, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { getInvoicePaymentAllocations } from '../../lib/payments'
import EditAllocationModal from './EditAllocationModal'
import { toast } from '../ui/use-toast'

interface InvoicePaymentAllocationsProps {
  invoiceId: number
  isPane?: boolean
  onUpdate?: (updatedInvoice?: any) => void
}

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
    day: 'numeric'
  })
}

export default function InvoicePaymentAllocations({ invoiceId, isPane = false, onUpdate }: InvoicePaymentAllocationsProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedAllocation, setSelectedAllocation] = useState<any>(null)

  // Fetch payment allocations for this invoice
  const { data: allocations, isLoading, error, refetch } = useQuery({
    queryKey: ['invoice-payment-allocations', invoiceId],
    queryFn: async () => {
      const { data, error } = await getInvoicePaymentAllocations(invoiceId)
      if (error) throw error
      return data || []
    },
    enabled: !!invoiceId, // Only fetch when invoiceId is available
  })

  const handleEditAllocation = (allocation: any) => {
    setSelectedAllocation(allocation)
    setIsEditModalOpen(true)
  }

  const handleAllocationUpdated = () => {
    setIsEditModalOpen(false)
    setSelectedAllocation(null)
    refetch()
    onUpdate?.()
  }

  const handleModalClose = () => {
    setIsEditModalOpen(false)
    setSelectedAllocation(null)
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-900">Payment Allocations</h3>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-16 bg-gray-100 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-900">Payment Allocations</h3>
        <div className="text-sm text-red-600">Failed to load payment allocations</div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-900">Payment Allocations</h3>
        <div className="space-y-3">
          {allocations && allocations.length > 0 ? (
            <div className="space-y-3">
              {allocations.map((allocation, index) => (
                <div
                  key={`${allocation.payment_id}-${index}`}
                  className="p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => handleEditAllocation(allocation)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <CreditCard className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-900">
                          Payment #{allocation.payment_id}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {allocation.method}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-500 space-y-1">
                        <div>Date: {allocation.payment_date ? formatDate(allocation.payment_date) : 'N/A'}</div>
                        <div>Payer: {allocation.payer_team_name || 'Unknown'}</div>
                        {allocation.external_ref && (
                          <div>Ref: {allocation.external_ref}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(allocation.amount_applied, allocation.payment_currency)}
                      </div>
                      <div className="text-xs text-gray-500">
                        of {formatCurrency(allocation.payment_amount || 0, allocation.payment_currency)}
                      </div>
                    </div>
                    <div className="ml-2">
                      <Edit className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <CreditCard className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No payment allocations found</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Allocation Modal */}
      <EditAllocationModal
        isOpen={isEditModalOpen}
        onClose={handleModalClose}
        onSuccess={handleAllocationUpdated}
        allocation={selectedAllocation}
        invoiceId={invoiceId}
      />
    </>
  )
} 