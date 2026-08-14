/**
 * Provider-neutral browser session opener for manual / AI / generic Browser tabs.
 *
 * Active resolution:
 *   Desktop available → articulate_desktop
 *   else → Browser Use Cloud
 *
 * Local Browser Bridge is NOT used for new sessions.
 */

"use client"

import { openStandaloneBrowser } from "./services/agentic-publishing"
import {
  getArticulateDesktop,
  isArticulateDesktopAvailable,
} from "./articulate-desktop"

export type OpenBrowserSessionSource = "manual" | "publishing" | "ai" | "reconnect"

export type OpenedBrowserSession = {
  provider: "browser_use" | "articulate_desktop"
  browserId: string | null
  /** @deprecated Always null — Local Bridge is disconnected. */
  bridgeSessionId: string | null
  liveViewUrl: string | null
  startUrl: string
  currentUrl: string | null
  title: string | null
  status: string
  browserLabel: "Cloud" | "Desktop"
  faviconUrl?: string | null
}

function friendlyCloudUnavailable(message: string): string {
  const lower = message.toLowerCase()
  if (
    /credit|balance|\$0\.0|payment|billing|quota|insufficient/i.test(lower) ||
    /need at least/i.test(lower)
  ) {
    return "The Cloud browser cannot start because no Cloud credits are available."
  }
  if (/not configured|api key/i.test(lower)) {
    return "The Cloud browser is not configured."
  }
  return "The Cloud browser could not start."
}

function logBrowserOpen(fields: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return
  console.info("[browser]", fields)
}

export type OpenBrowserSessionArgs = {
  startUrl?: string | null
  source?: OpenBrowserSessionSource
  profileKey?: string | null
  /** Stable Electron browser id (workspace tab id) when running in Articulate Desktop. */
  desktopBrowserId?: string | null
}

/**
 * Open a generic browser session (not publication-specific).
 * Desktop → native WebContentsView. Otherwise → Cloud Live View.
 */
export async function openBrowserSession(
  args?: OpenBrowserSessionArgs,
): Promise<OpenedBrowserSession> {
  const startUrl = (args?.startUrl?.trim() || "https://www.google.com/").replace(/\s+/g, "")
  const source = args?.source ?? "manual"

  if (isArticulateDesktopAvailable()) {
    const desktop = getArticulateDesktop()
    const id =
      (typeof args?.desktopBrowserId === "string" && args.desktopBrowserId.trim()) ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `desktop-${Date.now()}`)
    logBrowserOpen({
      browser_open_source: source,
      resolved_provider: "articulate_desktop",
      desktop: true,
    })
    if (desktop) {
      const created = await desktop.browser.create({ id, url: startUrl })
      return {
        provider: "articulate_desktop",
        browserId: created.id,
        bridgeSessionId: null,
        liveViewUrl: null,
        startUrl,
        currentUrl: created.url || startUrl,
        title: created.title || null,
        status: "active",
        browserLabel: "Desktop",
        faviconUrl: created.favicon,
      }
    }
    return {
      provider: "articulate_desktop",
      browserId: id,
      bridgeSessionId: null,
      liveViewUrl: null,
      startUrl,
      currentUrl: startUrl,
      title: null,
      status: "active",
      browserLabel: "Desktop",
    }
  }

  logBrowserOpen({
    browser_open_source: source,
    resolved_provider: "browser_use",
    desktop: false,
  })

  try {
    const opened = await openStandaloneBrowser({
      startUrl,
      forceCloud: true,
      desktopAvailable: false,
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
    desktopBrowserId: key,
  })
  const entry: ManualOpenEntry = { promise }
  manualBrowserOpens.set(key, entry)
  void promise.finally(() => {
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

export async function stopOpenedBrowserSession(session: {
  provider?: string | null
  bridgeSessionId?: string | null
  browserId?: string | null
}): Promise<void> {
  if (session.provider === "articulate_desktop") {
    const id = session.browserId
    if (id && isArticulateDesktopAvailable()) {
      try {
        await getArticulateDesktop()?.browser.close(id)
      } catch {
        // ignore
      }
    }
  }
  // Cloud sessions are stopped via publishing cleanup / control_browser — no local bridge stop.
}

/** @deprecated Local Bridge is disconnected; always returns false. */
export async function probeLocalForBrowserOpen(): Promise<boolean> {
  return false
}
