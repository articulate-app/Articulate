import { create } from 'zustand'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

export type ViewMode = 'list' | 'calendar' | 'kanban'

export interface TaskFilters {
  assignedTo: string[]
  status: string[]
  deliveryDate: { from?: Date; to?: Date }
  publicationDate: { from?: Date; to?: Date }
  project: string[]
  contentType: string[]
  productionType: string[]
  language: string[]
  channels: string[]
  overdueStatus: string[]
}

export type PlannerItemKind = 'task' | 'suggestion'

export type PlannerVisibilityFilters = {
  showTasks: boolean
  showSuggestions: boolean
}

function parseFiltersFromParams(params: URLSearchParams): TaskFilters {
  const parseDate = (val?: string | null) => (val ? new Date(val) : undefined)
  return {
    assignedTo: params.get('assignedTo')?.split(',').filter(Boolean) ?? [],
    status: params.get('status')?.split(',').filter(Boolean) ?? [],
    deliveryDate: {
      from: parseDate(params.get('deliveryDateFrom')),
      to: parseDate(params.get('deliveryDateTo')),
    },
    publicationDate: {
      from: parseDate(params.get('publicationDateFrom')),
      to: parseDate(params.get('publicationDateTo')),
    },
    project: params.get('project')?.split(',').filter(Boolean) ?? [],
    contentType: params.get('contentType')?.split(',').filter(Boolean) ?? [],
    productionType: params.get('productionType')?.split(',').filter(Boolean) ?? [],
    language: params.get('language')?.split(',').filter(Boolean) ?? [],
    channels: params.get('channels')?.split(',').filter(Boolean) ?? [],
    overdueStatus: params.get('overdueStatus')?.split(',').filter(Boolean) ?? [],
  }
}

interface TasksUIState {
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  searchValue: string
  setSearchValue: (val: string) => void
  searchDraftValue: string
  setSearchDraftValue: (val: string) => void
  filters: TaskFilters
  setFilters: (filters: TaskFilters) => void
  syncFromUrl: (params: URLSearchParams) => void
  selectedTaskId: string | number | null
  setSelectedTaskId: (id: string | number | null) => void
  selectedTaskSeed: any | null
  setSelectedTaskSeed: (task: any | null) => void
  plannerVisibility: PlannerVisibilityFilters
  setPlannerVisibility: (patch: Partial<PlannerVisibilityFilters>) => void
}

export const useTasksUI = create<TasksUIState>((set, get) => ({
  viewMode: 'calendar',
  setViewMode: (mode) => set({ viewMode: mode }),
  searchValue: '',
  setSearchValue: (val) => set({ searchValue: val }),
  searchDraftValue: '',
  setSearchDraftValue: (val) => set({ searchDraftValue: val }),
  filters: {
    assignedTo: [],
    status: [],
    deliveryDate: {},
    publicationDate: {},
    project: [],
    contentType: [],
    productionType: [],
    language: [],
    channels: [],
    overdueStatus: [],
  },
  setFilters: (filters) => set({ filters }),
  syncFromUrl: (params) => {
    // Layout system now handles view mode independently, no longer sync from old view param
    // searchValue from ?q=...
    const q = params.get('q') || ''
    const nextFilters = parseFiltersFromParams(params)
    set((state) => {
      const sameSearch = state.searchValue === q && state.searchDraftValue === q
      const sameFilters = JSON.stringify(state.filters) === JSON.stringify(nextFilters)
      if (sameSearch && sameFilters) return state
      return {
        searchValue: q,
        searchDraftValue: q,
        filters: nextFilters,
      }
    })
  },
  selectedTaskId: null,
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),
  selectedTaskSeed: null,
  setSelectedTaskSeed: (task) => set({ selectedTaskSeed: task }),
  // Suggestions live on the project sheet (Suggestions tab), not mixed into planner views.
  plannerVisibility: { showTasks: true, showSuggestions: false },
  setPlannerVisibility: (patch) =>
    set((state) => ({
      plannerVisibility: {
        ...state.plannerVisibility,
        ...patch,
        showSuggestions: false,
      },
    })),
})) 