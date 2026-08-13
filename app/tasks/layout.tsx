"use client"

import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { TaskFilters } from "../components/tasks/TaskFilters";
import { buildFilterSearchParams } from "../lib/tasks-filter-url";
import { useTasksUI } from "../store/tasks-ui";
import { useTaskEditFields } from "../hooks/use-task-edit-fields";
import { useViewUsersCanSee } from "../hooks/use-view-users-can-see";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useGlobalSearchController } from "../hooks/use-global-search-controller";
import type { TaskEditFields } from "../hooks/use-task-edit-fields";
import type { FilterOptions } from "../lib/services/filters";
import { useMobileDetection } from "../hooks/use-mobile-detection";
import { Sidebar } from "../components/ui/Sidebar";
import { GlobalSearchModal } from "../components/ui/global-search-modal";
import { HeaderCreatePopupHost } from "../components/ui/header-create-popup-host";
import { TaskComposerTray } from "../components/tasks/TaskComposerTray";
import { MobileTaskComposerSheet } from "../components/tasks/MobileTaskComposerSheet";
import { buildNewAiThreadParams } from "../lib/ai-thread-route";
import { TasksSidebarProvider } from "../contexts/tasks-sidebar-context";
import { GlobalSearchProvider } from "../contexts/global-search-context";
import { dispatchTasksShallowNavigation } from "../lib/tasks-shallow-nav";
import { cn } from "@/lib/utils";
import {
  ensureDefaultGroupOrderInSearchParams,
  parseActiveGroupByFromParam,
  parseExplicitGroupOrderParam,
} from "../lib/tasks-grouping-url";
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
  
  // Mobile sidebar overlay + desktop rail.
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const SIDEBAR_WIDTH_KEY = "articulate-sidebar-width";
  const SIDEBAR_MIN_WIDTH = 200;
  const SIDEBAR_MAX_WIDTH = 420;
  const SIDEBAR_DEFAULT_WIDTH = 256;
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const sidebarWidthRef = React.useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
      const parsed = raw ? Number(raw) : NaN;
      if (Number.isFinite(parsed)) {
        setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, parsed)));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!isResizingSidebar) return;
    const onMove = (event: MouseEvent) => {
      const next = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, event.clientX));
      setSidebarWidth(next);
    };
    const onUp = () => {
      setIsResizingSidebar(false);
      try {
        window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidthRef.current));
      } catch {
        // ignore
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizingSidebar]);

  // Global search/filter state from Zustand
  const {
    filters,
    setFilters,
  } = useTasksUI();

  // URL helpers for syncing ?q= with global search (mimic /financials behavior)
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const shallowReplaceUrl = useCallback((url: string) => {
    if (typeof window === "undefined") return;
    window.history.replaceState({}, "", url);
  }, []);

  const searchParamsString = searchParams.toString();
  const globalSearch = useGlobalSearchController({
    pathname,
    router,
    searchParams,
  })

  /** Canonical `groupOrder` in the address bar when grouped via URL (deep links). */
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (!(pathname === "/tasks" || pathname.startsWith("/tasks/"))) return;
    const sp = new URLSearchParams(searchParamsString);
    const modified = ensureDefaultGroupOrderInSearchParams(sp);
    const next = sp.toString();
    const urlReplaced = modified && next !== searchParamsString;
    if (process.env.NODE_ENV === "development") {
      const after = new URLSearchParams(next);
      console.log("[tasks-url] groupOrder normalization", {
        incomingParams: searchParamsString,
        normalizedGrouping: {
          groupBy: parseActiveGroupByFromParam(after.get("groupBy")),
          groupOrder: parseExplicitGroupOrderParam(after.get("groupOrder")),
        },
        normalizedSearch: next,
        urlReplace: urlReplaced,
      });
    }
    if (!urlReplaced) return;
    shallowReplaceUrl(`${pathname}?${next}`);
    dispatchTasksShallowNavigation();
  }, [searchParamsString, pathname, shallowReplaceUrl]);

  // Filter pane open state
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  

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

  // Shared users query (id, full_name, photo); same query is used by activity timeline
  const { data: users } = useViewUsersCanSee(isFilterOpen && !!accessToken);

  // Transform editFields to filter options format when available
  const filterOptions = editFields ? transformEditFieldsToFilterOptions(editFields, users) : undefined;
  
  // Debug log
  console.log('[layout] isFilterOpen:', isFilterOpen, 'editFields:', editFields, 'users:', users, 'filterOptions:', filterOptions);

  // Handler for sidebar toggle (desktop collapse + mobile drawer).
  const handleSidebarToggle = () => {
    if (isMobile) {
      setIsMobileMenuOpen((v) => !v);
      return;
    }
    setIsSidebarCollapsed((v) => !v);
  };

  const handleMobileMenuClose = () => {
    setIsMobileMenuOpen(false);
  };

  const handleNewAiThreadClick = useCallback(() => {
    const newParams = buildNewAiThreadParams(new URLSearchParams(searchParams.toString()))
    newParams.delete("focus")
    shallowReplaceUrl(`${pathname}?${newParams.toString()}`)
    dispatchTasksShallowNavigation()
  }, [pathname, searchParams, shallowReplaceUrl])

  // Canonical filter commit: same pipeline as pills (URL + setFilters) so task_group_*_filtered refetch.
  // When plannerVisibility is provided (filter pane Apply/Clear), write it in the same replace to avoid
  // a second replace (syncPlannerToUrl) overwriting filter params.
  const commitFilters = useCallback(
    (
      newFilters: import("../components/tasks/TaskFilters").TaskFilters,
      plannerVisibility?: { showTasks: boolean; showSuggestions: boolean }
    ) => {
      const newParams = buildFilterSearchParams(new URLSearchParams(searchParams.toString()), newFilters);
      if (plannerVisibility !== undefined) {
        newParams.set("showTasks", plannerVisibility.showTasks ? "true" : "false");
        newParams.set("showSuggestions", plannerVisibility.showSuggestions ? "true" : "false");
      }
      router.replace(`${pathname}?${newParams.toString()}`, { scroll: false });
      setFilters(newFilters);
    },
    [searchParams.toString(), pathname, router, setFilters]
  );

  return (
    <GlobalSearchProvider value={globalSearch}>
      <TasksSidebarProvider
        value={{
          isMobileMenuOpen,
          onSidebarToggle: handleSidebarToggle,
        }}
      >
        <div className="flex h-screen w-full flex-col bg-white">
          <div className="flex min-h-0 flex-1 w-full overflow-hidden">
            {isMobile ? (
              <div className="w-0 min-w-0 overflow-hidden">
                <Sidebar
                  isCollapsed={true}
                  isMobileMenuOpen={isMobileMenuOpen}
                  onClose={handleMobileMenuClose}
                />
              </div>
            ) : (
              <div
                className={cn(
                  "relative flex shrink-0 flex-col border-r border-gray-200 bg-white",
                  !isResizingSidebar && "transition-[width] duration-200",
                )}
                style={{ width: isSidebarCollapsed ? 64 : sidebarWidth }}
              >
                <Sidebar
                  isCollapsed={isSidebarCollapsed}
                  onOpenSearch={() => setIsSearchModalOpen(true)}
                />
                {!isSidebarCollapsed ? (
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize sidebar"
                    title="Drag to resize"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setIsResizingSidebar(true);
                    }}
                    className="absolute inset-y-0 right-0 z-20 w-1.5 cursor-col-resize hover:bg-gray-300/80 active:bg-gray-400/80"
                  />
                ) : null}
              </div>
            )}

            <div className="flex-1 overflow-hidden flex flex-row">
              {React.cloneElement(children as React.ReactElement, {
                isSidebarOpen: isMobile ? isMobileMenuOpen : true,
                isSidebarCollapsed: isMobile ? true : isSidebarCollapsed,
                onSidebarToggle: handleSidebarToggle,
              })}
              {modal}
              {!isMobile && (
                <TaskFilters
                  isOpen={isFilterOpen}
                  onClose={() => setIsFilterOpen(false)}
                  onApplyFilters={(mapped, _display) => {
                    setFilters(mapped);
                    setIsFilterOpen(false);
                  }}
                  activeFilters={filters}
                  filterOptions={filterOptions}
                  commitFilters={commitFilters}
                />
              )}
            </div>
          </div>
        </div>

        {!isMobile ? (
          <>
            <GlobalSearchModal
              open={isSearchModalOpen}
              onOpenChange={setIsSearchModalOpen}
              searchValue={globalSearch.committedQuery}
              onSearchChange={globalSearch.setDraftQuery}
              onSearchCommit={(value) => globalSearch.commitSearch({ nextQuery: value })}
              selectedTypeFilters={globalSearch.pendingSelectedTypes}
              onToggleTypeFilter={globalSearch.togglePendingTypeFilter}
              onPreviewResultSelect={globalSearch.openSearchResult}
              onShowAll={globalSearch.handleShowAll}
              onClearSearch={globalSearch.clearSearch}
            />
            <HeaderCreatePopupHost onNewAiThreadClick={handleNewAiThreadClick} />
          </>
        ) : null}

        <TaskComposerTray />
        <MobileTaskComposerSheet />
      </TasksSidebarProvider>
    </GlobalSearchProvider>
  );
} 