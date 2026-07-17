export type AiScope = 'global' | 'project' | 'task'
export type AiVisibility = 'private' | 'project' | 'team'
export type AiMessageStatus = 'pending' | 'failed' | 'sent' | 'streaming' | 'complete'

export interface AiAttachmentMeta {
  id?: string
  file_name: string
  file_path: string
  mime_type: string
  size: number
  preview_url?: string | null
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
  content_json?: unknown | null
  created_at: string
  created_by?: string | number | null
  attachments?: AiAttachmentMeta[] | null
  status?: AiMessageStatus
  client_id?: string // local-only optimistic id
}

export interface InFlightAssistantMessage extends AiMessage {
  role: 'assistant'
  status: 'streaming' | 'complete' | 'failed'
  is_optimistic: true
  reconciled_message_id?: string | null
  run_id?: string | null
  client_request_id?: string | null
  terminal_state?: import('../../app/lib/ai/ai-chat-v2-types').AiRunTerminalState | null
}

/** Mutable metadata for an in-flight V2 turn (shared between Composer/ChatWindow and send helper). */
export interface InFlightAiTurnMeta {
  clientRequestId: string
  assistantTempId: string | null
  runId: string | null
  terminalState: import('../../app/lib/ai/ai-chat-v2-types').AiRunTerminalState | null
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


