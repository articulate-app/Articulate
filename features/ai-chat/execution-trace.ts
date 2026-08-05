/**
 * Progressive AI execution timeline (user-safe facts only — never chain-of-thought).
 *
 * Stream marker: `__AI_EXECUTION_TRACE__{ type:"execution_trace", … }`
 * Durable builds: map selected `work_unit.*` events into the same step model.
 */

import type { AiOrchestratedBuildEvent } from "../../app/lib/ai/ai-orchestrated-build-types"

export type AiExecutionTracePhase = "started" | "completed" | "warning" | "failed"

export type AiExecutionTraceCategory =
  | "scope"
  | "discovery"
  | "resolution"
  | "planning"
  | "mutation"
  | "generation"
  | "verification"

export type AiExecutionTraceEntityType = "task" | "channel" | "component" | "url"

export type AiExecutionTraceEntity = {
  type: AiExecutionTraceEntityType
  id?: string | number
  label: string
}

export type AiExecutionTraceEvent = {
  type: "execution_trace"
  sequence: number
  emitted_at: string
  step_id: string
  phase: AiExecutionTracePhase
  category: AiExecutionTraceCategory
  text: string
  entities?: AiExecutionTraceEntity[]
  details?: Record<string, unknown>
}

export type AiExecutionTraceStep = {
  stepId: string
  sequence: number
  emittedAt: string
  phase: AiExecutionTracePhase
  category: AiExecutionTraceCategory
  text: string
  entities: AiExecutionTraceEntity[]
  details: Record<string, unknown> | null
  /** Preview keys produced by this step (`change_id` / component stream key). */
  previewKeys: string[]
  /** Component-edit stream keys produced by this step. */
  editStreamKeys: string[]
  source: "stream" | "build_event"
}

const PHASES = new Set<AiExecutionTracePhase>(["started", "completed", "warning", "failed"])
const CATEGORIES = new Set<AiExecutionTraceCategory>([
  "scope",
  "discovery",
  "resolution",
  "planning",
  "mutation",
  "generation",
  "verification",
])
const ENTITY_TYPES = new Set<AiExecutionTraceEntityType>(["task", "channel", "component", "url"])

/** Generic `__AI_STATUS__` copy that should hide when specific timeline steps exist. */
const GENERIC_STATUS_PATTERNS = [
  /^looking something up/i,
  /^reviewing the request/i,
  /^working on (it|your request)/i,
  /^thinking/i,
  /^one moment/i,
  /^please wait/i,
]

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
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

function normalizePhase(value: unknown): AiExecutionTracePhase | null {
  const text = toTrimmedString(value)?.toLowerCase()
  if (!text) return null
  return PHASES.has(text as AiExecutionTracePhase) ? (text as AiExecutionTracePhase) : null
}

function normalizeCategory(value: unknown): AiExecutionTraceCategory | null {
  const text = toTrimmedString(value)?.toLowerCase()
  if (!text) return null
  return CATEGORIES.has(text as AiExecutionTraceCategory)
    ? (text as AiExecutionTraceCategory)
    : null
}

function normalizeEntity(raw: unknown): AiExecutionTraceEntity | null {
  const record = asRecord(raw)
  if (!record) return null
  const typeRaw = toTrimmedString(record.type)?.toLowerCase()
  if (!typeRaw || !ENTITY_TYPES.has(typeRaw as AiExecutionTraceEntityType)) return null
  const label =
    toTrimmedString(record.label)
    ?? toTrimmedString(record.title)
    ?? toTrimmedString(record.name)
    ?? toTrimmedString(record.url)
  if (!label) return null
  const id =
    typeof record.id === "string" || typeof record.id === "number"
      ? record.id
      : undefined
  return { type: typeRaw as AiExecutionTraceEntityType, id, label }
}

/** Normalize a live stream / SSE execution-trace payload. */
export function normalizeExecutionTraceEvent(raw: unknown): AiExecutionTraceEvent | null {
  const record = asRecord(raw)
  if (!record) return null
  if (record.type != null && record.type !== "execution_trace") return null

  const stepId =
    toTrimmedString(record.step_id)
    ?? toTrimmedString(record.stepId)
  const phase = normalizePhase(record.phase)
  const category = normalizeCategory(record.category)
  const text = toTrimmedString(record.text)
  if (!stepId || !phase || !category || !text) return null

  const sequence =
    toFiniteNumber(record.sequence)
    ?? toFiniteNumber(record.seq)
    ?? 0
  const emittedAt =
    toTrimmedString(record.emitted_at)
    ?? toTrimmedString(record.emittedAt)
    ?? new Date().toISOString()

  const entitiesRaw = Array.isArray(record.entities) ? record.entities : []
  const entities = entitiesRaw
    .map((item) => normalizeEntity(item))
    .filter((item): item is AiExecutionTraceEntity => item != null)

  const details = asRecord(record.details)

  return {
    type: "execution_trace",
    sequence,
    emitted_at: emittedAt,
    step_id: stepId,
    phase,
    category,
    text,
    ...(entities.length > 0 ? { entities } : {}),
    ...(details ? { details } : {}),
  }
}

