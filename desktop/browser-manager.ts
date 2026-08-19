/**
 * Manages native Chromium WebContentsViews for Articulate Desktop Browser tabs.
 *
 * Human input goes directly to Chromium — no CDP screencast / input replay.
 * Agent control can later attach via main-process webContents APIs on the same views.
 */

import { randomUUID } from "node:crypto"
import {
  WebContentsView,
  session,
  type BaseWindow,
  type BrowserWindow,
} from "electron"
import type { DesktopBrowserBounds, DesktopBrowserState } from "./ipc"

export const BROWSER_SESSION_PARTITION = "persist:articulate-browser"

type HostWindow = BrowserWindow | BaseWindow

export type DesktopBrowserEntry = {
  id: string
  view: WebContentsView
  title: string
  favicon: string | null
  url: string
  isLoading: boolean
  /** Last applied bounds (DIP / CSS px). */
  bounds: DesktopBrowserBounds | null
}

export type BrowserManagerEvents = {
  onState: (state: DesktopBrowserState) => void
  onMeta: (payload: {
    id: string
    title: string
    favicon: string | null
    url: string
  }) => void
  onDownload: (payload: {
    id: string
    filename: string
    url: string
    state: string
  }) => void
  onPopup: (payload: { id: string; url: string; openerId: string }) => void
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "about:"
  } catch {
    return false
  }
}

/** Normalize a typed URL for toolbar navigation (add https when missing). */
export function normalizeDesktopUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  if (trimmed.startsWith("//")) return `https:${trimmed}`
  return `https://${trimmed}`
}

