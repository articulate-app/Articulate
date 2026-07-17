import * as React from 'react'
import { useTaskGrouping, GroupByField } from '../../store/task-grouping'
import type { TaskGroupingState } from '../../store/task-grouping'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSearchParams, usePathname } from 'next/navigation'
import { buildGroupingSearchParams, getDefaultGroupOrderForGroupBy, parseExplicitGroupOrderParam } from '@/lib/tasks-grouping-url'
import { dispatchTasksShallowNavigation } from '@/lib/tasks-shallow-nav'

export const GROUP_OPTIONS: { value: GroupByField; label: string }[] = [
  { value: null, label: 'No group' },
  { value: 'assigned_to', label: 'Assigned To' },
  { value: 'status', label: 'Status' },
  { value: 'delivery_date', label: 'Delivery Date' },
  { value: 'publication_date', label: 'Publication Date' },
  { value: 'project', label: 'Project' },
  { value: 'content_type', label: 'Content Type' },
  { value: 'production_type', label: 'Production Type' },
  { value: 'language', label: 'Language' },
  { value: 'channels', label: 'Channels' },
]

export type GroupOrderOption = { value: 'asc' | 'desc'; label: string }

export type GroupingMenuModel = {
  selectedGroupBy: GroupByField
  /** Group-by field options (respecting `hiddenGroupByOptions`). */
  visibleOptions: { value: GroupByField; label: string }[]
  /** Apply a group-by field (null = "No group"); updates the URL exactly like desktop. */
  selectGroup: (groupBy: GroupByField) => void
  /** Currently effective order (URL value, else the field default). */
  effectiveGroupOrder: 'asc' | 'desc'
  /** Order choices for the active group (empty when ungrouped). Labels match desktop. */
  groupOrderOptions: GroupOrderOption[]
  setGroupOrder: (order: 'asc' | 'desc') => void
}

/**
 * Single source of truth for the "Group by" menu: which fields are offered, the active selection,
 * the order options/labels, and the canonical URL mutations. Both the desktop dropdown/overflow
 * (`GroupingMenuItems`) and the mobile options drawer consume this so behavior and URL state stay
 * identical — no duplicated grouping logic.
 */
export function useGroupingMenuModel(
  hiddenGroupByOptions?: (GroupByField | string)[],
): GroupingMenuModel {
  const selectedGroupBy = useTaskGrouping((s: TaskGroupingState) => s.selectedGroupBy)
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const shallowNavigate = React.useCallback((url: string, mode: 'push' | 'replace' = 'push') => {
    if (typeof window === 'undefined') return
    if (mode === 'replace') {
      window.history.replaceState({}, '', url)
    } else {
      window.history.pushState({}, '', url)
    }
    // Notify URL-as-source-of-truth consumers (TaskList store sync, TasksLayout) so the grouped /
    // ungrouped view actually switches — a raw history update alone does not trigger Next.js
    // useSearchParams() and would leave the store (selectedGroupBy) stale.
    dispatchTasksShallowNavigation()
  }, [])

  const visibleOptions = React.useMemo(
    () => GROUP_OPTIONS.filter((opt) => !hiddenGroupByOptions?.includes(opt.value as GroupByField)),
    [hiddenGroupByOptions],
  )

  const selectGroup = React.useCallback(
    (groupBy: GroupByField) => {
      // Canonical grouping → URL transform (preserves layout, center/right pane, object, and the
      // camelCase task filters). "No group" => mode=list (ungrouped); a field => mode=grouped.
      const params = buildGroupingSearchParams(new URLSearchParams(searchParams.toString()), groupBy ?? null)
      if (groupBy === null) {
        // Clear legacy per-group drill context (not the active filters, which use camelCase keys).
        params.delete('assigned_to_id')
        params.delete('project_id')
        params.delete('status_name')
        params.delete('content_type_id')
        params.delete('production_type_id')
        params.delete('language_id')
        params.delete('date_range')
        params.delete('channel')
      }
      shallowNavigate(`${pathname}?${params.toString()}`, 'push')
    },
    [pathname, searchParams, shallowNavigate],
  )

  const urlGroupOrder = parseExplicitGroupOrderParam(searchParams.get('groupOrder'))
  const effectiveGroupOrder: 'asc' | 'desc' = (() => {
    if (!selectedGroupBy) return 'desc'
    if (urlGroupOrder) return urlGroupOrder
    return getDefaultGroupOrderForGroupBy(selectedGroupBy)
  })()

  const setGroupOrder = React.useCallback(
    (order: 'asc' | 'desc') => {
      if (!selectedGroupBy) return
      const params = new URLSearchParams(searchParams.toString())
      params.set('groupBy', selectedGroupBy)
      params.set('groupOrder', order)
      params.delete('page')
      shallowNavigate(`${pathname}?${params.toString()}`, 'push')
    },
    [pathname, searchParams, selectedGroupBy, shallowNavigate],
  )

  const groupOrderOptions: GroupOrderOption[] = React.useMemo(() => {
    if (!selectedGroupBy) return []
    if (selectedGroupBy === 'delivery_date' || selectedGroupBy === 'publication_date') {
      return [
        { value: 'desc', label: 'Newest → Oldest' },
        { value: 'asc', label: 'Oldest → Newest' },
      ]
    }
    return [
      { value: 'asc', label: 'A–Z' },
      { value: 'desc', label: 'Z–A' },
    ]
  }, [selectedGroupBy])

  return { selectedGroupBy, visibleOptions, selectGroup, effectiveGroupOrder, groupOrderOptions, setGroupOrder }
}

