export type TaskListEditBootstrapResponse = {
  users: Array<{ id: number; full_name: string; photo: string | null }>
  content_types: Array<{ id: number; title: string }>
  projects: Array<{ id: number; name: string; active: boolean | null; color: string | null; logo: string | null }>
  production_types: Array<{ id: number; title: string }>
  languages: Array<{ id: number; code: string | null; long_name: string | null }>
  channels: Array<{ id: number; name: string }>
}
