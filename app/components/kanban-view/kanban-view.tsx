import React, { useState, useMemo, useCallback, useRef, useEffect, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, useDroppable, rectIntersection, pointerWithin } from '@dnd-kit/core';
import { SortableContext, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { arrayMove } from '@dnd-kit/sortable';
import { InfiniteList } from '../ui/infinite-list';
import { cn } from '@/lib/utils';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
// import { useSession } from '@supabase/auth-helpers-react';
import { toast } from '../ui/use-toast';
import { updateTaskInCaches } from '../tasks/task-cache-utils';
import { useTaskRealtime } from '../../../hooks/use-task-realtime';
import { useFilterOptions } from '../../hooks/use-filter-options';
import { useSearchParams, useRouter } from 'next/navigation';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { flushSync } from 'react-dom';
import { useTypesenseInfiniteQuery } from '../../hooks/use-typesense-infinite-query';
import { getTypesenseUpdater } from '../../store/typesense-tasks';

// Group-by options for Kanban
const GROUP_BY_OPTIONS = [
  { value: 'project_status_name', label: 'Status' },
  { value: 'assigned_to_name', label: 'Assignee' },
  { value: 'project_name', label: 'Project' },
  { value: 'delivery_date', label: 'Delivery Date' },
  { value: 'publication_date', label: 'Publication Date' },
  { value: 'content_type_title', label: 'Content Type' },
  { value: 'production_type_title', label: 'Production Type' },
  { value: 'channel_names', label: 'Channel' },
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

// Compact Kanban card
function KanbanTaskCard({ task, isSelected, onClick }: { task: any, isSelected: boolean, onClick: () => void }) {
  return (
    <div
      className={cn(
        'rounded-md bg-white shadow-sm border border-gray-200 p-3 mb-2 cursor-pointer hover:bg-blue-50 transition',
        isSelected && 'ring-2 ring-blue-500 border-blue-500',
      )}
      onClick={onClick}
      tabIndex={0}
      aria-selected={isSelected}
      role="button"
    >
      <div className="font-medium text-sm truncate mb-1">{task.title}</div>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {task.project_name && <span className="truncate max-w-[80px]">{task.project_name}</span>}
        {task.project_status_name && (
          <span
            className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ backgroundColor: task.project_status_color || '#e5e7eb', color: task.project_status_color ? '#fff' : '#374151' }}
          >
            {task.project_status_name}
          </span>
        )}
        {task.assigned_to_name && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-xs font-bold uppercase text-gray-700 border border-gray-300">
              {task.assigned_to_name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
            </span>
            <span className="truncate max-w-[60px]">{task.assigned_to_name}</span>
          </span>
        )}
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
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : undefined,
      }}
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
}

