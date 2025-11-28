"use client"

import { useState, useEffect } from 'react'
import { useCurrentUserStore } from '../../store/current-user'
import { CreditNoteCreateModal } from '../credit-notes/CreditNoteCreateModal'
import { SupplierCreditNoteCreateModal } from '../expenses/SupplierCreditNoteCreateModal'
import { isUserIssuerTeam } from '../../lib/utils/document-side-detector'

interface SharedCreditNoteCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onCreditNoteCreated?: (creditNote: any) => void
  onSuccess?: (document: any) => void
  fromInvoice?: any
  editingCreditNote?: any
}

export function SharedCreditNoteCreateModal({ 
  isOpen, 
  onClose, 
  onCreditNoteCreated,
  onSuccess,
  fromInvoice,
  editingCreditNote
}: SharedCreditNoteCreateModalProps) {
  const { userTeams } = useCurrentUserStore()
  const [isAR, setIsAR] = useState<boolean | null>(null)

  // Handle credit note created and fetch full details for optimistic update
  const handleCreditNoteCreatedInternal = async (creditNoteId: number, teamInfo?: any) => {
    // Call legacy callback if provided
    if (onCreditNoteCreated) {
      onCreditNoteCreated(creditNoteId)
    }

    // If onSuccess callback is provided, fetch full credit note and convert to DocumentRow
    if (onSuccess) {
      try {
        const { createClientComponentClient } = await import('@supabase/auth-helpers-nextjs')
        const supabase = createClientComponentClient()

        // Try AR credit note first
        const { data: arCreditNote, error: arError } = await supabase
          .from('v_credit_notes_summary')
          .select('*')
          .eq('credit_note_id', creditNoteId)
          .single()

        if (!arError && arCreditNote) {
          // It's an AR credit note
          const document = {
            doc_id: arCreditNote.credit_note_id,
            direction: 'ar' as const,
            doc_kind: 'credit_note' as const,
            doc_number: arCreditNote.credit_number || `CN-${arCreditNote.credit_note_id}`,
            doc_date: arCreditNote.credit_date,
            currency_code: arCreditNote.currency_code,
            subtotal_amount: arCreditNote.subtotal_amount,
            vat_amount: arCreditNote.vat_amount,
            total_amount: arCreditNote.total_amount,
            status: arCreditNote.status || 'issued',
            from_team_id: arCreditNote.issuer_team_id,
            from_team_name: arCreditNote.issuer_team_name,
            to_team_id: arCreditNote.payer_team_id,
            to_team_name: arCreditNote.payer_team_name,
            balance_due: arCreditNote.unapplied_amount,
            projects_text: null,
            created_at: arCreditNote.created_at,
            updated_at: arCreditNote.updated_at
          }

          onSuccess(document)
          onClose()
          return
        }

        // Try AP credit note (supplier_credit_note)
        const { data: apCreditNote, error: apError } = await supabase
          .from('v_received_credit_notes_summary')
          .select('*')
          .eq('credit_note_id', creditNoteId)
          .single()

        if (!apError && apCreditNote) {
          // It's an AP credit note
          const document = {
            doc_id: apCreditNote.credit_note_id,
            direction: 'ap' as const,
            doc_kind: 'credit_note' as const,
            doc_number: apCreditNote.credit_number || `CN-${apCreditNote.credit_note_id}`,
            doc_date: apCreditNote.credit_date,
            currency_code: apCreditNote.currency_code,
            subtotal_amount: apCreditNote.subtotal_amount,
            vat_amount: apCreditNote.vat_amount,
            total_amount: apCreditNote.total_amount,
            status: apCreditNote.status || 'issued',
            from_team_id: apCreditNote.issuer_team_id,
            from_team_name: apCreditNote.issuer_team_name,
            to_team_id: apCreditNote.payer_team_id,
            to_team_name: apCreditNote.payer_team_name,
            balance_due: apCreditNote.unapplied_amount,
            projects_text: null,
            created_at: apCreditNote.created_at,
            updated_at: apCreditNote.updated_at
          }

          onSuccess(document)
          onClose()
          return
        }

        // If neither worked, show warning
        const { toast } = await import('../ui/use-toast')
        toast({
          title: 'Warning',
          description: 'Credit note created but could not fetch details for immediate display',
          variant: 'default',
        })

        onClose()
      } catch (error) {
        console.error('Error fetching credit note details:', error)
        const { toast } = await import('../ui/use-toast')
        toast({
          title: 'Error',
          description: 'Failed to fetch credit note details',
          variant: 'destructive',
        })
        onClose()
      }
    } else {
      onClose()
    }
  }

  // Determine if user should create AR or AP credit note based on their teams
  useEffect(() => {
    if (userTeams.length === 0) {
      // Default to AR if no teams found
      setIsAR(true)
      return
    }

    // Business logic: 
    // - For invoices and credit notes: If user belongs to issuer teams, they create AP docs (user is issuing)
    // - If user doesn't belong to issuer teams, they create AR docs (user is receiving)
    // 
    // The logic is: if the user's team is the issuer_team_id, then the user is issuing the document
    // which means it's an AP document (Accounts Payable - money going out)
    // If the user's team is not the issuer_team_id, then the user is receiving the document
    // which means it's an AR document (Accounts Receivable - money coming in)
    
    // Use the utility function to determine if user belongs to issuer teams
    const isIssuerTeam = isUserIssuerTeam(userTeams)
    
    // If user is issuer team, they create AP documents (they are issuing)
    // If user is not issuer team, they create AR documents (they are receiving)
    setIsAR(!isIssuerTeam)
  }, [userTeams])

  // Show loading state while determining AR/AP
  if (isAR === null) {
    return null
  }

  // Render AR Credit Note Modal
  if (isAR) {
    console.log('🔵 DEBUG: Opening AR Credit Note Modal (CreditNoteCreateModal)')
    return (
      <CreditNoteCreateModal
        isOpen={isOpen}
        onClose={onClose}
        onCreditNoteCreated={handleCreditNoteCreatedInternal}
        fromInvoice={fromInvoice}
        editingCreditNote={editingCreditNote}
      />
    )
  }

  // Render AP Credit Note Modal
  console.log('🔴 DEBUG: Opening AP Credit Note Modal (SupplierCreditNoteCreateModal)')
  return (
    <SupplierCreditNoteCreateModal
      isOpen={isOpen}
      onClose={onClose}
      onCreditNoteCreated={handleCreditNoteCreatedInternal}
      fromInvoice={fromInvoice}
      editingCreditNote={editingCreditNote}
    />
  )
}
