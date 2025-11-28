"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { toast } from '../ui/use-toast'
import { Plus, Trash2 } from 'lucide-react'
import { createPayment, updatePayment, replacePaymentAllocations, getPaymentSummary, type CreatePaymentArgs, type Allocation } from '../../lib/payments'
import { useCurrentUserStore } from '../../store/current-user'
import { useQueryClient } from '@tanstack/react-query'
import { updatePaymentInCaches, addPaymentToAllCaches } from './payment-cache-utils'
import { addSupplierPaymentToAllCaches } from '../expenses/supplier-payment-cache-utils'
import type { CreatePaymentData } from '../../lib/types/billing'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { AllocationsList } from './AllocationsList'

interface PaymentCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onPaymentCreated: (paymentId: number, updatedPayment?: any) => void
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

const supabase = createClientComponentClient()

const CURRENCY_OPTIONS = [
  { id: 'EUR', label: 'EUR' },
  { id: 'USD', label: 'USD' },
  { id: 'GBP', label: 'GBP' },
]

const METHOD_OPTIONS = [
  { id: 'Bank Transfer', label: 'Bank Transfer' },
  { id: 'Credit Card', label: 'Credit Card' },
  { id: 'Check', label: 'Check' },
  { id: 'Cash', label: 'Cash' },
  { id: 'Wire Transfer', label: 'Wire Transfer' },
]

const formatCurrency = (amount: number, currencyCode: string = 'EUR') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format(amount)
}

