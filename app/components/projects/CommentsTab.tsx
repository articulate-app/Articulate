"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import {
  differenceInCalendarDays,
  format,
  formatDistanceToNow,
  isToday,
  isYesterday,
} from "date-fns"
import { toast } from "../ui/use-toast"
import { Button } from "../ui/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "../ui/dialog"
import { ChevronLeft } from "lucide-react"
import { AddCommentInput } from "../comments-section/add-comment-input"
import { TaskCommentsHeaderRow } from "../comments-section/task-comments-panel"
import { ThreadParticipantsInline } from "../comments-section/thread-participants-inline"
import { ThreadedRealtimeChat } from "../threaded-realtime-chat"
import { UserAvatar } from "../UserAvatar"
import { getImageUrl } from "../../lib/public-media"
import { useCurrentUserStore } from "../../store/current-user"
import { CHAT_CONTENT_COLUMN_CLASS } from "../../lib/chat-content-column"
import type { ProjectActivityFeedRow } from "../../lib/services/project-activity"
import { getProjectActivityRelativeTimeLabel } from "./project-activity-feed-list"

interface CommentsTabProps {
  projectId: number
  /** Overview embed: compact list + composer, no page chrome. */
  variant?: "full" | "preview"
  /** When preview, hide the mentions list (composer + thread controls remain). */
  hideMentionsList?: boolean
  /** When preview, hide thread history / new-thread header controls. */
  hideThreadToolbar?: boolean
  /** Overview: max merged feed rows (default unlimited). */
  previewMaxRows?: number
  /** Overview: expose thread toolbar for the section header row. */
  onHeaderActionsChange?: (actions: React.ReactNode | null) => void
  /** Overview: merge activity rows into the same scrolling feed. */
  activityLogs?: ProjectActivityFeedRow[]
  feedFilter?: "all" | "updates" | "comments"
  onLoadMoreActivity?: () => void
  hasMoreActivity?: boolean
  isLoadingMoreActivity?: boolean
}

type ViewMode = "all" | "threads" | "thread"

type ProjectThreadSummary = {
  thread_id: number
  thread_title: string | null
  latest_comment: string | null
  latest_created_at: string | null
  mention_count: number
  task_id: number | null
  task_title: string | null
}

type ProjectThreadRow = {
  thread_id: number
  thread_title: string | null
  thread_created_at: string | null
  thread_created_by: number | null
  object_type: "project" | "task" | null
  task_id: number | null
  task_title: string | null
  mention_id: number | null
  comment: string | null
  attachment: string | null
  mention_created_at: string | null
  mention_created_by: number | null
  author_full_name: string | null
  author_email: string | null
  author_photo: string | null
}

type ProjectMentionRow = {
  mention_id: number
  thread_id: number
  comment: string | null
  attachment: string | null
  created_at: string | null
  created_by: number | null
  author_name: string | null
  author_email: string | null
  author_photo: string | null
  task_id: number | null
  task_title: string | null
}

const PAGE_SIZE = 15

type ProjectMentionItem = {
  id: number
  threadId: number
  body: string | null
  createdAt: string | null
  author: {
    name: string
    email: string | null
    photo: string | null
  }
  taskId: number | null
  taskTitle: string | null
  attachment: string | null
}

