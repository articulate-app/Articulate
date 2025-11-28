"use client"

import React, { useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../ui/dialog'
import { MultiSelect } from '../ui/multi-select'
import { toast } from '../ui/use-toast'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { Plus, Star, Trash2, GripVertical, ChevronDown, ChevronRight, ChevronLeft, RotateCcw, Upload, FileText, Link as LinkIcon, Search } from 'lucide-react'
import { ImportReviewModal, type ImportedBriefingData, type OutlineItemResolution } from './ImportReviewModal'
import { DialogDescription } from '../ui/dialog'
import { Loader2 } from 'lucide-react'
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
import debounce from 'lodash.debounce'
import {
  type ProjectBriefingType,
  type ProjectBriefingComponent,
  fetchAvailableBriefingTypes,
  fetchProjectBriefingComponents,
  addProjectBriefingType,
  removeProjectBriefingType,
  reorderProjectBriefingTypes,
  setDefaultBriefingType,
  useGlobalTemplateForProjectBriefing,
  addGlobalComponentToBriefing,
  addProjectComponentToBriefing,
  updateBriefingComponent,
  removeBriefingComponent,
  reorderBriefingComponents,
  fetchProjectComponents,
  updateProjectBriefingMeta,
  createCustomBriefing,
  createProjectComponent,
  deleteProjectComponent,
  setBriefingConstraints,
  bulkAddProjectComponentsFromOutline,
} from '../../lib/services/project-briefings'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface ExpandableBriefingsListProps {
  projectId: number
  briefingTypes: ProjectBriefingType[]
  onRefresh: () => void
}

interface SortableBriefingItemProps {
  briefing: ProjectBriefingType
  isExpanded: boolean
  isSingleView?: boolean
  onToggle: () => void
  onSetDefault: () => void
  onRemove: () => void
  onUpdateMeta: (customTitle?: string | null, customDescription?: string | null) => void
  components: ProjectBriefingComponent[]
  onComponentUpdate: (componentId: number, source: 'global' | 'project', updates: { custom_title?: string; custom_description?: string }) => void
  onComponentRemove: (componentId: number, source: 'global' | 'project') => void
  onComponentReorder: (order: Array<{ component_id: number; is_project_component: boolean; position: number }>) => void
  onAddComponent: () => void
  onImportBriefing: () => void
  onResetTemplate: () => void
  contentTypes?: Array<{ id: number; title: string }>
  channels?: Array<{ id: number; name: string }>
  selectedContentTypeId?: number | null
  selectedChannelId?: number | null
  onContentTypeChange?: (id: number | null) => void
  onChannelChange?: (id: number | null) => void
  availableComponents?: Array<{ component_id: number; is_project_component: boolean; component_title: string; component_description: string | null }>
  projectId?: number
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
  const [isEditingDescription, setIsEditingDescription] = useState(false)

  React.useEffect(() => {
    setLocalTitle(component.effective_title)
    setLocalDescription(component.effective_description || '')
  }, [component])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const debouncedTitleUpdate = useMemo(
    () => debounce((value: string) => onTitleChange(value), 500),
    [onTitleChange]
  )

  const debouncedDescriptionUpdate = useMemo(
    () => debounce((value: string) => onDescriptionChange(value), 500),
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

  const handleDescriptionBlur = () => {
    setIsEditingDescription(false)
    if (localDescription !== (component.effective_description || '')) {
      debouncedDescriptionUpdate(localDescription)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded-lg p-3 bg-white border-gray-200"
    >
      <div className="flex items-start gap-3">
        <div {...attributes} {...listeners} className="cursor-move p-1 hover:bg-gray-200 rounded mt-1">
          <GripVertical className="w-3 h-3 text-gray-400" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={localTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="text-sm font-semibold border-none p-0 h-auto focus:ring-0 focus:border-none bg-transparent"
              placeholder="Component title"
            />
          </div>
          {isEditingDescription ? (
            <Textarea
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setLocalDescription(component.effective_description || '')
                  setIsEditingDescription(false)
                }
              }}
              className="text-xs text-gray-600 mt-1 min-h-[60px] resize-y"
              placeholder="Component description (optional)"
              autoFocus
              rows={3}
            />
          ) : (
            (component.effective_description || localDescription) ? (
              <p 
                className="text-xs text-gray-500 mt-1 cursor-text hover:text-gray-700 whitespace-pre-wrap"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsEditingDescription(true)
                }}
                title="Click to edit description"
              >
                {component.effective_description || localDescription}
              </p>
            ) : (
              <p 
                className="text-xs text-gray-400 mt-1 cursor-text hover:text-gray-600 italic"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsEditingDescription(true)
                }}
                title="Click to add description"
              >
                Click to add description
              </p>
            )
          )}
        </div>
        <button
          onClick={onRemove}
          className="p-1 rounded hover:bg-red-50 text-red-500"
          title="Remove component"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

