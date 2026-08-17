"use client"

/**
 * Full Task List as a workspace tab (left / middle / right).
 * Same page chrome as Projects / Inbox — headline, search, New task —
 * with TaskList / Kanban / Calendar filling the remaining height.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Calendar, CheckSquare, ChevronDown, LayoutGrid, List } from "lucide-react"
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
import {
  shallowReplaceSearchParams,
  TASKS_SHALLOW_NAV_EVENT,
} from "../../lib/tasks-shallow-nav"
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
  const stickyChromeRef = useRef<HTMLDivElement | null>(null)
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

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSearchTypingRef = useRef(false)

  useEffect(() => {
    const syncSearchFromLiveUrl = () => {
      if (isSearchTypingRef.current) return
      const next =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("q")?.trim() || ""
          : params.get("q")?.trim() || ""
      setPageSearchValue((current) => (current === next ? current : next))
    }
    syncSearchFromLiveUrl()
    if (typeof window === "undefined") return
    window.addEventListener(TASKS_SHALLOW_NAV_EVENT, syncSearchFromLiveUrl)
    window.addEventListener("popstate", syncSearchFromLiveUrl)
    return () => {
      window.removeEventListener(TASKS_SHALLOW_NAV_EVENT, syncSearchFromLiveUrl)
      window.removeEventListener("popstate", syncSearchFromLiveUrl)
    }
  }, [params])

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current != null) {
        window.clearTimeout(searchDebounceRef.current)
      }
    }
  }, [])

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

  /** Writes `?q=` via shallow history so TaskList picks it up without a Next soft navigation. */
  const writeSearchToUrl = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      setSearchValue(trimmed)
      const p = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : params.toString(),
      )
      if (trimmed) p.set("q", trimmed)
      else p.delete("q")
      const path =
        typeof window !== "undefined" ? window.location.pathname : pathname || "/"
      shallowReplaceSearchParams(path, p, "workspace-task-list-search")
    },
    [params, pathname, setSearchValue],
  )

  const handleSearchChange = useCallback(
    (value: string) => {
      isSearchTypingRef.current = true
      setPageSearchValue(value)
      if (searchDebounceRef.current != null) {
        window.clearTimeout(searchDebounceRef.current)
      }
      searchDebounceRef.current = setTimeout(() => {
        searchDebounceRef.current = null
        isSearchTypingRef.current = false
        writeSearchToUrl(value)
      }, 300)
    },
    [writeSearchToUrl],
  )

  const commitSearch = useCallback(
    (value: string) => {
      if (searchDebounceRef.current != null) {
        window.clearTimeout(searchDebounceRef.current)
        searchDebounceRef.current = null
      }
      isSearchTypingRef.current = false
      const trimmed = value.trim()
      setPageSearchValue(trimmed)
      writeSearchToUrl(trimmed)
    },
    [writeSearchToUrl],
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

  const [paneOverflowMenu, setPaneOverflowMenu] = useState<(() => ReactNode) | null>(null)
  const registerPaneOverflowMenu = useCallback((fn: (() => ReactNode) | null) => {
    setPaneOverflowMenu(() => fn)
  }, [])

  const listGroupBySummary = getListGroupByLabelFromParams(params.get("groupBy"))
  const isListLayout = viewMode === "list"

  useLayoutEffect(() => {
    if (!isListLayout) return
    const chrome = stickyChromeRef.current
    const root = chrome?.closest("[data-task-scroll-container]") as HTMLElement | null
    if (!chrome || !root) return
    const apply = () => {
      root.style.setProperty("--task-list-sticky-top", `${chrome.offsetHeight}px`)
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(chrome)
    return () => {
      ro.disconnect()
      root.style.removeProperty("--task-list-sticky-top")
    }
  }, [isListLayout, badges.length])

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
    <>
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
      {typeof paneOverflowMenu === "function" ? paneOverflowMenu() : null}
    </>
  )

  return (
    <WorkspacePageShell
      title="Tasks"
      subtitle="Search and open a task."
      layout={isListLayout ? "scroll" : "fill"}
      taskScrollContainer={isListLayout}
      columnClassName={
        isListLayout
          ? cn(TASK_LIST_CONTENT_COLUMN_CLASS, "flex flex-col gap-4")
          : "mx-auto flex h-full w-full max-w-none min-h-0 flex-1 flex-col gap-4 px-4"
      }
      actions={
        <WorkspacePageAddButton
          label="New task"
          onClick={() => openComposer({})}
        />
      }
    >
      <div
        ref={stickyChromeRef}
        className={cn(
          "flex flex-col gap-4 bg-white",
          isListLayout && "sticky top-0 z-30 -mx-4 px-4 pb-2",
        )}
      >
      <WorkspacePageSearchInput
        value={pageSearchValue}
        onChange={handleSearchChange}
        onCommit={commitSearch}
        placeholder="Search tasks…"
      />

      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        <IconTooltip label={isMultiselectMode ? "Exit multiselect" : "Multiselect"}>
          <button
            type="button"
            aria-label="Multiselect"
            aria-pressed={isMultiselectMode}
            onClick={() => setIsMultiselectMode((v) => !v)}
            className={cn(
              "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800",
              isMultiselectMode && "bg-gray-100 text-gray-900",
            )}
          >
            <CheckSquare className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>
        </IconTooltip>
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
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">
          <div ref={setBulkActionsHost} className="flex flex-nowrap items-center gap-1.5" />
          <div className="flex min-w-0 flex-nowrap items-center gap-1.5">
            {viewMode === "list" ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2.5 text-[15px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    aria-label="Group by"
                  >
                    <span className="max-w-[12rem] truncate">
                      {listGroupBySummary === "No group"
                        ? "Group by"
                        : `Group by: ${listGroupBySummary}`}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[220px]">
                  <GroupingMenuItems />
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {viewMode === "kanban" ? (
              <div ref={setKanbanToolbarEl} className="flex flex-nowrap items-center gap-2" />
            ) : null}
            {viewMode === "calendar" ? (
              <div ref={setCalendarToolbarEl} className="flex flex-nowrap items-center gap-2" />
            ) : null}
          </div>
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

      <div className={cn(!isListLayout && "min-h-0 min-w-0 flex-1 overflow-hidden")}>
        {viewMode === "list" ? (
          <TaskList
            onTaskSelect={handleTaskSelect}
            selectedTaskId={selectedTaskId}
            editFields={editFields}
            isMultiselectMode={isMultiselectMode}
            onToggleMultiselect={() => setIsMultiselectMode((v) => !v)}
            bulkActionsHost={bulkActionsHost}
            nestedScroll={false}
          />
        ) : null}
        {viewMode === "kanban" ? (
          <div className="h-full">
            <KanbanView
              searchValue={pageSearchValue}
              filters={urlFilters}
              selectedTaskId={selectedTaskId}
              onTaskSelect={handleTaskSelect}
              onOptimisticUpdate={onTaskUpdate}
              enabled
              hideToolbar
              toolbarContainerRef={kanbanToolbarRef}
              registerPaneOverflowMenu={registerPaneOverflowMenu}
              isMultiselectMode={isMultiselectMode}
            />
          </div>
        ) : null}
        {viewMode === "calendar" ? (
          <div className="h-full">
            <CalendarView
              onTaskClick={handleTaskSelect}
              selectedTaskId={selectedTaskId}
              selectedTask={null}
              searchValue={pageSearchValue}
              onOptimisticUpdate={onTaskUpdate}
              enabled
              hideToolbar
              toolbarContainerRef={calendarToolbarRef}
              hideViewToggle
              registerPaneOverflowMenu={registerPaneOverflowMenu}
              isMultiselectMode={isMultiselectMode}
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
