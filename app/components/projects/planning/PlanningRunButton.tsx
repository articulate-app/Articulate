"use client"

import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, RefreshCw } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Button } from "../../ui/button"
import { toast } from "../../ui/use-toast"
import { ToastAction } from "../../ui/toast"
import { cn } from "@/lib/utils"
import { getCurrentUserId } from "../../../lib/services/auth"
import {
  getProjectPlanMode,
  runAiTaskPlannerRun,
  type PlanMode,
} from "../../../lib/services/project-planning"
import { plannerToastFor, type PlannerRunResult } from "../../../lib/planner/planner-ui"

function plannerButtonCopy(planMode: PlanMode) {
  switch (planMode) {
    case "human_loop":
      return { label: "Regenerate suggestions", successTitle: "Suggestions refreshed" }
    case "autopilot":
      return { label: "Run planner", successTitle: "Planner ran successfully" }
    case "manual":
    default:
      return { label: "Run planner", successTitle: "Planner ran successfully" }
  }
}

export function PlanningRunButton({
  projectId,
  variant = "default",
}: {
  projectId: number
  variant?: "default" | "subtle-text"
}) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const { data: planMode, isLoading: isLoadingPlanMode } = useQuery<PlanMode | null>({
    queryKey: ["planning:plan-mode", projectId],
    queryFn: async () => {
      const { data, error } = await getProjectPlanMode(projectId)
      if (error) throw error
      return data
    },
  })

  const { data: currentUserId, isLoading: isLoadingUserId } = useQuery<number | null>({
    queryKey: ["auth:current-user-id"],
    queryFn: async () => {
      const { data, error } = await getCurrentUserId()
      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 10,
  })

  const effectivePlanMode = planMode ?? "manual"
  const copy = useMemo(() => plannerButtonCopy(effectivePlanMode), [effectivePlanMode])

  const runMutation = useMutation({
    mutationFn: async () => {
      if (effectivePlanMode === "manual") {
        throw new Error("Enable plan mode to generate suggestions.")
      }
      const { data, error } = await runAiTaskPlannerRun({
        projectId,
        horizonMode: "due_date",
        horizonDays: 30,
        createdBy: currentUserId ?? null,
      })
      if (error) throw error
      return data as PlannerRunResult
    },
    onSuccess: (result) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set("tab", "activity")

      const viewDetailsAction = (
        <ToastAction altText="View details" onClick={() => router.replace(`${pathname}?${params.toString()}`)}>
          View details
        </ToastAction>
      )

      const toastPayload = plannerToastFor(result, { action: viewDetailsAction })
      toast(toastPayload)

      // Keep refresh lightweight: invalidate planner sources only.
      // - tasks: so /tasks planner can pull new suggestions/tasks when opened
      // - task-suggestions: suggestions list query used in /tasks planner views
      // - project activity: so the Activity tab shows the new planner log immediately
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      queryClient.invalidateQueries({ queryKey: ["task-suggestions"] })
      queryClient.invalidateQueries({ queryKey: ["project-activity-logs", projectId] })
    },
    onError: (err: any) => {
      toast({
        title: "Failed to run planner",
        description: err?.message || "Planner run failed",
        variant: "destructive",
      })
    },
  })

  const isDisabled =
    isLoadingPlanMode || effectivePlanMode === "manual" || runMutation.isPending || isLoadingUserId

  const helperText = useMemo(() => {
    if (isLoadingPlanMode) return "Loading plan mode…"
    if (effectivePlanMode === "manual") return "Enable plan mode to generate suggestions."
    if (isLoadingUserId) return "Resolving user…"
    return null
  }, [effectivePlanMode, isLoadingPlanMode, isLoadingUserId])

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant={variant === "subtle-text" ? "ghost" : "default"}
        className={cn(
          "gap-2",
          variant === "subtle-text" && "px-0 text-gray-500 hover:text-gray-700 hover:bg-transparent",
        )}
        disabled={isDisabled}
        onClick={() => runMutation.mutate()}
      >
        {runMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {runMutation.isPending ? "Running…" : copy.label}
      </Button>
      {helperText ? <div className="text-xs text-gray-500">{helperText}</div> : null}
    </div>
  )
}


