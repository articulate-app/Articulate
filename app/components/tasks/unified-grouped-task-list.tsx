"use client"

import * as React from 'react'
import { useEffect, useRef, useMemo } from 'react'
import { useTaskGrouping } from '../../store/task-grouping'
import { useReactTable, getCoreRowModel, ColumnDef, flexRender } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTasksUI } from '../../store/tasks-ui'
import { useTaskSuggestionsQuery } from '../../hooks/use-task-suggestions-query'
import { useTaskGroupMetaPagedQuery } from '@/hooks/use-task-group-meta-paged-query'
import { computeGroupKeyForTask, useTaskGroupTasksQuery } from '../../../src/hooks/use-task-group-tasks-query'
import { computeGroupLabelForTask } from '../../../src/hooks/use-task-group-meta-all-query'
import { getGroupLabelFromKey } from '../../lib/group-key-utils'
import { mapTaskListRowToTableFormat } from '../../lib/fetchTasksFromView'
import { SubtaskRows } from './TaskList'
import { useSearchParams } from 'next/navigation'
import { getImageUrl } from '../../lib/public-media'
import { usePlannerOptimisticTasks } from '../../store/planner-optimistic-tasks'
import type { SearchSession } from '../../lib/types/search-session'

interface UnifiedGroupedTaskListProps<T> {
  columns: ColumnDef<T>[]
  gridTemplateColumns: string
  onTaskSelect?: (task: T) => void
  filters: Record<string, any>
  pageSize?: number
  sortBy: string
  sortOrder: 'asc' | 'desc'
  editFields?: any
  selectedTaskId?: string | number | null
  enabled?: boolean
  // Main-task expansion / multiselect state (owned by parent TaskList)
  expandedMainTasks?: Set<number>
  isMultiselectMode?: boolean
  selectedTasks?: Set<number>
  onTaskToggle?: (taskId: number) => void
}

type FlattenedItem =
  | {
      type: 'group'
      groupKey: string
      label: string
      isExpanded: boolean
      isAfterBlocking: boolean
      taskCount?: number
    }
  | { type: 'loading'; groupKey: string }
  | { type: 'task'; task: any; groupKey: string }
  | { type: 'subtasks'; groupKey: string; parentId: number }

/** Meta RPC returns group_key + label only (no task_count). */
type GroupHeader = { group_key: string; label: string; task_count?: number }

const META_RUNWAY_GROUPS = 30
const DEBUG_GROUPED_TASKS = false
const VIRTUAL_ROW_ESTIMATE_PX = 44
const VIRTUAL_OVERSCAN = 20
const FETCH_AHEAD_ROWS = 30

function getFlattenedItemKey(item: FlattenedItem): string {
  switch (item.type) {
    case 'group':
      return `group-${item.groupKey}`
    case 'loading':
      return `loading-${item.groupKey}`
    case 'task':
      return `${String((item.task as any)?.entity_type)}:${String((item.task as any)?.entity_id)}`
    case 'subtasks':
      return `subtasks-${String(item.parentId)}`
    default: {
      const _exhaustive: never = item
      return String(_exhaustive)
    }
  }
}

function isGroupDrained(args: {
  groupKey: string
  taskCount?: number
  nextCursorByGroup: Record<string, any | null>
  loadedFirstPageByGroup: Record<string, boolean>
}): boolean {
  const { taskCount, groupKey, nextCursorByGroup, loadedFirstPageByGroup } = args
  if (typeof taskCount === 'number' && taskCount <= 0) return true
  const hasLoadedFirstPage = !!loadedFirstPageByGroup[groupKey]
  const nextCursor = nextCursorByGroup[groupKey]
  return hasLoadedFirstPage && nextCursor == null
}

/**
 * Blocking group invariant:
 * - The blocking group is the FIRST group (in meta order) that is expanded AND not drained.
 * - All expanded groups before it are necessarily drained (by definition).
 */
function computeBlockingGroupKey(args: {
  groups: GroupHeader[]
  collapsedGroups: Set<string>
  nextCursorByGroup: Record<string, any | null>
  loadedFirstPageByGroup: Record<string, boolean>
}): string | null {
  const { groups, collapsedGroups, nextCursorByGroup, loadedFirstPageByGroup } = args

  for (const g of groups) {
    const key = String(g.group_key)
    if (collapsedGroups.has(key)) continue
    const drained = isGroupDrained({
      groupKey: key,
      taskCount: g.task_count,
      nextCursorByGroup,
      loadedFirstPageByGroup,
    })
    if (!drained) return key
  }
  return null
}

function computeNextExpandedGroupKeyAfter(args: {
  groups: GroupHeader[]
  afterGroupKey: string | null
  collapsedGroups: Set<string>
}): string | null {
  const { groups, afterGroupKey, collapsedGroups } = args
  if (!afterGroupKey) return null
  const idx = groups.findIndex(g => String(g.group_key) === String(afterGroupKey))
  if (idx === -1) return null
  for (let i = idx + 1; i < groups.length; i++) {
    const key = String(groups[i].group_key)
    if (collapsedGroups.has(key)) continue
    return key
  }
  return null
}