function truncateTitle(title: string, max = 48): string {
  const t = title.trim()
  if (!t) return "Browser"
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export class DesktopBrowserManager {
  private readonly browsers = new Map<string, DesktopBrowserEntry>()
  private activeBrowserId: string | null = null
  private hostWindow: HostWindow | null = null
  private readonly events: BrowserManagerEvents
  private sessionConfigured = false

  constructor(events: BrowserManagerEvents) {
    this.events = events
  }

  setHostWindow(win: HostWindow | null) {
    this.hostWindow = win
  }

  getActiveBrowserId(): string | null {
    return this.activeBrowserId
  }

  getEntry(id: string): DesktopBrowserEntry | undefined {
    return this.browsers.get(id)
  }

  /** Expose for later agent control (main process only). */
  getWebContents(id: string) {
    return this.browsers.get(id)?.view.webContents ?? null
  }

  listIds(): string[] {
    return [...this.browsers.keys()]
  }

  private ensureBrowserSession() {
    if (this.sessionConfigured) return
    const ses = session.fromPartition(BROWSER_SESSION_PARTITION)

    // Conservative permission policy for untrusted third-party sites.
    ses.setPermissionRequestHandler((_wc, permission, callback) => {
      const allow =
        permission === "clipboard-sanitized-write" ||
        permission === "clipboard-read" ||
        permission === "fullscreen" ||
        permission === "pointerLock"
      callback(Boolean(allow))
    })

    ses.setPermissionCheckHandler((_wc, permission) => {
      return (
        permission === "clipboard-sanitized-write" ||
        permission === "clipboard-read" ||
        permission === "fullscreen" ||
        permission === "pointerLock"
      )
    })

    ses.on("will-download", (_event, item, webContents) => {
      const owner = [...this.browsers.values()].find((b) => b.view.webContents.id === webContents.id)
      const filename = item.getFilename()
      const url = item.getURL()
      this.events.onDownload({
        id: owner?.id ?? "unknown",
        filename,
        url,
        state: "started",
      })
      item.on("done", (_e, state) => {
        this.events.onDownload({
          id: owner?.id ?? "unknown",
          filename,
          url,
          state,
        })
      })
      // Let Chromium show the default save dialog — do not swallow silently.
    })

    this.sessionConfigured = true
  }

  private emitState(entry: DesktopBrowserEntry) {
    const wc = entry.view.webContents
    const history = wc.navigationHistory
    const state: DesktopBrowserState = {
      id: entry.id,
      url: entry.url || wc.getURL() || "",
      title: entry.title,
      favicon: entry.favicon,
      isLoading: entry.isLoading,
      canGoBack: history.canGoBack(),
      canGoForward: history.canGoForward(),
      sessionPartition: BROWSER_SESSION_PARTITION,
    }
    this.events.onState(state)
  }

  private emitMeta(entry: DesktopBrowserEntry) {
    this.events.onMeta({
      id: entry.id,
      title: entry.title,
      favicon: entry.favicon,
      url: entry.url,
    })
  }

  private attachWebContentsListeners(entry: DesktopBrowserEntry) {
    const wc = entry.view.webContents

    const syncNav = () => {
      entry.url = wc.getURL() || entry.url
      entry.isLoading = wc.isLoading()
      this.emitState(entry)
    }

    wc.on("page-title-updated", (_e, title) => {
      entry.title = truncateTitle(title || "")
      this.emitMeta(entry)
      this.emitState(entry)
    })

    wc.on("page-favicon-updated", (_e, favicons) => {
      const first = Array.isArray(favicons) ? favicons.find((f) => typeof f === "string" && f) : null
      entry.favicon = first ?? null
      this.emitMeta(entry)
      this.emitState(entry)
    })

    wc.on("did-navigate", (_e, url) => {
      entry.url = url
      entry.title = truncateTitle(wc.getTitle() || entry.title)
      syncNav()
      this.emitMeta(entry)
    })

    wc.on("did-navigate-in-page", (_e, url) => {
      entry.url = url
      syncNav()
      this.emitMeta(entry)
    })

    wc.on("did-start-loading", () => {
      entry.isLoading = true
      this.emitState(entry)
    })

    wc.on("did-stop-loading", () => {
      entry.isLoading = false
      entry.url = wc.getURL() || entry.url
      entry.title = truncateTitle(wc.getTitle() || entry.title)
      this.emitState(entry)
      this.emitMeta(entry)
    })

    wc.on("dom-ready", () => {
      entry.url = wc.getURL() || entry.url
      entry.title = truncateTitle(wc.getTitle() || entry.title)
      this.emitState(entry)
    })

    // Convert popups / target=_blank into managed tabs (same persistent session).
    wc.setWindowOpenHandler(({ url }) => {
      const nextUrl = url && isHttpUrl(url) ? url : "about:blank"
      const created = this.create({ url: nextUrl, activate: true })
      this.events.onPopup({
        id: created.id,
        url: nextUrl,
        openerId: entry.id,
      })
      return { action: "deny" }
    })
  }

  create(options?: { id?: string; url?: string; activate?: boolean }): DesktopBrowserState {
    this.ensureBrowserSession()
    const id = options?.id?.trim() || randomUUID()
    if (this.browsers.has(id)) {
      if (options?.activate !== false) this.show(id)
      return this.getState(id)!
    }

    const view = new WebContentsView({
      webPreferences: {
        session: session.fromPartition(BROWSER_SESSION_PARTITION),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        // No preload — remote sites must not get Articulate IPC.
        preload: undefined,
        allowRunningInsecureContent: false,
      },
    })

    const entry: DesktopBrowserEntry = {
      id,
      view,
      title: "Browser",
      favicon: null,
      url: options?.url?.trim() || "about:blank",
      isLoading: false,
      bounds: null,
    }

    this.attachWebContentsListeners(entry)
    this.browsers.set(id, entry)

    const win = this.hostWindow
    if (win) {
      win.contentView.addChildView(view)
      // Start hidden until React reports bounds.
      view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      view.setVisible(false)
    }

    const startUrl = normalizeDesktopUrl(options?.url || "https://www.google.com/")
    if (startUrl) {
      entry.url = startUrl
      void view.webContents.loadURL(startUrl)
    }

    if (options?.activate !== false) {
      this.show(id)
    }

    this.emitState(entry)
    this.emitMeta(entry)
    return this.getState(id)!
  }

  close(id: string): boolean {
    const entry = this.browsers.get(id)
    if (!entry) return false
    const win = this.hostWindow
    try {
      if (win) win.contentView.removeChildView(entry.view)
    } catch {
      // already detached
    }
    try {
      entry.view.webContents.close()
    } catch {
      // ignore
    }
    this.browsers.delete(id)
    if (this.activeBrowserId === id) {
      this.activeBrowserId = null
    }
    return true
  }

  show(id: string): boolean {
    const entry = this.browsers.get(id)
    if (!entry) return false

    for (const [otherId, other] of this.browsers) {
      if (otherId === id) continue
      other.view.setVisible(false)
    }

    this.activeBrowserId = id
    if (entry.bounds?.visible && entry.bounds.width > 0 && entry.bounds.height > 0) {
      entry.view.setBounds({
        x: Math.round(entry.bounds.x),
        y: Math.round(entry.bounds.y),
        width: Math.round(entry.bounds.width),
        height: Math.round(entry.bounds.height),
      })
      entry.view.setVisible(true)
    } else {
      entry.view.setVisible(false)
    }

    // Ensure z-order above siblings.
    const win = this.hostWindow
    if (win) {
      try {
        win.contentView.addChildView(entry.view)
      } catch {
        // already attached
      }
    }

    this.emitState(entry)
    return true
  }

  hide(id?: string): boolean {
    if (id) {
      const entry = this.browsers.get(id)
      if (!entry) return false
      entry.view.setVisible(false)
      if (entry.bounds) entry.bounds = { ...entry.bounds, visible: false }
      if (this.activeBrowserId === id) this.activeBrowserId = null
      return true
    }
    for (const entry of this.browsers.values()) {
      entry.view.setVisible(false)
      if (entry.bounds) entry.bounds = { ...entry.bounds, visible: false }
    }
    this.activeBrowserId = null
    return true
  }

  /**
   * Apply React-measured host bounds (CSS / DIP pixels relative to the app WebContents).
   * Electron WebContentsView.setBounds uses the same DIP space as the window content area.
   */
  setBounds(id: string, bounds: DesktopBrowserBounds): boolean {
    const entry = this.browsers.get(id)
    if (!entry) return false

    const next: DesktopBrowserBounds = {
      x: Math.max(0, Math.round(bounds.x)),
      y: Math.max(0, Math.round(bounds.y)),
      width: Math.max(0, Math.round(bounds.width)),
      height: Math.max(0, Math.round(bounds.height)),
      visible: Boolean(bounds.visible),
    }
    entry.bounds = next

    const shouldShow =
      next.visible &&
      next.width > 0 &&
      next.height > 0 &&
      this.activeBrowserId === id

    if (shouldShow) {
      entry.view.setBounds({
        x: next.x,
        y: next.y,
        width: next.width,
        height: next.height,
      })
      entry.view.setVisible(true)
    } else {
      entry.view.setVisible(false)
    }
    return true
  }

  navigate(id: string, url: string): boolean {
    const entry = this.browsers.get(id)
    if (!entry) return false
    const target = normalizeDesktopUrl(url)
    if (!target) return false
    if (!isHttpUrl(target) && !target.startsWith("about:")) return false
    entry.url = target
    void entry.view.webContents.loadURL(target)
    return true
  }

  back(id: string): boolean {
    const entry = this.browsers.get(id)
    if (!entry) return false
    const history = entry.view.webContents.navigationHistory
    if (!history.canGoBack()) return false
    history.goBack()
    return true
  }

  forward(id: string): boolean {
    const entry = this.browsers.get(id)
    if (!entry) return false
    const history = entry.view.webContents.navigationHistory
    if (!history.canGoForward()) return false
    history.goForward()
    return true
  }

  reload(id: string): boolean {
    const entry = this.browsers.get(id)
    if (!entry) return false
    entry.view.webContents.reload()
    return true
  }

  stop(id: string): boolean {
    const entry = this.browsers.get(id)
    if (!entry) return false
    entry.view.webContents.stop()
    return true
  }

  async capture(id: string): Promise<string | null> {
    const entry = this.browsers.get(id)
    if (!entry) return null
    try {
      const image = await entry.view.webContents.capturePage()
      if (image.isEmpty()) return null
      const width = image.getSize().width
      const resized = width > 960 ? image.resize({ width: 960 }) : image
      return `data:image/jpeg;base64,${resized.toJPEG(72).toString("base64")}`
    } catch {
      return null
    }
  }

  getState(id: string): DesktopBrowserState | null {
    const entry = this.browsers.get(id)
    if (!entry) return null
    const wc = entry.view.webContents
    const history = wc.navigationHistory
    return {
      id: entry.id,
      url: entry.url || wc.getURL() || "",
      title: entry.title,
      favicon: entry.favicon,
      isLoading: entry.isLoading || wc.isLoading(),
      canGoBack: history.canGoBack(),
      canGoForward: history.canGoForward(),
      sessionPartition: BROWSER_SESSION_PARTITION,
    }
  }

  getActiveBounds(): DesktopBrowserBounds | null {
    if (!this.activeBrowserId) return null
    return this.browsers.get(this.activeBrowserId)?.bounds ?? null
  }

  getActiveUrl(): string | null {
    if (!this.activeBrowserId) return null
    const entry = this.browsers.get(this.activeBrowserId)
    if (!entry) return null
    return entry.url || entry.view.webContents.getURL() || null
  }

  disposeAll() {
    for (const id of [...this.browsers.keys()]) {
      this.close(id)
    }
  }
}
