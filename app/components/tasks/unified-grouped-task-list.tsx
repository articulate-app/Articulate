"use client"

import * as React from 'react'
import { useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { useTaskGrouping, type GroupByField } from '../../store/task-grouping'
import { useReactTable, getCoreRowModel, ColumnDef, flexRender } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTasksUI } from '../../store/tasks-ui'
import { useTaskSuggestionsQuery } from '../../hooks/use-task-suggestions-query'
import { useTaskGroupMetaPagedQuery } from '@/hooks/use-task-group-meta-paged-query'
import { computeGroupKeyForTask, useTaskGroupTasksQuery } from '../../../src/hooks/use-task-group-tasks-query'
import { computeGroupLabelForTask } from '../../../src/hooks/use-task-group-meta-all-query'
import { getGroupLabelFromKey } from '../../lib/group-key-utils'
import { mapTaskListRowToTableFormat } from '../../lib/fetchTasksFromView'
import { CompactEditableRowContent } from './compact-task-row'
import { SubtaskRows } from './TaskList'
import { useTasksShallowSearchParams } from '../../hooks/use-tasks-shallow-search-params'
import {
  getDefaultGroupOrderForGroupBy,
  parseActiveGroupByFromParam,
  parseExplicitGroupOrderParam,
} from '@/lib/tasks-grouping-url'
import { useTasksScope, useTasksScopeProjectParam } from '../../contexts/tasks-scope-context'
import { getImageUrl } from '../../lib/public-media'
import { usePlannerOptimisticTasks } from '../../store/planner-optimistic-tasks'
import type { SearchSession } from '../../lib/types/search-session'
import type { TaskCardColorMode } from '@/lib/task-card-colors'
import {
  getStablePaletteClass,
  getTaskColorKey,
  getTaskColorLabel,
} from '@/lib/task-card-colors'
import { TaskGroupHeaderLabel } from './task-list-visuals'
import { TaskRowActionsMenu, type TaskRowProjectOption } from './task-row-actions-menu'
import { supportsTaskGroupDragDrop, normalizeCanonicalGroupKey, toBackendGroupKey, GROUP_KEY_NO_DATE, GROUP_KEY_NO_PROJECT, GROUP_KEY_UNASSIGNED } from '@/lib/task-grouping-drop-config'
import {
  DraggableTaskRow,
  GroupDropZone,
  TaskDragHandle,
  TaskGroupDragDropProvider,
  TaskGroupDragOverlayRow,
  TaskRowInsertDropEdge,
  useTaskGroupDragDrop,
} from '@/hooks/use-task-group-drag-drop'

interface UnifiedGroupedTaskListProps<T> {
  columns: ColumnDef<T>[]
  gridTemplateColumns: string
  onTaskSelect?: (task: T) => void
  filters: Record<string, any>
  pageSize?: number
  sortBy: string
  sortOrder: 'asc' | 'desc'
  editFields?: any
  selectedTaskId?: string | number | null
  enabled?: boolean
  // Main-task expansion / multiselect state (owned by parent TaskList)
  expandedMainTasks?: Set<number>
  isMultiselectMode?: boolean
  selectedTasks?: Set<number>
  onTaskToggle?: (taskId: number) => void
  /** Always show outside checkbox on hover (directory style); when false, only in multiselect mode. */
  showOutsideSelectionControls?: boolean
  onRenameTask?: (task: Record<string, unknown>, title: string) => void
  onDeleteTask?: (task: Record<string, unknown>) => void
  onChangeTaskProject?: (task: Record<string, unknown>, projectId: string) => void
  projectOptions?: TaskRowProjectOption[]
  listColorMode?: TaskCardColorMode | null
  onListColorLegendChange?: (
    entries: { key: string; label: string; colorClass: string }[],
  ) => void
  /**
   * Narrow left-pane mode: render a single-line compact row (title left, avatar + selected date right)
   * instead of the full column grid, so the list never needs horizontal scroll.
   */
  compact?: boolean
}

type FlattenedItem =
  | {
      type: 'group'
      groupKey: string
      label: string
      isExpanded: boolean
      isAfterBlocking: boolean
      taskCount?: number
    }
  | { type: 'loading'; groupKey: string }
  | { type: 'empty'; groupKey: string }
  | { type: 'task'; task: any; groupKey: string; isLastInGroup: boolean }
  | { type: 'subtasks'; groupKey: string; parentId: number }

/** Meta RPC returns group_key + label only (no task_count). */
type GroupHeader = { group_key: string; label: string; task_count?: number }

const INITIAL_BOOTSTRAP_GROUP_LIMIT = 8
const DEBUG_GROUPED_TASKS = false
const VIRTUAL_ROW_ESTIMATE_PX = 52
const VIRTUAL_OVERSCAN = 20
const FETCH_AHEAD_ROWS = 30
const SUGGESTIONS_GROUP_KEY = '__suggestions__'

function resolveTasksForGroupKey(
  tasksByGroup: Record<string, any[]>,
  groupKey: string,
  groupBy: string | null,
): any[] {
  const canonical = normalizeCanonicalGroupKey(groupKey, groupBy) ?? groupKey
  const backendKey = toBackendGroupKey(canonical, groupBy)
  const candidates = Array.from(
    new Set(
      [canonical, groupKey, backendKey, GROUP_KEY_UNASSIGNED, GROUP_KEY_NO_DATE, GROUP_KEY_NO_PROJECT, 'No Status', 'unassigned', 'none', 'no-date', '']
        .filter((k): k is string => typeof k === 'string' && k.length > 0)
        .filter(k => (normalizeCanonicalGroupKey(k, groupBy) ?? k) === canonical),
    ),
  )

  const merged: any[] = []
  const seenIds = new Set<string>()
  for (const key of candidates) {
    const rows = tasksByGroup[key]
    if (!rows?.length) continue
    for (const row of rows) {
      const id = String((row as any)?.entity_id ?? (row as any)?.id ?? '')
      if (!id || seenIds.has(id)) continue
      seenIds.add(id)
      merged.push(row)
    }
  }
  return merged
}

function renderTaskRowInsertDropEdges(args: {
  groupKey: string
  task: Record<string, unknown>
  isLastInGroup: boolean
}) {
  const taskId = Number(args.task.entity_id ?? args.task.id)
  if (!Number.isFinite(taskId)) return null
  return (
    <>
      <TaskRowInsertDropEdge groupKey={args.groupKey} beforeTaskId={taskId} edge="top" />
      {args.isLastInGroup ? (
        <TaskRowInsertDropEdge groupKey={args.groupKey} beforeTaskId={null} edge="bottom" />
      ) : null}
    </>
  )
}
function renderFirstTaskCellContent({
  task,
  groupKey,
  children,
  showOutsideControls = false,
  isChecked = false,
  showCheckbox = false,
  forceShowControls = false,
  onToggleChecked,
}: {
  task: Record<string, unknown>
  groupKey: string
  children: React.ReactNode
  /** Grip (+ optional checkbox) sit left of the table content alignment. */
  showOutsideControls?: boolean
  isChecked?: boolean
  showCheckbox?: boolean
  /** Keep checkbox/grip visible while any bulk selection is active (Biblioteca). */
  forceShowControls?: boolean
  onToggleChecked?: () => void
}) {
  if (showOutsideControls) {
    const showRowCheckbox = showCheckbox && (isChecked || forceShowControls)
    return (
      <div className="relative flex min-w-0 items-center gap-2">
        {showRowCheckbox ? (
          <input
            type="checkbox"
            checked={isChecked}
            aria-label="Select task"
            className="h-4 w-4 shrink-0 rounded border-gray-300 text-gray-900 accent-gray-900 focus:ring-gray-400"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation()
              onToggleChecked?.()
            }}
          />
        ) : null}
        {!forceShowControls ? (
          <TaskDragHandle
            task={task}
            sourceGroupKey={groupKey}
          />
        ) : null}
        <div className="min-w-0 flex-1 truncate">{children}</div>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 items-center gap-1">
      <TaskDragHandle task={task} sourceGroupKey={groupKey} />
      <div className="min-w-0 flex-1 truncate">{children}</div>
    </div>
  )
}

function getFlattenedItemKey(item: FlattenedItem): string {
  switch (item.type) {
    case 'group':
      return `group-${item.groupKey}`
    case 'loading':
      return `loading-${item.groupKey}`
    case 'empty':
      return `empty-${item.groupKey}`
    case 'task':
      return `${item.groupKey}:${String((item.task as any)?.entity_type)}:${String((item.task as any)?.entity_id)}`
    case 'subtasks':
      return `subtasks-${item.groupKey}-${String(item.parentId)}`
    default: {
      const _exhaustive: never = item
      return String(_exhaustive)
    }
  }
}

function taskNumericIdFromItem(item: FlattenedItem): number | null {
  if (item.type !== 'task') return null
  if ((item.task as any)?.kind === 'suggestion') return null
  const id = Number((item.task as any)?.id ?? (item.task as any)?.entity_id)
  return Number.isFinite(id) ? id : null
}

