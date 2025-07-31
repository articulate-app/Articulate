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
}

export async function getTaskGroups({ groupBy, filters }: GetTaskGroupsParams): Promise<TaskGroup[]> {
  switch (groupBy) {
    case 'assigned_to': {
      // Group by assignee (users)
      const { data, error } = await supabase
        .from('tasks')
        .select('assigned_to_id, assigned_to_name', { count: 'exact', head: false })
      if (error) throw error
      const groupMap = new Map<string, { label: string; count: number }>()
      for (const row of data) {
        const key = row.assigned_to_id?.toString() ?? 'unassigned'
        const label = row.assigned_to_name ?? 'Unassigned'
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
        .select('project_status_id, project_status_name, project_status_color', { count: 'exact', head: false })
        .match(filters)
      if (error) throw error
      const groupMap = new Map<string, { label: string; count: number; order: number }>()
      for (const row of data) {
        const key = row.project_status_id?.toString() ?? 'none'
        const label = row.project_status_name ?? 'No Status'
        const order = row.project_status_color ?? 9999
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
      const field = groupBy as 'delivery_date' | 'publication_date';
      const { data, error } = await supabase
        .from('tasks')
        .select(`${field}`)
        .match(filters)
      if (error) throw error
      const groupMap = new Map<string, { label: string; count: number }>()
      for (const row of data) {
        const dateValue = (row as Record<string, any>)[field];
        if (!dateValue) continue
        const date = new Date(dateValue)
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
        .select('project_id_int, project_name', { count: 'exact', head: false })
        .match(filters)
      if (error) throw error
      const groupMap = new Map<string, { label: string; count: number }>()
      for (const row of data) {
        const key = row.project_id_int?.toString() ?? 'none'
        const label = row.project_name ?? 'No Project'
        groupMap.set(key, {
          label,
          count: (groupMap.get(key)?.count ?? 0) + 1,
        })
      }
      return Array.from(groupMap.entries()).map(([groupKey, { label, count }]) => ({ groupKey, label, count }))
        .sort((a, b) => a.label.localeCompare(b.label))
    }
    case 'content_type': {
      // Group by content type
      const { data, error } = await supabase
        .from('tasks')
        .select('content_type_id, content_type_title', { count: 'exact', head: false })
        .match(filters)
      if (error) throw error
      const groupMap = new Map<string, { label: string; count: number }>()
      for (const row of data) {
        const key = row.content_type_id?.toString() ?? 'none'
        const label = row.content_type_title ?? 'No Content Type'
        groupMap.set(key, {
          label,
          count: (groupMap.get(key)?.count ?? 0) + 1,
        })
      }
      return Array.from(groupMap.entries()).map(([groupKey, { label, count }]) => ({ groupKey, label, count }))
        .sort((a, b) => a.label.localeCompare(b.label))
    }
    case 'production_type': {
      // Group by production type
      const { data, error } = await supabase
        .from('tasks')
        .select('production_type_id, production_type_title', { count: 'exact', head: false })
        .match(filters)
      if (error) throw error
      const groupMap = new Map<string, { label: string; count: number }>()
      for (const row of data) {
        const key = row.production_type_id?.toString() ?? 'none'
        const label = row.production_type_title ?? 'No Production Type'
        groupMap.set(key, {
          label,
          count: (groupMap.get(key)?.count ?? 0) + 1,
        })
      }
      return Array.from(groupMap.entries()).map(([groupKey, { label, count }]) => ({ groupKey, label, count }))
        .sort((a, b) => a.label.localeCompare(b.label))
    }
    case 'language': {
      // Group by language
      const { data, error } = await supabase
        .from('tasks')
        .select('language_id, language_code', { count: 'exact', head: false })
        .match(filters)
      if (error) throw error
      const groupMap = new Map<string, { label: string; count: number }>()
      for (const row of data) {
        const key = row.language_id?.toString() ?? 'none'
        const label = row.language_code ?? 'No Language'
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