function ExpandableBriefingItem({
  briefing,
  isExpanded,
  isSingleView = false,
  onToggle,
  onSetDefault,
  onRemove,
  onUpdateMeta,
  components,
  onComponentUpdate,
  onComponentRemove,
  onComponentReorder,
  onAddComponent,
  onImportBriefing,
  onResetTemplate,
  contentTypes = [],
  channels = [],
  selectedContentTypeId,
  selectedChannelId,
  onContentTypeChange,
  onChannelChange,
  availableComponents = [],
  projectId,
}: SortableBriefingItemProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [localTitle, setLocalTitle] = useState(briefing.display_title)
  const [localDescription, setLocalDescription] = useState(briefing.display_description || '')
  const [addingComponentId, setAddingComponentId] = useState<string | null>(null)
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()
  
  // Fetch allowed global components for the selected channel
  const { data: allowedGlobalComponents } = useQuery({
    queryKey: ['allowedGlobalComponents', selectedChannelId],
    queryFn: async () => {
      if (!selectedChannelId) return new Set<number>()
      
      const { data, error } = await supabase.rpc('briefing_components_for_channel', {
        p_channel_id: selectedChannelId
      })
      
      if (error) throw error
      
      // Return a Set of allowed global component IDs for fast lookup
      return new Set((data || []).map((c: any) => c.id))
    },
    enabled: !!selectedChannelId,
  })

  React.useEffect(() => {
    setLocalTitle(briefing.display_title)
    setLocalDescription(briefing.display_description || '')
  }, [briefing])

  const debouncedUpdateMeta = useMemo(
    () => debounce((title: string | null, description: string | null) => {
      onUpdateMeta(title, description)
    }, 500),
    [onUpdateMeta]
  )

  const handleTitleBlur = () => {
    setIsEditingTitle(false)
    if (localTitle !== briefing.display_title) {
      // Always pass both fields - use current custom_description to preserve it
      debouncedUpdateMeta(localTitle || null, briefing.custom_description ?? null)
    }
  }

  const handleDescriptionBlur = () => {
    setIsEditingDescription(false)
    if (localDescription !== (briefing.display_description || '')) {
      // Always pass both fields - use current custom_title to preserve it
      debouncedUpdateMeta(briefing.custom_title ?? null, localDescription || null)
    }
  }
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: briefing.briefing_type_id,
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event

      if (!over || active.id === over.id) return

      const oldIndex = components.findIndex(c => c.component_id === active.id)
      const newIndex = components.findIndex(c => c.component_id === over.id)

      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(components, oldIndex, newIndex)

      // If filters are active, use channel-specific reorder
      if (selectedContentTypeId && selectedChannelId && projectId) {
        try {
          // Extract UUIDs from the reordered components
          const componentIds = reordered
            .map((c: any) => c.channel_record_id)
            .filter((id: any): id is string => !!id)

          if (componentIds.length !== reordered.length) {
            throw new Error('Some components are missing channel record IDs')
          }

          const { error } = await supabase.rpc('pcctbc_reorder', {
            p_project_id: projectId,
            p_content_type_id: selectedContentTypeId,
            p_channel_id: selectedChannelId,
            p_briefing_type_id: briefing.briefing_type_id,
            p_component_ids: componentIds,
          })

          if (error) throw error

          toast({
            title: 'Success',
            description: 'Components reordered',
          })

          // Invalidate queries to refetch
          queryClient.invalidateQueries({
            queryKey: ['projBriefings:components', projectId, briefing.briefing_type_id, selectedContentTypeId, selectedChannelId],
          })
        } catch (error: any) {
          console.error('Error reordering components:', error)
          toast({
            title: 'Error',
            description: error.message || 'Failed to reorder components',
            variant: 'destructive',
          })
        }
      } else {
        // Otherwise, use template reorder
        const order = reordered.map((c, idx) => ({
          component_id: c.component_id,
          is_project_component: c.source === 'project',
          position: idx + 1,
        }))
        onComponentReorder(order)
      }
    },
    [components, selectedContentTypeId, selectedChannelId, projectId, briefing.briefing_type_id, supabase, queryClient, onComponentReorder]
  )

  const handleAddComponent = useCallback(
    async (comp: { component_id: number; is_project_component: boolean }) => {
      if (!projectId || !selectedContentTypeId || !selectedChannelId) {
        toast({
          title: 'Error',
          description: 'Project, content type, and channel must be selected',
          variant: 'destructive',
        })
        return
      }

      const compKey = `${comp.component_id}-${comp.is_project_component}`
      setAddingComponentId(compKey)

      try {
        const rpcName = comp.is_project_component ? 'pcctbc_add_project' : 'pcctbc_add_global'
        const paramName = comp.is_project_component ? 'p_project_component_id' : 'p_briefing_component_id'

        const { error } = await supabase.rpc(rpcName, {
          p_project_id: projectId,
          p_content_type_id: selectedContentTypeId,
          p_channel_id: selectedChannelId,
          p_briefing_type_id: briefing.briefing_type_id,
          [paramName]: comp.component_id,
        })

        if (error) throw error

        toast({
          title: 'Success',
          description: 'Component added',
        })

        // Invalidate queries to refetch
        queryClient.invalidateQueries({
          queryKey: ['projBriefings:components', projectId, briefing.briefing_type_id, selectedContentTypeId, selectedChannelId],
        })
        queryClient.invalidateQueries({
          queryKey: ['availableComponents', projectId, briefing.briefing_type_id, selectedContentTypeId, selectedChannelId],
        })
      } catch (error: any) {
        console.error('Error adding component:', error)
        toast({
          title: 'Error',
          description: error.message || 'Failed to add component',
          variant: 'destructive',
        })
      } finally {
        setAddingComponentId(null)
      }
    },
    [projectId, selectedContentTypeId, selectedChannelId, briefing.briefing_type_id, supabase, queryClient]
  )

  // Filter available components to show only those not already added
  const componentsToShow = useMemo(() => {
    return (availableComponents || []).filter((availComp, index, self) => {
      // Deduplicate based on component_id + is_project_component
      const firstIndex = self.findIndex(c => 
        c.component_id === availComp.component_id && 
        c.is_project_component === availComp.is_project_component
      )
      if (firstIndex !== index) return false
      
      // Show only components not already in the selected list
      const isSelected = components.some(c => {
        if (availComp.is_project_component) {
          return c.source === 'project' && c.component_id === availComp.component_id
        } else {
          return c.source === 'global' && c.component_id === availComp.component_id
        }
      })
      
      if (isSelected) return false
      
      // When channel is selected, filter global components by channel restrictions
      if (selectedChannelId && !availComp.is_project_component) {
        // For global components, only show if allowed for this channel
        if (!allowedGlobalComponents || !allowedGlobalComponents.has(availComp.component_id)) {
          return false
        }
      }
      
      return true
    })
  }, [availableComponents, components, selectedChannelId, allowedGlobalComponents])

  // Override remove handler when filters are active to call channel-specific removal
  const handleRemoveComponent = useCallback(
    async (componentId: number, source: 'global' | 'project') => {
      // If filters are active, remove from channel-specific list
      if (selectedContentTypeId && selectedChannelId && projectId) {
        try {
          // Use the correct parameter based on component source
          const params: any = {
            p_project_id: projectId,
            p_content_type_id: selectedContentTypeId,
            p_channel_id: selectedChannelId,
            p_briefing_type_id: briefing.briefing_type_id,
          }
          
          if (source === 'project') {
            params.p_project_component_id = componentId
          } else {
            params.p_briefing_component_id = componentId
          }

          const { error } = await supabase.rpc('pcctbc_remove', params)

          if (error) throw error

          toast({
            title: 'Success',
            description: 'Component removed',
          })

          // Invalidate queries to refetch
          queryClient.invalidateQueries({
            queryKey: ['projBriefings:components', projectId, briefing.briefing_type_id, selectedContentTypeId, selectedChannelId],
          })
          queryClient.invalidateQueries({
            queryKey: ['availableComponents', projectId, briefing.briefing_type_id],
          })
        } catch (error: any) {
          console.error('Error removing component:', error)
          toast({
            title: 'Error',
            description: error.message || 'Failed to remove component',
            variant: 'destructive',
          })
        }
      } else {
        // Otherwise, use the template removal function
        onComponentRemove(componentId, source)
      }
    },
    [selectedContentTypeId, selectedChannelId, projectId, briefing.briefing_type_id, supabase, queryClient, onComponentRemove]
  )

  // Override update handler when filters are active to call channel-specific update
  const handleUpdateComponent = useCallback(
    async (component: any, updates: { custom_title?: string; custom_description?: string }) => {
      // If filters are active, update channel-specific record
      if (selectedContentTypeId && selectedChannelId && projectId) {
        try {
          const { error } = await supabase.rpc('pcctbc_update', {
            p_project_id: projectId,
            p_content_type_id: selectedContentTypeId,
            p_channel_id: selectedChannelId,
            p_briefing_type_id: briefing.briefing_type_id,
            p_component_id: component.component_id,
            p_is_project_component: component.source === 'project',
            p_custom_title: updates.custom_title ?? null,
            p_custom_description: updates.custom_description ?? null,
          })

          if (error) throw error

          // Invalidate queries to refetch
          queryClient.invalidateQueries({
            queryKey: ['projBriefings:components', projectId, briefing.briefing_type_id, selectedContentTypeId, selectedChannelId],
          })
        } catch (error: any) {
          console.error('Error updating component:', error)
          toast({
            title: 'Error',
            description: error.message || 'Failed to update component',
            variant: 'destructive',
          })
        }
      } else {
        // Otherwise, use the template update function
        onComponentUpdate(component.component_id, component.source, updates)
      }
    },
    [selectedContentTypeId, selectedChannelId, projectId, briefing.briefing_type_id, supabase, queryClient, onComponentUpdate]
  )

  return (
    <div ref={setNodeRef} style={style} className={`rounded-lg bg-white overflow-hidden ${!isExpanded ? 'border border-gray-200' : ''}`}>
      {/* Briefing Header */}
      <div
        className={`flex items-center gap-3 p-4 ${!isSingleView ? 'cursor-pointer hover:bg-gray-50' : ''} transition-colors`}
        onClick={!isSingleView ? onToggle : undefined}
      >
        {/* Drag handle - hide in single view */}
        {!isSingleView && (
          <div {...attributes} {...listeners} className="cursor-move p-1 hover:bg-gray-100 rounded">
            <GripVertical className="w-4 h-4 text-gray-400" />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isEditingTitle ? (
              <Input
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleTitleBlur()
                  } else if (e.key === 'Escape') {
                    setLocalTitle(briefing.display_title)
                    setIsEditingTitle(false)
                  }
                }}
                className="text-sm font-semibold border border-blue-500 focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            ) : (
              <h3 
                className="text-sm font-semibold text-gray-900 cursor-text hover:text-blue-600"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsEditingTitle(true)
                }}
                title="Click to edit title"
              >
                {briefing.display_title}
              </h3>
            )}
            {briefing.is_default && (
              <span className="text-xs text-blue-600 font-medium">Default</span>
            )}
          </div>
          {isEditingDescription ? (
            <Textarea
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setLocalDescription(briefing.display_description || '')
                  setIsEditingDescription(false)
                }
              }}
              className="text-xs text-gray-600 mt-1 min-h-[60px] resize-y"
              placeholder="Description (optional)"
              autoFocus
              rows={3}
            />
          ) : (
            (briefing.display_description || localDescription) && (
              <p 
                className="text-xs text-gray-500 mt-1 cursor-text hover:text-gray-700 whitespace-pre-wrap"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsEditingDescription(true)
                }}
                title="Click to edit description"
              >
                {briefing.display_description || localDescription}
              </p>
            )
          )}
          {!isEditingDescription && !briefing.display_description && (
            <p 
              className="text-xs text-gray-400 mt-1 cursor-text hover:text-gray-600 italic"
              onClick={(e) => {
                e.stopPropagation()
                setIsEditingDescription(true)
              }}
              title="Click to add description"
            >
              Click to add description
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onSetDefault}
            className={`p-1 rounded hover:bg-gray-100 ${
              briefing.is_default ? 'text-yellow-500' : 'text-gray-400'
            }`}
            title={briefing.is_default ? 'Default briefing' : 'Set as default'}
          >
            <Star className={`w-4 h-4 ${briefing.is_default ? 'fill-current' : ''}`} />
          </button>
          <button
            onClick={onRemove}
            className="p-1 rounded hover:bg-red-50 text-red-500"
            title="Remove briefing type"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        
        {/* Expand/Collapse Icon - hide in single view */}
        {!isSingleView && (
          <div className="flex-shrink-0">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </div>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="bg-white">
          <div className="p-4 space-y-3">
            {/* Filter Pills */}
            {contentTypes.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 pb-4">
                {/* Content Type Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">Content Type:</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => onContentTypeChange?.(null)}
                      className={`px-3 py-1 text-sm rounded-md transition-colors ${
                        !selectedContentTypeId
                          ? 'bg-black text-white'
                          : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      All
                    </button>
                    {contentTypes.map((ct) => (
                      <button
                        key={ct.id}
                        onClick={() => onContentTypeChange?.(ct.id)}
                        className={`px-3 py-1 text-sm rounded-md transition-colors ${
                          selectedContentTypeId === ct.id
                            ? 'bg-black text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                        }`}
                      >
                        {ct.title}
                      </button>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => {
                        // TODO: Open content type dialog
                        toast({
                          title: 'Add Content Type',
                          description: 'This will open the content type creation dialog',
                        })
                      }}
                      title="Add Content Type"
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                
                {/* Channel Filter */}
                {selectedContentTypeId && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">Channel:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {channels.length === 0 ? (
                        <span className="text-sm text-gray-400 italic py-1">No channels available</span>
                      ) : (
                        <>
                          {channels.map((ch) => (
                            <button
                              key={ch.id}
                              onClick={() => onChannelChange?.(ch.id)}
                              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                                selectedChannelId === ch.id
                                  ? 'bg-black text-white'
                                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                              }`}
                            >
                              {ch.name}
                            </button>
                          ))}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => {
                              // TODO: Open channel dialog
                              toast({
                                title: 'Add Channel',
                                description: 'This will open the channel creation dialog',
                              })
                            }}
                            title="Add Channel"
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Components List */}
            {components.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-500">
                No components assigned yet
              </div>
            ) : (
              <div>
                <div className="mb-3">
                  <span className="text-xs text-gray-500">Selected Components ({components.length})</span>
                </div>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={components.map(c => c.component_id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {components.map(component => (
                        <SortableComponentItem
                          key={component.component_id}
                          component={component}
                          onTitleChange={(value) =>
                            handleUpdateComponent(component, { custom_title: value })
                          }
                          onDescriptionChange={(value) =>
                            handleUpdateComponent(component, { custom_description: value })
                          }
                          onRemove={() => handleRemoveComponent(component.component_id, component.source)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}

            {/* Available to Add Section */}
            {componentsToShow.length > 0 && (
              <div className="mt-12">
                <div className="mb-3">
                  <span className="text-xs text-gray-500">Unassigned Components</span>
                </div>
                <div className="space-y-2">
                  {componentsToShow.map((availComp) => {
                    const compKey = `${availComp.component_id}-${availComp.is_project_component}`
                    const isAdding = addingComponentId === compKey
                    
                    return (
                      <div
                        key={compKey}
                        className="border rounded-lg p-3 bg-white border-gray-200"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-gray-900">
                              {availComp.component_title}
                            </h4>
                            {availComp.component_description && (
                              <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">
                                {availComp.component_description}
                              </p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAddComponent(availComp)}
                            disabled={isAdding || (!selectedContentTypeId || !selectedChannelId)}
                            title={!selectedContentTypeId || !selectedChannelId ? 'Select a content type and channel to add' : ''}
                          >
                            {isAdding ? (
                              <>
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                Adding...
                              </>
                            ) : (
                              <>
                                <Plus className="w-3 h-3 mr-1" />
                                Add
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Actions Footer */}
            <div className="flex items-center gap-2 pt-6 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={onAddComponent}
              >
                <Plus className="w-4 h-4" />
                Add Component
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={onImportBriefing}
              >
                <Upload className="w-4 h-4" />
                Import from File/Link
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={onResetTemplate}
              >
                <RotateCcw className="w-4 h-4" />
                Reset Template
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function ExpandableBriefingsList({
  projectId,
  briefingTypes,
  onRefresh,
}: ExpandableBriefingsListProps) {
  const queryClient = useQueryClient()
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  
  const [expandedBriefings, setExpandedBriefings] = useState<Set<number>>(new Set())
  const [singleBriefingView, setSingleBriefingView] = useState<number | null>(null)
  const [isAddDialogOpen, setAddDialogOpen] = useState(false)
  const [isNewBriefingDialogOpen, setIsNewBriefingDialogOpen] = useState(false)
  const [newBriefingTitle, setNewBriefingTitle] = useState('')
  const [newBriefingDescription, setNewBriefingDescription] = useState('')
  const [isAddComponentDialogOpen, setAddComponentDialogOpen] = useState(false)
  const [activeBriefingTypeId, setActiveBriefingTypeId] = useState<number | null>(null)
  const [selectedTypes, setSelectedTypes] = useState<number[]>([])
  const [selectedGlobalComponents, setSelectedGlobalComponents] = useState<number[]>([])
  const [selectedProjectComponents, setSelectedProjectComponents] = useState<number[]>([])
  const [isCreatingNewComponent, setIsCreatingNewComponent] = useState(false)
  const [newComponentTitle, setNewComponentTitle] = useState('')
  const [newComponentDescription, setNewComponentDescription] = useState('')
  const [componentSearchQuery, setComponentSearchQuery] = useState('')
  const [componentToDelete, setComponentToDelete] = useState<{ id: number; title: string; isProject: boolean } | null>(null)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importMethod, setImportMethod] = useState<'file' | 'url'>('file')
  const [isDragActive, setIsDragActive] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importedBriefingData, setImportedBriefingData] = useState<ImportedBriefingData | null>(null)
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false)
  const [projectLibrary, setProjectLibrary] = useState<Array<{ id: number; title: string }> | null>(null)
  const [briefingComponents, setBriefingComponents] = useState<Array<{ component_id: number; effective_title: string; source: 'global' | 'project' }> | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [isResetConfirmationOpen, setIsResetConfirmationOpen] = useState(false)
  const [resetBriefingTypeId, setResetBriefingTypeId] = useState<number | null>(null)

  // Fetch available briefing types
  const { data: availableTypes, isLoading: isLoadingAvailable } = useQuery({
    queryKey: ['projBriefings:available', projectId],
    queryFn: async () => {
      const { data, error } = await fetchAvailableBriefingTypes(projectId)
      if (error) throw error
      return data || []
    },
  })

  // Fetch global components for selected briefing - need briefing type for this
  // For custom briefings, we'll need to fetch from a different source or handle differently
  const { data: globalComponents } = useQuery({
    queryKey: ['globalBriefingComponents', activeBriefingTypeId],
    queryFn: async () => {
      if (!activeBriefingTypeId) return []
      
      // For custom briefings, there might not be global components
      // We need to check if this is a custom briefing or standard one
      // For now, try to fetch - if it fails, return empty
      try {
        const { data, error } = await supabase
          .from('briefing_types_components')
          .select('briefing_component_id, briefing_components!inner(id, title, description)')
          .eq('briefing_type_id', activeBriefingTypeId)
          .order('position', { ascending: true, nullsFirst: false })

        if (error) return []
        return data || []
      } catch {
        return []
      }
    },
    enabled: !!activeBriefingTypeId && isAddComponentDialogOpen,
  })

  // Fetch project components
  const { data: projectComponents } = useQuery({
    queryKey: ['projBriefings:library', projectId],
    queryFn: async () => {
      const { data, error } = await fetchProjectComponents(projectId)
      if (error) throw error
      return data || []
    },
    enabled: isAddComponentDialogOpen,
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )


  const toggleBriefing = useCallback((briefingTypeId: number) => {
    setExpandedBriefings(prev => {
      const next = new Set(prev)
      if (next.has(briefingTypeId)) {
        next.delete(briefingTypeId)
      } else {
        next.add(briefingTypeId)
      }
      return next
    })
  }, [])

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

      setAddDialogOpen(false)
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

  const handleCreateNewBriefing = useCallback(async () => {
    if (!newBriefingTitle.trim()) {
      toast({
        title: 'Error',
        description: 'Title is required',
        variant: 'destructive',
      })
      return
    }

    try {
      const { data: newBriefing, error } = await createCustomBriefing(
        projectId,
        newBriefingTitle.trim(),
        newBriefingDescription.trim() || null
      )

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Briefing created',
      })

      setIsNewBriefingDialogOpen(false)
      setNewBriefingTitle('')
      setNewBriefingDescription('')
      queryClient.invalidateQueries({ queryKey: ['projBriefings:list', projectId] })
      onRefresh()

      // Auto-select and expand the new briefing
      if (newBriefing) {
        setExpandedBriefings(prev => new Set([...Array.from(prev), newBriefing.briefing_type_id]))
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create briefing',
        variant: 'destructive',
      })
    }
  }, [projectId, newBriefingTitle, newBriefingDescription, queryClient, onRefresh])

  const [isRemoveConfirmationOpen, setIsRemoveConfirmationOpen] = useState(false)
  const [removeBriefingTypeId, setRemoveBriefingTypeId] = useState<number | null>(null)

  const handleOpenRemoveConfirmation = useCallback((briefingTypeId: number) => {
    setRemoveBriefingTypeId(briefingTypeId)
    setIsRemoveConfirmationOpen(true)
  }, [])

  const handleRemoveBriefing = useCallback(
    async () => {
      if (!removeBriefingTypeId) return

      try {
        const { error } = await removeProjectBriefingType(projectId, removeBriefingTypeId)
        if (error) throw error

        toast({
          title: 'Success',
          description: 'Briefing type removed',
        })

        setExpandedBriefings(prev => {
          const next = new Set(prev)
          next.delete(removeBriefingTypeId)
          return next
        })

        setIsRemoveConfirmationOpen(false)
        setRemoveBriefingTypeId(null)
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
    [projectId, removeBriefingTypeId, queryClient, onRefresh]
  )

  const handleUpdateMeta = useCallback(
    async (briefingTypeId: number, customTitle?: string | null, customDescription?: string | null) => {
      try {
        const { error } = await updateProjectBriefingMeta(projectId, briefingTypeId, customTitle ?? null, customDescription ?? null)
        if (error) throw error

        // Optimistic update
        queryClient.setQueryData(['projBriefings:list', projectId], (old: ProjectBriefingType[] | undefined) => {
          if (!old) return old
          return old.map(bt => {
            if (bt.briefing_type_id === briefingTypeId) {
              return {
                ...bt,
                display_title: customTitle ?? bt.display_title,
                display_description: customDescription ?? bt.display_description,
                custom_title: customTitle ?? bt.custom_title,
                custom_description: customDescription ?? bt.custom_description,
              }
            }
            return bt
          })
        })

        queryClient.invalidateQueries({ queryKey: ['projBriefings:list', projectId] })
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to update briefing',
          variant: 'destructive',
        })
      }
    },
    [projectId, queryClient]
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

      const oldIndex = briefingTypes.findIndex(bt => bt.briefing_type_id === active.id)
      const newIndex = briefingTypes.findIndex(bt => bt.briefing_type_id === over.id)

      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(briefingTypes, oldIndex, newIndex)
      const order = reordered.map((bt, idx) => ({
        briefing_type_id: bt.briefing_type_id,
        position: idx + 1,
      }))

      // Optimistic update
      queryClient.setQueryData(['projBriefings:list', projectId], reordered)

      try {
        const { error } = await reorderProjectBriefingTypes(projectId, order)
        if (error) throw error

        // Refetch to ensure sync with server
        queryClient.invalidateQueries({ queryKey: ['projBriefings:list', projectId] })
        onRefresh()
      } catch (error: any) {
        // Revert on error
        queryClient.setQueryData(['projBriefings:list', projectId], briefingTypes)
        toast({
          title: 'Error',
          description: error.message || 'Failed to reorder briefings',
          variant: 'destructive',
        })
      }
    },
    [briefingTypes, projectId, queryClient, onRefresh]
  )

  const handleComponentUpdate = useCallback(
    async (briefingTypeId: number, componentId: number, source: 'global' | 'project', updates: { custom_title?: string; custom_description?: string }) => {
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
    [projectId, queryClient]
  )

  const handleComponentRemove = useCallback(
    async (briefingTypeId: number, componentId: number, source: 'global' | 'project') => {
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
    [projectId, queryClient, onRefresh]
  )

  const handleComponentReorder = useCallback(
    async (briefingTypeId: number, order: Array<{ component_id: number; is_project_component: boolean; position: number }>) => {
      // Get current components for optimistic update
      const currentComponents = queryClient.getQueryData<ProjectBriefingComponent[]>([
        'projBriefings:components',
        projectId,
        briefingTypeId
      ]) || []

      // Reorder components optimistically
      const reordered = order.map(({ component_id, is_project_component }) => {
        return currentComponents.find(c => 
          c.component_id === component_id && 
          (is_project_component ? c.source === 'project' : c.source === 'global')
        )!
      }).filter(Boolean)

      // Optimistic update
      queryClient.setQueryData(
        ['projBriefings:components', projectId, briefingTypeId],
        reordered.map((c, idx) => ({ ...c, position: idx + 1 }))
      )

      try {
        const { error } = await reorderBriefingComponents(projectId, briefingTypeId, order)
        if (error) throw error

        // Refetch to ensure sync with server
        queryClient.invalidateQueries({ 
          queryKey: ['projBriefings:components', projectId, briefingTypeId] 
        })
        onRefresh()
      } catch (error: any) {
        // Revert on error
        queryClient.setQueryData(
          ['projBriefings:components', projectId, briefingTypeId],
          currentComponents
        )
        toast({
          title: 'Error',
          description: error.message || 'Failed to reorder components',
          variant: 'destructive',
        })
      }
    },
    [projectId, queryClient, onRefresh]
  )

  const handleOpenResetConfirmation = useCallback((briefingTypeId: number) => {
    setResetBriefingTypeId(briefingTypeId)
    setIsResetConfirmationOpen(true)
  }, [])

  const handleResetTemplate = useCallback(
    async () => {
      if (!resetBriefingTypeId) return

      try {
        const { error } = await useGlobalTemplateForProjectBriefing(projectId, resetBriefingTypeId)
        if (error) throw error

        toast({
          title: 'Success',
          description: 'Using global template',
        })

        setIsResetConfirmationOpen(false)
        setResetBriefingTypeId(null)
        queryClient.invalidateQueries({ 
          queryKey: ['projBriefings:components', projectId, resetBriefingTypeId] 
        })
        onRefresh()
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to use global template',
          variant: 'destructive',
        })
      }
    },
    [projectId, resetBriefingTypeId, queryClient, onRefresh]
  )

  const handleOpenAddComponent = useCallback((briefingTypeId: number) => {
    setActiveBriefingTypeId(briefingTypeId)
    setSelectedGlobalComponents([])
    setSelectedProjectComponents([])
    setNewComponentTitle('')
    setNewComponentDescription('')
    setAddComponentDialogOpen(true)
  }, [])

  const handleAddComponents = useCallback(async () => {
    if (!activeBriefingTypeId || (selectedGlobalComponents.length === 0 && selectedProjectComponents.length === 0)) return

    try {
      const promises: Promise<any>[] = []

      // Add global components
      selectedGlobalComponents.forEach(componentId => {
        promises.push(
          addGlobalComponentToBriefing(
            projectId,
            activeBriefingTypeId,
            componentId,
            null,
            null,
            null
          )
        )
      })

      // Add project components
      selectedProjectComponents.forEach(componentId => {
        promises.push(
          addProjectComponentToBriefing(
            projectId,
            activeBriefingTypeId,
            componentId,
            null,
            null,
            null
          )
        )
      })

      await Promise.all(promises)

      toast({
        title: 'Success',
        description: `Added ${selectedGlobalComponents.length + selectedProjectComponents.length} component(s)`,
      })

      setAddComponentDialogOpen(false)
      setSelectedGlobalComponents([])
      setSelectedProjectComponents([])
      setComponentSearchQuery('')
      setIsCreatingNewComponent(false)
      setNewComponentTitle('')
      setNewComponentDescription('')
      queryClient.invalidateQueries({ 
        queryKey: ['projBriefings:components', projectId, activeBriefingTypeId] 
      })
      onRefresh()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add components',
        variant: 'destructive',
      })
    }
  }, [projectId, activeBriefingTypeId, selectedGlobalComponents, selectedProjectComponents, queryClient, onRefresh])

  const handleCreateAndAddComponent = useCallback(async () => {
    if (!activeBriefingTypeId || !newComponentTitle.trim()) {
      toast({
        title: 'Error',
        description: 'Component title is required',
        variant: 'destructive',
      })
      return
    }

    try {
      setIsCreatingNewComponent(true)

      // Create the component
      const { data: newComponent, error: createError } = await createProjectComponent(
        projectId,
        newComponentTitle.trim(),
        newComponentDescription.trim() || null,
        null
      )

      if (createError) throw createError
      if (!newComponent) throw new Error('Failed to create component')

      // Add to briefing
      const { error: addError } = await addProjectComponentToBriefing(
        projectId,
        activeBriefingTypeId,
        newComponent.id,
        null,
        null,
        null
      )

      if (addError) throw addError

      toast({
        title: 'Success',
        description: 'Component created and added',
      })

      setNewComponentTitle('')
      setNewComponentDescription('')
      setIsCreatingNewComponent(false)
      queryClient.invalidateQueries({ 
        queryKey: ['projBriefings:components', projectId, activeBriefingTypeId] 
      })
      queryClient.invalidateQueries({ 
        queryKey: ['projBriefings:library', projectId] 
      })
      onRefresh()
    } catch (error: any) {
      setIsCreatingNewComponent(false)
      toast({
        title: 'Error',
        description: error.message || 'Failed to create component',
        variant: 'destructive',
      })
    }
  }, [projectId, activeBriefingTypeId, newComponentTitle, newComponentDescription, queryClient, onRefresh])

  const handleDeleteComponent = useCallback(async () => {
    if (!componentToDelete) return

    try {
      const { error } = await deleteProjectComponent(componentToDelete.id)
      if (error) throw error

      toast({
        title: 'Success',
        description: 'Component deleted successfully',
      })

      setIsDeleteConfirmOpen(false)
      setComponentToDelete(null)
      
      // Remove from selections if it was selected
      setSelectedProjectComponents(prev => prev.filter(id => id !== componentToDelete.id))
      
      // Refresh the component lists
      queryClient.invalidateQueries({ 
        queryKey: ['projBriefings:library', projectId] 
      })
      queryClient.invalidateQueries({ 
        queryKey: ['globalBriefingComponents', activeBriefingTypeId] 
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete component',
        variant: 'destructive',
      })
    }
  }, [componentToDelete, projectId, activeBriefingTypeId, queryClient])

  const handleImportBriefing = useCallback(async () => {
    if (importMethod === 'file' && !importFile) {
      toast({
        title: 'Error',
        description: 'Please select a file to upload',
        variant: 'destructive',
      })
      return
    }

    if (importMethod === 'url' && !importUrl.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a URL',
        variant: 'destructive',
      })
      return
    }

    try {
      setIsImporting(true)

      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No access token available')
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl) {
        throw new Error('Missing Supabase URL')
      }

      // Load project library and briefing components in parallel
      const [projectLibData, briefingComponentsData] = await Promise.all([
        supabase
          .from('project_briefing_components')
          .select('id, title')
          .eq('project_id', projectId),
        activeBriefingTypeId
          ? supabase
              .from('v_project_briefing_types_components_resolved')
              .select('component_id, effective_title, source')
              .eq('project_id', projectId)
              .eq('briefing_type_id', activeBriefingTypeId)
          : Promise.resolve({ data: [], error: null }),
      ])

      if (projectLibData.error) {
        console.warn('Failed to load project library:', projectLibData.error)
      } else {
        setProjectLibrary(projectLibData.data || [])
      }

      if (briefingComponentsData.error) {
        console.warn('Failed to load briefing components:', briefingComponentsData.error)
      } else {
        setBriefingComponents((briefingComponentsData.data || []) as Array<{ component_id: number; effective_title: string; source: 'global' | 'project' }>)
      }

      let response: Response

      if (importMethod === 'file' && importFile) {
        // File upload using FormData
        const form = new FormData()
        form.append('project_id', projectId.toString())
        form.append('file', importFile)

        response = await fetch(`${supabaseUrl}/functions/v1/parse_briefing_structure`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            // Do not set Content-Type - browser sets it automatically with boundary
          },
          body: form,
        })
      } else {
        // URL/text using JSON
        response = await fetch(`${supabaseUrl}/functions/v1/parse_briefing_structure`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            project_id: projectId,
            source_url: importUrl.trim(),
          }),
        })
      }

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Import failed: ${response.status} ${errorText}`)
      }

      const result = await response.json()
      
      if (result.error) {
        throw new Error(result.error)
      }

      if (result.briefing && result.outline && result.constraints) {
        setImportedBriefingData(result as ImportedBriefingData)
        setIsReviewModalOpen(true)
        setIsImportDialogOpen(false)
        setImportUrl('')
        setImportFile(null)
      } else {
        throw new Error('Invalid response format')
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to import briefing',
        variant: 'destructive',
      })
    } finally {
      setIsImporting(false)
    }
  }, [importMethod, importFile, importUrl, projectId, supabase])

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setImportFile(e.dataTransfer.files[0])
      setImportMethod('file')
    }
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setImportFile(e.target.files[0])
      setImportMethod('file')
    }
  }, [])

  // Fetch current components for active briefing (to filter out already added)
  const { data: currentComponents } = useQuery({
    queryKey: ['projBriefings:components', projectId, activeBriefingTypeId],
    queryFn: async () => {
      if (!activeBriefingTypeId) return []
      const { data, error } = await fetchProjectBriefingComponents(projectId, activeBriefingTypeId)
      if (error) throw error
      return data || []
    },
    enabled: !!activeBriefingTypeId && isAddComponentDialogOpen,
  })


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
        <div className="flex gap-2">
          {singleBriefingView ? (
            // Show "Add Component" when viewing a single briefing
            <Dialog 
              open={isAddComponentDialogOpen} 
              onOpenChange={(open) => {
                setAddComponentDialogOpen(open)
                if (!open) {
                  setComponentSearchQuery('')
                  setSelectedGlobalComponents([])
                  setSelectedProjectComponents([])
                  setIsCreatingNewComponent(false)
                  setNewComponentTitle('')
                  setNewComponentDescription('')
                }
              }}
            >
              <DialogTrigger asChild>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="gap-2 bg-white text-black hover:bg-gray-50 border-gray-300"
                  onClick={() => {
                    setActiveBriefingTypeId(singleBriefingView)
                    setComponentSearchQuery('')
                    setSelectedGlobalComponents([])
                    setSelectedProjectComponents([])
                    setIsCreatingNewComponent(false)
                    setNewComponentTitle('')
                    setNewComponentDescription('')
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Add Component
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                  <div className="flex items-center gap-2">
                    {isCreatingNewComponent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-1 h-auto -ml-2"
                        onClick={() => {
                          setIsCreatingNewComponent(false)
                          setNewComponentTitle('')
                          setNewComponentDescription('')
                        }}
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </Button>
                    )}
                    <DialogTitle>{isCreatingNewComponent ? 'Create New Component' : 'Add Components'}</DialogTitle>
                  </div>
                </DialogHeader>
                
                {!isCreatingNewComponent ? (
                  <>
                    {/* Search Bar */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        type="search"
                        placeholder="Search components..."
                        value={componentSearchQuery}
                        onChange={(e) => setComponentSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    
                    {/* Components List */}
                    <div className="flex-1 overflow-y-auto py-4 pr-0 -mr-6">
                      <div className="pr-6 space-y-3">
                  {/* Global Components */}
                  {globalComponents && globalComponents.length > 0 && globalComponents
                    .map(item => {
                      const component = item.briefing_components?.[0]
                      return component ? { ...item, component } : null
                    })
                    .filter(item => {
                      if (!item) return false
                      if (!componentSearchQuery.trim()) return true
                      const query = componentSearchQuery.toLowerCase()
                      return (
                        item.component.title?.toLowerCase().includes(query) ||
                        item.component.description?.toLowerCase().includes(query)
                      )
                    })
                    .map(item => {
                      if (!item) return null
                      const component = item.component
                      const isSelected = selectedGlobalComponents.includes(component.id)
                      return (
                      <div
                        key={`global-${component.id}`}
                        className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => {
                          setSelectedGlobalComponents(prev =>
                            prev.includes(component.id)
                              ? prev.filter(id => id !== component.id)
                              : [...prev, component.id]
                          )
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-semibold text-gray-900">{component.title}</h3>
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                Global
                              </span>
                            </div>
                            {component.description && (
                              <p className="text-sm text-gray-600 mt-1">{component.description}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {/* Project Components */}
                  {projectComponents && projectComponents.length > 0 && projectComponents
                    .filter(component => {
                      if (!componentSearchQuery.trim()) return true
                      const query = componentSearchQuery.toLowerCase()
                      return (
                        component.title?.toLowerCase().includes(query) ||
                        component.description?.toLowerCase().includes(query)
                      )
                    })
                    .map(component => {
                      const isSelected = selectedProjectComponents.includes(component.id)
                      return (
                      <div
                        key={`project-${component.id}`}
                        className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => {
                          setSelectedProjectComponents(prev =>
                            prev.includes(component.id)
                              ? prev.filter(id => id !== component.id)
                              : [...prev, component.id]
                          )
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-semibold text-gray-900">{component.title}</h3>
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                Project
                              </span>
                            </div>
                            {component.description && (
                              <p className="text-sm text-gray-600 mt-1">{component.description}</p>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setComponentToDelete({
                                id: component.id,
                                title: component.title,
                                isProject: true
                              })
                              setIsDeleteConfirmOpen(true)
                            }}
                            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                            title="Delete component"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })}

                        {(!globalComponents || globalComponents.length === 0) && (!projectComponents || projectComponents.length === 0) && (
                          <div className="text-center py-8 text-gray-500">
                            <p>No components available. Create a new one using the button below.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <DialogFooter className="flex items-center justify-between">
                      <Button 
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                          setIsCreatingNewComponent(true)
                          setNewComponentTitle('')
                          setNewComponentDescription('')
                        }}
                      >
                        <Plus className="w-3 h-3" />
                        Create New
                      </Button>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => {
                          setAddComponentDialogOpen(false)
                          setIsCreatingNewComponent(false)
                          setNewComponentTitle('')
                          setNewComponentDescription('')
                          setComponentSearchQuery('')
                        }}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleAddComponents}
                          disabled={selectedGlobalComponents.length === 0 && selectedProjectComponents.length === 0}
                        >
                          Add Selected ({selectedGlobalComponents.length + selectedProjectComponents.length})
                        </Button>
                      </div>
                    </DialogFooter>
                  </>
                ) : (
                  <>
                    {/* Full-Window Create Component Form */}
                    <div className="flex-1 flex flex-col space-y-4 py-4">
                      <div>
                        <Label htmlFor="create-comp-title">Component Title *</Label>
                        <Input
                          id="create-comp-title"
                          value={newComponentTitle}
                          onChange={(e) => setNewComponentTitle(e.target.value)}
                          placeholder="Enter component title"
                          autoFocus
                        />
                      </div>
                      <div className="flex-1">
                        <Label htmlFor="create-comp-desc">Component Description</Label>
                        <Textarea
                          id="create-comp-desc"
                          value={newComponentDescription}
                          onChange={(e) => setNewComponentDescription(e.target.value)}
                          placeholder="Enter description (optional)"
                          rows={10}
                          className="h-full min-h-[200px]"
                        />
                      </div>
                    </div>

                    <DialogFooter>
                      <Button variant="outline" onClick={() => {
                        setIsCreatingNewComponent(false)
                        setNewComponentTitle('')
                        setNewComponentDescription('')
                      }}>
                        Cancel
                      </Button>
                      <Button
                        onClick={async () => {
                          await handleCreateAndAddComponent()
                          setIsCreatingNewComponent(false)
                          setNewComponentTitle('')
                          setNewComponentDescription('')
                        }}
                        disabled={!newComponentTitle.trim()}
                      >
                        Create & Add
                      </Button>
                    </DialogFooter>
                  </>
                )}
              </DialogContent>
            </Dialog>
          ) : (
            // Show "New Briefing" when viewing list
            <Dialog open={isNewBriefingDialogOpen} onOpenChange={setIsNewBriefingDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2 bg-white text-black hover:bg-gray-50 border-gray-300">
                  <Plus className="w-4 h-4" />
                  New Briefing
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Briefing</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="new-briefing-title">Title *</Label>
                  <Input
                    id="new-briefing-title"
                    value={newBriefingTitle}
                    onChange={(e) => setNewBriefingTitle(e.target.value)}
                    placeholder="Briefing title"
                  />
                </div>
                <div>
                  <Label htmlFor="new-briefing-description">Description</Label>
                  <Textarea
                    id="new-briefing-description"
                    value={newBriefingDescription}
                    onChange={(e) => setNewBriefingDescription(e.target.value)}
                    placeholder="Briefing description (optional)"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewBriefingDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateNewBriefing} disabled={!newBriefingTitle.trim()}>
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          )}

          <Dialog open={isAddDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-2 bg-white text-black hover:bg-gray-50 border-gray-300">
                <Plus className="w-4 h-4" />
                Add from Library
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
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
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
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Component</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to delete "<strong>{componentToDelete?.title}</strong>"? 
              This action cannot be undone and will remove this component from all briefings.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsDeleteConfirmOpen(false)
              setComponentToDelete(null)
            }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteComponent}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {briefingTypes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center py-12">
          <p className="text-gray-500 mb-4">No briefing types added yet</p>
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Briefing Type
          </Button>
        </div>
      ) : (
        <div>
          {/* Breadcrumb Navigation */}
          {singleBriefingView && (
            <div className="mb-4 flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <button
                  onClick={() => {
                    setSingleBriefingView(null)
                    // Clear URL params when going back to list view
                    const params = new URLSearchParams(searchParams.toString())
                    params.delete('briefingTypeId')
                    params.delete('contentTypeId')
                    params.delete('channelId')
                    router.replace(`${pathname}?${params.toString()}`)
                  }}
                  className="flex items-center gap-1 hover:text-gray-900 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Briefings</span>
                </button>
                <span>/</span>
                <span className="text-gray-900 font-medium">
                  {briefingTypes.find(b => b.briefing_type_id === singleBriefingView)?.display_title}
                </span>
              </div>
              
              {/* Briefing Switcher Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 px-2">
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {briefingTypes.map(briefing => (
                    <DropdownMenuItem
                      key={briefing.briefing_type_id}
                      onClick={() => {
                        setSingleBriefingView(briefing.briefing_type_id)
                        const params = new URLSearchParams(searchParams.toString())
                        params.set('briefingTypeId', briefing.briefing_type_id.toString())
                        params.delete('contentTypeId')
                        params.delete('channelId')
                        router.replace(`${pathname}?${params.toString()}`)
                      }}
                      className={briefing.briefing_type_id === singleBriefingView ? 'bg-gray-100' : ''}
                    >
                      {briefing.display_title}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

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
                {briefingTypes
                  .filter(briefing => !singleBriefingView || briefing.briefing_type_id === singleBriefingView)
                  .map(briefing => (
                    <BriefingComponents
                      key={briefing.briefing_type_id}
                      briefing={briefing}
                      projectId={projectId}
                      isExpanded={singleBriefingView ? true : expandedBriefings.has(briefing.briefing_type_id)}
                      isSingleView={!!singleBriefingView}
                      onToggle={() => {
                        if (singleBriefingView) {
                          return // Don't collapse in single view mode
                        }
                        setSingleBriefingView(briefing.briefing_type_id)
                        // Update URL with briefing type ID
                        const params = new URLSearchParams(searchParams.toString())
                        params.set('briefingTypeId', briefing.briefing_type_id.toString())
                        router.replace(`${pathname}?${params.toString()}`)
                      }}
                      onSetDefault={() => handleSetDefault(briefing.briefing_type_id)}
                      onRemove={() => handleOpenRemoveConfirmation(briefing.briefing_type_id)}
                      onUpdateMeta={(customTitle, customDescription) =>
                        handleUpdateMeta(briefing.briefing_type_id, customTitle, customDescription)
                      }
                      onComponentUpdate={(componentId, source, updates) =>
                        handleComponentUpdate(briefing.briefing_type_id, componentId, source, updates)
                      }
                      onComponentRemove={(componentId, source) =>
                        handleComponentRemove(briefing.briefing_type_id, componentId, source)
                      }
                      onComponentReorder={(order) =>
                        handleComponentReorder(briefing.briefing_type_id, order)
                      }
                      onAddComponent={() => handleOpenAddComponent(briefing.briefing_type_id)}
                      onImportBriefing={() => {
                        setActiveBriefingTypeId(briefing.briefing_type_id)
                        setIsImportDialogOpen(true)
                      }}
                      onResetTemplate={() => handleOpenResetConfirmation(briefing.briefing_type_id)}
                    />
                  ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Remove Briefing Confirmation Dialog */}
      <Dialog open={isRemoveConfirmationOpen} onOpenChange={setIsRemoveConfirmationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Briefing Type</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this briefing type from the project? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRemoveConfirmationOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemoveBriefing}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Briefing Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={(open) => {
        setIsImportDialogOpen(open)
        if (!open) {
          setImportUrl('')
          setImportFile(null)
          setImportMethod('file')
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Briefing from File or Link</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {/* Method Tabs */}
            <div className="flex gap-2 border-b">
              <button
                type="button"
                onClick={() => setImportMethod('file')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  importMethod === 'file'
                    ? 'border-black text-black'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Upload File
              </button>
              <button
                type="button"
                onClick={() => setImportMethod('url')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  importMethod === 'url'
                    ? 'border-black text-black'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Enter URL
              </button>
            </div>

            {/* File Upload Section */}
            {importMethod === 'file' && (
              <div>
                <Label className="mb-2 block">Upload File</Label>
                <div
                  className={`border-2 border-dashed rounded-lg p-6 bg-gray-50 transition-colors ${
                    isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setIsDragActive(true)
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault()
                    setIsDragActive(false)
                  }}
                  onDrop={handleFileDrop}
                >
                  {!importFile ? (
                    <div className="flex flex-col items-center gap-2 text-center">
                      <Upload className="w-8 h-8 text-gray-400" />
                      <p className="text-sm text-gray-600">
                        Drag and drop a file here, or{' '}
                        <button
                          type="button"
                          className="text-blue-600 hover:text-blue-700 underline"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          select a file
                        </button>
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={handleFileInput}
                        accept=".pdf,.doc,.docx,.txt,.md"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{importFile.name}</p>
                          <p className="text-xs text-gray-500">
                            {(importFile.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setImportFile(null)}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* URL Input Section */}
            {importMethod === 'url' && (
              <div>
                <Label htmlFor="import-url">File or Link URL</Label>
                <Input
                  id="import-url"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="Paste file link or URL..."
                  className="mt-2"
                />
              </div>
            )}

            {isImporting && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                Extracting structure...
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsImportDialogOpen(false)
              setImportUrl('')
              setImportFile(null)
              setImportMethod('file')
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleImportBriefing}
              disabled={
                (importMethod === 'file' && !importFile) ||
                (importMethod === 'url' && !importUrl.trim()) ||
                isImporting
              }
            >
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Review Modal */}
      <Dialog open={isReviewModalOpen} onOpenChange={setIsReviewModalOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Imported Briefing</DialogTitle>
          </DialogHeader>
          <ImportReviewModal
            briefingData={importedBriefingData}
            projectId={projectId}
            briefingTypeId={activeBriefingTypeId}
            projectLibrary={projectLibrary}
            briefingComponents={briefingComponents}
            onBriefingDataChange={setImportedBriefingData}
            onConfirm={async (resolutions: Map<number, OutlineItemResolution>) => {
              if (!importedBriefingData || importedBriefingData.outline.length === 0) return

              try {
                // Step 1: Create or select the briefing
                let briefingTypeId = activeBriefingTypeId
                
                if (!briefingTypeId) {
                  // Create new briefing using pbt_create_custom
                  const { data: newBriefing, error: createBriefingError } = await createCustomBriefing(
                    projectId,
                    importedBriefingData.briefing.name,
                    importedBriefingData.briefing.description
                  )

                  if (createBriefingError) throw createBriefingError
                  if (!newBriefing) throw new Error('Failed to create briefing')

                  briefingTypeId = newBriefing.briefing_type_id
                  
                  // Auto-select and expand the new briefing
                  setActiveBriefingTypeId(briefingTypeId)
                  const finalBriefingTypeId: number = briefingTypeId
                  setExpandedBriefings((prev) => new Set([...Array.from(prev), finalBriefingTypeId]))
                }

                // Step 2: Save constraints
                const { error: constraintsError } = await setBriefingConstraints(
                  projectId,
                  briefingTypeId,
                  {
                    name: importedBriefingData.briefing.name,
                    description: importedBriefingData.briefing.description,
                  },
                  importedBriefingData.constraints
                )

                if (constraintsError) throw constraintsError

                // Step 3: Save outline items based on resolutions
                let position = 1
                let savedCount = 0

                for (let index = 0; index < importedBriefingData.outline.length; index++) {
                  const outlineItem = importedBriefingData.outline[index]
                  const resolution = resolutions.get(index)
                  
                  if (resolution?.action === 'skip') {
                    continue
                  }

                  if (resolution?.action === 'reuse' && resolution.projectComponentId) {
                    // Reuse existing component
                    const { error: addError } = await addProjectComponentToBriefing(
                      projectId,
                      briefingTypeId,
                      resolution.projectComponentId,
                      position,
                      outlineItem.label,
                      outlineItem.purpose ? `Purpose: ${outlineItem.purpose}\n\nGuidance: ${outlineItem.guidance}` : outlineItem.guidance || null
                    )
                    if (addError) throw addError
                    position++
                    savedCount++
                  } else {
                    // Create new component (default or explicitly marked as new)
                    // Build description
                    const descriptionParts = []
                    if (outlineItem.purpose) descriptionParts.push(`Purpose: ${outlineItem.purpose}`)
                    if (outlineItem.guidance) descriptionParts.push(`Guidance: ${outlineItem.guidance}`)
                    if (outlineItem.suggested_word_count) {
                      descriptionParts.push(`Suggested word count: ${outlineItem.suggested_word_count}`)
                    }
                    if (outlineItem.subheads.length > 0) {
                      descriptionParts.push(`Subheads: ${outlineItem.subheads.map(sh => sh.label).join(', ')}`)
                    }

                    const description = descriptionParts.join('\n\n') || null
                    const finalLabel = resolution?.resolvedLabel || outlineItem.label

                    // Create component
                    const { data: newComp, error: createError } = await supabase
                      .from('project_briefing_components')
                      .insert({
                        project_id: projectId,
                        title: finalLabel,
                        description,
                      })
                      .select('id')
                      .single()

                    if (createError) throw createError
                    if (!newComp) continue

                    // Add to briefing
                    const { error: addError } = await supabase
                      .from('project_briefing_types_components')
                      .insert({
                        project_id: projectId,
                        briefing_type_id: briefingTypeId,
                        project_component_id: newComp.id,
                        position,
                      })

                    if (addError) throw addError
                    position++
                    savedCount++
                  }
                }

                toast({
                  title: 'Success',
                  description: `Imported briefing with ${savedCount} section(s)`,
                })

                setIsReviewModalOpen(false)
                setImportedBriefingData(null)
                setProjectLibrary(null)
                setBriefingComponents(null)
                
                // Refresh all relevant queries
                queryClient.invalidateQueries({ 
                  queryKey: ['projBriefings:list', projectId] 
                })
                queryClient.invalidateQueries({ 
                  queryKey: ['projBriefings:components', projectId, briefingTypeId] 
                })
                queryClient.invalidateQueries({ 
                  queryKey: ['projBriefings:library', projectId] 
                })
                onRefresh()
              } catch (error: any) {
                toast({
                  title: 'Error',
                  description: error.message || 'Failed to import briefing',
                  variant: 'destructive',
                })
              }
            }}
            onCancel={() => {
              setIsReviewModalOpen(false)
              setImportedBriefingData(null)
              setProjectLibrary(null)
              setBriefingComponents(null)
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Reset Template Confirmation Dialog */}
      <Dialog open={isResetConfirmationOpen} onOpenChange={setIsResetConfirmationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Template</DialogTitle>
            <DialogDescription>
              This will replace all project-specific component settings with the global template. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResetConfirmationOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleResetTemplate}>
              Reset Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  )
}

// Separate component for briefing with components to use hooks properly
function BriefingComponents({
  briefing,
  projectId,
  isExpanded,
  isSingleView = false,
  onToggle,
  onSetDefault,
  onRemove,
  onUpdateMeta,
  onComponentUpdate,
  onComponentRemove,
  onComponentReorder,
  onAddComponent,
  onImportBriefing,
  onResetTemplate,
}: {
  isSingleView?: boolean
  briefing: ProjectBriefingType
  projectId: number
  isExpanded: boolean
  onToggle: () => void
  onSetDefault: () => void
  onRemove: () => void
  onUpdateMeta: (customTitle?: string | null, customDescription?: string | null) => void
  onComponentUpdate: (componentId: number, source: 'global' | 'project', updates: { custom_title?: string; custom_description?: string }) => void
  onComponentRemove: (componentId: number, source: 'global' | 'project') => void
  onComponentReorder: (order: Array<{ component_id: number; is_project_component: boolean; position: number }>) => void
  onAddComponent: () => void
  onImportBriefing: () => void
  onResetTemplate: () => void
}) {
  const queryClient = useQueryClient()
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  
  // State for filtering
  const [selectedContentTypeId, setSelectedContentTypeId] = useState<number | null>(null)
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null)
  
  // Handler to clear channel when content type is cleared
  const handleContentTypeChange = useCallback((contentTypeId: number | null) => {
    setSelectedContentTypeId(contentTypeId)
    // Clear channel selection when content type is cleared
    if (contentTypeId === null) {
      setSelectedChannelId(null)
    }
    // Clear channel selection when switching content types (will be auto-selected when channels load)
    else {
      setSelectedChannelId(null)
    }
    
    // Update URL
    const params = new URLSearchParams(searchParams.toString())
    if (contentTypeId) {
      params.set('contentTypeId', contentTypeId.toString())
    } else {
      params.delete('contentTypeId')
    }
    params.delete('channelId') // Clear channel when changing content type
    router.replace(`${pathname}?${params.toString()}`)
  }, [searchParams, router, pathname])
  
  // Fetch content types for this project (using existing logic from ChannelsPerContentType)
  const { data: contentTypes } = useQuery({
    queryKey: ['project:contentTypes', projectId],
    queryFn: async () => {
      // Fetch all content types
      const { data: allTypes, error: allError } = await supabase
        .from('content_types')
        .select('id, title')
        .order('title')

      if (allError) throw allError

      // Fetch enabled ones from project_content_type_settings
      const { data: enabledData, error: enabledError } = await supabase
        .from('project_content_type_settings')
        .select('content_type_id')
        .eq('project_id', projectId)

      if (enabledError) throw enabledError
      
      const enabledIds = new Set((enabledData || []).map((e: any) => e.content_type_id))
      
      return (allTypes || [])
        .filter(ct => enabledIds.has(ct.id))
        .map(ct => ({
          id: ct.id,
          title: ct.title
        }))
    },
    enabled: isExpanded,
  })
  
  // Fetch channels filtered by selected content type
  const { data: channels } = useQuery({
    queryKey: ['project:channels', projectId, selectedContentTypeId],
    queryFn: async () => {
      if (!selectedContentTypeId) return []
      
      const { data, error } = await supabase
        .from('project_content_types_channels')
        .select(`
          channel_id,
          position,
          channels!inner(id, name)
        `)
        .eq('project_id', projectId)
        .eq('content_type_id', selectedContentTypeId)
        .order('position', { ascending: true })
      
      if (error) throw error
      
      return (data || []).map((pctc: any) => ({
        id: pctc.channel_id,
        name: pctc.channels.name,
        position: pctc.position
      })).sort((a, b) => {
        const posA = a.position ?? 999
        const posB = b.position ?? 999
        if (posA !== posB) return posA - posB
        return a.name.localeCompare(b.name)
      })
    },
    enabled: isExpanded && !!selectedContentTypeId,
  })
  
  // Handler for channel change with URL update
  const handleChannelChange = useCallback((channelId: number | null) => {
    setSelectedChannelId(channelId)
    
    // Update URL
    const params = new URLSearchParams(searchParams.toString())
    if (channelId) {
      params.set('channelId', channelId.toString())
    } else {
      params.delete('channelId')
    }
    router.replace(`${pathname}?${params.toString()}`)
  }, [searchParams, router, pathname])
  
  // Auto-select first channel when content type is selected and channels are loaded
  React.useEffect(() => {
    if (selectedContentTypeId && channels && channels.length > 0 && !selectedChannelId) {
      const firstChannelId = channels[0].id
      setSelectedChannelId(firstChannelId)
      // Also update URL
      const params = new URLSearchParams(searchParams.toString())
      params.set('channelId', firstChannelId.toString())
      router.replace(`${pathname}?${params.toString()}`)
    }
  }, [selectedContentTypeId, channels, selectedChannelId, searchParams, router, pathname])

  // Fetch components - either template components or channel-specific components
  const { data: components } = useQuery({
    queryKey: ['projBriefings:components', projectId, briefing.briefing_type_id, selectedContentTypeId, selectedChannelId],
    queryFn: async () => {
      // If no filters selected, show template components
      if (!selectedContentTypeId || !selectedChannelId) {
        const { data, error } = await fetchProjectBriefingComponents(projectId, briefing.briefing_type_id)
        if (error) throw error
        return data || []
      }
      
      // Otherwise, fetch components for the specific channel/content type/briefing combination
      // Fetch channel-specific components for THIS briefing type
      const { data: channelData, error: channelError } = await supabase
        .from('project_ct_channel_briefing_components')
        .select(`
          id,
          briefing_component_id,
          project_component_id,
          position,
          custom_title,
          custom_description
        `)
        .eq('project_id', projectId)
        .eq('content_type_id', selectedContentTypeId)
        .eq('channel_id', selectedChannelId)
        .eq('briefing_type_id', briefing.briefing_type_id)
        .order('position', { ascending: true })

      if (channelError && channelError.code !== 'PGRST116') throw channelError

      if (channelData && channelData.length > 0) {
        // Fetch briefing_components for the IDs we found
        const briefingComponentIds = channelData
          .map((d: any) => d.briefing_component_id)
          .filter((id: any): id is number => id !== null)
        
        let briefingComponentsMap = new Map<number, { title: string; description: string | null }>()
        
        if (briefingComponentIds.length > 0) {
          const { data: briefingComps, error: bcError } = await supabase
            .from('briefing_components')
            .select('id, title, description')
            .in('id', briefingComponentIds)
          
          if (!bcError && briefingComps) {
            briefingComps.forEach((bc: any) => {
              briefingComponentsMap.set(bc.id, { title: bc.title, description: bc.description })
            })
          }
        }

        // Map to same format as template components
        return (channelData || []).map((pctcbc: any) => {
          const briefingInfo = pctcbc.briefing_component_id 
            ? briefingComponentsMap.get(pctcbc.briefing_component_id)
            : null
          
          return {
            project_id: projectId,
            briefing_type_id: briefing.briefing_type_id,
            component_id: pctcbc.briefing_component_id || pctcbc.project_component_id,
            component_title: pctcbc.custom_title || briefingInfo?.title || 'Custom Component',
            component_description: pctcbc.custom_description || briefingInfo?.description || null,
            effective_title: pctcbc.custom_title || briefingInfo?.title || 'Custom Component',
            effective_description: pctcbc.custom_description || briefingInfo?.description || null,
            source: pctcbc.project_component_id ? 'project' as const : 'global' as const,
            position: pctcbc.position,
            channel_record_id: pctcbc.id // UUID from project_ct_channel_briefing_components
          }
        })
      }
      
      // No components assigned to this channel/content type combination yet
      // Return empty array so all template components appear in "Available to Add"
      return []
    },
    enabled: isExpanded,
  })

  // Fetch available components to add (always fetch to show for template or filtered views)
  const { data: availableComponents } = useQuery({
    queryKey: ['availableComponents', projectId, briefing.briefing_type_id],
    queryFn: async () => {
      // Fetch all components from the template
      const { data: templateData, error: templateError } = await supabase
        .from('v_project_briefing_types_components_resolved')
        .select('*')
        .eq('project_id', projectId)
        .eq('briefing_type_id', briefing.briefing_type_id)
        .order('position', { ascending: true, nullsFirst: false })
      
      if (templateError) throw templateError
      
      return (templateData || []).map((item: any) => ({
        component_id: item.component_id,
        is_project_component: item.is_project_component || false,
        component_title: item.effective_title,
        component_description: item.effective_description
      }))
    },
    enabled: isExpanded,
  })

  return (
    <ExpandableBriefingItem
      briefing={briefing}
      isExpanded={isExpanded}
      isSingleView={isSingleView}
      onToggle={onToggle}
      onSetDefault={onSetDefault}
      onRemove={onRemove}
      onUpdateMeta={onUpdateMeta}
      components={components || []}
      onComponentUpdate={onComponentUpdate}
      onComponentRemove={onComponentRemove}
      onComponentReorder={onComponentReorder}
      onAddComponent={onAddComponent}
      onImportBriefing={onImportBriefing}
      onResetTemplate={onResetTemplate}
      contentTypes={contentTypes || []}
      channels={channels || []}
      selectedContentTypeId={selectedContentTypeId}
      selectedChannelId={selectedChannelId}
      onContentTypeChange={handleContentTypeChange}
      onChannelChange={handleChannelChange}
      availableComponents={availableComponents || []}
      projectId={projectId}
    />
  )
}

