"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { createAndIssueInvoiceRPC, fetchUserTeams, fetchClientTeams, fetchSupplierTeams, uploadInvoicePDF, updateIssuedInvoice } from '../../lib/services/billing'
import { toast } from '../ui/use-toast'
import { Loader2, HelpCircle, X } from 'lucide-react'
import { Dropzone } from '../dropzone'
import { useQuery } from '@tanstack/react-query'
import type { TeamMembership, CreateInvoiceStandalone, CreateInvoiceWithAllocations } from '../../lib/types/billing'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface CreateInvoiceDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  onInvoiceCreated: (invoiceId: number) => void
  onProceedToOrders: (invoiceId: number, formData?: any) => void
  initialData?: Partial<InvoiceFormData> // For pre-populating when going back
}

interface InvoiceFormData {
  invoice_number: string
  external_invoice_id: string
  invoice_date: string
  notes: string
  // Team fields (required for both standalone and allocations)
  issuer_team_id: number | null
  payer_team_id: number | null
  currency_code: string
  // VAT calculation fields
  header_subtotal: string
  vat_rate: number // VAT rate percentage (0, 23, or custom)
  header_vat: string
  header_total: string
  pdf_path?: string // PDF file path for initial data
}

const CURRENCIES = [
  { code: 'EUR', name: 'Euro (EUR)' },
  { code: 'USD', name: 'US Dollar (USD)' },
  { code: 'GBP', name: 'British Pound (GBP)' },
]

const VAT_RATES = [
  { value: 0, label: '0% (No VAT)' },
  { value: 23, label: '23% (Standard Rate)' },
  { value: -1, label: 'Custom Rate' }
]

