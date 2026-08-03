"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import {
  AtSign,
  Bot,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderKanban,
  ListTodo,
  MoreHorizontal,
  Pin,
  Plus,
  User,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu"
import { useCenterPaneTabsStore } from "../../store/center-pane-tabs"
import {
  HOME_SIDEBAR_PAGE_SIZE,
  fetchHomeRecentAiChats,
  fetchHomeRecentArtifacts,
  fetchHomeRecentMentions,
  fetchHomeRecentProjects,
  fetchHomeRecentTasks,
  fetchHomeRecentUsers,
  type HomeRecentItem,
} from "../../lib/services/home-sidebar-recents"
import {
  pinnedItemKey,
  readHomeSidebarPinnedItems,
  writeHomeSidebarPinnedItems,
  type HomeSidebarPinnedItem,
  type HomeSidebarRecentsFeedKey,
} from "../../lib/home-sidebar-recents-cache"
import type { SearchObjectRoute } from "../../lib/search-routing"
import type { HeaderCreateType } from "./use-header-create-flow"
import { openArtifactCenterTab } from "../../../features/artifacts/open-artifact-center-tab"

export const OPEN_HEADER_CREATE_EVENT = "app:open-header-create"
export const TOGGLE_AI_PANE_EVENT = "app:toggle-ai-pane"
export const TOGGLE_RESEARCH_EVENT = "app:toggle-research"
export const OPEN_RESEARCH_EVENT = "app:open-research"
/** @deprecated Prefer TOGGLE_RESEARCH_EVENT. */
export const TOGGLE_KEYWORD_RESEARCH_EVENT = "app:toggle-keyword-research"
/** Open Research (keywords tab). Optional seed query. */
export const OPEN_KEYWORD_RESEARCH_EVENT = "app:open-keyword-research"
/** @deprecated Prefer TOGGLE_RESEARCH_EVENT. */
export const TOGGLE_PROMPT_RESEARCH_EVENT = "app:toggle-prompt-research"
/** Open Research (prompts tab). Optional seed query. */
export const OPEN_PROMPT_RESEARCH_EVENT = "app:open-prompt-research"

export type OpenHeaderCreateDetail = {
  type: HeaderCreateType | "ai"
}

export type OpenResearchDetail = {
  query?: string | null
  tab?: "keywords" | "prompts" | null
}

export type OpenKeywordResearchDetail = {
  query?: string | null
}

export type OpenPromptResearchDetail = {
  query?: string | null
}

type FeedSectionKey = HomeSidebarRecentsFeedKey

type MentionRecentItem = HomeRecentItem & {
  mentionId?: string | null
  threadId?: string | null
}

type UnifiedRecentItem = {
  feedKey: FeedSectionKey
  id: string
  title: string
  recentAt: string | null
  mentionId?: string | null
  threadId?: string | null
}

type SidebarObjectDef = {
  object: SearchObjectRoute
  name: string
  icon: LucideIcon
  feedKey: FeedSectionKey
  createType?: HeaderCreateType | "ai"
}

const SIDEBAR_NAV_OBJECTS: SidebarObjectDef[] = [
  { object: "task", name: "Tasks", icon: ListTodo, feedKey: "tasks", createType: "task" },
  { object: "project", name: "Projects", icon: FolderKanban, feedKey: "projects", createType: "project" },
  { object: "mention", name: "Mentions", icon: AtSign, feedKey: "mentions" },
  { object: "user", name: "Users", icon: User, feedKey: "users", createType: "user" },
  { object: "ai_thread", name: "AI chats", icon: Bot, feedKey: "ai_chats", createType: "ai" },
  { object: "artifact", name: "Artifacts", icon: FileText, feedKey: "artifacts" },
]

const FEED_ICON: Record<FeedSectionKey, LucideIcon> = {
  tasks: ListTodo,
  projects: FolderKanban,
  mentions: AtSign,
  users: User,
  ai_chats: Bot,
  artifacts: FileText,
}

