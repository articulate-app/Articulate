import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/hooks/use-task-group-tasks-query', () => ({
  patchTaskInGroupTasksCaches: vi.fn(),
  computeGroupKeyForTask: vi.fn((row: any, groupBy: string | null) => {
    if (!groupBy) return null
    if (groupBy === 'status') return row.project_status_name ?? '__unassigned__'
    if (groupBy === 'project') return row.project_id_int != null ? String(row.project_id_int) : '__no_project__'
    if (groupBy === 'delivery_date' && row.delivery_date) return String(row.delivery_date).slice(0, 7)
    return null
  }),
}))

vi.mock('../app/components/tasks/task-cache-utils', () => ({
  updateTaskInCaches: vi.fn(),
  updateTaskInCachesWithOverdue: vi.fn(),
}))

vi.mock('../app/store/typesense-tasks', () => ({
  getTypesenseUpdater: vi.fn(() => null),
}))

import {
  GROUP_KEY_NO_DATE,
  GROUP_KEY_NO_PROJECT,
  GROUP_KEY_UNASSIGNED,
  NULL_GROUP_DND_VALUE,
  decodeGroupKeyFromDndId,
  encodeGroupKeyForDndId,
  getCurrentGroupKeyForTask,
  getRowInsertDropId,
  isGroupKeyDroppable,
  isNullGroupKey,
  isTaskDraggableForGroupDrop,
  normalizeCanonicalGroupKey,
  resolveDestinationGroupKeyFromDropId,
  resolveTaskDropTarget,
  resolveTaskGroupDrop,
  type TaskGroupingEditFields,
} from '../app/lib/task-grouping-drop-config'
import {
  applyTaskGroupDropOptimistic,
  rollbackTaskGroupDropOptimistic,
} from '../app/lib/apply-task-group-drop'
import { buildTaskGroupFilterPatch } from '../app/lib/task-group-filter'

const editFields: TaskGroupingEditFields = {
  project_statuses: [
    { id: 10, name: 'Draft', color: '#111' },
    { id: 20, name: 'Published', color: '#222' },
  ],
  projects: [
    { id: 5, name: 'Alpha', color: '#abc' },
    { id: 7, name: 'Beta', color: '#def' },
  ],
  users: [{ id: 40, full_name: 'Alex', photo: null }],
  content_types: [{ id: 1, title: 'Blog' }],
  production_types: [{ id: 2, title: 'Video' }],
  languages: [{ id: 3, code: 'en', long_name: 'English' }],
}

const baseTask = {
  id: 100,
  entity_id: 100,
  entity_type: 'task',
  kind: 'task',
  title: 'Sample task',
  assigned_to_id: 40,
  assigned_to_name: 'Alex',
  project_id_int: 5,
  project_name: 'Alpha',
  project_status_id: 10,
  project_status_name: 'Draft',
  delivery_date: '2026-03-15',
  publication_date: '2026-04-10',
  content_type_id: 1,
  production_type_id: 2,
  language_id: 3,
}

