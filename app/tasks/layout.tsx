"use client"

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { TaskHeaderBar } from "../components/ui/task-header-bar";
import { TaskFilters } from "../components/tasks/TaskFilters";
import { useTasksUI } from "../store/tasks-ui";
import { useTaskEditFields } from "../hooks/use-task-edit-fields";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useQuery } from "@tanstack/react-query";
import type { TaskEditFields } from "../hooks/use-task-edit-fields";
import type { FilterOptions } from "../lib/services/filters";
import { useMobileDetection } from "../hooks/use-mobile-detection";
import { KeywordPlannerPane } from "../components/KeywordPlannerPane";
import { Sidebar } from "../components/ui/Sidebar";
import { AiPane } from "../../features/ai-chat/AiPane";
import { TaskComposerTray } from "../components/tasks/TaskComposerTray";
import { MobileTaskComposerSheet } from "../components/tasks/MobileTaskComposerSheet";
import { ensureGlobalThread } from "../../features/ai-chat/ai-utils";
import { toast } from "../components/ui/use-toast";
import { cn } from "@/lib/utils";
import { TasksSidebarProvider } from "../contexts/tasks-sidebar-context";

// Transform editFields data to filter options format (same as in TasksLayout)
function transformEditFieldsToFilterOptions(editFields: TaskEditFields, users: any[] = []): FilterOptions {
  // Deduplicate project statuses by name
  const statusMap = new Map<string, any>();
  (editFields.project_statuses || []).forEach(status => {
    if (!status.name || typeof status.name !== 'string') return;
    if (!statusMap.has(status.name) || (statusMap.get(status.name).id > status.id)) {
      statusMap.set(status.name, status);
    }
  });
  
  const dedupedStatuses = Array.from(statusMap.values());
  
  return {
    users: (users || [])
      .filter(user => user.id && user.full_name)
      .map(user => ({ value: String(user.id), label: user.full_name })),
    statuses: dedupedStatuses.map(status => ({
      value: status.name, // Use name as value for Typesense filtering
      label: status.name,
      color: status.color,
      order_priority: status.order_priority,
      project_id: status.project_id
    })),
    projects: (editFields.projects || []).map(project => ({
      value: String(project.id),
      label: project.name
    })),
    contentTypes: (editFields.content_types || []).map(type => ({
      value: String(type.id),
      label: type.title
    })),
    productionTypes: (editFields.production_types || []).map(type => ({
      value: String(type.id),
      label: type.title
    })),
    languages: (editFields.languages || []).map(lang => ({
      value: String(lang.id),
      label: `${lang.long_name} (${lang.code})`
    })),
    channels: (editFields.channels || []).map(channel => ({
      value: String(channel.id),
      label: channel.name
    }))
  };
}

interface LayoutProps {
  children: React.ReactNode;
  modal: React.ReactNode;
}

