import { create } from 'zustand'

import type { TaskListRow } from '@/lib/types/task-list-view'
import type { PlannerEntityFields } from '@/lib/types/planner-item'

export type OptimisticPlannerTask = TaskListRow &
  PlannerEntityFields & {
    kind: 'task'
    entity_type: 'task'
    entity_id: number
  }

type State = {
  /**
   * Keyed by source_key when available, otherwise by `task:${id}`.
   * These tasks are merged into planner UIs to avoid needing a refetch after approving suggestions.
   */
  byKey: Record<string, OptimisticPlannerTask>
  upsert: (task: OptimisticPlannerTask) => void
  removeByKey: (key: string) => void
  clear: () => void
}

function taskKey(task: OptimisticPlannerTask): string {
  const sk = typeof task.source_key === 'string' ? task.source_key.trim() : ''
  if (sk) return sk
  return `task:${String(task.id)}`
}

export const usePlannerOptimisticTasks = create<State>((set) => ({
  byKey: {},
  upsert: (task) =>
    set((state) => ({
      byKey: {
        ...state.byKey,
        [taskKey(task)]: task,
      },
    })),
  removeByKey: (key) =>
    set((state) => {
      if (!state.byKey[key]) return state
      const next = { ...state.byKey }
      delete next[key]
      return { byKey: next }
    }),
  clear: () => set({ byKey: {} }),
}))

export function selectOptimisticPlannerTasks(state: State): OptimisticPlannerTask[] {
  return Object.values(state.byKey)
}


