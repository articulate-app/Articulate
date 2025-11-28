"use client"

import React from 'react'

interface InvoiceLinesSectionProps {
  invoiceLines: any[]
  isLoadingLines: boolean
  onTaskClick?: (taskId: number) => void
}

export function InvoiceLinesSection({ invoiceLines, isLoadingLines, onTaskClick }: InvoiceLinesSectionProps) {
  const formatCurrency = (amount: number, currencyCode: string = 'EUR') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
    }).format(amount)
  }

  if (isLoadingLines) {
    return <div className="text-center py-4 text-gray-500">Loading lines...</div>
  }

  if (!invoiceLines || invoiceLines.length === 0) {
    return <div className="text-center py-4 text-gray-500">No invoice lines found</div>
  }

  return (
    <div className="space-y-2">
      {invoiceLines.map((line: any, index: number) => (
        <div 
          key={`${line.description}-${index}`} 
          className={`bg-white border border-gray-200 rounded-lg p-3 ${line.task_id ? 'cursor-pointer hover:bg-gray-50' : ''}`}
          onClick={line.task_id ? () => onTaskClick?.(line.task_id) : undefined}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium text-gray-900">
                  {line.description || '—'}
                </div>
                {line.task_id && (
                  <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                )}
              </div>
              {line.task_name && (
                <div className="text-xs text-gray-500 mt-1">
                  {line.task_name}
                </div>
              )}
            </div>
            <div className="text-sm font-medium text-gray-900">
              {formatCurrency(line.unit_price || 0, line.currency_code || 'EUR')}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
} 
 
 
 
 