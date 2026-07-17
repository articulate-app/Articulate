import type { AiOrchestratedBuildEvent } from "../../app/lib/ai/ai-orchestrated-build-types"

/** Structured decision audit from durable work-unit events — not model chain-of-thought. */
export type WorkUnitAuditCurrentComponent = {
  title: string
  hasContent: boolean | null
  componentId: string | null
}

export type WorkUnitAuditReusableGroup = {
  label: string
  count: number | null
  titles: string[]
}

export type WorkUnitAuditDecision = {
  title: string
  source: string | null
  outcome: string | null
  reason: string | null
}

export type WorkUnitAuditFinalItem = {
  action: string
  title: string
  componentId: string | null
  position: number | null
}

export type WorkUnitAuditRequiredComponent = {
  title: string
  source: string | null
  position: number | null
  provenance: string | null
}

export type WorkUnitAuditPersistedOrderItem = {
  title: string | null
  componentId: string | null
  position: number | null
}

export type WorkUnitAuditRepair = {
  validationIssues: string[]
  succeeded: boolean | null
  remainingIssues: string[]
}

export type WorkUnitComponentAudit = {
  unitId: string
  discoveryStarted: boolean
  discoveryOrder: string[]
  currentComponents: WorkUnitAuditCurrentComponent[]
  reusableGroups: WorkUnitAuditReusableGroup[]
  requiredComponents: WorkUnitAuditRequiredComponent[]
  decisions: WorkUnitAuditDecision[]
  finalStructure: WorkUnitAuditFinalItem[]
  persistedOrder: WorkUnitAuditPersistedOrderItem[]
  repair: WorkUnitAuditRepair | null
  hasAnyTrace: boolean
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

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseIssueList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const single = toTrimmedString(value)
    return single ? [single] : []
  }
  const out: string[] = []
  for (const row of value) {
    if (typeof row === "string" && row.trim()) {
      out.push(row.trim())
      continue
    }
    const record = asRecord(row)
    if (!record) continue
    const message =
      toTrimmedString(record.message)
      ?? toTrimmedString(record.issue)
      ?? toTrimmedString(record.error)
      ?? toTrimmedString(record.reason)
    if (message) out.push(message)
  }
  return out
}

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((row) => toTrimmedString(row))
    .filter((row): row is string => Boolean(row))
}

function firstNonEmptyList<T>(...candidates: T[][]): T[] {
  for (const candidate of candidates) {
    if (candidate.length > 0) return candidate
  }
  return []
}

function parseCurrentComponents(value: unknown): WorkUnitAuditCurrentComponent[] {
  if (!Array.isArray(value)) return []
  const out: WorkUnitAuditCurrentComponent[] = []
  for (const row of value) {
    const record = asRecord(row)
    if (!record) continue
    const title =
      toTrimmedString(record.title)
      ?? toTrimmedString(record.component_title)
      ?? toTrimmedString(record.name)
    if (!title) continue
    const hasContent =
      toBoolean(record.has_content)
      ?? toBoolean(record.hasContent)
      ?? (typeof record.content_present === "boolean" ? record.content_present : null)
    out.push({
      title,
      hasContent,
      componentId:
        toTrimmedString(record.component_id)
        ?? toTrimmedString(record.componentId)
        ?? null,
    })
  }
  return out
}

function parseReusableGroups(value: unknown): WorkUnitAuditReusableGroup[] {
  if (!Array.isArray(value)) return []
  const out: WorkUnitAuditReusableGroup[] = []
  for (const row of value) {
    const record = asRecord(row)
    if (!record) continue
    const label =
      toTrimmedString(record.label)
      ?? toTrimmedString(record.title)
      ?? toTrimmedString(record.source)
      ?? toTrimmedString(record.group)
      ?? "Reusable group"
    const titles = firstNonEmptyList(
      parseStringList(record.titles),
      parseStringList(record.sample_titles),
      parseStringList(record.sampleTitles),
    )
    const count =
      toFiniteNumber(record.count)
      ?? (titles.length > 0 ? titles.length : null)
    out.push({ label, count, titles })
  }
  return out
}

