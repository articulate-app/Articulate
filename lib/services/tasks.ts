import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { Task } from '../../app/lib/types/tasks'

// Create a client-side Supabase client
const supabase = createClientComponentClient()

// Function to check authentication state
async function checkAuth() {
  const { data: { session }, error } = await supabase.auth.getSession()
  return session
}

/**
 * Fetch a list of tasks with filters, pagination, and cancellation support.
 * @param signal AbortSignal for cancellation (from React Query)
 * @param cursor Pagination cursor
 * @param pageSize Number of tasks per page
 * @param filters Filtering options
 * @param sortBy Sort field
 * @param sortOrder Sort order
 * @param searchQuery Search string
 */
export async function getTasks({
  signal,
  cursor = 0,
  pageSize = 100,
  filters = {},
  sortBy = 'id',
  sortOrder = 'asc',
  searchQuery,
  fields = `id, title, content_type_id, delivery_date, publication_date, updated_at, assigned_user:users!fk_tasks_assigned_to_id(id,full_name), projects:projects!project_id_int(id,name,color), project_statuses:project_status_id(id,name,color), content_type_title, production_type_id, production_type_title, language_id, language_code, copy_post, briefing, notes`
}: {
  signal: AbortSignal
  cursor?: number
  pageSize?: number
  filters?: {
    assignedTo?: string[]
    status?: string[]
    deliveryDate?: { from?: Date; to?: Date }
    publicationDate?: { from?: Date; to?: Date }
    project?: string[]
    contentType?: string[]
    productionType?: string[]
    language?: string[]
    channels?: string[]
  }
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  searchQuery?: string
  fields?: string
}): Promise<Task[]> {
  try {
    const supabase = createClientComponentClient()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      throw new Error(`Session error: ${sessionError.message}`)
    }
    if (!session) {
      throw new Error('Not authenticated')
    }
    let query = supabase
      .from('tasks')
      .select(fields)
      .abortSignal(signal)
    if (searchQuery) {
      query = query.textSearch('search_vector', searchQuery, { config: 'english', type: 'plain' })
    }
    if (filters.assignedTo?.length) {
      query = query.in('assigned_to_id', filters.assignedTo)
    }
    if (filters.status?.length) {
      // Filter by project_status_name field instead of joined table
      query = query.in('project_status_name', filters.status)
    }
    if (filters.deliveryDate?.from) {
      query = query.gte('delivery_date', filters.deliveryDate.from.toISOString())
    }
    if (filters.deliveryDate?.to) {
      query = query.lte('delivery_date', filters.deliveryDate.to.toISOString())
    }
    if (filters.publicationDate?.from) {
      query = query.gte('publication_date', filters.publicationDate.from.toISOString())
    }
    if (filters.publicationDate?.to) {
      query = query.lte('publication_date', filters.publicationDate.to.toISOString())
    }
    if (filters.project?.length) {
      query = query.in('project_id_int', filters.project)
    }
    if (filters.contentType?.length) {
      query = query.in('content_type_id', filters.contentType)
    }
    if (filters.productionType?.length) {
      query = query.in('production_type_id', filters.productionType)
    }
    if (filters.language?.length) {
      query = query.in('language_id', filters.language)
    }
    if (filters.channels?.length) {
      query = query.contains('channels', filters.channels)
    }
    query = query.order(sortBy, { ascending: sortOrder === 'asc' })
    query = query.range(cursor, cursor + pageSize - 1)
    const { data, error } = await query
    if (error) {
      throw new Error(`Failed to fetch tasks: ${error.message}`)
    }
    // Transform data to match canonical Task type
    const tasks: Task[] = (data || []).map((task: any) => ({
      id: String(task.id),
      title: task.title,
      notes: task.notes,
      briefing: task.briefing,
      delivery_date: task.delivery_date,
      publication_date: task.publication_date,
      assigned_to_id: task.assigned_to_id ? String(task.assigned_to_id) : undefined,
      project_id_int: task.project_id_int,
      content_type_id: task.content_type_id ? String(task.content_type_id) : undefined,
      content_type_title: task.content_type_title, // <-- ensure this is always mapped
      production_type_id: task.production_type_id ? String(task.production_type_id) : undefined,
      production_type_title: task.production_type_title,
      language_id: task.language_id ? String(task.language_id) : undefined,
      language_code: task.language_code,
      project_status_id: task.project_status_id ? String(task.project_status_id) : undefined,
      users: task.assigned_user ? {
        id: String(task.assigned_user.id),
        full_name: task.assigned_user.full_name
      } : undefined,
      projects: task.projects || null,
      project_statuses: task.project_statuses || null,
      content_types: Array.isArray(task.content_types) ? task.content_types.map((ct: any) => ({
        title: ct.title
      })) : [],
      production_types: Array.isArray(task.production_types) ? task.production_types.map((pt: any) => ({
        title: pt.title
      })) : [],
      languages: Array.isArray(task.languages) ? task.languages.map((l: any) => ({
        code: l.code
      })) : [],
      meta_title: task.meta_title,
      meta_description: task.meta_description,
      keyword: task.keyword
    }))
    return tasks
  } catch (error) {
    throw error
  }
}

