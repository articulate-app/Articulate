"use client"

import { useEffect, useMemo, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  cancelAiOrchestratedBuild,
  fetchAiOrchestratedBuildSnapshot,
  fetchAiOrchestratedBuildSnapshotsBulk,
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
import { isArchivedArtifactStatus } from "../../app/lib/artifacts/artifact-types"
import { getArtifact } from "../../app/lib/services/artifacts"
import { loadPersistedBuildAfterSequence } from "./orchestrated-build-sequence-persist"
import { logArtifactBuildLegacyComponentRegression } from "./artifact-build-legacy-guard"
import { useAiRequestPlanStore } from "../../app/store/ai-request-plan-store"
import { ARTIFACT_BUILD_EXECUTOR } from "../../app/lib/ai/ai-orchestrated-build-types"
import {
  ORCHESTRATED_BUILD_STATUS_PROBE_AFTER_SEQUENCE,
  shouldMonitorOrchestratedBuild,
  shouldPumpOrchestratedBuild,
} from "./orchestrated-build-monitor"
import {
  ARTIFACT_VERSION_PARAM,
  CENTER_ARTIFACT_ID_PARAM,
} from "../../app/lib/artifact-selection-url"
import { shallowReplaceSearchParams } from "../../app/lib/tasks-shallow-nav"
import { applyArtifactCachePatch } from "../artifacts/artifact-query-cache"

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
/** Event tail size for history hydrate (status + preview cards in one RPC). */
const HISTORY_HYDRATE_TAIL_EVENTS = 120
/** Wait for ChatWindow to finish registering history builds before one bulk RPC. */
const HISTORY_HYDRATE_COALESCE_MS = 200
/** Matches SQL `limit 40` on `ai_get_orchestrated_builds_v1`. */
const HISTORY_HYDRATE_BULK_CHUNK = 40
/** Coalesce artifact-list invalidations so history open does not refetch N times. */
const ARTIFACT_LIST_INVALIDATE_MS = 450

let artifactListInvalidateTimer: number | null = null
let artifactListInvalidateClient: ReturnType<typeof useQueryClient> | null = null

function scheduleArtifactListInvalidation(
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  artifactListInvalidateClient = queryClient
  if (typeof window === "undefined") {
    void queryClient.invalidateQueries({ queryKey: ["task-artifacts"] })
    void queryClient.invalidateQueries({ queryKey: ["ai-thread-artifacts"] })
    void queryClient.invalidateQueries({ queryKey: ["project-artifacts"] })
    return
  }
  if (artifactListInvalidateTimer != null) {
    window.clearTimeout(artifactListInvalidateTimer)
  }
  artifactListInvalidateTimer = window.setTimeout(() => {
    artifactListInvalidateTimer = null
    const client = artifactListInvalidateClient
    if (!client) return
    void client.invalidateQueries({ queryKey: ["task-artifacts"] })
    void client.invalidateQueries({ queryKey: ["ai-thread-artifacts"] })
    void client.invalidateQueries({ queryKey: ["project-artifacts"] })
  }, ARTIFACT_LIST_INVALIDATE_MS) as unknown as number
}

type HistoryHydrateWaiter = {
  resolve: (ok: boolean) => void
}

const pendingHistoryHydrateIds = new Set<string>()
const historyHydrateWaiters = new Map<string, HistoryHydrateWaiter[]>()
/** Builds that already received a history tail this session (avoid N card rehydrates). */
const historyTailFetchedIds = new Set<string>()
let historyHydrateTimer: number | null = null
let historyHydrateInFlight: Promise<void> | null = null
let historyHydrateQueryClient: ReturnType<typeof useQueryClient> | undefined
let historyHydrateOnReadyToPoll: ((buildId: string) => void) | null = null

function addHistoryHydrateWaiter(buildId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const list = historyHydrateWaiters.get(buildId) ?? []
    list.push({ resolve })
    historyHydrateWaiters.set(buildId, list)
  })
}

function resolveHistoryHydrateWaiters(buildId: string, ok: boolean) {
  const list = historyHydrateWaiters.get(buildId)
  if (!list?.length) return
  historyHydrateWaiters.delete(buildId)
  for (const waiter of list) waiter.resolve(ok)
}

