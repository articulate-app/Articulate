/**
 * Authenticated local WebSocket screencast transport.
 * Binary frame protocol (little-endian):
 *   u8  type = 1 (frame)
 *   f32 offsetTop, pageScaleFactor, deviceWidth, deviceHeight, scrollOffsetX, scrollOffsetY
 *   u32 jpegByteLength
 *   jpeg bytes
 *
 * Text/control messages are JSON UTF-8:
 *   { type: "hello" | "status" | "targets" | "error" | "control", ... }
 */

import type { IncomingMessage } from "node:http"
import { WebSocketServer, WebSocket } from "ws"
import type { LocalBrowserSession } from "./chrome.js"
import {
  getSessionController,
  type ScreencastFrameEvent,
} from "./session-cdp.js"

const FRAME_TYPE = 1

export function encodeFrameBinary(frame: ScreencastFrameEvent): Buffer {
  const header = Buffer.alloc(1 + 6 * 4 + 4)
  let offset = 0
  header.writeUInt8(FRAME_TYPE, offset)
  offset += 1
  header.writeFloatLE(frame.meta.offsetTop || 0, offset)
  offset += 4
  header.writeFloatLE(frame.meta.pageScaleFactor || 1, offset)
  offset += 4
  header.writeFloatLE(frame.meta.deviceWidth || 0, offset)
  offset += 4
  header.writeFloatLE(frame.meta.deviceHeight || 0, offset)
  offset += 4
  header.writeFloatLE(frame.meta.scrollOffsetX || 0, offset)
  offset += 4
  header.writeFloatLE(frame.meta.scrollOffsetY || 0, offset)
  offset += 4
  header.writeUInt32LE(frame.jpeg.byteLength, offset)
  return Buffer.concat([header, frame.jpeg])
}

export function decodeFrameHeader(buf: Buffer): {
  offsetTop: number
  pageScaleFactor: number
  deviceWidth: number
  deviceHeight: number
  scrollOffsetX: number
  scrollOffsetY: number
  jpegOffset: number
  jpegLength: number
} | null {
  if (buf.byteLength < 1 + 6 * 4 + 4) return null
  if (buf.readUInt8(0) !== FRAME_TYPE) return null
  let offset = 1
  const offsetTop = buf.readFloatLE(offset)
  offset += 4
  const pageScaleFactor = buf.readFloatLE(offset)
  offset += 4
  const deviceWidth = buf.readFloatLE(offset)
  offset += 4
  const deviceHeight = buf.readFloatLE(offset)
  offset += 4
  const scrollOffsetX = buf.readFloatLE(offset)
  offset += 4
  const scrollOffsetY = buf.readFloatLE(offset)
  offset += 4
  const jpegLength = buf.readUInt32LE(offset)
  offset += 4
  return {
    offsetTop,
    pageScaleFactor,
    deviceWidth,
    deviceHeight,
    scrollOffsetX,
    scrollOffsetY,
    jpegOffset: offset,
    jpegLength,
  }
}

function sendJson(ws: WebSocket, body: unknown) {
  if (ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify(body))
}

export type AttachStreamServerOptions = {
  server: import("node:http").Server
  getSession: (id: string) => LocalBrowserSession | undefined
  isAuthorized: (req: IncomingMessage, url: URL) => boolean | Promise<boolean>
  isOriginAllowed: (origin: string | undefined) => boolean
}

/**
 * Upgrade path: GET /v1/sessions/:id/stream?access_token=…
 * Prefer Authorization header; query token is accepted for browser WS only (short-lived).
 */
export function attachBrowserStreamServer(options: AttachStreamServerOptions) {
  const wss = new WebSocketServer({ noServer: true })

  options.server.on("upgrade", (req, socket, head) => {
    void (async () => {
      try {
        const host = req.headers.host || "127.0.0.1"
        const url = new URL(req.url || "/", `http://${host}`)
        const match = /^\/v1\/sessions\/([^/]+)\/stream$/.exec(url.pathname)
        if (!match) {
          socket.write("HTTP/1.1 404 Not Found\r\n\r\n")
          socket.destroy()
          return
        }
        const origin = req.headers.origin
        if (origin && !options.isOriginAllowed(origin)) {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n")
          socket.destroy()
          return
        }
        const allowed = await options.isAuthorized(req, url)
        if (!allowed) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
          socket.destroy()
          return
        }
        const sessionId = decodeURIComponent(match[1] || "")
        const session = options.getSession(sessionId)
        if (!session || session.status !== "active") {
          socket.write("HTTP/1.1 404 Not Found\r\n\r\n")
          socket.destroy()
          return
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
          void handleStreamSocket(ws, session)
        })
      } catch {
        try {
          socket.destroy()
        } catch {
          // ignore
        }
      }
    })()
  })

  return wss
}