export default function TasksLayout({ children, modal }: LayoutProps) {
  // Mobile detection
  const isMobile = useMobileDetection();
  
  // Sidebar state (for mobile/desktop collapsed)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // false = collapsed by default
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true); // true = collapsed by default (icons only)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Global search/filter state from Zustand
  const { searchValue, setSearchValue, filters, setFilters } = useTasksUI();

  // URL helpers for syncing ?q= with global search (mimic /financials behavior)
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Filter pane open state
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  // Keyword Planner state
  const [isKeywordPlannerOpen, setIsKeywordPlannerOpen] = useState(false);
  
  // AI Chat state
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);

  // Get access token for task edit fields
  const supabase = createClientComponentClient();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (data?.session?.access_token) setAccessToken(data.session.access_token);
    })();
  }, [supabase]);

  // Fetch task edit fields data (only when filter pane opens and we have access token)
  const { data: editFields } = useTaskEditFields(isFilterOpen && accessToken ? accessToken : null);

  // Fetch users data (only when filter pane opens)
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('view_users_i_can_see')
        .select('id, full_name')
        .order('full_name');
      if (error) throw error;
      return data;
    },
    enabled: isFilterOpen && !!accessToken,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Transform editFields to filter options format when available
  const filterOptions = editFields ? transformEditFieldsToFilterOptions(editFields, users) : undefined;
  
  // Debug log
  console.log('[layout] isFilterOpen:', isFilterOpen, 'editFields:', editFields, 'users:', users, 'filterOptions:', filterOptions);

  // Keep global searchValue in sync with ?q= from URL (on mount and when URL changes)
  useEffect(() => {
    const urlQ = searchParams.get("q") || "";
    setSearchValue(urlQ);
  }, [searchParams, setSearchValue]);

  // Handler for filter button (could open a filter modal or pane)
  const handleFilterClick = () => {
    setIsFilterOpen(true);
  };

  // Handler for sidebar toggle (hamburger) - for mobile, toggle mobile menu
  const handleSidebarToggle = () => {
    if (isMobile) {
      setIsMobileMenuOpen((v) => !v);
    } else {
      setIsSidebarCollapsed((v) => !v);
    }
  };

  const handleMobileMenuClose = () => {
    setIsMobileMenuOpen(false);
  };

  // Handler for keyword planner toggle
  const handleKeywordPlannerClick = () => setIsKeywordPlannerOpen((v) => !v);
  
  // Handler for AI chat toggle
  const handleAiChatClick = async () => {
    try {
      // Ensure global thread exists
      await ensureGlobalThread()
      // Open AI pane
      setIsAiChatOpen(true)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to open AI chat",
        variant: "destructive",
      })
    }
  };

  // Handler for global header search: update store + URL ?q= (single source of truth)
  const handleHeaderSearchChange = (value: string) => {
    setSearchValue(value);
    const newParams = new URLSearchParams(searchParams.toString());
    if (value) {
      newParams.set("q", value);
    } else {
      newParams.delete("q");
    }
    router.replace(`${pathname}?${newParams.toString()}`);
  };

  // Derive current high-level view mode from URL (list / calendar / kanban)
  const layoutParam = (searchParams.get("layout") || "left,middle")
    .split(",")
    .filter(Boolean);
  const middleView = searchParams.get("middleView") || "calendar";

  const currentViewMode: 'list' | 'calendar' | 'kanban' = !layoutParam.includes("middle")
    ? "list"
    : middleView === "kanban"
    ? "kanban"
    : "calendar";

  // Global view toggle handler (Task list / Calendar / Kanban)
  const handleHeaderViewModeChange = (view: 'list' | 'calendar' | 'kanban') => {
    const newParams = new URLSearchParams(searchParams.toString());

    if (view === 'list') {
      // Expanded task list (full-width left pane)
      newParams.set('layout', 'left');
      newParams.set('leftView', 'list');
      newParams.set('rightView', 'details');
      newParams.set('focus', 'left');
      // Hide details pane when not in layout
      newParams.delete('id');
    } else {
      // Calendar or Kanban in middle pane + task list in left
      newParams.set('layout', 'left,middle');
      newParams.set('leftView', 'list');
      newParams.set('middleView', view);
      newParams.set('rightView', 'details');
      // Clear focus so split layout can be restored
      newParams.delete('focus');
      // Close details pane when switching primary view
      newParams.delete('id');
    }

    // Leave all filtering, grouping, and pagination params untouched
    router.replace(`${pathname}?${newParams.toString()}`);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-white">
        {/* Only show global header on desktop */}
        {!isMobile && (
          <TaskHeaderBar
            searchValue={searchValue}
            onSearchChange={handleHeaderSearchChange}
            onFilterClick={handleFilterClick}
            onSidebarToggle={handleSidebarToggle}
            onKeywordPlannerClick={handleKeywordPlannerClick}
            isKeywordPlannerActive={isKeywordPlannerOpen}
            onAiChatClick={handleAiChatClick}
            viewMode={currentViewMode}
            onViewModeChange={handleHeaderViewModeChange}
          />
        )}
      {/* Main content (children) */}
      <TasksSidebarProvider
        value={{
          isMobileMenuOpen,
          onSidebarToggle: handleSidebarToggle,
        }}
      >
      <div className="flex-1 min-h-0 w-full flex flex-row overflow-hidden">
        {/* Sidebar: desktop shows strip; mobile shows overlay when open */}
        {isMobile ? (
          /* On mobile: Sidebar overlay only (no strip); overlay shows when isMobileMenuOpen */
          <div className="w-0 min-w-0 overflow-hidden">
            <Sidebar
              isCollapsed={true}
              isMobileMenuOpen={isMobileMenuOpen}
              onClose={handleMobileMenuClose}
            />
          </div>
        ) : (
          <div className={cn(
            "border-r border-gray-200 transition-all duration-300 ease-in-out z-20 flex-shrink-0",
            isSidebarCollapsed ? "w-16" : "w-64"
          )}>
            <Sidebar 
              isCollapsed={isSidebarCollapsed} 
              isMobileMenuOpen={isMobileMenuOpen} 
              onClose={handleMobileMenuClose} 
            />
          </div>
        )}
        
        {/* Page Content */}
        <div className="flex-1 overflow-hidden flex flex-row">
          {/* Pass sidebar state as props (cloneElement) for compatibility */}
          {React.cloneElement(children as React.ReactElement, {
            isSidebarOpen: isMobile ? isMobileMenuOpen : isSidebarOpen,
            isSidebarCollapsed,
            onSidebarToggle: handleSidebarToggle,
          })}
          {modal}
          {/* Filter pane slide panel - only on desktop */}
          {!isMobile && (
            <TaskFilters
              isOpen={isFilterOpen}
              onClose={() => setIsFilterOpen(false)}
              onApplyFilters={(mapped, display) => {
                setFilters(mapped);
                setIsFilterOpen(false);
              }}
              activeFilters={filters}
              filterOptions={filterOptions}
            />
          )}
          
          {/* Keyword Planner pane - only on desktop */}
          {!isMobile && (
            <KeywordPlannerPane
              isOpen={isKeywordPlannerOpen}
              onClose={() => setIsKeywordPlannerOpen(false)}
            />
          )}
        </div>
      </div>
      </TasksSidebarProvider>
      
      {/* Global AI Chat Pane */}
      <AiPane 
        isOpen={isAiChatOpen} 
        onClose={() => setIsAiChatOpen(false)} 
        initialScope="global"
      />

      {/* Task Composer: tray on desktop, bottom sheet on mobile */}
      <TaskComposerTray />
      <MobileTaskComposerSheet />
    </div>
  );
} 