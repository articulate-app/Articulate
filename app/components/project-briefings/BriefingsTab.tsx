"use client"

import React, { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../ui/dialog'
import { MultiSelect } from '../ui/multi-select'
import { toast } from '../ui/use-toast'
import { Plus, Star, Trash2, GripVertical } from 'lucide-react'
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
  type ProjectBriefingType,
  fetchAvailableBriefingTypes,
  addProjectBriefingType,
  removeProjectBriefingType,
  reorderProjectBriefingTypes,
  setDefaultBriefingType,
} from '../../lib/services/project-briefings'
import { ChannelsPerContentType } from './ConfigurationTab'

interface BriefingsTabProps {
  projectId: number
  briefingTypes: ProjectBriefingType[]
  selectedBriefingTypeId: number | null
  onBriefingSelect: (briefingTypeId: number | null) => void
  onRefresh: () => void
}

interface SortableBriefingItemProps {
  briefing: ProjectBriefingType
  isSelected: boolean
  onSelect: () => void
  onSetDefault: () => void
  onRemove: () => void
}

function SortableBriefingItem({
  briefing,
  isSelected,
  onSelect,
  onSetDefault,
  onRemove,
}: SortableBriefingItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: briefing.briefing_type_id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-lg p-4 bg-white border-gray-200 cursor-pointer transition-colors ${
        isSelected ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-gray-300'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-3">
        {/* Drag handle */}
        <div {...attributes} {...listeners} className="cursor-move p-1 hover:bg-gray-100 rounded">
          <GripVertical className="w-4 h-4 text-gray-400" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{briefing.display_title}</h3>
            {briefing.is_default && (
              <span className="text-xs text-blue-600 font-medium">Default</span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
            <span>{briefing.components_count} components</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSetDefault()
            }}
            className={`p-1 rounded hover:bg-gray-100 ${
              briefing.is_default ? 'text-yellow-500' : 'text-gray-400'
            }`}
            title={briefing.is_default ? 'Default briefing' : 'Set as default'}
          >
            <Star className={`w-4 h-4 ${briefing.is_default ? 'fill-current' : ''}`} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className="p-1 rounded hover:bg-red-50 text-red-500"
            title="Remove briefing type"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function BriefingsTab({
  projectId,
  briefingTypes,
  selectedBriefingTypeId,
  onBriefingSelect,
  onRefresh,
}: BriefingsTabProps) {
  const queryClient = useQueryClient()
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [selectedTypes, setSelectedTypes] = useState<number[]>([])

  // Fetch available briefing types
  const { data: availableTypes, isLoading: isLoadingAvailable } = useQuery({
    queryKey: ['projBriefings:available', projectId],
    queryFn: async () => {
      const { data, error } = await fetchAvailableBriefingTypes(projectId)
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

  const handleAddBriefingTypes = useCallback(async () => {
    if (selectedTypes.length === 0) return

    try {
      const promises = selectedTypes.map(typeId =>
        addProjectBriefingType(projectId, typeId, false, null)
      )

      await Promise.all(promises)

      toast({
        title: 'Success',
        description: `Added ${selectedTypes.length} briefing type(s)`,
      })

      setIsAddDialogOpen(false)
      setSelectedTypes([])
      queryClient.invalidateQueries({ queryKey: ['projBriefings:list', projectId] })
      onRefresh()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add briefing types',
        variant: 'destructive',
      })
    }
  }, [projectId, selectedTypes, queryClient, onRefresh])

  const handleRemove = useCallback(
    async (briefingTypeId: number) => {
      if (!confirm('Remove this briefing type from the project?')) return

      try {
        const { error } = await removeProjectBriefingType(projectId, briefingTypeId)
        if (error) throw error

        toast({
          title: 'Success',
          description: 'Briefing type removed',
        })

        if (selectedBriefingTypeId === briefingTypeId) {
          onBriefingSelect(null)
        }

        queryClient.invalidateQueries({ queryKey: ['projBriefings:list', projectId] })
        onRefresh()
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to remove briefing type',
          variant: 'destructive',
        })
      }
    },
    [projectId, selectedBriefingTypeId, onBriefingSelect, queryClient, onRefresh]
  )

  const handleSetDefault = useCallback(
    async (briefingTypeId: number) => {
      try {
        const { error } = await setDefaultBriefingType(projectId, briefingTypeId)
        if (error) throw error

        toast({
          title: 'Success',
          description: 'Default briefing type updated',
        })

        queryClient.invalidateQueries({ queryKey: ['projBriefings:list', projectId] })
        onRefresh()
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to set default briefing',
          variant: 'destructive',
        })
      }
    },
    [projectId, queryClient, onRefresh]
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event

      if (!over || active.id === over.id) return

      const oldIndex = briefingTypes.findIndex(
        bt => bt.briefing_type_id === active.id
      )
      const newIndex = briefingTypes.findIndex(
        bt => bt.briefing_type_id === over.id
      )

      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(briefingTypes, oldIndex, newIndex)
      const order = reordered.map((bt, idx) => ({
        briefing_type_id: bt.briefing_type_id,
        position: idx + 1,
      }))

      try {
        const { error } = await reorderProjectBriefingTypes(projectId, order)
        if (error) throw error

        queryClient.invalidateQueries({ queryKey: ['projBriefings:list', projectId] })
        onRefresh()
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to reorder briefings',
          variant: 'destructive',
        })
      }
    },
    [briefingTypes, projectId, queryClient, onRefresh]
  )

  const options =
    availableTypes?.map(t => ({
      id: String(t.id),
      label: t.title,
    })) || []

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Briefing Types</h2>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                Add Briefing Type
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Briefing Types</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                {isLoadingAvailable ? (
                  <div className="text-sm text-gray-500">Loading...</div>
                ) : options.length === 0 ? (
                  <div className="text-sm text-gray-500">All briefing types have been added</div>
                ) : (
                  <MultiSelect
                    options={options}
                    value={selectedTypes.map(String)}
                    onChange={(values) => setSelectedTypes(values.map(Number))}
                    placeholder="Select briefing types..."
                  />
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAddBriefingTypes}
                  disabled={selectedTypes.length === 0}
                >
                  Add Selected
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {briefingTypes.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12">
            <p className="text-gray-500 mb-4">No briefing types added yet</p>
            <Button size="sm" onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Briefing Type
            </Button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={briefingTypes.map(bt => bt.briefing_type_id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {briefingTypes.map(briefing => (
                  <SortableBriefingItem
                    key={briefing.briefing_type_id}
                    briefing={briefing}
                    isSelected={selectedBriefingTypeId === briefing.briefing_type_id}
                    onSelect={() => onBriefingSelect(briefing.briefing_type_id)}
                    onSetDefault={() => handleSetDefault(briefing.briefing_type_id)}
                    onRemove={() => handleRemove(briefing.briefing_type_id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Channels per Content Type Section */}
      <div className="border-t pt-8">
        <h2 className="text-xl font-semibold mb-4">Channels per Content Type</h2>
        <ChannelsPerContentType projectId={projectId} />
      </div>
    </div>
  )
}