describe('resolveTaskGroupDrop', () => {
  it('moves a task between status groups using canonical status id (not visible label)', () => {
    const result = resolveTaskGroupDrop({
      groupBy: 'status',
      sourceGroupKey: 'Draft',
      destinationGroupKey: 'Published',
      task: baseTask,
      editFields,
    })

    expect(result).not.toBeNull()
    expect(result!.updatePayload).toEqual({
      project_status_id: 20,
      is_overdue: expect.any(Boolean),
      is_publication_overdue: expect.any(Boolean),
    })
    expect(result!.optimisticTask.project_status_id).toBe(20)
    expect(result!.optimisticTask.project_status_name).toBe('Published')
    // Visible label could be translated — mutation must not depend on it.
    expect(result!.updatePayload.project_status_id).toBe(20)
    expect(result!.updatePayload).not.toHaveProperty('project_status_name')
  })

  it('resolves status drop when group_key is the status id', () => {
    const result = resolveTaskGroupDrop({
      groupBy: 'status',
      sourceGroupKey: '10',
      destinationGroupKey: '20',
      task: baseTask,
      editFields,
    })

    expect(result?.updatePayload.project_status_id).toBe(20)
  })

  it('moves a task between project groups using project id from group_key', () => {
    const result = resolveTaskGroupDrop({
      groupBy: 'project',
      sourceGroupKey: '5',
      destinationGroupKey: '7',
      task: baseTask,
      editFields,
    })

    expect(result?.updatePayload).toEqual({ project_id_int: 7 })
    expect(result?.optimisticTask.project_id_int).toBe(7)
    expect(result?.optimisticTask.project_name).toBe('Beta')
  })

  it('moves a task between exact date groups using canonical YYYY-MM-01 date', () => {
    const result = resolveTaskGroupDrop({
      groupBy: 'delivery_date',
      sourceGroupKey: '2026-03',
      destinationGroupKey: '2026-05',
      task: baseTask,
      editFields,
    })

    expect(result?.updatePayload.delivery_date).toBe('2026-05-01')
    expect(result?.optimisticTask.delivery_date).toBe('2026-05-01')
  })

  it('supports dropping into an empty group (destination differs from source)', () => {
    const result = resolveTaskGroupDrop({
      groupBy: 'project',
      sourceGroupKey: '5',
      destinationGroupKey: '7',
      task: { ...baseTask, project_id_int: 5 },
      editFields,
    })

    expect(result).not.toBeNull()
    expect(result!.updatePayload.project_id_int).toBe(7)
  })

  it('moves a task to an unassigned group with null payload', () => {
    const result = resolveTaskGroupDrop({
      groupBy: 'assigned_to',
      sourceGroupKey: '40',
      destinationGroupKey: GROUP_KEY_UNASSIGNED,
      task: baseTask,
      editFields,
    })

    expect(result?.updatePayload).toEqual({ assigned_to_id: null })
    expect(result?.optimisticTask.assigned_to_id).toBeNull()
  })

  it('moves a task to no-project and no-date groups', () => {
    const noProject = resolveTaskGroupDrop({
      groupBy: 'project',
      sourceGroupKey: '5',
      destinationGroupKey: GROUP_KEY_NO_PROJECT,
      task: baseTask,
      editFields,
    })
    expect(noProject?.updatePayload.project_id_int).toBeNull()

    const noDate = resolveTaskGroupDrop({
      groupBy: 'publication_date',
      sourceGroupKey: '2026-04',
      destinationGroupKey: GROUP_KEY_NO_DATE,
      task: baseTask,
      editFields,
    })
    expect(noDate?.updatePayload.publication_date).toBeNull()
  })

  it('is a no-op when dropping into the current group', () => {
    const result = resolveTaskGroupDrop({
      groupBy: 'status',
      sourceGroupKey: 'Draft',
      destinationGroupKey: 'Draft',
      task: baseTask,
      editFields,
    })
    expect(result).toBeNull()
  })

  it('rejects non-droppable derived date groups', () => {
    expect(isGroupKeyDroppable('delivery_date', 'overdue')).toBe(false)
    expect(isGroupKeyDroppable('delivery_date', 'later')).toBe(false)

    const result = resolveTaskGroupDrop({
      groupBy: 'delivery_date',
      sourceGroupKey: '2026-03',
      destinationGroupKey: 'overdue',
      task: baseTask,
      editFields,
    })
    expect(result).toBeNull()
  })
})

describe('isTaskDraggableForGroupDrop', () => {
  it('blocks non-editable tasks', () => {
    expect(
      isTaskDraggableForGroupDrop({ ...baseTask, can_edit: false }, 'status'),
    ).toBe(false)
  })

  it('blocks suggestions and multiselect mode', () => {
    expect(
      isTaskDraggableForGroupDrop(
        { ...baseTask, kind: 'suggestion', entity_type: 'suggestion' },
        'status',
      ),
    ).toBe(false)
    expect(
      isTaskDraggableForGroupDrop(baseTask, 'status', { isMultiselectMode: true }),
    ).toBe(false)
  })

  it('allows normal editable tasks when grouping supports drag', () => {
    expect(isTaskDraggableForGroupDrop(baseTask, 'status')).toBe(true)
    expect(isTaskDraggableForGroupDrop(baseTask, 'channels')).toBe(false)
  })

  it('blocks tasks while an update is pending', () => {
    expect(isTaskDraggableForGroupDrop(baseTask, 'status', { isPending: true })).toBe(false)
  })
})

