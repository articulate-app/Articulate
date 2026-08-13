/**
 * Persistent per-session CDP controller: screencast, input, viewport, targets.
 */

import { EventEmitter } from "node:events"
import type { LocalBrowserSession } from "./chrome.js"
import { listPageTargets, refreshSessionMeta } from "./chrome.js"
import { CdpClient } from "./cdp-client.js"

export type ScreencastFrameMeta = {
  offsetTop: number
  offsetLeft?: number
  pageScaleFactor: number
  deviceWidth: number
  deviceHeight: number
  scrollOffsetX: number
  scrollOffsetY: number
  timestamp?: number
}

export type ScreencastFrameEvent = {
  jpeg: Buffer
  meta: ScreencastFrameMeta
  sessionId: number
  receivedAt: number
}

export type PageTargetInfo = {
  id: string
  title: string
  url: string
  type: string
  active: boolean
}

type CdpTarget = {
  id?: string
  type?: string
  url?: string
  title?: string
  webSocketDebuggerUrl?: string
}

export class SessionCdpController extends EventEmitter {
  private client: CdpClient | null = null
  private targetId: string | null = null
  private screencastActive = false
  private latestFrame: ScreencastFrameEvent | null = null
  private subscribers = 0
  private closed = false
  private viewport: { width: number; height: number } | null = null
  private deviceScaleFactor = 1
  private lastScreencastConfig: {
    maxWidth: number
    maxHeight: number
    quality: number
    format: string
    scale: number
    mode: "screenshot_pump" | "cdp_screencast"
  } | null = null
  private pumpTimer: ReturnType<typeof setInterval> | null = null
  private pumpInFlight = false
  private lastFramePixelSize: { width: number; height: number } | null = null
  /** JPEG quality for text-heavy CMS surfaces (localhost — prefer clarity). */
  private frameQuality = 88

  constructor(private readonly session: LocalBrowserSession) {
    super()
  }

  get activeTargetId(): string | null {
    return this.targetId
  }

  get lastFrame(): ScreencastFrameEvent | null {
    return this.latestFrame
  }

  get currentViewport(): { width: number; height: number } | null {
    return this.viewport
  }

  async ensureAttached(preferredTargetId?: string | null): Promise<void> {
    if (this.closed) throw new Error("Session CDP controller is closed")
    await refreshSessionMeta(this.session)
    const pages = await listPageTargets(this.session)
    if (!pages.length) throw new Error("No page targets available")

    let page: CdpTarget | undefined
    if (preferredTargetId) {
      page = pages.find((p) => p.id === preferredTargetId)
    }
    if (!page) {
      page = pages.find((p) => p.id === this.targetId) ?? pages[0]
    }
    if (!page?.webSocketDebuggerUrl || !page.id) {
      throw new Error("No CDP websocket for page target")
    }

    if (this.client?.isOpen && this.targetId === page.id) return

    await this.detachClient()
    this.targetId = page.id
    this.client = new CdpClient(page.webSocketDebuggerUrl)
    await this.client.connect()
    await this.client.send("Page.enable")
    await this.client.send("Runtime.enable")
    await this.client.send("DOM.enable").catch(() => undefined)
    await this.client.send("Network.enable").catch(() => undefined)
    await this.client.send("Input.setIgnoreInputEvents", { ignore: false }).catch(() => undefined)

    this.client.on("Page.screencastFrame", (params: unknown) => {
      void this.onScreencastFrame(params)
    })
    this.client.on("close", () => {
      this.screencastActive = false
      this.emit("cdp_closed")
    })
  }

  private async onScreencastFrame(params: unknown) {
    const frame = params as {
      data?: string
      sessionId?: number
      metadata?: ScreencastFrameMeta
    }
    const sessionId = typeof frame.sessionId === "number" ? frame.sessionId : -1
    // Ack immediately — Chrome pauses the stream until ack arrives.
    if (this.client && sessionId >= 0) {
      void this.client
        .send("Page.screencastFrameAck", { sessionId })
        .catch(() => undefined)
    }
    if (!frame.data || !frame.metadata) return
    let jpeg: Buffer
    try {
      jpeg = Buffer.from(frame.data, "base64")
    } catch {
      return
    }
    const event: ScreencastFrameEvent = {
      jpeg,
      meta: {
        offsetTop: Number(frame.metadata.offsetTop) || 0,
        offsetLeft: Number(frame.metadata.offsetLeft) || 0,
        pageScaleFactor: Number(frame.metadata.pageScaleFactor) || 1,
        deviceWidth: Number(frame.metadata.deviceWidth) || 0,
        deviceHeight: Number(frame.metadata.deviceHeight) || 0,
        scrollOffsetX: Number(frame.metadata.scrollOffsetX) || 0,
        scrollOffsetY: Number(frame.metadata.scrollOffsetY) || 0,
        timestamp: frame.metadata.timestamp,
      },
      sessionId,
      receivedAt: Date.now(),
    }
    // Keep only the newest frame — drop stale ones intentionally.
    this.latestFrame = event
    this.emit("frame", event)
  }

