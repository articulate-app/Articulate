"use client"

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { toast } from '../ui/use-toast'
import { Trash2, Search, Loader2 } from 'lucide-react'
import { AddComponentButton } from '../task/AddComponentButton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog'
import {
  type ProjectComponent,
  createProjectComponent,
  addGlobalComponentToBriefing,
  loadProjectComponentIndex,
  updateProjectComponentInProject,
} from '../../lib/services/project-briefings'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { ChannelRequirementsSection } from './channel-requirements-section'

interface LibraryTabProps {
  projectId: number
  selectedBriefingTypeId: number | null
  onRefresh: () => void
}

const TAB_CACHE_QUERY_OPTIONS = {
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnMount: false as const,
  refetchOnWindowFocus: false as const,
  refetchOnReconnect: false as const,
}

export function LibraryTab({
  projectId,
  selectedBriefingTypeId,
  onRefresh,
}: LibraryTabProps) {
  const queryClient = useQueryClient()
  const supabase = createClientComponentClient()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const [showInlineNewComponent, setShowInlineNewComponent] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [componentToDelete, setComponentToDelete] = useState<
    | { kind: 'project'; id: number; title: string }
    | { kind: 'global'; id: number; title: string }
    | null
  >(null)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const selectedKey = selectedKeys.length === 1 ? selectedKeys[0] : null
  const isMultiSelect = selectedKeys.length > 1

  const setSelectedKeyAndUrl = useCallback(
    (nextKey: string | null) => {
      setSelectedKeys(nextKey ? [nextKey] : [])
      const params = new URLSearchParams(searchParams.toString())
      if (nextKey) {
        params.set('component', nextKey)
      } else {
        params.delete('component')
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [rules, setRules] = useState('')

  // Right pane edit state (selected component)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [isSavingMeta, setIsSavingMeta] = useState(false)

  // Add-to-briefing modal state
  const [isAddUsageDialogOpen, setIsAddUsageDialogOpen] = useState(false)
  const [addUsageContentTypeIds, setAddUsageContentTypeIds] = useState<string[]>([])
  const [addUsageChannelIds, setAddUsageChannelIds] = useState<string[]>([])
  const [addUsageBriefingTypeIds, setAddUsageBriefingTypeIds] = useState<string[]>([])
  const [isAddingUsage, setIsAddingUsage] = useState(false)

  // Fetch union list (project + global) for the left pane
  const { data: indexItems, isLoading, error } = useQuery({
    queryKey: ['projBriefings:library:index', projectId],
    queryFn: async () => {
      const { data, error } = await loadProjectComponentIndex(projectId)
      if (error) throw error
      return data || []
    },
    ...TAB_CACHE_QUERY_OPTIONS,
    placeholderData: (previousData) => previousData,
  })

  const filteredItems = useMemo(() => {
    if (!indexItems) return []

    const bySearch = (item: any) => {
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase()
      const inTitle = item.title?.toLowerCase().includes(query)
      const inDesc = item.description?.toLowerCase().includes(query)
      const inUsage = Array.isArray(item.usage_labels) && item.usage_labels.some((l: string) => l.toLowerCase().includes(query))
      return inTitle || inDesc || inUsage
    }

    return indexItems.filter((item: any) => bySearch(item))
  }, [indexItems, searchQuery])

  const selectedItem = useMemo(() => {
    if (!indexItems || !selectedKey) return null
    return indexItems.find((i: any) => i.key === selectedKey) || null
  }, [indexItems, selectedKey])

  const selectedProjectComponentId = selectedItem?.kind === 'project' ? selectedItem.component_id : null
  const selectedGlobalComponentId = selectedItem?.kind === 'global' ? selectedItem.component_id : null
  // For system components we only show/edit custom (override) title/description,
  // so we don't fetch system fallback fields here.

  const {
    data: globalTemplateUsage,
    isLoading: isGlobalTemplateUsageLoading,
    error: globalTemplateUsageError,
  } = useQuery({
    queryKey: ['projBriefings:library:globalUsage:templates', projectId, selectedGlobalComponentId],
    // Usage sections removed from the UI; keep query disabled to avoid unused fetches.
    enabled: false,
    queryFn: async () => {
      if (!selectedGlobalComponentId) return []

      const [rowsRes, btRes] = await Promise.all([
        supabase
          .from('v_project_briefing_types_components_resolved')
          .select('briefing_type_id, position')
          .eq('project_id', projectId)
          .eq('is_project_component', false)
          .eq('component_id', selectedGlobalComponentId),
        supabase.from('v_project_briefing_types').select('briefing_type_id, display_title').eq('project_id', projectId),
      ])
      if (rowsRes.error) throw rowsRes.error
      if (btRes.error) throw btRes.error

      const titleById = new Map<number, string>(
        ((btRes.data || []) as any[]).map((bt: any) => [bt.briefing_type_id, bt.display_title])
      )

      return (rowsRes.data || []).map((row: any) => ({
        briefing_type_id: row.briefing_type_id,
        briefing_type_title: titleById.get(row.briefing_type_id) ?? `Briefing ${row.briefing_type_id}`,
        position: row.position ?? null,
      }))
    },
    ...TAB_CACHE_QUERY_OPTIONS,
    placeholderData: (previousData) => previousData,
  })

  const {
    data: globalCtUsage,
    isLoading: isGlobalCtUsageLoading,
    error: globalCtUsageError,
  } = useQuery({
    queryKey: ['projBriefings:library:globalUsage:ct', projectId, selectedGlobalComponentId],
    enabled: false,
    queryFn: async () => {
      if (!selectedGlobalComponentId) return []

      const ctRes = await supabase
        .from('project_ct_channel_briefing_components')
        .select('content_type_id, channel_id, briefing_type_id, position, custom_title, custom_description')
        .eq('project_id', projectId)
        .eq('briefing_component_id', selectedGlobalComponentId)
      if (ctRes.error) throw ctRes.error

      const rows = (ctRes.data || []) as Array<{
        content_type_id: number
        channel_id: number
        briefing_type_id: number | null
        position: number | null
        custom_title: string | null
        custom_description: string | null
      }>

      const needsDefaults = rows.some(r => r.briefing_type_id == null)
      const defaultByPair = new Map<string, number | null>()
      if (needsDefaults) {
        const ctIds = Array.from(new Set(rows.map(r => r.content_type_id)))
        const chIds = Array.from(new Set(rows.map(r => r.channel_id)))
        const defaultsRes = await supabase
          .from('project_ct_channel_briefings')
          .select('content_type_id, channel_id, briefing_type_id, is_default')
          .eq('project_id', projectId)
          .eq('is_default', true)
          .in('content_type_id', ctIds)
          .in('channel_id', chIds)
        if (defaultsRes.error) throw defaultsRes.error
        ;((defaultsRes.data || []) as any[]).forEach((row: any) => {
          defaultByPair.set(`${row.content_type_id}:${row.channel_id}`, row.briefing_type_id ?? null)
        })
      }

      const briefingTypesRes = await supabase
        .from('v_project_briefing_types')
        .select('briefing_type_id, display_title')
        .eq('project_id', projectId)
      if (briefingTypesRes.error) throw briefingTypesRes.error
      const briefingTitleById = new Map<number, string>(
        ((briefingTypesRes.data || []) as any[]).map((bt: any) => [bt.briefing_type_id, bt.display_title])
      )

      const contentTypeIds = Array.from(new Set(rows.map(r => r.content_type_id)))
      const channelIds = Array.from(new Set(rows.map(r => r.channel_id)))
      const [contentTypesRes, channelsRes] = await Promise.all([
        contentTypeIds.length
          ? supabase.from('content_types').select('id, title').in('id', contentTypeIds)
          : Promise.resolve({ data: [], error: null } as any),
        channelIds.length
          ? supabase.from('channels').select('id, name').in('id', channelIds)
          : Promise.resolve({ data: [], error: null } as any),
      ])
      if (contentTypesRes.error) throw contentTypesRes.error
      if (channelsRes.error) throw channelsRes.error

      const contentTypeTitleById = new Map<number, string>(
        ((contentTypesRes.data || []) as any[]).map((ct: any) => [ct.id, ct.title])
      )
      const channelTitleById = new Map<number, string>(
        ((channelsRes.data || []) as any[]).map((ch: any) => [ch.id, ch.name])
      )

      return rows
        .map((row) => {
          const bt =
            row.briefing_type_id ?? defaultByPair.get(`${row.content_type_id}:${row.channel_id}`) ?? null
          if (!bt) return null
          return {
            content_type_id: row.content_type_id,
            content_type_title: contentTypeTitleById.get(row.content_type_id) ?? `Content type ${row.content_type_id}`,
            channel_id: row.channel_id,
            channel_title: channelTitleById.get(row.channel_id) ?? `Channel ${row.channel_id}`,
            briefing_type_id: bt,
            briefing_type_title: briefingTitleById.get(bt) ?? `Briefing ${bt}`,
            position: row.position ?? null,
            custom_title: row.custom_title ?? '',
            custom_description: row.custom_description ?? '',
          }
        })
        .filter(Boolean)
    },
    ...TAB_CACHE_QUERY_OPTIONS,
    placeholderData: (previousData) => previousData,
  })

  // Keep right-pane form in sync when selection changes (project + global).
  useEffect(() => {
    if (!selectedItem) {
      setEditTitle('')
      setEditDescription('')
      return
    }

    setEditTitle(selectedItem.title)
    setEditDescription(selectedItem.description || '')
  }, [selectedItem])

  const resetForm = useCallback(() => {
    setTitle('')
    setDescription('')
    setRules('')
  }, [])

  const handleCreate = useCallback(async () => {
    if (!title.trim()) {
      toast({
        title: 'Error',
        description: 'Title is required',
        variant: 'destructive',
      })
      return
    }

    try {
      const { data, error } = await createProjectComponent(
        projectId,
        title.trim(),
        description.trim() || null,
        rules.trim() || null
      )
      if (error) throw error

      toast({
        title: 'Success',
        description: 'Component created',
      })

      setShowInlineNewComponent(false)
      resetForm()
      queryClient.invalidateQueries({ queryKey: ['projBriefings:library:index', projectId] })
      onRefresh()

      // Auto-expand newly created component
      if (data?.id) {
        setSelectedKeyAndUrl(`project:${data.id}`)
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create component',
        variant: 'destructive',
      })
    }
  }, [projectId, title, description, rules, resetForm, queryClient, onRefresh])

  const handleDelete = useCallback(async () => {
    if (!componentToDelete) return

    try {
      const { error } =
        componentToDelete.kind === 'project'
          ? await supabase.rpc('pbc_delete_project_component', {
              p_project_id: projectId,
              p_project_component_id: componentToDelete.id,
            })
          : await supabase.rpc('pbc_remove_global_component_from_project', {
              p_project_id: projectId,
              p_briefing_component_id: componentToDelete.id,
            })
      if (error) throw error

      toast({
        title: 'Success',
        description: 'Component removed from project',
      })

      setIsDeleteDialogOpen(false)
      const deletedKey = `${componentToDelete.kind}:${componentToDelete.id}`
      if (selectedKey === deletedKey) setSelectedKeyAndUrl(null)
      setComponentToDelete(null)
      queryClient.invalidateQueries({ queryKey: ['projBriefings:library:index', projectId] })
      // Refresh any open briefing pane lists (if open)
      queryClient.invalidateQueries({ queryKey: ['projBriefings:components', projectId] })
      queryClient.invalidateQueries({ queryKey: ['allowedGlobalComponents'] })
      queryClient.invalidateQueries({ queryKey: ['availableComponents', projectId] })
      onRefresh()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete component',
        variant: 'destructive',
      })
    }
  }, [componentToDelete, queryClient, projectId, supabase, onRefresh, selectedKey, setSelectedKeyAndUrl])

  const handleAddGlobalToCurrentTemplate = useCallback(
    async (briefingComponentId: number) => {
      if (!selectedBriefingTypeId) {
        toast({
          title: 'Error',
          description: 'Please select a briefing type first',
          variant: 'destructive',
        })
        return
      }

      try {
        const { error } = await addGlobalComponentToBriefing(
          projectId,
          selectedBriefingTypeId,
          briefingComponentId,
          null,
          null,
          null
        )
        if (error) throw error

        toast({ title: 'Success', description: 'Component added to briefing template' })

        queryClient.invalidateQueries({
          queryKey: ['projBriefings:components', projectId, selectedBriefingTypeId],
        })
        queryClient.invalidateQueries({ queryKey: ['projBriefings:library:index', projectId] })
        onRefresh()
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to add component to briefing',
          variant: 'destructive',
        })
      }
    },
    [projectId, selectedBriefingTypeId, queryClient, onRefresh]
  )

  const handleSaveMeta = useCallback(async () => {
    if (!selectedProjectComponentId || !selectedItem || selectedItem.kind !== 'project') return
    if (!editTitle.trim()) {
      toast({ title: 'Error', description: 'Title is required', variant: 'destructive' })
      return
    }

    setIsSavingMeta(true)
    try {
      const hasTitleChange = editTitle.trim() !== selectedItem.title
      const hasDescChange = (editDescription.trim() || '') !== (selectedItem.description || '')
      if (!hasTitleChange && !hasDescChange) {
        setIsSavingMeta(false)
        return
      }

      const { error } = await updateProjectComponentInProject(projectId, selectedProjectComponentId, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
      })
      if (error) throw error

      toast({ title: 'Success', description: 'Component updated' })

      queryClient.invalidateQueries({ queryKey: ['projBriefings:library:index', projectId] })
      onRefresh()
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to update component',
        variant: 'destructive',
      })
    } finally {
      setIsSavingMeta(false)
    }
  }, [selectedItem, selectedProjectComponentId, editTitle, editDescription, projectId, queryClient, onRefresh])

  const invalidateUsageEverywhere = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['projBriefings:library:globalUsage:templates', projectId] })
    queryClient.invalidateQueries({ queryKey: ['projBriefings:library:globalUsage:ct', projectId] })
    queryClient.invalidateQueries({ queryKey: ['projBriefings:library:channelPolicies', projectId] })
    queryClient.invalidateQueries({ queryKey: ['projBriefings:library:index', projectId] })
    // Also refresh any open briefings panes that reference these components
    queryClient.invalidateQueries({ queryKey: ['projBriefings:components'] })
    queryClient.invalidateQueries({ queryKey: ['availableComponents'] })
    queryClient.invalidateQueries({ queryKey: ['allowedGlobalComponents'] })
  }, [projectId, queryClient])

  const selectedBulkItems = useMemo(() => {
    if (!indexItems?.length) return []
    if (!selectedKeys.length) return []
    const selectedSet = new Set(selectedKeys)
    return (indexItems as any[]).filter((i: any) => selectedSet.has(i.key))
  }, [indexItems, selectedKeys])

  const bulkCounts = useMemo(() => {
    let project = 0
    let global = 0
    for (const item of selectedBulkItems) {
      if (item?.kind === 'project') project += 1
      else if (item?.kind === 'global') global += 1
    }
    return { total: selectedBulkItems.length, project, global }
  }, [selectedBulkItems])

  const handleBulkDelete = useCallback(async () => {
    if (!selectedBulkItems.length) return

    setIsBulkDeleting(true)
    try {
      const results = await Promise.allSettled(
        selectedBulkItems.map(async (item: any) => {
          if (item.kind === 'project') {
            const { error } = await supabase.rpc('pbc_delete_project_component', {
              p_project_id: projectId,
              p_project_component_id: item.component_id,
            })
            if (error) throw error
            return { key: item.key, kind: 'project' as const }
          }

          const { error } = await supabase.rpc('pbc_remove_global_component_from_project', {
            p_project_id: projectId,
            p_briefing_component_id: item.component_id,
          })
          if (error) throw error
          return { key: item.key, kind: 'global' as const }
        })
      )

      const succeeded = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.filter((r) => r.status === 'rejected') as Array<PromiseRejectedResult>

      invalidateUsageEverywhere()
      queryClient.invalidateQueries({ queryKey: ['projBriefings:components', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projBriefings:library:index', projectId] })
      queryClient.invalidateQueries({ queryKey: ['allowedGlobalComponents'] })
      queryClient.invalidateQueries({ queryKey: ['availableComponents', projectId] })
      onRefresh()

      setSelectedKeys([])
      setIsBulkDeleteDialogOpen(false)

      if (failed.length) {
        toast({
          title: 'Partially deleted',
          description:
            `${succeeded} removed from project, ${failed.length} failed.` +
            (failed[0]?.reason?.message ? ` First error: ${failed[0].reason.message}` : ''),
          variant: 'destructive',
        })
        return
      }

      toast({
        title: 'Success',
        description: `${succeeded} component${succeeded === 1 ? '' : 's'} removed from project`,
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to delete selected components',
        variant: 'destructive',
      })
    } finally {
      setIsBulkDeleting(false)
    }
  }, [
    selectedBulkItems,
    supabase,
    projectId,
    invalidateUsageEverywhere,
    queryClient,
    onRefresh,
    setSelectedKeys,
  ])

  // Stable param value so effects don't run on every searchParams reference change (avoids infinite RSC requests)
  const componentParam = searchParams.get('component')

  // Sync selection from URL (run only when the component param value actually changes)
  useEffect(() => {
    if (!componentParam) {
      if (selectedKeys.length) setSelectedKeys([])
      return
    }
    if (componentParam !== selectedKey) {
      setSelectedKeys([componentParam])
    }
  }, [componentParam, selectedKey, selectedKeys.length])

  // Ensure URL stays clean if selectedKey points to a missing item (e.g. after deletion).
  // Use stable deps (param + keys string) so we don't run on every indexItems reference change.
  const indexKeysStr = indexItems?.map((i: any) => i.key).join(',') ?? ''
  useEffect(() => {
    if (!componentParam) return
    if (!indexKeysStr) return // still loading
    const keysList = indexKeysStr.split(',')
    const exists = keysList.includes(componentParam)
    if (!exists) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('component')
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
      setSelectedKeys([])
    }
  }, [componentParam, indexKeysStr, pathname, router, searchParams])

  const toggleMultiSelectKey = useCallback((key: string) => {
    // when entering multi-select, clear the URL param to avoid mismatch
    const params = new URLSearchParams(searchParams.toString())
    params.delete('component')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })

    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return Array.from(next)
    })
  }, [pathname, router, searchParams])

  const handleSaveGlobalMeta = useCallback(async () => {
    if (!selectedGlobalComponentId || !selectedItem || selectedItem.kind !== 'global') return
    if (!editTitle.trim()) {
      toast({ title: 'Error', description: 'Title is required', variant: 'destructive' })
      return
    }

    // We store global "custom" title/description on CT×channel selections; update all existing rows.
    const rows = (globalCtUsage || []) as any[]
    if (!rows.length) {
      toast({
        title: 'Nothing to update',
        description: 'This component has no Channel/Content-Type selections yet. Add it to a briefing first.',
        variant: 'destructive',
      })
      return
    }

    if (rows.length > 25) {
      toast({
        title: 'Too many selections',
        description: `This component is used in ${rows.length} briefings. Please narrow usage before bulk-editing.`,
        variant: 'destructive',
      })
      return
    }

    setIsSavingMeta(true)
    try {
      const trimmedTitle = editTitle.trim()
      const trimmedDesc = editDescription.trim()

      const hasTitleChange = trimmedTitle !== (selectedItem.title || '')
      const hasDescChange = (trimmedDesc || '') !== (selectedItem.description || '')
      if (!hasTitleChange && !hasDescChange) return

      const results = await Promise.allSettled(
        rows.map((row: any) =>
          supabase.rpc('pcctbc_update', {
            p_project_id: projectId,
            p_content_type_id: row.content_type_id,
            p_channel_id: row.channel_id,
            p_briefing_type_id: row.briefing_type_id,
            p_component_id: selectedGlobalComponentId,
            p_is_project_component: false,
            p_custom_title: trimmedTitle || null,
            p_custom_description: trimmedDesc || null,
          })
        )
      )

      const rejected = results.filter(r => r.status === 'rejected') as Array<PromiseRejectedResult>
      if (rejected.length) throw rejected[0].reason

      toast({ title: 'Success', description: 'Component updated' })
      invalidateUsageEverywhere()
      queryClient.invalidateQueries({ queryKey: ['projBriefings:library:globalUsage:ct', projectId, selectedGlobalComponentId] })
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message || 'Failed to update component',
        variant: 'destructive',
      })
    } finally {
      setIsSavingMeta(false)
    }
  }, [
    editDescription,
    editTitle,
    globalCtUsage,
    invalidateUsageEverywhere,
    projectId,
    queryClient,
    selectedGlobalComponentId,
    selectedItem,
    supabase,
  ])

  const handleRemoveGlobalFromTemplate = useCallback(
    async (briefingTypeId: number) => {
      if (!selectedGlobalComponentId) return
      try {
        const { error } = await supabase.rpc('pbtc_remove', {
          p_project_id: projectId,
          p_briefing_type_id: briefingTypeId,
          p_component_id: selectedGlobalComponentId,
          p_is_project_component: false,
        })
        if (error) throw error
        toast({ title: 'Success', description: 'Removed from template' })
        invalidateUsageEverywhere()
        onRefresh()
      } catch (err: any) {
        toast({ title: 'Error', description: err.message || 'Failed to remove', variant: 'destructive' })
      }
    },
    [invalidateUsageEverywhere, onRefresh, projectId, selectedGlobalComponentId, supabase]
  )

  const handleRemoveGlobalFromCtChannel = useCallback(
    async (args: { contentTypeId: number; channelId: number; briefingTypeId: number }) => {
      if (!selectedGlobalComponentId) return
      try {
        const { error } = await supabase.rpc('pcctbc_remove', {
          p_project_id: projectId,
          p_content_type_id: args.contentTypeId,
          p_channel_id: args.channelId,
          p_briefing_type_id: args.briefingTypeId,
          p_component_id: selectedGlobalComponentId,
          p_is_project_component: false,
        })
        if (error) throw error

        toast({ title: 'Success', description: 'Removed from briefing' })
        invalidateUsageEverywhere()
        onRefresh()
      } catch (err: any) {
        toast({ title: 'Error', description: err.message || 'Failed to remove', variant: 'destructive' })
      }
    },
    [invalidateUsageEverywhere, onRefresh, projectId, selectedGlobalComponentId, supabase]
  )

  // Add-to-briefing options (loaded on-demand; system/global components only)
  const { data: addUsageBriefingTypes } = useQuery({
    queryKey: ['projBriefings:library:addUsage:briefingTypes', projectId],
    enabled: isAddUsageDialogOpen,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('project_briefing_types')
        .select(`briefing_type_id, position`)
        .eq('project_id', projectId)
        .order('position', { ascending: true })
      if (error) throw error

      const ids = Array.from(new Set((rows || []).map((r: any) => r.briefing_type_id).filter(Boolean)))
      if (!ids.length) return []

      const { data: types, error: typesError } = await supabase
        .from('briefing_types')
        .select('id, title')
        .in('id', ids)
      if (typesError) throw typesError

      const titleById = new Map<number, string>((types || []).map((t: any) => [t.id, t.title]))
      return (rows || []).map((row: any) => ({
        id: row.briefing_type_id,
        title: titleById.get(row.briefing_type_id) ?? 'Briefing',
      }))
    },
    ...TAB_CACHE_QUERY_OPTIONS,
    placeholderData: (previousData) => previousData,
  })

  const { data: addUsageContentTypes } = useQuery({
    queryKey: ['projBriefings:library:addUsage:contentTypes', projectId],
    enabled: isAddUsageDialogOpen,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('project_content_type_settings')
        .select('content_type_id')
        .eq('project_id', projectId)
      if (error) throw error

      const ids = Array.from(new Set((rows || []).map((r: any) => r.content_type_id).filter(Boolean)))
      if (!ids.length) return []

      const { data: types, error: typesError } = await supabase
        .from('content_types')
        .select('id, title')
        .in('id', ids)
      if (typesError) throw typesError

      return (types || [])
        .map((ct: any) => ({ id: ct.id, title: ct.title }))
        .sort((a: any, b: any) => a.title.localeCompare(b.title))
    },
    ...TAB_CACHE_QUERY_OPTIONS,
    placeholderData: (previousData) => previousData,
  })

  const { data: addUsageChannelsData, isLoading: isChannelsLoading } = useQuery({
    queryKey: ['projBriefings:library:addUsage:channels', projectId, addUsageContentTypeIds],
    enabled: isAddUsageDialogOpen && addUsageContentTypeIds.length > 0,
    queryFn: async () => {
      const contentTypeIds = addUsageContentTypeIds.map(Number).filter(Boolean)
      const { data: rows, error } = await supabase
        .from('project_content_types_channels')
        .select(`content_type_id, channel_id, position`)
        .eq('project_id', projectId)
        .in('content_type_id', contentTypeIds)
        .order('position', { ascending: true })
      if (error) throw error
      const ids = Array.from(new Set((rows || []).map((r: any) => r.channel_id).filter(Boolean)))
      if (!ids.length) return []

      const { data: chans, error: chansError } = await supabase
        .from('channels')
        .select('id, name')
        .in('id', ids)
      if (chansError) throw chansError

      const nameById = new Map<number, string>((chans || []).map((c: any) => [c.id, c.name]))
      const allowedPairs = new Set<string>()
      ;(rows || []).forEach((row: any) => {
        allowedPairs.add(`${row.content_type_id}:${row.channel_id}`)
      })

      const channelOptions = (rows || [])
        .map((row: any) => ({
          id: row.channel_id,
          title: nameById.get(row.channel_id) ?? 'Channel',
          position: row.position ?? null,
        }))
        .sort((a: any, b: any) => {
          const pa = a.position ?? 999
          const pb = b.position ?? 999
          if (pa !== pb) return pa - pb
          return a.title.localeCompare(b.title)
        })
      return {
        channelOptions: Array.from(
          new Map(channelOptions.map((c: any) => [c.id, c])).values()
        ),
        allowedPairs,
      }
    },
    ...TAB_CACHE_QUERY_OPTIONS,
    placeholderData: (previousData) => previousData,
  })

  const handleAddUsage = useCallback(async () => {
    // Project components use Channel requirements — never write briefing-template usage here.
    if (!selectedGlobalComponentId || selectedProjectComponentId) return
    if (!addUsageContentTypeIds.length || !addUsageChannelIds.length || !addUsageBriefingTypeIds.length) {
      toast({
        title: 'Error',
        description: 'Pick briefing type(s), content type(s), and channel(s)',
        variant: 'destructive',
      })
      return
    }

    const allowedPairs =
      addUsageChannelsData && !Array.isArray(addUsageChannelsData) && addUsageChannelsData.allowedPairs
        ? addUsageChannelsData.allowedPairs
        : new Set<string>()
    const contentTypeIds = addUsageContentTypeIds.map(Number).filter(Boolean)
    const channelIds = addUsageChannelIds.map(Number).filter(Boolean)
    const briefingTypeIds = addUsageBriefingTypeIds.map(Number).filter(Boolean)

    const calls: Array<{ ct: number; ch: number; bt: number }> = []
    for (const ct of contentTypeIds) {
      for (const ch of channelIds) {
        if (allowedPairs.size && !allowedPairs.has(`${ct}:${ch}`)) continue
        for (const bt of briefingTypeIds) {
          calls.push({ ct, ch, bt })
        }
      }
    }

    if (!calls.length) {
      toast({
        title: 'Error',
        description:
          'No valid channel/content-type combinations selected. (Those channels might not be enabled for the selected content types.)',
        variant: 'destructive',
      })
      return
    }

    if (calls.length > 50) {
      toast({
        title: 'Too many combinations',
        description: `This would add ${calls.length} briefings at once. Please narrow your selection.`,
        variant: 'destructive',
      })
      return
    }

    setIsAddingUsage(true)
    try {
      // Attach selected briefing types to each CT×Channel without replacing existing assignments.
      const ensureAssignments = await Promise.allSettled(
        calls.map(({ ct, ch, bt }) =>
          supabase.rpc('pcctb_add', {
            p_project_id: projectId,
            p_content_type_id: ct,
            p_channel_id: ch,
            p_briefing_type_id: bt,
          })
        )
      )
      const ensureFailures = ensureAssignments.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      )
      const ensureRpcErrors = ensureAssignments
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.value)
        .filter((result: any) => Boolean(result?.error))
      if (ensureFailures.length || ensureRpcErrors.length) {
        const sampleError =
          (ensureRpcErrors[0] as any)?.error?.message ||
          ensureFailures[0]?.reason?.message ||
          'Failed to attach briefing assignment(s)'
        throw new Error(
          `${sampleError} (${ensureFailures.length + ensureRpcErrors.length}/${calls.length} failed)`
        )
      }

      const results = await Promise.allSettled(
        calls.map(({ ct, ch, bt }) =>
          supabase.rpc('pcctbc_add_global', {
            p_project_id: projectId,
            p_content_type_id: ct,
            p_channel_id: ch,
            p_briefing_type_id: bt,
            p_briefing_component_id: selectedGlobalComponentId,
            p_position: null,
            p_custom_title: selectedItem?.title ?? null,
            p_custom_description: selectedItem?.description ?? null,
            p_purpose: null,
            p_guidance: null,
            p_suggested_word_count: null,
            p_subheads: null,
          }),
        ),
      )

      const failures = results.filter(r => r.status === 'rejected') as Array<PromiseRejectedResult>
      const rpcErrors = results
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.value)
        .filter((result: any) => Boolean(result?.error))
      if (failures.length || rpcErrors.length) {
        const sampleError =
          (rpcErrors[0] as any)?.error?.message ||
          failures[0]?.reason?.message ||
          'Failed to add to briefing'
        throw new Error(`${sampleError} (${failures.length + rpcErrors.length}/${calls.length} failed)`)
      }

      toast({ title: 'Success', description: 'Added to briefing' })
      setIsAddUsageDialogOpen(false)
      // Optimistic: update the global CT usage list immediately so the right pane reflects the change.
      if (selectedGlobalComponentId) {
        queryClient.setQueryData(
          ['projBriefings:library:globalUsage:ct', projectId, selectedGlobalComponentId],
          (current: any) => {
            const currentRows = Array.isArray(current) ? current : []
            const appendRows = calls.map(({ ct, ch, bt }) => ({
              content_type_id: ct,
              content_type_title: `Content type ${ct}`,
              channel_id: ch,
              channel_title: `Channel ${ch}`,
              briefing_type_id: bt,
              briefing_type_title: `Briefing ${bt}`,
              position: null,
              custom_title: editTitle,
              custom_description: editDescription,
            }))
            const merged = [...currentRows]
            for (const r of appendRows) {
              const k = `${r.content_type_id}:${r.channel_id}:${r.briefing_type_id}`
              if (!merged.some((x: any) => `${x.content_type_id}:${x.channel_id}:${x.briefing_type_id}` === k)) {
                merged.push(r)
              }
            }
            return merged
          }
        )
      }

      invalidateUsageEverywhere()
      queryClient.invalidateQueries({ queryKey: ['proj:ctch:default', projectId] })
      queryClient.invalidateQueries({ queryKey: ['proj:ctch:components', projectId] })
      onRefresh()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to add to briefing', variant: 'destructive' })
    } finally {
      setIsAddingUsage(false)
    }
  }, [
    addUsageBriefingTypeIds,
    addUsageChannelIds,
    addUsageContentTypeIds,
    addUsageChannelsData,
    invalidateUsageEverywhere,
    onRefresh,
    projectId,
    selectedProjectComponentId,
    selectedGlobalComponentId,
    selectedItem,
    supabase,
  ])

  const handleInlineCreateClose = useCallback(() => {
    setShowInlineNewComponent(false)
    resetForm()
  }, [resetForm])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading components...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-red-600">Error loading components: {String(error)}</div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div className="border-b border-gray-100 px-1 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="search"
            placeholder="Search components..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {filteredItems.length === 0 && !showInlineNewComponent ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <p className="mb-4 text-sm text-gray-500">
              {searchQuery ? 'No components match your search' : 'No components yet'}
            </p>
            <AddComponentButton
              label="Add component"
              onClick={() => {
                resetForm()
                setShowInlineNewComponent(true)
              }}
            />
          </div>
        ) : (
          <div className="divide-y divide-gray-100 rounded-md border border-gray-100">
            {filteredItems.map((item: any) => {
              const isExpanded = item.key === selectedKey && !isMultiSelect
              const isSelectedInMulti = selectedKeys.includes(item.key)
              return (
                <div key={item.key} className="bg-white">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey) {
                        toggleMultiSelectKey(item.key)
                        return
                      }
                      setSelectedKeyAndUrl(isExpanded ? null : item.key)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedKeyAndUrl(isExpanded ? null : item.key)
                      }
                    }}
                    className={[
                      "flex cursor-pointer items-center gap-2 px-3 py-2.5 transition-colors hover:bg-gray-50",
                      (isExpanded || isSelectedInMulti) ? "bg-gray-50" : "",
                    ].join(" ")}
                  >
                    <div className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                      {item.title}
                      {isSelectedInMulti && !isExpanded ? (
                        <span className="ml-2 text-xs font-normal text-gray-400">selected</span>
                      ) : null}
                    </div>
                    {item.kind === "project" && !isMultiSelect ? (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          setComponentToDelete({ kind: "project", id: item.component_id, title: item.title })
                          setIsDeleteDialogOpen(true)
                        }}
                        className="shrink-0 rounded p-1 text-red-500 hover:bg-red-50"
                        title="Remove component"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>

                  {isExpanded && selectedItem ? (
                    <div className="space-y-4 border-t border-gray-100 px-3 py-3">
                      <div className="space-y-3">
                        <div>
                          <Label htmlFor={`edit-title-${item.key}`} className="text-xs text-gray-500">
                            Title
                          </Label>
                          <Input
                            id={`edit-title-${item.key}`}
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                            onBlur={selectedItem.kind === 'project' ? handleSaveMeta : handleSaveGlobalMeta}
                            placeholder="Component title"
                            className="mt-1 h-9"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`edit-description-${item.key}`} className="text-xs text-gray-500">
                            Description
                          </Label>
                          <Textarea
                            id={`edit-description-${item.key}`}
                            value={editDescription}
                            onChange={e => setEditDescription(e.target.value)}
                            onBlur={selectedItem.kind === 'project' ? handleSaveMeta : handleSaveGlobalMeta}
                            placeholder="Component description"
                            rows={3}
                            className="mt-1"
                          />
                        </div>
                        {isSavingMeta ? (
                          <div className="text-xs text-gray-500 inline-flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Saving…
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500">Auto-saves on blur.</div>
                        )}
                      </div>

                      {selectedItem.kind === 'project' && selectedProjectComponentId != null ? (
                        <ChannelRequirementsSection
                          projectId={projectId}
                          component={{ kind: "project", projectComponentId: selectedProjectComponentId }}
                        />
                      ) : selectedItem.kind === 'global' && selectedGlobalComponentId != null ? (
                        <ChannelRequirementsSection
                          projectId={projectId}
                          component={{ kind: "global", briefingComponentId: selectedGlobalComponentId }}
                        />
                      ) : null}

                      <button
                        type="button"
                        className="text-sm text-red-600 hover:underline"
                        onClick={() => {
                          if (selectedItem.kind === 'project') {
                            setComponentToDelete({
                              kind: 'project',
                              id: selectedProjectComponentId!,
                              title: selectedItem.title,
                            })
                          } else {
                            setComponentToDelete({
                              kind: 'global',
                              id: selectedItem.component_id,
                              title: selectedItem.title,
                            })
                          }
                          setIsDeleteDialogOpen(true)
                        }}
                      >
                        Remove from project
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}

        {showInlineNewComponent ? (
          <div className="mt-3 space-y-3 rounded-md border border-dashed border-gray-200 bg-white px-3 py-3">
            <div>
              <Label htmlFor="new-component-title" className="text-xs text-gray-500">Title *</Label>
              <Input
                id="new-component-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Component title"
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label htmlFor="new-component-description" className="text-xs text-gray-500">Description</Label>
              <Textarea
                id="new-component-description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Component description"
                rows={2}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="new-component-rules" className="text-xs text-gray-500">Rules</Label>
              <Textarea
                id="new-component-rules"
                value={rules}
                onChange={e => setRules(e.target.value)}
                placeholder="Component rules or guidelines"
                rows={3}
                className="mt-1"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={handleInlineCreateClose}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={handleCreate} disabled={!title.trim()}>
                Create component
              </Button>
            </div>
          </div>
        ) : filteredItems.length > 0 ? (
          <AddComponentButton
            label="Add component"
            onClick={() => {
              resetForm()
              setShowInlineNewComponent(true)
            }}
          />
        ) : null}
      </div>

      {isMultiSelect ? (
        <div className="flex items-center justify-between gap-2 border-t border-gray-200 bg-white p-3">
          <div className="text-sm text-gray-600">
            {selectedKeys.length} selected (Ctrl/⌘ click to toggle)
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedKeys([])}>
              Clear
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsBulkDeleteDialogOpen(true)}
              disabled={!selectedKeys.length || isBulkDeleting}
            >
              Delete from project
            </Button>
          </div>
        </div>
      ) : null}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from project</AlertDialogTitle>
            <AlertDialogDescription>
              Remove this component from the project? It will no longer be available in this project&apos;s library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setComponentToDelete(null)
                setIsDeleteDialogOpen(false)
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected components from project</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {bulkCounts.total} component{bulkCounts.total === 1 ? '' : 's'} from the project?
              {bulkCounts.project ? ` ${bulkCounts.project} project component${bulkCounts.project === 1 ? '' : 's'}.` : ''}{' '}
              {bulkCounts.global ? ` ${bulkCounts.global} system component${bulkCounts.global === 1 ? '' : 's'}.` : ''}{' '}
              They will be removed from all briefings where they are used.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isBulkDeleting}
              onClick={() => setIsBulkDeleteDialogOpen(false)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleBulkDelete}
              disabled={isBulkDeleting || !selectedBulkItems.length}
            >
              {isBulkDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

