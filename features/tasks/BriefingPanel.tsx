"use client"

import React, { useState, useCallback, useMemo, useRef } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import debounce from 'lodash.debounce'
import { Button } from '../../app/components/ui/button'
import { Badge } from '../../app/components/ui/badge'
import { Input } from '../../app/components/ui/input'
import { Textarea } from '../../app/components/ui/textarea'
import { Checkbox } from '../../app/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../app/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../../app/components/ui/dialog'
import { RichTextEditor } from '../../app/components/ui/rich-text-editor'
import { toast } from '../../app/components/ui/use-toast'
import { GripVertical, Edit3, Check, X, Save, Settings, Maximize2, Wand2, Clock, Plus, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { ProjectBriefingsPanel } from '../projects/ProjectSettings/ProjectBriefingsPanel'
import { useBriefingTypesForCtt, useBriefingComponentsForCtt, useBriefingActions, BriefingType, BriefingComponent } from './hooks/use-briefing-types'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useCTTVariantSEO } from './hooks/use-ctt-variant-seo'
import { calculateKeywordDensity, getDensityColor, needsImprovement, extractPlainText } from './utils/keyword-density'

interface BriefingPanelProps {
  cttId: string | null
  projectId?: number
  activeVariation?: { channelId: number | null, languageId: number } | null
  onBriefingTypeChange?: (briefingTypeId: number | null) => void
  onContentDataChange?: (contentData: {
    final_output_text: string | null
    updated_at: string | null
    final_language_code: string | null
  } | null) => void
}

interface SortableComponentItemProps {
  component: BriefingComponent
  onToggle: (componentId: number, selected: boolean) => void
  onEditCustom: (componentId: number, customTitle: string, customDescription: string) => void
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  cttId: string | null
  activeVariation?: { channelId: number | null, languageId: number } | null
  onBuildWithAI?: (cttId: string, componentId: number) => void
  onOpenFullPage?: (component: BriefingComponent) => void
}

