import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useTaskRealtime } from '../../../hooks/use-task-realtime'
import { getTasksForCalendarMonthChunk, updateTaskDate } from '../../../lib/services/tasks'
import type { Task } from '../../lib/types/tasks'
import { readCalendarOptions, writeParam } from '../../lib/utils'
import { cn } from '@/lib/utils'
import { useTaskSuggestionsQuery } from '../../hooks/use-task-suggestions-query'
import { usePlannerOptimisticTasks } from '../../store/planner-optimistic-tasks'
import { useTasksUI } from '../../store/tasks-ui'
import { useTasksScope } from '../../contexts/tasks-scope-context'
import { useTypesenseInfiniteQuery } from '../../hooks/use-typesense-infinite-query'
import { getTypesenseUpdater } from '../../store/typesense-tasks'
import { toast } from '../ui/use-toast'
import { updateTaskInCaches } from '../tasks/task-cache-utils'
import { VirtualizedWeekGridCalendar, type VirtualizedWeekGridCalendarRef } from './VirtualizedWeekGridCalendar'
import { toLocalDayKey } from './calendarDates'
import { useTasksToolbarFitForPane } from '@/contexts/tasks-toolbar-fit-context'
import { shallowReplaceSearchParams } from '../../lib/tasks-shallow-nav'

type CalendarTask = Task & {
  kind?: 'task' | 'suggestion'
  entity_type?: 'task' | 'suggestion'
  entity_id?: string | number
}

interface CalendarViewProps {
  onTaskClick?: (task: Task) => void
  searchValue?: string
  onSearchChange?: (value: string) => void
  selectedTaskId?: string | number | null
  selectedTask?: Task | null
  expandButton?: ReactNode
  onOptimisticUpdate?: (task: any) => void
  enabled?: boolean
  /** When true, do not render the toolbar row; use toolbarContainerRef to portal it instead */
  hideToolbar?: boolean
  /** When hideToolbar is true, portal the toolbar content into this container */
  toolbarContainerRef?: React.RefObject<HTMLDivElement | null>
  /** When true (e.g. embedded in unified toolbar), hide the "View: calendar/kanban" toggle to avoid duplicate view control */
  hideViewToggle?: boolean
  /** Embedded toolbar density. */
  toolbarMode?: 'full' | 'today-only'
  /** @deprecated Overflow menu is registered via registerPaneOverflowMenu for correct DropdownMenu context. */
  overflowToolbarContainerRef?: React.RefObject<HTMLDivElement | null>
  /** @deprecated */
  overflowToolbarSlotVersion?: number
  /** Tasks split layout: stable key matching TasksPaneToolbar `paneFitKey`. */
  toolbarPaneKey?: string
  /** When embedded in TasksPaneToolbar, supplies "…" menu content (must render under that DropdownMenu). */
  registerPaneOverflowMenu?: (fn: (() => React.ReactNode) | null) => void
  /** Tasks toolbar: optional pills (date, subtasks, color, legend) portaled here when placement is inline. */
  inlineOptionalToolbarRef?: React.RefObject<HTMLDivElement | null>
  inlineOptionalToolbarSlotVersion?: number
  /** When `inline`, optional pills go to inlineOptionalToolbarRef; when `overflow`, they stack under nav/zoom in the overflow menu. */
  tasksToolbarOptionalPlacement?: 'inline' | 'overflow'
  isMultiselectMode?: boolean
  bulkSelectedTaskIds?: ReadonlySet<number>
  onCalendarBulkTaskToggle?: (taskId: number) => void
}

const COLLAPSED_LIMIT = 3
const DEBUG_CALENDAR = process.env.NODE_ENV === 'development'

function parseListColorByParam(raw: string | null): 'contentType' | 'assignedTo' | 'project' | 'status' {
  if (raw === 'contentType' || raw === 'assignedTo' || raw === 'project' || raw === 'status') return raw
  return 'contentType'
}

function getMonthKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function getMonthStartFromKey(chunkKey: string): Date {
  const [yRaw, mRaw] = chunkKey.split('-')
  const y = Number.parseInt(yRaw ?? '', 10)
  const m = Number.parseInt(mRaw ?? '', 10)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return new Date()
  return new Date(y, m - 1, 1)
}

