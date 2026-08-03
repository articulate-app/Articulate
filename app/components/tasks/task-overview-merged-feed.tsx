"use client"

import React, { useMemo } from "react"
import { Reply } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { cn } from "@/lib/utils"
import { getImageUrl } from "@/lib/public-media"
import { useViewUsersCanSee } from "../../hooks/use-view-users-can-see"
import { UserAvatar } from "../UserAvatar"
import { ActivityRowTimestamp, parseActivityDate } from "../activity-row-timestamp"
import { formatTaskActivityDescription } from "../task-activity/task-activity-timeline"

type FeedItem =
  | {
      kind: "activity"
      id: string
      createdAt: string
      activity: {
        id: number
        task_id: number
        created_by: number
        action: string
        task_parameter: string | null
        new_value: string | null
        created_at: string
      }
    }
  | {
      kind: "comment"
      id: string
      createdAt: string
      mention: any
      threadId: number
    }

function stripHtmlPreview(value: string): string {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function resolveMentionAuthor(mention: any, thread?: any): any {
  const user =
    mention?.users
    ?? mention?.user
    ?? mention?.author
    ?? mention?.created_by_user
    ?? null
  return {
    ...(user ?? {}),
    full_name:
      user?.full_name
      ?? user?.display_name
      ?? user?.name
      ?? user?.email
      ?? mention?.author_name
      ?? "Unknown user",
    photo: user?.photo ?? user?.photo_url ?? user?.avatar_url ?? null,
  }
}

type TaskOverviewMergedFeedProps = {
  taskId: number
  allMentions: any[]
  threadsList: any[]
  filterThreadId?: number | null
  includeActivities?: boolean
  includeComments?: boolean
  previewLimit: number
  onSelectThread: (threadId: number) => void
  className?: string
}

export function TaskOverviewMergedFeed({
  taskId,
  allMentions,
  threadsList,
  filterThreadId = null,
  includeActivities = true,
  includeComments = true,
  previewLimit,
  onSelectThread,
  className,
}: TaskOverviewMergedFeedProps) {
  const supabase = useMemo(() => createClientComponentClient(), [])
  const { data: users = [] } = useViewUsersCanSee(true)

  const userMap = useMemo(() => {
    const map: Record<number, { name: string; photoUrl: string | null }> = {}
    for (const user of users) {
      map[user.id] = {
        name: user.full_name ?? "",
        photoUrl: getImageUrl(user.photo),
      }
    }
    return map
  }, [users])

  const threadById = useMemo(() => {
    const map = new Map<number, any>()
    for (const thread of threadsList ?? []) {
      const threadId = Number(thread?.id)
      if (Number.isFinite(threadId)) map.set(threadId, thread)
    }
    return map
  }, [threadsList])

  const { data: componentTitleById = new Map<string, string>() } = useQuery({
    queryKey: ["task-activity-component-titles", taskId],
    enabled: Number.isFinite(taskId) && taskId > 0 && includeActivities,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_channel_components")
        .select("id, custom_title")
        .eq("task_id", taskId)
      if (error || !Array.isArray(data)) return new Map<string, string>()
      const map = new Map<string, string>()
      for (const row of data) {
        const id = typeof row?.id === "string" ? row.id.trim() : ""
        const title = typeof row?.custom_title === "string" ? row.custom_title.trim() : ""
        if (!id || !title) continue
        map.set(id, title)
      }
      return map
    },
    staleTime: 60_000,
  })

  const { data: activities = [] } = useQuery({
    queryKey: ["task-overview-activity-logs", taskId],
    enabled: Number.isFinite(taskId) && taskId > 0 && includeActivities,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_activity_logs")
        .select("id, task_id, created_by, action, task_parameter, new_value, created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true })
        .limit(100)
      if (error) throw error
      return (data ?? []) as Array<{
        id: number
        task_id: number
        created_by: number
        action: string
        task_parameter: string | null
        new_value: string | null
        created_at: string
      }>
    },
    staleTime: 30_000,
  })

  const items = useMemo(() => {
    const next: FeedItem[] = []

    if (includeActivities) {
      for (const activity of activities) {
        next.push({
          kind: "activity",
          id: `activity-${activity.id}`,
          createdAt: activity.created_at,
          activity,
        })
      }
    }

    if (includeComments) {
      for (const mention of allMentions ?? []) {
        const threadId = Number(mention?.thread_id)
        const mentionId = Number(mention?.id)
        if (!Number.isFinite(threadId) || !Number.isFinite(mentionId)) continue
        if (filterThreadId != null && threadId !== Number(filterThreadId)) continue
        next.push({
          kind: "comment",
          id: `comment-${mentionId}`,
          createdAt: mention?.created_at ?? "",
          mention,
          threadId,
        })
      }
    }

    next.sort((a, b) => {
      const aTs = parseActivityDate(a.createdAt)?.getTime() ?? 0
      const bTs = parseActivityDate(b.createdAt)?.getTime() ?? 0
      if (aTs !== bTs) return aTs - bTs
      return a.id.localeCompare(b.id)
    })

    return next
  }, [activities, allMentions, filterThreadId, includeActivities, includeComments])

  const visibleItems = items.length > previewLimit
    ? items.slice(-previewLimit)
    : items

  if (visibleItems.length === 0) {
    return (
      <div className={cn("py-6 text-center text-sm text-muted-foreground", className)}>
        {includeComments && !includeActivities
          ? "No comments yet."
          : includeActivities && !includeComments
            ? "No activity recorded for this task yet."
            : "No activity or comments yet."}
      </div>
    )
  }

  return (
    <ul className={cn("flex flex-col", className)}>
      {visibleItems.map((item) => {
        if (item.kind === "activity") {
          const info = userMap[item.activity.created_by]
          const name = info?.name?.trim() || `User #${item.activity.created_by}`
          const photoUrl = info?.photoUrl ?? null
          const description = formatTaskActivityDescription(
            item.activity,
            name,
            componentTitleById,
          )
          const remainder = description.startsWith(name)
            ? description.slice(name.length)
            : ` ${description}`

          return (
            <li key={item.id} className="flex items-center gap-2.5 py-2">
              <UserAvatar name={name} photoUrl={photoUrl} size="xs" className="!h-5 !w-5 !min-h-5 !min-w-5 text-[9px]" />
              <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm leading-5">
                <p className="min-w-0 truncate text-gray-700">
                  <span className="font-medium text-gray-900">{name}</span>
                  {remainder}
                </p>
                <span className="shrink-0 text-gray-300" aria-hidden>
                  ·
                </span>
                <ActivityRowTimestamp value={item.createdAt} />
              </div>
            </li>
          )
        }

        const thread = threadById.get(item.threadId)
        const author = resolveMentionAuthor(item.mention, thread)
        const displayName = String(author?.full_name ?? "Unknown user")
        const photoUrl = getImageUrl(author?.photo ?? null)
        const plainPreview = stripHtmlPreview(String(item.mention?.comment ?? ""))

        return (
          <li key={item.id} className="group flex items-start gap-2.5 py-2">
            <UserAvatar name={displayName} photoUrl={photoUrl} size="xs" className="mt-0.5 !h-5 !w-5 !min-h-5 !min-w-5 text-[9px]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSelectThread(item.threadId)}
                    className="truncate text-left text-sm font-medium leading-5 text-gray-900"
                  >
                    {displayName}
                  </button>
                  <span className="shrink-0 text-gray-300" aria-hidden>
                    ·
                  </span>
                  <ActivityRowTimestamp value={item.createdAt} />
                </div>
                <button
                  type="button"
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 md:opacity-0 md:group-hover:opacity-100"
                  aria-label="Reply in thread"
                  title="Reply in thread"
                  onClick={() => onSelectThread(item.threadId)}
                >
                  <Reply className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => onSelectThread(item.threadId)}
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
  )
}

export function countMergedFeedItems(args: {
  activityCount: number
  mentionCount: number
  includeActivities: boolean
  includeComments: boolean
}) {
  return (
    (args.includeActivities ? args.activityCount : 0)
    + (args.includeComments ? args.mentionCount : 0)
  )
}
