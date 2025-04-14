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
  
  try {
    // Try to fetch all tasks first
    const { data, error } = await supabase
      .from('tasks')
      .select('*')

    console.log('Raw Supabase response:', { 
      data: data?.length || 0, 
      error: error?.message,
      firstTask: data?.[0]
    })

    if (error) {
      console.error('Supabase error details:', error)
      throw new Error(`Failed to fetch tasks: ${error.message}`)
    }

    // If we get data, then apply sorting and pagination
    if (data && data.length > 0) {
      const start = (page - 1) * pageSize
      const end = start + pageSize - 1
      
      const sortedData = [...data].sort((a, b) => {
        const aValue = a[sortBy]
        const bValue = b[sortBy]
        if (sortOrder === 'asc') {
          return aValue > bValue ? 1 : -1
        }
        return aValue < bValue ? 1 : -1
      }).slice(start, end + 1)

      return {
        tasks: sortedData as Task[],
        totalCount: data.length
      }
    }

    return {
      tasks: [],
      totalCount: 0
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