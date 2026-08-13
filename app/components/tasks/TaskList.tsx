"use client"

import { useEffect, useLayoutEffect, useState, useMemo, useRef, useCallback } from "react"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  ColumnDef,
  flexRender,
  RowSelectionState,
  getFilteredRowModel,
  CellContext,
  ColumnResizeMode,
  ColumnSizingState,
} from "@tanstack/react-table"
import { useVirtualizer, VirtualItem } from "@tanstack/react-virtual"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronRight, Trash2, Zap } from "lucide-react"
import dynamic from "next/dynamic"
import { Button } from "../ui/button"
import React from "react"
import { useDebounce } from "use-debounce"
import { InfiniteList } from "../ui/infinite-list"
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { TASKS_SHALLOW_NAV_EVENT, dispatchTasksShallowNavigation } from '../../lib/tasks-shallow-nav'
import { getDefaultGroupOrderForGroupBy } from '@/lib/tasks-grouping-url'
import { UnifiedGroupedTaskList } from './unified-grouped-task-list'
import { CompactEditableRowContent } from './compact-task-row'
import { useTaskGrouping } from '../../store/task-grouping'
import type { GroupByField } from '../../store/task-grouping'
import { TaskTableHeader, getColumnLabel, stopDnd } from './task-table-header'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '../ui/use-toast'
import { removeItemFromStore } from '../../../hooks/use-infinite-query'
import { removeTaskFromAllStores, removeTaskIdFromTasksQueryArrays } from './task-cache-utils'
import { enqueueTaskDelete, enqueueTaskDeletes } from '../../lib/task-write-queue'
import { useTasksListLegendStore } from '../../store/tasks-list-legend'
import { useTaskRealtime } from '../../../hooks/use-task-realtime'
import { updateTaskInCaches } from './task-cache-utils';
import { useTaskListViewQuery } from '../../hooks/use-task-list-view-query';
import { setTypesenseUpdater, getTypesenseUpdater } from '../../store/typesense-tasks';
import { useMobileDetection } from '../../hooks/use-mobile-detection';
import { updateTaskInCachesWithOverdue } from './task-cache-utils';
import { BulkActionBar, type BulkAction } from '../ui/bulk-action-bar';
import { useTasksUI } from '../../store/tasks-ui'
import { useTasksScopeProjectParam } from '../../contexts/tasks-scope-context'
import { useTaskSuggestionsQuery } from '../../hooks/use-task-suggestions-query'
import { usePlannerOptimisticTasks } from '../../store/planner-optimistic-tasks'
import type { PlannerItem } from '../../lib/types/planner-item'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog"
import { UserAvatar } from "@/components/UserAvatar";
import { ProjectBadge } from "@/components/ProjectBadge";
import { getImageUrl } from "../../lib/public-media";
import { formatDateDisplay, formatCompactDateDisplay, toISODate } from "../../lib/utils";
import { InlineDateEditor } from "./InlineDateEditor";
import { InlineSelect } from "./InlineSelect";
import { patchTaskInGroupTasksCaches } from '../../../src/hooks/use-task-group-tasks-query';
import type { TaskCardColorMode } from '@/lib/task-card-colors';
import {
  getStablePaletteBarClass,
  getTaskColorKey,
  getTaskInlineStyle,
  getTaskListRowAccentColor,
} from '@/lib/task-card-colors';

interface TaskListProps {
  onTaskSelect?: (task: any) => void
  filters?: any
  searchValue?: string
  expandMainTaskId?: number | string | null
  selectedTaskId?: string | number | null
  editFields?: any // Task edit fields data from useTaskEditFields hook
  isMultiselectMode?: boolean
  onToggleMultiselect?: () => void
  /** Compact embedded list (e.g. project overview preview). */
  embed?: boolean
  pageSize?: number
}

// Shared date display: dd/mm/yyyy (pt-PT locale) for consistency between hover and edit
function formatDateWithYear(dateString: string | null | undefined): string {
  return formatDateDisplay(dateString) || "";
}

// Helper function to format date
function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "No date"
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (error) {
    console.error('Error formatting date:', error)
    return "Invalid date"
  }
}

// Define the joined type for tasks with foreign keys and color
// This represents the modern, nested data structure from Supabase joins
interface JoinedTask extends Omit<any, 'assigned_user' | 'projects' | 'project_statuses' | 'channels'> {
  assigned_user: { id: number; full_name: string } | null
  projects: { id: number; name: string; color?: string } | null
  project_statuses: { id: number; name: string; color?: string } | null
  channels: string[] | null
}

// 1. Define the denormalized task type
// This represents the old, flat data structure expected by the task detail view
interface DenormalizedTask {
  id: number
  title: string
  assigned_to_id: string
  project_id_int: string
  assigned_to_name: string | null
  project_name: string | null
  project_color: string | null
  project_status_name: string | null
  project_status_color: string | null
  content_type_title: string | null
  production_type_title: string | null
  language_code: string | null
  delivery_date: string | null
  publication_date: string | null
  updated_at: string | null
  copy_post: string | null
  briefing: string | null
  notes: string | null
  // Add any other fields you need from the tasks table
}

// Helper to calculate overdue status based on dates and project status
function calculateOverdueStatus(
  deliveryDate: string | null,
  publicationDate: string | null,
  projectStatusId: string | null,
  projectStatuses: any[]
): { isOverdue: boolean; isPublicationOverdue: boolean } {
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Compare only dates, not time

  // Find the current project status
  const currentStatus = projectStatuses.find(s => String(s.id) === String(projectStatusId));
  
  // Calculate delivery overdue
  let isOverdue = false;
  if (deliveryDate && !currentStatus?.is_closed) {
    const deliveryDateObj = new Date(deliveryDate);
    deliveryDateObj.setHours(0, 0, 0, 0);
    isOverdue = deliveryDateObj < now;
  }

  // Calculate publication overdue
  let isPublicationOverdue = false;
  if (publicationDate && !currentStatus?.is_publication_closed) {
    const publicationDateObj = new Date(publicationDate);
    publicationDateObj.setHours(0, 0, 0, 0);
    isPublicationOverdue = publicationDateObj < now;
  }

  return { isOverdue, isPublicationOverdue };
}

// Mobile Task Card Component
function MobileTaskCard({ task, isSelected, isMainTask, isExpanded, onTaskSelect, onToggleExpand, isMultiselectMode, isTaskSelected, onTaskToggle, listColorMode }: {
  task: any;
  isSelected: boolean;
  isMainTask: boolean;
  isExpanded: boolean;
  onTaskSelect: (task: any) => void;
  onToggleExpand?: (taskId: number) => void;
  isMultiselectMode?: boolean;
  isTaskSelected?: boolean;
  onTaskToggle?: (taskId: number) => void;
  listColorMode?: TaskCardColorMode | null;
}) {
  const listAccentColor =
    listColorMode
      ? getTaskListRowAccentColor(task, listColorMode)
      : null
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div 
      className={cn(
        'relative p-3 border-b border-gray-100 cursor-pointer transition-colors',
        listAccentColor && 'pl-7',
        isMultiselectMode 
          ? isTaskSelected ? 'bg-gray-100 border-l-4 border-l-gray-300' : 'hover:bg-gray-50'
          : isSelected ? 'bg-gray-100 border-l-4 border-l-gray-300' : 'hover:bg-gray-50'
      )}
      onClick={(e) => {
        if ((e.target as Element)?.closest?.('[data-inline-editor]')) return
        if (isMultiselectMode && onTaskToggle) {
          onTaskToggle(task.id);
        } else {
          onTaskSelect(task);
        }
      }}
    >
      {listAccentColor ? (
        <span
          aria-hidden
          className="pointer-events-none absolute left-2 top-1.5 bottom-1.5 w-1.5 rounded-sm"
          style={{ backgroundColor: listAccentColor }}
        />
      ) : null}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Checkbox for multiselect mode */}
          {isMultiselectMode && (
            <input
              type="checkbox"
              checked={isTaskSelected || false}
              onChange={(e) => {
                e.stopPropagation();
                onTaskToggle?.(task.id);
              }}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
            />
          )}
          
          {/* Status color ball */}
          <div 
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ 
              backgroundColor: task.project_statuses?.color || '#e5e7eb',
              border: task.project_statuses?.color ? 'none' : '1px solid #d1d5db'
            }}
          />
          
          {/* Title: fixed 24px slot (chevron or spacer) + title */}
          <div className="flex-1 min-w-0 flex items-center">
            <div className="w-6 shrink-0 flex items-center justify-center">
              {isMainTask ? (
                <button
                  type="button"
                  aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleExpand?.(task.id);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-6 h-6 flex items-center justify-center rounded transition text-gray-400 hover:text-blue-600 hover:bg-gray-100 flex-shrink-0"
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <span className="w-6 block" aria-hidden />
              )}
            </div>
            <span className="truncate text-sm min-w-0 flex-1">
              {task.title}
            </span>
          </div>
          
          {/* Assignee avatar */}
          {task.assigned_user?.full_name && (
            <div className="flex-shrink-0">
              <div 
                className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600"
                title={task.assigned_user.full_name}
              >
                {getInitials(task.assigned_user.full_name)}
              </div>
            </div>
          )}
        </div>
        
        {/* Delivery date */}
        <div className="flex-shrink-0 ml-3">
          <span className={cn(
            "text-xs",
            task.is_overdue ? "text-red-600 font-medium" : "text-gray-500"
          )}>
            {formatDateWithYear(task.delivery_date)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Helper to fetch subtasks for a parent task
async function fetchSubtasksForParent(parentId: number) {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from('tasks')
    .select(`id, title, content_type_id, delivery_date, publication_date, updated_at,
      assigned_user:users!fk_tasks_assigned_to_id(id,full_name),
      projects:projects!project_id_int(id,name,color),
      project_statuses:project_statuses!project_status_id(id,name,color),
      content_type_title, production_type_title, language_code, parent_task_id_int`)
    .eq('parent_task_id_int', parentId)
    .order('id', { ascending: true })
  if (error) throw error
  return data || []
}

// SubtaskRows component for rendering subtasks for a main task
export function SubtaskRows({ parentId, taskColumns, gridTemplateColumns, onTaskSelect, selectedTaskId, isMobile, isMultiselectMode, selectedTasks, onTaskToggle, listColorMode, compact = false, compactDateField = 'delivery_date' }: { 
  parentId: number, 
  taskColumns: any[], 
  gridTemplateColumns?: string,
  onTaskSelect: (task: any) => void, 
  selectedTaskId?: string | number | null,
  isMobile?: boolean,
  isMultiselectMode?: boolean,
  selectedTasks?: Set<number>,
  onTaskToggle?: (taskId: number) => void,
  listColorMode?: TaskCardColorMode | null,
  compact?: boolean,
  compactDateField?: 'delivery_date' | 'publication_date',
}) {
  const { data, isFetching } = useQuery({
    queryKey: ['subtasks', parentId],
    queryFn: () => fetchSubtasksForParent(parentId),
    placeholderData: (prev) => prev,
    staleTime: 10000,
  })
  if (isFetching && (!data || data.length === 0)) {
    return isMobile ? (
      <div className="text-center text-gray-400 py-4 text-sm">Loading subtasks...</div>
    ) : (
      <tr key={`loading-${parentId}`}>
        <td colSpan={taskColumns.length} className={cn('text-center text-gray-400 py-4 border-b border-r border-gray-100', compact && 'task-cell-span-full border-r-0')}>Loading subtasks...</td>
      </tr>
    )
  }
  if (data && data.length === 0) {
    return isMobile ? (
      <div className="text-center text-gray-400 py-4 text-sm">No subtasks</div>
    ) : (
      <tr key={`empty-${parentId}`}>
        <td colSpan={taskColumns.length} className={cn('text-center text-gray-400 py-4 border-b border-r border-gray-100', compact && 'task-cell-span-full border-r-0')}>No subtasks</td>
      </tr>
    )
  }
  
  if (isMobile) {
    return (
      <>
        {data && data.map(subtask => (
          <div key={subtask.id} className="pl-6">
            <MobileTaskCard
              task={subtask}
              isSelected={!!(selectedTaskId && String(subtask.id) === String(selectedTaskId))}
              isMainTask={false}
              isExpanded={false}
              onTaskSelect={onTaskSelect}
              isMultiselectMode={isMultiselectMode}
              isTaskSelected={selectedTasks?.has(subtask.id) || false}
              onTaskToggle={onTaskToggle}
              listColorMode={listColorMode}
            />
          </div>
        ))}
      </>
    )
  }
  
  // Compact (narrow left-pane): render subtasks as single-line compact rows (no column grid) so the
  // expanded subtask list never causes horizontal scroll. Subtasks have no further nesting toggle.
  if (compact) {
    return (
      <>
        {data && data.map(subtask => {
          const isSelected = !!(selectedTaskId && String(subtask.id) === String(selectedTaskId))
          const isChecked = !!selectedTasks?.has(subtask.id)
          return (
            <tr
              key={subtask.id}
              data-row-type="task"
              className={cn(
                'task-row hover:bg-gray-50 cursor-pointer border-b',
                (isSelected || (isMultiselectMode && isChecked)) && 'bg-gray-100',
              )}
              // Match the compact parent row's single-column grid so the full-span cell fills the row
              // width. Without this, `display: grid` has no explicit columns and `grid-column: 1 / -1`
              // collapses to content width — making subtasks appear narrower than parent rows.
              style={{ gridTemplateColumns: gridTemplateColumns ?? 'minmax(0, 1fr)' }}
              onClick={(e) => {
                if ((e.target as Element)?.closest?.('[data-inline-editor]')) return
                if (isMultiselectMode && onTaskToggle) {
                  onTaskToggle(subtask.id)
                } else {
                  onTaskSelect(subtask)
                }
              }}
            >
              <td className="task-cell task-cell-span-full px-3 py-1 pl-7">
                <CompactEditableRowContent
                  task={subtask}
                  columns={taskColumns}
                  dateField={compactDateField}
                  isMultiselectMode={isMultiselectMode}
                  isTaskSelected={isChecked}
                  onTaskToggle={onTaskToggle}
                />
              </td>
            </tr>
          )
        })}
      </>
    )
  }

  const effectiveGridTemplateColumns =
    gridTemplateColumns ??
    (() => {
      const real = (taskColumns as any[]).filter(c => (c.id ?? c.accessorKey) !== '__spacer')
      return [...real.map((c: any) => `${c.size ?? 0}px`), 'minmax(0px, 1fr)'].join(' ')
    })()

  const realColumns = (taskColumns as any[]).filter((c: any) => (c.id ?? c.accessorKey) !== '__spacer')
  const spacerColumns = (taskColumns as any[]).filter((c: any) => (c.id ?? c.accessorKey) === '__spacer')
  const orderedColumns = [...realColumns, ...spacerColumns]

  return (
    <>
      {data && data.map(subtask => {
        const listAccentColor =
          listColorMode
            ? getTaskListRowAccentColor(subtask, listColorMode)
            : null
        return (
        <tr
          key={subtask.id}
          data-row-type="task"
          className={cn(
            'task-row hover:bg-gray-50 cursor-pointer',
            isMultiselectMode 
              ? selectedTasks?.has(subtask.id) && 'bg-gray-100 border-l-4 border-l-gray-300'
              : selectedTaskId && String(subtask.id) === String(selectedTaskId) && 'bg-gray-100',
          )}
          style={{ gridTemplateColumns: effectiveGridTemplateColumns }}
          onClick={(e) => {
            if ((e.target as Element)?.closest?.('[data-inline-editor]')) return
            if (isMultiselectMode && onTaskToggle) {
              onTaskToggle(subtask.id);
            } else {
              onTaskSelect(subtask);
            }
          }}
        >
          {orderedColumns.map((col, idx) => {
            const c = col as any
            const colId = c.id ?? c.accessorKey
            const isSpacer = colId === '__spacer'
            const isLastRealBeforeSpacer = !isSpacer && spacerColumns.length > 0 && idx === realColumns.length - 1
            const isFirstDataCell = !isSpacer && idx === 0
            return (
              <td
                key={colId ?? idx}
                data-col={colId}
                className={cn(
                  'task-cell text-sm border-b align-middle',
                  colId !== 'project_statuses' && 'truncate',
                  isSpacer && 'task-spacer-cell p-0 border-transparent',
                  !isSpacer && 'px-3 py-1',
                  isFirstDataCell && listAccentColor && 'relative pl-7',
                  !isSpacer && !isLastRealBeforeSpacer && 'border-r border-gray-100',
                  colId === 'title' && 'task-cell--sticky',
                )}
              >
                {isFirstDataCell && listAccentColor ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute left-2 top-1.5 bottom-1.5 w-1.5 rounded-sm"
                    style={{ backgroundColor: listAccentColor }}
                  />
                ) : null}
                {!isSpacer && (c.cell
                  ? flexRender(c.cell, {
                      row: { original: subtask },
                      getValue: () => subtask[c.accessorKey as keyof typeof subtask],
                    })
                  : subtask[c.accessorKey as keyof typeof subtask])}
              </td>
            )
          })}
        </tr>
        )
      })}
    </>
  )
}

/**
 * Hysteresis margin (px) for leaving compact mode: once compact, the pane must grow this much past
 * the compact threshold before we restore the full table. Prevents flicker at the boundary.
 */
const COMPACT_EXIT_MARGIN = 32

/**
 * Upper bound (px) on the compact-mode trigger width. Compact rows are a *narrow-pane* fallback only:
 * the normal table has its own horizontal scroll, so once the left pane is at least this wide we
 * always show the full table (scrolling horizontally if needed) rather than staying compact. Without
 * this cap, the trigger would be the full table width (sum of every column ≈ 1800px+), which a left
 * pane almost never reaches even when maximized — so compact would never turn off after expanding the
 * pane or closing the middle/right panes. Sized to comfortably show the title + a couple of columns.
 */
const COMPACT_MAX_ENTER_WIDTH = 720

