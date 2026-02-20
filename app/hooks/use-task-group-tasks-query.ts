/**
 * Task list grouped stream + group-mode queries.
 *
 * CURSOR SHAPES (never mix):
 * - Stream cursor (p_force_group_key = null): { gok, gk, rsv, id } — for discovering groups.
 * - Group cursor (p_force_group_key set): { rsv, id } — row-only, for draining a single group.
 *
 * STORAGE:
 * - streamCursor: stored in stream query pages (last page's next_cursor); used only for stream mode.
 * - groupCursorByKey[groupKey]: stored in each group-mode query's pages; used only for that group.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import type { TaskListRow } from '@/lib/types/task-list-view'

type RowSortOrder = 'asc' | 'desc'
type GroupOrder = 'asc' | 'desc'

export type TaskListStreamRow = TaskListRow & {
  _group_key: string
  _group_label?: string | null
}

type RpcPage = {
  rows: TaskListStreamRow[]
  next_cursor: any | null
  page_group_key?: string | null
  page_group_done?: boolean | null
}

let currentGroupBy: string | null = null
let currentRowSortBy: string | undefined
let currentRowSortOrder: RowSortOrder = 'desc'

const taskIdToGroupKey = new Map<string, string>()
let registeredQueryClient: QueryClient | null = null
const optimisticUndrainedGroups = new Set<string>()
/** Module-level skip key: multiple hook instances share the same query; refs are per-instance so queryFn may read the wrong one. */
let skipGroupKeyModule: string | null = null

const BASE_QUERY_KEY = ['task-list-stream-grouped-v2'] as const

const uiToRowFieldMap: Record<string, keyof TaskListRow> = {
  assigned_user: 'assigned_to_name',
  users: 'assigned_to_name',
  projects: 'project_name',
  project_statuses: 'project_status_name',
  title: 'title',
  delivery_date: 'delivery_date',
  publication_date: 'publication_date',
  publication_timestamp: 'publication_date',
  updated_at: 'updated_at',
  content_type_title: 'content_type_title',
  production_type_title: 'production_type_title',
  language_code: 'language_code',
}

