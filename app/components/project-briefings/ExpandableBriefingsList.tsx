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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { Plus, Star, Trash2, GripVertical, ChevronDown, ChevronRight, ChevronLeft, RotateCcw, Upload, FileText, Link as LinkIcon, Search, Loader2, X, MoreHorizontal } from 'lucide-react'
import { ImportReviewModal, type ImportedBriefingData, type OutlineItemResolution } from './ImportReviewModal'
import { DialogDescription } from '../ui/dialog'
import { ComponentDetailsPane } from './component-details-pane'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog'
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
  setBriefingConstraints,
  bulkAddProjectComponentsFromOutline,
} from '../../lib/services/project-briefings'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

function BriefingDescriptionEditor({
  briefingTypeId,
  initialDescription,
  titleForMeta,
  onSave,
}: {
  briefingTypeId: number
  initialDescription: string
  titleForMeta: string
  onSave: (nextDescription: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(initialDescription)

  React.useEffect(() => {
    setDraft(initialDescription)
    setIsEditing(false)
  }, [briefingTypeId, initialDescription])

  if (isEditing) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="text-xs font-medium text-gray-700">Description</div>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setIsEditing(false)
            if ((draft || '') !== (initialDescription || '')) onSave(draft)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setDraft(initialDescription)
              setIsEditing(false)
            }
          }}
          className="mt-2 text-sm text-gray-700 min-h-[72px] resize-y"
          placeholder={`Add a description for "${titleForMeta}"...`}
          autoFocus
          rows={3}
        />
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="text-xs font-medium text-gray-700">Description</div>
      {initialDescription ? (
        <p
          className="mt-2 text-sm text-gray-600 cursor-text hover:text-gray-800 whitespace-pre-wrap"
          onClick={() => setIsEditing(true)}
          title="Click to edit description"
        >
          {initialDescription}
        </p>
      ) : (
        <p
          className="mt-2 text-sm text-gray-400 italic cursor-text hover:text-gray-600"
          onClick={() => setIsEditing(true)}
          title="Click to add description"
        >
          Click to add description
        </p>
      )}
    </div>
  )
}

interface ExpandableBriefingsListProps {
  projectId: number
  briefingTypes: ProjectBriefingType[]
  onRefresh: () => void
}

interface SortableBriefingItemProps {
  briefing: ProjectBriefingType
  isExpanded: boolean
  isSingleView?: boolean
  /** Keep the list item visually highlighted (e.g. when opened in the right pane). */
  isSelected?: boolean
  allBriefings?: ProjectBriefingType[]
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
  onRequestDeleteGlobalComponentFromProject?: (args: { componentId: number; componentTitle: string }) => void
  contentTypes?: Array<{ id: number; title: string }>
  channels?: Array<{ id: number; name: string }>
  selectedContentTypeId?: number | null
  selectedChannelId?: number | null
  onContentTypeChange?: (id: number | null) => void
  onChannelChange?: (id: number | null) => void
  availableComponents?: PcctbcAvailableComponentRow[]
  projectId?: number
  appliesToContentTypes?: Array<{ id: number; title: string }>
  appliesToChannelsByCt?: Map<number, Array<{ id: number; name: string }>>
  isAppliesToLoading?: boolean
  onRemoveAppliesTo?: (contentTypeId: number, channelId: number, contentTypeTitle: string, channelName: string) => void
  assignmentContentTypeOptions?: Array<{ id: number; title: string }>
  assignmentChannelOptions?: Array<{ id: number; name: string }>
  onAddAppliesTo?: (contentTypeId: number, channelId: number) => Promise<void>
  onRemoveAppliesToContentType?: (contentTypeId: number, contentTypeTitle: string) => void
  onRequestDeleteProjectComponent?: (args: { componentId: number; componentTitle: string }) => void
}

interface PcctbcAvailableComponentRow {
  key: string
  component_id: number
  is_project_component: boolean
  title: string
  description: string | null
  custom_title: string | null
  custom_description: string | null
  tag: 'Recommended' | 'Removed' | 'System' | 'System (other briefings)' | 'Custom' | string | null
  template_layer: 'global' | 'project' | 'channel' | string | null
  position: number | null
  origin: 'global' | 'project' | string | null
  global_overridden: boolean | null
}

interface SortableComponentItemProps {
  component: ProjectBriefingComponent
  onTitleChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onRemoveFromBriefing: () => void
  onRemoveFromAllProjectBriefings?: () => void
  onDeleteFromProject?: () => void
  onAddToAllChannels?: () => void
  onAddToAllContentTypesAndChannels?: () => void
  onAddToOtherBriefings?: () => void
}

function getComponentDndId(component: Pick<ProjectBriefingComponent, 'component_id' | 'source'>) {
  // component_id can collide between global/project sequences; include source to keep DnD IDs unique
  return `${component.source}:${component.component_id}`
}

function SortableComponentItem({
  component,
  onTitleChange,
  onDescriptionChange,
  onRemoveFromBriefing,
  onRemoveFromAllProjectBriefings,
  onDeleteFromProject,
  onAddToAllChannels,
  onAddToAllContentTypesAndChannels,
  onAddToOtherBriefings,
}: SortableComponentItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: getComponentDndId(component),
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
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onRemoveFromBriefing()
            }}
            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
            title="Remove from briefing"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {onRemoveFromAllProjectBriefings || onDeleteFromProject || onAddToAllChannels || onAddToAllContentTypesAndChannels || onAddToOtherBriefings ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-gray-100 text-gray-500"
                  title="More actions"
                  onClick={(e) => {
                    e.stopPropagation()
                  }}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onAddToAllChannels ? (
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault()
                      onAddToAllChannels()
                    }}
                  >
                    Add to all channels
                  </DropdownMenuItem>
                ) : null}
                {onAddToAllContentTypesAndChannels ? (
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault()
                      onAddToAllContentTypesAndChannels()
                    }}
                  >
                    Add to all content types and channels
                  </DropdownMenuItem>
                ) : null}
                {onAddToOtherBriefings ? (
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault()
                      onAddToOtherBriefings()
                    }}
                  >
                    Add to other briefings…
                  </DropdownMenuItem>
                ) : null}
                {onAddToAllChannels || onAddToAllContentTypesAndChannels || onAddToOtherBriefings ? (
                  <DropdownMenuSeparator />
                ) : null}
                {onDeleteFromProject ? (
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600"
                    onSelect={(e) => {
                      e.preventDefault()
                      onDeleteFromProject()
                    }}
                  >
                    Delete from project
                  </DropdownMenuItem>
                ) : null}
                {onRemoveFromAllProjectBriefings ? (
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600"
                    onSelect={(e) => {
                      e.preventDefault()
                      onRemoveFromAllProjectBriefings()
                    }}
                  >
                    Remove from all project briefings
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </div>
  )
}

type BriefingItemContentProps = SortableBriefingItemProps & {
  containerRef?: (node: HTMLDivElement | null) => void
  containerStyle?: React.CSSProperties
  dragHandleProps?: {
    attributes: any
    listeners: any
  }
  showDragHandle?: boolean
}

