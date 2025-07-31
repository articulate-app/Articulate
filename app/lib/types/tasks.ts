export interface Task {
  id: string
  title: string
  notes?: string
  briefing?: string
  delivery_date?: string
  publication_date?: string
  assigned_to_id?: string | null
  project_id_int?: number | null
  project_name?: string
  content_type_id?: string
  production_type_id?: string
  language_id?: string
  project_status_id?: string
  project_status_name?: string
  project_status_color?: string
  parent_task_id_int?: number | null
  users?: {
    id: string
    full_name: string
  }
  projects?: { id: number; name: string; color?: string } | null;
  project_statuses?: { id: number; name: string; color?: string } | null;
  content_types?: {
    title: string
  }[]
  production_types?: {
    title: string
  }[]
  languages?: {
    code: string
  }[]
}

export interface TaskFilters {
  assignedTo?: string[]
  status?: string[]
  project?: string[]
  contentType?: string[]
  productionType?: string[]
  language?: string[]
  deliveryDate?: {
    from?: string
    to?: string
  }
  publicationDate?: {
    from?: string
    to?: string
  }
}

export interface TasksResponse {
  tasks: Task[]
  nextCursor: number | null
  hasMore: boolean
} 