"use client"

/**
 * Full Task List as a workspace tab (left / middle / right).
 * Same page chrome as Projects / Inbox — headline, search, New task —
 * with TaskList / Kanban / Calendar filling the remaining height.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Calendar, ChevronDown, LayoutGrid, List } from "lucide-react"
import { TaskList } from "../tasks/TaskList"
import { KanbanView } from "../kanban-view/kanban-view"
import { CalendarView } from "../calendar-view/calendar-view"
import { useTasksUI } from "../../store/tasks-ui"
import { useTaskEditFields } from "../../hooks/use-task-edit-fields"
import { useTaskListEditBootstrap } from "../../hooks/use-task-list-edit-bootstrap"
import { taskListEditBootstrapToFilterOptions } from "../../lib/services/task-list-edit-bootstrap"
import { useTasksUrlFilters } from "../../hooks/use-tasks-url-filters"
import { GroupingMenuItems, getListGroupByLabelFromParams } from "../tasks/grouping-dropdown"
import { FilterBadges } from "../../../components/ui/filter-badges"
import {
  getActiveFilterBadges,
  transformEditFieldsToFilterOptions,
} from "../tasks/TasksLayout"
import type { FilterOptions } from "../../lib/services/filters"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useTaskComposerStore } from "../../store/task-composer-store"
import { TaskFilters, type TaskFilters as TaskFiltersState } from "../tasks/TaskFilters"
import { FilterCascadingDropdown } from "../tasks/FilterCascadingDropdown"
import { TasksPaneMoreMenu } from "../tasks/tasks-pane-more-menu"
import { buildFilterSearchParams } from "../../lib/tasks-filter-url"
import { openTaskDetailFromTaskList } from "../../lib/open-task-from-task-list"
import type { WorkspacePaneId } from "../../lib/workspace-view"
import { WorkspaceHostPaneProvider } from "./workspace-host-pane-context"
import { shallowReplaceSearchParams } from "../../lib/tasks-shallow-nav"
import {
  WorkspacePageAddButton,
  WorkspacePageSearchInput,
  WorkspacePageShell,
} from "./workspace-page-shell"
import { useCurrentUserStore } from "../../store/current-user"
import { IconTooltip } from "../ui/icon-tooltip"
import { TASK_LIST_CONTENT_COLUMN_CLASS } from "../../lib/chat-content-column"

type TaskListViewMode = "list" | "kanban" | "calendar"
type TaskScopePill = "all" | "my_tasks" | "due_soon"

const EMPTY_TASK_FILTERS: TaskFiltersState = {
  assignedTo: [],
  status: [],
  deliveryDate: {},
  publicationDate: {},
  project: [],
  contentType: [],
  productionType: [],
  language: [],
  channels: [],
  overdueStatus: [],
}

function startOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function isSameLocalDay(a?: Date, b?: Date) {
  if (!a || !b) return false
  return toDateKey(a) === toDateKey(b)
}

function WorkspaceTaskListViewInner({ paneId }: { paneId: WorkspacePaneId }) {
  const pathname = usePathname()
  const router = useRouter()
  const params = useSearchParams()
  const supabase = createClientComponentClient()
  const openComposer = useTaskComposerStore((s) => s.openComposer)
  const publicUserId = useCurrentUserStore((s) => s.publicUserId)

  const kanbanToolbarRef = useRef<HTMLDivElement | null>(null)
  const calendarToolbarRef = useRef<HTMLDivElement | null>(null)
  const [bulkActionsHost, setBulkActionsHost] = useState<HTMLDivElement | null>(null)
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

  const urlView = (params.get("tasksView") || "list") as TaskListViewMode
  const [viewMode, setViewMode] = useState<TaskListViewMode>(urlView)
  const [pageSearchValue, setPageSearchValue] = useState(
    () => params.get("q")?.trim() || searchValue || "",
  )
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
    const v = (params.get("tasksView") || params.get("topView") || "list") as TaskListViewMode
    setViewMode((prev) => (prev === v ? prev : v))
  }, [params])

  useEffect(() => {
    const next = params.get("q")?.trim() || ""
    setPageSearchValue((current) => (current === next ? current : next))
  }, [params])

  const { data: editFields } = useTaskEditFields(accessToken ? accessToken : null)

  const taskComposerCount = useTaskComposerStore((s) => s.composers.length)
  const listEditBootstrapQueryEnabled =
    !!accessToken &&
    (listEditBootstrapAfterPaint || isFilterPaneOpen || pageSearchValue.length > 0 || taskComposerCount > 0)

  const { data: listEditBootstrapRaw } = useTaskListEditBootstrap(accessToken, {
    enabled: listEditBootstrapQueryEnabled,
  })

  const listReferenceFilterOptions = useMemo(
    () => (listEditBootstrapRaw ? taskListEditBootstrapToFilterOptions(listEditBootstrapRaw) : undefined),
    [listEditBootstrapRaw],
  )

  const commitSearch = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      setPageSearchValue(trimmed)
      setSearchValue(trimmed)
      const p = new URLSearchParams(params.toString())
      if (trimmed) p.set("q", trimmed)
      else p.delete("q")
      router.replace(`${pathname}?${p.toString()}`, { scroll: false })
    },
    [params, pathname, router, setSearchValue],
  )

  const handleViewModeChange = useCallback(
    (view: TaskListViewMode) => {
      setViewMode(view)
      const p = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : params.toString(),
      )
      p.set("tasksView", view)
      p.set("topView", view)
      // Avoid legacy planner split treating middleView=calendar as "list is primary".
      if (p.get("middleView") === "calendar" || p.get("middleView") === "kanban") {
        p.delete("middleView")
      }
      if (p.get("leftView") === "list" || p.get("leftView") === "calendar" || p.get("leftView") === "kanban") {
        p.set("leftView", view)
      }
      shallowReplaceSearchParams(pathname || "/tasks", p, "workspace-task-list-view")
    },
    [params, pathname],
  )

  const handleTaskSelect = useCallback(
    (task: any) => {
      const isSuggestion =
        task?.kind === "suggestion" ||
        task?.itemKind === "suggestion" ||
        task?.entity_type === "suggestion" ||
        task?.type === "suggestion"
      const rawId = isSuggestion
        ? (task?.suggestionId ?? task?.suggestion_id ?? task?.entity_id ?? task?.id)
        : (task?.taskId ?? task?.task_id ?? task?.entity_id ?? task?.id)
      const entityId =
        typeof rawId === "number"
          ? rawId
          : Number.parseInt(String(rawId ?? "").includes(":") ? String(rawId).split(":").pop()! : String(rawId ?? ""), 10)
      if (!Number.isFinite(entityId) || entityId <= 0) return
      const selectedId = String(entityId)
      setSelectedTaskId(selectedId)
      const title =
        (typeof task?.title === "string" && task.title.trim()) ||
        (typeof task?.name === "string" && task.name.trim()) ||
        null
      openTaskDetailFromTaskList(paneId, {
        type: isSuggestion ? "suggestion" : "task",
        id: entityId,
        taskId: entityId,
        title,
      })
    },
    [paneId, setSelectedTaskId],
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
      newFilters: TaskFiltersState,
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
    [params, pathname, router, setFilters],
  )

  const dueSoonRange = useMemo(() => {
    const from = startOfLocalDay()
    const to = startOfLocalDay()
    to.setDate(to.getDate() + 7)
    return { from, to }
  }, [])

  const activeScope = useMemo((): TaskScopePill => {
    const userKey = publicUserId != null ? String(publicUserId) : null
    const isMyTasks =
      !!userKey &&
      filters.assignedTo.length === 1 &&
      filters.assignedTo[0] === userKey &&
      !filters.deliveryDate?.from &&
      !filters.deliveryDate?.to
    if (isMyTasks) return "my_tasks"

    const isDueSoon =
      isSameLocalDay(filters.deliveryDate?.from, dueSoonRange.from) &&
      isSameLocalDay(filters.deliveryDate?.to, dueSoonRange.to) &&
      filters.assignedTo.length === 0
    if (isDueSoon) return "due_soon"
    return "all"
  }, [dueSoonRange.from, dueSoonRange.to, filters.assignedTo, filters.deliveryDate, publicUserId])

  const applyScopePill = useCallback(
    (scope: TaskScopePill) => {
      if (scope === "all") {
        commitFilters(EMPTY_TASK_FILTERS)
        return
      }
      if (scope === "my_tasks") {
        if (publicUserId == null) return
        commitFilters({
          ...EMPTY_TASK_FILTERS,
          assignedTo: [String(publicUserId)],
        })
        return
      }
      commitFilters({
        ...EMPTY_TASK_FILTERS,
        deliveryDate: { from: dueSoonRange.from, to: dueSoonRange.to },
      })
    },
    [commitFilters, dueSoonRange.from, dueSoonRange.to, publicUserId],
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
    [filters, setFilters, router, pathname, currentParams, filterOptionsForBadges],
  )

  const listGroupBySummary = getListGroupByLabelFromParams(params.get("groupBy"))
  const isListLayout = viewMode === "list"

  const scopePills: { id: TaskScopePill; label: string }[] = [
    { id: "all", label: "All" },
    { id: "my_tasks", label: "My tasks" },
    { id: "due_soon", label: "Due soon" },
  ]

  const viewModeItems: { id: TaskListViewMode; label: string; icon: typeof List }[] = [
    { id: "list", label: "List", icon: List },
    { id: "kanban", label: "Kanban", icon: LayoutGrid },
    { id: "calendar", label: "Calendar", icon: Calendar },
  ]

  const listOverflowMenu = (
    <DropdownMenuItem
      className="justify-between gap-2"
      onSelect={(e) => {
        e.preventDefault()
        setIsMultiselectMode((v) => !v)
      }}
    >
      <span className="min-w-0 truncate">Multiselect</span>
      <span className="shrink-0 pl-2 text-xs text-muted-foreground">
        {isMultiselectMode ? "On" : "Off"}
      </span>
    </DropdownMenuItem>
  )

  return (
    <WorkspacePageShell
      title="Tasks"
      subtitle="Search and open a task."
      layout={isListLayout ? "scroll" : "fill"}
      taskScrollContainer={isListLayout}
      columnClassName={
        isListLayout
          ? TASK_LIST_CONTENT_COLUMN_CLASS
          : "mx-auto flex h-full w-full max-w-5xl min-h-0 flex-1 flex-col gap-4 px-6"
      }
      actions={
        <WorkspacePageAddButton
          label="New task"
          onClick={() => openComposer({})}
        />
      }
    >
      <WorkspacePageSearchInput
        value={pageSearchValue}
        onChange={(value) => {
          setPageSearchValue(value)
          setSearchValue(value)
        }}
        onCommit={commitSearch}
        placeholder="Search tasks…"
      />

      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        {scopePills.map((tab) => {
          const isActive = activeScope === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => applyScopePill(tab.id)}
              className={cn(
                "inline-flex h-9 items-center rounded-full px-3.5 text-[15px] font-medium transition-colors",
                isActive
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-800",
              )}
            >
              {tab.label}
            </button>
          )
        })}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <div ref={setBulkActionsHost} className="flex flex-nowrap items-center gap-1.5" />
          {viewMode === "kanban" ? (
            <div ref={setKanbanToolbarEl} className="flex flex-nowrap items-center gap-2" />
          ) : null}
          {viewMode === "calendar" ? (
            <div ref={setCalendarToolbarEl} className="flex flex-nowrap items-center gap-2" />
          ) : null}
          {viewMode === "list" ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2.5 text-[15px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  aria-label="Group by"
                >
                  <span className="max-w-[10rem] truncate">{listGroupBySummary}</span>
                  <ChevronDown className="h-4 w-4 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[220px]">
                <GroupingMenuItems />
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <div className="flex shrink-0 items-center gap-0.5">
            {viewModeItems.map((item) => {
              const Icon = item.icon
              const isActive = viewMode === item.id
              return (
                <IconTooltip key={item.id} label={item.label}>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800",
                      isActive && "bg-gray-100 text-gray-900 hover:bg-gray-100 hover:text-gray-900",
                    )}
                    aria-label={item.label}
                    aria-pressed={isActive}
                    onClick={() => handleViewModeChange(item.id)}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </button>
                </IconTooltip>
              )
            })}
          </div>
          <div className="mx-0.5 h-5 w-px shrink-0 bg-gray-200" aria-hidden />
          <FilterCascadingDropdown
            editFields={editFields}
            filterOptions={filterOptionsForBadges}
            filters={filters}
            setFilters={setFilters}
            router={router}
            pathname={pathname}
            params={new URLSearchParams(params.toString())}
            variant="icon"
            className="h-9 w-9 shrink-0 [&_svg]:h-[18px] [&_svg]:w-[18px]"
          />
          <TasksPaneMoreMenu
            align="end"
            ariaLabel="More list actions"
            triggerClassName="h-9 w-9 [&_svg]:h-[18px] [&_svg]:w-[18px]"
          >
            {listOverflowMenu}
          </TasksPaneMoreMenu>
        </div>
      </div>

      {viewMode === "list" && badges.length > 0 ? (
        <div className="shrink-0">
          <FilterBadges badges={badges} onClearAll={onClearAll} className="mb-0" />
        </div>
      ) : null}

      <TaskFilters
        isOpen={isFilterPaneOpen}
        onClose={() => setIsFilterPaneOpen(false)}
        onApplyFilters={(next) => {
          setFilters(next)
          setIsFilterPaneOpen(false)
        }}
        activeFilters={filters}
        filterOptions={filterOptionsForBadges}
        commitFilters={commitFilters}
      />

      <div
        className={cn(
          "min-w-0",
          isListLayout ? "w-full" : "min-h-0 flex-1 overflow-hidden",
        )}
      >
        {viewMode === "list" ? (
          <TaskList
            onTaskSelect={handleTaskSelect}
            selectedTaskId={selectedTaskId}
            editFields={editFields}
            isMultiselectMode={isMultiselectMode}
            onToggleMultiselect={() => setIsMultiselectMode((v) => !v)}
            bulkActionsHost={bulkActionsHost}
          />
        ) : null}
        {viewMode === "kanban" ? (
          <div className="h-full">
            <KanbanView
              searchValue={searchValue || pageSearchValue}
              filters={urlFilters}
              selectedTaskId={selectedTaskId}
              onTaskSelect={handleTaskSelect}
              onOptimisticUpdate={onTaskUpdate}
              enabled
              hideToolbar
              toolbarContainerRef={kanbanToolbarRef}
            />
          </div>
        ) : null}
        {viewMode === "calendar" ? (
          <div className="h-full">
            <CalendarView
              onTaskClick={handleTaskSelect}
              selectedTaskId={selectedTaskId}
              selectedTask={null}
              searchValue={searchValue || pageSearchValue}
              onOptimisticUpdate={onTaskUpdate}
              enabled
              hideToolbar
              toolbarContainerRef={calendarToolbarRef}
              hideViewToggle
            />
          </div>
        ) : null}
      </div>
      {toolbarRefReady ? null : null}
    </WorkspacePageShell>
  )
}

export function WorkspaceTaskListView({ paneId }: { paneId: WorkspacePaneId }) {
  return (
    <WorkspaceHostPaneProvider pane={paneId}>
      <WorkspaceTaskListViewInner paneId={paneId} />
    </WorkspaceHostPaneProvider>
  )
}
