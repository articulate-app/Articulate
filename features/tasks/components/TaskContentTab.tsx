"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useSearchParams, usePathname, useRouter } from "next/navigation"
import { Textarea } from "../../../app/components/ui/textarea"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Button } from "../../../app/components/ui/button"
import { Badge } from "../../../app/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../app/components/ui/select"
import { Input } from "../../../app/components/ui/input"
import { Label } from "../../../app/components/ui/label"
import { Checkbox } from "../../../app/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "../../../app/components/ui/popover"
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
  ChevronDown,
  ChevronRight,
  Move,
  Edit,
  Trash2,
  History
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

interface BriefingType {
  id: number
  title: string
  description: string | null
  is_default?: boolean
}

interface TaskChannelBriefing {
  briefing_type_id: number | null
}

type ComponentScope = 'task' | 'project' | 'channel'

interface TaskChannelComponent {
  // From tc_components_for_task_channel RPC
  task_component_id: string | null // UUID if component is added to this task, null if just available from template
  briefing_component_id: number | null // ID from briefing_components table, or null for ad-hoc
  project_component_id: number | null // ID from project_components table, or null
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
        
        // Step 2: Link to project briefing type template using pbtc_add_project
        const { error: addErr } = await supabase.rpc('pbtc_add_project', {
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
  onBuildWithAI?: (componentId: number) => void
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
  
  // Determine scope label for display
  const scopeLabel = componentScope === 'project' 
    ? 'Project template' 
    : componentScope === 'channel' 
    ? 'Channel template' 
    : 'Task only'

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`border rounded-lg mb-2 bg-white ${isDragging ? 'shadow-lg' : ''}`}
    >
      {!isExpanded ? (
        // Collapsed: Single row with title, checkbox, and chevron
        <div className="flex items-center gap-2 p-3">
          <div {...attributes} {...listeners} className="cursor-move p-1 hover:bg-gray-100 rounded">
            <GripVertical className="w-4 h-4 text-gray-400" />
          </div>
          <button
            type="button"
            onClick={onToggle}
          >
            {isSelected ? (
              <CheckCircle2 className="w-5 h-5 text-blue-600" />
            ) : (
              <Circle className="w-5 h-5 text-gray-300" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <Input
                  value={customTitle}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Component title"
                  className="text-sm font-medium flex-1"
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
              </div>
            ) : (
              <h4 
                className="text-sm font-medium text-gray-900 truncate flex-1 cursor-text hover:text-blue-600"
                onClick={onStartEdit}
                title="Click to edit"
              >
                {customTitle}
              </h4>
            )}
          </div>
          {/* Build with AI button in collapsed view */}
          {onBuildWithAI && (component.briefing_component_id || component.project_component_id) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onBuildWithAI(component.briefing_component_id || component.project_component_id || 0)
              }}
              className="text-xs text-blue-600 hover:text-blue-700 hover:underline px-2 py-1"
            >
              Build with AI
            </button>
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
            className="p-1 hover:bg-gray-100 rounded"
          >
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      ) : (
        // Expanded: Full details with description and editor
        <div>
          {/* Header row (same as collapsed) */}
          <div className="flex items-center gap-2 p-3 border-b">
            <div {...attributes} {...listeners} className="cursor-move p-1 hover:bg-gray-100 rounded">
              <GripVertical className="w-4 h-4 text-gray-400" />
            </div>
            <button
              type="button"
              onClick={onToggle}
            >
              {isSelected ? (
                <CheckCircle2 className="w-5 h-5 text-blue-600" />
              ) : (
                <Circle className="w-5 h-5 text-gray-300" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={customTitle}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Component title"
                    className="text-sm font-medium flex-1"
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
                </div>
              ) : (
                <h4 
                  className="text-sm font-medium text-gray-900 truncate flex-1 cursor-text hover:text-blue-600"
                  onClick={onStartEdit}
                  title="Click to edit"
                >
                  {customTitle}
                </h4>
              )}
            </div>
            <div className="flex items-center gap-1">
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
                className="p-1 hover:bg-gray-100 rounded"
              >
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>
          
          {/* Expanded content */}
          <div className="p-3 space-y-3">
            {/* Scope badge */}
            {isTemplateBacked && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {scopeLabel}
                </Badge>
              </div>
            )}
            
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
            {onBuildWithAI && (component.briefing_component_id || component.project_component_id) && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => onBuildWithAI(component.briefing_component_id || component.project_component_id || 0)}
                  className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Build with AI
                </button>
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
  
  // State
  const [channels, setChannels] = useState<TaskChannel[]>([])
  const [availableChannels, setAvailableChannels] = useState<TaskChannel[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null)
  const [briefingTypes, setBriefingTypes] = useState<BriefingType[]>([])
  const [selectedBriefingTypeId, setSelectedBriefingTypeId] = useState<number | null>(null)
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
  const [isSavingOutput, setIsSavingOutput] = useState<Map<number, boolean>>(new Map())
  const [taskTitle, setTaskTitle] = useState<string>('')
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [autoExpandComponentId, setAutoExpandComponentId] = useState<number | null>(null)
  const [aiThreads, setAiThreads] = useState<Array<{ id: string; title: string | null; last_message_at: string | null; created_at: string }>>([])
  const [isLoadingThreads, setIsLoadingThreads] = useState(false)
  const [taskSourceUrl, setTaskSourceUrl] = useState<string>("")
  
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
      if (taskChannels.length > 0 && !selectedChannelId) {
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
  }, [supabase, taskId, selectedChannelId])
  
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
  
