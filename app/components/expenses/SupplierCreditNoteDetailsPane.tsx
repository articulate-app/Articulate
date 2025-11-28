"use client"

import React, { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Edit, X, AlertTriangle, MoreHorizontal } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Badge } from '../ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { toast } from '../ui/use-toast'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { getSupplierCreditNoteDetails } from '../../lib/services/expenses'
import { EditableCreditNoteFields } from './EditableCreditNoteFields'

interface SupplierCreditNoteDetailsPaneProps {
  creditNoteId: number
  onClose: () => void
  onCreditNoteUpdate: (creditNote: any) => void
  initialCreditNote?: any
}

const formatCurrency = (amount: number, currencyCode: string | null = 'EUR') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode || 'EUR',
  }).format(amount)
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function SupplierCreditNoteDetailsPane({ 
  creditNoteId, 
  onClose, 
  onCreditNoteUpdate, 
  initialCreditNote 
}: SupplierCreditNoteDetailsPaneProps) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()
  const [localCreditNote, setLocalCreditNote] = useState(initialCreditNote || null)
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)

  const { data: creditNote, isLoading, error } = useQuery({
    queryKey: ['supplier-credit-note', creditNoteId],
    queryFn: async () => {
      const { data, error } = await getSupplierCreditNoteDetails(creditNoteId)
      if (error) throw new Error(error.message || 'Failed to load supplier credit note')
      return data!
    },
    enabled: !!creditNoteId,
    initialData: initialCreditNote,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  useEffect(() => {
    if (creditNote) {
      setLocalCreditNote(creditNote)
    }
  }, [creditNote])

  // Wrapper function to handle credit note updates
  const handleCreditNoteUpdate = (updatedCreditNote: any) => {
    // Update local state for optimistic UI
    setLocalCreditNote((prev: any) => ({ ...prev, ...updatedCreditNote }))
    
    // Call parent's onCreditNoteUpdate
    onCreditNoteUpdate(updatedCreditNote)
  }

  const handleSave = async () => {
    if (!localCreditNote) return

    try {
      const { error } = await supabase
        .from('received_credit_notes')
        .update({
          credit_number: localCreditNote.credit_number,
          credit_date: localCreditNote.credit_date,
          subtotal_amount: localCreditNote.subtotal_amount,
          vat_amount: localCreditNote.vat_amount,
          total_amount: localCreditNote.total_amount,
          status: localCreditNote.status,
          reason: localCreditNote.reason,
          notes: localCreditNote.notes,
        })
        .eq('id', creditNoteId)

      if (error) throw error

      toast({
        title: "Success",
        description: "Credit note updated successfully",
      })

      setIsEditing(false)
      onCreditNoteUpdate(localCreditNote)
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['supplier-credit-note', creditNoteId] })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update credit note",
        variant: "destructive",
      })
    }
  }

  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from('received_credit_notes')
        .delete()
        .eq('id', creditNoteId)

      if (error) throw error

      toast({
        title: "Success",
        description: "Credit note deleted successfully",
      })

      onClose()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete credit note",
        variant: "destructive",
      })
    }
  }

  if (isLoading && !localCreditNote) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-center text-red-500">
          <p>Error loading credit note</p>
          <p className="text-sm mt-2">{error.message}</p>
        </div>
      </div>
    )
  }

  if (!localCreditNote) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          <p>Credit note not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Supplier Credit Note #{localCreditNote.credit_number || localCreditNote.credit_note_id}
          </h3>
          <p className="text-sm text-gray-500">
            {formatDate(localCreditNote.credit_date)}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline">{localCreditNote.status}</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsEditing(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setShowDeleteConfirmation(true)}
                className="text-red-600"
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Associated Invoice Section */}
      {localCreditNote.invoice_number && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 mb-2">Associated Invoice</h4>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-sm text-blue-700">Invoice Number:</span>
              <span className="text-sm font-medium text-blue-900">{localCreditNote.invoice_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-blue-700">Invoice Date:</span>
              <span className="text-sm font-medium text-blue-900">{formatDate(localCreditNote.invoice_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-blue-700">Currency:</span>
              <span className="text-sm font-medium text-blue-900">{localCreditNote.currency_code}</span>
            </div>
          </div>
        </div>
      )}

      {/* Summary Card */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
        <div className="flex justify-between">
          <span className="text-sm text-gray-500">Subtotal:</span>
          <div className="flex-1 max-w-[200px]">
            {(() => {
              const editableFields = EditableCreditNoteFields({ creditNote: localCreditNote, onCreditNoteUpdate: handleCreditNoteUpdate, isAP: true, creditNoteId })
              return editableFields.subtotal
            })()}
          </div>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-gray-500">VAT:</span>
          <span className="text-sm font-medium">
            {formatCurrency(localCreditNote.vat_amount, localCreditNote.currency_code)}
          </span>
        </div>
        <div className="flex justify-between border-t pt-2">
          <span className="text-sm font-medium">Total:</span>
          <div className="flex-1 max-w-[200px]">
            {(() => {
              const editableFields = EditableCreditNoteFields({ creditNote: localCreditNote, onCreditNoteUpdate: handleCreditNoteUpdate, isAP: true, creditNoteId })
              return editableFields.total
            })()}
          </div>
        </div>
      </div>

      {/* Credit Note Details */}
      <div className="bg-white border rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Credit Note Details</h4>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500">Credit Number</span>
            <div className="flex-1 max-w-[200px]">
              {(() => {
                const editableFields = EditableCreditNoteFields({ creditNote: localCreditNote, onCreditNoteUpdate: handleCreditNoteUpdate, isAP: true, creditNoteId })
                return editableFields.creditNumber
              })()}
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500">Credit Date</span>
            <div className="flex-1 max-w-[200px]">
              {(() => {
                const editableFields = EditableCreditNoteFields({ creditNote: localCreditNote, onCreditNoteUpdate: handleCreditNoteUpdate, isAP: true, creditNoteId })
                return editableFields.creditDate
              })()}
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500">Reason</span>
            <div className="flex-1 max-w-[200px]">
              {(() => {
                const editableFields = EditableCreditNoteFields({ creditNote: localCreditNote, onCreditNoteUpdate: handleCreditNoteUpdate, isAP: true, creditNoteId })
                return editableFields.reason
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Details */}
      {isEditing ? (
        <div className="space-y-4">
          <div>
            <Label htmlFor="credit_number">Credit Number</Label>
            <Input
              id="credit_number"
              value={localCreditNote.credit_number || ''}
              onChange={(e) => setLocalCreditNote((prev: any) => ({ 
                ...prev, 
                credit_number: e.target.value 
              }))}
            />
          </div>
          <div>
            <Label htmlFor="credit_date">Credit Date</Label>
            <Input
              id="credit_date"
              type="date"
              value={localCreditNote.credit_date ? localCreditNote.credit_date.split('T')[0] : ''}
              onChange={(e) => setLocalCreditNote((prev: any) => ({ 
                ...prev, 
                credit_date: e.target.value 
              }))}
            />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Input
              id="status"
              value={localCreditNote.status || ''}
              onChange={(e) => setLocalCreditNote((prev: any) => ({ 
                ...prev, 
                status: e.target.value 
              }))}
            />
          </div>
          <div>
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              value={localCreditNote.reason || ''}
              onChange={(e) => setLocalCreditNote((prev: any) => ({ 
                ...prev, 
                reason: e.target.value 
              }))}
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={localCreditNote.notes || ''}
              onChange={(e) => setLocalCreditNote((prev: any) => ({ 
                ...prev, 
                notes: e.target.value 
              }))}
              rows={3}
            />
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <span className="text-sm text-gray-500">Currency:</span>
            <p className="text-sm font-medium">{localCreditNote.currency_code || 'EUR'}</p>
          </div>
          {localCreditNote.reason && (
            <div>
              <span className="text-sm text-gray-500">Reason:</span>
              <p className="text-sm font-medium">{localCreditNote.reason}</p>
            </div>
          )}
          {localCreditNote.notes && (
            <div>
              <span className="text-sm text-gray-500">Notes:</span>
              <p className="text-sm font-medium">{localCreditNote.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end space-x-2">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>

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
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

