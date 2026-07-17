/**
 * Normalizers + display helpers for the AI component-planning trace stream markers:
 * - `__AI_COMPONENT_LIBRARY_TRACE__` → "Component sources checked" card
 * - `__AI_COMPONENT_PLAN_TRACE__` → "Structure decision" card
 *
 * These render structured decisions and source summaries only — never raw chain-of-thought.
 * Labels intentionally avoid implying the AI used every candidate component.
 */

export type ComponentLibraryTraceSource = {
  source: string
  label: string
  count: number
  sampleTitles: string[]
  usedFor: string | null
}

export type ComponentLibraryTrace = {
  phase: string | null
  ok: boolean | null
  taskId: number | null
  channelId: number | null
  scopeNote: string | null
  sources: ComponentLibraryTraceSource[]
}

export type ComponentPlanTraceAction = {
  action: string
  bucket: string
  source: string | null
  componentTitle: string
  reason: string | null
}

export type ComponentPlanTrace = {
  phase: string | null
  ok: boolean | null
  taskId: number | null
  channelId: number | null
  mode: string | null
  decision: string | null
  actionCounts: Record<string, number>
  actions: ComponentPlanTraceAction[]
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function toBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    const str = toTrimmedString(item)
    if (str) out.push(str)
  }
  return out
}

/** Canonical display labels so "recent" always reads "from this project" regardless of backend copy. */
const LIBRARY_SOURCE_LABELS: Record<string, string> = {
  current_task_channel: "Current task × channel components",
  recent_project_tasks: "Recent components from this project",
  recent_task_components: "Recent components from this project",
  project_library: "Project component library",
  project_component_library: "Project component library",
  system_generic: "Generic system components",
  generic_system: "Generic system components",
}

/** Short human-friendly names for the plan action `source` field. */
const PLAN_SOURCE_LABELS: Record<string, string> = {
  current_task_channel: "current task",
  recent_project_tasks: "recent project tasks",
  recent_task_components: "recent project tasks",
  project_library: "project library",
  project_component_library: "project library",
  system_generic: "system components",
  generic_system: "system components",
}

export function librarySourceDisplayLabel(source: ComponentLibraryTraceSource): string {
  const mapped = LIBRARY_SOURCE_LABELS[source.source]
  if (mapped) return mapped
  return source.label || source.source
}

export function planSourceDisplayLabel(source: string | null): string | null {
  if (!source) return null
  return PLAN_SOURCE_LABELS[source] ?? source.replace(/_/g, " ")
}

function normalizeLibrarySource(raw: unknown): ComponentLibraryTraceSource | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const source = toTrimmedString(row.source) ?? ""
  const label = toTrimmedString(row.label) ?? ""
  if (!source && !label) return null
  return {
    source: source || label,
    label,
    count: toFiniteNumber(row.count) ?? 0,
    sampleTitles: toStringList(row.sample_titles),
    usedFor: toTrimmedString(row.used_for),
  }
}

export function normalizeComponentLibraryTrace(raw: unknown): ComponentLibraryTrace | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  if (row.type != null && row.type !== "component_library_trace") return null
  const sources = Array.isArray(row.sources)
    ? row.sources
        .map((item) => normalizeLibrarySource(item))
        .filter((item): item is ComponentLibraryTraceSource => item != null)
    : []
  if (sources.length === 0) return null
  return {
    phase: toTrimmedString(row.phase),
    ok: toBoolean(row.ok),
    taskId: toFiniteNumber(row.task_id),
    channelId: toFiniteNumber(row.channel_id),
    scopeNote: toTrimmedString(row.scope_note),
    sources,
  }
}

function normalizePlanAction(raw: unknown): ComponentPlanTraceAction | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const componentTitle = toTrimmedString(row.component_title)
  if (!componentTitle) return null
  return {
    action: toTrimmedString(row.action) ?? "",
    bucket: toTrimmedString(row.bucket) ?? "",
    source: toTrimmedString(row.source),
    componentTitle,
    reason: toTrimmedString(row.reason),
  }
}

