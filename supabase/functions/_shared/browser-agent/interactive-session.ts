/**
 * Generic interactive browser sessions (AI Chat / Research).
 * Independent of publication_runs. Publishing may attach a run later.
 */

import { createBrowserProvider } from "./index.ts"
import {
  BROWSER_ERROR_CODES,
  compactBrowserResult,
  emptyBrowserResult,
  type BrowserControllerInput,
  type BrowserControllerResult,
} from "./controller.ts"
import type { BrowserAgentProvider } from "./types.ts"

/**
 * Match Browser Use Live View (documented 16:9 embed).
 * A 16:10 window (1440×900) is letterboxed inside that player.
 * Always pair this with alignBrowserViewport so device-metrics
 * overrides cannot pin the page to the top half of the capture.
 */
const CLOUD_LIVE_VIEW_SCREEN = { width: 1920, height: 1080 }

export function isCloudBrowserConfigured(): boolean {
  return Boolean(String(Deno.env.get("BROWSER_USE_API_KEY") ?? "").trim())
}

export function createCloudInteractiveProvider(): BrowserAgentProvider | null {
  const apiKey = String(Deno.env.get("BROWSER_USE_API_KEY") ?? "").trim()
  if (!apiKey) return null
  return createBrowserProvider({
    provider: "browser_use",
    apiKey,
    baseUrl: Deno.env.get("BROWSER_USE_BASE_URL"),
    defaultModel: Deno.env.get("BROWSER_USE_MODEL"),
  })
}

export async function openCloudInteractiveBrowser(args: {
  startUrl: string
}): Promise<{
  ok: boolean
  browser_id: string | null
  live_view_url: string | null
  start_url: string
  current_url: string
  status: string
  error_code: string | null
  error: string | null
}> {
  const provider = createCloudInteractiveProvider()
  if (!provider) {
    return {
      ok: false,
      browser_id: null,
      live_view_url: null,
      start_url: args.startUrl,
      current_url: args.startUrl,
      status: "failed",
      error_code: BROWSER_ERROR_CODES.cloud_browser_unavailable,
      error: "Cloud browser is not configured.",
    }
  }
  const browser = await provider.createBrowser({
    startUrl: args.startUrl,
    timeoutMinutes: 90,
    screen: CLOUD_LIVE_VIEW_SCREEN,
  })
  const aligned = await provider.alignBrowserViewport({
    browserId: browser.id,
    screen: CLOUD_LIVE_VIEW_SCREEN,
  })
  return {
    ok: true,
    browser_id: aligned.browserId ?? browser.id,
    live_view_url: aligned.liveViewUrl ?? browser.liveViewUrl ?? null,
    start_url: args.startUrl,
    current_url: args.startUrl,
    status: browser.status || "active",
    error_code: null,
    error: null,
  }
}

export async function alignCloudInteractiveBrowser(browserId: string): Promise<{
  resized: boolean
  live_view_url: string | null
  browser_id: string | null
}> {
  const provider = createCloudInteractiveProvider()
  if (!provider) {
    return { resized: false, live_view_url: null, browser_id: browserId }
  }
  const aligned = await provider.alignBrowserViewport({
    browserId,
    screen: CLOUD_LIVE_VIEW_SCREEN,
  })
  return {
    resized: aligned.resized,
    live_view_url: aligned.liveViewUrl ?? null,
    browser_id: aligned.browserId ?? browserId,
  }
}

export async function actOnCloudInteractiveBrowser(
  browserId: string,
  input: BrowserControllerInput,
): Promise<BrowserControllerResult> {
  const provider = createCloudInteractiveProvider()
  if (!provider || typeof provider.actOnBrowser !== "function") {
    return emptyBrowserResult(
      BROWSER_ERROR_CODES.cloud_browser_unavailable,
      "Cloud browser is not configured.",
    )
  }
  const acted = await provider.actOnBrowser(browserId, input)
  return compactBrowserResult(acted)
}