export function CreateInvoiceDetailsModal({ 
  isOpen, 
  onClose, 
  onInvoiceCreated,
  onProceedToOrders,
  initialData
}: CreateInvoiceDetailsModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [customVatRate, setCustomVatRate] = useState<string>('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfPath, setPdfPath] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const supabase = createClientComponentClient()
  const [formData, setFormData] = useState<InvoiceFormData>({
    invoice_number: '',
    external_invoice_id: '',
    invoice_date: new Date().toISOString().split('T')[0],
    notes: '',
    issuer_team_id: null,
    payer_team_id: null,
    currency_code: 'EUR',
    header_subtotal: '',
    vat_rate: 23, // Default to 23%
    header_vat: '',
    header_total: ''
  })

  // Fetch all teams for both dropdowns (issuer and payer)
  const { data: allTeams = [], isLoading: isLoadingTeams } = useQuery({
    queryKey: ['all-teams'],
    queryFn: async () => {
      // Fetch all three team sources in parallel
      const [userTeamsResult, clientTeamsResult, supplierTeamsResult] = await Promise.all([
        fetchUserTeams(),
        fetchClientTeams(),
        fetchSupplierTeams()
      ])
      
      if (userTeamsResult.error) throw userTeamsResult.error
      if (clientTeamsResult.error) throw clientTeamsResult.error
      if (supplierTeamsResult.error) throw supplierTeamsResult.error
      
      // Combine all teams and remove duplicates based on team_id
      const allTeams = [
        ...(userTeamsResult.data || []),
        ...(clientTeamsResult.data || []),
        ...(supplierTeamsResult.data || [])
      ]
      
      // Remove duplicates based on team_id
      const uniqueTeams = allTeams.filter((team, index, self) => 
        index === self.findIndex(t => t.team_id === team.team_id)
      )
      
      // Sort by team_title
      return uniqueTeams.sort((a, b) => a.team_title.localeCompare(b.team_title))
    },
    enabled: isOpen
  })

  // Set default values when teams are loaded
  useEffect(() => {
    if (allTeams.length > 0 && !formData.issuer_team_id) {
      // Use the first team as default for issuer
      updateFormField('issuer_team_id', allTeams[0].team_id)
    }
  }, [allTeams, formData.issuer_team_id])

  useEffect(() => {
    if (allTeams.length > 0 && !formData.payer_team_id) {
      // Use the first team as default for payer
      updateFormField('payer_team_id', allTeams[0].team_id)
    }
  }, [allTeams, formData.payer_team_id])

  // Populate form with initial data when provided (going back from step 2)
  useEffect(() => {
    if (initialData && isOpen) {
      setFormData(prev => ({
        ...prev,
        ...initialData,
        // Handle custom VAT rate
        vat_rate: initialData.vat_rate ?? prev.vat_rate
      }))
      
      // Set custom VAT rate if applicable
      if (initialData.vat_rate === -1 && initialData.header_vat && initialData.header_subtotal) {
        const subtotal = parseFloat(initialData.header_subtotal)
        const vatAmount = parseFloat(initialData.header_vat)
        if (subtotal > 0) {
          const customRate = ((vatAmount / subtotal) * 100).toFixed(2)
          setCustomVatRate(customRate)
        }
      }
      
      // Preserve PDF data if it exists
      if (initialData.pdf_path) {
        setPdfPath(initialData.pdf_path)
        // Note: We don't restore the actual File object, only the path
        // The dropzone will show the path but won't allow re-upload
      }
    }
  }, [initialData, isOpen])

  // VAT auto-calculation
  const calculateVAT = (subtotal: number, vatRate: number) => {
    const vatAmount = (subtotal * vatRate) / 100
    const total = subtotal + vatAmount
    return {
      vatAmount: vatAmount.toFixed(2),
      total: total.toFixed(2)
    }
  }

  // Handle subtotal changes and auto-calculate VAT
  const handleSubtotalChange = (value: string) => {
    const subtotal = parseFloat(value) || 0
    const currentVatRate = formData.vat_rate === -1 ? parseFloat(customVatRate) || 0 : formData.vat_rate
    const { vatAmount, total } = calculateVAT(subtotal, currentVatRate)
    
    setFormData(prev => ({
      ...prev,
      header_subtotal: value,
      header_vat: vatAmount,
      header_total: total
    }))
  }

  // Handle VAT rate changes and recalculate
  const handleVatRateChange = (rate: number) => {
    const subtotal = parseFloat(formData.header_subtotal) || 0
    let actualRate = rate
    
    if (rate === -1) {
      // Custom rate - use the custom input
      actualRate = parseFloat(customVatRate) || 0
    }
    
    const { vatAmount, total } = calculateVAT(subtotal, actualRate)
    
    setFormData(prev => ({
      ...prev,
      vat_rate: rate,
      header_vat: vatAmount,
      header_total: total
    }))
  }

  // Handle custom VAT rate input
  const handleCustomVatRateChange = (value: string) => {
    setCustomVatRate(value)
    if (formData.vat_rate === -1) {
      const subtotal = parseFloat(formData.header_subtotal) || 0
      const customRate = parseFloat(value) || 0
      const { vatAmount, total } = calculateVAT(subtotal, customRate)
      
      setFormData(prev => ({
        ...prev,
        header_vat: vatAmount,
        header_total: total
      }))
    }
  }

  // PDF file handlers - store in memory until save
  const handlePdfUpload = async (files: FileList | File[]) => {
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

    // Store file in memory without uploading
    setPdfFile(file)
    setPdfPath(null) // Clear any previous path
  }

  const handleRemovePdf = async () => {
    setPdfFile(null)
    setPdfPath(null)
  }

  // Helper function to upload PDF with proper path convention (key-only format)
  const uploadPdfForInvoice = async (file: File, invoiceId: number, teamId: number): Promise<string | null> => {
    try {
      const storageKey = `${teamId}/${invoiceId}/${file.name}`
      
      const { data, error } = await supabase.storage
        .from('invoices')
        .upload(storageKey, file, { upsert: true })

      if (error) throw error
      return storageKey
    } catch (error) {
      console.error('Error uploading PDF:', error)
      throw error
    }
  }

  // Validation helpers
  const validateForm = () => {
    const errors: string[] = []
    
    if (!formData.invoice_number.trim()) errors.push('Invoice number is required')
    if (!formData.issuer_team_id) errors.push('Issuer team is required')
    if (!formData.payer_team_id) errors.push('Payer team is required')
    if (!formData.currency_code.trim()) errors.push('Currency is required')
    
    // Validate custom VAT rate if selected
    if (formData.vat_rate === -1) {
      const customRate = parseFloat(customVatRate)
      if (!customVatRate.trim() || !Number.isFinite(customRate) || customRate < 0) {
        errors.push('Custom VAT rate must be a valid positive number')
      }
    }
    
    // Validate subtotal if provided
    if (formData.header_subtotal !== '') {
      const num = parseFloat(formData.header_subtotal)
      if (!Number.isFinite(num) || num < 0) {
        errors.push('Subtotal must be a valid positive number')
      }
    }
    
    return errors
  }

  // Form field update helpers
  const updateFormField = (field: keyof InvoiceFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const resetForm = () => {
    setFormData({
      invoice_number: '',
      external_invoice_id: '',
      invoice_date: new Date().toISOString().split('T')[0],
      notes: '',
      issuer_team_id: null,
      payer_team_id: null,
      currency_code: 'EUR',
      header_subtotal: '',
      vat_rate: 23,
      header_vat: '',
      header_total: ''
    })
    setCustomVatRate('')
    setPdfFile(null)
    setPdfPath(null)
  }

  // Submit handlers
  const handleCreateStandaloneInvoice = async () => {
    const errors = validateForm()
    if (errors.length > 0) {
      toast({
        title: 'Validation Error',
        description: errors.join('. '),
        variant: 'destructive'
      })
      return
    }

    setIsLoading(true)
    try {
      // Detect AR/AP based on user's team membership
      const userTeamsResult = await fetchUserTeams()
      if (userTeamsResult.error) throw userTeamsResult.error
      
      const userTeamIds = (userTeamsResult.data || []).map(team => team.team_id)
      const isUserIssuer = userTeamIds.includes(formData.issuer_team_id!)
      const isUserPayer = userTeamIds.includes(formData.payer_team_id!)
      
      console.log('🔍 AR/AP Detection in CreateInvoiceDetailsModal:', {
        issuerTeamId: formData.issuer_team_id,
        payerTeamId: formData.payer_team_id,
        userTeamIds,
        isUserIssuer,
        isUserPayer,
        decision: isUserIssuer ? 'AR (use create_and_issue_invoice)' : isUserPayer ? 'AP (use create_received_invoice_with_allocations)' : 'Unknown'
      })
      
      let invoiceId: number
      
      if (isUserIssuer) {
        // AR Invoice: User is the issuer (client invoice)
        const payload: CreateInvoiceStandalone = {
          p_invoice_order_ids: null,
          p_issuer_team_id: formData.issuer_team_id!,
          p_payer_team_id: formData.payer_team_id!,
          p_currency_code: formData.currency_code,
          p_invoice_number: formData.invoice_number,
          p_external_invoice_id: formData.external_invoice_id || null,
          p_invoice_date: formData.invoice_date || null,
          p_pdf_path: null, // Will upload after creation
          p_notes: formData.notes || null,
          p_header_subtotal: formData.header_subtotal ? parseFloat(formData.header_subtotal) : null,
          p_header_vat: formData.header_vat ? parseFloat(formData.header_vat) : null,
          p_header_total: formData.header_total ? parseFloat(formData.header_total) : null
        }

        const { data, error } = await createAndIssueInvoiceRPC(payload)
        if (error) throw error
        invoiceId = data!
      } else if (isUserPayer) {
        // AP Invoice: User is the payer (supplier invoice)
        console.log('🔍 Creating standalone AP invoice')
        const { data, error } = await supabase.rpc('create_received_invoice_with_allocations', {
          p_issuer_team_id: formData.issuer_team_id!,
          p_payer_team_id: formData.payer_team_id!,
          p_invoice_number: formData.invoice_number,
          p_invoice_date: formData.invoice_date || null,
          p_currency_code: formData.currency_code,
          p_subtotal_amount: formData.header_subtotal ? parseFloat(formData.header_subtotal) : 0,
          p_vat_amount: formData.header_vat ? parseFloat(formData.header_vat) : 0,
          p_total_amount: formData.header_total ? parseFloat(formData.header_total) : 0,
          p_status: 'received',
          p_pdf_path: null,
          p_notes: formData.notes || null,
          p_allocations: []
        })
        
        console.log('🔍 RPC response:', { data, error, dataType: typeof data })
        
        if (error) throw error
        
        // The RPC returns [{"received_invoice_id": 35}] or just a number
        if (Array.isArray(data) && data.length > 0) {
          invoiceId = data[0].received_invoice_id
        } else if (typeof data === 'number') {
          invoiceId = data
        } else if (data && typeof data === 'object') {
          invoiceId = (data as any).received_invoice_id || (data as any).id || data
        } else {
          invoiceId = data
        }
        
        console.log('🔍 Extracted invoiceId:', invoiceId, 'type:', typeof invoiceId)
      } else {
        throw new Error('You must belong to either the issuer team or payer team to create an invoice')
      }

      // If PDF exists, upload it with proper path and update invoice
      if (pdfFile && invoiceId) {
        try {
          const uploadedPath = await uploadPdfForInvoice(pdfFile, invoiceId, formData.issuer_team_id!)
          
          // Update invoice with PDF path
          await updateIssuedInvoice(invoiceId, { pdf_path: uploadedPath || undefined })
          
          console.log('PDF uploaded and linked to invoice:', uploadedPath)
        } catch (pdfError) {
          console.error('PDF upload failed:', pdfError)
          toast({
            title: 'Warning',
            description: 'Invoice created but PDF upload failed. You can upload it later.',
            variant: 'destructive'
          })
        }
      }

      // Validate invoiceId before proceeding
      if (!invoiceId || typeof invoiceId !== 'number') {
        throw new Error(`Invalid invoice ID: ${invoiceId} (type: ${typeof invoiceId})`)
      }
      
      toast({
        title: 'Success',
        description: `${isUserIssuer ? 'AR' : 'AP'} invoice created successfully`
      })

      console.log('🔍 Calling onInvoiceCreated with invoiceId:', invoiceId)
      onInvoiceCreated(invoiceId)
      resetForm()
      onClose()
    } catch (error: any) {
      console.error('Error creating standalone invoice:', error)
      
      // Handle specific RPC error messages
      let errorMessage = 'Failed to create invoice'
      if (error.message?.includes('do not belong to issuer team')) {
        errorMessage = 'You do not belong to the selected issuer team'
      } else if (error.message?.includes('Provide all header totals')) {
        errorMessage = 'Provide all header totals (Subtotal, VAT, Total) or leave all empty'
      } else if (error.message) {
        errorMessage = error.message
      }
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleProceedToOrderSelection = () => {
    const errors = validateForm()
    if (errors.length > 0) {
      toast({
        title: 'Validation Error',
        description: errors.join('. '),
        variant: 'destructive'
      })
      return
    }

    toast({
      title: 'Proceeding to order selection',
      description: 'Select invoice orders to allocate to this invoice'
    })
    
    // Pass form data to parent for later use in allocation step
    onProceedToOrders(0, {
      invoice_number: formData.invoice_number,
      external_invoice_id: formData.external_invoice_id,
      invoice_date: formData.invoice_date,
      notes: formData.notes,
      issuer_team_id: formData.issuer_team_id, // For filtering orders
      payer_team_id: formData.payer_team_id,
      currency_code: formData.currency_code,
      header_subtotal: formData.header_subtotal ? parseFloat(formData.header_subtotal) : null,
      header_vat: formData.header_vat ? parseFloat(formData.header_vat) : null,
      header_total: formData.header_total ? parseFloat(formData.header_total) : null,
      pdf_file: pdfFile // Include PDF file for upload after invoice creation
    })
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="text-sm text-muted-foreground">
            Fill in the invoice details below. You can create a standalone invoice or proceed to allocate invoice orders in the next step.
          </div>

          {/* Basic Invoice Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoice_number" className="text-sm font-medium">
                Invoice Number *
              </Label>
              <Input
                id="invoice_number"
                value={formData.invoice_number}
                onChange={(e) => updateFormField('invoice_number', e.target.value)}
                placeholder="INV-001"
                className="h-9"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="external_invoice_id" className="text-sm font-medium">
                External Invoice ID
              </Label>
              <Input
                id="external_invoice_id"
                value={formData.external_invoice_id}
                onChange={(e) => updateFormField('external_invoice_id', e.target.value)}
                placeholder="Optional external reference"
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoice_date" className="text-sm font-medium">
              Invoice Date
            </Label>
            <Input
              id="invoice_date"
              type="date"
              value={formData.invoice_date}
              onChange={(e) => updateFormField('invoice_date', e.target.value)}
              className="h-9"
            />
          </div>

          {/* Team Selection - Required for both modes */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="issuer_team_id" className="text-sm font-medium">
                Issuer Team *
              </Label>
              <div title="The team you are invoicing from. You must be a member with sufficient permissions.">
                <HelpCircle className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <Select
              value={formData.issuer_team_id?.toString() || ''}
              onValueChange={(value) => updateFormField('issuer_team_id', parseInt(value))}
              disabled={isLoadingTeams}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select issuer team" />
              </SelectTrigger>
              <SelectContent>
                {allTeams.map((team) => (
                  <SelectItem key={team.team_id} value={team.team_id.toString()}>
                    {team.team_title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payer Team and Currency */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="payer_team_id" className="text-sm font-medium">
                  Payer Team *
                </Label>
                <div title="The client team receiving the invoice.">
                  <HelpCircle className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <Select
                value={formData.payer_team_id?.toString() || ''}
                onValueChange={(value) => updateFormField('payer_team_id', parseInt(value))}
                disabled={isLoadingTeams}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payer team" />
                </SelectTrigger>
                <SelectContent>
                  {allTeams.map((team) => (
                    <SelectItem key={team.team_id} value={team.team_id.toString()}>
                      {team.team_title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency_code" className="text-sm font-medium">
                Currency *
              </Label>
              <Select
                value={formData.currency_code}
                onValueChange={(value) => updateFormField('currency_code', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Invoice Amounts with VAT Calculation */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Invoice Amounts</Label>
              <div title="Enter a subtotal and select VAT rate for automatic calculation, or leave empty for order-based calculation.">
                <HelpCircle className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="header_subtotal" className="text-sm font-medium">
                  Subtotal
                </Label>
                <Input
                  id="header_subtotal"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.header_subtotal}
                  onChange={(e) => handleSubtotalChange(e.target.value)}
                  placeholder="0.00"
                  className="h-9"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vat_rate" className="text-sm font-medium">
                  VAT Rate
                </Label>
                <Select
                  value={formData.vat_rate.toString()}
                  onValueChange={(value) => handleVatRateChange(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VAT_RATES.map((rate) => (
                      <SelectItem key={rate.value} value={rate.value.toString()}>
                        {rate.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.vat_rate === -1 && (
              <div className="space-y-2">
                <Label htmlFor="custom_vat_rate" className="text-sm font-medium">
                  Custom VAT Rate (%)
                </Label>
                <Input
                  id="custom_vat_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={customVatRate}
                  onChange={(e) => handleCustomVatRateChange(e.target.value)}
                  placeholder="Enter VAT rate percentage"
                  className="h-9"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="header_vat" className="text-sm font-medium text-muted-foreground">
                  VAT Amount (Auto-calculated)
                </Label>
                <Input
                  id="header_vat"
                  type="number"
                  value={formData.header_vat}
                  readOnly
                  placeholder="0.00"
                  className="h-9 bg-muted"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="header_total" className="text-sm font-medium text-muted-foreground">
                  Total Amount (Auto-calculated)
                </Label>
                <Input
                  id="header_total"
                  type="number"
                  value={formData.header_total}
                  readOnly
                  placeholder="0.00"
                  className="h-9 bg-muted"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm font-medium">
              Notes
            </Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => updateFormField('notes', e.target.value)}
              placeholder="Optional notes for the invoice"
              rows={3}
            />
          </div>

          {/* PDF Upload */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Invoice PDF</Label>
              <div title="Upload a PDF file for this invoice. This can also be done later.">
                <HelpCircle className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4">
              {!pdfFile && !pdfPath ? (
                <Dropzone
                  tableName="issued_client_invoices"
                  recordId={0} // Will be set after invoice creation
                  bucketName="invoices"
                  attachments={[]}
                  signedUrls={{}}
                  isUploading={isUploading}
                  uploadError={null}
                  uploadFiles={handlePdfUpload}
                  deleteAttachment={handleRemovePdf}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-4"
                />
              ) : (
                <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="text-red-500">
                      📄
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {pdfFile ? pdfFile.name : (pdfPath?.split('/').pop() || 'invoice.pdf')}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemovePdf}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          
          <Button onClick={handleCreateStandaloneInvoice} disabled={isLoading} variant="outline">
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Standalone Invoice
          </Button>
          
          <Button onClick={handleProceedToOrderSelection} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Continue to Order Selection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
