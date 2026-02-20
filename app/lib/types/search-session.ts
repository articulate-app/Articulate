import type { MutableRefObject } from 'react';

/**
 * Canonical search session snapshot. Both task_group_meta_paged_filtered and
 * task_group_tasks_filtered RPCs read from this ref at call time so they never use stale q/filters.
 */
export type SearchSession = {
  gen: number;
  params: {
    q: string;
    project?: string;
    filters: Record<string, string | string[]>;
    groupBy: string;
    groupOrder: 'asc' | 'desc';
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  };
};

export type SearchSessionRef = MutableRefObject<SearchSession | null>;
