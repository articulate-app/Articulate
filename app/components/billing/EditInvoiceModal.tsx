"use client"

import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { updateIssuedInvoice } from '../../lib/services/billing'
import { updateInvoiceInCaches } from './invoice-cache-utils'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '../ui/use-toast'
import { IssuedInvoice } from '../../lib/types/billing'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface EditInvoiceModalProps {
  invoice: IssuedInvoice | null
  isOpen: boolean
  onClose: () => void
  onInvoiceUpdated?: (updatedInvoice: IssuedInvoice) => void
}

interface FormData {
  invoice_number: string
  external_invoice_id: string
  invoice_date: string
  currency_code: string
  subtotal_amount: number
  vat_amount: number
  total_amount: number
  issuer_team_id: number | null
  payer_team_id: number | null
}

export function EditInvoiceModal({ invoice, isOpen, onClose, onInvoiceUpdated }: EditInvoiceModalProps) {
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient()
  const [formData, setFormData] = useState<FormData>({
    invoice_number: '',
    external_invoice_id: '',
    invoice_date: '',
    currency_code: '',
    subtotal_amount: 0,
    vat_amount: 0,
    total_amount: 0,
    issuer_team_id: null,
    payer_team_id: null
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [teams, setTeams] = useState<Array<{ id: number; title: string }>>([])
  const [isLoadingTeams, setIsLoadingTeams] = useState(false)
  const queryClient = useQueryClient()
  
  // Get current sort configuration from URL params
  const sortBy = searchParams.get('sortBy') || 'invoice_date'
  const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'
  const sortConfig = { field: sortBy, direction: sortOrder as 'asc' | 'desc' }

  // Load teams when modal opens
  useEffect(() => {
    if (isOpen && teams.length === 0) {
      loadTeams()
    }
  }, [isOpen])

  const loadTeams = async () => {
    setIsLoadingTeams(true)
    try {
      // Fetch from all three views and merge
      const [suppliersRes, myTeamsRes, clientsRes] = await Promise.all([
        supabase.from('v_suppliers_teams').select('team_id, team_name'),
        supabase.from('v_teams_i_belong_to').select('team_id, team_title'),
        supabase.from('v_clients_teams').select('team_id, title'),
      ])

      const allTeams: Array<{ id: number; title: string }> = []
      
      // Add suppliers (uses team_name)
      if (suppliersRes.data) {
        suppliersRes.data.forEach((t: any) => {
          if (!allTeams.find(existing => existing.id === t.team_id)) {
            allTeams.push({ id: t.team_id, title: t.team_name })
          }
        })
      }
      
      // Add my teams (uses team_title)
      if (myTeamsRes.data) {
        myTeamsRes.data.forEach((t: any) => {
          if (!allTeams.find(existing => existing.id === t.team_id)) {
            allTeams.push({ id: t.team_id, title: t.team_title })
          }
        })
      }
      
      // Add clients (uses title)
      if (clientsRes.data) {
        clientsRes.data.forEach((t: any) => {
          if (!allTeams.find(existing => existing.id === t.team_id)) {
            allTeams.push({ id: t.team_id, title: t.title })
          }
        })
      }

      // Sort by title
      allTeams.sort((a, b) => a.title.localeCompare(b.title))
      
      setTeams(allTeams)
    } catch (err) {
      console.error('Failed to load teams:', err)
    } finally {
      setIsLoadingTeams(false)
    }
  }

  // Update form data when invoice changes
  useEffect(() => {
    if (invoice) {
      setFormData({
        invoice_number: (invoice as any).invoice_number || '',
        external_invoice_id: (invoice as any).external_invoice_id || '',
        invoice_date: (invoice as any).invoice_date || new Date().toISOString().split('T')[0],
        currency_code: invoice.currency_code || '',
        subtotal_amount: (invoice as any).subtotal_amount || 0,
        vat_amount: invoice.vat_amount || 0,
        total_amount: invoice.total_amount || 0,
        issuer_team_id: (invoice as any).issuer_team_id || null,
        payer_team_id: (invoice as any).payer_team_id || null
      })
    }
  }, [invoice])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invoice) return

    setIsSubmitting(true)
    try {
      const { data, error } = await updateIssuedInvoice(invoice.id, {
        invoice_number: formData.invoice_number,
        external_invoice_id: formData.external_invoice_id,
        invoice_date: formData.invoice_date,
        currency_code: formData.currency_code,
        subtotal_amount: formData.subtotal_amount,
        vat_amount: formData.vat_amount,
        total_amount: formData.total_amount,
        issuer_team_id: formData.issuer_team_id,
        payer_team_id: formData.payer_team_id
      })

      if (error) {
        throw new Error(error.message || 'Failed to update invoice')
      }

      // Optimistically update invoice in all caches
      const updatedInvoiceData = {
        // Preserve other fields first
        ...invoice,
        // Then override with updated fields
        id: invoice.id,
        invoice_number: formData.invoice_number,
        external_invoice_id: formData.external_invoice_id,
        invoice_date: formData.invoice_date,
        currency_code: formData.currency_code,
        subtotal_amount: formData.subtotal_amount,
        vat_amount: formData.vat_amount,
        total_amount: formData.total_amount,
        issuer_team_id: formData.issuer_team_id,
        payer_team_id: formData.payer_team_id
      }
      
      updateInvoiceInCaches(queryClient, updatedInvoiceData, sortConfig)
      
      // Also invalidate queries to ensure consistency
      await queryClient.invalidateQueries({ queryKey: ['issued-invoice', invoice.id] })
      await queryClient.invalidateQueries({ 
        predicate: (query) => 
          Array.isArray(query.queryKey) && 
          (query.queryKey[0] === 'v_issued_invoices_list' || 
           query.queryKey.includes('v_issued_invoices_list'))
      })

      toast({
        title: 'Success',
        description: 'Invoice updated successfully',
      })

      onInvoiceUpdated?.(data)
      onClose()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update invoice',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInputChange = (field: keyof FormData, value: string | number | null) => {
    setFormData(prev => {
      const newData = {
        ...prev,
        [field]: value
      }
      
      // Auto-recalculate VAT and total when subtotal changes
      if (field === 'subtotal_amount' && typeof value === 'number') {
        const vatRate = 0.23 // 23% VAT rate - you might want to make this configurable
        const vatAmount = Math.round(value * vatRate * 100) / 100
        const totalAmount = value + vatAmount
        
        newData.vat_amount = vatAmount
        newData.total_amount = totalAmount
      }
      
      return newData
    })
  }

  if (!invoice) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit Invoice #{(invoice as any).invoice_number || invoice.id}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="invoice_number" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Invoice Number
            </Label>
            <Input
              id="invoice_number"
              value={formData.invoice_number}
              onChange={(e) => handleInputChange('invoice_number', e.target.value)}
              placeholder="Enter invoice number"
              className="h-9"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="external_invoice_id" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              External Invoice ID
            </Label>
            <Input
              id="external_invoice_id"
              value={formData.external_invoice_id}
              onChange={(e) => handleInputChange('external_invoice_id', e.target.value)}
              placeholder="Enter external invoice ID"
              className="h-9"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="invoice_date" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Invoice Date
            </Label>
            <Input
              id="invoice_date"
              type="date"
              value={formData.invoice_date}
              onChange={(e) => handleInputChange('invoice_date', e.target.value)}
              className="h-9"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="issuer_team_id" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Supplier
            </Label>
            <select
              id="issuer_team_id"
              value={formData.issuer_team_id || ''}
              onChange={(e) => handleInputChange('issuer_team_id', e.target.value ? parseInt(e.target.value) : null)}
              disabled={isLoadingTeams}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Select supplier</option>
              {isLoadingTeams ? (
                <option disabled>Loading teams...</option>
              ) : (
                teams.map(team => (
                  <option key={team.id} value={team.id}>
                    {team.title}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="payer_team_id" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Payer
            </Label>
            <select
              id="payer_team_id"
              value={formData.payer_team_id || ''}
              onChange={(e) => handleInputChange('payer_team_id', e.target.value ? parseInt(e.target.value) : null)}
              disabled={isLoadingTeams}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Select payer</option>
              {isLoadingTeams ? (
                <option disabled>Loading teams...</option>
              ) : (
                teams.map(team => (
                  <option key={team.id} value={team.id}>
                    {team.title}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="currency_code" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Currency
            </Label>
            <Input
              id="currency_code"
              value={formData.currency_code}
              onChange={(e) => handleInputChange('currency_code', e.target.value)}
              placeholder="EUR"
              className="h-9"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="subtotal_amount" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Subtotal
            </Label>
            <Input
              id="subtotal_amount"
              type="number"
              step="0.01"
              value={formData.subtotal_amount}
              onChange={(e) => handleInputChange('subtotal_amount', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="h-9"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="vat_amount" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              VAT Amount
            </Label>
            <Input
              id="vat_amount"
              type="number"
              step="0.01"
              value={formData.vat_amount}
              onChange={(e) => handleInputChange('vat_amount', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="h-9"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="total_amount" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Total Amount
            </Label>
            <Input
              id="total_amount"
              type="number"
              step="0.01"
              value={formData.total_amount}
              onChange={(e) => handleInputChange('total_amount', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="h-9"
            />
          </div>

          <DialogFooter className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-6"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="px-6 bg-black text-white hover:bg-gray-800"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
} 