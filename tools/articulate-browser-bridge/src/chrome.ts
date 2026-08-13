import { spawn, execFile, type ChildProcess } from "node:child_process"
import { createServer } from "node:net"
import { mkdirSync, rmSync, existsSync, lstatSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export type LocalBrowserSession = {
  id: string
  status: "active" | "stopped"
  startUrl: string
  currentUrl: string
  title: string
  userDataDir: string
  /** When true, stopSession must not delete the profile directory. */
  persistentProfile: boolean
  profileKey: string | null
  /**
   * Headless by default so Articulate embeds the live surface without a
   * duplicate native Chrome window. `Open in Chrome` relaunches headed.
   */
  headless: boolean
  debuggingPort: number
  cdpHttpBase: string
  startedAt: string
  process: ChildProcess | null
}

function sanitizeProfileKey(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80)
  return safe || null
}

function resolveUserDataDir(profileKey: string | null): { dir: string; persistent: boolean } {
  if (profileKey) {
    const root =
      process.env.ARTICULATE_BROWSER_PROFILES_DIR?.trim() ||
      join(homedir(), ".articulate", "browser-profiles")
    mkdirSync(root, { recursive: true })
    const dir = join(root, profileKey)
    mkdirSync(dir, { recursive: true })
    return { dir, persistent: true }
  }
  const dir = join(tmpdir(), `articulate-browser-${randomUUID()}`)
  mkdirSync(dir, { recursive: true })
  return { dir, persistent: false }
}

function chromeCandidates(): string[] {
  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ]
  }
  if (process.platform === "win32") {
    const pf = process.env["PROGRAMFILES"] ?? "C:\\Program Files"
    const pf86 = process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)"
    const local = process.env.LOCALAPPDATA ?? ""
    return [
      join(pf, "Google/Chrome/Application/chrome.exe"),
      join(pf86, "Google/Chrome/Application/chrome.exe"),
      join(local, "Google/Chrome/Application/chrome.exe"),
      join(pf, "Chromium/Application/chrome.exe"),
      join(pf, "Microsoft/Edge/Application/msedge.exe"),
    ]
  }
  return [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
  ]
}

export function resolveChromeExecutable(): string {
  const override = process.env.ARTICULATE_CHROME_PATH?.trim()
  if (override && existsSync(override)) return override
  for (const candidate of chromeCandidates()) {
    if (candidate.includes("/") || candidate.includes("\\")) {
      if (existsSync(candidate)) return candidate
    } else {
      // PATH binary name — let spawn resolve later.
      return candidate
    }
  }
  throw new Error(
    "No local Chrome/Chromium found. Install Chrome or set ARTICULATE_CHROME_PATH.",
  )
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        server.close()
        reject(new Error("Could not allocate loopback debugging port"))
        return
      }
      const port = address.port
      server.close((error) => {
        if (error) reject(error)
        else resolve(port)
      })
    })
    server.on("error", reject)
  })
}

async function waitForDebugger(port: number, timeoutMs = 20_000): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) return
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Chrome remote debugging did not become ready on 127.0.0.1:${port}`)
}

/**
 * Chrome refuses a second instance on the same user-data-dir (SingletonLock).
 * After Helper restarts, orphaned headless processes often keep the lock and
 * new launches time out waiting for a debugging port that never opens.
 */
async function releaseProfileLock(userDataDir: string): Promise<void> {
  if (!userDataDir || !existsSync(userDataDir)) return

  // Best-effort: terminate only processes bound to this Articulate profile dir.
  try {
    if (process.platform === "darwin" || process.platform === "linux") {
      await execFileAsync("pkill", ["-f", `user-data-dir=${userDataDir}`], {
        timeout: 5_000,
      }).catch(() => undefined)
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
  } catch {
    // ignore
  }

  for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"] as const) {
    const target = join(userDataDir, name)
    try {
      if (existsSync(target) || lstatSync(target).isSymbolicLink()) {
        rmSync(target, { force: true })
      }
    } catch {
      try {
        rmSync(target, { force: true })
      } catch {
        // ignore
      }
    }
  }
}

function envPrefersHeaded(): boolean {
  return process.env.ARTICULATE_BROWSER_HEADED === "1"
}

function buildChromeArgs(options: {
  debuggingPort: number
  userDataDir: string
  headless: boolean
  startUrl: string
}): string[] {
  const args = [
    `--remote-debugging-address=127.0.0.1`,
    `--remote-debugging-port=${options.debuggingPort}`,
    `--user-data-dir=${options.userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--disable-features=TranslateUI",
    "--disable-background-networking",
    "--window-size=1280,900",
  ]
  if (options.headless) {
    // No native window — Articulate embeds the live surface via CDP frames.
    args.push("--headless=new")
  } else {
    // Headed fallback / Open in Chrome. Prefer off-screen; macOS may clamp.
    args.push("--window-position=-2800,80")
  }
  args.push(options.startUrl)
  return args
}

