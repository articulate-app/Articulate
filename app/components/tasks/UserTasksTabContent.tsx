"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import {
  Calendar,
  ChevronDown,
  Filter,
  LayoutGrid,
  List,
  Plus,
  Search,
} from "lucide-react"
import { TaskList } from "./TaskList"
import { KanbanView } from "../kanban-view/kanban-view"
import { CalendarView } from "../calendar-view/calendar-view"
import { TasksScopeProvider, useTasksScope } from "../../contexts/tasks-scope-context"
import { useTasksUI } from "../../store/tasks-ui"
import { useTaskEditFields } from "../../hooks/use-task-edit-fields"
import { useTaskListEditBootstrap } from "../../hooks/use-task-list-edit-bootstrap"
import { taskListEditBootstrapToFilterOptions } from "../../lib/services/task-list-edit-bootstrap"
import { useTasksUrlFilters } from "../../hooks/use-tasks-url-filters"
import { GroupingMenuItems, getListGroupByLabelFromParams } from "./grouping-dropdown"
import { InlineSearchInput } from "./InlineSearchInput"
import { FilterBadges } from "../../../components/ui/filter-badges"
import {
  getActiveFilterBadges,
  transformEditFieldsToFilterOptions,
} from "./TasksLayout"
import type { FilterOptions } from "../../lib/services/filters"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useTaskComposerStore } from "../../store/task-composer-store"
import { TaskFilters } from "./TaskFilters"
import { TasksPaneMoreMenu } from "./tasks-pane-more-menu"
import { buildFilterSearchParams } from "../../lib/tasks-filter-url"
import { IconTooltip } from "../ui/icon-tooltip"

const ICON_BTN =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1"

const TOOLBAR_CONTENT_PX = "px-2"

type UserViewMode = "list" | "kanban" | "calendar"

