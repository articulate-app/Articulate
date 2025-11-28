"use client"

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export interface ProjectCTChannelSEO {
  project_id: number
  content_type_id: number
  channel_id: number | null
  seo_required: boolean
  seo_required_project_override: boolean | null
  seo_required_channel_override: boolean | null
}

export interface ProjectCTVariantSEO {
  id: string // variant id (content_types_tasks_variants.id)
  ctt_id: string
  channel_id: number | null
  language_id: number
  language_name: string
  seo_required_override: boolean | null
}

/**
 * Hook to fetch SEO summary for a project from v_project_ct_channel_seo
 */
export function useProjectSEOSummary(projectId: number | undefined) {
  const supabase = createClientComponentClient()

  return useQuery({
    queryKey: ['projectSEO:summary', projectId],
    queryFn: async () => {
      if (!projectId) return null

      const { data, error } = await supabase
        .from('v_project_ct_channel_seo')
        .select('*')
        .eq('project_id', projectId)
        .order('content_type_id')
        .order('channel_id', { nullsFirst: false })

      if (error) throw error
      return (data || []) as ProjectCTChannelSEO[]
    },
    enabled: !!projectId,
    staleTime: 30_000, // 30 seconds
  })
}

/**
 * Hook to fetch variants SEO for a project content type and channel
 */
export function useProjectCTVariantsSEO(
  projectId: number | undefined,
  contentTypeId: number | undefined,
  channelId: number | null | undefined,
  limit = 100,
  offset = 0,
  shouldLoad: boolean = true
) {
  const supabase = createClientComponentClient()

  return useQuery({
    queryKey: ['projectSEO:variants', projectId, contentTypeId, channelId, limit, offset],
    queryFn: async () => {
      if (!projectId || contentTypeId === undefined || channelId === undefined) return null

      const { data, error } = await supabase.rpc('project_ct_variants_seo', {
        p_project_id: projectId,
        p_content_type_id: contentTypeId,
        p_channel_id: channelId,
        p_limit: limit,
        p_offset: offset,
      })

      if (error) throw error
      return (data || []) as ProjectCTVariantSEO[]
    },
    enabled: !!projectId && contentTypeId !== undefined && channelId !== undefined && shouldLoad,
    staleTime: 30_000,
  })
}

/**
 * Hook to toggle project-level SEO override
 */
export function useToggleProjectSEOOverride() {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      contentTypeId,
      seoRequired,
    }: {
      projectId: number
      contentTypeId: number
      seoRequired: boolean | null // null to delete override
    }) => {
      if (seoRequired === null) {
        // Delete override
        const { error } = await supabase
          .from('project_content_type_settings')
          .delete()
          .eq('project_id', projectId)
          .eq('content_type_id', contentTypeId)

        if (error) throw error
        return null
      } else {
        // Upsert override
        const { data, error } = await supabase
          .from('project_content_type_settings')
          .upsert(
            {
              project_id: projectId,
              content_type_id: contentTypeId,
              seo_required_override: seoRequired,
            },
            {
              onConflict: 'project_id,content_type_id',
            }
          )
          .select()
          .single()

        if (error) throw error
        return data
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate summary cache
      queryClient.invalidateQueries({ queryKey: ['projectSEO:summary', variables.projectId] })
    },
  })
}

/**
 * Hook to toggle channel-level SEO override
 */
export function useToggleChannelSEOOverride() {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      contentTypeId,
      channelId,
      seoRequired,
    }: {
      projectId: number
      contentTypeId: number
      channelId: number | null
      seoRequired: boolean | null // null to delete override
    }) => {
      if (seoRequired === null) {
        // Delete override
        let query = supabase
          .from('project_content_types_channel_settings')
          .delete()
          .eq('project_id', projectId)
          .eq('content_type_id', contentTypeId)

        if (channelId === null) {
          query = query.is('channel_id', null)
        } else {
          query = query.eq('channel_id', channelId)
        }

        const { error } = await query
        if (error) throw error
        return null
      } else {
        // Upsert override
        const { data, error } = await supabase
          .from('project_content_types_channel_settings')
          .upsert(
            {
              project_id: projectId,
              content_type_id: contentTypeId,
              channel_id: channelId,
              seo_required_override: seoRequired,
            },
            {
              onConflict: 'project_id,content_type_id,channel_id',
            }
          )
          .select()
          .single()

        if (error) throw error
        return data
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate summary and variants caches
      queryClient.invalidateQueries({ queryKey: ['projectSEO:summary', variables.projectId] })
      queryClient.invalidateQueries({
        queryKey: ['projectSEO:variants', variables.projectId, variables.contentTypeId, variables.channelId],
      })
    },
  })
}

/**
 * Hook to toggle variant-level SEO override
 */
export function useToggleVariantSEOOverride() {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      variantId,
      seoRequired,
      projectId,
      contentTypeId,
      channelId,
    }: {
      variantId: string
      seoRequired: boolean | null
      projectId: number
      contentTypeId: number
      channelId: number | null
    }) => {
      const { data, error } = await supabase
        .from('content_types_tasks_variants')
        .update({ seo_required_override: seoRequired })
        .eq('id', variantId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      // Invalidate variants cache
      queryClient.invalidateQueries({
        queryKey: ['projectSEO:variants', variables.projectId, variables.contentTypeId, variables.channelId],
      })
      queryClient.invalidateQueries({ queryKey: ['projectSEO:summary', variables.projectId] })
    },
  })
}

/**
 * Hook to batch update channel-wide variant SEO overrides
 * Uses the SQL pattern: update content_types_tasks_variants
 *   set seo_required_override = :value
 * where ctt_id = any(:ctt_ids_array)
 *   and channel_id is not distinct from :channel_id
 */
export function useBatchUpdateChannelVariantsSEO() {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      cttIds,
      channelId,
      seoRequired,
      projectId,
      contentTypeId,
    }: {
      cttIds: string[]
      channelId: number | null
      seoRequired: boolean | null
      projectId: number
      contentTypeId: number
    }) => {
      // Use RPC or direct update with proper null handling
      // Supabase JS handles `is not distinct from` via `.is()` with null
      let query = supabase
        .from('content_types_tasks_variants')
        .update({ seo_required_override: seoRequired })
        .in('ctt_id', cttIds)

      // Handle null-safe channel_id comparison using `.is()` for null or `.eq()` for non-null
      if (channelId === null) {
        query = query.is('channel_id', null)
      } else {
        query = query.eq('channel_id', channelId)
      }

      const { data, error } = await query.select()

      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      // Invalidate variants cache
      queryClient.invalidateQueries({
        queryKey: ['projectSEO:variants', variables.projectId, variables.contentTypeId, variables.channelId],
      })
      queryClient.invalidateQueries({ queryKey: ['projectSEO:summary', variables.projectId] })
    },
  })
}

