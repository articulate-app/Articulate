"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Home, ListTodo, FolderKanban, Users, Inbox, BarChart, FileText, Settings, LogOut, ChevronDown, ChevronRight, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useCurrentUserStore } from '../../store/current-user'
import { useState, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog"
import { Button } from "./button"
import { Input } from "./input"
import { Label } from "./label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"
import { toast } from "./use-toast"
import { createProject } from "../../lib/services/projects"
import { getRoles } from "../../lib/services/teams"
import { Checkbox } from "./checkbox"
import type { AdminCreateUserPayload, AdminCreateUserResponse } from "../../types/users"

const navigation = [
  { name: "Home", href: "/", icon: Home },
  { name: "Tasks", href: "/tasks", icon: ListTodo },
  { name: "Projects", href: "/projects", icon: FolderKanban, isExpandable: true },
  { name: "Teams", href: "/teams", icon: Users, isExpandable: true },
  { name: "Users", href: "/users", icon: Users, isExpandable: true },
  { name: "Inbox", href: "/inbox", icon: Inbox },
  { name: "Reports", href: "/reports", icon: BarChart },
  { name: "Financials", href: "/financials", icon: FileText },
  { name: "Settings", href: "/settings", icon: Settings },
]

interface SidebarProps {
  isCollapsed: boolean
  isMobileMenuOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ isCollapsed, isMobileMenuOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const supabase = createClientComponentClient();
  const publicUserId = useCurrentUserStore((s) => s.publicUserId);
  const fullName = useCurrentUserStore((s) => s.fullName);
  const userMetadata = useCurrentUserStore((s) => s.userMetadata);
  
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(false);
  const [isTeamsExpanded, setIsTeamsExpanded] = useState(false);
  const [isUsersExpanded, setIsUsersExpanded] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserTeamId, setNewUserTeamId] = useState<number | null>(null);
  const [newUserRoleId, setNewUserRoleId] = useState<number | null>(null);
  const [sendInvite, setSendInvite] = useState(true);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Fetch projects
  const { data: projects } = useQuery({
    queryKey: ['projects-minimal'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_projects_minimal')
        .select('id, name, color')
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

  // Helper to get user initials
  function getUserInitials() {
    // First try to use full_name from the users table
    if (fullName) {
      const parts = fullName.trim().split(' ');
      if (parts.length === 1) return parts[0][0].toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    
    // Fallback to user metadata
    if (userMetadata?.full_name) {
      const parts = userMetadata.full_name.trim().split(' ');
      if (parts.length === 1) return parts[0][0].toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    
    // Fallback to email from metadata
    if (userMetadata?.email) {
      return userMetadata.email[0].toUpperCase();
    }
    
    return 'U';
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleProjectClick = (projectId: number) => {
    // Navigate to full project page
    router.push(`/projects/${projectId}`);
    if (onClose) onClose();
  };

  const handleTeamClick = (teamId: number) => {
    // Navigate to full team page
    router.push(`/teams/${teamId}`);
    if (onClose) onClose();
  };

  const handleUserClick = (userId: number) => {
    // Navigate to full user page
    router.push(`/users/${userId}`);
    if (onClose) onClose();
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      toast({
        title: "Validation Error",
        description: "Project name is required",
        variant: "destructive",
      });
      return;
    }

    if (!selectedTeamId) {
      toast({
        title: "Validation Error",
        description: "Team selection is required",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingProject(true);
    try {
      const { data, error } = await createProject(newProjectName.trim(), selectedTeamId);
      
      if (error) throw error;
      
      if (!data) {
        throw new Error("Failed to create project");
      }

      toast({
        title: "Success",
        description: "Project created successfully",
      });

      // Refresh projects list
      queryClient.invalidateQueries({ queryKey: ['projects-minimal'] });

      // Navigate to the new project
      router.push(`/projects/${data.id}`);

      // Close modal and reset
      setShowNewProjectModal(false);
      setNewProjectName("");
      setSelectedTeamId(null);
      if (onClose) onClose();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to create project",
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
      // Get the current session and access token
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        throw new Error("No access token available. Please sign in again.");
      }

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
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

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

  // Mobile overlay styles
  const mobileOverlay =
    'fixed inset-0 z-40 bg-black bg-opacity-40 flex md:hidden transition-opacity duration-200';
  const mobileSidebar =
    'fixed top-0 left-0 z-50 bg-white w-64 h-screen shadow-lg p-4';

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
            <ul className="space-y-2 mt-8 flex-1 overflow-y-auto">
              {navigation.map((item) => (
                <li key={item.name}>
                  {item.isExpandable ? (
                    <div>
                      <button
                        onClick={() => {
                          if (item.name === 'Projects') setIsProjectsExpanded(!isProjectsExpanded);
                          if (item.name === 'Teams') setIsTeamsExpanded(!isTeamsExpanded);
                          if (item.name === 'Users') setIsUsersExpanded(!isUsersExpanded);
                        }}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors w-full text-left",
                          (pathname === item.href || 
                           (item.href === "/projects" && pathname.startsWith("/projects")) ||
                           (item.href === "/teams" && pathname.startsWith("/teams"))) ? "bg-gray-100" : ""
                        )}
                      >
                        <item.icon className="w-5 h-5" />
                        <span className="flex-1">{item.name}</span>
                        {((item.name === 'Projects' && isProjectsExpanded) || (item.name === 'Teams' && isTeamsExpanded) || (item.name === 'Users' && isUsersExpanded)) ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
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
                                <div 
                                  className="w-3 h-3 rounded-full flex-shrink-0" 
                                  style={{ backgroundColor: project.color || '#gray' }}
                                />
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
                                {team.logo ? (
                                  <img 
                                    src={team.logo} 
                                    alt={team.title}
                                    className="w-3 h-3 rounded-full flex-shrink-0 object-cover"
                                  />
                                ) : (
                                  <div className="w-3 h-3 rounded-full flex-shrink-0 bg-gray-300" />
                                )}
                                <span className="truncate">{team.title}</span>
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
                                {user.photo ? (
                                  <img 
                                    src={user.photo} 
                                    alt={user.full_name || user.email || 'User'}
                                    className="w-3 h-3 rounded-full flex-shrink-0 object-cover"
                                  />
                                ) : (
                                  <div className="w-3 h-3 rounded-full flex-shrink-0 bg-gradient-to-br from-blue-500 to-indigo-600" />
                                )}
                                <span className="truncate">{user.full_name || user.email}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors",
                        "group relative",
                        (pathname === item.href || 
                         (item.href === "/billing" && pathname.startsWith("/billing")) ||
                         (item.href === "/expenses/supplier-invoices" && pathname.startsWith("/expenses"))) ? "bg-gray-100" : ""
                      )}
                      onClick={onClose}
                    >
                      <item.icon className="w-5 h-5" />
                      <span className="ml-2">{item.name}</span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            
            {/* User info and sign out */}
            <div className="pt-4 border-t border-gray-200 flex-shrink-0">
              <div className="flex items-center gap-3 px-3 py-2">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 border border-gray-200 font-medium text-sm">
                  {getUserInitials()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {fullName || userMetadata?.full_name || userMetadata?.email || 'User'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-3 py-2 w-full text-left rounded-md hover:bg-gray-100 transition-colors text-gray-700"
              >
                <LogOut className="w-5 h-5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Desktop Sidebar */}
      <nav className="h-full hidden md:flex flex-col overflow-hidden pl-2">
        <ul className="space-y-1 flex-1 overflow-y-auto overflow-x-hidden pt-1 pb-2">
          {navigation.map((item) => (
            <li key={item.name}>
              {item.isExpandable ? (
                <div>
                  <button
                    onClick={() => {
                      if (item.name === 'Projects') setIsProjectsExpanded(!isProjectsExpanded);
                      if (item.name === 'Teams') setIsTeamsExpanded(!isTeamsExpanded);
                      if (item.name === 'Users') setIsUsersExpanded(!isUsersExpanded);
                    }}
                    className={cn(
                      "flex items-center py-2 rounded-md hover:bg-gray-100 transition-colors group relative w-full",
                      isCollapsed ? "justify-center px-2" : "gap-3 pl-3 pr-3",
                      (pathname === item.href || 
                       (item.href === "/projects" && pathname.startsWith("/projects")) ||
                       (item.href === "/teams" && pathname.startsWith("/teams"))) ? "bg-gray-100" : ""
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
                      {item.name}
                    </span>
                    {!isCollapsed && (
                      <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                        {((item.name === 'Projects' && isProjectsExpanded) || (item.name === 'Teams' && isTeamsExpanded) || (item.name === 'Users' && isUsersExpanded)) ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </div>
                    )}
                    {/* Tooltip for icon when collapsed */}
                    {isCollapsed && (
                      <span className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                        {item.name}
                      </span>
                    )}
                  </button>
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
                            <div 
                              className="w-3 h-3 rounded-full flex-shrink-0" 
                              style={{ backgroundColor: project.color || '#gray' }}
                            />
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
                            {team.logo ? (
                              <img 
                                src={team.logo} 
                                alt={team.title}
                                className="w-3 h-3 rounded-full flex-shrink-0 object-cover"
                              />
                            ) : (
                              <div className="w-3 h-3 rounded-full flex-shrink-0 bg-gray-300" />
                            )}
                            <span className="truncate">{team.title}</span>
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
                            {user.photo ? (
                              <img 
                                src={user.photo} 
                                alt={user.full_name || user.email || 'User'}
                                className="w-3 h-3 rounded-full flex-shrink-0 object-cover"
                              />
                            ) : (
                              <div className="w-3 h-3 rounded-full flex-shrink-0 bg-gradient-to-br from-blue-500 to-indigo-600" />
                            )}
                            <span className="truncate">{user.full_name || user.email}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center py-2 rounded-md hover:bg-gray-100 transition-colors group relative",
                    isCollapsed ? "justify-center px-2" : "gap-3 pl-3 pr-3",
                    (pathname === item.href || 
                     (item.href === "/billing" && pathname.startsWith("/billing")) ||
                     (item.href === "/expenses/supplier-invoices" && pathname.startsWith("/expenses")) ||
                     (item.href === "/documents" && pathname.startsWith("/documents"))) ? "bg-gray-100" : ""
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
                    {item.name}
                  </span>
                  {/* Tooltip for icon when collapsed */}
                  {isCollapsed && (
                    <span className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                      {item.name}
                    </span>
                  )}
                </Link>
              )}
            </li>
          ))}
        </ul>
        
        {/* User info and sign out - desktop */}
        <div className="pt-2 border-t border-gray-200 flex-shrink-0">
          <div className={cn(
            "flex items-center py-2",
            isCollapsed ? "justify-center px-2" : "gap-3 pl-3 pr-3"
          )}>
            <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
              <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 border border-gray-200 font-medium text-[10px]">
                {getUserInitials()}
              </div>
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">
                  {fullName || userMetadata?.full_name || userMetadata?.email || 'User'}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={handleSignOut}
            className={cn(
              "flex items-center py-2 w-full text-left rounded-md hover:bg-gray-100 transition-colors text-gray-700",
              isCollapsed ? "justify-center px-2" : "gap-3 pl-3 pr-3"
            )}
          >
            <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
              <LogOut className="w-5 h-5" />
            </div>
            {!isCollapsed && <span className="text-sm">Sign Out</span>}
          </button>
        </div>
      </nav>

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
                  if (e.key === 'Enter' && !isCreatingProject && selectedTeamId) {
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
                value={selectedTeamId?.toString() || ""}
                onValueChange={(value) => setSelectedTeamId(Number(value))}
              >
                <SelectTrigger id="team-select">
                  <SelectValue placeholder="Select a team" />
                </SelectTrigger>
                <SelectContent>
                  {teams?.map((team) => (
                    <SelectItem key={team.id} value={team.id.toString()}>
                      <div className="flex items-center gap-2">
                        {team.logo ? (
                          <img 
                            src={team.logo} 
                            alt={team.title}
                            className="w-4 h-4 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-gray-300" />
                        )}
                        <span>{team.title}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewProjectModal(false);
                setNewProjectName("");
                setSelectedTeamId(null);
              }}
              disabled={isCreatingProject}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={isCreatingProject || !newProjectName.trim() || !selectedTeamId}
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
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {teams?.map((team) => (
                    <SelectItem key={team.id} value={team.id.toString()}>
                      <div className="flex items-center gap-2">
                        {team.logo ? (
                          <img 
                            src={team.logo} 
                            alt={team.title}
                            className="w-4 h-4 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-gray-300" />
                        )}
                        <span>{team.title}</span>
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
                <SelectContent>
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
