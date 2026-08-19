/**
 * Desktop-native browser surface: React chrome + Electron WebContentsView host.
 * No CDP screencast, canvas, Live View, or Local Bridge.
 *
 * Human input is native. Agent control uses main-process IPC (observe/actions).
 */

"use client"

import { useEffect, useRef, useState } from "react"
import { BrowserChromeBar } from "./browser-chrome-bar"
import { DesktopBrowserHost } from "./desktop-browser-host"
import { BrowserPanePlaceholder } from "./browser-pane-placeholder"
import {
  getArticulateDesktop,
  isArticulateDesktopAvailable,
  type DesktopBrowserState,
  type DesktopControlState,
} from "../../app/lib/articulate-desktop"
import { normalizeBrowserUrl } from "../../app/lib/browser-coordinate"
import { bumpDesktopBrowserHumanControl } from "../../app/lib/desktop-browser-agent-control"
import { cn } from "../../app/lib/utils"
import { Button } from "../../app/components/ui/button"
import {
  isBrowserSurfaceOverlayActive,
  subscribeBrowserSurfaceOverlay,
} from "../../app/lib/browser-surface-overlay"
import {
  claimDesktopBrowserSurface,
  isDesktopBrowserSurfaceOwner,
  subscribeDesktopBrowserSurfaceOwner,
} from "../../app/lib/desktop-browser-surface-owner"

export type DesktopBrowserSurfaceProps = {
  browserId: string
  className?: string
  active?: boolean
  variant?: "full" | "preview"
  /** Snapshot stays in the HTML scroll flow. Live attaches the native view. */
  display?: "live" | "snapshot"
  ownerId?: string | null
  priority?: number
  initialUrl?: string | null
  onReady?: () => void
  onNavigation?: (info: {
    url: string
    title?: string
    favicon?: string | null
    canGoBack?: boolean
    canGoForward?: boolean
  }) => void
  onDownload?: (info: { filename: string; url: string; state: string }) => void
  onPopup?: (info: { id: string; url: string }) => void
  onControlChange?: (control: DesktopControlState) => void
  onContinueWithAgent?: () => void
}

