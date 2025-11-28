"use client"

import React, { useState, useCallback } from 'react'
import { Button } from '../../../app/components/ui/button'
import { Badge } from '../../../app/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../../../app/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../app/components/ui/select'
import { toast } from '../../../app/components/ui/use-toast'
import { Plus, Star, StarIcon, Trash2, GripVertical, ChevronDown, ChevronRight } from 'lucide-react'
import { useProjectBriefings, ProjectBriefingType, AvailableBriefingType } from './hooks/useProjectBriefings'
import { BriefingComponentTemplate } from './BriefingComponentTemplate'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface ProjectBriefingsPanelProps {
  projectId: number
  onBriefingTypesChanged?: () => void
}

interface SortableBriefingTypeItemProps {
  briefingType: ProjectBriefingType
  onRemove: (briefingTypeId: number) => void
  onSetDefault: (briefingTypeId: number) => void
  onManageComponents: (briefingType: ProjectBriefingType) => void
}

interface AvailableBriefingTypeItemProps {
  type: AvailableBriefingType
  isSelected: boolean
  onToggle: (typeId: number) => void
}

function SortableBriefingTypeItem({ 
  briefingType, 
  onRemove, 
  onSetDefault,
  onManageComponents
}: SortableBriefingTypeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: briefingType.briefing_type_id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div className="space-y-2">
      <div
        ref={setNodeRef}
        style={style}
        className={`flex items-center gap-3 p-3 border rounded-lg bg-white ${
          isDragging ? 'opacity-50' : ''
        } ${briefingType.is_default ? 'border-gray-300 bg-gray-50' : 'border-gray-200'}`}
      >
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="flex items-center justify-center w-6 h-6 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-gray-900">
              {briefingType.title}
            </span>
            {briefingType.is_default && (
              <Badge variant="outline" className="text-xs">
                Default
              </Badge>
            )}
            {briefingType.position && (
              <Badge variant="outline" className="text-xs">
                #{briefingType.position}
              </Badge>
            )}
          </div>
          {briefingType.description && (
            <div className="text-sm text-gray-600">
              {briefingType.description}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onManageComponents(briefingType)}
            className="px-3 py-1 text-xs bg-white text-gray-900 border-gray-300 hover:bg-gray-50"
          >
            Components
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onSetDefault(briefingType.briefing_type_id)}
            className={briefingType.is_default ? "text-black" : "text-gray-400 hover:text-black"}
          >
            {briefingType.is_default ? (
              <Star className="w-4 h-4 fill-current" />
            ) : (
              <StarIcon className="w-4 h-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onRemove(briefingType.briefing_type_id)}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
    </div>
  )
}

function AvailableBriefingTypeItem({ type, isSelected, onToggle }: AvailableBriefingTypeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="space-y-2">
      <div
        className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
          isSelected
            ? 'border-gray-300 bg-gray-50'
            : 'border-gray-200 bg-white hover:bg-gray-50'
        }`}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onToggle(type.id)
        }}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onToggle(type.id)
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onToggle(type.id)
          }}
          className="w-4 h-4 text-black border-gray-300 rounded focus:ring-black pointer-events-none"
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900">{type.title}</div>
          {type.description && (
            <div className="text-sm text-gray-500 mt-1">{type.description}</div>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsExpanded(!isExpanded)
          }}
          className="text-gray-600 hover:text-gray-800"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </Button>
      </div>
      
      {/* Expanded Components */}
      {isExpanded && (
        <div className="ml-6 p-3 bg-gray-50 rounded-lg border">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Components</div>
          <div className="text-sm text-gray-500">
            Component details will be loaded here...
          </div>
        </div>
      )}
    </div>
  )
}

export const ProjectBriefingsPanel = React.memo(function ProjectBriefingsPanel({ projectId, onBriefingTypesChanged }: ProjectBriefingsPanelProps) {
  console.log('🔍 ProjectBriefingsPanel: rendered with projectId:', projectId)
  const [selectedAvailableTypes, setSelectedAvailableTypes] = useState<number[]>([])
  const [isRemoving, setIsRemoving] = useState<number | null>(null)
  const [optimisticBriefingTypes, setOptimisticBriefingTypes] = useState<ProjectBriefingType[]>([])
  const [selectedBriefingTypeForComponents, setSelectedBriefingTypeForComponents] = useState<ProjectBriefingType | null>(null)

  const {
    briefingTypes,
    availableTypes,
    loading,
    error,
    addBriefingType,
    removeBriefingType,
    setDefaultBriefingType,
    reorderBriefingTypes,
    refresh
  } = useProjectBriefings(projectId)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Use optimistic state if available, otherwise use real data
  const displayBriefingTypes = optimisticBriefingTypes.length > 0 ? optimisticBriefingTypes : briefingTypes

  const handleToggleAvailableType = useCallback((typeId: number) => {
    setSelectedAvailableTypes(prev => {
      const newSelection = prev.includes(typeId) 
        ? prev.filter(id => id !== typeId)
        : [...prev, typeId]
      
      // Prevent glitching by ensuring smooth state updates
      return newSelection
    })
  }, [])

  const handleAddSelectedTypes = useCallback(async () => {
    if (selectedAvailableTypes.length === 0) return

    // Store current selection to prevent glitching
    const typesToAdd = [...selectedAvailableTypes]
    
    // Clear selection immediately to prevent UI glitching
    setSelectedAvailableTypes([])

    // Optimistic update
    const newBriefingTypes: ProjectBriefingType[] = typesToAdd.map((typeId, index) => ({
      project_id: projectId,
      briefing_type_id: typeId,
      title: availableTypes.find(t => t.id === typeId)?.title || '',
      description: availableTypes.find(t => t.id === typeId)?.description || null,
      is_default: false,
      position: briefingTypes.length + index + 1
    }))

    setOptimisticBriefingTypes(prev => [...prev, ...newBriefingTypes])

    try {
      // Add all selected types
      for (const typeId of typesToAdd) {
        const result = await addBriefingType(typeId, false)
        if (!result.success) {
          throw new Error(result.error)
        }
      }

      // Clear optimistic state and let real data show
      setOptimisticBriefingTypes([])

      // Notify parent of changes
      onBriefingTypesChanged?.()

      toast({
        title: "Briefing types added",
        description: `${typesToAdd.length} briefing type(s) have been added to this project.`,
      })
    } catch (error: any) {
      console.error('Failed to add briefing types:', error)
      toast({
        title: "Failed to add briefing types",
        description: error.message,
        variant: "destructive",
      })
      // Revert optimistic change
      setOptimisticBriefingTypes([])
    }
  }, [selectedAvailableTypes, projectId, availableTypes, briefingTypes.length, addBriefingType])

  const handleRemoveBriefingType = useCallback(async (briefingTypeId: number) => {
    setIsRemoving(briefingTypeId)

    // Optimistic update
    setOptimisticBriefingTypes(prev => prev.filter(bt => bt.briefing_type_id !== briefingTypeId))

    try {
      const result = await removeBriefingType(briefingTypeId)
      if (!result.success) {
        throw new Error(result.error)
      }

      // Clear optimistic state and let real data show
      setOptimisticBriefingTypes([])

      // Notify parent of changes
      onBriefingTypesChanged?.()

      toast({
        title: "Briefing type removed",
        description: "The briefing type has been removed from this project.",
      })
    } catch (error: any) {
      console.error('Failed to remove briefing type:', error)
      toast({
        title: "Failed to remove briefing type",
        description: error.message,
        variant: "destructive",
      })
      // Revert optimistic change
      setOptimisticBriefingTypes([])
    } finally {
      setIsRemoving(null)
    }
  }, [removeBriefingType])

  const handleSetDefaultBriefingType = useCallback(async (briefingTypeId: number) => {
    // Optimistic update
    setOptimisticBriefingTypes(prev => 
      prev.map(bt => ({
        ...bt,
        is_default: bt.briefing_type_id === briefingTypeId
      }))
    )

    try {
      const result = await setDefaultBriefingType(briefingTypeId)
      if (!result.success) {
        throw new Error(result.error)
      }

      // Clear optimistic state and let real data show
      setOptimisticBriefingTypes([])

      // Notify parent of changes
      onBriefingTypesChanged?.()

      toast({
        title: "Default briefing type updated",
        description: "The default briefing type has been updated.",
      })
    } catch (error: any) {
      console.error('Failed to set default briefing type:', error)
      toast({
        title: "Failed to update default briefing type",
        description: error.message,
        variant: "destructive",
      })
      // Revert optimistic change
      setOptimisticBriefingTypes([])
    }
  }, [setDefaultBriefingType])

  // Handle managing components for a briefing type
  const handleManageComponents = useCallback((briefingType: ProjectBriefingType) => {
    setSelectedBriefingTypeForComponents(briefingType)
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) return

    const oldIndex = displayBriefingTypes.findIndex(bt => bt.briefing_type_id === active.id)
    const newIndex = displayBriefingTypes.findIndex(bt => bt.briefing_type_id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const reorderedBriefingTypes = arrayMove(displayBriefingTypes, oldIndex, newIndex)
    
    // Optimistic update
    const newOptimisticState = reorderedBriefingTypes.map((bt, index) => ({
      ...bt,
      position: index + 1
    }))
    setOptimisticBriefingTypes(newOptimisticState)

    try {
      const orderArray = reorderedBriefingTypes.map((bt, index) => ({
        briefing_type_id: bt.briefing_type_id,
        position: index + 1
      }))

      const result = await reorderBriefingTypes(orderArray)
      if (!result.success) {
        throw new Error(result.error)
      }

      // Clear optimistic state and let real data show
      setOptimisticBriefingTypes([])

      // Notify parent of changes
      onBriefingTypesChanged?.()

    } catch (error: any) {
      console.error('Failed to reorder briefing types:', error)
      toast({
        title: "Failed to reorder briefing types",
        description: error.message,
        variant: "destructive",
      })
      // Revert optimistic change
      setOptimisticBriefingTypes([])
    }
  }, [displayBriefingTypes, reorderBriefingTypes])

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500">
        <div className="text-sm">Loading briefing types...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">
        <div className="text-sm font-medium">Error loading briefing types</div>
        <div className="text-xs mt-1">{error}</div>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={refresh}
          className="mt-2"
        >
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Step 1: Briefing Types or Step 2: Component Template */}
      {!selectedBriefingTypeForComponents ? (
        <>
          {/* Assigned Briefing Types */}
      {displayBriefingTypes.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Assigned Briefing Types</h4>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext 
            items={displayBriefingTypes.map(bt => bt.briefing_type_id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {displayBriefingTypes.map((briefingType) => (
                <SortableBriefingTypeItem
                  key={briefingType.briefing_type_id}
                  briefingType={briefingType}
                  onRemove={handleRemoveBriefingType}
                  onSetDefault={handleSetDefaultBriefingType}
                  onManageComponents={handleManageComponents}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        </div>
      )}

      {/* Available Briefing Types */}
      {availableTypes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Available Briefing Types</h4>
            {selectedAvailableTypes.length > 0 && (
              <Button
                size="sm"
                onClick={handleAddSelectedTypes}
                variant="outline"
                className="px-6"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add {selectedAvailableTypes.length} type{selectedAvailableTypes.length > 1 ? 's' : ''}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {availableTypes.map((type) => (
              <AvailableBriefingTypeItem
                key={type.id}
                type={type}
                isSelected={selectedAvailableTypes.includes(type.id)}
                onToggle={handleToggleAvailableType}
              />
            ))}
          </div>
        </div>
      )}

          {/* Empty state when no briefing types */}
          {displayBriefingTypes.length === 0 && availableTypes.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <div className="text-sm">No briefing types available.</div>
              <div className="text-xs mt-1">Contact your administrator to add briefing types to the system.</div>
            </div>
          )}
        </>
      ) : (
        /* Step 2: Component Template */
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => setSelectedBriefingTypeForComponents(null)}
              className="px-4 py-2"
            >
              ← Back
            </Button>
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                Component Template for "{selectedBriefingTypeForComponents.title}"
              </h3>
              <p className="text-sm text-gray-500">
                Configure which components are included in this briefing type
              </p>
            </div>
          </div>
          <BriefingComponentTemplate
            projectId={projectId}
            briefingTypeId={selectedBriefingTypeForComponents.briefing_type_id}
            briefingTypeTitle={selectedBriefingTypeForComponents.title}
          />
        </div>
      )}
    </div>
  )
}, (prevProps, nextProps) => {
  // Only re-render if projectId actually changes
  return prevProps.projectId === nextProps.projectId
})