function toTime(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function groupMentionsByTime(mentions: ProjectMentionItem[]) {
  const now = new Date()
  const today: ProjectMentionItem[] = []
  const yesterday: ProjectMentionItem[] = []
  const last7Days: ProjectMentionItem[] = []
  const older: ProjectMentionItem[] = []

  for (const mention of mentions) {
    const date = mention.createdAt ? new Date(mention.createdAt) : null
    if (!date || Number.isNaN(date.getTime())) {
      older.push(mention)
      continue
    }
    if (isToday(date)) {
      today.push(mention)
      continue
    }
    if (isYesterday(date)) {
      yesterday.push(mention)
      continue
    }
    const dayDiff = differenceInCalendarDays(now, date)
    if (dayDiff < 7) {
      last7Days.push(mention)
      continue
    }
    older.push(mention)
  }

  return [
    { id: "today", label: "Today", items: today },
    { id: "yesterday", label: "Yesterday", items: yesterday },
    { id: "last7", label: "Last 7 days", items: last7Days },
    { id: "older", label: "Older", items: older },
  ].filter((group) => group.items.length > 0)
}

function mapProjectMentionToComment(row: ProjectMentionRow): ProjectMentionItem {
  return {
    id: row.mention_id,
    threadId: row.thread_id,
    body: row.comment,
    createdAt: row.created_at,
    author: {
      name: row.author_name ?? row.author_email ?? "Unknown user",
      email: row.author_email ?? null,
      photo: row.author_photo ?? null,
    },
    taskId: row.task_id,
    taskTitle: row.task_title,
    attachment: row.attachment,
  }
}

function toReplyPreview(html: string | null | undefined): string {
  const plain = (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
  if (!plain) return "message"
  return plain.length > 80 ? `${plain.slice(0, 80)}...` : plain
}

function formatActivityLine(log: ProjectActivityFeedRow): string {
  const title = log.event || log.title || "Activity"
  const isTaskEvent = log.entity_type === "task" && log.task_name
  const details = log.details_json ?? {}
  const isPlannerRun =
    /planner\s+run\s+completed/i.test(title) && typeof details.suggestions_created === "number"
  const suggestionsText = isPlannerRun
    ? `${details.suggestions_created} suggestion${details.suggestions_created === 1 ? "" : "s"} created`
    : null
  const suffix = isTaskEvent ? log.task_name : suggestionsText
  return suffix ? `${title} · ${suffix}` : title
}

type MergedFeedItem =
  | {
      kind: "update"
      key: string
      createdAt: string | null
      authorName: string
      authorPhoto: string | null
      body: string
    }
  | {
      kind: "comment"
      key: string
      createdAt: string | null
      authorName: string
      authorPhoto: string | null
      body: string
      mention: ProjectMentionItem
    }

export function CommentsTab({
  projectId,
  variant = "full",
  hideMentionsList = false,
  hideThreadToolbar = false,
  previewMaxRows,
  onHeaderActionsChange,
  activityLogs = [],
  feedFilter = "all",
  onLoadMoreActivity,
  hasMoreActivity = false,
  isLoadingMoreActivity = false,
}: CommentsTabProps) {
  const isPreview = variant === "preview"
  const supabase = useMemo(() => createClientComponentClient(), [])
  const queryClient = useQueryClient()
  const publicUserId = useCurrentUserStore((state) => state.publicUserId)
  const currentUserName = useCurrentUserStore((state) => state.fullName)
  const projectIdNum = Number(projectId)

  const [viewMode, setViewMode] = useState<ViewMode>("all")
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null)
  const [isAddingThread, setIsAddingThread] = useState(false)
  const [pendingParticipants, setPendingParticipants] = useState<any[]>([])
  const [removedParticipants, setRemovedParticipants] = useState<any[]>([])
  const [replyTo, setReplyTo] = useState<{ id: number; author?: string; preview: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteThreadDialog, setShowDeleteThreadDialog] = useState(false)

  const [threadSummaries, setThreadSummaries] = useState<ProjectThreadSummary[]>([])
  const [threadRows, setThreadRows] = useState<ProjectThreadRow[]>([])
  const [mentions, setMentions] = useState<ProjectMentionItem[]>([])
  const [mentionsOffset, setMentionsOffset] = useState(0)
  const [hasMoreMentions, setHasMoreMentions] = useState(true)
  const [isLoadingSummaries, setIsLoadingSummaries] = useState(false)
  const [isLoadingThreads, setIsLoadingThreads] = useState(false)
  const [isLoadingMentions, setIsLoadingMentions] = useState(false)

  const mentionsContainerRef = useRef<HTMLDivElement | null>(null)
  const isLoadingMentionsRef = useRef(false)
  const loadedOffsetsRef = useRef<Set<number>>(new Set())

  const { data: currentUser } = useQuery({
    queryKey: ["project-comments-current-user", publicUserId],
    queryFn: async () => {
      if (!publicUserId) return null
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, email, photo")
        .eq("id", publicUserId)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!publicUserId,
  })

  const { data: projectUsers = [] } = useQuery({
    queryKey: ["project-comment-users", projectIdNum],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_project_watchers_with_user")
        .select("user_id, full_name, email, photo")
        .eq("project_id", projectIdNum)
      if (error) throw error
      return (data ?? []).map((row: any) => ({
        id: Number(row.user_id),
        full_name: row.full_name ?? null,
        email: row.email ?? null,
        auth_user_id: String(row.user_id),
        photo: row.photo ?? null,
      }))
    },
    enabled: Number.isFinite(projectIdNum),
  })

  const loadProjectCommentThreadSummaries = useCallback(
    async (targetProjectId: number) => {
      setIsLoadingSummaries(true)
      const { data, error } = await supabase.rpc("get_project_comment_thread_summaries", {
        p_project_id: targetProjectId,
        p_limit: 30,
        p_offset: 0,
      })
      setIsLoadingSummaries(false)
      if (error) throw error

      const normalized = ((data ?? []) as any[]).map((row) => ({
        thread_id: Number(row.thread_id),
        thread_title: row.thread_title ?? null,
        latest_comment: row.latest_comment ?? null,
        latest_created_at: row.latest_created_at ?? null,
        mention_count: Number.isFinite(Number(row.mention_count)) ? Number(row.mention_count) : 0,
        task_id: Number.isFinite(Number(row.task_id)) ? Number(row.task_id) : null,
        task_title: row.task_title ?? null,
      })) as ProjectThreadSummary[]

      setThreadSummaries(
        normalized.sort((a, b) => toTime(b.latest_created_at) - toTime(a.latest_created_at)),
      )
      return normalized
    },
    [supabase],
  )

  const loadProjectCommentThreads = useCallback(
    async (targetProjectId: number) => {
      setIsLoadingThreads(true)
      const { data, error } = await supabase.rpc("get_project_comment_threads", {
        p_project_id: targetProjectId,
      })
      setIsLoadingThreads(false)
      if (error) throw error

      const normalized = ((data ?? []) as any[]).map((row) => ({
        thread_id: Number(row.thread_id),
        thread_title: row.thread_title ?? null,
        thread_created_at: row.thread_created_at ?? null,
        thread_created_by: Number.isFinite(Number(row.thread_created_by))
          ? Number(row.thread_created_by)
          : null,
        object_type: row.object_type ?? null,
        task_id: Number.isFinite(Number(row.task_id)) ? Number(row.task_id) : null,
        task_title: row.task_title ?? null,
        mention_id: Number.isFinite(Number(row.mention_id)) ? Number(row.mention_id) : null,
        comment: row.comment ?? null,
        attachment: row.attachment ?? null,
        mention_created_at: row.mention_created_at ?? null,
        mention_created_by: Number.isFinite(Number(row.mention_created_by))
          ? Number(row.mention_created_by)
          : null,
        author_full_name: row.author_full_name ?? null,
        author_email: row.author_email ?? null,
        author_photo: row.author_photo ?? null,
      })) as ProjectThreadRow[]

      setThreadRows(normalized)
      return normalized
    },
    [supabase],
  )

  const loadMentions = useCallback(
    async (offset = 0) => {
      if (isLoadingMentionsRef.current) return
      if (loadedOffsetsRef.current.has(offset)) return

      isLoadingMentionsRef.current = true
      loadedOffsetsRef.current.add(offset)
      setIsLoadingMentions(true)
      const { data, error } = await supabase.rpc("get_project_comment_mentions", {
        p_project_id: projectIdNum,
        p_limit: PAGE_SIZE,
        p_offset: offset,
      })
      isLoadingMentionsRef.current = false
      setIsLoadingMentions(false)
      if (error) {
        loadedOffsetsRef.current.delete(offset)
        throw error
      }

      const normalized = ((data ?? []) as any[]).map((row) => ({
        mention_id: Number(row.mention_id),
        thread_id: Number(row.thread_id),
        comment: row.comment ?? null,
        attachment: row.attachment ?? null,
        created_at: row.created_at ?? null,
        created_by: Number.isFinite(Number(row.created_by))
          ? Number(row.created_by)
          : null,
        author_name: row.author_name ?? null,
        author_email: row.author_email ?? null,
        author_photo: row.author_photo ?? null,
        task_id: Number.isFinite(Number(row.task_id)) ? Number(row.task_id) : null,
        task_title: row.task_title ?? null,
      })) as ProjectMentionRow[]

      const mappedRows = normalized.map(mapProjectMentionToComment)
      setMentions((prev) => (offset === 0 ? mappedRows : [...prev, ...mappedRows]))
      setMentionsOffset(offset + normalized.length)
      setHasMoreMentions(normalized.length === PAGE_SIZE)
    },
    [supabase, projectIdNum],
  )

  useEffect(() => {
    if (!Number.isFinite(projectIdNum)) return
    setViewMode("all")
    setSelectedThreadId(null)
    setIsAddingThread(false)
  }, [projectIdNum])

  // Default view data load for "All mentions".
  useEffect(() => {
    if (!Number.isFinite(projectIdNum) || viewMode !== "all") return
    setMentions([])
    setMentionsOffset(0)
    setHasMoreMentions(true)
    loadedOffsetsRef.current.clear()
    isLoadingMentionsRef.current = false

    loadMentions(0).catch((error: any) => {
        toast({
          title: "Failed to load mentions",
          description: error?.message || "Unable to load project comments.",
          variant: "destructive",
        })
      })
  }, [projectIdNum, viewMode, loadMentions])

  const watcherThreadIds = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...mentions.map((mention) => mention.threadId),
            ...(selectedThreadId ? [selectedThreadId] : []),
          ].filter((id) => Number.isFinite(id)),
        ),
      ),
    [mentions, selectedThreadId],
  )

  const { data: watcherRows = [] } = useQuery({
    queryKey: ["project-comment-thread-watchers", projectIdNum, watcherThreadIds.join("|")],
    queryFn: async () => {
      if (watcherThreadIds.length === 0) return []
      const { data, error } = await supabase
        .from("thread_watchers")
        .select("thread_id, watcher_id, users!thread_watchers_watcher_id_fkey(id, full_name, email, photo)")
        .in("thread_id", watcherThreadIds)
      if (error) throw error
      return data ?? []
    },
    enabled: watcherThreadIds.length > 0,
  })

  const watchersByThread = useMemo(() => {
    const map = new Map<number, any[]>()
    for (const row of watcherRows as any[]) {
      const threadId = Number(row.thread_id)
      if (!Number.isFinite(threadId) || !row.users) continue
      const current = map.get(threadId) ?? []
      current.push({
        id: Number(row.users.id),
        full_name: row.users.full_name ?? null,
        email: row.users.email ?? null,
        auth_user_id: null,
        photo: row.users.photo ?? null,
      })
      map.set(threadId, current)
    }
    return map
  }, [watcherRows])

  const hydratedThreadsList = useMemo(
    () =>
      threadSummaries.map((summary) => ({
        id: summary.thread_id,
        title: summary.thread_title ?? "Untitled thread",
        created_at: summary.latest_created_at ?? new Date().toISOString(),
        task_id: summary.task_id ?? null,
        object_type: summary.task_id ? "task" : "project",
        task_title: summary.task_title ?? null,
        mention_count: summary.mention_count ?? 0,
        latest_comment: summary.latest_comment ?? null,
        thread_watchers: (watchersByThread.get(summary.thread_id) ?? []).map((user) => ({
          watcher_id: user.id,
          users: user,
        })),
      })),
    [threadSummaries, watchersByThread],
  )

  const allMentionsFromThreads = useMemo(
    () =>
      threadRows
        .filter((row) => row.mention_id != null)
        .map((row) => ({
          id: row.mention_id!,
          thread_id: row.thread_id,
          comment: row.comment,
          attachment: row.attachment,
          created_at: row.mention_created_at,
          created_by: row.mention_created_by,
          users: {
            id: row.mention_created_by ?? 0,
            full_name: row.author_full_name,
            email: row.author_email,
            photo: row.author_photo,
          },
        })),
    [threadRows],
  )

  const latestMentionsByThread = useMemo(() => {
    const map: Record<number, any> = {}
    const sourceMentions =
      allMentionsFromThreads.length > 0
        ? allMentionsFromThreads
        : mentions.map((mention) => ({
            id: mention.id,
            thread_id: mention.threadId,
            comment: mention.body,
            created_at: mention.createdAt,
            users: {
              id: 0,
              full_name: mention.author.name,
              email: mention.author.email,
              photo: mention.author.photo,
            },
          }))
    for (const mention of sourceMentions) {
      if (!map[mention.thread_id] || toTime(mention.created_at) > toTime(map[mention.thread_id].created_at)) {
        map[mention.thread_id] = mention
      }
    }
    return map
  }, [allMentionsFromThreads, mentions])

  const contextLabelByThread = useMemo(() => {
    const labels: Record<number, string> = {}
    for (const thread of hydratedThreadsList as any[]) {
      const threadId = Number(thread.id)
      if (!Number.isFinite(threadId)) continue
      if (thread.task_id && thread.task_title) {
        labels[threadId] = `Task: ${thread.task_title}`
      } else if (thread.task_id) {
        labels[threadId] = `Task #${thread.task_id}`
      } else {
        labels[threadId] = "Project"
      }
    }
    return labels
  }, [hydratedThreadsList])

  const selectedThread = useMemo(
    () => hydratedThreadsList.find((thread) => Number(thread.id) === Number(selectedThreadId)) ?? null,
    [hydratedThreadsList, selectedThreadId],
  )

  const participants = useMemo(() => {
    if (!selectedThreadId) return []
    const fromSummary = (selectedThread?.thread_watchers ?? [])
      .map((watcher: any) => watcher?.users)
      .filter(Boolean)
    if (fromSummary.length > 0) return fromSummary
    return watchersByThread.get(Number(selectedThreadId)) ?? []
  }, [selectedThreadId, selectedThread, watchersByThread])

  const defaultPendingParticipants = useMemo(
    () =>
      projectUsers.map((user: any) => ({
        id: Number(user.id),
        full_name: user.full_name || null,
        email: user.email || null,
        photo: user.photo || null,
        auth_user_id: user.auth_user_id || String(user.id),
        value: String(user.id),
        label: user.full_name || user.email || `User #${user.id}`,
      })),
    [projectUsers],
  )

  const editablePendingParticipants = useMemo(
    () => (pendingParticipants.length > 0 ? pendingParticipants : defaultPendingParticipants),
    [pendingParticipants, defaultPendingParticipants],
  )

  const groupedMentionItems = useMemo(
    () => groupMentionsByTime([...mentions].sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt))),
    [mentions],
  )

  const mergedFeedItems = useMemo(() => {
    if (!isPreview) return [] as MergedFeedItem[]
    const items: MergedFeedItem[] = []
    if (feedFilter === "all" || feedFilter === "updates") {
      for (const log of activityLogs) {
        const createdAt = log.timestamp ?? log.created_at
        items.push({
          kind: "update",
          key: `update-${log.uid}`,
          createdAt,
          authorName:
            log.assigned_to_name
            ?? log.assigned_to_email
            ?? (log.user_id != null ? `User ${log.user_id}` : "System"),
          authorPhoto: log.assigned_to_photo ?? null,
          body: formatActivityLine(log),
        })
      }
    }
    if (feedFilter === "all" || feedFilter === "comments") {
      for (const mention of mentions) {
        items.push({
          kind: "comment",
          key: `comment-${mention.id}-${mention.threadId}`,
          createdAt: mention.createdAt,
          authorName: mention.author.name,
          authorPhoto: mention.author.photo,
          body: toReplyPreview(mention.body),
          mention,
        })
      }
    }
    const sorted = items.sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt))
    if (typeof previewMaxRows === "number" && previewMaxRows > 0) {
      return sorted.slice(0, previewMaxRows)
    }
    return sorted
  }, [activityLogs, feedFilter, isPreview, mentions, previewMaxRows])

  const refreshAll = useCallback(async () => {
    loadedOffsetsRef.current.clear()
    await Promise.all([
      loadMentions(0),
      loadProjectCommentThreadSummaries(projectIdNum),
    ])
    await queryClient.invalidateQueries({
      queryKey: ["project-comment-thread-watchers", projectIdNum],
    })
  }, [loadMentions, loadProjectCommentThreadSummaries, projectIdNum, queryClient])

  const handleViewThreadHistory = useCallback(async () => {
    setIsAddingThread(false)
    setSelectedThreadId(null)
    setViewMode("threads")
    await loadProjectCommentThreadSummaries(projectIdNum)
  }, [projectIdNum, loadProjectCommentThreadSummaries])

  const handleAddThread = useCallback(() => {
    setIsAddingThread(true)
    setViewMode("thread")
    setSelectedThreadId(null)
    setPendingParticipants(defaultPendingParticipants)
    setRemovedParticipants([])
  }, [defaultPendingParticipants])

  const handleDeleteThread = useCallback(
    async (threadId: number) => {
      setIsDeleting(true)
      try {
        const { error } = await supabase.from("threads").delete().eq("id", threadId)
        if (error) throw error
        if (selectedThreadId === threadId) {
          setSelectedThreadId(null)
          setViewMode("all")
        }
        await refreshAll()
      } finally {
        setIsDeleting(false)
      }
    },
    [refreshAll, selectedThreadId, supabase],
  )

  const handleSelectThread = useCallback(
    async (threadId: number | null) => {
      setSelectedThreadId(threadId)
      setIsAddingThread(false)
      if (threadId) {
        setViewMode("thread")
        await loadProjectCommentThreads(projectIdNum)
      } else {
        setViewMode("all")
        setReplyTo(null)
      }
    },
    [projectIdNum, loadProjectCommentThreads],
  )

  const threadHeaderActions = useMemo(() => {
    if (!isPreview || hideThreadToolbar) return null
    return (
      <TaskCommentsHeaderRow
        handleAddThread={handleAddThread}
        taskIdNum={projectIdNum}
        threadsList={hydratedThreadsList as any[]}
        selectedThreadId={selectedThreadId}
        setSelectedThreadId={(id) => {
          handleSelectThread(id).catch((error: any) => {
            toast({
              title: "Failed to load thread",
              description: error?.message || "Unable to load project thread details.",
              variant: "destructive",
            })
          })
        }}
        setIsAddingThread={setIsAddingThread}
        isThreadListLoading={isLoadingSummaries}
        handleViewThreadHistory={() => {
          handleViewThreadHistory().catch((error: any) => {
            toast({
              title: "Failed to load thread history",
              description: error?.message || "Unable to load project thread summaries.",
              variant: "destructive",
            })
          })
        }}
      />
    )
  }, [
    handleAddThread,
    handleSelectThread,
    handleViewThreadHistory,
    hideThreadToolbar,
    hydratedThreadsList,
    isLoadingSummaries,
    isPreview,
    projectIdNum,
    selectedThreadId,
  ])

  useEffect(() => {
    if (!onHeaderActionsChange) return
    onHeaderActionsChange(threadHeaderActions)
    return () => onHeaderActionsChange(null)
  }, [onHeaderActionsChange, threadHeaderActions])

  const handleMentionsScroll = useCallback(async () => {
    if (viewMode !== "all") return
    const container = mentionsContainerRef.current
    if (!container) return
    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 300
    if (!nearBottom) return

    const shouldLoadActivity =
      isPreview
      && (feedFilter === "all" || feedFilter === "updates")
      && hasMoreActivity
      && !isLoadingMoreActivity
    if (shouldLoadActivity) {
      onLoadMoreActivity?.()
    }

    const shouldLoadMentions =
      feedFilter !== "updates"
      && !isLoadingMentionsRef.current
      && hasMoreMentions
      && mentions.length > 0
    if (shouldLoadMentions) {
      await loadMentions(mentionsOffset)
    }
  }, [
    viewMode,
    isPreview,
    feedFilter,
    hasMoreActivity,
    isLoadingMoreActivity,
    onLoadMoreActivity,
    hasMoreMentions,
    mentions.length,
    mentionsOffset,
    loadMentions,
  ])

  if (!Number.isFinite(projectIdNum)) {
    return <div className="p-4 text-sm text-red-600">Invalid project id for comments.</div>
  }

  return (
    <div
      className={
        isPreview
          ? "flex min-h-0 flex-col"
          : "flex h-full min-h-0 flex-col p-6"
      }
    >
      {isPreview ? null : <h2 className="mb-4 text-xl font-semibold">Comments</h2>}
      {!isPreview && !hideThreadToolbar ? (
        <TaskCommentsHeaderRow
          handleAddThread={handleAddThread}
          taskIdNum={projectIdNum}
          threadsList={hydratedThreadsList as any[]}
          selectedThreadId={selectedThreadId}
          setSelectedThreadId={(id) => {
            handleSelectThread(id).catch((error: any) => {
              toast({
                title: "Failed to load thread",
                description: error?.message || "Unable to load project thread details.",
                variant: "destructive",
              })
            })
          }}
          setIsAddingThread={setIsAddingThread}
          isThreadListLoading={isLoadingSummaries}
          handleViewThreadHistory={() => {
            handleViewThreadHistory().catch((error: any) => {
              toast({
                title: "Failed to load thread history",
                description: error?.message || "Unable to load project thread summaries.",
                variant: "destructive",
              })
            })
          }}
        />
      ) : null}

      <div
        ref={mentionsContainerRef}
        className={
          isPreview
            ? hideMentionsList
              ? "hidden"
              : "min-h-0 overflow-y-auto overflow-x-hidden pr-1"
            : "min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1"
        }
        onScroll={() => {
          handleMentionsScroll().catch(() => {})
        }}
      >
        {isPreview && viewMode === "all" && !isAddingThread ? (
          <ul className="flex flex-col py-1">
            {mergedFeedItems.length === 0 && !isLoadingMentions ? (
              <li className="py-2 text-sm text-gray-500">
                {feedFilter === "updates" ? "No activity yet." : "No updates or comments yet."}
              </li>
            ) : null}
            {mergedFeedItems.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 py-1.5 min-h-0 text-left transition-colors hover:bg-gray-50"
                  disabled={item.kind === "update"}
                  onClick={() => {
                    if (item.kind !== "comment") return
                    setReplyTo({
                      id: item.mention.id,
                      author: item.authorName,
                      preview: item.body,
                    })
                    handleSelectThread(item.mention.threadId).catch(() => {})
                  }}
                >
                  <UserAvatar
                    name={item.authorName}
                    photoUrl={getImageUrl(item.authorPhoto)}
                    size="xs"
                    className="h-7 w-7"
                  />
                  <div className="min-w-0 flex-1 overflow-hidden text-sm text-gray-700">
                    <span className="block truncate">
                      <span className="font-medium text-gray-900">{item.authorName}</span>
                      <span className="text-gray-500"> · {item.body}</span>
                    </span>
                  </div>
                  <div
                    className="shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground"
                    title={
                      item.createdAt
                        ? format(new Date(item.createdAt), "yyyy-MM-dd HH:mm")
                        : undefined
                    }
                  >
                    {getProjectActivityRelativeTimeLabel(item.createdAt)}
                  </div>
                </button>
              </li>
            ))}
            {isLoadingMentions || isLoadingMoreActivity ? (
              <li className="py-2 text-xs text-gray-500">Loading…</li>
            ) : null}
          </ul>
        ) : null}

        {!isPreview && viewMode === "all" && !isAddingThread ? (
          <div className="space-y-4 py-2 pr-1">
            {groupedMentionItems.length === 0 && !isLoadingMentions ? (
              <div className="text-sm text-gray-500">
                No comments yet.
                <br />
                Start a thread to discuss this project or its tasks.
              </div>
            ) : null}

            {groupedMentionItems.map((group) => (
              <div key={group.id} className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {group.label}
                </h4>
                {group.items.map((mention) => {
                  const preview = toReplyPreview(mention.body)
                  const createdAt = mention.createdAt
                  const relative = createdAt
                    ? formatDistanceToNow(new Date(createdAt), { addSuffix: true })
                    : "—"
                  const shortDate = createdAt
                    ? format(new Date(createdAt), "HH:mm · MM/yy")
                    : ""
                  return (
                    <div key={`mention-${mention.id}-${mention.threadId}`}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 py-1.5 min-h-0 text-left transition-colors hover:bg-gray-50"
                        onClick={() => {
                          setReplyTo({
                            id: mention.id,
                            author: mention.author.name,
                            preview,
                          })
                          handleSelectThread(mention.threadId).catch(() => {})
                        }}
                      >
                        <UserAvatar
                          name={mention.author.name}
                          photoUrl={getImageUrl(mention.author.photo)}
                          size="xs"
                          className="h-7 w-7"
                        />
                        <div className="min-w-0 flex-1 overflow-hidden text-sm text-gray-700">
                          <span className="block truncate">
                            <span className="font-medium text-gray-900">{mention.author.name}</span>
                            <span className="text-gray-500"> · {preview}</span>
                            {mention.taskId ? (
                              <span className="text-gray-400">
                                {" "}
                                · {mention.taskTitle || `Task #${mention.taskId}`}
                              </span>
                            ) : null}
                          </span>
                        </div>
                        <div className="shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground">
                          <span className="block">{relative}</span>
                          {shortDate ? <span className="block">{shortDate}</span> : null}
                        </div>
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}

            {isLoadingMentions ? (
              <div className="text-xs text-gray-500">Loading mentions...</div>
            ) : null}
            {!isLoadingMentions && !hasMoreMentions && groupedMentionItems.length > 0 ? (
              <div className="text-xs text-gray-400">No more mentions</div>
            ) : null}
          </div>
        ) : null}

        {viewMode === "threads" && !isAddingThread ? (
          <div className="space-y-2 p-3">
            {hydratedThreadsList.length === 0 && !isLoadingSummaries ? (
              <div className="text-sm text-gray-500">No threads yet.</div>
            ) : null}
            {hydratedThreadsList.map((thread: any) => {
              const latest = latestMentionsByThread[Number(thread.id)]
              const timestamp = latest?.created_at
                ? formatDistanceToNow(new Date(latest.created_at), { addSuffix: true })
                : thread.created_at
                ? format(new Date(thread.created_at), "PP")
                : "Unknown time"
              const contextLabel =
                thread.task_id ? `Task: ${thread.task_title || `#${thread.task_id}`}` : "Project"
              return (
                <button
                  key={thread.id}
                  type="button"
                  className="w-full rounded-md border border-gray-200 p-3 text-left hover:bg-gray-50"
                  onClick={() => {
                    handleSelectThread(Number(thread.id)).catch(() => {})
                  }}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {thread.title || "Untitled thread"}
                    </div>
                    <span className="text-xs text-gray-500">{timestamp}</span>
                  </div>
                  <div className="mb-1 line-clamp-2 text-xs text-gray-600">
                    {latest?.comment || thread.latest_comment || "No comments yet"}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {latest?.users ? (
                      <UserAvatar
                        name={latest.users.full_name || latest.users.email || "User"}
                        photoUrl={getImageUrl(latest.users.photo)}
                        size="sm"
                      />
                    ) : null}
                    <span>{latest?.users?.full_name || latest?.users?.email || "Unknown user"}</span>
                    <span>-</span>
                    <span>{contextLabel}</span>
                    {typeof thread.mention_count === "number" ? (
                      <>
                        <span>-</span>
                        <span>{thread.mention_count} comments</span>
                      </>
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>
        ) : null}

        {viewMode === "thread" && selectedThreadId && !isAddingThread && publicUserId ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="px-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-gray-600"
                onClick={() => {
                  setViewMode("all")
                  setSelectedThreadId(null)
                  setIsAddingThread(false)
                  setReplyTo(null)
                }}
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                Back
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              <ThreadedRealtimeChat
                key={String(selectedThreadId)}
                threadId={selectedThreadId}
                currentUserId={publicUserId}
                currentUserName={currentUserName || undefined}
                currentUserAvatar={currentUser?.photo || undefined}
                currentUserEmail={currentUser?.email || undefined}
                currentPublicUserId={publicUserId}
                hideInput
                initialMessages={allMentionsFromThreads.filter((mention) => mention.thread_id === selectedThreadId)}
                onReplySelected={(payload) => setReplyTo(payload)}
              />
            </div>
          </div>
        ) : null}
      </div>

      {viewMode !== "threads" ? (
        <>
          <div
            className={
              isPreview
                ? "mt-2 border-t border-gray-100 bg-white pt-3"
                : "sticky bottom-0 z-20 mt-2 border-t bg-white pt-3"
            }
          >
            <div className={`${CHAT_CONTENT_COLUMN_CLASS} px-4 pb-3`}>
            <div className="mb-2 flex items-start gap-2">
              <UserAvatar
                name={currentUserName || currentUser?.full_name || currentUser?.email || "You"}
                photoUrl={getImageUrl(currentUser?.photo || null)}
                size="sm"
                className="mt-3"
              />
              <div className="min-w-0 flex-1">
                <AddCommentInput
                  key={`project-comment-input-${selectedThreadId ?? "new"}`}
                  taskId={Number(selectedThread?.task_id) || 0}
                  projectId={projectIdNum}
                  threadScope="project"
                  threadId={isAddingThread ? null : selectedThreadId}
                  pendingParticipants={selectedThreadId ? pendingParticipants : editablePendingParticipants}
                  setPendingParticipants={setPendingParticipants}
                  replyTo={replyTo}
                  onClearReply={() => setReplyTo(null)}
                  onCommentAdded={refreshAll}
                  onThreadCreated={(thread) => {
                    if (typeof thread.id === "number") {
                      setSelectedThreadId(thread.id)
                      setViewMode("thread")
                      setIsAddingThread(false)
                      setPendingParticipants([])
                    }
                  }}
                />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="shrink-0 text-xs text-gray-500">We'll notify</span>
              <div className="min-w-0 flex-1 overflow-hidden">
                {selectedThreadId ? (
                  <ThreadParticipantsInline
                    threadId={selectedThreadId}
                    projectId={projectIdNum}
                    allowRemove
                    participants={participants}
                    allProjectUsers={projectUsers}
                    currentUserId={publicUserId}
                    onParticipantsChanged={refreshAll}
                  />
                ) : (
                  <ThreadParticipantsInline
                    pendingMode
                    pendingParticipants={editablePendingParticipants}
                    setPendingParticipants={setPendingParticipants}
                    removedParticipants={removedParticipants}
                    setRemovedParticipants={setRemovedParticipants}
                    participants={projectUsers}
                    allProjectUsers={projectUsers}
                    currentUserId={publicUserId}
                    projectId={projectIdNum}
                  />
                )}
              </div>
              {selectedThreadId ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setShowDeleteThreadDialog(true)}
                >
                  Delete thread
                </Button>
              ) : null}
            </div>
            </div>
          </div>
        </>
      ) : null}

      <Dialog open={showDeleteThreadDialog} onOpenChange={setShowDeleteThreadDialog}>
        <DialogContent>
          <DialogTitle>Delete Thread</DialogTitle>
          <div className="py-2 text-sm text-gray-600">
            Are you sure you want to delete this thread? This cannot be undone.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteThreadDialog(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting || !selectedThreadId}
              onClick={async () => {
                if (!selectedThreadId) return
                try {
                  await handleDeleteThread(selectedThreadId)
                  setShowDeleteThreadDialog(false)
                  toast({
                    title: "Thread deleted",
                    description: "The thread was deleted successfully.",
                  })
                } catch (error: any) {
                  toast({
                    title: "Failed to delete thread",
                    description: error?.message || "Unable to delete thread.",
                    variant: "destructive",
                  })
                }
              }}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isLoadingThreads ? (
        <div className="mt-2 text-xs text-gray-500">Loading thread messages...</div>
      ) : null}
    </div>
  )
}

