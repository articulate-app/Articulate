"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { toast } from '../ui/use-toast'
import { createCreditNote, updateCreditNote } from '../../lib/creditNotes'
import type { CreateCreditNoteData, FromInvoiceCreditNoteContext } from '../../lib/types/billing'
import { addCreditNoteToCaches, updateCreditNoteInCaches } from './credit-note-cache-utils'
import { useQueryClient } from '@tanstack/react-query'
import { Dropzone } from '../dropzone'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useCurrentUserStore } from '../../store/current-user'

interface CreditNoteCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onCreditNoteCreated: (creditNoteId: number, teamInfo?: { 
    supplierTeamId: number
    supplierTeamName: string
    payerTeamId: number
    payerTeamName: string
    creditNoteType: 'AR' | 'AP'
    creditDate: string
    creditNumber: string
    currencyCode: string
    subtotalAmount: number
    vatAmount: number
    totalAmount: number
  }) => void
  fromInvoice?: FromInvoiceCreditNoteContext
  editingCreditNote?: any
  sortConfig?: { field: string; direction: 'asc' | 'desc' }
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
  issuer_team_id: number
}

export function CreditNoteCreateModal({ isOpen, onClose, onCreditNoteCreated, fromInvoice, editingCreditNote, sortConfig }: CreditNoteCreateModalProps) {
  const queryClient = useQueryClient()
  const supabase = createClientComponentClient()
  const { userTeams } = useCurrentUserStore()
  const [isLoading, setIsLoading] = useState(false)
  const [availableInvoices, setAvailableInvoices] = useState<InvoiceOption[]>([])
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false)
  const [teams, setTeams] = useState<Array<{ id: number; title: string }>>([])
  const [isLoadingTeams, setIsLoadingTeams] = useState(false)
  const [creditNoteType, setCreditNoteType] = useState<'AR' | 'AP' | null>(null)

  const [formData, setFormData] = useState<any>({
    credit_date: editingCreditNote?.credit_date || new Date().toISOString().split('T')[0],
    currency_code: editingCreditNote?.currency_code || fromInvoice?.currency || 'EUR',
    credit_number: editingCreditNote?.credit_number || fromInvoice?.invoiceNumber || '',
    subtotal_amount: editingCreditNote?.subtotal_amount || fromInvoice?.subtotalAmount || 0,
    vat_amount: editingCreditNote?.vat_amount || 0,
    total_amount: editingCreditNote?.total_amount || 0,
    reason: editingCreditNote?.reason || '',
    issued_invoice_id: editingCreditNote?.issued_invoice_id || fromInvoice?.invoiceId,
    payer_team_id: editingCreditNote?.payer_team_id || fromInvoice?.payerTeamId || null,
    supplier_team_id: editingCreditNote?.supplier_team_id || fromInvoice?.supplierTeamId || null,
    notes: '',
  })
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceOption | null>(null)
  const [errors, setErrors] = useState<any>({})
  
  // PDF state
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfPath, setPdfPath] = useState<string | null>(null)

  // Clear form function
  const clearForm = () => {
    setFormData({
      credit_date: new Date().toISOString().split('T')[0],
      currency_code: 'EUR',
      credit_number: '',
      reason: '',
      subtotal_amount: 0,
      vat_amount: 0,
      total_amount: 0,
      issued_invoice_id: undefined,
      payer_team_id: null,
      supplier_team_id: null,
      notes: '',
    })
    setSelectedInvoice(null)
    setPdfFile(null)
    setPdfPath(null)
    setErrors({})
  }

  // Load teams when modal opens, clear form when modal closes
  useEffect(() => {
    if (isOpen) {
      loadTeams()
    } else {
      // Clear form after modal closes (with a small delay to avoid seeing the cleared form)
      const timer = setTimeout(() => {
        clearForm()
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Credit Note Type Detection: If user belongs to supplier team → AR, otherwise → AP
  useEffect(() => {
    if (!formData.supplier_team_id || userTeams.length === 0) {
      setCreditNoteType(null)
      return
    }
    
    const userTeamIds = userTeams.map((t) => t.team_id)
    const isSupplierUserTeam = userTeamIds.includes(formData.supplier_team_id)
    
    setCreditNoteType(isSupplierUserTeam ? 'AR' : 'AP')
  }, [formData.supplier_team_id, userTeams])

  // Load available invoices when modal opens or dependencies change
  useEffect(() => {
    if (isOpen && formData.currency_code && formData.payer_team_id && formData.supplier_team_id && creditNoteType) {
      loadAvailableInvoices(formData.currency_code)
    }
  }, [isOpen, formData.currency_code, formData.payer_team_id, formData.supplier_team_id, creditNoteType])

  // Pre-fill from invoice context
  useEffect(() => {
    if (fromInvoice) {
      const subtotalAmount = fromInvoice.subtotalAmount || 0
      const vatRate = fromInvoice.vatRate || 0
      const vatAmount = subtotalAmount * (vatRate / 100)
      const totalAmount = subtotalAmount + vatAmount
      
      setFormData((prev: any) => ({
        ...prev,
        issued_invoice_id: fromInvoice.invoiceId,
        currency_code: fromInvoice.currency,
        credit_number: fromInvoice.invoiceNumber || '',
        subtotal_amount: subtotalAmount,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        supplier_team_id: fromInvoice.supplierTeamId || null,
        payer_team_id: fromInvoice.payerTeamId || null,
      }))
      
      // Pre-select the invoice if we have the invoice ID
      if (fromInvoice.invoiceId && availableInvoices.length > 0) {
        const selectedInv = availableInvoices.find(inv => inv.id === fromInvoice.invoiceId)
        if (selectedInv) {
          setSelectedInvoice(selectedInv)
        }
      }
    }
  }, [fromInvoice, availableInvoices])

  // Update formData when editingCreditNote changes
  useEffect(() => {
    if (editingCreditNote) {
      setFormData({
        credit_date: editingCreditNote.credit_date || new Date().toISOString().split('T')[0],
        currency_code: editingCreditNote.currency_code || 'EUR',
        credit_number: editingCreditNote.credit_number || '',
        subtotal_amount: editingCreditNote.subtotal_amount || 0,
        vat_amount: editingCreditNote.vat_amount || 0,
        total_amount: editingCreditNote.total_amount || 0,
        reason: editingCreditNote.reason || '',
        issued_invoice_id: editingCreditNote.issued_invoice_id,
      })
    }
  }, [editingCreditNote])

  const loadTeams = async () => {
    setIsLoadingTeams(true)
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('id, title')
        .order('title')
      
      if (error) throw error
      setTeams(data || [])
    } catch (error) {
      console.error('Failed to load teams:', error)
      toast({
        title: 'Error',
        description: 'Failed to load teams',
        variant: 'destructive',
      })
    } finally {
      setIsLoadingTeams(false)
    }
  }

  const loadAvailableInvoices = async (currency: string) => {
    setIsLoadingInvoices(true)
    try {
      if (creditNoteType === 'AR') {
        // Load AR invoices from v_issued_invoices_list
        let query = supabase
          .from('v_issued_invoices_list')
          .select('id, invoice_number, invoice_date, total_amount, balance_due, currency_code, status, subtotal_amount, vat_amount, amount_paid, credited_amount, issuer_team_id')
          .eq('currency_code', currency)
          .in('status', ['issued', 'partially_paid'])
          .gt('balance_due', 0)
          .order('invoice_date', { ascending: false })
          .limit(50)
        
        if (formData.payer_team_id) {
          query = query.eq('payer_team_id', formData.payer_team_id)
        }
        if (formData.supplier_team_id) {
          query = query.eq('issuer_team_id', formData.supplier_team_id)
        }
        
        const { data, error } = await query
        if (error) throw error
        setAvailableInvoices(data || [])
      } else if (creditNoteType === 'AP') {
        // Load AP invoices from v_received_invoices_list
        let query = supabase
          .from('v_received_invoices_list')
          .select('id, invoice_number, invoice_date, total_amount, balance_due, currency_code, status, subtotal_amount, vat_amount, amount_paid, credited_amount, issuer_team_id')
          .eq('currency_code', currency)
          .in('status', ['received', 'partially_paid'])
          .gt('balance_due', 0)
          .order('invoice_date', { ascending: false })
          .limit(50)
        
        if (formData.payer_team_id) {
          query = query.eq('payer_team_id', formData.payer_team_id)
        }
        if (formData.supplier_team_id) {
          query = query.eq('issuer_team_id', formData.supplier_team_id)
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

  // PDF handlers
  const handlePdfUpload = async (files: FileList | File[]) => {
    if (files.length === 0) return
    
    const file = files[0]
    
    // Validate file type
    if (file.type !== 'application/pdf') {
      toast({
        title: 'Error',
        description: 'Only PDF files are allowed',
        variant: 'destructive',
      })
      return
    }

    // Store file in memory without uploading
    setPdfFile(file)
    setPdfPath(null) // Clear any previous path
  }

  const handleRemovePdf = async () => {
    setPdfFile(null)
    setPdfPath(null)
  }

  // Helper function to upload PDF with proper path convention (key-only format)
  const uploadPdfForCreditNote = async (file: File, creditNoteId: number, teamId: number): Promise<string | null> => {
    try {
      const storageKey = `${teamId}/${creditNoteId}/${file.name}`
      
      const { data, error } = await supabase.storage
        .from('credit-notes')
        .upload(storageKey, file, { upsert: true })

      if (error) throw error
      return storageKey
    } catch (error) {
      console.error('Error uploading PDF:', error)
      throw error
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.issued_invoice_id || !formData.credit_date || !formData.total_amount) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      })
      return
    }

    if (!formData.payer_team_id || !formData.supplier_team_id) {
      toast({
        title: 'Error',
        description: 'Please select both payer team and supplier team',
        variant: 'destructive',
      })
      return
    }

    if (!creditNoteType) {
      toast({
        title: 'Error',
        description: 'Credit note type could not be determined',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)

    try {
      let creditNote, error
      
      if (editingCreditNote) {
        // Update existing credit note
        const result = await updateCreditNote(editingCreditNote.credit_note_id, {
          credit_number: formData.credit_number,
          credit_date: formData.credit_date,
          currency_code: formData.currency_code,
          subtotal_amount: formData.subtotal_amount,
          vat_amount: formData.vat_amount,
          total_amount: formData.total_amount,
          reason: formData.reason,
        })
        creditNote = editingCreditNote.credit_note_id
        error = result.error
      } else {
        // Create new credit note
        if (creditNoteType === 'AR') {
          // Create AR credit note in issued_credit_notes table
          const result = await createCreditNote(formData as CreateCreditNoteData)
          creditNote = result.data
          error = result.error
        } else {
          // Create AP credit note in received_credit_notes table
          const creditNoteData = {
            credit_date: formData.credit_date,
            currency_code: formData.currency_code,
            credit_number: formData.credit_number,
            reason: formData.reason || '',
            subtotal_amount: parseFloat(formData.subtotal_amount),
            vat_amount: parseFloat(formData.vat_amount),
            total_amount: parseFloat(formData.total_amount),
            notes: formData.notes || null,
            received_invoice_id: parseInt(formData.issued_invoice_id),
            status: 'issued'
          }

          const { data: insertData, error: insertError } = await supabase
            .from('received_credit_notes')
            .insert(creditNoteData)
            .select('id')
            .single()

          if (insertError) {
            error = insertError
          } else {
            creditNote = insertData.id
          }
        }
      }

      if (error) {
        // Handle specific backend errors
        let errorMessage = editingCreditNote ? 'Failed to update credit note' : 'Failed to create credit note'
        
        if (error.message?.includes('currency')) {
          errorMessage = 'Credit note currency must match invoice currency'
        } else if (error.message?.includes('status')) {
          errorMessage = 'You can only create credit notes for issued or partially paid invoices'
        } else if (error.message?.includes('over-credit')) {
          errorMessage = 'Credit amount exceeds available balance'
        }

        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        })
        return
      }

      if (!creditNote) {
        toast({
          title: 'Error',
          description: 'Credit note created but no data returned',
          variant: 'destructive',
        })
        return
      }

      // If PDF file exists, upload it after credit note creation
      if (pdfFile && creditNote) {
        try {
          // Get team ID from selected invoice
          const teamId = selectedInvoice?.issuer_team_id
          console.log('PDF upload check:', { 
            hasPdfFile: !!pdfFile, 
            creditNoteId: creditNote, 
            teamId,
            selectedInvoiceTeamId: selectedInvoice?.issuer_team_id,
            fromInvoiceContext: fromInvoice
          })
          
          if (teamId) {
            console.log('Starting PDF upload...', { teamId, creditNoteId: creditNote, fileName: pdfFile.name })
            const uploadedPath = await uploadPdfForCreditNote(pdfFile, creditNote, teamId)
            console.log('PDF uploaded to:', uploadedPath)
            
            await updateCreditNote(creditNote, { pdf_path: uploadedPath || undefined })
            console.log('PDF path updated in database:', uploadedPath)
          } else {
            console.error('No team ID found for PDF upload')
            throw new Error('Could not determine team ID for PDF upload')
          }
        } catch (pdfError) {
          console.error('PDF upload failed:', pdfError)
          toast({
            title: 'Warning',
            description: 'Credit note created but PDF upload failed. You can upload it later.',
            variant: 'destructive'
          })
        }
      }

      toast({
        title: 'Success',
        description: 'Credit note created successfully',
      })
      
      if (editingCreditNote) {
        // For updates, use the existing credit note data with updated fields
        const updatedCreditNote = {
          ...editingCreditNote,
          ...formData,
        }
        
        // Update caches for optimistic updates
        updateCreditNoteInCaches(queryClient, updatedCreditNote)
        
        // Dispatch event to notify other components
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('credit-note-updated', { 
            detail: { creditNoteId: editingCreditNote.credit_note_id, updatedCreditNote }
          }))
        }
        
        // Pass the credit note ID for updates
        onCreditNoteCreated(editingCreditNote.credit_note_id)
      } else {
        // For creates, pass team info for optimistic updates
        const supplierTeam = teams.find(t => t.id === formData.supplier_team_id)
        const payerTeam = teams.find(t => t.id === formData.payer_team_id)
        
        if (supplierTeam && payerTeam && creditNoteType) {
          const teamInfo = {
            supplierTeamId: supplierTeam.id,
            supplierTeamName: supplierTeam.title,
            payerTeamId: payerTeam.id,
            payerTeamName: payerTeam.title,
            creditNoteType: creditNoteType,
            creditDate: formData.credit_date,
            creditNumber: formData.credit_number,
            currencyCode: formData.currency_code,
            subtotalAmount: parseFloat(formData.subtotal_amount) || 0,
            vatAmount: parseFloat(formData.vat_amount) || 0,
            totalAmount: parseFloat(formData.total_amount) || 0
          }
          onCreditNoteCreated(creditNote, teamInfo)
        } else {
          onCreditNoteCreated(creditNote)
        }

        // Fetch the full credit note for cache updates
        try {
          const { data: fullCreditNote, error: fetchError } = await supabase
            .from('v_credit_notes_summary')
            .select('*')
            .eq('credit_note_id', creditNote)
            .single()

          if (!fetchError && fullCreditNote) {
            // Add to caches for optimistic updates
            addCreditNoteToCaches(queryClient, fullCreditNote, sortConfig)
            
            // Dispatch event to notify other components
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('credit-note-created', { 
                detail: { creditNote: fullCreditNote }
              }))
            }
          }
        } catch (fetchError) {
          console.error('Failed to fetch created credit note for cache:', fetchError)
        }
      }
      
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create credit note',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    onClose()
  }

  const calculateTotal = () => {
    const subtotal = formData.subtotal_amount || 0
    const vat = formData.vat_amount || 0
    return Math.round((subtotal + vat) * 100) / 100 // Round to 2 decimal places
  }

  const handleSubtotalChange = (value: number) => {
    setFormData((prev: any) => {
      // Calculate VAT based on selected invoice's VAT rate
      const vatRate = selectedInvoice ? selectedInvoice.vat_amount / selectedInvoice.subtotal_amount : 0
      const vatAmount = Math.round(value * vatRate * 100) / 100 // Round to 2 decimal places
      const totalAmount = Math.round((value + vatAmount) * 100) / 100 // Round to 2 decimal places
      
      return {
        ...prev,
        subtotal_amount: value,
        vat_amount: vatAmount,
        total_amount: totalAmount
      }
    })
  }

  const handleVatChange = (value: number) => {
    setFormData((prev: any) => {
      const totalAmount = Math.round(((prev.subtotal_amount || 0) + value) * 100) / 100 // Round to 2 decimal places
      return {
        ...prev,
        vat_amount: value,
        total_amount: totalAmount
      }
    })
  }

  // Calculate invoice information
  const getInvoiceCalculations = () => {
    if (!selectedInvoice) return null

    const vatRate = selectedInvoice.vat_amount / selectedInvoice.subtotal_amount || 0
    const invoiceAmountNoVat = selectedInvoice.subtotal_amount || 0
    const paidAmountNoVat = Math.round(((selectedInvoice.amount_paid || 0) / (1 + vatRate)) * 100) / 100
    const creditedAmountNoVat = Math.round(((selectedInvoice.credited_amount || 0) + (formData.subtotal_amount || 0)) * 100) / 100
    const remainingInvoiceNoVat = Math.round((invoiceAmountNoVat - paidAmountNoVat - creditedAmountNoVat) * 100) / 100

    return {
      vatRate,
      invoiceAmountNoVat,
      paidAmountNoVat,
      creditedAmountNoVat,
      remainingInvoiceNoVat
    }
  }

  const invoiceCalcs = getInvoiceCalculations()

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingCreditNote ? 'Edit Credit Note' : 'Create Credit Note'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Supplier Team (left/first) */}
          <div>
            <Label htmlFor="supplier_team_id">Supplier Team *</Label>
            <select
              id="supplier_team_id"
              value={formData.supplier_team_id || ''}
              onChange={(e) => setFormData((prev: any) => ({ ...prev, supplier_team_id: parseInt(e.target.value) }))}
              className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              disabled={isLoadingTeams}
            >
              <option value="">Select supplier team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.title}
                </option>
              ))}
            </select>
          </div>

          {/* Payer Team (right/second) */}
          <div>
            <Label htmlFor="payer_team_id">Payer Team *</Label>
            <select
              id="payer_team_id"
              value={formData.payer_team_id || ''}
              onChange={(e) => setFormData((prev: any) => ({ ...prev, payer_team_id: parseInt(e.target.value) }))}
              className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              disabled={isLoadingTeams}
            >
              <option value="">Select payer team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.title}
                </option>
              ))}
            </select>
          </div>

          {/* Credit Note Type Display */}
          {creditNoteType && (
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-sm text-gray-700">
                <span className="font-medium">Credit Note Type:</span>{' '}
                {creditNoteType === 'AR' ? 'Accounts Receivable' : 'Accounts Payable'}
              </p>
            </div>
          )}

          {/* Invoice Selection */}
          <div>
            <Label htmlFor="issued_invoice_id">Invoice *</Label>
            <select
              id="issued_invoice_id"
              value={formData.issued_invoice_id || ''}
              onChange={(e) => {
                const invoiceId = e.target.value ? parseInt(e.target.value) : undefined
                const selectedInv = availableInvoices.find(inv => inv.id === invoiceId)
                setSelectedInvoice(selectedInv || null)
                
                setFormData((prev: any) => {
                  const subtotal = prev.subtotal_amount || 0
                  const vatAmount = selectedInv ? Math.round((subtotal * (selectedInv.vat_amount / selectedInv.subtotal_amount)) * 100) / 100 : 0
                  const totalAmount = Math.round((subtotal + vatAmount) * 100) / 100
                  
                  return { 
                    ...prev, 
                    issued_invoice_id: invoiceId,
                    vat_amount: vatAmount,
                    total_amount: totalAmount
                  }
                })
              }}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={isLoadingInvoices}
            >
              <option value="">Select an invoice...</option>
              {availableInvoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.invoice_number} - {invoice.invoice_date} - {invoice.balance_due} {invoice.currency_code}
                </option>
              ))}
            </select>
            {isLoadingInvoices && (
              <p className="text-sm text-gray-500 mt-1">Loading invoices...</p>
            )}
          </div>

          {/* Invoice Calculations */}
          {invoiceCalcs && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <h4 className="text-sm font-medium text-gray-900">Invoice Information</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Invoice amount (no VAT):</span>
                  <span className="ml-2 font-medium">{invoiceCalcs.invoiceAmountNoVat.toFixed(2)} {formData.currency_code}</span>
                </div>
                <div>
                  <span className="text-gray-500">Paid amount (no VAT):</span>
                  <span className="ml-2 font-medium">{invoiceCalcs.paidAmountNoVat.toFixed(2)} {formData.currency_code}</span>
                </div>
                <div>
                  <span className="text-gray-500">Credited amount (no VAT):</span>
                  <span className="ml-2 font-medium">{invoiceCalcs.creditedAmountNoVat.toFixed(2)} {formData.currency_code}</span>
                </div>
                <div>
                  <span className="text-gray-500">Remaining (no VAT):</span>
                  <span className="ml-2 font-medium">{invoiceCalcs.remainingInvoiceNoVat.toFixed(2)} {formData.currency_code}</span>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                VAT Rate: {(invoiceCalcs.vatRate * 100).toFixed(1)}%
              </div>
            </div>
          )}

          {/* Credit Number */}
          <div>
            <Label htmlFor="credit_number">Credit Number</Label>
            <Input
              id="credit_number"
              value={formData.credit_number || ''}
              onChange={(e) => setFormData((prev: any) => ({ ...prev, credit_number: e.target.value }))}
              placeholder="Auto-generated if left empty"
            />
          </div>

          {/* Credit Date */}
          <div>
            <Label htmlFor="credit_date">Credit Date *</Label>
            <Input
              id="credit_date"
              type="date"
              value={formData.credit_date || ''}
              onChange={(e) => setFormData((prev: any) => ({ ...prev, credit_date: e.target.value }))}
              required
            />
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label htmlFor="subtotal_amount">Subtotal</Label>
              <Input
                id="subtotal_amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.subtotal_amount || ''}
                onChange={(e) => handleSubtotalChange(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="vat_amount">VAT</Label>
              <Input
                id="vat_amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.vat_amount || ''}
                onChange={(e) => handleVatChange(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                readOnly
                className="bg-gray-50"
              />
            </div>
            <div>
              <Label htmlFor="total_amount">Total *</Label>
              <Input
                id="total_amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.total_amount || ''}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, total_amount: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          {/* Auto-calculated total display */}
          <div className="text-sm text-gray-600">
            Auto-calculated total: {calculateTotal().toFixed(2)} {formData.currency_code}
          </div>

          {/* Reason */}
          <div>
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              value={formData.reason || ''}
              onChange={(e) => setFormData((prev: any) => ({ ...prev, reason: e.target.value }))}
              placeholder="Enter reason for credit note..."
              rows={3}
            />
          </div>

          {/* PDF Upload */}
          <div>
            <Label>PDF Attachment (Optional)</Label>
            <Dropzone
              tableName="credit-notes"
              recordId={0} // Placeholder since credit note doesn't exist yet
              bucketName="credit-notes"
              attachments={pdfFile ? [{
                id: 'pending-pdf',
                file_name: pdfFile.name,
                file_path: '',
                uploaded_at: new Date().toISOString(),
                uploaded_by: null,
                mime_type: 'application/pdf',
                size: pdfFile.size
              }] : []}
              signedUrls={{}}
              isUploading={false}
              uploadError={null}
              uploadFiles={handlePdfUpload}
              deleteAttachment={handleRemovePdf}
              className="min-h-[80px]"
            />
            {pdfFile && (
              <p className="text-xs text-gray-500 mt-1">
                PDF will be uploaded after credit note is created
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (editingCreditNote ? 'Updating...' : 'Creating...') : (editingCreditNote ? 'Update Credit Note' : 'Create Credit Note')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
} 