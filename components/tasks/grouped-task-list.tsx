import * as React from 'react'
import { useEffect } from 'react'
import { getTaskGroups, TaskGroup } from '@/lib/services/tasks-grouping'
import { useTaskGrouping } from '@/store/task-grouping'
import { InfiniteList } from '../../app/components/ui/infinite-list'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GroupedTaskListProps {
  onTaskSelect?: (task: any) => void
  trailingQuery: any
  filters: Record<string, any>
  tableName: 'tasks'
  pageSize?: number
}

// The columns we want to select from the database
const COLUMNS_STRING = `
  id,
  title,
  assigned_to_id,
  project_id_int,
  assigned_to_name,
  project_name,
  project_color,
  project_status_name,
  project_status_color,
  content_type_title,
  production_type_title,
  language_code,
  delivery_date,
  publication_date,
  updated_at,
  project_status_id
`.replace(/\s+/g, ' ').trim()

// Helper function to format date based on current year
function formatDateWithYear(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  try {
    const date = new Date(dateString);
    const now = new Date();
    const currentYear = now.getFullYear();
    const dateYear = date.getFullYear();
    
    if (dateYear === currentYear) {
      // Current year: dd/mmm format (e.g., "18/jul", "9/jul")
      const day = date.getDate().toString().padStart(2, '0');
      const month = date.toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
      return `${day}/${month}`;
    } else {
      // Previous years: dd/mm/yyyy format
      return date.toLocaleDateString('en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return "Invalid date";
  }
}

// Separate component for the group content to maintain clean table structure
function GroupContent({ 
  group, 
  onTaskSelect, 
  trailingQuery, 
  tableName, 
  pageSize, 
  selectedGroupBy 
}: { 
  group: TaskGroup
  onTaskSelect?: (task: any) => void
  trailingQuery: any
  tableName: 'tasks'
  pageSize: number
  selectedGroupBy: string | null 
}) {
  // Debug: confirm GroupContent is rendering
  console.log('GroupContent mounted for group:', group.groupKey);
  return (
    <InfiniteList<'tasks', any>
      key={group.groupKey}
      tableName={tableName}
      columns={COLUMNS_STRING}
      pageSize={pageSize}
      isTableBody={true}
      trailingQuery={React.useCallback((query: any) => {
        let q = trailingQuery(query)
        switch (selectedGroupBy) {
          case 'assigned_to':
            q = q.eq('assigned_to_id', group.groupKey === 'unassigned' ? null : group.groupKey)
            break
          case 'status':
            q = q.eq('project_status_id', group.groupKey === 'none' ? null : group.groupKey)
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
        return q
      }, [group.groupKey, trailingQuery, selectedGroupBy])}
      renderNoResults={() => (
        <tr>
          <td colSpan={10} className="text-center text-gray-500 py-8">No tasks found</td>
        </tr>
      )}
      renderEndMessage={() => null}
      renderSkeleton={(count) => (
        <>
          {Array.from({ length: count }).map((_, i) => (
            <tr key={i}>
              <td colSpan={10} className="py-4 animate-pulse bg-muted" />
            </tr>
          ))}
        </>
      )}
    >
      {(data, { isFetching }) => {
        // Debug: confirm InfiniteList children is rendering and what data it receives
        console.log('InfiniteList children data:', data, 'isFetching:', isFetching);
        return (
          <>
            {data.length === 0 && !isFetching ? (
              <tr>
                <td colSpan={10} className="text-center text-gray-500 py-8">No tasks found</td>
              </tr>
            ) : (
              data.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onTaskSelect?.(row)}>
                  <td className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">{row.title}</td>
                  <td className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">{row.assigned_to_name || ''}</td>
                  <td className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">
                    <span className="flex items-center gap-2">
                      {row.project_color && (
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: row.project_color }} />
                      )}
                      {row.project_name || ''}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">
                    <span className="flex items-center gap-2">
                      {row.project_status_color && (
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: row.project_status_color }} />
                      )}
                      {row.project_status_name || ''}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">{row.content_type_title || ''}</td>
                  <td className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">{row.production_type_title || ''}</td>
                  <td className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">{row.language_code || ''}</td>
                  <td className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">
                    <span className={cn(
                      row.is_overdue && "text-red-600 font-medium"
                    )}>
                      {row.delivery_date ? formatDateWithYear(row.delivery_date) : ''}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">
                    <span className={cn(
                      row.is_publication_overdue && "text-red-600 font-medium"
                    )}>
                      {row.publication_date ? formatDateWithYear(row.publication_date) : ''}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">
                    {row.updated_at ? new Date(row.updated_at).toLocaleDateString() : ''}
                  </td>
                </tr>
              ))
            )}
            {isFetching && (
              <tr>
                <td colSpan={10} className="text-center text-gray-400 py-4">Loading...</td>
              </tr>
            )}
          </>
        );
      }}
    </InfiniteList>
  )
}

export function GroupedTaskList({ onTaskSelect, trailingQuery, filters, tableName, pageSize = 25 }: GroupedTaskListProps) {
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
    return <div className="p-4 text-center text-gray-400">Loading groups...</div>
  }
  if (hasError) {
    return <div className="p-4 text-center text-red-500">Error loading groups: {hasError.message}</div>
  }
  if (!groups.length) {
    return <div className="p-4 text-center text-gray-400">No groups found.</div>
  }

  return (
    <div className="flex flex-col w-full space-y-4">
      {groups.map(group => (
        <div key={group.groupKey} className="border rounded-lg overflow-hidden">
          <button
            type="button"
            className={cn(
              'flex items-center w-full px-4 py-2 bg-muted hover:bg-accent transition-colors',
              'text-left font-semibold text-base gap-2'
            )}
            onClick={() => toggleGroup(group.groupKey)}
            aria-expanded={isGroupExpanded(group.groupKey)}
          >
            {isGroupExpanded(group.groupKey) ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="truncate max-w-xs">{group.label}</span>
            <span className="ml-2 text-xs text-muted-foreground font-normal">({group.count})</span>
          </button>
          {isGroupExpanded(group.groupKey) && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm md:text-base" style={{ tableLayout: 'fixed' }}>
                <thead className="sticky top-0 z-20 bg-white border-b shadow-sm">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 border-r border-gray-200 select-none">Title</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 border-r border-gray-200 select-none">Assignee</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 border-r border-gray-200 select-none">Project</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 border-r border-gray-200 select-none">Status</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 border-r border-gray-200 select-none">Content Type</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 border-r border-gray-200 select-none">Production Type</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 border-r border-gray-200 select-none">Language</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 border-r border-gray-200 select-none">Delivery Date</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 border-r border-gray-200 select-none">Publication Date</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 border-r border-gray-200 select-none">Last Update</th>
                  </tr>
                </thead>
                <tbody>
                  <GroupContent
                    group={group}
                    onTaskSelect={onTaskSelect}
                    trailingQuery={trailingQuery}
                    tableName={tableName}
                    pageSize={pageSize}
                    selectedGroupBy={selectedGroupBy}
                  />
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
} 