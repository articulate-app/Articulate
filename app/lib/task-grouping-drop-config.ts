import type { GroupByField } from '../store/task-grouping'
import { computeGroupKeyForTask } from '../../src/hooks/use-task-group-tasks-query'
import type { TaskListRow } from './types/task-list-view'

export const GROUP_KEY_UNASSIGNED = '__unassigned__'
export const GROUP_KEY_NO_PROJECT = '__no_project__'
export const GROUP_KEY_NO_DATE = '__no_date__'

/** Internal DnD-only sentinel when a null grouped value must appear in a string id. Never sent to the API. */
export const NULL_GROUP_DND_VALUE = '__null__'

const LEGACY_NULL_GROUP_ALIASES: Record<string, string> = {
  none: GROUP_KEY_NO_PROJECT,
  unassigned: GROUP_KEY_UNASSIGNED,
  'no-date': GROUP_KEY_NO_DATE,
  'no_date': GROUP_KEY_NO_DATE,
  'no-status': GROUP_KEY_UNASSIGNED,
  'no_status': GROUP_KEY_UNASSIGNED,
}

export function getNullGroupKeyForField(
  groupBy: GroupByField | string | null | undefined,
): string | null {
  switch (groupBy) {
    case 'project':
      return GROUP_KEY_NO_PROJECT
    case 'delivery_date':
    case 'publication_date':
      return GROUP_KEY_NO_DATE
    case 'assigned_to':
    case 'status':
    case 'content_type':
    case 'production_type':
    case 'language':
      return GROUP_KEY_UNASSIGNED
    default:
      return null
  }
}

/**
 * Normalize any raw group key (including null, empty, legacy aliases) to the canonical sentinel
 * used for grouping, DnD, and optimistic cache updates.
 */
export function normalizeCanonicalGroupKey(
  raw: string | null | undefined,
  groupBy: GroupByField | string | null | undefined,
): string | null {
  if (raw === undefined) return null
  if (raw === null) return getNullGroupKeyForField(groupBy)
  const trimmed = String(raw).trim()
  if (trimmed.length === 0 || trimmed === 'null' || trimmed === NULL_GROUP_DND_VALUE) {
    return getNullGroupKeyForField(groupBy)
  }
  const legacy = LEGACY_NULL_GROUP_ALIASES[trimmed]
  if (legacy) return legacy
  return trimmed
}

export function encodeGroupKeyForDndId(
  groupKey: string,
  groupBy?: GroupByField | string | null,
): string {
  const canonical = normalizeCanonicalGroupKey(groupKey, groupBy) ?? groupKey
  if (isNullGroupKey(canonical)) return NULL_GROUP_DND_VALUE
  return canonical
}

export function decodeGroupKeyFromDndId(
  encoded: string,
  groupBy?: GroupByField | string | null,
): string | null {
  if (encoded === NULL_GROUP_DND_VALUE) {
    return getNullGroupKeyForField(groupBy)
  }
  return normalizeCanonicalGroupKey(encoded, groupBy)
}

const EXACT_MONTH_GROUP_KEY = /^\d{4}-\d{2}$/

/** Known derived / non-writable date bucket keys (not exact YYYY-MM months). */
export const DERIVED_DATE_GROUP_KEYS = new Set([
  'overdue',
  'later',
  'this_week',
  'next_week',
  'this_month',
  'next_month',
  '__overdue__',
  '__later__',
])

export type TaskGroupingEditFields = {
  project_statuses?: Array<{
    id: number
    name: string
    color?: string | null
    is_closed?: boolean | null
    is_publication_closed?: boolean | null
  }>
  projects?: Array<{ id: number; name: string; color?: string | null; logo?: string | null }>
  users?: Array<{ id: number; full_name: string; photo?: string | null }>
  content_types?: Array<{ id: number; title: string }>
  production_types?: Array<{ id: number; title: string }>
  languages?: Array<{ id: number; code?: string | null; long_name?: string | null }>
}

