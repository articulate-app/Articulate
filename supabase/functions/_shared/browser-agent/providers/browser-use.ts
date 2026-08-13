/**
 * Browser Use Cloud API V4 provider (REST via fetch).
 * Docs: https://docs.browser-use.com/cloud/api-v4-overview
 *
 * We intentionally use the official V4 HTTP API instead of `browser-use-sdk`:
 * the npm SDK is Node-oriented and is not required for Deno Edge Functions.
 * API key must come from Deno.env (BROWSER_USE_API_KEY) — never the frontend.
 *
 * All calls stay server-side; never expose API keys or CDP URLs to clients.
 */

import type {
  AlignBrowserViewportInput,
  AlignBrowserViewportResult,
  BrowserAgentProvider,
  BrowserHistoryEntry,
  BrowserNavigationState,
  BrowserProfile,
  BrowserRun,
  BrowserRunEvent,
  BrowserRunStatus,
  BrowserSession,
  BrowserUploadedFile,
  BrowserViewportSize,
  BrowserWorkspace,
  ContinueRunInput,
  ControlBrowserInput,
  CreateBrowserInput,
  CreateProfileInput,
  GetEventsInput,
  LiveViewInfo,
  StartRunInput,
  UploadFileInput,
} from "../types.ts"
import { BrowserAgentError } from "../types.ts"

const DEFAULT_BASE_URL = "https://api.browser-use.com/api/v4"
/** Free-plan default. Paid models (e.g. grok-4.5) return 403 without credits. */
const DEFAULT_MODEL = "minimax-m3"
const FREE_PLAN_FALLBACK_MODEL = "minimax-m3"

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** Browser Use V4 limits: width 320–6144, height 320–3456. */
function clampBrowserScreen(
  screen: { width?: number | null; height?: number | null } | null | undefined,
): { width: number; height: number } | null {
  const width = Number(screen?.width)
  const height = Number(screen?.height)
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  if (width < 1 || height < 1) return null
  return {
    width: Math.min(6144, Math.max(320, Math.round(width))),
    height: Math.min(3456, Math.max(320, Math.round(height))),
  }
}

function sanitizeProviderMessage(message: string): string {
  return message
    .replace(/bu_[a-zA-Z0-9_-]+/g, "[redacted]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/X-Browser-Use-API-Key[^\n]*/gi, "X-Browser-Use-API-Key: [redacted]")
    .slice(0, 500)
}

type CdpMessage = {
  id?: number
  method?: string
  params?: Record<string, unknown>
  result?: Record<string, unknown>
  error?: { message?: string }
  sessionId?: string
}

type CdpSessionOptions = {
  timeoutMs?: number
  webSocketCtor?: typeof WebSocket
  errorCode?: string
}

async function withCdpPageSession(
  cdpUrl: string,
  options: CdpSessionOptions,
  run: (send: (method: string, params?: Record<string, unknown>, sessionId?: string) => Promise<CdpMessage>, pageSessionId: string, targetId: string) => Promise<void>,
): Promise<void> {
  const endpoint = asString(cdpUrl)
  const errorCode = options.errorCode ?? "cdp_failed"
  if (!endpoint) {
    throw new BrowserAgentError(errorCode, "CDP requires cdpUrl", { provider: "browser_use" })
  }

  const timeoutMs = options.timeoutMs ?? 20_000
  const WS = options.webSocketCtor ?? WebSocket

  await new Promise<void>((resolve, reject) => {
    let settled = false
    let nextId = 1
    const pending = new Map<number, { resolve: (msg: CdpMessage) => void; reject: (err: Error) => void }>()
    const ws = new WS(endpoint)

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        ws.close()
      } catch {
        // ignore
      }
      if (error) reject(error)
      else resolve()
    }

    const timer = setTimeout(() => {
      finish(new BrowserAgentError(errorCode, "CDP operation timed out", { provider: "browser_use" }))
    }, timeoutMs)

    const send = (method: string, params?: Record<string, unknown>, sessionId?: string) => {
      const id = nextId++
      const payload: Record<string, unknown> = { id, method }
      if (params) payload.params = params
      if (sessionId) payload.sessionId = sessionId
      return new Promise<CdpMessage>((res, rej) => {
        pending.set(id, { resolve: res, reject: rej })
        try {
          ws.send(JSON.stringify(payload))
        } catch (error) {
          pending.delete(id)
          rej(error instanceof Error ? error : new Error(String(error)))
        }
      })
    }

    ws.onopen = () => {
      void (async () => {
        try {
          const targets = await send("Target.getTargets")
          const infos = Array.isArray(targets.result?.targetInfos)
            ? (targets.result!.targetInfos as Array<Record<string, unknown>>)
            : []
          const page =
            infos.find((item) => item.type === "page" && item.attached !== false) ??
            infos.find((item) => item.type === "page")
          const targetId = asString(page?.targetId)
          if (!targetId) {
            throw new BrowserAgentError(errorCode, "No page target available for CDP", {
              provider: "browser_use",
            })
          }

          const attached = await send("Target.attachToTarget", { targetId, flatten: true })
          const sessionId = asString(attached.result?.sessionId)
          if (!sessionId) {
            throw new BrowserAgentError(errorCode, "CDP attachToTarget returned no sessionId", {
              provider: "browser_use",
            })
          }

          await run(send, sessionId, targetId)
          finish()
        } catch (error) {
          finish(
            error instanceof BrowserAgentError
              ? error
              : new BrowserAgentError(
                  errorCode,
                  sanitizeProviderMessage(error instanceof Error ? error.message : String(error)),
                  { provider: "browser_use" },
                ),
          )
        }
      })()
    }

    ws.onmessage = (event) => {
      try {
        const raw = typeof event.data === "string" ? event.data : String(event.data)
        const msg = JSON.parse(raw) as CdpMessage
        if (typeof msg.id !== "number") return
        const waiter = pending.get(msg.id)
        if (!waiter) return
        pending.delete(msg.id)
        if (msg.error?.message) {
          waiter.reject(new Error(sanitizeProviderMessage(msg.error.message)))
        } else {
          waiter.resolve(msg)
        }
      } catch {
        // ignore malformed frames
      }
    }

    ws.onerror = () => {
      finish(new BrowserAgentError(errorCode, "CDP websocket error", { provider: "browser_use" }))
    }
  })
}