export function DesktopBrowserSurface({
  browserId,
  className,
  active = true,
  variant = "full",
  display = "live",
  ownerId = null,
  priority = 1,
  initialUrl,
  onReady,
  onNavigation,
  onDownload,
  onPopup,
  onControlChange,
  onContinueWithAgent,
}: DesktopBrowserSurfaceProps) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<DesktopBrowserState | null>(null)
  const [urlDraftSync, setUrlDraftSync] = useState("")
  const [control, setControl] = useState<DesktopControlState>({
    controlOwner: "human",
    agentGeneration: 0,
  })
  const [overlayActive, setOverlayActive] = useState(isBrowserSurfaceOverlayActive)
  const [snapshotSrc, setSnapshotSrc] = useState<string | null>(null)
  const isSnapshot = display === "snapshot"
  const createdRef = useRef(false)
  const isSnapshotRef = useRef(isSnapshot)
  isSnapshotRef.current = isSnapshot
  const initialUrlRef = useRef(initialUrl)
  initialUrlRef.current = initialUrl
  const onNavigationRef = useRef(onNavigation)
  onNavigationRef.current = onNavigation
  const onDownloadRef = useRef(onDownload)
  onDownloadRef.current = onDownload
  const onPopupRef = useRef(onPopup)
  onPopupRef.current = onPopup
  const onControlChangeRef = useRef(onControlChange)
  onControlChangeRef.current = onControlChange
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const resolvedOwnerId = ownerId || `surface:${browserId}`
  const [isOwner, setIsOwner] = useState(true)

  useEffect(() => subscribeBrowserSurfaceOverlay(() => {
    setOverlayActive(isBrowserSurfaceOverlayActive())
  }), [])

  useEffect(() => {
    const release = claimDesktopBrowserSurface(browserId, resolvedOwnerId, priority)
    const sync = () => setIsOwner(isDesktopBrowserSurfaceOwner(browserId, resolvedOwnerId))
    sync()
    const unsub = subscribeDesktopBrowserSurfaceOwner(browserId, sync)
    return () => {
      unsub()
      release()
    }
  }, [browserId, resolvedOwnerId, priority])

  useEffect(() => {
    const desktop = getArticulateDesktop()
    if (!desktop) {
      setError("Articulate Desktop bridge is not available.")
      return
    }

    let cancelled = false
    const unsubs: Array<() => void> = []

    void (async () => {
      try {
        const existing = await desktop.browser.getState(browserId)
        if (existing) {
          createdRef.current = true
          if (!cancelled) {
            setState(existing)
            setUrlDraftSync(existing.url)
            if (!isSnapshotRef.current) await desktop.browser.show(browserId)
          }
        } else if (!createdRef.current) {
          const start =
            (initialUrlRef.current && normalizeBrowserUrl(initialUrlRef.current)) ||
            "https://www.google.com/"
          const created = await desktop.browser.create({ id: browserId, url: start })
          createdRef.current = true
          if (cancelled) return
          setState(created)
          setUrlDraftSync(created.url)
        } else if (!isSnapshotRef.current) {
          await desktop.browser.show(browserId)
        }
        if (!cancelled) {
          setReady(true)
          setError(null)
          onReadyRef.current?.()
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not start desktop browser")
        }
      }
    })()

    unsubs.push(
      desktop.browser.onState((next) => {
        if (next.id !== browserId) return
        setState(next)
        setUrlDraftSync(next.url)
        onNavigationRef.current?.({
          url: next.url,
          title: next.title,
          favicon: next.favicon,
          canGoBack: next.canGoBack,
          canGoForward: next.canGoForward,
        })
      }),
    )

    unsubs.push(
      desktop.browser.onMeta((meta) => {
        if (meta.id !== browserId) return
        onNavigationRef.current?.({
          url: meta.url,
          title: meta.title,
          favicon: meta.favicon,
        })
      }),
    )

    unsubs.push(
      desktop.browser.onDownload((payload) => {
        if (payload.id !== browserId) return
        onDownloadRef.current?.(payload)
      }),
    )

    unsubs.push(
      desktop.browser.onPopup((payload) => {
        if (payload.openerId !== browserId) return
        onPopupRef.current?.(payload)
      }),
    )

    if (desktop.browser.onControl) {
      unsubs.push(
        desktop.browser.onControl((next) => {
          setControl(next)
          onControlChangeRef.current?.(next)
          if (next.controlOwner === "human") {
            bumpDesktopBrowserHumanControl()
          }
        }),
      )
    }

    return () => {
      cancelled = true
      for (const off of unsubs) off()
      if (isDesktopBrowserSurfaceOwner(browserId, resolvedOwnerId)) {
        void desktop.browser.hide(browserId)
      }
    }
  }, [browserId, resolvedOwnerId])

  useEffect(() => {
    const desktop = getArticulateDesktop()
    if (!desktop || !ready || !isOwner) return
    if (active && !overlayActive && !isSnapshot) void desktop.browser.show(browserId)
    else void desktop.browser.hide(browserId)
  }, [active, browserId, ready, overlayActive, isOwner, isSnapshot])

  useEffect(() => {
    if (!isSnapshot || !ready) return
    const desktop = getArticulateDesktop()
    const capture = desktop?.browser.capture
    if (!capture) return
    let cancelled = false
    const tick = async () => {
      try {
        const next = await capture(browserId)
        if (!cancelled && next?.dataUrl) setSnapshotSrc(next.dataUrl)
      } catch {
        // Older Desktop builds may not expose capture.
      }
    }
    void tick()
    const timer = window.setInterval(() => {
      void tick()
    }, 1500)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [isSnapshot, ready, browserId])

  if (!isArticulateDesktopAvailable()) {
    return (
      <BrowserPanePlaceholder
        title="Desktop browser unavailable"
        description="Open Articulate with npm run desktop:dev to use the native Chromium browser."
      />
    )
  }

  if (error) {
    return (
      <BrowserPanePlaceholder
        title="Could not start desktop browser"
        error={error}
        actionLabel="Retry"
        onAction={() => {
          createdRef.current = false
          setError(null)
          setReady(false)
        }}
      />
    )
  }

  const desktop = getArticulateDesktop()
  const canGoBack = state?.canGoBack ?? false
  const canGoForward = state?.canGoForward ?? false
  const isLoading = state?.isLoading ?? false
  const showHumanBanner = control.controlOwner === "human" && Boolean(onContinueWithAgent)
  const host = (
    <DesktopBrowserHost
      browserId={browserId}
      ownerId={resolvedOwnerId}
      ownsSurface={isOwner}
      active={active && ready}
      className="relative min-h-0 w-full flex-1"
    />
  )

  if (variant === "preview") {
    if (isSnapshot) {
      return (
        <div className={cn("relative h-full w-full overflow-hidden bg-white", className)}>
          {snapshotSrc ? (
            <img
              src={snapshotSrc}
              alt=""
              className="h-full w-full object-cover object-top"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-gray-400">
              {state?.title || state?.url || "Opening browser…"}
            </div>
          )}
        </div>
      )
    }
    return (
      <div className={cn("flex h-full min-h-0 w-full flex-col bg-transparent", className)}>
        {host}
      </div>
    )
  }

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col bg-white", className)}>
      <BrowserChromeBar
        url={urlDraftSync}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        history={[]}
        busy={isLoading}
        isLoading={isLoading}
        onStop={() => {
          void desktop?.browser.stop(browserId)
        }}
        onSubmitUrl={(raw) => {
          const url = normalizeBrowserUrl(raw)
          if (!url) return
          setUrlDraftSync(url)
          void desktop?.browser.navigate(browserId, url)
          void desktop?.browser.bumpHuman?.()
        }}
        onBack={() => {
          void desktop?.browser.back(browserId)
          void desktop?.browser.bumpHuman?.()
        }}
        onForward={() => {
          void desktop?.browser.forward(browserId)
          void desktop?.browser.bumpHuman?.()
        }}
        onReload={() => {
          if (isLoading) void desktop?.browser.stop(browserId)
          else void desktop?.browser.reload(browserId)
        }}
        onSelectHistory={() => undefined}
      />

      {control.controlOwner === "agent" ? (
        <div className="flex h-8 shrink-0 items-center border-b border-amber-100 bg-amber-50 px-3 text-[11px] text-amber-900">
          Agent working
        </div>
      ) : null}

      {showHumanBanner ? (
        <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3">
          <span className="text-[11px] text-gray-600">You have control</span>
          <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" onClick={onContinueWithAgent}>
            Continue with agent
          </Button>
        </div>
      ) : null}

      {host}
    </div>
  )
}
