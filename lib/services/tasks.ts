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
  updated_at: string
  is_parent_task: boolean
  project?: {
    name: string
  }
}

export async function getTasks({
  page = 1,
  pageSize = 10,
  filters = {},
  sortBy = 'updated_at',
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

  try {
    // Simple direct query
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(start, end)

    console.log('Supabase response:', { 
      data: data?.length || 0, 
      error: error?.message 
    })

    if (error) {
      console.error('Supabase error details:', error)
      throw new Error(`Failed to fetch tasks: ${error.message}`)
    }

    return {
      tasks: data as Task[],
      totalCount: data?.length || 0
    }
  } catch (error) {
    console.error('Error in getTasks:', error)
    throw error
  }
}

export async function getTaskById(id: string) {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching task by ID:', error)
      throw error
    }

    return data as Task
  } catch (error) {
    console.error('Error in getTaskById:', error)
    throw error
  }
} 