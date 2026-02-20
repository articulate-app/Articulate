import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { TaskListRow } from '@/lib/types/task-list-view';

type GroupOrder = 'asc' | 'desc';
type RowSortOrder = 'asc' | 'desc';

export type GroupedRow = TaskListRow & {
  _group_key: string;
  _group_label: string;
  _group_order_key: string | null;
  _row_order_key: string | null;
};

export interface UseTaskGroupedRowsQueryOptions {
  q: string;
  project?: string;
  filters?: { [key: string]: string | string[] };
  groupBy: string | null;
  groupOrder?: GroupOrder;
  rowSortBy?: string;
  rowSortOrder?: RowSortOrder;
  limit?: number;
  enabled?: boolean;
  editFields?: any;
}

export interface UseTaskGroupedRowsQueryResult {
  rows: GroupedRow[];
  nextCursor: any | null;
  isFetching: boolean;
  hasMore: boolean;
  error: string | null;
  fetchNextPage: () => void;
  reset: () => void;
}

export function useTaskGroupedRowsQuery({
  q,
  project,
  filters = {},
  groupBy,
  groupOrder,
  rowSortBy,
  rowSortOrder = 'desc',
  limit = 100,
  enabled = true,
  editFields,
}: UseTaskGroupedRowsQueryOptions): UseTaskGroupedRowsQueryResult {
  const [rows, setRows] = useState<GroupedRow[]>([]);
  const [nextCursor, setNextCursor] = useState<any | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editFieldsRef = useRef(editFields);
  useEffect(() => {
    editFieldsRef.current = editFields;
  }, [editFields]);

  const filtersString = useMemo(() => JSON.stringify(filters || {}), [filters]);

  const lastQueryKeyRef = useRef<string | null>(null);
  const lastRequestIdRef = useRef(0);

  const isEnabled = enabled && !!groupBy && groupBy !== 'none';

  const buildRpcParams = useCallback(
    (cursor: any | null) => {
      // Map UI sort keys (accessor keys) to view column names for row-level sorting.
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

      return {
        p_q: q && q.trim().length > 0 ? q : null,
        p_project_ids: projectIds ?? null,
        p_status_names: statusNames ?? null,
        p_assignee_ids: assigneeIds ?? null,
        p_content_type_ids: contentTypeIds ?? null,
        p_production_type_ids: productionTypeIds ?? null,
        p_language_ids: languageIds ?? null,
        p_is_overdue: typeof isOverdue === 'boolean' ? isOverdue : null,
        p_is_publication_overdue:
          typeof isPublicationOverdue === 'boolean' ? isPublicationOverdue : null,
        p_group_by: groupBy && groupBy !== 'none' ? groupBy : null,
        p_group_order: groupOrder ?? null,
        p_row_sort_by: mappedRowSortBy ?? null,
        p_row_sort_order: rowSortOrder ?? null,
        p_limit: limit,
        p_cursor: cursor,
      };
    },
    [q, project, filters, groupBy, groupOrder, rowSortBy, rowSortOrder, limit],
  );

  const performFetch = useCallback(
    async (cursor: any | null) => {
      if (!isEnabled) return;

      const requestId = ++lastRequestIdRef.current;
      const queryKeyAtStart = lastQueryKeyRef.current;

      console.log('[TaskGroupedRows] Starting RPC fetch', {
        hasCursor: cursor != null,
        rowsCount: rows.length,
      });

      setIsFetching(true);
      setError(null);

      try {
        const supabase = createClientComponentClient();
        const rpcParams = buildRpcParams(cursor);

        const { data, error: rpcError } = await supabase.rpc(
          'task_grouped_rows_filtered',
          rpcParams,
        );

        if (lastRequestIdRef.current !== requestId) {
          console.log('[TaskGroupedRows] Ignoring stale RPC response');
          return;
        }
        if (queryKeyAtStart !== lastQueryKeyRef.current) {
          console.log('[TaskGroupedRows] Query shape changed during fetch, discarding response');
          return;
        }

        if (rpcError) {
          console.error('[TaskGroupedRows] RPC error:', rpcError);
          setError(rpcError.message || 'Failed to fetch grouped task rows');
          setHasMore(false);
          setNextCursor(null);
          return;
        }

        const payload = (data as { rows?: GroupedRow[]; next_cursor?: any }) || {};
        const fetchedRows = payload.rows ?? [];
        const newCursor = payload.next_cursor ?? null;

        setRows(prev => {
          const combined = cursor ? [...prev, ...fetchedRows] : fetchedRows;

          console.log('[TaskGroupedRows] Completed RPC fetch', {
            fetchedRows: fetchedRows.length,
            totalRows: combined.length,
            hasNextCursor: newCursor != null,
          });

          return combined;
        });

        setNextCursor(newCursor);
        setHasMore(newCursor != null);
      } catch (err: any) {
        console.error('[TaskGroupedRows] Unexpected error during RPC fetch', err);
        setError(err?.message || 'Failed to fetch grouped task rows');
        setHasMore(false);
        setNextCursor(null);
      } finally {
        if (lastRequestIdRef.current === requestId) {
          setIsFetching(false);
        }
      }
    },
    [buildRpcParams, rows.length, isEnabled],
  );

  // Reset and load first page when the "query shape" changes.
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
      rowSortBy,
      rowSortOrder,
      limit,
    });

    if (lastQueryKeyRef.current === queryKey) {
      return;
    }

    lastQueryKeyRef.current = queryKey;
    lastRequestIdRef.current += 1; // invalidate any in-flight responses

    setRows([]);
    setNextCursor(null);
    setHasMore(false);
    setError(null);

    performFetch(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isEnabled,
    q,
    project,
    filtersString,
    groupBy,
    groupOrder,
    rowSortBy,
    rowSortOrder,
    limit,
  ]);

  const fetchNextPage = useCallback(() => {
    if (!isEnabled) return;
    if (isFetching) return;
    if (!hasMore) return;

    performFetch(nextCursor);
  }, [isEnabled, isFetching, hasMore, nextCursor, performFetch]);

  const reset = useCallback(() => {
    setRows([]);
    setNextCursor(null);
    setHasMore(false);
    setError(null);
    if (isEnabled) {
      performFetch(null);
    }
  }, [isEnabled, performFetch]);

  return {
    rows,
    nextCursor,
    isFetching,
    hasMore,
    error,
    fetchNextPage,
    reset,
  };
}