describe('resolveDestinationGroupKeyFromDropId', () => {
  it('reads canonical group_key from droppable data, not labels', () => {
    const key = resolveDestinationGroupKeyFromDropId({
      id: 'group-drop:20:header',
      data: { current: { groupKey: '20' } },
    }, 'status')
    expect(key).toBe('20')
  })

  it('falls back to parsing droppable id when data is missing', () => {
    const key = resolveDestinationGroupKeyFromDropId({
      id: 'group-drop:2026-05:empty',
      data: { current: {} },
    }, 'delivery_date')
    expect(key).toBe('2026-05')
  })

  it('resolves null sentinel group keys from row-insert targets', () => {
    expect(
      resolveDestinationGroupKeyFromDropId({
        id: getRowInsertDropId(GROUP_KEY_UNASSIGNED, 42, 'status'),
        data: { current: { type: 'row-insert', groupKey: GROUP_KEY_UNASSIGNED, beforeTaskId: 42 } },
      }, 'status'),
    ).toBe(GROUP_KEY_UNASSIGNED)

    expect(
      resolveDestinationGroupKeyFromDropId({
        id: getRowInsertDropId(GROUP_KEY_NO_PROJECT, null, 'project'),
        data: { current: { type: 'row-insert', groupKey: GROUP_KEY_NO_PROJECT, beforeTaskId: null } },
      }, 'project'),
    ).toBe(GROUP_KEY_NO_PROJECT)

    expect(
      resolveDestinationGroupKeyFromDropId({
        id: getRowInsertDropId(GROUP_KEY_NO_DATE, null, 'delivery_date'),
        data: { current: { type: 'row-insert', groupKey: GROUP_KEY_NO_DATE, beforeTaskId: null } },
      }, 'delivery_date'),
    ).toBe(GROUP_KEY_NO_DATE)
  })

  it('decodes the DnD null sentinel id back to the canonical null status group', () => {
    expect(
      resolveDestinationGroupKeyFromDropId({
        id: getRowInsertDropId(GROUP_KEY_UNASSIGNED, null, 'status'),
        data: { current: {} },
      }, 'status'),
    ).toBe(GROUP_KEY_UNASSIGNED)
    expect(encodeGroupKeyForDndId(GROUP_KEY_UNASSIGNED, 'status')).toBe(NULL_GROUP_DND_VALUE)
    expect(decodeGroupKeyFromDndId(NULL_GROUP_DND_VALUE, 'status')).toBe(GROUP_KEY_UNASSIGNED)
  })
})

describe('resolveTaskDropTarget', () => {
  it('parses row insertion targets between specific tasks', () => {
    expect(
      resolveTaskDropTarget({
        id: 'row-insert:Draft:before:100',
        data: { current: { type: 'row-insert', groupKey: 'Draft', beforeTaskId: 100 } },
      }),
    ).toEqual({ kind: 'row-insert', groupKey: 'Draft', beforeTaskId: 100 })
  })

  it('parses group-edge targets for collapsed headers and empty groups', () => {
    expect(
      resolveTaskDropTarget({
        id: 'group-drop:__no_project__:empty',
        data: { current: { type: 'group-edge', groupKey: GROUP_KEY_NO_PROJECT, edge: 'start' } },
      }),
    ).toEqual({ kind: 'group-edge', groupKey: GROUP_KEY_NO_PROJECT, edge: 'start' })
  })
})

describe('null group destinations', () => {
  it('treats null sentinel keys as droppable destinations', () => {
    expect(isGroupKeyDroppable('status', GROUP_KEY_UNASSIGNED)).toBe(true)
    expect(isGroupKeyDroppable('project', GROUP_KEY_NO_PROJECT)).toBe(true)
    expect(isGroupKeyDroppable('delivery_date', GROUP_KEY_NO_DATE)).toBe(true)
    expect(isNullGroupKey(GROUP_KEY_UNASSIGNED)).toBe(true)
  })

  it('normalizes legacy and empty raw keys to canonical null group sentinels', () => {
    expect(normalizeCanonicalGroupKey('', 'status')).toBe(GROUP_KEY_UNASSIGNED)
    expect(normalizeCanonicalGroupKey('null', 'status')).toBe(GROUP_KEY_UNASSIGNED)
    expect(normalizeCanonicalGroupKey('unassigned', 'assigned_to')).toBe(GROUP_KEY_UNASSIGNED)
    expect(normalizeCanonicalGroupKey('none', 'project')).toBe(GROUP_KEY_NO_PROJECT)
    expect(normalizeCanonicalGroupKey('no-date', 'delivery_date')).toBe(GROUP_KEY_NO_DATE)
  })

  it('resolves explicit null payloads for every supported null group', () => {
    const unassignedStatus = resolveTaskGroupDrop({
      groupBy: 'status',
      sourceGroupKey: 'Draft',
      destinationGroupKey: GROUP_KEY_UNASSIGNED,
      task: baseTask,
      editFields,
    })
    expect(unassignedStatus?.updatePayload.project_status_id).toBeNull()

    const noProject = resolveTaskGroupDrop({
      groupBy: 'project',
      sourceGroupKey: '5',
      destinationGroupKey: GROUP_KEY_NO_PROJECT,
      task: baseTask,
      editFields,
    })
    expect(noProject?.updatePayload.project_id_int).toBeNull()

    const noDate = resolveTaskGroupDrop({
      groupBy: 'publication_date',
      sourceGroupKey: '2026-04',
      destinationGroupKey: GROUP_KEY_NO_DATE,
      task: baseTask,
      editFields,
    })
    expect(noDate?.updatePayload.publication_date).toBeNull()
  })

  it('sends explicit null in the mutation payload when dropping into No status', () => {
    const result = resolveTaskGroupDrop({
      groupBy: 'status',
      sourceGroupKey: 'Draft',
      destinationGroupKey: '',
      task: baseTask,
      editFields,
    })

    expect(result).not.toBeNull()
    expect(result!.updatePayload).toHaveProperty('project_status_id')
    expect(result!.updatePayload.project_status_id).toBeNull()
    expect(result!.updatePayload).not.toHaveProperty('project_status_name')
    expect(Object.values(result!.updatePayload)).not.toContain(NULL_GROUP_DND_VALUE)
    expect(Object.values(result!.updatePayload)).not.toContain(GROUP_KEY_UNASSIGNED)
  })
})

