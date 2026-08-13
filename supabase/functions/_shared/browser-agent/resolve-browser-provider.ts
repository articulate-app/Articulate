/**
 * Central browser provider resolution for interactive + scheduled publishing.
 * Local bridge is preferred for interactive work; Cloud for unattended / explicit cloud.
 */

import type { BrowserAgentProviderName, BrowserExecutionMode } from "./types.ts"

export type BrowserProviderOperation =
  | "immediate_publication"
  | "interactive_browser"
  | "connect_destination"
  | "native_schedule"
  | "unattended_scheduled_execution"
  | "external_schedule_cancel"

export type LocalBridgeStatusInput = {
  /** Client probed GET /health on the loopback bridge. */
  available?: boolean | null
  /** Bridge reported Chrome/Chromium resolvable. */
  chromeAvailable?: boolean | null
  version?: string | null
  /** Explicit override from advanced UI / debug. */
  forceCloud?: boolean | null
  forceLocal?: boolean | null
}

export type ResolveBrowserProviderInput = {
  operation: BrowserProviderOperation
  executionMode?: BrowserExecutionMode | string | null
  localBridge?: LocalBridgeStatusInput | null
  /** Explicit provider name wins when valid. */
  preferredProvider?: BrowserAgentProviderName | string | null
  /** Cloud provider configured (API key present). */
  cloudConfigured?: boolean | null
}

export type ResolvedBrowserProvider = {
  provider: BrowserAgentProviderName
  reason:
    | "explicit_cloud"
    | "explicit_local"
    | "local_available"
    | "local_unavailable_fallback_cloud"
    | "unattended_requires_cloud"
    | "cloud_only_operation"
    | "cloud_default"
  localBridgeAvailable: boolean
  requiresLocalClient: boolean
}

function parseExecutionMode(value: unknown): BrowserExecutionMode | null {
  const raw = String(value ?? "").trim().toLowerCase()
  if (raw === "local" || raw === "cloud" || raw === "auto") return raw
  return null
}

function parseProviderName(value: unknown): BrowserAgentProviderName | null {
  const raw = String(value ?? "").trim().toLowerCase()
  if (
    raw === "browser_use" ||
    raw === "browser_use_local" ||
    raw === "browserbase_stagehand" ||
    raw === "browserbase_computer_use" ||
    raw === "other"
  ) {
    return raw
  }
  if (raw === "cloud") return "browser_use"
  if (raw === "local") return "browser_use_local"
  return null
}

function isLocalBridgeHealthy(status: LocalBridgeStatusInput | null | undefined): boolean {
  if (!status) return false
  if (status.available !== true) return false
  if (status.chromeAvailable === false) return false
  return true
}

/**
 * Resolve which BrowserAgentProvider to use for an operation.
 * Selection must happen before irreversible publication actions begin.
 */
export function resolveBrowserProvider(
  input: ResolveBrowserProviderInput,
): ResolvedBrowserProvider {
  const localBridgeAvailable = isLocalBridgeHealthy(input.localBridge)
  const mode = parseExecutionMode(input.executionMode) ?? "auto"
  const preferred = parseProviderName(input.preferredProvider)
  const forceCloud =
    input.localBridge?.forceCloud === true ||
    mode === "cloud" ||
    preferred === "browser_use"
  const forceLocal =
    input.localBridge?.forceLocal === true ||
    mode === "local" ||
    preferred === "browser_use_local"

  // Unattended internal schedules always use Cloud (user machine may be offline).
  if (input.operation === "unattended_scheduled_execution") {
    return {
      provider: "browser_use",
      reason: "unattended_requires_cloud",
      localBridgeAvailable,
      requiresLocalClient: false,
    }
  }

  if (forceCloud && !forceLocal) {
    return {
      provider: "browser_use",
      reason: "explicit_cloud",
      localBridgeAvailable,
      requiresLocalClient: false,
    }
  }

  if (forceLocal) {
    return {
      provider: "browser_use_local",
      reason: "explicit_local",
      localBridgeAvailable,
      requiresLocalClient: true,
    }
  }

  // Interactive / immediate / native schedule: local-first when bridge is healthy.
  if (
    input.operation === "immediate_publication" ||
    input.operation === "interactive_browser" ||
    input.operation === "connect_destination" ||
    input.operation === "native_schedule"
  ) {
    if (localBridgeAvailable) {
      return {
        provider: "browser_use_local",
        reason: "local_available",
        localBridgeAvailable: true,
        requiresLocalClient: true,
      }
    }
    return {
      provider: "browser_use",
      reason: "local_unavailable_fallback_cloud",
      localBridgeAvailable: false,
      requiresLocalClient: false,
    }
  }

  return {
    provider: "browser_use",
    reason: "cloud_default",
    localBridgeAvailable,
    requiresLocalClient: false,
  }
}

export function isLocalBrowserProvider(name: unknown): boolean {
  return String(name ?? "").trim().toLowerCase() === "browser_use_local"
}
