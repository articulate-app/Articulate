"use client"

import { useState, useEffect, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Input } from "../ui/input"
import { Textarea } from "../ui/textarea"
import { Label } from "../ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { Loader2 } from "lucide-react"
import { toast } from "../ui/use-toast"
import {
  getProjectOverview,
  updateProjectOverview,
  type ProjectOverview,
} from "../../lib/services/projects-briefing"
import { ChannelsLanguagesContentTypes, ProjectChannels } from "../project-briefings/ConfigurationTab"
import { ProjectWatchers } from "./ProjectWatchers"
import { ProjectStatusesSection } from "./ProjectStatusesSection"

interface OverviewTabProps {
  projectId: number
}

export function OverviewTab({ projectId }: OverviewTabProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<Partial<ProjectOverview>>({})
  const [savingFields, setSavingFields] = useState<Set<string>>(new Set())

  const { data, isLoading, error } = useQuery({
    queryKey: ["project-overview", projectId],
    queryFn: async () => {
      const result = await getProjectOverview(projectId)
      if (result.error) throw result.error
      return result.data
    },
  })

  useEffect(() => {
    if (data) {
      setFormData(data)
    }
  }, [data])

  const handleSave = useCallback(
    async (field: string, value: any) => {
      if (savingFields.has(field)) return

      setSavingFields((prev) => new Set(prev).add(field))

      const patch: any = {}
      // Map field names to database column names
      if (field === "end_date") {
        patch.due_date = value || null
      } else {
        patch[field] = value ?? null
      }

      try {
        const { error: updateError } = await updateProjectOverview(
          projectId,
          patch
        )

        if (updateError) {
          toast({
            title: "Error",
            description: `Failed to save ${field}: ${updateError.message}`,
            variant: "destructive",
          })
          // Revert optimistic update
          if (data) {
            setFormData(data)
          }
        } else {
          toast({
            title: "Saved",
            description: `${field} updated successfully`,
          })
          queryClient.invalidateQueries({
            queryKey: ["project-overview", projectId],
          })
        }
      } catch (err: any) {
        toast({
          title: "Error",
          description: err.message || "Failed to save",
          variant: "destructive",
        })
        if (data) {
          setFormData(data)
        }
      } finally {
        setSavingFields((prev) => {
          const next = new Set(prev)
          next.delete(field)
          return next
        })
      }
    },
    [projectId, savingFields, data, queryClient]
  )

  const handleBlur = useCallback(
    (field: string, currentValue: any) => {
      if (!data) return

      const originalValue =
        field === "end_date" ? data.end_date : (data as any)[field]

      if (currentValue !== originalValue) {
        handleSave(field, currentValue)
      }
    },
    [data, handleSave]
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as any).message)
      : String(error)
    return (
      <div className="p-6 text-red-600">
        Error loading project overview: {errorMessage}
      </div>
    )
  }

  if (!data) {
    return <div className="p-6 text-gray-500">No project data found</div>
  }

  const isSaving = (field: string) => savingFields.has(field)

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Project Overview</h2>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name || ""}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              onBlur={(e) => handleBlur("name", e.target.value)}
              disabled={isSaving("name")}
              className={isSaving("name") ? "opacity-50" : ""}
            />
          </div>

          {/* Team */}
          <div className="space-y-2">
            <Label htmlFor="team_name">Team</Label>
            <Input
              id="team_name"
              value={formData.team_name || ""}
              disabled
              className="bg-gray-50"
            />
          </div>

          {/* Description */}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              onBlur={(e) => handleBlur("description", e.target.value)}
              disabled={isSaving("description")}
              className={isSaving("description") ? "opacity-50" : ""}
              rows={3}
            />
          </div>

          {/* Goal */}
          <div className="space-y-2">
            <Label htmlFor="goal">Goal</Label>
            <Textarea
              id="goal"
              value={formData.goal || ""}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, goal: e.target.value }))
              }
              onBlur={(e) => handleBlur("goal", e.target.value)}
              disabled={isSaving("goal")}
              className={isSaving("goal") ? "opacity-50" : ""}
              rows={3}
            />
          </div>

          {/* Target Audience */}
          <div className="space-y-2">
            <Label htmlFor="target_audience">Target Audience</Label>
            <Textarea
              id="target_audience"
              value={formData.target_audience || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  target_audience: e.target.value,
                }))
              }
              onBlur={(e) => handleBlur("target_audience", e.target.value)}
              disabled={isSaving("target_audience")}
              className={isSaving("target_audience") ? "opacity-50" : ""}
              rows={3}
            />
          </div>

          {/* Editorial Line */}
          <div className="space-y-2">
            <Label htmlFor="editorial_line">Editorial Line</Label>
            <Textarea
              id="editorial_line"
              value={formData.editorial_line || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  editorial_line: e.target.value,
                }))
              }
              onBlur={(e) => handleBlur("editorial_line", e.target.value)}
              disabled={isSaving("editorial_line")}
              className={isSaving("editorial_line") ? "opacity-50" : ""}
              rows={3}
            />
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label htmlFor="color">Color</Label>
            <Input
              id="color"
              type="color"
              value={formData.color || "#000000"}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, color: e.target.value }))
              }
              onBlur={(e) => handleBlur("color", e.target.value)}
              disabled={isSaving("color")}
              className={isSaving("color") ? "opacity-50" : "h-10"}
            />
          </div>

          {/* Start Date */}
          <div className="space-y-2">
            <Label htmlFor="start_date">Start Date</Label>
            <Input
              id="start_date"
              type="date"
              value={
                formData.start_date
                  ? new Date(formData.start_date).toISOString().split("T")[0]
                  : ""
              }
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  start_date: e.target.value || null,
                }))
              }
              onBlur={(e) =>
                handleBlur(
                  "start_date",
                  e.target.value ? new Date(e.target.value).toISOString() : null
                )
              }
              disabled={isSaving("start_date")}
              className={isSaving("start_date") ? "opacity-50" : ""}
            />
          </div>

          {/* End Date */}
          <div className="space-y-2">
            <Label htmlFor="end_date">End Date</Label>
            <Input
              id="end_date"
              type="date"
              value={
                formData.end_date
                  ? new Date(formData.end_date).toISOString().split("T")[0]
                  : ""
              }
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  end_date: e.target.value || null,
                }))
              }
              onBlur={(e) =>
                handleBlur(
                  "end_date",
                  e.target.value ? new Date(e.target.value).toISOString() : null
                )
              }
              disabled={isSaving("end_date")}
              className={isSaving("end_date") ? "opacity-50" : ""}
            />
          </div>

          {/* Project URL */}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="project_url">Project URL</Label>
            <Input
              id="project_url"
              type="url"
              value={formData.project_url || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  project_url: e.target.value,
                }))
              }
              onBlur={(e) => handleBlur("project_url", e.target.value)}
              disabled={isSaving("project_url")}
              className={isSaving("project_url") ? "opacity-50" : ""}
              placeholder="https://example.com"
            />
          </div>

          {/* Creation Mode */}
          <div className="space-y-2">
            <Label htmlFor="creation_mode">Creation Mode</Label>
            <Select
              value={formData.creation_mode || "manual"}
              onValueChange={(value) => {
                setFormData((prev) => ({ ...prev, creation_mode: value }))
                handleSave("creation_mode", value)
              }}
              disabled={isSaving("creation_mode")}
            >
              <SelectTrigger className={isSaving("creation_mode") ? "opacity-50" : ""}>
                <SelectValue placeholder="Select creation mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="human_loop">Human-in-the-loop</SelectItem>
                <SelectItem value="autopilot">Auto-Pilot</SelectItem>
              </SelectContent>
            </Select>
            {formData.creation_mode === "autopilot" && (
              <p className="text-xs text-gray-700 bg-blue-50 border border-blue-200 rounded p-2">
                <strong>Auto-Pilot:</strong> AI generates briefing content automatically {formData.ai_autorun_days_before || 'N'} days before delivery.
              </p>
            )}
            {formData.creation_mode === "human_loop" && (
              <p className="text-xs text-gray-700 bg-amber-50 border border-amber-200 rounded p-2">
                <strong>Human-in-the-loop:</strong> Same as autopilot, except content created early requires human review & edit workflow.
              </p>
            )}
            {formData.creation_mode === "manual" && (
              <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded p-2">
                <strong>Manual:</strong> Nothing is pre-generated.
              </p>
            )}
          </div>

          {/* AI Autorun Days Before */}
          <div className="space-y-2">
            <Label htmlFor="ai_autorun_days_before">AI Autorun Days Before</Label>
            <Input
              id="ai_autorun_days_before"
              type="number"
              min="0"
              value={formData.ai_autorun_days_before ?? ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  ai_autorun_days_before: e.target.value ? Number(e.target.value) : null,
                }))
              }
              onBlur={(e) =>
                handleBlur(
                  "ai_autorun_days_before",
                  e.target.value ? Number(e.target.value) : null
                )
              }
              disabled={isSaving("ai_autorun_days_before")}
              className={isSaving("ai_autorun_days_before") ? "opacity-50" : ""}
              placeholder="e.g., 3"
            />
            <p className="text-xs text-gray-500">
              Number of days before publication date when AI should automatically generate content
            </p>
          </div>

          {/* Created At (read-only) */}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="created_at">Created At</Label>
            <Input
              id="created_at"
              value={
                formData.created_at
                  ? new Date(formData.created_at).toLocaleString()
                  : ""
              }
              disabled
              className="bg-gray-50"
            />
          </div>
        </div>

      {/* Project Channels Section */}
      <div className="mt-8 pt-8 border-t">
        <h2 className="text-xl font-semibold mb-4">Project Channels</h2>
        <ProjectChannels projectId={projectId} />
      </div>

      {/* Channels, Languages, Content Types Section */}
      <div className="mt-8 pt-8 border-t">
        <h2 className="text-xl font-semibold mb-4">Channels, Languages, Content Types</h2>
        <ChannelsLanguagesContentTypes projectId={projectId} />
      </div>

      {/* Watchers Section */}
      <div className="mt-8 pt-8 border-t">
        <h2 className="text-xl font-semibold mb-4">Project Watchers</h2>
        <ProjectWatchers projectId={projectId} />
      </div>

      {/* Project Statuses Section */}
      <div className="mt-8 pt-8 border-t">
        <h2 className="text-xl font-semibold mb-4">Project Statuses</h2>
        <ProjectStatusesSection projectId={projectId} />
      </div>
    </div>
  )
}

