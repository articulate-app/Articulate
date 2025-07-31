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
  users?: { id: number; full_name: string }[] // Optional users data from task-edit-fields
}



export async function getTaskGroups({ groupBy, filters, users }: GetTaskGroupsParams): Promise<TaskGroup[]> {
  switch (groupBy) {
    case 'assigned_to': {
      // Query only active users from the users table
      const { data: userData, error } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('active', true)
      
      if (error) throw error
      
      return userData.map(u => ({
        groupKey: u.id.toString(),
        label: u.full_name ?? 'Unnamed User',
        count: 0, // No count for now
      })).sort((a, b) => a.label.localeCompare(b.label))
    }
    case 'status': {
      // Get all unique status names (deduplicated)
      const { data: statuses, error } = await supabase.from('project_statuses').select('name')
      if (error) throw error

      // Deduplicate by name since multiple IDs can share the same name
      const uniqueStatusNames = Array.from(new Set(statuses.map(s => s.name))).filter(Boolean)

      // Create TaskGroup array
      return uniqueStatusNames.map(name => ({
        groupKey: name, // Use name as the key
        label: name,
        count: 0, // No count for now
      })).sort((a, b) => a.label.localeCompare(b.label))
    }
    case 'project': {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('active', true)
      if (error) throw error
      return data.map(p => ({
        groupKey: p.id.toString(),
        label: p.name ?? 'No Project',
        count: 0, // No count for now
      })).sort((a, b) => a.label.localeCompare(b.label))
    }
    case 'content_type': {
      const { data, error } = await supabase.from('content_types').select('id, title')
      if (error) throw error
      return data.map(ct => ({
        groupKey: ct.id.toString(),
        label: ct.title ?? 'No Content Type',
        count: 0, // No count for now
      })).sort((a, b) => a.label.localeCompare(b.label))
    }
    case 'production_type': {
      const { data, error } = await supabase.from('production_types').select('id, title')
      if (error) throw error
      return data.map(pt => ({
        groupKey: pt.id.toString(),
        label: pt.title ?? 'No Production Type',
        count: 0, // No count for now
      })).sort((a, b) => a.label.localeCompare(b.label))
    }
    case 'language': {
      const { data, error } = await supabase.from('languages').select('id, code')
      if (error) throw error
      return data.map(l => ({
        groupKey: l.id.toString(),
        label: l.code ?? 'No Language',
        count: 0, // No count for now
      })).sort((a, b) => a.label.localeCompare(b.label))
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