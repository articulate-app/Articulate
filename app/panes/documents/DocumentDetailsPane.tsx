"use client"

import React, { useState, useEffect } from 'react'
import { X, ArrowLeft, MoreHorizontal, Copy, Plus, Edit, Trash2, AlertTriangle, FileText } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu'
import { formatDocumentType } from '../../lib/services/documents'
import type { DocumentRow, DocumentPaneType } from '../../lib/types/documents'

// Import existing detail components
import IssuedInvoiceDetail from '../../components/billing/IssuedInvoiceDetail'
import { SupplierInvoiceDetailsPane } from '../../components/expenses/SupplierInvoiceDetailsPane'
import { CreditNoteDetailsPane } from '../../components/credit-notes/CreditNoteDetailsPane'
import { InvoiceOrderLinesDrawer } from '../../components/billing/InvoiceOrderLinesDrawer'
import { ProductionOrderDetailsPane } from '../../screens/expenses/ProductionOrderDetailsPane'
import { PaymentDetailsPane } from '../../components/payments/PaymentDetailsPane'
import { EditCreditNoteModal } from '../../components/billing/EditCreditNoteModal'
import { PaymentCreateModal } from '../../components/payments/PaymentCreateModal'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog'
import { deletePayment } from '../../lib/payments'
import { deleteSupplierPayment } from '../../lib/services/expenses'
import { deleteCreditNote } from '../../lib/creditNotes'
import { removeInvoiceFromAllCaches } from '../../components/billing/invoice-cache-utils'
import { removeCreditNoteFromCaches } from '../../components/credit-notes/credit-note-cache-utils'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '../../components/ui/use-toast'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface DocumentDetailsPaneProps {
  document: DocumentRow
  onClose: () => void
  onDocumentUpdate: (document: DocumentRow) => void
  onDocumentDelete?: (documentId: number, docKind?: string) => void
  onDocumentCreate?: (document: DocumentRow) => void
  menuAction?: string | null
  onMenuActionHandled?: () => void
  onMenuAction?: (action: string) => void
  onRelatedDocumentSelect?: (document: any, type: string) => void
}

