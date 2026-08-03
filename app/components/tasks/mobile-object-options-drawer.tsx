"use client"

import * as React from "react"
import { Check, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { ResizableBottomSheet } from "../ui/resizable-bottom-sheet"
import { useGroupingMenuModel, getListGroupByLabelFromParams } from "./grouping-dropdown"
import { useListColorByModel } from "./list-color-model"
import { useTasksListLegendStore } from "../../store/tasks-list-legend"
import type { MainViewMode } from "./tasks-pane-toolbar"
import type { MobileViewMode } from "./mobile-navigation"
import type { LeftPaneObject } from "../../lib/left-pane-object"
import { leftPaneObjectLabel } from "../../lib/left-pane-object"
import { getSplitViewLabel, getSplitViewOptions } from "../../lib/split-pane-view"
import {
  MobileSplitOverflowHost,
  pickOverflowMenuChild,
} from "./mobile-split-overflow-host"

type MentionsTab = "received" | "sent" | "unseen"

export interface MobileObjectOptionsDrawerProps {
  isOpen: boolean
  onClose: () => void
  object: LeftPaneObject
  /** True when the tasks object is showing the list view (group-by/date/ai controls only apply to list). */
  mobileView: MobileViewMode
  onViewChange: (view: MobileViewMode) => void
  /** Mobile vertical split is active — shared + split-specific controls live in this drawer. */
  isMobileSplitActive?: boolean
  /** Secondary (bottom) pane view when mobile split is active. */
  secondaryPaneView?: MainViewMode | null
  /** Exit mobile split (same handler as desktop split close). */
  onExitSplit?: () => void
  /** Registered overflow menu for the split bottom pane (calendar/kanban Navigate, Zoom, etc.). */
  splitOverflowMenuContent?: (() => React.ReactNode | null) | null
  /** Bumps when split overflow registration changes so drawer picks up calendar/kanban actions. */
  splitOverflowVersion?: number
  // Task list controls (mirror the desktop TasksPaneToolbar) ---------------------------------------
  editFields: unknown
  filterOptions: unknown
  filters: unknown
  setFilters: (filters: unknown) => void
  onOpenAllFilters: () => void
  pillButton: string
  router: unknown
  pathname: string
  params: URLSearchParams
  dateField: "delivery" | "publication"
  onDateFieldChange: (field: "delivery" | "publication") => void
  showSubtasks?: boolean
  onToggleSubtasks?: () => void
  isMultiselectMode: boolean
  onToggleMultiselect: () => void
  /** Current primary view (used to disable the matching "Split screen" target, like desktop). */
  primaryView: MainViewMode
  /** Enter split screen with the given secondary view (same handler desktop uses). */
  onSplitView: (view: MainViewMode) => void
  // Mentions sub-tab -------------------------------------------------------------------------------
  mentionsTab: string
  onMentionsTabChange: (tab: MentionsTab) => void
}

/** Level-1 row: a tappable category that either drills into a value list or fires an action. */
function CategoryRow({
  label,
  value,
  onClick,
}: {
  label: string
  value?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-gray-50 active:bg-gray-100"
    >
      <span className="text-sm font-medium text-gray-900">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-gray-500">
        {value ? <span className="max-w-[55vw] truncate text-xs">{value}</span> : null}
        <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
      </span>
    </button>
  )
}

/** Level-1 row: an inline On/Off toggle (no drill-in), mirroring the desktop overflow toggles. */
function ToggleRow({
  label,
  on,
  onToggle,
}: {
  label: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-gray-50 active:bg-gray-100"
    >
      <span className="text-sm font-medium text-gray-900">{label}</span>
      <span className="text-xs text-gray-500">{on ? "On" : "Off"}</span>
    </button>
  )
}

/** Level-1 row: a destructive/action row (e.g. close split). */
function ActionRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 active:bg-red-100"
    >
      {label}
    </button>
  )
}

/** Level-2 selectable value row (radio-style with a check on the active value). */
function ValueRow({
  label,
  active,
  onClick,
  disabled = false,
}: {
  label: string
  active: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition",
        disabled ? "cursor-not-allowed opacity-40" : "hover:bg-gray-50 active:bg-gray-100",
      )}
    >
      <span className={cn("text-sm", active ? "font-semibold text-gray-900" : "text-gray-700")}>{label}</span>
      {active ? <Check className="h-4 w-4 shrink-0 text-gray-900" /> : null}
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-gray-400">{children}</div>
  )
}

function BackHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="flex w-full items-center gap-1 border-b border-gray-100 px-2 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-50"
    >
      <ChevronLeft className="h-5 w-5" />
      <span>{title}</span>
    </button>
  )
}

