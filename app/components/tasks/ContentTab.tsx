"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { RichTextEditor } from "../ui/rich-text-editor"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog"
import { 
  X, 
  Maximize2, 
  ChevronDown, 
  Plus,
  Wand2,
  GripVertical,
  Eye,
  Loader2,
  MoreHorizontal,
  CheckCircle2
} from "lucide-react"
import { toast } from "../ui/use-toast"
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

interface ContentTabProps {
  taskId: number
  projectId?: number
  onBuildWithAI?: (contentTypeTitle: string, taskId: number, cttId: string, componentId?: number, channelId?: number | null, languageId?: number) => void
}

interface ContentTypeForTask {
  content_type_id: number
  content_type_title: string
  assigned: boolean
  ctt_id: string | null
  is_primary: boolean
  has_final_output: boolean
}

interface BriefingComponent {
  component_id: number
  component_title: string
  selected: boolean
  position: number | null
  custom_title: string | null
  custom_description: string | null
  // For project components, component_id will be negative
  // For global components, component_id will be positive
}

interface Channel {
  id: number
  name: string
}

interface Language {
  language_id: number
  code: string
  long_name: string
  selected: boolean
}

interface ComponentOutput {
  content_text: string | null
  content_html: string | null
  status: string | null
  updated_at: string | null
}

// Debounced save function
function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null)

  return useCallback(
    ((...args: Parameters<T>) => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      setDebounceTimer(
        setTimeout(() => {
          callback(...args)
        }, delay)
      )
    }) as T,
    [callback, delay, debounceTimer]
  )
}

