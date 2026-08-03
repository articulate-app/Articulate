/** Generic factual input sources (not artifacts / deliverables). */

export type SourceType =
  | "url"
  | "file"
  | "pasted_text"
  | "web_research"
  | "task_reference"
  | "artifact_reference"
  | "note"
  | "dataset"
  | "other"

export type SourceStatus = "pending" | "ready" | "failed" | "archived"

export type SourceRecord = {
  id: string
  task_id: number | null
  project_id: number | null
  ai_thread_id: string | null
  source_type: SourceType
  title: string
  status: SourceStatus
  source_url: string | null
  attachment_id: string | null
  content_text: string | null
  content_json: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  content_hash: string | null
  current_version: number
  created_by: number | null
  created_at: string | null
  updated_at: string | null
  content_preview?: string | null
  app_link?: string | null
}

export type SourceListItem = Pick<
  SourceRecord,
  | "id"
  | "task_id"
  | "project_id"
  | "ai_thread_id"
  | "source_type"
  | "title"
  | "status"
  | "source_url"
  | "attachment_id"
  | "current_version"
  | "metadata"
  | "created_at"
  | "updated_at"
  | "content_preview"
  | "app_link"
>

export type SourceGetResult = {
  ok: true
  source: SourceRecord
  version_number: number
}

export type SourceCreateResult = {
  ok: true
  source: SourceRecord
  version_number: number
  import_started?: boolean
}

export type SourceListResult = {
  ok: true
  sources: SourceListItem[]
}

export type SourceAttachResult = {
  ok: true
  source: SourceRecord
}

export type TaggedSourceRef = {
  source_id: string
  title?: string | null
  task_id?: number | null
  project_id?: number | null
}

export function sourceScopeLabel(source: {
  task_id?: number | null
  project_id?: number | null
  ai_thread_id?: string | null
}): "Task" | "Project" | "AI thread" | "Unattached" | "Combined" {
  const hasTask = source.task_id != null
  const hasProject = source.project_id != null
  const hasThread = !!source.ai_thread_id
  const count = Number(hasTask) + Number(hasProject) + Number(hasThread)
  if (count === 0) return "Unattached"
  if (count > 1) return "Combined"
  if (hasTask) return "Task"
  if (hasProject) return "Project"
  return "AI thread"
}