  // Fetch briefing type for selected channel
  const fetchBriefingType = useCallback(async () => {
    if (!selectedChannelId) {
      setSelectedBriefingTypeId(null)
      return
    }
    
    try {
      const { data, error } = await supabase
        .from('task_channel_briefings')
        .select('briefing_type_id')
        .eq('task_id', taskId)
        .eq('channel_id', selectedChannelId)
        .maybeSingle()
      
      if (error) throw error
      
      setSelectedBriefingTypeId(data?.briefing_type_id || null)
    } catch (err: any) {
      console.error('Failed to fetch briefing type:', err)
    }
  }, [supabase, taskId, selectedChannelId])
  
  // Fetch briefing types for project
  const fetchBriefingTypes = useCallback(async () => {
    if (!projectId) return
    
    try {
      const { data, error } = await supabase
        .from('project_briefing_types')
        .select(`
          briefing_type_id,
          is_default,
          position,
          briefing_types!inner(id, title, description)
        `)
        .eq('project_id', projectId)
        .order('is_default', { ascending: false })
        .order('position', { ascending: true })
      
      if (error) throw error
      
      const types = (data || []).map((pbt: any) => ({
        id: pbt.briefing_type_id,
        title: pbt.briefing_types.title,
        description: pbt.briefing_types.description,
        is_default: pbt.is_default || false,
        position: pbt.position
      })).sort((a, b) => {
        // First sort by is_default (true first), then by position, then by title
        if (a.is_default !== b.is_default) {
          return a.is_default ? -1 : 1
        }
        const posA = a.position ?? 999
        const posB = b.position ?? 999
        if (posA !== posB) return posA - posB
        return a.title.localeCompare(b.title)
      })
      
      setBriefingTypes(types)
    } catch (err: any) {
      console.error('Failed to fetch briefing types:', err)
    }
  }, [supabase, projectId])
  
  // Fetch components for selected channel using tc_components_for_task_channel RPC
  const fetchComponents = useCallback(async (channelIdOverride?: number) => {
    const targetChannelId = channelIdOverride ?? selectedChannelId
    if (!targetChannelId) {
      setComponents([])
      return
    }
    
    try {
      const { data, error } = await supabase.rpc('tc_components_for_task_channel', {
        p_task_id: taskId,
        p_channel_id: targetChannelId
      })
      
      if (error) throw error
      
      // Map RPC results to our component interface
      const rows = (data || []).map((row: any) => ({
        task_component_id: row.task_component_id || null,
        briefing_component_id: row.briefing_component_id || null,
        project_component_id: row.project_component_id || null,
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
        component_scope: row.task_component_id ? 'task' : undefined
      }))
      
      // Split components according to new specification:
      // 1. Separate real task rows from template extras
      const realTaskRows = rows.filter((r: any) => r.task_component_id !== null)
      const templateExtras = rows.filter((r: any) => r.task_component_id === null)
      
      // 2. Split real task rows into active and removed
      const activeComponents = realTaskRows
        .filter((r: any) => r.selected)
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
      
      const removedComponentsList = realTaskRows
        .filter((r: any) => !r.selected)
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
      
      // 3. Template extras are always unselected and available to add
      const availableTemplatesList = templateExtras
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
      
      // Store all three lists
      setComponents(activeComponents)
      setRemovedComponents(removedComponentsList)
      setAvailableTemplates(availableTemplatesList)
      
    } catch (err: any) {
      console.error('Failed to fetch components:', err)
      toast({
        title: 'Error loading components',
        description: err.message,
        variant: 'destructive'
      })
    }
  }, [supabase, taskId, selectedChannelId])
  
