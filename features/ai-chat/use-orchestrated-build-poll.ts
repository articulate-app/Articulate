"use client"

import { useEffect, useMemo, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  cancelAiOrchestratedBuild,
  fetchAiOrchestratedBuildSnapshot,
  pumpAiOrchestratedBuild,
} from "./ai-build-orchestrator-api"
import { useAiOrchestratedBuildStore } from "../../app/store/ai-orchestrated-build-store"
import type {
  AiOrchestratedBuildSnapshot,
  AiOrchestratedBuildUnit,
  AiOrchestratedBuildUnitStatus,
} from "../../app/lib/ai/ai-orchestrated-build-types"
import {
  isActiveAiOrchestratedBuildStatus,
  isTerminalAiOrchestratedBuildStatus,
} from "../../app/lib/ai/ai-orchestrated-build-types"
import { invalidateTaskChannelContentQueries } from "./invalidate-task-channel-content"

const TERMINAL_UNIT_STATUSES = new Set<AiOrchestratedBuildUnitStatus>([
  "succeeded",
  "partially_succeeded",
  "failed",
  "conflict",
  "cancelled",
])

function isTerminalUnitStatus(
  status: AiOrchestratedBuildUnitStatus | null | undefined,
): boolean {
  return status != null && TERMINAL_UNIT_STATUSES.has(status)
}

function isComponentsReorderedEventType(eventType: string): boolean {
  const normalized = eventType.trim().toLowerCase()
  return (
    normalized === "components_reordered"
    || normalized === "work_unit.components_reordered"
    || normalized.endsWith(".components_reordered")
  )
}

function channelIdFromUnit(unit: AiOrchestratedBuildUnit): number | null {
  const saved = unit.result.saved?.[0]
  if (saved && typeof saved.channel_id === "number") return saved.channel_id
  const failed = unit.result.failed?.[0]
  if (failed && typeof failed.channel_id === "number") return failed.channel_id
  return null
}

function numericFromPayload(
  payload: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
  }
  return null
}

const FAST_POLL_MS = 2000
const SLOW_POLL_MS = 5000
const BACKOFF_AFTER_MS = 30_000
const STALE_PUMP_AFTER_MS = 30_000

function invalidateContentFromBuildSnapshot(
  queryClient: ReturnType<typeof useQueryClient>,
  snapshot: AiOrchestratedBuildSnapshot,
  previousAfterSequence: number,
  previousUnitsById?: Record<string, AiOrchestratedBuildUnit>,
) {
  const seenInvalidationKeys = new Set<string>()
  const invalidateOnce = (args: {
    taskId?: number | null
    channelId?: number | null
    outputId?: string | null
  }) => {
    if (args.taskId == null) return
    const key = `${args.taskId}:${args.channelId ?? ""}:${args.outputId ?? ""}`
    if (seenInvalidationKeys.has(key)) return
    seenInvalidationKeys.add(key)
    invalidateTaskChannelContentQueries(queryClient, args)
  }

  for (const event of snapshot.events) {
    if (event.sequence <= previousAfterSequence) continue
    const type = event.event_type.toLowerCase()
    const isSaved =
      type === "component.saved" || type === "unit.saved" || type.endsWith(".saved")
    const isReordered = isComponentsReorderedEventType(type)
    if (!isSaved && !isReordered) continue

    const payload = event.payload ?? {}
    const taskId = numericFromPayload(payload, ["task_id", "taskId"])
    const channelId = numericFromPayload(payload, ["channel_id", "channelId"])
    const outputId =
      typeof payload.task_component_output_id === "string"
        ? payload.task_component_output_id
        : typeof payload.output_id === "string"
          ? payload.output_id
          : null
    invalidateOnce({ taskId, channelId, outputId: isReordered ? null : outputId })
  }

  for (const unit of snapshot.units) {
    for (const saved of unit.result.saved ?? []) {
      invalidateOnce({
        taskId: saved.task_id,
        channelId: saved.channel_id,
        outputId: saved.output_id,
      })
    }

    // Refetch after a unit reaches a terminal state so background builds become visible.
    const previousStatus = previousUnitsById?.[unit.id]?.status
    if (isTerminalUnitStatus(unit.status) && previousStatus !== unit.status) {
      invalidateOnce({
        taskId: unit.task_id,
        channelId: channelIdFromUnit(unit),
      })
    }
  }
}

