import * as React from 'react'
import { useEffect, useState } from 'react'
import { getTaskGroups, TaskGroup } from '@/lib/services/tasks-grouping'
import { useTaskGrouping } from '../../store/task-grouping'
import { TaskTableRow } from './task-table-row'
import { useReactTable, getCoreRowModel, ColumnDef } from '@tanstack/react-table'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTypesenseInfiniteQuery } from '../../hooks/use-typesense-infinite-query'
import { fetchTasksFromTypesense } from '../../lib/fetchTasksFromTypesense'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

interface GroupedTaskListProps<T> {
  columns: ColumnDef<T>[]
  onTaskSelect?: (task: T) => void
  filters: Record<string, any>
  pageSize?: number
  sortBy: string
  sortOrder: 'asc' | 'desc'
  selectedTaskId?: string | number | null
  users?: { id: number; full_name: string }[] // Optional users data from task-edit-fields
  enabled?: boolean // Control when Typesense queries should run
}





function GroupContent<T>({
  group,
  columns,
  onTaskSelect,
  filters,
  pageSize,
  selectedGroupBy,
  sortBy,
  sortOrder,
  selectedTaskId,
  enabled,
}: {
  group: TaskGroup
  columns: any[]
  onTaskSelect?: (task: T) => void
  filters: Record<string, any>
  pageSize: number
  selectedGroupBy: string | null
  sortBy: string
  sortOrder: 'asc' | 'desc'
  selectedTaskId?: string | number | null
  enabled?: boolean
}) {
  // Build Typesense filters based on the group
  const buildGroupFilters = React.useCallback(() => {
    const groupFilters = { ...filters }
    
    switch (selectedGroupBy) {
      case 'assigned_to':
        if (group.groupKey === 'unassigned') {
          groupFilters.assigned_to_name = null
        } else {
          // For assigned_to, we need to get the user name from the group
          // The group.label contains the full_name, so we can use that
          groupFilters.assigned_to_name = group.label
        }
        break
      case 'status':
        if (group.groupKey === 'No Status') {
          groupFilters.project_status_name = null
        } else {
          groupFilters.project_status_name = group.groupKey
        }
        break
      case 'delivery_date':
      case 'publication_date': {
        const [year, month] = group.groupKey.split('-')
        const startDate = `${year}-${month}-01`
        const nextMonth = String(Number(month) + 1).padStart(2, '0')
        const endDate = `${year}-${nextMonth}-01`
        groupFilters[selectedGroupBy] = `${startDate}..${endDate}`
        break
      }
      case 'project':
        if (group.groupKey === 'none') {
          groupFilters.project_id_int = null
        } else {
          groupFilters.project_id_int = group.groupKey
        }
        break
      case 'content_type':
        if (group.groupKey === 'none') {
          groupFilters.content_type_title = null
        } else {
          groupFilters.content_type_title = group.groupKey
        }
        break
      case 'production_type':
        if (group.groupKey === 'none') {
          groupFilters.production_type_title = null
        } else {
          groupFilters.production_type_title = group.groupKey
        }
        break
      case 'language':
        if (group.groupKey === 'none') {
          groupFilters.language_code = null
        } else {
          groupFilters.language_code = group.groupKey
        }
        break
      case 'channels':
        groupFilters.channel_names = group.groupKey
        break
    }
    
    return groupFilters
  }, [group.groupKey, filters, selectedGroupBy])

  const groupFilters = buildGroupFilters()

  // Use Typesense infinite query for this group
  const typesenseQuery = useTypesenseInfiniteQuery({
    q: '*', // Search all tasks in this group
    filters: groupFilters,
    pageSize,
    sortBy,
    sortOrder,
    enabled: enabled !== false, // Enable by default, disable only if explicitly false
  })

  const table = useReactTable<any>({
    data: typesenseQuery.data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <TaskTableRow
      table={table}
      columns={columns}
      onTaskSelect={onTaskSelect}
      isFetching={typesenseQuery.isFetching}
      hasMore={typesenseQuery.hasMore}
      selectedTaskId={selectedTaskId}
    />
  )
}

export function GroupedTaskList<T>({ columns, onTaskSelect, filters, pageSize = 25, sortBy, sortOrder, selectedTaskId, users, enabled = true }: GroupedTaskListProps<T>) {
  const { selectedGroupBy, expandedGroups, toggleGroup, isGroupExpanded } = useTaskGrouping()
  const [groups, setGroups] = React.useState<TaskGroup[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [hasError, setHasError] = React.useState<Error | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Function to generate group-specific URL
  const generateGroupUrl = (group: TaskGroup) => {
    const params = new URLSearchParams(searchParams.toString())
    
    // Add group-specific parameters
    params.set('groupBy', selectedGroupBy || '')
    params.set('sortOrder', sortOrder)
    
    // Add group-specific filter based on the grouping type
    switch (selectedGroupBy) {
      case 'assigned_to':
        params.set('assigned_to_id', group.groupKey)
        break
      case 'project':
        params.set('project_id', group.groupKey)
        break
      case 'status':
        params.set('status_name', group.groupKey)
        break
      case 'content_type':
        params.set('content_type_id', group.groupKey)
        break
      case 'production_type':
        params.set('production_type_id', group.groupKey)
        break
      case 'language':
        params.set('language_id', group.groupKey)
        break
      case 'delivery_date':
      case 'publication_date':
        params.set('date_range', group.groupKey)
        break
      case 'channels':
        params.set('channel', group.groupKey)
        break
    }
    
    return `${pathname}?${params.toString()}`
  }

  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    setHasError(null)
    getTaskGroups({ groupBy: selectedGroupBy, filters, users })
      .then(groups => { if (mounted) setGroups(groups) })
      .catch(err => { if (mounted) setHasError(err) })
      .finally(() => { if (mounted) setIsLoading(false) })
    return () => { mounted = false }
  }, [selectedGroupBy, JSON.stringify(filters)])

  if (isLoading) {
    return (
      <tr>
        <td colSpan={columns.length} className="p-4 text-center text-gray-400">Loading groups...</td>
      </tr>
    )
  }
  if (hasError) {
    return (
      <tr>
        <td colSpan={columns.length} className="p-4 text-center text-red-500">Error loading groups: {hasError.message}</td>
      </tr>
    )
  }
  if (!groups.length) {
    return (
      <tr>
        <td colSpan={columns.length} className="p-4 text-center text-gray-400">No groups found.</td>
      </tr>
    )
  }

  return (
    <>
      {groups.map(group => {
        console.log('[GroupedTaskList] groupKey:', group.groupKey, 'label:', group.label);
        return (
          <React.Fragment key={group.groupKey}>
            <tr
              className="bg-muted hover:bg-accent cursor-pointer border-b sticky top-9 z-10"
              onClick={() => {
                toggleGroup(group.groupKey)
                // Navigate to the group-specific URL
                const groupUrl = generateGroupUrl(group)
                router.push(groupUrl)
              }}
              data-group-url={generateGroupUrl(group)}
              title={`Group URL: ${generateGroupUrl(group)}`}
              // NOTE: The 'top-9' value (2.25rem) is an estimate of the main table header's height.
              // For a more robust solution, this value could be dynamically calculated.
            >
              <td colSpan={columns.length} className="px-4 py-2 font-semibold">
                <div className="flex items-center gap-2">
                  {isGroupExpanded(group.groupKey) ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="truncate max-w-xs">{group.label}</span>
                </div>
              </td>
            </tr>
            {isGroupExpanded(group.groupKey) && (
              <GroupContent<T>
                group={group}
                columns={columns}
                onTaskSelect={onTaskSelect}
                filters={filters}
                pageSize={pageSize}
                selectedGroupBy={selectedGroupBy}
                sortBy={sortBy}
                sortOrder={sortOrder}
                selectedTaskId={selectedTaskId}
                enabled={enabled}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  )
} 