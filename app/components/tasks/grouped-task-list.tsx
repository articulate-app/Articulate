import * as React from 'react'
import { useEffect, useState } from 'react'
import { getTaskGroups, TaskGroup } from '@/lib/services/tasks-grouping'
import { useTaskGrouping } from '../../store/task-grouping'
import { InfiniteList } from '../ui/infinite-list'
import { TaskTableRow } from './task-table-row'
import { useReactTable, getCoreRowModel, ColumnDef } from '@tanstack/react-table'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GroupedTaskListProps<T> {
  columns: ColumnDef<T>[]
  onTaskSelect?: (task: T) => void
  trailingQuery: any
  filters: Record<string, any>
  tableName: string
  pageSize?: number
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

function GroupTable<T>({ data, columns, onTaskSelect, isFetching, hasMore }: {
  data: T[]
  columns: any[]
  onTaskSelect?: (task: T) => void
  isFetching: boolean
  hasMore: boolean
}) {
  const table = useReactTable<T>({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <TaskTableRow
      table={table}
      columns={columns}
      onTaskSelect={onTaskSelect}
      isFetching={isFetching}
      hasMore={hasMore}
    />
  )
}

const TASKLIST_COLUMNS = `
  id,
  title,
  delivery_date,
  publication_date,
  updated_at,
  assigned_user:users!fk_tasks_assigned_to_id(id, full_name),
  projects!project_id_int(id, name, color),
  project_statuses!project_status_id(id, name, color),
  content_type_title,
  production_type_title,
  language_code
`.replace(/\s+/g, ' ').trim();

function GroupContent<T>({
  group,
  columns,
  onTaskSelect,
  trailingQuery,
  tableName,
  pageSize,
  selectedGroupBy,
  sortBy,
  sortOrder,
}: {
  group: TaskGroup
  columns: any[]
  onTaskSelect?: (task: T) => void
  trailingQuery: any
  tableName: string
  pageSize: number
  selectedGroupBy: string | null
  sortBy: string
  sortOrder: 'asc' | 'desc'
}) {
  const groupTrailingQuery = React.useCallback(
    (query: any) => {
      let q = trailingQuery(query)
      switch (selectedGroupBy) {
        case 'assigned_to':
          q = q.eq('assigned_to_id', group.groupKey === 'unassigned' ? null : Number(group.groupKey))
          break
        case 'status':
          if (group.groupKey === 'No Status') {
            q = q.is('project_status_id', null)
          } else {
            q = q.eq('project_statuses.name', group.groupKey)
          }
          break
        case 'delivery_date':
        case 'publication_date': {
          const [year, month] = group.groupKey.split('-')
          q = q.gte(selectedGroupBy, `${year}-${month}-01`).lt(selectedGroupBy, `${year}-${String(Number(month) + 1).padStart(2, '0')}-01`)
          break
        }
        case 'project':
          q = q.eq('project_id_int', group.groupKey === 'none' ? null : group.groupKey)
          break
        case 'content_type':
        case 'production_type':
        case 'language': {
          const field = selectedGroupBy + '_id'
          q = q.eq(field, group.groupKey === 'none' ? null : group.groupKey)
          break
        }
        case 'channels':
          q = q.contains('channels', [group.groupKey])
          break
      }

      if (sortBy) {
        q = q.order(sortBy, { ascending: sortOrder === 'asc' })
      }

      return q
    },
    [group.groupKey, trailingQuery, selectedGroupBy, sortBy, sortOrder]
  )

  return (
    <InfiniteList
      isTableBody={true}
      key={`${group.groupKey}-${sortBy}-${sortOrder}`}
      tableName={tableName as any}
      columns={TASKLIST_COLUMNS}
      pageSize={pageSize}
      trailingQuery={groupTrailingQuery}
    >
      {(data: T[], meta: { isFetching: boolean; hasMore: boolean }) => {
        return (
          <GroupTable
            data={data}
            columns={columns}
            onTaskSelect={onTaskSelect}
            isFetching={meta.isFetching}
            hasMore={meta.hasMore}
          />
        );
      }}
    </InfiniteList>
  )
}

export function GroupedTaskList<T>({ columns, onTaskSelect, trailingQuery, filters, tableName, pageSize = 25, sortBy, sortOrder }: GroupedTaskListProps<T>) {
  const { selectedGroupBy, expandedGroups, toggleGroup, isGroupExpanded } = useTaskGrouping()
  const [groups, setGroups] = React.useState<TaskGroup[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [hasError, setHasError] = React.useState<Error | null>(null)

  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    setHasError(null)
    getTaskGroups({ groupBy: selectedGroupBy, filters })
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
      {groups.map(group => (
        <React.Fragment key={group.groupKey}>
          <tr
            className="bg-muted hover:bg-accent cursor-pointer border-b sticky top-9 z-10"
            onClick={() => toggleGroup(group.groupKey)}
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
                <span className="ml-2 text-xs text-muted-foreground font-normal">({group.count})</span>
              </div>
            </td>
          </tr>
          {isGroupExpanded(group.groupKey) && (
            <GroupContent<T>
              group={group}
              columns={columns}
              onTaskSelect={onTaskSelect}
              trailingQuery={trailingQuery}
              tableName={tableName}
              pageSize={pageSize}
              selectedGroupBy={selectedGroupBy}
              sortBy={sortBy}
              sortOrder={sortOrder}
            />
          )}
        </React.Fragment>
      ))}
    </>
  )
} 