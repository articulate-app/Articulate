/**
 * Optimistic update pipeline for TaskList (grouped + ungrouped).
 * Patches the source-of-truth used by UnifiedGroupedTaskList without full refetch.
 */
import type { TaskListRow } from '@/lib/types/task-list-view'
import { computeGroupKeyForTask, applyTaskListOptimisticUpdate } from '../../src/hooks/use-task-group-tasks-query'
import { getGroupLabelFromKey } from './group-key-utils'

const DEBUG_OPTIMISTIC = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development' && false

type GroupByField = string | null
type SortOrder = 'asc' | 'desc'

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

/** Normalize task from various shapes (API, TaskDetails, etc.) to TaskListRow. */
function toTaskListRow(task: any): TaskListRow | null {
  if (!task || task.id == null) return null
  const idNum = Number(task.id)
  if (!Number.isFinite(idNum)) return null

  const assignedToId =
    task.assigned_to_id != null
      ? Number(task.assigned_to_id)
      : task.assigned_user?.id != null
        ? Number(task.assigned_user.id)
        : null

  const projectId =
    task.project_id_int != null
      ? Number(task.project_id_int)
      : task.projects?.id != null
        ? Number(task.projects.id)
        : 0

  const statusId =
    task.project_status_id != null
      ? Number(task.project_status_id)
      : task.project_statuses?.id != null
        ? Number(task.project_statuses.id)
        : null

  return {
    id: idNum,
    title: task.title ?? '',
    assigned_to_id: Number.isFinite(assignedToId as any) ? assignedToId : null,
    assigned_to_name: task.assigned_to_name ?? task.assigned_user?.full_name ?? null,
    assigned_to_photo: task.assigned_to_photo ?? task.assigned_user?.photo ?? null,
    project_id_int: Number.isFinite(projectId) ? projectId : 0,
    project_name: task.project_name ?? task.projects?.name ?? null,
    project_color: task.project_color ?? task.projects?.color ?? null,
    project_logo: task.project_logo ?? task.projects?.logo ?? null,
    project_status_id: Number.isFinite(statusId as any) ? statusId : null,
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
  }
}

/** Get comparable sort value for a task (number or string). */
export function getRowSortValue(task: TaskListRow, sortKey: string): number | string | null {
  const field = uiToRowFieldMap[sortKey] ?? (sortKey as keyof TaskListRow)
  const v = task[field] as any
  if (v == null) return null
  if (field === 'delivery_date' || field === 'publication_date' || field === 'updated_at') {
    const d = new Date(v)
    const t = d.getTime()
    return Number.isFinite(t) ? t : String(v)
  }
  return String(v)
}

/** Stable comparator for rows; tie-break by id. */
export function compareRows(
  a: TaskListRow,
  b: TaskListRow,
  sortKey: string,
  sortOrder: SortOrder
): number {
  const field = uiToRowFieldMap[sortKey] ?? (sortKey as keyof TaskListRow)
  const av = a[field] as any
  const bv = b[field] as any

  if (av == null && bv == null) return Number(a.id) - Number(b.id)
  if (av == null) return 1
  if (bv == null) return -1

  let cmp: number
  if (field === 'delivery_date' || field === 'publication_date' || field === 'updated_at') {
    const ad = new Date(av)
    const bd = new Date(bv)
    const at = ad.getTime()
    const bt = bd.getTime()
    cmp = Number.isNaN(at) || Number.isNaN(bt) ? String(av).localeCompare(String(bv)) : at - bt
  } else {
    cmp = String(av).localeCompare(String(bv))
  }

  if (cmp !== 0) return sortOrder === 'asc' ? cmp : -cmp
  return Number(a.id) - Number(b.id)
}

/** Get group key for a task (matches backend / computeGroupKeyForTask). */
export function getGroupKey(task: TaskListRow, selectedGroupBy: GroupByField): string | null {
  return computeGroupKeyForTask(task, selectedGroupBy)
}

