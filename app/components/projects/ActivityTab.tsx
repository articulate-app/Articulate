"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Loader2, X, Search } from "lucide-react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { useProjectActivityFeedInfinite } from "../../hooks/use-project-activity-feed-infinite"
import { ActivityLogDetailsPane } from "./ActivityLogDetailsPane"
import { TaskDetails } from "../tasks/TaskDetails"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import {
  type ProjectActivityFeedRow,
  type ProjectActivityFeedSortConfig,
  type ProjectActivityFeedFilters,
} from "../../lib/services/project-activity"
import { ProjectActivityFeedList } from "./project-activity-feed-list"
import { useFilterOptions } from "../../hooks/use-filter-options"
import { MultiSelect } from "../ui/multi-select"
import { DateRangePicker } from "../ui/date-range-picker"
import { FilterBadges } from "../../../components/ui/filter-badges"

interface ActivityTabProps {
  projectId: number
}

const PAGE_SIZE = 100

function TaskDetailsPane({ taskId, onClose }: { taskId: number; onClose: () => void }) {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)

  useEffect(() => {
    const getUserData = async () => {
      const supabase = createClientComponentClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { data: { session } } = await supabase.auth.getSession()
      setCurrentUser(user)
      setAccessToken(session?.access_token || null)
    }
    getUserData()
  }, [])

  const { data: taskData, isLoading, error } = useQuery({
    queryKey: ["task", taskId, accessToken],
    queryFn: async () => {
      const supabase = createClientComponentClient()
      const { data, error } = await supabase.functions.invoke(`task-details-bootstrap?task_id=${taskId}`)
      if (error) throw error
      return data
    },
    enabled: !!taskId && !!accessToken,
  })

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500">Loading task...</div>
      </div>
    )
  }

  if (error || !taskData?.task) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500">Task not found</div>
      </div>
    )
  }

  const mergedTask = { ...(taskData.task || {}), ...taskData }

  return (
    <div className="flex flex-col h-full flex-1 min-h-0">
      <TaskDetails
        isCollapsed={false}
        selectedTask={mergedTask}
        onClose={onClose}
        onCollapse={onClose}
        isExpanded={false}
        attachments={taskData.attachments || []}
        mentions={taskData.mentions || []}
        watchers={taskData.watchers || []}
        currentUser={currentUser}
        subtasks={taskData.subtasks || []}
        project_watchers={taskData.project_watchers || []}
        accessToken={accessToken}
      />
    </div>
  )
}

const ACTIVITY_FILTER_KEYS = ["activitySearch", "activityUser", "activityAction", "activityFrom", "activityTo"] as const

function parseFiltersFromUrl(searchParams: URLSearchParams): ProjectActivityFeedFilters {
  const search = searchParams.get("activitySearch")?.trim() || null
  const userIdsRaw = searchParams.get("activityUser")
  const userIds = userIdsRaw
    ? userIdsRaw.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n))
    : null
  const actionsRaw = searchParams.get("activityAction")
  const actions = actionsRaw ? actionsRaw.split(",").map((s) => s.trim()).filter(Boolean) : null
  const from = searchParams.get("activityFrom") || null
  const to = searchParams.get("activityTo") || null
  return {
    search: search || undefined,
    userIds: userIds?.length ? userIds : undefined,
    actions,
    fromTimestamp: from || undefined,
    toTimestamp: to || undefined,
  }
}

function filtersToUrlParams(filters: ProjectActivityFeedFilters | null): Record<string, string> {
  const params: Record<string, string> = {}
  if (filters?.search) params.activitySearch = filters.search
  if (filters?.userIds?.length) params.activityUser = filters.userIds.join(",")
  if (filters?.actions?.length) params.activityAction = filters.actions.join(",")
  if (filters?.fromTimestamp) params.activityFrom = filters.fromTimestamp
  if (filters?.toTimestamp) params.activityTo = filters.toTimestamp
  return params
}

