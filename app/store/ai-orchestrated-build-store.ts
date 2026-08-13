"use client"

import { create } from "zustand"
import type {
  AiOrchestratedBuildEvent,
  AiOrchestratedBuildRecord,
  AiOrchestratedBuildSnapshot,
  AiOrchestratedBuildUnit,
} from "../lib/ai/ai-orchestrated-build-types"
import { isTerminalAiOrchestratedBuildStatus } from "../lib/ai/ai-orchestrated-build-types"
import {
  loadPersistedBuildAfterSequence,
  persistBuildAfterSequence,
} from "../../features/ai-chat/orchestrated-build-sequence-persist"
import {
  shouldKeepOrchestratedBuildAliveAcrossThreads,
  shouldMonitorOrchestratedBuild,
  type OrchestratedBuildMonitorMode,
} from "../../features/ai-chat/orchestrated-build-monitor"

export type AiOrchestratedBuildCardEntry = {
  buildId: string
  threadId: string | null
  title: string | null
  summary: string | null
  /** When true, render artifact +/- preview UI (not the multi-unit shell). */
  isArtifactBuild: boolean
  /**
   * `live` — stream/dispatch: may pump + poll until terminal.
   * `history` — opened from chat history: one status probe, pump only if still active.
   */
  monitor: OrchestratedBuildMonitorMode
  /** True after the first successful orchestrator snapshot (or known start failure). */
  didInitialReconcile: boolean
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
    isArtifactBuild?: boolean
    /** Default `live`. Use `history` when hydrating from persisted chat messages. */
    monitor?: OrchestratedBuildMonitorMode
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
    /**
     * Status-only probe (high after_sequence). Updates build/units but must not
     * rewind or advance the event cursor from an empty event page.
     */
    statusProbe?: boolean
  }) => void
  aliasAssistantMessageId: (fromId: string, toId: string) => void
  setBuildFlags: (
    buildId: string,
    flags: Partial<
      Pick<
        AiOrchestratedBuildCardEntry,
        | "isPolling"
        | "isPumping"
        | "isCancelling"
        | "error"
        | "didInitialPump"
        | "didInitialReconcile"
        | "lastPumpAt"
        | "monitor"
      >
    >,
  ) => void
  markProgress: (buildId: string) => void
  clearBuildsExceptThread: (threadId: string | null) => void
  /** Drop terminal builds from other threads; keep active builds alive across chat switches. */
  clearInactiveBuildsExceptThread: (threadId: string | null) => void
  getBuild: (buildId: string) => AiOrchestratedBuildCardEntry | null
  getActiveBuildIds: (threadId?: string | null) => string[]
}

