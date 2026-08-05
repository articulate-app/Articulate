import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { SearchSessionRef } from '../../app/lib/types/search-session';
import type { BootstrapResponse } from './use-task-group-tasks-query';
import { getDefaultGroupOrderForGroupBy } from '@/lib/tasks-grouping-url';
import { normalizeCanonicalGroupKey } from '@/lib/task-grouping-drop-config';

type GroupOrder = 'asc' | 'desc';
type RowSortOrder = 'asc' | 'desc';
const DEBUG_GROUPED_BOOTSTRAP = process.env.NODE_ENV === 'development';
/** Orchestration / row-sort reset diagnostics (grouped list). */
const DEBUG_GROUPED_ROW_SORT = process.env.NODE_ENV === 'development';

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

/** Meta RPC returns groups with group_key and label only (no task_count). */
export type TaskGroupMeta = {
  group_key: string;
  label: string;
  task_count?: number;
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
  rowSortBy?: string;
  rowSortOrder?: RowSortOrder;
  bootstrapGroupLimit?: number;
  useBootstrapInitialLoad?: boolean;
  onBootstrapHydrate?: (payload: BootstrapResponse) => void;
}

export interface UseTaskGroupMetaPagedQueryResult {
  groups: TaskGroupMeta[];
  nextCursor: any | null;
  isFetching: boolean;
  hasMore: boolean;
  error: string | null;
  fetchNextPage: () => void;
  isBootstrapping: boolean;
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
  rowSortBy,
  rowSortOrder = 'desc',
  bootstrapGroupLimit,
  useBootstrapInitialLoad = false,
  onBootstrapHydrate,
}: UseTaskGroupMetaPagedQueryOptions): UseTaskGroupMetaPagedQueryResult {
  const [groups, setGroups] = useState<TaskGroupMeta[]>([]);
  const [nextCursor, setNextCursor] = useState<any | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(false);

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
      const explicitGroupOrder = sessionParams?.groupOrder ?? groupOrder;
      const groupOrderVal =
        explicitGroupOrder != null && String(explicitGroupOrder).trim() !== ''
          ? explicitGroupOrder
          : getDefaultGroupOrderForGroupBy(groupByVal);

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

      // Convert content type filter. Accept numeric ID (from pills/filter pane) or title.
      const contentTypeParam = filtersVal['content_type_title'];
      let contentTypeIds: number[] | undefined;
      if (contentTypeParam && editFieldsRef.current?.content_types) {
        const contentTypes = Array.isArray(contentTypeParam) ? contentTypeParam : [contentTypeParam];
        const ids: number[] = [];
        for (const ct of contentTypes) {
          const raw = String(ct).trim();
          const asId = /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
          if (Number.isFinite(asId)) ids.push(asId);
          else {
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
          if (Number.isFinite(asId)) ids.push(asId);
          else {
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

  const buildBootstrapRpcParams = useCallback(
    (sessionParams?: { q: string; project?: string; filters: Record<string, string | string[]>; groupBy: string; groupOrder: string }) => {
      const metaParams = buildRpcParams(null, sessionParams);
      const mappedRowSortBy = rowSortBy ? uiToViewSortMap[rowSortBy] || rowSortBy : null;
      return {
        p_q: metaParams.p_q,
        p_project_ids: metaParams.p_project_ids,
        p_status_names: metaParams.p_status_names,
        p_assignee_ids: metaParams.p_assignee_ids,
        p_content_type_ids: metaParams.p_content_type_ids,
        p_production_type_ids: metaParams.p_production_type_ids,
        p_language_ids: metaParams.p_language_ids,
        p_is_overdue: metaParams.p_is_overdue,
        p_is_publication_overdue: metaParams.p_is_publication_overdue,
        p_group_by: metaParams.p_group_by,
        p_group_order: metaParams.p_group_order,
        p_channels: metaParams.p_channels,
        p_delivery_date_gte: metaParams.p_delivery_date_gte,
        p_delivery_date_lt: metaParams.p_delivery_date_lt,
        p_publication_date_gte: metaParams.p_publication_date_gte,
        p_publication_date_lt: metaParams.p_publication_date_lt,
        p_row_sort_by: mappedRowSortBy,
        p_row_sort_order: rowSortOrder ?? null,
        p_group_limit:
          typeof bootstrapGroupLimit === 'number' && Number.isFinite(bootstrapGroupLimit)
            ? Math.max(1, Math.floor(bootstrapGroupLimit))
            : null,
      };
    },
    [bootstrapGroupLimit, buildRpcParams, rowSortBy, rowSortOrder],
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

      if (DEBUG_GROUPED_BOOTSTRAP) {
        console.log('[TaskGroupMeta] Starting RPC fetch', {
          hasCursor: cursor != null,
          groupsCount: groups.length,
        });
      }

      setIsFetching(true);
      setError(null);

      try {
        const supabase = createClientComponentClient();
        const isBootstrapRequest = useBootstrapInitialLoad ? cursor == null : false;
        if (useBootstrapInitialLoad && !isBootstrapRequest) {
          // Grouped flow now receives all headers from bootstrap. Disable meta pagination.
          setHasMore(false);
          setNextCursor(null);
          return;
        }
        const rpcName = isBootstrapRequest
          ? 'task_group_bootstrap_filtered'
          : 'task_group_meta_paged_filtered';
        const rpcParams = isBootstrapRequest
          ? buildBootstrapRpcParams(sessionParams ?? undefined)
          : buildRpcParams(cursor, sessionParams ?? undefined);
        const groupByForReset = sessionParams?.groupBy ?? groupBy ?? '';
        const explicitGoForReset = sessionParams?.groupOrder ?? groupOrder;
        const resolvedGoForReset =
          explicitGoForReset != null && String(explicitGoForReset).trim() !== ''
            ? explicitGoForReset
            : getDefaultGroupOrderForGroupBy(groupByForReset);
        const resetParamsKey = JSON.stringify({
          q: sessionParams?.q ?? q,
          project: sessionParams?.project ?? project,
          filters: sessionParams?.filters ?? filters,
          groupBy: groupByForReset,
          groupOrder: resolvedGoForReset,
          rowSortBy: rowSortBy ?? null,
          rowSortOrder: rowSortOrder ?? 'desc',
        });

        if (isBootstrapRequest) {
          setIsBootstrapping(true);
          if (DEBUG_GROUPED_BOOTSTRAP) {
            console.log('[TaskGroupMeta] grouped bootstrap start', {
              resetParamsKey,
            });
          }
        } else if (DEBUG_GROUPED_BOOTSTRAP && cursor != null) {
          console.log('[TaskGroupMeta] follow-up task_group_meta_paged_filtered', {
            hasCursor: true,
          });
        }

        let rpcResult = await supabase.rpc(rpcName, rpcParams as any);
        if (
          isBootstrapRequest &&
          rpcResult.error &&
          typeof (rpcParams as any)?.p_group_limit !== 'undefined'
        ) {
          const fallbackParams = { ...(rpcParams as any) };
          delete (fallbackParams as any).p_group_limit;
          if (DEBUG_GROUPED_BOOTSTRAP) {
            console.log('[TaskGroupMeta] bootstrap limit param rejected, retrying without p_group_limit');
          }
          rpcResult = await supabase.rpc(rpcName, fallbackParams);
        }
        const { data, error: rpcError } = rpcResult;

        if (lastRequestIdRef.current !== requestId) {
          if (DEBUG_GROUPED_BOOTSTRAP) console.log('[TaskGroupMeta] Ignoring stale RPC response');
          return;
        }
        if (queryKeyAtStart !== lastQueryKeyRef.current) {
          if (DEBUG_GROUPED_BOOTSTRAP) {
            console.log('[TaskGroupMeta] Query shape changed during fetch, discarding response');
          }
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
            if (DEBUG_GROUPED_BOOTSTRAP) {
              console.log('[TaskGroupMeta] Session gen changed, discarding response');
            }
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

        const isBootstrapResponse = useBootstrapInitialLoad && cursor == null;
        if (isBootstrapResponse) {
          const payload = (data as BootstrapResponse) || { groups: [], next_group_cursor: null };
          if (DEBUG_GROUPED_BOOTSTRAP) {
            console.log(
              '[TaskGroupMeta] raw backend bootstrap order',
              (payload.groups ?? []).map(group => ({
                key: String((group as any)?.group_key ?? ''),
                label: String((group as any)?.label ?? ''),
              })),
            );
          }
          const normalizedBootstrapGroups = (payload.groups ?? []).map(group => {
            const rawKey = String(group.group_key ?? '')
            const canonicalKey = normalizeCanonicalGroupKey(rawKey, groupBy) ?? rawKey
            return {
              group_key: canonicalKey,
              label: typeof group.label === 'string' ? group.label : canonicalKey,
              task_count: undefined,
              rows: Array.isArray(group.rows) ? group.rows : [],
              has_more_rows:
                typeof group.has_more_rows === 'boolean' ? group.has_more_rows : null,
              is_hydrated: Boolean(group.is_hydrated),
              next_row_cursor: group.next_row_cursor ?? null,
            }
          }).reduce<
            Array<{
              group_key: string
              label: string
              task_count: undefined
              rows: any[]
              has_more_rows: boolean | null
              is_hydrated: boolean
              next_row_cursor: any
            }>
          >((acc, group) => {
            const existing = acc.find(g => g.group_key === group.group_key)
            if (!existing) {
              acc.push(group)
              return acc
            }
            const seenIds = new Set(existing.rows.map((r: any) => String(r.id)))
            for (const row of group.rows) {
              if (!seenIds.has(String(row.id))) {
                existing.rows.push(row)
                seenIds.add(String(row.id))
              }
            }
            existing.is_hydrated = existing.is_hydrated || group.is_hydrated
            if (existing.has_more_rows == null) existing.has_more_rows = group.has_more_rows
            else if (group.has_more_rows != null) {
              existing.has_more_rows = existing.has_more_rows || group.has_more_rows
            }
            if (!existing.next_row_cursor && group.next_row_cursor) {
              existing.next_row_cursor = group.next_row_cursor
            }
            // Prefer the human label from backend (e.g. "No Status") over a sentinel.
            if (group.label && group.label !== group.group_key) existing.label = group.label
            return acc
          }, []);
          const totalRows = normalizedBootstrapGroups.reduce(
            (sum, group) => sum + (group.rows?.length ?? 0),
            0,
          );

          onBootstrapHydrate?.({
            groups: normalizedBootstrapGroups,
            next_group_cursor: null,
          });

          const normalizedMetaGroups = normalizedBootstrapGroups.map(group => ({
            group_key: group.group_key,
            label: group.label,
            task_count: group.task_count,
          }));

          setGroups(normalizedMetaGroups);
          setNextCursor(null);
          setHasMore(false);

          if (DEBUG_GROUPED_BOOTSTRAP || DEBUG_GROUPED_ROW_SORT) {
            console.log('[TaskGroupGrouped] task_group_bootstrap_filtered completed (canonical grouped state)', {
              resetParamsKey,
              p_row_sort_by: (rpcParams as any)?.p_row_sort_by ?? null,
              p_row_sort_order: (rpcParams as any)?.p_row_sort_order ?? null,
              groupCount: normalizedMetaGroups.length,
              totalRowCount: totalRows,
              groupKeys: normalizedMetaGroups.map(g => g.group_key),
              hydratedFromBootstrap: normalizedBootstrapGroups
                .filter(g => g.is_hydrated)
                .map(g => ({
                  group_key: g.group_key,
                  has_more_rows: g.has_more_rows,
                  row_count: g.rows?.length ?? 0,
                  has_next_row_cursor: g.next_row_cursor != null,
                })),
            })
          }
          return;
        }

        const payload = (data as { groups?: Array<{ group_key?: unknown; label?: unknown; task_count?: unknown }>; next_cursor?: any }) || {};
        const rawGroups = payload.groups ?? [];
        const newCursor = payload.next_cursor ?? null;

        const normalized = rawGroups.map(g => {
          const rawKey = String(g.group_key ?? '')
          const canonicalKey = normalizeCanonicalGroupKey(rawKey, groupBy) ?? rawKey
          return {
            group_key: canonicalKey,
            label: typeof g.label === 'string' ? g.label : canonicalKey,
            task_count:
              g.task_count == null || Number.isNaN(Number(g.task_count))
                ? undefined
                : Number(g.task_count),
          }
        });

        setGroups(prev => {
          const existingKeys = new Set(prev.map(g => g.group_key));
          const deduped = normalized.filter(g => !existingKeys.has(g.group_key));
          const combined = cursor ? [...prev, ...deduped] : normalized;

          if (DEBUG_GROUPED_BOOTSTRAP) {
            console.log('[TaskGroupMeta] Completed RPC fetch', {
              fetchedGroups: normalized.length,
              totalGroups: combined.length,
              hasNextCursor: newCursor != null,
            });
          }

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
        setIsBootstrapping(false);
      }
    },
    [
      buildRpcParams,
      buildBootstrapRpcParams,
      filters,
      groupBy,
      groupOrder,
      groups.length,
      isEnabled,
      onBootstrapHydrate,
      project,
      q,
      rowSortBy,
      rowSortOrder,
      bootstrapGroupLimit,
      searchSessionRef,
      useBootstrapInitialLoad,
    ],
  );

  // Reset and load first page when the "query shape" changes.
  // IMPORTANT: `rowSortBy` / `rowSortOrder` MUST be part of `queryKey`. If they are omitted, header sort
  // changes re-run this effect (deps) but hit the early return — `task_group_bootstrap_filtered` never
  // runs, group headers stay stale, and `task_group_tasks_filtered` cascades across every group.
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
      rowSortBy: rowSortBy ?? null,
      rowSortOrder: rowSortOrder ?? 'desc',
      bootstrapGroupLimit: bootstrapGroupLimit ?? null,
      useBootstrapInitialLoad: !!useBootstrapInitialLoad,
    });

    if (lastQueryKeyRef.current === queryKey) {
      return;
    }

    if (DEBUG_GROUPED_ROW_SORT && lastQueryKeyRef.current) {
      try {
        const prev = JSON.parse(lastQueryKeyRef.current) as {
          rowSortBy?: string | null
          rowSortOrder?: string | null
        }
        const next = JSON.parse(queryKey) as typeof prev
        if (prev.rowSortBy !== next.rowSortBy || prev.rowSortOrder !== next.rowSortOrder) {
          const viewRowSort = rowSortBy ? uiToViewSortMap[rowSortBy] || rowSortBy : null
          console.log('[TaskGroupGrouped] row sort changed → reset group meta + bootstrap', {
            prevUi: { rowSortBy: prev.rowSortBy, rowSortOrder: prev.rowSortOrder },
            nextUi: { rowSortBy: next.rowSortBy, rowSortOrder: next.rowSortOrder },
            nextRpc: { p_row_sort_by: viewRowSort, p_row_sort_order: next.rowSortOrder },
          })
        }
      } catch {
        /* ignore parse errors */
      }
    }

    lastQueryKeyRef.current = queryKey;
    lastRequestIdRef.current += 1; // invalidate any in-flight responses

    setGroups([]);
    setNextCursor(null);
    setHasMore(false);
    setError(null);

    performFetch(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEnabled, q, project, filtersString, groupBy, groupOrder, rowSortBy, rowSortOrder, limit, bootstrapGroupLimit, useBootstrapInitialLoad]);

  const fetchNextPage = useCallback(() => {
    if (useBootstrapInitialLoad) return;
    if (!isEnabled) return;
    if (isFetching) return;
    if (!hasMore) return;

    performFetch(nextCursor);
  }, [isEnabled, isFetching, hasMore, nextCursor, performFetch, useBootstrapInitialLoad]);

  return {
    groups,
    nextCursor,
    isFetching,
    hasMore,
    error,
    fetchNextPage,
    isBootstrapping,
  };
}