export function ActivityTab({ projectId }: ActivityTabProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const logUidFromUrl = searchParams.get("selectedLogUid")
  const taskIdFromUrl = searchParams.get("selectedTaskId")
  const parsedTaskId = taskIdFromUrl ? parseInt(taskIdFromUrl, 10) : null

  const [selectedLogUid, setSelectedLogUid] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [sort, setSort] = useState<ProjectActivityFeedSortConfig>({
    field: "created_at",
    direction: "desc",
  })
  const [activityFeed, setActivityFeed] = useState<ProjectActivityFeedRow[]>([])

  const filtersFromUrl = useMemo(
    () => parseFiltersFromUrl(new URLSearchParams(searchParams.toString())),
    [searchParams]
  )

  const [searchInput, setSearchInput] = useState(filtersFromUrl.search ?? "")
  const [filters, setFilters] = useState<ProjectActivityFeedFilters | null>(() =>
    filtersFromUrl.search || filtersFromUrl.userIds?.length || filtersFromUrl.actions?.length || filtersFromUrl.fromTimestamp || filtersFromUrl.toTimestamp
      ? filtersFromUrl
      : null
  )

  useEffect(() => {
    const f = parseFiltersFromUrl(new URLSearchParams(searchParams.toString()))
    setSearchInput(f.search ?? "")
    const hasFilters = f.search || f.userIds?.length || f.actions?.length || f.fromTimestamp || f.toTimestamp
    setFilters(hasFilters ? f : null)
  }, [searchParams])

  const effectiveFilters = useMemo((): ProjectActivityFeedFilters | null => {
    if (!filters) return null
    const f: ProjectActivityFeedFilters = {}
    if (filters.search) f.search = filters.search
    if (filters.userIds?.length) f.userIds = filters.userIds
    if (filters.actions?.length) f.actions = filters.actions
    if (filters.fromTimestamp) f.fromTimestamp = filters.fromTimestamp
    if (filters.toTimestamp) f.toTimestamp = filters.toTimestamp
    return Object.keys(f).length ? f : null
  }, [filters])

  const { logs, isLoading, isFetchingNextPage, hasMore, error, fetchNextPage } =
    useProjectActivityFeedInfinite({ projectId, pageSize: PAGE_SIZE, sort, filters: effectiveFilters })

  useEffect(() => {
    const mapped = logs.map((row) => ({
      ...row,
      event: row.event ?? row.title,
      action: row.action ?? "",
      timestamp: row.created_at ?? row.timestamp ?? null,
      assigned_to_name: row.assigned_to_name ?? row.assigned_to_email ?? "System",
      assigned_to_photo: row.assigned_to_photo ?? null,
    }))
    setActivityFeed(mapped)
  }, [logs])

  const selectedLog = selectedLogUid ? activityFeed.find((l) => l.uid === selectedLogUid) ?? null : null

  const updateUrl = useCallback(
    (logUid: string | null, taskId: number | null, filterOverrides?: Partial<ProjectActivityFeedFilters> | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (logUid) params.set("selectedLogUid", logUid)
      else params.delete("selectedLogUid")
      if (taskId != null) params.set("selectedTaskId", String(taskId))
      else params.delete("selectedTaskId")
      const mergedFilters = filterOverrides ?? effectiveFilters
      const filterParams = filtersToUrlParams(mergedFilters)
      for (const k of ACTIVITY_FILTER_KEYS) params.delete(k)
      for (const [k, v] of Object.entries(filterParams)) params.set(k, v)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams, effectiveFilters]
  )

  const { data: filterOptions } = useFilterOptions()

  const userOptions = useMemo(
    () => (filterOptions?.users ?? []).map((u) => ({ id: String(u.value), label: u.label })),
    [filterOptions?.users]
  )

  const actionSelectOptions = useMemo(
    () =>
      Array.from(
        new Set(
          activityFeed
            .map((log) => (log.event ?? log.title)?.trim())
            .filter((title): title is string => Boolean(title)),
        ),
      )
        .sort((a, b) => a.localeCompare(b))
        .map((a) => ({ id: a, label: a })),
    [activityFeed]
  )

  const applySearch = useCallback(() => {
    const next = searchInput.trim() || null
    const newFilters: ProjectActivityFeedFilters = next ? { ...effectiveFilters, search: next } : { ...effectiveFilters }
    if (!newFilters.search && !newFilters.userIds?.length && !newFilters.actions?.length && !newFilters.fromTimestamp && !newFilters.toTimestamp) {
      setFilters(null)
      updateUrl(selectedLogUid, selectedTaskId, null)
    } else {
      if (!newFilters.search) delete newFilters.search
      setFilters(newFilters)
      updateUrl(selectedLogUid, selectedTaskId, newFilters)
    }
  }, [searchInput, effectiveFilters, selectedLogUid, selectedTaskId, updateUrl])

  const handleFiltersChange = useCallback(
    (newFilters: ProjectActivityFeedFilters | null) => {
      setFilters(newFilters)
      setSearchInput(newFilters?.search ?? "")
      updateUrl(selectedLogUid, selectedTaskId, newFilters)
    },
    [selectedLogUid, selectedTaskId, updateUrl]
  )

  const clearFilters = useCallback(() => {
    setSearchInput("")
    setFilters(null)
    updateUrl(selectedLogUid, selectedTaskId, null)
  }, [selectedLogUid, selectedTaskId, updateUrl])

  // Load more pages when URL points to a log not yet loaded
  useEffect(() => {
    if (!logUidFromUrl || selectedLog) return
    if (isFetchingNextPage) return
    const found = activityFeed.some((l) => l.uid === logUidFromUrl)
    if (found) return
    if (hasMore) {
      fetchNextPage()
    } else {
      setSelectedLogUid(null)
      setSelectedTaskId(null)
      updateUrl(null, null)
    }
  }, [logUidFromUrl, selectedLog, activityFeed, hasMore, isFetchingNextPage, fetchNextPage, updateUrl])

  useEffect(() => {
    if (logUidFromUrl !== selectedLogUid) setSelectedLogUid(logUidFromUrl)
    if (parsedTaskId !== selectedTaskId && Number.isFinite(parsedTaskId)) setSelectedTaskId(parsedTaskId)
  }, [logUidFromUrl, parsedTaskId])

  const handleLogSelect = (log: ProjectActivityFeedRow) => {
    setSelectedLogUid(log.uid)
    setSelectedTaskId(null)
    updateUrl(log.uid, null)
  }

  const handleLogClose = () => {
    setSelectedLogUid(null)
    setSelectedTaskId(null)
    updateUrl(null, null)
  }

  const handleTaskSelect = (taskId: number) => {
    setSelectedTaskId(taskId)
    updateUrl(selectedLogUid, taskId)
  }

  const handleTaskClose = () => {
    setSelectedTaskId(null)
    updateUrl(selectedLogUid, null)
  }

  const rightPadding = selectedLogUid ? (selectedTaskId ? 768 : 384) : 0
  const hasActiveFilters = !!(
    effectiveFilters?.search ||
    effectiveFilters?.userIds?.length ||
    effectiveFilters?.actions?.length ||
    effectiveFilters?.fromTimestamp ||
    effectiveFilters?.toTimestamp
  )

  const activityFilterBadges = useMemo(() => {
    if (!effectiveFilters) return []
    const badges: Array<{ id: string; label: string; value: string; onRemove: () => void }> = []
    if (effectiveFilters.search) {
      badges.push({
        id: "search",
        label: "Search",
        value: effectiveFilters.search,
        onRemove: () => {
          const next = { ...effectiveFilters, search: undefined }
          handleFiltersChange(Object.keys(next).filter((k) => (next as Record<string, unknown>)[k] != null).length ? next : null)
        },
      })
    }
    ;(effectiveFilters.userIds ?? []).forEach((id) => {
      const opt = userOptions.find((u) => String(u.id) === String(id))
      badges.push({
        id: `user-${id}`,
        label: "User",
        value: opt?.label ?? `User ${id}`,
        onRemove: () => {
          const ids = (effectiveFilters!.userIds ?? []).filter((n) => n !== id)
          handleFiltersChange(ids.length ? { ...effectiveFilters!, userIds: ids } : { ...effectiveFilters!, userIds: undefined } as ProjectActivityFeedFilters)
        },
      })
    })
    ;(effectiveFilters.actions ?? []).forEach((action) => {
      const displayLabel = action
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ")
      badges.push({
        id: `event-${action}`,
        label: "Event",
        value: displayLabel,
        onRemove: () => {
          const actions = (effectiveFilters!.actions ?? []).filter((a) => a !== action)
          handleFiltersChange(actions.length ? { ...effectiveFilters!, actions } : { ...effectiveFilters!, actions: undefined } as ProjectActivityFeedFilters)
        },
      })
    })
    if (effectiveFilters.fromTimestamp) {
      badges.push({
        id: "date-from",
        label: "Date from",
        value: new Date(effectiveFilters.fromTimestamp).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
        onRemove: () => {
          const next = { ...effectiveFilters, fromTimestamp: undefined }
          handleFiltersChange(Object.keys(next).filter((k) => (next as Record<string, unknown>)[k] != null).length ? next : null)
        },
      })
    }
    if (effectiveFilters.toTimestamp) {
      badges.push({
        id: "date-to",
        label: "Date to",
        value: new Date(effectiveFilters.toTimestamp).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
        onRemove: () => {
          const next = { ...effectiveFilters, toTimestamp: undefined }
          handleFiltersChange(Object.keys(next).filter((k) => (next as Record<string, unknown>)[k] != null).length ? next : null)
        },
      })
    }
    return badges
  }, [effectiveFilters, userOptions, handleFiltersChange])

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        className="flex-1 flex flex-col min-h-0 transition-all duration-200"
        style={{ marginRight: rightPadding }}
      >
        <div className="px-6 pt-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">Activity</h2>
          </div>
        </div>
        <div className="flex flex-col gap-3 mb-4 px-6">
          <div
            className="grid items-center gap-2"
            style={{ gridTemplateColumns: "24% 24% 28% 24% auto" }}
          >
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search activity…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applySearch()}
                onBlur={applySearch}
                className="pl-9"
              />
            </div>
            <MultiSelect
              options={userOptions}
              value={effectiveFilters?.userIds?.map(String) ?? []}
              onChange={(v) => {
                const ids = v.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n))
                handleFiltersChange(ids.length ? { ...effectiveFilters, userIds: ids } : { ...effectiveFilters, userIds: undefined } as ProjectActivityFeedFilters)
              }}
              placeholder="User"
              className="w-full min-w-0"
            />
            <MultiSelect
              options={actionSelectOptions}
              value={effectiveFilters?.actions ?? []}
              onChange={(v) =>
                handleFiltersChange(v.length ? { ...effectiveFilters, actions: v } : { ...effectiveFilters, actions: undefined } as ProjectActivityFeedFilters)
              }
              placeholder="Event"
              className="w-full min-w-0"
            />
            <DateRangePicker
              value={{
                from: effectiveFilters?.fromTimestamp ? new Date(effectiveFilters.fromTimestamp) : undefined,
                to: effectiveFilters?.toTimestamp ? new Date(effectiveFilters.toTimestamp) : undefined,
              }}
              onChange={(range) => {
                const from = range?.from?.toISOString() ?? undefined
                const to = range?.to?.toISOString() ?? undefined
                const next = { ...effectiveFilters, fromTimestamp: from, toTimestamp: to }
                if (!from && !to) {
                  delete next.fromTimestamp
                  delete next.toTimestamp
                }
                handleFiltersChange(Object.keys(next).length ? next : null)
              }}
              className="w-full min-w-0"
            />
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
          <FilterBadges
            badges={activityFilterBadges}
            onClearAll={clearFilters}
            className="mt-1 mb-0"
          />
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-6 pb-6">
          {error ? (
            <div className="py-4 text-center text-sm text-red-600">Failed to load activity log.</div>
          ) : null}
          {!error && activityFeed.length === 0 && !isLoading ? (
            <div className="py-8 text-center text-sm text-gray-500">No activity found</div>
          ) : null}
          {activityFeed.length > 0 ? (
            <ProjectActivityFeedList
              logs={activityFeed}
              selectedLogUid={selectedLogUid}
              onSelect={handleLogSelect}
            />
          ) : null}
          {isFetchingNextPage ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          ) : null}
          {hasMore && !isFetchingNextPage ? (
            <div className="flex justify-center py-3">
              <Button variant="ghost" size="sm" onClick={() => fetchNextPage()}>
                Load more
              </Button>
            </div>
          ) : null}
          {!hasMore && activityFeed.length > 0 ? (
            <div className="py-2 text-center text-sm text-gray-400">No more logs</div>
          ) : null}
        </div>
      </div>

      {selectedLog && (
        <div
          className="fixed top-0 bg-white border-l border-gray-200 flex flex-col h-full z-40 shadow-lg"
          style={{ right: selectedTaskId ? 384 : 0, width: 384 }}
        >
          <ActivityLogDetailsPane
            log={selectedLog}
            onClose={handleLogClose}
            onTaskSelect={handleTaskSelect}
          />
        </div>
      )}

      {selectedTaskId && (
        <div
          className="fixed top-0 bg-white border-l border-gray-200 flex flex-col h-full z-50 shadow-lg"
          style={{ right: 0, width: 384 }}
        >
          <TaskDetailsPane taskId={selectedTaskId} onClose={handleTaskClose} />
        </div>
      )}
    </div>
  )
}
