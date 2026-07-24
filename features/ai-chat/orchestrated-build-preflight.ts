import {
  AI_ORCHESTRATED_BUILD_ENTITY_TYPE,
  isBuildDispatchTool,
} from "../../app/lib/ai/ai-orchestrated-build-types"
import {
  useAiChangePreviewStreamStore,
  type AiChangePreviewEntry,
} from "../../app/store/ai-change-preview-stream"

export type OrchestratedBuildPreflightSkip = {
  requires_clarification: true
  clarification_reason: string | null
  missing_channel_tasks: unknown[]
  candidate_options: unknown[]
  no_build_created: true
}

const BUILD_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function looksLikeBuildId(value: string | null): boolean {
  return Boolean(value && BUILD_ID_RE.test(value))
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readPreflightFlags(record: Record<string, unknown>): {
  requiresClarification: boolean
  noBuildCreated: boolean
  clarificationReason: string | null
  missingChannelTasks: unknown[]
  candidateOptions: unknown[]
} {
  return {
    requiresClarification: record.requires_clarification === true,
    noBuildCreated: record.no_build_created === true,
    clarificationReason: toTrimmedString(record.clarification_reason),
    missingChannelTasks: Array.isArray(record.missing_channel_tasks)
      ? record.missing_channel_tasks
      : [],
    candidateOptions: Array.isArray(record.candidate_options) ? record.candidate_options : [],
  }
}

/**
 * Detect skipped preflight from build-dispatch tool results
 * (`ai_start_orchestrated_build` / `ai_start_artifact_build`).
 * When true, no `ai_build_jobs` row / running build card should be created.
 */
export function parseOrchestratedBuildPreflightSkip(
  row: unknown,
): OrchestratedBuildPreflightSkip | null {
  const record = asRecord(row)
  if (!record) return null

  const result = asRecord(record.result) ?? record
  const toolName =
    toTrimmedString(record.tool_name)
    ?? toTrimmedString(record.name)
    ?? toTrimmedString(record.tool)
  const isStartTool =
    isBuildDispatchTool(toolName)
    || record.entity_type === AI_ORCHESTRATED_BUILD_ENTITY_TYPE
    || result.entity_type === AI_ORCHESTRATED_BUILD_ENTITY_TYPE

  const flags = readPreflightFlags(result)
  const parentFlags = readPreflightFlags(record)
  const requiresClarification = flags.requiresClarification || parentFlags.requiresClarification
  const noBuildCreated = flags.noBuildCreated || parentFlags.noBuildCreated

  if (!requiresClarification && !noBuildCreated) return null
  if (!isStartTool && !requiresClarification && !noBuildCreated) return null

  // A real build_id means a job was created — not a skipped preflight.
  const buildId =
    toTrimmedString(result.build_id)
    ?? toTrimmedString(record.build_id)
    ?? toTrimmedString(asRecord(result.build)?.id ?? null)
  if (looksLikeBuildId(buildId) && !noBuildCreated) return null

  if (!requiresClarification && !noBuildCreated) return null

  return {
    requires_clarification: true,
    clarification_reason:
      flags.clarificationReason ?? parentFlags.clarificationReason,
    missing_channel_tasks:
      flags.missingChannelTasks.length > 0
        ? flags.missingChannelTasks
        : parentFlags.missingChannelTasks,
    candidate_options:
      flags.candidateOptions.length > 0
        ? flags.candidateOptions
        : parentFlags.candidateOptions,
    no_build_created: true,
  }
}

export function discoverOrchestratedBuildPreflightSkipsFromContentJson(
  contentJson: unknown,
): OrchestratedBuildPreflightSkip[] {
  if (!contentJson || typeof contentJson !== "object") return []
  const root = contentJson as Record<string, unknown>
  const out: OrchestratedBuildPreflightSkip[] = []

  const collectFromToolResults = (rows: unknown) => {
    if (!Array.isArray(rows)) return
    for (const row of rows) {
      const skip = parseOrchestratedBuildPreflightSkip(row)
      if (skip) out.push(skip)
    }
  }

  collectFromToolResults(root.tool_results)
  const messageOutput = asRecord(root.message_output)
  if (messageOutput) collectFromToolResults(messageOutput.tool_results)

  // Top-level tool result envelope (message_output itself).
  const topLevel = parseOrchestratedBuildPreflightSkip(root)
  if (topLevel) out.push(topLevel)

  return out
}

function isOrchestratedBuildPreview(entry: AiChangePreviewEntry): boolean {
  return (
    entry.entity_type === AI_ORCHESTRATED_BUILD_ENTITY_TYPE
    || isBuildDispatchTool(entry.tool_name)
  )
}

/**
 * Replace a started orchestrated-build change preview with a neutral
 * "Waiting for input" preflight state. Does not register a build card.
 */
export function markOrchestratedBuildPreflightWaiting(args: {
  threadId?: string | null
  assistantMessageId?: string | null
  /** Also match previews attached to a temp stream id when message_id arrives later. */
  alternateAssistantMessageId?: string | null
  skip?: OrchestratedBuildPreflightSkip | null
}): void {
  const store = useAiChangePreviewStreamStore.getState()
  const reason = args.skip?.clarification_reason?.trim() || null
  const candidateIds = [
    args.assistantMessageId,
    args.alternateAssistantMessageId,
  ].filter((id): id is string => Boolean(id?.trim()))

  for (const entry of Object.values(store.previews)) {
    if (args.threadId && entry.threadId && entry.threadId !== args.threadId) continue
    if (!isOrchestratedBuildPreview(entry)) continue

    const entryIds = Object.keys(entry.assistantMessageIds)
    const matchesAssistant =
      candidateIds.length === 0
      || entryIds.length === 0
      || candidateIds.some((id) => entry.assistantMessageIds[id])
    // Fall back: same-thread orchestrated-build preview still in flight.
    const sameThreadInFlight =
      Boolean(args.threadId)
      && entry.threadId === args.threadId
      && (entry.phase === "started" || entry.phase === "delta" || entry.phase === "completed")
    if (!matchesAssistant && !sameThreadInFlight) continue

    store.upsertAiChangePreview({
      threadId: args.threadId ?? entry.threadId,
      assistantMessageId: args.assistantMessageId ?? args.alternateAssistantMessageId ?? null,
      preview: {
        ...entry,
        requires_clarification: true,
        no_build_created: true,
        clarification_reason: reason ?? entry.clarification_reason ?? null,
        summary: "Waiting for input",
        title: entry.title?.trim() || "Build preflight",
        // Neutral preflight — never claim Saved/Queued completed from chat confirmation.
        phase: entry.phase === "failed" ? "failed" : "completed",
        ok: null,
      },
    })
  }
}

export function applyPreflightSkipsFromContentJson(args: {
  contentJson: unknown
  threadId?: string | null
  assistantMessageId?: string | null
  alternateAssistantMessageId?: string | null
}): OrchestratedBuildPreflightSkip[] {
  const skips = discoverOrchestratedBuildPreflightSkipsFromContentJson(args.contentJson)
  if (skips.length === 0) return []
  markOrchestratedBuildPreflightWaiting({
    threadId: args.threadId,
    assistantMessageId: args.assistantMessageId,
    alternateAssistantMessageId: args.alternateAssistantMessageId,
    skip: skips[0],
  })
  return skips
}