export function KanbanView({ searchValue, filters, selectedTaskId, onTaskSelect, onOptimisticUpdate, expandButton, enabled = true }: KanbanViewProps) {
  const [groupBy, setGroupBy] = useState<string>('project_status_name');
  const [limit, setLimit] = useState<number>(25);
  const queryClient = useQueryClient();
  const supabase = createClientComponentClient();
  // Fallback: get session inline if useSession is not available
  const [accessToken, setAccessToken] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (data?.session?.access_token) setAccessToken(data.session.access_token);
    })();
  }, [supabase]);
  const columnsContainerRef = useRef<HTMLDivElement>(null);
  const params = useSearchParams();
  const router = useRouter();

  // Track the currently dragged task id
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  // For optimistic updates, track local groupedTasks override
  const [optimisticGroupedTasks, setOptimisticGroupedTasks] = useState<GroupedTasks | null>(null);
  const [pendingOptimisticTaskId, setPendingOptimisticTaskId] = useState<string | null>(null);
  
  // Set up realtime subscriptions for tasks
  const { isSubscribed } = useTaskRealtime({
    enabled: true,
    showNotifications: false,
    onTaskUpdate: (task, event) => {
      queryClient.invalidateQueries({ queryKey: ['kanban-bootstrap'] });
    }
  });

  // Add Typesense updater - only for optimistic updates, don't fetch data
  const typesenseQuery = useTypesenseInfiniteQuery({ q: '', pageSize: 25, enabled: false });

  // --- Fetch grouped tasks and metadata from Edge Function ---
  const {
    data: kanbanData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['kanban-bootstrap', groupBy, limit, accessToken, searchValue, filters],
    queryFn: async () => {
      if (!accessToken) throw new Error('No user session');
      const groupField = GROUP_BY_TO_FIELD[groupBy] || groupBy;
      const params = new URLSearchParams();
      params.set('group_by', groupField);
      params.set('limit', String(limit));
      if (searchValue) params.set('search', searchValue);
      if (filters) {
        params.set('filters', encodeURIComponent(JSON.stringify(filters)));
      }
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/bootstrap-kanban?${params.toString()}`;
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch Kanban data');
      return res.json();
    },
    enabled: enabled && !!accessToken, // Only run when view is enabled and we have access token
    staleTime: 60_000,
  });

  type Task = Record<string, any>;
  type GroupedTasks = Record<string, Task[]>;
  type Meta = {
    statuses?: { value: string; label: string; project_id?: string; color?: string; id?: string; name?: string }[];
    users?: any[];
    projects?: any[];
    content_types?: any[];
    production_types?: any[];
    languages?: any[];
    [key: string]: any;
  };
  const groupedTasks: GroupedTasks = kanbanData && kanbanData.tasks ? kanbanData.tasks : {};
  const meta: Meta = {
    users: kanbanData?.users,
    projects: kanbanData?.projects,
    statuses: kanbanData?.project_statuses,
    content_types: kanbanData?.content_types,
    production_types: kanbanData?.production_types,
    languages: kanbanData?.languages,
  };

  // Find the dragged task and its project id (must be after groupedTasks is defined)
  let draggedTask: any = null;
  let draggedTaskProjectId: string | null = null;
  if (draggedTaskId) {
    const allTasks = Object.values(optimisticGroupedTasks || groupedTasks).flat();
    draggedTask = allTasks.find((t: any) => String(t.id) === String(draggedTaskId));
    draggedTaskProjectId = draggedTask?.project_id_int ? String(draggedTask.project_id_int) : null;
  }

  // --- Kanban deduplication logic for project_status_name ---
  let columnDefs: { key: string; label: string; statusIds?: string[] }[] = [];
  let statusNameProjectToId: Record<string, Record<string, string>> = {};
  const tasksSource = optimisticGroupedTasks !== null ? optimisticGroupedTasks : groupedTasks;
  if (groupBy === 'project_status_name' && meta.statuses) {
    // Build map: statusName -> [statusIds]
    const statusNameToIds: Record<string, string[]> = {};
    statusNameProjectToId = {};
    meta.statuses.forEach(s => {
      if (!s.name || !s.id) return;
      if (!statusNameToIds[s.name]) statusNameToIds[s.name] = [];
      statusNameToIds[s.name].push(String(s.id));
      if (!statusNameProjectToId[s.name]) statusNameProjectToId[s.name] = {};
      if (s.project_id) statusNameProjectToId[s.name][String(s.project_id)] = String(s.id);
    });
    columnDefs = Object.keys(statusNameToIds).map(name => ({
      key: name + '__' + statusNameToIds[name].join('_'), // unique per status name + all IDs
      label: name,
      statusIds: statusNameToIds[name],
      statusName: name,
    }));
  } else if (groupBy === 'delivery_date' || groupBy === 'publication_date') {
    // Group by month (YYYY-MM)
    const groupMap: Record<string, { label: string; tasks: any[] }> = {};
    for (const task of Object.values(tasksSource).flat()) {
      const dateValue = task[groupBy];
      if (!dateValue) {
        if (!groupMap['__unassigned__']) groupMap['__unassigned__'] = { label: getUnassignedLabel(groupBy), tasks: [] };
        groupMap['__unassigned__'].tasks.push(task);
        continue;
      }
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) {
        if (!groupMap['__unassigned__']) groupMap['__unassigned__'] = { label: getUnassignedLabel(groupBy), tasks: [] };
        groupMap['__unassigned__'].tasks.push(task);
        continue;
      }
      const groupKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!groupMap[groupKey]) groupMap[groupKey] = { label, tasks: [] };
      groupMap[groupKey].tasks.push(task);
    }
    // Sort by groupKey descending (most recent month first)
    columnDefs = Object.entries(groupMap)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, { label }]) => ({ key, label }));
  } else {
    // Default: one column per group key
    columnDefs = Object.keys(tasksSource).map(key => ({
      key,
      label: getGroupLabel({ groupBy, groupKey: key, meta }),
    }));
  }

  // --- Build groupedTasks for KanbanColumn ---
  let groupedTasksForColumns: Record<string, any[]> = {};
  if (groupBy === 'project_status_name' && meta.statuses) {
    // Always create an array for every deduped status column
    groupedTasksForColumns = {};
    for (const col of columnDefs) {
      groupedTasksForColumns[col.key] = [];
    }
    // Assign tasks to the correct columns
    for (const task of Object.values(tasksSource).flat()) {
      const statusId = String(task.project_status_id);
      const col = columnDefs.find(col => col.statusIds?.includes(statusId));
      if (col) {
        groupedTasksForColumns[col.key].push(task);
      }
    }
  } else if (groupBy === 'delivery_date' || groupBy === 'publication_date') {
    // Use the same grouping as above
    for (const col of columnDefs) {
      groupedTasksForColumns[col.key] = [];
    }
    for (const task of Object.values(tasksSource).flat()) {
      const dateValue = task[groupBy];
      if (!dateValue) {
        groupedTasksForColumns['__unassigned__'].push(task);
        continue;
      }
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) {
        groupedTasksForColumns['__unassigned__'].push(task);
        continue;
      }
      const groupKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!groupedTasksForColumns[groupKey]) groupedTasksForColumns[groupKey] = [];
      groupedTasksForColumns[groupKey].push(task);
    }
  } else {
    groupedTasksForColumns = tasksSource;
  }

  // --- Render columns and cards as before, using deduplicated columns if needed ---
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // List of valid column ids for drop validation
  const validColumnIds = columnDefs.map(col => col.key ?? '__unassigned__');

  // Drag end handler
  const handleDragEnd = useCallback((event: any) => {
    const { active, over } = event;
    setDraggedTaskId(null); // Always reset after drop
    if (!active || !over) return;
    const taskId = active.id;
    const newGroupKey = over.id;
    if (!validColumnIds.includes(newGroupKey)) return;
    // Find the task being moved
    const allTasks = Object.values(tasksSource).flat();
    const task = allTasks.find((t: any) => t && typeof t === 'object' && String(t.id) === String(taskId));
    if (!task) return;
    let currentValue = task[groupBy];
    if (currentValue === null || currentValue === undefined || currentValue === '') currentValue = '__unassigned__';
    // For status group, newGroupKey is composite: statusName__id1_id2_id3
    let newStatusName = newGroupKey;
    if (groupBy === 'project_status_name') {
      newStatusName = newGroupKey.split('__')[0];
    }
    if (String(currentValue) === String(newStatusName)) return;
    const field = GROUP_BY_TO_FIELD[groupBy] || groupBy;
    // For project_status_name, deduplicated: find correct status id for this project and status name
    let targetValue = newStatusName;
    if (groupBy === 'project_status_name' && meta.statuses && task.project_id_int) {
      const projectId = String(task.project_id_int);
      // newStatusName is the status name (column label)
      const status = meta.statuses.find((s: any) => s.name === newStatusName && String(s.project_id) === projectId);
      if (!status) {
        toast({ title: 'No matching status for this project', description: `No status "${newStatusName}" for project ${projectId}`, variant: 'destructive' });
        return;
      }
      targetValue = String(status.id);
    }
    // Patch: For date groupings, convert YYYY-MM to YYYY-MM-01 for DB update
    if (
      (groupBy === 'delivery_date' || groupBy === 'publication_date') &&
      /^\d{4}-\d{2}$/.test(newGroupKey)
    ) {
      targetValue = `${newGroupKey}-01`;
    }
    // Optimistically update the UI synchronously for DnD
    flushSync(() => {
      setOptimisticGroupedTasks(prev => {
        // Remove from old group, add to new group
        const prevTasks = prev || groupedTasks;
        // Patch denormalized fields for all groupings
        let patch: Record<string, any> = { [field]: targetValue };
        if (groupBy === 'project_status_name' && meta.statuses) {
          const status = meta.statuses.find((s: any) => String(s.id) === String(targetValue));
          if (status) {
            patch.project_status_name = status.name;
            patch.project_status_color = status.color;
          }
        } else if (groupBy === 'assigned_to_name' && meta.users) {
          const user = meta.users.find((u: any) => String(u.id) === String(targetValue));
          if (user) patch.assigned_to_name = user.full_name;
        } else if (groupBy === 'project_name' && meta.projects) {
          const project = meta.projects.find((p: any) => String(p.id) === String(targetValue));
          if (project) {
            patch.project_name = project.name;
            patch.project_color = project.color;
          }
        } else if (groupBy === 'content_type_title' && meta.content_types) {
          const ct = meta.content_types.find((c: any) => String(c.id) === String(targetValue));
          if (ct) patch.content_type_title = ct.title;
        } else if (groupBy === 'production_type_title' && meta.production_types) {
          const pt = meta.production_types.find((c: any) => String(c.id) === String(targetValue));
          if (pt) patch.production_type_title = pt.title;
        } else if (groupBy === 'language_code' && meta.languages) {
          const lang = meta.languages.find((l: any) => String(l.id) === String(targetValue));
          if (lang) patch.language_code = lang.code;
        }
        const updatedTask = { ...task, ...patch };
        // Remove from all groups
        const newGroups: GroupedTasks = {};
        for (const [k, v] of Object.entries(prevTasks)) {
          newGroups[k] = v.filter((t: any) => String(t.id) !== String(taskId));
        }
        // Find the new group key for the target status name
        let targetGroupKey = newGroupKey;
        if (groupBy === 'project_status_name') {
          // Find the column key for the target status name
          const statusIds = Object.values(statusNameProjectToId[newStatusName] || {}).map(String);
          targetGroupKey = newStatusName + '__' + statusIds.join('_');
        }
        if (!newGroups[targetGroupKey]) newGroups[targetGroupKey] = [];
        newGroups[targetGroupKey] = [updatedTask, ...newGroups[targetGroupKey]];
        return newGroups;
      });
    });
    updateTaskInCaches(queryClient, { ...task, [field]: targetValue });
    // Optimistically update the task details cache so TaskDetails pane updates instantly
    queryClient.setQueryData(['task', String(taskId)], (old: any) => {
      if (!old) return old;
      // Patch denormalized fields for all groupings
      let patch: Record<string, any> = { [field]: targetValue };
      if (groupBy === 'project_status_name' && meta.statuses) {
        const status = meta.statuses.find((s: any) => String(s.id) === String(targetValue));
        if (status) {
          patch.project_status_name = status.name;
          patch.project_status_color = status.color;
        }
      } else if (groupBy === 'assigned_to_name' && meta.users) {
        const user = meta.users.find((u: any) => String(u.id) === String(targetValue));
        if (user) patch.assigned_to_name = user.full_name;
      } else if (groupBy === 'project_name' && meta.projects) {
        const project = meta.projects.find((p: any) => String(p.id) === String(targetValue));
        if (project) {
          patch.project_name = project.name;
          patch.project_color = project.color;
        }
      } else if (groupBy === 'content_type_title' && meta.content_types) {
        const ct = meta.content_types.find((c: any) => String(c.id) === String(targetValue));
        if (ct) patch.content_type_title = ct.title;
      } else if (groupBy === 'production_type_title' && meta.production_types) {
        const pt = meta.production_types.find((c: any) => String(c.id) === String(targetValue));
        if (pt) patch.production_type_title = pt.title;
      } else if (groupBy === 'language_code' && meta.languages) {
        const lang = meta.languages.find((l: any) => String(l.id) === String(targetValue));
        if (lang) patch.language_code = lang.code;
      }
      return { ...old, ...patch };
    });
    setPendingOptimisticTaskId(String(taskId));
    // Persist only the foreign key field to the DB
    supabase.from('tasks').update({ [field]: targetValue }).eq('id', taskId).then(({ error }) => {
      if (error) {
        toast({ title: 'Failed to update task', description: error.message, variant: 'destructive' });
        // If error, clear optimistic state immediately
        setOptimisticGroupedTasks(null);
        setPendingOptimisticTaskId(null);
      } else {
        // Wait for server data to match before clearing optimistic state
        queryClient.invalidateQueries({ queryKey: ['kanban-bootstrap', groupBy, limit] });
        queryClient.invalidateQueries({ queryKey: ['task', String(taskId)] });
      }
    });
    typesenseQuery.updateTaskInList({ ...task, [field]: targetValue });
    if (onOptimisticUpdate) onOptimisticUpdate({ ...task, [field]: targetValue });
    getTypesenseUpdater()?.({ ...task, [field]: targetValue });
  }, [tasksSource, groupedTasks, groupBy, limit, queryClient, supabase, meta, statusNameProjectToId, typesenseQuery, onOptimisticUpdate]);

  // Clear optimistic state only when the server data reflects the move
  useEffect(() => {
    if (pendingOptimisticTaskId && kanbanData && kanbanData.tasks && optimisticGroupedTasks) {
      // Find the group key for the moved task in the optimistic state
      let optimisticGroupKey: string | null = null;
      for (const [groupKey, tasks] of Object.entries(optimisticGroupedTasks)) {
        if (tasks.some((t: any) => String(t.id) === pendingOptimisticTaskId)) {
          optimisticGroupKey = groupKey;
          break;
        }
      }
      if (optimisticGroupKey) {
        // Check if the server data now has the task in the same group
        const serverTasksInGroup = kanbanData.tasks[optimisticGroupKey] || [];
        if (serverTasksInGroup.some((t: any) => String(t.id) === pendingOptimisticTaskId)) {
          setOptimisticGroupedTasks(null);
          setPendingOptimisticTaskId(null);
        }
      }
    }
  }, [kanbanData, pendingOptimisticTaskId, optimisticGroupedTasks]);

  // --- Calendar/Kanban pill button style ---
  const pillButton =
    'inline-flex items-center gap-1 px-3 py-1 rounded-full border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition shadow-none focus:ring-2 focus:ring-blue-200 focus:outline-none';

  // No scroll sync needed - we'll use CSS to hide the inner scrollbar

  // --- Render ---
  // Let the browser calculate the natural width

  return (
            <div style={{ position: 'relative', height: '100%' }}>
      {/* Header Bar with Group By and Calendar/Kanban Toggle */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-white sticky top-0 z-10">
        <span className="text-sm font-medium text-gray-500">Group by:</span>
        <div className="relative">
          <select
            className="rounded-full border px-3 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            value={groupBy}
            onChange={e => setGroupBy(e.target.value)}
          >
            {GROUP_BY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        {/* Calendar/Kanban pill button toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={pillButton + ' min-w-[110px]'} type="button">
              {params.get('middleView') === 'calendar' ? 'Calendar' : 'Kanban'}
            </button>
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
        {/* Expand/restore button slot (right-aligned) */}
        {expandButton}
      </div>
      {/* Kanban Columns - horizontal scroll area below header */}
      <div>
        <DndContext 
          sensors={sensors} 
          collisionDetection={pointerWithin} 
          onDragEnd={handleDragEnd}
          onDragStart={event => setDraggedTaskId(event.active?.id ? String(event.active.id) : null)}
          onDragCancel={() => setDraggedTaskId(null)}
        >
        <div
          className="overflow-y-hidden overflow-x-auto kanban-horizontal-scroll flex gap-4 px-4 py-4"
          style={{
            minHeight: 0,
            height: 'calc(100% - 16px)',
            width: 'max-content',
            minWidth: '100%',
          }}
          ref={columnsContainerRef}
        >
          <SortableContext items={columnDefs.map(col => col.key)} strategy={horizontalListSortingStrategy}>
            {columnDefs.map(col => (
              <KanbanColumn
                key={col.key}
                col={col.key}
                label={col.label}
                groupedTasks={groupedTasksForColumns}
                selectedTaskId={selectedTaskId}
                onTaskSelect={onTaskSelect}
                meta={meta}
                groupBy={groupBy}
                statusIds={col.statusIds}
                draggedTaskProjectId={draggedTaskProjectId}
              />
            ))}
          </SortableContext>
        </div>
        </DndContext>
      </div>
    </div>
  );
}

// Add KanbanColumn child component for droppable columns
function KanbanColumn({ col, label, groupedTasks, selectedTaskId, onTaskSelect, meta, groupBy, statusIds, draggedTaskProjectId }: {
  col: string,
  label: string,
  groupedTasks: Record<string, any[]>,
  selectedTaskId: string | number | null | undefined,
  onTaskSelect?: (task: any) => void,
  meta: any,
  groupBy: string,
  statusIds?: string[],
  draggedTaskProjectId?: string | null,
}) {
  const { setNodeRef: setColumnNodeRef, isOver } = useDroppable({ id: col });
  // For deduped status columns, aggregate all tasks with any of the status ids
  let tasksForColumn: any[] = [];
  if (groupBy === 'project_status_name' && statusIds) {
    // Flatten all groupedTasks and filter by status ID (statusIds contains IDs)
    tasksForColumn = Object.values(groupedTasks).flat().filter((t: any) => statusIds.includes(String(t.project_status_id)));
  } else {
    tasksForColumn = groupedTasks[col] || [];
  }
  let groupColor: string | undefined = undefined;
  if (groupBy === 'project_status_name' && meta.statuses) {
    // Use the color of the first status with this name
    const status = meta.statuses.find((s: any) => s && s.name === label);
    groupColor = status?.color;
  }
  // Grey out columns that are not valid for the dragged task's project
  let isValidForDraggedTask = true;
  if (groupBy === 'project_status_name' && draggedTaskProjectId && meta.statuses) {
    isValidForDraggedTask = meta.statuses.some(
      (s: any) => s.name === label && String(s.project_id) === draggedTaskProjectId
    );
  }
  return (
    <div
      key={col}
      id={col}
      ref={setColumnNodeRef}
      className={
        cn(
          'flex-shrink-0 min-w-[280px] w-[280px] flex flex-col bg-gray-50 rounded-lg shadow-sm border border-gray-200',
          isOver && 'ring-2 ring-blue-400 border-blue-400 bg-blue-50',
          !isValidForDraggedTask && 'opacity-50 pointer-events-none'
        )
      }
    >
      <div
        className="px-4 py-2 border-b bg-white rounded-t-lg font-semibold text-gray-700 text-sm sticky top-0 z-10"
        style={{}}
      >
        {label}
      </div>
      {/* PATCH: Prevent horizontal scroll in Kanban columns */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
        <SortableContext items={tasksForColumn.map((task: any) => String(task.id))} strategy={horizontalListSortingStrategy}>
          {tasksForColumn.map((task: any) => (
            <SortableKanbanCard key={task.id} id={String(task.id)}>
              <KanbanTaskCard
                task={task}
                isSelected={!!selectedTaskId && String(task.id) === String(selectedTaskId)}
                onClick={() => onTaskSelect && onTaskSelect(task)}
              />
            </SortableKanbanCard>
          ))}
        </SortableContext>
      </div>
    </div>
  );
} 