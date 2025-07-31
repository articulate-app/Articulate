"use client"

import { ReactNode, useState, cloneElement, useEffect, useCallback, useRef } from "react"
import { Sidebar } from "./Sidebar"
import { TaskDetails } from "./TaskDetails"
import { normalizeTask } from "./task-cache-utils"
import { Menu, X, ChevronLeft, ChevronRight, Calendar, PanelLeft, PanelRight, Maximize2, Minimize2, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Task } from '../../lib/types/tasks'
import React, { useMemo } from "react"
import { CalendarView } from '../../components/calendar-view/calendar-view'
import { TaskHeaderBar } from '../../components/ui/task-header-bar'
import { ResizablePanel } from "../ui/resizable-panel"
import { SlidePanel } from "../ui/slide-panel"
import { AddTaskForm } from './AddTaskForm'
import { useRouter } from 'next/navigation'
import { useTasksUI, ViewMode } from '../../store/tasks-ui'
import { useSearchParams, usePathname } from 'next/navigation'
import { TaskList } from './TaskList'
import { getTaskById } from '../../../lib/services/tasks';
import { useQueryClient } from '@tanstack/react-query';
import { GroupingDropdown } from './grouping-dropdown';
import { PanelGroup, Panel, PanelResizeHandle, ImperativePanelHandle } from 'react-resizable-panels';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../ui/dropdown-menu';
import { FilterBadges } from "../../../components/ui/filter-badges";
import type { TaskFilters as TaskFiltersType } from '../../store/tasks-ui';
import { useFilterOptions } from '../../hooks/use-filter-options';
import type { TaskEditFields } from '../../hooks/use-task-edit-fields';
import type { FilterOptions } from '../../lib/services/filters';

// Transform editFields data to filter options format
function transformEditFieldsToFilterOptions(editFields: TaskEditFields, users: any[] = []): FilterOptions {
  // Deduplicate project statuses by name
  const statusMap = new Map<string, any>();
  (editFields.project_statuses || []).forEach(status => {
    if (!status.name || typeof status.name !== 'string') return;
    if (!statusMap.has(status.name) || (statusMap.get(status.name).id > status.id)) {
      statusMap.set(status.name, status);
    }
  });
  
  const dedupedStatuses = Array.from(statusMap.values());
  
  return {
    users: (users || [])
      .filter(user => user.id && user.full_name)
      .map(user => ({ value: String(user.id), label: user.full_name })),
    statuses: dedupedStatuses.map(status => ({
      value: status.name, // Use name as value for Typesense filtering
      label: status.name,
      color: status.color,
      order_priority: status.order_priority,
      project_id: status.project_id
    })),
    projects: (editFields.projects || []).map(project => ({
      value: String(project.id),
      label: project.name
    })),
    contentTypes: (editFields.content_types || []).map(type => ({
      value: String(type.id),
      label: type.title
    })),
    productionTypes: (editFields.production_types || []).map(type => ({
      value: String(type.id),
      label: type.title
    })),
    languages: (editFields.languages || []).map(lang => ({
      value: String(lang.id),
      label: `${lang.long_name} (${lang.code})`
    })),
    channels: (editFields.channels || []).map(channel => ({
      value: String(channel.id),
      label: channel.name
    }))
  };
}
import { KanbanView } from '../kanban-view/kanban-view';
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useTaskEditFields } from '../../hooks/use-task-edit-fields'
import { useTaskRealtime } from '../../../hooks/use-task-realtime';
import { useDebounce } from "../../hooks/use-debounce";
import { useMobileDetection } from '../../hooks/use-mobile-detection';
import { MobileNavigation, type MobileViewMode } from './mobile-navigation';
import { MobileTaskDetail } from './mobile-task-detail';
import { ResizableBottomSheet } from '../ui/resizable-bottom-sheet';
import { TaskFilters } from './TaskFilters';

// No need to import types for URLSearchParams or FilterBadge; use global types

type SetFiltersFn = (filters: TaskFiltersType) => void;

// Helper to map filters to badges, using label mapping from filterOptions
export function getActiveFilterBadges(
  filters: TaskFiltersType,
  setFilters: SetFiltersFn,
  router: any,
  pathname: string,
  params: URLSearchParams,
  filterOptions?: any
): { badges: Array<{ id: string; label: string; value: string; onRemove: () => void }>; onClearAll: () => void } {
  const badges: Array<{ id: string; label: string; value: string; onRemove: () => void }> = [];
  const updateUrl = (newFilters: TaskFiltersType) => {
    const newParams = new URLSearchParams(params.toString());
    [
      'assignedTo','status','project','contentType','productionType','language','channels',
      'deliveryDateFrom','deliveryDateTo','publicationDateFrom','publicationDateTo'
    ].forEach((key: string) => newParams.delete(key));
    if (newFilters.assignedTo?.length) newParams.set('assignedTo', newFilters.assignedTo.join(','));
    if (newFilters.status?.length) newParams.set('status', newFilters.status.join(','));
    if (newFilters.project?.length) newParams.set('project', newFilters.project.join(','));
    if (newFilters.contentType?.length) newParams.set('contentType', newFilters.contentType.join(','));
    if (newFilters.productionType?.length) newParams.set('productionType', newFilters.productionType.join(','));
    if (newFilters.language?.length) newParams.set('language', newFilters.language.join(','));
    if (newFilters.channels?.length) newParams.set('channels', newFilters.channels.join(','));
    if (newFilters.deliveryDate?.from) newParams.set('deliveryDateFrom', newFilters.deliveryDate.from.toISOString().slice(0,10));
    if (newFilters.deliveryDate?.to) newParams.set('deliveryDateTo', newFilters.deliveryDate.to.toISOString().slice(0,10));
    if (newFilters.publicationDate?.from) newParams.set('publicationDateFrom', newFilters.publicationDate.from.toISOString().slice(0,10));
    if (newFilters.publicationDate?.to) newParams.set('publicationDateTo', newFilters.publicationDate.to.toISOString().slice(0,10));
    router.replace(`${pathname}?${newParams.toString()}`);
    setFilters(newFilters);
  };
  const filterLabels: Record<string, string> = {
    assignedTo: 'Assignee',
    status: 'Status',
    project: 'Project',
    contentType: 'Content Type',
    productionType: 'Production Type',
    language: 'Language',
    channels: 'Channel',
  };
  const getLabel = (key: string, val: string): string => {
    if (!filterOptions) return val;
    switch (key) {
      case 'project': {
        const opt = filterOptions.projects?.find((p: any) => String(p.value) === String(val));
        return opt?.label || val;
      }
      case 'assignedTo': {
        const opt = filterOptions.users?.find((u: any) => String(u.value) === String(val));
        return opt?.label || val;
      }
      case 'status': {
        const opt = filterOptions.statuses?.find((s: any) => String(s.label) === String(val) || String(s.value) === String(val));
        return opt?.label || val;
      }
      case 'contentType': {
        const opt = filterOptions.contentTypes?.find((c: any) => String(c.value) === String(val));
        return opt?.label || val;
      }
      case 'productionType': {
        const opt = filterOptions.productionTypes?.find((p: any) => String(p.value) === String(val));
        return opt?.label || val;
      }
      case 'language': {
        const opt = filterOptions.languages?.find((l: any) => String(l.value) === String(val));
        return opt?.label || val;
      }
      case 'channels': {
        const opt = filterOptions.channels?.find((ch: any) => String(ch.value) === String(val) || String(ch.id) === String(val));
        return opt?.label || val;
      }
      default:
        return val;
    }
  };
  Object.entries(filterLabels).forEach(([key, label]) => {
    const arr = (filters as any)[key] as string[];
    if (Array.isArray(arr) && arr.length) {
      arr.forEach((val: string) => {
        badges.push({
          id: `${key}-${val}`,
          label,
          value: getLabel(key, val),
          onRemove: () => {
            const newFilters = { ...filters, [key]: arr.filter((v: string) => v !== val) };
            updateUrl(newFilters);
          },
        });
      });
    }
  });
  if (filters.deliveryDate?.from) {
    badges.push({
      id: 'deliveryDate-from',
      label: 'Delivery Date',
      value: `from ${filters.deliveryDate.from.toLocaleDateString()}`,
      onRemove: () => {
        const newFilters = { ...filters, deliveryDate: { ...filters.deliveryDate, from: undefined } };
        updateUrl(newFilters);
      },
    });
  }
  if (filters.deliveryDate?.to) {
    badges.push({
      id: 'deliveryDate-to',
      label: 'Delivery Date',
      value: `to ${filters.deliveryDate.to.toLocaleDateString()}`,
      onRemove: () => {
        const newFilters = { ...filters, deliveryDate: { ...filters.deliveryDate, to: undefined } };
        updateUrl(newFilters);
      },
    });
  }
  if (filters.publicationDate?.from) {
    badges.push({
      id: 'publicationDate-from',
      label: 'Publication Date',
      value: `from ${filters.publicationDate.from.toLocaleDateString()}`,
      onRemove: () => {
        const newFilters = { ...filters, publicationDate: { ...filters.publicationDate, from: undefined } };
        updateUrl(newFilters);
      },
    });
  }
  if (filters.publicationDate?.to) {
    badges.push({
      id: 'publicationDate-to',
      label: 'Publication Date',
      value: `to ${filters.publicationDate.to.toLocaleDateString()}`,
      onRemove: () => {
        const newFilters = { ...filters, publicationDate: { ...filters.publicationDate, to: undefined } };
        updateUrl(newFilters);
      },
    });
  }
  // Function to clear all filters
  const onClearAll = () => {
    const emptyFilters: TaskFilters = {
      assignedTo: [],
      status: [],
      deliveryDate: {},
      publicationDate: {},
      project: [],
      contentType: [],
      productionType: [],
      language: [],
      channels: []
    };
    updateUrl(emptyFilters);
  };

  return { badges, onClearAll };
}

