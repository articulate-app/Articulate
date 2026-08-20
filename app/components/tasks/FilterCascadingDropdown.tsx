"use client"

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { buildFilterSearchParams } from '../../lib/tasks-filter-url'
import { ChevronDown, ChevronRight, Check, ListFilter } from 'lucide-react'
import { PANE_CHROME_ICON_BUTTON_CLASS, PANE_CHROME_ICON_CLASS } from './pane-header-tokens'
import { Input } from '../ui/input'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
} from '../ui/dropdown-menu'
import type { TaskFilters as TaskFiltersType } from '../../store/tasks-ui'
import type { FilterOptions } from '../../lib/services/filters'
import { useCurrentUserStore } from '../../store/current-user'
import { IconTooltip } from '../ui/icon-tooltip'
import { FilterOptionVisual } from './task-list-visuals'

interface FilterCascadingDropdownProps {
  editFields?: any
  filterOptions?: FilterOptions
  filters: TaskFiltersType
  setFilters: (filters: TaskFiltersType) => void
  router: any
  pathname: string
  params: URLSearchParams
  className?: string
  /** When true, hide the Project category in the dropdown (e.g. when already scoped to a project). */
  hideProjectFilter?: boolean
  /** When true, hide the Assigned To category (e.g. when already scoped to a user). */
  hideAssigneeFilter?: boolean
  /** Icon-only trigger (toolbar right cluster). `submenu` nests inside an existing “…” menu. */
  variant?: 'default' | 'icon' | 'submenu'
}

const FILTER_CATEGORIES_ALL = [
  { id: 'assignedTo', label: 'Assigned To' },
  { id: 'status', label: 'Status' },
  { id: 'project', label: 'Project' },
  { id: 'contentType', label: 'Content Type' },
  { id: 'productionType', label: 'Production Type' },
  { id: 'language', label: 'Language' },
  { id: 'channels', label: 'Channels' },
  { id: 'overdueStatus', label: 'Overdue Status' },
] as const

