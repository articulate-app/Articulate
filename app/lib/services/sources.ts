"use client"

import { getSupabaseBrowser } from "../../../lib/supabase-browser"
import { invokeEdgeFunctionFetch } from "../edge-functions"
import type {
  SourceAttachResult,
  SourceCreateResult,
  SourceGetResult,
  SourceListItem,
  SourceListResult,
  SourceRecord,
  SourceStatus,
  SourceType,
} from "../sources/source-types"

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

const SOURCE_TYPES = new Set<SourceType>([
  "url",
  "file",
  "pasted_text",
  "web_research",
  "task_reference",
  "artifact_reference",
  "note",
  "dataset",
  "other",
])

const SOURCE_STATUSES = new Set<SourceStatus>(["pending", "ready", "failed", "archived"])

function normalizeSourceType(value: unknown): SourceType {
  const raw = toTrimmedString(value)
  if (raw && SOURCE_TYPES.has(raw as SourceType)) return raw as SourceType
  return "other"
}

function normalizeSourceStatus(value: unknown): SourceStatus {
  const raw = toTrimmedString(value)
  if (raw && SOURCE_STATUSES.has(raw as SourceStatus)) return raw as SourceStatus
  return "ready"
}

export function normalizeSourceRecord(row: unknown): SourceRecord | null {
  const record = asRecord(row)
  if (!record) return null
  const id = toTrimmedString(record.id)
  if (!id) return null
  return {
    id,
    task_id: toFiniteNumber(record.task_id),
    project_id: toFiniteNumber(record.project_id),
    ai_thread_id: toTrimmedString(record.ai_thread_id),
    source_type: normalizeSourceType(record.source_type),
    title: toTrimmedString(record.title) ?? "Untitled source",
    status: normalizeSourceStatus(record.status),
    source_url: toTrimmedString(record.source_url),
    attachment_id: toTrimmedString(record.attachment_id),
    content_text: typeof record.content_text === "string" ? record.content_text : null,
    content_json: asRecord(record.content_json),
    metadata: asRecord(record.metadata),
    content_hash: toTrimmedString(record.content_hash),
    current_version: toFiniteNumber(record.current_version) ?? 0,
    created_by: toFiniteNumber(record.created_by),
    created_at: toTrimmedString(record.created_at),
    updated_at: toTrimmedString(record.updated_at),
    content_preview: toTrimmedString(record.content_preview),
    app_link: toTrimmedString(record.app_link) ?? `app://source/${id}`,
  }
}

function normalizeSourceListItem(row: unknown): SourceListItem | null {
  const full = normalizeSourceRecord(row)
  if (!full) return null
  return {
    id: full.id,
    task_id: full.task_id,
    project_id: full.project_id,
    ai_thread_id: full.ai_thread_id,
    source_type: full.source_type,
    title: full.title,
    status: full.status,
    source_url: full.source_url,
    attachment_id: full.attachment_id,
    current_version: full.current_version,
    metadata: full.metadata,
    created_at: full.created_at,
    updated_at: full.updated_at,
    content_preview: full.content_preview,
    app_link: full.app_link,
  }
}

export async function getSource(args: {
  sourceId: string
  versionNumber?: number | null
}): Promise<SourceGetResult> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_get_source_v1", {
    p_source_id: args.sourceId,
    p_version_number: args.versionNumber ?? null,
  })
  if (error) throw error
  const root = asRecord(data) ?? {}
  const source = normalizeSourceRecord(root.source)
  if (!source) throw new Error("ai_get_source_v1 returned no source")
  return {
    ok: true,
    source,
    version_number: toFiniteNumber(root.version_number) ?? source.current_version,
  }
}

export async function listSources(args?: {
  taskId?: number | null
  projectId?: number | null
  aiThreadId?: string | null
  unattachedOnly?: boolean
  limit?: number
  offset?: number
}): Promise<SourceListResult> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_list_sources_v1", {
    p_task_id: args?.taskId ?? null,
    p_project_id: args?.projectId ?? null,
    p_ai_thread_id: args?.aiThreadId ?? null,
    p_unattached_only: args?.unattachedOnly ?? false,
    p_limit: args?.limit ?? 100,
    p_offset: args?.offset ?? 0,
  })
  if (error) throw error
  const root = asRecord(data) ?? {}
  const sources = Array.isArray(root.sources)
    ? (root.sources.map(normalizeSourceListItem).filter(Boolean) as SourceListItem[])
    : []
  return { ok: true, sources }
}