export type ResolvedGroupDrop = {
  /** Columns sent to `tasks.update` — grouped field only (+ overdue flags when applicable). */
  updatePayload: Record<string, unknown>
  /** Flat / nested fields merged into list caches for optimistic UI. */
  optimisticPatch: Record<string, unknown>
}

export type TaskGroupingDropSpec = {
  groupBy: Exclude<GroupByField, null>
  /** Primary writable DB column for this grouping. */
  dbField: string
  supportsDrop: boolean
  isGroupKeyDroppable: (groupKey: string) => boolean
  resolveDrop: (
    groupKey: string,
    editFields?: TaskGroupingEditFields | null,
  ) => ResolvedGroupDrop | null
}

function findStatusByGroupKey(
  groupKey: string,
  editFields?: TaskGroupingEditFields | null,
) {
  const statuses = editFields?.project_statuses ?? []
  const byId = statuses.find(s => String(s.id) === groupKey)
  if (byId) return byId
  return statuses.find(s => s.name === groupKey) ?? null
}

function findProjectByGroupKey(groupKey: string, editFields?: TaskGroupingEditFields | null) {
  const projects = editFields?.projects ?? []
  return projects.find(p => String(p.id) === groupKey) ?? null
}

function findUserByGroupKey(groupKey: string, editFields?: TaskGroupingEditFields | null) {
  const users = editFields?.users ?? []
  return users.find(u => String(u.id) === groupKey) ?? null
}

function findContentTypeByGroupKey(groupKey: string, editFields?: TaskGroupingEditFields | null) {
  const items = editFields?.content_types ?? []
  return items.find(ct => String(ct.id) === groupKey) ?? null
}

function findProductionTypeByGroupKey(groupKey: string, editFields?: TaskGroupingEditFields | null) {
  const items = editFields?.production_types ?? []
  return items.find(pt => String(pt.id) === groupKey) ?? null
}

function findLanguageByGroupKey(groupKey: string, editFields?: TaskGroupingEditFields | null) {
  const items = editFields?.languages ?? []
  return items.find(l => String(l.id) === groupKey) ?? null
}

function isExactDateGroupKey(groupKey: string): boolean {
  return EXACT_MONTH_GROUP_KEY.test(groupKey)
}

function isDateGroupKeyDroppable(groupKey: string): boolean {
  if (groupKey === GROUP_KEY_NO_DATE) return true
  if (isExactDateGroupKey(groupKey)) return true
  if (DERIVED_DATE_GROUP_KEYS.has(groupKey)) return false
  // Unknown non-canonical keys are not droppable — never infer from labels.
  return false
}

function resolveDateDrop(
  groupKey: string,
  dbField: 'delivery_date' | 'publication_date',
): ResolvedGroupDrop | null {
  if (!isDateGroupKeyDroppable(groupKey)) return null
  if (groupKey === GROUP_KEY_NO_DATE) {
    return {
      updatePayload: { [dbField]: null },
      optimisticPatch: { [dbField]: null },
    }
  }
  if (isExactDateGroupKey(groupKey)) {
    const canonicalDate = `${groupKey}-01`
    return {
      updatePayload: { [dbField]: canonicalDate },
      optimisticPatch: { [dbField]: canonicalDate },
    }
  }
  return null
}

export const TASK_GROUPING_DROP_SPECS: Record<
  Exclude<GroupByField, null | 'channels'>,
  TaskGroupingDropSpec
