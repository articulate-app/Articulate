'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { EditableTextField } from '../ui/editable-text-field'
import { EditableTeamField } from '../ui/editable-team-field'
import { useQueryClient } from '@tanstack/react-query'

interface EditableSupplierInvoiceFieldsProps {
  invoice: any
  onInvoiceUpdate?: (updatedInvoice: any) => void
}

export function EditableSupplierInvoiceFields({ invoice, onInvoiceUpdate }: EditableSupplierInvoiceFieldsProps) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

  // Generic update handler
  const handleFieldUpdate = async (field: string, value: string) => {
    try {
      const { data, error } = await supabase
        .from('received_supplier_invoices')
        .update({ [field]: value || null })
        .eq('id', invoice.id)
        .select()
        .single()

      if (error) throw error

      // Optimistic update
      const updatedInvoice = { ...invoice, [field]: value }
      
      // Update caches
      queryClient.setQueryData(['supplier-invoice', invoice.id], updatedInvoice)
      
      // Notify parent for documents table update
      // Map invoice fields to DocumentRow fields
      if (onInvoiceUpdate) {
        const documentUpdate: any = {}
        
        // Map invoice-specific fields to document fields
        if (field === 'invoice_number') {
          documentUpdate.doc_number = value
        } else if (field === 'invoice_date') {
          documentUpdate.doc_date = value
        }
        
        // Always include the invoice field itself
        documentUpdate[field] = value
        
        onInvoiceUpdate(documentUpdate)
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
      const vatRate = invoice.vat_amount && invoice.subtotal_amount 
        ? invoice.vat_amount / invoice.subtotal_amount 
        : 0.23 // Default 23% VAT
      
      const vat = subtotal * vatRate
      const total = subtotal + vat

      const { data, error } = await supabase
        .from('received_supplier_invoices')
        .update({ 
          subtotal_amount: subtotal,
          vat_amount: vat,
          total_amount: total
        })
        .eq('id', invoice.id)
        .select()
        .single()

      if (error) throw error

      // Optimistic update
      const updatedInvoice = { 
        ...invoice, 
        subtotal_amount: subtotal,
        vat_amount: vat,
        total_amount: total
      }
      
      // Update caches
      queryClient.setQueryData(['supplier-invoice', invoice.id], updatedInvoice)
      
      // Notify parent for documents table update
      if (onInvoiceUpdate) {
        // Calculate new balance (total - allocated payments with VAT)
        const allocatedPayments = invoice.amount_paid || 0
        const newBalance = total - allocatedPayments
        
        onInvoiceUpdate({
          subtotal_amount: subtotal,
          vat_amount: vat,
          total_amount: total,
          balance_due: newBalance
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
      const vatRate = invoice.vat_amount && invoice.subtotal_amount 
        ? invoice.vat_amount / invoice.subtotal_amount 
        : 0.23 // Default 23% VAT
      
      const subtotal = total / (1 + vatRate)
      const vat = total - subtotal

      const { data, error } = await supabase
        .from('received_supplier_invoices')
        .update({ 
          subtotal_amount: subtotal,
          vat_amount: vat,
          total_amount: total
        })
        .eq('id', invoice.id)
        .select()
        .single()

      if (error) throw error

      // Optimistic update
      const updatedInvoice = { 
        ...invoice, 
        subtotal_amount: subtotal,
        vat_amount: vat,
        total_amount: total
      }
      
      // Update caches
      queryClient.setQueryData(['supplier-invoice', invoice.id], updatedInvoice)
      
      // Notify parent for documents table update
      if (onInvoiceUpdate) {
        // Calculate new balance (total - allocated payments with VAT)
        const allocatedPayments = invoice.amount_paid || 0
        const newBalance = total - allocatedPayments
        
        onInvoiceUpdate({
          subtotal_amount: subtotal,
          vat_amount: vat,
          total_amount: total,
          balance_due: newBalance
        })
      }
    } catch (error) {
      console.error('Failed to update total:', error)
      throw error
    }
  }

  // Update team field (supplier or payer)
  const handleTeamUpdate = async (field: 'issuer_team_id' | 'payer_team_id', value: string) => {
    try {
      const teamId = parseInt(value)
      
      const { data, error } = await supabase
        .from('received_supplier_invoices')
        .update({ [field]: teamId })
        .eq('id', invoice.id)
        .select()
        .single()

      if (error) throw error

      // Get team name for optimistic update
      const teamName = await getTeamName(teamId)

      // Optimistic update
      const updatedInvoice = { ...invoice, [field]: teamId }
      
      // Update caches
      queryClient.setQueryData(['supplier-invoice', invoice.id], updatedInvoice)
      
      // Notify parent for documents table update
      if (onInvoiceUpdate) {
        const documentUpdate: any = {}
        
        // Map team fields to document fields with team names
        if (field === 'issuer_team_id') {
          documentUpdate.from_team_id = teamId
          documentUpdate.from_team_name = teamName
        } else if (field === 'payer_team_id') {
          documentUpdate.to_team_id = teamId
          documentUpdate.to_team_name = teamName
        }
        
        documentUpdate[field] = teamId
        onInvoiceUpdate(documentUpdate)
      }
    } catch (error) {
      console.error(`Failed to update ${field}:`, error)
      throw error
    }
  }

  // Helper function to get team name
  const getTeamName = async (teamId: number): Promise<string> => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('title')
        .eq('id', teamId)
        .single()

      if (error) throw error
      return data?.title || 'Unknown Team'
    } catch (error) {
      console.error('Failed to get team name:', error)
      return 'Unknown Team'
    }
  }

  return {
    invoiceNumber: (
      <EditableTextField
        value={invoice.invoice_number}
        onSave={(value) => handleFieldUpdate('invoice_number', value)}
        placeholder="Enter invoice number"
        type="text"
      />
    ),
    invoiceDate: (
      <EditableTextField
        value={invoice.invoice_date}
        onSave={(value) => handleFieldUpdate('invoice_date', value)}
        type="date"
        formatter={(val) => val ? new Date(val as string).toLocaleDateString() : '-'}
      />
    ),
    subtotal: (
      <EditableTextField
        value={invoice.subtotal_amount}
        onSave={handleSubtotalUpdate}
        type="number"
        formatter={(val) => {
          const amount = typeof val === 'number' ? val : parseFloat(val as string) || 0
          return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: invoice.currency_code || 'EUR',
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
        value={invoice.total_amount}
        onSave={handleTotalUpdate}
        type="number"
        formatter={(val) => {
          const amount = typeof val === 'number' ? val : parseFloat(val as string) || 0
          return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: invoice.currency_code || 'EUR',
          }).format(amount)
        }}
        parser={(val) => {
          // Remove currency symbols and parse
          const cleaned = val.replace(/[^0-9.-]/g, '')
          return cleaned
        }}
      />
    ),
    // Team fields - editable dropdowns
    supplier: (
      <EditableTeamField
        value={invoice.issuer_team_id}
        onSave={(value) => handleTeamUpdate('issuer_team_id', value)}
        placeholder="Select supplier"
      />
    ),
    payer: (
      <EditableTeamField
        value={invoice.payer_team_id}
        onSave={(value) => handleTeamUpdate('payer_team_id', value)}
        placeholder="Select payer"
      />
    ),
  }
}

