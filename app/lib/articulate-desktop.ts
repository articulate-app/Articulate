/**
 * Feature detection + typed bridge for Articulate Desktop (Electron).
 * Safe in normal browsers — window.articulateDesktop is only present under Electron.
 */

export type DesktopBrowserBounds = {
  x: number
  y: number
  width: number
  height: number
  visible: boolean
}

export type DesktopBrowserState = {
  id: string
  url: string
  title: string
  favicon: string | null
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  sessionPartition: string
}

export type DesktopCapability =
  | "browser"
  | "desktop_browser_provider"
  | "agent_control"
  | "auto_update"
  | "native_webcontents_view"
  | (string & {})

export type DesktopInfo = {
  isDesktop: true
  /** Present on Desktop ≥ 1.0.0 */
  desktopVersion?: string
  capabilities?: DesktopCapability[]
  electron: string
  chromium: string
  platform: string
  arch: string
  sessionPartition: string
  browserViewActive: boolean
  activeBrowserId: string | null
  bounds: DesktopBrowserBounds | null
  url: string | null
  isPackaged?: boolean
  appUrl?: string
}

export type DesktopControlState = {
  controlOwner: "agent" | "human"
  agentGeneration: number
}

/**
 * Runtime facts attached to AI requests. These are deliberately obtained from
 * the Electron preload bridge, never from the user-authored chat message.
 */
export type DesktopClientRuntimeContext = {
  client_runtime: "desktop" | "web"
  desktop_available: boolean
  native_browser_available: boolean
  desktop_browser_control: boolean
  desktop_version: string | null
  desktop_session_id: string | null
}

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

export type ArticulateDesktopApi = {
  isDesktop: true
  getInfo: () => Promise<DesktopInfo>
  updates?: {
    getStatus: () => Promise<DesktopUpdateStatus>
    check: () => Promise<{ ok: boolean; reason?: string; message?: string }>
    install: () => Promise<{ ok: boolean; reason?: string }>
    onStatus: (listener: (payload: DesktopUpdateStatus) => void) => () => void
  }
  browser: {
    create: (options?: { id?: string; url?: string }) => Promise<DesktopBrowserState>
    close: (id: string) => Promise<{ ok: boolean }>
    show: (id: string) => Promise<{ ok: boolean }>
    hide: (id?: string) => Promise<{ ok: boolean }>
    setBounds: (id: string, bounds: DesktopBrowserBounds) => Promise<{ ok: boolean }>
    navigate: (id: string, url: string) => Promise<{ ok: boolean }>
    back: (id: string) => Promise<{ ok: boolean }>
    forward: (id: string) => Promise<{ ok: boolean }>
    reload: (id: string) => Promise<{ ok: boolean }>
    stop: (id: string) => Promise<{ ok: boolean }>
    getState: (id: string) => Promise<DesktopBrowserState | null>
    observe?: (id: string) => Promise<unknown>
    agentAction?: (
      id: string,
      generation: number,
      action: Record<string, unknown>,
    ) => Promise<{ ok: boolean; dropped?: boolean; reason?: string }>
    beginAgent?: () => Promise<DesktopControlState>
    getControl?: () => Promise<DesktopControlState>
    bumpHuman?: () => Promise<DesktopControlState>
    onControl?: (listener: (payload: DesktopControlState) => void) => () => void
    onState: (listener: (state: DesktopBrowserState) => void) => () => void
    onMeta: (
      listener: (payload: {
        id: string
        title: string
        favicon: string | null
        url: string
      }) => void,
    ) => () => void
    onDownload: (
      listener: (payload: {
        id: string
        filename: string
        url: string
        state: string
      }) => void,
    ) => () => void
    onPopup: (
      listener: (payload: { id: string; url: string; openerId: string }) => void,
    ) => () => void
  }
}

declare global {
  interface Window {
    articulateDesktop?: ArticulateDesktopApi
  }
}

export function isArticulateDesktopAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.articulateDesktop?.isDesktop)
}

