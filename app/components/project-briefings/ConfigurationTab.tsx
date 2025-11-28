"use client"

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Checkbox } from '../ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { SlidePanel } from '../ui/slide-panel'
import { Textarea } from '../ui/textarea'
import { toast } from '../ui/use-toast'
import { 
  Plus, 
  X, 
  Loader2, 
  Star,
  Edit2,
  GripVertical,
  Trash2,
  ChevronDown,
  ChevronRight,
  Search
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface ConfigurationTabProps {
  projectId: number
}

interface ProjectLanguage {
  language_id: number
  code: string
  long_name: string
  is_primary: boolean
}

interface ContentType {
  id: number
  title: string
  enabled: boolean
}

interface Channel {
  id: number
  name: string
  position: number | null
}

interface BriefingType {
  id: number
  title: string
  description: string | null
}

interface DefaultBriefing {
  content_type_id: number
  channel_id: number
  briefing_type_id: number | null
}

interface BriefingComponent {
  id: number
  briefing_component_id: number | null
  component_title: string
  component_description: string | null
  position: number
  is_override: boolean
}

// Section A: Channels, Languages, Content Types
export function ChannelsLanguagesContentTypes({ projectId }: { projectId: number }) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

  // Languages state
  const [projectLanguages, setProjectLanguages] = useState<ProjectLanguage[]>([])
  const [availableLanguages, setAvailableLanguages] = useState<{ id: number; code: string; long_name: string }[]>([])
  const [isLoadingLanguages, setIsLoadingLanguages] = useState(false)

  // Content Types state
  const [contentTypes, setContentTypes] = useState<ContentType[]>([])
  const [isLoadingContentTypes, setIsLoadingContentTypes] = useState(false)

  // Channels per Content Type state
  const [selectedContentTypeId, setSelectedContentTypeId] = useState<number | null>(null)
  const [channels, setChannels] = useState<Map<number, Channel[]>>(new Map())
  const [availableChannels, setAvailableChannels] = useState<Channel[]>([])
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set())
  const [contentTypeSearch, setContentTypeSearch] = useState('')
  const [briefingTypes, setBriefingTypes] = useState<BriefingType[]>([])
  const [channelBriefings, setChannelBriefings] = useState<Map<string, number | null>>(new Map())
  const [showAllContentTypes, setShowAllContentTypes] = useState(false)
  const [showAllLanguages, setShowAllLanguages] = useState(false)
  const [showAllChannels, setShowAllChannels] = useState(false)

  // Fetch project languages
  const fetchProjectLanguages = useCallback(async () => {
    setIsLoadingLanguages(true)
    try {
      const { data, error } = await supabase
        .from('project_languages')
        .select(`
          language_id,
          is_primary,
          languages!inner(id, code, long_name)
        `)
        .eq('project_id', projectId)
        .is('is_deleted', false)

      if (error) throw error

      const languages = (data || []).map((pl: any) => ({
        language_id: pl.language_id,
        code: pl.languages.code,
        long_name: pl.languages.long_name,
        is_primary: pl.is_primary
      }))
      .sort((a, b) => {
        if (a.is_primary !== b.is_primary) return b.is_primary ? 1 : -1
        return a.long_name.localeCompare(b.long_name)
      })

      setProjectLanguages(languages)
      
      // Fetch all languages for add dropdown
      const { data: allLangs, error: langError } = await supabase
        .from('languages')
        .select('id, code, long_name')
        .order('long_name')
      
      if (langError) throw langError
      
      const existingIds = new Set(languages.map(l => l.language_id))
      setAvailableLanguages((allLangs || []).filter(l => !existingIds.has(l.id)))
    } catch (err: any) {
      console.error('Failed to fetch languages:', err)
      toast({ title: 'Error', description: 'Failed to load languages', variant: 'destructive' })
    } finally {
      setIsLoadingLanguages(false)
    }
  }, [projectId, supabase])

  // Fetch content types
  const fetchContentTypes = useCallback(async () => {
    setIsLoadingContentTypes(true)
    try {
      // Fetch all content types
      const { data: allTypes, error: allError } = await supabase
        .from('content_types')
        .select('id, title')
        .order('title')

      if (allError) throw allError

      // Fetch enabled ones from project_content_type_settings
      const { data: enabledData, error: enabledError } = await supabase
        .from('project_content_type_settings')
        .select('content_type_id')
        .eq('project_id', projectId)

      if (enabledError) throw enabledError
      
      const enabledIds = new Set((enabledData || []).map((e: any) => e.content_type_id))
      
      const types = (allTypes || []).map(ct => ({
        id: ct.id,
        title: ct.title,
        enabled: enabledIds.has(ct.id)
      }))
      
      setContentTypes(types)
      
      // Auto-select first enabled content type if none selected
      if (selectedContentTypeId === null) {
        const firstEnabled = types.find(t => t.enabled)
        if (firstEnabled) {
          setSelectedContentTypeId(firstEnabled.id)
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch content types:', err)
      toast({ title: 'Error', description: 'Failed to load content types', variant: 'destructive' })
    } finally {
      setIsLoadingContentTypes(false)
    }
  }, [projectId, supabase, selectedContentTypeId])

  // Fetch briefing types for project
  const fetchBriefingTypes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('project_briefing_types')
        .select(`
          briefing_type_id,
          briefing_types!inner(id, title, description)
        `)
        .eq('project_id', projectId)
        .order('position', { ascending: true })

      if (error) throw error

      const types = (data || []).map((pbt: any) => ({
        id: pbt.briefing_type_id,
        title: pbt.briefing_types.title,
        description: pbt.briefing_types.description
      }))

      setBriefingTypes(types)
    } catch (err: any) {
      console.error('Failed to fetch briefing types:', err)
    }
  }, [projectId, supabase])

  // Fetch default briefings for channels
  const fetchChannelBriefings = useCallback(async () => {
    if (!selectedContentTypeId) return
    
    try {
      const { data, error } = await supabase
        .from('project_ct_channel_briefings')
        .select('content_type_id, channel_id, briefing_type_id')
        .eq('project_id', projectId)
        .eq('content_type_id', selectedContentTypeId)

      if (error) throw error

      const map = new Map<string, number | null>()
      ;(data || []).forEach((d: any) => {
        const key = `${d.content_type_id}-${d.channel_id}`
        map.set(key, d.briefing_type_id)
      })

      setChannelBriefings(map)
    } catch (err: any) {
      console.error('Failed to fetch channel briefings:', err)
    }
  }, [projectId, selectedContentTypeId, supabase])

  // Fetch channels for content type
  const fetchChannels = useCallback(async (contentTypeId: number) => {
    try {
      const { data, error } = await supabase
        .from('project_content_types_channels')
        .select(`
          channel_id,
          position,
          channels!inner(id, name)
        `)
        .eq('project_id', projectId)
        .eq('content_type_id', contentTypeId)
        .order('position', { ascending: true })

      if (error) throw error

      const chans = (data || []).map((pctc: any) => ({
        id: pctc.channel_id,
        name: pctc.channels.name,
        position: pctc.position
      })).sort((a, b) => {
        const posA = a.position ?? 999
        const posB = b.position ?? 999
        if (posA !== posB) return posA - posB
        return a.name.localeCompare(b.name)
      })

      setChannels(prev => new Map(prev).set(contentTypeId, chans))

      // Fetch all channels for add dropdown
      const { data: allChans, error: chanError } = await supabase
        .from('channels')
        .select('id, name')
        .order('name')

      if (chanError) throw chanError

      const existingIds = new Set(chans.map(c => c.id))
      setAvailableChannels((allChans || []).filter(c => !existingIds.has(c.id)).map(c => ({ id: c.id, name: c.name, position: null })))
    } catch (err: any) {
      console.error('Failed to fetch channels:', err)
      toast({ title: 'Error', description: 'Failed to load channels', variant: 'destructive' })
    }
  }, [projectId, supabase])

  // Set default briefing for channel
  const handleSetChannelBriefing = useCallback(async (contentTypeId: number, channelId: number, briefingTypeId: number | null) => {
    try {
      const { error } = await supabase.rpc('pcctb_set', {
        p_project_id: projectId,
        p_content_type_id: contentTypeId,
        p_channel_id: channelId,
        p_briefing_type_id: briefingTypeId
      })

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['proj:ctch:default', projectId] })
      queryClient.invalidateQueries({ 
        queryKey: ['proj:ctch:components', projectId, contentTypeId, channelId] 
      })
      await fetchChannelBriefings()
      toast({ title: 'Success', description: 'Default briefing updated' })
    } catch (err: any) {
      console.error('Failed to set briefing:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, supabase, queryClient, fetchChannelBriefings])

  const toggleChannelExpand = useCallback((contentTypeId: number, channelId: number) => {
    const key = `${contentTypeId}-${channelId}`
    setExpandedChannels(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  // Add language
  const handleAddLanguage = useCallback(async (languageId: number) => {
    try {
      const { error } = await supabase
        .from('project_languages')
        .insert({
          project_id: projectId,
          language_id: languageId,
          is_primary: false
        })

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['proj:langs', projectId] })
      await fetchProjectLanguages()
      toast({ title: 'Success', description: 'Language added' })
    } catch (err: any) {
      console.error('Failed to add language:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, supabase, queryClient, fetchProjectLanguages])

  // Remove language
  const handleRemoveLanguage = useCallback(async (languageId: number) => {
    try {
      const { error } = await supabase
        .from('project_languages')
        .update({ is_deleted: true })
        .eq('project_id', projectId)
        .eq('language_id', languageId)

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['proj:langs', projectId] })
      await fetchProjectLanguages()
      toast({ title: 'Success', description: 'Language removed' })
    } catch (err: any) {
      console.error('Failed to remove language:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, supabase, queryClient, fetchProjectLanguages])

  // Set primary language
  const handleSetPrimary = useCallback(async (languageId: number) => {
    try {
      // Set all to false first
      await supabase
        .from('project_languages')
        .update({ is_primary: false })
        .eq('project_id', projectId)

      // Set this one to true
      const { error } = await supabase
        .from('project_languages')
        .update({ is_primary: true })
        .eq('project_id', projectId)
        .eq('language_id', languageId)

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['proj:langs', projectId] })
      await fetchProjectLanguages()
      toast({ title: 'Success', description: 'Primary language updated' })
    } catch (err: any) {
      console.error('Failed to set primary language:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, supabase, queryClient, fetchProjectLanguages])

  // Toggle content type
  const handleToggleContentType = useCallback(async (contentTypeId: number, enabled: boolean) => {
    try {
      if (enabled) {
        const { error } = await supabase
          .from('project_content_type_settings')
          .upsert({
            project_id: projectId,
            content_type_id: contentTypeId
          })

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('project_content_type_settings')
          .delete()
          .eq('project_id', projectId)
          .eq('content_type_id', contentTypeId)

        if (error) throw error
      }

      queryClient.invalidateQueries({ queryKey: ['proj:cts', projectId] })
      await fetchContentTypes()
      toast({ title: 'Success', description: `Content type ${enabled ? 'enabled' : 'disabled'}` })
    } catch (err: any) {
      console.error('Failed to toggle content type:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, supabase, queryClient, fetchContentTypes])

  // Add channel to content type
  const handleAddChannel = useCallback(async (channelId: number) => {
    if (!selectedContentTypeId) return

    try {
      const { error } = await supabase
        .from('project_content_types_channels')
        .insert({
          project_id: projectId,
          content_type_id: selectedContentTypeId,
          channel_id: channelId
        })

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['proj:channels', projectId, selectedContentTypeId] })
      await fetchChannels(selectedContentTypeId)
      toast({ title: 'Success', description: 'Channel added' })
    } catch (err: any) {
      console.error('Failed to add channel:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, selectedContentTypeId, supabase, queryClient, fetchChannels])

  // Remove channel from content type
  const handleRemoveChannel = useCallback(async (channelId: number) => {
    if (!selectedContentTypeId) return

    try {
      const { error } = await supabase
        .from('project_content_types_channels')
        .delete()
        .eq('project_id', projectId)
        .eq('content_type_id', selectedContentTypeId)
        .eq('channel_id', channelId)

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['proj:channels', projectId, selectedContentTypeId] })
      await fetchChannels(selectedContentTypeId)
      toast({ title: 'Success', description: 'Channel removed' })
    } catch (err: any) {
      console.error('Failed to remove channel:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, selectedContentTypeId, supabase, queryClient, fetchChannels])

  useEffect(() => {
    fetchProjectLanguages()
    fetchContentTypes()
    fetchBriefingTypes()
  }, [fetchProjectLanguages, fetchContentTypes, fetchBriefingTypes])

  useEffect(() => {
    if (selectedContentTypeId) {
      fetchChannels(selectedContentTypeId)
      fetchChannelBriefings()
    }
  }, [selectedContentTypeId, fetchChannels, fetchChannelBriefings])

  const contentTypeChannels = selectedContentTypeId ? (channels.get(selectedContentTypeId) || []) : []

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Languages</h3>
        <div className="space-y-2">
          {projectLanguages.map(lang => (
            <div key={lang.language_id} className="flex items-center gap-2 p-2 border rounded">
              <Star 
                className={`w-4 h-4 ${lang.is_primary ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
              />
              <span className="flex-1">{lang.long_name} ({lang.code})</span>
              {!lang.is_primary && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleSetPrimary(lang.language_id)}
                >
                  Set Primary
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleRemoveLanguage(lang.language_id)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
          {!showAllLanguages && availableLanguages.length > 0 && (
            <Select onValueChange={(v) => handleAddLanguage(Number(v))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Add language" />
              </SelectTrigger>
              <SelectContent>
                {availableLanguages.map(lang => (
                  <SelectItem key={lang.id} value={lang.id.toString()}>
                    {lang.long_name} ({lang.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {showAllLanguages && availableLanguages.length > 0 && (
            <>
              {availableLanguages.map(lang => (
                <div key={lang.id} className="flex items-center gap-2 p-2 border rounded opacity-60">
                  <span className="flex-1">{lang.long_name} ({lang.code})</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAddLanguage(lang.id)}
                  >
                    Add
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllLanguages(false)}
                className="text-xs text-gray-500"
              >
                collapse
              </Button>
            </>
          )}
          {!showAllLanguages && availableLanguages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllLanguages(true)}
              className="text-xs text-gray-500"
            >
              expand
            </Button>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Content Types</h3>
        <div className="mb-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search content types..."
              value={contentTypeSearch}
              onChange={(e) => setContentTypeSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <div className="space-y-2">
          {contentTypes
            .filter(ct => {
              const matchesSearch = ct.title.toLowerCase().includes(contentTypeSearch.toLowerCase())
              if (showAllContentTypes) return matchesSearch
              return matchesSearch && ct.enabled
            })
            .map(ct => (
            <div key={ct.id} className="flex items-center gap-2 p-2 border rounded">
              <Checkbox
                checked={ct.enabled}
                onCheckedChange={(checked) => handleToggleContentType(ct.id, checked === true)}
              />
              <span className="flex-1">{ct.title}</span>
            </div>
          ))}
          {!showAllContentTypes && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllContentTypes(true)}
              className="text-xs text-gray-500"
            >
              expand
            </Button>
          )}
          {showAllContentTypes && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllContentTypes(false)}
              className="text-xs text-gray-500"
            >
              collapse
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// Section B: Channels per Content Type (standalone component for BriefingsTab)
export function ChannelsPerContentType({ projectId }: { projectId: number }) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

  // Content Types state
  const [contentTypes, setContentTypes] = useState<ContentType[]>([])
  const [isLoadingContentTypes, setIsLoadingContentTypes] = useState(false)

  // Channels per Content Type state
  const [selectedContentTypeId, setSelectedContentTypeId] = useState<number | null>(null)
  const [channels, setChannels] = useState<Map<number, Channel[]>>(new Map())
  const [availableChannels, setAvailableChannels] = useState<Channel[]>([])
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set())
  const [briefingTypes, setBriefingTypes] = useState<BriefingType[]>([])
  const [channelBriefings, setChannelBriefings] = useState<Map<string, number | null>>(new Map())
  const [showAllChannels, setShowAllChannels] = useState(false)

  // Fetch content types
  const fetchContentTypes = useCallback(async () => {
    setIsLoadingContentTypes(true)
    try {
      // Fetch all content types
      const { data: allTypes, error: allError } = await supabase
        .from('content_types')
        .select('id, title')
        .order('title')

      if (allError) throw allError

      // Fetch enabled ones from project_content_type_settings
      const { data: enabledData, error: enabledError } = await supabase
        .from('project_content_type_settings')
        .select('content_type_id')
        .eq('project_id', projectId)

      if (enabledError) throw enabledError
      
      const enabledIds = new Set((enabledData || []).map((e: any) => e.content_type_id))
      
      const types = (allTypes || []).map(ct => ({
        id: ct.id,
        title: ct.title,
        enabled: enabledIds.has(ct.id)
      }))
      
      setContentTypes(types)
      
      // Auto-select first enabled content type if none selected
      if (selectedContentTypeId === null) {
        const firstEnabled = types.find(t => t.enabled)
        if (firstEnabled) {
          setSelectedContentTypeId(firstEnabled.id)
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch content types:', err)
      toast({ title: 'Error', description: 'Failed to load content types', variant: 'destructive' })
    } finally {
      setIsLoadingContentTypes(false)
    }
  }, [projectId, supabase, selectedContentTypeId])

  // Fetch briefing types for project
  const fetchBriefingTypes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('project_briefing_types')
        .select(`
          briefing_type_id,
          briefing_types!inner(id, title, description)
        `)
        .eq('project_id', projectId)
        .order('position', { ascending: true })

      if (error) throw error

      const types = (data || []).map((pbt: any) => ({
        id: pbt.briefing_type_id,
        title: pbt.briefing_types.title,
        description: pbt.briefing_types.description
      }))

      setBriefingTypes(types)
    } catch (err: any) {
      console.error('Failed to fetch briefing types:', err)
    }
  }, [projectId, supabase])

  // Fetch default briefings for channels
  const fetchChannelBriefings = useCallback(async () => {
    if (!selectedContentTypeId) return
    
    try {
      const { data, error } = await supabase
        .from('project_ct_channel_briefings')
        .select('content_type_id, channel_id, briefing_type_id')
        .eq('project_id', projectId)
        .eq('content_type_id', selectedContentTypeId)

      if (error) throw error

      const map = new Map<string, number | null>()
      ;(data || []).forEach((d: any) => {
        const key = `${d.content_type_id}-${d.channel_id}`
        map.set(key, d.briefing_type_id)
      })

      setChannelBriefings(map)
    } catch (err: any) {
      console.error('Failed to fetch channel briefings:', err)
    }
  }, [projectId, selectedContentTypeId, supabase])

  // Fetch channels for content type
  const fetchChannels = useCallback(async (contentTypeId: number) => {
    try {
      const { data, error } = await supabase
        .from('project_content_types_channels')
        .select(`
          channel_id,
          position,
          channels!inner(id, name)
        `)
        .eq('project_id', projectId)
        .eq('content_type_id', contentTypeId)
        .order('position', { ascending: true })

      if (error) throw error

      const chans = (data || []).map((pctc: any) => ({
        id: pctc.channel_id,
        name: pctc.channels.name,
        position: pctc.position
      })).sort((a, b) => {
        const posA = a.position ?? 999
        const posB = b.position ?? 999
        if (posA !== posB) return posA - posB
        return a.name.localeCompare(b.name)
      })

      setChannels(prev => new Map(prev).set(contentTypeId, chans))

      // Fetch all channels for add dropdown
      const { data: allChans, error: chanError } = await supabase
        .from('channels')
        .select('id, name')
        .order('name')

      if (chanError) throw chanError

      const existingIds = new Set(chans.map(c => c.id))
      setAvailableChannels((allChans || []).filter(c => !existingIds.has(c.id)).map(c => ({ id: c.id, name: c.name, position: null })))
    } catch (err: any) {
      console.error('Failed to fetch channels:', err)
      toast({ title: 'Error', description: 'Failed to load channels', variant: 'destructive' })
    }
  }, [projectId, supabase])

  // Set default briefing for channel
  const handleSetChannelBriefing = useCallback(async (contentTypeId: number, channelId: number, briefingTypeId: number | null) => {
    try {
      const { error } = await supabase.rpc('pcctb_set', {
        p_project_id: projectId,
        p_content_type_id: contentTypeId,
        p_channel_id: channelId,
        p_briefing_type_id: briefingTypeId
      })

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['proj:ctch:default', projectId] })
      queryClient.invalidateQueries({ 
        queryKey: ['proj:ctch:components', projectId, contentTypeId, channelId] 
      })
      await fetchChannelBriefings()
      toast({ title: 'Success', description: 'Default briefing updated' })
    } catch (err: any) {
      console.error('Failed to set briefing:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, supabase, queryClient, fetchChannelBriefings])

  const toggleChannelExpand = useCallback((contentTypeId: number, channelId: number) => {
    const key = `${contentTypeId}-${channelId}`
    setExpandedChannels(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  // Add channel to content type
  const handleAddChannel = useCallback(async (channelId: number) => {
    if (!selectedContentTypeId) return

    try {
      const { error } = await supabase
        .from('project_content_types_channels')
        .insert({
          project_id: projectId,
          content_type_id: selectedContentTypeId,
          channel_id: channelId
        })

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['proj:ctch', projectId] })
      await fetchChannels(selectedContentTypeId)
      toast({ title: 'Success', description: 'Channel added' })
    } catch (err: any) {
      console.error('Failed to add channel:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, selectedContentTypeId, supabase, queryClient, fetchChannels])

  // Remove channel from content type
  const handleRemoveChannel = useCallback(async (channelId: number) => {
    if (!selectedContentTypeId) return

    try {
      const { error } = await supabase
        .from('project_content_types_channels')
        .delete()
        .eq('project_id', projectId)
        .eq('content_type_id', selectedContentTypeId)
        .eq('channel_id', channelId)

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['proj:ctch', projectId] })
      await fetchChannels(selectedContentTypeId)
      toast({ title: 'Success', description: 'Channel removed' })
    } catch (err: any) {
      console.error('Failed to remove channel:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, selectedContentTypeId, supabase, queryClient, fetchChannels])

  useEffect(() => {
    fetchContentTypes()
    fetchBriefingTypes()
  }, [fetchContentTypes, fetchBriefingTypes])

  useEffect(() => {
    if (selectedContentTypeId) {
      fetchChannels(selectedContentTypeId)
      fetchChannelBriefings()
    }
  }, [selectedContentTypeId, fetchChannels, fetchChannelBriefings])

  const contentTypeChannels = selectedContentTypeId ? channels.get(selectedContentTypeId) || [] : []

  return (
    <div>
      <div className="space-y-4">
        {/* Content Type Dropdown */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Select Content Type
          </Label>
          <Select
            value={selectedContentTypeId?.toString() || ''}
            onValueChange={(v) => setSelectedContentTypeId(Number(v))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a content type..." />
            </SelectTrigger>
            <SelectContent>
              {contentTypes
                .filter(ct => ct.enabled)
                .map(ct => (
                  <SelectItem key={ct.id} value={ct.id.toString()}>
                    {ct.title}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {selectedContentTypeId && (
          <div className="space-y-2">
            {contentTypeChannels.map(ch => {
              const key = `${selectedContentTypeId}-${ch.id}`
              const isExpanded = expandedChannels.has(key)
              const currentBriefingId = channelBriefings.get(key) || null
              
              return (
                <div key={ch.id} className="border rounded">
                  <div className="flex items-center gap-2 p-2">
                    <button
                      onClick={() => toggleChannelExpand(selectedContentTypeId, ch.id)}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                    <span className="flex-1 font-medium">{ch.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveChannel(ch.id)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  {isExpanded && (
                    <div className="p-4 border-t bg-gray-50 space-y-4">
                      {/* Briefing Type Selector */}
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-2 block">
                          Default Briefing
                        </Label>
                        <Select
                          value={currentBriefingId?.toString() || '__none__'}
                          onValueChange={(v) => handleSetChannelBriefing(
                            selectedContentTypeId, 
                            ch.id, 
                            v === '__none__' ? null : Number(v)
                          )}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {briefingTypes.map(bt => (
                              <SelectItem key={bt.id} value={bt.id.toString()}>
                                {bt.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Components Editor */}
                      <div>
                        <ChannelComponentsInline
                          projectId={projectId}
                          contentTypeId={selectedContentTypeId}
                          channelId={ch.id}
                          briefingTypeId={currentBriefingId}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            
            {!showAllChannels && availableChannels.length > 0 && (
              <Select onValueChange={(v) => handleAddChannel(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Add channel" />
                </SelectTrigger>
                <SelectContent>
                  {availableChannels.map(ch => (
                    <SelectItem key={ch.id} value={ch.id.toString()}>
                      {ch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {showAllChannels && availableChannels.length > 0 && (
              <>
                {availableChannels.map(ch => (
                  <div key={ch.id} className="flex items-center gap-2 p-2 border rounded opacity-60">
                    <span className="flex-1">{ch.name}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        handleAddChannel(ch.id)
                        // Optionally auto-collapse after adding
                      }}
                    >
                      Add
                    </Button>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllChannels(false)}
                  className="text-xs text-gray-500"
                >
                  collapse
                </Button>
              </>
            )}
            {!showAllChannels && availableChannels.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllChannels(true)}
                className="text-xs text-gray-500"
              >
                expand
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Inline Components Editor for Channels
function ChannelComponentsInline({ 
  projectId, 
  contentTypeId, 
  channelId,
  briefingTypeId 
}: { 
  projectId: number
  contentTypeId: number
  channelId: number
  briefingTypeId: number | null
}) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

  const [components, setComponents] = useState<BriefingComponent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingComponent, setEditingComponent] = useState<BriefingComponent | null>(null)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [showAddGlobalDialog, setShowAddGlobalDialog] = useState(false)
  const [showAddProjectDialog, setShowAddProjectDialog] = useState(false)
  const [availableGlobalComponents, setAvailableGlobalComponents] = useState<Array<{ id: number; title: string; description: string | null }>>([])
  const [availableProjectComponents, setAvailableProjectComponents] = useState<Array<{ id: number; title: string; description: string | null }>>([])
  const [selectedGlobalId, setSelectedGlobalId] = useState<number | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [allAvailableComponents, setAllAvailableComponents] = useState<Array<{ id: string | number; component_id: number; is_project_component: boolean; component_title: string; component_description: string | null }>>([])
  const [addingComponentId, setAddingComponentId] = useState<string | number | null>(null)

  // Sensors for drag and drop - must be defined before any conditional returns
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Fetch components
  const fetchComponents = useCallback(async () => {
    setIsLoading(true)
    try {
      // First try channel-specific components
      const { data: channelData, error: channelError } = await supabase
        .from('project_ct_channel_briefing_components')
        .select(`
          id,
          briefing_component_id,
          project_component_id,
          position,
          custom_title,
          custom_description,
          purpose,
          guidance,
          suggested_word_count,
          subheads
        `)
        .eq('project_id', projectId)
        .eq('content_type_id', contentTypeId)
        .eq('channel_id', channelId)
        .order('position', { ascending: true })

      if (channelError && channelError.code !== 'PGRST116') throw channelError

      if (channelData && channelData.length > 0) {
        // Fetch briefing_components for the IDs we found
        const briefingComponentIds = channelData
          .map((d: any) => d.briefing_component_id)
          .filter((id: any): id is number => id !== null)
        
        let briefingComponentsMap = new Map<number, { title: string; description: string | null }>()
        
        if (briefingComponentIds.length > 0) {
          const { data: briefingComps, error: bcError } = await supabase
            .from('briefing_components')
            .select('id, title, description')
            .in('id', briefingComponentIds)
          
          if (!bcError && briefingComps) {
            briefingComps.forEach((bc: any) => {
              briefingComponentsMap.set(bc.id, { title: bc.title, description: bc.description })
            })
          }
        }

        const comps = (channelData || []).map((pctcbc: any) => {
          const briefingInfo = pctcbc.briefing_component_id 
            ? briefingComponentsMap.get(pctcbc.briefing_component_id)
            : null
          
          return {
            id: pctcbc.id,
            briefing_component_id: pctcbc.briefing_component_id,
            project_component_id: pctcbc.project_component_id,
            component_title: pctcbc.custom_title || briefingInfo?.title || 'Custom Component',
            component_description: pctcbc.custom_description || briefingInfo?.description || null,
            position: pctcbc.position,
            is_override: true
          }
        })
        setComponents(comps)
        
        // For overrides, we still need to fetch available components from template
        // Fetch template components to show unselected ones
        if (briefingTypeId) {
          const { data: templateData } = await supabase
            .from('v_project_briefing_types_components_resolved')
            .select('*')
            .eq('project_id', projectId)
            .eq('briefing_type_id', briefingTypeId)
            .order('position', { ascending: true })

          if (templateData) {
            const allComps = (templateData || []).map((item: any, idx: number) => ({
              id: item.id || `template-${idx}`,
              component_id: item.component_id,
              is_project_component: item.is_project_component || false,
              component_title: item.effective_title || 'Component',
              component_description: item.effective_description || null,
            }))
            setAllAvailableComponents(allComps)
          }
        }
        setIsLoading(false)
        return
      }

      // Fallback to project template - use effective_title and effective_description
      // Only fetch if we have a briefing type ID
      if (!briefingTypeId) {
        setComponents([])
        setAllAvailableComponents([])
        setIsLoading(false)
        return
      }

      const { data: templateData, error: templateError } = await supabase
        .from('v_project_briefing_types_components_resolved')
        .select('*')
        .eq('project_id', projectId)
        .eq('briefing_type_id', briefingTypeId)
        .order('position', { ascending: true })

      if (templateError) throw templateError

      // Use effective_title and effective_description from the view
      const comps = (templateData || []).map((item: any, idx: number) => ({
        id: item.id || `template-${idx}`,
        briefing_component_id: item.briefing_component_id,
        project_component_id: item.project_component_id || null,
        component_title: item.effective_title || 'Component',
        component_description: item.effective_description || null,
        position: item.position || idx,
        is_override: false
      }))

      setComponents(comps)
      // Store as available components for the "unselected" section
      setAllAvailableComponents((templateData || []).map((item: any, idx: number) => ({
        id: item.id || `template-${idx}`,
        component_id: item.component_id,
        is_project_component: item.is_project_component || false,
        component_title: item.effective_title || 'Component',
        component_description: item.effective_description || null,
      })))
    } catch (err: any) {
      console.error('Failed to fetch components:', err)
    } finally {
      setIsLoading(false)
    }
  }, [projectId, contentTypeId, channelId, briefingTypeId, supabase])

  // Handle drag end for reordering
  const handleDragEnd = useCallback(async (event: any) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = components.findIndex(c => c.id.toString() === active.id)
    const newIndex = components.findIndex(c => c.id.toString() === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const newComponents = arrayMove(components, oldIndex, newIndex)
    setComponents(newComponents)

    // Only reorder if there are overrides
    const hasOverrides = components.some(c => c.is_override)
    if (!hasOverrides) {
      // Can't reorder inherited components - need to add them first
      toast({ 
        title: 'Info', 
        description: 'Add components to create an override before reordering',
        variant: 'default'
      })
      await fetchComponents() // Revert
      return
    }

    // Build order array for RPC
    const componentIds = newComponents
      .filter(c => c.is_override)
      .map((c) => c.id)
    
    try {
      if (!briefingTypeId) {
        throw new Error('Briefing type is required for reordering')
      }

      const { error } = await supabase.rpc('pcctbc_reorder', {
        p_project_id: projectId,
        p_content_type_id: contentTypeId,
        p_channel_id: channelId,
        p_briefing_type_id: briefingTypeId,
        p_component_ids: componentIds
      })

      if (error) throw error

      queryClient.invalidateQueries({ 
        queryKey: ['proj:ctch:components', projectId, contentTypeId, channelId] 
      })
      toast({ title: 'Success', description: 'Components reordered' })
    } catch (err: any) {
      console.error('Failed to reorder:', err)
      toast({ title: 'Error', description: 'Failed to reorder components', variant: 'destructive' })
      await fetchComponents() // Revert on error
    }
  }, [components, projectId, contentTypeId, channelId, briefingTypeId, supabase, queryClient, fetchComponents])

  // Handle remove
  const handleRemove = useCallback(async (componentId: number, isProjectComponent: boolean) => {
    try {
      const { error } = await supabase.rpc('pcctbc_remove', {
        p_project_id: projectId,
        p_content_type_id: contentTypeId,
        p_channel_id: channelId,
        p_component_id: componentId,
        p_is_project_component: isProjectComponent
      })

      if (error) throw error

      queryClient.invalidateQueries({ 
        queryKey: ['proj:ctch:components', projectId, contentTypeId, channelId] 
      })
      await fetchComponents()
      toast({ title: 'Success', description: 'Component removed' })
    } catch (err: any) {
      console.error('Failed to remove component:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, contentTypeId, channelId, supabase, queryClient, fetchComponents])

  // Fetch available global components
  const fetchAvailableGlobalComponents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('briefing_components')
        .select('id, title, description')
        .order('title')

      if (error) throw error

      // Filter out already added ones
      const existingIds = new Set(
        components
          .filter(c => c.is_override && c.briefing_component_id)
          .map(c => c.briefing_component_id!)
      )

      setAvailableGlobalComponents((data || []).filter(bc => !existingIds.has(bc.id)))
    } catch (err: any) {
      console.error('Failed to fetch global components:', err)
    }
  }, [supabase, components])

  // Fetch available project components
  const fetchAvailableProjectComponents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('project_briefing_components')
        .select('id, title, description')
        .eq('project_id', projectId)
        .order('title')

      if (error) throw error

      // Filter out already added ones
      const existingIds = new Set(
        components
          .filter(c => c.is_override && c.briefing_component_id)
          .map(c => c.briefing_component_id!)
      )

      setAvailableProjectComponents((data || []).filter(pc => !existingIds.has(pc.id)))
    } catch (err: any) {
      console.error('Failed to fetch project components:', err)
    }
  }, [projectId, supabase, components])

  // Handle add global
  const handleAddGlobal = useCallback(async () => {
    if (!selectedGlobalId) return

    try {
      const { error } = await supabase.rpc('pcctbc_add_global', {
        p_project_id: projectId,
        p_content_type_id: contentTypeId,
        p_channel_id: channelId,
        p_briefing_component_id: selectedGlobalId
      })

      if (error) throw error

      queryClient.invalidateQueries({ 
        queryKey: ['proj:ctch:components', projectId, contentTypeId, channelId] 
      })
      await fetchComponents()
      setShowAddGlobalDialog(false)
      setSelectedGlobalId(null)
      toast({ title: 'Success', description: 'Global component added' })
    } catch (err: any) {
      console.error('Failed to add global component:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, contentTypeId, channelId, selectedGlobalId, supabase, queryClient, fetchComponents])

  // Handle add project
  const handleAddProject = useCallback(async () => {
    if (!selectedProjectId) return

    try {
      const { error } = await supabase.rpc('pcctbc_add_project', {
        p_project_id: projectId,
        p_content_type_id: contentTypeId,
        p_channel_id: channelId,
        p_project_component_id: selectedProjectId
      })

      if (error) throw error

      queryClient.invalidateQueries({ 
        queryKey: ['proj:ctch:components', projectId, contentTypeId, channelId] 
      })
      await fetchComponents()
      setShowAddProjectDialog(false)
      setSelectedProjectId(null)
      toast({ title: 'Success', description: 'Project component added' })
    } catch (err: any) {
      console.error('Failed to add project component:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, contentTypeId, channelId, selectedProjectId, supabase, queryClient, fetchComponents])

  useEffect(() => {
    fetchComponents()
  }, [fetchComponents, briefingTypeId])

  useEffect(() => {
    if (showAddGlobalDialog || showAddProjectDialog) {
      fetchAvailableGlobalComponents()
      fetchAvailableProjectComponents()
    }
  }, [showAddGlobalDialog, showAddProjectDialog, fetchAvailableGlobalComponents, fetchAvailableProjectComponents])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <Label className="text-sm font-medium text-gray-700">Components</Label>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowAddMenu(!showAddMenu)}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Component
        </Button>
      </div>

      {showAddMenu && (
        <div className="border rounded p-3 bg-gray-50 space-y-2 mb-2">
          <p className="text-xs font-medium text-gray-700">Add Component</p>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => {
              setShowAddGlobalDialog(true)
              setShowAddMenu(false)
            }}>
              Add Global
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              setShowAddProjectDialog(true)
              setShowAddMenu(false)
            }}>
              Add Project
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              // Open library tab to create new component
              window.open(`/projects/${projectId}/briefings?tab=library`, '_blank')
            }}>
              <Plus className="w-3 h-3 mr-1" />
              Create New
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Selected Components Section */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-px flex-1 bg-gray-300"></div>
            <Label className="text-xs font-semibold text-gray-700 px-2">Selected</Label>
            <div className="h-px flex-1 bg-gray-300"></div>
          </div>
          {components.length === 0 ? (
            <div className="text-center py-4 border border-blue-200 bg-blue-50 rounded p-3">
              <p className="text-xs font-medium text-blue-900">Inherited from Project Briefing Template</p>
              <p className="text-xs text-blue-700 mt-1">
                No channel-specific overrides. Using project default template.
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={components.map(c => c.id.toString())}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {components.map(comp => (
                    <SortableComponentItemInline
                      key={comp.id}
                      component={comp}
                      onEdit={() => setEditingComponent(comp)}
                      onRemove={() => handleRemove(
                        comp.briefing_component_id || comp.id || 0,
                        !!comp.briefing_component_id
                      )}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Unselected Components Section */}
        {briefingTypeId && allAvailableComponents.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1 bg-gray-300"></div>
              <Label className="text-xs font-semibold text-gray-700 px-2">Available to Add</Label>
              <div className="h-px flex-1 bg-gray-300"></div>
            </div>
            <div className="space-y-2">
              {allAvailableComponents
                .filter((availComp, index, self) => {
                  // Remove duplicates based on component_id + is_project_component
                  const firstIndex = self.findIndex(c => 
                    c.component_id === availComp.component_id && 
                    c.is_project_component === availComp.is_project_component
                  )
                  if (firstIndex !== index) return false
                  
                  // Show only components not already in the selected list
                  const isSelected = components.some(c => {
                    if (availComp.is_project_component) {
                      return c.briefing_component_id === availComp.component_id
                    } else {
                      return c.briefing_component_id === availComp.component_id
                    }
                  })
                  return !isSelected
                })
                .map(availComp => (
                  <div
                    key={availComp.id}
                    className="flex items-start gap-2 p-2 border rounded bg-white text-xs"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{availComp.component_title}</div>
                      {availComp.component_description && (
                        <div className="text-gray-500 mt-0.5">{availComp.component_description}</div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs"
                      disabled={addingComponentId === availComp.id}
                      onClick={async () => {
                        setAddingComponentId(availComp.id)
                        try {
                          if (!availComp.is_project_component) {
                            // Add as global component (briefing_component)
                            console.log('Adding global component:', availComp.component_id)
                            const { error } = await supabase.rpc('pcctbc_add_global', {
                              p_project_id: projectId,
                              p_content_type_id: contentTypeId,
                              p_channel_id: channelId,
                              p_briefing_component_id: availComp.component_id
                            })
                            if (error) {
                              console.error('RPC Error:', error)
                              throw error
                            }
                            queryClient.invalidateQueries({ 
                              queryKey: ['proj:ctch:components', projectId, contentTypeId, channelId] 
                            })
                            await fetchComponents()
                            toast({ title: 'Success', description: 'Component added' })
                          } else {
                            // Add as project component
                            console.log('Adding project component:', availComp.component_id)
                            const { error } = await supabase.rpc('pcctbc_add_project', {
                              p_project_id: projectId,
                              p_content_type_id: contentTypeId,
                              p_channel_id: channelId,
                              p_project_component_id: availComp.component_id
                            })
                            if (error) {
                              console.error('RPC Error:', error)
                              throw error
                            }
                            queryClient.invalidateQueries({ 
                              queryKey: ['proj:ctch:components', projectId, contentTypeId, channelId] 
                            })
                            await fetchComponents()
                            toast({ title: 'Success', description: 'Component added' })
                          }
                        } catch (err: any) {
                          console.error('Failed to add component:', err)
                          toast({ 
                            title: 'Error', 
                            description: err.message || 'Failed to add component', 
                            variant: 'destructive' 
                          })
                        } finally {
                          setAddingComponentId(null)
                        }
                      }}
                    >
                      {addingComponentId === availComp.id ? 'Adding...' : 'Add'}
                    </Button>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {editingComponent && (
        <EditComponentDialog
          component={editingComponent}
          projectId={projectId}
          contentTypeId={contentTypeId}
          channelId={channelId}
          onClose={() => setEditingComponent(null)}
          onSave={async () => {
            await fetchComponents()
            setEditingComponent(null)
          }}
        />
      )}

      {/* Add Global Component Dialog */}
      {showAddGlobalDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add Global Component</h3>
              <Button variant="ghost" size="sm" onClick={() => {
                setShowAddGlobalDialog(false)
                setSelectedGlobalId(null)
              }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label>Select Component</Label>
                <Select
                  value={selectedGlobalId?.toString() || ''}
                  onValueChange={(v) => setSelectedGlobalId(Number(v))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a global component..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableGlobalComponents.map(comp => (
                      <SelectItem key={comp.id} value={comp.id.toString()}>
                        {comp.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedGlobalId && availableGlobalComponents.find(c => c.id === selectedGlobalId)?.description && (
                  <p className="text-xs text-gray-500 mt-1">
                    {availableGlobalComponents.find(c => c.id === selectedGlobalId)?.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => {
                setShowAddGlobalDialog(false)
                setSelectedGlobalId(null)
              }}>
                Cancel
              </Button>
              <Button onClick={handleAddGlobal} disabled={!selectedGlobalId}>
                Add
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Project Component Dialog */}
      {showAddProjectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add Project Component</h3>
              <Button variant="ghost" size="sm" onClick={() => {
                setShowAddProjectDialog(false)
                setSelectedProjectId(null)
              }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label>Select Component</Label>
                <Select
                  value={selectedProjectId?.toString() || ''}
                  onValueChange={(v) => setSelectedProjectId(Number(v))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a project component..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProjectComponents.map(comp => (
                      <SelectItem key={comp.id} value={comp.id.toString()}>
                        {comp.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedProjectId && availableProjectComponents.find(c => c.id === selectedProjectId)?.description && (
                  <p className="text-xs text-gray-500 mt-1">
                    {availableProjectComponents.find(c => c.id === selectedProjectId)?.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => {
                setShowAddProjectDialog(false)
                setSelectedProjectId(null)
              }}>
                Cancel
              </Button>
              <Button onClick={handleAddProject} disabled={!selectedProjectId}>
                Add
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Sortable component item for inline display
function SortableComponentItemInline({
  component,
  onEdit,
  onRemove
}: {
  component: BriefingComponent
  onEdit: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: component.id.toString()
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 p-2 border rounded bg-white text-xs"
    >
      <div {...attributes} {...listeners} className="cursor-move p-1 hover:bg-gray-100 rounded mt-0.5">
        <GripVertical className="w-3 h-3 text-gray-400" />
      </div>
      <Badge variant={component.is_override ? 'default' : 'outline'} className="text-xs mt-0.5">
        {component.is_override ? 'Override' : 'Inherited'}
      </Badge>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{component.component_title}</div>
        {component.component_description && (
          <div className="text-gray-500 mt-0.5">{component.component_description}</div>
        )}
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0"
        onClick={onEdit}
        title={component.is_override ? "Edit component" : "Edit (creates override)"}
      >
        <Edit2 className="w-3 h-3" />
      </Button>
      {component.is_override && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={onRemove}
        >
          <Trash2 className="w-3 h-3 text-red-500" />
        </Button>
      )}
    </div>
  )
}

// Edit Component Dialog
function EditComponentDialog({
  component,
  projectId,
  contentTypeId,
  channelId,
  onClose,
  onSave
}: {
  component: BriefingComponent
  projectId: number
  contentTypeId: number
  channelId: number
  onClose: () => void
  onSave: () => void
}) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()
  const [customTitle, setCustomTitle] = useState(component.component_title)
  const [customDescription, setCustomDescription] = useState(component.component_description || '')
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      const { error } = await supabase.rpc('pcctbc_update', {
        p_project_id: projectId,
        p_content_type_id: contentTypeId,
        p_channel_id: channelId,
        p_component_id: component.id,
        p_custom_title: customTitle || null,
        p_custom_description: customDescription || null
      })

      if (error) throw error

      queryClient.invalidateQueries({ 
        queryKey: ['proj:ctch:components', projectId, contentTypeId, channelId] 
      })
      await onSave()
      toast({ title: 'Success', description: 'Component updated' })
    } catch (err: any) {
      console.error('Failed to update component:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }, [projectId, contentTypeId, channelId, component.id, customTitle, customDescription, supabase, queryClient, onSave])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Edit Component</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Component title"
            />
          </div>
          
          <div>
            <Label>Description</Label>
            <Textarea
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              placeholder="Component description"
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Old Section B: Default Briefings Grid (REMOVED - integrated into channels section)
function DefaultBriefingsGrid_DEPRECATED({ projectId }: { projectId: number }) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()
  
  const [contentTypes, setContentTypes] = useState<ContentType[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [briefingTypes, setBriefingTypes] = useState<BriefingType[]>([])
  const [defaults, setDefaults] = useState<Map<string, number | null>>(new Map())
  const [editingCell, setEditingCell] = useState<{ contentTypeId: number; channelId: number; briefingTypeId: number | null } | null>(null)

  // Fetch enabled content types
  const fetchContentTypes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('project_content_type_settings')
        .select(`
          content_type_id,
          content_types!inner(id, title)
        `)
        .eq('project_id', projectId)

      if (error) throw error

      const types = (data || []).map((pcts: any) => ({
        id: pcts.content_type_id,
        title: pcts.content_types.title,
        enabled: true
      })).sort((a, b) => a.title.localeCompare(b.title))

      setContentTypes(types)
    } catch (err: any) {
      console.error('Failed to fetch content types:', err)
    }
  }, [projectId, supabase])

  // Fetch channels from project_content_types_channels (union of all enabled CTs)
  const fetchChannels = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('project_content_types_channels')
        .select(`
          channel_id,
          channels!inner(id, name)
        `)
        .eq('project_id', projectId)

      if (error) throw error

      // Deduplicate by channel_id
      const channelMap = new Map<number, Channel>()
      ;(data || []).forEach((pctc: any) => {
        if (!channelMap.has(pctc.channel_id)) {
          channelMap.set(pctc.channel_id, {
            id: pctc.channel_id,
            name: pctc.channels.name,
            position: null
          })
        }
      })

      setChannels(Array.from(channelMap.values()).sort((a, b) => a.name.localeCompare(b.name)))
    } catch (err: any) {
      console.error('Failed to fetch channels:', err)
    }
  }, [projectId, supabase])

  // Fetch briefing types
  const fetchBriefingTypes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('project_briefing_types')
        .select(`
          briefing_type_id,
          briefing_types!inner(id, title, description)
        `)
        .eq('project_id', projectId)
        .order('position', { ascending: true })

      if (error) throw error

      const types = (data || []).map((pbt: any) => ({
        id: pbt.briefing_type_id,
        title: pbt.briefing_types.title,
        description: pbt.briefing_types.description
      }))

      setBriefingTypes(types)
    } catch (err: any) {
      console.error('Failed to fetch briefing types:', err)
    }
  }, [projectId, supabase])

  // Fetch defaults
  const fetchDefaults = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('project_ct_channel_briefings')
        .select('content_type_id, channel_id, briefing_type_id')
        .eq('project_id', projectId)

      if (error) throw error

      const map = new Map<string, number | null>()
      ;(data || []).forEach((d: any) => {
        const key = `${d.content_type_id}-${d.channel_id}`
        map.set(key, d.briefing_type_id)
      })

      setDefaults(map)
    } catch (err: any) {
      console.error('Failed to fetch defaults:', err)
    }
  }, [projectId, supabase])

  // Set default briefing
  const handleSetDefault = useCallback(async (contentTypeId: number, channelId: number, briefingTypeId: number | null) => {
    try {
      const { error } = await supabase.rpc('pcctb_set', {
        p_project_id: projectId,
        p_content_type_id: contentTypeId,
        p_channel_id: channelId,
        p_briefing_type_id: briefingTypeId
      })

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['proj:ctch:default', projectId] })
      await fetchDefaults()
      toast({ title: 'Success', description: 'Default briefing updated' })
    } catch (err: any) {
      console.error('Failed to set default:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, supabase, queryClient, fetchDefaults])

  useEffect(() => {
    fetchContentTypes()
    fetchChannels()
    fetchBriefingTypes()
    fetchDefaults()
  }, [fetchContentTypes, fetchChannels, fetchBriefingTypes, fetchDefaults])

  const getDefaultBriefing = (contentTypeId: number, channelId: number) => {
    const key = `${contentTypeId}-${channelId}`
    return defaults.get(key) || null
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="border p-2 text-left">Content Type</th>
              {channels.map(ch => (
                <th key={ch.id} className="border p-2 text-center">{ch.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contentTypes.map(ct => (
              <tr key={ct.id}>
                <td className="border p-2 font-medium">{ct.title}</td>
                {channels.map(ch => {
                  const currentBriefingId = getDefaultBriefing(ct.id, ch.id)
                  const currentBriefing = briefingTypes.find(bt => bt.id === currentBriefingId)
                  
                  return (
                    <td key={ch.id} className="border p-2">
                      <div className="flex flex-col gap-2">
                        <Select
                          value={currentBriefingId?.toString() || '__none__'}
                          onValueChange={(v) => handleSetDefault(ct.id, ch.id, v === '__none__' ? null : Number(v))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {briefingTypes.map(bt => (
                              <SelectItem key={bt.id} value={bt.id.toString()}>
                                {bt.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingCell({ contentTypeId: ct.id, channelId: ch.id, briefingTypeId: currentBriefingId })}
                        >
                          <Edit2 className="w-4 h-4 mr-1" />
                          Edit Template
                        </Button>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingCell && (
        <ChannelTemplateEditor
          projectId={projectId}
          contentTypeId={editingCell.contentTypeId}
          channelId={editingCell.channelId}
          briefingTypeId={editingCell.briefingTypeId}
          onClose={() => setEditingCell(null)}
        />
      )}
    </div>
  )
}

// Sortable Component Item for Channel Template
function SortableChannelComponentItem({
  component,
  onRemove,
  onEdit
}: {
  component: BriefingComponent
  onRemove: () => void
  onEdit: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: component.id.toString()
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 border rounded bg-white"
    >
      <div {...attributes} {...listeners} className="cursor-move p-1 hover:bg-gray-100 rounded">
        <GripVertical className="w-4 h-4 text-gray-400" />
      </div>
      <Badge variant={component.is_override ? 'default' : 'outline'} className="text-xs">
        {component.is_override ? 'Override' : 'Inherited'}
      </Badge>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{component.component_title}</div>
        {component.component_description && (
          <div className="text-xs text-gray-500">{component.component_description}</div>
        )}
      </div>
      {component.is_override && (
        <>
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove}>
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </>
      )}
    </div>
  )
}

// Channel Template Editor Drawer
function ChannelTemplateEditor({ 
  projectId, 
  contentTypeId, 
  channelId,
  briefingTypeId,
  onClose 
}: { 
  projectId: number
  contentTypeId: number
  channelId: number
  briefingTypeId: number | null
  onClose: () => void
}) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

  const [components, setComponents] = useState<BriefingComponent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddMenu, setShowAddMenu] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Fetch components
  const fetchComponents = useCallback(async () => {
    setIsLoading(true)
    try {
      // First try channel-specific components
      const { data: channelData, error: channelError } = await supabase
        .from('project_ct_channel_briefing_components')
        .select(`
          id,
          briefing_component_id,
          project_component_id,
          position,
          custom_title,
          custom_description,
          purpose,
          guidance,
          suggested_word_count,
          subheads
        `)
        .eq('project_id', projectId)
        .eq('content_type_id', contentTypeId)
        .eq('channel_id', channelId)
        .order('position', { ascending: true })

      if (channelError && channelError.code !== 'PGRST116') throw channelError

      if (channelData && channelData.length > 0) {
        // Fetch briefing_components for the IDs we found
        const briefingComponentIds = channelData
          .map((d: any) => d.briefing_component_id)
          .filter((id: any): id is number => id !== null)
        
        let briefingComponentsMap = new Map<number, { title: string; description: string | null }>()
        
        if (briefingComponentIds.length > 0) {
          const { data: briefingComps, error: bcError } = await supabase
            .from('briefing_components')
            .select('id, title, description')
            .in('id', briefingComponentIds)
          
          if (!bcError && briefingComps) {
            briefingComps.forEach((bc: any) => {
              briefingComponentsMap.set(bc.id, { title: bc.title, description: bc.description })
            })
          }
        }

        const comps = (channelData || []).map((pctcbc: any) => {
          const briefingInfo = pctcbc.briefing_component_id 
            ? briefingComponentsMap.get(pctcbc.briefing_component_id)
            : null
          
          return {
            id: pctcbc.id,
            briefing_component_id: pctcbc.briefing_component_id,
            project_component_id: pctcbc.project_component_id,
            component_title: pctcbc.custom_title || briefingInfo?.title || 'Custom Component',
            component_description: pctcbc.custom_description || briefingInfo?.description || null,
            position: pctcbc.position,
            is_override: true
          }
        })
        setComponents(comps)
        setIsLoading(false)
        return
      }

      // Fallback to project template - use effective_title and effective_description
      const { data: templateData, error: templateError } = await supabase
        .from('v_project_briefing_types_components_resolved')
        .select('*')
        .eq('project_id', projectId)

      if (templateError) throw templateError

      // Use effective_title and effective_description from the view
      const comps = (templateData || []).map((item: any, idx: number) => ({
        id: item.id || `template-${idx}`,
        briefing_component_id: item.briefing_component_id,
        project_component_id: item.project_component_id || null,
        component_title: item.effective_title || 'Component',
        component_description: item.effective_description || null,
        position: item.position || idx,
        is_override: false
      }))

      setComponents(comps)
    } catch (err: any) {
      console.error('Failed to fetch components:', err)
      toast({ title: 'Error', description: 'Failed to load components', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }, [projectId, contentTypeId, channelId, briefingTypeId, supabase])
  
  const handleDragEnd = useCallback(async (event: any) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = components.findIndex(c => c.id.toString() === active.id)
    const newIndex = components.findIndex(c => c.id.toString() === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const newComponents = arrayMove(components, oldIndex, newIndex)
    setComponents(newComponents)

    // Build order array for RPC
    const componentIds = newComponents.map((c) => c.id)
    
    try {
      if (!briefingTypeId) {
        throw new Error('Briefing type is required for reordering')
      }

      const { error } = await supabase.rpc('pcctbc_reorder', {
        p_project_id: projectId,
        p_content_type_id: contentTypeId,
        p_channel_id: channelId,
        p_briefing_type_id: briefingTypeId,
        p_component_ids: componentIds
      })

      if (error) throw error

      queryClient.invalidateQueries({ 
        queryKey: ['proj:ctch:components', projectId, contentTypeId, channelId] 
      })
    } catch (err: any) {
      console.error('Failed to reorder:', err)
      toast({ title: 'Error', description: 'Failed to reorder components', variant: 'destructive' })
      await fetchComponents() // Revert on error
    }
  }, [components, projectId, contentTypeId, channelId, briefingTypeId, supabase, queryClient, fetchComponents])

  // Add global component
  const handleAddGlobal = useCallback(async (componentId: number) => {
    try {
      const { error } = await supabase.rpc('pcctbc_add_global', {
        p_project_id: projectId,
        p_content_type_id: contentTypeId,
        p_channel_id: channelId,
        p_briefing_component_id: componentId
      })

      if (error) throw error

      queryClient.invalidateQueries({ 
        queryKey: ['proj:ctch:components', projectId, contentTypeId, channelId] 
      })
      await fetchComponents()
      setShowAddMenu(false)
      toast({ title: 'Success', description: 'Global component added' })
    } catch (err: any) {
      console.error('Failed to add global component:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, contentTypeId, channelId, supabase, queryClient, fetchComponents])

  // Add project component
  const handleAddProject = useCallback(async (componentId: number) => {
    try {
      const { error } = await supabase.rpc('pcctbc_add_project', {
        p_project_id: projectId,
        p_content_type_id: contentTypeId,
        p_channel_id: channelId,
        p_project_component_id: componentId
      })

      if (error) throw error

      queryClient.invalidateQueries({ 
        queryKey: ['proj:ctch:components', projectId, contentTypeId, channelId] 
      })
      await fetchComponents()
      setShowAddMenu(false)
      toast({ title: 'Success', description: 'Project component added' })
    } catch (err: any) {
      console.error('Failed to add project component:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, contentTypeId, channelId, supabase, queryClient, fetchComponents])

  // Remove component
  const handleRemove = useCallback(async (componentId: number, isProjectComponent: boolean) => {
    try {
      const { error } = await supabase.rpc('pcctbc_remove', {
        p_project_id: projectId,
        p_content_type_id: contentTypeId,
        p_channel_id: channelId,
        p_component_id: componentId,
        p_is_project_component: isProjectComponent
      })

      if (error) throw error

      queryClient.invalidateQueries({ 
        queryKey: ['proj:ctch:components', projectId, contentTypeId, channelId] 
      })
      await fetchComponents()
      toast({ title: 'Success', description: 'Component removed' })
    } catch (err: any) {
      console.error('Failed to remove component:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, contentTypeId, channelId, supabase, queryClient, fetchComponents])

  useEffect(() => {
    fetchComponents()
  }, [fetchComponents])

  // Get channel name for display
  const [channelName, setChannelName] = useState<string>('')
  useEffect(() => {
    supabase
      .from('channels')
      .select('name')
      .eq('id', channelId)
      .single()
      .then(({ data }) => {
        if (data) setChannelName(data.name)
      })
  }, [channelId, supabase])

  return (
    <SlidePanel
      isOpen={true}
      onClose={onClose}
      title={`Edit Template: ${channelName || `Channel ${channelId}`}`}
      position="right"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {components.length === 0 
                ? 'No components. Add global or project components to create an override.'
                : `${components.filter(c => c.is_override).length} override(s), ${components.filter(c => !c.is_override).length} inherited`
              }
            </p>
            <Button size="sm" onClick={() => setShowAddMenu(!showAddMenu)}>
              <Plus className="w-4 h-4 mr-1" />
              Add Component
            </Button>
          </div>

          {showAddMenu && (
            <div className="border rounded p-3 bg-gray-50 space-y-2">
              <p className="text-xs font-medium text-gray-700">Add Component</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => {
                  // TODO: Open dialog to select global component
                  toast({ title: 'Info', description: 'Global component selector coming soon' })
                }}>
                  Add Global
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  // TODO: Open dialog to select project component
                  toast({ title: 'Info', description: 'Project component selector coming soon' })
                }}>
                  Add Project
                </Button>
              </div>
            </div>
          )}

          {components.length === 0 ? (
            <div className="text-center py-8 border border-blue-200 bg-blue-50 rounded p-4">
              <p className="text-sm font-medium text-blue-900">Inherited from Project Briefing Template</p>
              <p className="text-xs text-blue-700 mt-1">
                No channel-specific overrides. Using project default template.
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={components.map(c => c.id.toString())}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {components.map(comp => (
                    <SortableChannelComponentItem
                      key={comp.id}
                      component={comp}
                      onRemove={() => handleRemove(
                        comp.briefing_component_id || comp.id || 0,
                        !!comp.briefing_component_id
                      )}
                      onEdit={() => {
                        // TODO: Open edit dialog
                        toast({ title: 'Info', description: 'Edit component dialog coming soon' })
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}
    </SlidePanel>
  )
}

// Project Channels Section
export function ProjectChannels({ projectId }: { projectId: number }) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()
  
  const [channels, setChannels] = useState<Array<{
    channel_id: number
    channel_name: string
    is_enabled: boolean
    is_default: boolean
    position: number | null
  }>>([])
  const [availableGlobalChannels, setAvailableGlobalChannels] = useState<Array<{ id: number; name: string }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [defaultChannelIds, setDefaultChannelIds] = useState<Set<number>>(new Set())
  const [showAddChannelDialog, setShowAddChannelDialog] = useState(false)
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null)
  const [removingChannelId, setRemovingChannelId] = useState<number | null>(null)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [pctcCount, setPctcCount] = useState<number>(0)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Fetch project channels
  const fetchChannels = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('v_project_channels_resolved')
        .select('*')
        .eq('project_id', projectId)
        .order('position', { ascending: true, nullsFirst: true })

      if (error) throw error

      const channelsList = (data || []).map((item: any) => ({
        channel_id: item.channel_id,
        channel_name: item.channel_name || item.name,
        is_enabled: item.is_enabled ?? true,
        is_default: item.is_default ?? false,
        position: item.position
      }))

      setChannels(channelsList)
      
      // Track default channels
      const defaults = new Set(
        channelsList.filter(c => c.is_default).map(c => c.channel_id)
      )
      setDefaultChannelIds(defaults)

      // Fetch available global channels
      const { data: allChannels, error: allError } = await supabase
        .from('channels')
        .select('id, name')
        .order('name')

      if (!allError && allChannels) {
        const existingIds = new Set(channelsList.map(c => c.channel_id))
        setAvailableGlobalChannels(allChannels.filter(c => !existingIds.has(c.id)))
      }
    } catch (err: any) {
      console.error('Failed to fetch project channels:', err)
      toast({ title: 'Error', description: 'Failed to load channels', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }, [projectId, supabase])

  useEffect(() => {
    fetchChannels()
  }, [fetchChannels])

  // Handle enable/disable toggle
  const handleToggleEnabled = useCallback(async (channelId: number, enabled: boolean) => {
    try {
      const { error } = await supabase.rpc('project_channel_set', {
        p_project_id: projectId,
        p_channel_id: channelId,
        p_is_enabled: enabled
      })

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['proj:channels:roster', projectId] })
      await fetchChannels()
      toast({ title: 'Success', description: `Channel ${enabled ? 'enabled' : 'disabled'}` })
    } catch (err: any) {
      console.error('Failed to toggle channel:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, supabase, queryClient, fetchChannels])

  // Handle add channel
  const handleAddChannel = useCallback(async () => {
    if (!selectedChannelId) return

    try {
      const { error } = await supabase.rpc('project_channel_set', {
        p_project_id: projectId,
        p_channel_id: selectedChannelId,
        p_is_enabled: true
      })

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['proj:channels:roster', projectId] })
      await fetchChannels()
      setShowAddChannelDialog(false)
      setSelectedChannelId(null)
      toast({ title: 'Success', description: 'Channel added' })
    } catch (err: any) {
      console.error('Failed to add channel:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, selectedChannelId, supabase, queryClient, fetchChannels])

  // Handle set defaults
  const handleSetDefaults = useCallback(async () => {
    try {
      const { error } = await supabase.rpc('project_channels_set_defaults', {
        p_project_id: projectId,
        p_defaults: Array.from(defaultChannelIds)
      })

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['proj:channels:roster', projectId] })
      await fetchChannels()
      toast({ 
        title: 'Defaults updated', 
        description: 'Affects future tasks only.' 
      })
    } catch (err: any) {
      console.error('Failed to set defaults:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, defaultChannelIds, supabase, queryClient, fetchChannels])

  // Check PCTC usage before remove
  const handleRemoveClick = useCallback(async (channelId: number) => {
    try {
      const { count, error } = await supabase
        .from('project_content_types_channels')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('channel_id', channelId)

      if (error) throw error

      setPctcCount(count || 0)
      setRemovingChannelId(channelId)
      setShowRemoveConfirm(true)
    } catch (err: any) {
      console.error('Failed to check PCTC usage:', err)
      toast({ title: 'Error', description: 'Failed to check channel usage', variant: 'destructive' })
    }
  }, [projectId, supabase])

  // Handle remove channel
  const handleRemoveChannel = useCallback(async () => {
    if (!removingChannelId) return

    try {
      const { error } = await supabase.rpc('project_channel_remove', {
        p_project_id: projectId,
        p_channel_id: removingChannelId
      })

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['proj:channels:roster', projectId] })
      await fetchChannels()
      setShowRemoveConfirm(false)
      setRemovingChannelId(null)
      toast({ 
        title: 'Success', 
        description: pctcCount > 0 
          ? 'Channel removed. Consider removing it from Content Types per Channel settings.' 
          : 'Channel removed' 
      })
    } catch (err: any) {
      console.error('Failed to remove channel:', err)
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }, [projectId, removingChannelId, supabase, queryClient, fetchChannels, pctcCount])

  // Handle drag end for reordering
  const handleDragEnd = useCallback(async (event: any) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = channels.findIndex(c => c.channel_id.toString() === active.id)
    const newIndex = channels.findIndex(c => c.channel_id.toString() === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const newChannels = arrayMove(channels, oldIndex, newIndex)
    setChannels(newChannels)

    // Update positions
    try {
      for (let i = 0; i < newChannels.length; i++) {
        const { error } = await supabase.rpc('project_channel_set', {
          p_project_id: projectId,
          p_channel_id: newChannels[i].channel_id,
          p_position: i + 1
        })
        if (error) throw error
      }

      queryClient.invalidateQueries({ queryKey: ['proj:channels:roster', projectId] })
      toast({ title: 'Success', description: 'Channels reordered' })
    } catch (err: any) {
      console.error('Failed to reorder channels:', err)
      toast({ title: 'Error', description: 'Failed to reorder channels', variant: 'destructive' })
      await fetchChannels() // Revert on error
    }
  }, [channels, projectId, supabase, queryClient, fetchChannels])

  // Toggle default
  const handleToggleDefault = useCallback((channelId: number) => {
    setDefaultChannelIds(prev => {
      const next = new Set(prev)
      if (next.has(channelId)) {
        next.delete(channelId)
      } else {
        next.add(channelId)
      }
      return next
    })
  }, [])

  // Sortable channel item
  const SortableChannelItem = ({ channel }: { channel: typeof channels[0] }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: channel.channel_id.toString()
    })

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    }

    const isDefault = defaultChannelIds.has(channel.channel_id)

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center gap-2 p-2 border rounded bg-white"
      >
        <div {...attributes} {...listeners} className="cursor-move p-1 hover:bg-gray-100 rounded">
          <GripVertical className="w-4 h-4 text-gray-400" />
        </div>
        <Checkbox
          checked={channel.is_enabled}
          onCheckedChange={(checked) => handleToggleEnabled(channel.channel_id, checked === true)}
        />
        <button
          onClick={() => handleToggleDefault(channel.channel_id)}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <Star className={`w-4 h-4 ${isDefault ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`} />
        </button>
        <span className="flex-1 font-medium">{channel.channel_name}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => handleRemoveClick(channel.channel_id)}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Project Channels</h3>
          <div className="flex gap-2">
            {defaultChannelIds.size > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleSetDefaults}
              >
                Save Defaults
              </Button>
            )}
            {availableGlobalChannels.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddChannelDialog(true)}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Channel
              </Button>
            )}
          </div>
        </div>

        {channels.length === 0 ? (
          <div className="text-center py-8 border border-dashed rounded text-gray-500">
            No channels configured. Add a channel to get started.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={channels.map(c => c.channel_id.toString())}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {channels.map(channel => (
                  <SortableChannelItem key={channel.channel_id} channel={channel} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Add Channel Dialog */}
      {showAddChannelDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add Channel</h3>
              <Button variant="ghost" size="sm" onClick={() => {
                setShowAddChannelDialog(false)
                setSelectedChannelId(null)
              }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label>Select Channel</Label>
                <Select
                  value={selectedChannelId?.toString() || ''}
                  onValueChange={(v) => setSelectedChannelId(Number(v))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a channel..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableGlobalChannels.map(ch => (
                      <SelectItem key={ch.id} value={ch.id.toString()}>
                        {ch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => {
                setShowAddChannelDialog(false)
                setSelectedChannelId(null)
              }}>
                Cancel
              </Button>
              <Button onClick={handleAddChannel} disabled={!selectedChannelId}>
                Add
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirmation Dialog */}
      {showRemoveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Remove Channel</h3>
              <Button variant="ghost" size="sm" onClick={() => {
                setShowRemoveConfirm(false)
                setRemovingChannelId(null)
              }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                Are you sure you want to remove this channel from the project?
              </p>
              {pctcCount > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                  <p className="text-xs text-yellow-800">
                    This channel is used in {pctcCount} Content Type configuration{pctcCount > 1 ? 's' : ''}. 
                    Consider removing it from "Channels per Content Type" settings first.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => {
                setShowRemoveConfirm(false)
                setRemovingChannelId(null)
              }}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleRemoveChannel}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function ConfigurationTab({ projectId }: ConfigurationTabProps) {
  return (
    <div className="space-y-8">
      {/* Project Channels moved to OverviewTab */}
      {/* Channels, Languages, Content Types moved to OverviewTab */}
      {/* Channels per Content Type moved to BriefingsTab */}
      <div className="p-6 text-center text-gray-500">
        <p>Configuration settings have been reorganized:</p>
        <ul className="mt-2 space-y-1">
          <li>• Project Channels → Overview tab</li>
          <li>• Languages & Content Types → Overview tab</li>
          <li>• Channels per Content Type → Briefings tab</li>
        </ul>
      </div>
    </div>
  )
}

