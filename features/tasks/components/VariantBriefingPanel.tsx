"use client"

import React, { useState, useCallback, useMemo } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Button } from '../../../app/components/ui/button'
import { Badge } from '../../../app/components/ui/badge'
import { Input } from '../../../app/components/ui/input'
import { Textarea } from '../../../app/components/ui/textarea'
import { Checkbox } from '../../../app/components/ui/checkbox'
import { toast } from '../../../app/components/ui/use-toast'
import { GripVertical, Clock, ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { useVariantBriefingComponents, useVariantBriefingActions, BriefingComponent } from '../hooks/use-variant-briefing'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { RichTextEditor } from '../../../app/components/ui/rich-text-editor'
import debounce from 'lodash.debounce'
import { extractPlainText } from '../utils/keyword-density'

interface VariantBriefingPanelProps {
  variantId: string
  briefingTypeId: number | null
  projectId?: number
  cttId?: string | null
  channelId?: number | null
  languageId?: number | null
}

interface VariantSortableComponentItemProps {
  component: BriefingComponent
  variantId: string
  cttId?: string | null
  channelId?: number | null
  languageId?: number | null
  onToggle: (componentId: number, selected: boolean) => void
  onEditCustom: (componentId: number, customTitle: string, customDescription: string) => void
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
}

function VariantSortableComponentItem({ 
  component, 
  variantId,
  cttId,
  channelId,
  languageId,
  onToggle, 
  onEditCustom, 
  isEditing, 
  onStartEdit, 
  onCancelEdit,
}: VariantSortableComponentItemProps) {
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

  const [customTitle, setCustomTitle] = useState(component.custom_title || '')
  const [customDescription, setCustomDescription] = useState(component.custom_description || '')
  const [isExpanded, setIsExpanded] = useState(false)
  const [contentText, setContentText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [isLoadingContent, setIsLoadingContent] = useState(false)
  
  const supabase = createClientComponentClient()

  // Load component output when expanded
  React.useEffect(() => {
    const loadComponentOutput = async () => {
      if (!cttId || languageId === null || !isExpanded) return

      setIsLoadingContent(true)
      try {
        // Use same table structure as CTT level (ctt_id + channel_id + language_id)
        let query = supabase
          .from('content_types_tasks_component_outputs')
          .select('content_text, content_html, status, updated_at')
          .eq('ctt_id', cttId)
          .eq('briefing_component_id', component.component_id)
          .eq('language_id', languageId)

        if (channelId === null) {
          query = query.is('channel_id', null)
        } else {
          query = query.eq('channel_id', channelId)
        }

        const { data, error } = await query.maybeSingle()

        if (error && error.code !== 'PGRST116') {
          console.error('Failed to load component output:', error)
        }

        if (data) {
          setContentText(data.content_html || data.content_text || '')
          setLastUpdated(data.updated_at ? new Date(data.updated_at).toLocaleString() : null)
        } else {
          setContentText('')
          setLastUpdated(null)
        }
      } catch (err: any) {
        console.error('Failed to load component output:', err)
      } finally {
        setIsLoadingContent(false)
      }
    }

    loadComponentOutput()
  }, [cttId, channelId, languageId, component.component_id, isExpanded, supabase])

  // Debounced save for custom fields
  const debouncedSave = useMemo(
    () => debounce((title: string, description: string) => {
      onEditCustom(component.component_id, title, description)
    }, 800),
    [component.component_id, onEditCustom]
  )

  // Debounced save for content text
  const debouncedSaveContent = useMemo(
    () => debounce(async (html: string) => {
      if (!cttId || languageId === null) return
      
      const plainText = extractPlainText(html)
      
      setIsSaving(true)
      try {
        // Use same RPC as CTT level - it handles variant-specific outputs via ctt_id + channel_id + language_id
        const { error } = await supabase.rpc('ctt_set_component_output', {
          p_ctt_id: cttId,
          p_component_id: component.component_id,
          p_channel_id: channelId,
          p_language_id: languageId,
          p_text: plainText,
          p_html: html
        })
        
        if (error) throw error
        
        setLastUpdated(new Date().toLocaleString())
      } catch (error: any) {
        console.error('Failed to save content:', error)
        toast({
          title: "Save failed",
          description: error.message,
          variant: "destructive",
        })
      } finally {
        setIsSaving(false)
      }
    }, 700),
    [cttId, channelId, languageId, component.component_id, supabase]
  )

  // Cleanup debounced function on unmount
  React.useEffect(() => {
    return () => {
      debouncedSaveContent.cancel()
    }
  }, [debouncedSaveContent])

  const handleCustomTitleChange = (value: string) => {
    setCustomTitle(value)
    debouncedSave(value, customDescription)
  }

  const handleCustomDescriptionChange = (value: string) => {
    setCustomDescription(value)
    debouncedSave(customTitle, value)
  }

  const handleContentChange = (content: string) => {
    setContentText(content)
    debouncedSaveContent(content)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-3 p-2 border rounded-lg bg-white ${
        isDragging ? 'opacity-50' : ''
      } border-gray-200`}
    >
      {/* Drag handle and checkbox */}
      <div className="flex items-center gap-2">
        {component.selected && (
          <div
            {...attributes}
            {...listeners}
            className="flex items-center justify-center w-5 h-5 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="w-4 h-4" />
          </div>
        )}

        <Checkbox
          checked={component.selected}
          onCheckedChange={(checked: boolean | string) => onToggle(component.component_id, !!checked)}
          className="flex-shrink-0"
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="space-y-2">
            <Input
              placeholder="Custom title (optional)"
              value={customTitle}
              onChange={(e) => handleCustomTitleChange(e.target.value)}
              className="text-sm"
            />
            <Textarea
              placeholder="Custom description (optional)"
              value={customDescription}
              onChange={(e) => handleCustomDescriptionChange(e.target.value)}
              className="text-sm min-h-[60px]"
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  onEditCustom(component.component_id, customTitle, customDescription)
                  onCancelEdit()
                }}
                className="text-green-600 hover:text-green-700"
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onCancelEdit}
                className="text-gray-600"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Input
                    value={customTitle || component.component_title}
                    onChange={(e) => handleCustomTitleChange(e.target.value)}
                    className="font-medium text-gray-900 border-none p-0 h-auto focus:ring-0 focus:border-none"
                    placeholder="Component title"
                  />
                  {component.component_id < 0 && (
                    <Badge variant="outline" className="text-xs">
                      Project
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isExpanded && lastUpdated && (
                  <div className="text-xs text-gray-400">Last saved: {lastUpdated}</div>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-gray-600 hover:text-gray-700 p-1 h-6"
                >
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
            
            {isExpanded && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {isSaving && (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3 animate-spin" />
                        Saving...
                      </div>
                    )}
                    {!isSaving && lastUpdated && (
                      <div className="flex items-center gap-1 text-xs text-green-600">
                        <span>✓ Saved {lastUpdated}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <Textarea
                  value={customDescription || component.custom_description || component.component_description || ''}
                  onChange={(e) => handleCustomDescriptionChange(e.target.value)}
                  className="text-sm text-gray-600 mb-2 border-none p-0 h-auto focus:ring-0 focus:border-none resize-none"
                  placeholder="Component description (optional)"
                  rows={1}
                />

                <div 
                  className="border border-gray-200 rounded-lg overflow-auto resize-y" 
                  style={{ 
                    minHeight: '250px', 
                    maxHeight: '600px',
                    resize: 'vertical',
                    overflowY: 'auto'
                  }}
                >
                  {isLoadingContent ? (
                    <div className="p-4 text-center text-gray-500">Loading content...</div>
                  ) : (
                    <RichTextEditor
                      value={contentText}
                      onChange={handleContentChange}
                      readOnly={false}
                      toolbarId={`ql-toolbar-variant-component-${component.component_id}`}
                      placeholder={`Start writing content for ${customTitle || component.component_title}...`}
                      height={250}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function VariantBriefingPanel({ variantId, briefingTypeId, projectId, cttId, channelId, languageId }: VariantBriefingPanelProps) {
  const [editingComponent, setEditingComponent] = useState<number | null>(null)
  const [optimisticComponents, setOptimisticComponents] = useState<BriefingComponent[]>([])
  
  const supabase = createClientComponentClient()

  // Fetch components when variant has briefing type
  const { items: components, loading: componentsLoading, error: componentsError, refresh: refreshComponents } = useVariantBriefingComponents(
    variantId,
    !!briefingTypeId
  )

  // Refetch components when briefing type changes
  React.useEffect(() => {
    if (variantId && briefingTypeId) {
      console.log('🔄 VariantBriefingPanel: Briefing type changed, refetching components', { variantId, briefingTypeId })
      // Refetch components when briefing type changes
      refreshComponents()
    } else if (variantId && !briefingTypeId) {
      // Clear components if briefing type is removed
      console.log('🔄 VariantBriefingPanel: Briefing type removed, clearing components')
      setOptimisticComponents([])
    }
  }, [variantId, briefingTypeId, refreshComponents])

  const { setBriefingType, toggleComponent, removeComponent, reorderComponents } = useVariantBriefingActions()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Use optimistic components if available, otherwise use real components
  const displayComponents = optimisticComponents.length > 0 ? optimisticComponents : components

  const handleToggleComponent = useCallback(async (componentId: number, selected: boolean) => {
    const originalComponents = [...displayComponents]

    // Optimistic update
    setOptimisticComponents(prev => {
      if (prev.length === 0) {
        const currentComponents = displayComponents
        const selectedCount = currentComponents.filter(c => c.selected).length
        return currentComponents.map(comp => 
          comp.component_id === componentId 
            ? { ...comp, selected, position: selected ? (selectedCount + 1) : null }
            : comp
        )
      } else {
        const selectedCount = prev.filter(c => c.selected).length
        return prev.map(comp => 
          comp.component_id === componentId 
            ? { ...comp, selected, position: selected ? (selectedCount + 1) : null }
            : comp
        )
      }
    })

    try {
      const isProjectComponent = componentId < 0
      
      // For soft remove (selected: false), use toggleComponent
      // For hard remove, we'd use removeComponent, but toggle handles both
      if (!selected) {
        // Soft remove: just set selected to false
        const result = await toggleComponent(variantId, componentId, false, isProjectComponent)
        if (!result.success) {
          throw new Error(result.error)
        }
      } else {
        // Add component: calculate next position
        const selectedCount = displayComponents.filter(c => c.selected).length
        const nextPos = selectedCount + 1
        const result = await toggleComponent(variantId, componentId, true, isProjectComponent, nextPos)
        if (!result.success) {
          throw new Error(result.error)
        }
      }

      // Refetch components after mutation
      await refreshComponents()
      setOptimisticComponents([])
    } catch (error: any) {
      console.error('Failed to toggle component:', error)
      toast({
        title: "Failed to update component",
        description: error.message,
        variant: "destructive",
      })
      // Revert optimistic change
      setOptimisticComponents([])
    }
  }, [variantId, toggleComponent, displayComponents, refreshComponents])

  const handleEditCustom = useCallback(async (componentId: number, customTitle: string, customDescription: string) => {
    // Store original state for revert
    const originalComponents = [...displayComponents]
    
    // Optimistic update
    setOptimisticComponents(prev => {
      const current = prev.length === 0 ? displayComponents : prev
      return current.map(comp => 
        comp.component_id === componentId 
          ? { ...comp, custom_title: customTitle || null, custom_description: customDescription || null }
          : comp
      )
    })

    try {
      const result = await toggleComponent(variantId, componentId, true, componentId < 0, undefined, customTitle, customDescription)
      if (!result.success) {
        throw new Error(result.error)
      }

      // Refetch components after mutation
      await refreshComponents()
      setOptimisticComponents([])

      toast({
        title: "Custom fields saved",
        description: "Your custom title and description have been saved.",
      })
    } catch (error: any) {
      console.error('Failed to save custom fields:', error)
      toast({
        title: "Failed to save custom fields",
        description: error.message,
        variant: "destructive",
      })
      // Revert optimistic change
      setOptimisticComponents([])
    }
  }, [variantId, toggleComponent, displayComponents, refreshComponents])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id || !variantId) return

    const selectedComponents = displayComponents.filter(c => c.selected)
    const oldIndex = selectedComponents.findIndex(c => c.component_id === active.id)
    const newIndex = selectedComponents.findIndex(c => c.component_id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const reorderedComponents = arrayMove(selectedComponents, oldIndex, newIndex)

    const idToNewPos = new Map<number, number>()
    reorderedComponents.forEach((comp, idx) => {
      idToNewPos.set(comp.component_id, idx + 1)
    })

    // Store original state for revert
    const originalComponents = [...displayComponents]

    // Optimistic update
    const newOptimisticState = displayComponents.map(comp => (
      comp.selected && idToNewPos.has(comp.component_id)
        ? { ...comp, position: idToNewPos.get(comp.component_id)! }
        : comp
    ))
    
    setOptimisticComponents(newOptimisticState)

    try {
      const orderArray = reorderedComponents.map((comp, index) => {
        // Convert to the format expected by variant_reorder_components
        // For project components (negative IDs), use the absolute value as component_id
        const isProjectComponent = comp.component_id < 0
        const componentId = isProjectComponent ? Math.abs(comp.component_id) : comp.component_id
        return {
          component_id: componentId,
          position: index + 1
        }
      })

      const result = await reorderComponents(variantId, orderArray)
      if (!result.success) {
        throw new Error(result.error)
      }

      // Refetch components after mutation
      await refreshComponents()
      setOptimisticComponents([])
    } catch (error: any) {
      console.error('Failed to reorder components:', error)
      toast({
        title: "Failed to reorder components",
        description: error.message,
        variant: "destructive",
      })
      // Revert optimistic change
      setOptimisticComponents([])
    }
  }, [variantId, displayComponents, reorderComponents, refreshComponents])

  // Sort selected components by position
  const selectedComponents = displayComponents
    .filter(c => c.selected)
    .slice()
    .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER))
  const unselectedComponents = displayComponents.filter(c => !c.selected)

  if (componentsError) {
    return (
      <div className="p-4 text-center text-red-500">
        <div className="text-sm font-medium">Error loading components</div>
        <div className="text-xs mt-1">{componentsError}</div>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={() => refreshComponents()}
          className="mt-2"
        >
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Components Section */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Components</label>
        {componentsLoading ? (
          <div className="text-sm text-gray-500">Loading components...</div>
        ) : displayComponents.length === 0 ? (
          <div className="text-sm text-gray-500">
            This briefing type has no components.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="space-y-3">
              {/* Selected Components (sortable) */}
              {selectedComponents.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Selected ({selectedComponents.length})
                  </div>
                  <SortableContext 
                    items={selectedComponents.map(c => c.component_id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {selectedComponents.map((component) => (
                        <VariantSortableComponentItem
                          key={component.component_id}
                          component={component}
                          variantId={variantId}
                          cttId={cttId}
                          channelId={channelId}
                          languageId={languageId}
                          onToggle={handleToggleComponent}
                          onEditCustom={handleEditCustom}
                          isEditing={editingComponent === component.component_id}
                          onStartEdit={() => setEditingComponent(component.component_id)}
                          onCancelEdit={() => setEditingComponent(null)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </div>
              )}

              {/* Unselected Components */}
              {unselectedComponents.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Available ({unselectedComponents.length})
                  </div>
                  <div className="space-y-2">
                    {unselectedComponents.map((component) => (
                      <VariantSortableComponentItem
                        key={component.component_id}
                        component={component}
                        variantId={variantId}
                        cttId={cttId}
                        channelId={channelId}
                        languageId={languageId}
                        onToggle={handleToggleComponent}
                        onEditCustom={handleEditCustom}
                        isEditing={editingComponent === component.component_id}
                        onStartEdit={() => setEditingComponent(component.component_id)}
                        onCancelEdit={() => setEditingComponent(null)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Add project component as a discreet row */}
              {projectId && briefingTypeId && (
                <AddVariantComponentRow
                  projectId={projectId}
                  variantId={variantId}
                  briefingTypeId={briefingTypeId}
                  currentSelectedCount={selectedComponents.length}
                  onOptimisticAdd={(partial) => {
                    // Compute next position among selected
                    const selectedCount = displayComponents.filter(c => c.selected).length
                    const optimisticItem: BriefingComponent = {
                      component_id: partial.component_id,
                      component_title: partial.component_title,
                      component_description: null,
                      selected: true,
                      position: selectedCount + 1,
                      custom_title: partial.custom_title || null,
                      custom_description: partial.custom_description || null
                    }
                    setOptimisticComponents(prev => [...(prev.length ? prev : displayComponents), optimisticItem])
                  }}
                  onAdded={async () => {
                    await refreshComponents()
                    setOptimisticComponents([])
                  }}
                />
              )}
            </div>
          </DndContext>
        )}
      </div>
    </div>
  )
}

function AddVariantComponentRow({ 
  projectId, 
  variantId, 
  briefingTypeId, 
  onAdded, 
  onOptimisticAdd,
  currentSelectedCount
}: { 
  projectId: number
  variantId: string
  briefingTypeId: number
  onAdded: () => Promise<void>
  onOptimisticAdd: (comp: { component_id: number, component_title: string, custom_title?: string, custom_description?: string }) => void
  currentSelectedCount?: number
}) {
  const supabase = createClientComponentClient()
  const { toggleComponent } = useVariantBriefingActions()
  const [isEditing, setIsEditing] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  const handleSubmit = async () => {
    if (!title.trim()) return
    setSubmitting(true)
    try {
      // Create project component first
      const { data: created, error: createErr } = await supabase.rpc('create_project_component', {
        p_project_id: projectId,
        p_title: title,
        p_description: description || null
      })
      if (createErr) throw createErr

      const projectComponentId = created?.project_component_id || created?.id || created
      if (!projectComponentId) throw new Error('Missing project_component_id')

      // Optimistic add to the components list
      // Use negative ID for project components
      const negativeId = -Number(projectComponentId)
      
      // Calculate next position (use provided count or fetch)
      let nextPos = (currentSelectedCount || 0) + 1
      if (currentSelectedCount === undefined) {
        const { data: components } = await supabase.rpc('briefing_components_for_variant', {
          p_variant_id: variantId
        })
        nextPos = (components || []).filter((c: any) => c.selected).length + 1
      }

      // Optimistic update
      onOptimisticAdd({
        component_id: negativeId,
        component_title: title,
        custom_title: title,
        custom_description: description || ''
      })

      // Add component to variant using variant_set_component
      const result = await toggleComponent(variantId, negativeId, true, true, nextPos, title, description || undefined)
      if (!result.success) {
        throw new Error(result.error || 'Failed to add component to variant')
      }

      await onAdded()
      setIsEditing(false)
      setTitle('')
      setDescription('')
    } catch (e: any) {
      console.error('Failed to add variant component:', e)
      toast({
        title: "Failed to add component",
        description: e.message || 'An error occurred',
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (!isEditing) {
    return (
      <div className="flex items-center gap-3 p-2 border rounded-lg bg-white border-gray-200 cursor-pointer" onClick={() => setIsEditing(true)}>
        <div className="w-5 h-5 flex items-center justify-center text-gray-400">
          <Plus className="w-4 h-4" />
        </div>
        <div className="text-sm text-gray-600">Add component</div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 p-3 border rounded-lg bg-white border-gray-200">
      <div className="flex-1 min-w-0 space-y-2">
        <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="text-sm" />
        <Textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} className="text-sm min-h-[60px]" />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSubmit} disabled={submitting || !title.trim()}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => { setIsEditing(false); setTitle(''); setDescription('') }}>Cancel</Button>
        </div>
      </div>
      <Badge variant="outline" className="text-xs">Project</Badge>
    </div>
  )
}

