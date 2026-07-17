"use client"

import { create } from "zustand"
import type {
  AiOrchestratedBuildEvent,
  AiOrchestratedBuildRecord,
  AiOrchestratedBuildSnapshot,
  AiOrchestratedBuildUnit,
} from "../lib/ai/ai-orchestrated-build-types"
import { isTerminalAiOrchestratedBuildStatus } from "../lib/ai/ai-orchestrated-build-types"

export type AiOrchestratedBuildCardEntry = {
  buildId: string
  threadId: string | null
  title: string | null
  summary: string | null
  build: AiOrchestratedBuildRecord | null
  unitsById: Record<string, AiOrchestratedBuildUnit>
  eventsBySequence: Record<number, AiOrchestratedBuildEvent>
  nextSequence: number
  /** Highest sequence processed from events/reconcile. */
  afterSequence: number
  lastProgressAt: number
  lastPumpAt: number | null
  didInitialPump: boolean
  isPolling: boolean
  isPumping: boolean
  isCancelling: boolean
  error: string | null
  assistantMessageIds: Record<string, true>
  updatedAt: string
}

type AiOrchestratedBuildStoreState = {
  builds: Record<string, AiOrchestratedBuildCardEntry>
  registerBuild: (args: {
    buildId: string
    threadId?: string | null
    assistantMessageId?: string | null
    title?: string | null
    summary?: string | null
    changeSetId?: string | null
    /** Tool/start failure — do not leave the card in a permanent "Started" state. */
    startFailed?: boolean
    errorCode?: string | null
    errorMessage?: string | null
  }) => string
  applySnapshot: (args: {
    buildId: string
    snapshot: AiOrchestratedBuildSnapshot
    /** When true, treat this as a full replace from sequence 0. */
    replaceFromZero?: boolean
  }) => void
  aliasAssistantMessageId: (fromId: string, toId: string) => void
  setBuildFlags: (
    buildId: string,
    flags: Partial<
      Pick<
        AiOrchestratedBuildCardEntry,
        "isPolling" | "isPumping" | "isCancelling" | "error" | "didInitialPump" | "lastPumpAt"
      >
    >,
  ) => void
  markProgress: (buildId: string) => void
  clearBuildsExceptThread: (threadId: string | null) => void
  getBuild: (buildId: string) => AiOrchestratedBuildCardEntry | null
  getActiveBuildIds: (threadId?: string | null) => string[]
}

function createEmptyEntry(args: {
  buildId: string
  threadId?: string | null
  title?: string | null
  summary?: string | null
  changeSetId?: string | null
  /** Optional initial status — never treat dispatch_started as completed. */
  status?: import("../lib/ai/ai-orchestrated-build-types").AiOrchestratedBuildStatus
}): AiOrchestratedBuildCardEntry {
  return {
    buildId: args.buildId,
    threadId: args.threadId ?? null,
    title: args.title ?? null,
    summary: args.summary ?? null,
    // Authoritative progress comes from reconciliation; stub as queued until then.
    build: {
      id: args.buildId,
      status: args.status ?? "queued",
      total_units: 0,
      queued_units: 0,
      running_units: 0,
      succeeded_units: 0,
      failed_units: 0,
      last_event_sequence: 0,
      change_set_id: args.changeSetId ?? null,
    },
    unitsById: {},
    eventsBySequence: {},
    nextSequence: 0,
    afterSequence: 0,
    lastProgressAt: Date.now(),
    lastPumpAt: null,
    didInitialPump: false,
    isPolling: false,
    isPumping: false,
    isCancelling: false,
    error: null,
    assistantMessageIds: {},
    updatedAt: new Date().toISOString(),
  }
}

function mergeUnits(
  prev: Record<string, AiOrchestratedBuildUnit>,
  incoming: AiOrchestratedBuildUnit[],
): Record<string, AiOrchestratedBuildUnit> {
  const next = { ...prev }
  for (const unit of incoming) {
    next[unit.id] = unit
  }
  return next
}

function mergeEvents(
  prev: Record<number, AiOrchestratedBuildEvent>,
  incoming: AiOrchestratedBuildEvent[],
): Record<number, AiOrchestratedBuildEvent> {
  const next = { ...prev }
  for (const event of incoming) {
    next[event.sequence] = event
  }
  return next
}

