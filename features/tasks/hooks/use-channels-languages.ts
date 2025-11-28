"use client"

import { useState, useEffect, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface Channel {
  channel_id: number
  name: string
  selected: boolean
}

interface Language {
  language_id: number
  long_name: string
  selected: boolean
}

interface Variation {
  ctt_id: string
  channel_id: number | null
  language_id: number
  primary_keyword: string | null
  secondary_keywords: string[] | string | null
}

export function useChannelsForCtt(cttId: string | null, projectId?: number, contentTypeId?: number) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClientComponentClient()

  const fetchChannels = useCallback(async () => {
    if (!cttId || !contentTypeId) return

    setLoading(true)
    setError(null)
    try {
      let channelsData: any[] = []
      
      // First try project-specific allowlist if projectId is available
      if (projectId) {
        const { data: projectChannels, error: projectError } = await supabase
          .from('project_content_types_channels')
          .select(`
            channel_id,
            position,
            channels!inner(
              id,
              name
            )
          `)
          .eq('project_id', projectId)
          .eq('content_type_id', contentTypeId)
          .order('position', { ascending: true, nullsFirst: false })
        
        if (!projectError && projectChannels && projectChannels.length > 0) {
          channelsData = projectChannels.map((pcc: any) => ({
            channel_id: pcc.channels.id,
            name: pcc.channels.name,
            position: pcc.position,
            selected: false // Will be updated by the view query
          }))
        }
      }
      
      // If no project-specific channels found, fall back to global allowlist
      if (channelsData.length === 0) {
        const { data: globalChannels, error: globalError } = await supabase
          .from('content_types_channels')
          .select(`
            channel_id,
            position,
            channels!inner(
              id,
              name
            )
          `)
          .eq('content_type_id', contentTypeId)
          .order('position', { ascending: true, nullsFirst: false })
        
        if (globalError) throw globalError
        
        channelsData = (globalChannels || []).map((ctc: any) => ({
          channel_id: ctc.channels.id,
          name: ctc.channels.name,
          position: ctc.position,
          selected: false // Will be updated by the view query
        }))
      }
      
      // Now get the selected state from the view
      const { data: selectedChannels, error: viewError } = await supabase
        .from('v_ctt_channels_effective')
        .select('channel_id, selected')
        .eq('ctt_id', cttId)
      
      if (viewError) throw viewError
      
      // Create a map of selected channels
      const selectedMap = new Map(
        (selectedChannels || []).map((sc: any) => [sc.channel_id, sc.selected])
      )
      
      // Update the channels with their selected state and sort
      const finalChannels = channelsData
        .map(channel => ({
          ...channel,
          selected: selectedMap.get(channel.channel_id) || false
        }))
        .sort((a, b) => {
          // First sort by position (nulls last)
          const aPos = a.position ?? 999
          const bPos = b.position ?? 999
          if (aPos !== bPos) return aPos - bPos
          
          // Then sort by name alphabetically
          return a.name.localeCompare(b.name)
        })
      
      setChannels(finalChannels)
    } catch (err: any) {
      setError(err.message)
      console.error('Failed to fetch channels:', err)
    } finally {
      setLoading(false)
    }
  }, [cttId, projectId, contentTypeId, supabase])

  const updateChannels = useCallback(async (channelIds: number[]) => {
    if (!cttId) return

    try {
      const { error } = await supabase.rpc('ctt_set_channels', {
        p_ctt_id: cttId,
        p_channel_ids: channelIds
      })
      
      if (error) throw error
      
      // Refresh channels after update
      await fetchChannels()
    } catch (err: any) {
      console.error('Failed to update channels:', err)
      throw err
    }
  }, [cttId, supabase, fetchChannels])

  useEffect(() => {
    fetchChannels()
  }, [fetchChannels])

  return { channels, loading, error, updateChannels, refresh: fetchChannels }
}

export function useLanguagesForCtt(cttId: string | null) {
  const [languages, setLanguages] = useState<Language[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClientComponentClient()

  const fetchLanguages = useCallback(async () => {
    if (!cttId) return

    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('v_ctt_languages_effective')
        .select('*')
        .eq('ctt_id', cttId)
      
      if (error) throw error
      
      // Transform the data to match the expected format
      const languagesData = (data || []).map((lang: any) => ({
        language_id: lang.language_id,
        long_name: lang.language_name, // Use language_name from the view
        selected: lang.selected || false
      }))
      
      setLanguages(languagesData)
    } catch (err: any) {
      setError(err.message)
      console.error('Failed to fetch languages:', err)
    } finally {
      setLoading(false)
    }
  }, [cttId, supabase])

  const updateLanguages = useCallback(async (languageIds: number[]) => {
    if (!cttId) return

    try {
      const { error } = await supabase.rpc('ctt_set_languages', {
        p_ctt_id: cttId,
        p_language_ids: languageIds
      })
      
      if (error) throw error
      
      // Refresh languages after update
      await fetchLanguages()
    } catch (err: any) {
      console.error('Failed to update languages:', err)
      throw err
    }
  }, [cttId, supabase, fetchLanguages])

  useEffect(() => {
    fetchLanguages()
  }, [fetchLanguages])

  return { languages, loading, error, updateLanguages, refresh: fetchLanguages }
}

// This hook is no longer used for SEO data - use useSEOVariant instead
// Keeping minimal structure for backwards compatibility if needed elsewhere
export function useVariationsForCtt(cttId: string | null) {
  // Removed broad fetch - SEO is now handled by useSEOVariant per-variation
  return {
    variations: [] as Variation[],
    loading: false,
    error: null,
  }
}