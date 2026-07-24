"use client"

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Check, ChevronDown, Filter, Plus, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { DocumentsFilters as DocumentsFiltersType } from '../../lib/types/documents'
import {
  DOCUMENTS_ALL_TIME_DATE_FROM,
  isDocumentsAllTimeDateFrom,
} from '../../lib/services/documents-postgrest-rpc'

interface DocumentsUnifiedFilterBarProps {
  filters: DocumentsFiltersType
  onFiltersChange: (filters: DocumentsFiltersType) => void
  activeFilterBadges?: Array<{
    label: string
    value: string
    onRemove: () => void
  }>
  onClearAllFilters: () => void
  onAddInvoice?: () => void
  onAddPayment?: () => void
  onAddCreditNote?: () => void
  /** Collapse type/time filters behind a single Filters control. */
  compactFilters?: boolean
  /** Account team for billing history — enables Counterparty + Project filter groups. */
  involvingTeamId?: number
  /** When set with compactFilters, render search with an in-field filter icon. */
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  /** Hide the Add dropdown (e.g. when rendered next to a section title). */
  showAddMenu?: boolean
  /** Compact mode: render only the filter icon + popover (no search field / Filters button label). */
  compactIconOnly?: boolean
}

const directionOptions = [
  { value: '', label: 'All' },
  { value: 'ar', label: 'Accounts Receivable' },
  { value: 'ap', label: 'Accounts Payable' },
]

const kindOptions = [
  { id: 'invoice', label: 'Invoices' },
  { id: 'order', label: 'Orders' },
  { id: 'credit_note', label: 'Credit Notes' },
  { id: 'payment', label: 'Payments' },
]

type TimeFrameId =
  | 'all_time'
  | 'last_week'
  | 'current_month'
  | 'last_month'
  | 'last_year'
  | 'year_to_date'
  | 'custom'

