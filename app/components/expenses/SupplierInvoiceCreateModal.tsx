"use client"

import React, { useState, useEffect } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { toast } from '../ui/use-toast'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useQuery } from '@tanstack/react-query'
import { fetchUserTeams } from '../../lib/services/billing'
import { Dropzone } from '../dropzone'

interface SupplierInvoiceCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (invoiceId: number) => void
  sortConfig?: { field: string; direction: 'asc' | 'desc' }
}

interface CreateInvoiceData {
  invoice_number: string
  invoice_date: string
  currency_code: string
  subtotal_amount: number
  vat_amount: number
  total_amount: number
  status: 'received'
  payer_team_id: number
  issuer_team_id: number
  notes?: string
}

interface Team {
  team_id: number
  team_name: string
}

const VAT_OPTIONS = [
  { label: '23%', value: 0.23 },
  { label: '13%', value: 0.13 },
  { label: '0%', value: 0 },
  { label: 'Other', value: 'other' }
] as const

type VatOptionValue = typeof VAT_OPTIONS[number]['value']

export function SupplierInvoiceCreateModal({ isOpen, onClose, onSuccess, sortConfig }: SupplierInvoiceCreateModalProps) {
  const supabase = createClientComponentClient()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [teams, setTeams] = useState<Team[]>([])
  const [isLoadingTeams, setIsLoadingTeams] = useState(false)
  const [selectedVatOption, setSelectedVatOption] = useState<VatOptionValue>(0.23)
  const [customVatRate, setCustomVatRate] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [formData, setFormData] = useState<CreateInvoiceData>({
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    currency_code: 'EUR',
    subtotal_amount: 0,
    vat_amount: 0,
    total_amount: 0,
    status: 'received',
    payer_team_id: 0,
    issuer_team_id: 0,
    notes: ''
  })

  // Load teams for supplier dropdown
  useEffect(() => {
    if (isOpen && teams.length === 0) {
      loadTeams()
    }
  }, [isOpen, teams.length])

  // Fetch user teams for payer dropdown
  const { data: userTeams = [], isLoading: isLoadingUserTeams } = useQuery({
    queryKey: ['user-teams'],
    queryFn: async () => {
      const { data, error } = await fetchUserTeams()
      if (error) throw error
      return data || []
    },
    enabled: isOpen
  })

  // Set default payer team when teams are loaded
  useEffect(() => {
    if (userTeams.length > 0 && formData.payer_team_id === 0) {
      setFormData(prev => ({ ...prev, payer_team_id: userTeams[0].team_id }))
    }
  }, [userTeams, formData.payer_team_id])

  const loadTeams = async () => {
    setIsLoadingTeams(true)
    try {
      const { data, error } = await supabase
        .from('v_suppliers_teams')
        .select('team_id, team_name')
        .order('team_name')
      
      if (error) throw error
      setTeams(data || [])
    } catch (error) {
      console.error('Error loading teams:', error)
      toast({
        title: "Error",
        description: "Failed to load teams.",
        variant: "destructive"
      })
    } finally {
      setIsLoadingTeams(false)
    }
  }


  const handleInputChange = (field: keyof CreateInvoiceData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    // Auto-calculate total when subtotal or VAT changes
    if (field === 'subtotal_amount' || field === 'vat_amount') {
      const subtotal = field === 'subtotal_amount' ? Number(value) : formData.subtotal_amount
      const vat = field === 'vat_amount' ? Number(value) : formData.vat_amount
      setFormData(prev => ({ ...prev, total_amount: subtotal + vat }))
    }
  }

  const handleVatOptionChange = (value: VatOptionValue) => {
    setSelectedVatOption(value)
    
    if (value === 'other') {
      // Reset VAT amount when switching to custom
      setFormData(prev => ({ ...prev, vat_amount: 0, total_amount: prev.subtotal_amount }))
    } else {
      // Calculate VAT amount based on selected percentage
      const vatAmount = formData.subtotal_amount * value
      setFormData(prev => ({ 
        ...prev, 
        vat_amount: vatAmount,
        total_amount: prev.subtotal_amount + vatAmount
      }))
    }
  }

  const handleCustomVatRateChange = (value: string) => {
    setCustomVatRate(value)
    const rate = parseFloat(value) / 100
    const vatAmount = formData.subtotal_amount * rate
    setFormData(prev => ({ 
      ...prev, 
      vat_amount: vatAmount,
      total_amount: prev.subtotal_amount + vatAmount
    }))
  }

  const handleSubtotalChange = (value: number) => {
    setFormData(prev => ({ ...prev, subtotal_amount: value }))
    
    // Recalculate VAT and total based on current VAT option
    let vatAmount = 0
    if (selectedVatOption === 'other') {
      const rate = parseFloat(customVatRate) / 100
      vatAmount = value * rate
    } else {
      vatAmount = value * selectedVatOption
    }
    
    setFormData(prev => ({ 
      ...prev, 
      vat_amount: vatAmount,
      total_amount: value + vatAmount
    }))
  }

  // PDF file handlers
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

  // Helper function to sanitize PDF name
  const sanitizePdfName = (name: string) => {
    const base = name?.trim() || '';
    const clean = base.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
    return clean.endsWith('.pdf') ? clean : `${clean}.pdf`;
  }

  // Helper function to upload PDF with proper path convention
  const uploadPdfForSupplierInvoice = async (file: File, invoiceId: number, payerTeamId: number): Promise<string | null> => {
    try {
      const safeName = sanitizePdfName(file.name)
      const path = `${payerTeamId}/${invoiceId}/${safeName}`
      
      const { error } = await supabase.storage
        .from('supplier-invoices')
        .upload(path, file, { upsert: true })

      if (error) throw error
      return path
    } catch (error) {
      console.error('PDF upload error:', error)
      throw error
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.invoice_number || !formData.invoice_date || !formData.currency_code) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive"
      })
      return
    }

    if (formData.subtotal_amount <= 0 || formData.vat_amount < 0) {
      toast({
        title: "Validation Error",
        description: "Subtotal must be greater than 0 and VAT must be non-negative.",
        variant: "destructive"
      })
      return
    }

    if (!formData.issuer_team_id || formData.issuer_team_id === 0) {
      toast({
        title: "Validation Error",
        description: "Please select a supplier team.",
        variant: "destructive"
      })
      return
    }

    if (!formData.payer_team_id || formData.payer_team_id === 0) {
      toast({
        title: "Validation Error",
        description: "Please select a payer team.",
        variant: "destructive"
      })
      return
    }

    setIsSubmitting(true)

    try {
      // Determine if this is an AP invoice (current user belongs to payer team)
      // or AR invoice (current user belongs to issuer team)
      const currentUserTeamIds = userTeams.map(team => team.team_id)
      const isAPInvoice = currentUserTeamIds.includes(formData.payer_team_id)
      const isARInvoice = currentUserTeamIds.includes(formData.issuer_team_id)
      
      let invoiceId: number

      if (isARInvoice) {
        // This is an AR (Accounts Receivable) invoice - use existing client invoice logic
        // For now, we'll use the old approach but this should eventually use create_and_issue_invoice
        const { data: insertData, error } = await supabase
          .from('received_supplier_invoices')
          .insert({
            invoice_number: formData.invoice_number,
            invoice_date: formData.invoice_date,
            currency_code: formData.currency_code,
            subtotal_amount: formData.subtotal_amount,
            vat_amount: formData.vat_amount,
            total_amount: formData.total_amount,
            status: 'received',
            payer_team_id: formData.payer_team_id,
            issuer_team_id: formData.issuer_team_id,
            notes: formData.notes || null
          })
          .select('id')

        if (error) throw error
        invoiceId = insertData[0].id
      } else if (isAPInvoice) {
        // This is an AP (Accounts Payable) invoice - use the new RPC function
        const { data: rpcData, error: rpcError } = await supabase.rpc('create_received_invoice_with_allocations', {
          p_issuer_team_id: formData.issuer_team_id,
          p_payer_team_id: formData.payer_team_id,
          p_invoice_number: formData.invoice_number,
          p_invoice_date: formData.invoice_date,
          p_currency_code: formData.currency_code,
          p_subtotal_amount: formData.subtotal_amount,
          p_vat_amount: formData.vat_amount,
          p_total_amount: formData.total_amount,
          p_status: 'received',
          p_pdf_path: null, // Will be updated after PDF upload if provided
          p_notes: formData.notes || null,
          p_allocations: [] // Empty allocations for standalone invoice
        })

        if (rpcError) throw rpcError
        invoiceId = rpcData
      } else {
        // User doesn't belong to either team - this shouldn't happen but handle gracefully
        throw new Error('You must belong to either the issuer team or payer team to create an invoice')
      }

      // Upload PDF if provided
      if (pdfFile && invoiceId) {
        try {
          setIsUploading(true)
          const uploadedPath = await uploadPdfForSupplierInvoice(pdfFile, invoiceId, formData.payer_team_id)
          
          // Update invoice with PDF path
          const { error: updateError } = await supabase
            .from('received_supplier_invoices')
            .update({
              pdf_path: uploadedPath
            })
            .eq('id', invoiceId)

          if (updateError) throw updateError
          
          console.log('PDF uploaded and linked to invoice:', uploadedPath)
        } catch (pdfError) {
          console.error('PDF upload failed:', pdfError)
          toast({
            title: 'Warning',
            description: 'Invoice created but PDF upload failed. You can upload it later.',
            variant: 'destructive'
          })
        } finally {
          setIsUploading(false)
        }
      }

      toast({
        title: "Success",
        description: `${isARInvoice ? 'AR' : 'AP'} invoice created successfully.`,
      })

      // Reset form and close modal
      setFormData({
        invoice_number: '',
        invoice_date: new Date().toISOString().split('T')[0],
        currency_code: 'EUR',
        subtotal_amount: 0,
        vat_amount: 0,
        total_amount: 0,
        status: 'received',
        payer_team_id: 0,
        issuer_team_id: 0,
        notes: ''
      })
      setSelectedVatOption(0.23)
      setCustomVatRate('')
      setPdfFile(null)
      
      onSuccess(invoiceId)
      onClose()
    } catch (error: any) {
      console.error('Error creating supplier invoice:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to create supplier invoice.",
        variant: "destructive"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Supplier Invoice</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="invoice_number">Invoice Number *</Label>
              <Input
                id="invoice_number"
                value={formData.invoice_number}
                onChange={(e) => handleInputChange('invoice_number', e.target.value)}
                placeholder="INV-001"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="invoice_date">Invoice Date *</Label>
              <Input
                id="invoice_date"
                type="date"
                value={formData.invoice_date}
                onChange={(e) => handleInputChange('invoice_date', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="currency_code">Currency *</Label>
              <select
                id="currency_code"
                value={formData.currency_code}
                onChange={(e) => handleInputChange('currency_code', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="subtotal_amount">Subtotal Amount *</Label>
            <Input
              id="subtotal_amount"
              type="number"
              step="0.01"
              min="0"
              value={formData.subtotal_amount}
              onChange={(e) => handleSubtotalChange(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <Label>VAT Rate *</Label>
            <div className="grid grid-cols-4 gap-2">
              {VAT_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={selectedVatOption === option.value ? "default" : "outline"}
                  onClick={() => handleVatOptionChange(option.value)}
                  className="text-sm"
                >
                  {option.label}
                </Button>
              ))}
            </div>
            {selectedVatOption === 'other' && (
              <div className="mt-2">
                <Label htmlFor="custom_vat_rate">Custom VAT Rate (%)</Label>
                <Input
                  id="custom_vat_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={customVatRate}
                  onChange={(e) => handleCustomVatRateChange(e.target.value)}
                  placeholder="e.g., 15.5"
                  required
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="vat_amount">VAT Amount</Label>
              <Input
                id="vat_amount"
                type="number"
                step="0.01"
                value={formData.vat_amount}
                readOnly
                className="bg-gray-50"
              />
            </div>
            
            <div>
              <Label htmlFor="total_amount">Total Amount</Label>
              <Input
                id="total_amount"
                type="number"
                step="0.01"
                value={formData.total_amount}
                readOnly
                className="bg-gray-50"
              />
            </div>
          </div>
          
          <div>
            <Label htmlFor="issuer_team_id">Supplier Team *</Label>
            <select
              id="issuer_team_id"
              value={formData.issuer_team_id || ''}
              onChange={(e) => handleInputChange('issuer_team_id', parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={isLoadingTeams}
            >
              <option value="">Select supplier team...</option>
              {teams.map((team) => (
                <option key={team.team_id} value={team.team_id}>
                  {team.team_name}
                </option>
              ))}
            </select>
            {isLoadingTeams && (
              <p className="text-xs text-gray-500 mt-1">Loading teams...</p>
            )}
          </div>

          <div>
            <Label htmlFor="payer_team_id">Payer Team *</Label>
            <select
              id="payer_team_id"
              value={formData.payer_team_id || ''}
              onChange={(e) => handleInputChange('payer_team_id', parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={isLoadingUserTeams}
            >
              <option value="">Select payer team...</option>
              {userTeams.map((team) => (
                <option key={team.team_id} value={team.team_id}>
                  {team.team_title}
                </option>
              ))}
            </select>
            {isLoadingUserTeams && (
              <p className="text-xs text-gray-500 mt-1">Loading teams...</p>
            )}
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Optional notes about this invoice"
              rows={3}
            />
          </div>

          <div>
            <Label>Invoice PDF</Label>
            <div className="bg-gray-50 rounded-lg p-4">
              {!pdfFile ? (
                <Dropzone
                  tableName="received_supplier_invoices"
                  recordId={0} // Will be set after invoice creation
                  bucketName="supplier-invoices"
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create Invoice'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
} 