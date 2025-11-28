"use client"

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export interface VariantSEOFlags {
  ctt_id: string
  channel_id: number | null
  language_id: number
  seo_required: boolean
  seo_source: string | null
  seo_required_override: boolean | null
}

export interface UseVariantSEOFlagsResult {
  flags: VariantSEOFlags | null
  loading: boolean
  error: string | null
}

/**
 * Hook to fetch variant-level SEO flags from v_ctt_variant_seo_full
 * Now uses the merged view which includes flags and SEO data in one query
 * This hook primarily exists for backward compatibility - consider using useCTTVariantSEO directly
 */
export function useVariantSEOFlags(
  cttId: string | null,
  channelId: number | null,
  languageId: number | null
): UseVariantSEOFlagsResult {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()
  
  // Use unified query key format to share cache with useCTTVariantSEO
  const queryKey = cttId && languageId !== null
    ? ['cttVariant', cttId, languageId, channelId ?? null]
    : null

  const query = useQuery({
    queryKey: queryKey || [],
    queryFn: async () => {
      if (!cttId || languageId === null) return null

      // Use the merged view which includes both SEO fields and effective flags
      // Build query with null-safe channel_id handling
      let flagsQuery = supabase
        .from('v_ctt_variant_seo_full')
        .select('seo_required, seo_source, seo_required_override')
        .eq('ctt_id', cttId)
        .eq('language_id', languageId)

      // Handle channel_id IS NOT DISTINCT FROM (NULL-safe comparison)
      if (channelId === null) {
        flagsQuery = flagsQuery.is('channel_id', null)
      } else {
        flagsQuery = flagsQuery.eq('channel_id', channelId)
      }

      const { data, error } = await flagsQuery.maybeSingle()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      if (!data) return null

      return {
        ctt_id: cttId,
        channel_id: channelId,
        language_id: languageId,
        seo_required: data.seo_required || false,
        seo_source: data.seo_source || null,
        seo_required_override: data.seo_required_override ?? null,
      } as VariantSEOFlags
    },
    staleTime: 30_000, // 30 seconds - same as SEO query
    enabled: !!(cttId && languageId !== null),
  })

  return {
    flags: query.data ?? null,
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
  }
}

