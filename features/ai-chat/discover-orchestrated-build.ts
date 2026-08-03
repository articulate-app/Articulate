import {
  AI_ORCHESTRATED_BUILD_ENTITY_TYPE,
  AI_START_ARTIFACT_BUILD_TOOL,
  isBuildDispatchTool,
} from "../../app/lib/ai/ai-orchestrated-build-types"
import type { AiChatChangePreviewEvent } from "../../app/lib/ai/chat"
import type { AiChangePreview } from "../../app/store/ai-change-preview-stream"
import { parseOrchestratedBuildPreflightSkip } from "./orchestrated-build-preflight"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type DiscoveredOrchestratedBuild = {
  buildId: string
  title?: string | null
  summary?: string | null
  changeSetId?: string | null
  source: "ai_change_preview" | "tool_result" | "persisted"
  /** Artifact builds render compact +/- cards (no orchestrated-units shell). */
  isArtifactBuild?: boolean
  /** Present when start failed — dispatch_started alone is never success. */
  errorCode?: string | null
  errorMessage?: string | null
  startFailed?: boolean
}

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

export function isValidBuildId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim())
}

function extractBuildIdFromRecord(row: Record<string, unknown>): string | null {
  const direct =
    toTrimmedString(row.build_id)
    ?? toTrimmedString(row.buildId)
    ?? (row.entity_type === AI_ORCHESTRATED_BUILD_ENTITY_TYPE
      ? toTrimmedString(row.entity_id)
      : null)
  if (direct && isValidBuildId(direct)) return direct.trim()

  const nestedBuild =
    row.build && typeof row.build === "object"
      ? (row.build as Record<string, unknown>)
      : null
  const nestedId = nestedBuild ? toTrimmedString(nestedBuild.id) : null
  if (nestedId && isValidBuildId(nestedId)) return nestedId

  // Persisted tool_results often only keep a compact data_summary.
  const dataSummary =
    row.data_summary && typeof row.data_summary === "object" && !Array.isArray(row.data_summary)
      ? (row.data_summary as Record<string, unknown>)
      : null
  if (dataSummary) {
    const fromSummary =
      toTrimmedString(dataSummary.build_id) ?? toTrimmedString(dataSummary.buildId)
    if (fromSummary && isValidBuildId(fromSummary)) return fromSummary.trim()
  }

  const result =
    row.result && typeof row.result === "object"
      ? (row.result as Record<string, unknown>)
      : null
  if (result) {
    const fromResult = extractBuildIdFromRecord(result)
    if (fromResult) return fromResult
  }
  return null
}

function collectBuildIdsFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry === "string" && isValidBuildId(entry)) {
      out.push(entry.trim())
      continue
    }
    if (entry && typeof entry === "object") {
      const id = extractBuildIdFromRecord(entry as Record<string, unknown>)
      if (id) out.push(id)
    }
  }
  return out
}

/**
 * True for build-dispatch previews (`ai_start_orchestrated_build` /
 * `ai_start_artifact_build`) — process start, not a content mutation card.
 * Kept as a render guard for older persisted events that still emit these.
 */
export function isOrchestratedBuildChangePreview(
  preview: Pick<AiChangePreview | AiChatChangePreviewEvent, "entity_type" | "entity_id" | "tool_name"> & {
    build_id?: string | null
  },
): boolean {
  if (preview.entity_type === AI_ORCHESTRATED_BUILD_ENTITY_TYPE) return true
  if (isBuildDispatchTool(preview.tool_name)) return true
  if (isValidBuildId(preview.build_id)) return true
  if (isValidBuildId(preview.entity_id)) return true
  return false
}

export function discoverOrchestratedBuildFromChangePreview(
  preview: Pick<
    AiChangePreview | AiChatChangePreviewEvent,
    "entity_type" | "entity_id" | "tool_name" | "title" | "summary"
  > & {
    build_id?: string | null
    change_set_id?: string | null
  },
): DiscoveredOrchestratedBuild | null {
  if (!isOrchestratedBuildChangePreview(preview)) return null
  const buildId =
    (isValidBuildId(preview.build_id) ? preview.build_id.trim() : null)
    ?? (preview.entity_type === AI_ORCHESTRATED_BUILD_ENTITY_TYPE
      && isValidBuildId(preview.entity_id)
      ? String(preview.entity_id).trim()
      : null)
  if (!buildId) return null
  const toolName = toTrimmedString(preview.tool_name)
  return {
    buildId,
    title: preview.title ?? null,
    summary: preview.summary ?? null,
    changeSetId: toTrimmedString(preview.change_set_id),
    source: "ai_change_preview",
    isArtifactBuild: toolName === AI_START_ARTIFACT_BUILD_TOOL,
  }
}

