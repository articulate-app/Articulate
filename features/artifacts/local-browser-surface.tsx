"use client"

/**
 * Live interactive local Chrome surface via Bridge CDP screencast + Input APIs.
 * Stream path: Chrome ↔ Local Bridge WS ↔ this canvas (never Cloud / Supabase / LLM).
 */

import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react"
import { Loader2 } from "lucide-react"
import {
  getBridgeNavState,
  getBridgeStreamUrl,
  listBridgeTargets,
  navigateBridgeLocal,
  postBridgeInput,
  refreshBridgeSession,
  switchBridgeTarget,
  type BridgePageTarget,
} from "../../app/lib/local-browser-bridge"
import { getLocalBrowserAccessToken } from "../../app/lib/browser-helper-client"
import { bumpLocalBrowserHumanControl } from "../../app/lib/local-browser-agent-control"
import {
  fitContentRect,
  mapDisplayToBrowser,
  normalizeBrowserUrl,
  type ScreencastViewportMeta,
} from "../../app/lib/browser-coordinate"
import { BrowserChromeBar } from "./browser-chrome-bar"
import { Button } from "../../app/components/ui/button"
import { cn } from "../../app/lib/utils"

const FRAME_HEADER_BYTES = 1 + 6 * 4 + 4
const RESIZE_DEBOUNCE_MS = 180
const MIN_VIEWPORT_W = 320
const MIN_VIEWPORT_H = 240

type ControlOwner = "human" | "agent"

export type LocalBrowserSurfaceProps = {
  sessionId: string
  className?: string
  /** When false, render frames but ignore pointer/keyboard (AI mini-preview). */
  interactive?: boolean
  showToolbar?: boolean
  showPageTabs?: boolean
  showDiagnostics?: boolean
  /** Prefer lower quality path for compact previews (still live CDP stream). */
  previewMode?: boolean
  initialControl?: ControlOwner
  onControlChange?: (owner: ControlOwner) => void
  onNavigation?: (info: {
    url: string
    title?: string
    canGoBack?: boolean
    canGoForward?: boolean
  }) => void
  onOpenInChrome?: () => void
  onStop?: () => void
  onContinueWithAgent?: () => void
  /** Called when the Bridge session no longer exists (helper restart, crash, etc.). */
  onSessionLost?: () => void
}

type StreamDiagnostics = {
  connected: boolean
  fps: number
  latencyMs: number | null
  viewport: { width: number; height: number } | null
  framePixels: { width: number; height: number } | null
  dropped: number
  targetTitle: string | null
}

function decodeFrame(buf: ArrayBuffer): {
  meta: ScreencastViewportMeta
  jpeg: Uint8Array
} | null {
  if (buf.byteLength < FRAME_HEADER_BYTES) return null
  const view = new DataView(buf)
  if (view.getUint8(0) !== 1) return null
  let o = 1
  const offsetTop = view.getFloat32(o, true)
  o += 4
  const pageScaleFactor = view.getFloat32(o, true)
  o += 4
  const deviceWidth = view.getFloat32(o, true)
  o += 4
  const deviceHeight = view.getFloat32(o, true)
  o += 4
  const scrollOffsetX = view.getFloat32(o, true)
  o += 4
  const scrollOffsetY = view.getFloat32(o, true)
  o += 4
  const jpegLength = view.getUint32(o, true)
  o += 4
  if (o + jpegLength > buf.byteLength) return null
  return {
    meta: {
      offsetTop,
      pageScaleFactor,
      deviceWidth,
      deviceHeight,
      scrollOffsetX,
      scrollOffsetY,
    },
    jpeg: new Uint8Array(buf, o, jpegLength),
  }
}

function cdpModifiers(event: {
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}): number {
  let mod = 0
  if (event.altKey) mod |= 1
  if (event.ctrlKey) mod |= 2
  if (event.metaKey) mod |= 4
  if (event.shiftKey) mod |= 8
  return mod
}

function mouseButton(button: number): "none" | "left" | "middle" | "right" {
  if (button === 1) return "middle"
  if (button === 2) return "right"
  if (button === 0) return "left"
  return "none"
}

