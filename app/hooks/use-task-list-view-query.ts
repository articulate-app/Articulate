import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchTasksFromView, mapTaskListRowToTableFormat } from '../lib/fetchTasksFromView';
import type { TaskListFilters } from '../lib/types/task-list-view';

interface UseTaskListViewQueryOptions {
  q: string;
  project?: string;
  filters?: { [key: string]: string | string[] };
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  groupBy?: string | null; // Grouping key (e.g., 'delivery_date', 'status', etc.)
  groupOrder?: 'asc' | 'desc'; // Explicit group order when grouped
  mode?: 'grouped' | 'list'; // Explicit mode; when omitted we infer from groupBy
  enabled?: boolean;
  editFields?: any; // For mapping names to IDs
}

// Helper: does the updated task match the current search/filter?
function doesTaskMatchSearch(task: any, q: string, filters: Record<string, string | string[]>, project?: string): boolean {
  // Check project filter - can be single ID or comma-separated list
  if (project) {
    const projectIds = project.split(',').map(p => p.trim()).filter(Boolean);
    const taskProjectId = String(task.project_id_int || '');
    if (!projectIds.includes(taskProjectId)) {
      return false;
    }
  }
  
  // Check filters (all must match)
  // Map filter keys to task object structure
  for (const key in filters) {
    const filterVal = filters[key];
    let taskVal: any = null;
    
    // Map filter field names to task object structure
    if (key === 'project_status_name' || key === 'status') {
      // Task has project_statuses.name or project_status_name
      taskVal = task.project_status_name || task.project_statuses?.name || null;
    } else if (key === 'assigned_to_name') {
      // Task has assigned_to_name or assigned_user.full_name
      taskVal = task.assigned_to_name || task.assigned_user?.full_name || null;
    } else if (key === 'project_name') {
      // Task has project_name or projects.name
      taskVal = task.project_name || task.projects?.name || null;
    } else if (key === 'content_type_title') {
      taskVal = task.content_type_title || null;
    } else if (key === 'production_type_title') {
      taskVal = task.production_type_title || null;
    } else if (key === 'language_code') {
      taskVal = task.language_code || null;
    } else if (key === 'channel_names') {
      // Channels might be an array or string
      taskVal = Array.isArray(task.channel_names) ? task.channel_names.join(',') : task.channel_names || null;
    } else {
      // Fallback to direct property access
      taskVal = task[key] || null;
    }
    
    if (Array.isArray(filterVal)) {
      // For array filters, check if any value matches
      const taskValStr = String(taskVal || '');
      if (!filterVal.some(fv => String(fv) === taskValStr)) {
        return false;
      }
    } else {
      // For single value filters, check exact match
      if (String(taskVal || '') !== String(filterVal)) {
        return false;
      }
    }
  }
  
  // Check search query (q) - only if there's a search term
  if (q && q.trim().length > 0 && q !== '*') {
    const qLower = q.toLowerCase();
    // Search in title, briefing, notes, assigned_to_name, project_name
    const fields = [
      task.title,
      task.briefing,
      task.notes,
      task.assigned_to_name || task.assigned_user?.full_name,
      task.project_name || task.projects?.name
    ];
    if (!fields.some(f => typeof f === 'string' && f.toLowerCase().includes(qLower))) {
      return false;
    }
  }
  
  return true;
}

