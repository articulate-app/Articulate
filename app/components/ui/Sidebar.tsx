"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Home, ListTodo, FolderKanban, Users, User, FileText, ChevronDown, ChevronRight, Plus, AtSign, Settings, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { invokeEdgeFunctionFetch } from "@/lib/edge-functions"
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useCallback, useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog"
import { Button } from "./button"
import { Input } from "./input"
import { Label } from "./label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip"
import { toast } from "./use-toast"
import { createProject, createProjectWithTeam } from "../../lib/services/projects"
import { getRoles } from "../../lib/services/teams"
import { Checkbox } from "./checkbox"
import type { AdminCreateUserPayload, AdminCreateUserResponse } from "../../types/users"
import { useGlobalSearchContext } from "../../contexts/global-search-context"
import { buildObjectRoute, type SearchObjectRoute } from "../../lib/search-routing"
import { parseWorkspaceUrlState } from "../../lib/workspace-url-state"
import { type GlobalSearchResultTab } from "../../lib/global-search-types"
import { buildRightPaneSelectionSearchParams } from "../../lib/right-pane-selection-url"
import { buildCenterPaneSelectionSearchParams } from "../../lib/center-pane-selection-url"
import { getImageUrl } from "../../lib/public-media"
import { UserAvatar } from "../UserAvatar"
import { useCurrentUserStore } from "../../store/current-user"
import { leftPaneObjectLabel } from "../../lib/left-pane-object"
import { fetchMentionsInbox } from "../../lib/services/global-search"

const navigation = [
  { name: leftPaneObjectLabel("all"), href: "/", icon: Home, object: "all" as SearchObjectRoute },
  { name: "Tasks", href: "/", icon: ListTodo, object: "task" as SearchObjectRoute },
  { name: "Projects", href: "/", icon: FolderKanban, isExpandable: true, object: "project" as SearchObjectRoute },
  { name: "Mentions", href: "/", icon: AtSign, object: "mention" as SearchObjectRoute },
  { name: "Teams", href: "/", icon: Users, isExpandable: true, object: "team" as SearchObjectRoute },
  { name: "Users", href: "/", icon: User, isExpandable: true, object: "user" as SearchObjectRoute },
  { name: "Financials", href: "/financials", icon: FileText },
]

interface SidebarProps {
  isCollapsed: boolean
  isMobileMenuOpen?: boolean
  onClose?: () => void
}

type OpenNewUserModalDetail = {
  email?: string
  fullName?: string
}

