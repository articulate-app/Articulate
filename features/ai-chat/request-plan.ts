/**
 * Request Plan V3 — execution-plan audit for AI chat.
 *
 * Stream marker: `__AI_REQUEST_PLAN__{ type:"request_plan", phase, plan }`
 * Persisted: `message.content_json.request_plan`
 *
 * This is an execution-plan audit, not model reasoning / chain-of-thought.
 */

export type RequestPlanStatus =
  | "planning"
  | "waiting_for_input"
  | "ready"
  | "executing"
  | "completed"
  | "partially_completed"
  | "failed"
  | "cancelled"
  | "expired"
  | string

export type RequestPlanCandidate = {
  id: string
  label: string
  selected: boolean | null
  rejected: boolean | null
  metadata: unknown
}

export type RequestPlanResolutionMatch = {
  reference: string | null
  candidateId: string | null
  candidateLabel: string | null
  reason: string | null
  confidence: string | null
  metadata: unknown
}

export type RequestPlanResolution = {
  entityType: string | null
  matches: RequestPlanResolutionMatch[]
  unresolved: string[]
  candidatesConsidered: RequestPlanCandidate[]
  raw: Record<string, unknown>
}

export type RequestPlanInterpretation = {
  operation: string | null
  targetScope: string | null
  editKind: string | null
  summary: string | null
}

export type RequestPlanDecisionAudit = {
  interpretation: RequestPlanInterpretation | null
  resolutions: RequestPlanResolution[]
  candidatesConsidered: RequestPlanCandidate[]
  raw: Record<string, unknown>
}

export type RequestPlanMissingInput = {
  field: string | null
  allowMultiple: boolean | null
  raw: Record<string, unknown>
}

/** Worker/build lifecycle nested under plan.arguments.execution_phase. */
export type RequestPlanExecutionPhase =
  | "queued"
  | "running"
  | "completed"
  | "partially_completed"
  | "failed"
  | "cancelled"
  | string

/** Normalized public request plan (stream + persisted snapshot). */
export type AiRequestPlan = {
  planId: string
  planVersion: number | null
  operation: string | null
  executor: string | null
  status: RequestPlanStatus
  phase: string | null
  /** From `arguments.execution_phase` — queued/running until worker terminal. */
  executionPhase: RequestPlanExecutionPhase | null
  requestText: string | null
  mutationTargets: Record<string, unknown>
  contextRefs: Record<string, unknown>
  targetReferences: unknown[]
  arguments: Record<string, unknown>
  missingInputs: RequestPlanMissingInput[]
  resolvedInputs: Record<string, unknown>
  /** Convenience: resolved_inputs.build_id when present. */
  buildId: string | null
  decisionAudit: RequestPlanDecisionAudit | null
  resultSummary: Record<string, unknown> | null
  verification: Record<string, unknown> | null
  createdAt: string | null
  updatedAt: string | null
}

export type AiRequestPlanStreamEvent = {
  type: "request_plan"
  phase: string | null
  plan: AiRequestPlan
  emittedAt: string | null
}

const REQUEST_PLAN_STATUS_LABELS: Record<string, string> = {
  planning: "Resolving request",
  waiting_for_input: "Needs your input",
  ready: "Ready to run",
  queued: "Build queued",
  running: "Build running",
  dispatch_started: "Build queued",
  executing: "Build running",
  completed: "Build completed",
  partially_completed: "Partially completed",
  failed: "Build failed",
  cancelled: "Cancelled",
  expired: "Expired",
}

const REQUEST_PLAN_EXECUTION_PHASES = new Set([
  "queued",
  "running",
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
])

/** Phases/statuses that mean queued or running — never completed content. */
const REQUEST_PLAN_IN_FLIGHT = new Set([
  "dispatch_started",
  "dispatched",
  "queued",
  "running",
  "in_progress",
  "executing",
])

const REQUEST_PLAN_TERMINAL_SUCCESS = new Set([
  "completed",
  "partially_completed",
])

const REQUEST_PLAN_TERMINAL_FAILURE = new Set([
  "failed",
  "cancelled",
  "expired",
])

/**
 * Normalize a plan/stream status without collapsing queued vs running.
 * `dispatch_started` / successful `ai_start_orchestrated_build` → queued (never completed).
 */
