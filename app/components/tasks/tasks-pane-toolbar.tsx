"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"
import type { ReadonlyURLSearchParams } from "next/navigation"
import { Calendar, ChevronDown, ChevronRight, LayoutGrid, List, Maximize2, Minimize2, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "../ui/dropdown-menu"
import { FilterCascadingDropdown } from "./FilterCascadingDropdown"
import { GroupingMenuItems, getListGroupByLabelFromParams } from "./grouping-dropdown"
import { InlineSearchInput } from "./InlineSearchInput"
import type { TaskFilters as TaskFiltersType } from "../../store/tasks-ui"
import type { TaskEditFields } from "../../hooks/use-task-edit-fields"
import type { FilterOptions } from "../../lib/services/filters"
import type { TaskCardColorMode } from "@/lib/task-card-colors"
import { dispatchTasksShallowNavigation } from "../../lib/tasks-shallow-nav"
import { useTasksListLegendStore } from "../../store/tasks-list-legend"
import type { TasksToolbarFitSnapshot } from "../../contexts/tasks-toolbar-fit-context"
import { defaultTasksToolbarFit } from "../../contexts/tasks-toolbar-fit-context"
import type { LeftPaneObject } from "../../lib/left-pane-object"
import { leftPaneObjectLabel } from "../../lib/left-pane-object"
import { LeftObjectSwitcher } from "./LeftObjectSwitcher"
import { TooltipProvider } from "../ui/tooltip"
import { PaneOpenIcon } from "./pane-open-icon"
import { PANE_CHROME_ICON_BUTTON_CLASS, PANE_CHROME_ICON_CLASS, TASK_DETAILS_HEADER_ROW_CLASS } from "./pane-header-tokens"
import { IconTooltip } from "../ui/icon-tooltip"
import { SplitPaneViewDropdown } from "./split-pane-view-dropdown"
import { TasksPaneMoreMenu } from "./tasks-pane-more-menu"

export type MainViewMode = "list" | "calendar" | "kanban"

export type TasksOverflowMenuSlot = {
  containerRef: React.RefObject<HTMLDivElement | null>
  slotVersion: number
  setSlotRef: (node: HTMLDivElement | null) => void
}

const TOOLBAR_ITEM_GAP = 8

/** Conservative min widths for greedy fit (px): group, multiselect, color, legend. */
const LIST_OPTIONAL_WIDTHS = [190, 175, 200, 155]
const KANBAN_INLINE_WIDTHS = [158, 168, 128, 96, 136, 130]
const CAL_INLINE_WIDTHS = [148, 132, 128, 96, 130]

function countGreedyFit(avail: number, widths: number[]): number {
  if (avail <= 0 || widths.length === 0) return 0
  let used = 0
  let k = 0
  for (const w of widths) {
    const need = w + (k > 0 ? TOOLBAR_ITEM_GAP : 0)
    if (used + need <= avail) {
      used += need
      k += 1
    } else break
  }
  return k
}

function listColorModeShortLabel(mode: TaskCardColorMode | null): string {
  if (mode === "contentType") return "Content Type"
  if (mode === "assignedTo") return "Assignee"
  if (mode === "project") return "Project"
  if (mode === "status") return "Status"
  return "Off"
}

function OverflowMenuValueChevron({ value }: { value: string }) {
  return (
    <span className="ml-auto flex max-w-[min(56vw,11rem)] shrink-0 items-center gap-1.5">
      <span className="truncate text-right text-xs text-muted-foreground tabular-nums" title={value}>
        {value}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
    </span>
  )
}

function ListColorByPill({
  pillButton,
  currentMode,
  onChange,
}: {
  pillButton: string
  currentMode: TaskCardColorMode | null
  onChange: (m: TaskCardColorMode | null) => void
}) {
  const label =
    currentMode == null
      ? "Color: Off"
      : currentMode === "contentType"
        ? "Color: Content Type"
        : currentMode === "assignedTo"
          ? "Color: Assignee"
          : currentMode === "project"
            ? "Color: Project"
            : currentMode === "status"
              ? "Color: Status"
              : "Color by"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(pillButton, "shrink-0 gap-1")}>
          {label}
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        <div className="border-b border-gray-100 px-2 py-1.5 text-[11px] text-gray-500">Color by</div>
        <DropdownMenuItem
          onSelect={() => onChange(null)}
          className={currentMode == null ? "bg-muted font-semibold" : ""}
        >
          Off
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onChange("contentType")}
          className={currentMode === "contentType" ? "bg-muted font-semibold" : ""}
        >
          Content Type
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onChange("assignedTo")}
          className={currentMode === "assignedTo" ? "bg-muted font-semibold" : ""}
        >
          Assigned To
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onChange("project")}
          className={currentMode === "project" ? "bg-muted font-semibold" : ""}
        >
          Project
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onChange("status")}
          className={currentMode === "status" ? "bg-muted font-semibold" : ""}
        >
          Status
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export type TasksPaneToolbarProps = {
  minimalMode?: boolean
  /** Compact toolbar for the mobile split bottom pane (view dropdown + … + close). */
  compactMode?: "mobile-split-bottom"
  isTaskRoute?: boolean
  leftObject: LeftPaneObject
  onLeftObjectSelect: (next: LeftPaneObject) => void
  view: MainViewMode
  pane: "single" | "top" | "bottom" | "right"
  /** Same key used by `useTasksToolbarFitForPane`. */
  paneFitKey: string
  pillButton: string
  primaryView: MainViewMode
  isFocused: boolean
  setFocusInUrl: (next: "top" | "bottom" | null) => void
  handlePrimaryViewChange: (v: MainViewMode) => void
  applyViewState: (patch: { isSplit?: boolean; secondaryView?: MainViewMode }) => void
  isSplitEnabled?: boolean
  onExitSplit?: () => void
  topCalendarToolbarRef: React.RefObject<HTMLDivElement | null>
  bottomCalendarToolbarRef: React.RefObject<HTMLDivElement | null>
  calendarSlot: TasksOverflowMenuSlot
  kanbanSlot: TasksOverflowMenuSlot
  inlineOptionalSlot: TasksOverflowMenuSlot
  /** Built by Calendar/Kanban and rendered inside the pane "…" menu (valid `MenuSub` tree). */
  paneOverflowMenuContent?: (() => React.ReactNode) | null
  onPaneFitChange: (paneKey: string, fit: TasksToolbarFitSnapshot) => void
  editFields: TaskEditFields | undefined
  filterOptions?: FilterOptions
  filters: TaskFiltersType
  setFilters: (f: TaskFiltersType) => void
  router: { replace: (url: string, opts?: { scroll?: boolean }) => void }
  pathname: string
  params: URLSearchParams | ReadonlyURLSearchParams
  isMultiselectMode: boolean
  setIsMultiselectMode: React.Dispatch<React.SetStateAction<boolean>>
  handleToggleMultiselect: () => void
  isInlineSearchOpen: boolean
  setIsInlineSearchOpen: React.Dispatch<React.SetStateAction<boolean>>
  inlineSearchValue: string
  setInlineSearchValue: React.Dispatch<React.SetStateAction<string>>
  setSearchValue: (v: string) => void
  shallowReplaceUrl: (url: string) => void
  onOptionalPlacementChange: (paneKey: string, placement: "inline" | "overflow") => void
  plannerVisibility: { showTasks: boolean; showSuggestions: boolean }
  setPlannerVisibility: (patch: Partial<{ showTasks: boolean; showSuggestions: boolean }>) => void
  /** Progressive open: only when the next workspace pane is closed. */
  onOpenNextPane?: () => void
  openNextPaneLabel?: string
  /** When the left pane owns a tab strip, hide object pills (lists open via + / sidebar). */
  hideObjectSwitcher?: boolean
  /** When the left pane owns expand/close chrome, hide duplicate pane chrome here. */
  hidePaneChrome?: boolean
}

