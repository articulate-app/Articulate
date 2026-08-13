"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { ArrowUpRight, Globe2, Loader2 } from "lucide-react"
import {
  completePublishingDestinationConnect,
  getPublicationRun,
  syncPublicationRun,
} from "../../app/lib/services/agentic-publishing"
import {
  isActivePublicationStatus,
  publicationStatusLabel,
  shouldPollPublicationSync,
  type PublicationRun,
} from "../../app/lib/publishing/types"
import { withLiveViewEmbedParams } from "../../app/lib/publishing/browser-viewport"
import { openBrowserTabForPublication } from "../artifacts/open-browser-tab-for-publication"
import { useRightPaneTabsStore, findBrowserTabForPublication } from "../../app/store/right-pane-tabs"
import { LocalBrowserSurface } from "../artifacts/local-browser-surface"
import { cn } from "../../app/lib/utils"

function previewStatusLabel(run: PublicationRun | null, fallbackStatus?: string | null): string {
  const status = run?.status ?? fallbackStatus ?? null
  if (!status) return "Starting…"
  if (status === "scheduled") {
    const when = run?.scheduled_at_display || run?.scheduled_at
    return when ? `Scheduled · ${when}` : "Scheduled"
  }
  if (status === "needs_user") {
    if (run?.metadata?.awaiting_destination_auth) return "Waiting for sign-in"
    if (run?.metadata?.user_question?.message) return "Waiting for your input"
    return "Waiting for your input"
  }
  if (status === "awaiting_publish_confirmation") {
    return run?.publish_mode === "scheduled" ? "Ready to schedule" : "Ready to publish"
  }
  if (status === "running") {
    const last = run?.activity?.[run.activity.length - 1]?.label
    if (run?.publish_mode === "scheduled") return last || "Scheduling…"
    return last || "Working…"
  }
  return publicationStatusLabel(status)
}

