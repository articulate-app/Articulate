"use client"

import React from "react"
import { formatDistanceToNow } from "date-fns"
import { ThreadedRealtimeChat } from "../threaded-realtime-chat"
import { StickyAddCommentInput } from "./sticky-add-comment-input"
import { ThreadParticipantsInline } from "./thread-participants-inline"
import { Button } from "../ui/button"
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "../ui/dialog"
import { ChevronLeft, Clock3, Plus, Reply } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { UserAvatar } from "../UserAvatar"
import { getImageUrl } from "../../lib/public-media"
import { cn } from "@/lib/utils"
import {
  type OverviewFeedSort,
  sortByUserLabel,
} from "../tasks/overview-feed-sort"

export interface TaskCommentsPanelProps {
  pendingOutputAnchor?: {
    taskComponentOutputId: string
    attachmentId: string | null
    anchorType: "image_point"
    anchorX: number
    anchorY: number
    anchorData?: unknown
  } | null
  onConsumePendingOutputAnchor?: () => void
  composerFocusToken?: number
  taskIdNum: number
  task: any
  isSuggestionMode: boolean
  currentUserId: number | null
  selectedThreadId: number | null
  setSelectedThreadId: (id: number | null) => void
  isThreadView?: boolean
  openThreadView?: (threadId: number) => void
  showAllThreadsView?: () => void
  isAddingThread: boolean
  setIsAddingThread: (v: boolean) => void
  threadsList: any[]
  allMentions: any[]
  commentsStatusFilter?: "all" | "open" | "resolved"
  setCommentsStatusFilter?: (value: "all" | "open" | "resolved") => void
  latestMentions: Record<number, any>
  participants: any[]
  project_watchers: any[]
  allProjectUsers: any[]
  refetchSelectedThread: () => void
  handleViewThreadHistory: (options?: { force?: boolean }) => void
  isThreadListLoading: boolean
  pendingParticipants: any[]
  setPendingParticipants: (p: any[]) => void
  removedParticipants: any[]
  setRemovedParticipants: (p: any[]) => void
  replyTo: { id: number; author?: string; preview: string } | null
  setReplyTo: (v: { id: number; author?: string; preview: string } | null) => void
  onClearReply?: () => void
  handleDeleteThread: (threadId: number) => Promise<void>
  handleAddThread: () => void
  showDeleteThreadDialog: boolean
  setShowDeleteThreadDialog: (v: boolean) => void
  isDeleting: boolean
  currentUserName: string
  currentUserAvatar: string
  currentUserEmail: string
  currentPublicUserId: number | null
  /** When true, + button only focuses editor (for use inside modal/drawer). When false, can use scrollToRef. */
  focusOnly?: boolean
  scrollToRef?: React.RefObject<HTMLDivElement | null>
  onCommentAdded?: () => void
  latestMentionsByThread?: Record<number, any>
  contextLabelByThread?: Record<number, string>
  onThreadNavigate?: (thread: any) => void
  onToggleThreadResolved?: (thread: any) => void
  isThreadResolving?: (threadId: number) => boolean
  /** Overview embed: collapse thread list / history until expanded inline */
  embedCollapsed?: boolean
  embedThreadLimit?: number
  onEmbedExpand?: () => void
  /** Overview merged feed: hide All/Open/Resolved filters */
  hideStatusFilter?: boolean
  /** Overview merged feed: toolbar rendered by parent */
  hideThreadToolbar?: boolean
  /** Client-side sort (no API changes) */
  clientSort?: OverviewFeedSort
}

