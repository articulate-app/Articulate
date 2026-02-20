import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { TaskListRow, TaskListFilters, TaskListResponse, RowSortColumn } from './types/task-list-view';

/**
 * Fetch tasks via the grouped+filtered stream RPC.
 *
 * NOTE: This function keeps the old name/signature for compatibility, but it no
 * longer queries `task_list_view`. Pagination is cursor-based in the RPC; when
 * called with `page > 1` we currently fall back to the first page.
 */
export async function fetchTasksFromView(filters: TaskListFilters): Promise<TaskListResponse> {
  const {
    q,
    projectIds,
    statusNames,
    assigneeIds,
    contentTypeIds,
    productionTypeIds,
    languageIds,
    isOverdue,
    isPublicationOverdue,
    groupBy,
    groupOrder,
    rowSortBy,
    rowSortOrder,
    sortBy,    // legacy row sort
    sortOrder, // legacy row sort
    mode,
    page = 1,
    perPage = 50,
  } = filters;

  const supabase = createClientComponentClient();
  if (page > 1) {
    console.warn(
      `[fetchTasksFromView] Called with page=${page}, but RPC pagination is cursor-based. Falling back to first page.`,
    );
  }

  // Normalize inputs: prefer new rowSort* fields; fall back to legacy sortBy/sortOrder.
  const effectiveRowSortBy: RowSortColumn =
    (rowSortBy as RowSortColumn | undefined) || (sortBy as RowSortColumn | undefined) || 'publication_date';
  const effectiveRowSortOrder: 'asc' | 'desc' = rowSortOrder || sortOrder || 'desc';

  const effectiveGroupBy = groupBy && groupBy !== 'none' ? groupBy : 'all';
  const effectiveGroupOrder: 'asc' | 'desc' | null = groupOrder ?? null;

  const rpcParams = {
    p_q: q && q.trim().length > 0 ? q : null,
    p_project_ids: projectIds?.length ? projectIds : null,
    p_status_names: statusNames?.length ? statusNames : null,
    p_assignee_ids: assigneeIds?.length ? assigneeIds : null,
    p_content_type_ids: contentTypeIds?.length ? contentTypeIds : null,
    p_production_type_ids: productionTypeIds?.length ? productionTypeIds : null,
    p_language_ids: languageIds?.length ? languageIds : null,
    p_is_overdue: typeof isOverdue === 'boolean' ? isOverdue : null,
    p_is_publication_overdue: typeof isPublicationOverdue === 'boolean' ? isPublicationOverdue : null,

    // Grouping/sorting
    p_group_by: mode === 'grouped' ? effectiveGroupBy : (effectiveGroupBy || 'all'),
    p_group_order: mode === 'grouped' ? effectiveGroupOrder : null,
    p_row_sort_by: effectiveRowSortBy,
    p_row_sort_order: effectiveRowSortOrder,

    // Cursor pagination
    p_limit: perPage,
    p_cursor: null,

    // Optional extra filters (kept compatible with the grouped stream RPC)
    p_delivery_date_gte: (filters as any).p_delivery_date_gte ?? (filters as any).deliveryDateGte ?? null,
    p_delivery_date_lt: (filters as any).p_delivery_date_lt ?? (filters as any).deliveryDateLt ?? null,
    p_publication_date_gte:
      (filters as any).p_publication_date_gte ?? (filters as any).publicationDateGte ?? null,
    p_publication_date_lt:
      (filters as any).p_publication_date_lt ?? (filters as any).publicationDateLt ?? null,
    p_channels: (filters as any).p_channels ?? (filters as any).channels ?? null,
  };

  const { data, error } = await supabase.rpc('task_list_stream_grouped_v2', {
    ...rpcParams,
    p_stop_at_group_boundary: true,
  } as any);

  if (error) {
    console.error('Failed to fetch tasks from task_list_stream_grouped_v2', error);
    throw error;
  }

  const payload =
    (data as { rows?: (TaskListRow & { _group_key?: string })[]; next_cursor?: any }) || {};
  const rows = payload.rows ?? [];

  return {
    tasks: rows as TaskListRow[],
    total: 0,
    page: 1,
    perPage,
  };
}

/**
 * Map TaskListRow to the format expected by the table component.
 * This maintains compatibility with the existing table structure.
 */
export function mapTaskListRowToTableFormat(row: TaskListRow) {
  return {
    ...row,
    id: row.id, // Keep as number for compatibility
    title: row.title || '',
    assigned_user: row.assigned_to_name
      ? {
          id: row.assigned_to_id || 0,
          full_name: row.assigned_to_name,
          photo: row.assigned_to_photo || null,
        }
      : null,
    projects: row.project_name
      ? {
          id: row.project_id_int || 0,
          name: row.project_name,
          color: row.project_color || undefined,
          logo: row.project_logo || null,
        }
      : null,
    project_statuses: row.project_status_name
      ? { id: row.project_status_id || 0, name: row.project_status_name, color: row.project_status_color || undefined }
      : null,
    content_type_title: row.content_type_title || '',
    production_type_title: row.production_type_title || '',
    language_code: row.language_code || '',
    delivery_date: row.delivery_date || null,
    publication_date: row.publication_date || null,
    updated_at: row.updated_at || null,
    is_overdue: row.is_overdue || false,
    is_publication_overdue: row.is_publication_overdue || false,
  };
}