async function spawnChromeProcess(options: {
  debuggingPort: number
  userDataDir: string
  headless: boolean
  startUrl: string
}): Promise<ChildProcess> {
  const executable = resolveChromeExecutable()
  const child = spawn(
    executable,
    buildChromeArgs(options),
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
      },
    },
  )
  // Drain pipes so a full stderr buffer cannot stall Chrome.
  child.stdout?.on("data", () => undefined)
  child.stderr?.on("data", () => undefined)
  return child
}

export async function launchIsolatedChrome(
  startUrl: string,
  options?: { profileKey?: string | null; headed?: boolean },
): Promise<LocalBrowserSession> {
  const debuggingPort = await getFreePort()
  const profileKey = sanitizeProfileKey(options?.profileKey)
  const { dir: userDataDir, persistent } = resolveUserDataDir(profileKey)
  const id = randomUUID()
  const normalizedUrl = startUrl.trim() || "https://www.google.com/"
  const headless = options?.headed === true || envPrefersHeaded() ? false : true

  await releaseProfileLock(userDataDir)

  let child = await spawnChromeProcess({
    debuggingPort,
    userDataDir,
    headless,
    startUrl: normalizedUrl,
  })

  const session: LocalBrowserSession = {
    id,
    status: "active",
    startUrl: normalizedUrl,
    currentUrl: normalizedUrl,
    title: "",
    userDataDir,
    persistentProfile: persistent,
    profileKey,
    headless,
    debuggingPort,
    cdpHttpBase: `http://127.0.0.1:${debuggingPort}`,
    startedAt: new Date().toISOString(),
    process: child,
  }

  const attachExit = (proc: ChildProcess) => {
    proc.on("exit", () => {
      if (session.process === proc) {
        session.status = "stopped"
        session.process = null
      }
    })
  }
  attachExit(child)

  try {
    await waitForDebugger(debuggingPort)
  } catch (firstError) {
    // Profile still locked / crash on first boot — clear and retry once.
    try {
      child.kill("SIGKILL")
    } catch {
      // ignore
    }
    session.process = null
    await releaseProfileLock(userDataDir)
    const retryPort = await getFreePort()
    child = await spawnChromeProcess({
      debuggingPort: retryPort,
      userDataDir,
      headless,
      startUrl: normalizedUrl,
    })
    session.process = child
    session.debuggingPort = retryPort
    session.cdpHttpBase = `http://127.0.0.1:${retryPort}`
    session.status = "active"
    attachExit(child)
    try {
      await waitForDebugger(retryPort)
    } catch {
      try {
        child.kill("SIGKILL")
      } catch {
        // ignore
      }
      session.process = null
      session.status = "stopped"
      throw firstError instanceof Error
        ? firstError
        : new Error(String(firstError))
    }
  }

  await refreshSessionMeta(session)
  if (!headless) {
    await placeSessionWindowOffscreen(session).catch(() => undefined)
  }
  return session
}

/**
 * Kill the Chrome child without deleting the profile or marking the session stopped.
 * Used when switching headless ↔ headed for the same Articulate session id.
 */
