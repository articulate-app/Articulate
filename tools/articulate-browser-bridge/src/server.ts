import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { URL } from "node:url"
import {
  captureSessionScreenshot,
  focusSession,
  launchIsolatedChrome,
  navigateSession,
  publicSessionView,
  refreshSessionMeta,
  resolveChromeExecutable,
  stopSession,
  type LocalBrowserSession,
} from "./chrome.js"
import {
  getBrowserState,
  runBrowserAction,
  type BrowserAction,
} from "./actions.js"
import { disposeSessionController, getSessionController } from "./session-cdp.js"
import { attachBrowserStreamServer } from "./stream-ws.js"
import {
  deviceStorageNote,
  getDeviceIdentity,
  saveVerificationPublicKey,
  signPairingChallenge,
} from "./device-identity.js"
import { tokenHasScope, verifyBrowserAccessToken } from "./auth-jwt.js"

const HOST = "127.0.0.1"
const PORT = Number(process.env.ARTICULATE_BRIDGE_PORT || 17321)
const HELPER_VERSION = "0.6.0"

/**
 * Legacy shared-token fallback — OFF by default.
 * Set ARTICULATE_BRIDGE_LEGACY_TOKEN=1 and ARTICULATE_BRIDGE_TOKEN=… only for migration.
 */
const LEGACY_TOKEN_ENABLED = process.env.ARTICULATE_BRIDGE_LEGACY_TOKEN === "1"
const LEGACY_AUTH_TOKEN = LEGACY_TOKEN_ENABLED
  ? process.env.ARTICULATE_BRIDGE_TOKEN?.trim() || ""
  : ""

const JWKS_URL =
  process.env.ARTICULATE_JWKS_URL?.trim() ||
  `${(process.env.ARTICULATE_APP_ORIGIN || "http://127.0.0.1:3000").replace(/\/$/, "")}/api/browser-helper/jwks`

const ALLOWED_ORIGINS = new Set(
  (process.env.ARTICULATE_BRIDGE_ORIGINS ||
    [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3001",
      "https://app.articulate.pt",
      "https://staging.articulate.pt",
    ].join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
)

const sessions = new Map<string, LocalBrowserSession>()
const metrics: Array<Record<string, unknown>> = []
const device = getDeviceIdentity()

function json(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  })
  res.end(payload)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

function extractBearer(req: IncomingMessage, url?: URL): string | null {
  const header = req.headers.authorization
  if (typeof header === "string") {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim())
    if (match?.[1]) return match[1]
  }
  const alt = req.headers["x-articulate-bridge-token"]
  if (typeof alt === "string" && alt.trim()) return alt.trim()
  if (url) {
    const q =
      url.searchParams.get("access_token") ||
      url.searchParams.get("token")
    if (q) return q
  }
  return null
}

function isLegacyToken(token: string | null): boolean {
  return Boolean(LEGACY_AUTH_TOKEN && token && token === LEGACY_AUTH_TOKEN)
}

async function authorizeRequest(
  req: IncomingMessage,
  url: URL,
  requiredScope?: string,
): Promise<boolean> {
  const token = extractBearer(req, url)
  if (!token) return false
  if (isLegacyToken(token)) return true
  try {
    const auth = await verifyBrowserAccessToken(token, {
      expectedDeviceId: device.deviceId,
      jwksUrl: JWKS_URL,
    })
    if (requiredScope && !tokenHasScope(auth, requiredScope)) return false
    return true
  } catch {
    return false
  }
}

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true
  return ALLOWED_ORIGINS.has(origin)
}

function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin
  if (!origin) return true
  if (!ALLOWED_ORIGINS.has(origin)) {
    json(res, 403, { ok: false, error: "Origin not allowed" })
    return false
  }
  res.setHeader("Access-Control-Allow-Origin", origin)
  res.setHeader("Vary", "Origin")
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS,DELETE")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Articulate-Bridge-Token",
  )
  res.setHeader("Access-Control-Max-Age", "600")
  return true
}

