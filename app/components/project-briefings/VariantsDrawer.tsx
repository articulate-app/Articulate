"use client"

import React, { useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SlidePanel } from '../ui/slide-panel'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Badge } from '../ui/badge'
import { toast } from '../ui/use-toast'
import { Loader2, ExternalLink } from 'lucide-react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import {
  type Variant,
  setVariantBriefing,
} from '../../lib/services/project-briefings'
import {
  fetchProjectBriefingTypes,
  type ProjectBriefingType,
} from '../../lib/services/project-briefings'

interface VariantsDrawerProps {
  isOpen: boolean
  onClose: () => void
  projectId: number
  briefingTypeId: number | null
}

export function VariantsDrawer({
  isOpen,
  onClose,
  projectId,
  briefingTypeId,
}: VariantsDrawerProps) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [contentTypeFilter, setContentTypeFilter] = useState<number | null>(null)
  const [channelFilter, setChannelFilter] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 25

  // Fetch project briefing types for the dropdown
  const { data: briefingTypes } = useQuery({
    queryKey: ['projBriefings:list', projectId],
    queryFn: async () => {
      const { data, error } = await fetchProjectBriefingTypes(projectId)
      if (error) throw error
      return data || []
    },
  })

  // Fetch content types for filter
  const { data: contentTypes } = useQuery({
    queryKey: ['contentTypes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_types')
        .select('id, title')
        .order('title')
      if (error) throw error
      return data || []
    },
  })

  // Fetch channels for filter
  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channels')
        .select('id, name')
        .order('name')
      if (error) throw error
      return data || []
    },
  })

  // Fetch variants
  const { data: variantsData, isLoading: isLoadingVariants, error: variantsError } = useQuery({
    queryKey: ['projBriefings:variants', projectId, briefingTypeId, contentTypeFilter, channelFilter, page],
    queryFn: async () => {
      // Note: This RPC may need to be adapted based on actual backend implementation
      // For now, using a direct query as fallback
      const { data, error } = await supabase
        .from('content_types_tasks_variants')
        .select(`
          id,
          ctt_id,
          channel_id,
          language_id,
          briefing_type_id,
          content_types_tasks!inner(
            id,
            tasks!inner(project_id_int),
            content_types!inner(id, title)
          ),
          channels(id, name),
          languages(id, code)
        `)
        .eq('content_types_tasks.tasks.project_id_int', projectId)
        .order('id', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)

      if (error) throw error

      // Transform to Variant format
      const transformed: Variant[] = (data || []).map((v: any) => ({
        variant_id: v.id,
        content_type_id: v.content_types_tasks.content_types.id,
        content_type_title: v.content_types_tasks.content_types.title,
        channel_id: v.channel_id,
        channel_name: v.channels?.name || null,
        language_id: v.language_id,
        language_code: v.languages?.code || '',
        briefing_type_id: v.briefing_type_id,
        matches_briefing: v.briefing_type_id === briefingTypeId,
      }))

      return {
        variants: transformed,
        hasMore: (data || []).length === pageSize,
      }
    },
    enabled: isOpen, // Only fetch when drawer is open
  })

  const handleSetBriefing = useCallback(
    async (variantId: string, newBriefingTypeId: number | null) => {
      try {
        const { error } = await setVariantBriefing(variantId, newBriefingTypeId)
        if (error) throw error

        toast({
          title: 'Success',
          description: 'Briefing type updated for variant',
        })

        queryClient.invalidateQueries({
          queryKey: ['projBriefings:variants', projectId, briefingTypeId, contentTypeFilter, channelFilter, page],
        })
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to update briefing type',
          variant: 'destructive',
        })
      }
    },
    [projectId, briefingTypeId, contentTypeFilter, channelFilter, page, queryClient]
  )

  const handleOpenInTask = useCallback((variantId: string) => {
    // Extract CTT ID from variant and navigate to task
    // This is a placeholder - may need adjustment based on actual data structure
    router.push(`/tasks?id=${variantId}&view=content`)
    onClose()
  }, [router, onClose])

  const filteredVariants = useMemo(() => {
    if (!variantsData?.variants) return []

    let filtered = variantsData.variants

    if (contentTypeFilter) {
      filtered = filtered.filter(v => v.content_type_id === contentTypeFilter)
    }

    if (channelFilter) {
      filtered = filtered.filter(v => v.channel_id === channelFilter)
    }

    return filtered
  }, [variantsData, contentTypeFilter, channelFilter])

  return (
    <SlidePanel isOpen={isOpen} onClose={onClose} position="right" title="Variants">
      <div className="flex flex-col h-full">
        {/* Filters */}
        <div className="space-y-3 mb-4 pb-4 border-b">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              Content Type
            </label>
            <Select
              value={contentTypeFilter ? String(contentTypeFilter) : 'all'}
              onValueChange={(v) => setContentTypeFilter(v === 'all' ? null : Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="All content types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All content types</SelectItem>
                {contentTypes?.map(ct => (
                  <SelectItem key={ct.id} value={String(ct.id)}>
                    {ct.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Channel</label>
            <Select
              value={channelFilter ? String(channelFilter) : 'all'}
              onValueChange={(v) => setChannelFilter(v === 'all' ? null : Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="All channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                {channels?.map(ch => (
                  <SelectItem key={ch.id} value={String(ch.id)}>
                    {ch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Variants list */}
        <div className="flex-1 overflow-auto">
          {isLoadingVariants ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : variantsError ? (
            <div className="text-red-600 text-sm p-4">
              Error loading variants: {String(variantsError)}
            </div>
          ) : filteredVariants.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No variants found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredVariants.map(variant => (
                <div
                  key={variant.variant_id}
                  className="border rounded-lg p-4 bg-white border-gray-200"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-gray-900">
                          {variant.content_type_title}
                        </h3>
                        {variant.matches_briefing && (
                          <Badge variant="outline" className="text-xs">
                            Matches
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 space-y-1">
                        {variant.channel_name && <div>Channel: {variant.channel_name}</div>}
                        <div>Language: {variant.language_code}</div>
                        {variant.briefing_type_id && (
                          <div>
                            Briefing:{' '}
                            {
                              briefingTypes?.find(
                                bt => bt.briefing_type_id === variant.briefing_type_id
                              )?.display_title || `ID ${variant.briefing_type_id}`
                            }
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                    <Select
                      value={
                        variant.briefing_type_id
                          ? String(variant.briefing_type_id)
                          : 'none'
                      }
                      onValueChange={(v) =>
                        handleSetBriefing(
                          variant.variant_id,
                          v === 'none' ? null : Number(v)
                        )
                      }
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Set briefing..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {briefingTypes?.map(bt => (
                          <SelectItem
                            key={bt.briefing_type_id}
                            value={String(bt.briefing_type_id)}
                          >
                            {bt.display_title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenInTask(variant.variant_id)}
                      title="Open in task"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {variantsData?.hasMore && (
          <div className="flex items-center justify-center gap-2 pt-4 border-t">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span className="text-sm text-gray-500">Page {page}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage(p => p + 1)}
              disabled={!variantsData.hasMore}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </SlidePanel>
  )
}