/** Biblioteca-style contiguous selection: rounded block around consecutive selected rows. */
function getBulkSelectionRun(
  flattenedItems: FlattenedItem[],
  index: number,
  selectedTasks?: Set<number>,
): { isBulkSelected: boolean; run: 'only' | 'start' | 'middle' | 'end' | null } {
  if (!selectedTasks?.size) return { isBulkSelected: false, run: null }
  const id = taskNumericIdFromItem(flattenedItems[index]!)
  if (id == null || !selectedTasks.has(id)) return { isBulkSelected: false, run: null }

  const prevId = index > 0 ? taskNumericIdFromItem(flattenedItems[index - 1]!) : null
  const nextId =
    index < flattenedItems.length - 1 ? taskNumericIdFromItem(flattenedItems[index + 1]!) : null
  const prevSelected = prevId != null && selectedTasks.has(prevId)
  const nextSelected = nextId != null && selectedTasks.has(nextId)

  if (!prevSelected && !nextSelected) return { isBulkSelected: true, run: 'only' }
  if (!prevSelected && nextSelected) return { isBulkSelected: true, run: 'start' }
  if (prevSelected && !nextSelected) return { isBulkSelected: true, run: 'end' }
  return { isBulkSelected: true, run: 'middle' }
}

function isGroupDrained(args: {
  groupKey: string
  taskCount?: number
  nextCursorByGroup: Record<string, any | null>
  loadedFirstPageByGroup: Record<string, boolean>
}): boolean {
  const { taskCount, groupKey, nextCursorByGroup, loadedFirstPageByGroup } = args
  if (typeof taskCount === 'number' && taskCount <= 0) return true
  const hasLoadedFirstPage = !!loadedFirstPageByGroup[groupKey]
  const nextCursor = nextCursorByGroup[groupKey]
  return hasLoadedFirstPage && nextCursor == null
}

/**
 * Blocking group invariant:
 * - The blocking group is the FIRST group (in meta order) that is expanded AND not drained.
 * - All expanded groups before it are necessarily drained (by definition).
 */
function computeBlockingGroupKey(args: {
  groups: GroupHeader[]
  collapsedGroups: Set<string>
  nextCursorByGroup: Record<string, any | null>
  loadedFirstPageByGroup: Record<string, boolean>
}): string | null {
  const { groups, collapsedGroups, nextCursorByGroup, loadedFirstPageByGroup } = args

  for (const g of groups) {
    const key = String(g.group_key)
    if (collapsedGroups.has(key)) continue
    const drained = isGroupDrained({
      groupKey: key,
      taskCount: g.task_count,
      nextCursorByGroup,
      loadedFirstPageByGroup,
    })
    if (!drained) return key
  }
  return null
}

function computeShouldRenderRows(args: {
  groupKey: string
  groups: GroupHeader[]
  blockingGroupKey: string | null
  collapsedGroups: Set<string>
}): boolean {
  const { groupKey, groups, blockingGroupKey, collapsedGroups } = args
  if (collapsedGroups.has(groupKey)) return false

  // If there's no blocking group, everything expanded is drained → render all expanded groups.
  if (!blockingGroupKey) return true

  const idx = groups.findIndex(g => String(g.group_key) === String(groupKey))
  const blockingIdx = groups.findIndex(g => String(g.group_key) === String(blockingGroupKey))
  if (idx === -1 || blockingIdx === -1) return false

  return idx <= blockingIdx
}

function resolveSuggestionGroupKey(suggestion: any, groupBy: string | null): string {
  const normalizeDateInput = (value: unknown): string | null => {
    if (value instanceof Date) {
      const t = value.getTime()
      return Number.isFinite(t) ? value.toISOString().slice(0, 10) : null
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      const d = new Date(value)
      const t = d.getTime()
      return Number.isFinite(t) ? d.toISOString().slice(0, 10) : null
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
    return null
  }

  const toMonthKey = (value: unknown): string | null => {
    const normalized = normalizeDateInput(value)
    if (!normalized || normalized.length < 7) return null
    const datePart = normalized.includes('T') ? normalized.split('T')[0] : normalized
    const y = datePart.slice(0, 4)
    const m = datePart.slice(5, 7)
    if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m)) return null
    return `${y}-${m}`
  }

  const suggestionDate =
    (suggestion as any)?.planned_for_date ??
    (suggestion as any)?.delivery_date ??
    (suggestion as any)?.publication_date ??
    null

  switch (groupBy) {
    case 'delivery_date': {
      return toMonthKey((suggestion as any)?.planned_for_date) ?? GROUP_KEY_NO_DATE
    }
    case 'publication_date': {
      return toMonthKey((suggestion as any)?.publication_date ?? (suggestion as any)?.planned_for_date) ?? GROUP_KEY_NO_DATE
    }
    case 'project': {
      const id = Number((suggestion as any)?.project_id_int ?? (suggestion as any)?.project_id)
      return Number.isFinite(id) ? String(id) : GROUP_KEY_NO_PROJECT
    }
    case 'content_type': {
      const id = Number((suggestion as any)?.content_type_id)
      return Number.isFinite(id) ? String(id) : GROUP_KEY_UNASSIGNED
    }
    case 'status':
      return 'suggestions'
    case 'assigned_to':
      return GROUP_KEY_UNASSIGNED
    case null:
      return 'all'
    default:
      return toMonthKey(suggestionDate) ?? SUGGESTIONS_GROUP_KEY
  }
}

function resolveSuggestionGroupLabel(groupKey: string, groupBy: string | null): string {
  const formatMonthLabel = (key: string): string => {
    if (key === GROUP_KEY_NO_DATE) return groupBy === 'publication_date' ? 'No Publication Date' : 'No Delivery Date'
    const [yy, mm] = key.split('-')
    const y = Number(yy)
    const m = Number(mm)
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
      return getGroupLabelFromKey(key, groupBy)
    }
    const date = new Date(y, m - 1, 1, 12, 0, 0)
    const month = date.toLocaleString('en-US', { month: 'short' })
    return `${month} ${y}`
  }

  if (groupBy === 'delivery_date' || groupBy === 'publication_date') return formatMonthLabel(groupKey)
  if (groupBy === 'assigned_to' && groupKey === 'unassigned') return 'Unassigned'
  if (groupBy === 'status' || groupKey === 'suggestions' || groupKey === SUGGESTIONS_GROUP_KEY) return 'Suggestions'
  if (groupBy === 'project' && groupKey === 'none') return 'No Project'
  if (groupBy === 'content_type' && groupKey === 'none') return 'No Content Type'
  if (groupBy) return getGroupLabelFromKey(groupKey, groupBy)
  return 'All'
}

function comparePlannerRows(args: {
  a: any
  b: any
  sortBy: string
  sortOrder: 'asc' | 'desc'
}): number {
  const { a, b, sortBy, sortOrder } = args
  const ascending = sortOrder === 'asc'

  const getComparableValue = (row: any, key: string): string | number | null => {
    if ((row as any)?.kind === 'suggestion') {
      switch (key) {
        case 'delivery_date':
        case 'publication_date':
          return (row as any)?.planned_for_date ?? (row as any)?.delivery_date ?? (row as any)?.publication_date ?? null
        case 'updated_at':
          return (row as any)?.updated_at ?? (row as any)?.created_at ?? null
        case 'title':
          return (row as any)?.title ?? ''
        default:
          return (row as any)?.[key] ?? (row as any)?.planned_for_date ?? (row as any)?.entity_id ?? null
      }
    }
    return (row as any)?.[key] ?? null
  }

  const av = getComparableValue(a, sortBy)
  const bv = getComparableValue(b, sortBy)
  if (av == null && bv == null) return 0
  if (av == null) return 1
  if (bv == null) return -1

  const looksLikeDate = sortBy.includes('date') || sortBy.includes('updated_at') || sortBy.includes('created_at')
  if (looksLikeDate) {
    const at = new Date(String(av)).getTime()
    const bt = new Date(String(bv)).getTime()
    if (Number.isFinite(at) && Number.isFinite(bt)) {
      return ascending ? at - bt : bt - at
    }
  }

  const as = String(av)
  const bs = String(bv)
  const byPrimary = ascending ? as.localeCompare(bs) : bs.localeCompare(as)
  if (byPrimary !== 0) return byPrimary

  const aid = Number((a as any)?.entity_id ?? (a as any)?.id ?? 0)
  const bid = Number((b as any)?.entity_id ?? (b as any)?.id ?? 0)
  return ascending ? aid - bid : bid - aid
}

