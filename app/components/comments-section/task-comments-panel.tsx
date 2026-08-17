"use client"

import React from "react"
import { ThreadedRealtimeChat } from "../threaded-realtime-chat"
import { StickyAddCommentInput } from "./sticky-add-comment-input"
import { ThreadParticipantsInline } from "./thread-participants-inline"
import { Button } from "../ui/button"
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "../ui/dialog"
import { ChevronLeft, Clock3, MessageSquare, Plus, Reply, Trash2 } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { UserAvatar } from "../UserAvatar"
import { getImageUrl } from "../../lib/public-media"
import { cn } from "@/lib/utils"
import { ActivityRowTimestamp, getActivityRelativeTimeLabel } from "../activity-row-timestamp"
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
  /** Cap visible mentions in the default flat feed when collapsed */
  embedMentionLimit?: number
  onEmbedExpand?: () => void
  /** Overview: selected artifact text shown above the pinned composer */
  pendingArtifactTextQuote?: string | null
  onClearPendingArtifactTextQuote?: () => void
  /** Overview merged feed: hide All/Open/Resolved filters */
  hideStatusFilter?: boolean
  /** Overview merged feed: toolbar rendered by parent */
  hideThreadToolbar?: boolean
  /** Client-side sort (no API changes) */
  clientSort?: OverviewFeedSort
  /** Compact single-line composer that expands on focus */
  minimalComposer?: boolean
  composerExpanded?: boolean
  onComposerExpandedChange?: (expanded: boolean) => void
  onThreadCreated?: (thread: { id: number | string; isOptimistic?: boolean }) => void
  /** When set, flat feed shows only mentions from this thread */
  filterThreadId?: number | null
  /**
   * Called when the clock picker selects a thread (or clears it).
   * Overview uses this to switch to Comments and filter — without opening the Comments tab.
   */
  onSelectThreadFilter?: (threadId: number | null) => void
}

function stripHtmlPreview(value: string): string {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function ThreadParticipantAvatarStack({
  participants,
  max = 3,
}: {
  participants: Array<{ id?: number; full_name?: string | null; email?: string | null; photo?: string | null }>
  max?: number
}) {
  const visible = participants.slice(0, max)
  const overflow = Math.max(0, participants.length - max)
  if (visible.length === 0) {
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] text-gray-500">
        —
      </div>
    )
  }
  return (
    <div className="flex shrink-0 items-center pl-1">
      {visible.map((user, index) => {
        const name = String(user.full_name || user.email || "User")
        const photoUrl = getImageUrl(user.photo ?? null)
        return (
          <div
            key={user.id ?? `${name}-${index}`}
            className="-ml-1 first:ml-0"
            style={{ zIndex: visible.length - index }}
          >
            <UserAvatar name={name} photoUrl={photoUrl} size="xs" className="ring-2 ring-white" />
          </div>
        )
      })}
      {overflow > 0 ? (
        <span className="-ml-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gray-100 px-1 text-[10px] font-medium text-gray-600 ring-2 ring-white">
          +{overflow}
        </span>
      ) : null}
    </div>
  )
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
  filterThreadId: _filterThreadId = null,
  onSelectThreadFilter: _onSelectThreadFilter,
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
  | "filterThreadId"
  | "onSelectThreadFilter"
