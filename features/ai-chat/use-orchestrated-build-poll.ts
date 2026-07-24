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
import {
  parseBuildComponentPreviewPayload,
  useAiBuildComponentPreviewStore,
} from "../../app/store/ai-build-component-preview-store"
import {
  isArtifactBuildEventType,
  isArtifactCardContentEventType,
  parseBuildArtifactPreviewPayload,
  useAiBuildArtifactPreviewStore,
} from "../../app/store/ai-build-artifact-preview-store"
import { loadPersistedBuildAfterSequence } from "./orchestrated-build-sequence-persist"
import { logArtifactBuildLegacyComponentRegression } from "./artifact-build-legacy-guard"
import { useAiRequestPlanStore } from "../../app/store/ai-request-plan-store"
import { ARTIFACT_BUILD_EXECUTOR } from "../../app/lib/ai/ai-orchestrated-build-types"

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

function isPreviewEventType(eventType: string): boolean {
  const normalized = eventType.trim().toLowerCase()
  return (
    normalized === "preview"
    || normalized === "work_unit.preview"
    || normalized.endsWith(".preview")
  )
}

function isComponentSavedEventType(eventType: string): boolean {
  const normalized = eventType.trim().toLowerCase()
  return (
    normalized === "component.saved"
    || normalized === "work_unit.component_saved"
    || normalized === "unit.saved"
    || (normalized.endsWith(".saved") && !normalized.includes("website_index"))
  )
}

/**
 * Apply live `work_unit.preview` / `component.saved` into the non-persisted preview store.
 * Never writes into the canonical task-component output cache.
 *
 * Artifact builds continue after the originating chat stream closes — merge by
 * build_id + unit_id + artifact_id from durable `artifact.*` events.
 * Decision events (`plan_ready`, `started`, `context_loaded`, `structure_decided`)
 * feed the execution timeline only — not live artifact cards.
 */
