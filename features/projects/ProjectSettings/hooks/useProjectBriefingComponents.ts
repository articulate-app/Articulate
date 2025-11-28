"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export interface GlobalComponent {
  component_id: number
  title: string
  description: string | null
}

export interface ProjectComponent {
  component_id: number
  include: boolean
  position: number | null
  custom_title: string | null
  custom_description: string | null
}

export interface DisplayComponent {
  component_id: number
  title: string
  description: string | null
  selected: boolean
  position: number
  custom_title: string | null
  custom_description: string | null
}

export interface UseProjectBriefingComponentsResult {
  displayComponents: DisplayComponent[]
  loading: boolean
  error: string | null
  setComponent: (componentId: number, include: boolean, position?: number, customTitle?: string, customDescription?: string) => Promise<{ success: boolean; error?: string }>
  reorderComponents: (orderArray: Array<{ component_id: number; position: number }>) => Promise<{ success: boolean; error?: string }>
  refresh: () => Promise<void>
}

/**
 * Hook to manage project briefing components for a specific briefing type
 */
export function useProjectBriefingComponents(projectId: number | null, briefingTypeId: number | null): UseProjectBriefingComponentsResult {
  const [displayComponents, setDisplayComponents] = useState<DisplayComponent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = useMemo(() => createClientComponentClient(), [])

  // Fetch global components (Q1) and project template (Q2), then merge
  const fetchComponents = useCallback(async () => {
    if (!projectId || !briefingTypeId) {
      setDisplayComponents([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      console.log('🔍 useProjectBriefingComponents: fetching components for projectId:', projectId, 'briefingTypeId:', briefingTypeId)

      // Q1: Get global component universe for the selected briefing type
      console.log('🔍 useProjectBriefingComponents: Q1 - global components query')
      const { data: globalComponents, error: globalError } = await supabase
        .from('briefing_types_components')
        .select(`
          briefing_component_id,
          briefing_components!inner(title, description)
        `)
        .eq('briefing_type_id', briefingTypeId)
        .order('position', { ascending: true, nullsFirst: false })

      if (globalError) throw globalError

      // Q2: Get project template overrides for that briefing
      console.log('🔍 useProjectBriefingComponents: Q2 - project template query')
      const { data: projectComponents, error: projectError } = await supabase
        .from('project_briefing_types_components')
        .select('briefing_component_id, include, position, custom_title, custom_description')
        .eq('project_id', projectId)
        .eq('briefing_type_id', briefingTypeId)

      if (projectError) throw projectError

      // Transform global components
      const globalComponentsList: GlobalComponent[] = (globalComponents || []).map((item: any) => ({
        component_id: item.briefing_component_id,
        title: item.briefing_components.title,
        description: item.briefing_components.description
      }))

      // Transform project components
      const projectComponentsMap = new Map<number, ProjectComponent>()
      ;(projectComponents || []).forEach((item: any) => {
        projectComponentsMap.set(item.briefing_component_id, {
          component_id: item.briefing_component_id,
          include: item.include,
          position: item.position,
          custom_title: item.custom_title,
          custom_description: item.custom_description
        })
      })

      // Merge components according to client merge rule
      const mergedComponents: DisplayComponent[] = globalComponentsList.map(global => {
        const projectOverride = projectComponentsMap.get(global.component_id)
        
        return {
          component_id: global.component_id,
          title: projectOverride?.custom_title || global.title,
          description: projectOverride?.custom_description || global.description,
          selected: projectOverride ? projectOverride.include : false,
          position: projectOverride?.position || 2147483647, // Large number for unselected
          custom_title: projectOverride?.custom_title || null,
          custom_description: projectOverride?.custom_description || null
        }
      })

      // Sort by position (selected first), then by title
      const sortedComponents = mergedComponents.sort((a, b) => {
        if (a.selected !== b.selected) {
          return a.selected ? -1 : 1 // Selected first
        }
        if (a.position !== b.position) {
          return (a.position || 2147483647) - (b.position || 2147483647)
        }
        return a.title.localeCompare(b.title)
      })

      setDisplayComponents(sortedComponents)

    } catch (err: any) {
      console.error('Failed to fetch briefing components:', err)
      setError(err.message || 'Failed to fetch briefing components')
      setDisplayComponents([])
    } finally {
      setLoading(false)
    }
  }, [projectId, briefingTypeId, supabase])

  // Set component (toggle include, position, custom fields)
  const setComponent = useCallback(async (
    componentId: number, 
    include: boolean, 
    position?: number, 
    customTitle?: string, 
    customDescription?: string
  ) => {
    if (!projectId || !briefingTypeId) return { success: false, error: 'Missing project ID or briefing type ID' }

    try {
      const { error } = await supabase.rpc('set_project_briefing_component', {
        p_project_id: projectId,
        p_briefing_type_id: briefingTypeId,
        p_component_id: componentId,
        p_include: include,
        p_position: position,
        p_custom_title: customTitle,
        p_custom_description: customDescription
      })

      if (error) throw error

      // Refresh data
      await fetchComponents()

      return { success: true }
    } catch (err: any) {
      console.error('Failed to set component:', err)
      return { success: false, error: err.message }
    }
  }, [projectId, briefingTypeId, supabase, fetchComponents])

  // Reorder components
  const reorderComponents = useCallback(async (orderArray: Array<{ component_id: number; position: number }>) => {
    if (!projectId || !briefingTypeId) return { success: false, error: 'Missing project ID or briefing type ID' }

    try {
      const { error } = await supabase.rpc('reorder_project_briefing_components', {
        p_project_id: projectId,
        p_briefing_type_id: briefingTypeId,
        p_order: orderArray
      })

      if (error) throw error

      // Refresh data
      await fetchComponents()

      return { success: true }
    } catch (err: any) {
      console.error('Failed to reorder components:', err)
      return { success: false, error: err.message }
    }
  }, [projectId, briefingTypeId, supabase, fetchComponents])

  // Refresh all data
  const refresh = useCallback(async () => {
    await fetchComponents()
  }, [fetchComponents])

  // Initial load
  useEffect(() => {
    fetchComponents()
  }, [fetchComponents])

  return {
    displayComponents,
    loading,
    error,
    setComponent,
    reorderComponents,
    refresh
  }
}