/**
 * Fetch a single task by ID with cancellation support.
 * @param signal AbortSignal for cancellation (from React Query)
 * @param id Task ID
 */
export async function getTaskById({ signal, id }: { signal: AbortSignal, id: string }) {
  const supabase = createClientComponentClient()
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw new Error(`Session error: ${sessionError.message}`)
  if (!session) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, assigned_to_id, content_type_id, production_type_id, language_id, project_status_id, assigned_to_name, project_name, project_color, project_status_name, project_status_color, content_type_title, production_type_title, language_code, delivery_date, publication_date, updated_at, project_id_int, copy_post, briefing, notes, meta_title, meta_description, keyword, parent_task_id_int, channel_names')
    .eq('id', id)
    .abortSignal(signal)
    .single()

  if (error) throw new Error(`Failed to fetch task: ${error.message}`)
  return data as Task
}

/**
 * Fetches all tasks for a given month, filtered by the specified date field and additional filters.
 * @param date - Any date within the target month
 * @param dateField - 'delivery_date' or 'publication_date'
 * @param filters - Additional filters to apply
 * @returns Array of Task objects for the month
 */
export async function getTasksForMonth(
  date: Date,
  dateField: 'delivery_date' | 'publication_date',
  filters: any = {},
  searchQuery?: string,
  fields?: string,
  signal?: AbortSignal
): Promise<Task[]> {
  // Calculate first and last day of the month
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0, 23, 59, 59, 999);

  // Build date filter
  const dateFilter = {
    ...(dateField === 'delivery_date' && { deliveryDate: { from: firstDay, to: lastDay } }),
    ...(dateField === 'publication_date' && { publicationDate: { from: firstDay, to: lastDay } })
  };

  // Merge with other filters
  const mergedFilters = { ...filters, ...dateFilter };

  // Fetch all tasks for the month (assume <500 tasks per month)
  const realSignal = signal || new AbortController().signal;
  // Use the default fields string if not provided
  const defaultFields = `id, title, project_id_int, project_status_name, content_type_id, content_type_title, production_type_id, production_type_title, language_id, language_code, delivery_date, publication_date, assigned_user:users!fk_tasks_assigned_to_id(id,full_name), projects:projects!project_id_int(id,name,color), project_statuses:project_status_id(id,name,color)`;
  const tasks = await getTasks({
    signal: realSignal,
    cursor: 0,
    pageSize: 500,
    filters: mergedFilters,
    sortBy: dateField,
    sortOrder: 'asc',
    searchQuery,
    fields: fields || defaultFields,
  });
  return tasks;
}

/**
 * Update a task's delivery_date or publication_date in Supabase.
 * @param taskId - The task's ID
 * @param dateField - 'delivery_date' or 'publication_date'
 * @param newDate - The new date (YYYY-MM-DD)
 */
export async function updateTaskDate(
  taskId: number,
  dateField: 'delivery_date' | 'publication_date',
  newDate: string
): Promise<Task> {
  const supabase = createClientComponentClient();
  const { data, error } = await supabase
    .from('tasks')
    .update({ [dateField]: newDate })
    .eq('id', taskId)
    .select()
    .single();
  if (error) throw new Error(`Failed to update task: ${error.message}`);
  return data as Task;
}

/**
 * Add a new task and link channels (if provided).
 * @param values - Task fields and channels (array of channel IDs)
 * @returns The inserted task
 */
export async function addTask({ channels, ...values }: any): Promise<Task> {
  const supabase = createClientComponentClient()

  // Insert the task (exclude channels)
  const { data: taskData, error: taskError } = await supabase
    .from('tasks')
    .insert([{ ...values, parent_task_id_int: values.parent_task_id_int ?? null }])
    .select()
    .single()

  if (taskError || !taskData) {
    throw new Error(`Failed to add task: ${taskError?.message || 'Unknown error'}`)
  }

  // Insert into task_channels if channels are provided
  if (channels && Array.isArray(channels) && channels.length > 0) {
    const channelRows = channels.map((channelId: string | number) => ({
      task_id: taskData.id,
      channel_id: typeof channelId === 'string' ? parseInt(channelId, 10) : channelId,
    }))
    const { error: channelError } = await supabase
      .from('task_channels')
      .insert(channelRows)
    if (channelError) {
      throw new Error(`Task created, but failed to link channels: ${channelError.message}`)
    }
  }

  return taskData as Task
} 