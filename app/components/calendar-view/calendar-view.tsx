import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DateToggle } from './date-toggle';
import { getTasksForMonth, updateTaskDate } from '../../../lib/services/tasks';
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
import { TASK_LIST_COLUMNS, TaskListRow } from '../task-list/task-list-columns';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

// Import FullCalendar and plugins (plugins must be imported directly, not via dynamic)
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import FullCalendar from '@fullcalendar/react';

interface CalendarViewProps {
  onTaskClick?: (task: Task) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  selectedTaskId?: string | number | null;
  expandButton?: ReactNode;
  }

/**
 * CalendarView displays a monthly calendar of tasks with drag-and-drop, filtering, and detail integration.
 */
export function CalendarView({ onTaskClick, searchValue = "", onSearchChange, selectedTaskId, expandButton }: CalendarViewProps) {
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => new Date());
  const [dateField, setDateField] = useState<'delivery_date' | 'publication_date'>('delivery_date');
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [showSubtasks, setShowSubtasks] = useState(false); // NEW: toggle for subtasks
  const queryClient = useQueryClient();
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [defaultProjectId, setDefaultProjectId] = useState<number | undefined>(undefined);
  const [addTaskOptions, setAddTaskOptions] = useState<any>(null);
  const [isLoadingAddTaskOptions, setIsLoadingAddTaskOptions] = useState(false);
  const calendarRef = useRef<any>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isDayTaskPaneOpen, setIsDayTaskPaneOpen] = useState(false);
  const calendarContainerRef = useRef<HTMLDivElement>(null);
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
  // On day click, set selectedDate and open day-task pane
  const handleDayClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    setIsDayTaskPaneOpen(true);
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
  };

  const params = useSearchParams();
  const router = useRouter();

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
  const optimizedFields = 'id, title, content_type_id, delivery_date, publication_date, assigned_user:users!fk_tasks_assigned_to_id(id,full_name), projects:projects!project_id_int(id,name,color), project_statuses:project_status_id(id,name,color), content_type_title';

  // Fetch tasks for the current month and filters
  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', visibleMonth.toISOString(), dateField, filterKey, searchValue],
    queryFn: ({ signal }) => {
      console.log('[CalendarView] Fetching tasks', { visibleMonth, dateField, filterValues, searchValue, showSubtasks });
      return getTasksForMonth(visibleMonth, dateField, filterValues, searchValue, optimizedFields, signal);
    },
    staleTime: 60_000,
  });
  // Only filter out subtasks in the UI if showSubtasks is off
  const filteredTasks = (tasks || []).filter(task => showSubtasks || !task.parent_task_id_int);

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
    () => (filteredTasks).map((task: Task) => ({
      id: String(task.id),
      title: task.title,
      date: (task[dateField] ?? '').slice(0, 10),
      extendedProps: { task },
      // Visually distinguish subtasks
      className: task.parent_task_id_int ? 'bg-yellow-50 border-yellow-400' : '',
    })),
    [filteredTasks, dateField]
  );

  // Custom event rendering: use CalendarTaskCard
  const renderEventContent = (eventInfo: { event: { extendedProps: { task: Task }; title: string } }) => {
    const task = eventInfo.event.extendedProps.task;
    const colorClass = getColorClass(task);
    const isSelected = !!selectedTaskId && String(task.id) === String(selectedTaskId);
    return (
      <CalendarTaskCard
        task={task}
        colorClass={colorClass}
        onClick={() => onTaskClick?.(task)}
        isSelected={isSelected}
      />
    );
  };

  // Drag-and-drop handler: update task in Supabase and refetch
  const handleEventDrop = async (info: any) => {
    try {
      await updateTaskDate(Number(info.event.id), dateField, info.event.startStr);
      await queryClient.invalidateQueries({ queryKey: ['tasks', visibleMonth, dateField, filterValues] });
      await queryClient.invalidateQueries({ queryKey: ['task', Number(info.event.id)] });
    } catch (err) {
      alert('Failed to update task date: ' + (err as Error).message);
      info.revert();
    }
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

  // Calendar type dropdown
  const [calendarType, setCalendarType] = useState<'calendar' | 'kanban'>('calendar');
  // Date field dropdown
  const [dateFieldOpen, setDateFieldOpen] = useState(false);
  // Month navigation and picker
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  // Month/year picker logic
  const months = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString('default', { month: 'long' }));
  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i);
  // Month navigation handlers and label
  const handlePrevMonth = () => setVisibleMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const handleNextMonth = () => setVisibleMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  const monthLabel = visibleMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  // --- Render ---
  const [colorMode, setColorMode] = useState<'contentType' | 'assignedTo' | 'project'>('contentType');
  const getColorClass = (task: Task) => {
    if (colorMode === 'assignedTo') {
      if (!task.assigned_to_id) return 'border-gray-300';
      const colors = ['border-blue-500','border-green-500','border-pink-500','border-yellow-500','border-purple-500','border-orange-500','border-teal-500'];
      const idx = (parseInt(task.assigned_to_id, 10) || 0) % colors.length;
      return colors[idx];
    } else if (colorMode === 'project') {
      if (!task.project_id_int) return 'border-gray-300';
      const colors = ['border-blue-500','border-green-500','border-pink-500','border-yellow-500','border-purple-500','border-orange-500','border-teal-500'];
      const idx = (parseInt(task.project_id_int.toString(), 10) || 0) % colors.length;
      return colors[idx];
    } else {
      const type = task.content_types?.[0]?.title?.toLowerCase();
      switch (type) {
        case 'article': return 'border-blue-500';
        case 'video': return 'border-red-500';
        case 'quiz': return 'border-green-500';
        case 'newsletter': return 'border-yellow-500';
        default: return 'border-gray-300';
      }
    }
  };

  // Add dayCellClassNames to highlight selected and today
  const dayCellClassNames = (arg: any) => {
    const classes = [];
    const dateStr = arg.date.toISOString().slice(0, 10);
    if (selectedDate && dateStr === selectedDate) classes.push('fc-day-selected');
    // today is handled by FullCalendar's fc-day-today, but we will override its style
    return classes;
  };
  // Only show day-task pane for calendar view and when open
  const showDayTaskPane = calendarType === 'calendar' && isDayTaskPaneOpen && selectedDate;
  return (
    <section className="w-full h-full flex flex-col gap-2">
      <div className="flex items-center gap-2 px-2 py-2 bg-white sticky top-0 z-10 border-b border-gray-100">
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
        {/* Date field dropdown */}
        <DropdownMenu open={dateFieldOpen} onOpenChange={setDateFieldOpen}>
          <DropdownMenuTrigger asChild>
            <button className={pillButton + ' min-w-[140px]'} type="button">
              {dateField === 'delivery_date' ? 'Delivery Date' : 'Publication Date'} <ChevronDown size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => { setDateField('delivery_date'); setDateFieldOpen(false); }}>Delivery Date</DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setDateField('publication_date'); setDateFieldOpen(false); }}>Publication Date</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Calendar type dropdown (next to date field) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={pillButton + ' min-w-[110px]'} type="button">
              {calendarType === 'calendar' ? 'Calendar' : 'Kanban'} <ChevronDown size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setCalendarType('calendar')}>Calendar</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCalendarType('kanban')}>Kanban</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Subtasks toggle */}
        <span className="mx-2 text-gray-200 select-none">|</span>
        <button
          className={pillButton + (showSubtasks ? ' bg-blue-600 text-white border-blue-600' : '')}
          onClick={() => setShowSubtasks(v => !v)}
          type="button"
        >
          Subtasks
        </button>
        {/* Color code pill */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={pillButton + ' min-w-[120px]'} type="button">
              {colorMode === 'contentType' ? 'Color: Content Type' : colorMode === 'assignedTo' ? 'Color: Assigned To' : 'Color: Project'} <ChevronDown size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setColorMode('contentType')}>Content Type</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setColorMode('assignedTo')}>Assigned To</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setColorMode('project')}>Project</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Expand/restore button slot (right-aligned) */}
        <div className="flex-1" />
        {expandButton}
      </div>
      <PanelGroup direction="vertical" className="flex-1 h-full">
        <Panel minSize={20} defaultSize={showDayTaskPane ? 66 : 100} collapsible={false} className="flex-1 h-full">
          <div ref={calendarContainerRef} className="h-full p-4">
        <style>{`
              /* Minimalist FullCalendar overrides */
              .fc {
                font-family: inherit;
                background: #fff;
                color: #222;
          }
              /* Remove all borders and backgrounds from day cells */
          .fc .fc-daygrid-day-frame {
                background: #fff !important;
                border: none !important;
                border-radius: 0.5rem;
                box-shadow: none;
                transition: background 0.2s;
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
            {calendarType === 'calendar' ? (
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
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-400">Kanban view coming soon...</div>
            )}
          </div>
        </Panel>
        {showDayTaskPane && (
          <>
            <PanelResizeHandle className="relative flex items-center justify-center h-3 bg-gray-100 hover:bg-gray-200 transition cursor-row-resize group">
              <div className="w-8 h-1 rounded-full bg-gray-300 group-hover:bg-gray-400 transition" />
            </PanelResizeHandle>
            <Panel minSize={15} defaultSize={34} collapsible className="h-full">
              <div className="relative h-full px-6 py-4 bg-white border-t border-gray-200 shadow-sm flex flex-col">
                <div className="font-semibold text-lg mb-2">Tasks for {selectedDate}</div>
                <div className="overflow-x-auto flex-1">
                  <table className="border-collapse text-sm md:text-base w-full" style={{ tableLayout: 'fixed' }}>
                    <thead className="bg-white border-b shadow-sm">
                      <tr>
                        {TASK_LIST_COLUMNS.map(col => (
                          <th key={col.key} className="px-3 py-2 text-left font-medium text-gray-500 border-r border-gray-200 select-none">
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasks.filter(task => (task[dateField]?.slice(0, 10) === selectedDate)).length === 0 ? (
                        <tr>
                          <td colSpan={TASK_LIST_COLUMNS.length} className="text-center text-gray-500 py-8">No tasks found</td>
                        </tr>
                      ) : (
                        filteredTasks.filter(task => (task[dateField]?.slice(0, 10) === selectedDate)).map((row: any) => (
                          <tr key={row.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onTaskClick?.(row)}>
                            {TASK_LIST_COLUMNS.map(col => (
                              <td key={col.key} className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">
                                {col.render(row)}
                              </td>
                            ))}
                          </tr>
                        ))
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
      {!isLoading && (!tasks || tasks.length === 0) && (
        <div className="text-center text-gray-500 py-8">No tasks for this month.</div>
      )}
    </section>
  );
} 