function createEmptyEntry(args: {
  buildId: string
  threadId?: string | null
  title?: string | null
  summary?: string | null
  changeSetId?: string | null
  monitor?: OrchestratedBuildMonitorMode
  didInitialReconcile?: boolean
  /** Optional initial status — never treat dispatch_started as completed. */
  status?: import("../lib/ai/ai-orchestrated-build-types").AiOrchestratedBuildStatus
}): AiOrchestratedBuildCardEntry {
  const persistedAfter = loadPersistedBuildAfterSequence(args.buildId)
  return {
    buildId: args.buildId,
    threadId: args.threadId ?? null,
    title: args.title ?? null,
    summary: args.summary ?? null,
    isArtifactBuild: false,
    monitor: args.monitor ?? "live",
    didInitialReconcile: Boolean(args.didInitialReconcile),
    // Authoritative progress comes from reconciliation; stub as queued until then.
    build: {
      id: args.buildId,
      status: args.status ?? "queued",
      total_units: 0,
      queued_units: 0,
      running_units: 0,
      succeeded_units: 0,
      failed_units: 0,
      last_event_sequence: persistedAfter,
      change_set_id: args.changeSetId ?? null,
    },
    unitsById: {},
    eventsBySequence: {},
    nextSequence: persistedAfter,
    afterSequence: persistedAfter,
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
    isArtifactBuild,
    monitor,
    startFailed,
    errorCode,
    errorMessage,
  }) => {
    const id = buildId.trim()
    if (!id) return id
    set((state) => {
      const requestedMonitor: OrchestratedBuildMonitorMode = monitor ?? "live"
      const prev =
        state.builds[id]
        ?? createEmptyEntry({
          buildId: id,
          threadId,
          title,
          summary,
          changeSetId,
          monitor: requestedMonitor,
          didInitialReconcile: Boolean(startFailed),
          status: startFailed ? "failed" : "queued",
        })
      const resolvedError =
        (errorMessage?.trim() || null)
        ?? (errorCode?.trim() ? `Build could not start (${errorCode.trim()}).` : null)
        ?? (startFailed ? "The build could not be started." : null)
      // Never downgrade a live monitor to history (stream register wins over hydrate).
      const nextMonitor: OrchestratedBuildMonitorMode =
        prev.monitor === "live" || requestedMonitor === "live" ? "live" : "history"
      const nextStatus =
        startFailed && !isTerminalAiOrchestratedBuildStatus(prev.build?.status)
          ? "failed"
          : (prev.build?.status ?? (startFailed ? "failed" : "queued"))
      const nextChangeSetId = changeSetId ?? prev.build?.change_set_id ?? null
      const nextThreadId = threadId ?? prev.threadId
      const nextTitle = title?.trim() || prev.title
      const nextSummary = summary?.trim() || prev.summary
      const nextIsArtifactBuild = Boolean(isArtifactBuild) || prev.isArtifactBuild
      const nextDidInitialReconcile = prev.didInitialReconcile || Boolean(startFailed)
      const nextError = resolvedError ?? prev.error
      const alreadyLinked =
        !assistantMessageId || Boolean(prev.assistantMessageIds?.[assistantMessageId])
      const unchanged =
        state.builds[id] != null
        && prev.threadId === nextThreadId
        && prev.title === nextTitle
        && prev.summary === nextSummary
        && prev.isArtifactBuild === nextIsArtifactBuild
        && prev.monitor === nextMonitor
        && prev.didInitialReconcile === nextDidInitialReconcile
        && prev.error === nextError
        && (prev.build?.change_set_id ?? null) === nextChangeSetId
        && (prev.build?.status ?? null) === nextStatus
        && alreadyLinked
      if (unchanged) return state

      const next: AiOrchestratedBuildCardEntry = {
        ...prev,
        threadId: nextThreadId,
        title: nextTitle,
        summary: nextSummary,
        isArtifactBuild: nextIsArtifactBuild,
        monitor: nextMonitor,
        didInitialReconcile: nextDidInitialReconcile,
        build: {
          ...(prev.build
            ?? createEmptyEntry({
              buildId: id,
              changeSetId,
              monitor: nextMonitor,
              status: startFailed ? "failed" : "queued",
            }).build!),
          change_set_id: nextChangeSetId,
          status: nextStatus,
        },
        error: nextError,
        assistantMessageIds: { ...prev.assistantMessageIds },
        updatedAt: new Date().toISOString(),
      }
      if (assistantMessageId) next.assistantMessageIds[assistantMessageId] = true
      return { builds: { ...state.builds, [id]: next } }
    })
    return id
  },

  applySnapshot: ({ buildId, snapshot, replaceFromZero, statusProbe }) => {
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

      // Prefer server last_event_sequence when a status probe didn't page events.
      const serverCursor = Math.max(
        0,
        snapshot.build.last_event_sequence ?? 0,
        statusProbe ? 0 : snapshot.next_sequence,
      )
      // Never jump the cursor past events we have not applied. Durable preview
      // floods can make last_event_sequence >> page size; advancing to the job
      // cursor would skip version_saved and leave cards stuck "generating".
      const maxEventSequence = snapshot.events.reduce(
        (max, event) => Math.max(max, Number(event.sequence) || 0),
        0,
      )
      const lastEventSequence = Number(snapshot.build.last_event_sequence) || 0
      const pageLooksTruncated =
        !statusProbe
        && snapshot.events.length > 0
        && maxEventSequence > 0
        && maxEventSequence < lastEventSequence
      const nextAfterSequence = statusProbe
        ? Math.max(prev.afterSequence, serverCursor)
        : pageLooksTruncated
          ? Math.max(prev.afterSequence, maxEventSequence)
          : Math.max(prev.afterSequence, snapshot.next_sequence, maxEventSequence)

      const next: AiOrchestratedBuildCardEntry = {
        ...prev,
        didInitialReconcile: true,
        // History build still running → promote so subsequent polls can pump.
        monitor:
          prev.monitor === "history"
          && !isTerminalAiOrchestratedBuildStatus(snapshot.build.status)
            ? "live"
            : prev.monitor,
        build: {
          ...snapshot.build,
          change_set_id: snapshot.build.change_set_id ?? prev.build?.change_set_id ?? null,
        },
        unitsById,
        eventsBySequence,
        nextSequence: statusProbe
          ? Math.max(prev.nextSequence, serverCursor)
          : snapshot.next_sequence,
        afterSequence: nextAfterSequence,
        lastProgressAt: progressChanged ? Date.now() : prev.lastProgressAt,
        error: null,
        updatedAt: new Date().toISOString(),
      }
      persistBuildAfterSequence(id, next.afterSequence)
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

  clearInactiveBuildsExceptThread: (threadId) => {
    set((state) => {
      const next: Record<string, AiOrchestratedBuildCardEntry> = {}
      for (const [key, entry] of Object.entries(state.builds)) {
        const isCurrentThread = Boolean(threadId) && entry.threadId === threadId
        if (isCurrentThread || shouldKeepOrchestratedBuildAliveAcrossThreads(entry)) {
          next[key] = entry
        }
      }
      return { builds: next }
    })
  },

  getBuild: (buildId) => get().builds[buildId] ?? null,

  getActiveBuildIds: (threadId) =>
    Object.values(get().builds)
      .filter((entry) => {
        if (threadId && entry.threadId && entry.threadId !== threadId) return false
        return shouldMonitorOrchestratedBuild(entry)
      })
      .map((entry) => entry.buildId),
}))

export function listUnitsForBuild(entry: AiOrchestratedBuildCardEntry | null): AiOrchestratedBuildUnit[] {
  if (!entry) return []
  return Object.values(entry.unitsById).sort((a, b) => a.task_id - b.task_id || a.unit_key.localeCompare(b.unit_key))
}
