"use client"

import { useState, useEffect, useMemo } from "react"
import { X, Filter } from "lucide-react"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { ScrollArea } from "../ui/scroll-area"
import { MultiSelect } from "../ui/multi-select"
import { DateRangePicker } from "../ui/date-range-picker"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { cn } from "@/lib/utils"
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { SlidePanel } from "../ui/slide-panel"
import { useTaskListEditBootstrap } from "../../hooks/use-task-list-edit-bootstrap"
import { taskListEditBootstrapToFilterOptions } from "../../lib/services/task-list-edit-bootstrap"
import type { FilterOptions } from "../../lib/services/filters"
import { useTasksUI } from "../../store/tasks-ui"
import { useCurrentUserStore } from "../../store/current-user"
import { buildFilterSearchParams } from "../../lib/tasks-filter-url"

interface TaskFiltersProps {
  isOpen: boolean
  onClose: () => void
  onApplyFilters: (mappedFilters: TaskFilters, displayFilters: TaskFilters) => void
  activeFilters: TaskFilters
  filterOptions?: FilterOptions // Optional prop to avoid network calls
  noWrapper?: boolean // If true, don't render SlidePanel wrapper
  /** When true, hide the Project filter control (e.g. when already scoped to a project). */
  hideProjectFilter?: boolean
  /** When true, hide Assigned To (e.g. when already scoped to a user). */
  hideAssigneeFilter?: boolean
  /**
   * Canonical commit: same pipeline as pills. When provided, Apply/Clear call this instead of
   * onApplyFilters + syncFiltersToUrl. Must update URL (router.replace) + store (setFilters)
   * so task_group_tasks_filtered / task_group_meta_paged_filtered refetch.
   * If plannerVisibility is passed, caller must write it into the URL in the same replace
   * so we avoid a second replace (syncPlannerToUrl) overwriting filter params.
   */
  commitFilters?: (
    newFilters: TaskFilters,
    plannerVisibility?: { showTasks: boolean; showSuggestions: boolean }
  ) => void
}

export interface TaskFilters {
  assignedTo: string[]
  status: string[]
  deliveryDate: { from?: Date; to?: Date }
  publicationDate: { from?: Date; to?: Date }
  project: string[]
  contentType: string[]
  productionType: string[]
  language: string[]
  channels: string[]
  overdueStatus: string[]
}

interface FilterOption {
  id: string
  label: string
  color?: string
}

