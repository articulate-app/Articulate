"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "../ui/button"
import { cn } from "../../lib/utils"
import {
  cancelPublication,
  listProjectPublications,
  listScheduledPublications,
  publishScheduledNow,
  reschedulePublication,
} from "../../lib/services/agentic-publishing"
import type { PublicationRun } from "../../lib/publishing/types"
import {
  publicationStatusLabel,
  scheduleWordingLabel,
} from "../../lib/publishing/types"
import { toast } from "../ui/use-toast"

type OpsFilter = "scheduled" | "published" | "needs_attention"

export function ProjectPublishingOperations({
  projectId,
  initialFilter = "scheduled",
}: {
  projectId: number
  initialFilter?: OpsFilter
}) {
  const [filter, setFilter] = useState<OpsFilter>(initialFilter)
  const [runs, setRuns] = useState<PublicationRun[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const [scheduled, all] = await Promise.all([
        listScheduledPublications({ projectId }),
        listProjectPublications({ projectId }),
      ])
      const byId = new Map<string, PublicationRun>()
      for (const run of [...all, ...scheduled]) byId.set(run.id, run)
      setRuns(Array.from(byId.values()))
    } catch (error) {
      toast({
        title: "Could not load publications",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: number; filter?: OpsFilter }>).detail
      if (detail?.projectId != null && detail.projectId !== projectId) return
      if (detail?.filter) setFilter(detail.filter)
      void load()
    }
    window.addEventListener("articulate:open-project-publishing", onOpen)
    return () => window.removeEventListener("articulate:open-project-publishing", onOpen)
  }, [load, projectId])

  const filtered = useMemo(() => {
    if (filter === "scheduled") {
      return runs
        .filter((run) => run.status === "scheduled")
        .sort((a, b) => String(a.scheduled_at ?? "").localeCompare(String(b.scheduled_at ?? "")))
    }
    if (filter === "published") {
      return runs
        .filter((run) => run.status === "published")
        .sort((a, b) =>
          String(b.published_at ?? b.completed_at ?? "").localeCompare(
            String(a.published_at ?? a.completed_at ?? ""),
          ),
        )
    }
    return runs
      .filter((run) =>
        ["needs_user", "failed", "uncertain", "awaiting_publish_confirmation"].includes(run.status),
      )
      .sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")))
  }, [filter, runs])

  const counts = useMemo(
    () => ({
      scheduled: runs.filter((run) => run.status === "scheduled").length,
      published: runs.filter((run) => run.status === "published").length,
      needs_attention: runs.filter((run) =>
        ["needs_user", "failed", "uncertain", "awaiting_publish_confirmation"].includes(run.status),
      ).length,
    }),
    [runs],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-gray-100 pb-2">
        {(
          [
            ["scheduled", "Scheduled"],
            ["published", "Published"],
            ["needs_attention", "Needs attention"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "rounded-md px-2.5 py-1 text-xs",
              filter === id
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
            )}
            onClick={() => setFilter(id)}
          >
            {label}
            {counts[id] > 0 ? (
              <span className="ml-1 tabular-nums opacity-80">({counts[id]})</span>
            ) : null}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center py-8 text-sm text-gray-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading publications…
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500">
          {filter === "scheduled"
            ? "No upcoming scheduled publications."
            : filter === "published"
              ? "No published items yet."
              : "Nothing needs attention."}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((run) => {
            const when =
              run.scheduled_at_display ||
              run.scheduled_at ||
              run.published_at ||
              run.completed_at ||
              ""
            return (
              <li key={run.id} className="rounded-md border border-gray-200 px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {run.metadata?.artifact_title || "Untitled"}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-600">
                      {run.metadata?.destination_name || "Destination"}
                      {" · "}
                      {filter === "scheduled"
                        ? scheduleWordingLabel(run)
                        : publicationStatusLabel(run.status)}
                    </p>
                    {when ? <p className="mt-0.5 text-xs text-gray-500">{when}</p> : null}
                  </div>
                  {filter === "scheduled" ? (
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === run.id || run.schedule_strategy === "external"}
                        onClick={async () => {
                          if (!run.scheduled_at) return
                          const next = new Date(run.scheduled_at)
                          next.setHours(next.getHours() + 1)
                          setBusyId(run.id)
                          try {
                            await reschedulePublication({
                              runId: run.id,
                              scheduledAt: next.toISOString(),
                              timezone: run.schedule_timezone,
                            })
                            await load()
                            toast({ title: "Rescheduled (+1 hour)" })
                          } catch (error) {
                            toast({
                              title: "Could not reschedule",
                              description:
                                error instanceof Error ? error.message : "Try again",
                              variant: "destructive",
                            })
                          } finally {
                            setBusyId(null)
                          }
                        }}
                      >
                        Reschedule
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-red-700"
                        disabled={busyId === run.id}
                        onClick={async () => {
                          setBusyId(run.id)
                          try {
                            await cancelPublication(run.id)
                            await load()
                            toast({ title: "Cancelled" })
                          } catch (error) {
                            toast({
                              title: "Could not cancel",
                              description:
                                error instanceof Error ? error.message : "Try again",
                              variant: "destructive",
                            })
                          } finally {
                            setBusyId(null)
                          }
                        }}
                      >
                        Cancel
                      </Button>
                      {run.schedule_strategy === "internal" ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={busyId === run.id}
                          onClick={async () => {
                            setBusyId(run.id)
                            try {
                              await publishScheduledNow(run.id)
                              await load()
                              toast({ title: "Publishing now" })
                            } catch (error) {
                              toast({
                                title: "Could not publish now",
                                description:
                                  error instanceof Error ? error.message : "Try again",
                                variant: "destructive",
                              })
                            } finally {
                              setBusyId(null)
                            }
                          }}
                        >
                          Publish now
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
