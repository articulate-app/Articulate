"use client"

import React, { useState, useCallback, useMemo } from 'react'
import { Button } from '../../../app/components/ui/button'
import { Input } from '../../../app/components/ui/input'
import { Textarea } from '../../../app/components/ui/textarea'
import { Badge } from '../../../app/components/ui/badge'
import { Checkbox } from '../../../app/components/ui/checkbox'
import { ChevronDown, ChevronRight, GripVertical, Plus, X } from 'lucide-react'
import { useProjectBriefingComponents } from './hooks/useProjectBriefingComponents'
import { toast } from '../../../app/components/ui/use-toast'
import debounce from 'lodash.debounce'
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
} from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface BriefingComponentTemplateProps {
  projectId: number
  briefingTypeId: number
  briefingTypeTitle: string
}

interface SortableComponentItemProps {
  component: any
  onToggle: (componentId: number, selected: boolean) => void
  onEditCustom: (componentId: number, customTitle: string, customDescription: string) => void
  onRemove: (componentId: number) => void
}

function SortableComponentItem({ component, onToggle, onEditCustom, onRemove }: SortableComponentItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [customTitle, setCustomTitle] = useState(component.custom_title || component.title)
  const [customDescription, setCustomDescription] = useState(component.custom_description || component.description || '')

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: component.component_id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const handleSaveCustom = useCallback(
    debounce((title: string, description: string) => {
      onEditCustom(component.component_id, title, description)
    }, 500),
    [component.component_id, onEditCustom]
  )

  const handleTitleChange = (value: string) => {
    setCustomTitle(value)
    handleSaveCustom(value, customDescription)
  }

  const handleDescriptionChange = (value: string) => {
    setCustomDescription(value)
    handleSaveCustom(customTitle, value)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-3 p-3 border rounded-lg bg-white ${
        isDragging ? 'shadow-lg' : 'hover:bg-gray-50'
      }`}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center w-6 h-6 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Checkbox */}
      <Checkbox
        checked={component.selected}
        onCheckedChange={(checked) => onToggle(component.component_id, !!checked)}
        className="mt-1"
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="space-y-2">
            <Input
              value={customTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Custom title"
              className="text-sm"
            />
            <Textarea
              value={customDescription}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Custom description"
              className="text-sm min-h-[60px]"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1 text-xs"
              >
                Done
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setCustomTitle(component.custom_title || component.title)
                  setCustomDescription(component.custom_description || component.description || '')
                  setIsEditing(false)
                }}
                className="px-3 py-1 text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">
                {component.custom_title || component.title}
              </span>
              {component.custom_title && (
                <Badge variant="outline" className="text-xs">
                  Custom
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                #{component.position}
              </Badge>
            </div>
            
            {(component.description || component.custom_description) && (
              <div className="text-sm text-gray-600 mt-1">
                {component.custom_description || component.description}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {!isEditing && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsEditing(true)}
            className="p-1 h-auto text-gray-600 hover:text-gray-800"
          >
            Edit
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onRemove(component.component_id)}
          className="p-1 h-auto text-red-600 hover:text-red-800"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

interface AvailableComponentItemProps {
  component: any
  onAdd: (componentId: number) => void
}

function AvailableComponentItem({ component, onAdd }: AvailableComponentItemProps) {
  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50 hover:bg-gray-100">
      <Checkbox
        checked={false}
        disabled
        className="pointer-events-none"
      />
      
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900">{component.title}</div>
        {component.description && (
          <div className="text-sm text-gray-500 mt-1">{component.description}</div>
        )}
      </div>

      <Button
        size="sm"
        onClick={() => onAdd(component.component_id)}
        className="px-3 py-1 text-xs bg-white text-gray-900 border-gray-300 hover:bg-gray-50"
      >
        <Plus className="w-3 h-3 mr-1" />
        Add
      </Button>
    </div>
  )
}

export function BriefingComponentTemplate({ projectId, briefingTypeId, briefingTypeTitle }: BriefingComponentTemplateProps) {
  const { displayComponents, loading, error, setComponent, reorderComponents } = useProjectBriefingComponents(projectId, briefingTypeId)
  
  const [optimisticComponents, setOptimisticComponents] = useState<any[]>([])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Separate selected and available components
  const selectedComponents = useMemo(() => {
    const components = optimisticComponents.length > 0 ? optimisticComponents : displayComponents
    return components.filter(c => c.selected).sort((a, b) => (a.position || 2147483647) - (b.position || 2147483647))
  }, [displayComponents, optimisticComponents])

  const availableComponents = useMemo(() => {
    const components = optimisticComponents.length > 0 ? optimisticComponents : displayComponents
    return components.filter(c => !c.selected)
  }, [displayComponents, optimisticComponents])

  // Handle component toggle
  const handleToggle = useCallback(async (componentId: number, selected: boolean) => {
    const component = displayComponents.find(c => c.component_id === componentId)
    if (!component) return

    // Optimistic update
    const newOptimisticState = displayComponents.map(c => {
      if (c.component_id === componentId) {
        const newPosition = selected 
          ? (Math.max(...selectedComponents.map(sc => sc.position || 0), 0) + 1)
          : 2147483647
        return { ...c, selected, position: newPosition }
      }
      return c
    })
    setOptimisticComponents(newOptimisticState)

    try {
      const position = selected 
        ? (Math.max(...selectedComponents.map(sc => sc.position || 0), 0) + 1)
        : undefined

      const result = await setComponent(
        componentId,
        selected,
        position,
        component.custom_title ?? undefined,
        component.custom_description ?? undefined
      )

      if (!result.success) {
        throw new Error(result.error)
      }

      // Clear optimistic state on success
      setOptimisticComponents([])
    } catch (err: any) {
      console.error('Failed to toggle component:', err)
      toast({
        title: 'Error',
        description: err.message || 'Failed to update component',
        variant: 'destructive'
      })
      // Revert optimistic update
      setOptimisticComponents([])
    }
  }, [displayComponents, selectedComponents, setComponent])

  // Handle component reordering
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) return

    const oldIndex = selectedComponents.findIndex(c => c.component_id === active.id)
    const newIndex = selectedComponents.findIndex(c => c.component_id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    // Optimistic update
    const newOrder = arrayMove(selectedComponents, oldIndex, newIndex)
    const newOptimisticState = displayComponents.map(c => {
      const newOrderItem = newOrder.find(no => no.component_id === c.component_id)
      if (newOrderItem) {
        return { ...c, position: newOrderItem.position }
      }
      return c
    })
    setOptimisticComponents(newOptimisticState)

    try {
      const orderArray = newOrder.map((item, index) => ({
        component_id: item.component_id,
        position: index + 1
      }))

      const result = await reorderComponents(orderArray)
      if (!result.success) {
        throw new Error(result.error)
      }

      // Clear optimistic state on success
      setOptimisticComponents([])
    } catch (err: any) {
      console.error('Failed to reorder components:', err)
      toast({
        title: 'Error',
        description: err.message || 'Failed to reorder components',
        variant: 'destructive'
      })
      // Revert optimistic update
      setOptimisticComponents([])
    }
  }, [selectedComponents, displayComponents, reorderComponents])

  // Handle custom field editing
  const handleEditCustom = useCallback(async (componentId: number, customTitle: string, customDescription: string) => {
    const component = displayComponents.find(c => c.component_id === componentId)
    if (!component) return

    try {
      const result = await setComponent(
        componentId,
        true, // include
        component.position,
        customTitle,
        customDescription
      )

      if (!result.success) {
        throw new Error(result.error)
      }
    } catch (err: any) {
      console.error('Failed to update custom fields:', err)
      toast({
        title: 'Error',
        description: err.message || 'Failed to update component',
        variant: 'destructive'
      })
    }
  }, [displayComponents, setComponent])

  // Handle component removal
  const handleRemove = useCallback(async (componentId: number) => {
    try {
      const result = await setComponent(componentId, false)
      if (!result.success) {
        throw new Error(result.error)
      }
    } catch (err: any) {
      console.error('Failed to remove component:', err)
      toast({
        title: 'Error',
        description: err.message || 'Failed to remove component',
        variant: 'destructive'
      })
    }
  }, [setComponent])

  // Handle adding available component
  const handleAddAvailable = useCallback(async (componentId: number) => {
    await handleToggle(componentId, true)
  }, [handleToggle])

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="text-sm text-gray-500">Loading components...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="text-sm text-red-500">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 bg-white">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Component Template for "{briefingTypeTitle}"
        </h3>
        <p className="text-sm text-gray-500">
          Configure which components are included in this briefing type and customize their labels.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-white">
        {/* Included Components */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-900">
              Included in Template ({selectedComponents.length})
            </h4>
          </div>

          {selectedComponents.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={selectedComponents.map(c => c.component_id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {selectedComponents.map((component) => (
                    <SortableComponentItem
                      key={component.component_id}
                      component={component}
                      onToggle={handleToggle}
                      onEditCustom={handleEditCustom}
                      onRemove={handleRemove}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-lg">
              <div className="text-sm">No components included yet</div>
              <div className="text-xs mt-1">Add components from the available list</div>
            </div>
          )}
        </div>

        {/* Available Components */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-900">
              Available Components ({availableComponents.length})
            </h4>
          </div>

          {availableComponents.length > 0 ? (
            <div className="space-y-2">
              {availableComponents.map((component) => (
                <AvailableComponentItem
                  key={component.component_id}
                  component={component}
                  onAdd={handleAddAvailable}
                />
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-lg">
              <div className="text-sm">All components are included</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
