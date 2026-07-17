"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  GLOBAL_SEARCH_ENTITY_TYPES,
  type GlobalSearchCountsMap,
  type GlobalSearchDocument,
  type GlobalSearchItemEntityType,
  type GlobalSearchSection,
} from "../../lib/global-search-types"
import { GlobalSearchAllSectionCards } from "./global-search-all-tab-cards"
import { SeeMoreOutlineButton } from "../tasks/task-overview-readonly-table"
import {
  OBJECT_PANE_SECTION_X_CLASS,
  ObjectPaneScrollShell,
  objectPaneCenteredStateClass,
} from "./object-pane-content"

const SECTION_ORDER: Record<string, number> = {
  recently_opened: 0,
  task_group: 5,
  tasks_assigned_to_me: 10,
  assigned_to_me: 10,
  tasks_upcoming_delivery: 20,
  upcoming_delivery: 20,
  tasks_upcoming_publication: 30,
  upcoming_publication: 30,
  tasks_overdue_delivery: 40,
  overdue_delivery: 40,
  tasks_overdue_publication: 50,
  overdue_publication: 50,
  task: 60,
  projects: 70,
  project: 70,
  mentions: 100,
  users: 80,
  user: 80,
  teams: 90,
  team: 90,
  mention: 100,
  ai_threads: 110,
}

const TASK_SECTION_TYPES = new Set([
  "task_group",
  "tasks_assigned_to_me",
  "assigned_to_me",
  "tasks_upcoming_delivery",
  "upcoming_delivery",
  "tasks_upcoming_publication",
  "upcoming_publication",
  "tasks_overdue_delivery",
  "overdue_delivery",
  "tasks_overdue_publication",
  "overdue_publication",
  "task",
])

const TASK_GROUP_TAB_ORDER = [
  "tasks_assigned_to_me",
  "assigned_to_me",
  "tasks_upcoming_delivery",
  "upcoming_delivery",
  "tasks_upcoming_publication",
  "upcoming_publication",
  "tasks_overdue_delivery",
  "overdue_delivery",
  "tasks_overdue_publication",
  "overdue_publication",
] as const

const TASKS_DISCOVERY_SECTION_KEY = "tasks:Tasks"

function isRecentSearchesSection(section: GlobalSearchSection): boolean {
  return (
    section.type === "recent_searches" ||
    (section.label?.trim().toLowerCase() ?? "") === "recent searches"
  )
}

function flattenSectionItems(section: GlobalSearchSection): GlobalSearchDocument[] {
  return [
    ...section.items,
    ...(section.sections ?? []).flatMap((nestedSection) => flattenSectionItems(nestedSection)),
  ]
}

function getSectionCountKey(section: GlobalSearchSection): GlobalSearchItemEntityType | null {
  if (section.type === "task_group") return "task"
  return section.entity_type
}

function resolveSectionCount(section: GlobalSearchSection, counts: GlobalSearchCountsMap): number | null {
  if (typeof counts[section.type] === "number") return counts[section.type] ?? null
  const key = getSectionCountKey(section)
  if (key && typeof counts[key] === "number") return counts[key] ?? null
  return typeof section.total_count === "number" ? section.total_count : null
}

