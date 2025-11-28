"use client"

import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { InvoiceOrder } from '../../lib/types/billing'

interface InvoiceOrderDetailsPaneProps {
  orderId: number
  onClose: () => void
  onOrderUpdate: (order: any) => void
  initialOrder?: any
}

const formatCurrency = (amount: number, currencyCode: string = 'EUR'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function InvoiceOrderDetailsPane({ 
  orderId, 
  onClose, 
  onOrderUpdate, 
  initialOrder 
}: InvoiceOrderDetailsPaneProps) {
  const supabase = createClientComponentClient()
  const [localOrder, setLocalOrder] = useState(initialOrder)

  const { data: order, isLoading, error } = useQuery({
    queryKey: ['invoice-order', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_orders')
        .select('*')
        .eq('id', orderId)
        .single()
      
      if (error) throw error
      return data
    },
    enabled: !!orderId && !initialOrder,
    initialData: initialOrder,
  })

  useEffect(() => {
    if (order) {
      setLocalOrder(order)
    }
  }, [order])

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-center text-red-500">
          <p>Error loading invoice order</p>
          <p className="text-sm mt-2">{error.message}</p>
        </div>
      </div>
    )
  }

  if (!localOrder) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          <p>Invoice order not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Invoice Order #{localOrder.id}
          </h3>
          <p className="text-sm text-gray-500">
            {formatDate(localOrder.billing_period_start)} - {formatDate(localOrder.billing_period_end)}
          </p>
        </div>
        <Badge variant="outline">{localOrder.status}</Badge>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Subtotal:</span>
            <span className="text-sm font-medium">
              {formatCurrency(localOrder.subtotal_amount, localOrder.currency_code)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">VAT:</span>
            <span className="text-sm font-medium">
              {formatCurrency(localOrder.vat_amount, localOrder.currency_code)}
            </span>
          </div>
          <div className="flex justify-between border-t pt-2">
            <span className="text-sm font-medium">Total:</span>
            <span className="text-sm font-bold">
              {formatCurrency(localOrder.total_amount, localOrder.currency_code)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <span className="text-sm text-gray-500">Project:</span>
            <p className="text-sm font-medium">{localOrder.project_name || 'N/A'}</p>
          </div>
          <div>
            <span className="text-sm text-gray-500">Lines Count:</span>
            <p className="text-sm font-medium">{localOrder.lines_count || 0}</p>
          </div>
          <div>
            <span className="text-sm text-gray-500">Issued:</span>
            <p className="text-sm font-medium">
              {localOrder.is_issued ? 'Yes' : 'No'}
            </p>
          </div>
          {localOrder.issued_date && (
            <div>
              <span className="text-sm text-gray-500">Issued Date:</span>
              <p className="text-sm font-medium">
                {formatDate(localOrder.issued_date)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end space-x-2">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  )
}