> = {
  assigned_to: {
    groupBy: 'assigned_to',
    dbField: 'assigned_to_id',
    supportsDrop: true,
    isGroupKeyDroppable: groupKey =>
      groupKey === GROUP_KEY_UNASSIGNED || /^\d+$/.test(groupKey),
    resolveDrop: (groupKey, editFields) => {
      if (groupKey === GROUP_KEY_UNASSIGNED) {
        return {
          updatePayload: { assigned_to_id: null },
          optimisticPatch: {
            assigned_to_id: null,
            assigned_to_name: null,
            assigned_to_photo: null,
            assigned_user: null,
          },
        }
      }
      const user = findUserByGroupKey(groupKey, editFields)
      if (!user) return null
      return {
        updatePayload: { assigned_to_id: user.id },
        optimisticPatch: {
          assigned_to_id: user.id,
          assigned_to_name: user.full_name,
          assigned_to_photo: user.photo ?? null,
          assigned_user: {
            id: user.id,
            full_name: user.full_name,
            photo: user.photo ?? null,
          },
        },
      }
    },
  },
  status: {
    groupBy: 'status',
    dbField: 'project_status_id',
    supportsDrop: true,
    isGroupKeyDroppable: groupKey =>
      groupKey === GROUP_KEY_UNASSIGNED || groupKey.trim().length > 0,
    resolveDrop: (groupKey, editFields) => {
      if (groupKey === GROUP_KEY_UNASSIGNED) {
        return {
          updatePayload: { project_status_id: null },
          optimisticPatch: {
            project_status_id: null,
            project_status_name: null,
            project_status_color: null,
            project_statuses: null,
          },
        }
      }
      const status = findStatusByGroupKey(groupKey, editFields)
      if (!status) return null
      return {
        updatePayload: { project_status_id: status.id },
        optimisticPatch: {
          project_status_id: status.id,
          project_status_name: status.name,
          project_status_color: status.color ?? null,
          project_statuses: {
            id: status.id,
            name: status.name,
            color: status.color ?? null,
          },
        },
      }
    },
  },
  project: {
    groupBy: 'project',
    dbField: 'project_id_int',
    supportsDrop: true,
    isGroupKeyDroppable: groupKey =>
      groupKey === GROUP_KEY_NO_PROJECT || /^\d+$/.test(groupKey),
    resolveDrop: (groupKey, editFields) => {
      if (groupKey === GROUP_KEY_NO_PROJECT) {
        return {
          updatePayload: { project_id_int: null },
          optimisticPatch: {
            project_id_int: null,
            project_name: null,
            project_color: null,
            project_logo: null,
            projects: null,
          },
        }
      }
      const project = findProjectByGroupKey(groupKey, editFields)
      if (!project) return null
      return {
        updatePayload: { project_id_int: project.id },
        optimisticPatch: {
          project_id_int: project.id,
          project_name: project.name,
          project_color: project.color ?? null,
          project_logo: project.logo ?? null,
          projects: {
            id: project.id,
            name: project.name,
            color: project.color ?? '',
            logo: project.logo ?? null,
          },
        },
      }
    },
  },
  content_type: {
    groupBy: 'content_type',
    dbField: 'content_type_id',
    supportsDrop: true,
    isGroupKeyDroppable: groupKey =>
      groupKey === GROUP_KEY_UNASSIGNED || /^\d+$/.test(groupKey),
    resolveDrop: (groupKey, editFields) => {
      if (groupKey === GROUP_KEY_UNASSIGNED) {
        return {
          updatePayload: { content_type_id: null },
          optimisticPatch: { content_type_id: null, content_type_title: null },
        }
      }
      const contentType = findContentTypeByGroupKey(groupKey, editFields)
      if (!contentType) return null
      return {
        updatePayload: { content_type_id: contentType.id },
        optimisticPatch: {
          content_type_id: contentType.id,
          content_type_title: contentType.title,
        },
      }
    },
  },
  production_type: {
    groupBy: 'production_type',
    dbField: 'production_type_id',
    supportsDrop: true,
    isGroupKeyDroppable: groupKey =>
      groupKey === GROUP_KEY_UNASSIGNED || /^\d+$/.test(groupKey),
    resolveDrop: (groupKey, editFields) => {
      if (groupKey === GROUP_KEY_UNASSIGNED) {
        return {
          updatePayload: { production_type_id: null },
          optimisticPatch: { production_type_id: null, production_type_title: null },
        }
      }
      const productionType = findProductionTypeByGroupKey(groupKey, editFields)
      if (!productionType) return null
      return {
        updatePayload: { production_type_id: productionType.id },
        optimisticPatch: {
          production_type_id: productionType.id,
          production_type_title: productionType.title,
        },
      }
    },
  },
  language: {
    groupBy: 'language',
    dbField: 'language_id',
    supportsDrop: true,
    isGroupKeyDroppable: groupKey =>
      groupKey === GROUP_KEY_UNASSIGNED || /^\d+$/.test(groupKey),
    resolveDrop: (groupKey, editFields) => {
      if (groupKey === GROUP_KEY_UNASSIGNED) {
        return {
          updatePayload: { language_id: null },
          optimisticPatch: { language_id: null, language_code: null },
        }
      }
      const language = findLanguageByGroupKey(groupKey, editFields)
      if (!language) return null
      return {
        updatePayload: { language_id: language.id },
        optimisticPatch: {
          language_id: language.id,
          language_code: language.long_name || language.code || null,
        },
      }
    },
  },
  delivery_date: {
    groupBy: 'delivery_date',
    dbField: 'delivery_date',
    supportsDrop: true,
    isGroupKeyDroppable: isDateGroupKeyDroppable,
    resolveDrop: groupKey => resolveDateDrop(groupKey, 'delivery_date'),
  },
  publication_date: {
    groupBy: 'publication_date',
    dbField: 'publication_date',
    supportsDrop: true,
    isGroupKeyDroppable: isDateGroupKeyDroppable,
    resolveDrop: groupKey => resolveDateDrop(groupKey, 'publication_date'),
  },
}

