"use client"

import { getSupabaseBrowser } from "../../../lib/supabase-browser"
import type {
  ArtifactAttachResult,
  ArtifactExportFormat,
  ArtifactGetResult,
  ArtifactRevisionConflict,
  ArtifactSaveResult,
  ArtifactVersionSummary,
  ArtifactVersionsListResult,
  ProjectArtifactsListResult,
  TaskArtifact,
  TaskArtifactsListResult,
  ThreadArtifactsListResult,
} from "../artifacts/artifact-types"
import { invokeEdgeFunctionFetch } from "../edge-functions"

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

export function normalizeTaskArtifact(row: unknown): TaskArtifact | null {
  const record = asRecord(row)
  if (!record) return null
  const id = toTrimmedString(record.id)
  if (!id) return null
  return {
    id,
    task_id: toFiniteNumber(record.task_id),
    project_id: toFiniteNumber(record.project_id),
    ai_thread_id: toTrimmedString(record.ai_thread_id),
    artifact_type: toTrimmedString(record.artifact_type) ?? "document",
    artifact_role: toTrimmedString(record.artifact_role),
    title: toTrimmedString(record.title),
    status: toTrimmedString(record.status) ?? "draft",
    sort_order: toFiniteNumber(record.sort_order),
    channel_id: toFiniteNumber(record.channel_id),
    language_id: toFiniteNumber(record.language_id),
    content_text: typeof record.content_text === "string" ? record.content_text : null,
    content_json: asRecord(record.content_json) as TaskArtifact["content_json"],
    asset_data: asRecord(record.asset_data) as TaskArtifact["asset_data"],
    source_artifact_id: toTrimmedString(record.source_artifact_id),
    source_version_number: toFiniteNumber(record.source_version_number),
    derivation_type: toTrimmedString(record.derivation_type),
    current_version: toFiniteNumber(record.current_version) ?? 0,
    metadata: asRecord(record.metadata),
    content_preview: toTrimmedString(record.content_preview),
    created_by: toFiniteNumber(record.created_by),
    created_at: toTrimmedString(record.created_at),
    updated_at: toTrimmedString(record.updated_at),
  }
}

function normalizeArtifactVersionSummary(row: unknown): ArtifactVersionSummary | null {
  const record = asRecord(row)
  if (!record) return null
  const versionNumber = toFiniteNumber(record.version_number)
  if (versionNumber == null || versionNumber <= 0) return null
  return {
    version_number: versionNumber,
    change_source: toTrimmedString(record.change_source),
    changed_by: toFiniteNumber(record.changed_by),
    ai_message_id: toTrimmedString(record.ai_message_id),
    ai_thread_id: toTrimmedString(record.ai_thread_id),
    ai_run_id: toTrimmedString(record.ai_run_id),
    change_summary: toTrimmedString(record.change_summary),
    created_at: toTrimmedString(record.created_at),
    title: toTrimmedString(record.title),
    status: toTrimmedString(record.status),
    content_preview: toTrimmedString(record.content_preview),
    asset_count: toFiniteNumber(record.asset_count) ?? 0,
    is_current: record.is_current === true,
  }
}

function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim())
    } catch {
      /* fall through */
    }
  }
  const plainMatch = header.match(/filename="?([^";]+)"?/i)
  return plainMatch?.[1]?.trim() || null
}

function parseRevisionConflict(error: unknown): ArtifactRevisionConflict | null {
  if (!error || typeof error !== "object") return null
  const row = error as Record<string, unknown>
  const message = typeof row.message === "string" ? row.message : ""
  const details = typeof row.details === "string" ? row.details : ""
  const code =
    typeof row.code === "string"
      ? row.code
      : message.includes("artifact_revision_conflict")
        ? "artifact_revision_conflict"
        : null
  if (code !== "artifact_revision_conflict" && !message.includes("artifact_revision_conflict")) {
    return null
  }
  let expected: number | null = null
  let current: number | null = null
  try {
    const detailJson = details ? (JSON.parse(details) as Record<string, unknown>) : null
    expected = toFiniteNumber(detailJson?.expected_version)
    current = toFiniteNumber(detailJson?.current_version)
  } catch {
    /* ignore */
  }
  return {
    code: "artifact_revision_conflict",
    expected_version: expected,
    current_version: current,
    message: message || "artifact_revision_conflict",
  }
}

export async function listTaskArtifacts(args: {
  taskId: number
  includeContent?: boolean
  limit?: number
}): Promise<TaskArtifactsListResult> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_list_task_artifacts_v1", {
    p_task_id: args.taskId,
    p_include_content: args.includeContent ?? true,
    p_limit: args.limit ?? 100,
  })
  if (error) throw error
  const root = asRecord(data) ?? {}
  const artifacts = Array.isArray(root.artifacts)
    ? root.artifacts.map(normalizeTaskArtifact).filter(Boolean) as TaskArtifact[]
    : []
  return {
    ok: true,
    task_id: toFiniteNumber(root.task_id) ?? args.taskId,
    task_title: toTrimmedString(root.task_title),
    project_id: toFiniteNumber(root.project_id),
    available_channels: Array.isArray(root.available_channels)
      ? (root.available_channels as TaskArtifactsListResult["available_channels"])
      : [],
    available_languages: Array.isArray(root.available_languages)
      ? (root.available_languages as TaskArtifactsListResult["available_languages"])
      : [],
    artifacts,
  }
}