function SortableComponentItem({ 
  component, 
  onToggle, 
  onEditCustom, 
  isEditing, 
  onStartEdit, 
  onCancelEdit,
  cttId,
  activeVariation,
  onBuildWithAI,
  onOpenFullPage
}: SortableComponentItemProps) {
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
  const [showFullPage, setShowFullPage] = useState(false)
  const [isLoadingContent, setIsLoadingContent] = useState(false)
  
  const supabase = createClientComponentClient()
  
  // Fetch SEO keywords for the active variation
  const { data: seoData } = useCTTVariantSEO(
    cttId,
    activeVariation?.channelId ?? null,
    activeVariation?.languageId ?? null
  )
  
  // Calculate keyword densities
  const plainText = React.useMemo(() => extractPlainText(contentText), [contentText])
  const primaryKeyword = (seoData as any)?.primary_keyword || ''
  const secondaryKeywords = React.useMemo(() => {
    const secondary = (seoData as any)?.secondary_keywords
    if (!secondary) return []
    if (Array.isArray(secondary)) {
      return secondary.filter((k: string) => k && k.trim())
    }
    if (typeof secondary === 'string') {
      return secondary.split(',').map((k: string) => k.trim()).filter((k: string) => k)
    }
    return []
  }, [(seoData as any)?.secondary_keywords])
  
  const primaryDensity = React.useMemo(() => 
    calculateKeywordDensity(plainText, primaryKeyword), 
    [plainText, primaryKeyword]
  )
  
  const secondaryDensities = React.useMemo(() => 
    secondaryKeywords.map((keyword: string) => ({
      keyword,
      density: calculateKeywordDensity(plainText, keyword)
    })),
    [plainText, secondaryKeywords]
  )
  
  const hasDensityIssues = React.useMemo(() => {
    if (primaryKeyword && needsImprovement(primaryDensity)) return true
    return secondaryDensities.some((d: { keyword: string; density: number }) => needsImprovement(d.density))
  }, [primaryKeyword, primaryDensity, secondaryDensities])

  // Debug: Log activeVariation changes
  React.useEffect(() => {
    console.log('SortableComponentItem: activeVariation changed', { 
      activeVariation, 
      componentId: component.component_id,
      cttId 
    })
  }, [activeVariation, component.component_id, cttId])

  // Load component output when expanded or active variation changes
  React.useEffect(() => {
    const loadComponentOutput = async () => {
      if (!cttId || !activeVariation || !isExpanded) return

      setIsLoadingContent(true)
      try {
        // Build query matching the exact SQL:
        // WHERE ctt_id = :ctt_id
        // AND briefing_component_id = :component_id
        // AND channel_id IS NOT DISTINCT FROM :channel_id
        // AND language_id = :language_id
        let query = supabase
          .from('content_types_tasks_component_outputs')
          .select('content_text, content_html, status, updated_at')
          .eq('ctt_id', cttId)
          .eq('briefing_component_id', component.component_id)
          .eq('language_id', activeVariation.languageId)

        // Handle channel_id IS NOT DISTINCT FROM (NULL-safe comparison)
        if (activeVariation.channelId === null) {
          query = query.is('channel_id', null)
        } else {
          query = query.eq('channel_id', activeVariation.channelId)
        }

        const { data, error } = await query.maybeSingle()

        if (error) {
          console.error('Failed to load component output - query error:', error)
          throw error
        }

        console.log('Loaded component output:', {
          cttId,
          componentId: component.component_id,
          channelId: activeVariation.channelId,
          languageId: activeVariation.languageId,
          hasData: !!data,
          contentLength: data?.content_text?.length || data?.content_html?.length || 0
        })

        if (data) {
          // Prefer content_html if available, fallback to content_text
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
  }, [cttId, component.component_id, activeVariation, isExpanded, supabase])

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
      if (!cttId) {
        console.warn('Cannot save: no cttId')
        return
      }
      if (!activeVariation) {
        console.warn('Cannot save: no active variation', { cttId, componentId: component.component_id })
        return
      }
      
      // Extract plain text from HTML for p_text
      const plainText = extractPlainText(html)
      
      console.log('Saving component output:', {
        cttId,
        componentId: component.component_id,
        channelId: activeVariation.channelId,
        languageId: activeVariation.languageId,
        textLength: plainText.length,
        htmlLength: html.length
      })
      
      setIsSaving(true)
      try {
        const { error } = await supabase.rpc('ctt_set_component_output', {
          p_ctt_id: cttId,
          p_component_id: component.component_id,
          p_channel_id: activeVariation.channelId,
          p_language_id: activeVariation.languageId,
          p_text: plainText,
          p_html: html
        })
        
        if (error) {
          console.error('RPC error:', error)
          throw error
        }
        
        setLastUpdated(new Date().toLocaleString())
        // Don't show toast for every autosave to avoid spam
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
    [cttId, component.component_id, activeVariation, supabase]
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

  const handleSave = () => {
    onEditCustom(component.component_id, customTitle, customDescription)
    onCancelEdit()
  }

  const handleContentChange = (content: string) => {
    console.log('handleContentChange called:', { 
      contentLength: content.length, 
      hasActiveVariation: !!activeVariation,
      componentId: component.component_id,
      cttId 
    })
    setContentText(content)
    // RichTextEditor returns HTML content, pass it to debounced save
    if (activeVariation) {
      debouncedSaveContent(content)
    } else {
      console.warn('handleContentChange: No active variation, cannot save', { cttId, componentId: component.component_id })
    }
  }

  const handleBuildWithAI = async () => {
    if (!cttId || !onBuildWithAI) return
    
    try {
      await onBuildWithAI(cttId, component.component_id)
    } catch (error) {
      console.error('Failed to build with AI:', error)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-3 p-2 border rounded-lg bg-white ${
        isDragging ? 'opacity-50' : ''
      } border-gray-200`}
    >
      {/* Drag handle and checkbox aligned with title */}
      <div className="flex items-center gap-2">
        {/* Drag handle - only show for selected items */}
        {component.selected && (
          <div
            {...attributes}
            {...listeners}
            className="flex items-center justify-center w-5 h-5 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="w-4 h-4" />
          </div>
        )}

        {/* Checkbox */}
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
                onClick={handleSave}
                className="text-green-600 hover:text-green-700"
              >
                <Save className="w-3 h-3 mr-1" />
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onCancelEdit}
                className="text-gray-600"
              >
                <X className="w-3 h-3 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Component header with title */}
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Input
                    value={customTitle || component.component_title}
                    onChange={(e) => handleCustomTitleChange(e.target.value)}
                    className="font-medium text-gray-900 border-none p-0 h-auto focus:ring-0 focus:border-none"
                    placeholder="Component title"
                  />
                  {/* Show Project badge for project components (negative component_id) */}
                  {component.component_id < 0 && (
                    <Badge variant="outline" className="text-xs">
                      Project
                    </Badge>
                  )}
                  {/* Primary keyword density - show in header */}
                  {primaryKeyword && plainText && isExpanded && (
                    <span className={`text-xs ${getDensityColor(primaryDensity).color}`}>
                      {primaryKeyword}: {primaryDensity.toFixed(1)}%
                    </span>
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
                {isExpanded && (
                  <>
                    {/* Build with AI - only shown when expanded */}
                    <button
                      onClick={handleBuildWithAI}
                      className="text-gray-600 hover:text-purple-600 text-sm px-2 py-1 rounded hover:bg-purple-50"
                    >
                      Build with AI
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onOpenFullPage?.(component)}
                      className="text-gray-600 hover:text-gray-700 p-1 h-6"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            
            {/* Content area - shown when expanded */}
            {isExpanded && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {!activeVariation && (
                      <div className="flex items-center gap-1 text-xs text-yellow-600">
                        <span>⚠️ Select a variation (channel + language) to save content</span>
                      </div>
                    )}
                    {isSaving && (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3 animate-spin" />
                        Saving...
                      </div>
                    )}
                    {!isSaving && lastUpdated && activeVariation && (
                      <div className="flex items-center gap-1 text-xs text-green-600">
                        <span>✓ Saved {lastUpdated}</span>
                      </div>
                    )}
                  </div>
                </div>
                {/* Description - inline only when expanded */}
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
                  <RichTextEditor
                    value={contentText}
                    onChange={handleContentChange}
                    readOnly={false}
                    toolbarId={`ql-toolbar-component-${component.component_id}`}
                    placeholder={`Start writing content for ${customTitle || component.component_title}...`}
                    height={250}
                  />
                </div>
                
                {/* Keyword Density Panel */}
                {(primaryKeyword || secondaryKeywords.length > 0) && plainText && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-gray-700">Keyword density</h4>
                      {hasDensityIssues && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            // TODO: Send to AI chat edge function
                            toast({
                              title: "Improve with AI",
                              description: "This feature will optimize keyword densities using AI.",
                            })
                          }}
                          className="text-xs"
                        >
                          <Wand2 className="w-3 h-3 mr-1" />
                          Improve with AI
                        </Button>
                      )}
                    </div>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <tbody className="divide-y">
                          {primaryKeyword && (
                            <tr>
                              <td className="px-3 py-2 text-left">{primaryKeyword}</td>
                              <td className={`px-3 py-2 text-right font-medium ${getDensityColor(primaryDensity).color}`}>
                                {primaryDensity.toFixed(1)}%
                              </td>
                            </tr>
                          )}
                          {secondaryDensities.map((item: { keyword: string; density: number }, idx: number) => (
                            <tr key={idx}>
                              <td className="px-3 py-2 text-left">{item.keyword}</td>
                              <td className={`px-3 py-2 text-right font-medium ${getDensityColor(item.density).color}`}>
                                {item.density.toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Full-page component editor
function FullPageComponentEditor({ 
  component, 
  onClose, 
  onBuildWithAI 
}: { 
  component: BriefingComponent
  onClose: () => void
  onBuildWithAI: (componentId: number) => Promise<void>
}) {
  const [contentText, setContentText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  
  const supabase = createClientComponentClient()

  // Debounced save for content
  const debouncedSaveContent = useMemo(
    () => debounce(async (text: string) => {
      if (!component.component_id) return
      
      setIsSaving(true)
      try {
        const { error } = await supabase.rpc('ctt_set_component_content', {
          p_ctt_id: component.component_id,
          p_component_id: component.component_id,
          p_text: text
        })
        
        if (error) throw error
        
        setLastUpdated(new Date().toLocaleTimeString())
      } catch (error) {
        console.error('Failed to save content:', error)
        toast({
          title: "Error",
          description: "Failed to save content",
          variant: "destructive",
        })
      } finally {
        setIsSaving(false)
      }
    }, 700),
    [component.component_id, supabase]
  )

  const handleContentChange = useCallback((content: string) => {
    setContentText(content)
    debouncedSaveContent(content)
  }, [debouncedSaveContent])

  const handleBuildWithAI = useCallback(async () => {
    try {
      await onBuildWithAI(component.component_id)
      setLastUpdated(new Date().toLocaleTimeString())
    } catch (error) {
      console.error('Failed to build with AI:', error)
    }
  }, [component.component_id, onBuildWithAI])

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">
              {component.custom_title || component.component_title}
            </h1>
            {component.component_id < 0 && (
              <Badge variant="outline" className="text-xs">
                Project
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBuildWithAI}
              className="px-3 py-1 text-sm text-purple-600 hover:bg-purple-50 rounded"
            >
              Build with AI
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        {component.custom_description && (
          <p className="text-sm text-gray-600 mt-2">
            {component.custom_description}
          </p>
        )}
        {lastUpdated && (
          <div className="text-xs text-gray-400 mt-1">
            Last saved: {lastUpdated}
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 p-4">
        <div className="max-w-4xl mx-auto">
          <RichTextEditor
            value={contentText}
            onChange={handleContentChange}
            readOnly={false}
            toolbarId={`ql-toolbar-fullpage-${component.component_id}`}
            placeholder={`Start writing content for ${component.custom_title || component.component_title}...`}
            height={600}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isSaving && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="w-3 h-3 animate-spin" />
                Saving...
              </div>
            )}
          </div>
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

function AddProjectComponentRow({ projectId, briefingTypeId, onAdded, onOptimisticAdd }: { projectId: number, briefingTypeId: number, onAdded: () => Promise<void>, onOptimisticAdd: (comp: { component_id: number, component_title: string, custom_title?: string, custom_description?: string }) => void }) {
  const supabase = createClientComponentClient()
  const [isEditing, setIsEditing] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  const handleSubmit = async () => {
    if (!title.trim()) return
    setSubmitting(true)
    try {
      const { data: created, error: createErr } = await supabase.rpc('create_project_component', {
        p_project_id: projectId,
        p_title: title,
        p_description: description || null
      })
      if (createErr) throw createErr

      const projectComponentId = created?.project_component_id || created?.id || created
      if (!projectComponentId) throw new Error('Missing project_component_id')

      // Optimistic add to the components list
      onOptimisticAdd({
        component_id: Number(projectComponentId),
        component_title: title,
        custom_title: title,
        custom_description: description || ''
      })

      const { error: addErr } = await supabase.rpc('add_component_to_project_briefing', {
        p_project_id: projectId,
        p_briefing_type_id: briefingTypeId,
        p_project_component_id: projectComponentId,
        p_include: true,
        p_position: null,
        // include title/description so PBTC row or linkage can capture labels
        p_custom_title: title,
        p_custom_description: description || null
      })
      if (addErr) throw addErr

      await onAdded()
      setIsEditing(false)
      setTitle('')
      setDescription('')
    } catch (e) {
      console.error('Failed to add project component:', e)
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

export const BriefingPanel = React.memo(function BriefingPanel({ cttId, projectId, activeVariation, onBriefingTypeChange, onContentDataChange }: BriefingPanelProps) {
  console.log('🔍 BriefingPanel: rendered with cttId:', cttId, 'projectId:', projectId, 'activeVariation:', activeVariation)
  const [selectedBriefingType, setSelectedBriefingType] = useState<number | null>(null)
  const [editingComponent, setEditingComponent] = useState<number | null>(null)
  const [optimisticComponents, setOptimisticComponents] = useState<BriefingComponent[]>([])
  const [isManageModalOpen, setIsManageModalOpen] = useState(false)
  const [fullPageComponent, setFullPageComponent] = useState<BriefingComponent | null>(null)
  
  const supabase = createClientComponentClient()

  const { items: briefingTypes, selectedId, suggestedDefault, contentData, loading: typesLoading, error: typesError, refresh: refreshTypes } = useBriefingTypesForCtt(cttId)
  const { items: components, loading: componentsLoading, error: componentsError, refresh: refreshComponents } = useBriefingComponentsForCtt(cttId, !!selectedId)

  // Pass content data to parent component
  React.useEffect(() => {
    if (onContentDataChange) {
      onContentDataChange(contentData)
    }
  }, [contentData, onContentDataChange])
  const { setBriefingType, toggleComponent, reorderComponents } = useBriefingActions()

  // Handle build with AI for component
  const handleBuildWithAI = useCallback(async (cttId: string, componentId: number) => {
    // Note: This is the legacy briefing panel that uses a different structure (ctt_id)
    // For now, we'll keep the old implementation
    // TODO: Migrate this to use the new AI chat system when briefing panel is refactored
    try {
      // Call the existing Edge Function with the component scope
      const { data, error } = await supabase.functions.invoke('ai-build-content', {
        body: {
          cttId,
          componentId,
          scope: 'component'
        }
      })
      
      if (error) throw error
      
      // Save the result via the same RPC
      if (data?.content) {
        const { error: saveError } = await supabase.rpc('ctt_set_component_content', {
          p_ctt_id: cttId,
          p_component_id: componentId,
          p_text: data.content
        })
        
        if (saveError) throw saveError
        
        toast({
          title: "AI content generated",
          description: "Content has been generated and saved for this component.",
        })
      }
    } catch (error: any) {
      console.error('Failed to build with AI:', error)
      toast({
        title: "AI build failed",
        description: error.message,
        variant: "destructive",
      })
    }
  }, [supabase])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Use optimistic components if available, otherwise use real components
  const displayComponents = optimisticComponents.length > 0 ? optimisticComponents : components
  
  // Debug logging
  console.log('BriefingPanel render:', {
    optimisticComponents: optimisticComponents.length,
    realComponents: components.length,
    displayComponents: displayComponents.length,
    selectedId
  })

  // Initialize selected briefing type - only when selectedId changes and is different from current
  React.useEffect(() => {
    if (selectedId !== null && selectedBriefingType !== selectedId) {
      setSelectedBriefingType(selectedId)
      onBriefingTypeChange?.(selectedId)
    }
  }, [selectedId]) // Remove selectedBriefingType and onBriefingTypeChange from dependencies

  const handleBriefingTypeChange = useCallback(async (briefingTypeId: string) => {
    if (!cttId) return

    const typeId = parseInt(briefingTypeId)
    
    // Only proceed if the briefing type is actually changing
    if (typeId === selectedBriefingType) return
    
    setSelectedBriefingType(typeId)
    onBriefingTypeChange?.(typeId)

    try {
      const result = await setBriefingType(cttId, typeId)
      if (!result.success) {
        throw new Error(result.error)
      }

      // Only refresh components when briefing type actually changes
      // This will fetch the new template components
      await refreshComponents()
      // Don't clear optimistic state here - let it persist for reordering

      toast({
        title: "Briefing type updated",
        description: "Components have been refreshed for the new briefing type.",
      })
    } catch (error: any) {
      console.error('Failed to set briefing type:', error)
      toast({
        title: "Failed to update briefing type",
        description: error.message,
        variant: "destructive",
      })
      // Revert optimistic change
      setSelectedBriefingType(selectedId)
      onBriefingTypeChange?.(selectedId)
    }
  }, [cttId, setBriefingType, refreshComponents, selectedId, selectedBriefingType, onBriefingTypeChange])

  // Auto-apply fallback template when PBTC is empty and nothing selected
  React.useEffect(() => {
    const maybeApplyFallback = async () => {
      if (!cttId || !projectId || !selectedId) return
      if (componentsLoading) return
      const anySelected = displayComponents.some(c => c.selected)
      if (anySelected) return
      try {
        // Apply global standard template to project if PBTC is empty. RPC should be idempotent.
        const { error } = await supabase.rpc('use_global_template_for_project_briefing', {
          p_project_id: projectId,
          p_briefing_type_id: selectedId,
        })
        if (error) {
          // If the RPC errors because PBTC isn't empty, ignore.
          console.warn('use_global_template_for_project_briefing warning:', error)
        }
        await refreshComponents()
      } catch (e) {
        console.error('Failed to apply fallback template:', e)
      }
    }
    maybeApplyFallback()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cttId, projectId, selectedId, componentsLoading, displayComponents])

  const handleToggleComponent = useCallback(async (componentId: number, selected: boolean) => {
    if (!cttId) return

    // Store the original state for potential rollback
    const originalComponents = displayComponents

    // Optimistic update
    setOptimisticComponents(prev => {
      if (prev.length === 0) {
        // If no optimistic state, start with current components
        const currentComponents = displayComponents
        return currentComponents.map(comp => 
          comp.component_id === componentId 
            ? { ...comp, selected, position: selected ? (currentComponents.filter(c => c.selected).length + 1) : null }
            : comp
        )
      } else {
        // Update existing optimistic state
        return prev.map(comp => 
          comp.component_id === componentId 
            ? { ...comp, selected, position: selected ? (prev.filter(c => c.selected).length + 1) : null }
            : comp
        )
      }
    })

    try {
      // Detect component type: negative ID = project component, positive = global
      const isProjectComponent = componentId < 0
      
      const result = await toggleComponent(cttId, componentId, selected, isProjectComponent)
      if (!result.success) {
        throw new Error(result.error)
      }

      // Keep optimistic state - no need to refetch
      // The optimistic update is sufficient for UI feedback

    } catch (error: any) {
      console.error('Failed to toggle component:', error)
      toast({
        title: "Failed to update component",
        description: error.message,
        variant: "destructive",
      })
      // Revert optimistic change by clearing it and letting real components show
      setOptimisticComponents([])
    }
  }, [cttId, toggleComponent, displayComponents])

  const handleEditCustom = useCallback(async (componentId: number, customTitle: string, customDescription: string) => {
    if (!cttId) return

    try {
      const result = await toggleComponent(cttId, componentId, true, componentId < 0, undefined, customTitle, customDescription)
      if (!result.success) {
        throw new Error(result.error)
      }

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
    }
  }, [cttId, toggleComponent])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id || !cttId) return

    const selectedComponents = displayComponents.filter(c => c.selected)
    const oldIndex = selectedComponents.findIndex(c => c.component_id === active.id)
    const newIndex = selectedComponents.findIndex(c => c.component_id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const reorderedComponents = arrayMove(selectedComponents, oldIndex, newIndex)

    // Compute new positions 1..n for selected items
    const idToNewPos = new Map<number, number>()
    reorderedComponents.forEach((comp, idx) => {
      idToNewPos.set(comp.component_id, idx + 1)
    })

    // Create the new optimistic state with updated positions
    const newOptimisticState = displayComponents.map(comp => (
      comp.selected && idToNewPos.has(comp.component_id)
        ? { ...comp, position: idToNewPos.get(comp.component_id)! }
        : comp
    ))
    
    // Set optimistic state
    console.log('Setting optimistic state:', newOptimisticState)
    setOptimisticComponents(newOptimisticState)

    try {
      const orderArray = reorderedComponents.map((comp, index) => {
        const isProjectComponent = comp.component_id < 0
        return {
          briefing_component_id: isProjectComponent ? null : comp.component_id,
          project_component_id: isProjectComponent ? Math.abs(comp.component_id) : null,
          position: index + 1
        }
      })

      console.log('Reordering components with order array:', orderArray)
      const result = await reorderComponents(cttId, orderArray)
      if (!result.success) {
        throw new Error(result.error)
      }

      console.log('Reorder successful, keeping optimistic state')
      // Keep optimistic state - no need to refetch
      // The optimistic update is sufficient for UI feedback

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
  }, [cttId, displayComponents, reorderComponents])

  // Always render selected components ordered by their current position so
  // optimistic position updates are reflected immediately after DnD
  const selectedComponents = displayComponents
    .filter(c => c.selected)
    .slice()
    .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER))
  const unselectedComponents = displayComponents.filter(c => !c.selected)

  if (!cttId) {
    return (
      <div className="p-4 text-center text-gray-500">
        No content type selected. Please select a content type to configure briefing.
      </div>
    )
  }

  if (typesError || componentsError) {
    return (
      <div className="p-4 text-center text-red-500">
        <div className="text-sm font-medium">Error loading briefing data</div>
        <div className="text-xs mt-1">{typesError || componentsError}</div>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={() => {
            refreshTypes()
            refreshComponents()
          }}
          className="mt-2"
        >
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Briefing Type Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Briefing Type</label>
        {typesLoading ? (
          <div className="text-sm text-gray-500">Loading briefing types...</div>
        ) : briefingTypes.length === 0 ? (
          <div className="text-sm text-gray-500">
            No briefing types configured for this project.
            {projectId && (
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    // Navigate to project settings or open project detail panel
                    // This would need to be implemented based on your routing structure
                    toast({
                      title: "Manage Project Briefings",
                      description: "Open the project detail panel to manage briefing types for this project.",
                    })
                  }}
                  className="text-blue-600 border-blue-200 hover:bg-blue-50"
                >
                  <Settings className="w-3 h-3 mr-1" />
                  Manage briefings
                </Button>
              </div>
            )}
          </div>
        ) : (
          <Select
            value={selectedBriefingType?.toString() || ''}
            onValueChange={(value) => {
              if (value === 'manage-briefings') {
                // Open the manage briefings modal
                setIsManageModalOpen(true)
              } else {
                handleBriefingTypeChange(value)
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a briefing type" />
            </SelectTrigger>
            <SelectContent>
            {briefingTypes.map((type) => (
              <SelectItem key={type.briefing_type_id} value={type.briefing_type_id.toString()}>
                <div className="flex items-center gap-2">
                  <span>{type.title}</span>
                  {type.is_default && (
                    <Badge variant="outline" className="text-xs">
                      Default
                    </Badge>
                  )}
                </div>
              </SelectItem>
            ))}
              {projectId && (
                <SelectItem value="manage-briefings">
                  <div className="flex items-center gap-2 text-blue-600">
                    <Settings className="w-4 h-4" />
                    <span>Manage briefings...</span>
                  </div>
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Components Section */}
      {selectedBriefingType && (
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
                          <SortableComponentItem
                            key={component.component_id}
                            component={component}
                            onToggle={handleToggleComponent}
                            onEditCustom={handleEditCustom}
                            isEditing={editingComponent === component.component_id}
                            onStartEdit={() => setEditingComponent(component.component_id)}
                            onCancelEdit={() => setEditingComponent(null)}
                            cttId={cttId}
                            activeVariation={activeVariation}
                            onBuildWithAI={handleBuildWithAI}
                            onOpenFullPage={setFullPageComponent}
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
                        <SortableComponentItem
                          key={component.component_id}
                          component={component}
                          onToggle={handleToggleComponent}
                          onEditCustom={handleEditCustom}
                          isEditing={editingComponent === component.component_id}
                          onStartEdit={() => setEditingComponent(component.component_id)}
                          onCancelEdit={() => setEditingComponent(null)}
                          cttId={cttId}
                          activeVariation={activeVariation}
                          onBuildWithAI={handleBuildWithAI}
                          onOpenFullPage={setFullPageComponent}
                        />
                      ))}
                    </div>
                  </div>
                )}

              {/* Add project component as a discreet row */}
              {projectId && selectedId && (
                <AddProjectComponentRow
                  projectId={projectId}
                  briefingTypeId={selectedId}
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
      )}

      {/* Manage Briefings Modal */}
      {projectId && (
        <Dialog open={isManageModalOpen} onOpenChange={setIsManageModalOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Manage Project Briefings</DialogTitle>
            </DialogHeader>
            <div className="w-full">
              <ProjectBriefingsPanel 
                projectId={projectId}
                onBriefingTypesChanged={() => {
                  // Refresh briefing types when changes are made
                  refreshTypes()
                }}
              />
            </div>
            <DialogFooter className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => setIsManageModalOpen(false)}
                className="px-6"
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  // TODO: Implement Build with AI functionality
                  console.log('Build with AI clicked')
                }}
                className="px-6 bg-black text-white hover:bg-gray-800"
              >
                Build with AI
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Full-page component editor */}
      {fullPageComponent && (
        <FullPageComponentEditor
          component={fullPageComponent}
          onClose={() => setFullPageComponent(null)}
          onBuildWithAI={(componentId) => handleBuildWithAI(cttId, componentId)}
        />
      )}
    </div>
  )
}, (prevProps, nextProps) => {
  // Re-render if cttId, projectId, or activeVariation changes
  const cttIdChanged = prevProps.cttId !== nextProps.cttId
  const projectIdChanged = prevProps.projectId !== nextProps.projectId
  const activeVariationChanged = 
    prevProps.activeVariation?.channelId !== nextProps.activeVariation?.channelId ||
    prevProps.activeVariation?.languageId !== nextProps.activeVariation?.languageId
  
  // Return true if props are the same (don't re-render), false if different (re-render)
  return !cttIdChanged && !projectIdChanged && !activeVariationChanged
})