>) {
  const [isThreadSelectorOpen, setIsThreadSelectorOpen] = React.useState(false)
  const activeFilterId = _filterThreadId ?? null
  const selectorRows = React.useMemo(() => {
    const rows = Array.isArray(_threadsList) ? _threadsList : []
    return rows
      .map((thread: any) => {
        const threadId = Number(thread?.id)
        if (!Number.isFinite(threadId)) return null
        const latestActivityAt = thread?.latest_activity_at ?? thread?.created_at ?? null
        const participants = Array.isArray(thread?.thread_watchers)
          ? thread.thread_watchers.map((tw: any) => tw?.users).filter(Boolean)
          : []
        const rawPreview = thread?.latest_preview ?? thread?.title ?? "Thread"
        return {
          threadId,
          preview: stripHtmlPreview(String(rawPreview)) || "Thread",
          mentionCount: Number(thread?.mention_count) || 0,
          participants,
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

  const selectThread = (threadId: number | null) => {
    _setIsAddingThread(false)
    _setSelectedThreadId(threadId)
    _onSelectThreadFilter?.(threadId)
    setIsThreadSelectorOpen(false)
  }

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
              className={cn(
                "h-7 w-7 p-0 text-gray-500",
                activeFilterId != null && "bg-gray-100 text-gray-900",
              )}
              disabled={_isThreadListLoading}
              title="Filter by thread"
              aria-label="Filter by thread"
            >
              <Clock3 className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" side="bottom" className="w-[min(92vw,360px)] p-1">
            <div className="max-h-72 overflow-y-auto">
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-gray-50",
                  activeFilterId == null && "bg-gray-50 font-medium",
                )}
                onClick={() => selectThread(null)}
              >
                <span className="min-w-0 flex-1 truncate text-gray-800">All threads</span>
              </button>
              {selectorRows.length > 0 ? (
                selectorRows.map((row: any) => {
                  const isActive = activeFilterId === row.threadId
                  return (
                    <button
                      key={`thread-selector-${row.threadId}`}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-gray-50",
                        isActive && "bg-gray-50",
                      )}
                      onClick={() => selectThread(row.threadId)}
                    >
                      <ThreadParticipantAvatarStack participants={row.participants} />
                      <div className="min-w-0 flex-1">
                        <div className={cn("truncate text-sm text-gray-800", isActive && "font-medium")}>
                          {row.preview}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {getActivityRelativeTimeLabel(row.latestActivityAt)}
                        </div>
                      </div>
                    </button>
                  )
                })
              ) : (
                <div className="px-2 py-3 text-xs text-muted-foreground">No threads for this task.</div>
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
    onThreadNavigate,
    handleAddThread,
    handleViewThreadHistory,
    isThreadListLoading,
    taskIdNum,
    embedCollapsed = false,
    embedMentionLimit = 8,
    onEmbedExpand,
    hideStatusFilter = false,
    hideThreadToolbar = false,
    clientSort = "oldest",
    filterThreadId = null,
  } = props

  const threadById = React.useMemo(() => {
    const map = new Map<number, any>()
    for (const thread of threadsList ?? []) {
      const threadId = Number(thread?.id)
      if (Number.isFinite(threadId)) map.set(threadId, thread)
    }
    return map
  }, [threadsList])

  const mentionsSorted = React.useMemo(() => {
    if (!Array.isArray(allMentions)) return []
    const resolvedByThread = new Map<number, boolean>()
    for (const thread of threadsList ?? []) {
      const threadId = Number(thread?.id)
      if (!Number.isFinite(threadId)) continue
      resolvedByThread.set(threadId, Boolean(thread?.is_resolved ?? thread?.resolved_at))
    }

    const filtered = allMentions.filter((mention: any) => {
      const threadId = Number(mention?.thread_id)
      if (!Number.isFinite(threadId)) return false
      if (filterThreadId != null && threadId !== Number(filterThreadId)) return false
      if (hideStatusFilter || commentsStatusFilter === "all") return true
      const isResolved = resolvedByThread.get(threadId) ?? false
      if (commentsStatusFilter === "open") return !isResolved
      if (commentsStatusFilter === "resolved") return isResolved
      return true
    })

    return sortByUserLabel(
      filtered,
      (mention: any) => {
        const author = resolveMentionAuthor(mention, threadById.get(Number(mention?.thread_id)))
        return String(author?.full_name ?? "Unknown user")
      },
      clientSort,
      (mention: any) => mention?.created_at ?? null,
    )
  }, [allMentions, threadsList, commentsStatusFilter, hideStatusFilter, clientSort, threadById, filterThreadId])

  const visibleMentions = React.useMemo(() => {
    if (!embedCollapsed) return mentionsSorted
    // Chronological (oldest-first): show the most recent window, still ordered oldest→newest.
    if (clientSort === "oldest") {
      return mentionsSorted.slice(-embedMentionLimit)
    }
    return mentionsSorted.slice(0, embedMentionLimit)
  }, [mentionsSorted, embedCollapsed, embedMentionLimit, clientSort])

  const hasHiddenMentions = embedCollapsed && mentionsSorted.length > embedMentionLimit

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
            {visibleMentions.length > 0 ? (
              <ul className="flex flex-col">
                {visibleMentions.map((mention: any) => {
                  const mentionId = Number(mention?.id)
                  const threadId = Number(mention?.thread_id)
                  if (!Number.isFinite(mentionId) || !Number.isFinite(threadId)) return null
                  const thread = threadById.get(threadId)
                  const author = resolveMentionAuthor(mention, thread)
                  const displayName = String(author?.full_name ?? "Unknown user")
                  const photoUrl = getImageUrl(author?.photo ?? author?.avatar_url ?? author?.avatar ?? null)
                  const plainPreview = stripHtmlPreview(String(mention?.comment ?? ""))

                  const selectForReply = () => {
                    setIsAddingThread(false)
                    setSelectedThreadId(threadId)
                  }

                  return (
                    <li key={mentionId} className="group flex items-start gap-2.5 py-2">
                      <UserAvatar name={displayName} photoUrl={photoUrl} size="xs" className="mt-0.5 !h-5 !w-5 !min-h-5 !min-w-5 text-[9px]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={selectForReply}
                              className="truncate text-left text-sm font-medium leading-5 text-gray-900"
                            >
                              {displayName}
                            </button>
                            <span className="shrink-0 text-gray-300" aria-hidden>
                              ·
                            </span>
                            <ActivityRowTimestamp value={mention?.created_at} />
                          </div>
                          <button
                            type="button"
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 md:opacity-0 md:group-hover:opacity-100"
                            aria-label="Reply in thread"
                            title="Reply in thread"
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              selectForReply()
                            }}
                          >
                            <Reply className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={selectForReply}
                          className="mt-1 w-full text-left text-sm leading-5 text-gray-700"
                          style={{ wordBreak: "break-word" }}
                          title={plainPreview || undefined}
                        >
                          {plainPreview || "Empty comment"}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No comments yet.
              </div>
            )}
            {hasHiddenMentions && onEmbedExpand ? (
              <button
                type="button"
                className="mt-1 text-xs text-gray-500 hover:text-gray-700"
                onClick={onEmbedExpand}
              >
                Show {mentionsSorted.length - embedMentionLimit} more comment{mentionsSorted.length - embedMentionLimit === 1 ? "" : "s"}
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
    minimalComposer = false,
    composerExpanded,
    onComposerExpandedChange,
  } = props

  const composerPhotoUrl =
    getImageUrl(currentUserAvatar || null)
    || (currentUserAvatar?.startsWith("http") ? currentUserAvatar : null)
  const [localExpanded, setLocalExpanded] = React.useState(false)
  const [localFocusToken, setLocalFocusToken] = React.useState(0)
  const [selectionQuoteVisible, setSelectionQuoteVisible] = React.useState(false)
  const isExpanded = composerExpanded ?? localExpanded
  const setExpanded = onComposerExpandedChange ?? setLocalExpanded
  const pendingQuote = props.pendingArtifactTextQuote?.trim() || null
  // Selection alone must not expand the composer — that shifts the avatar.
  // A small comment icon appears first; the quote only opens on click.
  const shouldShowFullComposer =
    !minimalComposer
    || isExpanded
    || Boolean(replyTo)
    || Boolean(props.pendingOutputAnchor)
    || (Boolean(pendingQuote) && selectionQuoteVisible)

  React.useEffect(() => {
    if (replyTo || props.pendingOutputAnchor) {
      setExpanded(true)
    }
  }, [replyTo, props.pendingOutputAnchor, setExpanded])

  React.useEffect(() => {
    if (!pendingQuote) setSelectionQuoteVisible(false)
  }, [pendingQuote])

  const openSelectionComment = () => {
    setSelectionQuoteVisible(true)
    setExpanded(true)
    setLocalFocusToken((token) => token + 1)
  }

  return (
    <div className="z-10 flex w-full items-start gap-2 bg-white py-1.5">
      <UserAvatar
        name={currentUserName || "You"}
        photoUrl={composerPhotoUrl}
        size="sm"
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        {shouldShowFullComposer ? (
          <>
            {pendingQuote && selectionQuoteVisible ? (
              <div className="mb-2 flex items-start justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5">
                <div className="min-w-0 truncate text-xs text-gray-700">
                  “{pendingQuote}”
                </div>
                <button
                  type="button"
                  className="shrink-0 text-xs text-gray-500 hover:text-gray-900"
                  onClick={() => {
                    setSelectionQuoteVisible(false)
                    props.onClearPendingArtifactTextQuote?.()
                  }}
                  aria-label="Clear selection"
                  title="Clear"
                >
                  ×
                </button>
              </div>
            ) : pendingQuote ? (
              <button
                type="button"
                onClick={openSelectionComment}
                className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
                aria-label="Comment on selection"
                title="Comment on selection"
              >
                <MessageSquare className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            <StickyAddCommentInput
              taskId={taskIdNum}
              onCommentAdded={() => {
                setSelectionQuoteVisible(false)
                props.onClearPendingArtifactTextQuote?.()
                props.onCommentAdded?.()
              }}
              onThreadCreated={props.onThreadCreated}
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
              focusComposerToken={(props.composerFocusToken ?? 0) + localFocusToken}
              embedded
              onCollapseRequest={
                minimalComposer
                  ? () => {
                      setExpanded(false)
                      setSelectionQuoteVisible(false)
                    }
                  : undefined
              }
            />
          </>
        ) : (
          <div className="flex h-9 items-center gap-1.5">
            {pendingQuote ? (
              <button
                type="button"
                onClick={openSelectionComment}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
                aria-label="Comment on selection"
                title="Comment on selection"
              >
                <MessageSquare className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              className="flex h-9 min-w-0 flex-1 items-center rounded-md border border-gray-200 bg-white px-3 text-left text-sm text-muted-foreground hover:border-gray-300 hover:bg-gray-50"
              onClick={() => {
                setExpanded(true)
                setLocalFocusToken((token) => token + 1)
              }}
            >
              Add a comment...
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Footer part: thread switcher, participants, delete thread, add thread. */
export function TaskCommentsFooterPart(props: TaskCommentsPanelProps) {
  const {
    task,
    selectedThreadId,
    isAddingThread,
    threadsList,
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

  const selectedThreadName = React.useMemo(() => {
    if (typeof selectedThreadId !== "number") return null
    const thread = (threadsList ?? []).find(
      (row: any) => Number(row?.id) === Number(selectedThreadId),
    )
    const raw =
      thread?.latest_preview
      ?? thread?.title
      ?? `Thread #${selectedThreadId}`
    return stripHtmlPreview(String(raw)) || `Thread #${selectedThreadId}`
  }, [selectedThreadId, threadsList])

  return (
    <div className="flex shrink-0 items-center gap-2 bg-white px-0 py-1">
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
            className="ml-1 h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
            aria-label="Delete thread"
            title="Delete thread"
            onClick={() => setShowDeleteThreadDialog(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Dialog open={showDeleteThreadDialog} onOpenChange={setShowDeleteThreadDialog}>
            <DialogContent>
              <DialogTitle>Delete Thread</DialogTitle>
              <div className="py-2">
                Are you sure you want to delete{" "}
                <span className="font-medium text-gray-900">
                  “{selectedThreadName}”
                </span>
                ? This cannot be undone.
              </div>
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
