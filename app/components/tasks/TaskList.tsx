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
import { ChevronDown, ChevronRight } from "lucide-react"
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

interface TaskListProps {
  onTaskSelect?: (task: any) => void
  filters?: any
  searchValue?: string
  expandMainTaskId?: number | string | null
  selectedTaskId?: string | number | null
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
function SubtaskRows({ parentId, taskColumns, onTaskSelect, selectedTaskId }: { parentId: number, taskColumns: any[], onTaskSelect: (task: any) => void, selectedTaskId?: string | number | null }) {
  const { data, isFetching } = useQuery({
    queryKey: ['subtasks', parentId],
    queryFn: () => fetchSubtasksForParent(parentId),
    placeholderData: (prev) => prev,
    staleTime: 10000,
  })
  if (isFetching && (!data || data.length === 0)) {
    return (
      <tr key={`loading-${parentId}`}>
        <td colSpan={taskColumns.length} className="text-center text-gray-400 py-4">Loading subtasks...</td>
      </tr>
    )
  }
  if (data && data.length === 0) {
    return (
      <tr key={`empty-${parentId}`}>
        <td colSpan={taskColumns.length} className="text-center text-gray-400 py-4">No subtasks</td>
      </tr>
    )
  }
  return (
    <>
      {data && data.map(subtask => (
        <tr
          key={subtask.id}
          className={cn(
            'hover:bg-gray-50 cursor-pointer',
            selectedTaskId && String(subtask.id) === String(selectedTaskId) && 'bg-gray-100',
          )}
          onClick={() => onTaskSelect(subtask)}
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

export function TaskList({ onTaskSelect, expandMainTaskId, selectedTaskId }: TaskListProps) {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { selectedGroupBy } = useTaskGrouping()
  const queryClient = useQueryClient()
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const pinnedScrollbarRef = useRef<HTMLDivElement>(null);

  // Hydration state to avoid SSR/CSR mismatch
  const [hasHydrated, setHasHydrated] = useState(false)
  useEffect(() => { setHasHydrated(true) }, [])

  // Scroll to selected row when selectedTaskId changes
  useEffect(() => {
    if (selectedTaskId && rowRefs.current[selectedTaskId]) {
      rowRefs.current[selectedTaskId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedTaskId]);

  // --- Sorting State ---
  // For standard list view, we use URL params for sorting
  const urlSortBy = params.get('sortBy') || 'publication_date'
  const urlSortOrder = params.get('sortOrder') === 'asc' ? 'asc' : 'desc'
  
  // For grouped view, we use local state to avoid reloading the whole component
  const [groupedSortBy, setGroupedSortBy] = useState(urlSortBy)
  const [groupedSortOrder, setGroupedSortOrder] = useState<'asc' | 'desc'>(urlSortOrder)
  
  // Determine which sorting state to use
  const isGroupedView = !!selectedGroupBy
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
      cell: info => <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">{info.row.original.assigned_user?.full_name || '—'}</span>,
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
          <span className="truncate max-w-[120px] whitespace-nowrap overflow-hidden text-ellipsis">{info.row.original.projects?.name || '—'}</span>
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
      cell: info => <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">{info.row.original.delivery_date ? new Date(info.row.original.delivery_date).toLocaleDateString() : '—'}</span>,
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
      cell: info => <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">{info.row.original.publication_date ? new Date(info.row.original.publication_date).toLocaleDateString() : '—'}</span>,
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
      cell: info => <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">{info.row.original.updated_at ? new Date(info.row.original.updated_at).toLocaleDateString() : '—'}</span>,
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
      cell: info => <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">{info.row.original.content_type_title || '—'}</span>,
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
      cell: info => <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">{info.row.original.production_type_title || '—'}</span>,
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
      cell: info => <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">{info.row.original.language_code || '—'}</span>,
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
  const infiniteListKey = `${sortBy}-${sortOrder}-${params.toString()}`

  const tableHeaderInstance = useReactTable({
    data: [],
    columns: taskColumns,
    getCoreRowModel: getCoreRowModel(),
  })

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
    if (expandMainTaskId && !expandedMainTasks.has(Number(expandMainTaskId))) {
      setExpandedMainTasks(prev => {
        const next = new Set(prev)
        next.add(Number(expandMainTaskId))
        return next
      })
    }
  }, [expandMainTaskId])

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

  if (!hasHydrated || !hasMeasured) return null

  return (
    <div ref={containerRef} className="flex flex-col h-screen w-full bg-transparent pl-4">
      {selectedGroupBy ? (
        <div className="overflow-x-auto h-full">
          <table className="w-full border-collapse text-sm md:text-base" style={{ tableLayout: 'fixed', background: 'transparent' }}>
            <TaskTableHeader table={tableHeaderInstance} columns={taskColumns} />
            <tbody>
              <GroupedTaskList<any>
                columns={taskColumns}
                onTaskSelect={handleTaskSelect}
                trailingQuery={trailingQuery}
                filters={{}}
                tableName="tasks"
                pageSize={25}
                sortBy={sortBy}
                sortOrder={sortOrder}
              />
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col h-full flex-1" style={{ paddingBottom: 24 }}>
          <div ref={tableScrollRef} className="overflow-x-auto w-full">
            <InfiniteList<'tasks', any>
              key={infiniteListKey}
              tableName="tasks"
              columns="id,title,content_type_id,delivery_date,publication_date,updated_at,assigned_user:users!fk_tasks_assigned_to_id(id,full_name),projects!project_id_int(id,name,color),project_statuses!project_status_id(id,name,color),content_type_title,production_type_title,language_code,copy_post,briefing,notes"
              pageSize={25}
              trailingQuery={trailingQuery}
              className="h-full"
              renderNoResults={() => (
                <div className="text-center text-gray-500 py-8">No tasks found</div>
              )}
              renderEndMessage={() => null}
            >
              {(data, { isFetching, hasMore }) => {
                // Always filter to top-level tasks only, memoized for performance
                const topLevelData = React.useMemo(
                  () => data.filter((task: any) => task.parent_task_id_int == null),
                  [data]
                );
                const table = useReactTable<any>({
                  data: topLevelData,
                  columns: taskColumns,
                  getCoreRowModel: getCoreRowModel(),
                  columnResizeMode: 'onChange',
                  state: { columnSizing },
                  onColumnSizingChange: handleColumnSizingChange,
                  debugTable: false,
                })

                // Build a flat list with subtasks inserted after their parent main task if expanded
                const rowsWithSubtasks: any[] = []
                for (const row of table.getRowModel().rows) {
                  const task = row.original
                  const isMainTask = task.content_type_id === 39 || task.content_type_id === "39"
                  rowsWithSubtasks.push({ ...row, isSubtask: false })
                  if (isMainTask && expandedMainTasks.has(task.id)) {
                    rowsWithSubtasks.push({ id: `subtasks-${task.id}`, isSubtask: 'component', parentId: task.id })
                  }
                }

                return (
                  <table className="border-collapse text-sm md:text-base w-full min-w-[1200px]" style={{ tableLayout: 'fixed', background: 'transparent' }}>
                    <thead className="sticky top-0 z-20 bg-white border-b shadow-sm">
                      {table.getHeaderGroups().map(headerGroup => (
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
                      {rowsWithSubtasks.length === 0 && !isFetching && (
                        <tr>
                          <td colSpan={taskColumns.length} className="text-center text-gray-500 py-8">No tasks found</td>
                        </tr>
                      )}
                      {rowsWithSubtasks.map(row => {
                        if (row.loading) {
                          return (
                            <tr key={row.id}>
                              <td colSpan={taskColumns.length} className="text-center text-gray-400 py-4">Loading subtasks...</td>
                            </tr>
                          )
                        }
                        if (row.empty) {
                          return (
                            <tr key={row.id}>
                              <td colSpan={taskColumns.length} className="text-center text-gray-400 py-4">No subtasks</td>
                            </tr>
                          )
                        }
                        if (row.isSubtask === 'component') {
                          return <SubtaskRows key={row.id} parentId={row.parentId} taskColumns={taskColumns} onTaskSelect={handleTaskSelect} selectedTaskId={selectedTaskId} />
                        }
                        const isSubtask = row.isSubtask
                        const isMainTask = row.original && (row.original.content_type_id === 39 || row.original.content_type_id === "39") && !isSubtask
                        const isSelected = selectedTaskId && String(row.original.id) === String(selectedTaskId)
                        const handleRowClick = (e?: React.MouseEvent) => {
                          if (isMainTask && e && (e.target as HTMLElement).closest('button')) {
                            // If the expand/collapse button was clicked, do not navigate
                            handleToggleMainTask(row.original.id);
                            return;
                          }
                          handleTaskSelect(row.original);
                        }
                        return (
                          <tr
                            key={row.id}
                            ref={el => { rowRefs.current[String(row.original.id)] = el; }}
                            className={cn(
                              'hover:bg-gray-50 cursor-pointer',
                              isMainTask && 'font-semibold',
                              isSelected && 'bg-gray-100',
                            )}
                            onClick={handleRowClick}
                          >
                            {row.getVisibleCells
                              ? row.getVisibleCells().map((cell: any) => (
                            <td
                              key={cell.id}
                              style={{
                                width: cell.column.getSize(),
                                minWidth: cell.column.getSize(),
                                maxWidth: cell.column.getSize(),
                                paddingLeft: isSubtask && cell.column.id === 'title' ? 32 : undefined,
                              }}
                              className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle"
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                                ))
                              : taskColumns.map((col, idx) => (
                                  <td
                                    key={(col as any).accessorKey || idx}
                                    style={{ paddingLeft: isSubtask && idx === 0 ? 32 : undefined }}
                                    className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle"
                                  >
                                    {row.original[(col as any).accessorKey as keyof typeof row.original]}
                                  </td>
                          ))}
                          </tr>
                        )
                      })}
                      {isFetching && (
                        <tr>
                          <td colSpan={taskColumns.length} className="text-center text-gray-400 py-4">Loading...</td>
                        </tr>
                      )}
                      {!hasMore && rowsWithSubtasks.length > 0 && (
                        <tr>
                          <td colSpan={taskColumns.length} className="text-center text-muted-foreground py-4 text-sm">No more tasks to display.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )
              }}
            </InfiniteList>
          </div>
          {/* Pinned horizontal scrollbar at bottom of screen */}
          <div
            ref={pinnedScrollbarRef}
            className="fixed left-0 right-0 bottom-0 z-50 h-5 bg-white border-t border-gray-200 shadow-sm overflow-x-auto overflow-y-hidden"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {/* Fake inner div to create scrollbar width matching table */}
            <div style={{ width: tableScrollRef.current?.scrollWidth || 1200, height: 1 }} />
          </div>
        </div>
      )}
    </div>
  )
}