export function TasksPaneToolbar(props: TasksPaneToolbarProps) {
  const {
    minimalMode = false,
    compactMode,
    isTaskRoute = true,
    leftObject,
    onLeftObjectSelect,
    view,
    pane,
    paneFitKey,
    pillButton,
    primaryView,
    isFocused,
    setFocusInUrl,
    handlePrimaryViewChange,
    applyViewState,
    isSplitEnabled = false,
    onExitSplit,
    topCalendarToolbarRef,
    bottomCalendarToolbarRef,
    calendarSlot,
    kanbanSlot,
    inlineOptionalSlot,
    paneOverflowMenuContent,
    onPaneFitChange,
    editFields,
    filterOptions,
    filters,
    setFilters,
    router,
    pathname,
    params,
    isMultiselectMode,
    setIsMultiselectMode,
    handleToggleMultiselect,
    isInlineSearchOpen,
    setIsInlineSearchOpen,
    inlineSearchValue,
    setInlineSearchValue,
    setSearchValue,
    shallowReplaceUrl,
    onOptionalPlacementChange,
    plannerVisibility: _plannerVisibility,
    setPlannerVisibility: _setPlannerVisibility,
    onOpenNextPane,
    openNextPaneLabel = "Open panel",
    hideObjectSwitcher = false,
    hidePaneChrome = false,
  } = props

  void calendarSlot
  void kanbanSlot
  void _plannerVisibility
  void _setPlannerVisibility
  const showObjectSwitcher = !hideObjectSwitcher
  const showPaneChrome = !hidePaneChrome
  const calendarOverflowMenu = view === "calendar" ? paneOverflowMenuContent : null
  const kanbanOverflowMenu = view === "kanban" ? paneOverflowMenuContent : null

  const listColorRaw = params.get("list_color_by")
  const listColorIsOff = listColorRaw === "off"
  const listColorActive: TaskCardColorMode =
    listColorRaw === "contentType" ||
    listColorRaw === "assignedTo" ||
    listColorRaw === "project" ||
    listColorRaw === "status"
      ? listColorRaw
      : "contentType"
  const listColorPillMode: TaskCardColorMode | null = listColorIsOff ? null : listColorActive

  const listToolbarLegendEntries = useTasksListLegendStore((s) => s.entries)
  const listToolbarLegendTitle = useTasksListLegendStore((s) => s.title)

  const setListColorBy = useCallback(
    (mode: TaskCardColorMode | null) => {
      const next = new URLSearchParams(params.toString())
      if (mode === null) next.set("list_color_by", "off")
      else next.set("list_color_by", mode)
      shallowReplaceUrl(`${pathname}?${next.toString()}`)
      dispatchTasksShallowNavigation()
    },
    [params, pathname, shallowReplaceUrl],
  )

  // Date dimension for the list (used by compact rows). Reuses the calendar view's canonical
  // `calendar_date_field` param so the choice is consistent across views — no compact-only state.
  const listDateField: "delivery" | "publication" =
    params.get("calendar_date_field") === "publication" ? "publication" : "delivery"

  const setListDateField = useCallback(
    (next: "delivery" | "publication") => {
      const sp = new URLSearchParams(params.toString())
      // Always set it explicitly so the choice sticks and wins over the grouping/sort-derived default.
      sp.set("calendar_date_field", next)
      shallowReplaceUrl(`${pathname}?${sp.toString()}`)
      dispatchTasksShallowNavigation()
    },
    [params, pathname, shallowReplaceUrl],
  )

  const containerRef = useRef<HTMLDivElement | null>(null)
  const objectSwitcherRowRef = useRef<HTMLDivElement | null>(null)
  const rightClusterRef = useRef<HTMLDivElement | null>(null)
  const optionalClusterRef = useRef<HTMLDivElement | null>(null)
  const [fit, setFit] = useState<TasksToolbarFitSnapshot>(defaultTasksToolbarFit)
  const placementNotifyRef = useRef<string | null>(null)
  // Available horizontal space for the object switcher.
  // Prefer the flex-1 switcher slot width (allocated by layout, not content). Fall back to
  // toolbar minus right cluster. Never use a shrink-wrapped content width — that chicken-eggs
  // into permanent compact mode.
  const [objectSwitcherWidth, setObjectSwitcherWidth] = useState<number | null>(null)

  const runFit = useCallback(() => {
    const opt = optionalClusterRef.current
    const container = containerRef.current
    const objectRow = objectSwitcherRowRef.current
    const right = rightClusterRef.current
    const leftBlk = container?.firstElementChild as HTMLElement | null

    if (objectRow) {
      const avail = Math.max(0, Math.floor(objectRow.getBoundingClientRect().width))
      setObjectSwitcherWidth((prev) => (prev === avail ? prev : avail))
    } else if (container) {
      const containerW = Math.floor(container.getBoundingClientRect().width)
      const rightW = right ? Math.floor(right.getBoundingClientRect().width) : 0
      const avail = Math.max(0, containerW - rightW - (rightW > 0 ? 2 : 1) * TOOLBAR_ITEM_GAP)
      setObjectSwitcherWidth((prev) => (prev === avail ? prev : avail))
    }

    let listFit = 0
    if (view === "list" && container && right && leftBlk) {
      const gap = TOOLBAR_ITEM_GAP
      const reserved =
        leftBlk.getBoundingClientRect().width + right.getBoundingClientRect().width + 3 * gap
      const listAvail = Math.max(0, Math.floor(container.getBoundingClientRect().width - reserved))
      listFit = countGreedyFit(listAvail, LIST_OPTIONAL_WIDTHS)
    }

    const w = opt ? Math.floor(opt.getBoundingClientRect().width) : 0
    const kanbanFit = countGreedyFit(w, KANBAN_INLINE_WIDTHS)
    const calFit = countGreedyFit(w, CAL_INLINE_WIDTHS)
    const next: TasksToolbarFitSnapshot = {
      listOptionalVisible: view === "list" ? listFit : 0,
      kanbanInlineCount: view === "kanban" ? kanbanFit : 0,
      calendarInlineCount: view === "calendar" ? calFit : 0,
    }
    setFit((prev) => {
      if (
        prev.listOptionalVisible === next.listOptionalVisible &&
        prev.kanbanInlineCount === next.kanbanInlineCount &&
        prev.calendarInlineCount === next.calendarInlineCount
      ) {
        return prev
      }
      return next
    })
  }, [view, paneFitKey, minimalMode, isTaskRoute])

  useLayoutEffect(() => {
    setFit(defaultTasksToolbarFit)
  }, [paneFitKey, view])

  useLayoutEffect(() => {
    onPaneFitChange(paneFitKey, fit)
  }, [fit, paneFitKey, onPaneFitChange])

  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(runFit)
    })
    const c = containerRef.current
    const objectRow = objectSwitcherRowRef.current
    const right = rightClusterRef.current
    const opt = optionalClusterRef.current
    if (c) ro.observe(c)
    if (objectRow) ro.observe(objectRow)
    if (right) ro.observe(right)
    if (opt) ro.observe(opt)
    requestAnimationFrame(runFit)
    return () => ro.disconnect()
  }, [runFit, view, paneFitKey])

  const kanbanV = fit.kanbanInlineCount
  const calV = fit.calendarInlineCount

  useLayoutEffect(() => {
    // List options always live in “…”; calendar/kanban still report optional placement.
    const listPlacement: "inline" | "overflow" = "overflow"
    const kanbanPlacement = fit.kanbanInlineCount < KANBAN_INLINE_WIDTHS.length ? "overflow" : "inline"
    const calPlacement = fit.calendarInlineCount < CAL_INLINE_WIDTHS.length ? "overflow" : "inline"
    let placement: "inline" | "overflow" = "inline"
    if (view === "list") placement = listPlacement
    else if (view === "kanban") placement = kanbanPlacement
    else if (view === "calendar") placement = calPlacement
    const token = `${paneFitKey}:${placement}`
    if (placementNotifyRef.current === token) return
    placementNotifyRef.current = token
    onOptionalPlacementChange(paneFitKey, placement)
  }, [view, paneFitKey, fit, onOptionalPlacementChange])

  const isSecondaryPane = pane === "bottom" || pane === "right"
  const isTopLikePane = !isSecondaryPane
  const calendarToolbarRef = isSecondaryPane ? bottomCalendarToolbarRef : topCalendarToolbarRef
  const paneLabel = view === "list" ? "List" : view === "kanban" ? "Kanban" : "Calendar"

  const showKanbanMore = view === "kanban" && Boolean(kanbanOverflowMenu) && kanbanV < 6
  const showCalendarMore = view === "calendar" && Boolean(calendarOverflowMenu) && calV < 5

  const listGroupBySummary = getListGroupByLabelFromParams(params.get("groupBy"))
  const listSortBy = params.get("rowSortBy") || params.get("sortBy") || "updated_at"
  const listSortOrder = params.get("rowSortOrder") === "asc" || params.get("sortOrder") === "asc"
    ? "asc"
    : "desc"
  const listSortOptions = [
    { value: "updated_at", label: "Updated" },
    { value: "title", label: "Title" },
    { value: "delivery_date", label: "Delivery date" },
    { value: "publication_date", label: "Publication date" },
    { value: "projects", label: "Project" },
    { value: "project_statuses", label: "Status" },
    { value: "users", label: "Assignee" },
  ] as const
  const activeListSortLabel = listSortOptions.find((option) => option.value === listSortBy)?.label ?? listSortBy
  const setListSort = (sortBy: string, order: "asc" | "desc" = listSortOrder) => {
    const next = new URLSearchParams(params.toString())
    next.set("rowSortBy", sortBy)
    next.set("rowSortOrder", order)
    next.set("sortBy", sortBy)
    next.set("sortOrder", order)
    next.delete("page")
    shallowReplaceUrl(pathname + "?" + next.toString())
    dispatchTasksShallowNavigation()
  }

  /** Task list always shows overflow with full actions. */
  const listOverflowNodes = useMemo(() => {
    return [
      <DropdownMenuSub key="sort">
        <DropdownMenuSubTrigger className="gap-2">
          <span className="min-w-0 truncate">Sort by</span>
          <OverflowMenuValueChevron value={activeListSortLabel + " · " + (listSortOrder === "asc" ? "Asc" : "Desc")} />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-[220px]">
          {listSortOptions.map((option) => (
            <DropdownMenuSub key={option.value}>
              <DropdownMenuSubTrigger className={cn("gap-2", listSortBy === option.value ? "font-semibold bg-muted" : "")}>
                {option.label}
                <OverflowMenuValueChevron value={listSortBy === option.value ? (listSortOrder === "asc" ? "Asc" : "Desc") : ""} />
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-[160px]">
                <DropdownMenuItem onSelect={() => setListSort(option.value, "asc")} className={listSortBy === option.value && listSortOrder === "asc" ? "font-semibold bg-muted" : ""}>
                  Ascending
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setListSort(option.value, "desc")} className={listSortBy === option.value && listSortOrder === "desc" ? "font-semibold bg-muted" : ""}>
                  Descending
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>,
      <DropdownMenuSub key="gb">
        <DropdownMenuSubTrigger className="gap-2">
          <span className="min-w-0 truncate">Group by</span>
          <OverflowMenuValueChevron value={listGroupBySummary} />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-[220px]">
          <GroupingMenuItems />
        </DropdownMenuSubContent>
      </DropdownMenuSub>,
      <DropdownMenuSub key="date">
        <DropdownMenuSubTrigger className="gap-2">
          <span className="min-w-0 truncate">Date</span>
          <OverflowMenuValueChevron value={listDateField === "publication" ? "Publication" : "Delivery"} />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-[200px]">
          <DropdownMenuItem
            onSelect={() => setListDateField("delivery")}
            className={listDateField === "delivery" ? "font-semibold bg-muted" : ""}
          >
            Delivery date
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setListDateField("publication")}
            className={listDateField === "publication" ? "font-semibold bg-muted" : ""}
          >
            Publication date
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>,
      <DropdownMenuItem
        key="ms"
        className="justify-between gap-2"
        onSelect={(e) => {
          e.preventDefault()
          setIsMultiselectMode((v) => !v)
        }}
      >
        <span className="min-w-0 truncate">Multiselect</span>
        <span className="shrink-0 pl-2 text-xs text-muted-foreground">{isMultiselectMode ? "On" : "Off"}</span>
      </DropdownMenuItem>,
      <DropdownMenuSub key="color">
        <DropdownMenuSubTrigger className="gap-2">
          <span className="min-w-0 truncate">Color</span>
          <OverflowMenuValueChevron value={listColorModeShortLabel(listColorPillMode)} />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-[200px]">
          <DropdownMenuItem
            onSelect={() => setListColorBy(null)}
            className={listColorIsOff ? "font-semibold bg-muted" : ""}
          >
            Off
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setListColorBy("contentType")}
            className={!listColorIsOff && listColorActive === "contentType" ? "font-semibold bg-muted" : ""}
          >
            Content Type
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setListColorBy("assignedTo")}
            className={!listColorIsOff && listColorActive === "assignedTo" ? "font-semibold bg-muted" : ""}
          >
            Assigned To
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setListColorBy("project")}
            className={!listColorIsOff && listColorActive === "project" ? "font-semibold bg-muted" : ""}
          >
            Project
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setListColorBy("status")}
            className={!listColorIsOff && listColorActive === "status" ? "font-semibold bg-muted" : ""}
          >
            Status
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>,
      <DropdownMenuSub key="legend">
        <DropdownMenuSubTrigger className="gap-2">
          <span className="min-w-0 truncate">Legend</span>
          <ChevronRight className="ml-auto h-4 w-4 shrink-0 opacity-60" />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-[240px] max-h-[min(60vh,420px)] overflow-y-auto p-1">
          <div className="px-2 py-1.5 text-[11px] text-gray-500">
            {listToolbarLegendTitle ? `Legend · ${listToolbarLegendTitle}` : "Legend"}
          </div>
          {listToolbarLegendEntries.length === 0 ? (
            <div className="px-2 py-3 text-sm text-gray-400">No items yet</div>
          ) : (
            listToolbarLegendEntries.map(({ key, label, colorClass }) => (
              <div key={key} className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm">
                <span className="truncate">{label}</span>
                <span className={cn("inline-block h-3 w-3 shrink-0 rounded-sm", colorClass)} aria-hidden />
              </div>
            ))
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>,
    ]
  }, [
    listGroupBySummary,
    activeListSortLabel,
    listSortBy,
    listSortOrder,
    isMultiselectMode,
    setIsMultiselectMode,
    listColorPillMode,
    listColorIsOff,
    listColorActive,
    setListColorBy,
    listDateField,
    setListDateField,
    listToolbarLegendEntries,
    listToolbarLegendTitle,
    params,
    router,
    pathname,
  ])

  const multiselectOverflowItem =
    (view === "calendar" && calV < 5) || (view === "kanban" && kanbanV < 6) ? (
      <DropdownMenuItem
        key="ms-cal-kan"
        className="justify-between gap-2"
        onSelect={(e) => {
          e.preventDefault()
          setIsMultiselectMode((v) => !v)
        }}
      >
        <span className="min-w-0 truncate">Multiselect</span>
        <span className="shrink-0 pl-2 text-xs text-muted-foreground">{isMultiselectMode ? "On" : "Off"}</span>
      </DropdownMenuItem>
    ) : null

  const overflowMenuBody = useMemo(() => {
    if (view === "calendar" && calendarOverflowMenu) {
      return (
        <>
          {calendarOverflowMenu()}
          {multiselectOverflowItem}
        </>
      )
    }
    if (view === "kanban" && kanbanOverflowMenu) {
      return (
        <>
          {kanbanOverflowMenu()}
          {multiselectOverflowItem}
        </>
      )
    }
    if (view === "list") return <>{listOverflowNodes}</>
    return null
  }, [view, calendarOverflowMenu, kanbanOverflowMenu, listOverflowNodes, multiselectOverflowItem])

  const showMoreTrigger =
    view === "list" || (view === "kanban" && showKanbanMore) || (view === "calendar" && showCalendarMore)

  const hasRenderableOverflow = overflowMenuBody != null
  const isHomeObject = leftObject === "all"
  const isMobileSplitCompact = compactMode === "mobile-split-bottom"
  const canShowTaskControls = !minimalMode && isTaskRoute
  const canShowSearch = !minimalMode && !isMobileSplitCompact
  const showMoreMenu =
    isMobileSplitCompact
      ? hasRenderableOverflow
      : showMoreTrigger && hasRenderableOverflow

  const searchPlaceholder =
    leftObject === "projects"
      ? "Search projects..."
      : leftObject === "mentions"
        ? "Search mentions..."
        : leftObject === "users"
          ? "Search users..."
          : leftObject === "ai_chats"
            ? "Search AI chats..."
            : leftObject === "artifacts"
              ? "Search artifacts..."
              : "Search tasks..."

  const filterControl = (
    <FilterCascadingDropdown
      editFields={editFields}
      filterOptions={filterOptions}
      filters={filters}
      setFilters={setFilters}
      router={router}
      pathname={pathname}
      params={new URLSearchParams(params.toString())}
      variant="icon"
      className="shrink-0"
    />
  )

  const handleSecondaryViewChange = useCallback(
    (nextView: MainViewMode) => {
      applyViewState({ isSplit: true, secondaryView: nextView })
    },
    [applyViewState],
  )

  const searchSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (searchSyncTimeoutRef.current) clearTimeout(searchSyncTimeoutRef.current)
    }
  }, [])

  const syncTaskSearchToUrl = useCallback(
    (value: string) => {
      setSearchValue(value)
      const live =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams(params.toString())
      if (value) live.set("q", value)
      else live.delete("q")
      shallowReplaceUrl(`${pathname}?${live.toString()}`)
    },
    [params, pathname, setSearchValue, shallowReplaceUrl],
  )

  const openInlineSearchHandlers = {
    onChange: (value: string) => {
      // Always update local input immediately so typing stays snappy.
      setInlineSearchValue(value)
      // Object lists (projects/users/mentions/…) filter client-side from inlineSearchValue —
      // do not rewrite the URL or hit search RPC on every keystroke.
      if (!canShowTaskControls) return
      if (searchSyncTimeoutRef.current) clearTimeout(searchSyncTimeoutRef.current)
      searchSyncTimeoutRef.current = setTimeout(() => {
        syncTaskSearchToUrl(value)
      }, 280)
    },
    onClose: () => {
      if (searchSyncTimeoutRef.current) clearTimeout(searchSyncTimeoutRef.current)
      setIsInlineSearchOpen(false)
      setInlineSearchValue("")
      if (canShowTaskControls) {
        syncTaskSearchToUrl("")
      }
    },
  }

  const viewModeMenu = (
    <DropdownMenuContent align="end" className="min-w-[220px]">
      <DropdownMenuItem onClick={() => handlePrimaryViewChange("list")}>
        <List className="mr-2 h-4 w-4" />
        List
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => handlePrimaryViewChange("calendar")}>
        <Calendar className="mr-2 h-4 w-4" />
        Calendar
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => handlePrimaryViewChange("kanban")}>
        <LayoutGrid className="mr-2 h-4 w-4" />
        Kanban
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2">
          Split screen
          <ChevronRight className="ml-auto h-4 w-4 shrink-0 opacity-60" />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-[160px]">
          <DropdownMenuItem
            onClick={() => applyViewState({ isSplit: true, secondaryView: "list" })}
            disabled={primaryView === "list"}
          >
            List
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => applyViewState({ isSplit: true, secondaryView: "kanban" })}
            disabled={primaryView === "kanban"}
          >
            Kanban
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => applyViewState({ isSplit: true, secondaryView: "calendar" })}
            disabled={primaryView === "calendar"}
          >
            Calendar
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </DropdownMenuContent>
  )

  const viewModeControl =
    canShowTaskControls && isTopLikePane ? (
      <DropdownMenu>
        <IconTooltip label={`View: ${paneLabel}`}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1"
              aria-label={`View mode: ${paneLabel}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
        </IconTooltip>
        {viewModeMenu}
      </DropdownMenu>
    ) : canShowTaskControls && isSecondaryPane ? (
      <SplitPaneViewDropdown
        value={view}
        primaryView={primaryView}
        onValueChange={handleSecondaryViewChange}
        pillButton={pillButton}
        iconOnly
      />
    ) : null

  // List task options live in “…”. Calendar/kanban keep a slot for view-specific chrome.
  // Do not leave an empty flex-1 spacer here — it steals half the row from object pills.
  const optionalControls =
    canShowTaskControls &&
    !isInlineSearchOpen &&
    !isMobileSplitCompact &&
    (view === "calendar" || view === "kanban") ? (
      <div
        ref={optionalClusterRef}
        className="flex min-h-8 min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-hidden"
      >
        <div ref={inlineOptionalSlot.setSlotRef} className="flex shrink-0 flex-nowrap items-center gap-2" />
      </div>
    ) : null

  const chromeControls = !isMobileSplitCompact ? (
    <div className="flex shrink-0 items-center gap-0">
      {/* Focus expand (Maximize2). Progressive open-next uses PaneOpenIcon when provided. */}
      {canShowTaskControls ? (
        <IconTooltip label={isFocused ? "Restore layout" : "Expand"}>
          <button
            type="button"
            className={PANE_CHROME_ICON_BUTTON_CLASS}
            aria-label={isFocused ? "Restore layout" : "Expand pane"}
            onClick={() => setFocusInUrl(isFocused ? null : isSecondaryPane ? "bottom" : "top")}
          >
            {isFocused ? (
              <Minimize2 className={PANE_CHROME_ICON_CLASS} />
            ) : (
              <Maximize2 className={PANE_CHROME_ICON_CLASS} />
            )}
          </button>
        </IconTooltip>
      ) : null}
      {onOpenNextPane ? (
        <IconTooltip label={openNextPaneLabel}>
          <button
            type="button"
            className={PANE_CHROME_ICON_BUTTON_CLASS}
            aria-label={openNextPaneLabel}
            onClick={onOpenNextPane}
          >
            <PaneOpenIcon className={PANE_CHROME_ICON_CLASS} />
          </button>
        </IconTooltip>
      ) : null}
      {isSplitEnabled && isSecondaryPane && onExitSplit ? (
        <IconTooltip label="Exit split screen">
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1"
            aria-label="Exit split screen"
            onClick={onExitSplit}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </IconTooltip>
      ) : null}
    </div>
  ) : isSplitEnabled && isSecondaryPane && onExitSplit ? (
    <div className="ml-auto flex shrink-0 items-center gap-0">
      <IconTooltip label="Exit split screen">
        <button
          type="button"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1"
          aria-label="Exit split screen"
          onClick={onExitSplit}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </IconTooltip>
    </div>
  ) : null

  const objectOptionsControls = (canShowTaskControls || canShowSearch) && !isInlineSearchOpen ? (
    <div
      ref={rightClusterRef}
      className={cn("flex shrink-0 items-center gap-0", isMobileSplitCompact && "ml-auto")}
    >
      {canShowTaskControls ? viewModeControl : null}
      {canShowTaskControls ? filterControl : null}
      {canShowSearch ? (
        <IconTooltip label="Search">
          <button
            type="button"
            className={PANE_CHROME_ICON_BUTTON_CLASS}
            aria-label="Search"
            onClick={() => setIsInlineSearchOpen(true)}
          >
            <Search className={PANE_CHROME_ICON_CLASS} />
          </button>
        </IconTooltip>
      ) : null}
      {canShowTaskControls ? (
        <TasksPaneMoreMenu
          visible={showMoreMenu || Boolean(canShowTaskControls && view === "list")}
          ariaLabel={isMobileSplitCompact ? "More split options" : view === "list" ? "Sort and group" : "More actions"}
          triggerIcon={view === "list" ? "sort" : "more"}
        >
          {overflowMenuBody}
        </TasksPaneMoreMenu>
      ) : null}
    </div>
  ) : null

  const showObjectOptionsRow =
    isTopLikePane &&
    !isMobileSplitCompact &&
    !isInlineSearchOpen &&
    !minimalMode &&
    Boolean(objectOptionsControls)

  const showTopSwitcherRow =
    showObjectSwitcher || isInlineSearchOpen || (showPaneChrome && !showObjectOptionsRow)

  return (
    <TooltipProvider delayDuration={120}>
    <div className="flex w-full flex-shrink-0 flex-col bg-white">
      {showTopSwitcherRow ? (
      <div
        ref={containerRef}
        className={cn(
          "flex w-full min-w-0 items-center gap-1 bg-white",
          isMobileSplitCompact ? "h-10 min-h-10 px-4" : "h-10 min-h-10 max-h-10 overflow-hidden pl-4 pr-1.5",
          !isHomeObject && !showObjectOptionsRow && "border-b border-gray-200/80",
        )}
      >
        {canShowSearch && isInlineSearchOpen ? (
          <InlineSearchInput
            isOpen
            fullWidth
            value={inlineSearchValue}
            placeholder={searchPlaceholder}
            onChange={openInlineSearchHandlers.onChange}
            onClose={openInlineSearchHandlers.onClose}
            trailing={filterControl}
            leading={
              showObjectSwitcher && isTopLikePane && !isMobileSplitCompact ? (
                <LeftObjectSwitcher
                  value={leftObject}
                  onChange={onLeftObjectSelect}
                  forceCompact
                  isTaskView={canShowTaskControls}
                  className="h-6"
                />
              ) : null
            }
          />
        ) : (
          <>
            {showObjectSwitcher && isTopLikePane && !isMobileSplitCompact ? (
              <div
                ref={objectSwitcherRowRef}
                className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden whitespace-nowrap"
              >
                <LeftObjectSwitcher
                  value={leftObject}
                  onChange={onLeftObjectSelect}
                  containerWidth={objectSwitcherWidth}
                  isTaskView={canShowTaskControls}
                />
              </div>
            ) : null}
            {canShowTaskControls && view === "calendar" && !isMobileSplitCompact && !showObjectOptionsRow ? (
              <div
                ref={calendarToolbarRef as RefObject<HTMLDivElement>}
                className="flex shrink-0 flex-nowrap items-center gap-2"
              />
            ) : null}
            {!showObjectOptionsRow ? optionalControls : null}
            {!showObjectOptionsRow && !isTopLikePane ? objectOptionsControls : null}
            {isMobileSplitCompact ? objectOptionsControls : null}
          </>
        )}
        {showPaneChrome ? chromeControls : null}
      </div>
      ) : (
        <div ref={containerRef} className="hidden" aria-hidden />
      )}
      {showObjectOptionsRow ? (
        <div
          className={cn(
            TASK_DETAILS_HEADER_ROW_CLASS,
            "w-full min-w-0 gap-2 border-b border-gray-200/80 pl-4 pr-1.5",
          )}
        >
          <span className="flex h-7 shrink-0 items-center text-sm font-medium leading-none text-gray-900">
            {leftPaneObjectLabel(leftObject)}
          </span>
          {optionalControls}
          {canShowTaskControls && view === "calendar" ? (
            <div
              ref={calendarToolbarRef as RefObject<HTMLDivElement>}
              className="flex shrink-0 flex-nowrap items-center gap-2"
            />
          ) : null}
          <div className="ml-auto flex min-w-0 items-center">{objectOptionsControls}</div>
        </div>
      ) : null}
    </div>
    </TooltipProvider>
  )
}
