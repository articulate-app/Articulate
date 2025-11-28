"use client"

import React, { useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../ui/dialog'
import { MultiSelect } from '../ui/multi-select'
import { toast } from '../ui/use-toast'
import { Plus, X, GripVertical, Loader2, BookOpen } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  type ProjectBriefingComponent,
  fetchProjectBriefingComponents,
  useGlobalTemplateForProjectBriefing,
  addGlobalComponentToBriefing,
  addProjectComponentToBriefing,
  updateBriefingComponent,
  removeBriefingComponent,
  reorderBriefingComponents,
  fetchAvailableBriefingTypes,
  fetchProjectComponents,
} from '../../lib/services/project-briefings'
import debounce from 'lodash.debounce'

interface TemplatesTabProps {
  projectId: number
  briefingTypeId: number
  briefingTitle: string
  onRefresh: () => void
  onOpenVariantsDrawer: () => void
}

interface SortableComponentItemProps {
  component: ProjectBriefingComponent
  onTitleChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onRemove: () => void
}

function SortableComponentItem({
  component,
  onTitleChange,
  onDescriptionChange,
  onRemove,
}: SortableComponentItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: component.component_id,
  })

  const [localTitle, setLocalTitle] = useState(component.effective_title)
  const [localDescription, setLocalDescription] = useState(component.effective_description || '')

  React.useEffect(() => {
    setLocalTitle(component.effective_title)
    setLocalDescription(component.effective_description || '')
  }, [component])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // Debounced update handlers
  const debouncedTitleUpdate = useMemo(
    () =>
      debounce((value: string) => {
        onTitleChange(value)
      }, 500),
    [onTitleChange]
  )

  const debouncedDescriptionUpdate = useMemo(
    () =>
      debounce((value: string) => {
        onDescriptionChange(value)
      }, 500),
    [onDescriptionChange]
  )

  const handleTitleChange = (value: string) => {
    setLocalTitle(value)
    debouncedTitleUpdate(value)
  }

  const handleDescriptionChange = (value: string) => {
    setLocalDescription(value)
    debouncedDescriptionUpdate(value)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded-lg p-4 bg-white border-gray-200"
    >
      <div className="flex items-start gap-3">
        {/* Drag handle */}
        <div {...attributes} {...listeners} className="cursor-move p-1 hover:bg-gray-100 rounded mt-1">
          <GripVertical className="w-4 h-4 text-gray-400" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={localTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="text-sm font-semibold border-none p-0 h-auto focus:ring-0 focus:border-none"
              placeholder="Component title"
            />
            <Badge variant={component.source === 'global' ? 'outline' : 'default'} className="text-xs">
              {component.source}
            </Badge>
          </div>
          <Input
            value={localDescription}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            className="text-sm text-gray-600 border-none p-0 h-auto focus:ring-0 focus:border-none"
            placeholder="Component description (optional)"
          />
        </div>

        {/* Actions */}
        <button
          onClick={onRemove}
          className="p-1 rounded hover:bg-red-50 text-red-500"
          title="Remove component"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export function TemplatesTab({
  projectId,
  briefingTypeId,
  briefingTitle,
  onRefresh,
  onOpenVariantsDrawer,
}: TemplatesTabProps) {
  const queryClient = useQueryClient()
  const [isAddGlobalDialogOpen, setIsAddGlobalDialogOpen] = useState(false)
  const [isAddProjectDialogOpen, setIsAddProjectDialogOpen] = useState(false)
  const [selectedGlobalComponents, setSelectedGlobalComponents] = useState<number[]>([])
  const [selectedProjectComponents, setSelectedProjectComponents] = useState<number[]>([])

  // Fetch components for this briefing
  const { data: components, isLoading, error } = useQuery({
    queryKey: ['projBriefings:components', projectId, briefingTypeId],
    queryFn: async () => {
      const { data, error } = await fetchProjectBriefingComponents(projectId, briefingTypeId)
      if (error) throw error
      return data || []
    },
  })

  // Fetch global components for this briefing type
  const { data: globalComponents } = useQuery({
    queryKey: ['globalBriefingComponents', briefingTypeId],
    queryFn: async () => {
      const supabase = (await import('@supabase/auth-helpers-nextjs')).createClientComponentClient()
      const { data, error } = await supabase
        .from('briefing_types_components')
        .select('briefing_component_id, briefing_components!inner(id, title, description)')
        .eq('briefing_type_id', briefingTypeId)
        .order('position', { ascending: true, nullsFirst: false })

      if (error) throw error
      return data || []
    },
    enabled: !!briefingTypeId,
  })

  // Fetch project components
  const { data: projectComponents } = useQuery({
    queryKey: ['projBriefings:library', projectId],
    queryFn: async () => {
      const { data, error } = await fetchProjectComponents(projectId)
      if (error) throw error
      return data || []
    },
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleUseGlobalTemplate = useCallback(async () => {
    if (!confirm('This will replace all project-specific component settings with the global template. Continue?')) {
      return
    }

    try {
      const { error } = await useGlobalTemplateForProjectBriefing(projectId, briefingTypeId)
      if (error) throw error

      toast({
        title: 'Success',
        description: 'Using global template',
      })

      queryClient.invalidateQueries({ 
        queryKey: ['projBriefings:components', projectId, briefingTypeId] 
      })
      onRefresh()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to use global template',
        variant: 'destructive',
      })
    }
  }, [projectId, briefingTypeId, queryClient, onRefresh])

  const handleAddGlobalComponents = useCallback(async () => {
    if (selectedGlobalComponents.length === 0) return

    try {
      const promises = selectedGlobalComponents.map((componentId, idx) =>
        addGlobalComponentToBriefing(
          projectId,
          briefingTypeId,
          componentId,
          null,
          null,
          null
        )
      )

      await Promise.all(promises)

      toast({
        title: 'Success',
        description: `Added ${selectedGlobalComponents.length} component(s)`,
      })

      setIsAddGlobalDialogOpen(false)
      setSelectedGlobalComponents([])
      queryClient.invalidateQueries({ 
        queryKey: ['projBriefings:components', projectId, briefingTypeId] 
      })
      onRefresh()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add components',
        variant: 'destructive',
      })
    }
  }, [projectId, briefingTypeId, selectedGlobalComponents, queryClient, onRefresh])

  const handleAddProjectComponents = useCallback(async () => {
    if (selectedProjectComponents.length === 0) return

    try {
      const promises = selectedProjectComponents.map(componentId =>
        addProjectComponentToBriefing(
          projectId,
          briefingTypeId,
          componentId,
          null,
          null,
          null
        )
      )

      await Promise.all(promises)

      toast({
        title: 'Success',
        description: `Added ${selectedProjectComponents.length} component(s)`,
      })

      setIsAddProjectDialogOpen(false)
      setSelectedProjectComponents([])
      queryClient.invalidateQueries({ 
        queryKey: ['projBriefings:components', projectId, briefingTypeId] 
      })
      onRefresh()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add components',
        variant: 'destructive',
      })
    }
  }, [projectId, briefingTypeId, selectedProjectComponents, queryClient, onRefresh])

  const handleUpdateComponent = useCallback(
    async (componentId: number, source: 'global' | 'project', updates: { custom_title?: string; custom_description?: string }) => {
      try {
        const { error } = await updateBriefingComponent(projectId, briefingTypeId, componentId, source === 'project', updates)
        if (error) throw error

        queryClient.invalidateQueries({ 
          queryKey: ['projBriefings:components', projectId, briefingTypeId] 
        })
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to update component',
          variant: 'destructive',
        })
      }
    },
    [projectId, briefingTypeId, queryClient]
  )

  const handleRemoveComponent = useCallback(
    async (componentId: number, source: 'global' | 'project') => {
      try {
        const { error } = await removeBriefingComponent(
          projectId,
          briefingTypeId,
          componentId,
          source === 'project'
        )
        if (error) throw error

        toast({
          title: 'Success',
          description: 'Component removed',
        })

        queryClient.invalidateQueries({ 
          queryKey: ['projBriefings:components', projectId, briefingTypeId] 
        })
        onRefresh()
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to remove component',
          variant: 'destructive',
        })
      }
    },
    [projectId, briefingTypeId, queryClient, onRefresh]
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event

      if (!over || active.id === over.id || !components) return

      const oldIndex = components.findIndex(c => c.component_id === active.id)
      const newIndex = components.findIndex(c => c.component_id === over.id)

      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(components, oldIndex, newIndex)
      const order = reordered.map((c, idx) => ({
        component_id: c.component_id,
        is_project_component: c.source === 'project',
        position: idx + 1,
      }))

      try {
        const { error } = await reorderBriefingComponents(projectId, briefingTypeId, order)
        if (error) throw error

        queryClient.invalidateQueries({ 
          queryKey: ['projBriefings:components', projectId, briefingTypeId] 
        })
        onRefresh()
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to reorder components',
          variant: 'destructive',
        })
      }
    },
    [components, projectId, briefingTypeId, queryClient, onRefresh]
  )

  // Get available global components (not already added)
  const availableGlobalComponents = useMemo(() => {
    if (!globalComponents || !components) return []
    const addedIds = new Set(components.filter(c => c.source === 'global').map(c => c.component_id))
    return globalComponents.filter(gc => !addedIds.has(gc.briefing_component_id))
  }, [globalComponents, components])

  // Get available project components (not already added)
  const availableProjectComponentsList = useMemo(() => {
    if (!projectComponents || !components) return []
    const addedIds = new Set(components.filter(c => c.source === 'project').map(c => c.component_id))
    return projectComponents.filter(pc => !addedIds.has(pc.id))
  }, [projectComponents, components])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-red-600">Error loading components: {String(error)}</div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Template: {briefingTitle}</h2>
          <p className="text-sm text-gray-500 mt-1">Manage component templates for this briefing type</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleUseGlobalTemplate}>
            <BookOpen className="w-4 h-4 mr-2" />
            Use Standard Template
          </Button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mb-4">
        <Dialog open={isAddGlobalDialogOpen} onOpenChange={setIsAddGlobalDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-2">
              <Plus className="w-4 h-4" />
              Add from Library
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Global Components</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              {availableGlobalComponents.length === 0 ? (
                <div className="text-sm text-gray-500">All global components have been added</div>
              ) : (
                <MultiSelect
                  options={availableGlobalComponents.map(gc => {
                    const component = (gc as any).briefing_components
                    return {
                      id: String(gc.briefing_component_id),
                      label: component?.title || `Component ${gc.briefing_component_id}`,
                    }
                  })}
                  value={selectedGlobalComponents.map(String)}
                  onChange={(values) => setSelectedGlobalComponents(values.map(Number))}
                  placeholder="Select components..."
                />
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddGlobalDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAddGlobalComponents}
                disabled={selectedGlobalComponents.length === 0}
              >
                Add Selected
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isAddProjectDialogOpen} onOpenChange={setIsAddProjectDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-2">
              <Plus className="w-4 h-4" />
              Add Project Component
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Project Components</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              {availableProjectComponentsList.length === 0 ? (
                <div className="text-sm text-gray-500">No project components available. Create them in the Library tab.</div>
              ) : (
                <MultiSelect
                  options={availableProjectComponentsList.map(pc => ({
                    id: String(pc.id),
                    label: pc.title,
                  }))}
                  value={selectedProjectComponents.map(String)}
                  onChange={(values) => setSelectedProjectComponents(values.map(Number))}
                  placeholder="Select components..."
                />
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddProjectDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAddProjectComponents}
                disabled={selectedProjectComponents.length === 0}
              >
                Add Selected
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Components list */}
      {!components || components.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center py-12">
          <p className="text-gray-500 mb-4">No components in template yet</p>
          <Button size="sm" onClick={() => setIsAddGlobalDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Component
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={components.map(c => c.component_id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {components.map(component => (
                <SortableComponentItem
                  key={component.component_id}
                  component={component}
                  onTitleChange={(value) =>
                    handleUpdateComponent(component.component_id, component.source, { custom_title: value })
                  }
                  onDescriptionChange={(value) =>
                    handleUpdateComponent(component.component_id, component.source, { custom_description: value })
                  }
                  onRemove={() => handleRemoveComponent(component.component_id, component.source)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