export function TaskList({ onTaskSelect, expandMainTaskId, selectedTaskId, editFields, isMultiselectMode: externalIsMultiselectMode, onToggleMultiselect }: TaskListProps) {
  console.log('[TaskList] RENDER');
  const routerParams = useSearchParams()
  /** Keeps list URL-driven state in sync with the address bar when using shallow history updates (no RSC navigation). */
  const [addressSearch, setAddressSearch] = useState<string | null>(null)
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    setAddressSearch(window.location.search)
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    setAddressSearch(window.location.search)
  }, [routerParams.toString()])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onAddrChange = () => setAddressSearch(window.location.search)
    window.addEventListener(TASKS_SHALLOW_NAV_EVENT, onAddrChange)
    window.addEventListener('popstate', onAddrChange)
    return () => {
      window.removeEventListener(TASKS_SHALLOW_NAV_EVENT, onAddrChange)
      window.removeEventListener('popstate', onAddrChange)
    }
  }, [])
  const params = useMemo(() => {
    let raw = ''
    if (addressSearch !== null) {
      raw = addressSearch.startsWith('?') ? addressSearch.slice(1) : addressSearch
    } else if (typeof window !== 'undefined') {
      const w = window.location.search
      raw = w.startsWith('?') ? w.slice(1) : w
    } else {
      raw = routerParams.toString()
    }
    return new URLSearchParams(raw)
  }, [addressSearch, routerParams.toString()])
  const router = useRouter()
  const pathname = usePathname()
  const { selectedGroupBy, setGroupBy } = useTaskGrouping();
  const shallowReplaceUrl = useCallback((url: string) => {
    if (typeof window === 'undefined') return
    window.history.replaceState({}, '', url)
  }, [])
  
  // Determine if we should show grouped or ungrouped view
  // Ungrouped view only when sortBy or sortOrder URL params are present
  const hasSortParams = params.get('sortBy') || params.get('sortOrder') || params.get('rowSortBy') || params.get('rowSortOrder');
  const hasGroupByParam = params.get('groupBy');
  
  // Set default groupBy to 'delivery_date' on initial load if no params
  const hasInitialized = useRef(false);
  useEffect(() => {
    // Only set default once on initial mount when there are no URL params
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      const currentHasSortParams = params.get('sortBy') || params.get('sortOrder');
      const currentHasGroupByParam = params.get('groupBy');
      const currentSelectedGroupBy = selectedGroupBy;
      // Respect an explicit ungrouped/list mode — don't seed a default groupBy that would re-group
      // a deliberately ungrouped view on load.
      const currentMode = params.get('mode');
      const isUngroupedMode = currentMode === 'list' || currentMode === 'ungrouped';
      
      if (!isUngroupedMode && !currentHasSortParams && !currentHasGroupByParam && !currentSelectedGroupBy) {
        setGroupBy('delivery_date');
        // Also set in URL for consistency
        const newParams = new URLSearchParams(params.toString());
        newParams.set('groupBy', 'delivery_date');
        shallowReplaceUrl(`${pathname}?${newParams.toString()}`);
      } else if (currentHasGroupByParam) {
        // Sync from URL if present
        const groupByValue = currentHasGroupByParam as any;
        const normalizedValue = groupByValue === 'null' || groupByValue === '' ? null : groupByValue;
        if (normalizedValue !== currentSelectedGroupBy) {
          setGroupBy(normalizedValue);
        }
      }
    }
  }, []); // Only run once on mount
  
  // URL is source of truth for groupBy. Sync store FROM the URL only — never clear the store just
  // because groupBy is briefly missing (TasksLayout seeds defaults after object switches; clearing
  // here raced that seed and caused a maximum-update-depth loop via setGroupBy).
  useEffect(() => {
    if (!hasGroupByParam) {
      const mode = params.get('mode')
      if (mode === 'list' || mode === 'ungrouped') {
        if (selectedGroupBy !== null) setGroupBy(null)
      }
      return
    }
    const groupByValue = hasGroupByParam as any
    const normalizedValue = groupByValue === 'null' || groupByValue === '' ? null : groupByValue
    if (normalizedValue !== selectedGroupBy) {
      setGroupBy(normalizedValue)
    }
  }, [hasGroupByParam, params, selectedGroupBy, setGroupBy]);
  
  // Grouped when groupBy is set; ungrouped (null) uses same list with p_group_key='all'.
  const isGroupedView = selectedGroupBy != null;
  const isMobile = useMobileDetection();
  console.log('[TaskList] selectedGroupBy:', selectedGroupBy, 'isGroupedView:', isGroupedView, 'hasSortParams:', hasSortParams, 'hasGroupByParam:', hasGroupByParam);
  const queryClient = useQueryClient()
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const pinnedScrollbarRef = useRef<HTMLDivElement | null>(null);
  // Callback-ref mirrors so effects re-run when nodes mount/unmount (refs alone won't trigger effects).
  const [tableScrollEl, setTableScrollEl] = useState<HTMLDivElement | null>(null)
  const [pinnedScrollEl, setPinnedScrollEl] = useState<HTMLDivElement | null>(null)

  // IMPORTANT: use stable callback refs; inline ref functions change identity each render,
  // causing React to call the old ref with null and the new ref with the node, which can
  // create an infinite update loop when setState is called inside the ref.
  const handleTableScrollRef = useCallback((el: HTMLDivElement | null) => {
    tableScrollRef.current = el as any
    setTableScrollEl((prev) => (prev === el ? prev : el))
  }, [])

  const handlePinnedScrollRef = useCallback((el: HTMLDivElement | null) => {
    pinnedScrollbarRef.current = el as any
    setPinnedScrollEl((prev) => (prev === el ? prev : el))
  }, [])

  // Set up realtime subscriptions for tasks
  const { isSubscribed } = useTaskRealtime({
    enabled: true,
    showNotifications: false,
    onTaskUpdate: (task, event) => {
      console.log(`[TaskList] Received ${event} event for task:`, task.id)
      // Patch all task caches with the updated task
      if (editFields?.project_statuses) {
        // Use the new function with overdue calculation if project statuses are available
        updateTaskInCachesWithOverdue(queryClient, task, editFields.project_statuses);
      } else {
        // Fallback to the original function if project statuses are not available
        updateTaskInCaches(queryClient, task);
      }
      // Invalidate all queries that start with 'tasks' (fixes InfiniteList live updates)
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) && query.queryKey[0] === 'tasks'
      });
    }
  });

  // Hydration state to avoid SSR/CSR mismatch
  const [hasHydrated, setHasHydrated] = useState(false)
  useEffect(() => { setHasHydrated(true) }, [])

  // --- Sorting / Grouping State ---
  const urlGroupBy = (params.get('groupBy') as GroupByField | null) ?? null
  const urlGroupOrder = (params.get('groupOrder') as 'asc' | 'desc' | null) ?? null
  const urlRowSortBy = params.get('rowSortBy') || params.get('sortBy') || 'publication_date'
  const urlRowSortOrder: 'asc' | 'desc' = params.get('rowSortOrder') === 'asc'
    ? 'asc'
    : (params.get('sortOrder') === 'asc' ? 'asc' : 'desc')

  // Row-level sorting is driven directly from URL params
  const rowSortBy = urlRowSortBy
  const rowSortOrder = urlRowSortOrder

  // Backwards-compatible aliases used by existing header rendering / props
  const sortBy = rowSortBy
  const sortOrder = rowSortOrder

  const listColorByParam = params.get('list_color_by')
  const listColorOff = listColorByParam === 'off'
  const listColorExplicit: TaskCardColorMode | null =
    listColorByParam === 'contentType' ||
    listColorByParam === 'assignedTo' ||
    listColorByParam === 'project' ||
    listColorByParam === 'status'
      ? listColorByParam
      : null
  /** Left accent + legend: default Content type when param absent; `off` disables coloring. */
  const listColorModeForRows: TaskCardColorMode | null = listColorOff
    ? null
    : (listColorExplicit ?? 'contentType')

  const setListToolbarLegend = useTasksListLegendStore((s) => s.setListToolbarLegend)
  const clearListToolbarLegend = useTasksListLegendStore((s) => s.clearListToolbarLegend)

  const listColorLegendTitle =
    listColorModeForRows === 'contentType'
      ? 'Content type'
      : listColorModeForRows === 'assignedTo'
        ? 'Assignee'
        : listColorModeForRows === 'project'
          ? 'Project'
          : listColorModeForRows === 'status'
            ? 'Status'
            : ''

  const onListColorLegendChange = useCallback(
    (entries: { key: string; label: string; colorClass: string }[]) => {
      if (!listColorModeForRows) {
        clearListToolbarLegend()
        return
      }
      setListToolbarLegend(entries, listColorLegendTitle)
    },
    [listColorModeForRows, listColorLegendTitle, setListToolbarLegend, clearListToolbarLegend],
  )

  useEffect(() => {
    if (!listColorModeForRows) {
      clearListToolbarLegend()
    }
  }, [listColorModeForRows, clearListToolbarLegend])

  // --- Column Sizing State (persisted in localStorage) ---
  const COLUMN_WIDTHS_KEY = 'tasklist-column-widths-v1'
  const defaultColumnWidths: ColumnSizingState = {
    list_color: 22,
    title: 200,
    users: 180,
    projects: 180,
    project_statuses: 160,
    delivery_date: 180,
    publication_date: 190,
    updated_at: 170,
    content_type_title: 180,
    production_type_title: 190,
    language_code: 140,
  }
  // Min width = default width so resize cannot trim headers
  const COLUMN_MIN_WIDTHS: Record<string, number> = {
    select: 50,
    list_color: 18,
    title: 200,
    assigned_user: 180,
    users: 180,
    projects: 180,
    project_statuses: 160,
    delivery_date: 180,
    publication_date: 190,
    updated_at: 170,
    content_type_title: 180,
    production_type_title: 190,
    language_code: 140,
  }
  const getColumnMinWidth = (colId: string) => COLUMN_MIN_WIDTHS[colId] ?? defaultColumnWidths[colId as keyof typeof defaultColumnWidths] ?? 160
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(defaultColumnWidths)
  const [hasMeasured, setHasMeasured] = useState(false)
  const defaultWidthsRef = useRef<Record<string, number>>({})

  // --- Multiselect State ---
  const [internalIsMultiselectMode, setInternalIsMultiselectMode] = useState(false)
  const isMultiselectMode = externalIsMultiselectMode ?? internalIsMultiselectMode
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set())
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  // --- Inline Editing State ---
  const [editingCell, setEditingCell] = useState<{ taskId: number; field: string } | null>(null)
  const [editingValue, setEditingValue] = useState<string>('')
  const [activeHoverId, setActiveHoverId] = useState<string | null>(null)
  const [editIntent, setEditIntent] = useState<'click' | 'hover'>('click')
  const editingCellRef = useRef<{ taskId: number; field: string } | null>(null)
  const editIntentRef = useRef<'click' | 'hover'>('click')

  useEffect(() => {
    editingCellRef.current = editingCell
  }, [editingCell])

  useEffect(() => {
    editIntentRef.current = editIntent
  }, [editIntent])

  // --- Scroll guard to prevent hover-edit from hijacking scrolling -----------
  const [isScrolling, setIsScrolling] = useState(false)
  const isScrollingRef = useRef(false)
  const scrollEndTimerRef = useRef<number | null>(null)
  const hoverOpenTimerRef = useRef<number | null>(null)
  const pendingHoverCellRef = useRef<{ taskId: number; field: string } | null>(null)

  const clearHoverOpenTimer = useCallback(() => {
    if (hoverOpenTimerRef.current != null) {
      window.clearTimeout(hoverOpenTimerRef.current)
      hoverOpenTimerRef.current = null
    }
    pendingHoverCellRef.current = null
  }, [])

  const markScrolling = useCallback(() => {
    // Any scroll/wheel/touchmove should disable hover-edit instantly.
    clearHoverOpenTimer()
    setActiveHoverId(null)

    if (!isScrollingRef.current) {
      isScrollingRef.current = true
      setIsScrolling(true)
      // If the editor was opened via hover, close it while scrolling.
      setEditingCell(prev => {
        if (!prev) return prev
        return editIntentRef.current === 'hover' ? null : prev
      })
    }

    if (scrollEndTimerRef.current != null) {
      window.clearTimeout(scrollEndTimerRef.current)
    }
    scrollEndTimerRef.current = window.setTimeout(() => {
      isScrollingRef.current = false
      setIsScrolling(false)
    }, 200)
  }, [clearHoverOpenTimer, editIntent])
  const supabase = createClientComponentClient()

  // Ref for measuring container width
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollContainerEl, setScrollContainerEl] = useState<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  const scrollContainerRef = useCallback((el: HTMLDivElement | null) => {
    setScrollContainerEl(prev => (prev === el ? prev : el))
  }, [])

  const desktopScrollRef = useCallback((el: HTMLDivElement | null) => {
    handleTableScrollRef(el)
    scrollContainerRef(el)
  }, [handleTableScrollRef, scrollContainerRef])

  useEffect(() => {
    const el = scrollContainerEl
    if (!el) return
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth))
    ro.observe(el)
    setContainerWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [scrollContainerEl])

  // Compact single-line rows kick in only when the normal table would need horizontal scroll, i.e.
  // its natural min width (sum of column sizes) can't fit the available scroll-container width.
  // Derivation lives after the table is built (see `normalTableMinWidth` / overflow effect below) so
  // it reads real column sizes and stays mode-independent (no flip-flop). Reacts to middle/right pane
  // open-close, left-pane expand, layout changes, and window resize via the container ResizeObserver.
  // Default TRUE: first paint must not use the expanded `max-content` table, or flex `min-width: auto`
  // can blow the pane out to the table width, lock `containerWidth` high, and get stuck expanded
  // (commonly triggered when search removes the vertical scrollbar and briefly exits compact).
  const [isCompact, setIsCompact] = useState(true)

  // On mount: load columnSizing from localStorage if present, else keep defaultColumnWidths
  useEffect(() => {
    if (!hasHydrated) return
    const saved = typeof window !== 'undefined' ? localStorage.getItem(COLUMN_WIDTHS_KEY) : null
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, number>
      const clamped: Record<string, number> = {}
      for (const [k, v] of Object.entries(parsed)) {
        if (k === '__spacer') continue
        clamped[k] = Math.max(getColumnMinWidth(k), v)
      }
      setColumnSizing(clamped)
    }
    setHasMeasured(true)
  }, [hasHydrated])

  const handleColumnSizingChange = (updaterOrValue: ColumnSizingState | ((old: ColumnSizingState) => ColumnSizingState)) => {
    setColumnSizing((prev) => {
      const next = typeof updaterOrValue === 'function' ? updaterOrValue(prev) : updaterOrValue
      const clamped: ColumnSizingState = {}
      for (const [key, value] of Object.entries(next)) {
        if (key === '__spacer') continue
        clamped[key] = Math.max(getColumnMinWidth(key), value)
      }
      return clamped
    })
  }

  useEffect(() => {
    if (!hasHydrated || typeof window === 'undefined') return
    const toSave = Object.fromEntries(Object.entries(columnSizing).filter(([k]) => k !== '__spacer'))
    localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(toSave))
  }, [columnSizing, hasHydrated])

  const handleResizeHandleDoubleClick = useCallback(
    (columnId: string) => {
      const defaultW = defaultWidthsRef.current[columnId] ?? 160
      handleColumnSizingChange((prev) => ({ ...prev, [columnId]: defaultW }))
    },
    [handleColumnSizingChange],
  )

  // --- Column Order (persisted in localStorage) ---
  const COLUMN_ORDER_KEY = 'taskListColumnOrder'
  const DEFAULT_COLUMN_ORDER = ['select', 'title', 'users', 'projects', 'project_statuses', 'delivery_date', 'publication_date', 'updated_at', 'content_type_title', 'production_type_title', 'language_code']
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_COLUMN_ORDER
    try {
      const saved = localStorage.getItem(COLUMN_ORDER_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        return Array.isArray(parsed) && parsed.length > 0
          ? parsed.filter((id) => id !== 'list_color')
          : DEFAULT_COLUMN_ORDER
      }
    } catch {}
    return DEFAULT_COLUMN_ORDER
  })
  useEffect(() => {
    if (!hasHydrated || typeof window === 'undefined') return
    localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(columnOrder))
  }, [columnOrder, hasHydrated])
  const handleColumnOrderChange = useCallback((fromId: string, toIndex: number) => {
    setColumnOrder((prev) => {
      const ids = prev.filter((id) => id !== '__spacer')
      const fromIdx = ids.indexOf(fromId)
      if (fromIdx === -1) return prev
      const fixedCount = (ids.includes('select') ? 1 : 0) + 1
      const clampedTo = Math.max(fixedCount, Math.min(ids.length, toIndex))
      if (fromIdx === clampedTo || (fromIdx < clampedTo && fromIdx === clampedTo - 1)) return prev
      const next = [...ids]
      next.splice(fromIdx, 1)
      const insertIdx = clampedTo > fromIdx ? clampedTo - 1 : clampedTo
      next.splice(insertIdx, 0, fromId)
      return next
    })
  }, [])

  // Column DnD: active column for DragOverlay, over column for drop indicator, pointer X for insert-left/right
  const [activeColId, setActiveColId] = useState<string | null>(null)
  const [overColId, setOverColId] = useState<string | null>(null)
  const [isColumnDragging, setIsColumnDragging] = useState(false)
  const lastPointerXRef = useRef<number | null>(null)

  const sortableColumnIds = useMemo(() => {
    return columnOrder.filter(
      (id) => id !== '__spacer' && id !== 'select' && id !== 'title' && id !== 'list_color',
    )
  }, [columnOrder])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )

  const handleColumnDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active?.id
    if (
      id &&
      typeof id === 'string' &&
      id !== 'title' &&
      id !== 'select' &&
      id !== 'list_color' &&
      id !== '__spacer'
    ) {
      setActiveColId(id)
      setIsColumnDragging(true)
    }
  }, [])

  const handleColumnDragOver = useCallback((event: DragOverEvent) => {
    const id = event.over?.id
    setOverColId(id != null ? String(id) : null)
  }, [])

  const handleColumnDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      setActiveColId(null)
      setOverColId(null)
      setIsColumnDragging(false)

      if (!over || active.id === over.id) return
      const fromId = String(active.id)
      const overId = String(over.id)
      if (fromId === 'title' || fromId === 'select' || fromId === 'list_color' || fromId === '__spacer')
        return
      if (overId === 'title' || overId === 'select' || overId === 'list_color' || overId === '__spacer')
        return

      const ids = columnOrder.filter((id) => id !== '__spacer')
      const activeIndex = ids.indexOf(fromId)
      const overIndex = ids.indexOf(overId)
      if (activeIndex === -1 || overIndex === -1) return

      const fixedCount = (ids.includes('select') ? 1 : 0) + 1
      if (overIndex < fixedCount) return

      const clientX = lastPointerXRef.current
      const getInsertAfter = (): boolean => {
        if (typeof clientX !== 'number') return false
        const el = document.querySelector(`[data-col-id="${CSS.escape(overId)}"]`)
        if (!el) return false
        const r = el.getBoundingClientRect()
        return clientX > r.left + r.width / 2
      }
      const insertAfter = getInsertAfter()

      let newIndex = overIndex
      if (insertAfter) {
        newIndex = activeIndex < overIndex ? overIndex : overIndex + 1
      }

      const clampedTo = Math.max(fixedCount, Math.min(ids.length, newIndex))
      if (activeIndex === clampedTo || (activeIndex < clampedTo && activeIndex === clampedTo - 1)) return

      const next = arrayMove(ids, activeIndex, clampedTo)
      setColumnOrder(next)
    },
    [columnOrder]
  )

  const handleColumnDragCancel = useCallback(() => {
    setActiveColId(null)
    setOverColId(null)
    setIsColumnDragging(false)
  }, [])

  // Track pointer X during column drag for insert-left/right
  useEffect(() => {
    if (!activeColId) return
    const handler = (e: PointerEvent) => {
      lastPointerXRef.current = e.clientX
    }
    document.addEventListener('pointermove', handler, { passive: true })
    return () => {
      document.removeEventListener('pointermove', handler)
      lastPointerXRef.current = null
    }
  }, [activeColId])

  // --- Sorting Handler ---
  const handleHeaderClick = (accessorKey: string) => {
    // If grouped, clicking the group column toggles group order; others update row sort.
    const isGroupColumn =
      (selectedGroupBy === 'delivery_date' && accessorKey === 'delivery_date') ||
      (selectedGroupBy === 'publication_date' && accessorKey === 'publication_date') ||
      (selectedGroupBy === 'status' && accessorKey === 'project_statuses') ||
      (selectedGroupBy === 'project' && accessorKey === 'projects') ||
      (selectedGroupBy === 'assigned_to' && accessorKey === 'users')

    if (isGroupedView && selectedGroupBy && isGroupColumn) {
      // Toggle group order
      const current =
        urlGroupOrder ?? (selectedGroupBy ? getDefaultGroupOrderForGroupBy(selectedGroupBy) : 'asc')
      const next = current === 'asc' ? 'desc' : 'asc'
      const newParams = new URLSearchParams(Array.from(params.entries()))
      newParams.set('groupBy', selectedGroupBy)
      newParams.set('groupOrder', next)
      // Reset pagination on group sort change
      newParams.delete('page')
      shallowReplaceUrl(`${pathname}?${newParams.toString()}`)
      dispatchTasksShallowNavigation()
    } else {
      // Update row-level sort (inside groups or ungrouped)
      const currentSortBy = rowSortBy
      const currentSortOrder = rowSortOrder
      const nextOrder: 'asc' | 'desc' =
        currentSortBy === accessorKey && currentSortOrder === 'asc' ? 'desc' : 'asc'

      const newParams = new URLSearchParams(Array.from(params.entries()))

      newParams.set('rowSortBy', accessorKey)
      newParams.set('rowSortOrder', nextOrder)
      // Also keep legacy sortBy/sortOrder in sync so existing components (like grouped list)
      // that still read sortBy/sortOrder continue to work.
      newParams.set('sortBy', accessorKey)
      newParams.set('sortOrder', nextOrder)
      // Keep existing groupBy / groupOrder as-is (do not ungroup)
      // Reset pagination on sort change
      newParams.delete('page')
      shallowReplaceUrl(`${pathname}?${newParams.toString()}`)
      dispatchTasksShallowNavigation()
    }
  }

  // --- Main Task Expand/Collapse State ---
  // Track expanded main task IDs
  const [expandedMainTasks, setExpandedMainTasks] = useState<Set<number>>(() => new Set())

  // Toggle expand/collapse for a main task
  const handleToggleMainTask = (taskId: number) => {
    setExpandedMainTasks(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  // --- Multiselect Handlers ---
  const handleToggleMultiselectMode = () => {
    if (onToggleMultiselect) {
      onToggleMultiselect()
    } else {
      setInternalIsMultiselectMode(prev => !prev)
    }
    if (isMultiselectMode) {
      setSelectedTasks(new Set()) // Clear selection when exiting multiselect mode
    }
  }

  const handleTaskToggle = (taskId: number) => {
    setSelectedTasks(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  const handleClearSelection = () => {
    setSelectedTasks(new Set())
  }

  const handleRequestBulkDelete = () => {
    if (selectedTasks.size === 0) return
    setIsBulkDeleteDialogOpen(true)
  }

  const handleConfirmBulkDelete = () => {
    if (selectedTasks.size === 0) return

    const taskIds = Array.from(selectedTasks)
    setIsBulkDeleting(true)
    taskIds.forEach((taskId) => removeTaskFromAllStores(taskId))
    setSelectedTasks(new Set())
    setIsBulkDeleteDialogOpen(false)

    const supabase = createClientComponentClient()
    enqueueTaskDeletes(
      taskIds.map((taskId) => ({ taskId, supabase })),
      {
        onBatchComplete: ({ ok, failed }) => {
          setIsBulkDeleting(false)
          if (failed > 0) {
            queryClient.invalidateQueries({
              predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'tasks',
            })
            queryClient.invalidateQueries({ queryKey: ['subtasks'] })
            toast({
              title: failed === taskIds.length ? 'Failed to delete tasks' : 'Some tasks failed to delete',
              description:
                failed === taskIds.length
                  ? 'An error occurred while deleting the tasks.'
                  : `Deleted ${ok}, failed ${failed}.`,
              variant: 'destructive',
            })
            return
          }
          toast({
            title: 'Tasks deleted',
            description: `Successfully deleted ${ok} task${ok !== 1 ? 's' : ''}.`,
          })
        },
      },
    )
  }

  // --- Filtered Options Helpers (same logic as TaskDetails) ---
  // Get filtered watchers (users) for a specific task's project (same logic as TaskDetails)
  const getFilteredWatchersForTask = useCallback((task: any) => {
    const projectId = task?.project_id_int ?? null
    if (!editFields?.project_watchers || projectId == null) return []
    // Compare as numbers to handle both string and number types
    return editFields.project_watchers.filter((w: any) => Number(w.project_id) === Number(projectId))
  }, [editFields?.project_watchers])

  // Get filtered costs for a specific user
  const getFilteredCostsForUser = useCallback((userId: string | number | null) => {
    if (!editFields?.costs || userId == null) return []
    return editFields.costs.filter((c: any) => c.user_id === Number(userId))
  }, [editFields?.costs])

  // Get filtered content types for a specific task
  const getFilteredContentTypesForTask = useCallback((task: any) => {
    if (!editFields?.content_types) return []
    const costs = getFilteredCostsForUser(task?.assigned_to_id)
    if (costs.length === 0) return editFields.content_types
    const allowed = new Set(costs.map((c: any) => c.content_type_id))
    return editFields.content_types.filter((ct: any) => allowed.has(ct.id))
  }, [editFields?.content_types, getFilteredCostsForUser])

  // Get filtered production types for a specific task
  const getFilteredProductionTypesForTask = useCallback((task: any) => {
    if (!editFields?.production_types) return []
    const costs = getFilteredCostsForUser(task?.assigned_to_id)
    if (costs.length === 0) return editFields.production_types
    const allowed = new Set(costs.map((c: any) => c.production_type_id))
    return editFields.production_types.filter((pt: any) => allowed.has(pt.id))
  }, [editFields?.production_types, getFilteredCostsForUser])

  // Get filtered languages for a specific task
  const getFilteredLanguagesForTask = useCallback((task: any) => {
    if (!editFields?.languages) return []
    const costs = getFilteredCostsForUser(task?.assigned_to_id)
    if (costs.length === 0) return editFields.languages
    const allowed = new Set(costs.map((c: any) => c.language_id))
    return editFields.languages.filter((l: any) => allowed.has(l.id))
  }, [editFields?.languages, getFilteredCostsForUser])

  // Get filtered statuses for a specific task's project (same logic as TaskDetails)
  const getFilteredStatusesForTask = useCallback((task: any) => {
    const projectId = task?.project_id_int ?? null
    if (!editFields?.project_statuses || projectId == null) return []
    // Deduplicate by name+color (for cross-project statuses with same label)
    const seen = new Map()
    return editFields.project_statuses
      .filter((s: any) => Number(s.project_id) === Number(projectId))
      .filter((s: any) => {
        const key = `${s.name}|${s.color}`
        if (seen.has(key)) return false
        seen.set(key, true)
        return true
      })
  }, [editFields?.project_statuses])

  // --- Inline Editing Handlers ---
  const handleCellEdit = (
    taskId: number,
    field: string,
    currentValue: any,
    intent: 'click' | 'hover' = 'click',
  ) => {
    setEditingCell({ taskId, field })
    setEditingValue(String(currentValue || ''))
    setEditIntent(intent)
  }

  // Helper to save with a specific value (for dropdowns that need immediate save)
  const handleCellSaveWithValue = async (taskId: number, field: string, value: string, taskOverride?: any) => {
    const previousValue = editingValue
    setEditingValue(value)
    // Use the passed value directly instead of editingValue state
    const task = taskOverride || taskListViewTasks.find(t => t.id === taskId)
    if (!task) return

    let updateData: any = {}
    let optimisticTask: any = { ...task }
    let extraFields: any = {}
    
    // Map field names to database columns and prepare optimistic update
    switch (field) {
      case 'assigned_user':
        // For assignee, use user_id as value (same as TaskDetails)
        const filteredWatchers = getFilteredWatchersForTask(task)
        const selectedWatcher = filteredWatchers.find((w: any) => String(w.user_id) === String(value))
        const assigneeId = value === '' ? undefined : value
        let selectedName = null
        
        if (selectedWatcher) {
          selectedName = selectedWatcher.users?.full_name || null
        }
        
        updateData.assigned_to_id = assigneeId || null
        optimisticTask.assigned_to_id = assigneeId || null
        optimisticTask.assigned_user = selectedWatcher
          ? {
              id: selectedWatcher.user_id,
              full_name: selectedName || '',
              photo: selectedWatcher.users?.photo || null,
            }
          : null
        
        // Include denormalized fields (name + photo) on the optimistic task so that
        // grouped caches and list views can update avatars without extra requests.
        optimisticTask.assigned_to_name = selectedName
        optimisticTask.assigned_to_photo = selectedWatcher?.users?.photo || null
        extraFields.assigned_to_name = selectedName
        break
      case 'projects':
        // For project, use project_id_int (number) - same path as assignee/status
        const projectId = value === '' ? undefined : value
        const projectOption = editFields?.projects?.find((opt: any) => String(opt.id) === String(projectId))
        const projectName = projectOption && typeof projectOption.name === 'string' ? projectOption.name : undefined
        // projectOption.color may not exist, so fallback to task.project_color
        const projectColor =
          (projectOption && 'color' in projectOption && typeof (projectOption as any).color === 'string')
            ? (projectOption as any).color
            : (task && typeof task.project_color === 'string'
                ? task.project_color
                : undefined)
        const projectLogo =
          (projectOption && 'logo' in projectOption && typeof (projectOption as any).logo === 'string')
            ? (projectOption as any).logo
            : (projectOption as any)?.logo_url ?? (projectOption as any)?.logoUrl ?? task?.project_logo ?? null
        
        const nextProjectId = projectId ? Number(projectId) : null
        updateData.project_id_int = nextProjectId
        optimisticTask.project_id_int = nextProjectId
        optimisticTask.projects = projectOption
          ? {
              id: projectOption.id,
              name: projectName || '',
              color: projectColor || '',
              logo: projectLogo ?? (projectOption as any).logo ?? (projectOption as any).logo_url ?? (projectOption as any).logoUrl ?? null,
            }
          : null
        
        // Include denormalized project fields (name, color, logo) on the optimistic task
        // so that grouped lists and kanban can update badges without refetching.
        optimisticTask.project_name = projectName
        optimisticTask.project_color = projectColor
        optimisticTask.project_logo = projectLogo
        extraFields.project_name = projectName
        extraFields.project_color = projectColor
        break
      case 'project_statuses':
        // For status, we need to find the status ID from the name
        const status = editFields?.project_statuses?.find((s: any) => s.name === value)
        if (status) {
          updateData.project_status_id = status.id
          optimisticTask.project_status_id = status.id
          optimisticTask.project_statuses = { id: status.id, name: status.name, color: status.color }
          // Also maintain flat status fields for all caches, mirroring TaskDetails.
          optimisticTask.project_status_name = status.name
          optimisticTask.project_status_color = status.color
          extraFields.project_status_name = status.name
          extraFields.project_status_color = status.color
        }
        break
      case 'content_type_title':
        const filteredContentTypes = getFilteredContentTypesForTask(task)
        const contentType = filteredContentTypes.find((ct: any) => ct.title === value)
        if (contentType) {
          updateData.content_type_id = contentType.id
          optimisticTask.content_type_id = contentType.id
          optimisticTask.content_type_title = contentType.title
        } else if (value === '') {
          updateData.content_type_id = null
          optimisticTask.content_type_id = null
          optimisticTask.content_type_title = null
        }
        break
      case 'production_type_title':
        const filteredProductionTypes = getFilteredProductionTypesForTask(task)
        const productionType = filteredProductionTypes.find((pt: any) => pt.title === value)
        if (productionType) {
          updateData.production_type_id = productionType.id
          optimisticTask.production_type_id = productionType.id
          optimisticTask.production_type_title = productionType.title
        } else if (value === '') {
          updateData.production_type_id = null
          optimisticTask.production_type_id = null
          optimisticTask.production_type_title = null
        }
        break
      case 'language_code':
        // Use language_id as value (same as TaskDetails)
        const filteredLanguages = getFilteredLanguagesForTask(task)
        const language = filteredLanguages.find((l: any) => String(l.id) === String(value))
        if (language) {
          updateData.language_id = language.id
          optimisticTask.language_id = language.id
          optimisticTask.language_code = language.long_name || language.code // Store long_name as language_code (same as TaskDetails)
        } else if (value === '') {
          updateData.language_id = null
          optimisticTask.language_id = null
          optimisticTask.language_code = null
        }
        break
      case 'delivery_date':
        updateData.delivery_date = toISODate(value) || null
        optimisticTask.delivery_date = toISODate(value) || null
        break
      case 'publication_date':
        updateData.publication_date = toISODate(value) || null
        optimisticTask.publication_date = toISODate(value) || null
        break
      default:
        // Restore previous value if field not handled
        setEditingValue(previousValue)
        return
    }

    // Calculate overdue status if this field affects it
    let overdueFields = {}
    if ((['delivery_date', 'publication_date', 'project_statuses'] as string[]).includes(field as string) && editFields?.project_statuses) {
      const newDeliveryDate = (field as string) === 'delivery_date' ? value : task.delivery_date
      const newPublicationDate = (field as string) === 'publication_date' ? value : task.publication_date
      const newStatusId = (field as string) === 'project_statuses' ? optimisticTask.project_status_id : task.project_status_id
      
      const now = new Date()
      now.setHours(0, 0, 0, 0)
      
      const currentStatus = editFields.project_statuses.find((s: any) => String(s.id) === String(newStatusId))
      
      let isOverdue = false
      if (newDeliveryDate && !currentStatus?.is_closed) {
        const deliveryDateObj = new Date(newDeliveryDate)
        deliveryDateObj.setHours(0, 0, 0, 0)
        isOverdue = deliveryDateObj < now
      }
      
      let isPublicationOverdue = false
      if (newPublicationDate && !currentStatus?.is_publication_closed) {
        const publicationDateObj = new Date(newPublicationDate)
        publicationDateObj.setHours(0, 0, 0, 0)
        isPublicationOverdue = publicationDateObj < now
      }
      
      overdueFields = {
        is_overdue: isOverdue,
        is_publication_overdue: isPublicationOverdue
      }
      optimisticTask = { ...optimisticTask, ...overdueFields }
    }

    // Update TaskDetails query keys FIRST (before other caches) for immediate reactivity
    // This ensures TaskDetails pane updates optimistically when table changes
    const taskDetailsQueries = queryClient.getQueryCache().findAll({ 
      predicate: (query) => {
        const key = query.queryKey
        return Array.isArray(key) && 
               key[0] === 'task' && 
               key.length >= 2 && 
               String(key[1]) === String(taskId)
      }
    })
    
    for (const q of taskDetailsQueries) {
      const oldData = q.state.data as any
      if (!oldData) continue
      
      // Patch the task details data with the updated fields
      // Handle both flat structure and nested task structure (Edge Function format)
      const patchedData = {
        ...oldData,
        ...optimisticTask,
        // Preserve Edge Function specific fields if they exist
        thread_id: oldData.thread_id,
        mentions: oldData.mentions,
        watchers: oldData.watchers,
        attachments: oldData.attachments,
        subtasks: oldData.subtasks,
        project_watchers: oldData.project_watchers,
        // Preserve nested objects structure
        assigned_user: optimisticTask.assigned_user || oldData.assigned_user,
        projects: optimisticTask.projects || oldData.projects,
        project_statuses: optimisticTask.project_statuses || oldData.project_statuses,
        // Also update nested task property if it exists (Edge Function format)
        task: oldData.task ? {
          ...oldData.task,
          ...optimisticTask,
          assigned_user: optimisticTask.assigned_user || oldData.task.assigned_user,
          projects: optimisticTask.projects || oldData.task.projects,
          project_statuses: optimisticTask.project_statuses || oldData.task.project_statuses,
        } : undefined,
      }
      
      // Use setData synchronously for immediate update
      q.setData(patchedData)
      if (process.env.NODE_ENV === 'development') {
        console.log('[TaskList] Patched TaskDetails cache for task', taskId, 'with query key', q.queryKey)
      }
    }
    
    // First, patch grouped list caches so UnifiedGroupedTaskList reflects the change
    // immediately, even before React Query or other caches update.
    try {
      patchTaskInGroupTasksCaches(optimisticTask);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[TaskList] Failed to patch grouped task caches from inline edit', err);
      }
    }

    // Then update other caches (same pattern as TaskDetails)
    if (editFields?.project_statuses) {
      updateTaskInCachesWithOverdue(queryClient, optimisticTask, editFields.project_statuses)
    } else {
      updateTaskInCaches(queryClient, optimisticTask)
    }
    
    // Update Typesense store immediately
    console.log('[TaskList] Calling Typesense updater with:', optimisticTask)
    getTypesenseUpdater()?.(optimisticTask)
    
    // Update Typesense query data immediately for instant UI feedback
    if (taskListViewQuery) {
      taskListViewQuery.updateTaskInList(optimisticTask)
    }

    setEditingCell(null)
    setEditingValue('')

    // Then update in database
    try {
      // Merge extraFields and overdueFields into updateData (same as TaskDetails)
      const updatePayload = { ...updateData, ...extraFields, ...overdueFields }
      const { data: updatedTask, error } = await supabase
        .from('tasks')
        .update(updatePayload)
        .eq('id', taskId)
        .select()
        .single()

      if (error) throw error

      // No need to update caches again here, as optimistic update already happened
      // and realtime subscription will handle eventual consistency.

      toast({
        title: 'Task updated',
        description: 'Task has been updated successfully.',
      })
    } catch (err: any) {
      // Rollback optimistic update on error
      console.error('Failed to update task in DB, rolling back:', err)
      if (editFields?.project_statuses) {
        updateTaskInCachesWithOverdue(queryClient, task, editFields.project_statuses)
      } else {
        updateTaskInCaches(queryClient, task)
      }
      if (taskListViewQuery) {
        taskListViewQuery.updateTaskInList(task)
      }
      getTypesenseUpdater()?.(task)

      toast({
        title: 'Failed to update task',
        description: err?.message || 'An error occurred while updating the task.',
        variant: 'destructive',
      })
    }
  }

  const handleCellSave = async (taskId: number, field: string, taskOverride?: any) => {
    if (!editingCell || editingCell.taskId !== taskId || editingCell.field !== field) return

    const task = taskOverride || taskListViewTasks.find(t => t.id === taskId)
    if (!task) return

    let updateData: any = {}
    let optimisticTask: any = { ...task }
    let extraFields: any = {}
    
    // Map field names to database columns and prepare optimistic update
    switch (field) {
      case 'title':
        updateData.title = editingValue
        optimisticTask.title = editingValue
        break
      case 'assigned_user':
        // For assignee, use user_id as value (same as TaskDetails)
        const filteredWatchers = getFilteredWatchersForTask(task)
        const selectedWatcher = filteredWatchers.find((w: any) => String(w.user_id) === String(editingValue))
        const assigneeId = editingValue === '' ? undefined : editingValue
        let selectedName = null
        
        if (selectedWatcher) {
          selectedName = selectedWatcher.users?.full_name || null
        }
        
        updateData.assigned_to_id = assigneeId || null
        optimisticTask.assigned_to_id = assigneeId || null
        optimisticTask.assigned_user = selectedWatcher
          ? {
              id: selectedWatcher.user_id,
              full_name: selectedName || '',
              photo: selectedWatcher.users?.photo || null,
            }
          : null
        
        // Include denormalized fields (name + photo) on the optimistic task so that
        // grouped caches and list views can update avatars without extra requests.
        optimisticTask.assigned_to_name = selectedName
        optimisticTask.assigned_to_photo = selectedWatcher?.users?.photo || null
        extraFields.assigned_to_name = selectedName
        break
      case 'projects':
        // For project, use project_id as value (same as TaskDetails)
        const projectId = editingValue === '' ? undefined : editingValue
        const projectOption = editFields?.projects?.find((opt: any) => String(opt.id) === String(projectId))
        const projectName = projectOption && typeof projectOption.name === 'string' ? projectOption.name : undefined
        // projectOption.color may not exist, so fallback to task.project_color
        const projectColor =
          (projectOption && 'color' in projectOption && typeof (projectOption as any).color === 'string')
            ? (projectOption as any).color
            : (task && typeof task.project_color === 'string'
                ? task.project_color
                : undefined)
        const projectLogo =
          (projectOption && 'logo' in projectOption && typeof (projectOption as any).logo === 'string')
            ? (projectOption as any).logo
            : task?.project_logo ?? null
        
        updateData.project_id_int = projectId ? Number(projectId) : null
        optimisticTask.project_id_int = projectId ? Number(projectId) : null
        optimisticTask.projects = projectOption
          ? {
              id: projectOption.id,
              name: projectName || '',
              color: projectColor || '',
              logo: projectLogo || null,
            }
          : null
        
        optimisticTask.project_name = projectName
        optimisticTask.project_color = projectColor
        optimisticTask.project_logo = projectLogo
        extraFields.project_name = projectName
        extraFields.project_color = projectColor
        break
      case 'project_statuses':
        // For status, we need to find the status ID from the name
        const status = editFields?.project_statuses?.find((s: any) => s.name === editingValue)
        if (status) {
          updateData.project_status_id = status.id
          optimisticTask.project_status_id = status.id
          optimisticTask.project_statuses = { id: status.id, name: status.name, color: status.color }
          optimisticTask.project_status_name = status.name
          optimisticTask.project_status_color = status.color
          extraFields.project_status_name = status.name
          extraFields.project_status_color = status.color
        }
        break
      case 'delivery_date':
        updateData.delivery_date = toISODate(editingValue) || null
        optimisticTask.delivery_date = toISODate(editingValue) || null
        break
      case 'publication_date':
        updateData.publication_date = toISODate(editingValue) || null
        optimisticTask.publication_date = toISODate(editingValue) || null
        break
      case 'production_type_title':
        const filteredProductionTypes = getFilteredProductionTypesForTask(task)
        const productionType = filteredProductionTypes.find((pt: any) => pt.title === editingValue)
        if (productionType) {
          updateData.production_type_id = productionType.id
          optimisticTask.production_type_id = productionType.id
          optimisticTask.production_type_title = productionType.title
        } else if (editingValue === '') {
          updateData.production_type_id = null
          optimisticTask.production_type_id = null
          optimisticTask.production_type_title = null
        }
        break
      case 'content_type_title':
        const filteredContentTypes = getFilteredContentTypesForTask(task)
        const contentType = filteredContentTypes.find((ct: any) => ct.title === editingValue)
        if (contentType) {
          updateData.content_type_id = contentType.id
          optimisticTask.content_type_id = contentType.id
          optimisticTask.content_type_title = contentType.title
        } else if (editingValue === '') {
          updateData.content_type_id = null
          optimisticTask.content_type_id = null
          optimisticTask.content_type_title = null
        }
        break
      case 'language_code':
        // Use language_id as value (same as TaskDetails)
        const filteredLanguages = getFilteredLanguagesForTask(task)
        const language = filteredLanguages.find((l: any) => String(l.id) === String(editingValue))
        if (language) {
          updateData.language_id = language.id
          optimisticTask.language_id = language.id
          optimisticTask.language_code = language.long_name || language.code // Store long_name as language_code (same as TaskDetails)
        } else if (editingValue === '') {
          updateData.language_id = null
          optimisticTask.language_id = null
          optimisticTask.language_code = null
        }
        break
      default:
        return
    }

    // Calculate overdue status if needed (same logic as TaskDetails)
    let overdueFields = {}
    if (['delivery_date', 'publication_date', 'project_statuses'].includes(field) && editFields?.project_statuses) {
      const newDeliveryDate = field === 'delivery_date' ? (editingValue || null) : task.delivery_date
      const newPublicationDate = field === 'publication_date' ? (editingValue || null) : task.publication_date
      const newStatusId = field === 'project_statuses' ? optimisticTask.project_status_id : task.project_status_id
      
      const now = new Date()
      now.setHours(0, 0, 0, 0)
      
      const currentStatus = editFields.project_statuses.find((s: any) => String(s.id) === String(newStatusId))
      
      let isOverdue = false
      if (newDeliveryDate && !currentStatus?.is_closed) {
        const deliveryDateObj = new Date(newDeliveryDate)
        deliveryDateObj.setHours(0, 0, 0, 0)
        isOverdue = deliveryDateObj < now
      }
      
      let isPublicationOverdue = false
      if (newPublicationDate && !currentStatus?.is_publication_closed) {
        const publicationDateObj = new Date(newPublicationDate)
        publicationDateObj.setHours(0, 0, 0, 0)
        isPublicationOverdue = publicationDateObj < now
      }
      
      overdueFields = {
        is_overdue: isOverdue,
        is_publication_overdue: isPublicationOverdue
      }
      optimisticTask = { ...optimisticTask, ...overdueFields }
    }

    // First, patch grouped list caches so UnifiedGroupedTaskList reflects the change
    try {
      patchTaskInGroupTasksCaches(optimisticTask);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[TaskList] Failed to patch grouped task caches from inline edit', err);
      }
    }

    // Update TaskDetails query keys FIRST (before other caches) for immediate reactivity
    // This ensures TaskDetails pane updates optimistically when table changes
    const taskDetailsQueries = queryClient.getQueryCache().findAll({ 
      predicate: (query) => {
        const key = query.queryKey
        return Array.isArray(key) && 
               key[0] === 'task' && 
               key.length >= 2 && 
               String(key[1]) === String(taskId)
      }
    })
    
    for (const q of taskDetailsQueries) {
      const oldData = q.state.data as any
      if (!oldData) continue
      
      // Patch the task details data with the updated fields
      // Handle both flat structure and nested task structure (Edge Function format)
      const patchedData = {
        ...oldData,
        ...optimisticTask,
        // Preserve Edge Function specific fields if they exist
        thread_id: oldData.thread_id,
        mentions: oldData.mentions,
        watchers: oldData.watchers,
        attachments: oldData.attachments,
        subtasks: oldData.subtasks,
        project_watchers: oldData.project_watchers,
        // Preserve nested objects structure
        assigned_user: optimisticTask.assigned_user || oldData.assigned_user,
        projects: optimisticTask.projects || oldData.projects,
        project_statuses: optimisticTask.project_statuses || oldData.project_statuses,
        // Also update nested task property if it exists (Edge Function format)
        task: oldData.task ? {
          ...oldData.task,
          ...optimisticTask,
          assigned_user: optimisticTask.assigned_user || oldData.task.assigned_user,
          projects: optimisticTask.projects || oldData.task.projects,
          project_statuses: optimisticTask.project_statuses || oldData.task.project_statuses,
        } : undefined,
      }
      
      // Use setData synchronously for immediate update
      q.setData(patchedData)
      if (process.env.NODE_ENV === 'development') {
        console.log('[TaskList] Patched TaskDetails cache for task', taskId, 'with query key', q.queryKey)
      }
    }
    
    // Then update other caches (same pattern as TaskDetails)
    if (editFields?.project_statuses) {
      updateTaskInCachesWithOverdue(queryClient, optimisticTask, editFields.project_statuses)
    } else {
      updateTaskInCaches(queryClient, optimisticTask)
    }
    
    // Update Typesense store immediately
    console.log('[TaskList] Calling Typesense updater with:', optimisticTask)
    getTypesenseUpdater()?.(optimisticTask)
    
    // Ensure optimistic task has all mapped fields for table display
    // Map the optimistic task to the same format as tasks from the view
    const mappedOptimisticTask = {
      ...optimisticTask,
      // Ensure nested structures are present
      assigned_user: optimisticTask.assigned_user || (optimisticTask.assigned_to_name 
        ? { id: optimisticTask.assigned_to_id || 0, full_name: optimisticTask.assigned_to_name }
        : null),
      projects: optimisticTask.projects || (optimisticTask.project_name
        ? { id: optimisticTask.project_id_int || 0, name: optimisticTask.project_name, color: optimisticTask.project_color }
        : null),
      project_statuses: optimisticTask.project_statuses || (optimisticTask.project_status_name
        ? { id: optimisticTask.project_status_id || 0, name: optimisticTask.project_status_name, color: optimisticTask.project_status_color }
        : null),
      // Ensure all required fields are present
      assigned_to_id: optimisticTask.assigned_to_id || task.assigned_to_id,
      assigned_to_name: optimisticTask.assigned_to_name || task.assigned_to_name,
      project_id_int: optimisticTask.project_id_int || task.project_id_int,
      project_name: optimisticTask.project_name || task.project_name,
      project_color: optimisticTask.project_color || task.project_color,
      project_status_id: optimisticTask.project_status_id || task.project_status_id,
      project_status_name: optimisticTask.project_status_name || task.project_status_name,
      project_status_color: optimisticTask.project_status_color || task.project_status_color,
      content_type_title: optimisticTask.content_type_title ?? task.content_type_title ?? '',
      production_type_title: optimisticTask.production_type_title ?? task.production_type_title ?? '',
      language_code: optimisticTask.language_code ?? task.language_code ?? '',
      delivery_date: optimisticTask.delivery_date ?? task.delivery_date,
      publication_date: optimisticTask.publication_date ?? task.publication_date,
      updated_at: optimisticTask.updated_at || task.updated_at,
      is_overdue: optimisticTask.is_overdue ?? task.is_overdue ?? false,
      is_publication_overdue: optimisticTask.is_publication_overdue ?? task.is_publication_overdue ?? false,
    };
    
    // Update Typesense query data immediately for instant UI feedback
    // taskListViewQuery is defined later but accessible via closure
    if (taskListViewQuery && typeof taskListViewQuery.updateTaskInList === 'function') {
      taskListViewQuery.updateTaskInList(mappedOptimisticTask)
    }

    setEditingCell(null)
    setEditingValue('')

    // Suggestions: optimistic update only (no DB persist)
    if ((task as any).kind === 'suggestion' || (task as any).entity_type === 'suggestion') {
      return
    }

    // Then update in database
    try {
      // Merge extraFields and overdueFields into updateData (same as TaskDetails)
      const updatePayload = { ...updateData, ...extraFields, ...overdueFields }
      const { data: updatedTask, error } = await supabase
        .from('tasks')
        .update(updatePayload)
        .eq('id', taskId)
        .select()
        .single()

      if (error) throw error

      // Update caches with real data from server (authoritative)
      if (editFields?.project_statuses) {
        updateTaskInCachesWithOverdue(queryClient, updatedTask, editFields.project_statuses)
      } else {
        updateTaskInCaches(queryClient, updatedTask)
      }
      
      // Map updated task to table format before updating
      const mappedUpdatedTask = {
        ...updatedTask,
        assigned_user: updatedTask.assigned_to_name
          ? { id: updatedTask.assigned_to_id || 0, full_name: updatedTask.assigned_to_name }
          : null,
        projects: updatedTask.project_name
          ? { id: updatedTask.project_id_int || 0, name: updatedTask.project_name, color: updatedTask.project_color }
          : null,
        project_statuses: updatedTask.project_status_name
          ? { id: updatedTask.project_status_id || 0, name: updatedTask.project_status_name, color: updatedTask.project_status_color }
          : null,
        content_type_title: updatedTask.content_type_title || '',
        production_type_title: updatedTask.production_type_title || '',
        language_code: updatedTask.language_code || '',
        is_overdue: updatedTask.is_overdue || false,
        is_publication_overdue: updatedTask.is_publication_overdue || false,
      };
      
      // Update Typesense with real data
      getTypesenseUpdater()?.(updatedTask)
      if (taskListViewQuery && typeof taskListViewQuery.updateTaskInList === 'function') {
        taskListViewQuery.updateTaskInList(mappedUpdatedTask)
      }

      toast({
        title: 'Task updated',
        description: 'Task has been updated successfully.',
      })
    } catch (err: any) {
      // Rollback optimistic update on error
      if (editFields?.project_statuses) {
        updateTaskInCachesWithOverdue(queryClient, task, editFields.project_statuses)
      } else {
        updateTaskInCaches(queryClient, task)
      }
      
      // Rollback Typesense
      getTypesenseUpdater()?.(task)
      if (taskListViewQuery && typeof taskListViewQuery.updateTaskInList === 'function') {
        taskListViewQuery.updateTaskInList(task)
      }
      
      toast({
        title: 'Failed to update task',
        description: err?.message || 'An error occurred while updating the task.',
        variant: 'destructive',
      })
    }
  }

  const handleCellCancel = useCallback(() => {
    setEditingCell(null)
    setEditingValue('')
    setEditIntent('click')
  }, [])

  const scheduleHoverEdit = useCallback(
    (taskId: number, field: string, currentValue: any) => {
      if (isScrollingRef.current) return
      if (editingCellRef.current) return

      clearHoverOpenTimer()
      pendingHoverCellRef.current = { taskId, field }

      hoverOpenTimerRef.current = window.setTimeout(() => {
        if (isScrollingRef.current) return
        if (editingCellRef.current) return
        const pending = pendingHoverCellRef.current
        if (!pending || pending.taskId !== taskId || pending.field !== field) return
        handleCellEdit(taskId, field, currentValue, 'hover')
      }, 220) // small stable-hover delay avoids accidental activation while scrolling
    },
    [clearHoverOpenTimer],
  )

  const cellId = (taskId: number, field: string) => `${taskId}:${field}`
  const cellWidthsRef = useRef<Map<string, number>>(new Map())
  const measureCellWidth = useCallback((taskId: number, field: string, el: HTMLElement | null) => {
    if (!el) return
    const w = el.getBoundingClientRect().width
    const maxW = Math.min(520, (typeof window !== 'undefined' ? window.innerWidth : 520) - 24)
    cellWidthsRef.current.set(cellId(taskId, field), Math.min(maxW, Math.max(160, w)))
  }, [])
  const getMeasuredWidth = useCallback((taskId: number, field: string): number | undefined => {
    return cellWidthsRef.current.get(cellId(taskId, field))
  }, [])
  const isHoverActive = (taskId: number, field: string) =>
    activeHoverId === cellId(taskId, field) &&
    (!editingCell || (editingCell.taskId === taskId && editingCell.field === field))

  const handleCellHoverEnter = useCallback(
    (taskId: number, field: string, currentValue: any, options?: { openOnHover?: boolean }) => {
      if (isScrollingRef.current) return
      // Close any other cell in edit mode so it doesn't stay stuck
      const current = editingCellRef.current
      if (current && (current.taskId !== taskId || current.field !== field)) {
        handleCellCancel()
      }
      setActiveHoverId(cellId(taskId, field))
      // Some fields (e.g. delivery/publication date) keep the visual hover affordance but must NOT
      // auto-open their editor/calendar on hover — they open only via click or keyboard activation.
      if (options?.openOnHover === false) return
      scheduleHoverEdit(taskId, field, currentValue)
    },
    [scheduleHoverEdit, handleCellCancel],
  )

  const handleCellHoverLeave = useCallback(
    (taskId: number, field: string) => {
      clearHoverOpenTimer()
      setActiveHoverId(prev => (prev === cellId(taskId, field) ? null : prev))
      // Close hover-opened editors when you leave the cell.
      setEditingCell(prev => {
        if (!prev) return prev
        if (prev.taskId !== taskId || prev.field !== field) return prev
        return editIntentRef.current === 'hover' ? null : prev
      })
    },
    [clearHoverOpenTimer],
  )

  const clearActiveHover = useCallback(() => {
    setActiveHoverId(null)
    setEditingCell(prev => {
      if (!prev) return prev
      return editIntentRef.current === 'hover' ? null : prev
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearActiveHover()
        handleCellCancel()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [clearActiveHover, handleCellCancel])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element
      if (target?.closest?.('[data-hover-overlay]')) return
      if (target?.closest?.('[data-active-editor]')) return
      if (target?.closest?.('[data-inline-select]')) return
      if (target?.closest?.('[data-inline-editor]')) return
      clearActiveHover()
      handleCellCancel()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [clearActiveHover, handleCellCancel])

  // --- Bulk Actions Configuration ---
  const bulkActions: BulkAction[] = [
    {
      label: 'Delete',
      icon: Trash2,
      onClick: handleRequestBulkDelete,
      variant: 'destructive',
    }
  ]

  const bulkDeleteDialog = (
    <AlertDialog
      open={isBulkDeleteDialogOpen}
      onOpenChange={(open) => {
        if (isBulkDeleting) return
        setIsBulkDeleteDialogOpen(open)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete tasks</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete {selectedTasks.size} task{selectedTasks.size !== 1 ? 's' : ''}? This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isBulkDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isBulkDeleting}
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={(e) => {
              e.preventDefault()
              handleConfirmBulkDelete()
            }}
          >
            {isBulkDeleting ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  // --- Minimalist Arrow SVG ---
  const Arrow = ({ direction }: { direction: 'asc' | 'desc' }) => (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="inline ml-1 align-middle">
      {direction === 'asc' ? (
        <polyline points="3,7 6,4 9,7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <polyline points="3,5 6,8 9,5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  )

  const taskColumns: ColumnDef<any>[] = [
    // Add checkbox column when in multiselect mode
    ...(isMultiselectMode ? [{
      id: 'select',
      header: () => (
        <input
          type="checkbox"
          data-no-dnd
          onPointerDown={stopDnd}
          onMouseDown={stopDnd}
          onTouchStart={stopDnd}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          onChange={(e) => {
            if (e.target.checked) {
              // Select all visible tasks
              const allTaskIds = taskListViewTasks.map(task => Number(task.id))
              setSelectedTasks(new Set(allTaskIds))
            } else {
              setSelectedTasks(new Set())
            }
          }}
          checked={selectedTasks.size > 0 && selectedTasks.size === taskListViewTasks.length}
          ref={(el) => {
            if (el) {
              el.indeterminate = selectedTasks.size > 0 && selectedTasks.size < taskListViewTasks.length
            }
          }}
        />
      ),
      cell: (info: any) => (
        (info.row.original?.kind === 'suggestion')
          ? null
          : (
            <input
              type="checkbox"
              checked={selectedTasks.has(info.row.original.id)}
              onChange={(e) => {
                e.stopPropagation()
                handleTaskToggle(info.row.original.id)
              }}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          )
      ),
      size: 50,
      minSize: 50,
      maxSize: 50,
      enableResizing: false,
    }] : []),
    {
      accessorKey: 'title',
      header: () => (
        <button type="button" data-no-dnd onPointerDown={stopDnd} onMouseDown={stopDnd} onTouchStart={stopDnd} className={cn('truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-medium', 'bg-transparent border-0 p-0 m-0 cursor-pointer flex items-center', sortBy === 'title' ? 'text-black' : 'text-gray-500 hover:text-black')} onClick={() => handleHeaderClick('title')}>
          Title
          {sortBy === 'title' && <Arrow direction={sortOrder} />}
        </button>
      ),
      cell: info => {
        const task = info.row.original
        const taskId = (task as any).id ?? (task as any).entity_id
        const isSuggestion = task?.kind === 'suggestion'
        const isMainTask = !isSuggestion && (task.content_type_id === 39 || task.content_type_id === "39")
        const isExpanded = expandedMainTasks.has(taskId)
        const isEditing = editingCell?.taskId === taskId && editingCell?.field === 'title'
        
        const isSubtask = !!task.parent_task_id_int
        const titleContentIndent = isSubtask ? 'pl-3' : ''
        // Compact rows keep the project logo/color as the far-left identity marker, so the subtask
        // chevron must sit AFTER the title (not in a leading slot). Same toggle/state as expanded.
        const isCompactTitle = !!(info as any)?.compact

        const subtaskChevron = isMainTask ? (
          <button
            type="button"
            aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
            onClick={e => { e.stopPropagation(); handleToggleMainTask(taskId) }}
            onMouseDown={e => e.stopPropagation()}
            className={cn(
              'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded transition',
              isExpanded ? 'text-blue-600' : 'text-gray-400 hover:bg-gray-100 hover:text-blue-600'
            )}
            tabIndex={0}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : null

        if (isEditing) {
          const measuredW = getMeasuredWidth(taskId, 'title')
          return (
            <div
              className={cn('flex min-w-0 items-center', isCompactTitle && 'w-full max-w-full gap-1')}
              data-active-editor
              data-inline-editor
            >
              {!isCompactTitle && (
                <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                  {subtaskChevron ?? <span className="block h-5 w-5" aria-hidden />}
                </div>
              )}
              <div
                className={cn(
                  'min-w-0 overflow-visible',
                  isCompactTitle ? 'w-fit max-w-full' : 'flex-1',
                  titleContentIndent,
                )}
                style={measuredW ? { width: measuredW, minWidth: measuredW, maxWidth: measuredW } : undefined}
              >
                <input
                  type="text"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={() => handleCellSave(taskId, 'title', task)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCellSave(taskId, 'title', task)
                    } else if (e.key === 'Escape') {
                      handleCellCancel()
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full min-w-0 rounded border border-gray-500 bg-white px-1 py-0 text-sm leading-none focus:outline-none focus:ring-1 focus:ring-gray-500 overflow-visible"
                  style={{ textOverflow: 'clip' }}
                  autoFocus={editIntent !== 'hover' && !isScrolling}
                />
              </div>
              {isCompactTitle ? subtaskChevron : null}
            </div>
          )
        }
        
        return (
          <div
            className={cn(
              'flex min-w-0 items-center',
              isCompactTitle && 'w-full max-w-full gap-1 overflow-hidden',
            )}
          >
            {!isCompactTitle && (
              <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                {!isSuggestion && subtaskChevron ? subtaskChevron : <span className="block h-5 w-5" aria-hidden />}
              </div>
            )}
            <div
              className={cn(
                'flex min-w-0 items-center gap-2',
                isCompactTitle ? 'min-w-0 flex-1 overflow-hidden' : 'flex-1',
                titleContentIndent,
              )}
            >
              <span
                data-editable-cell
                ref={(el) => measureCellWidth(taskId, 'title', el)}
                className={cn(
                  'truncate text-sm leading-none select-text',
                  // Compact: shrink-wrap the title (like expanded) so hover/edit chrome
                  // matches text width instead of stretching across the whole column.
                  isCompactTitle ? 'inline-block w-fit max-w-full' : 'min-w-0 flex-1',
                  'cursor-text rounded border border-transparent px-1 py-0 transition-colors hover:border-gray-300 hover:bg-white',
                  isHoverActive(taskId, 'title') && 'bg-white border border-gray-300',
                  // Compact rows distinguish AI suggestions by subtly muting the title (no icon) instead.
                  isCompactTitle && isSuggestion && 'text-muted-foreground'
                )}
                {...(isHoverActive(taskId, 'title') && {
                  'data-hover-overlay': '',
                  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
                })}
                onClick={(e) => {
                  e.stopPropagation()
                  handleCellEdit(taskId, 'title', task.title, 'click')
                }}
                onPointerEnter={() => {
                  handleCellHoverEnter(taskId, 'title', task.title)
                }}
                onPointerLeave={() => handleCellHoverLeave(taskId, 'title')}
              >
                {task.title}
              </span>
              {isSuggestion && !isCompactTitle && (
                <span
                  className="shrink-0 inline-flex h-4 w-4 items-center justify-center text-gray-400"
                  title="AI suggestion"
                  aria-label="AI suggestion"
                >
                  <Zap className="h-3 w-3" />
                </span>
              )}
              {isCompactTitle ? subtaskChevron : null}
            </div>
          </div>
        )
      },
      size: columnSizing.title,
      minSize: getColumnMinWidth('title'),
      maxSize: 1000,
      enableResizing: true,
    },
    {
      id: '__spacer',
      header: () => null,
      cell: () => null,
      enableResizing: false,
      minSize: 0,
      size: 0,
    },
    {
      id: 'users',
      accessorKey: 'assigned_user',
      header: () => (
        <button type="button" data-no-dnd onPointerDown={stopDnd} onMouseDown={stopDnd} onTouchStart={stopDnd} className={cn('truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-medium', 'bg-transparent border-0 p-0 m-0 cursor-pointer flex items-center', sortBy === 'assigned_user' ? 'text-black' : 'text-gray-500 hover:text-black')} onClick={() => handleHeaderClick('assigned_user')}>
          Assignee
          {sortBy === 'assigned_user' && <Arrow direction={sortOrder} />}
        </button>
      ),
      cell: info => {
        const task = info.row.original
        const isEditing = editingCell?.taskId === task.id && editingCell?.field === 'assigned_user'
        // Compact rows show the avatar only (no name) to preserve the narrow layout; the avatar itself
        // is the click target that opens the same assignee editor used by the expanded list.
        const isCompactAssignee = !!(info as any)?.compact
        const displayName =
          task.assigned_user?.full_name ??
          task.assigned_to_name ??
          ""

        const photoUrl = task.assignedToPhotoUrl ?? getImageUrl(task.assigned_to_photo ?? task.assigned_user?.photo) ?? null
        
        const leadingSlot = (
          <div className="leading-slot flex h-5 w-5 shrink-0 items-center justify-center">
            {task.assigned_to_id ? (
              <UserAvatar name={displayName} photoUrl={photoUrl} size="xs" className="!h-5 !w-5 !min-h-5 !min-w-5" />
            ) : (
              <span className="block h-5 w-5" aria-hidden />
            )}
          </div>
        )

        if (isEditing && !isCompactAssignee) {
          const filteredWatchers = getFilteredWatchersForTask(task)
          const currentUserId = editingValue ?? (task?.assigned_to_id ? String(task.assigned_to_id) : '')
          const measuredW = getMeasuredWidth(task.id, 'assigned_user')
          const assigneeOptions = filteredWatchers.map((w: any) => ({
            value: String(w.user_id),
            label: w.users?.full_name || '',
            photo: w.users?.photo ?? null,
          }))
          return (
            <div className="task-cell relative flex shrink-0 items-center" data-active-editor data-inline-editor style={measuredW ? { width: measuredW, minWidth: 160, maxWidth: measuredW } : { minWidth: 160 }}>
              <div className="absolute inset-0 flex items-center" style={{ paddingLeft: 8, paddingRight: 8 }}>
                <InlineSelect
                  options={assigneeOptions}
                  value={currentUserId}
                  onChange={(val) => handleCellSaveWithValue(task.id, 'assigned_user', String(val), task)}
                  onBlur={() => handleCellCancel()}
                  placeholder="Select assignee"
                  emptyOption={{ value: '', label: 'Unassigned' }}
                  showMedia="avatar"
                  autoFocus={editIntent !== 'hover' && !isScrolling}
                />
              </div>
              <div className="invisible flex min-w-0 flex-1 items-center gap-2" aria-hidden>
                {leadingSlot}
                <span className="truncate text-sm">{displayName || '\u00A0'}</span>
              </div>
            </div>
          )
        }

        if (isCompactAssignee) {
          const filteredWatchers = getFilteredWatchersForTask(task)
          const assigneeOptions = filteredWatchers.map((w: any) => ({
            value: String(w.user_id),
            label: w.users?.full_name || '',
            photo: w.users?.photo ?? null,
          }))
          return (
            <div className="flex items-center" ref={(el) => measureCellWidth(task.id, 'assigned_user', el)}>
              <InlineSelect
                variant="compact"
                options={assigneeOptions}
                value={task.assigned_to_id ? String(task.assigned_to_id) : ''}
                onChange={(val) => handleCellSaveWithValue(task.id, 'assigned_user', String(val), task)}
                onBlur={() => handleCellCancel()}
                placeholder="Select assignee"
                emptyOption={{ value: '', label: 'Unassigned' }}
                showMedia="avatar"
                assigneeDisplayName={displayName}
                assigneePhotoUrl={photoUrl}
                triggerClassName={cn(
                  isHoverActive(task.id, 'assigned_user') && 'border-gray-300',
                )}
                onTriggerPointerEnter={() =>
                  handleCellHoverEnter(
                    task.id,
                    'assigned_user',
                    task.assigned_to_id ? String(task.assigned_to_id) : '',
                    { openOnHover: false },
                  )
                }
                onTriggerPointerLeave={() => handleCellHoverLeave(task.id, 'assigned_user')}
              />
            </div>
          )
        }

        return (
          <div className="task-cell flex min-w-0 items-center gap-2" ref={(el) => measureCellWidth(task.id, 'assigned_user', el)}>
            {leadingSlot}
            <span
              data-editable-cell
              className={cn(
                "flex min-w-0 flex-1 cursor-text items-center rounded border border-transparent px-1 py-0.5 text-sm transition-colors hover:border-gray-300 hover:bg-white",
                isHoverActive(task.id, 'assigned_user') && 'bg-white border-gray-300'
              )}
              {...(isHoverActive(task.id, 'assigned_user') && {
                'data-hover-overlay': '',
                onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
              })}
              onClick={(e) => {
                e.stopPropagation()
                handleCellEdit(task.id, 'assigned_user', task.assigned_to_id ? String(task.assigned_to_id) : '', 'click')
              }}
              onPointerEnter={() => handleCellHoverEnter(task.id, 'assigned_user', task.assigned_to_id ? String(task.assigned_to_id) : '')}
              onPointerLeave={() => handleCellHoverLeave(task.id, 'assigned_user')}
            >
              {task.assigned_to_id ? (
                <span className="truncate whitespace-nowrap overflow-hidden">{displayName}</span>
              ) : (
                <span className="block">&nbsp;</span>
              )}
            </span>
          </div>
        )
      },
      size: columnSizing.users,
      minSize: getColumnMinWidth('assigned_user'),
      maxSize: 1000,
      enableResizing: true,
    },
    {
      accessorKey: 'projects',
      header: () => (
        <button type="button" data-no-dnd onPointerDown={stopDnd} onMouseDown={stopDnd} onTouchStart={stopDnd} className={cn('truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-medium', 'bg-transparent border-0 p-0 m-0 cursor-pointer flex items-center', sortBy === 'projects' ? 'text-black' : 'text-gray-500 hover:text-black')} onClick={() => handleHeaderClick('projects')}>
          Project
          {sortBy === 'projects' && <Arrow direction={sortOrder} />}
        </button>
      ),
      cell: info => {
        const task = info.row.original
        const isEditing = editingCell?.taskId === task.id && editingCell?.field === 'projects'
        const projectName =
          task.projects?.name ??
          task.project_name ??
          null

        const projectColor =
          task.projects?.color ??
          task.project_color ??
          null

        const projectLogoUrl = task.projectLogoUrl ?? getImageUrl(task.project_logo ?? task.projects?.logo) ?? null

        const leadingSlot = (
          <div className="leading-slot flex h-4 w-4 shrink-0 items-center justify-center">
            {projectName ? (
              projectLogoUrl ? (
                <img
                  src={projectLogoUrl}
                  alt={projectName}
                  className="h-4 w-4 rounded-sm object-cover"
                />
              ) : (
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: projectColor || '#e5e7eb' }}
                />
              )
            ) : (
              <span className="block h-4 w-4" aria-hidden />
            )}
          </div>
        )

        if (isEditing) {
          const projectOptions = (editFields?.projects || [])
            .filter((opt: any) => opt.active === undefined || opt.active === true)
            .map((p: any) => ({
              value: p.id,
              label: p.name,
              logo: p.logo ?? p.logo_url ?? p.logoUrl ?? null,
              color: p.color ?? null,
            }))
          const currentProjectId = editingValue ?? (task?.project_id_int ?? (Array.isArray(task?.projects) ? task.projects[0]?.id : task?.projects?.id) ?? '')
          const measuredW = getMeasuredWidth(task.id, 'projects')
          return (
            <div className="task-cell relative flex shrink-0 items-center" data-active-editor data-inline-editor style={measuredW ? { width: measuredW, minWidth: 160, maxWidth: measuredW } : { minWidth: 160 }}>
              <div className="absolute inset-0 flex items-center" style={{ paddingLeft: 8, paddingRight: 8 }}>
                <InlineSelect
                  options={projectOptions}
                  value={currentProjectId}
                  onChange={(val) => handleCellSaveWithValue(task.id, 'projects', String(val), task)}
                  onBlur={() => handleCellCancel()}
                  placeholder="Select project"
                  emptyOption={{ value: '', label: 'No project' }}
                  showMedia="logo"
                  autoFocus={editIntent !== 'hover' && !isScrolling}
                  debugLabel="project"
                />
              </div>
              <div className="invisible flex min-w-0 flex-1 items-center gap-2" aria-hidden>
                {leadingSlot}
                <span className="truncate text-sm">{projectName || '\u00A0'}</span>
              </div>
            </div>
          )
        }

        return (
          <div className="task-cell flex min-w-0 items-center gap-2" ref={(el) => measureCellWidth(task.id, 'projects', el)}>
            {leadingSlot}
            <span
              data-editable-cell
              className={cn(
                "flex min-w-0 flex-1 cursor-text items-center rounded border border-transparent px-1 py-0.5 text-sm transition-colors hover:border-gray-300 hover:bg-white",
                isHoverActive(task.id, 'projects') && 'bg-white border-gray-300'
              )}
              {...(isHoverActive(task.id, 'projects') && {
                'data-hover-overlay': '',
                onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
              })}
              onClick={(e) => {
                e.stopPropagation()
                handleCellEdit(task.id, 'projects', task.project_id_int ? String(task.project_id_int) : '')
              }}
              onPointerEnter={() => handleCellHoverEnter(task.id, 'projects', task.project_id_int ? String(task.project_id_int) : '')}
              onPointerLeave={() => handleCellHoverLeave(task.id, 'projects')}
            >
              {projectName ? (
                <span className="truncate whitespace-nowrap overflow-hidden">{projectName}</span>
              ) : (
                <span className="block">&nbsp;</span>
              )}
            </span>
          </div>
        )
      },
      size: columnSizing.projects,
      minSize: getColumnMinWidth('projects'),
      maxSize: 1000,
      enableResizing: true,
    },
    {
      accessorKey: 'project_statuses',
      header: () => (
        <button type="button" data-no-dnd onPointerDown={stopDnd} onMouseDown={stopDnd} onTouchStart={stopDnd} className={cn('truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-medium', 'bg-transparent border-0 p-0 m-0 cursor-pointer flex items-center', sortBy === 'project_statuses' ? 'text-black' : 'text-gray-500 hover:text-black')} onClick={() => handleHeaderClick('project_statuses')}>
          Status
          {sortBy === 'project_statuses' && <Arrow direction={sortOrder} />}
        </button>
      ),
      cell: info => {
        const task = info.row.original
        const status = task.project_statuses ?? (task.project_status_name ? { name: task.project_status_name, color: task.project_status_color } : null);
        const name = status?.name ?? '';
        const color = status?.color;
        const isEditing = editingCell?.taskId === task.id && editingCell?.field === 'project_statuses'
        
        if (isEditing) {
          const filteredStatuses = getFilteredStatusesForTask(task)
          const statusOptions = filteredStatuses.map((s: any) => ({
            value: s.name,
            label: s.name,
            color: s.color ?? null,
          }))
          const currentStatusName = editingValue || name
          const measuredW = getMeasuredWidth(task.id, 'project_statuses')
          return (
            <div
              className="task-cell relative inline-flex shrink-0"
              data-active-editor
              data-inline-editor
              style={measuredW ? { width: measuredW, minWidth: 160, maxWidth: measuredW } : { minWidth: 160 }}
            >
              <div className="absolute inset-0 flex items-center px-1">
                <InlineSelect
                  options={statusOptions}
                  value={currentStatusName}
                  onChange={(val) => handleCellSaveWithValue(task.id, 'project_statuses', String(val), task)}
                  onBlur={() => handleCellCancel()}
                  placeholder="Select status"
                  showMedia="color"
                  autoFocus={editIntent !== 'hover' && !isScrolling}
                />
              </div>
              <span className="status-pill invisible inline-flex h-5 items-center justify-center rounded-full px-2 text-[11px] leading-none" aria-hidden>
                {name || '\u00A0'}
              </span>
            </div>
          )
        }
        
        if (!name) {
          return (
            <span
              data-editable-cell
              className={cn(
                "task-cell block h-5 cursor-text rounded border border-transparent transition-colors hover:border-gray-300 hover:bg-white",
                isHoverActive(task.id, 'project_statuses') && 'bg-white border-gray-300'
              )}
              {...(isHoverActive(task.id, 'project_statuses') && {
                'data-hover-overlay': '',
                onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
              })}
              onClick={(e) => {
                e.stopPropagation()
                handleCellEdit(task.id, 'project_statuses', '')
              }}
              onPointerEnter={() => handleCellHoverEnter(task.id, 'project_statuses', '')}
              onPointerLeave={() => handleCellHoverLeave(task.id, 'project_statuses')}
            >
              &nbsp;
            </span>
          );
        }
        return (
          <span
            ref={(el) => measureCellWidth(task.id, 'project_statuses', el)}
            data-editable-cell
            className={cn(
              "task-cell status-pill inline-flex h-5 w-fit shrink-0 cursor-text items-center justify-center whitespace-nowrap rounded-full px-2 text-[11px] font-normal leading-none box-border",
              "ring-2 transition-colors",
              isHoverActive(task.id, 'project_statuses') ? 'ring-gray-300' : 'ring-transparent'
            )}
            {...(isHoverActive(task.id, 'project_statuses') && {
              'data-hover-overlay': '',
              onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
            })}
            style={{
              backgroundColor: color || '#e5e7eb',
              color: color ? '#fff' : '#374151',
              minWidth: 36,
              textAlign: 'center',
            }}
            title={name}
            onClick={(e) => {
              e.stopPropagation()
              handleCellEdit(task.id, 'project_statuses', name)
            }}
            onPointerEnter={() => {
              handleCellHoverEnter(task.id, 'project_statuses', name)
            }}
            onPointerLeave={() => handleCellHoverLeave(task.id, 'project_statuses')}
          >
            {name}
          </span>
        );
      },
      size: columnSizing.project_statuses,
      minSize: getColumnMinWidth('project_statuses'),
      maxSize: 1000,
      enableResizing: true,
    },
    {
      accessorKey: 'delivery_date',
      header: () => (
        <button type="button" data-no-dnd onPointerDown={stopDnd} onMouseDown={stopDnd} onTouchStart={stopDnd} className={cn('truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-medium', 'bg-transparent border-0 p-0 m-0 cursor-pointer flex items-center', sortBy === 'delivery_date' ? 'text-black' : 'text-gray-500 hover:text-black')} onClick={() => handleHeaderClick('delivery_date')}>
          Due date
          {sortBy === 'delivery_date' && <Arrow direction={sortOrder} />}
        </button>
      ),
      cell: info => {
        const task = info.row.original;
        const isEditing = editingCell?.taskId === task.id && editingCell?.field === 'delivery_date'
        const isCompactDate = !!(info as any)?.compact
        const date = isCompactDate
          ? formatCompactDateDisplay(task.delivery_date)
          : formatDateWithYear(task.delivery_date);

        if (isCompactDate) {
          const isoValue = task.delivery_date
            ? new Date(task.delivery_date).toISOString().split('T')[0]
            : ''
          return (
            <div
              className="inline-flex shrink-0 items-center"
              data-inline-editor
              ref={(el) => measureCellWidth(task.id, 'delivery_date', el)}
              onPointerEnter={() =>
                handleCellHoverEnter(task.id, 'delivery_date', isoValue, { openOnHover: false })
              }
              onPointerLeave={() => handleCellHoverLeave(task.id, 'delivery_date')}
            >
              <InlineDateEditor
                compact
                value={isoValue}
                onChange={() => {}}
                onBlur={() => handleCellCancel()}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Escape') handleCellCancel()
                }}
                onSave={(savedIso) =>
                  handleCellSaveWithValue(task.id, 'delivery_date', savedIso, task)
                }
                openCalendarOnMount={false}
                isActive={isHoverActive(task.id, 'delivery_date')}
                className={cn(task.is_overdue ? 'font-medium text-red-600' : 'text-gray-500')}
              />
            </div>
          )
        }
        
        if (isEditing) {
          const isoValue = editingValue || (task.delivery_date ? new Date(task.delivery_date).toISOString().split('T')[0] : '')
          const measuredW = getMeasuredWidth(task.id, 'delivery_date')
          return (
            <div className="task-cell shrink-0" data-active-editor data-inline-editor style={measuredW ? { width: measuredW, minWidth: 160, maxWidth: measuredW } : { minWidth: 160 }}>
              <InlineDateEditor
                value={isoValue}
                onChange={(v) => setEditingValue(v)}
                onBlur={() => handleCellSave(task.id, 'delivery_date')}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Escape') handleCellCancel()
                }}
                onSave={() => handleCellSave(task.id, 'delivery_date')}
                autoFocus={editIntent !== 'hover' && !isScrolling}
                openCalendarOnMount
              />
            </div>
          )
        }

        return (
          <span
            data-editable-cell
            role="button"
            tabIndex={0}
            aria-label={`Edit delivery date${date ? `, ${date}` : ''}`}
            className={cn(
              "task-cell flex max-w-full cursor-pointer items-center truncate whitespace-nowrap overflow-hidden text-ellipsis rounded border border-transparent px-1 py-0 text-sm leading-none transition-colors hover:border-gray-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
              task.is_overdue && "text-red-600 font-medium",
              isHoverActive(task.id, 'delivery_date') && 'bg-white border border-gray-300'
            )}
            {...(isHoverActive(task.id, 'delivery_date') && {
              'data-hover-overlay': '',
              onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
            })}
            onClick={(e) => {
              e.stopPropagation()
              const dateValue = task.delivery_date ? new Date(task.delivery_date).toISOString().split('T')[0] : ''
              handleCellEdit(task.id, 'delivery_date', dateValue)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                const dateValue = task.delivery_date ? new Date(task.delivery_date).toISOString().split('T')[0] : ''
                handleCellEdit(task.id, 'delivery_date', dateValue)
              }
            }}
            // Hover shows the visual affordance only; the calendar opens on click / keyboard, not hover.
            onPointerEnter={() => {
              const dateValue = task.delivery_date
                ? new Date(task.delivery_date).toISOString().split('T')[0]
                : ''
              handleCellHoverEnter(task.id, 'delivery_date', dateValue, { openOnHover: false })
            }}
            onPointerLeave={() => handleCellHoverLeave(task.id, 'delivery_date')}
            ref={(el) => measureCellWidth(task.id, 'delivery_date', el)}
          >
            {date}
          </span>
        );
      },
      size: columnSizing.delivery_date,
      minSize: getColumnMinWidth('delivery_date'),
      maxSize: 1000,
      enableResizing: true,
    },
    {
      accessorKey: 'publication_date',
      header: () => (
        <button type="button" data-no-dnd onPointerDown={stopDnd} onMouseDown={stopDnd} onTouchStart={stopDnd} className={cn('truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-medium', 'bg-transparent border-0 p-0 m-0 cursor-pointer flex items-center', sortBy === 'publication_date' ? 'text-black' : 'text-gray-500 hover:text-black')} onClick={() => handleHeaderClick('publication_date')}>
          Publish date
          {sortBy === 'publication_date' && <Arrow direction={sortOrder} />}
        </button>
      ),
      cell: info => {
        const task = info.row.original;
        const isEditing = editingCell?.taskId === task.id && editingCell?.field === 'publication_date'
        const isCompactDate = !!(info as any)?.compact
        const date = isCompactDate
          ? formatCompactDateDisplay(task.publication_date)
          : formatDateWithYear(task.publication_date);

        if (isCompactDate) {
          const isoValue = task.publication_date
            ? new Date(task.publication_date).toISOString().split('T')[0]
            : ''
          return (
            <div
              className="inline-flex shrink-0 items-center"
              data-inline-editor
              ref={(el) => measureCellWidth(task.id, 'publication_date', el)}
              onPointerEnter={() =>
                handleCellHoverEnter(task.id, 'publication_date', isoValue, { openOnHover: false })
              }
              onPointerLeave={() => handleCellHoverLeave(task.id, 'publication_date')}
            >
              <InlineDateEditor
                compact
                value={isoValue}
                onChange={() => {}}
                onBlur={() => handleCellCancel()}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Escape') handleCellCancel()
                }}
                onSave={(savedIso) =>
                  handleCellSaveWithValue(task.id, 'publication_date', savedIso, task)
                }
                openCalendarOnMount={false}
                isActive={isHoverActive(task.id, 'publication_date')}
                className={cn(
                  task.is_publication_overdue ? 'font-medium text-red-600' : 'text-gray-500',
                )}
              />
            </div>
          )
        }
        
        if (isEditing) {
          const isoValue = editingValue || (task.publication_date ? new Date(task.publication_date).toISOString().split('T')[0] : '')
          const measuredW = getMeasuredWidth(task.id, 'publication_date')
          return (
            <div className="task-cell shrink-0" data-active-editor data-inline-editor style={measuredW ? { width: measuredW, minWidth: 160, maxWidth: measuredW } : { minWidth: 160 }}>
              <InlineDateEditor
                value={isoValue}
                onChange={(v) => setEditingValue(v)}
                onBlur={() => handleCellSave(task.id, 'publication_date')}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Escape') handleCellCancel()
                }}
                onSave={() => handleCellSave(task.id, 'publication_date')}
                autoFocus={editIntent !== 'hover' && !isScrolling}
                openCalendarOnMount
              />
            </div>
          )
        }

        return (
          <span
            data-editable-cell
            role="button"
            tabIndex={0}
            aria-label={`Edit publication date${date ? `, ${date}` : ''}`}
            className={cn(
              "task-cell flex max-w-full cursor-pointer items-center truncate whitespace-nowrap overflow-hidden text-ellipsis rounded border border-transparent px-1 py-0 text-sm leading-none transition-colors hover:border-gray-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
              task.is_publication_overdue && "text-red-600 font-medium",
              isHoverActive(task.id, 'publication_date') && 'bg-white border border-gray-300'
            )}
            {...(isHoverActive(task.id, 'publication_date') && {
              'data-hover-overlay': '',
              onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
            })}
            onClick={(e) => {
              e.stopPropagation()
              const dateValue = task.publication_date ? new Date(task.publication_date).toISOString().split('T')[0] : ''
              handleCellEdit(task.id, 'publication_date', dateValue)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                const dateValue = task.publication_date ? new Date(task.publication_date).toISOString().split('T')[0] : ''
                handleCellEdit(task.id, 'publication_date', dateValue)
              }
            }}
            // Hover shows the visual affordance only; the calendar opens on click / keyboard, not hover.
            onPointerEnter={() => {
              const dateValue = task.publication_date
                ? new Date(task.publication_date).toISOString().split('T')[0]
                : ''
              handleCellHoverEnter(task.id, 'publication_date', dateValue, { openOnHover: false })
            }}
            onPointerLeave={() => handleCellHoverLeave(task.id, 'publication_date')}
            ref={(el) => measureCellWidth(task.id, 'publication_date', el)}
          >
            {date}
          </span>
        );
      },
      size: columnSizing.publication_date,
      minSize: getColumnMinWidth('publication_date'),
      maxSize: 1000,
      enableResizing: true,
    },
    {
      accessorKey: 'updated_at',
      header: () => (
        <button type="button" data-no-dnd onPointerDown={stopDnd} onMouseDown={stopDnd} onTouchStart={stopDnd} className={cn('truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-medium', 'bg-transparent border-0 p-0 m-0 cursor-pointer flex items-center', sortBy === 'updated_at' ? 'text-black' : 'text-gray-500 hover:text-black')} onClick={() => handleHeaderClick('updated_at')}>
          Last Update
          {sortBy === 'updated_at' && <Arrow direction={sortOrder} />}
        </button>
      ),
      cell: info => <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">{formatDateWithYear(info.row.original.updated_at)}</span>,
      size: columnSizing.updated_at,
      minSize: getColumnMinWidth('updated_at'),
      maxSize: 1000,
      enableResizing: true,
    },
    {
      accessorKey: 'content_type_title',
      header: () => (
        <button type="button" data-no-dnd onPointerDown={stopDnd} onMouseDown={stopDnd} onTouchStart={stopDnd} className={cn('truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-medium', 'bg-transparent border-0 p-0 m-0 cursor-pointer flex items-center', sortBy === 'content_type_title' ? 'text-black' : 'text-gray-500 hover:text-black')} onClick={() => handleHeaderClick('content_type_title')}>
          Content Type
          {sortBy === 'content_type_title' && <Arrow direction={sortOrder} />}
        </button>
      ),
      cell: info => {
        const task = info.row.original
        const isEditing = editingCell?.taskId === task.id && editingCell?.field === 'content_type_title'
        
        if (isEditing) {
          const filteredContentTypes = getFilteredContentTypesForTask(task)
          const contentTypeOptions = filteredContentTypes.map((ct: any) => ({
            value: ct.title,
            label: ct.title,
          }))
          const currentValue = editingValue ?? task.content_type_title ?? ''
          const measuredW = getMeasuredWidth(task.id, 'content_type_title')
          return (
            <div className="task-cell relative shrink-0" data-active-editor data-inline-editor style={measuredW ? { width: measuredW, minWidth: 160, maxWidth: measuredW } : { minWidth: 160 }}>
              <div className="absolute inset-0 flex items-center px-1">
                <InlineSelect
                  options={contentTypeOptions}
                  value={currentValue}
                  onChange={(val) => handleCellSaveWithValue(task.id, 'content_type_title', String(val), task)}
                  onBlur={() => handleCellCancel()}
                  placeholder="Select content type"
                  emptyOption={{ value: '', label: 'No content type' }}
                  showMedia="none"
                  autoFocus={editIntent !== 'hover' && !isScrolling}
                />
              </div>
              <span className="invisible truncate block flex items-center" aria-hidden>
                {task.content_type_title || '\u00A0'}
              </span>
            </div>
          )
        }

        return (
          <span
            ref={(el) => measureCellWidth(task.id, 'content_type_title', el)}
            data-editable-cell
            className={cn(
              "task-cell truncate block max-w-full min-w-0 whitespace-nowrap overflow-hidden text-ellipsis cursor-text border border-transparent hover:bg-white hover:border-gray-300 px-1 py-0.5 rounded transition-colors flex items-center",
              isHoverActive(task.id, 'content_type_title') && 'bg-white border border-gray-300'
            )}
            title={task.content_type_title || undefined}
            {...(isHoverActive(task.id, 'content_type_title') && {
              'data-hover-overlay': '',
              onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
            })}
            onClick={(e) => {
              e.stopPropagation()
              handleCellEdit(task.id, 'content_type_title', task.content_type_title || '')
            }}
            onPointerEnter={() => {
              handleCellHoverEnter(task.id, 'content_type_title', task.content_type_title || '')
            }}
            onPointerLeave={() => handleCellHoverLeave(task.id, 'content_type_title')}
          >
            {task.content_type_title || ''}
          </span>
        )
      },
      size: 140,
      minSize: getColumnMinWidth('content_type_title'),
      maxSize: 1000,
      enableResizing: true,
    },
    {
      accessorKey: 'production_type_title',
      header: () => (
        <button type="button" data-no-dnd onPointerDown={stopDnd} onMouseDown={stopDnd} onTouchStart={stopDnd} className={cn('truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-medium', 'bg-transparent border-0 p-0 m-0 cursor-pointer flex items-center', sortBy === 'production_type_title' ? 'text-black' : 'text-gray-500 hover:text-black')} onClick={() => handleHeaderClick('production_type_title')}>
          Production Type
          {sortBy === 'production_type_title' && <Arrow direction={sortOrder} />}
        </button>
      ),
      cell: info => {
        const task = info.row.original
        const isEditing = editingCell?.taskId === task.id && editingCell?.field === 'production_type_title'
        
        if (isEditing) {
          const filteredProductionTypes = getFilteredProductionTypesForTask(task)
          const productionTypeOptions = filteredProductionTypes.map((pt: any) => ({
            value: pt.title,
            label: pt.title,
          }))
          const currentValue = editingValue ?? task.production_type_title ?? ''
          const measuredW = getMeasuredWidth(task.id, 'production_type_title')
          return (
            <div className="task-cell relative shrink-0" data-active-editor data-inline-editor style={measuredW ? { width: measuredW, minWidth: 160, maxWidth: measuredW } : { minWidth: 160 }}>
              <div className="absolute inset-0 flex items-center px-1">
                <InlineSelect
                  options={productionTypeOptions}
                  value={currentValue}
                  onChange={(val) => handleCellSaveWithValue(task.id, 'production_type_title', String(val), task)}
                  onBlur={() => handleCellCancel()}
                  placeholder="Select production type"
                  emptyOption={{ value: '', label: 'No production type' }}
                  showMedia="none"
                  autoFocus={editIntent !== 'hover' && !isScrolling}
                />
              </div>
              <span className="invisible truncate block flex items-center" aria-hidden>
                {task.production_type_title || '\u00A0'}
              </span>
            </div>
          )
        }
        
        return (
          <span
            ref={(el) => measureCellWidth(task.id, 'production_type_title', el)}
            data-editable-cell
            className={cn(
              "task-cell truncate block max-w-full min-w-0 whitespace-nowrap overflow-hidden text-ellipsis cursor-text border border-transparent hover:bg-white hover:border-gray-300 px-1 py-0.5 rounded transition-colors flex items-center",
              isHoverActive(task.id, 'production_type_title') && 'bg-white border border-gray-300'
            )}
            title={task.production_type_title || undefined}
            {...(isHoverActive(task.id, 'production_type_title') && {
              'data-hover-overlay': '',
              onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
            })}
            onClick={(e) => {
              e.stopPropagation()
              handleCellEdit(task.id, 'production_type_title', task.production_type_title || '')
            }}
            onPointerEnter={() => {
              handleCellHoverEnter(task.id, 'production_type_title', task.production_type_title || '')
            }}
            onPointerLeave={() => handleCellHoverLeave(task.id, 'production_type_title')}
          >
            {task.production_type_title || ''}
          </span>
        )
      },
      size: 140,
      minSize: getColumnMinWidth('production_type_title'),
      maxSize: 1000,
      enableResizing: true,
    },
    {
      accessorKey: 'language_code',
      header: () => (
        <button type="button" data-no-dnd onPointerDown={stopDnd} onMouseDown={stopDnd} onTouchStart={stopDnd} className={cn('truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-medium', 'bg-transparent border-0 p-0 m-0 cursor-pointer flex items-center', sortBy === 'language_code' ? 'text-black' : 'text-gray-500 hover:text-black')} onClick={() => handleHeaderClick('language_code')}>
          Language
          {sortBy === 'language_code' && <Arrow direction={sortOrder} />}
        </button>
      ),
      cell: info => {
        const task = info.row.original
        const isEditing = editingCell?.taskId === task.id && editingCell?.field === 'language_code'
        
        if (isEditing) {
          const filteredLanguages = getFilteredLanguagesForTask(task)
          const languageOptions = filteredLanguages.map((lang: any) => ({
            value: String(lang.id),
            label: lang.long_name || lang.code,
          }))
          const currentLanguageId = editingValue ?? (task.language_id ? String(task.language_id) : '')
          const measuredW = getMeasuredWidth(task.id, 'language_code')
          return (
            <div className="task-cell relative shrink-0" data-active-editor data-inline-editor style={measuredW ? { width: measuredW, minWidth: 160, maxWidth: measuredW } : { minWidth: 160 }}>
              <div className="absolute inset-0 flex items-center px-1">
                <InlineSelect
                  options={languageOptions}
                  value={currentLanguageId}
                  onChange={(val) => handleCellSaveWithValue(task.id, 'language_code', String(val), task)}
                  onBlur={() => handleCellCancel()}
                  placeholder="Select language"
                  emptyOption={{ value: '', label: 'No language' }}
                  showMedia="none"
                  autoFocus={editIntent !== 'hover' && !isScrolling}
                />
              </div>
              <span className="invisible truncate block flex items-center" aria-hidden>
                {task.language_code || '\u00A0'}
              </span>
            </div>
          )
        }
        
        return (
          <span
            data-editable-cell
            className={cn(
              "task-cell truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis cursor-text border border-transparent hover:bg-white hover:border-gray-300 px-1 py-0.5 rounded transition-colors flex items-center",
              isHoverActive(task.id, 'language_code') && 'bg-white border border-gray-300'
            )}
            {...(isHoverActive(task.id, 'language_code') && {
              'data-hover-overlay': '',
              onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
            })}
            onClick={(e) => {
              e.stopPropagation()
              // Use language_id for editing (same as TaskDetails)
              handleCellEdit(task.id, 'language_code', task.language_id ? String(task.language_id) : '')
            }}
            onPointerEnter={() => {
              handleCellHoverEnter(task.id, 'language_code', task.language_id ? String(task.language_id) : '')
            }}
            onPointerLeave={() => handleCellHoverLeave(task.id, 'language_code')}
            ref={(el) => measureCellWidth(task.id, 'language_code', el)}
          >
            {task.language_code || ''}
          </span>
        )
      },
      size: 100,
      minSize: getColumnMinWidth('language_code'),
      maxSize: 1000,
      enableResizing: true,
    },
  ]

  useEffect(() => {
    if (hasHydrated) {
      setHasMeasured(true);
    }
  }, [columnSizing, hasHydrated]);

 

  // --- trailingQuery uses sort from URL ---
  const trailingQuery = React.useCallback((query: any) => {
    const searchQuery = params.get('q') || ''
    const assignedTo = params.get('assignedTo')?.split(',').filter(Boolean) ?? []
    const status = params.get('status')?.split(',').filter(Boolean) ?? []
    const project = params.get('project')?.split(',').filter(Boolean) ?? []
    const contentType = params.get('contentType')?.split(',').filter(Boolean) ?? []
    const productionType = params.get('productionType')?.split(',').filter(Boolean) ?? []
    const language = params.get('language')?.split(',').filter(Boolean) ?? []
    const channels = params.get('channels')?.split(',').filter(Boolean) ?? []
    const deliveryDateFrom = params.get('deliveryDateFrom')
    const deliveryDateTo = params.get('deliveryDateTo')
    const publicationDateFrom = params.get('publicationDateFrom')
    const publicationDateTo = params.get('publicationDateTo')

    // Use search_vector for full-text search
    if (searchQuery && searchQuery.length > 0) {
      query = query.textSearch('search_vector', searchQuery, { config: 'english', type: 'plain' })
    }
    if (assignedTo.length > 0) {
      query = query.in('assigned_to_id', assignedTo)
    }
    if (status.length > 0) {
      query = query.in('project_status_id', status)
    }
    if (project.length > 0) {
      query = query.in('project_id_int', project)
    }
    if (contentType.length > 0) {
      query = query.in('content_type_id', contentType)
    }
    if (productionType.length > 0) {
      query = query.in('production_type_id', productionType)
    }
    if (language.length > 0) {
      query = query.in('language_id', language)
    }
    if (channels.length > 0) {
      query = query.overlaps('channels', channels)
    }
    if (deliveryDateFrom) {
      query = query.gte('delivery_date', deliveryDateFrom)
    }
    if (deliveryDateTo) {
      query = query.lte('delivery_date', deliveryDateTo)
    }
    if (publicationDateFrom) {
      query = query.gte('publication_date', publicationDateFrom)
    }
    if (publicationDateTo) {
      query = query.lte('publication_date', publicationDateTo)
    }
    // Use sortBy and sortOrder from state (synced with URL)
    if (sortBy) {
      query = query.order(sortBy, { ascending: sortOrder === 'asc' })
    }
    // Only fetch top-level tasks (not subtasks) if no search or filter is active
    const isFilterActive =
      !!searchQuery ||
      assignedTo.length > 0 ||
      status.length > 0 ||
      project.length > 0 ||
      contentType.length > 0 ||
      productionType.length > 0 ||
      language.length > 0 ||
      channels.length > 0 ||
      deliveryDateFrom ||
      deliveryDateTo ||
      publicationDateFrom ||
      publicationDateTo;
    if (!isFilterActive) {
      query = query.is('parent_task_id_int', null)
    }
    return query
  }, [params])

  // --- Reset InfiniteList on sort change by key ---
  // Exclude 'id' param from the key to prevent reloads on selection
  const filterParams = (() => {
    const obj = Object.fromEntries(params.entries());
    delete obj.id;
    return obj;
  })();
  const filterParamsString = Object.entries(filterParams).map(([k, v]) => `${k}=${v}`).join('&');
  const infiniteListKey = `${rowSortBy}-${rowSortOrder}-${filterParamsString}`;

  // --- Typesense Search Integration (ungrouped view only) ---
  // Use URL param for search (inline search updates URL). When in project scope, project comes from scope.
  const q = params.get('q') || '';
  const urlProject = params.get('project') || undefined;
  const project = useTasksScopeProjectParam(urlProject) ?? urlProject;
  const filters: Record<string, string | string[]> = {};
  
  // Handle assignedTo filter - convert from user IDs to names using editFields
  const assignedToParam = params.get('assignedTo');
  if (assignedToParam) {
    const assignedToIds = assignedToParam.includes(',') ? assignedToParam.split(',') : [assignedToParam];
    // Convert IDs to names for filtering
    if (editFields?.project_watchers) {
      const assignedToNames = assignedToIds
        .map(id => {
          const watcher = editFields.project_watchers.find((w: any) => String(w.user_id) === String(id));
          return watcher?.users?.full_name;
        })
        .filter(Boolean);
      if (assignedToNames.length > 0) {
        filters['assigned_to_name'] = assignedToNames;
      }
    } else {
      // Fallback: use IDs directly if editFields not available
      filters['assigned_to_id'] = assignedToIds;
    }
  }
  
  // Handle status filter - map from URL 'status' param to 'project_status_name' for compatibility
  const statusParam = params.get('status');
  if (statusParam) {
    filters['project_status_name'] = statusParam.includes(',') ? statusParam.split(',') : statusParam;
  }
  
  // Handle contentType filter - convert from IDs to titles
  const contentTypeParam = params.get('contentType');
  if (contentTypeParam && editFields?.content_types) {
    const contentTypeIds = contentTypeParam.includes(',') ? contentTypeParam.split(',') : [contentTypeParam];
    const contentTypeTitles = contentTypeIds
      .map(id => {
        const ct = editFields.content_types.find((c: any) => String(c.id) === String(id));
        return ct?.title;
      })
      .filter(Boolean);
    if (contentTypeTitles.length > 0) {
      filters['content_type_title'] = contentTypeTitles;
    }
  }
  
  // Handle productionType filter - convert from IDs to titles
  const productionTypeParam = params.get('productionType');
  if (productionTypeParam && editFields?.production_types) {
    const productionTypeIds = productionTypeParam.includes(',') ? productionTypeParam.split(',') : [productionTypeParam];
    const productionTypeTitles = productionTypeIds
      .map(id => {
        const pt = editFields.production_types.find((p: any) => String(p.id) === String(id));
        return pt?.title;
      })
      .filter(Boolean);
    if (productionTypeTitles.length > 0) {
      filters['production_type_title'] = productionTypeTitles;
    }
  }
  
  // Handle language filter - convert from IDs to codes
  const languageParam = params.get('language');
  if (languageParam && editFields?.languages) {
    const languageIds = languageParam.includes(',') ? languageParam.split(',') : [languageParam];
    const languageCodes = languageIds
      .map(id => {
        const lang = editFields.languages.find((l: any) => String(l.id) === String(id));
        return lang?.code || lang?.long_name;
      })
      .filter(Boolean);
    if (languageCodes.length > 0) {
      filters['language_code'] = languageCodes;
    }
  }
  
  // Handle other filter fields that come directly as names/titles
  const filterFields = [
    'channel_names',
    'project_name',
  ];
  for (const field of filterFields) {
    const value = params.get(field);
    if (value) {
      filters[field] = value.includes(',') ? value.split(',') : value;
    }
  }
  
  // Handle overdue status filter - map from URL 'overdueStatus' param to filter fields
  const overdueStatusParam = params.get('overdueStatus');
  if (overdueStatusParam) {
    const overdueStatuses = overdueStatusParam.includes(',') ? overdueStatusParam.split(',') : [overdueStatusParam];
    filters['overdueStatus'] = overdueStatuses;
  }
  
  // Debug logging
  console.log('[TaskList] URL params:', {
    q,
    project,
    status: statusParam,
    assignedTo: assignedToParam,
    contentType: contentTypeParam,
    productionType: productionTypeParam,
    language: languageParam,
    filters,
  });

  // Hydration gate so we don't fire ungrouped requests before grouping is known.
  const [groupingReady, setGroupingReady] = useState(false);
  useEffect(() => {
    setGroupingReady(true);
  }, []);

  // Ungrouped view now uses UnifiedGroupedTaskList + task_group_tasks_filtered (p_group_key='all').
  // Disable the old stream RPC so we never call task_list_stream_grouped_v2.
  const taskListViewQuery = useTaskListViewQuery({
    q,
    project,
    filters,
    pageSize: 50,
    sortBy: rowSortBy,
    sortOrder: rowSortOrder,
    enabled: false, // Ungrouped uses task_group_tasks_filtered via UnifiedGroupedTaskList
    editFields,
  });

  // Move taskListViewTasks above table
  const taskListViewTasks = useMemo(() => {
    if (!isGroupedView) {
      return taskListViewQuery.data.filter(task => !task.parent_task_id_int);
    }
    return taskListViewQuery.data;
  }, [taskListViewQuery.data, isGroupedView]);

  // Derive image URLs once per data load (storage path -> public URL), avoiding per-cell recompute.
  const taskListViewTasksWithImageUrls = useMemo(() => {
    return taskListViewTasks.map((task: any) => ({
      ...task,
      projectLogoUrl: getImageUrl(task.project_logo ?? task.projects?.logo),
      assignedToPhotoUrl: getImageUrl(task.assigned_to_photo ?? task.assigned_user?.photo),
    }))
  }, [taskListViewTasks])

  const plannerVisibility = useTasksUI((s) => s.plannerVisibility)

  const projectIdsForSuggestions = useMemo(() => {
    const parseList = (v: string | null | undefined) =>
      (v ?? '')
        .split(',')
        .map((x) => Number.parseInt(x.trim(), 10))
        .filter((n) => Number.isFinite(n))

    const fromProjectParam = parseList(project)
    if (fromProjectParam.length > 0) return fromProjectParam

    const fromProjectIdParam = parseList(params.get('projectId'))
    if (fromProjectIdParam.length > 0) return fromProjectIdParam

    // No project filter -> load suggestions across all accessible projects (RLS enforced)
    return null
  }, [project, params.toString()])

  const suggestionsRange = useMemo(() => {
    const parse = (v: string | null) => (v ? new Date(v) : null)
    const fromCandidates = [
      parse(params.get('deliveryDateFrom')),
      parse(params.get('publicationDateFrom')),
    ].filter(Boolean) as Date[]
    const toCandidates = [
      parse(params.get('deliveryDateTo')),
      parse(params.get('publicationDateTo')),
    ].filter(Boolean) as Date[]

    if (fromCandidates.length || toCandidates.length) {
      const from = fromCandidates.length ? new Date(Math.min(...fromCandidates.map(d => d.getTime()))) : new Date()
      const to =
        toCandidates.length
          ? new Date(Math.max(...toCandidates.map(d => d.getTime())))
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      return { from, to }
    }

    // Default window: start of this month → end of next month.
    // This avoids dropping early-month suggestions (e.g. Feb 1) when "today" is later in the month.
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    const to = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999)
    return { from, to }
  }, [params.toString()])

  const suggestionsQuery = useTaskSuggestionsQuery({
    projectIds: projectIdsForSuggestions,
    contentTypeIds: (() => {
      const raw = params.get('contentType')
      if (!raw) return null
      const ids = raw
        .split(',')
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value))
      return ids.length > 0 ? ids : null
    })(),
    channelIds: (() => {
      const raw = params.get('channels')
      if (!raw) return null
      const ids = raw
        .split(',')
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value))
      return ids.length > 0 ? ids : null
    })(),
    q,
    from: suggestionsRange.from,
    to: suggestionsRange.to,
    enabled: groupingReady && !isGroupedView && plannerVisibility.showSuggestions,
    cacheKeyParts: ['list', JSON.stringify(filters)],
  })

  // IMPORTANT: select a stable snapshot from Zustand (avoid returning a freshly created array).
  const optimisticPlannerTasksByKey = usePlannerOptimisticTasks((s) => s.byKey)
  const optimisticPlannerTasks = useMemo(
    () => Object.values(optimisticPlannerTasksByKey),
    [optimisticPlannerTasksByKey],
  )

  const ungroupedPlannerRows: PlannerItem[] = useMemo(() => {
    const toEntityRow = (item: any): PlannerItem => {
      const kind = (item?.kind as 'task' | 'suggestion' | undefined) ?? 'task'
      const entityType = (item?.entity_type as 'task' | 'suggestion' | undefined) ?? (kind === 'suggestion' ? 'suggestion' : 'task')
      const entityIdRaw = item?.entity_id ?? item?.id
      const entityId = Number(entityIdRaw)
      return {
        ...item,
        kind: kind === 'suggestion' ? ('suggestion' as const) : ('task' as const),
        entity_type: entityType,
        entity_id: Number.isFinite(entityId) ? entityId : Number(item?.id) || 0,
        board_item_id: `${entityType}:${Number.isFinite(entityId) ? entityId : Number(item?.id) || 0}`,
        id: kind === 'suggestion' ? `suggestion:${Number.isFinite(entityId) ? entityId : Number(item?.id) || 0}` : Number.isFinite(entityId) ? entityId : Number(item?.id) || 0,
        source_key: item?.source_key ?? null,
      } as PlannerItem
    }

    const taskItems = plannerVisibility.showTasks
      ? taskListViewTasksWithImageUrls.map((t: any) =>
          toEntityRow({ ...t, kind: 'task' as const, entity_type: 'task', entity_id: Number(t?.id) }),
        )
      : []
    const suggestionItems = plannerVisibility.showSuggestions ? (suggestionsQuery.data ?? []).map(toEntityRow) : []
    const optimisticItems = plannerVisibility.showTasks ? optimisticPlannerTasks.map(toEntityRow) : []

    const seen = new Set<string>()
    const merged: any[] = []
    for (const item of [...optimisticItems, ...taskItems, ...suggestionItems]) {
      const key = `${String((item as any).entity_type)}:${String((item as any).entity_id)}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(item)
    }

    const sortKey = (rowSortBy || sortBy || 'updated_at') as string
    const direction = (rowSortOrder || sortOrder || 'desc') as 'asc' | 'desc'
    const ascending = direction === 'asc'

    const toTime = (v: any) => {
      const d = new Date(String(v))
      const t = d.getTime()
      return Number.isFinite(t) ? t : null
    }

    const compare = (a: any, b: any) => {
      const av =
        (a?.kind === 'suggestion' && (sortKey === 'delivery_date' || sortKey === 'publication_date'))
          ? (a?.planned_for_date ?? a?.delivery_date ?? a?.publication_date)
          : (a?.kind === 'suggestion' && sortKey === 'updated_at')
            ? (a?.updated_at ?? a?.created_at)
            : a?.[sortKey]
      const bv =
        (b?.kind === 'suggestion' && (sortKey === 'delivery_date' || sortKey === 'publication_date'))
          ? (b?.planned_for_date ?? b?.delivery_date ?? b?.publication_date)
          : (b?.kind === 'suggestion' && sortKey === 'updated_at')
            ? (b?.updated_at ?? b?.created_at)
            : b?.[sortKey]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1

      // Date-ish keys
      if (sortKey.includes('date') || sortKey.includes('updated_at') || sortKey.includes('created_at')) {
        const at = toTime(av)
        const bt = toTime(bv)
        if (at == null && bt == null) return 0
        if (at == null) return 1
        if (bt == null) return -1
        return ascending ? at - bt : bt - at
      }

      const as = String(av)
      const bs = String(bv)
      const primary = ascending ? as.localeCompare(bs) : bs.localeCompare(as)
      if (primary !== 0) return primary
      const aid = Number(a?.entity_id ?? a?.id ?? 0)
      const bid = Number(b?.entity_id ?? b?.id ?? 0)
      return ascending ? aid - bid : bid - aid
    }

    merged.sort(compare)
    return merged
  }, [
    plannerVisibility.showTasks,
    plannerVisibility.showSuggestions,
    taskListViewTasksWithImageUrls,
    suggestionsQuery.data,
    optimisticPlannerTasks,
    rowSortBy,
    rowSortOrder,
    sortBy,
    sortOrder,
  ])

  const orderedTaskColumns = useMemo(() => {
    const byId = new Map<string, ColumnDef<any>>()
    for (const c of taskColumns) {
      const id = (c as any).id ?? (c as any).accessorKey
      if (id) byId.set(id, c)
    }
    const ordered: ColumnDef<any>[] = []
    const seen = new Set<string>()
    const add = (id: string) => {
      if (byId.has(id) && !seen.has(id)) {
        ordered.push(byId.get(id)!)
        seen.add(id)
      }
    }
    add('select')
    add('title')
    for (const id of columnOrder) {
      if (id !== 'select' && id !== 'title' && id !== '__spacer' && id !== 'list_color') add(id)
    }
    Array.from(byId.entries()).forEach(([id, col]) => {
      if (id !== '__spacer' && !seen.has(id)) ordered.push(col)
    })
    add('__spacer')
    return ordered
  }, [taskColumns, columnOrder])

  // Always call both useReactTable hooks, unconditionally
  const groupedTable = useReactTable<any>({
    data: [], // or the correct grouped data if available
    columns: orderedTaskColumns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: 'onChange',
    columnResizeDirection: 'ltr',
    state: { columnSizing },
    onColumnSizingChange: handleColumnSizingChange,
    debugTable: false,
  });
  const table = useReactTable<any>({
    data: ungroupedPlannerRows,
    columns: orderedTaskColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => `${String((row as any).entity_type)}:${String((row as any).entity_id)}`,
    columnResizeMode: 'onChange',
    columnResizeDirection: 'ltr',
    state: { columnSizing },
    onColumnSizingChange: handleColumnSizingChange,
    debugTable: false,
  })

  // Natural minimum width of the normal table = sum of real column sizes (excludes the flexible
  // spacer track). Derived from react-table column state, so it's independent of whether we're
  // currently rendering compact — this is what prevents compact/normal flip-flop.
  const normalTableMinWidth = groupedTable.getAllLeafColumns()
    .filter((col) => col.id !== '__spacer')
    .reduce((sum, col) => sum + col.getSize(), 0)

  // Compact mode is a narrow-pane fallback, re-derived purely from the live container width — so it
  // recalculates whenever the pane resizes (left-pane expand/maximize, middle/right panes opening or
  // closing, window resize) via the ResizeObserver above. It is never persisted as a sticky UI mode.
  //
  // Trigger = min(normal table's natural width, COMPACT_MAX_ENTER_WIDTH):
  //  - narrow tables (few columns): compact only when the table would actually overflow;
  //  - wide tables (every column): the cap ensures a comfortably wide pane shows the full table
  //    (with its own horizontal scroll) instead of being stuck compact forever.
  // Hysteresis (COMPACT_EXIT_MARGIN) avoids oscillation right at the boundary.
  const compactEnterWidth = Math.min(normalTableMinWidth, COMPACT_MAX_ENTER_WIDTH)
  // Layout effect: decide compact vs expanded before paint so a single expanded frame cannot
  // stretch flex ancestors (see isCompact default / min-w-0 wrappers).
  useLayoutEffect(() => {
    if (containerWidth <= 0 || compactEnterWidth <= 0) return
    setIsCompact((prev) =>
      prev
        ? containerWidth < compactEnterWidth + COMPACT_EXIT_MARGIN
        : containerWidth < compactEnterWidth,
    )
  }, [containerWidth, compactEnterWidth])

  // Populate default widths once per column (for double-click reset)
  useEffect(() => {
    const cols = groupedTable.getAllLeafColumns()
    for (const col of cols) {
      const id = col.id
      if (id === '__spacer') continue
      if (!(id in defaultWidthsRef.current)) {
        defaultWidthsRef.current[id] =
          defaultColumnWidths[id as keyof typeof defaultColumnWidths] ??
          (col.columnDef as any).size ??
          (col.columnDef as any).defaultSize ??
          160
      }
    }
  }, [groupedTable])

  // Log on every render
  console.log('[TaskList] Render', taskListViewQuery.data);

  // Debug: log when TaskList mounts and updater is set (UNGROUPED view only)
  useEffect(() => {
    if (isGroupedView) {
      // For grouped view, UnifiedGroupedTaskList is responsible for wiring the updater
      return;
    }
    console.log('[TaskList] MOUNTED (ungrouped). Setting task list view updater.', { q, project, filters, rowSortBy, rowSortOrder });
    setTypesenseUpdater((task) => {
      console.log('[TaskListViewUpdater] Called with task (ungrouped):', task);
      taskListViewQuery.updateTaskInList(task);
    });
  }, [isGroupedView, taskListViewQuery.updateTaskInList, q, project, JSON.stringify(filters), rowSortBy, rowSortOrder]);

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isGroupedView) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && taskListViewQuery.hasMore && !taskListViewQuery.isFetching && taskListViewQuery.data.length > 0) {
          console.log('[TaskListView] Sentinel intersected, fetching next page');
          taskListViewQuery.fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: '50px' } // Reduced from 200px to 50px to be less aggressive
    );
    observer.observe(sentinel);
    console.log('[TaskListView] Observer attached to sentinel');
    return () => observer.disconnect();
  }, [taskListViewQuery.hasMore, taskListViewQuery.isFetching, taskListViewQuery.data.length, isGroupedView]);

  useEffect(() => {
    const tableDiv = tableScrollEl
    const pinnedDiv = pinnedScrollEl
    if (!tableDiv || !pinnedDiv) return

    const handleTableScroll = () => {
      pinnedDiv.scrollLeft = tableDiv.scrollLeft
    }
    const handlePinnedScroll = () => {
      tableDiv.scrollLeft = pinnedDiv.scrollLeft
    }
    // Body is overflow-x-hidden (pinned bar is the only visible H scroller). Forward
    // trackpad / shift-wheel horizontal gestures so columns still pan from the grid.
    const handleTableWheel = (event: WheelEvent) => {
      let deltaX = event.deltaX
      if (event.shiftKey && deltaX === 0) deltaX = event.deltaY
      if (deltaX === 0) return
      if (!event.shiftKey && Math.abs(deltaX) < Math.abs(event.deltaY)) return
      const maxScroll = Math.max(0, tableDiv.scrollWidth - tableDiv.clientWidth)
      if (maxScroll <= 0) return
      const next = Math.max(0, Math.min(maxScroll, tableDiv.scrollLeft + deltaX))
      if (next === tableDiv.scrollLeft) return
      tableDiv.scrollLeft = next
      pinnedDiv.scrollLeft = next
      event.preventDefault()
    }

    // Sync initial position both ways (helps when switching grouped <-> ungrouped)
    pinnedDiv.scrollLeft = tableDiv.scrollLeft

    tableDiv.addEventListener('scroll', handleTableScroll, { passive: true } as any)
    pinnedDiv.addEventListener('scroll', handlePinnedScroll, { passive: true } as any)
    tableDiv.addEventListener('wheel', handleTableWheel, { passive: false })

    return () => {
      tableDiv.removeEventListener('scroll', handleTableScroll as any)
      pinnedDiv.removeEventListener('scroll', handlePinnedScroll as any)
      tableDiv.removeEventListener('wheel', handleTableWheel)
    }
  }, [tableScrollEl, pinnedScrollEl, isGroupedView, taskListViewQuery.data.length])


  // For grouped view, create a minimal table instance for header rendering
  // const groupedTable = useReactTable<any>({
  //   data: [],
  //   columns: taskColumns,
  //   getCoreRowModel: getCoreRowModel(),
  //   columnResizeMode: 'onChange',
  //   state: { columnSizing },
  //   onColumnSizingChange: handleColumnSizingChange,
  //   debugTable: false,
  // });

  // Filter out subtasks for Typesense-powered (ungrouped) view
  // const typesenseTasks = useMemo(() => {
  //   if (!isGroupedView) {
  //     return typesenseQuery.data.filter(task => !task.parent_task_id_int);
  //   }
  //   return typesenseQuery.data;
  // }, [typesenseQuery.data, isGroupedView]);

  // For ungrouped view, use Typesense table instance
 // const table = !isGroupedView ? useReactTable<any>({
 //    data: typesenseTasks,
 //    columns: taskColumns,
 //    getCoreRowModel: getCoreRowModel(),
 //    columnResizeMode: 'onChange',
 //    state: { columnSizing },
 //    onColumnSizingChange: handleColumnSizingChange,
 //    debugTable: false,
 //  }) : null;

  // --- Data Transformation Helper ---
  // This function converts the modern, nested task object to the flat structure
  // expected by the task detail panel.
  const normalizeTaskForDetailView = (task: any): DenormalizedTask => {
    const { assigned_user, projects, project_statuses, ...rest } = task;
    return {
      ...rest,
      id: task.id,
      title: task.title,
      assigned_to_id: assigned_user?.id?.toString() ?? null,
      assigned_to_name: assigned_user?.full_name ?? null,
      project_id_int: projects?.id?.toString() ?? null,
      project_name: projects?.name ?? null,
      project_color: projects?.color ?? null,
      project_status_name: project_statuses?.name ?? null,
      project_status_color: project_statuses?.color ?? null,
      delivery_date: task.delivery_date,
      publication_date: task.publication_date,
      updated_at: task.updated_at,
      content_type_title: task.content_type_title,
      production_type_title: task.production_type_title,
      language_code: task.language_code,
      copy_post: task.copy_post ?? null,
      briefing: task.briefing ?? null,
      notes: task.notes ?? null,
    };
  };

  // Wrapper for onTaskSelect to normalize data before passing it to the parent
  const handleTaskSelect = (task: any) => {
    if (onTaskSelect && task && task.id) {
      onTaskSelect(task);
    }
  };

  // Expand a main task programmatically when expandMainTaskId changes
  
  useEffect(() => {
    if (!expandedMainTasks || typeof expandedMainTasks.has !== 'function') return;
    if (expandMainTaskId && !expandedMainTasks.has(Number(expandMainTaskId))) {
      setExpandedMainTasks(prev => {
        const next = new Set(prev)
        next.add(Number(expandMainTaskId))
        return next
      })
    }
  }, [expandMainTaskId, expandedMainTasks])

  // --- Optimistic Task Deletion Handler ---
  const handleOptimisticDelete = (taskId: number) => {
    // Remove the task from all InfiniteList caches immediately
    removeTaskFromAllStores(taskId)
    removeTaskIdFromTasksQueryArrays(queryClient, taskId)
    const supabase = createClientComponentClient()
    enqueueTaskDelete({
      taskId,
      supabase,
      onError: (err) => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] })
        toast({
          title: 'Failed to delete task',
          description: (err as Error)?.message || 'An error occurred while deleting the task.',
          variant: 'destructive',
        })
      },
    })
  }

  // Add local state for instant row highlight
  const [localSelectedId, setLocalSelectedId] = useState<string | number | null>(selectedTaskId ?? null);
  // Sync localSelectedId with selectedTaskId prop
  useEffect(() => {
    setLocalSelectedId(selectedTaskId ?? null);
  }, [selectedTaskId]);

  console.log('[TaskList] isGroupedView:', isGroupedView);
  if (!hasHydrated || !hasMeasured) return null

  const totalSizeWithoutSpacer = normalTableMinWidth
  const isResizing =
    !!table.getState().columnSizingInfo?.isResizingColumn ||
    !!groupedTable.getState().columnSizingInfo?.isResizingColumn
  const spacerWidth = isResizing ? 0 : Math.max(containerWidth - totalSizeWithoutSpacer, 0)

  // Grid layout: real columns first, spacer track at far right (leftover space invisible)
  const leafColumns = groupedTable.getAllLeafColumns()
  const realColumns = leafColumns.filter(col => col.id !== '__spacer')
  const gridTemplateColumns = isCompact
    ? 'minmax(0, 1fr)'
    : [
        ...realColumns.map(col => `${col.getSize()}px`),
        'minmax(0px, 1fr)',
      ].join(' ')
  const compactDateField: 'delivery_date' | 'publication_date' =
    routerParams.get('calendar_date_field') === 'publication' ? 'publication_date' : 'delivery_date'

  // Mobile view
  if (isMobile) {
    return (
      <div ref={containerRef} className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden bg-white">
        {/* Bulk Action Bar for Mobile */}
        <BulkActionBar
          selectedCount={selectedTasks.size}
          onClearSelection={handleClearSelection}
          actions={bulkActions}
          entityName="task"
        />
        {bulkDeleteDialog}
        <div
          ref={scrollContainerRef}
          className={cn(
            'relative min-h-0 min-w-0 flex-1 overflow-y-auto',
            isCompact ? 'overflow-x-hidden' : 'overflow-x-auto',
          )}
          data-task-scroll-container
          style={{ width: '100%' }}
          onScroll={markScrolling}
          onWheel={markScrolling}
          onTouchMove={markScrolling}
        >
          <DndContext
            sensors={sensors}
            onDragStart={handleColumnDragStart}
            onDragOver={handleColumnDragOver}
            onDragEnd={handleColumnDragEnd}
            onDragCancel={handleColumnDragCancel}
          >
            <SortableContext items={sortableColumnIds} strategy={horizontalListSortingStrategy}>
              <table
                className={cn(
                  'task-list-grid relative z-10 border-collapse text-sm',
                  isCompact && 'task-list-grid--compact',
                )}
                style={{ tableLayout: 'fixed', background: 'transparent' }}
              >
                {isCompact ? null : (
                  <TaskTableHeader table={groupedTable} columns={orderedTaskColumns} gridTemplateColumns={gridTemplateColumns} onColumnOrderChange={handleColumnOrderChange} overColId={overColId} isColumnDragging={isColumnDragging} onResizeHandleDoubleClick={handleResizeHandleDoubleClick} defaultWidthsRef={defaultWidthsRef} />
                )}
            <tbody>
              <UnifiedGroupedTaskList<any>
                columns={orderedTaskColumns}
                gridTemplateColumns={gridTemplateColumns}
                onTaskSelect={handleTaskSelect}
                filters={filters}
                pageSize={50}
                sortBy={rowSortBy}
                sortOrder={rowSortOrder}
                editFields={editFields}
                selectedTaskId={selectedTaskId}
                enabled={true}
                expandedMainTasks={expandedMainTasks}
                isMultiselectMode={isMultiselectMode}
                selectedTasks={selectedTasks}
                onTaskToggle={handleTaskToggle}
                listColorMode={listColorModeForRows}
                onListColorLegendChange={onListColorLegendChange}
                compact={isCompact}
              />
            </tbody>
          </table>
            </SortableContext>
            <DragOverlay>
              {activeColId ? (
                <div className="px-2 py-1 rounded-md border border-gray-200 bg-white shadow-md text-sm font-medium text-gray-700 whitespace-nowrap">
                  {getColumnLabel(activeColId)}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>
    );
  }

  // Desktop view
  return (
    <div ref={containerRef} className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden bg-transparent" style={{ padding: 0, margin: 0 }}>
      {bulkDeleteDialog}
      {/* Always use UnifiedGroupedTaskList (grouped + ungrouped both use task_group_tasks_filtered; ungrouped = p_group_key='all'). */}
      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col" style={{ padding: 0, margin: 0 }}>
        <BulkActionBar
          selectedCount={selectedTasks.size}
          onClearSelection={handleClearSelection}
          actions={bulkActions}
          entityName="task"
        />

        <div
          ref={desktopScrollRef}
          data-task-scroll-container
          className="relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
          style={{ width: '100%', padding: 0, margin: 0 }}
          onScroll={markScrolling}
          onWheel={markScrolling}
          onTouchMove={markScrolling}
        >
          <DndContext
            sensors={sensors}
            onDragStart={handleColumnDragStart}
            onDragOver={handleColumnDragOver}
            onDragEnd={handleColumnDragEnd}
            onDragCancel={handleColumnDragCancel}
          >
            <SortableContext items={sortableColumnIds} strategy={horizontalListSortingStrategy}>
              <table
                className={cn(
                  'task-list-grid relative z-10 border-collapse text-sm',
                  isCompact && 'task-list-grid--compact',
                )}
                style={{ tableLayout: 'fixed', background: 'transparent' }}
              >
                {isCompact ? null : (
                  <TaskTableHeader table={groupedTable} columns={orderedTaskColumns} gridTemplateColumns={gridTemplateColumns} onColumnOrderChange={handleColumnOrderChange} overColId={overColId} isColumnDragging={isColumnDragging} onResizeHandleDoubleClick={handleResizeHandleDoubleClick} defaultWidthsRef={defaultWidthsRef} />
                )}
            <tbody>
              <UnifiedGroupedTaskList<any>
                columns={orderedTaskColumns}
                gridTemplateColumns={gridTemplateColumns}
                onTaskSelect={handleTaskSelect}
                filters={filters}
                pageSize={50}
                sortBy={sortBy}
                sortOrder={sortOrder}
                editFields={editFields}
                selectedTaskId={selectedTaskId}
                enabled={true}
                expandedMainTasks={expandedMainTasks}
                isMultiselectMode={isMultiselectMode}
                selectedTasks={selectedTasks}
                onTaskToggle={handleTaskToggle}
                listColorMode={listColorModeForRows}
                onListColorLegendChange={onListColorLegendChange}
                compact={isCompact}
              />
            </tbody>
          </table>
            </SortableContext>
            <DragOverlay>
              {activeColId ? (
                <div className="px-2 py-1 rounded-md border border-gray-200 bg-white shadow-md text-sm font-medium text-gray-700 whitespace-nowrap">
                  {getColumnLabel(activeColId)}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
        {!isCompact && (
          <div
            ref={handlePinnedScrollRef}
            className="overflow-x-auto"
            style={{
              width: '100%',
              height: 16,
              position: 'sticky',
              bottom: 0,
              background: 'white',
              zIndex: 10,
            }}
          >
            <div style={{ width: tableScrollRef.current?.scrollWidth ?? totalSizeWithoutSpacer + spacerWidth, height: 1 }} />
          </div>
        )}
      </div>
    </div>
  )
}