export function UnifiedGroupedTaskList<T>({
  columns,
  gridTemplateColumns,
  onTaskSelect,
  filters,
  pageSize = 50,
  sortBy,
  sortOrder,
  editFields,
  selectedTaskId,
  enabled = true,
  expandedMainTasks,
  isMultiselectMode,
  selectedTasks,
  onTaskToggle,
  showOutsideSelectionControls = true,
  onRenameTask,
  onDeleteTask,
  onChangeTaskProject,
  projectOptions = [],
  listColorMode = null,
  onListColorLegendChange,
  compact = false,
}: UnifiedGroupedTaskListProps<T>) {
  const { selectedGroupBy } = useTaskGrouping()
  // Read URL state via a shallow-nav-reactive params source so the left task list reacts to
  // history.replaceState updates (pills, toolbar, AI pane, and cross-pane "See more" actions),
  // not only Next.js soft navigations. useSearchParams() alone misses shallow updates.
  const params = useTasksShallowSearchParams()
  const urlGroupBy = parseActiveGroupByFromParam(params.get('groupBy'))
  const explicitGroupOrder = parseExplicitGroupOrderParam(params.get('groupOrder'))
  const selectedEntityType = params.get('itemKind') === 'suggestion' ? 'suggestion' : 'task'

  // Treat explicit "none" as ungrouped if it ever appears. URL `groupBy` wins until Zustand syncs on first paint.
  const effectiveGroupBy =
    (selectedGroupBy as string | null) === 'none' ? null : (selectedGroupBy ?? urlGroupBy)
  const isGroupedView = !!effectiveGroupBy
  const effectiveGroupOrder = !effectiveGroupBy
    ? 'asc'
    : (explicitGroupOrder ?? getDefaultGroupOrderForGroupBy(effectiveGroupBy))

  const groupDragDrop = useTaskGroupDragDrop({
    groupBy:
      isGroupedView && supportsTaskGroupDragDrop(effectiveGroupBy)
        ? (effectiveGroupBy as GroupByField)
        : null,
    editFields,
    enabled: isGroupedView && enabled !== false,
    isMultiselectMode,
  })

  // Canonical date dimension for compact rows. An explicit user choice — shared with the calendar
  // view via the `calendar_date_field` param so there's a single canonical state, no compact-only
  // param — always wins. Absent an explicit choice, fall back to the active grouping date, then the
  // active sort date, defaulting to delivery date. Compact rows show exactly one date (never both).
  const explicitDateField = params.get('calendar_date_field')
  const compactDateField: 'delivery_date' | 'publication_date' =
    explicitDateField === 'publication'
      ? 'publication_date'
      : explicitDateField === 'delivery'
        ? 'delivery_date'
        : effectiveGroupBy === 'publication_date'
          ? 'publication_date'
          : effectiveGroupBy === 'delivery_date'
            ? 'delivery_date'
            : sortBy === 'publication_date'
              ? 'publication_date'
              : 'delivery_date'

  // Parse filters from URL params; in project scope always use scope projectId (never omit)
  const q = params.get('q') || ''
  const urlProject = params.get('project') || undefined
  const project = useTasksScopeProjectParam(urlProject) ?? urlProject
  const { scope } = useTasksScope()
  const scopeProjectId = scope.type === 'project' ? scope.projectId : undefined
  const scopeAssigneeId = scope.type === 'user' ? scope.userId : undefined

  // URL param keys (from pills + filter pane) -> RPC filter keys. Single canonical source for task_group_tasks_filtered.
  // Example: status=em+curso in URL -> project_status_name -> p_status_names: ['em curso'] (not null).
  const filterMapping: Record<string, string> = {
    assignedTo: 'assigned_to_name',
    status: 'project_status_name',
    contentType: 'content_type_title',
    productionType: 'production_type_title',
    language: 'language_code',
    channels: 'channel_names',
    overdueStatus: 'overdueStatus',
  }

  const urlFilters: Record<string, string | string[]> = React.useMemo(() => {
    const out: Record<string, string | string[]> = {}
    for (const [urlKey, filterKey] of Object.entries(filterMapping)) {
      const value = params.get(urlKey)
      if (value) {
        out[filterKey] = value.includes(',') ? value.split(',') : value
      }
    }
    // Date range params from filter pane (canonical: same as pills / syncFiltersToUrl keys)
    const deliveryDateFrom = params.get('deliveryDateFrom')
    const deliveryDateTo = params.get('deliveryDateTo')
    const publicationDateFrom = params.get('publicationDateFrom')
    const publicationDateTo = params.get('publicationDateTo')
    if (deliveryDateFrom) out['delivery_date_gte'] = deliveryDateFrom
    if (deliveryDateTo) out['delivery_date_lt'] = deliveryDateTo
    if (publicationDateFrom) out['publication_date_gte'] = publicationDateFrom
    if (publicationDateTo) out['publication_date_lt'] = publicationDateTo
    // User scope: always lock assignee (do not rely on URL assignedTo — avoids fighting left-pane filters).
    if (scopeAssigneeId != null && Number.isFinite(scopeAssigneeId)) {
      out['assigned_to_name'] = String(scopeAssigneeId)
    }
    return out
  }, [params.toString(), scopeAssigneeId])

  // Stable, sorted representation so key doesn't flip due to object key order or URL normalization.
  const stableFiltersKey = React.useMemo(() => {
    const entries = Object.entries(urlFilters)
      .flatMap(([k, v]) =>
        Array.isArray(v) ? v.map((x) => [k, String(x)] as const) : [[k, String(v)] as const],
      )
      .sort(([aK, aV], [bK, bV]) => (aK === bK ? aV.localeCompare(bV) : aK.localeCompare(bK)))
    return JSON.stringify(entries)
  }, [urlFilters])

  // Canonical search session: both meta and tasks RPCs read from this ref at call time (no stale closures).
  const searchSessionRef = useRef<SearchSession>({
    gen: 0,
    params: {
      q: '',
      filters: {},
      groupBy: '',
      groupOrder: 'asc',
      sortBy: '',
      sortOrder: 'desc',
    },
  })
  useLayoutEffect(() => {
    searchSessionRef.current = {
      gen: searchSessionRef.current.gen + 1,
      params: {
        q,
        project,
        filters: urlFilters,
        groupBy: effectiveGroupBy ?? '',
        groupOrder: effectiveGroupOrder,
        sortBy,
        sortOrder,
      },
    }
  }, [q, project, stableFiltersKey, effectiveGroupBy, effectiveGroupOrder, sortBy, sortOrder])

  const plannerVisibility = useTasksUI((s) => s.plannerVisibility)

  const projectIdsForSuggestions = React.useMemo(() => {
    const parseList = (v: string | null | undefined) =>
      (v ?? '')
        .split(',')
        .map((x) => Number.parseInt(x.trim(), 10))
        .filter((n) => Number.isFinite(n))

    const fromProjectParam = parseList(project)
    if (fromProjectParam.length > 0) return fromProjectParam

    const fromProjectIdParam = parseList(params.get('projectId'))
    if (fromProjectIdParam.length > 0) return fromProjectIdParam

    return null
  }, [project, params.toString()])

  const suggestionsRange = React.useMemo(() => {
    const parse = (v: string | null) => (v ? new Date(v) : null)
    const fromCandidates = [parse(params.get('deliveryDateFrom')), parse(params.get('publicationDateFrom'))].filter(
      Boolean,
    ) as Date[]
    const toCandidates = [parse(params.get('deliveryDateTo')), parse(params.get('publicationDateTo'))].filter(
      Boolean,
    ) as Date[]

    if (fromCandidates.length || toCandidates.length) {
      const from = fromCandidates.length ? new Date(Math.min(...fromCandidates.map((d) => d.getTime()))) : new Date()
      const to = toCandidates.length
        ? new Date(Math.max(...toCandidates.map((d) => d.getTime())))
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      return { from, to }
    }

    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    const to = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999)
    return { from, to }
  }, [params.toString()])

  const suggestionContentTypeIds = useMemo(() => {
    const raw = params.get('contentType')
    if (!raw) return null
    const ids = raw
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value))
    return ids.length > 0 ? ids : null
  }, [params.toString()])

  const suggestionChannelIds = useMemo(() => {
    const raw = params.get('channels')
    if (!raw) return null
    const ids = raw
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value))
    return ids.length > 0 ? ids : null
  }, [params.toString()])

  const isDateGrouped =
    effectiveGroupBy === 'delivery_date' || effectiveGroupBy === 'publication_date'

  const suggestionsQuery = useTaskSuggestionsQuery({
    projectIds: projectIdsForSuggestions,
    contentTypeIds: suggestionContentTypeIds,
    channelIds: suggestionChannelIds,
    q,
    from: suggestionsRange.from,
    to: suggestionsRange.to,
    enabled: enabled !== false && plannerVisibility.showSuggestions,
    cacheKeyParts: ['board', effectiveGroupBy, effectiveGroupOrder, stableFiltersKey],
  })

  const optimisticPlannerTasksByKey = usePlannerOptimisticTasks((s) => s.byKey)
  const optimisticPlannerTasks = useMemo(
    () => Object.values(optimisticPlannerTasksByKey),
    [optimisticPlannerTasksByKey],
  )

  const suggestionsByGroupKey = useMemo(() => {
    const out = new Map<string, any[]>()
    if (!plannerVisibility.showSuggestions) return out
    if (process.env.NODE_ENV === 'development') {
      console.debug(
        '[suggestions raw]',
        (suggestionsQuery.data ?? []).map((s: any) => ({
          id: s?.id ?? s?.entity_id,
          title: s?.title ?? s?.proposed_title ?? s?.ai_title ?? null,
          planned_for_date: s?.planned_for_date ?? null,
        })),
      )
    }
    for (const s of suggestionsQuery.data ?? []) {
      const key = resolveSuggestionGroupKey(s, effectiveGroupBy)
      if (process.env.NODE_ENV === 'development' && effectiveGroupBy === 'delivery_date') {
        console.debug('[insert suggestion into group]', {
          id: (s as any)?.id ?? (s as any)?.entity_id,
          title: (s as any)?.title ?? (s as any)?.proposed_title ?? (s as any)?.ai_title ?? null,
          planned_for_date: (s as any)?.planned_for_date ?? null,
          delivery_date: (s as any)?.delivery_date ?? null,
          publication_date: (s as any)?.publication_date ?? null,
          groupBy: effectiveGroupBy,
          computedGroupKey: key,
        })
      }
      const arr = out.get(key) ?? []
      arr.push(s as any)
      out.set(key, arr)
    }
    out.forEach((rows, groupKey) => {
      rows.sort((a: any, b: any) =>
        comparePlannerRows({
          a,
          b,
          sortBy,
          sortOrder,
        }),
      )
      out.set(groupKey, rows)
    })
    if (process.env.NODE_ENV === 'development') {
      console.debug(
        '[suggestions after normalize]',
        (suggestionsQuery.data ?? []).map((s: any) => ({
          id: s?.suggestion_id ?? s?.id ?? s?.entity_id,
          title: s?.title ?? null,
          plannedForDate: s?.planned_for_date ?? s?.delivery_date ?? null,
          groupKey: resolveSuggestionGroupKey(s, effectiveGroupBy),
        })),
      )
      console.debug(
        '[suggestions after visibility filters]',
        Array.from(out.entries()).flatMap(([groupKey, rows]) =>
          rows.map((s: any) => ({
            id: s?.suggestion_id ?? s?.id ?? s?.entity_id,
            plannedForDate: s?.planned_for_date ?? s?.delivery_date ?? null,
            groupKey,
          })),
        ),
      )
    }
    return out
  }, [plannerVisibility.showSuggestions, suggestionsQuery.data, effectiveGroupBy, sortBy, sortOrder])

  const optimisticTasksByGroupKey = useMemo(() => {
    const out = new Map<string, any[]>()
    if (!plannerVisibility.showTasks) return out
    if (!effectiveGroupBy) return out
    for (const t of optimisticPlannerTasks) {
      const key = computeGroupKeyForTask(t as any, effectiveGroupBy)
      if (!key) continue
      const arr = out.get(key) ?? []
      arr.push(t as any)
      out.set(key, arr)
    }
    return out
  }, [plannerVisibility.showTasks, optimisticPlannerTasks, effectiveGroupBy])

  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set())
  const prevQueryShapeKeyRef = React.useRef<string | null>(null)
  const resetAllRef = React.useRef<() => void>(() => {})

  const isGroupExpanded = React.useCallback(
    (groupKey: string) => !collapsedGroups.has(groupKey),
    [collapsedGroups],
  )

  const groupTasksQuery = useTaskGroupTasksQuery({
    q,
    project,
    scopeProjectId,
    scopeAssigneeId,
    filters: urlFilters,
    groupBy: effectiveGroupBy,
    rowSortBy: sortBy,
    rowSortOrder: sortOrder,
    perPage: pageSize,
    enabled: enabled !== false,
    editFields,
    searchSessionRef,
  })
  resetAllRef.current = groupTasksQuery.resetAll

  // Grouped bootstrap:
  // - reset/initial grouped load: task_group_bootstrap_filtered (all headers + first N hydrated groups)
  const groupMetaQuery = useTaskGroupMetaPagedQuery({
    q,
    project,
    filters: urlFilters,
    groupBy: effectiveGroupBy,
    groupOrder: isGroupedView ? effectiveGroupOrder : undefined,
    rowSortBy: sortBy,
    rowSortOrder: sortOrder,
    bootstrapGroupLimit: INITIAL_BOOTSTRAP_GROUP_LIMIT,
    enabled: enabled !== false && isGroupedView,
    editFields,
    searchSessionRef,
    useBootstrapInitialLoad: enabled !== false && isGroupedView,
    onBootstrapHydrate: groupTasksQuery.hydrateFromBootstrap,
  })

  const groups: GroupHeader[] = useMemo(() => {
    if (!isGroupedView) {
      return [{ group_key: 'all', label: 'All tasks' }]
    }

    const baseSource = plannerVisibility.showTasks ? groupMetaQuery.groups ?? [] : []
    const base = (baseSource as any[]).map((g: { group_key?: unknown; label?: string; task_count?: number }) => {
      const rawKey = (g as any).group_key
      const normalizedKey =
        normalizeCanonicalGroupKey(
          rawKey == null ? null : String(rawKey),
          effectiveGroupBy,
        ) ?? String(rawKey ?? '')
      return {
        group_key: normalizedKey,
        label: typeof (g as any).label === 'string' ? (g as any).label : normalizedKey,
        task_count: typeof (g as any).task_count === 'number' ? (g as any).task_count : undefined,
      }
    }) as GroupHeader[]
    const seen = new Set(base.map(g => String(g.group_key)))
    const merged = [...base]

    if (plannerVisibility.showSuggestions) {
      for (const s of suggestionsQuery.data ?? []) {
        const key = resolveSuggestionGroupKey(s, effectiveGroupBy)
        const normalizedKey = normalizeCanonicalGroupKey(key, effectiveGroupBy)
        if (normalizedKey == null) continue
        if (seen.has(normalizedKey)) continue
        seen.add(normalizedKey)
        merged.push({ group_key: normalizedKey, label: resolveSuggestionGroupLabel(normalizedKey, effectiveGroupBy) })
      }
    }

    // Merge groups from tasksByGroup (optimistic adds, e.g. future month with no meta yet).
    if (plannerVisibility.showTasks) {
      const tasksByGroup = groupTasksQuery.tasksByGroup ?? {}
      for (const key of Object.keys(tasksByGroup)) {
        const normalizedKey = normalizeCanonicalGroupKey(key, effectiveGroupBy) ?? key
        if (!normalizedKey || seen.has(normalizedKey)) continue
        const rows = tasksByGroup[key] ?? []
        const label =
          rows.length > 0
            ? computeGroupLabelForTask(rows[0] as any, effectiveGroupBy)
            : getGroupLabelFromKey(normalizedKey, effectiveGroupBy)
        seen.add(normalizedKey)
        merged.push({ group_key: normalizedKey, label })
      }
    }

    if (effectiveGroupBy === 'delivery_date' || effectiveGroupBy === 'publication_date') {
      const noDateKeys = new Set([GROUP_KEY_NO_DATE, 'no-date'])
      merged.sort((a, b) => {
        const ak = String(a.group_key)
        const bk = String(b.group_key)
        const aNoDate = noDateKeys.has(ak)
        const bNoDate = noDateKeys.has(bk)
        if (aNoDate && bNoDate) return 0
        if (aNoDate) return 1
        if (bNoDate) return -1
        return effectiveGroupOrder === 'asc' ? ak.localeCompare(bk) : bk.localeCompare(ak)
      })
    }

    // Bootstrap now returns canonical backend order for ALL group headers.
    // Never apply client-side sorting here; preserve backend order exactly.
    if (process.env.NODE_ENV === 'development') {
      console.log(
        '[UnifiedGroupedTaskList] final FE group order before render',
        merged.map(g => ({ key: String(g.group_key), label: String(g.label) })),
      )
    }
    return merged
  }, [
    isGroupedView,
    plannerVisibility.showTasks,
    groupMetaQuery.groups,
    plannerVisibility.showSuggestions,
    suggestionsQuery.data,
    effectiveGroupBy,
    effectiveGroupOrder,
    groupTasksQuery.tasksByGroup,
  ])

  // Query-shape key from primitives only (stable across hydration / URL normalization).
  const queryShapeKey = React.useMemo(
    () =>
      JSON.stringify({
        q: q ?? '',
        project: project ?? '',
        filters: stableFiltersKey,
        groupBy: effectiveGroupBy ?? '',
        groupOrder: effectiveGroupOrder,
        sortBy,
        sortOrder,
      }),
    [q, project, stableFiltersKey, effectiveGroupBy, effectiveGroupOrder, sortBy, sortOrder],
  )

  // Store scroll element in state so the virtualizer attaches reliably on first paint.
  // (Ref-only caused broken initial range and "scroll up then down" to trigger fetch.)
  const [scrollEl, setScrollEl] = React.useState<HTMLElement | null>(null)
  const scrollRootRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const find = () => {
      const el = document.querySelector('[data-task-scroll-container]') as HTMLElement | null
      setScrollEl(el)
      scrollRootRef.current = el
      return el
    }
    if (find()) return
    const t = window.setTimeout(find, 0)
    return () => window.clearTimeout(t)
  }, [])

  const toggleGroup = React.useCallback(
    (groupKey: string) => {
      setCollapsedGroups(prev => {
        const next = new Set(prev)
        if (!next.has(groupKey)) {
          next.add(groupKey)
        } else {
          next.delete(groupKey)
        }
        return next
      })
    },
    [],
  )

  // Reset collapsed groups & all group task state only when the query shape really changes.
  // Depends only on queryShapeKey (stable primitives) so we don't reset after first paint due to
  // hydration, Zustand init, or URL key order (defaults now match `tasks-grouping-url`).
  useEffect(() => {
    if (prevQueryShapeKeyRef.current !== queryShapeKey) {
      prevQueryShapeKeyRef.current = queryShapeKey
      setCollapsedGroups(new Set())
      resetAllRef.current()
      queueMicrotask(() => {
        scrollRootRef.current?.scrollTo?.({ top: 0 })
      })
    }
  }, [queryShapeKey])

  const blockingGroupKey = useMemo(() => {
    const collapsed = collapsedGroups
    const nextCursorByGroup = groupTasksQuery.cursorByGroup
    const loadedFirstPageByGroup = groupTasksQuery.loadedFirstPageByGroup

    return computeBlockingGroupKey({
      groups,
      collapsedGroups: collapsed,
      nextCursorByGroup,
      loadedFirstPageByGroup,
    })
  }, [groups, collapsedGroups, groupTasksQuery.cursorByGroup, groupTasksQuery.loadedFirstPageByGroup])

  const buildRowFetchContext = React.useCallback(
    (
      targetGroupKey: string,
      opts?: { groupIndex?: number; visibleWindowIndices?: { start: number; end: number } | null },
    ) => {
      const isBlockingGroup = blockingGroupKey != null && String(blockingGroupKey) === String(targetGroupKey)
      const targetIdx = groups.findIndex(g => String(g.group_key) === String(targetGroupKey))
      let areEarlierGroupsFullyDrained = true
      if (targetIdx > 0) {
        for (let i = 0; i < targetIdx; i++) {
          const g = groups[i]
          const key = String(g.group_key)
          if (collapsedGroups.has(key)) continue
          const drained = isGroupDrained({
            groupKey: key,
            taskCount: g.task_count,
            nextCursorByGroup: groupTasksQuery.cursorByGroup,
            loadedFirstPageByGroup: groupTasksQuery.loadedFirstPageByGroup,
          })
          if (!drained) {
            areEarlierGroupsFullyDrained = false
            break
          }
        }
      }
      return {
        isBlockingGroup,
        areEarlierGroupsFullyDrained,
        groupCameFromBootstrap: !!groupTasksQuery.bootstrapHydratedByGroup[targetGroupKey],
        nextRowCursor: groupTasksQuery.cursorByGroup[targetGroupKey] ?? null,
        groupIndex: opts?.groupIndex ?? (targetIdx >= 0 ? targetIdx : undefined),
        visibleWindowIndices: opts?.visibleWindowIndices ?? null,
      }
    },
    [
      blockingGroupKey,
      collapsedGroups,
      groupTasksQuery.bootstrapHydratedByGroup,
      groupTasksQuery.cursorByGroup,
      groupTasksQuery.loadedFirstPageByGroup,
      groups,
    ],
  )

  const revealedGroups = useMemo(() => {
    if (!groups.length) return []
    // Date-grouped suggestions may belong to future months that have no hydrated task rows yet.
    // Reveal all date groups so suggestion-only months are not suppressed behind the blocking task group.
    if (
      plannerVisibility.showSuggestions &&
      (effectiveGroupBy === 'delivery_date' || effectiveGroupBy === 'publication_date')
    ) {
      return groups
    }
    // When no blocking group, all expanded groups are drained → show all groups.
    if (!blockingGroupKey) return groups

    const blockingIdx = groups.findIndex(g => String(g.group_key) === String(blockingGroupKey))
    if (blockingIdx === -1) return groups.slice(0, 1)
    return groups.slice(0, blockingIdx + 1)
  }, [
    groups,
    plannerVisibility.showSuggestions,
    effectiveGroupBy,
    blockingGroupKey,
  ])

  const flattenedItems: FlattenedItem[] = useMemo(() => {
    const result: FlattenedItem[] = []

    const blockingIdx =
      blockingGroupKey != null ? groups.findIndex(g => String(g.group_key) === String(blockingGroupKey)) : -1

    const starterKey =
      blockingGroupKey ??
      (groups.find(g => !collapsedGroups.has(String(g.group_key)))?.group_key
        ? String(groups.find(g => !collapsedGroups.has(String(g.group_key)))!.group_key)
        : null)

    const isUngroupedSingleAll =
      groups.length === 1 && String(groups[0]?.group_key) === 'all'

    for (const group of revealedGroups) {
      const groupKey = String(group.group_key)
      const label = group.label
      const isExpanded = isGroupExpanded(groupKey)
      const groupIdx = groups.findIndex(g => String(g.group_key) === groupKey)
      const isAfterBlocking = blockingIdx !== -1 && groupIdx > blockingIdx

      const rowsForGroupPreview = plannerVisibility.showTasks
        ? resolveTasksForGroupKey(groupTasksQuery.tasksByGroup, String(groupKey), effectiveGroupBy)
        : []
      const suggestionsForGroupPreview =
        plannerVisibility.showSuggestions ? suggestionsByGroupKey.get(String(groupKey)) ?? [] : []
      const optimisticForGroupPreview =
        plannerVisibility.showTasks ? optimisticTasksByGroupKey.get(String(groupKey)) ?? [] : []
      const displayTaskCount =
        typeof group.task_count === 'number' ? group.task_count : undefined

      if (!isUngroupedSingleAll) {
        result.push({
          type: 'group',
          groupKey,
          label,
          isExpanded,
          isAfterBlocking,
          taskCount: displayTaskCount,
        })
      }

      const shouldRenderRows = computeShouldRenderRows({
        groupKey,
        groups,
        blockingGroupKey,
        collapsedGroups,
      })
      const rowsForGroup = rowsForGroupPreview
      const suggestionsForGroup = suggestionsForGroupPreview
      const optimisticForGroup = optimisticForGroupPreview
      const allowSuggestionRowsBeyondBlocking =
        !shouldRenderRows &&
        plannerVisibility.showSuggestions &&
        suggestionsForGroup.length > 0 &&
        (effectiveGroupBy === 'delivery_date' || effectiveGroupBy === 'publication_date')

      if (!isExpanded || (!shouldRenderRows && !allowSuggestionRowsBeyondBlocking)) {
        // Header-only for collapsed groups and for future groups after the blocking group.
        continue
      }
      const taskRowsForGroup = plannerVisibility.showTasks ? rowsForGroup : []
      const hasAnyRowsForGroup =
        suggestionsForGroup.length > 0 || optimisticForGroup.length > 0 || taskRowsForGroup.length > 0

      if (DEBUG_GROUPED_TASKS && starterKey && groupKey === starterKey) {
        const showsLoadingRow =
          suggestionsForGroup.length === 0 && optimisticForGroup.length === 0 && rowsForGroup.length === 0
        console.log('[UnifiedGroupedTaskList] flattenedItems starter diagnostics', {
          starterKey,
          shouldRenderRowsForStarter: shouldRenderRows,
          rowsLen: rowsForGroup.length,
          showsLoadingRow,
          suggestionsLen: suggestionsForGroup.length,
          optimisticLen: optimisticForGroup.length,
        })
      }

      if (!hasAnyRowsForGroup && (plannerVisibility.showTasks || plannerVisibility.showSuggestions)) {
        // Expanded + allowed to render rows, but nothing loaded yet.
        if (plannerVisibility.showTasks && (groupTasksQuery.isLoadingRowsByGroup[groupKey] ?? false)) {
          result.push({ type: 'loading', groupKey })
        } else if (
          plannerVisibility.showTasks &&
          shouldRenderRows &&
          isGroupedView &&
          String(groupKey) !== 'all'
        ) {
          result.push({ type: 'empty', groupKey })
        }
        continue
      }

      const normalizedRows: any[] = []
      for (const s of suggestionsForGroup) {
        const mapped = mapTaskListRowToTableFormat(s as any) as any
        mapped.kind = 'suggestion'
        mapped.entity_type = 'suggestion'
        mapped.entity_id = Number((s as any).entity_id ?? (s as any).id)
        mapped.board_item_id = `suggestion:${mapped.entity_id}`
        mapped.id = mapped.board_item_id
        mapped.suggestion_id = mapped.entity_id
        mapped.briefing = (s as any).briefing ?? null
        mapped.channel_ids = (s as any).channel_ids ?? []
        mapped.channel_names = (s as any).channel_names ?? []
        mapped.source_key = (s as any).source_key ?? null
        mapped.planned_for_date =
          (s as any).planned_for_date ?? (s as any).delivery_date ?? (s as any).publication_date ?? null
        normalizedRows.push(mapped)
      }

      if (plannerVisibility.showTasks) {
        const seenEntityIds = new Set<string>()
        for (const t of optimisticForGroup) {
          const task = mapTaskListRowToTableFormat(t as any) as any
          task.kind = 'task'
          task.entity_type = 'task'
          task.entity_id = Number((t as any).entity_id ?? (t as any).id)
          task.board_item_id = `task:${task.entity_id}`
          task.id = task.entity_id
          task.source_key = (t as any).source_key ?? null
          task.projectLogoUrl = getImageUrl((task as any).project_logo ?? (task as any).projects?.logo)
          task.assignedToPhotoUrl = getImageUrl(
            (task as any).assigned_to_photo ?? (task as any).assigned_user?.photo,
          )
          const entityKey = String(task.entity_id)
          if (seenEntityIds.has(entityKey)) continue
          seenEntityIds.add(entityKey)
          normalizedRows.push(task)
        }
        for (const row of taskRowsForGroup) {
          const task = mapTaskListRowToTableFormat(row as any) as any
          task.kind = 'task'
          task.entity_type = 'task'
          task.entity_id = Number((row as any).entity_id ?? (row as any).id)
          task.board_item_id = `task:${task.entity_id}`
          task.id = task.entity_id
          task.source_key = (row as any).source_key ?? null
          // Add derived URLs (storage path -> public URL) for TaskList column renderers.
          // This avoids per-cell recompute and keeps grouped/ungrouped behavior consistent.
          task.projectLogoUrl = getImageUrl((task as any).project_logo ?? (task as any).projects?.logo)
          task.assignedToPhotoUrl = getImageUrl(
            (task as any).assigned_to_photo ?? (task as any).assigned_user?.photo,
          )
          const entityKey = String(task.entity_id)
          if (seenEntityIds.has(entityKey)) continue
          seenEntityIds.add(entityKey)
          normalizedRows.push(task)
        }
      }

      if (!isGroupedView || String(groupKey) === 'all') {
        normalizedRows.sort((a, b) =>
          comparePlannerRows({
            a,
            b,
            sortBy,
            sortOrder,
          }),
        )
      }

      for (const row of normalizedRows) {
        const taskId = Number((row as any).entity_id ?? (row as any).id)
        const isLastInGroup = row === normalizedRows[normalizedRows.length - 1]
        result.push({ type: 'task', task: row, groupKey, isLastInGroup })
        const isMainTask =
          (row as any).kind !== 'suggestion' && ((row as any).content_type_id === 39 || (row as any).content_type_id === '39')
        const isExpandedMain = isMainTask && !!expandedMainTasks?.has?.(Number((row as any).entity_id))
        if (isExpandedMain && onTaskSelect && Number.isFinite(Number((row as any).entity_id))) {
          result.push({ type: 'subtasks', groupKey, parentId: Number((row as any).entity_id) })
        }
      }
    }

    return result
  }, [
    groups,
    revealedGroups,
    blockingGroupKey,
    collapsedGroups,
    groupTasksQuery.tasksByGroup,
    isGroupExpanded,
    plannerVisibility.showSuggestions,
    plannerVisibility.showTasks,
    suggestionsByGroupKey,
    optimisticTasksByGroupKey,
    expandedMainTasks,
    onTaskSelect,
    groupTasksQuery.isLoadingRowsByGroup,
    sortBy,
    sortOrder,
    isGroupedView,
  ])

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    const byGroup = new Map<string, number[]>()
    for (const item of flattenedItems) {
      if (item.type !== 'task') continue
      const row = (item as any).task
      if ((row as any)?.kind !== 'suggestion') continue
      const key = String((item as any).groupKey)
      const id = Number((row as any)?.suggestion_id ?? (row as any)?.entity_id ?? (row as any)?.id)
      const arr = byGroup.get(key) ?? []
      if (Number.isFinite(id)) arr.push(id)
      byGroup.set(key, arr)
    }
    console.debug(
      '[merged groups]',
      groups.map((g) => {
        const key = String((g as any).group_key)
        const suggestionIds = byGroup.get(key) ?? []
        const rowCount = (groupTasksQuery.tasksByGroup?.[key]?.length ?? 0) + suggestionIds.length
        return {
          group_key: key,
          label: (g as any).label,
          rowCount,
          suggestionIds,
        }
      }),
    )
  }, [flattenedItems, groups, groupTasksQuery.tasksByGroup])

  const allTasks = useMemo(
    () => flattenedItems.filter(item => item.type === 'task').map(item => (item as any).task),
    [flattenedItems],
  )

  const table = useReactTable<any>({
    data: allTasks,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: row =>
      String((row as any).board_item_id ?? `${String((row as any).entity_type)}:${String((row as any).entity_id)}`),
  })
  const hasTasks = allTasks.length > 0

  const colorLegendEntries = useMemo(() => {
    if (!listColorMode) return []
    const map = new Map<string, { key: string; label: string; colorClass: string }>()
    for (const task of allTasks) {
      if (!task || (task as any).kind === 'suggestion') continue
      const key = getTaskColorKey(task, listColorMode)
      if (map.has(key)) continue
      map.set(key, {
        key,
        label: getTaskColorLabel(task, listColorMode),
        colorClass: getStablePaletteClass(key),
      })
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [allTasks, listColorMode])

  const lastLegendSigRef = useRef<string>('')
  useEffect(() => {
    if (!onListColorLegendChange) return
    const sig = JSON.stringify(colorLegendEntries.map((e) => [e.key, e.label]))
    if (sig === lastLegendSigRef.current) return
    lastLegendSigRef.current = sig
    onListColorLegendChange(colorLegendEntries)
  }, [colorLegendEntries, onListColorLegendChange])

  // --- Virtualization --------------------------------------------------------
  // We virtualize `flattenedItems` (headers + rows) inside <tbody> using
  // the spacer-row pattern recommended for tables:
  // - render a top spacer row with height = padding before first virtual row
  // - render ONLY the virtual rows
  // - render a bottom spacer row for remaining height
  //
  // This keeps a real <table> layout (horizontal scroll works) while avoiding
  // rendering thousands of <tr>s.
  const rowVirtualizer = useVirtualizer({
    count: flattenedItems.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => VIRTUAL_ROW_ESTIMATE_PX,
    overscan: VIRTUAL_OVERSCAN,
    getItemKey: (index) => {
      const it = flattenedItems[index]
      return it ? getFlattenedItemKey(it) : `idx-${index}`
    },
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const paddingTop = virtualRows.length ? virtualRows[0]!.start : 0
  const paddingBottom = virtualRows.length
    ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1]!.end
    : 0

  const revealedGroupIndexByKey = useMemo(() => {
    const out = new Map<string, number>()
    for (let i = 0; i < revealedGroups.length; i++) {
      out.set(String(revealedGroups[i].group_key), i)
    }
    return out
  }, [revealedGroups])

  const visibleGroupWindow = useMemo(() => {
    if (!virtualRows.length) return null
    let minIdx = Number.POSITIVE_INFINITY
    let maxIdx = -1
    for (const vRow of virtualRows) {
      const item = flattenedItems[vRow.index]
      if (!item || typeof (item as any).groupKey !== 'string') continue
      const idx = revealedGroupIndexByKey.get(String((item as any).groupKey))
      if (typeof idx !== 'number') continue
      minIdx = Math.min(minIdx, idx)
      maxIdx = Math.max(maxIdx, idx)
    }
    if (!Number.isFinite(minIdx) || maxIdx < 0) return null
    return {
      start: Math.max(0, minIdx - 1),
      end: Math.min(revealedGroups.length - 1, maxIdx + 1),
    }
  }, [virtualRows, flattenedItems, revealedGroupIndexByKey, revealedGroups.length])

  // Viewport-driven row hydration: only visible groups (+1 buffer) can trigger first-page row fetch.
  useEffect(() => {
    if (groupMetaQuery.isBootstrapping) return
    if (!visibleGroupWindow) return

    for (let i = visibleGroupWindow.start; i <= visibleGroupWindow.end; i++) {
      const group = revealedGroups[i]
      if (!group) continue
      const groupKey = String(group.group_key)
      if (!isGroupExpanded(groupKey)) continue
      const rowCount = groupTasksQuery.tasksByGroup[groupKey]?.length ?? 0
      const isLoadingRows = !!groupTasksQuery.isLoadingRowsByGroup[groupKey]
      if (rowCount > 0 || isLoadingRows) continue
      groupTasksQuery.ensureFirstPage(
        groupKey,
        'visible hydration',
        buildRowFetchContext(groupKey, { groupIndex: i, visibleWindowIndices: visibleGroupWindow }),
      )
    }
  }, [
    buildRowFetchContext,
    groupMetaQuery.isBootstrapping,
    groupTasksQuery.ensureFirstPage,
    groupTasksQuery.isLoadingRowsByGroup,
    groupTasksQuery.tasksByGroup,
    isGroupExpanded,
    revealedGroups,
    visibleGroupWindow,
  ])

  const groupLastRowIndexByKey = useMemo(() => {
    const out: Record<string, number> = {}
    for (let i = 0; i < flattenedItems.length; i++) {
      const item = flattenedItems[i]
      if (!item || item.type === 'group') continue
      out[String(item.groupKey)] = i
    }
    return out
  }, [flattenedItems])

  const activeVisibleGroupKey = useMemo(() => {
    if (!visibleGroupWindow) return null
    for (let i = visibleGroupWindow.start; i <= visibleGroupWindow.end; i++) {
      const group = revealedGroups[i]
      if (!group) continue
      const groupKey = String(group.group_key)
      if (!isGroupExpanded(groupKey)) continue
      const loadedFirst = !!groupTasksQuery.loadedFirstPageByGroup[groupKey]
      const hasMore = groupTasksQuery.hasMoreByGroup[groupKey] ?? true
      if (loadedFirst && hasMore) return groupKey
    }
    return null
  }, [
    visibleGroupWindow,
    revealedGroups,
    isGroupExpanded,
    groupTasksQuery.loadedFirstPageByGroup,
    groupTasksQuery.hasMoreByGroup,
  ])

  // Viewport-driven load-more: continue only one active visible group at a time.
  useEffect(() => {
    if (groupMetaQuery.isBootstrapping) return
    const activeGroupKey = activeVisibleGroupKey
    if (!activeGroupKey) return
    if (!isGroupExpanded(activeGroupKey)) return

    const fetching = !!groupTasksQuery.isLoadingRowsByGroup[activeGroupKey]
    const hasMore = groupTasksQuery.hasMoreByGroup[activeGroupKey] ?? true
    if (fetching || !hasMore) return

    const groupIndex = revealedGroupIndexByKey.get(activeGroupKey)
    const fetchContext =
      typeof groupIndex === 'number'
        ? buildRowFetchContext(activeGroupKey, { groupIndex, visibleWindowIndices: visibleGroupWindow })
        : buildRowFetchContext(activeGroupKey, { visibleWindowIndices: visibleGroupWindow })

    if (scrollEl) {
      const bufferPx = 250
      const filled = rowVirtualizer.getTotalSize() >= scrollEl.clientHeight + bufferPx
      if (!filled) {
        groupTasksQuery.fetchMore(activeGroupKey, 'load more', fetchContext)
        return
      }
    }

    const lastVirtualIndex = virtualRows.at(-1)?.index ?? 0
    const groupLastRowIndex = groupLastRowIndexByKey[activeGroupKey] ?? -1
    if (groupLastRowIndex !== -1 && lastVirtualIndex >= groupLastRowIndex - FETCH_AHEAD_ROWS) {
      groupTasksQuery.fetchMore(activeGroupKey, 'load more', fetchContext)
    }
  }, [
    activeVisibleGroupKey,
    buildRowFetchContext,
    groupLastRowIndexByKey,
    groupMetaQuery.isBootstrapping,
    groupTasksQuery.fetchMore,
    groupTasksQuery.hasMoreByGroup,
    groupTasksQuery.isLoadingRowsByGroup,
    isGroupExpanded,
    revealedGroupIndexByKey,
    rowVirtualizer,
    scrollEl,
    virtualRows,
    visibleGroupWindow,
  ])

  const rowVirtualizerRef = useRef(rowVirtualizer)
  rowVirtualizerRef.current = rowVirtualizer
  // Re-measure rows after structural changes (expand/collapse, filters) to avoid blank gaps or late jumps.
  useEffect(() => {
    rowVirtualizerRef.current.measure()
  }, [collapsedGroups, expandedMainTasks, flattenedItems.length])

  return (
    <TaskGroupDragDropProvider
      providerProps={groupDragDrop.providerProps}
      contextValue={groupDragDrop.contextValue}
      activeDropIndicatorId={groupDragDrop.activeDropIndicatorId}
      dragOverlay={<TaskGroupDragOverlayRow task={groupDragDrop.activeTask} />}
    >
    <>
      {paddingTop > 0 && (
        <tr aria-hidden="true" data-row-type="padding" className="task-row" style={{ gridTemplateColumns }}>
          <td colSpan={columns.length} className="task-cell-span-full" style={{ height: paddingTop, padding: 0 }} />
        </tr>
      )}

      {virtualRows.map(vRow => {
        const item = flattenedItems[vRow.index]
        if (!item) return null

        const key = getFlattenedItemKey(item)

        if (item.type === 'group') {
          if (compact) {
            // Compact mode: directory-style section labels (AI chats / templates).
            return (
              <GroupDropZone
                key={key}
                groupKey={item.groupKey}
                slot="header"
                edge="start"
                as="tr"
                measureRef={rowVirtualizer.measureElement}
                dataIndex={vRow.index}
                dataRowType="group"
              className="task-row group-header sticky z-10 bg-white/95 backdrop-blur-sm top-[var(--task-list-sticky-top,0px)]"
                style={{ gridTemplateColumns }}
              >
                <td className="task-cell task-cell-span-full task-group-label bg-transparent px-1 pb-1.5 pt-6">
                  <div className="flex w-full items-center gap-2">
                    <button
                      type="button"
                      onClick={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        toggleGroup(item.groupKey)
                      }}
                      className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-left"
                    >
                      <span className="min-w-0 truncate text-sm font-normal text-gray-500">
                        <TaskGroupHeaderLabel
                          groupBy={effectiveGroupBy}
                          groupKey={item.groupKey}
                          label={item.label}
                          editFields={editFields}
                          directoryStyle
                        />
                      </span>
                      {item.isExpanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                      )}
                      {typeof item.taskCount === 'number' ? (
                        <span className="shrink-0 text-xs font-normal tabular-nums text-gray-400">
                          {item.taskCount}
                        </span>
                      ) : null}
                    </button>
                  </div>
                </td>
              </GroupDropZone>
            )
          }
          const titleColIndex = (columns as any[]).findIndex(c => (c.id ?? c.accessorKey) === 'title')
          const titleCol1Based = titleColIndex >= 0 ? titleColIndex + 1 : 1
          return (
            <GroupDropZone
              key={key}
              groupKey={item.groupKey}
              slot="header"
              edge="start"
              as="tr"
              measureRef={rowVirtualizer.measureElement}
              dataIndex={vRow.index}
              dataRowType="group"
              className="task-row group-header sticky z-10 bg-white/95 backdrop-blur-sm top-[calc(var(--task-list-sticky-top,0px)+2.5rem)]"
              style={{ gridTemplateColumns }}
            >
              {/* Empty cells for columns before title (e.g. select) */}
              {titleColIndex > 0 &&
                Array.from({ length: titleColIndex }).map((_, i) => (
                  <td key={`group-pad-${i}`} className="task-cell bg-transparent p-0" />
                ))}
              {/* Title column: group label, sticky-left like Title */}
              <td
                className="task-cell task-cell--sticky task-group-label bg-transparent pl-0 pr-3 pb-1.5 pt-6"
                data-col="title"
              >
                <div className="flex w-full items-center gap-1.5">
                  <button
                    type="button"
                    onClick={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      toggleGroup(item.groupKey)
                    }}
                    className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-left"
                  >
                    <span className="min-w-0 truncate text-sm font-normal text-gray-500">
                      <TaskGroupHeaderLabel
                        groupBy={effectiveGroupBy}
                        groupKey={item.groupKey}
                        label={item.label}
                        editFields={editFields}
                        directoryStyle
                      />
                    </span>
                    {item.isExpanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                    )}
                    {typeof item.taskCount === 'number' ? (
                      <span className="shrink-0 text-xs font-normal tabular-nums text-gray-400">
                        {item.taskCount}
                      </span>
                    ) : null}
                  </button>
                </div>
              </td>
              {/* Span rest of row */}
              <td
                className="task-cell task-cell-span-rest bg-transparent"
                style={{ gridColumn: `${titleCol1Based + 1} / -1` }}
              />
            </GroupDropZone>
          )
        }

        if (item.type === 'loading') {
          return (
            <GroupDropZone
              key={key}
              groupKey={item.groupKey}
              slot="loading"
              as="tr"
              measureRef={rowVirtualizer.measureElement}
              dataIndex={vRow.index}
              dataRowType="loading"
              className={cn("task-row", !compact && "border-b")}
              style={{ gridTemplateColumns }}
            >
              <td colSpan={columns.length} className="task-cell task-cell-span-full px-3 py-3 text-sm text-muted-foreground">
                Loading tasks...
              </td>
            </GroupDropZone>
          )
        }

        if (item.type === 'empty') {
          return (
            <GroupDropZone
              key={key}
              groupKey={item.groupKey}
              slot="empty"
              edge="start"
              as="tr"
              measureRef={rowVirtualizer.measureElement}
              dataIndex={vRow.index}
              dataRowType="empty"
              className={cn("task-row", !compact && "border-b")}
              style={{ gridTemplateColumns }}
            >
              <td colSpan={columns.length} className="task-cell task-cell-span-full px-3 py-6 text-sm text-muted-foreground">
                Drop tasks here
              </td>
            </GroupDropZone>
          )
        }

        if (item.type === 'subtasks') {
          // Subtasks are one virtualized item per expanded main task; height is measured as one block.
          // Nested table keeps column alignment; if horizontal overflow/column mismatch appears, use a <div> list instead.
          // When subtasks load async, measureElement + rowVirtualizer.measure() keep heights correct.
          return (
            <tr
              key={key}
              data-index={vRow.index}
              ref={rowVirtualizer.measureElement}
              className={cn("task-row", !compact && "border-b")}
              style={{ gridTemplateColumns }}
            >
              <td colSpan={columns.length} className="task-cell task-cell-span-full p-0">
                {/* `task-cell` is `display:flex` (globals.css), so this wrapper must be `w-full` to
                    stretch to the full cell width — otherwise the flex item shrinks to the nested
                    table's intrinsic content width and compact subtasks render narrower than parents. */}
                <div className="w-full min-w-0">
                  <table className={cn('task-list-grid w-full', compact && 'task-list-grid--compact')}>
                    <tbody>
                      <SubtaskRows
                        parentId={item.parentId}
                        taskColumns={columns as any[]}
                        gridTemplateColumns={gridTemplateColumns}
                        onTaskSelect={onTaskSelect as any}
                        selectedTaskId={selectedTaskId}
                        isMobile={false}
                        isMultiselectMode={isMultiselectMode}
                        selectedTasks={selectedTasks}
                        onTaskToggle={onTaskToggle}
                        listColorMode={listColorMode}
                        compact={compact}
                        compactDateField={compactDateField}
                      />
                    </tbody>
                  </table>
                </div>
              </td>
            </tr>
          )
        }

        // item.type === 'task'
        const task = item.task

        // Compact (narrow left-pane) row: single full-width cell, no column grid, no horizontal scroll.
        // Preserves click-to-open for both tasks and suggestions.
        if (compact) {
          const isSelectedCompact = !!(
            selectedTaskId &&
            selectedEntityType === String((task as any).entity_type) &&
            String(selectedTaskId) === String((task as any).entity_id)
          )
          const isCompactSuggestion = (task as any)?.kind === 'suggestion'
          const compactTaskId = Number((task as any)?.id ?? (task as any)?.entity_id)
          const isCompactChecked =
            !isCompactSuggestion && !!selectedTasks?.has?.(compactTaskId)
          const handleTaskRowClick = (e: React.MouseEvent) => {
            const target = e.target as Element
            if (target?.closest?.('[data-inline-editor]')) return
            if (target?.closest?.('[data-editable-cell]')) return
            if (target?.closest?.('button[aria-label="Drag task to another group"]')) return
            onTaskSelect?.(task)
          }
          const insertDropEdges = renderTaskRowInsertDropEdges({
            groupKey: item.groupKey,
            task: task as Record<string, unknown>,
            isLastInGroup: item.isLastInGroup,
          })
          const compactBulkRun = getBulkSelectionRun(flattenedItems, vRow.index, selectedTasks)
          return (
            <DraggableTaskRow
              key={key}
              measureRef={rowVirtualizer.measureElement}
              dataIndex={vRow.index}
              dataRowType="task"
              onClick={handleTaskRowClick}
              insertDropEdges={insertDropEdges}
              rowProps={{
                'data-bulk-selected': compactBulkRun.isBulkSelected ? 'true' : undefined,
                'data-bulk-run': compactBulkRun.run ?? undefined,
              } as React.HTMLAttributes<HTMLTableRowElement>}
              className={cn(
                'task-row hover:bg-gray-50/60 cursor-pointer',
                !compact && !compactBulkRun.isBulkSelected && 'border-b border-gray-100/70',
                (isSelectedCompact || isCompactChecked) &&
                  !compactBulkRun.isBulkSelected &&
                  'bg-gray-100',
              )}
              style={{ gridTemplateColumns }}
            >
              <td className="task-cell task-cell-span-full px-4 py-1.5">
                <CompactEditableRowContent
                  task={task}
                  columns={columns}
                  dateField={compactDateField}
                  isMultiselectMode={isMultiselectMode}
                  isTaskSelected={isCompactChecked}
                  onTaskToggle={onTaskToggle}
                  dragHandle={
                    <TaskDragHandle
                      task={task as Record<string, unknown>}
                      sourceGroupKey={item.groupKey}
                    />
                  }
                />
              </td>
            </DraggableTaskRow>
          )
        }

        const handleTaskRowClick = (e: React.MouseEvent) => {
          const target = e.target as Element
          if (target?.closest?.('[data-inline-editor]')) return
          if (target?.closest?.('[data-editable-cell]')) return
          if (target?.closest?.('button[aria-label="Drag task to another group"]')) return
          if (target?.closest?.('button[aria-label="Task actions"]')) return
          if (target?.closest?.('input[type="checkbox"]')) return
          onTaskSelect?.(task)
        }
        const insertDropEdges = renderTaskRowInsertDropEdges({
          groupKey: item.groupKey,
          task: task as Record<string, unknown>,
          isLastInGroup: item.isLastInGroup,
        })

        const rowId = String(
          (task as any).board_item_id ?? `${String((task as any).entity_type)}:${String((task as any).entity_id)}`,
        )
        const tableRow = table.getRow(rowId)
        const taskNumericId = Number((task as any)?.id ?? (task as any)?.entity_id)
        const isSuggestionRow = (task as any)?.kind === 'suggestion'
        const isChecked =
          !isSuggestionRow &&
          Number.isFinite(taskNumericId) &&
          !!selectedTasks?.has?.(taskNumericId)
        const showOutsideCheckbox =
          showOutsideSelectionControls && !isSuggestionRow && !!onTaskToggle
        const forceShowControls =
          Boolean(isMultiselectMode) || Boolean(selectedTasks && selectedTasks.size > 0)
        const bulkRun = getBulkSelectionRun(flattenedItems, vRow.index, selectedTasks)
        const rowActions =
          !compact && !isSuggestionRow ? (
            <TaskRowActionsMenu
              projects={projectOptions}
              currentProjectId={(task as any)?.project_id_int ?? null}
              currentTitle={(task as any)?.title ?? ""}
              onRename={(title) => onRenameTask?.(task as Record<string, unknown>, title)}
              onChangeProject={(projectId) =>
                onChangeTaskProject?.(task as Record<string, unknown>, projectId)
              }
              onDelete={() => onDeleteTask?.(task as Record<string, unknown>)}
            />
          ) : null

        const renderTaskCells = (
          ordered: {
            key: string
            colId: string
            isSpacer: boolean
            isLastReal: boolean
            content: React.ReactNode
          }[],
        ) =>
          ordered.map((entry) => (
            <td
              key={entry.key}
              data-col={entry.colId}
              className={cn(
                'task-cell text-[15px] align-middle',
                !compact && !bulkRun.isBulkSelected && 'border-b border-gray-100/70',
                bulkRun.isBulkSelected && bulkRun.run !== 'end' && bulkRun.run !== 'only' && 'border-b-0',
                bulkRun.isBulkSelected &&
                  (bulkRun.run === 'end' || bulkRun.run === 'only') &&
                  'border-b border-transparent',
                entry.colId !== 'project_statuses' && 'truncate',
                entry.isSpacer && 'task-spacer-cell relative p-0 overflow-visible',
                !entry.isSpacer && entry.colId === 'title' && 'py-2 pl-0 pr-3',
                !entry.isSpacer && entry.colId !== 'title' && 'px-3 py-2',
                entry.colId === 'title' && 'task-cell--sticky overflow-visible',
              )}
            >
              {entry.isSpacer ? (
                rowActions ? (
                  <div className="pointer-events-none absolute inset-y-0 right-0 z-20 flex items-center pr-1">
                    <div className="pointer-events-auto">{rowActions}</div>
                  </div>
                ) : null
              ) : entry.colId === 'title' ? (
                renderFirstTaskCellContent({
                  task: task as Record<string, unknown>,
                  groupKey: item.groupKey,
                  showOutsideControls: true,
                  isChecked,
                  showCheckbox: showOutsideCheckbox,
                  forceShowControls,
                  onToggleChecked: () => onTaskToggle?.(taskNumericId),
                  children: entry.content,
                })
              ) : (
                entry.content
              )}
            </td>
          ))

        const isOpenSelected =
          !!(
            selectedTaskId &&
            selectedEntityType === String((task as any).entity_type) &&
            String(selectedTaskId) === String((task as any).entity_id)
          ) && !bulkRun.isBulkSelected

        if (!tableRow) {
          return (
            <DraggableTaskRow
              key={key}
              measureRef={rowVirtualizer.measureElement}
              dataIndex={vRow.index}
              dataRowType="task"
              onClick={handleTaskRowClick}
              insertDropEdges={insertDropEdges}
              rowProps={{
                'data-bulk-selected': bulkRun.isBulkSelected ? 'true' : undefined,
                'data-bulk-run': bulkRun.run ?? undefined,
              } as React.HTMLAttributes<HTMLTableRowElement>}
              className={cn(
                'task-row hover:bg-gray-50/60 cursor-pointer',
                !compact && !bulkRun.isBulkSelected && 'border-b border-gray-100/70',
                isOpenSelected && 'bg-gray-100',
              )}
              style={{ gridTemplateColumns }}
            >
              {(() => {
                const realCols = (columns as any[]).filter(c => (c.id ?? c.accessorKey) !== '__spacer')
                const spacerCols = (columns as any[]).filter(c => (c.id ?? c.accessorKey) === '__spacer')
                const orderedCols = [...realCols, ...spacerCols]
                return renderTaskCells(
                  orderedCols.map((col, colIndex) => {
                    const colId = String(col.id ?? col.accessorKey ?? colIndex)
                    const isSpacer = colId === '__spacer'
                    return {
                      key: colId,
                      colId,
                      isSpacer,
                      isLastReal: !isSpacer && colIndex === realCols.length - 1,
                      content: flexRender(col.cell || col.accessorKey, {
                        getValue: () => (task as any)[col.accessorKey],
                        row: { original: task },
                        column: col,
                      }),
                    }
                  }),
                )
              })()}
            </DraggableTaskRow>
          )
        }

        return (
          <DraggableTaskRow
            key={key}
            measureRef={rowVirtualizer.measureElement}
            dataIndex={vRow.index}
            dataRowType="task"
            onClick={handleTaskRowClick}
            insertDropEdges={insertDropEdges}
            rowProps={{
              'data-bulk-selected': bulkRun.isBulkSelected ? 'true' : undefined,
              'data-bulk-run': bulkRun.run ?? undefined,
            } as React.HTMLAttributes<HTMLTableRowElement>}
            className={cn(
              'task-row hover:bg-gray-50/60 cursor-pointer',
              !compact && !bulkRun.isBulkSelected && 'border-b border-gray-100/70',
              isOpenSelected && 'bg-gray-100',
            )}
            style={{ gridTemplateColumns }}
          >
            {(() => {
              const cells = tableRow.getVisibleCells()
              const realCells = cells.filter(c => c.column.id !== '__spacer')
              const spacerCells = cells.filter(c => c.column.id === '__spacer')
              const orderedCells = [...realCells, ...spacerCells]
              return renderTaskCells(
                orderedCells.map((cell, cellIdx) => {
                  const isSpacer = cell.column.id === '__spacer'
                  return {
                    key: cell.id,
                    colId: cell.column.id,
                    isSpacer,
                    isLastReal: !isSpacer && cellIdx === realCells.length - 1,
                    content: flexRender(cell.column.columnDef.cell, cell.getContext()),
                  }
                }),
              )
            })()}
          </DraggableTaskRow>
        )
      })}

      {paddingBottom > 0 && (
        <tr aria-hidden="true" data-row-type="padding" className="task-row" style={{ gridTemplateColumns }}>
          <td colSpan={columns.length} className="task-cell-span-full" style={{ height: paddingBottom, padding: 0 }} />
        </tr>
      )}

      {/* For initial load or refetches caused by sort/search/group changes */}
      {((plannerVisibility.showTasks && (groupMetaQuery.isFetching || groupMetaQuery.isBootstrapping)) ||
        (plannerVisibility.showSuggestions && suggestionsQuery.isFetching)) &&
        !hasTasks && (
        <tr data-row-type="loading" className="task-row" style={{ gridTemplateColumns }}>
          <td colSpan={columns.length} className="task-cell task-cell-span-full text-center text-gray-400 py-4">
            {plannerVisibility.showTasks && plannerVisibility.showSuggestions
              ? 'Loading tasks and suggestions...'
              : plannerVisibility.showSuggestions
                ? 'Loading suggestions...'
                : 'Loading tasks...'}
          </td>
        </tr>
        )}
    </>
    </TaskGroupDragDropProvider>
  )
}
