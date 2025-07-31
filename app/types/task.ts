export interface Task {
  id: number
  title: string
  project_id_int: number
  assigned_to_id: number | null
  project_status_id: number | null
  content_type_id: number | null
  production_type_id: number | null
  language_id: number | null
  users: { id: number; full_name: string } | null
  projects: { id: number; name: string }[]
  project_statuses: { id: number; name: string; color: string }[]
  content_types: { id: number; title: string }[]
  production_types: { id: number; title: string }[]
  languages: { id: number; code: string }[]
  briefing?: string
  meta_title?: string
  meta_description?: string
  keyword?: string
  delivery_date?: string
  publication_date?: string
  attachment?: string
  key_visual?: string
}

export interface Thread {
  id: number | string
  title: string | null
  created_at: string
  task_id: number
  isOptimistic?: boolean
  thread_watchers?: {
    watcher_id: number;
    users: {
      id: number;
      full_name: string;
      email: string;
      photo?: string;
    };
  }[];
} 