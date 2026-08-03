"use client";

import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelGroup, Panel, PanelResizeHandle, ImperativePanelHandle } from "react-resizable-panels";
import { Search, MoreHorizontal, Filter, Plus, ChevronDown, List, LayoutGrid, Calendar } from "lucide-react";
import { TaskList } from "./TaskList";
import { KanbanView } from "../kanban-view/kanban-view";
import { CalendarView } from "../calendar-view/calendar-view";
import { TaskDetails } from "./TaskDetails";
import type { SuggestionDetailsModel } from "./SuggestionDetails";
import { TasksScopeProvider, useTasksScope } from "../../contexts/tasks-scope-context";
import { useTasksUI } from "../../store/tasks-ui";
import { useTaskEditFields } from "../../hooks/use-task-edit-fields";
import { useTaskListEditBootstrap } from "../../hooks/use-task-list-edit-bootstrap";
import { taskListEditBootstrapToFilterOptions } from "../../lib/services/task-list-edit-bootstrap";
import { useTasksUrlFilters } from "../../hooks/use-tasks-url-filters";
import { GroupingDropdown } from "./grouping-dropdown";
import { MultiselectToggle } from "../ui/multiselect-toggle";
import { FrequentFilterPills } from "./FrequentFilterPills";
import { FilterCascadingDropdown } from "./FilterCascadingDropdown";
import { InlineSearchInput } from "./InlineSearchInput";
import { FilterBadges } from "../../../components/ui/filter-badges";
import {
  getActiveFilterBadges,
  transformEditFieldsToFilterOptions,
} from "./TasksLayout";
import type { FilterOptions } from "../../lib/services/filters";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { normalizeTask } from "./task-cache-utils";
import { useTaskComposerStore } from "../../store/task-composer-store";
import { TaskFilters } from "./TaskFilters";
import { TaskComposerTray } from "./TaskComposerTray";
import { buildFilterSearchParams } from "../../lib/tasks-filter-url";
import { fetchTaskDetailsBootstrapMerged, mergeTaskDetail } from "../../lib/services/task-details-bootstrap";
import { MobileTaskComposerSheet } from "./MobileTaskComposerSheet";
import { DropdownMenuItem } from "../ui/dropdown-menu";

const EMPTY_LIST: any[] = [];

const PILL_BUTTON =
  "inline-flex items-center gap-1 px-4 py-1 rounded-full border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100 transition";

/** Same horizontal padding as toolbar row so filter pills align with View pill left edge. */
const TOOLBAR_CONTENT_PX = "px-2";

function normalizeBasicTask(task: any): any {
  if (!task) return undefined;
  return {
    id: task.id,
    title: task.title,
    assigned_to_id: task.assigned_to_id ?? task.assigned_user?.id ?? task.users?.id,
    assigned_to_name: task.assigned_to_name ?? task.assigned_user?.full_name ?? task.users?.full_name,
    content_type_id: task.content_type_id,
    content_type_title: task.content_type_title,
    production_type_id: task.production_type_id,
    production_type_title: task.production_type_title,
    language_id: task.language_id,
    language_code: task.language_code,
    delivery_date: task.delivery_date,
    publication_date: task.publication_date,
    project_id_int: task.project_id_int ?? task.projects?.id,
    project_name: task.project_name ?? task.projects?.name,
    project_color: task.project_color ?? task.projects?.color,
    project_status_id: task.project_status_id ?? task.project_statuses?.id,
    project_status_name: task.project_status_name ?? task.project_statuses?.name,
    project_status_color: task.project_status_color ?? task.project_statuses?.color,
    parent_task_id_int: task.parent_task_id_int,
    channel_names: task.channel_names,
  };
}

