"use client"

import { useState, useEffect } from 'react'
import { useCurrentUserStore } from '../../store/current-user'
import { CreateInvoiceDetailsModal } from '../billing/CreateInvoiceDetailsModal'
import { InvoiceOrderSelectionModal } from '../billing/InvoiceOrderSelectionModal'
import { SupplierInvoiceCreateModal } from '../expenses/SupplierInvoiceCreateModal'
import { isUserIssuerTeam, determineDocumentSide } from '../../lib/utils/document-side-detector'
import { createAndIssueInvoiceRPC, fetchIssuedInvoice } from '../../lib/services/billing'
import { getSupplierInvoiceDetails } from '../../lib/services/expenses'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { toast } from '../ui/use-toast'
import type { InvoiceOrder } from '../../lib/types/billing'

interface SharedInvoiceCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (document: any) => void // Pass full document object for optimistic updates
  sortConfig?: { field: string; direction: 'asc' | 'desc' }
  fromContext?: {
    issuerTeamId?: number
    issuerTeamName?: string
    payerTeamId?: number
    payerTeamName?: string
    subtotalAmount?: number
    currencyCode?: string
    orderId?: number
    orderSubtotal?: number
  }
}

export function SharedInvoiceCreateModal({ 
  isOpen, 
  onClose, 
  onSuccess,
  sortConfig = { field: 'invoice_date', direction: 'desc' },
  fromContext
}: SharedInvoiceCreateModalProps) {
  const { userTeams } = useCurrentUserStore()
  const [isAR, setIsAR] = useState<boolean | null>(null)
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false)
  
  // State for order selection flow
  const [isOrderSelectionOpen, setIsOrderSelectionOpen] = useState(false)
  const [createdInvoiceId, setCreatedInvoiceId] = useState<number | null>(null)
  const [invoiceFormData, setInvoiceFormData] = useState<any>(null)

  // Default to AR (client invoice modal) when modal opens
  // AR/AP detection will happen when user proceeds to order selection
  useEffect(() => {
    // Always start with AR (client invoice modal) as default
    setIsAR(true)
  }, [])

  // Handle invoice creation (standalone)
  const handleInvoiceCreated = async (invoiceId: number) => {
    setCreatedInvoiceId(invoiceId)
    
    // Fetch the full document object for optimistic updates
    // Try AR invoice first, then AP invoice
    try {
      // Try fetching as AR invoice (issued_client_invoices)
      const { data: arInvoice, error: arError } = await fetchIssuedInvoice(invoiceId)
      
      if (!arError && arInvoice) {
        // It's an AR invoice
        const document = {
          doc_id: arInvoice.id,
          direction: 'ar' as const,
          doc_kind: 'invoice' as const,
          doc_number: arInvoice.invoice_number,
          doc_date: arInvoice.invoice_date,
          currency_code: arInvoice.currency_code,
          subtotal_amount: arInvoice.subtotal_amount,
          vat_amount: arInvoice.vat_amount,
          total_amount: arInvoice.total_amount,
          status: arInvoice.status,
          from_team_id: arInvoice.issuer_team_id,
          from_team_name: arInvoice.issuer_team_name,
          to_team_id: arInvoice.payer_team_id,
          to_team_name: arInvoice.payer_team_name,
          balance_due: arInvoice.balance_due,
          projects_text: arInvoice.projects_text,
          created_at: arInvoice.created_at,
          updated_at: arInvoice.updated_at
        }
        
        onSuccess(document)
        onClose()
        return
      }
      
      // Try fetching as AP invoice (received_supplier_invoices)
      const { data: apInvoice, error: apError } = await getSupplierInvoiceDetails(invoiceId)
      
      if (!apError && apInvoice) {
        // It's an AP invoice
        const document = {
          doc_id: apInvoice.id,
          direction: 'ap' as const,
          doc_kind: 'invoice' as const,
          doc_number: apInvoice.invoice_number,
          doc_date: apInvoice.invoice_date,
          currency_code: apInvoice.currency_code,
          subtotal_amount: apInvoice.subtotal_amount,
          vat_amount: apInvoice.vat_amount,
          total_amount: apInvoice.total_amount,
          status: apInvoice.status,
          from_team_id: apInvoice.issuer_team_id,
          from_team_name: apInvoice.issuer_team_name,
          to_team_id: apInvoice.payer_team_id,
          to_team_name: apInvoice.payer_team_name,
          balance_due: apInvoice.balance_due || apInvoice.total_amount, // AP invoices might not have balance_due
          projects_text: apInvoice.projects_text || '',
          created_at: apInvoice.created_at,
          updated_at: apInvoice.updated_at
        }
        
        onSuccess(document)
        onClose()
        return
      }
      
      // If both failed, throw the AR error
      throw arError || apError || new Error('Invoice not found')
    } catch (error) {
      console.error('Failed to fetch invoice for optimistic update:', error)
      // Fallback to just passing the ID
      onSuccess({ doc_id: invoiceId })
      onClose()
    }
  }

  // Handle proceed to order selection
  const handleProceedToOrders = (invoiceId: number, formData?: any) => {
    if (invoiceId === 0) {
      // This means we haven't created the invoice yet, just proceeding to order selection
      setCreatedInvoiceId(null)
      setInvoiceFormData(formData)
      
      // Determine AR/AP based on the selected teams
      if (formData?.issuer_team_id && formData?.payer_team_id && userTeams.length > 0) {
        const userTeamIds = userTeams.map(team => team.team_id)
        const isUserIssuer = userTeamIds.includes(formData.issuer_team_id)
        const isUserPayer = userTeamIds.includes(formData.payer_team_id)
        
        // If user's team is the issuer, it's AR (Accounts Receivable) - user is issuing to a client
        // If user's team is the payer, it's AP (Accounts Payable) - user is paying a supplier
        const newIsAR = isUserIssuer
        const newIsAP = isUserPayer
        
        console.log('🔍 AR/AP Detection:', {
          issuerTeamId: formData.issuer_team_id,
          payerTeamId: formData.payer_team_id,
          userTeamIds,
          isUserIssuer,
          isUserPayer,
          isAR: newIsAR,
          isAP: newIsAP,
          finalDecision: newIsAR ? 'AR (Client Invoice)' : newIsAP ? 'AP (Supplier Invoice)' : 'Unknown',
          dataSource: newIsAR ? 'v_production_orders_list' : 'v_invoice_orders_list'
        })
        
        // Set isAR based on whether user is the issuer
        // If user is payer (not issuer), then isAR = false, which will route to SupplierInvoiceCreateModal
        setIsAR(newIsAR)
      }
      
      setIsOrderSelectionOpen(true)
    } else {
      // Invoice was already created (standalone case)
      setCreatedInvoiceId(invoiceId)
      setInvoiceFormData(null)
      setIsOrderSelectionOpen(true)
    }
  }

  // Handle order selection completion
  const handleOrdersSelected = async (orders: InvoiceOrder[], allocations?: Array<{ order_id: number; amount: number }>) => {
    if (!invoiceFormData || orders.length === 0) {
      toast({
        title: 'Error',
        description: 'Missing invoice data or no orders selected',
        variant: 'destructive'
      })
      return
    }

    setIsCreatingInvoice(true)
    try {
      let invoiceId: number
      
      if (isAR) {
        // AR Invoice: Create client invoice with invoice orders
        const subtotalOverrides = allocations ? 
          allocations.reduce((acc, alloc) => {
            acc[alloc.order_id.toString()] = alloc.amount
            return acc
          }, {} as { [key: string]: number }) : null

        const payload = {
          p_invoice_order_ids: orders.map(order => order.id),
          p_subtotal_overrides: subtotalOverrides,
          p_invoice_number: invoiceFormData.invoice_number,
          p_external_invoice_id: invoiceFormData.external_invoice_id || null,
          p_invoice_date: invoiceFormData.invoice_date || null,
          p_pdf_path: null,
          p_notes: invoiceFormData.notes || null,
          p_header_subtotal: invoiceFormData.header_subtotal || null,
          p_header_vat: invoiceFormData.header_vat || null,
          p_header_total: invoiceFormData.header_total || null
        }

        const { data, error } = await createAndIssueInvoiceRPC(payload)
        if (error) throw error
        invoiceId = data!
      } else {
        // AP Invoice: Create supplier invoice with production order allocations
        const supabase = createClientComponentClient()
        
        // Prepare allocations for the RPC
        const rpcAllocations = allocations?.map(alloc => ({
          production_order_id: alloc.order_id,
          amount_subtotal_allocated: alloc.amount
        })) || []
        
        // Calculate totals from allocations
        const subtotal = allocations?.reduce((sum, alloc) => sum + alloc.amount, 0) || 0
        const vat = subtotal * 0.23 // Default VAT rate, should ideally come from form
        const total = subtotal + vat
        
        console.log('🔍 Creating AP invoice with allocations:', {
          issuer_team_id: invoiceFormData.issuer_team_id,
          payer_team_id: invoiceFormData.payer_team_id,
          invoice_number: invoiceFormData.invoice_number,
          subtotal,
          vat,
          total,
          allocations: rpcAllocations
        })
        
        const { data, error } = await supabase.rpc('create_received_invoice_with_allocations', {
          p_issuer_team_id: invoiceFormData.issuer_team_id,
          p_payer_team_id: invoiceFormData.payer_team_id,
          p_invoice_number: invoiceFormData.invoice_number,
          p_invoice_date: invoiceFormData.invoice_date || null,
          p_currency_code: invoiceFormData.currency_code || 'EUR',
          p_subtotal_amount: subtotal,
          p_vat_amount: vat,
          p_total_amount: total,
          p_status: 'received',
          p_pdf_path: null,
          p_notes: invoiceFormData.notes || null,
          p_allocations: rpcAllocations
        })
        
        console.log('🔍 RPC response:', { data, error })
        
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
      }

      const totalAllocated = allocations?.reduce((sum, alloc) => sum + alloc.amount, 0) || 0
      
      // Validate invoiceId
      if (!invoiceId || typeof invoiceId !== 'number') {
        throw new Error(`Invalid invoice ID returned: ${invoiceId} (type: ${typeof invoiceId})`)
      }
      
      toast({
        title: 'Success',
        description: `${isAR ? 'AR' : 'AP'} invoice created with ${orders.length} order allocation${orders.length !== 1 ? 's' : ''} (Total: ${totalAllocated.toFixed(2)})`
      })

      // Fetch the full document object for optimistic updates
      try {
        let invoice: any
        
        console.log('🔍 Fetching invoice details for ID:', invoiceId, 'isAR:', isAR)
        
        if (isAR) {
          // Fetch AR invoice
          const { data, error } = await fetchIssuedInvoice(invoiceId)
          if (error) throw error
          invoice = data
        } else {
          // Fetch AP invoice
          const { data, error } = await getSupplierInvoiceDetails(invoiceId)
          console.log('🔍 getSupplierInvoiceDetails response:', { data, error })
          if (error) throw error
          invoice = data
        }
        
        console.log('🔍 Fetched invoice data:', invoice)
        
        // Convert invoice to document format for the documents view
        const document = {
          doc_id: invoice.id,
          direction: isAR ? 'ar' as const : 'ap' as const,
          doc_kind: 'invoice' as const,
          doc_number: invoice.invoice_number,
          doc_date: invoice.invoice_date,
          currency_code: invoice.currency_code,
          subtotal_amount: invoice.subtotal_amount,
          vat_amount: invoice.vat_amount,
          total_amount: invoice.total_amount,
          status: invoice.status,
          // For AR: issuer (from) → payer (to)
          // For AP: supplier (from) → payer (to)
          from_team_id: isAR ? invoice.issuer_team_id : invoice.supplier_team_id,
          from_team_name: isAR ? invoice.issuer_team_name : invoice.supplier_team_name,
          to_team_id: invoice.payer_team_id,
          to_team_name: invoice.payer_team_name || invoice.agency_team_name || '', // AP invoices might use agency_team_name
          balance_due: invoice.balance_due || invoice.total_amount,
          projects_text: invoice.projects_text || '',
          created_at: invoice.created_at,
          updated_at: invoice.updated_at
        }
        
        console.log('🔍 Constructed document for cache:', document)
        
        setIsOrderSelectionOpen(false)
        onSuccess(document)
        onClose()
      } catch (fetchError) {
        console.error('Failed to fetch invoice for optimistic update:', fetchError)
        // Fallback to just passing the ID with minimal document data
        setIsOrderSelectionOpen(false)
        onSuccess({ 
          doc_id: invoiceId,
          direction: isAR ? 'ar' : 'ap',
          doc_kind: 'invoice',
          doc_number: invoiceFormData.invoice_number,
          doc_date: invoiceFormData.invoice_date,
          status: isAR ? 'issued' : 'received',
          currency_code: invoiceFormData.currency_code,
          subtotal_amount: parseFloat(invoiceFormData.header_subtotal || '0'),
          vat_amount: parseFloat(invoiceFormData.header_vat || '0'),
          total_amount: parseFloat(invoiceFormData.header_total || '0'),
          from_team_id: isAR ? invoiceFormData.issuer_team_id : invoiceFormData.issuer_team_id, // supplier for AP
          from_team_name: '', // Will be filled by cache or next query
          to_team_id: invoiceFormData.payer_team_id,
          to_team_name: '', // Will be filled by cache or next query
          balance_due: parseFloat(invoiceFormData.header_total || '0'),
          projects_text: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        onClose()
      }
    } catch (error: any) {
      console.error('Error creating invoice with allocations:', error)
      
      let errorMessage = 'Failed to create invoice with allocations'
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
      setIsCreatingInvoice(false)
    }
  }

  // Handle going back from order selection to invoice details
  const handleBackToInvoiceDetails = () => {
    setIsOrderSelectionOpen(false)
    // Keep the invoice form data to preserve user input
  }

  // Handle closing any modal and reset state
  const handleCloseModals = () => {
    setIsOrderSelectionOpen(false)
    setCreatedInvoiceId(null)
    setInvoiceFormData(null)
    onClose()
  }

  // Show loading state while determining AR/AP
  if (isAR === null) {
    return null
  }

  // Prepare initial data from context if provided
  const prepareInitialData = () => {
    if (fromContext) {
      return {
        issuer_team_id: fromContext.issuerTeamId,
        issuer_team_name: fromContext.issuerTeamName,
        payer_team_id: fromContext.payerTeamId,
        payer_team_name: fromContext.payerTeamName,
        header_subtotal: fromContext.subtotalAmount?.toString() || '',
        currency_code: fromContext.currencyCode,
        orderId: fromContext.orderId,
        orderSubtotal: fromContext.orderSubtotal
      }
    }
    return invoiceFormData || undefined
  }

  // Always use CreateInvoiceDetailsModal which now handles AR/AP detection internally
  console.log('🔵 DEBUG: Opening CreateInvoiceDetailsModal (handles both AR and AP)')
  return (
    <>
      <CreateInvoiceDetailsModal
        isOpen={isOpen && !isOrderSelectionOpen}
        onClose={handleCloseModals}
        onInvoiceCreated={handleInvoiceCreated}
        onProceedToOrders={handleProceedToOrders}
        initialData={prepareInitialData()}
      />
      
      {/* Order Selection Modal */}
      <InvoiceOrderSelectionModal
        isOpen={isOrderSelectionOpen}
        onClose={handleCloseModals}
        onBack={handleBackToInvoiceDetails}
        onOrdersSelected={handleOrdersSelected}
        invoiceId={createdInvoiceId || undefined}
        payerTeamId={invoiceFormData?.payer_team_id || fromContext?.payerTeamId}
        issuerTeamId={invoiceFormData?.issuer_team_id || fromContext?.issuerTeamId}
        isAR={isAR}
        isCreatingInvoice={isCreatingInvoice}
        preselectedOrderId={fromContext?.orderId}
        preselectedOrderAmount={fromContext?.orderSubtotal}
      />
    </>
  )
}
