import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { SearchSessionRef } from '../../app/lib/types/search-session';

type GroupOrder = 'asc' | 'desc';

/** Meta RPC returns groups with group_key and label only (no task_count). */
export type TaskGroupMeta = {
  group_key: string;
  label: string;
};

/** Payload for task_group_meta_paged_filtered. Send all keys (null when unused) to avoid PGRST202. */
export type TaskGroupMetaPagedFilteredParams = {
  p_assignee_ids: number[] | null;
  p_channels: number[] | null;
  p_content_type_ids: number[] | null;
  p_cursor: unknown;
  p_delivery_date_gte: string | null;
  p_delivery_date_lt: string | null;
  p_group_by: string | null;
  p_group_order: string | null;
  p_is_overdue: boolean | null;
  p_is_publication_overdue: boolean | null;
  p_language_ids: number[] | null;
  p_limit: number;
  p_production_type_ids: number[] | null;
  p_project_ids: number[] | null;
  p_publication_date_gte: string | null;
  p_publication_date_lt: string | null;
  p_q: string | null;
  p_status_names: string[] | null;
};

export interface UseTaskGroupMetaPagedQueryOptions {
  q: string;
  project?: string;
  filters?: { [key: string]: string | string[] };
  groupBy: string | null;
  groupOrder?: GroupOrder;
  limit?: number;
  enabled?: boolean;
  editFields?: any;
  /** When provided, RPC reads q/filters/etc from this ref at call time (avoids stale closures). */
  searchSessionRef?: SearchSessionRef | null;
}

export interface UseTaskGroupMetaPagedQueryResult {
  groups: TaskGroupMeta[];
  nextCursor: any | null;
  isFetching: boolean;
  hasMore: boolean;
  error: string | null;
  fetchNextPage: () => void;
}

