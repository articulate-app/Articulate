/**
 * Auto-update for Articulate Desktop (electron-updater + GitHub Releases).
 *
 * Downloads in the background. Installs on quit by default so active browser /
 * publishing work is not killed mid-flight. The renderer can also request a
 * restart when the user chooses "Restart to update".
 */

import { app, BrowserWindow, dialog, ipcMain } from "electron"
import { autoUpdater } from "electron-updater"
import { IPC } from "./ipc"

export type DesktopUpdateStatus = {
  status:
    | "idle"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error"
  version: string | null
  percent: number | null
  message: string | null
}

let mainWindowRef: BrowserWindow | null = null
let latest: DesktopUpdateStatus = {
  status: "idle",
  version: null,
  percent: null,
  message: null,
}

function emit(status: DesktopUpdateStatus) {
  latest = status
  mainWindowRef?.webContents.send(IPC.UPDATE_STATUS, status)
}

export function getDesktopUpdateStatus(): DesktopUpdateStatus {
  return latest
}

export function registerAutoUpdaterIpc(assertTrusted: (event: Electron.IpcMainInvokeEvent) => void) {
  ipcMain.handle(IPC.UPDATE_GET_STATUS, (event) => {
    assertTrusted(event)
    return getDesktopUpdateStatus()
  })

  ipcMain.handle(IPC.UPDATE_CHECK, async (event) => {
    assertTrusted(event)
    if (!app.isPackaged) {
      return { ok: false, reason: "dev_mode" as const }
    }
    try {
      await autoUpdater.checkForUpdates()
      return { ok: true as const }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      emit({ status: "error", version: null, percent: null, message })
      return { ok: false, reason: "error" as const, message }
    }
  })

  ipcMain.handle(IPC.UPDATE_INSTALL, (event) => {
    assertTrusted(event)
    if (latest.status !== "downloaded") {
      return { ok: false, reason: "not_ready" as const }
    }
    // Quit and install — user-initiated only.
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
    return { ok: true as const }
  })
}

export function setupAutoUpdater(getMainWindow: () => BrowserWindow | null) {
  if (!app.isPackaged) {
    console.info("[articulate-desktop] auto-update disabled (dev / unpackaged)")
    return
  }

  mainWindowRef = getMainWindow()

  autoUpdater.autoDownload = true
  // Install on quit so we never force-kill an active browser/publish session.
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = process.env.ARTICULATE_DESKTOP_CHANNEL === "beta"

  autoUpdater.on("checking-for-update", () => {
    mainWindowRef = getMainWindow()
    emit({ status: "checking", version: null, percent: null, message: null })
  })

  autoUpdater.on("update-available", (info) => {
    emit({
      status: "available",
      version: info.version,
      percent: 0,
      message: `Update ${info.version} available`,
    })
  })

  autoUpdater.on("update-not-available", () => {
    emit({ status: "not-available", version: null, percent: null, message: null })
  })

  autoUpdater.on("download-progress", (progress) => {
    emit({
      status: "downloading",
      version: latest.version,
      percent: Math.round(progress.percent),
      message: `Downloading update… ${Math.round(progress.percent)}%`,
    })
  })

  autoUpdater.on("update-downloaded", (info) => {
    emit({
      status: "downloaded",
      version: info.version,
      percent: 100,
      message: `Update ${info.version} ready — restart to install`,
    })

    const win = getMainWindow()
    if (!win) return
    void dialog
      .showMessageBox(win, {
        type: "info",
        title: "Update ready",
        message: `Articulate ${info.version} is ready to install.`,
        detail:
          "The update will install when you quit Articulate, or you can restart now. Active browser and publishing work will close if you restart immediately.",
        buttons: ["Restart now", "Later"],
        defaultId: 1,
        cancelId: 1,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall(false, true)
        }
      })
  })

  autoUpdater.on("error", (err) => {
    emit({
      status: "error",
      version: null,
      percent: null,
      message: err?.message || String(err),
    })
  })

  // Initial check shortly after launch; later checks on interval.
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch(() => {
      /* emitted via error handler */
    })
  }, 8_000)

  setInterval(
    () => {
      void autoUpdater.checkForUpdates().catch(() => {
        /* ignore */
      })
    },
    4 * 60 * 60 * 1000,
  )
}