const FEED_LABEL: Record<FeedSectionKey, string> = {
  tasks: "Task",
  projects: "Project",
  mentions: "Mention",
  users: "User",
  ai_chats: "AI chat",
  artifacts: "Artifact",
}

const PINNED_COLLAPSED_KEY = "sidebar-pinned-collapsed-v1"
const RECENTS_COLLAPSED_KEY = "sidebar-recents-collapsed-v1"

function recentAtMs(value: string | null | undefined): number {
  if (!value) return 0
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : 0
}

function SectionHeader({
  label,
  collapsed,
  onToggle,
}: {
  label: string
  collapsed: boolean
  onToggle: () => void
}) {
  const Chevron = collapsed ? ChevronRight : ChevronDown
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-1 rounded-md px-3 py-2 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50"
    >
      <span className="truncate">{label}</span>
      <Chevron className="h-4 w-4 shrink-0 text-gray-500" />
    </button>
  )
}

function NavRow({
  icon: Icon,
  label,
  active,
  onClick,
  trailing,
  badge,
}: {
  icon: LucideIcon
  label: string
  active?: boolean
  onClick: () => void
  trailing?: React.ReactNode
  badge?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "group relative flex w-full items-center rounded-md transition-colors",
        active ? "bg-gray-100" : "hover:bg-gray-50",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-normal text-gray-800"
      >
        <Icon className="h-[18px] w-[18px] shrink-0 text-gray-700" strokeWidth={1.75} />
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate">{label}</span>
        {badge}
      </button>
      {trailing}
    </div>
  )
}

function TitleRow({
  title,
  onClick,
  trailing,
  leading,
}: {
  title: string
  onClick: () => void
  trailing?: React.ReactNode
  leading?: React.ReactNode
}) {
  return (
    <div className="group relative flex w-full items-center">
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 truncate rounded-md px-3 py-1.5 text-left text-sm font-normal text-gray-800 hover:bg-gray-50"
        title={title}
      >
        {leading}
        <span className="min-w-0 truncate">{title}</span>
      </button>
      {trailing ? (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {trailing}
        </div>
      ) : null}
    </div>
  )
}

function ItemOptionsMenu({
  isPinned,
  onTogglePin,
  extraItems,
}: {
  isPinned: boolean
  onTogglePin: () => void
  extraItems?: React.ReactNode
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-800"
          aria-label="Item options"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        <DropdownMenuItem onSelect={onTogglePin}>
          {isPinned ? "Unpin" : "Pin to top"}
        </DropdownMenuItem>
        {extraItems}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function InfiniteSentinel({
  enabled,
  onVisible,
  rootRef,
}: {
  enabled: boolean
  onVisible: () => void
  rootRef: React.RefObject<HTMLElement | null>
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!enabled) return
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onVisible()
      },
      { root: rootRef.current, rootMargin: "240px", threshold: 0 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled, onVisible, rootRef])

  return <div ref={ref} className="h-4 w-full" aria-hidden />
}

function useRecentSectionQuery(
  key: FeedSectionKey,
  fetcher: (args: { offset: number; limit: number }) => Promise<HomeRecentItem[]>,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: ["home-sidebar-recents", key],
    queryFn: ({ pageParam }) =>
      fetcher({ offset: pageParam as number, limit: HOME_SIDEBAR_PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < HOME_SIDEBAR_PAGE_SIZE
        ? undefined
        : allPages.reduce((sum, page) => sum + page.length, 0),
    enabled,
    staleTime: 15_000,
  })
}

export function dispatchOpenHeaderCreate(type: HeaderCreateType | "ai") {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<OpenHeaderCreateDetail>(OPEN_HEADER_CREATE_EVENT, { detail: { type } }),
  )
}