/** Label for the active list group-by URL param (e.g. toolbar overflow). */
export function getListGroupByLabelFromParams(groupByRaw: string | null): string {
  if (groupByRaw == null || groupByRaw === '' || groupByRaw === 'none' || groupByRaw === 'all') {
    return 'No group'
  }
  const hit = GROUP_OPTIONS.find((o) => o.value != null && String(o.value) === String(groupByRaw))
  return hit?.label ?? groupByRaw.replace(/_/g, ' ')
}

/** Shared menu body for “Group by” (pill or overflow submenu). */
export function GroupingMenuItems({
  hiddenGroupByOptions,
  itemClassName,
}: {
  hiddenGroupByOptions?: (GroupByField | string)[]
  itemClassName?: string
}) {
  const { selectedGroupBy, visibleOptions, selectGroup, effectiveGroupOrder, groupOrderOptions, setGroupOrder } =
    useGroupingMenuModel(hiddenGroupByOptions)

  return (
    <>
      {visibleOptions.map((opt) => (
        <DropdownMenuItem
          key={String(opt.value)}
          onSelect={() => selectGroup(opt.value)}
          className={cn(itemClassName, selectedGroupBy === opt.value ? 'font-semibold bg-muted' : '')}
        >
          {opt.label}
        </DropdownMenuItem>
      ))}
      {selectedGroupBy && groupOrderOptions.length > 0 && (
        <>
          <DropdownMenuSeparator />
          {groupOrderOptions.map((order) => (
            <DropdownMenuItem
              key={order.value}
              onSelect={() => setGroupOrder(order.value)}
              className={cn(itemClassName, effectiveGroupOrder === order.value ? 'font-semibold bg-muted' : '')}
            >
              {order.label}
            </DropdownMenuItem>
          ))}
        </>
      )}
    </>
  )
}

export function GroupingDropdown({
  className,
  /** When in project scope, pass ['project'] so Project is not shown as a group-by option. */
  hiddenGroupByOptions,
}: {
  className?: string
  hiddenGroupByOptions?: (GroupByField | string)[]
}) {
  const selectedGroupBy = useTaskGrouping((s: TaskGroupingState) => s.selectedGroupBy)
  const visibleOptions = React.useMemo(
    () => GROUP_OPTIONS.filter((opt) => !hiddenGroupByOptions?.includes(opt.value as GroupByField)),
    [hiddenGroupByOptions],
  )
  const current = visibleOptions.find((opt) => opt.value === selectedGroupBy)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn('gap-2', className)}>
          {selectedGroupBy && current ? `Group by: ${current.label}` : 'Group by'}
          <ChevronDown className="ml-1 h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px]">
        <GroupingMenuItems hiddenGroupByOptions={hiddenGroupByOptions} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
} 