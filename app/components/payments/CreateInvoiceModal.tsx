"use client"

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { toast } from '../ui/use-toast'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface CreateInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  onInvoiceCreated: (invoiceId: number) => void
}

const supabase = createClientComponentClient()

export function CreateInvoiceModal({ isOpen, onClose, onInvoiceCreated }: CreateInvoiceModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    invoice_number: '',
    payer_team_id: '',
    issuer_team_id: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    total_amount: '',
    currency: 'EUR',
    status: 'draft',
    description: '',
    notes: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.invoice_number || !formData.payer_team_id || !formData.total_amount) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)

    try {
      const { data, error } = await supabase
        .from('issued_invoices')
        .insert({
          invoice_number: formData.invoice_number,
          payer_team_id: parseInt(formData.payer_team_id),
          issuer_team_id: parseInt(formData.issuer_team_id) || null,
          invoice_date: formData.invoice_date,
          due_date: formData.due_date || null,
          total_amount: parseFloat(formData.total_amount),
          currency: formData.currency,
          status: formData.status,
          description: formData.description || null,
          notes: formData.notes || null,
          balance_due: parseFloat(formData.total_amount), // Initially, balance due equals total amount
        })
        .select()
        .single()

      if (error) {
        throw error
      }

      toast({
        title: 'Success',
        description: 'Invoice created successfully',
      })
      
      // Reset form
      setFormData({
        invoice_number: '',
        payer_team_id: '',
        issuer_team_id: '',
        invoice_date: new Date().toISOString().split('T')[0],
        due_date: '',
        total_amount: '',
        currency: 'EUR',
        status: 'draft',
        description: '',
        notes: '',
      })
      
      onInvoiceCreated(data.id)
      
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create invoice',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setFormData({
      invoice_number: '',
      payer_team_id: '',
      issuer_team_id: '',
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: '',
      total_amount: '',
      currency: 'EUR',
      status: 'draft',
      description: '',
      notes: '',
    })
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Invoice Number */}
          <div className="space-y-1">
            <Label htmlFor="invoice_number" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Invoice Number*
            </Label>
            <Input
              id="invoice_number"
              value={formData.invoice_number}
              onChange={(e) => setFormData(prev => ({ ...prev, invoice_number: e.target.value }))}
              required
              className="h-9"
              placeholder="INV-001"
            />
          </div>

          {/* Payer and Issuer Team IDs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="payer_team_id" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Payer Team ID*
              </Label>
              <Input
                id="payer_team_id"
                type="number"
                value={formData.payer_team_id}
                onChange={(e) => setFormData(prev => ({ ...prev, payer_team_id: e.target.value }))}
                required
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="issuer_team_id" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Issuer Team ID
              </Label>
              <Input
                id="issuer_team_id"
                type="number"
                value={formData.issuer_team_id}
                onChange={(e) => setFormData(prev => ({ ...prev, issuer_team_id: e.target.value }))}
                className="h-9"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="invoice_date" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Invoice Date*
              </Label>
              <Input
                id="invoice_date"
                type="date"
                value={formData.invoice_date}
                onChange={(e) => setFormData(prev => ({ ...prev, invoice_date: e.target.value }))}
                required
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="due_date" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Due Date
              </Label>
              <Input
                id="due_date"
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                className="h-9"
              />
            </div>
          </div>

          {/* Amount and Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="total_amount" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Total Amount*
              </Label>
              <Input
                id="total_amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.total_amount}
                onChange={(e) => setFormData(prev => ({ ...prev, total_amount: e.target.value }))}
                required
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="currency" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Currency*
              </Label>
              <select
                id="currency"
                value={formData.currency}
                onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                required
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1">
            <Label htmlFor="status" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Status
            </Label>
            <select
              id="status"
              value={formData.status}
              onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
              className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label htmlFor="description" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Description
            </Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="h-9"
              placeholder="Brief description of invoice"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="notes" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Notes
            </Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={2}
              className="resize-none"
              placeholder="Internal notes"
            />
          </div>
        </form>

        <DialogFooter className="flex justify-between">
          <Button 
            type="button" 
            variant="outline" 
            onClick={handleCancel}
            disabled={isLoading}
            className="px-6"
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-6 bg-black text-white hover:bg-gray-800"
          >
            {isLoading ? 'Creating...' : 'Create Invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 