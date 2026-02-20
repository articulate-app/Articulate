"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useSearchParams, usePathname, useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Textarea } from "../../../app/components/ui/textarea"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Button } from "../../../app/components/ui/button"
import { Badge } from "../../../app/components/ui/badge"
import { Input } from "../../../app/components/ui/input"
import { Label } from "../../../app/components/ui/label"
import { Checkbox } from "../../../app/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "../../../app/components/ui/popover"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../../app/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../app/components/ui/select"
import { toast } from "../../../app/components/ui/use-toast"
import { useAiBuildContent } from "../../ai-chat/hooks"
import { 
  Plus, 
  X, 
  GripVertical,
  Loader2,
  CheckCircle2,
  Circle,
  MoreVertical,
  Save,
  Download,
  ChevronDown,
  ChevronRight,
  Move,
  Edit,
  Trash2,
  History,
  Search
} from "lucide-react"
import { RadioGroup, RadioGroupItem } from "../../../app/components/ui/radio-group"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "../../../app/components/ui/dropdown-menu"
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
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import debounce from 'lodash.debounce'
import { RichTextEditor } from "../../../app/components/ui/rich-text-editor"
import { SEOPanel } from '../SEOPanel'
import { CTTVariantSEO } from '../hooks/use-ctt-variant-seo'
import { StructureReviewPanel, ReviewedComponent } from './StructureReviewPanel'

interface TaskContentTabProps {
  taskId: number
  projectId?: number
  contentTypeId?: number
  languageId?: number
  onChannelChange?: (channelId: number | null) => void
}

interface TaskChannel {
  channel_id: number
  name: string
}

interface TaskChannelBriefing {
  briefing_type_id: number | null
}

type ComponentScope = 'task' | 'project' | 'channel'

type ComponentOrigin = 'global' | 'project' | 'task'

function normalizeComponentOrigin(origin: unknown): ComponentOrigin | null {
  if (typeof origin !== 'string') return null
  const v = origin.trim().toLowerCase()
  if (!v) return null

  // Handle expanded backend variants (examples seen in RPC output):
  // - task_global -> Global
  // - task_project -> Project
  // - task_ad_hoc -> Task
  if (v === 'global' || v.endsWith('_global') || v.includes('global')) return 'global'
  if (v === 'project' || v.endsWith('_project') || v.includes('project')) return 'project'
  if (v === 'task' || v.startsWith('task') || v.includes('ad_hoc')) return 'task'

  return null
}

function getComponentOrigin(component: Pick<TaskChannelComponent, 'origin' | 'task_component_id' | 'briefing_component_id' | 'project_component_id'>): ComponentOrigin {
  const normalized = normalizeComponentOrigin(component.origin)
  if (normalized) return normalized

  // Fallback heuristic (legacy behavior) for older RPC payloads
  if (component.task_component_id && !component.briefing_component_id && !component.project_component_id) return 'task'
  if (component.project_component_id) return 'project'
  if (component.briefing_component_id) return 'global'
  return 'task'
}

interface TaskChannelComponent {
  // From tc_components_for_task_channel RPC
  task_component_id: string | null // UUID if component is added to this task, null if just available from template
  briefing_component_id: number | null // ID from briefing_components table, or null for ad-hoc
  project_component_id: number | null // ID from project_components table, or null
  /**
   * New backend field. Use this for UI labeling instead of legacy `source`.
   * - global: global (system) component
   * - project: project component
   * - task: task ad-hoc component
   */
  origin?: string
  /**
   * New backend field.
   * True when a global component is overridden (customized) at project/channel level.
   * Only meaningful when origin === 'global'.
   */
  global_overridden?: boolean
  title: string
  description: string | null
  selected: boolean // True = top area, False = bottom area (explicitly deselected)
  position: number | null
  custom_title: string | null
  custom_description: string | null
  purpose: string | null
  guidance: string | null
  suggested_word_count: number | null
  subheads: any[] | null
  is_ad_hoc?: boolean // True for ad-hoc components
  component_scope?: ComponentScope
}

type AvailableComponentTag =
  | 'Removed from task'
  | 'Recommended'
  | 'Removed'
  | 'System'
  | 'System (other briefings)'
  | 'Custom'

interface TaskChannelAvailableComponent {
  // Stable identifier like "g:<id>" or "p:<id>"
  key: string
  tag: AvailableComponentTag | string
  title: string
  description: string | null
  // for insert behavior
  is_project_component: boolean
  briefing_component_id: number | null
  project_component_id: number | null
  custom_title: string | null
  custom_description: string | null
  // present when tag === "Removed from task"
  task_component_id: string | null
}

interface TaskComponentOutput {
  content_text: string | null
  updated_at: string | null
}

interface EffectiveSEO {
  seo_required: boolean | null
  seo_source: string | null
  primary_keyword: string | null
  secondary_keywords: string[] | null
}

// Special "Main" component ID for channels without a structured briefing
const MAIN_BRIEFING_COMPONENT_ID = 80

// Resizable Rich Text Editor Component
function ResizableEditor({
  componentId,
  value,
  onChange,
  toolbarId
}: {
  componentId: number
  value: string
  onChange: (text: string) => void
  toolbarId: string
}) {
  const [height, setHeight] = useState(200)
  const resizeRef = useRef<HTMLDivElement>(null)
  const isResizing = useRef(false)
  const startY = useRef(0)
  const startHeight = useRef(0)

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    startY.current = e.clientY
    startHeight.current = height
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      const deltaY = e.clientY - startY.current
      const newHeight = Math.max(150, Math.min(800, startHeight.current + deltaY))
      setHeight(newHeight)
    }
    
    const handleMouseUp = () => {
      isResizing.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div className="relative" ref={resizeRef}>
      <RichTextEditor
        value={value}
        onChange={onChange}
        readOnly={false}
        toolbarId={toolbarId}
        height={height}
      />
      <div
        onMouseDown={handleMouseDown}
        className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize flex items-center justify-center hover:bg-gray-100 rounded-tl transition-colors z-10"
        style={{ cursor: 'nwse-resize' }}
        title="Drag to resize"
      >
        <GripVertical className="w-3 h-3 text-gray-400 rotate-45" />
      </div>
    </div>
  )
}

// Add Component Row - styled like other components
function AddComponentRow({
  projectId,
  taskId,
  channelId,
  briefingTypeId,
  contentTypeId,
  onComponentAdded
}: {
  projectId?: number
  taskId: number
  channelId: number
  briefingTypeId: number | null
  contentTypeId?: number
  onComponentAdded: () => void
}) {
  const supabase = createClientComponentClient()
  const [isExpanded, setIsExpanded] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [scope, setScope] = useState<ComponentScope>('task')
  
  const handleSave = async () => {
    if (!title.trim()) return
    
    setIsSubmitting(true)
    try {
      if (scope === 'task') {
        // A) Just this task (ad-hoc) - create directly in task channel
        // Use the new helper function tcc_add_ad_hoc_component
        const { data: componentId, error: addErr } = await supabase.rpc('tcc_add_ad_hoc_component', {
          p_task_id: taskId,
          p_channel_id: channelId,
          p_title: title.trim(),
          p_description: description.trim() || null,
          p_position: null
        })
        
        if (addErr) throw addErr
        
        if (!componentId) throw new Error('Failed to create ad-hoc component')
        
        // The component is created and selected by default
        // No need for additional steps
      } else if (scope === 'project') {
        // B) Save to project's briefing type (global to project, all channels)
        // First create the project component, then link it to the briefing type
        if (!projectId || !briefingTypeId) {
          throw new Error('Project ID and briefing type ID required')
        }
        
        // Step 1: Create project component
        const { data: created, error: createErr } = await supabase.rpc('create_project_component', {
          p_project_id: projectId,
          p_title: title.trim(),
          p_description: description.trim() || null
        })
        
        if (createErr) throw createErr
        
        const projectComponentId = created?.project_component_id || created?.id || created
        if (!projectComponentId) throw new Error('Missing project_component_id')
        
        // Step 2: Link to project briefing type template across ALL CT×Channel combos
        // that use this briefing type in project_ct_channel_briefings.
        const { error: addErr } = await supabase.rpc('pbtc_add_project_all_channels', {
          p_project_id: projectId,
          p_briefing_type_id: briefingTypeId,
          p_project_component_id: Number(projectComponentId),
          p_position: null,
          p_custom_title: title.trim(),
          p_custom_description: description.trim() || null
        })
        
        if (addErr) throw addErr
        
        // Step 3: Re-seed this task's components from the project briefing template
        // This will include the newly added component
        const { error: seedErr } = await supabase.rpc('tc_set_briefing', {
          p_task_id: taskId,
          p_channel_id: channelId,
          p_briefing_type_id: briefingTypeId
        })
        
        if (seedErr) {
          console.warn('Failed to seed task:', seedErr)
          // Continue - component is in template, can be manually added later
        }
      } else if (scope === 'channel') {
        // C) Save to project × channel's briefing type (channel-specific template)
        // First create the project component, then link it to the channel-specific template
        if (!projectId || !contentTypeId || !briefingTypeId) {
          throw new Error('Project ID, content type ID, and briefing type ID required')
        }
        
        // Step 1: Create project component
        const { data: created, error: createErr } = await supabase.rpc('create_project_component', {
          p_project_id: projectId,
          p_title: title.trim(),
          p_description: description.trim() || null
        })
        
        if (createErr) throw createErr
        
        const projectComponentId = created?.project_component_id || created?.id || created
        if (!projectComponentId) throw new Error('Missing project_component_id')
        
        // Step 2: Link to channel-specific template using pcctbc_add_project
        const { error: addErr } = await supabase.rpc('pcctbc_add_project', {
          p_project_id: projectId,
          p_content_type_id: contentTypeId,
          p_channel_id: channelId,
          p_briefing_type_id: briefingTypeId,
          p_project_component_id: Number(projectComponentId),
          p_position: null,
          p_custom_title: title.trim(),
          p_custom_description: description.trim() || null,
          p_purpose: null,
          p_guidance: null,
          p_suggested_word_count: null,
          p_subheads: null
        })
        
        if (addErr) throw addErr
        
        // Step 3: Re-seed this task's components from the project+channel template
        // This will include the newly added component
        const { error: seedErr } = await supabase.rpc('tc_set_briefing', {
          p_task_id: taskId,
          p_channel_id: channelId,
          p_briefing_type_id: briefingTypeId
        })
        
        if (seedErr) {
          console.warn('Failed to seed task:', seedErr)
          // Continue - component is in template, can be manually added later
        }
      }
      
      // Reset and refresh
      setTitle('')
      setDescription('')
      setScope('task')
      setIsExpanded(false)
      onComponentAdded()
      
      const scopeMessages = {
        task: 'Component added to this task only.',
        project: 'Component added to project template (all channels).',
        channel: 'Component added to channel-specific template.'
      }
      
      toast({
        title: 'Component added',
        description: scopeMessages[scope]
      })
    } catch (err: any) {
      console.error('Failed to add component:', err)
      toast({
        title: 'Failed to add component',
        description: err.message || 'An error occurred',
        variant: 'destructive'
      })
    } finally {
      setIsSubmitting(false)
    }
  }
  
  if (!isExpanded) {
    return (
      <div 
        className="border rounded-lg mb-2 bg-white"
      >
        <div className="flex items-center gap-2 p-3">
          <div className="w-5 h-5 flex items-center justify-center text-gray-400">
            <Plus className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={() => setIsExpanded(true)}
              placeholder="Component title"
              className="text-sm font-medium border-0 shadow-none focus-visible:ring-0 p-0 h-auto"
              autoFocus={false}
            />
          </div>
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>
    )
  }
  
  return (
    <div className="border rounded-lg mb-2 bg-white">
      {/* Header row */}
      <div className="flex items-center gap-2 p-3 border-b">
        <div className="w-5 h-5 flex items-center justify-center text-gray-400">
          <Plus className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Component title"
            className="text-sm font-medium flex-1"
            autoFocus
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setIsExpanded(false)
            if (!title.trim()) {
              setTitle('')
              setDescription('')
            }
          }}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      
      {/* Expanded content */}
      <div className="p-3 space-y-3">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Component description (optional)"
          className="text-xs text-gray-500 min-h-[60px]"
        />
        
        {/* Scope selector */}
        {projectId && (
          <div className="space-y-2">
            <Label className="text-xs font-medium text-gray-700">Save to:</Label>
            <RadioGroup value={scope} onValueChange={(value) => setScope(value as ComponentScope)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="task" id="scope-task" />
                <Label htmlFor="scope-task" className="text-xs text-gray-600 cursor-pointer font-normal">
                  Just this task (ad-hoc)
                </Label>
              </div>
              {briefingTypeId && (
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="project" id="scope-project" />
                  <Label htmlFor="scope-project" className="text-xs text-gray-600 cursor-pointer font-normal">
                    Project briefing (all channels)
                  </Label>
                </div>
              )}
              {briefingTypeId && contentTypeId && (
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="channel" id="scope-channel" />
                  <Label htmlFor="scope-channel" className="text-xs text-gray-600 cursor-pointer font-normal">
                    Project × Channel briefing (channel-specific)
                  </Label>
                </div>
              )}
            </RadioGroup>
          </div>
        )}
        
        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            onClick={handleSave} 
            disabled={isSubmitting || !title.trim()}
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Component
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => {
              setIsExpanded(false)
              setTitle('')
              setDescription('')
              setScope('task')
            }}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