function applyBuildPreviewEventsFromSnapshot(
  buildId: string,
  snapshot: AiOrchestratedBuildSnapshot,
  previousAfterSequence: number,
  entry: {
    threadId: string | null
    assistantMessageIds: Record<string, true>
  },
) {
  const previewStore = useAiBuildComponentPreviewStore.getState()
  const artifactPreviewStore = useAiBuildArtifactPreviewStore.getState()
  const assistantMessageId = Object.keys(entry.assistantMessageIds)[0] ?? null
  const planExecutor = assistantMessageId
    ? useAiRequestPlanStore.getState().getBucket(assistantMessageId)?.plan.executor ?? null
    : null

  for (const event of snapshot.events) {
    if (event.sequence <= previousAfterSequence) continue
    const type = event.event_type.toLowerCase()
    const payload = (event.payload ?? {}) as Record<string, unknown>
    const unitId =
      (typeof event.unit_id === "string" && event.unit_id.trim())
      || (typeof payload.unit_id === "string" && payload.unit_id.trim())
      || "unit"

    logArtifactBuildLegacyComponentRegression({
      buildId,
      eventType: event.event_type,
      sequence: event.sequence,
      executor: planExecutor,
      unitId,
    })

    if (isArtifactBuildEventType(type)) {
      // Timeline decision events are mapped by the execution-trace store — skip card upsert.
      if (!isArtifactCardContentEventType(type)) continue
      const artifactParsed = parseBuildArtifactPreviewPayload(payload)
      if (artifactParsed.artifactId) {
        artifactPreviewStore.upsertFromEvent({
          buildId,
          unitId,
          artifactId: artifactParsed.artifactId,
          sequence: event.sequence,
          eventType: type,
          taskId: artifactParsed.taskId,
          aiThreadId: artifactParsed.aiThreadId ?? entry.threadId,
          channelId: artifactParsed.channelId,
          languageId: artifactParsed.languageId,
          channelName: artifactParsed.channelName,
          languageName: artifactParsed.languageName,
          artifactType: artifactParsed.artifactType,
          artifactRole: artifactParsed.artifactRole,
          title: artifactParsed.title,
          contentText: artifactParsed.contentText,
          contentJson: artifactParsed.contentJson,
          assetData: artifactParsed.assetData,
          currentVersion: artifactParsed.currentVersion,
          errorMessage: artifactParsed.errorMessage,
          mediaItem: artifactParsed.mediaItem,
          threadId: entry.threadId,
          assistantMessageId,
        })
      }
      continue
    }

    const parsed = parseBuildComponentPreviewPayload(payload)

    // Artifact-first builds must not surface legacy component preview cards.
    if (planExecutor === ARTIFACT_BUILD_EXECUTOR) continue

    if (isPreviewEventType(type) && parsed.componentId) {
      previewStore.upsertPreview({
        buildId,
        unitId,
        componentId: parsed.componentId,
        sequence: event.sequence,
        taskId: parsed.taskId,
        channelId: parsed.channelId,
        title: parsed.title,
        position: parsed.position,
        contentText: parsed.contentText,
        contentJson: parsed.contentJson,
        threadId: entry.threadId,
        assistantMessageId,
      })
      continue
    }

    if (isComponentSavedEventType(type) && parsed.componentId) {
      previewStore.markSaved({
        buildId,
        unitId: typeof event.unit_id === "string" ? event.unit_id : unitId,
        componentId: parsed.componentId,
        sequence: event.sequence,
        title: parsed.title,
        contentText: parsed.contentText,
        contentJson: parsed.contentJson,
      })
    }
  }
}

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
    const isArtifactSaved =
      type.includes("artifact.version_saved") || type === "artifact.saved"
    if (isArtifactSaved) {
      void queryClient.invalidateQueries({ queryKey: ["task-artifacts"] })
      void queryClient.invalidateQueries({ queryKey: ["ai-thread-artifacts"] })
    }
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
          store.applySnapshot({
            buildId,
            snapshot: pumped,
            replaceFromZero: previousAfterSequence <= 0,
          })
          applyBuildPreviewEventsFromSnapshot(buildId, pumped, previousAfterSequence, entry)
          if (options?.queryClient) {
            invalidateContentFromBuildSnapshot(
              options.queryClient,
              pumped,
              previousAfterSequence,
              previousUnitsById,
            )
          }
        }
      } finally {
        store.setBuildFlags(buildId, { isPumping: false, didInitialPump: true, lastPumpAt: Date.now() })
      }
    }

    const latest = store.getBuild(buildId)
    // Resume from persisted/in-memory cursor unless we explicitly need a cold start.
    const afterSequence =
      options?.fromZero && (latest?.afterSequence ?? 0) <= 0
        ? 0
        : latest?.afterSequence ?? loadPersistedBuildAfterSequence(buildId)
    const unitsBeforeFetch = latest?.unitsById ?? previousUnitsById
    const snapshot = await fetchAiOrchestratedBuildSnapshot({
      buildId,
      afterSequence,
    })
    const cursorBeforeApply = latest?.afterSequence ?? previousAfterSequence
    store.applySnapshot({
      buildId,
      snapshot,
      replaceFromZero: afterSequence === 0,
    })
    applyBuildPreviewEventsFromSnapshot(
      buildId,
      snapshot,
      cursorBeforeApply,
      latest ?? entry,
    )
    if (options?.queryClient) {
      invalidateContentFromBuildSnapshot(
        options.queryClient,
        snapshot,
        cursorBeforeApply,
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
 * Polls active orchestrated builds across all threads.
 * Build monitoring stays alive when the user opens another chat.
 * - Fast (2s) while units change; backs off to 5s after 30s idle.
 * - Pauses when the document is hidden; reconciles immediately on visible.
 * - On register/reload: fetch from sequence 0 once + one pump for lease recovery.
 * - Stops at terminal status: completed / partially_completed / failed / cancelled.
 */
export function useOrchestratedBuildPoll(_threadId?: string | null) {
  const queryClient = useQueryClient()
  const builds = useAiOrchestratedBuildStore((state) => state.builds)
  const activeBuildIdsKey = useMemo(() => {
    return Object.values(builds)
      .filter((entry) => !isTerminalAiOrchestratedBuildStatus(entry.build?.status ?? null))
      .map((entry) => entry.buildId)
      .sort()
      .join("|")
  }, [builds])

  const timersRef = useRef<Record<string, number>>({})
  const bootstrappedRef = useRef<Record<string, true>>({})

  useEffect(() => {
    if (!activeBuildIdsKey) {
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
        // Resume from persisted after_sequence when present; avoid replaying events.
        const persisted = loadPersistedBuildAfterSequence(buildId)
        const entry = useAiOrchestratedBuildStore.getState().getBuild(buildId)
        const fromZero = (entry?.afterSequence ?? persisted) <= 0
        void reconcileBuild(buildId, { fromZero, pumpOnce: true, queryClient }).then(() =>
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
  }, [activeBuildIdsKey, queryClient])

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