export async function listProjectArtifacts(args: {
  projectId: number
  includeContent?: boolean
  limit?: number
}): Promise<ProjectArtifactsListResult> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_list_project_artifacts_v1", {
    p_project_id: args.projectId,
    p_include_content: args.includeContent ?? true,
    p_limit: args.limit ?? 100,
  })
  if (error) throw error
  const root = asRecord(data) ?? {}
  const artifacts = Array.isArray(root.artifacts)
    ? (root.artifacts.map(normalizeTaskArtifact).filter(Boolean) as TaskArtifact[])
    : []
  return {
    ok: true,
    project_id: toFiniteNumber(root.project_id) ?? args.projectId,
    project_name: toTrimmedString(root.project_name),
    artifacts,
  }
}

export async function listArtifactVersions(args: {
  artifactId: string
  limit?: number
  offset?: number
}): Promise<ArtifactVersionsListResult> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_list_artifact_versions_v1", {
    p_artifact_id: args.artifactId,
    p_limit: args.limit ?? 50,
    p_offset: args.offset ?? 0,
  })
  if (error) throw error
  const root = asRecord(data) ?? {}
  const versions = Array.isArray(root.versions)
    ? (root.versions.map(normalizeArtifactVersionSummary).filter(Boolean) as ArtifactVersionSummary[])
    : []
  return {
    ok: true,
    artifact_id: toTrimmedString(root.artifact_id) ?? args.artifactId,
    current_version: toFiniteNumber(root.current_version) ?? 0,
    total: toFiniteNumber(root.total) ?? versions.length,
    limit: toFiniteNumber(root.limit) ?? args.limit ?? 50,
    offset: toFiniteNumber(root.offset) ?? args.offset ?? 0,
    versions,
  }
}

export async function restoreArtifactVersion(args: {
  artifactId: string
  versionNumber: number
  changeSummary?: string | null
}): Promise<ArtifactSaveResult> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_restore_artifact_version_v1", {
    p_artifact_id: args.artifactId,
    p_version_number: args.versionNumber,
    p_change_summary: args.changeSummary ?? null,
  })
  if (error) throw error
  const root = asRecord(data) ?? {}
  const snapshot = normalizeTaskArtifact(root.snapshot ?? root.artifact)
  if (!snapshot) throw new Error("ai_restore_artifact_version_v1 returned no snapshot")
  return {
    ok: true,
    artifact_id: toTrimmedString(root.artifact_id) ?? snapshot.id,
    version_number: toFiniteNumber(root.version_number) ?? snapshot.current_version,
    snapshot,
  }
}

/**
 * Call the authenticated `artifact-export` edge function and trigger a browser download.
 */
export async function exportArtifactDownload(args: {
  artifactId: string
  versionNumber?: number | null
  format: ArtifactExportFormat
  attachmentId?: string | null
}): Promise<void> {
  if (args.format === "docx") {
    throw new Error("Word export must be generated in the browser. Use exportArtifactAsDocx.")
  }
  const supabase = getSupabaseBrowser()
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!baseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured")
  const url = `${baseUrl.replace(/\/$/, "")}/functions/v1/artifact-export`
  const response = await invokeEdgeFunctionFetch({
    supabase,
    url,
    debugLabel: "artifact-export",
    headers: { "Content-Type": "application/json" },
    init: {
      method: "POST",
      body: JSON.stringify({
        artifact_id: args.artifactId,
        version_number: args.versionNumber ?? null,
        format: args.format,
        ...(args.attachmentId ? { attachment_id: args.attachmentId } : {}),
      }),
    },
  })
  if (!response.ok) {
    let message = `Export failed (${response.status})`
    try {
      const payload = (await response.json()) as { error?: { message?: string; code?: string } }
      message = payload?.error?.message || payload?.error?.code || message
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  const blob = await response.blob()
  const filename =
    filenameFromContentDisposition(response.headers.get("Content-Disposition")) ||
    `artifact.${args.format === "original" ? "bin" : args.format === "md" ? "md" : args.format}`
  const objectUrl = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement("a")
    anchor.href = objectUrl
    anchor.download = filename
    anchor.rel = "noopener"
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export async function listAiThreadArtifacts(args: {
  threadId: string
  includeContent?: boolean
  limit?: number
}): Promise<ThreadArtifactsListResult> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_list_ai_thread_artifacts_v1", {
    p_thread_id: args.threadId,
    p_include_content: args.includeContent ?? true,
    p_limit: args.limit ?? 100,
  })
  if (error) throw error
  const root = asRecord(data) ?? {}
  const artifacts = Array.isArray(root.artifacts)
    ? root.artifacts.map(normalizeTaskArtifact).filter(Boolean) as TaskArtifact[]
    : []
  return {
    ok: true,
    thread_id: toTrimmedString(root.thread_id) ?? args.threadId,
    artifacts,
  }
}

