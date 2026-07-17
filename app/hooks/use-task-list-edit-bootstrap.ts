"use client"

import { useQuery } from "@tanstack/react-query"
import { fetchTaskListEditBootstrap } from "@/lib/services/task-list-edit-bootstrap"
import type { TaskListEditBootstrapResponse } from "@/lib/types/task-list-edit-bootstrap"

const THIRTY_MIN = 1000 * 60 * 30
const ONE_HOUR = 1000 * 60 * 60

export const TASK_LIST_EDIT_BOOTSTRAP_QUERY_KEY = ["task-list-edit-bootstrap"] as const

/**
 * Single edge call replacing six Supabase reference queries for list filters / inline edit labels.
 * Enable only after first paint or when UI needs metadata — see TasksLayout / TaskFilters.
 */
export function useTaskListEditBootstrap(
  accessToken: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const enabled = Boolean(accessToken && options?.enabled)

  return useQuery<TaskListEditBootstrapResponse>({
    queryKey: TASK_LIST_EDIT_BOOTSTRAP_QUERY_KEY,
    queryFn: async () => fetchTaskListEditBootstrap(accessToken as string),
    enabled,
    staleTime: THIRTY_MIN,
    gcTime: ONE_HOUR,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (prev) => prev,
  })
}
