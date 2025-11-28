"use client"

import React, { useState } from "react";
import { TaskHeaderBar } from "../components/ui/task-header-bar";
import { TaskFilters } from "../components/tasks/TaskFilters";
import { useTasksUI } from "../store/tasks-ui";
import { useTaskEditFields } from "../hooks/use-task-edit-fields";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TaskEditFields } from "../hooks/use-task-edit-fields";
import type { FilterOptions } from "../lib/services/filters";
import { useMobileDetection } from "../hooks/use-mobile-detection";
import { KeywordPlannerPane } from "../components/KeywordPlannerPane";
import { Sidebar } from "../components/ui/Sidebar";

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

  // Filter pane open state
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  // Keyword Planner state
  const [isKeywordPlannerOpen, setIsKeywordPlannerOpen] = useState(false);

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

  return (
    <div className="flex flex-col h-screen w-full bg-white">
        {/* Only show global header on desktop */}
        {!isMobile && (
          <TaskHeaderBar
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            onFilterClick={handleFilterClick}
            onSidebarToggle={handleSidebarToggle}
            onKeywordPlannerClick={handleKeywordPlannerClick}
            isKeywordPlannerActive={isKeywordPlannerOpen}
          />
        )}
      {/* Main content (children) */}
      <div className="flex-1 min-h-0 w-full flex flex-row overflow-hidden">
        {/* Sidebar */}
        <div className={`border-r border-gray-200 transition-all duration-300 ease-in-out z-20 flex-shrink-0 ${isSidebarCollapsed ? 'w-16' : 'w-64'}`}>
          <Sidebar 
            isCollapsed={isSidebarCollapsed} 
            isMobileMenuOpen={isMobileMenuOpen} 
            onClose={handleMobileMenuClose} 
          />
        </div>
        
        {/* Page Content */}
        <div className="flex-1 overflow-hidden flex flex-row">
          {/* Pass sidebar state as context/prop if needed */}
          {React.cloneElement(children as React.ReactElement, {
            isSidebarOpen,
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
    </div>
  );
} 