/** Compare group keys for ordering (matches UI group order). */
export function compareGroupKeys(
  aKey: string,
  bKey: string,
  _selectedGroupBy: GroupByField,
  groupOrder: SortOrder
): number {
  const cmp = aKey.localeCompare(bKey)
  return groupOrder === 'asc' ? cmp : -cmp
}

function insertRowSorted(
  rows: TaskListRow[],
  row: TaskListRow,
  sortKey: string,
  sortOrder: SortOrder
): TaskListRow[] {
  const withoutDup = rows.filter((r) => String(r.id) !== String(row.id))
  const dest = [...withoutDup]

  if (!sortKey) {
    dest.unshift(row)
    return dest
  }

  let insertIdx = -1
  for (let i = 0; i < dest.length; i++) {
    const cmp = compareRows(row, dest[i]!, sortKey, sortOrder)
    if (cmp <= 0) {
      insertIdx = i
      break
    }
  }
  if (insertIdx === -1) {
    dest.push(row)
  } else {
    dest.splice(insertIdx, 0, row)
  }
  return dest
}

export interface ApplyOptimisticUpsertParams {
  task: any
  prevTask?: any
  viewMode: 'grouped' | 'ungrouped'
  grouping: GroupByField
  groupOrder: SortOrder
  rowSortBy: string
  rowSortOrder: SortOrder
}

export interface ApplyOptimisticDeleteParams {
  taskId: number | string
  viewMode: 'grouped' | 'ungrouped'
  grouping: GroupByField
  groupOrder: SortOrder
  rowSortBy: string
  rowSortOrder: SortOrder
}

/**
 * Optimistically upsert a task into the TaskList cache.
 * Handles add + edit; for edits, detects group/sort key changes and moves row if needed.
 */
export function applyOptimisticUpsertTask(params: ApplyOptimisticUpsertParams): void {
  const { task, prevTask, viewMode, grouping, groupOrder, rowSortBy, rowSortOrder } = params
  const row = toTaskListRow(task)
  if (!row) return

  const config = {
    groupBy: viewMode === 'ungrouped' ? null : grouping,
    rowSortBy: rowSortBy || 'publication_date',
    rowSortOrder: rowSortOrder || 'desc',
  }

  applyTaskListOptimisticUpdate(config, (prev: Record<string, TaskListRow[]>) => {
    const idStr = String(row.id)
    const targetGroupKey = viewMode === 'ungrouped' ? 'all' : (getGroupKey(row, grouping) ?? 'all')

    let prevGroupKey: string | null = null
    if (prevTask) {
      const prevRow = toTaskListRow(prevTask)
      if (prevRow) {
        prevGroupKey = viewMode === 'ungrouped' ? 'all' : getGroupKey(prevRow, grouping)
      }
    } else {
      for (const [gk, rows] of Object.entries(prev)) {
        if ((rows as TaskListRow[]).some((r: TaskListRow) => String(r.id) === idStr)) {
          prevGroupKey = gk
          break
        }
      }
    }

    const effectivePrevKey = prevGroupKey ?? (viewMode === 'ungrouped' ? 'all' : null)
    const next = { ...prev }

    if (effectivePrevKey) {
      for (const [gk, rows] of Object.entries(next)) {
        const filtered = (rows as TaskListRow[]).filter((r: TaskListRow) => String(r.id) !== idStr)
        if (filtered.length !== (rows as TaskListRow[]).length) {
          next[gk] = filtered.length > 0 ? filtered : []
          break
        }
      }
    }

    const existingInTarget = (next[targetGroupKey] ?? []) as TaskListRow[]
    const merged = existingInTarget.find((r: TaskListRow) => String(r.id) === idStr)
      ? existingInTarget.map((r: TaskListRow) => (String(r.id) === idStr ? { ...r, ...row } : r))
      : insertRowSorted(existingInTarget, row, config.rowSortBy, config.rowSortOrder as SortOrder)

    next[targetGroupKey] = merged

    const isNewGroup = !(targetGroupKey in prev)
    if (isNewGroup && typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      const label = getGroupLabelFromKey(targetGroupKey, viewMode === 'grouped' ? grouping : null)
      console.log('[optimistic] created group', { groupKey: targetGroupKey, label })
    }

    if (effectivePrevKey && effectivePrevKey !== targetGroupKey && next[effectivePrevKey]?.length === 0) {
      delete next[effectivePrevKey]
    }

    if (DEBUG_OPTIMISTIC && effectivePrevKey !== targetGroupKey) {
      console.log('[task-list-optimistic] Group moved', { prevGroupKey: effectivePrevKey, targetGroupKey })
    }

    return next
  })
}

