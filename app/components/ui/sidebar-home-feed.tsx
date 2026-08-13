"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import {
  AtSign,
  Bot,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderKanban,
  ListTodo,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  User,
  UserRound,
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
import { UserAvatar } from "../UserAvatar"

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

type ExpandableSectionKey = "projects" | "users" | "mentions" | "ai_chats"

type SidebarNavRow =
  | {
      kind: "task-list"
      name: string
      icon: LucideIcon
      createType: HeaderCreateType | "ai"
    }
  | {
      kind: "expandable"
      section: ExpandableSectionKey
      object: SearchObjectRoute
      name: string
      icon: LucideIcon
      createType?: HeaderCreateType | "ai"
    }

const SIDEBAR_NAV_ROWS: SidebarNavRow[] = [
  { kind: "task-list", name: "Tasks", icon: ListTodo, createType: "task" },
  {
    kind: "expandable",
    section: "projects",
    object: "project",
    name: "Projects",
    icon: FolderKanban,
    createType: "project",
  },
  {
    kind: "expandable",
    section: "users",
    object: "user",
    name: "Users",
    icon: User,
    createType: "user",
  },
  {
    kind: "expandable",
    section: "mentions",
    object: "mention",
    name: "Mentions",
    icon: AtSign,
  },
  {
    kind: "expandable",
    section: "ai_chats",
    object: "ai_thread",
    name: "AI chats",
    icon: Bot,
    createType: "ai",
  },
]

