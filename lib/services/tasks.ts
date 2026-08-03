import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { Task } from '../../app/lib/types/tasks'
import type { TaskListRow } from '@/lib/types/task-list-view'

// Create a client-side Supabase client
const supabase = createClientComponentClient()

/**
 * Format a Date as a `YYYY-MM-DD` string using its LOCAL calendar components.
 * Unlike `Date.prototype.toISOString().slice(0, 10)`, this does not convert to
 * UTC, so a local-midnight date is not shifted to the previous day in
 * positive-offset timezones (e.g. UTC+1). Use this for month-range bounds.
 */
function toLocalYmd(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

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
    .select('id, title, assigned_to_id, content_type_id, production_type_id, language_id, project_status_id, assigned_to_name, project_name, project_color, project_status_name, project_status_color, content_type_title, production_type_title, language_code, delivery_date, publication_date, updated_at, project_id_int, copy_post, briefing, notes, meta_title, meta_description, keyword, secondary_keywords, parent_task_id_int, channel_names')
    .eq('id', id)
    .abortSignal(signal)
    .maybeSingle()

  if (error) throw new Error(`Failed to fetch task: ${error.message}`)
  if (!data) throw new Error(`Task not found: ${id}`)
  return data as Task
}

/** Lightweight title lookup for center-pane tabs (avoids full task select). */
export async function getTaskTitleById({
  signal,
  id,
}: {
  signal: AbortSignal
  id: string
}): Promise<string | null> {
  const map = await getTaskTitlesByIds({ signal, ids: [id] })
  return map.get(String(id)) ?? null
}

/** Batch title lookup for center-pane tabs (one request for many open tabs). */
export async function getTaskTitlesByIds({
  signal,
  ids,
}: {
  signal: AbortSignal
  ids: string[]
}): Promise<Map<string, string>> {
  const unique = Array.from(
    new Set(
      ids
        .map((id) => String(id).trim())
        .filter((id) => id.length > 0 && Number.isFinite(Number(id))),
    ),
  )
  const out = new Map<string, string>()
  if (unique.length === 0) return out

  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title")
    .in("id", unique.map(Number))
    .abortSignal(signal)
  if (error) throw new Error(`Failed to fetch task titles: ${error.message}`)

  for (const row of Array.isArray(data) ? data : []) {
    const id = row?.id != null ? String(row.id) : ""
    const title = typeof row?.title === "string" ? row.title.trim() : ""
    if (id && title) out.set(id, title)
  }
  return out
}

