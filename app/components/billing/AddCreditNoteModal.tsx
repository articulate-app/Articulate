"use client"

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { FileText, Plus, Search } from 'lucide-react'
import { CreditNoteCreateModal } from '../credit-notes/CreditNoteCreateModal'
import { AddExistingCreditNoteModal } from './AddExistingCreditNoteModal'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface AddCreditNoteModalProps {
  invoiceId: number
  invoiceCurrency: string
  invoiceNumber?: string
  supplierTeamId?: number
  supplierTeamName?: string
  payerTeamId?: number
  payerTeamName?: string
  subtotalAmount?: number
  vatRate?: number
  isOpen: boolean
  onClose: () => void
  onCreditNoteAdded: (creditNote?: any) => void
}

export function AddCreditNoteModal({ 
  invoiceId, 
  invoiceCurrency,
  invoiceNumber,
  supplierTeamId,
  supplierTeamName,
  payerTeamId,
  payerTeamName,
  subtotalAmount,
  vatRate,
  isOpen, 
  onClose, 
  onCreditNoteAdded 
}: AddCreditNoteModalProps) {
  const [showCreditNoteCreate, setShowCreditNoteCreate] = useState(false)
  const [showExistingCreditNote, setShowExistingCreditNote] = useState(false)

  const handleClose = () => {
    setShowCreditNoteCreate(false)
    setShowExistingCreditNote(false)
    onClose()
  }

  const handleCreditNoteCreated = async (creditNoteId: any, teamInfo?: any) => {
    // Fetch full credit note details
    try {
      const supabase = createClientComponentClient()

      // Try AR credit note first (this modal is used for AR invoices)
      const { data: arCreditNote, error: arError } = await supabase
        .from('v_credit_notes_summary')
        .select('*')
        .eq('credit_note_id', creditNoteId)
        .single()

      if (!arError && arCreditNote) {
        onCreditNoteAdded(arCreditNote)
        handleClose()
        return
      }

      // Fallback: just pass the ID if fetch failed
      onCreditNoteAdded(creditNoteId)
    } catch (error) {
      console.error('Error fetching credit note:', error)
      onCreditNoteAdded(creditNoteId)
    }
    handleClose()
  }

  // If showing credit note creation, render the CreditNoteCreateModal
  if (showCreditNoteCreate) {
    return (
      <CreditNoteCreateModal
        isOpen={true}
        onClose={handleClose}
        onCreditNoteCreated={(creditNote) => handleCreditNoteCreated(creditNote)}
        fromInvoice={{
          invoiceId: invoiceId,
          invoiceNumber: invoiceNumber,
          currency: invoiceCurrency,
          supplierTeamId: supplierTeamId,
          supplierTeamName: supplierTeamName,
          payerTeamId: payerTeamId,
          payerTeamName: payerTeamName,
          subtotalAmount: subtotalAmount,
          suggestedAmount: subtotalAmount || 0,
          vatRate: vatRate,
        }}
      />
    )
  }

  // If showing existing credit note selection, render the AddExistingCreditNoteModal
  if (showExistingCreditNote) {
    return (
      <AddExistingCreditNoteModal
        invoiceId={invoiceId}
        invoiceCurrency={invoiceCurrency}
        isOpen={true}
        onClose={handleClose}
        onCreditNoteAdded={handleCreditNoteCreated}
      />
    )
  }

  // Main modal with two choices
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Credit Note</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="text-sm text-gray-600 text-center">
            Choose how you want to add a credit note to this invoice
          </div>
          
          <div className="space-y-3">
            <Button
              onClick={() => setShowCreditNoteCreate(true)}
              className="w-full justify-start h-16 px-4"
              variant="outline"
            >
              <div className="flex items-center space-x-3">
                <Plus className="h-5 w-5 text-gray-600" />
                <div className="text-left">
                  <div className="font-medium">Create a new credit note</div>
                  <div className="text-sm text-gray-500">Create and record a new credit note</div>
                </div>
              </div>
            </Button>
            
            <Button
              onClick={() => setShowExistingCreditNote(true)}
              className="w-full justify-start h-16 px-4"
              variant="outline"
            >
              <div className="flex items-center space-x-3">
                <Search className="h-5 w-5 text-gray-600" />
                <div className="text-left">
                  <div className="font-medium">Select existing credit note</div>
                  <div className="text-sm text-gray-500">Link an existing credit note to this invoice</div>
                </div>
              </div>
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}