async function killChromeProcess(session: LocalBrowserSession): Promise<void> {
  const child = session.process
  session.process = null
  if (!child) return
  try {
    if (!child.killed) {
      child.kill("SIGTERM")
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    if (!child.killed) child.kill("SIGKILL")
  } catch {
    // already exited
  }
}

/**
 * Relaunch the same session profile in headed mode (same user-data-dir / cookies).
 * Does not create a second browser profile — replaces the process in-place.
 */
export async function relaunchSessionHeaded(
  session: LocalBrowserSession,
): Promise<void> {
  if (!session.headless && session.process) {
    return
  }
  await refreshSessionMeta(session).catch(() => undefined)
  const resumeUrl =
    (session.currentUrl && session.currentUrl !== "about:blank"
      ? session.currentUrl
      : session.startUrl) || "https://www.google.com/"

  const { disposeSessionController } = await import("./session-cdp.js")
  await disposeSessionController(session.id)

  await killChromeProcess(session)
  await releaseProfileLock(session.userDataDir)

  const executable = resolveChromeExecutable()
  const debuggingPort = await getFreePort()
  const child = spawn(
    executable,
    buildChromeArgs({
      debuggingPort,
      userDataDir: session.userDataDir,
      headless: false,
      startUrl: resumeUrl,
    }),
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    },
  )

  session.headless = false
  session.debuggingPort = debuggingPort
  session.cdpHttpBase = `http://127.0.0.1:${debuggingPort}`
  session.process = child
  session.status = "active"
  session.currentUrl = resumeUrl

  child.on("exit", () => {
    if (session.process === child) {
      session.status = "stopped"
      session.process = null
    }
  })

  await waitForDebugger(debuggingPort)
  await refreshSessionMeta(session)
}

/** Move Chrome window off-screen without bringing it to the front. */
export async function placeSessionWindowOffscreen(
  session: LocalBrowserSession,
): Promise<void> {
  const pages = await listPageTargets(session)
  const page = pages[0]
  if (!page?.id || !page.webSocketDebuggerUrl) return
  const { withPageCdp } = await import("./cdp-client.js")
  await withPageCdp(page.webSocketDebuggerUrl, async (client) => {
    try {
      const win = await client.send<{ windowId: number }>("Browser.getWindowForTarget", {
        targetId: page.id,
      })
      if (win?.windowId == null) return
      await client.send("Browser.setWindowBounds", {
        windowId: win.windowId,
        bounds: {
          left: -2800,
          top: 80,
          width: 1280,
          height: 900,
          windowState: "normal",
        },
      })
    } catch {
      // ignore — page-target sockets may lack Browser domain
    }
  })
}

type CdpTarget = {
  id?: string
  type?: string
  url?: string
  title?: string
  webSocketDebuggerUrl?: string
}

export async function listPageTargets(session: LocalBrowserSession): Promise<CdpTarget[]> {
  const response = await fetch(`${session.cdpHttpBase}/json/list`)
  if (!response.ok) throw new Error(`CDP list failed (${response.status})`)
  const data = (await response.json()) as CdpTarget[]
  return data.filter((item) => item.type === "page")
}

export async function refreshSessionMeta(session: LocalBrowserSession): Promise<void> {
  const pages = await listPageTargets(session)
  const page = pages[0]
  if (!page) return
  session.currentUrl = typeof page.url === "string" ? page.url : session.currentUrl
  session.title = typeof page.title === "string" ? page.title : session.title
}

export async function navigateSession(session: LocalBrowserSession, url: string): Promise<void> {
  const targetUrl = url.trim()
  if (!/^https?:\/\//i.test(targetUrl)) {
    throw new Error("Only http(s) URLs are allowed")
  }
  const pages = await listPageTargets(session)
  const page = pages[0]
  const wsUrl = page?.webSocketDebuggerUrl
  if (!wsUrl) throw new Error("No page target available for navigation")

  const { default: WebSocket } = await import("ws")
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      try {
        ws.close()
      } catch {
        // ignore
      }
      if (error) reject(error)
      else resolve()
    }
    const timer = setTimeout(() => finish(new Error("CDP navigate timed out")), 20_000)
    ws.on("open", () => {
      ws.send(JSON.stringify({ id: 1, method: "Page.enable" }))
      ws.send(JSON.stringify({ id: 2, method: "Page.navigate", params: { url: targetUrl } }))
    })
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { id?: number; error?: { message?: string } }
        if (msg.id === 2) {
          clearTimeout(timer)
          if (msg.error?.message) finish(new Error(msg.error.message))
          else finish()
        }
      } catch {
        // ignore
      }
    })
    ws.on("error", (error) => {
      clearTimeout(timer)
      finish(error instanceof Error ? error : new Error(String(error)))
    })
  })

  session.currentUrl = targetUrl
  // Give the page a moment to settle redirects before reading /json/list.
  await new Promise((resolve) => setTimeout(resolve, 250))
  await refreshSessionMeta(session)
  if (!session.currentUrl) session.currentUrl = targetUrl
}

