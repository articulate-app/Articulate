'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Filter, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GroupByField } from '@/store/task-grouping'
import { buildTaskGroupFilterPatch } from '@/lib/task-group-filter'
import { buildFilterSearchParams, type TaskFiltersForUrl } from '@/lib/tasks-filter-url'
import { useTasksUI } from '@/store/tasks-ui'
import { useTasksShallowSearchParams } from '@/hooks/use-tasks-shallow-search-params'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { IconTooltip } from '../ui/icon-tooltip'

export function useApplyTaskGroupFilter() {
  const { filters, setFilters } = useTasksUI()
  const router = useRouter()
  const pathname = usePathname()
  const params = useTasksShallowSearchParams()

  return React.useCallback(
    (groupBy: GroupByField, groupKey: string, label: string) => {
      const patch = buildTaskGroupFilterPatch(groupBy, groupKey, label)
      if (!patch) return

      const newFilters: TaskFiltersForUrl = {
        assignedTo: filters.assignedTo ?? [],
        status: filters.status ?? [],
        deliveryDate: filters.deliveryDate ?? {},
        publicationDate: filters.publicationDate ?? {},
        project: filters.project ?? [],
        contentType: filters.contentType ?? [],
        productionType: filters.productionType ?? [],
        language: filters.language ?? [],
        channels: filters.channels ?? [],
        overdueStatus: filters.overdueStatus ?? [],
        ...patch,
      }

      const newParams = buildFilterSearchParams(
        new URLSearchParams(params.toString()),
        newFilters,
      )
      router.replace(`${pathname}?${newParams.toString()}`)
      setFilters(newFilters)
    },
    [filters, params, pathname, router, setFilters],
  )
}

type TaskGroupHeaderActionsProps = {
  groupBy: GroupByField
  groupKey: string
  label: string
  className?: string
}

export function TaskGroupHeaderActions({
  groupBy,
  groupKey,
  label,
  className,
}: TaskGroupHeaderActionsProps) {
  const applyGroupFilter = useApplyTaskGroupFilter()
  const canFilter = buildTaskGroupFilterPatch(groupBy, groupKey, label) != null

  const handleFilter = React.useCallback(
    (event: { preventDefault?: () => void; stopPropagation?: () => void }) => {
      event.preventDefault?.()
      event.stopPropagation?.()
      applyGroupFilter(groupBy, groupKey, label)
    },
    [applyGroupFilter, groupBy, groupKey, label],
  )

  if (!canFilter) return null

  return (
    <div
      className={cn('flex shrink-0 items-center gap-0.5', className)}
      onClick={e => e.stopPropagation()}
    >
      <IconTooltip label="Filter to this group">
        <button
          type="button"
          aria-label="Filter to this group"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-60 hover:bg-gray-100 hover:opacity-100"
          onClick={handleFilter}
        >
          <Filter className="h-3.5 w-3.5" />
        </button>
      </IconTooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Group actions"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-60 hover:bg-gray-100 hover:opacity-100"
            onClick={e => e.stopPropagation()}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px]" onClick={e => e.stopPropagation()}>
          <DropdownMenuItem onSelect={handleFilter}>Filter to this group</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
