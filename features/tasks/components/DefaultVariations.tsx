"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Button } from "../../../app/components/ui/button"
import { Badge } from "../../../app/components/ui/badge"
import { Input } from "../../../app/components/ui/input"
import { Label } from "../../../app/components/ui/label"
import { Checkbox } from "../../../app/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../../app/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../app/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../app/components/ui/select"
import { toast } from "../../../app/components/ui/use-toast"
import { 
  Plus, 
  X, 
  Minus,
  GripVertical, 
  Loader2,
  CheckCircle2,
  Circle,
  MoreVertical
} from "lucide-react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface DefaultVariation {
  id: string
  content_type_id: number
  content_type_title: string
  channel_id: number | null
  channel_name: string | null
  language_id: number
  language_code: string
  language_name: string
  is_active: boolean
  position: number | null
}

interface ProjectLanguage {
  language_id: number
  code: string
  long_name: string
  is_primary: boolean
}

interface Channel {
  channel_id: number
  name: string
}

interface ContentType {
  id: number
  title: string
}

interface DefaultVariationsModalProps {
  projectId: number
  isOpen: boolean
  onClose: () => void
}

// Sortable Row Component
function SortableRow({
  variation,
  onToggleActive,
  onDelete
}: {
  variation: DefaultVariation
  onToggleActive: (id: string) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: variation.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <tr ref={setNodeRef} style={style} className="hover:bg-gray-50 cursor-pointer">
      <td className="px-3 py-2 text-sm border-b border-gray-100 align-middle">
        <div {...attributes} {...listeners} className="cursor-move p-1 hover:bg-gray-200 rounded inline-block">
          <GripVertical className="w-4 h-4 text-gray-400" />
        </div>
      </td>
      <td className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">
        <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">
          {variation.content_type_title}
        </span>
      </td>
      <td className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">
        <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">
          {variation.channel_name || 'None (generic)'}
        </span>
      </td>
      <td className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">
        <span className="truncate block max-w-full whitespace-nowrap overflow-hidden text-ellipsis">
          {variation.language_code} - {variation.language_name}
        </span>
      </td>
      <td className="px-3 py-2 text-sm border-b border-gray-100 align-middle">
        {variation.is_active ? (
          <Badge className="bg-green-600 text-white text-xs">Active</Badge>
        ) : (
          <Badge variant="outline" className="text-xs">Inactive</Badge>
        )}
      </td>
      <td className="px-3 py-2 text-sm border-b border-gray-100 align-middle">
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleActive(variation.id)
            }}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            {variation.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(variation.id)
            }}
            className="text-xs text-red-600 hover:text-red-800"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  )
}

