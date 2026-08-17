/**
 * Articulate Desktop — Electron main process.
 *
 * Composition: BrowserWindow (Articulate web app) + child WebContentsView (Browser pane).
 *
 * Production builds load the deployed Articulate app URL.
 * Development loads the local Next.js server.
 */

import path from "node:path"
import {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage,
} from "electron"
import {
  DesktopBrowserManager,
  BROWSER_SESSION_PARTITION,
} from "./browser-manager"
import { DesktopAgentController } from "./agent-controller"
import {
  DESKTOP_CAPABILITIES,
  DESKTOP_VERSION_FALLBACK,
  resolveDesktopAppOrigin,
  resolveDesktopAppUrl,
} from "./config"
import { buildApplicationMenu } from "./app-menu"
import { registerAutoUpdaterIpc, setupAutoUpdater } from "./auto-updater"
import {
  IPC,
  type DesktopBrowserBounds,
  type DesktopInfo,
} from "./ipc"

const isPackaged = app.isPackaged
let appUrl: string
try {
  appUrl = resolveDesktopAppUrl(isPackaged)
} catch (err) {
  console.error(err)
  app.exit(1)
  throw err
}

let mainWindow: BrowserWindow | null = null

const browserManager = new DesktopBrowserManager({
  onState: (state) => {
    mainWindow?.webContents.send(IPC.BROWSER_STATE, state)
  },
  onMeta: (payload) => {
    mainWindow?.webContents.send(IPC.BROWSER_META, payload)
  },
  onDownload: (payload) => {
    mainWindow?.webContents.send(IPC.BROWSER_DOWNLOAD, payload)
  },
  onPopup: (payload) => {
    mainWindow?.webContents.send(IPC.BROWSER_POPUP, payload)
  },
})

const agentController = new DesktopAgentController(browserManager, {
  onControlChange: (state) => {
    mainWindow?.webContents.send(IPC.BROWSER_CONTROL, state)
  },
})

function assertFromArticulateApp(event: Electron.IpcMainInvokeEvent): void {
  const sender = event.sender
  if (!mainWindow || sender.id !== mainWindow.webContents.id) {
    throw new Error("Unauthorized desktop IPC sender")
  }
}

function parseBounds(value: unknown): DesktopBrowserBounds | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  const x = Number(v.x)
  const y = Number(v.y)
  const width = Number(v.width)
  const height = Number(v.height)
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null
  return {
    x,
    y,
    width,
    height,
    visible: v.visible !== false,
  }
}

function getDesktopVersion(): string {
  try {
    const v = app.getVersion()?.trim()
    if (v) return v
  } catch {
    // ignore
  }
  return DESKTOP_VERSION_FALLBACK
}

function buildInfo(): DesktopInfo {
  return {
    isDesktop: true,
    desktopVersion: getDesktopVersion(),
    capabilities: [...DESKTOP_CAPABILITIES],
    electron: process.versions.electron || "unknown",
    chromium: process.versions.chrome || "unknown",
    platform: process.platform,
    arch: process.arch,
    sessionPartition: BROWSER_SESSION_PARTITION,
    browserViewActive: Boolean(browserManager.getActiveBrowserId()),
    activeBrowserId: browserManager.getActiveBrowserId(),
    bounds: browserManager.getActiveBounds(),
    url: browserManager.getActiveUrl(),
    isPackaged,
    appUrl,
  }
}