function BriefingItemContent({
  briefing,
  isExpanded,
  isSingleView = false,
  isSelected = false,
  allBriefings = [],
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
  onRequestDeleteGlobalComponentFromProject,
  contentTypes = [],
  channels = [],
  selectedContentTypeId,
  selectedChannelId,
  onContentTypeChange,
  onChannelChange,
  availableComponents = [],
  projectId,
  appliesToContentTypes = [],
  appliesToChannelsByCt,
  isAppliesToLoading,
  onRemoveAppliesTo,
  assignmentContentTypeOptions = [],
  assignmentChannelOptions = [],
  onAddAppliesTo,
  onRemoveAppliesToContentType,
  onRequestDeleteProjectComponent,
  containerRef,
  containerStyle,
  dragHandleProps,
  showDragHandle = !isSingleView,
}: BriefingItemContentProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [localTitle, setLocalTitle] = useState(briefing.display_title)
  const [localDescription, setLocalDescription] = useState(briefing.display_description || '')
  const [addingComponentId, setAddingComponentId] = useState<string | null>(null)
  const [availableSearchQuery, setAvailableSearchQuery] = useState('')
  const [availableTagFilter, setAvailableTagFilter] = useState<'__all__' | 'Recommended' | 'Removed'>('__all__')
  const [isAddContentTypeOpen, setIsAddContentTypeOpen] = useState(false)
  const [contentTypesToAdd, setContentTypesToAdd] = useState<number[]>([])
  const [channelsToAddForNewContentTypes, setChannelsToAddForNewContentTypes] = useState<number[]>([])
  const [isAddChannelOpen, setIsAddChannelOpen] = useState(false)
  const [contentTypeForAddChannel, setContentTypeForAddChannel] = useState<number | null>(null)
  const [channelToAddId, setChannelToAddId] = useState<number | null>(null)
  const [isAddingAppliesTo, setIsAddingAppliesTo] = useState(false)
  const [customComponentTitle, setCustomComponentTitle] = useState('')
  const [customComponentDescription, setCustomComponentDescription] = useState('')
  const [isCreatingCustomComponent, setIsCreatingCustomComponent] = useState(false)
  const [isEditingNewComponentDescription, setIsEditingNewComponentDescription] = useState(false)
  const [isAddToOtherBriefingsOpen, setIsAddToOtherBriefingsOpen] = useState(false)
  const [otherBriefingsSelection, setOtherBriefingsSelection] = useState<number[]>([])
  const [bulkTargetComponent, setBulkTargetComponent] = useState<null | { id: number; source: 'project' | 'global'; title: string; description: string | null }>(null)
  const [isBulkAdding, setIsBulkAdding] = useState(false)
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const briefingTitle = briefing.custom_title || briefing.display_title

  // Sensors for drag and drop (components list reordering)
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )
  
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

  const handleAddAppliesTo = useCallback(async () => {
    if (!contentTypeForAddChannel || !channelToAddId || !onAddAppliesTo) return
    setIsAddingAppliesTo(true)
    try {
      await onAddAppliesTo(contentTypeForAddChannel, channelToAddId)
      setIsAddChannelOpen(false)
      setContentTypeForAddChannel(null)
      setChannelToAddId(null)
    } finally {
      setIsAddingAppliesTo(false)
    }
  }, [contentTypeForAddChannel, channelToAddId, onAddAppliesTo])

  const handleCreateAndAddCustomComponent = useCallback(async () => {
    const title = customComponentTitle.trim()
    if (!title) {
      toast({
        title: 'Error',
        description: 'Component title is required',
        variant: 'destructive',
      })
      return
    }

    if (!projectId || !selectedContentTypeId || !selectedChannelId) {
      toast({
        title: 'Select a channel first',
        description: 'Pick an Applies-to content type and channel to create + add a component.',
        variant: 'destructive',
      })
      return
    }

    setIsCreatingCustomComponent(true)
    try {
      const { data: created, error } = await createProjectComponent(
        projectId,
        title,
        customComponentDescription.trim() || null,
        null
      )
      if (error) throw error
      if (!created?.id) throw new Error('Failed to create component')

      // Add it immediately to the selected briefing scope (same approach as "Add" from available list).
      const lastPosition =
        components.length > 0 ? Math.max(...components.map((c) => c.position ?? 0)) + 1 : 1

      const { error: addErr } = await supabase.rpc('pcctbc_add_project', {
        p_project_id: projectId,
        p_content_type_id: selectedContentTypeId,
        p_channel_id: selectedChannelId,
        p_briefing_type_id: briefing.briefing_type_id,
        p_project_component_id: created.id,
        p_position: lastPosition,
        p_custom_title: title || null,
        p_custom_description: (customComponentDescription.trim() || null) as string | null,
        p_purpose: null,
        p_guidance: null,
        p_suggested_word_count: null,
        p_subheads: null,
      })
      if (addErr) throw addErr

      toast({ title: 'Success', description: 'Custom component created and added' })
      setCustomComponentTitle('')
      setCustomComponentDescription('')

      // Refresh the selected + available lists for the active channel/content type.
      queryClient.invalidateQueries({
        queryKey: ['projBriefings:components', projectId, briefing.briefing_type_id, selectedContentTypeId, selectedChannelId],
      })
      queryClient.invalidateQueries({
        queryKey: ['availableComponents', projectId, briefing.briefing_type_id, selectedContentTypeId, selectedChannelId],
      })
    } catch (err: any) {
      console.error('Failed to create custom component:', err)
      toast({
        title: 'Error',
        description: err?.message || 'Failed to create custom component',
        variant: 'destructive',
      })
    } finally {
      setIsCreatingCustomComponent(false)
    }
  }, [
    projectId,
    briefing.briefing_type_id,
    selectedContentTypeId,
    selectedChannelId,
    customComponentTitle,
    customComponentDescription,
    queryClient,
    supabase,
    components,
  ])

  const addComponentToCtChannel = useCallback(
    async (args: { componentId: number; source: 'project' | 'global'; ctId: number; chId: number; title: string; description: string | null }) => {
      if (!projectId) throw new Error('Missing project')
      const rpcName = args.source === 'project' ? 'pcctbc_add_project' : 'pcctbc_add_global'
      const paramName = args.source === 'project' ? 'p_project_component_id' : 'p_briefing_component_id'

      const lastPosition = components.length > 0
        ? Math.max(...components.map((c) => c.position ?? 0)) + 1
        : 1

      const rpcParams: any = {
        p_project_id: projectId,
        p_content_type_id: args.ctId,
        p_channel_id: args.chId,
        p_briefing_type_id: briefing.briefing_type_id,
        [paramName]: args.componentId,
        p_position: lastPosition,
        p_custom_title: args.title || null,
        p_custom_description: args.description || null,
        p_purpose: null,
        p_guidance: null,
        p_suggested_word_count: null,
        p_subheads: null,
      }

      const { error } = await supabase.rpc(rpcName, rpcParams)
      if (error) throw error
    },
    [briefing.briefing_type_id, components, projectId, supabase]
  )

  const handleAddToAllChannels = useCallback(
    async (target: { id: number; source: 'project' | 'global'; title: string; description: string | null }) => {
      if (!projectId || !selectedContentTypeId) return
      const channelsForCt = appliesToChannelsByCt?.get(selectedContentTypeId) || []
      if (!channelsForCt.length) return

      setIsBulkAdding(true)
      try {
        // Add only missing (avoid duplicates)
        const col = target.source === 'project' ? 'project_component_id' : 'briefing_component_id'
        const { data: existingRows, error: existingErr } = await supabase
          .from('project_ct_channel_briefing_components')
          .select('content_type_id, channel_id')
          .eq('project_id', projectId)
          .eq('briefing_type_id', briefing.briefing_type_id)
          .eq(col, target.id)
        if (existingErr) throw existingErr

        const existing = new Set(
          (existingRows || []).map((r: any) => `${r.content_type_id}:${r.channel_id}`)
        )

        const targets = channelsForCt
          .filter((ch) => ch.id !== selectedChannelId)
          .filter((ch) => !existing.has(`${selectedContentTypeId}:${ch.id}`))

        await Promise.all(
          targets.map((ch) =>
            addComponentToCtChannel({
              componentId: target.id,
              source: target.source,
              ctId: selectedContentTypeId,
              chId: ch.id,
              title: target.title,
              description: target.description,
            })
          )
        )

        toast({
          title: 'Success',
          description: targets.length ? `Added to ${targets.length} channel(s)` : 'Nothing to add',
        })
        queryClient.invalidateQueries({ queryKey: ['projBriefings:components', projectId, briefing.briefing_type_id] })
        queryClient.invalidateQueries({ queryKey: ['availableComponents', projectId, briefing.briefing_type_id] })
      } catch (err: any) {
        toast({ title: 'Error', description: err?.message || 'Failed to add to channels', variant: 'destructive' })
      } finally {
        setIsBulkAdding(false)
      }
    },
    [addComponentToCtChannel, appliesToChannelsByCt, briefing.briefing_type_id, projectId, queryClient, selectedChannelId, selectedContentTypeId, supabase]
  )

  const handleAddToAllContentTypesAndChannels = useCallback(
    async (target: { id: number; source: 'project' | 'global'; title: string; description: string | null }) => {
      if (!projectId) return
      setIsBulkAdding(true)
      try {
        // Add only missing CT×Channel pairs for THIS briefing type (avoid duplicates).
        const col = target.source === 'project' ? 'project_component_id' : 'briefing_component_id'
        const { data: existingRows, error: existingErr } = await supabase
          .from('project_ct_channel_briefing_components')
          .select('content_type_id, channel_id')
          .eq('project_id', projectId)
          .eq('briefing_type_id', briefing.briefing_type_id)
          .eq(col, target.id)
        if (existingErr) throw existingErr

        const existing = new Set(
          (existingRows || []).map((r: any) => `${r.content_type_id}:${r.channel_id}`)
        )

        const pairs: Array<{ ctId: number; chId: number }> = []
        for (const ct of appliesToContentTypes || []) {
          const chans = appliesToChannelsByCt?.get(ct.id) || []
          for (const ch of chans) {
            const key = `${ct.id}:${ch.id}`
            if (existing.has(key)) continue
            pairs.push({ ctId: ct.id, chId: ch.id })
          }
        }

        await Promise.all(
          pairs.map((p) =>
            addComponentToCtChannel({
              componentId: target.id,
              source: target.source,
              ctId: p.ctId,
              chId: p.chId,
              title: target.title,
              description: target.description,
            })
          )
        )

        toast({
          title: 'Success',
          description: pairs.length ? `Added to ${pairs.length} content-type/channel pair(s)` : 'Nothing to add',
        })
        queryClient.invalidateQueries({ queryKey: ['projBriefings:components', projectId, briefing.briefing_type_id] })
        queryClient.invalidateQueries({ queryKey: ['availableComponents', projectId, briefing.briefing_type_id] })
      } catch (err: any) {
        toast({ title: 'Error', description: err?.message || 'Failed to add everywhere', variant: 'destructive' })
      } finally {
        setIsBulkAdding(false)
      }
    },
    [addComponentToCtChannel, appliesToChannelsByCt, appliesToContentTypes, briefing.briefing_type_id, projectId, queryClient, supabase]
  )

  const openAddToOtherBriefings = useCallback((target: { id: number; source: 'project' | 'global'; title: string; description: string | null }) => {
    setBulkTargetComponent(target)
    setOtherBriefingsSelection([])
    setIsAddToOtherBriefingsOpen(true)
  }, [])

  const handleConfirmAddToOtherBriefings = useCallback(async () => {
    if (!projectId || !bulkTargetComponent) return
    if (otherBriefingsSelection.length === 0) return
    setIsBulkAdding(true)
    try {
      let totalAdded = 0

      for (const btId of otherBriefingsSelection) {
        // 1) What CT×Channel pairs does this briefing apply to?
        const { data: appliesRows, error: appliesErr } = await supabase
          .from('project_ct_channel_briefings')
          .select('content_type_id, channel_id')
          .eq('project_id', projectId)
          .eq('briefing_type_id', btId)
        if (appliesErr) throw appliesErr

        const appliesPairs = (appliesRows || []) as Array<{ content_type_id: number; channel_id: number }>
        if (appliesPairs.length === 0) continue

        // 2) What already exists for this briefing type? (for both dedupe + per-pair positioning)
        const { data: existingAll, error: existingAllErr } = await supabase
          .from('project_ct_channel_briefing_components')
          .select('content_type_id, channel_id, position, briefing_component_id, project_component_id')
          .eq('project_id', projectId)
          .eq('briefing_type_id', btId)
        if (existingAllErr) throw existingAllErr

        const col = bulkTargetComponent.source === 'project' ? 'project_component_id' : 'briefing_component_id'
        const existingPairsForComponent = new Set<string>()
        const maxPosByPair = new Map<string, number>()

        ;(existingAll || []).forEach((r: any) => {
          const key = `${r.content_type_id}:${r.channel_id}`
          const pos = Number(r.position ?? 0)
          if (Number.isFinite(pos)) {
            maxPosByPair.set(key, Math.max(maxPosByPair.get(key) ?? 0, pos))
          }
          if (r[col] === bulkTargetComponent.id) {
            existingPairsForComponent.add(key)
          }
        })

        // 3) Add only missing CT×Channel pairs for this briefing type
        const missing = appliesPairs.filter((p) => !existingPairsForComponent.has(`${p.content_type_id}:${p.channel_id}`))

        await Promise.all(
          missing.map(async (p) => {
            const key = `${p.content_type_id}:${p.channel_id}`
            const nextPos = (maxPosByPair.get(key) ?? 0) + 1

            const rpcName = bulkTargetComponent.source === 'project' ? 'pcctbc_add_project' : 'pcctbc_add_global'
            const paramName = bulkTargetComponent.source === 'project' ? 'p_project_component_id' : 'p_briefing_component_id'

            const { error } = await supabase.rpc(rpcName, {
              p_project_id: projectId,
              p_content_type_id: p.content_type_id,
              p_channel_id: p.channel_id,
              p_briefing_type_id: btId,
              [paramName]: bulkTargetComponent.id,
              p_position: nextPos,
              p_custom_title: bulkTargetComponent.title || null,
              p_custom_description: bulkTargetComponent.description || null,
              p_purpose: null,
              p_guidance: null,
              p_suggested_word_count: null,
              p_subheads: null,
            } as any)
            if (error) throw error
          })
        )

        totalAdded += missing.length
      }

      toast({
        title: 'Success',
        description: totalAdded ? `Added to ${totalAdded} content-type/channel pair(s)` : 'Nothing to add',
      })
      setIsAddToOtherBriefingsOpen(false)
      setBulkTargetComponent(null)
      setOtherBriefingsSelection([])
      queryClient.invalidateQueries({ queryKey: ['projBriefings:components', projectId] })
      queryClient.invalidateQueries({ queryKey: ['availableComponents', projectId] })
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to add to other briefings', variant: 'destructive' })
    } finally {
      setIsBulkAdding(false)
    }
  }, [bulkTargetComponent, otherBriefingsSelection, projectId, queryClient, supabase])

  const addableContentTypes = useMemo(() => {
    const already = new Set((appliesToContentTypes || []).map((ct) => ct.id))
    return assignmentContentTypeOptions.filter((ct) => !already.has(ct.id))
  }, [assignmentContentTypeOptions, appliesToContentTypes])

  const openAddChannelForCt = useCallback((ctId: number) => {
    setContentTypeForAddChannel(ctId)
    setChannelToAddId(null)
    setIsAddChannelOpen(true)
  }, [])

  const availableChannelsForCt = useMemo(() => {
    const ctId = contentTypeForAddChannel
    if (!ctId) return assignmentChannelOptions
    const existing = new Set((appliesToChannelsByCt?.get(ctId) || []).map((c) => c.id))
    return assignmentChannelOptions.filter((c) => !existing.has(c.id))
  }, [assignmentChannelOptions, appliesToChannelsByCt, contentTypeForAddChannel])

  const handleConfirmAddNewContentTypes = useCallback(async () => {
    if (!onAddAppliesTo) return
    if (contentTypesToAdd.length === 0 || channelsToAddForNewContentTypes.length === 0) return

    setIsAddingAppliesTo(true)
    try {
      // Cross product CT × Channel
      for (const ctId of contentTypesToAdd) {
        for (const chId of channelsToAddForNewContentTypes) {
          // eslint-disable-next-line no-await-in-loop
          await onAddAppliesTo(ctId, chId)
        }
      }
      setIsAddContentTypeOpen(false)
      setContentTypesToAdd([])
      setChannelsToAddForNewContentTypes([])
    } finally {
      setIsAddingAppliesTo(false)
    }
  }, [contentTypesToAdd, channelsToAddForNewContentTypes, onAddAppliesTo])

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

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event

      if (!over || active.id === over.id) return

      const oldIndex = components.findIndex(c => getComponentDndId(c) === active.id)
      const newIndex = components.findIndex(c => getComponentDndId(c) === over.id)

      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(components, oldIndex, newIndex)

      // Optimistically update UI order to avoid flicker while the server mutation/refetch completes
      if (projectId) {
        const optimistic = reordered.map((c, idx) => ({ ...c, position: idx + 1 }))
        queryClient.setQueryData(
          ['projBriefings:components', projectId, briefing.briefing_type_id, selectedContentTypeId, selectedChannelId],
          optimistic
        )
      }

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
    async (comp: PcctbcAvailableComponentRow) => {
      if (!projectId || !selectedContentTypeId || !selectedChannelId) {
        toast({
          title: 'Error',
          description: 'Project, content type, and channel must be selected',
          variant: 'destructive',
        })
        return
      }

      setAddingComponentId(comp.key)

      try {
        const isProject =
          comp.origin === 'project'
            ? true
            : comp.origin === 'global'
              ? false
              : !!comp.is_project_component

        const rpcName = isProject ? 'pcctbc_add_project' : 'pcctbc_add_global'
        const paramName = isProject ? 'p_project_component_id' : 'p_briefing_component_id'

        // Calculate last position (max position + 1, or 1 if no components)
        const lastPosition = components.length > 0
          ? Math.max(...components.map(c => c.position ?? 0)) + 1
          : 1

        const rpcParams: any = {
          p_project_id: projectId,
          p_content_type_id: selectedContentTypeId,
          p_channel_id: selectedChannelId,
          // Ensure inserted rows match the current briefing type filter
          p_briefing_type_id: briefing.briefing_type_id,
          [paramName]: comp.component_id,
          p_position: lastPosition,
          p_custom_title: (comp.custom_title || comp.title) || null,
          p_custom_description: (comp.custom_description || comp.description) || null,
          p_purpose: null,
          p_guidance: null,
          p_suggested_word_count: null,
          p_subheads: null,
        }

        const { error } = await supabase.rpc(rpcName, rpcParams)

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
    [projectId, selectedContentTypeId, selectedChannelId, briefing.briefing_type_id, supabase, queryClient, components]
  )

  // Filter available components to show only those not already added
  const componentsToShow = useMemo(() => {
    const query = availableSearchQuery.trim().toLowerCase()
    return (availableComponents || []).filter((availComp) => {
      const origin = availComp.origin === 'project' || availComp.origin === 'global'
        ? availComp.origin
        : (availComp.is_project_component ? 'project' : 'global')

      // Show only components not already in the selected list
      const isSelected = components.some(c => {
        if (origin === 'project') {
          return c.source === 'project' && c.component_id === availComp.component_id
        } else {
          return c.source === 'global' && c.component_id === availComp.component_id
        }
      })
      
      if (isSelected) return false
      
      // When channel is selected, filter global components by channel restrictions
      if (selectedChannelId && origin === 'global') {
        // For global components, only show if allowed for this channel
        if (!allowedGlobalComponents || !allowedGlobalComponents.has(availComp.component_id)) {
          return false
        }
      }

      if (availableTagFilter !== '__all__') {
        if ((availComp.tag || '').toLowerCase() !== availableTagFilter.toLowerCase()) return false
      }

      if (query) {
        const effectiveTitle = (availComp.custom_title || availComp.title || '').toString()
        const effectiveDescription = (availComp.custom_description || availComp.description || '').toString()
        const haystack = `${effectiveTitle}\n${effectiveDescription}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      
      return true
    })
  }, [availableComponents, components, selectedChannelId, allowedGlobalComponents, availableSearchQuery, availableTagFilter])

  const sortedComponentsToShow = useMemo(() => {
    return componentsToShow.slice().sort((a, b) => {
      const pa = a.position ?? 999
      const pb = b.position ?? 999
      if (pa !== pb) return pa - pb
      const at = (a.custom_title || a.title || '').toString()
      const bt = (b.custom_title || b.title || '').toString()
      return at.localeCompare(bt)
    })
  }, [componentsToShow])

  // Override remove handler when filters are active to call channel-specific removal
  const handleRemoveComponent = useCallback(
    async (componentId: number, source: 'global' | 'project') => {
      const componentsQueryKey: any[] = [
        'projBriefings:components',
        projectId,
        briefing.briefing_type_id,
        selectedContentTypeId ?? null,
        selectedChannelId ?? null,
      ]
      const previousComponents = queryClient.getQueryData<any[]>(componentsQueryKey)
      // Optimistic: remove immediately from the selected pile
      queryClient.setQueryData<any[]>(componentsQueryKey, (current) => {
        if (!Array.isArray(current)) return current as any
        return current.filter((c: any) => {
          const sameId = c?.component_id === componentId
          const sameSource = c?.source === source
          return !(sameId && sameSource)
        })
      })

      // If filters are active, remove from channel-specific list
      if (selectedContentTypeId && selectedChannelId && projectId) {
        try {
          const { error } = await supabase.rpc('pcctbc_remove', {
            p_project_id: projectId,
            p_content_type_id: selectedContentTypeId,
            p_channel_id: selectedChannelId,
            p_briefing_type_id: briefing.briefing_type_id,
            p_component_id: componentId,
            p_is_project_component: source === 'project',
          })

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
            queryKey: ['allowedGlobalComponents', selectedChannelId],
          })
          queryClient.invalidateQueries({
            queryKey: ['availableComponents', projectId, briefing.briefing_type_id],
          })
        } catch (error: any) {
          // Rollback optimistic update
          queryClient.setQueryData<any[]>(componentsQueryKey, previousComponents)
          console.error('Error removing component:', error)
          toast({
            title: 'Error',
            description: error.message || 'Failed to remove component',
            variant: 'destructive',
          })
        }
      } else {
        // Otherwise, remove from the project-level briefing template (IMPORTANT: pbtc_remove only)
        try {
          const { error } = await supabase.rpc('pbtc_remove', {
            p_project_id: projectId,
            p_briefing_type_id: briefing.briefing_type_id,
            p_component_id: componentId,
            p_is_project_component: source === 'project',
          })
          if (error) throw error

          toast({ title: 'Success', description: 'Component removed from briefing template' })

          // Refresh only the resolved view for this briefing template
          queryClient.invalidateQueries({ queryKey: ['availableComponents', projectId, briefing.briefing_type_id] })
          queryClient.invalidateQueries({ queryKey: ['projBriefings:components', projectId, briefing.briefing_type_id] })
        } catch (error: any) {
          // Rollback optimistic update
          queryClient.setQueryData<any[]>(componentsQueryKey, previousComponents)
          console.error('Error removing template component:', error)
          toast({
            title: 'Error',
            description: error.message || 'Failed to remove component',
            variant: 'destructive',
          })
        }
      }
    },
    [selectedContentTypeId, selectedChannelId, projectId, briefing.briefing_type_id, supabase, queryClient]
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
    <div
      ref={containerRef}
      style={containerStyle}
      className={`rounded-lg bg-white overflow-hidden ${!isExpanded ? 'border border-gray-200' : ''}`}
    >
      {/* Briefing Header */}
      {!isSingleView ? (
        <div
          className={[
            'flex items-center gap-3 p-4 transition-colors',
            'cursor-pointer hover:bg-gray-50',
            isSelected ? 'bg-gray-50' : '',
          ].join(' ')}
          onClick={onToggle}
        >
          {/* Drag handle */}
          {showDragHandle && dragHandleProps && (
            <div
              {...dragHandleProps.attributes}
              {...dragHandleProps.listeners}
              className="cursor-move p-1 hover:bg-gray-100 rounded"
            >
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
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-gray-100 text-gray-500"
                  title="More actions"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    requestAnimationFrame(() => onSetDefault())
                  }}
                >
                  {briefing.is_default ? 'Default briefing' : 'Make default'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    requestAnimationFrame(() => onImportBriefing())
                  }}
                >
                  Import from File/Link
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    requestAnimationFrame(() => onResetTemplate())
                  }}
                >
                  Reset Template
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onSelect={() => {
                    requestAnimationFrame(() => onRemove())
                  }}
                >
                  Delete briefing
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex-shrink-0">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </div>
        </div>
      ) : null}

      {/* Expanded Content */}
      {isExpanded && (
        <div className="bg-white">
          <div className="p-4 space-y-3">
            {/* Filter Pills */}
            <div className="space-y-4 pb-4">
              {/* Applies to */}
              <div
                className={`rounded-lg border p-3 ${
                  (appliesToContentTypes?.length || 0) === 0
                    ? 'border-dashed border-gray-300 bg-gray-50'
                    : 'border-gray-200'
                }`}
              >
                <div className="text-sm font-medium text-gray-900">Applies to</div>

                {isAppliesToLoading ? (
                  <div className="mt-3 text-sm text-gray-500">Loading…</div>
                ) : (appliesToContentTypes?.length || 0) === 0 ? (
                  <div className="mt-3 text-sm text-gray-600">
                    No assignments yet. Add at least one channel + content type to use this briefing.
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {(appliesToContentTypes || []).map((ct) => {
                      const chans = appliesToChannelsByCt?.get(ct.id) || []
                      const isCtSelected = selectedContentTypeId === ct.id
                      return (
                        <div key={ct.id}>
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              className={[
                                'text-left text-xs font-medium transition-colors',
                                isCtSelected ? 'text-gray-900' : 'text-gray-700 hover:text-gray-900',
                              ].join(' ')}
                              onClick={() => onContentTypeChange?.(ct.id)}
                              title="Select content type"
                            >
                              {ct.title}
                            </button>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                                title="Remove content type from this briefing"
                                onClick={() => onRemoveAppliesToContentType?.(ct.id, ct.title)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {chans.map((ch) => (
                              <button
                                key={`${ct.id}-${ch.id}`}
                                type="button"
                                className={[
                                  'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                                  selectedContentTypeId === ct.id && selectedChannelId === ch.id
                                    ? 'border-gray-900 bg-gray-900 text-white'
                                    : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50',
                                ].join(' ')}
                                onClick={() => {
                                  // Reuse existing selector logic (UI-only change).
                                  onContentTypeChange?.(ct.id)
                                  onChannelChange?.(ch.id)
                                }}
                                title="Select content type + channel"
                              >
                                {ch.name}
                                <button
                                  type="button"
                                  className="text-gray-300 hover:text-red-200"
                                  title="Remove"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onRemoveAppliesTo?.(ct.id, ch.id, ct.title, ch.name)
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </button>
                            ))}
                            <button
                              type="button"
                              className="text-sm text-blue-600 hover:underline whitespace-nowrap"
                              onClick={() => openAddChannelForCt(ct.id)}
                            >
                              + Add channel
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Add content type (bottom, full width) */}
                <div className="mt-4">
                  <Dialog
                    open={isAddContentTypeOpen}
                    onOpenChange={(open) => {
                      setIsAddContentTypeOpen(open)
                      if (!open) {
                        setContentTypesToAdd([])
                        setChannelsToAddForNewContentTypes([])
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="h-9 w-full">
                        <Plus className="h-4 w-4 mr-1" />
                        Add content type
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-xl">
                      <DialogHeader>
                        <DialogTitle>Add Content Type</DialogTitle>
                      </DialogHeader>

                      <div className="space-y-4">
                        <div>
                          <Label className="mb-2 block">Content Types</Label>
                          <MultiSelect
                            options={addableContentTypes.map((ct) => ({ id: String(ct.id), label: ct.title }))}
                            value={contentTypesToAdd.map(String)}
                            onChange={(values) => setContentTypesToAdd(values.map(Number))}
                            placeholder={
                              addableContentTypes.length === 0
                                ? 'No content types available to add'
                                : 'Select content types...'
                            }
                          />
                        </div>

                        <div>
                          <Label className="mb-2 block">Channels</Label>
                          <MultiSelect
                            options={assignmentChannelOptions.map((ch) => ({ id: String(ch.id), label: ch.name }))}
                            value={channelsToAddForNewContentTypes.map(String)}
                            onChange={(values) => setChannelsToAddForNewContentTypes(values.map(Number))}
                            placeholder={
                              assignmentChannelOptions.length === 0 ? 'No channels available' : 'Select channels...'
                            }
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            We’ll create the cross-product of selected content types × channels.
                          </p>
                        </div>
                      </div>

                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setIsAddContentTypeOpen(false)}
                          disabled={isAddingAppliesTo}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleConfirmAddNewContentTypes}
                          disabled={
                            contentTypesToAdd.length === 0 ||
                            channelsToAddForNewContentTypes.length === 0 ||
                            isAddingAppliesTo
                          }
                        >
                          {isAddingAppliesTo ? 'Adding…' : 'Add'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {/* Add channel for a specific content type */}
              <Dialog
                open={isAddChannelOpen}
                onOpenChange={(open) => {
                  setIsAddChannelOpen(open)
                  if (!open) {
                    setContentTypeForAddChannel(null)
                    setChannelToAddId(null)
                  }
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Channel</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <Label>Select a channel</Label>
                    <Select
                      value={channelToAddId?.toString() || ''}
                      onValueChange={(v) => setChannelToAddId(Number(v))}
                      disabled={availableChannelsForCt.length === 0}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={
                            availableChannelsForCt.length === 0
                              ? 'No channels available to add'
                              : 'Choose a channel...'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {availableChannelsForCt.map((ch) => (
                          <SelectItem key={ch.id} value={ch.id.toString()}>
                            {ch.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddChannelOpen(false)} disabled={isAddingAppliesTo}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAddAppliesTo}
                      disabled={!contentTypeForAddChannel || !channelToAddId || isAddingAppliesTo}
                    >
                      {isAddingAppliesTo ? 'Adding…' : 'Add'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

            </div>
            
            {/* Components List */}
            <div>
              <div className="mb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500">Selected components for</span>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-800 hover:bg-gray-50"
                        title="Select content type"
                      >
                        {(contentTypes.find((ct) => ct.id === selectedContentTypeId)?.title as string | undefined) ??
                          'Select content type'}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {(contentTypes || []).map((ct) => (
                        <DropdownMenuItem
                          key={ct.id}
                          onSelect={() => {
                            requestAnimationFrame(() => onContentTypeChange?.(ct.id))
                          }}
                        >
                          {ct.title}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span className="text-xs text-gray-500">to be published on</span>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-800 hover:bg-gray-50"
                        title="Select channel"
                      >
                        {(channels.find((ch) => ch.id === selectedChannelId)?.name as string | undefined) ??
                          'Select channel'}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {(channels || []).map((ch) => (
                        <DropdownMenuItem
                          key={ch.id}
                          onSelect={() => {
                            requestAnimationFrame(() => onChannelChange?.(ch.id))
                          }}
                        >
                          {ch.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span className="text-xs text-gray-500">({components.length})</span>
                </div>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={components.map(getComponentDndId)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {components.length === 0 ? (
                      <div className="text-center py-6 text-sm text-gray-500">
                        No components assigned yet
                      </div>
                    ) : null}

                    {components.map(component => (
                      <SortableComponentItem
                        key={getComponentDndId(component)}
                        component={component}
                        onTitleChange={(value) =>
                          handleUpdateComponent(component, { custom_title: value })
                        }
                        onDescriptionChange={(value) =>
                          handleUpdateComponent(component, { custom_description: value })
                        }
                        onRemoveFromBriefing={() => handleRemoveComponent(component.component_id, component.source)}
                        onAddToAllChannels={() =>
                          handleAddToAllChannels({
                            id: component.component_id,
                            source: component.source,
                            title: component.effective_title,
                            description: component.effective_description || null,
                          })
                        }
                        onAddToAllContentTypesAndChannels={() =>
                          handleAddToAllContentTypesAndChannels({
                            id: component.component_id,
                            source: component.source,
                            title: component.effective_title,
                            description: component.effective_description || null,
                          })
                        }
                        onAddToOtherBriefings={() =>
                          openAddToOtherBriefings({
                            id: component.component_id,
                            source: component.source,
                            title: component.effective_title,
                            description: component.effective_description || null,
                          })
                        }
                        onRemoveFromAllProjectBriefings={
                          component.source === 'project'
                            ? () =>
                                onRequestDeleteProjectComponent?.({
                                  componentId: component.component_id,
                                  componentTitle: component.effective_title,
                                })
                            : undefined
                        }
                        onDeleteFromProject={
                          component.source === 'global'
                            ? onRequestDeleteGlobalComponentFromProject
                              ? () =>
                                  onRequestDeleteGlobalComponentFromProject({
                                    componentId: component.component_id,
                                    componentTitle: component.effective_title,
                                  })
                              : undefined
                            : undefined
                        }
                      />
                    ))}

                    {/* Create custom component (minimal, styled like selected items) */}
                    <div className="border rounded-lg p-3 bg-white border-gray-200">
                      <div className="flex items-start gap-3">
                        <div className="p-1 rounded mt-1 text-gray-300">
                          <Plus className="w-3 h-3" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              value={customComponentTitle}
                              onChange={(e) => setCustomComponentTitle(e.target.value)}
                              className="text-sm font-semibold border-none p-0 h-auto focus:ring-0 focus:border-none bg-transparent"
                              placeholder="Create a custom component…"
                              disabled={isCreatingCustomComponent}
                            />
                          </div>

                          {isEditingNewComponentDescription ? (
                            <Textarea
                              value={customComponentDescription}
                              onChange={(e) => setCustomComponentDescription(e.target.value)}
                              onBlur={() => setIsEditingNewComponentDescription(false)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  setCustomComponentDescription('')
                                  setIsEditingNewComponentDescription(false)
                                }
                              }}
                              className="text-xs text-gray-600 mt-1 min-h-[60px] resize-y"
                              placeholder="Component description (optional)"
                              autoFocus
                              rows={3}
                              disabled={isCreatingCustomComponent}
                            />
                          ) : customComponentDescription ? (
                            <p
                              className="text-xs text-gray-500 mt-1 cursor-text hover:text-gray-700 whitespace-pre-wrap"
                              onClick={(e) => {
                                e.stopPropagation()
                                setIsEditingNewComponentDescription(true)
                              }}
                              title="Click to edit description"
                            >
                              {customComponentDescription}
                            </p>
                          ) : (
                            <p
                              className="text-xs text-gray-400 mt-1 cursor-text hover:text-gray-600 italic"
                              onClick={(e) => {
                                e.stopPropagation()
                                setIsEditingNewComponentDescription(true)
                              }}
                              title="Click to add description"
                            >
                              Click to add description
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleCreateAndAddCustomComponent()
                            }}
                            disabled={
                              isCreatingCustomComponent ||
                              !customComponentTitle.trim() ||
                              !selectedContentTypeId ||
                              !selectedChannelId
                            }
                            title={
                              selectedContentTypeId && selectedChannelId
                                ? 'Create and add to the selected Applies-to scope'
                                : 'Select an Applies-to content type + channel first'
                            }
                          >
                            {isCreatingCustomComponent ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Creating…
                              </>
                            ) : (
                              <>
                                <Plus className="h-4 w-4" />
                                Create
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </SortableContext>
              </DndContext>

              <Dialog open={isAddToOtherBriefingsOpen} onOpenChange={setIsAddToOtherBriefingsOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add to other briefings</DialogTitle>
                  </DialogHeader>
                  <div className="py-4 space-y-3">
                    <div className="text-xs text-gray-500">
                      Adds this component to the selected briefing templates (across all applies-to scopes).
                    </div>
                    <MultiSelect
                      options={(allBriefings || [])
                        .filter((b) => b.briefing_type_id !== briefing.briefing_type_id)
                        .map((b) => ({
                          id: String(b.briefing_type_id),
                          label: b.display_title,
                        }))}
                      value={otherBriefingsSelection.map(String)}
                      onChange={(values) => setOtherBriefingsSelection(values.map(Number))}
                      placeholder="Select briefing types..."
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddToOtherBriefingsOpen(false)} disabled={isBulkAdding}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleConfirmAddToOtherBriefings}
                      disabled={isBulkAdding || otherBriefingsSelection.length === 0}
                    >
                      {isBulkAdding ? 'Adding…' : 'Add'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Available to Add Section */}
            {selectedContentTypeId && selectedChannelId && (
              <div className="mt-16 border-t border-gray-100 pt-8">
                <div className="mb-3">
                  <span className="text-xs text-gray-500">Available to add</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type="search"
                      placeholder="Search available components..."
                      value={availableSearchQuery}
                      onChange={(e) => setAvailableSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select
                    value={availableTagFilter}
                    onValueChange={(v) => setAvailableTagFilter(v as any)}
                  >
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                      <SelectItem value="Recommended">Recommended</SelectItem>
                    <SelectItem value="Removed">Removed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {componentsToShow.length === 0 ? (
                  <div className="text-xs text-gray-500 border border-dashed rounded p-3 bg-gray-50">
                    No results. Try clearing your search or changing the type filter.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sortedComponentsToShow.map((availComp) => {
                          const isAdding = addingComponentId === availComp.key
                          const origin =
                            availComp.origin === 'project' || availComp.origin === 'global'
                              ? availComp.origin
                              : (availComp.is_project_component ? 'project' : 'global')
                          const isOverridden = origin === 'global' && availComp.global_overridden === true
                          const effectiveTitle = availComp.custom_title || availComp.title
                          const effectiveDescription = availComp.custom_description || availComp.description
                          const isRecommended = availComp.tag === 'Recommended'
                          const isRemoved = availComp.tag === 'Removed'
                          
                          return (
                            <div
                              key={availComp.key}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                const params = new URLSearchParams(searchParams.toString())
                                params.set('component', `${origin}:${availComp.component_id}`)
                                router.replace(`${pathname}?${params.toString()}`, { scroll: false })
                              }}
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter' && e.key !== ' ') return
                                e.preventDefault()
                                const params = new URLSearchParams(searchParams.toString())
                                params.set('component', `${origin}:${availComp.component_id}`)
                                router.replace(`${pathname}?${params.toString()}`, { scroll: false })
                              }}
                              className="border rounded-lg p-3 bg-white border-gray-200 cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 min-h-[96px]"
                              title={availComp.template_layer ? `Layer: ${availComp.template_layer}` : undefined}
                            >
                              <div className="flex items-stretch gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-semibold text-gray-900">
                                      {effectiveTitle}
                                    </h4>
                                    <Badge
                                      variant="outline"
                                      className={[
                                        'text-[10px] px-2 py-0.5',
                                        origin === 'project'
                                          ? 'border-blue-200 bg-blue-50 text-blue-700'
                                          : 'border-gray-200 bg-gray-50 text-gray-700',
                                      ].join(' ')}
                                    >
                                      {origin === 'project' ? 'Project' : 'Global'}
                                    </Badge>
                                    {isRecommended ? (
                                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-emerald-200 bg-emerald-50 text-emerald-700">
                                        Recommended
                                      </Badge>
                                    ) : null}
                                    {isRemoved ? (
                                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-gray-200 bg-gray-50 text-gray-600">
                                        Removed
                                      </Badge>
                                    ) : null}
                                    {isOverridden ? (
                                      <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                                        Overridden
                                      </Badge>
                                    ) : null}
                                  </div>
                                  {effectiveDescription ? (
                                    <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap line-clamp-2">
                                      {effectiveDescription}
                                    </p>
                                  ) : null}
                                </div>

                                {origin === 'project' && onRequestDeleteProjectComponent ? (
                                  <button
                                    type="button"
                                    className="p-2 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                                    title="Remove from all project briefings"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      onRequestDeleteProjectComponent({
                                        componentId: availComp.component_id,
                                        componentTitle: effectiveTitle,
                                      })
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                ) : null}

                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    handleAddComponent(availComp)
                                  }}
                                  disabled={isAdding}
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
                )}
              </div>
            )}

            {/* Danger zone */}
            <div className="mt-10 border-t border-gray-200 pt-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-900">Delete briefing</div>
                  <div className="text-xs text-gray-500 mt-1">Removes this briefing type from the project.</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={onRemove}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SortableBriefingItem(props: SortableBriefingItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.briefing.briefing_type_id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <BriefingItemContent
      {...props}
      containerRef={setNodeRef}
      containerStyle={style}
      dragHandleProps={{ attributes, listeners }}
      showDragHandle={!props.isSingleView}
    />
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
  const [activeBriefingTypeId, setActiveBriefingTypeId] = useState<number | null>(null)
  const [selectedTypes, setSelectedTypes] = useState<number[]>([])
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
  const [isScopeDialogOpen, setIsScopeDialogOpen] = useState(false)
  const [scopeBriefingTypeId, setScopeBriefingTypeId] = useState<number | null>(null)
  const [scopeRequiredBriefingTypeId, setScopeRequiredBriefingTypeId] = useState<number | null>(null)
  const [scopeContentTypeIds, setScopeContentTypeIds] = useState<number[]>([])
  const [scopeChannelIds, setScopeChannelIds] = useState<number[]>([])
  const [isSavingScope, setIsSavingScope] = useState(false)

  // Keep "briefingTypeId" in the URL as the source of truth for the right pane state.
  React.useEffect(() => {
    const urlBriefingTypeId = searchParams.get('briefingTypeId')
    setSingleBriefingView(urlBriefingTypeId ? Number(urlBriefingTypeId) : null)
  }, [searchParams])

  const componentKey = searchParams.get('component')

  const closeComponentPane = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('component')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [pathname, router, searchParams])

  const closeRightPane = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('briefingTypeId')
    params.delete('contentTypeId')
    params.delete('channelId')
    router.replace(`${pathname}?${params.toString()}`)
  }, [searchParams, router, pathname])

  // ESC to close (matches details-pane behavior)
  React.useEffect(() => {
    if (!singleBriefingView) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRightPane()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [singleBriefingView, closeRightPane])

  // Fetch available briefing types
  const { data: availableTypes, isLoading: isLoadingAvailable } = useQuery({
    queryKey: ['projBriefings:available', projectId],
    queryFn: async () => {
      const { data, error } = await fetchAvailableBriefingTypes(projectId)
      if (error) throw error
      return data || []
    },
  })

  // Scope picker options (project-scoped only)
  const { data: scopeContentTypeOptions = [] } = useQuery({
    queryKey: ['projBriefings:scopeContentTypes', projectId],
    queryFn: async () => {
      // Avoid fragile `!inner` joins; fetch ids first then fetch titles (matches working pattern in LibraryTab).
      const { data: rows, error } = await supabase
        .from('project_content_type_settings')
        .select('content_type_id')
        .eq('project_id', projectId)

      if (error) throw error

      const ids = Array.from(new Set((rows || []).map((r: any) => r.content_type_id).filter(Boolean)))
      if (!ids.length) return []

      const { data: types, error: typesError } = await supabase
        .from('content_types')
        .select('id, title')
        .in('id', ids)
      if (typesError) throw typesError

      return (types || [])
        .map((ct: any) => ({ id: String(ct.id), label: ct.title as string }))
        .sort((a, b) => a.label.localeCompare(b.label))
    },
  })

  const { data: scopeChannelOptions = [] } = useQuery({
    queryKey: ['projBriefings:scopeChannels', projectId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('project_channels')
        .select('channel_id')
        .eq('project_id', projectId)

      if (error) throw error

      const ids = Array.from(new Set((rows || []).map((r: any) => r.channel_id).filter(Boolean)))
      if (!ids.length) return []

      const { data: chans, error: chansError } = await supabase
        .from('channels')
        .select('id, name')
        .in('id', ids)
      if (chansError) throw chansError

      return (chans || [])
        .map((ch: any) => ({ id: String(ch.id), label: ch.name as string }))
        .sort((a, b) => a.label.localeCompare(b.label))
    },
  })

  const handleSaveScope = useCallback(async () => {
    if (!scopeBriefingTypeId) return
    if (scopeContentTypeIds.length === 0 || scopeChannelIds.length === 0) {
      toast({
        title: 'Scope required',
        description: 'Select at least one content type and one channel.',
        variant: 'destructive',
      })
      return
    }

    setIsSavingScope(true)
    try {
      const pairs: Array<{ ct: number; ch: number }> = []
      for (const ct of scopeContentTypeIds) {
        for (const ch of scopeChannelIds) {
          pairs.push({ ct, ch })
        }
      }

      await Promise.all(
        pairs.map(({ ct, ch }) =>
          supabase.rpc('pcctb_set', {
            p_project_id: projectId,
            p_content_type_id: ct,
            p_channel_id: ch,
            p_briefing_type_id: scopeBriefingTypeId,
          })
        )
      )

      toast({ title: 'Success', description: 'Briefing scope saved' })

      queryClient.invalidateQueries({
        queryKey: ['projBriefings:appliesTo', projectId, scopeBriefingTypeId],
      })

      // Mark as completed so closing the dialog won't trigger rollback.
      setScopeRequiredBriefingTypeId(null)
      setIsScopeDialogOpen(false)
      setScopeContentTypeIds([])
      setScopeChannelIds([])
      const createdId = scopeBriefingTypeId
      setScopeBriefingTypeId(null)

      // Open right pane on this briefing and preselect first pair in URL
      const params = new URLSearchParams(searchParams.toString())
      params.set('briefingTypeId', createdId.toString())
      params.set('contentTypeId', String(scopeContentTypeIds[0]))
      params.set('channelId', String(scopeChannelIds[0]))
      router.replace(`${pathname}?${params.toString()}`)
    } catch (err: any) {
      console.error('Failed to save scope:', err)
      toast({ title: 'Error', description: err.message || 'Failed to save scope', variant: 'destructive' })
    } finally {
      setIsSavingScope(false)
    }
  }, [scopeBriefingTypeId, scopeContentTypeIds, scopeChannelIds, supabase, projectId, queryClient, searchParams, router, pathname])

  const rollbackScopeIfRequired = useCallback(
    async (briefingTypeId: number) => {
      try {
        // If the pane is currently open for this briefing, close it.
        const urlBriefingTypeId = searchParams.get('briefingTypeId')
        if (urlBriefingTypeId && Number(urlBriefingTypeId) === briefingTypeId) {
          closeRightPane()
        }

        const { error } = await removeProjectBriefingType(projectId, briefingTypeId)
        if (error) throw error

        queryClient.invalidateQueries({ queryKey: ['projBriefings:list', projectId] })
        onRefresh()
        toast({ title: 'Cancelled', description: 'Briefing removed (scope was not set).' })
      } catch (err: any) {
        console.error('Failed to rollback briefing without scope:', err)
        toast({
          title: 'Error',
          description: err?.message || 'Failed to rollback briefing without scope',
          variant: 'destructive',
        })
      }
    },
    [closeRightPane, onRefresh, projectId, queryClient, searchParams]
  )

  // (Legacy Add Components modal removed) - available components are now surfaced inline via the RPC-backed list in the right pane.

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

      // Prompt scope for single add (per briefing type)
      if (selectedTypes.length === 1) {
        const newId = selectedTypes[0]
        setScopeBriefingTypeId(newId)
        setScopeRequiredBriefingTypeId(newId)
        setIsScopeDialogOpen(true)
        const params = new URLSearchParams(searchParams.toString())
        params.set('briefingTypeId', newId.toString())
        router.replace(`${pathname}?${params.toString()}`)
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add briefing types',
        variant: 'destructive',
      })
    }
  }, [projectId, selectedTypes, queryClient, onRefresh, searchParams, router, pathname])

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
        setScopeBriefingTypeId(newBriefing.briefing_type_id)
        setScopeRequiredBriefingTypeId(newBriefing.briefing_type_id)
        setIsScopeDialogOpen(true)
        const params = new URLSearchParams(searchParams.toString())
        params.set('briefingTypeId', newBriefing.briefing_type_id.toString())
        router.replace(`${pathname}?${params.toString()}`)
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create briefing',
        variant: 'destructive',
      })
    }
  }, [projectId, newBriefingTitle, newBriefingDescription, queryClient, onRefresh, searchParams, router, pathname])

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
            {/* Use non-modal dropdown here to avoid pointer-events/focus-lock conflicts when opening a Dialog from a menu item */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 bg-white text-black hover:bg-gray-50 border-gray-300"
                >
                  <Plus className="w-4 h-4" />
                  Add briefing
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    // Let the menu fully close before opening the Dialog
                    requestAnimationFrame(() => setIsNewBriefingDialogOpen(true))
                  }}
                >
                  New briefing
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    requestAnimationFrame(() => setAddDialogOpen(true))
                  }}
                >
                  Add from library
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Keep existing dialogs/calls intact; open them programmatically from the dropdown. */}
            <Dialog open={isNewBriefingDialogOpen} onOpenChange={setIsNewBriefingDialogOpen}>
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

            <Dialog open={isAddDialogOpen} onOpenChange={setAddDialogOpen}>
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
                  <Button onClick={handleAddBriefingTypes} disabled={selectedTypes.length === 0}>
                    Add Selected
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
      </div>

      {/* Briefing Scope Dialog (CT × Channel assignments) */}
      <Dialog
        open={isScopeDialogOpen}
        onOpenChange={(open) => {
          setIsScopeDialogOpen(open)
          if (!open) {
            const requiredId = scopeRequiredBriefingTypeId
            if (requiredId) {
              setScopeRequiredBriefingTypeId(null)
              setScopeBriefingTypeId(null)
              setScopeContentTypeIds([])
              setScopeChannelIds([])
              // Rollback (async) so we don't block UI thread.
              void rollbackScopeIfRequired(requiredId)
              return
            }
            setScopeBriefingTypeId(null)
            setScopeContentTypeIds([])
            setScopeChannelIds([])
            setIsSavingScope(false)
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Choose where this briefing applies</DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div>
              <Label className="mb-2 block">Content Types</Label>
              <MultiSelect
                options={scopeContentTypeOptions}
                value={scopeContentTypeIds.map(String)}
                onChange={(values) => setScopeContentTypeIds(values.map(Number))}
                placeholder="Select content types..."
              />
            </div>
            <div>
              <Label className="mb-2 block">Channels</Label>
              <MultiSelect
                options={scopeChannelOptions}
                value={scopeChannelIds.map(String)}
                onChange={(values) => setScopeChannelIds(values.map(Number))}
                placeholder="Select channels..."
              />
            </div>
            <p className="text-xs text-gray-500">
              We’ll assign this briefing to every selected Content Type × Channel combination.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                const requiredId = scopeRequiredBriefingTypeId
                setIsScopeDialogOpen(false)
                if (requiredId) {
                  setScopeRequiredBriefingTypeId(null)
                  setScopeBriefingTypeId(null)
                  setScopeContentTypeIds([])
                  setScopeChannelIds([])
                  void rollbackScopeIfRequired(requiredId)
                }
              }}
              disabled={isSavingScope}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveScope}
              disabled={isSavingScope || scopeContentTypeIds.length === 0 || scopeChannelIds.length === 0}
            >
              {isSavingScope ? 'Saving…' : 'Save scope'}
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
                  <BriefingComponents
                    key={briefing.briefing_type_id}
                    briefing={briefing}
                    projectId={projectId}
                    isExpanded={false}
                    isSingleView={false}
                    isSelected={briefing.briefing_type_id === singleBriefingView}
                    allBriefings={briefingTypes}
                    onToggle={() => {
                      const params = new URLSearchParams(searchParams.toString())
                      params.set('briefingTypeId', briefing.briefing_type_id.toString())
                      // Keep any existing filter params if present; don't clear contentTypeId/channelId.
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
                      onAddComponent={() => {}}
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

      {/* Right Pane: Briefing details (no overlay; left side remains interactive) */}
      {singleBriefingView ? (
        <div
          className={[
            'fixed inset-y-0 right-0 z-40 flex w-full border-l border-gray-200 bg-white shadow-xl',
            componentKey ? 'max-w-[1080px]' : 'max-w-[560px]',
          ].join(' ')}
          style={{ pointerEvents: 'auto' }}
        >
          {/* Pane 2: Briefing details */}
          <div className="flex h-full w-full max-w-[560px] flex-col border-r border-gray-200">
            {(() => {
              const selectedBriefing =
                briefingTypes.find((b) => b.briefing_type_id === singleBriefingView) ?? null

              return (
                <>
                  <div className="flex h-16 flex-shrink-0 items-center justify-between border-b bg-white px-4 shadow-sm">
                    <div className="min-w-0">
                      <div className="text-sm text-gray-500">Briefing</div>
                      <div className="truncate text-base font-semibold text-gray-900">
                        {selectedBriefing?.display_title || 'Briefing'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-gray-100 text-gray-600"
                            title="More"
                            aria-label="More"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              if (!selectedBriefing) return
                              requestAnimationFrame(() => handleSetDefault(selectedBriefing.briefing_type_id))
                            }}
                          >
                            {selectedBriefing?.is_default ? 'Default briefing' : 'Make default'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => {
                              if (!selectedBriefing) return
                              requestAnimationFrame(() => {
                                setActiveBriefingTypeId(selectedBriefing.briefing_type_id)
                                setIsImportDialogOpen(true)
                              })
                            }}
                          >
                            Import from File/Link
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              if (!selectedBriefing) return
                              requestAnimationFrame(() => handleOpenResetConfirmation(selectedBriefing.briefing_type_id))
                            }}
                          >
                            Reset Template
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onSelect={() => {
                              if (!selectedBriefing) return
                              requestAnimationFrame(() => handleOpenRemoveConfirmation(selectedBriefing.briefing_type_id))
                            }}
                          >
                            Delete briefing
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={closeRightPane}
                        aria-label="Close"
                        title="Close"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto">
                    {selectedBriefing ? (
                      <>
                        <div className="px-4 pt-4">
                          <BriefingDescriptionEditor
                            briefingTypeId={selectedBriefing.briefing_type_id}
                            initialDescription={selectedBriefing.display_description || ''}
                            titleForMeta={selectedBriefing.display_title || 'Briefing'}
                            onSave={(next) =>
                              handleUpdateMeta(
                                selectedBriefing.briefing_type_id,
                                selectedBriefing.display_title,
                                next || null
                              )
                            }
                          />
                        </div>
                        <BriefingComponents
                          key={`pane-${selectedBriefing.briefing_type_id}`}
                          briefing={selectedBriefing}
                          projectId={projectId}
                          isExpanded={true}
                          isSingleView={true}
                          disableBriefingSort={true}
                          allBriefings={briefingTypes}
                          onToggle={() => {}}
                          onSetDefault={() => handleSetDefault(selectedBriefing.briefing_type_id)}
                          onRemove={() => handleOpenRemoveConfirmation(selectedBriefing.briefing_type_id)}
                          onUpdateMeta={(customTitle, customDescription) =>
                            handleUpdateMeta(selectedBriefing.briefing_type_id, customTitle, customDescription)
                          }
                          onComponentUpdate={(componentId, source, updates) =>
                            handleComponentUpdate(selectedBriefing.briefing_type_id, componentId, source, updates)
                          }
                          onComponentRemove={(componentId, source) =>
                            handleComponentRemove(selectedBriefing.briefing_type_id, componentId, source)
                          }
                          onComponentReorder={(order) =>
                            handleComponentReorder(selectedBriefing.briefing_type_id, order)
                          }
                          onAddComponent={() => {}}
                          onImportBriefing={() => {
                            setActiveBriefingTypeId(selectedBriefing.briefing_type_id)
                            setIsImportDialogOpen(true)
                          }}
                          onResetTemplate={() => handleOpenResetConfirmation(selectedBriefing.briefing_type_id)}
                        />
                      </>
                    ) : (
                      <div className="p-4 text-sm text-gray-500">This briefing type could not be loaded.</div>
                    )}
                  </div>
                </>
              )
            })()}
          </div>

          {/* Pane 3: Component details */}
          {componentKey ? (
            <div className="hidden h-full w-[520px] max-w-[92vw] flex-col bg-white md:flex">
              <div className="flex h-16 flex-shrink-0 items-center justify-between border-b bg-white px-4 shadow-sm">
                <div className="min-w-0">
                  <div className="text-sm text-gray-500">Component</div>
                  <div className="truncate text-base font-semibold text-gray-900">{componentKey}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={closeComponentPane}
                  aria-label="Close component"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                <ComponentDetailsPane projectId={projectId} componentKey={componentKey} onClose={closeComponentPane} />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

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
  isSelected = false,
  allBriefings = [],
  disableBriefingSort = false,
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
  isSelected?: boolean
  allBriefings?: ProjectBriefingType[]
  disableBriefingSort?: boolean
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

  const [confirmDialog, setConfirmDialog] = useState<null | {
    title: string
    description: string
    actionLabel: string
    actionClassName?: string
    onConfirm: () => Promise<void>
  }>(null)
  const [isConfirming, setIsConfirming] = useState(false)

  const briefingTitleForDialogs = useMemo(
    () => briefing.custom_title || briefing.display_title,
    [briefing.custom_title, briefing.display_title]
  )
  
  // State for filtering
  const [selectedContentTypeId, setSelectedContentTypeId] = useState<number | null>(() => {
    const v = searchParams.get('contentTypeId')
    if (!v) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  })
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(() => {
    const v = searchParams.get('channelId')
    if (!v) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  })

  // Applies-to: rows in project_ct_channel_briefings scoped by briefing type
  const { data: appliesToRows, isLoading: isLoadingAppliesTo } = useQuery({
    queryKey: ['projBriefings:appliesTo', projectId, briefing.briefing_type_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_ct_channel_briefings')
        .select(`
          content_type_id,
          channel_id,
          content_types!inner(id, title),
          channels!inner(id, name)
        `)
        .eq('project_id', projectId)
        .eq('briefing_type_id', briefing.briefing_type_id)

      if (error) throw error
      return (data || []) as any[]
    },
    enabled: isExpanded,
    staleTime: 10_000,
  })

  const appliesToContentTypes = useMemo(() => {
    const map = new Map<number, { id: number; title: string }>()
    ;(appliesToRows || []).forEach((row: any) => {
      const id = row.content_type_id as number
      const title = row.content_types?.title as string | undefined
      if (!map.has(id) && title) map.set(id, { id, title })
    })
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title))
  }, [appliesToRows])

  const appliesToChannelsByCt = useMemo(() => {
    const map = new Map<number, Array<{ id: number; name: string }>>()
    ;(appliesToRows || []).forEach((row: any) => {
      const ctId = row.content_type_id as number
      const chId = row.channel_id as number
      const chName = row.channels?.name as string | undefined
      if (!chName) return
      const list = map.get(ctId) || []
      if (!list.some((c) => c.id === chId)) list.push({ id: chId, name: chName })
      map.set(ctId, list)
    })
    // Sort channel pills by name for readability (not affecting task ordering)
    Array.from(map.entries()).forEach(([ctId, list]) => {
      map.set(ctId, list.sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)))
    })
    return map
  }, [appliesToRows])

  const removeAppliesTo = useCallback(
    (contentTypeId: number, channelId: number, contentTypeTitle: string, channelName: string) => {
      setConfirmDialog({
        title: 'Remove assignment',
        description: `Remove this briefing from "${contentTypeTitle}" / "${channelName}"? This won’t delete any components.`,
        actionLabel: 'Remove',
        actionClassName: 'bg-red-600 hover:bg-red-700',
        onConfirm: async () => {
          const { error } = await supabase
            .from('project_ct_channel_briefings')
            .delete()
            .eq('project_id', projectId)
            .eq('content_type_id', contentTypeId)
            .eq('channel_id', channelId)
            .eq('briefing_type_id', briefing.briefing_type_id)

          if (error) throw error

          toast({ title: 'Removed', description: 'Briefing detached from channel/content type' })
          queryClient.invalidateQueries({
            queryKey: ['projBriefings:appliesTo', projectId, briefing.briefing_type_id],
          })

          // If we removed the currently selected pair, reset selection and URL
          if (selectedContentTypeId === contentTypeId && selectedChannelId === channelId) {
            setSelectedChannelId(null)
            setSelectedContentTypeId(null)
            const params = new URLSearchParams(searchParams.toString())
            params.delete('contentTypeId')
            params.delete('channelId')
            router.replace(`${pathname}?${params.toString()}`)
          }
        },
      })
    },
    [
      supabase,
      queryClient,
      projectId,
      briefing.briefing_type_id,
      selectedContentTypeId,
      selectedChannelId,
      searchParams,
      router,
      pathname,
    ]
  )

  const removeAppliesToContentType = useCallback(
    (contentTypeId: number, contentTypeTitle: string) => {
      setConfirmDialog({
        title: 'Remove content type',
        description: `Remove this briefing from all channels for "${contentTypeTitle}"? This won’t delete any components.`,
        actionLabel: 'Remove',
        actionClassName: 'bg-red-600 hover:bg-red-700',
        onConfirm: async () => {
          const { error } = await supabase
            .from('project_ct_channel_briefings')
            .delete()
            .eq('project_id', projectId)
            .eq('briefing_type_id', briefing.briefing_type_id)
            .eq('content_type_id', contentTypeId)

          if (error) throw error

          toast({ title: 'Removed', description: 'Content type detached from this briefing' })
          queryClient.invalidateQueries({
            queryKey: ['projBriefings:appliesTo', projectId, briefing.briefing_type_id],
          })

          if (selectedContentTypeId === contentTypeId) {
            setSelectedChannelId(null)
            setSelectedContentTypeId(null)
            const params = new URLSearchParams(searchParams.toString())
            params.delete('contentTypeId')
            params.delete('channelId')
            router.replace(`${pathname}?${params.toString()}`)
          }
        },
      })
    },
    [
      supabase,
      queryClient,
      projectId,
      briefing.briefing_type_id,
      selectedContentTypeId,
      searchParams,
      router,
      pathname,
    ]
  )

  const deleteProjectComponentEverywhere = useCallback(
    async (projectComponentId: number) => {
      const { error } = await supabase.rpc('pbc_delete_project_component', {
        p_project_id: projectId,
        p_project_component_id: projectComponentId,
      })
      if (error) throw error

      // Update project_briefing_components (modal list)
      queryClient.invalidateQueries({ queryKey: ['projBriefings:library', projectId] })
      // Refresh open briefing pane lists (if open)
      queryClient.invalidateQueries({ queryKey: ['projBriefings:components', projectId] })
      queryClient.invalidateQueries({ queryKey: ['allowedGlobalComponents'] })
      queryClient.invalidateQueries({ queryKey: ['availableComponents', projectId] })
    },
    [supabase, queryClient, projectId]
  )

  const removeGlobalComponentFromProjectEverywhere = useCallback(
    async (briefingComponentId: number) => {
      const { error } = await supabase.rpc('pbc_remove_global_component_from_project', {
        p_project_id: projectId,
        p_briefing_component_id: briefingComponentId,
      })
      if (error) throw error

      // Refresh both the briefing lists and any component libraries/indexes that depend on usage.
      queryClient.invalidateQueries({ queryKey: ['projBriefings:library', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projBriefings:components', projectId] })
      queryClient.invalidateQueries({ queryKey: ['allowedGlobalComponents'] })
      queryClient.invalidateQueries({ queryKey: ['availableComponents', projectId] })
    },
    [supabase, queryClient, projectId]
  )

  const requestDeleteProjectComponent = useCallback(
    ({ componentId, componentTitle }: { componentId: number; componentTitle: string }) => {
      setConfirmDialog({
        title: 'Delete component from project',
        description:
          'Delete this component from the project? It will be removed from all briefings where it is used.',
        actionLabel: 'Delete',
        actionClassName: 'bg-red-600 hover:bg-red-700',
        onConfirm: async () => {
          await deleteProjectComponentEverywhere(componentId)
        },
      })
    },
    [deleteProjectComponentEverywhere]
  )

  const requestDeleteGlobalComponentFromProject = useCallback(
    ({ componentId, componentTitle }: { componentId: number; componentTitle: string }) => {
      setConfirmDialog({
        title: 'Delete system component from project',
        description:
          `Delete "${componentTitle}" from this project? It will be removed from all briefings where it is used.`,
        actionLabel: 'Delete',
        actionClassName: 'bg-red-600 hover:bg-red-700',
        onConfirm: async () => {
          await removeGlobalComponentFromProjectEverywhere(componentId)
        },
      })
    },
    [removeGlobalComponentFromProjectEverywhere]
  )
  
  const handleContentTypeChange = useCallback((contentTypeId: number | null) => {
    setSelectedContentTypeId(contentTypeId)
    // Clear channel selection when switching content types (will be auto-selected when channels load)
    setSelectedChannelId(null)
    
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
  
  // Default selection: prefer URL params, else first applies-to content type
  React.useEffect(() => {
    if (!isExpanded) return
    if (appliesToContentTypes.length === 0) return
    if (selectedContentTypeId) return

    const urlContentTypeId = searchParams.get('contentTypeId')
    const parsed = urlContentTypeId ? Number(urlContentTypeId) : null
    const valid =
      parsed && appliesToContentTypes.some((ct) => ct.id === parsed) ? parsed : null
    const next = valid ?? appliesToContentTypes[0].id

    setSelectedContentTypeId(next)
    const params = new URLSearchParams(searchParams.toString())
    params.set('contentTypeId', next.toString())
    router.replace(`${pathname}?${params.toString()}`)
  }, [isExpanded, appliesToContentTypes, selectedContentTypeId, searchParams, router, pathname])
  
  // Fetch channels filtered by selected content type
  const channels = useMemo(() => {
    if (!selectedContentTypeId) return []
    return appliesToChannelsByCt.get(selectedContentTypeId) || []
  }, [selectedContentTypeId, appliesToChannelsByCt])
  
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
  
  // Auto-select channel: prefer URL param if valid, else first available
  React.useEffect(() => {
    if (!selectedContentTypeId) return
    if (!channels || channels.length === 0) return
    if (selectedChannelId) return

    const urlChannelId = searchParams.get('channelId')
    const parsed = urlChannelId ? Number(urlChannelId) : null
    const valid = parsed && channels.some((ch) => ch.id === parsed) ? parsed : null
    const next = valid ?? channels[0].id

    setSelectedChannelId(next)
    const params = new URLSearchParams(searchParams.toString())
    params.set('channelId', next.toString())
    router.replace(`${pathname}?${params.toString()}`)
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

  // Fetch "Available to add" from the backend RPC (scoped to the selected content type + channel).
  const { data: availableComponents } = useQuery({
    queryKey: ['availableComponents', projectId, briefing.briefing_type_id, selectedContentTypeId, selectedChannelId],
    queryFn: async () => {
      if (!selectedContentTypeId || !selectedChannelId) return []
      const { data, error } = await supabase.rpc('pcctbc_available_components', {
        p_project_id: projectId,
        p_content_type_id: selectedContentTypeId,
        p_channel_id: selectedChannelId,
        p_briefing_type_id: briefing.briefing_type_id,
      })
      if (error) throw error
      return (data || []) as PcctbcAvailableComponentRow[]
    },
    enabled: isExpanded && !!selectedContentTypeId && !!selectedChannelId,
  })

  // Add applies-to options
  const { data: assignmentContentTypeOptions = [] } = useQuery({
    queryKey: ['projBriefings:assignmentContentTypes', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_content_type_settings')
        .select('content_type_id, content_types!inner(id, title)')
        .eq('project_id', projectId)

      if (error) throw error
      return (data || [])
        .map((row: any) => ({ id: row.content_type_id as number, title: row.content_types.title as string }))
        .sort((a, b) => a.title.localeCompare(b.title))
    },
    enabled: isExpanded,
  })

  const { data: assignmentChannelOptions = [] } = useQuery({
    queryKey: ['projBriefings:assignmentChannels', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_channels')
        .select('channel_id, channels!inner(id, name)')
        .eq('project_id', projectId)

      if (error) throw error
      return (data || [])
        .map((row: any) => ({ id: row.channel_id as number, name: row.channels.name as string }))
        .sort((a, b) => a.name.localeCompare(b.name))
    },
    enabled: isExpanded,
  })

  const handleAddAppliesTo = useCallback(
    async (contentTypeId: number, channelId: number) => {
      const allowedContentTypes = new Set(assignmentContentTypeOptions.map((ct) => ct.id))
      const allowedChannels = new Set(assignmentChannelOptions.map((ch) => ch.id))

      if (!allowedContentTypes.has(contentTypeId) || !allowedChannels.has(channelId)) {
        throw new Error('Invalid content type or channel selection')
      }

      const { error } = await supabase.rpc('pcctb_set', {
        p_project_id: projectId,
        p_content_type_id: contentTypeId,
        p_channel_id: channelId,
        p_briefing_type_id: briefing.briefing_type_id,
      })

      if (error) throw error

      toast({ title: 'Success', description: 'Assignment updated' })

      queryClient.invalidateQueries({
        queryKey: ['projBriefings:appliesTo', projectId, briefing.briefing_type_id],
      })

      setSelectedContentTypeId(contentTypeId)
      setSelectedChannelId(channelId)
      const params = new URLSearchParams(searchParams.toString())
      params.set('contentTypeId', contentTypeId.toString())
      params.set('channelId', channelId.toString())
      router.replace(`${pathname}?${params.toString()}`)
    },
    [
      assignmentContentTypeOptions,
      assignmentChannelOptions,
      supabase,
      projectId,
      briefing.briefing_type_id,
      queryClient,
      searchParams,
      router,
      pathname,
    ]
  )

  const Item = disableBriefingSort ? BriefingItemContent : SortableBriefingItem

  return (
    <>
      <Item
        briefing={briefing}
        isExpanded={isExpanded}
        isSingleView={isSingleView}
        isSelected={isSelected}
        allBriefings={allBriefings}
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
        contentTypes={appliesToContentTypes}
        channels={channels || []}
        selectedContentTypeId={selectedContentTypeId}
        selectedChannelId={selectedChannelId}
        onContentTypeChange={handleContentTypeChange}
        onChannelChange={handleChannelChange}
        availableComponents={availableComponents || []}
        projectId={projectId}
        appliesToContentTypes={appliesToContentTypes}
        appliesToChannelsByCt={appliesToChannelsByCt}
        isAppliesToLoading={isLoadingAppliesTo}
        onRemoveAppliesTo={removeAppliesTo}
        onRemoveAppliesToContentType={removeAppliesToContentType}
        assignmentContentTypeOptions={assignmentContentTypeOptions}
        assignmentChannelOptions={assignmentChannelOptions}
        onAddAppliesTo={handleAddAppliesTo}
        onRequestDeleteProjectComponent={requestDeleteProjectComponent}
        onRequestDeleteGlobalComponentFromProject={requestDeleteGlobalComponentFromProject}
      />

      <AlertDialog
        open={!!confirmDialog}
        onOpenChange={(open) => {
          if (open) return
          if (isConfirming) return
          setConfirmDialog(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isConfirming}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirmDialog?.actionClassName}
              onClick={async () => {
                if (!confirmDialog) return
                setIsConfirming(true)
                try {
                  await confirmDialog.onConfirm()
                  setConfirmDialog(null)
                } catch (err: any) {
                  console.error('Confirmation action failed:', err)
                  toast({
                    title: 'Error',
                    description: err?.message || 'Action failed',
                    variant: 'destructive',
                  })
                } finally {
                  setIsConfirming(false)
                }
              }}
              disabled={isConfirming}
            >
              {isConfirming ? 'Working…' : confirmDialog?.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  )
}