function UserTasksTabContentInner({
  userId,
  onOpenTask,
}: {
  userId: number
  onOpenTask?: (taskId: number) => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const params = useSearchParams()
  const supabase = createClientComponentClient()
  const { scope } = useTasksScope()
  const openComposer = useTaskComposerStore((s) => s.openComposer)

  const isUserScope = scope.type === "user"
  const hiddenGroupByOptions = isUserScope ? (["assigned_to"] as const) : undefined
  const hiddenKanbanGroupByOptions = isUserScope ? ["assignee"] : undefined

  const kanbanToolbarRef = useRef<HTMLDivElement | null>(null)
  const calendarToolbarRef = useRef<HTMLDivElement | null>(null)
  const [toolbarRefReady, setToolbarRefReady] = useState(false)
  const setKanbanToolbarEl = useCallback((el: HTMLDivElement | null) => {
    kanbanToolbarRef.current = el
    if (el) setToolbarRefReady((r) => r || true)
  }, [])
  const setCalendarToolbarEl = useCallback((el: HTMLDivElement | null) => {
    calendarToolbarRef.current = el
    if (el) setToolbarRefReady((r) => r || true)
  }, [])

  const [isFilterPaneOpen, setIsFilterPaneOpen] = useState(false)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (data?.session?.access_token) setAccessToken(data.session.access_token)
    })()
  }, [supabase])

  const {
    selectedTaskId,
    setSelectedTaskId,
    searchValue,
    setSearchValue,
    filters,
    setFilters,
    syncFromUrl,
  } = useTasksUI()

  useEffect(() => {
    syncFromUrl(new URLSearchParams(params.toString()))
  }, [params.toString(), syncFromUrl])

  const urlView = (params.get("userTasksView") || "list") as UserViewMode
  const [viewMode, setViewMode] = useState<UserViewMode>(urlView)
  const [isInlineSearchOpen, setIsInlineSearchOpen] = useState(false)
  const [inlineSearchValue, setInlineSearchValue] = useState("")
  const [isMultiselectMode, setIsMultiselectMode] = useState(false)

  const [listEditBootstrapAfterPaint, setListEditBootstrapAfterPaint] = useState(false)
  useEffect(() => {
    let raf1 = 0
    let raf2 = 0
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setListEditBootstrapAfterPaint(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [])

  useEffect(() => {
    const v = (params.get("userTasksView") || "list") as UserViewMode
    if (v !== viewMode) setViewMode(v)
  }, [params.get("userTasksView"), viewMode])

  const { data: editFields } = useTaskEditFields(accessToken ? accessToken : null)

  const taskComposerCount = useTaskComposerStore((s) => s.composers.length)
  const listEditBootstrapQueryEnabled =
    !!accessToken &&
    (listEditBootstrapAfterPaint || isFilterPaneOpen || isInlineSearchOpen || taskComposerCount > 0)

  const { data: listEditBootstrapRaw } = useTaskListEditBootstrap(accessToken, {
    enabled: listEditBootstrapQueryEnabled,
  })

  const listReferenceFilterOptions = useMemo(
    () => (listEditBootstrapRaw ? taskListEditBootstrapToFilterOptions(listEditBootstrapRaw) : undefined),
    [listEditBootstrapRaw],
  )

  const handleViewModeChange = useCallback(
    (view: UserViewMode) => {
      setViewMode(view)
      const p = new URLSearchParams(params.toString())
      p.set("userTasksView", view)
      router.replace(`${pathname}?${p.toString()}`, { scroll: false })
    },
    [params, pathname, router],
  )

  const handleTaskSelect = useCallback(
    (task: any) => {
      const entityId = Number(task?.entity_id ?? task?.id)
      if (!Number.isFinite(entityId) || entityId <= 0) return
      setSelectedTaskId(String(entityId))
      if (onOpenTask) {
        onOpenTask(entityId)
        return
      }
    },
    [onOpenTask, setSelectedTaskId],
  )

  const onTaskUpdate = useCallback(() => {}, [])

  const currentParams = new URLSearchParams(params.toString())
  const filterOptionsForBadges: FilterOptions | undefined = useMemo(() => {
    const transformed = editFields
      ? transformEditFieldsToFilterOptions(editFields, [])
      : undefined
    if (!transformed) return listReferenceFilterOptions as FilterOptions | undefined
    const merged =
      listReferenceFilterOptions && transformed
        ? { ...listReferenceFilterOptions }
        : { ...transformed }
    return {
      ...merged,
      statuses: transformed.statuses,
      users: transformed.users,
      projects: transformed.projects,
      contentTypes: transformed.contentTypes,
      productionTypes: transformed.productionTypes,
      languages: transformed.languages,
      channels: transformed.channels,
    }
  }, [editFields, listReferenceFilterOptions])

  const urlFilters = useTasksUrlFilters()
  const commitFilters = useCallback(
    (
      newFilters: import("./TaskFilters").TaskFilters,
      plannerVisibility?: { showTasks: boolean; showSuggestions: boolean },
    ) => {
      const newParams = buildFilterSearchParams(new URLSearchParams(params.toString()), newFilters)
      if (plannerVisibility !== undefined) {
        newParams.set("showTasks", plannerVisibility.showTasks ? "true" : "false")
        newParams.set("showSuggestions", plannerVisibility.showSuggestions ? "true" : "false")
      }
      router.replace(`${pathname}?${newParams.toString()}`, { scroll: false })
      setFilters(newFilters)
    },
    [params.toString(), pathname, router, setFilters],
  )

  const { badges, onClearAll } = useMemo(
    () =>
      getActiveFilterBadges(
        filters,
        setFilters,
        router,
        pathname,
        currentParams,
        filterOptionsForBadges,
        false,
        true,
      ),
    [filters, setFilters, router, pathname, currentParams.toString(), filterOptionsForBadges],
  )

  const listGroupBySummary = getListGroupByLabelFromParams(params.get("groupBy"))

  const listOverflowMenu = (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2">
          <span className="min-w-0 truncate">Group by</span>
          <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">{listGroupBySummary}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-[220px]">
          <GroupingMenuItems hiddenGroupByOptions={hiddenGroupByOptions as any} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem
        className="justify-between gap-2"
        onSelect={(e) => {
          e.preventDefault()
          setIsMultiselectMode((v) => !v)
        }}
      >
        <span className="min-w-0 truncate">Multiselect</span>
        <span className="shrink-0 pl-2 text-xs text-muted-foreground">{isMultiselectMode ? "On" : "Off"}</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault()
          setIsFilterPaneOpen(true)
        }}
      >
        Filters
      </DropdownMenuItem>
    </>
  )

  const globalActionsCluster = (
    <div className="ml-1 flex shrink-0 items-center gap-0.5 border-l border-gray-200 pl-2">
      <InlineSearchInput
        isOpen={isInlineSearchOpen}
        value={inlineSearchValue}
        onChange={(value) => {
          setInlineSearchValue(value)
          setSearchValue(value)
          const p = new URLSearchParams(params.toString())
          if (value) p.set("q", value)
          else p.delete("q")
          router.replace(`${pathname}?${p.toString()}`, { scroll: false })
        }}
        onClose={() => {
          setIsInlineSearchOpen(false)
          setInlineSearchValue("")
          setSearchValue("")
          const p = new URLSearchParams(params.toString())
          p.delete("q")
          router.replace(`${pathname}?${p.toString()}`, { scroll: false })
        }}
        className="ml-0"
      />
      <IconTooltip label="Search tasks">
        <button
          type="button"
          className={ICON_BTN}
          aria-label="Search tasks"
          onClick={() => {
            setIsInlineSearchOpen((prev) => !prev)
            if (!isInlineSearchOpen) setInlineSearchValue("")
          }}
        >
          <Search className="h-4 w-4" />
        </button>
      </IconTooltip>
      <IconTooltip label="Filter tasks">
        <button
          type="button"
          className={ICON_BTN}
          aria-label="Filter tasks"
          onClick={() => setIsFilterPaneOpen(true)}
        >
          <Filter className="h-4 w-4" />
        </button>
      </IconTooltip>
      <IconTooltip label="Add task">
        <button
          type="button"
          className={ICON_BTN}
          aria-label="Add task"
          onClick={() => openComposer({ assigned_to_id: String(userId) })}
        >
          <Plus className="h-4 w-4" />
        </button>
      </IconTooltip>
      {viewMode === "list" ? (
        <TasksPaneMoreMenu align="end" ariaLabel="More list actions">
          {listOverflowMenu}
        </TasksPaneMoreMenu>
      ) : null}
    </div>
  )

  const viewLabel = viewMode === "list" ? "List" : viewMode === "kanban" ? "Kanban" : "Calendar"
  const ViewIcon = viewMode === "list" ? List : viewMode === "kanban" ? LayoutGrid : Calendar

  const viewPill = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="ml-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded px-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          aria-label="View mode"
        >
          <ViewIcon className="h-4 w-4" />
          <span>{viewLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        <DropdownMenuItem onClick={() => handleViewModeChange("list")}>
          <List className="mr-2 h-4 w-4" />
          List
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleViewModeChange("kanban")}>
          <LayoutGrid className="mr-2 h-4 w-4" />
          Kanban
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleViewModeChange("calendar")}>
          <Calendar className="mr-2 h-4 w-4" />
          Calendar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  // Keep selectedTaskId for highlight; actual open is via onOpenTask (center pane tab).

  return (
    <div className="flex h-full min-h-[28rem] w-full flex-col overflow-hidden bg-white">
      <div
        className={cn(
          "flex h-14 min-h-14 w-full flex-shrink-0 flex-nowrap items-center overflow-x-auto overflow-y-hidden border-b border-gray-200 bg-white",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center overflow-x-auto overflow-y-hidden py-2",
            TOOLBAR_CONTENT_PX,
          )}
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="flex w-max flex-nowrap items-center">
            {viewPill}
            {viewMode === "kanban" && (
              <div ref={setKanbanToolbarEl} className="ml-2 flex flex-nowrap items-center gap-2" />
            )}
            {viewMode === "calendar" && (
              <div ref={setCalendarToolbarEl} className="ml-2 flex flex-nowrap items-center gap-2" />
            )}
          </div>
        </div>
        <div className={cn("flex flex-shrink-0 items-center", TOOLBAR_CONTENT_PX)}>
          {globalActionsCluster}
        </div>
      </div>

      <TaskFilters
        isOpen={isFilterPaneOpen}
        onClose={() => setIsFilterPaneOpen(false)}
        onApplyFilters={(next) => {
          setFilters(next)
          setIsFilterPaneOpen(false)
        }}
        activeFilters={filters}
        filterOptions={filterOptionsForBadges}
        hideAssigneeFilter={isUserScope}
        commitFilters={commitFilters}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {viewMode === "list" && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className={cn("w-full flex-shrink-0", TOOLBAR_CONTENT_PX)}>
                <FilterBadges badges={badges} onClearAll={onClearAll} className="mb-2 ml-2 mt-1" />
              </div>
              <div className="min-h-0 flex-1">
                <TaskList
                  onTaskSelect={handleTaskSelect}
                  selectedTaskId={selectedTaskId}
                  editFields={editFields}
                  isMultiselectMode={isMultiselectMode}
                  onToggleMultiselect={() => setIsMultiselectMode((v) => !v)}
                />
              </div>
            </div>
          )}
          {viewMode === "kanban" && (
            <div className="h-full">
              <KanbanView
                searchValue={searchValue}
                filters={urlFilters}
                selectedTaskId={selectedTaskId}
                onTaskSelect={handleTaskSelect}
                onOptimisticUpdate={onTaskUpdate}
                enabled
                hideToolbar
                toolbarContainerRef={kanbanToolbarRef}
                hiddenGroupByOptions={hiddenKanbanGroupByOptions}
              />
            </div>
          )}
          {viewMode === "calendar" && (
            <div className="h-full">
              <CalendarView
                onTaskClick={handleTaskSelect}
                selectedTaskId={selectedTaskId}
                selectedTask={null}
                searchValue={searchValue}
                onOptimisticUpdate={onTaskUpdate}
                enabled
                hideToolbar
                toolbarContainerRef={calendarToolbarRef}
                hideViewToggle
              />
            </div>
          )}
        </div>
      </div>
      {/* Satisfy toolbarRefReady for portal mounts */}
      {toolbarRefReady ? null : null}
    </div>
  )
}

export type UserTasksTabContentProps = {
  userId: number
  onOpenTask?: (taskId: number) => void
  className?: string
}

export function UserTasksTabContent({ userId, onOpenTask, className }: UserTasksTabContentProps) {
  const value = useMemo(
    () => ({
      scope: { type: "user" as const, userId },
      basePath: "/tasks",
      preserveQueryKeys: { centerTab: "tasks" },
    }),
    [userId],
  )

  return (
    <TasksScopeProvider value={value}>
      <div className={cn("min-h-0 flex-1", className)}>
        <UserTasksTabContentInner userId={userId} onOpenTask={onOpenTask} />
      </div>
    </TasksScopeProvider>
  )
}
