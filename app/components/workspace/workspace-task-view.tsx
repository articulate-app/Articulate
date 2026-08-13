"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { TaskDetails } from "../tasks/TaskDetails"
import {
  fetchTaskDetailsBootstrapMerged,
  mergeTaskDetail,
} from "../../lib/services/task-details-bootstrap"
import { openWorkspaceView } from "../../lib/open-workspace-view"
import type { WorkspacePaneId } from "../../lib/workspace-view"
import { WorkspaceHostPaneProvider } from "./workspace-host-pane-context"

type WorkspaceTaskViewProps = {
  taskId: string | number
  mode?: "task" | "suggestion"
  paneId: WorkspacePaneId
  onClose?: () => void
  onAiPaneOpenChange?: (open: boolean) => void
}

/**
 * Self-contained task details host for either workspace pane.
 * Loads via the same bootstrap query key as TasksLayout so caches stay shared.
 */
export function WorkspaceTaskView({
  taskId,
  mode = "task",
  paneId,
  onClose,
  onAiPaneOpenChange,
}: WorkspaceTaskViewProps) {
  const queryClient = useQueryClient()
  const supabase = createClientComponentClient()
  const [accessToken, setAccessToken] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (!cancelled) setAccessToken(data?.session?.access_token ?? null)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  const isSuggestion = mode === "suggestion"
  const { data: taskData, isLoading } = useQuery({
    queryKey: isSuggestion
      ? ["task-suggestion", taskId]
      : ["task", taskId, accessToken],
    queryFn: async ({ signal }) => {
      if (isSuggestion) {
        const id = Number(taskId)
        const { data, error } = await supabase
          .from("task_suggestions")
          .select("*")
          .eq("id", id)
          .maybeSingle()
        if (error) throw error
        return data
      }
      if (!accessToken) return null
      return fetchTaskDetailsBootstrapMerged(taskId, accessToken, undefined, { signal })
    },
    enabled: isSuggestion ? Number(taskId) > 0 : !!taskId && !!accessToken,
    staleTime: 0,
    select: (data) => {
      if (isSuggestion) return data
      if (!data) return null
      return mergeTaskDetail(undefined, data).merged
    },
  })

  const selectedTask = taskData

  if (isLoading && !selectedTask) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        Loading…
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <WorkspaceHostPaneProvider pane={paneId}>
        <TaskDetails
          isCollapsed={false}
          selectedTask={selectedTask as any}
          mode={mode}
          onClose={
            onClose ||
            (() => {
              /* tab chrome handles close */
            })
          }
          onTaskUpdate={(updatedFields) => {
            if (!selectedTask || !accessToken || isSuggestion) return
            const sanitized = {
              ...updatedFields,
              project_id_int:
                updatedFields.project_id_int === null
                  ? undefined
                  : updatedFields.project_id_int,
              parent_task_id_int:
                updatedFields.parent_task_id_int == null
                  ? undefined
                  : updatedFields.parent_task_id_int,
            }
            queryClient.setQueryData(["task", taskId, accessToken], (old: any) => ({
              ...old,
              task: { ...old?.task, ...sanitized },
            }))
          }
          }
          attachments={isSuggestion ? [] : (selectedTask as any)?.attachments || []}
          threadId={isSuggestion ? null : (selectedTask as any)?.thread_id ?? null}
          mentions={isSuggestion ? [] : (selectedTask as any)?.mentions || []}
          watchers={isSuggestion ? [] : (selectedTask as any)?.watchers || []}
          currentUser={null}
          subtasks={isSuggestion ? [] : (selectedTask as any)?.subtasks || []}
          project_watchers={
            isSuggestion ? [] : (selectedTask as any)?.project_watchers || []
          }
          accessToken={accessToken}
          isBootstrapLoaded={!!selectedTask}
          onAiPaneOpenChange={(open) => {
            onAiPaneOpenChange?.(open)
            if (open) {
              // Open AI in the other pane by default so task + AI can sit side by side.
              const otherPane: WorkspacePaneId = paneId === "middle" ? "right" : "middle"
              openWorkspaceView(
                { type: "ai" },
                { pane: otherPane, source: `workspace-task-ai:${paneId}` },
              )
            }
          }}
        />
      </WorkspaceHostPaneProvider>
    </div>
  )
}