function parseDecisions(value: unknown): WorkUnitAuditDecision[] {
  if (!Array.isArray(value)) return []
  const out: WorkUnitAuditDecision[] = []
  for (const row of value) {
    const record = asRecord(row)
    if (!record) continue
    const title =
      toTrimmedString(record.title)
      ?? toTrimmedString(record.candidate_title)
      ?? toTrimmedString(record.component_title)
      ?? toTrimmedString(record.name)
    if (!title) continue
    out.push({
      title,
      source: toTrimmedString(record.source),
      outcome: toTrimmedString(record.outcome) ?? toTrimmedString(record.decision),
      reason: toTrimmedString(record.reason) ?? toTrimmedString(record.rationale),
    })
  }
  return out
}

function parseFinalStructure(value: unknown): WorkUnitAuditFinalItem[] {
  if (!Array.isArray(value)) return []
  const out: WorkUnitAuditFinalItem[] = []
  for (const row of value) {
    const record = asRecord(row)
    if (!record) continue
    const title =
      toTrimmedString(record.title)
      ?? toTrimmedString(record.component_title)
      ?? toTrimmedString(record.name)
    const action =
      toTrimmedString(record.action)
      ?? toTrimmedString(record.operation)
      ?? "use"
    if (!title) continue
    out.push({
      action,
      title,
      componentId:
        toTrimmedString(record.component_id)
        ?? toTrimmedString(record.componentId)
        ?? null,
      position:
        toFiniteNumber(record.position)
        ?? toFiniteNumber(record.requested_position)
        ?? toFiniteNumber(record.requestedPosition),
    })
  }
  return out
}

function parseRequiredComponents(value: unknown): WorkUnitAuditRequiredComponent[] {
  if (!Array.isArray(value)) return []
  const out: WorkUnitAuditRequiredComponent[] = []
  for (const row of value) {
    const record = asRecord(row)
    if (!record) continue
    const title =
      toTrimmedString(record.title)
      ?? toTrimmedString(record.component_title)
      ?? toTrimmedString(record.name)
    if (!title) continue
    out.push({
      title,
      source: toTrimmedString(record.source),
      position: toFiniteNumber(record.position),
      provenance:
        toTrimmedString(record.provenance)
        ?? toTrimmedString(record.policy_source)
        ?? toTrimmedString(record.policySource),
    })
  }
  return out
}

function parsePersistedOrder(value: unknown): WorkUnitAuditPersistedOrderItem[] {
  if (!Array.isArray(value)) return []
  const out: WorkUnitAuditPersistedOrderItem[] = []
  for (const row of value) {
    const record = asRecord(row)
    if (!record) continue
    const title =
      toTrimmedString(record.title)
      ?? toTrimmedString(record.component_title)
      ?? toTrimmedString(record.name)
    const componentId =
      toTrimmedString(record.component_id)
      ?? toTrimmedString(record.componentId)
      ?? toTrimmedString(record.task_component_id)
    const position = toFiniteNumber(record.position)
    if (!title && !componentId && position == null) continue
    out.push({ title, componentId, position })
  }
  return out.sort((a, b) => {
    if (a.position == null && b.position == null) {
      return String(a.componentId ?? a.title ?? "").localeCompare(
        String(b.componentId ?? b.title ?? ""),
      )
    }
    if (a.position == null) return 1
    if (b.position == null) return -1
    return a.position - b.position
  })
}

function emptyAudit(unitId: string): WorkUnitComponentAudit {
  return {
    unitId,
    discoveryStarted: false,
    discoveryOrder: [],
    currentComponents: [],
    reusableGroups: [],
    requiredComponents: [],
    decisions: [],
    finalStructure: [],
    persistedOrder: [],
    repair: null,
    hasAnyTrace: false,
  }
}

function normalizeEventType(eventType: string): string {
  return eventType.trim().toLowerCase()
}

function isEventType(eventType: string, suffix: string): boolean {
  const normalized = normalizeEventType(eventType)
  return (
    normalized === suffix
    || normalized === `work_unit.${suffix}`
    || normalized.endsWith(`.${suffix}`)
  )
}

/**
 * Reduce sequenced `ai_build_events` for one work unit into a structured audit trail.
 * Duplicate sequences are ignored by the caller’s sequence map; this reducer is last-write-wins
 * per section when later events refine earlier snapshots.
 */