// Normalize a task from any view to the flat shape expected by TaskDetails
function normalizeBasicTask(task: any): any {
  if (!task) return undefined;
  // Log the incoming task for debugging
  if (typeof window !== 'undefined') {
    console.log('[normalizeBasicTask] input:', task);
  }
  const normalized = {
    id: task.id,
    title: task.title,
    assigned_to_id: task.assigned_to_id ?? task.assigned_user?.id ?? task.users?.id,
    assigned_to_name: task.assigned_to_name ?? task.assigned_user?.full_name ?? task.users?.full_name,
    content_type_id: task.content_type_id,
    content_type_title: task.content_type_title,
    production_type_id: task.production_type_id,
    production_type_title: task.production_type_title,
    language_id: task.language_id,
    language_code: task.language_code,
    delivery_date: task.delivery_date,
    publication_date: task.publication_date,
    project_id_int: task.project_id_int ?? task.projects?.id,
    project_name: task.project_name ?? task.projects?.name,
    project_color: task.project_color ?? task.projects?.color,
    project_status_id: task.project_status_id ?? task.project_statuses?.id,
    project_status_name: task.project_status_name ?? task.project_statuses?.name,
    project_status_color: task.project_status_color ?? task.project_statuses?.color,
    parent_task_id_int: task.parent_task_id_int,
    channel_names: task.channel_names,
  };
  if (typeof window !== 'undefined') {
    console.log('[normalizeBasicTask] output:', normalized);
  }
  return normalized;
}

// Custom hook to fetch and merge rich fields from the edge function
import { useQuery } from '@tanstack/react-query';
const RICH_FIELDS = [
  'copy_post', 'briefing', 'notes', 'meta_title', 'meta_description', 'keyword',
  'channel_names', 'attachments', 'subtasks', 'thread_id', 'mentions', 'watchers', 'project_watchers'
];

