"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export interface BriefingType {
  briefing_type_id: number
  title: string
  description: string | null
  is_default: boolean
  position: number | null
}

export interface BriefingComponent {
  component_id: number
  component_title: string
  component_description: string | null
  selected: boolean
  position: number | null
  custom_title: string | null
  custom_description: string | null
}

export interface UseBriefingTypesResult {
  items: BriefingType[]
  selectedId: number | null
  suggestedDefault: BriefingType | null
  contentData: {
    final_output_text: string | null
    updated_at: string | null
    final_language_code: string | null
  } | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export interface UseBriefingComponentsResult {
  items: BriefingComponent[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Hook to fetch briefing types for a CTT
 */
export function useBriefingTypesForCtt(cttId: string | null): UseBriefingTypesResult {
  const [items, setItems] = useState<BriefingType[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [suggestedDefault, setSuggestedDefault] = useState<BriefingType | null>(null)
  const [contentData, setContentData] = useState<{
    final_output_text: string | null
    updated_at: string | null
    final_language_code: string | null
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = useMemo(() => createClientComponentClient(), [])

  // Simple in-memory cache by projectId
  const projectBriefingTypesCacheRef = useMemo(() => new Map<number, BriefingType[]>(), [])

  const fetchBriefingTypes = useCallback(async () => {
    if (!cttId) {
      setItems([])
      setSelectedId(null)
      setSuggestedDefault(null)
      return
    }

    console.log('🔍 useBriefingTypesForCtt: fetchBriefingTypes called for cttId:', cttId)
    setLoading(true)
    setError(null)

    try {
      // Q1: Get project_id, selected briefing_type_id, and content fields for the CTT
      console.log('🔍 useBriefingTypesForCtt: Q1 - content_types_tasks query (combined)')
      const { data: cttData, error: cttError } = await supabase
        .from('content_types_tasks')
        .select(`
          briefing_type_id,
          final_output_text,
          updated_at,
          final_language_code,
          tasks!inner(project_id_int)
        `)
        .eq('id', cttId)
        .single()

      if (cttError) throw cttError

      const projectId = (cttData.tasks as any)?.project_id_int
      const selectedBriefingTypeId = cttData.briefing_type_id
      
      // Set content data for ContentTypeEditor
      setContentData({
        final_output_text: cttData.final_output_text,
        updated_at: cttData.updated_at,
        final_language_code: cttData.final_language_code
      })

      // Q2: Get project's briefing types with simple cache by projectId
      let transformedItems: BriefingType[] | undefined = projectBriefingTypesCacheRef.get(projectId)
      if (!transformedItems) {
        console.log('🔍 useBriefingTypesForCtt: Q2 - project_briefing_types MISS for projectId:', projectId)
        const { data: briefingTypesData, error: briefingTypesError } = await supabase
          .from('project_briefing_types')
          .select(`
            briefing_type_id,
            is_default,
            position,
            briefing_types!inner(title, description)
          `)
          .eq('project_id', projectId)
          .order('is_default', { ascending: false })
          .order('position', { ascending: true, nullsFirst: false })

        if (briefingTypesError) throw briefingTypesError

        transformedItems = briefingTypesData?.map((item: any) => ({
          briefing_type_id: item.briefing_type_id,
          title: item.briefing_types.title,
          description: item.briefing_types.description,
          is_default: item.is_default,
          position: item.position
        })) || []

        projectBriefingTypesCacheRef.set(projectId, transformedItems)
      } else {
        console.log('🔍 useBriefingTypesForCtt: Q2 - project_briefing_types HIT for projectId:', projectId)
      }

      setItems(transformedItems)
      setSelectedId(selectedBriefingTypeId)

      // Find suggested default (only used if selectedId is null)
      const defaultType = transformedItems.find(item => item.is_default)
      setSuggestedDefault(defaultType || null)

    } catch (err: any) {
      console.error('Failed to fetch briefing types:', err)
      setError(err.message || 'Failed to fetch briefing types')
      setItems([])
      setSelectedId(null)
      setSuggestedDefault(null)
    } finally {
      setLoading(false)
    }
  }, [cttId, supabase])

  const refresh = useCallback(async () => {
    await fetchBriefingTypes()
  }, [fetchBriefingTypes])

  useEffect(() => {
    if (cttId) {
      fetchBriefingTypes()
    }
  }, [cttId]) // Remove fetchBriefingTypes from dependencies to prevent infinite loop

  return {
    items,
    selectedId,
    suggestedDefault,
    contentData,
    loading,
    error,
    refresh
  }
}

/**
 * Hook to fetch briefing components for a CTT
 * Only loads when explicitly requested (after briefing type is selected)
 */
export function useBriefingComponentsForCtt(cttId: string | null, shouldLoad: boolean = false): UseBriefingComponentsResult {
  const [items, setItems] = useState<BriefingComponent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = useMemo(() => createClientComponentClient(), [])

  const fetchBriefingComponents = useCallback(async () => {
    if (!cttId || !shouldLoad) {
      setItems([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc('briefing_components_for_ctt', {
        p_ctt_id: cttId
      })

      if (rpcError) throw rpcError

      const components = data || []
      setItems(components)

    } catch (err: any) {
      console.error('Failed to fetch briefing components:', err)
      setError(err.message || 'Failed to fetch briefing components')
    } finally {
      setLoading(false)
    }
  }, [cttId, shouldLoad, supabase])

  const refresh = useCallback(async () => {
    await fetchBriefingComponents()
  }, [fetchBriefingComponents])

  useEffect(() => {
    if (cttId && shouldLoad) {
      fetchBriefingComponents()
    }
  }, [cttId, shouldLoad]) // Remove fetchBriefingComponents from dependencies to prevent infinite loop

  return {
    items,
    loading,
    error,
    refresh
  }
}

/**
 * Action functions for briefing operations
 */
export function useBriefingActions() {
  const supabase = useMemo(() => createClientComponentClient(), [])

  const setBriefingType = useCallback(async (cttId: string, briefingTypeId: number) => {
    try {
      const { error } = await supabase.rpc('ctt_set_briefing_type', {
        p_ctt_id: cttId,
        p_briefing_type_id: briefingTypeId
      })

      if (error) throw error

      return { success: true }
    } catch (err: any) {
      console.error('Failed to set briefing type:', err)
      return { success: false, error: err.message }
    }
  }, [supabase])

  const toggleComponent = useCallback(async (
    cttId: string,
    componentId: number,
    selected: boolean,
    isProjectComponent?: boolean,
    position?: number,
    customTitle?: string,
    customDescription?: string
  ) => {
    try {
      // Detect component type: negative ID = project component, positive = global
      const isProject = isProjectComponent ?? (componentId < 0)
      
      const { error } = await supabase.rpc('ctt_set_component', {
        p_ctt_id: cttId,
        p_component_id: isProject ? null : componentId,
        p_project_component_id: isProject ? Math.abs(componentId) : null,
        p_selected: selected,
        p_position: position || null,
        p_custom_title: customTitle || null,
        p_custom_description: customDescription || null
      })

      if (error) throw error

      return { success: true }
    } catch (err: any) {
      console.error('Failed to toggle component:', err)
      return { success: false, error: err.message }
    }
  }, [supabase])

  const reorderComponents = useCallback(async (cttId: string, orderArray: Array<{ briefing_component_id?: number | null; project_component_id?: number | null; position: number }>) => {
    try {
      const { error } = await supabase.rpc('ctt_reorder_components', {
        p_ctt_id: cttId,
        p_order: orderArray
      })

      if (error) throw error

      return { success: true }
    } catch (err: any) {
      console.error('Failed to reorder components:', err)
      return { success: false, error: err.message }
    }
  }, [supabase])

  return {
    setBriefingType,
    toggleComponent,
    reorderComponents
  }
}
