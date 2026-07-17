import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { TaskListRow } from '@/lib/types/task-list-view';
import type { SearchSession, SearchSessionRef } from '../../app/lib/types/search-session';

type RowSortOrder = 'asc' | 'desc';

const DEBUG_GROUPED_TASKS = false;
const DEBUG_GROUPED_BOOTSTRAP = process.env.NODE_ENV === 'development';
/** Row-sort / grouped orchestration (console in development). */
const DEBUG_GROUPED_ROW_SORT = process.env.NODE_ENV === 'development';

type GroupFetchTriggerSource =
  | 'initial hydration'
  | 'visible hydration'
  | 'expand'
  | 're-expand'
  | 'load more'
  | 'viewport fill'
  | 'unknown';

/** Human-readable reason for `task_group_tasks_filtered` logs. */
function mapGroupedFetchReason(source: GroupFetchTriggerSource): string {
  switch (source) {
    case 'visible hydration':
      return 'hydrate_unhydrated_group';
    case 'load more':
      return 'continue_group';
    case 'viewport fill':
      return 'viewport_fill';
    case 'initial hydration':
      return 'initial_hydration';
    case 'expand':
      return 'expand';
    case 're-expand':
      return 're_expand';
    default:
      return 'unknown';
  }
}
type RowFetchContext = {
  isBlockingGroup?: boolean;
  areEarlierGroupsFullyDrained?: boolean;
  groupCameFromBootstrap?: boolean;
  nextRowCursor?: any | null;
  groupIndex?: number;
  visibleWindowIndices?: { start: number; end: number } | null;
};

// Track the latest grouping and row-sort configuration for the active
// grouped-tasks hook instance so our cache patcher can move rows between
// groups and keep intra-group ordering roughly consistent.
let currentGroupBy: string | null = null;
let currentRowSortBy: string | undefined;
let currentRowSortOrder: RowSortOrder = 'desc';

// Best-effort index of currently mounted grouped caches so other parts of the app
// (e.g. delete handlers that only have an id) can still resolve which group a row
// belonged to.
const taskIdToGroupKey = new Map<string, string>();
let latestLoadedTaskRowsSnapshot: TaskListRow[] = [];

export function getLoadedTaskRowsSnapshot(): TaskListRow[] {
  return latestLoadedTaskRowsSnapshot;
}

