import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { DateToggle } from './date-toggle';
import { addTask, getTasksForCalendarMonthChunk, updateTaskDate } from '../../../lib/services/tasks';
import { addTaskToCalendarCaches, addTaskToGroupedTaskCaches, normalizeTask, removeTaskFromAllStores, updateTaskInCaches } from '../tasks/task-cache-utils'
import { useTaskRealtime } from '../../../hooks/use-task-realtime';
import type { Task } from '../../lib/types/tasks';
import { CalendarTaskCard } from './calendar-task-card';
import { TaskFilters as TaskFiltersComponent, TaskFilters as TaskFiltersType } from '@/components/tasks/TaskFilters';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { addItemToStore, removeItemFromStore } from '../../../hooks/use-infinite-query';
import { FilterPane } from '@/components/ui/filter-pane'
import { useSearchParams, useRouter } from 'next/navigation'
import { Filter, ChevronLeft, ChevronRight, ChevronDown, Plus, PanelBottom } from 'lucide-react';
import React, { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { TaskListRow } from '../task-list/task-list-columns';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useTypesenseInfiniteQuery } from '../../hooks/use-typesense-infinite-query';
import { getTypesenseUpdater } from '../../store/typesense-tasks';
import { useMobileDetection } from '../../hooks/use-mobile-detection';
import { readCalendarOptions, writeParam } from '../../lib/utils';
import { useTasksUI } from '../../store/tasks-ui'
import { useTaskComposerStore } from '../../store/task-composer-store'
import { useTaskSuggestionsQuery } from '../../hooks/use-task-suggestions-query'
import { usePlannerOptimisticTasks } from '../../store/planner-optimistic-tasks'
import { toast } from '../ui/use-toast';

// Import FullCalendar and plugins (plugins must be imported directly, not via dynamic)
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import FullCalendar from '@fullcalendar/react';

