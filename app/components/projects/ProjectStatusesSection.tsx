"use client"

import { useState, useEffect, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Plus, Trash2, Loader2, Info } from "lucide-react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Textarea } from "../ui/textarea"
import { Label } from "../ui/label"
import { Switch } from "../ui/switch"
import { toast } from "../ui/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip"
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
import {
  getProjectStatuses,
  getAvailableStatusTemplates,
  addStatusFromTemplate,
  createCustomStatus,
  updateStatus,
  reorderStatuses,
  softDeleteStatus,
  type ProjectStatusWithTemplate,
  type StatusTemplate,
} from "../../lib/services/projectStatuses"

interface ProjectStatusesSectionProps {
  projectId: number
}

interface StatusRowProps {
  status: ProjectStatusWithTemplate
  onUpdate: (status: ProjectStatusWithTemplate) => void
  onDelete: (statusId: number) => void
  isSaving: boolean
}

function StatusRow({ status, onUpdate, onDelete, isSaving }: StatusRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: status.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const [localName, setLocalName] = useState(status.name)
  const [localColor, setLocalColor] = useState(status.color)
  const [localDescription, setLocalDescription] = useState(status.description || "")
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Sync with parent when status changes
  useEffect(() => {
    setLocalName(status.name)
    setLocalColor(status.color)
    setLocalDescription(status.description || "")
  }, [status])

  const handleBlur = useCallback(
    (field: "name" | "color" | "description") => {
      const hasChanged =
        (field === "name" && localName !== status.name) ||
        (field === "color" && localColor !== status.color) ||
        (field === "description" && localDescription !== (status.description || ""))

      if (hasChanged) {
        onUpdate({
          ...status,
          name: localName,
          color: localColor,
          description: localDescription || null,
        })
      }
    },
    [status, localName, localColor, localDescription, onUpdate]
  )

  const handleToggle = useCallback(
    (field: "is_closed" | "is_publication_closed", value: boolean) => {
      onUpdate({
        ...status,
        [field]: value,
      })
    },
    [status, onUpdate]
  )

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
      >
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
        >
          <GripVertical className="w-5 h-5" />
        </div>

        {/* Color Input */}
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={localColor}
            onChange={(e) => setLocalColor(e.target.value)}
            onBlur={() => handleBlur("color")}
            disabled={isSaving}
            className="w-10 h-10 rounded border border-gray-300 cursor-pointer disabled:opacity-50"
            title="Status color"
          />
        </div>

        {/* Name Input */}
        <div className="flex-1 min-w-0">
          <Input
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onBlur={() => handleBlur("name")}
            disabled={isSaving}
            className="h-9"
            placeholder="Status name"
          />
        </div>

        {/* Description */}
        <div className="flex-1 min-w-0">
          <Textarea
            value={localDescription}
            onChange={(e) => setLocalDescription(e.target.value)}
            onBlur={() => handleBlur("description")}
            disabled={isSaving}
            className="min-h-[36px] resize-none"
            placeholder="Description (optional)"
            rows={1}
          />
        </div>

        {/* Is Closed Toggle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2">
                <Label htmlFor={`closed-${status.id}`} className="text-xs whitespace-nowrap cursor-pointer">
                  Closes Delivery
                </Label>
                <Switch
                  id={`closed-${status.id}`}
                  checked={status.is_closed || false}
                  onCheckedChange={(checked) => handleToggle("is_closed", checked)}
                  disabled={isSaving}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>
                If enabled, tasks moved to this status will count as delivered, and
                we'll mark them as overdue if their delivery date is past.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Is Publication Closed Toggle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2">
                <Label htmlFor={`pub-closed-${status.id}`} className="text-xs whitespace-nowrap cursor-pointer">
                  Closes Publication
                </Label>
                <Switch
                  id={`pub-closed-${status.id}`}
                  checked={status.is_publication_closed || false}
                  onCheckedChange={(checked) =>
                    handleToggle("is_publication_closed", checked)
                  }
                  disabled={isSaving}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>
                If enabled, tasks moved to this status will count as published, and
                we'll mark them as publication-overdue if their publication date is past.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Delete Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-gray-400 hover:text-red-600 hover:bg-red-50"
          onClick={() => setShowDeleteDialog(true)}
          disabled={isSaving}
          title="Archive status"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Status</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive "{status.name}"? This will hide it from
              active statuses but won't affect existing tasks using this status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete(status.id)
                setShowDeleteDialog(false)
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function ProjectStatusesSection({ projectId }: ProjectStatusesSectionProps) {
  const queryClient = useQueryClient()

  const [statuses, setStatuses] = useState<ProjectStatusWithTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Template dialog state
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)
  const [availableTemplates, setAvailableTemplates] = useState<StatusTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)

  // Custom status dialog state
  const [showCustomDialog, setShowCustomDialog] = useState(false)
  const [customForm, setCustomForm] = useState({
    name: "",
    color: "#3b82f6",
    description: "",
    isClosed: false,
    isPublicationClosed: false,
    type: "",
  })

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Load statuses
  const loadStatuses = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await getProjectStatuses(projectId)
      if (fetchError) throw fetchError
      setStatuses(data || [])
    } catch (err: any) {
      setError(err.message || "Failed to load statuses")
      toast({
        title: "Error",
        description: err.message || "Failed to load statuses",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadStatuses()
  }, [loadStatuses])

  // Load available templates
  const loadTemplates = useCallback(async () => {
    setIsLoadingTemplates(true)
    try {
      const { data, error: fetchError } = await getAvailableStatusTemplates(projectId)
      if (fetchError) throw fetchError
      setAvailableTemplates(data || [])
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to load templates",
        variant: "destructive",
      })
    } finally {
      setIsLoadingTemplates(false)
    }
  }, [projectId])

  // Handle drag end
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event

      if (!over || active.id === over.id) return

      const oldIndex = statuses.findIndex((s) => s.id === active.id)
      const newIndex = statuses.findIndex((s) => s.id === over.id)

      if (oldIndex === -1 || newIndex === -1) return

      // Optimistically update UI
      const newStatuses = arrayMove(statuses, oldIndex, newIndex)
      setStatuses(newStatuses)

      // Call API
      const statusIds = newStatuses.map((s) => s.id)
      try {
        const { error } = await reorderStatuses(projectId, statusIds)
        if (error) throw error

        toast({
          title: "Success",
          description: "Statuses reordered successfully",
        })
      } catch (err: any) {
        // Revert on error
        setStatuses(statuses)
        toast({
          title: "Error",
          description: err.message || "Failed to reorder statuses",
          variant: "destructive",
        })
      }
    },
    [statuses, projectId]
  )

  // Update status
  const handleUpdateStatus = useCallback(
    async (updatedStatus: ProjectStatusWithTemplate) => {
      setIsSaving(true)
      try {
        const { error } = await updateStatus({
          statusId: updatedStatus.id,
          name: updatedStatus.name,
          color: updatedStatus.color,
          description: updatedStatus.description,
          isClosed: updatedStatus.is_closed || false,
          isPublicationClosed: updatedStatus.is_publication_closed || false,
        })

        if (error) throw error

        // Update local state
        setStatuses((prev) =>
          prev.map((s) => (s.id === updatedStatus.id ? updatedStatus : s))
        )

        toast({
          title: "Success",
          description: "Status updated successfully",
        })
      } catch (err: any) {
        toast({
          title: "Error",
          description: err.message || "Failed to update status",
          variant: "destructive",
        })
      } finally {
        setIsSaving(false)
      }
    },
    []
  )

  // Delete status
  const handleDeleteStatus = useCallback(
    async (statusId: number) => {
      setIsSaving(true)
      try {
        const { error } = await softDeleteStatus(statusId)
        if (error) throw error

        // Remove from local state
        setStatuses((prev) => prev.filter((s) => s.id !== statusId))

        toast({
          title: "Success",
          description: "Status archived successfully",
        })
      } catch (err: any) {
        toast({
          title: "Error",
          description: err.message || "Failed to archive status",
          variant: "destructive",
        })
      } finally {
        setIsSaving(false)
      }
    },
    []
  )

  // Add from template
  const handleAddFromTemplate = useCallback(async () => {
    if (!selectedTemplateId) return

    setIsSaving(true)
    try {
      const { error } = await addStatusFromTemplate(projectId, selectedTemplateId)
      if (error) throw error

      toast({
        title: "Success",
        description: "Status added from template",
      })

      // Reload statuses
      await loadStatuses()
      setShowTemplateDialog(false)
      setSelectedTemplateId(null)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to add status from template",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }, [projectId, selectedTemplateId, loadStatuses])

  // Add custom status
  const handleAddCustom = useCallback(async () => {
    if (!customForm.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Status name is required",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      const { error } = await createCustomStatus({
        projectId,
        name: customForm.name.trim(),
        color: customForm.color,
        description: customForm.description.trim() || null,
        isClosed: customForm.isClosed,
        isPublicationClosed: customForm.isPublicationClosed,
        type: customForm.type.trim() || null,
      })

      if (error) throw error

      toast({
        title: "Success",
        description: "Custom status created successfully",
      })

      // Reload statuses
      await loadStatuses()
      setShowCustomDialog(false)
      setCustomForm({
        name: "",
        color: "#3b82f6",
        description: "",
        isClosed: false,
        isPublicationClosed: false,
        type: "",
      })
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to create custom status",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }, [projectId, customForm, loadStatuses])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 p-4 bg-red-50 border border-red-200 rounded-lg">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900">
          <p className="font-medium mb-1">About Project Statuses</p>
          <p>
            These are project-level statuses based on system templates or custom entries.
            The toggle flags affect task overdue logic: tasks moved to statuses with these
            flags will be marked as overdue if their respective dates have passed.
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={loadTemplates}
            >
              <Plus className="w-4 h-4" />
              Add from Template
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Status from Template</DialogTitle>
              <DialogDescription>
                Select a system template to add as a project status
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {isLoadingTemplates ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : availableTemplates.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No available templates. All system templates are already in use.
                </p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {availableTemplates.map((template) => (
                    <div
                      key={template.id}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedTemplateId === template.id
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                      onClick={() => setSelectedTemplateId(template.id)}
                    >
                      <div
                        className="w-8 h-8 rounded border border-gray-300"
                        style={{ backgroundColor: template.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{template.name}</div>
                        {template.description && (
                          <div className="text-xs text-gray-500 truncate">
                            {template.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowTemplateDialog(false)
                  setSelectedTemplateId(null)
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddFromTemplate}
                disabled={!selectedTemplateId || isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Status"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showCustomDialog} onOpenChange={setShowCustomDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Add Custom Status
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Custom Status</DialogTitle>
              <DialogDescription>
                Create a new project-specific status
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="custom-name">
                  Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="custom-name"
                  value={customForm.name}
                  onChange={(e) =>
                    setCustomForm({ ...customForm, name: e.target.value })
                  }
                  placeholder="e.g., In Review"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="custom-color">
                  Color <span className="text-red-500">*</span>
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    id="custom-color"
                    type="color"
                    value={customForm.color}
                    onChange={(e) =>
                      setCustomForm({ ...customForm, color: e.target.value })
                    }
                    className="w-12 h-10 rounded border border-gray-300 cursor-pointer"
                  />
                  <Input
                    value={customForm.color}
                    onChange={(e) =>
                      setCustomForm({ ...customForm, color: e.target.value })
                    }
                    placeholder="#3b82f6"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="custom-description">Description</Label>
                <Textarea
                  id="custom-description"
                  value={customForm.description}
                  onChange={(e) =>
                    setCustomForm({ ...customForm, description: e.target.value })
                  }
                  placeholder="Optional description"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="custom-type">Type</Label>
                <Input
                  id="custom-type"
                  value={customForm.type}
                  onChange={(e) =>
                    setCustomForm({ ...customForm, type: e.target.value })
                  }
                  placeholder="e.g., workflow, milestone"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="custom-closed" className="cursor-pointer">
                    Closes Delivery
                  </Label>
                  <Switch
                    id="custom-closed"
                    checked={customForm.isClosed}
                    onCheckedChange={(checked) =>
                      setCustomForm({ ...customForm, isClosed: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="custom-pub-closed" className="cursor-pointer">
                    Closes Publication
                  </Label>
                  <Switch
                    id="custom-pub-closed"
                    checked={customForm.isPublicationClosed}
                    onCheckedChange={(checked) =>
                      setCustomForm({ ...customForm, isPublicationClosed: checked })
                    }
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCustomDialog(false)
                  setCustomForm({
                    name: "",
                    color: "#3b82f6",
                    description: "",
                    isClosed: false,
                    isPublicationClosed: false,
                    type: "",
                  })
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleAddCustom} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Status"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statuses List */}
      {statuses.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-300 rounded-lg">
          <p className="text-sm text-gray-500 mb-4">
            No statuses yet. Add one to get started.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={statuses.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {statuses.map((status) => (
                <StatusRow
                  key={status.id}
                  status={status}
                  onUpdate={handleUpdateStatus}
                  onDelete={handleDeleteStatus}
                  isSaving={isSaving}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

