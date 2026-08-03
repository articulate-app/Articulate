import React, { useMemo, useCallback, useState } from "react"
import { InfiniteList } from "../ui/infinite-list"
import { SupabaseTableData } from "../../../hooks/use-infinite-query"
import { z } from "zod"
import { cn } from "@/lib/utils"
import { getImageUrl } from "@/lib/public-media"
import { useViewUsersCanSee } from "../../hooks/use-view-users-can-see"
import { useQuery } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import {
  type OverviewFeedSort,
  sortByUserLabel,
} from "../tasks/overview-feed-sort"
import { ActivityRowTimestamp } from "../activity-row-timestamp"

export interface TaskActivityTimelineProps {
  taskId: number
  className?: string
  /** Overview preview: cap visible rows and hide expand toggle. */
  compact?: boolean
  previewLimit?: number
  /** Client-side sort only — does not change the fetch query. */
  clientSort?: OverviewFeedSort
}

// Zod schema for validation (optional, for future extensibility)
const activitySchema = z.object({
  id: z.number(),
  task_id: z.number(),
  created_by: z.number(),
  action: z.string(),
  task_parameter: z.string().nullable(),
  new_value: z.string().nullable(),
  created_at: z.string(),
})

type TaskActivity = z.infer<typeof activitySchema>

function parseJsonObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

function formatTaskActivityLogEntry(
  activity: TaskActivity,
  userName: string | null,
  componentTitleById: Map<string, string>
): string | null {
  const user = userName || `User #${activity.created_by}`

  if (activity.action === "ai_autopilot_component_generated") {
    const payload = parseJsonObject(activity.new_value)
    const rawCount = payload?.component_count
    const parsedCount = typeof rawCount === "number" ? rawCount : Number(rawCount)
    const safeCount = Number.isFinite(parsedCount) && parsedCount > 0 ? Math.floor(parsedCount) : 1
    if (safeCount > 1) {
      return `${user} AI created ${safeCount} components`
    }

    const inlineTitleRaw = payload?.component_title ?? payload?.title ?? payload?.component_name
    const inlineTitle = typeof inlineTitleRaw === "string" ? inlineTitleRaw.trim() : ""
    if (inlineTitle) {
      return `${user} AI created component: "${inlineTitle}"`
    }

    const componentIdRaw = payload?.task_component_id
    const componentId = typeof componentIdRaw === "string" ? componentIdRaw.trim() : ""
    const resolvedTitle = componentId ? componentTitleById.get(componentId) : null
    if (resolvedTitle) {
      return `${user} AI created component: "${resolvedTitle}"`
    }

    const contentLabel = activity.task_parameter?.trim() || "content"
    return `${user} AI created 1 ${contentLabel} component`
  }

  if (activity.action === "ai_component_suggestions_generated") {
    const payload = parseJsonObject(activity.new_value)
    const rawCount = payload?.generated_count ?? payload?.normalized_count ?? payload?.inserted_count
    const parsedCount = typeof rawCount === "number" ? rawCount : Number(rawCount)
    const safeCount = Number.isFinite(parsedCount) && parsedCount > 0 ? Math.floor(parsedCount) : 0
    return `${user} AI generated ${safeCount} component suggestion${safeCount === 1 ? "" : "s"}`
  }

  if (activity.action === "ai_task_related_ideas_generated") {
    const payload = parseJsonObject(activity.new_value)
    const rawCount = payload?.generated_count
    const parsedCount = typeof rawCount === "number" ? rawCount : Number(rawCount)
    const safeCount = Number.isFinite(parsedCount) && parsedCount >= 0 ? Math.floor(parsedCount) : 0
    return `${user} AI generated ${safeCount} related idea${safeCount === 1 ? "" : "s"}`
  }

  return null
}

/**
 * Helper to format the action description for a timeline entry.
 */
export function formatTaskActivityDescription(
  activity: TaskActivity,
  userName: string | null,
  componentTitleById: Map<string, string>
): string {
  const { action, task_parameter, new_value } = activity
  const user = userName || `User #${activity.created_by}`
  const formattedKnownAction = formatTaskActivityLogEntry(activity, userName, componentTitleById)
  if (formattedKnownAction) {
    return formattedKnownAction
  }
  const parsedPayload = parseJsonObject(new_value)
  const param = task_parameter ? task_parameter.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''
  const value = new_value && !parsedPayload ? `'${new_value}'` : ''

  if (action === 'updated status' && param && value) {
    return `${user} updated ${param} to ${value}`
  }
  if (action === 'changed due date' && value) {
    return `${user} changed Due Date to ${value}`
  }
  if (action && param && value) {
    return `${user} ${action} ${param} to ${value}`
  }
  if (action && value) {
    return `${user} ${action} ${value}`
  }
  if (action) {
    return `${user} ${action}`
  }
  return `${user} performed an action`
}