/** Comments header actions: + button and thread switcher. */
export function TaskCommentsHeaderRow({
  taskIdNum: _taskIdNum,
  threadsList: _threadsList,
  selectedThreadId: _selectedThreadId,
  setSelectedThreadId: _setSelectedThreadId,
  setIsAddingThread: _setIsAddingThread,
  handleAddThread: _handleAddThread,
  openThreadView: _openThreadView,
  isThreadListLoading: _isThreadListLoading,
  handleViewThreadHistory: _handleViewThreadHistory,
  onThreadNavigate: _onThreadNavigate,
}: Pick<
  TaskCommentsPanelProps,
  | "taskIdNum"
  | "threadsList"
  | "selectedThreadId"
  | "setSelectedThreadId"
  | "setIsAddingThread"
  | "handleAddThread"
  | "openThreadView"
  | "isThreadListLoading"
  | "handleViewThreadHistory"
  | "onThreadNavigate"
>) {
  const [isThreadSelectorOpen, setIsThreadSelectorOpen] = React.useState(false)
  const selectorRows = React.useMemo(() => {
    const rows = Array.isArray(_threadsList) ? _threadsList : []
    return rows
      .map((thread: any) => {
        const threadId = Number(thread?.id)
        if (!Number.isFinite(threadId)) return null
        const latestActivityAt = thread?.latest_activity_at ?? thread?.created_at ?? null
        return {
          raw: thread,
          threadId,
          preview: thread?.latest_preview ?? thread?.title ?? "Thread",
          threadType: thread?.thread_type ?? thread?.object_type ?? "general",
          isResolved: Boolean(thread?.is_resolved ?? thread?.resolved_at),
          participantCount: Array.isArray(thread?.thread_watchers) ? thread.thread_watchers.length : 0,
          latestActivityAt,
        }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const aTs = new Date(a.latestActivityAt ?? 0).getTime()
        const bTs = new Date(b.latestActivityAt ?? 0).getTime()
        return bTs - aTs
      })
  }, [_threadsList])

  return (
    <div className="flex items-center gap-1">
        <Popover
          open={isThreadSelectorOpen}
          onOpenChange={(open) => {
            setIsThreadSelectorOpen(open)
            if (open) void _handleViewThreadHistory({ force: true })
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={_isThreadListLoading}
              title="Thread selector"
              aria-label="Thread selector"
            >
              <Clock3 className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" side="bottom" className="w-[min(92vw,380px)] p-0">
            <div className="max-h-72 overflow-y-auto">
              {selectorRows.length > 0 ? (
                selectorRows.map((row: any) => (
                  <button
                    key={`thread-selector-${row.threadId}`}
                    type="button"
                    className={`flex w-full flex-col items-start gap-1 border-b border-gray-100 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-gray-50 ${_selectedThreadId === row.threadId ? "bg-yellow-50" : ""}`}
                    onClick={() => {
                      _setIsAddingThread(false)
                      _setSelectedThreadId(row.threadId)
                      _openThreadView?.(row.threadId)
                      _onThreadNavigate?.(row.raw)
                      setIsThreadSelectorOpen(false)
                    }}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="truncate font-medium">{row.preview}</span>
                      <span className="text-[10px] text-gray-500">#{row.threadId}</span>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-1 text-[10px] text-gray-500">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5">{row.threadType}</span>
                      <span className={row.isResolved ? "text-gray-400" : "text-emerald-600"}>
                        {row.isResolved ? "resolved" : "open"}
                      </span>
                      <span>{row.participantCount} participant{row.participantCount === 1 ? "" : "s"}</span>
                      <span>
                        {row.latestActivityAt ? new Date(row.latestActivityAt).toLocaleString() : "No activity"}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-gray-500">No threads found for this task.</div>
              )}
            </div>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => {
            if (typeof _handleAddThread === "function") {
              _handleAddThread()
            } else {
              _setSelectedThreadId(null)
              _setIsAddingThread(true)
            }
          }}
          title="Start thread"
          aria-label="Start thread"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Thread
        </Button>
    </div>
  )
}

function stripHtmlPreview(value: string): string {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function formatCommentDateShort(dateString: string): string {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function threadHasOutputAnchor(thread: any): boolean {
  return typeof thread?.task_component_output_id === "string" && thread.task_component_output_id.length > 0
}

function resolveMentionAuthor(mention: any, thread?: any): any {
  const user =
    mention?.users
    ?? mention?.user
    ?? mention?.author
    ?? mention?.created_by_user
    ?? mention?.createdByUser
    ?? mention?.user_profile
    ?? mention?.profile
    ?? mention?.comment?.user
    ?? mention?.message?.user
    ?? thread?.users
    ?? thread?.user
    ?? thread?.author
    ?? thread?.created_by_user
    ?? null
  return {
    ...(user ?? {}),
    full_name:
      user?.full_name
      ?? user?.display_name
      ?? user?.name
      ?? user?.email
      ?? mention?.author_name
      ?? mention?.user_name
      ?? thread?.author_name
      ?? thread?.user_name
      ?? "Unknown user",
    email: user?.email ?? mention?.author_email ?? mention?.user_email ?? null,
    photo:
      user?.photo
      ?? user?.photo_url
      ?? user?.avatar_url
      ?? user?.avatar
      ?? user?.image
      ?? mention?.author_photo
      ?? mention?.user_photo
      ?? thread?.author_photo
      ?? thread?.user_photo
      ?? null,
  }
}

/** List part: header row + ThreadedRealtimeChat. Renders in scroll area (pane) or inside modal scroll. */
export function TaskCommentsListPart(props: TaskCommentsPanelProps) {
  const {
    threadsList,
    selectedThreadId,
    setSelectedThreadId,
    isThreadView = false,
    openThreadView,
    showAllThreadsView,
    setIsAddingThread,
    currentUserId,
    isSuggestionMode,
    allMentions,
    commentsStatusFilter = "all",
    setCommentsStatusFilter,
    currentUserName,
    currentUserAvatar,
    currentUserEmail,
    currentPublicUserId,
    latestMentionsByThread,
    onThreadNavigate,
    handleAddThread,
    handleViewThreadHistory,
    isThreadListLoading,
    taskIdNum,
    embedCollapsed = false,
    embedThreadLimit = 5,
    onEmbedExpand,
    hideStatusFilter = false,
    hideThreadToolbar = false,
    clientSort = "newest",
  } = props

  const mentionsSorted = React.useMemo(() => {
    if (!Array.isArray(allMentions)) return []
    return [...allMentions].sort((a: any, b: any) => {
      const aTs = new Date(a?.created_at ?? 0).getTime()
      const bTs = new Date(b?.created_at ?? 0).getTime()
      return bTs - aTs
    })
  }, [allMentions])
  const threadCards = React.useMemo(() => {
    const mentionCountByThread = new Map<number, number>()
    const latestByThread = new Map<number, any>()
    const authorCandidateByThread = new Map<number, any>()
    const hasUsefulAuthor = (mention: any): boolean => {
      const candidate = resolveMentionAuthor(mention)
      const name = String(candidate?.full_name ?? "").trim().toLowerCase()
      const hasKnownName = name.length > 0 && name !== "unknown user" && name !== "user"
      const hasAvatar = Boolean(candidate?.photo || candidate?.avatar_url || candidate?.avatar)
      return hasKnownName || hasAvatar
    }
    for (const mention of mentionsSorted) {
      const threadId = Number(mention?.thread_id)
      if (!Number.isFinite(threadId)) continue
      mentionCountByThread.set(threadId, (mentionCountByThread.get(threadId) ?? 0) + 1)
      if (!latestByThread.has(threadId)) latestByThread.set(threadId, mention)
      if (!authorCandidateByThread.has(threadId) && hasUsefulAuthor(mention)) {
        authorCandidateByThread.set(threadId, mention)
      }
    }
    const withDerived = (threadsList ?? []).map((thread: any) => {
      const threadId = Number(thread?.id)
      const latestMention = latestByThread.get(threadId) ?? null
      const authorMention = authorCandidateByThread.get(threadId) ?? latestMention
      const mentionCount = Number.isFinite(Number(thread?.mention_count))
        ? Number(thread.mention_count)
        : (mentionCountByThread.get(threadId) ?? 0)
      const latestActivityAt =
        thread?.latest_activity_at
        ?? latestMention?.created_at
        ?? thread?.updated_at
        ?? thread?.created_at
        ?? null
      const isResolved = Boolean(thread?.is_resolved ?? thread?.resolved_at)
      return {
        ...thread,
        mention_count: mentionCount,
        latest_preview: thread?.latest_preview ?? latestMention?.comment ?? thread?.title ?? "Thread",
        latest_activity_at: latestActivityAt,
        is_resolved: isResolved,
        author_mention: authorMention,
      }
    })
    const filtered = hideStatusFilter
      ? withDerived
      : withDerived.filter((thread: any) => {
          if (commentsStatusFilter === "open") return !thread.is_resolved
          if (commentsStatusFilter === "resolved") return !!thread.is_resolved
          return true
        })

    const getThreadAuthorName = (thread: any) => {
      const threadId = Number(thread?.id)
      const latest = latestByThread.get(threadId) ?? null
      const author = resolveMentionAuthor(thread?.author_mention ?? latest, thread)
      return String(author?.full_name ?? "Unknown user")
    }

    const getThreadTimestamp = (thread: any) =>
      thread?.latest_activity_at ?? thread?.created_at ?? null

    return sortByUserLabel(filtered, getThreadAuthorName, clientSort, getThreadTimestamp)
  }, [threadsList, mentionsSorted, commentsStatusFilter, hideStatusFilter, clientSort])

  const visibleThreadCards = React.useMemo(() => {
    if (!embedCollapsed) return threadCards
    return threadCards.slice(0, embedThreadLimit)
  }, [threadCards, embedCollapsed, embedThreadLimit])

  const hasHiddenThreads = embedCollapsed && threadCards.length > embedThreadLimit

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!isThreadView ? (
        <>
          {!hideStatusFilter || !hideThreadToolbar ? (
            <div className="mb-2 flex items-center justify-between gap-2">
              {!hideStatusFilter ? (
                <div className="flex items-center gap-1">
                  {(["all", "open", "resolved"] as const).map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant={commentsStatusFilter === value ? "secondary" : "ghost"}
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setCommentsStatusFilter?.(value)}
                    >
                      {value === "all" ? "All" : value === "open" ? "Open" : "Resolved"}
                    </Button>
                  ))}
                </div>
              ) : (
                <span />
              )}
              {!hideThreadToolbar ? (
                <TaskCommentsHeaderRow
                  taskIdNum={taskIdNum}
                  threadsList={threadsList}
                  selectedThreadId={selectedThreadId}
                  setSelectedThreadId={setSelectedThreadId}
                  setIsAddingThread={setIsAddingThread}
                  handleAddThread={handleAddThread}
                  openThreadView={openThreadView}
                  isThreadListLoading={isThreadListLoading}
                  handleViewThreadHistory={handleViewThreadHistory}
                  onThreadNavigate={onThreadNavigate}
                />
              ) : null}
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {Array.isArray(visibleThreadCards) && visibleThreadCards.length > 0 ? (
              <ul className="flex flex-col py-1">
                {visibleThreadCards.map((thread: any, idx: number) => {
                  const threadId = Number(thread?.id)
                  if (!Number.isFinite(threadId)) return null
                  const latest = latestMentionsByThread?.[threadId] ?? null
                  const preview = thread?.latest_preview ?? latest?.comment ?? thread?.title ?? "Thread"
                  const latestActivityAt = thread?.latest_activity_at ?? latest?.created_at ?? thread?.created_at ?? null
                  const author = resolveMentionAuthor(thread?.author_mention ?? latest, thread)
                  const displayName = String(author?.full_name ?? "Unknown user")
                  const photoUrl = getImageUrl(author?.photo ?? author?.avatar_url ?? author?.avatar ?? null)
                  const plainPreview = stripHtmlPreview(String(preview))
                  const relativeTime = latestActivityAt
                    ? formatDistanceToNow(new Date(latestActivityAt), { addSuffix: true })
                    : null
                  const shortDate = latestActivityAt ? formatCommentDateShort(latestActivityAt) : null

                  const openThread = () => {
                    setIsAddingThread(false)
                    setSelectedThreadId(threadId)
                    openThreadView?.(threadId)
                    if (threadHasOutputAnchor(thread)) {
                      onThreadNavigate?.(thread)
                    }
                  }

                  const selectForReply = (event: React.MouseEvent) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setIsAddingThread(false)
                    setSelectedThreadId(threadId)
                  }

                  return (
                    <li key={threadId}>
                      {idx > 0 ? <div className="border-t border-gray-200" /> : null}
                      <div className="group w-full py-1.5">
                        <div className="flex items-center gap-2 min-h-0">
                          <UserAvatar name={displayName} photoUrl={photoUrl} />
                          <span className="min-w-0 truncate text-sm font-medium text-gray-900">
                            {displayName}
                          </span>
                          <div className="ml-auto flex shrink-0 items-center gap-1 text-right text-xs text-muted-foreground whitespace-nowrap">
                            {relativeTime ? <span className="block">{relativeTime}</span> : null}
                            {shortDate ? <span className="block">{shortDate}</span> : null}
                            <button
                              type="button"
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity"
                              aria-label={`Reply to thread ${threadId}`}
                              title="Reply in thread"
                              onClick={selectForReply}
                            >
                              <Reply className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={openThread}
                          className="mt-0.5 block w-full text-left pl-10 hover:bg-gray-50/80 rounded-sm"
                        >
                          <span
                            className="line-clamp-2 text-sm text-gray-700"
                            style={{ wordBreak: "break-word" }}
                          >
                            {plainPreview || "No message preview"}
                          </span>
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : null}
            {hasHiddenThreads && onEmbedExpand ? (
              <button
                type="button"
                className="mt-1 text-xs text-gray-500 hover:text-gray-700"
                onClick={onEmbedExpand}
              >
                Show {threadCards.length - embedThreadLimit} more thread{threadCards.length - embedThreadLimit === 1 ? "" : "s"}
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="mb-2">
            <button
              type="button"
              onClick={() => {
                setIsAddingThread(false)
                if (showAllThreadsView) {
                  showAllThreadsView()
                } else {
                  setSelectedThreadId(null)
                }
              }}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
          </div>
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto",
              embedCollapsed && "max-h-[min(280px,36vh)]",
            )}
          >
            {currentUserId !== null && !isSuggestionMode && typeof selectedThreadId === "number" ? (
              <ThreadedRealtimeChat
                key={String(selectedThreadId)}
                threadId={selectedThreadId}
                currentUserId={currentUserId}
                currentUserName={currentUserName || undefined}
                currentUserAvatar={currentUserAvatar || undefined}
                currentUserEmail={currentUserEmail}
                currentPublicUserId={currentPublicUserId ?? undefined}
                hideInput={true}
                onReplySelected={(payload) => {
                  props.setReplyTo(payload)
                  requestAnimationFrame(() => {
                    const el = document.querySelector(".ql-editor")
                    if (el instanceof HTMLElement) el.focus()
                  })
                }}
                initialMessages={
                  Array.isArray(allMentions) && selectedThreadId
                    ? allMentions.filter((m: any) => m.thread_id === selectedThreadId)
                    : []
                }
              />
            ) : null}
          </div>
          {embedCollapsed && onEmbedExpand ? (
            <button
              type="button"
              className="mt-1 text-xs text-gray-500 hover:text-gray-700"
              onClick={onEmbedExpand}
            >
              Show more messages
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}

/** Input part: StickyAddCommentInput. */
export function TaskCommentsInputPart(props: TaskCommentsPanelProps) {
  const {
    taskIdNum,
    pendingParticipants,
    setPendingParticipants,
    removedParticipants,
    setRemovedParticipants,
    isAddingThread,
    selectedThreadId,
    threadsList,
    latestMentions,
    handleDeleteThread,
    replyTo,
    onClearReply,
    currentUserName,
    currentUserAvatar,
  } = props

  const composerPhotoUrl =
    getImageUrl(currentUserAvatar || null)
    || (currentUserAvatar?.startsWith("http") ? currentUserAvatar : null)

  return (
    <div className="flex w-full items-start gap-2 bg-white">
      <UserAvatar
        name={currentUserName || "You"}
        photoUrl={composerPhotoUrl}
        size="sm"
        className="mt-2"
      />
      <div className="min-w-0 flex-1">
        <StickyAddCommentInput
          taskId={taskIdNum}
          onCommentAdded={props.onCommentAdded ?? (() => {})}
          pendingParticipants={pendingParticipants}
          setPendingParticipants={setPendingParticipants}
          removedParticipants={removedParticipants}
          setRemovedParticipants={setRemovedParticipants}
          activeThreadId={isAddingThread ? null : selectedThreadId}
          threads={threadsList}
          latestMentions={latestMentions}
          handleDeleteThread={handleDeleteThread}
          replyTo={replyTo}
          onClearReply={onClearReply}
          pendingOutputAnchor={props.pendingOutputAnchor ?? null}
          onConsumePendingOutputAnchor={props.onConsumePendingOutputAnchor}
          focusComposerToken={props.composerFocusToken ?? 0}
          embedded
        />
      </div>
    </div>
  )
}

/** Footer part: thread switcher, participants, delete thread, add thread. */
export function TaskCommentsFooterPart(props: TaskCommentsPanelProps) {
  const {
    task,
    selectedThreadId,
    isThreadView = false,
    isAddingThread,
    project_watchers,
    allProjectUsers,
    currentUserId,
    participants,
    refetchSelectedThread,
    handleDeleteThread,
    setShowDeleteThreadDialog,
    showDeleteThreadDialog,
    isDeleting,
  } = props

  return (
    <div className="shrink-0 flex items-center gap-2 bg-white px-0 py-1">
      <span className="shrink-0 text-xs text-gray-500">We'll notify</span>
      <div className="min-w-0 flex-1 overflow-hidden">
        {isAddingThread || !(task as any)?.thread_id ? (
          <ThreadParticipantsInline
            pendingMode
            pendingParticipants={props.pendingParticipants}
            setPendingParticipants={props.setPendingParticipants}
            removedParticipants={props.removedParticipants}
            setRemovedParticipants={props.setRemovedParticipants}
            participants={Array.isArray(project_watchers) ? project_watchers.map((pw: any) => pw.users).filter(Boolean) : []}
            allProjectUsers={allProjectUsers}
            currentUserId={currentUserId}
            projectId={Number(task?.project_id_int) || 0}
          />
        ) : (
          typeof selectedThreadId === "number" && (
            <ThreadParticipantsInline
              threadId={selectedThreadId}
              projectId={Number(task?.project_id_int) || 0}
              allowRemove={true}
              key={selectedThreadId}
              participants={participants}
              allProjectUsers={allProjectUsers}
              currentUserId={currentUserId}
              onParticipantsChanged={refetchSelectedThread}
            />
          )
        )}
      </div>
      {!isThreadView && typeof selectedThreadId === "number" ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          Sending to #{selectedThreadId}
        </span>
      ) : null}
      {isAddingThread ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          Starting new thread
        </span>
      ) : null}
      {selectedThreadId && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-1 shrink-0 text-destructive hover:text-destructive"
            aria-label="Delete thread"
            title="Delete thread"
            onClick={() => setShowDeleteThreadDialog(true)}
          >
            Delete thread
          </Button>
          <Dialog open={showDeleteThreadDialog} onOpenChange={setShowDeleteThreadDialog}>
            <DialogContent>
              <DialogTitle>Delete Thread</DialogTitle>
              <div className="py-2">Are you sure you want to delete this thread? This cannot be undone.</div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDeleteThreadDialog(false)} disabled={isDeleting}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    await handleDeleteThread(selectedThreadId)
                    setShowDeleteThreadDialog(false)
                  }}
                  disabled={isDeleting}
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}