function normalizeActionCounts(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {}
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const count = toFiniteNumber(value)
    if (count != null) out[key] = count
  }
  return out
}

export function normalizeComponentPlanTrace(raw: unknown): ComponentPlanTrace | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  if (row.type != null && row.type !== "component_plan_trace") return null
  const actions = Array.isArray(row.actions)
    ? row.actions
        .map((item) => normalizePlanAction(item))
        .filter((item): item is ComponentPlanTraceAction => item != null)
    : []
  const actionCounts = normalizeActionCounts(row.action_counts)
  const decision = toTrimmedString(row.decision)
  if (actions.length === 0 && Object.keys(actionCounts).length === 0 && !decision) return null
  return {
    phase: toTrimmedString(row.phase),
    ok: toBoolean(row.ok),
    taskId: toFiniteNumber(row.task_id),
    channelId: toFiniteNumber(row.channel_id),
    mode: toTrimmedString(row.mode),
    decision,
    actionCounts,
    actions,
  }
}

/** Ordered count rows for the plan card summary; only non-zero buckets are surfaced. */
export const PLAN_COUNT_ROWS: Array<{ key: string; label: string }> = [
  { key: "kept_or_selected", label: "Kept/selected" },
  { key: "updated", label: "Updated" },
  { key: "added_existing_component", label: "Added existing" },
  { key: "created_or_adapted_custom", label: "Created/adapted" },
  { key: "excluded_or_unselected", label: "Excluded" },
]

export type PlanActionGroupTone = "added" | "removed" | "neutral"

/** Higher-level groupings for the expanded action list. */
export const PLAN_ACTION_GROUPS: Array<{
  heading: string
  buckets: string[]
  tone: PlanActionGroupTone
}> = [
  { heading: "Kept", buckets: ["kept_or_selected"], tone: "neutral" },
  { heading: "Updated", buckets: ["updated"], tone: "neutral" },
  {
    heading: "Added",
    buckets: ["added_existing_component", "created_or_adapted_custom"],
    tone: "added",
  },
  { heading: "Excluded", buckets: ["excluded_or_unselected"], tone: "removed" },
]

export function groupPlanActions(
  actions: ComponentPlanTraceAction[],
): Array<{ heading: string; tone: PlanActionGroupTone; actions: ComponentPlanTraceAction[] }> {
  const out: Array<{ heading: string; tone: PlanActionGroupTone; actions: ComponentPlanTraceAction[] }> = []
  const assigned = new Set<ComponentPlanTraceAction>()
  for (const group of PLAN_ACTION_GROUPS) {
    const groupActions = actions.filter((action) => group.buckets.includes(action.bucket))
    for (const action of groupActions) assigned.add(action)
    if (groupActions.length > 0) {
      out.push({ heading: group.heading, tone: group.tone, actions: groupActions })
    }
  }
  const leftover = actions.filter((action) => !assigned.has(action))
  if (leftover.length > 0) {
    out.push({ heading: "Other", tone: "neutral", actions: leftover })
  }
  return out
}

/** Reads persisted traces from an assistant message's `content_json` (best-effort, survives reload). */
export function parseComponentTracesFromMessage(contentJson: unknown): {
  libraryTrace: ComponentLibraryTrace | null
  planTrace: ComponentPlanTrace | null
} {
  if (!contentJson || typeof contentJson !== "object") {
    return { libraryTrace: null, planTrace: null }
  }
  const row = contentJson as Record<string, unknown>

  const pickLast = <T,>(value: unknown, normalize: (raw: unknown) => T | null): T | null => {
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        const normalized = normalize(value[index])
        if (normalized) return normalized
      }
      return null
    }
    return normalize(value)
  }

  const libraryTrace =
    pickLast(row.component_library_trace, normalizeComponentLibraryTrace)
    ?? pickLast(row.component_library_traces, normalizeComponentLibraryTrace)
  const planTrace =
    pickLast(row.component_plan_trace, normalizeComponentPlanTrace)
    ?? pickLast(row.component_plan_traces, normalizeComponentPlanTrace)

  return { libraryTrace, planTrace }
}
