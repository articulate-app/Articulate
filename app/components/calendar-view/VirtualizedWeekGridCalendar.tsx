import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { DndContext, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Task } from '../../lib/types/tasks'
import { useTaskComposerStore } from '../../store/task-composer-store'
import { WeekRow } from './WeekRow'
import { DraftTaskCard } from './DraftTaskCard'
import { TaskCard } from './TaskCard'
import { cn } from '../../lib/utils'
import {
  CALENDAR_WEEKDAY_LABELS,
  addDaysLocal,
  addWeeksFromDayKey,
  formatLocalDayKey,
  getMonthLabelFromWeekStart,
  getMonthStartWeekDayKey,
  getWeekDays,
  getWeekStartDayKey,
  parseLocalDayKey,
  toLocalDayKey,
} from './calendarDates'

type CalendarTask = Task & {
  kind?: 'task' | 'suggestion'
  entity_type?: 'task' | 'suggestion'
  entity_id?: string | number
}

interface VirtualizedWeekGridCalendarProps {
  tasks: CalendarTask[]
  dateField: 'delivery_date' | 'publication_date'
  selectedTaskId?: string | number | null
  selectedEntityType: 'task' | 'suggestion'
  visibleMonth: Date
  viewMode: 'month' | 'week'
  collapsedLimit: number
  expandedWeekLimit: Record<string, number>
  onExpandWeek: (weekKey: string, desiredLimit: number) => void
  onCollapseWeek: (weekKey: string) => void
  onVisibleMonthChange: (month: Date) => void
  onTaskClick?: (task: CalendarTask) => void
  onTaskDrop: (task: CalendarTask, dayKey: string) => void
  getColorClass: (task: CalendarTask) => string
  getInlineStyle: (task: CalendarTask) => React.CSSProperties | undefined
  isMultiselectMode?: boolean
  bulkSelectedTaskIds?: ReadonlySet<number>
  onBulkTaskToggle?: (taskId: number) => void
}

export interface VirtualizedWeekGridCalendarRef {
  scrollByWeeks: (weeks: number) => void
  scrollByDays: (days: number) => void
  scrollToMonth: (month: Date) => void
  scrollToToday: () => void
}

const OVERSCAN_WEEKS = 12
const EXTEND_BY_WEEKS = 24
const EDGE_LOAD_THRESHOLD = 8
const FIXED_WEEK_HEIGHT_PX = 160
const TASK_CARD_HEIGHT_PX = 30
const DAY_HEADER_HEIGHT_PX = 34
const SHOW_MORE_HEIGHT_PX = 18
const WEEK_ROW_PADDING_PX = 12
const DEBUG_CALENDAR = process.env.NODE_ENV === 'development'
const WEEK_COLUMN_PAGE_SIZE = 30