async function reconcileBuild(
  buildId: string,
  options?: {
    fromZero?: boolean
    pumpOnce?: boolean
    queryClient?: ReturnType<typeof useQueryClient>
  },
) {
  const store = useAiOrchestratedBuildStore.getState()
  const entry = store.getBuild(buildId)
  if (!entry) return

  const previousAfterSequence = entry.afterSequence
  const previousUnitsById = entry.unitsById
  store.setBuildFlags(buildId, { isPolling: true, error: null })
  try {
    if (options?.pumpOnce && !entry.didInitialPump) {
      store.setBuildFlags(buildId, { isPumping: true })
      try {
        const pumped = await pumpAiOrchestratedBuild({ buildId })
        if (pumped) {
          store.applySnapshot({ buildId, snapshot: pumped, replaceFromZero: true })
          if (options.queryClient) {
            invalidateContentFromBuildSnapshot(
              options.queryClient,
              pumped,
              0,
              previousUnitsById,
            )
          }
        }
      } finally {
        store.setBuildFlags(buildId, { isPumping: false, didInitialPump: true, lastPumpAt: Date.now() })
      }
    }

    const latest = store.getBuild(buildId)
    const afterSequence = options?.fromZero ? 0 : latest?.afterSequence ?? 0
    const unitsBeforeFetch = latest?.unitsById ?? previousUnitsById
    const snapshot = await fetchAiOrchestratedBuildSnapshot({
      buildId,
      afterSequence,
    })
    store.applySnapshot({
      buildId,
      snapshot,
      replaceFromZero: options?.fromZero === true || afterSequence === 0,
    })
    if (options?.queryClient) {
      invalidateContentFromBuildSnapshot(
        options.queryClient,
        snapshot,
        options.fromZero ? 0 : previousAfterSequence,
        unitsBeforeFetch,
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to refresh build progress"
    store.setBuildFlags(buildId, { error: message })
  } finally {
    store.setBuildFlags(buildId, { isPolling: false })
  }
}

async function maybeStalePump(buildId: string) {
  const store = useAiOrchestratedBuildStore.getState()
  const entry = store.getBuild(buildId)
  if (!entry?.build) return
  if (!isActiveAiOrchestratedBuildStatus(entry.build.status)) return
  if (entry.build.queued_units <= 0) return
  if (entry.isPumping || entry.isCancelling) return
  const idleMs = Date.now() - entry.lastProgressAt
  if (idleMs < STALE_PUMP_AFTER_MS) return
  if (entry.lastPumpAt != null && Date.now() - entry.lastPumpAt < STALE_PUMP_AFTER_MS) return

  store.setBuildFlags(buildId, { isPumping: true })
  try {
    const pumped = await pumpAiOrchestratedBuild({ buildId })
    if (pumped) store.applySnapshot({ buildId, snapshot: pumped })
  } catch {
    /* keep polling */
  } finally {
    store.setBuildFlags(buildId, { isPumping: false, lastPumpAt: Date.now() })
  }
}

/**
 * Polls active orchestrated builds for the current thread.
 * - Fast (2s) while units change; backs off to 5s after 30s idle.
 * - Pauses when the document is hidden; reconciles immediately on visible.
 * - On register/reload: fetch from sequence 0 once + one pump for lease recovery.
 */
export function useOrchestratedBuildPoll(threadId: string | null) {
  const queryClient = useQueryClient()
  const builds = useAiOrchestratedBuildStore((state) => state.builds)
  const activeBuildIdsKey = useMemo(() => {
    if (!threadId) return ""
    return Object.values(builds)
      .filter((entry) => entry.threadId === threadId)
      .filter((entry) => !isTerminalAiOrchestratedBuildStatus(entry.build?.status ?? null))
      .map((entry) => entry.buildId)
      .sort()
      .join("|")
  }, [builds, threadId])

  const timersRef = useRef<Record<string, number>>({})
  const bootstrappedRef = useRef<Record<string, true>>({})

  useEffect(() => {
    if (!threadId || !activeBuildIdsKey) {
      for (const timer of Object.values(timersRef.current)) window.clearTimeout(timer)
      timersRef.current = {}
      return
    }

    const activeIds = activeBuildIdsKey.split("|").filter(Boolean)

    const schedule = (buildId: string) => {
      if (timersRef.current[buildId]) window.clearTimeout(timersRef.current[buildId])
      const entry = useAiOrchestratedBuildStore.getState().getBuild(buildId)
      if (!entry || isTerminalAiOrchestratedBuildStatus(entry.build?.status ?? null)) return

      const idleMs = Date.now() - entry.lastProgressAt
      const delay = idleMs >= BACKOFF_AFTER_MS ? SLOW_POLL_MS : FAST_POLL_MS
      timersRef.current[buildId] = window.setTimeout(() => {
        void (async () => {
          if (typeof document !== "undefined" && document.visibilityState === "hidden") {
            schedule(buildId)
            return
          }
          await maybeStalePump(buildId)
          await reconcileBuild(buildId, { queryClient })
          schedule(buildId)
        })()
      }, delay)
    }

    for (const buildId of activeIds) {
      if (!bootstrappedRef.current[buildId]) {
        bootstrappedRef.current[buildId] = true
        void reconcileBuild(buildId, { fromZero: true, pumpOnce: true, queryClient }).then(() =>
          schedule(buildId),
        )
      } else if (!timersRef.current[buildId]) {
        schedule(buildId)
      }
    }

    // Drop timers for builds that left the active set.
    for (const buildId of Object.keys(timersRef.current)) {
      if (!activeIds.includes(buildId)) {
        window.clearTimeout(timersRef.current[buildId])
        delete timersRef.current[buildId]
      }
    }

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return
      for (const buildId of activeIds) {
        void reconcileBuild(buildId, { queryClient }).then(() => schedule(buildId))
      }
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [activeBuildIdsKey, queryClient, threadId])

  useEffect(() => {
    return () => {
      for (const timer of Object.values(timersRef.current)) window.clearTimeout(timer)
      timersRef.current = {}
    }
  }, [])
}

export async function retryDispatchOrchestratedBuild(buildId: string): Promise<void> {
  const store = useAiOrchestratedBuildStore.getState()
  store.setBuildFlags(buildId, { isPumping: true, error: null })
  try {
    const pumped = await pumpAiOrchestratedBuild({ buildId })
    if (pumped) store.applySnapshot({ buildId, snapshot: pumped })
    const snapshot = await fetchAiOrchestratedBuildSnapshot({
      buildId,
      afterSequence: store.getBuild(buildId)?.afterSequence ?? 0,
    })
    store.applySnapshot({ buildId, snapshot })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retry dispatch"
    store.setBuildFlags(buildId, { error: message })
  } finally {
    store.setBuildFlags(buildId, { isPumping: false, lastPumpAt: Date.now(), didInitialPump: true })
  }
}

export async function cancelOrchestratedBuild(buildId: string): Promise<void> {
  const store = useAiOrchestratedBuildStore.getState()
  store.setBuildFlags(buildId, { isCancelling: true, error: null })
  try {
    const cancelled = await cancelAiOrchestratedBuild({ buildId })
    if (cancelled) {
      store.applySnapshot({ buildId, snapshot: cancelled })
      return
    }
    const snapshot = await fetchAiOrchestratedBuildSnapshot({ buildId, afterSequence: 0 })
    store.applySnapshot({ buildId, snapshot, replaceFromZero: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cancel build"
    store.setBuildFlags(buildId, { error: message })
  } finally {
    store.setBuildFlags(buildId, { isCancelling: false })
  }
}
