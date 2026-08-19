"use client"

import React, { useMemo, useState } from "react"
import { ArrowUpRight, Globe2, Loader2, Monitor, X } from "lucide-react"
import { getArticulateDesktop } from "../../app/lib/articulate-desktop"
import { DESKTOP_BROWSER_SURFACE_PRIORITY } from "../../app/lib/desktop-browser-surface-owner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../app/components/ui/dialog"
import { openBrowserTabForAiSession } from "../artifacts/open-browser-tab-for-ai"
import { DesktopBrowserSurface } from "../artifacts/desktop-browser-surface"
import {
  findBrowserTabForAiSession,
  useRightPaneTabsStore,
} from "../../app/store/right-pane-tabs"
import { AiBrowserLiveView } from "./ai-browser-live-view"

type PreviewStatus =
  | "starting"
  | "connecting"
  | "running"
  | "waiting_for_user"
  | "completed"
  | "failed"
  | "disconnected"

function statusCopy(status: PreviewStatus): string {
  if (status === "starting") return "Opening browser…"
  if (status === "connecting") return "Connecting…"
  if (status === "running") return "Running"
  if (status === "waiting_for_user") return "You have control"
  if (status === "completed") return "Completed"
  if (status === "failed") return "Failed"
  return "Disconnected"
}

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
  const [userInteractive, setUserInteractive] = useState(false)

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
  const label = props.browserLabel || (isDesktop ? "Desktop" : liveViewUrl ? "Cloud" : "Browser")
  const title = props.title || associatedTab?.title || "Browser"
  const desktopBrowserId =
    associatedTab?.browser?.browserId
    || associatedTab?.id
    || props.browserId
    || props.browserSessionId
  const canEmbed = Boolean(liveViewUrl) || isDesktop

  const previewStatus: PreviewStatus = associatedTab?.browser?.intentionallyStopped
    ? "disconnected"
    : props.status === "failed"
      ? "failed"
      : isDesktop && !desktopReady
        ? "connecting"
        : userInteractive || controlOwner === "human"
          ? "waiting_for_user"
          : liveViewUrl || desktopReady || isDesktop
            ? "running"
            : "starting"

  const openInPane = () => {
    openBrowserTabForAiSession({
      browserSessionId: props.browserSessionId,
      browserId: desktopBrowserId,
      sessionId: props.sessionId ?? associatedTab?.browser?.sessionId,
      liveViewUrl: liveViewUrl || null,
      startUrl: props.startUrl,
      currentUrl,
      title,
      provider,
      activate: true,
      phase: associatedTab?.browser?.phase ?? (liveViewUrl ? "ready" : isDesktop ? "desktop_ready" : null),
    })
    setExpanded(false)
  }

  const takeOver = () => {
    void getArticulateDesktop()?.browser.bumpHuman?.()
    setControlOwner("human")
    setUserInteractive(true)
  }

  const returnToAi = () => {
    void getArticulateDesktop()?.browser.beginAgent?.()
    setControlOwner("agent")
    setUserInteractive(false)
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
          title={title}
          interactive={opts.interactive}
          className="absolute inset-0"
        />
      )
    }
    return (
      <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-gray-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Connecting browser…
      </div>
    )
  }

  const actions = (
    <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-3 py-2">
      {canEmbed ? (
        userInteractive || controlOwner === "human" ? (
          <button
            type="button"
            onClick={returnToAi}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
          >
            Return to AI
          </button>
        ) : (
          <button
            type="button"
            onClick={takeOver}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
          >
            Take over
          </button>
        )
      ) : (
        <button
          type="button"
          onClick={openInPane}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
        >
          Open browser
        </button>
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={openInPane}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-50"
        >
          Open in pane
        </button>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
        >
          Expand
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  )

  return (
    <>
      <div className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            {isDesktop ? (
              <Monitor className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            ) : (
              <Globe2 className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            )}
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-gray-900">
                Browser · {label}
                {title && title !== "Browser" ? ` · ${title}` : ""}
              </div>
              <div className="truncate text-[11px] text-gray-500">
                {currentUrl || statusCopy(previewStatus)}
              </div>
            </div>
          </div>
          <div className="shrink-0 text-[11px] text-gray-500">{statusCopy(previewStatus)}</div>
        </div>

        <div
          className="relative w-full overflow-hidden bg-gray-100"
          style={{ aspectRatio: "16 / 10" }}
        >
          {liveSurface({ variant: "preview", interactive: false })}
          {canEmbed ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="absolute inset-0 z-10"
              aria-label={`Expand browser ${title}`}
            />
          ) : null}
        </div>
        {actions}
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[88vh] w-[94vw] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
            <div className="min-w-0">
              <DialogTitle className="truncate text-sm font-medium">
                Browser · {label}
                {title && title !== "Browser" ? ` · ${title}` : ""}
              </DialogTitle>
              <DialogDescription className="truncate text-[11px] text-gray-500">
                {currentUrl || "Same live session"}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {userInteractive || controlOwner === "human" ? (
                <button
                  type="button"
                  onClick={returnToAi}
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  Return to AI
                </button>
              ) : (
                <button
                  type="button"
                  onClick={takeOver}
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  Take over
                </button>
              )}
              <button
                type="button"
                onClick={openInPane}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-50"
              >
                Open in pane
              </button>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="rounded-md p-1 text-gray-500 hover:bg-gray-50"
                aria-label="Close browser overlay"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="relative min-h-0 flex-1 bg-gray-100">
            {liveSurface({
              variant: "overlay",
              interactive: userInteractive || controlOwner === "human",
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