export async function createSource(args: {
  sourceType: SourceType
  title: string
  taskId?: number | null
  projectId?: number | null
  aiThreadId?: string | null
  sourceUrl?: string | null
  attachmentId?: string | null
  contentText?: string | null
  contentJson?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  changeSource?: string | null
  /** When true (default for url/file), dispatch ai-source-import-worker without blocking. */
  startImport?: boolean
}): Promise<SourceCreateResult> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_create_source_v1", {
    p_source_type: args.sourceType,
    p_title: args.title,
    p_task_id: args.taskId ?? null,
    p_project_id: args.projectId ?? null,
    p_ai_thread_id: args.aiThreadId ?? null,
    p_source_url: args.sourceUrl ?? null,
    p_attachment_id: args.attachmentId ?? null,
    p_content_text: args.contentText ?? null,
    p_content_json: args.contentJson ?? null,
    p_metadata: args.metadata ?? {},
    p_change_source: args.changeSource ?? "user",
  })
  if (error) throw error
  const root = asRecord(data) ?? {}
  const source = normalizeSourceRecord(root.source)
  if (!source) throw new Error("ai_create_source_v1 returned no source")

  const shouldImport =
    args.startImport !== false &&
    !args.contentText &&
    (args.sourceType === "url" || args.sourceType === "file" || !!args.attachmentId || !!args.sourceUrl)

  let importStarted = false
  if (shouldImport) {
    importStarted = await dispatchSourceImport(source.id).catch(() => false)
  }

  return {
    ok: true,
    source,
    version_number: toFiniteNumber(root.version_number) ?? source.current_version,
    import_started: importStarted,
  }
}

export async function attachSourceScope(args: {
  sourceId: string
  taskId?: number | null
  projectId?: number | null
  aiThreadId?: string | null
  replace?: boolean
}): Promise<SourceAttachResult> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_attach_source_scope_v1", {
    p_source_id: args.sourceId,
    p_task_id: args.taskId ?? null,
    p_project_id: args.projectId ?? null,
    p_ai_thread_id: args.aiThreadId ?? null,
    p_replace: args.replace ?? false,
  })
  if (error) throw error
  const root = asRecord(data) ?? {}
  const source = normalizeSourceRecord(root.source)
  if (!source) throw new Error("ai_attach_source_scope_v1 returned no source")
  return { ok: true, source }
}

/** Fire-and-forget URL/file extraction. Does not block the caller on completion. */
export async function dispatchSourceImport(sourceId: string): Promise<boolean> {
  const supabase = getSupabaseBrowser()
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-source-import-worker`
  const res = await invokeEdgeFunctionFetch({
    supabase,
    url,
    init: {
      method: "POST",
      body: JSON.stringify({ source_id: sourceId }),
    },
    headers: { "Content-Type": "application/json" },
    debugLabel: "ai-source-import-worker",
  })
  return res.ok
}

export async function refreshSource(sourceId: string): Promise<{ ok: true; import_started: boolean }> {
  const started = await dispatchSourceImport(sourceId)
  return { ok: true, import_started: started }
}

/**
 * Upload a file, create an attachments row, then create a pending source.
 * Extraction runs asynchronously in ai-source-import-worker.
 */
export async function createSourceFromFile(args: {
  file: File
  title?: string | null
  taskId?: number | null
  projectId?: number | null
  aiThreadId?: string | null
}): Promise<SourceCreateResult> {
  const supabase = getSupabaseBrowser()
  const safeName = args.file.name.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 180)
  const path = `sources/${crypto.randomUUID()}-${safeName}`
  const { data: up, error: uploadError } = await supabase.storage
    .from("attachments")
    .upload(path, args.file, { upsert: false })
  if (uploadError) throw uploadError

  const { data: attachmentRow, error: attachmentError } = await supabase
    .from("attachments")
    .insert({
      table_name: "sources",
      record_id: "pending",
      file_name: args.file.name,
      file_path: up.path,
      mime_type: args.file.type || "application/octet-stream",
      size: args.file.size,
    })
    .select("id")
    .single()
  if (attachmentError) throw attachmentError
  const attachmentId = toTrimmedString(attachmentRow?.id)
  if (!attachmentId) throw new Error("attachment_insert_failed")

  const result = await createSource({
    sourceType: "file",
    title: args.title?.trim() || args.file.name || "Uploaded file",
    taskId: args.taskId,
    projectId: args.projectId,
    aiThreadId: args.aiThreadId,
    attachmentId,
    changeSource: "user",
    startImport: true,
  })

  void supabase
    .from("attachments")
    .update({ record_id: result.source.id })
    .eq("id", attachmentId)

  return result
}

export async function createSourceFromUrl(args: {
  url: string
  title?: string | null
  taskId?: number | null
  projectId?: number | null
  aiThreadId?: string | null
}): Promise<SourceCreateResult> {
  const url = args.url.trim()
  if (!url) throw new Error("source_url_required")
  let title = args.title?.trim() || ""
  if (!title) {
    try {
      title = new URL(url).hostname || "URL source"
    } catch {
      title = "URL source"
    }
  }
  return createSource({
    sourceType: "url",
    title,
    taskId: args.taskId,
    projectId: args.projectId,
    aiThreadId: args.aiThreadId,
    sourceUrl: url,
    changeSource: "user",
    startImport: true,
  })
}

export async function createSourceFromAttachment(args: {
  attachmentId: string
  title?: string | null
  taskId?: number | null
  projectId?: number | null
  aiThreadId?: string | null
}): Promise<SourceCreateResult> {
  return createSource({
    sourceType: "file",
    title: args.title?.trim() || "Attachment source",
    taskId: args.taskId,
    projectId: args.projectId,
    aiThreadId: args.aiThreadId,
    attachmentId: args.attachmentId,
    changeSource: "user",
    startImport: true,
  })
}