export function reduceWorkUnitComponentAudit(
  unitId: string,
  eventsBySequence: Record<number, AiOrchestratedBuildEvent>,
): WorkUnitComponentAudit {
  const events = Object.values(eventsBySequence)
    .filter((event) => (event.unit_id ?? null) === unitId)
    .sort((a, b) => a.sequence - b.sequence)

  const audit = emptyAudit(unitId)
  let repair: WorkUnitAuditRepair | null = null

  for (const event of events) {
    const payload = asRecord(event.payload) ?? {}
    const eventType = typeof event.event_type === "string" ? event.event_type : ""

    if (isEventType(eventType, "discovery_started")) {
      audit.discoveryStarted = true
      audit.hasAnyTrace = true
      continue
    }

    if (isEventType(eventType, "discovery_snapshot")) {
      const order = firstNonEmptyList(
        parseStringList(payload.discovery_order),
        parseStringList(payload.sources_checked),
        parseStringList(payload.order),
      )
      if (order.length > 0) audit.discoveryOrder = order

      const current = firstNonEmptyList(
        parseCurrentComponents(payload.current_components),
        parseCurrentComponents(payload.currentComponents),
        parseCurrentComponents(payload.components),
      )
      if (current.length > 0) audit.currentComponents = current

      const groups = firstNonEmptyList(
        parseReusableGroups(payload.reusable_groups),
        parseReusableGroups(payload.reusableGroups),
        parseReusableGroups(payload.groups),
      )
      if (groups.length > 0) audit.reusableGroups = groups

      const required = firstNonEmptyList(
        parseRequiredComponents(payload.required_components),
        parseRequiredComponents(payload.requiredComponents),
      )
      if (required.length > 0) audit.requiredComponents = required

      audit.hasAnyTrace = true
      continue
    }

    if (isEventType(eventType, "component_decisions")) {
      const decisions = firstNonEmptyList(
        parseDecisions(payload.decisions),
        parseDecisions(payload.component_decisions),
        parseDecisions(payload.candidates),
      )
      if (decisions.length > 0) audit.decisions = decisions

      const finalStructure = firstNonEmptyList(
        parseFinalStructure(payload.final_structure),
        parseFinalStructure(payload.finalStructure),
        parseFinalStructure(payload.structure),
      )
      if (finalStructure.length > 0) audit.finalStructure = finalStructure

      audit.hasAnyTrace = true
      continue
    }

    if (isEventType(eventType, "components_reordered")) {
      const persistedOrder = firstNonEmptyList(
        parsePersistedOrder(payload.order),
        parsePersistedOrder(payload.components),
        parsePersistedOrder(payload.persisted_order),
        parsePersistedOrder(payload.persistedOrder),
      )
      if (persistedOrder.length > 0) audit.persistedOrder = persistedOrder
      audit.hasAnyTrace = true
      continue
    }

    if (isEventType(eventType, "repair_started")) {
      repair = {
        validationIssues: firstNonEmptyList(
          parseIssueList(payload.validation_issues),
          parseIssueList(payload.issues),
          parseIssueList(payload.errors),
        ),
        succeeded: null,
        remainingIssues: [],
      }
      audit.hasAnyTrace = true
      continue
    }

    if (isEventType(eventType, "repair_finished")) {
      const base: {
        validationIssues: string[]
        succeeded: boolean | null
        remainingIssues: string[]
      } = repair ?? {
        validationIssues: parseIssueList(payload.validation_issues),
        succeeded: null,
        remainingIssues: [],
      }
      repair = {
        validationIssues: firstNonEmptyList(
          base.validationIssues,
          parseIssueList(payload.validation_issues),
          parseIssueList(payload.issues),
        ),
        succeeded:
          toBoolean(payload.succeeded)
          ?? toBoolean(payload.ok)
          ?? toBoolean(payload.repair_succeeded),
        remainingIssues: firstNonEmptyList(
          parseIssueList(payload.remaining_issues),
          parseIssueList(payload.remainingIssues),
          parseIssueList(payload.unresolved_issues),
        ),
      }
      audit.hasAnyTrace = true
    }
  }

  audit.repair = repair
  return audit
}

/** Events keyed by sequence → audits keyed by unit_id (idempotent). */
export function reduceBuildComponentAudits(
  eventsBySequence: Record<number, AiOrchestratedBuildEvent>,
): Record<string, WorkUnitComponentAudit> {
  const unitIds = new Set<string>()
  for (const event of Object.values(eventsBySequence)) {
    const unitId = toTrimmedString(event.unit_id)
    if (unitId) unitIds.add(unitId)
  }
  const out: Record<string, WorkUnitComponentAudit> = {}
  for (const unitId of unitIds) {
    const audit = reduceWorkUnitComponentAudit(unitId, eventsBySequence)
    if (audit.hasAnyTrace) out[unitId] = audit
  }
  return out
}