export const useAiOrchestratedBuildStore = create<AiOrchestratedBuildStoreState>((set, get) => ({
  builds: {},

  registerBuild: ({
    buildId,
    threadId,
    assistantMessageId,
    title,
    summary,
    changeSetId,
    startFailed,
    errorCode,
    errorMessage,
  }) => {
    const id = buildId.trim()
    if (!id) return id
    set((state) => {
      const prev =
        state.builds[id]
        ?? createEmptyEntry({
          buildId: id,
          threadId,
          title,
          summary,
          changeSetId,
          status: startFailed ? "failed" : "queued",
        })
      const resolvedError =
        (errorMessage?.trim() || null)
        ?? (errorCode?.trim() ? `Build could not start (${errorCode.trim()}).` : null)
        ?? (startFailed ? "The build could not be started." : null)
      const next: AiOrchestratedBuildCardEntry = {
        ...prev,
        threadId: threadId ?? prev.threadId,
        title: title?.trim() || prev.title,
        summary: summary?.trim() || prev.summary,
        build: {
          ...(prev.build
            ?? createEmptyEntry({ buildId: id, changeSetId, status: startFailed ? "failed" : "queued" }).build!),
          change_set_id: changeSetId ?? prev.build?.change_set_id ?? null,
          status:
            startFailed && !isTerminalAiOrchestratedBuildStatus(prev.build?.status)
              ? "failed"
              : (prev.build?.status ?? (startFailed ? "failed" : "queued")),
        },
        error: resolvedError ?? prev.error,
        assistantMessageIds: { ...prev.assistantMessageIds },
        updatedAt: new Date().toISOString(),
      }
      if (assistantMessageId) next.assistantMessageIds[assistantMessageId] = true
      return { builds: { ...state.builds, [id]: next } }
    })
    return id
  },

  applySnapshot: ({ buildId, snapshot, replaceFromZero }) => {
    const id = buildId.trim()
    if (!id || !snapshot.ok) return
    set((state) => {
      const prev = state.builds[id] ?? createEmptyEntry({ buildId: id })
      const unitsById = replaceFromZero
        ? mergeUnits({}, snapshot.units)
        : mergeUnits(prev.unitsById, snapshot.units)
      const eventsBySequence = replaceFromZero
        ? mergeEvents({}, snapshot.events)
        : mergeEvents(prev.eventsBySequence, snapshot.events)
      const progressChanged =
        prev.build?.status !== snapshot.build.status
        || prev.build?.succeeded_units !== snapshot.build.succeeded_units
        || prev.build?.failed_units !== snapshot.build.failed_units
        || prev.build?.running_units !== snapshot.build.running_units
        || prev.build?.queued_units !== snapshot.build.queued_units
        || Object.keys(unitsById).length !== Object.keys(prev.unitsById).length
        || snapshot.events.length > 0

      const next: AiOrchestratedBuildCardEntry = {
        ...prev,
        build: {
          ...snapshot.build,
          change_set_id: snapshot.build.change_set_id ?? prev.build?.change_set_id ?? null,
        },
        unitsById,
        eventsBySequence,
        nextSequence: snapshot.next_sequence,
        afterSequence: Math.max(prev.afterSequence, snapshot.next_sequence),
        lastProgressAt: progressChanged ? Date.now() : prev.lastProgressAt,
        error: null,
        updatedAt: new Date().toISOString(),
      }
      return { builds: { ...state.builds, [id]: next } }
    })
  },

  aliasAssistantMessageId: (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return
    set((state) => {
      let changed = false
      const builds: Record<string, AiOrchestratedBuildCardEntry> = {}
      for (const [key, entry] of Object.entries(state.builds)) {
        if (!entry.assistantMessageIds[fromId]) {
          builds[key] = entry
          continue
        }
        changed = true
        const assistantMessageIds = { ...entry.assistantMessageIds }
        delete assistantMessageIds[fromId]
        assistantMessageIds[toId] = true
        builds[key] = { ...entry, assistantMessageIds, updatedAt: new Date().toISOString() }
      }
      return changed ? { builds } : state
    })
  },

  setBuildFlags: (buildId, flags) => {
    set((state) => {
      const prev = state.builds[buildId]
      if (!prev) return state
      return {
        builds: {
          ...state.builds,
          [buildId]: {
            ...prev,
            ...flags,
            updatedAt: new Date().toISOString(),
          },
        },
      }
    })
  },

  markProgress: (buildId) => {
    set((state) => {
      const prev = state.builds[buildId]
      if (!prev) return state
      return {
        builds: {
          ...state.builds,
          [buildId]: { ...prev, lastProgressAt: Date.now(), updatedAt: new Date().toISOString() },
        },
      }
    })
  },

  clearBuildsExceptThread: (threadId) => {
    set((state) => {
      if (!threadId) return { builds: {} }
      const next: Record<string, AiOrchestratedBuildCardEntry> = {}
      for (const [key, entry] of Object.entries(state.builds)) {
        if (entry.threadId === threadId) next[key] = entry
      }
      return { builds: next }
    })
  },

  getBuild: (buildId) => get().builds[buildId] ?? null,

  getActiveBuildIds: (threadId) =>
    Object.values(get().builds)
      .filter((entry) => {
        if (threadId && entry.threadId && entry.threadId !== threadId) return false
        return !isTerminalAiOrchestratedBuildStatus(entry.build?.status ?? null)
      })
      .map((entry) => entry.buildId),
}))

export function listUnitsForBuild(entry: AiOrchestratedBuildCardEntry | null): AiOrchestratedBuildUnit[] {
  if (!entry) return []
  return Object.values(entry.unitsById).sort((a, b) => a.task_id - b.task_id || a.unit_key.localeCompare(b.unit_key))
}
