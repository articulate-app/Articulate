"use client"

import React from 'react'
import { Button } from './button'
import { X, Trash2 } from 'lucide-react'

export interface BulkAction {
  label: string
  icon?: React.ComponentType<{ className?: string }>
  onClick: () => void
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  disabled?: boolean
}

interface BulkActionBarProps {
  selectedCount: number
  onClearSelection: () => void
  actions: BulkAction[]
  entityName?: string // e.g., "task", "order", "invoice"
}

export function BulkActionBar({ 
  selectedCount, 
  onClearSelection, 
  actions,
  entityName = "item"
}: BulkActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="bg-blue-50 border-b border-blue-200 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium text-blue-900">
            {selectedCount} {entityName}{selectedCount !== 1 ? 's' : ''} selected
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
        <div className="flex items-center space-x-2">
          {actions.map((action, index) => (
            <Button
              key={index}
              variant={action.variant || 'default'}
              size="sm"
              onClick={action.onClick}
              disabled={action.disabled}
              className={action.variant === 'destructive' 
                ? 'bg-red-600 hover:bg-red-700 text-white' 
                : 'bg-blue-600 hover:bg-blue-700 text-white'
              }
            >
              {action.icon && <action.icon className="w-4 h-4 mr-1" />}
              {action.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
} 