export function normalizeRequestPlanStatus(
  status: string | null | undefined,
  phase?: string | null,
): string {
  const statusRaw = (status ?? "").trim().toLowerCase()
  const phaseRaw = (phase ?? "").trim().toLowerCase()
  if (statusRaw === "dispatch_started" || phaseRaw === "dispatch_started") return "queued"
  if (statusRaw) return statusRaw
  if (phaseRaw) return phaseRaw
  return "planning"
}

export function extractRequestPlanExecutionPhase(
  plan: Pick<AiRequestPlan, "arguments" | "executionPhase" | "resultSummary" | "verification">,
): RequestPlanExecutionPhase | null {
  if (plan.executionPhase && REQUEST_PLAN_EXECUTION_PHASES.has(String(plan.executionPhase))) {
    return plan.executionPhase
  }
  const fromArgs = toTrimmedString(plan.arguments?.execution_phase)?.toLowerCase() ?? null
  if (fromArgs && REQUEST_PLAN_EXECUTION_PHASES.has(fromArgs)) return fromArgs
  const buildState =
    toTrimmedString(plan.resultSummary?.build_state)?.toLowerCase()
    ?? toTrimmedString(plan.resultSummary?.buildState)?.toLowerCase()
  if (buildState && REQUEST_PLAN_EXECUTION_PHASES.has(buildState)) return buildState
  return null
}

export function extractRequestPlanBuildId(
  plan: Pick<AiRequestPlan, "resolvedInputs" | "buildId" | "resultSummary">,
): string | null {
  if (plan.buildId?.trim()) return plan.buildId.trim()
  const fromResolved =
    toTrimmedString(plan.resolvedInputs?.build_id)
    ?? toTrimmedString(plan.resolvedInputs?.buildId)
  if (fromResolved) return fromResolved
  return (
    toTrimmedString(plan.resultSummary?.build_id)
    ?? toTrimmedString(plan.resultSummary?.buildId)
  )
}

export function isRequestPlanBuildTerminal(
  plan: Pick<AiRequestPlan, "verification" | "resultSummary" | "executionPhase" | "arguments">,
): boolean {
  if (plan.verification?.build_terminal === true) return true
  if (plan.verification?.buildTerminal === true) return true
  const phase = extractRequestPlanExecutionPhase(plan)
  if (!phase) return false
  return REQUEST_PLAN_TERMINAL_SUCCESS.has(phase) || REQUEST_PLAN_TERMINAL_FAILURE.has(phase)
}

/**
 * Display badge for the request-plan card.
 * Prefer `execution_phase` when present; never treat start-tool acceptance as completed.
 */
export function resolveRequestPlanDisplayStatus(plan: AiRequestPlan): {
  status: string
  label: string
  isQueued: boolean
  isRunning: boolean
  isSuccess: boolean
  isPartial: boolean
  isFailed: boolean
  isCancelled: boolean
  isInFlight: boolean
} {
  const executionPhase = extractRequestPlanExecutionPhase(plan)
  const raw = (executionPhase || normalizeRequestPlanStatus(plan.status, plan.phase)).toLowerCase()

  if (raw === "queued" || raw === "dispatch_started") {
    return {
      status: "queued",
      label: "Build queued",
      isQueued: true,
      isRunning: false,
      isSuccess: false,
      isPartial: false,
      isFailed: false,
      isCancelled: false,
      isInFlight: true,
    }
  }
  if (raw === "running" || raw === "executing" || raw === "in_progress") {
    return {
      status: "running",
      label: "Build running",
      isQueued: false,
      isRunning: true,
      isSuccess: false,
      isPartial: false,
      isFailed: false,
      isCancelled: false,
      isInFlight: true,
    }
  }
  if (raw === "completed") {
    return {
      status: "completed",
      label: "Build completed",
      isQueued: false,
      isRunning: false,
      isSuccess: true,
      isPartial: false,
      isFailed: false,
      isCancelled: false,
      isInFlight: false,
    }
  }
  if (raw === "partially_completed") {
    return {
      status: "partially_completed",
      label: "Partially completed",
      isQueued: false,
      isRunning: false,
      isSuccess: false,
      isPartial: true,
      isFailed: false,
      isCancelled: false,
      isInFlight: false,
    }
  }
  if (raw === "failed") {
    return {
      status: "failed",
      label: "Build failed",
      isQueued: false,
      isRunning: false,
      isSuccess: false,
      isPartial: false,
      isFailed: true,
      isCancelled: false,
      isInFlight: false,
    }
  }
  if (raw === "cancelled") {
    return {
      status: "cancelled",
      label: "Cancelled",
      isQueued: false,
      isRunning: false,
      isSuccess: false,
      isPartial: false,
      isFailed: false,
      isCancelled: true,
      isInFlight: false,
    }
  }
  return {
    status: raw || "planning",
    label: REQUEST_PLAN_STATUS_LABELS[raw] ?? (raw || "Resolving request").replace(/_/g, " "),
    isQueued: false,
    isRunning: false,
    isSuccess: false,
    isPartial: false,
    isFailed: REQUEST_PLAN_TERMINAL_FAILURE.has(raw),
    isCancelled: false,
    isInFlight: REQUEST_PLAN_IN_FLIGHT.has(raw),
  }
}

