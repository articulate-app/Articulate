import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DateToggle } from './date-toggle';
import { getTasksForMonth, updateTaskDate } from '../../../lib/services/tasks';
import { updateTaskInCaches } from '../tasks/task-cache-utils'
import { useTaskRealtime } from '../../../hooks/use-task-realtime';
import type { Task } from '../../lib/types/tasks';
import { CalendarTaskCard } from './calendar-task-card';
import { TaskHeaderBar } from '../../components/ui/task-header-bar';
import { SlidePanel } from '@/components/ui/slide-panel';
import { AddTaskForm } from '@/components/tasks/AddTaskForm';
import { TaskFilters as TaskFiltersComponent, TaskFilters as TaskFiltersType } from '@/components/tasks/TaskFilters';
import { getFilterOptions } from '../../lib/services/filters';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
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
      console.log('[Calendar] Assignee data for task', row.id, ':', row.assigned_user);
      console.log('[Calendar] Users data for task', row.id, ':', row.users);
      console.log('[Calendar] Assigned to ID for task', row.id, ':', row.assigned_to_id);
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
  const isMobile = useMobileDetection();
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => new Date());
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const queryClient = useQueryClient();
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [defaultProjectId, setDefaultProjectId] = useState<number | undefined>(undefined);
  const [addTaskOptions, setAddTaskOptions] = useState<any>(null);
  const [isLoadingAddTaskOptions, setIsLoadingAddTaskOptions] = useState(false);
  const calendarRef = useRef<any>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(() => {
    // Default to today's date for both mobile and desktop
    if (typeof window !== 'undefined') {
      const today = new Date();
      return today.toISOString().slice(0, 10);
    }
    return null;
  });
  const [isDayTaskPaneOpen, setIsDayTaskPaneOpen] = useState(() => {
    // Show task pane by default for both mobile and desktop
    return true;
  });
  const calendarContainerRef = useRef<HTMLDivElement>(null);
  
  // Set up realtime subscriptions for tasks
  const { isSubscribed } = useTaskRealtime({
    enabled: true,
    showNotifications: false,
    onTaskUpdate: (task, event) => {
      // Force React Query to recognize the cache update by invalidating the specific query
      const queryKey = ['tasks', visibleMonth.toISOString(), dateField, filterKey, searchValue];
      queryClient.invalidateQueries({ queryKey });
    }
  });
  
  // Debounced database updates to prevent timeouts on rapid drag-and-drop
  const pendingUpdates = useRef<Map<number, { dateField: string; newDate: string; task: any }>>(new Map());
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
  // Helper to get local YYYY-MM-DD string
  function getLocalDateString(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

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
  const handleDayClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    if (isMobile) {
      // In mobile, always show the task pane when a day is clicked
    setIsDayTaskPaneOpen(true);
    } else {
      // In desktop, toggle the pane
      setIsDayTaskPaneOpen(true);
    }
  };
  // Use dayCellDidMount for precise click and class
  const dayCellDidMount = (arg: any) => {
    arg.el.style.cursor = 'pointer';
    const dateStr = getLocalDateString(arg.date);
    arg.el.onclick = () => handleDayClick(dateStr);
    // Remove any yellow background
    arg.el.style.background = '';
    // Add custom class for selected day
    if (selectedDate && dateStr === selectedDate) {
      arg.el.classList.add('fc-day-selected');
    } else {
      arg.el.classList.remove('fc-day-selected');
    }
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
  };

  const params = useSearchParams();
  const router = useRouter();

  // Read calendar options from URL
  const calendarOptions = readCalendarOptions(new URLSearchParams(params.toString()));
  
  // Map URL dateField to database field
  const dateField = calendarOptions.dateField === 'delivery' ? 'delivery_date' : 'publication_date';
  const showSubtasks = calendarOptions.showSubtasks;

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
  const optimizedFields = 'id, title, project_id_int, project_status_name, content_type_id, content_type_title, production_type_id, production_type_title, language_id, language_code, delivery_date, publication_date, assigned_user:users!fk_tasks_assigned_to_id(id,full_name), projects:projects!project_id_int(id,name,color), project_statuses:project_status_id(id,name,color)';

  // Fetch tasks for the current month and filters
  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', visibleMonth.toISOString(), dateField, filterKey, searchValue],
    queryFn: ({ signal }) => {
      return getTasksForMonth(visibleMonth, dateField, filterValues, searchValue, optimizedFields, signal);
    },
    enabled: enabled, // Only run when view is enabled
    staleTime: 60_000,
  });

  // Only filter out subtasks in the UI if showSubtasks is off
  const filteredTasks = (tasks || []).filter(task => showSubtasks || !task.parent_task_id_int);

  // Add Typesense updater - only for optimistic updates, don't fetch data
  const typesenseQuery = useTypesenseInfiniteQuery({ q: '', pageSize: 25, enabled: false });

  // Sync FullCalendar with visibleMonth
  useEffect(() => {
    if (calendarRef.current && typeof calendarRef.current.getApi === 'function') {
      const api = calendarRef.current.getApi();
      const current = api.getDate();
      // Only update if not already at visibleMonth (compare year and month)
      if (
        current.getFullYear() !== visibleMonth.getFullYear() ||
        current.getMonth() !== visibleMonth.getMonth()
      ) {
        api.gotoDate(visibleMonth);
      }
    }
  }, [visibleMonth]);

  // Map filtered tasks to FullCalendar events
  const events = useMemo(
    () => (filteredTasks).map((task: Task) => {
      const taskDate = task[dateField];
      let dateStr = '';
      if (taskDate) {
        // Handle both string dates and Date objects
        if (taskDate && typeof taskDate === 'object' && 'toISOString' in taskDate) {
          dateStr = (taskDate as Date).toISOString().slice(0, 10);
        } else {
          dateStr = String(taskDate).slice(0, 10);
        }
      }
      
      return {
        id: String(task.id),
        title: task.title,
        date: dateStr,
        extendedProps: { task },
        // Visually distinguish subtasks
        className: task.parent_task_id_int ? 'bg-yellow-50 border-yellow-400' : '',
      };
    }),
    [filteredTasks, dateField]
  );

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

  // Compute color map for current colorMode and visible tasks
  const colorMap = useMemo(() => {
    const values: (string | number | undefined)[] = filteredTasks.map(task => {
      if (colorMode === 'assignedTo') return task.users?.full_name || task.assigned_to_id || 'unassigned';
      if (colorMode === 'project') return (Array.isArray(task.projects) ? task.projects[0]?.name : task.projects?.name) || task.project_id_int || 'no-project';
      if (colorMode === 'status') return task.project_status_name || 'no-status';
      if (colorMode === 'contentType') return (task.content_types?.[0]?.title) || task.content_type_id || 'no-content-type';
      return undefined;
    });
    const unique = Array.from(new Set(values));
    const map: Record<string | number, string> = {};
    unique.forEach((val, i) => {
      map[val ?? 'none'] = COLOR_PALETTE[i % COLOR_PALETTE.length];
    });
    return map;
  }, [filteredTasks, colorMode]);

  const getColorClass = (task: Task) => {
    let key: string | number = '';
    if (colorMode === 'assignedTo') key = task.users?.full_name || task.assigned_to_id || 'unassigned';
    else if (colorMode === 'project') key = (Array.isArray(task.projects) ? task.projects[0]?.name : task.projects?.name) || task.project_id_int || 'no-project';
    else if (colorMode === 'status') key = task.project_status_name || 'no-status';
    else if (colorMode === 'contentType') key = (task.content_types?.[0]?.title) || task.content_type_id || 'no-content-type';
    return colorMap[key] || 'bg-gray-100 text-gray-900';
  };

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
    const isSelected = !!selectedTaskId && String(task.id) === String(selectedTaskId);
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
      
      // Invalidate queries after all updates are complete
      await queryClient.invalidateQueries({ queryKey: ['tasks', visibleMonth, dateField, filterValues] });
      await queryClient.invalidateQueries({ queryKey: ['task'] });
      typesenseQuery.updateTaskInList({ id: updates[0][0], ...updates[0][1].task }); // Assuming first update is representative for typesense
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[CalendarView] Successfully processed', updates.length, 'task updates');
      }
    } catch (err) {
      console.error('Failed to process task updates:', err);
      // Revert optimistic updates on error
      updates.forEach(([taskId]) => {
        queryClient.invalidateQueries({ queryKey: ['tasks', visibleMonth, dateField, filterValues] });
        queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      });
    }
  };

  // Drag-and-drop handler: update task optimistically and queue for debounced database update
  const handleEventDrop = async (info: any) => {
    const taskId = Number(info.event.id);
    const newDate = info.event.startStr;
    
    // Get the current task data from the event
    const currentTask = info.event.extendedProps.task;
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

  // Handlers for header bar
  const handleAddTaskClick = () => {
    if (addTaskOptions && addTaskOptions.project && addTaskOptions.project.length > 0) {
      setDefaultProjectId(addTaskOptions.project[0].value);
    } else {
      setDefaultProjectId(undefined);
    }
    setIsAddTaskOpen(true);
  };

  // Wait for user session before loading filter options
  useEffect(() => {
    if (isAddTaskOpen && !isSessionReady) {
      const supabase = createClientComponentClient();
      supabase.auth.getSession().then(({ data: { session } }) => {
        setIsSessionReady(!!session);
      });
    }
  }, [isAddTaskOpen, isSessionReady]);

  // Fetch options when Add Task modal is opened
  useEffect(() => {
    if (isAddTaskOpen && !addTaskOptions) {
      setIsLoadingAddTaskOptions(true);
      getFilterOptions()
        .then((opts) => setAddTaskOptions(opts))
        .catch((error) => console.error('[AddTaskForm] Error loading filter options:', error))
        .finally(() => setIsLoadingAddTaskOptions(false));
    }
    if (!isAddTaskOpen) {
      setAddTaskOptions(null);
      setIsLoadingAddTaskOptions(false);
    }
  }, [isAddTaskOpen]);

  // --- Calendar header controls ---
  const pillButton =
    'inline-flex items-center gap-1 px-3 py-1 rounded-full border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition shadow-none focus:ring-2 focus:ring-blue-200 focus:outline-none';

  // Date field dropdown
  const [dateFieldOpen, setDateFieldOpen] = useState(false);
  // Month navigation and picker
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  // View switcher dropdown
  const [viewSwitcherOpen, setViewSwitcherOpen] = useState(false);
  // Month/year picker logic
  const months = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString('default', { month: 'long' }));
  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i);
  // Month navigation handlers and label
  const handlePrevMonth = () => setVisibleMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const handleNextMonth = () => setVisibleMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  const handleTodayClick = () => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(todayStr);
    setIsDayTaskPaneOpen(true);
  };
  const monthLabel = visibleMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

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
  const showDayTaskPane = isDayTaskPaneOpen && selectedDate;

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
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
    // Only run this effect once per selectedTask
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTask]);

  // Cleanup: process any pending updates when component unmounts
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      // Process any remaining updates
      if (pendingUpdates.current.size > 0) {
        processPendingUpdates();
      }
    };
  }, []);

  // Visual debugging
  console.log('[CalendarView] Render:', { enabled, isLoading, tasksCount: tasks?.length, filteredTasksCount: filteredTasks?.length, eventsCount: events?.length })

  return (
    <section className="w-full h-full flex flex-col gap-2">
      <div
        className="flex gap-2 items-center flex-nowrap overflow-x-auto overflow-y-hidden whitespace-nowrap scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent px-4 py-2 min-h-[56px] w-full bg-white sticky top-0 z-10 border-b border-gray-100"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* View switcher dropdown */}
        <DropdownMenu open={viewSwitcherOpen} onOpenChange={setViewSwitcherOpen}>
          <DropdownMenuTrigger asChild>
            <h2 className="flex items-center gap-1 text-xl font-semibold text-gray-900 cursor-pointer hover:text-gray-700 transition-colors">
              {params.get('middleView') === 'kanban' ? 'Kanban' : 'Calendar'}
              <ChevronDown 
                size={16} 
                className={`transition-transform duration-200 ${viewSwitcherOpen ? 'rotate-180' : ''}`}
              />
            </h2>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => {
              const newParams = new URLSearchParams(params.toString());
              newParams.set('middleView', 'calendar');
              router.replace(`?${newParams.toString()}`);
            }}>Calendar</DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              const newParams = new URLSearchParams(params.toString());
              newParams.set('middleView', 'kanban');
              router.replace(`?${newParams.toString()}`);
            }}>Kanban</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Month navigation */}
        <button className={pillButton} onClick={handlePrevMonth} aria-label="Previous month" type="button">
          <ChevronLeft size={16} />
        </button>
        {/* Month/year pill dropdown */}
        <DropdownMenu open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
          <DropdownMenuTrigger asChild>
            <button className={pillButton + ' font-semibold text-base min-w-[120px]'} type="button">
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
                      setVisibleMonth(new Date(visibleMonth.getFullYear(), i, 1));
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
                      setVisibleMonth(new Date(year, visibleMonth.getMonth(), 1));
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
        {/* Color code pill */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={pillButton + ' min-w-[120px]'} type="button">
              {colorMode === 'contentType'
                ? 'Color: Content Type'
                : colorMode === 'assignedTo'
                ? 'Color: Assigned To'
                : colorMode === 'project'
                ? 'Color: Project'
                : 'Color: Status'} <ChevronDown size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setColorMode('contentType')}>Content Type</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setColorMode('assignedTo')}>Assigned To</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setColorMode('project')}>Project</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setColorMode('status')}>Status</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Expand/restore button slot (right-aligned) */}
        <div className="flex-1" />
        {expandButton}
      </div>
      {isMobile ? (
        // Mobile layout: Calendar on top (50% height), task table below (50% height)
        <div className="flex-1 flex flex-col">
          <div ref={calendarContainerRef} className="h-1/2 p-4">
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
        `}</style>
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                events={events}
                datesSet={(arg: any) => {
                  const newDate = new Date(arg.view.currentStart);
                  if (
                    newDate.getFullYear() !== visibleMonth.getFullYear() ||
                    newDate.getMonth() !== visibleMonth.getMonth()
                  ) {
                    setVisibleMonth(newDate);
                  }
                }}
                headerToolbar={false}
                eventContent={renderEventContent}
                eventDrop={handleEventDrop}
                editable
                dayMaxEvents={4}
                fixedWeekCount={true}
                height="100%"
                dayCellDidMount={dayCellDidMount}
                dayHeaderFormat={isMobile ? { weekday: 'narrow' } : { weekday: 'short' }}
              />
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
                {filteredTasks.filter(task => (task[dateField]?.slice(0, 10) === selectedDate)).length === 0 ? (
                  <div className="text-center text-gray-500 py-8">No tasks found</div>
                ) : (
                  <div>
                    {filteredTasks.filter(task => (task[dateField]?.slice(0, 10) === selectedDate)).map((row: any) => {
                      console.log('[Calendar] Full row data for task', row.id, ':', row);
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
      <PanelGroup direction="vertical" className="flex-1 h-full">
        <Panel minSize={20} defaultSize={showDayTaskPane ? 66 : 100} collapsible={false} className="flex-1 h-full">
          <div ref={calendarContainerRef} className="h-full p-4 md:p-0">
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
        `}</style>
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                events={events}
                datesSet={(arg: any) => {
                  const newDate = new Date(arg.view.currentStart);
                  if (
                    newDate.getFullYear() !== visibleMonth.getFullYear() ||
                    newDate.getMonth() !== visibleMonth.getMonth()
                  ) {
                    setVisibleMonth(newDate);
                  }
                }}
                headerToolbar={false}
                eventContent={renderEventContent}
                eventDrop={handleEventDrop}
                editable
                dayMaxEvents={4}
                fixedWeekCount={true}
                height="100%"
                dayCellDidMount={dayCellDidMount}
                dayHeaderFormat={isMobile ? { weekday: 'narrow' } : { weekday: 'short' }}
              />
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
                      {filteredTasks.filter(task => (task[dateField]?.slice(0, 10) === selectedDate)).length === 0 ? (
                        <tr>
                          <td colSpan={CALENDAR_TASK_COLUMNS.length} className="text-center text-gray-500 py-8">No tasks found</td>
                        </tr>
                      ) : (
                        filteredTasks.filter(task => (task[dateField]?.slice(0, 10) === selectedDate)).map((row: any) => {
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
      {/* Add Task Modal */}
      <SlidePanel isOpen={isAddTaskOpen} onClose={() => setIsAddTaskOpen(false)} position="right" className="w-[400px]">
        {isLoadingAddTaskOptions ? (
          <div className="flex items-center justify-center h-32">Loading...</div>
        ) : addTaskOptions ? (
          <AddTaskForm
            onSuccess={() => setIsAddTaskOpen(false)}
            defaultProjectId={defaultProjectId}
          />
        ) : null}
      </SlidePanel>
      {/* Empty state message */}
        {!isLoading && (!filteredTasks || filteredTasks.length === 0) && (
        <div className="text-center text-gray-500 py-8">No tasks for this month.</div>
      )}
    </section>
  );
} 