/** Batch suggestion title lookup for center-pane tabs. */
export async function getSuggestionTitlesByIds({
  signal,
  ids,
}: {
  signal: AbortSignal
  ids: string[]
}): Promise<Map<string, string>> {
  const unique = Array.from(
    new Set(
      ids
        .map((id) => String(id).trim())
        .filter((id) => id.length > 0 && Number.isFinite(Number(id))),
    ),
  )
  const out = new Map<string, string>()
  if (unique.length === 0) return out

  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("task_suggestions")
    .select("id, proposed_title, ai_title")
    .in("id", unique.map(Number))
    .abortSignal(signal)
  if (error) throw new Error(`Failed to fetch suggestion titles: ${error.message}`)

  for (const row of Array.isArray(data) ? data : []) {
    const id = row?.id != null ? String(row.id) : ""
    const title =
      (typeof row?.proposed_title === "string" && row.proposed_title.trim()) ||
      (typeof row?.ai_title === "string" && row.ai_title.trim()) ||
      ""
    if (id && title) out.set(id, title)
  }
  return out
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
  // Cursor-based stream fetch via RPC (single endpoint).
  // We keep the existing behavior: month range is derived from `date` + `dateField`.
  const year = date.getFullYear()
  const month = date.getMonth()
  const monthStart = new Date(year, month, 1)
  const monthNextStart = new Date(year, month + 1, 1)

  // Format from LOCAL date components. Using toISOString() here would convert the
  // local-midnight date to UTC and, in positive-offset timezones (e.g. UTC+1),
  // shift it back a day — producing an inclusive start of the previous month's
  // last day and an exclusive bound of this month's last day, which drops tasks
  // on the final day of the month. The bounds must be [first day, next-month first day).
  const monthStartStr = toLocalYmd(monthStart)
  const monthNextStartStr = toLocalYmd(monthNextStart)

  const parseNumList = (v: any): number[] | null => {
    if (!v) return null
    const arr = Array.isArray(v) ? v : [v]
    const nums = arr
      .flatMap((x: any) => String(x ?? '').split(','))
      .map((x: string) => Number.parseInt(x.trim(), 10))
      .filter((n: number) => Number.isFinite(n))
    return nums.length ? nums : null
  }

  const parseStringList = (v: any): string[] | null => {
    if (!v) return null
    const arr = Array.isArray(v) ? v : [v]
    const out = arr
      .flatMap((x: any) => String(x ?? '').split(','))
      .map((x: string) => x.trim())
      .filter(Boolean)
    return out.length ? out : null
  }

  const projectIds = parseNumList(filters?.project)
  const assigneeIds = parseNumList(filters?.assignedTo)
  const statusNames = parseStringList(filters?.status)
  const contentTypeIds = parseNumList(filters?.contentType)
  const productionTypeIds = parseNumList(filters?.productionType)
  const languageIds = parseNumList(filters?.language)

  let cursor: any | null = null
  const out: TaskListRow[] = []

  // Best-effort cancellation: if the caller provides an AbortSignal, bail between pages.
  const isAborted = () => Boolean(signal?.aborted)

  for (let page = 0; page < 20; page++) {
    if (isAborted()) break

    const rpcParams = {
      p_q: searchQuery && searchQuery.trim().length > 0 ? searchQuery : null,
      p_project_ids: projectIds,
      p_status_names: statusNames,
      p_assignee_ids: assigneeIds,
      p_content_type_ids: contentTypeIds,
      p_production_type_ids: productionTypeIds,
      p_language_ids: languageIds,
      p_is_overdue: null,
      p_is_publication_overdue: null,

      p_group_by: 'all',
      p_group_order: null,

      p_row_sort_by: dateField,
      p_row_sort_order: 'asc',

      p_limit: 500,
      p_cursor: cursor,

      p_delivery_date_gte: dateField === 'delivery_date' ? monthStartStr : null,
      p_delivery_date_lt: dateField === 'delivery_date' ? monthNextStartStr : null,
      p_publication_date_gte: dateField === 'publication_date' ? monthStartStr : null,
      p_publication_date_lt: dateField === 'publication_date' ? monthNextStartStr : null,

      p_channels: null,
    }

    const supabase = createClientComponentClient()
    const { data, error } = await supabase.rpc('task_list_stream_grouped_v2', {
      ...rpcParams,
      p_stop_at_group_boundary: false,
    } as any)
    if (error) throw new Error(`Failed to fetch tasks: ${error.message}`)

    const payload =
      (data as { rows?: (TaskListRow & { _group_key?: string })[]; next_cursor?: any }) || {}
    const rows = payload.rows ?? []
    out.push(...(rows as TaskListRow[]))

    const next = payload.next_cursor ?? null
    if (next == null || rows.length === 0) break
    cursor = next
  }

  const toTask = (row: TaskListRow): Task => {
    const assignedId = row.assigned_to_id != null ? String(row.assigned_to_id) : null
    return {
      id: String(row.id),
      title: row.title ?? '',
      delivery_date: row.delivery_date ?? undefined,
      publication_date: row.publication_date ?? undefined,
      assigned_to_id: assignedId,
      project_id_int: row.project_id_int ?? null,
      project_name: row.project_name ?? undefined,
      content_type_id: row.content_type_id != null ? String(row.content_type_id) : undefined,
      production_type_id: row.production_type_id != null ? String(row.production_type_id) : undefined,
      language_id: row.language_id != null ? String(row.language_id) : undefined,
      project_status_id: row.project_status_id != null ? String(row.project_status_id) : undefined,
      project_status_name: row.project_status_name ?? undefined,
      project_status_color: row.project_status_color ?? undefined,
      users:
        row.assigned_to_name && assignedId
          ? { id: assignedId, full_name: row.assigned_to_name }
          : undefined,
      projects: row.project_name
        ? { id: row.project_id_int || 0, name: row.project_name, color: row.project_color || undefined }
        : null,
      project_statuses: row.project_status_name
        ? { id: row.project_status_id || 0, name: row.project_status_name, color: row.project_status_color || undefined }
        : null,
      content_types: row.content_type_title ? [{ title: row.content_type_title }] : [],
      production_types: row.production_type_title ? [{ title: row.production_type_title }] : [],
      languages: row.language_code ? [{ code: row.language_code }] : [],
    }
  }

  return out.map(toTask)
}