export function PaymentCreateModal({ isOpen, onClose, onPaymentCreated, initialStep = 1, editingPayment, sortConfig, fromContext }: PaymentCreateModalProps) {
  const currentUserId = useCurrentUserStore((s) => s.publicUserId)
  const userTeams = useCurrentUserStore((s) => s.userTeams)
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(false)
  const [availableInvoices, setAvailableInvoices] = useState<InvoiceOption[]>([])
  const [availableTeams, setAvailableTeams] = useState<{ id: number; title: string }[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false)
  const [currentStep, setCurrentStep] = useState(initialStep) // 1 = payment details, 2 = allocations
  const [paymentType, setPaymentType] = useState<'AR' | 'AP' | null>(null) // Determined by user's team vs paid-to team

  const [formData, setFormData] = useState<Partial<CreatePaymentData & { paid_to_team_id?: number }>>({
    payment_date: editingPayment?.payment_date || new Date().toISOString().split('T')[0],
    payment_currency: editingPayment?.payment_currency || fromContext?.currency || 'EUR',
    method: editingPayment?.method || 'Bank Transfer',
    payer_team_id: editingPayment?.payer_team_id || fromContext?.payerTeamId,
    paid_to_team_id: editingPayment?.paid_to_team_id || fromContext?.paidToTeamId,
    external_ref: editingPayment?.external_ref || '',
    notes: editingPayment?.notes || '',
    payment_amount: editingPayment?.payment_amount || fromContext?.suggestedAmount || fromContext?.subtotalAmount || 0,
  })

  // Load teams when modal opens
  useEffect(() => {
    if (isOpen) {
      loadTeams()
    }
  }, [isOpen])

  // Pre-fill form and allocations when fromContext is provided
  useEffect(() => {
    if (fromContext && isOpen) {
      // Pre-add the invoice allocation with the full subtotal amount
      if (fromContext.invoiceId) {
        setAllocations([{
          issued_invoice_id: fromContext.invoiceId,
          amount_applied: fromContext.subtotalAmount || fromContext.suggestedAmount || 0
        }])
      }
    }
  }, [fromContext, isOpen])

  // Determine payment type (AR/AP) based on user's teams and paid-to team
  useEffect(() => {
    if (!formData.paid_to_team_id || userTeams.length === 0) {
      setPaymentType(null)
      return
    }

    // If user's team is included in the paid-to team → this is an AR payment
    // Otherwise → this is an AP payment
    const userTeamIds = userTeams.map((t) => t.team_id)
    const isPaidToUserTeam = userTeamIds.includes(formData.paid_to_team_id)
    
    setPaymentType(isPaidToUserTeam ? 'AR' : 'AP')
  }, [formData.paid_to_team_id, userTeams])

  // Update formData when editingPayment changes or modal opens
  useEffect(() => {
    if (editingPayment && isOpen) {
      setFormData({
        payment_date: editingPayment.payment_date || new Date().toISOString().split('T')[0],
        payment_currency: editingPayment.payment_currency || 'EUR',
        method: editingPayment.method || 'Bank Transfer',
        payer_team_id: editingPayment.payer_team_id,
        paid_to_team_id: editingPayment.paid_to_team_id,
        external_ref: editingPayment.external_ref || '',
        notes: editingPayment.notes || '',
        payment_amount: editingPayment.payment_amount || 0,
      })
    }
  }, [editingPayment, isOpen])

  // Load invoices when currency changes and modal is open and on step 2
  useEffect(() => {
    if (isOpen && currentStep === 2 && formData.payment_currency && paymentType) {
      loadInvoicesForCurrency(formData.payment_currency)
    } else {
      setAvailableInvoices([])
    }
  }, [isOpen, currentStep, formData.payment_currency, formData.payer_team_id, formData.paid_to_team_id, paymentType])

  const loadTeams = async () => {
    try {
      const { data: teamsData, error } = await supabase
        .from('teams')
        .select('id, title')
        .order('title', { ascending: true })

      if (error) throw error
      setAvailableTeams(teamsData || [])
    } catch (error) {
      console.error('Failed to load teams:', error)
      toast({
        title: 'Error',
        description: 'Failed to load teams',
        variant: 'destructive',
      })
    }
  }

  const loadInvoicesForCurrency = async (currency: string) => {
    setIsLoadingInvoices(true)
    try {
      if (paymentType === 'AR') {
        // Load AR invoices from v_issued_invoices_list
        let query = supabase
          .from('v_issued_invoices_list')
          .select('id, invoice_number, invoice_date, currency_code, total_amount, amount_paid, credited_amount, balance_due, status, payer_team_id')
          .eq('currency_code', currency)
          .in('status', ['issued', 'partially_paid'])
          .gt('balance_due', 0)
          .order('invoice_date', { ascending: false })
          .order('id', { ascending: true })
          .limit(50)

        // Filter by payer_team_id if available
        if (formData.payer_team_id) {
          query = query.eq('payer_team_id', formData.payer_team_id)
        }

        const { data, error } = await query
        if (error) throw error
        setAvailableInvoices(data || [])
      } else if (paymentType === 'AP') {
        // Load AP invoices from v_received_invoices_list
        let query = supabase
          .from('v_received_invoices_list')
          .select('id, invoice_number, invoice_date, currency_code, total_amount, amount_paid, credited_amount, balance_due, status, payer_team_id, issuer_team_id')
          .eq('currency_code', currency)
          .in('status', ['received', 'partially_paid'])
          .gt('balance_due', 0)
          .order('invoice_date', { ascending: false })
          .order('id', { ascending: true })
          .limit(50)

        // Filter by payer_team_id and issuer_team_id
        if (formData.payer_team_id) {
          query = query.eq('payer_team_id', formData.payer_team_id)
        }
        if (formData.paid_to_team_id) {
          query = query.eq('issuer_team_id', formData.paid_to_team_id)
        }

        const { data, error } = await query
        if (error) throw error
        setAvailableInvoices(data || [])
      }
    } catch (error) {
      console.error('Failed to load invoices:', error)
      toast({
        title: 'Error',
        description: 'Failed to load invoices',
        variant: 'destructive',
      })
    } finally {
      setIsLoadingInvoices(false)
    }
  }



  // Optimistic update function for payment list using the same pattern as invoices
  const optimisticallyAddPayment = async (paymentId: number) => {
    try {
      const { data: newPayment, error } = await getPaymentSummary(paymentId)
      if (error) throw error
      
      console.log('Fetched new payment for optimistic update:', newPayment)
      
      // Use the same pattern as invoices - update InfiniteList stores directly with sort config
      // Use the passed sortConfig or default to payment_date desc
      const finalSortConfig = sortConfig || { field: 'payment_date', direction: 'desc' as const }
      addPaymentToAllCaches(queryClient, newPayment, finalSortConfig)
      
    } catch (error) {
      console.error('Failed to optimistically update payment list:', error)
      // If optimistic update fails, just invalidate all queries
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) && 
          (query.queryKey[0] === 'v_client_payments_summary' || 
           (typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('payments-')))
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.payer_team_id || !formData.paid_to_team_id || !formData.payment_amount || !formData.payment_currency || !formData.method) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      })
      return
    }

    if (!paymentType) {
      toast({
        title: 'Error',
        description: 'Payment type could not be determined',
        variant: 'destructive',
      })
      return
    }

    // Validation for allocations
    if (remainingAmount < 0) {
      toast({
        title: 'Error',
        description: 'Total allocations exceed payment amount',
        variant: 'destructive',
      })
      return
    }

    // Validate individual allocations
    for (const allocation of allocations) {
      const invoice = getInvoiceDetails(allocation.issued_invoice_id)
      if (!invoice) {
        toast({
          title: 'Error',
          description: 'One or more allocated invoices are invalid',
          variant: 'destructive',
        })
        return
      }

      if (allocation.amount_applied > invoice.balance_due) {
        toast({
          title: 'Error',
          description: `Allocation for invoice #${invoice.invoice_number} exceeds balance due`,
          variant: 'destructive',
        })
        return
      }

      if (invoice.currency_code !== formData.payment_currency) {
        toast({
          title: 'Error',
          description: `Invoice #${invoice.invoice_number} currency doesn't match payment currency`,
          variant: 'destructive',
        })
        return
      }
    }

    setIsLoading(true)

    try {
      if (editingPayment) {
        // Determine table based on payment type
        const tableName = paymentType === 'AP' ? 'supplier_payments' : 'client_payments'
        
        // Update existing payment in the correct table
        const { error } = await supabase
          .from(tableName)
          .update({
            external_ref: formData.external_ref,
            notes: formData.notes,
            payment_date: formData.payment_date,
            method: formData.method,
            amount: formData.payment_amount,
            payment_currency: formData.payment_currency,
            payer_team_id: formData.payer_team_id,
            ...(paymentType === 'AR' && { paid_to_team_id: formData.paid_to_team_id })
          })
          .eq('id', editingPayment.payment_id)

        if (error) {
          toast({
            title: 'Error',
            description: error.message || 'Failed to update payment',
            variant: 'destructive',
          })
          return
        }

        // Update allocations if any (only for AR payments)
        if (allocations.length > 0 && paymentType === 'AR') {
          const { error: allocationError } = await replacePaymentAllocations(editingPayment.payment_id, allocations)
          if (allocationError) {
            toast({
              title: 'Error',
              description: allocationError.message || 'Failed to update allocations',
              variant: 'destructive',
            })
            return
          }
        }

        // Calculate new allocation amounts for optimistic update
        const totalAllocated = allocations.reduce((sum, allocation) => sum + allocation.amount_applied, 0)
        const newUnallocatedAmount = formData.payment_amount - totalAllocated

        // Get team names for display
        const payerTeam = availableTeams.find((t: any) => t.id === formData.payer_team_id)
        const paidToTeam = availableTeams.find((t: any) => t.id === formData.paid_to_team_id)

        // Optimistically update payment in all caches
        const updatedPaymentData = {
          payment_id: editingPayment.payment_id,
          external_ref: formData.external_ref,
          notes: formData.notes,
          payment_date: formData.payment_date,
          method: formData.method,
          payment_amount: formData.payment_amount,
          payment_currency: formData.payment_currency,
          payer_team_id: formData.payer_team_id,
          payer_team_name: payerTeam?.title || editingPayment.payer_team_name,
          paid_to_team_id: formData.paid_to_team_id,
          paid_to_team_name: paidToTeam?.title || editingPayment.paid_to_team_name,
          status: editingPayment.status, // Include the status field
          amount_allocated: totalAllocated,
          unallocated_amount: newUnallocatedAmount,
          is_overallocated: newUnallocatedAmount < 0,
          created_at: editingPayment.created_at,
          updated_at: new Date().toISOString()
        }
        
        console.log('[PaymentCreateModal] Step 1: updatedPaymentData created:', updatedPaymentData);
        
        updatePaymentInCaches(queryClient, updatedPaymentData)
        console.log('[PaymentCreateModal] Step 2: updatePaymentInCaches called');
        
        // Dispatch event to notify other components (like payments list page)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('paymentUpdated', {
            detail: { paymentId: editingPayment.payment_id, updatedPayment: updatedPaymentData }
          }))
          console.log('[PaymentCreateModal] Step 3: paymentUpdated event dispatched');
        }
        
        // Also invalidate queries to ensure consistency
        await queryClient.invalidateQueries({ queryKey: ['payment', editingPayment.payment_id] })
        await queryClient.invalidateQueries({ 
          predicate: (query) => 
            Array.isArray(query.queryKey) && 
            (query.queryKey[0] === 'v_client_payments_summary' || 
             query.queryKey.includes('v_client_payments_summary'))
        })
        console.log('[PaymentCreateModal] Step 4: queries invalidated');
        
        toast({
          title: 'Success',
          description: 'Payment updated successfully',
        })
        
        console.log('[PaymentCreateModal] Step 5: About to call onPaymentCreated with:', {
          paymentId: editingPayment.payment_id,
          updatedPayment: updatedPaymentData
        });
        onPaymentCreated(editingPayment.payment_id, updatedPaymentData)
        console.log('[PaymentCreateModal] Step 6: onPaymentCreated called');
      } else {
        // Create new payment
        if (!currentUserId) {
          toast({
            title: 'Error',
            description: 'User not authenticated',
            variant: 'destructive',
          })
          return
        }

        let paymentId: number

        if (paymentType === 'AR') {
          // Create AR payment using existing createPayment function
          const paymentArgs: CreatePaymentArgs = {
            payerTeamId: formData.payer_team_id!,
            paidToTeamId: formData.paid_to_team_id,
            receivedByUserId: currentUserId,
            paymentDate: formData.payment_date!,
            amount: formData.payment_amount!,
            currency: formData.payment_currency!,
            method: formData.method!,
            externalRef: formData.external_ref,
            notes: formData.notes,
            allocations: allocations
          }

          const { data, error } = await createPayment(paymentArgs)

          if (error) {
            toast({
              title: 'Error',
              description: error.message || 'Failed to create payment',
              variant: 'destructive',
            })
            return
          }

          paymentId = data
        } else {
          // Create AP payment using create_supplier_payment_with_allocations
          const apAllocations = allocations.map(alloc => ({
            received_invoice_id: alloc.issued_invoice_id, // Map to received_invoice_id for AP
            amount_applied: alloc.amount_applied
          }))

          const { data, error } = await supabase.rpc('create_supplier_payment_with_allocations', {
            p_payer_team_id: formData.payer_team_id!,
            p_paid_to_team_id: formData.paid_to_team_id!,
            p_received_by_user_id: currentUserId,
            p_payment_date: formData.payment_date!,
            p_amount: formData.payment_amount!,
            p_payment_currency: formData.payment_currency!,
            p_method: formData.method!,
            p_exchange_rate_note: null,
            p_external_ref: formData.external_ref || null,
            p_notes: formData.notes || null,
            p_allocations: apAllocations
          })

          if (error) {
            toast({
              title: 'Error',
              description: error.message || 'Failed to create supplier payment',
              variant: 'destructive',
            })
            return
          }

          paymentId = data
        }

        toast({
          title: 'Success',
          description: `${paymentType} payment created successfully`,
        })
        
        // Get team names for the payment data
        const payerTeam = availableTeams.find((t: any) => t.id === formData.payer_team_id)
        const paidToTeam = availableTeams.find((t: any) => t.id === formData.paid_to_team_id)
        
        // Construct payment data for optimistic updates and immediate display
        const paymentData = {
          payment_id: paymentId,
          payer_team_id: formData.payer_team_id,
          payer_team_name: payerTeam?.title || '',
          paid_to_team_id: formData.paid_to_team_id,
          paid_to_team_name: paidToTeam?.title || '',
          payment_date: formData.payment_date,
          payment_amount: formData.payment_amount,
          payment_currency: formData.payment_currency,
          status: 'posted',
          external_ref: formData.external_ref,
          notes: formData.notes,
          method: formData.method,
          amount_allocated: totalAllocated,
          unallocated_amount: formData.payment_amount! - totalAllocated,
          is_overallocated: (formData.payment_amount! - totalAllocated) < 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        
        console.log('[PaymentCreateModal] Created payment data:', paymentData);
        
        // Reset form
        setFormData({
          payment_date: new Date().toISOString().split('T')[0],
          payment_currency: 'EUR',
          method: 'Bank Transfer',
        })
        setAllocations([])
        setInvoiceSearch('')
        setCurrentStep(1)
        
        // Optimistically add the new payment to the appropriate list
        if (paymentType === 'AR') {
          optimisticallyAddPayment(paymentId)
        } else {
          // For AP payments, optimistically add to supplier payment list
          // We'll need a similar function for supplier payments
          queryClient.invalidateQueries({
            predicate: (query) =>
              Array.isArray(query.queryKey) && 
              (query.queryKey[0] === 'v_supplier_payments_summary' || 
               (typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('supplier-payments-')))
          })
        }
        
        onPaymentCreated(paymentId, paymentData)
      }
      
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create payment',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddAllocation = (invoiceId: number, amount: number) => {
    // Check if allocation already exists for this invoice
    if (allocations.some(a => a.issued_invoice_id === invoiceId)) {
      toast({
        title: 'Error',
        description: 'This invoice is already allocated',
        variant: 'destructive',
      })
      return
    }

    const newAllocation: Allocation = {
      issued_invoice_id: invoiceId,
      amount_applied: amount,
    }

    setAllocations(prev => [...prev, newAllocation])
  }

  const handleUpdateAllocation = (index: number, amount: number) => {
    setAllocations(prev => prev.map((allocation, i) => 
      i === index ? { ...allocation, amount_applied: amount } : allocation
    ))
  }

  const handleRemoveAllocation = (index: number) => {
    setAllocations(prev => prev.filter((_, i) => i !== index))
  }

  const getInvoiceDetails = (invoiceId: number) => {
    return availableInvoices.find(inv => inv.id === invoiceId)
  }

  const totalAllocated = allocations.reduce((sum, allocation) => sum + allocation.amount_applied, 0)
  const remainingAmount = (formData.payment_amount || 0) - totalAllocated

  const handleCurrencyChange = (newCurrency: string) => {
    if (allocations.length > 0) {
      if (window.confirm('Changing currency will clear all allocations. Continue?')) {
        setAllocations([])
        setFormData(prev => ({ ...prev, payment_currency: newCurrency }))
      }
    } else {
      setFormData(prev => ({ ...prev, payment_currency: newCurrency }))
    }
  }

  const handleCancel = () => {
    setFormData({
      payment_date: new Date().toISOString().split('T')[0],
      payment_currency: 'EUR',
      method: 'Bank Transfer',
    })
    setAllocations([])
    setInvoiceSearch('')
    setCurrentStep(1)
    onClose()
  }

  const handleNext = () => {
    if (!formData.payer_team_id || !formData.paid_to_team_id || !formData.payment_amount || !formData.payment_currency || !formData.method) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      })
      return
    }
    if (!paymentType) {
      toast({
        title: 'Error',
        description: 'Payment type could not be determined. Please select both payer and paid-to teams.',
        variant: 'destructive',
      })
      return
    }
    setCurrentStep(2)
  }

  const handleBack = () => {
    setCurrentStep(1)
  }

  const handleSavePayment = async () => {
    if (editingPayment) {
      // When editing, save payment with allocations
      await handleSubmit(new Event('submit') as any)
    } else {
      // When creating, save payment without allocations
      await handleSubmit(new Event('submit') as any)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingPayment 
              ? (currentStep === 1 ? 'Edit Payment' : 'Add Invoice') 
              : (currentStep === 1 ? 'Add Payment' : 'Add Invoice')
            }
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {currentStep === 1 && (
            <>
              {/* Payment Details */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-900">Payment Details</h3>
            
            {/* Payer Team */}
            <div className="space-y-1">
              <Label htmlFor="payer_team_id" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Payer Team*
              </Label>
              <select
                id="payer_team_id"
                value={formData.payer_team_id || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, payer_team_id: parseInt(e.target.value) }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                required
              >
                <option value="">Select Team</option>
                {availableTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Paid to Team */}
            <div className="space-y-1">
              <Label htmlFor="paid_to_team_id" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Paid to Team*
              </Label>
              <select
                id="paid_to_team_id"
                value={formData.paid_to_team_id || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, paid_to_team_id: parseInt(e.target.value) }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                required
              >
                <option value="">Select Team</option>
                {availableTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.title}
                  </option>
                ))}
              </select>
              {paymentType && (
                <p className="text-xs text-gray-500 mt-1">
                  Payment Type: <span className="font-medium">{paymentType === 'AR' ? 'Accounts Receivable' : 'Accounts Payable'}</span>
                </p>
              )}
            </div>

            {/* Payment Date */}
            <div className="space-y-1">
              <Label htmlFor="payment_date" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Payment Date*
              </Label>
              <Input
                id="payment_date"
                type="date"
                value={formData.payment_date}
                onChange={(e) => setFormData(prev => ({ ...prev, payment_date: e.target.value }))}
                required
                className="h-9"
              />
            </div>

            {/* Amount and Currency */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="payment_amount" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Amount*
                </Label>
                              <Input
                id="payment_amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.payment_amount || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, payment_amount: parseFloat(e.target.value) }))}
                required
                className="h-9"
              />
              </div>
              <div className="space-y-1">
                <Label htmlFor="payment_currency" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Currency*
                </Label>
                              <select
                id="payment_currency"
                value={formData.payment_currency}
                onChange={(e) => handleCurrencyChange(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                required
              >
                  {CURRENCY_OPTIONS.map((currency) => (
                    <option key={currency.id} value={currency.id}>
                      {currency.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Method */}
            <div className="space-y-1">
              <Label htmlFor="method" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Payment Method*
              </Label>
              <select
                id="method"
                value={formData.method}
                onChange={(e) => setFormData(prev => ({ ...prev, method: e.target.value }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                required
              >
                {METHOD_OPTIONS.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.label}
                  </option>
                ))}
              </select>
            </div>

            {/* External Reference */}
            <div className="space-y-1">
              <Label htmlFor="external_ref" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                External Reference
              </Label>
              <Input
                id="external_ref"
                value={formData.external_ref || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, external_ref: e.target.value }))}
                className="h-9"
                placeholder="Transaction ID, check number, etc."
              />
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label htmlFor="notes" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Notes
              </Label>
              <Textarea
                id="notes"
                value={formData.notes || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                rows={2}
                className="resize-none"
              />
            </div>
              </div>
            </>
          )}

          {currentStep === 2 && (
            <>
              {/* Allocations Section */}
              <AllocationsList
                currency={formData.payment_currency || ''}
                paymentAmount={formData.payment_amount || 0}
                allocations={allocations}
                availableInvoices={availableInvoices}
                isLoadingInvoices={isLoadingInvoices}
                onAddAllocation={handleAddAllocation}
                onUpdateAllocation={handleUpdateAllocation}
                onRemoveAllocation={handleRemoveAllocation}
                invoiceSearch={invoiceSearch}
                onInvoiceSearchChange={setInvoiceSearch}
              />
            </>
          )}
        </form>

        <DialogFooter className="flex justify-between">
          {currentStep === 1 ? (
            <>
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleCancel}
                disabled={isLoading}
                className="px-6"
              >
                Cancel
              </Button>
              <div className="space-x-2">
                <Button 
                  type="button" 
                  onClick={handleSavePayment}
                  disabled={isLoading || !formData.payer_team_id || !formData.paid_to_team_id || !formData.payment_amount || !formData.payment_currency || !formData.method || !paymentType}
                  className="px-6 bg-black text-white hover:bg-gray-800"
                >
                  {isLoading ? (editingPayment ? 'Updating...' : 'Creating...') : (editingPayment ? 'Update Payment' : 'Save Payment')}
                </Button>
                <Button 
                  type="button" 
                  onClick={handleNext}
                  disabled={!formData.payer_team_id || !formData.paid_to_team_id || !formData.payment_amount || !formData.payment_currency || !formData.method || !paymentType}
                  className="px-6"
                >
                  Next
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleBack}
                disabled={isLoading}
                className="px-6"
              >
                Back
              </Button>
              <Button 
                type="submit" 
                onClick={handleSubmit}
                disabled={isLoading || remainingAmount < 0}
                className="px-6 bg-black text-white hover:bg-gray-800"
              >
                {isLoading ? (editingPayment ? 'Updating...' : 'Creating...') : (editingPayment ? 'Update Payment' : 'Create Payment')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 