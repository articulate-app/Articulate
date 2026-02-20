import type { TaskListRow } from './task-list-view'

export type PlannerEntityType = 'task' | 'suggestion'

export type PlannerEntityFields = {
  /**
   * Disambiguates which table this row belongs to.
   * NOTE: Do not rely on a generic `id` field for cross-entity identity.
   */
  entity_type: PlannerEntityType
  /**
   * Primary key in the underlying table (tasks.id or task_suggestions.id).
   */
  entity_id: number
  /**
   * Stable cross-entity reference when available (e.g. from the planner pipeline).
   */
  source_key: string | null
}

export type SuggestionItem = TaskListRow & {
  kind: 'suggestion'
  /**
   * AI suggestion details (not present on task_list_view rows).
   * These are used by the right-side details pane in Suggestion mode.
   */
  briefing: string | null
  channel_ids: number[]
} & PlannerEntityFields

export type TaskItem = TaskListRow & {
  kind: 'task'
} & PlannerEntityFields

export type PlannerItem = TaskItem | SuggestionItem

export function isSuggestionItem(item: PlannerItem | any): item is SuggestionItem {
  return item?.kind === 'suggestion'
}