/**
 * Fetch tasks for an arbitrary date range (inclusive start, exclusive end),
 * filtered by the selected date field and extra filters.
 */
export async function getTasksForRange(
  rangeStart: Date,
  rangeEndExclusive: Date,
  dateField: 'delivery_date' | 'publication_date',
  filters: any = {},
  searchQuery?: string,
  fields = 'id, title, assigned_to_id, project_id_int, project_status_id, project_status_name, content_type_id, content_type_title, production_type_id, production_type_title, language_id, language_code, delivery_date, publication_date, assigned_user:users!fk_tasks_assigned_to_id(id,full_name), projects:projects!project_id_int(id,name,color), project_statuses:project_status_id(id,name,color)',
  signal?: AbortSignal
): Promise<Task[]> {
  const startStr = rangeStart.toISOString().slice(0, 10)
  const endStr = rangeEndExclusive.toISOString().slice(0, 10)

  const parseNumList = (v: any): number[] | null => {
    if (!v) return null
    const arr = Array.isArray(v) ? v : [v]
    const nums = arr
      .flatMap((x: any) => String(x ?? '').split(','))
      .map((x: string) => Number.parseInt(x.trim(), 10))
      .filter((n: number) => Number.isFinite(n))
    return nums.length ? nums : null
  }

  const parseStringList = (v: any): string[] | null => {
    if (!v) return null
    const arr = Array.isArray(v) ? v : [v]
    const out = arr
      .flatMap((x: any) => String(x ?? '').split(','))
      .map((x: string) => x.trim())
      .filter(Boolean)
    return out.length ? out : null
  }

  const projectIds = parseNumList(filters?.project)
  const assigneeIds = parseNumList(filters?.assignedTo)
  const statusNames = parseStringList(filters?.status)
  const contentTypeIds = parseNumList(filters?.contentType)
  const productionTypeIds = parseNumList(filters?.productionType)
  const languageIds = parseNumList(filters?.language)

  const supabase = createClientComponentClient()
  let query = supabase
    .from('tasks')
    .select(fields)
  if (signal) {
    query = query.abortSignal(signal)
  }

  if (searchQuery && searchQuery.trim().length > 0) {
    query = query.textSearch('search_vector', searchQuery, { config: 'english', type: 'plain' })
  }
  if (projectIds?.length) query = query.in('project_id_int', projectIds)
  if (assigneeIds?.length) query = query.in('assigned_to_id', assigneeIds)
  if (statusNames?.length) query = query.in('project_status_name', statusNames)
  if (contentTypeIds?.length) query = query.in('content_type_id', contentTypeIds)
  if (productionTypeIds?.length) query = query.in('production_type_id', productionTypeIds)
  if (languageIds?.length) query = query.in('language_id', languageIds)

  if (dateField === 'delivery_date') {
    query = query.gte('delivery_date', startStr).lt('delivery_date', endStr)
  } else {
    query = query.gte('publication_date', startStr).lt('publication_date', endStr)
  }

  const pageSize = 1000
  let offset = 0
  const out: any[] = []
  while (offset < 20000) {
    const { data, error } = await query
      .order(dateField, { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error(`Failed to fetch tasks: ${error.message}`)
    const rows = data || []
    out.push(...rows)
    if (rows.length < pageSize) break
    offset += pageSize
    if (signal?.aborted) break
  }

  return out.map((task: any) => ({
    id: String(task.id),
    title: task.title,
    delivery_date: task.delivery_date ?? undefined,
    publication_date: task.publication_date ?? undefined,
    assigned_to_id: task.assigned_to_id != null ? String(task.assigned_to_id) : undefined,
    project_id_int: task.project_id_int ?? null,
    project_name: task.project_name ?? undefined,
    content_type_id: task.content_type_id != null ? String(task.content_type_id) : undefined,
    production_type_id: task.production_type_id != null ? String(task.production_type_id) : undefined,
    language_id: task.language_id != null ? String(task.language_id) : undefined,
    project_status_id: task.project_status_id != null ? String(task.project_status_id) : undefined,
    project_status_name: task.project_status_name ?? undefined,
    project_status_color: task.project_status_color ?? undefined,
    users: task.assigned_user
      ? { id: String(task.assigned_user.id), full_name: task.assigned_user.full_name }
      : undefined,
    projects: task.projects || null,
    project_statuses: task.project_statuses || null,
    content_types: task.content_type_title ? [{ title: task.content_type_title }] : [],
    production_types: task.production_type_title ? [{ title: task.production_type_title }] : [],
    languages: task.language_code ? [{ code: task.language_code }] : [],
  } as Task))
}

/**
 * Fetch one calendar month chunk via cursor-based RPC pagination.
 * Uses task_group_tasks_filtered to preserve permission and filtering behavior.
 */
export async function getTasksForCalendarMonthChunk(
  chunkKey: string,
  dateField: 'delivery_date' | 'publication_date',
  filters: any = {},
  searchQuery?: string,
  signal?: AbortSignal,
): Promise<Task[]> {
  const [yearRaw, monthRaw] = String(chunkKey).split('-')
  const year = Number.parseInt(yearRaw ?? '', 10)
  const month1Based = Number.parseInt(monthRaw ?? '', 10)
  if (!Number.isFinite(year) || !Number.isFinite(month1Based) || month1Based < 1 || month1Based > 12) {
    throw new Error(`Invalid chunkKey "${chunkKey}". Expected YYYY-MM`)
  }

  const monthStart = new Date(year, month1Based - 1, 1)
  const monthNextStart = new Date(year, month1Based, 1)
  // Format from LOCAL date components (not toISOString) to avoid a UTC shift that
  // would move the bounds back a day in positive-offset timezones. Bounds must be
  // [first day of month, first day of next month) so the last day is included.
  const monthStartStr = toLocalYmd(monthStart)
  const monthNextStartStr = toLocalYmd(monthNextStart)

  const parseNumList = (v: any): number[] | null => {
    if (!v) return null
    const arr = Array.isArray(v) ? v : [v]
    const nums = arr
      .flatMap((x: any) => String(x ?? '').split(','))
      .map((x: string) => Number.parseInt(x.trim(), 10))
      .filter((n: number) => Number.isFinite(n))
    return nums.length ? nums : null
  }

  const parseStringList = (v: any): string[] | null => {
    if (!v) return null
    const arr = Array.isArray(v) ? v : [v]
    const out = arr
      .flatMap((x: any) => String(x ?? '').split(','))
      .map((x: string) => x.trim())
      .filter(Boolean)
    return out.length ? out : null
  }

  const projectIds = parseNumList(filters?.project)
  const assigneeIds = parseNumList(filters?.assignedTo)
  const statusNames = parseStringList(filters?.status)
  const contentTypeIds = parseNumList(filters?.contentType)
  const productionTypeIds = parseNumList(filters?.productionType)
  const languageIds = parseNumList(filters?.language)
  const channels = parseStringList(filters?.channels)

  const toTask = (row: TaskListRow): Task => {
    const assignedId = row.assigned_to_id != null ? String(row.assigned_to_id) : null
    return {
      id: String(row.id),
      title: row.title ?? '',
      delivery_date: row.delivery_date ?? undefined,
      publication_date: row.publication_date ?? undefined,
      assigned_to_id: assignedId,
      project_id_int: row.project_id_int ?? null,
      project_name: row.project_name ?? undefined,
      content_type_id: row.content_type_id != null ? String(row.content_type_id) : undefined,
      production_type_id: row.production_type_id != null ? String(row.production_type_id) : undefined,
      language_id: row.language_id != null ? String(row.language_id) : undefined,
      project_status_id: row.project_status_id != null ? String(row.project_status_id) : undefined,
      project_status_name: row.project_status_name ?? undefined,
      project_status_color: row.project_status_color ?? undefined,
      users:
        row.assigned_to_name && assignedId
          ? { id: assignedId, full_name: row.assigned_to_name }
          : undefined,
      projects: row.project_name
        ? { id: row.project_id_int || 0, name: row.project_name, color: row.project_color || undefined }
        : null,
      project_statuses: row.project_status_name
        ? { id: row.project_status_id || 0, name: row.project_status_name, color: row.project_status_color || undefined }
        : null,
      content_types: row.content_type_title ? [{ title: row.content_type_title }] : [],
      production_types: row.production_type_title ? [{ title: row.production_type_title }] : [],
      languages: row.language_code ? [{ code: row.language_code }] : [],
    }
  }

  let cursor: any | null = null
  const out: Task[] = []
  const startedAt = Date.now()
  const supabase = createClientComponentClient()

  for (let page = 0; page < 60; page++) {
    if (signal?.aborted) break

    const { data, error } = await supabase.rpc('task_group_tasks_filtered', {
      p_q: searchQuery && searchQuery.trim().length > 0 ? searchQuery.trim() : null,
      p_project_ids: projectIds,
      p_status_names: statusNames,
      p_assignee_ids: assigneeIds,
      p_content_type_ids: contentTypeIds,
      p_production_type_ids: productionTypeIds,
      p_language_ids: languageIds,
      p_is_overdue: null,
      p_is_publication_overdue: null,
      p_group_by: dateField,
      p_group_key: chunkKey,
      p_row_sort_by: dateField,
      p_row_sort_order: 'asc',
      p_limit: 500,
      p_cursor: cursor,
      p_channels: channels,
      p_delivery_date_gte: dateField === 'delivery_date' ? monthStartStr : null,
      p_delivery_date_lt: dateField === 'delivery_date' ? monthNextStartStr : null,
      p_publication_date_gte: dateField === 'publication_date' ? monthStartStr : null,
      p_publication_date_lt: dateField === 'publication_date' ? monthNextStartStr : null,
    } as any)

    if (error) {
      throw new Error(`Failed to fetch calendar chunk ${chunkKey}: ${error.message}`)
    }

    const payload = (data as { rows?: TaskListRow[]; next_cursor?: any }) || {}
    const rows = payload.rows ?? []
    const mapped = rows.map(toTask)
    out.push(...mapped)

    if (process.env.NODE_ENV === 'development') {
      console.log('[CalendarChunk] page', {
        chunkKey,
        page: page + 1,
        rows: rows.length,
        totalRows: out.length,
      })
    }

    const next = payload.next_cursor ?? null
    if (next == null || rows.length === 0) break
    cursor = next
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[CalendarChunk] done', {
      chunkKey,
      totalRows: out.length,
      elapsedMs: Date.now() - startedAt,
    })
  }

  return out
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

type CreateTaskMinimalRpcArgs = {
  p_project_id: number | null
  p_title: string | null
  p_briefing: string | null
  p_project_status_id: number | null
  p_assigned_to_id: number | null
  p_content_type_id: number | null
  p_production_type_id: number | null
  p_language_id: number | null
  p_delivery_date: string | null
  p_publication_date: string | null
  p_channel_ids: number[] | null
  p_watcher_user_ids: number[] | null
}

export type CreatedTaskOptimistic = Task & {
  id: string
  assigned_to_id: string
  content_type_id: string
  production_type_id: string
  language_id: string
  project_status_id: string
  channel_ids: number[]
  channel_names: string[]
}

function toIntOrNull(value: any): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') {
    const candidate =
      (value as any).id ??
      (value as any).value ??
      (value as any).channel_id ??
      null
    if (candidate === null || candidate === undefined || candidate === '') return null
    const parsedCandidate = Number.parseInt(String(candidate), 10)
    return Number.isFinite(parsedCandidate) ? parsedCandidate : null
  }
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function toStringOrNull(value: any): string | null {
  if (value === null || value === undefined) return null
  const asString = String(value).trim()
  return asString.length > 0 ? asString : null
}

