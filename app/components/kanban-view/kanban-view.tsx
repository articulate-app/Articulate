import React, { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, useDroppable, rectIntersection, pointerWithin } from '@dnd-kit/core';
import { SortableContext, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { arrayMove } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
// import { useSession } from '@supabase/auth-helpers-react';
import { toast } from '../ui/use-toast';
import { updateTaskInCaches } from '../tasks/task-cache-utils';
import { useTaskRealtime } from '../../../hooks/use-task-realtime';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResizableBottomSheet } from '@/components/ui/resizable-bottom-sheet';
import { ChevronDown, ChevronRight, Zap, Search, Plus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { getTaskInlineStyle, getTaskColorKey, getTaskColorLabel, getStablePaletteClass, getStablePaletteBarClass, type TaskCardColorMode } from '@/lib/task-card-colors';
import { getImageUrl } from '@/lib/public-media';
import { flushSync, createPortal } from 'react-dom';
import { useTypesenseInfiniteQuery } from '../../hooks/use-typesense-infinite-query';
import { getTypesenseUpdater } from '../../store/typesense-tasks';
import { readKanbanOptions, writeParam } from '../../lib/utils';
import { shallowReplaceSearchParams } from '../../lib/tasks-shallow-nav';

function parseSharedListColorMode(raw: string | null): TaskCardColorMode {
  if (raw === 'contentType' || raw === 'assignedTo' || raw === 'project' || raw === 'status') return raw
  return 'contentType'
}
import { useDebounce } from '../../hooks/use-debounce';
import { useTaskGroupMetaAllQuery } from '@/hooks/use-task-group-meta-all-query';
import type { TaskListRow } from '@/lib/types/task-list-view';
import { useTasksUI } from '../../store/tasks-ui'
import { useTasksScopeProjectParam } from '../../contexts/tasks-scope-context'
import { useTaskSuggestionsQuery } from '../../hooks/use-task-suggestions-query'
import { usePlannerOptimisticTasks } from '../../store/planner-optimistic-tasks'
import { computeGroupKeyForTask } from '@/hooks/use-task-group-tasks-query'
import { useTaskComposerStore } from '@/store/task-composer-store'
import { useMobileDetection } from '../../hooks/use-mobile-detection'
import { useTasksToolbarFitForPane } from '@/contexts/tasks-toolbar-fit-context'

// Group-by options for Kanban (URL-based values)
const GROUP_BY_OPTIONS = [
  { value: 'status', label: 'Status' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'project', label: 'Project' },
  { value: 'delivery_date', label: 'Delivery Date' },
  { value: 'publication_date', label: 'Publication Date' },
  { value: 'content_type', label: 'Content Type' },
  { value: 'production_type', label: 'Production Type' },
  { value: 'channel', label: 'Channel' },
];

// Map groupBy to the actual DB field for updating
const GROUP_BY_TO_FIELD: Record<string, string> = {
  project_status_name: 'project_status_id',
  assigned_to_name: 'assigned_to_id',
  project_name: 'project_id_int',
  content_type_title: 'content_type_id',
  production_type_title: 'production_type_id',
  language_code: 'language_id',
};

// Map Kanban's underlying DB/group fields to canonical RPC p_group_by values
// (must stay in sync with list view / GroupByField)
const kanbanGroupByToRpcGroupBy: Record<string, string> = {
  assigned_to_id: 'assigned_to',
  project_status_id: 'status',
  project_id_int: 'project',
  content_type_id: 'content_type',
  production_type_id: 'production_type',
  language_id: 'language',
  delivery_date: 'delivery_date',
  publication_date: 'publication_date',
  // channel / channels: backend TBD
};


// Helper to get group label for null/empty
function getUnassignedLabel(groupBy: string) {
  switch (groupBy) {
    case 'project_status_name': return 'No Status';
    case 'assigned_to_name': return 'Unassigned';
    case 'project_name': return 'No Project';
    case 'delivery_date': return 'No Delivery Date';
    case 'publication_date': return 'No Publication Date';
    case 'content_type_title': return 'No Content Type';
    case 'production_type_title': return 'No Production Type';
    case 'channel_names': return 'No Channel';
    default: return 'Unassigned';
  }
}

// Helper to get group values from tasks
function extractGroups(tasks: any[], groupBy: string) {
  const groups = new Map<string, { label: string, value: string | null, order?: number }>();
  for (const task of tasks) {
    let value = task[groupBy];
    let label = value;
    if (value === null || value === undefined || value === '') {
      value = '__unassigned__';
      label = getUnassignedLabel(groupBy);
    }
    // For status, use order_priority if available
    let order = undefined;
    if (groupBy === 'project_status_name' && task.project_statuses?.order_priority !== undefined) {
      order = task.project_statuses.order_priority;
    }
    groups.set(String(value), { label: String(label), value: value, order });
  }
  // Sort groups
  let groupArr = Array.from(groups.values());
  if (groupBy === 'project_status_name') {
    groupArr = groupArr.sort((a, b) => {
      if (a.value === '__unassigned__') return -1;
      if (b.value === '__unassigned__') return 1;
      return (a.order ?? 999) - (b.order ?? 999);
    });
  } else if (groupBy === 'delivery_date' || groupBy === 'publication_date') {
    groupArr = groupArr.sort((a, b) => {
      if (a.value === '__unassigned__') return -1;
      if (b.value === '__unassigned__') return 1;
      return String(a.label).localeCompare(String(b.label));
    });
  } else {
    groupArr = groupArr.sort((a, b) => {
      if (a.value === '__unassigned__') return -1;
      if (b.value === '__unassigned__') return 1;
      return String(a.label).localeCompare(String(b.label));
    });
  }
  return groupArr;
}

// Clip truncation (no ellipsis)
const clipTruncate = 'overflow-hidden whitespace-nowrap text-clip';

// Compact Kanban card: white bg, left color bar, project logo, user photo
function KanbanTaskCard({
  task,
  isSelected,
  isBulkSelected,
  isMultiselectMode,
  onClick,
  colorMode,
  barColorClass,
  barInlineStyle,
}: {
  task: any;
  isSelected: boolean;
  isBulkSelected?: boolean;
  isMultiselectMode?: boolean;
  onClick: () => void;
  colorMode: TaskCardColorMode;
  barColorClass?: string;
  barInlineStyle?: React.CSSProperties;
}) {
  const isSuggestion = task?.kind === 'suggestion' || task?.entity_type === 'suggestion';
  const projectLogoUrl = getImageUrl(task.project_logo ?? task.projects?.logo);
  const userPhotoUrl = getImageUrl(task.assigned_to_photo ?? task.assigned_user?.photo);
  const initials = task.assigned_to_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase() ?? '?';
  return (
    <div
      className={cn(
        'w-full rounded-lg border border-gray-100 bg-white shadow-sm cursor-pointer transition-all relative flex overflow-hidden',
        'hover:shadow-md hover:-translate-y-[1px]',
        isBulkSelected && isMultiselectMode && 'ring-2 ring-gray-700 border-gray-300',
        isSelected && !(isMultiselectMode && isBulkSelected) && 'ring-2 ring-blue-400 border-blue-200',
      )}
      onClick={onClick}
      tabIndex={0}
      aria-selected={isSelected}
      role="button"
    >
      {/* Left color bar (3-4px) */}
      <div
        className={cn('w-1 shrink-0 rounded-l-lg self-stretch', barColorClass)}
        style={barInlineStyle}
      />
      <div className="flex-1 min-w-0 px-3 py-2">
        {isSuggestion && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="absolute top-2 right-2 text-gray-400 shrink-0">
                <Zap className="h-3 w-3" aria-label="AI suggestion" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">AI suggestion</TooltipContent>
          </Tooltip>
        )}
        <div className={cn('flex items-start gap-2 mb-1 min-w-0 pr-5', clipTruncate)}>
          <div className={cn('min-w-0 flex-1 font-medium text-sm', clipTruncate)}>{task.title}</div>
        </div>
        <div className={cn('flex items-center gap-2 text-xs text-gray-500 flex-wrap', clipTruncate)}>
          {task.project_name && (
            <span className={cn('inline-flex items-center gap-1.5 min-w-0', clipTruncate)}>
              {projectLogoUrl ? (
                <img src={projectLogoUrl} alt="" className="w-4 h-4 rounded object-cover shrink-0" />
              ) : null}
              <span className={cn('max-w-[80px]', clipTruncate)}>{task.project_name}</span>
            </span>
          )}
          {task.project_status_name && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap max-w-[120px] overflow-hidden text-clip"
              style={{
                backgroundColor: task.project_status_color || '#e5e7eb',
                color: task.project_status_color ? '#fff' : '#374151',
              }}
              title={task.project_status_name}
            >
              {task.project_status_name}
            </span>
          )}
          {task.assigned_to_name && (
            <span className={cn('inline-flex items-center gap-1 min-w-0', clipTruncate)}>
              {userPhotoUrl ? (
                <img src={userPhotoUrl} alt="" className="w-5 h-5 rounded-full object-cover shrink-0 border border-gray-300" />
              ) : (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-xs font-bold uppercase text-gray-700 border border-gray-300 shrink-0">
                  {initials}
                </span>
              )}
              <span className={cn('max-w-[60px]', clipTruncate)}>{task.assigned_to_name}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Sortable Kanban card wrapper
function SortableKanbanCard({ id, children }: { id: string, children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        transition,
        opacity: isDragging ? 0.9 : 1,
        zIndex: isDragging ? 50 : undefined,
      }}
      className={cn('mb-2', isDragging && 'ring-2 ring-blue-400 rounded-lg')}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

// Local groupBy utility for client-side grouping
function groupByField<T>(array: T[], key: (item: T) => string | number | null | undefined) {
  return array.reduce((result, item) => {
    const groupKey = key(item) ?? '__unassigned__';
    if (!result[groupKey]) result[groupKey] = [];
    result[groupKey].push(item);
    return result;
  }, {} as Record<string, T[]>);
}

// Helper to map group key to user-friendly label using metadata
function getGroupLabel({ groupBy, groupKey, meta }: { groupBy: string, groupKey: string, meta: any }) {
  if (!groupKey || groupKey === '__unassigned__' || groupKey === 'null' || groupKey === null) return 'Unassigned';

    
  const mappedKey = GROUP_BY_TO_FIELD[groupBy] || groupBy;

  let label: string | undefined;

  switch (mappedKey) {
    case 'project_status_id':
      label = meta.statuses?.find((s: any) => String(s.id) === String(groupKey))?.name;
      break;
    case 'assigned_to_id':
      label = meta.users?.find((u: any) => String(u.id) === String(groupKey))?.full_name;
      
      break;
    case 'project_id_int':
      label = meta.projects?.find((p: any) => String(p.id) === String(groupKey))?.name;
      break;
    case 'content_type_id':
      label = meta.content_types?.find((c: any) => String(c.id) === String(groupKey))?.title;
      break;
    case 'production_type_id':
      label = meta.production_types?.find((c: any) => String(c.id) === String(groupKey))?.title;
      break;
    case 'language_id':
      label = meta.languages?.find((l: any) => String(l.id) === String(groupKey))?.code;
      break;
    default:
      label = groupKey;
  }

  return label || groupKey;
}


interface KanbanViewProps {
  searchValue?: string;
  filters?: any;
  selectedTaskId?: string | number | null;
  onTaskSelect?: (task: any) => void;
  onOptimisticUpdate?: (task: any) => void;
  expandButton?: ReactNode;
  enabled?: boolean; // New prop to control when queries should run
  /** When true, do not render the toolbar row; use toolbarContainerRef to portal it instead (e.g. shared toolbar in Project > Tasks) */
  hideToolbar?: boolean;
  /** When hideToolbar is true, portal the toolbar content into this container */
  toolbarContainerRef?: React.RefObject<HTMLDivElement | null>;
  /** Portals group/sort/color/subtasks controls into Tasks overflow menu. */
  overflowToolbarContainerRef?: React.RefObject<HTMLDivElement | null>;
  /** Bumps when the overflow slot mounts so the portal re-renders. */
  overflowToolbarSlotVersion?: number;
  inlineOptionalToolbarRef?: React.RefObject<HTMLDivElement | null>;
  inlineOptionalToolbarSlotVersion?: number;
  tasksToolbarOptionalPlacement?: 'inline' | 'overflow';
  toolbarPaneKey?: string
  registerPaneOverflowMenu?: (fn: (() => React.ReactNode) | null) => void
  /** When in project scope, pass ['project'] so Project is not shown as a group-by option. */
  hiddenGroupByOptions?: string[];
  isMultiselectMode?: boolean
  bulkSelectedTaskKey?: string
  onKanbanBulkTaskToggle?: (taskId: number) => void
}

export function KanbanView({
  searchValue,
  filters,
  selectedTaskId,
  onTaskSelect,
  onOptimisticUpdate,
  expandButton,
  enabled = true,
  hideToolbar = false,
  toolbarContainerRef,
  overflowToolbarContainerRef,
  overflowToolbarSlotVersion = 0,
  inlineOptionalToolbarRef,
  inlineOptionalToolbarSlotVersion = 0,
  tasksToolbarOptionalPlacement = 'overflow',
  toolbarPaneKey = '__kanban_standalone__',
  registerPaneOverflowMenu,
  hiddenGroupByOptions,
  isMultiselectMode = false,
  bulkSelectedTaskKey = '',
  onKanbanBulkTaskToggle,
}: KanbanViewProps) {
  void overflowToolbarContainerRef
  void overflowToolbarSlotVersion
  void tasksToolbarOptionalPlacement

  const [perBucketPageSize, setPerBucketPageSize] = useState<number>(50);
  const queryClient = useQueryClient();
  const supabase = createClientComponentClient();
  const columnsContainerRef = useRef<HTMLDivElement>(null);
  const params = useSearchParams();
  const pathname = usePathname();

  const visibleGroupByOptions = useMemo(
    () => GROUP_BY_OPTIONS.filter((o) => !hiddenGroupByOptions?.includes(o.value)),
    [hiddenGroupByOptions],
  );
  // Read kanban options from URL
  const kanbanOptions = readKanbanOptions(new URLSearchParams(params.toString()));
  const groupOrder = (params.get('groupOrder') as 'asc' | 'desc' | null) ?? 'asc';
  
  // Map URL groupBy to display field used in task rows (for local updates / labels)
  const groupByDisplayField =
    kanbanOptions.groupBy === 'assignee' ? 'assigned_to_name' :
                  kanbanOptions.groupBy === 'project' ? 'project_name' : 
                  kanbanOptions.groupBy === 'status' ? 'project_status_name' : 
                  kanbanOptions.groupBy === 'priority' ? 'project_status_name' : 
                  kanbanOptions.groupBy === 'content_type' ? 'content_type_title' : 
                  kanbanOptions.groupBy === 'production_type' ? 'production_type_title' : 
                  kanbanOptions.groupBy === 'language' ? 'language_code' : 
                  kanbanOptions.groupBy === 'delivery_date' ? 'delivery_date' : 
                  kanbanOptions.groupBy === 'publication_date' ? 'publication_date' : 
    kanbanOptions.groupBy === 'channel' ? 'channel_names' :
    'project_status_name';

  // Underlying DB/group field for updates and RPC mapping
  const groupField = GROUP_BY_TO_FIELD[groupByDisplayField] || groupByDisplayField;

  // Canonical groupBy value for RPC hooks (must match list view)
  const rpcGroupBy = (kanbanGroupByToRpcGroupBy[groupField] ?? null) as string | null;

  // Query-shape inputs (project from scope when in project-scoped tasks tab)
  const q = searchValue ?? params.get('q') ?? '';
  const urlProject = params.get('project') || undefined;
  const project = useTasksScopeProjectParam(urlProject) ?? urlProject;

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

    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    const to = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999)
    return { from, to }
  }, [params.toString()])

  const suggestionsQuery = useTaskSuggestionsQuery({
    projectIds: projectIdsForSuggestions,
    from: suggestionsRange.from,
    to: suggestionsRange.to,
    enabled: enabled && plannerVisibility.showSuggestions,
    cacheKeyParts: ['kanban', groupField, groupOrder],
  })

  const optimisticPlannerTasksByKey = usePlannerOptimisticTasks((s) => s.byKey)
  const optimisticPlannerTasks = useMemo(
    () => Object.values(optimisticPlannerTasksByKey),
    [optimisticPlannerTasksByKey],
  )

  // Stabilize filters before using them in query-shape keys
  const effectiveFilters = useMemo<Record<string, string | string[]>>(
    () => (filters ? filters : {}),
    // Stringify incoming filters so new object identities don't cause spurious resets
    [JSON.stringify(filters ?? {})],
  );

  // Row sort rule: user-selected or default by group type
  const rowSortBy: string | undefined =
    kanbanOptions.taskSort ??
    (rpcGroupBy === 'delivery_date' || rpcGroupBy === 'publication_date'
      ? rpcGroupBy
      : 'updated_at');
  const rowSortOrder: 'asc' | 'desc' =
    kanbanOptions.taskSortDir ??
    (rpcGroupBy === 'delivery_date' || rpcGroupBy === 'publication_date'
      ? 'asc'
      : 'desc');

  const showSubtasks = kanbanOptions.showSubtasks;

  // Color mode: shared with list/calendar via `list_color_by`
  const [colorMode, setColorModeState] = useState<TaskCardColorMode>(() =>
    parseSharedListColorMode(params.get('list_color_by')),
  )

  useEffect(() => {
    setColorModeState(parseSharedListColorMode(params.get('list_color_by')))
  }, [params.get('list_color_by')])

  const setColorMode = useCallback(
    (mode: TaskCardColorMode) => {
      setColorModeState(mode)
      const p = writeParam(new URLSearchParams(params.toString()), 'list_color_by', mode)
      shallowReplaceSearchParams(pathname, p)
    },
    [params, pathname],
  )

  // Group/Sort panel + Add task composer (must be before onAddTaskForColumn)
  const [groupPanelOpen, setGroupPanelOpen] = useState(false);
  const [sortPanelOpen, setSortPanelOpen] = useState(false);
  const isMobile = useMobileDetection();
  const openComposer = useTaskComposerStore((s) => s.openComposer);

  // Per-group search (debounced for server query)
  const [groupSearchInputByKey, setGroupSearchInputByKey] = useState<Record<string, string>>({});
  const groupSearchDebounced = useDebounce(groupSearchInputByKey, 250);

  // Track the currently dragged task id
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  // Track task id we just moved via DnD - skip realtime clear for our own update to prevent blink
  const recentlyMovedTaskIdRef = useRef<string | null>(null);
  const recentlyMovedClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  type Cursor = { rok: string; id: number } | null;

  type BucketState = {
    rows: TaskListRow[];
    cursor: Cursor;
    hasMore: boolean;
    isFetching: boolean;
    error: string | null;
  };

  const [bucketByKey, setBucketByKey] = useState<Record<string, BucketState>>({});

  // Per-bucket in-flight / cursor dedupe state
  const inFlightByGroupRef = useRef<Record<string, boolean>>({});
  const lastCursorKeyByGroupRef = useRef<Record<string, string>>({});

  // Query-shape tracking for resets / stale response guards
  const filtersKey = useMemo(() => JSON.stringify(effectiveFilters), [effectiveFilters]);
  const lastQueryShapeRef = useRef<string | null>(null);
  const lastRequestIdByGroupRef = useRef<Record<string, number>>({});

  // Stable query-shape token used for resets (exclude per-group search - that only resets its own column)
  const queryShapeKey = useMemo(
    () =>
      JSON.stringify({
        q,
        project,
        filtersKey,
        groupBy: rpcGroupBy,
        groupOrder,
        rowSortBy,
        rowSortOrder,
        perBucketPageSize,
      }),
    [q, project, filtersKey, rpcGroupBy, groupOrder, rowSortBy, rowSortOrder, perBucketPageSize],
  );

  // When one group's search changes, only reset that group's bucket (not all)
  const prevGroupSearchRef = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const groupKey of Object.keys(groupSearchDebounced)) {
      const prev = prevGroupSearchRef.current[groupKey] ?? '';
      const next = groupSearchDebounced[groupKey]?.trim() ?? '';
      if (prev !== next) {
        prevGroupSearchRef.current = { ...prevGroupSearchRef.current, [groupKey]: next };
        delete lastCursorKeyByGroupRef.current[groupKey];
        setBucketByKey((b) => ({
          ...b,
          [groupKey]: {
            rows: [],
            cursor: null,
            hasMore: true,
            isFetching: false,
            error: null,
          },
        }));
      }
    }
  }, [groupSearchDebounced]);
  
  // Set up realtime subscriptions for tasks
  const { isSubscribed } = useTaskRealtime({
    enabled: true,
    showNotifications: false,
    onTaskUpdate: (task, event) => {
      // Skip clear for our own DnD update - we've already done the optimistic move.
      // Clearing here causes all cards to blink and the source column to stay empty.
      if (task?.id && recentlyMovedTaskIdRef.current === String(task.id)) {
        return;
      }
      // On task change from other sources, reset bucket state so fresh pages load.
      setBucketByKey({});
      inFlightByGroupRef.current = {};
      lastCursorKeyByGroupRef.current = {};
      lastRequestIdByGroupRef.current = {};
    }
  });

  // Add Typesense updater - only for optimistic updates, don't fetch data
  const typesenseQuery = useTypesenseInfiniteQuery({ q: '', pageSize: 25, enabled: false });

  // --- Group meta (B) ---
  const groupMetaQuery = useTaskGroupMetaAllQuery({
    q,
    project,
    filters: effectiveFilters,
    groupBy: rpcGroupBy,
    groupOrder,
    limit: 5000,
    enabled: enabled && !!rpcGroupBy,
    editFields: undefined,
  });

  const baseGroups = groupMetaQuery.groups || [];

  const groups = useMemo(() => {
    // Only augment date-grouped Kanban with suggestion-only dates (so suggestions can appear on their planned date).
    if (!(groupField === 'delivery_date' || groupField === 'publication_date')) return baseGroups

    const extraDates = new Set<string>()
    for (const s of suggestionsQuery.data ?? []) {
      const d = groupField === 'delivery_date' ? (s as any).delivery_date : (s as any).publication_date
      if (typeof d === 'string' && d.trim().length > 0) extraDates.add(d)
    }

    if (extraDates.size === 0) return baseGroups

    const seen = new Set(baseGroups.map(g => String(g.group_key)))
    const merged = [...baseGroups]
    for (const d of Array.from(extraDates)) {
      if (seen.has(d)) continue
      merged.push({ group_key: d, label: d } as any)
    }

    merged.sort((a: any, b: any) => {
      const at = new Date(String(a.group_key)).getTime()
      const bt = new Date(String(b.group_key)).getTime()
      const aOk = Number.isFinite(at)
      const bOk = Number.isFinite(bt)
      if (!aOk && !bOk) return 0
      if (!aOk) return 1
      if (!bOk) return -1
      return groupOrder === 'desc' ? bt - at : at - bt
    })

    return merged
  }, [baseGroups, groupField, suggestionsQuery.data, groupOrder])

  // Initialize bucket state when groups change
  useEffect(() => {
    if (!enabled || !rpcGroupBy) return;
    if (!groups.length) {
      setBucketByKey({});
      return;
    }
    setBucketByKey(prev => {
      const next: Record<string, BucketState> = { ...prev };
      // Ensure each group has a bucket
      for (const g of groups) {
        if (!next[g.group_key]) {
          next[g.group_key] = {
            rows: [],
            cursor: null,
            hasMore: true,
            isFetching: false,
            error: null,
          };
        }
      }
      // Prune buckets for groups that no longer exist
      for (const key of Object.keys(next)) {
        if (!groups.some(g => g.group_key === key)) {
          delete next[key];
        }
      }
      return next;
    });
  }, [enabled, rpcGroupBy, groups]);

  // Reset buckets on query-shape change (F)
  useEffect(() => {
    if (lastQueryShapeRef.current === queryShapeKey) {
      return;
    }

    lastQueryShapeRef.current = queryShapeKey;
    setBucketByKey({});
    inFlightByGroupRef.current = {};
    lastCursorKeyByGroupRef.current = {};
    lastRequestIdByGroupRef.current = {};
  }, [queryShapeKey]);

  // Helper to build RPC params for tasks (D/G, aligned with list view)
  const buildTasksRpcParams = useCallback(
    (groupKey: string, cursor: Cursor) => {
      // Map UI sort keys to view columns (same as list view)
      const uiToViewSortMap: Record<string, string> = {
        assigned_user: 'assigned_to_name',
        users: 'assigned_to_name',
        projects: 'project_name',
        project_statuses: 'project_status_name',
        title: 'title',
        delivery_date: 'delivery_date',
        publication_date: 'publication_date',
        publication_timestamp: 'publication_date',
        updated_at: 'updated_at',
        content_type_title: 'content_type_title',
        production_type_title: 'production_type_title',
        language_code: 'language_code',
      };

      const mappedRowSortBy = rowSortBy ? uiToViewSortMap[rowSortBy] || rowSortBy : undefined;

      // Convert project filter - can be single ID or comma-separated list.
      let projectIds: number[] | null = null;
      if (project) {
        const parsed = project
          .split(',')
          .map(p => parseInt(p.trim(), 10))
          .filter(id => !isNaN(id));
        if (parsed.length > 0) {
          projectIds = parsed;
        }
      }

      // Status filter by name
      const statusParam = effectiveFilters['project_status_name'] || effectiveFilters['status'];
      let statusNames: string[] | null = null;
      if (statusParam) {
        const statuses = Array.isArray(statusParam) ? statusParam : [statusParam];
        const names = statuses.filter(s => typeof s === 'string' && s.trim().length > 0) as string[];
        if (names.length > 0) {
          statusNames = names;
        }
      }

      // Assignee filter
      const assigneeParam = effectiveFilters['assigned_to_name'];
      let assigneeIds: number[] | null = null;
      if (assigneeParam) {
        const assignees = Array.isArray(assigneeParam) ? assigneeParam : [assigneeParam];
        const ids: number[] = [];
        for (const a of assignees) {
          const id = parseInt(String(a), 10);
          if (!isNaN(id)) {
            ids.push(id);
          }
        }
        if (ids.length > 0) {
          assigneeIds = ids;
        }
      }

      // Content type filter
      const contentTypeParam = effectiveFilters['content_type_title'];
      let contentTypeIds: number[] | null = null;
      if (contentTypeParam) {
        const contentTypes = Array.isArray(contentTypeParam) ? contentTypeParam : [contentTypeParam];
        const ids: number[] = [];
        for (const ct of contentTypes) {
          const parsed = parseInt(String(ct), 10);
          if (!isNaN(parsed)) ids.push(parsed);
        }
        if (ids.length > 0) {
          contentTypeIds = ids;
        }
      }

      // Production type filter
      const productionTypeParam = effectiveFilters['production_type_title'];
      let productionTypeIds: number[] | null = null;
      if (productionTypeParam) {
        const productionTypes = Array.isArray(productionTypeParam)
          ? productionTypeParam
          : [productionTypeParam];
        const ids: number[] = [];
        for (const pt of productionTypes) {
          const parsed = parseInt(String(pt), 10);
          if (!isNaN(parsed)) ids.push(parsed);
        }
        if (ids.length > 0) {
          productionTypeIds = ids;
        }
      }

      // Language filter
      const languageParam = effectiveFilters['language_code'];
      let languageIds: number[] | null = null;
      if (languageParam) {
        const languages = Array.isArray(languageParam) ? languageParam : [languageParam];
        const ids: number[] = [];
        for (const lang of languages) {
          const parsed = parseInt(String(lang), 10);
          if (!isNaN(parsed)) ids.push(parsed);
        }
        if (ids.length > 0) {
          languageIds = ids;
        }
      }

      // Overdue filters
      const overdueStatusParam = effectiveFilters['overdueStatus'];
      let isOverdue: boolean | null = null;
      let isPublicationOverdue: boolean | null = null;
      if (overdueStatusParam) {
        const overdueStatuses = Array.isArray(overdueStatusParam)
          ? overdueStatusParam
          : [overdueStatusParam];
        if (overdueStatuses.includes('delivery_overdue')) {
          isOverdue = true;
        }
        if (overdueStatuses.includes('publication_overdue')) {
          isPublicationOverdue = true;
        }
      }

      // Per-group search overrides global q when set
      const groupSearch = groupSearchDebounced[groupKey]?.trim();
      const effectiveQ = (groupSearch && groupSearch.length > 0) ? groupSearch : (q && q.trim().length > 0 ? q : null);

      return {
        p_q: effectiveQ,
        p_project_ids: projectIds,
        p_status_names: statusNames,
        p_assignee_ids: assigneeIds,
        p_content_type_ids: contentTypeIds,
        p_production_type_ids: productionTypeIds,
        p_language_ids: languageIds,
        p_is_overdue: isOverdue,
        p_is_publication_overdue: isPublicationOverdue,
        p_group_by: rpcGroupBy,
        p_group_key: groupKey,
        p_row_sort_by: mappedRowSortBy ?? null,
        p_row_sort_order: rowSortOrder ?? null,
        p_limit: perBucketPageSize,
        p_cursor: cursor,
      };
    },
    [q, project, effectiveFilters, rpcGroupBy, rowSortBy, rowSortOrder, perBucketPageSize, groupSearchDebounced],
  );

  // Shared fetch implementation for a single bucket (D)
  const performFetchForGroup = useCallback(
    async (groupKey: string, cursor: Cursor) => {
      if (!enabled || !rpcGroupBy) return;

      // Guard 1: in-flight per-bucket lock
      if (inFlightByGroupRef.current[groupKey]) {
        return;
      }
      inFlightByGroupRef.current[groupKey] = true;

      // Guard 2: cursor dedupe
      const cursorKey =
        cursor && typeof cursor === 'object' && 'rok' in cursor && 'id' in cursor
          ? `${(cursor as any).rok}|${(cursor as any).id}`
          : cursor
          ? JSON.stringify(cursor)
          : 'FIRST';
      if (lastCursorKeyByGroupRef.current[groupKey] === cursorKey) {
        inFlightByGroupRef.current[groupKey] = false;
        return;
      }
      lastCursorKeyByGroupRef.current[groupKey] = cursorKey;

      // Mark fetching
      setBucketByKey(prev => ({
        ...prev,
        [groupKey]: {
          rows: prev[groupKey]?.rows ?? [],
          cursor: prev[groupKey]?.cursor ?? null,
          hasMore: prev[groupKey]?.hasMore ?? true,
          isFetching: true,
          error: null,
        },
      }));

      const requestId =
        (lastRequestIdByGroupRef.current[groupKey] ?? 0) + 1;
      lastRequestIdByGroupRef.current[groupKey] = requestId;
      const queryKeyAtStart = lastQueryShapeRef.current;

      try {
        const rpcParams = buildTasksRpcParams(groupKey, cursor);
        const { data, error } = await supabase.rpc('task_group_tasks_filtered', rpcParams);

        if (lastRequestIdByGroupRef.current[groupKey] !== requestId) {
          // Stale response
          return;
        }
        if (queryKeyAtStart !== lastQueryShapeRef.current) {
          // Query shape changed mid-flight
          return;
        }

        if (error) {
          console.error('[KanbanView] task_group_tasks_filtered error', error);
          setBucketByKey(prev => ({
            ...prev,
            [groupKey]: {
              rows: prev[groupKey]?.rows ?? [],
              cursor: null,
              hasMore: false,
              isFetching: false,
              error: error.message || 'Failed to fetch tasks',
            },
          }));
          return;
        }

        const payload = (data as { rows?: TaskListRow[]; next_cursor?: any }) || {};
        const fetchedRows = payload.rows ?? [];
        const newCursor: Cursor = (payload.next_cursor as any) ?? null;

        setBucketByKey(prev => {
          const prevBucket = prev[groupKey] ?? {
            rows: [],
            cursor: null,
            hasMore: true,
            isFetching: false,
            error: null,
          };
          const existingIds = new Set(prevBucket.rows.map(r => String(r.id)));
          const dedupedNew = fetchedRows.filter(r => !existingIds.has(String(r.id)));
          const combinedRows = cursor == null ? fetchedRows : [...prevBucket.rows, ...dedupedNew];

          return {
            ...prev,
            [groupKey]: {
              rows: combinedRows,
              cursor: newCursor,
              hasMore: newCursor != null,
              isFetching: false,
              error: null,
            },
          };
        });
      } catch (err: any) {
        console.error('[KanbanView] Unexpected error fetching tasks for group', groupKey, err);
        setBucketByKey(prev => ({
          ...prev,
          [groupKey]: {
            rows: prev[groupKey]?.rows ?? [],
            cursor: null,
            hasMore: false,
            isFetching: false,
            error: err?.message || 'Failed to fetch tasks',
          },
        }));
      } finally {
        inFlightByGroupRef.current[groupKey] = false;
      }
    },
    [enabled, rpcGroupBy, buildTasksRpcParams, supabase],
  );

  // Public bucket fetch helpers (D)
  const ensureFirstPage = useCallback(
    (groupKey: string) => {
      const bucket = bucketByKey[groupKey];
      if (!bucket) {
        // Bucket will be initialized by groups effect; treat as empty
  } else {
        if (bucket.rows.length > 0) return;
        if (bucket.isFetching) return;
        if (!bucket.hasMore) return;
      }

      performFetchForGroup(groupKey, null);
    },
    [bucketByKey, performFetchForGroup],
  );

  const fetchMore = useCallback(
    (groupKey: string) => {
      const bucket = bucketByKey[groupKey];
      if (!bucket) return;
      if (bucket.isFetching) return;
      if (!bucket.hasMore) return;

      const cursor = bucket.cursor ?? null;
      if (cursor == null) return;

      performFetchForGroup(groupKey, cursor);
    },
    [bucketByKey, performFetchForGroup],
  );

  // --- Kanban columns & tasks derived from bucket state ---
  const columnDefs = useMemo(
    () =>
      groups.map(g => ({
        key: g.group_key,
        label: g.label,
      })),
    [groups],
  );

  const suggestionsByColumnKey: Record<string, TaskListRow[]> = useMemo(() => {
    if (!plannerVisibility.showSuggestions) return {}
    const out: Record<string, TaskListRow[]> = {}
    for (const s of suggestionsQuery.data ?? []) {
      const key = rpcGroupBy ? (computeGroupKeyForTask(s as any, rpcGroupBy) ?? '__unassigned__') : '__unassigned__'
      if (!out[key]) out[key] = []
      out[key].push(s as any)
    }
    return out
  }, [plannerVisibility.showSuggestions, suggestionsQuery.data, rpcGroupBy])

  const optimisticByColumnKey: Record<string, TaskListRow[]> = useMemo(() => {
    if (!plannerVisibility.showTasks) return {}
    if (!rpcGroupBy) return {}
    const out: Record<string, TaskListRow[]> = {}
    for (const t of optimisticPlannerTasks) {
      const key = computeGroupKeyForTask(t as any, rpcGroupBy) ?? '__unassigned__'
      if (!out[key]) out[key] = []
      out[key].push(t as any)
    }
    return out
  }, [plannerVisibility.showTasks, optimisticPlannerTasks, rpcGroupBy])

  const groupedTasksForColumns: Record<string, TaskListRow[]> = useMemo(() => {
    const result: Record<string, TaskListRow[]> = {};
    for (const col of columnDefs) {
      const bucket = bucketByKey[col.key];
      const rows = bucket?.rows ?? [];
      // TaskListRow does not carry parent/child metadata; parent filtering is handled elsewhere.
      const taskRows = plannerVisibility.showTasks ? rows : []
      const suggestionRows = suggestionsByColumnKey[col.key] ?? []
      const optimisticRows = plannerVisibility.showTasks ? (optimisticByColumnKey[col.key] ?? []) : []

      const seen = new Set<string>()
      const merged: any[] = []
      for (const row of [...optimisticRows, ...suggestionRows, ...taskRows]) {
        const kind = (row as any).kind ?? 'task'
        const k = `${kind}:${String((row as any).id)}`
        if (seen.has(k)) continue
        seen.add(k)
        merged.push(row)
      }

      result[col.key] = merged as any;
    }
    return result;
  }, [columnDefs, bucketByKey, showSubtasks, plannerVisibility.showTasks, plannerVisibility.showSuggestions, suggestionsByColumnKey, optimisticByColumnKey]);

  const colorLegendEntries = useMemo(() => {
    const allTasks = Object.values(groupedTasksForColumns).flat();
    const seen = new Set<string>();
    const list: { key: string; label: string; colorClass: string }[] = [];
    for (const task of allTasks) {
      const key = getTaskColorKey(task as any, colorMode);
      if (!key || key === 'none' || seen.has(key)) continue;
      seen.add(key);
      list.push({
        key,
        label: getTaskColorLabel(task as any, colorMode),
        colorClass: getStablePaletteClass(key),
      });
    }
    list.sort((a, b) => String(a.label ?? '').localeCompare(String(b.label ?? ''), undefined, { sensitivity: 'base' }));
    return list.slice(0, 20);
  }, [groupedTasksForColumns, colorMode]);

  const kanbanOverflowGroupLabel =
    visibleGroupByOptions.find((o) => o.value === kanbanOptions.groupBy)?.label ?? '—'

  const kanbanOverflowSortLabel = useMemo(() => {
    const label =
      rowSortBy === 'delivery_date'
        ? 'Delivery date'
        : rowSortBy === 'publication_date'
          ? 'Publication date'
          : rowSortBy === 'title'
            ? 'Title'
            : rowSortBy === 'assigned_to_name'
              ? 'Assignee'
              : rowSortBy === 'project_status_name'
                ? 'Status'
                : rowSortBy === 'updated_at'
                  ? 'Updated'
                  : rowSortBy ?? '—'
    return `${label} · ${rowSortOrder === 'asc' ? 'Asc' : 'Desc'}`
  }, [rowSortBy, rowSortOrder])

  const kanbanOverflowColorLabel =
    colorMode === 'contentType'
      ? 'Content Type'
      : colorMode === 'assignedTo'
        ? 'Assignee'
        : colorMode === 'project'
          ? 'Project'
          : 'Status'

  const toolbarFit = useTasksToolbarFitForPane(toolbarPaneKey)
  const kanbanSegVisible = Math.min(toolbarFit.kanbanInlineCount, 5)

  // --- Render columns and cards as before, using deduplicated columns if needed ---
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // List of valid column ids for drop validation
  const validColumnIds = columnDefs.map(col => col.key ?? '__unassigned__');

  const onAddTaskForColumn = useCallback(
    (colKey: string) => {
      const skip = colKey === '__unassigned__' || colKey === '__no_project__' || colKey === '__no_date__' || !colKey;
      const firstTask = groupedTasksForColumns[colKey]?.[0] as any;
      const initial: Record<string, string | number> = {};
      if (!skip) {
        if (groupField === 'project_status_id') {
          // colKey is status name; form needs status ID - get from first task
          const id = firstTask?.project_status_id ?? firstTask?.project_statuses?.id;
          if (id != null) initial.project_status_id = String(id);
        } else if (groupField === 'assigned_to_id') {
          initial.assigned_to_id = String(colKey);
        } else if (groupField === 'project_id_int') {
          // colKey may be project id; prefer ID from first task when available
          const id = firstTask?.project_id_int ?? firstTask?.projects?.id ?? colKey;
          initial.project_id_int = String(id);
        } else if (groupField === 'content_type_id') {
          initial.content_type_id = String(colKey);
        } else if (groupField === 'production_type_id') {
          initial.production_type_id = String(colKey);
        }
      }
      openComposer(initial);
    },
    [groupField, openComposer, groupedTasksForColumns],
  );

  const groupLabelByKey = useMemo(
    () =>
      columnDefs.reduce<Record<string, string>>((acc, col) => {
        acc[col.key] = col.label;
        return acc;
      }, {}),
    [columnDefs],
  );

  // Track which columns are horizontally visible within the scroll container
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => new Set());

  const colKeysSig = useMemo(
    () => columnDefs.map(c => c.key).join('|'),
    [columnDefs],
  );

  useEffect(() => {
    const root = columnsContainerRef.current;
    if (!root) return;

    // Clear stale visibility when column set/order changes
    setVisibleCols(new Set());

    const observer = new IntersectionObserver(
      entries => {
        setVisibleCols(prev => {
          const next = new Set(prev);
          for (const entry of entries) {
            const el = entry.target as HTMLElement;
            const key = el.dataset.colKey;
            if (!key) continue;
            if (entry.isIntersecting) {
              next.add(key);
            } else {
              next.delete(key);
            }
          }
          return next;
        });
      },
      {
        root,
        // Require most of the column to be in view; no horizontal buffer
        threshold: 0.25,
        rootMargin: '120px',
      },
    );

    const nodes = root.querySelectorAll('[data-kanban-col]');
    nodes.forEach(node => observer.observe(node));

    return () => observer.disconnect();
  }, [colKeysSig]);

  // Resolve drop target: over.id can be column key or task id (when dropping on a card)
  const resolveDropColumn = useCallback(
    (overId: string): string | null => {
      if (validColumnIds.includes(overId)) return overId;
      // Dropped on a card - find which column contains that task
      for (const [colKey, tasks] of Object.entries(groupedTasksForColumns)) {
        if (tasks.some((t: any) => String(t?.id) === String(overId))) return colKey;
      }
      return null;
    },
    [validColumnIds, groupedTasksForColumns],
  );

  // Drag end handler
  const handleDragEnd = useCallback((event: any) => {
    const { active, over } = event;
    setDraggedTaskId(null); // Always reset after drop
    if (!active || !over) return;
    const taskId = active.id;
    const newGroupKey = resolveDropColumn(String(over.id));
    if (!newGroupKey) return;
    // Find the task and its current bucket
    let sourceGroupKey: string | null = null;
    let task: TaskListRow | null = null;
    for (const [key, bucket] of Object.entries(bucketByKey)) {
      const found = bucket.rows.find(t => t && String(t.id) === String(taskId));
      if (found) {
        sourceGroupKey = key;
        task = found;
        break;
      }
    }
    if (!task || !sourceGroupKey) return;
    if (sourceGroupKey === newGroupKey) return;

    const field = groupField;
    let targetValue: any = newGroupKey;

    // For date groupings, convert YYYY-MM bucket key to first-of-month date (E/G)
    if (
      (groupField === 'delivery_date' || groupField === 'publication_date') &&
      /^\d{4}-\d{2}$/.test(newGroupKey)
    ) {
      targetValue = `${newGroupKey}-01`;
    }

    // Build denormalized patch for common groupings using group label
    const groupLabel = groupLabelByKey[newGroupKey];
    const patch: Record<string, any> = { [field]: targetValue };
    if (field === 'project_status_id') {
      patch.project_status_id = targetValue;
      if (groupLabel) patch.project_status_name = groupLabel;
    } else if (field === 'assigned_to_id') {
      patch.assigned_to_id = targetValue;
      if (groupLabel) patch.assigned_to_name = groupLabel;
    } else if (field === 'project_id_int') {
      patch.project_id_int = targetValue;
      if (groupLabel) patch.project_name = groupLabel;
    } else if (field === 'content_type_id') {
      patch.content_type_id = targetValue;
      if (groupLabel) patch.content_type_title = groupLabel;
    } else if (field === 'production_type_id') {
      patch.production_type_id = targetValue;
      if (groupLabel) patch.production_type_title = groupLabel;
    } else if (field === 'language_id') {
      patch.language_id = targetValue;
      if (groupLabel) patch.language_code = groupLabel;
    }

    const updatedTask: TaskListRow = { ...(task as any), ...patch };

    // Optimistically move task between buckets
    flushSync(() => {
      setBucketByKey(prev => {
        const next: Record<string, BucketState> = {};
        for (const [key, bucket] of Object.entries(prev)) {
          if (key === sourceGroupKey) {
            next[key] = {
              ...bucket,
              rows: bucket.rows.filter(t => String(t.id) !== String(taskId)),
            };
          } else if (key === newGroupKey) {
            next[key] = {
              ...bucket,
              rows: [updatedTask, ...bucket.rows.filter(t => String(t.id) !== String(taskId))],
            };
          } else {
            next[key] = bucket;
          }
        }
        // Ensure destination bucket exists
        if (!next[newGroupKey]) {
          next[newGroupKey] = {
            rows: [updatedTask],
            cursor: null,
            hasMore: true,
            isFetching: false,
            error: null,
          };
        }
        return next;
      });
    });

    // Update global caches
    updateTaskInCaches(queryClient, updatedTask);
    typesenseQuery.updateTaskInList(updatedTask);
    if (onOptimisticUpdate) onOptimisticUpdate(updatedTask);
    getTypesenseUpdater()?.(updatedTask);

    // Mark as our own update so realtime handler skips the bucket clear (prevents blink)
    if (recentlyMovedClearTimeoutRef.current) {
      clearTimeout(recentlyMovedClearTimeoutRef.current);
    }
    recentlyMovedTaskIdRef.current = String(taskId);
    recentlyMovedClearTimeoutRef.current = setTimeout(() => {
      recentlyMovedTaskIdRef.current = null;
      recentlyMovedClearTimeoutRef.current = null;
    }, 3000);

    // Persist to DB
    supabase
      .from('tasks')
      .update({ [field]: targetValue })
      .eq('id', taskId)
      .then(({ error }) => {
        if (error) {
          toast({
            title: 'Failed to update task',
            description: error.message,
            variant: 'destructive',
          });
          // Revert on error
          setBucketByKey(prev => {
            const next: Record<string, BucketState> = {};
            for (const [key, bucket] of Object.entries(prev)) {
              if (key === newGroupKey) {
                next[key] = {
                  ...bucket,
                  rows: bucket.rows.filter(t => String(t.id) !== String(taskId)),
                };
              } else if (key === sourceGroupKey) {
                next[key] = {
                  ...bucket,
                  rows: [task as TaskListRow, ...bucket.rows.filter(t => String(t.id) !== String(taskId))],
                };
              } else {
                next[key] = bucket;
              }
            }
            return next;
          });
        }
      });
  }, [bucketByKey, resolveDropColumn, groupField, groupLabelByKey, queryClient, supabase, typesenseQuery, onOptimisticUpdate]);

  // --- Calendar/Kanban pill button style ---
  const pillButton =
    'inline-flex items-center gap-1 px-4 py-1 rounded-full border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition shadow-none focus:ring-2 focus:ring-blue-200 focus:outline-none shrink-0';

  // No scroll sync needed - we'll use CSS to hide the inner scrollbar

  // --- Render ---
  const kanbanToolbarSegments = useMemo(() => {
    const groupTriggerClass = hideToolbar
      ? 'inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2.5 text-[15px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      : pillButton + ' gap-1 min-w-[140px]';
    const sortTriggerClass = pillButton + ' gap-1 min-w-[160px]';
    const colorTriggerClass = pillButton + ' gap-1 min-w-[120px]';
    const subtasksClass = pillButton + (showSubtasks ? ' bg-blue-600 text-white border-blue-600' : '');
    const groupByLabel =
      visibleGroupByOptions.find((o) => o.value === kanbanOptions.groupBy)?.label ?? 'Status';
    return [
      <GroupSortPanel
        key="kb-group"
        type="group"
        groupBy={kanbanOptions.groupBy}
        groupOrder={groupOrder}
        rowSortBy={rowSortBy}
        rowSortOrder={rowSortOrder}
        onGroupByChange={(v) => {
          const p = writeParam(new URLSearchParams(params.toString()), 'kanban_group_by', v);
          shallowReplaceSearchParams(pathname, p);
        }}
        onGroupOrderChange={(v) => {
          const p = new URLSearchParams(params.toString());
          p.set('groupOrder', v);
          shallowReplaceSearchParams(pathname, p);
        }}
        onSortByChange={() => {}}
        onSortOrderChange={() => {}}
        open={groupPanelOpen}
        onOpenChange={setGroupPanelOpen}
        trigger={
          <button type="button" className={groupTriggerClass} aria-label="Group by">
            {hideToolbar ? (
              <>
                <span className="max-w-[12rem] truncate">
                  {`Group by: ${groupByLabel}`}
                </span>
                <ChevronDown className="h-4 w-4 opacity-70" />
              </>
            ) : (
              <>
                Group by: {groupByLabel}
                <ChevronDown size={16} />
              </>
            )}
          </button>
        }
        isMobile={isMobile}
        groupByOptions={visibleGroupByOptions}
      />,
      <GroupSortPanel
        key="kb-sort"
        type="sort"
        groupBy={kanbanOptions.groupBy}
        groupOrder={groupOrder}
        rowSortBy={rowSortBy}
        rowSortOrder={rowSortOrder}
        onGroupByChange={() => {}}
        onGroupOrderChange={() => {}}
        onSortByChange={(v) => {
          const p = writeParam(new URLSearchParams(params.toString()), 'kanban_task_sort', v);
          shallowReplaceSearchParams(pathname, p);
        }}
        onSortOrderChange={(v) => {
          const p = writeParam(new URLSearchParams(params.toString()), 'kanban_task_sort_dir', v);
          shallowReplaceSearchParams(pathname, p);
        }}
        open={sortPanelOpen}
        onOpenChange={setSortPanelOpen}
        trigger={
          <button type="button" className={sortTriggerClass}>
            Sort by:{' '}
            {rowSortBy === 'delivery_date'
              ? 'Delivery date'
              : rowSortBy === 'publication_date'
                ? 'Publication date'
                : rowSortBy === 'title'
                  ? 'Title'
                  : rowSortBy === 'assigned_to_name'
                    ? 'Assignee'
                    : rowSortBy === 'project_status_name'
                      ? 'Status'
                      : 'Updated'}
            <ChevronDown size={16} />
          </button>
        }
        isMobile={isMobile}
        groupByOptions={visibleGroupByOptions}
      />,
      <DropdownMenu key="kb-color">
        <DropdownMenuTrigger asChild>
          <button type="button" className={colorTriggerClass}>
            Color:{' '}
            {colorMode === 'contentType'
              ? 'Content Type'
              : colorMode === 'assignedTo'
                ? 'Assigned To'
                : colorMode === 'project'
                  ? 'Project'
                  : 'Status'}
            <ChevronDown size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[200px]">
          <div className="px-2 py-1.5 text-[11px] text-gray-500 border-b border-gray-100">Color by</div>
          <DropdownMenuItem onSelect={() => setColorMode('contentType')} className={colorMode === 'contentType' ? 'font-semibold bg-muted' : ''}>
            Content Type
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setColorMode('assignedTo')} className={colorMode === 'assignedTo' ? 'font-semibold bg-muted' : ''}>
            Assigned To
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setColorMode('project')} className={colorMode === 'project' ? 'font-semibold bg-muted' : ''}>
            Project
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setColorMode('status')} className={colorMode === 'status' ? 'font-semibold bg-muted' : ''}>
            Status
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
      <DropdownMenu key="kb-legend">
        <DropdownMenuTrigger asChild>
          <button type="button" className={pillButton + ' gap-1 shrink-0 whitespace-nowrap'}>
            Legend
            <ChevronDown size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[240px] max-h-[min(60vh,420px)] overflow-y-auto">
          <div className="px-2 py-1.5 text-[11px] text-gray-500 border-b border-gray-100">
            Legend:{' '}
            {colorMode === 'contentType'
              ? 'Content Type'
              : colorMode === 'assignedTo'
                ? 'Assigned To'
                : colorMode === 'project'
                  ? 'Project'
                  : 'Status'}
          </div>
          {colorLegendEntries.length === 0 ? (
            <div className="px-2 py-3 text-gray-400 text-sm">No items yet</div>
          ) : (
            <div className="py-1">
              {colorLegendEntries.map(({ key, label, colorClass }) => (
                <div key={key} className="flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-gray-50">
                  <span className="truncate text-sm">{label}</span>
                  <span className={`inline-block w-3 h-3 shrink-0 rounded-sm ${colorClass}`} aria-hidden />
                </div>
              ))}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>,
      <React.Fragment key="kb-tail">
        <span className="mx-2 text-gray-200 select-none shrink-0">|</span>
        <button
          className={subtasksClass}
          onClick={() => {
            const newParams = writeParam(new URLSearchParams(params.toString()), 'kanban_show_subtasks', !showSubtasks);
            shallowReplaceSearchParams(pathname, newParams);
          }}
          type="button"
        >
          Subtasks: {showSubtasks ? 'On' : 'Off'}
        </button>
      </React.Fragment>,
    ];
  }, [
    pillButton,
    hideToolbar,
    kanbanOptions.groupBy,
    groupOrder,
    rowSortBy,
    rowSortOrder,
    groupPanelOpen,
    sortPanelOpen,
    isMobile,
    visibleGroupByOptions,
    colorMode,
    colorLegendEntries,
    showSubtasks,
    params,
    pathname,
  ]);

  // When hideToolbar + toolbarContainerRef, portal only Group by (sort/color/etc. go in … menu)
  const groupByOnlyBar = (
    <div className="flex shrink-0 flex-nowrap items-center gap-2">
      {kanbanToolbarSegments[0]}
    </div>
  );

  const toolbarPortaled =
    hideToolbar && toolbarContainerRef?.current
      ? createPortal(groupByOnlyBar, toolbarContainerRef.current)
      : null;

  const headerBar = (
    <div
      className="flex items-center gap-2 px-4 py-2 min-h-[56px] border-b border-transparent bg-transparent z-10 flex-shrink-0 overflow-x-auto overflow-y-hidden"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div className="flex items-center gap-2 flex-nowrap w-max flex-shrink-0">
        {kanbanToolbarSegments}
        {expandButton}
      </div>
    </div>
  );

  const kanbanOverflowMenuSubs = useMemo(
    () => (
    <>
      {!toolbarContainerRef ? (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2">
          <span className="min-w-0 truncate">Group by</span>
          <span className="ml-auto flex max-w-[11rem] shrink-0 items-center gap-1.5">
            <span className="truncate text-right text-xs text-muted-foreground">{kanbanOverflowGroupLabel}</span>
            <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-[min(60vh,360px)] overflow-y-auto">
          {visibleGroupByOptions.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              className={kanbanOptions.groupBy === opt.value ? 'font-semibold bg-muted' : ''}
              onSelect={(e) => {
                e.preventDefault();
                const p = writeParam(new URLSearchParams(params.toString()), 'kanban_group_by', opt.value);
                shallowReplaceSearchParams(pathname, p);
              }}
            >
              {opt.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Group order</div>
          <DropdownMenuItem
            className={groupOrder === 'asc' ? 'font-semibold bg-muted' : ''}
            onSelect={(e) => {
              e.preventDefault();
              const p = new URLSearchParams(params.toString());
              p.set('groupOrder', 'asc');
              shallowReplaceSearchParams(pathname, p);
            }}
          >
            A–Z
          </DropdownMenuItem>
          <DropdownMenuItem
            className={groupOrder === 'desc' ? 'font-semibold bg-muted' : ''}
            onSelect={(e) => {
              e.preventDefault();
              const p = new URLSearchParams(params.toString());
              p.set('groupOrder', 'desc');
              shallowReplaceSearchParams(pathname, p);
            }}
          >
            Z–A
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      ) : null}

      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2">
          <span className="min-w-0 truncate">Sort by</span>
          <span className="ml-auto flex max-w-[12rem] shrink-0 items-center gap-1.5">
            <span className="truncate text-right text-xs text-muted-foreground">{kanbanOverflowSortLabel}</span>
            <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {(
            [
              { value: 'delivery_date', label: 'Delivery date' },
              { value: 'publication_date', label: 'Publication date' },
              { value: 'title', label: 'Title' },
              { value: 'assigned_to_name', label: 'Assignee' },
              { value: 'project_status_name', label: 'Status' },
              { value: 'updated_at', label: 'Updated' },
            ] as const
          ).map(({ value, label }) => (
            <DropdownMenuItem
              key={value}
              className={rowSortBy === value ? 'font-semibold bg-muted' : ''}
              onSelect={(e) => {
                e.preventDefault();
                const p = writeParam(new URLSearchParams(params.toString()), 'kanban_task_sort', value);
                shallowReplaceSearchParams(pathname, p);
              }}
            >
              {label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Sort order</div>
          <DropdownMenuItem
            className={rowSortOrder === 'asc' ? 'font-semibold bg-muted' : ''}
            onSelect={(e) => {
              e.preventDefault();
              const p = writeParam(new URLSearchParams(params.toString()), 'kanban_task_sort_dir', 'asc');
              shallowReplaceSearchParams(pathname, p);
            }}
          >
            Ascending
          </DropdownMenuItem>
          <DropdownMenuItem
            className={rowSortOrder === 'desc' ? 'font-semibold bg-muted' : ''}
            onSelect={(e) => {
              e.preventDefault();
              const p = writeParam(new URLSearchParams(params.toString()), 'kanban_task_sort_dir', 'desc');
              shallowReplaceSearchParams(pathname, p);
            }}
          >
            Descending
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2">
          <span className="min-w-0 truncate">Color</span>
          <span className="ml-auto flex max-w-[10rem] shrink-0 items-center gap-1.5">
            <span className="truncate text-right text-xs text-muted-foreground">{kanbanOverflowColorLabel}</span>
            <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem
            className={colorMode === 'contentType' ? 'font-semibold bg-muted' : ''}
            onSelect={(e) => {
              e.preventDefault();
              setColorMode('contentType');
            }}
          >
            Content Type
          </DropdownMenuItem>
          <DropdownMenuItem
            className={colorMode === 'assignedTo' ? 'font-semibold bg-muted' : ''}
            onSelect={(e) => {
              e.preventDefault();
              setColorMode('assignedTo');
            }}
          >
            Assigned To
          </DropdownMenuItem>
          <DropdownMenuItem
            className={colorMode === 'project' ? 'font-semibold bg-muted' : ''}
            onSelect={(e) => {
              e.preventDefault();
              setColorMode('project');
            }}
          >
            Project
          </DropdownMenuItem>
          <DropdownMenuItem
            className={colorMode === 'status' ? 'font-semibold bg-muted' : ''}
            onSelect={(e) => {
              e.preventDefault();
              setColorMode('status');
            }}
          >
            Status
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2">
          Legend
          <ChevronRight className="ml-auto h-4 w-4 shrink-0 opacity-60" />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-[240px] max-h-[min(60vh,420px)] overflow-y-auto p-1">
          <div className="px-2 py-1.5 text-[11px] text-gray-500">
            {colorMode === 'contentType'
              ? 'Content Type'
              : colorMode === 'assignedTo'
                ? 'Assigned To'
                : colorMode === 'project'
                  ? 'Project'
                  : 'Status'}
          </div>
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

      <DropdownMenuItem
        className="justify-between gap-2"
        onSelect={(e) => {
          e.preventDefault();
          const newParams = writeParam(new URLSearchParams(params.toString()), 'kanban_show_subtasks', !showSubtasks);
          shallowReplaceSearchParams(pathname, newParams);
        }}
      >
        <span className="min-w-0 truncate">Subtasks</span>
        <span className="shrink-0 pl-2 text-xs text-muted-foreground">{showSubtasks ? 'On' : 'Off'}</span>
      </DropdownMenuItem>
    </>
    ),
    [
      toolbarContainerRef,
      visibleGroupByOptions,
      kanbanOptions.groupBy,
      groupOrder,
      rowSortBy,
      rowSortOrder,
      colorMode,
      colorLegendEntries,
      showSubtasks,
      params,
      pathname,
      kanbanOverflowGroupLabel,
      kanbanOverflowSortLabel,
      kanbanOverflowColorLabel,
    ],
  );

  const kanbanOverflowMenuSubsRef = useRef(kanbanOverflowMenuSubs)
  kanbanOverflowMenuSubsRef.current = kanbanOverflowMenuSubs
  const kanbanOverflowRenderStableRef = useRef<(() => ReactNode) | null>(null)
  if (kanbanOverflowRenderStableRef.current == null) {
    kanbanOverflowRenderStableRef.current = () => kanbanOverflowMenuSubsRef.current
  }

  useLayoutEffect(() => {
    if (!hideToolbar || !registerPaneOverflowMenu) return
    registerPaneOverflowMenu(kanbanOverflowRenderStableRef.current!)
    return () => registerPaneOverflowMenu(null)
  }, [hideToolbar, registerPaneOverflowMenu])

  const inlineOptionalEl = inlineOptionalToolbarRef?.current ?? null;
  const groupByPortaled = Boolean(hideToolbar && toolbarContainerRef?.current);
  const inlineOptionalPortaled =
    hideToolbar &&
    inlineOptionalEl &&
    createPortal(
      <div key={inlineOptionalToolbarSlotVersion} className="flex shrink-0 flex-nowrap items-center gap-2">
        {kanbanToolbarSegments.slice(groupByPortaled ? 1 : 0, kanbanSegVisible)}
      </div>,
      inlineOptionalEl,
    );

  return (
    <TooltipProvider>
    <div className="flex flex-col h-full">
      {!hideToolbar && headerBar}
      {toolbarPortaled}
      {inlineOptionalPortaled}
      {/* Kanban Columns - horizontal scroll area below header */}
      <div className="flex-1 min-h-0">
        <DndContext 
          sensors={sensors} 
          collisionDetection={pointerWithin} 
          onDragEnd={handleDragEnd}
          onDragStart={event => setDraggedTaskId(event.active?.id ? String(event.active.id) : null)}
          onDragCancel={() => setDraggedTaskId(null)}
        >
          {/* Viewport: fixed width, horizontal clipping */}
          <div
            className="overflow-x-auto h-full"
            ref={columnsContainerRef}
          >
            {/* Inner row: can grow to max-content width, no outer gap between columns */}
            <div className="flex gap-4 px-3 py-2 h-full w-max min-w-full">
          <SortableContext items={columnDefs.map(col => col.key)} strategy={horizontalListSortingStrategy}>
            {columnDefs.map(col => (
                  <div
                key={col.key}
                    data-kanban-col
                    data-col-key={col.key}
                    className="h-full"
                  >
                    <KanbanColumn
                col={col.key}
                label={col.label}
                tasksForColumn={groupedTasksForColumns[col.key] ?? []}
                selectedTaskId={selectedTaskId}
                onTaskSelect={onTaskSelect}
                      bucket={bucketByKey[col.key]}
                      ensureFirstPage={ensureFirstPage}
                      fetchMore={fetchMore}
                      isVisible={visibleCols.has(col.key)}
                      resetToken={queryShapeKey}
                      searchToken={groupSearchDebounced[col.key] ?? ''}
                      groupSearchValue={groupSearchInputByKey[col.key] ?? ''}
                      onGroupSearchChange={(v) => setGroupSearchInputByKey(prev => ({ ...prev, [col.key]: v }))}
                      colorMode={colorMode}
                      onAddTask={onAddTaskForColumn}
                      isMultiselectMode={isMultiselectMode}
                      bulkSelectedTaskKey={bulkSelectedTaskKey}
                      onKanbanBulkTaskToggle={onKanbanBulkTaskToggle}
                    />
                  </div>
            ))}
          </SortableContext>
            </div>
        </div>
        </DndContext>
      </div>
    </div>
    </TooltipProvider>
  );
}

// Group/Sort panel: single row with two labeled dropdowns (desktop: Popover, mobile: BottomSheet)
function GroupSortPanel({
  type,
  groupBy,
  groupOrder,
  rowSortBy,
  rowSortOrder,
  onGroupByChange,
  onGroupOrderChange,
  onSortByChange,
  onSortOrderChange,
  open,
  onOpenChange,
  trigger,
  isMobile,
  groupByOptions,
}: {
  type: 'group' | 'sort';
  groupBy: string;
  groupOrder: string;
  rowSortBy: string;
  rowSortOrder: string;
  onGroupByChange: (v: string) => void;
  onGroupOrderChange: (v: string) => void;
  onSortByChange: (v: string) => void;
  onSortOrderChange: (v: string) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trigger: React.ReactNode;
  isMobile: boolean;
  groupByOptions: { value: string; label: string }[];
}) {
  const rowClass = 'flex items-center gap-4 p-3';
  const labelClass = 'text-xs font-medium text-gray-500 shrink-0';
  const selectClass = 'h-9 min-w-[140px]';

  const content = (
    <div className={type === 'group' ? 'p-2' : 'p-2'}>
      {type === 'group' ? (
        <div className={rowClass}>
          <label className={labelClass}>Group by</label>
          <Select value={groupBy} onValueChange={onGroupByChange}>
            <SelectTrigger className={selectClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {groupByOptions.map((opt: { value: string; label: string }) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className={labelClass}>Group order</label>
          <Select value={groupOrder} onValueChange={onGroupOrderChange}>
            <SelectTrigger className={selectClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">A–Z</SelectItem>
              <SelectItem value="desc">Z–A</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className={rowClass}>
          <label className={labelClass}>Sort by</label>
          <Select value={rowSortBy} onValueChange={onSortByChange}>
            <SelectTrigger className={selectClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="delivery_date">Delivery date</SelectItem>
              <SelectItem value="publication_date">Publication date</SelectItem>
              <SelectItem value="title">Title</SelectItem>
              <SelectItem value="assigned_to_name">Assignee</SelectItem>
              <SelectItem value="project_status_name">Status</SelectItem>
              <SelectItem value="updated_at">Updated</SelectItem>
            </SelectContent>
          </Select>
          <label className={labelClass}>Sort order</label>
          <Select value={rowSortOrder} onValueChange={onSortOrderChange}>
            <SelectTrigger className={selectClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">Ascending</SelectItem>
              <SelectItem value="desc">Descending</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <>
        <div onClick={() => onOpenChange(true)} className="inline-flex">
          {trigger}
        </div>
        <ResizableBottomSheet isOpen={open} onClose={() => onOpenChange(false)} initialHeight={0.35} title={type === 'group' ? 'Group by' : 'Sort by'}>
          {content}
        </ResizableBottomSheet>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        {content}
      </PopoverContent>
    </Popover>
  );
}

// Stable key for task cards (entity_type + id, never index)
function getTaskCardKey(task: any): string {
  const kind = (task?.kind ?? task?.entity_type ?? 'task');
  const id = String(task?.id ?? task?.entity_id ?? '');
  return `${kind}:${id}`;
}

// Custom comparison: skip re-render when this column's tasks/bucket/search haven't meaningfully changed
function kanbanColumnPropsEqual(prev: any, next: any): boolean {
  if (prev.col !== next.col || prev.label !== next.label) return false;
  if (prev.resetToken !== next.resetToken || prev.searchToken !== next.searchToken) return false;
  if (prev.groupSearchValue !== next.groupSearchValue) return false;
  if (prev.selectedTaskId !== next.selectedTaskId) return false;
  if (prev.isVisible !== next.isVisible) return false;
  if (prev.colorMode !== next.colorMode) return false;
  const prevTasks = prev.tasksForColumn ?? [];
  const nextTasks = next.tasksForColumn ?? [];
  if (prevTasks.length !== nextTasks.length) return false;
  const prevIds = prevTasks.map((t: any) => getTaskCardKey(t)).join(',');
  const nextIds = nextTasks.map((t: any) => getTaskCardKey(t)).join(',');
  if (prevIds !== nextIds) return false;
  const prevBucket = prev.bucket;
  const nextBucket = next.bucket;
  if (!!prevBucket !== !!nextBucket) return false;
  if (prevBucket && nextBucket) {
    if (prevBucket.rows?.length !== nextBucket.rows?.length) return false;
    if (prevBucket.isFetching !== nextBucket.isFetching) return false;
  }
  if (prev.onAddTask !== next.onAddTask) return false;
  if (prev.isMultiselectMode !== next.isMultiselectMode) return false;
  if (prev.bulkSelectedTaskKey !== next.bulkSelectedTaskKey) return false;
  return true;
}

// Memoized column - only re-renders when its own data changes
const KanbanColumn = React.memo(function KanbanColumn({
  col,
  label,
  tasksForColumn,
  selectedTaskId,
  onTaskSelect,
  bucket,
  ensureFirstPage,
  fetchMore,
  isVisible,
  resetToken,
  searchToken,
  groupSearchValue,
  onGroupSearchChange,
  colorMode,
  onAddTask,
  isMultiselectMode = false,
  bulkSelectedTaskKey = '',
  onKanbanBulkTaskToggle,
}: {
  col: string;
  label: string;
  tasksForColumn: any[];
  selectedTaskId: string | number | null | undefined;
  onTaskSelect?: (task: any) => void;
  bucket?: {
    rows: TaskListRow[];
    cursor: { rok: string; id: number } | null;
    hasMore: boolean;
    isFetching: boolean;
    error: string | null;
  };
  ensureFirstPage: (groupKey: string) => void;
  fetchMore: (groupKey: string) => void;
  isVisible: boolean;
  resetToken: string;
  searchToken: string;
  groupSearchValue?: string;
  onGroupSearchChange?: (value: string) => void;
  colorMode: TaskCardColorMode;
  onAddTask?: (colKey: string) => void;
  isMultiselectMode?: boolean;
  bulkSelectedTaskKey?: string;
  onKanbanBulkTaskToggle?: (taskId: number) => void;
}) {
  const { setNodeRef: setColumnNodeRef, isOver } = useDroppable({ id: col });

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const didKickRef = useRef(false);

  // Reset kick flag when global query-shape or this group's search changes
  useEffect(() => {
    didKickRef.current = false;
    scrollContainerRef.current?.scrollTo?.({ top: 0 });
  }, [resetToken, searchToken]);

  // Bucket-level infinite scroll (E)
  useEffect(() => {
    if (!isVisible) {
      // Reset kick flag when column goes out of view
      didKickRef.current = false;
      return;
    }

    const rootEl = scrollContainerRef.current;
    const sentinelEl = sentinelRef.current;
    if (!rootEl || !sentinelEl) return;

    // Kick the first page once when the column becomes visible
    if (!didKickRef.current) {
      const rowCount = bucket?.rows?.length ?? tasksForColumn.length;
      const hasMore = bucket?.hasMore ?? true;
      const isFetching = bucket?.isFetching ?? false;
      if (rowCount === 0 && hasMore && !isFetching) {
        didKickRef.current = true;
        ensureFirstPage(col);
      }
    }

    const nearBottom = () => {
      const el = rootEl;
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      return remaining < 250;
    };

    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0];
        if (!entry || !entry.isIntersecting) return;

        if (!nearBottom()) return;

        const count = bucket?.rows?.length ?? tasksForColumn.length;
        const more = bucket?.hasMore ?? true;
        const fetching = bucket?.isFetching ?? false;

        if (count === 0 && more && !fetching) {
          ensureFirstPage(col);
        } else if (count > 0 && more && !fetching) {
          fetchMore(col);
        }
      },
      {
        threshold: 0.1,
        rootMargin: '50px',
        root: rootEl,
      },
    );

    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [
    isVisible,
    col,
    bucket?.rows?.length,
    bucket?.hasMore,
    bucket?.isFetching,
    ensureFirstPage,
    fetchMore,
    tasksForColumn.length,
  ]);

  const bulkIdSet = useMemo(
    () => new Set(bulkSelectedTaskKey.split(',').filter((s) => s.length > 0)),
    [bulkSelectedTaskKey],
  );

  return (
    <div
      key={col}
      id={col}
      className="flex-shrink-0 min-w-[280px] w-[280px] flex flex-col bg-gray-50/70 h-full rounded-xl border border-gray-200"
    >
      <div
        className="border-b bg-white/80 flex-shrink-0 rounded-t-xl flex flex-col gap-1.5 py-2 px-2"
      >
        <div className="flex items-center justify-between gap-1 px-1">
          <span className="font-semibold text-gray-700 text-sm truncate min-w-0 flex-1">{label}</span>
          {onAddTask && (
            <button
              type="button"
              onClick={() => onAddTask(col)}
              className="shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded px-1.5 py-0.5 transition-colors"
            >
              <Plus size={12} />
              Add task
            </button>
          )}
        </div>
        {onGroupSearchChange && (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={groupSearchValue ?? ''}
              onChange={(e) => onGroupSearchChange(e.target.value)}
              placeholder="Search in group..."
              className="h-8 w-full rounded-md border border-gray-200 pl-7 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
            />
          </div>
        )}
      </div>
      {/* Scrollable content area - full column dropzone with min-height */}
      <div
        ref={(el) => {
          setColumnNodeRef(el);
          scrollContainerRef.current = el;
        }}
        className={cn(
          'relative flex-1 min-h-[120px] overflow-y-auto overflow-x-hidden p-2',
          isOver && 'ring-2 ring-blue-300 ring-inset bg-blue-50/30',
        )}
      >
        {isOver && (
          <div className="absolute inset-0 rounded-md pointer-events-none z-0" aria-hidden />
        )}
        <div className="relative z-10">
        <SortableContext
          items={tasksForColumn.filter((t: any) => t?.kind !== 'suggestion').map((task: any) => String(task.id))}
          strategy={horizontalListSortingStrategy}
        >
          {tasksForColumn.map((task: any) => {
            const isSuggestion = task?.kind === 'suggestion' || task?.entity_type === 'suggestion';
            const key = getTaskColorKey(task, colorMode);
            const inlineStyle = getTaskInlineStyle(task, colorMode);
            const barColorClass = inlineStyle ? '' : getStablePaletteBarClass(key);
            const barInlineStyle = inlineStyle ? { backgroundColor: inlineStyle.background } : undefined;
            const idStr = String(task.id ?? task.entity_id ?? '');
            const isBulkCard = Boolean(isMultiselectMode && !isSuggestion && idStr && bulkIdSet.has(idStr));
            const card = (
              <KanbanTaskCard
                task={task}
                isSelected={!!selectedTaskId && String(task.id) === String(selectedTaskId)}
                isBulkSelected={isBulkCard}
                isMultiselectMode={isMultiselectMode}
                onClick={() => {
                  if (isMultiselectMode && !isSuggestion && onKanbanBulkTaskToggle) {
                    const tid = Number(task.id ?? task.entity_id);
                    if (Number.isFinite(tid)) onKanbanBulkTaskToggle(tid);
                    return;
                  }
                  onTaskSelect?.(task);
                }}
                colorMode={colorMode}
                barColorClass={barColorClass}
                barInlineStyle={barInlineStyle}
              />
            );
            const cardKey = getTaskCardKey(task);
            return isSuggestion ? (
              <div key={cardKey}>{card}</div>
            ) : (
              <SortableKanbanCard key={cardKey} id={String(task.id)}>
                {card}
              </SortableKanbanCard>
            );
          })}
        </SortableContext>
        {/* Bucket sentinel */}
        <div ref={sentinelRef} style={{ height: 8 }} />
        </div>
        {/* Ensures full-column drop area even when empty */}
        <div className="h-8" />
      </div>
    </div>
  );
}, kanbanColumnPropsEqual); 