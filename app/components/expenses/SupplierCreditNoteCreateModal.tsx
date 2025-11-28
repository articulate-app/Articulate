"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { toast } from '../ui/use-toast'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { Dropzone } from '../dropzone'
// fetchUserTeams no longer needed - using teams table directly

interface SupplierCreditNoteCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onCreditNoteCreated: (creditNote: any) => void
  fromInvoice?: {
    invoiceId: number
    invoiceNumber: string
    amount: number
    balanceDue: number
    currency: string
    payerTeamId: number
    paidToTeamId: number
  }
  editingCreditNote?: any
}

interface InvoiceOption {
  id: number
  invoice_number: string
  invoice_date: string
  total_amount: number
  balance_due: number
  currency_code: string
  status: string
  subtotal_amount: number
  vat_amount: number
  amount_paid: number
  credited_amount: number
  payer_team_id: number
  issuer_team_id: number
}

// Team interface removed - using inline type definition matching payment modal

const CURRENCY_OPTIONS = [
  { id: 'EUR', label: 'EUR' },
  { id: 'USD', label: 'USD' },
  { id: 'GBP', label: 'GBP' },
]

const REASON_OPTIONS = [
  { id: 'duplicate', label: 'Duplicate' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'returned', label: 'Returned' },
  { id: 'overcharged', label: 'Overcharged' },
  { id: 'other', label: 'Other' },
]

