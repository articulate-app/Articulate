"use client"

import React, { useMemo } from "react"
import { ArrowUpRight, Globe2, Loader2, Monitor } from "lucide-react"
import { withLiveViewEmbedParams } from "../../app/lib/publishing/browser-viewport"
import { openBrowserTabForAiSession } from "../artifacts/open-browser-tab-for-ai"
import {
  findBrowserTabForAiSession,
  useRightPaneTabsStore,
} from "../../app/store/right-pane-tabs"
import { cn } from "../../app/lib/utils"

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
  const associatedTab = useMemo(
    () =>
      findBrowserTabForAiSession(browserTabs, {
        browserSessionId: props.browserSessionId,
        browserId: props.browserId,
      }),
    [browserTabs, props.browserId, props.browserSessionId],
  )

  const liveViewUrl = withLiveViewEmbedParams(
    props.liveViewUrl || associatedTab?.browser?.liveViewUrl || "",
  )
  const currentUrl =
    associatedTab?.browser?.currentUrl || props.currentUrl || props.startUrl || null
  const provider =
    associatedTab?.browser?.provider || props.provider || null
  const isDesktop =
    provider === "articulate_desktop"
    || associatedTab?.browser?.phase === "desktop_ready"
  const label = props.browserLabel || (isDesktop ? "Desktop" : "Cloud")
  const title = props.title || associatedTab?.title || "Browser"

  const openExpandedBrowser = () => {
    openBrowserTabForAiSession({
      browserSessionId: props.browserSessionId,
      browserId: props.browserId ?? associatedTab?.browser?.browserId,
      sessionId: props.sessionId ?? associatedTab?.browser?.sessionId,
      liveViewUrl: props.liveViewUrl ?? associatedTab?.browser?.liveViewUrl,
      startUrl: props.startUrl,
      currentUrl,
      title,
      provider,
      activate: true,
      phase: associatedTab?.browser?.phase ?? (liveViewUrl ? "ready" : isDesktop ? "desktop_ready" : null),
    })
  }

  return (
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
              {currentUrl || props.status || "Live session"}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={openExpandedBrowser}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
        >
          Open browser
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>

      <div
        className="relative w-full overflow-hidden bg-gray-50"
        style={{ aspectRatio: "16 / 10", minHeight: liveViewUrl || isDesktop ? 280 : undefined }}
      >
        {isDesktop && !liveViewUrl ? (
          <>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-50 px-4 text-center">
              <Monitor className="h-5 w-5 text-slate-500" />
              <div className="text-sm font-medium text-slate-900">Desktop browser</div>
              <div className="truncate text-xs text-slate-600">
                {currentUrl || "Open to continue in the same session"}
              </div>
            </div>
            <button
              type="button"
              onClick={openExpandedBrowser}
              className="absolute inset-0 z-10 flex items-end justify-center bg-gradient-to-t from-black/35 via-transparent to-transparent p-3"
              aria-label={`Open browser ${title}`}
            >
              <span className="rounded-md bg-white/95 px-2.5 py-1 text-[11px] font-medium text-gray-900 shadow-sm">
                Open browser
              </span>
            </button>
          </>
        ) : liveViewUrl ? (
          <>
            <iframe
              title={`Browser preview ${title}`}
              src={liveViewUrl}
              className={cn("absolute inset-0 h-full w-full border-0 bg-white pointer-events-none")}
              allow="clipboard-read; clipboard-write; fullscreen"
            />
            <button
              type="button"
              onClick={openExpandedBrowser}
              className="absolute inset-0 z-10 flex items-end justify-center bg-gradient-to-t from-black/35 via-transparent to-transparent p-3"
              aria-label={`Open browser ${title}`}
            >
              <span className="rounded-md bg-white/95 px-2.5 py-1 text-[11px] font-medium text-gray-900 shadow-sm">
                Click to open browser
              </span>
            </button>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Connecting browser…
          </div>
        )}
      </div>
    </div>
  )
}