// Sortable Component Item
function SortableComponentItem({
  component,
  isSelected,
  onToggle,
  onEditCustom,
  onReorder,
  isEditing,
  onStartEdit,
  onCancelEdit,
  isEditingDescription,
  onStartEditDescription,
  onCancelEditDescription,
  output,
  onOutputChange,
  onSaveOutput,
  isLoadingOutput,
  onLoadOutput,
  projectId,
  contentTypeId,
  channelId,
  briefingTypeId,
  onEditInTemplate,
  onRemoveFromTemplate,
  onBuildWithAI,
  autoExpandComponentId
}: {
  component: TaskChannelComponent
  isSelected: boolean
  onToggle: () => void
  onEditCustom: (taskComponentId: string | null, briefingComponentId: number | null, projectComponentId: number | null, title: string, description: string, scope?: ComponentScope) => void
  onReorder: (componentId: number, newPosition: number) => void
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  isEditingDescription: boolean
  onStartEditDescription: () => void
  onCancelEditDescription: () => void
  output: TaskComponentOutput | null
  onOutputChange: (text: string) => void
  onSaveOutput: (componentId: number) => void
  isLoadingOutput: boolean
  onLoadOutput?: () => void
  projectId?: number
  contentTypeId?: number
  channelId?: number
  briefingTypeId?: number | null
  onEditInTemplate?: (componentBriefingId: number, title: string, description: string, scope: ComponentScope, projectComponentId?: number | null) => void
  onRemoveFromTemplate?: (componentBriefingId: number, scope: ComponentScope, projectComponentId?: number | null, keepInTask?: boolean) => void
  onBuildWithAI?: (componentId: number | string) => void
  autoExpandComponentId?: number | null
}) {
  // Use task_component_id (UUID) or generate a unique ID from other fields
  const sortableId = component.task_component_id || `temp-${component.briefing_component_id || component.project_component_id || Math.random()}`
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ 
    id: sortableId
  })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  
  const [customTitle, setCustomTitle] = useState(component.custom_title || component.title)
  const [customDescription, setCustomDescription] = useState(component.custom_description || component.description || '')
  const [isExpanded, setIsExpanded] = useState(false) // Collapsed by default
  
  // Debounced save for custom fields
  const debouncedSave = useMemo(
    () => debounce((title: string, desc: string, scope?: ComponentScope) => {
      onEditCustom(
        component.task_component_id,
        component.briefing_component_id,
        component.project_component_id,
        title,
        desc,
        scope
      )
    }, 800),
    [onEditCustom, component.task_component_id, component.briefing_component_id, component.project_component_id]
  )
  
  useEffect(() => {
    setCustomTitle(component.custom_title || component.title)
    setCustomDescription(component.custom_description || component.description || '')
  }, [component.task_component_id, component.briefing_component_id, component.project_component_id, component.custom_title, component.title, component.custom_description, component.description])
  
  // Auto-expand component if it matches autoExpandComponentId
  useEffect(() => {
    const componentId = component.briefing_component_id || component.project_component_id
    if (autoExpandComponentId && componentId === autoExpandComponentId && isSelected) {
      setIsExpanded(true)
      if (!output && !isLoadingOutput) {
        onLoadOutput?.()
      }
    }
  }, [autoExpandComponentId, component.briefing_component_id, component.project_component_id, isSelected, output, isLoadingOutput, onLoadOutput])
  
  // Cleanup debounced save on unmount or when component changes
  useEffect(() => {
    return () => {
      debouncedSave.cancel()
    }
  }, [debouncedSave, component.task_component_id])
  
  const handleTitleChange = (value: string) => {
    setCustomTitle(value)
    debouncedSave(value, customDescription, component.component_scope)
  }
  
  const handleDescriptionChange = (value: string) => {
    setCustomDescription(value)
    debouncedSave(customTitle, value, component.component_scope)
  }
  
  // Determine if component is template-backed
  // If briefing_component_id or project_component_id exists, it's from a template
  const isTemplateBacked = !!(component.briefing_component_id || component.project_component_id)
  const componentScope: ComponentScope = component.component_scope || (component.project_component_id ? 'project' : component.briefing_component_id ? 'channel' : 'task')
  
  const derivedOrigin = useMemo((): ComponentOrigin => {
    return getComponentOrigin(component)
  }, [component.origin, component.task_component_id, component.briefing_component_id, component.project_component_id])

  const originLabel = useMemo(() => {
    if (derivedOrigin === 'global') return 'Global'
    if (derivedOrigin === 'project') return 'Project'
    return 'Task'
  }, [derivedOrigin])

  const originBadgeClass = useMemo(() => {
    if (derivedOrigin === 'project') return 'border-blue-200 bg-blue-50 text-blue-700'
    if (derivedOrigin === 'global') return 'border-gray-200 bg-gray-50 text-gray-700'
    return 'border-purple-200 bg-purple-50 text-purple-700'
  }, [derivedOrigin])

  const shouldShowOverriddenBadge = useMemo(() => {
    return derivedOrigin === 'global' && component.global_overridden === true
  }, [derivedOrigin, component.global_overridden])

  const aiBuildTargetId: number | string | null =
    component.task_component_id || component.briefing_component_id || component.project_component_id || null

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`border rounded-lg mb-2 p-3 bg-white border-gray-200 ${isDragging ? 'shadow-lg' : ''}`}
    >
      {!isExpanded ? (
        // Collapsed: Single row with title, checkbox, and chevron
        <div className="flex items-start gap-3">
          <div {...attributes} {...listeners} className="cursor-move p-1 hover:bg-gray-200 rounded mt-1">
            <GripVertical className="w-3 h-3 text-gray-400" />
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="mt-0.5"
          >
            {isSelected ? (
              <CheckCircle2 className="w-5 h-5 text-blue-600" />
            ) : (
              <Circle className="w-5 h-5 text-gray-300" />
            )}
          </button>
          <div className="flex-1 min-w-0 space-y-2">
            {isEditing ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
                <Input
                  value={customTitle}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Component title"
                  className="text-sm font-semibold border-none p-0 h-auto focus:ring-0 focus:border-none bg-transparent flex-1"
                  onBlur={onCancelEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      onCancelEdit()
                    } else if (e.key === 'Escape') {
                      onCancelEdit()
                    }
                  }}
                  autoFocus
                />
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 sm:shrink-0">
                  <Badge variant="outline" className={["text-[10px] px-2 py-0.5", originBadgeClass].join(' ')}>
                    {originLabel}
                  </Badge>
                  {shouldShowOverriddenBadge && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 leading-none">
                      Overridden
                    </Badge>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
                <h4
                  className="text-sm font-semibold text-gray-900 flex-1 cursor-text hover:text-gray-700 line-clamp-2 sm:truncate"
                  onClick={onStartEdit}
                  title="Click to edit"
                >
                  {customTitle}
                </h4>
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 sm:shrink-0">
                  <Badge variant="outline" className={["text-[10px] px-2 py-0.5", originBadgeClass].join(' ')}>
                    {originLabel}
                  </Badge>
                  {shouldShowOverriddenBadge && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 leading-none">
                      Overridden
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* Build with AI button in collapsed view */}
          {onBuildWithAI && aiBuildTargetId && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="hidden sm:inline-flex"
                onClick={(e) => {
                  e.stopPropagation()
                  onBuildWithAI(aiBuildTargetId)
                }}
              >
                <Plus className="w-3 h-3 mr-1" />
                Build with AI
              </Button>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="sm:hidden p-1 hover:bg-gray-100 rounded mt-1 text-gray-500"
                    title="More actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault()
                      onBuildWithAI(aiBuildTargetId)
                    }}
                  >
                    Build with AI
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              if (isSelected) {
                setIsExpanded(true)
                if (!output && !isLoadingOutput) {
                  onLoadOutput?.()
                }
              } else {
                // If not selected, clicking chevron selects it
                onToggle()
              }
            }}
            className="p-1 hover:bg-gray-100 rounded mt-1"
          >
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      ) : (
        // Expanded: Full details with description and editor
        <div>
          {/* Header row (same as collapsed) */}
          <div className="flex items-start gap-3">
            <div {...attributes} {...listeners} className="cursor-move p-1 hover:bg-gray-200 rounded mt-1">
              <GripVertical className="w-3 h-3 text-gray-400" />
            </div>
            <button
              type="button"
              onClick={onToggle}
              className="mt-0.5"
            >
              {isSelected ? (
                <CheckCircle2 className="w-5 h-5 text-blue-600" />
              ) : (
                <Circle className="w-5 h-5 text-gray-300" />
              )}
            </button>
            <div className="flex-1 min-w-0 space-y-2">
              {isEditing ? (
                <div className="flex items-center gap-2 min-w-0">
                  <Input
                    value={customTitle}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Component title"
                    className="text-sm font-semibold border-none p-0 h-auto focus:ring-0 focus:border-none bg-transparent flex-1"
                    onBlur={onCancelEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        onCancelEdit()
                      } else if (e.key === 'Escape') {
                        onCancelEdit()
                      }
                    }}
                    autoFocus
                  />
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 sm:shrink-0">
                    <Badge variant="outline" className={["text-[10px] px-2 py-0.5", originBadgeClass].join(' ')}>
                      {originLabel}
                    </Badge>
                    {shouldShowOverriddenBadge && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 leading-none">
                        Overridden
                      </Badge>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
                  <h4
                    className="text-sm font-semibold text-gray-900 flex-1 cursor-text hover:text-gray-700 line-clamp-2 sm:truncate"
                    onClick={onStartEdit}
                    title="Click to edit"
                  >
                    {customTitle}
                  </h4>
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 sm:shrink-0">
                    <Badge variant="outline" className={["text-[10px] px-2 py-0.5", originBadgeClass].join(' ')}>
                      {originLabel}
                    </Badge>
                    {shouldShowOverriddenBadge && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 leading-none">
                        Overridden
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* Mobile: keep Build with AI inside the ... menu */}
              {onBuildWithAI && aiBuildTargetId && (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="sm:hidden p-1 hover:bg-gray-100 rounded mt-1 text-gray-500"
                      title="More actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault()
                        onBuildWithAI(aiBuildTargetId)
                      }}
                    >
                      Build with AI
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {isTemplateBacked && projectId && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="p-1 hover:bg-gray-100 rounded"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="w-4 h-4 text-gray-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        if (onEditInTemplate && (component.briefing_component_id || component.project_component_id)) {
                          onEditInTemplate(
                            component.briefing_component_id || component.project_component_id || 0,
                            customTitle,
                            customDescription,
                            componentScope,
                            component.project_component_id
                          )
                        }
                      }}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit in template
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        if (onRemoveFromTemplate && (component.briefing_component_id || component.project_component_id)) {
                          onRemoveFromTemplate(
                            component.briefing_component_id || component.project_component_id || 0,
                            componentScope,
                            component.project_component_id,
                            true // keep in task
                          )
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove from template (keep in task)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        if (onRemoveFromTemplate && (component.briefing_component_id || component.project_component_id)) {
                          onRemoveFromTemplate(
                            component.briefing_component_id || component.project_component_id || 0,
                            componentScope,
                            component.project_component_id,
                            false // remove from task too
                          )
                        }
                      }}
                      className="text-red-600"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove from template and task
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="p-1 hover:bg-gray-100 rounded mt-1"
              >
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>
          
          {/* Expanded content */}
          <div className="mt-3 pt-3 border-t space-y-3">
            {/* (Legacy) template-scope badge removed from UI to avoid confusing "source"/"override" semantics. */}
            
            {/* Description and metadata */}
            {isEditingDescription ? (
              <Textarea
                value={customDescription}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                placeholder="Component description"
                className="text-xs text-gray-500 min-h-[60px]"
                onBlur={onCancelEditDescription}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    onCancelEditDescription()
                  } else if (e.key === 'Escape') {
                    onCancelEditDescription()
                  }
                }}
                autoFocus
              />
            ) : (
              <p 
                className="text-xs text-gray-500 cursor-text hover:text-blue-600"
                onClick={onStartEditDescription}
                title="Click to edit description"
              >
                {customDescription || 'Click to add description'}
              </p>
            )}
            {component.purpose && (
              <p className="text-xs text-gray-600">{component.purpose}</p>
            )}
            {component.guidance && (
              <p className="text-xs text-gray-500 italic">{component.guidance}</p>
            )}
            {component.suggested_word_count && (
              <p className="text-xs text-gray-400">
                Suggested: ~{component.suggested_word_count} words
              </p>
            )}
            
            {/* Build with AI button */}
            {onBuildWithAI && aiBuildTargetId && (
              <div className="pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="hidden sm:inline-flex"
                  onClick={() => onBuildWithAI(aiBuildTargetId)}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Build with AI
                </Button>
              </div>
            )}
            
            {/* Editor */}
            {isLoadingOutput ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-2">
                <ResizableEditor
                  componentId={component.briefing_component_id || component.project_component_id || 0}
                  value={output?.content_text || ''}
                  onChange={(text) => {
                    // Update local state for display (parent handles ref update)
                    onOutputChange(text)
                    // Trigger debounced save (reads from ref in parent)
                    onSaveOutput(component.briefing_component_id || component.project_component_id || 0)
                  }}
                  toolbarId={`ql-toolbar-${component.briefing_component_id || component.project_component_id}`}
                />
                {output?.updated_at && (
                  <p className="text-xs text-gray-400">
                    Last updated: {new Date(output.updated_at).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function TaskContentTab({ taskId, projectId, contentTypeId, languageId, onChannelChange }: TaskContentTabProps) {
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const aiBuildContent = useAiBuildContent()
  const queryClient = useQueryClient()
  
  // State
  const [channels, setChannels] = useState<TaskChannel[]>([])
  const [availableChannels, setAvailableChannels] = useState<TaskChannel[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null)
  const [selectedBriefingTypeId, setSelectedBriefingTypeId] = useState<number | null>(null)
  const [effectiveDefaultBriefingTypeId, setEffectiveDefaultBriefingTypeId] = useState<number | null>(null)
  const [isNoBriefing, setIsNoBriefing] = useState<boolean>(false)
  const [briefingTypeOptions, setBriefingTypeOptions] = useState<Array<{
    id: number
    title: string
    description: string | null
    isDefault: boolean
  }>>([])
  const [components, setComponents] = useState<TaskChannelComponent[]>([]) // Active components (top area)
  const [removedComponents, setRemovedComponents] = useState<TaskChannelComponent[]>([]) // Removed from task (bottom area - first list)
  const [availableTemplates, setAvailableTemplates] = useState<TaskChannelComponent[]>([]) // Available from template (bottom area - second list)
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null)
  const [editingDescriptionComponentId, setEditingDescriptionComponentId] = useState<string | null>(null)
  const [componentOutputs, setComponentOutputs] = useState<Map<number, TaskComponentOutput>>(new Map())
  const [loadingOutputs, setLoadingOutputs] = useState<Set<number>>(new Set())
  const [seoData, setSeoData] = useState<EffectiveSEO | null>(null)
  const [variantSEOData, setVariantSEOData] = useState<CTTVariantSEO | null>(null)
  const [isUpdatingKeywords, setIsUpdatingKeywords] = useState(false)
  const [isTogglingSEO, setIsTogglingSEO] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isChannelMetaLoading, setIsChannelMetaLoading] = useState(false)
  const [removingChannelIds, setRemovingChannelIds] = useState<Set<number>>(new Set())
  const [isSavingOutput, setIsSavingOutput] = useState<Map<number, boolean>>(new Map())
  const [taskTitle, setTaskTitle] = useState<string>('')
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [autoExpandComponentId, setAutoExpandComponentId] = useState<number | null>(null)
  const [aiThreads, setAiThreads] = useState<Array<{ id: string; title: string | null; last_message_at: string | null; created_at: string }>>([])
  const [isLoadingThreads, setIsLoadingThreads] = useState(false)
  const [taskSourceUrl, setTaskSourceUrl] = useState<string>("")
  const [isImportTemplateOpen, setIsImportTemplateOpen] = useState(false)
  const [availableSearchQuery, setAvailableSearchQuery] = useState('')
  const [availableTagFilter, setAvailableTagFilter] = useState<'__all__' | AvailableComponentTag | string>('__all__')

  const selectedChannelIdRef = useRef<number | null>(null)
  useEffect(() => {
    selectedChannelIdRef.current = selectedChannelId
  }, [selectedChannelId])
  
  // Watch for expandComponent URL param to auto-expand component
  useEffect(() => {
    const expandComponentParam = searchParams.get('expandComponent')
    if (expandComponentParam) {
      const componentId = Number(expandComponentParam)
      setAutoExpandComponentId(componentId)
      
      // Clean up URL param after a short delay
      setTimeout(() => {
        const newParams = new URLSearchParams(searchParams.toString())
        newParams.delete('expandComponent')
        router.replace(`${pathname}?${newParams.toString()}`, { scroll: false })
      }, 500)
    }
  }, [searchParams, pathname, router])
  
  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  
  // Use refs to store latest values for debounced save
  const outputValuesRef = useRef<Map<number, string>>(new Map())
  // Track which channels have already loaded main content (component 80) to prevent infinite loops
  const mainLoadedRef = useRef<Set<number>>(new Set())
  // Track in-flight component output loads (stable ref, not state)
  const loadingOutputsRef = useRef<Set<number>>(new Set())
  
  // Debounced save for component outputs - uses refs to always get latest value
  const debouncedSaveOutput = useMemo(
    () => debounce(async (componentId: number) => {
      if (!selectedChannelId || !taskId) return
      
      // Get the latest value from ref
      const text = outputValuesRef.current.get(componentId) || ''
      
      setIsSavingOutput(prev => new Map(prev).set(componentId, true))
      
      try {
        // Upsert into task_component_outputs
        const { error } = await supabase
          .from('task_component_outputs')
          .upsert({
            task_id: taskId,
            channel_id: selectedChannelId,
            briefing_component_id: componentId,
            content_text: text,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'task_id,channel_id,briefing_component_id'
          })
        
        if (error) throw error
        
        // Update local state
        setComponentOutputs(prev => {
          const newMap = new Map(prev)
          newMap.set(componentId, {
            content_text: text,
            updated_at: new Date().toISOString()
          })
          return newMap
        })
      } catch (err: any) {
        console.error('Failed to save component output:', err)
        toast({
          title: 'Failed to save',
          description: err.message,
          variant: 'destructive'
        })
      } finally {
        setIsSavingOutput(prev => {
          const newMap = new Map(prev)
          newMap.delete(componentId)
          return newMap
        })
      }
    }, 1000),
    [supabase, taskId, selectedChannelId]
  )
  
  // Fetch task channels
  const fetchTaskChannels = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('task_channels')
        .select(`
          channel_id,
          channels!inner(id, name)
        `)
        .eq('task_id', taskId)
      
      if (error) throw error
      
      const taskChannels = (data || []).map((tc: any) => ({
        channel_id: tc.channel_id,
        name: tc.channels.name
      })).sort((a, b) => a.name.localeCompare(b.name))
      
      setChannels(taskChannels)
      
      // Auto-select first channel if available and none selected
      if (taskChannels.length > 0 && !selectedChannelIdRef.current) {
        const firstChannelId = taskChannels[0].channel_id
        setSelectedChannelId(firstChannelId)
        onChannelChange?.(firstChannelId)
      }
    } catch (err: any) {
      console.error('Failed to fetch task channels:', err)
      toast({
        title: 'Error loading channels',
        description: err.message,
        variant: 'destructive'
      })
    }
  }, [supabase, taskId, onChannelChange])
  
  // Fetch available channels for adding
  const fetchAvailableChannels = useCallback(async () => {
    if (!projectId || !contentTypeId) return
    
    try {
      // First try project-specific channels
      let channelsData: any[] = []
      
      const { data: projectChannels, error: projectError } = await supabase
        .from('project_content_types_channels')
        .select(`
          channel_id,
          position,
          channels!inner(id, name)
        `)
        .eq('project_id', projectId)
        .eq('content_type_id', contentTypeId)
        .order('position', { ascending: true })
      
      if (!projectError && projectChannels) {
        channelsData = projectChannels.map((pctc: any) => ({
          channel_id: pctc.channel_id,
          name: pctc.channels.name,
          position: pctc.position
        })).sort((a, b) => {
          // First sort by position, then by name
          const posA = a.position ?? 999
          const posB = b.position ?? 999
          if (posA !== posB) return posA - posB
          return a.name.localeCompare(b.name)
        })
      }
      
      // Fallback to global channels if no project channels
      if (channelsData.length === 0) {
        const { data: globalChannels, error: globalError } = await supabase
          .from('content_types_channels')
          .select(`
            channel_id,
            position,
            channels!inner(id, name)
          `)
          .eq('content_type_id', contentTypeId)
          .order('position', { ascending: true })
        
        if (globalError) throw globalError
        
        channelsData = (globalChannels || []).map((ctc: any) => ({
          channel_id: ctc.channel_id,
          name: ctc.channels.name,
          position: ctc.position
        })).sort((a, b) => {
          // First sort by position, then by name
          const posA = a.position ?? 999
          const posB = b.position ?? 999
          if (posA !== posB) return posA - posB
          return a.name.localeCompare(b.name)
        })
      }
      
      // Filter out already added channels
      const existingIds = new Set(channels.map(c => c.channel_id))
      setAvailableChannels(channelsData.filter((c: TaskChannel) => !existingIds.has(c.channel_id)))
    } catch (err: any) {
      console.error('Failed to fetch available channels:', err)
    }
  }, [supabase, projectId, contentTypeId, channels])
  
  // Fetch explicit briefing override for selected channel (task_channel_briefings)
  const fetchBriefingType = useCallback(async (): Promise<{ briefingTypeId: number | null; disableBriefing: boolean }> => {
    if (!selectedChannelId) {
      return { briefingTypeId: null, disableBriefing: false }
    }
    
    try {
      const { data, error } = await supabase
        .from('task_channel_briefings')
        .select('briefing_type_id, disable_briefing')
        .eq('task_id', taskId)
        .eq('channel_id', selectedChannelId)
        .maybeSingle()
      
      if (error && error.code !== 'PGRST116') throw error
      
      const briefingTypeId = data?.briefing_type_id ?? null
      const disableBriefing = data?.disable_briefing ?? false
      
      return { briefingTypeId, disableBriefing }
    } catch (err: any) {
      console.error('Failed to fetch briefing type override:', err)
      return { briefingTypeId: null, disableBriefing: false }
    }
  }, [supabase, taskId, selectedChannelId])
  
  // Fetch briefing types for project × content type × channel (with channel default info)
  const fetchChannelBriefingTypes = useCallback(async (): Promise<number | null> => {
    if (!projectId || !contentTypeId || !selectedChannelId) {
      setBriefingTypeOptions([])
      setEffectiveDefaultBriefingTypeId(null)
      return null
    }
    
    try {
      const { data, error } = await supabase.rpc('project_channel_briefing_types', {
        p_project_id: projectId,
        p_content_type_id: contentTypeId,
        p_channel_id: selectedChannelId
      })
      
      if (error) throw error
      
      let effectiveId: number | null = null
      // Preserve server order from RPC (already correctly ordered)
      const options = (data || []).map((row: any) => {
        if (row.effective_default_briefing_type_id && typeof row.effective_default_briefing_type_id === 'number') {
          effectiveId = row.effective_default_briefing_type_id
        }
        return {
          id: row.briefing_type_id as number,
          title: row.title as string,
          description: (row.description as string | null) ?? null,
          isDefault: !!row.is_default_for_channel
        }
      })
      
      setBriefingTypeOptions(options)
      setEffectiveDefaultBriefingTypeId(effectiveId)
      return effectiveId
    } catch (err: any) {
      console.error('Failed to fetch channel briefing types:', err)
      setBriefingTypeOptions([])
      setEffectiveDefaultBriefingTypeId(null)
      return null
    }
  }, [supabase, projectId, contentTypeId, selectedChannelId])
  
  type ComponentsQueryResult = {
    activeComponents: TaskChannelComponent[]
    outputsByBriefingId: Record<number, TaskComponentOutput>
  }

  const fetchComponentsForChannel = useCallback(
    async (channelId: number): Promise<ComponentsQueryResult> => {
      const { data, error } = await supabase.rpc('tc_components_for_task_channel', {
        p_task_id: taskId,
        p_channel_id: channelId,
      })

      if (error) throw error

      const rows = (data || []).map((row: any) => ({
        task_component_id: row.task_component_id || null,
        briefing_component_id: row.briefing_component_id || null,
        project_component_id: row.project_component_id || null,
        origin: row.origin || undefined,
        global_overridden: typeof row.global_overridden === 'boolean' ? row.global_overridden : undefined,
        title: row.title || '',
        description: row.description || null,
        selected: row.selected || false,
        position: row.position || null,
        custom_title: row.custom_title || null,
        custom_description: row.custom_description || null,
        purpose: row.purpose || null,
        guidance: row.guidance || null,
        suggested_word_count: row.suggested_word_count || null,
        subheads: row.subheads || null,
        is_ad_hoc: row.is_ad_hoc || false,
        component_scope: row.task_component_id ? 'task' : undefined,
      })) as TaskChannelComponent[]

      // In-task components list: render only selected=true items in the main list
      const activeComponents = rows
        .filter((r) => r.selected === true)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

      const visibleRows = [...activeComponents]
      const briefingIds = Array.from(
        new Set(visibleRows.map((r) => r.briefing_component_id).filter((id): id is number => typeof id === 'number'))
      )

      const outputsByBriefingId: Record<number, TaskComponentOutput> = {}
      if (briefingIds.length > 0) {
        const { data: outputsData, error: outputsError } = await supabase
          .from('task_component_outputs')
          .select('briefing_component_id, content_text, updated_at')
          .eq('task_id', taskId)
          .eq('channel_id', channelId)
          .in('briefing_component_id', briefingIds)

        if (outputsError) throw outputsError

        ;(outputsData || []).forEach((row: any) => {
          if (typeof row.briefing_component_id === 'number') {
            outputsByBriefingId[row.briefing_component_id] = {
              content_text: row.content_text,
              updated_at: row.updated_at,
            }
          }
        })
      }

      return {
        activeComponents,
        outputsByBriefingId,
      }
    },
    [supabase, taskId]
  )

  const effectiveBriefingTypeId = selectedBriefingTypeId ?? effectiveDefaultBriefingTypeId

  const componentsQuery = useQuery<ComponentsQueryResult>({
    queryKey: ['taskComponents', taskId, selectedChannelId, effectiveBriefingTypeId ?? null],
    enabled: !!selectedChannelId && !!effectiveBriefingTypeId && !isNoBriefing,
    // TanStack Query v5: keep previous results visible while fetching the next key
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      if (!selectedChannelId) throw new Error('No channel selected')
      return fetchComponentsForChannel(selectedChannelId)
    },
  })

  const availableQuery = useQuery<TaskChannelAvailableComponent[]>({
    queryKey: ['taskAvailableComponents', taskId, selectedChannelId, effectiveBriefingTypeId ?? null],
    enabled: !!selectedChannelId && !!effectiveBriefingTypeId && !isNoBriefing,
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      if (!selectedChannelId) throw new Error('No channel selected')
      const { data, error } = await supabase.rpc('tc_available_components_for_task_channel', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
      })
      if (error) throw error
      // Normalize payloads (some RPC versions may return `id` instead of `task_component_id`)
      return ((data || []) as any[]).map((row) => ({
        ...row,
        task_component_id: row.task_component_id ?? row.id ?? null,
      })) as TaskChannelAvailableComponent[]
    },
  })

  const refreshComponents = useCallback(
    async (channelIdOverride?: number) => {
      const channelId = channelIdOverride ?? selectedChannelId
      if (!channelId) return
      await queryClient.invalidateQueries({ queryKey: ['taskComponents', taskId, channelId] })
    },
    [queryClient, taskId, selectedChannelId]
  )

  const refreshAvailableComponents = useCallback(
    async (channelIdOverride?: number) => {
      const channelId = channelIdOverride ?? selectedChannelId
      if (!channelId) return
      await queryClient.invalidateQueries({ queryKey: ['taskAvailableComponents', taskId, channelId] })
    },
    [queryClient, taskId, selectedChannelId]
  )

  const refreshAllComponentLists = useCallback(
    async (channelIdOverride?: number) => {
      await Promise.all([refreshComponents(channelIdOverride), refreshAvailableComponents(channelIdOverride)])
    },
    [refreshComponents, refreshAvailableComponents]
  )

  useEffect(() => {
    if (!componentsQuery.data) return

    setComponents(componentsQuery.data.activeComponents)
    // no longer derived from tc_components_for_task_channel
    setRemovedComponents([])
    setAvailableTemplates([])

    setComponentOutputs((prev) => {
      const next = new Map(prev)
      for (const [key, value] of Object.entries(componentsQuery.data.outputsByBriefingId)) {
        const id = Number(key)
        const local = outputValuesRef.current.get(id)
        next.set(id, {
          content_text: typeof local === 'string' ? local : value.content_text,
          updated_at: value.updated_at,
        })
      }
      return next
    })
  }, [componentsQuery.data])
  
  // Fetch component output
  const fetchComponentOutput = useCallback(async (componentId: number) => {
    if (!selectedChannelId) return

    // ✅ guard with ref (stable, not tied to state updates)
    if (loadingOutputsRef.current.has(componentId)) return
    loadingOutputsRef.current.add(componentId)

    // still keep state for UI spinner
    setLoadingOutputs(prev => new Set(prev).add(componentId))

    try {
      const { data, error } = await supabase
        .from('task_component_outputs')
        .select('content_text, updated_at')
        .eq('task_id', taskId)
        .eq('channel_id', selectedChannelId)
        .eq('briefing_component_id', componentId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        setComponentOutputs(prev => {
          const newMap = new Map(prev)
          newMap.set(componentId, data)
          return newMap
        })
      }
    } catch (err: any) {
      console.error('Failed to fetch component output:', err)
    } finally {
      loadingOutputsRef.current.delete(componentId)
      setLoadingOutputs(prev => {
        const newSet = new Set(prev)
        newSet.delete(componentId)
        return newSet
      })
    }
  }, [supabase, taskId, selectedChannelId])
  
  // Fetch SEO data
  const fetchSEO = useCallback(async () => {
      if (!selectedChannelId) {
      setSeoData(null)
      setVariantSEOData(null)
      return
    }
    
    try {
      // Fetch effective SEO flags (view only has seo_required and seo_source)
      const { data, error } = await supabase
        .from('v_task_channel_effective_seo')
        .select('seo_required, seo_source')
        .eq('task_id', taskId)
        .eq('channel_id', selectedChannelId)
        .maybeSingle()
      
      if (error && error.code !== 'PGRST116') throw error
      
      // Always fetch task_channel_seo for keywords and override (might not exist yet)
      const { data: seoOverrideData, error: seoError } = await supabase
        .from('task_channel_seo')
        .select('primary_keyword, secondary_keywords, seo_required_override')
        .eq('task_id', taskId)
        .eq('channel_id', selectedChannelId)
        .maybeSingle()
      
      // Merge the data for display
      const effectiveSeo = data || { seo_required: false, seo_source: null }
      const channelSeo = seoOverrideData || { primary_keyword: null, secondary_keywords: null, seo_required_override: null }
      
      // Set effective SEO data (even if null, we'll show the panel)
      setSeoData({
        seo_required: effectiveSeo.seo_required || false,
        seo_source: effectiveSeo.seo_source || null,
        primary_keyword: channelSeo.primary_keyword || null,
        secondary_keywords: channelSeo.secondary_keywords || []
      })
      
      // Build CTTVariantSEO-compatible object for SEOPanel
      
      const variantSEO: CTTVariantSEO = {
        ctt_id: '', // Not applicable for task channels
        channel_id: selectedChannelId,
        language_id: languageId || 0, // Use task's language_id
        primary_keyword: channelSeo.primary_keyword ?? null,
        secondary_keywords: channelSeo.secondary_keywords ?? null,
        seo_required_override: channelSeo.seo_required_override ?? null,
        updated_at: null, // We can add this if needed
        seo_required: effectiveSeo.seo_required || false,
        seo_source: effectiveSeo.seo_source || null
      }
      
      setVariantSEOData(variantSEO)
    } catch (err: any) {
      console.error('Failed to fetch SEO:', err)
      // On error, still show the panel but with defaults
      setSeoData({ 
        seo_required: false, 
        seo_source: null,
        primary_keyword: null,
        secondary_keywords: []
      })
      setVariantSEOData({
        ctt_id: '',
        channel_id: selectedChannelId,
        language_id: languageId || 0,
        primary_keyword: null,
        secondary_keywords: null,
        seo_required_override: null,
        updated_at: null,
        seo_required: false,
        seo_source: null
      })
    }
  }, [supabase, taskId, selectedChannelId])
  
  // Add channel
  const handleAddChannel = async (channelId: number) => {
    const previousChannels = channels
    const previousAvailableChannels = availableChannels
    const previousSelectedChannelId = selectedChannelId

    try {
      const channelMeta = availableChannels.find((c) => c.channel_id === channelId) ?? null

      // Optimistic UI: add channel pill immediately
      if (channelMeta) {
        setChannels((prev) => {
          if (prev.some((c) => c.channel_id === channelId)) return prev
          return [...prev, channelMeta].sort((a, b) => a.name.localeCompare(b.name))
        })
        setAvailableChannels((prev) => prev.filter((c) => c.channel_id !== channelId))
      }

      // Insert into task_channels
      const { error: insertError } = await supabase
        .from('task_channels')
        .insert({
          task_id: taskId,
          channel_id: channelId
        })
      
      if (insertError) throw insertError

      // Select the newly added channel
      setSelectedChannelId(channelId)
      onChannelChange?.(channelId)
      
      // Ensure default briefing type components load immediately (no user toggle required)
      if (projectId && contentTypeId) {
        const { data, error } = await supabase.rpc('project_channel_briefing_types', {
          p_project_id: projectId,
          p_content_type_id: contentTypeId,
          p_channel_id: channelId
        })

        if (!error) {
          let effectiveId: number | null = null
          ;(data || []).forEach((row: any) => {
            if (row.effective_default_briefing_type_id && typeof row.effective_default_briefing_type_id === 'number') {
              effectiveId = row.effective_default_briefing_type_id
            }
          })

          if (effectiveId) {
            await supabase.rpc('tc_set_briefing_mode', {
              p_task_id: taskId,
              p_channel_id: channelId,
              p_briefing_type_id: effectiveId,
              p_disable_briefing: false
            })
            setSelectedBriefingTypeId(effectiveId)
            setIsNoBriefing(false)
          }
        }
      }

      fetchAvailableChannels()
      await refreshComponents(channelId)
      
      toast({
        title: 'Channel added',
        description: 'Channel has been added and briefing initialized.'
      })
    } catch (err: any) {
      // Roll back optimistic UI
      setChannels(previousChannels)
      setAvailableChannels(previousAvailableChannels)
      setSelectedChannelId(previousSelectedChannelId)
      onChannelChange?.(previousSelectedChannelId)

      console.error('Failed to add channel:', err)
      toast({
        title: 'Failed to add channel',
        description: err.message,
        variant: 'destructive'
      })
    }
  }
  
  // Remove channel
  const handleRemoveChannel = async (channelId: number) => {
    const previousChannels = channels
    const previousSelectedChannelId = selectedChannelId

    try {
      setRemovingChannelIds((prev) => new Set(prev).add(channelId))

      const remainingChannels = channels.filter((c) => c.channel_id !== channelId)
      const nextActiveChannelId =
        selectedChannelId === channelId ? (remainingChannels[0]?.channel_id ?? null) : selectedChannelId

      // Optimistic UI: update channel pills immediately
      setChannels(remainingChannels)
      if (selectedChannelId === channelId) {
        setSelectedChannelId(nextActiveChannelId)
        onChannelChange?.(nextActiveChannelId)
      }

      const { error } = await supabase
        .from('task_channels')
        .delete()
        .eq('task_id', taskId)
        .eq('channel_id', channelId)
      
      if (error) throw error

      fetchAvailableChannels()
      
      toast({
        title: 'Channel removed',
        description: 'Channel has been removed.'
      })
    } catch (err: any) {
      // Roll back optimistic UI
      setChannels(previousChannels)
      setSelectedChannelId(previousSelectedChannelId)
      onChannelChange?.(previousSelectedChannelId)

      console.error('Failed to remove channel:', err)
      toast({
        title: 'Failed to remove channel',
        description: err.message,
        variant: 'destructive'
      })
    } finally {
      setRemovingChannelIds((prev) => {
        const next = new Set(prev)
        next.delete(channelId)
        return next
      })
    }
  }
  
  // Handle briefing type change
  const handleBriefingTypeChange = async (briefingTypeId: number | null) => {
    if (!selectedChannelId) return
    
    try {
      // Call tc_set_briefing_mode RPC with disable_briefing: false
      const { error } = await supabase.rpc('tc_set_briefing_mode', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_briefing_type_id: briefingTypeId,
        p_disable_briefing: false
      })
      
      if (error) throw error
      
      setSelectedBriefingTypeId(briefingTypeId)
      setIsNoBriefing(false)
      
      // Re-fetch components (scoped query) to pick up the new briefing template
      await refreshComponents()
      
      toast({
        title: 'Briefing type updated',
        description: 'Components have been refreshed from the new briefing template.'
      })
    } catch (err: any) {
      console.error('Failed to update briefing type:', err)
      toast({
        title: 'Failed to update briefing type',
        description: err.message,
        variant: 'destructive'
      })
    }
  }
  
  // Handle clearing briefing (set to "No briefing" mode)
  const handleClearBriefing = async () => {
    if (!selectedChannelId) return
    
    try {
      // Call tc_set_briefing_mode RPC with disable_briefing: true
      const { error } = await supabase.rpc('tc_set_briefing_mode', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_briefing_type_id: null,
        p_disable_briefing: true
      })
      
      if (error) throw error
      
      // Update local state to show Main content immediately
      setSelectedBriefingTypeId(null)
      setIsNoBriefing(true)
      
      // Clear the mainLoadedRef for this channel so it can be loaded
      mainLoadedRef.current.delete(selectedChannelId)
      
      // Load main content (component 80)
      await fetchComponentOutput(MAIN_BRIEFING_COMPONENT_ID)
      
      toast({
        title: 'Briefing cleared',
        description: 'Main content editor is now active.'
      })
    } catch (err: any) {
      console.error('Failed to clear briefing:', err)
      toast({
        title: 'Failed to clear briefing',
        description: err.message,
        variant: 'destructive'
      })
    }
  }
  
  // Toggle component selection
  const handleToggleComponent = async (
    row: TaskChannelComponent,
    checked: boolean
  ) => {
    if (!selectedChannelId) return
    
    // Store previous state for rollback
    const previousComponents = [...components]
    
    if (!row.task_component_id) {
      toast({
        title: 'Cannot update component',
        description: 'This component is missing a task row.',
        variant: 'destructive',
      })
      return
    }

    // Optimistic: if removing from main list, remove immediately
    if (!checked) {
      setComponents((prev) => prev.filter((c) => c.task_component_id !== row.task_component_id))
    }
    
    try {
      const { error } = await supabase
        .from('task_channel_components')
        .update({ selected: checked })
        .eq('task_id', taskId)
        .eq('channel_id', selectedChannelId)
        .eq('id', row.task_component_id)
      
      if (error) throw error
      
      // Re-fetch BOTH RPCs (main list + available list)
      await refreshAllComponentLists()
      
      // If selected, fetch output if it hasn't been loaded yet
      const componentIdForOutput = row.briefing_component_id || row.project_component_id
      if (checked && componentIdForOutput && !componentOutputs.has(componentIdForOutput) && !loadingOutputs.has(componentIdForOutput)) {
        await fetchComponentOutput(componentIdForOutput)
      }
    } catch (err: any) {
      console.error('Failed to toggle component:', err)
      
      // Rollback optimistic update on error
      setComponents(previousComponents)
      
      toast({
        title: 'Failed to update component',
        description: err.message,
        variant: 'destructive'
      })
    }
  }
  
  const [addingAvailableKeys, setAddingAvailableKeys] = useState<Set<string>>(new Set())

  const handleAddAvailableComponent = async (item: TaskChannelAvailableComponent) => {
    if (!selectedChannelId) return

    try {
      setAddingAvailableKeys((prev) => new Set(prev).add(item.key))

      if (item.tag === 'Removed from task') {
        // Prefer updating by task row UUID (table PK is `id`)
        if (item.task_component_id) {
          const { error } = await supabase
            .from('task_channel_components')
            .update({ selected: true })
            .eq('task_id', taskId)
            .eq('channel_id', selectedChannelId)
            .eq('id', item.task_component_id)

          if (error) throw error
        } else {
          // Fallback: update by the unique key columns (RPC sometimes omits the task row UUID)
          const q = supabase
            .from('task_channel_components')
            .update({ selected: true })
            .eq('task_id', taskId)
            .eq('channel_id', selectedChannelId)

          if (item.is_project_component && typeof item.project_component_id !== 'number') {
            throw new Error('Missing project_component_id for removed item')
          }
          if (!item.is_project_component && typeof item.briefing_component_id !== 'number') {
            throw new Error('Missing briefing_component_id for removed item')
          }

          const { error } = item.is_project_component
            ? await q.eq('project_component_id', item.project_component_id as number)
            : await q.eq('briefing_component_id', item.briefing_component_id as number)

          if (error) throw error
        }
      } else {
        const insertPayload: any = {
          task_id: taskId,
          channel_id: selectedChannelId,
          selected: true,
          custom_title: item.custom_title ?? item.title ?? null,
          custom_description: item.custom_description ?? item.description ?? null,
        }

        if (item.is_project_component) {
          insertPayload.project_component_id = item.project_component_id
        } else {
          insertPayload.briefing_component_id = item.briefing_component_id
        }

        const { error } = await supabase.from('task_channel_components').insert(insertPayload)
        if (error) throw error
      }

      await refreshAllComponentLists()
    } catch (err: any) {
      console.error('Failed to add component:', err)
      
      toast({
        title: 'Failed to add component',
        description: err.message,
        variant: 'destructive'
      })
      
      // Re-fetch to ensure consistent state
      await refreshAllComponentLists()
    } finally {
      setAddingAvailableKeys((prev) => {
        const next = new Set(prev)
        next.delete(item.key)
        return next
      })
    }
  }
  
  // Edit component custom fields
  const handleEditComponentCustom = async (
    taskComponentId: string | null,
    briefingComponentId: number | null,
    projectComponentId: number | null,
    title: string, 
    description: string,
    componentScope?: ComponentScope
  ) => {
    if (!selectedChannelId) {
      console.warn('Cannot edit component: no channel selected')
      return
    }
    
    if (!taskComponentId) {
      console.warn('Cannot edit component: no task_component_id', {
        briefingComponentId,
        projectComponentId,
        title
      })
      toast({
        title: 'Cannot edit component',
        description: 'This component is not yet added to the task. Toggle it on first.',
        variant: 'destructive'
      })
      return
    }
    
    try {
      // If it's a template-backed component, we edit the task-level custom fields only
      // Template edits are handled separately via handleEditInTemplate
      const { error } = await supabase.rpc('tcc_set_component', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_task_component_id: taskComponentId,
        p_briefing_component_id: briefingComponentId,
        p_project_component_id: projectComponentId,
        p_selected: true, // Keep it selected
        p_custom_title: title || null,
        p_custom_description: description || null,
        p_position: null // Keep existing position
      })
      
      if (error) throw error
      
      // Re-fetch to get updated state
      await refreshComponents()
    } catch (err: any) {
      console.error('Failed to update component custom fields:', err)
      toast({
        title: 'Failed to update component',
        description: err.message,
        variant: 'destructive'
      })
    }
  }
  
  // Edit component in template (project or channel scope)
  const handleEditInTemplate = async (
    componentBriefingId: number,
    title: string,
    description: string,
    componentScope: ComponentScope,
    projectComponentId?: number | null
  ) => {
    if (!projectId || !selectedChannelId || !selectedBriefingTypeId) return
    
    try {
      if (componentScope === 'project') {
        // Edit in project briefing template
        const { error } = await supabase.rpc('pbtc_update', {
          p_project_id: projectId,
          p_briefing_type_id: selectedBriefingTypeId,
          p_component_id: projectComponentId || Math.abs(componentBriefingId),
          p_title: title || null,
          p_description: description || null
        })
        
        if (error) throw error
      } else if (componentScope === 'channel' && contentTypeId) {
        // Edit in channel-specific template
        const { error } = await supabase.rpc('pcctbc_update', {
          p_project_id: projectId,
          p_content_type_id: contentTypeId,
          p_channel_id: selectedChannelId,
          p_component_id: projectComponentId || Math.abs(componentBriefingId),
          p_is_project_component: projectComponentId ? true : false,
          p_title: title || null,
          p_description: description || null
        })
        
        if (error) throw error
      }
      
      // Refresh components to get updated template values
      await refreshComponents()
      
      toast({
        title: 'Template updated',
        description: 'Component template has been updated.'
      })
    } catch (err: any) {
      console.error('Failed to update template:', err)
      toast({
        title: 'Failed to update template',
        description: err.message,
        variant: 'destructive'
      })
    }
  }
  
  // Remove component from template
  const handleRemoveFromTemplate = async (
    componentBriefingId: number,
    componentScope: ComponentScope,
    projectComponentId?: number | null,
    keepInTask: boolean = true
  ) => {
    if (!projectId || !selectedChannelId || !selectedBriefingTypeId) return
    
    try {
      if (componentScope === 'project') {
        const { error } = await supabase.rpc('pbtc_remove', {
          p_project_id: projectId,
          p_briefing_type_id: selectedBriefingTypeId,
          p_component_id: projectComponentId || Math.abs(componentBriefingId)
        })
        
        if (error) throw error
      } else if (componentScope === 'channel' && contentTypeId) {
        const { error } = await supabase.rpc('pcctbc_remove', {
          p_project_id: projectId,
          p_content_type_id: contentTypeId,
          p_channel_id: selectedChannelId,
          p_component_id: projectComponentId || Math.abs(componentBriefingId),
          p_is_project_component: projectComponentId ? true : false
        })
        
        if (error) throw error
      }
      
      // If not keeping in task, remove from task as well
      if (!keepInTask) {
        const allTaskComponents = [...components, ...removedComponents]
        const taskRow = allTaskComponents.find((c) => {
          if (typeof projectComponentId === 'number') return c.project_component_id === projectComponentId
          return c.briefing_component_id === componentBriefingId
        })

        const { error: removeErr } = await supabase.rpc('tcc_set_component', {
          p_task_id: taskId,
          p_channel_id: selectedChannelId,
          p_task_component_id: taskRow?.task_component_id ?? null,
          p_briefing_component_id: typeof projectComponentId === 'number' ? null : componentBriefingId,
          p_project_component_id:
            typeof projectComponentId === 'number'
              ? projectComponentId
              : componentScope === 'project'
                ? componentBriefingId
                : null,
          p_selected: false,
          p_custom_title: taskRow?.custom_title || taskRow?.title || null,
          p_custom_description: taskRow?.custom_description || taskRow?.description || null,
          p_position: taskRow?.position ?? null,
        })
        
        if (removeErr) {
          console.warn('Failed to remove from task:', removeErr)
        }
      }
      
      // Refresh components
      await refreshComponents()
      
      toast({
        title: 'Removed from template',
        description: keepInTask ? 'Component removed from template but kept in this task.' : 'Component removed from template and task.'
      })
    } catch (err: any) {
      console.error('Failed to remove from template:', err)
      toast({
        title: 'Failed to remove from template',
        description: err.message,
        variant: 'destructive'
      })
    }
  }
  
  // Reorder components
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    
    if (!over || active.id === over.id || !selectedChannelId) return
    
    // IDs are either task_component_id (UUID) or temp-{id}
    const activeId = String(active.id)
    const overId = String(over.id)
    
    // Find components by matching the sortable ID
    const oldIndex = components.findIndex(c => {
      const sortableId = c.task_component_id || `temp-${c.briefing_component_id || c.project_component_id}`
      return sortableId === activeId
    })
    const newIndex = components.findIndex(c => {
      const sortableId = c.task_component_id || `temp-${c.briefing_component_id || c.project_component_id}`
      return sortableId === overId
    })
    
    if (oldIndex === -1 || newIndex === -1) {
      console.warn('Could not find components for drag and drop', { activeId, overId, oldIndex, newIndex })
      return
    }
    
    // Optimistically update UI
    const newComponents = arrayMove(components, oldIndex, newIndex)
    setComponents(newComponents)
    
    // Build order array - use task_component_id for the RPC call
    const order = newComponents
      .filter(c => c.task_component_id) // Only include components that are in task_channel_components
      .map((c, idx) => ({
        task_component_id: c.task_component_id,
        position: idx
      }))
    
    if (order.length === 0) {
      console.warn('No components with task_component_id to reorder')
      return
    }
    
    try {
      const { error } = await supabase.rpc('tcc_reorder', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_order: order
      })
      
      if (error) throw error
      
      toast({
        title: 'Components reordered',
        description: 'Component order has been updated'
      })
    } catch (err: any) {
      console.error('Failed to reorder components:', err)
      toast({
        title: 'Failed to reorder',
        description: err.message,
        variant: 'destructive'
      })
      // Revert on error
      await refreshComponents()
    }
  }
  
  // Update keywords handler for SEOPanel
  const handleUpdateKeywords = async (payload: { primaryKeyword: string; secondaryKeywords: string }) => {
    if (!selectedChannelId) return
    
    setIsUpdatingKeywords(true)
    try {
      const keywordsArray = payload.secondaryKeywords
        .split(',')
        .map(k => k.trim())
        .filter(Boolean)
      
      const { error } = await supabase.rpc('tc_upsert_seo', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_required_override: variantSEOData?.seo_required_override ?? null,
        p_primary_keyword: payload.primaryKeyword || null,
        p_secondary_keywords: keywordsArray.length > 0 ? keywordsArray : null
      })
      
      if (error) throw error
      
      await fetchSEO()
    } catch (err: any) {
      console.error('Failed to update keywords:', err)
      throw err
    } finally {
      setIsUpdatingKeywords(false)
    }
  }
  
  // Toggle SEO required handler for SEOPanel
  const handleToggleSEORequired = async (seoRequired: boolean) => {
    if (!selectedChannelId) return
    
    setIsTogglingSEO(true)
    try {
      const currentKeywords = variantSEOData?.secondary_keywords
      const keywordsArray = Array.isArray(currentKeywords)
        ? currentKeywords
        : (typeof currentKeywords === 'string' ? currentKeywords.split(',').map(k => k.trim()).filter(Boolean) : [])
      
      const { error } = await supabase.rpc('tc_upsert_seo', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_required_override: seoRequired,
        p_primary_keyword: variantSEOData?.primary_keyword || null,
        p_secondary_keywords: keywordsArray.length > 0 ? keywordsArray : null
      })
      
      if (error) throw error
      
      await fetchSEO()
    } catch (err: any) {
      console.error('Failed to toggle SEO required:', err)
      throw err
    } finally {
      setIsTogglingSEO(false)
    }
  }
  
  // Navigate to manage project briefings
  const handleManageTemplates = () => {
    if (!projectId) return
    router.push(`/projects/${projectId}`)
  }
  
  // Fetch task title and source_urls for AI context
  const fetchTaskTitle = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('title, source_urls')
        .eq('id', taskId)
        .single()
      
      if (error) throw error
      setTaskTitle(data?.title || '')
      // source_urls is an array, join with newlines for display
      setTaskSourceUrl(Array.isArray(data?.source_urls) ? data.source_urls.join('\n') : (data?.source_urls || ''))
    } catch (err: any) {
      console.error('Failed to fetch task data:', err)
    }
  }, [supabase, taskId])

  function sanitizeFilename(value: string) {
    return value
      .trim()
      .replaceAll(/[\/\\?%*:|"<>]/g, '-')
      .replaceAll(/\s+/g, ' ')
      .slice(0, 160)
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function extractText(el: Element): string {
    return (el.textContent || '').replaceAll('\u00A0', ' ').trim()
  }

  function htmlToDocxParagraphs(
    html: string,
    docx: {
      Paragraph: any
      TextRun: any
      HeadingLevel: any
    }
  ) {
    const { Paragraph, TextRun, HeadingLevel } = docx
    const paragraphs: any[] = []
    if (!html || !html.trim()) return paragraphs

    const parser = new DOMParser()
    const parsed = parser.parseFromString(`<div>${html}</div>`, 'text/html')
    const container = parsed.body.firstElementChild ?? parsed.body

    const pushHeading = (level: any, text: string) => {
      const t = text.trim()
      if (!t) return
      paragraphs.push(new Paragraph({ text: t, heading: level }))
    }

    const createInlineRuns = (node: Node, active: { bold?: boolean; italics?: boolean }): any[] => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.textContent || '').replaceAll('\u00A0', ' ')
        // Ignore whitespace-only text nodes (often introduced by HTML formatting)
        if (!text.trim()) return []
        return [new TextRun({ text, bold: !!active.bold, italics: !!active.italics })]
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return []

      const el = node as Element
      const tag = el.tagName.toLowerCase()
      if (tag === 'br') {
        return [new TextRun({ text: '', break: 1 })]
      }

      const nextActive = { ...active }
      if (tag === 'strong' || tag === 'b') nextActive.bold = true
      if (tag === 'em' || tag === 'i') nextActive.italics = true

      const runs: any[] = []
      el.childNodes.forEach((child) => {
        runs.push(...createInlineRuns(child, nextActive))
      })
      return runs
    }

    const pushParagraphFromElement = (el: Element, listPrefix?: string) => {
      const runs: any[] = []
      if (listPrefix) runs.push(new TextRun({ text: listPrefix }))
      el.childNodes.forEach((child) => {
        runs.push(...createInlineRuns(child, {}))
      })

      // Preserve blank lines (e.g. <p><br></p>) as empty paragraphs
      if (runs.length === 0) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: '' })] }))
        return
      }

      paragraphs.push(new Paragraph({ children: runs }))
    }

    const isBlock = (el: Element) => {
      const tag = el.tagName.toLowerCase()
      return tag === 'p' || tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'ul' || tag === 'ol'
    }

    const isBlockishDivParagraph = (el: Element) => {
      const tag = el.tagName.toLowerCase()
      if (tag !== 'div') return false
      // If it contains other block elements, let traversal reach those instead.
      if (el.querySelector('p,h1,h2,h3,h4,ul,ol')) return false
      // Treat a plain div with meaningful text as a paragraph.
      return !!extractText(el)
    }

    // Collect block elements in document order (including nested ones)
    const blocks: Element[] = []
    const walk = (node: Node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return
      const el = node as Element
      if (isBlock(el)) {
        blocks.push(el)
        return
      }
      if (isBlockishDivParagraph(el)) {
        blocks.push(el)
        return
      }
      el.childNodes.forEach(walk)
    }
    container.childNodes.forEach(walk)

    for (const el of blocks) {
      const tag = el.tagName.toLowerCase()

      if (tag === 'h3') {
        pushHeading(HeadingLevel.HEADING_3, extractText(el))
        continue
      }
      if (tag === 'h4') {
        pushHeading(HeadingLevel.HEADING_4, extractText(el))
        continue
      }

      // If pasted output includes h1/h2, downgrade so we keep Task title (H1) and Component title (H2)
      if (tag === 'h1' || tag === 'h2') {
        pushHeading(HeadingLevel.HEADING_3, extractText(el))
        continue
      }

      if (tag === 'p') {
        pushParagraphFromElement(el)
        continue
      }
      if (tag === 'div') {
        pushParagraphFromElement(el)
        continue
      }

      if (tag === 'ul' || tag === 'ol') {
        const items = Array.from(el.querySelectorAll(':scope > li'))
        items.forEach((li, idx) => {
          const prefix = tag === 'ol' ? `${idx + 1}. ` : '- '
          // Prefer paragraph children if present; otherwise use li itself
          const liParagraphs = Array.from(li.querySelectorAll(':scope > p'))
          if (liParagraphs.length > 0) {
            liParagraphs.forEach((p) => pushParagraphFromElement(p, prefix))
          } else {
            pushParagraphFromElement(li, prefix)
          }
        })
        continue
      }
    }

    return paragraphs
  }

  const handleExportComponentsToWord = useCallback(async () => {
    if (isExporting) return
    if (!taskId) return

    setIsExporting(true)
    try {
      const channelsToExport = channels
      if (channelsToExport.length === 0) {
        toast({ title: 'Nothing to export', description: 'This task has no channels.' })
        return
      }

      const exportedChannels = await Promise.all(
        channelsToExport.map(async (channel) => {
          // 1) Fetch selected components (preserve current order)
          const { data: compsData, error: compsError } = await supabase.rpc('tc_components_for_task_channel', {
            p_task_id: taskId,
            p_channel_id: channel.channel_id,
          })
          if (compsError) throw compsError

          const rows = (compsData || []).map((row: any) => ({
            task_component_id: row.task_component_id || null,
            briefing_component_id: row.briefing_component_id || null,
            title: row.title || '',
            custom_title: row.custom_title || null,
            selected: !!row.selected,
            position: row.position ?? null,
          })) as Array<Pick<TaskChannelComponent, 'task_component_id' | 'briefing_component_id' | 'title' | 'custom_title' | 'selected' | 'position'>>

          const selected = rows
            .filter((r) => r.task_component_id !== null && r.selected)
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

          const briefingIds = Array.from(
            new Set(selected.map((r) => r.briefing_component_id).filter((id): id is number => typeof id === 'number'))
          )

          // 2) Fetch outputs for selected components
          const outputsById = new Map<number, string>()
          if (briefingIds.length > 0) {
            const { data: outData, error: outError } = await supabase
              .from('task_component_outputs')
              .select('briefing_component_id, content_text')
              .eq('task_id', taskId)
              .eq('channel_id', channel.channel_id)
              .in('briefing_component_id', briefingIds)
            if (outError) throw outError
            for (const row of outData || []) {
              if (typeof (row as any).briefing_component_id === 'number') {
                outputsById.set((row as any).briefing_component_id, ((row as any).content_text as string | null) || '')
              }
            }
          }

          // 3) If no selected components, fallback to "Main content" (component 80) if it has any content
          if (selected.length === 0) {
            const { data: mainData, error: mainError } = await supabase
              .from('task_component_outputs')
              .select('content_text')
              .eq('task_id', taskId)
              .eq('channel_id', channel.channel_id)
              .eq('briefing_component_id', MAIN_BRIEFING_COMPONENT_ID)
              .maybeSingle()
            if (mainError && mainError.code !== 'PGRST116') throw mainError
            const mainText = (mainData?.content_text as string | null) || ''
            return {
              channelName: channel.name,
              components: mainText.trim()
                ? [
                    {
                      title: 'Main content',
                      outputHtml: mainText,
                    },
                  ]
                : [],
            }
          }

          return {
            channelName: channel.name,
            components: selected.map((c) => ({
              title: (c.custom_title && String(c.custom_title).trim()) ? String(c.custom_title) : c.title,
              outputHtml: typeof c.briefing_component_id === 'number' ? outputsById.get(c.briefing_component_id) || '' : '',
            })),
          }
        })
      )

      // Remove channels that have no exported components/content
      const nonEmpty = exportedChannels.filter((c) => c.components.length > 0)
      if (nonEmpty.length === 0) {
        toast({ title: 'Nothing to export', description: 'No component outputs found across channels.' })
        return
      }

      const safeTaskTitle = taskTitle?.trim() || `Task ${taskId}`

      // Lazy-load docx only when exporting
      const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import('docx')

      const children: any[] = []
      children.push(new Paragraph({ text: safeTaskTitle, heading: HeadingLevel.HEADING_1 }))

      for (const ch of nonEmpty) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: ch.channelName, bold: true })],
            spacing: { before: 240, after: 80 },
          })
        )

        for (const cmp of ch.components) {
          children.push(new Paragraph({ text: cmp.title || 'Untitled Component', heading: HeadingLevel.HEADING_2 }))
          children.push(...htmlToDocxParagraphs(cmp.outputHtml || '', { Paragraph, TextRun, HeadingLevel }))
        }
      }

      const doc = new Document({
        sections: [{ properties: {}, children }],
      })

      const blob = await Packer.toBlob(doc)
      const filename = `${sanitizeFilename(safeTaskTitle)} - components.docx`
      downloadBlob(blob, filename)
      toast({ title: 'Exported', description: 'Word document downloaded.' })
    } catch (err: any) {
      console.error('Failed to export components:', err)
      toast({
        title: 'Export failed',
        description: err?.message || 'An error occurred while exporting.',
        variant: 'destructive',
      })
    } finally {
      setIsExporting(false)
    }
  }, [channels, isExporting, supabase, taskId, taskTitle])
  
  // Fetch AI threads for this task
  const fetchAiThreads = useCallback(async () => {
    if (!taskId) return
    
    setIsLoadingThreads(true)
    try {
      const { data, error } = await supabase
        .from('ai_threads')
        .select('id, title, last_message_at, created_at')
        .eq('task_id', taskId)
        .eq('scope', 'task')
        .eq('is_deleted', false)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(10)
      
      if (error) throw error
      setAiThreads(data || [])
    } catch (err: any) {
      console.error('Failed to fetch AI threads:', err)
    } finally {
      setIsLoadingThreads(false)
    }
  }, [supabase, taskId])
  
  // Add a single component to the task from structure review
  const handleApplyComponent = useCallback(async (component: ReviewedComponent) => {
    if (!selectedChannelId) {
      throw new Error('Please select a channel first')
    }
    
    try {
      // Use the existing tcc_add_ad_hoc_component RPC to add the component
      const { data: componentId, error: addErr } = await supabase.rpc('tcc_add_ad_hoc_component', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_title: component.title,
        p_description: component.description,
        p_position: null
      })
      
      if (addErr) throw addErr
      
      if (!componentId) throw new Error('Failed to create component')
      
      // If there's output content, save it to task_component_outputs
      if (component.output && component.output.trim()) {
        const { error: outputErr } = await supabase
          .from('task_component_outputs')
          .upsert({
            task_id: taskId,
            channel_id: selectedChannelId,
            briefing_component_id: componentId,
            content_text: component.output,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'task_id,channel_id,briefing_component_id'
          })
        
        if (outputErr) {
          console.warn('Failed to save component output:', outputErr)
          // Continue - component is created, just output didn't save
        }
      }
      
      // Refresh components list
      await refreshComponents()
      
    } catch (err: any) {
      console.error('Failed to add component to task:', err)
      throw err
    }
  }, [supabase, taskId, selectedChannelId, refreshComponents])
  
  // Add all selected components to the task
  const handleApplyAllComponents = useCallback(async (components: ReviewedComponent[]) => {
    if (!selectedChannelId) {
      throw new Error('Please select a channel first')
    }
    
    let successCount = 0
    const errors: string[] = []
    
    for (const component of components) {
      try {
        await handleApplyComponent(component)
        successCount++
      } catch (err: any) {
        errors.push(`${component.title}: ${err.message}`)
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Added ${successCount}/${components.length} components. Errors: ${errors.join('; ')}`)
    }
  }, [handleApplyComponent, selectedChannelId])
  
  // Open an existing AI thread
  const handleOpenThread = useCallback((threadId: string) => {
    const newParams = new URLSearchParams(searchParams.toString())
    // Ensure middle pane is visible when opening AI build
    const layoutRaw = newParams.get('layout')
    const layoutParts = (layoutRaw ? layoutRaw.split(',').filter(Boolean) : ['left', 'middle', 'right'])
    if (!layoutParts.includes('middle')) layoutParts.splice(1, 0, 'middle')
    newParams.set('layout', layoutParts.join(','))
    newParams.delete('focus')
    newParams.set('middleView', 'ai-build')
    newParams.set('aiThreadId', threadId)
    router.push(`${pathname}?${newParams.toString()}`, { scroll: false })
  }, [searchParams, pathname, router])
  
  // AI build for component-level generation (NEW SPEC: pre-fill input, don't call immediately)
  const handleBuildWithAI = useCallback(async (componentId?: number | string) => {
    if (!selectedChannelId) {
      toast({
        title: 'Missing information',
        description: 'Please ensure a channel is selected',
        variant: 'destructive'
      })
      return
    }
    
    try {
      // Step 1: Create or reuse thread first (per spec)
      const { ensureAiThread } = await import('../../../features/ai-chat/ai-utils')
      const threadId = await ensureAiThread({ taskId, channelId: selectedChannelId })
      
      // Step 2: Build pre-fill message template
      let preFillMessage = ''
      let mode: "build_component" | "build_briefing" | null = null
      let taskChannelComponentId: string | null = null
      
      if (componentId === 'main') {
        // Main content generation (no structured components)
        const taskName = taskTitle || `Task ${taskId}`
        const channelName = channels.find(c => c.channel_id === selectedChannelId)?.name || `Channel ${selectedChannelId}`
        const existing = componentOutputs.get(MAIN_BRIEFING_COMPONENT_ID)?.content_text || ''

        preFillMessage = `Build the **Main content** for task **${taskName}** (channel: **${channelName}**).

Output requirements:
- Use clear structure with headings and paragraphs.
- Keep it ready to paste into the Main content editor.

${existing?.trim() ? `Current draft (for context, improve it):\n${existing}` : ''}`

        mode = "build_briefing"
      } else if (componentId) {
        // Component-level generation
        const allComponents = [...components, ...removedComponents]
        let component =
          typeof componentId === 'string'
            ? allComponents.find(c => c.task_component_id === componentId)
            : allComponents.find(c => (c.briefing_component_id || c.project_component_id) === componentId)
        
        if (!component) {
          throw new Error('Component not found')
        }
        
        // If component doesn't have a task_component_id yet, add it to the task first
        if (!component.task_component_id) {
          if (typeof componentId === 'string') {
            throw new Error('Component is missing an internal task id. Please refresh and try again.')
          }
          const { error } = await supabase.rpc('tcc_set_component', {
            p_task_id: taskId,
            p_channel_id: selectedChannelId,
            p_task_component_id: null,
            p_briefing_component_id: component.briefing_component_id ?? null,
            p_project_component_id: component.project_component_id ?? null,
            p_selected: true,
            p_custom_title: component.custom_title || component.title,
            p_custom_description: component.custom_description || component.description,
            p_position: component.position
          })
          
          if (error) throw new Error(`Failed to add component to task: ${error.message}`)
          
          // Fetch the updated component
          const { data: updatedComponents, error: fetchError } = await supabase.rpc('tc_components_for_task_channel', {
            p_task_id: taskId,
            p_channel_id: selectedChannelId
          })
          
          if (fetchError) throw new Error(`Failed to fetch updated component: ${fetchError.message}`)
          
          const updatedComponent = (updatedComponents || []).find((c: any) => 
            (c.briefing_component_id || c.project_component_id) === componentId
          )
          
          if (!updatedComponent?.task_component_id) {
            throw new Error('Failed to add component to task. Please try again.')
          }
          
          component = updatedComponent
          refreshComponents()
        }
        
        // Build pre-fill message for component (per spec)
        if (!component) {
          throw new Error('Component not found')
        }
        const taskName = taskTitle || `Task ${taskId}`
        const componentTitle = component.custom_title || component.title
        const componentDescription = component.custom_description || component.description || ''
        
        preFillMessage = `Build the component **${componentTitle}** for task **${taskName}**.

Instructions:
${componentDescription}`
        
        mode = "build_component"
        taskChannelComponentId = component.task_component_id
      } else {
        // Full briefing generation
        const selectedComponents = components.filter(c => c.selected)
        
        if (selectedComponents.length === 0) {
          throw new Error('No components selected')
        }
        
        const taskName = taskTitle || `Task ${taskId}`
        const componentList = selectedComponents
          .sort((a, b) => (a.position || 999) - (b.position || 999))
          .map((c, idx) => {
            const title = c.custom_title || c.title
            const desc = c.custom_description || c.description || ''
            return `${idx + 1}. **${title}** --- ${desc}`
          })
          .join('\n')
        
        preFillMessage = `Build a full briefing for task **${taskName}** using structure:

${componentList}`
        
        mode = "build_briefing"
      }
      
      // Step 3: Open AI chat pane with context (per spec)
      const newParams = new URLSearchParams(searchParams.toString())
      // Ensure middle pane is visible when opening AI build
      const layoutRaw = newParams.get('layout')
      const layoutParts = (layoutRaw ? layoutRaw.split(',').filter(Boolean) : ['left', 'middle', 'right'])
      if (!layoutParts.includes('middle')) layoutParts.splice(1, 0, 'middle')
      newParams.set('layout', layoutParts.join(','))
      newParams.delete('focus')
      newParams.set('middleView', 'ai-build')
      newParams.set('aiThreadId', threadId)
      newParams.set('chatMode', mode)
      if (taskChannelComponentId) {
        newParams.set('chatComponentId', taskChannelComponentId)
      }
      newParams.set('chatPreFill', encodeURIComponent(preFillMessage))
      newParams.set('activeChannelId', String(selectedChannelId))
      newParams.set('chatAutoRun', 'false') // Manual send - auto_run should be false
      router.push(`${pathname}?${newParams.toString()}`, { scroll: false })
      
      // Step 4: User will edit the message and click Send (per spec)
      // NO immediate AI call here
      
    } catch (err: any) {
      console.error('Failed to prepare AI chat:', err)
      toast({
        title: 'Failed to open AI chat',
        description: err.message || 'Failed to prepare chat',
        variant: 'destructive'
      })
    }
  }, [
    selectedChannelId,
    components,
    removedComponents,
    channels,
    componentOutputs,
    taskId,
    taskTitle,
    searchParams,
    pathname,
    router,
    supabase,
    refreshComponents
  ])
  
  // Initialize
  useEffect(() => {
    const init = async () => {
      setIsLoading(true)
      await Promise.all([
        fetchTaskChannels(),
        fetchTaskTitle()
      ])
      setIsLoading(false)
    }
    init()
  }, [taskId, fetchTaskChannels, fetchTaskTitle])
  
  // When selected channel changes, fetch related data
  useEffect(() => {
    if (!selectedChannelId) {
      setSelectedBriefingTypeId(null)
      setEffectiveDefaultBriefingTypeId(null)
      setIsNoBriefing(false)
      setBriefingTypeOptions([])
      setSeoData(null)
      setVariantSEOData(null)
      return
    }

    let cancelled = false

    // Clear mainLoadedRef for the new channel (only when channel changes, not on every rerun)
    mainLoadedRef.current.delete(selectedChannelId)

    const loadForChannel = async () => {
      setIsChannelMetaLoading(true)
      const [defaultId] = await Promise.all([
        fetchChannelBriefingTypes(),
        fetchSEO()
      ])
      if (cancelled) return

      const { briefingTypeId, disableBriefing } = await fetchBriefingType()
      if (cancelled) return

      // Handle three states:
      // A) Explicit briefing type -> show Components UI
      // B) Inherit default -> show Components UI with effective default selected in dropdown
      // C) No briefing -> show Main content editor (component 80)
      
      if (disableBriefing) {
        // State C: No briefing
        setSelectedBriefingTypeId(null)
        setIsNoBriefing(true)
        
        // Only call fetchComponentOutput(80) once per channel to prevent infinite loops
        if (!mainLoadedRef.current.has(selectedChannelId)) {
          mainLoadedRef.current.add(selectedChannelId)
          await fetchComponentOutput(MAIN_BRIEFING_COMPONENT_ID)
        }
        return
      } else if (briefingTypeId) {
        // State A: Explicit briefing type
        setSelectedBriefingTypeId(briefingTypeId)
        setIsNoBriefing(false)
        
        // Components query will load automatically (keepPreviousData preserves UI while fetching)
      } else {
        // State B: Inherit default
        // Keep selectedBriefingTypeId as null to indicate inheritance
        // The UI will use effectiveDefaultBriefingTypeId to show the default in dropdown
        setSelectedBriefingTypeId(null)
        setIsNoBriefing(false)
        
        // If no default exists, show Main content editor
        if (!defaultId) {
          if (!mainLoadedRef.current.has(selectedChannelId)) {
            mainLoadedRef.current.add(selectedChannelId)
            await fetchComponentOutput(MAIN_BRIEFING_COMPONENT_ID)
          }
        } else {
          // When a briefing type exists (inherited), components query will load automatically
        }
      }

      setIsChannelMetaLoading(false)
    }

    loadForChannel()

    return () => {
      cancelled = true
      setIsChannelMetaLoading(false)
    }
  }, [selectedChannelId, fetchChannelBriefingTypes, fetchBriefingType, fetchSEO, fetchComponentOutput])
  
  // Fetch available channels when project/contentType changes
  useEffect(() => {
    fetchAvailableChannels()
  }, [projectId, contentTypeId])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Channels Selector */}
      <div>
        <Label className="text-sm font-medium text-gray-900 mb-2 block">Channels</Label>
        <div className="flex flex-wrap gap-2 mb-2">
          {channels.map((channel) => (
            <Badge
              key={channel.channel_id}
              variant={selectedChannelId === channel.channel_id ? "default" : "outline"}
              className={`${removingChannelIds.has(channel.channel_id) ? "opacity-60 cursor-not-allowed" : "cursor-pointer"} h-9 px-3 py-0`}
              onClick={() => {
                if (removingChannelIds.has(channel.channel_id)) return
                setSelectedChannelId(channel.channel_id)
                onChannelChange?.(channel.channel_id)
              }}
            >
              {channel.name}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (removingChannelIds.has(channel.channel_id)) return
                  handleRemoveChannel(channel.channel_id)
                }}
                className="ml-2 hover:text-red-600"
                disabled={removingChannelIds.has(channel.channel_id)}
              >
                {removingChannelIds.has(channel.channel_id) ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <X className="w-3 h-3" />
                )}
              </button>
            </Badge>
          ))}
          
          {availableChannels.filter((c) => !channels.some((t) => t.channel_id === c.channel_id)).length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" className="text-gray-600 hover:text-gray-900">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Channel
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2">
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {availableChannels
                    .filter((c) => !channels.some((t) => t.channel_id === c.channel_id))
                    .map((channel) => (
                    <button
                      key={channel.channel_id}
                      type="button"
                      className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded"
                      onClick={() => {
                        handleAddChannel(channel.channel_id)
                      }}
                    >
                      {channel.name}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* Briefing Type Selector (only show if channel selected) */}
      {selectedChannelId && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-medium text-gray-900 block">Briefing Type</Label>
            {isChannelMetaLoading && (
              <span className="text-xs text-gray-400 inline-flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading…
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {briefingTypeOptions.map((type) => {
              const effectiveId = selectedBriefingTypeId ?? effectiveDefaultBriefingTypeId ?? null
              const isActive = !isNoBriefing && effectiveId === type.id

              return (
                <Badge
                  key={type.id}
                  variant={isActive ? "default" : "outline"}
                  className={`${isChannelMetaLoading ? "opacity-60 cursor-not-allowed" : "cursor-pointer"} h-9 px-3 py-0`}
                  onClick={() => {
                    if (isChannelMetaLoading) return
                    handleBriefingTypeChange(type.id)
                  }}
                  title={type.description ?? type.title}
                >
                  {type.title}
                </Badge>
              )
            })}
            {/* Clear briefing (minimal action, like Add Channel) */} 
            {!isNoBriefing && (selectedBriefingTypeId ?? effectiveDefaultBriefingTypeId) && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-gray-600 hover:text-gray-900"
                disabled={isChannelMetaLoading}
                onClick={handleClearBriefing}
                title="Clear briefing"
              >
                <X className="w-4 h-4 mr-1" />
                Clear briefing
              </Button>
            )}
          </div>
          {(() => {
            const effectiveId = selectedBriefingTypeId ?? effectiveDefaultBriefingTypeId ?? null
            const active = briefingTypeOptions.find(t => t.id === effectiveId)
            if (!active?.description) return null
            return (
              <p className="text-xs text-gray-500 mt-1">
                {active.description}
              </p>
            )
          })()}
          {projectId && (
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={handleManageTemplates}
                className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
              >
                Manage templates
              </button>
              <Dialog open={isImportTemplateOpen} onOpenChange={setIsImportTemplateOpen}>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    Import template
                  </button>
                </DialogTrigger>
                <DialogContent className="w-[calc(100vw-2rem)] sm:w-full max-w-3xl max-h-[85vh] overflow-hidden p-0">
                  <div className="flex flex-col h-full max-h-[85vh]">
                    <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
                      <DialogTitle>Import template (from source)</DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 min-h-0 px-6 pb-6 overflow-auto">
                      {/* Same UI + same calls as before — just moved into a dialog */}
                      <StructureReviewPanel
                        taskId={taskId}
                        existingComponents={components}
                        onSuggestionsReceived={() => {}}
                        onApplyComponent={handleApplyComponent}
                        onApplyAll={handleApplyAllComponents}
                        initialSourceUrl={taskSourceUrl}
                      />
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleBuildWithAI()}
                  className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Build with AI
                </button>
                <DropdownMenu onOpenChange={(open) => open && fetchAiThreads()}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700 transition-colors"
                      title="AI thread history"
                    >
                      <History className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-80">
                    <div className="px-2 py-1.5 text-xs font-medium text-gray-500">
                      Previous AI Threads
                    </div>
                    <DropdownMenuSeparator />
                    {isLoadingThreads ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      </div>
                    ) : aiThreads.length === 0 ? (
                      <div className="px-2 py-3 text-xs text-gray-500">
                        No previous threads found
                      </div>
                    ) : (
                      aiThreads.map((thread) => (
                        <DropdownMenuItem
                          key={thread.id}
                          onClick={() => handleOpenThread(thread.id)}
                          className="cursor-pointer"
                        >
                          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">
                              {thread.title || 'Untitled Thread'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {thread.last_message_at 
                                ? new Date(thread.last_message_at).toLocaleString()
                                : new Date(thread.created_at).toLocaleString()
                              }
                            </div>
                          </div>
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main content panel - only when no briefing mode is active (explicit no briefing or no briefing type available) */}
      {selectedChannelId && (isNoBriefing || (!selectedBriefingTypeId && !effectiveDefaultBriefingTypeId)) && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-medium text-gray-900 block">Main content</Label>
            <button
              type="button"
              onClick={() => handleBuildWithAI('main')}
              className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
            >
              Build with AI
            </button>
          </div>
          <div className="border rounded-lg bg-white p-3">
            <ResizableEditor
              componentId={MAIN_BRIEFING_COMPONENT_ID}
              value={componentOutputs.get(MAIN_BRIEFING_COMPONENT_ID)?.content_text || ''}
              onChange={(text) => {
                // Update ref immediately with latest value
                outputValuesRef.current.set(MAIN_BRIEFING_COMPONENT_ID, text)
                // Update local state for immediate UI update
                setComponentOutputs(prev => {
                  const newMap = new Map(prev)
                  newMap.set(MAIN_BRIEFING_COMPONENT_ID, {
                    content_text: text,
                    updated_at: new Date().toISOString()
                  })
                  return newMap
                })
                // Persist using the shared debounced saver
                debouncedSaveOutput(MAIN_BRIEFING_COMPONENT_ID)
              }}
              toolbarId={`ql-toolbar-main-${taskId}-${selectedChannelId}`}
            />
            {componentOutputs.get(MAIN_BRIEFING_COMPONENT_ID)?.updated_at && (
              <p className="text-xs text-gray-400 mt-2">
                Last updated: {new Date(componentOutputs.get(MAIN_BRIEFING_COMPONENT_ID)!.updated_at as string).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Components Panel (only show if channel + briefing type selected and not in no-briefing mode) */}
      {selectedChannelId && (selectedBriefingTypeId ?? effectiveDefaultBriefingTypeId) && !isNoBriefing && (
        <div>
          <Label className="text-sm font-medium text-gray-900 mb-2 block">Components</Label>
          {componentsQuery.isFetching && components.length > 0 && (
            <div className="text-xs text-gray-400 mb-2">Updating components…</div>
          )}
          {components.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">
              {selectedBriefingTypeId === null 
                ? 'Loading components from project defaults...'
                : 'No components available. Select a briefing type or use project defaults.'
              }
            </p>
          ) : (
            <div className={componentsQuery.isFetching ? "opacity-70 transition-opacity" : "transition-opacity"}>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={components.map(c => c.task_component_id || `temp-${c.briefing_component_id || c.project_component_id || Math.random()}`)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                  {components.map((component) => (
                    <SortableComponentItem
                      key={component.task_component_id || `temp-${component.briefing_component_id || component.project_component_id}`}
                      component={component}
                      isSelected={component.selected}
                      onToggle={() => handleToggleComponent(component, !component.selected)}
                      onEditCustom={(taskComponentId, briefingComponentId, projectComponentId, title, desc, scope) => 
                        handleEditComponentCustom(
                          taskComponentId,
                          briefingComponentId,
                          projectComponentId,
                          title,
                          desc,
                          scope
                        )
                      }
                      onReorder={(id, pos) => {}}
                      isEditing={editingComponentId === (component.task_component_id || `temp-${component.briefing_component_id || component.project_component_id}`)}
                      onStartEdit={() => setEditingComponentId(component.task_component_id || `temp-${component.briefing_component_id || component.project_component_id}`)}
                      onCancelEdit={() => {
                        setEditingComponentId(null)
                        // Reset to original values handled by useEffect in SortableComponentItem
                      }}
                      isEditingDescription={editingDescriptionComponentId === (component.task_component_id || `temp-${component.briefing_component_id || component.project_component_id}`)}
                      onStartEditDescription={() => setEditingDescriptionComponentId(component.task_component_id || `temp-${component.briefing_component_id || component.project_component_id}`)}
                      onCancelEditDescription={() => {
                        setEditingDescriptionComponentId(null)
                        // Don't update state here - the useEffect in SortableComponentItem will reset values from props
                      }}
                      output={componentOutputs.get(component.briefing_component_id || 0) || null}
                      onOutputChange={(text) => {
                        const componentIdForOutput = component.briefing_component_id || 0
                        // Update ref immediately with latest value (no trimming)
                        outputValuesRef.current.set(componentIdForOutput, text)
                        // Update local state for immediate UI update
                        setComponentOutputs(prev => {
                          const newMap = new Map(prev)
                          newMap.set(componentIdForOutput, {
                            content_text: text,
                            updated_at: new Date().toISOString()
                          })
                          return newMap
                        })
                      }}
                      onSaveOutput={(componentId) => {
                        debouncedSaveOutput(componentId)
                      }}
                      isLoadingOutput={loadingOutputs.has(component.briefing_component_id || 0)}
                      onLoadOutput={() => {
                        if (component.briefing_component_id) {
                          fetchComponentOutput(component.briefing_component_id)
                        }
                      }}
                      projectId={projectId}
                      contentTypeId={contentTypeId}
                      channelId={selectedChannelId}
                      briefingTypeId={selectedBriefingTypeId}
                      onEditInTemplate={handleEditInTemplate}
                      onRemoveFromTemplate={handleRemoveFromTemplate}
                      onBuildWithAI={handleBuildWithAI}
                      autoExpandComponentId={autoExpandComponentId}
                    />
                  ))}
                  
                  {/* Add Component Row - for ad-hoc only */}
                  {projectId && selectedChannelId && (
                    <AddComponentRow
                      projectId={projectId}
                      taskId={taskId}
                      channelId={selectedChannelId}
                      briefingTypeId={selectedBriefingTypeId}
                      contentTypeId={contentTypeId}
                      onComponentAdded={() => {
                        refreshComponents()
                        fetchAvailableChannels()
                      }}
                    />
                  )}
                </div>
                </SortableContext>
              </DndContext>
            </div>
          )}

          {/* Export (all channels) */}
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportComponentsToWord}
              disabled={isExporting}
              className="gap-2"
              title="Export component outputs for all channels (.docx)"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export
            </Button>
          </div>

          {/* Available to add (unified) */}
          {(() => {
            const rawItems = Array.isArray(availableQuery.data) ? [...availableQuery.data] : []

            const tagOrder: Record<string, number> = {
              'Removed from task': 0,
              Recommended: 1,
              Removed: 2,
              System: 3,
              'System (other briefings)': 4,
              Custom: 5,
            }

            const query = availableSearchQuery.trim().toLowerCase()
            const items = rawItems
              .filter((item) => {
                if (availableTagFilter !== '__all__') {
                  if ((item.tag || '').toLowerCase() !== String(availableTagFilter).toLowerCase()) return false
                }

                if (query) {
                  const title = (item.custom_title || item.title || '').toString()
                  const desc = (item.custom_description || item.description || '').toString()
                  const haystack = `${title}\n${desc}`.toLowerCase()
                  if (!haystack.includes(query)) return false
                }

                return true
              })

            items.sort((a, b) => {
              const ta = tagOrder[a.tag] ?? 999
              const tb = tagOrder[b.tag] ?? 999
              if (ta !== tb) return ta - tb
              return (a.title || '').localeCompare(b.title || '')
            })

            return (
              <>
                <div className="my-4 border-t border-gray-200" />
                <div className="mb-3">
                  <span className="text-xs text-gray-500">Available to add</span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 mb-3">
                  <div className="relative flex-1 min-w-[260px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type="search"
                      placeholder="Search available components..."
                      value={availableSearchQuery}
                      onChange={(e) => setAvailableSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={availableTagFilter} onValueChange={(v) => setAvailableTagFilter(v as any)}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All</SelectItem>
                      <SelectItem value="Removed from task">Removed from task</SelectItem>
                      <SelectItem value="Recommended">Recommended</SelectItem>
                      <SelectItem value="Removed">Removed</SelectItem>
                      <SelectItem value="System">System</SelectItem>
                      <SelectItem value="System (other briefings)">System (other briefings)</SelectItem>
                      <SelectItem value="Custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {items.length === 0 ? (
                  <div className="text-xs text-gray-500 border border-dashed rounded p-3 bg-gray-50">
                    No results. Try clearing your search or changing the type filter.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((item) => {
                      const isAdding = addingAvailableKeys.has(item.key)
                      const origin = item.key.startsWith('p:') ? 'project' : 'global'
                      const effectiveTitle = item.custom_title || item.title
                      const effectiveDescription = item.custom_description || item.description

                      const isRecommended = item.tag === 'Recommended'
                      const isRemoved = item.tag === 'Removed'

                      const showTagPill = !isRecommended && !isRemoved && typeof item.tag === 'string' && item.tag.trim().length > 0

                      return (
                        <div
                          key={item.key}
                          className="border rounded-lg p-3 bg-white border-gray-200 hover:bg-gray-50 min-h-[96px]"
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
                                  {origin === 'project' ? 'Project' : 'System'}
                                </Badge>
                                {isRecommended ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-2 py-0.5 border-emerald-200 bg-emerald-50 text-emerald-700"
                                  >
                                    Recommended
                                  </Badge>
                                ) : null}
                                {isRemoved ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-2 py-0.5 border-gray-200 bg-gray-50 text-gray-600"
                                  >
                                    Removed
                                  </Badge>
                                ) : null}
                                {showTagPill ? (
                                  <Badge
                                    variant="outline"
                                    className={
                                      item.tag === 'Custom'
                                        ? 'text-[10px] px-2 py-0.5 border-purple-200 bg-purple-50 text-purple-700'
                                        : 'text-[10px] px-2 py-0.5 border-gray-200 bg-gray-50 text-gray-600'
                                    }
                                  >
                                    {item.tag}
                                  </Badge>
                                ) : null}
                              </div>

                              {effectiveDescription ? (
                                <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap line-clamp-2">
                                  {effectiveDescription}
                                </p>
                              ) : null}
                            </div>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAddAvailableComponent(item)}
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
              </>
            )
          })()}
        </div>
      )}

      {/* SEO Panel - Reuse existing SEOPanel component with task channel data */}
      {selectedChannelId && (
        <div className="border rounded-lg p-4 bg-white">
          <SEOPanel
            variantSEO={variantSEOData}
            isLoading={false}
            onUpdateKeywords={handleUpdateKeywords}
            onToggleSEORequired={handleToggleSEORequired}
            isUpdatingKeywords={isUpdatingKeywords}
            isTogglingSEO={isTogglingSEO}
            cttId={null} // Not applicable for task channels
            channelId={selectedChannelId}
            languageId={languageId || null}
            variantId={null} // Not applicable for task channels
            variantBriefingTypeId={null} // Not applicable for task channels
            taskId={taskId} // Pass taskId for task channel component outputs
          />
        </div>
      )}
    </div>
  )
}