  async addSubscriber(opts?: { maxWidth?: number; maxHeight?: number }): Promise<void> {
    this.subscribers += 1
    await this.ensureAttached()
    if (!this.screencastActive) {
      await this.startScreencast(opts)
    }
  }

  async removeSubscriber(): Promise<void> {
    this.subscribers = Math.max(0, this.subscribers - 1)
    if (this.subscribers === 0 && this.screencastActive) {
      await this.stopScreencast()
    }
  }

  async startScreencast(opts?: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
    format?: "jpeg" | "png"
  }): Promise<void> {
    await this.ensureAttached()
    if (!this.client) throw new Error("CDP not attached")

    const scale = this.deviceScaleFactor || 1
    const cssW = opts?.maxWidth ?? this.viewport?.width ?? 1280
    const cssH = opts?.maxHeight ?? this.viewport?.height ?? 900
    // CDP Page.startScreencast only delivers CSS-resolution frames even when
    // deviceScaleFactor > 1. Page.captureScreenshot(fromSurface) returns true
    // device pixels — required for Retina sharpness.
    const maxWidth = Math.max(320, Math.min(Math.round(cssW * scale), 3840))
    const maxHeight = Math.max(240, Math.min(Math.round(cssH * scale), 3840))
    const format = opts?.format ?? "jpeg"
    const quality = Math.max(50, Math.min(opts?.quality ?? this.frameQuality, 95))
    this.frameQuality = quality
    this.lastScreencastConfig = {
      maxWidth,
      maxHeight,
      quality,
      format,
      scale,
      mode: "screenshot_pump",
    }

    await this.stopPump()
    // Stop any legacy CDP screencast if it was left running.
    try {
      await this.client.send("Page.stopScreencast")
    } catch {
      // ignore
    }

    this.screencastActive = true
    // Do not block stream subscribe on the first capture (can stall briefly
    // while headless compositor warms up).
    void this.captureSharpFrame()
    // ~20 fps target; capture itself is ~40–70ms on localhost.
    this.pumpTimer = setInterval(() => {
      void this.captureSharpFrame()
    }, 50)
  }

  private async stopPump(): Promise<void> {
    if (this.pumpTimer) {
      clearInterval(this.pumpTimer)
      this.pumpTimer = null
    }
    this.pumpInFlight = false
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      promise.then(
        (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        (error) => {
          clearTimeout(timer)
          reject(error)
        },
      )
    })
  }

  /**
   * Capture a device-pixel JPEG and emit it on the same frame channel as screencast.
   * Meta deviceWidth/Height stay in CSS px so input mapping remains correct.
   */
  private async captureSharpFrame(): Promise<void> {
    if (!this.screencastActive || this.closed || !this.client) return
    if (this.subscribers <= 0) return
    if (this.pumpInFlight) return
    this.pumpInFlight = true
    try {
      const quality = this.frameQuality
      let result: { data: string } | null = null
      try {
        result = await this.withTimeout(
          this.client.send<{ data: string }>("Page.captureScreenshot", {
            format: "jpeg",
            quality,
            fromSurface: true,
          }),
          2500,
          "captureScreenshot(fromSurface)",
        )
      } catch {
        // Fallback: still device-aware via Emulation metrics, slightly different path.
        result = await this.withTimeout(
          this.client.send<{ data: string }>("Page.captureScreenshot", {
            format: "jpeg",
            quality,
            fromSurface: false,
          }),
          2500,
          "captureScreenshot",
        )
      }
      if (!result?.data) return
      let jpeg: Buffer
      try {
        jpeg = Buffer.from(result.data, "base64")
      } catch {
        return
      }
      const cssW = this.viewport?.width ?? 1280
      const cssH = this.viewport?.height ?? 900
      // Parse JPEG SOF for diagnostics (actual delivered pixels).
      let pixelW = 0
      let pixelH = 0
      for (let i = 0; i < Math.min(jpeg.length - 9, 512); i++) {
        if (jpeg[i] === 0xff && (jpeg[i + 1] === 0xc0 || jpeg[i + 1] === 0xc2)) {
          pixelH = (jpeg[i + 5] << 8) | jpeg[i + 6]
          pixelW = (jpeg[i + 7] << 8) | jpeg[i + 8]
          break
        }
      }
      if (pixelW > 0 && pixelH > 0) {
        this.lastFramePixelSize = { width: pixelW, height: pixelH }
      }
      const event: ScreencastFrameEvent = {
        jpeg,
        meta: {
          offsetTop: 0,
          offsetLeft: 0,
          pageScaleFactor: 1,
          deviceWidth: cssW,
          deviceHeight: cssH,
          scrollOffsetX: 0,
          scrollOffsetY: 0,
          timestamp: Date.now() / 1000,
        },
        sessionId: -1,
        receivedAt: Date.now(),
      }
      this.latestFrame = event
      this.emit("frame", event)
    } catch {
      // Page may be navigating — skip this tick.
    } finally {
      this.pumpInFlight = false
    }
  }

  async stopScreencast(): Promise<void> {
    await this.stopPump()
    if (!this.client || !this.screencastActive) {
      this.screencastActive = false
      return
    }
    try {
      await this.client.send("Page.stopScreencast")
    } catch {
      // ignore
    }
    this.screencastActive = false
  }

  get screencastDiagnostics() {
    return {
      viewport: this.viewport,
      deviceScaleFactor: this.deviceScaleFactor,
      screencast: this.lastScreencastConfig,
      framePixels: this.lastFramePixelSize,
    }
  }
  async setViewport(
    width: number,
    height: number,
    options?: { deviceScaleFactor?: number },
  ): Promise<void> {
    const w = Math.max(320, Math.min(Math.round(width), 2400))
    const h = Math.max(240, Math.min(Math.round(height), 2400))
    const scale = Math.max(
      1,
      Math.min(options?.deviceScaleFactor ?? this.deviceScaleFactor ?? 1, 3),
    )
    this.viewport = { width: w, height: h }
    this.deviceScaleFactor = scale
    await this.ensureAttached()
    if (!this.client) return

    // CSS layout size = pane; deviceScaleFactor matches display DPR for crisp
    // captureScreenshot(fromSurface) frames (screencast alone stays CSS-sized).
    await this.client
      .send("Emulation.setDeviceMetricsOverride", {
        width: w,
        height: h,
        deviceScaleFactor: scale,
        mobile: false,
        screenWidth: w,
        screenHeight: h,
      })
      .catch(() => undefined)

    // Headed only: keep native window off-screen / non-activating when possible.
    if (!this.session.headless) {
      try {
        const win = await this.client.send<{ windowId: number }>("Browser.getWindowForTarget", {
          targetId: this.targetId,
        })
        if (win?.windowId != null) {
          await this.client
            .send("Browser.setWindowBounds", {
              windowId: win.windowId,
              bounds: {
                left: -2800,
                top: 80,
                width: Math.max(400, w + 16),
                height: Math.max(300, h + 88),
                windowState: "normal",
              },
            })
            .catch(() => undefined)
        }
      } catch {
        // Browser domain may be unavailable on page-target sockets.
      }
    }

    if (this.screencastActive) {
      await this.stopScreencast()
      await this.startScreencast({ maxWidth: w, maxHeight: h })
    }
  }

  async listTargets(): Promise<PageTargetInfo[]> {
    const pages = await listPageTargets(this.session)
    return pages.map((page) => ({
      id: String(page.id ?? ""),
      title: String(page.title ?? ""),
      url: String(page.url ?? ""),
      type: String(page.type ?? "page"),
      active: page.id === this.targetId,
    }))
  }

  async switchTarget(targetId: string): Promise<void> {
    const wasStreaming = this.screencastActive
    const viewport = this.viewport
    const scale = this.deviceScaleFactor
    await this.stopScreencast()
    await this.ensureAttached(targetId)
    if (viewport) {
      await this.setViewport(viewport.width, viewport.height, { deviceScaleFactor: scale })
    }
    if (wasStreaming || this.subscribers > 0) {
      await this.startScreencast(
        viewport ? { maxWidth: viewport.width, maxHeight: viewport.height } : undefined,
      )
    }
  }

  async navigate(url: string): Promise<void> {
    await this.ensureAttached()
    if (!this.client) return
    await this.client.send("Page.navigate", { url })
    await refreshSessionMeta(this.session)
  }

  async reload(): Promise<void> {
    await this.ensureAttached()
    if (!this.client) return
    await this.client.send("Page.reload", { ignoreCache: false })
  }

  async goBack(): Promise<void> {
    await this.ensureAttached()
    if (!this.client) return
    const history = await this.client.send<{
      currentIndex: number
      entries: Array<{ id: number; url: string; title: string }>
    }>("Page.getNavigationHistory")
    const prev = history.entries[history.currentIndex - 1]
    if (prev) await this.client.send("Page.navigateToHistoryEntry", { entryId: prev.id })
  }

  async goForward(): Promise<void> {
    await this.ensureAttached()
    if (!this.client) return
    const history = await this.client.send<{
      currentIndex: number
      entries: Array<{ id: number; url: string; title: string }>
    }>("Page.getNavigationHistory")
    const next = history.entries[history.currentIndex + 1]
    if (next) await this.client.send("Page.navigateToHistoryEntry", { entryId: next.id })
  }

  async getNavigationState(): Promise<{
    url: string
    title: string
    canGoBack: boolean
    canGoForward: boolean
  }> {
    await this.ensureAttached()
    await refreshSessionMeta(this.session)
    if (!this.client) {
      return {
        url: this.session.currentUrl,
        title: this.session.title,
        canGoBack: false,
        canGoForward: false,
      }
    }
    const history = await this.client.send<{
      currentIndex: number
      entries: Array<{ id: number; url: string; title: string }>
    }>("Page.getNavigationHistory")
    return {
      url: this.session.currentUrl,
      title: this.session.title,
      canGoBack: history.currentIndex > 0,
      canGoForward: history.currentIndex < history.entries.length - 1,
    }
  }

  async dispatchMouse(event: {
    type: "mousePressed" | "mouseReleased" | "mouseMoved" | "mouseWheel"
    x: number
    y: number
    button?: "none" | "left" | "middle" | "right"
    buttons?: number
    clickCount?: number
    deltaX?: number
    deltaY?: number
    modifiers?: number
  }): Promise<void> {
    await this.ensureAttached()
    if (!this.client) return
    await this.client.send("Input.dispatchMouseEvent", {
      type: event.type,
      x: event.x,
      y: event.y,
      button: event.button ?? "none",
      buttons: event.buttons ?? 0,
      clickCount: event.clickCount ?? 0,
      deltaX: event.deltaX ?? 0,
      deltaY: event.deltaY ?? 0,
      modifiers: event.modifiers ?? 0,
    })
  }

  async dispatchKey(event: {
    type: "keyDown" | "keyUp" | "rawKeyDown" | "char"
    key?: string
    code?: string
    text?: string
    unmodifiedText?: string
    windowsVirtualKeyCode?: number
    nativeVirtualKeyCode?: number
    modifiers?: number
    autoRepeat?: boolean
  }): Promise<void> {
    await this.ensureAttached()
    if (!this.client) return
    await this.client.send("Input.dispatchKeyEvent", {
      type: event.type,
      key: event.key,
      code: event.code,
      text: event.text,
      unmodifiedText: event.unmodifiedText,
      windowsVirtualKeyCode: event.windowsVirtualKeyCode,
      nativeVirtualKeyCode: event.nativeVirtualKeyCode,
      modifiers: event.modifiers ?? 0,
      autoRepeat: event.autoRepeat ?? false,
    })
  }

  async insertText(text: string): Promise<void> {
    await this.ensureAttached()
    if (!this.client) return
    // Most reliable path for Unicode / paste / accented characters.
    await this.client.send("Input.insertText", { text })
  }

  async bringToFront(): Promise<void> {
    await this.ensureAttached()
    if (!this.client) return
    await this.client.send("Page.bringToFront").catch(() => undefined)
  }

  private async detachClient(): Promise<void> {
    await this.stopPump()
    if (this.screencastActive && this.client) {
      try {
        await this.client.send("Page.stopScreencast")
      } catch {
        // ignore
      }
      this.screencastActive = false
    }
    if (this.client) {
      await this.client.close()
      this.client = null
    }
  }

  async close(): Promise<void> {
    this.closed = true
    this.subscribers = 0
    await this.detachClient()
    this.removeAllListeners()
  }
}

const controllers = new Map<string, SessionCdpController>()

export function getSessionController(session: LocalBrowserSession): SessionCdpController {
  let controller = controllers.get(session.id)
  if (!controller) {
    controller = new SessionCdpController(session)
    controllers.set(session.id, controller)
  }
  return controller
}

export async function disposeSessionController(sessionId: string): Promise<void> {
  const controller = controllers.get(sessionId)
  if (!controller) return
  controllers.delete(sessionId)
  await controller.close()
}
