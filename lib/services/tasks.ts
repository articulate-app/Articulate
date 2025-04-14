import { createClient } from '@supabase/supabase-js'

// Log environment variables (without sensitive data)
console.log('Environment check:', {
  hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  hasKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  urlLength: process.env.NEXT_PUBLIC_SUPABASE_URL?.length,
  keyLength: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length
})

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

console.log('Supabase client initialized:', {
  hasClient: !!supabase,
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  error: !supabase ? 'Failed to initialize client' : undefined
})

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
    // First, let's check if we can access the table at all
    const { data: tableCheck, error: tableError } = await supabase
      .from('tasks')
      .select('count', { count: 'exact', head: true })

    console.log('Table check response:', {
      hasData: !!tableCheck,
      count: tableCheck,
      error: tableError?.message
    })

    if (tableError) {
      console.error('Table check error:', tableError)
      throw new Error(`Failed to access tasks table: ${tableError.message}`)
    }

    // Now try to fetch actual data
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range((page - 1) * pageSize, page * pageSize - 1)

    console.log('Data fetch response:', {
      hasData: !!data,
      dataLength: data?.length,
      firstItem: data?.[0],
      error: error?.message
    })

    if (error) {
      console.error('Data fetch error:', error)
      throw new Error(`Failed to fetch tasks: ${error.message}`)
    }

    return {
      tasks: data as Task[],
      totalCount: tableCheck || 0
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