function canScrollVert(el: HTMLElement, deltaY: number): boolean {
  if (el.scrollHeight <= el.clientHeight + 1) return false
  if (deltaY > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1
  if (deltaY < 0) return el.scrollTop > 1
  return false
}

function canScrollHoriz(el: HTMLElement, delta: number): boolean {
  if (el.scrollWidth <= el.clientWidth + 1) return false
  if (delta > 0) return el.scrollLeft + el.clientWidth < el.scrollWidth - 1
  if (delta < 0) return el.scrollLeft > 1
  return false
}

type WeekDayColumnProps = {
  dayKey: string
  tasks: CalendarTask[]
  selectedTaskId?: string | number | null
  selectedEntityType: 'task' | 'suggestion'
  onTaskClick?: (task: CalendarTask) => void
  onTaskDrop: (task: CalendarTask, dayKey: string) => void
  getColorClass: (task: CalendarTask) => string
  getInlineStyle: (task: CalendarTask) => React.CSSProperties | undefined
  inlineDraftTitle?: string | null
  onBeginInlineCreate?: (dayKey: string) => void
  isInlineCreateBlocked?: boolean
  isMultiselectMode?: boolean
  bulkSelectedTaskIds?: ReadonlySet<number>
  onBulkTaskToggle?: (taskId: number) => void
}

function WeekDayColumn({
  dayKey,
  tasks,
  selectedTaskId,
  selectedEntityType,
  onTaskClick,
  getColorClass,
  getInlineStyle,
  inlineDraftTitle,
  onBeginInlineCreate,
  isInlineCreateBlocked = false,
  isMultiselectMode = false,
  bulkSelectedTaskIds,
  onBulkTaskToggle,
}: WeekDayColumnProps) {
  const dayDate = parseLocalDayKey(dayKey)
  const dayLabel = dayDate
    ? dayDate.toLocaleDateString('default', { weekday: 'short', day: 'numeric', month: 'short' })
    : dayKey
  const [visibleCount, setVisibleCount] = useState(WEEK_COLUMN_PAGE_SIZE)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const { setNodeRef, isOver } = useDroppable({
    id: `day:${dayKey}`,
    data: { type: 'calendar-day-cell', dayKey },
  })

  useEffect(() => {
    setVisibleCount(WEEK_COLUMN_PAGE_SIZE)
  }, [dayKey, tasks.length])

  useEffect(() => {
    const rootEl = scrollRef.current
    const sentinelEl = sentinelRef.current
    if (!rootEl || !sentinelEl) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting) return
        setVisibleCount((prev) => {
          if (prev >= tasks.length) return prev
          return Math.min(tasks.length, prev + WEEK_COLUMN_PAGE_SIZE)
        })
      },
      { root: rootEl, rootMargin: '120px', threshold: 0.1 },
    )
    observer.observe(sentinelEl)
    return () => observer.disconnect()
  }, [tasks.length])

  // Initial paint: if the sentinel sits below the day column fold, IntersectionObserver may not run
  // until the user scrolls — pump visible tasks until the sentinel intersects or the full list is shown.
  useLayoutEffect(() => {
    const rootEl = scrollRef.current
    if (!rootEl || tasks.length === 0) return

    let count = WEEK_COLUMN_PAGE_SIZE
    let raf = 0

    const pump = () => {
      const sent = sentinelRef.current
      if (!sent) return
      const rootRect = rootEl.getBoundingClientRect()
      const sentRect = sent.getBoundingClientRect()
      const intersects = sentRect.top < rootRect.bottom + 8 && sentRect.bottom > rootRect.top - 8
      if (intersects || count >= tasks.length) {
        setVisibleCount((prev) => Math.max(prev, Math.min(count, tasks.length)))
        return
      }
      count = Math.min(tasks.length, count + WEEK_COLUMN_PAGE_SIZE)
      setVisibleCount(count)
      raf = requestAnimationFrame(pump)
    }

    raf = requestAnimationFrame(pump)
    return () => cancelAnimationFrame(raf)
  }, [dayKey, tasks.length])

  const visibleTasks = tasks.slice(0, visibleCount)
  const hasInlineDraft = typeof inlineDraftTitle === 'string'
  const handleDayWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      const dayEl = event.currentTarget
      const deltaX = event.deltaX
      const deltaY = event.deltaY
      const absX = Math.abs(deltaX)
      const absY = Math.abs(deltaY)
      const horizontalIntent = event.shiftKey || absX > absY
      if (horizontalIntent) {
        if (DEBUG_CALENDAR) {
          console.log('[CalendarDebug][Virtual] wheel-route', {
            route: 'bubble-horizontal',
            hoveredDayKey: dayKey,
            visibleCount,
            totalCount: tasks.length,
            deltaX,
            deltaY,
          })
        }
        return
      }

      if (canScrollVert(dayEl, deltaY)) {
        if (DEBUG_CALENDAR) {
          console.log('[CalendarDebug][Virtual] wheel-route', {
            route: 'vertical',
            hoveredDayKey: dayKey,
            visibleCount,
            totalCount: tasks.length,
            deltaX,
            deltaY,
          })
        }
        // Native vertical scroll is desired here.
        return
      }

      if (deltaY > 0 && visibleCount < tasks.length) {
        event.preventDefault()
        setVisibleCount((prev) => Math.min(tasks.length, prev + WEEK_COLUMN_PAGE_SIZE))
        requestAnimationFrame(() => {
          dayEl.scrollTop = Math.max(0, dayEl.scrollHeight - dayEl.clientHeight - 1)
        })
        if (DEBUG_CALENDAR) {
          console.log('[CalendarDebug][Virtual] wheel-route', {
            route: 'load-more',
            hoveredDayKey: dayKey,
            visibleCount,
            totalCount: tasks.length,
            deltaX,
            deltaY,
          })
        }
      }
    },
    [dayKey, tasks.length, visibleCount],
  )

  return (
    <div className="border-l border-r border-b border-gray-200 flex flex-col h-full min-h-0">
      <div className="h-10 px-2 flex items-center justify-center text-xs text-gray-600 border-b border-gray-200">
        {dayLabel}
      </div>
      <div
        ref={(el) => {
          setNodeRef(el)
          scrollRef.current = el
        }}
        data-week-day-scroll="true"
        data-day-scroll="true"
        data-day-key={dayKey}
        data-day-visible-count={visibleCount}
        data-day-total-count={tasks.length}
        className={cn('flex-1 min-h-0 overflow-y-auto overscroll-contain p-1', isOver && 'bg-blue-50')}
        onWheel={handleDayWheel}
        onClick={(event) => {
          if (isInlineCreateBlocked) return
          const target = event.target as HTMLElement
          if (target.closest('[data-task-card="true"]')) return
          if (target.closest('[data-calendar-action="true"]')) return
          if (hasInlineDraft) return
          onBeginInlineCreate?.(dayKey)
        }}
      >
        <div className="space-y-1">
          {hasInlineDraft && <DraftTaskCard title={inlineDraftTitle || 'New task'} />}
          {visibleTasks.map((task) => {
            const entityType = String(task.entity_type ?? (task.kind === 'suggestion' ? 'suggestion' : 'task'))
            const entityId = String(task.entity_id ?? task.id)
            const isSelected =
              selectedTaskId != null &&
              selectedEntityType === (entityType === 'suggestion' ? 'suggestion' : 'task') &&
              String(selectedTaskId) === entityId
            const isSuggestion =
              entityType === 'suggestion' || task.kind === 'suggestion'
            const numericId = Number(task.id)
            const isBulkSelected =
              Boolean(isMultiselectMode && bulkSelectedTaskIds && Number.isFinite(numericId) && bulkSelectedTaskIds.has(numericId))
            return (
              <TaskCard
                key={`${entityType}:${entityId}`}
                task={task}
                isSelected={Boolean(isSelected)}
                isBulkSelected={isBulkSelected}
                colorClass={getColorClass(task)}
                style={getInlineStyle(task)}
                isMultiselectMode={isMultiselectMode}
                isSuggestion={Boolean(isSuggestion)}
                onBulkTaskToggle={onBulkTaskToggle}
                onTaskClick={onTaskClick}
              />
            )
          })}
        </div>
        <div ref={sentinelRef} className="h-6" />
      </div>
    </div>
  )
}