export function useTaskListViewQuery({ 
  q, 
  project, 
  filters = {}, 
  pageSize = 25, 
  sortBy, // No default - undefined means use grouping-based sort
  sortOrder = 'desc',
  groupBy = null,
  groupOrder,
  mode,
  enabled = true,
  editFields
}: UseTaskListViewQueryOptions) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  
  // Memoize editFields to prevent unnecessary re-renders
  const editFieldsRef = useRef(editFields);
  useEffect(() => {
    editFieldsRef.current = editFields;
  }, [editFields]);
  
  // Memoize filters string to prevent unnecessary resets
  const filtersString = useMemo(() => JSON.stringify(filters), [filters]);

  // Track the "query shape" so we can detect when search/filter/sort/grouping changes.
  // This lets us reset pagination *synchronously* in the fetch effect, avoiding races
  // where we would otherwise request the old page (e.g. page 2) with new params.
  const lastQueryKeyRef = useRef<string | null>(null);

  // Monotonic request id so we can ignore stale responses when params change quickly
  // (e.g. asc → desc → asc groupOrder toggles).
  const lastRequestIdRef = useRef(0);

  // Note: Filter normalization is now done inline in the useEffect to avoid dependency issues
  // Keeping this function for potential future use, but it's not currently used
  const _normalizedFilters = useCallback((): TaskListFilters => {
    const result: TaskListFilters = {
      q: q && q.trim().length > 0 ? q : undefined,
      page: page,
      perPage: pageSize,
      // Map publication_timestamp to publication_date for compatibility
      sortBy: (sortBy === 'publication_timestamp' ? 'publication_date' : sortBy) as "publication_date" | "delivery_date" | "updated_at",
      sortOrder: sortOrder as "asc" | "desc",
    };

    // Convert project filter
    if (project) {
      const projectId = parseInt(project, 10);
      if (!isNaN(projectId)) {
        result.projectIds = [projectId];
      }
    }

    // Convert status filter (from project_status_name to project_status_id)
    const statusParam = filters['project_status_name'] || filters['status'];
    if (statusParam) {
      const statuses = Array.isArray(statusParam) ? statusParam : [statusParam];
      const statusIds: number[] = [];
      
      for (const s of statuses) {
        // Try parsing as ID first
        const id = parseInt(String(s), 10);
        if (!isNaN(id)) {
          statusIds.push(id);
        } else if (editFields?.project_statuses) {
          // If it's a name, look up the ID from editFields
          const status = editFields.project_statuses.find((st: any) => st.name === s);
          if (status?.id) {
            statusIds.push(Number(status.id));
          }
        }
      }
      
      // NOTE: We no longer send statusIds to the PostgREST view; status
      // filtering is now done by name (statusNames) in fetchTasksFromView.
      // This block is kept for potential future use, but we intentionally
      // do not assign result.statusIds to avoid type drift.
    }

    // Convert assignee filter (from assigned_to_name to assigned_to_id)
    const assigneeParam = filters['assigned_to_name'];
    if (assigneeParam) {
      const assignees = Array.isArray(assigneeParam) ? assigneeParam : [assigneeParam];
      const assigneeIds: number[] = [];
      
      for (const a of assignees) {
        // Try parsing as ID first
        const id = parseInt(String(a), 10);
        if (!isNaN(id)) {
          assigneeIds.push(id);
        } else if (editFields?.project_watchers) {
          // If it's a name, look up the ID from editFields
          const watcher = editFields.project_watchers.find((w: any) => w.users?.full_name === a);
          if (watcher?.user_id) {
            assigneeIds.push(Number(watcher.user_id));
          }
        }
      }
      
      if (assigneeIds.length > 0) {
        result.assigneeIds = assigneeIds;
      }
    }

    // Convert content type filter
    const contentTypeParam = filters['content_type_title'];
    if (contentTypeParam && editFields?.content_types) {
      const contentTypes = Array.isArray(contentTypeParam) ? contentTypeParam : [contentTypeParam];
      const contentTypeIds: number[] = [];
      
      for (const ct of contentTypes) {
        const contentType = editFields.content_types.find((c: any) => c.title === ct);
        if (contentType?.id) {
          contentTypeIds.push(Number(contentType.id));
        }
      }
      
      if (contentTypeIds.length > 0) {
        result.contentTypeIds = contentTypeIds;
      }
    }

    // Convert production type filter
    const productionTypeParam = filters['production_type_title'];
    if (productionTypeParam && editFields?.production_types) {
      const productionTypes = Array.isArray(productionTypeParam) ? productionTypeParam : [productionTypeParam];
      const productionTypeIds: number[] = [];
      
      for (const pt of productionTypes) {
        const productionType = editFields.production_types.find((p: any) => p.title === pt);
        if (productionType?.id) {
          productionTypeIds.push(Number(productionType.id));
        }
      }
      
      if (productionTypeIds.length > 0) {
        result.productionTypeIds = productionTypeIds;
      }
    }

    // Convert language filter
    const languageParam = filters['language_code'];
    if (languageParam && editFields?.languages) {
      const languages = Array.isArray(languageParam) ? languageParam : [languageParam];
      const languageIds: number[] = [];
      
      for (const lang of languages) {
        const language = editFields.languages.find((l: any) => l.long_name === lang || l.code === lang);
        if (language?.id) {
          languageIds.push(Number(language.id));
        }
      }
      
      if (languageIds.length > 0) {
        result.languageIds = languageIds;
      }
    }

    // Handle overdue status filters
    const overdueStatusParam = filters['overdueStatus'];
    if (overdueStatusParam) {
      const overdueStatuses = Array.isArray(overdueStatusParam) ? overdueStatusParam : [overdueStatusParam];
      if (overdueStatuses.includes('delivery_overdue')) {
        result.isOverdue = true;
      }
      if (overdueStatuses.includes('publication_overdue')) {
        result.isPublicationOverdue = true;
      }
    }

    return result;
  }, [q, project, filters, page, pageSize, sortBy, sortOrder, editFields]);

  // Fetch data when page or params change
  useEffect(() => {
    if (!enabled) return;

    // Build a stable key representing the current "query shape"
    const queryKey = JSON.stringify({
      q,
      project,
      filtersString,
      pageSize,
      sortBy,
      sortOrder,
      groupBy,
      groupOrder,
      mode,
    });

    const isNewQuery = lastQueryKeyRef.current !== queryKey;
    if (isNewQuery) {
      // New search/filter/sort/grouping: reset pagination & status state.
      lastQueryKeyRef.current = queryKey;
      if (page !== 1) {
        setPage(1);
      }
    // For grouped views, clear out old rows so the UI can rebuild from the
    // freshly sorted first page (e.g. when flipping groupOrder asc↔desc).
    if (mode === 'grouped' || (groupBy && groupBy !== 'none')) {
      setTasks([]);
    }
      setHasMore(true);
      setIsSuccess(false);
      setError(null);
      setTotal(0);
    }

    // For an in-flight *new* query, we always want to proceed, even if the previous
    // query was still fetching or had hasMore=false. For unchanged queries, keep
    // the existing guards to avoid duplicate / out-of-range requests.
    if (!isNewQuery && isFetching) {
      console.log(`[TaskListView] Skipping fetch - already fetching`);
      return;
    }
    if (!isNewQuery && !hasMore && page > 1) {
      console.log(`[TaskListView] Skipping fetch - no more pages (hasMore=${hasMore}, page=${page})`);
      return;
    }

    let cancelled = false;
    const currentPage = isNewQuery ? 1 : page; // First page for new queries
    const requestId = ++lastRequestIdRef.current;
    async function fetchPage() {
      console.log(`[TaskListView] Starting fetch for page ${currentPage}, q: "${q}"`);
      setIsFetching(true);
      setError(null);
      
      try {
        // Map UI sort keys (accessor keys) to view column names for row-level sorting
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

        const mappedRowSortBy = sortBy ? (uiToViewSortMap[sortBy] || sortBy) : undefined;

        const filterParams: TaskListFilters = {
          q: q && q.trim().length > 0 ? q : undefined,
          page: currentPage, // Use captured page value
          perPage: pageSize,
          // Use new explicit grouping/sorting model
          groupBy: groupBy || undefined,
          groupOrder: groupOrder, // may be undefined – fetchTasksFromView will pick sensible defaults
          rowSortBy: mappedRowSortBy as any, // view column for row-level sort
          rowSortOrder: sortOrder as "asc" | "desc",
          mode: mode || (groupBy && groupBy !== 'none' ? 'grouped' : 'list'),
        };
        
        console.log(`[TaskListView] Filter params:`, {
          q: filterParams.q,
          projectIds: filterParams.projectIds,
          statusNames: filterParams.statusNames,
          assigneeIds: filterParams.assigneeIds,
          sortBy: filterParams.sortBy,
          sortOrder: filterParams.sortOrder,
          page: filterParams.page,
          perPage: filterParams.perPage,
        });

        // Convert project filter - can be single ID or comma-separated list
        if (project) {
          const projectIds = project.split(',').map(p => parseInt(p.trim(), 10)).filter(id => !isNaN(id));
          if (projectIds.length > 0) {
            filterParams.projectIds = projectIds;
            console.log(`[TaskListView] Converted project filter:`, { project, projectIds });
          }
        }

        // Convert status filter - filter by name directly (one name can have multiple IDs)
        const statusParam = filters['project_status_name'] || filters['status'];
        if (statusParam) {
          const statuses = Array.isArray(statusParam) ? statusParam : [statusParam];
          // Filter by name directly, not by ID
          const statusNames = statuses.filter(s => typeof s === 'string' && s.trim().length > 0);
          
          if (statusNames.length > 0) {
            filterParams.statusNames = statusNames;
            console.log(`[TaskListView] Using status filter by name:`, { statusParam, statusNames });
          }
        }

        // Convert assignee filter
        const assigneeParam = filters['assigned_to_name'];
        if (assigneeParam) {
          const assignees = Array.isArray(assigneeParam) ? assigneeParam : [assigneeParam];
          const assigneeIds: number[] = [];
          
          for (const a of assignees) {
            const id = parseInt(String(a), 10);
            if (!isNaN(id)) {
              assigneeIds.push(id);
            } else if (editFieldsRef.current?.project_watchers) {
              const watcher = editFieldsRef.current.project_watchers.find((w: any) => w.users?.full_name === a);
              if (watcher?.user_id) {
                assigneeIds.push(Number(watcher.user_id));
              }
            }
          }
          
          if (assigneeIds.length > 0) {
            filterParams.assigneeIds = assigneeIds;
          }
        }

        // Convert content type filter
        const contentTypeParam = filters['content_type_title'];
        if (contentTypeParam && editFieldsRef.current?.content_types) {
          const contentTypes = Array.isArray(contentTypeParam) ? contentTypeParam : [contentTypeParam];
          const contentTypeIds: number[] = [];
          
          for (const ct of contentTypes) {
            const contentType = editFieldsRef.current.content_types.find((c: any) => c.title === ct);
            if (contentType?.id) {
              contentTypeIds.push(Number(contentType.id));
            }
          }
          
          if (contentTypeIds.length > 0) {
            filterParams.contentTypeIds = contentTypeIds;
          }
        }

        // Convert production type filter
        const productionTypeParam = filters['production_type_title'];
        if (productionTypeParam && editFieldsRef.current?.production_types) {
          const productionTypes = Array.isArray(productionTypeParam) ? productionTypeParam : [productionTypeParam];
          const productionTypeIds: number[] = [];
          
          for (const pt of productionTypes) {
            const productionType = editFieldsRef.current.production_types.find((p: any) => p.title === pt);
            if (productionType?.id) {
              productionTypeIds.push(Number(productionType.id));
            }
          }
          
          if (productionTypeIds.length > 0) {
            filterParams.productionTypeIds = productionTypeIds;
          }
        }

        // Convert language filter
        const languageParam = filters['language_code'];
        if (languageParam && editFieldsRef.current?.languages) {
          const languages = Array.isArray(languageParam) ? languageParam : [languageParam];
          const languageIds: number[] = [];
          
          for (const lang of languages) {
            const language = editFieldsRef.current.languages.find((l: any) => l.long_name === lang || l.code === lang);
            if (language?.id) {
              languageIds.push(Number(language.id));
            }
          }
          
          if (languageIds.length > 0) {
            filterParams.languageIds = languageIds;
          }
        }

        // Handle overdue status filters
        const overdueStatusParam = filters['overdueStatus'];
        if (overdueStatusParam) {
          const overdueStatuses = Array.isArray(overdueStatusParam) ? overdueStatusParam : [overdueStatusParam];
          if (overdueStatuses.includes('delivery_overdue')) {
            filterParams.isOverdue = true;
          }
          if (overdueStatuses.includes('publication_overdue')) {
            filterParams.isPublicationOverdue = true;
          }
        }

        const result = await fetchTasksFromView(filterParams);
        
        if (cancelled) return;
        // Ignore stale responses (params changed while this request was in flight)
        if (lastRequestIdRef.current !== requestId) {
          console.log('[TaskListView] Ignoring stale response for page', currentPage);
          return;
        }
        
        console.log(`[TaskListView] Completed fetch for page ${currentPage}, got ${result.tasks.length} tasks, total: ${result.total}`);
        
        // Map rows to table format
        const mappedTasks = result.tasks.map(mapTaskListRowToTableFormat);
        
        // Use functional update to avoid stale closure issues
        // Check the current page state to determine if we should replace or append
        setTasks(prev => {
          const shouldReplace = currentPage === 1;
          console.log(`[TaskListView] Updating tasks: currentPage=${currentPage}, shouldReplace=${shouldReplace}, prev.length=${prev.length}, new.length=${mappedTasks.length}`);
          const newTasks = shouldReplace ? mappedTasks : [...prev, ...mappedTasks];
          console.log(`[TaskListView] Final tasks length: ${newTasks.length}`);
          
          // Calculate hasMore based on the new tasks length
          // hasMore = true if we got a full page AND there are more tasks in the total
          const newHasMore = result.tasks.length === pageSize && newTasks.length < result.total;
          setHasMore(newHasMore);
          console.log(`[TaskListView] hasMore calculation:`, {
            tasksReturned: result.tasks.length,
            pageSize,
            totalLoaded: newTasks.length,
            total: result.total,
            hasMore: newHasMore
          });
          
          return newTasks;
        });
        setTotal(result.total);
        setIsSuccess(true);
      } catch (err: any) {
        if (cancelled) return;
        if (lastRequestIdRef.current !== requestId) {
          console.warn('[TaskListView] Ignoring stale error for page', currentPage);
          return;
        }
        console.error(`[TaskListView] Error fetching page ${currentPage}:`, err);
        console.error(`[TaskListView] Error details:`, {
          message: err?.message,
          details: err?.details,
          hint: err?.hint,
          code: err?.code
        });

        // Handle PostgREST range error gracefully:
        // If offset is beyond available rows (e.g., after filters/search shrink the result set),
        // reset to page 1 and try again, instead of leaving the UI blank.
        if (err?.code === 'PGRST103' && currentPage > 1) {
          console.warn('[TaskListView] Received PGRST103 for page', currentPage, '- resetting to page 1');
          setPage(1);
          setHasMore(true);
        } else {
          setError(err?.message || 'Failed to fetch tasks from view');
          setIsSuccess(false);
          setHasMore(false);
        }
      } finally {
        if (!cancelled && lastRequestIdRef.current === requestId) {
          setIsFetching(false);
        }
      }
    }
    fetchPage();
    return () => { 
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, q, project, filtersString, page, pageSize, sortBy, sortOrder, groupBy, groupOrder, mode]);

  // Fetch next page
  const fetchNextPage = useCallback(() => {
    if (!isFetching && hasMore) {
      setPage(prev => prev + 1);
    }
  }, [isFetching, hasMore]);

  // Optimistically update a task in the list by id, add if new and matches, or remove if it no longer matches
  const updateTaskInList = useCallback((updatedTask: any) => {
    if (doesTaskMatchSearch(updatedTask, q, filters, project)) {
      // Check if task already exists in the list
      const existingTask = tasks.find(task => String(task.id) === String(updatedTask.id));
      if (existingTask) {
        // Update existing task
        setTasks(prev => prev.map(task => 
          String(task.id) === String(updatedTask.id) ? updatedTask : task
        ));
      } else {
        // Add new task at the beginning (new tasks typically appear at the top)
        setTasks(prev => [updatedTask, ...prev]);
      }
    } else {
      // Remove task if it no longer matches the search/filter criteria
      setTasks(prev => prev.filter(task => String(task.id) !== String(updatedTask.id)));
    }
  }, [q, filters, project, tasks]);

  return { 
    data: tasks, 
    isFetching, 
    hasMore, 
    fetchNextPage, 
    isSuccess, 
    error, 
    updateTaskInList,
    total 
  };
}