// Mobile Task Card Component for Calendar
function CalendarMobileTaskCard({ task, isSelected, onTaskClick, isMainTask, isExpanded, onToggleExpand }: {
  task: any;
  isSelected: boolean;
  onTaskClick?: (task: any) => void;
  isMainTask?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: (taskId: number) => void;
}) {
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div 
      className={`p-3 border-b border-gray-100 cursor-pointer transition-colors ${
        isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'
      }`}
      onClick={() => onTaskClick?.(task)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Status color ball */}
          <div 
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ 
              backgroundColor: task.project_statuses?.color || '#e5e7eb',
              border: task.project_statuses?.color ? 'none' : '1px solid #d1d5db'
            }}
          />
          
          {/* Title */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm">
                {task.title}
              </span>
              {isMainTask && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleExpand?.(task.id);
                  }}
                  className="p-1 rounded transition text-gray-400 hover:text-blue-600 flex-shrink-0"
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              )}
            </div>
          </div>
          
          {/* Assignee avatar */}
          {(task.assigned_user?.full_name || task.users?.full_name) && (
            <div className="flex-shrink-0">
              <div 
                className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600"
                title={task.assigned_user?.full_name || task.users?.full_name}
              >
                {getInitials(task.assigned_user?.full_name || task.users?.full_name)}
              </div>
            </div>
          )}
        </div>
        
        {/* Delivery date */}
        <div className="flex-shrink-0 ml-3">
          <span className="text-xs text-gray-500">
            {task.delivery_date ? new Date(task.delivery_date).toLocaleDateString() : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

// Comprehensive column definitions for calendar task table
const CALENDAR_TASK_COLUMNS = [
  {
    key: "title",
    label: "Title",
    render: (row: any) => (
      <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">
        {row.title}
      </span>
    ),
  },
  {
    key: "assigned_user",
    label: "Assignee",
    render: (row: any) => {
      return (
        <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">
          {row.assigned_user?.full_name || row.users?.full_name || '—'}
        </span>
      );
    },
  },
  {
    key: "projects",
    label: "Project",
    render: (row: any) => (
      <span className="flex items-center gap-2 truncate max-w-full whitespace-nowrap overflow-hidden text-ellipsis">
        {row.projects?.color && (
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: row.projects.color }} />
        )}
        <span className="truncate max-w-[120px] whitespace-nowrap overflow-hidden text-ellipsis">
          {row.projects?.name || '—'}
        </span>
      </span>
    ),
  },
  {
    key: "project_statuses",
    label: "Status",
    render: (row: any) => {
      const status = row.project_statuses;
      const name = status?.name || '—';
      const color = status?.color;
      return (
        <span
          className="inline-block px-2 py-0.5 rounded-full text-[11px] font-normal"
          style={{
            backgroundColor: color || '#e5e7eb',
            color: color ? '#fff' : '#374151',
            minWidth: 36,
            textAlign: 'center',
            maxWidth: 80,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={name}
        >
          {name}
        </span>
      );
    },
  },
  {
    key: "delivery_date",
    label: "Delivery Date",
    render: (row: any) => (
      <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">
        {row.delivery_date ? new Date(row.delivery_date).toLocaleDateString() : '—'}
      </span>
    ),
  },
  {
    key: "publication_date",
    label: "Publication Date",
    render: (row: any) => (
      <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">
        {row.publication_date ? new Date(row.publication_date).toLocaleDateString() : '—'}
      </span>
    ),
  },
  {
    key: "content_type_title",
    label: "Content Type",
    render: (row: any) => (
      <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">
        {row.content_type_title || '—'}
      </span>
    ),
  },
  {
    key: "production_type_title",
    label: "Production Type",
    render: (row: any) => (
      <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">
        {row.production_type_title || '—'}
      </span>
    ),
  },
  {
    key: "language_code",
    label: "Language",
    render: (row: any) => (
      <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">
        {row.language_code || '—'}
      </span>
    ),
  },
];

interface CalendarViewProps {
  onTaskClick?: (task: Task) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  selectedTaskId?: string | number | null;
  selectedTask?: Task | null;
  expandButton?: ReactNode;
  onOptimisticUpdate?: (task: any) => void;
  enabled?: boolean; // New prop to control when queries should run
}

/**
 * CalendarView displays a monthly calendar of tasks with drag-and-drop, filtering, and detail integration.
 */
export function CalendarView({ onTaskClick, searchValue = "", onSearchChange, selectedTaskId, selectedTask, expandButton, onOptimisticUpdate, enabled = true }: CalendarViewProps) {
  const COLLAPSED_LIMIT = 3
  const MIN_WEEK_ROW_HEIGHT = 96
  const MIN_WEEK_ROW_HEIGHT_MOBILE = 220
  const isMobile = useMobileDetection();
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => new Date());
  const [expandedWeekLimit, setExpandedWeekLimit] = useState<Record<string, number>>(() => ({}))
  const expandedWeekLimitRef = useRef<Record<string, number>>({})
  const openComposer = useTaskComposerStore((s) => s.openComposer);
  const queryClient = useQueryClient();
  const calendarRef = useRef<any>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isDayTaskPaneOpen, setIsDayTaskPaneOpen] = useState(() => {
    // Show task pane by default for both mobile and desktop
    return true;
  });
  const params = useSearchParams();
  const router = useRouter();
  // Read calendar options from URL
  const calendarOptions = readCalendarOptions(new URLSearchParams(params.toString()));
  // Map URL dateField to database field
  const dateField = calendarOptions.dateField === 'delivery' ? 'delivery_date' : 'publication_date';
  const showSubtasks = calendarOptions.showSubtasks;
  const calendarContainerRef = useRef<HTMLDivElement>(null);
  const isRebasingScrollRef = useRef(false)
  const [isRebasingVisual, setIsRebasingVisual] = useState(false)
  const scrollRafRef = useRef<number | null>(null)
  const isScrollInitializedRef = useRef(false)
  const lastRebaseAtRef = useRef(0)
  const lastScrollTopRef = useRef(0)
  const topRebaseArmedRef = useRef(true)
  const bottomRebaseArmedRef = useRef(true)
  const hasInitialAnchoredRef = useRef(false)
  const anchorSettledAtRef = useRef(0)
  const rebaseStartedAtRef = useRef(0)
  const lastWheelDeltaYRef = useRef(0)
  const lastWheelAtRef = useRef(0)
  const rebaseSeqRef = useRef(0)
  const rebaseFallbackTimerRef = useRef<number | null>(null)
  const pendingRebaseRef = useRef<null | {
    seq: number
    direction: 1 | -1
    weeks: number
    prevTop: number
    shiftPx: number
    anchor: { anchorDate: string | null; offsetWithinRow: number } | null
    scheduledAt: number
  }>(null)
  const isDraggingEventRef = useRef(false)
  const dragPointerYRef = useRef<number | null>(null)
  const dragAutoScrollRafRef = useRef<number | null>(null)
  const lastDragStepAtRef = useRef(0)
  const layoutSyncRafRef = useRef<number | null>(null)
  const supabase = useMemo(() => createClientComponentClient(), [])
  const statusDefaultsRef = useRef<Record<string, { id?: string; name?: string; color?: string }>>({})
  const projectDefaultsRef = useRef<Record<string, { name?: string; color?: string }>>({})
  const activeInlineRef = useRef<null | {
    dateStr: string
    inputEl: HTMLInputElement
    remove: () => void
    commitOrCancel: () => Promise<void>
  }>(null)
  
  // Set up realtime subscriptions for tasks
  const { isSubscribed } = useTaskRealtime({
    enabled: true,
    showNotifications: false,
    onTaskUpdate: (task, event) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'calendar-chunk'] });
    }
  });
  
  // Debounced database updates to prevent timeouts on rapid drag-and-drop
  const pendingUpdates = useRef<Map<number, { dateField: string; newDate: string; task: any }>>(new Map());
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const markSlowCompute = useCallback((label: string, startedAt: number) => {
    void label
    void startedAt
  }, [])
  // Responsive: ResizeObserver to update calendar size
  useEffect(() => {
    if (!calendarContainerRef.current || !calendarRef.current) return;
    const observer = new window.ResizeObserver(() => {
      if (calendarRef.current && typeof calendarRef.current.getApi === 'function') {
        calendarRef.current.getApi().updateSize();
      }
    });
    observer.observe(calendarContainerRef.current);
    return () => observer.disconnect();
  }, []);

  // Helper to get local YYYY-MM-DD string from safe input.
  function getLocalDateString(date: Date | string | null | undefined) {
    const d = date instanceof Date ? date : date ? new Date(date) : new Date()
    if (Number.isNaN(d.getTime())) {
      const fallback = new Date()
      const year = fallback.getFullYear()
      const month = String(fallback.getMonth() + 1).padStart(2, '0')
      const day = String(fallback.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const getWeekKeyForDateString = useCallback((dateStr: string) => {
    const [yearRaw, monthRaw, dayRaw] = dateStr.split('-')
    const year = Number.parseInt(yearRaw ?? '', 10)
    const month = Number.parseInt(monthRaw ?? '', 10)
    const day = Number.parseInt(dayRaw ?? '', 10)
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return dateStr
    const date = new Date(year, month - 1, day)
    if (Number.isNaN(date.getTime())) return dateStr
    const dayOfWeek = date.getDay()
    date.setDate(date.getDate() - dayOfWeek)
    return getLocalDateString(date)
  }, [])

  const expandWeekToAtLeast = useCallback((weekKey: string, desiredLimit: number) => {
    setExpandedWeekLimit((prev) => {
      const next = {
        ...prev,
        [weekKey]: Math.max(prev[weekKey] ?? COLLAPSED_LIMIT, desiredLimit),
      }
      expandedWeekLimitRef.current = next
      return next
    })
  }, [])

  const collapseWeek = useCallback((weekKey: string) => {
    setExpandedWeekLimit((prev) => {
      const next = { ...prev }
      delete next[weekKey]
      expandedWeekLimitRef.current = next
      return next
    })
  }, [])

  // Helper to format date for display
  function formatDateForDisplay(dateStr: string) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }
  // On day click, set selectedDate and open day-task pane
  const handleDayClick = (_dateStr: string) => {};

  const shiftCalendarByWeeks = useCallback((weeks: number) => {
    if (!weeks) return
    const api = calendarRef.current?.getApi?.()
    if (api) {
      api.incrementDate({ weeks })
      const d = api.getDate()
      setVisibleMonth(new Date(d))
      return
    }
    setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + weeks * 7))
  }, [])

  const setCalendarViewDate = useCallback((nextDate: Date) => {
    const api = calendarRef.current?.getApi?.()
    if (api) {
      api.gotoDate(nextDate)
      setVisibleMonth(new Date(api.getDate()))
      return
    }
    setVisibleMonth(new Date(nextDate))
  }, [])

  const getWeekRowHeight = useCallback(() => {
    const root = calendarContainerRef.current
    if (!root) return 96
    const row = root.querySelector('.fc-daygrid-body tbody tr') as HTMLElement | null
    if (!row) return 96
    const h = row.getBoundingClientRect().height
    return Number.isFinite(h) && h > 0 ? h : 96
  }, [])

  const captureRowAnchor = useCallback((root: HTMLElement) => {
    const rootRect = root.getBoundingClientRect()
    const rows = Array.from(root.querySelectorAll('.fc-daygrid-body tbody tr')) as HTMLElement[]
    if (!rows.length) return null
    const row = rows.find((r) => r.getBoundingClientRect().bottom > rootRect.top + 1) || rows[0]
    if (!row) return null
    const rowRect = row.getBoundingClientRect()
    const cellWithDate = row.querySelector('td[data-date]') as HTMLElement | null
    const anchorDate = cellWithDate?.getAttribute('data-date') ?? null
    const offsetWithinRow = rootRect.top - rowRect.top
    return { anchorDate, offsetWithinRow }
  }, [])

  const completePendingRebase = useCallback((reason: 'dates-set' | 'fallback-timeout') => {
    const pending = pendingRebaseRef.current
    const root = calendarContainerRef.current
    if (!pending || !root) return

    const wasTop = root.scrollTop <= 2
    let nextScrollTop = Math.max(0, pending.prevTop - pending.direction * pending.shiftPx)

    if (pending.anchor?.anchorDate) {
      const rootRect = root.getBoundingClientRect()
      const anchorCell = root.querySelector(`.fc-daygrid-body td[data-date="${pending.anchor.anchorDate}"]`) as HTMLElement | null
      const anchorRow = anchorCell?.closest('tr') as HTMLElement | null
      if (anchorRow) {
        const rowRect = anchorRow.getBoundingClientRect()
        const desiredTop = rootRect.top - pending.anchor.offsetWithinRow
        const delta = rowRect.top - desiredTop
        nextScrollTop = Math.max(0, root.scrollTop + delta)
      }
    }

    root.scrollTop = nextScrollTop
    lastScrollTopRef.current = nextScrollTop
    isRebasingScrollRef.current = false
    setIsRebasingVisual(false)
    rebaseStartedAtRef.current = 0
    pendingRebaseRef.current = null
    if (rebaseFallbackTimerRef.current != null) {
      window.clearTimeout(rebaseFallbackTimerRef.current)
      rebaseFallbackTimerRef.current = null
    }

    void reason
    void wasTop
    markSlowCompute('rebase-correction', performance.now())
  }, [markSlowCompute])

  const rebaseByWeeks = useCallback((direction: 1 | -1, weeks = 4) => {
    const el = calendarContainerRef.current
    if (!el || isRebasingScrollRef.current) return
    const shiftPx = getWeekRowHeight() * weeks
    const prevTop = el.scrollTop
    const anchor = captureRowAnchor(el)
    const seq = ++rebaseSeqRef.current
    pendingRebaseRef.current = {
      seq,
      direction,
      weeks,
      prevTop,
      shiftPx,
      anchor,
      scheduledAt: Date.now(),
    }
    isRebasingScrollRef.current = true
    setIsRebasingVisual(true)
    rebaseStartedAtRef.current = Date.now()
    if (rebaseFallbackTimerRef.current != null) {
      window.clearTimeout(rebaseFallbackTimerRef.current)
    }
    rebaseFallbackTimerRef.current = window.setTimeout(() => {
      if (pendingRebaseRef.current?.seq === seq) {
        completePendingRebase('fallback-timeout')
      }
    }, 450)
    const api = calendarRef.current?.getApi?.()
    if (api) {
      api.incrementDate({ weeks: direction * weeks })
      setVisibleMonth(new Date(api.getDate()))
    } else {
      setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + direction * weeks * 7))
    }
  }, [captureRowAnchor, completePendingRebase, getWeekRowHeight])

  const handleCalendarScroll = useCallback(() => {
    const el = calendarContainerRef.current
    if (!el) return
    if (!isScrollInitializedRef.current) return
    if (isRebasingScrollRef.current) {
      const rebaseAge = Date.now() - rebaseStartedAtRef.current
      if (rebaseStartedAtRef.current > 0 && rebaseAge > 1000) {
        isRebasingScrollRef.current = false
        setIsRebasingVisual(false)
        rebaseStartedAtRef.current = 0
      } else {
        return
      }
    }
    if (Date.now() - anchorSettledAtRef.current < 800) {
      lastScrollTopRef.current = el.scrollTop
      return
    }
    const scrollTop = el.scrollTop
    const prevScrollTop = lastScrollTopRef.current
    const scrollingUp = scrollTop < prevScrollTop
    const scrollingDown = scrollTop > prevScrollTop
    const now = Date.now()
    if (now - lastRebaseAtRef.current < 180) {
      lastScrollTopRef.current = scrollTop
      return
    }
    const topTrigger = 240
    const topRelease = 480
    const bottomTrigger = 240
    const bottomRelease = 480
    const remainingBottom = el.scrollHeight - el.clientHeight - scrollTop
    if (scrollTop > topRelease) topRebaseArmedRef.current = true
    if (remainingBottom > bottomRelease) bottomRebaseArmedRef.current = true
    // Do not gate rebases on armed flags; edge + direction + cooldown are sufficient.
    const recentWheelAge = now - lastWheelAtRef.current
    const wheelIntentUp = recentWheelAge < 220 && lastWheelDeltaYRef.current < 0
    const wheelIntentDown = recentWheelAge < 220 && lastWheelDeltaYRef.current > 0
    const shouldPrepend = (scrollingUp || wheelIntentUp) && scrollTop < topTrigger
    const shouldAppend = (scrollingDown || wheelIntentDown) && remainingBottom < bottomTrigger
    if (!shouldPrepend && !shouldAppend) {
      lastScrollTopRef.current = scrollTop
      return
    }
    if (scrollRafRef.current != null) {
      lastScrollTopRef.current = scrollTop
      return
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      if (shouldPrepend) {
        lastRebaseAtRef.current = Date.now()
        rebaseByWeeks(-1, 4)
      } else if (shouldAppend) {
        lastRebaseAtRef.current = Date.now()
        rebaseByWeeks(1, 4)
      }
      if (calendarContainerRef.current && !isRebasingScrollRef.current) {
        lastScrollTopRef.current = calendarContainerRef.current.scrollTop
      }
    })
  }, [rebaseByWeeks])

  const handleCalendarWheelCapture = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    lastWheelDeltaYRef.current = event.deltaY
    lastWheelAtRef.current = Date.now()

    const el = calendarContainerRef.current
    if (!el) return
    if (!isScrollInitializedRef.current || isRebasingScrollRef.current) return
    if (Date.now() - anchorSettledAtRef.current < 800) return

    const now = Date.now()
    if (now - lastRebaseAtRef.current < 180) return

    const scrollTop = el.scrollTop
    const remainingBottom = el.scrollHeight - el.clientHeight - scrollTop
    const edgeTrigger = 120
    if (event.deltaY < 0 && scrollTop < edgeTrigger) {
      lastRebaseAtRef.current = now
      rebaseByWeeks(-1, 4)
      return
    }
    if (event.deltaY > 0 && remainingBottom < edgeTrigger) {
      lastRebaseAtRef.current = now
      rebaseByWeeks(1, 4)
    }
  }, [rebaseByWeeks])

  const stopDragAutoScroll = useCallback(() => {
    if (dragAutoScrollRafRef.current != null) {
      cancelAnimationFrame(dragAutoScrollRafRef.current)
      dragAutoScrollRafRef.current = null
    }
  }, [])

  const startDragAutoScroll = useCallback(() => {
    if (dragAutoScrollRafRef.current != null) return
    const tick = (ts: number) => {
      if (!isDraggingEventRef.current) {
        stopDragAutoScroll()
        return
      }
      const y = dragPointerYRef.current
      const rect = calendarContainerRef.current?.getBoundingClientRect()
      if (y != null && rect) {
        const edge = 80
        let dir = 0
        if (y < rect.top + edge) dir = -1
        else if (y > rect.bottom - edge) dir = 1
        if (dir !== 0 && ts - lastDragStepAtRef.current > 220) {
          shiftCalendarByWeeks(dir)
          lastDragStepAtRef.current = ts
        }
      }
      dragAutoScrollRafRef.current = requestAnimationFrame(tick)
    }
    dragAutoScrollRafRef.current = requestAnimationFrame(tick)
  }, [shiftCalendarByWeeks, stopDragAutoScroll])

  const handleEventDragStart = useCallback(() => {
    isDraggingEventRef.current = true
    startDragAutoScroll()
  }, [startDragAutoScroll])

  const handleEventDragStop = useCallback(() => {
    isDraggingEventRef.current = false
    dragPointerYRef.current = null
    stopDragAutoScroll()
  }, [stopDragAutoScroll])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDraggingEventRef.current) return
      dragPointerYRef.current = e.clientY
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  /** Debug: run after toggling expand for a day to inspect DOM (overflow vs display:none). */
  const debugExpandState = useCallback((dateStr: string) => {
    if (process.env.NODE_ENV !== 'development') return
    const calendarEl = calendarContainerRef.current
    if (!calendarEl) return
    // Day cell = the td (table cell) with data-date; in FC this is the .fc-daygrid-day element. Not .fc-daygrid-day-frame.
    const dayEl = calendarEl.querySelector(`.fc-daygrid-body td[data-date="${dateStr}"]`) as HTMLElement | null
    if (!dayEl) {
      console.log('[Calendar expand debug] No day cell found for', dateStr)
      return
    }
    const rect = dayEl.getBoundingClientRect()
    const dayStyles = window.getComputedStyle(dayEl)
    console.log('[Calendar expand debug] day cell (td.fc-daygrid-day)', dateStr, {
      rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
      overflow: dayStyles.overflow,
      overflowX: dayStyles.overflowX,
      overflowY: dayStyles.overflowY,
      height: dayStyles.height,
      maxHeight: dayStyles.maxHeight,
    })

    const harnesses = Array.from(dayEl.querySelectorAll('.fc-daygrid-event-harness, .fc-daygrid-event')) as HTMLElement[]
    console.log('[Calendar expand debug] harness count', harnesses.length, '(selector: .fc-daygrid-event-harness, .fc-daygrid-event)')

    harnesses.slice(0, 10).forEach((el, i) => {
      const s = window.getComputedStyle(el)
      console.log(`[Calendar expand debug] harness[${i}]`, {
        display: s.display,
        visibility: s.visibility,
        opacity: s.opacity,
        offsetHeight: (el as HTMLElement).offsetHeight,
      })
    })
    if (harnesses.length > 10) {
      console.log('[Calendar expand debug] ... and', harnesses.length - 10, 'more harnesses')
    }

    const eventsEl = dayEl.querySelector('.fc-daygrid-day-events') as HTMLElement | null
    if (eventsEl) {
      const evStyles = window.getComputedStyle(eventsEl)
      console.log('[Calendar expand debug] .fc-daygrid-day-events', {
        overflow: evStyles.overflow,
        overflowY: evStyles.overflowY,
        maxHeight: evStyles.maxHeight,
        height: evStyles.height,
        scrollHeight: eventsEl.scrollHeight,
        clientHeight: eventsEl.clientHeight,
      })
    } else {
      console.log('[Calendar expand debug] .fc-daygrid-day-events not found')
    }
  }, [])

  const removeTempFromCalendarQueries = useCallback((taskId: string) => {
    const allQueries = queryClient.getQueryCache().getAll()
    for (const q of allQueries) {
      const key = q.queryKey
      if (!Array.isArray(key) || key[0] !== 'tasks') continue
      const oldData = q.state.data
      if (!Array.isArray(oldData)) continue
      const next = oldData.filter((t: any) => String(t?.id) !== String(taskId))
      if (next.length !== oldData.length) {
        q.setData([...next])
      }
    }
  }, [queryClient])

  const getInlineDefaults = useCallback(async () => {
    let projectId = ''
    if (typeof window !== 'undefined') {
      projectId = localStorage.getItem('lastUsedProjectId') || ''
    }
    if (!projectId) return { projectId: '', projectName: '', projectColor: null as string | null, statusId: '', statusName: '', statusColor: null as string | null }

    if (!projectDefaultsRef.current[projectId]) {
      const { data: project } = await supabase
        .from('projects')
        .select('name, color')
        .eq('id', projectId)
        .maybeSingle()
      projectDefaultsRef.current[projectId] = {
        name: (project as any)?.name ?? '',
        color: (project as any)?.color ?? null,
      }
    }

    if (!statusDefaultsRef.current[projectId]) {
      const { data: statuses } = await supabase
        .from('project_statuses')
        .select('id, name, color, order_priority')
        .eq('project_id', projectId)
        .order('order_priority', { ascending: true })
      const rows = (statuses || []) as any[]
      const preferred = rows.find((s) => String(s?.name || '').toLowerCase() === 'not started') || rows[0]
      statusDefaultsRef.current[projectId] = preferred
        ? { id: String(preferred.id), name: preferred.name, color: preferred.color ?? null }
        : {}
    }

    return {
      projectId,
      projectName: projectDefaultsRef.current[projectId]?.name ?? '',
      projectColor: projectDefaultsRef.current[projectId]?.color ?? null,
      statusId: statusDefaultsRef.current[projectId]?.id ?? '',
      statusName: statusDefaultsRef.current[projectId]?.name ?? '',
      statusColor: statusDefaultsRef.current[projectId]?.color ?? null,
    }
  }, [supabase])

  const createInlineTask = useCallback(async (dateStr: string, title: string) => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return

    const defaults = await getInlineDefaults()
    const nowIso = new Date().toISOString()
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const optimisticTask: any = {
      id: tempId,
      entity_id: tempId,
      entity_type: 'task',
      kind: 'task',
      title: trimmedTitle,
      project_id_int: defaults.projectId ? Number(defaults.projectId) : null,
      project_status_id: defaults.statusId || null,
      project_name: defaults.projectName || null,
      project_color: defaults.projectColor ?? null,
      project_status_name: defaults.statusName || null,
      project_status_color: defaults.statusColor ?? null,
      projects: defaults.projectId ? { id: Number(defaults.projectId), name: defaults.projectName || null, color: defaults.projectColor ?? null } : null,
      project_statuses: defaults.statusId ? { id: defaults.statusId, name: defaults.statusName || null, color: defaults.statusColor ?? null } : null,
      assigned_to_id: null,
      assigned_user: null,
      users: null,
      content_type_id: null,
      content_type_title: null,
      production_type_id: null,
      production_type_title: null,
      language_id: null,
      language_code: null,
      delivery_date: dateField === 'delivery_date' ? dateStr : null,
      publication_date: dateField === 'publication_date' ? dateStr : null,
      created_at: nowIso,
      updated_at: nowIso,
    }

    addItemToStore('tasks', undefined, optimisticTask)
    addTaskToGroupedTaskCaches(optimisticTask)
    addTaskToCalendarCaches(queryClient, optimisticTask)
    getTypesenseUpdater()?.(optimisticTask)
    if (onOptimisticUpdate) onOptimisticUpdate(optimisticTask)

    try {
      const payload: any = {
        title: trimmedTitle,
        project_id_int: defaults.projectId || null,
        project_status_id: defaults.statusId || null,
        delivery_date: dateField === 'delivery_date' ? dateStr : null,
        publication_date: dateField === 'publication_date' ? dateStr : null,
      }
      const created = await addTask(payload)
      const hydrated = {
        ...created,
        entity_id: created.id,
        entity_type: 'task',
        kind: 'task',
        projects: defaults.projectId ? { id: Number(defaults.projectId), name: defaults.projectName || null, color: defaults.projectColor ?? null } : null,
        project_statuses: defaults.statusId ? { id: defaults.statusId, name: defaults.statusName || null, color: defaults.statusColor ?? null } : null,
        project_name: defaults.projectName || null,
        project_color: defaults.projectColor ?? null,
        project_status_name: defaults.statusName || null,
        project_status_color: defaults.statusColor ?? null,
      }

      removeTaskFromAllStores(tempId as any)
      removeTempFromCalendarQueries(tempId)

      addItemToStore('tasks', undefined, hydrated)
      addTaskToGroupedTaskCaches(hydrated)
      addTaskToCalendarCaches(queryClient, hydrated)
      updateTaskInCaches(queryClient, normalizeTask(hydrated))
      getTypesenseUpdater()?.(hydrated)
    } catch (error) {
      removeTaskFromAllStores(tempId as any)
      removeTempFromCalendarQueries(tempId)
      toast({
        title: 'Could not create task',
        description: 'Please try again.',
        variant: 'destructive',
      })
      if (process.env.NODE_ENV === 'development') {
        console.error('[CalendarView] Inline task creation failed', error)
      }
    }
  }, [addTaskToCalendarCaches, addTaskToGroupedTaskCaches, dateField, getInlineDefaults, onOptimisticUpdate, queryClient, removeTempFromCalendarQueries, updateTaskInCaches])

  const openInlineInputForDay = useCallback(async (dateStr: string, dayEl: HTMLElement) => {
    const current = activeInlineRef.current
    if (current && current.dateStr === dateStr) {
      current.inputEl.focus()
      return
    }
    if (current && current.dateStr !== dateStr) {
      await current.commitOrCancel()
    }

    const eventsContainer = dayEl.querySelector('.fc-daygrid-day-events') as HTMLElement | null
    if (!eventsContainer) return

    const wrapper = document.createElement('div')
    wrapper.className = 'inline-task-creator mt-1'
    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = 'New task...'
    input.className = 'w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-200'
    wrapper.appendChild(input)
    eventsContainer.prepend(wrapper)
    input.focus()

    let done = false
    const commitOrCancel = async () => {
      if (done) return
      done = true
      const value = input.value.trim()
      wrapper.remove()
      if (activeInlineRef.current?.inputEl === input) activeInlineRef.current = null
      if (value) {
        await createInlineTask(dateStr, value)
      }
    }

    const cancel = () => {
      if (done) return
      done = true
      wrapper.remove()
      if (activeInlineRef.current?.inputEl === input) activeInlineRef.current = null
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        void commitOrCancel()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      }
    })
    input.addEventListener('blur', () => {
      void commitOrCancel()
    })

    activeInlineRef.current = {
      dateStr,
      inputEl: input,
      remove: cancel,
      commitOrCancel,
    }
  }, [createInlineTask])

  // Use dayCellDidMount for precise click and class
  const dayCellDidMount = (arg: any) => {
    arg.el.style.cursor = 'pointer';
    const dateStr = getLocalDateString(arg?.date);
    const clickHandler = async (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-calendar-control]')) return
      handleDayClick(dateStr)
      if (
        target.closest('.fc-event') ||
        target.closest('.inline-task-creator') ||
        target.closest('.fc-daygrid-more-link') ||
        target.closest('button') ||
        target.closest('a')
      ) return
      await openInlineInputForDay(dateStr, arg.el)
    }
    arg.el.addEventListener('click', clickHandler)
    ;(arg.el as any).__inlineClickHandler = clickHandler
    // Remove any yellow background
    arg.el.style.background = '';
    // Add custom class for selected day
    if (selectedDate && dateStr === selectedDate) {
      arg.el.classList.add('fc-day-selected');
    } else {
      arg.el.classList.remove('fc-day-selected');
    }
    const weekKey = getWeekKeyForDateString(dateStr)
    const weekLimit = expandedWeekLimitRef.current[weekKey] ?? COLLAPSED_LIMIT
    arg.el.classList.toggle('fc-day-expanded', weekLimit > COLLAPSED_LIMIT)
    // Defer sync so we're not inside FC lifecycle (avoids flushSync warning)
    queueMicrotask(() => scheduleCalendarLayoutSync())
    // Highlight the day cell for the selected task
    if (selectedTask) {
      const taskDate = selectedTask.delivery_date || selectedTask.publication_date;
      let taskDateStr = '';
      if (taskDate) {
        // Handle both string dates and Date objects
        if (taskDate && typeof taskDate === 'object' && 'toISOString' in taskDate) {
          taskDateStr = (taskDate as Date).toISOString().slice(0, 10);
        } else {
          taskDateStr = String(taskDate).slice(0, 10);
        }
      }
      if (taskDateStr && dateStr === taskDateStr) {
        arg.el.classList.add('fc-day-selected-task');
      } else {
        arg.el.classList.remove('fc-day-selected-task');
      }
    } else {
      arg.el.classList.remove('fc-day-selected-task');
    }
    scheduleCalendarLayoutSync()
  };

  const dayCellWillUnmount = (arg: any) => {
    const handler = (arg.el as any).__inlineClickHandler
    if (handler) {
      arg.el.removeEventListener('click', handler)
    }
    if (activeInlineRef.current && activeInlineRef.current.inputEl.closest('.fc-daygrid-day') === arg.el) {
      activeInlineRef.current.remove()
      activeInlineRef.current = null
    }
  }

  // Parse filter values from URL
  const filterValues = React.useMemo(() => {
    const parseDate = (val?: string | null) => (val ? val : '');
    const base = {
      assignedTo: params.get('assignedTo')?.split(',').filter(Boolean) ?? [],
      status: params.get('status')?.split(',').filter(Boolean) ?? [],
      deliveryDate: {
        from: parseDate(params.get('deliveryDateFrom')),
        to: parseDate(params.get('deliveryDateTo')),
      },
      publicationDate: {
        from: parseDate(params.get('publicationDateFrom')),
        to: parseDate(params.get('publicationDateTo')),
      },
      project: params.get('project')?.split(',').filter(Boolean) ?? [],
      contentType: params.get('contentType')?.split(',').filter(Boolean) ?? [],
      productionType: params.get('productionType')?.split(',').filter(Boolean) ?? [],
      language: params.get('language')?.split(',').filter(Boolean) ?? [],
    };
    // Only show top-level tasks if showSubtasks is false
    if (!showSubtasks) {
      (base as any).parentTaskNull = true;
    }
    return base;
  }, [params, showSubtasks]);
  const filterKey = React.useMemo(() => JSON.stringify(filterValues), [filterValues]);

  const getMonthKey = useCallback((date: Date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  }, [])

  const getMonthStartFromKey = useCallback((chunkKey: string) => {
    const [yRaw, mRaw] = chunkKey.split('-')
    const y = Number.parseInt(yRaw ?? '', 10)
    const m = Number.parseInt(mRaw ?? '', 10)
    if (!Number.isFinite(y) || !Number.isFinite(m)) return new Date()
    return new Date(y, m - 1, 1)
  }, [])

  const calendarChunkKeys = useMemo(() => {
    const visibleStart = new Date(visibleMonth)
    visibleStart.setHours(0, 0, 0, 0)
    const visibleEnd = new Date(visibleStart)
    visibleEnd.setDate(visibleEnd.getDate() + 12 * 7 - 1)
    visibleEnd.setHours(23, 59, 59, 999)

    const bufferedStart = new Date(visibleStart.getFullYear(), visibleStart.getMonth() - 1, 1)
    const bufferedEnd = new Date(visibleEnd.getFullYear(), visibleEnd.getMonth() + 1, 1)

    const keys: string[] = []
    const cursor = new Date(bufferedStart)
    while (cursor <= bufferedEnd) {
      keys.push(getMonthKey(cursor))
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return keys
  }, [getMonthKey, visibleMonth])

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

  const isLoading = enabled && calendarChunkQueries.some((q) => q.isLoading)

  const calendarTaskStore = useMemo(() => {
    const t0 = performance.now()
    const tasksById = new Map<string, Task>()
    const dayIndex = new Map<string, Set<string>>()

    for (const query of calendarChunkQueries) {
      const rows = Array.isArray(query.data) ? query.data : []
      for (const row of rows) {
        const id = String(row.id)
        tasksById.set(id, row)
        const day = String(row[dateField] ?? '').slice(0, 10)
        if (!day) continue
        if (!dayIndex.has(day)) {
          dayIndex.set(day, new Set())
        }
        dayIndex.get(day)!.add(id)
      }
    }

    const store = { tasksById, dayIndex }
    markSlowCompute('calendarTaskStore', t0)
    return store
  }, [calendarChunkQueries, dateField, markSlowCompute])

  const tasks = useMemo(() => Array.from(calendarTaskStore.tasksById.values()), [calendarTaskStore])

  const plannerVisibility = useTasksUI((s) => s.plannerVisibility)

  const monthRange = useMemo(() => {
    const first = calendarChunkKeys[0] ?? getMonthKey(visibleMonth)
    const last = calendarChunkKeys[calendarChunkKeys.length - 1] ?? first
    const from = getMonthStartFromKey(first)
    const to = new Date(getMonthStartFromKey(last))
    to.setMonth(to.getMonth() + 1)
    to.setDate(0)
    to.setHours(23, 59, 59, 999)
    return { from, to }
  }, [calendarChunkKeys, getMonthKey, getMonthStartFromKey, visibleMonth])

  const projectIdsForSuggestions = useMemo(() => {
    const parsed = (filterValues?.project ?? [])
      .map((v: any) => Number.parseInt(String(v), 10))
      .filter((n: number) => Number.isFinite(n))
    if (parsed.length > 0) return parsed

    const v = params.get('projectId')
    if (v) {
      const n = Number.parseInt(v, 10)
      if (Number.isFinite(n)) return [n]
    }
    return null
  }, [filterKey, params.toString()])

  const suggestionsQuery = useTaskSuggestionsQuery({
    projectIds: projectIdsForSuggestions,
    from: monthRange.from,
    to: monthRange.to,
    enabled: enabled && plannerVisibility.showSuggestions,
    cacheKeyParts: ['calendar', dateField],
  })

  const optimisticPlannerTasksByKey = usePlannerOptimisticTasks((s) => s.byKey)
  const optimisticPlannerTasks = useMemo(
    () => Object.values(optimisticPlannerTasksByKey),
    [optimisticPlannerTasksByKey],
  )

  const suggestionTasks: Task[] = useMemo(() => {
    return (suggestionsQuery.data ?? []).map((s: any) => ({
      id: String(s.entity_id ?? s.id),
      entity_type: 'suggestion',
      entity_id: Number(s.entity_id ?? s.id),
      source_key: s.source_key ?? null,
      title: s.title,
      briefing: (s as any).briefing ?? null,
      delivery_date: s.delivery_date ?? undefined,
      publication_date: s.publication_date ?? undefined,
      project_id_int: s.project_id_int ?? null,
      project_status_name: null as any,
      content_type_id: s.content_type_id != null ? String(s.content_type_id) : undefined,
      content_type_title: null as any,
      production_type_id: undefined,
      production_type_title: null as any,
      language_id: undefined,
      language_code: null as any,
      users: undefined,
      projects: null,
      project_statuses: null,
      parent_task_id_int: null as any,
      kind: 'suggestion',
    } as any))
  }, [suggestionsQuery.data])

  // Only filter out subtasks in the UI if showSubtasks is off. Merge suggestions into the same calendar surface.
  const mergedTasks = useMemo(() => {
    const t0 = performance.now()
    const taskItems = plannerVisibility.showTasks ? (tasks || []) : []
    const suggestionItems = plannerVisibility.showSuggestions ? suggestionTasks : []
    const optimisticItems = plannerVisibility.showTasks ? (optimisticPlannerTasks as any[]) : []

    const seen = new Set<string>()
    const out: any[] = []
    for (const item of [...optimisticItems, ...taskItems, ...suggestionItems]) {
      const entityType = String((item as any).entity_type ?? ((item as any).kind === 'suggestion' ? 'suggestion' : 'task'))
      const entityId = String((item as any).entity_id ?? (item as any).id)
      const key = `${entityType}:${entityId}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(item)
    }

    markSlowCompute('mergedTasks', t0)
    return out
  }, [markSlowCompute, plannerVisibility.showTasks, plannerVisibility.showSuggestions, tasks, suggestionTasks, optimisticPlannerTasks])

  const filteredTasks = mergedTasks.filter(task => showSubtasks || !(task as any).parent_task_id_int);

  // Add Typesense updater - only for optimistic updates, don't fetch data
  const typesenseQuery = useTypesenseInfiniteQuery({ q: '', pageSize: 25, enabled: false });

  // Map filtered tasks to FullCalendar events
  const events = useMemo(
    () => {
      const t0 = performance.now()
      const mapped = (filteredTasks)
        .map((task: Task) => {
          const taskDate = task[dateField]
          let dateStr = ''

          if (typeof taskDate === 'string' && taskDate.length >= 10) {
            dateStr = taskDate.slice(0, 10)
          } else if (taskDate && typeof taskDate === 'object' && (taskDate as any) instanceof Date) {
            dateStr = getLocalDateString(taskDate as Date)
          } else if (taskDate) {
            const parsed = new Date(taskDate as any)
            if (!Number.isNaN(parsed.getTime())) {
              dateStr = getLocalDateString(parsed)
            }
          }

          // Ignore tasks without a valid calendar date to avoid transient misplaced events.
          if (!dateStr) return null

          return {
            id: `${String((task as any).entity_type ?? ((task as any).kind === 'suggestion' ? 'suggestion' : 'task'))}:${String((task as any).entity_id ?? task.id)}`,
            title: task.title,
            start: dateStr,
            allDay: true,
            extendedProps: { task },
            editable: (task as any)?.kind !== 'suggestion',
            // Visually distinguish subtasks
            className: task.parent_task_id_int ? 'bg-yellow-50 border-yellow-400' : '',
          }
        })
        .filter((event): event is NonNullable<typeof event> => Boolean(event))
      markSlowCompute('events-map', t0)
      return mapped
    },
    [filteredTasks, dateField, getLocalDateString, markSlowCompute]
  );

  const taskCountByDate = useMemo(() => {
    const counts = new Map<string, number>()
    for (const event of events) {
      const dateKey = String((event as any).start ?? '').slice(0, 10)
      if (!dateKey) continue
      counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1)
    }
    return counts
  }, [events])

  const syncExpandedDayCellsAndWeekRows = useCallback(() => {
    const root = calendarContainerRef.current
    if (!root) return

    const dayCells = Array.from(root.querySelectorAll('.fc-daygrid-body td[data-date]')) as HTMLElement[]
    for (const dayCell of dayCells) {
      const dateStr = dayCell.getAttribute('data-date')
      if (!dateStr) continue
      const weekKey = getWeekKeyForDateString(dateStr)
      const visibleLimit = expandedWeekLimitRef.current[weekKey] ?? COLLAPSED_LIMIT
      const weekExpanded = visibleLimit > COLLAPSED_LIMIT

      dayCell.classList.toggle('fc-day-expanded', weekExpanded)

      // Uncap clipping when week expanded, or always on mobile so first card is not clipped
      const shouldUncap = isMobile || weekExpanded
      if (shouldUncap) {
        dayCell.style.maxHeight = 'none'
        dayCell.style.overflow = 'visible'
        const frame = dayCell.querySelector('.fc-daygrid-day-frame') as HTMLElement | null
        if (frame) {
          frame.style.maxHeight = 'none'
          frame.style.overflow = 'visible'
        }
      } else {
        dayCell.style.maxHeight = ''
        dayCell.style.overflow = ''
        const frame = dayCell.querySelector('.fc-daygrid-day-frame') as HTMLElement | null
        if (frame) {
          frame.style.maxHeight = ''
          frame.style.overflow = ''
        }
      }

      const eventsContainer = dayCell.querySelector('.fc-daygrid-day-events') as HTMLElement | null
      if (!eventsContainer) continue

      const harnesses = Array.from(
        eventsContainer.querySelectorAll(':scope > .fc-daygrid-event-harness, :scope > .fc-daygrid-event-harness-abs')
      ) as HTMLElement[]
      const totalTasks = Math.max(taskCountByDate.get(dateStr) ?? 0, harnesses.length)
      const visibleCount = Math.min(totalTasks, visibleLimit)

      harnesses.forEach((harness, index) => {
        harness.style.display = index >= visibleCount ? 'none' : ''
      })

      const remaining = Math.max(0, totalTasks - visibleLimit)
      const shouldShowControl = remaining > 0 || (weekExpanded && totalTasks > COLLAPSED_LIMIT)
      const existingControl = eventsContainer.querySelector('.fc-show-more-less-btn') as HTMLButtonElement | null
      if (!shouldShowControl) {
        if (existingControl) existingControl.remove()
        continue
      }

      const control = existingControl ?? document.createElement('button')
      control.type = 'button'
      control.className = 'fc-show-more-less-btn mt-1 block w-full text-left text-[11px] text-gray-500 hover:text-gray-700 underline'
      control.setAttribute('data-calendar-control', 'show-more')
      control.textContent = remaining > 0 ? `+${remaining} more` : 'Show less'
      control.dataset.date = dateStr
      control.dataset.weekKey = weekKey

      if (!existingControl) {
        const onMouseDown = (ev: MouseEvent) => {
          ev.preventDefault()
          ev.stopPropagation()
          ;(ev as any).nativeEvent?.stopImmediatePropagation?.()
          ;(ev as any).stopImmediatePropagation?.()
        }
        const onClick = (ev: MouseEvent) => {
          ev.preventDefault()
          ev.stopPropagation()
          ;(ev as any).nativeEvent?.stopImmediatePropagation?.()
          ;(ev as any).stopImmediatePropagation?.()
          const target = ev.currentTarget as HTMLButtonElement
          const wk = target.dataset.weekKey
          if (!wk) return
          if (target.textContent === 'Show less') {
            collapseWeek(wk)
          } else {
            const dateStrForDay = target.dataset.date
            if (!dateStrForDay) return
            const dayTaskCount = taskCountByDate.get(dateStrForDay) ?? 0
            expandWeekToAtLeast(wk, dayTaskCount)
          }
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (target.dataset.date) debugExpandState(target.dataset.date)
            })
          })
        }
        control.addEventListener('mousedown', onMouseDown)
        control.addEventListener('click', onClick)
      }

      if (!existingControl) {
        eventsContainer.appendChild(control)
      }
    }

    const weekRows = Array.from(root.querySelectorAll('.fc-daygrid-body tbody tr')) as HTMLElement[]
    const minRowHeight = isMobile ? MIN_WEEK_ROW_HEIGHT_MOBILE : MIN_WEEK_ROW_HEIGHT
    for (const weekRow of weekRows) {
      weekRow.style.removeProperty('height')
      const dayFrames = Array.from(weekRow.querySelectorAll('.fc-daygrid-day-frame')) as HTMLElement[]
      let maxFrameHeight = 0
      for (const frame of dayFrames) {
        maxFrameHeight = Math.max(maxFrameHeight, frame.scrollHeight)
      }
      const rowHeight = Math.max(minRowHeight, maxFrameHeight)
      weekRow.style.setProperty('height', `${rowHeight}px`, 'important')
    }
  }, [COLLAPSED_LIMIT, MIN_WEEK_ROW_HEIGHT, MIN_WEEK_ROW_HEIGHT_MOBILE, collapseWeek, debugExpandState, expandWeekToAtLeast, getWeekKeyForDateString, isMobile, taskCountByDate])

  const scheduleCalendarLayoutSync = useCallback(() => {
    if (layoutSyncRafRef.current != null) {
      cancelAnimationFrame(layoutSyncRafRef.current)
    }
    layoutSyncRafRef.current = requestAnimationFrame(() => {
      layoutSyncRafRef.current = null
      syncExpandedDayCellsAndWeekRows()
      const api = calendarRef.current?.getApi?.()
      if (api?.updateSize) {
        requestAnimationFrame(() => {
          api.updateSize()
        })
      }
    })
  }, [syncExpandedDayCellsAndWeekRows])

  // --- Color mode logic ---
  const [colorMode, setColorMode] = useState<'contentType' | 'assignedTo' | 'project' | 'status'>('contentType');
  const COLOR_PALETTE = [
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
    'bg-fuchsia-200 text-fuchsia-900',
    'bg-amber-200 text-amber-900',
  ];

  const getColorKey = useCallback((task: Task) => {
    if (colorMode === 'assignedTo') return String(task.users?.full_name || task.assigned_to_id || 'unassigned');
    if (colorMode === 'project') {
      const projectName = Array.isArray(task.projects) ? task.projects[0]?.name : task.projects?.name;
      return String(projectName || task.project_id_int || 'no-project');
    }
    if (colorMode === 'status') return String(task.project_status_name || 'no-status');
    if (colorMode === 'contentType') return String((task.content_types?.[0]?.title) || task.content_type_id || 'no-content-type');
    return 'none';
  }, [colorMode]);

  const getColorLabel = useCallback((task: Task) => {
    if (colorMode === 'assignedTo') return task.users?.full_name || (task.assigned_to_id ? String(task.assigned_to_id) : 'Unassigned');
    if (colorMode === 'project') {
      const projectName = Array.isArray(task.projects) ? task.projects[0]?.name : task.projects?.name;
      return projectName || 'No project';
    }
    if (colorMode === 'status') return task.project_status_name || 'No status';
    if (colorMode === 'contentType') return (task.content_types?.[0]?.title) || task.content_type_id || 'No content type';
    return '—';
  }, [colorMode]);

  // Deterministic hash to keep color stable across scrolling/filtering.
  const getStablePaletteClass = useCallback((key: string) => {
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
      hash = ((hash << 5) - hash) + key.charCodeAt(i);
      hash |= 0;
    }
    const index = Math.abs(hash) % COLOR_PALETTE.length;
    return COLOR_PALETTE[index] || 'bg-gray-100 text-gray-900';
  }, [COLOR_PALETTE]);

  const getColorClass = (task: Task) => {
    const key = getColorKey(task);
    return getStablePaletteClass(key);
  };

  const colorLegendEntries = useMemo(() => {
    const seen = new Set<string>();
    const list: { key: string; label: string; colorClass: string }[] = [];
    for (const task of filteredTasks ?? []) {
      const key = getColorKey(task);
      if (!key || key === 'none' || seen.has(key)) continue;
      seen.add(key);
      list.push({
        key,
        label: getColorLabel(task),
        colorClass: getStablePaletteClass(key),
      });
    }
    list.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    return list.slice(0, 20);
  }, [filteredTasks, getColorKey, getColorLabel, getStablePaletteClass]);

  // For status mode, use project_statuses.color as inline style
  const getStatusStyle = (task: Task) => {
    if (colorMode === 'status' && task.project_statuses?.color) {
      return { background: task.project_statuses.color, color: '#222' };
    }
    return undefined;
  };

  // Custom event rendering: use CalendarTaskCard
  const renderEventContent = (eventInfo: { event: { extendedProps: { task: Task }; title: string } }) => {
    const task = eventInfo.event.extendedProps.task;
    const colorClass = getColorClass(task);
    const selectedEntityType = params.get('itemKind') === 'suggestion' ? 'suggestion' : 'task'
    const rowEntityType = String((task as any).entity_type ?? ((task as any).kind === 'suggestion' ? 'suggestion' : 'task'))
    const rowEntityId = String((task as any).entity_id ?? (task as any).id)
    const isSelected = !!selectedTaskId && selectedEntityType === rowEntityType && String(selectedTaskId) === rowEntityId;
    const style =
      colorMode === 'status' && task.project_statuses?.color
        ? { background: task.project_statuses.color, color: '#222' }
      : colorMode === 'project' && task.projects?.color
        ? { background: task.projects.color, color: '#222' }
        : undefined;
    return (
      <CalendarTaskCard
        task={task}
        colorClass={colorClass}
        onClick={() => onTaskClick?.(task)}
        isSelected={isSelected}
        style={style}
      />
    );
  };

  // Debounced function to batch update multiple task dates
  const processPendingUpdates = async () => {
    if (pendingUpdates.current.size === 0) return;
    
    const updates = Array.from(pendingUpdates.current.entries());
    pendingUpdates.current.clear();
    
    try {
      // Process all updates in parallel
      const updatePromises = updates.map(async ([taskId, { dateField, newDate }]) => {
        return updateTaskDate(taskId, dateField as 'delivery_date' | 'publication_date', newDate);
      });
      
      await Promise.all(updatePromises);
      
      // Invalidate calendar chunks after all updates are complete
      await queryClient.invalidateQueries({ queryKey: ['tasks', 'calendar-chunk'] });
      await queryClient.invalidateQueries({ queryKey: ['task'] });
      typesenseQuery.updateTaskInList({ id: updates[0][0], ...updates[0][1].task }); // Assuming first update is representative for typesense
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[CalendarView] Successfully processed', updates.length, 'task updates');
      }
    } catch (err) {
      console.error('Failed to process task updates:', err);
      // Revert optimistic updates on error
      updates.forEach(([taskId]) => {
        queryClient.invalidateQueries({ queryKey: ['tasks', 'calendar-chunk'] });
        queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      });
    }
  };

  // Drag-and-drop handler: update task optimistically and queue for debounced database update
  const handleEventDrop = async (info: any) => {
    const taskId = Number(info.event.extendedProps?.task?.id ?? info.event.id);
    const newDate = info.event.startStr;
    
    // Get the current task data from the event
    const currentTask = info.event.extendedProps.task;
    if ((currentTask as any)?.kind === 'suggestion') {
      info.revert();
      return;
    }
    if (!currentTask) {
      console.error('No task data found in event');
      info.revert();
      return;
    }
    
    // Create updated task with new date
    const updatedTask = {
      ...currentTask,
      [dateField]: newDate,
    };
    
    // Optimistically update all caches immediately
    updateTaskInCaches(queryClient, updatedTask);
    console.log('[CalendarView] Calling Typesense updater with:', updatedTask);
    getTypesenseUpdater()?.(updatedTask);
    if (onOptimisticUpdate) onOptimisticUpdate(updatedTask);
    
    // Add to pending updates
    pendingUpdates.current.set(taskId, {
      dateField,
      newDate,
      task: currentTask
    });
    
    // Clear existing timeout and set new one
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    // Debounce database updates by 500ms
    updateTimeoutRef.current = setTimeout(() => {
      processPendingUpdates();
    }, 500);
  };

  // Handler for filter changes: update URL
  const handleFilterChange = (newFilters: any) => {
    const newParams = new URLSearchParams(params.toString());
    Object.entries(newFilters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        if (value.length > 0) newParams.set(key, value.join(','));
        else newParams.delete(key);
      } else if (typeof value === 'object' && value !== null) {
        const { from, to } = value as { from?: string; to?: string };
        if (from) newParams.set(`${key}From`, from);
        else newParams.delete(`${key}From`);
        if (to) newParams.set(`${key}To`, to);
        else newParams.delete(`${key}To`);
      }
    });
    router.replace(`?${newParams.toString()}`);
  };

  // Handlers for header bar - use non-blocking composer
  const handleAddTaskClick = () => {
    openComposer();
  };

  // --- Calendar header controls ---
  const pillButton =
    'inline-flex items-center gap-1 px-3 py-1 rounded-full border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition shadow-none focus:ring-2 focus:ring-blue-200 focus:outline-none';

  // Date field dropdown
  const [dateFieldOpen, setDateFieldOpen] = useState(false);
  // Month navigation and picker
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  // Month/year picker logic
  const months = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString('default', { month: 'long' }));
  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i);
  // Month navigation handlers and label
  const handlePrevMonth = () => shiftCalendarByWeeks(-4);
  const handleNextMonth = () => shiftCalendarByWeeks(4);
  const handleTodayClick = () => {
    const today = new Date();
    setCalendarViewDate(new Date(today));
  };
  const monthLabel = visibleMonth.toLocaleString('default', { month: 'short', year: 'numeric' });
  const colorModeLabel = colorMode === 'contentType' ? 'Content Type' : colorMode === 'assignedTo' ? 'Assigned To' : colorMode === 'project' ? 'Project' : 'Status';

  const anchorScrollToToday = useCallback(() => {
    const el = calendarContainerRef.current
    if (!el) return false
    const todayStr = new Date().toISOString().slice(0, 10)
    const todayCell = el.querySelector(`.fc-daygrid-body td[data-date="${todayStr}"]`) as HTMLElement | null
    if (!todayCell) return false
    const todayRow = todayCell.closest('tr') as HTMLElement | null
    if (!todayRow) return false
    const rootRect = el.getBoundingClientRect()
    const rowRect = todayRow.getBoundingClientRect()
    const desiredTop = rootRect.top + el.clientHeight * 0.33
    const delta = rowRect.top - desiredTop
    el.scrollTop = Math.max(0, el.scrollTop + delta)
    lastScrollTopRef.current = el.scrollTop
    isScrollInitializedRef.current = true
    hasInitialAnchoredRef.current = true
    anchorSettledAtRef.current = Date.now()
    return true
  }, [])

  const handleCalendarDatesSet = useCallback((arg: any) => {
    const newDate = new Date(arg.view.currentStart)
    setVisibleMonth((prev) => {
      if (newDate.toISOString().slice(0, 10) === prev.toISOString().slice(0, 10)) return prev
      return newDate
    })
    if (pendingRebaseRef.current) {
      requestAnimationFrame(() => {
        const api = calendarRef.current?.getApi?.()
        if (api?.updateSize) {
          api.updateSize()
        }
        requestAnimationFrame(() => {
          completePendingRebase('dates-set')
        })
      })
    }
    if (hasInitialAnchoredRef.current) return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const anchored = anchorScrollToToday()
        if (!anchored) {
          window.setTimeout(() => {
            if (!hasInitialAnchoredRef.current) {
              anchorScrollToToday()
            }
          }, 120)
        }
      })
    })
  }, [anchorScrollToToday, completePendingRebase])

  useEffect(() => {
    expandedWeekLimitRef.current = expandedWeekLimit
  }, [expandedWeekLimit])

  useEffect(() => {
    scheduleCalendarLayoutSync()
  }, [events, expandedWeekLimit, scheduleCalendarLayoutSync])

  // --- Render ---
  // Add dayCellClassNames to highlight selected and today
  const dayCellClassNames = (arg: any) => {
    const classes = [];
    const dateStr = arg.date.toISOString().slice(0, 10);
    if (selectedDate && dateStr === selectedDate) classes.push('fc-day-selected');
    // today is handled by FullCalendar's fc-day-today, but we will override its style
    return classes;
  };
  // Only show day-task pane when open and a date is selected
  const showDayTaskPane = false;

  // --- Sync calendar to selected task's date when selectedTask changes ---
  useEffect(() => {
    if (!selectedTask) return;
    const dateStr = selectedTask.delivery_date || selectedTask.publication_date;
    if (!dateStr) return;
    const date = new Date(dateStr);
    if (
      visibleMonth.getFullYear() !== date.getFullYear() ||
      visibleMonth.getMonth() !== date.getMonth()
    ) {
      setCalendarViewDate(new Date(date.getFullYear(), date.getMonth(), 1));
    }
    // Only run this effect once per selectedTask
    // eslint-disable-next-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTask]);

  // Cleanup: process any pending updates when component unmounts
  useEffect(() => {
    return () => {
      if (rebaseFallbackTimerRef.current != null) {
        window.clearTimeout(rebaseFallbackTimerRef.current)
        rebaseFallbackTimerRef.current = null
      }
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
      }
      if (layoutSyncRafRef.current != null) {
        cancelAnimationFrame(layoutSyncRafRef.current)
        layoutSyncRafRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      if (activeInlineRef.current) {
        activeInlineRef.current.remove()
        activeInlineRef.current = null
      }
      stopDragAutoScroll()
      isDraggingEventRef.current = false
      dragPointerYRef.current = null
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      // Process any remaining updates
      if (pendingUpdates.current.size > 0) {
        processPendingUpdates();
      }
    };
  }, [stopDragAutoScroll]);

  // Visual debugging
  console.log('[CalendarView] Render:', { enabled, isLoading, tasksCount: tasks?.length, filteredTasksCount: filteredTasks?.length, eventsCount: events?.length })

  return (
    <section className="w-full h-[100dvh] flex flex-col gap-0 overflow-hidden">
      <div
        className="flex gap-2 items-center flex-nowrap overflow-x-auto overflow-y-hidden whitespace-nowrap scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent px-0 md:px-4 py-2 min-h-[56px] w-full bg-white sticky top-0 z-10 border-b border-gray-100 shrink-0"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Month navigation */}
        <button className={pillButton} onClick={handlePrevMonth} aria-label="Previous month" type="button">
          <ChevronLeft size={16} />
        </button>
        {/* Month/year pill dropdown */}
        <DropdownMenu open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
          <DropdownMenuTrigger asChild>
            <button className={pillButton + ' font-semibold text-base min-w-[100px] shrink-0'} type="button">
              {monthLabel} <ChevronDown size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="p-0 min-w-[180px]">
            <div className="flex">
              <div className="flex flex-col max-h-60 overflow-y-auto">
                {months.map((month, i) => (
                  <DropdownMenuItem
                    key={month}
                    onClick={() => {
                      setCalendarViewDate(new Date(visibleMonth.getFullYear(), i, 1));
                      setMonthPickerOpen(false);
                    }}
                    className={visibleMonth.getMonth() === i ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-50'}
                  >
                    {month}
                  </DropdownMenuItem>
                ))}
              </div>
              <div className="flex flex-col max-h-60 overflow-y-auto border-l border-gray-100">
                {years.map(year => (
                  <DropdownMenuItem
                    key={year}
                    onClick={() => {
                      setCalendarViewDate(new Date(year, visibleMonth.getMonth(), 1));
                      setMonthPickerOpen(false);
                    }}
                    className={visibleMonth.getFullYear() === year ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-50'}
                  >
                    {year}
                  </DropdownMenuItem>
                ))}
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <button className={pillButton} onClick={handleNextMonth} aria-label="Next month" type="button">
          <ChevronRight size={16} />
        </button>
        {/* Today button */}
        <button className={pillButton} onClick={handleTodayClick} aria-label="Go to today" type="button">
          Today
        </button>
        {/* Date field dropdown */}
        <DropdownMenu open={dateFieldOpen} onOpenChange={setDateFieldOpen}>
          <DropdownMenuTrigger asChild>
            <button className={pillButton + ' min-w-[140px]'} type="button">
              {dateField === 'delivery_date' ? 'Delivery Date' : 'Publication Date'} <ChevronDown size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => { 
              const newParams = writeParam(new URLSearchParams(params.toString()), 'calendar_date_field', 'delivery');
              router.replace(`?${newParams.toString()}`);
              setDateFieldOpen(false);
            }}>Delivery Date</DropdownMenuItem>
            <DropdownMenuItem onClick={() => { 
              const newParams = writeParam(new URLSearchParams(params.toString()), 'calendar_date_field', 'publication');
              router.replace(`?${newParams.toString()}`);
              setDateFieldOpen(false);
            }}>Publication Date</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Subtasks toggle */}
        <span className="mx-2 text-gray-200 select-none">|</span>
        <button
          className={pillButton + (showSubtasks ? ' bg-blue-600 text-white border-blue-600' : '')}
          onClick={() => {
            const newParams = writeParam(new URLSearchParams(params.toString()), 'calendar_show_subtasks', !showSubtasks);
            router.replace(`?${newParams.toString()}`);
          }}
          type="button"
        >
          Subtasks
        </button>
        {/* Color code pill + legend */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={pillButton + ' min-w-[11rem] shrink-0 whitespace-nowrap'} type="button">
              Color: {colorModeLabel} <ChevronDown size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[200px]">
            <DropdownMenuItem onClick={() => setColorMode('contentType')}>Content Type</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setColorMode('assignedTo')}>Assigned To</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setColorMode('project')}>Project</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setColorMode('status')}>Status</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Color legend pill: color + what it stands for */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={pillButton + ' min-w-[5rem] shrink-0'} type="button">
              Legend <ChevronDown size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px] max-h-[min(60vh,400px)] overflow-y-auto">
            <div className="px-2 py-1.5 text-[11px] text-gray-500 border-b border-gray-100">
              Colors = {colorModeLabel}
            </div>
            {colorLegendEntries.length === 0 ? (
              <div className="px-2 py-3 text-gray-400 text-sm">No items yet</div>
            ) : (
              <div className="py-1">
                {colorLegendEntries.map(({ key, label, colorClass }) => (
                  <div key={key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50">
                    <span className={`inline-block w-3 h-3 rounded-sm shrink-0 ${colorClass}`} aria-hidden />
                    <span className="truncate text-sm">{label}</span>
                  </div>
                ))}
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Expand/restore button slot (right-aligned) */}
        <div className="flex-1" />
        {expandButton}
      </div>
      {isMobile ? (
        // Mobile layout: Calendar on top (50% height), task table below (50% height)
        <div className="flex-1 flex flex-col min-h-0">
          <div
            ref={calendarContainerRef}
            className="flex-1 min-h-0 flex flex-col py-4 px-0 overflow-y-auto overscroll-contain"
            onScroll={handleCalendarScroll}
            onWheelCapture={handleCalendarWheelCapture}
          >
            <div className="flex-1 min-h-0 w-full">
        <style>{`
              /* Minimalist FullCalendar overrides */
              .fc {
                font-family: inherit;
                background: #fff;
                color: #222;
          }
              /* Remove all borders and backgrounds from day cells */
          .fc .fc-daygrid-day-frame {
                background: transparent !important;
                border: none !important;
                border-radius: 0 !important;
                box-shadow: none;
                transition: background 0.2s;
              }
              /* Stronger selector for selected task's day highlight (rectangle, always visible) */
              .fc .fc-daygrid-day.fc-day-selected-task .fc-daygrid-day-frame {
                background: #f3f4f6 !important; /* Tailwind bg-gray-100 */
                border-radius: 0 !important;
              }
              /* Remove yellow background and border for today */
              .fc .fc-daygrid-day.fc-day-today,
              .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-frame {
                background: #fff !important;
                border: none !important;
              }
              .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number {
                background: #111 !important;
                color: #fff !important;
                border-radius: 9999px;
                padding: 0.1rem 0.5rem;
                display: inline-block;
                border: none !important;
              }
              /* Selected date: gray ball, no border */
              .fc .fc-daygrid-day.fc-day-selected .fc-daygrid-day-number {
                background: #f3f4f6 !important;
                color: #222 !important;
                border-radius: 9999px;
                padding: 0.1rem 0.5rem;
                display: inline-block;
                border: none !important;
              }
              .fc .fc-daygrid-day.fc-day-selected,
              .fc .fc-daygrid-day.fc-day-selected .fc-daygrid-day-frame {
                background: #fff !important;
                border: none !important;
              }
              .fc .fc-daygrid-day.fc-day-other .fc-daygrid-day-frame {
                background: #fafbfc;
                color: #cbd5e1;
              }
              /* Center day numbers in calendar cells */
              .fc .fc-daygrid-day-number {
                text-align: center !important;
                display: block !important;
                width: 100% !important;
              }
              /* Override for today's day number to be a black circle - STRONGER */
              .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number,
              .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-top .fc-daygrid-day-number {
                width: 1.5rem !important;
                display: inline-block !important;
                text-align: center !important;
                background: #111 !important;
                color: #fff !important;
                border-radius: 9999px !important;
                padding: 0.25rem 0 !important;
                border: none !important;
                position: relative !important;
                z-index: 10 !important;
                height: 1.5rem !important;
                line-height: 1rem !important;
              }
              /* Center the day top container for today */
              .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-top {
                text-align: center !important;
                justify-content: center !important;
                display: flex !important;
              }
              /* Mobile: no scroller clipping; event wrappers grow to card height; day cell uncap + min height */
              @media (max-width: 768px) {
                .fc .fc-scroller,
                .fc .fc-scroller-harness,
                .fc .fc-scroller-liquid-absolute {
                  overflow: visible !important;
                }
                .fc .fc-daygrid-event-harness,
                .fc .fc-daygrid-event,
                .fc .fc-h-event,
                .fc .fc-event-main,
                .fc .fc-event-main-frame {
                  height: auto !important;
                  max-height: none !important;
                  overflow: visible !important;
                }
                .fc .fc-daygrid-day,
                .fc .fc-daygrid-day-frame,
                .fc .fc-daygrid-day-events {
                  max-height: none !important;
                  min-height: 200px !important;
                  overflow: visible !important;
                }
                .fc .fc-daygrid-body tr {
                  min-height: 200px !important;
                }
                .fc .fc-col-header-cell {
                  font-size: 0.75rem !important;
                  font-weight: 500 !important;
                  color: #6b7280 !important;
                }
                .fc .fc-daygrid-day-number {
                  font-size: 0.875rem !important;
                }
              }
              /* Remove all partial borders from day cells */
              .fc .fc-scrollgrid,
              .fc .fc-scrollgrid-section,
              .fc .fc-scrollgrid-sync-table,
              .fc .fc-col-header-cell {
                border: none !important;
              }
              /* Remove outer border on right and bottom sides of calendar */
              .fc .fc-scrollgrid {
                border-right: none !important;
                border-bottom: none !important;
              }
              .fc .fc-scrollgrid-section,
              .fc .fc-scrollgrid-sync-table {
                border-right: none !important;
                border-bottom: none !important;
              }
              /* Remove right border from last column header and last day cell in each row */
              .fc .fc-col-header-cell:last-child {
                border-right: none !important;
              }
              .fc .fc-daygrid-day:last-child {
                border-right: none !important;
              }
              /* Remove bottom border from all day cells in the last row */
              .fc .fc-daygrid-row:last-child .fc-daygrid-day {
                border-bottom: none !important;
              }
              .fc .fc-daygrid-day-events {
                margin-top: 0.25rem;
              }
              /* Prevent FullCalendar default blue bar placeholders before custom React event content mounts */
              .fc .fc-event,
              .fc .fc-daygrid-event,
              .fc .fc-h-event {
                background: transparent !important;
                border: none !important;
              }
              .fc .fc-daygrid-event .fc-event-main,
              .fc .fc-event .fc-event-main {
                padding: 0 !important;
              }
              /* Desktop: prevent FullCalendar from becoming the scroll container; outer calendarContainerRef is the only scroll */
              @media (min-width: 769px) {
                .fc .fc-scroller,
                .fc .fc-scroller-harness,
                .fc .fc-scroller-liquid-absolute {
                  overflow: visible !important;
                  height: auto !important;
                }
              }
              /* Expanded day: no cap, visible overflow on full ancestor chain (day cell / frame can have FC inline 160px) */
              .fc .fc-daygrid-day.fc-day-expanded,
              .fc .fc-daygrid-day.fc-day-expanded .fc-daygrid-day-frame,
              .fc .fc-daygrid-day.fc-day-expanded .fc-scrollgrid-sync-inner,
              .fc .fc-daygrid-day.fc-day-expanded .fc-daygrid-day-top,
              .fc .fc-daygrid-day.fc-day-expanded .fc-daygrid-day-bottom {
                max-height: none !important;
                height: auto !important;
                overflow: visible !important;
              }
              .fc .fc-daygrid-day.fc-day-expanded .fc-daygrid-day-events {
                max-height: none !important;
                overflow: visible !important;
              }
              .calendar-rebasing .fc .fc-daygrid-event-harness-abs,
              .calendar-rebasing .fc .fc-event-mirror {
                visibility: hidden !important;
              }
              /* Remove right border from last th/td in each row and bottom border from last row's td */
              .fc .fc-scrollgrid table th:last-child,
              .fc .fc-scrollgrid table td:last-child {
                border-right: none !important;
              }
              .fc .fc-daygrid-row:last-child td {
                border-bottom: none !important;
              }
              /* Remove all outer borders, box-shadows, and outlines from FullCalendar and its containers */
              .fc .fc-scrollgrid,
              .fc .fc-scrollgrid-section,
              .fc .fc-scrollgrid-sync-table,
              .fc .fc-scrollgrid thead,
              .fc .fc-scrollgrid tbody,
              .fc .fc-scrollgrid table,
              .fc .fc-scrollgrid th,
              .fc .fc-scrollgrid td,
              .fc .fc-daygrid-day-frame,
              .fc .fc-daygrid-day,
              .fc .fc-col-header-cell,
              .fc .fc-daygrid-row,
              .fc .fc-daygrid,
              .fc .fc-view-harness,
              .fc .fc-view,
              .fc {
                border: none !important;
                box-shadow: none !important;
                outline: none !important;
              }
              /* Internal light gray borders for calendar grid */
              .fc .fc-scrollgrid table th,
              .fc .fc-scrollgrid table td {
                border: 1px solid #e5e7eb !important;
              }
              /* Remove border-top for first row */
              .fc .fc-scrollgrid table tr:first-child th,
              .fc .fc-scrollgrid table tr:first-child td {
                border-top: none !important;
              }
              /* Remove border-left for first column */
              .fc .fc-scrollgrid table th:first-child,
              .fc .fc-scrollgrid table td:first-child {
                border-left: none !important;
              }
              /* Remove border-right for last column */
              .fc .fc-scrollgrid table th:last-child,
              .fc .fc-scrollgrid table td:last-child {
                border-right: none !important;
              }
              /* Remove border-bottom for last row */
              .fc .fc-daygrid-row:last-child td {
                border-bottom: none !important;
          }
              /* Fix right-side gap: force FC grid tables to fill available width */
              .fc,
              .fc .fc-view-harness,
              .fc .fc-scrollgrid,
              .fc .fc-scrollgrid table,
              .fc .fc-scrollgrid-section-liquid > td,
              .fc .fc-scroller-harness,
              .fc .fc-scroller-liquid-absolute,
              .fc .fc-daygrid-body,
              .fc .fc-daygrid-body table {
                width: 100% !important;
                min-width: 100% !important;
                box-sizing: border-box !important;
              }
              .fc .fc-scrollgrid table,
              .fc .fc-daygrid-body table {
                border-collapse: collapse !important;
                border-spacing: 0 !important;
                table-layout: fixed !important;
              }
              /* Reserve identical header space for every day cell; align day number; consistent events start */
              .fc .fc-daygrid-day-top {
                position: relative !important;
                height: 28px !important;
                display: block !important;
                padding: 0 !important;
                margin: 0 !important;
              }
              .fc .fc-daygrid-day-number {
                position: absolute !important;
                top: 4px !important;
                left: 50% !important;
                transform: translateX(-50%) !important;
                margin: 0 !important;
              }
              .fc .fc-daygrid-day-top .fc-daygrid-day-number,
              .fc .fc-daygrid-day-top .fc-daygrid-day-number * {
                line-height: 1 !important;
              }
              .fc .fc-daygrid-day-events {
                margin-top: 0 !important;
                padding-top: 4px !important;
              }
        `}</style>
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="rollingWeeks"
                views={{
                  rollingWeeks: {
                    type: 'dayGrid',
                    duration: { weeks: 12 },
                    dateIncrement: { weeks: 1 },
                  },
                }}
                events={events}
                eventDisplay="block"
                progressiveEventRendering={false}
                datesSet={handleCalendarDatesSet}
                headerToolbar={false}
                eventContent={renderEventContent}
                eventDrop={handleEventDrop}
                eventDragStart={handleEventDragStart}
                eventDragStop={handleEventDragStop}
                dragScroll={true}
                editable
                dayMaxEvents={false}
                dayMaxEventRows={false}
                expandRows={true}
                fixedWeekCount={false}
                height="100%"
                contentHeight="100%"
                dayCellDidMount={dayCellDidMount}
                dayCellWillUnmount={dayCellWillUnmount}
                dayHeaderFormat={isMobile ? { weekday: 'narrow' } : { weekday: 'short' }}
              />
            </div>
          </div>
          
          {/* Mobile task table - always visible below calendar */}
          {selectedDate && (
            <div className="h-1/2 border-t border-gray-200 bg-white flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
                <div className="font-semibold text-base">
                  Tasks for {formatDateForDisplay(selectedDate || '')}
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                {filteredTasks.filter(task => {
                  const taskDate = task[dateField]
                  if (!taskDate) return false
                  // Convert to string if it's a Date object, then get the date part (YYYY-MM-DD)
                  const dateStr = typeof taskDate === 'string' 
                    ? taskDate.slice(0, 10) 
                    : new Date(taskDate).toISOString().slice(0, 10)
                  return dateStr === selectedDate
                }).length === 0 ? (
                  <div className="text-center text-gray-500 py-8">No tasks found</div>
                ) : (
                  <div>
                    {filteredTasks.filter(task => {
                      const taskDate = task[dateField]
                      if (!taskDate) return false
                      // Convert to string if it's a Date object, then get the date part (YYYY-MM-DD)
                      const dateStr = typeof taskDate === 'string' 
                        ? taskDate.slice(0, 10) 
                        : new Date(taskDate).toISOString().slice(0, 10)
                      return dateStr === selectedDate
                    }).map((row: any) => {
                      return (
                        <CalendarMobileTaskCard
                          key={row.id}
                          task={row}
                          isSelected={!!(selectedTaskId && String(row.id) === String(selectedTaskId))}
                          onTaskClick={onTaskClick}
                          isMainTask={row.content_type_id === 39 || row.content_type_id === "39"}
                          isExpanded={false}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        // Desktop layout: Use panels
      <PanelGroup direction="vertical" className="flex-1 min-h-0 h-full">
        <Panel minSize={20} defaultSize={showDayTaskPane ? 66 : 100} collapsible={false} className="flex-1 min-h-0 flex flex-col">
          <div
            ref={calendarContainerRef}
            className={`flex-1 min-h-0 flex flex-col p-4 md:p-0 overflow-y-auto overscroll-contain${isRebasingVisual ? ' calendar-rebasing' : ''}`}
            onScroll={handleCalendarScroll}
            onWheelCapture={handleCalendarWheelCapture}
          >
            <div className="flex-1 min-h-0 w-full">
        <style>{`
              /* Minimalist FullCalendar overrides */
              .fc {
                font-family: inherit;
                background: #fff;
                color: #222;
          }
              /* Remove all borders and backgrounds from day cells */
          .fc .fc-daygrid-day-frame {
                background: transparent !important;
                border: none !important;
                border-radius: 0 !important;
                box-shadow: none;
                transition: background 0.2s;
              }
              /* Stronger selector for selected task's day highlight (rectangle, always visible) */
              .fc .fc-daygrid-day.fc-day-selected-task .fc-daygrid-day-frame {
                background: #f3f4f6 !important; /* Tailwind bg-gray-100 */
                border-radius: 0 !important;
              }
              /* Remove yellow background and border for today */
              .fc .fc-daygrid-day.fc-day-today,
              .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-frame {
                background: #fff !important;
                border: none !important;
              }
              .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number {
                background: #111 !important;
                color: #fff !important;
                border-radius: 9999px;
                padding: 0.1rem 0.5rem;
                display: inline-block;
                border: none !important;
              }
              /* Selected date: gray ball, no border */
              .fc .fc-daygrid-day.fc-day-selected .fc-daygrid-day-number {
                background: #f3f4f6 !important;
                color: #222 !important;
                border-radius: 9999px;
                padding: 0.1rem 0.5rem;
                display: inline-block;
                border: none !important;
              }
              .fc .fc-daygrid-day.fc-day-selected,
              .fc .fc-daygrid-day.fc-day-selected .fc-daygrid-day-frame {
                background: #fff !important;
                border: none !important;
              }
              .fc .fc-daygrid-day.fc-day-other .fc-daygrid-day-frame {
                background: #fafbfc;
                color: #cbd5e1;
              }
                /* Center day numbers in calendar cells */
                .fc .fc-daygrid-day-number {
                  text-align: center !important;
                  display: block !important;
                  width: 100% !important;
                }
                /* Override for today's day number to be a black circle - STRONGER */
                .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number,
                .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-top .fc-daygrid-day-number {
                  width: 1.5rem !important;
                  display: inline-block !important;
                  text-align: center !important;
                  background: #111 !important;
                  color: #fff !important;
                  border-radius: 9999px !important;
                  padding: 0.25rem 0 !important;
                  border: none !important;
                  position: relative !important;
                  z-index: 10 !important;
                  height: 1.5rem !important;
                  line-height: 1rem !important;
                }
                /* Center the day top container for today */
                .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-top {
                  text-align: center !important;
                  justify-content: center !important;
                  display: flex !important;
                }
                /* Mobile-specific weekday styling */
                @media (max-width: 768px) {
                  .fc .fc-scroller,
                  .fc .fc-scroller-harness,
                  .fc .fc-scroller-liquid-absolute {
                    overflow: visible !important;
                  }
                  .fc .fc-daygrid-event-harness,
                  .fc .fc-daygrid-event,
                  .fc .fc-h-event,
                  .fc .fc-event-main,
                  .fc .fc-event-main-frame {
                    height: auto !important;
                    max-height: none !important;
                    overflow: visible !important;
                  }
                  .fc .fc-daygrid-day,
                  .fc .fc-daygrid-day-frame,
                  .fc .fc-daygrid-day-events {
                    max-height: none !important;
                    min-height: 200px !important;
                    overflow: visible !important;
                  }
                  .fc .fc-daygrid-body tr {
                    min-height: 200px !important;
                  }
                  .fc .fc-col-header-cell {
                    font-size: 0.75rem !important;
                    font-weight: 500 !important;
                    color: #6b7280 !important;
                  }
                  .fc .fc-daygrid-day-number {
                    font-size: 0.875rem !important;
                  }
                }
              /* Remove all partial borders from day cells */
              .fc .fc-scrollgrid,
              .fc .fc-scrollgrid-section,
              .fc .fc-scrollgrid-sync-table,
              .fc .fc-col-header-cell {
                border: none !important;
              }
              /* Remove outer border on right and bottom sides of calendar */
              .fc .fc-scrollgrid {
                border-right: none !important;
                border-bottom: none !important;
              }
              .fc .fc-scrollgrid-section,
              .fc .fc-scrollgrid-sync-table {
                border-right: none !important;
                border-bottom: none !important;
              }
              /* Remove right border from last column header and last day cell in each row */
              .fc .fc-col-header-cell:last-child {
                border-right: none !important;
              }
              .fc .fc-daygrid-day:last-child {
                border-right: none !important;
              }
              /* Remove bottom border from all day cells in the last row */
              .fc .fc-daygrid-row:last-child .fc-daygrid-day {
                border-bottom: none !important;
              }
              .fc .fc-daygrid-day-events {
                margin-top: 0.25rem;
              }
              /* Prevent FullCalendar default blue bar placeholders before custom React event content mounts */
              .fc .fc-event,
              .fc .fc-daygrid-event,
              .fc .fc-h-event {
                background: transparent !important;
                border: none !important;
              }
              .fc .fc-daygrid-event .fc-event-main,
              .fc .fc-event .fc-event-main {
                padding: 0 !important;
              }
              /* Desktop: prevent FullCalendar from becoming the scroll container; outer calendarContainerRef is the only scroll */
              @media (min-width: 769px) {
                .fc .fc-scroller,
                .fc .fc-scroller-harness,
                .fc .fc-scroller-liquid-absolute {
                  overflow: visible !important;
                  height: auto !important;
                }
              }
              /* Expanded day: no cap, visible overflow on full ancestor chain (day cell / frame can have FC inline 160px) */
              .fc .fc-daygrid-day.fc-day-expanded,
              .fc .fc-daygrid-day.fc-day-expanded .fc-daygrid-day-frame,
              .fc .fc-daygrid-day.fc-day-expanded .fc-scrollgrid-sync-inner,
              .fc .fc-daygrid-day.fc-day-expanded .fc-daygrid-day-top,
              .fc .fc-daygrid-day.fc-day-expanded .fc-daygrid-day-bottom {
                max-height: none !important;
                height: auto !important;
                overflow: visible !important;
              }
              .fc .fc-daygrid-day.fc-day-expanded .fc-daygrid-day-events {
                max-height: none !important;
                overflow: visible !important;
              }
              .calendar-rebasing .fc .fc-daygrid-event-harness-abs,
              .calendar-rebasing .fc .fc-event-mirror {
                visibility: hidden !important;
              }
              /* Remove right border from last th/td in each row and bottom border from last row's td */
              .fc .fc-scrollgrid table th:last-child,
              .fc .fc-scrollgrid table td:last-child {
                border-right: none !important;
              }
              .fc .fc-daygrid-row:last-child td {
                border-bottom: none !important;
              }
              /* Remove all outer borders, box-shadows, and outlines from FullCalendar and its containers */
              .fc .fc-scrollgrid,
              .fc .fc-scrollgrid-section,
              .fc .fc-scrollgrid-sync-table,
              .fc .fc-scrollgrid thead,
              .fc .fc-scrollgrid tbody,
              .fc .fc-scrollgrid table,
              .fc .fc-scrollgrid th,
              .fc .fc-scrollgrid td,
              .fc .fc-daygrid-day-frame,
              .fc .fc-daygrid-day,
              .fc .fc-col-header-cell,
              .fc .fc-daygrid-row,
              .fc .fc-daygrid,
              .fc .fc-view-harness,
              .fc .fc-view,
              .fc {
                border: none !important;
                box-shadow: none !important;
                outline: none !important;
              }
              /* Internal light gray borders for calendar grid */
              .fc .fc-scrollgrid table th,
              .fc .fc-scrollgrid table td {
                border: 1px solid #e5e7eb !important;
              }
              /* Remove border-top for first row */
              .fc .fc-scrollgrid table tr:first-child th,
              .fc .fc-scrollgrid table tr:first-child td {
                border-top: none !important;
              }
              /* Remove border-left for first column */
              .fc .fc-scrollgrid table th:first-child,
              .fc .fc-scrollgrid table td:first-child {
                border-left: none !important;
              }
              /* Remove border-right for last column */
              .fc .fc-scrollgrid table th:last-child,
              .fc .fc-scrollgrid table td:last-child {
                border-right: none !important;
              }
              /* Remove border-bottom for last row */
              .fc .fc-daygrid-row:last-child td {
                border-bottom: none !important;
          }
              /* Fix right-side gap: force FC grid tables to fill available width */
              .fc,
              .fc .fc-view-harness,
              .fc .fc-scrollgrid,
              .fc .fc-scrollgrid table,
              .fc .fc-scrollgrid-section-liquid > td,
              .fc .fc-scroller-harness,
              .fc .fc-scroller-liquid-absolute,
              .fc .fc-daygrid-body,
              .fc .fc-daygrid-body table {
                width: 100% !important;
                min-width: 100% !important;
                box-sizing: border-box !important;
              }
              .fc .fc-scrollgrid table,
              .fc .fc-daygrid-body table {
                border-collapse: collapse !important;
                border-spacing: 0 !important;
                table-layout: fixed !important;
              }
              /* Reserve identical header space for every day cell; align day number; consistent events start */
              .fc .fc-daygrid-day-top {
                position: relative !important;
                height: 28px !important;
                display: block !important;
                padding: 0 !important;
                margin: 0 !important;
              }
              .fc .fc-daygrid-day-number {
                position: absolute !important;
                top: 4px !important;
                left: 50% !important;
                transform: translateX(-50%) !important;
                margin: 0 !important;
              }
              .fc .fc-daygrid-day-top .fc-daygrid-day-number,
              .fc .fc-daygrid-day-top .fc-daygrid-day-number * {
                line-height: 1 !important;
              }
              .fc .fc-daygrid-day-events {
                margin-top: 0 !important;
                padding-top: 4px !important;
              }
        `}</style>
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="rollingWeeks"
                views={{
                  rollingWeeks: {
                    type: 'dayGrid',
                    duration: { weeks: 12 },
                    dateIncrement: { weeks: 1 },
                  },
                }}
                events={events}
                eventDisplay="block"
                progressiveEventRendering={false}
                datesSet={handleCalendarDatesSet}
                headerToolbar={false}
                eventContent={renderEventContent}
                eventDrop={handleEventDrop}
                eventDragStart={handleEventDragStart}
                eventDragStop={handleEventDragStop}
                dragScroll={true}
                editable
                dayMaxEvents={false}
                dayMaxEventRows={false}
                expandRows={true}
                fixedWeekCount={false}
                height="100%"
                contentHeight="100%"
                dayCellDidMount={dayCellDidMount}
                dayCellWillUnmount={dayCellWillUnmount}
                dayHeaderFormat={isMobile ? { weekday: 'narrow' } : { weekday: 'short' }}
              />
            </div>
          </div>
        </Panel>
        {showDayTaskPane && (
          <>
            <PanelResizeHandle className="relative flex items-center justify-center h-px bg-gray-200 cursor-row-resize">
              <div className="w-full h-px bg-gray-200" />
            </PanelResizeHandle>
            <Panel minSize={15} defaultSize={34} collapsible className="h-full">
              <div className="relative h-full px-4 md:px-0 py-4 bg-white border-t border-gray-200 shadow-sm flex flex-col">
                <div className="font-semibold text-lg mb-2">
                  Tasks for {formatDateForDisplay(selectedDate || '')}
                </div>
                <div className="overflow-x-auto flex-1">
                  <table className="border-collapse text-sm md:text-base w-full" style={{ tableLayout: 'fixed' }}>
                    <thead className="bg-white border-b shadow-sm">
                      <tr>
                        {CALENDAR_TASK_COLUMNS.map(col => (
                          <th key={col.key} className="px-3 py-2 text-left font-medium text-gray-500 border-r border-gray-200 select-none">
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasks.filter(task => {
                        const taskDate = task[dateField]
                        if (!taskDate) return false
                        // Convert to string if it's a Date object, then get the date part (YYYY-MM-DD)
                        const dateStr = typeof taskDate === 'string' 
                          ? taskDate.slice(0, 10) 
                          : new Date(taskDate).toISOString().slice(0, 10)
                        return dateStr === selectedDate
                      }).length === 0 ? (
                        <tr>
                          <td colSpan={CALENDAR_TASK_COLUMNS.length} className="text-center text-gray-500 py-8">No tasks found</td>
                        </tr>
                      ) : (
                        filteredTasks.filter(task => {
                          const taskDate = task[dateField]
                          if (!taskDate) return false
                          // Convert to string if it's a Date object, then get the date part (YYYY-MM-DD)
                          const dateStr = typeof taskDate === 'string' 
                            ? taskDate.slice(0, 10) 
                            : new Date(taskDate).toISOString().slice(0, 10)
                          return dateStr === selectedDate
                        }).map((row: any) => {
                          console.log('[Calendar Desktop] Full row data for task', row.id, ':', row);
                          return (
                            <tr key={row.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onTaskClick?.(row)}>
                              {CALENDAR_TASK_COLUMNS.map(col => (
                                <td key={col.key} className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">
                                  {col.render(row)}
                                </td>
                              ))}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <button
                  className="absolute top-2 right-2 bg-white rounded-full p-1 hover:bg-gray-100 focus:outline-none"
                  aria-label="Collapse day task pane"
                  onClick={() => setIsDayTaskPaneOpen(false)}
                  type="button"
                >
                  <PanelBottom className="w-5 h-5 text-gray-500" />
                </button>
      </div>
            </Panel>
          </>
        )}
      </PanelGroup>
      )}
      {/* Add Task uses TaskComposerTray (non-blocking) */}
      {/* Empty state message */}
        {!isLoading && (!filteredTasks || filteredTasks.length === 0) && (
        <div className="text-center text-gray-500 py-8">No tasks for this month.</div>
      )}
    </section>
  );
} 