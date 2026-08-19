/**
 * Browser Live View sizing.
 *
 * Remote Browser Use screen size is stable session configuration (desktop).
 * The Articulate viewer scales/crops independently (Fit / Fill) and must never
 * drive continuous remote screenWidth/screenHeight changes.
 */

export type BrowserViewportSize = {
  width: number
  height: number
}

/** Stable desktop remote screen for new Cloud browser sessions. */
export const BROWSER_USE_SCREEN_WIDTH = 1440
export const BROWSER_USE_SCREEN_HEIGHT = 900

/**
 * Browser Use Live View player is 16:9 (their documented iframe embed).
 * AI Chat Cloud sessions are provisioned at this size and then CDP-aligned
 * so the captured window fills the player (no device-metrics letterbox).
 */
export const CLOUD_LIVE_VIEW_SCREEN_WIDTH = 1920
export const CLOUD_LIVE_VIEW_SCREEN_HEIGHT = 1080

/**
 * Browser Use Live View player is 16:9 (their documented iframe embed).
 * A 16:10 host around that stream letterboxes with a black band.
 * Viewer layout must use this stream aspect, not the remote desktop screen.
 */
export const LIVE_VIEW_STREAM_WIDTH = 16
export const LIVE_VIEW_STREAM_HEIGHT = 9

/** @deprecated Prefer Fit/Fill viewer modes; kept for diagnostics / older callers. */
export type BrowserRenderScale = 1 | 1.5 | 2

const MIN = 320
const MAX_WIDTH = 6144
const MAX_HEIGHT = 3456

export const BROWSER_VIEWPORT_HOST_ATTR = "data-browser-viewport-host"

/** Allowed Cloud render scales (legacy; not used to size the remote browser from the pane). */
export const BROWSER_RENDER_SCALES: readonly BrowserRenderScale[] = [1, 1.5, 2]

export type BrowserViewerMode = "fit" | "fill"

export function clampBrowserViewport(size: {
  width: number
  height: number
}): BrowserViewportSize {
  return {
    width: Math.min(MAX_WIDTH, Math.max(MIN, Math.round(size.width))),
    height: Math.min(MAX_HEIGHT, Math.max(MIN, Math.round(size.height))),
  }
}

/** Fixed desktop viewport used when provisioning a NEW Browser Use browser. */
export function defaultBrowserUseScreen(): BrowserViewportSize {
  return clampBrowserViewport({
    width: BROWSER_USE_SCREEN_WIDTH,
    height: BROWSER_USE_SCREEN_HEIGHT,
  })
}

/** Read the currently available Browser pane content box (CSS pixels) — viewer host only. */
export function measureBrowserPaneViewport(
  element: HTMLElement | null | undefined,
): BrowserViewportSize | null {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return null
  return clampBrowserViewport({ width: rect.width, height: rect.height })
}

/**
 * Fallback when the viewer host has not measured yet.
 * Not used as the remote Browser Use screen size.
 */
export function fallbackBrowserPaneViewport(): BrowserViewportSize {
  return clampBrowserViewport({ width: 480, height: 900 })
}

/**
 * Wait until the Browser content area has meaningful non-zero CSS-pixel size.
 * Used for Articulate viewer layout only — never to provision remote screen size.
 */
export function waitForBrowserPaneViewport(
  element: HTMLElement | null | undefined,
  options?: { timeoutMs?: number; minWidth?: number; minHeight?: number },
): Promise<BrowserViewportSize> {
  const timeoutMs = options?.timeoutMs ?? 4000
  const minWidth = options?.minWidth ?? 120
  const minHeight = options?.minHeight ?? 120
  const fallback = fallbackBrowserPaneViewport()

  const read = () => {
    const measured = measureBrowserPaneViewport(element)
    if (!measured) return null
    if (measured.width < minWidth || measured.height < minHeight) return null
    return measured
  }

  const immediate = read()
  if (immediate) return Promise.resolve(immediate)
  if (!element || typeof ResizeObserver === "undefined") {
    return Promise.resolve(read() ?? fallback)
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (value: BrowserViewportSize) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      observer.disconnect()
      resolve(value)
    }

    const observer = new ResizeObserver(() => {
      const next = read()
      if (next) finish(next)
    })
    observer.observe(element)

    const timer = window.setTimeout(() => {
      finish(read() ?? fallback)
    }, timeoutMs)

    queueMicrotask(() => {
      const next = read()
      if (next) finish(next)
    })
  })
}

export function parseBrowserRenderScale(value: unknown): BrowserRenderScale | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim())
  if (n === 1 || n === 1.5 || n === 2) return n
  return null
}

/**
 * Resolve Cloud render scale (legacy diagnostics).
 * Remote provisioning always uses {@link defaultBrowserUseScreen}.
 */
export function resolveBrowserRenderScale(options?: {
  explicit?: number | null
  devicePixelRatio?: number | null
}): BrowserRenderScale {
  const fromExplicit = parseBrowserRenderScale(options?.explicit)
  if (fromExplicit) return fromExplicit

  if (typeof process !== "undefined") {
    const raw = String(process.env.NEXT_PUBLIC_CLOUD_BROWSER_RENDER_SCALE ?? "").trim()
    if (raw.toLowerCase() === "auto") {
      const dpr = Number(options?.devicePixelRatio)
      if (Number.isFinite(dpr) && dpr > 0) {
        if (dpr >= 1.75) return 2
        if (dpr >= 1.25) return 1.5
        return 1
      }
      return 1
    }
    const fromEnv = parseBrowserRenderScale(raw)
    if (fromEnv) return fromEnv
  }

  return 1
}

/**
 * @deprecated Pane size must not drive remote screen size.
 * Returns the fixed desktop screen; `pane` is retained only for diagnostics.
 */
