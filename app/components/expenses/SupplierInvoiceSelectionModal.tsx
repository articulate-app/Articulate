"use client"

import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { Button } from '../ui/button'
import { FileText, Plus } from 'lucide-react'

interface SupplierInvoiceSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectExisting: () => void
  onCreateNew: () => void
}

export function SupplierInvoiceSelectionModal({
  isOpen,
  onClose,
  onSelectExisting,
  onCreateNew
}: SupplierInvoiceSelectionModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Invoice to Payment</DialogTitle>
          <DialogDescription>
            Choose how you want to add an invoice to this payment.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <Button
            onClick={() => {
              onSelectExisting()
              onClose()
            }}
            variant="outline"
            className="w-full h-20 flex flex-col items-center justify-center space-y-2"
          >
            <FileText className="w-6 h-6" />
            <div className="text-center">
              <div className="font-medium">Select Existing Invoice</div>
              <div className="text-sm text-gray-500">Choose from existing supplier invoices</div>
            </div>
          </Button>
          
          <Button
            onClick={() => {
              onCreateNew()
              onClose()
            }}
            variant="outline"
            className="w-full h-20 flex flex-col items-center justify-center space-y-2"
          >
            <Plus className="w-6 h-6" />
            <div className="text-center">
              <div className="font-medium">Create New Invoice</div>
              <div className="text-sm text-gray-500">Create a new supplier invoice</div>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

