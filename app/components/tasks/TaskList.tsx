"use client"

import { useEffect, useState, useMemo, useRef, useCallback } from "react"
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
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react"
import dynamic from "next/dynamic"
import { Button } from "../ui/button"
import { getFilterOptions } from "../../lib/services/filters"
import React from "react"
import { useDebounce } from "use-debounce"
import { InfiniteList } from "../ui/infinite-list"
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { GroupedTaskList } from './grouped-task-list'
import { useTaskGrouping } from '../../store/task-grouping'
import { TaskTableHeader } from './task-table-header'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '../ui/use-toast'
import { removeItemFromStore } from '../../../hooks/use-infinite-query'
import { removeTaskFromAllStores } from './task-cache-utils'
import { useTaskRealtime } from '../../../hooks/use-task-realtime'
import { updateTaskInCaches } from './task-cache-utils';
import { fetchTasksFromTypesense } from '../../lib/fetchTasksFromTypesense';
import { useTypesenseInfiniteQuery } from '../../hooks/use-typesense-infinite-query';
import { setTypesenseUpdater } from '../../store/typesense-tasks';
import { useMobileDetection } from '../../hooks/use-mobile-detection';
import { updateTaskInCachesWithOverdue } from './task-cache-utils';
import { BulkActionBar, type BulkAction } from '../ui/bulk-action-bar';

interface TaskListProps {
  onTaskSelect?: (task: any) => void
  filters?: any
  searchValue?: string
  expandMainTaskId?: number | string | null
  selectedTaskId?: string | number | null
  editFields?: any // Task edit fields data from useTaskEditFields hook
  isMultiselectMode?: boolean
  onToggleMultiselect?: () => void
}