const SIDEBAR_CREATE_OPTIONS: Array<{
  id: HeaderCreateType | "ai"
  label: string
  icon: LucideIcon
}> = [
  { id: "task", label: "Task", icon: ListTodo },
  { id: "project", label: "Project", icon: FolderKanban },
  { id: "user", label: "User", icon: UserRound },
  { id: "thread", label: "Thread", icon: MessageSquare },
  { id: "ai", label: "AI chat", icon: Bot },
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
const SECTIONS_EXPANDED_KEY = "sidebar-nav-sections-expanded-v1"
const SIDEBAR_SECTION_PAGE_SIZE = 10
const CHRONO_PAGE_SIZE = 10

type SidebarSectionsExpanded = Record<ExpandableSectionKey, boolean>

const DEFAULT_SECTIONS_EXPANDED: SidebarSectionsExpanded = {
  projects: false,
  users: false,
  mentions: false,
  ai_chats: false,
}

function recentAtMs(value: string | null | undefined): number {
  if (!value) return 0
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : 0
}

function readSectionsExpanded(): SidebarSectionsExpanded {
  try {
    const raw = window.localStorage.getItem(SECTIONS_EXPANDED_KEY)
    if (!raw) return { ...DEFAULT_SECTIONS_EXPANDED }
    const parsed = JSON.parse(raw) as Partial<SidebarSectionsExpanded>
    return {
      projects: Boolean(parsed.projects),
      users: Boolean(parsed.users),
      mentions: Boolean(parsed.mentions),
      ai_chats: Boolean(parsed.ai_chats),
    }
  } catch {
    return { ...DEFAULT_SECTIONS_EXPANDED }
  }
}

function writeSectionsExpanded(next: SidebarSectionsExpanded) {
  try {
    window.localStorage.setItem(SECTIONS_EXPANDED_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
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
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center text-gray-500">
        <Chevron className="h-4 w-4" />
      </span>
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
  expanded,
  expandable,
}: {
  icon: LucideIcon
  label: string
  active?: boolean
  onClick: () => void
  trailing?: React.ReactNode
  badge?: React.ReactNode
  expanded?: boolean
  expandable?: boolean
}) {
  const Chevron = expandable ? (expanded ? ChevronDown : ChevronRight) : null
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
        aria-expanded={expandable ? expanded : undefined}
      >
        <Icon className="h-[18px] w-[18px] shrink-0 text-gray-700" strokeWidth={1.75} />
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate">{label}</span>
        {badge}
      </button>
      {trailing}
      {Chevron ? (
        <button
          type="button"
          onClick={onClick}
          className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-700"
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
          aria-expanded={expanded}
        >
          <Chevron className="h-4 w-4" />
        </button>
      ) : null}
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
  pageSize = CHRONO_PAGE_SIZE,
) {
  return useInfiniteQuery({
    queryKey: ["home-sidebar-recents", key, pageSize],
    queryFn: ({ pageParam }) =>
      fetcher({ offset: pageParam as number, limit: pageSize }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < pageSize
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

type SidebarListItem = {
  id: string
  title: string
  photo?: string | null
  mentionId?: string | null
  threadId?: string | null
}

export function SidebarHomeFeed({
  showExpandedChrome,
  isObjectActive,
  hasUnseenMentions,
  onNavigateObject,
  onOpenTaskList,
  onOpenProject,
  onOpenProjectDefinitions,
  onOpenTask,
  onOpenMention,
  onOpenUser,
  onOpenAiChat,
  onCreateAiChat,
  onSidebarToggle,
  onOpenSearch,
}: {
  showExpandedChrome: boolean
  isObjectActive: (object: SearchObjectRoute) => boolean
  hasUnseenMentions: boolean
  onNavigateObject: (object: SearchObjectRoute) => void
  onOpenTaskList?: () => void
  onOpenProject: (projectId: number) => void
  onOpenProjectDefinitions: (projectId: number) => void
  onOpenTask: (taskId: number) => void
  onOpenMention: (args: { threadId: string; mentionId?: string | null }) => void
  onOpenUser: (userId: number) => void
  onOpenAiChat: (threadId: string) => void
  onCreateAiChat: () => void
  onSidebarToggle?: () => void
  onOpenSearch?: () => void
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const supabase = useMemo(() => createClientComponentClient(), [])
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false)
  const [recentsCollapsed, setRecentsCollapsed] = useState(false)
  const [pinnedItems, setPinnedItems] = useState<HomeSidebarPinnedItem[]>([])
  const [sectionsExpanded, setSectionsExpanded] = useState<SidebarSectionsExpanded>(
    DEFAULT_SECTIONS_EXPANDED,
  )
  const [visibleCount, setVisibleCount] = useState<Record<ExpandableSectionKey, number>>({
    projects: SIDEBAR_SECTION_PAGE_SIZE,
    users: SIDEBAR_SECTION_PAGE_SIZE,
    mentions: SIDEBAR_SECTION_PAGE_SIZE,
    ai_chats: SIDEBAR_SECTION_PAGE_SIZE,
  })

  useEffect(() => {
    setPinnedItems(readHomeSidebarPinnedItems())
    setSectionsExpanded(readSectionsExpanded())
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

  const toggleSection = useCallback((section: ExpandableSectionKey) => {
    setSectionsExpanded((prev) => {
      const next = { ...prev, [section]: !prev[section] }
      writeSectionsExpanded(next)
      return next
    })
  }, [])

  const showMore = useCallback((section: ExpandableSectionKey) => {
    setVisibleCount((prev) => ({
      ...prev,
      [section]: prev[section] + SIDEBAR_SECTION_PAGE_SIZE,
    }))
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

  const projectsExpanded = sectionsExpanded.projects
  const usersExpanded = sectionsExpanded.users
  const mentionsExpanded = sectionsExpanded.mentions
  const aiChatsExpanded = sectionsExpanded.ai_chats

  const { data: projectsAlpha = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["sidebar-nav-projects-alpha"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_projects_minimal")
        .select("id, name, logo")
        .order("name")
      if (error) throw error
      return (data || []).map((row) => ({
        id: String(row.id),
        title: (row.name || "Untitled").trim() || "Untitled",
        photo: row.logo ?? null,
      })) as SidebarListItem[]
    },
    enabled: showExpandedChrome && projectsExpanded,
    staleTime: 60_000,
  })

  const { data: usersAlpha = [], isLoading: usersLoading } = useQuery({
    queryKey: ["sidebar-nav-users-alpha"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_users_minimal_i_can_see")
        .select("id, full_name, photo")
        .order("full_name")
      if (error) throw error
      return (data || []).map((row) => ({
        id: String(row.id),
        title: (row.full_name || "User").trim() || "User",
        photo: row.photo ?? null,
      })) as SidebarListItem[]
    },
    enabled: showExpandedChrome && usersExpanded,
    staleTime: 60_000,
  })

  const mentionsQuery = useRecentSectionQuery(
    "mentions",
    fetchHomeRecentMentions,
    showExpandedChrome && mentionsExpanded,
    CHRONO_PAGE_SIZE,
  )
  const aiQuery = useRecentSectionQuery(
    "ai_chats",
    fetchHomeRecentAiChats,
    showExpandedChrome && aiChatsExpanded,
    CHRONO_PAGE_SIZE,
  )

  // Keep enough chrono pages loaded for the current visible count.
  useEffect(() => {
    if (!mentionsExpanded) return
    const loaded = mentionsQuery.data?.pages.flat().length ?? 0
    if (loaded < visibleCount.mentions && mentionsQuery.hasNextPage && !mentionsQuery.isFetchingNextPage) {
      void mentionsQuery.fetchNextPage()
    }
  }, [mentionsExpanded, mentionsQuery, visibleCount.mentions])

  useEffect(() => {
    if (!aiChatsExpanded) return
    const loaded = aiQuery.data?.pages.flat().length ?? 0
    if (loaded < visibleCount.ai_chats && aiQuery.hasNextPage && !aiQuery.isFetchingNextPage) {
      void aiQuery.fetchNextPage()
    }
  }, [aiChatsExpanded, aiQuery, visibleCount.ai_chats])

  const mentionsItems = useMemo(() => {
    return ((mentionsQuery.data?.pages.flat() ?? []) as MentionRecentItem[]).map((item) => ({
      id: item.id,
      title: item.title,
      mentionId: item.mentionId,
      threadId: item.threadId,
    })) as SidebarListItem[]
  }, [mentionsQuery.data])

  const aiItems = useMemo(() => {
    return (aiQuery.data?.pages.flat() ?? []).map((item) => ({
      id: item.id,
      title: item.title,
    })) as SidebarListItem[]
  }, [aiQuery.data])

  const recentsEnabled = showExpandedChrome && !recentsCollapsed

  const projectsQuery = useRecentSectionQuery("projects", fetchHomeRecentProjects, recentsEnabled)
  const tasksQuery = useRecentSectionQuery("tasks", fetchHomeRecentTasks, recentsEnabled)
  const mentionsRecentsQuery = useRecentSectionQuery("mentions", fetchHomeRecentMentions, recentsEnabled)
  const usersQuery = useRecentSectionQuery("users", fetchHomeRecentUsers, recentsEnabled)
  const aiRecentsQuery = useRecentSectionQuery("ai_chats", fetchHomeRecentAiChats, recentsEnabled)
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
    for (const item of (mentionsRecentsQuery.data?.pages.flat() ?? []) as MentionRecentItem[]) {
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
    for (const item of aiRecentsQuery.data?.pages.flat() ?? []) {
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
    mentionsRecentsQuery.data,
    usersQuery.data,
    aiRecentsQuery.data,
    artifactsQuery.data,
    isPinned,
  ])

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
    for (const item of aiRecentsQuery.data?.pages.flat() ?? []) {
      titleByKey.set(pinnedItemKey("ai_chats", item.id), item.title)
    }
    for (const item of artifactsQuery.data?.pages.flat() ?? []) {
      titleByKey.set(pinnedItemKey("artifacts", item.id), item.title)
    }
    for (const item of (mentionsRecentsQuery.data?.pages.flat() ?? []) as MentionRecentItem[]) {
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
    aiRecentsQuery.data,
    artifactsQuery.data,
    mentionsRecentsQuery.data,
  ])

  const isRecentsLoading =
    projectsQuery.isLoading ||
    tasksQuery.isLoading ||
    mentionsRecentsQuery.isLoading ||
    usersQuery.isLoading ||
    aiRecentsQuery.isLoading ||
    artifactsQuery.isLoading

  const hasMoreRecents =
    Boolean(projectsQuery.hasNextPage) ||
    Boolean(tasksQuery.hasNextPage) ||
    Boolean(mentionsRecentsQuery.hasNextPage) ||
    Boolean(usersQuery.hasNextPage) ||
    Boolean(aiRecentsQuery.hasNextPage) ||
    Boolean(artifactsQuery.hasNextPage)

  const isFetchingMoreRecents =
    projectsQuery.isFetchingNextPage ||
    tasksQuery.isFetchingNextPage ||
    mentionsRecentsQuery.isFetchingNextPage ||
    usersQuery.isFetchingNextPage ||
    aiRecentsQuery.isFetchingNextPage ||
    artifactsQuery.isFetchingNextPage

  const loadMoreRecents = useCallback(() => {
    if (projectsQuery.hasNextPage && !projectsQuery.isFetchingNextPage) {
      void projectsQuery.fetchNextPage()
    }
    if (tasksQuery.hasNextPage && !tasksQuery.isFetchingNextPage) {
      void tasksQuery.fetchNextPage()
    }
    if (mentionsRecentsQuery.hasNextPage && !mentionsRecentsQuery.isFetchingNextPage) {
      void mentionsRecentsQuery.fetchNextPage()
    }
    if (usersQuery.hasNextPage && !usersQuery.isFetchingNextPage) {
      void usersQuery.fetchNextPage()
    }
    if (aiRecentsQuery.hasNextPage && !aiRecentsQuery.isFetchingNextPage) {
      void aiRecentsQuery.fetchNextPage()
    }
    if (artifactsQuery.hasNextPage && !artifactsQuery.isFetchingNextPage) {
      void artifactsQuery.fetchNextPage()
    }
  }, [
    projectsQuery,
    tasksQuery,
    mentionsRecentsQuery,
    usersQuery,
    aiRecentsQuery,
    artifactsQuery,
  ])

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

  const createMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-800"
          aria-label="Create options"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        {SIDEBAR_CREATE_OPTIONS.map(({ id, label, icon: Icon }) => (
          <DropdownMenuItem key={id} onSelect={() => handleCreate(id)}>
            <Icon className="mr-2 h-4 w-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const brandAndSearch = showExpandedChrome ? (
    <div className="space-y-2 px-1 pb-2 pt-3">
      <div className="flex items-center gap-2 px-1">
        {onSidebarToggle ? (
          <button
            type="button"
            onClick={onSidebarToggle}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-gray-900">
          Articulate
        </span>
      </div>
      <NavRow icon={Search} label="Search" onClick={() => onOpenSearch?.()} />
    </div>
  ) : (
    <div className="flex flex-col items-center gap-1 px-1 pb-2 pt-3">
      {onSidebarToggle ? (
        <button
          type="button"
          onClick={onSidebarToggle}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onOpenSearch?.()}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100"
        aria-label="Search"
        title="Search"
      >
        <Search className="h-5 w-5" strokeWidth={1.75} />
      </button>
    </div>
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

  const openSectionItem = useCallback(
    (section: ExpandableSectionKey, item: SidebarListItem) => {
      if (section === "projects") {
        const projectId = Number(item.id)
        if (Number.isFinite(projectId)) {
          if (item.title) {
            useCenterPaneTabsStore.getState().upsertTab({
              kind: "project",
              id: String(projectId),
              title: item.title,
            })
          }
          onOpenProject(projectId)
        }
        return
      }
      if (section === "users") {
        const userId = Number(item.id)
        if (Number.isFinite(userId)) {
          if (item.title) {
            useCenterPaneTabsStore.getState().upsertTab({
              kind: "user",
              id: String(userId),
              title: item.title,
            })
          }
          onOpenUser(userId)
        }
        return
      }
      if (section === "ai_chats") {
        onOpenAiChat(item.id)
        return
      }
      onOpenMention({
        threadId: item.threadId ?? item.id,
        mentionId: item.mentionId ?? null,
      })
    },
    [onOpenAiChat, onOpenMention, onOpenProject, onOpenUser],
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

  const renderExpandableItems = (
    section: ExpandableSectionKey,
    items: SidebarListItem[],
    opts: {
      loading?: boolean
      hasMoreRemote?: boolean
      leading?: (item: SidebarListItem) => React.ReactNode
      createType?: HeaderCreateType | "ai"
      createLabel?: string
    } = {},
  ) => {
    const limit = visibleCount[section]
    const shown = items.slice(0, limit)
    const canShowMore = items.length > limit || Boolean(opts.hasMoreRemote)
    return (
      <div className="pb-1 pl-2">
        {opts.createType ? (
          <button
            type="button"
            onClick={() => handleCreate(opts.createType!)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm font-normal text-gray-800 hover:bg-gray-50"
          >
            <Plus className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            <span className="min-w-0 truncate">{opts.createLabel ?? "Create"}</span>
          </button>
        ) : null}
        {opts.loading && shown.length === 0 ? (
          <div className="px-3 py-1.5 text-xs font-normal text-gray-400">Loading…</div>
        ) : null}
        {!opts.loading && shown.length === 0 ? (
          <div className="px-3 py-1.5 text-xs font-normal text-gray-400">None yet</div>
        ) : null}
        {shown.map((item) => (
          <TitleRow
            key={`${section}:${item.id}`}
            title={item.title}
            onClick={() => openSectionItem(section, item)}
            leading={opts.leading?.(item)}
          />
        ))}
        {canShowMore ? (
          <button
            type="button"
            onClick={() => showMore(section)}
            className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 hover:text-gray-800"
          >
            Show more
          </button>
        ) : null}
      </div>
    )
  }

  if (!showExpandedChrome) {
    return (
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2">
        <div className="sticky top-0 z-10 bg-white">
          {brandAndSearch}
          <div className="px-1 pb-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-center rounded-md px-0 py-2 text-gray-700 transition-colors hover:bg-gray-100"
                  aria-label="Create"
                  title="Create"
                >
                  <Plus className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="right" className="min-w-[180px]">
                {SIDEBAR_CREATE_OPTIONS.map(({ id, label, icon: Icon }) => (
                  <DropdownMenuItem key={id} onSelect={() => handleCreate(id)}>
                    <Icon className="mr-2 h-4 w-4" />
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <ul className="space-y-0.5 px-1">
          {SIDEBAR_NAV_ROWS.map((item) => (
            <li key={item.kind === "task-list" ? "tasks" : item.section}>
              <button
                type="button"
                onClick={() => {
                  if (item.kind === "task-list") {
                    if (onOpenTaskList) onOpenTaskList()
                    else onNavigateObject("task")
                    return
                  }
                  // Collapsed rail: expand sidebar chrome via toggle, then expand section.
                  onSidebarToggle?.()
                  setSectionsExpanded((prev) => {
                    const next = { ...prev, [item.section]: true }
                    writeSectionsExpanded(next)
                    return next
                  })
                }}
                className={cn(
                  "flex w-full items-center justify-center rounded-md px-0 py-2 text-gray-700 transition-colors hover:bg-gray-100",
                  item.kind === "expandable" &&
                    isObjectActive(item.object) &&
                    "bg-gray-100 text-gray-900",
                )}
                aria-label={item.name}
                title={item.name}
              >
                <item.icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2">
      <div className="sticky top-0 z-10 bg-white">
        {brandAndSearch}
        <ul className="space-y-0.5 px-1 pb-1">
          <li>
            <NavRow
              icon={Plus}
              label="Create"
              onClick={() => handleCreate("task")}
              trailing={createMenu}
            />
          </li>
        </ul>
      </div>
      <ul className="space-y-0.5 px-1 pb-1">
        {SIDEBAR_NAV_ROWS.map((item) => {
          if (item.kind === "task-list") {
            return (
              <li key="tasks">
                <NavRow
                  icon={item.icon}
                  label={item.name}
                  onClick={() => {
                    if (onOpenTaskList) onOpenTaskList()
                    else onNavigateObject("task")
                  }}
                  trailing={
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleCreate(item.createType)
                      }}
                      className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 opacity-0 transition-opacity hover:bg-gray-200 hover:text-gray-800 group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={`Add ${item.name}`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  }
                />
              </li>
            )
          }

          const expanded = sectionsExpanded[item.section]
          const createLabel =
            item.createType === "project"
              ? "Create project"
              : item.createType === "user"
                ? "Create user"
                : item.createType === "ai"
                  ? "New AI chat"
                  : "Create"
          return (
            <li key={item.section}>
              <NavRow
                icon={item.icon}
                label={item.name}
                active={expanded}
                expandable
                expanded={expanded}
                onClick={() => toggleSection(item.section)}
                badge={
                  item.object === "mention" && hasUnseenMentions ? (
                    <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden />
                  ) : null
                }
              />
              {expanded && item.section === "projects"
                ? renderExpandableItems("projects", projectsAlpha, {
                    loading: projectsLoading,
                    createType: item.createType,
                    createLabel,
                    leading: (row) => (
                      <span className="inline-flex h-4 w-4 shrink-0 overflow-hidden rounded-sm bg-gray-100">
                        {row.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={row.photo} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <FolderKanban className="m-auto h-3 w-3 text-gray-400" />
                        )}
                      </span>
                    ),
                  })
                : null}
              {expanded && item.section === "users"
                ? renderExpandableItems("users", usersAlpha, {
                    loading: usersLoading,
                    createType: item.createType,
                    createLabel,
                    leading: (row) => (
                      <UserAvatar
                        photoUrl={row.photo}
                        name={row.title}
                        size="xs"
                        className="shrink-0"
                      />
                    ),
                  })
                : null}
              {expanded && item.section === "mentions"
                ? renderExpandableItems("mentions", mentionsItems, {
                    loading: mentionsQuery.isLoading,
                    hasMoreRemote: Boolean(mentionsQuery.hasNextPage),
                    leading: () => (
                      <AtSign className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                    ),
                  })
                : null}
              {expanded && item.section === "ai_chats"
                ? renderExpandableItems("ai_chats", aiItems, {
                    loading: aiQuery.isLoading,
                    hasMoreRemote: Boolean(aiQuery.hasNextPage),
                    createType: item.createType,
                    createLabel,
                    leading: () => (
                      <Bot className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                    ),
                  })
                : null}
            </li>
          )
        })}
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
