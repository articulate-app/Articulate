"use client"

import { useState, useCallback, useEffect, useRef, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import {
  Loader2,
  Trash2,
  MessageSquare,
  X as XIcon,
  Maximize2,
  Minimize2,
  MoreVertical,
  Settings,
} from "lucide-react"
import { Button } from "../ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import { toast } from "../ui/use-toast"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog"
import { ImprovementPlanSection } from "./ImprovementPlanSection"
import { UserSharedCommentsTab } from "./user-shared-comments-tab"
import { UserOverviewPreviews } from "./user-overview-previews"
import { UserReviewsSection } from "./user-reviews-section"
import { UserProjectsListSection } from "./user-projects-list-section"
import { UserOccupationSection } from "./user-occupation-section"
import {
  UserSettingsPanel,
  type UserSettingsCategory,
} from "./user-settings-panel"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { mergeWorkspaceUrlState } from "../../lib/workspace-url-state"
import { openWorkspaceView } from "../../lib/open-workspace-view"
import { useWorkspaceHostPane } from "../workspace/workspace-host-pane-context"
import { useMobileDetection } from "../../hooks/use-mobile-detection"
import { MobileDetailHeader, type MobileDetailAction } from "../ui/mobile-detail-header"
import { UserAvatar } from "../UserAvatar"
import { COMPACT_PANE_HEADER_ROW_CLASS } from "../tasks/pane-header-tokens"
import { cn } from "../../lib/utils"
import { UserTasksTabContent } from "../tasks/UserTasksTabContent"

import { useCurrentUserStore } from "../../store/current-user"
import {
  getUserProfile,
  softDeleteUser,
  getOrCreateUserThread,
  type UserProfile,
  type UserTask,
} from "../../lib/services/users"
import { getImageUrl } from "../../lib/public-media"

interface UserDetailsPageProps {
  userId: number
  onClose?: () => void
  isDetailsFocused?: boolean
  onFocusToggle?: () => void
  /** Tasks shell: open TaskDetails without clearing entity detail params. */
  onOpenTaskKeepingDetail?: (task: UserTask) => void
  /** Tasks shell: open task as a new center-pane tab (replaces current selection). */
  onOpenTask?: (taskId: number) => void
  /** Tasks shell: stack TeamDetails above user detail (`stackTeamId` URL param). */
  onOpenTeamKeepingDetail?: (teamId: number) => void
  /** Tasks shell: open project in the middle pane. */
  onOpenProject?: (projectId: number) => void
  /** When profile loads, report a friendly label for the middle-pane tab strip. */
  onResolvedTitle?: (title: string) => void
}

type TabValue = 'overview' | 'tasks' | 'comments' | 'reviews' | 'occupation' | 'projects'

const USER_ALLOWED_TABS: TabValue[] = ['overview', 'tasks', 'comments', 'reviews', 'occupation', 'projects']

const LEGACY_SETTINGS_TAB_MAP: Record<string, UserSettingsCategory> = {
  skills: "skills",
  preferences: "communication",
  "ai-limits": "ai-limits",
}

const supabase = createClientComponentClient()

export function UserDetailsPage({
  userId,
  onClose,
  isDetailsFocused = false,
  onFocusToggle,
  onOpenTaskKeepingDetail,
  onOpenTask,
  onOpenTeamKeepingDetail,
  onOpenProject,
  onResolvedTitle,
}: UserDetailsPageProps) {
  const isMobile = useMobileDetection()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const hostPane = useWorkspaceHostPane()
  const queryClient = useQueryClient()
  const publicUserId = useCurrentUserStore((s) => s.publicUserId)
  const isOwnProfile = publicUserId != null && publicUserId === userId

  // URL is the single source of truth for the active tab.
  const tabFromUrl = searchParams.get('centerTab') ?? searchParams.get('rightTab') ?? searchParams.get('tab')
  const activeTab: TabValue = USER_ALLOWED_TABS.includes(tabFromUrl as TabValue)
    ? (tabFromUrl as TabValue)
    : 'overview'

  // State for dialogs / settings
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [showUserSettings, setShowUserSettings] = useState(false)
  const [settingsCategory, setSettingsCategory] = useState<UserSettingsCategory>("profile")
  const openedLegacySettingsRef = useRef(false)
  const tabsScrollRef = useRef<HTMLDivElement | null>(null)
  const [isTabsHovered, setIsTabsHovered] = useState(false)

  const openUserSettings = useCallback((category: UserSettingsCategory = "profile") => {
    if (!isOwnProfile) return
    setSettingsCategory(category)
    setShowUserSettings(true)
  }, [isOwnProfile])

  const [commentsHeaderActions, setCommentsHeaderActions] = useState<ReactNode>(null)

  useEffect(() => {
    console.log("[user-detail] active tab from URL", activeTab)
  }, [activeTab])

  // Legacy center/right tabs that now live in User settings.
  useEffect(() => {
    if (openedLegacySettingsRef.current) return
    const raw = tabFromUrl
    if (!raw) return

    const settingsCategoryForTab = LEGACY_SETTINGS_TAB_MAP[raw]
    if (settingsCategoryForTab) {
      if (!isOwnProfile) return
      openedLegacySettingsRef.current = true
      openUserSettings(settingsCategoryForTab)
      mergeWorkspaceUrlState(
        {
          centerTab: null,
          rightTab: null,
          tab: null,
          detailType: null,
          detailId: null,
          assignedTo: null,
        },
        { source: "user-legacy-settings-tab" },
      )
      return
    }

  }, [tabFromUrl, openUserSettings, isOwnProfile])

  // Handle tab change and update URL
  const handleTabChange = (value: string) => {
    const newTab = value as TabValue
    if (!USER_ALLOWED_TABS.includes(newTab)) return
    if (newTab === activeTab) return
    console.log("[user-detail] tab click", newTab)
    
    const params = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : searchParams.toString(),
    )
    const isAiRightPane = params.get('rightView') === 'ai'
    const tabPatch = isAiRightPane
      ? {
          centerTab: newTab === "overview" ? null : newTab,
          rightTab: null,
        }
      : {
          rightTab: newTab === "overview" ? null : newTab,
          centerTab: null,
        }
    console.log("[user-detail][tab-write]", {
      source: "tab-click",
      from: activeTab,
      to: newTab,
    })
    mergeWorkspaceUrlState(
      {
        ...tabPatch,
        tab: null,
        detailType: null,
        detailId: null,
        assignedTo: null,
      },
      { source: "user-tab-change" },
    )
  }

  useEffect(() => {
    const el = tabsScrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!isTabsHovered) return
      if (el.scrollWidth <= el.clientWidth) return
      let deltaX = e.deltaX
      let deltaY = e.deltaY
      if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        deltaX *= 16
        deltaY *= 16
      } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        deltaX *= el.clientWidth
        deltaY *= el.clientHeight
      }
      const delta = e.shiftKey ? deltaY : Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY
      if (delta === 0) return
      e.preventDefault()
      el.scrollLeft += delta
    }
    el.addEventListener("wheel", onWheel, { passive: false, capture: true })
    return () => el.removeEventListener("wheel", onWheel, true)
  }, [isTabsHovered])

  // Fetch user profile
  const { data: profile, isLoading: profileLoading, isFetching: profileFetching } = useQuery({
    queryKey: ["user-profile", userId],
    queryFn: async () => {
      const result = await getUserProfile(userId)
      if (result.error) throw result.error
      return result.data
    },
    initialData: () => queryClient.getQueryData<UserProfile>(["user-profile", userId]),
    staleTime: 0,
  })

  useEffect(() => {
    const resolved =
      (typeof profile?.full_name === "string" && profile.full_name.trim()) ||
      (typeof profile?.auth_email === "string" && profile.auth_email.trim()) ||
      ""
    if (resolved) onResolvedTitle?.(resolved)
  }, [onResolvedTitle, profile?.auth_email, profile?.full_name])

  // Handle delete user
  const handleDeleteUser = async () => {
    setIsDeleting(true)
    try {
      const { error } = await softDeleteUser(userId)
      
      if (error) throw error

      toast({
        title: "Success",
        description: "User archived successfully",
      })

      router.push('/users')
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to archive user",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  // Handle chat with user
  const handleChatWithUser = async () => {
    setIsChatLoading(true)
    try {
      const { data: thread, error } = await getOrCreateUserThread(userId)
      
      if (error) throw error
      
      if (!thread) {
        throw new Error("Failed to create thread")
      }

      const threadId = typeof thread === 'object' && thread && 'id' in thread ? thread.id : thread

      toast({
        title: "Success",
        description: "Opening chat...",
      })

      // Navigate to user page with chat open in right pane
      const params = new URLSearchParams(searchParams.toString())
      params.set('rightView', 'thread-chat')
      params.set('rightThreadId', String(threadId))
      router.push(`${pathname}?${params.toString()}`)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to open chat",
        variant: "destructive",
      })
    } finally {
      setIsChatLoading(false)
    }
  }

  const handleTeamClick = useCallback(
    (teamId: number) => {
      if (onOpenTeamKeepingDetail) {
        onOpenTeamKeepingDetail(teamId)
        return
      }
      router.push(`/teams/${teamId}`)
    },
    [onOpenTeamKeepingDetail, router],
  )

  const handleOpenTaskFromList = useCallback(
    (taskId: number) => {
      if (onOpenTask) {
        onOpenTask(taskId)
        return
      }
      if (onOpenTaskKeepingDetail) {
        onOpenTaskKeepingDetail({ id: taskId } as UserTask)
        return
      }
      router.push(`/tasks?id=${taskId}`)
    },
    [onOpenTask, onOpenTaskKeepingDetail, router],
  )

  const tabTriggerClassName =
    "-mb-px rounded-none border-b-0 border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-[inset_0_-2px_0_0_#111827]"

  const handleOpenProject = useCallback(
    (projectId: number) => {
      if (onOpenProject) {
        onOpenProject(projectId)
        return
      }
      openWorkspaceView(
        { type: "project", projectId, id: projectId },
        { pane: hostPane, pathname, source: "user-details-open-project" },
      )
    },
    [hostPane, onOpenProject, pathname],
  )

  const tasksSection = (
    <section className="min-w-0 border-t border-gray-100 py-8 first:border-t-0 first:pt-0">
      <div className="mb-3">
        <h3 className="text-base font-medium text-gray-900">Tasks</h3>
      </div>
      <div className="h-[min(70vh,42rem)] min-h-[28rem] overflow-hidden">
        <UserTasksTabContent userId={userId} onOpenTask={handleOpenTaskFromList} className="h-full" />
      </div>
    </section>
  )

  if (profileLoading && !profile) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-gray-500">User not found</p>
        </div>
      </div>
    )
  }

  const photoUrl = getImageUrl(profile.photo)

  const mobileUserActions: MobileDetailAction[] = [
    ...(isOwnProfile
      ? [
          {
            id: "settings",
            label: "Settings",
            icon: <Settings className="h-4 w-4" />,
            onSelect: () => openUserSettings("profile"),
          } satisfies MobileDetailAction,
        ]
      : []),
    {
      id: 'chat',
      label: 'Chat',
      icon: isChatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />,
      onSelect: handleChatWithUser,
      disabled: isChatLoading,
    },
    {
      id: 'archive',
      label: 'Archive',
      icon: <Trash2 className="h-4 w-4" />,
      onSelect: () => setShowDeleteDialog(true),
      destructive: true,
      separatorBefore: true,
    },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Mobile header: stable title + top-right "..." overflow with user actions. */}
      {isMobile ? (
        <MobileDetailHeader
          onBack={onClose}
          backLabel="Close details"
          title={profile.full_name || profile.auth_email}
          leadingSlot={
            <UserAvatar
              name={profile.full_name || profile.auth_email}
              photoUrl={photoUrl}
              size="sm"
            />
          }
          actions={mobileUserActions}
        />
      ) : (
      /* Header — single-line band aligned with left-pane object pills (h-14). */
      <div className={cn(COMPACT_PANE_HEADER_ROW_CLASS, "bg-white px-6")}>
        <div className="flex min-w-0 items-center gap-2.5">
          <UserAvatar
            name={profile.full_name || profile.auth_email}
            photoUrl={photoUrl}
            size="sm"
            className="border border-gray-200"
          />
          <div className="flex min-w-0 items-center gap-1.5">
            <h1 className="truncate text-sm font-semibold text-gray-900">
              {profile.full_name || profile.auth_email}
            </h1>
            {profileFetching && (profile as UserProfile & { __partial?: boolean }).__partial ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400" aria-label="Loading full details" />
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOwnProfile ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openUserSettings("profile")}
              className="h-8 w-8 p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="User settings"
              title="Settings"
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleChatWithUser}
            disabled={isChatLoading}
            className="h-8 w-8 p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Chat"
            title="Chat"
          >
            {isChatLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MessageSquare className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            className="h-8 w-8 p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Archive"
            title="Archive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          {onFocusToggle ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                console.log("[user-detail] focus click", { focused: !isDetailsFocused })
                onFocusToggle()
              }}
              className="h-8 w-8 p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label={isDetailsFocused ? "Restore details pane" : "Expand details pane"}
              title={isDetailsFocused ? "Restore details pane" : "Expand details pane"}
            >
              {isDetailsFocused ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          ) : null}
          {onClose ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close details"
              title="Close details"
            >
              <XIcon className="w-4 h-4" />
            </Button>
          ) : null}
        </div>
      </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col overflow-hidden">
        <div
          ref={tabsScrollRef}
          className="ai-chat-tabs-scroll min-h-0 min-w-0 overflow-x-auto overflow-y-visible border-b border-gray-200"
          onMouseEnter={() => setIsTabsHovered(true)}
          onMouseLeave={() => setIsTabsHovered(false)}
        >
          <TabsList className="h-auto flex-nowrap justify-start rounded-none border-t-0 bg-transparent p-0 px-6 whitespace-nowrap">
            <TabsTrigger value="overview" className={tabTriggerClassName}>
              Overview
            </TabsTrigger>
            <TabsTrigger value="tasks" className={tabTriggerClassName}>
              Tasks
            </TabsTrigger>
            <TabsTrigger value="occupation" className={tabTriggerClassName}>
              Occupation
            </TabsTrigger>
            <TabsTrigger value="projects" className={tabTriggerClassName}>
              Projects
            </TabsTrigger>
            <TabsTrigger value="reviews" className={tabTriggerClassName}>
              Reviews
            </TabsTrigger>
            <TabsTrigger value="comments" className={tabTriggerClassName}>
              Comments
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab Content */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <TabsContent value="overview" className="m-0 mt-0 h-full overflow-auto p-6">
            {tasksSection}

            <UserOverviewPreviews
              userId={userId}
              onNavigateComments={() => handleTabChange("comments")}
              onNavigateReviews={() => handleTabChange("reviews")}
              onNavigateOccupation={() => handleTabChange("occupation")}
              onNavigateProjects={() => handleTabChange("projects")}
              onOpenProject={handleOpenProject}
              onOpenTaskKeepingDetail={onOpenTaskKeepingDetail}
            />
          </TabsContent>

          <TabsContent value="tasks" className="m-0 mt-0 h-full overflow-hidden p-0">
            <UserTasksTabContent
              userId={userId}
              onOpenTask={handleOpenTaskFromList}
              className="h-full"
            />
          </TabsContent>

          <TabsContent value="occupation" className="m-0 mt-0 h-full overflow-auto p-6">
            <h3 className="mb-3 text-base font-medium text-gray-900">Occupation</h3>
            <UserOccupationSection userId={userId} />
          </TabsContent>

          <TabsContent value="projects" className="m-0 mt-0 h-full overflow-auto p-6">
            <UserProjectsListSection
              userId={userId}
              onOpenProject={handleOpenProject}
            />
          </TabsContent>

          <TabsContent value="reviews" className="m-0 mt-0 h-full overflow-auto p-6">
            <UserReviewsSection userId={userId} active={activeTab === "reviews"} />
            <div className="mt-10">
              <ImprovementPlanSection userId={userId} />
            </div>
          </TabsContent>

          <TabsContent value="comments" className="m-0 mt-0 flex h-full flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between gap-3 px-6 pb-2 pt-6">
              <h3 className="text-base font-medium text-gray-900">Comments</h3>
              {commentsHeaderActions}
            </div>
            <div className="min-h-0 flex-1">
              <UserSharedCommentsTab
                profileUserId={userId}
                isActive={activeTab === "comments"}
                variant="tab"
                onOpenTaskKeepingDetail={onOpenTaskKeepingDetail}
                onHeaderActionsChange={setCommentsHeaderActions}
              />
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Delete User AlertDialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive this user? This will mark them as inactive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Archiving..." : "Archive User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <UserSettingsPanel
        open={showUserSettings && isOwnProfile}
        onClose={() => setShowUserSettings(false)}
        userId={userId}
        initialCategory={settingsCategory}
        onOpenTeam={(teamId) => {
          setShowUserSettings(false)
          handleTeamClick(teamId)
        }}
        onOpenProject={(projectId) => {
          setShowUserSettings(false)
          handleOpenProject(projectId)
        }}
      />

    </div>
  )
}

