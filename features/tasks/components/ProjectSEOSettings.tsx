"use client"

import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { ChevronRight, ChevronDown, Loader2, X, Search } from 'lucide-react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Button } from '../../../app/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../../app/components/ui/dialog'
import { Input } from '../../../app/components/ui/input'
import { toast } from '../../../app/components/ui/use-toast'
import { TriStateCheckbox } from './TriStateCheckbox'
import {
  useProjectSEOSummary,
  useProjectCTVariantsSEO,
  useToggleProjectSEOOverride,
  useToggleChannelSEOOverride,
  useToggleVariantSEOOverride,
  useBatchUpdateChannelVariantsSEO,
} from '../hooks/use-project-seo'

interface ProjectSEOSettingsProps {
  projectId: number
}

type TriState = true | false | null

export function ProjectSEOSettings({ projectId }: ProjectSEOSettingsProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClientComponentClient()
  const { data: summaryData, isLoading: isLoadingSummary } = useProjectSEOSummary(projectId)
  
  // Track expanded channels per content type
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set())
  
  // Search query for filtering content types
  const [searchQuery, setSearchQuery] = useState('')
  
  // Content type names cache
  const [contentTypeNames, setContentTypeNames] = useState<Map<number, string>>(new Map())
  // Channel names cache
  const [channelNames, setChannelNames] = useState<Map<number | null, string>>(new Map([ [null, 'Generic'] ]))
  
  // Track what we've already fetched to prevent duplicate calls
  const fetchedCtIdsRef = useRef<Set<number>>(new Set())
  const fetchedChannelIdsRef = useRef<Set<number>>(new Set())
  
  // Track batch update confirmation
  const [batchUpdateDialog, setBatchUpdateDialog] = useState<{
    contentTypeId: number
    channelId: number | null
    newValue: TriState
    cttIds: string[]
  } | null>(null)

  // Fetch content type names and channel names
  useEffect(() => {
    const fetchNames = async () => {
      if (!summaryData || summaryData.length === 0) return

      const contentTypeIds = Array.from(new Set(summaryData.map(item => item.content_type_id)))
      const channelIds = Array.from(new Set(summaryData.map(item => item.channel_id).filter(id => id !== null)))

      // Check what's missing using refs (no re-render triggers)
      // We check refs first, then also check state via functional update to be safe
      const missingCtIds = contentTypeIds.filter(id => !fetchedCtIdsRef.current.has(id))
      const missingChannelIds = channelIds.filter(id => !fetchedChannelIdsRef.current.has(id))

      if (missingCtIds.length === 0 && missingChannelIds.length === 0) return

      try {
        // Fetch content type names
        if (missingCtIds.length > 0) {
          // Mark as fetching
          missingCtIds.forEach(id => fetchedCtIdsRef.current.add(id))
          
          const { data: ctData, error: ctError } = await supabase
            .from('content_types')
            .select('id, title')
            .in('id', missingCtIds)

          if (ctError) throw ctError

          setContentTypeNames(prev => {
            const newCtNames = new Map(prev)
            for (const ct of ctData || []) {
              newCtNames.set(ct.id, ct.title)
            }
            return newCtNames
          })
        }

        // Fetch channel names
        if (missingChannelIds.length > 0) {
          // Mark as fetching
          missingChannelIds.forEach(id => fetchedChannelIdsRef.current.add(id))
          
          const { data: channelData, error: channelError } = await supabase
            .from('channels')
            .select('id, name')
            .in('id', missingChannelIds)

          if (channelError) throw channelError

          setChannelNames(prev => {
            const newChannelNames = new Map(prev)
            for (const channel of channelData || []) {
              newChannelNames.set(channel.id, channel.name)
            }
            return newChannelNames
          })
        }
      } catch (error: any) {
        console.error('Failed to fetch names:', error)
        // Remove from refs on error so we can retry
        missingCtIds.forEach(id => fetchedCtIdsRef.current.delete(id))
        missingChannelIds.forEach(id => fetchedChannelIdsRef.current.delete(id))
      }
    }

    fetchNames()
  }, [summaryData, supabase])

  // Group summary data by content type
  const groupedByContentType = useMemo(() => {
    if (!summaryData) return new Map<number, typeof summaryData>()

    const grouped = new Map<number, typeof summaryData>()
    for (const item of summaryData) {
      if (!grouped.has(item.content_type_id)) {
        grouped.set(item.content_type_id, [])
      }
      grouped.get(item.content_type_id)!.push(item)
    }

    return grouped
  }, [summaryData])

  // Get unique content types with their names
  const contentTypes = useMemo(() => {
    const ctIds = Array.from(groupedByContentType.keys())
    return ctIds.map(id => ({
      id,
      name: contentTypeNames.get(id) || `Content Type ${id}`,
    }))
  }, [groupedByContentType, contentTypeNames])

  // Filter content types based on search query
  const filteredContentTypes = useMemo(() => {
    if (!searchQuery.trim()) return contentTypes
    
    const query = searchQuery.toLowerCase().trim()
    return contentTypes.filter(ct => 
      ct.name.toLowerCase().includes(query)
    )
  }, [contentTypes, searchQuery])

  // Handle close button click
  const handleClose = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('middleView')
    params.delete('projectId')
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const toggleProjectOverride = useToggleProjectSEOOverride()
  const toggleChannelOverride = useToggleChannelSEOOverride()
  const toggleVariantOverride = useToggleVariantSEOOverride()
  const batchUpdateVariants = useBatchUpdateChannelVariantsSEO()

  const handleToggleChannelExpanded = (contentTypeId: number, channelId: number | null) => {
    const key = `${contentTypeId}:${channelId ?? 'null'}`
    setExpandedChannels((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const handleProjectToggle = async (contentTypeId: number, newValue: TriState) => {
    try {
      await toggleProjectOverride.mutateAsync({
        projectId,
        contentTypeId,
        seoRequired: newValue,
      })
      toast({
        title: 'Success',
        description: 'Project SEO override updated',
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update project SEO override',
        variant: 'destructive',
      })
    }
  }

  const handleChannelToggle = async (
    contentTypeId: number,
    channelId: number | null,
    newValue: TriState
  ) => {
    try {
      await toggleChannelOverride.mutateAsync({
        projectId,
        contentTypeId,
        channelId,
        seoRequired: newValue,
      })

      // If toggling to a non-null value and channel is expanded, offer batch update
      if (newValue !== null) {
        const channelKey = `${contentTypeId}:${channelId ?? 'null'}`
        if (expandedChannels.has(channelKey)) {
          // Channel is expanded, we can get variants and offer batch update
          // This will be handled when variants are loaded
        }
      }

      toast({
        title: 'Success',
        description: newValue === null 
          ? 'Channel SEO override removed' 
          : 'Channel SEO override updated. Expand to apply to all languages.',
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update channel SEO override',
        variant: 'destructive',
      })
    }
  }

  const handleVariantToggle = async (
    variantId: string,
    contentTypeId: number,
    channelId: number | null,
    newValue: TriState
  ) => {
    try {
      await toggleVariantOverride.mutateAsync({
        variantId,
        seoRequired: newValue,
        projectId,
        contentTypeId,
        channelId,
      })
      toast({
        title: 'Success',
        description: 'Variant SEO override updated',
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update variant SEO override',
        variant: 'destructive',
      })
    }
  }

  const handleBatchUpdateConfirm = async () => {
    if (!batchUpdateDialog) return

    try {
      await batchUpdateVariants.mutateAsync({
        cttIds: batchUpdateDialog.cttIds,
        channelId: batchUpdateDialog.channelId,
        seoRequired: batchUpdateDialog.newValue,
        projectId,
        contentTypeId: batchUpdateDialog.contentTypeId,
      })
      toast({
        title: 'Success',
        description: 'Updated all language variants for this channel',
      })
      setBatchUpdateDialog(null)
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update variants',
        variant: 'destructive',
      })
    }
  }

  if (isLoadingSummary) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!summaryData || summaryData.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>No content types found for this project.</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-gray-900">Project SEO Settings</h1>
            <p className="text-sm text-gray-500 mt-1">
              Configure SEO requirements at project, channel, and variant levels
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-8 w-8 text-gray-500 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search content types..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="space-y-6">
        {filteredContentTypes.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>{searchQuery ? `No content types found matching "${searchQuery}"` : 'No content types found for this project.'}</p>
          </div>
        ) : (
          filteredContentTypes.map((ct) => {
          const channels = groupedByContentType.get(ct.id) || []
          
          // Get project override value
          const projectOverride = channels[0]?.seo_required_project_override ?? null
          
          // Get global (content type default) - this is read-only, from seo_required when no overrides
          const globalValue = channels.find(c => c.seo_required_project_override === null && c.seo_required_channel_override === null)
            ?.seo_required ?? false

          return (
            <div key={ct.id} className="border rounded-lg p-4 bg-white">
              <div className="mb-4">
                <h3 className="text-lg font-medium text-gray-900">{ct.name}</h3>
              </div>

              {/* Global (read-only) */}
              <div className="mb-4 pb-4 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">Global</span>
                    <span className="text-xs text-gray-500">(read-only)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${globalValue ? 'text-green-600' : 'text-gray-400'}`}>
                      {globalValue ? 'Required' : 'Not Required'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Project Override */}
              <div className="mb-4 pb-4 border-b">
                <div className="flex items-center justify-between">
                  <TriStateCheckbox
                    value={projectOverride}
                    onChange={(value) => handleProjectToggle(ct.id, value)}
                    label="Project Override"
                    disabled={toggleProjectOverride.isPending}
                  />
                  {projectOverride !== null && (
                    <span className="text-xs text-gray-500">
                      {projectOverride ? 'Override: Required' : 'Override: Not Required'}
                    </span>
                  )}
                </div>
              </div>

              {/* Channels */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Channels</h4>
                {channels.map((channel) => {
                  const channelKey = `${ct.id}:${channel.channel_id ?? 'null'}`
                  const isExpanded = expandedChannels.has(channelKey)
                  const channelName = channelNames.get(channel.channel_id) || (channel.channel_id === null ? 'Generic' : `Channel ${channel.channel_id}`)

                  return (
                    <ChannelRow
                      key={channelKey}
                      channelId={channel.channel_id}
                      channelName={channelName}
                      channelOverride={channel.seo_required_channel_override}
                      isExpanded={isExpanded}
                      onToggleExpanded={() => handleToggleChannelExpanded(ct.id, channel.channel_id)}
                      onToggleOverride={(value) => handleChannelToggle(ct.id, channel.channel_id, value)}
                      onBatchUpdateRequest={(cttIds) => {
                        setBatchUpdateDialog({
                          contentTypeId: ct.id,
                          channelId: channel.channel_id,
                          newValue: channel.seo_required_channel_override ?? true,
                          cttIds,
                        })
                      }}
                      projectId={projectId}
                      contentTypeId={ct.id}
                      isLoading={toggleChannelOverride.isPending}
                    />
                  )
                })}
              </div>
            </div>
          )
          })
        )}
      </div>

      {/* Batch Update Confirmation Dialog */}
      <Dialog 
        open={!!batchUpdateDialog} 
        onOpenChange={(open) => {
          if (!open) setBatchUpdateDialog(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply to all languages?</DialogTitle>
            <DialogDescription>
              This will update SEO requirement for all language variants of this channel. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchUpdateDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleBatchUpdateConfirm} disabled={batchUpdateVariants.isPending}>
              {batchUpdateVariants.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Apply to all languages'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface ChannelRowProps {
  channelId: number | null
  channelName: string
  channelOverride: boolean | null
  isExpanded: boolean
  onToggleExpanded: () => void
  onToggleOverride: (value: TriState) => void
  onBatchUpdateRequest: (cttIds: string[]) => void
  projectId: number
  contentTypeId: number
  isLoading: boolean
}

function ChannelRow({
  channelId,
  channelName,
  channelOverride,
  isExpanded,
  onToggleExpanded,
  onToggleOverride,
  onBatchUpdateRequest,
  projectId,
  contentTypeId,
  isLoading,
}: ChannelRowProps) {
  // Only fetch variants when the channel row is expanded
  const { data: variants, isLoading: isLoadingVariants } = useProjectCTVariantsSEO(
    projectId,
    contentTypeId,
    channelId,
    100,
    0,
    isExpanded // Add isExpanded as a condition
  )

  // Group variants by language
  const variantsByLanguage = React.useMemo(() => {
    if (!variants) return new Map<number, Array<{ id: string; language_id: number; language_name: string; seo_required_override: boolean | null }>>()

    const grouped = new Map<number, Array<{ id: string; language_id: number; language_name: string; seo_required_override: boolean | null }>>()
    for (const variant of variants) {
      if (!grouped.has(variant.language_id)) {
        grouped.set(variant.language_id, [])
      }
      grouped.get(variant.language_id)!.push(variant)
    }

    return grouped
  }, [variants])

  return (
    <div className="border rounded p-3 bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={onToggleExpanded}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          {channelName}
        </button>
        <TriStateCheckbox
          value={channelOverride}
          onChange={onToggleOverride}
          disabled={isLoading}
          label=""
        />
      </div>

      {isExpanded && (
        <div className="mt-3 ml-6 space-y-2">
          {channelOverride !== null && (
            <div className="mb-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (variants && variants.length > 0) {
                    const cttIds = variants.map(v => v.ctt_id)
                    onBatchUpdateRequest(cttIds)
                  }
                }}
                disabled={!variants || variants.length === 0}
              >
                Apply to all languages
              </Button>
            </div>
          )}
          {isLoadingVariants ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading variants...
            </div>
          ) : variants && variants.length > 0 ? (
            <VariantsList
              variantsByLanguage={variantsByLanguage}
              projectId={projectId}
              contentTypeId={contentTypeId}
              channelId={channelId}
            />
          ) : (
            <div className="text-sm text-gray-500">No variants found</div>
          )}
        </div>
      )}
    </div>
  )
}

interface VariantsListProps {
  variantsByLanguage: Map<number, Array<{ id: string; language_id: number; language_name: string; seo_required_override: boolean | null }>>
  projectId: number
  contentTypeId: number
  channelId: number | null
}

function VariantsList({ variantsByLanguage, projectId, contentTypeId, channelId }: VariantsListProps) {
  const toggleVariant = useToggleVariantSEOOverride()

  const handleVariantToggle = async (variantId: string, newValue: TriState) => {
    try {
      await toggleVariant.mutateAsync({
        variantId,
        seoRequired: newValue,
        projectId,
        contentTypeId,
        channelId,
      })
      toast({
        title: 'Success',
        description: 'Variant SEO override updated',
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update variant SEO override',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-3">
      {Array.from(variantsByLanguage.entries()).map(([languageId, languageVariants]) => (
        <div key={languageId} className="bg-white rounded border p-2">
          <div className="text-xs font-medium text-gray-600 mb-2">
            {languageVariants[0]?.language_name || `Language ${languageId}`}
          </div>
          <div className="space-y-1">
            {languageVariants
              .filter((variant) => variant.id) // Only show variants with valid IDs
              .map((variant) => (
                <div key={variant.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">
                    Variant {variant.id.slice(0, 8)}
                  </span>
                  <TriStateCheckbox
                    value={variant.seo_required_override}
                    onChange={(value) => handleVariantToggle(variant.id, value)}
                    disabled={toggleVariant.isPending}
                    label=""
                  />
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}

