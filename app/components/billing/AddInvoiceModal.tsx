"use client"

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Plus, Search } from 'lucide-react'
import { AddExistingInvoiceModal } from './AddExistingInvoiceModal'
import { CreateAndIssueInvoiceModal } from './CreateAndIssueInvoiceModal'

interface AddInvoiceModalProps {
  orderId: number
  selectedOrders: any[]
  isOpen: boolean
  onClose: () => void
  onInvoiceAdded: (invoice?: any) => void
}

export function AddInvoiceModal({ 
  orderId,
  selectedOrders,
  isOpen, 
  onClose, 
  onInvoiceAdded 
}: AddInvoiceModalProps) {
  const [showCreateAndIssue, setShowCreateAndIssue] = useState(false)
  const [showExistingInvoice, setShowExistingInvoice] = useState(false)

  const handleClose = () => {
    setShowCreateAndIssue(false)
    setShowExistingInvoice(false)
    onClose()
  }

  const handleInvoiceAdded = (invoice?: any) => {
    onInvoiceAdded(invoice)
    handleClose()
  }

  // If showing create and issue, render the CreateAndIssueInvoiceModal
  if (showCreateAndIssue) {
    return (
      <CreateAndIssueInvoiceModal
        isOpen={true}
        onClose={handleClose}
        selectedOrders={selectedOrders}
        onSuccess={() => handleInvoiceAdded()}
      />
    )
  }

  // If showing existing invoice selection, render the AddExistingInvoiceModal
  if (showExistingInvoice) {
    return (
      <Dialog open={true} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Existing Invoice</DialogTitle>
          </DialogHeader>
          <AddExistingInvoiceModal
            orderId={orderId}
            onClose={handleClose}
            onInvoiceLinked={(invoice) => handleInvoiceAdded(invoice)}
          />
        </DialogContent>
      </Dialog>
    )
  }

  // Main modal with two choices
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Invoice</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="text-sm text-gray-600 text-center">
            Choose how you want to add an invoice to this order
          </div>
          
          <div className="space-y-3">
            <Button
              onClick={() => setShowCreateAndIssue(true)}
              className="w-full justify-start h-16 px-4"
              variant="outline"
            >
              <div className="flex items-center space-x-3">
                <Plus className="h-5 w-5 text-gray-600" />
                <div className="text-left">
                  <div className="font-medium">Create and issue new invoice</div>
                  <div className="text-sm text-gray-500">Create a new invoice for this order</div>
                </div>
              </div>
            </Button>
            
            <Button
              onClick={() => setShowExistingInvoice(true)}
              className="w-full justify-start h-16 px-4"
              variant="outline"
            >
              <div className="flex items-center space-x-3">
                <Search className="h-5 w-5 text-gray-600" />
                <div className="text-left">
                  <div className="font-medium">Link existing invoice</div>
                  <div className="text-sm text-gray-500">Link an existing invoice to this order</div>
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
