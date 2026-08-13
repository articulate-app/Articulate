/**
 * Client for the Articulate Browser Bridge (dev-only local helper).
 * Talks to loopback only; never sends credentials to Supabase.
 */

export type BridgeHealth = {
  ok: boolean
  available?: boolean
  service?: string
  version?: string
  host?: string
  port?: number
  mode?: string
  sessions?: number
  browserUseCloud?: boolean
  personalChromeProfile?: boolean
  chromeAvailable?: boolean
  chromePath?: string | null
  durableProfiles?: boolean
  liveScreencast?: boolean
  streamPath?: string
  deviceId?: string
  device_id?: string
  platform?: string
  pairing?: string
  auth?: string
  paired?: boolean | null
  error?: string
}

export type BridgePageTarget = {
  id: string
  title: string
  url: string
  type: string
  active: boolean
}

export type BridgeNavState = {
  url: string
  title: string
  canGoBack: boolean
  canGoForward: boolean
}

export type BridgeSession = {
  id: string
  status: "active" | "stopped"
  startUrl: string
  currentUrl: string
  title: string
  startedAt: string
}

export type BridgeDiagnostics = {
  startupMs?: number
  navigateMs?: number
  stateMs?: number
  actionMs?: number
}

export type BridgeInteractiveElement = {
  index: number
  tag: string
  role: string
  type: string
  text: string
  name: string
  href: string
  placeholder: string
  value: string
  isPassword: boolean
}

export type BridgeBrowserState = {
  url: string
  title: string
  elements: BridgeInteractiveElement[]
  note: string
}

export type BridgeBrowserAction =
  | { type: "navigate"; url: string }
  | { type: "back" }
  | { type: "forward" }
  | { type: "reload" }
  | { type: "click"; index: number }
  | { type: "type"; index: number; text: string; submit?: boolean }
  | { type: "scroll"; direction: "up" | "down"; amount?: number }
  | { type: "wait"; ms?: number }

const DEFAULT_URL = "http://127.0.0.1:17321"

export function getBridgeBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_ARTICULATE_BRIDGE_URL?.trim()
  return (fromEnv || DEFAULT_URL).replace(/\/$/, "")
}

export function getBridgeTokenFromEnv(): string {
  // Legacy only — production pairing never requires a public frontend token.
  if (process.env.NEXT_PUBLIC_ARTICULATE_BRIDGE_LEGACY_TOKEN === "1") {
    return process.env.NEXT_PUBLIC_ARTICULATE_BRIDGE_TOKEN?.trim() || ""
  }
  return ""
}

/**
 * @deprecated Prefer getLocalBrowserAccessToken() from browser-helper-client.
 * Kept as a no-op unless NEXT_PUBLIC_ARTICULATE_BRIDGE_LEGACY_TOKEN=1.
 */
export function requireBridgeToken(): string {
  const legacy = getBridgeTokenFromEnv()
  if (legacy) return legacy
  throw new Error(
    "Local browser authorization required. Connect the Articulate Browser Helper from Settings → Security.",
  )
}

type RequestOptions = {
  method?: "GET" | "POST"
  token: string
  body?: unknown
  timeoutMs?: number
}

async function bridgeFetch<T>(
  path: string,
  options: RequestOptions,
): Promise<T> {
  const base = getBridgeBaseUrl()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000)
  try {
    const response = await fetch(`${base}${path}`, {
      method: options.method ?? "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${options.token}`,
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    })
    const data = (await response.json().catch(() => ({}))) as T & {
      ok?: boolean
      error?: string
    }
    if (!response.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : `Bridge HTTP ${response.status}`,
      )
    }
    return data
  } finally {
    clearTimeout(timer)
  }
}

type ProbeCacheEntry = {
  atMs: number
  health: BridgeHealth
  inflight?: Promise<BridgeHealth>
}

let probeCache: ProbeCacheEntry | null = null

/** Positive hits stay warm longer; misses expire quickly so a just-started Helper is found. */
const PROBE_TTL_OK_MS = 12_000
const PROBE_TTL_MISS_MS = 2_000
/** Localhost should answer fast — long timeouts delay Cloud fallback on every open. */
const PROBE_TIMEOUT_MS = 800