export const VirtualizedWeekGridCalendar = forwardRef<
  VirtualizedWeekGridCalendarRef,
  VirtualizedWeekGridCalendarProps
>(function VirtualizedWeekGridCalendar(
  {
    tasks,
    dateField,
    selectedTaskId,
    selectedEntityType,
    visibleMonth,
    viewMode,
    collapsedLimit,
    expandedWeekLimit,
    onExpandWeek,
    onCollapseWeek,
    onVisibleMonthChange,
    onTaskClick,
    onTaskDrop,
    getColorClass,
    getInlineStyle,
    isMultiselectMode = false,
    bulkSelectedTaskIds,
    onBulkTaskToggle,
  },
  ref,
) {
  const openComposer = useTaskComposerStore((s) => s.openComposer)
  const forceCloseComposer = useTaskComposerStore((s) => s.forceCloseComposer)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const setWeekScrollContainerRef = useCallback((el: HTMLDivElement | null) => {
    scrollContainerRef.current = el
    setScrollEl(el)
  }, [])
  const isDraggingRef = useRef(false)
  const [isDragActive, setIsDragActive] = useState(false)
  const dragPointerYRef = useRef<number | null>(null)
  const dragAutoScrollRafRef = useRef<number | null>(null)
  const [inlineDraft, setInlineDraft] = useState<{
    dayKey: string
    dateField: 'delivery_date' | 'publication_date'
    draftId: string
    title: string
    composerId: string
  } | null>(null)

  const initialWeekStart = useMemo(() => getMonthStartWeekDayKey(visibleMonth), [visibleMonth])
  const [weekKeys, setWeekKeys] = useState<string[]>(() => {
    return Array.from({ length: EXTEND_BY_WEEKS * 2 + 1 }, (_, i) =>
      addWeeksFromDayKey(initialWeekStart, i - EXTEND_BY_WEEKS),
    )
  })

  const weekKeysRef = useRef(weekKeys)
  useEffect(() => {
    weekKeysRef.current = weekKeys
  }, [weekKeys])

  const tasksByDayKey = useMemo(() => {
    const map = new Map<string, CalendarTask[]>()
    for (const task of tasks) {
      const dayKey = toLocalDayKey(task[dateField] as any)
      if (!dayKey) continue
      const arr = map.get(dayKey) ?? []
      arr.push(task)
      map.set(dayKey, arr)
    }
    return map
  }, [tasks, dateField])

  const getEstimatedWeekHeight = useCallback(
    (weekKey: string, weekLimit: number): number => {
      if (weekLimit <= collapsedLimit) return FIXED_WEEK_HEIGHT_PX
      const dayKeys = getWeekDays(weekKey)
      let maxVisibleTasksInWeek = 0
      for (const dayKey of dayKeys) {
        const dayCount = tasksByDayKey.get(dayKey)?.length ?? 0
        maxVisibleTasksInWeek = Math.max(maxVisibleTasksInWeek, Math.min(dayCount, weekLimit))
      }
      const dynamicHeight =
        DAY_HEADER_HEIGHT_PX +
        maxVisibleTasksInWeek * TASK_CARD_HEIGHT_PX +
        SHOW_MORE_HEIGHT_PX +
        WEEK_ROW_PADDING_PX
      return Math.max(FIXED_WEEK_HEIGHT_PX, dynamicHeight)
    },
    [collapsedLimit, tasksByDayKey],
  )

  const rowVirtualizer = useVirtualizer({
    count: weekKeys.length,
    getScrollElement: () => scrollEl,
    estimateSize: (index) => {
      const weekKey = weekKeys[index]
      if (!weekKey) return FIXED_WEEK_HEIGHT_PX
      const weekLimit = expandedWeekLimit[weekKey] ?? collapsedLimit
      return getEstimatedWeekHeight(weekKey, weekLimit)
    },
    overscan: OVERSCAN_WEEKS,
    getItemKey: (index) => weekKeys[index] ?? `week-${index}`,
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const virtualRows = rowVirtualizer.getVirtualItems()

  const pendingPrependCompensationRef = useRef<{ prevTop: number; shiftPx: number } | null>(null)
  const lastPublishedMonthKeyRef = useRef<string | null>(null)
  const hasInitialPositionRef = useRef(false)
  const isBootstrappingRef = useRef(true)
  const hasUserInteractedRef = useRef(false)
  const lastExtendAtRef = useRef(0)
  const isExtendingRef = useRef(false)
  const lastScrollTopRef = useRef(0)
  const lastScrollDirectionRef = useRef<1 | -1 | 0>(0)
  const lastUserScrollAtRef = useRef(0)
  const lastWeekWheelAtRef = useRef(0)
  const weekCursorDayRef = useRef<Date>(new Date(visibleMonth))
  const composerTitle = useTaskComposerStore(
    useCallback(
      (s) =>
        inlineDraft?.composerId
          ? String(s.composers.find((composer) => composer.id === inlineDraft.composerId)?.draft.title ?? '')
          : '',
      [inlineDraft?.composerId],
    ),
  )
  const hasInlineComposerOpen = useTaskComposerStore(
    useCallback(
      (s) => (inlineDraft?.composerId ? s.composers.some((composer) => composer.id === inlineDraft.composerId) : false),
      [inlineDraft?.composerId],
    ),
  )

  const debugLog = useCallback((message: string, payload?: Record<string, unknown>) => {
    if (!DEBUG_CALENDAR) return
    if (payload) {
      console.log(`[CalendarDebug][Virtual] ${message}`, payload)
      return
    }
    console.log(`[CalendarDebug][Virtual] ${message}`)
  }, [])

  useEffect(() => {
    weekCursorDayRef.current = new Date(visibleMonth)
  }, [visibleMonth])

  useEffect(() => {
    if (!inlineDraft) return
    if (inlineDraft.title === composerTitle) return
    setInlineDraft((prev) => (prev ? { ...prev, title: composerTitle } : prev))
  }, [composerTitle, inlineDraft])

  useEffect(() => {
    if (!inlineDraft) return
    if (hasInlineComposerOpen) return
    setInlineDraft(null)
  }, [hasInlineComposerOpen, inlineDraft])

  const beginInlineCreate = useCallback(
    (dayKey: string) => {
      if (isDraggingRef.current || isDragActive) return
      if (inlineDraft?.dayKey === dayKey) return
      if (inlineDraft?.composerId) {
        forceCloseComposer(inlineDraft.composerId)
      }
      const draftId = `draft:${dayKey}:${Date.now()}`
      const initialDraft: Record<string, unknown> = { title: '' }
      initialDraft[dateField] = dayKey
      const composerId = openComposer(initialDraft)
      setInlineDraft({
        dayKey,
        dateField,
        draftId,
        title: '',
        composerId,
      })
    },
    [dateField, forceCloseComposer, inlineDraft, isDragActive, openComposer],
  )

  const clearExtendingState = useCallback((reason: string) => {
    pendingPrependCompensationRef.current = null
    isExtendingRef.current = false
    debugLog('clear-extending', { reason })
  }, [debugLog])

  const rollWeekDays = useCallback((direction: 1 | -1, steps = 1) => {
    const base = weekCursorDayRef.current
    const next = addDaysLocal(base, direction * Math.max(1, steps))
    weekCursorDayRef.current = next
    debugLog('week-wheel-roll', {
      from: formatLocalDayKey(base),
      to: formatLocalDayKey(next),
      direction,
      steps: Math.max(1, steps),
    })
    onVisibleMonthChange(next)
  }, [debugLog, onVisibleMonthChange])

  useEffect(() => {
    const weekEl = scrollContainerRef.current
    if (!weekEl) return

    const onWheelRoute = (event: WheelEvent) => {
      if (viewMode !== 'week') return
      if (isDraggingRef.current) return

      const target = event.target as HTMLElement | null
      if (!target) return

      // Do not steal wheel from overlays/popovers/dialogs rendered over the calendar.
      if (
        target.closest(
          '[role="dialog"],[data-radix-popper-content-wrapper],[data-radix-select-content],[data-radix-dropdown-menu-content]',
        )
      ) {
        return
      }

      if (!hasUserInteractedRef.current) {
        hasUserInteractedRef.current = true
        debugLog('user-wheel-detected')
      }

      const deltaX = event.deltaX
      const deltaY = event.deltaY
      const absX = Math.abs(deltaX)
      const absY = Math.abs(deltaY)
      if (absX < 1 && absY < 1) return

      const dayEl = target.closest('[data-day-scroll]') as HTMLElement | null
      const hoveredDayKey = dayEl?.dataset.dayKey ?? null
      const visible = Number(dayEl?.dataset.dayVisibleCount ?? 0)
      const total = Number(dayEl?.dataset.dayTotalCount ?? 0)
      const hasMore = total > 0 && visible < total
      const canVert = Boolean(dayEl && canScrollVert(dayEl, deltaY))

      const horizontalIntent = event.shiftKey || absX > absY
      if (!horizontalIntent && dayEl && canVert) {
        debugLog('wheel-route', {
          route: 'vertical-wins',
          hoveredDayKey,
          canVert,
          hasMore,
          deltaX,
          deltaY,
        })
        return
      }
      if (!horizontalIntent && dayEl && deltaY > 0 && hasMore) {
        debugLog('wheel-route', {
          route: 'load-more-wins',
          hoveredDayKey,
          canVert,
          hasMore,
          deltaX,
          deltaY,
        })
        return
      }

      const horizontalDelta = horizontalIntent ? (deltaX !== 0 ? deltaX : deltaY) : deltaY
      const canRouteHorizontal = canScrollHoriz(weekEl, horizontalDelta)

      // Horizontal intent and implicit-horizontal (mouse wheel) both route horizontally.
      if (canRouteHorizontal && Math.abs(horizontalDelta) > 0) {
        event.preventDefault()
        weekEl.scrollLeft += horizontalDelta
        debugLog('wheel-route', {
          route: horizontalIntent ? 'horizontal-intent' : 'horizontal-implicit',
          hoveredDayKey,
          canVert,
          hasMore,
          deltaX,
          deltaY,
          scrollTop: dayEl?.scrollTop ?? null,
          scrollHeight: dayEl?.scrollHeight ?? null,
          clientHeight: dayEl?.clientHeight ?? null,
        })
        return
      }

      // If the horizontal scroller is at an edge, keep infinite day rolling.
      const dominantDelta = Math.abs(horizontalDelta) > 0 ? horizontalDelta : deltaY
      if (Math.abs(dominantDelta) < 10) return
      const now = Date.now()
      if (now - lastWeekWheelAtRef.current < 90) {
        event.preventDefault()
        return
      }
      lastWeekWheelAtRef.current = now
      const direction: 1 | -1 = dominantDelta > 0 ? 1 : -1
      const steps = Math.max(1, Math.floor(Math.abs(dominantDelta) / 45))
      event.preventDefault()
      rollWeekDays(direction, steps)
      debugLog('wheel-route', {
        route: horizontalIntent ? 'horizontal-intent' : 'horizontal-implicit',
        hoveredDayKey,
        canVert,
        hasMore,
        deltaX,
        deltaY,
        scrollTop: dayEl?.scrollTop ?? null,
        scrollHeight: dayEl?.scrollHeight ?? null,
        clientHeight: dayEl?.clientHeight ?? null,
      })
    }

    weekEl.addEventListener('wheel', onWheelRoute, { capture: true, passive: false })
    return () => {
      weekEl.removeEventListener('wheel', onWheelRoute, { capture: true } as EventListenerOptions)
    }
  }, [debugLog, rollWeekDays, viewMode])

  const previousExpandedWeekLimitRef = useRef<Record<string, number>>(expandedWeekLimit)

  useEffect(() => {
    if (viewMode === 'week') {
      previousExpandedWeekLimitRef.current = expandedWeekLimit
      return
    }
    const root = scrollContainerRef.current
    if (!root) {
      previousExpandedWeekLimitRef.current = expandedWeekLimit
      return
    }

    const prevLimits = previousExpandedWeekLimitRef.current
    const nextLimits = expandedWeekLimit
    const changedWeekKeys = new Set<string>([...Object.keys(prevLimits), ...Object.keys(nextLimits)])
    if (changedWeekKeys.size === 0) {
      previousExpandedWeekLimitRef.current = expandedWeekLimit
      return
    }

    const top = root.scrollTop
    const rows = rowVirtualizer.getVirtualItems()
    const firstVisible =
      rows.find((v) => v.start <= top && v.end >= top) ??
      rows.find((v) => v.end > top) ??
      rows[0]
    const firstVisibleIndex = firstVisible?.index ?? 0

    let deltaAbove = 0
    let hasAnyChange = false

    for (const weekKey of Array.from(changedWeekKeys)) {
      const prevLimit = prevLimits[weekKey] ?? collapsedLimit
      const nextLimit = nextLimits[weekKey] ?? collapsedLimit
      if (prevLimit === nextLimit) continue
      hasAnyChange = true
      const weekIndex = weekKeysRef.current.indexOf(weekKey)
      if (weekIndex < 0 || weekIndex >= firstVisibleIndex) continue
      const oldHeight = getEstimatedWeekHeight(weekKey, prevLimit)
      const newHeight = getEstimatedWeekHeight(weekKey, nextLimit)
      deltaAbove += newHeight - oldHeight
    }

    if (!hasAnyChange) {
      previousExpandedWeekLimitRef.current = expandedWeekLimit
      return
    }

    requestAnimationFrame(() => {
      rowVirtualizer.measure()
      if (deltaAbove !== 0 && scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop += deltaAbove
      }
    })

    previousExpandedWeekLimitRef.current = expandedWeekLimit
  }, [collapsedLimit, expandedWeekLimit, getEstimatedWeekHeight, rowVirtualizer, viewMode])

  useEffect(() => {
    if (viewMode === 'week') return
    if (Object.keys(expandedWeekLimit).length === 0) return
    const raf = requestAnimationFrame(() => {
      rowVirtualizer.measure()
    })
    return () => cancelAnimationFrame(raf)
  }, [expandedWeekLimit, rowVirtualizer, tasksByDayKey, viewMode])

  const applyPrependCompensation = useCallback(() => {
    const pending = pendingPrependCompensationRef.current
    const root = scrollContainerRef.current
    if (!pending || !root) {
      clearExtendingState('missing-compensation-or-root')
      return
    }
    root.scrollTop = pending.prevTop + pending.shiftPx
    clearExtendingState('prepend-compensation-applied')
  }, [clearExtendingState])

  const extendRangeIfNeeded = useCallback(() => {
    if (viewMode === 'week') return
    if (!scrollContainerRef.current || isDraggingRef.current) return
    if (!hasInitialPositionRef.current) return
    if (!hasUserInteractedRef.current) return
    if (isExtendingRef.current) return
    if (Date.now() - lastExtendAtRef.current < 200) return
    if (!virtualRows.length) return

    const root = scrollContainerRef.current
    const top = root.scrollTop
    const bottom = top + root.clientHeight
    const remainingBottom = root.scrollHeight - root.clientHeight - top
    const nearTop = top < 140
    const nearBottom = remainingBottom < 140
    const recentUserScroll = Date.now() - lastUserScrollAtRef.current < 260
    const scrollingUp = lastScrollDirectionRef.current === -1
    const scrollingDown = lastScrollDirectionRef.current === 1
    const visibleFirst =
      virtualRows.find((v) => v.start <= top && v.end >= top) ??
      virtualRows.find((v) => v.end > top) ??
      virtualRows[0]
    const visibleLast =
      [...virtualRows].reverse().find((v) => v.start < bottom && v.end >= bottom) ??
      [...virtualRows].reverse().find((v) => v.start < bottom) ??
      virtualRows[virtualRows.length - 1]
    const first = visibleFirst
    const last = visibleLast
    if (!first || !last) return

    const hardPrependBoundary = first.index <= 2
    const hardAppendBoundary = last.index >= weekKeysRef.current.length - 3

    const softPrepend = recentUserScroll && nearTop && (scrollingUp || top <= 1)
    const softAppend = recentUserScroll && nearBottom && (scrollingDown || remainingBottom <= 1)

    const shouldPrepend =
      first.index <= EDGE_LOAD_THRESHOLD + 2 &&
      (hardPrependBoundary || softPrepend)
    const shouldAppend =
      last.index >= weekKeysRef.current.length - EDGE_LOAD_THRESHOLD - 1 &&
      (hardAppendBoundary || softAppend)

    if (shouldPrepend) {
      const firstWeek = weekKeysRef.current[0]
      if (!firstWeek) return

      const prepend = Array.from({ length: EXTEND_BY_WEEKS }, (_, i) =>
        addWeeksFromDayKey(firstWeek, -(EXTEND_BY_WEEKS - i)),
      )
      const shiftPx = prepend.reduce(
        (sum, weekKey) => sum + getEstimatedWeekHeight(weekKey, expandedWeekLimit[weekKey] ?? collapsedLimit),
        0,
      )
      lastExtendAtRef.current = Date.now()
      isExtendingRef.current = true
      debugLog('prepend-weeks', {
        prependCount: prepend.length,
        firstIndex: first.index,
        firstWeek,
        visibleTop: top,
        shiftPx,
      })
      pendingPrependCompensationRef.current = { prevTop: top, shiftPx }
      setWeekKeys((prev) => [...prepend, ...prev])
      return
    }

    if (shouldAppend) {
      const lastWeek = weekKeysRef.current[weekKeysRef.current.length - 1]
      if (!lastWeek) return
      const append = Array.from({ length: EXTEND_BY_WEEKS }, (_, i) =>
        addWeeksFromDayKey(lastWeek, i + 1),
      )
      lastExtendAtRef.current = Date.now()
      isExtendingRef.current = true
      debugLog('append-weeks', {
        appendCount: append.length,
        lastIndex: last.index,
        lastWeek,
        visibleBottom: bottom,
      })
      setWeekKeys((prev) => [...prev, ...append])
      requestAnimationFrame(() => {
        isExtendingRef.current = false
      })
    }
  }, [collapsedLimit, debugLog, expandedWeekLimit, getEstimatedWeekHeight, viewMode, virtualRows])

  useEffect(() => {
    if (viewMode === 'week') return
    extendRangeIfNeeded()
  }, [extendRangeIfNeeded, viewMode, weekKeys.length])

  useEffect(() => {
    if (viewMode === 'week') return
    if (!scrollEl) return
    if (hasInitialPositionRef.current) return
    if (!isBootstrappingRef.current) return

    // Start near the center of the prebuilt range so we don't immediately
    // trigger prepend/append logic on first paint.
    let rafB: number | null = null
    const rafA = requestAnimationFrame(() => {
      rowVirtualizer.scrollToIndex(EXTEND_BY_WEEKS, { align: 'start' })
      rafB = requestAnimationFrame(() => {
        hasInitialPositionRef.current = true
        isBootstrappingRef.current = false
        lastScrollTopRef.current = scrollContainerRef.current?.scrollTop ?? 0
        debugLog('initial-position-settled', { centerIndex: EXTEND_BY_WEEKS })
      })
    })
    return () => {
      cancelAnimationFrame(rafA)
      if (rafB != null) cancelAnimationFrame(rafB)
    }
  }, [debugLog, rowVirtualizer, scrollEl, viewMode])

  useEffect(() => {
    if (viewMode === 'week') return
    if (!pendingPrependCompensationRef.current) return
    const raf = requestAnimationFrame(() => {
      applyPrependCompensation()
    })
    return () => cancelAnimationFrame(raf)
  }, [applyPrependCompensation, viewMode, weekKeys.length])

  useEffect(() => {
    if (viewMode === 'week') return
    if (isExtendingRef.current) return
    if (pendingPrependCompensationRef.current) return
    if (!hasUserInteractedRef.current) return
    if (!hasInitialPositionRef.current) return
    if (!virtualRows.length) return
    const root = scrollContainerRef.current
    if (!root) return
    const top = root.scrollTop
    const firstVisible =
      virtualRows.find((v) => v.start <= top && v.end >= top) ??
      virtualRows.find((v) => v.end > top) ??
      virtualRows[0]
    if (!firstVisible) return
    const wk = weekKeys[firstVisible.index]
    if (!wk) return
    const monthDate = getMonthLabelFromWeekStart(wk)
    const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`
    if (lastPublishedMonthKeyRef.current === monthKey) return
    lastPublishedMonthKeyRef.current = monthKey
    debugLog('publish-visible-month', {
      monthKey,
      firstVisibleWeek: wk,
      firstVisibleIndex: firstVisible.index,
      scrollTop: top,
    })
    onVisibleMonthChange(monthDate)
  }, [debugLog, onVisibleMonthChange, viewMode, virtualRows, weekKeys])

  const scrollToWeek = useCallback(
    (targetWeekKey: string) => {
      const root = scrollContainerRef.current
      if (!root) return

      let idx = weekKeysRef.current.indexOf(targetWeekKey)
      if (idx === -1) {
        const first = weekKeysRef.current[0]
        const last = weekKeysRef.current[weekKeysRef.current.length - 1]
        if (!first || !last) return
        const beforeGap = Math.max(
          0,
          Math.ceil(
            (new Date(first).getTime() - new Date(targetWeekKey).getTime()) / (7 * 24 * 60 * 60 * 1000),
          ),
        )
        const afterGap = Math.max(
          0,
          Math.ceil(
            (new Date(targetWeekKey).getTime() - new Date(last).getTime()) / (7 * 24 * 60 * 60 * 1000),
          ),
        )

        if (beforeGap > 0) {
          const prepend = Array.from({ length: beforeGap + EXTEND_BY_WEEKS }, (_, i) =>
            addWeeksFromDayKey(first, -(beforeGap + EXTEND_BY_WEEKS - i)),
          )
          setWeekKeys((prev) => [...prepend, ...prev])
        } else if (afterGap > 0) {
          const append = Array.from({ length: afterGap + EXTEND_BY_WEEKS }, (_, i) =>
            addWeeksFromDayKey(last, i + 1),
          )
          setWeekKeys((prev) => [...prev, ...append])
        }
      }

      requestAnimationFrame(() => {
        const nextIdx = weekKeysRef.current.indexOf(targetWeekKey)
        if (nextIdx >= 0) {
          rowVirtualizer.scrollToIndex(nextIdx, { align: 'start' })
        }
      })
    },
    [rowVirtualizer],
  )

  useImperativeHandle(
    ref,
    () => ({
      scrollByWeeks: (weeks) => {
        if (viewMode === 'week') {
          const next = addDaysLocal(visibleMonth, weeks * 7)
          onVisibleMonthChange(next)
          return
        }
        const rows = rowVirtualizer.getVirtualItems()
        const top = rows[0]
        const baseIdx = top ? top.index : 0
        const targetIdx = Math.max(0, Math.min(weekKeysRef.current.length - 1, baseIdx + weeks))
        rowVirtualizer.scrollToIndex(targetIdx, { align: 'start' })
      },
      scrollByDays: (days) => {
        const next = addDaysLocal(visibleMonth, days)
        onVisibleMonthChange(next)
      },
      scrollToMonth: (month) => {
        if (viewMode === 'week') {
          onVisibleMonthChange(new Date(month.getFullYear(), month.getMonth(), 1, 12, 0, 0, 0))
          return
        }
        scrollToWeek(getMonthStartWeekDayKey(month))
      },
      scrollToToday: () => {
        if (viewMode === 'week') {
          onVisibleMonthChange(new Date())
          return
        }
        scrollToWeek(getWeekStartDayKey(new Date()))
      },
    }),
    [onVisibleMonthChange, rowVirtualizer, scrollToWeek, viewMode, visibleMonth],
  )

  const stopDragAutoScroll = useCallback(() => {
    if (dragAutoScrollRafRef.current != null) {
      cancelAnimationFrame(dragAutoScrollRafRef.current)
      dragAutoScrollRafRef.current = null
    }
  }, [])

  const startDragAutoScroll = useCallback(() => {
    if (dragAutoScrollRafRef.current != null) return
    const tick = () => {
      const root = scrollContainerRef.current
      if (!root || !isDraggingRef.current) {
        stopDragAutoScroll()
        return
      }
      const y = dragPointerYRef.current
      const rect = root.getBoundingClientRect()
      if (y != null) {
        const edge = 90
        let delta = 0
        if (y < rect.top + edge) {
          delta = -Math.ceil(((rect.top + edge - y) / edge) * 24)
        } else if (y > rect.bottom - edge) {
          delta = Math.ceil(((y - (rect.bottom - edge)) / edge) * 24)
        }
        if (delta !== 0) root.scrollTop += delta
      }
      dragAutoScrollRafRef.current = requestAnimationFrame(tick)
    }
    dragAutoScrollRafRef.current = requestAnimationFrame(tick)
  }, [stopDragAutoScroll])

  const onDragStart = useCallback(() => {
    isDraggingRef.current = true
    setIsDragActive(true)
    startDragAutoScroll()
  }, [startDragAutoScroll])

  const onDragMove = useCallback((event: any) => {
    const e = event?.activatorEvent
    if (e && typeof e === 'object' && 'clientY' in e) {
      dragPointerYRef.current = (e as MouseEvent).clientY
    }
  }, [])

  const onDragCancel = useCallback(() => {
    isDraggingRef.current = false
    setIsDragActive(false)
    dragPointerYRef.current = null
    stopDragAutoScroll()
  }, [stopDragAutoScroll])

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      isDraggingRef.current = false
      setIsDragActive(false)
      dragPointerYRef.current = null
      stopDragAutoScroll()

      const overId = String(event.over?.id ?? '')
      if (!overId.startsWith('day:')) return
      const dayKey = overId.replace('day:', '')

      const activeData = event.active.data.current as any
      if (!activeData?.task) return
      onTaskDrop(activeData.task, dayKey)
    },
    [onTaskDrop, stopDragAutoScroll],
  )

  useEffect(() => {
    return () => {
      stopDragAutoScroll()
    }
  }, [stopDragAutoScroll])

  if (process.env.NODE_ENV === 'development') {
    // Guarded lightweight diagnostics for migration acceptance tests.
    ;(window as any).__calendarWeekVirtualInfo = {
      renderedRows: virtualRows.length,
      totalWeeks: weekKeys.length,
      firstWeek: weekKeys[0],
      lastWeek: weekKeys[weekKeys.length - 1],
      hasInitialPosition: hasInitialPositionRef.current,
      hasUserInteracted: hasUserInteractedRef.current,
      isBootstrapping: isBootstrappingRef.current,
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragCancel={onDragCancel}
      onDragEnd={onDragEnd}
    >
      <div className="h-full min-h-0 flex flex-col">
        <div
          ref={setWeekScrollContainerRef}
          data-week-scroll="true"
          className={cn(
            'flex-1 min-h-0 overscroll-contain',
            viewMode === 'week' ? 'overflow-x-auto overflow-y-hidden' : 'overflow-y-auto',
            viewMode === 'week' ? 'overscroll-x-contain overscroll-y-none' : '',
          )}
          onWheel={() => {
            if (!hasUserInteractedRef.current) {
              hasUserInteractedRef.current = true
              debugLog('user-wheel-detected')
            }
            lastUserScrollAtRef.current = Date.now()
          }}
          onPointerDown={() => {
            if (!hasUserInteractedRef.current) {
              hasUserInteractedRef.current = true
              debugLog('user-pointer-detected')
            }
          }}
          onTouchStart={() => {
            if (!hasUserInteractedRef.current) {
              hasUserInteractedRef.current = true
              debugLog('user-touch-detected')
            }
            lastUserScrollAtRef.current = Date.now()
          }}
          onScroll={(e) => {
            const top = (e.currentTarget as HTMLDivElement).scrollTop
            const prev = lastScrollTopRef.current
            if (top > prev + 1) lastScrollDirectionRef.current = 1
            else if (top < prev - 1) lastScrollDirectionRef.current = -1
            lastScrollTopRef.current = top
            if (hasUserInteractedRef.current) {
              lastUserScrollAtRef.current = Date.now()
            }
          }}
        >
          {viewMode !== 'week' && (
            <div className="sticky top-0 z-20 border-y border-gray-200">
              <div className="grid grid-cols-7 border-l border-gray-200">
                {CALENDAR_WEEKDAY_LABELS.map((label) => (
                  <div
                    key={label}
                    className="h-8 border-r border-gray-200 flex items-center justify-center text-xs text-gray-500"
                  >
                    {label}
                  </div>
                ))}
              </div>
            </div>
          )}
          {viewMode === 'week' ? (
            (() => {
              const startKey = toLocalDayKey(visibleMonth) ?? formatLocalDayKey(new Date())
              const startDate = parseLocalDayKey(startKey) ?? new Date()
              const dayKeys = Array.from({ length: 7 }, (_, i) => formatLocalDayKey(addDaysLocal(startDate, i)))
              return (
                <div className="grid grid-cols-7 min-w-[980px] h-full border-l border-gray-200">
                  {dayKeys.map((dayKey) => {
                    const dayTasks = tasksByDayKey.get(dayKey) ?? []
                    return (
                      <WeekDayColumn
                        key={dayKey}
                        dayKey={dayKey}
                        tasks={dayTasks}
                        selectedTaskId={selectedTaskId}
                        selectedEntityType={selectedEntityType}
                        onTaskClick={onTaskClick}
                        onTaskDrop={onTaskDrop}
                        getColorClass={getColorClass}
                        getInlineStyle={getInlineStyle}
                        inlineDraftTitle={inlineDraft?.dayKey === dayKey ? inlineDraft.title : null}
                        onBeginInlineCreate={beginInlineCreate}
                        isInlineCreateBlocked={isDragActive}
                        isMultiselectMode={isMultiselectMode}
                        bulkSelectedTaskIds={bulkSelectedTaskIds}
                        onBulkTaskToggle={onBulkTaskToggle}
                      />
                    )
                  })}
                </div>
              )
            })()
          ) : (
            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
              {virtualRows.map((row) => {
                const weekKey = weekKeys[row.index]
                if (!weekKey) return null
                const roundedStart = Math.round(row.start)
                if (DEBUG_CALENDAR && Math.abs(row.start - roundedStart) > 0.01) {
                  console.log('[CalendarDebug][Virtual] fractional-row-start', weekKey, row.start)
                }
                const dayKeys = getWeekDays(weekKey)
                const weekExpandedLimit = expandedWeekLimit[weekKey] ?? collapsedLimit

                return (
                  <div
                    key={weekKey}
                    data-index={row.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${row.size}px`,
                      transform: `translateY(${roundedStart}px)`,
                      background: 'white',
                    }}
                  >
                    <WeekRow
                      weekKey={weekKey}
                      dayKeys={dayKeys}
                      tasksByDayKey={tasksByDayKey}
                      weekExpandedLimit={weekExpandedLimit}
                      collapsedLimit={collapsedLimit}
                      selectedEntityType={selectedEntityType}
                      selectedTaskId={selectedTaskId}
                      activeMonth={visibleMonth}
                      viewMode={viewMode}
                      measureRef={weekExpandedLimit > collapsedLimit ? rowVirtualizer.measureElement : undefined}
                      onTaskClick={onTaskClick}
                      onExpandWeek={onExpandWeek}
                      onCollapseWeek={onCollapseWeek}
                      getColorClass={getColorClass}
                      getInlineStyle={getInlineStyle}
                      inlineDraftDayKey={inlineDraft?.dayKey ?? null}
                      inlineDraftTitle={inlineDraft?.title ?? null}
                      onBeginInlineCreate={beginInlineCreate}
                      isInlineCreateBlocked={isDragActive}
                      isMultiselectMode={isMultiselectMode}
                      bulkSelectedTaskIds={bulkSelectedTaskIds}
                      onBulkTaskToggle={onBulkTaskToggle}
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute left-0 right-0 bottom-0 h-px bg-gray-200 z-50"
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </DndContext>
  )
})
