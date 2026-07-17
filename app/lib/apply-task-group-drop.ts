import type { QueryClient } from '@tanstack/react-query'
import type { GroupByField } from '../store/task-grouping'
import {
  resolveTaskGroupDrop,
  type TaskGroupingEditFields,
} from './task-grouping-drop-config'
import { patchTaskInGroupTasksCaches } from '../../src/hooks/use-task-group-tasks-query'
import {
  updateTaskInCaches,
  updateTaskInCachesWithOverdue,
} from '../components/tasks/task-cache-utils'
import { getTypesenseUpdater } from '../store/typesense-tasks'

export type ApplyTaskGroupDropArgs = {
  groupBy: GroupByField
  sourceGroupKey: string
  destinationGroupKey: string
  task: Record<string, unknown>
  editFields?: TaskGroupingEditFields | null
  queryClient: QueryClient
  updateTaskInList?: (task: Record<string, unknown>) => void
}

export type ApplyTaskGroupDropResult =
  | { ok: true; optimisticTask: Record<string, unknown>; updatePayload: Record<string, unknown> }
  | { ok: false; reason: 'noop' | 'blocked' }

export function applyTaskGroupDropOptimistic(
  args: ApplyTaskGroupDropArgs,
): ApplyTaskGroupDropResult {
  const resolved = resolveTaskGroupDrop({
    groupBy: args.groupBy,
    sourceGroupKey: args.sourceGroupKey,
    destinationGroupKey: args.destinationGroupKey,
    task: args.task,
    editFields: args.editFields,
  })
  if (!resolved) return { ok: false, reason: 'noop' }

  const { optimisticTask, updatePayload } = resolved

  try {
    patchTaskInGroupTasksCaches(optimisticTask)
  } catch {
    // Cache patch is best-effort; DB request still proceeds.
  }

  if (args.editFields?.project_statuses) {
    updateTaskInCachesWithOverdue(
      args.queryClient,
      optimisticTask,
      args.editFields.project_statuses,
    )
  } else {
    updateTaskInCaches(args.queryClient, optimisticTask)
  }

  args.updateTaskInList?.(optimisticTask)
  getTypesenseUpdater()?.(optimisticTask)

  return { ok: true, optimisticTask, updatePayload }
}

export function rollbackTaskGroupDropOptimistic(
  args: ApplyTaskGroupDropArgs,
  previousTask: Record<string, unknown>,
) {
  try {
    patchTaskInGroupTasksCaches(previousTask)
  } catch {
    // ignore
  }

  if (args.editFields?.project_statuses) {
    updateTaskInCachesWithOverdue(
      args.queryClient,
      previousTask,
      args.editFields.project_statuses,
    )
  } else {
    updateTaskInCaches(args.queryClient, previousTask)
  }

  args.updateTaskInList?.(previousTask)
  getTypesenseUpdater()?.(previousTask)
}
