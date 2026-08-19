"use client"

import React, { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Loader2, Minimize2, PanelLeft, X } from "lucide-react"
import { getArticulateDesktop } from "../../app/lib/articulate-desktop"
import { DESKTOP_BROWSER_SURFACE_PRIORITY } from "../../app/lib/desktop-browser-surface-owner"
import {
  PANE_CHROME_ICON_BUTTON_CLASS,
  PANE_CHROME_ICON_CLASS,
} from "../../app/components/tasks/pane-header-tokens"
import { DesktopBrowserSurface } from "../artifacts/desktop-browser-surface"
import {
  findBrowserTabForAiSession,
  useRightPaneTabsStore,
} from "../../app/store/right-pane-tabs"
import { AiBrowserLiveView } from "./ai-browser-live-view"

export function AiBrowserPreviewCard(props: {
  browserSessionId: string
  browserId?: string | null
  sessionId?: string | null
  liveViewUrl?: string | null
  startUrl?: string | null
  currentUrl?: string | null
  title?: string | null
  provider?: string | null
  browserLabel?: string | null
  status?: string | null
}) {
  const browserTabs = useRightPaneTabsStore((s) => s.tabs)
  const [expanded, setExpanded] = useState(false)
  const [desktopReady, setDesktopReady] = useState(false)
  const [controlOwner, setControlOwner] = useState<"agent" | "human">("agent")

  const associatedTab = useMemo(
    () =>
      findBrowserTabForAiSession(browserTabs, {
        browserSessionId: props.browserSessionId,
        browserId: props.browserId,
      }),
    [browserTabs, props.browserId, props.browserSessionId],
  )

  const liveViewUrl = props.liveViewUrl || associatedTab?.browser?.liveViewUrl || ""
  const currentUrl =
    associatedTab?.browser?.currentUrl || props.currentUrl || props.startUrl || null
  const provider = associatedTab?.browser?.provider || props.provider || null
  const isDesktop =
    provider === "articulate_desktop"
    || associatedTab?.browser?.phase === "desktop_ready"
  const title = props.title || associatedTab?.title || "Browser"
  const desktopBrowserId =
    associatedTab?.browser?.browserId
    || associatedTab?.id
    || props.browserId
    || props.browserSessionId
  const canEmbed = Boolean(liveViewUrl) || isDesktop
  const hasControl = controlOwner === "human"

  const takeControl = () => {
    void getArticulateDesktop()?.browser.bumpHuman?.()
    setControlOwner("human")
    setExpanded(true)
  }

  const releaseControl = () => {
    void getArticulateDesktop()?.browser.beginAgent?.()
    setControlOwner("agent")
    setExpanded(false)
  }

  const collapse = () => {
    setExpanded(false)
  }

  const liveSurface = (opts: {
    variant: "preview" | "overlay"
    interactive: boolean
  }) => {
    if (isDesktop) {
      return (
        <DesktopBrowserSurface
          browserId={desktopBrowserId}
          variant="preview"
          display={opts.variant === "overlay" ? "live" : "snapshot"}
          ownerId={`${opts.variant}:${props.browserSessionId}`}
          priority={
            opts.variant === "overlay"
              ? DESKTOP_BROWSER_SURFACE_PRIORITY.overlay
              : DESKTOP_BROWSER_SURFACE_PRIORITY.chat
          }
          active={!expanded || opts.variant === "overlay"}
          initialUrl={currentUrl || props.startUrl}
          className="absolute inset-0"
          onReady={() => setDesktopReady(true)}
          onNavigation={() => setDesktopReady(true)}
          onControlChange={(next) => {
            setControlOwner(next.controlOwner === "human" ? "human" : "agent")
          }}
        />
      )
    }
    if (liveViewUrl) {
      return (
        <AiBrowserLiveView
          liveViewUrl={liveViewUrl}
          browserId={props.browserId || desktopBrowserId}
          title={title}
          interactive={opts.interactive}
          className="absolute inset-0"
        />
      )
    }
    return (
      <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-gray-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Opening browser…
      </div>
    )
  }

  const overlay = expanded && typeof document !== "undefined"
    ? createPortal(
        <div className="fixed inset-0 z-[90] flex flex-col bg-white">
          <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-gray-200/80 bg-white px-1.5">
            <button
              type="button"
              className={PANE_CHROME_ICON_BUTTON_CLASS}
              title="Close pane"
              aria-label="Close pane"
              onClick={collapse}
            >
              <PanelLeft className={PANE_CHROME_ICON_CLASS} />
            </button>
            <div className="min-w-0 flex-1 truncate px-2 text-center text-[13px] text-gray-500">
              {currentUrl || title}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {hasControl ? (
                <button
                  type="button"
                  onClick={releaseControl}
                  className="mr-1 rounded-md px-2 py-1 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  Release control
                </button>
              ) : null}
              <button
                type="button"
                className={PANE_CHROME_ICON_BUTTON_CLASS}
                title="Collapse"
                aria-label="Collapse"
                onClick={hasControl ? releaseControl : collapse}
              >
                <Minimize2 className={PANE_CHROME_ICON_CLASS} />
              </button>
              <button
                type="button"
                className={PANE_CHROME_ICON_BUTTON_CLASS}
                title="Close pane"
                aria-label="Close pane"
                onClick={collapse}
              >
                <X className={PANE_CHROME_ICON_CLASS} />
              </button>
            </div>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden bg-gray-100">
            {liveSurface({
              variant: "overlay",
              interactive: hasControl,
            })}
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <div className="group relative w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div
          className="relative w-full overflow-hidden bg-gray-100"
          style={{ aspectRatio: "16 / 9" }}
        >
          {liveSurface({ variant: "preview", interactive: false })}
          {canEmbed || isDesktop || desktopReady ? (
            <button
              type="button"
              onClick={takeControl}
              className="absolute inset-0 z-10 flex items-center justify-center bg-black/0 transition-colors hover:bg-black/25"
              aria-label="Take control"
            >
              <span className="pointer-events-none rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-gray-900 opacity-0 shadow-sm ring-1 ring-black/5 transition-opacity group-hover:opacity-100">
                Take control
              </span>
            </button>
          ) : null}
        </div>
      </div>
      {overlay}
    </>
  )
}
