"use client"

import { useState, useEffect } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Card } from "../ui/card"
import { Button } from "../ui/button"
import { Loader2, Plus, Edit, Trash2, X as XIcon } from "lucide-react"
import { toast } from "../ui/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"
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
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Textarea } from "../ui/textarea"
import { Switch } from "../ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"

interface ImprovementPlanSectionProps {
  userId: number
}

interface ImprovementPlan {
  id: number
  user_id: number
  description: string
  priority: number
  solved: boolean
  created_at: string
  updated_at: string
  projects: {
    project_id: number
    project_name: string
    project_color: string | null
  }[]
}

interface MinimalProject {
  id: number
  name: string
  color: string | null
}

const supabase = createClientComponentClient()

export function ImprovementPlanSection({ userId }: ImprovementPlanSectionProps) {
  const [improvementPlans, setImprovementPlans] = useState<ImprovementPlan[]>([])
  const [allProjects, setAllProjects] = useState<MinimalProject[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showProjectDialog, setShowProjectDialog] = useState(false)
  const [editingPlan, setEditingPlan] = useState<ImprovementPlan | null>(null)
  const [deletingPlan, setDeletingPlan] = useState<ImprovementPlan | null>(null)
  const [linkingPlanId, setLinkingPlanId] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [formData, setFormData] = useState({
    description: "",
    priority: 0,
    solved: false,
  })

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)

  useEffect(() => {
    loadImprovementPlans()
  }, [userId])

  const loadImprovementPlans = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from("v_improvement_plans_with_projects")
        .select("*")
        .eq("user_id", userId)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true })

      if (error) throw error

      setImprovementPlans(data || [])
    } catch (error) {
      console.error("Error loading improvement plans:", error)
      toast({
        title: "Error",
        description: "Failed to load improvement plans",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const loadProjects = async () => {
    setIsLoadingProjects(true)
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, color")
        .eq("is_deleted", false)
        .order("name")

      if (error) throw error

      setAllProjects(data || [])
    } catch (error) {
      console.error("Error loading projects:", error)
      toast({
        title: "Error",
        description: "Failed to load projects",
        variant: "destructive",
      })
    } finally {
      setIsLoadingProjects(false)
    }
  }

  const handleAdd = () => {
    setFormData({ description: "", priority: 0, solved: false })
    setShowAddDialog(true)
  }

  const handleEdit = (plan: ImprovementPlan) => {
    setEditingPlan(plan)
    setFormData({
      description: plan.description,
      priority: plan.priority,
      solved: plan.solved,
    })
    setShowEditDialog(true)
  }

  const handleDelete = (plan: ImprovementPlan) => {
    setDeletingPlan(plan)
    setShowDeleteDialog(true)
  }

  const handleAddProject = (planId: number) => {
    setLinkingPlanId(planId)
    setSelectedProjectId(null)
    loadProjects()
    setShowProjectDialog(true)
  }

  const handleSaveAdd = async () => {
    if (!formData.description.trim()) {
      toast({
        title: "Validation Error",
        description: "Description is required",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      const { data, error } = await supabase.rpc("fn_add_improvement_plan", {
        p_user_id: userId,
        p_description: formData.description,
        p_priority: formData.priority,
      })

      if (error) throw error

      await loadImprovementPlans()
      setShowAddDialog(false)
      toast({
        title: "Success",
        description: "Improvement plan added successfully",
      })
    } catch (error) {
      console.error("Error adding improvement plan:", error)
      toast({
        title: "Error",
        description: "Failed to add improvement plan",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!editingPlan) return

    if (!formData.description.trim()) {
      toast({
        title: "Validation Error",
        description: "Description is required",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      const { data, error } = await supabase.rpc("fn_update_improvement_plan", {
        p_id: editingPlan.id,
        p_description: formData.description,
        p_priority: formData.priority,
        p_solved: formData.solved,
      })

      if (error) throw error

      await loadImprovementPlans()
      setShowEditDialog(false)
      setEditingPlan(null)
      toast({
        title: "Success",
        description: "Improvement plan updated successfully",
      })
    } catch (error) {
      console.error("Error updating improvement plan:", error)
      toast({
        title: "Error",
        description: "Failed to update improvement plan",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deletingPlan) return

    setIsSaving(true)
    try {
      const { error } = await supabase.rpc("fn_delete_improvement_plan", {
        p_id: deletingPlan.id,
      })

      if (error) throw error

      await loadImprovementPlans()
      setShowDeleteDialog(false)
      setDeletingPlan(null)
      toast({
        title: "Success",
        description: "Improvement plan deleted successfully",
      })
    } catch (error) {
      console.error("Error deleting improvement plan:", error)
      toast({
        title: "Error",
        description: "Failed to delete improvement plan",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleSolved = async (plan: ImprovementPlan, newSolved: boolean) => {
    try {
      const { error } = await supabase.rpc("fn_update_improvement_plan", {
        p_id: plan.id,
        p_description: plan.description,
        p_priority: plan.priority,
        p_solved: newSolved,
      })

      if (error) throw error

      // Optimistic update
      setImprovementPlans((prev) =>
        prev.map((p) => (p.id === plan.id ? { ...p, solved: newSolved } : p))
      )

      toast({
        title: "Success",
        description: newSolved ? "Marked as solved" : "Marked as unsolved",
      })
    } catch (error) {
      console.error("Error toggling solved status:", error)
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      })
      // Revert optimistic update
      await loadImprovementPlans()
    }
  }

  const handleLinkProject = async () => {
    if (!linkingPlanId || !selectedProjectId) return

    setIsSaving(true)
    try {
      const { error } = await supabase.rpc("fn_link_improvement_to_project", {
        p_improvement_plan_id: linkingPlanId,
        p_project_id: selectedProjectId,
      })

      if (error) throw error

      await loadImprovementPlans()
      setShowProjectDialog(false)
      setLinkingPlanId(null)
      setSelectedProjectId(null)
      toast({
        title: "Success",
        description: "Project linked successfully",
      })
    } catch (error) {
      console.error("Error linking project:", error)
      toast({
        title: "Error",
        description: "Failed to link project",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleUnlinkProject = async (planId: number, projectId: number) => {
    try {
      const { error } = await supabase.rpc("fn_unlink_improvement_from_project", {
        p_improvement_plan_id: planId,
        p_project_id: projectId,
      })

      if (error) throw error

      // Optimistic update
      setImprovementPlans((prev) =>
        prev.map((plan) =>
          plan.id === planId
            ? {
                ...plan,
                projects: plan.projects.filter((p) => p.project_id !== projectId),
              }
            : plan
        )
      )

      toast({
        title: "Success",
        description: "Project unlinked successfully",
      })
    } catch (error) {
      console.error("Error unlinking project:", error)
      toast({
        title: "Error",
        description: "Failed to unlink project",
        variant: "destructive",
      })
      // Revert optimistic update
      await loadImprovementPlans()
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Improvement Plan</h2>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="w-4 h-4 mr-1" />
          Add Improvement
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : improvementPlans.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-gray-500">No improvement plans yet</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {improvementPlans.map((plan) => (
            <Card key={plan.id} className="p-4">
              <div className="flex items-start gap-4">
                {/* Priority Badge */}
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-sm">
                    {plan.priority}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 mb-2">{plan.description}</p>

                  {/* Projects */}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {plan.projects.map((project) => (
                      <div
                        key={project.project_id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs"
                        style={{
                          backgroundColor: project.project_color
                            ? `${project.project_color}20`
                            : "#f3f4f6",
                          color: project.project_color || "#6b7280",
                        }}
                      >
                        {project.project_name}
                        <button
                          onClick={() => handleUnlinkProject(plan.id, project.project_id)}
                          className="ml-1 hover:opacity-70"
                        >
                          <XIcon className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAddProject(plan.id)}
                      className="h-6 px-2 text-xs"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Project
                    </Button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`solved-${plan.id}`} className="text-xs text-gray-500">
                      Solved
                    </Label>
                    <Switch
                      id={`solved-${plan.id}`}
                      checked={plan.solved}
                      onCheckedChange={(checked) => handleToggleSolved(plan, checked)}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(plan)}
                    className="h-8 w-8 p-0"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(plan)}
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Improvement Plan</DialogTitle>
            <DialogDescription>
              Create a new improvement plan for this user
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the improvement area..."
                rows={4}
              />
            </div>
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                type="number"
                value={formData.priority}
                onChange={(e) =>
                  setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })
                }
                placeholder="0"
              />
              <p className="text-xs text-gray-500 mt-1">Lower numbers = higher priority</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAdd} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Improvement Plan</DialogTitle>
            <DialogDescription>Update the improvement plan details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the improvement area..."
                rows={4}
              />
            </div>
            <div>
              <Label htmlFor="edit-priority">Priority</Label>
              <Input
                id="edit-priority"
                type="number"
                value={formData.priority}
                onChange={(e) =>
                  setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })
                }
                placeholder="0"
              />
              <p className="text-xs text-gray-500 mt-1">Lower numbers = higher priority</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="edit-solved"
                checked={formData.solved}
                onCheckedChange={(checked) => setFormData({ ...formData, solved: checked })}
              />
              <Label htmlFor="edit-solved">Solved</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Improvement Plan</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this improvement plan? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Link Project Dialog */}
      <Dialog open={showProjectDialog} onOpenChange={setShowProjectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Project</DialogTitle>
            <DialogDescription>
              Select a project to link with this improvement plan
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="project-select">Project</Label>
            {isLoadingProjects ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <Select
                value={selectedProjectId?.toString()}
                onValueChange={(value) => setSelectedProjectId(parseInt(value))}
              >
                <SelectTrigger id="project-select">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {allProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProjectDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleLinkProject} disabled={!selectedProjectId || isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