export function CalendarView({
  onTaskClick,
  searchValue = '',
  onSearchChange,
  selectedTaskId,
  selectedTask,
  expandButton,
  onOptimisticUpdate,
  enabled = true,
  hideToolbar = false,
  toolbarContainerRef,
  hideViewToggle = false,
  toolbarMode = 'full',
  overflowToolbarContainerRef,
  overflowToolbarSlotVersion = 0,
  toolbarPaneKey = '__calendar_standalone__',
  registerPaneOverflowMenu,
  inlineOptionalToolbarRef,
  inlineOptionalToolbarSlotVersion = 0,
  tasksToolbarOptionalPlacement = 'overflow',
  isMultiselectMode = false,
  bulkSelectedTaskIds,
  onCalendarBulkTaskToggle,
}: CalendarViewProps) {
  void onSearchChange
  void overflowToolbarContainerRef
  void overflowToolbarSlotVersion
  void tasksToolbarOptionalPlacement

  const pathname = usePathname()
  const params = useSearchParams()
  const queryClient = useQueryClient()
  const plannerVisibility = useTasksUI((s) => s.plannerVisibility)
  const virtualCalendarRef = useRef<VirtualizedWeekGridCalendarRef | null>(null)

  const [visibleMonth, setVisibleMonth] = useState<Date>(() => new Date())
  const [expandedWeekLimit, setExpandedWeekLimit] = useState<Record<string, number>>({})
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const [dateFieldOpen, setDateFieldOpen] = useState(false)
  const [isCalendarHovered, setIsCalendarHovered] = useState(false)
  const [viewMode, setViewMode] = useState<'month' | 'week'>(
    params.get('calendar_mode') === 'week' ? 'week' : 'month',
  )
  const [colorMode, setColorModeState] = useState<'contentType' | 'assignedTo' | 'project' | 'status'>(() =>
    parseListColorByParam(params.get('list_color_by')),
  )

  useEffect(() => {
    setColorModeState(parseListColorByParam(params.get('list_color_by')))
  }, [params.get('list_color_by')])

  const setColorMode = useCallback(
    (mode: 'contentType' | 'assignedTo' | 'project' | 'status') => {
      setColorModeState(mode)
      const next = new URLSearchParams(params.toString())
      next.set('list_color_by', mode)
      shallowReplaceSearchParams(pathname, next)
    },
    [params, pathname],
  )
  const visibleMonthKey = `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, '0')}`
  const visibleMonthKeyRef = useRef(visibleMonthKey)
  useEffect(() => {
    visibleMonthKeyRef.current = visibleMonthKey
  }, [visibleMonthKey])
  const visibleDayKeyRef = useRef(toLocalDayKey(visibleMonth) ?? '')
  useEffect(() => {
    visibleDayKeyRef.current = toLocalDayKey(visibleMonth) ?? ''
  }, [visibleMonth])
  const lastSelectionSyncRef = useRef<string | null>(null)

  const calendarOptions = readCalendarOptions(new URLSearchParams(params.toString()))
  const dateField = calendarOptions.dateField === 'delivery' ? 'delivery_date' : 'publication_date'
  const showSubtasks = calendarOptions.showSubtasks
  const selectedEntityType = params.get('itemKind') === 'suggestion' ? 'suggestion' : 'task'
  const middleView = params.get('middleView') === 'kanban' ? 'kanban' : 'calendar'

  useTaskRealtime({
    enabled: true,
    showNotifications: false,
  })

  const { scope } = useTasksScope()
  const filterValues = useMemo(() => {
    const parseDate = (val?: string | null) => (val ? val : '')
    const projectFromParams = params.get('project')?.split(',').filter(Boolean) ?? []
    const projectList = scope.type === 'project' ? [String(scope.projectId)] : projectFromParams
    const assignedFromParams = params.get('assignedTo')?.split(',').filter(Boolean) ?? []
    const assignedList =
      scope.type === 'user' ? [String(scope.userId)] : assignedFromParams
    const out = {
      assignedTo: assignedList,
      status: params.get('status')?.split(',').filter(Boolean) ?? [],
      deliveryDate: {
        from: parseDate(params.get('deliveryDateFrom')),
        to: parseDate(params.get('deliveryDateTo')),
      },
      publicationDate: {
        from: parseDate(params.get('publicationDateFrom')),
        to: parseDate(params.get('publicationDateTo')),
      },
      project: projectList,
      contentType: params.get('contentType')?.split(',').filter(Boolean) ?? [],
      productionType: params.get('productionType')?.split(',').filter(Boolean) ?? [],
      language: params.get('language')?.split(',').filter(Boolean) ?? [],
    } as any
    if (!showSubtasks) out.parentTaskNull = true
    return out
  }, [
    params,
    showSubtasks,
    scope.type,
    scope.type === 'project' ? scope.projectId : null,
    scope.type === 'user' ? scope.userId : null,
  ])
  const filterKey = useMemo(() => JSON.stringify(filterValues), [filterValues])

  const calendarChunkKeys = useMemo(() => {
    const current = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1, 12, 0, 0, 0)
    // Wider month buffer avoids card pop-out while adjacent month cells are still visible.
    return Array.from({ length: 7 }, (_, i) => i - 3).map((delta) =>
      getMonthKey(new Date(current.getFullYear(), current.getMonth() + delta, 1)),
    )
  }, [visibleMonth])

  const calendarChunkQueries = useQueries({
    queries: calendarChunkKeys.map((chunkKey) => ({
      queryKey: ['tasks', 'calendar-chunk', dateField, chunkKey, filterKey, searchValue],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getTasksForCalendarMonthChunk(chunkKey, dateField, filterValues, searchValue, signal),
      enabled,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
  })

  const monthRange = useMemo(() => {
    const first = calendarChunkKeys[0] ?? getMonthKey(visibleMonth)
    const last = calendarChunkKeys[calendarChunkKeys.length - 1] ?? first
    const from = getMonthStartFromKey(first)
    const to = new Date(getMonthStartFromKey(last))
    to.setMonth(to.getMonth() + 1)
    to.setDate(0)
    to.setHours(23, 59, 59, 999)
    return { from, to }
  }, [calendarChunkKeys, visibleMonth])

  const projectIdsForSuggestions = useMemo(() => {
    const parsed = (filterValues?.project ?? [])
      .map((v: any) => Number.parseInt(String(v), 10))
      .filter((n: number) => Number.isFinite(n))
    if (parsed.length > 0) return parsed
    const param = params.get('projectId')
    if (!param) return null
    const n = Number.parseInt(param, 10)
    return Number.isFinite(n) ? [n] : null
  }, [filterValues?.project, params.toString(), filterKey])

  const suggestionsQuery = useTaskSuggestionsQuery({
    projectIds: projectIdsForSuggestions,
    from: monthRange.from,
    to: monthRange.to,
    enabled: enabled && plannerVisibility.showSuggestions,
    cacheKeyParts: ['calendar', dateField],
  })

  const optimisticPlannerTasksByKey = usePlannerOptimisticTasks((s) => s.byKey)
  const optimisticPlannerTasks = useMemo(
    () =>
      Object.values(optimisticPlannerTasksByKey).map((task: any) => ({
        ...task,
        id: String(task.id),
        entity_id: task.entity_id ?? task.id,
        entity_type: task.entity_type ?? 'task',
        kind: task.kind ?? 'task',
      })) as CalendarTask[],
    [optimisticPlannerTasksByKey],
  )

  const queryTasks = useMemo(() => {
    const byId = new Map<string, CalendarTask>()
    for (const q of calendarChunkQueries) {
      const rows = Array.isArray(q.data) ? q.data : []
      for (const row of rows) byId.set(String(row.id), row as CalendarTask)
    }
    return Array.from(byId.values())
  }, [calendarChunkQueries])

  const suggestionTasks: CalendarTask[] = useMemo(
    () =>
      (suggestionsQuery.data ?? []).map((s: any) => ({
        id: String(s.entity_id ?? s.id),
        entity_id: Number(s.entity_id ?? s.id),
        entity_type: 'suggestion',
        kind: 'suggestion',
        title: s.title ?? s.proposed_title ?? s.ai_title ?? 'Untitled suggestion',
        briefing: s.briefing ?? s.proposed_briefing ?? s.ai_briefing ?? null,
        delivery_date: s.delivery_date ?? s.planned_for_date ?? undefined,
        publication_date: s.publication_date ?? s.planned_for_date ?? undefined,
        project_id_int: s.project_id_int ?? s.project_id ?? null,
        parent_task_id_int: null,
        projects: null,
        project_statuses: null,
      })),
    [suggestionsQuery.data],
  )

  const mergedTasks = useMemo(() => {
    const source = [
      ...(plannerVisibility.showTasks ? optimisticPlannerTasks : []),
      ...(plannerVisibility.showTasks ? queryTasks : []),
      ...(plannerVisibility.showSuggestions ? suggestionTasks : []),
    ]
    const seen = new Set<string>()
    const out: CalendarTask[] = []
    for (const task of source) {
      const type = String(task.entity_type ?? (task.kind === 'suggestion' ? 'suggestion' : 'task'))
      const id = String(task.entity_id ?? task.id)
      const key = `${type}:${id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(task)
    }
    return out
  }, [plannerVisibility.showTasks, plannerVisibility.showSuggestions, optimisticPlannerTasks, queryTasks, suggestionTasks])

  const filteredTasks = useMemo(
    () => mergedTasks.filter((task) => showSubtasks || !(task as any).parent_task_id_int),
    [mergedTasks, showSubtasks],
  )

  if (process.env.NODE_ENV === 'development') {
    ;(window as any).__calendarDataDebug = {
      queryTaskCount: queryTasks.length,
      suggestionCount: suggestionTasks.length,
      optimisticCount: optimisticPlannerTasks.length,
      mergedCount: mergedTasks.length,
      filteredCount: filteredTasks.length,
      dateField,
      visibleMonth: `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, '0')}`,
      chunkKeys: calendarChunkKeys,
      queryStates: calendarChunkQueries.map((q, i) => ({
        idx: i,
        status: q.status,
        isFetching: q.isFetching,
        hasData: Array.isArray(q.data) ? q.data.length : 0,
      })),
    }
  }

  useEffect(() => {
    if (!DEBUG_CALENDAR) return
    console.log('[CalendarDebug][DataPipeline]', {
      visibleMonthKey,
      dateField,
      showSubtasks,
      queryTaskCount: queryTasks.length,
      suggestionCount: suggestionTasks.length,
      optimisticCount: optimisticPlannerTasks.length,
      mergedCount: mergedTasks.length,
      filteredCount: filteredTasks.length,
      chunkKeys: calendarChunkKeys,
      queryStates: calendarChunkQueries.map((q, i) => ({
        idx: i,
        status: q.status,
        isFetching: q.isFetching,
        hasData: Array.isArray(q.data) ? q.data.length : 0,
      })),
    })
  }, [
    calendarChunkKeys,
    calendarChunkQueries,
    dateField,
    filteredTasks.length,
    mergedTasks.length,
    optimisticPlannerTasks.length,
    queryTasks.length,
    showSubtasks,
    suggestionTasks.length,
    visibleMonthKey,
  ])

  const handleVisibleMonthChange = useCallback((nextMonth: Date) => {
    const nextKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`
    const nextDayKey = toLocalDayKey(nextMonth) ?? ''
    // Month mode tracks by month key; week mode must allow day-by-day changes.
    if (viewMode === 'month') {
      if (nextKey === visibleMonthKeyRef.current) return
    } else if (nextDayKey === visibleDayKeyRef.current) {
      return
    }
    if (DEBUG_CALENDAR) {
      console.log('[CalendarDebug][MonthChange]', {
        from: visibleMonthKeyRef.current,
        to: nextKey,
        viewMode,
        fromDay: visibleDayKeyRef.current,
        toDay: nextDayKey,
      })
    }
    setVisibleMonth(nextMonth)
  }, [viewMode])

  const typesenseQuery = useTypesenseInfiniteQuery({ q: '', pageSize: 25, enabled: false })

  const getColorKey = useCallback(
    (task: CalendarTask) => {
      if (colorMode === 'assignedTo') return String(task.users?.full_name || task.assigned_to_id || 'unassigned')
      if (colorMode === 'project') return String(task.projects?.name || task.project_id_int || 'no-project')
      if (colorMode === 'status') return String(task.project_status_name || 'no-status')
      return String(task.content_types?.[0]?.title || task.content_type_id || 'no-content-type')
    },
    [colorMode],
  )

  const palette = useMemo(
    () => [
      'bg-blue-200 text-blue-900',
      'bg-green-200 text-green-900',
      'bg-pink-200 text-pink-900',
      'bg-yellow-200 text-yellow-900',
      'bg-purple-200 text-purple-900',
      'bg-orange-200 text-orange-900',
      'bg-teal-200 text-teal-900',
      'bg-red-200 text-red-900',
      'bg-cyan-200 text-cyan-900',
      'bg-lime-200 text-lime-900',
    ],
    [],
  )

  const getColorClass = useCallback(
    (task: CalendarTask) => {
      const key = getColorKey(task)
      let hash = 0
      for (let i = 0; i < key.length; i += 1) hash = (hash << 5) - hash + key.charCodeAt(i)
      return palette[Math.abs(hash) % palette.length] || 'bg-gray-100 text-gray-900'
    },
    [getColorKey, palette],
  )

  const getInlineStyle = useCallback(
    (task: CalendarTask): React.CSSProperties | undefined => {
      if (colorMode === 'status' && task.project_statuses?.color) {
        return { background: task.project_statuses.color, color: '#222' }
      }
      if (colorMode === 'project' && task.projects?.color) {
        return { background: task.projects.color, color: '#222' }
      }
      return undefined
    },
    [colorMode],
  )

  const handleExpandWeek = useCallback((weekKey: string, desiredLimit: number) => {
    setExpandedWeekLimit((prev) => ({ ...prev, [weekKey]: Math.max(prev[weekKey] ?? COLLAPSED_LIMIT, desiredLimit) }))
  }, [])

  const handleCollapseWeek = useCallback((weekKey: string) => {
    setExpandedWeekLimit((prev) => {
      const next = { ...prev }
      delete next[weekKey]
      return next
    })
  }, [])

  const handleTaskDrop = useCallback(
    async (task: CalendarTask, dayKey: string) => {
      if (task.kind === 'suggestion' || String(task.entity_type ?? '') === 'suggestion') return
      const taskId = Number.parseInt(String(task.id), 10)
      if (!Number.isFinite(taskId)) return
      const prevDate = toLocalDayKey(task[dateField] as any)
      if (prevDate === dayKey) return

      const optimistic = { ...task, [dateField]: dayKey }
      updateTaskInCaches(queryClient, optimistic)
      getTypesenseUpdater()?.(optimistic)
      typesenseQuery.updateTaskInList(optimistic)
      onOptimisticUpdate?.(optimistic)

      try {
        await updateTaskDate(taskId, dateField, dayKey)
      } catch (error: any) {
        updateTaskInCaches(queryClient, task)
        toast({
          title: 'Failed to update task date',
          description: error?.message ?? 'Please try again.',
          variant: 'destructive',
        })
      }
    },
    [dateField, onOptimisticUpdate, queryClient, typesenseQuery],
  )

  const monthLabel = visibleMonth
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    .replace(',', '')
    .toLowerCase()
  const isLoading = enabled && calendarChunkQueries.some((q) => q.isLoading)
  const colorModeLabel =
    colorMode === 'contentType'
      ? 'Content Type'
      : colorMode === 'assignedTo'
        ? 'Assigned To'
        : colorMode === 'project'
          ? 'Project'
          : 'Status'
  const colorLegendEntries = useMemo(() => {
    const seen = new Set<string>()
    const out: { key: string; label: string; colorClass: string }[] = []
    const getLabel = (task: CalendarTask) => {
      if (colorMode === 'assignedTo') return String(task.users?.full_name || 'Unassigned')
      if (colorMode === 'project') return String(task.projects?.name || 'No project')
      if (colorMode === 'status') return String(task.project_status_name || 'No status')
      return String(task.content_types?.[0]?.title || task.content_type_id || 'No content type')
    }
    for (const task of filteredTasks) {
      const key = getColorKey(task)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ key, label: getLabel(task), colorClass: getColorClass(task) })
    }
    out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    return out.slice(0, 24)
  }, [colorMode, filteredTasks, getColorClass, getColorKey])
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString('default', { month: 'long' })),
    [],
  )
  const years = useMemo(() => Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i), [])

  const setCalendarMode = useCallback(
    (nextMode: 'month' | 'week') => {
      if (nextMode === viewMode) return
      setViewMode(nextMode)
      const next = writeParam(new URLSearchParams(params.toString()), 'calendar_mode', nextMode)
      shallowReplaceSearchParams(pathname, next)
    },
    [params, pathname, viewMode],
  )

  useEffect(() => {
    if (!selectedTask || selectedTaskId == null) return
    const dayKey = toLocalDayKey(selectedTask[dateField] as any)
    if (!dayKey) return
    const syncKey = `${String(selectedTaskId)}|${dateField}|${dayKey}`
    if (lastSelectionSyncRef.current === syncKey) return
    lastSelectionSyncRef.current = syncKey
    const d = new Date(dayKey)
    if (!Number.isNaN(d.getTime())) {
      virtualCalendarRef.current?.scrollToMonth(new Date(d.getFullYear(), d.getMonth(), 1))
    }
  }, [selectedTask, selectedTaskId, dateField])

  const pillButton =
    'inline-flex h-8 items-center gap-1 px-4 py-1 rounded-full border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition shadow-none focus:ring-2 focus:ring-blue-200 focus:outline-none'

  /** Prev / month / next / Today — keep Date & other pills adjacent with uniform gap-2 (Zoom follows optional row). */
  const calendarMonthNavCluster = (
    <div className="inline-flex items-center rounded-full border border-gray-200 overflow-hidden shrink-0">
      <button
        className="inline-flex h-8 items-center px-2 text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-200 focus:outline-none border-r border-gray-200"
        type="button"
        onClick={() =>
          viewMode === 'week'
            ? virtualCalendarRef.current?.scrollByDays(-1)
            : virtualCalendarRef.current?.scrollByWeeks(-4)
        }
        aria-label="Previous period"
      >
        <ChevronLeft size={16} />
      </button>
      <DropdownMenu open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className="inline-flex h-8 w-[9rem] items-center justify-center gap-1 px-3 text-sm font-medium tabular-nums text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-200 focus:outline-none"
            type="button"
          >
            {monthLabel} <ChevronDown size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="p-0 min-w-[180px]">
          <div className="flex">
            <div className="flex flex-col max-h-60 overflow-y-auto">
              {months.map((month, i) => (
                <DropdownMenuItem
                  key={month}
                  className={
                    visibleMonth.getMonth() === i ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-50'
                  }
                  onClick={() => {
                    virtualCalendarRef.current?.scrollToMonth(new Date(visibleMonth.getFullYear(), i, 1))
                    setMonthPickerOpen(false)
                  }}
                >
                  {month}
                </DropdownMenuItem>
              ))}
            </div>
            <div className="flex flex-col max-h-60 overflow-y-auto border-l border-gray-100">
              {years.map((year) => (
                <DropdownMenuItem
                  key={year}
                  className={
                    visibleMonth.getFullYear() === year ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-50'
                  }
                  onClick={() => {
                    virtualCalendarRef.current?.scrollToMonth(new Date(year, visibleMonth.getMonth(), 1))
                    setMonthPickerOpen(false)
                  }}
                >
                  {year}
                </DropdownMenuItem>
              ))}
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        className="inline-flex h-8 items-center px-2 text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-200 focus:outline-none border-l border-gray-200"
        type="button"
        onClick={() =>
          viewMode === 'week'
            ? virtualCalendarRef.current?.scrollByDays(1)
            : virtualCalendarRef.current?.scrollByWeeks(4)
        }
        aria-label="Next period"
      >
        <ChevronRight size={16} />
      </button>
      <button
        type="button"
        className="inline-flex h-8 items-center px-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-200 focus:outline-none border-l border-gray-200"
        onClick={() => virtualCalendarRef.current?.scrollToToday()}
      >
        Today
      </button>
    </div>
  )

  const calendarZoomMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={`${pillButton} min-w-[9rem]`} type="button">
          Zoom: {viewMode === 'week' ? 'Week' : 'Month'} <ChevronDown size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        <DropdownMenuItem onClick={() => setCalendarMode('month')}>Month</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setCalendarMode('week')}>Week</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const dateBtn = `${pillButton} min-w-[140px]`
  const colorBtn = `${pillButton} min-w-[11rem] shrink-0 whitespace-nowrap`
  const legendBtn = `${pillButton} shrink-0 whitespace-nowrap`
  const subBtn = pillButton + (showSubtasks ? ' bg-blue-600 text-white border-blue-600' : '')

  const calendarOptionalToolbarRow = useMemo(
    () => [
      <DropdownMenu open={dateFieldOpen} onOpenChange={setDateFieldOpen} key="cal-date">
        <DropdownMenuTrigger asChild>
          <button className={dateBtn} type="button">
            Date: {dateField === 'delivery_date' ? 'Delivery' : 'Publication'} <ChevronDown size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={() => {
              const next = writeParam(new URLSearchParams(params.toString()), 'calendar_date_field', 'delivery')
              shallowReplaceSearchParams(pathname, next)
              setDateFieldOpen(false)
            }}
          >
            Delivery Date
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              const next = writeParam(new URLSearchParams(params.toString()), 'calendar_date_field', 'publication')
              shallowReplaceSearchParams(pathname, next)
              setDateFieldOpen(false)
            }}
          >
            Publication Date
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,

      <button
        key="cal-subtasks"
        type="button"
        className={subBtn}
        onClick={() => {
          const next = writeParam(new URLSearchParams(params.toString()), 'calendar_show_subtasks', !showSubtasks)
          shallowReplaceSearchParams(pathname, next)
        }}
      >
        Subtasks: {showSubtasks ? 'On' : 'Off'}
      </button>,

      <DropdownMenu key="cal-color">
        <DropdownMenuTrigger asChild>
          <button className={colorBtn} type="button">
            Color: {colorModeLabel} <ChevronDown size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[200px]">
          <div className="px-2 py-1.5 text-[11px] text-gray-500 border-b border-gray-100">Color by</div>
          <DropdownMenuItem onClick={() => setColorMode('contentType')}>Content Type</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setColorMode('assignedTo')}>Assigned To</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setColorMode('project')}>Project</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setColorMode('status')}>Status</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,

      <DropdownMenu key="cal-legend">
        <DropdownMenuTrigger asChild>
          <button className={legendBtn} type="button">
            Legend <ChevronDown size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[240px] max-h-[min(60vh,420px)] overflow-y-auto">
          <div className="px-2 py-1.5 text-[11px] text-gray-500 border-b border-gray-100">Legend: {colorModeLabel}</div>
          {colorLegendEntries.length === 0 ? (
            <div className="px-2 py-3 text-sm text-gray-400">No items yet</div>
          ) : (
            <div className="py-1">
              {colorLegendEntries.map(({ key, label, colorClass }) => (
                <div key={key} className="flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-gray-50">
                  <span className="truncate text-sm">{label}</span>
                  <span className={`inline-block h-3 w-3 shrink-0 rounded-sm ${colorClass}`} aria-hidden />
                </div>
              ))}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>,
    ],
    [
      colorLegendEntries,
      colorModeLabel,
      dateField,
      dateFieldOpen,
      showSubtasks,
      pillButton,
      params,
      pathname,
    ],
  )

  const toolbarFit = useTasksToolbarFitForPane(toolbarPaneKey)
  const calendarInlineVisible = Math.min(toolbarFit.calendarInlineCount, calendarOptionalToolbarRow.length)

  const headerBar = (
    <div
      className={cn(
        'flex h-14 min-h-14 shrink-0 flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap border-b border-transparent bg-transparent px-0 py-0 sticky top-0 z-10 max-w-full',
        hideToolbar ? 'w-auto min-w-0' : 'w-full',
      )}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {!hideViewToggle && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`${pillButton} min-w-[11rem] shrink-0`} type="button">
              View: {middleView} <ChevronDown size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => {
                const next = writeParam(new URLSearchParams(params.toString()), 'middleView', 'calendar')
                shallowReplaceSearchParams(pathname, next)
              }}
            >
              calendar
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const next = writeParam(new URLSearchParams(params.toString()), 'middleView', 'kanban')
                shallowReplaceSearchParams(pathname, next)
              }}
            >
              kanban
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {toolbarMode === 'full' && (
        <div className="flex shrink-0 flex-nowrap items-center gap-2">
          {calendarMonthNavCluster}
          {calendarOptionalToolbarRow}
          {calendarZoomMenu}
        </div>
      )}
      {toolbarMode !== 'full' && (
        <button
          type="button"
          className={cn(pillButton, 'shrink-0')}
          onClick={() => virtualCalendarRef.current?.scrollToToday()}
        >
          Today
        </button>
      )}

      {!hideToolbar && <div className="min-w-0 flex-1" />}
      {expandButton}
    </div>
  )

  const toolbarPortaled = hideToolbar && toolbarContainerRef?.current
    ? createPortal(headerBar, toolbarContainerRef.current)
    : null

  const calendarOverflowMenuSubs = useMemo(
    () => (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2">
          Navigate
          <ChevronRight className="ml-auto h-4 w-4 shrink-0 opacity-60" />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-[min(70vh,420px)] overflow-y-auto">
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              if (viewMode === 'week') virtualCalendarRef.current?.scrollByDays(-1)
              else virtualCalendarRef.current?.scrollByWeeks(-4)
            }}
          >
            Previous {viewMode === 'week' ? 'week' : 'period'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              if (viewMode === 'week') virtualCalendarRef.current?.scrollByDays(1)
              else virtualCalendarRef.current?.scrollByWeeks(4)
            }}
          >
            Next {viewMode === 'week' ? 'week' : 'period'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              virtualCalendarRef.current?.scrollToToday()
            }}
          >
            Jump to today
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              Month
              <ChevronRight className="ml-auto h-4 w-4 shrink-0 opacity-60" />
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-60 overflow-y-auto">
              {months.map((month, i) => (
                <DropdownMenuItem
                  key={month}
                  onSelect={(e) => {
                    e.preventDefault()
                    virtualCalendarRef.current?.scrollToMonth(new Date(visibleMonth.getFullYear(), i, 1))
                  }}
                >
                  {month}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              Year
              <ChevronRight className="ml-auto h-4 w-4 shrink-0 opacity-60" />
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-60 overflow-y-auto">
              {years.map((year) => (
                <DropdownMenuItem
                  key={year}
                  onSelect={(e) => {
                    e.preventDefault()
                    virtualCalendarRef.current?.scrollToMonth(new Date(year, visibleMonth.getMonth(), 1))
                  }}
                >
                  {year}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2">
          <span className="min-w-0 truncate">Zoom</span>
          <span className="ml-auto flex max-w-[9rem] shrink-0 items-center gap-1.5">
            <span className="truncate text-right text-xs text-muted-foreground">
              {viewMode === 'week' ? 'Week' : 'Month'}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              setCalendarMode('month')
            }}
          >
            Month
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              setCalendarMode('week')
            }}
          >
            Week
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <span className="min-w-0 truncate">Date field</span>
            <span className="ml-auto flex max-w-[10rem] shrink-0 items-center gap-1.5">
              <span className="truncate text-right text-xs text-muted-foreground">
                {calendarOptions.dateField === 'delivery' ? 'Delivery' : 'Publication'}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                const next = writeParam(new URLSearchParams(params.toString()), 'calendar_date_field', 'delivery')
                shallowReplaceSearchParams(pathname, next)
              }}
            >
              Delivery date
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                const next = writeParam(new URLSearchParams(params.toString()), 'calendar_date_field', 'publication')
                shallowReplaceSearchParams(pathname, next)
              }}
            >
              Publication date
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem
          className="justify-between gap-2"
          onSelect={(e) => {
            e.preventDefault()
            const next = writeParam(new URLSearchParams(params.toString()), 'calendar_show_subtasks', !showSubtasks)
            shallowReplaceSearchParams(pathname, next)
          }}
        >
          <span className="min-w-0 truncate">Subtasks</span>
          <span className="shrink-0 pl-2 text-xs text-muted-foreground">{showSubtasks ? 'On' : 'Off'}</span>
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <span className="min-w-0 truncate">Color</span>
            <span className="ml-auto flex max-w-[10rem] shrink-0 items-center gap-1.5">
              <span className="truncate text-right text-xs text-muted-foreground">{colorModeLabel}</span>
              <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setColorMode('contentType') }}>Content type</DropdownMenuItem>
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setColorMode('assignedTo') }}>Assigned to</DropdownMenuItem>
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setColorMode('project') }}>Project</DropdownMenuItem>
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setColorMode('status') }}>Status</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            Legend
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 opacity-60" />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[240px] max-h-[min(60vh,420px)] overflow-y-auto p-1">
            <div className="px-2 py-1.5 text-[11px] text-gray-500">{colorModeLabel}</div>
            {colorLegendEntries.length === 0 ? (
              <div className="px-2 py-3 text-sm text-gray-400">No items yet</div>
            ) : (
              colorLegendEntries.map(({ key, label, colorClass }) => (
                <div key={key} className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm">
                  <span className="truncate">{label}</span>
                  <span className={`inline-block h-3 w-3 shrink-0 rounded-sm ${colorClass}`} aria-hidden />
                </div>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </>
    </>
    ),
    [
      viewMode,
      visibleMonth,
      months,
      years,
      showSubtasks,
      colorModeLabel,
      colorLegendEntries,
      colorMode,
      params,
      pathname,
      setCalendarMode,
      calendarOptions.dateField,
    ],
  )

  const calendarOverflowMenuSubsRef = useRef(calendarOverflowMenuSubs)
  calendarOverflowMenuSubsRef.current = calendarOverflowMenuSubs
  const calendarOverflowRenderStableRef = useRef<(() => ReactNode) | null>(null)
  if (calendarOverflowRenderStableRef.current == null) {
    calendarOverflowRenderStableRef.current = () => calendarOverflowMenuSubsRef.current
  }

  useLayoutEffect(() => {
    if (!hideToolbar || !registerPaneOverflowMenu) return
    registerPaneOverflowMenu(calendarOverflowRenderStableRef.current!)
    return () => registerPaneOverflowMenu(null)
  }, [hideToolbar, registerPaneOverflowMenu])

  const inlineOptionalEl = inlineOptionalToolbarRef?.current ?? null
  const inlineOptionalPortaled =
    hideToolbar &&
    inlineOptionalEl &&
    createPortal(
      <div
        key={inlineOptionalToolbarSlotVersion}
        className="flex shrink-0 flex-nowrap items-center gap-2"
      >
        {calendarOptionalToolbarRow.slice(0, calendarInlineVisible)}
      </div>,
      inlineOptionalEl,
    )

  const hoverControlPill =
    'inline-flex h-8 items-center gap-1 rounded-full border border-gray-200/90 bg-white/95 px-3.5 text-xs font-medium text-gray-700 shadow-sm backdrop-blur-sm transition hover:bg-white'
  const showHoverControls = isCalendarHovered || dateFieldOpen

  return (
    <section className="w-full h-full min-h-0 flex flex-col overflow-hidden">
      {!hideToolbar && headerBar}
      {toolbarPortaled}
      {inlineOptionalPortaled}
      <div
        className="relative flex-1 min-h-0"
        onMouseEnter={() => setIsCalendarHovered(true)}
        onMouseLeave={() => {
          if (!dateFieldOpen) setIsCalendarHovered(false)
        }}
      >
        <VirtualizedWeekGridCalendar
          ref={virtualCalendarRef}
          tasks={filteredTasks}
          dateField={dateField}
          selectedTaskId={selectedTaskId}
          selectedEntityType={selectedEntityType}
          visibleMonth={visibleMonth}
          viewMode={viewMode}
          collapsedLimit={COLLAPSED_LIMIT}
          expandedWeekLimit={expandedWeekLimit}
          onExpandWeek={handleExpandWeek}
          onCollapseWeek={handleCollapseWeek}
          onVisibleMonthChange={handleVisibleMonthChange}
          onTaskClick={(task) => onTaskClick?.(task)}
          isMultiselectMode={isMultiselectMode}
          bulkSelectedTaskIds={bulkSelectedTaskIds}
          onBulkTaskToggle={onCalendarBulkTaskToggle}
          onTaskDrop={handleTaskDrop}
          getColorClass={getColorClass}
          getInlineStyle={getInlineStyle}
        />
        <div
          className={cn(
            'absolute inset-x-0 bottom-3 z-30 flex justify-center transition-opacity duration-150',
            showHoverControls ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          <div className="inline-flex items-center gap-1.5 rounded-full border border-gray-200/80 bg-white/95 p-1 shadow-md backdrop-blur-md">
            <button
              type="button"
              className={hoverControlPill}
              onClick={() => virtualCalendarRef.current?.scrollToToday()}
            >
              Today
            </button>
            <DropdownMenu
              open={dateFieldOpen}
              onOpenChange={(open) => {
                setDateFieldOpen(open)
                if (open) setIsCalendarHovered(true)
              }}
            >
              <DropdownMenuTrigger asChild>
                <button type="button" className={hoverControlPill}>
                  Date: {dateField === 'delivery_date' ? 'Delivery' : 'Publication'}
                  <ChevronDown size={14} className="opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" side="top" sideOffset={8}>
                <DropdownMenuItem
                  onClick={() => {
                    const next = writeParam(new URLSearchParams(params.toString()), 'calendar_date_field', 'delivery')
                    shallowReplaceSearchParams(pathname, next)
                    setDateFieldOpen(false)
                  }}
                >
                  Delivery Date
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    const next = writeParam(new URLSearchParams(params.toString()), 'calendar_date_field', 'publication')
                    shallowReplaceSearchParams(pathname, next)
                    setDateFieldOpen(false)
                  }}
                >
                  Publication Date
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {!isLoading && (!filteredTasks || filteredTasks.length === 0) && (
        <div className="text-center text-gray-500 py-8">No tasks for this month.</div>
      )}
    </section>
  )
}
