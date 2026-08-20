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
  /** Optional project scope when the live preview is project-bound. */
  projectId?: number | null
  aiThreadId: string | null
  channelId: number | null
  languageId: number | null
  channelName: string | null
  languageName: string | null
  artifactType: string | null
  artifactRole: string | null
  title: string | null
  contentText: string
  /** Prior artifact body for update diffs (green/red +/- like component edits). */
  beforeContentText: string | null
  /** Frozen pre-edit content_json (from artifact.started) for honest HTML-based diffs. */
  beforeContentJson: ArtifactContentJson | null
  /** Canonical plain after-text for diffs when provided by the worker. */
  diffContentText: string | null
  contentJson: ArtifactContentJson | null
  assetData: ArtifactAssetData | null
  currentVersion: number | null
  phase: AiBuildArtifactPreviewPhase
  sequence: number
  errorMessage: string | null
  media: AiBuildArtifactMediaProgress[]
  /** True while the worker is still streaming tool args (body not authoritative yet). */
  streaming: boolean
  /** Approximate streamed chars for progress UI (body kept on baseline until save). */
  streamChars: number | null
  /** Compact live snippet from the worker. Chat/pane must not treat this as the document. */
  streamSnippet: string | null
  /** Heading of the section being edited, when the worker runs in section mode. */
  targetSectionHeading: string | null
  /** Unpersisted worker draft. Chat/pane mirror the live artifact instead. */
  sectionHtml: string | null
  sectionBeforeHtml: string | null
  threadId: string | null
  assistantMessageIds: Record<string, true>
  updatedAt: string
}

type AiBuildArtifactPreviewState = {
  previews: Record<string, AiBuildArtifactPreviewEntry>
  /** Soft-deleted artifacts must not be resurrected by chat/build hydrate. */
  suppressedArtifactIds: Record<string, true>
  upsertFromEvent: (args: {
    buildId: string
    unitId: string
    artifactId: string
    sequence: number
    eventType: string
    taskId?: number | null
    projectId?: number | null
    aiThreadId?: string | null
    channelId?: number | null
    languageId?: number | null
    channelName?: string | null
    languageName?: string | null
    artifactType?: string | null
    artifactRole?: string | null
    title?: string | null
    contentText?: string | null
    beforeContentText?: string | null
    beforeContentJson?: ArtifactContentJson | null
    diffContentText?: string | null
    contentJson?: ArtifactContentJson | null
    assetData?: ArtifactAssetData | null
    currentVersion?: number | null
    errorMessage?: string | null
    mediaItem?: AiBuildArtifactMediaProgress | null
    streaming?: boolean | null
    streamChars?: number | null
    streamSnippet?: string | null
    targetSectionHeading?: string | null
    sectionHtml?: string | null
    sectionBeforeHtml?: string | null
    /** When true, explicitly clear diffContentText (streaming heartbeats). */
    clearDiffContentText?: boolean
    threadId?: string | null
    assistantMessageId?: string | null
  }) => string
  clearForBuild: (buildId: string) => void
  /** Safety net: clear stuck "generating" cards when the build is already terminal. */
  forceTerminalForBuild: (
    buildId: string,
    phase?: "saved" | "failed",
    errorMessage?: string | null,
  ) => void
  clearExceptThread: (threadId: string | null) => void
  /** Drop saved/failed previews whose version is already reflected on the server row. */
  pruneConsumedSavedPreviews: (artifactId: string, currentVersion: number) => void
  /**
   * Freeze the on-screen artifact body as before_content_json when the worker
   * omitted it (started events stay tiny). Required for honest HTML diffs.
   */
  ensureBeforeBaseline: (args: {
    artifactId: string
    contentJson?: ArtifactContentJson | null
    contentText?: string | null
  }) => void
  getPreview: (key: string) => AiBuildArtifactPreviewEntry | null
  listForAssistantMessage: (assistantMessageId: string) => AiBuildArtifactPreviewEntry[]
  listForThread: (threadId: string) => AiBuildArtifactPreviewEntry[]
  listForTask: (taskId: number) => AiBuildArtifactPreviewEntry[]
  listLiveByArtifactId: (artifactId: string) => AiBuildArtifactPreviewEntry | null
  suppressArtifact: (artifactId: string) => void
  isArtifactSuppressed: (artifactId: string) => boolean
}

