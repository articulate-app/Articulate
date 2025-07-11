import React, { useEffect, useState, useMemo, useCallback } from "react"
import { InfiniteList } from "../ui/infinite-list"
import { SupabaseTableData } from "../../../hooks/use-infinite-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { z } from "zod"
import { cn } from "@/lib/utils"

export interface TaskActivityTimelineProps {
  taskId: number
  className?: string
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

/**
 * Helper to format the action description for a timeline entry.
 */
function formatActionDescription(activity: TaskActivity, userName: string | null): string {
  const { action, task_parameter, new_value } = activity
  // Example: "John Doe updated Status to 'In Review'"
  // Fallbacks for missing data
  const user = userName || `User #${activity.created_by}`
  const param = task_parameter ? task_parameter.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''
  const value = new_value ? `'${new_value}'` : ''

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

/**
 * Helper to format the timestamp.
 */
function formatTimestamp(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  })
}

/**
 * Helper to fetch user names by ID and cache them locally.
 */
function useUserNames(userIds: number[]) {
  const [userMap, setUserMap] = useState<Record<number, string>>({})
  useEffect(() => {
    if (userIds.length === 0) return
    let isMounted = true
    const controller = new AbortController()
    async function fetchUsers() {
      const supabase = createClientComponentClient()
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name')
        .in('id', userIds)
        .abortSignal(controller.signal)
      if (!error && data && isMounted) {
        const map: Record<number, string> = {}
        data.forEach(u => { map[u.id] = u.full_name })
        setUserMap(map)
      }
    }
    fetchUsers()
    return () => { isMounted = false; controller.abort() }
  }, [JSON.stringify(userIds.sort())])
  return userMap
}

export function TaskActivityTimeline({ taskId, className }: TaskActivityTimelineProps) {
  // Memoize trailingQuery so it only changes when taskId changes
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
      trailingQuery={trailingQuery}
      queryKey={`taskId:${taskId}`}
      className={cn("h-full", className)}
      renderNoResults={() => (
        <div className="text-center text-muted-foreground py-10">No activity recorded for this task yet.</div>
      )}
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
        const userIds = useMemo(
          () => Array.from(new Set(data.map(a => a.created_by))).sort((a, b) => a - b),
          [data]
        );
        const userMap = useUserNames(userIds)
        return (
          <ol className="relative border-s border-gray-200 dark:border-gray-700 flex flex-col gap-6 px-4 py-4">
            {data.map((item, idx) => (
              <li key={item.id} className="ms-4 flex items-start gap-3">
                {/* Timeline dot */}
                <span className={cn(
                  "absolute -start-1.5 flex items-center justify-center w-3 h-3 bg-white border-2 border-primary rounded-full z-10",
                  idx === 0 ? "border-primary bg-primary" : "border-gray-300"
                )} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {formatActionDescription(item, userMap[item.created_by] || null)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatTimestamp(item.created_at)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )
      }}
    </InfiniteList>
  )
} 