export function computeGroupKeyForTask(row: TaskListRow, groupBy: string | null): string | null {
  if (!groupBy) return null
  switch (groupBy) {
    case 'assigned_to':
      return row.assigned_to_id != null ? String(row.assigned_to_id) : '__unassigned__'
    case 'status':
      return row.project_status_name ?? '__unassigned__'
    case 'project':
      return row.project_id_int != null ? String(row.project_id_int) : '__no_project__'
    case 'content_type':
      return row.content_type_id != null ? String(row.content_type_id) : '__unassigned__'
    case 'production_type':
      return row.production_type_id != null ? String(row.production_type_id) : '__unassigned__'
    case 'language':
      return row.language_id != null ? String(row.language_id) : '__unassigned__'
    case 'delivery_date': {
      if (!row.delivery_date) return '__no_date__'
      const d = new Date(row.delivery_date)
      if (Number.isNaN(d.getTime())) return '__no_date__'
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    case 'publication_date': {
      if (!row.publication_date) return '__no_date__'
      const d = new Date(row.publication_date)
      if (Number.isNaN(d.getTime())) return '__no_date__'
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    default:
      return null
  }
}

function computeGroupLabelFromRow(row: TaskListRow, groupBy: string | null, groupKey: string): string {
  if (!groupBy) return groupKey
  switch (groupBy) {
    case 'assigned_to':
      return row.assigned_to_name ?? 'Unassigned'
    case 'status':
      return row.project_status_name ?? 'Unassigned'
    case 'project':
      return row.project_name ?? 'No Project'
    case 'content_type':
      return row.content_type_title ?? 'Unassigned'
    case 'production_type':
      return row.production_type_title ?? 'Unassigned'
    case 'language':
      return row.language_code ?? 'Unassigned'
    case 'delivery_date':
    case 'publication_date': {
      if (groupKey === '__no_date__') return 'No Date'
      const y = Number.parseInt(groupKey.slice(0, 4), 10)
      const m = Number.parseInt(groupKey.slice(5, 7), 10)
      if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
        const d = new Date(y, m - 1, 1)
        return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(d)
      }
      return 'No Date'
    }
    default:
      return groupKey
  }
}

export function lookupGroupKeyForTaskId(taskId: number | string): string | undefined {
  return taskIdToGroupKey.get(String(taskId))
}

function compareRowsForSort(a: TaskListRow, b: TaskListRow): number {
  if (!currentRowSortBy) return 0
  const field = uiToRowFieldMap[currentRowSortBy] ?? (currentRowSortBy as keyof TaskListRow)
  const av = a[field] as any
  const bv = b[field] as any

  if (av == null && bv == null) return 0
  if (av == null) return 1
  if (bv == null) return -1

  if (field === 'delivery_date' || field === 'publication_date' || field === 'updated_at') {
    const at = new Date(av).getTime()
    const bt = new Date(bv).getTime()
    if (Number.isNaN(at) || Number.isNaN(bt)) return String(av).localeCompare(String(bv))
    return at - bt
  }

  return String(av).localeCompare(String(bv))
}

function insertRowSorted(rows: TaskListStreamRow[], row: TaskListStreamRow): TaskListStreamRow[] {
  const withoutDup = rows.filter(r => String(r.id) !== String(row.id))
  const dest = [...withoutDup]

  if (!currentRowSortBy) {
    dest.unshift(row)
    return dest
  }

  let insertIdx = -1
  for (let i = 0; i < dest.length; i++) {
    const cmp = compareRowsForSort(row, dest[i])
    const asc = currentRowSortOrder === 'asc'
    if ((asc && cmp <= 0) || (!asc && cmp >= 0)) {
      insertIdx = i
      break
    }
  }
  if (insertIdx === -1) dest.push(row)
  else dest.splice(insertIdx, 0, row)
  return dest
}

function toNumList(value: unknown): number[] | null {
  if (value == null) return null
  const arr = Array.isArray(value) ? value : [value]
  const ids = arr
    .map(v => Number.parseInt(String(v), 10))
    .filter(n => Number.isFinite(n))
  return ids.length ? ids : null
}

function addOneDay(dateStr: string): string | null {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function buildRpcParams(args: {
  q: string
  project?: string
  filters: { [key: string]: string | string[] }
  groupBy: string | null
  groupOrder?: GroupOrder
  rowSortBy?: string
  rowSortOrder: RowSortOrder
  perPage: number
  editFields?: any
  cursor: any | null
  skipGroupKey?: string | null
  /** When set, forces the RPC to return only rows for this group (group-mode, for re-expand). */
  forceGroupKey?: string | null
}) {
  const { q, project, filters, groupBy, groupOrder, rowSortBy, rowSortOrder, perPage, editFields, cursor, skipGroupKey, forceGroupKey } = args

  const uiToViewSortMap: Record<string, string> = {
    assigned_user: 'assigned_to_name',
    users: 'assigned_to_name',
    projects: 'project_name',
    project_statuses: 'project_status_name',
    title: 'title',
    delivery_date: 'delivery_date',
    publication_date: 'publication_date',
    publication_timestamp: 'publication_date',
    updated_at: 'updated_at',
    content_type_title: 'content_type_title',
    production_type_title: 'production_type_title',
    language_code: 'language_code',
  }
  const mappedRowSortBy = rowSortBy ? uiToViewSortMap[rowSortBy] || rowSortBy : undefined

  const projectIds =
    project && project.trim().length
      ? project
          .split(',')
          .map(p => Number.parseInt(p.trim(), 10))
          .filter(n => Number.isFinite(n))
      : null

  const statusParam =
    (filters as any).project_status_name ?? (filters as any).status ?? (filters as any).project_status_id
  let statusNames: string[] | null = null
  if (statusParam) {
    const statuses = Array.isArray(statusParam) ? statusParam : [statusParam]
    const names: string[] = []
    for (const s of statuses) {
      const raw = String(s ?? '').trim()
      if (!raw) continue
      if (/^\\d+$/.test(raw) && Array.isArray(editFields?.project_statuses)) {
        const match = editFields.project_statuses.find((ps: any) => String(ps?.id) === raw)
        const name = String(match?.name ?? '').trim()
        if (name) {
          names.push(name)
          continue
        }
      }
      names.push(raw)
    }
    statusNames = names.length ? names : null
  }

  const assigneeIds = toNumList((filters as any).assigned_to_id ?? (filters as any).assignedTo)
  const contentTypeIds = toNumList((filters as any).content_type_id ?? (filters as any).contentType)
  const productionTypeIds = toNumList((filters as any).production_type_id ?? (filters as any).productionType)
  const languageIds = toNumList((filters as any).language_id ?? (filters as any).language)

  const overdueStatusParam = (filters as any).overdueStatus
  let isOverdue: boolean | null = null
  let isPublicationOverdue: boolean | null = null
  if (overdueStatusParam) {
    const overdueStatuses = Array.isArray(overdueStatusParam) ? overdueStatusParam : [overdueStatusParam]
    if (overdueStatuses.includes('delivery_overdue')) isOverdue = true
    if (overdueStatuses.includes('publication_overdue')) isPublicationOverdue = true
  }

  const channels = toNumList((filters as any).channels ?? (filters as any).channel_ids)

  const deliveryDateFrom = (filters as any).deliveryDateFrom as string | undefined
  const deliveryDateTo = (filters as any).deliveryDateTo as string | undefined
  const publicationDateFrom = (filters as any).publicationDateFrom as string | undefined
  const publicationDateTo = (filters as any).publicationDateTo as string | undefined

  const deliveryDateLt = deliveryDateTo ? addOneDay(deliveryDateTo) : null
  const publicationDateLt = publicationDateTo ? addOneDay(publicationDateTo) : null

  return {
    p_q: q && q.trim().length > 0 ? q : null,
    p_project_ids: projectIds && projectIds.length ? projectIds : null,
    p_status_names: statusNames,
    p_assignee_ids: assigneeIds,
    p_content_type_ids: contentTypeIds,
    p_production_type_ids: productionTypeIds,
    p_language_ids: languageIds,
    p_is_overdue: isOverdue,
    p_is_publication_overdue: isPublicationOverdue,
    p_group_by: groupBy && groupBy !== 'none' ? groupBy : null,
    p_group_order: groupOrder ?? null,
    p_row_sort_by: mappedRowSortBy ?? null,
    p_row_sort_order: rowSortOrder ?? null,
    p_limit: perPage,
    p_delivery_date_gte: deliveryDateFrom || null,
    p_delivery_date_lt: deliveryDateLt,
    p_publication_date_gte: publicationDateFrom || null,
    p_publication_date_lt: publicationDateLt,
    p_channels: channels,
    p_cursor: cursor,
    // CRITICAL: makes the stream drainable (never returns rows from next group early).
    p_stop_at_group_boundary: true,
    p_skip_group_key: skipGroupKey ?? null,
    p_force_group_key: forceGroupKey ?? null,
  }
}

function deriveFromPages(pages: RpcPage[]) {
  const groupKeysInOrder: string[] = []
  const groupLabelsByKey: Record<string, string> = {}
  const groupCountsByKey: Record<string, number> = {}
  const tasksByGroup: Record<string, TaskListStreamRow[]> = {}
  const isGroupDrainedByKey: Record<string, boolean> = {}

  // In boundary mode, each page belongs to exactly one group.
  for (const p of pages) {
    const pageKeyRaw =
      p.page_group_key != null
        ? String(p.page_group_key)
        : p.rows?.length
          ? String((p.rows[0] as any)._group_key ?? '')
          : ''
    const pageGroupKey = pageKeyRaw.trim()
    if (!pageGroupKey) continue

    if (!tasksByGroup[pageGroupKey]) {
      tasksByGroup[pageGroupKey] = []
      groupKeysInOrder.push(pageGroupKey)
    }

    for (const row of p.rows ?? []) {
      tasksByGroup[pageGroupKey].push(row)
      groupCountsByKey[pageGroupKey] = (groupCountsByKey[pageGroupKey] ?? 0) + 1
      if (!groupLabelsByKey[pageGroupKey]) {
        groupLabelsByKey[pageGroupKey] = String((row as any)._group_label ?? '').trim() || pageGroupKey
      }
    }

    if (p.page_group_done === true) {
      isGroupDrainedByKey[pageGroupKey] = true
      optimisticUndrainedGroups.delete(pageGroupKey)
    }
  }

  const lastPage = pages.length > 0 ? pages[pages.length - 1] : null
  const isStreamEnded = !!lastPage && lastPage.next_cursor == null
  if (isStreamEnded && lastPage) {
    const lastKeyRaw =
      lastPage.page_group_key != null
        ? String(lastPage.page_group_key)
        : lastPage.rows?.length
          ? String((lastPage.rows[0] as any)._group_key ?? '')
          : ''
    const lastKey = lastKeyRaw.trim()
    if (lastKey) isGroupDrainedByKey[lastKey] = true
  }
  for (const k of groupKeysInOrder) {
    if (typeof isGroupDrainedByKey[k] !== 'boolean') isGroupDrainedByKey[k] = false
  }

  // Keep groups with optimistic inserts "undrained" until the stream catches up.
  for (const k of Array.from(optimisticUndrainedGroups)) {
    if (typeof isGroupDrainedByKey[k] === 'boolean') {
      isGroupDrainedByKey[k] = false
    }
  }

  taskIdToGroupKey.clear()
  for (const [gk, rows] of Object.entries(tasksByGroup)) {
    for (const r of rows) taskIdToGroupKey.set(String(r.id), gk)
  }

  const currentStreamHeadGroupKey: string | null =
    lastPage && lastPage.page_group_key != null
      ? String(lastPage.page_group_key).trim()
      : lastPage?.rows?.length
        ? String((lastPage.rows[0] as any)._group_key ?? '').trim()
        : null
  const pageGroupDone = (lastPage?.page_group_done ?? false) === true

  return {
    groupKeysInOrder,
    groupLabelsByKey,
    groupCountsByKey,
    tasksByGroup,
    isGroupDrainedByKey,
    currentStreamHeadGroupKey: currentStreamHeadGroupKey || null,
    pageGroupDone,
  }
}

export interface UseTaskGroupTasksQueryOptions {
  q: string
  project?: string
  filters?: { [key: string]: string | string[] }
  groupBy: string | null
  groupOrder?: GroupOrder
  rowSortBy?: string
  rowSortOrder?: RowSortOrder
  perPage?: number
  enabled?: boolean
  editFields?: any
  /** Collapsed groups never initiate draining; pass to block runway/drain for these. */
  collapsedGroupKeys?: Set<string>
  /** Groups that were collapsed (skipped) while undrained and then re-expanded; use group-mode query. */
  groupKeysToResume?: Set<string>
}

export interface UseTaskGroupTasksQueryResult {
  tasksByGroup: Record<string, TaskListRow[]>
  groupKeysInOrder: string[]
  groupLabelsByKey: Record<string, string>
  groupCountsByKey: Record<string, number>

  /** The group the stream is currently draining (last page's page_group_key). */
  currentStreamHeadGroupKey: string | null
  /** Whether the current stream head group is fully drained. */
  pageGroupDone: boolean

  cursorByGroup: Record<string, any | null>
  hasMoreByGroup: Record<string, boolean>
  isFetchingByGroup: Record<string, boolean>
  errorByGroup: Record<string, string | null>
  ensureFirstPage: (groupKey: string) => void
  fetchMore: (groupKey: string) => void
  fetchMoreStream: () => void
  prefetchStreamIfNeeded: (distanceToBottomPx?: number) => void
  prefetchGroupIfNeeded: (groupKey: string, distanceToGroupBottomPx?: number) => void
  ensureRunwayForStream: (renderedEndGroupIndex: number) => void
  ensureRunwayForGroup: (groupKey: string, renderedEndIndex: number) => void
  skipGroup: (groupKey: string) => void
  resumeGroup: (groupKey: string) => void
  resetAll: () => void
}

function getStreamQueries(qc: QueryClient) {
  return qc.getQueryCache().findAll({ queryKey: BASE_QUERY_KEY as unknown as any })
}

function getPageGroupKey(p: RpcPage): string | null {
  const k =
    p.page_group_key != null
      ? String(p.page_group_key)
      : p.rows?.length
        ? String((p.rows[0] as any)._group_key ?? '')
        : ''
  const trimmed = k.trim()
  return trimmed ? trimmed : null
}

function toTaskListRowLoose(task: any): TaskListStreamRow | null {
  if (!task) return null
  const idNum = Number(task.id)
  if (!Number.isFinite(idNum)) return null

  const row: TaskListStreamRow = {
    id: idNum,
    title: task.title ?? '',
    assigned_to_id: task.assigned_to_id != null ? Number(task.assigned_to_id) : task.assigned_user?.id ?? null,
    assigned_to_name: task.assigned_to_name ?? task.assigned_user?.full_name ?? null,
    assigned_to_photo: task.assigned_to_photo ?? task.assigned_user?.photo ?? null,
    project_id_int: task.project_id_int != null ? Number(task.project_id_int) : task.projects?.id ?? 0,
    project_name: task.project_name ?? task.projects?.name ?? null,
    project_color: task.project_color ?? task.projects?.color ?? null,
    project_logo: task.project_logo ?? task.projects?.logo ?? null,
    project_status_id: task.project_status_id != null ? Number(task.project_status_id) : task.project_statuses?.id ?? null,
    project_status_name: task.project_status_name ?? task.project_statuses?.name ?? null,
    project_status_color: task.project_status_color ?? task.project_statuses?.color ?? null,
    delivery_date: task.delivery_date ?? null,
    publication_date: task.publication_date ?? null,
    is_overdue: task.is_overdue ?? null,
    is_publication_overdue: task.is_publication_overdue ?? null,
    updated_at: task.updated_at ?? new Date().toISOString(),
    content_type_id: task.content_type_id != null ? Number(task.content_type_id) : null,
    content_type_title: task.content_type_title ?? null,
    production_type_id: task.production_type_id != null ? Number(task.production_type_id) : null,
    production_type_title: task.production_type_title ?? null,
    language_id: task.language_id != null ? Number(task.language_id) : null,
    language_code: task.language_code ?? null,
    _group_key: '__unknown__',
    _group_label: null,
  }

  const gk = computeGroupKeyForTask(row, currentGroupBy)
  row._group_key = gk ?? '__unknown__'
  row._group_label = computeGroupLabelFromRow(row, currentGroupBy, row._group_key)
  return row
}

function patchInfinitePagesPreservingBoundaries(args: {
  existing: InfiniteData<RpcPage> | undefined
  updater: (pages: RpcPage[]) => RpcPage[]
}): InfiniteData<RpcPage> | undefined {
  const { existing, updater } = args
  if (!existing) return existing
  const nextPages = updater(existing.pages ?? [])
  if (nextPages === existing.pages) return existing
  return { pageParams: existing.pageParams, pages: nextPages }
}

export function addTaskToGroupTasksCaches(newTask: any, opts?: { queryClient?: QueryClient }) {
  const qc = opts?.queryClient ?? registeredQueryClient
  if (!qc || !currentGroupBy) return
  const row = toTaskListRowLoose(newTask)
  if (!row) return
  optimisticUndrainedGroups.add(row._group_key)

  for (const q of getStreamQueries(qc)) {
    const queryKey = q.queryKey
    qc.setQueryData<InfiniteData<RpcPage>>(queryKey, (old) =>
      patchInfinitePagesPreservingBoundaries({
        existing: old,
        updater: (pages) => {
          const next = pages.map((p) => ({ ...p, rows: [...(p.rows ?? [])] }))

          const idx = next.findIndex((p) => getPageGroupKey(p) === row._group_key)
          if (idx !== -1) {
            const page = next[idx]
            page.rows = insertRowSorted(page.rows as any, row) as any
            if (page.page_group_done) page.page_group_done = false
            return next
          }

          // Insert a synthetic page before the server tail page so cursors remain intact.
          const insertAt = Math.max(0, next.length - 1)
          next.splice(insertAt, 0, {
            rows: [row],
            next_cursor: null,
            page_group_key: row._group_key,
            page_group_done: false,
          })
          return next
        },
      }),
    )
  }
}

export function removeTaskFromGroupTasksCaches(taskId: number | string, opts?: { queryClient?: QueryClient }) {
  const qc = opts?.queryClient ?? registeredQueryClient
  if (!qc) return
  const idStr = String(taskId)

  for (const q of getStreamQueries(qc)) {
    const queryKey = q.queryKey
    qc.setQueryData<InfiniteData<RpcPage>>(queryKey, (old) =>
      patchInfinitePagesPreservingBoundaries({
        existing: old,
        updater: (pages) => {
          let changed = false
          const next = pages
            .map((p) => {
              const filtered = (p.rows ?? []).filter((r) => String((r as any).id) !== idStr)
              if (filtered.length !== (p.rows ?? []).length) changed = true
              return { ...p, rows: filtered }
            })
            .filter((p, idx) => {
              // Keep the tail page (it carries next_cursor); drop other empty pages.
              if (idx === pages.length - 1) return true
              return (p.rows?.length ?? 0) > 0
            })
          return changed ? next : pages
        },
      }),
    )
  }
}

export function patchTaskInGroupTasksCaches(updatedTask: any, opts?: { queryClient?: QueryClient }) {
  const qc = opts?.queryClient ?? registeredQueryClient
  if (!qc) return
  if (!updatedTask || !updatedTask.id) return
  const idStr = String(updatedTask.id)

  for (const q of getStreamQueries(qc)) {
    const queryKey = q.queryKey
    qc.setQueryData<InfiniteData<RpcPage>>(queryKey, (old) =>
      patchInfinitePagesPreservingBoundaries({
        existing: old,
        updater: (pages) => {
          const next = pages.map((p) => ({ ...p, rows: [...(p.rows ?? [])] }))

          let fromPageIdx = -1
          let fromRowIdx = -1
          let existingRow: TaskListStreamRow | null = null
          for (let pi = 0; pi < next.length; pi++) {
            const rows = next[pi].rows ?? []
            const ri = rows.findIndex((r: any) => String(r.id) === idStr)
            if (ri !== -1) {
              fromPageIdx = pi
              fromRowIdx = ri
              existingRow = rows[ri] as any
              break
            }
          }
          if (fromPageIdx === -1 || fromRowIdx === -1 || !existingRow) return pages

          const merged = { ...existingRow, ...updatedTask } as TaskListStreamRow
          const desiredKey = computeGroupKeyForTask(merged, currentGroupBy)
          const fromKey = existingRow._group_key

          if (!desiredKey || desiredKey === fromKey) {
            next[fromPageIdx].rows[fromRowIdx] = merged
            return next
          }

          // Move between groups.
          merged._group_key = desiredKey
          merged._group_label = computeGroupLabelFromRow(merged, currentGroupBy, desiredKey)
          optimisticUndrainedGroups.add(fromKey)
          optimisticUndrainedGroups.add(desiredKey)

          next[fromPageIdx].rows.splice(fromRowIdx, 1)
          if (next[fromPageIdx].rows.length === 0 && fromPageIdx !== next.length - 1) {
            next.splice(fromPageIdx, 1)
          }

          const targetIdx = next.findIndex((p) => getPageGroupKey(p) === desiredKey)
          if (targetIdx !== -1) {
            const page = next[targetIdx]
            page.rows = insertRowSorted(page.rows as any, merged) as any
            if (page.page_group_done) page.page_group_done = false
          } else {
            const insertAt = Math.max(0, next.length - 1)
            next.splice(insertAt, 0, {
              rows: [merged],
              next_cursor: null,
              page_group_key: desiredKey,
              page_group_done: false,
            })
          }

          return next
        },
      }),
    )
  }
}

const MAX_GROUP_RESUME_QUERIES = 5

export function useTaskGroupTasksQuery({
  q,
  project,
  filters = {},
  groupBy,
  groupOrder,
  rowSortBy,
  rowSortOrder = 'desc',
  perPage = 50,
  enabled = true,
  editFields,
  collapsedGroupKeys,
  groupKeysToResume,
}: UseTaskGroupTasksQueryOptions): UseTaskGroupTasksQueryResult {
  const queryClient = useQueryClient()
  const isEnabled = enabled && !!groupBy && groupBy !== 'none'
  const drainingGroupRef = useRef<string | null>(null)
  const drainingInFlightRef = useRef(false)
  /** Ref ensures queryFn sees skip key even when module var lags (e.g. concurrent renders). */
  const skipGroupKeyRef = useRef<string | null>(null)

  const groupKeysToResumeArr = useMemo(
    () => Array.from(groupKeysToResume ?? []).slice(0, MAX_GROUP_RESUME_QUERIES),
    [groupKeysToResume],
  )
  const [gk0, gk1, gk2, gk3, gk4] = [
    groupKeysToResumeArr[0] ?? null,
    groupKeysToResumeArr[1] ?? null,
    groupKeysToResumeArr[2] ?? null,
    groupKeysToResumeArr[3] ?? null,
    groupKeysToResumeArr[4] ?? null,
  ]

  useEffect(() => {
    if (!isEnabled) return
    currentGroupBy = groupBy
    currentRowSortBy = rowSortBy
    currentRowSortOrder = rowSortOrder
  }, [isEnabled, groupBy, rowSortBy, rowSortOrder])

  useEffect(() => {
    registeredQueryClient = queryClient
    return () => {
      if (registeredQueryClient === queryClient) registeredQueryClient = null
    }
  }, [queryClient])

  const filtersKey = useMemo(() => JSON.stringify(filters || {}), [filters])

  const queryKey = useMemo(
    () => [
      ...BASE_QUERY_KEY,
      {
        q,
        project: project ?? null,
        filtersKey,
        groupBy,
        groupOrder: groupOrder ?? null,
        rowSortBy: rowSortBy ?? null,
        rowSortOrder,
        perPage,
      },
    ],
    [q, project, filtersKey, groupBy, groupOrder, rowSortBy, rowSortOrder, perPage],
  )

  const baseRpcArgs = useMemo(
    () => ({
      q,
      project,
      filters,
      groupBy,
      groupOrder,
      rowSortBy,
      rowSortOrder,
      perPage,
      editFields,
    }),
    [q, project, filters, groupBy, groupOrder, rowSortBy, rowSortOrder, perPage, editFields],
  )

  // Stream mode: p_force_group_key=null, p_cursor=streamCursor (or null). Response next_cursor is stream cursor.
  const query = useInfiniteQuery<RpcPage>({
    queryKey,
    enabled: isEnabled,
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const supabase = createClientComponentClient()
      // Read skip key from ref first (set synchronously in skipGroup); fallback to module
      const skipKey = skipGroupKeyRef.current ?? skipGroupKeyModule
      const rpcParams = buildRpcParams({
        ...baseRpcArgs,
        cursor: pageParam, // stream cursor (or null); never use group cursor here
        skipGroupKey: skipKey,
        forceGroupKey: null, // stream mode
      }) as any

      const { data, error } = await supabase.rpc('task_list_stream_grouped_v2', rpcParams)
      if (error) throw new Error(error.message || 'Failed to fetch tasks')
      const payload = (data as any) || {}
      const pageGroupKey =
        payload.page_group_key != null ? String(payload.page_group_key).trim() : null

      // If we were skipping a group and the server head is now a different group, we're done.
      if (skipKey && pageGroupKey && pageGroupKey !== skipKey) {
        skipGroupKeyModule = null
        skipGroupKeyRef.current = null
      }

      return {
        rows: (payload.rows ?? []) as TaskListStreamRow[],
        next_cursor: payload.next_cursor ?? null, // stream cursor for next fetch
        page_group_key: payload.page_group_key ?? null,
        page_group_done: payload.page_group_done ?? null,
      }
    },
    getNextPageParam: (lastPage) => lastPage?.next_cursor ?? null, // streamCursor for next pageParam
    staleTime: 10_000,
    gcTime: 5 * 60_000,
  })

  // Group mode: p_force_group_key=groupKey, p_cursor=groupCursor[groupKey] (or null). Response next_cursor is row-only.
  const buildGroupQuery = useCallback(
    (slotIndex: number, forceGroupKey: string | null) => {
      const enabled = isEnabled && !!forceGroupKey
      return {
        queryKey: [...queryKey, 'group', slotIndex, forceGroupKey ?? '__none__'] as const,
        enabled,
        initialPageParam: null as any,
        queryFn: async ({ pageParam }: { pageParam: any }) => {
          if (!forceGroupKey) return { rows: [], next_cursor: null, page_group_key: null, page_group_done: true }
          const supabase = createClientComponentClient()
          const rpcParams = buildRpcParams({
            ...baseRpcArgs,
            cursor: pageParam, // group cursor (row-only) or null; never use stream cursor here
            skipGroupKey: null, // group mode never skips
            forceGroupKey, // group mode: fetch only this group
          }) as any

          const { data, error } = await supabase.rpc('task_list_stream_grouped_v2', rpcParams)
          if (error) throw new Error(error.message || 'Failed to fetch group tasks')
          const payload = (data as any) || {}
          return {
            rows: (payload.rows ?? []) as TaskListStreamRow[],
            next_cursor: payload.next_cursor ?? null, // row-only cursor for next fetch
            page_group_key: payload.page_group_key ?? null,
            page_group_done: payload.page_group_done ?? null,
          }
        },
        getNextPageParam: (lastPage: RpcPage) => lastPage?.next_cursor ?? null, // groupCursor for next pageParam
        staleTime: 10_000,
        gcTime: 5 * 60_000,
      }
    },
    [queryKey, isEnabled, baseRpcArgs],
  )

  const groupQuery0 = useInfiniteQuery<RpcPage>(buildGroupQuery(0, gk0) as any)
  const groupQuery1 = useInfiniteQuery<RpcPage>(buildGroupQuery(1, gk1) as any)
  const groupQuery2 = useInfiniteQuery<RpcPage>(buildGroupQuery(2, gk2) as any)
  const groupQuery3 = useInfiniteQuery<RpcPage>(buildGroupQuery(3, gk3) as any)
  const groupQuery4 = useInfiniteQuery<RpcPage>(buildGroupQuery(4, gk4) as any)

  const groupQueries = useMemo(
    () =>
      [
        [gk0, groupQuery0],
        [gk1, groupQuery1],
        [gk2, groupQuery2],
        [gk3, groupQuery3],
        [gk4, groupQuery4],
      ] as [string | null, ReturnType<typeof useInfiniteQuery<RpcPage>>][],
    [gk0, gk1, gk2, gk3, gk4, groupQuery0, groupQuery1, groupQuery2, groupQuery3, groupQuery4],
  )

  const derived = useMemo(() => deriveFromPages(query.data?.pages ?? []), [query.data])

  // Merge group-mode results into tasksByGroup (group-mode overrides stream for resumed groups)
  const tasksByGroupMerged = useMemo(() => {
    const out = { ...derived.tasksByGroup }
    for (const [gk, gq] of groupQueries) {
      if (!gk || !groupKeysToResume?.has(gk)) continue
      const pages = (gq as any).data?.pages ?? []
      const rows: TaskListStreamRow[] = []
      for (const p of pages) {
        rows.push(...(p.rows ?? []))
      }
      if (rows.length > 0) out[gk] = rows
    }
    return out
  }, [derived.tasksByGroup, groupQueries, groupKeysToResume])

  // Reset drain lock and skip state when the query changes shape.
  useEffect(() => {
    drainingGroupRef.current = null
    drainingInFlightRef.current = false
    skipGroupKeyModule = null
    skipGroupKeyRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, q, project, groupBy, groupOrder, rowSortBy, rowSortOrder, perPage])

  // Hook-enforced skip: when stream head is collapsed and not done, force skip mode immediately.
  // Guarantees the next stream fetch includes p_skip_group_key (no reliance on UI timing).
  useEffect(() => {
    if (!isEnabled) return
    const head = derived.currentStreamHeadGroupKey
    if (!head) return

    const headCollapsed = !!collapsedGroupKeys?.has(head)
    const headDone = derived.pageGroupDone === true
    const canContinue = !!query.hasNextPage

    if (headCollapsed && !headDone && canContinue) {
      if (skipGroupKeyModule !== head) {
        skipGroupKeyRef.current = head
        skipGroupKeyModule = head
        drainingGroupRef.current = null
        drainingInFlightRef.current = false
        void queryClient.cancelQueries({ queryKey })
        void query.fetchNextPage()
      }
    }
  }, [
    isEnabled,
    derived.currentStreamHeadGroupKey,
    derived.pageGroupDone,
    collapsedGroupKeys,
    query.hasNextPage,
    query.fetchNextPage,
    queryClient,
    queryKey,
  ])

  const hasMoreByGroup = useMemo(() => {
    if (!isEnabled) return {}
    const out: Record<string, boolean> = {}
    for (const k of derived.groupKeysInOrder) out[k] = !derived.isGroupDrainedByKey[k]
    // Override for resumed groups: use group query's hasNextPage
    for (const [gk, gq] of groupQueries) {
      if (gk && groupKeysToResume?.has(gk)) {
        out[gk] = !!(gq as any).hasNextPage
      }
    }
    return out
  }, [isEnabled, derived.groupKeysInOrder, derived.isGroupDrainedByKey, groupQueries, groupKeysToResume])

  const isFetchingByGroup = useMemo(() => {
    if (!isEnabled) return {}
    const out: Record<string, boolean> = {}
    const tail = derived.groupKeysInOrder[derived.groupKeysInOrder.length - 1]
    if (tail && !groupKeysToResume?.has(tail)) out[tail] = !!query.isFetchingNextPage
    // For resumed groups: use group query's isFetching
    for (const [gk, gq] of groupQueries) {
      if (gk && groupKeysToResume?.has(gk)) {
        out[gk] = !!(gq as any).isFetching || !!(gq as any).isFetchingNextPage
      }
    }
    return out
  }, [isEnabled, derived.groupKeysInOrder, query.isFetchingNextPage, groupQueries, groupKeysToResume])

  const errorByGroup = useMemo(() => {
    if (!isEnabled) return {}
    const msg = (query.error as any)?.message ?? null
    if (!msg) return {}
    const tail = derived.groupKeysInOrder[derived.groupKeysInOrder.length - 1]
    return tail ? { [tail]: msg } : {}
  }, [isEnabled, derived.groupKeysInOrder, query.error])

  // groupCursorByKey[groupKey]: last response next_cursor from group-mode (row-only)
  const cursorByGroup = useMemo(() => {
    const out: Record<string, any | null> = {}
    for (const [gk, gq] of groupQueries) {
      if (!gk || !groupKeysToResume?.has(gk)) continue
      const pages = (gq as any).data?.pages ?? []
      const lastPage = pages[pages.length - 1]
      out[gk] = lastPage?.next_cursor ?? null
    }
    return out
  }, [groupQueries, groupKeysToResume])

  const fetchNext = useCallback(() => {
    if (!isEnabled) return
    if (!query.hasNextPage) return
    if (query.isFetchingNextPage) return
    if (skipGroupKeyModule) return // don't auto-fetch while skipping
    void query.fetchNextPage()
  }, [isEnabled, query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage])

  const drainGroup = useCallback(
    async (groupKey: string, opts?: { maxPages?: number }) => {
      if (!isEnabled) return
      if (!groupKey) return
      if (!query.hasNextPage) return
      if (query.isFetchingNextPage) return
      if (skipGroupKeyModule) return // don't drain while skipping
      if (collapsedGroupKeys?.has(groupKey)) return

      // Gate: only drain the actual stream head group (prevents extra drain calls when head changes).
      if (derived.currentStreamHeadGroupKey !== groupKey) return

      // Only one draining group at a time.
      if (drainingGroupRef.current && drainingGroupRef.current !== groupKey) return
      if (drainingInFlightRef.current) return

      drainingGroupRef.current = groupKey
      drainingInFlightRef.current = true

      const maxPages = Math.max(1, opts?.maxPages ?? 2)

      const getSnapshot = () => {
        const data = queryClient.getQueryData(queryKey) as InfiniteData<RpcPage> | undefined
        const pages = data?.pages ?? []
        const d = deriveFromPages(pages)
        const lastPage = pages[pages.length - 1]
        const lastGroup = lastPage ? getPageGroupKey(lastPage) : null
        const lastCursor = lastPage?.next_cursor ?? null
        const groupLoaded = d.tasksByGroup[groupKey]?.length ?? 0
        const totalRows = Object.values(d.tasksByGroup).reduce((acc, rows) => acc + (rows?.length ?? 0), 0)
        const isGroupDone = d.isGroupDrainedByKey[groupKey] === true
        return { lastGroup, lastCursor, groupLoaded, totalRows, isGroupDone }
      }

      const cursorDeepEqual = (a: any, b: any) =>
        a === b || (a != null && b != null && JSON.stringify(a) === JSON.stringify(b))

      try {
        for (let i = 0; i < maxPages; i++) {
          if (skipGroupKeyModule) break // skip mode: stop draining immediately
          const before = getSnapshot()
          // If stream already advanced beyond this group, we're done.
          if (before.lastGroup && before.lastGroup !== groupKey) break
          if (before.isGroupDone) break
          if (!before.lastCursor) break

          await query.fetchNextPage()

          if (skipGroupKeyModule) break // skip mode: stop after each fetch
          const after = getSnapshot()
          // If stream advanced to a different group, we've drained this one.
          if (after.lastGroup && after.lastGroup !== groupKey) break
          if (after.isGroupDone) break
          if (!after.lastCursor) break
          // Progress guard: backend made no progress (same cursor returned).
          if (cursorDeepEqual(after.lastCursor, before.lastCursor)) break
          // Safety: avoid infinite loops if the backend makes no progress.
          if (after.totalRows <= before.totalRows && after.groupLoaded <= before.groupLoaded) break
        }
      } finally {
        drainingInFlightRef.current = false
        if (drainingGroupRef.current === groupKey) drainingGroupRef.current = null
      }
    },
    [isEnabled, derived.currentStreamHeadGroupKey, query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage, queryClient, queryKey, collapsedGroupKeys],
  )

  const ensureFirstPage = useCallback(
    (groupKey: string) => {
      if (!isEnabled) return
      if (collapsedGroupKeys?.has(groupKey)) return
      // Resumed groups: group query fetches on mount when enabled; ensure first page if needed
      if (groupKeysToResume?.has(groupKey)) {
        const pair = groupQueries.find(([gk]) => gk === groupKey)
        const gq = pair?.[1] as any
        const loaded = (tasksByGroupMerged[groupKey]?.length ?? 0) > 0
        if (!loaded && gq?.hasNextPage && !gq?.isFetchingNextPage) {
          void gq?.fetchNextPage?.()
        }
        return
      }
      if (skipGroupKeyModule) return // don't auto-fetch while skipping
      const loaded = (derived.tasksByGroup[groupKey]?.length ?? 0) > 0
      if (loaded) return
      fetchNext()
    },
    [isEnabled, derived.tasksByGroup, fetchNext, collapsedGroupKeys, groupKeysToResume, groupQueries, tasksByGroupMerged],
  )

  const prefetchStreamIfNeeded = useCallback(
    (distanceToBottomPx?: number) => {
      if (!isEnabled) return
      if (skipGroupKeyModule) return // don't auto-fetch while skipping
      if (query.isFetchingNextPage) return
      if (!query.hasNextPage) return
      const thresholdPx = 1200
      if (typeof distanceToBottomPx === 'number' && distanceToBottomPx > thresholdPx) return
      void query.fetchNextPage()
    },
    [isEnabled, query.isFetchingNextPage, query.hasNextPage, query.fetchNextPage],
  )

  const prefetchGroupIfNeeded = useCallback(
    (groupKey: string, distanceToGroupBottomPx?: number) => {
      if (!isEnabled) return
      if (skipGroupKeyModule) return // don't auto-fetch while skipping
      if (skipGroupKeyModule === groupKey) return
      if (collapsedGroupKeys?.has(groupKey)) return
      if (hasMoreByGroup[groupKey] === false) return // don't drain if backend says no more
      const thresholdPx = 1600
      if (typeof distanceToGroupBottomPx === 'number' && distanceToGroupBottomPx > thresholdPx) return
      void drainGroup(groupKey, { maxPages: 1 })
    },
    [isEnabled, drainGroup, collapsedGroupKeys, hasMoreByGroup],
  )

  const ensureRunwayForStream = useCallback(
    (_renderedEndGroupIndex: number) => {
      // Intentionally a no-op: with strict render-gating, stream runway is driven by the
      // active/draining group (ensureRunwayForGroup / prefetchGroupIfNeeded).
    },
    [],
  )

  const fetchMoreForGroup = useCallback(
    (groupKey: string) => {
      if (groupKeysToResume?.has(groupKey)) {
        const pair = groupQueries.find(([gk]) => gk === groupKey)
        const gq = pair?.[1] as any
        if (gq?.hasNextPage && !gq?.isFetchingNextPage) void gq?.fetchNextPage?.()
        return
      }
      if (hasMoreByGroup[groupKey] === false) return
      void drainGroup(groupKey, { maxPages: 1 })
    },
    [drainGroup, groupKeysToResume, groupQueries, hasMoreByGroup],
  )

  const ensureRunwayForGroup = useCallback(
    (groupKey: string, renderedEndIndex: number) => {
      if (collapsedGroupKeys?.has(groupKey)) return
      if (hasMoreByGroup[groupKey] === false) return // don't drain if backend says no more
      const loaded = (tasksByGroupMerged[groupKey]?.length ?? 0)
      if (loaded === 0) return
      const RUNWAY_ROWS = 120
      if (loaded - renderedEndIndex < RUNWAY_ROWS) {
        if (groupKeysToResume?.has(groupKey)) {
          fetchMoreForGroup(groupKey)
        } else {
          if (skipGroupKeyModule) return
          void drainGroup(groupKey, { maxPages: 2 })
        }
      }
    },
    [tasksByGroupMerged, drainGroup, collapsedGroupKeys, groupKeysToResume, fetchMoreForGroup, hasMoreByGroup],
  )

  const resumeGroup = useCallback((groupKey: string) => {
    if (!groupKey) return
    if (skipGroupKeyModule === groupKey) skipGroupKeyModule = null
  }, [])

  const resetAll = useCallback(() => {
    queryClient.removeQueries({ queryKey: BASE_QUERY_KEY as unknown as any })
  }, [queryClient])

  return {
    tasksByGroup: tasksByGroupMerged,
    groupKeysInOrder: derived.groupKeysInOrder,
    groupLabelsByKey: derived.groupLabelsByKey,
    groupCountsByKey: derived.groupCountsByKey,

    currentStreamHeadGroupKey: derived.currentStreamHeadGroupKey,
    pageGroupDone: derived.pageGroupDone,

    cursorByGroup,
    hasMoreByGroup,
    isFetchingByGroup,
    errorByGroup,
    ensureFirstPage,
    fetchMore: (groupKey: string) => {
      if (collapsedGroupKeys?.has(groupKey)) return
      fetchMoreForGroup(groupKey)
    },
    fetchMoreStream: fetchNext,
    prefetchStreamIfNeeded,
    prefetchGroupIfNeeded,
    ensureRunwayForStream,
    ensureRunwayForGroup,
    skipGroup: (groupKey: string) => {
      if (!isEnabled) return
      if (!groupKey) return
      if (!query.hasNextPage) return
      if (skipGroupKeyModule) return // already skipping, don't stack
      skipGroupKeyRef.current = groupKey
      skipGroupKeyModule = groupKey
      drainingGroupRef.current = null
      drainingInFlightRef.current = false
      void queryClient.cancelQueries({ queryKey })
      // Trigger fetch; ref ensures queryFn sees skip key even if module lags
      void query.fetchNextPage()
    },
    resumeGroup,
    resetAll,
  }
}
