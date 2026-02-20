"use client"

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../ui/dialog'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Badge } from '../ui/badge'
import { toast } from '../ui/use-toast'
import { Plus, Trash2, Search, Loader2, ExternalLink } from 'lucide-react'
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
  addProjectComponentToBriefing,
  addGlobalComponentToBriefing,
  fetchProjectComponentUsage,
  loadProjectComponentIndex,
  updateProjectComponentInProject,
} from '../../lib/services/project-briefings'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { MultiSelect } from '../ui/multi-select'
import { SlidePanel } from '../ui/slide-panel'

interface LibraryTabProps {
  projectId: number
  selectedBriefingTypeId: number | null
  onRefresh: () => void
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
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
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
  const isDetailsOpen = selectedKey !== null && !isMultiSelect

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

  const [briefingFilterIds, setBriefingFilterIds] = useState<string[]>([])

  const { data: briefingFilterOptions } = useQuery({
    queryKey: ['projBriefings:library:briefingFilterOptions', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_project_briefing_types')
        .select('briefing_type_id, display_title')
        .eq('project_id', projectId)
        .order('display_title', { ascending: true })
      if (error) throw error
      return (data || []).map((row: any) => ({
        id: String(row.briefing_type_id),
        label: row.display_title,
      }))
    },
  })

  // Fetch union list (project + global) for the left pane
  const { data: indexItems, isLoading, error } = useQuery({
    queryKey: ['projBriefings:library:index', projectId],
    queryFn: async () => {
      const { data, error } = await loadProjectComponentIndex(projectId)
      if (error) throw error
      return data || []
    },
  })

