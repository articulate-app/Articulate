"use client"

import React, { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "../../app/components/ui/popover"
import { getActivityRelativeTimeLabel } from "../../app/components/activity-row-timestamp"
import {
  listArtifactVersions,
  restoreArtifactVersion,
} from "../../app/lib/services/artifacts"

function versionHistoryLabel(row: {
  created_at?: string | null
  change_summary?: string | null
  change_source?: string | null
  is_current?: boolean
}): string {
  if (row.created_at) return getActivityRelativeTimeLabel(row.created_at)
  if (row.change_summary?.trim()) return row.change_summary.trim()
  if (row.change_source === "manual") return "Manual edit"
  if (row.change_source === "ai") return "AI edit"
  return "Earlier version"
}

export function ArtifactVersionHistoryList({
  isLoading,
  versions,
  onView,
  onRestore,
  isRestoring = false,
}: {
  isLoading: boolean
  versions: Array<{
    version_number: number
    is_current?: boolean
    change_summary?: string | null
    change_source?: string | null
    created_at?: string | null
  }>
  onView?: (versionNumber: number) => void
  onRestore: (versionNumber: number) => void
  isRestoring?: boolean
}) {
  return (
    <div>
      <h3 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-gray-500">
        Version history
      </h3>
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        </div>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {versions.map((row) => (
            <li
              key={row.version_number}
              className="flex flex-wrap items-center justify-between gap-2 rounded bg-gray-50 px-2.5 py-2 text-xs"
            >
              <div className="min-w-0">
                <span className="font-medium text-gray-800">
                  {versionHistoryLabel(row)}
                </span>
                {row.is_current ? (
                  <span className="ml-1.5 text-gray-500">(current)</span>
                ) : null}
                {row.change_summary && row.created_at ? (
                  <p className="mt-0.5 text-gray-500">{row.change_summary}</p>
                ) : null}
              </div>
              <div className="flex gap-1">
                {onView ? (
                  <button
                    type="button"
                    className="rounded border border-gray-200 bg-white px-2 py-1 hover:bg-gray-50"
                    onClick={() => onView(row.version_number)}
                  >
                    View
                  </button>
                ) : null}
                {!row.is_current ? (
                  <button
                    type="button"
                    disabled={isRestoring}
                    className="rounded border border-gray-200 bg-white px-2 py-1 hover:bg-gray-50 disabled:opacity-50"
                    onClick={() => onRestore(row.version_number)}
                  >
                    Restore
                  </button>
                ) : null}
              </div>
            </li>
          ))}
          {versions.length === 0 ? (
            <li className="px-1 py-3 text-xs text-muted-foreground">No versions yet.</li>
          ) : null}
        </ul>
      )}
    </div>
  )
}

type ArtifactVersionHistoryPopoverProps = {
  artifactId: string
  trigger: React.ReactNode
  /** Align popover relative to the trigger. */
  align?: "start" | "center" | "end"
  /** Optional: open a version in the artifact tab. Omitted in overview. */
  onViewVersion?: (versionNumber: number) => void
  /** Called after a successful restore (lists already invalidated). */
  onRestored?: () => void
}

/**
 * Inline version history popover — restore without leaving the current pane.
 */
export function ArtifactVersionHistoryPopover({
  artifactId,
  trigger,
  align = "start",
  onViewVersion,
  onRestored,
}: ArtifactVersionHistoryPopoverProps) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  const versionsQuery = useQuery({
    queryKey: ["artifact-versions", artifactId],
    queryFn: () => listArtifactVersions({ artifactId, limit: 40 }),
    enabled: open && Boolean(artifactId),
    staleTime: 15_000,
  })

  const handleRestore = async (versionNumber: number) => {
    setIsRestoring(true)
    setRestoreError(null)
    try {
      await restoreArtifactVersion({ artifactId, versionNumber })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["artifact", artifactId] }),
        queryClient.invalidateQueries({ queryKey: ["artifact-versions", artifactId] }),
        queryClient.invalidateQueries({ queryKey: ["task-artifacts"] }),
        queryClient.invalidateQueries({ queryKey: ["project-artifacts"] }),
        queryClient.invalidateQueries({ queryKey: ["ai-thread-artifacts"] }),
      ])
      setOpen(false)
      onRestored?.()
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : "Failed to restore version")
    } finally {
      setIsRestoring(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-[min(92vw,22rem)] p-2">
        {restoreError ? (
          <p className="mb-2 px-1 text-[11px] text-red-600">{restoreError}</p>
        ) : null}
        <ArtifactVersionHistoryList
          isLoading={versionsQuery.isLoading}
          versions={versionsQuery.data?.versions ?? []}
          onView={
            onViewVersion
              ? (versionNumber) => {
                  onViewVersion(versionNumber)
                  setOpen(false)
                }
              : undefined
          }
          onRestore={(versionNumber) => {
            void handleRestore(versionNumber)
          }}
          isRestoring={isRestoring}
        />
      </PopoverContent>
    </Popover>
  )
}
