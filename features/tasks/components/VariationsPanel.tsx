"use client"

import React, { useState, useCallback, useMemo } from 'react'
import { Button } from '../../../app/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../app/components/ui/select'
import { Badge } from '../../../app/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../../app/components/ui/dialog'
import { Input } from '../../../app/components/ui/input'
import { Textarea } from '../../../app/components/ui/textarea'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useVariantId } from '../hooks/use-variant-briefing'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '../../../app/components/ui/use-toast'
import { Loader2, Settings, Plus } from 'lucide-react'

interface Channel {
  channel_id: number
  name: string
  selected: boolean
}

interface Language {
  language_id: number
  long_name: string
  selected: boolean
}

interface VariationsPanelProps {
  cttId: string | null
  channels: Channel[]
  languages: Language[]
  projectId?: number
  onActiveVariationChange?: (variation: { channelId: number | null, languageId: number } | null) => void
}

export function VariationsPanel({
  cttId,
  channels,
  languages,
  projectId,
  onActiveVariationChange
}: VariationsPanelProps) {
  const [activeVariation, setActiveVariation] = useState<{ channelId: number | null, languageId: number } | null>(null)
  const [briefingTypes, setBriefingTypes] = useState<Array<{ briefing_type_id: number; title: string; description: string; is_default: boolean; position: number | null }>>([])
  const [isLoadingBriefingTypes, setIsLoadingBriefingTypes] = useState(false)
  const [isAddBriefingDialogOpen, setIsAddBriefingDialogOpen] = useState(false)
  const [newBriefingTitle, setNewBriefingTitle] = useState('')
  const [newBriefingDescription, setNewBriefingDescription] = useState('')
  const [isCreatingBriefing, setIsCreatingBriefing] = useState(false)
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

  // Get variant ID for active variation
  const { data: variantData, isLoading: isLoadingVariantId } = useVariantId(
    cttId,
    activeVariation?.channelId ?? null,
    activeVariation?.languageId ?? null
  )

  // Fetch briefing types for project
  React.useEffect(() => {
    const fetchBriefingTypes = async () => {
      if (!projectId) {
        setBriefingTypes([])
        return
      }

      setIsLoadingBriefingTypes(true)
      try {
        // Use exact query format as specified
        const { data, error } = await supabase
          .from('project_briefing_types')
          .select('briefing_type_id, is_default, briefing_types(title, description)')
          .eq('project_id', projectId)

        if (error) {
          console.error('Failed to fetch briefing types - error:', error)
          throw error
        }

        console.log('✅ Fetched briefing types for project:', projectId, 'Count:', data?.length)

        const formattedTypes = (data || []).map((bt: any) => ({
          briefing_type_id: bt.briefing_type_id,
          title: bt.briefing_types?.title || `Briefing Type ${bt.briefing_type_id}`,
          description: bt.briefing_types?.description || null,
          is_default: bt.is_default || false,
          position: null, // Not included in the query
        }))

        setBriefingTypes(formattedTypes)
        console.log('✅ Formatted briefing types:', formattedTypes)
      } catch (error: any) {
        console.error('❌ Failed to fetch briefing types:', error)
        setBriefingTypes([])
      } finally {
        setIsLoadingBriefingTypes(false)
      }
    }

    fetchBriefingTypes()
  }, [projectId, supabase])

  // Get selected channels and languages
  const selectedChannels = channels.filter(c => c.selected)
  const selectedLanguages = languages.filter(l => l.selected)

  // Generate all possible variations (cartesian product)
  const allVariations = useMemo(() => {
    const variations: Array<{ channelId: number | null, languageId: number, channelName: string, languageName: string }> = []
    
    // If no channels selected, create variations with null channel
    if (selectedChannels.length === 0) {
      selectedLanguages.forEach(language => {
        variations.push({
          channelId: null,
          languageId: language.language_id,
          channelName: 'No Channel',
          languageName: language.long_name
        })
      })
    } else {
      // Create cartesian product of channels × languages
      selectedChannels.forEach(channel => {
        selectedLanguages.forEach(language => {
          variations.push({
            channelId: channel.channel_id,
            languageId: language.language_id,
            channelName: channel.name,
            languageName: language.long_name
          })
        })
      })
    }
    
    return variations
  }, [selectedChannels, selectedLanguages])

  // Always select the first variation by default when variations are available
  React.useEffect(() => {
    if (allVariations.length > 0) {
      const first = allVariations[0]
      const firstVariation = { channelId: first.channelId, languageId: first.languageId }
      
      // Check if current active variation is still valid (exists in allVariations)
      const currentVariationIsValid = activeVariation && allVariations.some(v => 
        v.channelId === activeVariation.channelId && 
        v.languageId === activeVariation.languageId
      )
      
      // If no active variation, or if current active variation is invalid, select the first one
      if (!activeVariation || !currentVariationIsValid) {
        setActiveVariation(firstVariation)
        onActiveVariationChange?.(firstVariation)
      }
    } else if (allVariations.length === 0 && activeVariation) {
      // Clear active variation if no variations available
      setActiveVariation(null)
      onActiveVariationChange?.(null)
    }
  }, [allVariations, activeVariation, onActiveVariationChange])

  // Notify parent when active variation changes
  React.useEffect(() => {
    onActiveVariationChange?.(activeVariation)
  }, [activeVariation, onActiveVariationChange])

  const handleVariationSelect = useCallback((channelId: number | null, languageId: number) => {
    const variation = { channelId, languageId }
    setActiveVariation(variation)
    onActiveVariationChange?.(variation)
  }, [onActiveVariationChange])

  const handleBriefingTypeChange = useCallback(async (briefingTypeId: string | null) => {
    if (!activeVariation || activeVariation.languageId === null || !cttId) {
      toast({
        title: 'Error',
        description: 'Please select a variation first.',
        variant: 'destructive',
      })
      return
    }

    try {
      const typeId = briefingTypeId ? parseInt(briefingTypeId) : null
      
      if (typeId === null) {
        // Remove briefing type - might need a separate RPC or just set to null
        toast({
          title: 'Info',
          description: 'Removing briefing type is not yet supported.',
        })
        return
      }

      // If variant doesn't exist, ensure it exists first
      let variantId = variantData?.id
      if (!variantId) {
        // Ensure variant exists - this should create it if it doesn't exist
        // The variant_set_briefing RPC should handle this, but let's ensure first if needed
        const { data: ensureData, error: ensureError } = await supabase.rpc('ensure_ctt_variant', {
          p_ctt: cttId,
          p_chan: activeVariation.channelId,
          p_lang: activeVariation.languageId,
        })
        
        if (ensureError) {
          // If ensure fails, try variant_set_briefing anyway - it might create the variant
          console.warn('Failed to ensure variant, trying variant_set_briefing anyway:', ensureError)
        } else if (ensureData) {
          // Refresh variant ID
          await queryClient.invalidateQueries({
            queryKey: ['variantId', cttId, activeVariation.channelId, activeVariation.languageId],
          })
          // Get the variant ID from the query result after refresh
          const refreshed = await queryClient.ensureQueryData({
            queryKey: ['variantId', cttId, activeVariation.channelId, activeVariation.languageId],
            queryFn: async () => {
              let query = supabase
                .from('content_types_tasks_variants')
                .select('id, briefing_type_id')
                .eq('ctt_id', cttId)
                .eq('language_id', activeVariation.languageId)

              if (activeVariation.channelId === null) {
                query = query.is('channel_id', null)
              } else {
                query = query.eq('channel_id', activeVariation.channelId)
              }

              const { data, error } = await query.maybeSingle()
              if (error && error.code !== 'PGRST116') throw error
              return data ? { id: data.id, briefing_type_id: data.briefing_type_id } : null
            },
          })
          variantId = refreshed?.id
        }
      }

      if (!variantId) {
        throw new Error('Failed to get or create variant')
      }

      const { error } = await supabase.rpc('variant_set_briefing', {
        p_variant_id: variantId,
        p_briefing_type_id: typeId,
      })

      if (error) throw error

      // Invalidate and refetch variant ID query to refresh briefing_type_id and briefing type details
      await queryClient.invalidateQueries({
        queryKey: ['variantId', cttId, activeVariation.channelId, activeVariation.languageId],
      })
      
      // Force refetch to ensure we have the latest briefing_type_id immediately
      await queryClient.refetchQueries({
        queryKey: ['variantId', cttId, activeVariation.channelId, activeVariation.languageId],
      })

      // The VariantBriefingPanel will detect the briefingTypeId change and refetch components
      // The useEffect in VariantBriefingPanel watches briefingTypeId and will call refreshComponents()

      toast({
        title: 'Success',
        description: 'Briefing type updated for this variant.',
      })
    } catch (error: any) {
      console.error('Failed to set variant briefing type:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to update briefing type',
        variant: 'destructive',
      })
    }
  }, [variantData?.id, cttId, activeVariation, supabase, queryClient])

  if (allVariations.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        Select channels and languages to create variations.
      </div>
    )
  }


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">Content Variations</h3>
        <div className="text-xs text-gray-500">
          {allVariations.length} variation{allVariations.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Variation selector */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Active Variation
        </label>
        <div className="flex flex-wrap gap-2">
          {allVariations.map((variation, index) => (
            <Button
              key={`${variation.channelId}-${variation.languageId}`}
              variant={activeVariation?.channelId === variation.channelId && 
                       activeVariation?.languageId === variation.languageId 
                       ? "default" : "outline"}
              size="sm"
              onClick={() => handleVariationSelect(variation.channelId, variation.languageId)}
              className="text-xs"
            >
              {variation.channelName} × {variation.languageName}
            </Button>
          ))}
        </div>
      </div>

      {/* Briefing Type Dropdown for Current Variant */}
      {activeVariation && (
        <div className="space-y-2 mt-4 pt-4 border-t">
          <label className="text-sm font-medium text-gray-700">Briefing Type</label>
          
          {/* Show current briefing type if set */}
          {!isLoadingVariantId && variantData?.briefing_type_id && variantData.briefing_type_title && (
            <div className="mb-2 p-2 bg-blue-50 rounded border border-blue-200">
              <div className="text-sm font-medium text-blue-900">
                Current: {variantData.briefing_type_title}
              </div>
              {variantData.briefing_type_description && (
                <div className="text-xs text-blue-700 mt-1">
                  {variantData.briefing_type_description}
                </div>
              )}
            </div>
          )}

          {isLoadingBriefingTypes ? (
            <div className="text-sm text-gray-500">Loading briefing types...</div>
          ) : briefingTypes.length === 0 ? (
            <div className="space-y-2">
              <div className="text-sm text-gray-500">
                No briefing types configured for this project.
              </div>
              {projectId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddBriefingDialogOpen(true)}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Briefing Type
                </Button>
              )}
            </div>
          ) : (
            <Select
              value={variantData?.briefing_type_id?.toString() || ''}
              onValueChange={(value) => {
                if (value === 'add-new') {
                  setIsAddBriefingDialogOpen(true)
                } else {
                  handleBriefingTypeChange(value)
                }
              }}
              disabled={isLoadingVariantId}
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
                  <>
                    <div className="h-px bg-gray-200 my-1" />
                    <SelectItem value="add-new">
                      <div className="flex items-center gap-2 text-blue-600">
                        <Plus className="w-4 h-4" />
                        <span>Add New Briefing Type</span>
                      </div>
                    </SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Add New Briefing Type Dialog */}
      {projectId && (
        <Dialog open={isAddBriefingDialogOpen} onOpenChange={setIsAddBriefingDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Briefing Type</DialogTitle>
              <DialogDescription>
                Create a new briefing type and add it to this project.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={newBriefingTitle}
                  onChange={(e) => setNewBriefingTitle(e.target.value)}
                  placeholder="Enter briefing type title"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description (optional)</label>
                <Textarea
                  value={newBriefingDescription}
                  onChange={(e) => setNewBriefingDescription(e.target.value)}
                  placeholder="Enter briefing type description"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddBriefingDialogOpen(false)
                  setNewBriefingTitle('')
                  setNewBriefingDescription('')
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!newBriefingTitle.trim() || !projectId) return

                  setIsCreatingBriefing(true)
                  try {
                    // First, create the briefing type
                    const { data: createdType, error: createError } = await supabase
                      .from('briefing_types')
                      .insert({
                        title: newBriefingTitle.trim(),
                        description: newBriefingDescription.trim() || null,
                      })
                      .select('id')
                      .single()

                    if (createError) throw createError

                    if (!createdType?.id) {
                      throw new Error('Failed to create briefing type')
                    }

                    // Then add it to the project
                    const nextPosition = briefingTypes.length + 1
                    const { error: addError } = await supabase.rpc('add_project_briefing_type', {
                      p_project_id: projectId,
                      p_briefing_type_id: createdType.id,
                      p_is_default: false,
                      p_position: nextPosition,
                    })

                    if (addError) throw addError

                    // Refresh briefing types list
                    const { data: refreshedTypes, error: refreshError } = await supabase
                      .from('project_briefing_types')
                      .select(`
                        briefing_type_id,
                        is_default,
                        position,
                        briefing_types!inner(title, description)
                      `)
                      .eq('project_id', projectId)
                      .order('is_default', { ascending: false })
                      .order('position', { ascending: true })
                      .order('briefing_types.title')

                    if (refreshError) throw refreshError

                    const formattedTypes = (refreshedTypes || []).map((bt: any) => ({
                      briefing_type_id: bt.briefing_type_id,
                      title: bt.briefing_types.title,
                      description: bt.briefing_types.description,
                      is_default: bt.is_default,
                      position: bt.position,
                    }))

                    setBriefingTypes(formattedTypes)

                    toast({
                      title: 'Success',
                      description: 'Briefing type created and added to project.',
                    })

                    setIsAddBriefingDialogOpen(false)
                    setNewBriefingTitle('')
                    setNewBriefingDescription('')

                    // Automatically set it as the variant's briefing type
                    if (variantData?.id) {
                      await handleBriefingTypeChange(createdType.id.toString())
                    }
                  } catch (error: any) {
                    console.error('Failed to create briefing type:', error)
                    toast({
                      title: 'Error',
                      description: error.message || 'Failed to create briefing type',
                      variant: 'destructive',
                    })
                  } finally {
                    setIsCreatingBriefing(false)
                  }
                }}
                disabled={!newBriefingTitle.trim() || isCreatingBriefing}
              >
                {isCreatingBriefing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create & Add to Project'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

    </div>
  )
}