// Helper function to format date based on current year
function formatDateWithYear(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  try {
    const date = new Date(dateString);
    const now = new Date();
    const currentYear = now.getFullYear();
    const dateYear = date.getFullYear();
    
    if (dateYear === currentYear) {
      // Current year: dd/mmm format (e.g., "18/jul", "9/jul")
      const day = date.getDate().toString().padStart(2, '0');
      const month = date.toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
      return `${day}/${month}`;
    } else {
      // Previous years: dd/mm/yyyy format
      return date.toLocaleDateString('en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return "Invalid date";
  }
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
function MobileTaskCard({ task, isSelected, isMainTask, isExpanded, onTaskSelect, onToggleExpand, isMultiselectMode, isTaskSelected, onTaskToggle }: {
  task: any;
  isSelected: boolean;
  isMainTask: boolean;
  isExpanded: boolean;
  onTaskSelect: (task: any) => void;
  onToggleExpand?: (taskId: number) => void;
  isMultiselectMode?: boolean;
  isTaskSelected?: boolean;
  onTaskToggle?: (taskId: number) => void;
}) {
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div 
      className={cn(
        'p-3 border-b border-gray-100 cursor-pointer transition-colors',
        isMultiselectMode 
          ? isTaskSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'
          : isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50',
        isMainTask && 'font-semibold'
      )}
      onClick={() => {
        if (isMultiselectMode && onTaskToggle) {
          onTaskToggle(task.id);
        } else {
          onTaskSelect(task);
        }
      }}
    >
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
function SubtaskRows({ parentId, taskColumns, onTaskSelect, selectedTaskId, isMobile, isMultiselectMode, selectedTasks, onTaskToggle }: { 
  parentId: number, 
  taskColumns: any[], 
  onTaskSelect: (task: any) => void, 
  selectedTaskId?: string | number | null,
  isMobile?: boolean,
  isMultiselectMode?: boolean,
  selectedTasks?: Set<number>,
  onTaskToggle?: (taskId: number) => void
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
        <td colSpan={taskColumns.length} className="text-center text-gray-400 py-4">Loading subtasks...</td>
      </tr>
    )
  }
  if (data && data.length === 0) {
    return isMobile ? (
      <div className="text-center text-gray-400 py-4 text-sm">No subtasks</div>
    ) : (
      <tr key={`empty-${parentId}`}>
        <td colSpan={taskColumns.length} className="text-center text-gray-400 py-4">No subtasks</td>
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
            />
          </div>
        ))}
      </>
    )
  }
  
  return (
    <>
      {data && data.map(subtask => (
        <tr
          key={subtask.id}
          className={cn(
            'hover:bg-gray-50 cursor-pointer',
            isMultiselectMode 
              ? selectedTasks?.has(subtask.id) && 'bg-blue-50 border-l-4 border-l-blue-500'
              : selectedTaskId && String(subtask.id) === String(selectedTaskId) && 'bg-gray-100',
          )}
          onClick={(e) => {
            if (isMultiselectMode && onTaskToggle) {
              onTaskToggle(subtask.id);
            } else {
              onTaskSelect(subtask);
            }
          }}
        >
          {taskColumns.map((col, idx) => (
            <td
              key={(col as any).accessorKey || idx}
              style={{ paddingLeft: idx === 0 ? 32 : undefined }}
              className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle"
            >
              {col.cell
                ? flexRender(col.cell, {
                    row: { original: subtask },
                    getValue: () => subtask[(col as any).accessorKey as keyof typeof subtask],
                  })
                : subtask[(col as any).accessorKey as keyof typeof subtask]}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export function TaskList({ onTaskSelect, expandMainTaskId, selectedTaskId, editFields, isMultiselectMode: externalIsMultiselectMode, onToggleMultiselect }: TaskListProps) {
  console.log('[TaskList] RENDER');
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { selectedGroupBy } = useTaskGrouping();
  const isGroupedView = !!selectedGroupBy;
  const isMobile = useMobileDetection();
  console.log('[TaskList] selectedGroupBy:', selectedGroupBy, 'isGroupedView:', isGroupedView);
  const queryClient = useQueryClient()
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const pinnedScrollbarRef = useRef<HTMLDivElement>(null);

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

  // --- Sorting State ---
  const urlSortBy = params.get('sortBy') || 'publication_date'
  const urlSortOrder = params.get('sortOrder') === 'asc' ? 'asc' : 'desc'
  
  // For grouped view, we use local state to avoid reloading the whole component
  const [groupedSortBy, setGroupedSortBy] = useState(urlSortBy)
  const [groupedSortOrder, setGroupedSortOrder] = useState<'asc' | 'desc'>(urlSortOrder)
  
  // Determine which sorting state to use
  const sortBy = isGroupedView ? groupedSortBy : urlSortBy
  const sortOrder = isGroupedView ? groupedSortOrder : urlSortOrder

  // --- Column Sizing State (persisted in localStorage) ---
  const COLUMN_WIDTHS_KEY = 'tasklist-column-widths-v1'
  const defaultColumnWidths: ColumnSizingState = {
    title: 200,
    users: 140,
    projects: 140,
    project_statuses: 140,
    delivery_date: 140,
    publication_date: 140,
    updated_at: 140,
  }
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(defaultColumnWidths)
  const [isUserResized, setIsUserResized] = useState(false)
  const [hasMeasured, setHasMeasured] = useState(false)

  // --- Multiselect State ---
  const [internalIsMultiselectMode, setInternalIsMultiselectMode] = useState(false)
  const isMultiselectMode = externalIsMultiselectMode ?? internalIsMultiselectMode
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set())

  // Ref for measuring container width
  const containerRef = useRef<HTMLDivElement>(null)

  // Responsive scaling: if no saved widths and user hasn't resized, scale columns to fill container on every resize
  useEffect(() => {
    if (!hasHydrated || !containerRef.current) return;
    const saved = typeof window !== 'undefined' ? localStorage.getItem(COLUMN_WIDTHS_KEY) : null;
    if (saved) {
      setColumnSizing(JSON.parse(saved));
      setHasMeasured(true);
      return;
    }
    const handleResize = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.offsetWidth;
      const weights = { title: 2.5, users: 1, projects: 1, project_statuses: 1, delivery_date: 1, publication_date: 1, updated_at: 1 }
      const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0)
      const scaled = Object.fromEntries(
        Object.entries(weights).map(([key, weight]) => [key, Math.round((containerWidth * weight) / totalWeight)])
      )
      setColumnSizing(scaled);
      setHasMeasured(true);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [hasHydrated, containerRef]);

  useEffect(() => {
    if (!hasHydrated || !containerRef.current) return;
    const containerWidth = containerRef.current.offsetWidth
    const totalColWidth = Object.values(columnSizing).reduce((a, b) => a + b, 0)
    if (totalColWidth < containerWidth) {
      const scale = containerWidth / totalColWidth
      const scaled = Object.fromEntries(
        Object.entries(columnSizing).map(([key, width]) => [key, Math.round(width * scale)])
      )
      setColumnSizing(scaled)
    }
  }, [columnSizing, hasHydrated])

  const handleColumnSizingChange = (updaterOrValue: ColumnSizingState | ((old: ColumnSizingState) => ColumnSizingState)) => {
    setIsUserResized(true)
    setColumnSizing(updaterOrValue)
  }

  // --- Sorting Handler ---
  const handleHeaderClick = (accessorKey: string) => {
    const newSortOrder = sortBy === accessorKey && sortOrder === 'asc' ? 'desc' : 'asc';
    
    if (isGroupedView) {
      // If grouped, just update local state
      setGroupedSortBy(accessorKey);
      setGroupedSortOrder(newSortOrder);
    } else {
      // Otherwise, update URL params
      const newParams = new URLSearchParams(Array.from(params.entries()))
      newParams.set('sortBy', accessorKey)
      newParams.set('sortOrder', newSortOrder)
      newParams.delete('page')
      router.replace(`${pathname}?${newParams.toString()}`, { scroll: false })
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

  const handleBulkDelete = async () => {
    if (selectedTasks.size === 0) return

    const confirmed = window.confirm(`Are you sure you want to delete ${selectedTasks.size} task${selectedTasks.size !== 1 ? 's' : ''}?`)
    if (!confirmed) return

    try {
      const supabase = createClientComponentClient()
      const { error } = await supabase
        .from('tasks')
        .delete()
        .in('id', Array.from(selectedTasks))

      if (error) throw error

      // Remove tasks from all caches
      selectedTasks.forEach(taskId => {
        removeTaskFromAllStores(taskId)
      })

      // Clear selection
      setSelectedTasks(new Set())
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['subtasks'] })

      toast({
        title: 'Tasks deleted',
        description: `Successfully deleted ${selectedTasks.size} task${selectedTasks.size !== 1 ? 's' : ''}.`,
      })
    } catch (err: any) {
      toast({
        title: 'Failed to delete tasks',
        description: err?.message || 'An error occurred while deleting the tasks.',
        variant: 'destructive',
      })
    }
  }

  // --- Bulk Actions Configuration ---
  const bulkActions: BulkAction[] = [
    {
      label: 'Delete',
      icon: Trash2,
      onClick: handleBulkDelete,
      variant: 'destructive',
    }
  ]

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
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          onChange={(e) => {
            if (e.target.checked) {
              // Select all visible tasks
              const allTaskIds = typesenseTasks.map(task => Number(task.id))
              setSelectedTasks(new Set(allTaskIds))
            } else {
              setSelectedTasks(new Set())
            }
          }}
          checked={selectedTasks.size > 0 && selectedTasks.size === typesenseTasks.length}
          ref={(el) => {
            if (el) {
              el.indeterminate = selectedTasks.size > 0 && selectedTasks.size < typesenseTasks.length
            }
          }}
        />
      ),
      cell: (info: any) => (
        <input
          type="checkbox"
          checked={selectedTasks.has(info.row.original.id)}
          onChange={(e) => {
            e.stopPropagation()
            handleTaskToggle(info.row.original.id)
          }}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
      ),
      size: 50,
      minSize: 50,
      maxSize: 50,
      enableResizing: false,
    }] : []),
    {
      accessorKey: 'title',
      header: () => (
        <button type="button" className={cn('truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-medium', 'bg-transparent border-0 p-0 m-0 cursor-pointer flex items-center', sortBy === 'title' ? 'text-black' : 'text-gray-500 hover:text-black')} onClick={() => handleHeaderClick('title')}>
          Title
          {sortBy === 'title' && <Arrow direction={sortOrder} />}
        </button>
      ),
      cell: info => {
        const task = info.row.original
        const isMainTask = task.content_type_id === 39 || task.content_type_id === "39"
        const isExpanded = expandedMainTasks.has(task.id)
        return (
          <span className={cn(
            'truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis',
            isMainTask && 'font-semibold',
            'flex items-center'
          )}>
            {isMainTask && (
              <button
                type="button"
                aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
                onClick={e => { e.stopPropagation(); handleToggleMainTask(task.id) }}
                className={cn('mr-2 p-0.5 rounded transition', isExpanded ? 'text-blue-600' : 'text-gray-400 hover:text-blue-600')}
                tabIndex={0}
              >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            )}
            <span>{task.title}</span>
          </span>
        )
      },
      size: columnSizing.title,
      minSize: 80,
      maxSize: 1000,
      enableResizing: true,
    },
    {
      accessorKey: 'assigned_user',
      header: () => (
        <button type="button" className={cn('truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-medium', 'bg-transparent border-0 p-0 m-0 cursor-pointer flex items-center', sortBy === 'assigned_user' ? 'text-black' : 'text-gray-500 hover:text-black')} onClick={() => handleHeaderClick('assigned_user')}>
          Assignee
          {sortBy === 'assigned_user' && <Arrow direction={sortOrder} />}
        </button>
      ),
      cell: info => <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">{info.row.original.assigned_user?.full_name || ''}</span>,
      size: columnSizing.users,
      minSize: 80,
      maxSize: 1000,
      enableResizing: true,
    },
    {
      accessorKey: 'projects',
      header: () => (
        <button type="button" className={cn('truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-medium', 'bg-transparent border-0 p-0 m-0 cursor-pointer flex items-center', sortBy === 'projects' ? 'text-black' : 'text-gray-500 hover:text-black')} onClick={() => handleHeaderClick('projects')}>
          Project
          {sortBy === 'projects' && <Arrow direction={sortOrder} />}
        </button>
      ),
      cell: info => (
        <span className="flex items-center gap-2 truncate max-w-full whitespace-nowrap overflow-hidden text-ellipsis">
          {info.row.original.projects?.color && (
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: info.row.original.projects.color }} />
          )}
          <span className="truncate max-w-[120px] whitespace-nowrap overflow-hidden text-ellipsis">{info.row.original.projects?.name || ''}</span>
        </span>
      ),
      size: columnSizing.projects,
      minSize: 80,
      maxSize: 1000,
      enableResizing: true,
    },
    {
      accessorKey: 'project_statuses',
      header: () => (
        <button type="button" className={cn('truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-medium', 'bg-transparent border-0 p-0 m-0 cursor-pointer flex items-center', sortBy === 'project_statuses' ? 'text-black' : 'text-gray-500 hover:text-black')} onClick={() => handleHeaderClick('project_statuses')}>
          Status
          {sortBy === 'project_statuses' && <Arrow direction={sortOrder} />}
        </button>
      ),
      cell: info => {
        const status = info.row.original.project_statuses;
        const name = status?.name || '';
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
      size: columnSizing.project_statuses,
      minSize: 80,
      maxSize: 1000,
      enableResizing: true,
    },
    {
      accessorKey: 'delivery_date',
      header: () => (
        <button type="button" className={cn('truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-medium', 'bg-transparent border-0 p-0 m-0 cursor-pointer flex items-center', sortBy === 'delivery_date' ? 'text-black' : 'text-gray-500 hover:text-black')} onClick={() => handleHeaderClick('delivery_date')}>
          Delivery Date
          {sortBy === 'delivery_date' && <Arrow direction={sortOrder} />}
        </button>
      ),
      cell: info => {
        const task = info.row.original;
        const date = formatDateWithYear(task.delivery_date);
        return (
          <span className={cn(
            "truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis",
            task.is_overdue && "text-red-600 font-medium"
          )}>
            {date}
          </span>
        );
      },
      size: columnSizing.delivery_date,
      minSize: 80,
      maxSize: 1000,
      enableResizing: true,
    },
    {
      accessorKey: 'publication_date',
      header: () => (
        <button type="button" className={cn('truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-medium', 'bg-transparent border-0 p-0 m-0 cursor-pointer flex items-center', sortBy === 'publication_date' ? 'text-black' : 'text-gray-500 hover:text-black')} onClick={() => handleHeaderClick('publication_date')}>
          Publication Date
          {sortBy === 'publication_date' && <Arrow direction={sortOrder} />}
        </button>
      ),
      cell: info => {
        const task = info.row.original;
        const date = formatDateWithYear(task.publication_date);
        return (
          <span className={cn(
            "truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis",
            task.is_publication_overdue && "text-red-600 font-medium"
          )}>
            {date}
          </span>
        );
      },
      size: columnSizing.publication_date,
      minSize: 80,
      maxSize: 1000,
      enableResizing: true,
    },
    {
      accessorKey: 'updated_at',
      header: () => (
        <button type="button" className={cn('truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-medium', 'bg-transparent border-0 p-0 m-0 cursor-pointer flex items-center', sortBy === 'updated_at' ? 'text-black' : 'text-gray-500 hover:text-black')} onClick={() => handleHeaderClick('updated_at')}>
          Last Update
          {sortBy === 'updated_at' && <Arrow direction={sortOrder} />}
        </button>
      ),
      cell: info => <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">{formatDateWithYear(info.row.original.updated_at)}</span>,
      size: columnSizing.updated_at,
      minSize: 80,
      maxSize: 1000,
      enableResizing: true,
    },
    {
      accessorKey: 'content_type_title',
      header: () => (
        <button type="button" className={cn('truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-medium', 'bg-transparent border-0 p-0 m-0 cursor-pointer flex items-center', sortBy === 'content_type_title' ? 'text-black' : 'text-gray-500 hover:text-black')} onClick={() => handleHeaderClick('content_type_title')}>
          Content Type
          {sortBy === 'content_type_title' && <Arrow direction={sortOrder} />}
        </button>
      ),
      cell: info => <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">{info.row.original.content_type_title || ''}</span>,
      size: 140,
      minSize: 80,
      maxSize: 1000,
      enableResizing: true,
    },
    {
      accessorKey: 'production_type_title',
      header: () => (
        <button type="button" className={cn('truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-medium', 'bg-transparent border-0 p-0 m-0 cursor-pointer flex items-center', sortBy === 'production_type_title' ? 'text-black' : 'text-gray-500 hover:text-black')} onClick={() => handleHeaderClick('production_type_title')}>
          Production Type
          {sortBy === 'production_type_title' && <Arrow direction={sortOrder} />}
        </button>
      ),
      cell: info => <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">{info.row.original.production_type_title || ''}</span>,
      size: 140,
      minSize: 80,
      maxSize: 1000,
      enableResizing: true,
    },
    {
      accessorKey: 'language_code',
      header: () => (
        <button type="button" className={cn('truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis font-medium', 'bg-transparent border-0 p-0 m-0 cursor-pointer flex items-center', sortBy === 'language_code' ? 'text-black' : 'text-gray-500 hover:text-black')} onClick={() => handleHeaderClick('language_code')}>
          Language
          {sortBy === 'language_code' && <Arrow direction={sortOrder} />}
        </button>
      ),
      cell: info => <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">{info.row.original.language_code || ''}</span>,
      size: 100,
      minSize: 80,
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
      // Apply correct sorting based on view
      const effectiveSortBy = isGroupedView ? groupedSortBy : sortBy;
      const effectiveSortOrder = isGroupedView ? groupedSortOrder : sortOrder;
      query = query.order(effectiveSortBy, { ascending: effectiveSortOrder === 'asc' })
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
  }, [params, sortBy, sortOrder, isGroupedView, groupedSortBy, groupedSortOrder])

  // --- Reset InfiniteList on sort change by key ---
  // Exclude 'id' param from the key to prevent reloads on selection
  const filterParams = (() => {
    const obj = Object.fromEntries(params.entries());
    delete obj.id;
    return obj;
  })();
  const filterParamsString = Object.entries(filterParams).map(([k, v]) => `${k}=${v}`).join('&');
  const infiniteListKey = `${sortBy}-${sortOrder}-${filterParamsString}`;

  // --- Typesense Search Integration (ungrouped view only) ---
  const q = params.get('q') || '';
  const project = params.get('project') || undefined;
  const filters: Record<string, string | string[]> = {};
  const filterFields = [
    'assigned_to_name',
    'channel_names',
    'content_type_title',
    'project_name',
    'production_type_title',
    'language_code',
  ];
  for (const field of filterFields) {
    const value = params.get(field);
    if (value) {
      filters[field] = value.includes(',') ? value.split(',') : value;
    }
  }
  
  // Handle status filter - map from URL 'status' param to 'project_status_name' for Typesense
  const statusParam = params.get('status');
  if (statusParam) {
    filters['project_status_name'] = statusParam.includes(',') ? statusParam.split(',') : statusParam;
  }

  // Handle overdue status filter - map from URL 'overdueStatus' param to Typesense filter fields
  const overdueStatusParam = params.get('overdueStatus');
  if (overdueStatusParam) {
    const overdueStatuses = overdueStatusParam.includes(',') ? overdueStatusParam.split(',') : [overdueStatusParam];
    filters['overdueStatus'] = overdueStatuses;
  }

  // Use Typesense infinite query hook (only fetch data for ungrouped view)
  console.log('[TaskList] calling useTypesenseInfiniteQuery, enabled:', !isGroupedView);
  const typesenseQuery = useTypesenseInfiniteQuery({
    q,
    project,
    filters,
    pageSize: 50, // Increased from 25 to 50
    sortBy,
    sortOrder,
    enabled: !isGroupedView, // Only fetch when not in grouped view
  });

  // Move typesenseTasks above table
  const typesenseTasks = useMemo(() => {
    if (!isGroupedView) {
      return typesenseQuery.data.filter(task => !task.parent_task_id_int);
    }
    return typesenseQuery.data;
  }, [typesenseQuery.data, isGroupedView]);

  // Always call both useReactTable hooks, unconditionally
  const groupedTable = useReactTable<any>({
    data: [], // or the correct grouped data if available
    columns: taskColumns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: 'onChange',
    state: { columnSizing },
    onColumnSizingChange: handleColumnSizingChange,
    debugTable: false,
  });
  const table = useReactTable<any>({
    data: typesenseTasks,
    columns: taskColumns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: 'onChange',
    state: { columnSizing },
    onColumnSizingChange: handleColumnSizingChange,
    debugTable: false,
  });

  // Log on every render
  console.log('[TaskList] Render', typesenseQuery.data);

  // Debug: log when TaskList mounts and updater is set
  useEffect(() => {
    console.log('[TaskList] MOUNTED. Setting Typesense updater.', { q, project, filters, sortBy, sortOrder });
    setTypesenseUpdater((task) => {
      console.log('[TypesenseUpdater] Called with task:', task);
      typesenseQuery.updateTaskInList(task);
    });
  }, [typesenseQuery.updateTaskInList, q, project, JSON.stringify(filters), sortBy, sortOrder]);

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isGroupedView) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && typesenseQuery.hasMore && !typesenseQuery.isFetching && typesenseQuery.data.length > 0) {
          console.log('[Typesense] Sentinel intersected, fetching next page');
          typesenseQuery.fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: '50px' } // Reduced from 200px to 50px to be less aggressive
    );
    observer.observe(sentinel);
    console.log('[Typesense] Observer attached to sentinel');
    return () => observer.disconnect();
  }, [typesenseQuery.hasMore, typesenseQuery.isFetching, typesenseQuery.data.length, isGroupedView]);

  useEffect(() => {
    const tableDiv = tableScrollRef.current;
    const pinnedDiv = pinnedScrollbarRef.current;
    if (!tableDiv || !pinnedDiv) return;

    const handleTableScroll = () => {
      pinnedDiv.scrollLeft = tableDiv.scrollLeft;
    };
    const handlePinnedScroll = () => {
      tableDiv.scrollLeft = pinnedDiv.scrollLeft;
    };

    tableDiv.addEventListener('scroll', handleTableScroll);
    pinnedDiv.addEventListener('scroll', handlePinnedScroll);

    return () => {
      tableDiv.removeEventListener('scroll', handleTableScroll);
      pinnedDiv.removeEventListener('scroll', handlePinnedScroll);
    };
  }, [typesenseQuery.data.length, isGroupedView]);


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
  const handleOptimisticDelete = async (taskId: number) => {
    // Remove the task from all InfiniteList caches immediately
    removeTaskFromAllStores(taskId)
    queryClient.setQueryData(['tasks'], (old: any) => {
      if (!old) return old;
      if (Array.isArray(old)) {
        return old.filter((t: any) => t.id !== taskId);
      }
      // If paginated, adjust as needed
      return old;
    });
    try {
      const supabase = createClientComponentClient();
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['subtasks'] });
    } catch (err: any) {
      // Rollback: refetch tasks
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({
        title: 'Failed to delete task',
        description: err?.message || 'An error occurred while deleting the task.',
        variant: 'destructive',
      });
    }
  };

  // Add local state for instant row highlight
  const [localSelectedId, setLocalSelectedId] = useState<string | number | null>(selectedTaskId ?? null);
  // Sync localSelectedId with selectedTaskId prop
  useEffect(() => {
    setLocalSelectedId(selectedTaskId ?? null);
  }, [selectedTaskId]);

  console.log('[TaskList] isGroupedView:', isGroupedView);
  if (!hasHydrated || !hasMeasured) return null

  // Mobile view
  if (isMobile) {
    return (
      <div ref={containerRef} className="flex flex-col h-full w-full bg-white">
        {/* Bulk Action Bar for Mobile */}
        <BulkActionBar
          selectedCount={selectedTasks.size}
          onClearSelection={handleClearSelection}
          actions={bulkActions}
          entityName="task"
        />
        
        <div className="flex-1 overflow-y-auto">
          {isGroupedView ? (
            <div className="p-4">
              <GroupedTaskList<any>
                columns={taskColumns}
                onTaskSelect={handleTaskSelect}
                filters={filters}
                pageSize={50}
                sortBy={sortBy}
                sortOrder={sortOrder}
                selectedTaskId={selectedTaskId}
                users={editFields?.project_watchers?.map((pw: any) => ({ id: pw.user_id, full_name: pw.users.full_name }))}
                enabled={true}
              />
            </div>
          ) : (
            <div>
              {typesenseQuery.error && (
                <div className="text-center text-red-500 py-8">{typesenseQuery.error}</div>
              )}
              {typesenseQuery.data.length === 0 && !typesenseQuery.isFetching && !typesenseQuery.error && (
                <div className="text-center text-gray-500 py-8">No tasks found</div>
              )}
              {table && table.getRowModel().rows.map(row => {
                const task = row.original;
                const isMainTask = task.content_type_id === 39 || task.content_type_id === "39";
                const isSelected = !!(localSelectedId && String(task.id) === String(localSelectedId));
                const isExpanded = expandedMainTasks.has(task.id);
                
                return (
                  <div key={task.id}>
                    <MobileTaskCard
                      task={task}
                      isSelected={isSelected}
                      isMainTask={isMainTask}
                      isExpanded={isExpanded}
                      onTaskSelect={handleTaskSelect}
                      onToggleExpand={handleToggleMainTask}
                      isMultiselectMode={isMultiselectMode}
                      isTaskSelected={selectedTasks.has(task.id)}
                      onTaskToggle={handleTaskToggle}
                    />
                    {isMainTask && isExpanded && (
                      <SubtaskRows
                        parentId={task.id}
                        taskColumns={taskColumns}
                        onTaskSelect={onTaskSelect || (() => {})}
                        selectedTaskId={selectedTaskId}
                        isMobile={true}
                        isMultiselectMode={isMultiselectMode}
                        selectedTasks={selectedTasks}
                        onTaskToggle={handleTaskToggle}
                      />
                    )}
                  </div>
                );
              })}
              {typesenseQuery.isFetching && (
                <div className="text-center text-gray-400 py-4">Loading...</div>
              )}
              {!typesenseQuery.hasMore && typesenseQuery.data.length > 0 && (
                <div className="text-center text-muted-foreground py-4 text-sm">No more tasks to display.</div>
              )}
              {typesenseQuery.hasMore && !typesenseQuery.isFetching && (
                <div ref={sentinelRef} style={{ height: 20 }} />
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Desktop view
  return (
    <div ref={containerRef} className="flex flex-col h-screen w-full bg-transparent pl-4">
      {isGroupedView ? (
        (() => { console.log('[TaskList] rendering grouped view'); return null })() ||
        <div className="overflow-x-auto h-full">
          <table className="w-full border-collapse text-sm md:text-base" style={{ tableLayout: 'fixed', background: 'transparent' }}>
            <TaskTableHeader table={groupedTable} columns={taskColumns} />
            <tbody>
              <GroupedTaskList<any>
                columns={taskColumns}
                onTaskSelect={handleTaskSelect}
                filters={filters}
                pageSize={50} // Increased from 25 to 50
                sortBy={sortBy}
                sortOrder={sortOrder}
                selectedTaskId={selectedTaskId}
                users={editFields?.project_watchers?.map((pw: any) => ({ id: pw.user_id, full_name: pw.users.full_name }))}
                enabled={true} // Enable for grouped view
              />
            </tbody>
          </table>
        </div>
      ) : (
        (() => { console.log('[TaskList] rendering ungrouped view'); return null })() ||
        <div className="relative h-full flex flex-col flex-1">
          {/* Bulk Action Bar */}
          <BulkActionBar
            selectedCount={selectedTasks.size}
            onClearSelection={handleClearSelection}
            actions={bulkActions}
            entityName="task"
          />
          
          <div
            ref={tableScrollRef}
            className="flex-1 overflow-y-auto overflow-x-auto"
            style={{ width: '100%' }}
            onScroll={(e) => {
              // Check if we're near the bottom for infinite scroll
              const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
              if (scrollTop + clientHeight >= scrollHeight - 100 && typesenseQuery.hasMore && !typesenseQuery.isFetching && typesenseQuery.data.length > 0) {
                console.log('[Typesense] Near bottom, fetching next page');
                typesenseQuery.fetchNextPage();
              }
            }}
          >
            <table className="border-collapse text-sm md:text-base w-full min-w-[1200px]" style={{ tableLayout: 'fixed', background: 'transparent' }}>
              <thead className="sticky top-0 z-20 bg-white border-b shadow-sm">
                {table && table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <th
                        key={header.id}
                        colSpan={header.colSpan}
                        style={{
                          width: header.getSize(),
                          minWidth: header.getSize(),
                          maxWidth: header.getSize(),
                          position: 'relative',
                        }}
                        className={cn(
                          'px-3 py-2 text-left font-medium text-gray-500 group',
                          'border-r border-gray-200',
                          'select-none',
                        )}
                      >
                        <div className="flex items-center justify-between w-full h-full">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanResize() && (
                            <div
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                              className="absolute right-0 top-0 h-full w-2 cursor-col-resize z-10 transition-colors"
                              style={{ userSelect: 'none' }}
                            />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {typesenseQuery.error && (
                  <tr>
                    <td colSpan={taskColumns.length} className="text-center text-red-500 py-8">{typesenseQuery.error}</td>
                  </tr>
                )}
                {typesenseQuery.data.length === 0 && !typesenseQuery.isFetching && !typesenseQuery.error && (
                  <tr>
                    <td colSpan={taskColumns.length} className="text-center text-gray-500 py-8">No tasks found</td>
                  </tr>
                )}
                {table && table.getRowModel().rows.map(row => {
                  const task = row.original;
                  const isMainTask = task.content_type_id === 39 || task.content_type_id === "39";
                  const isSelected = !isGroupedView
                    ? localSelectedId && String(task.id) === String(localSelectedId)
                    : selectedTaskId && String(task.id) === String(selectedTaskId);
                  const isExpanded = expandedMainTasks.has(task.id);
                  
                  const handleRowClick = (e?: React.MouseEvent) => {
                    if (isMainTask && e && (e.target as HTMLElement).closest('button')) {
                      // If the expand/collapse button was clicked, do not navigate
                      return;
                    }
                    
                    // If clicking on checkbox, don't handle row click
                    if (e && (e.target as HTMLElement).tagName === 'INPUT') {
                      return;
                    }
                    
                    if (isMultiselectMode) {
                      // In multiselect mode, toggle selection instead of navigation
                      handleTaskToggle(task.id);
                    } else {
                      // Normal mode - navigate to task
                      if (!isGroupedView) setLocalSelectedId(task.id);
                      if (onTaskSelect) onTaskSelect(task);
                    }
                  };

                  return (
                    <React.Fragment key={task.id}>
                      <tr
                        className={cn(
                          'hover:bg-gray-50 cursor-pointer',
                          isMainTask && 'font-semibold',
                          isMultiselectMode 
                            ? selectedTasks.has(task.id) && 'bg-blue-50 border-l-4 border-l-blue-500'
                            : isSelected && 'bg-gray-100',
                        )}
                        onClick={handleRowClick}
                      >
                        {row.getVisibleCells().map(cell => (
                          <td
                            key={cell.id}
                            className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle"
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                      {isMainTask && isExpanded && onTaskSelect && (
                        <SubtaskRows
                          parentId={task.id}
                          taskColumns={taskColumns}
                          onTaskSelect={onTaskSelect}
                          selectedTaskId={selectedTaskId}
                          isMobile={false}
                          isMultiselectMode={isMultiselectMode}
                          selectedTasks={selectedTasks}
                          onTaskToggle={handleTaskToggle}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
                {typesenseQuery.isFetching && (
                  <tr>
                    <td colSpan={taskColumns.length} className="text-center text-gray-400 py-4">Loading...</td>
                  </tr>
                )}
                {!typesenseQuery.hasMore && typesenseQuery.data.length > 0 && (
                  <tr>
                    <td colSpan={taskColumns.length} className="text-center text-muted-foreground py-4 text-sm">No more tasks to display.</td>
                  </tr>
                )}
                {typesenseQuery.hasMore && !typesenseQuery.isFetching && (
                  <tr>
                    <td colSpan={taskColumns.length}>
                      <div ref={sentinelRef} style={{ height: 20, background: 'red' }} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div
            ref={pinnedScrollbarRef}
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
            {/* This empty div creates the scrollbar */}
            <div style={{ width: tableScrollRef.current?.scrollWidth || 2000, height: 1 }} />
          </div>
        </div>
      )}
    </div>
  )
}