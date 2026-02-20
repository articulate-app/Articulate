import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { TaskListRow } from '@/lib/types/task-list-view';
import { computeGroupKeyForTask, lookupGroupKeyForTaskId } from '@/hooks/use-task-group-tasks-query';

type GroupOrder = 'asc' | 'desc';

export type TaskGroupMeta = {
  group_key: string;
  label: string;
  task_count: number;
};

export interface UseTaskGroupMetaAllQueryOptions {
  q: string;
  project?: string;
  filters?: { [key: string]: string | string[] };
  groupBy: string | null;
  groupOrder?: GroupOrder;
  limit?: number; // large page size for "all" semantics; default 5000
  enabled?: boolean;
  editFields?: any;
}

export interface UseTaskGroupMetaAllQueryResult {
  groups: TaskGroupMeta[];
  isFetching: boolean;
  error: string | null;
}

// Track last-used groupBy/groupOrder for mounted meta hooks so we can keep
// optimistic insert/remove ordering consistent with the current UI.
let currentGroupBy: string | null = null;
let currentGroupOrder: GroupOrder | undefined;

type GroupMetaSubscriber = (updater: (prev: TaskGroupMeta[]) => TaskGroupMeta[]) => void;
const groupMetaSubscribers = new Set<GroupMetaSubscriber>();

function toTaskListRowLoose(task: any): TaskListRow | null {
  if (!task) return null;
  const idNum = Number(task.id);
  if (!Number.isFinite(idNum)) return null;

  const assignedToId =
    task.assigned_to_id != null
      ? Number(task.assigned_to_id)
      : task.assigned_user?.id != null
        ? Number(task.assigned_user.id)
        : null;

  const projectId =
    task.project_id_int != null
      ? Number(task.project_id_int)
      : task.projects?.id != null
        ? Number(task.projects.id)
        : 0;

  const statusId =
    task.project_status_id != null
      ? Number(task.project_status_id)
      : task.project_statuses?.id != null
        ? Number(task.project_statuses.id)
        : null;

  const contentTypeId =
    task.content_type_id != null ? Number(task.content_type_id) : null;
  const productionTypeId =
    task.production_type_id != null ? Number(task.production_type_id) : null;
  const languageId = task.language_id != null ? Number(task.language_id) : null;

  return {
    id: idNum,
    title: task.title ?? '',

    assigned_to_id: Number.isFinite(assignedToId as any) ? assignedToId : null,
    assigned_to_name: task.assigned_to_name ?? task.assigned_user?.full_name ?? null,
    assigned_to_photo: task.assigned_to_photo ?? task.assigned_user?.photo ?? null,

    project_id_int: Number.isFinite(projectId) ? projectId : 0,
    project_name: task.project_name ?? task.projects?.name ?? null,
    project_color: task.project_color ?? task.projects?.color ?? null,
    project_logo: task.project_logo ?? task.projects?.logo ?? null,

    project_status_id: Number.isFinite(statusId as any) ? statusId : null,
    project_status_name: task.project_status_name ?? task.project_statuses?.name ?? null,
    project_status_color: task.project_status_color ?? task.project_statuses?.color ?? null,

    delivery_date: task.delivery_date ?? null,
    publication_date: task.publication_date ?? null,
    is_overdue: task.is_overdue ?? null,
    is_publication_overdue: task.is_publication_overdue ?? null,
    updated_at: task.updated_at ?? new Date().toISOString(),

    content_type_id: Number.isFinite(contentTypeId as any) ? contentTypeId : null,
    content_type_title: task.content_type_title ?? null,
    production_type_id: Number.isFinite(productionTypeId as any) ? productionTypeId : null,
    production_type_title: task.production_type_title ?? null,
    language_id: Number.isFinite(languageId as any) ? languageId : null,
    language_code: task.language_code ?? null,
  };
}

