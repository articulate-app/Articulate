import { create, StateCreator } from 'zustand'

export type GroupByField =
  | 'assigned_to'
  | 'status'
  | 'delivery_date'
  | 'publication_date'
  | 'project'
  | 'content_type'
  | 'production_type'
  | 'language'
  | 'channels'
  | null

export interface TaskGroupingState {
  selectedGroupBy: GroupByField
  expandedGroups: Set<string>
  setGroupBy: (groupBy: GroupByField) => void
  toggleGroup: (groupKey: string) => void
  isGroupExpanded: (groupKey: string) => boolean
  resetGroups: () => void
}

export const useTaskGrouping = create<TaskGroupingState>(
  ((set, get) => ({
    selectedGroupBy: null,
    expandedGroups: new Set<string>(),
    setGroupBy: (groupBy: GroupByField) => set({ selectedGroupBy: groupBy, expandedGroups: new Set<string>() }),
    toggleGroup: (groupKey: string) => {
      const expandedGroups = new Set<string>(get().expandedGroups)
      if (expandedGroups.has(groupKey)) {
        expandedGroups.delete(groupKey)
      } else {
        expandedGroups.add(groupKey)
      }
      set({ expandedGroups })
    },
    isGroupExpanded: (groupKey: string) => get().expandedGroups.has(groupKey),
    resetGroups: () => set({ expandedGroups: new Set<string>() }),
  }))
) 