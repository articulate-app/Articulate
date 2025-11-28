"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { toast } from '../ui/use-toast'
import { Plus, Trash2 } from 'lucide-react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useQueryClient } from '@tanstack/react-query'
import { useCurrentUserStore } from '../../store/current-user'

interface SupplierPaymentCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onPaymentCreated: (paymentId: number) => void
  fromInvoice?: {
    invoiceId: number
    invoiceNumber: string
    amount: number
    balanceDue: number
    currency: string
    payerTeamId: number
    paidToTeamId: number
  }
  editingPayment?: any
  addAllocationMode?: boolean
  existingPaymentId?: number
}

interface Team {
  id: number
  title: string
  type: 'payer' | 'supplier'
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

const CURRENCY_OPTIONS = [
  { id: 'EUR', label: 'EUR' },
  { id: 'USD', label: 'USD' },
  { id: 'GBP', label: 'GBP' },
]

const METHOD_OPTIONS = [
  { id: 'Bank Transfer', label: 'Bank Transfer' },
  { id: 'Credit Card', label: 'Credit Card' },
  { id: 'Cash', label: 'Cash' },
  { id: 'Check', label: 'Check' },
  { id: 'Other', label: 'Other' },
]

export function SupplierPaymentCreateModal({ 
  isOpen, 
  onClose, 
  onPaymentCreated, 
  fromInvoice,
  editingPayment,
  addAllocationMode = false,
  existingPaymentId
}: SupplierPaymentCreateModalProps) {
  const queryClient = useQueryClient()
  const supabase = createClientComponentClient()
  const currentUserId = useCurrentUserStore((s) => s.publicUserId)
  const [isLoading, setIsLoading] = useState(false)
  const [teams, setTeams] = useState<Team[]>([])
  const [isLoadingTeams, setIsLoadingTeams] = useState(false)
  const [availableInvoices, setAvailableInvoices] = useState<InvoiceOption[]>([])
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false)
  const [currentStep, setCurrentStep] = useState(addAllocationMode ? 2 : 1)
  const [allocations, setAllocations] = useState<Array<{ received_invoice_id: number; amount_applied: number }>>([])