export function useTaskGroupMetaPagedQuery({
  q,
  project,
  filters = {},
  groupBy,
  groupOrder,
  limit = 20,
  enabled = true,
  editFields,
  searchSessionRef,
}: UseTaskGroupMetaPagedQueryOptions): UseTaskGroupMetaPagedQueryResult {
  const [groups, setGroups] = useState<TaskGroupMeta[]>([]);
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
    (cursor: any | null, sessionParams?: { q: string; project?: string; filters: Record<string, string | string[]>; groupBy: string; groupOrder: string }) => {
      const qVal = sessionParams?.q ?? q;
      const projectVal = sessionParams?.project ?? project;
      const filtersVal = sessionParams?.filters ?? filters;
      const groupByVal = sessionParams?.groupBy ?? groupBy ?? '';
      const groupOrderVal = sessionParams?.groupOrder ?? groupOrder ?? 'asc';

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

      // Convert content type filter.
      const contentTypeParam = filtersVal['content_type_title'];
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
      const productionTypeParam = filtersVal['production_type_title'];
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

      // Channels: RPC expects p_channels int[] (channel IDs). Send null if we only have names.
      const channelsParam = filtersVal['channel_names'] ?? filtersVal['channels'];
      let p_channels: number[] | null = null;
      if (channelsParam) {
        const arr = Array.isArray(channelsParam) ? channelsParam : [channelsParam];
        const ids = arr
          .map(c => (typeof c === 'number' ? c : parseInt(String(c), 10)))
          .filter((n): n is number => Number.isFinite(n));
        if (ids.length > 0) p_channels = ids;
      }

      // Date range filters (RPC expects p_delivery_date_gte/lt, p_publication_date_gte/lt).
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

      // Full payload so PostgREST schema cache matches (avoids PGRST202). All keys, null when unused.
      const payload: TaskGroupMetaPagedFilteredParams = {
        p_assignee_ids: assigneeIds ?? null,
        p_channels: p_channels,
        p_content_type_ids: contentTypeIds ?? null,
        p_cursor: cursor ?? null,
        p_delivery_date_gte: p_delivery_date_gte,
        p_delivery_date_lt: p_delivery_date_lt,
        p_group_by: groupByVal && groupByVal !== 'none' ? groupByVal : null,
        p_group_order: groupOrderVal ?? null,
        p_is_overdue: typeof isOverdue === 'boolean' ? isOverdue : null,
        p_is_publication_overdue:
          typeof isPublicationOverdue === 'boolean' ? isPublicationOverdue : null,
        p_language_ids: languageIds ?? null,
        p_limit: limit,
        p_production_type_ids: productionTypeIds ?? null,
        p_project_ids: projectIds ?? null,
        p_publication_date_gte: p_publication_date_gte,
        p_publication_date_lt: p_publication_date_lt,
        p_q: qVal && String(qVal).trim().length > 0 ? String(qVal).trim() : null,
        p_status_names: statusNames ?? null,
      };
      return payload;
    },
    [q, project, filters, groupBy, groupOrder, limit],
  );

  const performFetch = useCallback(
    async (cursor: any | null) => {
      if (!isEnabled) return;

      const requestId = ++lastRequestIdRef.current;
      const queryKeyAtStart = lastQueryKeyRef.current;

      // Snapshot session at call time so RPC uses same q/filters as tasks RPC; ignore response if gen changed.
      const session = searchSessionRef?.current;
      const requestGen = session?.gen ?? 0;
      const sessionParams = session?.params;

      console.log('[TaskGroupMeta] Starting RPC fetch', {
        hasCursor: cursor != null,
        groupsCount: groups.length,
      });

      setIsFetching(true);
      setError(null);

      try {
        const supabase = createClientComponentClient();
        const rpcParams = buildRpcParams(cursor, sessionParams ?? undefined);

        const { data, error: rpcError } = await supabase.rpc(
          'task_group_meta_paged_filtered',
          rpcParams,
        );

        if (lastRequestIdRef.current !== requestId) {
          console.log('[TaskGroupMeta] Ignoring stale RPC response');
          return;
        }
        if (queryKeyAtStart !== lastQueryKeyRef.current) {
          console.log('[TaskGroupMeta] Query shape changed during fetch, discarding response');
          return;
        }
        // When gen changed: only discard if params actually changed. On initial load with q from URL,
        // the parent effect bumps gen after we start the RPC; params are the same, so accept.
        if (searchSessionRef?.current && requestGen !== searchSessionRef.current.gen) {
          const currentParams = searchSessionRef.current.params;
          const paramsMatch =
            sessionParams?.q === currentParams?.q &&
            sessionParams?.project === currentParams?.project &&
            JSON.stringify(sessionParams?.filters ?? {}) === JSON.stringify(currentParams?.filters ?? {}) &&
            sessionParams?.groupBy === currentParams?.groupBy;
          if (!paramsMatch) {
            console.log('[TaskGroupMeta] Session gen changed, discarding response');
            return;
          }
        }

        if (rpcError) {
          console.error('[TaskGroupMeta] RPC error:', rpcError);
          setError(rpcError.message || 'Failed to fetch task group metadata');
          setHasMore(false);
          setNextCursor(null);
          return;
        }

        const payload = (data as { groups?: Array<{ group_key?: unknown; label?: unknown }>; next_cursor?: any }) || {};
        const rawGroups = payload.groups ?? [];
        const newCursor = payload.next_cursor ?? null;

        // Normalize immediately: group_key must be a stable string (backend may return number or string).
        const normalized = rawGroups.map(g => ({
          group_key: String(g.group_key ?? ''),
          label: typeof g.label === 'string' ? g.label : String(g.group_key ?? ''),
        }));

        setGroups(prev => {
          const existingKeys = new Set(prev.map(g => g.group_key));
          const deduped = normalized.filter(g => !existingKeys.has(g.group_key));
          const combined = cursor ? [...prev, ...deduped] : normalized;

          console.log('[TaskGroupMeta] Completed RPC fetch', {
            fetchedGroups: normalized.length,
            totalGroups: combined.length,
            hasNextCursor: newCursor != null,
          });

          return combined;
        });

        setNextCursor(newCursor);
        setHasMore(newCursor != null);
      } catch (err: any) {
        console.error('[TaskGroupMeta] Unexpected error during RPC fetch', err);
        setError(err?.message || 'Failed to fetch task group metadata');
        setHasMore(false);
        setNextCursor(null);
      } finally {
        if (lastRequestIdRef.current === requestId) {
          setIsFetching(false);
        }
      }
    },
    [buildRpcParams, groups.length, isEnabled, searchSessionRef],
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
      limit,
    });

    if (lastQueryKeyRef.current === queryKey) {
      return;
    }

    lastQueryKeyRef.current = queryKey;
    lastRequestIdRef.current += 1; // invalidate any in-flight responses

    setGroups([]);
    setNextCursor(null);
    setHasMore(false);
    setError(null);

    performFetch(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEnabled, q, project, filtersString, groupBy, groupOrder, limit]);

  const fetchNextPage = useCallback(() => {
    if (!isEnabled) return;
    if (isFetching) return;
    if (!hasMore) return;

    performFetch(nextCursor);
  }, [isEnabled, isFetching, hasMore, nextCursor, performFetch]);

  return {
    groups,
    nextCursor,
    isFetching,
    hasMore,
    error,
    fetchNextPage,
  };
}