const TASK_VIEWS: { value: MobileViewMode; label: string }[] = [
  { value: "list", label: "List" },
  { value: "calendar", label: "Calendar" },
  { value: "kanban", label: "Kanban" },
]

const MENTIONS_TABS: { value: MentionsTab; label: string }[] = [
  { value: "received", label: "Received" },
  { value: "sent", label: "Sent" },
  { value: "unseen", label: "Unseen" },
]

/** Identifiers for the second-level panels the task drawer can drill into. */
type TaskCategory =
  | "view"
  | "group"
  | "date"
  | "color"
  | "legend"
  | "splitMode"
  | "splitNavigate"
  | "splitZoom"
  | "splitGroupBy"
  | "splitSortBy"

const KANBAN_SORT_LABELS: Record<string, string> = {
  delivery_date: "Delivery date",
  publication_date: "Publication date",
  title: "Title",
  assigned_to_name: "Assignee",
  project_status_name: "Status",
  updated_at: "Updated",
}

const KANBAN_GROUP_LABELS: Record<string, string> = {
  status: "Status",
  assignee: "Assignee",
  project: "Project",
  content_type: "Content type",
  delivery_date: "Delivery date",
  publication_date: "Publication date",
}

function getKanbanGroupLabel(params: URLSearchParams): string {
  const raw = params.get("kanban_group_by") ?? "status"
  return KANBAN_GROUP_LABELS[raw] ?? "Status"
}

function getKanbanSortLabel(params: URLSearchParams): string {
  const raw = params.get("kanban_task_sort") ?? "delivery_date"
  return KANBAN_SORT_LABELS[raw] ?? "Delivery date"
}

/**
 * Mobile "..." bottom drawer for object main/list pages. For tasks it reproduces the desktop toolbar's
 * two-level structure (Level 1 categories → Level 2 values, with a back button) using the SAME option
 * definitions/handlers as desktop: group-by/order come from `useGroupingMenuModel` (shared with the
 * desktop dropdown/overflow), and view/date/AI-suggestions/multiselect/filters reuse the handlers wired
 * from `TasksLayout` (which write the same URL/query state as desktop). No mobile-only option logic.
 */
