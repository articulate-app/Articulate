"use client"

import { useEffect, useState } from "react"
import { ExternalLink, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../app/components/ui/dialog"
import { Button } from "../../app/components/ui/button"
import { cn } from "../../app/lib/utils"
import {
  cancelPublication,
  confirmPublication,
  continuePublicationAfterUser,
  syncPublicationRun,
  takePublicationControl,
} from "../../app/lib/services/agentic-publishing"
import {
  isActivePublicationStatus,
  publicationStatusLabel,
  type PublicationRun,
} from "../../app/lib/publishing/types"
import { withLiveViewEmbedParams } from "../../app/lib/publishing/browser-viewport"

type PublicationRunDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialRun: PublicationRun | null
  destinationName?: string | null
}

export function PublicationRunDialog({
  open,
  onOpenChange,
  initialRun,
  destinationName,
}: PublicationRunDialogProps) {
  const [run, setRun] = useState<PublicationRun | null>(initialRun)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setRun(initialRun)
  }, [initialRun])

  useEffect(() => {
    if (!open || !run?.id || !isActivePublicationStatus(run.status)) return
    let cancelled = false
    const tick = async () => {
      try {
        const next = await syncPublicationRun(run.id)
        if (!cancelled) setRun(next)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to refresh publication status")
      }
    }
    void tick()
    const interval = window.setInterval(() => void tick(), 2500)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [open, run?.id, run?.status])

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

  const titleDestination =
    destinationName || run?.metadata?.destination_name || "destination"
  const status = run?.status ?? "starting"
  const activity = run?.activity ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[92vh] w-[min(96vw,72rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0"
        showCloseButton
      >
        <DialogHeader className="shrink-0 border-b border-gray-200 px-4 py-3 text-left">
          <DialogTitle className="text-sm font-semibold text-gray-900">
            Publishing to: {titleDestination}
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-600">
            Status: {publicationStatusLabel(status)}
            {run?.metadata?.artifact_title ? ` · ${run.metadata.artifact_title}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-rows-[minmax(16rem,1fr)_auto] gap-0">
          <div className="relative min-h-[16rem] bg-white">
            {run?.live_view_url ? (
              <iframe
                title="Remote publishing browser"
                src={withLiveViewEmbedParams(run.live_view_url)}
                className="absolute inset-0 h-full w-full border-0 bg-white"
                allow="autoplay; clipboard-read; clipboard-write; fullscreen"
              />
            ) : (
              <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-2 bg-white px-6 text-center">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                <p className="text-sm font-medium text-gray-900">Starting remote browser…</p>
                <p className="text-xs text-gray-500">This usually takes a few seconds.</p>
              </div>
            )}
          </div>

          <div className="shrink-0 space-y-3 border-t border-gray-200 px-4 py-3">
            {status === "awaiting_publish_confirmation" ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <p className="font-medium">Ready to publish</p>
                <p className="mt-1 text-amber-900/90">
                  The browser agent has completed the publication form and is ready to perform the final
                  action. Confirm only after reviewing the browser.
                </p>
              </div>
            ) : null}

            {status === "needs_user" ? (
              <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
                <p className="font-medium">Action needed in the browser</p>
                <p className="mt-1">
                  {run?.error_message ||
                    run?.metadata?.phase_message ||
                    "The website requires verification. Take control of the browser to continue."}
                </p>
              </div>
            ) : null}

            {status === "published" ? (
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

            {status === "uncertain" ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <p className="font-medium">Publication uncertain</p>
                <p className="mt-1">
                  {run?.error_message ||
                    "The final publish action may have run, but success could not be verified. Inspect the destination before trying again."}
                </p>
                {run?.external_url ? (
                  <a
                    href={run.external_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 underline"
                  >
                    Open possible publication <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            ) : null}

            {(status === "failed" || status === "cancelled") && run?.error_message ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                {run.error_message}
              </div>
            ) : null}

            {error ? <p className="text-xs text-red-600">{error}</p> : null}

            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                Agent activity
              </p>
              <ul className="max-h-28 space-y-1 overflow-auto text-xs text-gray-700">
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

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {isActivePublicationStatus(status) && status !== "awaiting_publish_confirmation" ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={Boolean(busyAction)}
                      onClick={() =>
                        void runAction("take_control", () => takePublicationControl(run!.id))
                      }
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
                        onClick={() =>
                          void runAction("continue", () => continuePublicationAfterUser(run!.id))
                        }
                      >
                        {busyAction === "continue" ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Continue with agent
                      </Button>
                    )}
                  </>
                ) : null}

                {status === "awaiting_publish_confirmation" ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (run?.live_view_url) window.open(run.live_view_url, "_blank", "noopener,noreferrer")
                      }}
                    >
                      Review in browser
                    </Button>
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
                  </>
                ) : null}
              </div>

              <div className="flex gap-2">
                {isActivePublicationStatus(status) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn("text-red-700 hover:bg-red-50 hover:text-red-800")}
                    disabled={Boolean(busyAction)}
                    onClick={() => void runAction("cancel", () => cancelPublication(run!.id))}
                  >
                    {busyAction === "cancel" ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Cancel
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                    Close
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