export function TaskFilters({ isOpen, onClose, onApplyFilters, activeFilters, filterOptions, noWrapper = false, hideProjectFilter = false, hideAssigneeFilter = false, commitFilters }: TaskFiltersProps) {
  const [filters, setFilters] = useState<TaskFilters>(activeFilters)
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const supabase = createClientComponentClient()
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const currentUserId = useCurrentUserStore((state) => state.publicUserId)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data?.session?.access_token ?? null)
    })
  }, [supabase])
  const plannerVisibility = useTasksUI((s) => s.plannerVisibility)
  const setPlannerVisibility = useTasksUI((s) => s.setPlannerVisibility)
  const [contentVisibility, setContentVisibility] = useState<{ showTasks: boolean; showSuggestions: boolean }>(
    plannerVisibility,
  )

  // Fetch filter options only when panel is open and no valid filterOptions prop provided
  const hasValidFilterOptions = filterOptions && 
    filterOptions.statuses && filterOptions.statuses.length > 0 &&
    filterOptions.projects && filterOptions.projects.length > 0
  const shouldFetchOptions = isOpen && !hasValidFilterOptions
  const { data: listEditBootstrapRaw, isLoading: isOptionsLoading } = useTaskListEditBootstrap(accessToken, {
    enabled: shouldFetchOptions && !!accessToken,
  })
  const fetchedOptions = useMemo(
    () => (listEditBootstrapRaw ? taskListEditBootstrapToFilterOptions(listEditBootstrapRaw) : undefined),
    [listEditBootstrapRaw]
  )

  // Use provided filterOptions or fallback to fetched options
  const options = filterOptions || fetchedOptions

  // Sync local draft with canonical state when pane opens (activeFilters = URL/store)
  useEffect(() => {
    if (isOpen) {
      setFilters(activeFilters)
      setContentVisibility(plannerVisibility)
    }
  }, [isOpen, activeFilters, plannerVisibility])

  const syncPlannerToUrl = (next: { showTasks: boolean; showSuggestions: boolean }) => {
    const newParams = new URLSearchParams(params.toString())
    if (next.showTasks && next.showSuggestions) {
      newParams.delete('showTasks')
      newParams.delete('showSuggestions')
    } else if (next.showTasks && !next.showSuggestions) {
      newParams.delete('showTasks')
      newParams.set('showSuggestions', 'false')
    } else if (!next.showTasks && next.showSuggestions) {
      newParams.set('showTasks', 'false')
      newParams.delete('showSuggestions')
    } else {
      newParams.delete('showTasks')
      newParams.delete('showSuggestions')
    }
    router.replace(`${pathname}?${newParams.toString()}`, { scroll: false })
  }

  const emptyFilters: TaskFilters = {
    assignedTo: [],
    status: [],
    deliveryDate: {},
    publicationDate: {},
    project: [],
    contentType: [],
    productionType: [],
    language: [],
    channels: [],
    overdueStatus: []
  }

  const applyQuickFilter = (kind: "due_today" | "assigned_to_me" | "delivery_overdue" | "publication_overdue") => {
    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    const shouldSetAssignee =
      !hideAssigneeFilter && (kind === "assigned_to_me" || kind === "due_today")
    const nextFilters: TaskFilters = {
      ...emptyFilters,
      assignedTo:
        shouldSetAssignee && currentUserId != null ? [String(currentUserId)] : [],
      deliveryDate:
        kind === "due_today"
          ? {
              from: startOfToday,
              to: endOfToday,
            }
          : {},
      overdueStatus:
        kind === "delivery_overdue"
          ? ["delivery_overdue"]
          : kind === "publication_overdue"
          ? ["publication_overdue"]
          : [],
    }
    setFilters(nextFilters)
    if (commitFilters) {
      commitFilters(nextFilters, contentVisibility)
      setPlannerVisibility(contentVisibility)
      onClose()
    } else {
      onApplyFilters(nextFilters, nextFilters)
      setPlannerVisibility(contentVisibility)
      onClose()
    }
  }

  const writeFiltersToUrlAndStoreLegacy = (newFilters: TaskFilters) => {
    const newParams = buildFilterSearchParams(new URLSearchParams(params.toString()), newFilters)
    router.replace(`${pathname}?${newParams.toString()}`, { scroll: false })
  }

  const handleApplyFilters = () => {
    if (commitFilters) {
      commitFilters(filters, contentVisibility)
      setPlannerVisibility(contentVisibility)
      onClose()
    } else {
      onApplyFilters(filters, filters)
      writeFiltersToUrlAndStoreLegacy(filters)
      setPlannerVisibility(contentVisibility)
      syncPlannerToUrl(contentVisibility)
    }
  }

  const handleClearFilters = () => {
    setFilters(emptyFilters)
    setContentVisibility({ showTasks: true, showSuggestions: false })
    if (commitFilters) {
      commitFilters(emptyFilters, { showTasks: true, showSuggestions: false })
      setPlannerVisibility({ showTasks: true, showSuggestions: false })
      onClose()
    } else {
      onApplyFilters(emptyFilters, emptyFilters)
      writeFiltersToUrlAndStoreLegacy(emptyFilters)
      setPlannerVisibility({ showTasks: true, showSuggestions: false })
      syncPlannerToUrl({ showTasks: true, showSuggestions: false })
    }
  }

  if (!isOpen) return null

  const filterContent = (
    <>
      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyQuickFilter("due_today")}
                className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
              >
                Due today
              </button>
              {!hideAssigneeFilter ? (
                <button
                  type="button"
                  onClick={() => applyQuickFilter("assigned_to_me")}
                  className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                >
                  Assigned to me
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => applyQuickFilter("delivery_overdue")}
                className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
              >
                Delivery overdue
              </button>
              <button
                type="button"
                onClick={() => applyQuickFilter("publication_overdue")}
                className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
              >
                Publication overdue
              </button>
            </div>
          </div>

          {!hideAssigneeFilter && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Assigned To</label>
            <MultiSelect
              options={(options?.users || []).map(u => ({ id: u.value, label: u.label }))}
              value={filters.assignedTo}
              onChange={vals => setFilters(f => ({ ...f, assignedTo: vals }))}
            />
          </div>
          )}

          {/* Status - Using deduplicated status names */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <MultiSelect
              options={(options?.statuses || []).map(s => ({ 
                id: s.value,
                label: s.label, 
                color: s.color,
                visualCategory: 'status' as const,
              }))}
              value={filters.status}
              onChange={vals => setFilters(f => ({ ...f, status: vals }))}
            />
          </div>

          {/* Delivery Date */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Delivery Date</label>
            <DateRangePicker
              value={filters.deliveryDate}
              onChange={(range) => setFilters({ ...filters, deliveryDate: range })}
            />
          </div>

          {/* Publication Date */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Publication Date</label>
            <DateRangePicker
              value={filters.publicationDate}
              onChange={(range) => setFilters({ ...filters, publicationDate: range })}
            />
          </div>

          {/* Project - hidden when hideProjectFilter (e.g. project-scoped workspace) */}
          {!hideProjectFilter && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Project</label>
              <MultiSelect
                options={(options?.projects || []).map(p => ({
                  id: p.value,
                  label: p.label,
                  color: p.color,
                  logo: p.logo,
                  visualCategory: 'project' as const,
                }))}
                value={filters.project}
                onChange={vals => setFilters(f => ({ ...f, project: vals }))}
              />
            </div>
          )}

          {/* Content Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Content Type</label>
            <MultiSelect
              options={(options?.contentTypes || []).map(c => ({ id: c.value, label: c.label }))}
              value={filters.contentType}
              onChange={vals => setFilters(f => ({ ...f, contentType: vals }))}
            />
          </div>

          {/* Production Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Production Type</label>
            <MultiSelect
              options={(options?.productionTypes || []).map(pt => ({ id: pt.value, label: pt.label }))}
              value={filters.productionType}
              onChange={vals => setFilters(f => ({ ...f, productionType: vals }))}
            />
          </div>

          {/* Language */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Language</label>
            <MultiSelect
              options={(options?.languages || []).map(l => ({ id: l.value, label: l.label }))}
              value={filters.language}
              onChange={vals => setFilters(f => ({ ...f, language: vals }))}
            />
          </div>

          {/* Channels */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Channels</label>
            <MultiSelect
              options={[
                { id: 'facebook', label: 'Facebook' },
                { id: 'youtube', label: 'YouTube' },
                { id: 'instagram', label: 'Instagram' },
                { id: 'twitter', label: 'Twitter' },
                { id: 'linkedin', label: 'LinkedIn' }
              ]}
              value={filters.channels}
              onChange={(value) => setFilters({ ...filters, channels: value })}
              placeholder="Select channels..."
            />
          </div>

          {/* Overdue Status */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Overdue Status</label>
            <MultiSelect
              options={[
                { id: 'delivery_overdue', label: 'Delivery overdue' },
                { id: 'publication_overdue', label: 'Publication overdue' }
              ]}
              value={filters.overdueStatus}
              onChange={vals => setFilters(f => ({ ...f, overdueStatus: vals }))}
            />
          </div>
        </div>
      </ScrollArea>
      {/* Footer */}
      <div className="flex items-center justify-between border-t p-4">
        <Button variant="ghost" onClick={handleClearFilters}>
          Clear All
        </Button>
        <Button onClick={handleApplyFilters}>Apply Filters</Button>
      </div>
    </>
  )

  if (noWrapper) {
    return filterContent
  }

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      position="right"
      className="w-full max-w-md"
      title="Filters"
    >
      {filterContent}
    </SlidePanel>
  )
} 