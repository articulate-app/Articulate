"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Loader2, X, ChevronUp, ChevronDown, Search } from "lucide-react"
import { format } from "date-fns"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { useProjectActivityFeedInfinite } from "../../hooks/use-project-activity-feed-infinite"
import { ActivityLogDetailsPane } from "./ActivityLogDetailsPane"
import { TaskDetails } from "../tasks/TaskDetails"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { UserAvatar } from "../UserAvatar"
import { getImageUrl } from "../../lib/public-media"
import {
  listProjectActivityDistinctActions,
  type ProjectActivityFeedRow,
  type ProjectActivityFeedSortConfig,
  type ProjectActivityFeedSortField,
  type ProjectActivityFeedFilters,
} from "../../lib/services/project-activity"
import { getFilterOptions } from "../../lib/services/filters"
import { getProjectStatuses } from "../../lib/services/projectStatuses"
import { MultiSelect } from "../ui/multi-select"
import { DateRangePicker } from "../ui/date-range-picker"
import { FilterBadges } from "../../../components/ui/filter-badges"

const STATUS_FIELD_KEYS = ["project_status", "status", "project_status_id", "project_statuses"]

function StatusPill({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: color, color: "#fff" }}
    >
      {name}
    </span>
  )
}

interface ActivityTabProps {
  projectId: number
}

const PAGE_SIZE = 50

const SORT_FIELDS: { field: ProjectActivityFeedSortField; label: string }[] = [
  { field: "timestamp", label: "Timestamp" },
  { field: "assigned_to_name", label: "User" },
  { field: "title", label: "Event" },
  { field: "title", label: "Action" },
]

/** Event column: title (bold text); when task event, show task title; when planner run, show suggestions created */
function renderEventCell(log: ProjectActivityFeedRow): React.ReactNode {
  const title = log.title || "—"
  const isTaskEvent = log.entity_type === "task" && log.task_name
  const details = log.details_json ?? {}
  const isPlannerRun = /planner\s+run\s+completed/i.test(title) && typeof details.suggestions_created === "number"
  const suggestionsText = isPlannerRun ? `${details.suggestions_created} suggestion${details.suggestions_created === 1 ? "" : "s"} created` : null

  const suffix = isTaskEvent ? log.task_name : suggestionsText
  const fullText = suffix ? `${title} · ${suffix}` : title

  return (
    <span className="font-medium text-gray-900 truncate block min-w-0" title={fullText}>
      {suffix ? (
        <>
          {title}
          <span className="text-gray-500 font-normal"> · {suffix}</span>
        </>
      ) : (
        title
      )}
    </span>
  )
}