const timeFrameOptions: Array<{ value: TimeFrameId; label: string }> = [
  { value: 'last_week', label: 'Last Week' },
  { value: 'current_month', label: 'Current Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'year_to_date', label: 'Year to Date' },
  { value: 'all_time', label: 'All Time' },
  { value: 'custom', label: 'Custom' },
]

function toDateInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function resolveTimeFrameDates(timeFrame: TimeFrameId): { fromDate: string; toDate: string } | null {
  // RPC requires p_date_from; use a far-past bound so "All Time" is truly unbounded in practice.
  if (timeFrame === 'all_time') return { fromDate: DOCUMENTS_ALL_TIME_DATE_FROM, toDate: '' }
  if (timeFrame === 'custom') return null

  const today = startOfDay(new Date())
  let from = today
  let toExclusive = new Date(today)
  toExclusive.setDate(toExclusive.getDate() + 1)

  switch (timeFrame) {
    case 'last_week': {
      from = new Date(today)
      from.setDate(from.getDate() - 7)
      break
    }
    case 'current_month': {
      from = new Date(today.getFullYear(), today.getMonth(), 1)
      break
    }
    case 'last_month': {
      from = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      toExclusive = new Date(today.getFullYear(), today.getMonth(), 1)
      break
    }
    case 'last_year': {
      from = new Date(today.getFullYear() - 1, 0, 1)
      toExclusive = new Date(today.getFullYear(), 0, 1)
      break
    }
    case 'year_to_date': {
      from = new Date(today.getFullYear(), 0, 1)
      break
    }
  }

  return {
    fromDate: toDateInputValue(from),
    toDate: toDateInputValue(toExclusive),
  }
}

function inferTimeFrame(fromDate: string, toDate: string): TimeFrameId {
  if (isDocumentsAllTimeDateFrom(fromDate) && !toDate) return 'all_time'
  for (const option of timeFrameOptions) {
    if (option.value === 'custom' || option.value === 'all_time') continue
    const resolved = resolveTimeFrameDates(option.value)
    if (resolved && resolved.fromDate === fromDate && resolved.toDate === toDate) {
      return option.value
    }
  }
  return 'custom'
}

export function DocumentsUnifiedFilterBar({
  filters,
  onFiltersChange,
  activeFilterBadges = [],
  onClearAllFilters,
  onAddInvoice,
  onAddPayment,
  onAddCreditNote,
  compactFilters = false,
  involvingTeamId,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search documents...',
  showAddMenu = true,
  compactIconOnly = false,
}: DocumentsUnifiedFilterBarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [compactGroup, setCompactGroup] = useState<
    'root' | 'direction' | 'kind' | 'time' | 'counterparty' | 'project'
  >('root')
  const showCompactSearch = compactFilters && typeof onSearchChange === 'function' && !compactIconOnly
  const showCompactIconOnly = compactFilters && compactIconOnly
  const involvingTeamKey =
    involvingTeamId && involvingTeamId > 0 ? String(involvingTeamId) : null
  const supabase = createClientComponentClient()

  const selectedCounterparties = useMemo(() => {
    if (!involvingTeamKey) return [] as string[]
    const onlyInvolving =
      filters.toTeam.length === 1 &&
      filters.toTeam[0] === involvingTeamKey &&
      filters.fromTeam.length === 1 &&
      filters.fromTeam[0] === involvingTeamKey
    if (onlyInvolving) return []
    return filters.toTeam.filter((id) => id !== involvingTeamKey)
  }, [filters.fromTeam, filters.toTeam, involvingTeamKey])

  const { data: counterpartyTeams = [] } = useQuery({
    queryKey: ['documents-compact-counterparty-teams'],
    enabled:
      compactFilters &&
      !!involvingTeamKey &&
      (filtersOpen || selectedCounterparties.length > 0),
    queryFn: async () => {
      const { data, error } = await supabase.from('teams').select('id, title').order('title')
      if (error) throw error
      return (data ?? [])
        .filter((team) => String(team.id) !== involvingTeamKey)
        .map((team) => ({ id: String(team.id), label: team.title || `Team ${team.id}` }))
    },
  })

  const { data: projectOptions = [] } = useQuery({
    queryKey: ['documents-compact-projects', involvingTeamId],
    enabled: compactFilters && !!involvingTeamId && involvingTeamId > 0 && filtersOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('team_id', involvingTeamId)
        .eq('is_deleted', false)
        .order('name')
      if (error) throw error
      return (data ?? [])
        .map((project) => ({
          id: String(project.id),
          label: (project.name || '').trim() || `Project ${project.id}`,
        }))
        .filter((project) => project.label.length > 0)
    },
  })

  const handleDirectionChange = (direction: string) => {
    onFiltersChange({ ...filters, direction })
  }

  const handleKindChange = (kinds: string[]) => {
    onFiltersChange({ ...filters, kind: kinds })
  }

  const handleTimeFrameChange = (timeFrame: TimeFrameId) => {
    const resolved = resolveTimeFrameDates(timeFrame)
    if (!resolved) return
    onFiltersChange({ ...filters, fromDate: resolved.fromDate, toDate: resolved.toDate })
  }

  const handleCounterpartyToggle = (teamId: string) => {
    if (!involvingTeamKey) return
    const next = selectedCounterparties.includes(teamId)
      ? selectedCounterparties.filter((id) => id !== teamId)
      : [...selectedCounterparties, teamId]
    onFiltersChange({
      ...filters,
      fromTeam: [involvingTeamKey],
      toTeam: next.length > 0 ? next : [involvingTeamKey],
    })
  }

  const handleProjectToggle = (projectName: string) => {
    const selected = filters.projects.includes(projectName)
    onFiltersChange({
      ...filters,
      projects: selected
        ? filters.projects.filter((name) => name !== projectName)
        : [...filters.projects, projectName],
    })
  }

  const currentTimeFrame = inferTimeFrame(filters.fromDate, filters.toDate)
  const currentTimeFrameLabel =
    timeFrameOptions.find((opt) => opt.value === currentTimeFrame)?.label || 'All Time'

  const filterBadges = useMemo(() => {
    const badges: Array<{ id: string; label: string; value: string; onRemove: () => void }> = []

    if (filters.direction) {
      const directionLabel =
        directionOptions.find((opt) => opt.value === filters.direction)?.label || filters.direction
      badges.push({
        id: 'direction',
        label: 'Direction',
        value: directionLabel,
        onRemove: () => handleDirectionChange(''),
      })
    }

    const kindsByLabel = new Map<string, string[]>()
    filters.kind.forEach((kind) => {
      const kindLabel = kindOptions.find((opt) => opt.id === kind)?.label || kind
      if (!kindsByLabel.has(kindLabel)) kindsByLabel.set(kindLabel, [])
      kindsByLabel.get(kindLabel)!.push(kind)
    })

    kindsByLabel.forEach((kinds, label) => {
      badges.push({
        id: `kind-${label}`,
        label: 'Type',
        value: label,
        onRemove: () => handleKindChange(filters.kind.filter((k) => !kinds.includes(k))),
      })
    })

    if (currentTimeFrame !== 'all_time') {
      badges.push({
        id: 'time-frame',
        label: 'Time',
        value: currentTimeFrameLabel,
        onRemove: () => handleTimeFrameChange('all_time'),
      })
    }

    activeFilterBadges.forEach((badge, index) => {
      // Avoid duplicating date-range badges when compact time frame is shown
      if (compactFilters && (badge.label === 'Date' || badge.label === 'Date Range')) return
      // Compact bar already shows Direction / Type / Time
      if (
        compactFilters &&
        (badge.label === 'Direction' || badge.label === 'Type' || badge.label === 'Status')
      ) {
        return
      }
      let value = badge.value
      if (badge.label === 'Counterparty' && counterpartyTeams.length > 0) {
        value = badge.value
          .split(',')
          .map((part) => part.trim())
          .map((id) => counterpartyTeams.find((team) => team.id === id)?.label || id)
          .join(', ')
      }
      badges.push({
        id: `active-${index}`,
        label: badge.label,
        value,
        onRemove: badge.onRemove,
      })
    })

    return badges
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers close over latest filters
  }, [
    activeFilterBadges,
    compactFilters,
    counterpartyTeams,
    currentTimeFrame,
    currentTimeFrameLabel,
    filters.direction,
    filters.kind,
  ])

  const activeFilterCount =
    (filters.direction ? 1 : 0) +
    (filters.kind.length > 0 ? 1 : 0) +
    (currentTimeFrame !== 'all_time' ? 1 : 0) +
    activeFilterBadges.filter(
      (badge) => !(compactFilters && (badge.label === 'Date' || badge.label === 'Date Range')),
    ).length

  const addMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 px-2.5">
          <Plus className="h-3.5 w-3.5" />
          Add
          <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => onAddInvoice?.()}>Invoice</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddPayment?.()}>Payment</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddCreditNote?.()}>Credit Note</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const timeFramePicker = (
    <div className="space-y-0.5">
      {timeFrameOptions
        .filter((option) => option.value !== 'custom')
        .map((option) => {
          const selected = currentTimeFrame === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleTimeFrameChange(option.value)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm',
                selected ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50',
              )}
            >
              <span>{option.label}</span>
              {selected ? <Check className="h-3.5 w-3.5" /> : null}
            </button>
          )
        })}
    </div>
  )

  const directionSummary =
    directionOptions.find((opt) => opt.value === filters.direction)?.label || 'All'
  const kindSummary =
    filters.kind.length === 0
      ? 'All'
      : filters.kind.length === 1
        ? kindOptions.find((opt) => opt.id === filters.kind[0])?.label || '1 selected'
        : `${filters.kind.length} selected`
  const counterpartySummary =
    selectedCounterparties.length === 0
      ? 'Any'
      : selectedCounterparties.length === 1
        ? counterpartyTeams.find((team) => team.id === selectedCounterparties[0])?.label ||
          selectedCounterparties[0]
        : `${selectedCounterparties.length} selected`
  const projectSummary =
    filters.projects.length === 0
      ? 'Any'
      : filters.projects.length === 1
        ? filters.projects[0]
        : `${filters.projects.length} selected`

  const compactGroupRows: Array<{
    id: typeof compactGroup
    label: string
    summary: string
    hidden?: boolean
  }> = [
    { id: 'direction', label: 'Direction', summary: directionSummary },
    { id: 'kind', label: 'Doc type', summary: kindSummary },
    { id: 'time', label: 'Time frame', summary: currentTimeFrameLabel },
    {
      id: 'counterparty',
      label: 'Counterparty',
      summary: counterpartySummary,
      hidden: !involvingTeamKey,
    },
    {
      id: 'project',
      label: 'Project',
      summary: projectSummary,
      hidden: !involvingTeamKey,
    },
  ]

  const compactFiltersPanel = (
    <PopoverContent
      align="end"
      className="z-[80] w-72 space-y-3 p-3"
      onCloseAutoFocus={() => setCompactGroup('root')}
    >
      {compactGroup === 'root' ? (
        <>
          <div className="space-y-0.5">
            {compactGroupRows
              .filter((row) => !row.hidden)
              .map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setCompactGroup(row.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-900">{row.label}</span>
                  <span className="flex min-w-0 items-center gap-1 text-xs text-gray-500">
                    <span className="truncate">{row.summary}</span>
                    <ChevronDown className="h-3.5 w-3.5 -rotate-90 shrink-0" />
                  </span>
                </button>
              ))}
          </div>
          {activeFilterCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-full text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => {
                onClearAllFilters()
                setFiltersOpen(false)
                setCompactGroup('root')
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setCompactGroup('root')}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"
          >
            <ChevronDown className="h-3.5 w-3.5 rotate-90" />
            {compactGroupRows.find((row) => row.id === compactGroup)?.label ?? 'Filters'}
          </button>

          {compactGroup === 'direction' ? (
            <div className="space-y-0.5">
              {directionOptions.map((option) => {
                const selected =
                  filters.direction === option.value || (!filters.direction && option.value === '')
                return (
                  <button
                    key={option.value || 'all'}
                    type="button"
                    onClick={() => handleDirectionChange(option.value)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm',
                      selected ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50',
                    )}
                  >
                    <span>{option.label}</span>
                    {selected ? <Check className="h-3.5 w-3.5" /> : null}
                  </button>
                )
              })}
            </div>
          ) : null}

          {compactGroup === 'kind' ? (
            <div className="space-y-0.5">
              {kindOptions.map((option) => {
                const selected = filters.kind.includes(option.id)
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() =>
                      handleKindChange(
                        selected
                          ? filters.kind.filter((k) => k !== option.id)
                          : [...filters.kind, option.id],
                      )
                    }
                    className={cn(
                      'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm',
                      selected ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50',
                    )}
                  >
                    <span>{option.label}</span>
                    {selected ? <Check className="h-3.5 w-3.5" /> : null}
                  </button>
                )
              })}
            </div>
          ) : null}

          {compactGroup === 'time' ? timeFramePicker : null}

          {compactGroup === 'counterparty' ? (
            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {counterpartyTeams.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-gray-500">No teams available.</p>
              ) : (
                counterpartyTeams.map((team) => {
                  const selected = selectedCounterparties.includes(team.id)
                  return (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => handleCounterpartyToggle(team.id)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm',
                        selected ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50',
                      )}
                    >
                      <span className="truncate">{team.label}</span>
                      {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                    </button>
                  )
                })
              )}
            </div>
          ) : null}

          {compactGroup === 'project' ? (
            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {projectOptions.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-gray-500">No projects for this team.</p>
              ) : (
                projectOptions.map((project) => {
                  const selected = filters.projects.includes(project.label)
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => handleProjectToggle(project.label)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm',
                        selected ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50',
                      )}
                    >
                      <span className="truncate">{project.label}</span>
                      {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                    </button>
                  )
                })
              )}
            </div>
          ) : null}
        </>
      )}
    </PopoverContent>
  )

  if (compactFilters) {
    const compactFilterIcon = (
      <Popover
        open={filtersOpen}
        onOpenChange={(open) => {
          setFiltersOpen(open)
          if (!open) setCompactGroup('root')
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800',
              filtersOpen || activeFilterCount > 0 ? 'text-gray-900' : null,
              showCompactSearch ? 'absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2' : null,
            )}
            aria-label="Filters"
          >
            <Filter className="h-3.5 w-3.5" />
            {activeFilterCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-gray-900 px-1 text-[9px] font-medium leading-none text-white">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </PopoverTrigger>
        {compactFiltersPanel}
      </Popover>
    )

    if (showCompactIconOnly) {
      return (
        <div className="relative shrink-0">
          {compactFilterIcon}
        </div>
      )
    }

    return (
      <div className="space-y-2 py-1">
        <div className="flex items-center gap-2">
          {showAddMenu ? addMenu : null}
          {showCompactSearch ? (
            <div className="relative min-w-0 flex-1">
              <Input
                value={searchValue ?? ''}
                onChange={(event) => onSearchChange?.(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 pr-9"
              />
              {compactFilterIcon}
            </div>
          ) : (
            <Popover
              open={filtersOpen}
              onOpenChange={(open) => {
                setFiltersOpen(open)
                if (!open) setCompactGroup('root')
              }}
            >
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 px-2.5">
                  <Filter className="h-3.5 w-3.5" />
                  Filters
                  {activeFilterCount > 0 ? (
                    <span className="rounded-full bg-gray-900 px-1.5 text-[10px] font-medium leading-4 text-white">
                      {activeFilterCount}
                    </span>
                  ) : null}
                </Button>
              </PopoverTrigger>
              {compactFiltersPanel}
            </Popover>
          )}
        </div>

        {filterBadges.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {filterBadges.map((badge) => (
              <button
                key={badge.id}
                type="button"
                onClick={badge.onRemove}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
              >
                <span>
                  {badge.label}: {badge.value}
                </span>
                <X className="h-3 w-3 text-gray-400" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="border-b border-gray-200 bg-white px-0 py-2 sm:px-0">
      <div
        className="flex min-h-[40px] w-full flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-4 py-1 text-sm font-medium text-blue-600 shadow-none transition hover:border-blue-300 hover:bg-blue-100">
              <Plus className="h-4 w-4" />
              <span>Add</span>
              <ChevronDown className="h-4 w-4" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={onAddInvoice}>Invoice</DropdownMenuItem>
            <DropdownMenuItem onClick={onAddPayment}>Payment</DropdownMenuItem>
            <DropdownMenuItem onClick={onAddCreditNote}>Credit Note</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-gray-300">|</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-gray-300 bg-white px-4 py-1 text-sm font-medium text-gray-700 shadow-none transition hover:bg-gray-100">
              <span>
                Direction:{' '}
                {filters.direction
                  ? directionOptions.find((opt) => opt.value === filters.direction)?.label || 'All'
                  : 'All'}
              </span>
              <ChevronDown className="h-4 w-4" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {directionOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => handleDirectionChange(option.value)}
                className="flex items-center justify-between"
              >
                <span>{option.label}</span>
                {(filters.direction === option.value || (!filters.direction && option.value === '')) && (
                  <Check className="h-4 w-4" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-gray-300">|</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-gray-300 bg-white px-4 py-1 text-sm font-medium text-gray-700 shadow-none transition hover:bg-gray-100">
              <span>
                Doc type:{' '}
                {filters.kind.length === 0
                  ? 'All'
                  : filters.kind.length === 1
                    ? kindOptions.find((opt) => opt.id === filters.kind[0])?.label || 'All'
                    : `${filters.kind.length} types`}
              </span>
              <ChevronDown className="h-4 w-4" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {kindOptions.map((option) => (
              <DropdownMenuItem
                key={option.id}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleKindChange(
                    filters.kind.includes(option.id)
                      ? filters.kind.filter((k) => k !== option.id)
                      : [...filters.kind, option.id],
                  )
                }}
                className="flex items-center justify-between"
              >
                <span>{option.label}</span>
                {filters.kind.includes(option.id) && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-gray-300">|</span>

        <Select value={currentTimeFrame} onValueChange={(value) => handleTimeFrameChange(value as TimeFrameId)}>
          <SelectTrigger className="inline-flex h-auto w-auto items-center gap-1 rounded-full border border-gray-300 bg-white px-4 py-1 text-sm font-medium text-gray-700 shadow-none transition hover:bg-gray-100">
            <SelectValue>{currentTimeFrameLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {timeFrameOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} disabled={option.value === 'custom'}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {activeFilterBadges.length > 0 && (
          <>
            <span className="text-gray-300">|</span>
            {activeFilterBadges.map((badge, index) => (
              <div
                key={index}
                className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-4 py-1 text-sm font-medium text-gray-700 shadow-none transition hover:bg-gray-100"
              >
                <span className="mr-1 capitalize">{badge.label}:</span>
                <span className="mr-1">{badge.value}</span>
                <button onClick={badge.onRemove} className="text-gray-400 transition hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {activeFilterBadges.length > 1 && (
              <>
                <span className="text-gray-300">|</span>
                <button
                  onClick={onClearAllFilters}
                  className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-4 py-1 text-sm font-medium text-red-600 shadow-none transition hover:border-red-300 hover:bg-red-50"
                >
                  <span className="mr-1">Clear All</span>
                  <X className="h-3 w-3" />
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