  // Fetch component output
  const fetchComponentOutput = useCallback(async (componentId: number) => {
    if (!selectedChannelId || loadingOutputs.has(componentId)) return
    
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
      setLoadingOutputs(prev => {
        const newSet = new Set(prev)
        newSet.delete(componentId)
        return newSet
      })
    }
  }, [supabase, taskId, selectedChannelId, loadingOutputs])
  
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
    try {
      // Insert into task_channels
      const { error: insertError } = await supabase
        .from('task_channels')
        .insert({
          task_id: taskId,
          channel_id: channelId
        })
      
      if (insertError) throw insertError
      
      // Refresh channels
      await fetchTaskChannels()
      await fetchAvailableChannels()
      
      // Select the newly added channel
      setSelectedChannelId(channelId)
      
      // Fetch the briefing type for this channel (may be null for project defaults)
      await fetchBriefingType()
      
      toast({
        title: 'Channel added',
        description: 'Channel has been added and briefing initialized.'
      })
    } catch (err: any) {
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
    try {
      const { error } = await supabase
        .from('task_channels')
        .delete()
        .eq('task_id', taskId)
        .eq('channel_id', channelId)
      
      if (error) throw error
      
      await fetchTaskChannels()
      await fetchAvailableChannels()
      
      // If removed channel was selected, select another or clear
      if (selectedChannelId === channelId) {
        const remaining = channels.filter(c => c.channel_id !== channelId)
        setSelectedChannelId(remaining.length > 0 ? remaining[0].channel_id : null)
      }
      
      toast({
        title: 'Channel removed',
        description: 'Channel has been removed.'
      })
    } catch (err: any) {
      console.error('Failed to remove channel:', err)
      toast({
        title: 'Failed to remove channel',
        description: err.message,
        variant: 'destructive'
      })
    }
  }
  
  // Handle briefing type change
  const handleBriefingTypeChange = async (briefingTypeId: number | null) => {
    if (!selectedChannelId) return
    
    try {
      // Call tc_set_briefing RPC (this clears and re-seeds task_channel_components)
      const { error } = await supabase.rpc('tc_set_briefing', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_briefing_type_id: briefingTypeId
      })
      
      if (error) throw error
      
      setSelectedBriefingTypeId(briefingTypeId)
      
      // Re-fetch components using tc_components_for_task_channel
      // This will show the new briefing's template components
      await fetchComponents()
      
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
  
  // Toggle component selection
  const handleToggleComponent = async (
    row: TaskChannelComponent,
    checked: boolean
  ) => {
    if (!selectedChannelId) return
    
    // Store previous state for rollback
    const previousComponents = [...components]
    const previousRemovedComponents = [...removedComponents]
    
    // Optimistic update - update UI immediately
    const updatedComponent = { ...row, selected: checked }
    
    if (checked) {
      // Moving from removed to active
      setComponents(prev => [...prev, updatedComponent])
      setRemovedComponents(prev => 
        prev.filter(c => 
          (c.briefing_component_id || c.project_component_id) !== 
          (row.briefing_component_id || row.project_component_id)
        )
      )
    } else {
      // Moving from active to removed
      setRemovedComponents(prev => [...prev, updatedComponent])
      setComponents(prev => 
        prev.filter(c => 
          (c.briefing_component_id || c.project_component_id) !== 
          (row.briefing_component_id || row.project_component_id)
        )
      )
    }
    
    try {
      // Use tcc_set_component to create/update task row
      const { error } = await supabase.rpc('tcc_set_component', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_task_component_id: row.task_component_id ?? null,
        p_briefing_component_id: row.briefing_component_id ?? null,
        p_project_component_id: row.project_component_id ?? null,
        p_selected: checked,
        p_custom_title: row.custom_title || row.title,
        p_custom_description: row.custom_description || row.description,
        p_position: row.position
      })
      
      if (error) throw error
      
      // Re-fetch components to get updated state (including any server-side changes)
      await fetchComponents()
      
      // If selected, fetch output if it hasn't been loaded yet
      const componentIdForOutput = row.briefing_component_id || row.project_component_id
      if (checked && componentIdForOutput && !componentOutputs.has(componentIdForOutput) && !loadingOutputs.has(componentIdForOutput)) {
        await fetchComponentOutput(componentIdForOutput)
      }
    } catch (err: any) {
      console.error('Failed to toggle component:', err)
      
      // Rollback optimistic update on error
      setComponents(previousComponents)
      setRemovedComponents(previousRemovedComponents)
      
      toast({
        title: 'Failed to update component',
        description: err.message,
        variant: 'destructive'
      })
    }
  }
  
  // Add component from available templates
  const handleAddFromTemplate = async (template: TaskChannelComponent) => {
    if (!selectedChannelId) return
    
    try {
      // Optimistic update
      const previousAvailableTemplates = [...availableTemplates]
      setAvailableTemplates(prev => 
        prev.filter(c => 
          (c.briefing_component_id || c.project_component_id) !== 
          (template.briefing_component_id || template.project_component_id)
        )
      )
      
      // Insert into task_channel_components with selected=true
      const { error } = await supabase.rpc('tcc_set_component', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_task_component_id: null, // New component
        p_briefing_component_id: template.briefing_component_id ?? null,
        p_project_component_id: template.project_component_id ?? null,
        p_selected: true,
        p_custom_title: template.title,
        p_custom_description: template.description,
        p_position: template.position
      })
      
      if (error) throw error
      
      // Re-fetch all components to get updated state
      await fetchComponents()
      
      toast({
        title: 'Component added',
        description: `"${template.title}" has been added to this task.`
      })
    } catch (err: any) {
      console.error('Failed to add component from template:', err)
      
      toast({
        title: 'Failed to add component',
        description: err.message,
        variant: 'destructive'
      })
      
      // Re-fetch to ensure consistent state
      await fetchComponents()
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
        p_briefing_component_id: briefingComponentId,
        p_project_component_id: projectComponentId,
        p_selected: true, // Keep it selected
        p_custom_title: title || null,
        p_custom_description: description || null,
        p_position: null // Keep existing position
      })
      
      if (error) throw error
      
      // Re-fetch to get updated state
      await fetchComponents()
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
      await fetchComponents()
      
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
        const { error: removeErr } = await supabase.rpc('tcc_set_component', {
          p_task_id: taskId,
          p_channel_id: selectedChannelId,
          p_component_id: componentBriefingId,
          p_selected: false
        })
        
        if (removeErr) {
          console.warn('Failed to remove from task:', removeErr)
        }
      }
      
      // Refresh components
      await fetchComponents()
      
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
      await fetchComponents()
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
      await fetchComponents()
      
    } catch (err: any) {
      console.error('Failed to add component to task:', err)
      throw err
    }
  }, [supabase, taskId, selectedChannelId, fetchComponents])
  
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
    newParams.set('middleView', 'ai-build')
    newParams.set('aiThreadId', threadId)
    router.push(`${pathname}?${newParams.toString()}`, { scroll: false })
  }, [searchParams, pathname, router])
  
  // AI build for component-level generation (NEW SPEC: pre-fill input, don't call immediately)
  const handleBuildWithAI = useCallback(async (componentId?: number) => {
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
      
      if (componentId) {
        // Component-level generation
        let component = components.find(
          c => (c.briefing_component_id || c.project_component_id) === componentId
        )
        
        if (!component) {
          throw new Error('Component not found')
        }
        
        // If component doesn't have a task_component_id yet, add it to the task first
        if (!component.task_component_id) {
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
          fetchComponents()
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
      newParams.set('middleView', 'ai-build')
      newParams.set('aiThreadId', threadId)
      newParams.set('chatMode', mode)
      if (taskChannelComponentId) {
        newParams.set('chatComponentId', taskChannelComponentId)
      }
      newParams.set('chatPreFill', encodeURIComponent(preFillMessage))
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
    taskId,
    taskTitle,
    searchParams,
    pathname,
    router,
    supabase,
    fetchComponents
  ])
  
  // Initialize
  useEffect(() => {
    const init = async () => {
      setIsLoading(true)
      await Promise.all([
        fetchTaskChannels(),
        fetchBriefingTypes(),
        fetchTaskTitle()
      ])
      setIsLoading(false)
    }
    init()
  }, [fetchTaskChannels, fetchBriefingTypes, fetchTaskTitle])
  
  // When selected channel changes, fetch related data
  useEffect(() => {
    if (selectedChannelId) {
      Promise.all([
        fetchBriefingType(),
        fetchComponents(),
        fetchSEO()
      ])
    } else {
      setSelectedBriefingTypeId(null)
      setComponents([])
      setSeoData(null)
    }
  }, [selectedChannelId])
  
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
      {/* Structure Review Panel - Show at the top */}
      {selectedChannelId && (
        <StructureReviewPanel
          taskId={taskId}
          existingComponents={components}
          onSuggestionsReceived={() => {}}
          onApplyComponent={handleApplyComponent}
          onApplyAll={handleApplyAllComponents}
          initialSourceUrl={taskSourceUrl}
        />
      )}
      
      {/* Channels Selector */}
      <div>
        <Label className="text-sm font-medium text-gray-900 mb-2 block">Channels</Label>
        <div className="flex flex-wrap gap-2 mb-2">
          {channels.map((channel) => (
            <Badge
              key={channel.channel_id}
              variant={selectedChannelId === channel.channel_id ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => {
                setSelectedChannelId(channel.channel_id)
                onChannelChange?.(channel.channel_id)
              }}
            >
              {channel.name}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemoveChannel(channel.channel_id)
                }}
                className="ml-2 hover:text-red-600"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          
          {availableChannels.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" className="text-gray-600 hover:text-gray-900">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Channel
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2">
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {availableChannels.map((channel) => (
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
          <Label className="text-sm font-medium text-gray-900 mb-2 block">Briefing Type</Label>
          <Select
            value={selectedBriefingTypeId?.toString() || '__project_default__'}
            onValueChange={(value) => {
              if (value === '__project_default__') {
                // Use project defaults - set to null, will auto-pick from project_ct_channel_briefings
                handleBriefingTypeChange(null)
              } else {
                handleBriefingTypeChange(Number(value))
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select briefing type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__project_default__">
                <span className="font-medium">Use project defaults</span>
              </SelectItem>
              {briefingTypes.map((type) => (
                <SelectItem key={type.id} value={type.id.toString()}>
                  {type.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedBriefingTypeId === null ? (
            <p className="text-xs text-gray-500 mt-1">
              Using default briefing from project configuration for this content type × channel.
            </p>
          ) : briefingTypes.find(t => t.id === selectedBriefingTypeId)?.description && (
            <p className="text-xs text-gray-500 mt-1">
              {briefingTypes.find(t => t.id === selectedBriefingTypeId)?.description}
            </p>
          )}
          {projectId && (
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={handleManageTemplates}
                className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
              >
                Manage templates
              </button>
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

      {/* Components Panel (only show if channel selected - briefing can be null for project defaults) */}
      {selectedChannelId && (
        <div>
          <Label className="text-sm font-medium text-gray-900 mb-2 block">Components</Label>
          {components.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">
              {selectedBriefingTypeId === null 
                ? 'Loading components from project defaults...'
                : 'No components available. Select a briefing type or use project defaults.'
              }
            </p>
          ) : (
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
                      output={componentOutputs.get(component.briefing_component_id || component.project_component_id || 0) || null}
                      onOutputChange={(text) => {
                        const componentIdForOutput = component.briefing_component_id || component.project_component_id || 0
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
                      isLoadingOutput={loadingOutputs.has(component.briefing_component_id || component.project_component_id || 0)}
                      onLoadOutput={() => fetchComponentOutput(component.briefing_component_id || component.project_component_id || 0)}
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
                        fetchComponents()
                        fetchAvailableChannels()
                      }}
                    />
                  )}
                </div>
              </SortableContext>
            </DndContext>
          )}
          
          {/* Removed Components (Bottom Area - First List) */}
          {removedComponents.length > 0 && (
            <>
              <div className="my-4 border-t border-gray-200" />
              <div className="mb-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Removed from this task
                </p>
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={removedComponents.map(c => c.task_component_id || `temp-${c.briefing_component_id || c.project_component_id || Math.random()}`)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {removedComponents.map((component) => (
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
                        output={componentOutputs.get(component.briefing_component_id || component.project_component_id || 0) || null}
                        onOutputChange={(text) => {
                          const componentIdForOutput = component.briefing_component_id || component.project_component_id || 0
                          outputValuesRef.current.set(componentIdForOutput, text)
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
                        isLoadingOutput={loadingOutputs.has(component.briefing_component_id || component.project_component_id || 0)}
                        onLoadOutput={() => fetchComponentOutput(component.briefing_component_id || component.project_component_id || 0)}
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
                  </div>
                </SortableContext>
              </DndContext>
            </>
          )}
          
          {/* Available from Template (Bottom Area - Second List) */}
          {availableTemplates.length > 0 && (
            <>
              <div className="my-4 border-t border-gray-200" />
              <div className="mb-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Available from project template
                </p>
              </div>
              <div className="space-y-2">
                {availableTemplates.map((template) => (
                  <div 
                    key={`template-${template.briefing_component_id || template.project_component_id}`}
                    className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{template.title}</span>
                      </div>
                      {template.description && (
                        <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">{template.description}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAddFromTemplate(template)}
                      className="flex-shrink-0"
                    >
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
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

