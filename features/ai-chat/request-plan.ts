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

/** Normalized public request plan (stream + persisted snapshot). */
export type AiRequestPlan = {
  planId: string
  planVersion: number | null
  operation: string | null
  executor: string | null
  status: RequestPlanStatus
  phase: string | null
  requestText: string | null
  mutationTargets: Record<string, unknown>
  contextRefs: Record<string, unknown>
  targetReferences: unknown[]
  arguments: Record<string, unknown>
  missingInputs: RequestPlanMissingInput[]
  resolvedInputs: Record<string, unknown>
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
  executing: "Applying changes",
  completed: "Completed",
  partially_completed: "Partially completed",
  failed: "Failed",
  cancelled: "Cancelled",
  expired: "Expired",
}

const OPERATION_LABELS: Record<string, string> = {
  edit_component: "Edit component",
  format_components: "Format components",
  create_component: "Create component",
  reorder_task_channel_components: "Reorder components",
  update_task_fields: "Update task fields",
  update_project_fields: "Update project fields",
  manage_users_watchers: "Manage users & watchers",
  build_task_content: "Build task content",
  other_mutation: "Apply changes",
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

  const status =
    toTrimmedString(raw.status)
    ?? toTrimmedString(options?.phase)
    ?? "planning"

  return {
    planId,
    planVersion: toFiniteNumber(raw.plan_version),
    operation: toTrimmedString(raw.operation),
    executor: toTrimmedString(raw.executor),
    status,
    phase: toTrimmedString(options?.phase) ?? toTrimmedString(raw.status),
    requestText: toTrimmedString(raw.request_text),
    mutationTargets: normalizeRecord(raw.mutation_targets),
    contextRefs: normalizeRecord(raw.context_refs),
    targetReferences: Array.isArray(raw.target_references) ? [...raw.target_references] : [],
    arguments: normalizeRecord(raw.arguments),
    missingInputs: Array.isArray(raw.missing_inputs)
      ? raw.missing_inputs
          .map((item) => normalizeMissingInput(item))
          .filter((item): item is RequestPlanMissingInput => item != null)
      : [],
    resolvedInputs: normalizeRecord(raw.resolved_inputs),
    decisionAudit: normalizeDecisionAudit(raw.decision_audit),
    resultSummary: normalizeNullableRecord(raw.result_summary),
    verification: normalizeNullableRecord(raw.verification),
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
  if (!previous || previous.planId !== incoming.planId) return incoming
  return {
    ...previous,
    ...incoming,
    planId: incoming.planId,
    // Keep a useful phase even if a later partial payload omits it.
    phase: incoming.phase ?? previous.phase,
    status: incoming.status || previous.status,
  }
}

export function requestPlanStatusLabel(status: string | null | undefined): string {
  if (!status) return "Resolving request"
  return REQUEST_PLAN_STATUS_LABELS[status] ?? status.replace(/_/g, " ")
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
  const rows: Array<{ key: string; value: string }> = []
  for (const [key, value] of Object.entries(record)) {
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