export function GlobalSearchAllTabPane({
  sections,
  viewScope,
  visibleEntityTypes,
  isLoading,
  sectionCounts,
  isDiscoveryMode,
  hasCommittedTypeFilter,
  onResultSelect,
  onShowMore,
  onSeeMoreTasks,
}: {
  sections: GlobalSearchSection[]
  viewScope: string
  visibleEntityTypes: GlobalSearchItemEntityType[]
  isLoading: boolean
  sectionCounts: GlobalSearchCountsMap
  isDiscoveryMode: boolean
  hasCommittedTypeFilter: boolean
  onResultSelect: (item: GlobalSearchSection["items"][number]) => void
  onShowMore: (section: GlobalSearchSection) => void
  /** Opens the full Tasks pane with filters matching the active Home task subsection. */
  onSeeMoreTasks?: (sectionType: string) => void
}) {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [activeTaskGroupTabType, setActiveTaskGroupTabType] = useState<string | null>(null)

  const orderedSections = useMemo(
    () =>
      sections
        .filter((section) => {
          if (isRecentSearchesSection(section)) return false
          if (section.entity_type === "project_briefing" || section.type === "project_briefing") return false
          if (section.type === "ai_threads") return !hasCommittedTypeFilter || visibleEntityTypes.includes("ai_thread")
          if (section.type === "task_group") return !hasCommittedTypeFilter || visibleEntityTypes.includes("task")
          if (!section.entity_type) return true
          if (section.entity_type === "ai_thread") return !hasCommittedTypeFilter || visibleEntityTypes.includes("ai_thread")
          if (visibleEntityTypes.length >= GLOBAL_SEARCH_ENTITY_TYPES.length) return true
          return visibleEntityTypes.includes(section.entity_type)
        })
        .sort((left, right) => {
          const leftRank = SECTION_ORDER[left.type] ?? 999
          const rightRank = SECTION_ORDER[right.type] ?? 999
          return leftRank - rightRank
        }),
    [hasCommittedTypeFilter, sections, visibleEntityTypes],
  )
  const flatItems = useMemo(
    () => orderedSections.flatMap((section) => flattenSectionItems(section)),
    [orderedSections],
  )
  const recentlyOpenedSections = orderedSections.filter((section) => section.type === "recently_opened")
  const sectionsWithoutRecentlyOpened = orderedSections.filter((section) => section.type !== "recently_opened")
  const taskSections = sectionsWithoutRecentlyOpened.filter((section) => TASK_SECTION_TYPES.has(section.type))
  const otherSections = sectionsWithoutRecentlyOpened.filter((section) => !TASK_SECTION_TYPES.has(section.type))

  const taskGroupTabs = useMemo(() => {
    const taskGroupSection = taskSections.find((section) => section.type === "task_group")
    const nested = (taskGroupSection?.sections ?? []).filter((section) => section.items.length > 0)
    if (nested.length > 0) {
      return TASK_GROUP_TAB_ORDER
        .map((type) => nested.find((section) => section.type === type))
        .filter(Boolean) as GlobalSearchSection[]
    }
    return TASK_GROUP_TAB_ORDER
      .map((type) => taskSections.find((section) => section.type === type))
      .filter(Boolean) as GlobalSearchSection[]
  }, [taskSections])

  useEffect(() => {
    if (taskGroupTabs.length === 0) {
      if (activeTaskGroupTabType != null) setActiveTaskGroupTabType(null)
      return
    }
    const hasActive = taskGroupTabs.some((section) => section.type === activeTaskGroupTabType)
    if (hasActive) return
    const defaultTab =
      taskGroupTabs.find((section) => section.type === "tasks_assigned_to_me" || section.type === "assigned_to_me") ??
      taskGroupTabs[0]
    setActiveTaskGroupTabType(defaultTab?.type ?? null)
  }, [activeTaskGroupTabType, taskGroupTabs])

  if (isLoading) {
    return (
      <ObjectPaneScrollShell>
        <div className={objectPaneCenteredStateClass()}>Loading results...</div>
      </ObjectPaneScrollShell>
    )
  }

  const hasAnyResults = flatItems.length > 0
  if (!hasAnyResults) {
    return (
      <ObjectPaneScrollShell>
        <div className={objectPaneCenteredStateClass()}>No results found.</div>
      </ObjectPaneScrollShell>
    )
  }

  const toggleSection = (sectionKey: string) => {
    setCollapsedSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }))
  }

  const isTasksDiscoveryCollapsed = Boolean(collapsedSections[TASKS_DISCOVERY_SECTION_KEY])

  const renderSection = (section: GlobalSearchSection) => {
    const sectionKey = `${section.type}:${section.label}`
    const isCollapsed = Boolean(collapsedSections[sectionKey])
    if (section.type === "task_group") {
      const nestedSections = (section.sections ?? []).filter((nestedSection) => nestedSection.items.length > 0)
      if (nestedSections.length === 0) return null

      return (
        <section key={sectionKey} className="space-y-4">
          <div className={cn("flex items-center justify-between gap-3", OBJECT_PANE_SECTION_X_CLASS)}>
            <button
              type="button"
              onClick={() => toggleSection(sectionKey)}
              className="flex min-w-0 items-center gap-2 text-left text-sm font-semibold text-gray-900"
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
              <span className="truncate">{section.label}</span>
              {typeof resolveSectionCount(section, sectionCounts) === "number" ? (
                <span className="text-sm font-medium text-gray-500">{resolveSectionCount(section, sectionCounts)}</span>
              ) : null}
            </button>
          </div>
          {!isCollapsed ? <div className="space-y-4">{nestedSections.map(renderSection)}</div> : null}
        </section>
      )
    }

    if (section.items.length === 0) return null
    const count = resolveSectionCount(section, sectionCounts)
    const isTaskSubgroup = TASK_SECTION_TYPES.has(section.type) && section.type !== "task_group" && section.type !== "task"
    const canShowMore =
      isTaskSubgroup ||
      section.type === "projects" ||
      section.type === "project" ||
      section.type === "mentions" ||
      section.type === "mention" ||
      (!!section.entity_type && typeof count === "number" && count > section.items.length)

    return (
      <section key={sectionKey} className="space-y-3">
        <div className={cn("flex items-center justify-between gap-3", OBJECT_PANE_SECTION_X_CLASS)}>
          <button
            type="button"
            onClick={() => toggleSection(sectionKey)}
            className="flex min-w-0 items-center gap-2 text-left text-sm font-semibold text-gray-900"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
            <span className="truncate">
              {section.label}
              {typeof count === "number" ? <span className="text-sm font-medium text-gray-500"> {count}</span> : null}
            </span>
          </button>
          {canShowMore ? (
            <button
              type="button"
              onClick={() => onShowMore(section)}
              className="shrink-0 text-sm font-medium text-gray-500 transition hover:text-gray-900"
            >
              Show more
            </button>
          ) : null}
        </div>
        {!isCollapsed ? (
          <>
            <GlobalSearchAllSectionCards
              section={section}
              viewScope={viewScope}
              onSelect={onResultSelect as (item: GlobalSearchDocument) => void}
            />
            {isTaskSubgroup && onSeeMoreTasks ? (
              <div className={OBJECT_PANE_SECTION_X_CLASS}>
                <SeeMoreOutlineButton onClick={() => onSeeMoreTasks(section.type)} />
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    )
  }

  return (
    <ObjectPaneScrollShell>
      <div className="flex min-h-full flex-col gap-8">
        {recentlyOpenedSections.map(renderSection)}
        {isDiscoveryMode && taskGroupTabs.length > 0 ? (
          <section className="space-y-3">
            <div className={cn("flex items-center justify-between gap-3", OBJECT_PANE_SECTION_X_CLASS)}>
              <button
                type="button"
                onClick={() => toggleSection(TASKS_DISCOVERY_SECTION_KEY)}
                className="flex min-w-0 items-center gap-2 text-left text-sm font-semibold text-gray-900"
              >
                {isTasksDiscoveryCollapsed ? (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate">Tasks</span>
                {typeof sectionCounts.task === "number" ? (
                  <span className="text-sm font-medium text-gray-500">{sectionCounts.task}</span>
                ) : null}
              </button>
            </div>
            {!isTasksDiscoveryCollapsed ? (
              <>
                <div className={cn("flex flex-wrap gap-1", OBJECT_PANE_SECTION_X_CLASS)}>
                  {taskGroupTabs.map((section) => {
                    const isActive = section.type === activeTaskGroupTabType
                    const count = resolveSectionCount(section, sectionCounts)
                    return (
                      <button
                        key={`task-tab:${section.type}`}
                        type="button"
                        onClick={() => setActiveTaskGroupTabType(section.type)}
                        className={
                          isActive
                            ? "inline-flex items-center gap-1 rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white"
                            : "inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                        }
                      >
                        <span>{section.label}</span>
                        {typeof count === "number" ? <span className="opacity-80">{count}</span> : null}
                      </button>
                    )
                  })}
                </div>
                {taskGroupTabs.map((section) =>
                  section.type === activeTaskGroupTabType ? (
                    <div key={`task-tab-content:${section.type}`}>
                      <GlobalSearchAllSectionCards
                        section={section}
                        viewScope={viewScope}
                        onSelect={onResultSelect as (item: GlobalSearchDocument) => void}
                      />
                      {onSeeMoreTasks ? (
                        <div className={OBJECT_PANE_SECTION_X_CLASS}>
                          <SeeMoreOutlineButton onClick={() => onSeeMoreTasks(section.type)} />
                        </div>
                      ) : null}
                    </div>
                  ) : null,
                )}
              </>
            ) : null}
          </section>
        ) : null}
          {(!isDiscoveryMode || taskGroupTabs.length === 0) && taskSections.length > 0 ? (
            <div className="space-y-4">{taskSections.map(renderSection)}</div>
          ) : null}
          {otherSections.map(renderSection)}
        </div>
    </ObjectPaneScrollShell>
  )
}