export async function getArtifact(args: {
  artifactId: string
  versionNumber?: number | null
}): Promise<ArtifactGetResult> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_get_artifact_v2", {
    p_artifact_id: args.artifactId,
    p_version_number: args.versionNumber ?? null,
  })
  if (error) throw error
  const root = asRecord(data) ?? {}
  const snapshot = normalizeTaskArtifact(root.snapshot)
  if (!snapshot) throw new Error("ai_get_artifact_v2 returned no snapshot")
  return {
    ok: true,
    artifact_id: toTrimmedString(root.artifact_id) ?? snapshot.id,
    version_number: toFiniteNumber(root.version_number) ?? snapshot.current_version,
    snapshot,
  }
}

export async function deleteArtifact(args: {
  artifactId: string
}): Promise<{ ok: true; artifact_id: string; status?: string; already_archived?: boolean }> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_delete_artifact_v1", {
    p_artifact_id: args.artifactId,
  })
  if (error) throw error
  const root = asRecord(data) ?? {}
  return {
    ok: true,
    artifact_id: toTrimmedString(root.artifact_id) ?? args.artifactId,
    status: toTrimmedString(root.status) ?? undefined,
    already_archived: root.already_archived === true,
  }
}

export async function reorderArtifacts(args: {
  orderedIds: string[]
}): Promise<{ ok: true; count: number; updated: number }> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_reorder_artifacts_v1", {
    p_ordered_ids: args.orderedIds,
  })
  if (error) throw error
  const root = asRecord(data) ?? {}
  return {
    ok: true,
    count: toFiniteNumber(root.count) ?? args.orderedIds.length,
    updated: toFiniteNumber(root.updated) ?? 0,
  }
}

export async function attachArtifactToTask(args: {
  artifactId: string
  taskId: number
  channelId?: number | null
  languageId?: number | null
}): Promise<ArtifactAttachResult> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_attach_artifact_to_task_v1", {
    p_artifact_id: args.artifactId,
    p_task_id: args.taskId,
    p_channel_id: args.channelId ?? null,
    p_language_id: args.languageId ?? null,
  })
  if (error) throw error
  const root = asRecord(data) ?? {}
  const artifact = normalizeTaskArtifact(root.artifact)
  if (!artifact) throw new Error("ai_attach_artifact_to_task_v1 returned no artifact")
  return { ok: true, artifact }
}

export async function attachArtifactToProject(args: {
  artifactId: string
  projectId: number
}): Promise<ArtifactAttachResult> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_attach_artifact_to_project_v1", {
    p_artifact_id: args.artifactId,
    p_project_id: args.projectId,
  })
  if (error) throw error
  const root = asRecord(data) ?? {}
  const artifact = normalizeTaskArtifact(root.artifact)
  if (!artifact) throw new Error("ai_attach_artifact_to_project_v1 returned no artifact")
  return { ok: true, artifact }
}

export type SaveArtifactSnapshotInput = {
  title?: string | null
  status?: string | null
  content_text?: string | null
  content_json?: unknown
  asset_data?: unknown
  metadata?: Record<string, unknown> | null
}

/**
 * Persist an artifact version. Always send the current expected version.
 * On conflict, returns a typed conflict (does not overwrite).
 */
export async function saveWorkspaceArtifact(args: {
  artifactId: string
  expectedVersion: number
  snapshot: SaveArtifactSnapshotInput
  changeSource?: string | null
  changedBy?: number | null
  aiMessageId?: string | null
  aiThreadId?: string | null
  aiRunId?: string | null
  changeSummary?: string | null
}): Promise<ArtifactSaveResult | ArtifactRevisionConflict> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_save_workspace_artifact_v2", {
    p_artifact_id: args.artifactId,
    p_expected_version: args.expectedVersion,
    p_snapshot: args.snapshot,
    p_change_source: args.changeSource ?? "manual",
    p_changed_by: args.changedBy ?? null,
    p_ai_message_id: args.aiMessageId ?? null,
    p_ai_thread_id: args.aiThreadId ?? null,
    p_ai_run_id: args.aiRunId ?? null,
    p_change_summary: args.changeSummary ?? null,
  })
  if (error) {
    const conflict = parseRevisionConflict(error)
    if (conflict) return conflict
    throw error
  }
  const root = asRecord(data) ?? {}
  // Soft conflict from ai_save_workspace_artifact_v2 (no Postgres RAISE / ERROR log).
  if (root.ok === false || root.code === "artifact_revision_conflict") {
    return {
      code: "artifact_revision_conflict" as const,
      expected_version: toFiniteNumber(root.expected_version),
      current_version: toFiniteNumber(root.current_version),
      message:
        toTrimmedString(root.message) || "artifact_revision_conflict",
    }
  }
  const snapshot = normalizeTaskArtifact(root.snapshot)
  if (!snapshot) throw new Error("ai_save_workspace_artifact_v2 returned no snapshot")
  return {
    ok: true,
    artifact_id: toTrimmedString(root.artifact_id) ?? snapshot.id,
    version_number: toFiniteNumber(root.version_number) ?? snapshot.current_version,
    snapshot,
  }
}
