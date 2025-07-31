export interface Task {
  id: number
  title: string
  description?: string
  assigned_to_id?: string
  project_status_id?: string
  project_id_int?: number
  content_type_id?: string
  production_type_id?: string
  language_id?: string
  delivery_date?: string
  publication_date?: string
  created_at: string
  updated_at: string
  users?: {
    full_name: string
  }
  project?: {
    name: string
  }
  content_types?: {
    title: string
  }
  production_types?: {
    title: string
  }
  languages?: {
    code: string
  }
  project_statuses?: {
    name: string
  }
}

export interface TaskFilters {
  [key: string]: string[] | { from?: Date; to?: Date }
}

export interface ProjectCard {
  id: number
  name: string
  team: Array<{ id: string; full_name: string }>
  lastActivity: string | null
}