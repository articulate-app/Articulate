import { createClient } from '@supabase/supabase-js'

// Log environment variables (without sensitive data)
console.log('Environment check:', {
  hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  hasKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  urlLength: process.env.NEXT_PUBLIC_SUPABASE_URL?.length,
  keyLength: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length
})

// Create a client-side Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
)

console.log('Supabase client initialized:', {
  hasClient: !!supabase,
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  error: !supabase ? 'Failed to initialize client' : undefined
})

export interface Task {
  id: number
  title: string
  project_status_id: number
  delivery_date: string
  publication_date: string
  notes: string
  briefing: string
  attachment: string
  copy_post: string
  key_visual: string
  related_products: string
  linkbuilding: string
  keyword: string
  meta_title: string
  meta_description: string
  h1: string
  h2: string
  alt_text: string
  filename: string
  internal_links: string
  tags: string
  category: string
  secondary_keywords: string
  is_parent_task: boolean
  is_deleted: boolean
  created_at: string
  updated_at: string
  synced_at: string
  production_type_id: number
  language_id: number
  briefing_type_id: number | null
  project_id_int: number
  content_type_id: number
  assigned_to_id: number
  parent_task_id_int: number | null
  projects?: {
    title: string
  }
  project_statuses?: {
    title: string
  }
  content_types?: {
    title: string
  }
  production_types?: {
    title: string
  }
  languages?: {
    title: string
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

    // Now try to fetch actual data with joins
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        projects(title),
        project_statuses(title),
        content_types(title),
        production_types(title),
        languages(title)
      `)
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
      .select(`
        *,
        projects(title),
        project_statuses(title),
        content_types(title),
        production_types(title),
        languages(title)
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching task:', error)
      throw new Error(`Failed to fetch task: ${error.message}`)
    }

    return data as Task
  } catch (error) {
    console.error('Error in getTaskById:', error)
    throw error
  }
} 