"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Plus, Upload } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../app/components/ui/dialog"
import { Button } from "../../app/components/ui/button"
import { Input } from "../../app/components/ui/input"
import { Label } from "../../app/components/ui/label"
import {
  completePublishingDestinationConnect,
  connectPublishingDestination,
  createPublishingDestination,
  listArtifactPublications,
  listPublishingDestinations,
  startArtifactPublication,
} from "../../app/lib/services/agentic-publishing"
import type { PublicationRun, PublishingDestination } from "../../app/lib/publishing/types"
import { publicationStatusLabel } from "../../app/lib/publishing/types"
import { PublicationRunDialog } from "./publication-run-dialog"
import { cn } from "../../app/lib/utils"

type ArtifactPublishDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  artifactId: string
  projectId: number | null
  artifactTitle?: string | null
}

type Step = "select" | "create" | "connect"

export function ArtifactPublishDialog({
  open,
  onOpenChange,
  artifactId,
  projectId,
  artifactTitle,
}: ArtifactPublishDialogProps) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>("select")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [startUrl, setStartUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectLiveUrl, setConnectLiveUrl] = useState<string | null>(null)
  const [connectingDestination, setConnectingDestination] = useState<PublishingDestination | null>(null)
  const [activeRun, setActiveRun] = useState<PublicationRun | null>(null)
  const [runOpen, setRunOpen] = useState(false)

  const destinationsQuery = useQuery({
    queryKey: ["publishing-destinations", projectId],
    enabled: open && projectId != null,
    queryFn: () => listPublishingDestinations({ projectId }),
  })

  const historyQuery = useQuery({
    queryKey: ["publication-runs", artifactId],
    enabled: open && Boolean(artifactId),
    queryFn: () => listArtifactPublications(artifactId),
  })

  useEffect(() => {
    if (!open) {
      setStep("select")
      setError(null)
      setBusy(false)
      setConnectLiveUrl(null)
      setConnectingDestination(null)
      setName("")
      setStartUrl("")
    }
  }, [open])

  const destinations = destinationsQuery.data ?? []
  const selected = useMemo(
    () => destinations.find((item) => item.id === selectedId) ?? null,
    [destinations, selectedId],
  )

  async function handleCreateAndConnect() {
    if (!projectId) return
    setBusy(true)
    setError(null)
    try {
      const created = await createPublishingDestination({
        projectId,
        name,
        startUrl,
      })
      await queryClient.invalidateQueries({ queryKey: ["publishing-destinations", projectId] })
      setSelectedId(created.id)
      const connected = await connectPublishingDestination(created.id)
      setConnectingDestination(connected.destination)
      setConnectLiveUrl(connected.live_view_url)
      setStep("connect")
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
      const connected = await connectPublishingDestination(selected.id)
      setConnectingDestination(connected.destination)
      setConnectLiveUrl(connected.live_view_url)
      setStep("connect")
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
        userConfirmed: true,
      })
      // Verification agent may still be running — retry a few times.
      for (let attempt = 0; attempt < 6 && result.pending && !result.authenticated; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2500))
        result = await completePublishingDestinationConnect(destinationId, {
          userConfirmed: true,
        })
      }
      setConnectingDestination(result.destination)
      if (result.live_view_url) setConnectLiveUrl(result.live_view_url)
      await queryClient.invalidateQueries({ queryKey: ["publishing-destinations", projectId] })
      if (!result.authenticated) {
        setError(result.message || "Sign-in could not be verified yet.")
        return
      }
      setStep("select")
      setSelectedId(result.destination.id)
      setConnectLiveUrl(null)
      setConnectingDestination(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed")
    } finally {
      setBusy(false)
    }
  }

  async function handleStartPublication() {
    if (!selectedId) return
    if (selected && selected.status !== "connected" && selected.status !== "needs_login") {
      await handleConnectSelected()
      return
    }
    setBusy(true)
    setError(null)
    try {
      const started = await startArtifactPublication({
        artifactId,
        destinationId: selectedId,
      })
      setActiveRun(started.run)
      setRunOpen(true)
      onOpenChange(false)
      await queryClient.invalidateQueries({ queryKey: ["publication-runs", artifactId] })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start publication")
    } finally {
      setBusy(false)
    }
  }

  if (!projectId) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Publish</DialogTitle>
            <DialogDescription>
              Attach this artifact to a project or task before publishing to an external website.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-gray-200 px-4 py-3 text-left">
            <DialogTitle className="text-sm">Publish artifact</DialogTitle>
            <DialogDescription className="text-xs">
              {artifactTitle ? `“${artifactTitle}” → ` : ""}
              Choose an external website destination. Sign-in happens in a remote browser — never enter
              website passwords here.
            </DialogDescription>
          </DialogHeader>

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
                        <li key={item.id} className="flex items-center justify-between gap-2">
                          <span>{publicationStatusLabel(item.status)}</span>
                          <span className="truncate text-gray-400">
                            {item.metadata?.destination_name || item.destination_id.slice(0, 8)}
                          </span>
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
                  <Label htmlFor="pub-dest-name" className="text-xs">
                    Name
                  </Label>
                  <Input
                    id="pub-dest-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Client website"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pub-dest-url" className="text-xs">
                    Start URL
                  </Label>
                  <Input
                    id="pub-dest-url"
                    value={startUrl}
                    onChange={(event) => setStartUrl(event.target.value)}
                    placeholder="https://cms.client.com/admin"
                  />
                </div>
                <p className="text-[11px] text-gray-500">
                  After saving, a remote browser opens so you can sign in manually (password, SSO, MFA,
                  CAPTCHA). Credentials are never stored in Articulate.
                </p>
              </div>
            ) : null}

            {step === "connect" ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-700">
                  {connectingDestination?.metadata?.connect_message ||
                    "In the live browser, open the destination URL and sign in manually, then verify."}
                </p>
                {selected?.start_url || connectingDestination?.start_url ? (
                  <p className="break-all rounded-md bg-gray-50 px-2 py-1.5 font-mono text-[11px] text-gray-700">
                    {connectingDestination?.start_url || selected?.start_url}
                  </p>
                ) : null}
                <div className="relative h-72 overflow-hidden rounded-md border border-gray-200 bg-white">
                  {connectLiveUrl ? (
                    <iframe
                      title="Destination login browser"
                      src={connectLiveUrl}
                      className="absolute inset-0 h-full w-full border-0 bg-white"
                      allow="autoplay; clipboard-read; clipboard-write; fullscreen"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 bg-white px-4 text-center">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      <p className="text-sm font-medium text-gray-900">Starting remote browser…</p>
                      <p className="text-xs text-gray-500">This usually takes a few seconds.</p>
                    </div>
                  )}
                </div>
                {connectLiveUrl ? (
                  <button
                    type="button"
                    className="text-[11px] text-gray-600 underline underline-offset-2 hover:text-gray-900"
                    onClick={() => window.open(connectLiveUrl, "_blank", "noopener,noreferrer")}
                  >
                    Open live browser in a new tab
                  </button>
                ) : null}
              </div>
            ) : null}

            {error ? <p className="text-xs text-red-600">{error}</p> : null}
          </div>

          <DialogFooter className="border-t border-gray-200 px-4 py-3 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (step === "select") onOpenChange(false)
                else setStep("select")
              }}
            >
              {step === "select" ? "Cancel" : "Back"}
            </Button>
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
                  I&apos;ve signed in — verify
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
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PublicationRunDialog
        open={runOpen}
        onOpenChange={setRunOpen}
        initialRun={activeRun}
        destinationName={selected?.name ?? activeRun?.metadata?.destination_name}
      />
    </>
  )
}