export function getTaskGroupingDropSpec(
  groupBy: GroupByField | string | null | undefined,
): TaskGroupingDropSpec | null {
  if (!groupBy || groupBy === 'channels') return null
  return TASK_GROUPING_DROP_SPECS[groupBy as Exclude<GroupByField, null | 'channels'>] ?? null
}

export function supportsTaskGroupDragDrop(
  groupBy: GroupByField | string | null | undefined,
): boolean {
  const spec = getTaskGroupingDropSpec(groupBy)
  return !!spec?.supportsDrop
}

export function isGroupKeyDroppable(
  groupBy: GroupByField | string | null | undefined,
  groupKey: string,
): boolean {
  const spec = getTaskGroupingDropSpec(groupBy)
  if (!spec?.supportsDrop) return false
  return spec.isGroupKeyDroppable(groupKey)
}

export function computeOverduePatchForTask(
  task: TaskListRow | Record<string, unknown>,
  patch: Record<string, unknown>,
  editFields?: TaskGroupingEditFields | null,
): Record<string, boolean> {
  if (!editFields?.project_statuses?.length) return {}

  const deliveryDate =
    patch.delivery_date !== undefined
      ? (patch.delivery_date as string | null)
      : ((task as TaskListRow).delivery_date ?? null)
  const publicationDate =
    patch.publication_date !== undefined
      ? (patch.publication_date as string | null)
      : ((task as TaskListRow).publication_date ?? null)
  const statusId =
    patch.project_status_id !== undefined
      ? patch.project_status_id
      : ((task as TaskListRow).project_status_id ?? null)

  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const currentStatus = editFields.project_statuses.find(
    s => String(s.id) === String(statusId),
  )

  let isOverdue = false
  if (deliveryDate && !currentStatus?.is_closed) {
    const deliveryDateObj = new Date(String(deliveryDate))
    deliveryDateObj.setHours(0, 0, 0, 0)
    isOverdue = deliveryDateObj < now
  }

  let isPublicationOverdue = false
  if (publicationDate && !currentStatus?.is_publication_closed) {
    const publicationDateObj = new Date(String(publicationDate))
    publicationDateObj.setHours(0, 0, 0, 0)
    isPublicationOverdue = publicationDateObj < now
  }

  return { is_overdue: isOverdue, is_publication_overdue: isPublicationOverdue }
}

export type ResolveTaskGroupDropArgs = {
  groupBy: GroupByField
  sourceGroupKey: string
  destinationGroupKey: string
  task: TaskListRow | Record<string, unknown>
  editFields?: TaskGroupingEditFields | null
}