  const filteredItems = useMemo(() => {
    if (!indexItems) return []

    const briefingTitleById = new Map<string, string>(
      (briefingFilterOptions || []).map((o: any) => [o.id, o.label])
    )
    const selectedBriefingTitles = new Set(
      briefingFilterIds.map((id) => briefingTitleById.get(id)).filter(Boolean) as string[]
    )

    const byBriefing = (item: any) => {
      if (!briefingFilterIds.length) return true
      const labels: string[] = Array.isArray(item.usage_labels) ? item.usage_labels : []
      // Labels are formatted: "{briefingTitle} - {channel} - {contentType}" or "{briefingTitle}"
      return labels.some((l) => selectedBriefingTitles.has(String(l).split(' - ')[0]?.trim() || ''))
    }

    const bySearch = (item: any) => {
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase()
      const inTitle = item.title?.toLowerCase().includes(query)
      const inDesc = item.description?.toLowerCase().includes(query)
      const inUsage = Array.isArray(item.usage_labels) && item.usage_labels.some((l: string) => l.toLowerCase().includes(query))
      return inTitle || inDesc || inUsage
    }

    return indexItems.filter((item: any) => byBriefing(item) && bySearch(item))
  }, [briefingFilterIds, briefingFilterOptions, indexItems, searchQuery])

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
    enabled: !!selectedGlobalComponentId,
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
  })

  const {
    data: globalCtUsage,
    isLoading: isGlobalCtUsageLoading,
    error: globalCtUsageError,
  } = useQuery({
    queryKey: ['projBriefings:library:globalUsage:ct', projectId, selectedGlobalComponentId],
    enabled: !!selectedGlobalComponentId,
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
          .select('content_type_id, channel_id, briefing_type_id')
          .eq('project_id', projectId)
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

      setIsCreateDialogOpen(false)
      resetForm()
      queryClient.invalidateQueries({ queryKey: ['projBriefings:library:index', projectId] })
      onRefresh()

      // Auto-select newly created component
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

  const handleAddToBriefing = useCallback(
    async (componentId: number) => {
      if (!selectedBriefingTypeId) {
        toast({
          title: 'Error',
          description: 'Please select a briefing type first',
          variant: 'destructive',
        })
        return
      }

      try {
        const { error } = await addProjectComponentToBriefing(
          projectId,
          selectedBriefingTypeId,
          componentId,
          null,
          null,
          null
        )
        if (error) throw error

        toast({
          title: 'Success',
          description: 'Component added to briefing template',
        })

        queryClient.invalidateQueries({
          queryKey: ['projBriefings:components', projectId, selectedBriefingTypeId],
        })
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
    queryClient.invalidateQueries({ queryKey: ['projBriefings:library:componentUsage', projectId] })
    queryClient.invalidateQueries({ queryKey: ['projBriefings:library:globalUsage:templates', projectId] })
    queryClient.invalidateQueries({ queryKey: ['projBriefings:library:globalUsage:ct', projectId] })
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

  // Sync selection from URL
  useEffect(() => {
    const urlKey = searchParams.get('component')
    if (!urlKey) {
      if (selectedKeys.length) setSelectedKeys([])
      return
    }
    if (urlKey !== selectedKey) {
      setSelectedKeys([urlKey])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Ensure URL stays clean if selectedKey points to a missing item (e.g. after deletion)
  useEffect(() => {
    const urlKey = searchParams.get('component')
    if (!urlKey) return
    if (!indexItems) return
    const exists = indexItems.some((i: any) => i.key === urlKey)
    if (!exists) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('component')
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
      setSelectedKeys([])
    }
  }, [indexItems, pathname, router, searchParams, selectedKeys])

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

  // Right pane: usage rows for selected component (parallel fetch in service)
  const {
    data: selectedUsage,
    isLoading: isUsageLoading,
    error: usageError,
  } = useQuery({
    queryKey: ['projBriefings:library:componentUsage', projectId, selectedProjectComponentId],
    enabled: !!selectedProjectComponentId,
    queryFn: async () => {
      if (!selectedProjectComponentId) return { templates: [], ctChannel: [] }
      const { data, error } = await fetchProjectComponentUsage(projectId, selectedProjectComponentId)
      if (error) throw error
      return data || { templates: [], ctChannel: [] }
    },
  })

  const handleRemoveFromTemplate = useCallback(
    async (briefingTypeId: number) => {
      if (!selectedProjectComponentId) return
      try {
        const { error } = await supabase.rpc('pbtc_remove', {
          p_project_id: projectId,
          p_briefing_type_id: briefingTypeId,
          p_component_id: selectedProjectComponentId,
          p_is_project_component: true,
        })
        if (error) throw error

        toast({ title: 'Success', description: 'Removed from template' })
        invalidateUsageEverywhere()
        onRefresh()
      } catch (err: any) {
        toast({ title: 'Error', description: err.message || 'Failed to remove', variant: 'destructive' })
      }
    },
    [invalidateUsageEverywhere, onRefresh, projectId, selectedProjectComponentId, supabase]
  )

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

  const handleRemoveFromCtChannel = useCallback(
    async (args: { contentTypeId: number; channelId: number; briefingTypeId: number }) => {
      if (!selectedProjectComponentId) return
      try {
        const { error } = await supabase.rpc('pcctbc_remove', {
          p_project_id: projectId,
          p_content_type_id: args.contentTypeId,
          p_channel_id: args.channelId,
          p_briefing_type_id: args.briefingTypeId,
          p_component_id: selectedProjectComponentId,
          p_is_project_component: true,
        })
        if (error) throw error

        toast({ title: 'Success', description: 'Removed from briefing' })
        invalidateUsageEverywhere()
        onRefresh()
      } catch (err: any) {
        toast({ title: 'Error', description: err.message || 'Failed to remove', variant: 'destructive' })
      }
    },
    [invalidateUsageEverywhere, onRefresh, projectId, selectedProjectComponentId, supabase]
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

  // Inline override editing for CT×Channel usage rows
  const [overrideDrafts, setOverrideDrafts] = useState<
    Record<string, { custom_title: string; custom_description: string }>
  >({})
  const [overrideInitialByKey, setOverrideInitialByKey] = useState<
    Record<string, { custom_title: string; custom_description: string }>
  >({})

  useEffect(() => {
    if (!selectedUsage?.ctChannel) return
    const next: Record<string, { custom_title: string; custom_description: string }> = {}
    const initial: Record<string, { custom_title: string; custom_description: string }> = {}
    selectedUsage.ctChannel.forEach((row: any) => {
      const key = `${row.content_type_id}:${row.channel_id}:${row.briefing_type_id}`
      next[key] = {
        custom_title: row.custom_title || '',
        custom_description: row.custom_description || '',
      }
      initial[key] = {
        custom_title: row.custom_title || '',
        custom_description: row.custom_description || '',
      }
    })
    setOverrideDrafts(next)
    setOverrideInitialByKey(initial)
  }, [selectedUsage])

  const handleSaveOverride = useCallback(
    async (args: { contentTypeId: number; channelId: number; briefingTypeId: number }) => {
      if (!selectedProjectComponentId) return
      const key = `${args.contentTypeId}:${args.channelId}:${args.briefingTypeId}`
      const draft = overrideDrafts[key]
      if (!draft) return
      const initial = overrideInitialByKey[key]
      const isSameTitle = (draft.custom_title.trim() || '') === ((initial?.custom_title ?? '').trim() || '')
      const isSameDesc =
        (draft.custom_description.trim() || '') === ((initial?.custom_description ?? '').trim() || '')
      if (isSameTitle && isSameDesc) return

      try {
        const { error } = await supabase.rpc('pcctbc_update', {
          p_project_id: projectId,
          p_content_type_id: args.contentTypeId,
          p_channel_id: args.channelId,
          p_briefing_type_id: args.briefingTypeId,
          p_component_id: selectedProjectComponentId,
          p_is_project_component: true,
          p_custom_title: draft.custom_title.trim() || null,
          p_custom_description: draft.custom_description.trim() || null,
        })
        if (error) throw error

        toast({ title: 'Success', description: 'Overrides updated' })
        invalidateUsageEverywhere()
      } catch (err: any) {
        toast({ title: 'Error', description: err.message || 'Failed to update overrides', variant: 'destructive' })
      }
    },
    [invalidateUsageEverywhere, overrideDrafts, overrideInitialByKey, projectId, selectedProjectComponentId, supabase]
  )

  // Add-to-briefing options (loaded on-demand)
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
  })

  const handleAddUsage = useCallback(async () => {
    if (!selectedProjectComponentId && !selectedGlobalComponentId) return
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

    // Ensure CT×Channel briefing exists for the selected briefing type(s).
    // We only auto-create when the CT×Channel briefing is missing / null.
    const { data: existingBriefings, error: existingErr } = await supabase
      .from('project_ct_channel_briefings')
      .select('content_type_id, channel_id, briefing_type_id')
      .eq('project_id', projectId)
      .in('content_type_id', contentTypeIds)
      .in('channel_id', channelIds)
    if (existingErr) {
      toast({
        title: 'Error',
        description: existingErr.message || 'Failed to load channel briefings',
        variant: 'destructive',
      })
      return
    }

    const briefingByPair = new Map<string, number | null>()
    ;(existingBriefings || []).forEach((row: any) => {
      briefingByPair.set(`${row.content_type_id}:${row.channel_id}`, row.briefing_type_id ?? null)
    })

    const skippedPairs: Array<{ ct: number; ch: number; bt: number }> = []
    const ensuredPairs: Array<{ ct: number; ch: number; bt: number }> = []

    for (const ct of contentTypeIds) {
      for (const ch of channelIds) {
        if (allowedPairs.size && !allowedPairs.has(`${ct}:${ch}`)) continue
        const pairKey = `${ct}:${ch}`
        const currentBt = briefingByPair.get(pairKey) ?? null

        for (const bt of briefingTypeIds) {
          if (currentBt == null) {
            // Not set yet -> create default briefing for this CT×Channel
            const { error: setErr } = await supabase.rpc('pcctb_set', {
              p_project_id: projectId,
              p_content_type_id: ct,
              p_channel_id: ch,
              p_briefing_type_id: bt,
            })
            if (setErr) {
              toast({
                title: 'Error',
                description: setErr.message || 'Failed to create channel briefing',
                variant: 'destructive',
              })
              return
            }
            briefingByPair.set(pairKey, bt)
            ensuredPairs.push({ ct, ch, bt })
          } else if (currentBt !== bt) {
            // Safety: don't overwrite an existing CT×Channel briefing assignment automatically.
            skippedPairs.push({ ct, ch, bt })
            continue
          }
        }
      }
    }

    const calls: Array<{ ct: number; ch: number; bt: number }> = []
    for (const ct of contentTypeIds) {
      for (const ch of channelIds) {
        if (allowedPairs.size && !allowedPairs.has(`${ct}:${ch}`)) continue
        const pairKey = `${ct}:${ch}`
        const currentBt = briefingByPair.get(pairKey) ?? null
        if (currentBt == null) continue
        // Only add for briefing types that are the active briefing for this pair
        for (const bt of briefingTypeIds) {
          if (bt === currentBt) calls.push({ ct, ch, bt })
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
      const results = await Promise.allSettled(
        calls.map(({ ct, ch, bt }) => {
          if (selectedProjectComponentId) {
            return supabase.rpc('pcctbc_add_project', {
              p_project_id: projectId,
              p_content_type_id: ct,
              p_channel_id: ch,
              p_briefing_type_id: bt,
              p_project_component_id: selectedProjectComponentId,
              p_position: null,
              p_custom_title: null,
              p_custom_description: null,
              p_purpose: null,
              p_guidance: null,
              p_suggested_word_count: null,
              p_subheads: null,
            })
          }

          // Global component add
          return supabase.rpc('pcctbc_add_global', {
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
          })
        })
      )

      const failures = results.filter(r => r.status === 'rejected') as Array<PromiseRejectedResult>
      if (failures.length) {
        throw new Error(`Failed to add to ${failures.length} of ${calls.length} selected briefings`)
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
      // If we created any new channel briefings, refresh other briefings UIs that depend on default briefing selection.
      if (ensuredPairs.length) {
        queryClient.invalidateQueries({ queryKey: ['proj:ctch:default', projectId] })
        queryClient.invalidateQueries({ queryKey: ['proj:ctch:components', projectId] })
      }
      onRefresh()

      if (skippedPairs.length) {
        toast({
          title: 'Some combinations skipped',
          description:
            'Some Content Type × Channel selections already have a different default briefing set, so we did not overwrite them.',
          variant: 'destructive',
        })
      }
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

  const handleDialogClose = useCallback(() => {
    setIsCreateDialogOpen(false)
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

  const renderUsageChips = (componentId: number) => {
    const item = (indexItems || []).find((i: any) => i.kind === 'project' && i.component_id === componentId)
    const labels = item?.usage_labels || []
    if (!labels.length) return null
    const visible = labels.slice(0, 3)
    const remaining = labels.length - visible.length
    return (
      <div className="mt-2 flex flex-wrap gap-1">
        {visible.map((label: string) => (
          <Badge key={label} variant="secondary" className="text-[11px] px-2 py-0.5">
            {label}
          </Badge>
        ))}
        {remaining > 0 ? (
          <Badge variant="outline" className="text-[11px] px-2 py-0.5">
            +{remaining} more
          </Badge>
        ) : null}
      </div>
    )
  }

  return (
    <div className="h-full">
      {/* Left pane */}
      <div className="flex flex-col h-full border rounded-lg bg-white border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Project Components</h2>
              <p className="text-sm text-gray-500 mt-1">Create and manage project-scoped briefing components</p>
            </div>

            <Dialog
              open={isCreateDialogOpen}
              onOpenChange={open => {
                if (!open) {
                  handleDialogClose()
                } else {
                  setIsCreateDialogOpen(true)
                  resetForm()
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    setIsCreateDialogOpen(true)
                    resetForm()
                  }}
                >
                  <Plus className="w-4 h-4" />
                  New
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Component</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="title">Title *</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="Component title"
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="Component description"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="rules">Rules</Label>
                    <Textarea
                      id="rules"
                      value={rules}
                      onChange={e => setRules(e.target.value)}
                      placeholder="Component rules or guidelines"
                      rows={4}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={handleDialogClose}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={!title.trim()}>
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="search"
                placeholder="Search components..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="w-[220px]">
              <MultiSelect
                options={briefingFilterOptions || []}
                value={briefingFilterIds}
                onChange={setBriefingFilterIds}
                placeholder="All briefings"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <p className="text-gray-500 mb-4">
                {searchQuery ? 'No components match your search' : 'No components created yet'}
              </p>
              <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Component
              </Button>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {filteredItems.map((item: any) => {
                const isSelected = item.key === selectedKey
                const isSelectedInMulti = selectedKeys.includes(item.key)
                const labels = Array.isArray(item.usage_labels) ? item.usage_labels : []
                const visible = labels.slice(0, 3)
                const remaining = labels.length - visible.length
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey) {
                        toggleMultiSelectKey(item.key)
                        return
                      }
                      setSelectedKeyAndUrl(item.key)
                    }}
                    className={[
                      'w-full text-left border rounded-lg p-3 transition-colors',
                      (isSelected || isSelectedInMulti) ? 'border-black bg-gray-50' : 'border-gray-200 bg-white hover:bg-gray-50',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-gray-900 truncate">{item.title}</div>
                          <Badge variant="outline" className="text-[11px]">
                            {item.kind === 'project' ? 'Project' : 'System'}
                          </Badge>
                          {isSelectedInMulti && !isSelected ? (
                            <Badge variant="secondary" className="text-[11px]">Selected</Badge>
                          ) : null}
                        </div>
                        {visible.length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {visible.map((label: string) => (
                              <Badge key={label} variant="secondary" className="text-[11px] px-2 py-0.5">
                                {label}
                              </Badge>
                            ))}
                            {remaining > 0 ? (
                              <Badge variant="outline" className="text-[11px] px-2 py-0.5">
                                +{remaining} more
                              </Badge>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1">
                        {item.kind === 'project' && !isMultiSelect ? (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              setComponentToDelete({ kind: 'project', id: item.component_id, title: item.title })
                              setIsDeleteDialogOpen(true)
                            }}
                            className="p-1 rounded hover:bg-red-50 text-red-500"
                            title="Delete component"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {isMultiSelect ? (
          <div className="border-t border-gray-200 p-3 flex items-center justify-between gap-2 bg-white">
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
                onClick={() => {
                  setIsBulkDeleteDialogOpen(true)
                }}
                disabled={!selectedKeys.length || isBulkDeleting}
              >
                Delete from project
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Details overlay */}
      <SlidePanel
        isOpen={isDetailsOpen}
        onClose={() => setSelectedKeyAndUrl(null)}
        position="right"
        className="w-[520px] max-w-[92vw] top-16 bottom-0 border-l border-gray-200 shadow-xl z-20"
        title="Component"
        hasOverlay={false}
      >
        {!selectedItem ? (
          <div className="text-sm text-gray-500">Select a component to view details.</div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1 space-y-6 overflow-auto pr-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {selectedItem.kind === 'project' ? 'Custom (Project component)' : 'System component'}
                    </Badge>
                    {isSavingMeta ? (
                      <span className="text-xs text-gray-500 inline-flex items-center">
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Saving…
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3">
                    <h3 className="text-base font-semibold text-gray-900 leading-tight">
                      {selectedItem.kind === 'project' ? (editTitle || selectedItem.title) : selectedItem.title}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">Edit the component and manage where it’s used.</p>
                  </div>
                </div>
              </div>

              {selectedItem.kind === 'project' ? (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="edit-title">Title</Label>
                    <Input
                      id="edit-title"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onBlur={handleSaveMeta}
                      placeholder="Component title"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-description">Description</Label>
                    <Textarea
                      id="edit-description"
                      value={editDescription}
                      onChange={e => setEditDescription(e.target.value)}
                      onBlur={handleSaveMeta}
                      placeholder="Component description"
                      rows={4}
                    />
                  </div>
                  <div className="text-xs text-gray-500">Auto-saves on blur.</div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="edit-global-title">Title</Label>
                    <Input
                      id="edit-global-title"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onBlur={handleSaveGlobalMeta}
                      placeholder="Custom title"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-global-description">Description</Label>
                    <Textarea
                      id="edit-global-description"
                      value={editDescription}
                      onChange={e => setEditDescription(e.target.value)}
                      onBlur={handleSaveGlobalMeta}
                      placeholder="Custom description"
                      rows={4}
                    />
                  </div>
                  <div className="text-xs text-gray-500">Auto-saves on blur (updates all selected briefings).</div>
                </div>
              )}

              {/* Usage */}
              <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Used in Project Briefing Templates</h4>
                <p className="text-xs text-gray-500 mt-1">Project-level template usage for this component.</p>
              </div>

              {selectedItem.kind === 'project' ? (
                isUsageLoading ? (
                  <div className="space-y-2">
                    <div className="h-10 bg-gray-100 rounded animate-pulse" />
                    <div className="h-10 bg-gray-100 rounded animate-pulse" />
                  </div>
                ) : usageError ? (
                  <div className="text-sm text-red-600">Failed to load usage: {String(usageError)}</div>
                ) : (selectedUsage?.templates?.length || 0) === 0 ? (
                  <div className="text-sm text-gray-500">Not used in any project briefing templates.</div>
                ) : (
                  <div className="space-y-2">
                    {selectedUsage!.templates.map((row: any) => (
                      <div key={row.briefing_type_id} className="border rounded-md border-gray-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900">{row.briefing_type_title}</div>
                            <div className="text-xs text-gray-500 mt-1">Position: {row.position ?? '—'}</div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => handleRemoveFromTemplate(row.briefing_type_id)}
                          >
                            Remove from template
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : isGlobalTemplateUsageLoading ? (
                <div className="space-y-2">
                  <div className="h-10 bg-gray-100 rounded animate-pulse" />
                  <div className="h-10 bg-gray-100 rounded animate-pulse" />
                </div>
              ) : globalTemplateUsageError ? (
                <div className="text-sm text-red-600">Failed to load usage: {String(globalTemplateUsageError)}</div>
              ) : (globalTemplateUsage?.length || 0) === 0 ? (
                <div className="text-sm text-gray-500">Not used in any project briefing templates.</div>
              ) : (
                <div className="space-y-2">
                  {(globalTemplateUsage as any[]).map((row: any) => {
                    return (
                    <div key={row.briefing_type_id} className="border rounded-md border-gray-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900">{row.briefing_type_title}</div>
                          <div className="text-xs text-gray-500 mt-1">Position: {row.position ?? '—'}</div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => handleRemoveGlobalFromTemplate(row.briefing_type_id)}
                        >
                          Remove from template
                        </Button>
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {selectedItem.kind === 'project' && selectedBriefingTypeId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAddToBriefing(selectedProjectComponentId!)}
                    className="gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Add to current template
                  </Button>
                ) : null}

                {selectedItem.kind === 'global' && selectedBriefingTypeId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAddGlobalToCurrentTemplate(selectedGlobalComponentId!)}
                    className="gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Add to current template
                  </Button>
                ) : null}

                {selectedItem.kind === 'project' ? (
                  <Button size="sm" variant="outline" onClick={() => setIsAddUsageDialogOpen(true)} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add to briefing…
                  </Button>
                ) : null}

                {selectedItem.kind === 'global' ? (
                  <Button size="sm" variant="outline" onClick={() => setIsAddUsageDialogOpen(true)} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add to briefing…
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Used in Channel/Content-Type Briefings</h4>
                <p className="text-xs text-gray-500 mt-1">Per channel/content-type usage for this component.</p>
              </div>

              {selectedItem.kind === 'project' ? (
                isUsageLoading ? (
                  <div className="space-y-2">
                    <div className="h-14 bg-gray-100 rounded animate-pulse" />
                    <div className="h-14 bg-gray-100 rounded animate-pulse" />
                  </div>
                ) : (selectedUsage?.ctChannel?.length || 0) === 0 ? (
                  <div className="text-sm text-gray-500">Not used in any channel/content-type briefings.</div>
                ) : (
                  <div className="space-y-3">
                    {selectedUsage!.ctChannel
                      .filter((r: any) => r.briefing_type_id)
                      .map((row: any) => {
                        const key = `${row.content_type_id}:${row.channel_id}:${row.briefing_type_id}`
                        const draft = overrideDrafts[key] || { custom_title: '', custom_description: '' }
                        return (
                          <div key={key} className="border rounded-md border-gray-200 p-3 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900">
                                  {row.briefing_type_title} - {row.channel_title} - {row.content_type_title}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">Position: {row.position ?? '—'}</div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 border-red-200 hover:bg-red-50"
                                onClick={() =>
                                  handleRemoveFromCtChannel({
                                    contentTypeId: row.content_type_id,
                                    channelId: row.channel_id,
                                    briefingTypeId: row.briefing_type_id,
                                  })
                                }
                              >
                                Remove from this briefing
                              </Button>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                              <div>
                                <Label className="text-xs">Override title</Label>
                                <Input
                                  value={draft.custom_title}
                                  onChange={e =>
                                    setOverrideDrafts(prev => ({
                                      ...prev,
                                      [key]: { ...draft, custom_title: e.target.value },
                                    }))
                                  }
                                  onBlur={() =>
                                    handleSaveOverride({
                                      contentTypeId: row.content_type_id,
                                      channelId: row.channel_id,
                                      briefingTypeId: row.briefing_type_id,
                                    })
                                  }
                                  placeholder="(optional)"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Override description</Label>
                                <Textarea
                                  value={draft.custom_description}
                                  onChange={e =>
                                    setOverrideDrafts(prev => ({
                                      ...prev,
                                      [key]: { ...draft, custom_description: e.target.value },
                                    }))
                                  }
                                  onBlur={() =>
                                    handleSaveOverride({
                                      contentTypeId: row.content_type_id,
                                      channelId: row.channel_id,
                                      briefingTypeId: row.briefing_type_id,
                                    })
                                  }
                                  placeholder="(optional)"
                                  rows={3}
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )
              ) : isGlobalCtUsageLoading ? (
                <div className="space-y-2">
                  <div className="h-14 bg-gray-100 rounded animate-pulse" />
                  <div className="h-14 bg-gray-100 rounded animate-pulse" />
                </div>
              ) : globalCtUsageError ? (
                <div className="text-sm text-red-600">Failed to load usage: {String(globalCtUsageError)}</div>
              ) : (globalCtUsage?.length || 0) === 0 ? (
                <div className="text-sm text-gray-500">Not used in any channel/content-type briefings.</div>
              ) : (
                <div className="space-y-3">
                  {(globalCtUsage as any[]).map((row: any) => {
                      const key = `${row.content_type_id}:${row.channel_id}:${row.briefing_type_id}`
                      return (
                        <div key={key} className="border rounded-md border-gray-200 p-3 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900">
                                {row.briefing_type_title} - {row.channel_title} - {row.content_type_title}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">Position: {row.position ?? '—'}</div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() =>
                                handleRemoveGlobalFromCtChannel({
                                  contentTypeId: row.content_type_id,
                                  channelId: row.channel_id,
                                  briefingTypeId: row.briefing_type_id,
                                })
                              }
                            >
                              Remove from this briefing
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>

            {/* Delete */}
            {selectedItem.kind === 'project' || selectedItem.kind === 'global' ? (
              <div className="pt-2 border-t border-gray-200">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Danger zone</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Deleting will remove this component from all briefings where it is used.
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
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
                    Delete from project
                  </Button>
                </div>
              </div>
            ) : null}
            </div>
          </div>
        )}
      </SlidePanel>

      {/* Delete confirmation dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete component from project</AlertDialogTitle>
            <AlertDialogDescription>
              Delete this component from the project? It will be removed from all briefings where it is used.
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
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation dialog */}
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
              onClick={() => {
                setIsBulkDeleteDialogOpen(false)
              }}
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

      {/* Add usage dialog */}
      <Dialog
        open={isAddUsageDialogOpen}
        onOpenChange={open => {
          setIsAddUsageDialogOpen(open)
          if (!open) {
            setAddUsageContentTypeIds([])
            setAddUsageChannelIds([])
            setAddUsageBriefingTypeIds([])
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add to briefing…</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Briefing type</Label>
              <MultiSelect
                options={(addUsageBriefingTypes || []).map((bt: any) => ({
                  id: String(bt.id),
                  label: bt.title,
                }))}
                value={addUsageBriefingTypeIds}
                onChange={setAddUsageBriefingTypeIds}
                placeholder="Select briefing type(s)…"
              />
            </div>

            <div>
              <Label>Content type</Label>
              <MultiSelect
                options={(addUsageContentTypes || []).map((ct: any) => ({
                  id: String(ct.id),
                  label: ct.title,
                }))}
                value={addUsageContentTypeIds}
                onChange={(ids) => {
                  setAddUsageContentTypeIds(ids)
                  // reset channels when content types change
                  setAddUsageChannelIds([])
                }}
                placeholder="Select content type(s)…"
              />
            </div>

            <div>
              <Label>Channel</Label>
              <MultiSelect
                options={(
                  (Array.isArray(addUsageChannelsData)
                    ? addUsageChannelsData
                    : (addUsageChannelsData?.channelOptions || [])) as any[]
                ).map((ch: any) => ({
                  id: String(ch.id),
                  label: ch.title,
                }))}
                value={addUsageChannelIds}
                onChange={setAddUsageChannelIds}
                placeholder={isChannelsLoading ? 'Loading channels…' : 'Select channel(s)…'}
                className={isChannelsLoading ? 'opacity-60' : undefined}
              />
              {addUsageContentTypeIds.length === 0 ? (
                <div className="text-xs text-gray-500 mt-1">Select content type(s) to load channel options.</div>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddUsageDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddUsage} disabled={isAddingUsage}>
              {isAddingUsage ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding…
                </>
              ) : (
                'Add selected'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

