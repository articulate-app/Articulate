"use client"

import React from 'react'
import { Button } from '../ui/button'
import { X } from 'lucide-react'

interface BulkActionBarProps {
  selectedCount: number
  onClearSelection: () => void
  onCreateAndIssueInvoice: () => void
}

export function BulkActionBar({ 
  selectedCount, 
  onClearSelection, 
  onCreateAndIssueInvoice
}: BulkActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="bg-blue-50 border-b border-blue-200 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium text-blue-900">
            {selectedCount} order{selectedCount !== 1 ? 's' : ''} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className="text-blue-600 hover:text-blue-800 hover:bg-blue-100"
          >
            <X className="w-4 h-4 mr-1" />
            Clear
          </Button>
        </div>
        <Button
          onClick={onCreateAndIssueInvoice}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          Create and Issue Invoice
        </Button>
      </div>
    </div>
  )
} 