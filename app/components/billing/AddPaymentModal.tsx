"use client"

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { CreditCard, Plus, Search } from 'lucide-react'
import { SharedPaymentCreateModal } from '../documents/SharedPaymentCreateModal'
import { AddExistingPaymentModal } from './AddExistingPaymentModal'

interface AddPaymentModalProps {
  invoiceId: number
  invoiceCurrency: string
  invoiceNumber?: string
  payerTeamId: number
  payerTeamName?: string
  paidToTeamId?: number
  paidToTeamName?: string
  balanceDue: number
  subtotalAmount?: number
  isOpen: boolean
  onClose: () => void
  onPaymentAdded: (paymentId?: number) => void
}

export function AddPaymentModal({ 
  invoiceId, 
  invoiceCurrency,
  invoiceNumber,
  payerTeamId,
  payerTeamName,
  paidToTeamId,
  paidToTeamName,
  balanceDue,
  subtotalAmount,
  isOpen, 
  onClose, 
  onPaymentAdded 
}: AddPaymentModalProps) {
  const [showPaymentCreate, setShowPaymentCreate] = useState(false)
  const [showExistingPayment, setShowExistingPayment] = useState(false)

  const handleClose = () => {
    setShowPaymentCreate(false)
    setShowExistingPayment(false)
    onClose()
  }

  const handlePaymentCreated = (paymentId?: number) => {
    onPaymentAdded(paymentId)
    handleClose()
  }

  // If showing payment creation, render the SharedPaymentCreateModal
  if (showPaymentCreate) {
    return (
      <SharedPaymentCreateModal
        isOpen={true}
        onClose={handleClose}
        onSuccess={(document) => handlePaymentCreated()}
        initialStep={1}
        sortConfig={{ field: 'payment_date', direction: 'desc' }}
        fromContext={{
          invoiceId: invoiceId,
          invoiceNumber: invoiceNumber,
          payerTeamId: payerTeamId,
          payerTeamName: payerTeamName,
          paidToTeamId: paidToTeamId,
          paidToTeamName: paidToTeamName,
          currency: invoiceCurrency,
          subtotalAmount: subtotalAmount,
          suggestedAmount: balanceDue
        }}
      />
    )
  }

  // If showing existing payment selection, render the AddExistingPaymentModal
  if (showExistingPayment) {
    return (
      <AddExistingPaymentModal
        invoiceId={invoiceId}
        invoiceCurrency={invoiceCurrency}
        isOpen={true}
        onClose={handleClose}
        onPaymentAdded={() => handlePaymentCreated()}
      />
    )
  }

  // Main modal with two choices
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Payment</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="text-sm text-gray-600 text-center">
            Choose how you want to add a payment to this invoice
          </div>
          
          <div className="space-y-3">
            <Button
              onClick={() => setShowPaymentCreate(true)}
              className="w-full justify-start h-16 px-4"
              variant="outline"
            >
              <div className="flex items-center space-x-3">
                <Plus className="h-5 w-5 text-gray-600" />
                <div className="text-left">
                  <div className="font-medium">Record a new payment</div>
                  <div className="text-sm text-gray-500">Create and record a new payment</div>
                </div>
              </div>
            </Button>
            
            <Button
              onClick={() => setShowExistingPayment(true)}
              className="w-full justify-start h-16 px-4"
              variant="outline"
            >
              <div className="flex items-center space-x-3">
                <Search className="h-5 w-5 text-gray-600" />
                <div className="text-left">
                  <div className="font-medium">Select existing payment</div>
                  <div className="text-sm text-gray-500">Link an existing payment to this invoice</div>
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
 