async function handleStreamSocket(ws: WebSocket, session: LocalBrowserSession) {
  const controller = getSessionController(session)
  let closed = false
  let framesSent = 0
  let framesDropped = 0
  let lastSentAt = 0
  let pendingLatest: ScreencastFrameEvent | null = null
  let flushScheduled = false

  const flush = () => {
    flushScheduled = false
    if (closed || !pendingLatest) return
    if (ws.readyState !== WebSocket.OPEN) return
    const frame = pendingLatest
    pendingLatest = null
    try {
      ws.send(encodeFrameBinary(frame), { binary: true })
      framesSent += 1
      lastSentAt = Date.now()
    } catch {
      // ignore send errors
    }
  }

  const onFrame = (frame: ScreencastFrameEvent) => {
    if (closed) return
    if (pendingLatest) framesDropped += 1
    pendingLatest = frame
    // Coalesce to one outbound frame per event-loop turn for latency over completeness.
    if (!flushScheduled) {
      flushScheduled = true
      queueMicrotask(flush)
    }
  }

  const onCdpClosed = () => {
    sendJson(ws, { type: "status", connected: false, reason: "cdp_closed" })
  }

  try {
    await controller.addSubscriber()
    const nav = await controller.getNavigationState()
    const targets = await controller.listTargets()
    sendJson(ws, {
      type: "hello",
      sessionId: session.id,
      url: nav.url,
      title: nav.title,
      canGoBack: nav.canGoBack,
      canGoForward: nav.canGoForward,
      targets,
      viewport: controller.currentViewport,
    })
    if (controller.lastFrame) onFrame(controller.lastFrame)
    controller.on("frame", onFrame)
    controller.on("cdp_closed", onCdpClosed)
  } catch (error) {
    sendJson(ws, {
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    })
    ws.close()
    return
  }

  ws.on("message", (raw) => {
    void (async () => {
      try {
        const text = typeof raw === "string" ? raw : raw.toString("utf8")
        const msg = JSON.parse(text) as Record<string, unknown>
        const type = String(msg.type || "")
        if (type === "ping") {
          sendJson(ws, { type: "pong", t: Date.now() })
          return
        }
        if (type === "stats") {
          sendJson(ws, {
            type: "stats",
            framesSent,
            framesDropped,
            lastSentAt,
            lagMs: lastSentAt ? Date.now() - lastSentAt : null,
          })
          return
        }
        if (type === "viewport") {
          const width = Number(msg.width)
          const height = Number(msg.height)
          const deviceScaleFactor =
            msg.deviceScaleFactor === undefined ? undefined : Number(msg.deviceScaleFactor)
          if (Number.isFinite(width) && Number.isFinite(height)) {
            await controller.setViewport(width, height, {
              deviceScaleFactor: Number.isFinite(deviceScaleFactor)
                ? deviceScaleFactor
                : undefined,
            })
            sendJson(ws, {
              type: "status",
              viewport: controller.currentViewport,
              diagnostics: controller.screencastDiagnostics,
            })
          }
          return
        }
        if (type === "switch_target") {
          const targetId = String(msg.targetId || "")
          if (targetId) {
            await controller.switchTarget(targetId)
            const nav = await controller.getNavigationState()
            const targets = await controller.listTargets()
            sendJson(ws, {
              type: "status",
              url: nav.url,
              title: nav.title,
              targets,
            })
          }
          return
        }
      } catch {
        // ignore malformed client messages
      }
    })()
  })

  const cleanup = async () => {
    if (closed) return
    closed = true
    controller.off("frame", onFrame)
    controller.off("cdp_closed", onCdpClosed)
    await controller.removeSubscriber()
  }

  ws.on("close", () => {
    void cleanup()
  })
  ws.on("error", () => {
    void cleanup()
  })
}