export type ResolveTaskGroupDropResult = {
  updatePayload: Record<string, unknown>
  optimisticTask: Record<string, unknown>
}

/**
 * Resolve a cross-group drop into DB + optimistic patches.
 * Returns null for no-ops, unsupported groupings, or non-droppable targets.
 */
export function resolveTaskGroupDrop(
  args: ResolveTaskGroupDropArgs,
): ResolveTaskGroupDropResult | null {
  const { groupBy, task, editFields } = args
  const sourceGroupKey = normalizeCanonicalGroupKey(args.sourceGroupKey, groupBy)
  const destinationGroupKey = normalizeCanonicalGroupKey(args.destinationGroupKey, groupBy)
  const spec = getTaskGroupingDropSpec(groupBy)
  if (!spec?.supportsDrop) return null
  // Use explicit sentinel comparison — null/unassigned groups are valid destinations.
  if (destinationGroupKey == null || sourceGroupKey == null || destinationGroupKey === sourceGroupKey) {
    return null
  }
  if (!isGroupKeyDroppable(groupBy, destinationGroupKey)) return null

  const resolved = spec.resolveDrop(destinationGroupKey, editFields)
  if (!resolved) return null

  const affectsOverdue =
    Object.prototype.hasOwnProperty.call(resolved.optimisticPatch, 'delivery_date') ||
    Object.prototype.hasOwnProperty.call(resolved.optimisticPatch, 'publication_date') ||
    Object.prototype.hasOwnProperty.call(resolved.optimisticPatch, 'project_status_id')

  const overduePatch = affectsOverdue
    ? computeOverduePatchForTask(task, resolved.optimisticPatch, editFields)
    : {}
  const updatePayload = { ...resolved.updatePayload, ...overduePatch }
  const optimisticTask = {
    ...task,
    ...resolved.optimisticPatch,
    ...overduePatch,
  }

  return { updatePayload, optimisticTask }
}

export function getTaskDragId(task: Record<string, unknown>): string | null {
  const rawId = task.entity_id ?? task.id
  const numericId = Number(rawId)
  if (!Number.isFinite(numericId)) return null
  return `task-drag:${numericId}`
}

export function getGroupDropId(
  groupKey: string,
  slot: string,
  groupBy?: GroupByField | string | null,
): string {
  return `group-drop:${encodeGroupKeyForDndId(groupKey, groupBy)}:${slot}`
}

export function getGroupEdgeDropId(
  groupKey: string,
  edge: 'start' | 'end',
  groupBy?: GroupByField | string | null,
): string {
  return `group-edge:${encodeGroupKeyForDndId(groupKey, groupBy)}:${edge}`
}

export function getRowInsertDropId(
  groupKey: string,
  beforeTaskId: number | null,
  groupBy?: GroupByField | string | null,
): string {
  const encodedKey = encodeGroupKeyForDndId(groupKey, groupBy)
  if (beforeTaskId == null) {
    return `row-insert:${encodedKey}:end`
  }
  return `row-insert:${encodedKey}:before:${beforeTaskId}`
}

export type TaskDropTarget =
  | { kind: 'group-edge'; groupKey: string; edge: 'start' | 'end' }
  | { kind: 'row-insert'; groupKey: string; beforeTaskId: number | null }

