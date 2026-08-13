"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ExternalLink, Loader2, Plus, Upload, X } from "lucide-react"
import { Button } from "../../app/components/ui/button"
import { Input } from "../../app/components/ui/input"
import { Label } from "../../app/components/ui/label"
import { cn } from "../../app/lib/utils"
import {
  cancelPublication,
  completePublishingDestinationConnect,
  confirmPublication,
  connectPublishingDestination,
  continuePublicationAfterUser,
  createPublishingDestination,
  getPublicationRun,
  listArtifactPublications,
  listPublishingDestinations,
  startArtifactPublication,
  syncPublicationRun,
  takePublicationControl,
} from "../../app/lib/services/agentic-publishing"
import { getArtifact } from "../../app/lib/services/artifacts"
import type { PublicationRun, PublishingDestination } from "../../app/lib/publishing/types"
import {
  isActivePublicationStatus,
  publicationStatusLabel,
  shouldPollPublicationSync,
} from "../../app/lib/publishing/types"
import {
  defaultBrowserUseScreen,
  withLiveViewEmbedParams,
} from "../../app/lib/publishing/browser-viewport"

type Step = "select" | "create" | "connect" | "run"

type PublishingPaneProps = {
  artifactId?: string | null
  projectId?: number | null
  artifactTitle?: string | null
  publicationRunId?: string | null
  /** Optional initial step (e.g. "create" from Publish ▾ → Add destination). */
  initialStep?: Step
  onPublicationRunIdChange?: (runId: string | null) => void
  onClose?: () => void
  /** Notify parent when a Live View session starts so a Browser tab can host it. */
  onBrowserSession?: (session: {
    destinationId: string
    destinationName: string
    liveViewUrl: string | null
    sessionId?: string | null
    publicationRunId?: string | null
    connectMessage?: string | null
    phase?: string | null
    artifactId?: string | null
  }) => void
}

