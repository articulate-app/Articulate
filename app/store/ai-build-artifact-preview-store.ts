"use client"

import { create } from "zustand"
import type {
  ArtifactAssetData,
  ArtifactContentJson,
} from "../lib/artifacts/artifact-types"

export type AiBuildArtifactPreviewPhase =
  | "plan_ready"
  | "started"
  | "media"
  | "preview"
  | "saved"
  | "failed"

export type AiBuildArtifactMediaProgress = {
  itemId?: string | null
  attachmentId?: string | null
  status?: string | null
  progress?: number | null
  message?: string | null
}

export type AiBuildArtifactPreviewEntry = {
  /** `${buildId}:${unitId}:${artifactId}` */
  key: string
  buildId: string
  unitId: string
  artifactId: string
  taskId: number | null
  aiThreadId: string | null
  channelId: number | null
  languageId: number | null
  channelName: string | null
  languageName: string | null
  artifactType: string | null
  artifactRole: string | null
  title: string | null
  contentText: string
  contentJson: ArtifactContentJson | null
  assetData: ArtifactAssetData | null
  currentVersion: number | null
  phase: AiBuildArtifactPreviewPhase
  sequence: number
  errorMessage: string | null
  media: AiBuildArtifactMediaProgress[]
  threadId: string | null
  assistantMessageIds: Record<string, true>
  updatedAt: string
}

type AiBuildArtifactPreviewState = {
  previews: Record<string, AiBuildArtifactPreviewEntry>
  upsertFromEvent: (args: {
    buildId: string
    unitId: string
    artifactId: string
    sequence: number
    eventType: string
    taskId?: number | null
    aiThreadId?: string | null
    channelId?: number | null
    languageId?: number | null
    channelName?: string | null
    languageName?: string | null
    artifactType?: string | null
    artifactRole?: string | null
    title?: string | null
    contentText?: string | null
    contentJson?: ArtifactContentJson | null
    assetData?: ArtifactAssetData | null
    currentVersion?: number | null
    errorMessage?: string | null
    mediaItem?: AiBuildArtifactMediaProgress | null
    threadId?: string | null
    assistantMessageId?: string | null
  }) => string
  clearForBuild: (buildId: string) => void
  clearExceptThread: (threadId: string | null) => void
  getPreview: (key: string) => AiBuildArtifactPreviewEntry | null
  listForAssistantMessage: (assistantMessageId: string) => AiBuildArtifactPreviewEntry[]
  listForThread: (threadId: string) => AiBuildArtifactPreviewEntry[]
  listForTask: (taskId: number) => AiBuildArtifactPreviewEntry[]
  listLiveByArtifactId: (artifactId: string) => AiBuildArtifactPreviewEntry | null
}

export function buildArtifactPreviewKey(
  buildId: string,
  unitId: string,
  artifactId: string,
): string {
  return `${buildId.trim()}:${unitId.trim() || "unit"}:${artifactId.trim()}`
}

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

export function normalizeArtifactBuildEventType(eventType: string): string {
  return eventType.trim().toLowerCase()
}

export function isArtifactBuildEventType(eventType: string): boolean {
  const normalized = normalizeArtifactBuildEventType(eventType)
  return (
    normalized.startsWith("artifact.")
    || normalized.includes("artifact.plan_ready")
    || normalized.includes("artifact.started")
    || normalized.includes("artifact.context_loaded")
    || normalized.includes("artifact.structure_decided")
    || normalized.includes("artifact.media")
    || normalized.includes("artifact.preview")
    || normalized.includes("artifact.version_saved")
    || normalized.includes("artifact.failed")
  )
}

/** Events that create/update the live artifact card (not plan/decision timeline rows). */
export function isArtifactCardContentEventType(eventType: string): boolean {
  const normalized = normalizeArtifactBuildEventType(eventType)
  return (
    normalized.includes("artifact.preview")
    || normalized.includes("artifact.version_saved")
    || normalized.includes("artifact.media")
    || normalized.includes("artifact.failed")
  )
}

export function phaseForArtifactEventType(eventType: string): AiBuildArtifactPreviewPhase | null {
  const normalized = normalizeArtifactBuildEventType(eventType)
  if (normalized.includes("plan_ready")) return "plan_ready"
  if (normalized.includes("context_loaded")) return "started"
  if (normalized.includes("structure_decided")) return "started"
  if (normalized.includes("version_saved") || normalized.endsWith(".saved")) return "saved"
  if (normalized.includes("failed")) return "failed"
  if (normalized.includes("preview")) return "preview"
  if (normalized.includes("media")) return "media"
  if (normalized.includes("started")) return "started"
  return null
}

