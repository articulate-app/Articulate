"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { GoogleConnectPanel } from "@/components/projects/google-connect-panel"
import { GOOGLE_OAUTH_DEMO_PATH } from "@/lib/google-oauth-feature"

type ProjectOption = {
  id: number
  name: string
}

export default function GoogleOAuthDemoPage() {
  const supabase = useMemo(() => createClientComponentClient(), [])
  const [projectId, setProjectId] = useState<string>("")

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["google-oauth-demo-projects"],
    queryFn: async (): Promise<ProjectOption[]> => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name")
        .eq("is_deleted", false)
        .order("name", { ascending: true })
        .limit(200)
      if (error) throw error
      return (data ?? []) as ProjectOption[]
    },
  })

  const selectedId = Number(projectId)

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Google OAuth demo (hidden test route)
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Staging-style route for Search Console + Analytics scope verification.
          Not linked from the main product navigation. The Google “unverified app”
          screen is expected until verification completes — include it in the demo
          video.
        </p>
        <p className="mt-2 font-mono text-xs text-gray-500">{GOOGLE_OAUTH_DEMO_PATH}</p>
      </div>

      <Card className="space-y-4 p-4">
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Project</Label>
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading projects…
            </div>
          ) : (
            <Select value={projectId || undefined} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={String(project.id)}>
                    {project.name} (#{project.id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {Number.isFinite(selectedId) && selectedId > 0 ? (
          <GoogleConnectPanel
            projectId={selectedId}
            returnTo={GOOGLE_OAUTH_DEMO_PATH}
          />
        ) : (
          <p className="text-xs text-gray-500">
            Select a project, then click Connect Google to record the OAuth consent
            for webmasters.readonly and analytics.readonly.
          </p>
        )}
      </Card>
    </div>
  )
}