/** Canonical label for a group when we have a task row. Exported for UnifiedGroupedTaskList merge. */
export function computeGroupLabelForTask(row: TaskListRow, groupBy: string | null): string {
  if (!groupBy) return '';
  switch (groupBy) {
    case 'assigned_to':
      return row.assigned_to_name ?? 'Unassigned';
    case 'status':
      return row.project_status_name ?? 'Unassigned';
    case 'project':
      return row.project_name ?? 'No Project';
    case 'content_type':
      return row.content_type_title ?? 'Unassigned';
    case 'production_type':
      return row.production_type_title ?? 'Unassigned';
    case 'language':
      return row.language_code ?? 'Unassigned';
    case 'delivery_date': {
      if (!row.delivery_date) return 'No Date';
      const d = new Date(row.delivery_date);
      if (Number.isNaN(d.getTime())) return 'No Date';
      return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(d);
    }
    case 'publication_date': {
      if (!row.publication_date) return 'No Date';
      const d = new Date(row.publication_date);
      if (Number.isNaN(d.getTime())) return 'No Date';
      return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(d);
    }
    default:
      return '';
  }
}

function effectiveGroupOrderFor(groupBy: string | null, groupOrder?: GroupOrder): GroupOrder {
  if (groupOrder) return groupOrder;
  if (groupBy === 'delivery_date' || groupBy === 'publication_date') return 'desc';
  return 'asc';
}

function isSpecialGroupKey(key: string): boolean {
  return (
    key === '__unassigned__' ||
    key === '__no_project__' ||
    key === '__no_date__'
  );
}

function compareGroupMeta(a: TaskGroupMeta, b: TaskGroupMeta): number {
  const groupBy = currentGroupBy;
  const order = effectiveGroupOrderFor(groupBy, currentGroupOrder);

  // Always keep special buckets at the end (both asc + desc) for predictability.
  const aSpecial = isSpecialGroupKey(a.group_key);
  const bSpecial = isSpecialGroupKey(b.group_key);
  if (aSpecial !== bSpecial) return aSpecial ? 1 : -1;

  let cmp = 0;
  if (groupBy === 'delivery_date' || groupBy === 'publication_date') {
    // group_key is YYYY-MM (lexicographically sortable)
    cmp = a.group_key.localeCompare(b.group_key);
  } else {
    cmp = String(a.label ?? '').localeCompare(String(b.label ?? ''), undefined, { sensitivity: 'base' });
  }

  return order === 'asc' ? cmp : -cmp;
}

/**
 * Optimistically ensure the task's group exists and increment its task_count.
 * If the group doesn't exist, it is inserted in the correct group order.
 */
export function addTaskToGroupMetaCaches(newTask: any) {
  const row = toTaskListRowLoose(newTask);
  if (!row) return;
  if (!currentGroupBy) return;
  const groupKey = computeGroupKeyForTask(row, currentGroupBy);
  if (!groupKey) return;

  const label = computeGroupLabelForTask(row, currentGroupBy);

  groupMetaSubscribers.forEach(apply => {
    apply(prev => {
      const idx = prev.findIndex(g => g.group_key === groupKey);
      if (idx !== -1) {
        const g = prev[idx];
        const updated: TaskGroupMeta = {
          ...g,
          // If the label is missing (or placeholder), prefer our computed label.
          label: g.label || label || g.group_key,
          task_count: (g.task_count ?? 0) + 1,
        };
        const next = [...prev];
        next[idx] = updated;
        return next;
      }

      const newGroup: TaskGroupMeta = {
        group_key: groupKey,
        label: label || groupKey,
        task_count: 1,
      };

      const next = [...prev, newGroup];
      next.sort(compareGroupMeta);
      return next;
    });
  });
}

/**
 * Optimistically decrement a task's group's task_count and remove the group if empty.
 * If groupKey isn't provided, we'll best-effort resolve it from mounted grouped task caches.
 */
export function removeTaskFromGroupMetaCaches(taskId: number | string, groupKey?: string) {
  const resolvedKey = groupKey ?? lookupGroupKeyForTaskId(taskId);
  if (!resolvedKey) return;

  groupMetaSubscribers.forEach(apply => {
    apply(prev => {
      const idx = prev.findIndex(g => g.group_key === resolvedKey);
      if (idx === -1) return prev;

      const g = prev[idx];
      const nextCount = Math.max(0, (g.task_count ?? 0) - 1);
      if (nextCount <= 0) {
        return prev.filter((_, i) => i !== idx);
      }

      const next = [...prev];
      next[idx] = { ...g, task_count: nextCount };
      return next;
    });
  });
}

