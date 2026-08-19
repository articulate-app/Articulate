"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  LogOut,
  Settings,
  User,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { invokeEdgeFunctionFetch } from "@/lib/edge-functions"
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useCallback, useEffect, useState } from "react"
import { useBodyScrollLock } from "../../hooks/use-body-scroll-lock"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog"
import { Button } from "./button"
import { Input } from "./input"
import { Label } from "./label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"
import { TooltipProvider } from "./tooltip"
import { toast } from "./use-toast"
import { createProject, createProjectWithTeam } from "../../lib/services/projects"
import { getRoles } from "../../lib/services/teams"
import { Checkbox } from "./checkbox"
import type { AdminCreateUserPayload, AdminCreateUserResponse } from "../../types/users"
import { useGlobalSearchContext } from "../../contexts/global-search-context"
import { buildObjectRoute, type SearchObjectRoute } from "../../lib/search-routing"
import { mergeWorkspaceUrlState, parseWorkspaceUrlState } from "../../lib/workspace-url-state"
import { type GlobalSearchResultTab } from "../../lib/global-search-types"
import {
  openWorkspaceView,
  resolveFocusedWorkspacePane,
} from "../../lib/open-workspace-view"
import { getImageUrl } from "../../lib/public-media"
import { UserAvatar } from "../UserAvatar"
import { useCurrentUserStore } from "../../store/current-user"
import { fetchMentionsInboxCounts, trackGlobalObjectOpen } from "../../lib/services/global-search"
import { bumpAndInvalidateHomeSidebarRecent } from "../../lib/home-sidebar-recents-cache"
import {
  SidebarHomeFeed,
} from "./sidebar-home-feed"
import { ProjectSettingsPanel } from "../projects/ProjectSettingsPanel"
import { AccountProfileDialog } from "./account-profile-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu"
import { useTasksSidebar } from "../../contexts/tasks-sidebar-context"

interface SidebarProps {
  isCollapsed: boolean
  isMobileMenuOpen?: boolean
  onClose?: () => void
  /** Desktop: open the ChatGPT-style global search modal. */
  onOpenSearch?: () => void
}

type OpenNewUserModalDetail = {
  email?: string
  fullName?: string
}