/** Unauthenticated probe — safe to call from any origin check. */
export async function probeLocalBridge(options?: {
  /** Bypass TTL and hit the helper again. */
  force?: boolean
}): Promise<BridgeHealth> {
  const now = Date.now()
  if (!options?.force && probeCache) {
    if (probeCache.inflight) return probeCache.inflight
    const ttl = probeCache.health.ok ? PROBE_TTL_OK_MS : PROBE_TTL_MISS_MS
    if (now - probeCache.atMs < ttl) return probeCache.health
  }

  const base = getBridgeBaseUrl()
  const run = (async (): Promise<BridgeHealth> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    try {
      const response = await fetch(`${base}/health`, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      })
      if (!response.ok) {
        return { ok: false, error: `Health HTTP ${response.status}` }
      }
      return (await response.json()) as BridgeHealth
    } catch (error) {
      const message =
        error instanceof Error
          ? error.name === "AbortError"
            ? "Bridge not reachable (timeout)"
            : error.message
          : String(error)
      return { ok: false, error: message }
    } finally {
      clearTimeout(timer)
    }
  })()

  probeCache = { atMs: now, health: probeCache?.health ?? { ok: false }, inflight: run }
  const health = await run
  probeCache = { atMs: Date.now(), health }
  return health
}

export async function listBridgeSessions(token: string): Promise<BridgeSession[]> {
  const data = await bridgeFetch<{ sessions: BridgeSession[] }>("/v1/sessions", {
    token,
  })
  return data.sessions ?? []
}

export async function startBridgeSession(
  token: string,
  url: string,
  options?: { profileKey?: string | null },
): Promise<{ session: BridgeSession; diagnostics?: BridgeDiagnostics }> {
  const data = await bridgeFetch<{
    session: BridgeSession
    diagnostics?: BridgeDiagnostics
  }>("/v1/sessions", {
    method: "POST",
    token,
    body: {
      url,
      ...(options?.profileKey ? { profileKey: options.profileKey } : {}),
    },
    timeoutMs: 30_000,
  })
  return data
}

/** True when the loopback bridge is reachable and Chrome can be launched. */
export function isLocalBridgeReady(health: BridgeHealth | null | undefined): boolean {
  if (!health?.ok) return false
  if (health.chromeAvailable === false) return false
  return true
}

export async function navigateBridgeSession(
  token: string,
  sessionId: string,
  url: string,
): Promise<{ session: BridgeSession; diagnostics?: BridgeDiagnostics }> {
  const data = await bridgeFetch<{
    session: BridgeSession
    diagnostics?: BridgeDiagnostics
  }>(`/v1/sessions/${encodeURIComponent(sessionId)}/navigate`, {
    method: "POST",
    token,
    body: { url },
    timeoutMs: 30_000,
  })
  return data
}

export async function refreshBridgeSession(
  token: string,
  sessionId: string,
): Promise<BridgeSession> {
  const data = await bridgeFetch<{ session: BridgeSession }>(
    `/v1/sessions/${encodeURIComponent(sessionId)}/refresh`,
    { method: "POST", token },
  )
  return data.session
}

export async function stopBridgeSession(
  token: string,
  sessionId: string,
): Promise<void> {
  await bridgeFetch(`/v1/sessions/${encodeURIComponent(sessionId)}/stop`, {
    method: "POST",
    token,
    timeoutMs: 15_000,
  })
}

/** Bring the Articulate Chrome window/tab to the foreground when supported. */
export async function focusBridgeSession(
  token: string,
  sessionId: string,
): Promise<{ focused: boolean; method?: string; session?: BridgeSession }> {
  return bridgeFetch(`/v1/sessions/${encodeURIComponent(sessionId)}/focus`, {
    method: "POST",
    token,
    timeoutMs: 10_000,
  })
}

/**
 * Emergency JPEG snapshot only. Prefer the live screencast WebSocket for UI.
 * @deprecated Use connectBridgeStream / LocalBrowserSurface.
 */
export async function getBridgeScreenshot(
  token: string,
  sessionId: string,
): Promise<{ mimeType: string; data: string; url?: string; title?: string }> {
  return bridgeFetch(`/v1/sessions/${encodeURIComponent(sessionId)}/screenshot`, {
    token,
    timeoutMs: 15_000,
  })
}

/** Authenticated WS URL for CDP live screencast (loopback only). */
export function getBridgeStreamUrl(sessionId: string, accessToken: string): string {
  const base = getBridgeBaseUrl()
  const wsBase = base.replace(/^http/i, "ws")
  const url = new URL(
    `${wsBase}/v1/sessions/${encodeURIComponent(sessionId)}/stream`,
  )
  // Short-lived token for WS handshake only — never persist in router state.
  url.searchParams.set("access_token", accessToken)
  return url.toString()
}

export async function postBridgeInput(
  token: string,
  sessionId: string,
  body: Record<string, unknown>,
): Promise<void> {
  await bridgeFetch(`/v1/sessions/${encodeURIComponent(sessionId)}/input`, {
    method: "POST",
    token,
    body,
    timeoutMs: 8_000,
  })
}

