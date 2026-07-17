"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { AlertCircle, Loader2, Reply } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { useQuery } from "@tanstack/react-query"
import { useCurrentUserStore } from "../../store/current-user"
import {
  useUserSharedMentionsInfinite,
  type UserSharedMentionRow,
} from "../../hooks/use-user-shared-comment-threads"
import type { UserTask } from "../../lib/services/users"
import { getImageUrl } from "../../lib/public-media"
import { UserAvatar } from "../UserAvatar"
import { AddCommentInput } from "../comments-section/add-comment-input"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"

const CONTEXT_LABELS: Record<UserSharedMentionRow["thread_context_type"], string> = {
  direct: "Direct thread",
  general: "General thread",
  project: "Project thread",
  task: "Task thread",
}

function toNumberList(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => Number(entry))
      .filter((id) => Number.isFinite(id) && id > 0)
  }
  return []
}

function dedupeParticipants(
  participants: Array<{ id: number; full_name: string | null; photo: string | null; email: string | null }>,
) {
  const seen = new Set<number>()
  const result: Array<{ id: number; full_name: string | null; photo: string | null; email: string | null }> = []
  for (const participant of participants) {
    const id = Number(participant.id)
    if (!Number.isFinite(id) || seen.has(id)) continue
    seen.add(id)
    result.push(participant)
  }
  return result
}

