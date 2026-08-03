import type { AiOrchestratedBuildStatus } from "../../app/lib/ai/ai-orchestrated-build-types"
import {
  isActiveAiOrchestratedBuildStatus,
  isTerminalAiOrchestratedBuildStatus,
} from "../../app/lib/ai/ai-orchestrated-build-types"

export type OrchestratedBuildMonitorMode = "live" | "history"

type MonitorEntry = {
  monitor: OrchestratedBuildMonitorMode
  didInitialReconcile: boolean
  didInitialPump?: boolean
  build: { status: AiOrchestratedBuildStatus | null } | null
}

/**
 * History opens use a high cursor so the first GET returns build/units
 * metadata with few (or no) events — avoiding a full event replay.
 * Card rehydrate then fetches a short tail when needed.
 */
export const ORCHESTRATED_BUILD_STATUS_PROBE_AFTER_SEQUENCE = 1_000_000_000

/** Whether the poller should keep this build in its active set. */
export function shouldMonitorOrchestratedBuild(entry: MonitorEntry): boolean {
  const status = entry.build?.status ?? null
  if (entry.monitor === "history") {
    // One status probe, then stop unless the build is still running.
    if (!entry.didInitialReconcile) return true
    return isActiveAiOrchestratedBuildStatus(status)
  }
  return !isTerminalAiOrchestratedBuildStatus(status)
}

/** Cross-thread keep-alive: only builds known to still be running. */
export function shouldKeepOrchestratedBuildAliveAcrossThreads(
  entry: Pick<MonitorEntry, "didInitialReconcile" | "build">,
): boolean {
  if (!entry.didInitialReconcile) return false
  return isActiveAiOrchestratedBuildStatus(entry.build?.status ?? null)
}

export function shouldPumpOrchestratedBuild(entry: MonitorEntry): boolean {
  if (entry.didInitialPump) return false
  if (entry.monitor === "live") return true
  // History: pump only after a status probe proves the build is still active.
  return (
    entry.didInitialReconcile
    && isActiveAiOrchestratedBuildStatus(entry.build?.status ?? null)
  )
}