function parseDropId(
  id: string,
  groupBy?: GroupByField | string | null,
): TaskDropTarget | null {
  if (id.startsWith('group-edge:')) {
    const parts = id.split(':')
    const edge = parts[parts.length - 1]
    if (edge !== 'start' && edge !== 'end') return null
    const encodedKey = parts.slice(1, -1).join(':')
    const groupKey = decodeGroupKeyFromDndId(encodedKey, groupBy)
    if (groupKey == null) return null
    return { kind: 'group-edge', groupKey, edge }
  }
  if (id.startsWith('row-insert:')) {
    if (id.endsWith(':end')) {
      const encodedKey = id.slice('row-insert:'.length, -':end'.length)
      const groupKey = decodeGroupKeyFromDndId(encodedKey, groupBy)
      if (groupKey == null) return null
      return { kind: 'row-insert', groupKey, beforeTaskId: null }
    }
    const marker = ':before:'
    const markerIdx = id.indexOf(marker)
    if (markerIdx === -1) return null
    const encodedKey = id.slice('row-insert:'.length, markerIdx)
    const beforeTaskId = Number(id.slice(markerIdx + marker.length))
    const groupKey = decodeGroupKeyFromDndId(encodedKey, groupBy)
    if (groupKey == null || !Number.isFinite(beforeTaskId)) return null
    return { kind: 'row-insert', groupKey, beforeTaskId }
  }
  if (id.startsWith('group-drop:')) {
    const parts = id.split(':')
    if (parts.length < 3) return null
    const slot = parts[parts.length - 1]
    const encodedKey = parts.slice(1, -1).join(':')
    const groupKey = decodeGroupKeyFromDndId(encodedKey, groupBy)
    if (groupKey == null) return null
    const edge: 'start' | 'end' =
      slot === 'header' || slot === 'empty' || slot === 'loading' ? 'start' : 'end'
    return { kind: 'group-edge', groupKey, edge }
  }
  return null
}

export function resolveTaskDropTarget(
  over: { id?: unknown; data?: { current?: Record<string, unknown> } } | null | undefined,
  groupBy?: GroupByField | string | null,
): TaskDropTarget | null {
  if (!over) return null
  const data = over.data?.current
  if (data?.type === 'row-insert' && typeof data.groupKey === 'string') {
    const beforeTaskId =
      data.beforeTaskId == null ? null : Number(data.beforeTaskId)
    const groupKey = normalizeCanonicalGroupKey(data.groupKey, groupBy)
    if (groupKey == null) return null
    return {
      kind: 'row-insert',
      groupKey,
      beforeTaskId: Number.isFinite(beforeTaskId as number) ? (beforeTaskId as number) : null,
    }
  }
  if (data?.type === 'group-edge' && typeof data.groupKey === 'string') {
    const edge = data.edge === 'start' ? 'start' : 'end'
    const groupKey = normalizeCanonicalGroupKey(data.groupKey, groupBy)
    if (groupKey == null) return null
    return { kind: 'group-edge', groupKey, edge }
  }
  if (typeof data?.groupKey === 'string') {
    const groupKey = normalizeCanonicalGroupKey(data.groupKey, groupBy)
    if (groupKey == null) return null
    return { kind: 'group-edge', groupKey, edge: 'start' }
  }
  return parseDropId(String(over.id ?? ''), groupBy)
}

export function resolveDestinationGroupKeyFromDropId(
  over: { id?: unknown; data?: { current?: Record<string, unknown> } } | null | undefined,
  groupBy?: GroupByField | string | null,
): string | null {
  const target = resolveTaskDropTarget(over, groupBy)
  return target?.groupKey ?? null
}

export function isNullGroupKey(groupKey: string): boolean {
  return (
    groupKey === GROUP_KEY_UNASSIGNED ||
    groupKey === GROUP_KEY_NO_PROJECT ||
    groupKey === GROUP_KEY_NO_DATE
  )
}

export function isTaskDraggableForGroupDrop(
  task: unknown,
  groupBy: GroupByField | string | null | undefined,
  options?: { isMultiselectMode?: boolean; isPending?: boolean },
): boolean {
  if (!supportsTaskGroupDragDrop(groupBy)) return false
  if (options?.isMultiselectMode) return false
  if (options?.isPending) return false

  const row = task as Record<string, unknown> | null | undefined
  if (!row) return false
  if (row.kind === 'suggestion' || row.entity_type === 'suggestion') return false
  if (row.can_edit === false) return false
  return getTaskDragId(row) != null
}

export function getCurrentGroupKeyForTask(
  task: TaskListRow | Record<string, unknown>,
  groupBy: GroupByField | string | null,
): string | null {
  if (!groupBy) return null
  return computeGroupKeyForTask(task as TaskListRow, groupBy) ?? null
}
