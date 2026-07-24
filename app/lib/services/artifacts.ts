"use client"

import { getSupabaseBrowser } from "../../../lib/supabase-browser"
import type {
  ArtifactAttachResult,
  ArtifactGetResult,
  ArtifactRevisionConflict,
  ArtifactSaveResult,
  TaskArtifact,
  TaskArtifactsListResult,
  ThreadArtifactsListResult,
} from "../artifacts/artifact-types"

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
    ai_thread_id: toTrimmedString(record.ai_thread_id),
    artifact_type: toTrimmedString(record.artifact_type) ?? "document",
    artifact_role: toTrimmedString(record.artifact_role),
    title: toTrimmedString(record.title),
    status: toTrimmedString(record.status) ?? "draft",
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
  const snapshot = normalizeTaskArtifact(root.snapshot)
  if (!snapshot) throw new Error("ai_save_workspace_artifact_v2 returned no snapshot")
  return {
    ok: true,
    artifact_id: toTrimmedString(root.artifact_id) ?? snapshot.id,
    version_number: toFiniteNumber(root.version_number) ?? snapshot.current_version,
    snapshot,
  }
}