export function Sidebar({ isCollapsed, isMobileMenuOpen = false, onClose }: SidebarProps) {
  const CREATE_NEW_TEAM_OPTION = "__create_new_team__";
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const supabase = createClientComponentClient();
  const globalSearch = useGlobalSearchContext();

  // Current-user identity (same source/behavior as the desktop TaskHeaderBar account menu, which is
  // hidden on mobile). Surfaced in the mobile sidebar so the signed-in user/avatar stays visible.
  const fullName = useCurrentUserStore((s) => s.fullName);
  const userMetadata = useCurrentUserStore((s) => s.userMetadata);
  const accountDisplayName = fullName || userMetadata?.full_name || userMetadata?.email || "User";
  const accountAvatarUrl = getImageUrl(userMetadata?.photo || userMetadata?.avatar_url || null);

  const handleOpenSettings = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("settings", "open");
    router.push(`/?${next.toString()}`);
    onClose?.();
  }, [router, searchParams, onClose]);

  const handleAccountSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    onClose?.();
    router.push("/auth");
  }, [router, supabase, onClose]);
  
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(false);
  const [isTeamsExpanded, setIsTeamsExpanded] = useState(false);
  const [isUsersExpanded, setIsUsersExpanded] = useState(false);
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
    enabled: isProjectsExpanded && (!isCollapsed || isMobileMenuOpen),
  });

  // Fetch teams (enabled when expanded OR when creating a project/user)
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
    enabled: (isTeamsExpanded && (!isCollapsed || isMobileMenuOpen)) || showNewProjectModal || showNewUserModal,
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
    enabled: isUsersExpanded && (!isCollapsed || isMobileMenuOpen),
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
    queryFn: ({ signal }) =>
      fetchMentionsInbox({
        mode: "received",
        seenFilter: "unseen",
        limit: 1,
        offset: 0,
        signal,
      }),
    staleTime: 30_000,
  })
  const hasUnseenMentions = (mentionCountsQuery.data?.length ?? 0) > 0
  const activeObject = parseWorkspaceUrlState(new URLSearchParams(searchParams.toString())).object

  const isObjectActive = useCallback(
    (object: SearchObjectRoute | undefined) => {
      if (!object) return false
      return activeObject === object
    },
    [activeObject],
  )

  const toggleExpandedGroup = useCallback((group: "projects" | "teams" | "users") => {
    if (group === "projects") setIsProjectsExpanded((current) => !current)
    if (group === "teams") setIsTeamsExpanded((current) => !current)
    if (group === "users") setIsUsersExpanded((current) => !current)
  }, [])

  const navigateTo = useCallback((href: string, object?: SearchObjectRoute) => {
    const tabByObject: Record<SearchObjectRoute, GlobalSearchResultTab> = {
      all: "all",
      task: "task",
      project: "project",
      mention: "mention",
      user: "user",
      team: "team",
      ai_thread: "ai_thread",
    }
    const objectByHref: Record<string, SearchObjectRoute | undefined> = {
      "/": "all",
      "/tasks": "task",
      "/projects": "project",
      "/mentions": "mention",
      "/users": "user",
      "/teams": "team",
      "/ai-threads": "ai_thread",
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
    const targetObject: SearchObjectRoute = entityType === "project" ? "project" : entityType === "team" ? "team" : "user"
    const currentParams = new URLSearchParams(searchParams.toString())
    const routeWithObject = buildObjectRoute(targetObject, currentParams)
    const baseParams = new URLSearchParams(routeWithObject.searchParams.toString())
    const isAiRightPane = currentParams.get("rightView") === "ai"
    const next = isAiRightPane
      ? buildCenterPaneSelectionSearchParams({
          currentSearchParams: baseParams,
          entity: entityType === "project" ? "project" : entityType === "team" ? "team" : "user",
          id: String(entityId),
          tab: null,
        })
      : buildRightPaneSelectionSearchParams({
          currentSearchParams: baseParams,
          entity: entityType === "project" ? "project" : entityType === "team" ? "team" : "user",
          id: String(entityId),
          tab: null,
        })
    const query = next.toString()
    router.push(query ? `/?${query}` : "/", { scroll: false })
  }, [router, searchParams]);

  const handleProjectClick = (projectId: number) => {
    openSidebarSearchResult("project", projectId);
  };

  const handleTeamClick = (teamId: number) => {
    openSidebarSearchResult("team", teamId);
  };

  const handleUserClick = (userId: number) => {
    openSidebarSearchResult("user", userId);
  };

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

  // Mobile overlay/drawer styles. The drawer spans the full dynamic viewport height (`100dvh`) so it
  // never feels cut off on mobile browsers whose URL bar changes the visible height. `100vh` fallback
  // is implicit via the arbitrary value; the inner flex column (nav scrolls, footer pinned) handles
  // internal scrolling.
  const mobileOverlay =
    'fixed inset-0 z-40 bg-black bg-opacity-40 flex md:hidden transition-opacity duration-200';
  const mobileSidebar =
    'fixed left-0 top-0 z-50 bg-white w-64 shadow-lg p-4 h-[100dvh] min-h-[100dvh]';

  return (
    <>
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className={mobileOverlay}>
          <div className={cn(mobileSidebar, "flex flex-col")}>
            <button
              onClick={onClose}
              className="absolute top-2 right-2 p-2 rounded hover:bg-gray-100"
              aria-label="Close sidebar"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <ul className="space-y-2 mt-8 min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              {navigation.map((item) => (
                <li key={item.name} className="relative">
                  {item.isExpandable ? (
                    <div>
                      <button
                        onClick={() => {
                          navigateTo(item.href, item.object);
                        }}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors w-full text-left",
                          isObjectActive(item.object) ? "bg-gray-100" : ""
                        )}
                      >
                        <item.icon className="w-5 h-5" />
                        <span className="flex flex-1 items-center gap-2">
                          {item.name}
                          {item.name === "Mentions" && hasUnseenMentions ? <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden /> : null}
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation()
                            event.preventDefault()
                            if (item.name === "Projects") toggleExpandedGroup("projects")
                            if (item.name === "Teams") toggleExpandedGroup("teams")
                            if (item.name === "Users") toggleExpandedGroup("users")
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return
                            event.stopPropagation()
                            event.preventDefault()
                            if (item.name === "Projects") toggleExpandedGroup("projects")
                            if (item.name === "Teams") toggleExpandedGroup("teams")
                            if (item.name === "Users") toggleExpandedGroup("users")
                          }}
                          className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-gray-200"
                          aria-label={`Toggle ${item.name}`}
                        >
                          {((item.name === 'Projects' && isProjectsExpanded) || (item.name === 'Teams' && isTeamsExpanded) || (item.name === 'Users' && isUsersExpanded)) ? (
                            <ChevronDown className="w-4 h-4 stroke-[1.75]" />
                          ) : (
                            <ChevronRight className="w-4 h-4 stroke-[1.75]" />
                          )}
                        </span>
                      </button>
                      {/* Projects list */}
                      {item.name === 'Projects' && isProjectsExpanded && (
                        <ul className="ml-8 mt-1 space-y-1">
                          <li>
                            <button
                              onClick={() => setShowNewProjectModal(true)}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-blue-50 transition-colors w-full text-left text-sm text-blue-600 font-medium"
                            >
                              <Plus className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">New Project</span>
                            </button>
                          </li>
                          {projects?.map((project) => (
                            <li key={project.id}>
                              <button
                                onClick={() => handleProjectClick(project.id)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors w-full text-left text-sm"
                              >
                                {getProjectLogoUrl(project.logo) ? (
                                  <img
                                    src={getProjectLogoUrl(project.logo) || ""}
                                    alt={project.name}
                                    className="w-3 h-3 rounded-full flex-shrink-0 object-cover"
                                  />
                                ) : (
                                  <div
                                    className="w-3 h-3 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: project.color || '#d1d5db' }}
                                  />
                                )}
                                <span className="truncate">{project.name}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {/* Teams list */}
                      {item.name === 'Teams' && isTeamsExpanded && (
                        <ul className="ml-8 mt-1 space-y-1">
                          {teams?.map((team) => (
                            <li key={team.id}>
                              <button
                                onClick={() => handleTeamClick(team.id)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors w-full text-left text-sm"
                              >
                                {getTeamLogoUrl(team.logo) ? (
                                  <img 
                                    src={getTeamLogoUrl(team.logo) || ""} 
                                    alt={getTeamLabel(team)}
                                    className="w-3 h-3 rounded-full flex-shrink-0 object-cover"
                                  />
                                ) : (
                                  <div className="w-3 h-3 rounded-full flex-shrink-0 bg-gray-300" />
                                )}
                                <span className="truncate">{getTeamLabel(team)}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {/* Users list */}
                      {item.name === 'Users' && isUsersExpanded && (
                        <ul className="ml-8 mt-1 space-y-1">
                          <li>
                            <button
                              onClick={() => setShowNewUserModal(true)}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-blue-50 transition-colors w-full text-left text-sm text-blue-600 font-medium"
                            >
                              <Plus className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">New User</span>
                            </button>
                          </li>
                          {users?.map((user) => (
                            <li key={user.id}>
                              <button
                                onClick={() => handleUserClick(user.id)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors w-full text-left text-sm"
                              >
                                <UserAvatar
                                  name={user.full_name || user.email || 'User'}
                                  photoUrl={getUserPhotoUrl(user.photo)}
                                  size="xs"
                                />
                                <span className="truncate">{user.full_name || user.email}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigateTo(item.href, item.object)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors",
                        "group relative text-left",
                        item.object
                          ? (isObjectActive(item.object) ? "bg-gray-100" : "")
                          : (pathname === item.href ||
                              (item.href === "/billing" && pathname.startsWith("/billing")) ||
                              (item.href === "/expenses/supplier-invoices" && pathname.startsWith("/expenses")))
                            ? "bg-gray-100"
                            : ""
                      )}
                    >
                      <item.icon className="w-5 h-5" />
                      <span className="ml-2">{item.name}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {/* Current user identity — mirrors the desktop header account menu (avatar + Preferences +
                Sign out), which is hidden on mobile. Pinned below the scrollable nav so it never crowds it. */}
            <div className="mt-2 shrink-0 border-t border-gray-100 pt-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenSettings}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-gray-100"
                  aria-label="Open preferences"
                >
                  <UserAvatar name={accountDisplayName} photoUrl={accountAvatarUrl} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{accountDisplayName}</span>
                  <Settings className="h-4 w-4 shrink-0 text-gray-400" />
                </button>
                <button
                  type="button"
                  onClick={() => { void handleAccountSignOut() }}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Desktop Sidebar */}
      <TooltipProvider delayDuration={120}>
      <nav className="relative z-30 hidden h-full md:flex md:flex-col">
        <div className="absolute inset-0 overflow-x-hidden overflow-y-auto pl-2">
          <ul className="space-y-1 pt-2 pb-2 overflow-x-hidden">
          {navigation.map((item) => (
            <li key={item.name} className="relative z-0 hover:z-[120]">
              {item.isExpandable ? (
                <div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          navigateTo(item.href, item.object);
                        }}
                        className={cn(
                          "group relative flex w-full items-center justify-start gap-3 rounded-md py-2 pl-3 pr-3 transition-colors hover:bg-gray-100",
                          isObjectActive(item.object) ? "bg-gray-100" : ""
                        )}
                      >
                        {/* Icon: always visible with fixed width */}
                        <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                          <item.icon className="w-5 h-5" />
                        </div>
                        <span className={cn(
                          "transition-all duration-200 flex-1 text-left",
                          isCollapsed ? "opacity-0 w-0 overflow-hidden absolute" : "opacity-100 w-auto"
                        )}>
                          <span className="flex items-center gap-2">
                            {item.name}
                            {item.name === "Mentions" && hasUnseenMentions ? <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden /> : null}
                          </span>
                        </span>
                        {!isCollapsed && (
                          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(event) => {
                                event.stopPropagation()
                                event.preventDefault()
                                if (item.name === "Projects") toggleExpandedGroup("projects")
                                if (item.name === "Teams") toggleExpandedGroup("teams")
                                if (item.name === "Users") toggleExpandedGroup("users")
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") return
                                event.stopPropagation()
                                event.preventDefault()
                                if (item.name === "Projects") toggleExpandedGroup("projects")
                                if (item.name === "Teams") toggleExpandedGroup("teams")
                                if (item.name === "Users") toggleExpandedGroup("users")
                              }}
                              className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-gray-200"
                              aria-label={`Toggle ${item.name}`}
                            >
                              {((item.name === 'Projects' && isProjectsExpanded) || (item.name === 'Teams' && isTeamsExpanded) || (item.name === 'Users' && isUsersExpanded)) ? (
                                <ChevronDown className="w-4 h-4 stroke-[1.75]" />
                              ) : (
                                <ChevronRight className="w-4 h-4 stroke-[1.75]" />
                              )}
                            </span>
                          </div>
                        )}
                      </button>
                    </TooltipTrigger>
                    {isCollapsed ? (
                      <TooltipContent side="right" className="bg-gray-900 text-gray-100">
                        {item.name}
                      </TooltipContent>
                    ) : null}
                  </Tooltip>
                  {/* Projects list */}
                  {item.name === 'Projects' && isProjectsExpanded && !isCollapsed && (
                    <ul className="ml-8 mt-1 space-y-1">
                      <li>
                        <button
                          onClick={() => setShowNewProjectModal(true)}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-blue-50 transition-colors w-full text-left text-sm text-blue-600 font-medium"
                        >
                          <Plus className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">New Project</span>
                        </button>
                      </li>
                      {projects?.map((project) => (
                        <li key={project.id}>
                          <button
                            onClick={() => handleProjectClick(project.id)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors w-full text-left text-sm"
                          >
                            {getProjectLogoUrl(project.logo) ? (
                              <img
                                src={getProjectLogoUrl(project.logo) || ""}
                                alt={project.name}
                                className="w-3 h-3 rounded-full flex-shrink-0 object-cover"
                              />
                            ) : (
                              <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: project.color || '#d1d5db' }}
                              />
                            )}
                            <span className="truncate">{project.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* Teams list */}
                  {item.name === 'Teams' && isTeamsExpanded && !isCollapsed && (
                    <ul className="ml-8 mt-1 space-y-1">
                      {teams?.map((team) => (
                        <li key={team.id}>
                          <button
                            onClick={() => handleTeamClick(team.id)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors w-full text-left text-sm"
                          >
                            {getTeamLogoUrl(team.logo) ? (
                              <img 
                                src={getTeamLogoUrl(team.logo) || ""} 
                                alt={getTeamLabel(team)}
                                className="w-3 h-3 rounded-full flex-shrink-0 object-cover"
                              />
                            ) : (
                              <div className="w-3 h-3 rounded-full flex-shrink-0 bg-gray-300" />
                            )}
                            <span className="truncate">{getTeamLabel(team)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* Users list */}
                  {item.name === 'Users' && isUsersExpanded && !isCollapsed && (
                    <ul className="ml-8 mt-1 space-y-1">
                      <li>
                        <button
                          onClick={() => setShowNewUserModal(true)}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-blue-50 transition-colors w-full text-left text-sm text-blue-600 font-medium"
                        >
                          <Plus className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">New User</span>
                        </button>
                      </li>
                      {users?.map((user) => (
                        <li key={user.id}>
                          <button
                            onClick={() => handleUserClick(user.id)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors w-full text-left text-sm"
                          >
                            <UserAvatar
                              name={user.full_name || user.email || 'User'}
                              photoUrl={getUserPhotoUrl(user.photo)}
                              size="xs"
                            />
                            <span className="truncate">{user.full_name || user.email}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => navigateTo(item.href, item.object)}
                      className={cn(
                        "group relative flex w-full items-center justify-start gap-3 rounded-md py-2 pl-3 pr-3 text-left transition-colors hover:bg-gray-100",
                        item.object
                          ? (isObjectActive(item.object) ? "bg-gray-100" : "")
                          : (pathname === item.href ||
                              (item.href === "/billing" && pathname.startsWith("/billing")) ||
                              (item.href === "/expenses/supplier-invoices" && pathname.startsWith("/expenses")) ||
                              (item.href === "/documents" && pathname.startsWith("/documents")))
                            ? "bg-gray-100"
                            : ""
                      )}
                    >
                      {/* Icon: always visible with fixed width */}
                      <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                        <item.icon className="w-5 h-5" />
                      </div>
                      <span className={cn(
                        "transition-all duration-200",
                        isCollapsed ? "opacity-0 w-0 overflow-hidden absolute" : "opacity-100 w-auto"
                      )}>
                        <span className="flex items-center gap-2">
                          {item.name}
                          {item.name === "Mentions" && hasUnseenMentions ? <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden /> : null}
                        </span>
                      </span>
                    </button>
                  </TooltipTrigger>
                  {isCollapsed ? (
                    <TooltipContent side="right" className="bg-gray-900 text-gray-100">
                      {item.name}
                    </TooltipContent>
                  ) : null}
                </Tooltip>
              )}
            </li>
          ))}
          </ul>
        </div>
      </nav>
      </TooltipProvider>

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