export function SidebarHomeFeed({
  showExpandedChrome,
  isObjectActive,
  hasUnseenMentions,
  onNavigateObject,
  onOpenProject,
  onOpenProjectDefinitions,
  onOpenTask,
  onOpenMention,
  onOpenUser,
  onOpenAiChat,
  onCreateAiChat,
}: {
  showExpandedChrome: boolean
  isObjectActive: (object: SearchObjectRoute) => boolean
  hasUnseenMentions: boolean
  onNavigateObject: (object: SearchObjectRoute) => void
  onOpenProject: (projectId: number) => void
  onOpenProjectDefinitions: (projectId: number) => void
  onOpenTask: (taskId: number) => void
  onOpenMention: (args: { threadId: string; mentionId?: string | null }) => void
  onOpenUser: (userId: number) => void
  onOpenAiChat: (threadId: string) => void
  onCreateAiChat: () => void
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false)
  const [recentsCollapsed, setRecentsCollapsed] = useState(false)
  const [pinnedItems, setPinnedItems] = useState<HomeSidebarPinnedItem[]>([])

  useEffect(() => {
    setPinnedItems(readHomeSidebarPinnedItems())
    try {
      setPinnedCollapsed(window.localStorage.getItem(PINNED_COLLAPSED_KEY) === "1")
      setRecentsCollapsed(window.localStorage.getItem(RECENTS_COLLAPSED_KEY) === "1")
    } catch {
      // ignore
    }
  }, [])

  const togglePinnedCollapsed = useCallback(() => {
    setPinnedCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(PINNED_COLLAPSED_KEY, next ? "1" : "0")
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const toggleRecentsCollapsed = useCallback(() => {
    setRecentsCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(RECENTS_COLLAPSED_KEY, next ? "1" : "0")
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const pinnedKeySet = useMemo(
    () => new Set(pinnedItems.map((item) => pinnedItemKey(item.feedKey, item.id))),
    [pinnedItems],
  )

  const isPinned = useCallback(
    (feedKey: FeedSectionKey, id: string) => pinnedKeySet.has(pinnedItemKey(feedKey, id)),
    [pinnedKeySet],
  )

  const togglePin = useCallback((item: HomeSidebarPinnedItem) => {
    setPinnedItems((prev) => {
      const key = pinnedItemKey(item.feedKey, item.id)
      const exists = prev.some((row) => pinnedItemKey(row.feedKey, row.id) === key)
      const next = exists
        ? prev.filter((row) => pinnedItemKey(row.feedKey, row.id) !== key)
        : [{ ...item, pinnedAt: new Date().toISOString() }, ...prev]
      writeHomeSidebarPinnedItems(next)
      return next
    })
  }, [])

  const recentsEnabled = showExpandedChrome && !recentsCollapsed

  const projectsQuery = useRecentSectionQuery("projects", fetchHomeRecentProjects, recentsEnabled)
  const tasksQuery = useRecentSectionQuery("tasks", fetchHomeRecentTasks, recentsEnabled)
  const mentionsQuery = useRecentSectionQuery("mentions", fetchHomeRecentMentions, recentsEnabled)
  const usersQuery = useRecentSectionQuery("users", fetchHomeRecentUsers, recentsEnabled)
  const aiQuery = useRecentSectionQuery("ai_chats", fetchHomeRecentAiChats, recentsEnabled)
  const artifactsQuery = useRecentSectionQuery("artifacts", fetchHomeRecentArtifacts, recentsEnabled)

  const unifiedRecents = useMemo(() => {
    const rows: UnifiedRecentItem[] = []

    for (const item of projectsQuery.data?.pages.flat() ?? []) {
      if (isPinned("projects", item.id)) continue
      rows.push({
        feedKey: "projects",
        id: item.id,
        title: item.title,
        recentAt: item.recentAt,
      })
    }
    for (const item of tasksQuery.data?.pages.flat() ?? []) {
      if (isPinned("tasks", item.id)) continue
      rows.push({
        feedKey: "tasks",
        id: item.id,
        title: item.title,
        recentAt: item.recentAt,
      })
    }
    for (const item of (mentionsQuery.data?.pages.flat() ?? []) as MentionRecentItem[]) {
      if (isPinned("mentions", item.id)) continue
      rows.push({
        feedKey: "mentions",
        id: item.id,
        title: item.title,
        recentAt: item.recentAt,
        mentionId: item.mentionId,
        threadId: item.threadId,
      })
    }
    for (const item of usersQuery.data?.pages.flat() ?? []) {
      if (isPinned("users", item.id)) continue
      rows.push({
        feedKey: "users",
        id: item.id,
        title: item.title,
        recentAt: item.recentAt,
      })
    }
    for (const item of aiQuery.data?.pages.flat() ?? []) {
      if (isPinned("ai_chats", item.id)) continue
      rows.push({
        feedKey: "ai_chats",
        id: item.id,
        title: item.title,
        recentAt: item.recentAt,
      })
    }
    for (const item of artifactsQuery.data?.pages.flat() ?? []) {
      if (isPinned("artifacts", item.id)) continue
      rows.push({
        feedKey: "artifacts",
        id: item.id,
        title: item.title,
        recentAt: item.recentAt,
      })
    }

    rows.sort((a, b) => {
      const delta = recentAtMs(b.recentAt) - recentAtMs(a.recentAt)
      if (delta !== 0) return delta
      if (a.feedKey !== b.feedKey) return a.feedKey.localeCompare(b.feedKey)
      return a.id.localeCompare(b.id)
    })
    return rows
  }, [
    projectsQuery.data,
    tasksQuery.data,
    mentionsQuery.data,
    usersQuery.data,
    aiQuery.data,
    artifactsQuery.data,
    isPinned,
  ])

  // Keep pinned titles fresh when recents refetch.
  useEffect(() => {
    if (pinnedItems.length === 0) return
    const titleByKey = new Map<string, string>()
    for (const item of projectsQuery.data?.pages.flat() ?? []) {
      titleByKey.set(pinnedItemKey("projects", item.id), item.title)
    }
    for (const item of tasksQuery.data?.pages.flat() ?? []) {
      titleByKey.set(pinnedItemKey("tasks", item.id), item.title)
    }
    for (const item of usersQuery.data?.pages.flat() ?? []) {
      titleByKey.set(pinnedItemKey("users", item.id), item.title)
    }
    for (const item of aiQuery.data?.pages.flat() ?? []) {
      titleByKey.set(pinnedItemKey("ai_chats", item.id), item.title)
    }
    for (const item of artifactsQuery.data?.pages.flat() ?? []) {
      titleByKey.set(pinnedItemKey("artifacts", item.id), item.title)
    }
    for (const item of (mentionsQuery.data?.pages.flat() ?? []) as MentionRecentItem[]) {
      titleByKey.set(pinnedItemKey("mentions", item.id), item.title)
    }
    setPinnedItems((prev) => {
      let changed = false
      const next = prev.map((row) => {
        const fresh = titleByKey.get(pinnedItemKey(row.feedKey, row.id))
        if (fresh && fresh !== row.title) {
          changed = true
          return { ...row, title: fresh }
        }
        return row
      })
      if (changed) writeHomeSidebarPinnedItems(next)
      return changed ? next : prev
    })
  }, [
    pinnedItems.length,
    projectsQuery.data,
    tasksQuery.data,
    usersQuery.data,
    aiQuery.data,
    artifactsQuery.data,
    mentionsQuery.data,
  ])

  const isRecentsLoading =
    projectsQuery.isLoading ||
    tasksQuery.isLoading ||
    mentionsQuery.isLoading ||
    usersQuery.isLoading ||
    aiQuery.isLoading ||
    artifactsQuery.isLoading

  const hasMoreRecents =
    Boolean(projectsQuery.hasNextPage) ||
    Boolean(tasksQuery.hasNextPage) ||
    Boolean(mentionsQuery.hasNextPage) ||
    Boolean(usersQuery.hasNextPage) ||
    Boolean(aiQuery.hasNextPage) ||
    Boolean(artifactsQuery.hasNextPage)

  const isFetchingMoreRecents =
    projectsQuery.isFetchingNextPage ||
    tasksQuery.isFetchingNextPage ||
    mentionsQuery.isFetchingNextPage ||
    usersQuery.isFetchingNextPage ||
    aiQuery.isFetchingNextPage ||
    artifactsQuery.isFetchingNextPage

  const loadMoreRecents = useCallback(() => {
    if (projectsQuery.hasNextPage && !projectsQuery.isFetchingNextPage) {
      void projectsQuery.fetchNextPage()
    }
    if (tasksQuery.hasNextPage && !tasksQuery.isFetchingNextPage) {
      void tasksQuery.fetchNextPage()
    }
    if (mentionsQuery.hasNextPage && !mentionsQuery.isFetchingNextPage) {
      void mentionsQuery.fetchNextPage()
    }
    if (usersQuery.hasNextPage && !usersQuery.isFetchingNextPage) {
      void usersQuery.fetchNextPage()
    }
    if (aiQuery.hasNextPage && !aiQuery.isFetchingNextPage) {
      void aiQuery.fetchNextPage()
    }
    if (artifactsQuery.hasNextPage && !artifactsQuery.isFetchingNextPage) {
      void artifactsQuery.fetchNextPage()
    }
  }, [projectsQuery, tasksQuery, mentionsQuery, usersQuery, aiQuery, artifactsQuery])

  const handleCreate = useCallback(
    (createType: HeaderCreateType | "ai") => {
      if (createType === "ai") {
        onCreateAiChat()
        return
      }
      dispatchOpenHeaderCreate(createType)
    },
    [onCreateAiChat],
  )

  const openUnifiedItem = useCallback(
    (item: UnifiedRecentItem | HomeSidebarPinnedItem) => {
      const title = typeof item.title === "string" ? item.title.trim() : ""
      if (item.feedKey === "projects") {
        const projectId = Number(item.id)
        if (Number.isFinite(projectId)) {
          if (title) {
            useCenterPaneTabsStore.getState().upsertTab({
              kind: "project",
              id: String(projectId),
              title,
            })
          }
          onOpenProject(projectId)
        }
        return
      }
      if (item.feedKey === "tasks") {
        const taskId = Number(item.id)
        if (Number.isFinite(taskId)) {
          if (title) {
            useCenterPaneTabsStore.getState().upsertTab({
              kind: "task",
              id: String(taskId),
              title,
            })
          }
          onOpenTask(taskId)
        }
        return
      }
      if (item.feedKey === "users") {
        const userId = Number(item.id)
        if (Number.isFinite(userId)) {
          if (title) {
            useCenterPaneTabsStore.getState().upsertTab({
              kind: "user",
              id: String(userId),
              title,
            })
          }
          onOpenUser(userId)
        }
        return
      }
      if (item.feedKey === "ai_chats") {
        onOpenAiChat(item.id)
        return
      }
      if (item.feedKey === "artifacts") {
        openArtifactCenterTab({
          artifactId: item.id,
          title: title || null,
        })
        return
      }
      const mention = item as UnifiedRecentItem
      onOpenMention({
        threadId: mention.threadId ?? item.id,
        mentionId: mention.mentionId ?? null,
      })
    },
    [onOpenAiChat, onOpenMention, onOpenProject, onOpenTask, onOpenUser],
  )

  const renderUnifiedRow = (item: UnifiedRecentItem, key: string) => {
    const Icon = FEED_ICON[item.feedKey]
    const projectId = item.feedKey === "projects" ? Number(item.id) : NaN
    return (
      <TitleRow
        key={key}
        title={item.title}
        onClick={() => openUnifiedItem(item)}
        leading={
          <Icon
            className="h-3.5 w-3.5 shrink-0 text-gray-400"
            aria-label={FEED_LABEL[item.feedKey]}
          />
        }
        trailing={
          <ItemOptionsMenu
            isPinned={isPinned(item.feedKey, item.id)}
            onTogglePin={() =>
              togglePin({
                feedKey: item.feedKey,
                id: item.id,
                title: item.title,
                pinnedAt: new Date().toISOString(),
              })
            }
            extraItems={
              item.feedKey === "projects" ? (
                <DropdownMenuItem
                  onSelect={() => {
                    if (!Number.isFinite(projectId)) return
                    // Defer so the menu can unmount before the dialog locks pointer-events.
                    window.setTimeout(() => onOpenProjectDefinitions(projectId), 0)
                  }}
                >
                  Definitions
                </DropdownMenuItem>
              ) : null
            }
          />
        }
      />
    )
  }

  if (!showExpandedChrome) {
    return (
      <ul className="space-y-0.5 px-1">
        {SIDEBAR_NAV_OBJECTS.map((item) => (
          <li key={item.object}>
            <button
              type="button"
              onClick={() => onNavigateObject(item.object)}
              className={cn(
                "flex w-full items-center justify-center rounded-md px-0 py-2 text-gray-700 transition-colors hover:bg-gray-100",
                isObjectActive(item.object) && "bg-gray-100 text-gray-900",
              )}
              aria-label={item.name}
              title={item.name}
            >
              <item.icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2">
      <ul className="space-y-0.5 px-1 pb-1">
        {SIDEBAR_NAV_OBJECTS.map((item) => (
          <li key={item.object}>
            <NavRow
              icon={item.icon}
              label={item.name}
              active={isObjectActive(item.object)}
              onClick={() => onNavigateObject(item.object)}
              badge={
                item.object === "mention" && hasUnseenMentions ? (
                  <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden />
                ) : null
              }
              trailing={
                item.createType ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleCreate(item.createType!)
                    }}
                    className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 opacity-0 transition-opacity hover:bg-gray-200 hover:text-gray-800 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Add ${item.name}`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                ) : (
                  <span className="mr-1 inline-flex h-7 w-7 shrink-0" aria-hidden />
                )
              }
            />
          </li>
        ))}
      </ul>

        <div className="mt-1 border-t border-gray-100 px-1 pt-2">
          {pinnedItems.length > 0 ? (
            <section className="pt-0.5">
              <SectionHeader
                label="Pinned"
                collapsed={pinnedCollapsed}
                onToggle={togglePinnedCollapsed}
              />
              {!pinnedCollapsed ? (
                <div className="pb-1">
                  {pinnedItems.map((item) => (
                    <TitleRow
                      key={`pinned:${item.feedKey}:${item.id}`}
                      title={item.title}
                      onClick={() => openUnifiedItem(item)}
                      leading={
                        <Pin
                          className="h-3.5 w-3.5 shrink-0 text-gray-400"
                          aria-label={`Pinned ${FEED_LABEL[item.feedKey]}`}
                        />
                      }
                      trailing={
                        <ItemOptionsMenu isPinned onTogglePin={() => togglePin(item)} />
                      }
                    />
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="pt-0.5">
            <SectionHeader
              label="Recents"
              collapsed={recentsCollapsed}
              onToggle={toggleRecentsCollapsed}
            />
            {!recentsCollapsed ? (
              <div className="pb-1">
                {unifiedRecents.length === 0 && !isRecentsLoading ? (
                  <div className="px-3 py-1.5 text-xs font-normal text-gray-400">No recent items</div>
                ) : null}
                {unifiedRecents.map((item) =>
                  renderUnifiedRow(item, `recent:${item.feedKey}:${item.id}`),
                )}
                <InfiniteSentinel
                  enabled={hasMoreRecents}
                  onVisible={loadMoreRecents}
                  rootRef={scrollRef}
                />
                {isFetchingMoreRecents ? (
                  <div className="px-3 py-1.5 text-xs font-normal text-gray-400">Loading…</div>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
    </div>
  )
}