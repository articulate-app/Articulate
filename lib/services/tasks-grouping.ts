import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { GroupByField } from '@/store/task-grouping'

const supabase = createClientComponentClient()

export interface TaskGroup {
  groupKey: string
  label: string
  count: number
  order?: number // for status ordering
}

interface GetTaskGroupsParams {
  groupBy: GroupByField
  filters: Record<string, any>
  signal: AbortSignal
}

/**
 * Group tasks by a field, with cancellation support.
 * @param groupBy Field to group by
 * @param filters Filters to apply
 * @param signal AbortSignal for cancellation (from React Query)
 */
export async function getTaskGroups({ groupBy, filters, signal }: GetTaskGroupsParams): Promise<TaskGroup[]> {
  switch (groupBy) {
    case 'assigned_to': {
      // Group by assignee (users)
      const { data, error } = await supabase
        .from('tasks')
        .select('assigned_to_id, assigned_user:users!fk_tasks_assigned_to_id(id, full_name)', { count: 'exact', head: false })
        .abortSignal(signal)
        // .match(filters) // Uncomment if you want to use filters
      console.log('[getTaskGroups][assigned_to] data:', data, 'error:', error)
      if (error) throw error
      const groupMap = new Map<string, { label: string; count: number }>()
      for (const row of data) {
        const key = row.assigned_to_id?.toString() ?? 'unassigned'
        const label = row.assigned_user?.[0]?.full_name ?? 'Unassigned'
        groupMap.set(key, {
          label,
          count: (groupMap.get(key)?.count ?? 0) + 1,
        })
      }
      return Array.from(groupMap.entries()).map(([groupKey, { label, count }]) => ({ groupKey, label, count }))
        .sort((a, b) => a.label.localeCompare(b.label))
    }
    case 'status': {
      // Group by status (project_statuses)
      const { data, error } = await supabase
        .from('tasks')
        .select('project_status_id, project_statuses:project_status_id(id, name, order_priority)', { count: 'exact', head: false })
        .match(filters)
        .abortSignal(signal)
      if (error) throw error
      const groupMap = new Map<string, { label: string; count: number; order: number }>()
      for (const row of data) {
        const key = row.project_status_id?.toString() ?? 'none'
        const label = row.project_statuses?.[0]?.name ?? 'No Status'
        const order = row.project_statuses?.[0]?.order_priority ?? 9999
        groupMap.set(key, {
          label,
          count: (groupMap.get(key)?.count ?? 0) + 1,
          order,
        })
      }
      return Array.from(groupMap.entries()).map(([groupKey, { label, count, order }]) => ({ groupKey, label, count, order }))
        .sort((a, b) => a.order - b.order)
    }
    case 'delivery_date':
    case 'publication_date': {
      // Group by month/year
      const field = groupBy
      const { data, error } = await supabase
        .from('tasks')
        .select(`${field}`)
        .match(filters)
        .abortSignal(signal)
      if (error) throw error
      const groupMap = new Map<string, { label: string; count: number }>()
      for (const row of data) {
        if (!((row as any)[field])) continue
        const date = new Date((row as any)[field])
        const groupKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        const label = date.toLocaleString('default', { month: 'long', year: 'numeric' })
        groupMap.set(groupKey, {
          label,
          count: (groupMap.get(groupKey)?.count ?? 0) + 1,
        })
      }
      return Array.from(groupMap.entries()).map(([groupKey, { label, count }]) => ({ groupKey, label, count }))
        .sort((a, b) => b.groupKey.localeCompare(a.groupKey)) // Descending
    }
    case 'project': {
      // Group by project
      const { data, error } = await supabase
        .from('tasks')
        .select('project_id_int, projects:project_id_int(id, name)', { count: 'exact', head: false })
        .match(filters)
        .abortSignal(signal)
      if (error) throw error
      const groupMap = new Map<string, { label: string; count: number }>()
      for (const row of data) {
        const key = row.project_id_int?.toString() ?? 'none'
        const label = row.projects?.[0]?.name ?? 'No Project'
        groupMap.set(key, {
          label,
          count: (groupMap.get(key)?.count ?? 0) + 1,
        })
      }
      return Array.from(groupMap.entries()).map(([groupKey, { label, count }]) => ({ groupKey, label, count }))
        .sort((a, b) => a.label.localeCompare(b.label))
    }
    case 'content_type':
    case 'production_type':
    case 'language': {
      // Group by FK (content_type_id, production_type_id, language_id)
      const field = groupBy + '_id'
      const joinTable = groupBy + 's'
      const { data, error } = await supabase
        .from('tasks')
        .select(`${field}, ${joinTable}:${field}(id, name)`, { count: 'exact', head: false })
        .match(filters)
        .abortSignal(signal)
      if (error) throw error
      const groupMap = new Map<string, { label: string; count: number }>()
      for (const row of data) {
        const key = (row as any)[field]?.toString() ?? 'none'
        const label = (row as any)[joinTable]?.[0]?.name ?? `No ${groupBy.replace('_', ' ')}`
        groupMap.set(key, {
          label,
          count: (groupMap.get(key)?.count ?? 0) + 1,
        })
      }
      return Array.from(groupMap.entries()).map(([groupKey, { label, count }]) => ({ groupKey, label, count }))
        .sort((a, b) => a.label.localeCompare(b.label))
    }
    case 'channels': {
      // Group by channel (array)
      const { data, error } = await supabase
        .from('tasks')
        .select('channels')
        .match(filters)
        .abortSignal(signal)
      if (error) throw error
      const groupMap = new Map<string, { label: string; count: number }>()
      for (const row of data) {
        if (!row.channels) continue
        for (const channel of row.channels) {
          const key = channel
          groupMap.set(key, {
            label: channel,
            count: (groupMap.get(key)?.count ?? 0) + 1,
          })
        }
      }
      return Array.from(groupMap.entries()).map(([groupKey, { label, count }]) => ({ groupKey, label, count }))
        .sort((a, b) => a.label.localeCompare(b.label))
    }
    default:
      return []
  }
} 