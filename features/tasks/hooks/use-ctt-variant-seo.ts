"use client"

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export interface CTTVariantSEO {
  ctt_id: string
  channel_id: number | null
  language_id: number
  primary_keyword: string | null
  secondary_keywords: string[] | string | null
  seo_required_override: boolean | null
  updated_at: string | null
  // From merged view v_ctt_variant_seo_full
  seo_required: boolean
  seo_source: string | null
}

/**
 * Hook to fetch SEO data for a CTT variant from v_ctt_variant_seo_full
 * This merged view includes both SEO fields and effective flags in a single query
 */
export function useCTTVariantSEO(
  cttId: string | null,
  channelId: number | null,
  languageId: number | null
) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

  // Use unified query key format
  const queryKey = cttId && languageId !== null
    ? ['cttVariant', cttId, languageId, channelId ?? null]
    : null

  const query = useQuery({
    queryKey: queryKey || [],
    queryFn: async () => {
      if (!cttId || languageId === null) {
        console.log('useCTTVariantSEO: Skipping query - missing params', { cttId, languageId, channelId })
        return null
      }

      console.log('useCTTVariantSEO: Fetching from v_ctt_variant_seo_full', { cttId, languageId, channelId })

      // Build query with null-safe channel_id handling
      let query = supabase
        .from('v_ctt_variant_seo_full')
        .select('*')
        .eq('ctt_id', cttId)
        .eq('language_id', languageId)

      // Handle channel_id IS NOT DISTINCT FROM (NULL-safe comparison)
      if (channelId === null) {
        query = query.is('channel_id', null)
      } else {
        query = query.eq('channel_id', channelId)
      }

      const { data, error } = await query.maybeSingle()

      if (error && error.code !== 'PGRST116') {
        console.error('useCTTVariantSEO: Query error', error)
        throw error
      }

      console.log('useCTTVariantSEO: Query result', data)
      return data as CTTVariantSEO | null
    },
    staleTime: 30_000, // 30 seconds
    enabled: !!(cttId && languageId !== null && languageId !== undefined),
  })

  // Mutation to update keywords
  const updateKeywordsMutation = useMutation({
    mutationFn: async ({
      primaryKeyword,
      secondaryKeywords,
    }: {
      primaryKeyword: string
      secondaryKeywords: string
    }) => {
      if (!cttId || languageId === null || !queryKey) {
        throw new Error('Missing required parameters')
      }

      console.log('updateKeywordsMutation called with:', { primaryKeyword, secondaryKeywords, cttId, channelId, languageId })

      // Use the actual input values directly - MUST be the current input value (no closure issues)
      // Primary keyword: use the string value as-is (trimmed)
      const primaryKeywordValue = typeof primaryKeyword === 'string' ? primaryKeyword.trim() : ''
      
      // Secondary keywords: convert to array using the pattern from user's example
      // Array.isArray(v) ? v : splitByComma(v)
      const secondaryKeywordsArray: string[] = Array.isArray(secondaryKeywords)
        ? secondaryKeywords.filter(Boolean)
        : (secondaryKeywords ?? '').split(',').map(s => s.trim()).filter(Boolean)

      // Build payload with actual values - use values directly, don't coerce undefined to null
      const payload = {
        ctt_id: cttId,
        channel_id: channelId ?? null, // null for generic (no channel) variations
        language_id: languageId,
        primary_keyword: primaryKeywordValue, // MUST be the current input value
        secondary_keywords: secondaryKeywordsArray.length > 0 ? secondaryKeywordsArray : null,
        updated_at: new Date().toISOString(),
      }

      console.log('Upserting with payload (JSON):', JSON.stringify(payload, null, 2))
      console.log('Secondary keywords array:', secondaryKeywordsArray)
      console.log('Primary keyword value type:', typeof primaryKeywordValue, 'value:', JSON.stringify(primaryKeywordValue))

      // Supabase JS upsert with ignoreDuplicates: false sets Prefer: resolution=merge-duplicates header
      // This ensures new values are used on conflict, not ignored
      // Use .select('*') to explicitly request all fields back (avoid potential issues with .select().single())
      const { data, error } = await supabase
        .from('content_types_tasks_variants')
        .upsert(payload, {
          onConflict: 'ctt_id,channel_id,language_id',
          ignoreDuplicates: false, // This sets the right Prefer header for merge-duplicates
        })
        .select('*')
        .single()

      if (error) {
        console.error('Upsert error:', error)
        throw error
      }

      console.log('Upsert successful, returned data:', data)
      return data
    },
    onSuccess: () => {
      if (queryKey) {
        // Invalidate the unified query key
        queryClient.invalidateQueries({ queryKey: ['cttVariant', cttId, languageId, channelId ?? null] })
      }
    },
  })

  // Mutation to toggle SEO required override
  const toggleSEORequiredMutation = useMutation({
    mutationFn: async (seoRequired: boolean) => {
      if (!cttId || languageId === null || !queryKey) {
        throw new Error('Missing required parameters')
      }

      // Use JSON upsert (single object, not array) to handle case where variant row doesn't exist yet
      const payload = {
        ctt_id: cttId,
        channel_id: channelId ?? null, // null is allowed for generic (no channel) variations
        language_id: languageId,
        seo_required_override: seoRequired,
        updated_at: new Date().toISOString(),
      }

      // Supabase JS upsert with ignoreDuplicates: false sets Prefer: resolution=merge-duplicates header
      const { data, error } = await supabase
        .from('content_types_tasks_variants')
        .upsert(payload, {
          onConflict: 'ctt_id,channel_id,language_id',
          ignoreDuplicates: false, // This sets the right Prefer header for merge-duplicates
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      if (queryKey) {
        // Invalidate the unified query key
        queryClient.invalidateQueries({ queryKey: ['cttVariant', cttId, languageId, channelId ?? null] })
      }
    },
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    updateKeywords: updateKeywordsMutation.mutateAsync,
    isUpdatingKeywords: updateKeywordsMutation.isPending,
    toggleSEORequired: toggleSEORequiredMutation.mutateAsync,
    isTogglingSEO: toggleSEORequiredMutation.isPending,
  }
}