/**
 * Optimistically remove a task from the TaskList cache.
 */
export function applyOptimisticDeleteTask(params: ApplyOptimisticDeleteParams): void {
  const { taskId, viewMode, grouping, groupOrder, rowSortBy, rowSortOrder } = params
  const idStr = String(taskId)

  const config = {
    groupBy: viewMode === 'ungrouped' ? null : grouping,
    rowSortBy: rowSortBy || 'publication_date',
    rowSortOrder: rowSortOrder || 'desc',
  }

  applyTaskListOptimisticUpdate(config, (prev: Record<string, TaskListRow[]>) => {
    let hasChange = false
    const next = { ...prev }

    for (const [gk, rows] of Object.entries(next)) {
      const filtered = (rows as TaskListRow[]).filter((r: TaskListRow) => String(r.id) !== idStr)
      if (filtered.length !== rows.length) {
        hasChange = true
        next[gk] = filtered.length > 0 ? filtered : []
      }
    }

    for (const [gk, rows] of Object.entries(next)) {
      if ((rows as TaskListRow[]).length === 0) {
        delete next[gk]
      }
    }

    if (DEBUG_OPTIMISTIC && hasChange) {
      console.log('[task-list-optimistic] Task deleted', { taskId })
    }

    return hasChange ? next : prev
  })
}

/**
 * Dev harness: run sample upsert/delete and verify ordering.
 * Call from console: require('./task-list-optimistic').runDevHarness()
 *
 * Includes a future-month task (2027-06) to assert new group creation:
 * - With grouped view by delivery_date, the "June 2027" group should appear
 * - Group should be in correct order (desc = newest first)
 */
export function runDevHarness(): void {
  if (typeof window === 'undefined') return
  const futureMonth = new Date()
  futureMonth.setFullYear(futureMonth.getFullYear() + 2)
  futureMonth.setMonth(5) // June
  const futureMonthStr = `${futureMonth.getFullYear()}-${String(futureMonth.getMonth() + 1).padStart(2, '0')}`

  const sampleTask: TaskListRow = {
    id: 99999,
    title: 'Dev harness task (future month)',
    assigned_to_id: null,
    assigned_to_name: null,
    assigned_to_photo: null,
    project_id_int: 0,
    project_name: null,
    project_color: null,
    project_logo: null,
    project_status_id: null,
    project_status_name: null,
    project_status_color: null,
    delivery_date: `${futureMonthStr}-15`,
    publication_date: `${futureMonthStr}-20`,
    is_overdue: false,
    is_publication_overdue: false,
    updated_at: new Date().toISOString(),
    content_type_id: null,
    content_type_title: null,
    production_type_id: null,
    production_type_title: null,
    language_id: null,
    language_code: null,
  }

  const params = {
    task: sampleTask,
    viewMode: 'grouped' as const,
    grouping: 'delivery_date',
    groupOrder: 'desc' as const,
    rowSortBy: 'publication_date',
    rowSortOrder: 'desc' as const,
  }

  applyOptimisticUpsertTask(params)
  console.log(
    '[task-list-optimistic] Dev harness: applied upsert for task',
    sampleTask.id,
    '- expect new group',
    futureMonthStr,
    'to appear in grouped list',
  )

  setTimeout(() => {
    applyOptimisticDeleteTask({
      taskId: sampleTask.id,
      ...params,
    })
    console.log('[task-list-optimistic] Dev harness: applied delete for task', sampleTask.id)
  }, 2000)
}
