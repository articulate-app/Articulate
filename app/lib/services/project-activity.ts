import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

/** changed[field] = { old?: unknown, new?: unknown } */
export type ProjectActivityFeedChanged = Record<string, { old?: unknown; new?: unknown }>

export type ProjectActivityFeedRow = {
  uid: string
  id: string | number | null
  source_id: number | null
  source_table: string | null
  project_id: number
  user_id: number | null
  task_id: number | null
  is_deleted: boolean | null
  timestamp: string | null
  created_at: string | null
  details: string | null
  type: string | null
  assigned_to_name: string | null
  assigned_to_email: string | null
  assigned_to_photo: string | null
  task_name: string | null
  project_status_color: string | null
  title: string | null
  event: string | null
  action: string | null
  summary: string | null
  entity_type: string | null
  event_type: string | null
  changed_fields: string[] | null
  changed: ProjectActivityFeedChanged | null
  details_json: Record<string, unknown> | null
  record_key: string | null
}

export type ProjectActivityFeedSortField =
  | "created_at"
  | "timestamp"
  | "assigned_to_name"
  | "task_name"
  | "title"
  | "event"
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
  "uid,source_id,source_table,project_id,user_id,action,details,task_id,type,is_deleted,timestamp,task_name,assigned_to_name,assigned_to_photo,project_status_color,details_json,entity_type,event_type,record_key,changed,changed_fields,title,summary"

function normalizeProjectActivityFeedRow(row: Record<string, unknown>, index: number): ProjectActivityFeedRow {
  const rawTitle = typeof row.title === "string" ? row.title : null
  const rawEvent = typeof row.event === "string" ? row.event : null
  const rawAction = typeof row.action === "string" ? row.action : null
  const title = rawEvent ?? rawTitle
  const summary =
    (typeof row.summary === "string" ? row.summary : null) ??
    rawAction ??
    rawTitle
  const timestamp =
    (typeof row.timestamp === "string" ? row.timestamp : null) ??
    (typeof row.created_at === "string" ? row.created_at : null) ??
    (typeof row.updated_at === "string" ? row.updated_at : null)

  const userName =
    (typeof row.assigned_to_name === "string" ? row.assigned_to_name : null) ??
    (typeof row.full_name === "string" ? row.full_name : null) ??
    (typeof row.email === "string" ? row.email : null) ??
    "System"

  const userPhoto =
    (typeof row.assigned_to_photo === "string" ? row.assigned_to_photo : null) ??
    (typeof row.photo === "string" ? row.photo : null)

  const uidCandidate =
    (typeof row.uid === "string" && row.uid.trim()) ||
    (typeof row.id === "string" && row.id.trim()) ||
    (typeof row.id === "number" ? String(row.id) : "") ||
    ""

  const fallbackUid = `${timestamp ?? "no-ts"}-${row.project_id ?? "no-project"}-${title ?? "untitled"}-${index}`

  return {
    uid: uidCandidate || fallbackUid,
    id:
      (typeof row.source_id === "number" && Number.isFinite(row.source_id) ? row.source_id : null) ??
      (typeof row.id === "number" && Number.isFinite(row.id) ? row.id : null) ??
      (typeof row.id === "string" ? row.id : null),
    source_id: typeof row.source_id === "number" ? row.source_id : null,
    source_table: typeof row.source_table === "string" ? row.source_table : null,
    project_id: typeof row.project_id === "number" ? row.project_id : 0,
    user_id: typeof row.user_id === "number" ? row.user_id : null,
    task_id: typeof row.task_id === "number" ? row.task_id : null,
    is_deleted: typeof row.is_deleted === "boolean" ? row.is_deleted : null,
    timestamp,
    created_at:
      (typeof row.created_at === "string" ? row.created_at : null) ??
      timestamp,
    details: typeof row.details === "string" ? row.details : null,
    type: typeof row.type === "string" ? row.type : null,
    assigned_to_name: userName,
    assigned_to_email:
      (typeof row.assigned_to_email === "string" ? row.assigned_to_email : null) ??
      (typeof row.email === "string" ? row.email : null),
    assigned_to_photo: userPhoto,
    task_name: typeof row.task_name === "string" ? row.task_name : null,
    project_status_color: typeof row.project_status_color === "string" ? row.project_status_color : null,
    title,
    event: rawEvent ?? null,
    action: rawAction ?? null,
    summary,
    entity_type: typeof row.entity_type === "string" ? row.entity_type : null,
    event_type:
      (typeof row.event_type === "string" ? row.event_type : null) ??
      (typeof row.event === "string" ? row.event : null),
    changed_fields: Array.isArray(row.changed_fields) ? (row.changed_fields.filter((v): v is string => typeof v === "string")) : null,
    changed:
      row.changed && typeof row.changed === "object"
        ? (row.changed as ProjectActivityFeedChanged)
        : null,
    details_json:
      row.details_json && typeof row.details_json === "object"
        ? (row.details_json as Record<string, unknown>)
        : null,
    record_key: typeof row.record_key === "string" ? row.record_key : null,
  }
}

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

  const normalized = ((data as Record<string, unknown>[] | null) ?? []).map((row, index) =>
    normalizeProjectActivityFeedRow(row, index),
  )
  return { data: normalized, error }
}

function toDbSortField(field: ProjectActivityFeedSortField): string {
  if (field === "created_at") return "timestamp"
  if (field === "event") return "title"
  return field
}

function applyOrder(query: any, sort: ProjectActivityFeedSortConfig) {
  const asc = sort.direction === "asc"
  const dbSortField = toDbSortField(sort.field)
  return query.order(dbSortField, { ascending: asc }).order("uid", { ascending: asc })
}

function applyCursorFilter(query: any, cursor: ProjectActivityFeedCursor) {
  const asc = cursor.sortDirection === "asc"
  const op = asc ? "gt" : "lt"
  const dbSortField = toDbSortField(cursor.sortField)

  if (cursor.lastValue == null || cursor.lastValue === "") {
    return query.or(`uid.${op}.${cursor.lastUid}`)
  }
  return query.or(
    `${dbSortField}.${op}.${cursor.lastValue},and(${dbSortField}.eq.${cursor.lastValue},uid.${op}.${cursor.lastUid})`
  )
}

function applyFilters(query: any, filters: ProjectActivityFeedFilters | null | undefined) {
  if (!filters) return query

  const search = filters.search?.trim()
  if (search) {
    const term = `%${search}%`
    query = query.or(
      `title.ilike.${term},summary.ilike.${term},action.ilike.${term},task_name.ilike.${term},assigned_to_name.ilike.${term},entity_type.ilike.${term},event_type.ilike.${term}`
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
  if (process.env.NODE_ENV !== "production") {
    // Useful for quickly validating feed payload shape while iterating on tab rendering.
    console.debug("[project-activity] raw response", {
      projectId,
      rowCount: Array.isArray(data) ? data.length : 0,
      error: error ? String((error as { message?: string })?.message ?? error) : null,
    })
  }
  const normalized = ((data as Record<string, unknown>[] | null) ?? []).map((row, index) =>
    normalizeProjectActivityFeedRow(row, index),
  )
  return { data: normalized, error }
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


