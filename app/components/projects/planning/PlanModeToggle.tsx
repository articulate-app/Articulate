"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { Button } from "../../ui/button"
import { Card } from "../../ui/card"
import { toast } from "../../ui/use-toast"
import {
  getProjectPlanMode,
  updateProjectPlanMode,
  type PlanMode,
} from "../../../lib/services/project-planning"

const MODES: { value: PlanMode; label: string; description: string }[] = [
  {
    value: "manual",
    label: "Manual",
    description: "You define plans and create tasks manually.",
  },
  {
    value: "human_loop",
    label: "Human loop",
    description: "AI suggests tasks; you approve, reject, or dismiss.",
  },
  {
    value: "autopilot",
    label: "Autopilot",
    description: "Planning runs automatically (coming soon).",
  },
]

export type PlanModeToggleVariant = "card" | "embedded"

export function PlanModeToggle({
  projectId,
  variant = "card",
}: {
  projectId: number
  variant?: PlanModeToggleVariant
}) {
  const queryClient = useQueryClient()

  const { data: planMode, isLoading } = useQuery<PlanMode | null>({
    queryKey: ["planning:plan-mode", projectId],
    queryFn: async () => {
      const { data, error } = await getProjectPlanMode(projectId)
      if (error) throw error
      return data
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (next: PlanMode) => {
      const { error } = await updateProjectPlanMode(projectId, next)
      if (error) throw error
      return next
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ["planning:plan-mode", projectId] })
      const previous = queryClient.getQueryData<PlanMode | null>(["planning:plan-mode", projectId])
      queryClient.setQueryData(["planning:plan-mode", projectId], next)
      return { previous }
    },
    onError: (err: any, _next, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(["planning:plan-mode", projectId], ctx.previous)
      }
      toast({
        title: "Error",
        description: err?.message || "Failed to update plan mode",
        variant: "destructive",
      })
    },
    onSuccess: () => {
      toast({ title: "Updated", description: "Plan mode updated successfully" })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["planning:plan-mode", projectId] })
    },
  })

  const selected = planMode ?? "manual"

  const content = (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="text-sm font-semibold text-gray-900">Plan mode</div>
        <div className="text-xs text-gray-500">
          Choose how planning suggestions and rules should behave for this project.
        </div>
      </div>

      <div className="inline-flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        {MODES.map((m) => {
          const isActive = selected === m.value
          return (
            <Button
              key={m.value}
              type="button"
              variant={isActive ? "default" : "outline"}
              className="justify-start sm:justify-center"
              disabled={isLoading || updateMutation.isPending}
              onClick={() => updateMutation.mutate(m.value)}
              title={m.description}
            >
              {m.label}
            </Button>
          )
        })}
      </div>
    </div>
  )

  if (variant === "embedded") return content
  return <Card className="p-4 md:p-6">{content}</Card>
}


