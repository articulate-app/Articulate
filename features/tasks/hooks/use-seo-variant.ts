"use client"

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import debounce from 'lodash.debounce'
import { useMemo, useRef, useCallback, useEffect } from 'react'

interface SEOVariantData {
  primary_keyword: string | null
  secondary_keywords: string[] | string | null
  updated_at?: string | null
}

export function useSEOVariant(
  cttId: string | null,
  channelId: number | null,
  languageId: number | null
) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()
  
  // Create query key for this specific variation
  const queryKey = useMemo(() => {
    if (!cttId || languageId === null) return null
    return ['seo-variant', cttId, channelId ?? 'null', languageId]
  }, [cttId, channelId, languageId])

  // Read-only query for the active variation
  const { data, isLoading, error } = useQuery({
    queryKey: queryKey || [],
    queryFn: async () => {
      if (!cttId || languageId === null) return null

      let query = supabase
        .from('content_types_tasks_variants')
        .select('primary_keyword, secondary_keywords, updated_at')
        .eq('ctt_id', cttId)
        .eq('language_id', languageId)

      // Handle channel_id IS NOT DISTINCT FROM (NULL-safe)
      if (channelId === null) {
        query = query.is('channel_id', null)
      } else {
        query = query.eq('channel_id', channelId)
      }

      const { data, error } = await query.maybeSingle()

      // 406/no row is expected for new variations - treat as empty
      if (error && error.code !== 'PGRST116') {
        throw error
      }

      return data || null
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
    enabled: !!(cttId && languageId !== null),
  })

  // Track if row exists based on query data
  const rowExists = useMemo(() => !!data, [data])

  // Ensure variation exists (create row without touching other fields)
  const ensureVariationMutation = useMutation({
    mutationFn: async () => {
      if (!cttId || languageId === null) return

      await supabase.rpc('ensure_ctt_variant', {
        p_ctt: cttId,
        p_chan: channelId,
        p_lang: languageId,
      })
    },
    onSuccess: () => {
      // Invalidate query to refetch and confirm row exists
      if (queryKey) {
        queryClient.invalidateQueries({ queryKey })
      }
    },
  })

  // Create update mutation - check current state at execution time, not closure
  const updateMutation = useMutation({
    mutationFn: async ({
      primaryKeyword,
      secondaryKeywords,
    }: {
      primaryKeyword: string
      secondaryKeywords: string
    }) => {
      if (!cttId || languageId === null || !queryKey) {
        console.error('Mutation: Missing required params', { cttId, languageId, queryKey })
        return null
      }

      // Check current state from cache at execution time
      const currentData = queryClient.getQueryData(queryKey) as any
      const currentlyExists = !!currentData

      console.log('Mutation executing:', { 
        primaryKeyword, 
        secondaryKeywords, 
        currentlyExists,
        cttId,
        channelId,
        languageId
      })

      // Convert secondary keywords string to array
      const secondaryKeywordsArray = secondaryKeywords
        ? secondaryKeywords.split(',').map(k => k.trim()).filter(k => k.length > 0)
        : []

      const payload: any = {}
      payload.primary_keyword = primaryKeyword || null
      payload.secondary_keywords = secondaryKeywordsArray.length > 0 ? secondaryKeywordsArray : null

      let result

      if (currentlyExists) {
        // Update existing row - only include changed fields
        console.log('Updating existing row')
        let query = supabase
          .from('content_types_tasks_variants')
          .update(payload)
          .eq('ctt_id', cttId)
          .eq('language_id', languageId)

        if (channelId === null) {
          query = query.is('channel_id', null)
        } else {
          query = query.eq('channel_id', channelId)
        }

        result = await query.select().single()
      } else {
        // Create-on-edit: upsert with only the fields being set
        console.log('Creating new row via upsert')
        const upsertPayload = {
          ctt_id: cttId,
          channel_id: channelId ?? null,
          language_id: languageId,
          ...payload,
        }

        result = await supabase
          .from('content_types_tasks_variants')
          .upsert([upsertPayload], {
            onConflict: 'ctt_id,channel_id,language_id',
            ignoreDuplicates: false,
          })
          .select()
          .single()
      }

      if (result.error) {
        console.error('Mutation error:', result.error)
        throw result.error
      }

      console.log('Mutation success:', result.data)
      return result.data
    },
    onSuccess: (newData) => {
      // Optimistically update cache (don't refetch)
      if (queryKey && newData) {
        queryClient.setQueryData(queryKey, newData)
      }
    },
    onError: (error: any) => {
      console.error('Failed to update SEO:', error)
      // Error will be logged, UI can check updateMutation.error if needed
    },
  })

  // Create stable debounced function using useMemo
  const debouncedMutate = useMemo(
    () => debounce(
      (primaryKeyword: string, secondaryKeywords: string) => {
        console.log('Debounced SEO update triggered:', { 
          primaryKeyword, 
          secondaryKeywords, 
          cttId, 
          channelId, 
          languageId 
        })
        updateMutation.mutate({ primaryKeyword, secondaryKeywords })
      },
      700
    ),
    [updateMutation.mutate, cttId, channelId, languageId]
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedMutate.cancel()
    }
  }, [debouncedMutate])

  const updateSEO = useCallback(
    (primaryKeyword: string, secondaryKeywords: string) => {
      console.log('updateSEO called:', { 
        primaryKeyword, 
        secondaryKeywords, 
        hasQueryKey: !!queryKey, 
        cttId, 
        languageId 
      })
      if (!queryKey || !cttId || languageId === null) {
        console.warn('updateSEO: Missing required params', { queryKey, cttId, languageId })
        return
      }
      debouncedMutate(primaryKeyword, secondaryKeywords)
    },
    [queryKey, cttId, languageId, debouncedMutate]
  )

  // Transform data for UI
  const seoData: SEOVariantData | null = data ? {
    primary_keyword: data.primary_keyword,
    secondary_keywords: data.secondary_keywords,
    updated_at: data.updated_at,
  } : null

  return {
    data: seoData,
    isLoading,
    error,
    updateSEO,
    isSaving: updateMutation.isPending,
    updateError: updateMutation.error,
    ensureVariation: ensureVariationMutation.mutate,
    isEnsuring: ensureVariationMutation.isPending,
  }
}