export function SupplierCreditNoteCreateModal({ 
  isOpen, 
  onClose, 
  onCreditNoteCreated, 
  fromInvoice,
  editingCreditNote 
}: SupplierCreditNoteCreateModalProps) {
  const queryClient = useQueryClient()
  const supabase = createClientComponentClient()
  const [isLoading, setIsLoading] = useState(false)
  const [availableInvoices, setAvailableInvoices] = useState<InvoiceOption[]>([])
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [teams, setTeams] = useState<Array<{ id: number; title: string }>>([])
  const [isLoadingTeams, setIsLoadingTeams] = useState(false)
  const [invoiceSearchTerm, setInvoiceSearchTerm] = useState('')

  const [formData, setFormData] = useState({
    credit_date: editingCreditNote?.credit_date || new Date().toISOString().split('T')[0],
    currency_code: editingCreditNote?.currency_code || fromInvoice?.currency || 'EUR',
    credit_number: editingCreditNote?.credit_number || '',
    reason: editingCreditNote?.reason || 'other',
    subtotal_amount: fromInvoice?.amount || editingCreditNote?.subtotal_amount || '',
    vat_amount: editingCreditNote?.vat_amount || '',
    total_amount: fromInvoice?.amount || editingCreditNote?.total_amount || '',
    notes: editingCreditNote?.notes || '',
    invoice_id: fromInvoice?.invoiceId || editingCreditNote?.invoice_id || '',
    payer_team_id: fromInvoice?.payerTeamId || editingCreditNote?.payer_team_id || '',
    issuer_team_id: fromInvoice?.paidToTeamId || editingCreditNote?.issuer_team_id || '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  // Filter invoices based on search term
  const filteredInvoices = availableInvoices.filter(invoice =>
    invoice.invoice_number.toLowerCase().includes(invoiceSearchTerm.toLowerCase())
  )

  // Fetch available invoices
  useEffect(() => {
    if (isOpen && !fromInvoice) {
      fetchAvailableInvoices()
    }
  }, [isOpen, fromInvoice])

  // Load teams for supplier dropdown
  useEffect(() => {
    if (isOpen && teams.length === 0) {
      loadTeams()
    }
  }, [isOpen, teams.length])

  // Payer teams are now loaded using the same teams state (from teams table)

  // Refetch invoices when supplier team changes
  useEffect(() => {
    if (isOpen && formData.issuer_team_id && !fromInvoice) {
      fetchAvailableInvoices()
    }
  }, [formData.issuer_team_id, isOpen, fromInvoice])

  // Clear form function
  const clearForm = () => {
    setFormData({
      credit_date: new Date().toISOString().split('T')[0],
      currency_code: 'EUR',
      credit_number: '',
      reason: 'other',
      subtotal_amount: '',
      vat_amount: '',
      total_amount: '',
      notes: '',
      invoice_id: '',
      payer_team_id: '',
      issuer_team_id: '',
    })
    setPdfFile(null)
    setInvoiceSearchTerm('')
    setErrors({})
  }

  const loadTeams = async () => {
    setIsLoadingTeams(true)
    try {
      const { data: teamsData, error } = await supabase
        .from('teams')
        .select('id, title')
        .order('title', { ascending: true })

      if (error) throw error
      setTeams(teamsData || [])
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
      if (!formData.issuer_team_id) {
        setAvailableInvoices([])
        return
      }

      const { data, error } = await supabase
        .from('v_received_invoices_list')
        .select('*')
        .eq('issuer_team_id', formData.issuer_team_id)
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

    if (!formData.credit_date) {
      newErrors.credit_date = 'Credit date is required'
    }
    if (!formData.currency_code) {
      newErrors.currency_code = 'Currency is required'
    }
    if (!formData.credit_number) {
      newErrors.credit_number = 'Credit number is required'
    }
    if (!formData.reason) {
      newErrors.reason = 'Reason is required'
    }
    if (!formData.subtotal_amount || parseFloat(formData.subtotal_amount) <= 0) {
      newErrors.subtotal_amount = 'Subtotal amount must be greater than 0'
    }
    if (!formData.vat_amount || parseFloat(formData.vat_amount) < 0) {
      newErrors.vat_amount = 'VAT amount must be 0 or greater'
    }
    if (!formData.total_amount || parseFloat(formData.total_amount) <= 0) {
      newErrors.total_amount = 'Total amount must be greater than 0'
    }
    if (!formData.invoice_id) {
      newErrors.invoice_id = 'Invoice is required'
    }
    if (!formData.payer_team_id) {
      newErrors.payer_team_id = 'Payer team is required'
    }
    if (!formData.issuer_team_id) {
      newErrors.issuer_team_id = 'Supplier team is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setIsLoading(true)
    try {
      const creditNoteData = {
        credit_date: formData.credit_date,
        currency_code: formData.currency_code,
        credit_number: formData.credit_number,
        reason: formData.reason,
        subtotal_amount: parseFloat(formData.subtotal_amount),
        vat_amount: parseFloat(formData.vat_amount),
        total_amount: parseFloat(formData.total_amount),
        notes: formData.notes || null,
        received_invoice_id: parseInt(formData.invoice_id),
        status: 'issued'
      }

      const { data: insertData, error } = await supabase
        .from('received_credit_notes')
        .insert(creditNoteData)
        .select('id')
        .single()

      if (error) throw error

      // Upload PDF if provided
      if (pdfFile && insertData.id) {
        try {
          setIsUploading(true)
          const sanitizePdfName = (name: string) => {
            const base = name?.trim() || '';
            const clean = base.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
            return clean.endsWith('.pdf') ? clean : `${clean}.pdf`;
          }
          
          const safeName = sanitizePdfName(pdfFile.name)
          const path = `credit-notes/${insertData.id}/${safeName}`
          
          // Upload to storage
          const { error: uploadError } = await supabase.storage
            .from('supplier-credit-notes')
            .upload(path, pdfFile, { upsert: true })

          if (uploadError) throw uploadError
          
          // Update credit note with PDF path
          const { error: updateError } = await supabase
            .from('received_credit_notes')
            .update({
              pdf_path: path
            })
            .eq('id', insertData.id)

          if (updateError) throw updateError
          
          console.log('PDF uploaded and linked to credit note:', path)
        } catch (pdfError) {
          console.error('PDF upload failed:', pdfError)
          toast({
            title: 'Warning',
            description: 'Credit note created but PDF upload failed. You can upload it later.',
            variant: 'destructive'
          })
        } finally {
          setIsUploading(false)
        }
      }

      toast({
        title: 'Success',
        description: 'Supplier credit note created successfully',
      })

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['supplier-credit-notes'] })
      if (fromInvoice) {
        queryClient.invalidateQueries({ queryKey: ['supplier-invoice-credit-notes', fromInvoice.invoiceId] })
      }

      onCreditNoteCreated(insertData)
      
      // Clear form after successful creation
      clearForm()
      onClose()
    } catch (error: any) {
      console.error('Failed to create supplier credit note:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to create supplier credit note',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => {
      const newFormData = { ...prev, [field]: value }
      
      // Auto-calculate VAT and derive currency when invoice is selected or subtotal changes
      if ((field === 'invoice_id' && value) || field === 'subtotal_amount') {
        const selectedInvoice = availableInvoices.find(invoice => invoice.id.toString() === newFormData.invoice_id)
        if (selectedInvoice) {
          // Derive currency from selected invoice
          newFormData.currency_code = selectedInvoice.currency_code
          
          // Calculate VAT rate from the selected invoice
          const vatRate = selectedInvoice.vat_amount / selectedInvoice.subtotal_amount
          const subtotalAmount = parseFloat(newFormData.subtotal_amount) || 0
          const calculatedVatAmount = subtotalAmount * vatRate
          const calculatedTotalAmount = subtotalAmount + calculatedVatAmount
          
          newFormData.vat_amount = calculatedVatAmount.toFixed(2)
          newFormData.total_amount = calculatedTotalAmount.toFixed(2)
        }
      }
      
      return newFormData
    })
    
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const handlePdfUpload = async (files: File[] | FileList) => {
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return
    
    const file = fileArray[0]
    if (file.type !== 'application/pdf') {
      toast({
        title: 'Error',
        description: 'Please upload a PDF file',
        variant: 'destructive',
      })
      return
    }
    
    setPdfFile(file)
  }

  const handleRemovePdf = async () => {
    setPdfFile(null)
  }

  const handleClose = () => {
    setFormData({
      credit_date: editingCreditNote?.credit_date || new Date().toISOString().split('T')[0],
      currency_code: editingCreditNote?.currency_code || fromInvoice?.currency || 'EUR',
      credit_number: editingCreditNote?.credit_number || '',
      reason: editingCreditNote?.reason || 'other',
      subtotal_amount: fromInvoice?.amount || editingCreditNote?.subtotal_amount || '',
      vat_amount: editingCreditNote?.vat_amount || '',
      total_amount: fromInvoice?.amount || editingCreditNote?.total_amount || '',
      notes: editingCreditNote?.notes || '',
      invoice_id: fromInvoice?.invoiceId || editingCreditNote?.invoice_id || '',
      payer_team_id: fromInvoice?.payerTeamId || editingCreditNote?.payer_team_id || '',
      issuer_team_id: fromInvoice?.paidToTeamId || editingCreditNote?.issuer_team_id || '',
    })
    setPdfFile(null)
    setInvoiceSearchTerm('')
    setErrors({})
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingCreditNote ? 'Edit Supplier Credit Note' : 'Create Supplier Credit Note'}
            {fromInvoice && ` for Invoice #${fromInvoice.invoiceNumber}`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {/* Credit Date */}
            <div>
              <Label htmlFor="credit_date">Credit Date *</Label>
              <Input
                id="credit_date"
                type="date"
                value={formData.credit_date}
                onChange={(e) => handleInputChange('credit_date', e.target.value)}
                className={errors.credit_date ? 'border-red-500' : ''}
              />
              {errors.credit_date && (
                <p className="text-red-500 text-sm mt-1">{errors.credit_date}</p>
              )}
            </div>

            {/* Currency - Hidden, derived from invoice */}
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
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.title}
                  </option>
                ))}
              </select>
              {errors.payer_team_id && (
                <p className="text-red-500 text-sm mt-1">{errors.payer_team_id}</p>
              )}
            </div>

            {/* Supplier Team */}
            <div>
              <Label htmlFor="issuer_team_id">Supplier Team *</Label>
              <select
                id="issuer_team_id"
                value={formData.issuer_team_id}
                onChange={(e) => handleInputChange('issuer_team_id', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoadingTeams}
              >
                <option value="">Select supplier team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.title}
                  </option>
                ))}
              </select>
              {errors.issuer_team_id && (
                <p className="text-red-500 text-sm mt-1">{errors.issuer_team_id}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Credit Number */}
            <div>
              <Label htmlFor="credit_number">Credit Number *</Label>
              <Input
                id="credit_number"
                value={formData.credit_number}
                onChange={(e) => handleInputChange('credit_number', e.target.value)}
                className={errors.credit_number ? 'border-red-500' : ''}
                placeholder="e.g., CN-2024-001"
              />
              {errors.credit_number && (
                <p className="text-red-500 text-sm mt-1">{errors.credit_number}</p>
              )}
            </div>

            {/* Reason */}
            <div>
              <Label htmlFor="reason">Reason *</Label>
              <select
                id="reason"
                value={formData.reason}
                onChange={(e) => handleInputChange('reason', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {REASON_OPTIONS.map((reason) => (
                  <option key={reason.id} value={reason.id}>
                    {reason.label}
                  </option>
                ))}
              </select>
              {errors.reason && (
                <p className="text-red-500 text-sm mt-1">{errors.reason}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Subtotal Amount */}
            <div>
              <Label htmlFor="subtotal_amount">Subtotal (no VAT) *</Label>
              <Input
                id="subtotal_amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.subtotal_amount}
                onChange={(e) => handleInputChange('subtotal_amount', e.target.value)}
                className={errors.subtotal_amount ? 'border-red-500' : ''}
                placeholder="0.00"
              />
              {errors.subtotal_amount && (
                <p className="text-red-500 text-sm mt-1">{errors.subtotal_amount}</p>
              )}
            </div>

            {/* VAT Amount */}
            <div>
              <Label htmlFor="vat_amount">VAT *</Label>
              <Input
                id="vat_amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.vat_amount}
                onChange={(e) => handleInputChange('vat_amount', e.target.value)}
                className={errors.vat_amount ? 'border-red-500' : ''}
                placeholder="0.00"
              />
              {errors.vat_amount && (
                <p className="text-red-500 text-sm mt-1">{errors.vat_amount}</p>
              )}
            </div>

            {/* Total Amount */}
            <div>
              <Label htmlFor="total_amount">Total *</Label>
              <Input
                id="total_amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.total_amount}
                onChange={(e) => handleInputChange('total_amount', e.target.value)}
                className={errors.total_amount ? 'border-red-500' : ''}
                placeholder="0.00"
              />
              {errors.total_amount && (
                <p className="text-red-500 text-sm mt-1">{errors.total_amount}</p>
              )}
            </div>
          </div>

          {/* Invoice Selection */}
          {!fromInvoice && (
            <div>
              <Label htmlFor="invoice_id">Invoice *</Label>
              
              {/* Search Input */}
              <Input
                type="text"
                placeholder="Search invoice number..."
                value={invoiceSearchTerm}
                onChange={(e) => setInvoiceSearchTerm(e.target.value)}
                className="mb-2"
                disabled={isLoadingInvoices}
              />
              
              {/* Invoice Dropdown */}
              <select
                id="invoice_id"
                value={formData.invoice_id}
                onChange={(e) => handleInputChange('invoice_id', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoadingInvoices}
              >
                <option value="">Select invoice</option>
                {filteredInvoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.invoice_number} - {new Date(invoice.invoice_date).toLocaleDateString()} - {invoice.currency_code} {invoice.balance_due.toFixed(2)}
                  </option>
                ))}
              </select>
              {errors.invoice_id && (
                <p className="text-red-500 text-sm mt-1">{errors.invoice_id}</p>
              )}
              {filteredInvoices.length === 0 && invoiceSearchTerm && (
                <p className="text-gray-500 text-sm mt-1">No invoices found matching "{invoiceSearchTerm}"</p>
              )}
            </div>
          )}

          {/* PDF Upload */}
          <div>
            <Label>Credit Note PDF</Label>
            <div className="bg-gray-50 rounded-lg p-4">
              {!pdfFile ? (
                <Dropzone
                  tableName="received_credit_notes"
                  recordId={0} // Will be set after credit note creation
                  bucketName="supplier-credit-notes"
                  attachments={[]}
                  signedUrls={{}}
                  isUploading={isUploading}
                  uploadError={null}
                  uploadFiles={handlePdfUpload}
                  deleteAttachment={handleRemovePdf}
                  className="min-h-[120px]"
                />
              ) : (
                <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="text-red-500">
                      📄
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {pdfFile.name}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemovePdf}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    Remove
                  </Button>
                </div>
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || isLoadingInvoices || isUploading}>
              {isLoading ? 'Creating...' : editingCreditNote ? 'Update Credit Note' : 'Create Credit Note'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