function discoverFromToolResultRow(row: unknown): DiscoveredOrchestratedBuild | null {
  if (!row || typeof row !== "object") return null
  // Skipped preflight (requires_clarification / no_build_created) never creates a build card.
  if (parseOrchestratedBuildPreflightSkip(row)) return null

  const record = row as Record<string, unknown>
  const toolName =
    toTrimmedString(record.tool_name)
    ?? toTrimmedString(record.name)
    ?? toTrimmedString(record.tool)
  const isStartTool = isBuildDispatchTool(toolName)
  const result =
    record.result && typeof record.result === "object"
      ? (record.result as Record<string, unknown>)
      : record

  if (result.no_build_created === true || record.no_build_created === true) return null
  if (result.requires_clarification === true || record.requires_clarification === true) {
    // Clarification without a real build_id must not show Queued.
    const maybeId = extractBuildIdFromRecord(record) ?? extractBuildIdFromRecord(result)
    if (!maybeId) return null
  }

  const buildId = extractBuildIdFromRecord(record) ?? extractBuildIdFromRecord(result)
  if (!buildId) return null
  if (
    !isStartTool
    && record.entity_type !== AI_ORCHESTRATED_BUILD_ENTITY_TYPE
    && result.entity_type !== AI_ORCHESTRATED_BUILD_ENTITY_TYPE
    && !toTrimmedString(record.build_id)
    && !toTrimmedString(result.build_id)
  ) {
    return null
  }

  const errorCode =
    toTrimmedString(result.error_code)
    ?? toTrimmedString(result.code)
    ?? toTrimmedString(record.error_code)
    ?? toTrimmedString(record.code)
  const errorMessage =
    toTrimmedString(result.error_message)
    ?? toTrimmedString(result.error)
    ?? toTrimmedString(result.message)
    ?? toTrimmedString(record.error_message)
    ?? toTrimmedString(record.error)
  const ok = result.ok === false || record.ok === false ? false : result.ok ?? record.ok
  // dispatch_started only means a worker was invoked — never treat it as completed.
  const startFailed =
    ok === false
    || Boolean(errorCode)
    || errorCode === "orchestrated_build_start_failed"

  return {
    buildId,
    title: toTrimmedString(record.title) ?? toTrimmedString(result.title),
    summary:
      toTrimmedString(record.summary)
      ?? toTrimmedString(result.summary)
      ?? (startFailed ? errorMessage : null),
    changeSetId:
      toTrimmedString(record.change_set_id) ?? toTrimmedString(result.change_set_id),
    source: "tool_result",
    isArtifactBuild: toolName === AI_START_ARTIFACT_BUILD_TOOL,
    errorCode,
    errorMessage,
    startFailed,
  }
}

/** Extract orchestrated builds from assistant message content_json (previews + tool_results). */
export function discoverOrchestratedBuildsFromMessageContentJson(
  contentJson: unknown,
): DiscoveredOrchestratedBuild[] {
  if (!contentJson || typeof contentJson !== "object") return []
  const root = contentJson as Record<string, unknown>
  const byId = new Map<string, DiscoveredOrchestratedBuild>()

  const remember = (discovered: DiscoveredOrchestratedBuild | null) => {
    if (!discovered) return
    const existing = byId.get(discovered.buildId)
    if (!existing) {
      byId.set(discovered.buildId, discovered)
      return
    }
    // Prefer richer tool/preview rows over bare build_ids entries.
    if (existing.source === "persisted" && discovered.source !== "persisted") {
      byId.set(discovered.buildId, {
        ...discovered,
        isArtifactBuild: discovered.isArtifactBuild || existing.isArtifactBuild,
      })
      return
    }
    if (discovered.isArtifactBuild && !existing.isArtifactBuild) {
      byId.set(discovered.buildId, { ...existing, isArtifactBuild: true })
    }
  }

  const rootLooksLikeArtifactBuild =
    toTrimmedString(root.output_kind) === "artifact_build_control"
    || toTrimmedString(root.executor) === "artifact_build_executor"

  // Artifact-build control messages expose build_ids on the message_output envelope.
  for (const buildId of collectBuildIdsFromUnknown(root.build_ids)) {
    remember({
      buildId,
      title: null,
      summary: null,
      changeSetId: null,
      source: "persisted",
      isArtifactBuild: rootLooksLikeArtifactBuild,
    })
  }

  const previews = Array.isArray(root.ai_change_previews) ? root.ai_change_previews : []
  for (const row of previews) {
    if (!row || typeof row !== "object") continue
    const record = row as Record<string, unknown>
    remember(
      discoverOrchestratedBuildFromChangePreview({
        entity_type: typeof record.entity_type === "string" ? record.entity_type : "",
        entity_id: record.entity_id as string | number | null | undefined,
        tool_name: typeof record.tool_name === "string" ? record.tool_name : null,
        title: typeof record.title === "string" ? record.title : null,
        summary: typeof record.summary === "string" ? record.summary : null,
        build_id: typeof record.build_id === "string" ? record.build_id : null,
        change_set_id: typeof record.change_set_id === "string" ? record.change_set_id : null,
      }),
    )
  }

  const toolResults = Array.isArray(root.tool_results) ? root.tool_results : []
  for (const row of toolResults) {
    remember(discoverFromToolResultRow(row))
  }

  // Nested tool results under message_output / content envelopes.
  const messageOutput =
    root.message_output && typeof root.message_output === "object"
      ? (root.message_output as Record<string, unknown>)
      : null
  if (messageOutput) {
    const messageOutputLooksLikeArtifact =
      toTrimmedString(messageOutput.output_kind) === "artifact_build_control"
      || toTrimmedString(messageOutput.executor) === "artifact_build_executor"
      || rootLooksLikeArtifactBuild
    for (const buildId of collectBuildIdsFromUnknown(messageOutput.build_ids)) {
      remember({
        buildId,
        title: null,
        summary: null,
        changeSetId: null,
        source: "persisted",
        isArtifactBuild: messageOutputLooksLikeArtifact,
      })
    }
    if (Array.isArray(messageOutput.tool_results)) {
      for (const row of messageOutput.tool_results) {
        remember(discoverFromToolResultRow(row))
      }
    }
  }

  const persistedBuilds = Array.isArray(root.orchestrated_builds) ? root.orchestrated_builds : []
  for (const row of persistedBuilds) {
    if (!row || typeof row !== "object") continue
    const record = row as Record<string, unknown>
    const buildId = extractBuildIdFromRecord(record)
    if (!buildId) continue
    remember({
      buildId,
      title: toTrimmedString(record.title),
      summary: toTrimmedString(record.summary),
      changeSetId: toTrimmedString(record.change_set_id),
      source: "persisted",
    })
  }

  return Array.from(byId.values())
}
