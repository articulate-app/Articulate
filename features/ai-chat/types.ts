export type AiScope = 'global' | 'project' | 'task'
export type AiVisibility = 'private' | 'project' | 'team'

export interface AiAttachmentMeta {
  file_name: string
  file_path: string
  mime_type: string
  size: number
}

export interface AiThread {
  id: string
  scope: AiScope
  visibility: AiVisibility
  is_collaborative: boolean
  title: string | null
  created_by?: number | null
  project_id?: number | null
  task_id?: number | null
  created_at: string
  last_message_at?: string | null
  is_deleted?: boolean
  language_code?: string | null
}

export interface AiMessage {
  id: string
  thread_id: string
  role: 'user' | 'assistant' | 'system'
  content: string | null
  content_json?: Record<string, any> | null
  created_at: string
  created_by?: string | number | null
  attachments?: AiAttachmentMeta[] | null
  status?: 'pending' | 'failed' | 'sent'
  client_id?: string // local-only optimistic id
}

export interface AiThreadContextLive {
  thread_id: string
  scope: AiScope
  effective_language_code: string | null
  project_name?: string | null
  task_title?: string | null
  project_id?: number | null
  task_id?: number | null
  editorial_line?: string | null
  briefing?: string | null
}