/** Parse durable artifact.* event payloads into preview fields. */
export function parseBuildArtifactPreviewPayload(payload: Record<string, unknown> | null | undefined): {
  artifactId: string | null
  taskId: number | null
  aiThreadId: string | null
  channelId: number | null
  languageId: number | null
  channelName: string | null
  languageName: string | null
  artifactType: string | null
  artifactRole: string | null
  title: string | null
  contentText: string | null
  contentJson: ArtifactContentJson | null
  assetData: ArtifactAssetData | null
  currentVersion: number | null
  errorMessage: string | null
  mediaItem: AiBuildArtifactMediaProgress | null
} {
  const record = payload ?? {}
  const nestedArtifact = asRecord(record.artifact)
  const nestedSnapshot = asRecord(record.snapshot) ?? asRecord(nestedArtifact?.snapshot)
  const source = nestedSnapshot ?? nestedArtifact ?? record

  const mediaItemRaw = asRecord(record.media_item) ?? asRecord(record.mediaItem)
  const mediaItem: AiBuildArtifactMediaProgress | null = mediaItemRaw
    ? {
        itemId:
          toTrimmedString(mediaItemRaw.item_id)
          ?? toTrimmedString(mediaItemRaw.itemId)
          ?? toTrimmedString(mediaItemRaw.id),
        attachmentId:
          toTrimmedString(mediaItemRaw.attachment_id)
          ?? toTrimmedString(mediaItemRaw.attachmentId),
        status: toTrimmedString(mediaItemRaw.status),
        progress: toFiniteNumber(mediaItemRaw.progress),
        message:
          toTrimmedString(mediaItemRaw.message)
          ?? toTrimmedString(mediaItemRaw.error),
      }
    : null

  return {
    artifactId:
      toTrimmedString(record.artifact_id)
      ?? toTrimmedString(record.artifactId)
      ?? toTrimmedString(source.id),
    taskId:
      toFiniteNumber(record.task_id)
      ?? toFiniteNumber(record.taskId)
      ?? toFiniteNumber(source.task_id),
    aiThreadId:
      toTrimmedString(record.ai_thread_id)
      ?? toTrimmedString(record.aiThreadId)
      ?? toTrimmedString(source.ai_thread_id),
    channelId:
      toFiniteNumber(record.channel_id)
      ?? toFiniteNumber(record.channelId)
      ?? toFiniteNumber(source.channel_id),
    languageId:
      toFiniteNumber(record.language_id)
      ?? toFiniteNumber(record.languageId)
      ?? toFiniteNumber(source.language_id),
    channelName:
      toTrimmedString(record.channel_name)
      ?? toTrimmedString(record.channelName)
      ?? toTrimmedString(source.channel_name),
    languageName:
      toTrimmedString(record.language_name)
      ?? toTrimmedString(record.languageName)
      ?? toTrimmedString(source.language_name),
    artifactType:
      toTrimmedString(record.artifact_type)
      ?? toTrimmedString(record.artifactType)
      ?? toTrimmedString(source.artifact_type),
    artifactRole:
      toTrimmedString(record.artifact_role)
      ?? toTrimmedString(record.artifactRole)
      ?? toTrimmedString(source.artifact_role),
    title:
      toTrimmedString(record.title)
      ?? toTrimmedString(source.title)
      ?? toTrimmedString(record.artifact_title),
    contentText:
      typeof record.content_text === "string"
        ? record.content_text
        : typeof source.content_text === "string"
          ? source.content_text
          : toTrimmedString(record.snippet),
    contentJson:
      (asRecord(record.content_json) as ArtifactContentJson | null)
      ?? (asRecord(source.content_json) as ArtifactContentJson | null),
    assetData:
      (asRecord(record.asset_data) as ArtifactAssetData | null)
      ?? (asRecord(source.asset_data) as ArtifactAssetData | null),
    currentVersion:
      toFiniteNumber(record.current_version)
      ?? toFiniteNumber(record.version_number)
      ?? toFiniteNumber(source.current_version),
    errorMessage:
      toTrimmedString(record.error)
      ?? toTrimmedString(record.error_message)
      ?? toTrimmedString(record.message),
    mediaItem,
  }
}