function useTaskDetailsQuery(
  taskId: string | number | undefined,
  accessToken: string | null,
  initialData: any
) {
  return useQuery({
    queryKey: ["task", taskId, accessToken],
    queryFn: async ({ signal }) => {
      if (!taskId || !accessToken) return initialData;
      return fetchTaskDetailsBootstrapMerged(taskId, accessToken, initialData ?? undefined, { signal }) as Promise<any>;
    },
    enabled: !!taskId && !!accessToken,
    initialData,
    staleTime: 0,
    select: (data) => (data ? mergeTaskDetail(initialData ?? undefined, data ?? undefined).merged : initialData),
  });
}

type ProjectViewMode = "list" | "kanban" | "calendar";

function ProjectTasksTabContentInner({ projectId }: { projectId: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const supabase = createClientComponentClient();
  const { scope } = useTasksScope();
  const openComposer = useTaskComposerStore((s) => s.openComposer);

  const isProjectScope = scope.type === "project";

  const kanbanToolbarRef = useRef<HTMLDivElement | null>(null);
  const calendarToolbarRef = useRef<HTMLDivElement | null>(null);
  const [toolbarRefReady, setToolbarRefReady] = useState(false);
  const setKanbanToolbarEl = useCallback((el: HTMLDivElement | null) => {
    kanbanToolbarRef.current = el;
    if (el) setToolbarRefReady((r) => r || true);
  }, []);
  const setCalendarToolbarEl = useCallback((el: HTMLDivElement | null) => {
    calendarToolbarRef.current = el;
    if (el) setToolbarRefReady((r) => r || true);
  }, []);

  const [isFilterPaneOpen, setIsFilterPaneOpen] = useState(false);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  /** When true, details pane is expanded (e.g. 75%); when false, normal width (50%). Matches global Tasks expand/collapse behavior. */
  const [isDetailsPaneExpanded, setIsDetailsPaneExpanded] = useState(false);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) setAccessToken(data.session.access_token);
    })();
  }, [supabase]);

  const {
    selectedTaskId,
    setSelectedTaskId,
    searchValue,
    setSearchValue,
    filters,
    setFilters,
    syncFromUrl,
  } = useTasksUI();

  // Canonical filter state: sync store from URL when params change (pills, filter pane, or navigation).
  // Ensures filter pane and pills both read/write the same source; task_group_tasks_filtered params stay in sync.
  useEffect(() => {
    if (params.get("tab") !== "tasks") return;
    syncFromUrl(new URLSearchParams(params.toString()));
  }, [params.toString(), syncFromUrl]);

  const urlView = (params.get("tasksView") || "list") as ProjectViewMode;
  const urlId = params.get("id");
  const [viewMode, setViewMode] = useState<ProjectViewMode>(urlView);

  const [isInlineSearchOpen, setIsInlineSearchOpen] = useState(false);
  const [inlineSearchValue, setInlineSearchValue] = useState("");
  const [isMultiselectMode, setIsMultiselectMode] = useState(false);

  const [listEditBootstrapAfterPaint, setListEditBootstrapAfterPaint] = useState(false);
  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setListEditBootstrapAfterPaint(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  useEffect(() => {
    const v = (params.get("tasksView") || "list") as ProjectViewMode;
    if (v !== viewMode) setViewMode(v);
  }, [params.get("tasksView"), viewMode]);

  useEffect(() => {
    if (urlId && urlId !== selectedTaskId) setSelectedTaskId(urlId);
    if (!urlId && selectedTaskId) setSelectedTaskId(null);
  }, [urlId, selectedTaskId, setSelectedTaskId]);

  // Ref for ESC handler (set after handleCloseDetails is defined)
  const handleCloseDetailsRef = useRef<() => void>(() => {});

  // Ensure tasksView is in URL when on tasks tab for consistent bookmarking
  useEffect(() => {
    if (params.get("tab") !== "tasks") return;
    if (!params.get("tasksView")) {
      const p = new URLSearchParams(params.toString());
      p.set("tab", "tasks");
      p.set("tasksView", viewMode);
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    }
  }, [params.get("tab"), params.get("tasksView"), viewMode, pathname, router]);

  const { data: editFields } = useTaskEditFields(!!accessToken ? accessToken : null);

  const taskComposerCount = useTaskComposerStore((s) => s.composers.length);

  const listEditBootstrapQueryEnabled =
    !!accessToken &&
    (listEditBootstrapAfterPaint || isFilterPaneOpen || isInlineSearchOpen || taskComposerCount > 0);

  const { data: listEditBootstrapRaw } = useTaskListEditBootstrap(accessToken, {
    enabled: listEditBootstrapQueryEnabled,
  });

  const listReferenceFilterOptions = useMemo(
    () => (listEditBootstrapRaw ? taskListEditBootstrapToFilterOptions(listEditBootstrapRaw) : undefined),
    [listEditBootstrapRaw]
  );

  const buildProjectParams = useCallback(
    (updates: { tasksView?: ProjectViewMode; id?: string | null }) => {
      const p = new URLSearchParams(params.toString());
      p.set("tab", "tasks");
      if (updates.tasksView !== undefined) p.set("tasksView", updates.tasksView);
      if (updates.id !== undefined) {
        if (updates.id) p.set("id", updates.id);
        else p.delete("id");
      }
      return p;
    },
    [params]
  );

  const handleViewModeChange = useCallback(
    (view: ProjectViewMode) => {
      setViewMode(view);
      const p = buildProjectParams({ tasksView: view });
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [buildProjectParams, pathname, router]
  );

  const handleTaskSelect = useCallback(
    (task: any) => {
      const entityType: "task" | "suggestion" =
        (task?.entity_type as any) ?? (task?.kind === "suggestion" ? "suggestion" : "task");
      const entityId = Number(task?.entity_id ?? task?.id);
      if (!Number.isFinite(entityId) || entityId <= 0) return;
      const selectedId = String(entityId);
      setSelectedTaskId(selectedId);
      const seededTask = normalizeBasicTask(task);
      if (accessToken && entityType !== "suggestion") {
        queryClient.setQueryData(
          ["task", selectedId, accessToken],
          (old: any) => old ?? seededTask
        );
      }
      const p = buildProjectParams({ id: selectedId });
      if (entityType === "suggestion") p.set("itemKind", "suggestion");
      else p.delete("itemKind");
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [
      accessToken,
      buildProjectParams,
      pathname,
      queryClient,
      router,
      setSelectedTaskId,
    ]
  );

  const handleCloseDetails = useCallback(() => {
    setSelectedTaskId(null);
    const p = buildProjectParams({ id: null });
    p.delete("itemKind");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }, [buildProjectParams, pathname, router, setSelectedTaskId]);

  handleCloseDetailsRef.current = handleCloseDetails;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedTaskId) {
        handleCloseDetailsRef.current?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedTaskId]);

  const initialTaskForDetails = undefined;
  const isSuggestionSelected = params.get("itemKind") === "suggestion";
  const {
    data: selectedTaskData,
    isSuccess: isTaskDetailsSuccess,
    isFetching: isTaskDetailsFetching,
    isError: isTaskDetailsError,
  } =
    useTaskDetailsQuery(
      isSuggestionSelected ? undefined : (selectedTaskId ?? undefined),
      accessToken,
      initialTaskForDetails
    );

  const isBootstrapLoadedForSelectedTask =
    isSuggestionSelected
      ? true
      : (selectedTaskData as any)?.__bootstrapStatus === "loaded" ||
        (!isTaskDetailsFetching && (isTaskDetailsSuccess || isTaskDetailsError))

  const { data: selectedSuggestion } = useQuery<SuggestionDetailsModel | null>({
    queryKey: ["task-suggestion", selectedTaskId],
    enabled: isSuggestionSelected && !!selectedTaskId,
    queryFn: async () => {
      const id = Number(selectedTaskId)
      if (!Number.isFinite(id)) return null
      const supabase = createClientComponentClient()
      const { data: rpcData, error } = await supabase.rpc("task_suggestions_filtered", {
        p_project_ids: null,
        p_content_type_ids: null,
        p_channels: null,
        p_planned_for_date_gte: null,
        p_planned_for_date_lte: null,
        p_q: null,
        p_limit: 5000,
      })
      if (error) throw error
      const row = (Array.isArray(rpcData) ? rpcData : []).find((item: any) => Number(item?.id) === id)
      if (!row) return null
      return {
        id: Number(row.id),
        title: row.proposed_title ?? row.ai_title ?? "Untitled suggestion",
        briefing: row.proposed_briefing ?? row.ai_briefing ?? null,
        planned_for_date: row.planned_for_date ?? null,
        content_type_id: row.content_type_id ?? null,
        channel_ids: Array.isArray(row.channel_ids) ? row.channel_ids : [],
        source_key: row.source_key ?? null,
        project_id: row.project_id ?? null,
        status: row.status ?? "pending",
      } as SuggestionDetailsModel
    },
    staleTime: 60_000,
  })

  const selectedSuggestionAsTask = useMemo(() => {
    if (!selectedSuggestion) return null
    return {
      id: String(selectedSuggestion.id),
      title: selectedSuggestion.title ?? "",
      briefing: selectedSuggestion.briefing ?? null,
      notes: null,
      copy_post: null,
      delivery_date: selectedSuggestion.planned_for_date ?? null,
      publication_date: selectedSuggestion.planned_for_date ?? null,
      assigned_to_id: "",
      assigned_to_name: null,
      project_id_int: selectedSuggestion.project_id ?? null,
      project_name: selectedSuggestion.project_name ?? null,
      project_color: selectedSuggestion.project_color ?? null,
      project_logo: selectedSuggestion.project_logo ?? null,
      project_status_id: "",
      project_status_name: null,
      project_status_color: null,
      content_type_id:
        selectedSuggestion.content_type_id != null ? String(selectedSuggestion.content_type_id) : "",
      content_type_title: selectedSuggestion.content_type_title ?? null,
      production_type_id: "",
      production_type_title: null,
      language_id: "",
      language_code: null,
      channel_names: Array.isArray(selectedSuggestion.channel_names) ? selectedSuggestion.channel_names : [],
      parent_task_id_int: null,
      source_key: selectedSuggestion.source_key ?? null,
      status: selectedSuggestion.status ?? null,
      kind: "suggestion",
    } as any
  }, [selectedSuggestion])

  const selectedTask = isSuggestionSelected ? selectedSuggestionAsTask : selectedTaskData;
  const threadId = selectedTask?.thread_id;
  const attachments = selectedTask?.attachments;
  const mentions = selectedTask?.mentions;
  const watchers = selectedTask?.watchers;
  const subtasks = selectedTask?.subtasks;
  const project_watchers = selectedTask?.project_watchers;

  const onTaskUpdate = useCallback(
    (updatedFields: any) => {
      if (selectedTaskId && accessToken) {
        queryClient.setQueryData(
          ["task", selectedTaskId, accessToken],
          (old: any) => (old ? { ...old, ...updatedFields } : old)
        );
      }
    },
    [accessToken, queryClient, selectedTaskId]
  );

  const handleDuplicateTask = useCallback(() => {}, []);

  const currentParams = new URLSearchParams(params.toString());
  const filterOptionsForBadges: FilterOptions | undefined = useMemo(() => {
    const projectScopedUsers =
      isProjectScope && editFields?.project_watchers
        ? editFields.project_watchers
            .filter((w: any) => w.project_id === projectId)
            .map((w: any) => w.users)
            .filter(Boolean)
        : [];
    const transformed = editFields
      ? transformEditFieldsToFilterOptions(
          editFields,
          projectScopedUsers.length > 0 ? projectScopedUsers : []
        )
      : undefined;
    if (!transformed) return listReferenceFilterOptions as FilterOptions | undefined;
    let statuses = transformed.statuses;
    if (isProjectScope) {
      statuses = transformed.statuses.filter(
        (s: any) => s.project_id != null && s.project_id === projectId
      );
    }
    const merged =
      listReferenceFilterOptions && transformed ? { ...listReferenceFilterOptions } : { ...transformed };
    return {
      ...merged,
      statuses,
      users: transformed.users,
      projects: transformed.projects,
      contentTypes: transformed.contentTypes,
      productionTypes: transformed.productionTypes,
      languages: transformed.languages,
      channels: transformed.channels,
    };
  }, [editFields, listReferenceFilterOptions, isProjectScope, projectId]);

  const urlFilters = useTasksUrlFilters();
  const commitFilters = useCallback(
    (
      newFilters: import("./TaskFilters").TaskFilters,
      plannerVisibility?: { showTasks: boolean; showSuggestions: boolean }
    ) => {
      const newParams = buildFilterSearchParams(new URLSearchParams(params.toString()), newFilters);
      if (plannerVisibility !== undefined) {
        newParams.set("showTasks", plannerVisibility.showTasks ? "true" : "false");
        newParams.set("showSuggestions", plannerVisibility.showSuggestions ? "true" : "false");
      }
      router.replace(`${pathname}?${newParams.toString()}`, { scroll: false });
      setFilters(newFilters);
    },
    [params.toString(), pathname, router, setFilters]
  );
  const { badges, onClearAll } = useMemo(
    () =>
      getActiveFilterBadges(
        filters,
        setFilters,
        router,
        pathname,
        currentParams,
        filterOptionsForBadges,
        isProjectScope
      ),
    [filters, setFilters, router, pathname, currentParams.toString(), filterOptionsForBadges, isProjectScope]
  );

  const listPills = viewMode === "list" && (
    <>
      <GroupingDropdown className={PILL_BUTTON + " ml-2 min-w-[120px]"} hiddenGroupByOptions={isProjectScope ? ['project'] : undefined} />
      <MultiselectToggle
        isMultiselectMode={isMultiselectMode}
        onToggle={() => setIsMultiselectMode((v) => !v)}
        className={PILL_BUTTON + " ml-2"}
      />
      <FrequentFilterPills
        editFields={editFields as any}
        className={PILL_BUTTON + " ml-2"}
        hideProjectPills={isProjectScope}
      />
                            <FilterCascadingDropdown
                              editFields={editFields}
                              filterOptions={filterOptionsForBadges}
                              filters={filters}
                              setFilters={setFilters}
                              router={router}
                              pathname={pathname}
                              params={currentParams}
                              className={PILL_BUTTON + " ml-2"}
                              hideProjectFilter={isProjectScope}
                            />
    </>
  );

  // Global actions cluster (Search, Filter, Add task) - same for all views, right-aligned
  const globalActionsCluster = (
    <div className="flex items-center flex-shrink-0 gap-1 pl-2 border-l border-gray-200 ml-1">
      <InlineSearchInput
        isOpen={isInlineSearchOpen}
        value={inlineSearchValue}
        onChange={(value) => {
          setInlineSearchValue(value);
          setSearchValue(value);
          const p = new URLSearchParams(params.toString());
          if (value) p.set("q", value);
          else p.delete("q");
          if (params.get("tab") === "tasks") p.set("tab", "tasks");
          router.replace(`${pathname}?${p.toString()}`, { scroll: false });
        }}
        onClose={() => {
          setIsInlineSearchOpen(false);
          setInlineSearchValue("");
          setSearchValue("");
          const p = new URLSearchParams(params.toString());
          p.delete("q");
          if (params.get("tab") === "tasks") p.set("tab", "tasks");
          router.replace(`${pathname}?${p.toString()}`, { scroll: false });
        }}
        className="ml-0"
      />
      <button
        type="button"
        className={cn(PILL_BUTTON, "flex-shrink-0 !p-2")}
        aria-label="Search tasks"
        title="Search tasks"
        onClick={() => {
          setIsInlineSearchOpen((prev) => !prev);
          if (!isInlineSearchOpen) setInlineSearchValue("");
        }}
      >
        <Search className="w-4 h-4" />
      </button>
      <button
        type="button"
        className={cn(PILL_BUTTON, "flex-shrink-0 !p-2")}
        aria-label="Filter tasks"
        title="Filter tasks"
        onClick={() => setIsFilterPaneOpen(true)}
      >
        <Filter className="w-4 h-4" />
      </button>
      <button
        type="button"
        className={cn(PILL_BUTTON, "flex-shrink-0 !p-2")}
        aria-label="Add task"
        title="Add task"
        onClick={() => openComposer({ defaultProjectId: projectId })}
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );

  const hasDetailsOpen = !!selectedTaskId && !!selectedTask;

  // Resize right panel when details open/close. When expanded, detail pane is in overlay so panel stays 0.
  useEffect(() => {
    if (!hasDetailsOpen) {
      setIsDetailsPaneExpanded(false);
      rightPanelRef.current?.resize(0);
    } else {
      rightPanelRef.current?.resize(isDetailsPaneExpanded ? 0 : 50);
    }
  }, [hasDetailsOpen, isDetailsPaneExpanded]);

  const viewLabel = viewMode === "list" ? "List" : viewMode === "kanban" ? "Kanban" : "Calendar";
  const ViewIcon = viewMode === "list" ? List : viewMode === "kanban" ? LayoutGrid : Calendar;

  // Single "View" pill with dropdown (replaces 3-pill toggle)
  const viewPill = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(PILL_BUTTON, "ml-2 shrink-0 gap-1.5")}
          aria-label="View mode"
          aria-haspopup="listbox"
          aria-expanded={undefined}
        >
          <ViewIcon className="w-4 h-4" />
          <span>{viewLabel}</span>
          <ChevronDown className="w-4 h-4 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        <DropdownMenuItem onClick={() => handleViewModeChange("list")}>
          <List className="w-4 h-4 mr-2" />
          List
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleViewModeChange("kanban")}>
          <LayoutGrid className="w-4 h-4 mr-2" />
          Kanban
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleViewModeChange("calendar")}>
          <Calendar className="w-4 h-4 mr-2" />
          Calendar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-white">
      {/* Row 1: Full-width toolbar; divider is border-b below */}
      <div className={cn("w-full flex-shrink-0 h-14 min-h-14 border-b border-gray-200 bg-white flex items-center overflow-x-auto overflow-y-hidden flex-nowrap")}>
        <div className={cn("flex-1 min-w-0 flex items-center py-2", TOOLBAR_CONTENT_PX)} style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="flex items-center flex-nowrap w-max">
            {viewPill}
            {/* List pills when list view */}
            {viewMode === "list" && (
              <div className="hidden md:flex items-center flex-nowrap">
                {listPills}
              </div>
            )}
            {/* Kanban toolbar portaled here when view is kanban */}
            {viewMode === "kanban" && (
              <div ref={setKanbanToolbarEl} className="flex items-center flex-nowrap gap-2 ml-2" />
            )}
            {/* Calendar toolbar portaled here when view is calendar */}
            {viewMode === "calendar" && (
              <div ref={setCalendarToolbarEl} className="flex items-center flex-nowrap gap-2 ml-2" />
            )}
            <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          PILL_BUTTON,
                          "ml-2 md:hidden shrink-0"
                        )}
                        aria-label="More options"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-[280px] max-h-[min(70vh,400px)] overflow-y-auto">
                      <div className="px-2 py-2 border-b border-gray-100 text-xs font-medium text-gray-500">
                        Filters &amp; search
                      </div>
                      <div className="p-2 flex flex-col gap-2 md:hidden">
                        {viewMode === "list" && (
                          <>
                            <div className="flex flex-wrap gap-2">
                              <GroupingDropdown className={PILL_BUTTON + " min-w-[120px]"} hiddenGroupByOptions={isProjectScope ? ['project'] : undefined} />
                              <MultiselectToggle
                                isMultiselectMode={isMultiselectMode}
                                onToggle={() => setIsMultiselectMode((v) => !v)}
                                className={PILL_BUTTON}
                              />
                            </div>
                            <FrequentFilterPills
                              editFields={editFields as any}
                              className={PILL_BUTTON}
                              hideProjectPills={isProjectScope}
                            />
                            <FilterCascadingDropdown
                              editFields={editFields}
                              filterOptions={editFields ? transformEditFieldsToFilterOptions(editFields) : undefined}
                              filters={filters}
                              setFilters={setFilters}
                              router={router}
                              pathname={pathname}
                              params={currentParams}
                              className={PILL_BUTTON}
                              hideProjectFilter={isProjectScope}
                            />
                            <button
                              type="button"
                              className={cn(PILL_BUTTON, "w-full justify-center")}
                              onClick={() => setIsInlineSearchOpen(true)}
                            >
                              <Search className="w-4 h-4 mr-2" />
                              Search tasks
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className={cn(PILL_BUTTON, "w-full justify-center")}
                          onClick={() => setIsFilterPaneOpen(true)}
                        >
                          <Filter className="w-4 h-4 mr-2" />
                          Filter tasks
                        </button>
                        <button
                          type="button"
                          className={cn(PILL_BUTTON, "w-full justify-center")}
                          onClick={() => openComposer({ defaultProjectId: projectId })}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add task
                        </button>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
          </div>
        </div>
        {globalActionsCluster}
      </div>

      {/* Filter pane: commitFilters = same pipeline as pills (URL + setFilters) so task_group_*_filtered refetch. */}
      <TaskFilters
        isOpen={isFilterPaneOpen}
        onClose={() => setIsFilterPaneOpen(false)}
        onApplyFilters={(mapped, display) => {
          setFilters(display);
          setIsFilterPaneOpen(false);
        }}
        activeFilters={filters}
        filterOptions={filterOptionsForBadges}
        hideProjectFilter={isProjectScope}
        commitFilters={commitFilters}
      />

      {/* Row 2: Content grid. Left = filter pills (list only) + main view; right = detail pane (top-aligned to divider under Row 1). */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <PanelGroup direction="horizontal" className="flex-1 min-h-0" autoSaveId={null}>
          <Panel defaultSize={100} minSize={25} maxSize={100} className="flex flex-col min-w-0 min-h-0" order={1}>
            {/* Left column: active filter pills (list view only, same inset as toolbar) then main view */}
            {viewMode === "list" && (
              <div className="flex flex-col flex-1 min-h-0">
                <div className={cn("w-full flex-shrink-0", TOOLBAR_CONTENT_PX)}>
                  <FilterBadges
                    badges={badges}
                    onClearAll={onClearAll}
                    className="mt-1 mb-2 ml-2"
                  />
                </div>
                <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                  <TaskList
                    onTaskSelect={handleTaskSelect}
                    selectedTaskId={selectedTaskId}
                    editFields={editFields}
                    isMultiselectMode={isMultiselectMode}
                    onToggleMultiselect={() => setIsMultiselectMode((v) => !v)}
                  />
                </div>
              </div>
            )}
            {viewMode === "kanban" && (
              <div className="h-full">
<KanbanView
                    searchValue={searchValue}
                    filters={urlFilters}
                    selectedTaskId={selectedTaskId}
                    onTaskSelect={handleTaskSelect}
                    onOptimisticUpdate={onTaskUpdate}
                    enabled={true}
                    hideToolbar={true}
                    toolbarContainerRef={kanbanToolbarRef}
                    hiddenGroupByOptions={isProjectScope ? ['project'] : undefined}
                  />
              </div>
            )}
            {viewMode === "calendar" && (
              <div className="h-full">
<CalendarView
                    onTaskClick={handleTaskSelect}
                    selectedTaskId={selectedTaskId}
                    selectedTask={selectedTask ? normalizeTask(selectedTask) : null}
                    searchValue={searchValue}
                    onOptimisticUpdate={onTaskUpdate}
                    enabled={true}
                    hideToolbar={true}
                    toolbarContainerRef={calendarToolbarRef}
                    hideViewToggle={true}
                  />
              </div>
            )}
          </Panel>
          <PanelResizeHandle className="w-px shrink-0 bg-gray-200 hover:bg-gray-200 cursor-col-resize transition-colors [&[data-resize-handle-active]]:bg-gray-300" />
          {/* Right column: detail pane (in-panel when not expanded; overlay when expanded) */}
          <Panel ref={rightPanelRef} defaultSize={0} minSize={0} maxSize={100} collapsible className="flex flex-col min-w-0 bg-white border-l border-gray-200 pt-0" order={2}>
            {hasDetailsOpen && selectedTask && !isDetailsPaneExpanded && (
              <TaskDetails
                isCollapsed={false}
                selectedTask={selectedTask}
                onClose={handleCloseDetails}
                onCollapse={handleCloseDetails}
                isExpanded={false}
                onExpand={() => {
                  setIsDetailsPaneExpanded(true);
                  rightPanelRef.current?.resize(0);
                }}
                onRestore={() => {}}
                onTaskUpdate={onTaskUpdate}
                onAddSubtask={() => {}}
                onDuplicateTask={handleDuplicateTask}
                attachments={attachments ?? []}
                threadId={threadId ?? null}
                mentions={mentions ?? EMPTY_LIST}
                watchers={watchers ?? EMPTY_LIST}
                currentUser={null}
                subtasks={subtasks ?? EMPTY_LIST}
                project_watchers={project_watchers ?? EMPTY_LIST}
                accessToken={accessToken}
                mode={isSuggestionSelected ? "suggestion" : "task"}
                isBootstrapLoaded={isBootstrapLoadedForSelectedTask}
              />
            )}
          </Panel>
        </PanelGroup>
      </div>

      {/* Expanded detail overlay: full width/height below global header (matches global Tasks) */}
      {isDetailsPaneExpanded && hasDetailsOpen && selectedTask && (
        <div
          className="fixed left-0 right-0 bottom-0 z-[25] bg-white border-l border-gray-200 flex flex-col"
          style={{ top: "64px" }}
          aria-label="Expanded task details"
        >
          <TaskDetails
            isCollapsed={false}
            selectedTask={selectedTask}
            onClose={handleCloseDetails}
            onCollapse={handleCloseDetails}
            isExpanded={true}
            onExpand={() => {}}
            onRestore={() => {
              setIsDetailsPaneExpanded(false);
              rightPanelRef.current?.resize(50);
            }}
            onTaskUpdate={onTaskUpdate}
            onAddSubtask={() => {}}
            onDuplicateTask={handleDuplicateTask}
            attachments={attachments ?? []}
            threadId={threadId ?? null}
            mentions={mentions ?? EMPTY_LIST}
            watchers={watchers ?? EMPTY_LIST}
            currentUser={null}
            subtasks={subtasks ?? EMPTY_LIST}
            project_watchers={project_watchers ?? EMPTY_LIST}
            accessToken={accessToken}
            mode={isSuggestionSelected ? "suggestion" : "task"}
            isBootstrapLoaded={isBootstrapLoadedForSelectedTask}
          />
        </div>
      )}

      {/* Add Task composer: mount in project scope so "+" opens the same tray as global Tasks */}
      <TaskComposerTray />
      <MobileTaskComposerSheet />
    </div>
  );
}

export interface ProjectTasksTabContentProps {
  projectId: number;
}

export function ProjectTasksTabContent({ projectId }: ProjectTasksTabContentProps) {
  const basePath = `/projects/${projectId}`;
  const value = useMemo(
    () => ({
      scope: { type: "project" as const, projectId },
      basePath,
      preserveQueryKeys: { tab: "tasks" },
    }),
    [projectId, basePath]
  );
  return (
    <TasksScopeProvider value={value}>
      <ProjectTasksTabContentInner projectId={projectId} />
    </TasksScopeProvider>
  );
}
