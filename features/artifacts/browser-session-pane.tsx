"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "../../app/components/ui/button"
import {
  completePublishingDestinationConnect,
  cleanupBrowsers,
  syncPublicationRun,
  continuePublicationAfterUser,
  confirmPublication,
  takePublicationControl,
  cancelPublication,
  getPublicationRun,
  startArtifactPublication,
  controlBrowser,
  type BrowserHistoryEntry,
} from "../../app/lib/services/agentic-publishing"
import {
  runLocalPublicationDriver,
  stopLocalPublicationBrowser,
} from "../../app/lib/local-publication-driver"
import {
  beginLocalBrowserAgentRun,
  bumpLocalBrowserHumanControl,
} from "../../app/lib/local-browser-agent-control"
import {
  claimManualBrowserOpen,
  openBrowserSession,
  stopOpenedBrowserSession,
} from "../../app/lib/open-browser-session"
import {
  isBrowserSurfaceOverlayActive,
  subscribeBrowserSurfaceOverlay,
} from "../../app/lib/browser-surface-overlay"
import { BrowserChromeBar } from "./browser-chrome-bar"
import { LocalBrowserSurface } from "./local-browser-surface"
import { DesktopBrowserSurface } from "./desktop-browser-surface"
import { isArticulateDesktopAvailable } from "../../app/lib/articulate-desktop"
import type { PublicationRun } from "../../app/lib/publishing/types"
import {
  isActivePublicationStatus,
  shouldPollPublicationSync,
} from "../../app/lib/publishing/types"
import {
  defaultBrowserUseScreen,
  liveViewLayoutForMode,
  measureBrowserPaneViewport,
  withLiveViewEmbedParams,
  type BrowserViewerMode,
  type BrowserViewportSize,
} from "../../app/lib/publishing/browser-viewport"
import {
  markCloudPublishTiming,
  reportCloudPublishTiming,
  startCloudPublishTiming,
} from "../../app/lib/publishing/cloud-timing"
import type { RightPaneBrowserAssociations } from "../../app/store/right-pane-tabs"
import { BrowserPanePlaceholder } from "./browser-pane-placeholder"

type BrowserSessionPaneProps = {
  title: string
  browser: RightPaneBrowserAssociations
  /** Workspace tab id (`browser:{tabId}`) — used to claim an eager open from the + menu. */
  tabId?: string | null
  onBrowserChange?: (patch: RightPaneBrowserAssociations) => void
  onClose?: () => void
  showConnectControls?: boolean
}

function humanStatusMessage(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  // Never dump raw provider/application JSON into the main UI.
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return null
  return trimmed
}

function isConcurrentSessionLimitMessage(message: string): boolean {
  return /concurrent sessions? reached|too many concurrent|free plan limit:\s*3 concurrent/i.test(
    message,
  )
}

function logCloudScreen(label: string, screen: BrowserViewportSize, extra?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return
  console.info(`[publishing] ${label}`, {
    requested_screen_width: screen.width,
    requested_screen_height: screen.height,
    ...extra,
  })
}

