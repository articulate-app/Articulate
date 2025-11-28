"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Button } from "../../app/components/ui/button"
import { Badge } from "../../app/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../app/components/ui/dropdown-menu"
import { Plus, X } from "lucide-react"
import { toast } from "../../app/components/ui/use-toast"
import { SEOPanel } from './SEOPanel'
import { ChannelsSelector } from './components/ChannelsSelector'
import { LanguagesSelector } from './components/LanguagesSelector'
import { VariationsPanel } from './components/VariationsPanel'
import { DefaultVariations } from './components/DefaultVariations'
import { useChannelsForCtt, useLanguagesForCtt } from './hooks/use-channels-languages'
import { useCTTVariantSEO } from './hooks/use-ctt-variant-seo'
import { useVariantId } from './hooks/use-variant-briefing'
import { VariantBriefingPanel } from './components/VariantBriefingPanel'

interface ContentType {
  content_type_id: number
  content_type_title: string
  assigned: boolean
  ctt_id: string | null
  is_primary: boolean
  has_final_output: boolean
}

interface ContentTypeEditorProps {
  taskId: number
  projectId?: number
  onBuildWithAI?: (contentTypeTitle: string, taskId: number) => void
}

export function ContentTypeEditor({ taskId, projectId, onBuildWithAI }: ContentTypeEditorProps) {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [contentTypes, setContentTypes] = useState<ContentType[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [availableTypes, setAvailableTypes] = useState<ContentType[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedTypesToAdd, setSelectedTypesToAdd] = useState<number[]>([])
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [activeVariation, setActiveVariation] = useState<{ channelId: number | null, languageId: number } | null>(null)
  
  // Get selected content type for channels/languages
  const selectedType = contentTypes.find(ct => ct.content_type_id === selectedTypeId)
  const selectedCttId = selectedType?.ctt_id
  
  // Debug: Log activeVariation changes
  useEffect(() => {
    console.log('ContentTypeEditor: activeVariation changed', { 
      activeVariation, 
      selectedCttId,
      hasLanguageId: activeVariation?.languageId !== null && activeVariation?.languageId !== undefined
    })
  }, [activeVariation, selectedCttId])

  // Fetch SEO data for the active variation using single merged view query
  // This includes both SEO fields and effective flags in one call
  const {
    data: variantSEO,
    isLoading: isLoadingSEO,
    updateKeywords,
    toggleSEORequired,
    isUpdatingKeywords,
    isTogglingSEO,
  } = useCTTVariantSEO(
    selectedCttId ?? null,
    activeVariation?.channelId ?? null,
    activeVariation?.languageId ?? null
  )

  // Get variant ID for variant-level briefing
  const { data: variantData } = useVariantId(
    selectedCttId ?? null,
    activeVariation?.channelId ?? null,
    activeVariation?.languageId ?? null
  )
  
  // Use seo_required from the merged view to gate the SEO panel
  const seoRequired = (variantSEO as any)?.seo_required ?? false

  // Fetch channels, languages, and variations for selected content type
  const { 
    channels, 
    loading: channelsLoading, 
    error: channelsError, 
    updateChannels 
  } = useChannelsForCtt(selectedCttId ?? null, projectId, selectedType?.content_type_id ?? undefined)

  const { 
    languages, 
    loading: languagesLoading, 
    error: languagesError, 
    updateLanguages 
  } = useLanguagesForCtt(selectedCttId ?? null)

  // SEO variations are now handled per-variation in VariationsPanel via useSEOVariant hook

  // Fetch content types for task
  const fetchContentTypes = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase.rpc('content_types_for_task', { p_task_id: taskId })
      if (error) throw error
      
      setContentTypes(data || [])
      
      // Auto-select primary type or first assigned type
      const primaryType = data?.find((ct: any) => ct.is_primary)
      const firstAssigned = data?.find((ct: any) => ct.assigned)
      if (primaryType) {
        setSelectedTypeId(primaryType.content_type_id)
      } else if (firstAssigned) {
        setSelectedTypeId(firstAssigned.content_type_id)
      }
    } catch (error: any) {
      console.error('Failed to fetch content types:', error)
      toast({
        title: "Error loading content types",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [supabase, taskId])

  // Fetch available content types for adding
  const fetchAvailableTypes = useCallback(async (query: string = "") => {
    setIsSearching(true)
    try {
      const { data, error } = await supabase
        .from('content_types')
        .select('id, title')
        .ilike('title', `%${query}%`)
        .order('title')
        .limit(50)
      
      if (error) throw error
      
      // Filter out already assigned types
      const assignedIds = new Set(contentTypes.filter(ct => ct.assigned).map(ct => ct.content_type_id))
      const available = (data || [])
        .filter(ct => !assignedIds.has(ct.id))
        .map(ct => ({
          content_type_id: ct.id,
          content_type_title: ct.title,
          assigned: false,
          ctt_id: null,
          is_primary: false,
          has_final_output: false
        }))
      
      setAvailableTypes(available)
    } catch (error: any) {
      console.error('Failed to fetch available types:', error)
    } finally {
      setIsSearching(false)
    }
  }, [supabase, contentTypes])


  // Add multiple content types to task
  const handleAddSelectedTypes = async () => {
    if (selectedTypesToAdd.length === 0) return
    
    try {
      // Optimistically add to UI
      const added = availableTypes.filter(t => selectedTypesToAdd.includes(t.content_type_id))
      setContentTypes(prev => [
        ...prev,
        ...added.map(t => ({
          ...t,
          assigned: true,
          ctt_id: null,
          is_primary: false,
          has_final_output: false
        }))
      ])
      setSelectedTypeId(selectedTypesToAdd[0])

      // Perform server calls in parallel and capture returned IDs (no over-fetch)
      await Promise.all(selectedTypesToAdd.map(async (typeId) => {
        const { data: newCttId, error } = await supabase.rpc('ai_ensure_content_type_for_task', {
          p_task_id: taskId,
          p_content_type_id: typeId,
          p_is_primary: false
        })
        if (error) throw error

        // Patch in the returned ctt_id without reloading everything
        if (newCttId) {
          setContentTypes(prev => prev.map(ct => ct.content_type_id === typeId ? { ...ct, ctt_id: newCttId } : ct))
        }
      }))

      // Remove added from available list and reset UI
      setAvailableTypes(prev => prev.filter(t => !selectedTypesToAdd.includes(t.content_type_id)))
      setSelectedTypesToAdd([])
      setSearchQuery("")
      setIsDropdownOpen(false)
      
      toast({
        title: "Content types added",
        description: `${selectedTypesToAdd.length} content type(s) have been added to this task.`,
      })
    } catch (error: any) {
      console.error('Failed to add content types:', error)
      toast({
        title: "Failed to add content types",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  // Toggle type selection
  const handleToggleTypeSelection = (typeId: number) => {
    setSelectedTypesToAdd(prev => 
      prev.includes(typeId) 
        ? prev.filter(id => id !== typeId)
        : [...prev, typeId]
    )
  }

  // Add content type to task (single)
  const handleAddType = async (typeId: number) => {
    try {
      // Optimistic state update
      const added = availableTypes.find(t => t.content_type_id === typeId)
      if (added) {
        setContentTypes(prev => [...prev, { ...added, assigned: true }])
        setAvailableTypes(prev => prev.filter(t => t.content_type_id !== typeId))
      }
      setSelectedTypeId(typeId)

      // Server call with returning id
      const { data: newCttId, error } = await supabase.rpc('ai_ensure_content_type_for_task', {
        p_task_id: taskId,
        p_content_type_id: typeId,
        p_is_primary: false
      })
      if (error) throw error
      if (newCttId) {
        setContentTypes(prev => prev.map(ct => ct.content_type_id === typeId ? { ...ct, ctt_id: newCttId } : ct))
      }

      toast({
        title: "Content type added",
        description: "You can now start writing content for this type.",
      })
    } catch (error: any) {
      console.error('Failed to add content type:', error)
      toast({
        title: "Failed to add content type",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  // Remove content type from task
  const handleRemoveType = async (typeId: number) => {
    const contentType = contentTypes.find(ct => ct.content_type_id === typeId)
    if (!contentType?.ctt_id) return

    try {
      const { error } = await supabase
        .from('content_types_tasks')
        .delete()
        .eq('id', contentType.ctt_id)
      
      if (error) throw error
      
      // Refresh content types
      await fetchContentTypes()
      
      // If we removed the selected type, select another
      if (selectedTypeId === typeId) {
        const remaining = contentTypes.filter(ct => ct.content_type_id !== typeId && ct.assigned)
        setSelectedTypeId(remaining.length > 0 ? remaining[0].content_type_id : null)
      }
      
      toast({
        title: "Content type removed",
        description: "The content type has been removed from this task.",
      })
    } catch (error: any) {
      console.error('Failed to remove content type:', error)
      toast({
        title: "Failed to remove content type",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  // Set primary content type
  const handleSetPrimary = async (typeId: number) => {
    try {
      const { error } = await supabase.rpc('set_primary_content_type_for_task', {
        p_task_id: taskId,
        p_content_type_id: typeId
      })
      
      if (error) throw error
      
      // Refresh content types
      await fetchContentTypes()
      
      toast({
        title: "Primary type updated",
        description: "The primary content type has been updated.",
      })
    } catch (error: any) {
      console.error('Failed to set primary type:', error)
      toast({
        title: "Failed to update primary type",
        description: error.message,
        variant: "destructive",
      })
    }
  }


  // Initial load
  useEffect(() => {
    fetchContentTypes()
  }, []) // Remove fetchContentTypes from dependencies to prevent infinite loop


  // Search available types when dropdown is open
  useEffect(() => {
    if (isDropdownOpen) {
      fetchAvailableTypes(searchQuery)
    }
  }, [isDropdownOpen, searchQuery, fetchAvailableTypes])

  const primaryType = contentTypes.find(ct => ct.is_primary)
  const otherTypes = contentTypes.filter(ct => ct.assigned && !ct.is_primary)

  if (isLoading) {
    return (
      <div className="mt-6">
        <label className="text-sm font-medium text-gray-400 text-left mb-1 block">Content Types</label>
        <div className="flex items-center justify-center py-8">
          <div className="text-sm text-gray-500">Loading content types...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <label className="text-sm font-medium text-gray-400 text-left mb-1 block">Content Types</label>
      
      {/* Minimalistic Content Type Selector */}
      <div className="mb-4">
        <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between text-left"
            >
              <span className="truncate">
                {selectedType ? selectedType.content_type_title : "Select content type"}
                {selectedType?.is_primary && (
                  <Badge variant="default" className="ml-2 bg-blue-100 text-blue-800 text-xs">
                    Primary
                  </Badge>
                )}
              </span>
              <Plus className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80 p-0">
            {/* Search input */}
            <div className="p-3 border-b">
              <input
                type="text"
                placeholder="Search content types..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            
            {/* Content types list */}
            <div className="max-h-60 overflow-y-auto">
              {/* Current assigned types */}
              {contentTypes.filter(ct => ct.assigned).map((type) => (
                <div key={type.content_type_id} className="p-2 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        type="radio"
                        name="content-type"
                        checked={selectedTypeId === type.content_type_id}
                        onChange={() => setSelectedTypeId(type.content_type_id)}
                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium truncate">{type.content_type_title}</span>
                      {type.is_primary && (
                        <Badge variant="default" className="bg-blue-100 text-blue-800 text-xs">
                          Primary
                        </Badge>
                      )}
                      {type.has_final_output && (
                        <span className="text-xs text-green-600">•</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {!type.is_primary && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSetPrimary(type.content_type_id)
                          }}
                          className="text-blue-600 hover:text-blue-700 p-1 h-6"
                        >
                          Set Primary
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveType(type.content_type_id)
                        }}
                        className="text-red-600 hover:text-red-700 p-1 h-6"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Divider */}
              {contentTypes.filter(ct => ct.assigned).length > 0 && availableTypes.length > 0 && (
                <div className="border-t my-1"></div>
              )}
              
              {/* Available types to add */}
              {isSearching ? (
                <div className="p-4 text-sm text-gray-500 text-center">Searching...</div>
              ) : availableTypes.length === 0 ? (
                <div className="p-4 text-sm text-gray-500 text-center">
                  {searchQuery ? "No content types found" : "Start typing to search"}
                </div>
              ) : (
                availableTypes.map((type) => (
                  <div
                    key={type.content_type_id}
                    className="flex items-center space-x-2 p-2 hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleToggleTypeSelection(type.content_type_id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTypesToAdd.includes(type.content_type_id)}
                      onChange={() => handleToggleTypeSelection(type.content_type_id)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium flex-1">{type.content_type_title}</span>
                  </div>
                ))
              )}
            </div>
            
            {/* Add selected button */}
            {selectedTypesToAdd.length > 0 && (
              <div className="p-3 border-t bg-gray-50">
                <Button
                  onClick={handleAddSelectedTypes}
                  className="w-full"
                  size="sm"
                >
                  Add {selectedTypesToAdd.length} type{selectedTypesToAdd.length > 1 ? 's' : ''}
                </Button>
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>


      {/* Channels and Languages Selectors for Active Content Type */}
      {selectedType && selectedType.ctt_id && (
        <div className="mt-6">
          <div className="border rounded-lg p-4 bg-white">
            <div className="mb-4">
              <h3 className="font-medium text-gray-900 mb-1">Content Distribution</h3>
              <p className="text-sm text-gray-500">
                Select channels and languages for this content deliverable.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Channels Selector */}
              <ChannelsSelector
                channels={channels}
                loading={channelsLoading}
                error={channelsError}
                onUpdateChannels={updateChannels}
              />
              
              {/* Languages Selector */}
              <LanguagesSelector
                languages={languages}
                loading={languagesLoading}
                error={languagesError}
                onUpdateLanguages={updateLanguages}
              />
            </div>
            
            {/* Default Variations */}
            <div className="mt-6">
              <DefaultVariations 
                projectId={projectId}
                contentTypeId={selectedType?.content_type_id}
              />
            </div>
          </div>
        </div>
      )}

      {/* Variations Panel for Active Content Type */}
      {selectedType && selectedType.ctt_id && (
        <div className="mt-6">
          <div className="border rounded-lg p-4 bg-white">
            <VariationsPanel
              cttId={selectedType.ctt_id}
              channels={channels}
              languages={languages}
              projectId={projectId}
              onActiveVariationChange={setActiveVariation}
            />
          </div>
        </div>
      )}

      {/* Variant Briefing Panel - Only show if variant has briefing_type_id */}
      {selectedType && selectedType.ctt_id && activeVariation && variantData?.id && variantData.briefing_type_id && (
        <div className="mt-6">
          <div className="border rounded-lg p-4 bg-white">
            <div className="mb-4">
              <h3 className="font-medium text-gray-900 mb-1">Variant Briefing Configuration</h3>
              <p className="text-sm text-gray-500">
                Configure components for this specific variation.
              </p>
            </div>
            <VariantBriefingPanel 
              variantId={variantData.id}
              briefingTypeId={variantData.briefing_type_id}
              projectId={projectId}
              cttId={selectedType.ctt_id}
              channelId={activeVariation.channelId}
              languageId={activeVariation.languageId}
            />
          </div>
        </div>
      )}

      {/* SEO Panel for Active Variation */}
      {selectedType && selectedType.ctt_id && activeVariation && seoRequired && (
        <div className="mt-6">
          <div className="border rounded-lg p-4 bg-white">
            <SEOPanel 
              variantSEO={variantSEO as any}
              isLoading={isLoadingSEO}
              onUpdateKeywords={updateKeywords}
              onToggleSEORequired={toggleSEORequired}
              isUpdatingKeywords={isUpdatingKeywords}
              isTogglingSEO={isTogglingSEO}
              cttId={selectedType.ctt_id}
              channelId={activeVariation.channelId}
              languageId={activeVariation.languageId}
              variantId={variantData?.id || null}
              variantBriefingTypeId={variantData?.briefing_type_id || null}
            />
          </div>
        </div>
      )}

      {/* Project Management Buttons */}
      {projectId && (
        <div className="mt-6 space-y-3">
          <div className="border rounded-lg p-4 bg-white">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                // Navigate to project briefings page
                router.push(`/projects/${projectId}`)
              }}
            >
              Project → Briefings
            </Button>
          </div>
          <div className="border rounded-lg p-4 bg-white">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                // Navigate to project SEO settings in middle pane
                const newParams = new URLSearchParams(searchParams.toString())
                newParams.set('middleView', 'project-seo')
                newParams.set('projectId', projectId.toString())
                router.push(`${pathname}?${newParams.toString()}`, { scroll: false })
              }}
            >
              Manage Project SEO
            </Button>
          </div>
        </div>
      )}

    </div>
  )
}
