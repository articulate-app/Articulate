"use client"

import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Dropzone } from '../dropzone'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Loader2 } from 'lucide-react'
import { updateIssuedInvoice, uploadInvoicePDF, getInvoicePDFSignedUrl, issueInvoice, updateInvoiceOrderInCaches } from '../../lib/services/billing'
import { updateInvoiceInCaches } from './invoice-cache-utils'
import { useCurrentUserStore } from '../../store/current-user'
import { toast } from '../ui/use-toast'
import { IssuedInvoice } from '../../lib/types/billing'
import { useMutation, useQueryClient } from '@tanstack/react-query'

interface InvoiceDetailsFormProps {
  invoice: IssuedInvoice
  onUpdate: (updatedInvoice: IssuedInvoice) => void
  isPane?: boolean
}

interface FormData {
  invoice_number: string
  external_invoice_id: string
  invoice_date: string
}

export function InvoiceDetailsForm({ invoice, onUpdate, isPane = false }: InvoiceDetailsFormProps) {
  const searchParams = useSearchParams()
  const [formData, setFormData] = useState<FormData>({
    invoice_number: invoice.invoice_number || '',
    external_invoice_id: invoice.external_invoice_id || '',
    invoice_date: invoice.invoice_date || new Date().toISOString().split('T')[0],
  })
  
  // Get current sort configuration from URL params
  const sortBy = searchParams.get('sortBy') || 'invoice_date'
  const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'
  const sortConfig = { field: sortBy, direction: sortOrder as 'asc' | 'desc' }
  
  const [pdfSignedUrl, setPdfSignedUrl] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<any[]>([])
  const [signedUrls, setSignedUrls] = useState<{ [key: string]: string }>({})
  const [showIssueConfirm, setShowIssueConfirm] = useState(false)
  
  // Use current user from store instead of fetching
  const publicUserId = useCurrentUserStore(state => state.publicUserId)
  const queryClient = useQueryClient()

  // React Query mutations
  const updateInvoiceMutation = useMutation({
    mutationFn: async (updates: any) => {
      const { data, error } = await updateIssuedInvoice(invoice.id, updates)
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      onUpdate(data)
      // Update the cache
      queryClient.setQueryData(['issued-invoice', invoice.id], data)
      
      // Optimistically update invoice in all caches (including list)
      updateInvoiceInCaches(queryClient, data, sortConfig)
      
      // Also invalidate queries to ensure consistency (same pattern as payments)
      queryClient.invalidateQueries({ queryKey: ['issued-invoice', invoice.id] })
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          Array.isArray(query.queryKey) && 
          (query.queryKey[0] === 'v_issued_invoices_list' || 
           query.queryKey.includes('v_issued_invoices_list'))
      })
    },
    onError: (err: any) => {
      toast({
        title: 'Error',
        description: err.message || 'Failed to save invoice details',
        variant: 'destructive',
      })
    }
  })

  const issueInvoiceMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await issueInvoice(invoice.id)
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      onUpdate(data)
      // Update the cache
      queryClient.setQueryData(['issued-invoice', invoice.id], data)
      
      // Trigger optimistic update for invoice orders
      if (data && data.issued_invoice_orders) {
        data.issued_invoice_orders.forEach((link: any) => {
          if (link.invoice_orders) {
            const updatedOrder = {
              ...link.invoice_orders,
              status: 'issued'
            }
            updateInvoiceOrderInCaches(updatedOrder)
          }
        })
      }
      
      toast({
        title: 'Success',
        description: 'Invoice issued successfully',
      })
    },
    onError: (err: any) => {
      toast({
        title: 'Error',
        description: err.message || 'Failed to issue invoice',
        variant: 'destructive',
      })
    }
  })

  const uploadPdfMutation = useMutation({
    mutationFn: async (file: File) => {
      // Upload PDF
      const { data: pdfPath, error: uploadError } = await uploadInvoicePDF(
        file,
        invoice.id,
        formData.invoice_number,
        invoice.issuer_team_id || 0
      )
      if (uploadError) throw uploadError

      // Update invoice with PDF path
      const { data: updatedInvoice, error: updateError } = await updateIssuedInvoice(invoice.id, {
        pdf_path: pdfPath || undefined
      })
      if (updateError) throw updateError

      // Get signed URL for the uploaded PDF
      const { data: signedUrl, error: urlError } = await getInvoicePDFSignedUrl(pdfPath!)
      if (urlError) throw urlError

      return { updatedInvoice, signedUrl, pdfPath }
    },
    onSuccess: ({ updatedInvoice, signedUrl, pdfPath }) => {
      onUpdate(updatedInvoice)
      // Update the cache
      queryClient.setQueryData(['issued-invoice', invoice.id], updatedInvoice)
      
      // Optimistically update invoice in all caches (including list)
      updateInvoiceInCaches(queryClient, updatedInvoice, sortConfig)
      
      // Also invalidate queries to ensure consistency (same pattern as payments)
      queryClient.invalidateQueries({ queryKey: ['issued-invoice', invoice.id] })
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          Array.isArray(query.queryKey) && 
          (query.queryKey[0] === 'v_issued_invoices_list' || 
           query.queryKey.includes('v_issued_invoices_list'))
      })

      // Update local state
      setAttachments([{
        id: 'uploaded-pdf',
        file_name: pdfPath!.split('/').pop() || 'invoice.pdf',
        file_path: pdfPath!,
        uploaded_at: new Date().toISOString(),
        uploaded_by: 'Current User',
        mime_type: 'application/pdf',
        size: null
      }])
      setSignedUrls({ 'uploaded-pdf': signedUrl! })
      setPdfSignedUrl(signedUrl)

      toast({
        title: 'Success',
        description: 'PDF uploaded successfully',
      })
    },
    onError: (err: any) => {
      toast({
        title: 'Error',
        description: err.message || 'Failed to upload PDF',
        variant: 'destructive',
      })
    }
  })

  // Update form data when invoice changes
  useEffect(() => {
    setFormData({
      invoice_number: invoice.invoice_number || '',
      external_invoice_id: invoice.external_invoice_id || '',
      invoice_date: invoice.invoice_date || new Date().toISOString().split('T')[0],
    })
  }, [invoice])

  // Load existing PDF if available
  useEffect(() => {
    const loadPDF = async () => {
      if (invoice.pdf_path) {
        const { data: urlData, error: urlError } = await getInvoicePDFSignedUrl(invoice.pdf_path)
        if (!urlError && urlData) {
          setPdfSignedUrl(urlData)
          setAttachments([{
            id: 'existing-pdf',
            file_name: invoice.pdf_path.split('/').pop() || 'invoice.pdf',
            file_path: invoice.pdf_path,
            uploaded_at: invoice.updated_at,
            uploaded_by: null,
            mime_type: 'application/pdf',
            size: null
          }])
          setSignedUrls({ 'existing-pdf': urlData })
        }
      }
    }

    loadPDF()
  }, [invoice.pdf_path, invoice.updated_at])

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleFieldBlur = async (field: keyof FormData) => {
    // Only auto-save if we have a valid invoice number
    if (!formData.invoice_number.trim()) {
      return
    }

    updateInvoiceMutation.mutate({
      invoice_number: formData.invoice_number.trim(),
      external_invoice_id: formData.external_invoice_id.trim() || undefined,
      invoice_date: formData.invoice_date,
    })
  }

  const handleUploadFiles = async (files: FileList | File[]) => {
    if (!publicUserId || !formData.invoice_number.trim()) {
      toast({
        title: 'Error',
        description: 'Please save invoice details before uploading PDF',
        variant: 'destructive',
      })
      return
    }

    const fileArray = Array.from(files)
    const pdfFile = fileArray.find(file => file.type === 'application/pdf')
    
    if (!pdfFile) {
      toast({
        title: 'Error',
        description: 'Please upload a PDF file',
        variant: 'destructive',
      })
      return
    }

    uploadPdfMutation.mutate(pdfFile)
  }

  const handleDeleteAttachment = async (attachment: any) => {
    try {
      // Update invoice to remove PDF path
      const { data: updatedInvoice, error } = await updateIssuedInvoice(invoice.id, {
        pdf_path: undefined
      })

      if (error) {
        throw error
      }

      setAttachments([])
      setSignedUrls({})
      setPdfSignedUrl(null)

      toast({
        title: 'Success',
        description: 'PDF removed successfully',
      })

      onUpdate(updatedInvoice)
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to remove PDF',
        variant: 'destructive',
      })
    }
  }

  const isFormValid = formData.invoice_number.trim().length > 0
  const isDraft = invoice.status === 'draft'
  const isReadOnly = !isDraft

  const handleIssueInvoice = async () => {
    if (!isFormValid) {
      toast({
        title: 'Validation Error',
        description: 'Invoice number is required to issue the invoice',
        variant: 'destructive',
      })
      return
    }

    issueInvoiceMutation.mutate()
    setShowIssueConfirm(false)
  }

  return (
    <div className="space-y-4">
      {/* Invoice Details Form */}
      <div className="space-y-3">
        <div>
          <Label htmlFor="invoice_number" className="text-sm font-medium text-gray-700">
            Invoice Number *
          </Label>
          <Input
            id="invoice_number"
            value={formData.invoice_number}
            onChange={(e) => handleInputChange('invoice_number', e.target.value)}
            onBlur={() => handleFieldBlur('invoice_number')}
            placeholder="Enter invoice number"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="external_invoice_id" className="text-sm font-medium text-gray-700">
            External Invoice ID
          </Label>
          <Input
            id="external_invoice_id"
            value={formData.external_invoice_id}
            onChange={(e) => handleInputChange('external_invoice_id', e.target.value)}
            onBlur={() => handleFieldBlur('external_invoice_id')}
            placeholder="Enter external invoice ID (optional)"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="invoice_date" className="text-sm font-medium text-gray-700">
            Invoice Date
          </Label>
          <Input
            id="invoice_date"
            type="date"
            value={formData.invoice_date}
            onChange={(e) => handleInputChange('invoice_date', e.target.value)}
            onBlur={() => handleFieldBlur('invoice_date')}
            className="mt-1"
          />
        </div>


      </div>

              {/* PDF Upload */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Upload PDF
          </Label>
          <Dropzone
            tableName="issued_client_invoices"
            recordId={invoice.id}
            bucketName="invoices"
            attachments={attachments}
            signedUrls={signedUrls}
            isUploading={uploadPdfMutation.isPending}
            uploadError={null}
            uploadFiles={handleUploadFiles}
            deleteAttachment={handleDeleteAttachment}
            className="border-2 border-dashed border-gray-300 rounded-lg p-4"
          />
        </div>

        {/* Issue Invoice Button */}
        {isDraft && (
          <div className={isPane ? "absolute left-0 right-0 p-4 border-t border-gray-200 bg-white flex-shrink-0 z-50" : "pt-4 border-t border-gray-200"} style={isPane ? { bottom: '0px' } : {}}>
            <Button
              onClick={() => setShowIssueConfirm(true)}
              disabled={!isFormValid || issueInvoiceMutation.isPending}
              className={`w-full ${isPane ? "bg-black text-white hover:bg-gray-800" : ""}`}
            >
              {issueInvoiceMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Issuing Invoice...
                </>
              ) : (
                'Issue Invoice'
              )}
            </Button>
          </div>
        )}

        {/* Issue Confirmation Dialog */}
        <Dialog open={showIssueConfirm} onOpenChange={setShowIssueConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Issue Invoice</DialogTitle>
              <DialogDescription>
                Are you sure you want to issue this invoice? This action cannot be undone.
                The invoice will be marked as issued and the form will become read-only.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowIssueConfirm(false)}>
                Cancel
              </Button>
              <Button onClick={handleIssueInvoice} className="bg-green-600 hover:bg-green-700">
                Issue Invoice
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  } 