/**
 * Coalesce chat-open + per-card rehydrate into a single bulk RPC.
 * Builds are registered one-by-one from messages; without debounce we'd fire N calls.
 */
function enqueueHistoryHydrateBulk(args: {
  buildIds: string[]
  queryClient?: ReturnType<typeof useQueryClient>
  onReadyToPoll?: (buildId: string) => void
}): void {
  if (args.queryClient) historyHydrateQueryClient = args.queryClient
  if (args.onReadyToPoll) historyHydrateOnReadyToPoll = args.onReadyToPoll
  for (const raw of args.buildIds) {
    const buildId = raw.trim()
    if (!buildId) continue
    pendingHistoryHydrateIds.add(buildId)
  }
  if (historyHydrateTimer != null) window.clearTimeout(historyHydrateTimer)
  historyHydrateTimer = window.setTimeout(() => {
    historyHydrateTimer = null
    void flushHistoryHydrateBulk()
  }, HISTORY_HYDRATE_COALESCE_MS) as unknown as number
}

async function flushHistoryHydrateBulk(): Promise<void> {
  if (historyHydrateInFlight) {
    await historyHydrateInFlight
    if (pendingHistoryHydrateIds.size > 0) {
      await flushHistoryHydrateBulk()
    }
    return
  }

  const buildIds = Array.from(pendingHistoryHydrateIds)
  pendingHistoryHydrateIds.clear()
  if (buildIds.length === 0) return

  const queryClient = historyHydrateQueryClient
  const onReadyToPoll = historyHydrateOnReadyToPoll
  historyHydrateInFlight = bootstrapHistoryBuildsBulk({
    buildIds,
    queryClient,
    onReadyToPoll: onReadyToPoll ?? undefined,
  })
    .catch(() => undefined)
    .finally(() => {
      historyHydrateInFlight = null
    })
  await historyHydrateInFlight

  if (pendingHistoryHydrateIds.size > 0) {
    await flushHistoryHydrateBulk()
  }
}

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

    // Isolates often die (OOM) before emitting artifact.failed — map unit/build
    // failure onto any in-flight artifact preview cards so the spinner clears.
    if (
      type === "work_unit.failed"
      || type === "build.failed"
      || type === "unit.failed"
      || type.endsWith(".unit_failed")
    ) {
      const errorMessage =
        (typeof payload.error === "string" && payload.error.trim())
        || (typeof payload.error_message === "string" && payload.error_message.trim())
        || (typeof payload.message === "string" && payload.message.trim())
        || (typeof payload.reason === "string" && payload.reason.trim())
        || "The update could not be applied."
      const matchUnit = type === "build.failed" ? null : unitId
      const liveArtifactPreviews = useAiBuildArtifactPreviewStore.getState()
      for (const row of Object.values(liveArtifactPreviews.previews)) {
        if (row.buildId !== buildId) continue
        if (matchUnit && row.unitId !== matchUnit) continue
        if (row.phase === "saved" || row.phase === "failed") continue
        liveArtifactPreviews.upsertFromEvent({
          buildId,
          unitId: row.unitId,
          artifactId: row.artifactId,
          sequence: event.sequence,
          eventType: "artifact.failed",
          errorMessage,
          streaming: false,
          streamChars: null,
          clearDiffContentText: false,
          threadId: entry.threadId,
          assistantMessageId,
        })
      }
      continue
    }

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
          projectId: artifactParsed.projectId,
          aiThreadId: artifactParsed.aiThreadId ?? entry.threadId,
          channelId: artifactParsed.channelId,
          languageId: artifactParsed.languageId,
          channelName: artifactParsed.channelName,
          languageName: artifactParsed.languageName,
          artifactType: artifactParsed.artifactType,
          artifactRole: artifactParsed.artifactRole,
          title: artifactParsed.title,
          contentText: artifactParsed.contentText,
          beforeContentText: artifactParsed.beforeContentText,
          beforeContentJson: artifactParsed.beforeContentJson,
          diffContentText: artifactParsed.diffContentText,
          contentJson: artifactParsed.contentJson,
          assetData: artifactParsed.assetData,
          currentVersion: artifactParsed.currentVersion,
          errorMessage: artifactParsed.errorMessage,
          mediaItem: artifactParsed.mediaItem,
          streaming: artifactParsed.streaming,
          streamChars: artifactParsed.streamChars,
          streamSnippet: artifactParsed.streamSnippet,
          targetSectionHeading: artifactParsed.targetSectionHeading,
          sectionHtml: artifactParsed.sectionHtml,
          sectionBeforeHtml: artifactParsed.sectionBeforeHtml,
          clearDiffContentText: artifactParsed.clearDiffContentText,
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
      const payload = (event.payload ?? {}) as Record<string, unknown>
      const artifactId =
        typeof payload.artifact_id === "string"
          ? payload.artifact_id
          : typeof payload.artifactId === "string"
            ? payload.artifactId
            : null
      scheduleArtifactListInvalidation(queryClient)
      if (artifactId) {
        void getArtifact({ artifactId })
          .then((result) => {
            if (!result?.snapshot) return
            if (isArchivedArtifactStatus(result.snapshot.status)) {
              applyArtifactCachePatch(queryClient, result.snapshot)
              return
            }
            if (useAiBuildArtifactPreviewStore.getState().isArtifactSuppressed(artifactId)) {
              return
            }
            applyArtifactCachePatch(queryClient, result.snapshot)
          })
          .catch(() => undefined)
        void queryClient.invalidateQueries({ queryKey: ["artifact", artifactId] })
        void queryClient.invalidateQueries({ queryKey: ["artifact-versions", artifactId] })
        // Drop pinned historic version so the open pane reloads the just-saved current.
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search)
          if (
            params.get(CENTER_ARTIFACT_ID_PARAM) === artifactId
            && params.has(ARTIFACT_VERSION_PARAM)
          ) {
            params.delete(ARTIFACT_VERSION_PARAM)
            shallowReplaceSearchParams(
              window.location.pathname,
              params,
              "artifact-ai-saved-clear-version",
            )
          }
        }
      } else {
        void queryClient.invalidateQueries({ queryKey: ["artifact"] })
        void queryClient.invalidateQueries({ queryKey: ["artifact-versions"] })
      }
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
    /** History open: fetch status/units without replaying the full event log. */
    statusProbe?: boolean
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
    const wantPump = Boolean(options?.pumpOnce) && shouldPumpOrchestratedBuild(entry)
    if (wantPump) {
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
    const statusProbe = Boolean(options?.statusProbe) && !(latest?.didInitialReconcile)
    // Resume from persisted/in-memory cursor unless we explicitly need a cold start
    // or a cheap history status probe.
    const afterSequence = statusProbe
      ? ORCHESTRATED_BUILD_STATUS_PROBE_AFTER_SEQUENCE
      : options?.fromZero && (latest?.afterSequence ?? 0) <= 0
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
      replaceFromZero: !statusProbe && afterSequence === 0,
      statusProbe,
    })
    if (!statusProbe) {
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
      // If the build already finished but a preview flood skipped version_saved /
      // artifact.failed (OOM kills), clear the eternal "generating" spinner.
      if (isTerminalAiOrchestratedBuildStatus(snapshot.build.status)) {
        const buildFailed =
          snapshot.build.status === "failed" || snapshot.build.status === "cancelled"
        const busy = Object.values(useAiBuildArtifactPreviewStore.getState().previews).some(
          (row) =>
            row.buildId === buildId
            && row.phase !== "saved"
            && row.phase !== "failed",
        )
        if (busy) {
          const unitError =
            snapshot.units.find((unit) => unit.status === "failed" || unit.status === "cancelled")
              ?.error_message
            ?? null
          useAiBuildArtifactPreviewStore.getState().forceTerminalForBuild(
            buildId,
            buildFailed ? "failed" : "saved",
            buildFailed ? (unitError ?? "The update could not be applied.") : null,
          )
          if (options?.queryClient) {
            options.queryClient.invalidateQueries({ queryKey: ["artifact"] })
            options.queryClient.invalidateQueries({ queryKey: ["artifacts"] })
          }
        }
      }
    } else {
      store.setBuildFlags(buildId, { didInitialReconcile: true })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to refresh build progress"
    // Still mark reconcile attempted so history stubs do not retry forever on hard errors.
    store.setBuildFlags(buildId, {
      error: message,
      didInitialReconcile: true,
    })
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
 * Polls orchestrated builds that still need monitoring.
 * - History hydrate: one status-probe GET (no pump); rehydrate cards via short tail.
 * - Live / still-active: pump once + poll until terminal.
 * - Fast (2s) while units change; backs off to 5s after 30s idle.
 * - Pauses when the document is hidden; reconciles immediately on visible.
 */
export function useOrchestratedBuildPoll(_threadId?: string | null) {
  const queryClient = useQueryClient()
  const builds = useAiOrchestratedBuildStore((state) => state.builds)
  const activeBuildIdsKey = useMemo(() => {
    return Object.values(builds)
      .filter((entry) => shouldMonitorOrchestratedBuild(entry))
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
      if (!entry || !shouldMonitorOrchestratedBuild(entry)) return

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
          if (shouldMonitorOrchestratedBuild(
            useAiOrchestratedBuildStore.getState().getBuild(buildId) ?? entry,
          )) {
            schedule(buildId)
          }
        })()
      }, delay)
    }

    const pendingHistoryIds: string[] = []
    const pendingLiveIds: string[] = []

    for (const buildId of activeIds) {
      if (bootstrappedRef.current[buildId]) {
        if (!timersRef.current[buildId]) schedule(buildId)
        continue
      }
      const entry = useAiOrchestratedBuildStore.getState().getBuild(buildId)
      if (!entry) continue
      const isHistoryBootstrap = entry.monitor === "history" && !entry.didInitialReconcile
      if (isHistoryBootstrap) pendingHistoryIds.push(buildId)
      else pendingLiveIds.push(buildId)
    }

    // Chat open: coalesce registrations into one bulk RPC (messages register one-by-one).
    if (pendingHistoryIds.length > 0) {
      for (const buildId of pendingHistoryIds) bootstrappedRef.current[buildId] = true
      enqueueHistoryHydrateBulk({
        buildIds: pendingHistoryIds,
        queryClient,
        onReadyToPoll: (buildId) => schedule(buildId),
      })
    }

    for (const buildId of pendingLiveIds) {
      bootstrappedRef.current[buildId] = true
      const persisted = loadPersistedBuildAfterSequence(buildId)
      const entry = useAiOrchestratedBuildStore.getState().getBuild(buildId)
      if (!entry) continue
      const fromZero = (entry.afterSequence ?? persisted) <= 0
      void reconcileBuild(buildId, {
        fromZero,
        pumpOnce: true,
        queryClient,
      }).then(() => {
        const latest = useAiOrchestratedBuildStore.getState().getBuild(buildId)
        if (latest && shouldMonitorOrchestratedBuild(latest)) schedule(buildId)
      })
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
        const entry = useAiOrchestratedBuildStore.getState().getBuild(buildId)
        if (!entry || !shouldMonitorOrchestratedBuild(entry)) continue
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

function buildHasRenderableArtifactCard(buildId: string): boolean {
  return Object.values(useAiBuildArtifactPreviewStore.getState().previews).some(
    (row) =>
      row.buildId === buildId
      && (
        row.phase === "started"
        || row.phase === "preview"
        || row.phase === "saved"
        || row.phase === "media"
        || row.phase === "failed"
      ),
  )
}

function settleTerminalArtifactPreviewCards(buildId: string): void {
  const id = buildId.trim()
  if (!id) return
  const store = useAiOrchestratedBuildStore.getState()
  const entry = store.getBuild(id)
  const status = entry?.build?.status
  if (!status || !isTerminalAiOrchestratedBuildStatus(status)) return
  const buildFailed = status === "failed" || status === "cancelled"
  const busy = Object.values(useAiBuildArtifactPreviewStore.getState().previews).some(
    (row) =>
      row.buildId === id
      && row.phase !== "saved"
      && row.phase !== "failed",
  )
  if (!busy) return
  const units = Object.values(entry?.unitsById ?? {})
  const unitError =
    units.find((unit) => unit.status === "failed" || unit.status === "cancelled")
      ?.error_message
    ?? null
  useAiBuildArtifactPreviewStore.getState().forceTerminalForBuild(
    id,
    buildFailed ? "failed" : "saved",
    buildFailed ? (unitError ?? "The update could not be applied.") : null,
  )
}

/**
 * Hydrate many history builds via chunked PostgREST bulk RPCs.
 * Avoids N× ai-build-orchestrator GETs (`after_sequence=1e9`) on chat open.
 */
async function bootstrapHistoryBuildsBulk(args: {
  buildIds: string[]
  queryClient?: ReturnType<typeof useQueryClient>
  onReadyToPoll?: (buildId: string) => void
}): Promise<void> {
  const buildIds = [...new Set(args.buildIds.map((id) => id.trim()).filter(Boolean))]
  if (buildIds.length === 0) return
  const store = useAiOrchestratedBuildStore.getState()

  const fetchIds = buildIds.filter((buildId) => {
    if (historyTailFetchedIds.has(buildId) && buildHasRenderableArtifactCard(buildId)) {
      settleTerminalArtifactPreviewCards(buildId)
      resolveHistoryHydrateWaiters(buildId, true)
      const latest = store.getBuild(buildId)
      if (latest && shouldMonitorOrchestratedBuild(latest)) args.onReadyToPoll?.(buildId)
      return false
    }
    return true
  })
  if (fetchIds.length === 0) return

  for (const buildId of fetchIds) {
    store.setBuildFlags(buildId, { isPolling: true, error: null })
  }

  const settleMissingHistoryBuild = (buildId: string) => {
    historyTailFetchedIds.add(buildId)
    // Mark reconciled without an edge probe. Flip stub "queued" → completed so
    // shouldMonitorOrchestratedBuild stops continuous polling.
    const prev = store.getBuild(buildId)
    if (prev?.build && (prev.build.status === "queued" || prev.build.status === "running")) {
      useAiOrchestratedBuildStore.setState((state) => {
        const entry = state.builds[buildId]
        if (!entry?.build) return state
        return {
          builds: {
            ...state.builds,
            [buildId]: {
              ...entry,
              isPolling: false,
              didInitialReconcile: true,
              build: { ...entry.build, status: "completed" },
              updatedAt: new Date().toISOString(),
            },
          },
        }
      })
    } else {
      store.setBuildFlags(buildId, { isPolling: false, didInitialReconcile: true })
    }
    settleTerminalArtifactPreviewCards(buildId)
    resolveHistoryHydrateWaiters(buildId, buildHasRenderableArtifactCard(buildId))
  }

  try {
    const snapshots = new Map<string, AiOrchestratedBuildSnapshot>()
    const missingFromBulk: string[] = []

    for (let offset = 0; offset < fetchIds.length; offset += HISTORY_HYDRATE_BULK_CHUNK) {
      const chunk = fetchIds.slice(offset, offset + HISTORY_HYDRATE_BULK_CHUNK)
      try {
        const part = await fetchAiOrchestratedBuildSnapshotsBulk({
          requests: chunk.map((buildId) => ({
            buildId,
            tailEvents: HISTORY_HYDRATE_TAIL_EVENTS,
          })),
          defaultEventLimit: HISTORY_HYDRATE_TAIL_EVENTS,
        })
        for (const buildId of chunk) {
          const snapshot = part.get(buildId)
          if (snapshot) snapshots.set(buildId, snapshot)
          else missingFromBulk.push(buildId)
        }
      } catch (error) {
        // Do NOT fall back to N× status-probe edge GETs — that is the storm on long threads.
        console.warn("history bulk hydrate chunk failed", {
          chunkSize: chunk.length,
          error: error instanceof Error ? error.message : String(error),
        })
        for (const buildId of chunk) missingFromBulk.push(buildId)
      }
    }

    for (const buildId of fetchIds) {
      const entry = store.getBuild(buildId)
      if (!entry) {
        resolveHistoryHydrateWaiters(buildId, false)
        continue
      }
      const snapshot = snapshots.get(buildId)
      historyTailFetchedIds.add(buildId)
      if (!snapshot) {
        settleMissingHistoryBuild(buildId)
        continue
      }

      store.applySnapshot({
        buildId,
        snapshot,
        replaceFromZero: false,
      })
      applyBuildPreviewEventsFromSnapshot(buildId, snapshot, -1, entry)
      // History open must NOT invalidate project/task artifact lists — that caused
      // 10+ identical ai_list_project_artifacts_v1 refetches with full content.
      settleTerminalArtifactPreviewCards(buildId)
      resolveHistoryHydrateWaiters(buildId, buildHasRenderableArtifactCard(buildId))

      let latest = store.getBuild(buildId) ?? entry
      if (
        shouldMonitorOrchestratedBuild(latest)
        && shouldPumpOrchestratedBuild(latest)
      ) {
        await reconcileBuild(buildId, { pumpOnce: true, queryClient: args.queryClient })
        latest = store.getBuild(buildId) ?? latest
      }
      store.setBuildFlags(buildId, { isPolling: false, didInitialReconcile: true })
      if (shouldMonitorOrchestratedBuild(latest)) args.onReadyToPoll?.(buildId)
    }

  } finally {
    for (const buildId of fetchIds) {
      const entry = store.getBuild(buildId)
      if (entry?.isPolling) {
        store.setBuildFlags(buildId, { isPolling: false, didInitialReconcile: true })
      }
      // Ensure waiters never hang if a path forgot to resolve.
      resolveHistoryHydrateWaiters(buildId, buildHasRenderableArtifactCard(buildId))
    }
  }
}

/**
 * Rebuild in-memory artifact preview cards from durable events (e.g. after refresh).
 * Same idea as hydrating component-edit previews from messages: cards must remain
 * visible after remount so the user can still see what changed (+/-).
 *
 * Poll cursors are persisted in localStorage and intentionally skip replay — so on
 * remount we must force-load terminal card events even when afterSequence is high.
 * Prefer a short tail fetch to avoid replaying dozens of streaming preview payloads.
 */
export async function rehydrateArtifactPreviewCards(buildId: string): Promise<boolean> {
  const id = buildId.trim()
  if (!id) return false
  const store = useAiOrchestratedBuildStore.getState()
  const entry = store.getBuild(id)
  if (!entry) return false

  // Cards already in memory still need a terminal settle after failed builds
  // (streaming previews leave phase "preview" with no artifact.failed).
  if (buildHasRenderableArtifactCard(id)) {
    settleTerminalArtifactPreviewCards(id)
    return true
  }

  // Already fetched a history tail this session — don't issue another RPC per card.
  if (historyTailFetchedIds.has(id)) {
    settleTerminalArtifactPreviewCards(id)
    return buildHasRenderableArtifactCard(id)
  }

  // Join the coalesced bulk hydrate (same path as chat-open bootstrap).
  const wait = addHistoryHydrateWaiter(id)
  enqueueHistoryHydrateBulk({ buildIds: [id] })
  const ok = await wait
  if (ok) {
    store.registerBuild({ buildId: id, isArtifactBuild: true, monitor: entry.monitor })
  }
  if (buildHasRenderableArtifactCard(id)) return true
  return seedArtifactPreviewCardsFromUnits(id)
}

function artifactIdFromUnitKey(unitKey: string | null | undefined): string | null {
  const match = String(unitKey ?? "").match(/^artifact:([0-9a-f-]{36})$/i)
  return match?.[1] ?? null
}

/** Last-resort card restore when history events did not replay a preview payload. */
async function seedArtifactPreviewCardsFromUnits(buildId: string): Promise<boolean> {
  const entry = useAiOrchestratedBuildStore.getState().getBuild(buildId)
  if (!entry) return false
  const previewStore = useAiBuildArtifactPreviewStore.getState()
  let seeded = false
  for (const unit of Object.values(entry.unitsById)) {
    const artifactId = artifactIdFromUnitKey(unit.unit_key)
    if (!artifactId) continue
    if (previewStore.isArtifactSuppressed(artifactId)) continue
    try {
      const result = await getArtifact({ artifactId })
      const snapshot = result.snapshot
      if (!snapshot || isArchivedArtifactStatus(snapshot.status)) continue
      previewStore.upsertFromEvent({
        buildId,
        unitId: unit.id,
        artifactId,
        sequence: Math.max(entry.afterSequence, 1),
        eventType: "artifact.version_saved",
        taskId: snapshot.task_id,
        projectId: snapshot.project_id,
        aiThreadId: snapshot.ai_thread_id,
        channelId: snapshot.channel_id,
        languageId: snapshot.language_id,
        title: snapshot.title,
        contentText: snapshot.content_text,
        contentJson: snapshot.content_json,
        assetData: snapshot.asset_data,
        currentVersion: snapshot.current_version,
      })
      seeded = true
    } catch {
      // Keep going — other units may still restore.
    }
  }
  return seeded || buildHasRenderableArtifactCard(buildId)
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
