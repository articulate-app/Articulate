"use client"

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchDocumentsSummary } from '../../lib/services/documents'
import type { DocumentsFilters } from '../../lib/types/documents'
import { getDocumentsDefaultDateFrom } from '../../lib/services/documents-postgrest-rpc'
import { cn } from '@/lib/utils'

interface DocumentsSummaryCardsProps {
  filters: DocumentsFilters
  onTimeFrameChange?: (timeFrame: string) => void
  /** Match AI usage metric cells (no bordered cards). */
  variant?: 'default' | 'metrics'
}

const formatCurrency = (amount: number, currencyCode: string = 'EUR'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function MetricCell({
  label,
  value,
  hint,
  muted = false,
}: {
  label: string
  value: string
  hint?: string
  muted?: boolean
}) {
  return (
    <div className={cn('min-w-0 space-y-1', muted && 'opacity-70')}>
      <div className={cn('text-xs', muted ? 'text-gray-400' : 'text-gray-500')}>{label}</div>
      <div
        className={cn(
          'truncate text-base font-semibold tabular-nums',
          muted ? 'text-gray-500' : 'text-gray-900',
        )}
        title={value}
      >
        {value}
      </div>
      {hint ? (
        <div className={cn('truncate text-xs', muted ? 'text-gray-400' : 'text-gray-500')} title={hint}>
          {hint}
        </div>
      ) : null}
    </div>
  )
}

export function DocumentsSummaryCards({ filters, variant = 'default' }: DocumentsSummaryCardsProps) {
  const dateFrom = filters.fromDate || getDocumentsDefaultDateFrom()
  const dateTo = filters.toDate || null
  const currencyCode = filters.currency ? [filters.currency] : null
  const status = filters.status.length > 0 ? filters.status : null
  const fromTeamId = filters.fromTeam.length > 0 ? filters.fromTeam.map(Number).filter(Number.isFinite) : null
  const toTeamId = filters.toTeam.length > 0 ? filters.toTeam.map(Number).filter(Number.isFinite) : null

  const { data: summary, isLoading, error } = useQuery({
    queryKey: ['documents-summary-cards', { dateFrom, dateTo, currencyCode, status, fromTeamId, toTeamId }],
    queryFn: () => fetchDocumentsSummary(filters),
    staleTime: 30000,
  })

  if (isLoading) {
    if (variant === 'metrics') {
      return (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="min-w-0 space-y-2">
              <div className="h-3 w-16 animate-pulse bg-gray-100" />
              <div className="h-5 w-20 animate-pulse bg-gray-100" />
            </div>
          ))}
        </div>
      )
    }
    return (
      <div className="flex gap-2 overflow-x-auto pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="min-w-[140px] flex-1 animate-pulse rounded-lg border border-gray-200 p-3">
            <div className="mb-2 h-4 w-3/4 rounded bg-gray-200"></div>
            <div className="h-5 w-1/2 rounded bg-gray-200"></div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-4 text-center text-red-500">
        Error loading summary data
      </div>
    )
  }

  if (!summary) {
    return null
  }

  if (variant === 'metrics') {
    return (
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <MetricCell label="Invoiced" value={formatCurrency(summary.invoiced)} hint="AR invoices" />
        <MetricCell label="Costs" value={formatCurrency(summary.costs)} hint="AP invoices" />
        <MetricCell label="AR credits" value={formatCurrency(summary.arCredit)} hint="Credit notes (AR)" />
        <MetricCell label="AP credits" value={formatCurrency(summary.apCredit)} hint="Credit notes (AP)" />
        <MetricCell label="Result" value={formatCurrency(summary.result)} hint="Invoiced − costs" />
        <MetricCell
          label="Pending AR"
          value={formatCurrency(summary.pendingAR)}
          hint="Outstanding"
          muted
        />
        <MetricCell
          label="Pending AP"
          value={formatCurrency(summary.pendingAP)}
          hint="Outstanding"
          muted
        />
        <MetricCell
          label="Pending net"
          value={formatCurrency(summary.pendingNet)}
          hint="AR − AP"
          muted
        />
      </div>
    )
  }

  const cards = [
    { title: 'Invoiced', value: formatCurrency(summary.invoiced), description: 'AR Invoices' },
    { title: 'Costs', value: formatCurrency(summary.costs), description: 'AP Invoices' },
    { title: 'AR Credits', value: formatCurrency(summary.arCredit), description: 'Credit notes (AR)' },
    { title: 'AP Credits', value: formatCurrency(summary.apCredit), description: 'Credit notes (AP)' },
    { title: 'Result', value: formatCurrency(summary.result), description: 'Invoiced - Costs' },
    { title: 'Pending AR', value: formatCurrency(summary.pendingAR), description: 'Outstanding AR', muted: true },
    { title: 'Pending AP', value: formatCurrency(summary.pendingAP), description: 'Outstanding AP', muted: true },
    { title: 'Pending (Net)', value: formatCurrency(summary.pendingNet), description: 'AR - AP', muted: true },
  ]

  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {cards.map((card, index) => (
        <div
          key={index}
          className={cn(
            'min-w-[140px] flex-1 space-y-1 rounded-lg border border-gray-200 p-3',
            card.muted && 'border-gray-100 bg-gray-50/60',
          )}
        >
          <div className={cn('truncate text-sm font-medium', card.muted ? 'text-gray-500' : 'text-black')}>
            {card.title}
          </div>
          <div className={cn('truncate text-lg font-bold', card.muted ? 'text-gray-500' : 'text-black')}>
            {card.value}
          </div>
          <p className="truncate text-xs text-gray-500">
            {card.description}
          </p>
        </div>
      ))}
    </div>
  )
}
