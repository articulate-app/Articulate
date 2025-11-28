export type TaskWithJoins = {
  id: number
  title: string
  delivery_date: string | null
  publication_date: string | null
  updated_at: string | null
  users: { full_name: string } | null
  projects: { name: string; color?: string } | null
  project_statuses: { name: string; color?: string } | null
  is_overdue?: boolean
  is_publication_overdue?: boolean
} 