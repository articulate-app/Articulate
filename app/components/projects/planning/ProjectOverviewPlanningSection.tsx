"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"

import { SlidePanel } from "../../ui/slide-panel"
import { Button } from "../../ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card"
import { PlanModeToggle } from "./PlanModeToggle"
import { PlanRulesTable } from "./PlanRulesTable"
import { PlanningRunButton } from "./PlanningRunButton"
import { getPlanningLookups, type PlanningLookups } from "../../../lib/services/project-planning"

function buildTasksPlannerHref(projectId: number) {
  const params = new URLSearchParams()
  // Used by tasks filter UI (store parses ?project=...)
  params.set("project", String(projectId))
  // Used by suggestions queries in planner views (some components read ?projectId=...)
  params.set("projectId", String(projectId))
  // Force suggestions on (we also wire TasksLayout to respect this param)
  params.set("showSuggestions", "1")
  params.set("showTasks", "1")
  return `/tasks?${params.toString()}`
}

export function ProjectOverviewPlanningSection({ projectId }: { projectId: number }) {
  const [isRulesOpen, setIsRulesOpen] = useState(false)

  const {
    data: lookups,
    isLoading,
    error,
  } = useQuery<PlanningLookups | null>({
    queryKey: ["planning:lookups"],
    queryFn: async () => {
      const { data, error } = await getPlanningLookups()
      if (error) throw error
      return data
    },
    enabled: isRulesOpen,
    staleTime: 1000 * 60 * 10,
  })

  const plannerHref = useMemo(() => buildTasksPlannerHref(projectId), [projectId])

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Planning</CardTitle>
          <CardDescription>Suggestions appear in the Tasks planner.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-gray-200 p-4">
            <PlanModeToggle projectId={projectId} variant="embedded" />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <PlanningRunButton projectId={projectId} />

            <Button type="button" variant="outline" onClick={() => setIsRulesOpen(true)}>
              Planning rules
            </Button>

            <Button asChild type="button" variant="outline">
              <Link href={plannerHref}>View suggestions in planner</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <SlidePanel isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} title="Planning rules">
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
      </SlidePanel>
    </>
  )
}