/**
 * Drive Page.navigate over a Browser Use CDP websocket, then disconnect.
 * Disconnecting CDP does not stop the managed browser session.
 */
export async function navigateViaCdp(
  cdpUrl: string,
  url: string,
  options?: { timeoutMs?: number; webSocketCtor?: typeof WebSocket },
): Promise<void> {
  const targetUrl = asString(url)
  if (!targetUrl) {
    throw new BrowserAgentError("navigate_failed", "CDP navigate requires cdpUrl and url", {
      provider: "browser_use",
    })
  }

  await withCdpPageSession(cdpUrl, { ...options, errorCode: "navigate_failed" }, async (send, sessionId) => {
    await send("Page.enable", undefined, sessionId)
    await send("Page.navigate", { url: targetUrl }, sessionId)
  })
}

/**
 * Resize the managed browser window so Live View matches the requested screen.
 *
 * Never use Emulation.setDeviceMetricsOverride here: Live View captures the OS
 * window, and a device-metrics viewport (even when "matching") letterboxes the
 * page into the top half with a black band below.
 */
export async function resizeViaCdp(
  cdpUrl: string,
  screen: BrowserViewportSize,
  options?: { timeoutMs?: number; webSocketCtor?: typeof WebSocket },
): Promise<void> {
  const size = clampBrowserScreen(screen)
  if (!size) {
    throw new BrowserAgentError("resize_failed", "CDP resize requires valid screen size", {
      provider: "browser_use",
    })
  }

  await withCdpPageSession(cdpUrl, { ...options, errorCode: "resize_failed" }, async (send, sessionId, targetId) => {
    try {
      await send("Emulation.clearDeviceMetricsOverride", {}, sessionId)
    } catch {
      // no prior override
    }

    const windowForTarget = await send("Browser.getWindowForTarget", { targetId })
    const windowId = windowForTarget.result?.windowId
    if (typeof windowId !== "number") {
      throw new BrowserAgentError("resize_failed", "Browser window id unavailable for resize", {
        provider: "browser_use",
      })
    }
    await send("Browser.setWindowBounds", {
      windowId,
      bounds: {
        left: 0,
        top: 0,
        width: size.width,
        height: size.height,
        windowState: "normal",
      },
    })
  })
}