function registerIpc() {
  ipcMain.handle(IPC.GET_INFO, (event) => {
    assertFromArticulateApp(event)
    return buildInfo()
  })

  registerAutoUpdaterIpc(assertFromArticulateApp)

  ipcMain.handle(IPC.BROWSER_CREATE, (event, payload?: { id?: string; url?: string }) => {
    assertFromArticulateApp(event)
    const id = typeof payload?.id === "string" ? payload.id.trim() : undefined
    const url = typeof payload?.url === "string" ? payload.url : undefined
    const created = browserManager.create({ id, url, activate: true })
    agentController.attachHumanPreemption(created.id)
    return created
  })

  ipcMain.handle(IPC.BROWSER_OBSERVE, async (event, payload?: { id?: string }) => {
    assertFromArticulateApp(event)
    const id = typeof payload?.id === "string" ? payload.id.trim() : ""
    if (!id) throw new Error("browser id required")
    return agentController.observe(id)
  })

  ipcMain.handle(
    IPC.BROWSER_AGENT_ACTION,
    async (
      event,
      payload?: { id?: string; generation?: number; action?: unknown },
    ) => {
      assertFromArticulateApp(event)
      const id = typeof payload?.id === "string" ? payload.id.trim() : ""
      const generation = Number(payload?.generation)
      if (!id || !Number.isFinite(generation)) throw new Error("id and generation required")
      if (!payload?.action || typeof payload.action !== "object") {
        throw new Error("action required")
      }
      return agentController.executeAction(
        id,
        payload.action as import("./agent-controller").DesktopAgentAction,
        generation,
      )
    },
  )

  ipcMain.handle(IPC.BROWSER_AGENT_BEGIN, (event) => {
    assertFromArticulateApp(event)
    return agentController.beginAgentControl()
  })

  ipcMain.handle(IPC.BROWSER_AGENT_GET_CONTROL, (event) => {
    assertFromArticulateApp(event)
    return agentController.getState()
  })

  ipcMain.handle(IPC.BROWSER_HUMAN_BUMP, (event) => {
    assertFromArticulateApp(event)
    return agentController.bumpHumanControl()
  })

  ipcMain.handle(IPC.BROWSER_CLOSE, (event, payload?: { id?: string }) => {
    assertFromArticulateApp(event)
    const id = typeof payload?.id === "string" ? payload.id.trim() : ""
    if (!id) throw new Error("browser id required")
    return { ok: browserManager.close(id) }
  })

  ipcMain.handle(IPC.BROWSER_SHOW, (event, payload?: { id?: string }) => {
    assertFromArticulateApp(event)
    const id = typeof payload?.id === "string" ? payload.id.trim() : ""
    if (!id) throw new Error("browser id required")
    return { ok: browserManager.show(id) }
  })

  ipcMain.handle(IPC.BROWSER_HIDE, (event, payload?: { id?: string }) => {
    assertFromArticulateApp(event)
    const id = typeof payload?.id === "string" ? payload.id.trim() : undefined
    return { ok: browserManager.hide(id) }
  })

  ipcMain.handle(IPC.BROWSER_SET_BOUNDS, (event, payload?: { id?: string; bounds?: unknown }) => {
    assertFromArticulateApp(event)
    const id = typeof payload?.id === "string" ? payload.id.trim() : ""
    const bounds = parseBounds(payload?.bounds)
    if (!id || !bounds) throw new Error("id and bounds required")
    if (bounds.width > 8192 || bounds.height > 8192) {
      throw new Error("bounds too large")
    }
    return { ok: browserManager.setBounds(id, bounds) }
  })

  ipcMain.handle(IPC.BROWSER_NAVIGATE, (event, payload?: { id?: string; url?: string }) => {
    assertFromArticulateApp(event)
    const id = typeof payload?.id === "string" ? payload.id.trim() : ""
    const url = typeof payload?.url === "string" ? payload.url : ""
    if (!id || !url) throw new Error("id and url required")
    return { ok: browserManager.navigate(id, url) }
  })

  ipcMain.handle(IPC.BROWSER_BACK, (event, payload?: { id?: string }) => {
    assertFromArticulateApp(event)
    const id = typeof payload?.id === "string" ? payload.id.trim() : ""
    if (!id) throw new Error("browser id required")
    return { ok: browserManager.back(id) }
  })

  ipcMain.handle(IPC.BROWSER_FORWARD, (event, payload?: { id?: string }) => {
    assertFromArticulateApp(event)
    const id = typeof payload?.id === "string" ? payload.id.trim() : ""
    if (!id) throw new Error("browser id required")
    return { ok: browserManager.forward(id) }
  })

  ipcMain.handle(IPC.BROWSER_RELOAD, (event, payload?: { id?: string }) => {
    assertFromArticulateApp(event)
    const id = typeof payload?.id === "string" ? payload.id.trim() : ""
    if (!id) throw new Error("browser id required")
    return { ok: browserManager.reload(id) }
  })

  ipcMain.handle(IPC.BROWSER_STOP, (event, payload?: { id?: string }) => {
    assertFromArticulateApp(event)
    const id = typeof payload?.id === "string" ? payload.id.trim() : ""
    if (!id) throw new Error("browser id required")
    return { ok: browserManager.stop(id) }
  })

  ipcMain.handle(IPC.BROWSER_GET_STATE, (event, payload?: { id?: string }) => {
    assertFromArticulateApp(event)
    const id = typeof payload?.id === "string" ? payload.id.trim() : ""
    if (!id) throw new Error("browser id required")
    return browserManager.getState(id)
  })
}

function resolveAppIcon(): Electron.NativeImage | null {
  const candidates = [
    path.join(__dirname, "..", "resources", "brand-mark.png"),
    path.join(__dirname, "..", "build", "icon.icns"),
    path.join(process.cwd(), "public", "brand-mark.png"),
    path.join(process.resourcesPath || "", "brand-mark.png"),
  ]
  for (const candidate of candidates) {
    const image = nativeImage.createFromPath(candidate)
    if (!image.isEmpty()) return image
  }
  return null
}

function createMainWindow() {
  const icon = resolveAppIcon()
  const appOrigin = resolveDesktopAppOrigin(appUrl)

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "Articulate",
    backgroundColor: "#ffffff",
    show: false,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  browserManager.setHostWindow(mainWindow)

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show()
  })

  mainWindow.on("closed", () => {
    browserManager.disposeAll()
    browserManager.setHostWindow(null)
    mainWindow = null
  })

  // Allow same-origin popups; keep OAuth provider navigations inside Electron
  // (do not bounce them to the system browser — that breaks callback cookies).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const next = new URL(url)
      if (next.origin === appOrigin) {
        return { action: "allow" }
      }
      if (/^https?:\/\//i.test(url)) {
        void mainWindow?.loadURL(url)
        return { action: "deny" }
      }
    } catch {
      // fall through
    }
    return { action: "deny" }
  })

  void mainWindow.loadURL(appUrl).catch((err) => {
    console.error("[articulate-desktop] failed to load app URL", appUrl, err)
  })

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame) return
    console.error("[articulate-desktop] did-fail-load", { code, desc, url })
  })

  if (!isPackaged) {
    console.info("[articulate-desktop] loading", appUrl)
    console.info("[articulate-desktop] versions", {
      desktop: getDesktopVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
    })
    if (process.env.ARTICULATE_DESKTOP_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" })
    }
  }
}

app.setName("Articulate")

// Stable userData path under the production product name.
if (isPackaged) {
  app.setPath("userData", path.join(app.getPath("appData"), "Articulate"))
}

app.whenReady().then(() => {
  const icon = resolveAppIcon()
  if (icon && process.platform === "darwin" && app.dock) {
    app.dock.setIcon(icon)
  }

  buildApplicationMenu(() => mainWindow)
  registerIpc()
  createMainWindow()
  setupAutoUpdater(() => mainWindow)

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("before-quit", () => {
  browserManager.disposeAll()
})