export function BrowserSessionPane({
  title,
  browser,
  tabId = null,
  onBrowserChange,
  onClose: _onClose,
  showConnectControls = true,
}: BrowserSessionPaneProps) {
  const viewportHostRef = useRef<HTMLDivElement | null>(null)
  const provisionStartedRef = useRef<string | null>(null)
  const provisionGenerationRef = useRef(0)
  const timingKeyRef = useRef<string | null>(null)
  const onBrowserChangeRef = useRef(onBrowserChange)
  onBrowserChangeRef.current = onBrowserChange
  const [busy, setBusy] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusNote, setStatusNote] = useState<string | null>(null)
  const [run, setRun] = useState<PublicationRun | null>(null)
  const [isProvisioning, setIsProvisioning] = useState(false)
  const [hostSize, setHostSize] = useState<{ width: number; height: number } | null>(null)
  const [viewerMode, setViewerMode] = useState<BrowserViewerMode>(
    browser.viewerMode === "fill" ? "fill" : "fit",
  )
  const [navUrl, setNavUrl] = useState("")
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [navHistory, setNavHistory] = useState<BrowserHistoryEntry[]>([])
  const [navBusy, setNavBusy] = useState(false)
  const [liveViewDisconnected, setLiveViewDisconnected] = useState(false)
  const [localControl, setLocalControl] = useState<"human" | "agent">("human")
  const [overlayActive, setOverlayActive] = useState(isBrowserSurfaceOverlayActive)
  const localControlRef = useRef(localControl)
  localControlRef.current = localControl

  useEffect(() => subscribeBrowserSurfaceOverlay(() => {
    setOverlayActive(isBrowserSurfaceOverlayActive())
  }), [])

  const startLocalAgentCallbacks = (extra?: {
    onStatus?: (message: string) => void
    onRun?: (run: PublicationRun) => void
  }) => {
    const agentRun = beginLocalBrowserAgentRun()
    setLocalControl("agent")
    return {
      controlGeneration: agentRun.generation,
      signal: agentRun.signal,
      shouldPause: () => localControlRef.current === "human",
      onStatus: extra?.onStatus,
      onRun: extra?.onRun,
    }
  }
  const [pairingNeeded, setPairingNeeded] = useState(false)
  const [pairingBusy, setPairingBusy] = useState(false)
  const pendingOpenAfterPairRef = useRef(false)
  const urlBarEditingRef = useRef(false)
  const statusFailCountRef = useRef(0)
  const remoteScreen = defaultBrowserUseScreen()
  const remoteWidth = browser.requestedScreenWidth ?? remoteScreen.width
  const remoteHeight = browser.requestedScreenHeight ?? remoteScreen.height

  const rawLiveViewUrl = browser.liveViewUrl ?? run?.live_view_url ?? null
  const liveViewUrl = rawLiveViewUrl ? withLiveViewEmbedParams(rawLiveViewUrl) : null
  const destinationName = browser.destinationName || title || "this site"
  const destinationNameRef = useRef(destinationName)
  destinationNameRef.current = destinationName
  const publicationRunId = browser.publicationRunId ?? null
  const destinationId = browser.destinationId ?? null
  const artifactId = browser.artifactId ?? null
  const browserId = browser.browserId ?? null
  const intentionallyStopped = Boolean(browser.intentionallyStopped)
  const awaitingDestinationAuth =
    Boolean(browser.phase === "needs_user" || browser.phase === "connecting") ||
    Boolean(run?.metadata?.awaiting_destination_auth) ||
    Boolean(run?.error_code === "authentication_required" && run?.status === "needs_user")

  const applyNavState = (result: {
    url?: string | null
    can_go_back?: boolean
    can_go_forward?: boolean
    history?: BrowserHistoryEntry[] | null
  }) => {
    // Never clobber in-progress address-bar typing with the polled remote URL.
    if (typeof result.url === "string" && !urlBarEditingRef.current) {
      setNavUrl(result.url)
    }
    setCanGoBack(Boolean(result.can_go_back))
    setCanGoForward(Boolean(result.can_go_forward))
    if (Array.isArray(result.history)) setNavHistory(result.history)
  }

  // Measure the Live View host for Articulate Fit/Fill layout only — never remote screen size.
  useEffect(() => {
    const host = viewportHostRef.current
    if (!host || typeof ResizeObserver === "undefined") return
    const update = () => {
      const measured = measureBrowserPaneViewport(host)
      if (measured) setHostSize(measured)
    }
    update()
    const observer = new ResizeObserver(() => update())
    observer.observe(host)
    return () => observer.disconnect()
  }, [liveViewUrl, browser.phase])

  // Interactive / takeover moments always show the complete remote screen (Fit).
  useEffect(() => {
    if (
      browser.phase === "needs_user" ||
      awaitingDestinationAuth ||
      run?.status === "needs_user" ||
      run?.status === "awaiting_publish_confirmation"
    ) {
      setViewerMode("fit")
    }
  }, [
    awaitingDestinationAuth,
    browser.phase,
    run?.status,
  ])

  // Poll remote URL / history for Articulate chrome (Live View is cross-origin).
  useEffect(() => {
    if (!liveViewUrl || intentionallyStopped) return
    if (!browserId && !publicationRunId) return
    let cancelled = false
    let interval: number | null = null
    statusFailCountRef.current = 0
    setLiveViewDisconnected(false)

    const stopPolling = () => {
      cancelled = true
      if (interval != null) {
        window.clearInterval(interval)
        interval = null
      }
    }

    const tick = async () => {
      try {
        const result = await controlBrowser({
          browserId,
          publicationRunId,
          command: "status",
        })
        if (cancelled) return
        // Remote browser ended — stop health checks so we don't flood the edge logs.
        if (result.active === false) {
          setLiveViewDisconnected(true)
          stopPolling()
          return
        }
        statusFailCountRef.current = 0
        setLiveViewDisconnected(false)
        applyNavState(result)
      } catch {
        if (cancelled) return
        statusFailCountRef.current += 1
        // Hide Browser Use disconnect interstitial; show Articulate reconnect UI.
        if (statusFailCountRef.current >= 2) {
          setLiveViewDisconnected(true)
          stopPolling()
        }
      }
    }
    void tick()
    interval = window.setInterval(() => void tick(), 2500)
    return () => {
      stopPolling()
    }
  }, [browserId, intentionallyStopped, liveViewUrl, publicationRunId])

  // + → Browser (no destination): Desktop → Local-first via shared openBrowserSession resolver.
  useEffect(() => {
    if (browser.phase !== "provisioning") return
    if (destinationId || artifactId || publicationRunId || liveViewUrl) return
    if (browser.provider === "articulate_desktop" && browser.browserId) return
    if (browser.provider === "browser_use_local" && browser.bridgeSessionId) return
    const workspaceTabId = typeof tabId === "string" && tabId.trim() ? tabId.trim() : null
    const provisionKey = `standalone:${workspaceTabId || browserId || "new"}`
    if (provisionStartedRef.current === provisionKey) return
    provisionStartedRef.current = provisionKey
    const generation = ++provisionGenerationRef.current

    let cancelled = false
    const isCurrent = () =>
      !cancelled && provisionGenerationRef.current === generation

    void (async () => {
      setIsProvisioning(true)
      setError(null)
      setStatusNote(
        isArticulateDesktopAvailable() ? "Starting desktop browser…" : "Starting browser…",
      )
      try {
        if (!isCurrent()) return
        let opened
        try {
          const claimed = workspaceTabId ? claimManualBrowserOpen(workspaceTabId) : null
          opened = await (claimed ??
            openBrowserSession({
              startUrl: "https://www.google.com/",
              source: "manual",
              profileKey: "manual-browser",
              desktopBrowserId: workspaceTabId,
            }))
        } catch (openError) {
          const message = openError instanceof Error ? openError.message : String(openError)
          if (!isConcurrentSessionLimitMessage(message)) throw openError
          setStatusNote("Freeing older cloud browser sessions…")
          await cleanupBrowsers()
          if (!isCurrent()) return
          opened = await openBrowserSession({
            startUrl: "https://www.google.com/",
            source: "manual",
            profileKey: "manual-browser",
            desktopBrowserId: workspaceTabId,
          })
        }
        // Commit success even if this effect was cleaned up (React Strict Mode remount).
        // Dropping a completed open left the tab stuck on "Could not open" until Retry.
        const screen = defaultBrowserUseScreen()
        onBrowserChangeRef.current?.({
          browserId: opened.browserId,
          bridgeSessionId: opened.bridgeSessionId,
          sessionId: opened.bridgeSessionId ?? opened.browserId,
          liveViewUrl: opened.liveViewUrl,
          provider: opened.provider,
          source: "manual",
          currentUrl: opened.currentUrl,
          pageTitle: opened.title,
          faviconUrl: opened.faviconUrl ?? null,
          intentionallyStopped: false,
          phase: opened.provider === "articulate_desktop" ? "desktop_ready" : "ready",
          connectMessage:
            opened.provider === "articulate_desktop" ? "Native Chromium browser." : null,
          requestedScreenWidth: screen.width,
          requestedScreenHeight: screen.height,
          viewerMode: "fit",
        })
        if (!isCurrent()) return
        setStatusNote(opened.provider === "articulate_desktop" ? "Browser · Desktop" : null)
        setNavUrl(opened.currentUrl || "")
      } catch (err) {
        if (!isCurrent()) return
        setError(err instanceof Error ? err.message : "Could not open browser")
        setStatusNote(null)
        onBrowserChangeRef.current?.({ phase: "failed" })
      } finally {
        if (provisionGenerationRef.current === generation) {
          provisionStartedRef.current = null
          setIsProvisioning(false)
        }
      }
    })()

    return () => {
      cancelled = true
      if (provisionStartedRef.current === provisionKey) {
        provisionStartedRef.current = null
      }
    }
  }, [
    artifactId,
    browser.bridgeSessionId,
    browser.phase,
    browser.provider,
    browserId,
    destinationId,
    liveViewUrl,
    publicationRunId,
    tabId,
  ])

  // Auto-start a NEW publication with a stable desktop remote viewport.
  // Use a generation token (not a sticky lock): URL thrash used to cancel the first
  // attempt while leaving provisionStartedRef set, which stuck the pane forever.
  useEffect(() => {
    if (browser.phase !== "provisioning") return
    if (!destinationId || !artifactId || publicationRunId) return
    const generation = ++provisionGenerationRef.current
    provisionStartedRef.current = `${artifactId}:${destinationId}:${generation}`

    let cancelled = false
    const isCurrent = () =>
      !cancelled && provisionGenerationRef.current === generation

    void (async () => {
      setIsProvisioning(true)
      setError(null)
      setStatusNote("Starting browser…")
      const timingKey = startCloudPublishTiming(`${artifactId}:${destinationId}`)
      timingKeyRef.current = timingKey
      try {
        const screen = defaultBrowserUseScreen()
        if (!isCurrent()) return
        logCloudScreen("provisioning viewport", screen, { provider_session_id: null })
        markCloudPublishTiming(timingKey, "T1_supabase_request_start", {
          requested_screen_width: screen.width,
          requested_screen_height: screen.height,
        })
        const started = await startArtifactPublication({
          artifactId,
          destinationId,
          browserViewport: screen,
        })
        if (!isCurrent()) return
        const next = started.run
        setRun(next)
        markCloudPublishTiming(timingKey, "T2_run_created", {
          provider_run_id: next.provider_run_id ?? null,
          server_run_create_ms: started.diagnostics?.timing_ms?.run_create ?? null,
        })

        // Desktop-first: open native WebContentsView; do not start Local Bridge.
        if (
          started.desktop_browser?.required ||
          next.provider === "articulate_desktop" ||
          isArticulateDesktopAvailable()
        ) {
          const startUrl =
            started.desktop_browser?.start_url ||
            "https://www.google.com/"
          const desktopId =
            (typeof tabId === "string" && tabId.trim() ? tabId.trim() : null) ||
            next.id
          setStatusNote("Browser · Desktop")
          onBrowserChangeRef.current?.({
            liveViewUrl: null,
            sessionId: desktopId,
            browserId: desktopId,
            publicationRunId: next.id,
            provider: "articulate_desktop",
            phase: "desktop_ready",
            currentUrl: startUrl,
            destinationName: destinationNameRef.current,
            connectMessage:
              typeof started.message === "string" && !started.message.trim().startsWith("{")
                ? started.message
                : "Browser running in Articulate Desktop",
            requestedScreenWidth: screen.width,
            requestedScreenHeight: screen.height,
            viewerMode: "fit",
          })
          // Open/navigate the same Desktop WebContents the human sees.
          try {
            const { getArticulateDesktop } = await import("../../app/lib/articulate-desktop")
            const desktop = getArticulateDesktop()
            if (desktop) {
              await desktop.browser.create({ id: desktopId, url: startUrl })
            }
          } catch {
            // Surface stays on DesktopBrowserSurface mount path.
          }
          return
        }

        // Legacy Local Bridge path — do not start new local sessions.
        if (started.local_browser?.required || next.provider === "browser_use_local") {
          setError(
            "Local Browser Bridge is deprecated. Open Articulate Desktop to publish interactively, or use Cloud.",
          )
          onBrowserChangeRef.current?.({ phase: "failed", provider: next.provider })
          return
        }

        if (started.live_view_url || next.live_view_url) {
          markCloudPublishTiming(timingKey, "T3_browser_ready", {
            server_browser_ready_ms: started.diagnostics?.timing_ms?.browser_ready ?? null,
            profile_loaded: started.diagnostics?.profile_loaded ?? null,
            profile_id_suffix: started.diagnostics?.profile_id_suffix ?? null,
            proxy_country_code: started.diagnostics?.proxy_country_code ?? null,
            new_browser_session: started.diagnostics?.new_browser_session ?? true,
            reused_connect_session: started.diagnostics?.reused_connect_session ?? false,
          })
        }
        logCloudScreen("provisioned session", screen, {
          provider_session_id: next.provider_session_id ?? started.connect_session_id ?? null,
          profile_loaded: started.diagnostics?.profile_loaded ?? null,
          profile_id_suffix: started.diagnostics?.profile_id_suffix ?? null,
          proxy_country_code: started.diagnostics?.proxy_country_code ?? null,
          new_browser_session: started.diagnostics?.new_browser_session ?? true,
          reused_connect_session: started.diagnostics?.reused_connect_session ?? false,
        })
        if (started.needs_authentication) {
          setStatusNote(
            humanStatusMessage(started.message) || "Sign in required",
          )
          onBrowserChangeRef.current?.({
            liveViewUrl: started.live_view_url ?? next.live_view_url ?? null,
            sessionId: started.connect_session_id ?? null,
            publicationRunId: next.id,
            connectMessage:
              typeof started.message === "string" && !started.message.trim().startsWith("{")
                ? started.message
                : null,
            phase: "needs_user",
            destinationName: destinationNameRef.current,
            requestedScreenWidth: screen.width,
            requestedScreenHeight: screen.height,
            viewerMode: "fit",
          })
        } else {
          setStatusNote(null)
          onBrowserChangeRef.current?.({
            liveViewUrl: next.live_view_url ?? null,
            sessionId: next.provider_session_id ?? null,
            publicationRunId: next.id,
            phase: next.status,
            destinationName: destinationNameRef.current,
            connectMessage: null,
            requestedScreenWidth: screen.width,
            requestedScreenHeight: screen.height,
            viewerMode: "fit",
          })
        }
        reportCloudPublishTiming(timingKey)
      } catch (err) {
        if (!isCurrent()) return
        setError(err instanceof Error ? err.message : "Could not start publication")
        setStatusNote(null)
        onBrowserChangeRef.current?.({ phase: "failed" })
      } finally {
        if (provisionGenerationRef.current === generation) {
          provisionStartedRef.current = null
          setIsProvisioning(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    artifactId,
    browser.phase,
    destinationId,
    publicationRunId,
  ])

  useEffect(() => {
    if (!publicationRunId) {
      setRun(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const next = await getPublicationRun(publicationRunId)
        if (cancelled) return
        setRun(next)
        if (next.live_view_url && next.live_view_url !== browser.liveViewUrl) {
          onBrowserChange?.({ liveViewUrl: next.live_view_url, phase: next.status })
        }
      } catch {
        // ignore bootstrap errors; polling below will surface issues
      }
    })()
    return () => {
      cancelled = true
    }
  }, [publicationRunId])

  useEffect(() => {
    if (!run?.id) return
    if (!shouldPollPublicationSync(run) && run.status !== "starting") return

    let cancelled = false
    let interval: number | null = null

    const tick = async () => {
      try {
        // One sync always — reconciles zombie runs with no provider_run_id.
        const next = await syncPublicationRun(run.id)
        if (cancelled) return
        setRun(next)
        if (next.live_view_url && next.live_view_url !== browser.liveViewUrl) {
          onBrowserChange?.({ liveViewUrl: next.live_view_url, phase: next.status })
        } else {
          onBrowserChange?.({ phase: next.status })
        }
        const timingKey = timingKeyRef.current
        if (timingKey) {
          const labels = (next.activity ?? []).map((item) => item.label)
          const firstAction = labels.find(
            (label) =>
              label &&
              !/^Opening destination$/i.test(label) &&
              !/^Waiting for/i.test(label),
          )
          if (firstAction) {
            markCloudPublishTiming(timingKey, "T6_agent_first_action", { label: firstAction })
            reportCloudPublishTiming(timingKey)
          }
        }
        if (!shouldPollPublicationSync(next)) {
          if (interval != null) window.clearInterval(interval)
          interval = null
          if (!isActivePublicationStatus(next.status) && next.error_message) {
            setError(humanStatusMessage(next.error_message))
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to refresh status")
      }
    }

    void tick()
    if (shouldPollPublicationSync(run)) {
      interval = window.setInterval(() => void tick(), 2500)
    }
    return () => {
      cancelled = true
      if (interval != null) window.clearInterval(interval)
    }
  }, [run?.id, run?.status, run?.provider_run_id, run?.metadata?.awaiting_destination_auth])

  async function handleOpenBlankBrowser() {
    setBusy(true)
    setError(null)
    try {
      const screen = defaultBrowserUseScreen()
      let opened
      try {
        opened = await openBrowserSession({
          startUrl: "https://www.google.com/",
          source: "reconnect",
          profileKey: "manual-browser",
        })
      } catch (openError) {
        const message = openError instanceof Error ? openError.message : String(openError)
        if (!isConcurrentSessionLimitMessage(message)) throw openError
        setStatusNote("Freeing older cloud browser sessions…")
        await cleanupBrowsers()
        opened = await openBrowserSession({
          startUrl: "https://www.google.com/",
          source: "reconnect",
          profileKey: "manual-browser",
        })
        setStatusNote(null)
      }
      onBrowserChange?.({
        browserId: opened.browserId,
        bridgeSessionId: opened.bridgeSessionId,
        sessionId: opened.bridgeSessionId ?? opened.browserId,
        liveViewUrl: opened.liveViewUrl,
        provider: opened.provider,
        source: "reconnect",
        currentUrl: opened.currentUrl,
        pageTitle: opened.title,
        faviconUrl: opened.faviconUrl ?? null,
        intentionallyStopped: false,
        phase: opened.provider === "articulate_desktop" ? "desktop_ready" : "ready",
        connectMessage:
          opened.provider === "articulate_desktop" ? "Native Chromium browser." : null,
        requestedScreenWidth: screen.width,
        requestedScreenHeight: screen.height,
        viewerMode: "fit",
      })
      setNavUrl(opened.currentUrl || "")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open browser")
      onBrowserChange?.({ phase: "failed" })
    } finally {
      setBusy(false)
    }
  }

  async function handleConnectHelper() {
    // Local Browser Helper pairing is deprecated — reopen via Desktop/Cloud resolver.
    setPairingNeeded(false)
    setStatusNote(null)
    onBrowserChangeRef.current?.({
      phase: "provisioning",
      connectMessage: null,
      intentionallyStopped: false,
      provider: null,
      bridgeSessionId: null,
    })
    provisionGenerationRef.current += 1
    provisionStartedRef.current = null
  }

  async function handleFocusLocalBrowser() {
    setStatusNote("Use the Desktop browser pane — external Chrome helper is no longer used.")
  }

  async function handleStopLocalBrowser() {
    const bridgeId = browser.bridgeSessionId ?? browser.sessionId ?? browserId
    setBusy(true)
    try {
      await stopOpenedBrowserSession({
        provider: browser.provider ?? "articulate_desktop",
        bridgeSessionId: bridgeId,
        browserId,
      })
      onBrowserChangeRef.current?.({
        intentionallyStopped: true,
        phase: "stopped",
        liveViewUrl: null,
        bridgeSessionId: null,
      })
      setStatusNote("Browser session ended")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stop browser")
    } finally {
      setBusy(false)
    }
  }

  function applyViewerMode(mode: BrowserViewerMode) {
    setViewerMode(mode)
    onBrowserChangeRef.current?.({ viewerMode: mode })
  }

  /** Destination-connection verify (+ auto-resume pending publication when present). */
  async function handleVerifyAndContinuePublication() {
    if (!destinationId) return
    setBusy(true)
    setError(null)
    setStatusNote("Verifying sign-in…")
    try {
      let result = await completePublishingDestinationConnect(destinationId, {
        publicationRunId,
        userConfirmed: true,
      })
      for (let attempt = 0; attempt < 6 && result.pending && !result.authenticated; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2500))
        result = await completePublishingDestinationConnect(destinationId, {
          publicationRunId,
          userConfirmed: true,
        })
      }

      const nextRun = result.run ?? null
      if (nextRun) setRun(nextRun)

      if (result.authenticated) {
        setStatusNote(
          humanStatusMessage(result.message) ||
            (result.resumed_publication
              ? `Connected to ${destinationName}. Continuing publication…`
              : `Connected to ${destinationName}`),
        )
        onBrowserChange?.({
          liveViewUrl: result.live_view_url ?? browser.liveViewUrl,
          sessionId: result.connect_session_id ?? browser.sessionId,
          publicationRunId: nextRun?.id ?? publicationRunId,
          connectMessage: null,
          phase: nextRun?.status ?? "connected",
          destinationName,
        })
      } else {
        const msg =
          humanStatusMessage(result.message) ||
          `Sign in directly to ${destinationName} in this browser. Articulate does not receive or store your login credentials.`
        setError(msg)
        setStatusNote(null)
        onBrowserChange?.({
          liveViewUrl: result.live_view_url ?? browser.liveViewUrl,
          connectMessage: msg,
          phase: "needs_user",
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify sign-in")
      setStatusNote(null)
    } finally {
      setBusy(false)
    }
  }

  async function runAction(action: string, fn: () => Promise<PublicationRun>) {
    setBusyAction(action)
    setError(null)
    try {
      const next = await fn()
      setRun(next)
      if (next.live_view_url) {
        onBrowserChange?.({ liveViewUrl: next.live_view_url, phase: next.status })
      } else {
        onBrowserChange?.({ phase: next.status })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setBusyAction(null)
    }
  }

  async function runNavCommand(
    command: "navigate" | "back" | "forward" | "reload" | "history_entry",
    options?: { url?: string; historyEntryId?: number },
  ) {
    // Local navigation is handled inside LocalBrowserSurface (same Chrome target).
    if (
      browser.provider === "browser_use_local" ||
      browser.bridgeSessionId ||
      browser.phase === "local_ready" ||
      browser.phase === "local_running"
    ) {
      return
    }
    if (!browserId && !publicationRunId) return
    setNavBusy(true)
    try {
      const result = await controlBrowser({
        browserId,
        publicationRunId,
        command,
        url: options?.url ?? null,
        historyEntryId: options?.historyEntryId ?? null,
      })
      applyNavState(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Browser navigation failed")
    } finally {
      setNavBusy(false)
    }
  }

  const status = run?.status

  const isDesktopProvider =
    browser.provider === "articulate_desktop" ||
    browser.phase === "desktop_ready" ||
    (isArticulateDesktopAvailable() &&
      !browser.bridgeSessionId &&
      !liveViewUrl &&
      (browser.phase === "provisioning" || browser.phase === "desktop_ready") &&
      !destinationId &&
      !publicationRunId)

  const isLocalProvider =
    !isDesktopProvider &&
    !isArticulateDesktopAvailable() &&
    (browser.provider === "browser_use_local" ||
      run?.provider === "browser_use_local" ||
      browser.phase === "local_running" ||
      browser.phase === "local_ready" ||
      browser.phase === "provisioning" ||
      browser.phase === "needs_pairing" ||
      Boolean(browser.bridgeSessionId) ||
      Boolean((run?.metadata as { local_browser?: boolean } | undefined)?.local_browser))

  const desktopBrowserId =
    (browser.provider === "articulate_desktop" ? browser.browserId : null) ||
    (typeof tabId === "string" && tabId.trim() ? tabId.trim() : null) ||
    browser.browserId ||
    null

  const showDesktopBrowserPanel =
    isDesktopProvider &&
    !intentionallyStopped &&
    Boolean(desktopBrowserId) &&
    (browser.phase === "desktop_ready" ||
      browser.phase === "provisioning" ||
      browser.provider === "articulate_desktop")

  const localBridgeSessionId =
    browser.bridgeSessionId ??
    (browser.provider === "browser_use_local" ? browser.sessionId : null) ??
    null

  const showLoginVerify =
    showConnectControls &&
    Boolean(destinationId) &&
    awaitingDestinationAuth &&
    (Boolean(liveViewUrl) || Boolean(localBridgeSessionId)) &&
    status !== "running" &&
    status !== "awaiting_publish_confirmation"

  const showAgentContinue =
    Boolean(run) &&
    isActivePublicationStatus(status ?? "") &&
    status === "needs_user" &&
    !run?.metadata?.awaiting_destination_auth

  const connectCopy =
    humanStatusMessage(browser.connectMessage) ||
    humanStatusMessage(run?.error_message) ||
    `Sign in directly to ${destinationName} in this browser. Articulate does not receive or store your login credentials.`

  const showStartingOverlay =
    !liveViewUrl &&
    !intentionallyStopped &&
    !isLocalProvider &&
    !isDesktopProvider &&
    (isProvisioning ||
      browser.phase === "provisioning" ||
      (Boolean(run) &&
        isActivePublicationStatus(status ?? "") &&
        !awaitingDestinationAuth &&
        (status === "starting" || status === "queued" || status === "running")))

  const showLocalBrowserPanel =
    isLocalProvider &&
    !intentionallyStopped &&
    !liveViewUrl &&
    (isProvisioning ||
      browser.phase === "local_running" ||
      browser.phase === "local_ready" ||
      browser.phase === "provisioning" ||
      browser.phase === "needs_pairing" ||
      Boolean(browser.bridgeSessionId) ||
      (Boolean(run) && isActivePublicationStatus(status ?? "")))

  const showPairingPrompt =
    pairingNeeded ||
    browser.phase === "needs_pairing" ||
    Boolean(browser.connectMessage?.includes("Connect this computer"))

  const showFooter =
    showLoginVerify ||
    (status === "needs_user" && !awaitingDestinationAuth) ||
    status === "awaiting_publish_confirmation" ||
    (status === "running" && Boolean(statusNote?.includes("Continuing"))) ||
    Boolean(error && liveViewUrl) ||
    (Boolean(run) && isActivePublicationStatus(status ?? ""))

  // Cloud Live View chrome only — Local/Desktop surfaces draw their own toolbar.
  const showChrome =
    !intentionallyStopped &&
    !isLocalProvider &&
    !isDesktopProvider &&
    (Boolean(liveViewUrl) ||
      isProvisioning ||
      browser.phase === "provisioning" ||
      browser.phase === "needs_user" ||
      browser.phase === "connecting")

  const iframeLayout =
    hostSize && liveViewUrl
      ? liveViewLayoutForMode(viewerMode, {
          hostWidth: hostSize.width,
          hostHeight: hostSize.height,
          remoteWidth,
          remoteHeight,
        })
      : null

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      {showChrome ? (
        <BrowserChromeBar
          url={navUrl}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          history={navHistory}
          disabled={!liveViewUrl}
          busy={navBusy}
          viewerMode={liveViewUrl ? viewerMode : undefined}
          onViewerModeChange={liveViewUrl ? applyViewerMode : undefined}
          onEditingChange={(isEditing) => {
            urlBarEditingRef.current = isEditing
          }}
          onSubmitUrl={(url) => void runNavCommand("navigate", { url })}
          onBack={() => void runNavCommand("back")}
          onForward={() => void runNavCommand("forward")}
          onReload={() => void runNavCommand("reload")}
          onSelectHistory={(entryId) => void runNavCommand("history_entry", { historyEntryId: entryId })}
        />
      ) : null}
      <div
        ref={viewportHostRef}
        data-browser-viewport-host=""
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden overscroll-contain bg-gray-50"
        style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0 }}
      >
        {liveViewUrl && !intentionallyStopped && !liveViewDisconnected ? (
          <iframe
            title={`${title} live browser`}
            src={liveViewUrl}
            className="absolute block border-0 bg-white"
            style={{
              // Scale/crop inside Articulate — remote screen stays fixed desktop size.
              width: iframeLayout?.width ?? "100%",
              height: iframeLayout?.height ?? "100%",
              left: iframeLayout?.left ?? 0,
              top: iframeLayout?.top ?? 0,
              minWidth: 0,
              minHeight: 0,
              display: "block",
              border: 0,
              background: "#ffffff",
              // Live-view iframes paint above most HTML; hide while chrome overlays (e.g. `+` menu).
              visibility: overlayActive ? "hidden" : "visible",
            }}
            allow="autoplay; clipboard-read; clipboard-write; fullscreen"
            onLoad={() => {
              const key = timingKeyRef.current
              if (!key) return
              markCloudPublishTiming(key, "T4_live_view_iframe_loaded")
              markCloudPublishTiming(key, "T5_page_usable")
              reportCloudPublishTiming(key)
            }}
          />
        ) : liveViewDisconnected && !intentionallyStopped ? (
          <BrowserPanePlaceholder
            title="Connection lost"
            description="The remote browser disconnected. Start a new session to continue."
            error={error}
            busy={busy}
            actionLabel="Reconnect browser"
            onAction={() => {
              if (destinationId && artifactId) {
                provisionGenerationRef.current += 1
                provisionStartedRef.current = null
                setLiveViewDisconnected(false)
                onBrowserChangeRef.current?.({
                  phase: "provisioning",
                  intentionallyStopped: false,
                  liveViewUrl: null,
                  publicationRunId: null,
                  browserId: null,
                  sessionId: null,
                })
                return
              }
              setLiveViewDisconnected(false)
              void handleOpenBlankBrowser()
            }}
          />
        ) : intentionallyStopped ? (
          <BrowserPanePlaceholder
            title="Browser session ended"
            description="The remote session was closed. Open a new browser when you are ready."
            busy={busy}
            actionLabel="Open new browser"
            onAction={() => void handleOpenBlankBrowser()}
          />
        ) : showDesktopBrowserPanel && desktopBrowserId ? (
          <DesktopBrowserSurface
            browserId={desktopBrowserId}
            active
            initialUrl={browser.currentUrl || "https://www.google.com/"}
            onNavigation={(info) => {
              if (info.url && !urlBarEditingRef.current) setNavUrl(info.url)
              if (typeof info.canGoBack === "boolean") setCanGoBack(info.canGoBack)
              if (typeof info.canGoForward === "boolean") setCanGoForward(info.canGoForward)
              onBrowserChangeRef.current?.({
                currentUrl: info.url,
                pageTitle: info.title ?? browser.pageTitle,
                faviconUrl: info.favicon ?? browser.faviconUrl,
                provider: "articulate_desktop",
                phase: "desktop_ready",
                browserId: desktopBrowserId,
              })
            }}
            onDownload={(info) => {
              if (process.env.NODE_ENV === "development") {
                console.info("[desktop-browser] download", info)
              }
              setStatusNote(
                info.state === "completed"
                  ? `Downloaded ${info.filename}`
                  : info.state === "started"
                    ? `Downloading ${info.filename}…`
                    : `Download ${info.state}: ${info.filename}`,
              )
            }}
            onPopup={(info) => {
              // Managed popup → new workspace Browser tab (same persistent session).
              void import("../../app/store/right-pane-tabs").then(({ useRightPaneTabsStore }) => {
                useRightPaneTabsStore.getState().upsertTab({
                  kind: "browser",
                  id: info.id,
                  title: "Browser",
                  browser: {
                    provider: "articulate_desktop",
                    browserId: info.id,
                    phase: "desktop_ready",
                    currentUrl: info.url,
                    source: "manual",
                  },
                  activate: true,
                })
              })
            }}
          />
        ) : showPairingPrompt && !localBridgeSessionId ? (
          <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-medium text-gray-900">Browser Helper detected</p>
            <p className="max-w-sm text-xs text-gray-600">
              Connect this computer to use the local browser. No terminal or token setup required.
            </p>
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
            <Button
              type="button"
              size="sm"
              disabled={pairingBusy}
              onClick={() => void handleConnectHelper()}
            >
              {pairingBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Connect
            </Button>
          </div>
        ) : showLocalBrowserPanel ? (
          localBridgeSessionId ? (
            <LocalBrowserSurface
              sessionId={localBridgeSessionId}
              interactive
              showToolbar
              showPageTabs
              initialControl={localControl}
              onControlChange={(owner) => {
                setLocalControl(owner)
              }}
              onNavigation={(info) => {
                if (info.url && !urlBarEditingRef.current) setNavUrl(info.url)
                if (typeof info.canGoBack === "boolean") setCanGoBack(info.canGoBack)
                if (typeof info.canGoForward === "boolean") setCanGoForward(info.canGoForward)
                onBrowserChangeRef.current?.({
                  currentUrl: info.url,
                  pageTitle: info.title ?? browser.pageTitle,
                })
              }}
              onOpenInChrome={() => void handleFocusLocalBrowser()}
              onStop={() => void handleStopLocalBrowser()}
              onSessionLost={() => {
                setStatusNote("Browser session ended — restarting…")
                provisionGenerationRef.current += 1
                provisionStartedRef.current = null
                onBrowserChangeRef.current?.({
                  phase: "provisioning",
                  intentionallyStopped: false,
                  liveViewUrl: null,
                  browserId: null,
                  sessionId: null,
                  bridgeSessionId: null,
                  provider: "browser_use_local",
                  connectMessage: null,
                })
              }}
              onContinueWithAgent={
                run && isActivePublicationStatus(run.status)
                  ? () => {
                      void runAction("continue", async () => {
                        if (run.provider === "browser_use_local" || isLocalProvider) {
                          const task =
                            run.metadata?.local_agent_task ||
                            `Continue preparing the publication on ${destinationNameRef.current}. Stop before Publish.`
                          return runLocalPublicationDriver(
                            {
                              runId: run.id,
                              startUrl: "about:blank",
                              task: String(task),
                              bridgeSessionId:
                                run.metadata?.bridge_session_id ??
                                run.provider_session_id ??
                                localBridgeSessionId,
                              destinationName: destinationNameRef.current,
                            },
                            startLocalAgentCallbacks({
                              onStatus: setStatusNote,
                              onRun: setRun,
                            }),
                          )
                        }
                        return continuePublicationAfterUser(run.id)
                      })
                    }
                  : undefined
              }
            />
          ) : (
            <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-sm font-medium text-gray-900">
                {isArticulateDesktopAvailable() ? "Browser · Desktop" : "Browser"}
              </p>
              <p className="max-w-sm text-xs text-gray-600">
                {statusNote ||
                  humanStatusMessage(browser.connectMessage) ||
                  (isArticulateDesktopAvailable()
                    ? "Starting desktop browser…"
                    : "Starting browser…")}
              </p>
              {error ? <p className="text-xs text-red-600">{error}</p> : null}
              {(isProvisioning || busy) && (
                <Loader2 className="mt-2 h-4 w-4 animate-spin text-gray-400" />
              )}
              {browser.phase === "failed" || error ? (
                <Button
                  type="button"
                  size="sm"
                  className="mt-2"
                  disabled={busy}
                  onClick={() => {
                    provisionGenerationRef.current += 1
                    provisionStartedRef.current = null
                    setError(null)
                    onBrowserChangeRef.current?.({
                      phase: "provisioning",
                      intentionallyStopped: false,
                      liveViewUrl: null,
                      publicationRunId: null,
                      browserId: null,
                      sessionId: null,
                      bridgeSessionId: null,
                      provider: null,
                    })
                  }}
                >
                  Retry
                </Button>
              ) : null}
            </div>
          )
        ) : showStartingOverlay ? (
          <BrowserPanePlaceholder
            title="Starting remote browser…"
            description="Provisioning a desktop cloud browser. This usually takes a few seconds."
            error={error}
            busy
          />
        ) : (
          <BrowserPanePlaceholder
            title={
              browser.phase === "failed"
                ? "Could not start browser"
                : "No live browser yet"
            }
            description={
              browser.phase === "failed"
                ? error || "Something went wrong while starting the browser."
                : "Start a browser session to preview and publish from this pane."
            }
            error={error}
            busy={busy}
            actionLabel={
              browser.phase === "failed"
                ? "Try again"
                : "Start browser"
            }
            onAction={() => {
              if (destinationId && artifactId) {
                provisionGenerationRef.current += 1
                provisionStartedRef.current = null
                setLiveViewDisconnected(false)
                onBrowserChangeRef.current?.({
                  phase: "provisioning",
                  intentionallyStopped: false,
                  liveViewUrl: null,
                  publicationRunId: null,
                  browserId: null,
                  sessionId: null,
                  bridgeSessionId: null,
                  provider: null,
                })
                return
              }
              setLiveViewDisconnected(false)
              provisionGenerationRef.current += 1
              provisionStartedRef.current = null
              setError(null)
              onBrowserChangeRef.current?.({
                phase: "provisioning",
                intentionallyStopped: false,
                liveViewUrl: null,
                browserId: null,
                sessionId: null,
                bridgeSessionId: null,
                provider: null,
              })
            }}
          />
        )}
      </div>

      {showFooter ? (
        <footer className="shrink-0 space-y-2 border-t border-gray-200 px-4 py-3">
          {showLoginVerify ? <p className="text-xs text-gray-700">{connectCopy}</p> : null}

          {status === "needs_user" && !awaitingDestinationAuth ? (
            <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
              <p className="font-medium">Action needed in the browser</p>
              <p className="mt-1">
                {humanStatusMessage(run?.error_message) ||
                  humanStatusMessage(run?.metadata?.phase_message) ||
                  "Finish the step in the live browser, then continue with the agent."}
              </p>
            </div>
          ) : null}

          {status === "awaiting_publish_confirmation" ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <p className="font-medium">Ready for confirmation</p>
              <p className="mt-1 text-amber-900/90">
                Review the browser, then confirm only when you want the final publish action.
              </p>
            </div>
          ) : null}

          {status === "running" && statusNote?.includes("Continuing") ? (
            <p className="text-xs text-gray-600">Continuing publication…</p>
          ) : null}

          {error && liveViewUrl ? <p className="text-xs text-red-600">{error}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {showLoginVerify ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !destinationId}
                  onClick={() => void handleVerifyAndContinuePublication()}
                >
                  {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  I&apos;ve signed in
                </Button>
              ) : null}

              {run &&
              isActivePublicationStatus(status ?? "") &&
              status !== "awaiting_publish_confirmation" &&
              !awaitingDestinationAuth ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={Boolean(busyAction)}
                    onClick={() => {
                      applyViewerMode("fit")
                      bumpLocalBrowserHumanControl()
                      setLocalControl("human")
                      void runAction("take_control", () => takePublicationControl(run.id))
                    }}
                  >
                    Take control
                  </Button>
                  {showAgentContinue ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={Boolean(busyAction)}
                      onClick={() =>
                        void runAction("continue", async () => {
                          if (run.provider === "browser_use_local" || isLocalProvider) {
                            const task =
                              run.metadata?.local_agent_task ||
                              `Continue preparing the publication on ${destinationNameRef.current}. Stop before Publish.`
                            return runLocalPublicationDriver(
                              {
                                runId: run.id,
                                startUrl: "about:blank",
                                task: String(task),
                                bridgeSessionId:
                                  run.metadata?.bridge_session_id ??
                                  run.provider_session_id ??
                                  null,
                                destinationName: destinationNameRef.current,
                              },
                              startLocalAgentCallbacks({
                                onStatus: setStatusNote,
                                onRun: setRun,
                              }),
                            )
                          }
                          return continuePublicationAfterUser(run.id)
                        })
                      }
                    >
                      {busyAction === "continue" ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      Continue with agent
                    </Button>
                  ) : null}
                </>
              ) : null}

              {status === "awaiting_publish_confirmation" && run ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={Boolean(busyAction)}
                  onClick={() =>
                    void runAction("confirm", async () => {
                      const confirmed = await confirmPublication(run.id)
                      const localTask =
                        confirmed.local_confirm?.task || run.metadata?.local_confirm_task
                      if (
                        (confirmed.provider === "browser_use_local" ||
                          run.provider === "browser_use_local") &&
                        localTask
                      ) {
                        setStatusNote("Confirming in local browser…")
                        return runLocalPublicationDriver(
                          {
                            runId: run.id,
                            startUrl: "about:blank",
                            task: String(localTask),
                            bridgeSessionId:
                              run.metadata?.bridge_session_id ?? run.provider_session_id ?? null,
                            destinationName: destinationNameRef.current,
                          },
                          startLocalAgentCallbacks({
                            onStatus: setStatusNote,
                            onRun: setRun,
                          }),
                        )
                      }
                      return confirmed
                    })
                  }
                >
                  {busyAction === "confirm" ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Confirm publication
                </Button>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {isLocalProvider ? (
                <span className="text-[10px] uppercase tracking-wide text-gray-500">
                  Browser: Local
                </span>
              ) : liveViewUrl ? (
                <span className="text-[10px] uppercase tracking-wide text-gray-500">
                  Browser: Cloud
                </span>
              ) : null}
              {run && isActivePublicationStatus(status ?? "") ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-700 hover:bg-red-50 hover:text-red-800"
                  disabled={Boolean(busyAction)}
                  onClick={() =>
                    void runAction("cancel", async () => {
                      const cancelled = await cancelPublication(run.id)
                      const bridgeId =
                        run.metadata?.bridge_session_id ?? run.provider_session_id ?? null
                      if (bridgeId && (run.provider === "browser_use_local" || isLocalProvider)) {
                        try {
                          await stopLocalPublicationBrowser(bridgeId)
                        } catch {
                          // ignore
                        }
                      }
                      return cancelled
                    })
                  }
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        </footer>
      ) : null}
    </div>
  )
}
