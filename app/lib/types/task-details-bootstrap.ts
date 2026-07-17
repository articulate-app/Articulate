/**
 * Extra fields returned by the `task-details-bootstrap` edge function (merged onto the task / payload).
 * `watchers` on the same payload remains thread watchers — do not confuse with `task_watchers`.
 */
export type TaskBootstrapTaskWatcher = {
  user_id: number
  full_name: string
  photo: string | null
}

export type TaskBootstrapRelatedIdea = {
  id: string
  task_id: number
  project_id: number | null
  title: string | null
  description: string | null
  content_type_id: number | null
  status: string
}

/** `task_channels` row joined with `channels` (PostgREST shape). */
export type TaskBootstrapTaskChannelRow = {
  channel_id: number
  channels?: { id?: number; name?: string | null } | null
}

/** Attachment row for `table_name = 'tasks'` (matches `attachments` select / Dropzone). */
export type TaskBootstrapAttachment = {
  id: string
  file_name: string
  file_path: string
  uploaded_at: string
  uploaded_by: string | null
  mime_type: string | null
  size: number | null
}

export type TaskDetailsBootstrapExtras = {
  attachments?: TaskBootstrapAttachment[]
  task_channels?: TaskBootstrapTaskChannelRow[]
  task_watchers?: TaskBootstrapTaskWatcher[]
  eligible_task_watchers?: TaskBootstrapTaskWatcher[]
  related_ideas?: TaskBootstrapRelatedIdea[]
}

export type OptimisticTaskDetail = Record<string, unknown> & {
  id: string
  title: string
  task_channels?: TaskBootstrapTaskChannelRow[]
  channel_names?: string[]
  attachments?: TaskBootstrapAttachment[]
  __bootstrapStatus?: "pending" | "loaded" | "error"
  __bootstrapError?: string | null
}

export type TaskDetailsBootstrapResponse = TaskDetailsBootstrapExtras & {
  task?: Record<string, unknown>
  [key: string]: unknown
}

export type TaskDetailMergeResult = {
  merged: Record<string, unknown>
  didChange: boolean
}

export function taskBootstrapWatcherToWatcherUser(row: TaskBootstrapTaskWatcher): {
  watcher_user_id: number
  full_name: string | null
  photo: string | null
} {
  return {
    watcher_user_id: row.user_id,
    full_name: row.full_name ?? null,
    photo: row.photo ?? null,
  }
}

/**
 * Maps bootstrap `task_channels` to `{ channel_id, name }[]` (same order as edge function; UI may sort).
 */
export function normalizeBootstrapTaskChannels(
  rows: unknown,
): { channel_id: number; name: string }[] {
  if (!Array.isArray(rows)) return []
  const out: { channel_id: number; name: string }[] = []
  for (const raw of rows) {
    const r = raw as TaskBootstrapTaskChannelRow
    const cid = Number(r?.channel_id)
    if (!Number.isFinite(cid)) continue
    const nested = r?.channels
    const name =
      nested && typeof nested === "object" && nested.name != null
        ? String(nested.name)
        : ""
    out.push({ channel_id: cid, name })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Coerces bootstrap / DB attachment rows to strings and Dropzone shape. */
export function normalizeBootstrapAttachments(rows: unknown): TaskBootstrapAttachment[] {
  if (!Array.isArray(rows)) return []
  const out: TaskBootstrapAttachment[] = []
  for (const raw of rows) {
    const r = raw as Record<string, unknown>
    const id = r?.id != null ? String(r.id) : ""
    if (!id) continue
    out.push({
      id,
      file_name: r?.file_name != null ? String(r.file_name) : "",
      file_path: r?.file_path != null ? String(r.file_path) : "",
      uploaded_at: r?.uploaded_at != null ? String(r.uploaded_at) : "",
      uploaded_by: r?.uploaded_by != null ? String(r.uploaded_by) : null,
      mime_type: r?.mime_type != null ? String(r.mime_type) : null,
      size: r?.size != null && Number.isFinite(Number(r.size)) ? Number(r.size) : null,
    })
  }
  return out
}

/** Normalizes edge/PostgREST rows for the related-ideas UI (matches prior `task_related_ideas` select). */
export function normalizeBootstrapRelatedIdeas(rows: unknown): TaskBootstrapRelatedIdea[] {
  if (!Array.isArray(rows)) return []
  const out: TaskBootstrapRelatedIdea[] = []
  for (const raw of rows) {
    const r = raw as Record<string, unknown>
    const id = r?.id != null ? String(r.id) : ""
    const taskId = Number(r?.task_id)
    if (!id || !Number.isFinite(taskId)) continue
    const projectIdRaw = r?.project_id
    const projectId =
      projectIdRaw != null && Number.isFinite(Number(projectIdRaw)) ? Number(projectIdRaw) : null
    out.push({
      id,
      task_id: taskId,
      project_id: projectId,
      title: r?.title != null ? String(r.title) : null,
      description: r?.description != null ? String(r.description) : null,
      content_type_id: r?.content_type_id != null ? Number(r.content_type_id) : null,
      status: r?.status != null ? String(r.status) : "proposed",
    })
  }
  return out
}