function computeShouldRenderRows(args: {
  groupKey: string
  groups: GroupHeader[]
  blockingGroupKey: string | null
  collapsedGroups: Set<string>
}): boolean {
  const { groupKey, groups, blockingGroupKey, collapsedGroups } = args
  if (collapsedGroups.has(groupKey)) return false

  // If there's no blocking group, everything expanded is drained → render all expanded groups.
  if (!blockingGroupKey) return true

  const idx = groups.findIndex(g => String(g.group_key) === String(groupKey))
  const blockingIdx = groups.findIndex(g => String(g.group_key) === String(blockingGroupKey))
  if (idx === -1 || blockingIdx === -1) return false

  return idx <= blockingIdx
}

export function UnifiedGroupedTaskList<T>({
  columns,
  gridTemplateColumns,
  onTaskSelect,
  filters,
  pageSize = 50,
  sortBy,
  sortOrder,
  editFields,
  selectedTaskId,
  enabled = true,
  expandedMainTasks,
  isMultiselectMode,
  selectedTasks,
  onTaskToggle,
}: UnifiedGroupedTaskListProps<T>) {
  const { selectedGroupBy } = useTaskGrouping()
  const params = useSearchParams()
  const groupOrder = (params.get('groupOrder') as 'asc' | 'desc' | null) ?? null
  const selectedEntityType = params.get('itemKind') === 'suggestion' ? 'suggestion' : 'task'

  // Treat explicit "none" as ungrouped if it ever appears. Normalize before query-shape key to avoid hydration flip.
  const effectiveGroupBy = (selectedGroupBy as any) === 'none' ? null : selectedGroupBy
  const isGroupedView = !!effectiveGroupBy
  const effectiveGroupOrder = groupOrder ?? 'asc'

  // Parse filters from URL params
  const q = params.get('q') || ''
  const project = params.get('project') || undefined

  const filterMapping: Record<string, string> = {
    assignedTo: 'assigned_to_name',
    status: 'project_status_name',
    contentType: 'content_type_title',
    productionType: 'production_type_title',
    language: 'language_code',
    channels: 'channel_names',
    overdueStatus: 'overdueStatus',
  }

  const urlFilters: Record<string, string | string[]> = React.useMemo(() => {
    const out: Record<string, string | string[]> = {}
    for (const [urlKey, filterKey] of Object.entries(filterMapping)) {
      const value = params.get(urlKey)
      if (value) {
        out[filterKey] = value.includes(',') ? value.split(',') : value
      }
    }
    return out
  }, [params.toString()])

  // Stable, sorted representation so key doesn't flip due to object key order or URL normalization.
  const stableFiltersKey = React.useMemo(() => {
    const entries = Object.entries(urlFilters)
      .flatMap(([k, v]) =>
        Array.isArray(v) ? v.map((x) => [k, String(x)] as const) : [[k, String(v)] as const],
      )
      .sort(([aK, aV], [bK, bV]) => (aK === bK ? aV.localeCompare(bV) : aK.localeCompare(bK)))
    return JSON.stringify(entries)
  }, [urlFilters])

  // Canonical search session: both meta and tasks RPCs read from this ref at call time (no stale closures).
  const searchSessionRef = useRef<SearchSession>({
    gen: 0,
    params: {
      q: '',
      filters: {},
      groupBy: '',
      groupOrder: 'asc',
      sortBy: '',
      sortOrder: 'desc',
    },
  })
  useEffect(() => {
    searchSessionRef.current = {
      gen: searchSessionRef.current.gen + 1,
      params: {
        q,
        project,
        filters: urlFilters,
        groupBy: effectiveGroupBy ?? '',
        groupOrder: effectiveGroupOrder,
        sortBy,
        sortOrder,
      },
    }
  }, [q, project, stableFiltersKey, effectiveGroupBy, effectiveGroupOrder, sortBy, sortOrder])

  // Meta runway: keep group headers fetched ahead (target ~30+ headers),
  // but NEVER render rows beyond the blocking group.
  const groupMetaQuery = useTaskGroupMetaPagedQuery({
    q,
    project,
    filters: urlFilters,
    groupBy: effectiveGroupBy,
    groupOrder: groupOrder || undefined,
    limit: META_RUNWAY_GROUPS,
    enabled: enabled !== false && isGroupedView,
    editFields,
    searchSessionRef,
  })

  const plannerVisibility = useTasksUI((s) => s.plannerVisibility)

  const projectIdsForSuggestions = React.useMemo(() => {
    const parseList = (v: string | null | undefined) =>
      (v ?? '')
        .split(',')
        .map((x) => Number.parseInt(x.trim(), 10))
        .filter((n) => Number.isFinite(n))

    const fromProjectParam = parseList(project)
    if (fromProjectParam.length > 0) return fromProjectParam

    const fromProjectIdParam = parseList(params.get('projectId'))
    if (fromProjectIdParam.length > 0) return fromProjectIdParam

    return null
  }, [project, params.toString()])

  const suggestionsRange = React.useMemo(() => {
    // Grouped list doesn't have an explicit "month picker" like calendar.
    // Default to start-of-month through end-of-next-month so early-month suggestions are included.
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    const to = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999)
    return { from, to }
  }, [])

  const isDateGrouped =
    effectiveGroupBy === 'delivery_date' || effectiveGroupBy === 'publication_date'

  const suggestionsQuery = useTaskSuggestionsQuery({
    projectIds: projectIdsForSuggestions,
    from: suggestionsRange.from,
    to: suggestionsRange.to,
    enabled: enabled !== false && isGroupedView && plannerVisibility.showSuggestions,
    cacheKeyParts: ['grouped', effectiveGroupBy, groupOrder],
  })

  const optimisticPlannerTasksByKey = usePlannerOptimisticTasks((s) => s.byKey)
  const optimisticPlannerTasks = useMemo(
    () => Object.values(optimisticPlannerTasksByKey),
    [optimisticPlannerTasksByKey],
  )

  const suggestionsByGroupKey = useMemo(() => {
    const out = new Map<string, any[]>()
    if (!plannerVisibility.showSuggestions) return out
    if (!effectiveGroupBy) return out
    for (const s of suggestionsQuery.data ?? []) {
      const key = computeGroupKeyForTask(s as any, effectiveGroupBy)
      if (!key) continue
      const arr = out.get(key) ?? []
      arr.push(s as any)
      out.set(key, arr)
    }
    return out
  }, [plannerVisibility.showSuggestions, suggestionsQuery.data, effectiveGroupBy])

  const optimisticTasksByGroupKey = useMemo(() => {
    const out = new Map<string, any[]>()
    if (!plannerVisibility.showTasks) return out
    if (!effectiveGroupBy) return out
    for (const t of optimisticPlannerTasks) {
      const key = computeGroupKeyForTask(t as any, effectiveGroupBy)
      if (!key) continue
      const arr = out.get(key) ?? []
      arr.push(t as any)
      out.set(key, arr)
    }
    return out
  }, [plannerVisibility.showTasks, optimisticPlannerTasks, effectiveGroupBy])

  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set())
  const prevQueryShapeKeyRef = React.useRef<string | null>(null)
  const resetAllRef = React.useRef<() => void>(() => {})

  const isGroupExpanded = React.useCallback(
    (groupKey: string) => !collapsedGroups.has(groupKey),
    [collapsedGroups],
  )

  const groupTasksQuery = useTaskGroupTasksQuery({
    q,
    project,
    filters: urlFilters,
    groupBy: effectiveGroupBy,
    rowSortBy: sortBy,
    rowSortOrder: sortOrder,
    perPage: pageSize,
    enabled: enabled !== false,
    editFields,
    searchSessionRef,
  })
  resetAllRef.current = groupTasksQuery.resetAll

  const groups: GroupHeader[] = useMemo(() => {
    if (!isGroupedView) {
      return [{ group_key: 'all', label: 'All tasks' }]
    }

    const base = (groupMetaQuery.groups ?? []).map((g: { group_key?: unknown; label?: string }) => ({
      group_key: String((g as any).group_key ?? ''),
      label: typeof (g as any).label === 'string' ? (g as any).label : String((g as any).group_key ?? ''),
    })) as GroupHeader[]
    const seen = new Set(base.map(g => String(g.group_key)))
    const merged = [...base]

    if (isDateGrouped && plannerVisibility.showSuggestions) {
      for (const s of suggestionsQuery.data ?? []) {
        const key = computeGroupKeyForTask(s as any, effectiveGroupBy)
        if (typeof key !== 'string' || !key.trim()) continue
        if (seen.has(key)) continue
        seen.add(key)
        merged.push({ group_key: key, label: getGroupLabelFromKey(key, effectiveGroupBy) })
      }
    }

    // Merge groups from tasksByGroup (optimistic adds, e.g. future month with no meta yet).
    const tasksByGroup = groupTasksQuery.tasksByGroup ?? {}
    for (const key of Object.keys(tasksByGroup)) {
      if (!key || seen.has(key)) continue
      const rows = tasksByGroup[key] ?? []
      const label =
        rows.length > 0
          ? computeGroupLabelForTask(rows[0] as any, effectiveGroupBy)
          : getGroupLabelFromKey(key, effectiveGroupBy)
      seen.add(key)
      merged.push({ group_key: key, label })
    }

    // For project/assignee, group_key is numeric-like ("90","100"); localeCompare sorts wrong
    // ("100" < "90") and overwrites meta's label order. Use meta order as source of truth.
    const hasNumericLikeKeys = effectiveGroupBy === 'project' || effectiveGroupBy === 'assigned_to'
    if (!hasNumericLikeKeys) {
      merged.sort((a: any, b: any) => {
        const cmp = String(a.group_key).localeCompare(String(b.group_key))
        return groupOrder === 'desc' ? -cmp : cmp
      })
    }
    return merged
  }, [
    isGroupedView,
    groupMetaQuery.groups,
    isDateGrouped,
    plannerVisibility.showSuggestions,
    suggestionsQuery.data,
    effectiveGroupBy,
    groupOrder,
    groupTasksQuery.tasksByGroup,
  ])

  // Query-shape key from primitives only (stable across hydration / URL normalization).
  const queryShapeKey = React.useMemo(
    () =>
      JSON.stringify({
        q: q ?? '',
        project: project ?? '',
        filters: stableFiltersKey,
        groupBy: effectiveGroupBy ?? '',
        groupOrder: effectiveGroupOrder,
        sortBy,
        sortOrder,
      }),
    [q, project, stableFiltersKey, effectiveGroupBy, effectiveGroupOrder, sortBy, sortOrder],
  )

  // Store scroll element in state so the virtualizer attaches reliably on first paint.
  // (Ref-only caused broken initial range and "scroll up then down" to trigger fetch.)
  const [scrollEl, setScrollEl] = React.useState<HTMLElement | null>(null)
  const scrollRootRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const el = document.querySelector('[data-task-scroll-container]') as HTMLElement | null
    setScrollEl(el)
    scrollRootRef.current = el
  }, [])

  const toggleGroup = React.useCallback(
    (groupKey: string) => {
      setCollapsedGroups(prev => {
        const next = new Set(prev)
        if (!next.has(groupKey)) {
          next.add(groupKey)
        } else {
          next.delete(groupKey)
        }
        return next
      })
    },
    [],
  )

  // Reset collapsed groups & all group task state only when the query shape really changes.
  // Depends only on queryShapeKey (stable primitives) so we don't reset after first paint due to
  // hydration (groupOrder null → 'asc'), Zustand init, or URL key order.
  useEffect(() => {
    if (prevQueryShapeKeyRef.current !== queryShapeKey) {
      prevQueryShapeKeyRef.current = queryShapeKey
      setCollapsedGroups(new Set())
      resetAllRef.current()
      queueMicrotask(() => {
        scrollRootRef.current?.scrollTo?.({ top: 0 })
      })
    }
  }, [queryShapeKey])

  const blockingGroupKey = useMemo(() => {
    const collapsed = collapsedGroups
    const nextCursorByGroup = groupTasksQuery.cursorByGroup
    const loadedFirstPageByGroup = groupTasksQuery.loadedFirstPageByGroup

    return computeBlockingGroupKey({
      groups,
      collapsedGroups: collapsed,
      nextCursorByGroup,
      loadedFirstPageByGroup,
    })
  }, [groups, collapsedGroups, groupTasksQuery.cursorByGroup, groupTasksQuery.loadedFirstPageByGroup])

  // Meta runway fetch policy: keep at least ~30 headers, and also ensure we have enough
  // headers to show blocking + runway without flashing.
  useEffect(() => {
    if (!isGroupedView) return
    if (!groupMetaQuery.hasMore) return
    if (groupMetaQuery.isFetching) return

    const blockingIdx =
      blockingGroupKey != null
        ? groupMetaQuery.groups.findIndex(g => String((g as any).group_key) === String(blockingGroupKey))
        : -1
    const target = Math.max(META_RUNWAY_GROUPS, 0)

    if ((groupMetaQuery.groups?.length ?? 0) < target) {
      groupMetaQuery.fetchNextPage()
    }
  }, [
    isGroupedView,
    groupMetaQuery.groups,
    groupMetaQuery.hasMore,
    groupMetaQuery.isFetching,
    groupMetaQuery.fetchNextPage,
    blockingGroupKey,
  ])

  const nextExpandedGroupKey = useMemo(() => {
    return computeNextExpandedGroupKeyAfter({
      groups,
      afterGroupKey: blockingGroupKey,
      collapsedGroups,
    })
  }, [groups, blockingGroupKey, collapsedGroups])

  const revealedGroups = useMemo(() => {
    if (!groups.length) return []
    // When no blocking group, all expanded groups are drained → show all groups.
    if (!blockingGroupKey) return groups

    const blockingIdx = groups.findIndex(g => String(g.group_key) === String(blockingGroupKey))
    if (blockingIdx === -1) return groups.slice(0, 1)

    const base = groups.slice(0, blockingIdx + 1)
    if (!nextExpandedGroupKey) return base

    const nextMeta = groups.find(g => String(g.group_key) === String(nextExpandedGroupKey))
    const nextLoadedCount = (groupTasksQuery.tasksByGroup[nextExpandedGroupKey]?.length ?? 0)
    const nextPrefetched = !!groupTasksQuery.prefetchedFirstPageByGroup[nextExpandedGroupKey]
    const nextLoadedFirstPage = !!groupTasksQuery.loadedFirstPageByGroup[nextExpandedGroupKey]

    // Reveal next group header when: it has rows, or we're prefetching it, or we've loaded first page (even if empty).
    const canRevealNext =
      nextLoadedCount > 0 || nextPrefetched || (nextLoadedFirstPage && nextLoadedCount === 0)

    return canRevealNext ? [...base, nextMeta!].filter(Boolean) : base
  }, [
    groups,
    blockingGroupKey,
    nextExpandedGroupKey,
    groupTasksQuery.tasksByGroup,
    groupTasksQuery.prefetchedFirstPageByGroup,
    groupTasksQuery.loadedFirstPageByGroup,
  ])

  // Row fetch policy (core invariant):
  // - Only fetch rows for the blocking group (high priority) until drained.
  // - Optionally prefetch the *first page* for the next expanded group (low priority).
  // - NEVER fetch rows for more than 2 groups at once (enforced by only targeting 1 + optional 1).
  useEffect(() => {
    const starterKey =
      blockingGroupKey ??
      (groups.find(g => !collapsedGroups.has(String(g.group_key)))?.group_key
        ? String(groups.find(g => !collapsedGroups.has(String(g.group_key)))!.group_key)
        : null)

    const starterIsCollapsed = starterKey ? collapsedGroups.has(starterKey) : false
    const loadedFirstPage = starterKey ? !!groupTasksQuery.loadedFirstPageByGroup[starterKey] : false
    const fetching = starterKey ? !!groupTasksQuery.isFetchingByGroup[starterKey] : false
    const hasMore = starterKey ? groupTasksQuery.hasMoreByGroup[starterKey] : undefined

    if (DEBUG_GROUPED_TASKS) {
      console.log('[UnifiedGroupedTaskList] starter ensureFirstPage effect', {
        groupsLen: groups.length,
        revealedGroupsLen: revealedGroups.length,
        blockingGroupKey,
        starterKey,
        starterIsCollapsed,
        loadedFirstPage,
        fetching,
        hasMore,
        effectiveGroupBy,
        isGroupedView,
      })
    }

    if (!starterKey) return
    if (starterIsCollapsed) return
    if (loadedFirstPage) return

    if (process.env.NODE_ENV === 'development' && (effectiveGroupBy === 'project' || effectiveGroupBy === 'assigned_to')) {
      const firstFromArray = groups[0]?.group_key
      console.log('[UnifiedGroupedTaskList] first tasks fetch uses groups[0] order', {
        firstFromArray,
        starterKey,
        match: firstFromArray === starterKey,
      })
    }
    // Always make sure the blocking group has started.
    groupTasksQuery.ensureFirstPage(starterKey)
  }, [
    blockingGroupKey,
    groups,
    collapsedGroups,
    revealedGroups.length,
    groupTasksQuery.loadedFirstPageByGroup,
    groupTasksQuery.isFetchingByGroup,
    groupTasksQuery.hasMoreByGroup,
    groupTasksQuery.ensureFirstPage,
    effectiveGroupBy,
    isGroupedView,
  ])

  // C) Prefetch next group first page sooner (but keep concurrency capped):
  // Only start prefetch once the blocking group has loaded its first page and
  // no drain fetch is in-flight for the blocking group.
  useEffect(() => {
    if (!blockingGroupKey) return
    if (!nextExpandedGroupKey) return

    const blockingLoadedFirst = !!groupTasksQuery.loadedFirstPageByGroup[blockingGroupKey]
    if (!blockingLoadedFirst) return

    const blockingFetching = !!groupTasksQuery.isFetchingByGroup[blockingGroupKey]
    if (blockingFetching) return

    const nextHasAnyRows = (groupTasksQuery.tasksByGroup[nextExpandedGroupKey]?.length ?? 0) > 0
    if (nextHasAnyRows) return

    const nextLoadedFirst = !!groupTasksQuery.loadedFirstPageByGroup[nextExpandedGroupKey]
    const nextPrefetched = !!groupTasksQuery.prefetchedFirstPageByGroup[nextExpandedGroupKey]
    if (nextLoadedFirst || nextPrefetched) return

    groupTasksQuery.ensureFirstPage(nextExpandedGroupKey)
  }, [
    blockingGroupKey,
    nextExpandedGroupKey,
    groupTasksQuery.loadedFirstPageByGroup,
    groupTasksQuery.prefetchedFirstPageByGroup,
    groupTasksQuery.isFetchingByGroup,
    groupTasksQuery.tasksByGroup,
    groupTasksQuery.ensureFirstPage,
  ])

  const flattenedItems: FlattenedItem[] = useMemo(() => {
    const result: FlattenedItem[] = []

    const blockingIdx =
      blockingGroupKey != null ? groups.findIndex(g => String(g.group_key) === String(blockingGroupKey)) : -1

    const starterKey =
      blockingGroupKey ??
      (groups.find(g => !collapsedGroups.has(String(g.group_key)))?.group_key
        ? String(groups.find(g => !collapsedGroups.has(String(g.group_key)))!.group_key)
        : null)

    const isUngroupedSingleAll =
      groups.length === 1 && String(groups[0]?.group_key) === 'all'

    for (const group of revealedGroups) {
      const groupKey = String(group.group_key)
      const label = group.label
      const isExpanded = isGroupExpanded(groupKey)
      const groupIdx = groups.findIndex(g => String(g.group_key) === groupKey)
      const isAfterBlocking = blockingIdx !== -1 && groupIdx > blockingIdx

      if (!isUngroupedSingleAll) {
        result.push({
          type: 'group',
          groupKey,
          label,
          isExpanded,
          isAfterBlocking,
          taskCount: group.task_count,
        })
      }

      const shouldRenderRows = computeShouldRenderRows({
        groupKey,
        groups,
        blockingGroupKey,
        collapsedGroups,
      })

      if (!isExpanded || !shouldRenderRows) {
        // Header-only for collapsed groups and for future groups after the blocking group.
        continue
      }

      const rowsForGroup = groupTasksQuery.tasksByGroup[String(groupKey)] ?? []
      const suggestionsForGroup =
        plannerVisibility.showSuggestions ? suggestionsByGroupKey.get(String(groupKey)) ?? [] : []
      const optimisticForGroup =
        plannerVisibility.showTasks ? optimisticTasksByGroupKey.get(String(groupKey)) ?? [] : []

      if (DEBUG_GROUPED_TASKS && starterKey && groupKey === starterKey) {
        const showsLoadingRow =
          suggestionsForGroup.length === 0 && optimisticForGroup.length === 0 && rowsForGroup.length === 0
        console.log('[UnifiedGroupedTaskList] flattenedItems starter diagnostics', {
          starterKey,
          shouldRenderRowsForStarter: shouldRenderRows,
          rowsLen: rowsForGroup.length,
          showsLoadingRow,
          suggestionsLen: suggestionsForGroup.length,
          optimisticLen: optimisticForGroup.length,
        })
      }

      if (suggestionsForGroup.length === 0 && optimisticForGroup.length === 0 && rowsForGroup.length === 0) {
        // Expanded + allowed to render rows, but nothing loaded yet.
        result.push({ type: 'loading', groupKey })
        continue
      }

      for (const s of suggestionsForGroup) {
        const mapped = mapTaskListRowToTableFormat(s as any) as any
        mapped.kind = 'suggestion'
        mapped.entity_type = 'suggestion'
        mapped.entity_id = Number((s as any).entity_id ?? (s as any).id)
        mapped.briefing = (s as any).briefing ?? null
        mapped.channel_ids = (s as any).channel_ids ?? []
        mapped.source_key = (s as any).source_key ?? null
        result.push({ type: 'task', task: mapped, groupKey })

        const isMainTask = mapped.content_type_id === 39 || mapped.content_type_id === '39'
        const isExpandedMain = isMainTask && !!expandedMainTasks?.has?.(mapped.id)
        if (isExpandedMain && onTaskSelect && Number.isFinite(Number(mapped.id))) {
          result.push({ type: 'subtasks', groupKey, parentId: Number(mapped.id) })
        }
      }

      if (plannerVisibility.showTasks) {
        for (const t of optimisticForGroup) {
          const task = mapTaskListRowToTableFormat(t as any) as any
          task.kind = 'task'
          task.entity_type = 'task'
          task.entity_id = Number((t as any).entity_id ?? (t as any).id)
          task.source_key = (t as any).source_key ?? null
          task.projectLogoUrl = getImageUrl((task as any).project_logo ?? (task as any).projects?.logo)
          task.assignedToPhotoUrl = getImageUrl(
            (task as any).assigned_to_photo ?? (task as any).assigned_user?.photo,
          )
          result.push({ type: 'task', task, groupKey })

          const isMainTask = task.content_type_id === 39 || task.content_type_id === '39'
          const isExpandedMain = isMainTask && !!expandedMainTasks?.has?.(task.id)
          if (isExpandedMain && onTaskSelect && Number.isFinite(Number(task.id))) {
            result.push({ type: 'subtasks', groupKey, parentId: Number(task.id) })
          }
        }
        for (const row of rowsForGroup) {
          const task = mapTaskListRowToTableFormat(row as any) as any
          task.kind = 'task'
          task.entity_type = 'task'
          task.entity_id = Number((row as any).entity_id ?? (row as any).id)
          task.source_key = (row as any).source_key ?? null
          // Add derived URLs (storage path -> public URL) for TaskList column renderers.
          // This avoids per-cell recompute and keeps grouped/ungrouped behavior consistent.
          task.projectLogoUrl = getImageUrl((task as any).project_logo ?? (task as any).projects?.logo)
          task.assignedToPhotoUrl = getImageUrl(
            (task as any).assigned_to_photo ?? (task as any).assigned_user?.photo,
          )
          result.push({ type: 'task', task, groupKey })

          const isMainTask = task.content_type_id === 39 || task.content_type_id === '39'
          const isExpandedMain = isMainTask && !!expandedMainTasks?.has?.(task.id)
          if (isExpandedMain && onTaskSelect && Number.isFinite(Number(task.id))) {
            result.push({ type: 'subtasks', groupKey, parentId: Number(task.id) })
          }
        }
      }
    }

    return result
  }, [
    groups,
    revealedGroups,
    blockingGroupKey,
    collapsedGroups,
    groupTasksQuery.tasksByGroup,
    isGroupExpanded,
    plannerVisibility.showSuggestions,
    plannerVisibility.showTasks,
    suggestionsByGroupKey,
    optimisticTasksByGroupKey,
    expandedMainTasks,
    onTaskSelect,
  ])

  const allTasks = useMemo(
    () => flattenedItems.filter(item => item.type === 'task').map(item => (item as any).task),
    [flattenedItems],
  )

  const table = useReactTable<any>({
    data: allTasks,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: row => `${String((row as any).entity_type)}:${String((row as any).entity_id)}`,
  })
  const hasTasks = allTasks.length > 0

  // --- Virtualization --------------------------------------------------------
  // We virtualize `flattenedItems` (headers + rows) inside <tbody> using
  // the spacer-row pattern recommended for tables:
  // - render a top spacer row with height = padding before first virtual row
  // - render ONLY the virtual rows
  // - render a bottom spacer row for remaining height
  //
  // This keeps a real <table> layout (horizontal scroll works) while avoiding
  // rendering thousands of <tr>s.
  const rowVirtualizer = useVirtualizer({
    count: flattenedItems.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => VIRTUAL_ROW_ESTIMATE_PX,
    overscan: VIRTUAL_OVERSCAN,
    getItemKey: (index) => {
      const it = flattenedItems[index]
      return it ? getFlattenedItemKey(it) : `idx-${index}`
    },
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const paddingTop = virtualRows.length ? virtualRows[0]!.start : 0
  const paddingBottom = virtualRows.length
    ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1]!.end
    : 0

  // Last index in flattenedItems that belongs to the blocking group (excluding group header).
  // Precomputed so range-based fetch is O(1) per run instead of O(n); avoids "group never drains" bugs.
  const blockingGroupLastRowIndex = useMemo(() => {
    if (!blockingGroupKey) return -1
    for (let i = flattenedItems.length - 1; i >= 0; i--) {
      const it = flattenedItems[i]
      if (it && it.groupKey === blockingGroupKey && it.type !== 'group') return i
    }
    return -1
  }, [flattenedItems, blockingGroupKey])

  // --- Range-based fetching -------------------------------------------------
  // Fetching is driven by the virtualized range (data), not scrollHeight. When the last
  // visible index is within FETCH_AHEAD_ROWS of the end of the blocking group, we fetch more.
  // Fill viewport: when not filled and not fetching and hasMore → fetchMore; re-check after fetch settles.
  useEffect(() => {
    const activeDrainKey = blockingGroupKey
    if (!activeDrainKey) return
    if (!isGroupExpanded(activeDrainKey)) return

    const loadedFirst = !!groupTasksQuery.loadedFirstPageByGroup[activeDrainKey]
    const fetching = !!groupTasksQuery.isFetchingByGroup[activeDrainKey]
    const hasMore = groupTasksQuery.hasMoreByGroup[activeDrainKey] ?? true

    if (!loadedFirst) {
      if (!fetching) groupTasksQuery.ensureFirstPage(activeDrainKey)
      return
    }

    if (!hasMore || fetching) return

    // Fill viewport: keep draining until content fills the scroll area (re-runs when fetch settles).
    if (scrollEl) {
      const bufferPx = 250
      const filled = rowVirtualizer.getTotalSize() >= scrollEl.clientHeight + bufferPx
      if (!filled) {
        groupTasksQuery.fetchMore(activeDrainKey)
        return
      }
    }

    // Range-based trigger: if user is within FETCH_AHEAD_ROWS of end of blocking group, fetch more.
    const lastVirtualIndex = virtualRows.at(-1)?.index ?? 0
    if (
      blockingGroupLastRowIndex !== -1 &&
      lastVirtualIndex >= blockingGroupLastRowIndex - FETCH_AHEAD_ROWS
    ) {
      groupTasksQuery.fetchMore(activeDrainKey)
    }
  }, [
    blockingGroupKey,
    blockingGroupLastRowIndex,
    isGroupExpanded,
    scrollEl,
    flattenedItems.length,
    virtualRows,
    rowVirtualizer,
    groupTasksQuery.loadedFirstPageByGroup,
    groupTasksQuery.isFetchingByGroup,
    groupTasksQuery.hasMoreByGroup,
    groupTasksQuery.cursorByGroup,
    groupTasksQuery.ensureFirstPage,
    groupTasksQuery.fetchMore,
  ])

  const rowVirtualizerRef = useRef(rowVirtualizer)
  rowVirtualizerRef.current = rowVirtualizer
  // Re-measure rows after structural changes (expand/collapse, filters) to avoid blank gaps or late jumps.
  useEffect(() => {
    rowVirtualizerRef.current.measure()
  }, [collapsedGroups, expandedMainTasks, flattenedItems.length])

  return (
    <>
      {paddingTop > 0 && (
        <tr aria-hidden="true" data-row-type="padding" className="task-row" style={{ gridTemplateColumns }}>
          <td colSpan={columns.length} className="task-cell-span-full" style={{ height: paddingTop, padding: 0 }} />
        </tr>
      )}

      {virtualRows.map(vRow => {
        const item = flattenedItems[vRow.index]
        if (!item) return null

        const key = getFlattenedItemKey(item)

        if (item.type === 'group') {
          const titleColIndex = (columns as any[]).findIndex(c => (c.id ?? c.accessorKey) === 'title')
          const titleCol1Based = titleColIndex >= 0 ? titleColIndex + 1 : 1
          return (
            <tr
              key={key}
              data-index={vRow.index}
              ref={rowVirtualizer.measureElement}
              data-row-type="group"
              className="task-row group-header bg-white border-b border-gray-200 border-t-2 sticky top-9 z-10"
              style={{ gridTemplateColumns }}
            >
              {/* Empty cells for columns before title (e.g. select) */}
              {titleColIndex > 0 &&
                Array.from({ length: titleColIndex }).map((_, i) => (
                  <td key={`group-pad-${i}`} className="task-cell bg-white border-r border-gray-100 p-0" />
                ))}
              {/* Title column: group label, sticky-left like Title */}
              <td
                className="task-cell task-cell--sticky task-group-label px-3 py-3 bg-white border-r border-gray-100"
                data-col="title"
              >
                <button
                  type="button"
                  onClick={e => {
                    e.preventDefault()
                    e.stopPropagation()
                    toggleGroup(item.groupKey)
                  }}
                  className="w-full flex items-center gap-2 text-left"
                >
                  {item.isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="font-semibold truncate max-w-xs">{item.label}</span>
                </button>
              </td>
              {/* Span rest of row */}
              <td
                className="task-cell task-cell-span-rest bg-white"
                style={{ gridColumn: `${titleCol1Based + 1} / -1` }}
              />
            </tr>
          )
        }

        if (item.type === 'loading') {
          return (
            <tr
              key={key}
              data-index={vRow.index}
              data-row-type="loading"
              ref={rowVirtualizer.measureElement}
              className="task-row border-b"
              style={{ gridTemplateColumns }}
            >
              <td colSpan={columns.length} className="task-cell task-cell-span-full px-3 py-3 text-sm text-muted-foreground">
                Loading tasks...
              </td>
            </tr>
          )
        }

        if (item.type === 'subtasks') {
          // Subtasks are one virtualized item per expanded main task; height is measured as one block.
          // Nested table keeps column alignment; if horizontal overflow/column mismatch appears, use a <div> list instead.
          // When subtasks load async, measureElement + rowVirtualizer.measure() keep heights correct.
          return (
            <tr
              key={key}
              data-index={vRow.index}
              ref={rowVirtualizer.measureElement}
              className="task-row border-b"
              style={{ gridTemplateColumns }}
            >
              <td colSpan={columns.length} className="task-cell task-cell-span-full p-0">
                <div>
                  <table className="task-list-grid w-full">
                    <tbody>
                      <SubtaskRows
                        parentId={item.parentId}
                        taskColumns={columns as any[]}
                        gridTemplateColumns={gridTemplateColumns}
                        onTaskSelect={onTaskSelect as any}
                        selectedTaskId={selectedTaskId}
                        isMobile={false}
                        isMultiselectMode={isMultiselectMode}
                        selectedTasks={selectedTasks}
                        onTaskToggle={onTaskToggle}
                      />
                    </tbody>
                  </table>
                </div>
              </td>
            </tr>
          )
        }

        // item.type === 'task'
        const task = item.task
        const rowId = `${String((task as any).entity_type)}:${String((task as any).entity_id)}`
        const tableRow = table.getRow(rowId)

        if (!tableRow) {
          return (
            <tr
              key={key}
              data-index={vRow.index}
              data-row-type="task"
              ref={rowVirtualizer.measureElement}
              onClick={(e) => {
                if ((e.target as Element)?.closest?.('[data-inline-editor]')) return
                onTaskSelect?.(task)
              }}
              className={cn(
                'task-row hover:bg-gray-50 cursor-pointer border-b',
                selectedTaskId &&
                  selectedEntityType === String((task as any).entity_type) &&
                  String(selectedTaskId) === String((task as any).entity_id) &&
                  'bg-gray-100',
              )}
              style={{ gridTemplateColumns }}
            >
              {(() => {
                const realCols = (columns as any[]).filter(c => (c.id ?? c.accessorKey) !== '__spacer')
                const spacerCols = (columns as any[]).filter(c => (c.id ?? c.accessorKey) === '__spacer')
                const orderedCols = [...realCols, ...spacerCols]
                return orderedCols.map((col, colIndex) => {
                  const colId = col.id ?? col.accessorKey
                  const isSpacer = colId === '__spacer'
                  const isLastRealBeforeSpacer = !isSpacer && spacerCols.length > 0 && colIndex === realCols.length - 1
                  return (
                    <td
                      key={colId ?? colIndex}
                      data-col={colId}
                      className={cn(
                        'task-cell text-sm border-b align-middle',
                        colId !== 'project_statuses' && 'truncate',
                        isSpacer && 'task-spacer-cell p-0 border-transparent',
                        !isSpacer && 'px-3 py-2',
                        !isSpacer && !isLastRealBeforeSpacer && 'border-r border-gray-100',
                        colId === 'title' && 'task-cell--sticky',
                      )}
                    >
                      {!isSpacer && flexRender(col.cell || col.accessorKey, {
                        getValue: () => (task as any)[col.accessorKey],
                        row: { original: task },
                        column: col,
                      })}
                    </td>
                  )
                })
              })()}
            </tr>
          )
        }

        const isSelected =
          !!(
            selectedTaskId &&
            selectedEntityType === String((task as any).entity_type) &&
            String(selectedTaskId) === String((task as any).entity_id)
          )

        return (
          <tr
            key={key}
            data-index={vRow.index}
            data-row-type="task"
            ref={rowVirtualizer.measureElement}
            onClick={(e) => {
              if ((e.target as Element)?.closest?.('[data-inline-editor]')) return
              onTaskSelect?.(task)
            }}
            className={cn(
              'task-row hover:bg-gray-50 cursor-pointer border-b',
              isSelected && 'bg-gray-100',
            )}
            style={{ gridTemplateColumns }}
          >
            {(() => {
              const cells = tableRow.getVisibleCells()
              const realCells = cells.filter(c => c.column.id !== '__spacer')
              const spacerCells = cells.filter(c => c.column.id === '__spacer')
              const orderedCells = [...realCells, ...spacerCells]
              return orderedCells.map((cell, cellIdx) => {
                const isSpacer = cell.column.id === '__spacer'
                const isLastRealBeforeSpacer = !isSpacer && spacerCells.length > 0 && cellIdx === realCells.length - 1
                return (
                  <td
                    key={cell.id}
                    data-col={cell.column.id}
                    className={cn(
                      'task-cell text-sm border-b align-middle',
                      cell.column.id !== 'project_statuses' && 'truncate',
                      isSpacer && 'task-spacer-cell p-0 border-transparent',
                      !isSpacer && 'px-3 py-2',
                      !isSpacer && !isLastRealBeforeSpacer && 'border-r border-gray-100',
                      cell.column.id === 'title' && 'task-cell--sticky',
                    )}
                  >
                    {!isSpacer && flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                )
              })
            })()}
          </tr>
        )
      })}

      {paddingBottom > 0 && (
        <tr aria-hidden="true" data-row-type="padding" className="task-row" style={{ gridTemplateColumns }}>
          <td colSpan={columns.length} className="task-cell-span-full" style={{ height: paddingBottom, padding: 0 }} />
        </tr>
      )}

      {/* For initial load or refetches caused by sort/search/group changes */}
      {groupMetaQuery.isFetching && !hasTasks && (
        <tr data-row-type="loading" className="task-row" style={{ gridTemplateColumns }}>
          <td colSpan={columns.length} className="task-cell task-cell-span-full text-center text-gray-400 py-4">
            Loading tasks...
          </td>
        </tr>
      )}
    </>
  )
}

