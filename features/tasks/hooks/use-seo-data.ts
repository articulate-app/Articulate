"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export interface CTTEffectiveFlags {
  ctt_id: string
  seo_required: boolean
  seo_required_override: boolean | null
  project_seo_required: boolean | null
  content_type_seo_required: boolean
}

export interface TaskSEOFields {
  id: number
  keyword: string | null
  meta_title: string | null
  meta_description: string | null
  h1: string | null
  h2: string | null
  alt_text: string | null
  internal_links: string | null
  tags: string | null
  secondary_keywords: string | null
}

export interface UseSEODataResult {
  effectiveFlags: CTTEffectiveFlags | null
  taskSEOFields: TaskSEOFields | null
  loading: boolean
  error: string | null
  updateSEOFields: (fields: Partial<TaskSEOFields>) => Promise<{ success: boolean; error?: string }>
  toggleSEOOverride: (override: boolean) => Promise<{ success: boolean; error?: string }>
  refresh: () => Promise<void>
}

/**
 * Hook to manage SEO data for a CTT and task
 */
export function useSEOData(cttId: string | null, taskId: number | null): UseSEODataResult {
  const [effectiveFlags, setEffectiveFlags] = useState<CTTEffectiveFlags | null>(null)
  const [taskSEOFields, setTaskSEOFields] = useState<TaskSEOFields | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = useMemo(() => createClientComponentClient(), [])

  // Fetch CTT effective flags and task SEO fields
  const fetchSEOData = useCallback(async () => {
    // Temporarily disabled: SEO will be implemented later and from another table.
    setEffectiveFlags(null)
    setTaskSEOFields(null)
    setLoading(false)
  }, [])

  // Update SEO fields with autosave
  const updateSEOFields = useCallback(async (_fields: Partial<TaskSEOFields>) => {
    // No-op for now
    return { success: true }
  }, [])

  // Toggle SEO override
  const toggleSEOOverride = useCallback(async (override: boolean) => {
    if (!cttId) return { success: false, error: 'No CTT ID' }

    try {
      const { error } = await supabase
        .from('content_types_tasks')
        .update({ seo_required_override: override })
        .eq('id', cttId)

      if (error) throw error

      // Refresh flags to recalculate seo_required
      await fetchSEOData()

      return { success: true }
    } catch (err: any) {
      console.error('Failed to toggle SEO override:', err)
      return { success: false, error: err.message }
    }
  }, [cttId, supabase, fetchSEOData])

  // Refresh all data
  const refresh = useCallback(async () => {
    await fetchSEOData()
  }, [fetchSEOData])

  // Initial load when CTT or task changes
  useEffect(() => {
    fetchSEOData()
  }, [fetchSEOData])

  return {
    effectiveFlags,
    taskSEOFields,
    loading,
    error,
    updateSEOFields,
    toggleSEOOverride,
    refresh
  }
}
