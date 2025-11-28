"use client"

import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '../ui/use-toast'

interface EditSupplierInvoiceModalProps {
  invoice: any | null
  isOpen: boolean
  onClose: () => void
  onInvoiceUpdated?: (updatedInvoice: any) => void
}

interface FormData {
  invoice_number: string
  invoice_date: string
  subtotal_amount: number
  issuer_team_id: number | null
  payer_team_id: number | null
}

export function EditSupplierInvoiceModal({ invoice, isOpen, onClose, onInvoiceUpdated }: EditSupplierInvoiceModalProps) {
  const supabase = createClientComponentClient()
  const [formData, setFormData] = useState<FormData>({
    invoice_number: '',
    invoice_date: '',
    subtotal_amount: 0,
    issuer_team_id: null,
    payer_team_id: null
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [teams, setTeams] = useState<Array<{ id: number; title: string }>>([])
  const [isLoadingTeams, setIsLoadingTeams] = useState(false)
  const queryClient = useQueryClient()

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
        invoice_number: invoice.invoice_number || '',
        invoice_date: invoice.invoice_date || new Date().toISOString().split('T')[0],
        subtotal_amount: invoice.subtotal_amount || 0,
        issuer_team_id: invoice.issuer_team_id || invoice.supplier_team_id || null,
        payer_team_id: invoice.payer_team_id || null
      })
    }
  }, [invoice])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invoice) return

    setIsSubmitting(true)
    try {
      // Calculate VAT and total
      const vatRate = 0.23 // 23% VAT
      const vatAmount = Math.round(formData.subtotal_amount * vatRate * 100) / 100
      const totalAmount = formData.subtotal_amount + vatAmount

      const { data, error } = await supabase
        .from('received_supplier_invoices')
        .update({
          invoice_number: formData.invoice_number,
          invoice_date: formData.invoice_date,
          subtotal_amount: formData.subtotal_amount,
          vat_amount: vatAmount,
          total_amount: totalAmount,
          issuer_team_id: formData.issuer_team_id,
          payer_team_id: formData.payer_team_id
        })
        .eq('id', invoice.id)
        .select()
        .single()

      if (error) {
        throw new Error(error.message || 'Failed to update invoice')
      }

      // Optimistically update invoice in cache
      const updatedInvoiceData = {
        ...invoice,
        invoice_number: formData.invoice_number,
        invoice_date: formData.invoice_date,
        subtotal_amount: formData.subtotal_amount,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        issuer_team_id: formData.issuer_team_id,
        supplier_team_id: formData.issuer_team_id, // For compatibility
        payer_team_id: formData.payer_team_id
      }
      
      queryClient.setQueryData(['supplier-invoice', invoice.id], updatedInvoiceData)
      
      // Invalidate queries to ensure consistency
      await queryClient.invalidateQueries({ queryKey: ['supplier-invoice', invoice.id] })
      await queryClient.invalidateQueries({ 
        predicate: (query) => 
          Array.isArray(query.queryKey) && 
          (query.queryKey[0] === 'v_received_invoices_list' || 
           query.queryKey.includes('v_received_invoices_list'))
      })

      toast({
        title: 'Success',
        description: 'Invoice updated successfully',
      })

      onInvoiceUpdated?.(updatedInvoiceData)
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
      
      return newData
    })
  }

  if (!invoice) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit Invoice #{invoice.invoice_number || invoice.id}
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
            <Label htmlFor="subtotal_amount" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Subtotal (no VAT)
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
            <div className="text-xs text-gray-500 mt-1">
              VAT (23%) and Total will be calculated automatically
            </div>
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

