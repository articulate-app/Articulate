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
function formatActionDescription(
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
        className="h-7 w-7 rounded-full object-cover shrink-0 border border-gray-200"
      />
    )
  }
  return (
    <div
      className="h-7 w-7 rounded-full shrink-0 flex items-center justify-center text-xs text-gray-600 bg-gray-100 border border-gray-200"
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
  clientSort = "newest",
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
        const visibleData = compact ? sorted.slice(0, visibleLimit) : showAllLogs ? sorted : sorted.slice(0, visibleLimit)
        const hasMoreLogs = !compact && sorted.length > visibleLimit
        return (
          <div className="flex flex-col py-1">
            <ul className="flex flex-col">
            {visibleData.map((item, idx) => {
              const info = userMap[item.created_by]
              const name = info?.name ?? null
              const photoUrl = info?.photoUrl ?? null
              return (
                <li key={item.id}>
                  {idx > 0 && <div className="border-t border-gray-200" />}
                  <div className="flex items-center gap-2 py-1.5 min-h-0">
                    <UserAvatar userId={item.created_by} name={name ?? ''} photoUrl={photoUrl} />
                    <div className="flex-1 min-w-0 overflow-hidden text-sm text-gray-700 dark:text-gray-300">
                      <span className="block truncate overflow-hidden whitespace-nowrap">
                      {formatActionDescription(item, name, componentTitleById)}
                      </span>
                    </div>
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