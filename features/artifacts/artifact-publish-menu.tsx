"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, Loader2, Plus, Upload } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "../../app/components/ui/popover"
import {
  listArtifactPublications,
  listPublishingDestinations,
  listScheduledPublications,
} from "../../app/lib/services/agentic-publishing"
import {
  isActivePublicationStatus,
  publicationStatusLabel,
  scheduleWordingLabel,
} from "../../app/lib/publishing/types"
import { buildPublishBrowserTabId } from "../../app/lib/publishing/browser-viewport"
import { buildOpenBrowserPaneParams } from "../../app/components/tasks/browser-pane-url"
import { shallowReplaceSearchParams } from "../../app/lib/tasks-shallow-nav"
import {
  findBrowserTabForPublication,
  useRightPaneTabsStore,
} from "../../app/store/right-pane-tabs"
import { cn } from "../../app/lib/utils"
import { SchedulePublicationDialog } from "./schedule-publication-dialog"

type ArtifactPublishMenuProps = {
  artifactId: string
  projectId?: number | null
  disabled?: boolean
  pathname: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Hide the default icon trigger (use with controlled `open` from a parent menu). */
  hideTrigger?: boolean
}

export function ArtifactPublishMenu({
  artifactId,
  projectId = null,
  disabled = false,
  pathname,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: ArtifactPublishMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = openProp ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen
  const [scheduleTarget, setScheduleTarget] = useState<{
    id: string
    name: string
  } | null>(null)
  const upsertTab = useRightPaneTabsStore((state) => state.upsertTab)
  const tabs = useRightPaneTabsStore((state) => state.tabs)

  const destinationsQuery = useQuery({
    queryKey: ["publishing-destinations", projectId ?? "owner"],
    enabled: open,
    queryFn: () => listPublishingDestinations({ projectId }),
  })

  const historyQuery = useQuery({
    queryKey: ["publication-runs", artifactId],
    enabled: open,
    queryFn: () => listArtifactPublications(artifactId),
  })

  const scheduledQuery = useQuery({
    queryKey: ["publication-runs-scheduled", projectId ?? "owner"],
    enabled: open,
    queryFn: () => listScheduledPublications({ projectId }),
  })

  const destinations = destinationsQuery.data ?? []
  const history = useMemo(() => (historyQuery.data ?? []).slice(0, 6), [historyQuery.data])
  const scheduled = useMemo(
    () => (scheduledQuery.data ?? []).filter((run) => run.status === "scheduled").slice(0, 8),
    [scheduledQuery.data],
  )

  function openBrowserPeerTab(args: {
    destinationId?: string | null
    destinationName?: string | null
    publicationRunId?: string | null
    phase: string
    activate?: boolean
  }) {
    const existing = findBrowserTabForPublication(tabs, {
      publicationRunId: args.publicationRunId,
      destinationId: args.destinationId,
      artifactId,
    })
    const browserTabId =
      existing?.key.replace(/^browser:/, "") ??
      buildPublishBrowserTabId({
        artifactId,
        destinationId: args.destinationId,
      })
    // Fresh Publish ▸ destination must not reuse a cancelled/failed run id, or
    // BrowserSessionPane skips auto-start (`if (publicationRunId) return`).
    const isFreshProvision = args.phase === "provisioning" && !args.publicationRunId
    const key = upsertTab({
      kind: "browser",
      id: browserTabId,
      title: args.destinationName || existing?.title || "Browser",
      browser: {
        ...(isFreshProvision ? {} : (existing?.browser ?? {})),
        artifactId,
        destinationId: args.destinationId ?? existing?.browser?.destinationId ?? null,
        destinationName: args.destinationName ?? existing?.browser?.destinationName ?? null,
        publicationRunId: isFreshProvision
          ? null
          : (args.publicationRunId ?? existing?.browser?.publicationRunId ?? null),
        phase: args.phase,
        intentionallyStopped: false,
        ...(isFreshProvision
          ? {
              liveViewUrl: null,
              sessionId: null,
              browserId: null,
              connectMessage: null,
            }
          : {}),
      },
      activate: args.activate !== false,
    })
    upsertTab({ kind: "ai", activate: false })
    const next = buildOpenBrowserPaneParams(new URLSearchParams(window.location.search), {
      artifactId,
      publicationRunId: isFreshProvision
        ? null
        : (args.publicationRunId ?? null),
      browserTabId: key.replace(/^browser:/, ""),
      keepAiOpen: true,
    })
    shallowReplaceSearchParams(pathname || "/", next, "artifact-publish-menu")
    setOpen(false)
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        {hideTrigger ? null : (
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className="inline-flex h-8 items-center gap-0.5 rounded-md px-1.5 text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
              aria-label="Publish"
              title="Publish to website"
            >
              <Upload className="h-3.5 w-3.5" />
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>
          </PopoverTrigger>
        )}
        <PopoverContent align="end" className="z-[120] w-[min(92vw,18rem)] p-1">
          <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Publish
          </p>
          {destinationsQuery.isLoading ? (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-gray-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading destinations…
            </div>
          ) : destinations.length === 0 ? (
            <p className="px-2 py-2 text-xs text-gray-600">No destinations yet.</p>
          ) : (
            destinations.map((destination) => (
              <div key={destination.id} className="rounded-sm px-1 py-1">
                <div className="flex items-center justify-between gap-2 px-1 py-0.5">
                  <span className="min-w-0 truncate text-xs font-medium text-gray-800">
                    {destination.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-[10px] uppercase tracking-wide",
                      destination.status === "connected" ? "text-emerald-600" : "text-amber-700",
                    )}
                  >
                    {destination.status === "connected" ? "Ready" : destination.status}
                  </span>
                </div>
                <div className="mt-0.5 flex gap-1">
                  <button
                    type="button"
                    className="flex-1 rounded-sm px-2 py-1 text-left text-[11px] text-gray-700 hover:bg-gray-50"
                    onClick={() =>
                      openBrowserPeerTab({
                        destinationId: destination.id,
                        destinationName: destination.name,
                        phase: "provisioning",
                      })
                    }
                  >
                    Publish now
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-sm px-2 py-1 text-left text-[11px] text-gray-700 hover:bg-gray-50"
                    onClick={() => {
                      setOpen(false)
                      setScheduleTarget({ id: destination.id, name: destination.name })
                    }}
                  >
                    Schedule…
                  </button>
                </div>
              </div>
            ))
          )}

          <div className="my-1 border-t border-gray-100" />

          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-gray-800 hover:bg-gray-50"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("articulate:open-project-publishing", {
                    detail: { projectId, filter: "scheduled" },
                  }),
                )
              }
              setOpen(false)
            }}
          >
            <span>Scheduled publications</span>
            {scheduled.length > 0 ? (
              <span className="tabular-nums text-[10px] text-violet-700">{scheduled.length}</span>
            ) : null}
          </button>

          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-gray-800 hover:bg-gray-50"
            onClick={() =>
              openBrowserPeerTab({
                destinationName: "Add destination",
                phase: "add_destination",
              })
            }
          >
            <Plus className="h-3.5 w-3.5 text-gray-500" />
            Add destination
          </button>

          {scheduled.length > 0 ? (
            <>
              <div className="my-1 border-t border-gray-100" />
              <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                Upcoming
              </p>
              {scheduled.slice(0, 3).map((run) => (
                <button
                  key={run.id}
                  type="button"
                  className="flex w-full flex-col gap-0.5 rounded-sm px-2 py-1.5 text-left hover:bg-gray-50"
                  onClick={() =>
                    openBrowserPeerTab({
                      destinationId: run.destination_id,
                      destinationName: run.metadata?.destination_name || "Browser",
                      publicationRunId: run.id,
                      phase: "scheduled",
                    })
                  }
                >
                  <span className="truncate text-xs font-medium text-gray-800">
                    {run.metadata?.artifact_title || run.metadata?.destination_name || "Publication"}
                  </span>
                  <span className="text-[11px] text-violet-700">
                    {run.scheduled_at_display || run.scheduled_at || "Scheduled"}
                    {" · "}
                    {scheduleWordingLabel(run)}
                  </span>
                </button>
              ))}
            </>
          ) : null}

          {history.length > 0 ? (
            <>
              <div className="my-1 border-t border-gray-100" />
              <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                Publication history
              </p>
              {history.map((run) => {
                const active = isActivePublicationStatus(run.status)
                const scheduledLabel =
                  run.status === "scheduled"
                    ? run.scheduled_at_display || run.scheduled_at
                    : null
                return (
                  <button
                    key={run.id}
                    type="button"
                    className="flex w-full flex-col gap-0.5 rounded-sm px-2 py-1.5 text-left hover:bg-gray-50"
                    onClick={() => {
                      if (run.status === "scheduled" && !run.live_view_url) {
                        // Scheduled (parked) — still allow opening history context in browser tab.
                        openBrowserPeerTab({
                          destinationId: run.destination_id,
                          destinationName: run.metadata?.destination_name || "Browser",
                          publicationRunId: run.id,
                          phase: run.status,
                        })
                        return
                      }
                      openBrowserPeerTab({
                        destinationId: run.destination_id,
                        destinationName: run.metadata?.destination_name || "Browser",
                        publicationRunId: run.id,
                        phase: run.status,
                      })
                    }}
                  >
                    <span className="truncate text-xs font-medium text-gray-800">
                      {run.metadata?.destination_name || "Publication"}
                    </span>
                    <span
                      className={cn(
                        "text-[11px]",
                        run.status === "scheduled"
                          ? "text-violet-700"
                          : active
                            ? "text-sky-700"
                            : "text-gray-500",
                      )}
                    >
                      {publicationStatusLabel(run.status)}
                      {scheduledLabel ? ` · ${scheduledLabel}` : ""}
                    </span>
                  </button>
                )
              })}
            </>
          ) : null}
        </PopoverContent>
      </Popover>

      {scheduleTarget ? (
        <SchedulePublicationDialog
          open={Boolean(scheduleTarget)}
          onOpenChange={(next) => {
            if (!next) setScheduleTarget(null)
          }}
          artifactId={artifactId}
          destinationId={scheduleTarget.id}
          destinationName={scheduleTarget.name}
          projectId={projectId}
          defaultTimezone="Europe/Lisbon"
        />
      ) : null}
    </>
  )
}
