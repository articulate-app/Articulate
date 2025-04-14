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
    // First, let's check the RLS policies
    const { data: policies, error: policiesError } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })

    console.log('RLS check response:', { policies, error: policiesError })

    // Then try to fetch the actual data
    let query = supabase
      .from('tasks')
      .select('*', { count: 'exact' })
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(start, end)

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        query = query.eq(key, value)
      }
    })

    const { data, error, count } = await query

    console.log('Supabase response:', { 
      data: data?.length || 0, 
      error: error?.message, 
      count,
      query: 'tasks select query'
    })

    if (error) {
      console.error('Supabase error details:', error)
      throw new Error(`Failed to fetch tasks: ${error.message}`)
    }

    return {
      tasks: data as Task[],
      totalCount: count || 0
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