/**
 * Merge durable orchestrated-build terminal state into the plan display fields.
 * Does not invent completion from a successful start alone.
 */
export function mergeOrchestratedBuildIntoRequestPlan(
  plan: AiRequestPlan,
  build: {
    status?: string | null
    succeeded_units?: number
    failed_units?: number
    total_units?: number
  } | null,
): AiRequestPlan {
  if (!build?.status) return plan
  const buildStatus = String(build.status).trim().toLowerCase()
  const mapBuildToPhase = (): RequestPlanExecutionPhase | null => {
    if (buildStatus === "queued") return "queued"
    if (buildStatus === "running") return "running"
    if (buildStatus === "completed") return "completed"
    if (buildStatus === "partially_completed") return "partially_completed"
    if (buildStatus === "failed") return "failed"
    if (buildStatus === "cancelled") return "cancelled"
    return null
  }
  const phase = mapBuildToPhase()
  if (!phase) return plan
  const isTerminal = REQUEST_PLAN_TERMINAL_SUCCESS.has(phase) || REQUEST_PLAN_TERMINAL_FAILURE.has(phase)
  const nextStatus =
    phase === "queued" || phase === "running"
      ? "executing"
      : phase
  return {
    ...plan,
    status: nextStatus,
    executionPhase: phase,
    arguments: {
      ...plan.arguments,
      execution_phase: phase,
    },
    resultSummary: {
      ...(plan.resultSummary ?? {}),
      build_state: phase,
      ...(build.succeeded_units != null ? { succeeded_units: build.succeeded_units } : {}),
      ...(build.failed_units != null ? { failed_units: build.failed_units } : {}),
      ...(build.total_units != null ? { total_units: build.total_units } : {}),
    },
    verification: {
      ...(plan.verification ?? {}),
      build_terminal: isTerminal,
    },
  }
}

export function requestPlanStatusLabel(status: string | null | undefined): string {
  if (!status) return "Resolving request"
  const normalized = normalizeRequestPlanStatus(status)
  return REQUEST_PLAN_STATUS_LABELS[normalized]
    ?? REQUEST_PLAN_STATUS_LABELS[status]
    ?? status.replace(/_/g, " ")
}

/** True only for completed (not partially_completed, not in-flight). */
export function requestPlanShowsCompletion(status: string | null | undefined): boolean {
  return normalizeRequestPlanStatus(status).toLowerCase() === "completed"
}

export function requestPlanShowsPartialCompletion(status: string | null | undefined): boolean {
  return normalizeRequestPlanStatus(status).toLowerCase() === "partially_completed"
}

const OPERATION_LABELS: Record<string, string> = {
  edit_component: "Edit component",
  format_components: "Format components",
  create_component: "Create component",
  reorder_task_channel_components: "Reorder components",
  update_task_fields: "Update task fields",
  update_project_fields: "Update project fields",
  manage_users_watchers: "Manage users & watchers",
  plan_component_structure: "Plan component structure",
  apply_component_structure: "Apply component structure",
  build_task_content: "Build task content",
  other_mutation: "Apply changes",
}

/** Proposal-only — never show mutation/build progress cards for this operation. */
export function isPlanComponentStructureOperation(operation: string | null | undefined): boolean {
  return operation === "plan_component_structure"
}

/** Structure apply — show structure previews/saves, never an orchestrated build card. */
export function isApplyComponentStructureOperation(operation: string | null | undefined): boolean {
  return operation === "apply_component_structure"
}

/** Full content build — orchestrated build UI only after a real build_id exists. */
export function isBuildTaskContentOperation(operation: string | null | undefined): boolean {
  return operation === "build_task_content"
}