export function isInProgressArtifactPreviewPhase(
  phase: AiBuildArtifactPreviewPhase | null | undefined,
): boolean {
  return phase === "plan_ready" || phase === "started" || phase === "media" || phase === "preview"
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
    normalized.includes("artifact.started")
    || normalized.includes("artifact.preview")
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
  projectId: number | null
  aiThreadId: string | null
  channelId: number | null
  languageId: number | null
  channelName: string | null
  languageName: string | null
  artifactType: string | null
  artifactRole: string | null
  title: string | null
  contentText: string | null
  beforeContentText: string | null
  beforeContentJson: ArtifactContentJson | null
  diffContentText: string | null
  contentJson: ArtifactContentJson | null
  assetData: ArtifactAssetData | null
  currentVersion: number | null
  errorMessage: string | null
  mediaItem: AiBuildArtifactMediaProgress | null
  streaming: boolean
  streamChars: number | null
  streamSnippet: string | null
  targetSectionHeading: string | null
  sectionHtml: string | null
  sectionBeforeHtml: string | null
  clearDiffContentText: boolean
} {
  const record = payload ?? {}
  const nestedArtifact = asRecord(record.artifact)
  const nestedSnapshot = asRecord(record.snapshot) ?? asRecord(nestedArtifact?.snapshot)
  const planArtifacts = Array.isArray(record.artifacts) ? record.artifacts : null
  const firstPlanArtifact = planArtifacts?.[0] && typeof planArtifacts[0] === "object"
    ? asRecord(planArtifacts[0] as Record<string, unknown>)
    : null
  const source = nestedSnapshot ?? nestedArtifact ?? firstPlanArtifact ?? record
  const streaming = record.streaming === true

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
    projectId:
      toFiniteNumber(record.project_id)
      ?? toFiniteNumber(record.projectId)
      ?? toFiniteNumber(source.project_id)
      ?? toFiniteNumber(nestedArtifact?.project_id),
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
    // Never treat snippet as content_text — that made previews look like plain dumps.
    contentText:
      typeof record.content_text === "string"
        ? record.content_text
        : typeof source.content_text === "string"
          ? source.content_text
          : null,
    beforeContentText:
      typeof record.before_content_text === "string"
        ? record.before_content_text
        : typeof record.beforeContentText === "string"
          ? record.beforeContentText
          : typeof source.before_content_text === "string"
            ? source.before_content_text
            : null,
    beforeContentJson:
      (asRecord(record.before_content_json) as ArtifactContentJson | null)
      ?? (asRecord(record.beforeContentJson) as ArtifactContentJson | null)
      ?? (asRecord(source.before_content_json) as ArtifactContentJson | null),
    diffContentText:
      typeof record.diff_content_text === "string"
        ? record.diff_content_text
        : typeof record.diffContentText === "string"
          ? record.diffContentText
          : null,
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
    streaming,
    streamChars: toFiniteNumber(record.stream_chars) ?? toFiniteNumber(record.streamChars),
    streamSnippet: toTrimmedString(record.snippet),
    targetSectionHeading:
      toTrimmedString(record.target_section_heading)
      ?? toTrimmedString(record.targetSectionHeading),
    sectionHtml:
      typeof record.section_html === "string"
        ? record.section_html
        : typeof record.sectionHtml === "string"
          ? record.sectionHtml
          : null,
    sectionBeforeHtml:
      typeof record.section_before_html === "string"
        ? record.section_before_html
        : typeof record.sectionBeforeHtml === "string"
          ? record.sectionBeforeHtml
          : null,
    // Explicit null from streaming heartbeats must clear prior bogus full-doc diffs.
    clearDiffContentText: streaming || record.diff_content_text === null,
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

function suppressedIdMap(
  state: Pick<AiBuildArtifactPreviewState, "suppressedArtifactIds">,
): Record<string, true> {
  return state.suppressedArtifactIds ?? {}
}

export const useAiBuildArtifactPreviewStore = create<AiBuildArtifactPreviewState>((set, get) => ({
  previews: {},
  suppressedArtifactIds: {},

  upsertFromEvent: ({
    buildId,
    unitId,
    artifactId,
    sequence,
    eventType,
    taskId,
    projectId,
    aiThreadId,
    channelId,
    languageId,
    channelName,
    languageName,
    artifactType,
    artifactRole,
    title,
    contentText,
    beforeContentText,
    beforeContentJson,
    diffContentText,
    contentJson,
    assetData,
    currentVersion,
    errorMessage,
    mediaItem,
    streaming,
    streamChars,
    streamSnippet,
    targetSectionHeading,
    sectionHtml,
    sectionBeforeHtml,
    clearDiffContentText,
    threadId,
    assistantMessageId,
  }) => {
    const key = buildArtifactPreviewKey(buildId, unitId, artifactId)
    const id = artifactId.trim()
    if (!id) return key
    if (suppressedIdMap(get())[id]) return key
    const phase = phaseForArtifactEventType(eventType) ?? "preview"
    set((state) => {
      const prev = state.previews[key] ?? null
      if (prev && sequence < prev.sequence) return state
      const startedBaselineJson =
        phase === "started" && contentJson
          ? contentJson
          : null
      const isStreamingHeartbeat = streaming === true
      const next: AiBuildArtifactPreviewEntry = {
        key,
        buildId: buildId.trim(),
        unitId: unitId.trim() || "unit",
        artifactId: artifactId.trim(),
        taskId: taskId ?? prev?.taskId ?? null,
        projectId: projectId ?? prev?.projectId ?? null,
        aiThreadId: aiThreadId ?? prev?.aiThreadId ?? null,
        channelId: channelId ?? prev?.channelId ?? null,
        languageId: languageId ?? prev?.languageId ?? null,
        channelName: channelName?.trim() || prev?.channelName || null,
        languageName: languageName?.trim() || prev?.languageName || null,
        artifactType: artifactType?.trim() || prev?.artifactType || null,
        artifactRole: artifactRole?.trim() || prev?.artifactRole || null,
        title: title?.trim() || prev?.title || null,
        // Streaming heartbeats omit body — keep the last authoritative content (usually started baseline).
        contentText:
          !isStreamingHeartbeat && typeof contentText === "string" && contentText.length > 0
            ? contentText
            : prev?.contentText || "",
        beforeContentText:
          typeof beforeContentText === "string"
            ? beforeContentText
            : prev?.beforeContentText ?? null,
        beforeContentJson:
          beforeContentJson
          ?? prev?.beforeContentJson
          ?? startedBaselineJson
          ?? null,
        diffContentText: clearDiffContentText
          ? (typeof diffContentText === "string" ? diffContentText : null)
          : typeof diffContentText === "string"
            ? diffContentText
            : prev?.diffContentText ?? null,
        contentJson:
          !isStreamingHeartbeat && contentJson
            ? contentJson
            : prev?.contentJson ?? contentJson ?? null,
        // Empty `{ assets: [] }` is truthy and used to wipe prior media — only adopt when non-empty.
        assetData: (() => {
          const incomingAssets = Array.isArray((assetData as { assets?: unknown } | null)?.assets)
            ? (assetData as { assets: unknown[] }).assets
            : null
          if (incomingAssets && incomingAssets.length > 0) return assetData ?? null
          return prev?.assetData ?? assetData ?? null
        })(),
        currentVersion: currentVersion ?? prev?.currentVersion ?? null,
        phase,
        sequence,
        errorMessage: errorMessage ?? (phase === "failed" ? prev?.errorMessage ?? null : null),
        media: mergeMedia(prev?.media ?? [], mediaItem),
        streaming:
          phase === "saved" || phase === "failed"
            ? false
            : isStreamingHeartbeat,
        streamChars:
          phase === "saved" || phase === "failed"
            ? null
            : typeof streamChars === "number" && Number.isFinite(streamChars)
              ? streamChars
              : isStreamingHeartbeat
                ? prev?.streamChars ?? null
                : null,
        streamSnippet:
          typeof streamSnippet === "string" && streamSnippet.trim()
            ? streamSnippet.trim()
            : prev?.streamSnippet ?? null,
        targetSectionHeading:
          typeof targetSectionHeading === "string" && targetSectionHeading.trim()
            ? targetSectionHeading.trim()
            : prev?.targetSectionHeading ?? null,
        sectionHtml:
          typeof sectionHtml === "string" && sectionHtml.trim()
            ? sectionHtml
            : prev?.sectionHtml ?? null,
        sectionBeforeHtml:
          typeof sectionBeforeHtml === "string" && sectionBeforeHtml.trim()
            ? sectionBeforeHtml
            : prev?.sectionBeforeHtml ?? null,
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

  forceTerminalForBuild: (buildId, phase = "saved", errorMessage = null) => {
    const id = buildId.trim()
    if (!id) return
    set((state) => {
      let changed = false
      const next: Record<string, AiBuildArtifactPreviewEntry> = { ...state.previews }
      for (const [key, entry] of Object.entries(next)) {
        if (entry.buildId !== id) continue
        if (entry.phase === "saved" || entry.phase === "failed") continue
        changed = true
        next[key] = {
          ...entry,
          phase,
          streaming: false,
          streamChars: null,
          errorMessage:
            phase === "failed"
              ? (errorMessage?.trim() || entry.errorMessage || "The update could not be applied.")
              : entry.errorMessage,
          // Prefer authoritative body when present; otherwise keep baseline so UI isn't blank.
          contentText: entry.contentText || entry.beforeContentText || "",
          contentJson: entry.contentJson ?? entry.beforeContentJson,
          diffContentText: entry.diffContentText ?? entry.beforeContentText,
          updatedAt: new Date().toISOString(),
        }
      }
      return changed ? { previews: next } : state
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

  pruneConsumedSavedPreviews: (_artifactId, _currentVersion) => {
    // No-op: saved preview cards are required by AI chat history after hard
    // refresh. Editor/overview overlays already ignore saved previews when the
    // list/get row has caught up (see ArtifactWorkspace / ArtifactPane).
  },

  ensureBeforeBaseline: ({ artifactId, contentJson, contentText }) => {
    const id = artifactId.trim()
    if (!id) return
    const hasJson = Boolean(contentJson && typeof contentJson === "object")
    const hasText = typeof contentText === "string" && contentText.trim().length > 0
    if (!hasJson && !hasText) return
    set((state) => {
      let changed = false
      const next: Record<string, AiBuildArtifactPreviewEntry> = { ...state.previews }
      for (const [key, entry] of Object.entries(next)) {
        if (entry.artifactId !== id) continue
        if (entry.phase === "saved" || entry.phase === "failed") continue
        const needsJson = hasJson && !entry.beforeContentJson
        const needsText = hasText && !entry.beforeContentText?.trim()
        if (!needsJson && !needsText) continue
        changed = true
        next[key] = {
          ...entry,
          beforeContentJson: needsJson
            ? (contentJson as ArtifactContentJson)
            : entry.beforeContentJson,
          beforeContentText: needsText
            ? String(contentText)
            : entry.beforeContentText,
        }
      }
      return changed ? { previews: next } : state
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

  suppressArtifact: (artifactId) => {
    const id = artifactId.trim()
    if (!id) return
    set((state) => {
      const nextPreviews: Record<string, AiBuildArtifactPreviewEntry> = {}
      for (const [key, entry] of Object.entries(state.previews)) {
        if (entry.artifactId !== id) nextPreviews[key] = entry
      }
      return {
        previews: nextPreviews,
        suppressedArtifactIds: { ...suppressedIdMap(state), [id]: true },
      }
    })
  },

  isArtifactSuppressed: (artifactId) => {
    const id = artifactId.trim()
    return Boolean(id && suppressedIdMap(get())[id])
  },

  listLiveByArtifactId: (artifactId) => {
    const id = artifactId.trim()
    if (!id) return null
    if (suppressedIdMap(get())[id]) return null
    const matches = Object.values(get().previews).filter((row) => row.artifactId === id)
    if (matches.length === 0) return null
    return matches.reduce((best, row) => {
      const bestVersion = best.currentVersion ?? 0
      const rowVersion = row.currentVersion ?? 0
      if (rowVersion !== bestVersion) return rowVersion > bestVersion ? row : best
      if (row.updatedAt !== best.updatedAt) {
        return row.updatedAt > best.updatedAt ? row : best
      }
      return row.sequence > best.sequence ? row : best
    })
  },
}))

if (useAiBuildArtifactPreviewStore.getState().suppressedArtifactIds == null) {
  useAiBuildArtifactPreviewStore.setState({ suppressedArtifactIds: {} })
}
