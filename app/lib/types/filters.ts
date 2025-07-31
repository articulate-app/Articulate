export type FilterValue = string[] | { from?: Date; to?: Date }

export interface TaskFilters {
  assignedTo: string[]
  status: string[]
  deliveryDate: {
    from?: Date
    to?: Date
  }
  publicationDate: {
    from?: Date
    to?: Date
  }
  project: string[]
  contentType: string[]
  productionType: string[]
  language: string[]
  channels: string[]
}

export type TaskFilterValues = TaskFilters & {
  [key: string]: FilterValue
}

export interface FilterOption {
  id: string
  label: string
  color?: string
}

export interface FilterSection {
  id: keyof TaskFilters
  label: string
  type: 'multi-select' | 'date-range'
  options?: FilterOption[]
  isSearchable?: boolean
} 