function toCommentExcerpt(html: string | null | undefined): string {
  const plain = (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
  return plain
}

export function UserSharedCommentsTab({
  profileUserId,
  isActive,
  onOpenTaskKeepingDetail,
}: {
  profileUserId: number
  isActive: boolean
  onOpenTaskKeepingDetail?: (task: UserTask) => void
}) {
  const supabase = useMemo(() => createClientComponentClient(), [])
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentUserId = useCurrentUserStore((s) => s.publicUserId)
  const currentUserName = useCurrentUserStore((s) => s.fullName)
  const currentUserAvatar = useCurrentUserStore((s) => {
    const metadata = s.userMetadata || {}
    return (
      metadata.photo ||
      metadata.avatar_url ||
      metadata.picture ||
      metadata.profile_image ||
      metadata.profile_photo ||
      null
    )
  })

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [composerThreadId, setComposerThreadId] = useState<number | null>(null)
  const [replyTarget, setReplyTarget] = useState<{
    threadId: number
    replyTo: { id: number; author?: string; preview: string }
  } | null>(null)

  const openRightPane = useCallback(
    (patch: Record<string, string | number | null | undefined>, options?: { replace?: boolean }) => {
      const nextParams = new URLSearchParams(searchParams.toString())
      Object.entries(patch).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "") {
          nextParams.delete(key)
          return
        }
        nextParams.set(key, String(value))
      })
      const nextUrl = `${pathname}?${nextParams.toString()}`
      if (options?.replace) {
        router.replace(nextUrl, { scroll: false })
        return
      }
      router.push(nextUrl, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useUserSharedMentionsInfinite(currentUserId ?? null, profileUserId, isActive && !!currentUserId)

  const mentions = useMemo(() => (data?.pages ?? []).flat(), [data?.pages])

  const onLoadMore = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return
    void fetchNextPage()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          hasNextPage &&
          !isFetchingNextPage &&
          mentions.length > 0 &&
          isActive
        ) {
          onLoadMore()
        }
      },
      { root: null, threshold: 0.1, rootMargin: "600px 0px" },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, isActive, mentions.length, onLoadMore])

  const openTaskFromThread = useCallback(
    (taskId: number) => {
      if (onOpenTaskKeepingDetail) {
        onOpenTaskKeepingDetail({
          id: taskId,
          entity_id: taskId,
        } as unknown as UserTask)
      }
      openRightPane({
        tab: "comments",
        detailType: "user",
        detailId: profileUserId,
        rightView: "task-details",
        rightTaskId: taskId,
        rightThreadId: null,
        rightMentionId: null,
        rightProjectId: null,
      })
    },
    [onOpenTaskKeepingDetail, openRightPane, profileUserId],
  )

  const openProjectFromThread = useCallback(
    (projectId: number) => {
      openRightPane({
        tab: "comments",
        detailType: "user",
        detailId: profileUserId,
        rightView: "project-details",
        rightProjectId: projectId,
        rightThreadId: null,
        rightMentionId: null,
        rightTaskId: null,
      })
    },
    [openRightPane, profileUserId],
  )

  const openMentionThread = useCallback(
    (mention: UserSharedMentionRow, options?: { focusComposer?: boolean }) => {
      console.log("open mention thread", mention.thread_id, mention.mention_id)
      openRightPane({
        rightView: "details",
        tab: "comments",
        detailType: "mention",
        detailId: mention.mention_id,
        mentionId: mention.mention_id,
        rightThreadId: null,
        rightMentionId: null,
        rightComposerFocus: options?.focusComposer ? "1" : null,
      })
    },
    [openRightPane],
  )

  const currentUserAvatarUrl = getImageUrl(currentUserAvatar || null)
  const activeComposerThreadId = replyTarget?.threadId ?? composerThreadId

  const mentionRows = useMemo(() => {
    return [...mentions].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
      return bTime - aTime
    })
  }, [mentions])

  const taskIdsMissingLabels = useMemo(
    () =>
      Array.from(
        new Set(
          mentionRows
            .filter((row) => row.task_id && !row.task_title?.trim())
            .map((row) => Number(row.task_id))
            .filter((id) => Number.isFinite(id) && id > 0),
        ),
      ),
    [mentionRows],
  )

  const projectIdsMissingLabels = useMemo(
    () =>
      Array.from(
        new Set(
          mentionRows
            .filter((row) => row.project_id && !row.project_name?.trim())
            .map((row) => Number(row.project_id))
            .filter((id) => Number.isFinite(id) && id > 0),
        ),
      ),
    [mentionRows],
  )

  const { data: hydratedTaskTitles = new Map<number, string>() } = useQuery({
    queryKey: ["user-comments-task-labels", taskIdsMissingLabels.join("|")],
    enabled: taskIdsMissingLabels.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title")
        .in("id", taskIdsMissingLabels)
      if (error) throw error
      const map = new Map<number, string>()
      for (const row of (data ?? []) as Array<{ id: number; title: string | null }>) {
        const id = Number(row.id)
        if (!Number.isFinite(id)) continue
        if (row.title?.trim()) map.set(id, row.title.trim())
      }
      return map
    },
  })

  const { data: hydratedProjectNames = new Map<number, string>() } = useQuery({
    queryKey: ["user-comments-project-labels", projectIdsMissingLabels.join("|")],
    enabled: projectIdsMissingLabels.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name")
        .in("id", projectIdsMissingLabels)
      if (error) throw error
      const map = new Map<number, string>()
      for (const row of (data ?? []) as Array<{ id: number; name: string | null }>) {
        const id = Number(row.id)
        if (!Number.isFinite(id)) continue
        if (row.name?.trim()) map.set(id, row.name.trim())
      }
      return map
    },
  })

  if (!currentUserId) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-12 text-center">
        <p className="text-sm text-gray-600">Sign in to see comments shared with this user.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Loading shared mentions…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-red-200 bg-red-50 px-6 py-12 text-center">
        <AlertCircle className="h-10 w-10 text-red-500" aria-hidden />
        <div className="space-y-1">
          <p className="text-sm font-medium text-red-800">Could not load comments</p>
          <p className="text-xs text-red-700">{error instanceof Error ? error.message : String(error)}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="space-y-3 pb-4">
        {mentionRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white py-12 text-center">
            <p className="text-sm text-gray-500">No comments with this user yet.</p>
          </div>
        ) : (
          <>
            {mentionRows.map((row) => {
              const createdAtLabel = row.created_at
                ? formatDistanceToNow(new Date(row.created_at), { addSuffix: true })
                : "Unknown time"
              const participants = dedupeParticipants([
                ...(row.participants ?? []),
                ...toNumberList(row.participant_user_ids).map((id) => ({
                  id,
                  full_name: null,
                  photo: null,
                  email: null,
                })),
              ]).slice(0, 6)
              const authorName =
                row.mention_created_by_name ||
                row.mention_created_by_email ||
                "Unknown user"
              const excerpt = toCommentExcerpt(row.comment)
              const taskLabel =
                (row.task_id
                  ? row.task_title?.trim() || hydratedTaskTitles.get(Number(row.task_id)) || ""
                  : "") || "Task"
              const projectLabel =
                (row.project_id
                  ? row.project_name?.trim() || hydratedProjectNames.get(Number(row.project_id)) || ""
                  : "") || "Project"
              return (
              <div
                key={`${row.thread_id}-${row.mention_id}`}
                role="button"
                tabIndex={0}
                className="w-full rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2"
                onClick={() => openMentionThread(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    openMentionThread(row)
                  }
                }}
              >
                <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                  <UserAvatar
                    name={authorName}
                    photoUrl={getImageUrl(row.mention_created_by_photo)}
                    size="sm"
                  />
                  <span className="font-medium text-gray-900">{authorName}</span>
                  <span>- {createdAtLabel}</span>
                </div>

                <p className="line-clamp-4 break-words text-sm text-gray-800">
                  {excerpt || "No message content"}
                </p>

                {row.attachment ? (
                  <a
                    href={row.attachment}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs text-blue-600 underline"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      window.open(row.attachment ?? "", "_blank", "noopener,noreferrer")
                    }}
                  >
                    Attachment
                  </a>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {row.task_id ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        openTaskFromThread(row.task_id!)
                      }}
                    >
                      <Badge variant="outline" className="text-[11px]">
                        {taskLabel}
                      </Badge>
                    </button>
                  ) : null}
                  {row.project_id ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        openProjectFromThread(row.project_id!)
                      }}
                    >
                      <Badge variant="secondary" className="text-[11px]">
                        {projectLabel}
                      </Badge>
                    </button>
                  ) : null}
                  {!row.task_id && !row.project_id ? (
                    <Badge variant="outline" className="text-[11px]">
                      {CONTEXT_LABELS[row.thread_context_type]}
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                  <span className="shrink-0">Participants</span>
                  <div className="flex min-w-0 items-center">
                    {participants.map((participant) => (
                      <div key={`${row.thread_id}-${participant.id}`} className="-ml-1 first:ml-0">
                        <UserAvatar
                          name={participant.full_name || participant.email || "User"}
                          photoUrl={getImageUrl(participant.photo)}
                          size="sm"
                        />
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-6 w-6 p-0"
                    aria-label="Reply to thread"
                    title="Reply to thread"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setReplyTarget({
                        threadId: Number(row.thread_id),
                        replyTo: {
                          id: Number(row.mention_id),
                          author: authorName,
                          preview: excerpt.slice(0, 120) || "message",
                        },
                      })
                    }}
                  >
                    <Reply className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )})}
            <div ref={sentinelRef} className="h-4 w-full shrink-0" aria-hidden />
            {isFetchingNextPage ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="sticky bottom-0 z-20 mt-2 border-t bg-white pt-3">
        <div className="mb-2 flex items-start gap-2">
          <UserAvatar
            name={currentUserName || "You"}
            photoUrl={currentUserAvatarUrl}
            size="sm"
            className="mt-3"
          />
          <div className="min-w-0 flex-1">
            <AddCommentInput
              key={`user-comments-pinned-input-${profileUserId}-${activeComposerThreadId ?? "new"}-${replyTarget?.replyTo.id ?? "none"}`}
              taskId={0}
              threadScope="direct"
              targetUserId={profileUserId}
              threadId={activeComposerThreadId}
              compactMode
              replyTo={replyTarget?.replyTo ?? null}
              onClearReply={() => setReplyTarget(null)}
              onCommentAdded={() => {
                setReplyTarget(null)
                if (!activeComposerThreadId) {
                  setComposerThreadId(null)
                }
                void refetch()
              }}
              onThreadCreated={(thread) => {
                const nextThreadId = Number(thread.id)
                if (!Number.isFinite(nextThreadId)) return
                setComposerThreadId(nextThreadId)
                openRightPane({
                  tab: "comments",
                  detailType: "user",
                  detailId: profileUserId,
                  rightView: "thread-chat",
                  rightThreadId: nextThreadId,
                  rightComposerFocus: "1",
                })
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