function normalizeNavigateUrl(url: string): string {
  const trimmed = String(url ?? "").trim()
  if (!trimmed) return trimmed
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function mapNavigationHistory(result: Record<string, unknown> | undefined): BrowserNavigationState {
  const currentIndex = Number(result?.currentIndex)
  const rawEntries = Array.isArray(result?.entries) ? result!.entries : []
  const history: BrowserHistoryEntry[] = []
  for (const item of rawEntries) {
    const record = asRecord(item)
    if (!record) continue
    const id = Number(record.id)
    const url = asString(record.url) ?? asString(record.userTypedURL) ?? ""
    if (!Number.isFinite(id) || !url) continue
    history.push({
      id,
      url,
      title: asString(record.title) ?? "",
    })
  }
  const current =
    Number.isFinite(currentIndex) && currentIndex >= 0 && currentIndex < history.length
      ? history[currentIndex]
      : history[history.length - 1] ?? null
  return {
    url: current?.url ?? "about:blank",
    title: current?.title ?? "",
    canGoBack: Number.isFinite(currentIndex) ? currentIndex > 0 : false,
    canGoForward: Number.isFinite(currentIndex) ? currentIndex < history.length - 1 : false,
    history,
  }
}

/**
 * Read / drive navigation for Articulate's custom browser chrome.
 * Never expose cdpUrl to clients — call only from the edge function.
 */
export async function controlViaCdp(
  cdpUrl: string,
  input: {
    command: ControlBrowserInput["command"]
    url?: string | null
    historyEntryId?: number | null
  },
  options?: { timeoutMs?: number; webSocketCtor?: typeof WebSocket },
): Promise<BrowserNavigationState> {
  let state: BrowserNavigationState | null = null

  await withCdpPageSession(cdpUrl, { ...options, errorCode: "navigate_failed" }, async (send, sessionId) => {
    await send("Page.enable", undefined, sessionId)

    if (input.command === "navigate") {
      const targetUrl = normalizeNavigateUrl(asString(input.url) ?? "")
      if (!targetUrl) {
        throw new BrowserAgentError("navigate_failed", "URL is required", { provider: "browser_use" })
      }
      await send("Page.navigate", { url: targetUrl }, sessionId)
    } else if (input.command === "reload") {
      await send("Page.reload", { ignoreCache: false }, sessionId)
    } else if (input.command === "back" || input.command === "forward" || input.command === "history_entry") {
      const history = await send("Page.getNavigationHistory", undefined, sessionId)
      const currentIndex = Number(history.result?.currentIndex)
      const entries = Array.isArray(history.result?.entries) ? history.result!.entries : []
      let entryId: number | null = null
      if (input.command === "history_entry") {
        entryId = Number(input.historyEntryId)
      } else if (Number.isFinite(currentIndex)) {
        const nextIndex = input.command === "back" ? currentIndex - 1 : currentIndex + 1
        const entry = asRecord(entries[nextIndex])
        entryId = Number(entry?.id)
      }
      if (!Number.isFinite(entryId as number)) {
        throw new BrowserAgentError("navigate_failed", `Cannot ${input.command} in browser history`, {
          provider: "browser_use",
        })
      }
      await send("Page.navigateToHistoryEntry", { entryId }, sessionId)
    }

    const nav = await send("Page.getNavigationHistory", undefined, sessionId)
    state = mapNavigationHistory(nav.result)
  })

  return (
    state ?? {
      url: "about:blank",
      title: "",
      canGoBack: false,
      canGoForward: false,
      history: [],
    }
  )
}

export type BrowserUseProviderOptions = {
  apiKey: string
  baseUrl?: string
  defaultModel?: string
  fetchImpl?: typeof fetch
}

export class BrowserUseProvider implements BrowserAgentProvider {
  readonly name = "browser_use" as const
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly defaultModel: string
  private readonly fetchImpl: typeof fetch

  constructor(options: BrowserUseProviderOptions) {
    const key = String(options.apiKey ?? "").trim()
    if (!key) {
      throw new BrowserAgentError("provider_not_configured", "BROWSER_USE_API_KEY is not configured", {
        provider: "browser_use",
      })
    }
    this.apiKey = key
    this.baseUrl = String(options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "")
    this.defaultModel = String(options.defaultModel ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    init?: { headers?: Record<string, string>; rawBody?: BodyInit | null },
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`
    const headers: Record<string, string> = {
      "X-Browser-Use-API-Key": this.apiKey,
      ...(init?.headers ?? {}),
    }
    let payload: BodyInit | undefined
    if (init?.rawBody !== undefined) {
      payload = init.rawBody ?? undefined
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json"
      payload = JSON.stringify(body)
    }

    const response = await this.fetchImpl(url, { method, headers, body: payload })
    const text = await response.text().catch(() => "")
    let parsed: unknown = null
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = { detail: text }
      }
    }

    if (!response.ok) {
      const record = asRecord(parsed)
      const detail =
        asString(record?.detail) ||
        asString(record?.message) ||
        asString(record?.error) ||
        `Browser Use request failed (${response.status})`
      throw new BrowserAgentError("provider_request_failed", sanitizeProviderMessage(detail), {
        status: response.status,
        provider: "browser_use",
        retryable: response.status === 429 || response.status >= 500,
      })
    }

    return parsed as T
  }

  async createProfile(input: CreateProfileInput): Promise<BrowserProfile> {
    const data = await this.request<Record<string, unknown>>("POST", "/profiles", {
      name: input.name ?? null,
      userId: input.userId ?? null,
    })
    const id = asString(data.id)
    if (!id) throw new BrowserAgentError("profile_create_failed", "Profile create returned no id", { provider: "browser_use" })
    return {
      id,
      name: asString(data.name),
      userId: asString(data.userId),
      cookieDomains: Array.isArray(data.cookieDomains)
        ? data.cookieDomains.filter((d): d is string => typeof d === "string")
        : null,
    }
  }

  async deleteProfile(profileId: string): Promise<void> {
    const id = asString(profileId)
    if (!id) return
    await this.request<unknown>("DELETE", `/profiles/${id}`)
  }

  async createBrowser(input: CreateBrowserInput): Promise<BrowserSession> {
    const screen = clampBrowserScreen(input.screen)
    const data = await this.request<Record<string, unknown>>("POST", "/browsers", {
      profileId: input.profileId ?? null,
      timeout: input.timeoutMinutes ?? 60,
      proxyCountryCode: input.proxyCountryCode === undefined ? "us" : input.proxyCountryCode,
      enableRecording: input.enableRecording ?? false,
      // Keep the stable desktop screen size. allowResizing:true lets Live View change
      // the remote viewport (often into a tall/narrow pane shape) and letterboxes.
      allowResizing: false,
      ...(screen
        ? {
            browserScreenWidth: screen.width,
            browserScreenHeight: screen.height,
          }
        : {}),
    })
    const browser = this.mapBrowser(data)
    const startUrl = asString(input.startUrl)
    if (startUrl) {
      const cdpUrl = asString(browser.cdpUrl)
      if (!cdpUrl) {
        throw new BrowserAgentError("navigate_failed", "Browser created but no CDP URL was returned for startUrl", {
          provider: "browser_use",
        })
      }
      await navigateViaCdp(cdpUrl, startUrl)
    }
    return browser
  }

  async stopBrowser(browserId: string): Promise<BrowserSession | null> {
    const id = asString(browserId)
    if (!id) return null
    const data = await this.request<Record<string, unknown>>("PATCH", `/browsers/${id}`, {
      action: "stop",
    })
    return this.mapBrowser(data)
  }

  async listActiveBrowsers(): Promise<BrowserSession[]> {
    const data = await this.request<Record<string, unknown>>(
      "GET",
      "/browsers?filterBy=active&pageSize=100&pageNumber=1",
    )
    const items = Array.isArray(data.items) ? data.items : []
    const browsers: BrowserSession[] = []
    for (const item of items) {
      const record = asRecord(item)
      if (!record) continue
      try {
        browsers.push(this.mapBrowser(record))
      } catch {
        // skip malformed rows
      }
    }
    return browsers
  }

  async getBrowser(browserId: string): Promise<BrowserSession | null> {
    const id = asString(browserId)
    if (!id) return null
    try {
      const data = await this.request<Record<string, unknown>>("GET", `/browsers/${id}`)
      return this.mapBrowser(data)
    } catch (error) {
      if (error instanceof BrowserAgentError && error.status === 404) return null
      throw error
    }
  }

  async navigateBrowser(browserId: string, url: string): Promise<void> {
    const id = asString(browserId)
    const targetUrl = asString(url)
    if (!id || !targetUrl) {
      throw new BrowserAgentError("navigate_failed", "browserId and url are required", { provider: "browser_use" })
    }
    const browser = await this.getBrowser(id)
    const cdpUrl = asString(browser?.cdpUrl)
    if (!browser || browser.status === "stopped" || !cdpUrl) {
      throw new BrowserAgentError("navigate_failed", "Browser is not active or has no CDP URL", {
        provider: "browser_use",
      })
    }
    await navigateViaCdp(cdpUrl, targetUrl)
  }

  async controlBrowser(input: ControlBrowserInput): Promise<BrowserNavigationState> {
    let browserId = asString(input.browserId)
    if (!browserId && input.agentSessionId) {
      browserId = await this.findBrowserIdForAgentSession(String(input.agentSessionId))
    }
    if (!browserId) {
      // Status polls should not 500 when the session was already torn down.
      if (input.command === "status") {
        return {
          url: "",
          title: "",
          canGoBack: false,
          canGoForward: false,
          history: [],
          active: false,
        }
      }
      throw new BrowserAgentError("navigate_failed", "browserId is required", { provider: "browser_use" })
    }
    const browser = await this.getBrowser(browserId)
    const cdpUrl = asString(browser?.cdpUrl)
    if (!browser || browser.status === "stopped" || !cdpUrl) {
      if (input.command === "status") {
        return {
          url: "",
          title: "",
          canGoBack: false,
          canGoForward: false,
          history: [],
          active: false,
        }
      }
      throw new BrowserAgentError("navigate_failed", "Browser is not active or has no CDP URL", {
        provider: "browser_use",
      })
    }
    const state = await controlViaCdp(cdpUrl, {
      command: input.command,
      url: input.url,
      historyEntryId: input.historyEntryId,
    })
    return { ...state, active: true }
  }

  private async findBrowserIdForAgentSession(agentSessionId: string): Promise<string | null> {
    const sessionId = asString(agentSessionId)
    if (!sessionId) return null
    try {
      const data = await this.request<Record<string, unknown>>(
        "GET",
        `/browsers?agentSessionId=${encodeURIComponent(sessionId)}&filterBy=active&pageSize=5`,
      )
      const items = Array.isArray(data.items) ? data.items : []
      for (const item of items) {
        const record = asRecord(item)
        const id = asString(record?.id)
        if (id) return id
      }
    } catch {
      // best-effort
    }
    // Fallback: some V4 deployments key /browsers/{id} by the agent session id.
    try {
      const browser = await this.getBrowser(sessionId)
      return browser?.id ?? null
    } catch {
      return null
    }
  }

  async alignBrowserViewport(input: AlignBrowserViewportInput): Promise<AlignBrowserViewportResult> {
    const screen = clampBrowserScreen(input.screen)
    if (!screen) {
      return { browserId: asString(input.browserId), resized: false, liveViewUrl: null }
    }

    let browserId = asString(input.browserId)
    if (!browserId && input.agentSessionId) {
      browserId = await this.findBrowserIdForAgentSession(String(input.agentSessionId))
    }
    if (!browserId) {
      return { browserId: null, resized: false, liveViewUrl: null }
    }

    const browser = await this.getBrowser(browserId)
    const cdpUrl = asString(browser?.cdpUrl)
    if (!browser || browser.status === "stopped" || !cdpUrl) {
      return {
        browserId,
        resized: false,
        liveViewUrl: browser?.liveViewUrl ?? null,
      }
    }

    try {
      await resizeViaCdp(cdpUrl, screen)
      console.log(
        JSON.stringify({
          scope: "browser-use",
          event: "align_browser_viewport",
          at: new Date().toISOString(),
          browserId,
          requested_screen_width: screen.width,
          requested_screen_height: screen.height,
          resized: true,
        }),
      )
      return {
        browserId,
        resized: true,
        liveViewUrl: browser.liveViewUrl ?? null,
      }
    } catch (error) {
      console.log(
        JSON.stringify({
          scope: "browser-use",
          event: "align_browser_viewport_failed",
          at: new Date().toISOString(),
          browserId,
          requested_screen_width: screen.width,
          requested_screen_height: screen.height,
          message: sanitizeProviderMessage(error instanceof Error ? error.message : String(error)),
        }),
      )
      return {
        browserId,
        resized: false,
        liveViewUrl: browser.liveViewUrl ?? null,
      }
    }
  }

  async createWorkspace(name?: string | null): Promise<BrowserWorkspace> {
    const data = await this.request<Record<string, unknown>>("POST", "/workspaces", {
      name: name ?? null,
    })
    const id = asString(data.id)
    if (!id) throw new BrowserAgentError("workspace_create_failed", "Workspace create returned no id", { provider: "browser_use" })
    return { id, name: asString(data.name) }
  }

  async uploadFile(input: UploadFileInput): Promise<BrowserUploadedFile> {
    const size = input.bytes.byteLength
    if (size < 1) {
      throw new BrowserAgentError("upload_failed", "Cannot upload an empty file", { provider: "browser_use" })
    }
    const prepared = await this.request<{ files?: Array<Record<string, unknown>> }>(
      "POST",
      `/workspaces/${input.workspaceId}/files/upload`,
      {
        files: [
          {
            name: input.name,
            contentType: input.contentType || "application/octet-stream",
            size,
          },
        ],
      },
    )
    const file = prepared.files?.[0]
    const uploadUrl = asString(file?.uploadUrl)
    const id = asString(file?.id)
    const path = asString(file?.path) ?? `uploads/${input.name}`
    if (!file || !uploadUrl || !id) {
      throw new BrowserAgentError("upload_failed", "Workspace upload did not return a presigned URL", {
        provider: "browser_use",
      })
    }

    const putResponse = await this.fetchImpl(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": input.contentType || "application/octet-stream",
        "Content-Length": String(size),
      },
      body: input.bytes,
    })
    if (!putResponse.ok) {
      throw new BrowserAgentError(
        "upload_failed",
        sanitizeProviderMessage(`File upload failed (${putResponse.status})`),
        { status: putResponse.status, provider: "browser_use", retryable: putResponse.status >= 500 },
      )
    }

    return {
      id,
      name: asString(file.name) ?? input.name,
      path,
      size,
      purpose: input.purpose ?? null,
    }
  }

  async startRun(input: StartRunInput): Promise<BrowserRun> {
    const requestedModel = input.model ?? this.defaultModel
    const body: Record<string, unknown> = {
      task: input.task,
      model: requestedModel,
    }
    if (input.sessionId) body.sessionId = input.sessionId
    // Follow-ups: omit workspaceId so V4 inherits the session workspace.
    // Never pair an old sessionId with an unrelated workspaceId.
    if (input.workspaceId && !input.sessionId) body.workspaceId = input.workspaceId
    if (input.attachedFileIds?.length) body.attachedFileIds = input.attachedFileIds
    if (input.maxCostUsd != null) body.maxCostUsd = input.maxCostUsd
    const screen = clampBrowserScreen(input.screen)
    const isNewBrowser = !input.sessionId
    // browserSettings only apply when a NEW browser is provisioned.
    // Follow-ups reuse the live browser; sending settings risks profile/proxy mismatches.
    if (isNewBrowser) {
      const wantsSettings =
        Boolean(input.profileId) ||
        input.proxyCountryCode !== undefined ||
        Boolean(screen) ||
        input.record != null
      if (wantsSettings) {
        body.browserSettings = {
          ...(input.profileId ? { profileId: input.profileId } : {}),
          // V4 TS contract: when browserSettings is present, include proxyCountryCode.
          // Default US residential; pass null to disable for QA/internal sites.
          proxyCountryCode: input.proxyCountryCode === undefined ? "us" : input.proxyCountryCode,
          // Performance baseline: recording off unless explicitly enabled.
          record: input.record ?? false,
          ...(screen
            ? {
                screenWidth: screen.width,
                screenHeight: screen.height,
              }
            : {}),
        }
      }
    }
    const profileId = asString(input.profileId)
    const settings = asRecord(body.browserSettings)
    console.log(
      JSON.stringify({
        scope: "browser-use",
        event: "start_run_request",
        at: new Date().toISOString(),
        new_browser: isNewBrowser,
        sessionId: input.sessionId ?? null,
        workspaceId: isNewBrowser ? (input.workspaceId ?? null) : null,
        requested_model: requestedModel,
        profile_loaded: Boolean(profileId),
        profile_id_suffix: profileId ? profileId.slice(-8) : null,
        requested_screen_width: isNewBrowser ? (screen?.width ?? null) : null,
        requested_screen_height: isNewBrowser ? (screen?.height ?? null) : null,
        browserSettings: settings
          ? {
              profileId: settings.profileId ? "[set]" : null,
              proxyCountryCode: settings.proxyCountryCode === undefined
                ? null
                : settings.proxyCountryCode,
              screenWidth: settings.screenWidth ?? null,
              screenHeight: settings.screenHeight ?? null,
              record: settings.record ?? null,
            }
          : null,
      }),
    )
    const logCreated = (
      run: BrowserRun,
      data: Record<string, unknown>,
      extras: { fallback_used: boolean; proxy_fallback_used: boolean },
    ) => {
      console.log(
        JSON.stringify({
          scope: "browser-use",
          event: "start_run_created",
          at: new Date().toISOString(),
          run_id: run.id,
          sessionId: run.sessionId,
          workspaceId: run.workspaceId ?? null,
          requested_model: requestedModel,
          actual_model: asString(data.model) ?? String(body.model ?? requestedModel),
          fallback_used: extras.fallback_used,
          proxy_fallback_used: extras.proxy_fallback_used,
          proxy_country_code: asRecord(body.browserSettings)?.proxyCountryCode ?? null,
          profile_loaded: Boolean(profileId),
          profile_id_suffix: profileId ? profileId.slice(-8) : null,
        }),
      )
    }

    try {
      const data = await this.request<Record<string, unknown>>("POST", "/runs", body)
      const run = this.mapRun(data)
      logCreated(run, data, { fallback_used: false, proxy_fallback_used: false })
      return run
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const settings = asRecord(body.browserSettings)
      const requestedProxy = settings?.proxyCountryCode
      // Free plan often only allows the US residential proxy. Prefer the destination
      // region, but retry once with "us" when the provider rejects a specific country.
      // Do not treat every HTTP 403 as a proxy restriction.
      const isPlanBlockedProxy =
        error instanceof BrowserAgentError &&
        (error.status === 403 || error.status === 400) &&
        /proxy country|not available on the free plan.*proxy|use the us proxy/i.test(message)
      if (
        isPlanBlockedProxy &&
        settings &&
        requestedProxy != null &&
        String(requestedProxy).toLowerCase() !== "us"
      ) {
        body.browserSettings = { ...settings, proxyCountryCode: "us" }
        console.log(
          JSON.stringify({
            scope: "browser-use",
            event: "proxy_fallback",
            at: new Date().toISOString(),
            requested_proxy: requestedProxy,
            fallback_proxy: "us",
            message: sanitizeProviderMessage(message),
          }),
        )
        try {
          const data = await this.request<Record<string, unknown>>("POST", "/runs", body)
          const run = this.mapRun(data)
          logCreated(run, data, { fallback_used: false, proxy_fallback_used: true })
          return run
        } catch (proxyRetryError) {
          error = proxyRetryError
        }
      }

      // Free-plan accounts reject paid models (e.g. grok-4.5). Retry once with the free default.
      // Do not treat every HTTP 403 as a model restriction.
      const retryMessage = error instanceof Error ? error.message : String(error)
      const isPlanBlockedModel =
        error instanceof BrowserAgentError &&
        error.status === 403 &&
        /not available on the free plan|free-plan model|model .* not available/i.test(retryMessage)
      if (
        isPlanBlockedModel &&
        String(body.model) !== FREE_PLAN_FALLBACK_MODEL
      ) {
        body.model = FREE_PLAN_FALLBACK_MODEL
        const data = await this.request<Record<string, unknown>>("POST", "/runs", body)
        const run = this.mapRun(data)
        logCreated(run, data, {
          fallback_used: true,
          proxy_fallback_used: String(asRecord(body.browserSettings)?.proxyCountryCode ?? "") === "us" &&
            requestedProxy != null &&
            String(requestedProxy).toLowerCase() !== "us",
        })
        return run
      }
      throw error
    }
  }

  async continueRun(input: ContinueRunInput): Promise<BrowserRun> {
    // Prefer a new run on the same session (preserves browser + conversation + workspace).
    // Do not pass workspaceId or browserSettings — inherit from the live session.
    return this.startRun({
      task: input.text,
      sessionId: input.sessionId,
      model: input.model,
    })
  }

  async cancelRun(runId: string): Promise<void> {
    await this.request("POST", `/runs/${runId}/cancel`, {})
  }

  async getRun(runId: string): Promise<BrowserRun> {
    const data = await this.request<Record<string, unknown>>("GET", `/runs/${runId}`)
    return this.mapRun(data)
  }

  async getRunStatus(runId: string): Promise<BrowserRunStatus> {
    const data = await this.request<{ status?: string }>("GET", `/runs/${runId}/status`)
    return (asString(data.status) ?? "queued") as BrowserRunStatus
  }

  async getEvents(input: GetEventsInput): Promise<{ events: BrowserRunEvent[]; nextAfter: number | null }> {
    const params = new URLSearchParams()
    if (input.after != null) params.set("after", String(input.after))
    if (input.limit != null) params.set("limit", String(input.limit))
    const qs = params.toString()
    const data = await this.request<Record<string, unknown>>(
      "GET",
      `/runs/${input.runId}/events${qs ? `?${qs}` : ""}`,
    )
    const rawEvents = Array.isArray(data.events) ? data.events : []
    const events: BrowserRunEvent[] = rawEvents
      .map((item) => {
        const record = asRecord(item)
        if (!record) return null
        const id = typeof record.id === "number" ? record.id : Number(record.id)
        const runId = asString(record.runId) ?? input.runId
        const ts = asString(record.ts) ?? new Date().toISOString()
        const type = asString(record.type) ?? "unknown"
        if (!Number.isFinite(id)) return null
        return {
          id,
          runId,
          ts,
          type,
          data: asRecord(record.data) ?? {},
        }
      })
      .filter((item): item is BrowserRunEvent => item != null)

    const nextAfter =
      typeof data.nextAfter === "number"
        ? data.nextAfter
        : typeof data.next_after === "number"
          ? data.next_after
          : null

    return { events, nextAfter }
  }

  async getLiveView(runId: string, browserId?: string | null): Promise<LiveViewInfo> {
    const explicitBrowserId = asString(browserId)
    if (explicitBrowserId) {
      const browser = await this.getBrowser(explicitBrowserId)
      if (browser?.liveViewUrl) {
        return {
          liveViewUrl: browser.liveViewUrl,
          source: "browser",
          browserId: browser.id,
        }
      }
    }

    const { events } = await this.getEvents({ runId, limit: 100 })
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i]
      if (event.type !== "browser.ready") continue
      const url =
        asString(event.data.live_view_url) ||
        asString(event.data.liveViewUrl) ||
        asString(event.data.liveUrl)
      const eventBrowserId =
        asString(event.data.browser_id) ||
        asString(event.data.browserId) ||
        asString(event.data.id)
      if (url) {
        return {
          liveViewUrl: url,
          source: "event",
          browserId: eventBrowserId,
        }
      }
    }

    return { liveViewUrl: null, source: "none", browserId: explicitBrowserId }
  }

  private mapBrowser(data: Record<string, unknown>): BrowserSession {
    const id = asString(data.id)
    if (!id) throw new BrowserAgentError("browser_create_failed", "Browser session returned no id", { provider: "browser_use" })
    return {
      id,
      status: (asString(data.status) ?? "active") as BrowserSession["status"],
      liveViewUrl: asString(data.liveUrl) ?? asString(data.live_url) ?? asString(data.liveViewUrl),
      cdpUrl: asString(data.cdpUrl) ?? asString(data.cdp_url),
      timeoutAt: asString(data.timeoutAt) ?? asString(data.timeout_at),
    }
  }

  private mapRun(data: Record<string, unknown>): BrowserRun {
    const id = asString(data.id)
    const sessionId = asString(data.sessionId) ?? asString(data.session_id)
    if (!id || !sessionId) {
      throw new BrowserAgentError("run_create_failed", "Run response missing id or sessionId", {
        provider: "browser_use",
      })
    }
    return {
      id,
      sessionId,
      workspaceId: asString(data.workspaceId) ?? asString(data.workspace_id),
      status: (asString(data.status) ?? "queued") as BrowserRunStatus,
      task: asString(data.task),
      result: typeof data.result === "string" ? data.result : data.result == null ? null : String(data.result),
      error: asString(data.error),
      attachedFileIds: Array.isArray(data.attachedFileIds)
        ? data.attachedFileIds.filter((id): id is string => typeof id === "string")
        : Array.isArray(data.attached_file_ids)
          ? data.attached_file_ids.filter((id): id is string => typeof id === "string")
          : null,
    }
  }
}
