export interface Task {
  id: number
  title: string
  description?: string
  delivery_date?: string | null
  publication_date?: string | null
  created_at?: string
  updated_at?: string
  is_parent_task?: boolean
  users?: {
    full_name: string
  }
  project?: {
    name: string
  }
  content_types?: {
    title: string
  }
  project_statuses?: {
    name: string
  }
  languages?: {
    code: string
  }
  production_types?: {
    title: string
  }
}

export interface TaskFilters {
  assignedTo?: string[]
  status?: string[]
  deliveryDate?: { from?: Date; to?: Date }
  publicationDate?: { from?: Date; to?: Date }
  project?: string[]
  contentType?: string[]
  productionType?: string[]
  language?: string[]
  channels?: string[]
}

export interface FilterOption {
  id: string
  label: string
  color?: string
} 