/** Whether an orchestrated-build progress card may mount for this request-plan operation. */
export function requestPlanAllowsOrchestratedBuildCard(
  operation: string | null | undefined,
): boolean {
  if (isPlanComponentStructureOperation(operation)) return false
  if (isApplyComponentStructureOperation(operation)) return false
  return true
}

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {}
}

function normalizeCandidate(raw: unknown): RequestPlanCandidate | null {
  if (!isPlainObject(raw)) return null
  const id = toTrimmedString(raw.id) ?? ""
  const label = toTrimmedString(raw.label) ?? toTrimmedString(raw.title) ?? toTrimmedString(raw.name) ?? ""
  if (!id && !label) return null
  const selected = typeof raw.selected === "boolean" ? raw.selected : null
  const rejected =
    typeof raw.rejected === "boolean"
      ? raw.rejected
      : selected === false
        ? true
        : selected === true
          ? false
          : null
  return {
    id: id || label,
    label: label || id,
    selected,
    rejected,
    metadata: "metadata" in raw ? raw.metadata : undefined,
  }
}

function normalizeCandidates(value: unknown): RequestPlanCandidate[] {
  if (!Array.isArray(value)) return []
  const out: RequestPlanCandidate[] = []
  const seen = new Set<string>()
  for (const row of value) {
    const candidate = normalizeCandidate(row)
    if (!candidate || seen.has(candidate.id)) continue
    seen.add(candidate.id)
    out.push(candidate)
  }
  return out
}

function normalizeMatch(raw: unknown): RequestPlanResolutionMatch | null {
  if (!isPlainObject(raw)) return null
  const reference =
    toTrimmedString(raw.reference)
    ?? toTrimmedString(raw.requested_name)
    ?? toTrimmedString(raw.user_wording)
    ?? toTrimmedString(raw.text)
  const candidateId =
    toTrimmedString(raw.candidate_id)
    ?? (raw.candidate_id != null ? String(raw.candidate_id) : null)
    ?? (raw.channel_id != null ? String(raw.channel_id) : null)
    ?? (raw.id != null ? String(raw.id) : null)
  const candidateLabel =
    toTrimmedString(raw.candidate_label)
    ?? toTrimmedString(raw.channel_name)
    ?? toTrimmedString(raw.label)
    ?? toTrimmedString(raw.title)
  const reason = toTrimmedString(raw.reason)
  if (!reference && !candidateId && !candidateLabel && !reason) return null
  return {
    reference,
    candidateId,
    candidateLabel,
    reason,
    confidence: toTrimmedString(raw.confidence),
    metadata: "metadata" in raw ? raw.metadata : undefined,
  }
}

function normalizeUnresolved(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      out.push(item.trim())
      continue
    }
    if (isPlainObject(item)) {
      const text =
        toTrimmedString(item.text)
        ?? toTrimmedString(item.reference)
        ?? toTrimmedString(item.name)
        ?? toTrimmedString(item.label)
      if (text) out.push(text)
    }
  }
  return out
}

function normalizeResolution(raw: unknown): RequestPlanResolution | null {
  if (!isPlainObject(raw)) return null
  const matchesSource = Array.isArray(raw.matches) ? raw.matches : []
  const matches = matchesSource
    .map((item) => normalizeMatch(item))
    .filter((item): item is RequestPlanResolutionMatch => item != null)
  const unresolved = normalizeUnresolved(raw.unresolved ?? raw.unresolved_references ?? raw.unresolved_names)
  const candidatesConsidered = normalizeCandidates(raw.candidates_considered)
  const entityType = toTrimmedString(raw.entity_type)
  if (
    !entityType
    && matches.length === 0
    && unresolved.length === 0
    && candidatesConsidered.length === 0
  ) {
    return null
  }
  return {
    entityType,
    matches,
    unresolved,
    candidatesConsidered,
    raw,
  }
}

function normalizeInterpretation(raw: unknown): RequestPlanInterpretation | null {
  if (!isPlainObject(raw)) return null
  const interpretation: RequestPlanInterpretation = {
    operation: toTrimmedString(raw.operation),
    targetScope: toTrimmedString(raw.target_scope),
    editKind: toTrimmedString(raw.edit_kind),
    summary: toTrimmedString(raw.summary) ?? toTrimmedString(raw.reason),
  }
  if (
    !interpretation.operation
    && !interpretation.targetScope
    && !interpretation.editKind
    && !interpretation.summary
  ) {
    return null
  }
  return interpretation
}

