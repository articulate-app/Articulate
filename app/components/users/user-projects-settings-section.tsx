"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Trash2 } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog"
import { Button } from "../ui/button"
import { Label } from "../ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { toast } from "../ui/use-toast"
import { AddDashedButton } from "../ui/add-dashed-button"
import { getUserProjects } from "../../lib/services/users"
import {
  addUserToProject,
  getMinimalProjects,
  removeUserFromProject,
} from "../../lib/services/userSkillsAndMemberships"

type UserProjectsSettingsSectionProps = {
  userId: number
  onOpenProject?: (projectId: number) => void
}

export function UserProjectsSettingsSection({
  userId,
  onOpenProject,
}: UserProjectsSettingsSectionProps) {
  const queryClient = useQueryClient()
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingRemoveId, setPendingRemoveId] = useState<number | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)

  const { data: projects, isLoading } = useQuery({
    queryKey: ["user-projects", userId],
    queryFn: async () => {
      const result = await getUserProjects(userId)
      if (result.error) throw result.error
      return result.data || []
    },
  })

  const { data: minimalProjects } = useQuery({
    queryKey: ["projects-minimal"],
    queryFn: async () => {
      const result = await getMinimalProjects()
      if (result.error) throw result.error
      return result.data || []
    },
    enabled: showAddPanel,
  })

  const availableProjects = useMemo(() => {
    if (!minimalProjects) return []
    const watchingProjectIds = new Set((projects ?? []).map((p) => p.project_id))
    return minimalProjects.filter((p) => !watchingProjectIds.has(p.id))
  }, [minimalProjects, projects])

  const resetAddPanel = () => {
    setShowAddPanel(false)
    setSelectedProjectId(null)
  }

  const handleAddToProject = async () => {
    if (!selectedProjectId) return
    setIsSubmitting(true)
    try {
      const { error } = await addUserToProject(userId, selectedProjectId)
      if (error) throw error
      toast({ title: "Success", description: "Added to project" })
      queryClient.invalidateQueries({ queryKey: ["user-projects", userId] })
      resetAddPanel()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to add to project",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemoveFromProject = async () => {
    if (pendingRemoveId == null) return
    setIsRemoving(true)
    try {
      const { data, error } = await removeUserFromProject(userId, pendingRemoveId)
      if (error) throw error
      if (!data) {
        throw new Error("Could not remove you from this project")
      }
      toast({ title: "Removed", description: "You are no longer watching this project" })
      await queryClient.invalidateQueries({ queryKey: ["user-projects", userId] })
      setPendingRemoveId(null)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to remove from project",
        variant: "destructive",
      })
    } finally {
      setIsRemoving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading...
      </div>
    )
  }

  const pendingProject = projects?.find((project) => project.project_id === pendingRemoveId) ?? null

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-900">Projects</h3>
        <p className="mt-0.5 text-xs text-gray-500">Projects you are watching.</p>
      </div>

      {showAddPanel ? (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50/80 p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-gray-900">Add to project</h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={resetAddPanel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
          <div className="space-y-2">
            <Label>Project</Label>
            <Select
              value={selectedProjectId ? String(selectedProjectId) : ""}
              onValueChange={(value) => setSelectedProjectId(parseInt(value, 10))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {availableProjects.map((project) => (
                  <SelectItem key={project.id} value={String(project.id)}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleAddToProject()}
            disabled={!selectedProjectId || isSubmitting}
          >
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Add to project
          </Button>
        </div>
      ) : null}

      {projects && projects.length > 0 ? (
        <div>
          {projects.map((project) => (
            <div
              key={project.project_id}
              className="flex items-center justify-between gap-3 border-b border-gray-100 py-3 last:border-b-0"
            >
              {onOpenProject ? (
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => onOpenProject(project.project_id)}
                >
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: project.project_color || "#6b7280" }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {project.project_name}
                    </div>
                    {project.project_status ? (
                      <p className="mt-0.5 truncate text-sm text-gray-500">{project.project_status}</p>
                    ) : null}
                  </div>
                </button>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: project.project_color || "#6b7280" }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {project.project_name}
                    </div>
                    {project.project_status ? (
                      <p className="mt-0.5 truncate text-sm text-gray-500">{project.project_status}</p>
                    ) : null}
                  </div>
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 p-0 text-gray-400 hover:text-red-600"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setPendingRemoveId(project.project_id)
                }}
                aria-label="Remove from project"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-6 text-sm text-gray-500">No projects yet.</p>
      )}

      {!showAddPanel ? (
        <AddDashedButton
          label="Add to project"
          className="mt-0"
          onClick={() => setShowAddPanel(true)}
        />
      ) : null}

      <AlertDialog
        open={pendingRemoveId != null}
        onOpenChange={(open) => {
          if (!open && !isRemoving) setPendingRemoveId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from project?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingProject
                ? `Stop watching ${pendingProject.project_name}.`
                : "Stop watching this project."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={isRemoving}
              onClick={(event) => {
                event.preventDefault()
                void handleRemoveFromProject()
              }}
            >
              {isRemoving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