export function useTaskGroupMetaAllQuery({
  q,
  project,
  filters = {},
  groupBy,
  groupOrder,
  limit = 5000,
  enabled = true,
  editFields,
}: UseTaskGroupMetaAllQueryOptions): UseTaskGroupMetaAllQueryResult {
  const [groups, setGroups] = useState<TaskGroupMeta[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editFieldsRef = useRef(editFields);
  useEffect(() => {
    editFieldsRef.current = editFields;
  }, [editFields]);

  const filtersString = useMemo(() => JSON.stringify(filters || {}), [filters]);

  const lastQueryKeyRef = useRef<string | null>(null);
  const lastRequestIdRef = useRef(0);

  const isEnabled = enabled && !!groupBy && groupBy !== 'none';

  // Register this hook instance with the grouped-meta cache registry so external utilities
  // can patch group headers (create/remove groups, update counts) without refetching.
  useEffect(() => {
    const subscriber: GroupMetaSubscriber = updater => {
      setGroups(prev => updater(prev));
    };
    groupMetaSubscribers.add(subscriber);
    return () => {
      groupMetaSubscribers.delete(subscriber);
    };
  }, []);

  // Keep global grouping config up to date for group-order insertion.
  useEffect(() => {
    if (isEnabled) {
      currentGroupBy = groupBy;
      currentGroupOrder = groupOrder;
    }
  }, [isEnabled, groupBy, groupOrder]);

  const buildRpcParams = useCallback(() => {
    // Convert project filter - can be single ID or comma-separated list.
    let projectIds: number[] | undefined;
    if (project) {
      const parsed = project
        .split(',')
        .map(p => parseInt(p.trim(), 10))
        .filter(id => !isNaN(id));
      if (parsed.length > 0) {
        projectIds = parsed;
      }
    }

    // Convert status filter - filter by name directly.
    const statusParam = filters['project_status_name'] || filters['status'];
    let statusNames: string[] | undefined;
    if (statusParam) {
      const statuses = Array.isArray(statusParam) ? statusParam : [statusParam];
      const names = statuses.filter(s => typeof s === 'string' && s.trim().length > 0) as string[];
      if (names.length > 0) {
        statusNames = names;
      }
    }

    // Convert assignee filter.
    const assigneeParam = filters['assigned_to_name'];
    let assigneeIds: number[] | undefined;
    if (assigneeParam) {
      const assignees = Array.isArray(assigneeParam) ? assigneeParam : [assigneeParam];
      const ids: number[] = [];

      for (const a of assignees) {
        const id = parseInt(String(a), 10);
        if (!isNaN(id)) {
          ids.push(id);
        } else if (editFieldsRef.current?.project_watchers) {
          const watcher = editFieldsRef.current.project_watchers.find(
            (w: any) => w.users?.full_name === a,
          );
          if (watcher?.user_id) {
            ids.push(Number(watcher.user_id));
          }
        }
      }

      if (ids.length > 0) {
        assigneeIds = ids;
      }
    }

    // Convert content type filter.
    const contentTypeParam = filters['content_type_title'];
    let contentTypeIds: number[] | undefined;
    if (contentTypeParam && editFieldsRef.current?.content_types) {
      const contentTypes = Array.isArray(contentTypeParam) ? contentTypeParam : [contentTypeParam];
      const ids: number[] = [];

      for (const ct of contentTypes) {
        const contentType = editFieldsRef.current.content_types.find((c: any) => c.title === ct);
        if (contentType?.id) {
          ids.push(Number(contentType.id));
        }
      }

      if (ids.length > 0) {
        contentTypeIds = ids;
      }
    }

    // Convert production type filter.
    const productionTypeParam = filters['production_type_title'];
    let productionTypeIds: number[] | undefined;
    if (productionTypeParam && editFieldsRef.current?.production_types) {
      const productionTypes = Array.isArray(productionTypeParam)
        ? productionTypeParam
        : [productionTypeParam];
      const ids: number[] = [];

      for (const pt of productionTypes) {
        const productionType = editFieldsRef.current.production_types.find(
          (p: any) => p.title === pt,
        );
        if (productionType?.id) {
          ids.push(Number(productionType.id));
        }
      }

      if (ids.length > 0) {
        productionTypeIds = ids;
      }
    }

    // Convert language filter.
    const languageParam = filters['language_code'];
    let languageIds: number[] | undefined;
    if (languageParam && editFieldsRef.current?.languages) {
      const languages = Array.isArray(languageParam) ? languageParam : [languageParam];
      const ids: number[] = [];

      for (const lang of languages) {
        const language = editFieldsRef.current.languages.find(
          (l: any) => l.long_name === lang || l.code === lang,
        );
        if (language?.id) {
          ids.push(Number(language.id));
        }
      }

      if (ids.length > 0) {
        languageIds = ids;
      }
    }

    // Overdue filters.
    const overdueStatusParam = filters['overdueStatus'];
    let isOverdue: boolean | undefined;
    let isPublicationOverdue: boolean | undefined;
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

    // Full payload so PostgREST matches (avoids PGRST202). Same shape as task_group_meta_paged_filtered.
    return {
      p_assignee_ids: assigneeIds ?? null,
      p_channels: null,
      p_content_type_ids: contentTypeIds ?? null,
      p_cursor: null,
      p_delivery_date_gte: null,
      p_delivery_date_lt: null,
      p_group_by: groupBy && groupBy !== 'none' ? groupBy : null,
      p_group_order: groupOrder ?? null,
      p_is_overdue: typeof isOverdue === 'boolean' ? isOverdue : null,
      p_is_publication_overdue:
        typeof isPublicationOverdue === 'boolean' ? isPublicationOverdue : null,
      p_language_ids: languageIds ?? null,
      p_limit: limit,
      p_production_type_ids: productionTypeIds ?? null,
      p_project_ids: projectIds ?? null,
      p_publication_date_gte: null,
      p_publication_date_lt: null,
      p_q: q && q.trim().length > 0 ? q : null,
      p_status_names: statusNames ?? null,
    };
  }, [q, project, filters, groupBy, groupOrder, limit]);

  const performFetch = useCallback(async () => {
    if (!isEnabled) return;

    const requestId = ++lastRequestIdRef.current;

    const queryKeyAtStart = lastQueryKeyRef.current;

    console.log('[TaskGroupMetaAll] Starting RPC fetch (paged, limit=', limit, ')');

    setIsFetching(true);
    setError(null);

    try {
      const supabase = createClientComponentClient();
      const rpcParams = buildRpcParams();

      // Use the paged RPC but request a very large limit so we effectively load all groups in one call.
      const { data, error: rpcError } = await supabase.rpc(
        'task_group_meta_paged_filtered',
        rpcParams,
      );

      if (lastRequestIdRef.current !== requestId) {
        console.log('[TaskGroupMetaAll] Ignoring stale RPC response');
        return;
      }
      if (queryKeyAtStart !== lastQueryKeyRef.current) {
        console.log('[TaskGroupMetaAll] Query shape changed during fetch, discarding response');
        return;
      }

      if (rpcError) {
        console.error('[TaskGroupMetaAll] RPC error:', rpcError);
        setError(rpcError.message || 'Failed to fetch task group metadata');
        setGroups([]);
        return;
      }

      let fetchedGroups: TaskGroupMeta[] = [];
      if (Array.isArray(data)) {
        // Some deployments may return the groups array directly.
        fetchedGroups = data as TaskGroupMeta[];
      } else if (data && typeof data === 'object') {
        // Standard shape: { groups: [...], next_cursor: ... }
        fetchedGroups = (data as any).groups ?? [];
      }

      console.log('[TaskGroupMetaAll] Completed RPC fetch', {
        fetchedGroups: fetchedGroups.length,
      });

      setGroups(fetchedGroups);
    } catch (err: any) {
      console.error('[TaskGroupMetaAll] Unexpected error during RPC fetch', err);
      setError(err?.message || 'Failed to fetch task group metadata');
      setGroups([]);
    } finally {
      if (lastRequestIdRef.current === requestId) {
        setIsFetching(false);
      }
    }
  }, [buildRpcParams, isEnabled]);

  // Reset and load when the "query shape" changes.
  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    const queryKey = JSON.stringify({
      q,
      project,
      filtersString,
      groupBy,
      groupOrder,
      limit,
    });

    if (lastQueryKeyRef.current === queryKey) {
      return;
    }

    lastQueryKeyRef.current = queryKey;
    lastRequestIdRef.current += 1; // invalidate any in-flight responses

    setGroups([]);
    setError(null);

    performFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEnabled, q, project, filtersString, groupBy, groupOrder]);

  return {
    groups,
    isFetching,
    error,
  };
}