function parseAction(raw: unknown): BrowserAction {
  if (!raw || typeof raw !== "object") throw new Error("action object required")
  const action = raw as Record<string, unknown>
  const type = String(action.type || "")
  switch (type) {
    case "navigate":
      return { type: "navigate", url: String(action.url || "") }
    case "back":
    case "forward":
    case "reload":
      return { type }
    case "click":
      return { type: "click", index: Number(action.index) }
    case "type":
      return {
        type: "type",
        index: Number(action.index),
        text: String(action.text ?? ""),
        submit: Boolean(action.submit),
      }
    case "scroll":
      return {
        type: "scroll",
        direction: action.direction === "up" ? "up" : "down",
        amount: action.amount === undefined ? undefined : Number(action.amount),
      }
    case "wait":
      return { type: "wait", ms: action.ms === undefined ? undefined : Number(action.ms) }
    default:
      throw new Error(`Unsupported action type: ${type}`)
  }
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  if (!applyCors(req, res)) return

  if (req.method === "OPTIONS") {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`)
  const path = url.pathname

  if (req.method === "GET" && path === "/health") {
    let chromeAvailable = false
    let chromePath: string | null = null
    try {
      chromePath = resolveChromeExecutable()
      chromeAvailable = Boolean(chromePath)
    } catch {
      chromeAvailable = false
    }
    json(res, 200, {
      ok: true,
      available: true,
      service: "articulate-browser-helper",
      version: HELPER_VERSION,
      host: HOST,
      port: PORT,
      mode: "local_isolated_chromium",
      deviceId: device.deviceId,
      device_id: device.deviceId,
      platform: device.platform,
      chromeAvailable,
      chromePath: chromeAvailable ? chromePath : null,
      browserUseCloud: false,
      personalChromeProfile: false,
      liveScreencast: true,
      pairing: "challenge_response",
      auth: "short_lived_jwt",
      legacyTokenEnabled: LEGACY_TOKEN_ENABLED,
      // Pairing status is authoritative on Articulate servers — local health never claims paired.
      paired: null,
      sessions: sessions.size,
    })
    return
  }

  // Pairing attestation — loopback + origin only; no browser control.
  if (req.method === "POST" && path === "/v1/pairing/attest") {
    const raw = await readBody(req)
    const body = raw
      ? (JSON.parse(raw) as {
          challengeId?: string
          challenge?: string
          verificationPublicKeyPem?: string
        })
      : {}
    if (typeof body.challenge !== "string" || !body.challenge.trim()) {
      json(res, 400, { ok: false, error: "challenge is required" })
      return
    }
    if (typeof body.verificationPublicKeyPem === "string" && body.verificationPublicKeyPem.includes("PUBLIC KEY")) {
      saveVerificationPublicKey(body.verificationPublicKeyPem)
    }
    const signature = signPairingChallenge(body.challenge)
    json(res, 200, {
      ok: true,
      deviceId: device.deviceId,
      devicePublicKey: device.publicKeyPem,
      signature,
      platform: device.platform,
      helperVersion: HELPER_VERSION,
      challengeId: body.challengeId ?? null,
      storage: deviceStorageNote(),
    })
    return
  }

  if (req.method === "POST" && path === "/v1/pairing/verification-key") {
    const raw = await readBody(req)
    const body = raw ? (JSON.parse(raw) as { publicKeyPem?: string }) : {}
    if (typeof body.publicKeyPem !== "string" || !body.publicKeyPem.includes("PUBLIC KEY")) {
      json(res, 400, { ok: false, error: "publicKeyPem required" })
      return
    }
    saveVerificationPublicKey(body.publicKeyPem)
    json(res, 200, { ok: true })
    return
  }

  if (!(await authorizeRequest(req, url))) {
    json(res, 401, { ok: false, error: "Unauthorized" })
    return
  }

  try {
    if (req.method === "GET" && path === "/v1/sessions") {
      json(res, 200, {
        ok: true,
        sessions: Array.from(sessions.values()).map(publicSessionView),
      })
      return
    }

    if (req.method === "POST" && path === "/v1/sessions") {
      const raw = await readBody(req)
      const body = raw
        ? (JSON.parse(raw) as { url?: string; profileKey?: string; profile_key?: string })
        : {}
      const startUrl = typeof body.url === "string" ? body.url : "https://www.google.com/"
      const profileKey =
        typeof body.profileKey === "string"
          ? body.profileKey
          : typeof body.profile_key === "string"
            ? body.profile_key
            : null
      const started = Date.now()
      const session = await launchIsolatedChrome(startUrl, { profileKey })
      sessions.set(session.id, session)
      metrics.push({
        event: "session_start",
        sessionId: session.id,
        url: startUrl,
        startupMs: Date.now() - started,
        at: new Date().toISOString(),
      })
      json(res, 201, {
        ok: true,
        session: publicSessionView(session),
        diagnostics: { startupMs: Date.now() - started },
      })
      return
    }

    if (req.method === "GET" && path === "/v1/metrics") {
      json(res, 200, { ok: true, metrics })
      return
    }

    const sessionMatch =
      /^\/v1\/sessions\/([^/]+)(?:\/(navigate|stop|refresh|state|action|cdp|focus|screenshot|input|viewport|targets|nav))?$/.exec(
        path,
      )
    if (sessionMatch) {
      const sessionId = decodeURIComponent(sessionMatch[1] || "")
      const op = sessionMatch[2]
      const session = sessions.get(sessionId)
      if (!session) {
        json(res, 404, { ok: false, error: "Session not found" })
        return
      }

      if (req.method === "GET" && !op) {
        if (session.status === "active") await refreshSessionMeta(session)
        json(res, 200, { ok: true, session: publicSessionView(session) })
        return
      }

      if (req.method === "GET" && op === "cdp") {
        json(res, 200, {
          ok: true,
          cdpUrl: session.cdpHttpBase,
          hint: "export BU_CDP_URL=<cdpUrl> then run browser-use against this existing browser",
          sameBrowser: true,
          personalChromeProfile: false,
        })
        return
      }

      if (req.method === "GET" && op === "state") {
        const stateStarted = Date.now()
        const state = await getBrowserState(session)
        metrics.push({
          event: "get_state",
          sessionId: session.id,
          durationMs: Date.now() - stateStarted,
          elementCount: state.elements.length,
          at: new Date().toISOString(),
        })
        json(res, 200, {
          ok: true,
          session: publicSessionView(session),
          state,
          diagnostics: { stateMs: Date.now() - stateStarted },
        })
        return
      }

      if (req.method === "GET" && op === "targets") {
        const controller = getSessionController(session)
        await controller.ensureAttached()
        const targets = await controller.listTargets()
        json(res, 200, { ok: true, targets })
        return
      }

      if (req.method === "GET" && op === "nav") {
        const controller = getSessionController(session)
        const nav = await controller.getNavigationState()
        json(res, 200, { ok: true, ...nav, session: publicSessionView(session) })
        return
      }

      if (req.method === "POST" && op === "refresh") {
        await refreshSessionMeta(session)
        json(res, 200, { ok: true, session: publicSessionView(session) })
        return
      }

      if (req.method === "POST" && op === "navigate") {
        const raw = await readBody(req)
        const body = raw ? (JSON.parse(raw) as { url?: string }) : {}
        if (typeof body.url !== "string" || !body.url.trim()) {
          json(res, 400, { ok: false, error: "url is required" })
          return
        }
        const navStarted = Date.now()
        const controller = getSessionController(session)
        try {
          await controller.navigate(body.url.trim())
        } catch {
          await navigateSession(session, body.url)
        }
        metrics.push({
          event: "navigate",
          sessionId: session.id,
          url: body.url,
          navigateMs: Date.now() - navStarted,
          at: new Date().toISOString(),
        })
        json(res, 200, {
          ok: true,
          session: publicSessionView(session),
          diagnostics: { navigateMs: Date.now() - navStarted },
        })
        return
      }

      if (req.method === "POST" && op === "action") {
        const raw = await readBody(req)
        const body = raw ? (JSON.parse(raw) as { action?: unknown }) : {}
        const action = parseAction(body.action)
        const safeActionMeta =
          action.type === "type"
            ? { type: "type", index: action.index, textLength: action.text.length, submit: action.submit }
            : action
        const result = await runBrowserAction(session, action)
        metrics.push({
          event: "action",
          sessionId: session.id,
          action: safeActionMeta,
          durationMs: result.durationMs,
          at: new Date().toISOString(),
        })
        const state = await getBrowserState(session)
        json(res, 200, {
          ok: true,
          session: publicSessionView(session),
          action: safeActionMeta,
          state,
          diagnostics: { actionMs: result.durationMs },
        })
        return
      }

      if (req.method === "POST" && op === "input") {
        // Pointer/keyboard from Articulate UI — never log text/key values.
        const raw = await readBody(req)
        const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
        const controller = getSessionController(session)
        const kind = String(body.kind || "")
        if (kind === "mouse") {
          await controller.dispatchMouse({
            type: body.type as "mousePressed" | "mouseReleased" | "mouseMoved" | "mouseWheel",
            x: Number(body.x),
            y: Number(body.y),
            button: body.button as "none" | "left" | "middle" | "right" | undefined,
            buttons: body.buttons === undefined ? undefined : Number(body.buttons),
            clickCount: body.clickCount === undefined ? undefined : Number(body.clickCount),
            deltaX: body.deltaX === undefined ? undefined : Number(body.deltaX),
            deltaY: body.deltaY === undefined ? undefined : Number(body.deltaY),
            modifiers: body.modifiers === undefined ? undefined : Number(body.modifiers),
          })
        } else if (kind === "key") {
          await controller.dispatchKey({
            type: body.type as "keyDown" | "keyUp" | "rawKeyDown" | "char",
            key: typeof body.key === "string" ? body.key : undefined,
            code: typeof body.code === "string" ? body.code : undefined,
            text: typeof body.text === "string" ? body.text : undefined,
            unmodifiedText:
              typeof body.unmodifiedText === "string" ? body.unmodifiedText : undefined,
            windowsVirtualKeyCode:
              body.windowsVirtualKeyCode === undefined
                ? undefined
                : Number(body.windowsVirtualKeyCode),
            nativeVirtualKeyCode:
              body.nativeVirtualKeyCode === undefined
                ? undefined
                : Number(body.nativeVirtualKeyCode),
            modifiers: body.modifiers === undefined ? undefined : Number(body.modifiers),
            autoRepeat: Boolean(body.autoRepeat),
          })
        } else if (kind === "insertText") {
          const text = typeof body.text === "string" ? body.text : ""
          if (text) await controller.insertText(text)
        } else if (kind === "back") {
          await controller.goBack()
        } else if (kind === "forward") {
          await controller.goForward()
        } else if (kind === "reload") {
          await controller.reload()
        } else {
          json(res, 400, { ok: false, error: "Unsupported input kind" })
          return
        }
        json(res, 200, { ok: true })
        return
      }

      if (req.method === "POST" && op === "viewport") {
        const raw = await readBody(req)
        const body = raw
          ? (JSON.parse(raw) as {
              width?: number
              height?: number
              deviceScaleFactor?: number
            })
          : {}
        const width = Number(body.width)
        const height = Number(body.height)
        if (!Number.isFinite(width) || !Number.isFinite(height)) {
          json(res, 400, { ok: false, error: "width and height required" })
          return
        }
        const controller = getSessionController(session)
        await controller.setViewport(width, height, {
          deviceScaleFactor:
            body.deviceScaleFactor === undefined
              ? undefined
              : Number(body.deviceScaleFactor),
        })
        json(res, 200, {
          ok: true,
          viewport: controller.currentViewport,
          diagnostics: controller.screencastDiagnostics,
        })
        return
      }

      if (req.method === "POST" && op === "targets") {
        const raw = await readBody(req)
        const body = raw ? (JSON.parse(raw) as { targetId?: string; switchTo?: string }) : {}
        const targetId = body.targetId || body.switchTo
        const controller = getSessionController(session)
        if (targetId) await controller.switchTarget(String(targetId))
        const targets = await controller.listTargets()
        json(res, 200, { ok: true, targets })
        return
      }

      if (req.method === "POST" && op === "focus") {
        const result = await focusSession(session)
        try {
          await getSessionController(session).bringToFront()
        } catch {
          // ignore
        }
        json(res, 200, {
          ok: true,
          focused: result.focused,
          method: result.method,
          session: publicSessionView(session),
        })
        return
      }

      if (req.method === "GET" && op === "screenshot") {
        // Emergency fallback only — live UI uses WS screencast.
        const shot = await captureSessionScreenshot(session)
        json(res, 200, {
          ok: true,
          mimeType: shot.mimeType,
          data: shot.base64,
          url: shot.url,
          title: shot.title,
          session: publicSessionView(session),
          deprecated: true,
        })
        return
      }

      if (req.method === "POST" && op === "stop") {
        await disposeSessionController(session.id)
        await stopSession(session)
        sessions.delete(session.id)
        metrics.push({
          event: "session_stop",
          sessionId: session.id,
          at: new Date().toISOString(),
        })
        json(res, 200, { ok: true, stopped: true })
        return
      }
    }

    json(res, 404, { ok: false, error: "Not found" })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    json(res, 500, { ok: false, error: message })
  }
}

const server = createServer((req, res) => {
  void handle(req, res)
})

attachBrowserStreamServer({
  server,
  getSession: (id) => sessions.get(id),
  isAuthorized: (req, url) => authorizeRequest(req, url),
  isOriginAllowed,
})

server.listen(PORT, HOST, () => {
  console.log("")
  console.log("Articulate Browser Helper")
  console.log("─────────────────────────────────────")
  console.log(`Listening:  http://${HOST}:${PORT}`)
  console.log(`Bind:       loopback only (${HOST})`)
  console.log(`Device:     ${device.deviceId}`)
  console.log(`Platform:   ${device.platform}`)
  console.log(`Key store:  ${deviceStorageNote()}`)
  console.log(`Auth:       short-lived JWT (EdDSA)`)
  console.log(`Legacy:     ${LEGACY_TOKEN_ENABLED ? "ENABLED" : "disabled"}`)
  console.log(`JWKS:       ${JWKS_URL}`)
  console.log(`Origins:    ${Array.from(ALLOWED_ORIGINS).join(", ")}`)
  console.log("")
  console.log("Mode: headless CDP by default + sharp JPEG pump (Open in Chrome → headed)")
  console.log("Profiles:   ~/.articulate/browser-profiles/<key>")
  console.log("LLM keys:   NEVER stored in this helper")
  console.log("Cloud API:  unused")
  console.log("")
  console.log("Health:     GET  /health")
  console.log("Pair:       POST /v1/pairing/attest")
  console.log("Start:      POST /v1/sessions  (Bearer short-lived JWT)")
  console.log("Stream:     WS   /v1/sessions/:id/stream?access_token=…")
  console.log("")
})

async function shutdown() {
  for (const session of sessions.values()) {
    try {
      await disposeSessionController(session.id)
      await stopSession(session)
    } catch {
      // ignore
    }
  }
  sessions.clear()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1500).unref()
}

process.on("SIGINT", () => {
  void shutdown()
})
process.on("SIGTERM", () => {
  void shutdown()
})
