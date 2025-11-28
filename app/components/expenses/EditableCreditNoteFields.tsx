'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { EditableTextField } from '../ui/editable-text-field'
import { useQueryClient } from '@tanstack/react-query'

interface EditableCreditNoteFieldsProps {
  creditNote: any
  onCreditNoteUpdate?: (updatedCreditNote: any) => void
  isAP?: boolean // true for AP credit notes, false for AR credit notes
  creditNoteId?: number // Optional explicit ID if creditNote.id is not available
}

export function EditableCreditNoteFields({ creditNote, onCreditNoteUpdate, isAP = true, creditNoteId }: EditableCreditNoteFieldsProps) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

  // Generic update handler
  const handleFieldUpdate = async (field: string, value: string) => {
    try {
      const tableName = isAP ? 'received_credit_notes' : 'issued_credit_notes'
      const id = creditNoteId || creditNote.id || creditNote.credit_note_id
      
      if (!id) {
        throw new Error('Credit note ID not found')
      }
      
      const { data, error } = await supabase
        .from(tableName)
        .update({ [field]: value || null })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // Optimistic update
      const updatedCreditNote = { ...creditNote, [field]: value }
      
      // Update caches
      const cacheKey = isAP ? 'supplier-credit-note' : 'issued-credit-note'
      queryClient.setQueryData([cacheKey, id], updatedCreditNote)
      
      // Notify parent for documents table update
      if (onCreditNoteUpdate) {
        const documentUpdate: any = {}
        
        // Map credit note fields to document fields
        if (field === 'credit_number') {
          documentUpdate.doc_number = value
        } else if (field === 'credit_date') {
          documentUpdate.doc_date = value
        }
        
        // Always include the credit note field itself
        documentUpdate[field] = value
        
        onCreditNoteUpdate(documentUpdate)
      }
    } catch (error) {
      console.error(`Failed to update ${field}:`, error)
      throw error
    }
  }

  // Update subtotal (also recalculate VAT and total)
  const handleSubtotalUpdate = async (value: string) => {
    try {
      const subtotal = parseFloat(value) || 0
      const vatRate = creditNote.vat_amount && creditNote.subtotal_amount 
        ? creditNote.vat_amount / creditNote.subtotal_amount 
        : 0.23 // Default 23% VAT
      
      const vat = subtotal * vatRate
      const total = subtotal + vat

      const tableName = isAP ? 'received_credit_notes' : 'issued_credit_notes'
      const id = creditNoteId || creditNote.id || creditNote.credit_note_id
      
      if (!id) {
        throw new Error('Credit note ID not found')
      }
      
      const { data, error } = await supabase
        .from(tableName)
        .update({ 
          subtotal_amount: subtotal,
          vat_amount: vat,
          total_amount: total
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // Optimistic update
      const updatedCreditNote = { 
        ...creditNote, 
        subtotal_amount: subtotal,
        vat_amount: vat,
        total_amount: total
      }
      
      // Update caches
      const cacheKey = isAP ? 'supplier-credit-note' : 'issued-credit-note'
      queryClient.setQueryData([cacheKey, id], updatedCreditNote)
      
      // Notify parent for documents table update
      if (onCreditNoteUpdate) {
        onCreditNoteUpdate({
          subtotal_amount: subtotal,
          vat_amount: vat,
          total_amount: total
        })
      }
    } catch (error) {
      console.error('Failed to update subtotal:', error)
      throw error
    }
  }

  // Update total (recalculate subtotal and VAT)
  const handleTotalUpdate = async (value: string) => {
    try {
      const total = parseFloat(value) || 0
      const vatRate = creditNote.vat_amount && creditNote.subtotal_amount 
        ? creditNote.vat_amount / creditNote.subtotal_amount 
        : 0.23 // Default 23% VAT
      
      const subtotal = total / (1 + vatRate)
      const vat = total - subtotal

      const tableName = isAP ? 'received_credit_notes' : 'issued_credit_notes'
      const id = creditNoteId || creditNote.id || creditNote.credit_note_id
      
      if (!id) {
        throw new Error('Credit note ID not found')
      }
      
      const { data, error } = await supabase
        .from(tableName)
        .update({ 
          subtotal_amount: subtotal,
          vat_amount: vat,
          total_amount: total
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // Optimistic update
      const updatedCreditNote = { 
        ...creditNote, 
        subtotal_amount: subtotal,
        vat_amount: vat,
        total_amount: total
      }
      
      // Update caches
      const cacheKey = isAP ? 'supplier-credit-note' : 'issued-credit-note'
      queryClient.setQueryData([cacheKey, id], updatedCreditNote)
      
      // Notify parent for documents table update
      if (onCreditNoteUpdate) {
        onCreditNoteUpdate({
          subtotal_amount: subtotal,
          vat_amount: vat,
          total_amount: total
        })
      }
    } catch (error) {
      console.error('Failed to update total:', error)
      throw error
    }
  }

  return {
    creditNumber: (
      <EditableTextField
        value={creditNote.credit_number}
        onSave={(value) => handleFieldUpdate('credit_number', value)}
        placeholder="Enter credit note number"
        type="text"
      />
    ),
    creditDate: (
      <EditableTextField
        value={creditNote.credit_date}
        onSave={(value) => handleFieldUpdate('credit_date', value)}
        type="date"
        formatter={(val) => val ? new Date(val as string).toLocaleDateString() : '-'}
      />
    ),
    reason: (
      <EditableTextField
        value={creditNote.reason}
        onSave={(value) => handleFieldUpdate('reason', value)}
        placeholder="Enter reason"
        type="text"
      />
    ),
    subtotal: (
      <EditableTextField
        value={creditNote.subtotal_amount}
        onSave={handleSubtotalUpdate}
        type="number"
        formatter={(val) => {
          const amount = typeof val === 'number' ? val : parseFloat(val as string) || 0
          return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: creditNote.currency_code || 'EUR',
          }).format(amount)
        }}
        parser={(val) => {
          // Remove currency symbols and parse
          const cleaned = val.replace(/[^0-9.-]/g, '')
          return cleaned
        }}
      />
    ),
    total: (
      <EditableTextField
        value={creditNote.total_amount}
        onSave={handleTotalUpdate}
        type="number"
        formatter={(val) => {
          const amount = typeof val === 'number' ? val : parseFloat(val as string) || 0
          return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: creditNote.currency_code || 'EUR',
          }).format(amount)
        }}
        parser={(val) => {
          // Remove currency symbols and parse
          const cleaned = val.replace(/[^0-9.-]/g, '')
          return cleaned
        }}
      />
    ),
  }
}