export function executionTraceEventToStep(
  event: AiExecutionTraceEvent,
  source: AiExecutionTraceStep["source"] = "stream",
): AiExecutionTraceStep {
  return {
    stepId: event.step_id,
    sequence: event.sequence,
    emittedAt: event.emitted_at,
    phase: event.phase,
    category: event.category,
    text: event.text,
    entities: event.entities ?? [],
    details: event.details ?? null,
    previewKeys: [],
    editStreamKeys: [],
    source,
  }
}

/**
 * Later event with the same `step_id` replaces earlier phase/text.
 * Preserve preview attachments from the previous row.
 */
export function mergeExecutionTraceStep(
  previous: AiExecutionTraceStep | null,
  next: AiExecutionTraceStep,
): AiExecutionTraceStep {
  if (!previous) return next
  // Prefer higher sequence for phase/text; keep the first-seen sequence so
  // completed tools do not jump to the bottom of the stacked timeline.
  if (next.sequence < previous.sequence) {
    return {
      ...previous,
      previewKeys: uniqueStrings([...previous.previewKeys, ...next.previewKeys]),
      editStreamKeys: uniqueStrings([...previous.editStreamKeys, ...next.editStreamKeys]),
    }
  }
  return {
    ...next,
    sequence: previous.sequence,
    emittedAt: previous.emittedAt,
    previewKeys: uniqueStrings([...previous.previewKeys, ...next.previewKeys]),
    editStreamKeys: uniqueStrings([...previous.editStreamKeys, ...next.editStreamKeys]),
  }
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

/** Ordered timeline rows (by first-seen sequence of each step_id, then updates in place). */
export function orderExecutionTraceSteps(
  stepsById: Record<string, AiExecutionTraceStep>,
): AiExecutionTraceStep[] {
  return Object.values(stepsById).sort((a, b) => {
    if (a.sequence !== b.sequence) return a.sequence - b.sequence
    return a.stepId.localeCompare(b.stepId)
  })
}

export function isGenericAssistantStatusText(text: string | null | undefined): boolean {
  const trimmed = (text ?? "").trim()
  if (!trimmed) return false
  return GENERIC_STATUS_PATTERNS.some((pattern) => pattern.test(trimmed))
}

/**
 * When specific execution-trace steps exist, suppress generic status fallback copy.
 * Non-generic status text (e.g. custom backend messages) may still show.
 */
export function shouldSuppressGenericStatusText(args: {
  statusText: string | null | undefined
  hasExecutionTraceSteps: boolean
}): boolean {
  if (!args.hasExecutionTraceSteps) return false
  return isGenericAssistantStatusText(args.statusText)
}

const TOOL_TRACE_COPY: Record<
  string,
  { category: AiExecutionTraceCategory; started: string; completed: string; failed: string }
> = {
  list_visible_projects: {
    category: "discovery",
    started: "Looking up projects…",
    completed: "Finished looking up projects.",
    failed: "Project lookup failed.",
  },
  read_project: {
    category: "discovery",
    started: "Reading project details…",
    completed: "Finished reading project.",
    failed: "Could not read project.",
  },
  search_tasks: {
    category: "discovery",
    started: "Searching tasks…",
    completed: "Finished searching tasks.",
    failed: "Task search failed.",
  },
  ai_list_project_artifacts: {
    category: "discovery",
    started: "Listing project artifacts…",
    completed: "Finished listing project artifacts.",
    failed: "Artifact listing failed.",
  },
  ai_list_task_artifacts: {
    category: "discovery",
    started: "Listing task artifacts…",
    completed: "Finished listing task artifacts.",
    failed: "Artifact listing failed.",
  },
  ai_read_artifact: {
    category: "discovery",
    started: "Reading artifact…",
    completed: "Finished reading artifact.",
    failed: "Could not read artifact.",
  },
  read_public_webpage: {
    category: "discovery",
    started: "Reading a public webpage…",
    completed: "Finished reading webpage.",
    failed: "Webpage read failed.",
  },
  ai_start_artifact_build: {
    category: "generation",
    started: "Starting artifact build…",
    completed: "Artifact build started.",
    failed: "Artifact build failed to start.",
  },
  ai_update_task_fields: {
    category: "mutation",
    started: "Updating task fields…",
    completed: "Finished updating task fields.",
    failed: "Task field update failed.",
  },
  ai_request_clarification: {
    category: "resolution",
    started: "Preparing a clarification…",
    completed: "Clarification ready.",
    failed: "Clarification failed.",
  },
}

function categorizeToolName(toolName: string): AiExecutionTraceCategory {
  const known = TOOL_TRACE_COPY[toolName]?.category
  if (known) return known
  if (/^(list_|search_|read_|get_|ai_list_|ai_read_|ai_get_)/.test(toolName)) return "discovery"
  if (/^(ai_start_|ai_build_|generate)/.test(toolName)) return "generation"
  if (/^(ai_update_|ai_create_|ai_save_|ai_attach_|ai_cancel_)/.test(toolName)) return "mutation"
  if (/plan|clarify|resolve/.test(toolName)) return "planning"
  return "discovery"
}

function humanizeToolName(toolName: string): string {
  return toolName.replace(/^ai_/, "").replace(/_/g, " ")
}

function toolStatusTraceText(
  toolName: string,
  phase: AiExecutionTracePhase,
  fallbackText: string | null,
): string {
  const known = TOOL_TRACE_COPY[toolName]
  if (known) {
    if (phase === "failed") return known.failed
    if (phase === "completed") return known.completed
    return known.started
  }
  if (fallbackText) return fallbackText
  const pretty = humanizeToolName(toolName)
  if (phase === "failed") return `${pretty} failed.`
  if (phase === "completed") return `Finished ${pretty}.`
  return `Using ${pretty}…`
}

/**
 * Map live `__AI_STATUS__` tool progress into the progressive execution timeline.
 * Backend historically emits tools only as status events (not `__AI_EXECUTION_TRACE__`).
 */
export function statusPayloadToExecutionTraceEvent(
  raw: unknown,
): AiExecutionTraceEvent | null {
  const record = asRecord(raw)
  if (!record) return null

  const type = toTrimmedString(record.type)?.toLowerCase()
  if (type !== "tool_started" && type !== "tool_finished") return null

  const toolName =
    toTrimmedString(record.tool_name)
    ?? toTrimmedString(record.tool)
    ?? toTrimmedString(record.name)
  if (!toolName) return null

  const round = toFiniteNumber(record.round) ?? 0
  const toolCallId =
    toTrimmedString(record.tool_call_id)
    ?? toTrimmedString(record.toolCallId)
    ?? toTrimmedString(record.call_id)
  const toolIndex = toFiniteNumber(record.tool_index) ?? toFiniteNumber(record.toolIndex)
  const sequence =
    toFiniteNumber(record.sequence)
    ?? toFiniteNumber(record.seq)
    ?? Date.now()
  const emittedAt =
    toTrimmedString(record.emitted_at)
    ?? toTrimmedString(record.emittedAt)
    ?? new Date().toISOString()

  let phase: AiExecutionTracePhase = "started"
  if (type === "tool_finished") {
    const ok = record.ok
    phase = ok === false || record.phase === "failed" ? "failed" : "completed"
  } else {
    phase = normalizePhase(record.phase) ?? "started"
  }

  const fallbackText = toTrimmedString(record.text)
  const stepId = toolCallId
    ? `tool:${round}:${toolCallId}`
    : toolIndex != null
      ? `tool:${round}:${toolName}:${toolIndex}`
      : `tool:${round}:${toolName}`
  return {
    type: "execution_trace",
    sequence,
    emitted_at: emittedAt,
    step_id: stepId,
    phase,
    category: categorizeToolName(toolName),
    text: toolStatusTraceText(toolName, phase, fallbackText),
    details: {
      tool_name: toolName,
      round,
      ...(toolCallId ? { tool_call_id: toolCallId } : {}),
      ...(toolIndex != null ? { tool_index: toolIndex } : {}),
      source: "ai_status",
    },
  }
}

function normalizeBuildEventType(eventType: string): string {
  return eventType.trim().toLowerCase()
}

function isBuildEventType(eventType: string, suffix: string): boolean {
  const normalized = normalizeBuildEventType(eventType)
  return (
    normalized === suffix
    || normalized === `work_unit.${suffix}`
    || normalized.endsWith(`.${suffix}`)
  )
}

function summarizeGenerationContext(payload: Record<string, unknown>): string | null {
  const context =
    asRecord(payload.generation_context)
    ?? asRecord(payload.generationContext)
    ?? asRecord(payload.context)
  if (!context) return null

  const parts: string[] = []
  const audience =
    toTrimmedString(context.target_audience)
    ?? toTrimmedString(context.targetAudience)
    ?? toTrimmedString(context.audience)
  if (audience) parts.push("target audience")

  const primaryKeyword =
    toTrimmedString(context.primary_keyword)
    ?? toTrimmedString(context.primaryKeyword)
    ?? toTrimmedString(context.keyword)
  if (primaryKeyword) parts.push("primary keyword")

  const summary = toTrimmedString(context.summary)
  if (parts.length === 0) return summary

  if (parts.length === 1) return `Loaded ${parts[0]}`
  if (parts.length === 2) return `Loaded ${parts[0]} and ${parts[1]}`
  const head = parts.slice(0, -1).join(", ")
  const tail = parts[parts.length - 1]
  return `Loaded ${head} and ${tail}`
}

/** Concise decision summary for the progressive timeline (no hidden reasoning). */
export function formatConciseComponentDecisionSummary(
  decision: Record<string, unknown>,
): string | null {
  return formatDecisionLine(decision)
}

function formatDecisionLine(decision: Record<string, unknown>): string | null {
  const title =
    toTrimmedString(decision.candidate_title)
    ?? toTrimmedString(decision.candidateTitle)
    ?? toTrimmedString(decision.title)
    ?? toTrimmedString(decision.component_title)

  const outcomeRaw =
    toTrimmedString(decision.outcome)
    ?? toTrimmedString(decision.decision)
    ?? toTrimmedString(decision.action)
    ?? toTrimmedString(decision.operation)
  const sourceRaw =
    toTrimmedString(decision.source)
    ?? toTrimmedString(decision.provenance)
    ?? ""
  const outcome = (outcomeRaw ?? "").toLowerCase()
  const source = sourceRaw.toLowerCase()

  let summary: string | null = null
  if (
    outcome.includes("reactivat")
    || outcome === "reuse_inactive"
    || outcome === "reactivate_existing"
  ) {
    summary = "Reactivated existing section"
  } else if (
    outcome.includes("replace")
    || outcome === "replace_existing"
  ) {
    summary = "Replaced existing required component"
  } else if (
    outcome.includes("unused")
    || outcome.includes("leave_inactive")
    || outcome.includes("left_inactive")
    || outcome === "skip"
    || outcome === "ignore"
  ) {
    summary = "Left inactive section unused"
  } else if (
    outcome.includes("create")
    || outcome.startsWith("create_")
  ) {
    if (
      source.includes("reus")
      || source.includes("library")
      || source.includes("guidance")
      || outcome.includes("reus")
    ) {
      summary = "Created task-specific section from reusable guidance"
    } else {
      summary = "Created task-specific section"
    }
  } else if (outcome.includes("reuse") || outcome === "keep") {
    summary = "Reused existing section"
  }

  if (!summary) {
    // Fallback: never expose raw hidden reasoning — title + short outcome only.
    if (!title && !outcomeRaw) return null
    return title && outcomeRaw
      ? `${outcomeRaw.replace(/_/g, " ")} — ${title}`
      : (title ?? outcomeRaw?.replace(/_/g, " ") ?? null)
  }
  return title ? `${summary} — ${title}` : summary
}

/**
 * Map durable build events into timeline steps.
 * Returns zero or more steps (decisions expand into concise rows).
 */
export function mapBuildEventToExecutionTraceSteps(
  event: AiOrchestratedBuildEvent,
): AiExecutionTraceStep[] {
  const eventType = typeof event.event_type === "string" ? event.event_type : ""
  const payload = asRecord(event.payload) ?? {}
  const unitId = toTrimmedString(event.unit_id) ?? "build"
  const sequence = typeof event.sequence === "number" ? event.sequence : 0
  const emittedAt =
    toTrimmedString((event as { created_at?: unknown }).created_at)
    ?? new Date().toISOString()

  const base = (args: {
    stepId: string
    phase: AiExecutionTracePhase
    category: AiExecutionTraceCategory
    text: string
    details?: Record<string, unknown>
  }): AiExecutionTraceStep => ({
    stepId: args.stepId,
    sequence,
    emittedAt,
    phase: args.phase,
    category: args.category,
    text: args.text,
    entities: [],
    details: args.details ?? null,
    previewKeys: [],
    editStreamKeys: [],
    source: "build_event",
  })

  if (isBuildEventType(eventType, "website_index_started")) {
    return [
      base({
        stepId: `${unitId}:website_index`,
        phase: "started",
        category: "discovery",
        text: "Refreshing project website index…",
      }),
    ]
  }
  const websiteIndexDegradedCopy =
    "No grounded internal-link catalogue was available. A background website refresh was scheduled."
  if (
    isBuildEventType(eventType, "website_index_scheduled")
    || isBuildEventType(eventType, "website_index_empty")
  ) {
    return [
      base({
        stepId: `${unitId}:website_index`,
        phase: "warning",
        category: "discovery",
        text: websiteIndexDegradedCopy,
        details: {
          ...(asRecord(payload) ?? {}),
          discovered_count:
            toFiniteNumber(payload.discovered_count)
            ?? toFiniteNumber(payload.discoveredCount)
            ?? 0,
        },
      }),
    ]
  }
  if (isBuildEventType(eventType, "website_index_completed")) {
    const discovered =
      toFiniteNumber(payload.discovered_count)
      ?? toFiniteNumber(payload.discoveredCount)
    const enriched =
      toFiniteNumber(payload.enriched_count)
      ?? toFiniteNumber(payload.enrichedCount)
    // Zero pages is a non-blocking warning — never claim link context was loaded.
    if (discovered == null || discovered === 0) {
      return [
        base({
          stepId: `${unitId}:website_index`,
          phase: "warning",
          category: "discovery",
          text: websiteIndexDegradedCopy,
          details: {
            discovered_count: discovered ?? 0,
            ...(enriched != null ? { enriched_count: enriched } : {}),
          },
        }),
      ]
    }
    const parts: string[] = ["Website index refreshed"]
    parts.push(`${discovered} pages discovered`)
    if (enriched != null) parts.push(`${enriched} enriched`)
    return [
      base({
        stepId: `${unitId}:website_index`,
        phase: "completed",
        category: "discovery",
        text: parts.join(" · "),
        details: {
          discovered_count: discovered,
          ...(enriched != null ? { enriched_count: enriched } : {}),
        },
      }),
    ]
  }
  if (isBuildEventType(eventType, "website_index_failed")) {
    const error =
      toTrimmedString(payload.error_message)
      ?? toTrimmedString(payload.error)
      ?? "Website index refresh failed"
    return [
      base({
        stepId: `${unitId}:website_index`,
        phase: "failed",
        category: "discovery",
        text: error,
      }),
    ]
  }

  if (isBuildEventType(eventType, "discovery_started")) {
    return [
      base({
        stepId: `${unitId}:discovery`,
        phase: "started",
        category: "discovery",
        text: "Discovering current structure and context…",
      }),
    ]
  }

  if (isBuildEventType(eventType, "discovery_snapshot")) {
    const summary =
      summarizeGenerationContext(payload)
      ?? toTrimmedString(payload.summary)
      ?? "Loaded generation context"
    const steps: AiExecutionTraceStep[] = [
      base({
        stepId: `${unitId}:discovery`,
        phase: "completed",
        category: "discovery",
        text: summary.startsWith("Loaded") ? summary : `Loaded ${summary}`,
      }),
    ]

    const selectedIds = Array.isArray(payload.selected_component_ids)
      ? payload.selected_component_ids
      : Array.isArray(payload.selectedComponentIds)
        ? payload.selectedComponentIds
        : null
    // Never treat post-preparation `current_components` as user-selected.
    const selectedCount =
      selectedIds != null
        ? selectedIds.length
        : toFiniteNumber(payload.selected_count)
          ?? (Array.isArray(payload.selected_components)
            ? payload.selected_components.length
            : null)
    const inactiveCount =
      toFiniteNumber(payload.inactive_count)
      ?? (Array.isArray(payload.inactive_components) ? payload.inactive_components.length : null)
      ?? (Array.isArray(payload.inactive_task_components) ? payload.inactive_task_components.length : null)
    const activeCount =
      toFiniteNumber(payload.active_count)
      ?? (Array.isArray(payload.active_components) ? payload.active_components.length : null)
      ?? (Array.isArray(payload.current_components) ? payload.current_components.length : null)
      ?? (selectedCount != null && selectedCount > 0 ? selectedCount : null)

    if (activeCount != null || inactiveCount != null) {
      const active = activeCount ?? 0
      const inactive = inactiveCount ?? 0
      steps.push(
        base({
          stepId: `${unitId}:discovery:components`,
          phase: "completed",
          category: "discovery",
          text:
            `Found ${active} active component${active === 1 ? "" : "s"}`
            + ` and ${inactive} inactive component${inactive === 1 ? "" : "s"} available for reuse.`,
          details: {
            active_count: active,
            inactive_count: inactive,
            ...(selectedCount != null && selectedCount > 0
              ? { selected_count: selectedCount }
              : {}),
          },
        }),
      )
    }

    const decisionsRaw =
      (Array.isArray(payload.decisions) && payload.decisions)
      || (Array.isArray(payload.component_decisions) && payload.component_decisions)
      || []
    decisionsRaw.forEach((row, index) => {
      const record = asRecord(row)
      if (!record) return
      const line = formatDecisionLine(record)
      if (!line) return
      steps.push(
        base({
          stepId: `${unitId}:decision:${index}:${toTrimmedString(record.candidate_title) ?? toTrimmedString(record.title) ?? index}`,
          phase: "completed",
          category: "planning",
          text: line,
          details: {
            candidate_title:
              toTrimmedString(record.candidate_title)
              ?? toTrimmedString(record.title),
            outcome: toTrimmedString(record.outcome) ?? toTrimmedString(record.decision),
            // Full reason stays in details for the collapsed Execution details drawer only.
            reason: toTrimmedString(record.reason) ?? toTrimmedString(record.rationale),
          },
        }),
      )
    })
    return steps
  }

  if (isBuildEventType(eventType, "component_decisions")) {
    const decisionsRaw =
      (Array.isArray(payload.decisions) && payload.decisions)
      || (Array.isArray(payload.component_decisions) && payload.component_decisions)
      || (Array.isArray(payload.candidates) && payload.candidates)
      || []
    const steps: AiExecutionTraceStep[] = []
    decisionsRaw.forEach((row, index) => {
      const record = asRecord(row)
      if (!record) return
      const line = formatDecisionLine(record)
      if (!line) return
      steps.push(
        base({
          stepId: `${unitId}:decision:${index}:${toTrimmedString(record.candidate_title) ?? toTrimmedString(record.title) ?? index}`,
          phase: "completed",
          category: "planning",
          text: line,
          details: {
            candidate_title:
              toTrimmedString(record.candidate_title)
              ?? toTrimmedString(record.title),
            outcome: toTrimmedString(record.outcome) ?? toTrimmedString(record.decision),
            reason: toTrimmedString(record.reason) ?? toTrimmedString(record.rationale),
            raw: record,
          },
        }),
      )
    })
    return steps
  }

  if (isBuildEventType(eventType, "required_structure_prepared")) {
    return mapRequiredStructurePreparedSteps(unitId, sequence, emittedAt, payload, base)
  }

  if (isBuildEventType(eventType, "repair_started")) {
    return [
      base({
        stepId: `${unitId}:repair`,
        phase: "started",
        category: "verification",
        text: "Repairing structure validation issues…",
      }),
    ]
  }

  if (isBuildEventType(eventType, "repair_finished")) {
    const explicitlyFailed =
      event.phase === "failed"
      || payload.succeeded === false
      || payload.ok === false
      || payload.repair_succeeded === false
    // Failed repair shares the unit failure step so repair + unit.failed + build.failed
    // collapse into one logical failure row in the timeline.
    if (explicitlyFailed) {
      const error =
        toTrimmedString(payload.error_message)
        ?? toTrimmedString(payload.error)
        ?? toTrimmedString(payload.message)
        ?? "Structure validation failed"
      return [
        base({
          stepId: `${unitId}:failed`,
          phase: "failed",
          category: "verification",
          text: error,
          details: {
            source: "repair_finished",
            ...(asRecord(payload) ?? {}),
          },
        }),
      ]
    }
    return [
      base({
        stepId: `${unitId}:repair`,
        phase: "completed",
        category: "verification",
        text: "Structure repair finished",
      }),
    ]
  }

  // Artifact-first durable decisions — before generic `*.failed` which also matches
  // `artifact.failed`.
  const artifactSteps = mapArtifactBuildEventToExecutionTraceSteps(
    eventType,
    unitId,
    sequence,
    emittedAt,
    payload,
    base,
  )
  if (artifactSteps.length > 0) return artifactSteps

  if (
    isBuildEventType(eventType, "failed")
    || normalizeBuildEventType(eventType) === "build.failed"
  ) {
    // Same step_id as failed repair so timeline does not duplicate failure cards.
    const error =
      toTrimmedString(payload.error_message)
      ?? toTrimmedString(payload.error)
      ?? toTrimmedString(payload.message)
      ?? "Work unit failed"
    return [
      base({
        stepId: `${unitId}:failed`,
        phase: "failed",
        category: "verification",
        text: error,
        details: {
          source: eventType,
          error_code:
            toTrimmedString(payload.error_code)
            ?? toTrimmedString(payload.code),
        },
      }),
    ]
  }

  return []
}

function normalizeArtifactEventType(eventType: string): string {
  const normalized = normalizeBuildEventType(eventType)
  if (normalized.startsWith("artifact.")) return normalized
  // Tolerate `work_unit.artifact.plan_ready` / trailing suffixes.
  const artifactIdx = normalized.indexOf("artifact.")
  return artifactIdx >= 0 ? normalized.slice(artifactIdx) : normalized
}

function quoteTitle(title: string | null): string {
  return title ? `“${title}”` : "artifact"
}

function mapArtifactBuildEventToExecutionTraceSteps(
  eventType: string,
  unitId: string,
  sequence: number,
  emittedAt: string,
  payload: Record<string, unknown>,
  base: (args: {
    stepId: string
    phase: AiExecutionTracePhase
    category: AiExecutionTraceCategory
    text: string
    details?: Record<string, unknown>
  }) => AiExecutionTraceStep,
): AiExecutionTraceStep[] {
  const normalized = normalizeArtifactEventType(eventType)

  if (
    normalized === "artifact.plan_ready"
    || normalized === "artifact.started"
    || normalized === "artifact.structure_decided"
    || normalized.includes("artifact.preview")
    || normalized.includes("artifact.version_saved")
    || (normalized.endsWith(".saved") && normalized.includes("artifact"))
  ) {
    // Artifact preview cards already communicate progress/result — skip boilerplate timeline lines.
    return []
  }

  if (normalized === "artifact.context_loaded") {
    // Agent-internal bootstrap (templates, sources, link catalogue). Not a user-facing step —
    // linkbuilding instructions live in prompts; don't surface candidate counts in the timeline.
    return []
  }

  if (normalized === "artifact.failed") {
    const artifactId =
      toTrimmedString(payload.artifact_id)
      ?? toTrimmedString(payload.artifactId)
      ?? "artifact"
    const errorCode =
      toTrimmedString(payload.error_code)
      ?? toTrimmedString(payload.code)
    const error =
      toTrimmedString(payload.error_message)
      ?? toTrimmedString(payload.error)
      ?? toTrimmedString(payload.message)
      ?? "Artifact build failed"
    const retryState =
      toTrimmedString(payload.retry_state)
      ?? toTrimmedString(payload.retryState)
      ?? (payload.will_retry === true
        ? "will_retry"
        : payload.retryable === true
          ? "retryable"
          : null)
    const title =
      toTrimmedString(payload.title)
      ?? toTrimmedString(payload.artifact_title)
    const bits = [error]
    if (errorCode) bits.unshift(errorCode)
    if (retryState) bits.push(`(${retryState.replace(/_/g, " ")})`)
    return [
      // Same stepId as artifact.started so the timeline spinner clears.
      base({
        stepId: `${unitId}:artifact:started:${artifactId}`,
        phase: "failed",
        category: "verification",
        text: title
          ? `${quoteTitle(title)} failed — ${bits.join(" · ")}`
          : bits.join(" · "),
        details: {
          artifact_id: artifactId,
          error_code: errorCode,
          retry_state: retryState,
          source: eventType,
        },
      }),
    ]
  }

  return []
}

function collectStructureActionTitles(
  payload: Record<string, unknown>,
  actions: Set<string>,
): string[] {
  const titles: string[] = []
  const seen = new Set<string>()
  const push = (title: string | null) => {
    if (!title || seen.has(title.toLowerCase())) return
    seen.add(title.toLowerCase())
    titles.push(title)
  }

  const lists = [
    payload.actions,
    payload.component_actions,
    payload.components,
    payload.items,
  ]
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const row of list) {
      const record = asRecord(row)
      if (!record) continue
      const action =
        (toTrimmedString(record.action) ?? toTrimmedString(record.operation) ?? "").toLowerCase()
      if (!actions.has(action)) continue
      push(
        toTrimmedString(record.title)
        ?? toTrimmedString(record.component_title)
        ?? toTrimmedString(record.name),
      )
    }
  }

  const wantsCreate = [...actions].some((action) => action.startsWith("create"))
  if (wantsCreate) {
    for (const key of ["created", "created_titles", "created_components"]) {
      const value = payload[key]
      if (!Array.isArray(value)) continue
      for (const row of value) {
        if (typeof row === "string") push(row)
        else {
          const record = asRecord(row)
          push(
            toTrimmedString(record?.title)
            ?? toTrimmedString(record?.component_title)
            ?? toTrimmedString(record?.name),
          )
        }
      }
    }
  }
  if (actions.has("reactivate_existing") || actions.has("reactivate") || actions.has("reactivated")) {
    for (const key of ["reactivated", "reactivated_titles", "reactivated_components"]) {
      const value = payload[key]
      if (!Array.isArray(value)) continue
      for (const row of value) {
        if (typeof row === "string") push(row)
        else {
          const record = asRecord(row)
          push(
            toTrimmedString(record?.title)
            ?? toTrimmedString(record?.component_title)
            ?? toTrimmedString(record?.name),
          )
        }
      }
    }
  }

  return titles
}