// Map UI sort keys (column accessor keys) to TaskListRow fields.
const uiToRowFieldMap: Record<string, keyof TaskListRow> = {
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

// Same mapping for row sort (view column names sent to RPC / used for cursor).
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

/** Stable cache/dedupe key for a cursor. Cursor is opaque { rok, id }; don't parse rok. */
function getCursorDedupeKey(cursor: any): string {
  if (!cursor || typeof cursor !== 'object' || !('id' in cursor)) return 'FIRST';
  const rok = typeof (cursor as any).rok === 'string' ? (cursor as any).rok : '';
  return `${rok}|${(cursor as any).id}`;
}

export function computeGroupKeyForTask(row: TaskListRow, groupBy: string | null): string | null {
  if (!groupBy) return null;
  switch (groupBy) {
    case 'assigned_to':
      return row.assigned_to_id != null ? String(row.assigned_to_id) : '__unassigned__';
    case 'status':
      if (row.project_status_id == null) return '__unassigned__'
      return row.project_status_name ?? String(row.project_status_id);
    case 'project':
      return row.project_id_int != null ? String(row.project_id_int) : '__no_project__';
    case 'content_type':
      return row.content_type_id != null ? String(row.content_type_id) : '__unassigned__';
    case 'production_type':
      return row.production_type_id != null ? String(row.production_type_id) : '__unassigned__';
    case 'language':
      return row.language_id != null ? String(row.language_id) : '__unassigned__';
    case 'delivery_date': {
      if (!row.delivery_date) return '__no_date__';
      const d = new Date(row.delivery_date);
      if (Number.isNaN(d.getTime())) return '__no_date__';
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    case 'publication_date': {
      if (!row.publication_date) return '__no_date__';
      const d = new Date(row.publication_date);
      if (Number.isNaN(d.getTime())) return '__no_date__';
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    default:
      return null;
  }
}

function compareRowsForSort(a: TaskListRow, b: TaskListRow): number {
  if (!currentRowSortBy) return 0;
  const field = uiToRowFieldMap[currentRowSortBy] ?? (currentRowSortBy as keyof TaskListRow);
  const av = a[field] as any;
  const bv = b[field] as any;

  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;

  if (field === 'delivery_date' || field === 'publication_date' || field === 'updated_at') {
    const ad = new Date(av);
    const bd = new Date(bv);
    const at = ad.getTime();
    const bt = bd.getTime();
    if (Number.isNaN(at) || Number.isNaN(bt)) {
      return String(av).localeCompare(String(bv));
    }
    return at - bt;
  }

  return String(av).localeCompare(String(bv));
}

export interface UseTaskGroupTasksQueryOptions {
  q: string;
  project?: string;
  /** When in project scope, pass current projectId so p_project_ids is never omitted. */
  scopeProjectId?: number | null;
  filters?: { [key: string]: string | string[] };
  groupBy: string | null;
  rowSortBy?: string;
  rowSortOrder?: RowSortOrder;
  perPage?: number;
  enabled?: boolean;
  editFields?: any;
  /** When provided, RPC reads q/filters/etc from this ref at call time (avoids stale closures). */
  searchSessionRef?: SearchSessionRef | null;
}

export interface UseTaskGroupTasksQueryResult {
  tasksByGroup: Record<string, TaskListRow[]>;
  hydratedByGroup: Record<string, boolean>;
  bootstrapHydratedByGroup: Record<string, boolean>;
  cursorByGroup: Record<string, any | null>;
  /**
   * True once we've received at least one RPC response for this group (including an empty first page).
   * This is required to correctly compute the "drained group" invariant in the UI:
   * drained := next_cursor is null AND loadedFirstPageByGroup[groupKey] is true (or meta task_count == 0).
   */
  loadedFirstPageByGroup: Record<string, boolean>;
  /**
   * True once we've *started* a first-page request for this group (even if response hasn't arrived yet).
   * Used by the UI to decide whether it's allowed to reveal the next group's header early.
   */
  prefetchedFirstPageByGroup: Record<string, boolean>;
  hasMoreByGroup: Record<string, boolean>;
  isLoadingRowsByGroup: Record<string, boolean>;
  isFetchingByGroup: Record<string, boolean>;
  errorByGroup: Record<string, string | null>;
  ensureFirstPage: (
    groupKey: string,
    triggerSource?: GroupFetchTriggerSource,
    context?: RowFetchContext,
  ) => void;
  fetchMore: (
    groupKey: string,
    triggerSource?: GroupFetchTriggerSource,
    context?: RowFetchContext,
  ) => void;
  hydrateFromBootstrap: (payload: BootstrapResponse) => void;
  resetAll: () => void;
}

export type GroupRowCursor = { rok: string; id: number } | null;
export type GroupPaginationCursor = { sd?: string; gok?: string; gk: string } | null;

export type BootstrapGroup = {
  group_key: string;
  label: string;
  is_hydrated: boolean;
  rows: TaskListRow[];
  has_more_rows: boolean | null;
  next_row_cursor: GroupRowCursor;
};

export type BootstrapResponse = {
  groups: BootstrapGroup[];
  next_group_cursor: GroupPaginationCursor;
};

// --- Cross-hook cache patching for grouped task rows ------------------------
// This small registry allows non-hook utilities (e.g. task-cache-utils) to
// optimistically patch grouped task rows in-place when a task is edited in
// TaskDetails, without forcing a refetch.
type GroupTasksSubscriber = (
  updater: (prev: Record<string, TaskListRow[]>) => Record<string, TaskListRow[]>,
) => void;

const groupTasksSubscribers = new Set<GroupTasksSubscriber>();

/**
 * Apply an optimistic update with explicit config (groupBy, rowSortBy, rowSortOrder).
 * Used by task-list-optimistic.ts so updates work even when called from TaskDetails/realtime
 * without relying on module-level currentGroupBy etc.
 */
export function applyTaskListOptimisticUpdate(
  config: { groupBy: string | null; rowSortBy?: string; rowSortOrder?: RowSortOrder },
  updater: (prev: Record<string, TaskListRow[]>) => Record<string, TaskListRow[]>,
): void {
  const prevGroupBy = currentGroupBy
  const prevRowSortBy = currentRowSortBy
  const prevRowSortOrder = currentRowSortOrder
  currentGroupBy = config.groupBy
  currentRowSortBy = config.rowSortBy
  currentRowSortOrder = config.rowSortOrder ?? 'desc'
  try {
    groupTasksSubscribers.forEach((apply) => {
      apply(updater);
    });
  } finally {
    currentGroupBy = prevGroupBy
    currentRowSortBy = prevRowSortBy
    currentRowSortOrder = prevRowSortOrder
  }
}

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

function insertRowSorted(rows: TaskListRow[], row: TaskListRow): TaskListRow[] {
  const withoutDup = rows.filter(r => String(r.id) !== String(row.id));
  const dest = [...withoutDup];

  if (!currentRowSortBy) {
    dest.unshift(row);
    return dest;
  }

  let insertIdx = -1;
  for (let i = 0; i < dest.length; i++) {
    const cmp = compareRowsForSort(row, dest[i]);
    const asc = currentRowSortOrder === 'asc';
    if ((asc && cmp <= 0) || (!asc && cmp >= 0)) {
      insertIdx = i;
      break;
    }
  }
  if (insertIdx === -1) {
    dest.push(row);
  } else {
    dest.splice(insertIdx, 0, row);
  }
  return dest;
}

/**
 * Optimistically insert a newly created task row into any mounted grouped-task caches.
 * Also respects the currently active intra-group row sort.
 */
export function addTaskToGroupTasksCaches(newTask: any) {
  const row = toTaskListRowLoose(newTask);
  if (!row) return;

  const groupKey = currentGroupBy ? (computeGroupKeyForTask(row, currentGroupBy) ?? null) : 'all';
  if (!groupKey) return;

  groupTasksSubscribers.forEach(apply => {
    apply(prev => {
      const existing = prev[groupKey] ?? [];
      const nextRows = insertRowSorted(existing, row);
      return {
        ...prev,
        [groupKey]: nextRows,
      };
    });
  });
}

/**
 * Optimistically remove a task from any mounted grouped-task caches.
 */
export function removeTaskFromGroupTasksCaches(taskId: number | string) {
  const idStr = String(taskId);
  groupTasksSubscribers.forEach(apply => {
    apply(prev => {
      let hasAnyChange = false;
      const next: Record<string, TaskListRow[]> = {};

      for (const [groupKey, rows] of Object.entries(prev)) {
        const filtered = rows.filter(r => String(r.id) !== idStr);
        if (filtered.length !== rows.length) {
          hasAnyChange = true;
        }
        if (filtered.length > 0) {
          next[groupKey] = filtered;
        }
      }

      if (hasAnyChange) {
        taskIdToGroupKey.delete(idStr);
      }
      return hasAnyChange ? next : prev;
    });
  });
}

export function lookupGroupKeyForTaskId(taskId: number | string): string | undefined {
  return taskIdToGroupKey.get(String(taskId));
}

/**
 * Optimistically patch any grouped-task caches that are currently mounted.
 * Used by updateTaskInCaches so TaskDetails edits immediately reflect in the
 * UnifiedGroupedTaskList without a refetch.
 */
export function patchTaskInGroupTasksCaches(updatedTask: any) {
  if (!updatedTask || !updatedTask.id) return;
  const idStr = String(updatedTask.id);

  groupTasksSubscribers.forEach(apply => {
    apply(prev => {
      let hasAnyChange = false;
      const next: Record<string, TaskListRow[]> = {};

      let movedRow: TaskListRow | null = null;
      let targetGroupKey: string | null = null;

      for (const [groupKey, rows] of Object.entries(prev)) {
        const newRows: TaskListRow[] = [];

        for (const row of rows) {
          if (String(row.id) !== idStr) {
            newRows.push(row);
            continue;
          }

          hasAnyChange = true;
          const merged = { ...row, ...updatedTask } as TaskListRow;

          const desiredKey = currentGroupBy
            ? (computeGroupKeyForTask(merged, currentGroupBy) ?? null)
            : 'all'
          // Only move when we can confidently compute a new key.
          if (desiredKey != null && desiredKey !== groupKey) {
            movedRow = merged
            targetGroupKey = desiredKey
            // Do not push into this group's rows – effectively remove it here.
          } else {
            newRows.push(merged)
          }
        }

        next[groupKey] = newRows;
      }

      if (movedRow != null && targetGroupKey != null) {
        const existing = next[targetGroupKey] ?? prev[targetGroupKey] ?? []
        const withoutDup = existing.filter(r => String(r.id) !== idStr)
        next[targetGroupKey] = insertRowSorted(withoutDup, movedRow)
      }

      return hasAnyChange ? next : prev;
    });
  });
}

/**
 * Reinsert a task within a group using the active intra-group sort.
 * Used for same-group drops where no grouped-field mutation is needed.
 */
export function repositionTaskInGroupCaches(args: {
  taskId: number | string
  groupKey: string
  beforeTaskId?: number | null
}) {
  const idStr = String(args.taskId)
  groupTasksSubscribers.forEach(apply => {
    apply(prev => {
      const rows = prev[args.groupKey]
      if (!rows?.length) return prev

      const moved = rows.find(r => String(r.id) === idStr)
      if (!moved) return prev

      const without = rows.filter(r => String(r.id) !== idStr)

      let insertIdx = without.length
      if (args.beforeTaskId != null) {
        const beforeIdx = without.findIndex(r => String(r.id) === String(args.beforeTaskId))
        if (beforeIdx !== -1) insertIdx = beforeIdx
      }

      const nextRows = [...without]
      nextRows.splice(insertIdx, 0, moved)

      const unchanged =
        nextRows.length === rows.length &&
        nextRows.every((row, index) => String(row.id) === String(rows[index]?.id))
      if (unchanged) return prev

      return {
        ...prev,
        [args.groupKey]: nextRows,
      }
    })
  })
}

export function useTaskGroupTasksQuery({
  q,
  project,
  scopeProjectId,
  filters = {},
  groupBy,
  rowSortBy,
  rowSortOrder = 'desc',
  perPage = 50,
  enabled = true,
  editFields,
  searchSessionRef,
}: UseTaskGroupTasksQueryOptions): UseTaskGroupTasksQueryResult {
  const [tasksByGroup, setTasksByGroup] = useState<Record<string, TaskListRow[]>>({});
  const [hydratedByGroup, setHydratedByGroup] = useState<Record<string, boolean>>({});
  const [bootstrapHydratedByGroup, setBootstrapHydratedByGroup] = useState<Record<string, boolean>>({});
  const [cursorByGroup, setCursorByGroup] = useState<Record<string, any | null>>({});
  const [loadedFirstPageByGroup, setLoadedFirstPageByGroup] = useState<Record<string, boolean>>({});
  const [prefetchedFirstPageByGroup, setPrefetchedFirstPageByGroup] = useState<Record<string, boolean>>({});
  const [hasMoreByGroup, setHasMoreByGroup] = useState<Record<string, boolean>>({});
  const [isFetchingByGroup, setIsFetchingByGroup] = useState<Record<string, boolean>>({});
  const [errorByGroup, setErrorByGroup] = useState<Record<string, string | null>>({});

  const editFieldsRef = useRef(editFields);
  useEffect(() => {
    editFieldsRef.current = editFields;
  }, [editFields]);

  const filtersString = useMemo(() => JSON.stringify(filters || {}), [filters]);

  const lastQueryKeyRef = useRef<string | null>(null);
  // IMPORTANT:
  // We allow up to 2 concurrent per-group RPCs (blocking group + optional prefetch).
  // Therefore we CANNOT use a single global "latest request id wins" staleness check.
  // Instead, we invalidate by query-generation when the query shape changes.
  const queryGenerationRef = useRef(0);
  const requestSeqRef = useRef(0); // for logging only
  const inFlightByGroupRef = useRef<Record<string, boolean>>({});
  const lastCursorKeyByGroupRef = useRef<Record<string, string>>({});
  const firstPageRequestedRef = useRef<Set<string>>(new Set());
  /** When searchSessionRef is provided, we reset only when session gen changes (not on q/project/... props). */
  const lastSeenSessionGenRef = useRef<number | null>(null);

  // IMPORTANT:
  // - Grouped mode: groupBy is a string (e.g. 'status'); p_group_key = group key from meta.
  // - Ungrouped mode: groupBy is null; caller uses synthetic group key 'all' → p_group_key='all'.
  const isEnabled = enabled && groupBy !== 'none';

  // Register this hook instance with the grouped-task cache registry so
  // external utilities can patch rows optimistically.
  useEffect(() => {
    const subscriber: GroupTasksSubscriber = updater => {
      setTasksByGroup(prev => updater(prev));
    };

    groupTasksSubscribers.add(subscriber);
    return () => {
      groupTasksSubscribers.delete(subscriber);
    };
  }, []);

  // Keep global grouping/sorting config up to date for the cache patcher.
  useEffect(() => {
    if (isEnabled) {
      currentGroupBy = groupBy;
      currentRowSortBy = rowSortBy;
      currentRowSortOrder = rowSortOrder;
    }
  }, [isEnabled, groupBy, rowSortBy, rowSortOrder]);

  // Keep our best-effort id -> groupKey index up to date for delete handlers.
  useEffect(() => {
    if (!isEnabled) {
      latestLoadedTaskRowsSnapshot = [];
      return;
    }
    taskIdToGroupKey.clear();
    const snapshotRows: TaskListRow[] = [];
    for (const [groupKey, rows] of Object.entries(tasksByGroup)) {
      for (const row of rows) {
        taskIdToGroupKey.set(String(row.id), groupKey);
        snapshotRows.push(row);
      }
    }
    latestLoadedTaskRowsSnapshot = snapshotRows;
  }, [isEnabled, tasksByGroup]);

  const buildRpcParams = useCallback(
    (groupKey: string, cursor: any | null, sessionParams?: SearchSession['params']) => {
      const useSession = !!sessionParams;
      const qVal = useSession ? sessionParams!.q : q;
      const projectVal = useSession ? sessionParams!.project : project;
      const filtersVal = useSession ? sessionParams!.filters : filters;
      const groupByVal = useSession ? sessionParams!.groupBy : (groupBy ?? '');
      const rowSortByVal = useSession ? sessionParams!.sortBy : rowSortBy;
      const rowSortOrderVal = useSession ? (sessionParams!.sortOrder as RowSortOrder) : rowSortOrder;

      const mappedRowSortBy = rowSortByVal ? uiToViewSortMap[rowSortByVal] || rowSortByVal : undefined;

      // Convert project filter - can be single ID or comma-separated list.
      let projectIds: number[] | undefined;
      if (projectVal) {
        const parsed = String(projectVal)
          .split(',')
          .map(p => parseInt(p.trim(), 10))
          .filter(id => !isNaN(id));
        if (parsed.length > 0) {
          projectIds = parsed;
        }
      }
      // In project scope, never send null; enforce at hook layer so UI cannot omit.
      if ((!projectIds || projectIds.length === 0) && scopeProjectId != null && Number.isFinite(scopeProjectId)) {
        projectIds = [scopeProjectId];
      }
      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development' && scopeProjectId != null && Number.isFinite(scopeProjectId) && (!projectIds || projectIds.length === 0)) {
        console.error('[use-task-group-tasks-query] Project scope but p_project_ids would be null; scopeProjectId=', scopeProjectId);
      }

      // Convert status filter - filter by name directly.
      const statusParam = filtersVal['project_status_name'] || filtersVal['status'];
      let statusNames: string[] | undefined;
      if (statusParam) {
        const statuses = Array.isArray(statusParam) ? statusParam : [statusParam];
        const names = statuses.filter(s => typeof s === 'string' && s.trim().length > 0) as string[];
        if (names.length > 0) {
          statusNames = names;
        }
      }

      // Convert assignee filter.
      const assigneeParam = filtersVal['assigned_to_name'];
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

      // Convert content type filter. Accept numeric ID (from pills/filter pane) or title (lookup).
      const contentTypeParam = filtersVal['content_type_title'];
      let contentTypeIds: number[] | undefined;
      if (contentTypeParam && editFieldsRef.current?.content_types) {
        const contentTypes = Array.isArray(contentTypeParam) ? contentTypeParam : [contentTypeParam];
        const ids: number[] = [];

        for (const ct of contentTypes) {
          const raw = String(ct).trim();
          const asId = /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
          if (Number.isFinite(asId)) {
            ids.push(asId);
          } else {
            const contentType = editFieldsRef.current.content_types.find((c: any) => c.title === raw);
            if (contentType?.id) ids.push(Number(contentType.id));
          }
        }

        if (ids.length > 0) contentTypeIds = ids;
      }

      // Convert production type filter. Accept numeric ID or title.
      const productionTypeParam = filtersVal['production_type_title'];
      let productionTypeIds: number[] | undefined;
      if (productionTypeParam && editFieldsRef.current?.production_types) {
        const productionTypes = Array.isArray(productionTypeParam)
          ? productionTypeParam
          : [productionTypeParam];
        const ids: number[] = [];

        for (const pt of productionTypes) {
          const raw = String(pt).trim();
          const asId = /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
          if (Number.isFinite(asId)) {
            ids.push(asId);
          } else {
            const productionType = editFieldsRef.current.production_types.find(
              (p: any) => p.title === raw,
            );
            if (productionType?.id) ids.push(Number(productionType.id));
          }
        }

        if (ids.length > 0) productionTypeIds = ids;
      }

      // Convert language filter.
      const languageParam = filtersVal['language_code'];
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
      const overdueStatusParam = filtersVal['overdueStatus'];
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

      // Channels + date ranges (align with task_group_tasks_filtered signature).
      const channelsParam = filtersVal['channel_names'] ?? filtersVal['channels'];
      let p_channels: string[] | null = null;
      if (channelsParam) {
        const arr = Array.isArray(channelsParam) ? channelsParam : [channelsParam];
        const names = arr.filter((c): c is string => typeof c === 'string' && c.trim().length > 0);
        if (names.length > 0) p_channels = names;
      }
      const deliveryGte = filtersVal['delivery_date_gte'];
      const deliveryLt = filtersVal['delivery_date_lt'];
      const publicationGte = filtersVal['publication_date_gte'];
      const publicationLt = filtersVal['publication_date_lt'];
      const p_delivery_date_gte =
        typeof deliveryGte === 'string' && deliveryGte.trim().length > 0 ? deliveryGte.trim() : null;
      const p_delivery_date_lt =
        typeof deliveryLt === 'string' && deliveryLt.trim().length > 0 ? deliveryLt.trim() : null;
      const p_publication_date_gte =
        typeof publicationGte === 'string' && publicationGte.trim().length > 0
          ? publicationGte.trim()
          : null;
      const p_publication_date_lt =
        typeof publicationLt === 'string' && publicationLt.trim().length > 0
          ? publicationLt.trim()
          : null;

      return {
        p_q: qVal && String(qVal).trim().length > 0 ? String(qVal).trim() : null,
        p_project_ids: projectIds ?? null,
        p_status_names: statusNames ?? null,
        p_assignee_ids: assigneeIds ?? null,
        p_content_type_ids: contentTypeIds ?? null,
        p_production_type_ids: productionTypeIds ?? null,
        p_language_ids: languageIds ?? null,
        p_is_overdue: typeof isOverdue === 'boolean' ? isOverdue : null,
        p_is_publication_overdue:
          typeof isPublicationOverdue === 'boolean' ? isPublicationOverdue : null,
        p_group_by: groupByVal && groupByVal !== 'none' ? groupByVal : null,
        p_group_key: groupKey,
        p_row_sort_by: mappedRowSortBy ?? null,
        p_row_sort_order: rowSortOrderVal ?? null,
        p_limit: perPage,
        p_cursor: cursor ?? null,
        p_channels,
        p_delivery_date_gte: p_delivery_date_gte,
        p_delivery_date_lt: p_delivery_date_lt,
        p_publication_date_gte: p_publication_date_gte,
        p_publication_date_lt: p_publication_date_lt,
      };
    },
    [q, project, scopeProjectId, filters, groupBy, rowSortBy, rowSortOrder, perPage],
  );

  const resetState = useCallback(() => {
    setTasksByGroup({});
    setHydratedByGroup({});
    setBootstrapHydratedByGroup({});
    setCursorByGroup({});
    setLoadedFirstPageByGroup({});
    setPrefetchedFirstPageByGroup({});
    setHasMoreByGroup({});
    setIsFetchingByGroup({});
    setErrorByGroup({});
    inFlightByGroupRef.current = {};
    lastCursorKeyByGroupRef.current = {};
    firstPageRequestedRef.current = new Set();
  }, []);

  const performFetchForGroup = useCallback(
    async (
      groupKey: string,
      cursor: any | null,
      isFirstPage: boolean,
      triggerSource: GroupFetchTriggerSource = 'unknown',
      context?: RowFetchContext,
    ) => {
      if (!isEnabled) return;

      // Always use string group key for storage/lookups (avoids tasksByGroup["85"] vs tasksByGroup[85]).
      const gk = String(groupKey);

      const session = searchSessionRef?.current;
      const requestGen = session?.gen ?? 0;
      const sessionParams = session?.params;

      const generationAtStart = queryGenerationRef.current;
      const wasHydrated = !!hydratedByGroup[gk];
      const rowCount = tasksByGroup[gk]?.length ?? 0;
      const hasMoreRows = hasMoreByGroup[gk];
      const isLoadingRows = !!isFetchingByGroup[gk];

      if (DEBUG_GROUPED_BOOTSTRAP) {
        console.log('[TaskGroupTasks] row fetch start', {
          group_key: gk,
          reason: triggerSource,
          isBlockingGroup: Boolean(context?.isBlockingGroup),
          areEarlierGroupsFullyDrained:
            typeof context?.areEarlierGroupsFullyDrained === 'boolean'
              ? context.areEarlierGroupsFullyDrained
              : null,
          groupCameFromBootstrap:
            typeof context?.groupCameFromBootstrap === 'boolean'
              ? context.groupCameFromBootstrap
              : Boolean(bootstrapHydratedByGroup[gk]),
          wasHydrated,
          rowCount,
          hasMoreRows,
          nextRowCursor: context?.nextRowCursor ?? cursorByGroup[gk] ?? null,
          groupIndex: context?.groupIndex ?? null,
          visibleWindowIndices: context?.visibleWindowIndices ?? null,
          isLoadingRows,
        });
      }

      // Guard 1: per-group in-flight lock
      if (inFlightByGroupRef.current[gk]) {
        if (DEBUG_GROUPED_TASKS) {
          console.log('[TaskGroupTasks] performFetchForGroup: early return (inFlight)', { groupKey: gk });
        }
        return;
      }
      inFlightByGroupRef.current[gk] = true;

      // Guard 2: cursor dedupe (never fetch same cursor twice). Cursor is opaque { rok, id }; store and replay as-is.
      const cursorKey = getCursorDedupeKey(cursor);
      if (lastCursorKeyByGroupRef.current[gk] === cursorKey) {
        inFlightByGroupRef.current[gk] = false;
        if (DEBUG_GROUPED_TASKS) {
          console.log('[TaskGroupTasks] performFetchForGroup: early return (cursor dedupe)', {
            groupKey: gk,
            cursorKey,
          });
        }
        return;
      }
      lastCursorKeyByGroupRef.current[gk] = cursorKey;

      // Guard 3: first-page requested flag
      if (cursor == null) {
        if (firstPageRequestedRef.current.has(gk)) {
          inFlightByGroupRef.current[gk] = false;
          if (DEBUG_GROUPED_TASKS) {
            console.log('[TaskGroupTasks] performFetchForGroup: early return (first page already requested)', {
              groupKey: gk,
            });
          }
          return;
        }
        firstPageRequestedRef.current.add(gk);
        setPrefetchedFirstPageByGroup(prev => ({ ...prev, [gk]: true }));
      }

      setIsFetchingByGroup(prev => ({ ...prev, [gk]: true }));
      setErrorByGroup(prev => ({ ...prev, [gk]: null }));

      // IMPORTANT:
      // ensureFirstPage must NOT depend on tasksByGroup[gk].length.
      // First pages can legitimately be empty while still returning a next_cursor,
      // and the UI drain model relies on loadedFirstPageByGroup + cursorByGroup only.
      if (cursor == null) {
        setHasMoreByGroup(prev => ({ ...prev, [gk]: true }));
      }

      const requestId = ++requestSeqRef.current;
      const queryKeyAtStart = lastQueryKeyRef.current;

      if (DEBUG_GROUPED_TASKS) {
        const rpcParams = buildRpcParams(gk, cursor, sessionParams ?? undefined);
        const rpcParamsSummary = {
          p_group_by: (rpcParams as any).p_group_by,
          p_group_key: (rpcParams as any).p_group_key,
          p_limit: (rpcParams as any).p_limit,
          p_cursor: (rpcParams as any).p_cursor,
          p_row_sort_by: (rpcParams as any).p_row_sort_by,
          p_row_sort_order: (rpcParams as any).p_row_sort_order,
          p_q:
            typeof (rpcParams as any).p_q === 'string'
              ? String((rpcParams as any).p_q).slice(0, 120)
              : (rpcParams as any).p_q,
          p_project_ids: Array.isArray((rpcParams as any).p_project_ids)
            ? `array(len=${(rpcParams as any).p_project_ids.length})`
            : null,
          p_status_names: Array.isArray((rpcParams as any).p_status_names)
            ? `array(len=${(rpcParams as any).p_status_names.length})`
            : null,
          p_assignee_ids: Array.isArray((rpcParams as any).p_assignee_ids)
            ? `array(len=${(rpcParams as any).p_assignee_ids.length})`
            : null,
        };

        console.log('[TaskGroupTasks] performFetchForGroup: before RPC', {
          groupKey: gk,
          cursorKey,
          isFirstPage,
          rpcName: 'task_group_tasks_filtered',
          rpcParamsSummary,
        });
      }

      try {
        const supabase = createClientComponentClient();
        const rpcParams = buildRpcParams(gk, cursor, sessionParams ?? undefined);

        if (DEBUG_GROUPED_ROW_SORT) {
          console.log('[TaskGroupGrouped] task_group_tasks_filtered', {
            group_key: gk,
            reason: mapGroupedFetchReason(triggerSource),
            triggerSource,
            isFirstPage,
            p_row_sort_by: (rpcParams as any).p_row_sort_by,
            p_row_sort_order: (rpcParams as any).p_row_sort_order,
            p_cursor_present: (rpcParams as any).p_cursor != null,
          })
        }

        const { data, error: rpcError } = await supabase.rpc(
          'task_group_tasks_filtered',
          rpcParams,
        );

        const staleByRequestId = false; // no longer applicable (we allow concurrent group requests)
        const staleByQueryKey = queryKeyAtStart !== lastQueryKeyRef.current;
        const staleByGeneration = generationAtStart !== queryGenerationRef.current;

        if (DEBUG_GROUPED_TASKS) {
          const rowsLen = (data as any)?.rows?.length ?? (Array.isArray(data) ? data.length : 0);
          const nextCursor = (data as any)?.next_cursor ?? null;
          console.log('[TaskGroupTasks] performFetchForGroup: after RPC', {
            groupKey: gk,
            rpcError: rpcError ? (rpcError as any).message ?? String(rpcError) : null,
            rowsLen,
            nextCursor,
            requestId,
            staleByRequestId,
            staleByQueryKey,
            staleByGeneration,
          });
        }

        if (staleByGeneration || staleByQueryKey) {
          if (DEBUG_GROUPED_TASKS) {
            console.log('[TaskGroupTasks] Discarding response (stale)', {
              groupKey: gk,
              requestId,
              staleByQueryKey,
              staleByGeneration,
            });
          } else {
            console.log('[TaskGroupTasks] Query shape changed during fetch, discarding response for group', gk);
          }
          return;
        }

        if (searchSessionRef?.current && requestGen !== searchSessionRef.current.gen) {
          if (DEBUG_GROUPED_TASKS) {
            console.log('[TaskGroupTasks] Discarding response (session gen changed)', { groupKey: gk, requestGen, currentGen: searchSessionRef.current.gen });
          }
          return;
        }

        if (rpcError) {
          console.error('[TaskGroupTasks] RPC error for group', gk, rpcError);
          setErrorByGroup(prev => ({
            ...prev,
            [gk]: rpcError.message || 'Failed to fetch tasks for group',
          }));
          setHasMoreByGroup(prev => ({ ...prev, [gk]: false }));
          setCursorByGroup(prev => ({ ...prev, [gk]: null }));
          return;
        }

        const payload = (data as { rows?: TaskListRow[]; next_cursor?: any }) || {};
        const fetchedRows = payload.rows ?? [];
        const newCursor = payload.next_cursor ?? null;

        // Mark this group as having completed at least one page request.
        // This remains true even if the first page is empty (valid "drained" state).
        setLoadedFirstPageByGroup(prev => ({ ...prev, [gk]: true }));
        setHydratedByGroup(prev => ({ ...prev, [gk]: true }));

        setTasksByGroup(prev => {
          const previous = prev[gk] ?? [];
          const existingIds = new Set(previous.map(r => String(r.id)));
          const dedupedNew = fetchedRows.filter(r => !existingIds.has(String(r.id)));
          const combined = isFirstPage ? fetchedRows : [...previous, ...dedupedNew];

          return {
            ...prev,
            [gk]: combined,
          };
        });

        setCursorByGroup(prev => ({ ...prev, [gk]: newCursor }));
        setHasMoreByGroup(prev => ({
          ...prev,
          [gk]: newCursor != null,
        }));
      } catch (err: any) {
        console.error('[TaskGroupTasks] Unexpected error for group', gk, err);
        setErrorByGroup(prev => ({
          ...prev,
          [gk]: err?.message || 'Failed to fetch tasks for group',
        }));
        setHasMoreByGroup(prev => ({ ...prev, [gk]: false }));
        setCursorByGroup(prev => ({ ...prev, [gk]: null }));
      } finally {
        inFlightByGroupRef.current[gk] = false;
        setIsFetchingByGroup(prev => ({ ...prev, [gk]: false }));
      }
    },
    [
      buildRpcParams,
      hasMoreByGroup,
      bootstrapHydratedByGroup,
      hydratedByGroup,
      isEnabled,
      isFetchingByGroup,
      searchSessionRef,
      tasksByGroup,
    ],
  );

  // Reset all groups when the "query shape" changes.
  //
  // ROOT CAUSE (initial URL q not triggering task_group_tasks_filtered):
  // When searchSessionRef is provided, we previously reset ONLY when session gen changed. The gen
  // is bumped in a parent effect that runs when q/project/etc change. On initial load with q from
  // URL, effect ordering or hydration timing could cause our reset effect to run before the parent
  // has updated the ref, or lastSeenSessionGenRef could get out of sync. The fix: always drive
  // reset from the props-based query shape (q, project, filters, etc.), which are available
  // synchronously on first render. searchSessionRef is still used for RPC params at call time.
  useEffect(() => {
    if (!isEnabled) {
      resetState();
      lastSeenSessionGenRef.current = null;
      return;
    }

    const queryKey = JSON.stringify({
      q,
      project,
      filtersString,
      groupBy,
      rowSortBy,
      rowSortOrder,
      perPage,
    });

    if (searchSessionRef?.current != null) {
      const queryShapeChanged = lastQueryKeyRef.current !== queryKey;
      if (!queryShapeChanged) return;
      if (DEBUG_GROUPED_ROW_SORT && lastQueryKeyRef.current) {
        try {
          const prev = JSON.parse(lastQueryKeyRef.current) as { rowSortBy?: string; rowSortOrder?: string }
          const next = JSON.parse(queryKey) as typeof prev
          if (prev.rowSortBy !== next.rowSortBy || prev.rowSortOrder !== next.rowSortOrder) {
            console.log('[TaskGroupGrouped] row sort changed → tasks hook reset (clear cursors / hydration)', {
              prev,
              next,
            })
          }
        } catch {
          /* ignore */
        }
      }
      lastQueryKeyRef.current = queryKey;
      lastSeenSessionGenRef.current = searchSessionRef.current.gen;
    } else {
      lastSeenSessionGenRef.current = null;
      if (lastQueryKeyRef.current === queryKey) return;
      if (DEBUG_GROUPED_ROW_SORT && lastQueryKeyRef.current) {
        try {
          const prev = JSON.parse(lastQueryKeyRef.current) as { rowSortBy?: string; rowSortOrder?: string }
          const next = JSON.parse(queryKey) as typeof prev
          if (prev.rowSortBy !== next.rowSortBy || prev.rowSortOrder !== next.rowSortOrder) {
            console.log('[TaskGroupGrouped] row sort changed → tasks hook reset (clear cursors / hydration)', {
              prev,
              next,
            })
          }
        } catch {
          /* ignore */
        }
      }
      lastQueryKeyRef.current = queryKey;
    }

    if (DEBUG_GROUPED_TASKS) {
      console.log('[TaskGroupTasks] Reset (query shape changed)', {
        queryKey: queryKey.slice(0, 80),
        hasSessionRef: !!searchSessionRef?.current,
      });
    }
    queryGenerationRef.current += 1; // invalidate in-flight responses
    resetState();
  }, [isEnabled, resetState, q, project, filtersString, groupBy, rowSortBy, rowSortOrder, perPage, searchSessionRef]);

  const ensureFirstPage = useCallback(
    (
      groupKey: string,
      triggerSource: GroupFetchTriggerSource = 'unknown',
      context?: RowFetchContext,
    ) => {
      if (!isEnabled) return;
      const gk = String(groupKey);

      const fetching = !!isFetchingByGroup[gk];
      const isHydrated = !!hydratedByGroup[gk];
      const alreadyRequested =
        !!loadedFirstPageByGroup[gk] || firstPageRequestedRef.current.has(gk);
      const hasRows = (tasksByGroup[gk]?.length ?? 0) > 0;
      const hasMoreFlag = hasMoreByGroup[gk];
      const cursor = cursorByGroup[gk] ?? null;
      const firstPageRequested = firstPageRequestedRef.current.has(gk);

      if (DEBUG_GROUPED_TASKS) {
        console.log('[TaskGroupTasks] ensureFirstPage', {
          groupKey: gk,
          isEnabled,
          isHydrated,
          hasRows,
          loadedFirstPageFlag: !!loadedFirstPageByGroup[gk],
          isFetching: fetching,
          hasMoreFlag,
          cursor,
          firstPageRequested,
        });
      }

      if (isHydrated) {
        if (DEBUG_GROUPED_BOOTSTRAP) {
          console.log('[TaskGroupTasks] ensureFirstPage: skip hydrated group', {
            groupKey: gk,
            triggerSource,
            hasRows,
            hasMoreRows: hasMoreFlag,
          });
        }
        return;
      }
      if (alreadyRequested) {
        if (DEBUG_GROUPED_TASKS) {
          console.log('[TaskGroupTasks] ensureFirstPage: early return (alreadyRequested)', { groupKey: gk });
        }
        return;
      }
      if (fetching) {
        if (DEBUG_GROUPED_TASKS) {
          console.log('[TaskGroupTasks] ensureFirstPage: early return (fetching)', { groupKey: gk });
        }
        return;
      }
      if (hasRows && hasMoreFlag === false) {
        return;
      }

      performFetchForGroup(gk, null, true, triggerSource, context);
    },
    [
      hydratedByGroup,
      isEnabled,
      isFetchingByGroup,
      loadedFirstPageByGroup,
      tasksByGroup,
      hasMoreByGroup,
      cursorByGroup,
      performFetchForGroup,
    ],
  );

  const fetchMore = useCallback(
    (
      groupKey: string,
      triggerSource: GroupFetchTriggerSource = 'load more',
      context?: RowFetchContext,
    ) => {
      if (!isEnabled) return;
      const gk = String(groupKey);

      if (isFetchingByGroup[gk]) return;
      if (hasMoreByGroup[gk] === false) return;

      // Pass stored cursor exactly as returned by RPC; don't transform or build from last row.
      const cursor = cursorByGroup[gk] ?? null;
      if (DEBUG_GROUPED_BOOTSTRAP) {
        console.log('[TaskGroupTasks] follow-up task_group_tasks_filtered', {
          group_key: gk,
          reason: triggerSource,
          isBlockingGroup: Boolean(context?.isBlockingGroup),
          areEarlierGroupsFullyDrained:
            typeof context?.areEarlierGroupsFullyDrained === 'boolean'
              ? context.areEarlierGroupsFullyDrained
              : null,
          groupCameFromBootstrap:
            typeof context?.groupCameFromBootstrap === 'boolean'
              ? context.groupCameFromBootstrap
              : Boolean(bootstrapHydratedByGroup[gk]),
          wasHydrated: !!hydratedByGroup[gk],
          rowCount: tasksByGroup[gk]?.length ?? 0,
          hasMoreRows: hasMoreByGroup[gk],
          nextRowCursor: context?.nextRowCursor ?? cursor,
          groupIndex: context?.groupIndex ?? null,
          visibleWindowIndices: context?.visibleWindowIndices ?? null,
          hasCursor: cursor != null,
        });
      }
      performFetchForGroup(gk, cursor, false, triggerSource, context);
    },
    [
      bootstrapHydratedByGroup,
      cursorByGroup,
      hasMoreByGroup,
      hydratedByGroup,
      isEnabled,
      isFetchingByGroup,
      performFetchForGroup,
      tasksByGroup,
    ],
  );

  const hydrateFromBootstrap = useCallback((payload: BootstrapResponse) => {
    const groups = Array.isArray(payload?.groups) ? payload.groups : [];
    const normalized: BootstrapGroup[] = groups
      .filter((group): group is BootstrapGroup => !!group && typeof group.group_key === 'string')
      .map(group => ({
        group_key: String(group.group_key),
        label: typeof group.label === 'string' ? group.label : String(group.group_key),
        is_hydrated: Boolean(group.is_hydrated),
        rows: Array.isArray(group.rows) ? group.rows : [],
        has_more_rows:
          typeof group.has_more_rows === 'boolean' ? group.has_more_rows : null,
        next_row_cursor: (group.next_row_cursor ?? null) as GroupRowCursor,
      }));

    if (DEBUG_GROUPED_BOOTSTRAP) {
      const totalRows = normalized.reduce((sum, group) => sum + (group.rows?.length ?? 0), 0);
      console.log('[TaskGroupTasks] bootstrap hydrate', {
        groups: normalized.length,
        totalRows,
      });
    }
    if (DEBUG_GROUPED_ROW_SORT) {
      console.log('[TaskGroupGrouped] hydrateFromBootstrap (canonical; old row cursors discarded)', {
        groupCount: normalized.length,
        groups: normalized.map(g => ({
          group_key: g.group_key,
          is_hydrated: g.is_hydrated,
          row_count: g.rows?.length ?? 0,
          has_more_rows: g.has_more_rows,
          has_next_row_cursor: g.next_row_cursor != null,
        })),
      })
    }

    setTasksByGroup(() => {
      const next: Record<string, TaskListRow[]> = {};
      for (const group of normalized) next[group.group_key] = group.rows;
      return next;
    });
    setHydratedByGroup(() => {
      const next: Record<string, boolean> = {};
      for (const group of normalized) next[group.group_key] = Boolean(group.is_hydrated);
      return next;
    });
    setBootstrapHydratedByGroup(() => {
      const next: Record<string, boolean> = {};
      for (const group of normalized) next[group.group_key] = true;
      return next;
    });
    setCursorByGroup(() => {
      const next: Record<string, any | null> = {};
      for (const group of normalized) next[group.group_key] = group.next_row_cursor ?? null;
      return next;
    });
    setLoadedFirstPageByGroup(() => {
      const next: Record<string, boolean> = {};
      for (const group of normalized) next[group.group_key] = Boolean(group.is_hydrated);
      return next;
    });
    setPrefetchedFirstPageByGroup(() => {
      const next: Record<string, boolean> = {};
      for (const group of normalized) next[group.group_key] = Boolean(group.is_hydrated);
      return next;
    });
    setHasMoreByGroup(() => {
      const next: Record<string, boolean> = {};
      for (const group of normalized) {
        next[group.group_key] = group.is_hydrated
          ? Boolean(group.has_more_rows)
          : true;
      }
      return next;
    });
    setIsFetchingByGroup(() => {
      const next: Record<string, boolean> = {};
      for (const group of normalized) next[group.group_key] = false;
      return next;
    });
    setErrorByGroup(() => {
      const next: Record<string, string | null> = {};
      for (const group of normalized) next[group.group_key] = null;
      return next;
    });

    inFlightByGroupRef.current = {};
    lastCursorKeyByGroupRef.current = {};
    firstPageRequestedRef.current = new Set(
      normalized.filter(group => group.is_hydrated).map(group => group.group_key),
    );
  }, []);

  const resetAll = useCallback(() => {
    queryGenerationRef.current += 1;
    resetState();
  }, [resetState]);

  return {
    tasksByGroup,
    hydratedByGroup,
    bootstrapHydratedByGroup,
    cursorByGroup,
    loadedFirstPageByGroup,
    prefetchedFirstPageByGroup,
    isLoadingRowsByGroup: isFetchingByGroup,
    hasMoreByGroup,
    isFetchingByGroup,
    errorByGroup,
    ensureFirstPage,
    fetchMore,
    hydrateFromBootstrap,
    resetAll,
  };
}