function normalizeDecisionAudit(raw: unknown): RequestPlanDecisionAudit | null {
  if (!isPlainObject(raw)) return null
  const resolutions = Array.isArray(raw.resolutions)
    ? raw.resolutions
        .map((item) => normalizeResolution(item))
        .filter((item): item is RequestPlanResolution => item != null)
    : []
  // Some older audit payloads are a single resolution-shaped object.
  if (resolutions.length === 0 && (raw.matches != null || raw.candidates_considered != null)) {
    const asResolution = normalizeResolution(raw)
    if (asResolution) resolutions.push(asResolution)
  }
  const interpretation = normalizeInterpretation(raw.interpretation)
  const candidatesConsidered = normalizeCandidates(raw.candidates_considered)
  if (!interpretation && resolutions.length === 0 && candidatesConsidered.length === 0) {
    return null
  }
  return {
    interpretation,
    resolutions,
    candidatesConsidered,
    raw,
  }
}

function normalizeMissingInput(raw: unknown): RequestPlanMissingInput | null {
  if (typeof raw === "string" && raw.trim()) {
    return { field: raw.trim(), allowMultiple: null, raw: { field: raw.trim() } }
  }
  if (!isPlainObject(raw)) return null
  const field = toTrimmedString(raw.field) ?? toTrimmedString(raw.name)
  if (!field && Object.keys(raw).length === 0) return null
  return {
    field,
    allowMultiple: typeof raw.allow_multiple === "boolean" ? raw.allow_multiple : null,
    raw,
  }
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? { ...value } : {}
}

function normalizeNullableRecord(value: unknown): Record<string, unknown> | null {
  if (value == null) return null
  return isPlainObject(value) ? { ...value } : null
}

/** Normalize a public plan object (`plan` from stream, or `content_json.request_plan`). */
export function normalizeRequestPlan(
  raw: unknown,
  options?: { phase?: string | null },
): AiRequestPlan | null {
  if (!isPlainObject(raw)) return null

  // Stream envelope: { type, phase, plan }
  if (raw.type === "request_plan" && isPlainObject(raw.plan)) {
    return normalizeRequestPlan(raw.plan, {
      phase: toTrimmedString(raw.phase) ?? options?.phase ?? null,
    })
  }

  const planId =
    toTrimmedString(raw.plan_id)
    ?? toTrimmedString(raw.id)
  if (!planId) return null

  const rawStatus =
    toTrimmedString(raw.status)
    ?? toTrimmedString(options?.phase)
    ?? "planning"
  const status = normalizeRequestPlanStatus(rawStatus, options?.phase)

  const argumentsRecord = normalizeRecord(raw.arguments)
  const resolvedInputs = normalizeRecord(raw.resolved_inputs)
  const resultSummary = normalizeNullableRecord(raw.result_summary)
  const verification = normalizeNullableRecord(raw.verification)
  const executionPhaseRaw =
    toTrimmedString(argumentsRecord.execution_phase)
    ?? toTrimmedString(raw.execution_phase)
  const executionPhase =
    executionPhaseRaw && REQUEST_PLAN_EXECUTION_PHASES.has(executionPhaseRaw.toLowerCase())
      ? executionPhaseRaw.toLowerCase()
      : null
  const buildId =
    toTrimmedString(resolvedInputs.build_id)
    ?? toTrimmedString(resolvedInputs.buildId)
    ?? toTrimmedString(resultSummary?.build_id)
    ?? toTrimmedString(raw.build_id)

  // Never treat a successful start (dispatch_started) as completed content.
  const statusForStore =
    status === "queued" || status === "dispatch_started" || executionPhase === "queued"
      ? (status === "completed" || status === "partially_completed" ? status : "executing")
      : status

  return {
    planId,
    planVersion: toFiniteNumber(raw.plan_version),
    operation: toTrimmedString(raw.operation),
    executor: toTrimmedString(raw.executor),
    status: statusForStore,
    phase: toTrimmedString(options?.phase) ?? toTrimmedString(raw.status),
    executionPhase:
      executionPhase
      ?? (status === "queued" || status === "dispatch_started" ? "queued" : null),
    requestText: toTrimmedString(raw.request_text),
    mutationTargets: normalizeRecord(raw.mutation_targets),
    contextRefs: normalizeRecord(raw.context_refs),
    targetReferences: Array.isArray(raw.target_references) ? [...raw.target_references] : [],
    arguments: argumentsRecord,
    missingInputs: Array.isArray(raw.missing_inputs)
      ? raw.missing_inputs
          .map((item) => normalizeMissingInput(item))
          .filter((item): item is RequestPlanMissingInput => item != null)
      : [],
    resolvedInputs,
    buildId,
    decisionAudit: normalizeDecisionAudit(raw.decision_audit),
    resultSummary,
    verification,
    createdAt: toTrimmedString(raw.created_at),
    updatedAt: toTrimmedString(raw.updated_at),
  }
}

