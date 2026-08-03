"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { CheckCircle2, ChevronLeft, Clock3, Plus, Reply, RotateCcw, Trash2 } from "lucide-react"
import { UserAvatar } from "../../app/components/UserAvatar"
import { ThreadParticipantsInline } from "../../app/components/comments-section/thread-participants-inline"
import { ThreadedRealtimeChat } from "../../app/components/threaded-realtime-chat"
import { ActivityRowTimestamp, getActivityRelativeTimeLabel } from "../../app/components/activity-row-timestamp"
import { Button } from "../../app/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "../../app/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "../../app/components/ui/popover"
import { getImageUrl } from "../../app/lib/public-media"
import { useCurrentUserStore } from "../../app/store/current-user"
import {
  loadArtifactNotifyPool,
  useArtifactCommentThreads,
  useCreateArtifactCommentThread,
  useDeleteArtifactCommentThread,
  useReplyToArtifactCommentThread,
  useResolveArtifactCommentThread,
  type ArtifactCommentThread,
} from "../../app/hooks/use-artifact-comment-threads"
import type { TaskArtifact } from "../../app/lib/artifacts/artifact-types"
import { cn } from "../../app/lib/utils"

type ArtifactCommentsDockProps = {
  artifact: TaskArtifact
  className?: string
}

type StatusFilter = "all" | "open" | "resolved"