  const [formData, setFormData] = useState({
    payer_team_id: fromInvoice?.payerTeamId || editingPayment?.payer_team_id || '',
    paid_to_team_id: fromInvoice?.paidToTeamId || editingPayment?.paid_to_team_id || '',
    payment_date: editingPayment?.payment_date || new Date().toISOString().split('T')[0],
    amount: fromInvoice?.amount || editingPayment?.amount || editingPayment?.payment_amount || '',
    payment_currency: fromInvoice?.currency || editingPayment?.payment_currency || 'EUR',
    notes: editingPayment?.notes || '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  // Fetch teams
  useEffect(() => {
    if (isOpen) {
      fetchTeams()
    }
  }, [isOpen])

  // Fetch invoices when step 2 is reached and paid_to_team_id is selected
  useEffect(() => {
    if (isOpen && currentStep === 2 && (formData.paid_to_team_id || addAllocationMode)) {
      fetchAvailableInvoices()
    }
  }, [isOpen, currentStep, formData.paid_to_team_id, addAllocationMode])

  // Update form data when editingPayment changes
  useEffect(() => {
    if (editingPayment && isOpen) {
      setFormData({
        payer_team_id: editingPayment.payer_team_id || '',
        paid_to_team_id: editingPayment.paid_to_team_id || '',
        payment_date: editingPayment.payment_date || new Date().toISOString().split('T')[0],
        amount: editingPayment.payment_amount || '',
        payment_currency: editingPayment.payment_currency || 'EUR',
        notes: editingPayment.notes || '',
      })
    }
  }, [editingPayment, isOpen])

  const fetchTeams = async () => {
    setIsLoadingTeams(true)
    try {
      // Fetch payer teams (teams I belong to)
      const { data: payerTeams, error: payerError } = await supabase
        .from('v_teams_i_belong_to')
        .select('team_id, team_title')
        .order('team_title')

      if (payerError) throw payerError

      // Fetch supplier teams (for paid to team)
      const { data: supplierTeams, error: supplierError } = await supabase
        .from('v_suppliers_teams')
        .select('team_id, team_name')
        .order('team_name')

      if (supplierError) throw supplierError

      // Combine both team types
      const allTeams: Team[] = [
        ...(payerTeams?.map(t => ({ id: t.team_id, title: t.team_title, type: 'payer' as const })) || []),
        ...(supplierTeams?.map(t => ({ id: t.team_id, title: t.team_name, type: 'supplier' as const })) || [])
      ]
      
      setTeams(allTeams)
    } catch (error) {
      console.error('Failed to fetch teams:', error)
      toast({
        title: 'Error',
        description: 'Failed to fetch teams',
        variant: 'destructive',
      })
    } finally {
      setIsLoadingTeams(false)
    }
  }

  const fetchAvailableInvoices = async () => {
    setIsLoadingInvoices(true)
    try {
      let teamId = formData.paid_to_team_id
      
      // In add allocation mode, get the team ID from the existing payment
      if (addAllocationMode && existingPaymentId) {
        const { data: paymentData, error: paymentError } = await supabase
          .from('v_supplier_payments_summary')
          .select('paid_to_team_id')
          .eq('payment_id', existingPaymentId)
          .single()
        
        if (paymentError) throw paymentError
        teamId = paymentData.paid_to_team_id
      }
      
      if (!teamId) {
        setAvailableInvoices([])
        return
      }

      const { data, error } = await supabase
        .from('v_received_invoices_list')
        .select('*')
        .eq('status', 'received')
        .eq('issuer_team_id', parseInt(teamId))
        .gt('balance_due', 0)
        .order('invoice_date', { ascending: false })

      if (error) throw error
      setAvailableInvoices(data || [])
    } catch (error) {
      console.error('Failed to fetch invoices:', error)
      toast({
        title: 'Error',
        description: 'Failed to fetch available invoices',
        variant: 'destructive',
      })
    } finally {
      setIsLoadingInvoices(false)
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.payer_team_id) {
      newErrors.payer_team_id = 'Payer team is required'
    }
    if (!formData.paid_to_team_id) {
      newErrors.paid_to_team_id = 'Paid to team is required'
    }
    if (!formData.payment_date) {
      newErrors.payment_date = 'Payment date is required'
    }
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = 'Amount must be greater than 0'
    }
    if (!formData.payment_currency) {
      newErrors.payment_currency = 'Currency is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNextStep = () => {
    if (currentStep === 1) {
      if (!validateForm()) {
        return
      }
      setCurrentStep(2)
    }
  }

  const handlePrevStep = () => {
    setCurrentStep(1)
  }


  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const handleAddAllocation = (invoiceId: number, amount: number) => {
    setAllocations(prev => [...prev, { received_invoice_id: invoiceId, amount_applied: amount }])
  }

  const handleRemoveAllocation = (index: number) => {
    setAllocations(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (addAllocationMode && existingPaymentId) {
      // Add allocations to existing payment
      try {
        setIsLoading(true)
        
        for (const allocation of allocations) {
          const { error } = await supabase
            .from('supplier_payment_allocations')
            .insert({
              payment_id: existingPaymentId,
              received_invoice_id: allocation.received_invoice_id,
              amount_applied: allocation.amount_applied
            })
          
          if (error) throw error
        }
        
        toast({
          title: 'Success',
          description: 'Allocations added successfully',
        })
        
        onPaymentCreated(existingPaymentId)
        onClose()
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to add allocations',
          variant: 'destructive',
        })
      } finally {
        setIsLoading(false)
      }
    } else {
      // Handle step navigation for regular payment creation
      if (currentStep === 1) {
        handleNextStep()
        return
      }

      if (currentStep === 2) {
        // Create new payment
        if (!validateForm()) return
        
        try {
          setIsLoading(true)
          
          // Use current user ID from global store
          if (!currentUserId) throw new Error('User not authenticated')

          // Prepare allocations - if fromInvoice, use that, otherwise use selected allocations
          let finalAllocations = allocations
          if (fromInvoice) {
            // Use the minimum of payment amount and invoice balance due
            const paymentAmount = parseFloat(formData.amount)
            const allocationAmount = Math.min(paymentAmount, fromInvoice.balanceDue)
            
            finalAllocations = [{
              received_invoice_id: fromInvoice.invoiceId,
              amount_applied: allocationAmount
            }]
          }

          const { data: insertData, error } = await supabase.rpc('create_supplier_payment_with_allocations', {
            p_payer_team_id: parseInt(formData.payer_team_id),
            p_paid_to_team_id: parseInt(formData.paid_to_team_id),
            p_received_by_user_id: currentUserId,
            p_payment_date: formData.payment_date,
            p_amount: parseFloat(formData.amount),
            p_payment_currency: formData.payment_currency,
            p_method: 'Bank Transfer', // Default method
            p_exchange_rate_note: null,
            p_external_ref: null,
            p_notes: formData.notes || null,
            p_allocations: finalAllocations
          })

          if (error) throw error

          toast({
            title: 'Success',
            description: 'Supplier payment created successfully',
          })

          // Invalidate relevant queries
          queryClient.invalidateQueries({ queryKey: ['supplier-payments'] })
          if (fromInvoice) {
            queryClient.invalidateQueries({ queryKey: ['supplier-invoice-payments', fromInvoice.invoiceId] })
          }

          onPaymentCreated(insertData)
          onClose()
        } catch (error: any) {
          console.error('Failed to create supplier payment:', error)
          toast({
            title: 'Error',
            description: error.message || 'Failed to create supplier payment',
            variant: 'destructive',
          })
        } finally {
          setIsLoading(false)
        }
      }
    }
  }

  const handleClose = () => {
    setFormData({
      payer_team_id: fromInvoice?.payerTeamId || editingPayment?.payer_team_id || '',
      paid_to_team_id: fromInvoice?.paidToTeamId || editingPayment?.paid_to_team_id || '',
      payment_date: editingPayment?.payment_date || new Date().toISOString().split('T')[0],
      amount: fromInvoice?.amount || editingPayment?.amount || editingPayment?.payment_amount || '',
      payment_currency: fromInvoice?.currency || editingPayment?.payment_currency || 'EUR',
      notes: editingPayment?.notes || '',
    })
    setErrors({})
    setCurrentStep(1)
    setAllocations([])
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {addAllocationMode 
              ? 'Add Invoice Allocation'
              : editingPayment 
                ? (currentStep === 1 ? 'Edit Supplier Payment' : 'Add Invoice') 
                : (currentStep === 1 ? 'Add Supplier Payment' : 'Add Invoice')
            }
            {fromInvoice && ` for Invoice #${fromInvoice.invoiceNumber}`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Step 1: Payment Details */}
          {currentStep === 1 && (
            <>
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-900">Payment Details</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
            {/* Payer Team */}
            <div>
              <Label htmlFor="payer_team_id">Payer Team *</Label>
              <select
                id="payer_team_id"
                value={formData.payer_team_id}
                onChange={(e) => handleInputChange('payer_team_id', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoadingTeams}
              >
                <option value="">Select payer team</option>
                {teams.filter(team => team.type === 'payer').map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.title}
                  </option>
                ))}
              </select>
              {errors.payer_team_id && (
                <p className="text-red-500 text-sm mt-1">{errors.payer_team_id}</p>
              )}
            </div>

            {/* Paid To Team */}
            <div>
              <Label htmlFor="paid_to_team_id">Paid To Team *</Label>
              <select
                id="paid_to_team_id"
                value={formData.paid_to_team_id}
                onChange={(e) => handleInputChange('paid_to_team_id', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoadingTeams}
              >
                <option value="">Select paid to team</option>
                {teams.filter(team => team.type === 'supplier').map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.title}
                  </option>
                ))}
              </select>
              {errors.paid_to_team_id && (
                <p className="text-red-500 text-sm mt-1">{errors.paid_to_team_id}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Payment Date */}
            <div>
              <Label htmlFor="payment_date">Payment Date *</Label>
              <Input
                id="payment_date"
                type="date"
                value={formData.payment_date}
                onChange={(e) => handleInputChange('payment_date', e.target.value)}
                className={errors.payment_date ? 'border-red-500' : ''}
              />
              {errors.payment_date && (
                <p className="text-red-500 text-sm mt-1">{errors.payment_date}</p>
              )}
            </div>

            {/* Amount */}
            <div>
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => handleInputChange('amount', e.target.value)}
                className={errors.amount ? 'border-red-500' : ''}
                placeholder="0.00"
              />
              {errors.amount && (
                <p className="text-red-500 text-sm mt-1">{errors.amount}</p>
              )}
            </div>
          </div>

