"use client"

import React, { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { ArtifactCard } from "./ArtifactCard"
import {
  getArtifact,
  listAiThreadArtifacts,
  listTaskArtifacts,
  saveWorkspaceArtifact,
} from "../../app/lib/services/artifacts"
import type { TaskArtifact } from "../../app/lib/artifacts/artifact-types"
import { isArtifactRevisionConflictError } from "../../app/lib/artifacts/artifact-types"
import { useAiBuildArtifactPreviewStore } from "../../app/store/ai-build-artifact-preview-store"
import {
  groupThreadsByArtifactId,
  useArtifactCommentThreads,
  useCreateArtifactCommentThread,
} from "../../app/hooks/use-artifact-comment-threads"
import { reattachArtifactCommentAnchor } from "../../app/lib/artifacts/artifact-anchor-reattach"
import { useCurrentUserStore } from "../../app/store/current-user"

export type ArtifactWorkspaceProps = {
  /** Task workspace when taskId is set. */
  taskId?: number | null
  /** AI chat workspace when taskId is null and aiThreadId is set. */
  aiThreadId?: string | null
  defaultChannelId?: number | null
  defaultLanguageId?: number | null
  projectId?: number | null
  className?: string
}

/**
 * Renders artifacts for a task or an AI chat thread.
 * Live build previews merge in place by build_id + unit_id + artifact_id.
 */
export function ArtifactWorkspace({
  taskId = null,
  aiThreadId = null,
  defaultChannelId = null,
  defaultLanguageId = null,
  projectId = null,
  className,
}: ArtifactWorkspaceProps) {
  const queryClient = useQueryClient()
  const currentUserId = useCurrentUserStore((s) => s.publicUserId)
  const createComment = useCreateArtifactCommentThread()
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const [commentDraftByArtifact, setCommentDraftByArtifact] = useState<Record<string, string>>({})

  const taskQuery = useQuery({
    queryKey: ["task-artifacts", taskId],
    queryFn: () => listTaskArtifacts({ taskId: taskId!, includeContent: true }),
    enabled: taskId != null && taskId > 0,
    staleTime: 30_000,
  })

  const threadQuery = useQuery({
    queryKey: ["ai-thread-artifacts", aiThreadId],
    queryFn: () => listAiThreadArtifacts({ threadId: aiThreadId!, includeContent: true }),
    enabled: (taskId == null || taskId <= 0) && !!aiThreadId,
    staleTime: 30_000,
  })

  const artifacts = useMemo(() => {
    if (taskId != null && taskId > 0) return taskQuery.data?.artifacts ?? []
    return threadQuery.data?.artifacts ?? []
  }, [taskId, taskQuery.data?.artifacts, threadQuery.data?.artifacts])

  const artifactIds = useMemo(() => artifacts.map((row) => row.id), [artifacts])
  const commentsQuery = useArtifactCommentThreads(artifactIds, { enabled: artifactIds.length > 0 })
  const threadsByArtifact = useMemo(
    () => groupThreadsByArtifactId(commentsQuery.data ?? []),
    [commentsQuery.data],
  )

  const livePreviews = useAiBuildArtifactPreviewStore((s) => s.previews)
  const liveByArtifactId = useMemo(() => {
    const map = new Map<string, (typeof livePreviews)[string]>()
    for (const entry of Object.values(livePreviews)) {
      const prev = map.get(entry.artifactId)
      if (!prev || entry.sequence > prev.sequence) map.set(entry.artifactId, entry)
    }
    return map
  }, [livePreviews])

  // Also surface live-only artifacts that are not yet in the durable list.
  const liveOnlyArtifacts = useMemo(() => {
    const known = new Set(artifacts.map((row) => row.id))
    const extras: TaskArtifact[] = []
    for (const entry of liveByArtifactId.values()) {
      if (known.has(entry.artifactId)) continue
      if (taskId != null && entry.taskId != null && entry.taskId !== taskId) continue
      if (
        (taskId == null || taskId <= 0)
        && aiThreadId
        && entry.aiThreadId
        && entry.aiThreadId !== aiThreadId
        && entry.threadId !== aiThreadId
      ) {
        continue
      }
      extras.push({
        id: entry.artifactId,
        task_id: entry.taskId,
        ai_thread_id: entry.aiThreadId ?? aiThreadId,
        artifact_type: "document",
        artifact_role: null,
        title: entry.title,
        status: entry.phase === "failed" ? "draft" : "draft",
        channel_id: entry.channelId,
        language_id: entry.languageId,
        content_text: entry.contentText,
        content_json: entry.contentJson,
        asset_data: entry.assetData,
        source_artifact_id: null,
        source_version_number: null,
        derivation_type: null,
        current_version: entry.currentVersion ?? 0,
        metadata: null,
      })
    }
    return extras
  }, [aiThreadId, artifacts, liveByArtifactId, taskId])

  const allArtifacts = useMemo(
    () => [...liveOnlyArtifacts, ...artifacts],
    [artifacts, liveOnlyArtifacts],
  )

  const isLoading = taskId != null ? taskQuery.isLoading : threadQuery.isLoading
  const error = taskId != null ? taskQuery.error : threadQuery.error

  const handleSaveWithVersionGuard = async (artifact: TaskArtifact) => {
    setConflictMessage(null)
    const result = await saveWorkspaceArtifact({
      artifactId: artifact.id,
      expectedVersion: artifact.current_version,
      snapshot: {
        title: artifact.title,
        status: artifact.status,
        content_text: artifact.content_text,
        content_json: artifact.content_json,
        asset_data: artifact.asset_data,
      },
      changeSource: "manual",
      changedBy: currentUserId,
      aiThreadId: artifact.ai_thread_id,
    })
    if (isArtifactRevisionConflictError(result) || ("code" in result && result.code === "artifact_revision_conflict")) {
      const conflict = result as { expected_version: number | null; current_version: number | null }
      setConflictMessage(
        `Revision conflict — newer version kept (expected ${conflict.expected_version ?? "?"}, current ${conflict.current_version ?? "?"}). Reloading…`,
      )
      const latest = await getArtifact({ artifactId: artifact.id })
      await queryClient.invalidateQueries({ queryKey: ["task-artifacts"] })
      await queryClient.invalidateQueries({ queryKey: ["ai-thread-artifacts"] })
      void latest
      return
    }
    await queryClient.invalidateQueries({ queryKey: ["task-artifacts"] })
    await queryClient.invalidateQueries({ queryKey: ["ai-thread-artifacts"] })
  }

  if (!taskId && !aiThreadId) return null

  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-medium text-gray-900">
          {taskId != null ? "Artifacts" : "Chat artifacts"}
        </h3>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : null}
      </div>

      {conflictMessage ? (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {conflictMessage}
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-red-600">
          {error instanceof Error ? error.message : "Failed to load artifacts"}
        </p>
      ) : null}

      {allArtifacts.length === 0 && !isLoading ? (
        <p className="text-sm text-gray-500">No artifacts yet.</p>
      ) : (
        <div className="space-y-3">
          {allArtifacts.map((artifact) => {
            const threads = threadsByArtifact.get(artifact.id) ?? []
            const draft = commentDraftByArtifact[artifact.id] ?? ""
            return (
              <div key={artifact.id} className="space-y-2">
                <ArtifactCard
                  artifact={artifact}
                  livePreview={liveByArtifactId.get(artifact.id) ?? null}
                  allowAttachToTask={taskId == null}
                  defaultTaskId={taskId}
                  defaultChannelId={defaultChannelId}
                  defaultLanguageId={defaultLanguageId}
                  onAttached={async () => {
                    await queryClient.invalidateQueries({ queryKey: ["task-artifacts"] })
                    await queryClient.invalidateQueries({ queryKey: ["ai-thread-artifacts"] })
                  }}
                  onComment={() => {
                    setCommentDraftByArtifact((prev) => ({
                      ...prev,
                      [artifact.id]: prev[artifact.id] ?? "",
                    }))
                  }}
                />

                {commentDraftByArtifact[artifact.id] != null ? (
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-2">
                    <textarea
                      value={draft}
                      onChange={(event) =>
                        setCommentDraftByArtifact((prev) => ({
                          ...prev,
                          [artifact.id]: event.target.value,
                        }))
                      }
                      rows={2}
                      placeholder="Add a comment…"
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
                    />
                    <div className="mt-1.5 flex gap-2">
                      <button
                        type="button"
                        disabled={!draft.trim() || !currentUserId || createComment.isPending}
                        onClick={() => {
                          if (!currentUserId || !draft.trim()) return
                          void createComment.mutateAsync({
                            taskId: artifact.task_id ?? taskId,
                            projectId,
                            artifactId: artifact.id,
                            artifactVersionNumber: artifact.current_version,
                            comment: draft.trim(),
                            anchorType: "document",
                            watcherIds: [currentUserId],
                            createdBy: currentUserId,
                          }).then(() => {
                            setCommentDraftByArtifact((prev) => {
                              const next = { ...prev }
                              delete next[artifact.id]
                              return next
                            })
                          })
                        }}
                        className="rounded bg-gray-900 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                      >
                        Post
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCommentDraftByArtifact((prev) => {
                            const next = { ...prev }
                            delete next[artifact.id]
                            return next
                          })
                        }
                        className="rounded px-2.5 py-1 text-[11px] text-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {threads.length > 0 ? (
                  <div className="space-y-1.5 pl-1">
                    {threads.map((thread) => {
                      const reattach = reattachArtifactCommentAnchor({
                        artifact,
                        anchor: thread.target,
                      })
                      return (
                        <div
                          key={thread.threadId}
                          className="rounded-md border border-gray-100 bg-white px-2.5 py-2 text-xs text-gray-700"
                        >
                          <p className="whitespace-pre-wrap">
                            {thread.previewComment?.comment || "Comment"}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
                            <span>v{thread.target.artifactVersionNumber}</span>
                            {reattach.driftLabel ? (
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">
                                {reattach.driftLabel}
                              </span>
                            ) : null}
                            {!reattach.attached ? (
                              <span className="rounded bg-gray-100 px-1.5 py-0.5">
                                Anchor not exact
                              </span>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}

                {/* Keep version-safe save available for future editors; no-op UI for now. */}
                <button
                  type="button"
                  className="hidden"
                  onClick={() => void handleSaveWithVersionGuard(artifact)}
                  aria-hidden
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
