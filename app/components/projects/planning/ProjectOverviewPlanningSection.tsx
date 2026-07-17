"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"

import { Label } from "../../ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select"
import { toast } from "../../ui/use-toast"
import { PlanRulesTable } from "./PlanRulesTable"
import { PlanningRunButton } from "./PlanningRunButton"
import {
  getPlanningLookups,
  getProjectPlanMode,
  updateProjectPlanMode,
  type PlanMode,
  type PlanningLookups,
} from "../../../lib/services/project-planning"

const PLAN_MODE_DESCRIPTIONS: Record<PlanMode, string> = {
  manual: "Planner stays off. No suggestions are generated automatically.",
  human_loop: "Planner suggests tasks for review and approval before publishing.",
  autopilot: "Planner can generate and act with minimal manual intervention.",
}

export function ProjectOverviewPlanningSection({
  projectId,
  hideTitle = false,
}: {
  projectId: number
  /** Hide the built-in heading when embedded in project settings. */
  hideTitle?: boolean
}) {
  const queryClient = useQueryClient()

  const {
    data: lookups,
    isLoading,
    error,
  } = useQuery<PlanningLookups | null>({
    queryKey: ["planning:lookups", projectId],
    queryFn: async () => {
      const { data, error } = await getPlanningLookups(projectId)
      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 10,
  })

  const { data: planMode, isLoading: isPlanModeLoading } = useQuery<PlanMode | null>({
    queryKey: ["planning:plan-mode", projectId],
    queryFn: async () => {
      const { data, error } = await getProjectPlanMode(projectId)
      if (error) throw error
      return data
    },
  })

  const planModeMutation = useMutation({
    mutationFn: async (next: PlanMode) => {
      const { error } = await updateProjectPlanMode(projectId, next)
      if (error) throw error
      return next
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planning:plan-mode", projectId] })
      toast({ title: "Updated", description: "Plan mode updated" })
    },
    onError: (mutationError: any) => {
      toast({
        title: "Error",
        description: mutationError?.message || "Failed to update plan mode",
        variant: "destructive",
      })
    },
  })

  return (
    <div className="space-y-4 py-2">
      <div className={hideTitle ? "flex justify-end" : "flex flex-wrap items-center justify-between gap-2"}>
        {hideTitle ? null : <h2 className="text-xl font-semibold">AI Content planning</h2>}
        <PlanningRunButton projectId={projectId} variant="default" />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-900">Planning mode</Label>
        <div className="w-full">
          <Select
            value={planMode ?? "manual"}
            onValueChange={(value) => planModeMutation.mutate(value as PlanMode)}
            disabled={isPlanModeLoading || planModeMutation.isPending}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select planning mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="human_loop">Human loop</SelectItem>
              <SelectItem value="autopilot">Autopilot</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-gray-500">
            {PLAN_MODE_DESCRIPTIONS[planMode ?? "manual"]}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : error || !lookups ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load planning configuration.
        </div>
      ) : (
        <PlanRulesTable projectId={projectId} lookups={lookups} />
      )}
    </div>
  )
}