/** Normalize a live stream event (`__AI_REQUEST_PLAN__` / SSE `type: request_plan`). */
export function normalizeRequestPlanStreamEvent(raw: unknown): AiRequestPlanStreamEvent | null {
  if (!isPlainObject(raw)) return null
  if (raw.type != null && raw.type !== "request_plan") return null
  const phase = toTrimmedString(raw.phase)
  const planSource = isPlainObject(raw.plan) ? raw.plan : raw
  const plan = normalizeRequestPlan(planSource, { phase })
  if (!plan) return null
  return {
    type: "request_plan",
    phase,
    plan,
    emittedAt: toTrimmedString(raw.emitted_at),
  }
}

/**
 * Merge by `plan_id`: later events replace earlier fields.
 * Nested objects/arrays from the incoming plan fully replace prior values when present.
 */
export function mergeRequestPlan(
  previous: AiRequestPlan | null,
  incoming: AiRequestPlan,
): AiRequestPlan {
  if (!previous || previous.planId !== incoming.planId) {
    return {
      ...incoming,
      status: normalizeRequestPlanStatus(incoming.status, incoming.phase),
      executionPhase: incoming.executionPhase ?? extractRequestPlanExecutionPhase(incoming),
      buildId: incoming.buildId ?? extractRequestPlanBuildId(incoming),
    }
  }
  const nextStatus = normalizeRequestPlanStatus(incoming.status, incoming.phase)
  const prevStatus = normalizeRequestPlanStatus(previous.status, previous.phase)
  const prevDisplay = resolveRequestPlanDisplayStatus(previous)
  const nextDisplay = resolveRequestPlanDisplayStatus(incoming)
  // Never let an in-flight update overwrite a terminal success/failure.
  const status =
    (prevDisplay.isSuccess || prevDisplay.isPartial || prevDisplay.isFailed || prevDisplay.isCancelled)
    && nextDisplay.isInFlight
      ? prevStatus
      : nextStatus || prevStatus
  const executionPhase =
    (prevDisplay.isSuccess || prevDisplay.isPartial || prevDisplay.isFailed || prevDisplay.isCancelled)
    && nextDisplay.isInFlight
      ? previous.executionPhase
      : (incoming.executionPhase ?? previous.executionPhase ?? extractRequestPlanExecutionPhase(incoming))
  return {
    ...previous,
    ...incoming,
    planId: incoming.planId,
    phase: incoming.phase ?? previous.phase,
    status,
    executionPhase,
    buildId: incoming.buildId ?? previous.buildId ?? extractRequestPlanBuildId(incoming) ?? extractRequestPlanBuildId(previous),
    arguments: Object.keys(incoming.arguments).length > 0 ? incoming.arguments : previous.arguments,
    resolvedInputs:
      Object.keys(incoming.resolvedInputs).length > 0 ? incoming.resolvedInputs : previous.resolvedInputs,
    resultSummary: incoming.resultSummary ?? previous.resultSummary,
    verification: incoming.verification ?? previous.verification,
  }
}

export function requestPlanOperationLabel(operation: string | null | undefined): string {
  if (!operation) return "Execution plan"
  return OPERATION_LABELS[operation] ?? operation.replace(/_/g, " ")
}

function isPresentTargetValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === "string") return value.trim().length > 0
  if (typeof value === "number") return Number.isFinite(value)
  if (typeof value === "boolean") return true
  if (Array.isArray(value)) return value.length > 0
  if (isPlainObject(value)) return Object.keys(value).length > 0
  return true
}

/** Count resolved mutation targets + successful resolution matches. */
export function countResolvedTargets(plan: AiRequestPlan): number {
  const targetKeys = Object.values(plan.mutationTargets).filter(isPresentTargetValue).length
  const matchCount =
    plan.decisionAudit?.resolutions.reduce((sum, resolution) => sum + resolution.matches.length, 0)
    ?? 0
  return Math.max(targetKeys, matchCount)
}