export function PublishingPane({
  artifactId = null,
  projectId: projectIdProp = null,
  artifactTitle: artifactTitleProp = null,
  publicationRunId,
  initialStep,
  onPublicationRunIdChange,
  onClose,
  onBrowserSession,
}: PublishingPaneProps) {
  const queryClient = useQueryClient()
  const paneRootRef = useRef<HTMLDivElement | null>(null)
  const [step, setStep] = useState<Step>(
    publicationRunId ? "run" : initialStep === "create" ? "create" : "select",
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [startUrl, setStartUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connectLiveUrl, setConnectLiveUrl] = useState<string | null>(null)
  const [connectingDestination, setConnectingDestination] = useState<PublishingDestination | null>(null)
  const [run, setRun] = useState<PublicationRun | null>(null)

  const artifactQuery = useQuery({
    queryKey: ["artifact", artifactId],
    enabled: Boolean(artifactId),
    queryFn: () => getArtifact({ artifactId: artifactId! }),
  })
  const projectId = projectIdProp ?? artifactQuery.data?.snapshot?.project_id ?? null
  const artifactTitle = artifactTitleProp ?? artifactQuery.data?.snapshot?.title ?? null

  const destinationsQuery = useQuery({
    queryKey: ["publishing-destinations", projectId ?? "owner"],
    enabled: !artifactId || !artifactQuery.isLoading,
    queryFn: () => listPublishingDestinations({ projectId }),
  })

  const historyQuery = useQuery({
    queryKey: ["publication-runs", artifactId],
    enabled: Boolean(artifactId) && step === "select",
    queryFn: () => listArtifactPublications(artifactId!),
  })

  useEffect(() => {
    if (!publicationRunId) {
      if (step === "run" && !run) setStep("select")
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const next = await getPublicationRun(publicationRunId)
        if (cancelled) return
        setRun(next)
        setStep("run")
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load publication run")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [publicationRunId])

  useEffect(() => {
    if (step !== "run" || !run?.id || !isActivePublicationStatus(run.status)) return
    if (run.metadata?.awaiting_destination_auth) return
    let cancelled = false
    let interval: number | null = null
    const tick = async () => {
      try {
        const next = await syncPublicationRun(run.id)
        if (cancelled) return
        setRun(next)
        if (!shouldPollPublicationSync(next) && interval != null) {
          window.clearInterval(interval)
          interval = null
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to refresh publication status")
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
  }, [step, run?.id, run?.status, run?.provider_run_id, run?.metadata?.awaiting_destination_auth])

  const destinations = destinationsQuery.data ?? []
  const selected = useMemo(
    () => destinations.find((item) => item.id === selectedId) ?? null,
    [destinations, selectedId],
  )

  const destinationLabel =
    connectingDestination?.name ||
    selected?.name ||
    run?.metadata?.destination_name ||
    "destination"

  async function handleCreateAndConnect() {
    setBusy(true)
    setError(null)
    try {
      const created = await createPublishingDestination({
        projectId,
        name,
        startUrl,
      })
      await queryClient.invalidateQueries({ queryKey: ["publishing-destinations", projectId ?? "owner"] })
      setSelectedId(created.id)
      const connected = await connectPublishingDestination(created.id, {
        browserViewport: defaultBrowserUseScreen(),
      })
      setConnectingDestination(connected.destination)
      setConnectLiveUrl(connected.live_view_url)
      setStep("connect")
      onBrowserSession?.({
        destinationId: connected.destination.id,
        destinationName: connected.destination.name,
        liveViewUrl: connected.live_view_url,
        sessionId: connected.connect_session_id ?? null,
        connectMessage:
          typeof connected.destination.metadata?.connect_message === "string"
            ? connected.destination.metadata.connect_message
            : null,
        phase: "needs_user",
        artifactId,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create destination")
    } finally {
      setBusy(false)
    }
  }

  async function handleConnectSelected() {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      const connected = await connectPublishingDestination(selected.id, {
        browserViewport: defaultBrowserUseScreen(),
      })
      setConnectingDestination(connected.destination)
      setConnectLiveUrl(connected.live_view_url)
      setStep("connect")
      onBrowserSession?.({
        destinationId: connected.destination.id,
        destinationName: connected.destination.name,
        liveViewUrl: connected.live_view_url,
        sessionId: connected.connect_session_id ?? null,
        connectMessage:
          typeof connected.destination.metadata?.connect_message === "string"
            ? connected.destination.metadata.connect_message
            : null,
        phase: "needs_user",
        artifactId,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect destination")
    } finally {
      setBusy(false)
    }
  }

  async function handleVerifyConnect() {
    const destinationId = connectingDestination?.id ?? selectedId
    if (!destinationId) return
    setBusy(true)
    setError(null)
    try {
      let result = await completePublishingDestinationConnect(destinationId, {
        publicationRunId: run?.id ?? publicationRunId,
        userConfirmed: true,
      })
      for (let attempt = 0; attempt < 6 && result.pending && !result.authenticated; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2500))
        result = await completePublishingDestinationConnect(destinationId, {
          publicationRunId: run?.id ?? publicationRunId,
          userConfirmed: true,
        })
      }
      setConnectingDestination(result.destination)
      if (result.live_view_url) setConnectLiveUrl(result.live_view_url)
      if (result.run) {
        setRun(result.run)
        setStep("run")
        onPublicationRunIdChange?.(result.run.id)
      }
      onBrowserSession?.({
        destinationId: result.destination.id,
        destinationName: result.destination.name,
        liveViewUrl: result.live_view_url,
        sessionId: result.connect_session_id ?? null,
        publicationRunId: result.run?.id ?? run?.id ?? publicationRunId,
        connectMessage: result.authenticated
          ? null
          : typeof result.message === "string" && !result.message.trim().startsWith("{")
            ? result.message
            : null,
        phase: result.run?.status ?? (result.authenticated ? "connected" : "needs_user"),
        artifactId,
      })
      await queryClient.invalidateQueries({ queryKey: ["publishing-destinations", projectId ?? "owner"] })
      if (!result.authenticated) {
        setError(
          typeof result.message === "string" && !result.message.trim().startsWith("{")
            ? result.message
            : "Sign-in could not be confirmed yet.",
        )
        return
      }
      if (!result.run) {
        setStep("select")
        setSelectedId(result.destination.id)
        setConnectLiveUrl(null)
        setConnectingDestination(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify sign-in")
    } finally {
      setBusy(false)
    }
  }

  async function handleStartPublication() {
    if (!selectedId || !artifactId) return
    setBusy(true)
    setError(null)
    try {
      // Always create the publication_run first so auth cannot drop the publish intent.
      const started = await startArtifactPublication({
        artifactId,
        destinationId: selectedId,
        browserViewport: defaultBrowserUseScreen(),
      })
      const next = started.run
      setRun(next)
      onPublicationRunIdChange?.(next.id)
      if (started.needs_authentication) {
        setConnectingDestination(selected)
        setConnectLiveUrl(started.live_view_url ?? null)
        setStep("connect")
        onBrowserSession?.({
          destinationId: selectedId,
          destinationName: selected?.name || next.metadata?.destination_name || "Browser",
          liveViewUrl: started.live_view_url ?? next.live_view_url ?? null,
          sessionId: started.connect_session_id ?? null,
          publicationRunId: next.id,
          connectMessage:
            typeof started.message === "string" && !started.message.trim().startsWith("{")
              ? started.message
              : null,
          phase: "needs_user",
          artifactId,
        })
      } else {
        setStep("run")
        onBrowserSession?.({
          destinationId: selectedId,
          destinationName: selected?.name || next.metadata?.destination_name || "Browser",
          liveViewUrl: next.live_view_url ?? null,
          publicationRunId: next.id,
          phase: next.status,
          artifactId,
        })
      }
      await queryClient.invalidateQueries({ queryKey: ["publication-runs", artifactId] })
      await queryClient.invalidateQueries({ queryKey: ["publishing-destinations", projectId ?? "owner"] })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start publication")
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setBusyAction(null)
    }
  }

  const rawLiveViewUrl = step === "connect" ? connectLiveUrl : run?.live_view_url
  const liveViewUrl = rawLiveViewUrl ? withLiveViewEmbedParams(rawLiveViewUrl) : null
  const showLiveView = step === "connect" || step === "run"
  const status = run?.status ?? "starting"
  const activity = run?.activity ?? []

  return (
    <div ref={paneRootRef} className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">
            Publish · {destinationLabel}
          </p>
          <p className="mt-0.5 truncate text-xs text-gray-600">
            {step === "run"
              ? `Status: ${publicationStatusLabel(status)}${
                  run?.metadata?.artifact_title ? ` · ${run.metadata.artifact_title}` : ""
                }`
              : artifactTitle
                ? `“${artifactTitle}”`
                : "Choose an external website destination"}
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-50 hover:text-gray-900"
            aria-label="Close publishing"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </header>

      {showLiveView ? (
        <div className="relative min-h-0 flex-1 bg-white">
          {liveViewUrl ? (
            <iframe
              title={step === "connect" ? "Destination login browser" : "Remote publishing browser"}
              src={liveViewUrl}
              className="absolute inset-0 block h-full w-full border-0"
              style={{
                width: "100%",
                height: "100%",
                minWidth: 0,
                minHeight: 0,
                display: "block",
                border: 0,
              }}
              allow="autoplay; clipboard-read; clipboard-write; fullscreen"
            />
          ) : (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting remote browser…
            </div>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-3">
          {step === "select" ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Publishing destinations</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setStep("create")}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add destination
                  </Button>
                </div>
                {!projectId ? (
                  <p className="text-[11px] text-gray-500">
                    Personal destinations for this account (no project attachment required).
                  </p>
                ) : null}
                {destinationsQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </div>
                ) : destinations.length === 0 ? (
                  <p className="rounded-md border border-dashed border-gray-200 px-3 py-4 text-xs text-gray-500">
                    No destinations yet. Add an arbitrary website CMS or admin URL.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {destinations.map((destination) => {
                      const isSelected = destination.id === selectedId
                      return (
                        <li key={destination.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(destination.id)}
                            className={cn(
                              "flex w-full flex-col rounded-md border px-3 py-2 text-left",
                              isSelected
                                ? "border-gray-900 bg-gray-50"
                                : "border-gray-200 hover:border-gray-300",
                            )}
                          >
                            <span className="text-xs font-medium text-gray-900">{destination.name}</span>
                            <span className="truncate text-[11px] text-gray-500">{destination.start_url}</span>
                            <span className="mt-1 text-[11px] capitalize text-gray-600">
                              {destination.status.replace("_", " ")}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {(historyQuery.data?.length ?? 0) > 0 ? (
                <div className="space-y-1">
                  <Label className="text-xs">Recent publications</Label>
                  <ul className="space-y-1 text-[11px] text-gray-600">
                    {historyQuery.data!.slice(0, 5).map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left hover:bg-gray-50"
                          onClick={() => {
                            setRun(item)
                            setStep("run")
                            onPublicationRunIdChange?.(item.id)
                          }}
                        >
                          <span>{publicationStatusLabel(item.status)}</span>
                          <span className="truncate text-gray-400">
                            {item.metadata?.destination_name || item.destination_id.slice(0, 8)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}

          {step === "create" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pub-pane-dest-name" className="text-xs">
                  Name
                </Label>
                <Input
                  id="pub-pane-dest-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Client website"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pub-pane-dest-url" className="text-xs">
                  Start URL
                </Label>
                <Input
                  id="pub-pane-dest-url"
                  value={startUrl}
                  onChange={(event) => setStartUrl(event.target.value)}
                  placeholder="https://cms.client.com/admin"
                />
              </div>
              <p className="text-[11px] text-gray-500">
                After saving, a Browser tab opens so you can sign in directly on the destination site.
                Articulate does not receive or store your login credentials.
              </p>
            </div>
          ) : null}
        </div>
      )}

      <footer className="shrink-0 space-y-3 border-t border-gray-200 px-4 py-3">
        {step === "connect" ? (
          <p className="text-xs text-gray-700">
            {(typeof connectingDestination?.metadata?.connect_message === "string" &&
            !connectingDestination.metadata.connect_message.trim().startsWith("{")
              ? connectingDestination.metadata.connect_message
              : null) ||
              `Sign in directly to ${destinationLabel} in this browser. Articulate does not receive or store your login credentials.`}
          </p>
        ) : null}

        {step === "run" && status === "awaiting_publish_confirmation" ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <p className="font-medium">Ready to publish</p>
            <p className="mt-1 text-amber-900/90">
              Review the browser, then confirm only when you want the final publish action.
            </p>
          </div>
        ) : null}

        {step === "run" && status === "needs_user" ? (
          <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
            <p className="font-medium">Action needed in the browser</p>
            <p className="mt-1">
              {run?.error_message ||
                run?.metadata?.phase_message ||
                "Take control of the browser to continue."}
            </p>
          </div>
        ) : null}

        {step === "run" && status === "published" ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
            <p className="font-medium">Published successfully</p>
            {run?.external_url ? (
              <a
                href={run.external_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 underline"
              >
                Open publication <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        ) : null}

        {step === "run" && status === "uncertain" ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <p className="font-medium">Publication uncertain</p>
            <p className="mt-1">
              {run?.error_message ||
                "The final publish action may have run, but success could not be verified."}
            </p>
          </div>
        ) : null}

        {step === "run" && (status === "failed" || status === "cancelled") && run?.error_message ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
            {run.error_message}
          </div>
        ) : null}

        {step === "run" ? (
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Agent activity
            </p>
            <ul className="max-h-24 space-y-1 overflow-auto text-xs text-gray-700">
              {activity.length ? (
                activity.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
                    <span>{item.label}</span>
                  </li>
                ))
              ) : (
                <li className="text-gray-500">Waiting for activity…</li>
              )}
            </ul>
          </div>
        ) : null}

        {error ? <p className="text-xs text-red-600">{error}</p> : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {step === "select" || step === "create" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (step === "select") onClose?.()
                  else setStep("select")
                }}
              >
                {step === "select" ? "Close" : "Back"}
              </Button>
            ) : null}

            {step === "connect" ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep("select")}>
                Back
              </Button>
            ) : null}

            {step === "run" && isActivePublicationStatus(status) && status !== "awaiting_publish_confirmation" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={Boolean(busyAction)}
                  onClick={() => void runAction("take_control", () => takePublicationControl(run!.id))}
                >
                  {busyAction === "take_control" ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Take control
                </Button>
                {(status === "needs_user" || run?.metadata?.user_has_control) && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={Boolean(busyAction)}
                    onClick={() => void runAction("continue", () => continuePublicationAfterUser(run!.id))}
                  >
                    {busyAction === "continue" ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Continue with agent
                  </Button>
                )}
              </>
            ) : null}

            {step === "run" && status === "awaiting_publish_confirmation" ? (
              <Button
                type="button"
                size="sm"
                disabled={Boolean(busyAction)}
                onClick={() => void runAction("confirm", () => confirmPublication(run!.id))}
              >
                {busyAction === "confirm" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Confirm publication
              </Button>
            ) : null}
          </div>

          <div className="flex gap-2">
            {step === "create" ? (
              <Button
                type="button"
                size="sm"
                disabled={busy || !name.trim() || !startUrl.trim()}
                onClick={() => void handleCreateAndConnect()}
              >
                {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Connect
              </Button>
            ) : null}

            {step === "connect" ? (
              <Button type="button" size="sm" disabled={busy} onClick={() => void handleVerifyConnect()}>
                {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                I&apos;ve signed in
              </Button>
            ) : null}

            {step === "select" ? (
              <>
                {selected && selected.status !== "connected" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || !selectedId}
                    onClick={() => void handleConnectSelected()}
                  >
                    {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    Connect
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !selectedId || selected?.status === "connecting"}
                  onClick={() => void handleStartPublication()}
                >
                  {busy ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Start publication
                </Button>
              </>
            ) : null}

            {step === "run" && isActivePublicationStatus(status) ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-700 hover:bg-red-50 hover:text-red-800"
                disabled={Boolean(busyAction)}
                onClick={() => void runAction("cancel", () => cancelPublication(run!.id))}
              >
                {busyAction === "cancel" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Cancel
              </Button>
            ) : null}

            {step === "run" && !isActivePublicationStatus(status) ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setStep("select")
                  setRun(null)
                  onPublicationRunIdChange?.(null)
                }}
              >
                Back to destinations
              </Button>
            ) : null}
          </div>
        </div>
      </footer>
    </div>
  )
}
