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
  filters: Record<string, any> // filters are not used in this optimized version yet
}

async function getTaskCountsForColumn(columnName: string): Promise<Map<string, number>> {
  const countMap = new Map<string, number>()
  const { data, error } = await supabase.from('tasks').select(`${columnName}, id`)
  if (error) {
    console.error(`Error getting task counts for ${columnName}:`, error)
    return countMap
  }
  for (const row of data) {
    const key = (row as any)[columnName]?.toString() ?? 'none'
    countMap.set(key, (countMap.get(key) || 0) + 1)
  }
  return countMap
}

export async function getTaskGroups({ groupBy, filters }: GetTaskGroupsParams): Promise<TaskGroup[]> {
  switch (groupBy) {
    case 'assigned_to': {
      const taskCounts = await getTaskCountsForColumn('assigned_to_id')
      const { data, error } = await supabase.from('users').select('id, full_name')
      if (error) throw error
      return data.map(u => ({
        groupKey: u.id.toString(),
        label: u.full_name ?? 'Unnamed User',
        count: taskCounts.get(u.id.toString()) || 0,
      })).filter(group => group.count > 0).sort((a, b) => a.label.localeCompare(b.label))
    }
    case 'status': {
      // Get counts for each status ID
      const countsById = await getTaskCountsForColumn('project_status_id')
      // Get all unique statuses
      const { data: statuses, error } = await supabase.from('project_statuses').select('id, name')
      if (error) throw error

      // Aggregate counts by name, as multiple IDs can share a name
      const countsByName = new Map<string, number>()
      for (const status of statuses) {
        const countForId = countsById.get(status.id.toString()) || 0
        if (countForId > 0) {
          const currentCount = countsByName.get(status.name) || 0
          countsByName.set(status.name, currentCount + countForId)
        }
      }

      // Add count for unassigned tasks if any
      const unassignedCount = countsById.get('none') || 0
      if (unassignedCount > 0) {
        countsByName.set('No Status', unassignedCount)
      }

      // Create TaskGroup array
      return Array.from(countsByName.entries())
        .map(([name, count]) => ({
          groupKey: name, // Use name as the key
          label: name,
          count: count,
        }))
        .filter(group => group.count > 0) 
        .sort((a, b) => a.label.localeCompare(b.label)) // Simple sort by name
    }
    case 'project': {
      const taskCounts = await getTaskCountsForColumn('project_id_int')
      const { data, error } = await supabase.from('projects').select('id, name')
      if (error) throw error
      return data.map(p => ({
        groupKey: p.id.toString(),
        label: p.name ?? 'No Project',
        count: taskCounts.get(p.id.toString()) || 0,
      })).filter(group => group.count > 0).sort((a, b) => a.label.localeCompare(b.label))
    }
    case 'content_type': {
      const taskCounts = await getTaskCountsForColumn('content_type_id')
      const { data, error } = await supabase.from('content_types').select('id, title')
      if (error) throw error
      return data.map(ct => ({
        groupKey: ct.id.toString(),
        label: ct.title ?? 'No Content Type',
        count: taskCounts.get(ct.id.toString()) || 0,
      })).filter(group => group.count > 0).sort((a, b) => a.label.localeCompare(b.label))
    }
    case 'production_type': {
      const taskCounts = await getTaskCountsForColumn('production_type_id')
      const { data, error } = await supabase.from('production_types').select('id, title')
      if (error) throw error
      return data.map(pt => ({
        groupKey: pt.id.toString(),
        label: pt.title ?? 'No Production Type',
        count: taskCounts.get(pt.id.toString()) || 0,
      })).filter(group => group.count > 0).sort((a, b) => a.label.localeCompare(b.label))
    }
    case 'language': {
      const taskCounts = await getTaskCountsForColumn('language_id')
      const { data, error } = await supabase.from('languages').select('id, code')
      if (error) throw error
      return data.map(l => ({
        groupKey: l.id.toString(),
        label: l.code ?? 'No Language',
        count: taskCounts.get(l.id.toString()) || 0,
      })).filter(group => group.count > 0).sort((a, b) => a.label.localeCompare(b.label))
    }
    case 'delivery_date':
    case 'publication_date': {
      const field = groupBy as 'delivery_date' | 'publication_date';
      const { data, error } = await supabase.from('tasks').select(`${field}`);
      if (error) throw error;
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

    case 'channels': {
      const { data, error } = await supabase.from('tasks').select('channels');
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