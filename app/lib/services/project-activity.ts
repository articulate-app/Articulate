import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

/** changed[field] = { old?: unknown, new?: unknown } */
export type ProjectActivityFeedChanged = Record<string, { old?: unknown; new?: unknown }>

export type ProjectActivityFeedRow = {
  uid: string
  project_id: number
  user_id: number
  task_id: number | null
  is_deleted: boolean | null
  timestamp: string
  assigned_to_name: string | null
  assigned_to_photo: string | null
  task_name: string | null
  project_status_color: string | null
  title: string | null
  summary: string | null
  entity_type: string | null
  event_type: string | null
  changed_fields: string[] | null
  changed: ProjectActivityFeedChanged | null
  details_json: Record<string, unknown> | null
  record_key: string | null
}

export type ProjectActivityFeedSortField =
  | "timestamp"
  | "assigned_to_name"
  | "task_name"
  | "title"
  | "entity_type"
  | "event_type"

export type ProjectActivityFeedSortConfig = {
  field: ProjectActivityFeedSortField
  direction: "asc" | "desc"
}

const DEFAULT_SORT: ProjectActivityFeedSortConfig = {
  field: "timestamp",
  direction: "desc",
}

/** Keyset pagination cursor - last row values for the active sort field + uid tie-breaker */
export interface ProjectActivityFeedCursor {
  sortField: ProjectActivityFeedSortField
  sortDirection: "asc" | "desc"
  lastValue: string | null
  lastUid: string
}

export interface ProjectActivityFeedFilters {
  search?: string | null
  userIds?: number[] | null
  actions?: string[] | null
  fromTimestamp?: string | null
  toTimestamp?: string | null
}

const ACTIVITY_SELECT =
  "uid,project_id,user_id,task_id,is_deleted,timestamp,assigned_to_name,assigned_to_photo,task_name,project_status_color,title,summary,entity_type,event_type,changed_fields,changed,details_json,record_key"

export async function listProjectActivityFeed(args: { projectId: number; limit?: number }) {
  const { projectId, limit = 50 } = args
  const supabase = createClientComponentClient()

  const { data, error } = await supabase
    .from("project_activity_feed")
    .select(ACTIVITY_SELECT)
    .eq("project_id", projectId)
    .or("is_deleted.is.null,is_deleted.eq.false")
    .order("timestamp", { ascending: false })
    .order("uid", { ascending: false })
    .limit(limit)

  return { data: (data as ProjectActivityFeedRow[] | null) ?? null, error }
}

function applyOrder(query: any, sort: ProjectActivityFeedSortConfig) {
  const asc = sort.direction === "asc"
  return query.order(sort.field, { ascending: asc }).order("uid", { ascending: asc })
}

function applyCursorFilter(query: any, cursor: ProjectActivityFeedCursor) {
  const asc = cursor.sortDirection === "asc"
  const op = asc ? "gt" : "lt"

  if (cursor.lastValue == null || cursor.lastValue === "") {
    return query.or(`uid.${op}.${cursor.lastUid}`)
  }
  return query.or(
    `${cursor.sortField}.${op}.${cursor.lastValue},and(${cursor.sortField}.eq.${cursor.lastValue},uid.${op}.${cursor.lastUid})`
  )
}

function applyFilters(query: any, filters: ProjectActivityFeedFilters | null | undefined) {
  if (!filters) return query

  const search = filters.search?.trim()
  if (search) {
    const term = `%${search}%`
    query = query.or(
      `title.ilike.${term},summary.ilike.${term},task_name.ilike.${term},assigned_to_name.ilike.${term},entity_type.ilike.${term},event_type.ilike.${term}`
    )
  }

  if (filters.userIds?.length) {
    query = query.in("user_id", filters.userIds)
  }

  if (filters.actions?.length) {
    query = query.in("title", filters.actions)
  }

  if (filters.fromTimestamp) {
    query = query.gte("timestamp", filters.fromTimestamp)
  }

  if (filters.toTimestamp) {
    query = query.lte("timestamp", filters.toTimestamp)
  }

  return query
}

/**
 * Fetch a page of project activity feed with keyset pagination.
 * Sort changes require refetch from page 1 (caller resets infinite query).
 */
export async function listProjectActivityFeedPage(args: {
  projectId: number
  pageSize?: number
  sort?: ProjectActivityFeedSortConfig
  cursor?: ProjectActivityFeedCursor
  filters?: ProjectActivityFeedFilters | null
}) {
  const { projectId, pageSize = 50, sort = DEFAULT_SORT, cursor, filters } = args
  const supabase = createClientComponentClient()

  let query = supabase
    .from("project_activity_feed")
    .select(ACTIVITY_SELECT)
    .eq("project_id", projectId)
    .or("is_deleted.is.null,is_deleted.eq.false")

  query = applyFilters(query, filters)
  query = applyOrder(query, sort)

  if (cursor) {
    query = applyCursorFilter(query, cursor)
  }

  query = query.limit(pageSize)

  const { data, error } = await query
  return { data: (data as ProjectActivityFeedRow[] | null) ?? null, error }
}

/**
 * Fetch distinct title values from project activity (for Event filter dropdown).
 * Matches what is displayed in the Event column.
 */
export async function listProjectActivityDistinctActions(projectId: number): Promise<string[]> {
  const supabase = createClientComponentClient()
  const { data } = await supabase
    .from("project_activity_feed")
    .select("title")
    .eq("project_id", projectId)
    .or("is_deleted.is.null,is_deleted.eq.false")
    .limit(500)

  const seen = new Set<string>()
  for (const row of (data ?? []) as { title: string | null }[]) {
    if (row?.title) seen.add(row.title)
  }
  return Array.from(seen).sort()
}