export function PublicationBrowserPreviewCard(props: {
  publicationRunId: string
  liveViewUrl?: string | null
  destinationId?: string | null
  destinationName?: string | null
  artifactId?: string | null
  initialStatus?: string | null
}) {
  const [run, setRun] = useState<PublicationRun | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusNote, setStatusNote] = useState<string | null>(null)
  const [isCompletingSignIn, setIsCompletingSignIn] = useState(false)
  const pollBusyRef = useRef(false)
  const isConnectOnlyPreview = props.publicationRunId.startsWith("connect:")
  const browserTabs = useRightPaneTabsStore((s) => s.tabs)
  const updateTab = useRightPaneTabsStore((s) => s.updateTab)

  const associatedTab = useMemo(
    () =>
      findBrowserTabForPublication(browserTabs, {
        publicationRunId: props.publicationRunId,
        destinationId: props.destinationId,
      }),
    [browserTabs, props.destinationId, props.publicationRunId],
  )

  useEffect(() => {
    // Peer Browser tab stays available, but do not steal focus from AI chat.
    openBrowserTabForPublication({
      publicationRunId: props.publicationRunId,
      liveViewUrl: props.liveViewUrl,
      destinationId: props.destinationId,
      destinationName: props.destinationName,
      artifactId: props.artifactId,
      activate: false,
      phase: props.initialStatus ?? (isConnectOnlyPreview ? "needs_user" : "running"),
    })
  }, [
    isConnectOnlyPreview,
    props.artifactId,
    props.destinationId,
    props.destinationName,
    props.initialStatus,
    props.liveViewUrl,
    props.publicationRunId,
  ])

  useEffect(() => {
    if (isConnectOnlyPreview) return
    let cancelled = false
    const tick = async () => {
      if (pollBusyRef.current) return
      pollBusyRef.current = true
      try {
        const current = run
        const next =
          current && shouldPollPublicationSync(current)
            ? await syncPublicationRun(props.publicationRunId)
            : await getPublicationRun(props.publicationRunId)
        if (cancelled) return
        setRun(next)
        setError(null)
        const tab = findBrowserTabForPublication(useRightPaneTabsStore.getState().tabs, {
          publicationRunId: props.publicationRunId,
          destinationId: props.destinationId ?? next.destination_id,
        })
        if (tab) {
          updateTab(tab.key, {
            title: next.metadata?.destination_name || props.destinationName || tab.title,
            browser: {
              ...tab.browser,
              publicationRunId: next.id,
              liveViewUrl: next.live_view_url ?? tab.browser?.liveViewUrl ?? null,
              destinationId: next.destination_id,
              destinationName:
                next.metadata?.destination_name ?? props.destinationName ?? null,
              artifactId: next.artifact_id ?? props.artifactId ?? null,
              phase: next.status,
            },
          })
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not refresh publication")
        }
      } finally {
        pollBusyRef.current = false
      }
    }
    void tick()
    const active = !run || isActivePublicationStatus(run.status)
    if (!active) {
      return () => {
        cancelled = true
      }
    }
    const interval = window.setInterval(() => {
      void tick()
    }, 2500)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [
    isConnectOnlyPreview,
    props.artifactId,
    props.destinationId,
    props.destinationName,
    props.publicationRunId,
    run?.status,
    updateTab,
  ])

  const liveViewUrl = withLiveViewEmbedParams(
    run?.live_view_url || props.liveViewUrl || associatedTab?.browser?.liveViewUrl || "",
  )
  const localBridgeSessionId =
    associatedTab?.browser?.bridgeSessionId ||
    (associatedTab?.browser?.provider === "browser_use_local"
      ? associatedTab?.browser?.sessionId
      : null) ||
    (typeof run?.metadata?.bridge_session_id === "string"
      ? run.metadata.bridge_session_id
      : null) ||
    (run?.provider === "browser_use_local" ? run.provider_session_id : null) ||
    null
  const isLocalPreview = Boolean(localBridgeSessionId) && !liveViewUrl
  const destinationName =
    run?.metadata?.destination_name || props.destinationName || "Publishing"
  const effectiveStatus = run?.status ?? props.initialStatus ?? null
  const awaitingSignIn =
    Boolean(run?.metadata?.awaiting_destination_auth) ||
    run?.error_code === "authentication_required" ||
    (run == null &&
      (isConnectOnlyPreview ||
        props.initialStatus === "needs_user" ||
        props.initialStatus === "connecting"))

  const statusText = previewStatusLabel(run, props.initialStatus)
  const question =
    run?.status === "needs_user" && !run.metadata?.awaiting_destination_auth
      ? run.metadata?.user_question?.message || run.error_message || run.metadata?.phase_message
      : awaitingSignIn
        ? `Sign in below (or expand to the Browser tab). When you're done, click I've signed in — publication continues automatically.`
        : null

  const openExpandedBrowser = () => {
    openBrowserTabForPublication({
      publicationRunId: props.publicationRunId,
      liveViewUrl: run?.live_view_url || props.liveViewUrl,
      destinationId: run?.destination_id || props.destinationId,
      destinationName,
      artifactId: run?.artifact_id || props.artifactId,
      activate: true,
      phase: run?.status ?? props.initialStatus ?? "running",
    })
  }

  const completeSignIn = async () => {
    const destinationId = run?.destination_id || props.destinationId
    if (!destinationId || isCompletingSignIn) return
    setIsCompletingSignIn(true)
    setError(null)
    setStatusNote("Confirming sign-in and continuing publication…")
    try {
      let result = await completePublishingDestinationConnect(destinationId, {
        publicationRunId: isConnectOnlyPreview ? null : props.publicationRunId,
        userConfirmed: true,
      })
      for (let attempt = 0; attempt < 6 && result.pending && !result.authenticated; attempt += 1) {
        setStatusNote(`Confirming sign-in… (${attempt + 2}/7)`)
        await new Promise((resolve) => window.setTimeout(resolve, 2500))
        result = await completePublishingDestinationConnect(destinationId, {
          publicationRunId: isConnectOnlyPreview ? null : props.publicationRunId,
          userConfirmed: true,
        })
      }

      if (result.run) setRun(result.run)
      if (result.live_view_url) {
        const tab = findBrowserTabForPublication(useRightPaneTabsStore.getState().tabs, {
          publicationRunId: props.publicationRunId,
          destinationId,
        })
        if (tab) {
          updateTab(tab.key, {
            browser: {
              ...tab.browser,
              liveViewUrl: result.live_view_url,
              phase: result.run?.status ?? tab.browser?.phase ?? "running",
            },
          })
        }
      }

      if (result.authenticated) {
        setStatusNote(
          result.message ||
            (result.resumed_publication
              ? `Connected to ${destinationName}. Continuing publication…`
              : `Connected to ${destinationName}`),
        )
        setError(null)
        // Refresh run after resume so awaiting_destination_auth clears in UI.
        if (!isConnectOnlyPreview) {
          try {
            const next = await getPublicationRun(props.publicationRunId)
            setRun(next)
          } catch {
            // keep result.run
          }
        }
      } else {
        setStatusNote(null)
        setError(
          result.message ||
            "Sign-in could not be confirmed yet. Finish login in the preview, then try again.",
        )
      }
    } catch (err) {
      setStatusNote(null)
      setError(err instanceof Error ? err.message : "Could not verify sign-in")
    } finally {
      setIsCompletingSignIn(false)
    }
  }

  const showInteractiveLiveView = Boolean(liveViewUrl) && awaitingSignIn

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Globe2 className="h-3.5 w-3.5 shrink-0 text-gray-500" />
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-gray-900">
              {awaitingSignIn ? "Sign in required" : "Publishing"} · {destinationName}
            </div>
            <div className="truncate text-[11px] text-gray-500">
              {statusNote ||
                (awaitingSignIn
                  ? isLocalPreview
                    ? "Sign in in the Browser tab (or expand)"
                    : "Use the preview below to log in"
                  : statusText)}
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

      {run?.status === "scheduled" && !liveViewUrl && !isLocalPreview ? (
        <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-1 bg-violet-50/60 px-4 text-center">
          <div className="text-sm font-medium text-violet-900">Scheduled</div>
          <div className="text-xs text-violet-800">
            {run.scheduled_at_display || run.scheduled_at || "Pending"}
          </div>
        </div>
      ) : (
        <div
          className="relative w-full overflow-hidden bg-gray-50"
          style={{
            aspectRatio: showInteractiveLiveView ? "4 / 3" : "16 / 10",
            minHeight: showInteractiveLiveView || isLocalPreview ? 280 : undefined,
          }}
        >
          {isLocalPreview && localBridgeSessionId ? (
            <>
              <LocalBrowserSurface
                sessionId={localBridgeSessionId}
                interactive={false}
                showToolbar={false}
                showPageTabs={false}
                showDiagnostics={false}
                previewMode
                className="absolute inset-0 h-full w-full"
              />
              <button
                type="button"
                onClick={openExpandedBrowser}
                className="absolute inset-0 z-10 flex items-end justify-center bg-gradient-to-t from-black/35 via-transparent to-transparent p-3"
                aria-label={`Open browser for ${destinationName}`}
              >
                <span className="rounded-md bg-white/95 px-2.5 py-1 text-[11px] font-medium text-gray-900 shadow-sm">
                  Open browser
                </span>
              </button>
            </>
          ) : liveViewUrl ? (
            <iframe
              title={`Publication preview ${destinationName}`}
              src={liveViewUrl}
              className={cn(
                "absolute inset-0 h-full w-full border-0 bg-white",
                showInteractiveLiveView ? "pointer-events-auto" : "pointer-events-none",
              )}
              allow="clipboard-read; clipboard-write; fullscreen"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Connecting browser…
            </div>
          )}
          {!showInteractiveLiveView && liveViewUrl ? (
            <button
              type="button"
              onClick={openExpandedBrowser}
              className="absolute inset-0 z-10 flex items-end justify-center bg-gradient-to-t from-black/35 via-transparent to-transparent p-3"
              aria-label={`Open browser for ${destinationName}`}
            >
              <span className="rounded-md bg-white/95 px-2.5 py-1 text-[11px] font-medium text-gray-900 shadow-sm">
                Click to open browser
              </span>
            </button>
          ) : null}
        </div>
      )}

      {(question || error || awaitingSignIn || statusNote) && (
        <div
          className={cn(
            "space-y-2 border-t border-gray-100 px-3 py-2 text-[11px] leading-snug",
            error ? "text-red-600" : "text-amber-800",
          )}
        >
          <div>{error || statusNote || question}</div>
          {awaitingSignIn && (run?.destination_id || props.destinationId) ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isCompletingSignIn}
                onClick={() => void completeSignIn()}
                className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-gray-800 disabled:opacity-60"
              >
                {isCompletingSignIn ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                I&apos;ve signed in — continue
              </button>
              <button
                type="button"
                onClick={openExpandedBrowser}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
              >
                Expand browser
              </button>
            </div>
          ) : null}
          {!awaitingSignIn && effectiveStatus === "running" ? (
            <div className="text-emerald-700">Publication continuing…</div>
          ) : null}
        </div>
      )}
    </div>
  )
}