function useTaskDetails(taskId: string | number | undefined, accessToken: string | null, initialData: any) {
  const RICH_FIELDS = [
    'copy_post', 'briefing', 'notes', 'meta_title', 'meta_description', 'keyword',
    'channel_names', 'attachments', 'subtasks', 'thread_id', 'mentions', 'watchers', 'project_watchers'
  ];
  return useQuery({
    queryKey: ['task', taskId, accessToken],
    queryFn: async () => {
      if (!taskId || !accessToken) return initialData;
      const res = await fetch(`https://hlszgarnpleikfkwujph.supabase.co/functions/v1/task-details-bootstrap?task_id=${taskId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch task details');
      const data = await res.json();
      // Merge all fields from data.task and data
      const merged = { ...initialData, ...(data.task || {}), ...data };
      if (typeof window !== 'undefined') {
        console.log('[useTaskDetails] merged result:', merged);
      }
      return merged;
    },
    enabled: !!taskId && !!accessToken,
    initialData,
    staleTime: 0,
    select: (data) => {
      if (!data) return initialData;
      // Merge again to ensure all fields are present
      return { ...initialData, ...data };
    }
  });
}

// Helper to get initial task from view data (kanban/list/calendar cache)
function getInitialTaskFromViewData(taskId: string | number, preloadedTasks: any[]): any | undefined {
  return preloadedTasks.find(t => String(t.id) === String(taskId));
}

interface TasksLayoutProps {
  children: ReactNode
  selectedTask?: Task | null
  isDetailsCollapsed?: boolean
  onCloseDetails?: () => void
  viewMode: 'list' | 'calendar' | 'kanban'
  setViewMode: (view: 'list' | 'calendar' | 'kanban') => void
  searchValue: string
  setSearchValue: (value: string) => void
  onFilterClick: () => void
  onAddTaskClick: () => void
  onSidebarToggle?: () => void
  onTaskUpdate?: (updatedFields: Partial<Task>) => void
  onAddSubtask?: (parentTaskId: number, projectId: number) => void
  onSubtaskFormCancel?: () => void
  onSubtaskFormSuccess?: () => void
  isAddTaskOpen: boolean
  setIsAddTaskOpen: (open: boolean) => void
  isAddSubtaskPaneOpen: boolean
  setIsAddSubtaskPaneOpen: (open: boolean) => void
  addSubtaskContext: { parentTaskId: number, projectId: number } | null
  handleAddTaskSuccess: (task: Task) => void
}

export function TasksLayout({ 
  children, 
  onCloseDetails = () => {},
  viewMode: _viewMode,
  setViewMode: _setViewMode,
  searchValue: _searchValue,
  setSearchValue: _setSearchValue,
  onFilterClick,
  onAddTaskClick,
  onSidebarToggle,
  onTaskUpdate,
  onAddSubtask,
  onSubtaskFormCancel,
  onSubtaskFormSuccess,
  isAddTaskOpen: _isAddTaskOpen,
  setIsAddTaskOpen: _setIsAddTaskOpen,
  isAddSubtaskPaneOpen,
  setIsAddSubtaskPaneOpen,
  addSubtaskContext,
  handleAddTaskSuccess,
  isSidebarOpen = false,
  isSidebarCollapsed = true,
  onSidebarToggle: _onSidebarToggle,
}: Omit<TasksLayoutProps, 'selectedTask' | 'isDetailsCollapsed'> & { isSidebarOpen?: boolean, isSidebarCollapsed?: boolean, onSidebarToggle?: () => void }) {
  console.log('[TasksLayout] COMPONENT RENDER START');
  // --- Global UI state ---
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const {
    viewMode,
    setViewMode,
    searchValue,
    setSearchValue,
    syncFromUrl,
    selectedTaskId,
    setSelectedTaskId,
    filters,
    setFilters,
  } = useTasksUI();

  const layoutMountCount = useRef(0);
  useEffect(() => {
    layoutMountCount.current += 1;
    console.log(`[TasksLayout] 🟢 COMPONENT MOUNTED #${layoutMountCount.current}`);
    return () => {
      console.log(`[TasksLayout] 🔴 COMPONENT UNMOUNTING #${layoutMountCount.current}`);
    };
  }, []);

  // Track if the filter pane is open
  const [isFilterPaneOpen, setIsFilterPaneOpen] = useState(false);

  // Local state fallback for Add Task modal
  const [localIsAddTaskOpen, localSetIsAddTaskOpen] = useState(false);
  const isAddTaskOpen = typeof _isAddTaskOpen === 'boolean' ? _isAddTaskOpen : localIsAddTaskOpen;
  const setIsAddTaskOpen = _setIsAddTaskOpen || localSetIsAddTaskOpen;

  // **FIX: Split layout config to prevent middle view changes from affecting left pane**
  // Core layout state (affects panel sizing and visibility)
  const [coreLayoutConfig, setCoreLayoutConfig] = useState({
    layout: ['left', 'middle'] as string[], // visible panes
    leftView: 'list' as string,
    rightView: 'details' as string,
    focus: null as string | null, // focused pane
  });
  
  // Middle view state (separate to prevent affecting other panes)
  const [middleView, setMiddleView] = useState('calendar' as string);
  
  // Combine for backward compatibility where needed
  const layoutConfig = useMemo(() => ({
    ...coreLayoutConfig,
    middleView,
  }), [coreLayoutConfig, middleView]);
  
  console.log('[TasksLayout] Current layoutConfig state:', layoutConfig);
  console.log('[TasksLayout] Current URL params:', Object.fromEntries(params.entries()));

  // Debug: log whenever core layout config changes (but not middleView)
  React.useEffect(() => {
    console.log('[TasksLayout] *** coreLayoutConfig CHANGED ***:', coreLayoutConfig);
    console.log('[TasksLayout] *** This coreLayoutConfig change was caused by render #' + renderCount.current + ' ***');
  }, [coreLayoutConfig]);

  // Debug: log when middle view changes (separate from core layout)
  React.useEffect(() => {
    console.log('[TasksLayout] *** middleView CHANGED ***:', middleView);
  }, [middleView]);

  // Panel refs for imperative resizing
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const centerPanelRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);
  const panelGroupRef = useRef<any>(null);
  
  // **FIX: Track user's preferred left pane width to prevent layout shifts**
  const [userPreferredLeftWidth, setUserPreferredLeftWidth] = useState<number | null>(null);
  const [hasUserResized, setHasUserResized] = useState(false);

  // Mobile state management
  const isMobile = useMobileDetection();
  const [mobileView, setMobileView] = useState<MobileViewMode>('list');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mobileTaskDetailOpen, setMobileTaskDetailOpen] = useState(false);

  // Only sync Zustand state from URL on initial mount (never set selectedTaskId from URL after mount)
  const hasHydratedFromURL = React.useRef(false);
  console.log('[TasksLayout] hasHydratedFromURL.current:', hasHydratedFromURL.current);
  
  // Debug: Track renders and their causes
  const renderCount = useRef(0);
  renderCount.current += 1;
  console.log(`[TasksLayout] 🔄 RENDER #${renderCount.current}`, {
    layoutConfig,
    selectedTaskId,
    hasHydrated: hasHydratedFromURL.current,
    urlParams: Object.fromEntries(params.entries())
  });
  
  React.useEffect(() => {
    console.log('[TasksLayout] *** HYDRATION EFFECT TRIGGERED ***');
    if (!hasHydratedFromURL.current) {
      // LOG hydration start
      // eslint-disable-next-line no-console
      console.log('[TasksLayout] Starting hydration from URL', Object.fromEntries(params.entries()));
      // Only sync search and filters, layout system handles layout/view independently
      const q = params.get('q') || '';
      setSearchValue(q);
      // Note: filters are handled separately by TaskFilters component
      
      // Sync layout config from URL
      const urlLayout = params.get('layout')?.split(',').filter(Boolean) || ['left', 'middle'];
      const urlLeftView = params.get('leftView') || 'list';
      const urlMiddleView = params.get('middleView') || 'calendar'; // Default to calendar, independent of old view param
      const urlRightView = params.get('rightView') || 'details';
      const urlFocus = params.get('focus');
      
      const initialCoreConfig = {
        layout: urlLayout,
        leftView: urlLeftView,
        rightView: urlRightView,
        focus: urlFocus,
      };
      
      console.log('[TasksLayout] Setting initial core layout config:', initialCoreConfig);
      console.log('[TasksLayout] Setting initial middle view:', urlMiddleView);
      setCoreLayoutConfig(initialCoreConfig);
      setMiddleView(urlMiddleView);
      
      hasHydratedFromURL.current = true;
      // eslint-disable-next-line no-console
      console.log('[TasksLayout] Hydration complete. hasHydratedFromURL.current is now:', hasHydratedFromURL.current);
    }
    // Never sync selectedTaskId from URL after initial hydration
  }, []);

  // IMMEDIATE RESIZE CHECK: If state is already correct but panel isn't expanded
  React.useEffect(() => {
    console.log('[TasksLayout] 🔄 IMMEDIATE RESIZE EFFECT #' + renderCount.current + ' triggered with:', {
      hasHydrated: hasHydratedFromURL.current,
      focus: coreLayoutConfig.focus,
      layout: coreLayoutConfig.layout
    });
    
    const shouldExpandLeft = hasHydratedFromURL.current && (
      (coreLayoutConfig.focus === 'left' && coreLayoutConfig.layout.includes('left')) ||
      (coreLayoutConfig.layout.length === 1 && coreLayoutConfig.layout[0] === 'left')
    );
    
    const shouldExpandMiddle = hasHydratedFromURL.current && (
      (coreLayoutConfig.focus === 'middle' && coreLayoutConfig.layout.includes('middle')) ||
      (coreLayoutConfig.layout.length === 1 && coreLayoutConfig.layout[0] === 'middle')
    );
    
    const shouldExpandRight = hasHydratedFromURL.current && (
      (coreLayoutConfig.focus === 'right' && coreLayoutConfig.layout.includes('right')) ||
      (coreLayoutConfig.layout.length === 1 && coreLayoutConfig.layout[0] === 'right')
    );
    
    console.log('[TasksLayout] Should expand check:', {
      shouldExpandLeft,
      shouldExpandMiddle, 
      shouldExpandRight
    });
    
    if (shouldExpandLeft || shouldExpandMiddle || shouldExpandRight) {
      const targetPane = shouldExpandLeft ? 'left' : shouldExpandMiddle ? 'middle' : 'right';
      console.log('[TasksLayout] *** IMMEDIATE RESIZE CHECK ***');
      console.log(`[TasksLayout] State is correct for ${targetPane} focus, checking if resize is needed`);
      console.log('[TasksLayout] Debug conditions:', {
        hasHydratedFromURL: hasHydratedFromURL.current,
        layoutConfigFocus: coreLayoutConfig.focus,
        layoutConfigLayout: coreLayoutConfig.layout,
        shouldExpandLeft,
        shouldExpandMiddle,
        shouldExpandRight,
        targetPane
      });
      
      const attemptResize = (attempt = 1) => {
        console.log(`[TasksLayout] Resize attempt ${attempt}`);
        
        if (leftPanelRef.current && centerPanelRef.current) {
          const currentSizes = {
            left: leftPanelRef.current.getSize(),
            center: centerPanelRef.current.getSize(),
            right: rightPanelRef.current?.getSize() || 'not available'
          };
          console.log('[TasksLayout] Current panel sizes:', currentSizes);
          
          // Check which pane should be expanded and verify it
          const targetSize = targetPane === 'left' ? currentSizes.left : 
                           targetPane === 'middle' ? currentSizes.center :
                           (typeof currentSizes.right === 'number' ? currentSizes.right : 0);
          
          if (!targetSize || (typeof targetSize === 'number' && targetSize < 90)) { // If target panel is not nearly full width
            console.log(`[TasksLayout] ${targetPane} panel not expanded, forcing resize`);
            
            if (targetPane === 'left') {
              leftPanelRef.current.resize(100);
              centerPanelRef.current.resize(0);
              if (rightPanelRef.current) rightPanelRef.current.resize(0);
                                      } else if (targetPane === 'middle') {
               // Delay middle resize to avoid conflict with main effect
               console.log('[TasksLayout] Delaying immediate middle resize to avoid conflict');
               setTimeout(() => {
                 if (leftPanelRef.current && centerPanelRef.current) {
                   console.log('[TasksLayout] Executing delayed middle resize');
                   leftPanelRef.current.resize(0);
                   centerPanelRef.current.resize(100);
                   if (rightPanelRef.current) rightPanelRef.current.resize(0);
                 }
               }, 200);
             } else if (targetPane === 'right' && rightPanelRef.current) {
              leftPanelRef.current.resize(0);
              centerPanelRef.current.resize(0);
              rightPanelRef.current.resize(100);
            }
            
            // Verify resize worked
            setTimeout(() => {
              const newSizes = {
                left: leftPanelRef.current?.getSize(),
                center: centerPanelRef.current?.getSize(),
                right: rightPanelRef.current?.getSize() || 'not available'
              };
              console.log('[TasksLayout] Sizes after immediate resize:', newSizes);
              
                            const newTargetSize = targetPane === 'left' ? newSizes.left : 
                                targetPane === 'middle' ? newSizes.center :
                                (typeof newSizes.right === 'number' ? newSizes.right : 0);
              
              if (!newTargetSize || (typeof newTargetSize === 'number' && newTargetSize < 90)) {
                console.log('[TasksLayout] ⚠️ Immediate resize failed - will rely on main resize effect');
              } else {
                console.log('[TasksLayout] ✅ Immediate resize worked!');
              }
            }, 50);
          } else {
            console.log(`[TasksLayout] ${targetPane} panel already expanded correctly`);
          }
        } else {
          console.log('[TasksLayout] Panel refs not ready yet, attempt:', attempt);
          if (attempt < 5) {
            setTimeout(() => attemptResize(attempt + 1), 200 * attempt);
          }
        }
      };
      
      // Start with immediate attempt, then retry with delays
      attemptResize(1);
    }
  }, [hasHydratedFromURL.current, coreLayoutConfig.focus, coreLayoutConfig.layout]);

  // Layout system is independent of old view parameter
  const isHydratedAndSynced = hasHydratedFromURL.current;

  // **FIX: Split URL sync - core layout separate from middle view**
  // Sync core layout config from URL changes (URL is the single source of truth)
  React.useEffect(() => {
    console.log('[TasksLayout] 🔄 CORE LAYOUT URL SYNC EFFECT #' + renderCount.current + ' triggered. hasHydratedFromURL.current:', hasHydratedFromURL.current);
    if (!hasHydratedFromURL.current) {
      console.log('[TasksLayout] Skipping core layout URL sync - not hydrated yet');
      return;
    }
    
    const urlLayout = params.get('layout')?.split(',').filter(Boolean) || ['left', 'middle'];
    const urlLeftView = params.get('leftView') || 'list';
    const urlRightView = params.get('rightView') || 'details';
    const urlFocus = params.get('focus');
    
    const newCoreConfig = {
      layout: urlLayout,
      leftView: urlLeftView,
      rightView: urlRightView,
      focus: urlFocus,
    };
    
    // Only update if changed
    const coreConfigChanged = JSON.stringify(newCoreConfig) !== JSON.stringify(coreLayoutConfig);
    console.log('[TasksLayout] Core layout config sync check:', {
      newCoreConfig,
      currentCoreConfig: coreLayoutConfig,
      coreConfigChanged,
    });
    
    if (coreConfigChanged) {
      console.log('[TasksLayout] 🔥 SYNCING core layout config from URL:', newCoreConfig);
      setCoreLayoutConfig(newCoreConfig);
    } else {
      console.log('[TasksLayout] ✅ Core layout config already matches URL - no update needed');
    }
  }, [params.get('layout'), params.get('leftView'), params.get('rightView'), params.get('focus')]);

  // Sync middle view separately (won't trigger layout effects)
  React.useEffect(() => {
    console.log('[TasksLayout] 🔄 MIDDLE VIEW URL SYNC EFFECT #' + renderCount.current + ' triggered. hasHydratedFromURL.current:', hasHydratedFromURL.current);
    if (!hasHydratedFromURL.current) {
      console.log('[TasksLayout] Skipping middle view URL sync - not hydrated yet');
      return;
    }
    
    const urlMiddleView = params.get('middleView') || 'calendar';
    
    if (urlMiddleView !== middleView) {
      console.log('[TasksLayout] 🔄 SYNCING middle view from URL:', urlMiddleView, '(was:', middleView, ')');
      setMiddleView(urlMiddleView);
    } else {
      console.log('[TasksLayout] ✅ Middle view already matches URL - no update needed');
    }
  }, [params.get('middleView')]);

  // Imperatively resize panels when CORE layout config changes (NOT middleView)
  React.useEffect(() => {
    console.log('[TasksLayout] 🔄 RESIZE EFFECT #' + renderCount.current + ' TRIGGERED');
    console.log('[TasksLayout] Resize effect triggered. coreLayoutConfig:', coreLayoutConfig, 'hasHydratedFromURL.current:', hasHydratedFromURL.current);
    if (!hasHydratedFromURL.current) {
      console.log('[TasksLayout] Not hydrated yet, skipping resize');
      return;
    }
    
    // Extract layout info first
    const { layout, focus } = coreLayoutConfig;
    const isLeftVisible = layout.includes('left');
    const isCenterVisible = layout.includes('middle');
    const isRightVisible = layout.includes('right');
    
    // Helper to safely resize right panel
    const resizeRightPanel = (size: number) => {
      if (rightPanelRef.current) {
        rightPanelRef.current.resize(size);
      }
    };

    const performResize = () => {
      // Check if required panels are ready
      if (!leftPanelRef.current || !centerPanelRef.current) {
        console.log('[TasksLayout] Essential panel refs not ready:', {
          left: !!leftPanelRef.current,
          center: !!centerPanelRef.current,
          right: !!rightPanelRef.current,
          isRightVisible
        });
        return false;
      }
      
      // For right panel, only require it if it should be visible
      if (isRightVisible && !rightPanelRef.current) {
        console.log('[TasksLayout] Right panel required but not ready');
        return false;
      }

      console.log('[TasksLayout] Resizing panels for core layout config:', coreLayoutConfig);
      
      if (focus === 'left') {
        console.log('[TasksLayout] FOCUS LEFT - resizing to 100%');
        console.log('[TasksLayout] Panel sizes before resize:', {
          left: leftPanelRef.current.getSize(),
          center: centerPanelRef.current.getSize(),
          right: rightPanelRef.current?.getSize() || 'not available'
        });
        
        try {
          // Try multiple approaches to force resize
          console.log('[TasksLayout] Attempting resize approach 1: individual panel resize');
          leftPanelRef.current.resize(100);
          centerPanelRef.current.resize(0);
          if (rightPanelRef.current) {
            rightPanelRef.current.resize(0);
          }
          
          // Individual panel resize approach is working, skip PanelGroup setLayout
          console.log('[TasksLayout] Individual panel resize completed successfully');
          
          // Force multiple attempts with slight delays
          setTimeout(() => {
            console.log('[TasksLayout] Retry resize after 50ms');
            leftPanelRef.current?.resize(100);
            centerPanelRef.current?.resize(0);
            if (rightPanelRef.current) rightPanelRef.current.resize(0);
          }, 50);
          
          setTimeout(() => {
            console.log('[TasksLayout] Retry resize after 200ms');
            leftPanelRef.current?.resize(100);
            centerPanelRef.current?.resize(0);
            if (rightPanelRef.current) rightPanelRef.current.resize(0);
          }, 200);
          
          // Check sizes after resize
          setTimeout(() => {
            console.log('[TasksLayout] Panel sizes after resize:', {
              left: leftPanelRef.current?.getSize(),
              center: centerPanelRef.current?.getSize(),
              right: rightPanelRef.current?.getSize() || 'not available'
            });
            console.log('[TasksLayout] PanelGroup layout:', panelGroupRef.current?.getLayout?.());
          }, 300);
        } catch (error) {
          console.error('[TasksLayout] Error during resize:', error);
        }
              } else if (focus === 'middle') {
        console.log('[TasksLayout] FOCUS MIDDLE - resizing middle to 100%');
        console.log('[TasksLayout] Panel sizes before middle resize:', {
          left: leftPanelRef.current.getSize(),
          center: centerPanelRef.current.getSize(),
          right: rightPanelRef.current?.getSize() || 'not available'
        });
        
        leftPanelRef.current.resize(0);
        centerPanelRef.current.resize(100);
        if (rightPanelRef.current) rightPanelRef.current.resize(0);
        
        // Verify middle resize worked
        setTimeout(() => {
          const sizesAfterMiddle = {
            left: leftPanelRef.current?.getSize(),
            center: centerPanelRef.current?.getSize(),
            right: rightPanelRef.current?.getSize() || 'not available'
          };
          console.log('[TasksLayout] Panel sizes after middle resize:', sizesAfterMiddle);
          
          if (sizesAfterMiddle.center && sizesAfterMiddle.center < 90) {
            console.log('[TasksLayout] ⚠️ Middle resize failed! Center panel size:', sizesAfterMiddle.center);
          } else {
            console.log('[TasksLayout] ✅ Middle resize successful! Center panel size:', sizesAfterMiddle.center);
          }
        }, 100);
      } else if (focus === 'right') {
        console.log('[TasksLayout] FOCUS RIGHT - resizing right to 100%');
        leftPanelRef.current.resize(0);
        centerPanelRef.current.resize(0);
        if (rightPanelRef.current) rightPanelRef.current.resize(100);
              } else {
          console.log('[TasksLayout] NO FOCUS - split layout');
          console.log('[TasksLayout] Visible panes:', { isLeftVisible, isCenterVisible, isRightVisible });
          console.log('[TasksLayout] isLeftCollapsed:', isLeftCollapsed);
          // Handle collapsed state in split layout
          if (isLeftVisible && isCenterVisible && isRightVisible) {
            const leftSize = isLeftCollapsed ? 3 : 25;
            const centerSize = isLeftCollapsed ? 72 : 50;
            const rightSize = 25;
            leftPanelRef.current.resize(leftSize);
            centerPanelRef.current.resize(centerSize);
            resizeRightPanel(rightSize);
          } else if (isLeftVisible && isCenterVisible) {
            const leftSize = isLeftCollapsed ? 3 : 30;
            const centerSize = isLeftCollapsed ? 97 : 70;
            leftPanelRef.current.resize(leftSize);
            centerPanelRef.current.resize(centerSize);
            resizeRightPanel(0);
          } else if (isLeftVisible && isRightVisible) {
            const leftSize = isLeftCollapsed ? 3 : 60;
            const rightSize = isLeftCollapsed ? 97 : 40;
            leftPanelRef.current.resize(leftSize);
            centerPanelRef.current.resize(0);
            resizeRightPanel(rightSize);
          } else if (isCenterVisible && isRightVisible) {
            leftPanelRef.current.resize(0);
            centerPanelRef.current.resize(70);
            resizeRightPanel(30);
          } else if (isLeftVisible) {
            const leftSize = isLeftCollapsed ? 3 : 100;
            console.log('[TasksLayout] SINGLE LEFT PANE - resizing to:', leftSize);
            leftPanelRef.current.resize(leftSize);
            centerPanelRef.current.resize(0);
            resizeRightPanel(0);
            
            // Verify the resize actually worked
            setTimeout(() => {
              const actualSizes = {
                left: leftPanelRef.current?.getSize(),
                center: centerPanelRef.current?.getSize(),
                right: rightPanelRef.current?.getSize() || 'not available'
              };
              console.log('[TasksLayout] Actual sizes after single pane resize:', actualSizes);
              
              if (actualSizes.left && actualSizes.left < 90) {
                console.log('[TasksLayout] ⚠️ Resize did not work! Attempting force resize...');
                // Force multiple resize attempts
                setTimeout(() => {
                  leftPanelRef.current?.resize(100);
                  centerPanelRef.current?.resize(0);
                  console.log('[TasksLayout] Force resize attempt 1');
                }, 100);
                setTimeout(() => {
                  leftPanelRef.current?.resize(100);
                  centerPanelRef.current?.resize(0);
                  console.log('[TasksLayout] Force resize attempt 2');
                }, 300);
              } else {
                console.log('[TasksLayout] ✅ Single pane resize successful!');
              }
            }, 100);
          } else if (isCenterVisible) {
            console.log('[TasksLayout] SINGLE CENTER PANE - resizing to 100%');
            console.log('[TasksLayout] Panel sizes before center resize:', {
              left: leftPanelRef.current.getSize(),
              center: centerPanelRef.current.getSize(),
              right: rightPanelRef.current?.getSize() || 'not available'
            });
            
            leftPanelRef.current.resize(0);
            centerPanelRef.current.resize(100);
            resizeRightPanel(0);
            
            // Verify center resize worked
            setTimeout(() => {
              const sizesAfterCenter = {
                left: leftPanelRef.current?.getSize(),
                center: centerPanelRef.current?.getSize(),
                right: rightPanelRef.current?.getSize() || 'not available'
              };
              console.log('[TasksLayout] Panel sizes after center resize:', sizesAfterCenter);
              
              if (sizesAfterCenter.center && sizesAfterCenter.center > 90) {
                console.log('[TasksLayout] ✅ Center resize successful! Center panel size:', sizesAfterCenter.center);
              } else {
                console.log('[TasksLayout] ⚠️ Center resize failed! Center panel size:', sizesAfterCenter.center);
              }
            }, 50);
          } else if (isRightVisible) {
            leftPanelRef.current.resize(0);
            centerPanelRef.current.resize(0);
            resizeRightPanel(100);
          }
      }
      return true;
    };

    // Try to resize immediately
    if (!performResize()) {
      // If refs not ready, try again after a short delay
      const timeout = setTimeout(() => {
        console.log('[TasksLayout] Retrying resize after refs ready');
        performResize();
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [coreLayoutConfig, hasHydratedFromURL.current]); // Only depend on coreLayoutConfig, not middleView

  // Handle layout changes by directly updating URL (no state update)
  const handleLayoutChange = useCallback((changes: Partial<typeof layoutConfig>) => {
    console.log('[TasksLayout] 🔄 handleLayoutChange #' + renderCount.current + ' called with:', changes);
    console.log('[TasksLayout] Current layoutConfig:', layoutConfig);
    
    const newParams = new URLSearchParams(params.toString());
    
    // Apply changes to current config
    let newConfig = { ...layoutConfig, ...changes };
    console.log('[TasksLayout] New config before focus handling:', newConfig);
    
    // Special handling for focus mode - simplify layout to only show focused pane
    if (newConfig.focus) {
      const focusedPane = newConfig.focus;
      if (focusedPane === 'left') {
        newConfig.layout = ['left'];
      } else if (focusedPane === 'middle') {
        newConfig.layout = ['middle'];
      } else if (focusedPane === 'right') {
        newConfig.layout = ['right'];
      }
    }
    console.log('[TasksLayout] Final newConfig:', newConfig);
    
    // Update URL params
    if (newConfig.layout.length > 0) {
      newParams.set('layout', newConfig.layout.join(','));
    } else {
      newParams.delete('layout');
    }
    
    // Always preserve view parameters (even when panes are not in layout)
    // This allows restoring the correct view when de-expanding from focus mode
    if (newConfig.leftView) {
      newParams.set('leftView', newConfig.leftView);
    }
    
    if (newConfig.middleView) {
      newParams.set('middleView', newConfig.middleView);
    }
    
    if (newConfig.rightView) {
      newParams.set('rightView', newConfig.rightView);
    }
    
    if (newConfig.focus) {
      newParams.set('focus', newConfig.focus);
    } else {
      newParams.delete('focus');
    }
    
    // If right pane is not visible, remove task ID
    if (!newConfig.layout.includes('right')) {
      newParams.delete('id');
    }
    
    // Clean up any old view parameters
    newParams.delete('view');
    
    console.log('[TasksLayout] About to update URL to:', `${pathname}?${newParams.toString()}`);
    router.replace(`${pathname}?${newParams.toString()}`, { scroll: false });
    // Don't update state directly - let the URL effect handle it
  }, [coreLayoutConfig, middleView, params, pathname, router]);

  // Helper to access current layout state
  const { layout, focus, leftView, rightView } = coreLayoutConfig; // Use coreLayoutConfig for layout decisions
  const isLeftVisible = layout.includes('left');
  const isCenterVisible = layout.includes('middle');
  const isRightVisible = layout.includes('right');

  const supabase = createClientComponentClient();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (data?.session?.access_token) setAccessToken(data.session.access_token);
    })();
  }, [supabase]);

  // State to track when to fetch edit fields
  const [shouldFetchEditFields, setShouldFetchEditFields] = useState(false);
  
  // Fetch task edit fields data - only when explicitly triggered
  const { data: editFields } = useTaskEditFields(shouldFetchEditFields ? accessToken : null);
  
  // **FIX: Memoize editFields to prevent unnecessary TaskList re-renders**
  const memoizedEditFields = useMemo(() => editFields, [editFields]);

  // Set up realtime subscriptions for tasks
  const { isSubscribed } = useTaskRealtime({
    enabled: true,
    showNotifications: false, // Set to true for debugging
    onTaskUpdate: (task, event) => {
      console.log(`[TasksLayout] Received ${event} event for task:`, task.id)
      // The cache updates are handled automatically by the hook
    }
  });

  // --- Preload task data for instant Task Details UI ---
  let preloadedTasks: any[] = [];
  const queryClient = useQueryClient();
  
  // Check for list/calendar data (tasks queries)
  if (isLeftVisible || (isCenterVisible && middleView === 'calendar')) {
    const tasksQueries = queryClient.getQueryCache().findAll({
      predicate: q => Array.isArray(q.queryKey) && q.queryKey[0] === 'tasks'
    });
    for (const q of tasksQueries) {
      const data = q.state.data;
      console.log('LIST QUERY KEY:', q.queryKey);
      console.log('LIST QUERY DATA:', data);
      if (data && typeof data === 'object' && 'pages' in data && Array.isArray((data as any).pages)) {
        // InfiniteList: flatten all pages
        for (const page of (data as any).pages) {
          if (Array.isArray(page)) {
            preloadedTasks = preloadedTasks.concat(page);
          }
        }
      } else if (Array.isArray(data)) {
        // Flat array
        preloadedTasks = preloadedTasks.concat(data);
      }
    }
    // Normalize all tasks
    if (preloadedTasks.length > 0) {
      console.log('Sample raw task from LIST QUERY DATA:', preloadedTasks[0]);
      console.log('Sample normalized task:', normalizeBasicTask(preloadedTasks[0]));
    }
    preloadedTasks = preloadedTasks.map(normalizeBasicTask);
    console.log('Flattened list preloadedTasks:', preloadedTasks);
    console.log('Flattened list preloadedTasks ids:', preloadedTasks.map(t => t.id));
  }
  
  // Check for kanban data
  if (isCenterVisible && middleView === 'kanban') {
    const kanbanQueries = queryClient.getQueryCache().findAll({
      predicate: q => Array.isArray(q.queryKey) && q.queryKey[0] === 'kanban-bootstrap'
    });
    for (const q of kanbanQueries) {
      const data = q.state.data;
      console.log('KANBAN QUERY KEY:', q.queryKey);
      console.log('KANBAN QUERY DATA:', data);
      if (Array.isArray(data)) {
        // Flat array of tasks (not your case)
        preloadedTasks = preloadedTasks.concat(data);
      } else if (
        data &&
        typeof data === 'object' &&
        (data as any).tasks &&
        typeof (data as any).tasks === 'object'
      ) {
        // New shape: tasks is an object of arrays
        preloadedTasks = preloadedTasks.concat(
          Object.values((data as any).tasks).flat()
        );
      } else if (
        data &&
        typeof data === 'object' &&
        'groups' in data &&
        data.groups &&
        typeof data.groups === 'object'
      ) {
        // Older grouped shape
        preloadedTasks = preloadedTasks.concat(
          Object.values(data.groups).flat()
        );
      }
    }
    console.log('Flattened kanban preloadedTasks:', preloadedTasks);
    console.log('Flattened kanban preloadedTasks ids:', preloadedTasks.map(t => t.id));
  }

  // Debug: log all query keys in the React Query cache
  console.log('All query keys in cache:', queryClient.getQueryCache().getAll().map(q => q.queryKey));

  // Add state to store the last selected task object
  const [lastSelectedTask, setLastSelectedTask] = useState<any>(undefined);
  console.log('selectedTaskId:', selectedTaskId);
  console.log('preloadedTasks ids:', preloadedTasks.map(t => t.id));
  let initialTaskForDetails: any = undefined;
  if (lastSelectedTask && String(lastSelectedTask.id) === String(selectedTaskId)) {
    initialTaskForDetails = normalizeBasicTask(lastSelectedTask);
  } else if (selectedTaskId !== null && selectedTaskId !== undefined) {
    const foundTask = getInitialTaskFromViewData(selectedTaskId, preloadedTasks);
    initialTaskForDetails = foundTask ? normalizeBasicTask(foundTask) : undefined;
  }
  console.log('initialTask for useTaskDetails:', initialTaskForDetails);
  if (preloadedTasks.length === 0) {
    console.warn('No preloadedTasks found in cache for current view.');
  }
  const foundTask = preloadedTasks && selectedTaskId
    ? preloadedTasks.find((t) => String(t.id) === String(selectedTaskId) || Number(t.id) === Number(selectedTaskId))
    : undefined;
  if (!foundTask) {
    console.warn('Task not found in preloadedTasks for id:', selectedTaskId);
  }
  // initialTaskForDetails is now the merged object
  // const initialTaskForDetails = foundTask ? normalizeBasicTask(foundTask) : undefined;
  // console.log('initialTask for TaskDetails:', initialTaskForDetails);

  // --- Fetch selected task if selectedTaskId is present ---
  function isValidTaskId(id: unknown): id is string | number {
    return (typeof id === 'string' && id.trim() !== '') || (typeof id === 'number' && !isNaN(id));
  }
  const queryKey = isValidTaskId(selectedTaskId)
    ? ['task', selectedTaskId, accessToken]
    : ['task', 'none', accessToken];

  const { data: selectedTaskData, isLoading: isTaskLoading, isSuccess: isTaskDetailsSuccess } = useTaskDetails(
    selectedTaskId === null ? undefined : selectedTaskId,
    accessToken,
    initialTaskForDetails // will be undefined if not found in cache
  );

  // Trigger edit fields fetch after task details succeed
  useEffect(() => {
    if (isTaskDetailsSuccess && selectedTaskData && accessToken && !shouldFetchEditFields) {
      setShouldFetchEditFields(true);
    }
  }, [isTaskDetailsSuccess, selectedTaskData, accessToken, shouldFetchEditFields]);

  // selectedTask is now the merged object
  const selectedTask = selectedTaskData;
  const threadId = selectedTask?.thread_id;
  const attachments = selectedTask?.attachments;
  const mentions = selectedTask?.mentions;
  const watchers = selectedTask?.watchers;
  const subtasks = selectedTask?.subtasks;
  const project_watchers = selectedTask?.project_watchers;

  // Memoize normalized selectedTask to avoid unnecessary re-renders
  const memoizedSelectedTask = useMemo(
    () => selectedTask ? normalizeTask(selectedTask) : undefined,
    [selectedTask]
  );

  // Compute visibleMonth for calendar when a task is selected
  let visibleMonth: Date | null = null;
  if (selectedTask) {
    const dateStr = selectedTask.delivery_date || selectedTask.publication_date;
    if (dateStr) {
      const date = new Date(dateStr);
      visibleMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    }
  }

  // **FIX: Create a stable, memoized TaskList component outside render**
  const MemoizedTaskList = React.useMemo(
    () => React.memo(TaskList, (prevProps, nextProps) => {
      // Only re-render if the props that actually matter have changed
      return (
        prevProps.onTaskSelect === nextProps.onTaskSelect &&
        prevProps.selectedTaskId === nextProps.selectedTaskId &&
        JSON.stringify(prevProps.editFields) === JSON.stringify(nextProps.editFields)
      );
    }),
    []
  );

  // **FIX: Track current panel sizes to preserve them during layout changes**
  const currentPanelSizes = useRef<{ left: number; middle: number }>({ left: 25, middle: 75 });
  
  const updatePanelSizes = useCallback((leftSize: number, middleSize: number) => {
    currentPanelSizes.current = { left: leftSize, middle: middleSize };
    console.log('[TasksLayout] Updated panel sizes:', currentPanelSizes.current);
  }, []);

  // **FIX: Track user's manual resize of left pane**
  const handleLeftPaneResize = useCallback((newSize: number) => {
    console.log('[TasksLayout] User resized left pane to:', newSize);
    setUserPreferredLeftWidth(newSize);
    setHasUserResized(true);
    // Update the current panel sizes tracking
    updatePanelSizes(newSize, currentPanelSizes.current.middle);
  }, [updatePanelSizes]);

  // **FIX: Track user's manual resize of middle pane**
  const [userPreferredMiddleWidth, setUserPreferredMiddleWidth] = useState<number | null>(null);
  const [hasUserResizedMiddle, setHasUserResizedMiddle] = useState(false);
  
  const handleMiddlePaneResize = useCallback((newSize: number) => {
    console.log('[TasksLayout] User resized middle pane to:', newSize);
    setUserPreferredMiddleWidth(newSize);
    setHasUserResizedMiddle(true);
    // Update the current panel sizes tracking
    updatePanelSizes(currentPanelSizes.current.left, newSize);
  }, [updatePanelSizes]);



  // **FIX: Make handleTaskSelect callback stable to prevent unnecessary re-renders**
  const handleTaskSelect = useCallback((task: any) => {
    console.log('[TasksLayout] Task selected:', task.id, {
      currentLayout: coreLayoutConfig.layout,
      currentSelectedTaskId: selectedTaskId,
      currentFocus: focus,
      isLeftCollapsed: isLeftCollapsed
    });
    
    setLastSelectedTask(task);
    if (!task || !task.id) return;
    
    // Ensure left pane is expanded when task is selected to prevent list disappearing
    if (isLeftCollapsed) {
      console.log('[TasksLayout] Expanding left pane for task selection');
      setIsLeftCollapsed(false);
    }
    
    // Ensure right pane is included in layout when task is selected
    const currentLayout = coreLayoutConfig.layout;
    const newLayout = currentLayout.includes('right') ? currentLayout : [...currentLayout, 'right'];
    
    // When clicking task from focused pane, clear focus to enable split layout
    const shouldClearFocus = !!focus; // Clear focus if currently focused
    
    console.log('[TasksLayout] Updating URL with:', {
      taskId: task.id,
      oldLayout: currentLayout,
      newLayout: newLayout,
      currentFocus: focus,
      shouldClearFocus
    });
    
    // Create complete URL update in one operation
    const newParams = new URLSearchParams(params.toString());
    newParams.set('id', String(task.id));
    newParams.set('layout', newLayout.join(','));
    newParams.set('rightView', 'details');
    newParams.delete('view'); // Clean up any old view parameters
    
    // Clear focus when task is selected to enable split layout
    if (shouldClearFocus) {
      newParams.delete('focus');
    }
    
    // Single router call to avoid race conditions
    router.push(`${pathname}?${newParams.toString()}`, { scroll: false });
  }, [coreLayoutConfig.layout, selectedTaskId, focus, params, pathname, router, setLastSelectedTask]);

  // Use the id query param as the source of truth for selectedTaskId
  React.useEffect(() => {
    const idFromQuery = params.get('id');
    console.log('[TasksLayout] URL ID sync:', {
      idFromQuery,
      currentSelectedTaskId: selectedTaskId,
      willUpdate: idFromQuery !== selectedTaskId
    });
    
    if (idFromQuery && idFromQuery !== selectedTaskId) {
      console.log('[TasksLayout] Setting selectedTaskId to:', idFromQuery);
      setSelectedTaskId(idFromQuery);
    }
    // If no id in query, clear selection
    if (!idFromQuery && selectedTaskId) {
      console.log('[TasksLayout] Clearing selectedTaskId');
      setSelectedTaskId(null);
    }
  }, [params.get('id')]);

  // Handler for closing details pane
  const handleCloseDetails = () => {
    console.log('[TasksLayout] Closing details pane, current layout:', coreLayoutConfig.layout);
    setSelectedTaskId(null);
    
    // Remove right pane from layout and clear task ID
    const newLayout = coreLayoutConfig.layout.filter(pane => pane !== 'right');
    console.log('[TasksLayout] New layout after closing details:', newLayout);
    
    // If only middle pane remains, immediately resize to prevent flash
    if (newLayout.length === 1 && newLayout[0] === 'middle') {
      console.log('[TasksLayout] Only middle pane remaining, immediate resize to prevent flash');
      setTimeout(() => {
        if (leftPanelRef.current && centerPanelRef.current) {
          leftPanelRef.current.resize(0);
          centerPanelRef.current.resize(100);
          console.log('[TasksLayout] Immediate resize to middle completed');
        }
      }, 10); // Very small delay to ensure layout change is processed
    }
    
    handleLayoutChange({ layout: newLayout });
    
    // Also update URL to remove task ID
    const newParams = new URLSearchParams(params.toString());
    newParams.delete('id');
    newParams.delete('view'); // Clean up any old view parameters
    newParams.set('layout', newLayout.join(','));
    router.push(`${pathname}?${newParams.toString()}`, { scroll: false });
    
    if (onCloseDetails) onCloseDetails();
  };

  // Collapsed state for each panel
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isCenterCollapsed, setIsCenterCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);

  // Control whether the center pane is rendered at all
  const [shouldShowCenterPane, setShouldShowCenterPane] = useState(true);

  // Add state to control right pane visibility
  const [isRightPaneVisible, setIsRightPaneVisible] = useState(true);

  // Add local state for details panel collapsed state
  const [isDetailsCollapsed, setIsDetailsCollapsed] = useState(true);

  // Auto-expand details panel when a task is selected
  useEffect(() => {
    if (selectedTaskId) {
      setIsDetailsCollapsed(false);
    } else {
      setIsDetailsCollapsed(true);
    }
  }, [selectedTaskId]);

  // Show right pane based on layout configuration and selected task
  useEffect(() => {
    const shouldShowRightPane = isRightVisible && !!selectedTaskId;
    const wasRightPaneVisible = isRightPaneVisible;
    
    console.log('[TasksLayout] Right pane visibility check:', {
      isRightVisible,
      selectedTaskId,
      shouldShowRightPane,
      wasRightPaneVisible,
      currentLayout: coreLayoutConfig.layout
    });
    
    setIsRightPaneVisible(shouldShowRightPane);
  }, [isRightVisible, selectedTaskId, coreLayoutConfig.layout, isRightPaneVisible]);

  // Mobile handlers
  const handleMobileViewChange = (view: MobileViewMode) => {
    setMobileView(view);
    // Update the middle view to match mobile view
    if (view === 'list') {
      setMiddleView('list');
    } else if (view === 'kanban') {
      setMiddleView('kanban');
    } else if (view === 'calendar') {
      setMiddleView('calendar');
    }
  };

  const handleMobileTaskSelect = (task: Task) => {
    setSelectedTaskId(task.id);
    setMobileTaskDetailOpen(true);
    // Update URL with task ID
    const newParams = new URLSearchParams(params.toString());
    newParams.set('id', String(task.id));
    router.push(`${pathname}?${newParams.toString()}`, { scroll: false });
  };

  const handleMobileTaskDetailBack = () => {
    setMobileTaskDetailOpen(false);
    setSelectedTaskId(null);
    // Also update URL to remove task ID
    const newParams = new URLSearchParams(params.toString());
    newParams.delete('id');
    router.push(`${pathname}?${newParams.toString()}`, { scroll: false });
  };

  const handleMobileFilterClick = () => {
    setMobileFilterOpen(true);
  };

  // Sync mobile task detail state with URL
  useEffect(() => {
    if (isMobile && selectedTaskId) {
      setMobileTaskDetailOpen(true);
    } else if (isMobile && !selectedTaskId) {
      setMobileTaskDetailOpen(false);
    }
  }, [isMobile, selectedTaskId]);



  // Helper: pill button style
  const pillButton =
    'inline-flex items-center gap-1 px-4 py-1 rounded-full border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100 transition';
  // Helper: collapse button style
  const collapseButton =
    'inline-flex items-center justify-center w-7 h-7 text-gray-500 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-blue-400';
  // Helper: expand/restore button style
  const expandButton =
    'inline-flex items-center justify-center w-7 h-7 text-gray-500 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-blue-400 ml-auto';

  // CSS class helpers for pane states (disabled - using imperative resizing instead)
  function getPaneClass(pane: 'left' | 'middle' | 'right') {
    // These classes don't exist in CSS, so return empty to avoid conflicts
    // Panel sizing is handled imperatively via refs
    return '';
  }

  // Guard: If not hydrated and synced, show loading spinner (but do not return early before hooks)
  let shouldShowLoading = !isHydratedAndSynced;

  // --- Debounced Search Input Logic ---
  const [searchInput, setSearchInput] = useState(searchValue || "");
  const debouncedSearchInput = useDebounce(searchInput, 300);

  // Update global searchValue for all input (more responsive)
  useEffect(() => {
    if (debouncedSearchInput !== searchValue) {
      setSearchValue(debouncedSearchInput);
    }
  }, [debouncedSearchInput]);

  // Keep local input in sync if global searchValue changes elsewhere (e.g., URL sync)
  useEffect(() => {
    if (searchValue !== searchInput) {
      setSearchInput(searchValue || "");
    }
  }, [searchValue]);

  // When searchValue changes, update URL
  React.useEffect(() => {
    const urlQ = params.get('q') || '';
    if (searchValue !== urlQ) {
      const newParams = new URLSearchParams(params.toString());
      if (searchValue) newParams.set('q', searchValue);
      else newParams.delete('q');
      router.replace(`${pathname}?${newParams.toString()}`);
    }
  }, [searchValue]);

  // Layout system handles its own URL sync, no need for old view sync

  if (shouldShowLoading) {
    // eslint-disable-next-line no-console
    console.log('[TasksLayout] Waiting for layout system to hydrate. hasHydrated:', hasHydratedFromURL.current);
    return (
      <div className="flex items-center justify-center h-full w-full text-gray-400">Loading…</div>
    );
  }

  console.log('selectedTaskData passed to TaskDetails:', selectedTaskData);

  // Mobile layout
  if (isMobile) {
    return (
      <div className="flex flex-col h-full w-full bg-white">
        {/* Sidebar (mobile) */}
        <Sidebar isCollapsed={isSidebarCollapsed} isMobileMenuOpen={isSidebarOpen} onClose={_onSidebarToggle} />
        


        {/* Mobile Content */}
        <div className="flex-1 overflow-hidden">
          {mobileTaskDetailOpen && selectedTaskData ? (
            <MobileTaskDetail
              task={selectedTaskData}
              onBack={handleMobileTaskDetailBack}
              onTaskUpdate={onTaskUpdate}
              onAddSubtask={onAddSubtask}
            />
          ) : (
            <div className="h-full flex flex-col">
                                                                  {/* Mobile Task List Header */}
                         <div className="flex items-center justify-between p-4 bg-white">
                           <button
                             onClick={_onSidebarToggle}
                             className="inline-flex items-center justify-center w-8 h-8 text-gray-600 hover:bg-gray-100 rounded-md transition"
                             aria-label="Toggle sidebar"
                           >
                             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                             </svg>
                           </button>
                           
                           {/* Centered Title and Dropdown */}
                           <div className="flex items-baseline gap-2">
                             <h2 className="text-sm font-semibold text-gray-900">Tasks</h2>
                             
                             {/* View Dropdown */}
                             <DropdownMenu>
                               <DropdownMenuTrigger asChild>
                                 <button className="flex items-baseline gap-1 text-sm text-gray-600 hover:text-gray-800 transition">
                                   <span>{mobileView === 'list' ? 'List' : mobileView === 'calendar' ? 'Calendar' : 'Kanban'}</span>
                                   <span className="text-xs">&gt;</span>
                                 </button>
                               </DropdownMenuTrigger>
                               <DropdownMenuContent align="center">
                                 <DropdownMenuItem onClick={() => handleMobileViewChange('list')}>
                                   List
                                 </DropdownMenuItem>
                                 <DropdownMenuItem onClick={() => handleMobileViewChange('calendar')}>
                                   Calendar
                                 </DropdownMenuItem>
                                 <DropdownMenuItem onClick={() => handleMobileViewChange('kanban')}>
                                   Kanban
                                 </DropdownMenuItem>
                               </DropdownMenuContent>
                             </DropdownMenu>
                           </div>
                           
                           <button
                             onClick={() => setIsAddTaskOpen(true)}
                             className="inline-flex items-center justify-center w-8 h-8 text-gray-700 hover:text-gray-900 transition"
                             aria-label="Add Task"
                           >
                             <span className="text-lg font-semibold">+</span>
                           </button>
                         </div>

                           {/* Mobile Search Bar */}
                           <div className="px-4 py-3 bg-white">
                             <div className="relative">
                               <input
                                 type="text"
                                 placeholder="Search tasks..."
                                 value={searchInput}
                                 onChange={e => setSearchInput(e.target.value)}
                                 className="w-full pl-4 pr-12 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200 text-base"
                               />
                               <button
                                 type="button"
                                 aria-label="Filter tasks"
                                 onClick={handleMobileFilterClick}
                                 className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                                 tabIndex={0}
                               >
                                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z" />
                                 </svg>
                               </button>
                             </div>
                           </div>


              
              {/* Mobile View Content */}
              <div className={cn(
                "flex-1",
                mobileView === 'kanban' ? "overflow-x-auto overflow-y-hidden" : "overflow-hidden"
              )}>
                {mobileView === 'list' && (
                  <div className="h-full">
                    <MemoizedTaskList 
                      onTaskSelect={handleMobileTaskSelect}
                      selectedTaskId={selectedTaskId !== undefined && selectedTaskId !== null ? String(selectedTaskId) : undefined}
                      editFields={memoizedEditFields}
                    />
                  </div>
                )}
                
                {mobileView === 'kanban' && (
                  <div className="h-full">
                    <KanbanView
                      onTaskSelect={handleMobileTaskSelect}
                      searchValue={searchValue}
                      selectedTaskId={selectedTaskId}
                      onOptimisticUpdate={onTaskUpdate}
                      expandButton={null}
                      enabled={true}
                    />
                  </div>
                )}
                
                {mobileView === 'calendar' && (
                  <div className="h-full">
                    <CalendarView
                      onTaskClick={handleMobileTaskSelect}
                      searchValue={searchValue}
                      onSearchChange={setSearchValue}
                      selectedTaskId={selectedTaskId}
                      selectedTask={selectedTaskData}
                      expandButton={null}
                      onOptimisticUpdate={onTaskUpdate}
                      enabled={true}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Mobile Modals - Unified ResizableBottomSheet */}
        {(isAddTaskOpen || mobileFilterOpen) && (
          <ResizableBottomSheet
            isOpen={isAddTaskOpen || mobileFilterOpen}
            onClose={() => {
              setIsAddTaskOpen(false);
              setMobileFilterOpen(false);
            }}
            initialHeight={0.9}
            minHeight={0.5}
            maxHeight={0.95}
            title={isAddTaskOpen ? "Add Task" : "Filter Tasks"}
          >
            {isAddTaskOpen && (
              <AddTaskForm 
                onSuccess={() => setIsAddTaskOpen(false)} 
                onClose={() => setIsAddTaskOpen(false)} 
              />
            )}
            {mobileFilterOpen && (
              <div className="h-full flex flex-col">
                <TaskFilters
                  isOpen={mobileFilterOpen}
                  onClose={() => setMobileFilterOpen(false)}
                  onApplyFilters={(mappedFilters: TaskFiltersType, displayFilters: TaskFiltersType) => {
                    setFilters(displayFilters);
                    setMobileFilterOpen(false);
                  }}
                  activeFilters={filters}
                  filterOptions={memoizedEditFields ? transformEditFieldsToFilterOptions(memoizedEditFields) : undefined}
                  noWrapper={true}
                />
              </div>
            )}
          </ResizableBottomSheet>
        )}
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="flex h-full w-full max-w-full overflow-x-hidden bg-white">
      {/* Sidebar (desktop) */}
      <div style={{ width: isSidebarCollapsed ? 0 : undefined, transition: 'width 0.2s', overflow: 'hidden' }}>
        <Sidebar isCollapsed={isSidebarCollapsed} isMobileMenuOpen={isSidebarOpen} onClose={_onSidebarToggle} />
      </div>
      {/* Always render all three panels, use CSS for fullscreen/collapse */}
      <PanelGroup 
        ref={panelGroupRef}
        direction="horizontal" 
        className="flex-1 h-full" 
        autoSaveId={null}
      >
        {/* Left Pane: Task List - PRESERVE USER RESIZE */}
        <Panel
          ref={leftPanelRef}
          id="left-pane"
          order={1}
          defaultSize={(() => {
            // **FIX: Preserve user's preferred width, only change for focus**
            if (focus === 'left') {
              return 100; // Full width when focused
            } else if (focus === 'middle' || focus === 'right') {
              return 0; // Hidden when other panes focused
            }
            // **USER PREFERENCE**: Use user's resized width if available, otherwise current size
            if (hasUserResized && userPreferredLeftWidth !== null) {
              return userPreferredLeftWidth;
            }
            // **CURRENT SIZE**: Use the tracked current size to maintain stability
            return currentPanelSizes.current.left;
          })()}
          minSize={(() => {
            // Allow complete collapse when not focused OR when layout doesn't include this pane
            if (focus === 'left') return 20;
            if (focus === 'middle' || focus === 'right') return 0;
            if (!layout.includes('left')) return 0;
            return 20;
          })()} // Allow complete collapse when not focused
          maxSize={100}
          collapsible
          onResize={handleLeftPaneResize}
          className={cn(
            'border-r border-gray-200 bg-white flex flex-col transition-all duration-200',
            // **FIX: Dynamic width constraints based on focus state**
            focus === 'left' ? 'min-w-[300px]' : 'min-w-0', // Only apply min-width when focused
            (() => {
              const cssCondition = isLeftCollapsed && focus !== 'left';
              // Remove width constraints that conflict with imperative resizing
              const cssClass = cssCondition ? 'p-0 items-center justify-start' : '';
              console.log('[TasksLayout] Left panel CSS debug:', {
                isLeftCollapsed,
                focus,
                'focus !== "left"': focus !== 'left',
                cssCondition,
                cssClass,
                getPaneClass: getPaneClass('left')
              });
              return cssClass;
            })(),
            getPaneClass('left')
          )}
        >
          {/* **FIX: Collapsed View - Always Visible */}
          <div 
            className={cn(
              "flex flex-col items-center justify-start h-full pt-2 gap-2 transition-all duration-200",
              (isLeftCollapsed && focus !== 'left') ? 'block' : 'hidden'
            )}
          >
            <button
              className={collapseButton}
              aria-label="Expand task list"
              onClick={() => setIsLeftCollapsed(false)}
              type="button"
            >
              <PanelRight className="w-5 h-5" />
            </button>
            <button
              className={collapseButton + ' mt-2 bg-blue-600 text-white border-blue-600 hover:bg-blue-700'}
              aria-label="Add Task"
              onClick={() => setIsAddTaskOpen(true)}
              type="button"
            >
              +
            </button>
          </div>

          {/* **FIX: Expanded View - Always Visible */}
          <div 
            className={cn(
              "flex flex-col h-full transition-all duration-200",
              (() => {
                const shouldHide = isLeftCollapsed && focus !== 'left';
                const visibility = !shouldHide ? 'block' : 'hidden';
                console.log('[TasksLayout] Left pane expanded view visibility:', {
                  isLeftCollapsed,
                  focus,
                  'focus !== "left"': focus !== 'left',
                  shouldHide,
                  visibility,
                  selectedTaskId
                });
                return visibility;
              })()
            )}
          >
            <div
              className="flex items-center flex-nowrap overflow-x-auto overflow-y-hidden whitespace-nowrap scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent min-h-[56px] w-full"
              style={{ WebkitOverflowScrolling: 'touch', padding: 0, margin: 0 }}
            >
              <button
                className={collapseButton}
                aria-label="Collapse task list"
                onClick={() => setIsLeftCollapsed(true)}
                type="button"
              >
                <PanelLeft className="w-5 h-5" />
              </button>
              <button
                className={pillButton + ' ml-2 relative'}
                onClick={() => setIsAddTaskOpen(true)}
                type="button"
                aria-label="Add Task"
              >
                <span className="sm:hidden">+</span>
                <span className="hidden sm:inline-flex items-center gap-1">
                  + <span className="truncate">Add Task</span>
                </span>
                {/* Tooltip for icon-only state */}
                <span className="absolute left-1/2 -translate-x-1/2 mt-10 px-2 py-1 rounded bg-gray-800 text-white text-xs opacity-0 group-hover:opacity-100 transition sm:hidden pointer-events-none whitespace-nowrap z-50">
                  Add Task
                </span>
              </button>
              {/* Removed vertical divider */}
              <GroupingDropdown className={pillButton + ' min-w-[120px]'} />
              <button
                className={pillButton + ' ml-2'}
                onClick={onFilterClick}
                type="button"
              >
                Filters
              </button>
              {/* Expand/Restore button for left pane */}
              {focus !== 'middle' && (() => {
                // Check if we're in a "focused left" state - either explicit focus or left+right layout
                const isLeftFocused = focus === 'left' || (layout.length === 2 && layout.includes('left') && layout.includes('right'));
                
                return (
                <button
                  className={expandButton}
                    aria-label={isLeftFocused ? 'Restore layout' : 'Focus on task list'}
                    title={isLeftFocused ? 'Restore layout' : 'Focus on task list'}
                  onClick={() => {
                      if (isLeftFocused) {
                        // Restore to 3-pane layout (left + middle + right if task selected)
                      const currentMiddleView = params.get('middleView') || 'calendar';
                        const hasSelectedTask = !!selectedTaskId;
                      handleLayoutChange({ 
                          layout: hasSelectedTask ? ['left', 'middle', 'right'] : ['left', 'middle'],
                        leftView: 'list',
                        middleView: currentMiddleView,
                          rightView: 'details',
                        focus: null 
                      });
                    } else {
                      // Focus on left pane only
                      handleLayoutChange({ focus: 'left' });
                    }
                  }}
                  type="button"
                >
                    {isLeftFocused ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                </button>
                );
              })()}
            </div>
            {/* Active Filter Badges Bar */}
            {(() => {
              // We don't need to fetch users for badges since badge labels come from the actual filter values
              // Transform editFields to filter options format when available (users can be empty for badges)
              const filterOptions = editFields ? transformEditFieldsToFilterOptions(editFields) : undefined;
              const { badges, onClearAll } = getActiveFilterBadges(filters, setFilters, router, pathname, new URLSearchParams(params.toString()), filterOptions);
              return (
            <FilterBadges
                  badges={badges}
                  onClearAll={onClearAll}
              className="mt-2 mb-2"
            />
              );
            })()}
            
            {/* **FIX: TaskList Container - Always rendered but with controlled visibility */}
            <div className="flex-1">
              <MemoizedTaskList 
                onTaskSelect={handleTaskSelect}
                selectedTaskId={selectedTaskId !== undefined && selectedTaskId !== null ? String(selectedTaskId) : undefined}
                editFields={memoizedEditFields}
              />
            </div>
          </div>
          {isAddTaskOpen && (
            <SlidePanel isOpen={isAddTaskOpen} onClose={() => setIsAddTaskOpen(false)} position="right" className="w-[400px]">
              <AddTaskForm onSuccess={() => setIsAddTaskOpen(false)} onClose={() => setIsAddTaskOpen(false)} />
            </SlidePanel>
          )}
        </Panel>
        <PanelResizeHandle className={cn(
          'transition cursor-col-resize',
        )} style={{ width: '0.5px', minWidth: '0.5px', background: '#e5e7eb' }} />
        {/* Center Pane: Calendar/Kanban - PRESERVE USER RESIZE */}
        <Panel
          ref={centerPanelRef}
          id="center-pane"
          order={2}
          defaultSize={(() => {
            // **FIX: Preserve user's preferred width, only change for focus**
            if (focus === 'middle') {
              return 100; // Full width when focused
            } else if (focus === 'left' || focus === 'right') {
              return 0; // Hidden when other panes focused
            }
            // **USER PREFERENCE**: Use user's resized width if available, otherwise current size
            if (hasUserResizedMiddle && userPreferredMiddleWidth !== null) {
              return userPreferredMiddleWidth;
            }
            // **CURRENT SIZE**: Use the tracked current size to maintain stability
            return currentPanelSizes.current.middle;
          })()}
          minSize={(() => {
            // Allow complete collapse when not focused OR when layout doesn't include this pane
            if (focus === 'middle') return 20;
            if (focus === 'left' || focus === 'right') return 0;
            if (!layout.includes('middle')) return 0;
            return 20;
          })()} // Allow complete collapse when not focused
          maxSize={100}
          collapsible={false}
          onResize={handleMiddlePaneResize}
          className={cn(
            'bg-white flex flex-col min-w-0 transition-all duration-200',
            getPaneClass('middle')
          )}

        >
          <div className="flex-1 overflow-y-auto">
            {/* **FIX: Always render both views to prevent mount/unmount, use enabled prop for API calls** */}
            <div 
              className={cn(
                "h-full w-full",
                (isCenterVisible && middleView === 'calendar') ? 'block' : 'hidden'
              )}

            >
              <CalendarView
                onTaskClick={handleTaskSelect}
                selectedTaskId={selectedTaskId != null ? String(selectedTaskId) : undefined}
                searchValue={searchValue}
                selectedTask={selectedTask}
                onOptimisticUpdate={onTaskUpdate}
                enabled={isCenterVisible && middleView === 'calendar'} // Only enable when calendar view is active
                expandButton={
                  focus !== 'left' && (
                    <button
                      className={expandButton}
                      aria-label={focus === 'middle' ? 'Restore layout' : `Focus on ${middleView}`}
                      title={focus === 'middle' ? 'Restore layout' : `Focus on ${middleView}`}
                      onClick={() => {
                        setShouldShowCenterPane(true);
                        if (focus === 'middle') {
                          // Restore to 2-pane layout (left + middle)
                          handleLayoutChange({ 
                            layout: ['left', 'middle'],
                            leftView: 'list',
                            middleView: middleView,
                            focus: null 
                          });
                        } else {
                          // Focus on middle pane only
                          handleLayoutChange({ focus: 'middle' });
                        }
                      }}
                      type="button"
                    >
                      {focus === 'middle' ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                    </button>
                  )
                }
              />
            </div>
            <div 
              className={cn(
                "h-full w-full",
                (isCenterVisible && middleView === 'kanban') ? 'block' : 'hidden'
              )}
            >
              <KanbanView
                searchValue={searchValue}
                filters={filters}
                selectedTaskId={selectedTaskId}
                onTaskSelect={handleTaskSelect}
                onOptimisticUpdate={onTaskUpdate}
                enabled={isCenterVisible && middleView === 'kanban'} // Only enable when kanban view is active
                expandButton={
                  focus !== 'left' && (
                    <button
                      className={expandButton}
                      aria-label={focus === 'middle' ? 'Restore layout' : `Focus on ${middleView}`}
                      title={focus === 'middle' ? 'Restore layout' : `Focus on ${middleView}`}
                      onClick={() => {
                        setShouldShowCenterPane(true);
                        if (focus === 'middle') {
                          // Restore to 2-pane layout (left + middle)
                          handleLayoutChange({ 
                            layout: ['left', 'middle'],
                            leftView: 'list',
                            middleView: middleView,
                            focus: null 
                          });
                        } else {
                          // Focus on middle pane only
                          handleLayoutChange({ focus: 'middle' });
                        }
                      }}
                      type="button"
                    >
                      {focus === 'middle' ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                    </button>
                  )
                }
              />
            </div>
            

      </div>
        </Panel>
                {/* Always render right pane and resize handle, but control visibility with CSS */}
        <PanelResizeHandle className={cn(
          'transition cursor-col-resize',
          isRightPaneVisible ? 'block' : 'hidden'
        )} style={{ width: '0.5px', minWidth: '0.5px', background: '#e5e7eb', borderLeft: '1px solid #e5e7eb', zIndex: 20 }} />
        {/* Right Pane: Task Details - Always rendered but hidden when not visible */}
        <Panel
          ref={rightPanelRef}
          id="right-pane"
          order={3}
          defaultSize={focus === 'right' ? 100 : 30}
          minSize={(() => {
            // Allow complete collapse when not focused OR when layout doesn't include this pane
            if (focus === 'right') return 20;
            if (focus === 'left' || focus === 'middle') return 0;
            if (!layout.includes('right')) return 0;
            return 20;
          })()}
          maxSize={100}
          className={cn(
            'bg-white flex-shrink-0 h-full transition-all duration-200',
            // **FIX: Dynamic width constraints based on focus state**
            focus === 'right' ? 'min-w-[450px]' : 'min-w-0 max-w-none', // Remove max-width constraint when focused to allow full expansion
            getPaneClass('right'),
            // **FIX: Use CSS to completely remove from layout when hidden**
            isRightPaneVisible ? 'block' : 'hidden'
          )}
          style={{ 
            minWidth: focus === 'right' ? '450px' : '0px', 
            maxWidth: focus === 'right' ? 'none' : 'none', // Remove max-width constraint when focused
            // **FIX: When hidden, set width to 0 to remove from layout**
            width: isRightPaneVisible ? undefined : '0px'
          }}
        >
          <TaskDetails
            isCollapsed={isDetailsCollapsed}
            selectedTask={selectedTaskData}
            onClose={handleCloseDetails}
            onCollapse={handleCloseDetails}
            isExpanded={focus === 'right'}
            onExpand={() => handleLayoutChange({ focus: 'right' })}
            onRestore={() => {
              // Restore to previous layout based on whether a task is selected
              const hasSelectedTask = !!selectedTaskId;
              handleLayoutChange({ 
                layout: hasSelectedTask ? ['left', 'middle', 'right'] : ['left', 'middle'],
                leftView: 'list',
                middleView: middleView,
                rightView: 'details',
                focus: null 
              });
            }}
            onTaskUpdate={updatedFields => {
              const sanitized = {
                ...updatedFields,
                project_id_int: updatedFields.project_id_int === null ? undefined : updatedFields.project_id_int,
                parent_task_id_int: updatedFields.parent_task_id_int == null ? undefined : updatedFields.parent_task_id_int,
              };
              // Optimistically update the selected task cache
              if (selectedTaskData && selectedTaskId && accessToken) {
                queryClient.setQueryData(['task', selectedTaskId, accessToken], (old: any) => ({
                  ...old,
                  task: {
                    ...old?.task,
                    ...sanitized,
                  },
                }));
              }
              if (onTaskUpdate) onTaskUpdate(sanitized);
            }}
            onAddSubtask={onAddSubtask}
            attachments={attachments}
            threadId={threadId}
            mentions={mentions}
            watchers={watchers}
            currentUser={null}
            subtasks={subtasks}
            project_watchers={project_watchers}
            accessToken={accessToken}
          />
        </Panel>
      </PanelGroup>
      
      {/* Desktop Add Task Modal */}
      {isAddTaskOpen && (
        <SlidePanel isOpen={isAddTaskOpen} onClose={() => setIsAddTaskOpen(false)} position="right" className="w-[400px]">
          <AddTaskForm onSuccess={() => setIsAddTaskOpen(false)} onClose={() => setIsAddTaskOpen(false)} />
        </SlidePanel>
      )}
    </div>
  );
} 