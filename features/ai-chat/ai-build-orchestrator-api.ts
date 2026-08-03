"use client"

import { getSupabaseBrowser } from "../../lib/supabase-browser"
import { invokeEdgeFunctionFetch } from "../../app/lib/edge-functions"
import type {
  AiOrchestratedBuildEvent,
  AiOrchestratedBuildRecord,
  AiOrchestratedBuildSnapshot,
  AiOrchestratedBuildStatus,
  AiOrchestratedBuildUnit,
  AiOrchestratedBuildUnitStatus,
} from "../../app/lib/ai/ai-orchestrated-build-types"

const ORCHESTRATOR_PATH = "ai-build-orchestrator"

function orchestratorUrl(query?: string): string {
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${ORCHESTRATOR_PATH}`
  return query ? `${base}?${query}` : base
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

const BUILD_STATUSES = new Set<AiOrchestratedBuildStatus>([
  "queued",
  "running",
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
])

const UNIT_STATUSES = new Set<AiOrchestratedBuildUnitStatus>([
  "queued",
  "running",
  "succeeded",
  "partially_succeeded",
  "failed",
  "conflict",
  "cancelled",
])

function parseBuild(raw: unknown): AiOrchestratedBuildRecord | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const id = toTrimmedString(row.id)
  const status = toTrimmedString(row.status) as AiOrchestratedBuildStatus | null
  if (!id || !status || !BUILD_STATUSES.has(status)) return null
  return {
    id,
    status,
    total_units: toFiniteNumber(row.total_units) ?? 0,
    queued_units: toFiniteNumber(row.queued_units) ?? 0,
    running_units: toFiniteNumber(row.running_units) ?? 0,
    succeeded_units: toFiniteNumber(row.succeeded_units) ?? 0,
    failed_units: toFiniteNumber(row.failed_units) ?? 0,
    last_event_sequence: toFiniteNumber(row.last_event_sequence) ?? 0,
    change_set_id: toTrimmedString(row.change_set_id),
  }
}

function parseUnit(raw: unknown): AiOrchestratedBuildUnit | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const id = toTrimmedString(row.id)
  const unitKey = toTrimmedString(row.unit_key)
  const taskId = toFiniteNumber(row.task_id)
  const status = toTrimmedString(row.status) as AiOrchestratedBuildUnitStatus | null
  if (!id || !unitKey || taskId == null || !status || !UNIT_STATUSES.has(status)) return null

  const resultRaw =
    row.result && typeof row.result === "object" ? (row.result as Record<string, unknown>) : {}
  const saved = Array.isArray(resultRaw.saved)
    ? resultRaw.saved
        .map((item) => {
          if (!item || typeof item !== "object") return null
          const record = item as Record<string, unknown>
          const savedTaskId = toFiniteNumber(record.task_id)
          const channelId = toFiniteNumber(record.channel_id)
          const componentId = toTrimmedString(record.component_id)
          const outputId = toTrimmedString(record.output_id)
          if (savedTaskId == null || channelId == null || !componentId || !outputId) return null
          return {
            task_id: savedTaskId,
            channel_id: channelId,
            component_id: componentId,
            output_id: outputId,
            title: toTrimmedString(record.title) ?? "Component",
            snippet: toTrimmedString(record.snippet) ?? "",
          }
        })
        .filter((row): row is NonNullable<typeof row> => row != null)
    : undefined
  const failed = Array.isArray(resultRaw.failed)
    ? resultRaw.failed
        .map((item) => {
          if (!item || typeof item !== "object") return null
          const record = item as Record<string, unknown>
          const error = toTrimmedString(record.error)
          if (!error) return null
          return {
            task_id: toFiniteNumber(record.task_id) ?? undefined,
            channel_id: toFiniteNumber(record.channel_id) ?? undefined,
            component_id: toTrimmedString(record.component_id) ?? undefined,
            title: toTrimmedString(record.title) ?? undefined,
            error,
          }
        })
        .filter((row): row is NonNullable<typeof row> => row != null)
    : undefined

  return {
    id,
    unit_key: unitKey,
    task_id: taskId,
    status,
    attempt: toFiniteNumber(row.attempt) ?? 0,
    result: {
      ...(saved && saved.length > 0 ? { saved } : {}),
      ...(failed && failed.length > 0 ? { failed } : {}),
    },
    error_code: toTrimmedString(row.error_code),
    error_message: toTrimmedString(row.error_message),
  }
}

function parseEvent(raw: unknown): AiOrchestratedBuildEvent | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const sequence = toFiniteNumber(row.sequence)
  const eventType = toTrimmedString(row.event_type)
  const phase = toTrimmedString(row.phase)
  if (sequence == null || !eventType || !phase) return null
  const payload =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {}
  return {
    sequence,
    event_type: eventType,
    phase,
    unit_id: toTrimmedString(row.unit_id),
    payload,
  }
}

/** Strip lease/token reservation fields if a backend payload ever includes them. */
function stripSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitiveFields)
  if (!value || typeof value !== "object") return value
  const next: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (/lease/i.test(key) || /reservation[_-]?id/i.test(key)) continue
    next[key] = stripSensitiveFields(nested)
  }
  return next
}

export function parseAiOrchestratedBuildSnapshot(raw: unknown): AiOrchestratedBuildSnapshot | null {
  if (!raw || typeof raw !== "object") return null
  const row = stripSensitiveFields(raw) as Record<string, unknown>
  if (row.ok !== true) return null
  const build = parseBuild(row.build)
  if (!build) return null
  const units = Array.isArray(row.units)
    ? row.units.map(parseUnit).filter((unit): unit is AiOrchestratedBuildUnit => unit != null)
    : []
  const events = Array.isArray(row.events)
    ? row.events.map(parseEvent).filter((event): event is AiOrchestratedBuildEvent => event != null)
    : []
  return {
    ok: true,
    build,
    units,
    events,
    next_sequence: toFiniteNumber(row.next_sequence) ?? build.last_event_sequence,
  }
}

export async function fetchAiOrchestratedBuildSnapshot(args: {
  buildId: string
  afterSequence?: number
  signal?: AbortSignal
}): Promise<AiOrchestratedBuildSnapshot> {
  const supabase = getSupabaseBrowser()
  const params = new URLSearchParams({ build_id: args.buildId })
  if (typeof args.afterSequence === "number" && Number.isFinite(args.afterSequence)) {
    params.set("after_sequence", String(Math.max(0, Math.trunc(args.afterSequence))))
  }
  const res = await invokeEdgeFunctionFetch({
    supabase,
    url: orchestratorUrl(params.toString()),
    debugLabel: "ai-build-orchestrator-get",
    init: { method: "GET", signal: args.signal },
    headers: { "Content-Type": "application/json" },
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(errText || `Failed to load build ${args.buildId}`)
  }
  const parsed = parseAiOrchestratedBuildSnapshot(await res.json())
  if (!parsed) throw new Error(`Invalid build snapshot for ${args.buildId}`)
  return parsed
}

export type AiOrchestratedBuildBulkRequest = {
  buildId: string
  /** Cursor paging (live poll). Ignored when `tailEvents` is set. */
  afterSequence?: number
  eventLimit?: number
  /** History hydrate: return only the last N events (avoids full replay). */
  tailEvents?: number
}

/**
 * One PostgREST RPC for many builds — used on chat open instead of N edge GETs.
 */
export async function fetchAiOrchestratedBuildSnapshotsBulk(args: {
  requests: AiOrchestratedBuildBulkRequest[]
  defaultEventLimit?: number
}): Promise<Map<string, AiOrchestratedBuildSnapshot>> {
  const requests = args.requests
    .map((row) => {
      const buildId = row.buildId.trim()
      if (!buildId) return null
      const payload: Record<string, unknown> = { build_id: buildId }
      if (typeof row.tailEvents === "number" && Number.isFinite(row.tailEvents)) {
        payload.tail_events = Math.max(1, Math.min(500, Math.trunc(row.tailEvents)))
      } else if (typeof row.afterSequence === "number" && Number.isFinite(row.afterSequence)) {
        payload.after_sequence = Math.max(0, Math.trunc(row.afterSequence))
      }
      if (typeof row.eventLimit === "number" && Number.isFinite(row.eventLimit)) {
        payload.event_limit = Math.max(1, Math.min(500, Math.trunc(row.eventLimit)))
      }
      return payload
    })
    .filter((row): row is Record<string, unknown> => row != null)

  const out = new Map<string, AiOrchestratedBuildSnapshot>()
  if (requests.length === 0) return out

  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.rpc("ai_get_orchestrated_builds_v1", {
    p_requests: requests,
    p_default_event_limit: Math.max(1, Math.min(500, args.defaultEventLimit ?? 80)),
  })
  if (error) throw new Error(error.message || "Failed to load builds in bulk")

  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : null
  const rows = Array.isArray(root?.builds) ? root.builds : []
  for (const row of rows) {
    const parsed = parseAiOrchestratedBuildSnapshot(row)
    if (!parsed) continue
    out.set(parsed.build.id, parsed)
  }
  return out
}

export async function pumpAiOrchestratedBuild(args: {
  buildId: string
  signal?: AbortSignal
}): Promise<AiOrchestratedBuildSnapshot | null> {
  const supabase = getSupabaseBrowser()
  const res = await invokeEdgeFunctionFetch({
    supabase,
    url: orchestratorUrl(),
    debugLabel: "ai-build-orchestrator-pump",
    init: {
      method: "POST",
      signal: args.signal,
      body: JSON.stringify({ build_id: args.buildId, action: "pump" }),
    },
    headers: { "Content-Type": "application/json" },
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(errText || `Failed to pump build ${args.buildId}`)
  }
  const json = await res.json().catch(() => null)
  return parseAiOrchestratedBuildSnapshot(json)
}

export async function cancelAiOrchestratedBuild(args: {
  buildId: string
  reason?: string
  signal?: AbortSignal
}): Promise<AiOrchestratedBuildSnapshot | null> {
  const supabase = getSupabaseBrowser()
  const res = await invokeEdgeFunctionFetch({
    supabase,
    url: orchestratorUrl(),
    debugLabel: "ai-build-orchestrator-cancel",
    init: {
      method: "POST",
      signal: args.signal,
      body: JSON.stringify({
        build_id: args.buildId,
        action: "cancel",
        reason: args.reason ?? "Cancelled from chat",
      }),
    },
    headers: { "Content-Type": "application/json" },
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(errText || `Failed to cancel build ${args.buildId}`)
  }
  const json = await res.json().catch(() => null)
  return parseAiOrchestratedBuildSnapshot(json)
}
