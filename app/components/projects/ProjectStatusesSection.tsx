"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
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
import { GripVertical, Loader2, Plus, Trash2 } from "lucide-react"
import { AddComponentButton } from "../task/AddComponentButton"
import { Button } from "../ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command"
import { Input } from "../ui/input"
import { Textarea } from "../ui/textarea"
import { Label } from "../ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { Switch } from "../ui/switch"
import { toast } from "../ui/use-toast"
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
  isExpanded: boolean
  onToggleExpanded: () => void
}

function StatusRow({
  status,
  onUpdate,
  onDelete,
  isSaving,
  isExpanded,
  onToggleExpanded,
}: StatusRowProps) {
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
      <div ref={setNodeRef} style={style} className="bg-white">
        <button
          type="button"
          className={[
            "flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-gray-50",
            isExpanded ? "bg-gray-50" : "",
          ].join(" ")}
          onClick={onToggleExpanded}
        >
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
            aria-label="Reorder status"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </div>

          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: localColor || "#9ca3af" }}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
            {localName}
          </span>
        </button>

        {isExpanded ? (
          <div className="space-y-3 border-t border-gray-100 px-3 py-3">
            <div className="space-y-2">
              <Label htmlFor={`name-${status.id}`} className="text-xs text-gray-500">
                Title
              </Label>
              <Input
                id={`name-${status.id}`}
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                onBlur={() => handleBlur("name")}
                disabled={isSaving}
                className="h-9"
                placeholder="Status name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`color-${status.id}`} className="text-xs text-gray-500">
                Color
              </Label>
              <label
                htmlFor={`color-${status.id}`}
                className="relative inline-flex h-9 w-9 cursor-pointer rounded-full"
                style={{ backgroundColor: localColor || "#9ca3af" }}
              >
                <input
                  id={`color-${status.id}`}
                  type="color"
                  value={localColor}
                  onChange={(e) => setLocalColor(e.target.value)}
                  onBlur={() => handleBlur("color")}
                  disabled={isSaving}
                  className="absolute inset-0 h-full w-full cursor-pointer rounded-full opacity-0 disabled:cursor-not-allowed"
                />
              </label>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`description-${status.id}`} className="text-xs text-gray-500">
                Description
              </Label>
              <Textarea
                id={`description-${status.id}`}
                value={localDescription}
                onChange={(e) => setLocalDescription(e.target.value)}
                onBlur={() => handleBlur("description")}
                disabled={isSaving}
                className="min-h-[68px] resize-none"
                placeholder="Description (optional)"
                rows={3}
              />
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`closed-${status.id}`} className="cursor-pointer text-xs whitespace-nowrap">
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

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`pub-closed-${status.id}`} className="cursor-pointer text-xs whitespace-nowrap">
                        Closes Publication
                      </Label>
                      <Switch
                        id={`pub-closed-${status.id}`}
                        checked={status.is_publication_closed || false}
                        onCheckedChange={(checked) => handleToggle("is_publication_closed", checked)}
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

              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-8 gap-1 text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setShowDeleteDialog(true)}
                disabled={isSaving}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>
        ) : null}
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

  const [availableTemplates, setAvailableTemplates] = useState<StatusTemplate[]>([])
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [showInlineNewStatus, setShowInlineNewStatus] = useState(false)
  const [isAddStatusOpen, setIsAddStatusOpen] = useState(false)
  const [addStatusSearch, setAddStatusSearch] = useState("")

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

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

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
  const handleAddFromTemplate = useCallback(async (templateId: number) => {
    setIsSaving(true)
    try {
      const { error } = await addStatusFromTemplate(projectId, templateId)
      if (error) throw error

      toast({
        title: "Success",
        description: "Status added from template",
      })

      // Reload statuses
      await loadStatuses()
      await loadTemplates()
      setAddStatusSearch("")
      setIsAddStatusOpen(false)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to add status from template",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }, [projectId, loadStatuses, loadTemplates])

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
      await loadTemplates()
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
  }, [projectId, customForm, loadStatuses, loadTemplates])

  const toggleExpanded = useCallback((statusId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(statusId)) next.delete(statusId)
      else next.add(statusId)
      return next
    })
  }, [])

  const unassignedTemplates = useMemo(() => {
    const assignedTemplateIds = new Set(
      statuses
        .map((status) => status.template_id)
        .filter((templateId): templateId is number => typeof templateId === "number"),
    )
    const assignedNames = new Set(
      statuses
        .map((status) => status.name?.trim().toLowerCase())
        .filter((name): name is string => Boolean(name)),
    )
    return availableTemplates.filter((template) => {
      const normalizedTemplateName = template.name?.trim().toLowerCase()
      return !assignedTemplateIds.has(template.id) && !assignedNames.has(normalizedTemplateName)
    })
  }, [availableTemplates, statuses])

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
      {/* Statuses List */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={statuses.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="divide-y divide-gray-100 rounded-md border border-gray-100 bg-white">
            {statuses.map((status) => (
              <StatusRow
                key={status.id}
                status={status}
                onUpdate={handleUpdateStatus}
                onDelete={handleDeleteStatus}
                isSaving={isSaving}
                isExpanded={expandedIds.has(status.id)}
                onToggleExpanded={() => toggleExpanded(status.id)}
              />
            ))}

          </div>

          {showInlineNewStatus ? (
            <div className="mt-3 space-y-3 rounded-md border border-dashed border-gray-200 bg-white px-3 py-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Input
                  value={customForm.name}
                  onChange={(e) => setCustomForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Status title"
                  disabled={isSaving}
                />
                <input
                  type="color"
                  value={customForm.color}
                  onChange={(e) => setCustomForm((prev) => ({ ...prev, color: e.target.value }))}
                  className="h-9 w-9 cursor-pointer rounded-full border-0 bg-transparent p-0"
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500">Description</Label>
                <Textarea
                  value={customForm.description}
                  onChange={(e) => setCustomForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description"
                  rows={2}
                  disabled={isSaving}
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowInlineNewStatus(false)
                    setCustomForm({
                      name: "",
                      color: "#3b82f6",
                      description: "",
                      isClosed: false,
                      isPublicationClosed: false,
                      type: "",
                    })
                  }}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={handleAddCustom} disabled={isSaving || !customForm.name.trim()}>
                  {isSaving ? "Creating..." : "Create status"}
                </Button>
              </div>
            </div>
          ) : (
            <Popover
              open={isAddStatusOpen}
              onOpenChange={(open) => {
                setIsAddStatusOpen(open)
                if (!open) setAddStatusSearch("")
              }}
            >
              <PopoverTrigger asChild>
                <AddComponentButton
                  label="Add status"
                  disabled={isSaving || isLoadingTemplates}
                />
              </PopoverTrigger>
              <PopoverContent className="w-[min(90vw,26rem)] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Add status..."
                    value={addStatusSearch}
                    onValueChange={setAddStatusSearch}
                  />
                  <CommandList className="max-h-[260px]">
                    <CommandEmpty>No template status found.</CommandEmpty>
                    <CommandGroup>
                      {unassignedTemplates.map((template) => (
                        <CommandItem
                          key={template.id}
                          value={template.name}
                          onSelect={() => handleAddFromTemplate(template.id)}
                          className="cursor-pointer"
                        >
                          <span
                            className="mr-2 h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: template.color || "#9ca3af" }}
                            aria-hidden
                          />
                          <span
                            className="rounded-full px-2 py-1 text-xs font-medium"
                            style={{
                              backgroundColor: `${template.color || "#e5e7eb"}22`,
                              color: template.color || "#374151",
                            }}
                          >
                            {template.name}
                          </span>
                        </CommandItem>
                      ))}
                      <CommandItem
                        value={`create-status ${addStatusSearch.trim().toLowerCase()}`}
                        onSelect={() => {
                          setIsAddStatusOpen(false)
                          setCustomForm((prev) => ({
                            ...prev,
                            name: addStatusSearch.trim(),
                          }))
                          setShowInlineNewStatus(true)
                        }}
                        className="cursor-pointer text-gray-600"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        {addStatusSearch.trim().length > 0 ? `Add status "${addStatusSearch.trim()}"` : "Add status"}
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </SortableContext>
      </DndContext>
    </div>
  )
}