function toIntList(values: any): number[] {
  if (!Array.isArray(values)) return []
  return values
    .map((value) => toIntOrNull(value))
    .filter((value): value is number => typeof value === 'number')
}

function toDateOnlyOrNull(value: any): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const isoLike = trimmed.match(/^(\d{4}-\d{2}-\d{2})/)
    if (isoLike?.[1]) return isoLike[1]
    const parsed = new Date(trimmed)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toISOString().slice(0, 10)
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return value.toISOString().slice(0, 10)
  }
  return null
}

function parseTaskIdFromRpcResult(data: any): number | null {
  if (typeof data === 'number' && Number.isFinite(data)) return data
  if (data && typeof data === 'object') {
    const direct = toIntOrNull((data as any).task_id)
    if (direct != null) return direct
  }
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0]
    if (typeof first === 'number' && Number.isFinite(first)) return first
    if (first && typeof first === 'object') {
      return toIntOrNull((first as any).task_id)
    }
  }
  return null
}

/**
 * Add a task through the minimal RPC create_task_minimal.
 * Keep Add Task creation lightweight; channel/component planning is handled post-create.
 */
export async function addTask({
  watchers,
  ...values
}: any): Promise<CreatedTaskOptimistic> {
  const supabase = createClientComponentClient()
  const projectId = toIntOrNull(values.project_id ?? values.project_id_int)
  const assignedToId = toIntOrNull(values.assigned_to_id)
  const contentTypeId = toIntOrNull(values.content_type_id)
  const productionTypeId = toIntOrNull(values.production_type_id)
  const languageId = toIntOrNull(values.language_id)
  const projectStatusId = toIntOrNull(values.project_status_id)
  const parentTaskIdInt = toIntOrNull(values.parent_task_id_int)
  // Distinguish "watchers not provided" (undefined -> use project defaults) from
  // "watchers explicitly provided" (array -> final source of truth, incl. empty []).
  const watchersProvided = Array.isArray(watchers)
  const watcherUserIds = toIntList(watchers)
  const channelIds = toIntList(values.channels)

  const rpcArgs: CreateTaskMinimalRpcArgs = {
    p_project_id: projectId,
    p_title: toStringOrNull(values.title),
    p_briefing: toStringOrNull(values.briefing),
    p_project_status_id: projectStatusId,
    p_assigned_to_id: assignedToId,
    p_content_type_id: contentTypeId,
    p_production_type_id: productionTypeId,
    p_language_id: languageId,
    p_delivery_date: toDateOnlyOrNull(values.delivery_date),
    p_publication_date: toDateOnlyOrNull(values.publication_date),
    p_channel_ids: channelIds.length > 0 ? channelIds : null,
    // null => backend uses default project watchers; [] => task created with no watchers.
    p_watcher_user_ids: watchersProvided ? watcherUserIds : null,
  }

  console.debug('[task-create][create_task_minimal][params]', rpcArgs)
  const { data, error } = await supabase.rpc('create_task_minimal', rpcArgs)
  if (error) {
    throw new Error(`Failed to add task: ${error.message}`)
  }

  const taskId = parseTaskIdFromRpcResult(data)
  if (!taskId) {
    throw new Error('Task created but no task_id was returned by create_task_minimal')
  }
  console.info('[task-create][rpc-success]', { taskId: String(taskId) })

  // Optimistic-first create: return immediately after RPC success.
  // TaskDetails hydration now comes from task-details-bootstrap to avoid blocking on /rest/v1/tasks.
  return {
    id: String(taskId),
    title: toStringOrNull(values.title) ?? '',
    notes: toStringOrNull(values.notes) ?? undefined,
    briefing: toStringOrNull(values.briefing) ?? undefined,
    delivery_date: toStringOrNull(values.delivery_date) ?? undefined,
    publication_date: toStringOrNull(values.publication_date) ?? undefined,
    assigned_to_id: assignedToId != null ? String(assignedToId) : '',
    project_id_int: projectId ?? null,
    content_type_id: contentTypeId != null ? String(contentTypeId) : '',
    production_type_id: productionTypeId != null ? String(productionTypeId) : '',
    language_id: languageId != null ? String(languageId) : '',
    project_status_id: projectStatusId != null ? String(projectStatusId) : '',
    parent_task_id_int: parentTaskIdInt ?? null,
    channel_ids: channelIds,
    channel_names: [],
  }
}