function UserAvatar({ userId, name, photoUrl }: { userId: number; name: string; photoUrl: string | null }) {
  const initials = name
    ? name.split(/\s+/).map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : String(userId).slice(-2)
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
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

export function TaskActivityTimeline({
  taskId,
  className,
  compact = false,
  previewLimit = 5,
  clientSort = "oldest",
}: TaskActivityTimelineProps) {
  const supabase = useMemo(() => createClientComponentClient(), [])
  const [showAllLogs, setShowAllLogs] = useState(false)
  const visibleLimit = compact ? previewLimit : 5
  // Same query as tasks layout (view_users_i_can_see with id, full_name, photo) – one shared call
  const { data: users = [] } = useViewUsersCanSee(true)
  const userMap = useMemo(() => {
    const map: Record<number, { name: string; photoUrl: string | null }> = {}
    users.forEach((u) => {
      map[u.id] = { name: u.full_name ?? '', photoUrl: getImageUrl(u.photo) }
    })
    return map
  }, [users])
  const { data: componentTitleById = new Map<string, string>() } = useQuery({
    queryKey: ["task-activity-component-titles", taskId],
    enabled: Number.isFinite(taskId) && taskId > 0,
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

  const trailingQuery = useCallback(
    (query: any) =>
      query
        .eq('task_id', taskId)
        .order('created_at', { ascending: false }),
    [taskId]
  );
  return (
    <InfiniteList<"task_activity_logs">
      tableName="task_activity_logs"
      columns="*"
      pageSize={20}
      requireUserScrollForNextPage
      trailingQuery={trailingQuery}
      queryKey={`taskId:${taskId}`}
      className={cn("h-full", className)}
      renderNoResults={() => (
        <div className="text-center text-muted-foreground py-10">No activity recorded for this task yet.</div>
      )}
      renderEndMessage={() => null}
      renderSkeleton={count => (
        <div className="flex flex-col gap-4 px-4">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-3 h-3 rounded-full bg-muted animate-pulse" />
              <div className="h-6 w-2/3 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      )}
    >
      {(data: TaskActivity[], _meta) => {
        const sorted = sortByUserLabel(
          data,
          (item) => userMap[item.created_by]?.name ?? `User #${item.created_by}`,
          clientSort,
          (item) => item.created_at,
        )
        const windowed =
          clientSort === "oldest"
            ? sorted.slice(-visibleLimit)
            : sorted.slice(0, visibleLimit)
        const visibleData = compact || !showAllLogs ? windowed : sorted
        const hasMoreLogs = !compact && sorted.length > visibleLimit
        return (
          <div className="flex flex-col">
            <ul className="flex flex-col">
            {visibleData.map((item) => {
              const info = userMap[item.created_by]
              const name = info?.name?.trim() || `User #${item.created_by}`
              const photoUrl = info?.photoUrl ?? null
              const description = formatTaskActivityDescription(item, name, componentTitleById)
              const remainder = description.startsWith(name)
                ? description.slice(name.length)
                : ` ${description}`
              return (
                <li key={item.id} className="flex min-h-0 items-center gap-2.5 py-2">
                  <UserAvatar userId={item.created_by} name={name} photoUrl={photoUrl} />
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-sm leading-5 text-gray-700 dark:text-gray-300">
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-gray-900">{name}</span>
                      {remainder}
                    </span>
                    <span className="shrink-0 text-gray-300" aria-hidden>
                      ·
                    </span>
                    <ActivityRowTimestamp value={item.created_at} />
                  </div>
                </li>
              )
            })}
            </ul>
            {hasMoreLogs ? (
              <button
                type="button"
                className="mt-1 self-start text-xs text-gray-500 hover:text-gray-700"
                onClick={() => setShowAllLogs((prev) => !prev)}
              >
                {showAllLogs ? "Show latest" : "Show older"}
              </button>
            ) : null}
          </div>
        )
      }}
    </InfiniteList>
  )
} 