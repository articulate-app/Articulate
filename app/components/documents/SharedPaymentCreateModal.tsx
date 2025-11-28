"use client"

import { useState, useEffect } from 'react'
import { useCurrentUserStore } from '../../store/current-user'
import { PaymentCreateModal } from '../payments/PaymentCreateModal'
import { getPaymentSummary } from '../../lib/payments'
import { getSupplierPaymentSummary } from '../../lib/services/expenses'
import { toast } from '../ui/use-toast'

interface SharedPaymentCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onPaymentCreated?: (paymentId: number) => void // Legacy callback
  onSuccess?: (document: any) => void // New callback for optimistic updates
  initialStep?: number
  editingPayment?: any
  sortConfig?: { field: string; direction: 'asc' | 'desc' }
  fromContext?: {
    invoiceId?: number
    invoiceNumber?: string
    payerTeamId?: number
    payerTeamName?: string
    paidToTeamId?: number
    paidToTeamName?: string
    currency?: string
    subtotalAmount?: number
    suggestedAmount?: number
  }
}

export function SharedPaymentCreateModal({ 
  isOpen, 
  onClose, 
  onPaymentCreated,
  onSuccess,
  initialStep = 1,
  editingPayment,
  sortConfig = { field: 'payment_date', direction: 'desc' },
  fromContext
}: SharedPaymentCreateModalProps) {
  
  // Handle payment creation and fetch full document for optimistic updates
  const handlePaymentCreatedInternal = async (paymentId: number, paymentData?: any) => {
    // Call legacy callback if provided
    if (onPaymentCreated) {
      onPaymentCreated(paymentId)
    }
    
    // If onSuccess callback is provided
    if (onSuccess) {
      // If payment data was passed directly, use it (no need to query)
      if (paymentData) {
        console.log('[SharedPaymentCreateModal] Using passed payment data:', paymentData);
        
        // Determine direction based on team IDs
        const isAR = paymentData.paid_to_team_id && paymentData.paid_to_team_id !== paymentData.payer_team_id
        
        const direction = isAR ? 'ar' as const : 'ap' as const
        const document = {
          doc_id: paymentData.payment_id,
          direction,
          doc_kind: 'payment' as const, // ✅ Unified doc_kind
          doc_number: paymentData.external_ref || `PAY-${paymentData.payment_id}`, // ✅ Fixed prefix
          doc_date: paymentData.payment_date,
          currency_code: paymentData.payment_currency,
          subtotal_amount: paymentData.payment_amount,
          vat_amount: 0,
          total_amount: paymentData.payment_amount,
          status: paymentData.status || 'posted',
          from_team_id: paymentData.payer_team_id, // ✅ Correct mapping
          from_team_name: paymentData.payer_team_name, // ✅ Correct mapping
          to_team_id: paymentData.paid_to_team_id, // ✅ Correct mapping
          to_team_name: paymentData.paid_to_team_name, // ✅ Correct mapping
          balance_due: paymentData.unallocated_amount,
          projects_text: null,
          created_at: paymentData.created_at,
          updated_at: paymentData.updated_at
        }
        
        console.log('[SharedPaymentCreateModal] Created document from payment data:', document);
        onSuccess(document)
        onClose()
        return
      }
      
      // Fallback: query views if no data was passed (legacy behavior)
      try {
        const { data: arPayment, error: arError } = await getPaymentSummary(paymentId)
        
        if (!arError && arPayment) {
          const document = {
            doc_id: arPayment.payment_id,
            direction: 'ar' as const,
            doc_kind: 'payment' as const, // ✅ Fixed
            doc_number: arPayment.external_ref || `PAY-${arPayment.payment_id}`, // ✅ Fixed
            doc_date: arPayment.payment_date,
            currency_code: arPayment.payment_currency,
            subtotal_amount: arPayment.payment_amount,
            vat_amount: 0,
            total_amount: arPayment.payment_amount,
            status: arPayment.status || 'received',
            from_team_id: arPayment.payer_team_id,
            from_team_name: arPayment.payer_team_name,
            to_team_id: arPayment.paid_to_team_id || arPayment.payer_team_id,
            to_team_name: arPayment.paid_to_team_name || arPayment.payer_team_name,
            balance_due: arPayment.unallocated_amount,
            projects_text: null,
            created_at: arPayment.created_at,
            updated_at: arPayment.updated_at
          }
          
          onSuccess(document)
          onClose()
          return
        }
        
        const { data: apPayment, error: apError } = await getSupplierPaymentSummary(paymentId)
        
        if (!apError && apPayment) {
          const document = {
            doc_id: apPayment.payment_id,
            direction: 'ap' as const,
            doc_kind: 'payment' as const, // ✅ Fixed
            doc_number: apPayment.external_ref || `PAY-${apPayment.payment_id}`, // ✅ Fixed
            doc_date: apPayment.payment_date,
            currency_code: apPayment.payment_currency,
            subtotal_amount: apPayment.payment_amount,
            vat_amount: 0,
            total_amount: apPayment.payment_amount,
            status: apPayment.status || 'paid',
            from_team_id: apPayment.payer_team_id,
            from_team_name: apPayment.payer_team_name,
            to_team_id: apPayment.paid_to_team_id,
            to_team_name: apPayment.paid_to_team_name,
            balance_due: apPayment.unallocated_amount,
            projects_text: null,
            created_at: apPayment.created_at,
            updated_at: apPayment.updated_at
          }
          
          onSuccess(document)
          onClose()
          return
        }
        
        toast({
          title: 'Warning',
          description: 'Payment created but could not fetch details for immediate display',
          variant: 'default',
        })
        onClose()
      } catch (error) {
        console.error('Error fetching payment details:', error)
        toast({
          title: 'Warning',
          description: 'Payment created but could not fetch details',
          variant: 'default',
        })
        onClose()
      }
    } else {
      onClose()
    }
  }

  // The unified PaymentCreateModal handles both AR and AP
  return (
    <PaymentCreateModal
      isOpen={isOpen}
      onClose={onClose}
      onPaymentCreated={handlePaymentCreatedInternal}
      initialStep={initialStep}
      editingPayment={editingPayment}
      sortConfig={sortConfig}
      fromContext={fromContext}
    />
  )
}
