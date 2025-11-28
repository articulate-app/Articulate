"use client"

import React, { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { updateIssuedInvoiceOrderAmounts, updateInvoiceOrderInCaches } from '../../lib/services/billing'
import { updateInvoiceInCaches } from './invoice-cache-utils'
import { toast } from '../ui/use-toast'
import { updateItemInStore, getItemFromStore } from '../../../hooks/use-infinite-query'
import { Unlink, Edit } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

interface LinkedOrdersTableProps {
  invoice: any
  onUpdate: (updatedInvoice: any) => void
  isPane?: boolean
  // Modal state and handlers
  onEditLinkedOrder?: (link: any) => void
  onUnlinkOrder?: (link: any) => void
  unlinkingOrderId?: number | null
}

const formatCurrency = (amount: number, currencyCode: string | null = 'EUR') => {
  const safeCurrencyCode = currencyCode || 'EUR'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: safeCurrencyCode,
  }).format(amount)
}

export function LinkedOrdersTable({ 
  invoice, 
  onUpdate, 
  isPane = false,
  onEditLinkedOrder,
  onUnlinkOrder,
  unlinkingOrderId
}: LinkedOrdersTableProps) {
  const searchParams = useSearchParams()
  const [editingAmounts, setEditingAmounts] = useState<Map<number, number>>(new Map())
  const [isUpdating, setIsUpdating] = useState<Map<number, boolean>>(new Map())
  const queryClient = useQueryClient()
  
  // Get current sort configuration from URL params
  const sortBy = searchParams.get('sortBy') || 'invoice_date'
  const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'
  const sortConfig = { field: sortBy, direction: sortOrder as 'asc' | 'desc' }

  // Debug: Log invoice status
  console.log('LinkedOrdersTable - Invoice status:', invoice.status, 'isPane:', isPane)

  const handleAmountChange = (linkId: number, value: string) => {
    const newEditingAmounts = new Map(editingAmounts)
    newEditingAmounts.set(linkId, parseFloat(value))
    setEditingAmounts(newEditingAmounts)
  }

  const handleAmountBlur = async (link: any) => {
    const linkId = link.id
    const newAmount = editingAmounts.get(linkId)
    
    if (!newAmount) return
    
    const billedSubtotal = parseFloat(newAmount.toString())
    const orderSubtotal = link.invoice_orders.subtotal_amount
    
    if (isNaN(billedSubtotal) || billedSubtotal < 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid positive number',
        variant: 'destructive',
      })
      return
    }

    // Check if amount exceeds remaining
    const remaining = link.invoice_orders.remaining_subtotal || 0
    if (billedSubtotal > remaining) {
      toast({
        title: 'Amount Exceeds Remaining',
        description: `Cannot bill more than ${formatCurrency(remaining, link.invoice_orders.currency_code)}`,
        variant: 'destructive',
      })
      return
    }

    setIsUpdating(prev => new Map(prev).set(linkId, true))

    // Optimistically update the invoice order in the list
    const orderId = link.invoice_order_id
    const oldBilledAmount = link.amount_override_subtotal || orderSubtotal
    const billedDifference = billedSubtotal - oldBilledAmount

    // Optimistically update the invoice order in the v_invoice_orders_list store
    const currentOrder = getItemFromStore('v_invoice_orders_list', undefined, orderId) as any
    if (currentOrder) {
      // Update the remaining_subtotal (amount available for future invoices)
      const newRemainingSubtotal = Math.max(0, (currentOrder.remaining_subtotal || 0) - billedDifference)
      
      const updatedOrder = {
        ...currentOrder,
        remaining_subtotal: newRemainingSubtotal,
      }
      
      updateItemInStore('v_invoice_orders_list', undefined, updatedOrder)
      
      // Also trigger a custom event for the invoice order detail pane to update
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('invoiceOrderSummaryUpdated', { 
          detail: { orderId, updatedOrder } 
        }))
      }
    }

    // Also update the issued invoice in the v_issued_invoices_list store
    const currentInvoice = getItemFromStore('v_issued_invoices_list', undefined, invoice.id) as any
    if (currentInvoice) {
      // Calculate the new total for the issued invoice
      const oldTotal = currentInvoice.total_amount || 0
      const newTotal = oldTotal + billedDifference
      const updatedInvoice = { ...currentInvoice, total_amount: newTotal }
      updateItemInStore('v_issued_invoices_list', undefined, updatedInvoice)
      
      // Trigger a custom event for the issued invoice detail pane to update
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('issuedInvoiceUpdated', { 
          detail: { invoiceId: invoice.id, updatedInvoice } 
        }))
      }
    }

    // Also update the linked order's remaining_to_issue in the local state
    const updatedInvoiceWithLinkedOrder = {
      ...invoice,
      issued_invoice_orders: invoice.issued_invoice_orders.map((l: any) => {
        if (l.id === linkId) {
          return {
            ...l,
            amount_override_subtotal: billedSubtotal,
            invoice_orders: {
              ...l.invoice_orders,
              remaining_subtotal: Math.max(0, (l.invoice_orders.remaining_subtotal || 0) - billedDifference)
            }
          }
        }
        return l
      })
    }

    try {
      const { data, error } = await updateIssuedInvoiceOrderAmounts(
        invoice.id,
        link.invoice_order_id,
        billedSubtotal,
        orderSubtotal
      )

      if (error) {
        throw error
      }

      // Also update the invoice's total amount based on the billed difference
      const newInvoiceTotal = (invoice.total_amount || 0) + billedDifference
      const updatedInvoiceWithTotal = {
        ...updatedInvoiceWithLinkedOrder,
        total_amount: newInvoiceTotal
      }
      
      onUpdate(updatedInvoiceWithTotal)
      
      // Optimistically update invoice in all caches (including list)
      updateInvoiceInCaches(queryClient, updatedInvoiceWithTotal, sortConfig)

      toast({
        title: 'Success',
        description: 'Billed amount updated',
      })
    } catch (err: any) {
      // Revert optimistic update on error
      const currentOrderForRevert = getItemFromStore('v_invoice_orders_list', undefined, orderId) as any
      if (currentOrderForRevert) {
        // Revert the changes
        const newRemainingSubtotal = Math.max(0, (currentOrderForRevert.remaining_subtotal || 0) + billedDifference)
        
        const revertedOrder = {
          ...currentOrderForRevert,
          remaining_subtotal: newRemainingSubtotal,
        }
        
        updateItemInStore('v_invoice_orders_list', undefined, revertedOrder)
        
        // Also trigger a custom event for the invoice order detail pane to revert
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('invoiceOrderSummaryUpdated', { 
            detail: { orderId, updatedOrder: revertedOrder } 
          }))
        }
      }

      // Also revert the issued invoice in the v_issued_invoices_list store
      const currentInvoiceForRevert = getItemFromStore('v_issued_invoices_list', undefined, invoice.id) as any
      if (currentInvoiceForRevert) {
        const oldTotal = currentInvoiceForRevert.total_amount || 0
        const revertedTotal = oldTotal - billedDifference
        const revertedInvoice = { ...currentInvoiceForRevert, total_amount: revertedTotal }
        updateItemInStore('v_issued_invoices_list', undefined, revertedInvoice)
        
        // Trigger a custom event for the issued invoice detail pane to revert
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('issuedInvoiceUpdated', { 
            detail: { invoiceId: invoice.id, updatedInvoice: revertedInvoice } 
          }))
        }
      }

      toast({
        title: 'Error',
        description: err.message || 'Failed to update billed amount',
        variant: 'destructive',
      })
    } finally {
      setIsUpdating(prev => {
        const newMap = new Map(prev)
        newMap.delete(linkId)
        return newMap
      })
    }
  }

  const handleUnlinkOrder = (link: any) => {
    console.log('handleUnlinkOrder called with link:', link)
    if (onUnlinkOrder) {
      onUnlinkOrder(link)
    }
  }

  const handleEditLinkedOrder = (link: any) => {
    console.log('handleEditLinkedOrder called with link:', link)
    if (onEditLinkedOrder) {
      onEditLinkedOrder(link)
    }
  }

  const getBilledAmount = (link: any) => {
    return link.amount_override_subtotal !== null ? link.amount_override_subtotal : link.invoice_orders.subtotal_amount
  }

  const isPartial = (link: any) => {
    const billedAmount = getBilledAmount(link)
    return billedAmount < link.invoice_orders.subtotal_amount
  }

  const hasRemaining = (link: any) => {
    return (link.invoice_orders.remaining_subtotal || 0) > 0
  }

  if (!invoice.issued_invoice_orders || invoice.issued_invoice_orders.length === 0) {
    if (isPane) {
      return (
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-3">Linked Orders (0)</h3>
          <div className="text-center py-4 text-gray-500">
            No linked orders found
          </div>
        </div>
      )
    }
    return (
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Linked Orders (0)
          </h2>
        </div>
        <div className="px-6 py-8 text-center text-gray-500">
          No linked orders found
        </div>
      </div>
    )
  }

  if (isPane) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-900">Linked Orders ({invoice.issued_invoice_orders.length})</h3>
        <div className="space-y-3">
          {invoice.issued_invoice_orders.map((link: any) => {
            const order = link.invoice_orders
            const billedAmount = getBilledAmount(link)
            const remaining = order.subtotal_amount - billedAmount
            const isEditing = editingAmounts.has(link.id)
            const isUpdatingRow = isUpdating.get(link.id) || false

            return (
              <div key={link.id} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">
                      {order.projects?.name || 'Unknown Project'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(order.billing_period_start).toLocaleDateString()} - {new Date(order.billing_period_end).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        console.log('Edit button clicked for link:', link)
                        handleEditLinkedOrder(link)
                      }}
                      className="h-8 w-8 p-0 text-gray-400 hover:text-blue-600"
                      title="Edit linked order allocation"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        console.log('Unlink button clicked for link:', link)
                        handleUnlinkOrder(link)
                      }}
                      disabled={unlinkingOrderId === link.invoice_order_id}
                      className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                      title="Unlink this order from the invoice"
                    >
                      <Unlink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500 mb-1">Order Amount (No VAT)</div>
                    <div className="font-medium">{formatCurrency(order.subtotal_amount, order.currency_code)}</div>
                  </div>
                  
                  <div>
                    <div className="text-gray-500 mb-1">Billed Amount</div>
                    <div className="font-medium">{formatCurrency(billedAmount, order.currency_code)}</div>
                  </div>
                  
                  <div>
                    <div className="text-gray-500 mb-1">Remaining (No VAT)</div>
                    <div className="font-medium">{formatCurrency(remaining, order.currency_code)}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Linked Orders ({invoice.issued_invoice_orders.length})
          </h2>
        </div>
        <div className="overflow-auto">
          <table className="w-full" style={{ minWidth: '1000px' }}>
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Project
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Period
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order Total
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Billed Total
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Remaining
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {invoice.issued_invoice_orders.map((link: any) => {
                const order = link.invoice_orders
                const billedAmount = getBilledAmount(link)
                const remaining = order.subtotal_amount - billedAmount
                const isEditing = editingAmounts.has(link.id)
                const isUpdatingRow = isUpdating.get(link.id) || false

                return (
                  <tr key={link.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center">
                        <div className="text-sm font-medium text-gray-900">
                          {order.projects?.name || 'Unknown Project'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(order.billing_period_start).toLocaleDateString()} - {new Date(order.billing_period_end).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatCurrency(order.subtotal_amount, order.currency_code)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {isEditing ? (
                        <div className="flex items-center space-x-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={editingAmounts.get(link.id) || billedAmount}
                            onChange={(e) => handleAmountChange(link.id, e.target.value)}
                            onBlur={() => handleAmountBlur(link)}
                            className="w-20 h-8 text-sm"
                            disabled={isUpdatingRow}
                          />
                          {isUpdatingRow && <div className="text-xs text-gray-500">Saving...</div>}
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <span>{formatCurrency(billedAmount, order.currency_code)}</span>
                          {isPartial(link) && (
                            <Badge variant="secondary" className="text-xs">
                              Partial
                            </Badge>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {hasRemaining(link) && (
                        <Badge variant="outline" className="text-xs">
                          {formatCurrency(remaining, order.currency_code)}
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={order.status === 'draft' ? 'secondary' : 'default'}>
                        {order.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            console.log('Edit button clicked for link:', link)
                            handleEditLinkedOrder(link)
                          }}
                          className="h-8 w-8 p-0 text-gray-400 hover:text-blue-600"
                          title="Edit linked order allocation"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            console.log('Unlink button clicked for link:', link)
                            handleUnlinkOrder(link)
                          }}
                          disabled={unlinkingOrderId === link.invoice_order_id}
                          className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                          title="Unlink this order from the invoice"
                        >
                          <Unlink className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
} 