function stripPreview(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Pinned artifact comments dock — mirrors task-details comments chrome
 * (thread list, filters, resolve/delete, We'll notify + participants).
 */
export function ArtifactCommentsDock({ artifact, className }: ArtifactCommentsDockProps) {
  const currentUserId = useCurrentUserStore((s) => s.publicUserId)
  const currentUserName = useCurrentUserStore((s) => s.fullName)
  const currentUserPhoto = useCurrentUserStore((s) => s.photo)
  const createComment = useCreateArtifactCommentThread()
  const replyComment = useReplyToArtifactCommentThread()
  const deleteThread = useDeleteArtifactCommentThread()
  const resolveThread = useResolveArtifactCommentThread()

  const [draft, setDraft] = useState("")
  const [composerExpanded, setComposerExpanded] = useState(false)
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null)
  const [isThreadView, setIsThreadView] = useState(false)
  const [isAddingThread, setIsAddingThread] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [pendingParticipants, setPendingParticipants] = useState<any[]>([])
  const [removedParticipants, setRemovedParticipants] = useState<any[]>([])
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isThreadSelectorOpen, setIsThreadSelectorOpen] = useState(false)
  const [resolvingIds, setResolvingIds] = useState<Set<number>>(new Set())

  const commentsQuery = useArtifactCommentThreads([artifact.id], { enabled: !!artifact.id })
  const threads = commentsQuery.data ?? []

  const notifyPoolQuery = useQuery({
    queryKey: [
      "artifact-notify-pool",
      artifact.id,
      artifact.task_id ?? null,
      artifact.project_id ?? null,
      artifact.ai_thread_id ?? null,
    ],
    queryFn: () =>
      loadArtifactNotifyPool({
        task_id: artifact.task_id,
        project_id: artifact.project_id,
        ai_thread_id: artifact.ai_thread_id,
      }),
    staleTime: 60_000,
  })

  const allNotifyUsers = notifyPoolQuery.data ?? []
  const projectIdForParticipants = artifact.project_id ?? 0

  useEffect(() => {
    if (selectedThreadId == null) return
    if (!threads.some((thread) => thread.threadId === selectedThreadId)) {
      setSelectedThreadId(null)
      setIsThreadView(false)
    }
  }, [selectedThreadId, threads])

  useEffect(() => {
    if (!isAddingThread) return
    if (pendingParticipants.length > 0) return
    if (allNotifyUsers.length === 0) return
    setPendingParticipants(allNotifyUsers)
  }, [isAddingThread, allNotifyUsers, pendingParticipants.length])

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.threadId === selectedThreadId) ?? null,
    [selectedThreadId, threads],
  )

  const filteredThreads = useMemo(() => {
    return threads.filter((thread) => {
      if (statusFilter === "open") return !thread.resolvedAt
      if (statusFilter === "resolved") return !!thread.resolvedAt
      return true
    })
  }, [threads, statusFilter])

  const flatMentions = useMemo(() => {
    const rows = filteredThreads.flatMap((thread) =>
      thread.mentions.map((mention) => ({ mention, thread })),
    )
    rows.sort((a, b) => {
      const aTs = new Date(a.mention.created_at ?? 0).getTime()
      const bTs = new Date(b.mention.created_at ?? 0).getTime()
      return bTs - aTs
    })
    return rows
  }, [filteredThreads])

  const photoUrl =
    getImageUrl(currentUserPhoto || null)
    || (currentUserPhoto?.startsWith("http") ? currentUserPhoto : null)

  const isPosting = createComment.isPending || replyComment.isPending
  const canPost = Boolean(draft.trim() && currentUserId && !isPosting)
  const showComposer =
    composerExpanded || draft.trim() || isAddingThread || (selectedThreadId != null && isThreadView)

  const handleAddThread = () => {
    setIsAddingThread(true)
    setIsThreadView(false)
    setSelectedThreadId(null)
    setPendingParticipants(allNotifyUsers)
    setRemovedParticipants([])
    setComposerExpanded(true)
  }

  const handleSelectThread = (threadId: number | null, openView = false) => {
    setIsAddingThread(false)
    setSelectedThreadId(threadId)
    setIsThreadView(openView && threadId != null)
    setIsThreadSelectorOpen(false)
  }

  const handleToggleResolved = async (thread: ArtifactCommentThread) => {
    if (!currentUserId) return
    const threadId = thread.threadId
    const nextResolvedAt = thread.resolvedAt ? null : new Date().toISOString()
    setResolvingIds((prev) => new Set(prev).add(threadId))
    try {
      await resolveThread.mutateAsync({
        threadId,
        resolvedAt: nextResolvedAt,
        resolvedBy: nextResolvedAt ? currentUserId : null,
      })
    } finally {
      setResolvingIds((prev) => {
        const next = new Set(prev)
        next.delete(threadId)
        return next
      })
    }
  }

  const handleDelete = async () => {
    if (selectedThreadId == null) return
    await deleteThread.mutateAsync(selectedThreadId)
    setSelectedThreadId(null)
    setIsThreadView(false)
    setShowDeleteDialog(false)
  }

  const handlePost = async () => {
    if (!currentUserId || !draft.trim()) return
    const comment = draft.trim()
    const watcherIds = [
      currentUserId,
      ...pendingParticipants
        .map((row) => Number(row?.value ?? row?.id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ]

    if (selectedThreadId != null && !isAddingThread) {
      await replyComment.mutateAsync({
        threadId: selectedThreadId,
        comment,
        createdBy: currentUserId,
      })
    } else {
      const threadId = await createComment.mutateAsync({
        taskId: artifact.task_id,
        projectId: artifact.project_id,
        artifactId: artifact.id,
        artifactVersionNumber: artifact.current_version,
        comment,
        anchorType: "document",
        watcherIds,
        createdBy: currentUserId,
      })
      setSelectedThreadId(threadId)
      setIsAddingThread(false)
      setIsThreadView(true)
    }
    setDraft("")
    setPendingParticipants([])
    setRemovedParticipants([])
    setComposerExpanded(false)
  }

  const selectedPreview =
    stripPreview(selectedThread?.previewComment?.comment)
    || (selectedThreadId != null ? `Thread #${selectedThreadId}` : null)

  return (
    <div className={cn("flex shrink-0 flex-col border-t border-gray-100 bg-white", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-gray-50 px-4 py-1.5">
        <div className="flex items-center gap-1">
          {(["all", "open", "resolved"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 px-2 text-xs capitalize",
                statusFilter === value && "bg-gray-100 text-gray-900",
              )}
              onClick={() => setStatusFilter(value)}
            >
              {value}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Popover open={isThreadSelectorOpen} onOpenChange={setIsThreadSelectorOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 w-7 p-0 text-gray-500",
                  selectedThreadId != null && !isAddingThread && "bg-gray-100 text-gray-900",
                )}
                title="Filter by thread"
                aria-label="Filter by thread"
              >
                <Clock3 className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" side="top" className="w-[min(92vw,360px)] p-1">
              <div className="max-h-72 overflow-y-auto">
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-gray-50",
                    selectedThreadId == null && !isAddingThread && "bg-gray-50 font-medium",
                  )}
                  onClick={() => handleSelectThread(null)}
                >
                  <span className="min-w-0 flex-1 truncate text-gray-800">All threads</span>
                </button>
                {filteredThreads.map((thread) => {
                  const isActive = selectedThreadId === thread.threadId
                  return (
                    <button
                      key={thread.threadId}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-gray-50",
                        isActive && "bg-gray-50",
                      )}
                      onClick={() => handleSelectThread(thread.threadId, true)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className={cn("truncate text-sm text-gray-800", isActive && "font-medium")}>
                          {stripPreview(thread.previewComment?.comment) || `Thread #${thread.threadId}`}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {getActivityRelativeTimeLabel(thread.latestComment?.created_at ?? thread.createdAt)}
                          {thread.resolvedAt ? " · Resolved" : ""}
                        </div>
                      </div>
                    </button>
                  )
                })}
                {filteredThreads.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground">No threads yet.</div>
                ) : null}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleAddThread}
            title="Start thread"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Thread
          </Button>
        </div>
      </div>

      <div className="max-h-56 min-h-0 overflow-y-auto px-4 py-2">
        {isThreadView && selectedThreadId != null ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsThreadView(false)
                  setSelectedThreadId(null)
                }}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
              <div className="flex items-center gap-1">
                {selectedThread ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={resolvingIds.has(selectedThread.threadId)}
                    onClick={() => void handleToggleResolved(selectedThread)}
                  >
                    {selectedThread.resolvedAt ? (
                      <>
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        Reopen
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                        Resolve
                      </>
                    )}
                  </Button>
                ) : null}
              </div>
            </div>
            {currentUserId != null ? (
              <ThreadedRealtimeChat
                key={String(selectedThreadId)}
                threadId={selectedThreadId}
                currentUserId={currentUserId}
                currentUserName={currentUserName || undefined}
                currentUserAvatar={currentUserPhoto || undefined}
                currentUserEmail={undefined}
                currentPublicUserId={currentUserId}
                hideInput
                initialMessages={selectedThread?.mentions ?? []}
              />
            ) : null}
          </div>
        ) : flatMentions.length > 0 ? (
          <ul className="flex flex-col">
            {flatMentions.map(({ mention, thread }) => {
              const author = mention.users
              const displayName = String(author?.full_name || author?.email || "Unknown user")
              const authorPhoto = getImageUrl(author?.photo ?? null)
              const plainPreview = stripPreview(mention.comment)
              return (
                <li key={mention.id} className="group flex items-start gap-2.5 py-2">
                  <UserAvatar
                    name={displayName}
                    photoUrl={authorPhoto}
                    size="xs"
                    className="mt-0.5 !h-5 !w-5 !min-h-5 !min-w-5 text-[9px]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSelectThread(thread.threadId, true)}
                          className="truncate text-left text-sm font-medium leading-5 text-gray-900"
                        >
                          {displayName}
                        </button>
                        <span className="shrink-0 text-gray-300" aria-hidden>
                          ·
                        </span>
                        <ActivityRowTimestamp value={mention.created_at} />
                        {thread.resolvedAt ? (
                          <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                            Resolved
                          </span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 md:opacity-0 md:group-hover:opacity-100"
                        aria-label="Reply in thread"
                        title="Reply in thread"
                        onClick={() => handleSelectThread(thread.threadId, true)}
                      >
                        <Reply className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 md:opacity-0 md:group-hover:opacity-100"
                        aria-label={thread.resolvedAt ? "Reopen thread" : "Resolve thread"}
                        title={thread.resolvedAt ? "Reopen thread" : "Resolve thread"}
                        disabled={resolvingIds.has(thread.threadId)}
                        onClick={() => void handleToggleResolved(thread)}
                      >
                        {thread.resolvedAt ? (
                          <RotateCcw className="h-3.5 w-3.5" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectThread(thread.threadId, true)}
                      className="mt-1 w-full text-left text-sm leading-5 text-gray-700"
                      style={{ wordBreak: "break-word" }}
                    >
                      {plainPreview || "Empty comment"}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="py-4 text-center text-sm text-muted-foreground">No comments yet.</div>
        )}
      </div>

      <div className="px-4 pt-1">
        <div className="flex w-full items-start gap-2">
          <UserAvatar
            name={currentUserName || "You"}
            photoUrl={photoUrl}
            size="sm"
            className={showComposer ? "mt-2" : "mt-0.5"}
          />
          <div className="min-w-0 flex-1">
            {showComposer ? (
              <div className="space-y-2">
                {selectedThreadId != null && isThreadView ? (
                  <p className="text-[11px] text-muted-foreground">
                    Replying in thread #{selectedThreadId}
                    {" · "}
                    <button type="button" className="underline" onClick={handleAddThread}>
                      Start new thread
                    </button>
                  </p>
                ) : null}
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={3}
                  placeholder="Add a comment…"
                  className="w-full resize-y rounded-md border border-gray-200 px-2.5 py-2 text-sm outline-none focus:border-gray-400"
                  onBlur={() => {
                    if (!draft.trim() && !isAddingThread && !isThreadView) setComposerExpanded(false)
                  }}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!canPost}
                    onClick={() => void handlePost()}
                    className="rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {isPosting ? "Posting…" : "Comment"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="flex h-9 w-full items-center rounded-md border border-gray-200 bg-white px-3 text-left text-sm text-muted-foreground hover:border-gray-300 hover:bg-gray-50"
                onClick={() => {
                  setComposerExpanded(true)
                  if (threads.length === 0) handleAddThread()
                }}
              >
                Add a comment...
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 px-4 py-1.5">
        <span className="shrink-0 text-xs text-gray-500">We'll notify</span>
        <div className="min-w-0 flex-1 overflow-hidden">
          {selectedThread && !isAddingThread ? (
            <ThreadParticipantsInline
              threadId={selectedThread.threadId}
              projectId={projectIdForParticipants}
              allowRemove
              participants={selectedThread.watchers}
              allProjectUsers={allNotifyUsers}
              currentUserId={currentUserId}
              onParticipantsChanged={() => {
                void commentsQuery.refetch()
              }}
            />
          ) : (
            <ThreadParticipantsInline
              pendingMode
              pendingParticipants={pendingParticipants}
              setPendingParticipants={setPendingParticipants}
              removedParticipants={removedParticipants}
              setRemovedParticipants={setRemovedParticipants}
              participants={allNotifyUsers}
              allProjectUsers={allNotifyUsers}
              currentUserId={currentUserId}
              projectId={projectIdForParticipants}
            />
          )}
        </div>
        {selectedThreadId != null && !isAddingThread ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-1 h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
              aria-label="Delete thread"
              title="Delete thread"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <DialogContent>
                <DialogTitle>Delete Thread</DialogTitle>
                <div className="py-2">
                  Are you sure you want to delete{" "}
                  <span className="font-medium text-gray-900">“{selectedPreview}”</span>? This cannot
                  be undone.
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteDialog(false)}
                    disabled={deleteThread.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => void handleDelete()}
                    disabled={deleteThread.isPending}
                  >
                    {deleteThread.isPending ? "Deleting..." : "Delete"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        ) : null}
      </div>
    </div>
  )
}