/** Unresolved catalogue choices + outstanding missing inputs. */
export function countUnresolvedChoices(plan: AiRequestPlan): number {
  const unresolvedFromAudit =
    plan.decisionAudit?.resolutions.reduce((sum, resolution) => sum + resolution.unresolved.length, 0)
    ?? 0
  return Math.max(plan.missingInputs.length, unresolvedFromAudit)
}

export function collectCandidatesConsidered(plan: AiRequestPlan): RequestPlanCandidate[] {
  const out: RequestPlanCandidate[] = []
  const seen = new Set<string>()
  const pushAll = (candidates: RequestPlanCandidate[]) => {
    for (const candidate of candidates) {
      if (seen.has(candidate.id)) continue
      seen.add(candidate.id)
      out.push(candidate)
    }
  }
  if (plan.decisionAudit) {
    pushAll(plan.decisionAudit.candidatesConsidered)
    for (const resolution of plan.decisionAudit.resolutions) {
      pushAll(resolution.candidatesConsidered)
    }
  }
  return out
}

export function formatRequestPlanKeyValueRows(
  record: Record<string, unknown> | null | undefined,
): Array<{ key: string; value: string }> {
  if (!record) return []
  const sanitized = sanitizeRequestPlanResultSummary(record)
  const rows: Array<{ key: string; value: string }> = []
  for (const [key, value] of Object.entries(sanitized)) {
    if (value == null) continue
    if (typeof value === "string") {
      if (!value.trim()) continue
      rows.push({ key, value: value.trim() })
      continue
    }
    if (typeof value === "number" || typeof value === "boolean") {
      rows.push({ key, value: String(value) })
      continue
    }
    try {
      const serialized = JSON.stringify(value)
      if (serialized && serialized !== "{}" && serialized !== "[]" && serialized !== "null") {
        rows.push({ key, value: serialized })
      }
    } catch {
      // ignore non-serializable
    }
  }
  return rows
}

const DISPATCH_ONLY_TOOLS = new Set([
  "ai_start_orchestrated_build",
  "ai_start_artifact_build",
])

/**
 * Strip dispatch-only tool metadata from result summaries so failed builds do not
 * list `ai_start_orchestrated_build` / `ai_start_artifact_build` under successful content operations.
 */
export function sanitizeRequestPlanResultSummary(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...record }
  const filterTools = (value: unknown): unknown => {
    if (!Array.isArray(value)) return value
    const filtered = value.filter((row) => {
      if (typeof row === "string") return !DISPATCH_ONLY_TOOLS.has(row.trim())
      if (row && typeof row === "object" && !Array.isArray(row)) {
        const name =
          typeof (row as { tool_name?: unknown }).tool_name === "string"
            ? (row as { tool_name: string }).tool_name.trim()
            : typeof (row as { name?: unknown }).name === "string"
              ? (row as { name: string }).name.trim()
              : ""
        return !DISPATCH_ONLY_TOOLS.has(name)
      }
      return true
    })
    return filtered
  }

  for (const key of ["successful_tools", "successful_operations", "completed_tools", "tools"] as const) {
    if (!(key in next)) continue
    const filtered = filterTools(next[key])
    if (Array.isArray(filtered) && filtered.length === 0) {
      delete next[key]
    } else {
      next[key] = filtered
    }
  }
  return next
}

export function formatHumanizedKey(key: string): string {
  return key.replace(/_/g, " ")
}

/** Read persisted `content_json.request_plan` (singular or last of array). */
export function parseRequestPlanFromMessage(contentJson: unknown): AiRequestPlan | null {
  if (!isPlainObject(contentJson)) return null
  const value = contentJson.request_plan
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const plan = normalizeRequestPlan(value[index])
      if (plan) return plan
    }
    return null
  }
  return normalizeRequestPlan(value)
}

export function resultSummaryLabel(plan: AiRequestPlan): string | null {
  if (!plan.resultSummary) return null
  const rows = formatRequestPlanKeyValueRows(plan.resultSummary)
  if (rows.length === 0) return null
  if (rows.length === 1) return `${formatHumanizedKey(rows[0].key)}: ${rows[0].value}`
  return rows.map((row) => `${formatHumanizedKey(row.key)} ${row.value}`).join(" · ")
}