          <div>
            {/* Currency */}
            <div>
              <Label htmlFor="payment_currency">Currency *</Label>
              <select
                id="payment_currency"
                value={formData.payment_currency}
                onChange={(e) => handleInputChange('payment_currency', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CURRENCY_OPTIONS.map((currency) => (
                  <option key={currency.id} value={currency.id}>
                    {currency.label}
                  </option>
                ))}
              </select>
              {errors.payment_currency && (
                <p className="text-red-500 text-sm mt-1">{errors.payment_currency}</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Optional notes"
              rows={3}
            />
          </div>
            </>
          )}

          {/* Step 2: Invoice Selection */}
          {currentStep === 2 && !fromInvoice && (
            <>
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Select Invoices</h3>
                <p className="text-sm text-gray-600 mb-4">
                  You can create a standalone payment or allocate it to specific invoices.
                </p>
                
                {availableInvoices.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {availableInvoices.map((invoice) => (
                      <div key={invoice.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">Invoice #{invoice.invoice_number}</span>
                            <span className="text-sm text-gray-500">{new Date(invoice.invoice_date).toLocaleDateString()}</span>
                          </div>
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-xs text-gray-500">Balance Due</span>
                            <span className="text-sm font-medium">{invoice.currency_code} {invoice.balance_due.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="ml-4 flex items-center space-x-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max={invoice.balance_due}
                            placeholder="0.00"
                            className="w-20"
                            onChange={(e) => {
                              const amount = parseFloat(e.target.value) || 0
                              if (amount > 0) {
                                handleAddAllocation(invoice.id, amount)
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const amount = invoice.balance_due
                              handleAddAllocation(invoice.id, amount)
                            }}
                          >
                            Full
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No available invoices found
                  </div>
                )}

              </div>
            </>
          )}

          <DialogFooter className="flex justify-between">
            {currentStep === 1 ? (
              <>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleClose}
                  disabled={isLoading}
                  className="px-6"
                >
                  Cancel
                </Button>
                <div className="space-x-2">
                  <Button 
                    type="button" 
                    onClick={handleNextStep}
                    disabled={isLoading || isLoadingTeams || !formData.payer_team_id || !formData.paid_to_team_id || !formData.amount || !formData.payment_currency}
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
                  onClick={handlePrevStep}
                  disabled={isLoading}
                  className="px-6"
                >
                  Back
                </Button>
                <Button 
                  type="submit" 
                  disabled={isLoading || isLoadingTeams || isLoadingInvoices}
                  className="px-6 bg-black text-white hover:bg-gray-800"
                >
                  {isLoading 
                    ? (addAllocationMode ? 'Adding...' : 'Creating...') 
                    : addAllocationMode 
                      ? 'Add Allocations' 
                      : editingPayment 
                        ? 'Update Payment' 
                        : 'Create Payment'
                  }
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
