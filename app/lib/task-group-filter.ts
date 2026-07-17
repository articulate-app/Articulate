import type { GroupByField } from '../store/task-grouping'
import type { TaskFiltersForUrl } from './tasks-filter-url'
import {
  GROUP_KEY_NO_DATE,
  GROUP_KEY_NO_PROJECT,
  GROUP_KEY_UNASSIGNED,
  isNullGroupKey,
} from './task-grouping-drop-config'

export type TaskGroupFilterPatch = Partial<TaskFiltersForUrl>

/**
 * Map an active group header to the canonical task-list filter patch for that group.
 * Returns null when the group cannot be represented as a list filter (e.g. derived buckets).
 */
export function buildTaskGroupFilterPatch(
  groupBy: GroupByField,
  groupKey: string,
  label: string,
): TaskGroupFilterPatch | null {
  if (!groupBy) return null

  switch (groupBy) {
    case 'status':
      if (groupKey === GROUP_KEY_UNASSIGNED) return { status: ['__unassigned__'] }
      return { status: [label] }
    case 'project':
      if (groupKey === GROUP_KEY_NO_PROJECT) return { project: ['__none__'] }
      return { project: [groupKey] }
    case 'assigned_to':
      if (groupKey === GROUP_KEY_UNASSIGNED) return { assignedTo: ['__unassigned__'] }
      return { assignedTo: [groupKey] }
    case 'content_type':
      if (groupKey === GROUP_KEY_UNASSIGNED) return { contentType: ['__unassigned__'] }
      return { contentType: [groupKey] }
    case 'production_type':
      if (groupKey === GROUP_KEY_UNASSIGNED) return { productionType: ['__unassigned__'] }
      return { productionType: [groupKey] }
    case 'language':
      if (groupKey === GROUP_KEY_UNASSIGNED) return { language: ['__unassigned__'] }
      return { language: [groupKey] }
    case 'delivery_date':
      return buildDateGroupFilterPatch('deliveryDate', groupKey)
    case 'publication_date':
      return buildDateGroupFilterPatch('publicationDate', groupKey)
    case 'channels':
      if (isNullGroupKey(groupKey)) return { channels: ['__unassigned__'] }
      return { channels: [label] }
    default:
      return null
  }
}

function buildDateGroupFilterPatch(
  field: 'deliveryDate' | 'publicationDate',
  groupKey: string,
): TaskGroupFilterPatch | null {
  if (groupKey === GROUP_KEY_NO_DATE) {
    return field === 'deliveryDate'
      ? { deliveryDate: {} }
      : { publicationDate: {} }
  }
  if (!/^\d{4}-\d{2}$/.test(groupKey)) return null
  const [year, month] = groupKey.split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null
  const from = new Date(year, month - 1, 1)
  const to = new Date(year, month, 0)
  return field === 'deliveryDate'
    ? { deliveryDate: { from, to } }
    : { publicationDate: { from, to } }
}