export function Sidebar({
  isCollapsed,
  isMobileMenuOpen = false,
  onClose,
  onOpenSearch,
}: SidebarProps) {
  const CREATE_NEW_TEAM_OPTION = "__create_new_team__";
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const supabase = createClientComponentClient();
  const globalSearch = useGlobalSearchContext();
  const tasksSidebar = useTasksSidebar();
  const onSidebarToggle = tasksSidebar?.onSidebarToggle;

  // Current-user identity (same source as TaskHeaderBar account menu).
  const fullName = useCurrentUserStore((s) => s.fullName);
  const photo = useCurrentUserStore((s) => s.photo);
  const userMetadata = useCurrentUserStore((s) => s.userMetadata);
  const accountDisplayName = fullName || userMetadata?.full_name || userMetadata?.email || "User";
  const accountAvatarUrl = getImageUrl(photo || userMetadata?.photo || userMetadata?.avatar_url || null);

  const handleOpenSettings = useCallback(() => {
    mergeWorkspaceUrlState(
      { settings: "open", settingsCategory: null },
      { source: "sidebar-open-settings", mode: "push" },
    );
    onClose?.();
  }, [onClose]);

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [definitionsProjectId, setDefinitionsProjectId] = useState<number | null>(null);
  const showExpandedChrome = !isCollapsed || isMobileMenuOpen;

  const handleAccountSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    onClose?.();
    router.push("/auth");
  }, [router, supabase, onClose]);
  
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [selectedTeamValue, setSelectedTeamValue] = useState<string>("");
  const [newTeamName, setNewTeamName] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserTeamId, setNewUserTeamId] = useState<number | null>(null);
  const [newUserRoleId, setNewUserRoleId] = useState<number | null>(null);
  const [sendInvite, setSendInvite] = useState(true);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    const handleOpenNewUserModal = (event: Event) => {
      const customEvent = event as CustomEvent<OpenNewUserModalDetail>
      const detail = customEvent.detail || {}
      setShowNewUserModal(true)
      setEmailError(null)
      if (detail.email) setNewUserEmail(detail.email)
      if (detail.fullName) setNewUserName(detail.fullName)
    }

    window.addEventListener("app:open-new-user-modal", handleOpenNewUserModal)
    return () => {
      window.removeEventListener("app:open-new-user-modal", handleOpenNewUserModal)
    }
  }, [])

  // Fetch projects
  const { data: projects } = useQuery({
    queryKey: ['projects-minimal'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_projects_minimal')
        .select('id, name, color, logo')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: false,
  });

  // Fetch teams (for create-project / create-user modals)
  const { data: teams } = useQuery({
    queryKey: ['teams-minimal'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_teams_minimal')
        .select('id, title, logo')
        .order('title');
      if (error) throw error;
      return data || [];
    },
    enabled: showNewProjectModal || showNewUserModal,
  });

  // Fetch users
  const { data: users } = useQuery({
    queryKey: ['users-minimal'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_users_minimal_i_can_see')
        .select('id, full_name, email, photo')
        .order('full_name');
      if (error) throw error;
      return data || [];
    },
    enabled: showNewUserModal,
  });

  // Fetch roles (enabled when creating a user)
  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await getRoles();
      if (error) throw error;
      return data || [];
    },
    enabled: showNewUserModal,
  });

  const mentionCountsQuery = useQuery({
    queryKey: ["sidebar-mentions-counts"],
    queryFn: ({ signal }) => fetchMentionsInboxCounts(signal),
    staleTime: 30_000,
  })
  const hasUnseenMentions = (mentionCountsQuery.data?.unseen ?? 0) > 0
  const activeObject = parseWorkspaceUrlState(new URLSearchParams(searchParams.toString())).object

  const isObjectActive = useCallback(
    (object: SearchObjectRoute | undefined) => {
      if (!object) return false
      return activeObject === object
    },
    [activeObject],
  )

  const navigateTo = useCallback((href: string, object?: SearchObjectRoute) => {
    const tabByObject: Record<SearchObjectRoute, GlobalSearchResultTab> = {
      all: "all",
      task: "task",
      project: "project",
      mention: "mention",
      user: "user",
      team: "team",
      ai_thread: "ai_thread",
      artifact: "artifact",
    }
    const objectByHref: Record<string, SearchObjectRoute | undefined> = {
      "/": "all",
      "/tasks": "task",
      "/projects": "project",
      "/mentions": "mention",
      "/users": "user",
      "/teams": "team",
      "/ai-threads": "ai_thread",
      "/artifacts": "artifact",
    }
    const targetObject = object ?? objectByHref[href]

    if (targetObject) {
      const baseSearchParams =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams(searchParams.toString())
      const nextRoute = buildObjectRoute(targetObject, baseSearchParams)
      router.push(nextRoute.url, { scroll: false })
      const nextTab = tabByObject[targetObject]
      if (nextTab && globalSearch?.setActiveResultTab) {
        globalSearch.setActiveResultTab(nextTab)
      }
      return
    }

    if (pathname !== href) {
      router.replace(href, { scroll: false })
    }
  }, [globalSearch, pathname, router, searchParams]);

  const openSidebarSearchResult = useCallback((
    entityType: "project" | "team" | "user",
    entityId: number,
  ) => {
    // Pane-neutral: open in the focused workspace pane (fallback: middle).
    // Do not rewrite left-pane object= routes — sidebar lists are navigation only.
    openWorkspaceView(
      { type: entityType, id: entityId },
      {
        pane: resolveFocusedWorkspacePane(),
        pathname: "/",
        source: "sidebar-entity-open",
      },
    )
  }, []);

  const handleProjectClick = (projectId: number) => {
    openSidebarSearchResult("project", projectId);
  };

  const handleUserClick = (userId: number) => {
    openSidebarSearchResult("user", userId);
  };

  const handleTaskClick = useCallback((taskId: number) => {
    openWorkspaceView(
      { type: "task", taskId, id: taskId },
      {
        pane: resolveFocusedWorkspacePane(),
        pathname: "/",
        source: "sidebar-task-open",
      },
    )
    bumpAndInvalidateHomeSidebarRecent(queryClient, "tasks", {
      id: String(taskId),
      title: `Task ${taskId}`,
    })
    void trackGlobalObjectOpen({ entityType: "task", entityId: String(taskId) }).catch(() => {})
    onClose?.()
  }, [onClose, queryClient])

  const handleMentionClick = useCallback((args: { threadId: string; mentionId?: string | null }) => {
    openWorkspaceView(
      {
        type: "thread",
        id: args.threadId,
        params: { mentionId: args.mentionId ?? null },
      },
      {
        pane: resolveFocusedWorkspacePane(),
        pathname: "/",
        source: "sidebar-thread-open",
      },
    )
    onClose?.()
  }, [onClose])

  const handleAiChatClick = useCallback((threadId: string) => {
    openWorkspaceView(
      { type: "ai", aiThreadId: threadId },
      {
        pane: "left",
        pathname: "/",
        source: "sidebar-ai-open",
      },
    )
    onClose?.()
  }, [onClose])

  const handleCreateAiChat = useCallback(() => {
    openWorkspaceView(
      { type: "ai", params: { forceNewAiThread: true } },
      {
        pane: "left",
        pathname: "/",
        source: "sidebar-ai-create",
      },
    )
    onClose?.()
  }, [onClose])

  const handleOpenTaskList = useCallback(() => {
    openWorkspaceView(
      { type: "task-list", title: "Tasks" },
      {
        pane: "left",
        pathname: "/",
        source: "sidebar-task-list-open",
      },
    )
    onClose?.()
  }, [onClose])

  const handleOpenTemplateList = useCallback(() => {
    openWorkspaceView(
      { type: "template-list", title: "Templates" },
      {
        pane: "left",
        pathname: "/",
        source: "sidebar-template-list-open",
      },
    )
    onClose?.()
  }, [onClose])

  const handleOpenListView = useCallback(
    (object: SearchObjectRoute) => {
      const listByObject: Partial<
        Record<
          SearchObjectRoute,
          | "task-list"
          | "project-list"
          | "mention-list"
          | "user-list"
          | "ai-thread-list"
          | "artifact-list"
        >
      > = {
        task: "task-list",
        project: "project-list",
        mention: "mention-list",
        user: "user-list",
        ai_thread: "ai-thread-list",
        artifact: "artifact-list",
      }
      const listType = listByObject[object]
      if (!listType) {
        navigateTo("/", object)
        return
      }
      openWorkspaceView(
        { type: listType },
        {
          pane: "left",
          pathname: "/",
          source: `sidebar-list-open:${listType}`,
        },
      )
      onClose?.()
    },
    [navigateTo, onClose],
  )

  const handleNavigateObject = useCallback(
    (object: SearchObjectRoute) => {
      // Object lists open as left-pane workspace tabs (no reserved left-home switcher).
      if (
        object === "task" ||
        object === "project" ||
        object === "mention" ||
        object === "user" ||
        object === "ai_thread" ||
        object === "artifact"
      ) {
        handleOpenListView(object)
        return
      }
      navigateTo("/", object)
      onClose?.()
    },
    [handleOpenListView, navigateTo, onClose],
  )

  const handleProjectDefinitions = useCallback((projectId: number) => {
    setDefinitionsProjectId(projectId)
  }, [])

  const accountMenu = (
    <div className="mt-auto shrink-0 border-t border-gray-100 pt-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-gray-100",
              !showExpandedChrome && "justify-center px-0",
            )}
            aria-label="Account menu"
          >
            <UserAvatar name={accountDisplayName} photoUrl={accountAvatarUrl} size="sm" />
            {showExpandedChrome ? (
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                {accountDisplayName}
              </span>
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="min-w-[200px]">
          <DropdownMenuItem onSelect={() => setIsProfileModalOpen(true)}>
            <User className="mr-2 h-4 w-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleOpenSettings}>
            <Settings className="mr-2 h-4 w-4" />
            Preferences
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              mergeWorkspaceUrlState(
                { settings: "open", settingsCategory: "ai-limits" },
                { source: "sidebar-open-ai-usage", mode: "push" },
              )
              onClose?.()
            }}
          >
            AI usage
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { void handleAccountSignOut() }}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const getProjectLogoUrl = (logo: string | null | undefined) => getImageUrl(logo);
  const getTeamLogoUrl = (logo: string | null | undefined) => getImageUrl(logo);
  const getUserPhotoUrl = (photo: string | null | undefined) => getImageUrl(photo);
  const getTeamLabel = (team: { title?: string | null; name?: string | null; full_name?: string | null }) =>
    team.title?.trim() || team.name?.trim() || team.full_name?.trim() || "Untitled team";

  const handleCreateProject = async () => {
    if (isCreatingProject) return;

    const trimmedProjectName = newProjectName.trim();
    const trimmedTeamName = newTeamName.trim();
    const isCreatingNewTeam = selectedTeamValue === CREATE_NEW_TEAM_OPTION;
    const selectedExistingTeamId = isCreatingNewTeam
      ? null
      : Number.isFinite(Number(selectedTeamValue))
        ? Number(selectedTeamValue)
        : null;

    if (!trimmedProjectName) {
      toast({
        title: "Validation Error",
        description: "Project name is required",
        variant: "destructive",
      });
      return;
    }

    if (isCreatingNewTeam && !trimmedTeamName) {
      toast({
        title: "Validation Error",
        description: "Team name is required when creating a new team",
        variant: "destructive",
      });
      return;
    }

    if (!isCreatingNewTeam && !selectedExistingTeamId) {
      toast({
        title: "Validation Error",
        description: "Team selection is required",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingProject(true);
    try {
      const { data, error } = isCreatingNewTeam
        ? await createProjectWithTeam(trimmedProjectName, trimmedTeamName)
        : await createProject(trimmedProjectName, selectedExistingTeamId as number);

      if (error) throw error;

      const createdRecord = Array.isArray(data) ? data[0] : data;
      const createdProjectId =
        createdRecord?.id ??
        createdRecord?.project_id ??
        createdRecord?.created_project_id ??
        null;

      if (!createdProjectId) {
        throw new Error("Failed to create project");
      }

      toast({
        title: "Success",
        description: "Project created successfully",
      });

      // Refresh project and team lists to keep modal/options up to date.
      queryClient.invalidateQueries({ queryKey: ['projects-minimal'] });
      queryClient.invalidateQueries({ queryKey: ['teams-minimal'] });

      // Navigate to the new project
      router.push(`/projects/${createdProjectId}`);

      // Close modal and reset
      setShowNewProjectModal(false);
      setNewProjectName("");
      setSelectedTeamValue("");
      setNewTeamName("");
      if (onClose) onClose();
    } catch (err: any) {
      const formattedMessageParts = [
        err?.message,
        err?.details,
        err?.hint,
      ].filter((part, index, arr) => Boolean(part) && arr.indexOf(part) === index);

      toast({
        title: "Error",
        description: formattedMessageParts.join(" - ") || "Failed to create project",
        variant: "destructive",
      });
    } finally {
      setIsCreatingProject(false);
    }
  };

  // Validate email format
  const validateEmail = (email: string): boolean => {
    if (!email.trim()) return false;
    return email.includes('@');
  };

  const handleCreateUser = async () => {
    // Reset email error
    setEmailError(null);

    // Validate email
    if (!newUserEmail.trim()) {
      setEmailError("Email is required");
      toast({
        title: "Validation Error",
        description: "Email is required",
        variant: "destructive",
      });
      return;
    }

    if (!validateEmail(newUserEmail.trim())) {
      setEmailError("Please enter a valid email address");
      toast({
        title: "Validation Error",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingUser(true);
    try {
      // Build payload
      const payload: AdminCreateUserPayload = {
        email: newUserEmail.trim(),
        full_name: newUserName.trim() || undefined,
        team_id: newUserTeamId ?? null,
        role_id: newUserRoleId ?? null,
        send_invite: sendInvite,
      };

      // Get Supabase URL
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
      }

      // Call Edge Function
      const res = await invokeEdgeFunctionFetch({
        supabase,
        url: `${supabaseUrl}/functions/v1/admin-create-user`,
        debugLabel: "admin-create-user",
        init: {
          method: "POST",
          body: JSON.stringify(payload),
        },
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        const errorMessage = errorBody?.error || errorBody?.message || `Failed to create user (${res.status})`;
        
        // Check for duplicate email error
        if (res.status === 400 && (errorMessage.toLowerCase().includes('email') || errorMessage.toLowerCase().includes('already exists'))) {
          setEmailError("A user with this email already exists.");
          toast({
            title: "Error",
            description: "A user with this email already exists.",
            variant: "destructive",
          });
          return;
        }

        throw new Error(errorMessage);
      }

      const created: AdminCreateUserResponse = await res.json();

      toast({
        title: "Success",
        description: `User ${created.email} created successfully`,
      });

      // Refresh users list
      queryClient.invalidateQueries({ queryKey: ['users-minimal'] });

      // Navigate to the new user
      router.push(`/users/${created.public_user_id}`);

      // Close modal and reset
      setShowNewUserModal(false);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserTeamId(null);
      setNewUserRoleId(null);
      setSendInvite(true);
      setEmailError(null);
      if (onClose) onClose();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to create user",
        variant: "destructive",
      });
    } finally {
      setIsCreatingUser(false);
    }
  };

  useBodyScrollLock(isMobileMenuOpen)

  // Mobile overlay/drawer. Width is capped to the viewport so a 256px rail never flashes mid-screen.
  const mobileOverlay =
    'fixed inset-0 z-[90] bg-black/40 md:hidden';
  const mobileSidebar =
    'fixed left-0 top-0 z-50 flex h-dvh min-h-dvh w-[min(16rem,100vw)] max-w-full flex-col bg-white shadow-lg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]';

  const objectFeed = (
    <SidebarHomeFeed
      showExpandedChrome={showExpandedChrome}
      isObjectActive={isObjectActive}
      hasUnseenMentions={hasUnseenMentions}
      onNavigateObject={handleNavigateObject}
      onOpenTaskList={handleOpenTaskList}
      onOpenTemplateList={handleOpenTemplateList}
      onOpenProject={(projectId) => {
        handleProjectClick(projectId)
        onClose?.()
      }}
      onOpenProjectDefinitions={handleProjectDefinitions}
      onOpenTask={handleTaskClick}
      onOpenMention={handleMentionClick}
      onOpenUser={(userId) => {
        handleUserClick(userId)
        onClose?.()
      }}
      onOpenAiChat={handleAiChatClick}
      onCreateAiChat={handleCreateAiChat}
      onSidebarToggle={onSidebarToggle}
      onOpenSearch={onOpenSearch}
      hideBrandRow={isMobileMenuOpen}
    />
  )

  return (
    <>
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className={mobileOverlay}>
          <button
            type="button"
            aria-label="Close sidebar"
            className="absolute inset-0"
            onClick={onClose}
          />
          <div className={cn(mobileSidebar, "relative")}>
            <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-3">
              <span className="min-w-0 truncate text-base font-semibold tracking-tight text-gray-900">
                Articulate
              </span>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100"
                aria-label="Close sidebar"
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden px-3">{objectFeed}</div>
            <div className="shrink-0 px-3">{accountMenu}</div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar — logo/search/create stay sticky; feed scrolls underneath */}
      <TooltipProvider delayDuration={120}>
        <nav className="relative z-30 hidden h-full md:flex md:flex-col">
          <div className="flex h-full min-h-0 flex-col">
            {objectFeed}
            {accountMenu}
          </div>
        </nav>
      </TooltipProvider>

      {definitionsProjectId != null ? (
        <ProjectSettingsPanel
          open
          projectId={definitionsProjectId}
          initialCategory="details"
          onClose={() => setDefinitionsProjectId(null)}
        />
      ) : null}
      <AccountProfileDialog open={isProfileModalOpen} onOpenChange={setIsProfileModalOpen} />

      {/* New Project Modal */}
      <Dialog open={showNewProjectModal} onOpenChange={setShowNewProjectModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Enter a name for your new project. You can configure all other details later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">
                Project Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="project-name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="e.g., Website Redesign"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isCreatingProject) {
                    handleCreateProject();
                  }
                }}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="team-select">
                Team <span className="text-red-500">*</span>
              </Label>
              <Select
                value={selectedTeamValue}
                onValueChange={setSelectedTeamValue}
              >
                <SelectTrigger id="team-select">
                  <SelectValue placeholder="Select a team" />
                </SelectTrigger>
                <SelectContent className="z-[120]">
                  <SelectItem value={CREATE_NEW_TEAM_OPTION}>
                    + Create new team
                  </SelectItem>
                  {teams?.map((team) => (
                    <SelectItem key={team.id} value={team.id.toString()}>
                      <div className="flex items-center gap-2">
                        {team.logo ? (
                          <img 
                            src={team.logo} 
                            alt={getTeamLabel(team)}
                            className="w-4 h-4 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-gray-300" />
                        )}
                        <span>{getTeamLabel(team)}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedTeamValue === CREATE_NEW_TEAM_OPTION && (
              <div className="space-y-2">
                <Label htmlFor="new-team-name">
                  Team Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="new-team-name"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g., Acme Team"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isCreatingProject) {
                      handleCreateProject();
                    }
                  }}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewProjectModal(false);
                setNewProjectName("");
                setSelectedTeamValue("");
                setNewTeamName("");
              }}
              disabled={isCreatingProject}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={
                isCreatingProject ||
                !newProjectName.trim() ||
                !selectedTeamValue ||
                (selectedTeamValue === CREATE_NEW_TEAM_OPTION && !newTeamName.trim())
              }
            >
              {isCreatingProject ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New User Modal */}
      <Dialog open={showNewUserModal} onOpenChange={setShowNewUserModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Enter user details. Email is required; other fields are optional.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="user-email">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="user-email"
                type="email"
                value={newUserEmail}
                onChange={(e) => {
                  setNewUserEmail(e.target.value);
                  setEmailError(null);
                }}
                placeholder="e.g., john@example.com"
                autoFocus
                className={emailError ? "border-red-500" : ""}
              />
              {emailError && (
                <p className="text-sm text-red-500">{emailError}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-name">
                Full Name
              </Label>
              <Input
                id="user-name"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="e.g., John Doe"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-team-select">
                Team
              </Label>
              <Select
                value={newUserTeamId === null ? "none" : newUserTeamId?.toString()}
                onValueChange={(value) => {
                  if (value === "none") {
                    setNewUserTeamId(null);
                  } else {
                    setNewUserTeamId(Number(value));
                  }
                }}
              >
                <SelectTrigger id="user-team-select">
                  <SelectValue placeholder="Select a team (optional)" />
                </SelectTrigger>
                <SelectContent className="z-[120]">
                  <SelectItem value="none">None</SelectItem>
                  {teams?.map((team) => (
                    <SelectItem key={team.id} value={team.id.toString()}>
                      <div className="flex items-center gap-2">
                        {team.logo ? (
                          <img 
                            src={team.logo} 
                            alt={getTeamLabel(team)}
                            className="w-4 h-4 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-gray-300" />
                        )}
                        <span>{getTeamLabel(team)}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-role-select">
                Role
              </Label>
              <Select
                value={newUserRoleId === null ? "none" : newUserRoleId?.toString()}
                onValueChange={(value) => {
                  if (value === "none") {
                    setNewUserRoleId(null);
                  } else {
                    setNewUserRoleId(Number(value));
                  }
                }}
              >
                <SelectTrigger id="user-role-select">
                  <SelectValue placeholder="Select a role (optional)" />
                </SelectTrigger>
                <SelectContent className="z-[120]">
                  <SelectItem value="none">None</SelectItem>
                  {roles?.map((role) => (
                    <SelectItem key={role.id} value={role.id.toString()}>
                      {role.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="send-invite"
                checked={sendInvite}
                onCheckedChange={(checked) => setSendInvite(checked === true)}
              />
              <Label
                htmlFor="send-invite"
                className="text-sm font-normal cursor-pointer"
              >
                Send invite email
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewUserModal(false);
                setNewUserName("");
                setNewUserEmail("");
                setNewUserTeamId(null);
                setNewUserRoleId(null);
                setSendInvite(true);
                setEmailError(null);
              }}
              disabled={isCreatingUser}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateUser}
              disabled={isCreatingUser || !newUserEmail.trim() || !validateEmail(newUserEmail.trim())}
            >
              {isCreatingUser ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
