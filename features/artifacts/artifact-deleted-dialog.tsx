"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, RotateCcw, Trash2 } from "lucide-react"
import { ConfirmDialog } from "../../app/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogTitle } from "../../app/components/ui/dialog"
import { formatCompactDateDisplay } from "../../app/lib/utils"
import {
  listDeletedArtifacts,
  purgeArtifact,
  restoreArtifact,
} from "../../app/lib/services/artifacts"
import { useArtifactDeletedStore } from "../../app/store/artifact-deleted-store"
import { applyArtifactCachePatch, forgetDeletedArtifact } from "./artifact-query-cache"

export function ArtifactDeletedDialog() {
  const queryClient = useQueryClient()
  const isOpen = useArtifactDeletedStore((state) => state.isOpen)
  const scope = useArtifactDeletedStore((state) => state.scope)
  const close = useArtifactDeletedStore((state) => state.close)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [purgeId, setPurgeId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ["deleted-artifacts", scope.taskId ?? null, scope.projectId ?? null, scope.threadId ?? null],
    enabled: isOpen,
    queryFn: () =>
      listDeletedArtifacts({
        taskId: scope.taskId ?? null,
        projectId: scope.projectId ?? null,
        threadId: scope.threadId ?? null,
        limit: 100,
      }),
  })

  const invalidateLists = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["deleted-artifacts"] }),
      queryClient.invalidateQueries({ queryKey: ["global-search"] }),
      queryClient.invalidateQueries({ queryKey: ["artifact-directory-meta"] }),
      queryClient.invalidateQueries({ queryKey: ["task-artifacts"] }),
      queryClient.invalidateQueries({ queryKey: ["project-artifacts"] }),
      queryClient.invalidateQueries({ queryKey: ["ai-thread-artifacts"] }),
      queryClient.invalidateQueries({ queryKey: ["artifact"] }),
    ])
  }

  const handleRestore = async (artifactId: string) => {
    if (busyId) return
    setBusyId(artifactId)
    setErrorMessage(null)
    try {
      const result = await restoreArtifact({ artifactId })
      if (result.artifact) applyArtifactCachePatch(queryClient, result.artifact)
      await invalidateLists()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not restore this output.")
    } finally {
      setBusyId(null)
    }
  }

  const handlePurge = async () => {
    if (!purgeId || busyId) return
    setBusyId(purgeId)
    setErrorMessage(null)
    try {
      await purgeArtifact({ artifactId: purgeId })
      forgetDeletedArtifact(queryClient, purgeId)
      setPurgeId(null)
      await invalidateLists()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not delete this output permanently.")
    } finally {
      setBusyId(null)
    }
  }

  useEffect(() => {
    if (typeof document === "undefined") return
    const unlock = () => {
      if (document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = ""
      }
    }
    unlock()
    const timers = [0, 50, 150, 300].map((ms) => window.setTimeout(unlock, ms))
    return () => {
      timers.forEach((id) => window.clearTimeout(id))
      unlock()
    }
  }, [isOpen])

  const items = query.data ?? []
  const purgeTitle = items.find((item) => item.id === purgeId)?.title ?? "this output"

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-lg">
          <DialogTitle>Deleted</DialogTitle>
          <div className="min-h-[12rem] py-1">
            {query.isLoading ? (
              <div className="flex items-center justify-center py-10 text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : query.isError ? (
              <p className="py-8 text-center text-sm text-red-600">
                {query.error instanceof Error ? query.error.message : "Could not load deleted outputs."}
              </p>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">No deleted outputs.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {items.map((item) => {
                  const deletedLabel = formatCompactDateDisplay(item.archivedAt ?? item.updatedAt) || "—"
                  const isBusy = busyId === item.id
                  return (
                    <li key={item.id} className="flex min-h-12 items-center gap-2 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-gray-900">{item.title}</p>
                        <p className="truncate text-xs text-gray-500">
                          {item.projectName ? `${item.projectName} · ` : ""}
                          Deleted {deletedLabel}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                        disabled={Boolean(busyId)}
                        onClick={() => void handleRestore(item.id)}
                      >
                        {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        Restore
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                        disabled={Boolean(busyId)}
                        onClick={() => setPurgeId(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {errorMessage ? <p className="mt-3 text-sm text-red-600">{errorMessage}</p> : null}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(purgeId)}
        title="Delete permanently?"
        description={`“${purgeTitle}” will be removed for good. This cannot be undone.`}
        confirmLabel="Delete permanently"
        busy={Boolean(purgeId && busyId === purgeId)}
        busyLabel="Deleting…"
        onOpenChange={(open) => {
          if (!open && !busyId) setPurgeId(null)
        }}
        onConfirm={() => {
          void handlePurge()
        }}
      />
    </>
  )
}
