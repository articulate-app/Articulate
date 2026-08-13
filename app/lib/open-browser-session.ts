/**
 * Provider-neutral browser session opener for manual / AI / generic Browser tabs.
 * Uses the same Local-first policy as publishing (probe bridge → pair → authorize → open).
 */

"use client"

import {
  isLocalBridgeReady,
  probeLocalBridge,
  refreshBridgeSession,
  startBridgeSession,
  stopBridgeSession,
  type BridgeSession,
} from "./local-browser-bridge"
import {
  discoverBrowserHelper,
  getLocalBrowserAccessToken,
  pairBrowserHelper,
} from "./browser-helper-client"
import { detectLocalBridgeStatus } from "./local-publication-driver"
import { openStandaloneBrowser } from "./services/agentic-publishing"

export type OpenBrowserSessionSource = "manual" | "publishing" | "ai" | "reconnect"

export type OpenedBrowserSession = {
  provider: "browser_use_local" | "browser_use"
  browserId: string | null
  bridgeSessionId: string | null
  liveViewUrl: string | null
  startUrl: string
  currentUrl: string | null
  title: string | null
  status: string
  browserLabel: "Local" | "Cloud"
  paired?: boolean
  needsPairing?: boolean
}

export class BrowserHelperPairingRequiredError extends Error {
  readonly code = "pairing_required"
  readonly deviceId: string
  constructor(deviceId: string) {
    super("Articulate Browser Helper detected. Connect this computer to use the local browser.")
    this.name = "BrowserHelperPairingRequiredError"
    this.deviceId = deviceId
  }
}

function friendlyCloudUnavailable(message: string): string {
  const lower = message.toLowerCase()
  if (
    /credit|balance|\$0\.0|payment|billing|quota|insufficient/i.test(lower) ||
    /need at least/i.test(lower)
  ) {
    return "Local browser is not available and the Cloud browser cannot start because no Cloud credits are available."
  }
  if (/not configured|api key/i.test(lower)) {
    return "Local browser is not available and the Cloud browser is not configured."
  }
  return "Local browser is not available and the Cloud browser could not start."
}

function logBrowserOpen(fields: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return
  console.info("[browser]", fields)
}

async function openLocalWithAuth(args: {
  startUrl: string
  source: OpenBrowserSessionSource
  profileKey?: string | null
  autoPair?: boolean
}): Promise<OpenedBrowserSession> {
  const discovery = await discoverBrowserHelper()
  if (discovery.state === "missing") {
    throw new Error("Articulate Browser Helper is not installed or running.")
  }
  if (discovery.state === "unauthorized") {
    throw new Error("Sign in to Articulate to use the local browser.")
  }
  if (discovery.state === "unpaired" || discovery.state === "revoked") {
    if (args.autoPair !== false) {
      await pairBrowserHelper()
    } else {
      throw new BrowserHelperPairingRequiredError(discovery.deviceId)
    }
  }

  const token = await getLocalBrowserAccessToken({
    deviceId: "deviceId" in discovery ? discovery.deviceId : undefined,
  })

  logBrowserOpen({
    browser_open_source: args.source,
    resolved_provider: "browser_use_local",
    local_bridge_available: true,
    device_id: "deviceId" in discovery ? discovery.deviceId : null,
  })

  const started = await startBridgeSession(token, args.startUrl, {
    profileKey: args.profileKey ?? `manual-${args.source}`,
  })
  const session = started.session
  return {
    provider: "browser_use_local",
    browserId: session.id,
    bridgeSessionId: session.id,
    liveViewUrl: null,
    startUrl: args.startUrl,
    currentUrl: session.currentUrl || args.startUrl,
    title: session.title || null,
    status: session.status,
    browserLabel: "Local",
    paired: true,
  }
}

export type OpenBrowserSessionArgs = {
  startUrl?: string | null
  source?: OpenBrowserSessionSource
  profileKey?: string | null
  /** When false, unpaired helper throws BrowserHelperPairingRequiredError for UI Connect. */
  autoPair?: boolean
}

/**
 * Open a generic browser session (not publication-specific).
 * Helper healthy + paired → Local. Helper healthy + unpaired → pair then Local.
 * Helper missing → Cloud fallback.
 */