function mapRequiredStructurePreparedSteps(
  unitId: string,
  sequence: number,
  emittedAt: string,
  payload: Record<string, unknown>,
  base: (args: {
    stepId: string
    phase: AiExecutionTracePhase
    category: AiExecutionTraceCategory
    text: string
    details?: Record<string, unknown>
  }) => AiExecutionTraceStep,
): AiExecutionTraceStep[] {
  const preparedCount =
    toFiniteNumber(payload.prepared_count)
    ?? toFiniteNumber(payload.required_count)
    ?? toFiniteNumber(payload.count)
    ?? (Array.isArray(payload.actions) ? payload.actions.length : null)
    ?? (Array.isArray(payload.components) ? payload.components.length : null)

  const createdTitles = collectStructureActionTitles(
    payload,
    new Set(["create", "create_from_system", "create_custom", "create_from_library", "created"]),
  )
  const reactivatedTitles = collectStructureActionTitles(
    payload,
    new Set(["reactivate_existing", "reactivate", "reactivated"]),
  )
  const createdCount =
    toFiniteNumber(payload.created_count) ?? (createdTitles.length > 0 ? createdTitles.length : null)
  const reactivatedCount =
    toFiniteNumber(payload.reactivated_count)
    ?? (reactivatedTitles.length > 0 ? reactivatedTitles.length : null)

  const steps: AiExecutionTraceStep[] = []
  if (preparedCount != null) {
    steps.push(
      base({
        stepId: `${unitId}:required_structure`,
        phase: "completed",
        category: "planning",
        text: `Prepared ${preparedCount} policy-required component${preparedCount === 1 ? "" : "s"}`,
        details: {
          prepared_count: preparedCount,
          created_count: createdCount,
          reactivated_count: reactivatedCount,
        },
      }),
    )
  } else {
    steps.push(
      base({
        stepId: `${unitId}:required_structure`,
        phase: "completed",
        category: "planning",
        text: "Prepared policy-required components",
      }),
    )
  }

  const countBits: string[] = []
  if (createdCount != null && createdCount > 0) {
    countBits.push(`Created ${createdCount}`)
  }
  if (reactivatedCount != null && reactivatedCount > 0) {
    countBits.push(`Reactivated ${reactivatedCount}`)
  }
  if (countBits.length > 0) {
    steps.push(
      base({
        stepId: `${unitId}:required_structure:actions`,
        phase: "completed",
        category: "mutation",
        text: countBits.join(" · "),
        details: {
          created_titles: createdTitles,
          reactivated_titles: reactivatedTitles,
        },
      }),
    )
  }
  return steps
}

/** Active (started) step preferred for attaching incoming preview cards. */
export function findStepIdForIncomingPreview(
  steps: AiExecutionTraceStep[],
): string | null {
  const ordered = [...steps].sort((a, b) => b.sequence - a.sequence)
  const activeGeneration = ordered.find(
    (step) =>
      step.phase === "started"
      && (step.category === "generation" || step.category === "mutation"),
  )
  if (activeGeneration) return activeGeneration.stepId
  const anyActive = ordered.find((step) => step.phase === "started")
  if (anyActive) return anyActive.stepId
  return ordered[0]?.stepId ?? null
}
