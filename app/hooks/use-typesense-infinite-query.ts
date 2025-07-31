import { useState, useEffect, useCallback } from 'react';
import { fetchTasksFromTypesense } from '../lib/fetchTasksFromTypesense';
import { useTypesenseTasksStore } from '../store/typesense-tasks';

interface UseTypesenseInfiniteQueryOptions {
  q: string;
  project?: string;
  filters?: { [key: string]: string | string[] };
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  enabled?: boolean; // New param to control when queries should run
}

// Check if Typesense environment variables are available
const isTypesenseAvailable = () => {
  if (typeof window === 'undefined') return false; // Server-side
  const host = process.env.NEXT_PUBLIC_TYPESENSE_HOST;
  const apiKey = process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_ONLY_API_KEY || process.env.TYPESENSE_SEARCH_ONLY_API_KEY;
  return !!(host && apiKey);
};

// Helper: does the updated task match the current search/filter?
function doesTaskMatchSearch(task: any, q: string, filters: Record<string, string | string[]>, project?: string): boolean {
  // Check project filter
  if (project && String(task.project_id_int) !== String(project)) return false;
  // Check filters (all must match)
  for (const key in filters) {
    const filterVal = filters[key];
    const taskVal = task[key];
    if (Array.isArray(filterVal)) {
      if (!filterVal.includes(taskVal)) return false;
    } else {
      if (String(taskVal) !== String(filterVal)) return false;
    }
  }
  // Check search query (q)
  if (q && q !== '*') {
    const qLower = q.toLowerCase();
    // Search in title, briefing, notes, assigned_to_name, project_name
    const fields = [task.title, task.briefing, task.notes, task.assigned_to_name, task.project_name];
    if (!fields.some(f => typeof f === 'string' && f.toLowerCase().includes(qLower))) {
      return false;
    }
  }
  return true;
}

export function useTypesenseInfiniteQuery({ q, project, filters = {}, pageSize = 25, sortBy = 'publication_timestamp', sortOrder = 'desc', enabled = true }: UseTypesenseInfiniteQueryOptions) {
  const tasks = useTypesenseTasksStore(s => s.tasks);
  const page = useTypesenseTasksStore(s => s.page);
  const hasMore = useTypesenseTasksStore(s => s.hasMore);
  const isFetching = useTypesenseTasksStore(s => s.isFetching);
  const setTasks = useTypesenseTasksStore(s => s.setTasks);
  const updateTask = useTypesenseTasksStore(s => s.updateTask);
  const resetTasks = useTypesenseTasksStore(s => s.resetTasks);
  const setPage = useTypesenseTasksStore(s => s.setPage);
  const setHasMore = useTypesenseTasksStore(s => s.setHasMore);
  const setIsFetching = useTypesenseTasksStore(s => s.setIsFetching);

  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on new search/filter/sort
  useEffect(() => {
    resetTasks(); // This already resets page, hasMore, isFetching
    setIsSuccess(false);
    setError(null);
  }, [q, project, JSON.stringify(filters), pageSize, sortBy, sortOrder, resetTasks]);

  // Fetch data when page or params change
  useEffect(() => {
    if (!enabled) return; // Don't fetch if disabled
    if (isFetching) return; // Don't fetch if already fetching
    if (!isTypesenseAvailable()) {
      console.log('[Typesense] Environment variables not available, skipping fetch');
      return;
    }
    
    let cancelled = false;
    async function fetchPage() {
      if (!hasMore && page > 1) return;
      
      console.log(`[Typesense] Starting fetch for page ${page}, q: "${q}"`);
      setIsFetching(true);
      setError(null);
      
      try {
        const result = await fetchTasksFromTypesense({ q, project, filters, page, perPage: pageSize, sortBy, sortOrder });
        if (cancelled) return;
        
        console.log(`[Typesense] Completed fetch for page ${page}, got ${result.tasks.length} tasks`);
        setTasks(page === 1 ? result.tasks : [...tasks, ...result.tasks]);
        setHasMore(result.tasks.length === pageSize && result.next_page);
        setIsSuccess(true);
      } catch (err: any) {
        console.error(`[Typesense] Error fetching page ${page}:`, err);
        setError(err?.message || 'Failed to fetch from Typesense');
        setIsSuccess(false);
      } finally {
        setIsFetching(false);
      }
    }
    fetchPage();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, q, project, JSON.stringify(filters), page, pageSize, hasMore, sortBy, sortOrder]);

  // Fetch next page
  const fetchNextPage = useCallback(() => {
    if (!isFetching && hasMore) {
      setPage(page + 1);
    }
  }, [isFetching, hasMore, page, setPage]);

  // Optimistically update a task in the list by id, or remove if it no longer matches
  const updateTaskInList = useCallback((updatedTask: any) => {
    if (doesTaskMatchSearch(updatedTask, q, filters, project)) {
      updateTask(updatedTask);
    } else {
      setTasks(prev => prev.filter(task => String(task.id) !== String(updatedTask.id)));
    }
  }, [q, filters, project, updateTask, setTasks]);

  return { data: tasks, isFetching, hasMore, fetchNextPage, isSuccess, error, updateTaskInList };
} 