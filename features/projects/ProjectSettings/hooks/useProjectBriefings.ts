"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export interface ProjectBriefingType {
  project_id: number
  briefing_type_id: number
  title: string
  description: string | null
  is_default: boolean
  position: number | null
}

export interface AvailableBriefingType {
  id: number
  title: string
  description: string | null
}

export interface UseProjectBriefingsResult {
  briefingTypes: ProjectBriefingType[]
  availableTypes: AvailableBriefingType[]
  loading: boolean
  error: string | null
  addBriefingType: (briefingTypeId: number, isDefault?: boolean) => Promise<{ success: boolean; error?: string }>
  removeBriefingType: (briefingTypeId: number) => Promise<{ success: boolean; error?: string }>
  setDefaultBriefingType: (briefingTypeId: number) => Promise<{ success: boolean; error?: string }>
  reorderBriefingTypes: (orderArray: Array<{ briefing_type_id: number; position: number }>) => Promise<{ success: boolean; error?: string }>
  refresh: () => Promise<void>
}

/**
 * Hook to manage project briefing types
 */
export function useProjectBriefings(projectId: number | null): UseProjectBriefingsResult {
  const [briefingTypes, setBriefingTypes] = useState<ProjectBriefingType[]>([])
  const [availableTypes, setAvailableTypes] = useState<AvailableBriefingType[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = useMemo(() => createClientComponentClient(), [])

  // Fetch project briefing types
  const fetchProjectBriefingTypes = useCallback(async () => {
    if (!projectId) {
      setBriefingTypes([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      console.log('🔍 useProjectBriefings: fetchBriefingTypes called for projectId:', projectId)
      const { data, error: queryError } = await supabase
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

      if (queryError) throw queryError

      // Transform the data to match the interface
      const transformedData: ProjectBriefingType[] = (data || []).map((item: any) => ({
        project_id: projectId,
        briefing_type_id: item.briefing_type_id,
        title: item.briefing_types.title,
        description: item.briefing_types.description,
        is_default: item.is_default,
        position: item.position
      }))

      setBriefingTypes(transformedData)
    } catch (err: any) {
      console.error('Failed to fetch project briefing types:', err)
      setError(err.message || 'Failed to fetch project briefing types')
    } finally {
      setLoading(false)
    }
  }, [projectId, supabase])

  // Fetch available briefing types (not yet assigned to project)
  const fetchAvailableBriefingTypes = useCallback(async () => {
    if (!projectId) return

    try {
      // Get all briefing types
      const { data: allTypes, error: allTypesError } = await supabase
        .from('briefing_types')
        .select('id, title, description')
        .order('title')

      if (allTypesError) throw allTypesError

      // Get already assigned briefing type IDs
      const assignedIds = briefingTypes.map(bt => bt.briefing_type_id)
      
      // Filter out already assigned types
      const available = (allTypes || []).filter(type => !assignedIds.includes(type.id))
      
      setAvailableTypes(available)
    } catch (err: any) {
      console.error('Failed to fetch available briefing types:', err)
    }
  }, [projectId, briefingTypes, supabase])

  // Add briefing type to project
  const addBriefingType = useCallback(async (briefingTypeId: number, isDefault: boolean = false) => {
    if (!projectId) return { success: false, error: 'No project ID' }

    try {
      // Get next position
      const nextPosition = briefingTypes.length + 1

      const { error } = await supabase.rpc('add_project_briefing_type', {
        p_project_id: projectId,
        p_briefing_type_id: briefingTypeId,
        p_is_default: isDefault,
        p_position: nextPosition
      })

      if (error) throw error

      // Refresh data
      await fetchProjectBriefingTypes()
      await fetchAvailableBriefingTypes()

      return { success: true }
    } catch (err: any) {
      console.error('Failed to add briefing type:', err)
      return { success: false, error: err.message }
    }
  }, [projectId, briefingTypes.length, supabase, fetchProjectBriefingTypes, fetchAvailableBriefingTypes])

  // Remove briefing type from project
  const removeBriefingType = useCallback(async (briefingTypeId: number) => {
    if (!projectId) return { success: false, error: 'No project ID' }

    try {
      const { error } = await supabase.rpc('remove_project_briefing_type', {
        p_project_id: projectId,
        p_briefing_type_id: briefingTypeId
      })

      if (error) throw error

      // Refresh data
      await fetchProjectBriefingTypes()
      await fetchAvailableBriefingTypes()

      return { success: true }
    } catch (err: any) {
      console.error('Failed to remove briefing type:', err)
      return { success: false, error: err.message }
    }
  }, [projectId, supabase, fetchProjectBriefingTypes, fetchAvailableBriefingTypes])

  // Set default briefing type
  const setDefaultBriefingType = useCallback(async (briefingTypeId: number) => {
    if (!projectId) return { success: false, error: 'No project ID' }

    try {
      const { error } = await supabase.rpc('set_project_default_briefing_type', {
        p_project_id: projectId,
        p_briefing_type_id: briefingTypeId
      })

      if (error) throw error

      // Refresh data
      await fetchProjectBriefingTypes()

      return { success: true }
    } catch (err: any) {
      console.error('Failed to set default briefing type:', err)
      return { success: false, error: err.message }
    }
  }, [projectId, supabase, fetchProjectBriefingTypes])

  // Reorder briefing types
  const reorderBriefingTypes = useCallback(async (orderArray: Array<{ briefing_type_id: number; position: number }>) => {
    if (!projectId) return { success: false, error: 'No project ID' }

    try {
      const { error } = await supabase.rpc('reorder_project_briefing_types', {
        p_project_id: projectId,
        p_order: orderArray
      })

      if (error) throw error

      // Refresh data
      await fetchProjectBriefingTypes()

      return { success: true }
    } catch (err: any) {
      console.error('Failed to reorder briefing types:', err)
      return { success: false, error: err.message }
    }
  }, [projectId, supabase, fetchProjectBriefingTypes])

  // Refresh all data
  const refresh = useCallback(async () => {
    await fetchProjectBriefingTypes()
    await fetchAvailableBriefingTypes()
  }, [fetchProjectBriefingTypes, fetchAvailableBriefingTypes])

  // Initial load
  useEffect(() => {
    fetchProjectBriefingTypes()
  }, [fetchProjectBriefingTypes])

  // Fetch available types when briefing types change
  useEffect(() => {
    fetchAvailableBriefingTypes()
  }, [fetchAvailableBriefingTypes])

  return {
    briefingTypes,
    availableTypes,
    loading,
    error,
    addBriefingType,
    removeBriefingType,
    setDefaultBriefingType,
    reorderBriefingTypes,
    refresh
  }
}
