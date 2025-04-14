import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    },
    global: {
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    }
  }
)

console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
console.log('Supabase client initialized:', !!supabase)

export interface Task {
  id: string
  title: string
  status: string
  due_date: string
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
  console.log('Fetching tasks with params:', { page, pageSize, filters, sortBy, sortOrder })
  
  const start = (page - 1) * pageSize
  const end = start + pageSize - 1

  let query = supabase
    .from('tasks')
    .select(`
      *,
      project:projects(name)
    `)
    .order(sortBy, { ascending: sortOrder === 'asc' })
    .range(start, end)

  // Apply filters
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      query = query.eq(key, value)
    }
  })

  const { data, error, count } = await query

  console.log('Supabase response:', { data, error, count })

  if (error) {
    console.error('Supabase error:', error)
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
    throw error
  }

  return data as Task
} 