export function remoteScreenForCloudBrowser(
  _pane: BrowserViewportSize,
  _scale: BrowserRenderScale = 1,
): BrowserViewportSize {
  return defaultBrowserUseScreen()
}

export type CloudBrowserViewportPlan = {
  pane: BrowserViewportSize
  scale: BrowserRenderScale
  screen: BrowserViewportSize
  devicePixelRatio: number | null
}

/**
 * Plan remote screen for a NEW browser provision.
 * Always uses the stable desktop size — pane dimensions are diagnostics only.
 */
export function planCloudBrowserViewport(
  pane: BrowserViewportSize = defaultBrowserUseScreen(),
  options?: { explicitScale?: number | null; devicePixelRatio?: number | null },
): CloudBrowserViewportPlan {
  const devicePixelRatio =
    options?.devicePixelRatio != null && Number.isFinite(Number(options.devicePixelRatio))
      ? Number(options.devicePixelRatio)
      : typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio)
        ? window.devicePixelRatio
        : null
  const scale = resolveBrowserRenderScale({
    explicit: options?.explicitScale,
    devicePixelRatio,
  })
  return {
    pane: clampBrowserViewport(pane),
    scale,
    screen: defaultBrowserUseScreen(),
    devicePixelRatio,
  }
}

/**
 * Live View embed params.
 *
 * Browser Use only documents `ui=false` (hide all provider chrome including tabs).
 * Articulate draws its own URL / back / forward / history bar above the iframe.
 */
export function withLiveViewEmbedParams(url: string): string {
  const trimmed = String(url ?? "").trim()
  if (!trimmed) return trimmed
  try {
    const parsed = new URL(trimmed)
    parsed.searchParams.set("ui", "false")
    return parsed.toString()
  } catch {
    return trimmed
  }
}

/**
 * Fit — show the entire remote browser, preserve aspect ratio, center in the host.
 * Unused space is Articulate UI (host background), never provider black letterboxing.
 */
export function liveViewFitLayout(args: {
  hostWidth: number
  hostHeight: number
  remoteWidth: number
  remoteHeight: number
}): { width: number; height: number; left: number; top: number } {
  const hostWidth = Math.max(1, Math.round(args.hostWidth))
  const hostHeight = Math.max(1, Math.round(args.hostHeight))
  const remoteWidth = Math.max(1, Math.round(args.remoteWidth))
  const remoteHeight = Math.max(1, Math.round(args.remoteHeight))
  const scale = Math.min(hostWidth / remoteWidth, hostHeight / remoteHeight)
  const width = Math.max(1, Math.round(remoteWidth * scale))
  const height = Math.max(1, Math.round(remoteHeight * scale))
  return {
    width,
    height,
    left: Math.round((hostWidth - width) / 2),
    top: Math.round((hostHeight - height) / 2),
  }
}

/**
 * Fill — cover the host while preserving aspect ratio (crop overflow). No distortion.
 */
export function liveViewCoverLayout(args: {
  hostWidth: number
  hostHeight: number
  remoteWidth: number
  remoteHeight: number
  /** Chat/overlay: pin to top so a letterboxed stream crops the black band, not the page. */
  verticalAlign?: "top" | "center"
}): { width: number; height: number; left: number; top: number } {
  const hostWidth = Math.max(1, Math.round(args.hostWidth))
  const hostHeight = Math.max(1, Math.round(args.hostHeight))
  const remoteWidth = Math.max(1, Math.round(args.remoteWidth))
  const remoteHeight = Math.max(1, Math.round(args.remoteHeight))
  const scale = Math.max(hostWidth / remoteWidth, hostHeight / remoteHeight)
  const width = Math.max(hostWidth, Math.round(remoteWidth * scale))
  const height = Math.max(hostHeight, Math.round(remoteHeight * scale))
  return {
    width,
    height,
    left: Math.round((hostWidth - width) / 2),
    top: args.verticalAlign === "top" ? 0 : Math.round((hostHeight - height) / 2),
  }
}

export function liveViewLayoutForMode(
  mode: BrowserViewerMode,
  args: {
    hostWidth: number
    hostHeight: number
    remoteWidth: number
    remoteHeight: number
  },
): { width: number; height: number; left: number; top: number } {
  return mode === "fill" ? liveViewCoverLayout(args) : liveViewFitLayout(args)
}

/**
 * @deprecated Prefer {@link liveViewCoverLayout} with known remote dimensions.
 */
export function liveViewHostCoverLayout(
  host: { width: number; height: number },
  factor: number = 1,
): { width: number; height: number; left: number; top: number } {
  const hostWidth = Math.max(1, Math.round(host.width))
  const hostHeight = Math.max(1, Math.round(host.height))
  const safeFactor = Number.isFinite(factor) && factor >= 1 ? factor : 1
  const width = Math.max(hostWidth, Math.round(hostWidth * safeFactor))
  const height = Math.max(hostHeight, Math.round(hostHeight * safeFactor))
  return {
    width,
    height,
    left: Math.round((hostWidth - width) / 2),
    top: Math.round((hostHeight - height) / 2),
  }
}

/** Stable right-pane Browser tab id for a publish flow (avoids duplicate tabs). */
export function buildPublishBrowserTabId(args: {
  artifactId?: string | null
  destinationId?: string | null
}): string {
  if (args.artifactId && args.destinationId) {
    return `pub-${args.artifactId.slice(0, 8)}-${args.destinationId.slice(0, 8)}`
  }
  if (args.artifactId) return `pub-artifact-${args.artifactId}`
  if (args.destinationId) return `pub-dest-${args.destinationId}`
  return `pub-${Date.now()}`
}
