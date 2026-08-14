/**
 * Central browser provider resolution.
 *
 * Active architecture:
 *   Desktop available → articulate_desktop (Electron WebContentsView)
 *   else / unattended → browser_use (Cloud)
 *
 * LocalBridgeProvider / browser_use_local is LEGACY and must never be selected
 * for new executions. Historical rows may still contain that provider name.
 */

import type { BrowserAgentProviderName, BrowserExecutionMode } from "./types.ts"

export type BrowserProviderOperation =
  | "immediate_publication"
  | "interactive_browser"
  | "connect_destination"
  | "native_schedule"
  | "unattended_scheduled_execution"
  | "external_schedule_cancel"

/** @deprecated Local bridge is no longer part of runtime resolution. Kept for request parsing only. */
export type LocalBridgeStatusInput = {
  available?: boolean | null
  chromeAvailable?: boolean | null
  version?: string | null
  forceCloud?: boolean | null
  forceLocal?: boolean | null
}

export type ResolveBrowserProviderInput = {
  operation: BrowserProviderOperation
  executionMode?: BrowserExecutionMode | string | null
  /**
   * True when the request originates from Articulate Desktop (Electron) with a
   * healthy native browser bridge (`window.articulateDesktop`).
   */
  desktopAvailable?: boolean | null
  /**
   * @deprecated Ignored for provider selection. Local bridge is not an active provider.
   * Still accepted so older clients do not break request parsing.
   */
  localBridge?: LocalBridgeStatusInput | null
  /** Explicit provider name wins when valid (never selects legacy local). */
  preferredProvider?: BrowserAgentProviderName | string | null
  /** Cloud provider configured (API key present). */
  cloudConfigured?: boolean | null
}

export type ResolvedBrowserProvider = {
  provider: BrowserAgentProviderName
  reason:
    | "explicit_cloud"
    | "desktop_available"
    | "desktop_unavailable_fallback_cloud"
    | "unattended_requires_cloud"
    | "cloud_only_operation"
    | "cloud_default"
  desktopAvailable: boolean
  /** Always false — Local Bridge is not part of active architecture. */
  localBridgeAvailable: false
  requiresDesktopClient: boolean
  /** @deprecated Always false. */
  requiresLocalClient: false
}

function parseExecutionMode(value: unknown): BrowserExecutionMode | null {
  const raw = String(value ?? "").trim().toLowerCase()
  if (raw === "cloud" || raw === "auto" || raw === "desktop") return raw === "desktop" ? "auto" : raw
  // Legacy "local" mode is ignored — never maps to browser_use_local.
  if (raw === "local") return "auto"
  return null
}

function parseProviderName(value: unknown): BrowserAgentProviderName | null {
  const raw = String(value ?? "").trim().toLowerCase()
  if (raw === "browser_use" || raw === "articulate_desktop") return raw
  if (raw === "cloud") return "browser_use"
  if (raw === "desktop") return "articulate_desktop"
  // Legacy names — never select for new work.
  if (raw === "browser_use_local" || raw === "local") return null
  if (
    raw === "browserbase_stagehand" ||
    raw === "browserbase_computer_use" ||
    raw === "other"
  ) {
    return raw
  }
  return null
}

/**
 * Resolve which browser provider to use for an operation.
 * Selection must happen before irreversible publication actions begin.
 */
export function resolveBrowserProvider(
  input: ResolveBrowserProviderInput,
): ResolvedBrowserProvider {
  const desktopAvailable = input.desktopAvailable === true
  const mode = parseExecutionMode(input.executionMode) ?? "auto"
  const preferred = parseProviderName(input.preferredProvider)
  const forceCloud =
    input.localBridge?.forceCloud === true ||
    mode === "cloud" ||
    preferred === "browser_use"
  // forceLocal from old clients is intentionally ignored.

  // Unattended internal schedules always use Cloud (Desktop/Mac may be offline).
  if (input.operation === "unattended_scheduled_execution") {
    return {
      provider: "browser_use",
      reason: "unattended_requires_cloud",
      desktopAvailable,
      localBridgeAvailable: false,
      requiresDesktopClient: false,
      requiresLocalClient: false,
    }
  }

  if (forceCloud) {
    return {
      provider: "browser_use",
      reason: "explicit_cloud",
      desktopAvailable,
      localBridgeAvailable: false,
      requiresDesktopClient: false,
      requiresLocalClient: false,
    }
  }

  // Interactive / immediate / native schedule / connect: Desktop when available.
  if (
    input.operation === "immediate_publication" ||
    input.operation === "interactive_browser" ||
    input.operation === "connect_destination" ||
    input.operation === "native_schedule" ||
    preferred === "articulate_desktop"
  ) {
    if (desktopAvailable || preferred === "articulate_desktop") {
      return {
        provider: "articulate_desktop",
        reason: "desktop_available",
        desktopAvailable: true,
        localBridgeAvailable: false,
        requiresDesktopClient: true,
        requiresLocalClient: false,
      }
    }
    return {
      provider: "browser_use",
      reason: "desktop_unavailable_fallback_cloud",
      desktopAvailable: false,
      localBridgeAvailable: false,
      requiresDesktopClient: false,
      requiresLocalClient: false,
    }
  }

  return {
    provider: "browser_use",
    reason: "cloud_default",
    desktopAvailable,
    localBridgeAvailable: false,
    requiresDesktopClient: false,
    requiresLocalClient: false,
  }
}

/** @deprecated Legacy local bridge provider — historical rows only. */
export function isLocalBrowserProvider(name: unknown): boolean {
  return String(name ?? "").trim().toLowerCase() === "browser_use_local"
}

export function isDesktopBrowserProvider(name: unknown): boolean {
  const raw = String(name ?? "").trim().toLowerCase()
  return raw === "articulate_desktop" || raw === "desktop"
}

export function isCloudBrowserProvider(name: unknown): boolean {
  return String(name ?? "").trim().toLowerCase() === "browser_use"
}
