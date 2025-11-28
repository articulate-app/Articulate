"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Search, FileText } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { toast } from '../ui/use-toast'

interface SupplierCreditNote {
  credit_note_id: number
  credit_number: string
  credit_date: string
  currency_code: string
  subtotal_amount: number
  vat_amount: number
  total_amount: number
  status: string
  reason: string
  invoice_number: string
  invoice_date: string
  unallocated_amount: number
}

interface AddExistingSupplierCreditNoteModalProps {
  invoiceId: number
  invoiceCurrency: string
  isOpen: boolean
  onClose: () => void
  onCreditNoteAdded: (creditNote?: any) => void
}

export function AddExistingSupplierCreditNoteModal({ 
  invoiceId, 
  invoiceCurrency, 
  isOpen, 
  onClose, 
  onCreditNoteAdded 
}: AddExistingSupplierCreditNoteModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCreditNote, setSelectedCreditNote] = useState<SupplierCreditNote | null>(null)
  const [allocationAmount, setAllocationAmount] = useState<number>(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const supabase = createClientComponentClient()

  // Fetch available supplier credit notes from v_received_credit_notes_summary
  const { data: creditNotes, isLoading } = useQuery({
    queryKey: ['available-supplier-credit-notes', searchTerm, invoiceCurrency],
    queryFn: async () => {
      let query = supabase
        .from('v_received_credit_notes_summary')
        .select('*')
        .is('received_invoice_id', null) // Credit notes that haven't been allocated yet
        .eq('currency_code', invoiceCurrency)

      if (searchTerm) {
        query = query.or(`credit_number.ilike.%${searchTerm}%,invoice_number.ilike.%${searchTerm}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return data || []
    },
    enabled: isOpen
  })

  // Update allocation amount when credit note is selected
  useEffect(() => {
    if (selectedCreditNote) {
      setAllocationAmount(selectedCreditNote.total_amount)
    }
  }, [selectedCreditNote])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCreditNote) return

    setIsSubmitting(true)
    try {
      // Create supplier credit note allocation
      const { error } = await supabase
        .from('received_credit_note_allocations')
        .insert({
          credit_note_id: selectedCreditNote.credit_note_id,
          received_invoice_id: invoiceId,
          allocated_amount: allocationAmount
        })

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Credit note linked successfully',
      })

      onCreditNoteAdded(selectedCreditNote)
      onClose()
      setSelectedCreditNote(null)
      setAllocationAmount(0)
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to link credit note',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'EUR',
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Existing Credit Note</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col space-y-4">
          {/* Search */}
          <div className="space-y-2">
            <Label htmlFor="search" className="text-sm font-medium">
              Search Credit Notes
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                id="search"
                placeholder="Search by credit number or invoice number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Credit Note List */}
          <div className="flex-1 overflow-y-auto border rounded-md">
            {isLoading ? (
              <div className="p-4 text-center text-gray-500">Loading credit notes...</div>
            ) : creditNotes && creditNotes.length > 0 ? (
              <div className="divide-y">
                {creditNotes.map((creditNote: any) => (
                  <div
                    key={creditNote.credit_note_id}
                    className={`p-4 cursor-pointer hover:bg-gray-50 ${
                      selectedCreditNote?.credit_note_id === creditNote.credit_note_id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                    }`}
                    onClick={() => {
                      setSelectedCreditNote(creditNote)
                      setAllocationAmount(creditNote.unallocated_amount || creditNote.total_amount)
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <FileText className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">
                            {creditNote.credit_number || `Credit Note #${creditNote.credit_note_id}`}
                          </span>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {creditNote.invoice_number ? `Invoice: ${creditNote.invoice_number} - ` : ''}{formatDate(creditNote.credit_date)}
                        </div>
                        {creditNote.reason && (
                          <div className="text-sm text-gray-500">
                            Reason: {creditNote.reason}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          {formatCurrency(creditNote.total_amount, creditNote.currency_code)}
                        </div>
                        <div className="text-sm text-gray-500">
                          Amount: {formatCurrency(creditNote.total_amount, creditNote.currency_code)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-gray-500">
                {searchTerm ? 'No credit notes found matching your search' : 'No available credit notes found'}
              </div>
            )}
          </div>

          {/* Allocation Amount */}
          {selectedCreditNote && (
            <div className="space-y-2">
              <Label htmlFor="allocation-amount" className="text-sm font-medium">
                Allocation Amount
              </Label>
              <Input
                id="allocation-amount"
                type="number"
                step="0.01"
                min="0"
                max={selectedCreditNote.total_amount}
                value={allocationAmount}
                onChange={(e) => setAllocationAmount(parseFloat(e.target.value) || 0)}
                placeholder="Enter amount to allocate"
              />
              <div className="text-sm text-gray-500">
                Total: {formatCurrency(selectedCreditNote.total_amount, selectedCreditNote.currency_code)}
              </div>
            </div>
          )}
        </form>

        <DialogFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={!selectedCreditNote || allocationAmount <= 0 || isSubmitting}
            className="bg-black text-white hover:bg-gray-800"
          >
            {isSubmitting ? 'Adding...' : 'Add Selected Credit Note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