/** Action column: summary + status pills (secondary content) */
function renderActionCell(
  log: ProjectActivityFeedRow,
  statusById: Map<number, { name: string; color: string }>,
  statusByName: Map<string, { name: string; color: string }>
): React.ReactNode {
  const changed = log.changed
  const changedFields = log.changed_fields ?? (changed ? Object.keys(changed) : [])

  const resolveStatus = (v: unknown): { name: string; color: string } | null => {
    if (v === null || v === undefined) return null
    const id = typeof v === "number" ? v : typeof v === "string" ? parseInt(String(v), 10) : null
    if (id != null && !Number.isNaN(id)) {
      const byId = statusById.get(id)
      if (byId) return byId
    }
    const str = typeof v === "string" ? v.trim() : String(v)
    if (str) return statusByName.get(str) ?? statusByName.get(str.toLowerCase()) ?? null
    return null
  }

  const formatVal = (v: unknown): string => {
    if (v === null || v === undefined) return "—"
    if (typeof v === "boolean") return v ? "Yes" : "No"
    if (typeof v === "number") return String(v)
    if (typeof v === "string") return v
    return String(v)
  }

  const statusField = changedFields.find((f) =>
    STATUS_FIELD_KEYS.some((k) => f.toLowerCase() === k.toLowerCase())
  )
  let statusPills: React.ReactNode = null
  if (statusField && changed) {
    const entry = changed[statusField]
    const oldStatus = entry ? resolveStatus(entry.old) : null
    const newStatus = entry ? resolveStatus(entry.new) : null
    statusPills = (
      <span className="flex items-center gap-1.5 flex-wrap">
        {oldStatus ? <StatusPill name={oldStatus.name} color={oldStatus.color} /> : entry?.old != null ? <span className="text-xs">{formatVal(entry.old)}</span> : null}
        {(oldStatus || newStatus || entry?.old != null || entry?.new != null) && <span className="text-gray-400 text-xs">→</span>}
        {newStatus ? <StatusPill name={newStatus.name} color={newStatus.color} /> : entry?.new != null ? <span className="text-xs">{formatVal(entry.new)}</span> : null}
      </span>
    )
  }

  return (
    <div className="flex flex-row items-center gap-2 min-w-0 whitespace-nowrap overflow-hidden">
      {log.summary && <span className="text-sm text-gray-600 truncate">{log.summary}</span>}
      {statusPills}
    </div>
  )
}

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

  return (
    <div className="flex flex-col h-full flex-1 min-h-0">
      <TaskDetails
        isCollapsed={false}
        selectedTask={taskData.task}
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

function SortableHeader({
  field,
  label,
  sort,
  onSortChange,
}: {
  field: ProjectActivityFeedSortField
  label: string
  sort: ProjectActivityFeedSortConfig
  onSortChange: (field: ProjectActivityFeedSortField) => void
}) {
  const isActive = sort.field === field
  const handleClick = () => onSortChange(field)
  return (
    <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 select-none relative min-w-0">
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center gap-1 cursor-pointer hover:bg-gray-50 w-full text-left font-medium"
      >
        <span>{label}</span>
        {isActive ? (
          sort.direction === "asc" ? (
            <ChevronUp className="w-4 h-4 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 shrink-0" />
          )
        ) : (
          <div className="w-4 h-4 shrink-0" />
        )}
      </button>
    </th>
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
    field: "timestamp",
    direction: "desc",
  })

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

  const { logs, isLoading, isFetchingNextPage, hasMore, error, fetchNextPage, loadMoreRef } =
    useProjectActivityFeedInfinite({ projectId, pageSize: PAGE_SIZE, sort, filters: effectiveFilters })

  const selectedLog = selectedLogUid ? logs.find((l) => l.uid === selectedLogUid) ?? null : null

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

  const { data: filterOptions } = useQuery({
    queryKey: ["filter-options"],
    queryFn: getFilterOptions,
    staleTime: 60_000,
  })

  const { data: actionOptions } = useQuery({
    queryKey: ["project-activity-actions", projectId],
    queryFn: () => listProjectActivityDistinctActions(projectId),
    enabled: !!projectId,
  })

  const { data: projectStatuses } = useQuery({
    queryKey: ["project-statuses", projectId],
    queryFn: async () => {
      const { data } = await getProjectStatuses(projectId)
      return data ?? []
    },
    enabled: !!projectId,
  })

  const { statusById, statusByName } = useMemo(() => {
    const byId = new Map<number, { name: string; color: string }>()
    const byName = new Map<string, { name: string; color: string }>()
    for (const s of projectStatuses ?? []) {
      byId.set(s.id, { name: s.name, color: s.color })
      byName.set(s.name, { name: s.name, color: s.color })
      byName.set(s.name.toLowerCase(), { name: s.name, color: s.color })
    }
    return { statusById: byId, statusByName: byName }
  }, [projectStatuses])

  const userOptions = useMemo(
    () => (filterOptions?.users ?? []).map((u) => ({ id: String(u.value), label: u.label })),
    [filterOptions?.users]
  )

  const actionSelectOptions = useMemo(
    () => (actionOptions ?? []).map((a) => ({ id: a, label: a })),
    [actionOptions]
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

  const handleSortChange = useCallback((field: ProjectActivityFeedSortField) => {
    setSort((prev) => ({
      field,
      direction: prev.field === field ? (prev.direction === "asc" ? "desc" : "asc") : "desc",
    }))
  }, [])

  // Load more pages when URL points to a log not yet loaded
  useEffect(() => {
    if (!logUidFromUrl || selectedLog) return
    if (isFetchingNextPage) return
    const found = logs.some((l) => l.uid === logUidFromUrl)
    if (found) return
    if (hasMore) {
      fetchNextPage()
    } else {
      setSelectedLogUid(null)
      setSelectedTaskId(null)
      updateUrl(null, null)
    }
  }, [logUidFromUrl, selectedLog, logs, hasMore, isFetchingNextPage, fetchNextPage, updateUrl])

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
  const colCount = 4
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
        <div className="flex flex-col gap-3 mb-4 pt-6 pl-6 pr-6">
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
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse table-fixed" style={{ minWidth: 600 }}>
            <colgroup>
              <col style={{ width: "24%" }} />
              <col style={{ width: "24%" }} />
              <col style={{ width: "28%" }} />
              <col style={{ width: "24%" }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
              <tr>
                <SortableHeader field="timestamp" label="Timestamp" sort={sort} onSortChange={handleSortChange} />
                <SortableHeader field="assigned_to_name" label="User" sort={sort} onSortChange={handleSortChange} />
                <SortableHeader field="title" label="Event" sort={sort} onSortChange={handleSortChange} />
                <SortableHeader field="title" label="Action" sort={sort} onSortChange={handleSortChange} />
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr>
                  <td colSpan={colCount} className="px-3 py-4 text-center text-red-600">
                    Failed to load activity log.
                  </td>
                </tr>
              )}
              {!error && logs.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={colCount} className="px-3 py-8 text-center text-gray-500">
                    No activity found
                  </td>
                </tr>
              )}
              {logs.map((log) => {
                const photoUrl = getImageUrl(log.assigned_to_photo)
                const userDisplay = log.assigned_to_name ?? `User ${log.user_id}`
                return (
                  <tr
                    key={log.uid}
                    onClick={() => handleLogSelect(log)}
                    className={`border-b border-gray-100 cursor-pointer transition-colors h-14 ${
                      selectedLogUid === log.uid ? "bg-blue-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="px-3 py-2 text-sm text-gray-600 align-middle">
                      {format(new Date(log.timestamp), "PPp")}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-900 align-middle">
                      <div className="flex items-center gap-2 min-w-0">
                        <UserAvatar name={userDisplay} photoUrl={photoUrl} size="sm" />
                        <span className="truncate">{userDisplay}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-900 align-middle overflow-hidden">
                      <div className="truncate">{renderEventCell(log)}</div>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-900 align-middle overflow-hidden">
                      {renderActionCell(log, statusById, statusByName)}
                    </td>
                  </tr>
                )
              })}
              {isFetchingNextPage && (
                <tr>
                  <td colSpan={colCount} className="px-3 py-2 text-center">
                    <Loader2 className="w-4 h-4 animate-spin inline text-gray-400" />
                  </td>
                </tr>
              )}
              {hasMore && (
                <tr>
                  <td colSpan={colCount} className="p-0">
                    <div ref={loadMoreRef} className="h-1" />
                  </td>
                </tr>
              )}
              {!hasMore && logs.length > 0 && (
                <tr>
                  <td colSpan={colCount} className="px-3 py-2 text-center text-gray-400 text-sm">
                    No more logs
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
