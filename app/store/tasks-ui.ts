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
  }
}

interface TasksUIState {
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  searchValue: string
  setSearchValue: (val: string) => void
  filters: TaskFilters
  setFilters: (filters: TaskFilters) => void
  syncFromUrl: (params: URLSearchParams) => void
  selectedTaskId: string | number | null
  setSelectedTaskId: (id: string | number | null) => void
}

export const useTasksUI = create<TasksUIState>((set, get) => ({
  viewMode: 'calendar',
  setViewMode: (mode) => set({ viewMode: mode }),
  searchValue: '',
  setSearchValue: (val) => set({ searchValue: val }),
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
  },
  setFilters: (filters) => set({ filters }),
  syncFromUrl: (params) => {
    // Layout system now handles view mode independently, no longer sync from old view param
    // searchValue from ?q=...
    const q = params.get('q') || ''
    set({ searchValue: q })
    // filters
    set({ filters: parseFiltersFromParams(params) })
  },
  selectedTaskId: null,
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),
})) 