describe('buildTaskGroupFilterPatch', () => {
  it('maps grouped headers to canonical list filter patches', () => {
    expect(buildTaskGroupFilterPatch('status', 'Draft', 'Draft')).toEqual({ status: ['Draft'] })
    expect(buildTaskGroupFilterPatch('project', '5', 'Alpha')).toEqual({ project: ['5'] })
    const datePatch = buildTaskGroupFilterPatch('delivery_date', '2026-03', 'Mar 2026')
    expect(datePatch?.deliveryDate?.from?.getFullYear()).toBe(2026)
    expect(datePatch?.deliveryDate?.from?.getMonth()).toBe(2)
    expect(datePatch?.deliveryDate?.from?.getDate()).toBe(1)
    expect(datePatch?.deliveryDate?.to?.getFullYear()).toBe(2026)
    expect(datePatch?.deliveryDate?.to?.getMonth()).toBe(2)
    expect(datePatch?.deliveryDate?.to?.getDate()).toBe(31)
  })

  it('supports null group filter sentinels without truthiness checks', () => {
    expect(buildTaskGroupFilterPatch('status', GROUP_KEY_UNASSIGNED, 'No status')).toEqual({
      status: ['__unassigned__'],
    })
    expect(buildTaskGroupFilterPatch('project', GROUP_KEY_NO_PROJECT, 'No project')).toEqual({
      project: ['__none__'],
    })
  })
})

describe('applyTaskGroupDropOptimistic rollback', () => {
  const queryClient = { getQueryCache: () => ({ findAll: () => [] }) } as any

  beforeEach(() => {
    vi.resetModules()
  })

  it('rolls back optimistic caches after a failed mutation', () => {
    const updateTaskInList = vi.fn()
    const args = {
      groupBy: 'status' as const,
      sourceGroupKey: 'Draft',
      destinationGroupKey: 'Published',
      task: baseTask,
      editFields,
      queryClient,
      updateTaskInList,
    }

    const applied = applyTaskGroupDropOptimistic(args)
    expect(applied.ok).toBe(true)
    expect(updateTaskInList).toHaveBeenCalledWith(
      expect.objectContaining({ project_status_id: 20 }),
    )

    updateTaskInList.mockClear()
    rollbackTaskGroupDropOptimistic(args, baseTask)
    expect(updateTaskInList).toHaveBeenCalledWith(baseTask)
  })

  it('optimistic drop into No status uses explicit null mutation payload', () => {
    const updateTaskInList = vi.fn()
    const applied = applyTaskGroupDropOptimistic({
      groupBy: 'status',
      sourceGroupKey: 'Draft',
      destinationGroupKey: GROUP_KEY_UNASSIGNED,
      task: baseTask,
      editFields,
      queryClient,
      updateTaskInList,
    })

    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.updatePayload.project_status_id).toBeNull()
    expect(applied.updatePayload).not.toHaveProperty('project_status_name')
    expect(Object.values(applied.updatePayload)).not.toContain(NULL_GROUP_DND_VALUE)
  })
})

describe('getCurrentGroupKeyForTask', () => {
  it('uses canonical group keys for grouping comparisons', () => {
    expect(getCurrentGroupKeyForTask(baseTask, 'status')).toBe('Draft')
    expect(getCurrentGroupKeyForTask(baseTask, 'project')).toBe('5')
    expect(getCurrentGroupKeyForTask(baseTask, 'delivery_date')).toBe('2026-03')
  })
})