export function getArticulateDesktop(): ArticulateDesktopApi | null {
  if (!isArticulateDesktopAvailable()) return null
  return window.articulateDesktop ?? null
}

const DESKTOP_SESSION_STORAGE_KEY = "articulate.desktop-session-id"

function desktopSessionId(): string | null {
  if (typeof window === "undefined") return null
  try {
    const existing = window.sessionStorage.getItem(DESKTOP_SESSION_STORAGE_KEY)
    if (existing) return existing
    const next =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `desktop-${Date.now()}-${Math.random().toString(36).slice(2)}`
    window.sessionStorage.setItem(DESKTOP_SESSION_STORAGE_KEY, next)
    return next
  } catch {
    return null
  }
}

/**
 * Read the Desktop capability handshake from Electron's trusted preload API.
 * Web clients receive an explicit negative capability set, so the backend can
 * make execution-location decisions without interpreting message text.
 */
export async function getDesktopClientRuntimeContext(): Promise<DesktopClientRuntimeContext> {
  const api = getArticulateDesktop()
  if (!api) {
    return {
      client_runtime: "web",
      desktop_available: false,
      native_browser_available: false,
      desktop_browser_control: false,
      desktop_version: null,
      desktop_session_id: null,
    }
  }

  try {
    const info = await api.getInfo()
    const capabilities = new Set(info.capabilities ?? [])
    // Older Desktop shells did not advertise capability flags but did expose
    // the base native browser API. Do not assume agent control in that case.
    const nativeBrowser =
      capabilities.size === 0 ||
      capabilities.has("browser") ||
      capabilities.has("native_webcontents_view")
    const browserControl =
      capabilities.has("desktop_browser_provider") &&
      capabilities.has("agent_control") &&
      Boolean(api.browser.observe && api.browser.agentAction && api.browser.beginAgent)
    return {
      client_runtime: "desktop",
      desktop_available: true,
      native_browser_available: nativeBrowser,
      desktop_browser_control: browserControl,
      desktop_version: info.desktopVersion ?? null,
      desktop_session_id: desktopSessionId(),
    }
  } catch {
    // The preload object itself is sufficient to identify the Desktop shell,
    // but failure to read its capabilities must never claim agent control.
    return {
      client_runtime: "desktop",
      desktop_available: true,
      native_browser_available: Boolean(api.browser.create),
      desktop_browser_control: false,
      desktop_version: null,
      desktop_session_id: desktopSessionId(),
    }
  }
}

/**
 * True when the installed Desktop shell advertises a capability.
 * Older shells without `capabilities` are treated as supporting base browser only.
 */
export function desktopSupportsCapability(capability: DesktopCapability): boolean {
  const api = getArticulateDesktop()
  if (!api) return false
  // Sync probe is best-effort; callers that need certainty should await getInfo().
  return true
}

export async function desktopHasCapability(
  capability: DesktopCapability,
): Promise<boolean> {
  const api = getArticulateDesktop()
  if (!api) return false
  try {
    const info = await api.getInfo()
    if (!info.capabilities || info.capabilities.length === 0) {
      // Pre-1.0 shells: browser surface exists, agent/update may not.
      return capability === "browser" || capability === "native_webcontents_view"
    }
    return info.capabilities.includes(capability)
  } catch {
    return false
  }
}

/** Compare Desktop shell semver; returns true when installed ≥ required. */
export function isDesktopVersionAtLeast(
  installed: string | undefined,
  required: string,
): boolean {
  if (!installed) return false
  const parse = (v: string) =>
    v
      .replace(/^v/i, "")
      .split(".")
      .map((p) => Number.parseInt(p, 10) || 0)
  const a = parse(installed)
  const b = parse(required)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left > right) return true
    if (left < right) return false
  }
  return true
}

export const DESKTOP_UPDATE_REQUIRED_MESSAGE =
  "A newer Articulate Desktop version is required for this feature. Update Articulate from the app menu or download the latest installer."
