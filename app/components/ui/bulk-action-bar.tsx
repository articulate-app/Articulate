"use client"

import React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  /** Directory-style pills (Biblioteca) vs legacy blue bar */
  variant?: 'directory' | 'legacy'
  /**
   * `toolbar` — inline into an existing toolbar row (no extra band).
   * `banner` — standalone strip above the list.
   */
  placement?: 'banner' | 'toolbar'
}

export function BulkActionBar({
  selectedCount,
  onClearSelection,
  actions,
  entityName = 'item',
  variant = 'directory',
  placement = 'banner',
}: BulkActionBarProps) {
  if (selectedCount === 0) return null

  if (variant === 'legacy') {
    return (
      <div className="border-b border-blue-200 bg-blue-50 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-blue-900">
              {selectedCount} {entityName}
              {selectedCount !== 1 ? 's' : ''} selected
            </span>
            <button
              type="button"
              onClick={onClearSelection}
              className="inline-flex items-center rounded-md px-2 py-1 text-sm text-blue-600 hover:bg-blue-100 hover:text-blue-800"
            >
              <X className="mr-1 h-4 w-4" />
              Clear
            </button>
          </div>
          <div className="flex items-center space-x-2">
            {actions.map((action, index) => (
              <button
                key={index}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                className={cn(
                  'inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50',
                  action.variant === 'destructive'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-blue-600 hover:bg-blue-700',
                )}
              >
                {action.icon ? <action.icon className="mr-1 h-4 w-4" /> : null}
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const isToolbar = placement === 'toolbar'

  return (
    <div
      className={cn(
        'flex items-center gap-1.5',
        isToolbar ? 'flex-nowrap shrink-0' : 'w-full flex-wrap px-0 py-2',
      )}
    >
      {actions.map((action, index) => {
        const isDestructive = action.variant === 'destructive'
        const isPrimary = !isDestructive && (action.variant === 'default' || !action.variant)
        return (
          <button
            key={index}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors disabled:opacity-50',
              isDestructive &&
                'border border-red-300 bg-white text-red-600 hover:bg-red-50',
              isPrimary && 'bg-gray-900 text-white hover:bg-gray-800',
              !isDestructive &&
                !isPrimary &&
                'border border-gray-300 bg-white text-gray-900 hover:bg-gray-50',
            )}
          >
            {action.icon ? <action.icon className="h-4 w-4" /> : null}
            {action.label}
          </button>
        )
      })}
      <span className="shrink-0 pl-1 text-sm tabular-nums text-gray-500">
        {selectedCount} selected
      </span>
      <button
        type="button"
        onClick={onClearSelection}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        aria-label="Clear selection"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