export function FilterCascadingDropdown({
  editFields: _editFields,
  filterOptions,
  filters,
  setFilters,
  router,
  pathname,
  params,
  className,
  hideProjectFilter = false,
  hideAssigneeFilter = false,
  variant = 'default',
}: FilterCascadingDropdownProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [paramSearch, setParamSearch] = useState<Record<string, string>>({})
  const currentUserId = useCurrentUserStore((state) => state.publicUserId)

  const filterCategories = FILTER_CATEGORIES_ALL.filter((c) => {
    if (hideProjectFilter && c.id === 'project') return false
    if (hideAssigneeFilter && c.id === 'assignedTo') return false
    return true
  })

  const updateUrl = (newFilters: TaskFiltersType) => {
    const newParams = buildFilterSearchParams(params, newFilters)
    router.replace(`${pathname}?${newParams.toString()}`)
    setFilters(newFilters)
  }

  const handleOptionSelect = (categoryId: string, optionId: string) => {
    const currentValues = ((filters as any)[categoryId] as string[]) || []
    const newValues = currentValues.includes(optionId)
      ? currentValues.filter((v: string) => v !== optionId)
      : [...currentValues, optionId]

    const newFilters = { ...filters, [categoryId]: newValues }
    updateUrl(newFilters)
  }

  const applyQuickFilter = (kind: "due_today" | "assigned_to_me" | "delivery_overdue" | "publication_overdue") => {
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    const shouldSetAssignee =
      !hideAssigneeFilter && (kind === "due_today" || kind === "assigned_to_me")
    const nextFilters: TaskFiltersType = {
      assignedTo:
        shouldSetAssignee && currentUserId != null ? [String(currentUserId)] : [],
      status: [],
      deliveryDate: kind === "due_today" ? { from: start, to: end } : {},
      publicationDate: {},
      project: [],
      contentType: [],
      productionType: [],
      language: [],
      channels: [],
      overdueStatus:
        kind === "delivery_overdue"
          ? ["delivery_overdue"]
          : kind === "publication_overdue"
          ? ["publication_overdue"]
          : [],
    }
    updateUrl(nextFilters)
    setMenuOpen(false)
  }

  const getCategoryOptions = (categoryId: string) => {
    if (!filterOptions) return []

    switch (categoryId) {
      case 'assignedTo':
        return (filterOptions.users || []).map((u) => ({ id: u.value, label: u.label }))
      case 'status':
        return (filterOptions.statuses || []).map((s) => ({ id: s.value, label: s.label, color: s.color }))
      case 'project':
        return (filterOptions.projects || []).map((p) => ({
          id: p.value,
          label: p.label,
          color: p.color,
          logo: p.logo,
        }))
      case 'contentType':
        return (filterOptions.contentTypes || []).map((c) => ({ id: c.value, label: c.label }))
      case 'productionType':
        return (filterOptions.productionTypes || []).map((p) => ({ id: p.value, label: p.label }))
      case 'language':
        return (filterOptions.languages || []).map((l) => ({ id: l.value, label: l.label }))
      case 'channels':
        return (filterOptions.channels || []).map((ch) => ({ id: ch.value, label: ch.label }))
      case 'overdueStatus':
        return [
          { id: 'delivery_overdue', label: 'Delivery overdue' },
          { id: 'publication_overdue', label: 'Publication overdue' },
        ]
      default:
        return []
    }
  }

  const activeFiltersCount = Object.values(filters).reduce((count, val) => {
    if (Array.isArray(val)) return count + val.length
    if (val && typeof val === 'object' && ('from' in val || 'to' in val)) {
      return count + ((val.from ? 1 : 0) + (val.to ? 1 : 0))
    }
    return count
  }, 0)

  const filterMenuItems = (
    <>
        <DropdownMenuItem onSelect={() => applyQuickFilter("due_today")}>Due today</DropdownMenuItem>
        {!hideAssigneeFilter ? (
          <DropdownMenuItem onSelect={() => applyQuickFilter("assigned_to_me")}>Assigned to me</DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => applyQuickFilter("delivery_overdue")}>Delivery overdue</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => applyQuickFilter("publication_overdue")}>Publication overdue</DropdownMenuItem>
        <div className="my-1 h-px bg-gray-200" />
        {filterCategories.map((category) => {
          const allOptions = getCategoryOptions(category.id)
          const q = (paramSearch[category.id] ?? '').trim().toLowerCase()
          const options = q
            ? allOptions.filter((o) => o.label.toLowerCase().includes(q))
            : allOptions
          return (
            <DropdownMenuSub key={category.id}>
              <DropdownMenuSubTrigger className="gap-2">
                <span className="min-w-0 flex-1 truncate text-left">{category.label}</span>
                <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                sideOffset={6}
                className="max-h-[min(360px,70vh)] min-w-[12rem] w-max max-w-[min(26rem,calc(100vw-2rem))] overflow-y-auto p-0"
              >
                <div
                  className="sticky top-0 z-[1] border-b border-border bg-popover p-2"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <Input
                    placeholder="Search…"
                    className="h-8 text-sm"
                    value={paramSearch[category.id] ?? ''}
                    onChange={(e) =>
                      setParamSearch((prev) => ({ ...prev, [category.id]: e.target.value }))
                    }
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="p-1">
                {options.length === 0 ? (
                  <div className="px-2 py-2 text-sm text-muted-foreground">No options</div>
                ) : (
                  options.map((option) => {
                    const currentValues = ((filters as any)[category.id] as string[]) || []
                    const isSelected = currentValues.includes(option.id)
                    return (
                      <DropdownMenuItem
                        key={option.id}
                        className="min-h-8 min-w-0 max-w-full cursor-pointer gap-2 whitespace-nowrap py-1.5 pr-3"
                        onSelect={(e) => {
                          e.preventDefault()
                          handleOptionSelect(category.id, option.id)
                        }}
                      >
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                          <Check className={cn('h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                        </span>
                        <span className="min-w-0 max-w-[22rem] flex-1 truncate" title={option.label}>
                          <FilterOptionVisual
                            categoryId={category.id}
                            label={option.label}
                            color={(option as { color?: string | null }).color}
                            logo={(option as { logo?: string | null }).logo}
                          />
                        </span>
                      </DropdownMenuItem>
                    )
                  })
                )}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )
        })}
    </>
  )

  if (variant === 'submenu') {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className={cn('gap-2', className)}>
          <span className="min-w-0 truncate">Filter</span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {activeFiltersCount > 0 ? (
              <span className="text-xs text-muted-foreground tabular-nums">
                {activeFiltersCount > 9 ? '9+' : activeFiltersCount}
              </span>
            ) : null}
            <ChevronRight className="h-4 w-4 opacity-60" />
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-[200px] max-w-[min(280px,calc(100vw-2rem))] p-1">
          {filterMenuItems}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    )
  }

  return (
    <DropdownMenu
      open={menuOpen}
      onOpenChange={(open) => {
        setMenuOpen(open)
        if (!open) setParamSearch({})
      }}
    >
      {(() => {
        const filterTrigger = (
        <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={variant === 'icon' ? 'Filter tasks' : undefined}
          className={cn(
            variant === 'icon' && cn(PANE_CHROME_ICON_BUTTON_CLASS, 'relative'),
            variant === 'default' && 'inline-flex items-center gap-1',
            className,
            variant === 'default' && activeFiltersCount > 0 && 'font-semibold',
            variant === 'icon' &&
              activeFiltersCount > 0 &&
              'bg-gray-100 text-gray-900 hover:bg-gray-100 hover:text-gray-900',
          )}
        >
          {variant === 'icon' ? (
            <>
              <ListFilter className={PANE_CHROME_ICON_CLASS} strokeWidth={1.75} />
              {activeFiltersCount > 0 ? (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-gray-300 px-1 text-[9px] font-medium tabular-nums text-gray-800"
                  aria-hidden
                >
                  {activeFiltersCount > 9 ? '9+' : activeFiltersCount}
                </span>
              ) : null}
            </>
          ) : (
            <>
              <span>Filter</span>
              {activeFiltersCount > 0 ? (
                <span
                  className="inline-flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded bg-gray-200 px-1 text-[10px] font-medium tabular-nums leading-none text-gray-700"
                  aria-label={`${activeFiltersCount} active filters`}
                >
                  {activeFiltersCount}
                </span>
              ) : null}
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
            </>
          )}
        </button>
        </DropdownMenuTrigger>
        )
        return variant === 'icon' ? (
          <IconTooltip label="Filter">{filterTrigger}</IconTooltip>
        ) : (
          filterTrigger
        )
      })()}
      <DropdownMenuContent align="start" className="min-w-[200px] max-w-[min(280px,calc(100vw-2rem))] p-1">
        {filterMenuItems}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