function mouseButtonsMask(buttons: number): number {
  // DOM buttons bitfield ≈ CDP buttons (1=left, 2=right, 4=middle).
  return buttons & 7
}

export function LocalBrowserSurface({
  sessionId,
  className,
  interactive = true,
  showToolbar = true,
  showPageTabs = true,
  showDiagnostics = process.env.NODE_ENV === "development",
  previewMode = false,
  initialControl = "human",
  onControlChange,
  onNavigation,
  onOpenInChrome,
  onStop,
  onContinueWithAgent,
  onSessionLost,
}: LocalBrowserSurfaceProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const metaRef = useRef<ScreencastViewportMeta>({
    deviceWidth: 1280,
    deviceHeight: 720,
    pageScaleFactor: 1,
  })
  const bitmapRef = useRef<ImageBitmap | null>(null)
  const lastViewportSentRef = useRef<{ w: number; h: number; dpr: number } | null>(null)
  const resizeTimerRef = useRef<number | null>(null)
  const frameTimesRef = useRef<number[]>([])
  const pendingInputRef = useRef<Promise<void>>(Promise.resolve())
  const controlRef = useRef<ControlOwner>(initialControl)
  const pointerButtonsRef = useRef(0)
  const latestMoveRef = useRef<Record<string, unknown> | null>(null)
  const moveFlushActiveRef = useRef(false)

  const sessionLostRef = useRef(false)
  const onSessionLostRef = useRef(onSessionLost)
  onSessionLostRef.current = onSessionLost

  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectHint, setConnectHint] = useState("Authorizing…")
  const [navUrl, setNavUrl] = useState("")
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [navBusy, setNavBusy] = useState(false)
  const [targets, setTargets] = useState<BridgePageTarget[]>([])
  const [control, setControl] = useState<ControlOwner>(initialControl)
  const [diagnostics, setDiagnostics] = useState<StreamDiagnostics>({
    connected: false,
    fps: 0,
    latencyMs: null,
    viewport: null,
    framePixels: null,
    dropped: 0,
    targetTitle: null,
  })
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const urlBarEditingRef = useRef(false)

  controlRef.current = control

  useEffect(() => {
    let cancelled = false
    sessionLostRef.current = false
    setConnectHint("Authorizing…")
    void (async () => {
      try {
        const token = await getLocalBrowserAccessToken()
        if (cancelled) return
        setAccessToken(token)
        setConnectHint("Checking session…")
        try {
          await refreshBridgeSession(token, sessionId)
        } catch (err) {
          if (cancelled || sessionLostRef.current) return
          const message = err instanceof Error ? err.message : String(err)
          if (/not found|404|no such session|unknown session|bridge http 404/i.test(message)) {
            sessionLostRef.current = true
            setError("Browser session ended. Restarting…")
            setConnectHint("Restarting…")
            onSessionLostRef.current?.()
            return
          }
          // Soft failure — still try the stream.
        }
        if (!cancelled) setConnectHint("Connecting…")
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not authorize local browser")
          setConnectHint("Authorization failed")
        }
      }
    })()
    const refresh = window.setInterval(() => {
      void getLocalBrowserAccessToken()
        .then((token) => {
          if (!cancelled) setAccessToken(token)
        })
        .catch(() => undefined)
    }, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(refresh)
    }
  }, [sessionId])

  const token = accessToken

  const claimHuman = () => {
    bumpLocalBrowserHumanControl()
    if (controlRef.current === "human") return
    setControl("human")
    onControlChange?.("human")
  }

  const queueInput = (fn: () => Promise<void>) => {
    pendingInputRef.current = pendingInputRef.current
      .then(fn)
      .catch(() => undefined)
    return pendingInputRef.current
  }

  const paint = () => {
    const canvas = canvasRef.current
    const host = hostRef.current
    const bitmap = bitmapRef.current
    if (!canvas || !host || !bitmap) return
    const rect = host.getBoundingClientRect()
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const cssW = Math.max(1, Math.round(rect.width))
    const cssH = Math.max(1, Math.round(rect.height))
    const pixelW = Math.round(cssW * dpr)
    const pixelH = Math.round(cssH * dpr)
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW
      canvas.height = pixelH
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
    }
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const meta = metaRef.current
    const fit = fitContentRect(
      { width: cssW, height: cssH },
      meta.deviceWidth || bitmap.width / dpr,
      meta.deviceHeight || bitmap.height / dpr,
    )
    // Draw in device pixels so a DPR-sized frame maps 1:1 onto the backing store
    // (never: CSS-sized frame → upscale to canvas).
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = "#f3f4f6"
    ctx.fillRect(0, 0, pixelW, pixelH)
    const destX = fit.x * dpr
    const destY = fit.y * dpr
    const destW = fit.width * dpr
    const destH = fit.height * dpr
    const nearOneToOne =
      Math.abs(bitmap.width - destW) <= 2 && Math.abs(bitmap.height - destH) <= 2
    ctx.imageSmoothingEnabled = !nearOneToOne
    if (!nearOneToOne) ctx.imageSmoothingQuality = "high"
    ctx.drawImage(bitmap, destX, destY, destW, destH)
  }

  // WebSocket screencast
  useEffect(() => {
    if (!sessionId || !token) {
      return
    }
    if (sessionLostRef.current) return
    let cancelled = false
    let reconnectTimer: number | null = null
    let pingTimer: number | null = null
    let attempt = 0

    const markSessionLost = (reason: string) => {
      if (sessionLostRef.current || cancelled) return
      sessionLostRef.current = true
      setError(reason)
      setConnectHint("Restarting…")
      setConnected(false)
      onSessionLostRef.current?.()
    }

    const connect = () => {
      if (cancelled || sessionLostRef.current) return
      setConnectHint(attempt > 0 ? "Reconnecting…" : "Connecting…")
      const url = getBridgeStreamUrl(sessionId, token)
      const ws = new WebSocket(url)
      ws.binaryType = "arraybuffer"
      wsRef.current = ws

      ws.onopen = () => {
        attempt = 0
        setConnected(true)
        setError(null)
        setConnectHint("Live")
        setDiagnostics((d) => ({ ...d, connected: true }))
        // Push CSS×DPR viewport immediately so frames are Retina-sharp from the first paints.
        const host = hostRef.current
        if (host) {
          const rect = host.getBoundingClientRect()
          const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3))
          if (rect.width >= 40 && rect.height >= 40) {
            lastViewportSentRef.current = {
              w: Math.round(rect.width),
              h: Math.round(rect.height),
              dpr,
            }
            ws.send(
              JSON.stringify({
                type: "viewport",
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                deviceScaleFactor: dpr,
              }),
            )
          }
        }
        pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }))
          }
        }, 10_000)
      }

      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          try {
            const msg = JSON.parse(event.data) as Record<string, unknown>
            if (msg.type === "hello" || msg.type === "status") {
              if (typeof msg.url === "string" && !urlBarEditingRef.current) {
                setNavUrl(msg.url)
              }
              if (typeof msg.canGoBack === "boolean") setCanGoBack(msg.canGoBack)
              if (typeof msg.canGoForward === "boolean") setCanGoForward(msg.canGoForward)
              if (Array.isArray(msg.targets)) {
                setTargets(msg.targets as BridgePageTarget[])
              }
              if (msg.viewport && typeof msg.viewport === "object") {
                const vp = msg.viewport as { width?: number; height?: number }
                if (vp.width && vp.height) {
                  setDiagnostics((d) => ({
                    ...d,
                    viewport: { width: vp.width!, height: vp.height! },
                  }))
                }
              }
              if (typeof msg.url === "string") {
                onNavigation?.({
                  url: msg.url,
                  title: typeof msg.title === "string" ? msg.title : undefined,
                  canGoBack: typeof msg.canGoBack === "boolean" ? msg.canGoBack : undefined,
                  canGoForward:
                    typeof msg.canGoForward === "boolean" ? msg.canGoForward : undefined,
                })
              }
            }
            if (msg.type === "pong" && typeof msg.t === "number") {
              const latency = Math.max(0, Date.now() - msg.t)
              setDiagnostics((d) => ({ ...d, latencyMs: latency }))
            }
            if (msg.type === "error" && typeof msg.message === "string") {
              const message = msg.message
              if (/not found|no page|no session|cdp/i.test(message) && attempt >= 2) {
                markSessionLost(message)
                return
              }
              setError(message)
            }
          } catch {
            // ignore
          }
          return
        }

        const decoded = decodeFrame(event.data as ArrayBuffer)
        if (!decoded) return
        metaRef.current = decoded.meta
        const blob = new Blob([decoded.jpeg], { type: "image/jpeg" })
        void createImageBitmap(blob).then((bitmap) => {
          if (cancelled) {
            bitmap.close()
            return
          }
          bitmapRef.current?.close()
          bitmapRef.current = bitmap
          const now = performance.now()
          frameTimesRef.current.push(now)
          frameTimesRef.current = frameTimesRef.current.filter((t) => now - t < 1000)
          setDiagnostics((d) => ({
            ...d,
            fps: frameTimesRef.current.length,
            viewport: {
              width: Math.round(decoded.meta.deviceWidth),
              height: Math.round(decoded.meta.deviceHeight),
            },
            framePixels: {
              width: bitmap.width,
              height: bitmap.height,
            },
          }))
          paint()
        })
      }

      ws.onclose = (ev) => {
        setConnected(false)
        setDiagnostics((d) => ({ ...d, connected: false }))
        if (pingTimer != null) window.clearInterval(pingTimer)
        if (cancelled || sessionLostRef.current) return
        // 1006/1008 after never opening usually means 401/403/404 on upgrade.
        attempt += 1
        if (attempt >= 4) {
          markSessionLost(
            ev.code === 1006
              ? "Could not reach the local browser session (it may have ended)."
              : `Stream closed (${ev.code}). Restarting session…`,
          )
          return
        }
        const delay = Math.min(8_000, 400 * 2 ** Math.min(attempt, 4))
        reconnectTimer = window.setTimeout(connect, delay)
      }

      ws.onerror = () => {
        // onclose handles reconnect
      }
    }

    connect()
    return () => {
      cancelled = true
      if (reconnectTimer != null) window.clearTimeout(reconnectTimer)
      if (pingTimer != null) window.clearInterval(pingTimer)
      wsRef.current?.close()
      wsRef.current = null
      bitmapRef.current?.close()
      bitmapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- session reconnect only
  }, [sessionId, token])

  // Pane → Chrome viewport (Local only). Skip for non-interactive mini-previews
  // so a chat card does not shrink the shared session viewport.
  useEffect(() => {
    const host = hostRef.current
    if (!host || !token || !sessionId) return
    if (!interactive || previewMode) return
    if (typeof ResizeObserver === "undefined") return

    const sendViewport = (width: number, height: number) => {
      const w = Math.max(MIN_VIEWPORT_W, Math.round(width))
      const h = Math.max(MIN_VIEWPORT_H, Math.round(height))
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3))
      const prev = lastViewportSentRef.current
      if (
        prev &&
        Math.abs(prev.w - w) < 8 &&
        Math.abs(prev.h - h) < 8 &&
        Math.abs(prev.dpr - dpr) < 0.05
      ) {
        return
      }
      lastViewportSentRef.current = { w, h, dpr }
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "viewport",
            width: w,
            height: h,
            deviceScaleFactor: dpr,
          }),
        )
      }
    }

    const schedule = () => {
      if (resizeTimerRef.current != null) window.clearTimeout(resizeTimerRef.current)
      resizeTimerRef.current = window.setTimeout(() => {
        const rect = host.getBoundingClientRect()
        if (rect.width < 40 || rect.height < 40) return
        sendViewport(rect.width, rect.height)
        paint()
      }, RESIZE_DEBOUNCE_MS)
    }

    schedule()
    const observer = new ResizeObserver(() => schedule())
    observer.observe(host)
    return () => {
      observer.disconnect()
      if (resizeTimerRef.current != null) window.clearTimeout(resizeTimerRef.current)
    }
  }, [sessionId, token, connected, interactive, previewMode])

  // Refresh nav/targets periodically (lightweight HTTP)
  useEffect(() => {
    if (!sessionId || !token || !connected) return
    let cancelled = false
    const tick = async () => {
      try {
        const [nav, pageTargets] = await Promise.all([
          getBridgeNavState(token, sessionId),
          listBridgeTargets(token, sessionId),
        ])
        if (cancelled) return
        if (!urlBarEditingRef.current && nav.url) setNavUrl(nav.url)
        setCanGoBack(Boolean(nav.canGoBack))
        setCanGoForward(Boolean(nav.canGoForward))
        setTargets(pageTargets)
        const active = pageTargets.find((t) => t.active)
        setDiagnostics((d) => ({
          ...d,
          targetTitle: active?.title || active?.url || null,
        }))
        onNavigation?.({
          url: nav.url,
          title: nav.title,
          canGoBack: nav.canGoBack,
          canGoForward: nav.canGoForward,
        })
      } catch {
        // ignore
      }
    }
    void tick()
    const interval = window.setInterval(() => void tick(), previewMode ? 4000 : 2500)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [connected, onNavigation, previewMode, sessionId, token])

  const mapEvent = (clientX: number, clientY: number) => {
    const host = hostRef.current
    if (!host) return null
    const rect = host.getBoundingClientRect()
    return mapDisplayToBrowser(
      clientX - rect.left,
      clientY - rect.top,
      { width: rect.width, height: rect.height },
      metaRef.current,
    )
  }

  const sendMouse = (
    type: "mousePressed" | "mouseReleased" | "mouseMoved" | "mouseWheel",
    point: { x: number; y: number },
    extra: Record<string, unknown> = {},
  ) => {
    if (!interactive || !token) return
    const payload = {
      kind: "mouse",
      type,
      x: point.x,
      y: point.y,
      ...extra,
    }

    // Coalesce moves so drag selection isn't serialized behind a long HTTP queue.
    if (type === "mouseMoved") {
      latestMoveRef.current = payload
      if (moveFlushActiveRef.current) return
      moveFlushActiveRef.current = true
      void (async () => {
        try {
          while (latestMoveRef.current && token) {
            const next = latestMoveRef.current
            latestMoveRef.current = null
            await postBridgeInput(token, sessionId, next)
          }
        } catch {
          // ignore
        } finally {
          moveFlushActiveRef.current = false
          // A move may have arrived after the last await and before finally.
          if (latestMoveRef.current) {
            sendMouse(
              "mouseMoved",
              {
                x: Number(latestMoveRef.current.x),
                y: Number(latestMoveRef.current.y),
              },
              {
                button: latestMoveRef.current.button,
                buttons: latestMoveRef.current.buttons,
                modifiers: latestMoveRef.current.modifiers,
              },
            )
          }
        }
      })()
      return
    }

    void queueInput(async () => {
      // Flush any pending move before press/release/wheel for ordering.
      if (latestMoveRef.current) {
        const next = latestMoveRef.current
        latestMoveRef.current = null
        await postBridgeInput(token, sessionId, next)
      }
      await postBridgeInput(token, sessionId, payload)
    })
  }

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return
    claimHuman()
    canvasRef.current?.focus()
    const mapped = mapEvent(event.clientX, event.clientY)
    if (!mapped?.inside) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    pointerButtonsRef.current = mouseButtonsMask(event.buttons || (1 << event.button))
    sendMouse("mousePressed", mapped, {
      button: mouseButton(event.button),
      buttons: pointerButtonsRef.current,
      clickCount: event.detail || 1,
      modifiers: cdpModifiers(event),
    })
  }

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return
    if (controlRef.current === "agent") claimHuman()
    const mapped = mapEvent(event.clientX, event.clientY)
    if (!mapped) return
    const buttons =
      event.buttons !== 0
        ? mouseButtonsMask(event.buttons)
        : pointerButtonsRef.current
    // While dragging, keep the pressed button identity for CDP text selection.
    const pressedButton =
      buttons & 1 ? "left" : buttons & 2 ? "right" : buttons & 4 ? "middle" : "none"
    sendMouse("mouseMoved", mapped, {
      button: pressedButton,
      buttons,
      modifiers: cdpModifiers(event),
    })
  }

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return
    claimHuman()
    const mapped = mapEvent(event.clientX, event.clientY)
    const point = mapped ?? { x: 0, y: 0, inside: false }
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      // ignore
    }
    const buttonsBefore = pointerButtonsRef.current
    pointerButtonsRef.current = mouseButtonsMask(event.buttons)
    sendMouse("mouseReleased", { x: point.x, y: point.y }, {
      button: mouseButton(event.button),
      buttons: pointerButtonsRef.current,
      clickCount: event.detail || 1,
      modifiers: cdpModifiers(event),
      // Ensure release still reports the button that was down.
      ...(buttonsBefore ? {} : {}),
    })
  }

  // Non-passive wheel: prevent the Articulate pane from scrolling/overscrolling.
  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !interactive) return

    const onWheelNative = (event: WheelEvent) => {
      if (!interactive) return
      event.preventDefault()
      event.stopPropagation()
      claimHuman()
      const mapped = mapEvent(event.clientX, event.clientY)
      if (!mapped) return
      sendMouse("mouseWheel", mapped, {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        modifiers: cdpModifiers(event),
      })
    }

    host.addEventListener("wheel", onWheelNative, { passive: false })
    canvas?.addEventListener("wheel", onWheelNative, { passive: false })
    return () => {
      host.removeEventListener("wheel", onWheelNative)
      canvas?.removeEventListener("wheel", onWheelNative)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bind once per session/token
  }, [interactive, sessionId, token, connected])

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (!interactive) return
    claimHuman()
    event.preventDefault()
    event.stopPropagation()
    if (!token) return

    const mods = cdpModifiers(event)
    const isPrintable =
      event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey

    void queueInput(async () => {
      if (isPrintable) {
        // Prefer insertText for Unicode / accented Portuguese characters.
        await postBridgeInput(token, sessionId, {
          kind: "insertText",
          text: event.key,
        })
        return
      }
      await postBridgeInput(token, sessionId, {
        kind: "key",
        type: "rawKeyDown",
        key: event.key,
        code: event.code,
        windowsVirtualKeyCode: event.keyCode || undefined,
        nativeVirtualKeyCode: event.keyCode || undefined,
        modifiers: mods,
        autoRepeat: event.repeat,
      })
      if (event.key === "Enter" || event.key === "Tab" || event.key === "Escape") {
        await postBridgeInput(token, sessionId, {
          kind: "key",
          type: "char",
          key: event.key,
          code: event.code,
          text: event.key === "Enter" ? "\r" : event.key === "Tab" ? "\t" : undefined,
          modifiers: mods,
        })
      }
    })
  }

  const onKeyUp = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (!interactive) return
    event.preventDefault()
    if (!token) return
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      return
    }
    void queueInput(() =>
      postBridgeInput(token, sessionId, {
        kind: "key",
        type: "keyUp",
        key: event.key,
        code: event.code,
        windowsVirtualKeyCode: event.keyCode || undefined,
        nativeVirtualKeyCode: event.keyCode || undefined,
        modifiers: cdpModifiers(event),
      }),
    )
  }

  const onPaste = (event: ClipboardEvent<HTMLCanvasElement>) => {
    if (!interactive) return
    claimHuman()
    const text = event.clipboardData?.getData("text/plain")
    if (!text || !token) return
    event.preventDefault()
    void queueInput(() =>
      postBridgeInput(token, sessionId, { kind: "insertText", text }),
    )
  }

  const runLocalNav = async (
    command: "back" | "forward" | "reload" | "navigate",
    url?: string,
  ) => {
    if (!token) return
    setNavBusy(true)
    try {
      const normalized = command === "navigate" ? normalizeBrowserUrl(url || "") : undefined
      await navigateBridgeLocal(token, sessionId, command, normalized)
      const nav = await getBridgeNavState(token, sessionId)
      if (!urlBarEditingRef.current) setNavUrl(nav.url)
      setCanGoBack(nav.canGoBack)
      setCanGoForward(nav.canGoForward)
      onNavigation?.({
        url: nav.url,
        title: nav.title,
        canGoBack: nav.canGoBack,
        canGoForward: nav.canGoForward,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Navigation failed")
    } finally {
      setNavBusy(false)
    }
  }

  const handleSwitchTarget = async (targetId: string) => {
    if (!token) return
    claimHuman()
    try {
      const next = await switchBridgeTarget(token, sessionId, targetId)
      setTargets(next)
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "switch_target", targetId }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch tab")
    }
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden bg-white overscroll-contain",
        className,
      )}
    >
      {showToolbar ? (
        <BrowserChromeBar
          url={navUrl}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          history={[]}
          disabled={!connected}
          busy={navBusy}
          onEditingChange={(isEditing) => {
            urlBarEditingRef.current = isEditing
          }}
          onSubmitUrl={(url) => void runLocalNav("navigate", url)}
          onBack={() => void runLocalNav("back")}
          onForward={() => void runLocalNav("forward")}
          onReload={() => void runLocalNav("reload")}
          onSelectHistory={() => undefined}
        />
      ) : null}

      {showPageTabs && targets.length > 1 ? (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 bg-gray-50 px-2 py-1">
          {targets.map((target) => (
            <button
              key={target.id}
              type="button"
              onClick={() => void handleSwitchTarget(target.id)}
              className={cn(
                "max-w-[160px] truncate rounded-md px-2 py-1 text-[11px]",
                target.active
                  ? "bg-white font-medium text-gray-900 shadow-sm"
                  : "text-gray-600 hover:bg-white/70",
              )}
              title={target.url}
            >
              {target.title || target.url || "Tab"}
            </button>
          ))}
        </div>
      ) : null}

      <div
        ref={hostRef}
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden overscroll-contain bg-gray-100"
        data-local-browser-surface=""
        style={{ overscrollBehavior: "contain", touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          tabIndex={interactive ? 0 : -1}
          className={cn(
            "absolute inset-0 h-full w-full outline-none",
            interactive ? "cursor-default" : "pointer-events-none",
          )}
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onPaste={onPaste}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Local browser surface"
        />

        {!connected && !bitmapRef.current ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            <p className="text-xs text-gray-600">{connectHint || "Connecting to local browser…"}</p>
            {error ? <p className="max-w-sm text-xs text-red-600">{error}</p> : null}
          </div>
        ) : null}

        {interactive && control === "human" ? (
          <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-2">
            <span className="rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">
              You have control
            </span>
          </div>
        ) : null}

        {interactive && control === "human" && onContinueWithAgent ? (
          <div className="absolute right-2 top-2 z-10">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 pointer-events-auto text-[11px]"
              onClick={() => {
                setControl("agent")
                onControlChange?.("agent")
                onContinueWithAgent()
              }}
            >
              Continue with agent
            </Button>
          </div>
        ) : null}
      </div>

      {previewMode ? null : (
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-3 py-1.5">
        <div className="min-w-0 text-[11px] text-gray-500">
          <span className="uppercase tracking-wide">Browser: Local</span>
          {connected ? (
            <span className="ml-2 text-emerald-700">Live</span>
          ) : (
            <span className="ml-2 text-amber-700">Reconnecting…</span>
          )}
          {showDiagnostics ? (
            <span className="ml-2 font-mono text-[10px] text-gray-400">
              {diagnostics.fps}fps
              {diagnostics.latencyMs != null ? ` · ${diagnostics.latencyMs}ms` : ""}
              {diagnostics.viewport
                ? ` · css ${diagnostics.viewport.width}×${diagnostics.viewport.height}`
                : ""}
              {diagnostics.framePixels
                ? ` · frame ${diagnostics.framePixels.width}×${diagnostics.framePixels.height}`
                : ""}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {onOpenInChrome ? (
            <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={onOpenInChrome}>
              Open in Chrome
            </Button>
          ) : null}
          {onStop ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] text-red-700"
              onClick={onStop}
            >
              Stop
            </Button>
          ) : null}
        </div>
      </div>
      )}
    </div>
  )
}