const formatCurrency = (amount: number, currencyCode: string): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function DocumentDetailsPane({ document, onClose, onDocumentUpdate, onDocumentDelete, onDocumentCreate, menuAction, onMenuActionHandled, onMenuAction, onRelatedDocumentSelect }: DocumentDetailsPaneProps) {
  const queryClient = useQueryClient()
  const supabase = createClientComponentClient()
  
  // State for menu actions and modals
  const [menuActionState, setMenuActionState] = useState<string | null>(null)
  
  // State for credit note functionality
  const [isEditCreditNoteOpen, setIsEditCreditNoteOpen] = useState(false)
  const [isEditingCreditNote, setIsEditingCreditNote] = useState(false)
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  
  // State for payment functionality
  const [isEditPaymentOpen, setIsEditPaymentOpen] = useState(false)
  const [isSelectInvoiceOpen, setIsSelectInvoiceOpen] = useState(false)
  const [showDeletePaymentConfirmation, setShowDeletePaymentConfirmation] = useState(false)
  
  // State for supplier payment functionality
  const [showDeleteSupplierPaymentConfirmation, setShowDeleteSupplierPaymentConfirmation] = useState(false)
  
  // State for invoice deletion functionality
  const [showDeleteInvoiceConfirmation, setShowDeleteInvoiceConfirmation] = useState(false)
  
  // Handle invoice updates for optimistic UI
  const handleInvoiceUpdate = (updatedInvoice: any) => {
    // Convert the updated invoice to document format
    const updatedDocument = {
      doc_id: updatedInvoice.id,
      direction: 'ap' as const,
      doc_kind: 'invoice' as const,
      doc_number: updatedInvoice.invoice_number,
      doc_date: updatedInvoice.invoice_date,
      currency_code: updatedInvoice.currency_code,
      subtotal_amount: updatedInvoice.subtotal_amount,
      vat_amount: updatedInvoice.vat_amount,
      total_amount: updatedInvoice.total_amount,
      status: updatedInvoice.status,
      from_team_id: updatedInvoice.issuer_team_id,
      from_team_name: updatedInvoice.supplier_team_name,
      to_team_id: updatedInvoice.payer_team_id,
      to_team_name: updatedInvoice.payer_team_name,
      balance_due: updatedInvoice.balance_due,
      projects_text: updatedInvoice.projects_text,
      created_at: updatedInvoice.created_at,
      updated_at: updatedInvoice.updated_at
    }
    onDocumentUpdate(updatedDocument)
  }
  
  // Handle menu actions from parent
  useEffect(() => {
    if (menuAction) {
      setMenuActionState(menuAction)
      onMenuActionHandled?.()
      
      // Handle credit note specific actions
      if (document.direction === 'ar' && document.doc_kind === 'credit_note') {
        switch (menuAction) {
          case 'edit-credit-note':
            setIsEditCreditNoteOpen(true)
            break
          case 'void-credit-note':
            // Void functionality is handled in CreditNoteDetailsPane
            break
          case 'delete-credit-note':
            setShowDeleteConfirmation(true)
            break
        }
      }
      
              // Handle payment specific actions
              if (document.direction === 'ar' && document.doc_kind === 'payment') {
                switch (menuAction) {
                  case 'edit-payment':
                    setIsEditPaymentOpen(true)
                    break
                  case 'select-invoice':
                    setIsSelectInvoiceOpen(true)
                    break
                  case 'delete-payment':
                    setShowDeletePaymentConfirmation(true)
                    break
                }
              }
              
              // Handle supplier payment specific actions
              if (document.direction === 'ap' && document.doc_kind === 'payment') {
                switch (menuAction) {
                  case 'edit-payment':
                    setIsEditPaymentOpen(true)
                    break
                  case 'delete-payment':
                    setShowDeleteSupplierPaymentConfirmation(true)
                    break
                }
              }
              
              // Handle invoice deletion actions
              if ((document.direction === 'ar' && document.doc_kind === 'invoice') || 
                  (document.direction === 'ap' && document.doc_kind === 'invoice')) {
                switch (menuAction) {
                  case 'delete-invoice':
                    setShowDeleteInvoiceConfirmation(true)
                    break
                }
              }
    }
  }, [menuAction, onMenuActionHandled, document])
  const [isExpanded, setIsExpanded] = useState(false)

  // Determine the pane type based on document direction and kind
  const getPaneType = (): DocumentPaneType => {
    const key = `${document.direction}:${document.doc_kind}`
    switch (key) {
      case 'ar:invoice':
        return 'AR_INVOICE'
      case 'ap:invoice':
        return 'AP_INVOICE'
      case 'ar:credit_note':
        return 'AR_CREDIT_NOTE'
      case 'ap:credit_note':
        return 'AP_CREDIT_NOTE'
      case 'ar:order':
        return 'AR_ORDER'
      case 'ap:order':
        return 'AP_ORDER'
      case 'ar:payment':
        return 'AR_PAYMENT'
      case 'ap:payment':
        return 'AP_PAYMENT'
      default:
        return 'AR_INVOICE' // fallback
    }
  }

  const paneType = getPaneType()
  const documentType = formatDocumentType(document.direction, document.doc_kind)

  // Handle document updates from child components
  const handleDocumentUpdate = (updatedData: any) => {
    const updatedDocument: DocumentRow = {
      ...document,
      ...updatedData,
    }
    onDocumentUpdate(updatedDocument)
  }

  // Handler specifically for payment updates - maps payment fields to document fields
  const handlePaymentUpdate = (updatedPayment: any) => {
    console.log('[DocumentDetailsPane] handlePaymentUpdate called with:', {
      updatedPayment,
      currentDocument: document
    });
    
    const updatedDocument: DocumentRow = {
      ...document,
      doc_date: updatedPayment.payment_date || document.doc_date,
      total_amount: updatedPayment.payment_amount || document.total_amount,
      currency_code: updatedPayment.payment_currency || document.currency_code,
      status: updatedPayment.status || document.status,
      // Map payment team fields to document team fields
      from_team_name: updatedPayment.payer_team_name || document.from_team_name,
      to_team_name: updatedPayment.paid_to_team_name || document.to_team_name,
      from_team_id: updatedPayment.payer_team_id || document.from_team_id,
      to_team_id: updatedPayment.paid_to_team_id || document.to_team_id,
      updated_at: updatedPayment.updated_at || document.updated_at,
    }
    
    console.log('[DocumentDetailsPane] Calling onDocumentUpdate with:', updatedDocument);
    onDocumentUpdate(updatedDocument)
  }

  // Credit note handler functions
  const handleEditCreditNote = () => {
    setIsEditCreditNoteOpen(true)
  }

  const handleCancelEditCreditNote = () => {
    setIsEditingCreditNote(false)
  }

  const handleSaveCreditNote = () => {
    setIsEditingCreditNote(false)
  }

  const handleVoidCreditNote = () => {
    // Void functionality is handled in CreditNoteDetailsPane
  }


  // Payment handler functions
  const handleEditPayment = () => {
    setIsEditPaymentOpen(true)
  }

  const handleSelectInvoice = () => {
    setIsSelectInvoiceOpen(true)
  }

  const handleDeletePayment = async () => {
    try {
      // Optimistically remove from caches first
      onDocumentDelete?.(document.doc_id, document.doc_kind)
      
      // Make the API call to delete the payment
      const { error } = await deletePayment(document.doc_id)
      
      if (error) {
        throw error
      }
      
      // Show success message
      toast({
        title: 'Success',
        description: 'Payment deleted successfully',
      })
      
      // Close the confirmation dialog
      setShowDeletePaymentConfirmation(false)
      
    } catch (error: any) {
      console.error('Error deleting payment:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete payment. Please try again.',
        variant: 'destructive',
      })
      
      // TODO: Revert optimistic update on error
      // This would require re-fetching the data or implementing a rollback mechanism
    }
  }

  const handleDeleteSupplierPayment = async () => {
    try {
      // Optimistically remove from caches first
      onDocumentDelete?.(document.doc_id, document.doc_kind)
      
      // Make the API call to delete the supplier payment
      await deleteSupplierPayment(document.doc_id)
      
      // Show success message
      toast({
        title: 'Success',
        description: 'Supplier payment deleted successfully',
      })
      
      // Close the confirmation dialog
      setShowDeleteSupplierPaymentConfirmation(false)
      
    } catch (error: any) {
      console.error('Error deleting supplier payment:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete supplier payment. Please try again.',
        variant: 'destructive',
      })
      
      // TODO: Revert optimistic update on error
      // This would require re-fetching the data or implementing a rollback mechanism
    }
  }

  const handleDeleteInvoice = async () => {
    if (!document?.doc_id) {
      toast({
        title: 'Error',
        description: 'No invoice ID provided',
        variant: 'destructive'
      })
      return
    }

    try {
      // Optimistically remove from caches first
      onDocumentDelete?.(document.doc_id, document.doc_kind)
      
      // Make the API call to delete the invoice
      const { error } = await supabase
        .from(document.direction === 'ar' ? 'issued_client_invoices' : 'received_supplier_invoices')
        .delete()
        .eq('id', document.doc_id)
      
      if (error) throw error
      
      // Show success message
      toast({
        title: 'Success',
        description: 'Invoice deleted successfully',
      })
      
      // Close the confirmation dialog
      setShowDeleteInvoiceConfirmation(false)
      
    } catch (error: any) {
      console.error('Error deleting invoice:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete invoice. Please try again.',
        variant: 'destructive',
      })
      
      // TODO: Revert optimistic update on error
    }
  }

  const handleDeleteCreditNote = async () => {
    try {
      // Optimistically remove from caches first
      onDocumentDelete?.(document.doc_id, document.doc_kind)
      
      // Make the API call to delete the credit note
      const { error } = await deleteCreditNote(document.doc_id)
      
      if (error) throw error
      
      // Show success message
      toast({
        title: 'Success',
        description: 'Credit note deleted successfully',
      })
      
      // Close the confirmation dialog
      setShowDeleteConfirmation(false)
      
    } catch (error: any) {
      console.error('Error deleting credit note:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete credit note. Please try again.',
        variant: 'destructive',
      })
      
      // TODO: Revert optimistic update on error
    }
  }

  // Helper function to map DocumentRow to InvoiceOrder
  const mapDocumentToInvoiceOrder = (doc: DocumentRow) => {
    return {
      id: doc.doc_id,
      project_id: 0, // Default value since not available in DocumentRow
      project_name: doc.projects_text || 'Unknown Project',
      project_color: undefined,
      billing_period_start: doc.doc_date,
      billing_period_end: doc.doc_date,
      issued_date: null,
      subtotal: doc.subtotal_amount,
      subtotal_amount: doc.subtotal_amount,
      vat_amount: doc.vat_amount,
      total_amount: doc.total_amount,
      currency_code: doc.currency_code,
      status: doc.status as 'draft' | 'sent' | 'cancelled' | 'paid',
      is_issued: false, // Default value
      lines_count: 0, // Default value
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    }
  }

  // Render the appropriate detail component based on pane type
  const renderDetailComponent = () => {
    const commonProps = {
      onClose,
      onDocumentUpdate: handleDocumentUpdate,
      menuAction: menuActionState,
      onMenuActionHandled: () => setMenuActionState(null),
      onRelatedDocumentSelect,
    }

    switch (paneType) {
      case 'AR_INVOICE':
        // Transform document to match invoice structure
        const invoiceData = {
          ...document,
          id: document.doc_id,
          invoice_number: document.doc_number,
          invoice_date: document.doc_date,
          currency_code: document.currency_code,
          subtotal_amount: document.subtotal_amount,
          vat_amount: document.vat_amount,
          total_amount: document.total_amount,
          balance_due: document.balance_due,
          status: document.status,
          issuer_team_id: document.from_team_id,
          issuer_team_name: document.from_team_name,
          payer_team_id: document.to_team_id,
          payer_team_name: document.to_team_name,
          projects_text: document.projects_text,
          created_at: document.created_at,
          updated_at: document.updated_at,
        }
        
        return (
          <IssuedInvoiceDetail
            id={document.doc_id}
            isPane={true}
            initialInvoice={invoiceData}
            onTaskSelect={() => {}}
            selectedTaskId={null}
            onInvoiceOrderSelect={() => {}}
            onDocumentUpdate={handleDocumentUpdate}
            menuAction={commonProps.menuAction}
            onMenuActionHandled={commonProps.onMenuActionHandled}
            onRelatedDocumentSelect={onRelatedDocumentSelect}
          />
        )
      
      case 'AP_INVOICE':
        // Transform DocumentRow to SupplierInvoice format
        const supplierInvoiceData = {
          id: document.doc_id,
          invoice_number: document.doc_number,
          invoice_date: document.doc_date,
          status: document.status,
          currency_code: document.currency_code,
          subtotal_amount: document.subtotal_amount,
          vat_amount: document.vat_amount,
          total_amount: document.total_amount,
          amount_paid: 0, // Will be loaded from full query
          credited_amount: 0, // Will be loaded from full query
          balance_due: document.balance_due || document.total_amount,
          supplier_team_id: document.from_team_id,
          supplier_team_name: document.from_team_name,
          issuer_team_id: document.from_team_id, // For EditableSupplierInvoiceFields
          payer_team_id: document.to_team_id,
          payer_team_name: document.to_team_name,
          pdf_path: null, // Will be loaded from full query
          projects_text: document.projects_text, // From v_documents_min
          created_at: document.created_at,
          updated_at: document.updated_at
        }
        
        return (
          <SupplierInvoiceDetailsPane
            invoiceId={document.doc_id}
            initialInvoice={supplierInvoiceData}
            onInvoiceUpdate={handleInvoiceUpdate}
            {...commonProps}
            onRelatedDocumentSelect={onRelatedDocumentSelect}
          />
        )
      
      case 'AR_CREDIT_NOTE':
        return (
          <CreditNoteDetailsPane
            creditNoteId={document.doc_id}
            initialCreditNote={document}
            direction="ar"
            onCreditNoteUpdate={handleDocumentUpdate}
            onCreditNoteDelete={() => {}}
            onEdit={handleEditCreditNote}
            onVoid={handleVoidCreditNote}
            onDelete={handleDeleteCreditNote}
            isEditing={isEditingCreditNote}
            onSave={handleSaveCreditNote}
            onCancel={handleCancelEditCreditNote}
            {...commonProps}
          />
        )
      
      case 'AP_CREDIT_NOTE':
        return (
          <CreditNoteDetailsPane
            creditNoteId={document.doc_id}
            initialCreditNote={document}
            direction="ap"
            onCreditNoteUpdate={handleDocumentUpdate}
            onCreditNoteDelete={() => {}}
            onEdit={handleEditCreditNote}
            onVoid={handleVoidCreditNote}
            onDelete={handleDeleteCreditNote}
            isEditing={isEditingCreditNote}
            onSave={handleSaveCreditNote}
            onCancel={handleCancelEditCreditNote}
            {...commonProps}
          />
        )
      
      case 'AR_ORDER':
        return (
          <InvoiceOrderLinesDrawer
            order={mapDocumentToInvoiceOrder(document)}
            onClose={onClose}
            onOpenIssuedInvoice={() => {}}
            onExpandInvoiceLines={() => {}}
            hasOpenInvoiceDetail={false}
            hasOpenTaskDetails={false}
            onTaskClick={() => {}}
          />
        )
      
      case 'AP_ORDER':
        return (
          <ProductionOrderDetailsPane
            productionOrderId={document.doc_id}
            initialProductionOrder={document}
            {...commonProps}
          />
        )
      
      case 'AR_PAYMENT':
        // Transform document to match PaymentSummary structure
        const arPaymentData = {
          payment_id: document.doc_id,
          payer_team_id: document.from_team_id,
          payer_team_name: document.from_team_name,
          paid_to_team_id: document.to_team_id,
          paid_to_team_name: document.to_team_name,
          payment_date: document.doc_date,
          payment_amount: document.total_amount,
          payment_currency: document.currency_code,
          status: document.status,
          amount_allocated: 0,
          unallocated_amount: document.total_amount,
          is_overallocated: false,
          from_team_id: document.from_team_id,
          from_team_name: document.from_team_name,
          to_team_id: document.to_team_id,
          to_team_name: document.to_team_name,
          created_at: document.created_at,
          updated_at: document.updated_at,
        }
        
        return (
          <PaymentDetailsPane
            paymentId={document.doc_id}
            initialPayment={arPaymentData}
            direction="ar"
            onPaymentUpdate={handlePaymentUpdate}
            onPaymentDelete={() => {}}
            {...commonProps}
            onRelatedDocumentSelect={onRelatedDocumentSelect}
          />
        )
      
      case 'AP_PAYMENT':
        // Transform document to match payment structure
        const apPaymentData = {
          payment_id: document.doc_id,
          payer_team_id: document.from_team_id,
          payer_team_name: document.from_team_name,
          paid_to_team_id: document.to_team_id,
          paid_to_team_name: document.to_team_name,
          payment_date: document.doc_date,
          payment_amount: document.total_amount,
          payment_currency: document.currency_code,
          status: document.status,
          amount_allocated: 0,
          unallocated_amount: document.total_amount,
          is_overallocated: false,
          from_team_id: document.from_team_id,
          from_team_name: document.from_team_name,
          to_team_id: document.to_team_id,
          to_team_name: document.to_team_name,
          created_at: document.created_at,
          updated_at: document.updated_at,
        }
        
        return (
          <PaymentDetailsPane
            paymentId={document.doc_id}
            initialPayment={apPaymentData}
            direction="ap"
            onPaymentUpdate={handlePaymentUpdate}
            onPaymentDelete={() => {}}
            {...commonProps}
            onRelatedDocumentSelect={onRelatedDocumentSelect}
          />
        )
      
      default:
        return (
          <div className="p-6">
            <div className="text-center text-gray-500">
              <p>Document type not supported yet</p>
              <p className="text-sm mt-2">{documentType}</p>
            </div>
          </div>
        )
    }
  }

  const handleCopyLink = async () => {
    try {
      const url = `${window.location.origin}/documents?docId=${document.doc_id}&direction=${document.direction}&docKind=${document.doc_kind}`
      await navigator.clipboard.writeText(url)
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy link:', err)
    }
  }

  const renderMenuActions = () => {
    const key = `${document.direction}:${document.doc_kind}`;
    
    switch (key) {
      case 'ar:invoice':
        return (
          <>
            <DropdownMenuItem onClick={handleCopyLink}>
              <Copy className="w-4 h-4 mr-2" />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMenuAction?.('add-invoice-order')}>
              <Plus className="w-4 h-4 mr-2" />
              Add invoice order
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMenuAction?.('add-payment')}>
              <Plus className="w-4 h-4 mr-2" />
              Add payment
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMenuAction?.('upload-invoice')}>
              <Plus className="w-4 h-4 mr-2" />
              Upload invoice
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onMenuAction?.('delete-invoice')}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete invoice
            </DropdownMenuItem>
          </>
        )
      
      case 'ap:invoice':
        return (
          <>
            <DropdownMenuItem onClick={handleCopyLink}>
              <Copy className="w-4 h-4 mr-2" />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMenuAction?.('add-payment')}>
              <Plus className="w-4 h-4 mr-2" />
              Add payment
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMenuAction?.('add-credit-note')}>
              <Plus className="w-4 h-4 mr-2" />
              Add credit note
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMenuAction?.('edit-invoice')}>
              <Edit className="w-4 h-4 mr-2" />
              Edit invoice
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onMenuAction?.('delete-invoice')}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete invoice
            </DropdownMenuItem>
          </>
        )
      
      case 'ar:credit_note':
        return (
          <>
            <DropdownMenuItem onClick={handleCopyLink}>
              <Copy className="w-4 h-4 mr-2" />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMenuAction?.('edit-credit-note')}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMenuAction?.('void-credit-note')}>
              <AlertTriangle className="w-4 h-4 mr-2" />
              Void
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onMenuAction?.('delete-credit-note')}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </>
        )
      
      case 'ap:credit_note':
        return (
          <>
            <DropdownMenuItem onClick={() => onMenuAction?.('edit-credit-note')}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onMenuAction?.('delete-credit-note')}
              className="text-red-600 focus:text-red-600"
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </>
        )
      
      case 'ar:order':
        return (
          <>
            <DropdownMenuItem onClick={handleCopyLink}>
              <Copy className="w-4 h-4 mr-2" />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              const params = new URLSearchParams()
              params.set('ctx', 'order')
              params.set('id', document.doc_id.toString())
              params.set('focus', 'true')
              const url = `/billing/billable-tasks?${params.toString()}`
              window.location.href = url
            }}>
              <FileText className="w-4 h-4 mr-2" />
              See Billable Tasks
            </DropdownMenuItem>
          </>
        )
      
      case 'ar:payment':
        return (
          <>
            <DropdownMenuItem onClick={handleCopyLink}>
              <Copy className="w-4 h-4 mr-2" />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMenuAction?.('edit-payment')}>
              <Edit className="w-4 h-4 mr-2" />
              Edit Payment
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMenuAction?.('select-invoice')}>
              <Plus className="w-4 h-4 mr-2" />
              Select Invoice
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onMenuAction?.('delete-payment')}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Payment
            </DropdownMenuItem>
          </>
        )
      
      case 'ap:payment':
        return (
          <>
            <DropdownMenuItem onClick={() => onMenuAction?.('edit-payment')}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onMenuAction?.('delete-payment')}
              className="text-red-600 focus:text-red-600"
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </>
        )
      
      default:
        return (
          <DropdownMenuItem onClick={handleCopyLink}>
            <Copy className="w-4 h-4 mr-2" />
            Copy link
          </DropdownMenuItem>
        )
    }
  }

  return (
    <>
      <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 truncate">
            {formatDocumentType(document.direction, document.doc_kind)} #{document.doc_number}
          </h2>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {renderMenuActions()}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        {renderDetailComponent()}
      </div>

      {/* Credit Note Modals */}
      {document.direction === 'ar' && document.doc_kind === 'credit_note' && (
        <>
          {/* Edit Credit Note Modal */}
          <EditCreditNoteModal
            creditNote={document}
            isOpen={isEditCreditNoteOpen}
            onClose={() => setIsEditCreditNoteOpen(false)}
            onCreditNoteUpdated={handleDocumentUpdate}
          />

          {/* Delete Confirmation Dialog */}
          <Dialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Credit Note</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete this credit note? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDeleteConfirmation(false)}>
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={handleDeleteCreditNote}
                >
                  Delete Credit Note
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Payment Modals */}
      {document.direction === 'ar' && document.doc_kind === 'payment' && (
        <>
          {/* Edit Payment Modal */}
          <PaymentCreateModal
            isOpen={isEditPaymentOpen}
            onClose={() => setIsEditPaymentOpen(false)}
            onPaymentCreated={(paymentId, updatedPayment) => {
              setIsEditPaymentOpen(false)
              // If we have updated payment data, create an updated document
              if (updatedPayment) {
                const updatedDocument = {
                  ...document,
                  doc_date: updatedPayment.payment_date,
                  total_amount: updatedPayment.payment_amount,
                  currency_code: updatedPayment.payment_currency,
                  status: updatedPayment.status || document.status,
                  from_team_name: updatedPayment.payer_team_name || document.from_team_name,
                  to_team_name: updatedPayment.paid_to_team_name || document.to_team_name,
                  from_team_id: updatedPayment.payer_team_id || document.from_team_id,
                  to_team_id: updatedPayment.paid_to_team_id || document.to_team_id,
                  updated_at: updatedPayment.updated_at,
                }
                onDocumentUpdate(updatedDocument)
              } else {
                // Fallback to original document if no updated data
                onDocumentUpdate(document)
              }
            }}
            initialStep={1}
            editingPayment={{
              payment_id: document.doc_id,
              // Map v_documents_min fields correctly:
              // from_team_id -> payer_team_id
              // to_team_id -> paid_to_team_id
              payer_team_id: document.from_team_id,
              payer_team_name: document.from_team_name,
              paid_to_team_id: document.to_team_id,
              paid_to_team_name: document.to_team_name,
              payment_date: document.doc_date,
              payment_amount: document.total_amount,
              payment_currency: document.currency_code,
              method: 'Bank Transfer', // Default value since not available in DocumentRow
              status: document.status,
              external_ref: '', // Default value since not available in DocumentRow
              notes: '', // Default value since not available in DocumentRow
              amount_allocated: 0, // Default value since not available in DocumentRow
              unallocated_amount: document.total_amount, // Use total_amount as default
              is_overallocated: false, // Default value
              allocation_count: 0, // Default value
              created_at: document.created_at,
              updated_at: document.updated_at,
            }}
            sortConfig={{ field: 'payment_date', direction: 'desc' }}
          />

          {/* Select Invoice Modal (Allocation Modal) */}
          <PaymentCreateModal
            isOpen={isSelectInvoiceOpen}
            onClose={() => setIsSelectInvoiceOpen(false)}
            onPaymentCreated={(paymentId) => {
              setIsSelectInvoiceOpen(false)
              // Optimistically update the payment data
              // The modal should return the updated payment data
              // For now, we'll trigger a refresh
              onDocumentUpdate(document)
            }}
            initialStep={2}
            editingPayment={document}
            sortConfig={{ field: 'payment_date', direction: 'desc' }}
          />

          {/* Delete Payment Confirmation Dialog */}
          <Dialog open={showDeletePaymentConfirmation} onOpenChange={setShowDeletePaymentConfirmation}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Payment</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete this payment? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDeletePaymentConfirmation(false)}>
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={handleDeletePayment}
                >
                  Delete Payment
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Supplier Payment Modals */}
      {document.direction === 'ap' && document.doc_kind === 'payment' && (
        <>
          {/* Edit AP Payment Modal */}
          <PaymentCreateModal
            isOpen={isEditPaymentOpen}
            onClose={() => setIsEditPaymentOpen(false)}
            onPaymentCreated={(paymentId, updatedPayment) => {
              setIsEditPaymentOpen(false)
              // If we have updated payment data, create an updated document
              if (updatedPayment) {
                const updatedDocument = {
                  ...document,
                  doc_date: updatedPayment.payment_date,
                  total_amount: updatedPayment.payment_amount,
                  currency_code: updatedPayment.payment_currency,
                  status: updatedPayment.status || document.status,
                  from_team_name: updatedPayment.payer_team_name || document.from_team_name,
                  to_team_name: updatedPayment.paid_to_team_name || document.to_team_name,
                  from_team_id: updatedPayment.payer_team_id || document.from_team_id,
                  to_team_id: updatedPayment.paid_to_team_id || document.to_team_id,
                  updated_at: updatedPayment.updated_at,
                }
                onDocumentUpdate(updatedDocument)
              } else {
                // Fallback to original document if no updated data
                onDocumentUpdate(document)
              }
            }}
            initialStep={1}
            editingPayment={{
              payment_id: document.doc_id,
              // Map v_documents_min fields correctly:
              // from_team_id -> payer_team_id
              // to_team_id -> paid_to_team_id
              payer_team_id: document.from_team_id,
              payer_team_name: document.from_team_name,
              paid_to_team_id: document.to_team_id,
              paid_to_team_name: document.to_team_name,
              payment_date: document.doc_date,
              payment_amount: document.total_amount,
              payment_currency: document.currency_code,
              method: 'Bank Transfer', // Default value since not available in DocumentRow
              status: document.status,
              external_ref: '', // Default value since not available in DocumentRow
              notes: '', // Default value since not available in DocumentRow
              amount_allocated: 0, // Default value since not available in DocumentRow
              unallocated_amount: document.total_amount, // Use total_amount as default
              is_overallocated: false, // Default value
              allocation_count: 0, // Default value
              created_at: document.created_at,
              updated_at: document.updated_at,
            }}
            sortConfig={{ field: 'payment_date', direction: 'desc' }}
          />
        
          {/* Delete Supplier Payment Confirmation Dialog */}
          <Dialog open={showDeleteSupplierPaymentConfirmation} onOpenChange={setShowDeleteSupplierPaymentConfirmation}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Supplier Payment</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete this supplier payment? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDeleteSupplierPaymentConfirmation(false)}>
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={handleDeleteSupplierPayment}
                >
                  Delete Supplier Payment
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Invoice Delete Modal */}
      {((document.direction === 'ar' && document.doc_kind === 'invoice') || 
        (document.direction === 'ap' && document.doc_kind === 'invoice')) && (
        <>
          <Dialog open={showDeleteInvoiceConfirmation} onOpenChange={setShowDeleteInvoiceConfirmation}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Invoice</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete this invoice? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDeleteInvoiceConfirmation(false)}>
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={handleDeleteInvoice}
                >
                  Delete Invoice
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  )
}