function mergeMedia(
  previous: AiBuildArtifactMediaProgress[],
  nextItem: AiBuildArtifactMediaProgress | null | undefined,
): AiBuildArtifactMediaProgress[] {
  if (!nextItem) return previous
  const key =
    nextItem.itemId?.trim()
    || nextItem.attachmentId?.trim()
    || null
  if (!key) return [...previous, nextItem]
  const index = previous.findIndex(
    (row) =>
      (row.itemId && row.itemId === nextItem.itemId)
      || (row.attachmentId && row.attachmentId === nextItem.attachmentId),
  )
  if (index < 0) return [...previous, nextItem]
  const copy = [...previous]
  copy[index] = { ...copy[index], ...nextItem }
  return copy
}

export const useAiBuildArtifactPreviewStore = create<AiBuildArtifactPreviewState>((set, get) => ({
  previews: {},

  upsertFromEvent: ({
    buildId,
    unitId,
    artifactId,
    sequence,
    eventType,
    taskId,
    aiThreadId,
    channelId,
    languageId,
    channelName,
    languageName,
    artifactType,
    artifactRole,
    title,
    contentText,
    contentJson,
    assetData,
    currentVersion,
    errorMessage,
    mediaItem,
    threadId,
    assistantMessageId,
  }) => {
    const key = buildArtifactPreviewKey(buildId, unitId, artifactId)
    if (!artifactId.trim()) return key
    const phase = phaseForArtifactEventType(eventType) ?? "preview"
    set((state) => {
      const prev = state.previews[key] ?? null
      if (prev && sequence < prev.sequence) return state
      const next: AiBuildArtifactPreviewEntry = {
        key,
        buildId: buildId.trim(),
        unitId: unitId.trim() || "unit",
        artifactId: artifactId.trim(),
        taskId: taskId ?? prev?.taskId ?? null,
        aiThreadId: aiThreadId ?? prev?.aiThreadId ?? null,
        channelId: channelId ?? prev?.channelId ?? null,
        languageId: languageId ?? prev?.languageId ?? null,
        channelName: channelName?.trim() || prev?.channelName || null,
        languageName: languageName?.trim() || prev?.languageName || null,
        artifactType: artifactType?.trim() || prev?.artifactType || null,
        artifactRole: artifactRole?.trim() || prev?.artifactRole || null,
        title: title?.trim() || prev?.title || null,
        contentText:
          typeof contentText === "string" && contentText.length > 0
            ? contentText
            : prev?.contentText || "",
        contentJson: contentJson ?? prev?.contentJson ?? null,
        assetData: assetData ?? prev?.assetData ?? null,
        currentVersion: currentVersion ?? prev?.currentVersion ?? null,
        phase,
        sequence,
        errorMessage: errorMessage ?? (phase === "failed" ? prev?.errorMessage ?? null : null),
        media: mergeMedia(prev?.media ?? [], mediaItem),
        threadId: threadId ?? prev?.threadId ?? null,
        assistantMessageIds: { ...(prev?.assistantMessageIds ?? {}) },
        updatedAt: new Date().toISOString(),
      }
      if (assistantMessageId) next.assistantMessageIds[assistantMessageId] = true
      return { previews: { ...state.previews, [key]: next } }
    })
    return key
  },

  clearForBuild: (buildId) => {
    const id = buildId.trim()
    if (!id) return
    set((state) => {
      const next: Record<string, AiBuildArtifactPreviewEntry> = {}
      for (const [key, entry] of Object.entries(state.previews)) {
        if (entry.buildId !== id) next[key] = entry
      }
      return { previews: next }
    })
  },

  clearExceptThread: (threadId) => {
    set((state) => {
      if (!threadId) return { previews: {} }
      const next: Record<string, AiBuildArtifactPreviewEntry> = {}
      for (const [key, entry] of Object.entries(state.previews)) {
        if (entry.threadId === threadId) next[key] = entry
      }
      return { previews: next }
    })
  },

  getPreview: (key) => get().previews[key] ?? null,

  listForAssistantMessage: (assistantMessageId) =>
    Object.values(get().previews)
      .filter((row) => row.assistantMessageIds[assistantMessageId])
      .sort((a, b) => a.sequence - b.sequence),

  listForThread: (threadId) =>
    Object.values(get().previews)
      .filter((row) => row.threadId === threadId || row.aiThreadId === threadId)
      .sort((a, b) => b.sequence - a.sequence),

  listForTask: (taskId) =>
    Object.values(get().previews)
      .filter((row) => row.taskId === taskId)
      .sort((a, b) => b.sequence - a.sequence),

  listLiveByArtifactId: (artifactId) => {
    const id = artifactId.trim()
    if (!id) return null
    const matches = Object.values(get().previews)
      .filter((row) => row.artifactId === id)
      .sort((a, b) => b.sequence - a.sequence)
    return matches[0] ?? null
  },
}))
