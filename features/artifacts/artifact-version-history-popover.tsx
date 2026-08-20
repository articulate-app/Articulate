"use client"

import React, { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "../../app/components/ui/popover"
import { ActivityRowTimestamp } from "../../app/components/activity-row-timestamp"
import { useViewUsersCanSee } from "../../app/hooks/use-view-users-can-see"
import { getImageUrl } from "../../app/lib/public-media"
import {
  listArtifactVersions,
  restoreArtifactVersionForEdit,
} from "../../app/lib/services/artifacts"
import {
  artifactHistoryUserFacingSummary,
  formatArtifactHistoryDescription,
} from "../../app/lib/artifacts/artifact-history"
import { ArtifactChangeDiffPanel } from "./artifact-change-diff-panel"
import { applyArtifactCachePatch } from "./artifact-query-cache"

function HistoryAvatar(props: {
  name: string
  photoUrl: string | null
  isAgent: boolean
}) {
  if (props.isAgent) {
    return (
      <div
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[9px] font-semibold text-violet-700"
        aria-hidden
      >
        AI
      </div>
    )
  }
  const initials = props.name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?"
  if (props.photoUrl) {
    return (
      <img
        src={props.photoUrl}
        alt=""
        className="h-5 w-5 shrink-0 rounded-full object-cover"
      />
    )
  }
  return (
    <div
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] text-gray-600"
      aria-hidden
    >
      {initials}
    </div>
  )
}

const HISTORY_PREVIEW_LIMIT = 5

export function ArtifactVersionHistoryList({
  isLoading,
  versions,
  onView,
  onRestore,
  isRestoring = false,
  hideHeading = false,
  previewLimit = HISTORY_PREVIEW_LIMIT,
}: {
  isLoading: boolean
  versions: Array<{
    version_number: number
    is_current?: boolean
    change_summary?: string | null
    change_source?: string | null
    changed_by?: number | null
    ai_run_id?: string | null
    created_at?: string | null
    content_preview?: string | null
    previous_content_preview?: string | null
    insert_count?: number
    delete_count?: number
  }>
  onView?: (versionNumber: number) => void
  onRestore: (versionNumber: number) => void
  isRestoring?: boolean
  hideHeading?: boolean
  /** Most recent entries shown before "Show more". `0` shows the full list. */
  previewLimit?: number
}) {
  const { data: users = [] } = useViewUsersCanSee(true)
  const userMap = React.useMemo(() => {
    const map = new Map<number, { name: string; photoUrl: string | null }>()
    for (const user of users) {
      map.set(user.id, {
        name: user.full_name ?? "",
        photoUrl: getImageUrl(user.photo),
      })
    }
    return map
  }, [users])
  const [openVersion, setOpenVersion] = useState<number | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const orderedVersions = React.useMemo(() => {
    return [...versions].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
      if (aTime !== bTime) return bTime - aTime
      return (b.version_number ?? 0) - (a.version_number ?? 0)
    })
  }, [versions])
  const visibleLimit = previewLimit > 0 && !isExpanded ? previewLimit : orderedVersions.length
  const visibleVersions = orderedVersions.slice(0, visibleLimit)
  const canShowMore = previewLimit > 0 && orderedVersions.length > previewLimit

  return (
    <div>
      {hideHeading ? null : (
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
          History
        </h3>
      )}
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
        <ul className={!hideHeading && isExpanded ? "max-h-80 overflow-y-auto" : undefined}>
          {visibleVersions.map((row) => {
            const actor = row.changed_by != null ? userMap.get(row.changed_by) : null
            const line = formatArtifactHistoryDescription({
              actorName: actor?.name,
              changeSource: row.change_source,
              aiRunId: row.ai_run_id,
            })
            const summary = artifactHistoryUserFacingSummary(row.change_summary)
            const added = Number(row.insert_count ?? 0)
            const removed = Number(row.delete_count ?? 0)
            const canDiff = Boolean(row.previous_content_preview && row.content_preview)
            const isOpen = openVersion === row.version_number
            return (
              <li key={row.version_number} className="border-b border-gray-100 last:border-b-0">
                <div className="flex items-start gap-2.5 py-2">
                  <HistoryAvatar
                    name={line.name}
                    photoUrl={actor?.photoUrl ?? null}
                    isAgent={line.actorType === "agent"}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5 text-sm leading-5 text-gray-700">
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-gray-900">{line.name}</span>
                        {line.remainder}
                      </span>
                      {row.created_at ? (
                        <>
                          <span className="shrink-0 text-gray-300" aria-hidden>·</span>
                          <ActivityRowTimestamp value={row.created_at} />
                        </>
                      ) : null}
                    </div>
                    {summary ? (
                      <p className="mt-0.5 text-xs text-gray-500">{summary}</p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                      {added > 0 ? <span className="font-medium text-emerald-600">+{added}</span> : null}
                      {removed > 0 ? <span className="font-medium text-red-600">−{removed}</span> : null}
                      {row.is_current ? <span className="text-gray-500">current</span> : null}
                      {canDiff ? (
                        <button
                          type="button"
                          className="text-gray-500 underline decoration-gray-300 underline-offset-2 hover:text-gray-800"
                          onClick={() => setOpenVersion(isOpen ? null : row.version_number)}
                        >
                          {isOpen ? "Hide changes" : "Show changes"}
                        </button>
                      ) : null}
                      {onView ? (
                        <button
                          type="button"
                          className="text-gray-500 underline decoration-gray-300 underline-offset-2 hover:text-gray-800"
                          onClick={() => onView(row.version_number)}
                        >
                          View
                        </button>
                      ) : null}
                      {!row.is_current ? (
                        <button
                          type="button"
                          disabled={isRestoring}
                          className="text-gray-500 underline decoration-gray-300 underline-offset-2 hover:text-gray-800 disabled:opacity-50"
                          onClick={() => onRestore(row.version_number)}
                        >
                          {isRestoring ? "Restoring…" : "Restore"}
                        </button>
                      ) : null}
                    </div>
                    {isOpen && canDiff ? (
                      <div className="mt-2 overflow-hidden rounded-md border border-gray-200">
                        <ArtifactChangeDiffPanel
                          beforeText={row.previous_content_preview}
                          afterText={row.content_preview}
                          label="Changes"
                          defaultOpen
                          className="border-b-0 bg-transparent"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            )
          })}
          {orderedVersions.length === 0 ? (
            <li className="px-1 py-3 text-xs text-muted-foreground">No history yet.</li>
          ) : null}
        </ul>
        {canShowMore ? (
          <button
            type="button"
            className="mt-1 text-xs text-gray-500 hover:text-gray-700"
            onClick={() => setIsExpanded((value) => !value)}
          >
            {isExpanded ? "Show less" : "Show more"}
          </button>
        ) : null}
        </>
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
      const result = await restoreArtifactVersionForEdit({ artifactId, versionNumber })
      applyArtifactCachePatch(queryClient, result.snapshot)
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
      <PopoverContent align={align} className="w-[min(92vw,28rem)] p-3">
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