export async function setBridgeViewport(
  token: string,
  sessionId: string,
  width: number,
  height: number,
): Promise<{ width: number; height: number } | null> {
  const data = await bridgeFetch<{
    viewport?: { width: number; height: number } | null
  }>(`/v1/sessions/${encodeURIComponent(sessionId)}/viewport`, {
    method: "POST",
    token,
    body: { width, height },
    timeoutMs: 8_000,
  })
  return data.viewport ?? null
}

export async function listBridgeTargets(
  token: string,
  sessionId: string,
): Promise<BridgePageTarget[]> {
  const data = await bridgeFetch<{ targets: BridgePageTarget[] }>(
    `/v1/sessions/${encodeURIComponent(sessionId)}/targets`,
    { token },
  )
  return data.targets ?? []
}

export async function switchBridgeTarget(
  token: string,
  sessionId: string,
  targetId: string,
): Promise<BridgePageTarget[]> {
  const data = await bridgeFetch<{ targets: BridgePageTarget[] }>(
    `/v1/sessions/${encodeURIComponent(sessionId)}/targets`,
    { method: "POST", token, body: { targetId } },
  )
  return data.targets ?? []
}

export async function getBridgeNavState(
  token: string,
  sessionId: string,
): Promise<BridgeNavState & { session?: BridgeSession }> {
  return bridgeFetch(`/v1/sessions/${encodeURIComponent(sessionId)}/nav`, {
    token,
  })
}

export async function navigateBridgeLocal(
  token: string,
  sessionId: string,
  command: "back" | "forward" | "reload" | "navigate",
  url?: string,
): Promise<void> {
  if (command === "navigate") {
    if (!url?.trim()) return
    await navigateBridgeSession(token, sessionId, url.trim())
    return
  }
  await postBridgeInput(token, sessionId, { kind: command })
}

export async function getBridgeBrowserState(
  token: string,
  sessionId: string,
): Promise<{
  session: BridgeSession
  state: BridgeBrowserState
  diagnostics?: BridgeDiagnostics
}> {
  return bridgeFetch(`/v1/sessions/${encodeURIComponent(sessionId)}/state`, {
    token,
    timeoutMs: 20_000,
  })
}

export async function runBridgeBrowserAction(
  token: string,
  sessionId: string,
  action: BridgeBrowserAction,
): Promise<{
  session: BridgeSession
  state: BridgeBrowserState
  diagnostics?: BridgeDiagnostics
}> {
  return bridgeFetch(`/v1/sessions/${encodeURIComponent(sessionId)}/action`, {
    method: "POST",
    token,
    body: { action },
    timeoutMs: 30_000,
  })
}

/** Authenticated CDP HTTP base for Browser Use `BU_CDP_URL` attach proofs. */
export async function getBridgeCdpUrl(
  token: string,
  sessionId: string,
): Promise<{ cdpUrl: string; sameBrowser: boolean }> {
  return bridgeFetch(`/v1/sessions/${encodeURIComponent(sessionId)}/cdp`, {
    token,
  })
}

export type LocalAgentStepResult = {
  thought: string
  status: "continue" | "needs_user" | "done" | "failed"
  action: BridgeBrowserAction | null
  /** Multi-action plan (preferred). Falls back to [action] when absent. */
  actions?: BridgeBrowserAction[]
  message: string
  diagnostics?: {
    llmMs?: number
    proxyMs?: number
    elementCount?: number
    actionCount?: number
  }
}

export async function requestLocalAgentStep(input: {
  task: string
  state: BridgeBrowserState
  history: Array<{ thought?: string; action?: BridgeBrowserAction; result?: string }>
  step: number
  entryUrl?: string | null
  signal?: AbortSignal
}): Promise<LocalAgentStepResult> {
  // Prefer the publishing route; fall back to the legacy /api/dev path.
  const endpoints = ["/api/local-browser-agent", "/api/dev/local-browser-agent"]
  let lastError: Error | null = null
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          task: input.task,
          state: input.state,
          history: input.history,
          step: input.step,
          entry_url: input.entryUrl ?? null,
        }),
        cache: "no-store",
        signal: input.signal,
      })
      const payload = (await response.json().catch(() => ({}))) as LocalAgentStepResult & {
        error?: { message?: string }
      }
      if (response.status === 404) {
        lastError = new Error(payload?.error?.message || `Agent step unavailable (${endpoint})`)
        continue
      }
      if (!response.ok) {
        throw new Error(payload?.error?.message || `Agent step failed (${response.status})`)
      }
      const actions =
        Array.isArray(payload.actions) && payload.actions.length > 0
          ? payload.actions
          : payload.action
            ? [payload.action]
            : []
      return { ...payload, actions, action: actions[0] ?? payload.action ?? null }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error
      }
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }
  throw lastError ?? new Error("Agent step failed")
}
