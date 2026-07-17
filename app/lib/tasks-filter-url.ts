/**
 * Canonical filter → URL pipeline for tasks.
 * Used by BOTH pill filters (FilterCascadingDropdown, getActiveFilterBadges) and filter pane (TaskFilters).
 *
 * Pipeline:
 *   PILL CLICK / PANE APPLY
 *     → setFilters(newFilters)  (store)
 *     → buildFilterSearchParams(currentParams, newFilters)
 *     → router.replace(pathname + '?' + newParams)
 *     → useSearchParams() updates → useTasksUrlFilters() / unified-grouped-task-list urlFilters change
 *     → queryKey/variables change → refetch task_group_tasks_filtered + task_group_meta_paged_filtered
 */

import { WORKSPACE_OBJECT_QUERY_KEY } from './search-routing';

export type TaskFiltersForUrl = {
  assignedTo: string[];
  status: string[];
  deliveryDate: { from?: Date; to?: Date };
  publicationDate: { from?: Date; to?: Date };
  project: string[];
  contentType: string[];
  productionType: string[];
  language: string[];
  channels: string[];
  overdueStatus: string[];
};

const FILTER_URL_KEYS = [
  'assignedTo',
  'status',
  'project',
  'contentType',
  'productionType',
  'language',
  'channels',
  'overdueStatus',
  'deliveryDateFrom',
  'deliveryDateTo',
  'publicationDateFrom',
  'publicationDateTo',
] as const;

/**
 * Build new URLSearchParams with filter keys replaced by newFilters.
 * Same logic as pill updateUrl: clear filter keys, then set from newFilters.
 * Preserves all other params (tab, tasksView, q, showTasks, showSuggestions, etc.)
 * so project scope (tab=tasks, etc.) is preserved.
 */
export function buildFilterSearchParams(
  currentParams: URLSearchParams,
  newFilters: TaskFiltersForUrl
): URLSearchParams {
  const newParams = new URLSearchParams(currentParams.toString());
  FILTER_URL_KEYS.forEach((key) => newParams.delete(key));

  if (newFilters.assignedTo?.length) newParams.set('assignedTo', newFilters.assignedTo.join(','));
  if (newFilters.status?.length) newParams.set('status', newFilters.status.join(','));
  if (newFilters.project?.length) newParams.set('project', newFilters.project.join(','));
  if (newFilters.contentType?.length) newParams.set('contentType', newFilters.contentType.join(','));
  if (newFilters.productionType?.length) newParams.set('productionType', newFilters.productionType.join(','));
  if (newFilters.language?.length) newParams.set('language', newFilters.language.join(','));
  if (newFilters.channels?.length) newParams.set('channels', newFilters.channels.join(','));
  if (newFilters.overdueStatus?.length) newParams.set('overdueStatus', newFilters.overdueStatus.join(','));
  if (newFilters.deliveryDate?.from) {
    const d = newFilters.deliveryDate.from;
    newParams.set('deliveryDateFrom', d instanceof Date ? d.toISOString().slice(0, 10) : String(d));
  }
  if (newFilters.deliveryDate?.to) {
    const d = newFilters.deliveryDate.to;
    newParams.set('deliveryDateTo', d instanceof Date ? d.toISOString().slice(0, 10) : String(d));
  }
  if (newFilters.publicationDate?.from) {
    const d = newFilters.publicationDate.from;
    newParams.set('publicationDateFrom', d instanceof Date ? d.toISOString().slice(0, 10) : String(d));
  }
  if (newFilters.publicationDate?.to) {
    const d = newFilters.publicationDate.to;
    newParams.set('publicationDateTo', d instanceof Date ? d.toISOString().slice(0, 10) : String(d));
  }
  return newParams;
}

/**
 * Build the URL for a cross-pane "See more" action that should land on the task list
 * (e.g. User Overview cards). Applies the task filters AND forces the left/main list to the
 * Tasks object + grouped-list mode, so the left pane immediately renders the filtered tasks
 * even when it was showing another object (Projects, Users, etc.).
 *
 * - `object=task` is the canonical left/main-list contract (resolveLeftPaneObject / buildObjectRoute).
 *   It does not touch the right/center detail pane (driven by right*Id / center*Id), so the open
 *   user and right pane state (layout, rightView, taskAiOpen, aiThreadId, rightUserId) are preserved.
 * - mode/groupBy/groupOrder mirror TasksLayout's "task-default-grouped-mode" contract and are only
 *   set when absent, so an intentionally-chosen grouping is respected.
 */
export function buildSeeMoreTasksSearchParams(
  currentParams: URLSearchParams,
  newFilters: TaskFiltersForUrl
): URLSearchParams {
  const next = buildFilterSearchParams(currentParams, newFilters);
  next.set(WORKSPACE_OBJECT_QUERY_KEY, 'task');
  if (!next.get('mode')) next.set('mode', 'grouped');
  if (!next.get('groupBy')) next.set('groupBy', 'delivery_date');
  if (!next.get('groupOrder')) next.set('groupOrder', 'desc');
  return next;
}