// Component Item with Output
function ComponentItem({
  component,
  cttId,
  channelId,
  languageId,
  onTitleChange,
  onDescriptionChange,
  onContentChange,
  onRemove,
  onAIBuild,
  onToggleExpanded,
  isExpanded,
  currentContent,
  isLoadingContent
}: {
  component: BriefingComponent
  cttId: string
  channelId: number | null
  languageId: number
  onTitleChange: (componentId: number, title: string) => void
  onDescriptionChange: (componentId: number, description: string) => void
  onContentChange: (componentId: number, content: string) => void
  onRemove: (componentId: number) => void
  onAIBuild: (componentId: number) => void
  onToggleExpanded: (componentId: number) => void
  isExpanded: boolean
  currentContent: string | null
  isLoadingContent: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: component.component_id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  const [localTitle, setLocalTitle] = useState(component.custom_title || component.component_title)
  const [localDescription, setLocalDescription] = useState(component.custom_description || '')
  const [lastSaved, setLastSaved] = useState<string | null>(null)

  useEffect(() => {
    setLocalTitle(component.custom_title || component.component_title)
    setLocalDescription(component.custom_description || '')
  }, [component])

  // Track when content is saved
  const handleContentChange = (content: string) => {
    onContentChange(component.component_id, content)
    setLastSaved(new Date().toLocaleTimeString())
  }

  return (
    <div ref={setNodeRef} style={style} className="border rounded-lg p-4 bg-white border-gray-200">
      <div className="flex items-start gap-3">
        {/* Drag handle and checkbox aligned with title */}
        <div className="flex items-center gap-2">
          <div {...attributes} {...listeners} className="cursor-move p-1 hover:bg-gray-100 rounded">
            <GripVertical className="w-4 h-4 text-gray-400" />
          </div>
          <input
            type="checkbox"
            checked={component.selected}
            onChange={() => {}}
            className="w-4 h-4"
          />
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {/* Component header with title, controls, and Build with AI */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Input
                  value={localTitle || component.component_title}
                  onChange={(e) => {
                    setLocalTitle(e.target.value)
                    onTitleChange(component.component_id, e.target.value)
                  }}
                  placeholder="Component title"
                  className="text-sm font-semibold border-none p-0 h-auto focus:ring-0 focus:border-none"
                />
                {component.component_id < 0 && (
                  <Badge variant="outline" className="text-xs">Project</Badge>
                )}
                <button
                  onClick={() => onAIBuild(component.component_id)}
                  className="text-gray-600 hover:text-purple-600 text-sm"
                >
                  Build with AI
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {lastSaved && (
                <div className="text-xs text-gray-400">Last saved: {lastSaved}</div>
              )}
              <button
                onClick={() => onRemove(component.component_id)}
                className="p-1 text-red-500 hover:bg-red-50 rounded"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={() => onToggleExpanded(component.component_id)}
                className="p-1 text-gray-500 hover:bg-gray-100 rounded"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Description only when expanded */}
          {isExpanded && (
            <Input
              value={localDescription || component.custom_description || ''}
              onChange={(e) => {
                setLocalDescription(e.target.value)
                onDescriptionChange(component.component_id, e.target.value)
              }}
              placeholder="Component description (optional)"
              className="mb-2 text-sm text-gray-600 border-none p-0 h-auto focus:ring-0 focus:border-none"
            />
          )}

          {/* Content area - click to expand */}
          {isExpanded && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {isLoadingContent && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading...
                    </div>
                  )}
                </div>
              </div>
              
              {isLoadingContent ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span className="text-sm text-gray-500">Loading content...</span>
                </div>
              ) : (
                <div className="max-h-[300px] overflow-y-auto">
                  <RichTextEditor
                    value={currentContent || ''}
                    onChange={handleContentChange}
                    placeholder="Start writing content..."
                    height={250}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ContentTab({ taskId, projectId, onBuildWithAI }: ContentTabProps) {
  const supabase = createClientComponentClient()
  
  // State
  const [contentTypes, setContentTypes] = useState<ContentTypeForTask[]>([])
  const [activeCttId, setActiveCttId] = useState<string | null>(null)
  const [briefingTypes, setBriefingTypes] = useState<Array<{ briefing_type_id: number; title: string; description: string; is_default: boolean; position: number | null }>>([])
  const [selectedBriefingTypeId, setSelectedBriefingTypeId] = useState<number | null>(null)
  const [components, setComponents] = useState<BriefingComponent[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [languages, setLanguages] = useState<Language[]>([])
  const [currentChannelId, setCurrentChannelId] = useState<number | null>(null)
  const [currentLanguageId, setCurrentLanguageId] = useState<number | null>(null)
  const [expandedComponents, setExpandedComponents] = useState<Set<number>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [progressExpanded, setProgressExpanded] = useState(false)
  const [seoExpanded, setSeoExpanded] = useState(false)
  const [progressData, setProgressData] = useState<any[]>([])
  const [seoData, setSeoData] = useState<{ primary_keyword: string | null; secondary_keywords: string | null } | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [composedOutput, setComposedOutput] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Debounced save functions
  const debouncedSaveComponent = useDebounce(async (cttId: string, componentId: number, selected: boolean, position?: number | null, customTitle?: string | null, customDescription?: string | null) => {
    try {
      // Detect component type: negative ID = project component, positive = global
      const isProjectComponent = componentId < 0
      
      const { error } = await supabase.rpc('ctt_set_component', {
        p_ctt_id: cttId,
        p_component_id: isProjectComponent ? null : componentId,
        p_project_component_id: isProjectComponent ? Math.abs(componentId) : null,
        p_selected: selected,
        p_position: position,
        p_custom_title: customTitle,
        p_custom_description: customDescription
      })
      if (error) throw error
    } catch (error) {
      console.error('Failed to save component:', error)
      toast({
        title: "Error",
        description: "Failed to save component changes",
        variant: "destructive",
      })
    }
  }, 700)

  const debouncedSaveOutput = useDebounce(async (cttId: string, componentId: number, channelId: number | null, languageId: number, text: string, html: string) => {
    try {
      const { error } = await supabase.rpc('ctt_set_component_output', {
        p_ctt_id: cttId,
        p_component_id: componentId,
        p_channel_id: channelId,
        p_language_id: languageId,
        p_text: text,
        p_html: html
      })
      if (error) throw error
    } catch (error) {
      console.error('Failed to save component output:', error)
      toast({
        title: "Error",
        description: "Failed to save content",
        variant: "destructive",
      })
    }
  }, 600)

  const debouncedSaveSEO = useDebounce(async (cttId: string, channelId: number | null, languageId: number, primaryKeyword: string, secondaryKeywords: string) => {
    try {
      // Ensure variant exists first
      await supabase
        .from('content_types_tasks_variants')
        .upsert({
          ctt_id: cttId,
          channel_id: channelId,
          language_id: languageId,
          primary_keyword: primaryKeyword,
          secondary_keywords: secondaryKeywords
        })
    } catch (error) {
      console.error('Failed to save SEO:', error)
      toast({
        title: "Error",
        description: "Failed to save SEO data",
        variant: "destructive",
      })
    }
  }, 800)

  // Individual fetch functions for updates (not initialization)
  const fetchComponents = useCallback(async (cttId: string) => {
    try {
      const { data, error } = await supabase.rpc('briefing_components_for_ctt', {
        p_ctt_id: cttId
      })
      
      if (error) throw error
      setComponents(data || [])
    } catch (error) {
      console.error('Failed to fetch components:', error)
      setComponents([])
    }
  }, [supabase])

  // Ensure variant exists
  const ensureVariant = useCallback(async (cttId: string, channelId: number | null, languageId: number) => {
    try {
      await supabase
        .from('content_types_tasks_variants')
        .insert({
          ctt_id: cttId,
          channel_id: channelId,
          language_id: languageId
        })
        .select()
    } catch (error) {
      // Ignore conflict errors (variant already exists)
      if (error && typeof error === 'object' && 'code' in error && error.code !== '23505') {
        console.error('Failed to ensure variant:', error)
      }
    }
  }, [supabase])

  // Initialize data following the exact sequence
  useEffect(() => {
    const initializeData = async () => {
      setIsLoading(true)
      
      try {
        // Step 1: CTT list → content_types_for_task
        console.log('Step 1: Fetching content types for task:', taskId)
        const { data, error } = await supabase.rpc('content_types_for_task', {
          p_task_id: taskId
        })
        
        if (error) throw error
        const contentTypesData = data || []
        console.log('Content types fetched:', contentTypesData)
        setContentTypes(contentTypesData)
        
        // Pick primary CTT (or first) as activeCttId
        const primaryCtt = contentTypesData.find((ct: any) => ct.is_primary) || contentTypesData[0]
        if (!primaryCtt?.ctt_id) {
          console.log('No CTT found, stopping loading')
          setIsLoading(false)
          return
        }
        
        const cttId = primaryCtt.ctt_id
        console.log('Step 2: Setting active CTT:', cttId)
        setActiveCttId(cttId)
        
        // Step 2: Briefing types: use data from content_types_for_task (no direct table call)
        console.log('Step 3: Using CTT meta from content_types_for_task for CTT:', cttId)
        const activeCttMeta = contentTypesData.find((ct: any) => ct.ctt_id === cttId)
        if (activeCttMeta?.briefing_type_id) {
          setSelectedBriefingTypeId(activeCttMeta.briefing_type_id)
        }

        if (activeCttMeta?.project_id_int) {
          // Q2: Get project briefing types
          const { data: briefingTypesData, error: btError } = await supabase
            .from('project_briefing_types')
            .select(`
              briefing_type_id,
              is_default,
              position,
              briefing_types!inner(title, description)
            `)
            .eq('project_id', activeCttMeta.project_id_int)
            .order('is_default', { ascending: false })
            .order('position', { ascending: true })
            .order('briefing_types.title')

          if (btError) throw btError

          const formattedTypes = briefingTypesData?.map((bt: any) => ({
            briefing_type_id: bt.briefing_type_id,
            title: bt.briefing_types?.title,
            description: bt.briefing_types?.description,
            is_default: bt.is_default,
            position: bt.position
          })) || []

          setBriefingTypes(formattedTypes)
        }

        // Step 3: Components: briefing_components_for_ctt(activeCttId)
        console.log('Step 4: Fetching components for CTT:', cttId)
        const { data: componentsData, error: componentsError } = await supabase.rpc('briefing_components_for_ctt', {
          p_ctt_id: cttId
        })
        
        if (componentsError) throw componentsError
        setComponents(componentsData || [])

        // Step 4: Channels (actuals): select from content_types_tasks_channels for this CTT
        console.log('Step 5: Fetching channels for CTT:', cttId)
        const { data: channelsData, error: channelsError } = await supabase
          .from('content_types_tasks_channels')
          .select(`
            channel_id,
            channels!inner(id, name)
          `)
          .eq('ctt_id', cttId)
          .order('channels.name')

        if (channelsError) throw channelsError

        const channelsList = channelsData?.map((item: any) => ({
          id: item.channel_id,
          name: item.channels?.name
        })) || []
        setChannels(channelsList)

        // Step 5: Languages (actuals): select from content_types_tasks_languages for this CTT
        console.log('Step 6: Fetching languages for CTT:', cttId)
        const { data: languagesData, error: languagesError } = await supabase
          .from('content_types_tasks_languages')
          .select(`
            language_id,
            languages!inner(code, long_name)
          `)
          .eq('ctt_id', cttId)
          .order('languages.code')

        let languagesList: any[] = []
        if (languagesError) {
          console.warn('Failed to fetch languages:', languagesError)
        } else {
          languagesList = languagesData?.map((item: any) => ({
            language_id: item.language_id,
            code: item.languages?.code,
            long_name: item.languages?.long_name,
            selected: true
          })) || []
        }

        // If none, default to project primary via project_languages.is_primary=true (and insert)
        if (languagesList.length === 0 && activeCttMeta?.project_id_int) {
          console.log('No languages found, fetching project primary language')
          const { data: projectLanguages, error: plError } = await supabase
            .from('project_languages')
            .select('language_id, languages!inner(code, long_name)')
            .eq('project_id', activeCttMeta.project_id_int)
            .eq('is_primary', true)
            .eq('is_deleted', false)
            .single()

          if (!plError && projectLanguages) {
            // Insert language for this CTT
            const { error: insertError } = await supabase
              .from('content_types_tasks_languages')
              .insert({
                ctt_id: cttId,
                language_id: projectLanguages.language_id
              })

            if (!insertError) {
              languagesList = [{
                language_id: (projectLanguages as any).language_id,
                code: (projectLanguages as any).languages?.code,
                long_name: (projectLanguages as any).languages?.long_name,
                selected: true
              }]
            }
          }
        }

        setLanguages(languagesList)

        // Step 6: Set current variation = {channel: first channel (or null if none), language: first language}
        const firstChannel = channelsList.length > 0 ? channelsList[0].id : null
        const firstLanguage = languagesList.length > 0 ? languagesList[0].language_id : null
        
        console.log('Step 7: Setting current variation:', { channel: firstChannel, language: firstLanguage })
        setCurrentChannelId(firstChannel)
        setCurrentLanguageId(firstLanguage)

        // Step 7: Ensure variant exists (insert on conflict do nothing)
        if (firstChannel !== null && firstLanguage !== null) {
          console.log('Step 8: Ensuring variant exists')
          try {
            await supabase
              .from('content_types_tasks_variants')
              .insert({
                ctt_id: cttId,
                channel_id: firstChannel,
                language_id: firstLanguage
              })
          } catch (variantError) {
            // Ignore conflict errors (variant already exists)
            if (variantError && typeof variantError === 'object' && 'code' in variantError && variantError.code !== '23505') {
              console.warn('Failed to ensure variant:', variantError)
            }
          }
        }

        console.log('Initialization complete')
        setIsLoading(false)
      } catch (error) {
        console.error('Failed to initialize data:', error)
        setIsLoading(false)
        toast({
          title: "Error",
          description: "Failed to load content data",
          variant: "destructive",
        })
      }
    }
    
    initializeData()
  }, [taskId, supabase, projectId])

  // Ensure variant when current variation changes (after initialization)
  useEffect(() => {
    if (activeCttId && currentChannelId !== null && currentLanguageId !== null && !isLoading) {
      ensureVariant(activeCttId, currentChannelId, currentLanguageId)
    }
  }, [activeCttId, currentChannelId, currentLanguageId, ensureVariant, isLoading])

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Get selected components
  const selectedComponents = useMemo(() => {
    return components
      .filter(comp => comp.selected)
      .sort((a, b) => {
        const posA = a.position ?? 999
        const posB = b.position ?? 999
        return posA - posB
      })
  }, [components])

  // Handle drag end
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (active.id !== over?.id && activeCttId) {
      const oldIndex = selectedComponents.findIndex(item => item.component_id === active.id)
      const newIndex = selectedComponents.findIndex(item => item.component_id === over?.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        // Optimistic update
        const newOrder = arrayMove(selectedComponents, oldIndex, newIndex)
        const orderArray = newOrder.map((comp, index) => {
          const isProjectComponent = comp.component_id < 0
          return {
            briefing_component_id: isProjectComponent ? null : comp.component_id,
            project_component_id: isProjectComponent ? Math.abs(comp.component_id) : null,
            position: index + 1
          }
        })

        try {
          const { error } = await supabase.rpc('ctt_reorder_components', {
            p_ctt_id: activeCttId,
            p_order: orderArray
          })
          if (error) throw error
          
          // Refresh components
          await fetchComponents(activeCttId)
        } catch (error) {
          console.error('Failed to reorder components:', error)
          toast({
            title: "Error",
            description: "Failed to reorder components",
            variant: "destructive",
          })
        }
      }
    }
  }

  // Handle briefing type change
  const handleBriefingTypeChange = async (briefingTypeId: number) => {
    if (!activeCttId) return

    try {
      const { error } = await supabase.rpc('ctt_set_briefing_type', {
        p_ctt_id: activeCttId,
        p_briefing_type_id: briefingTypeId
      })
      if (error) throw error

      setSelectedBriefingTypeId(briefingTypeId)
      // Refetch components
      await fetchComponents(activeCttId)
    } catch (error) {
      console.error('Failed to change briefing type:', error)
      toast({
        title: "Error",
        description: "Failed to change briefing type",
        variant: "destructive",
      })
    }
  }

  // Handle component toggle
  const handleToggleComponent = async (componentId: number, selected: boolean) => {
    if (!activeCttId) return

    const component = components.find(c => c.component_id === componentId)
    if (!component) return

    const newPosition = selected ? (selectedComponents.length + 1) : null

    // Optimistic update
    setComponents(prev => prev.map(c => 
      c.component_id === componentId 
        ? { ...c, selected, position: newPosition }
        : c
    ))

    // Save to server
    debouncedSaveComponent(activeCttId, componentId, selected, newPosition, component.custom_title, component.custom_description)
  }

  // Handle component title change
  const handleTitleChange = (componentId: number, title: string) => {
    if (!activeCttId) return

    const component = components.find(c => c.component_id === componentId)
    if (!component) return

    // Optimistic update
    setComponents(prev => prev.map(c => 
      c.component_id === componentId 
        ? { ...c, custom_title: title }
        : c
    ))

    // Save to server
    debouncedSaveComponent(activeCttId, componentId, component.selected, component.position, title, component.custom_description)
  }

  // Handle component description change
  const handleDescriptionChange = (componentId: number, description: string) => {
    if (!activeCttId) return

    const component = components.find(c => c.component_id === componentId)
    if (!component) return

    // Optimistic update
    setComponents(prev => prev.map(c => 
      c.component_id === componentId 
        ? { ...c, custom_description: description }
        : c
    ))

    // Save to server
    debouncedSaveComponent(activeCttId, componentId, component.selected, component.position, component.custom_title, description)
  }

  // Handle content change
  const handleContentChange = (componentId: number, content: string) => {
    if (!activeCttId || currentChannelId === null || currentLanguageId === null) return

    // Save to server
    debouncedSaveOutput(activeCttId, componentId, currentChannelId, currentLanguageId, content, content)
  }

  // Handle add component
  const handleAddComponent = async () => {
    if (!activeCttId) return

    const availableComponent = components.find(c => !c.selected)
    if (!availableComponent) return

    await handleToggleComponent(availableComponent.component_id, true)
  }

  // Handle progress expansion
  const handleProgressExpand = async () => {
    if (!activeCttId || progressExpanded) return

    try {
      const { data, error } = await supabase.rpc('ctt_variations_status', {
        p_ctt_id: activeCttId
      })
      if (error) throw error
      setProgressData(data || [])
      setProgressExpanded(true)
    } catch (error) {
      console.error('Failed to fetch progress:', error)
    }
  }

  // Handle SEO expansion
  const handleSEOExpand = async () => {
    if (!activeCttId || currentChannelId === null || currentLanguageId === null || seoExpanded) return

    try {
      const { data, error } = await supabase
        .from('content_types_tasks_variants')
        .select('primary_keyword, secondary_keywords')
        .eq('ctt_id', activeCttId)
        .eq('channel_id', currentChannelId)
        .eq('language_id', currentLanguageId)
        .single()

      if (error && error.code !== 'PGRST116') throw error
      setSeoData(data || { primary_keyword: null, secondary_keywords: null })
      setSeoExpanded(true)
    } catch (error) {
      console.error('Failed to fetch SEO:', error)
    }
  }

  // Handle SEO change
  const handleSEOChange = (primaryKeyword: string, secondaryKeywords: string) => {
    if (!activeCttId || currentChannelId === null || currentLanguageId === null) return

    setSeoData({ primary_keyword: primaryKeyword, secondary_keywords: secondaryKeywords })
    debouncedSaveSEO(activeCttId, currentChannelId, currentLanguageId, primaryKeyword, secondaryKeywords)
  }

  // Handle preview
  const handlePreview = async () => {
    if (!activeCttId || currentChannelId === null || currentLanguageId === null) return

    setIsPreviewOpen(true)
    setPreviewLoading(true)

    try {
      // Get composed output for each selected component
      const composedPromises = selectedComponents.map(async (component) => {
        const { data, error } = await supabase.rpc('ctt_effective_component_output', {
          p_ctt_id: activeCttId,
          p_component_id: component.component_id,
          p_channel_id: currentChannelId,
          p_language_id: currentLanguageId
        })
        if (error) throw error
        return data
      })

      const composedResults = await Promise.all(composedPromises)
      const composedText = composedResults.filter(Boolean).join('\n\n')
      setComposedOutput(composedText)
    } catch (error) {
      console.error('Failed to fetch composed output:', error)
      toast({
        title: "Error",
        description: "Failed to load preview",
        variant: "destructive",
      })
    } finally {
      setPreviewLoading(false)
    }
  }

  // Handle AI build
  const handleAIBuild = async () => {
    if (!activeCttId || currentChannelId === null || currentLanguageId === null || !onBuildWithAI) return

    const contentType = contentTypes.find(ct => ct.ctt_id === activeCttId)
    if (!contentType) return

    onBuildWithAI(contentType.content_type_title, taskId, activeCttId, undefined, currentChannelId, currentLanguageId)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span className="text-sm text-gray-500">Loading content...</span>
      </div>
    )
  }

  if (!activeCttId) {
    return (
      <div className="text-center py-8 text-gray-500">
        No content types available for this task.
      </div>
    )
  }

  const currentChannel = channels.find(ch => ch.id === currentChannelId)
  const currentLanguage = languages.find(lang => lang.language_id === currentLanguageId)
  const selectedBriefingType = briefingTypes.find(bt => bt.briefing_type_id === selectedBriefingTypeId)

  return (
    <div className="space-y-6">
      {/* Header Rows */}
      <div className="space-y-3">
        {/* Row 1: Channels, Content Types, Progress */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Channels:</span>
            <div className="flex gap-1">
              {channels.map(channel => (
                <Badge key={channel.id} variant="secondary" className="text-xs">
                  {channel.name}
                </Badge>
              ))}
              {channels.length === 0 && (
                <span className="text-xs text-gray-500">No channels</span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Content types:</span>
            <Badge variant="secondary" className="text-xs">
              {contentTypes.find(ct => ct.ctt_id === activeCttId)?.content_type_title}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Progress:</span>
            <button
              onClick={handleProgressExpand}
              className="text-sm text-red-600 hover:text-red-800 flex items-center gap-1"
            >
              {selectedComponents.length}/{components.length} <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Row 2: Briefing Type, Keyword Density */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Briefing type:</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 text-xs">
                  {selectedBriefingType?.title || 'Select'} <ChevronDown className="w-3 h-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {briefingTypes.map(bt => (
                  <DropdownMenuItem 
                    key={bt.briefing_type_id} 
                    onClick={() => handleBriefingTypeChange(bt.briefing_type_id)}
                  >
                    {bt.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Keyword density:</span>
            <button
              onClick={handleSEOExpand}
              className="text-sm text-red-600 hover:text-red-800 flex items-center gap-1"
            >
              4% <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Progress Drawer */}
      {progressExpanded && (
        <div className="p-4 border rounded-lg bg-gray-50">
          <div className="text-sm font-medium mb-2">Progress Details</div>
          {progressData.length > 0 ? (
            <div className="space-y-2">
              {progressData.map((item, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <span>{item.channel_name || 'All'} - {item.language_code}</span>
                  <Badge className={item.status === 'done' ? 'bg-green-600' : item.status === 'in_progress' ? 'bg-orange-600' : 'bg-gray-600'}>
                    {item.completed}/{item.required}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">No progress data available</div>
          )}
        </div>
      )}

      {/* SEO Drawer */}
      {seoExpanded && (
        <div className="p-4 border rounded-lg bg-gray-50">
          <div className="text-sm font-medium mb-3">SEO Keywords</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="primary-keyword" className="text-sm font-medium">Primary Keyword</Label>
              <Input
                id="primary-keyword"
                value={seoData?.primary_keyword || ''}
                onChange={(e) => handleSEOChange(e.target.value, seoData?.secondary_keywords || '')}
                placeholder="Enter primary keyword"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="secondary-keywords" className="text-sm font-medium">Secondary Keywords</Label>
              <Input
                id="secondary-keywords"
                value={seoData?.secondary_keywords || ''}
                onChange={(e) => handleSEOChange(seoData?.primary_keyword || '', e.target.value)}
                placeholder="Enter secondary keywords"
                className="mt-1"
              />
            </div>
          </div>
        </div>
      )}

      {/* Components Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium uppercase text-gray-700">COMPONENTS</div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={handlePreview}>
                  <Eye className="w-4 h-4 mr-2" />
                  Show complete content
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleAIBuild}>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Build with AI
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6">
                  {currentLanguage?.code || 'PT'} <ChevronDown className="w-3 h-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {languages.map(language => (
                  <DropdownMenuItem 
                    key={language.language_id} 
                    onClick={() => setCurrentLanguageId(language.language_id)}
                  >
                    {language.code} - {language.long_name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={selectedComponents.map(comp => comp.component_id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {selectedComponents.map((component) => (
                <ComponentItem
                  key={component.component_id}
                  component={component}
                  cttId={activeCttId}
                  channelId={currentChannelId}
                  languageId={currentLanguageId || 0}
                  onTitleChange={handleTitleChange}
                  onDescriptionChange={handleDescriptionChange}
                  onContentChange={handleContentChange}
                  onRemove={(id) => handleToggleComponent(id, false)}
                  onAIBuild={(id) => {
                    if (onBuildWithAI) {
                      const contentType = contentTypes.find(ct => ct.ctt_id === activeCttId)
                      if (contentType) {
                        onBuildWithAI(contentType.content_type_title, taskId, activeCttId, id, currentChannelId ?? undefined, currentLanguageId ?? undefined)
                      }
                    }
                  }}
                  onToggleExpanded={(id) => {
                    const newSet = new Set(expandedComponents)
                    if (newSet.has(id)) {
                      newSet.delete(id)
                    } else {
                      newSet.add(id)
                    }
                    setExpandedComponents(newSet)
                  }}
                  isExpanded={expandedComponents.has(component.component_id)}
                  currentContent={null} // TODO: Load from component output
                  isLoadingContent={false} // TODO: Implement loading state
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Add Component Button */}
        <div>
          <Button
            onClick={handleAddComponent}
            variant="outline"
            size="sm"
            className="bg-white text-gray-900 border-gray-300 hover:bg-gray-50"
          >
            <Plus className="w-4 h-4 mr-1" /> ADD COMPONENT
          </Button>
        </div>
      </div>

      {/* Preview Modal */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview: {contentTypes.find(ct => ct.ctt_id === activeCttId)?.content_type_title}</DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm max-w-none">
            {previewLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span>Loading preview...</span>
              </div>
            ) : composedOutput ? (
              <div dangerouslySetInnerHTML={{ __html: composedOutput }} />
            ) : (
              <div className="text-center py-8 text-gray-500">
                No content available for this variation.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