export function DefaultVariationsModal({ projectId, isOpen, onClose }: DefaultVariationsModalProps) {
  const supabase = createClientComponentClient()
  const [defaults, setDefaults] = useState<DefaultVariation[]>([])
  const [loading, setLoading] = useState(false)
  const [contentTypes, setContentTypes] = useState<ContentType[]>([])
  const [projectLanguages, setProjectLanguages] = useState<ProjectLanguage[]>([])
  const [availableChannels, setAvailableChannels] = useState<Channel[]>([])
  const [selectedCombinations, setSelectedCombinations] = useState<Set<string>>(new Set())
  
  // Form state
  const [selectedContentTypeId, setSelectedContentTypeId] = useState<number | null>(null)
  const [allContentTypes, setAllContentTypes] = useState<ContentType[]>([])
  const [projectContentTypes, setProjectContentTypes] = useState<Set<number>>(new Set())
  const [contentTypeSearchQuery, setContentTypeSearchQuery] = useState('')
  const [isAddContentTypeOpen, setIsAddContentTypeOpen] = useState(false)
  
  // Add language/channel dialogs
  const [isAddLanguageOpen, setIsAddLanguageOpen] = useState(false)
  const [isAddChannelOpen, setIsAddChannelOpen] = useState(false)
  const [availableLanguagesToAdd, setAvailableLanguagesToAdd] = useState<ProjectLanguage[]>([])
  const [availableChannelsToAdd, setAvailableChannelsToAdd] = useState<Channel[]>([])
  const [channelToAdd, setChannelToAdd] = useState<Channel | null>(null)
  const [languageToAdd, setLanguageToAdd] = useState<ProjectLanguage | null>(null)
  const [channelSearchQuery, setChannelSearchQuery] = useState('')
  const [languageSearchQuery, setLanguageSearchQuery] = useState('')
  const [showChannelConfirm, setShowChannelConfirm] = useState(false)
  const [showLanguageConfirm, setShowLanguageConfirm] = useState(false)
  const [showRemoveChannelConfirm, setShowRemoveChannelConfirm] = useState(false)
  const [showRemoveLanguageConfirm, setShowRemoveLanguageConfirm] = useState(false)
  const [showRemoveLanguageFromProjectConfirm, setShowRemoveLanguageFromProjectConfirm] = useState(false)
  const [channelToRemove, setChannelToRemove] = useState<{id: number, name: string} | null>(null)
  const [languageToRemove, setLanguageToRemove] = useState<{id: number, name: string, code: string} | null>(null)
  const [languageRemovedFromContentType, setLanguageRemovedFromContentType] = useState<{id: number, name: string, code: string, contentTypeTitle: string} | null>(null)
  
  // Setup wizard for new content type
  const [setupContentType, setSetupContentType] = useState<ContentType | null>(null)
  const [setupSelectedChannels, setSetupSelectedChannels] = useState<Set<number>>(new Set())
  const [setupSelectedLanguages, setSetupSelectedLanguages] = useState<Set<number>>(new Set())
  const [setupSEORequired, setSetupSEORequired] = useState(false)
  const [setupGlobalChannels, setSetupGlobalChannels] = useState<Array<{id: number, name: string, position: number | null}>>([])
  const [setupAllowedChannels, setSetupAllowedChannels] = useState<Array<{id: number, name: string, position: number | null}>>([])
  const [setupProjectLanguages, setSetupProjectLanguages] = useState<Array<{language_id: number, code: string, long_name: string, is_primary: boolean}>>([])
  const [setupLoading, setSetupLoading] = useState(false)

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Fetch project languages
  const fetchProjectLanguages = useCallback(async () => {
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
        // Sort by is_primary DESC, then by long_name ASC
        if (a.is_primary !== b.is_primary) {
          return b.is_primary ? 1 : -1
        }
        return a.long_name.localeCompare(b.long_name)
      })

      setProjectLanguages(languages)
    } catch (error: any) {
      console.error('Failed to fetch project languages:', error)
      toast({
        title: "Error",
        description: "Failed to load project languages",
        variant: "destructive",
      })
    }
  }, [projectId, supabase])

  // Fetch all content types and track which ones are in project
  const fetchContentTypes = useCallback(async () => {
    try {
      // Fetch all content types
      const { data: allTypes, error: allError } = await supabase
        .from('content_types')
        .select('id, title')
        .order('title')

      if (allError) throw allError

      const all = (allTypes || []).map(ct => ({ id: ct.id, title: ct.title }))
      setAllContentTypes(all)

      // Fetch project content types (those in project_content_types_channels)
      const { data: projectTypes, error: projectError } = await supabase
        .from('project_content_types_channels')
        .select('content_type_id')
        .eq('project_id', projectId)

      if (projectError) throw projectError

      const projectTypeIds = new Set<number>()
      ;(projectTypes || []).forEach((item: any) => {
        projectTypeIds.add(item.content_type_id)
      })
      setProjectContentTypes(projectTypeIds)

      // Set content types to only those in project (for pills display)
      const inProject = all.filter(ct => projectTypeIds.has(ct.id))
      setContentTypes(inProject)

      // Set default to first content type in project, or first overall if none
      if (!selectedContentTypeId) {
        if (inProject.length > 0) {
          setSelectedContentTypeId(inProject[0].id)
        } else if (all.length > 0) {
          setSelectedContentTypeId(all[0].id)
        }
      }
    } catch (error: any) {
      console.error('Failed to fetch content types:', error)
      toast({
        title: "Error",
        description: "Failed to load content types",
        variant: "destructive",
      })
    }
  }, [projectId, selectedContentTypeId, supabase])

  // Fetch available channels for content type (from project_content_types_channels)
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

      if (error) throw error

      const channels = (data || [])
        .map((pctc: any) => ({
          channel_id: pctc.channel_id,
          name: pctc.channels.name,
          position: pctc.position
        }))
        .sort((a, b) => {
          // Sort by position ASC (nulls last), then by name ASC
          const posA = a.position ?? 999999
          const posB = b.position ?? 999999
          if (posA !== posB) return posA - posB
          return a.name.localeCompare(b.name)
        })

      setAvailableChannels(channels)
    } catch (error: any) {
      console.error('Failed to fetch channels:', error)
      toast({
        title: "Error",
        description: "Failed to load channels",
        variant: "destructive",
      })
    }
  }, [projectId, supabase])

  // Fetch current defaults for a content type to show which combinations are selected
  const fetchSelectedCombinations = useCallback(async (contentTypeId: number) => {
    try {
      const { data, error } = await supabase
        .from('project_content_type_variations')
        .select('channel_id, language_id')
        .eq('project_id', projectId)
        .eq('content_type_id', contentTypeId)
        .not('channel_id', 'is', null) // Exclude null channels
        .eq('is_active', true)

      if (error) throw error

      // Create a set of combination keys "channelId:languageId"
      const combinations = new Set<string>()
      ;(data || []).forEach((item: any) => {
        const key = `${item.channel_id}:${item.language_id}`
        combinations.add(key)
      })

      setSelectedCombinations(combinations)
    } catch (error: any) {
      console.error('Failed to fetch selected combinations:', error)
    }
  }, [projectId, supabase])

  // Fetch existing defaults (moved before functions that use it)
  const fetchDefaults = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('project_content_type_variations')
        .select(`
          id,
          content_type_id,
          content_types!inner(id, title),
          channel_id,
          channels(id, name),
          language_id,
          languages!inner(id, code, long_name),
          is_active,
          position
        `)
        .eq('project_id', projectId)

      if (error) throw error

      const variations = (data || [])
        .map((v: any) => ({
          id: v.id,
          content_type_id: v.content_type_id,
          content_type_title: v.content_types.title,
          channel_id: v.channel_id,
          channel_name: v.channels?.name || null,
          language_id: v.language_id,
          language_code: v.languages.code,
          language_name: v.languages.long_name,
          is_active: v.is_active,
          position: v.position
        }))
        .sort((a, b) => {
          // Sort by content_type_title ASC
          const titleCompare = a.content_type_title.localeCompare(b.content_type_title)
          if (titleCompare !== 0) return titleCompare
          
          // Then by position ASC (nulls last)
          const posA = a.position ?? 999999
          const posB = b.position ?? 999999
          const posCompare = posA - posB
          if (posCompare !== 0) return posCompare
          
          // Then by channel_name ASC (nulls first)
          const channelA = a.channel_name || ''
          const channelB = b.channel_name || ''
          if (channelA === '' && channelB !== '') return -1
          if (channelA !== '' && channelB === '') return 1
          const channelCompare = channelA.localeCompare(channelB)
          if (channelCompare !== 0) return channelCompare
          
          // Then by language_name ASC
          return a.language_name.localeCompare(b.language_name)
        })

      setDefaults(variations)
    } catch (error: any) {
      console.error('Failed to fetch defaults:', error)
      toast({
        title: "Error",
        description: "Failed to load default variations",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId, supabase])

  // Fetch all global languages (for adding new ones to project)
  const fetchAvailableLanguagesToAdd = useCallback(async (contentTypeId: number) => {
    try {
      // Get all languages from global table
      const { data: allLanguages, error: langError } = await supabase
        .from('languages')
        .select('id, code, long_name')
        .eq('is_deleted', false)
        .order('long_name')

      if (langError) throw langError

      // Get languages already in project
      const { data: projectLangs, error: projError } = await supabase
        .from('project_languages')
        .select('language_id')
        .eq('project_id', projectId)
        .is('is_deleted', false)

      if (projError) throw projError

      const projectLanguageIds = new Set((projectLangs || []).map((pl: any) => pl.language_id))

      // Map all languages, marking which are in project
      const available = (allLanguages || []).map((lang: any) => ({
        language_id: lang.id,
        code: lang.code,
        long_name: lang.long_name,
        is_in_project: projectLanguageIds.has(lang.id)
      }))
      .sort((a, b) => a.long_name.localeCompare(b.long_name))

      setAvailableLanguagesToAdd(available as any)
    } catch (error: any) {
      console.error('Failed to fetch available languages:', error)
      toast({
        title: "Error",
        description: "Failed to load available languages",
        variant: "destructive",
      })
    }
  }, [projectId, supabase])

  // Fetch all global channels (for adding new ones to project/content type)
  const fetchAvailableChannelsToAdd = useCallback(async (contentTypeId: number) => {
    try {
      // Get all channels from global table
      const { data: allChannels, error: chanError } = await supabase
        .from('channels')
        .select('id, name')
        .eq('is_deleted', false)
        .order('name')

      if (chanError) throw chanError

      // Get channels already allowed for this content type in project
      const { data: projectChannels, error: projError } = await supabase
        .from('project_content_types_channels')
        .select('channel_id')
        .eq('project_id', projectId)
        .eq('content_type_id', contentTypeId)

      if (projError) throw projError

      const projectChannelIds = new Set((projectChannels || []).map((pc: any) => pc.channel_id))

      // Map all channels, marking which are already in project
      const available = (allChannels || []).map((ch: any) => ({
        channel_id: ch.id,
        name: ch.name,
        is_in_project: projectChannelIds.has(ch.id)
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

      setAvailableChannelsToAdd(available as any)
    } catch (error: any) {
      console.error('Failed to fetch available channels:', error)
      toast({
        title: "Error",
        description: "Failed to load available channels",
        variant: "destructive",
      })
    }
  }, [projectId, supabase])

  // Confirm remove channel
  const handleConfirmRemoveChannel = useCallback(async () => {
    if (!selectedContentTypeId || !channelToRemove) return

    try {
      // Remove from project_content_types_channels
      const { error: channelError } = await supabase
        .from('project_content_types_channels')
        .delete()
        .eq('project_id', projectId)
        .eq('content_type_id', selectedContentTypeId)
        .eq('channel_id', channelToRemove.id)

      if (channelError) throw channelError

      // Remove all variations for this channel
      const { error: variationsError } = await supabase
        .from('project_content_type_variations')
        .delete()
        .eq('project_id', projectId)
        .eq('content_type_id', selectedContentTypeId)
        .eq('channel_id', channelToRemove.id)

      if (variationsError) throw variationsError

      // Refresh data
      await fetchChannels(selectedContentTypeId)
      await fetchSelectedCombinations(selectedContentTypeId)
      await fetchDefaults()
      await fetchAvailableChannelsToAdd(selectedContentTypeId)

      setShowRemoveChannelConfirm(false)
      setChannelToRemove(null)
      toast({
        title: "Success",
        description: "Channel removed and all related variations deleted",
      })
    } catch (error: any) {
      console.error('Failed to remove channel:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to remove channel",
        variant: "destructive",
      })
    }
  }, [selectedContentTypeId, projectId, channelToRemove, supabase, fetchChannels, fetchSelectedCombinations, fetchDefaults, fetchAvailableChannelsToAdd])

  // Confirm remove language from this content type only
  const handleConfirmRemoveLanguage = useCallback(async () => {
    if (!selectedContentTypeId || !languageToRemove) return

    try {
      // Remove all variations for this language in this content type only
      const { error: variationsError } = await supabase
        .from('project_content_type_variations')
        .delete()
        .eq('project_id', projectId)
        .eq('content_type_id', selectedContentTypeId)
        .eq('language_id', languageToRemove.id)

      if (variationsError) throw variationsError

      // Check if language is used in any other content type variations
      const { data: otherVariations, error: checkError } = await supabase
        .from('project_content_type_variations')
        .select('id')
        .eq('project_id', projectId)
        .eq('language_id', languageToRemove.id)
        .neq('content_type_id', selectedContentTypeId)
        .limit(1)

      if (checkError) throw checkError

      const isUsedElsewhere = (otherVariations || []).length > 0
      const contentTypeTitle = contentTypes.find(ct => ct.id === selectedContentTypeId)?.title || 'this content type'

      // Refresh data
      await fetchChannels(selectedContentTypeId)
      await fetchSelectedCombinations(selectedContentTypeId)
      await fetchDefaults()
      await fetchAvailableLanguagesToAdd(selectedContentTypeId)

      setShowRemoveLanguageConfirm(false)
      const removedLanguage = { ...languageToRemove }
      setLanguageToRemove(null)

      // If language is not used in any other content type, offer to remove from project
      if (!isUsedElsewhere) {
        setLanguageRemovedFromContentType({
          id: removedLanguage.id,
          name: removedLanguage.name,
          code: removedLanguage.code,
          contentTypeTitle
        })
        // Automatically show the secondary confirmation dialog
        setShowRemoveLanguageFromProjectConfirm(true)
      } else {
        toast({
          title: "Success",
          description: `${removedLanguage.code} removed from ${contentTypeTitle} defaults`,
        })
      }
    } catch (error: any) {
      console.error('Failed to remove language:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to remove language",
        variant: "destructive",
      })
    }
  }, [selectedContentTypeId, projectId, languageToRemove, contentTypes, supabase, fetchChannels, fetchSelectedCombinations, fetchDefaults, fetchAvailableLanguagesToAdd])

  // Remove language from project entirely
  const handleConfirmRemoveLanguageFromProject = useCallback(async () => {
    if (!languageRemovedFromContentType) return

    try {
      // Remove from project_languages (this should cascade delete variations due to foreign key)
      const { error: deleteError } = await supabase
        .from('project_languages')
        .delete()
        .eq('project_id', projectId)
        .eq('language_id', languageRemovedFromContentType.id)

      if (deleteError) throw deleteError

      // Refresh all data
      await fetchProjectLanguages()
      if (selectedContentTypeId) {
        await fetchChannels(selectedContentTypeId)
        await fetchSelectedCombinations(selectedContentTypeId)
        await fetchDefaults()
        await fetchAvailableLanguagesToAdd(selectedContentTypeId)
      }

      setShowRemoveLanguageFromProjectConfirm(false)
      setLanguageRemovedFromContentType(null)
      toast({
        title: "Success",
        description: `${languageRemovedFromContentType.code} removed from project`,
      })
    } catch (error: any) {
      console.error('Failed to remove language from project:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to remove language from project",
        variant: "destructive",
      })
    }
  }, [projectId, languageRemovedFromContentType, selectedContentTypeId, supabase, fetchProjectLanguages, fetchChannels, fetchSelectedCombinations, fetchDefaults, fetchAvailableLanguagesToAdd])

  // Confirm and add channel (with confirmation dialog)
  const handleConfirmAddChannel = useCallback(async () => {
    if (!selectedContentTypeId || !channelToAdd) return

    try {
      // Check if channel is already in project_content_types_channels
      const channelInProject = availableChannelsToAdd.find((ch: any) => 
        ch.channel_id === channelToAdd.channel_id && ch.is_in_project
      )

      if (!channelInProject) {
        // Insert into project_content_types_channels
        const { error: insertError } = await supabase
          .from('project_content_types_channels')
          .insert({
            project_id: projectId,
            content_type_id: selectedContentTypeId,
            channel_id: channelToAdd.channel_id
          })
          .select()
          .single()

        // Handle conflict gracefully (ON CONFLICT DO NOTHING equivalent)
        if (insertError && insertError.code !== '23505') { // 23505 is unique violation
          throw insertError
        }
      }

      // Upsert default variations for each selected language
      const selectedLangs = projectLanguages.map(l => l.language_id)
      const variationInserts = selectedLangs.map(langId => ({
        project_id: projectId,
        content_type_id: selectedContentTypeId,
        channel_id: channelToAdd.channel_id,
        language_id: langId,
        is_active: true
      }))

      const { error: upsertError } = await supabase
        .from('project_content_type_variations')
        .upsert(variationInserts, {
          onConflict: 'project_id,content_type_id,channel_id,language_id',
          ignoreDuplicates: false
        })

      if (upsertError) throw upsertError

      // Refresh data
      await fetchChannels(selectedContentTypeId)
      await fetchSelectedCombinations(selectedContentTypeId)
      await fetchDefaults()
      await fetchAvailableChannelsToAdd(selectedContentTypeId)

      setChannelToAdd(null)
      setIsAddChannelOpen(false)
      toast({
        title: "Success",
        description: `Added ${channelToAdd.name} to allowed channels and created default variations`,
      })
    } catch (error: any) {
      console.error('Failed to add channel:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to add channel",
        variant: "destructive",
      })
    }
  }, [selectedContentTypeId, projectId, channelToAdd, projectLanguages, availableChannelsToAdd, supabase, fetchChannels, fetchSelectedCombinations, fetchDefaults, fetchAvailableChannelsToAdd])

  // Confirm and add language (with confirmation dialog)
  const handleConfirmAddLanguage = useCallback(async () => {
    if (!selectedContentTypeId || !languageToAdd) return

    try {
      // Check if language is already in project
      const langInProject = availableLanguagesToAdd.find((l: any) => 
        l.language_id === languageToAdd.language_id && l.is_in_project
      )

      if (!langInProject) {
        // Insert into project_languages (admins only - check would be done in RPC or by role)
        const { error: insertError } = await supabase
          .from('project_languages')
          .insert({
            project_id: projectId,
            language_id: languageToAdd.language_id,
            is_primary: false,
            is_deleted: false
          })
          .select()
          .single()

        // Handle conflict gracefully (ON CONFLICT DO NOTHING equivalent)
        if (insertError && insertError.code !== '23505') { // 23505 is unique violation
          throw insertError
        }
      }

      // Upsert default variations for currently selected channels
      const selectedChans = availableChannels.map(ch => ch.channel_id)
      const variationInserts = selectedChans.map(chanId => ({
        project_id: projectId,
        content_type_id: selectedContentTypeId,
        channel_id: chanId,
        language_id: languageToAdd.language_id,
        is_active: true
      }))

      const { error: upsertError } = await supabase
        .from('project_content_type_variations')
        .upsert(variationInserts, {
          onConflict: 'project_id,content_type_id,channel_id,language_id',
          ignoreDuplicates: false
        })

      if (upsertError) throw upsertError

      // Refresh data
      await fetchProjectLanguages()
      await fetchSelectedCombinations(selectedContentTypeId)
      await fetchDefaults()
      await fetchAvailableLanguagesToAdd(selectedContentTypeId)

      setLanguageToAdd(null)
      setIsAddLanguageOpen(false)
      toast({
        title: "Success",
        description: `Added ${languageToAdd.long_name} to project and created default variations`,
      })
    } catch (error: any) {
      console.error('Failed to add language:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to add language",
        variant: "destructive",
      })
    }
  }, [selectedContentTypeId, projectId, languageToAdd, availableChannels, availableLanguagesToAdd, supabase, fetchProjectLanguages, fetchSelectedCombinations, fetchDefaults, fetchAvailableLanguagesToAdd])

  // Toggle active
  const handleToggleActive = useCallback(async (id: string) => {
    const variation = defaults.find(d => d.id === id)
    if (!variation) return

    const newActive = !variation.is_active

    // Optimistic update
    setDefaults(prev => prev.map(d => d.id === id ? { ...d, is_active: newActive } : d))

    try {
      const { error } = await supabase
        .from('project_content_type_variations')
        .update({ is_active: newActive })
        .eq('id', id)

      if (error) throw error

      toast({
        title: "Success",
        description: `Variation ${newActive ? 'activated' : 'deactivated'}`,
      })
    } catch (error: any) {
      console.error('Failed to toggle active:', error)
      // Revert
      await fetchDefaults()
      toast({
        title: "Error",
        description: "Failed to update variation",
        variant: "destructive",
      })
    }
  }, [defaults, supabase, fetchDefaults])

  // Delete
  const handleDelete = useCallback(async (id: string) => {
    // Optimistic update
    const toDelete = defaults.find(d => d.id === id)
    setDefaults(prev => prev.filter(d => d.id !== id))

    try {
      const { error } = await supabase
        .from('project_content_type_variations')
        .delete()
        .eq('id', id)

      if (error) throw error

      toast({
        title: "Success",
        description: "Variation deleted",
      })
    } catch (error: any) {
      console.error('Failed to delete:', error)
      // Revert
      await fetchDefaults()
      toast({
        title: "Error",
        description: "Failed to delete variation",
        variant: "destructive",
      })
    }
  }, [defaults, supabase, fetchDefaults])

  // Handle drag end
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event

    if (active.id !== over?.id) {
      const oldIndex = defaults.findIndex(item => item.id === active.id)
      const newIndex = defaults.findIndex(item => item.id === over?.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(defaults, oldIndex, newIndex)
        
        // Optimistic update
        setDefaults(reordered.map((item, index) => ({ ...item, position: index + 1 })))

        // Update positions
        try {
          const updates = reordered.map((item, index) => ({
            id: item.id,
            position: index + 1
          }))

          // Batch update
          for (const update of updates) {
            const { error } = await supabase
              .from('project_content_type_variations')
              .update({ position: update.position })
              .eq('id', update.id)

            if (error) throw error
          }

          toast({
            title: "Success",
            description: "Order updated",
          })
        } catch (error: any) {
          console.error('Failed to reorder:', error)
          await fetchDefaults()
          toast({
            title: "Error",
            description: "Failed to update order",
            variant: "destructive",
          })
        }
      }
    }
  }, [defaults, supabase, fetchDefaults])

  // Load data when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchContentTypes()
      fetchProjectLanguages()
      fetchDefaults()
    }
  }, [isOpen, fetchContentTypes, fetchProjectLanguages, fetchDefaults])

  // Fetch channels when content type changes
  useEffect(() => {
    if (selectedContentTypeId) {
      fetchChannels(selectedContentTypeId)
      fetchSelectedCombinations(selectedContentTypeId)
      // Load available languages and channels to add
      fetchAvailableLanguagesToAdd(selectedContentTypeId)
      fetchAvailableChannelsToAdd(selectedContentTypeId)
    } else {
      setAvailableChannels([])
      setSelectedCombinations(new Set())
      setAvailableLanguagesToAdd([])
      setAvailableChannelsToAdd([])
    }
  }, [selectedContentTypeId, fetchChannels, fetchSelectedCombinations, fetchAvailableLanguagesToAdd, fetchAvailableChannelsToAdd])

  // Load setup data for new content type
  const loadSetupData = useCallback(async (contentTypeId: number) => {
    setSetupLoading(true)
    try {
      // Load global channels for this content type
      const { data: globalChannels, error: globalError } = await supabase
        .from('content_types_channels')
        .select(`
          channel_id,
          position,
          channels!inner(id, name)
        `)
        .eq('content_type_id', contentTypeId)
        .order('position', { ascending: true, nullsFirst: false })

      if (globalError) throw globalError

      const global = (globalChannels || []).map((ctc: any) => ({
        id: ctc.channels.id,
        name: ctc.channels.name,
        position: ctc.position
      }))
      .sort((a, b) => {
        const posA = a.position ?? 999
        const posB = b.position ?? 999
        if (posA !== posB) return posA - posB
        return a.name.localeCompare(b.name)
      })
      setSetupGlobalChannels(global)

      // Load existing allowed channels
      const { data: allowedChannels, error: allowedError } = await supabase
        .from('project_content_types_channels')
        .select(`
          channel_id,
          position,
          channels!inner(id, name)
        `)
        .eq('project_id', projectId)
        .eq('content_type_id', contentTypeId)
        .order('position', { ascending: true, nullsFirst: false })

      if (allowedError) throw allowedError

      const allowed = (allowedChannels || []).map((pctc: any) => ({
        id: pctc.channels.id,
        name: pctc.channels.name,
        position: pctc.position
      }))
      .sort((a, b) => {
        const posA = a.position ?? 999
        const posB = b.position ?? 999
        if (posA !== posB) return posA - posB
        return a.name.localeCompare(b.name)
      })
      setSetupAllowedChannels(allowed)
      
      // Pre-select existing allowed channels
      setSetupSelectedChannels(new Set(allowed.map(ch => ch.id)))

      // Load project languages
      const { data: projectLangs, error: langsError } = await supabase
        .from('project_languages')
        .select(`
          language_id,
          is_primary,
          languages!inner(id, code, long_name)
        `)
        .eq('project_id', projectId)
        .is('is_deleted', false)

      if (langsError) throw langsError

      const langs = (projectLangs || []).map((pl: any) => ({
        language_id: pl.language_id,
        code: pl.languages.code,
        long_name: pl.languages.long_name,
        is_primary: pl.is_primary
      }))
      .sort((a, b) => {
        if (a.is_primary !== b.is_primary) return b.is_primary ? 1 : -1
        return a.long_name.localeCompare(b.long_name)
      })
      setSetupProjectLanguages(langs)
    } catch (error: any) {
      console.error('Failed to load setup data:', error)
      toast({
        title: "Error",
        description: "Failed to load setup data",
        variant: "destructive",
      })
    } finally {
      setSetupLoading(false)
    }
  }, [projectId, supabase])

  // Handle setup completion
  const handleSetupComplete = useCallback(async () => {
    if (!setupContentType) return

    try {
      setSetupLoading(true)

      // Step 2: Insert allowed channels (only those not already in project)
      const channelsToAdd = Array.from(setupSelectedChannels).filter(
        channelId => !setupAllowedChannels.find(ch => ch.id === channelId)
      )

      if (channelsToAdd.length > 0) {
        const channelInserts = channelsToAdd.map(channelId => ({
          project_id: projectId,
          content_type_id: setupContentType.id,
          channel_id: channelId
        }))

        const { error: channelsError } = await supabase
          .from('project_content_types_channels')
          .insert(channelInserts)
          .select()

        // Handle conflicts gracefully
        if (channelsError && channelsError.code !== '23505') {
          throw channelsError
        }
      }

      // Step 4: Create default variations (channel × language pairs)
      const variationInserts = Array.from(setupSelectedChannels).flatMap(channelId =>
        Array.from(setupSelectedLanguages).map(languageId => ({
          project_id: projectId,
          content_type_id: setupContentType.id,
          channel_id: channelId,
          language_id: languageId,
          is_active: true
        }))
      )

      if (variationInserts.length > 0) {
        const { error: variationsError } = await supabase
          .from('project_content_type_variations')
          .upsert(variationInserts, {
            onConflict: 'project_id,content_type_id,channel_id,language_id',
            ignoreDuplicates: false
          })

        if (variationsError) throw variationsError
      }

      // Step 5: Set SEO requirement
      const { error: seoError } = await supabase
        .from('project_content_type_settings')
        .upsert({
          project_id: projectId,
          content_type_id: setupContentType.id,
          seo_required: setupSEORequired
        }, {
          onConflict: 'project_id,content_type_id'
        })

      if (seoError) throw seoError

      // Refresh all data
      await fetchContentTypes()
      await fetchChannels(setupContentType.id)
      await fetchSelectedCombinations(setupContentType.id)
      await fetchDefaults()

      // Close setup and select the content type
      setSetupContentType(null)
      setSelectedContentTypeId(setupContentType.id)
      setSetupSelectedChannels(new Set())
      setSetupSelectedLanguages(new Set())
      setSetupSEORequired(false)

      toast({
        title: "Success",
        description: `${setupContentType.title} has been configured for this project`,
      })
    } catch (error: any) {
      console.error('Failed to complete setup:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to complete setup",
        variant: "destructive",
      })
    } finally {
      setSetupLoading(false)
    }
  }, [setupContentType, projectId, setupSelectedChannels, setupSelectedLanguages, setupSEORequired, setupAllowedChannels, supabase, fetchContentTypes, fetchChannels, fetchSelectedCombinations, fetchDefaults])

  // Refetch content types when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchContentTypes()
      // Clear setup state when modal opens
      setSetupContentType(null)
    }
  }, [isOpen, fetchContentTypes])

  // Load setup data when setup dialog opens
  useEffect(() => {
    if (setupContentType) {
      loadSetupData(setupContentType.id)
    }
  }, [setupContentType, loadSetupData])

  // Fetch available channels when add channel dialog opens
  useEffect(() => {
    if (isAddChannelOpen && selectedContentTypeId) {
      fetchAvailableChannelsToAdd(selectedContentTypeId)
    }
  }, [isAddChannelOpen, selectedContentTypeId, fetchAvailableChannelsToAdd])

  // Fetch available languages when add language dialog opens
  useEffect(() => {
    if (isAddLanguageOpen && selectedContentTypeId) {
      fetchAvailableLanguagesToAdd(selectedContentTypeId)
    }
  }, [isAddLanguageOpen, selectedContentTypeId, fetchAvailableLanguagesToAdd])

  // Check if a combination is selected
  const isCombinationSelected = useCallback((channelId: number, languageId: number) => {
    const key = `${channelId}:${languageId}`
    return selectedCombinations.has(key)
  }, [selectedCombinations])

  // Toggle a combination
  const handleToggleCombination = useCallback(async (channelId: number, languageId: number) => {
    if (!selectedContentTypeId) return

    const key = `${channelId}:${languageId}`
    const isSelected = selectedCombinations.has(key)

    try {
      if (isSelected) {
        // Remove - delete from project_content_type_variations
        const { error } = await supabase
          .from('project_content_type_variations')
          .delete()
          .eq('project_id', projectId)
          .eq('content_type_id', selectedContentTypeId)
          .eq('channel_id', channelId)
          .eq('language_id', languageId)

        if (error) throw error

        // Optimistic update
        setSelectedCombinations(prev => {
          const newSet = new Set(prev)
          newSet.delete(key)
          return newSet
        })

        // Also update defaults list
        setDefaults(prev => prev.filter(d => 
          !(d.content_type_id === selectedContentTypeId && 
            d.channel_id === channelId && 
            d.language_id === languageId)
        ))

        toast({
          title: "Success",
          description: "Variation removed",
        })
      } else {
        // Add - insert into project_content_type_variations
        const maxPosition = defaults
          .filter(d => d.content_type_id === selectedContentTypeId)
          .reduce((max, d) => Math.max(max, d.position || 0), 0)

        const { error } = await supabase
          .from('project_content_type_variations')
          .insert({
            project_id: projectId,
            content_type_id: selectedContentTypeId,
            channel_id: channelId,
            language_id: languageId,
            is_active: true,
            position: maxPosition + 1
          })

        if (error) throw error

        // Optimistic update
        setSelectedCombinations(prev => {
          const newSet = new Set(prev)
          newSet.add(key)
          return newSet
        })

        // Refresh defaults to get full data
        await fetchDefaults()

        toast({
          title: "Success",
          description: "Variation added",
        })
      }
    } catch (error: any) {
      console.error('Failed to toggle combination:', error)
      toast({
        title: "Error",
        description: "Failed to update variation",
        variant: "destructive",
      })
      // Revert by refetching
      await fetchSelectedCombinations(selectedContentTypeId)
      await fetchDefaults()
    }
  }, [selectedContentTypeId, selectedCombinations, projectId, defaults, supabase, fetchDefaults, fetchSelectedCombinations])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Default content variations</DialogTitle>
          <DialogDescription>
            These combinations will be created automatically for new deliverables in this project. You can still edit per task.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Content Type Pills + Add Dropdown */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Content Type</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Content Type Pills */}
              {contentTypes.map(ct => (
                <button
                  key={ct.id}
                  onClick={() => {
                    setSelectedContentTypeId(ct.id)
                    // Clear any setup state when selecting existing content type
                    setSetupContentType(null)
                  }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    selectedContentTypeId === ct.id
                      ? 'bg-black text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {ct.title}
                </button>
              ))}
              
              {/* Separator */}
              {contentTypes.length > 0 && (
                <span className="text-gray-400">|</span>
              )}
              
              {/* Add Content Type Dropdown */}
              <DropdownMenu open={isAddContentTypeOpen} onOpenChange={setIsAddContentTypeOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="w-4 h-4 mr-1" />
                    Add content type
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64">
                  <div className="p-2">
                    <Input
                      placeholder="Search content types..."
                      value={contentTypeSearchQuery}
                      onChange={(e) => setContentTypeSearchQuery(e.target.value)}
                      className="mb-2"
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {allContentTypes
                      .filter(ct => 
                        ct.title.toLowerCase().includes(contentTypeSearchQuery.toLowerCase())
                      )
                      .map(ct => (
                        <DropdownMenuItem
                          key={ct.id}
                          onClick={() => {
                            if (projectContentTypes.has(ct.id)) {
                              // Already in project - just select it
                              setSelectedContentTypeId(ct.id)
                            } else {
                              // New content type - open setup wizard
                              setSetupContentType(ct)
                            }
                            setIsAddContentTypeOpen(false)
                            setContentTypeSearchQuery('')
                          }}
                          className="flex items-center justify-between"
                        >
                          <span>{ct.title}</span>
                          {projectContentTypes.has(ct.id) && (
                            <Badge variant="outline" className="text-xs ml-2">Selected</Badge>
                          )}
                        </DropdownMenuItem>
                      ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Matrix Grid for selecting combinations */}
          {selectedContentTypeId && availableChannels.length > 0 && projectLanguages.length > 0 && (
            <div className="border rounded-lg p-4">
              <div className="mb-4">
                <h3 className="font-medium text-sm mb-2">Select combinations:</h3>
                <p className="text-xs text-gray-600">
                  Click on cells to toggle combinations. Selected combinations will be created automatically for new deliverables.
                </p>
              </div>
              
              {/* Matrix Grid */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="border p-2 text-xs font-medium text-left bg-gray-50 sticky left-0 z-10">Language / Channel</th>
                      {/* Channel columns */}
                      {availableChannels.map(channel => (
                        <th key={channel.channel_id} className="border p-2 text-xs font-medium bg-gray-50 min-w-[100px]">
                          <div className="flex items-center justify-center gap-1">
                            <span>{channel.name}</span>
                            <button
                              onClick={() => {
                                setChannelToRemove({ id: channel.channel_id, name: channel.name })
                                setShowRemoveChannelConfirm(true)
                              }}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded p-0.5 transition-colors"
                              title="Remove channel"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                          </div>
                        </th>
                      ))}
                      {/* Add channel column - always show */}
                      <th className="border p-2 text-xs font-medium bg-gray-50 min-w-[60px]">
                        <button
                          onClick={() => setIsAddChannelOpen(true)}
                          className="w-full h-8 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Add channel"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectLanguages
                      .filter(language => {
                        // Only show languages that have at least one variation (combination with a channel)
                        return availableChannels.some(channel => 
                          isCombinationSelected(channel.channel_id, language.language_id)
                        )
                      })
                      .map(language => (
                      <tr key={language.language_id}>
                        <td className="border p-2 text-xs font-medium bg-gray-50 sticky left-0 z-10">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1">
                              <span>{language.long_name} ({language.code})</span>
                              {language.is_primary && <Badge className="text-xs">Primary</Badge>}
                            </div>
                            <button
                              onClick={() => {
                                setLanguageToRemove({ 
                                  id: language.language_id, 
                                  name: language.long_name,
                                  code: language.code
                                })
                                setShowRemoveLanguageConfirm(true)
                              }}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded p-0.5 transition-colors flex-shrink-0"
                              title="Remove language"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        {/* Channel cells */}
                        {availableChannels.map(channel => (
                          <td key={channel.channel_id} className="border p-2 text-center">
                            <button
                              onClick={() => handleToggleCombination(channel.channel_id, language.language_id)}
                              className={`w-full h-8 rounded border-2 transition-colors ${
                                isCombinationSelected(channel.channel_id, language.language_id)
                                  ? 'bg-blue-600 border-blue-700 text-white'
                                  : 'bg-white border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              {isCombinationSelected(channel.channel_id, language.language_id) ? '✓' : ''}
                            </button>
                          </td>
                        ))}
                        {/* Add channel column cell */}
                        <td className="border p-2"></td>
                      </tr>
                    ))}
                    {/* Add language row - always show */}
                    <tr>
                      <td className="border p-2 text-xs font-medium bg-gray-50 sticky left-0 z-10">
                        <button
                          onClick={() => setIsAddLanguageOpen(true)}
                          className="w-full h-8 flex items-center justify-center gap-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Add language"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </td>
                      {/* Empty cells for channels */}
                      {availableChannels.map(() => (
                        <td key={Math.random()} className="border p-2"></td>
                      ))}
                      <td className="border p-2"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selectedContentTypeId && (availableChannels.length === 0 || projectLanguages.length === 0) && (
            <div className="border rounded-lg p-4 text-center text-gray-500">
              {availableChannels.length === 0 && projectLanguages.length === 0 
                ? 'No channels or languages configured for this project'
                : availableChannels.length === 0
                ? 'No channels configured for this content type'
                : 'No languages configured for this project'}
            </div>
          )}

          {!selectedContentTypeId && (
            <div className="border rounded-lg p-4 text-center text-gray-500">
              Select a content type to manage default variations
            </div>
          )}

          {/* Add Language Drawer/Dialog */}
          <Dialog open={isAddLanguageOpen} onOpenChange={(open) => {
            setIsAddLanguageOpen(open)
            if (!open) {
              setLanguageSearchQuery('')
              setLanguageToAdd(null)
            }
          }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Language</DialogTitle>
                <DialogDescription>
                  Select a language from the global list
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder="Search languages..."
                  value={languageSearchQuery}
                  onChange={(e) => setLanguageSearchQuery(e.target.value)}
                />
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {availableLanguagesToAdd
                    .filter((lang: any) => 
                      lang.long_name.toLowerCase().includes(languageSearchQuery.toLowerCase()) ||
                      lang.code.toLowerCase().includes(languageSearchQuery.toLowerCase())
                    )
                    .map((language: any) => (
                      <button
                        key={language.language_id}
                        onClick={() => {
                          setLanguageToAdd(language)
                          setShowLanguageConfirm(true)
                        }}
                        className="w-full text-left p-3 border rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-between"
                      >
                        <div>
                          <div className="font-medium">
                            {language.long_name} ({language.code})
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {language.is_in_project && (
                            <Badge variant="outline" className="text-xs">Selected</Badge>
                          )}
                          <Plus className="w-4 h-4 text-gray-400" />
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Language Confirmation Dialog */}
          <Dialog open={showLanguageConfirm} onOpenChange={setShowLanguageConfirm}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm Add Language</DialogTitle>
                <DialogDescription>
                  {languageToAdd && (
                    !availableLanguagesToAdd.find((l: any) => 
                      l.language_id === languageToAdd.language_id && l.is_in_project
                    ) ? (
                      `Add ${languageToAdd.long_name} to this project and include it in defaults?`
                    ) : (
                      `Include ${languageToAdd.long_name} in defaults for all selected channels?`
                    )
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => {
                  setShowLanguageConfirm(false)
                  setLanguageToAdd(null)
                }}>
                  Cancel
                </Button>
                <Button onClick={async () => {
                  await handleConfirmAddLanguage()
                  setShowLanguageConfirm(false)
                  setIsAddLanguageOpen(false)
                }}>
                  Confirm
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Add Channel Drawer/Dialog */}
          <Dialog open={isAddChannelOpen} onOpenChange={(open) => {
            setIsAddChannelOpen(open)
            if (!open) {
              setChannelSearchQuery('')
              setChannelToAdd(null)
            }
          }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Channel</DialogTitle>
                <DialogDescription>
                  Select a channel from the global list
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder="Search channels..."
                  value={channelSearchQuery}
                  onChange={(e) => setChannelSearchQuery(e.target.value)}
                />
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {availableChannelsToAdd
                    .filter((ch: any) => 
                      ch.name.toLowerCase().includes(channelSearchQuery.toLowerCase())
                    )
                    .map((channel: any) => (
                      <button
                        key={channel.channel_id}
                        onClick={() => {
                          setChannelToAdd(channel)
                          setShowChannelConfirm(true)
                        }}
                        className="w-full text-left p-3 border rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-between"
                      >
                        <div className="font-medium">{channel.name}</div>
                        <div className="flex items-center gap-2">
                          {channel.is_in_project && (
                            <Badge variant="outline" className="text-xs">Selected</Badge>
                          )}
                          <Plus className="w-4 h-4 text-gray-400" />
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Channel Confirmation Dialog */}
          <Dialog open={showChannelConfirm} onOpenChange={setShowChannelConfirm}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm Add Channel</DialogTitle>
                <DialogDescription>
                  {channelToAdd && selectedContentTypeId && (
                    !availableChannelsToAdd.find((ch: any) => 
                      ch.channel_id === channelToAdd.channel_id && ch.is_in_project
                    ) ? (
                      `Add ${channelToAdd.name} to allowed channels for ${contentTypes.find(ct => ct.id === selectedContentTypeId)?.title || 'this content type'} in this project and include it in defaults?`
                    ) : (
                      `Include ${channelToAdd.name} in defaults for all selected languages?`
                    )
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => {
                  setShowChannelConfirm(false)
                  setChannelToAdd(null)
                }}>
                  Cancel
                </Button>
                <Button onClick={async () => {
                  await handleConfirmAddChannel()
                  setShowChannelConfirm(false)
                  setIsAddChannelOpen(false)
                }}>
                  Confirm
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Setup Wizard for New Content Type */}
          <Dialog open={!!setupContentType && setupContentType && !projectContentTypes.has(setupContentType.id)} onOpenChange={(open) => {
            if (!open) {
              setSetupContentType(null)
              setSetupSelectedChannels(new Set())
              setSetupSelectedLanguages(new Set())
              setSetupSEORequired(false)
            }
          }}>
            <DialogContent className="max-w-2xl h-[85vh] flex flex-col">
              <DialogHeader className="flex-shrink-0">
                <DialogTitle>Setup {setupContentType?.title}</DialogTitle>
                <DialogDescription>
                  Configure allowed channels, default languages, and SEO settings for this content type
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto pr-2">
                {setupLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    <span className="text-sm text-gray-500">Loading...</span>
                  </div>
                ) : (
                  <div className="space-y-6">
                  {/* Step 2: Allowed Channels */}
                  <div>
                    <Label className="text-sm font-medium mb-3 block">
                      Step 2: Choose Allowed Channels
                    </Label>
                    <p className="text-xs text-gray-600 mb-3">
                      Select channels that are allowed for {setupContentType?.title} in this project
                    </p>
                    <div className="border rounded-lg p-4 space-y-2 max-h-60 overflow-y-auto">
                      {setupGlobalChannels.length === 0 ? (
                        <div className="text-center py-4 text-gray-500 text-sm">
                          No channels available for this content type
                        </div>
                      ) : (
                        setupGlobalChannels.map(channel => {
                          const isSelected = setupSelectedChannels.has(channel.id)
                          const isAlreadyAllowed = setupAllowedChannels.find(ch => ch.id === channel.id)
                          return (
                            <div key={channel.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`channel-${channel.id}`}
                                checked={isSelected}
                                onCheckedChange={(checked) => {
                                  const newSet = new Set(setupSelectedChannels)
                                  if (checked) {
                                    newSet.add(channel.id)
                                  } else {
                                    newSet.delete(channel.id)
                                  }
                                  setSetupSelectedChannels(newSet)
                                }}
                              />
                              <Label
                                htmlFor={`channel-${channel.id}`}
                                className="flex-1 cursor-pointer flex items-center justify-between"
                              >
                                <span>{channel.name}</span>
                                {isAlreadyAllowed && (
                                  <Badge variant="outline" className="text-xs">Already allowed</Badge>
                                )}
                              </Label>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  {/* Step 3: Default Languages */}
                  <div>
                    <Label className="text-sm font-medium mb-3 block">
                      Step 3: Choose Default Languages
                    </Label>
                    <p className="text-xs text-gray-600 mb-3">
                      Select languages that will be used by default for {setupContentType?.title}
                    </p>
                    <div className="border rounded-lg p-4 space-y-2 max-h-60 overflow-y-auto">
                      {setupProjectLanguages.length === 0 ? (
                        <div className="text-center py-4 text-gray-500 text-sm">
                          No languages configured for this project. Add languages in project settings first.
                        </div>
                      ) : (
                        setupProjectLanguages.map(language => {
                          const isSelected = setupSelectedLanguages.has(language.language_id)
                          return (
                            <div key={language.language_id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`lang-${language.language_id}`}
                                checked={isSelected}
                                onCheckedChange={(checked) => {
                                  const newSet = new Set(setupSelectedLanguages)
                                  if (checked) {
                                    newSet.add(language.language_id)
                                  } else {
                                    newSet.delete(language.language_id)
                                  }
                                  setSetupSelectedLanguages(newSet)
                                }}
                              />
                              <Label
                                htmlFor={`lang-${language.language_id}`}
                                className="flex-1 cursor-pointer flex items-center justify-between"
                              >
                                <span>{language.long_name} ({language.code})</span>
                                {language.is_primary && (
                                  <Badge className="text-xs bg-blue-100 text-blue-800">Primary</Badge>
                                )}
                              </Label>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  {/* Step 5: SEO Required */}
                  <div>
                    <Label className="text-sm font-medium mb-3 block">
                      Step 5: SEO Requirement
                    </Label>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="seo-required"
                        checked={setupSEORequired}
                        onCheckedChange={(checked) => setSetupSEORequired(checked === true)}
                      />
                      <Label htmlFor="seo-required" className="cursor-pointer">
                        Require SEO keywords for {setupContentType?.title} in this project
                      </Label>
                    </div>
                    <p className="text-xs text-gray-600 mt-2">
                      When enabled, users will be required to provide SEO keywords for deliverables of this content type
                    </p>
                  </div>

                  {/* Summary */}
                  <div className="border-t pt-4">
                    <div className="text-sm font-medium mb-2">Summary</div>
                    <div className="text-xs text-gray-600 space-y-1">
                      <div>
                        <strong>{setupSelectedChannels.size}</strong> channel{setupSelectedChannels.size !== 1 ? 's' : ''} selected
                      </div>
                      <div>
                        <strong>{setupSelectedLanguages.size}</strong> language{setupSelectedLanguages.size !== 1 ? 's' : ''} selected
                      </div>
                      <div>
                        <strong>{setupSelectedChannels.size * setupSelectedLanguages.size}</strong> default variation{setupSelectedChannels.size * setupSelectedLanguages.size !== 1 ? 's' : ''} will be created
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSetupContentType(null)
                        setSetupSelectedChannels(new Set())
                        setSetupSelectedLanguages(new Set())
                        setSetupSEORequired(false)
                      }}
                      disabled={setupLoading}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSetupComplete}
                      disabled={setupLoading || setupSelectedChannels.size === 0 || setupSelectedLanguages.size === 0}
                    >
                      {setupLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Setting up...
                        </>
                      ) : (
                        'Complete Setup'
                      )}
                    </Button>
                  </div>
                </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Remove Channel Confirmation Dialog */}
          <Dialog open={showRemoveChannelConfirm} onOpenChange={setShowRemoveChannelConfirm}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Remove Channel</DialogTitle>
                <DialogDescription>
                  Are you sure you want to remove this channel from the allowed channels and delete all related variations?
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <p className="text-sm text-gray-600">
                  This will remove <strong>{channelToRemove?.name}</strong> from allowed channels for this content type and delete all default variations that include this channel.
                </p>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRemoveChannelConfirm(false)
                    setChannelToRemove(null)
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmRemoveChannel}
                >
                  Remove Channel
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Remove Language from Content Type Confirmation Dialog */}
          <Dialog open={showRemoveLanguageConfirm} onOpenChange={(open) => {
            if (!open) {
              setShowRemoveLanguageConfirm(false)
              setLanguageToRemove(null)
            }
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Remove Language from Content Type</DialogTitle>
                <DialogDescription>
                  {languageToRemove && selectedContentTypeId && (
                    <>Stop creating <strong>{languageToRemove.code}</strong> variations for <strong>{contentTypes.find(ct => ct.id === selectedContentTypeId)?.title || 'this content type'}</strong> content?</>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <p className="text-sm text-gray-600">
                  This will remove all default variations for <strong>{languageToRemove?.code}</strong> from <strong>{contentTypes.find(ct => ct.id === selectedContentTypeId)?.title || 'this content type'}</strong>.
                </p>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRemoveLanguageConfirm(false)
                    setLanguageToRemove(null)
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmRemoveLanguage}
                >
                  Remove from Content Type
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Remove Language from Project Confirmation Dialog (Secondary CTA) */}
          <Dialog open={showRemoveLanguageFromProjectConfirm} onOpenChange={(open) => {
            if (!open) {
              setShowRemoveLanguageFromProjectConfirm(false)
              setLanguageRemovedFromContentType(null)
            }
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Remove Language from Project</DialogTitle>
                <DialogDescription>
                  {languageRemovedFromContentType && (
                    <>Removing <strong>{languageRemovedFromContentType.code}</strong> from this project will also delete it from all default variations. Continue?</>
                  )}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRemoveLanguageFromProjectConfirm(false)
                    setLanguageRemovedFromContentType(null)
                  }}
                >
                  Keep in Project
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmRemoveLanguageFromProject}
                >
                  Remove from Project
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Results List */}
          <div>
            <div className="px-6 py-3 bg-white border-b border-gray-200">
              <h3 className="font-medium text-sm">Current Defaults</h3>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span className="text-sm text-gray-500">Loading...</span>
              </div>
            ) : defaults.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No default variations configured
              </div>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="border-collapse text-sm md:text-base w-full" style={{ tableLayout: 'fixed', background: 'transparent' }}>
                  <thead className="sticky top-0 z-20 bg-white border-b shadow-sm">
                    <tr>
                      <th className="w-12 px-3 py-2 text-left font-medium text-gray-500 border-r border-gray-200"></th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 border-r border-gray-200">Content Type</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 border-r border-gray-200">Channel</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 border-r border-gray-200">Language</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 border-r border-gray-200">Status</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={defaults.map(d => d.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {defaults.map((variation) => (
                          <SortableRow
                            key={variation.id}
                            variation={variation}
                            onToggleActive={handleToggleActive}
                            onDelete={handleDelete}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface DefaultVariationsProps {
  projectId?: number
  contentTypeId?: number
}

export function DefaultVariations({ projectId, contentTypeId }: DefaultVariationsProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (!projectId) {
    return null
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="w-full"
      >
        <Plus className="w-4 h-4 mr-2" />
        Manage Default Variations
      </Button>
      <DefaultVariationsModal
        projectId={projectId}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  )
}