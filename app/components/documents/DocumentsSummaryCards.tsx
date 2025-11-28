"use client"

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { fetchDocumentsSummary } from '../../lib/services/documents'
import type { DocumentsFilters } from '../../lib/types/documents'

interface DocumentsSummaryCardsProps {
  filters: DocumentsFilters
  onTimeFrameChange?: (timeFrame: string) => void
}


const formatCurrency = (amount: number, currencyCode: string = 'EUR'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function DocumentsSummaryCards({ filters, onTimeFrameChange }: DocumentsSummaryCardsProps) {
  const { data: summary, isLoading, error } = useQuery({
    queryKey: ['documents-summary', filters],
    queryFn: () => fetchDocumentsSummary(filters),
    staleTime: 30000, // 30 seconds
  })

  if (isLoading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex-1 min-w-[140px] animate-pulse p-3 border border-gray-200 rounded-lg">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-5 bg-gray-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center text-red-500 py-4">
        Error loading summary data
      </div>
    )
  }

  if (!summary) {
    return null
  }

  const cards = [
    {
      title: 'Invoiced',
      value: formatCurrency(summary.invoiced),
      description: 'AR Invoices',
    },
    {
      title: 'Costs',
      value: formatCurrency(summary.costs),
      description: 'AP Invoices',
    },
    {
      title: 'Result',
      value: formatCurrency(summary.result),
      description: 'Invoiced - Costs',
    },
    {
      title: 'Pending AR',
      value: formatCurrency(summary.pendingAR),
      description: 'Outstanding AR',
    },
    {
      title: 'Pending AP',
      value: formatCurrency(summary.pendingAP),
      description: 'Outstanding AP',
    },
    {
      title: 'Pending (Net)',
      value: formatCurrency(summary.pendingNet),
      description: 'AR - AP',
    },
  ]

  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {cards.map((card, index) => (
        <div key={index} className="flex-1 min-w-[140px] space-y-1 p-3 border border-gray-200 rounded-lg">
          <div className="text-sm font-medium text-black truncate">
            {card.title}
          </div>
          <div className="text-lg font-bold text-black truncate">
            {card.value}
          </div>
          <p className="text-xs text-gray-500 truncate">
            {card.description}
          </p>
        </div>
      ))}
    </div>
  )
}