export async function openBrowserSession(
  args?: OpenBrowserSessionArgs,
): Promise<OpenedBrowserSession> {
  const startUrl = (args?.startUrl?.trim() || "https://www.google.com/").replace(/\s+/g, "")
  const source = args?.source ?? "manual"
  const bridge = await detectLocalBridgeStatus()

  if (bridge.available) {
    try {
      return await openLocalWithAuth({
        startUrl,
        source,
        profileKey: args?.profileKey,
        autoPair: args?.autoPair,
      })
    } catch (error) {
      if (error instanceof BrowserHelperPairingRequiredError) throw error
      // If pairing/auth fails unexpectedly, surface the error (do not silently burn Cloud).
      throw error
    }
  }

  logBrowserOpen({
    browser_open_source: source,
    resolved_provider: "browser_use",
    local_bridge_available: false,
    local_bridge_error: bridge.health.error ?? null,
  })

  try {
    const opened = await openStandaloneBrowser({
      startUrl,
      forceCloud: true,
      localBridgeAvailable: false,
    })
    return {
      provider: "browser_use",
      browserId: opened.browser_id,
      bridgeSessionId: null,
      liveViewUrl: opened.live_view_url,
      startUrl: opened.start_url || startUrl,
      currentUrl: opened.start_url || startUrl,
      title: null,
      status: opened.status ?? "active",
      browserLabel: "Cloud",
    }
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error)
    throw new Error(friendlyCloudUnavailable(raw))
  }
}

type ManualOpenEntry = {
  promise: Promise<OpenedBrowserSession>
}

/** In-flight / recently started opens keyed by workspace browser tab id. */
const manualBrowserOpens = new Map<string, ManualOpenEntry>()

/**
 * Start opening a browser as soon as the user clicks (+ → Browser), before React
 * mounts BrowserSessionPane. The pane claims the same promise to avoid a double start.
 */
export function beginManualBrowserOpen(
  tabId: string,
  args?: OpenBrowserSessionArgs,
): Promise<OpenedBrowserSession> {
  const key = String(tabId || "").trim()
  if (!key) return openBrowserSession(args)
  const existing = manualBrowserOpens.get(key)
  if (existing) return existing.promise

  const promise = openBrowserSession({
    startUrl: args?.startUrl ?? "https://www.google.com/",
    source: args?.source ?? "manual",
    profileKey: args?.profileKey ?? "manual-browser",
    autoPair: args?.autoPair ?? false,
  })
  const entry: ManualOpenEntry = { promise }
  manualBrowserOpens.set(key, entry)
  void promise.finally(() => {
    // Keep briefly so a late-mounting pane can still claim after resolve.
    const clear = () => {
      if (manualBrowserOpens.get(key) === entry) manualBrowserOpens.delete(key)
    }
    if (typeof window !== "undefined") window.setTimeout(clear, 30_000)
    else clear()
  })
  return promise
}

/** Claim an in-flight open started from the new-tab menu (same tab id). */
export function claimManualBrowserOpen(tabId: string): Promise<OpenedBrowserSession> | null {
  const key = String(tabId || "").trim()
  if (!key) return null
  return manualBrowserOpens.get(key)?.promise ?? null
}

export async function refreshLocalBrowserSession(
  bridgeSessionId: string,
): Promise<BridgeSession | null> {
  if (!bridgeSessionId) return null
  try {
    const token = await getLocalBrowserAccessToken()
    return await refreshBridgeSession(token, bridgeSessionId)
  } catch {
    return null
  }
}

export async function stopOpenedBrowserSession(session: {
  provider?: string | null
  bridgeSessionId?: string | null
  browserId?: string | null
}): Promise<void> {
  if (session.provider === "browser_use_local" || session.bridgeSessionId) {
    const id = session.bridgeSessionId || session.browserId
    if (id) {
      try {
        const token = await getLocalBrowserAccessToken()
        await stopBridgeSession(token, id)
      } catch {
        // ignore — window may already be closed
      }
    }
  }
}

export async function probeLocalForBrowserOpen(): Promise<boolean> {
  const health = await probeLocalBridge()
  return isLocalBridgeReady(health)
}
