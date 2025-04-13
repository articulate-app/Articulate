import { createClient } from '../../app/lib/supabase/client'

const supabase = createClient()

export interface Task {
  id: string
  title: string
  status: string
  due_date: string
  briefing: string
  meta_title?: string
  meta_description?: string
  project_id: string
  content_type: string
  production_type: string
  language: string
  last_update: string
  is_parent_task: boolean
  project?: {
    name: string
  }
}

export async function getTasks({
  page = 1,
  pageSize = 10,
  filters = {},
  sortBy = 'last_update',
  sortOrder = 'desc'
}: {
  page?: number
  pageSize?: number
  filters?: Record<string, any>
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}) {
  const start = (page - 1) * pageSize
  const end = start + pageSize - 1

  let query = supabase
    .from('tasks')
    .select(`
      *,
      project:projects(name)
    `, { count: 'exact' })
    .order(sortBy, { ascending: sortOrder === 'asc' })
    .range(start, end)

  // Apply filters
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      query = query.eq(key, value)
    }
  })

  const { data, error, count } = await query

  if (error) {
    console.error('Error fetching tasks:', error)
    throw error
  }

  return {
    tasks: data as Task[],
    totalCount: count || 0
  }
}

export async function getTaskById(id: string) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      project:projects(name)
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching task:', error)
    throw error
  }

  return data as Task
} 