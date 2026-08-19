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

const DESKTOP_SCREEN = { width: 1440, height: 900 }

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
    screen: DESKTOP_SCREEN,
  })
  return {
    ok: true,
    browser_id: browser.id,
    live_view_url: browser.liveViewUrl ?? null,
    start_url: args.startUrl,
    current_url: args.startUrl,
    status: browser.status || "active",
    error_code: null,
    error: null,
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
