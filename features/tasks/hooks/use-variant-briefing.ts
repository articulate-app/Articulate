"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useQuery } from '@tanstack/react-query'
import { BriefingType, BriefingComponent } from './use-briefing-types'

// Re-export BriefingComponent for convenience
export type { BriefingComponent, BriefingType }

export interface UseVariantBriefingTypeResult {
  briefingTypeId: number | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export interface UseVariantBriefingComponentsResult {
  items: BriefingComponent[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Get variant ID from cttId, channelId, and languageId
 * Also fetches current briefing type with title and description
 */
export function useVariantId(
  cttId: string | null,
  channelId: number | null,
  languageId: number | null
) {
  const supabase = createClientComponentClient()

  return useQuery({
    queryKey: ['variantId', cttId, channelId, languageId],
    queryFn: async () => {
      if (!cttId || languageId === null) return null

      let query = supabase
        .from('content_types_tasks_variants')
        .select('id, briefing_type_id, briefing_types(title, description)')
        .eq('ctt_id', cttId)
        .eq('language_id', languageId)

      if (channelId === null) {
        query = query.is('channel_id', null)
      } else {
        query = query.eq('channel_id', channelId)
      }

      const { data, error } = await query.maybeSingle()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      if (!data) return null

      return {
        id: data.id,
        briefing_type_id: data.briefing_type_id,
        briefing_type_title: (data.briefing_types as any)?.title || null,
        briefing_type_description: (data.briefing_types as any)?.description || null,
      }
    },
    enabled: !!(cttId && languageId !== null),
    staleTime: 30_000,
  })
}

/**
 * Hook to fetch briefing type for a variant
 */
export function useVariantBriefingType(
  variantId: string | null
): UseVariantBriefingTypeResult {
  const [briefingTypeId, setBriefingTypeId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = useMemo(() => createClientComponentClient(), [])

  const fetchBriefingType = useCallback(async () => {
    if (!variantId) {
      setBriefingTypeId(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('content_types_tasks_variants')
        .select('briefing_type_id')
        .eq('id', variantId)
        .maybeSingle()

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError
      }

      setBriefingTypeId(data?.briefing_type_id ?? null)
    } catch (err: any) {
      console.error('Failed to fetch variant briefing type:', err)
      setError(err.message || 'Failed to fetch briefing type')
    } finally {
      setLoading(false)
    }
  }, [variantId, supabase])

  useEffect(() => {
    fetchBriefingType()
  }, [fetchBriefingType])

  return {
    briefingTypeId,
    loading,
    error,
    refresh: fetchBriefingType,
  }
}

/**
 * Hook to fetch briefing components for a variant
 */
export function useVariantBriefingComponents(
  variantId: string | null,
  shouldLoad: boolean = false
): UseVariantBriefingComponentsResult {
  const [items, setItems] = useState<BriefingComponent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = useMemo(() => createClientComponentClient(), [])

  const fetchComponents = useCallback(async () => {
    if (!variantId || !shouldLoad) {
      setItems([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc('briefing_components_for_variant', {
        p_variant_id: variantId,
      })

      if (rpcError) throw rpcError

      const components = data || []
      setItems(components)
    } catch (err: any) {
      console.error('Failed to fetch variant briefing components:', err)
      setError(err.message || 'Failed to fetch briefing components')
    } finally {
      setLoading(false)
    }
  }, [variantId, shouldLoad, supabase])

  const refresh = useCallback(async () => {
    await fetchComponents()
  }, [fetchComponents])

  useEffect(() => {
    if (variantId && shouldLoad) {
      fetchComponents()
    }
  }, [variantId, shouldLoad]) // Remove fetchComponents from dependencies

  return {
    items,
    loading,
    error,
    refresh,
  }
}

/**
 * Action functions for variant briefing operations
 */
export function useVariantBriefingActions() {
  const supabase = useMemo(() => createClientComponentClient(), [])

  const setBriefingType = useCallback(async (variantId: string, briefingTypeId: number) => {
    try {
      const { error } = await supabase.rpc('variant_set_briefing', {
        p_variant_id: variantId,
        p_briefing_type_id: briefingTypeId,
      })

      if (error) throw error

      return { success: true }
    } catch (err: any) {
      console.error('Failed to set variant briefing type:', err)
      return { success: false, error: err.message }
    }
  }, [supabase])

  const toggleComponent = useCallback(async (
    variantId: string,
    componentId: number,
    selected: boolean,
    isProjectComponent?: boolean,
    position?: number,
    customTitle?: string,
    customDescription?: string
  ) => {
    try {
      // Note: variant_set_component only accepts briefing_component_id (p_component_id)
      // Project components (negative IDs) are not directly supported at variant level
      // For project components, we need to use the absolute value as briefing_component_id
      const isProject = isProjectComponent ?? (componentId < 0)
      
      // For project components, we use the absolute value as the component_id
      // This assumes project components are mapped to briefing components somehow
      // If this doesn't work, we may need to handle project components differently
      const actualComponentId = isProject ? Math.abs(componentId) : componentId
      
      const { error } = await supabase.rpc('variant_set_component', {
        p_variant_id: variantId,
        p_component_id: actualComponentId,
        p_selected: selected,
        p_position: position || null,
        p_custom_title: customTitle || null,
        p_custom_description: customDescription || null,
      })

      if (error) throw error

      return { success: true }
    } catch (err: any) {
      console.error('Failed to toggle variant component:', err)
      return { success: false, error: err.message }
    }
  }, [supabase])

  const removeComponent = useCallback(async (variantId: string, componentId: number, isProjectComponent?: boolean) => {
    try {
      const isProject = isProjectComponent ?? (componentId < 0)
      
      const { error } = await supabase.rpc('variant_remove_component', {
        p_variant_id: variantId,
        p_component_id: isProject ? null : componentId,
        p_project_component_id: isProject ? Math.abs(componentId) : null,
      })

      if (error) throw error

      return { success: true }
    } catch (err: any) {
      console.error('Failed to remove variant component:', err)
      return { success: false, error: err.message }
    }
  }, [supabase])

  const reorderComponents = useCallback(async (
    variantId: string,
    orderArray: Array<{ component_id: number; position: number }>
  ) => {
    try {
      // Pass the order array directly - Supabase will serialize it correctly
      // The RPC expects an array of objects with component_id and position
      const { error } = await supabase.rpc('variant_reorder_components', {
        p_variant_id: variantId,
        p_order: orderArray,
      })

      if (error) throw error

      return { success: true }
    } catch (err: any) {
      console.error('Failed to reorder variant components:', err)
      return { success: false, error: err.message }
    }
  }, [supabase])

  return {
    setBriefingType,
    toggleComponent,
    removeComponent,
    reorderComponents,
  }
}