export function MobileObjectOptionsDrawer(props: MobileObjectOptionsDrawerProps) {
  const { isOpen, onClose, object } = props
  const isTasks = object === "tasks"
  const isMentions = object === "mentions"
  const isListView = props.mobileView === "list"
  const isMobileSplitActive = Boolean(props.isMobileSplitActive)
  const secondaryPaneView = props.secondaryPaneView ?? null

  // Shared group-by/order model (identical source as the desktop dropdown + overflow submenu).
  const grouping = useGroupingMenuModel()
  // Shared color-by model (same `list_color_by` param the desktop toolbar writes).
  const color = useListColorByModel()
  // Display-only legend (populated by the active list view, identical to the desktop legend pill).
  const legendEntries = useTasksListLegendStore((s) => s.entries)
  const legendTitle = useTasksListLegendStore((s) => s.title)

  // Two-level navigation: null = Level 1 (categories); a category id = Level 2 (its values).
  const [category, setCategory] = React.useState<TaskCategory | null>(null)

  // Always reset to Level 1 whenever the drawer (re)opens or the object changes.
  React.useEffect(() => {
    if (!isOpen) setCategory(null)
  }, [isOpen])
  React.useEffect(() => {
    setCategory(null)
  }, [object])

  const viewLabel = TASK_VIEWS.find((v) => v.value === props.mobileView)?.label ?? "List"
  const dateLabel = props.dateField === "publication" ? "Publication date" : "Delivery date"
  const groupLabel = getListGroupByLabelFromParams(props.params.get("groupBy"))
  const colorLabel = color.options.find((o) => o.value === color.colorMode)?.label ?? "Off"
  const splitModeLabel = secondaryPaneView ? getSplitViewLabel(secondaryPaneView) : "View"
  const calendarZoomLabel = props.params.get("calendar_mode") === "week" ? "Week" : "Month"
  const kanbanGroupLabel = getKanbanGroupLabel(props.params)
  const kanbanSortLabel = getKanbanSortLabel(props.params)

  const splitOverflowContent = React.useMemo(
    () => props.splitOverflowMenuContent?.() ?? null,
    [props.splitOverflowMenuContent, props.splitOverflowVersion, secondaryPaneView],
  )

  const showSharedSubtasks =
    isMobileSplitActive &&
    props.onToggleSubtasks != null &&
    (props.primaryView === "calendar" ||
      props.primaryView === "kanban" ||
      secondaryPaneView === "calendar" ||
      secondaryPaneView === "kanban")

  const categoryTitle: Record<TaskCategory, string> = {
    view: "View",
    group: "Group by",
    date: "Date",
    color: "Color",
    legend: "Legend",
    splitMode: "Split mode",
    splitNavigate: "Navigate",
    splitZoom: "Zoom",
    splitGroupBy: "Group by",
    splitSortBy: "Sort by",
  }

  const sheetTitle =
    isTasks && category
      ? categoryTitle[category]
      : `${leftPaneObjectLabel(object)} options`

  const renderSplitSharedSection = () => (
    <>
      <SectionLabel>Shared</SectionLabel>
      <CategoryRow label="Date" value={dateLabel} onClick={() => setCategory("date")} />
      {showSharedSubtasks ? (
        <ToggleRow
          label="Subtasks"
          on={Boolean(props.showSubtasks)}
          onToggle={props.onToggleSubtasks!}
        />
      ) : null}
      <CategoryRow label="Color" value={colorLabel} onClick={() => setCategory("color")} />
      <CategoryRow label="Legend" onClick={() => setCategory("legend")} />
      <ToggleRow label="Multiselect" on={props.isMultiselectMode} onToggle={props.onToggleMultiselect} />
    </>
  )

  const renderSplitViewSection = () => (
    <>
      <SectionLabel>Split view</SectionLabel>
      <CategoryRow label="Split mode" value={splitModeLabel} onClick={() => setCategory("splitMode")} />
      {secondaryPaneView === "calendar" ? (
        <>
          <CategoryRow label="Navigate" onClick={() => setCategory("splitNavigate")} />
          <CategoryRow label="Zoom" value={calendarZoomLabel} onClick={() => setCategory("splitZoom")} />
        </>
      ) : null}
      {secondaryPaneView === "kanban" ? (
        <>
          <CategoryRow label="Group by" value={kanbanGroupLabel} onClick={() => setCategory("splitGroupBy")} />
          <CategoryRow label="Sort by" value={kanbanSortLabel} onClick={() => setCategory("splitSortBy")} />
        </>
      ) : null}
      {props.onExitSplit ? (
        <ActionRow
          label="Close split view"
          onClick={() => {
            props.onExitSplit?.()
            onClose()
          }}
        />
      ) : null}
      <CategoryRow label="View" value={viewLabel} onClick={() => setCategory("view")} />
      {props.primaryView === "list" ? (
        <CategoryRow label="Group by" value={groupLabel} onClick={() => setCategory("group")} />
      ) : null}
    </>
  )

  const renderTaskLevel1 = () => (
    <div className="flex flex-col py-1">
      {isMobileSplitActive ? (
        <>
          {renderSplitSharedSection()}
          {renderSplitViewSection()}
        </>
      ) : (
        <>
          <CategoryRow label="View" value={viewLabel} onClick={() => setCategory("view")} />
          {isListView ? (
            <>
              <CategoryRow label="Group by" value={groupLabel} onClick={() => setCategory("group")} />
              <CategoryRow label="Date" value={dateLabel} onClick={() => setCategory("date")} />
              <CategoryRow label="Color" value={colorLabel} onClick={() => setCategory("color")} />
              <CategoryRow label="Legend" onClick={() => setCategory("legend")} />
              <ToggleRow label="Multiselect" on={props.isMultiselectMode} onToggle={props.onToggleMultiselect} />
            </>
          ) : null}
        </>
      )}
      <CategoryRow
        label="Filters"
        onClick={() => {
          onClose()
          props.onOpenAllFilters()
        }}
      />
    </div>
  )

  const renderSplitOverflowPanel = (title: TaskCategory, childIndex: number) => (
    <div className="flex flex-col py-1">
      <BackHeader title={categoryTitle[title]} onBack={() => setCategory(null)} />
      <div className="px-2 py-2">
        <MobileSplitOverflowHost>
          {pickOverflowMenuChild(splitOverflowContent, childIndex)}
        </MobileSplitOverflowHost>
      </div>
    </div>
  )

  const renderTaskLevel2 = (active: TaskCategory) => {
    if (active === "splitMode") {
      const options = getSplitViewOptions(props.primaryView)
      return (
        <div className="flex flex-col py-1">
          <BackHeader title="Split mode" onBack={() => setCategory(null)} />
          {options.map((view) => (
            <ValueRow
              key={view}
              label={getSplitViewLabel(view)}
              active={secondaryPaneView === view}
              onClick={() => {
                props.onSplitView(view)
                setCategory(null)
              }}
            />
          ))}
        </div>
      )
    }
    if (active === "splitNavigate") {
      return renderSplitOverflowPanel("splitNavigate", 0)
    }
    if (active === "splitZoom") {
      return renderSplitOverflowPanel("splitZoom", 1)
    }
    if (active === "splitGroupBy") {
      return renderSplitOverflowPanel("splitGroupBy", 0)
    }
    if (active === "splitSortBy") {
      return renderSplitOverflowPanel("splitSortBy", 1)
    }
    if (active === "view") {
      return (
        <div className="flex flex-col py-1">
          <BackHeader title="View" onBack={() => setCategory(null)} />
          {TASK_VIEWS.map((v) => (
            <ValueRow
              key={v.value}
              label={v.label}
              active={props.mobileView === v.value}
              onClick={() => {
                props.onViewChange(v.value)
                setCategory(null)
              }}
            />
          ))}
          {/* Split screen — same URL state as desktop; mobile renders top/bottom panes. */}
          <SectionLabel>Split screen</SectionLabel>
          {getSplitViewOptions(props.primaryView).map((view) => (
            <ValueRow
              key={view}
              label={getSplitViewLabel(view)}
              active={false}
              disabled={props.primaryView === view}
              onClick={() => {
                props.onSplitView(view)
                setCategory(null)
                onClose()
              }}
            />
          ))}
        </div>
      )
    }
    if (active === "color") {
      return (
        <div className="flex flex-col py-1">
          <BackHeader title="Color" onBack={() => setCategory(null)} />
          {color.options.map((opt) => (
            <ValueRow
              key={opt.label}
              label={opt.label}
              active={color.colorMode === opt.value}
              onClick={() => {
                color.setColorBy(opt.value)
                setCategory(null)
              }}
            />
          ))}
        </div>
      )
    }
    if (active === "legend") {
      return (
        <div className="flex flex-col py-1">
          <BackHeader title={legendTitle || "Legend"} onBack={() => setCategory(null)} />
          {legendEntries.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">No items yet</div>
          ) : (
            legendEntries.map((entry) => (
              <div key={entry.key} className="flex items-center gap-3 px-4 py-2.5">
                <span className={cn("inline-block h-3 w-3 shrink-0 rounded-sm", entry.colorClass)} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{entry.label}</span>
              </div>
            ))
          )}
        </div>
      )
    }
    if (active === "date") {
      return (
        <div className="flex flex-col py-1">
          <BackHeader title="Date" onBack={() => setCategory(null)} />
          <ValueRow
            label="Delivery date"
            active={props.dateField === "delivery"}
            onClick={() => {
              props.onDateFieldChange("delivery")
              setCategory(null)
            }}
          />
          <ValueRow
            label="Publication date"
            active={props.dateField === "publication"}
            onClick={() => {
              props.onDateFieldChange("publication")
              setCategory(null)
            }}
          />
        </div>
      )
    }
    // Group by (with conditional group-order values), driven by the shared model.
    return (
      <div className="flex flex-col py-1">
        <BackHeader title="Group by" onBack={() => setCategory(null)} />
        {grouping.visibleOptions.map((opt) => (
          <ValueRow
            key={String(opt.value)}
            label={opt.label}
            active={grouping.selectedGroupBy === opt.value}
            onClick={() => grouping.selectGroup(opt.value)}
          />
        ))}
        {grouping.selectedGroupBy && grouping.groupOrderOptions.length > 0 ? (
          <>
            <SectionLabel>Order</SectionLabel>
            {grouping.groupOrderOptions.map((order) => (
              <ValueRow
                key={order.value}
                label={order.label}
                active={grouping.effectiveGroupOrder === order.value}
                onClick={() => grouping.setGroupOrder(order.value)}
              />
            ))}
          </>
        ) : null}
      </div>
    )
  }

  return (
    <ResizableBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      initialHeight={0.6}
      minHeight={0.3}
      maxHeight={0.95}
      title={sheetTitle}
    >
      {isTasks ? (
        category ? (
          renderTaskLevel2(category)
        ) : (
          renderTaskLevel1()
        )
      ) : isMentions ? (
        <div className="flex flex-col py-1">
          <SectionLabel>Show</SectionLabel>
          {MENTIONS_TABS.map((tab) => (
            <ValueRow
              key={tab.value}
              label={tab.label}
              active={props.mentionsTab === tab.value}
              onClick={() => {
                props.onMentionsTabChange(tab.value)
                onClose()
              }}
            />
          ))}
        </div>
      ) : (
        <div className="px-4 py-8 text-center text-sm text-gray-500">
          No additional list options for {leftPaneObjectLabel(object).toLowerCase()}.
        </div>
      )}
    </ResizableBottomSheet>
  )
}