/**
 * Reveal / focus the Articulate Chrome session for human takeover.
 * If the session is headless (embedded default), relaunches the same profile headed
 * without creating a second browser profile.
 */
export async function focusSession(session: LocalBrowserSession): Promise<{
  focused: boolean
  method: string
}> {
  let didRelaunch = false
  if (session.headless) {
    await relaunchSessionHeaded(session)
    didRelaunch = true
  }

  await refreshSessionMeta(session)
  const pages = await listPageTargets(session)
  const page = pages[0]
  const wsUrl = page?.webSocketDebuggerUrl
  if (!wsUrl) throw new Error("No page target available to focus")

  const { withPageCdp } = await import("./cdp-client.js")
  await withPageCdp(wsUrl, async (client) => {
    // Move on-screen before activating so the user can see the same session.
    try {
      if (page.id) {
        const win = await client.send<{ windowId: number }>("Browser.getWindowForTarget", {
          targetId: page.id,
        })
        if (win?.windowId != null) {
          await client.send("Browser.setWindowBounds", {
            windowId: win.windowId,
            bounds: {
              left: 80,
              top: 60,
              width: 1280,
              height: 900,
              windowState: "normal",
            },
          })
        }
      }
    } catch {
      // ignore
    }
    await client.send("Page.bringToFront").catch(() => undefined)
    if (page.id) {
      await client.send("Target.activateTarget", { targetId: page.id }).catch(() => undefined)
    }
  })

  let method = didRelaunch ? "relaunch_headed+cdp" : "cdp_bring_to_front"
  if (process.platform === "darwin") {
    try {
      const { execFile } = await import("node:child_process")
      const { promisify } = await import("node:util")
      const execFileAsync = promisify(execFile)
      await execFileAsync("osascript", [
        "-e",
        'tell application "Google Chrome" to activate',
      ])
      method = didRelaunch
        ? "relaunch_headed+cdp+osascript"
        : "cdp_bring_to_front+osascript"
    } catch {
      // Chrome might be Chromium / Edge — ignore OS activate failure.
    }
  }
  return { focused: true, method }
}

/** PNG screenshot of the active page (base64, no data: prefix). */
export async function captureSessionScreenshot(
  session: LocalBrowserSession,
): Promise<{ mimeType: string; base64: string; url: string; title: string }> {
  await refreshSessionMeta(session)
  const pages = await listPageTargets(session)
  const page = pages[0]
  const wsUrl = page?.webSocketDebuggerUrl
  if (!wsUrl) throw new Error("No page target available for screenshot")

  const { withPageCdp } = await import("./cdp-client.js")
  const result = await withPageCdp(wsUrl, async (client) => {
    return client.send<{ data: string }>("Page.captureScreenshot", {
      format: "jpeg",
      quality: 60,
      fromSurface: true,
    })
  })
  return {
    mimeType: "image/jpeg",
    base64: result.data,
    url: session.currentUrl,
    title: session.title,
  }
}

export async function stopSession(session: LocalBrowserSession): Promise<void> {
  const child = session.process
  session.process = null
  if (child) {
    try {
      if (!child.killed) {
        child.kill("SIGTERM")
        await new Promise((resolve) => setTimeout(resolve, 400))
      }
      if (!child.killed) {
        child.kill("SIGKILL")
      }
    } catch {
      // Process may already have exited (user closed the window).
    }
  }
  session.status = "stopped"
  if (!session.persistentProfile) {
    try {
      rmSync(session.userDataDir, { recursive: true, force: true })
    } catch {
      // best-effort temp cleanup
    }
  }
}

export function publicSessionView(session: LocalBrowserSession) {
  return {
    id: session.id,
    status: session.status,
    startUrl: session.startUrl,
    currentUrl: session.currentUrl,
    title: session.title,
    startedAt: session.startedAt,
    persistentProfile: session.persistentProfile,
    profileKey: session.profileKey,
    headless: session.headless,
    // Never expose CDP websocket URLs or filesystem paths to untrusted clients.
  }
}
