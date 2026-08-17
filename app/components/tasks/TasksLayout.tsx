"use client"

import { ReactNode, useState, cloneElement, useEffect, useCallback, useRef, useMemo } from "react"
import { TaskDetails } from "./TaskDetails"
import type { SuggestionDetailsModel } from "./SuggestionDetails"
import { normalizeTask } from "./task-cache-utils"
import { Menu, X, ChevronRight, Calendar, PanelLeft, PanelRight, PanelRightOpen, Maximize2, Minimize2, ChevronDown, Search, LayoutGrid, List, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Task } from '../../lib/types/tasks'
import React from "react"
import { CalendarView } from '../../components/calendar-view/calendar-view'
import { KanbanView } from '../kanban-view/kanban-view'
import { ResizablePanel } from "../ui/resizable-panel"
import { SlidePanel } from "../ui/slide-panel"
import { Sidebar } from "../ui/Sidebar"
import { AddTaskForm } from './AddTaskForm'
import { useRouter } from 'next/navigation'
import { useTasksUI, ViewMode } from '../../store/tasks-ui'
import { useSearchParams, usePathname } from 'next/navigation'
import { TaskList } from './TaskList'
import { useQueryClient } from '@tanstack/react-query';
import { trackGlobalObjectOpen } from '../../lib/services/global-search';
import { bumpAndInvalidateHomeSidebarRecent } from '../../lib/home-sidebar-recents-cache';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from '../ui/use-toast';
import { removeTaskFromAllStores } from './task-cache-utils';
import { enqueueTaskDeletes } from '../../lib/task-write-queue';
import { BulkActionBar, type BulkAction } from '../ui/bulk-action-bar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import {
  GroupingMenuItems,
  getListGroupByLabelFromParams,
} from './grouping-dropdown';
import { TasksPaneMoreMenu } from './tasks-pane-more-menu';
import { GlobalSearchBox } from '../ui/global-search-box';
import { PanelGroup, Panel, PanelResizeHandle, ImperativePanelHandle, ImperativePanelGroupHandle } from 'react-resizable-panels';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '../ui/dropdown-menu';
import { FilterBadges } from "../../../components/ui/filter-badges";
import { FrequentFilterPills } from "./FrequentFilterPills";
import { FilterCascadingDropdown } from "./FilterCascadingDropdown";
import { TasksPaneToolbar } from "./tasks-pane-toolbar";
import {
  TasksToolbarFitProvider,
  type TasksToolbarFitSnapshot,
} from "../../contexts/tasks-toolbar-fit-context";
import { InlineSearchInput } from "./InlineSearchInput";
import type { TaskFilters as TaskFiltersType } from '../../store/tasks-ui';
import { useTaskListEditBootstrap } from '../../hooks/use-task-list-edit-bootstrap';
import { taskListEditBootstrapToFilterOptions } from '../../lib/services/task-list-edit-bootstrap';
import { useTaskEditFields, type TaskEditFields } from '../../hooks/use-task-edit-fields';
import { useTaskComposerStore } from '../../store/task-composer-store';
import type { FilterOptions } from '../../lib/services/filters';
import { buildFilterSearchParams } from '../../lib/tasks-filter-url';
import { TASKS_SHALLOW_NAV_EVENT, markObjectNavigation, shallowReplaceFullUrl, shallowReplaceSearchParams, dispatchTasksShallowNavigation } from '../../lib/tasks-shallow-nav';
import { applyTaskListDefaultGroupingMode } from '../../lib/tasks-grouping-url';
import { normalizeBasicTask } from '../../lib/normalize-basic-task';
import {
  globalSearchDocumentToRowPayload,
  seedEntityPreviewFromSearchDocument,
} from '../../lib/entity-preview-from-search';
import type { GlobalSearchDocument } from '../../lib/global-search-types';
import { fetchTaskDetailsBootstrapMerged, mergeTaskDetail } from '../../lib/services/task-details-bootstrap';
import { useTaskRealtime } from '../../../hooks/use-task-realtime';
import { useDebounce } from "../../hooks/use-debounce";
import { useMobileDetection } from '../../hooks/use-mobile-detection';
import { useTasksSidebar } from '../../contexts/tasks-sidebar-context';
import { type MobileViewMode } from './mobile-navigation';
import { MobileTaskDetail } from './mobile-task-detail';
import { ResizableBottomSheet } from '../ui/resizable-bottom-sheet';
import { MobileCreateDrawer } from '../ui/mobile-create-drawer';
import { MobileFullScreenSheet } from '../ui/mobile-full-screen-sheet';
import { MobileObjectOptionsDrawer } from './mobile-object-options-drawer';
import { MobileVerticalSplitLayout } from './mobile-vertical-split-layout';
import { MobileTasksPaneContent } from './mobile-tasks-pane-content';
import { MobileGlobalHeaderActions } from '../ui/mobile-global-header-actions';
import { TaskFilters } from './TaskFilters';
import { ResearchPane } from '../ResearchPane';
import { ArtifactPane } from '../../../features/artifacts/ArtifactPane';
import { SourcePane } from '../../../features/sources/SourcePane';
import { AiPane } from '../../../features/ai-chat/AiPane';
import { PublishingPane } from '../../../features/artifacts/publishing-pane';
import { BrowserSessionPane } from '../../../features/artifacts/browser-session-pane';
import {
  buildCloseBrowserPaneParams,
  buildOpenBrowserPaneParams,
  isBrowserPaneOpen,
  setPublicationRunIdInBrowserParams,
} from "./browser-pane-url";
import { RightPaneTabBar } from "./right-pane-tab-bar";
import {
  AI_RIGHT_TAB_KEY,
  DETAILS_RIGHT_TAB_KEY,
  findBrowserTabForPublication,
  useRightPaneTabsStore,
} from "../../store/right-pane-tabs";
import {
  buildAiRightTabKey,
  parseAiRightTabKey,
  useAiPaneChromeStore,
} from "../../../features/ai-chat/ai-pane-chrome-store";
import {
  getArtifactVersionFromParams,
  getCenterArtifactIdFromParams,
} from '../../lib/artifact-selection-url';
import { getCenterSourceIdFromParams } from '../../lib/source-selection-url';
import { getCenterTemplateIdFromParams } from '../../lib/template-selection-url';
import type { AiActiveFieldContext } from '../../../features/ai-chat/active-field-context';
import { ProjectSEOSettings } from '../../../features/tasks/components/ProjectSEOSettings';
import { GlobalSearchFullResultsPane } from '../search/global-search-full-results-pane';
import { GlobalSearchAllTabPane } from '../search/global-search-all-tab-pane';
import { ActiveSearchChip } from "../search/active-search-chip";
import { OBJECT_PANE_CHIP_ROW_CLASS } from "../search/object-pane-content";
import { GlobalSearchDetailsPane } from '@/components/search/global-search-details-pane';
import { TeamDetailsPage } from '@/components/teams/TeamDetailsPage';
import { SettingsPanel } from '../settings/settings-panel';
import { CenterPaneThreadChat } from '../comments-section/center-pane-thread-chat';
import { useGlobalSearchContext } from '../../contexts/global-search-context';
import { useCurrentUserStore } from '../../store/current-user';
import { leftPaneObjectLabel, resolveLeftPaneObject, type LeftPaneObject } from "../../lib/left-pane-object";
import { buildSectionSwitchUrl, leftObjectToSectionKey } from "../../lib/section-switch-url";
import {
  buildCenterPaneSelectionSearchParams,
  buildCenterPaneTabSelectionSearchParams,
  clearActiveCenterSelectionParams,
  CREATE_CENTER_VIEW,
  CREATE_TYPE_PARAM,
  getActiveCenterSelection,
  getCreateCenterTypeFromParams,
  getResearchTabFromParams,
  KEYWORD_RESEARCH_CENTER_VIEW,
  KEYWORD_RESEARCH_QUERY_PARAM,
  PROMPT_RESEARCH_CENTER_VIEW,
  PROMPT_RESEARCH_QUERY_PARAM,
  RESEARCH_CENTER_VIEW,
  RESEARCH_QUERY_PARAM,
  RESEARCH_TAB_PARAM,
  type CreateCenterType,
  type ResearchTab,
} from "../../lib/center-pane-selection-url";
import {
  OPEN_HEADER_CREATE_EVENT,
  OPEN_KEYWORD_RESEARCH_EVENT,
  OPEN_PROMPT_RESEARCH_EVENT,
  OPEN_RESEARCH_EVENT,
  TOGGLE_AI_PANE_EVENT,
  TOGGLE_KEYWORD_RESEARCH_EVENT,
  TOGGLE_PROMPT_RESEARCH_EVENT,
  TOGGLE_RESEARCH_EVENT,
  type OpenHeaderCreateDetail,
} from "../ui/sidebar-home-feed";
import {
  resolveActiveCenterPaneTab,
  toPaneTabStripItems,
} from "../../lib/center-pane-tabs";
import {
  buildCenterPaneTabKey,
  CREATE_TAB_ID,
  RESEARCH_TAB_ID,
  useCenterPaneTabsStore,
  type CenterPaneTab,
  type CenterPaneTabKind,
} from "../../store/center-pane-tabs";
import { CenterPaneTabBar } from "./center-pane-tab-bar";
import { LeftPaneTabBar } from "./left-pane-tab-bar";
import { CreateCenterPane } from "./create-center-pane";
import { CREATE_MODAL_TITLES } from "../ui/use-header-create-flow";
import { LeftObjectSwitcher } from "./LeftObjectSwitcher";
import {
  ensureLeftPaneHasDefaultListTab,
  toLeftPaneTabStripItems,
  useLeftPaneTabsStore,
} from "../../store/left-pane-tabs";
import { useResolveCenterPaneTabTitles } from "../../hooks/use-resolve-center-pane-tab-titles";
import { useElementWidth } from "../../hooks/use-element-width";
import {
  getEffectiveSplitOrientation,
  getPreferredSplitOrientation,
} from "../../lib/tasks-split-orientation";
import {
  applyTasksSplitViewState,
  normalizeSecondaryView,
  parseTasksSplitViewState,
  type TasksSplitViewState,
} from "../../lib/tasks-split-view-state";
import { buildAiPaneFocusParams, buildMiddlePaneFocusParams, isAiPaneFocusMode, isMiddlePaneFocusMode, isTaskDetailsAiSplitMode, isTaskDetailsFocusContext, preserveTaskDetailsFocusWhenOpeningAi } from "./ai-pane-focus-url";
import { clearSearchQuery, getCurrentObjectRoute, type SearchObjectRoute } from "../../lib/search-routing";
import {
  getInitialSplitLayoutMountState,
  nextSplitLayoutMountStateOnToggle,
  shouldRenderSplitLayout,
} from "./ai-pane-focus-mount-policy";
import { getAiPaneFocusLayoutChrome } from "./ai-pane-focus-layout-chrome";
import { buildNewAiThreadParams } from "../../lib/ai-thread-route";
import { mergeWorkspaceUrlState } from "../../lib/workspace-url-state";
import {
  moveActiveWorkspaceTab,
  moveWorkspaceTabByKey,
  openActiveWorkspaceTabInOtherPane,
  openWorkspaceView,
  reorderWorkspaceTabInPane,
} from "../../lib/open-workspace-view";
import {
  getActiveLeftWorkspaceTab,
  getActiveMiddleWorkspaceTab,
  getActiveRightWorkspaceTab,
  isRightViewEntityType,
  LEFT_PANE_VIEW_PARAM,
} from "../../lib/workspace-pane-url";
import { WorkspaceViewRenderer } from "../workspace/workspace-view-renderer";
import {
  isListWorkspaceViewType,
  AI_WORKSPACE_TAB_ID,
  LIST_WORKSPACE_TAB_ID,
  START_WORKSPACE_TAB_ID,
  type WorkspaceViewType,
} from "../../lib/workspace-view";
import { leftPaneObjectForListViewType, listViewToSearchObjectRoute, workspaceListViewLabel } from "../../lib/workspace-list-views";
import { useFocusedWorkspacePaneStore } from "../../store/focused-workspace-pane";

/** Prefer `leftPaneView` list tabs over `object=` so the two URL sync effects cannot fight. */
function resolveLiveLeftPaneObject(
  search: { get: (key: string) => string | null },
  pathname: string,
): LeftPaneObject {
  const active = getActiveLeftWorkspaceTab(search)
  if (active && isListWorkspaceViewType(active.type) && active.type !== "template-list") {
    return leftPaneObjectForListViewType(active.type)
  }
  return resolveLeftPaneObject(search, pathname)
}

// Transform editFields data to filter options format (exported for reuse in ProjectTasksTabContent)
export function transformEditFieldsToFilterOptions(editFields: TaskEditFields, users: any[] = []): FilterOptions {
  // Derive users from project_watchers when users param is empty (for filter assignee options)
  const derivedUsers = users.length > 0
    ? users
    : Array.from(
        new Map(
          (editFields.project_watchers || [])
            .filter((w: any) => w?.users?.id && w?.users?.full_name)
            .map((w: any) => [String(w.users.id), { id: w.users.id, full_name: w.users.full_name, photo: w.users.photo }])
        ).values()
      );

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
    users: (derivedUsers || [])
      .filter((user: any) => user.id && user.full_name)
      .map((user: any) => ({ value: String(user.id), label: user.full_name })),
    statuses: dedupedStatuses.map(status => ({
      value: status.name, // Use name as value for Typesense filtering
      label: status.name,
      color: status.color,
      order_priority: status.order_priority,
      project_id: status.project_id
    })),
    projects: (editFields.projects || []).map(project => ({
      value: String(project.id),
      label: project.name,
      color: project.color ?? null,
      logo: project.logo ?? null,
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

export function mergeListReferenceFilterOptionsWithEditFields(
  listReference: FilterOptions | undefined,
  editFields: TaskEditFields | undefined,
): FilterOptions | undefined {
  const transformed = editFields ? transformEditFieldsToFilterOptions(editFields) : undefined;
  if (listReference && transformed) {
    return {
      ...listReference,
      statuses: transformed.statuses,
      projects: transformed.projects,
      contentTypes: transformed.contentTypes,
      productionTypes: transformed.productionTypes,
      languages: transformed.languages,
      channels: transformed.channels,
    };
  }
  return (listReference as FilterOptions | undefined) ?? transformed;
}

// No need to import types for URLSearchParams or FilterBadge; use global types

type SetFiltersFn = (filters: TaskFiltersType) => void;

type MainViewMode = 'list' | 'calendar' | 'kanban';
type LeftPaneRenderMode =
  | "discovery"
  | "global_results"
  | "tasks"
  | "projects"
  | "mentions"
  | "users"
  | "teams"
  | "ai_chats"
  | "artifacts";

function getRenderMode(object: SearchObjectRoute, q?: string): LeftPaneRenderMode {
  if (object === "all") return q?.trim() ? "global_results" : "discovery";
  if (object === "task") return "tasks";
  if (object === "project") return "projects";
  if (object === "mention") return "mentions";
  if (object === "user") return "users";
  if (object === "team") return "teams";
  if (object === "ai_thread") return "ai_chats";
  if (object === "artifact") return "artifacts";
  return "discovery";
}

type TasksOverflowMenuSlot = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  slotVersion: number;
  setSlotRef: (node: HTMLDivElement | null) => void;
};

function useTasksOverflowMenuSlot(): TasksOverflowMenuSlot {
  const ref = useRef<HTMLDivElement | null>(null);
  const [slotVersion, setSlotVersion] = useState(0);
  const setSlotRef = useCallback((node: HTMLDivElement | null) => {
    if (ref.current === node) return;
    ref.current = node;
    setSlotVersion((v) => v + 1);
  }, []);
  return { containerRef: ref, slotVersion, setSlotRef };
}

function pickPaneOverflowSlot(
  pane: 'single' | 'top' | 'bottom' | 'right',
  single: TasksOverflowMenuSlot,
  top: TasksOverflowMenuSlot,
  bottom: TasksOverflowMenuSlot,
): TasksOverflowMenuSlot {
  if (pane === 'top') return top;
  if (pane === 'bottom' || pane === 'right') return bottom;
  return single;
}

// Helper to map filters to badges, using label mapping from filterOptions
export function getActiveFilterBadges(
  filters: TaskFiltersType,
  setFilters: SetFiltersFn,
  router: any,
  pathname: string,
  params: URLSearchParams,
  filterOptions?: any,
  /** When true, do not show a badge for the project filter (e.g. when scoped to a project). */
  excludeProjectBadge?: boolean,
  /** When true, do not show a badge for the assignee filter (e.g. when scoped to a user). */
  excludeAssigneeBadge?: boolean
): { badges: Array<{ id: string; label: string; value: string; onRemove: () => void }>; onClearAll: () => void } {
  const badges: Array<{ id: string; label: string; value: string; onRemove: () => void }> = [];
  const updateUrl = (newFilters: TaskFiltersType) => {
    const newParams = buildFilterSearchParams(params, newFilters);
    router.replace(`${pathname}?${newParams.toString()}`);
    setFilters(newFilters);
  };
  const filterLabels: Record<string, string> = {
    assignedTo: 'Assignee',
    status: 'Status',
    project: 'Project',
    contentType: 'Content Type',
    productionType: 'Production Type',
    language: 'Language',
    channels: 'Channel',
    overdueStatus: 'Overdue Status',
  };
  const getLabel = (key: string, val: string): string => {
    // Always try to get friendly label, never show raw IDs
    if (!filterOptions) {
      // If no filterOptions and val looks like an ID, return placeholder
      if (/^\d+$/.test(val)) {
        return 'Unknown';
      }
      return val;
    }
    switch (key) {
      case 'project': {
        const opt = filterOptions.projects?.find((p: any) => String(p.value) === String(val));
        // If not found in filterOptions, val might already be a name (from URL), so return it
        return opt?.label || val;
      }
      case 'assignedTo': {
        const opt = filterOptions.users?.find((u: any) => String(u.value) === String(val));
        // If not found, val might be a name, but if it's numeric, it's likely an ID - try to avoid showing it
        if (!opt && /^\d+$/.test(val)) {
          // It's a numeric ID but we don't have the user info - return a placeholder
          return 'Unknown user';
        }
        return opt?.label || val;
      }
      case 'status': {
        // Status filters use names, so val should already be a name
        const opt = filterOptions.statuses?.find((s: any) => String(s.label) === String(val) || String(s.value) === String(val));
        return opt?.label || val; // val is already a name for status
      }
      case 'contentType': {
        const opt = filterOptions.contentTypes?.find((c: any) => String(c.value) === String(val));
        // If not found and val is numeric, it's an ID without label
        if (!opt && /^\d+$/.test(val)) {
          return 'Unknown content type';
        }
        return opt?.label || val;
      }
      case 'productionType': {
        const opt = filterOptions.productionTypes?.find((p: any) => String(p.value) === String(val));
        if (!opt && /^\d+$/.test(val)) {
          return 'Unknown production type';
        }
        return opt?.label || val;
      }
      case 'language': {
        const opt = filterOptions.languages?.find((l: any) => String(l.value) === String(val));
        if (!opt && /^\d+$/.test(val)) {
          return 'Unknown language';
        }
        return opt?.label || val;
      }
      case 'channels': {
        const opt = filterOptions.channels?.find((ch: any) => String(ch.value) === String(val) || String(ch.id) === String(val));
        if (!opt && /^\d+$/.test(val)) {
          return 'Unknown channel';
        }
        return opt?.label || val;
      }
      case 'overdueStatus': {
        // Map the filter values to display labels
        const labelMap: Record<string, string> = {
          'delivery_overdue': 'Delivery overdue',
          'publication_overdue': 'Publication overdue'
        };
        return labelMap[val] || val;
      }
      default:
        // For unknown keys, if val looks like an ID, don't show it directly
        if (/^\d+$/.test(val)) {
          return 'Unknown';
        }
        return val;
    }
  };
  Object.entries(filterLabels).forEach(([key, label]) => {
    if (excludeProjectBadge && key === 'project') return;
    if (excludeAssigneeBadge && key === 'assignedTo') return;
    const arr = (filters as any)[key] as string[];
    if (Array.isArray(arr) && arr.length) {
      arr.forEach((val: string) => {
        badges.push({
          id: `${key}-${val}`,
          label,
          value: getLabel(key, val),
          onRemove: () => {
            const newFilters = { ...filters, [key]: arr.filter((v: string) => v !== val) };
            updateUrl(newFilters);
          },
        });
      });
    }
  });
  if (filters.deliveryDate?.from) {
    badges.push({
      id: 'deliveryDate-from',
      label: 'Delivery Date',
      value: `from ${filters.deliveryDate.from.toLocaleDateString()}`,
      onRemove: () => {
        const newFilters = { ...filters, deliveryDate: { ...filters.deliveryDate, from: undefined } };
        updateUrl(newFilters);
      },
    });
  }
  if (filters.deliveryDate?.to) {
    badges.push({
      id: 'deliveryDate-to',
      label: 'Delivery Date',
      value: `to ${filters.deliveryDate.to.toLocaleDateString()}`,
      onRemove: () => {
        const newFilters = { ...filters, deliveryDate: { ...filters.deliveryDate, to: undefined } };
        updateUrl(newFilters);
      },
    });
  }
  if (filters.publicationDate?.from) {
    badges.push({
      id: 'publicationDate-from',
      label: 'Publication Date',
      value: `from ${filters.publicationDate.from.toLocaleDateString()}`,
      onRemove: () => {
        const newFilters = { ...filters, publicationDate: { ...filters.publicationDate, from: undefined } };
        updateUrl(newFilters);
      },
    });
  }
  if (filters.publicationDate?.to) {
    badges.push({
      id: 'publicationDate-to',
      label: 'Publication Date',
      value: `to ${filters.publicationDate.to.toLocaleDateString()}`,
      onRemove: () => {
        const newFilters = { ...filters, publicationDate: { ...filters.publicationDate, to: undefined } };
        updateUrl(newFilters);
      },
    });
  }
  // Function to clear all filters
  const onClearAll = () => {
    const emptyFilters: TaskFilters = {
      assignedTo: [],
      status: [],
      deliveryDate: {},
      publicationDate: {},
      project: [],
      contentType: [],
      productionType: [],
      language: [],
      channels: [],
      overdueStatus: []
    };
    updateUrl(emptyFilters);
  };

  return { badges, onClearAll };
}

// Custom hook to fetch and merge rich fields from the edge function
import { useQuery } from '@tanstack/react-query';

function useTaskDetails(taskId: string | number | undefined, accessToken: string | null, initialData: any) {
  return useQuery({
    queryKey: ['task', taskId, accessToken],
    queryFn: async ({ signal }) => {
      if (!taskId || !accessToken) return initialData;
      return fetchTaskDetailsBootstrapMerged(taskId, accessToken, initialData ?? undefined, { signal }) as Promise<any>;
    },
    enabled: !!taskId && !!accessToken,
    initialData,
    staleTime: 0,
    select: (data) => {
      if (!data) return initialData;
      // Deterministic merge keeps optimistic values until bootstrap fills them.
      return mergeTaskDetail(initialData ?? undefined, data ?? undefined).merged;
    }
  });
}

// Helper to get initial task from view data (kanban/list/calendar cache)
function getInitialTaskFromViewData(taskId: string | number, preloadedTasks: any[]): any | undefined {
  return preloadedTasks.find(t => String(t.id) === String(taskId));
}

interface TasksLayoutProps {
  children: ReactNode
  selectedTask?: Task | null
  isDetailsCollapsed?: boolean
  onCloseDetails?: () => void
  viewMode: 'list' | 'calendar' | 'kanban'
  setViewMode: (view: 'list' | 'calendar' | 'kanban') => void
  searchValue: string
  setSearchValue: (value: string) => void
  onFilterClick: () => void
  onAddTaskClick?: () => void
  onSidebarToggle?: () => void
  onTaskUpdate?: (updatedFields: Partial<Task>) => void
  onAddSubtask?: (parentTaskId: number, projectId: number) => void
  onSubtaskFormCancel?: () => void
  onSubtaskFormSuccess?: () => void
  /** @deprecated Use TaskComposerTray / openComposer instead */
  isAddTaskOpen?: boolean
  /** @deprecated Use TaskComposerTray / openComposer instead */
  setIsAddTaskOpen?: (open: boolean) => void
  isAddSubtaskPaneOpen: boolean
  setIsAddSubtaskPaneOpen: (open: boolean) => void
  addSubtaskContext: { parentTaskId: number, projectId: number } | null
  handleAddTaskSuccess: (task: Task) => void
}

export function TasksLayout({ 
  children, 
  onCloseDetails = () => {},
  viewMode: _viewMode,
  setViewMode: _setViewMode,
  searchValue: _searchValue,
  setSearchValue: _setSearchValue,
  onFilterClick,
  onAddTaskClick,
  onSidebarToggle,
  onTaskUpdate,
  onAddSubtask,
  onSubtaskFormCancel,
  onSubtaskFormSuccess,
  isAddTaskOpen: _isAddTaskOpen,
  setIsAddTaskOpen: _setIsAddTaskOpen,
  isAddSubtaskPaneOpen,
  setIsAddSubtaskPaneOpen,
  addSubtaskContext,
  handleAddTaskSuccess,
  isSidebarOpen = false,
  isSidebarCollapsed = true,
  onSidebarToggle: _onSidebarToggle,
}: Omit<TasksLayoutProps, 'selectedTask' | 'isDetailsCollapsed'> & { isSidebarOpen?: boolean, isSidebarCollapsed?: boolean, onSidebarToggle?: () => void }) {
  const globalSearch = useGlobalSearchContext()
  // --- Global UI state ---
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const rightViewParam = params.get("rightView")
  const rightTaskIdParam = params.get("rightTaskId")
  const rightThreadIdParam = params.get("rightThreadId")
  const rightProjectIdParam = params.get("rightProjectId")
  const rightUserIdParam = params.get("rightUserId")
  const rightTeamIdParam = params.get("rightTeamId")
  const rightMentionIdParam = params.get("rightMentionId")
  const detailTypeParam = params.get("detailType")
  const detailIdParam = params.get("detailId")
  const taskAiOpenParam = params.get("taskAiOpen")
  const aiThreadIdParam = params.get("aiThreadId")
  const rightThreadIdNum = rightThreadIdParam ? Number(rightThreadIdParam) : null
  const rightMentionIdNum = rightMentionIdParam ? Number(rightMentionIdParam) : null
  // Legacy: `rightThreadId` once meant "show this thread in the middle pane".
  // When `rightView=thread`, the right pane owns the thread — do not mirror it in center.
  // When middle already has a center* entity/list/tool selection, ignore stale rightThreadId
  // (common after AI is open on the right with an old thread id left in the URL).
  const hasMiddleCenterSelection = Boolean(
    params.get("centerTaskId") ||
      params.get("centerSuggestionId") ||
      params.get("centerProjectId") ||
      params.get("centerUserId") ||
      params.get("centerTeamId") ||
      params.get("centerThreadId") ||
      params.get("centerArtifactId") ||
      params.get("centerSourceId") ||
      params.get("centerTemplateId") ||
      params.get("centerView"),
  )
  const isThreadChatRequested =
    !!rightThreadIdParam &&
    Number.isFinite(rightThreadIdNum) &&
    rightViewParam !== "thread" &&
    rightViewParam !== "ai" &&
    rightThreadIdParam !== "new" &&
    !hasMiddleCenterSelection
  const publicUserId = useCurrentUserStore((s) => s.publicUserId)
  const fullName = useCurrentUserStore((s) => s.fullName)
  const userMetadata = useCurrentUserStore((s) => s.userMetadata)
  /** Bumps when tasks URL changes via `history.replaceState` so ?id= sync reads `window.location`. */
  const [tasksShallowUrlEpoch, setTasksShallowUrlEpoch] = useState(0)
  const shallowUrlSearchRef = useRef<string | null>(null)
  const paramsKey = params.toString()
  /**
   * Derive from the live address bar — never mirror into useState.
   * Syncing leftObject via setState on every shallow-nav/epoch tick caused Maximum update depth
   * when other effects also wrote the URL on mount (home / login).
   */
  const leftObject = useMemo((): LeftPaneObject => {
    void tasksShallowUrlEpoch
    if (typeof window !== "undefined") {
      return resolveLiveLeftPaneObject(
        new URLSearchParams(window.location.search),
        window.location.pathname || pathname,
      )
    }
    return resolveLiveLeftPaneObject(new URLSearchParams(paramsKey), pathname)
  }, [paramsKey, pathname, tasksShallowUrlEpoch])
  const isLeftObjectTasks = leftObject === "tasks";
  const leftObjectSearchTab = useMemo(() => {
    if (leftObject === "projects") return "project" as const;
    if (leftObject === "mentions") return "mention" as const;
    if (leftObject === "users") return "user" as const;
    if (leftObject === "artifacts") return "artifact" as const;
    return "ai_thread" as const;
  }, [leftObject]);
  const effectivePathname = "/";
  const navigateToLeftObject = useCallback((targetObject: LeftPaneObject) => {
    const livePathname =
      typeof window !== "undefined" ? window.location.pathname || pathname : pathname
    const baseSearchParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(params.toString())
    const nextUrl = buildSectionSwitchUrl(
      leftObjectToSectionKey(targetObject),
      baseSearchParams,
    )
    const currentFullUrl =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : `${effectivePathname}${params.toString() ? `?${params.toString()}` : ""}`
    const windowPathname = typeof window !== "undefined" ? window.location.pathname : pathname
    if (process.env.NODE_ENV === "development") {
      console.log("[object toggle click]", {
        targetObject,
        currentPathname: livePathname,
        effectivePathname: typeof window !== "undefined" ? window.location.pathname : pathname,
        windowPathname,
        nextUrl,
        currentFullUrl,
      })
    }
    if (nextUrl === currentFullUrl) return
    markObjectNavigation()
    shallowReplaceFullUrl(nextUrl, "left-object-toggle")
    if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
      console.log("[object toggle after write]", {
        location: `${window.location.pathname}${window.location.search}`,
      })
    }
  }, [params, pathname]);
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.log("[left-pane] leftObject from URL", leftObject);
    }
  }, [leftObject]);
  // Measure the actual available space in the left-pane toolbar (not the viewport) so the object
  // switcher can adaptively show pills vs. overflow. `null` until measured -> compact fallback.
  const { ref: leftToolbarScrollRef, width: leftToolbarWidth } = useElementWidth<HTMLDivElement>();
  const effectiveQuery = useMemo(() => {
    if (typeof window === "undefined") {
      return params.get("q")?.trim() ?? "";
    }
    void tasksShallowUrlEpoch;
    return new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
  }, [paramsKey, tasksShallowUrlEpoch]);
  const effectiveObjectRoute = useMemo(() => {
    if (typeof window === "undefined") {
      return getCurrentObjectRoute(pathname, params)
    }
    void tasksShallowUrlEpoch;
    return getCurrentObjectRoute(
      window.location.pathname,
      new URLSearchParams(window.location.search),
    )
  }, [paramsKey, pathname, tasksShallowUrlEpoch])
  const renderMode = useMemo(
    () => getRenderMode(effectiveObjectRoute, effectiveQuery),
    [effectiveObjectRoute, effectiveQuery],
  );
  const isTasksMode = renderMode === "tasks";
  const isRootGlobalShellMode = renderMode === "global_results" || renderMode === "discovery";
  const isGlobalResultsMode = renderMode === "global_results";
  if (process.env.NODE_ENV === "development") {
    console.log("[render mode sync]", {
      pathname: typeof window !== "undefined" ? window.location.pathname : pathname,
      runtimePathname: effectivePathname,
      object: effectiveObjectRoute,
      q: effectiveQuery,
      renderMode,
    })
  }
  useEffect(() => {
    if (effectiveObjectRoute !== "task") return
    const nextParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(params.toString())
    // Seed the grouped default only on first load (no `mode`). An explicit `mode=list`/`ungrouped`
    // ("Group by > No group") is respected and never re-grouped — prevents the normalization loop.
    const changed = applyTaskListDefaultGroupingMode(nextParams)
    if (!changed) return
    shallowReplaceSearchParams(effectivePathname, nextParams, "task-default-grouped-mode")
    // Intentionally omit `params` from deps: seeding mutates the URL, and depending on `params`
    // re-fired this effect against a half-updated Next searchParams snapshot.
  }, [effectiveObjectRoute, effectivePathname])
  const isClosingDetailsRef = useRef(false);
  const resolvedStandaloneAiProjectId = useMemo(() => {
    const projectCandidates = [
      params.get('project'),
      params.get('projectId'),
    ]
      .filter(Boolean)
      .flatMap((value) => String(value).split(','))
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value))
    return projectCandidates[0] ?? null
  }, [params]);
  const shallowReplaceUrl = useCallback((url: string) => {
    if (typeof window === 'undefined') return
    window.history.replaceState({}, '', url)
  }, [])
  const EMPTY_LIST = useMemo(() => [], [])
  const {
    viewMode,
    setViewMode,
    searchValue,
    setSearchValue,
    syncFromUrl,
    selectedTaskId,
    setSelectedTaskId,
    selectedTaskSeed,
    setSelectedTaskSeed,
    filters,
    setFilters,
    plannerVisibility,
    setPlannerVisibility,
  } = useTasksUI();

  const commitFilters = React.useCallback(
    (
      newFilters: TaskFiltersType,
      plannerVisibility?: { showTasks: boolean; showSuggestions: boolean }
    ) => {
      const newParams = buildFilterSearchParams(new URLSearchParams(params.toString()), newFilters);
      if (plannerVisibility !== undefined) {
        const { showTasks, showSuggestions } = plannerVisibility
        if (showTasks && showSuggestions) {
          newParams.delete("showTasks")
          newParams.delete("showSuggestions")
        } else if (showTasks && !showSuggestions) {
          newParams.delete("showTasks")
          newParams.set("showSuggestions", "false")
        } else if (!showTasks && showSuggestions) {
          newParams.set("showTasks", "false")
          newParams.delete("showSuggestions")
        } else {
          newParams.delete("showTasks")
          newParams.delete("showSuggestions")
        }
      }
      router.replace(`${effectivePathname}?${newParams.toString()}`, { scroll: false });
      setFilters(newFilters);
    },
    [params.toString(), pathname, router, setFilters]
  );

  const layoutMountCount = useRef(0);
  useEffect(() => {
    layoutMountCount.current += 1;
    return () => {
    };
  }, []);

  // Track if the filter pane is open
  const [isFilterPaneOpen, setIsFilterPaneOpen] = useState(false);
  
  // Inline search state for task list
  const [isInlineSearchOpen, setIsInlineSearchOpen] = useState(false);
  const [inlineSearchValue, setInlineSearchValue] = useState('');

  // Duplicate task state
  const [isDuplicateTaskOpen, setIsDuplicateTaskOpen] = useState(false);
  const [duplicateInitialValues, setDuplicateInitialValues] = useState<any>(null);
  const [duplicateOnSuccess, setDuplicateOnSuccess] = useState<((task: any) => void | Promise<void>) | null>(null);

  // Research tool state (mobile overlay)
  const [isResearchOpen, setIsResearchOpen] = useState(false);

  // Multiselect state (list uses TaskList-internal selection; calendar/kanban use planner bulk set)
  const [isMultiselectMode, setIsMultiselectMode] = useState(false);
  const [plannerBulkSelectedIds, setPlannerBulkSelectedIds] = useState<Set<number>>(() => new Set());
  const [plannerBulkDeleteOpen, setPlannerBulkDeleteOpen] = useState(false);
  const [plannerBulkDeleting, setPlannerBulkDeleting] = useState(false);

  const handleToggleMultiselect = useCallback(() => {
    setIsMultiselectMode((prev) => {
      if (prev) setPlannerBulkSelectedIds(new Set());
      return !prev;
    });
  }, []);

  const togglePlannerBulkTask = useCallback((taskId: number) => {
    setPlannerBulkSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const clearPlannerBulkSelection = useCallback(() => {
    setPlannerBulkSelectedIds(new Set());
  }, []);

  // **FIX: Split layout config to prevent middle view changes from affecting left pane**
  // Core layout state (affects panel sizing and visibility)
  const [coreLayoutConfig, setCoreLayoutConfig] = useState({
    layout: ['left', 'middle'] as string[], // visible panes
    leftView: 'list' as string,
    rightView: 'details' as string,
    focus: null as string | null, // focused pane
  });
  
  // Middle view state (separate to prevent affecting other panes)
  const [middleView, setMiddleView] = useState('calendar' as string);
  
  // Combine for backward compatibility where needed
  const layoutConfig = useMemo(() => ({
    ...coreLayoutConfig,
    middleView,
  }), [coreLayoutConfig, middleView]);
  

  // Debug: log whenever core layout config changes (but not middleView)
  React.useEffect(() => {
  }, [coreLayoutConfig]);

  // Debug: log when middle view changes (separate from core layout)
  React.useEffect(() => {
  }, [middleView]);

  // Panel refs for imperative resizing
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const centerPanelRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);
  const newLayoutAiPanelRef = useRef<ImperativePanelHandle>(null);
  const newLayoutDesktopPanelGroupRef = useRef<ImperativePanelGroupHandle | null>(null);
  const aiPaneExpandedLayoutBackupRef = useRef<number[] | null>(null);
  const openNextPaneFromListRef = useRef<{
    show: boolean
    run: () => void
  }>({ show: false, run: () => {} });
  const detailsPaneExpandedLayoutBackupRef = useRef<number[] | null>(null);
  const [isAiPaneExpandedMax, setIsAiPaneExpandedMax] = useState(false);
  const [isDetailsPaneExpandedMax, setIsDetailsPaneExpandedMax] = useState(false);
  const [hasMountedSplitLayout, setHasMountedSplitLayout] = useState(() =>
    getInitialSplitLayoutMountState(isAiPaneFocusMode(new URLSearchParams(params.toString())))
  )
  const panelGroupRef = useRef<any>(null);
  
  // **FIX: Track user's preferred left pane width to prevent layout shifts**
  const [userPreferredLeftWidth, setUserPreferredLeftWidth] = useState<number | null>(null);
  const [hasUserResized, setHasUserResized] = useState(false);

  // Mobile state management
  const isMobile = useMobileDetection();
  // Right-pane tabs must be subscribed before any early returns (mobile / loading).
  const rightPaneTabs = useRightPaneTabsStore((state) => state.tabs)
  const rightPaneActiveKey = useRightPaneTabsStore((state) => state.activeKey)
  const upsertRightPaneTab = useRightPaneTabsStore((state) => state.upsertTab)
  const updateRightPaneTab = useRightPaneTabsStore((state) => state.updateTab)
  const setRightPaneActiveKey = useRightPaneTabsStore((state) => state.setActiveKey)
  const closeRightPaneTab = useRightPaneTabsStore((state) => state.closeTab)
  const aiChromeActiveId = useAiPaneChromeStore((state) => state.activeThreadId)
  const aiChromeTabs = useAiPaneChromeStore((state) => state.tabs)
  const aiChromeHandlers = useAiPaneChromeStore((state) => state.handlers)
  const sidebarContext = useTasksSidebar();
  // Prefer context for sidebar (layout provides it); fallback to props from cloneElement
  const effectiveOnSidebarToggle = sidebarContext?.onSidebarToggle ?? _onSidebarToggle;
  const effectiveSidebarCollapsed = isSidebarCollapsed;
  const aiFocusCollapsedSidebarRef = useRef(false);
  const [mobileView, setMobileView] = useState<MobileViewMode>('list');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false);
  const [mobileCreateOpen, setMobileCreateOpen] = useState(false);
  const [mobileTaskDetailOpen, setMobileTaskDetailOpen] = useState(false);
  const mobileSplitTopPercentRef = useRef(55);
  const getLatestSearchParams = useCallback(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search)
    }
    return new URLSearchParams(params.toString())
  }, [params]);
  const clearActiveSearchQuery = useCallback(() => {
    const latestSearchParams = getLatestSearchParams()
    const { searchParams: nextSearchParams } = clearSearchQuery({
      pathname: effectivePathname,
      searchParams: latestSearchParams,
    })
    shallowReplaceSearchParams(effectivePathname, nextSearchParams, "active-search-chip-clear")
  }, [effectivePathname, getLatestSearchParams]);
  const mentionsTab = useMemo(() => {
    const raw = params.get("mentionsTab")
    if (raw === "sent" || raw === "unseen") return raw
    return "received"
  }, [params])
  const handleMentionsTabChange = useCallback((nextTab: "received" | "sent" | "unseen") => {
    const latestSearchParams = getLatestSearchParams()
    latestSearchParams.set("mentionsTab", nextTab)
    shallowReplaceSearchParams(effectivePathname, latestSearchParams, "mentions-tab-change")
  }, [effectivePathname, getLatestSearchParams])

  // Only sync Zustand state from URL on initial mount (never set selectedTaskId from URL after mount)
  const hasHydratedFromURL = React.useRef(false);
  
  // Debug: Track renders and their causes
  const renderCount = useRef(0);
  renderCount.current += 1;
  
  // Sync filters from URL whenever params change (e.g. Project/Status pill, FilterCascadingDropdown)
  // so FilterBadges shows active filters when URL is updated by FrequentFilterPills etc.
  React.useEffect(() => {
    syncFromUrl(new URLSearchParams(params.toString()));
  }, [params.toString(), syncFromUrl]);

  React.useEffect(() => {
    const nextShowTasks = params.get("showTasks") !== "false"
    // Suggestions live on the project sheet; never mix them into planner views.
    if (plannerVisibility.showTasks !== nextShowTasks || plannerVisibility.showSuggestions) {
      setPlannerVisibility({ showTasks: nextShowTasks, showSuggestions: false })
    }
  }, [params.get("showTasks"), plannerVisibility.showTasks, plannerVisibility.showSuggestions, setPlannerVisibility])

  React.useEffect(() => {
    if (!hasHydratedFromURL.current) {
      // LOG hydration start
      // eslint-disable-next-line no-console
      // Only sync search and filters, layout system handles layout/view independently
      const q = params.get('q') || '';
      setSearchValue(q);
      syncFromUrl(new URLSearchParams(params.toString()));

      const showTasks = params.get("showTasks") !== "false"
      setPlannerVisibility({ showSuggestions: false, showTasks })
      
      // Sync layout config from URL
      const urlLayout = params.get('layout')?.split(',').filter(Boolean) || ['left', 'middle'];
      const urlLeftView = params.get('leftView') || 'list';
      const urlMiddleView = params.get('middleView') || 'calendar'; // Default to calendar, independent of old view param
      const urlRightView = params.get('rightView') || 'details';
      const urlFocus = params.get('focus');
      
      const initialCoreConfig = {
        layout: urlLayout,
        leftView: urlLeftView,
        rightView: urlRightView,
        focus: urlFocus,
      };
      
      setCoreLayoutConfig(initialCoreConfig);
      setMiddleView(urlMiddleView);
      
      hasHydratedFromURL.current = true;
      // eslint-disable-next-line no-console
    }
    // Never sync selectedTaskId from URL after initial hydration
  }, []);

  // IMMEDIATE RESIZE CHECK: If state is already correct but panel isn't expanded
  React.useEffect(() => {
    
    const shouldExpandLeft = hasHydratedFromURL.current && (
      (coreLayoutConfig.focus === 'left' && coreLayoutConfig.layout.includes('left')) ||
      (coreLayoutConfig.layout.length === 1 && coreLayoutConfig.layout[0] === 'left')
    );
    
    const shouldExpandMiddle = hasHydratedFromURL.current && (
      (coreLayoutConfig.focus === 'middle' && coreLayoutConfig.layout.includes('middle')) ||
      (coreLayoutConfig.layout.length === 1 && coreLayoutConfig.layout[0] === 'middle')
    );
    
    const shouldExpandRight = hasHydratedFromURL.current && (
      (coreLayoutConfig.focus === 'right' && coreLayoutConfig.layout.includes('right')) ||
      (coreLayoutConfig.layout.length === 1 && coreLayoutConfig.layout[0] === 'right')
    );
    
    if (shouldExpandLeft || shouldExpandMiddle || shouldExpandRight) {
      const targetPane = shouldExpandLeft ? 'left' : shouldExpandMiddle ? 'middle' : 'right';
      
      const attemptResize = (attempt = 1) => {
        
        if (leftPanelRef.current && centerPanelRef.current) {
          const currentSizes = {
            left: leftPanelRef.current.getSize(),
            center: centerPanelRef.current.getSize(),
            right: rightPanelRef.current?.getSize() || 'not available'
          };
          
          // Check which pane should be expanded and verify it
          const targetSize = targetPane === 'left' ? currentSizes.left : 
                           targetPane === 'middle' ? currentSizes.center :
                           (typeof currentSizes.right === 'number' ? currentSizes.right : 0);
          
          if (!targetSize || (typeof targetSize === 'number' && targetSize < 90)) { // If target panel is not nearly full width
            
            if (targetPane === 'left') {
              leftPanelRef.current.resize(100);
              centerPanelRef.current.resize(0);
              if (rightPanelRef.current) rightPanelRef.current.resize(0);
                                      } else if (targetPane === 'middle') {
               // Delay middle resize to avoid conflict with main effect
               setTimeout(() => {
                 if (leftPanelRef.current && centerPanelRef.current) {
                   leftPanelRef.current.resize(0);
                   centerPanelRef.current.resize(100);
                   if (rightPanelRef.current) rightPanelRef.current.resize(0);
                 }
               }, 200);
             } else if (targetPane === 'right' && rightPanelRef.current) {
              leftPanelRef.current.resize(0);
              centerPanelRef.current.resize(0);
              rightPanelRef.current.resize(100);
            }
            
            // Verify resize worked
            setTimeout(() => {
              const newSizes = {
                left: leftPanelRef.current?.getSize(),
                center: centerPanelRef.current?.getSize(),
                right: rightPanelRef.current?.getSize() || 'not available'
              };
              
                            const newTargetSize = targetPane === 'left' ? newSizes.left : 
                                targetPane === 'middle' ? newSizes.center :
                                (typeof newSizes.right === 'number' ? newSizes.right : 0);
              
              if (!newTargetSize || (typeof newTargetSize === 'number' && newTargetSize < 90)) {
              } else {
              }
            }, 50);
          } else {
          }
        } else {
          if (attempt < 5) {
            setTimeout(() => attemptResize(attempt + 1), 200 * attempt);
          }
        }
      };
      
      // Start with immediate attempt, then retry with delays
      attemptResize(1);
    }
  }, [hasHydratedFromURL.current, coreLayoutConfig.focus, coreLayoutConfig.layout]);

  // Layout system is independent of old view parameter
  const isHydratedAndSynced = hasHydratedFromURL.current;

  // **FIX: Split URL sync - core layout separate from middle view**
  // Sync core layout config from URL changes (URL is the single source of truth).
  // Read live `window.location` so shallowReplace (task/new-message open) clears focus
  // without waiting for Next.js useSearchParams.
  React.useEffect(() => {
    if (!hasHydratedFromURL.current) {
      return;
    }
    void tasksShallowUrlEpoch
    const live =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(params.toString())
    
    const urlLayout = live.get('layout')?.split(',').filter(Boolean) || ['left', 'middle'];
    const urlLeftView = live.get('leftView') || 'list';
    const urlRightView = live.get('rightView') || 'details';
    const urlFocus = live.get('focus');
    
    const newCoreConfig = {
      layout: urlLayout,
      leftView: urlLeftView,
      rightView: urlRightView,
      focus: urlFocus,
    };
    
    // Only update if changed
    const coreConfigChanged = JSON.stringify(newCoreConfig) !== JSON.stringify(coreLayoutConfig);
    
    if (coreConfigChanged) {
      setCoreLayoutConfig(newCoreConfig);
    } else {
    }
  }, [params.get('layout'), params.get('leftView'), params.get('rightView'), params.get('focus'), tasksShallowUrlEpoch]);

  // Sync middle view separately (won't trigger layout effects)
  React.useEffect(() => {
    if (!hasHydratedFromURL.current) {
      return;
    }
    
    const urlMiddleView = params.get('middleView') || 'calendar';
    
    if (urlMiddleView !== middleView) {
      setMiddleView(urlMiddleView);
    } else {
    }
  }, [params.get('middleView')]);

  // Imperatively resize panels when CORE layout config changes (NOT middleView)
  React.useEffect(() => {
    if (!hasHydratedFromURL.current) {
      return;
    }
    
    // Extract layout info first
    const { layout, focus } = coreLayoutConfig;
    const isLeftVisible = layout.includes('left');
    const isCenterVisible = layout.includes('middle');
    const isRightVisible = layout.includes('right');
    
    // Helper to safely resize right panel
    const resizeRightPanel = (size: number) => {
      if (rightPanelRef.current) {
        rightPanelRef.current.resize(size);
      }
    };

    const performResize = () => {
      // Check if required panels are ready
      if (!leftPanelRef.current || !centerPanelRef.current) {
        return false;
      }
      
      // For right panel, only require it if it should be visible
      if (isRightVisible && !rightPanelRef.current) {
        return false;
      }

      
      if (focus === 'left') {
        try {
          // Try multiple approaches to force resize
          leftPanelRef.current.resize(100);
          centerPanelRef.current.resize(0);
          if (rightPanelRef.current) {
            rightPanelRef.current.resize(0);
          }
          
          // Individual panel resize approach is working, skip PanelGroup setLayout
          
          // Force multiple attempts with slight delays
          setTimeout(() => {
            leftPanelRef.current?.resize(100);
            centerPanelRef.current?.resize(0);
            if (rightPanelRef.current) rightPanelRef.current.resize(0);
          }, 50);
          
          setTimeout(() => {
            leftPanelRef.current?.resize(100);
            centerPanelRef.current?.resize(0);
            if (rightPanelRef.current) rightPanelRef.current.resize(0);
          }, 200);
          
          // Check sizes after resize
          setTimeout(() => {
          }, 300);
        } catch (error) {
        }
              } else if (focus === 'middle') {
        leftPanelRef.current.resize(0);
        centerPanelRef.current.resize(100);
        if (rightPanelRef.current) rightPanelRef.current.resize(0);
        
        // Verify middle resize worked
        setTimeout(() => {
          const sizesAfterMiddle = {
            left: leftPanelRef.current?.getSize(),
            center: centerPanelRef.current?.getSize(),
            right: rightPanelRef.current?.getSize() || 'not available'
          };
          
          if (sizesAfterMiddle.center && sizesAfterMiddle.center < 90) {
          } else {
          }
        }, 100);
      } else if (focus === 'right') {
        leftPanelRef.current.resize(0);
        centerPanelRef.current.resize(0);
        if (rightPanelRef.current) rightPanelRef.current.resize(100);
              } else {
          // Handle collapsed state in split layout
          if (isLeftVisible && isCenterVisible && isRightVisible) {
            const leftSize = isLeftCollapsed ? 3 : 25;
            const centerSize = isLeftCollapsed ? 72 : 50;
            const rightSize = 25;
            leftPanelRef.current.resize(leftSize);
            centerPanelRef.current.resize(centerSize);
            resizeRightPanel(rightSize);
          } else if (isLeftVisible && isCenterVisible) {
            const leftSize = isLeftCollapsed ? 3 : 30;
            const centerSize = isLeftCollapsed ? 97 : 70;
            leftPanelRef.current.resize(leftSize);
            centerPanelRef.current.resize(centerSize);
            resizeRightPanel(0);
          } else if (isLeftVisible && isRightVisible) {
            const leftSize = isLeftCollapsed ? 3 : 60;
            const rightSize = isLeftCollapsed ? 97 : 40;
            leftPanelRef.current.resize(leftSize);
            centerPanelRef.current.resize(0);
            resizeRightPanel(rightSize);
          } else if (isCenterVisible && isRightVisible) {
            leftPanelRef.current.resize(0);
            centerPanelRef.current.resize(70);
            resizeRightPanel(30);
          } else if (isLeftVisible) {
            const leftSize = isLeftCollapsed ? 3 : 100;
            leftPanelRef.current.resize(leftSize);
            centerPanelRef.current.resize(0);
            resizeRightPanel(0);
            
            // Verify the resize actually worked
            setTimeout(() => {
              const actualSizes = {
                left: leftPanelRef.current?.getSize(),
                center: centerPanelRef.current?.getSize(),
                right: rightPanelRef.current?.getSize() || 'not available'
              };
              
              if (actualSizes.left && actualSizes.left < 90) {
                // Force multiple resize attempts
                setTimeout(() => {
                  leftPanelRef.current?.resize(100);
                  centerPanelRef.current?.resize(0);
                }, 100);
                setTimeout(() => {
                  leftPanelRef.current?.resize(100);
                  centerPanelRef.current?.resize(0);
                }, 300);
              } else {
              }
            }, 100);
          } else if (isCenterVisible) {
            leftPanelRef.current.resize(0);
            centerPanelRef.current.resize(100);
            resizeRightPanel(0);
            
            // Verify center resize worked
            setTimeout(() => {
              const sizesAfterCenter = {
                left: leftPanelRef.current?.getSize(),
                center: centerPanelRef.current?.getSize(),
                right: rightPanelRef.current?.getSize() || 'not available'
              };
              
              if (sizesAfterCenter.center && sizesAfterCenter.center > 90) {
              } else {
              }
            }, 50);
          } else if (isRightVisible) {
            leftPanelRef.current.resize(0);
            centerPanelRef.current.resize(0);
            resizeRightPanel(100);
          }
      }
      return true;
    };

    // Try to resize immediately
    if (!performResize()) {
      // If refs not ready, try again after a short delay
      const timeout = setTimeout(() => {
        performResize();
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [coreLayoutConfig, hasHydratedFromURL.current]); // Only depend on coreLayoutConfig, not middleView

  // Handle layout changes by directly updating URL (no state update)
  const handleLayoutChange = useCallback((changes: Partial<typeof layoutConfig>) => {
    
    const newParams = new URLSearchParams(params.toString());
    
    // Apply changes to current config
    let newConfig = { ...layoutConfig, ...changes };
    
    // Special handling for focus mode - simplify layout to only show focused pane
    if (newConfig.focus) {
      const focusedPane = newConfig.focus;
      if (focusedPane === 'left') {
        newConfig.layout = ['left'];
      } else if (focusedPane === 'middle') {
        newConfig.layout = ['middle'];
      } else if (focusedPane === 'right') {
        newConfig.layout = ['right'];
      }
    }
    
    // Update URL params
    if (newConfig.layout.length > 0) {
      newParams.set('layout', newConfig.layout.join(','));
    } else {
      newParams.delete('layout');
    }
    
    // Always preserve view parameters (even when panes are not in layout)
    // This allows restoring the correct view when de-expanding from focus mode
    if (newConfig.leftView) {
      newParams.set('leftView', newConfig.leftView);
    }
    
    if (newConfig.middleView) {
      newParams.set('middleView', newConfig.middleView);
    }
    
    if (newConfig.rightView) {
      newParams.set('rightView', newConfig.rightView);
    }
    
    if (newConfig.focus) {
      newParams.set('focus', newConfig.focus);
    } else {
      newParams.delete('focus');
    }
    
    // If right pane is not visible, remove task ID and itemKind
    if (!newConfig.layout.includes('right')) {
      newParams.delete('id');
      newParams.delete('itemKind');
    }
    
    // Clean up any old view parameters
    newParams.delete('view');
    
    // Remove AI-related parameters when AI pane is not active
    if (newConfig.middleView !== 'ai-build') {
      newParams.delete('aiThreadId');
    }
    
    router.replace(`${effectivePathname}?${newParams.toString()}`, { scroll: false });
    // Don't update state directly - let the URL effect handle it
  }, [coreLayoutConfig, middleView, params, pathname, router]);

  // Helper to access current layout state
  const { layout, focus, leftView, rightView } = coreLayoutConfig; // Use coreLayoutConfig for layout decisions
  const isLeftVisible = layout.includes('left');
  const isCenterVisible = layout.includes('middle');
  const isRightVisible = layout.includes('right');
  // Center pane should not occupy space unless it is part of the active layout (or explicitly focused)
  const isCenterPaneVisible = focus === 'middle' || (!focus && isCenterVisible);

  const supabase = createClientComponentClient();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (data?.session?.access_token) setAccessToken(data.session.access_token);
    })();
  }, [supabase]);

  // State to track when to fetch edit fields
  const [shouldFetchEditFields, setShouldFetchEditFields] = useState(false);
  
  // Fetch task edit fields data - only when explicitly triggered
  const { data: editFields } = useTaskEditFields(shouldFetchEditFields ? accessToken : null);
  
  // **FIX: Memoize editFields to prevent unnecessary TaskList re-renders**
  const memoizedEditFields = useMemo(() => editFields, [editFields]);

  /** Defer list reference metadata until after paint / filter UI / details — avoids blocking `task_group_*` first render. */
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

  const taskComposerCount = useTaskComposerStore((s) => s.composers.length);

  const listEditBootstrapQueryEnabled =
    !!accessToken &&
    (listEditBootstrapAfterPaint ||
      isFilterPaneOpen ||
      shouldFetchEditFields ||
      isInlineSearchOpen ||
      taskComposerCount > 0);

  const { data: listEditBootstrapRaw } = useTaskListEditBootstrap(accessToken, {
    enabled: listEditBootstrapQueryEnabled,
  });

  const listReferenceFilterOptions = useMemo(
    () => (listEditBootstrapRaw ? taskListEditBootstrapToFilterOptions(listEditBootstrapRaw) : undefined),
    [listEditBootstrapRaw],
  );

  const mergedListFilterOptions = useMemo(
    () => mergeListReferenceFilterOptionsWithEditFields(listReferenceFilterOptions, memoizedEditFields),
    [listReferenceFilterOptions, memoizedEditFields],
  );

  // Set up realtime subscriptions for tasks
  const { isSubscribed } = useTaskRealtime({
    enabled: true,
    showNotifications: false, // Set to true for debugging
    onTaskUpdate: (task, event) => {
      // The cache updates are handled automatically by the hook
    }
  });

  // --- Preload task data for instant Task Details UI ---
  let preloadedTasks: any[] = [];
  const queryClient = useQueryClient();

  const plannerBulkSelectedKey = useMemo(
    () => Array.from(plannerBulkSelectedIds).sort((a, b) => a - b).join(','),
    [plannerBulkSelectedIds],
  );

  const handleConfirmPlannerBulkDelete = useCallback(() => {
    if (plannerBulkSelectedIds.size === 0) return;
    const taskIds = Array.from(plannerBulkSelectedIds);
    setPlannerBulkDeleting(true);
    taskIds.forEach((id) => removeTaskFromAllStores(id));
    setPlannerBulkSelectedIds(new Set());
    setPlannerBulkDeleteOpen(false);
    const supabase = createClientComponentClient();
    enqueueTaskDeletes(
      taskIds.map((taskId) => ({ taskId, supabase })),
      {
        onBatchComplete: ({ ok, failed }) => {
          setPlannerBulkDeleting(false);
          if (failed > 0) {
            queryClient.invalidateQueries({
              predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'tasks',
            });
            queryClient.invalidateQueries({ queryKey: ['subtasks'] });
            toast({
              title: failed === taskIds.length ? 'Failed to delete tasks' : 'Some tasks failed to delete',
              description:
                failed === taskIds.length
                  ? 'An error occurred while deleting the tasks.'
                  : `Deleted ${ok}, failed ${failed}.`,
              variant: 'destructive',
            });
            return;
          }
          toast({
            title: 'Tasks deleted',
            description: `Successfully deleted ${ok} task${ok !== 1 ? 's' : ''}.`,
          });
        },
      },
    );
  }, [plannerBulkSelectedIds, queryClient]);
  
  // Check for list/calendar data (tasks queries)
  if (isLeftVisible || (isCenterVisible && middleView === 'calendar')) {
    const tasksQueries = queryClient.getQueryCache().findAll({
      predicate: q => Array.isArray(q.queryKey) && q.queryKey[0] === 'tasks'
    });
    for (const q of tasksQueries) {
      const data = q.state.data;
      if (data && typeof data === 'object' && 'pages' in data && Array.isArray((data as any).pages)) {
        // InfiniteList: flatten all pages
        for (const page of (data as any).pages) {
          if (Array.isArray(page)) {
            preloadedTasks = preloadedTasks.concat(page);
          }
        }
      } else if (Array.isArray(data)) {
        // Flat array
        preloadedTasks = preloadedTasks.concat(data);
      }
    }
    // Normalize all tasks
    if (preloadedTasks.length > 0) {
    }
    preloadedTasks = preloadedTasks.map(normalizeBasicTask);
  }
  
  // Check for kanban data
  if (isCenterVisible && middleView === 'kanban') {
    const kanbanQueries = queryClient.getQueryCache().findAll({
      predicate: q => Array.isArray(q.queryKey) && q.queryKey[0] === 'kanban-bootstrap'
    });
    for (const q of kanbanQueries) {
      const data = q.state.data;
      if (Array.isArray(data)) {
        // Flat array of tasks (not your case)
        preloadedTasks = preloadedTasks.concat(data);
      } else if (
        data &&
        typeof data === 'object' &&
        (data as any).tasks &&
        typeof (data as any).tasks === 'object'
      ) {
        // New shape: tasks is an object of arrays
        preloadedTasks = preloadedTasks.concat(
          Object.values((data as any).tasks).flat()
        );
      } else if (
        data &&
        typeof data === 'object' &&
        'groups' in data &&
        data.groups &&
        typeof data.groups === 'object'
      ) {
        // Older grouped shape
        preloadedTasks = preloadedTasks.concat(
          Object.values(data.groups).flat()
        );
      }
    }
  }

  // Debug: log all query keys in the React Query cache

  // Add state to store the last selected task object
  const [lastSelectedTask, setLastSelectedTask] = useState<any>(undefined);
  const itemKind = params.get('itemKind') || 'task'
  const isSuggestionSelected = itemKind === 'suggestion'
  // Shared URL-derived selection used for mobile detail open/visibility (and a first-class suggestion
  // selection that does not require centerTaskId / layout / rightView).
  const activeCenterSelection = getActiveCenterSelection(params)
  const isSuggestionDetailSelection = activeCenterSelection?.type === "task-suggestion"
  let initialTaskForDetails: any = undefined;
  if (!isSuggestionSelected) {
    if (selectedTaskSeed && String(selectedTaskSeed.id) === String(selectedTaskId)) {
      initialTaskForDetails = normalizeBasicTask(selectedTaskSeed);
    } else if (lastSelectedTask && String(lastSelectedTask.id) === String(selectedTaskId)) {
      initialTaskForDetails = normalizeBasicTask(lastSelectedTask);
    } else if (selectedTaskId !== null && selectedTaskId !== undefined) {
      const foundTask = getInitialTaskFromViewData(selectedTaskId, preloadedTasks);
      initialTaskForDetails = foundTask ? normalizeBasicTask(foundTask) : undefined;
    }
  }
  if (preloadedTasks.length === 0) {
  }
  const foundTask = preloadedTasks && selectedTaskId
    ? preloadedTasks.find((t) => String(t.id) === String(selectedTaskId) || Number(t.id) === Number(selectedTaskId))
    : undefined;
  if (!foundTask) {
  }
  // initialTaskForDetails is now the merged object
  // const initialTaskForDetails = foundTask ? normalizeBasicTask(foundTask) : undefined;

  // --- Fetch selected task if selectedTaskId is present ---
  function isValidTaskId(id: unknown): id is string | number {
    return (typeof id === 'string' && id.trim() !== '') || (typeof id === 'number' && !isNaN(id));
  }
  const queryKey = isValidTaskId(selectedTaskId)
    ? ['task', selectedTaskId, accessToken]
    : ['task', 'none', accessToken];

  const {
    data: selectedTaskData,
    isLoading: isTaskLoading,
    isSuccess: isTaskDetailsSuccess,
    isFetching: isTaskDetailsFetching,
    isError: isTaskDetailsError,
  } = useTaskDetails(
    isSuggestionSelected ? undefined : (selectedTaskId === null ? undefined : selectedTaskId),
    accessToken,
    initialTaskForDetails // will be undefined if not found in cache
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    console.debug('[task details enabled]', {
      selectedItem: selectedTaskId
        ? { kind: isSuggestionSelected ? 'suggestion' : 'task', id: selectedTaskId }
        : null,
      enabled: !isSuggestionSelected && isValidTaskId(selectedTaskId),
    })
  }, [isSuggestionSelected, selectedTaskId])

  const isBootstrapLoadedForSelectedTask = isSuggestionSelected
    ? true
    : (selectedTaskData as any)?.__bootstrapStatus === 'loaded' || (!isTaskDetailsFetching && (isTaskDetailsSuccess || isTaskDetailsError))

  const { data: selectedSuggestion } = useQuery<SuggestionDetailsModel | null>({
    queryKey: ['task-suggestion', selectedTaskId],
    enabled: isSuggestionSelected && isValidTaskId(selectedTaskId),
    initialData: () =>
      isValidTaskId(selectedTaskId)
        ? (queryClient.getQueryData(['task-suggestion', selectedTaskId]) as SuggestionDetailsModel | undefined)
        : undefined,
    staleTime: 0,
    queryFn: async () => {
      const id = Number(selectedTaskId)
      if (!Number.isFinite(id)) return null
      const supabase = createClientComponentClient()
      const cachedSuggestionEntries = queryClient.getQueriesData<any[]>({ queryKey: ['task-suggestions'] })
      let data =
        cachedSuggestionEntries
          .flatMap(([, rows]) => (Array.isArray(rows) ? rows : []))
          .find((row) => Number((row as any)?.id ?? (row as any)?.entity_id ?? (row as any)?.suggestion_id) === id) ??
        null
      if (!data) {
        const { data: rpcData, error } = await supabase.rpc('task_suggestions_filtered', {
          p_project_ids: null,
          p_content_type_ids: null,
          p_channels: null,
          p_planned_for_date_gte: null,
          p_planned_for_date_lte: null,
          p_q: null,
          p_limit: 5000,
        })
        if (error) throw error
        const rows = Array.isArray(rpcData) ? rpcData : []
        data = rows.find((row: any) => Number(row?.id) === id) ?? null
      }
      if (!data) return null
      const title =
        (data as any)?.proposed_title?.trim?.() ||
        (data as any)?.title?.trim?.() ||
        (data as any)?.ai_title?.trim?.() ||
        'Untitled suggestion'

      let projectMeta: { name: string | null; color: string | null; logo: string | null } | null = null
      let assigneeMeta: { id: number | null; full_name: string | null; photo: string | null } | null = null
      try {
        const pid = Number((data as any)?.project_id ?? (data as any)?.project_id_int)
        if (Number.isFinite(pid)) {
          if ((data as any)?.project_name || (data as any)?.project_color || (data as any)?.project_logo) {
            projectMeta = {
              name: (data as any)?.project_name ?? null,
              color: (data as any)?.project_color ?? null,
              logo: (data as any)?.project_logo ?? null,
            }
          } else {
            const { data: proj } = await supabase
              .from('projects')
              .select('name,color,logo')
              .eq('id', pid)
              .maybeSingle()
            projectMeta = proj ? (proj as any) : null
          }
        }
      } catch {
        // ignore
      }

      try {
        const assignedId = Number((data as any)?.assigned_to_id ?? null)
        if (Number.isFinite(assignedId)) {
          if ((data as any)?.assigned_to_name || (data as any)?.assigned_to_photo) {
            assigneeMeta = {
              id: assignedId,
              full_name: (data as any)?.assigned_to_name ?? null,
              photo: (data as any)?.assigned_to_photo ?? null,
            }
          } else {
            const { data: assignee } = await supabase
              .from('users')
              .select('id,full_name,photo')
              .eq('id', assignedId)
              .maybeSingle()
            assigneeMeta = assignee ? (assignee as any) : null
          }
        }
      } catch {
        // ignore
      }

      // Lookups (best-effort) so suggestion mode can display fields like a task.
      const contentTypeIds = Array.from(
        new Set(
          [Number((data as any)?.content_type_id), Number((data as any)?.ai_content_type_id)].filter((n) =>
            Number.isFinite(n),
          ),
        ),
      )
      const productionTypeId = Number((data as any)?.production_type_id ?? null)
      const languageId = Number((data as any)?.language_id ?? null)
      const channelIds = Array.isArray((data as any).channel_ids) ? ((data as any).channel_ids as any[]) : []
      const cleanedChannelIds = channelIds.map((x) => Number(x)).filter((n) => Number.isFinite(n))

      let contentTypeById = new Map<number, string>()
      let productionTypeTitle: string | null = null
      let languageCode: string | null = null
      let channelNameById = new Map<number, string>()

      try {
        const [
          contentTypesRes,
          productionTypesRes,
          languagesRes,
          channelsRes,
        ] = await Promise.all([
          contentTypeIds.length
            ? supabase.from('content_types').select('id,title').in('id', contentTypeIds)
            : Promise.resolve({ data: [], error: null } as any),
          Number.isFinite(productionTypeId)
            ? supabase.from('production_types').select('id,title').eq('id', productionTypeId).maybeSingle()
            : Promise.resolve({ data: null, error: null } as any),
          Number.isFinite(languageId)
            ? supabase.from('languages').select('id,code').eq('id', languageId).maybeSingle()
            : Promise.resolve({ data: null, error: null } as any),
          cleanedChannelIds.length
            ? supabase.from('channels').select('id,name').in('id', cleanedChannelIds)
            : Promise.resolve({ data: [], error: null } as any),
        ])

        if (Array.isArray(contentTypesRes.data)) {
          contentTypeById = new Map(
            (contentTypesRes.data as any[]).map((r) => [Number(r.id), String(r.title ?? '')]),
          )
        }
        productionTypeTitle = (productionTypesRes.data as any)?.title ?? null
        languageCode = (languagesRes.data as any)?.code ?? null
        if (Array.isArray(channelsRes.data)) {
          channelNameById = new Map(
            (channelsRes.data as any[]).map((r) => [Number(r.id), String(r.name ?? '')]),
          )
        }
      } catch {
        // ignore
      }

      const channelNames = cleanedChannelIds
        .map((id) => channelNameById.get(id))
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)

      return {
        id: (data as any).id,
        title,
        briefing:
          (data as any).proposed_briefing ??
          (data as any).briefing ??
          (data as any).ai_briefing ??
          null,
        planned_for_date:
          (data as any).planned_for_date ??
          (data as any).delivery_date ??
          (data as any).publication_date ??
          null,
        content_type_id: (data as any).content_type_id ?? (data as any).ai_content_type_id ?? null,
        content_type_title:
          Number.isFinite(Number((data as any).content_type_id ?? (data as any).ai_content_type_id))
            ? contentTypeById.get(Number((data as any).content_type_id ?? (data as any).ai_content_type_id)) ?? null
            : null,
        production_type_id: (data as any).production_type_id ?? null,
        production_type_title: productionTypeTitle,
        language_id: (data as any).language_id ?? null,
        language_code: languageCode,
        channel_ids: cleanedChannelIds,
        channel_names: channelNames,
        source_key: (data as any).source_key ?? null,
        project_id: (data as any).project_id ?? (data as any).project_id_int ?? null,
        assigned_to_id:
          Number.isFinite(Number((data as any).assigned_to_id))
            ? Number((data as any).assigned_to_id)
            : assigneeMeta?.id ?? null,
        assigned_to_name: (data as any).assigned_to_name ?? assigneeMeta?.full_name ?? null,
        assigned_to_photo: (data as any).assigned_to_photo ?? assigneeMeta?.photo ?? null,
        status: (data as any).status ?? null,
        project_name: projectMeta?.name ?? null,
        project_color: projectMeta?.color ?? null,
        project_logo: projectMeta?.logo ?? null,
      } as SuggestionDetailsModel
    },
  })

  const selectedSuggestionAsTask = useMemo(() => {
    if (!selectedSuggestion) return null
    return {
      kind: 'suggestion',
      isSuggestion: true,
      rawSuggestion: selectedSuggestion,
      id: String(selectedSuggestion.id),
      suggestion_id: selectedSuggestion.id,
      title: selectedSuggestion.title ?? '',
      briefing: selectedSuggestion.briefing ?? null,
      notes: null,
      copy_post: null,
      delivery_date: selectedSuggestion.planned_for_date ?? null,
      publication_date: selectedSuggestion.planned_for_date ?? null,
      planned_for_date: selectedSuggestion.planned_for_date ?? null,
      assigned_to_id:
        (selectedSuggestion as any).assigned_to_id != null
          ? String((selectedSuggestion as any).assigned_to_id)
          : '',
      assigned_to_name: (selectedSuggestion as any).assigned_to_name ?? null,
      assigned_to_photo: (selectedSuggestion as any).assigned_to_photo ?? null,
      project_id_int: (selectedSuggestion as any).project_id ?? null,
      project_name: (selectedSuggestion as any).project_name ?? null,
      project_color: (selectedSuggestion as any).project_color ?? null,
      project_logo: (selectedSuggestion as any).project_logo ?? null,
      project_status_id: '',
      project_status_name: (selectedSuggestion as any).status ?? 'Suggestion',
      project_status_color: null,
      content_type_id: selectedSuggestion.content_type_id != null ? String(selectedSuggestion.content_type_id) : '',
      content_type_title: (selectedSuggestion as any).content_type_title ?? null,
      production_type_id:
        (selectedSuggestion as any).production_type_id != null ? String((selectedSuggestion as any).production_type_id) : '',
      production_type_title: (selectedSuggestion as any).production_type_title ?? null,
      language_id:
        (selectedSuggestion as any).language_id != null ? String((selectedSuggestion as any).language_id) : '',
      language_code: (selectedSuggestion as any).language_code ?? null,
      channel_names: Array.isArray((selectedSuggestion as any).channel_names) ? (selectedSuggestion as any).channel_names : [],
      channel_ids: Array.isArray((selectedSuggestion as any).channel_ids) ? (selectedSuggestion as any).channel_ids : [],
      parent_task_id_int: null,
      source_key: (selectedSuggestion as any).source_key ?? null,
      status: (selectedSuggestion as any).status ?? 'pending',
    } as any
  }, [selectedSuggestion])

  // Trigger edit fields fetch after task details succeed, or when on mobile (for filter pills)
  useEffect(() => {
    if (!accessToken || shouldFetchEditFields) return;
    if (isTaskDetailsSuccess && selectedTaskData) {
      setShouldFetchEditFields(true);
      return;
    }
    if (isMobile) {
      setShouldFetchEditFields(true);
    }
  }, [isTaskDetailsSuccess, selectedTaskData, accessToken, shouldFetchEditFields, isMobile]);

  // selectedTask is now the merged object
  const selectedTask = selectedTaskData;
  const threadId = selectedTask?.thread_id;
  const attachments = selectedTask?.attachments;
  const mentions = selectedTask?.mentions;
  const watchers = selectedTask?.watchers;
  const subtasks = selectedTask?.subtasks;
  const project_watchers = selectedTask?.project_watchers;

  // Memoize normalized selectedTask to avoid unnecessary re-renders
  const memoizedSelectedTask = useMemo(
    () => selectedTask ? normalizeTask(selectedTask) : undefined,
    [selectedTask]
  );

  // Compute visibleMonth for calendar when a task is selected
  let visibleMonth: Date | null = null;
  if (selectedTask) {
    const dateStr = selectedTask.delivery_date || selectedTask.publication_date;
    if (dateStr) {
      const date = new Date(dateStr);
      visibleMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    }
  }

  // **FIX: Create a stable, memoized TaskList component outside render**
  const MemoizedTaskList = React.useMemo(
    () => React.memo(TaskList, (prevProps, nextProps) => {
      // Only re-render if the props that actually matter have changed.
      // NOTE: isMultiselectMode/onToggleMultiselect MUST be compared here — otherwise toggling
      // multiselect on/off does not re-render the list (checkboxes only appear/disappear after an
      // unrelated re-render, e.g. selecting a row).
      return (
        prevProps.onTaskSelect === nextProps.onTaskSelect &&
        prevProps.selectedTaskId === nextProps.selectedTaskId &&
        prevProps.isMultiselectMode === nextProps.isMultiselectMode &&
        prevProps.onToggleMultiselect === nextProps.onToggleMultiselect &&
        JSON.stringify(prevProps.editFields) === JSON.stringify(nextProps.editFields)
      );
    }),
    []
  );

  // **FIX: Track current panel sizes to preserve them during layout changes**
  const currentPanelSizes = useRef<{ left: number; middle: number }>({ left: 25, middle: 75 });
  
  const updatePanelSizes = useCallback((leftSize: number, middleSize: number) => {
    currentPanelSizes.current = { left: leftSize, middle: middleSize };
  }, []);

  // **FIX: Track user's manual resize of left pane**
  const handleLeftPaneResize = useCallback((newSize: number) => {
    setUserPreferredLeftWidth(newSize);
    setHasUserResized(true);
    // Update the current panel sizes tracking
    updatePanelSizes(newSize, currentPanelSizes.current.middle);
  }, [updatePanelSizes]);

  // **FIX: Track user's manual resize of middle pane**
  const [userPreferredMiddleWidth, setUserPreferredMiddleWidth] = useState<number | null>(null);
  const [hasUserResizedMiddle, setHasUserResizedMiddle] = useState(false);
  
  const handleMiddlePaneResize = useCallback((newSize: number) => {
    setUserPreferredMiddleWidth(newSize);
    setHasUserResizedMiddle(true);
    // Update the current panel sizes tracking
    updatePanelSizes(currentPanelSizes.current.left, newSize);
  }, [updatePanelSizes]);



  // **FIX: Make handleTaskSelect callback stable to prevent unnecessary re-renders**
  const resolveSelectedRowKindAndId = useCallback((row: any): { kind: "task" | "suggestion"; id: number | null } => {
    const isSuggestion =
      row?.kind === "suggestion" ||
      row?.itemKind === "suggestion" ||
      row?.type === "suggestion" ||
      row?.entity_type === "suggestion" ||
      (typeof row?.board_item_id === "string" && row.board_item_id.startsWith("suggestion:"))

    const rawId =
      isSuggestion
        ? (row?.suggestionId ?? row?.suggestion_id ?? row?.entityId ?? row?.entity_id ?? row?.id)
        : (row?.taskId ?? row?.task_id ?? row?.entityId ?? row?.entity_id ?? row?.id)

    const parseId = (value: unknown): number | null => {
      if (typeof value === "number" && Number.isFinite(value)) return value
      if (typeof value === "string") {
        const trimmed = value.trim()
        const tail = trimmed.includes(":") ? trimmed.split(":").pop() ?? trimmed : trimmed
        const n = Number.parseInt(tail, 10)
        return Number.isFinite(n) ? n : null
      }
      return null
    }

    return { kind: isSuggestion ? "suggestion" : "task", id: parseId(rawId) }
  }, [])

  const handleTaskSelect = useCallback((task: any) => {
    globalSearch?.closeDetailTarget()
    const resolved = resolveSelectedRowKindAndId(task)
    const entityType: 'task' | 'suggestion' = resolved.kind
    const entityId = resolved.id ?? NaN
    if (process.env.NODE_ENV === 'development') {
      console.debug('[row click]', {
        kind: task?.kind ?? null,
        itemKind: task?.itemKind ?? null,
        type: task?.type ?? null,
        id: task?.id ?? null,
        entityId: task?.entity_id ?? task?.entityId ?? null,
        taskId: task?.taskId ?? task?.task_id ?? null,
        suggestionId: task?.suggestionId ?? task?.suggestion_id ?? null,
        resolvedKind: entityType,
        resolvedId: entityId,
      })
    }

    setLastSelectedTask(task);
    setSelectedTaskSeed(task ?? null);
    if (!Number.isFinite(entityId) || entityId <= 0) return;

    // Immediate selection update so details pane opens instantly
    // without waiting for URL sync effect to run.
    const selectedId = String(entityId)
    const currentItemKind = params.get("itemKind") === "suggestion" ? "suggestion" : "task"
    if (!(selectedTaskId && String(selectedTaskId) === selectedId && currentItemKind === entityType)) {
      setSelectedTaskId(selectedId)
    }

    if (entityType === "task") {
      const title =
        (typeof task?.title === "string" && task.title.trim()) ||
        (typeof task?.name === "string" && task.name.trim()) ||
        `Task ${selectedId}`
      bumpAndInvalidateHomeSidebarRecent(queryClient, "tasks", { id: selectedId, title })
      void trackGlobalObjectOpen({ entityType: "task", entityId: selectedId }).catch(() => {})
    }

    // Seed details cache from clicked row data (fast first paint), then
    // task-details-bootstrap query will merge richer fields.
    const seededTask = normalizeBasicTask(task)
    if (accessToken && entityType === "task" && seededTask) {
      queryClient.setQueryData(['task', selectedId, accessToken], (old: any) => {
        if (!old) return { ...seededTask, __partial: true }
        return mergeTaskDetail(old, { task: seededTask } as never).merged
      })
      // Single bootstrap fetch: useTaskDetails (same queryKey) runs task-details-bootstrap. Do not
      // prefetch here — that doubles in-flight requests and aborts the first (red / canceled in DevTools).
    } else if (entityType === "suggestion" && seededTask) {
      queryClient.setQueryData(['task-suggestion', selectedId], (old: any) => old ?? { ...task, __partial: true })
    }
    
    // Ensure left pane is expanded when task is selected to prevent list disappearing
    if (isLeftCollapsed) {
      setIsLeftCollapsed(false);
    }
    
    // Default: open task/suggestion in middle (established left-list UX).
    const title =
      (typeof task?.title === "string" && task.title.trim()) ||
      (typeof task?.name === "string" && task.name.trim()) ||
      null
    openWorkspaceView(
      {
        type: entityType === "suggestion" ? "suggestion" : "task",
        id: entityId,
        taskId: entityId,
        title,
      },
      {
        pane: "middle",
        pathname: effectivePathname,
        source: "task-row-select",
      },
    )
  }, [accessToken, globalSearch, params, pathname, queryClient, resolveSelectedRowKindAndId, router, selectedTaskId, setLastSelectedTask, setSelectedTaskId, setSelectedTaskSeed, effectivePathname]);

  /** Open a project as a middle-pane tab by default (established UX; no stacked back chevron). */
  const handleOpenProjectSelect = useCallback(
    (projectId: number) => {
      if (!Number.isFinite(projectId) || projectId <= 0) return
      setSelectedTaskId(null)
      setSelectedTaskSeed(null)
      openWorkspaceView(
        { type: "project", projectId, id: projectId },
        { pane: "middle", pathname: effectivePathname, source: "project-row-select" },
      )
    },
    [effectivePathname, setSelectedTaskId, setSelectedTaskSeed],
  )

  const handleGlobalSearchTaskResultOpen = useCallback(
    (item: GlobalSearchDocument) => {
      seedEntityPreviewFromSearchDocument(queryClient, item, { accessToken })
      handleTaskSelect(globalSearchDocumentToRowPayload(item))
    },
    [accessToken, handleTaskSelect, queryClient],
  )

  useEffect(() => {
    if (!globalSearch?.registerTaskResultOpener) return
    globalSearch.registerTaskResultOpener(handleGlobalSearchTaskResultOpen as any)
    return () => globalSearch.registerTaskResultOpener(null)
  }, [globalSearch, handleGlobalSearchTaskResultOpen])

  /** Open TaskDetails while keeping project/user/team detail params (tasks shell right column). */
  const handleOpenTaskKeepingDetailContext = useCallback(
    (task: any) => {
      const resolved = resolveSelectedRowKindAndId(task)
      const entityType: "task" | "suggestion" = resolved.kind
      const entityId = resolved.id ?? NaN
      setLastSelectedTask(task)
      setSelectedTaskSeed(task ?? null)
      if (!Number.isFinite(entityId) || entityId <= 0) return

      const selectedId = String(entityId)
      if (!(selectedTaskId && String(selectedTaskId) === selectedId)) {
        setSelectedTaskId(selectedId)
      }

      const seededTask = normalizeBasicTask(task)
      if (accessToken && entityType === "task") {
        queryClient.setQueryData(["task", selectedId, accessToken], (old: any) => old ?? seededTask)
      }

      const base =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams(params.toString())
      // Stack the task OVER the current detail target (e.g. a user pane): keep the existing detail
      // params (centerUserId / rightUserId / centerProjectId / centerTeamId ...) so the parent stays
      // as back-history and selectedDetailTarget resolves to it. The middle pane then renders ONLY
      // the task (TaskDetails) with a back chevron. We only set the task target and clear other
      // task/suggestion selection params — we do NOT clear the parent detail.
      const next = new URLSearchParams(base.toString())
      if (entityType === "suggestion") {
        next.set("itemKind", "suggestion")
        next.set("centerSuggestionId", selectedId)
        next.delete("id")
        next.delete("centerTaskId")
        next.delete("rightTaskId")
      } else {
        next.delete("itemKind")
        next.delete("centerSuggestionId")
        next.delete("id")
        next.delete("rightTaskId")
        next.set("centerTaskId", String(entityId))
        next.set("layout", "right")
      }
      next.delete("stackTeamId")
      next.delete("focusOutputs")
      if (next.toString() !== base.toString()) {
        shallowReplaceSearchParams(effectivePathname, next, "task-result-open")
      }
    },
    [
      accessToken,
      params,
      pathname,
      queryClient,
      resolveSelectedRowKindAndId,
      setLastSelectedTask,
      selectedTaskId,
      setSelectedTaskId,
      setSelectedTaskSeed,
    ],
  )

  const handleDetailStackBackFromTask = useCallback(() => {
    const base =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(params.toString())
    base.delete("id")
    base.delete("centerTaskId")
    base.delete("centerSuggestionId")
    base.delete("itemKind")
    shallowReplaceSearchParams(effectivePathname, base, "task-detail-stack-back")
  }, [params, pathname])

  // Open a team from the user-overview Team section. Stacks the team detail OVER the existing user
  // detail: the user remains the detail target (selectedDetailTarget) as back-history, and the team
  // becomes the active middle target via `stackTeamId`. The middle pane renders ONLY the team detail
  // (TeamDetailsPage) with a back chevron (onStackBack -> handleTeamStackBack) that returns to the
  // user. Every other param is preserved as-is: right pane (AI: rightView, taskAiOpen, aiThreadId,
  // layout, object) and left task-list filters (mode, groupBy, groupOrder, assignedTo, overdueStatus).
  const handleOpenTeamKeepingDetailContext = useCallback(
    (teamId: number) => {
      if (!Number.isFinite(teamId) || teamId <= 0) return
      const base =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams(params.toString())
      const next = new URLSearchParams(base.toString())
      next.set("stackTeamId", String(teamId))
      if (next.toString() !== base.toString()) {
        shallowReplaceSearchParams(effectivePathname, next, "user-overview-team-open")
      }
    },
    [params, pathname],
  )

  const handleTeamStackBack = useCallback(() => {
    const base =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(params.toString())
    base.delete("stackTeamId")
    shallowReplaceSearchParams(effectivePathname, base, "task-team-stack-back")
  }, [params, pathname])

  // Use the id query param as the source of truth for selectedTaskId (opens / external navigations).
  // On the client, read `window.location` so shallow history updates (no Next router) stay in sync.
  // While isClosingDetailsRef is set, ignore a stray ?id= until the real URL no longer has id.
  React.useEffect(() => {
    if (effectiveObjectRoute !== "task") return
    const currentParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(params.toString())
    const idFromQuery = currentParams.get("id");
    const centerTaskIdFromQuery = currentParams.get("centerTaskId");
    const centerSuggestionIdFromQuery = currentParams.get("centerSuggestionId");
    const rightTaskIdFromQuery = currentParams.get("rightTaskId");
    const itemKindFromQuery = currentParams.get("itemKind");
    const entityFromQuery =
      currentParams.get("entity");
    const isSuggestionSelection = itemKindFromQuery === "suggestion"
    const shouldTreatIdAsTask = effectiveObjectRoute === "task" || entityFromQuery === 'task'
    const nextTaskId = isSuggestionSelection
      ? (centerSuggestionIdFromQuery ?? null)
      : centerTaskIdFromQuery ??
        rightTaskIdFromQuery ??
        (shouldTreatIdAsTask && idFromQuery ? idFromQuery : null)
    if (process.env.NODE_ENV === 'development') {
      console.debug('[parse selected item]', {
        itemKind: itemKindFromQuery,
        id: idFromQuery,
        centerTaskId: centerTaskIdFromQuery,
        centerSuggestionId: centerSuggestionIdFromQuery,
        parsedSelectedItem: nextTaskId
          ? { kind: isSuggestionSelection ? 'suggestion' : 'task', id: Number(nextTaskId) }
          : null,
      })
    }
    if (isClosingDetailsRef.current) {
      if (!nextTaskId) {
        isClosingDetailsRef.current = false;
      } else {
        return;
      }
    }
    if (nextTaskId && nextTaskId !== selectedTaskId) {
      setSelectedTaskId(nextTaskId);
    }
    if (!nextTaskId && selectedTaskId) {
      setSelectedTaskId(null);
      setSelectedTaskSeed(null);
    }
  }, [effectiveObjectRoute, params.get("entity"), params.get("id"), params.get("itemKind"), params.get("centerTaskId"), params.get("centerSuggestionId"), params.get("rightTaskId"), tasksShallowUrlEpoch, setSelectedTaskId, setSelectedTaskSeed]);

  React.useEffect(() => {
    const currentParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(params.toString())
    if (currentParams.get("itemKind") !== "suggestion") return
    if (!currentParams.get("id")) return
    const next = new URLSearchParams(currentParams.toString())
    next.delete("id")
    next.delete("centerTaskId")
    next.delete("rightTaskId")
    if (next.toString() !== currentParams.toString()) {
      shallowReplaceSearchParams(effectivePathname, next, "suggestion-url-normalize")
    }
  }, [params.toString(), effectivePathname, tasksShallowUrlEpoch])

  React.useEffect(() => {
    const currentParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(params.toString())
    const centerKeys = ["centerTaskId", "centerSuggestionId", "centerProjectId", "centerUserId", "centerTeamId", "centerThreadId", "centerArtifactId", "centerSourceId", "centerTemplateId"] as const
    const present = centerKeys.filter((key) => {
      const value = currentParams.get(key)
      return typeof value === "string" && value.trim().length > 0
    })
    if (present.length <= 1) return

    const pathPreferredKey =
      effectiveObjectRoute === "project" ? "centerProjectId" :
      effectiveObjectRoute === "user" ? "centerUserId" :
      effectiveObjectRoute === "team" ? "centerTeamId" :
      effectiveObjectRoute === "mention" ? "centerThreadId" :
      effectiveObjectRoute === "task"
        ? (currentParams.get("itemKind") === "suggestion" ? "centerSuggestionId" : "centerTaskId")
        :
      null
    const keepKey = pathPreferredKey && present.includes(pathPreferredKey)
      ? pathPreferredKey
      : present[present.length - 1]
    const keepValue = currentParams.get(keepKey)
    if (!keepValue) return

    const next = new URLSearchParams(currentParams.toString())
    for (const key of centerKeys) {
      if (key === keepKey) continue
      next.delete(key)
    }
    if (next.get("itemKind") === "suggestion") {
      next.delete("id")
      next.delete("centerTaskId")
      next.delete("rightTaskId")
    }
    if (next.toString() !== currentParams.toString()) {
      shallowReplaceSearchParams(effectivePathname, next, "tasks-center-key-normalize")
    }
  }, [effectiveObjectRoute, pathname, params.toString(), tasksShallowUrlEpoch])

  React.useEffect(() => {
    if (effectiveObjectRoute !== "task") return
    const currentParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(params.toString())
    const centerTaskId = currentParams.get("centerTaskId")
    const rightTaskId = currentParams.get("rightTaskId")
    if (!centerTaskId && !rightTaskId) return
    // When rightView explicitly hosts an entity (e.g. task in the right pane),
    // do not migrate rightTaskId → centerTaskId — panes are independent.
    if (isRightViewEntityType(currentParams.get("rightView"))) return
    const next = new URLSearchParams(currentParams.toString())
    if (centerTaskId && rightTaskId) {
      // Both set without an entity rightView: prefer middle, drop legacy right id.
      next.delete("rightTaskId")
    } else if (!centerTaskId && rightTaskId) {
      // Legacy right-only task deep links → middle (compat).
      next.set("centerTaskId", rightTaskId)
      next.delete("rightTaskId")
    }
    if (next.toString() !== currentParams.toString()) {
      shallowReplaceSearchParams(effectivePathname, next, "tasks-taskid-canonicalize")
    }
  }, [effectiveObjectRoute, params.toString(), effectivePathname, tasksShallowUrlEpoch])

  // Handler for closing details pane — with desktop tabs, closes the active tab only.
  const centerPaneTabs = useCenterPaneTabsStore((state) => state.tabs)
  const upsertCenterPaneTab = useCenterPaneTabsStore((state) => state.upsertTab)
  const updateCenterPaneTabTitle = useCenterPaneTabsStore((state) => state.updateTitle)
  const closeCenterPaneTab = useCenterPaneTabsStore((state) => state.closeTab)
  const closeCenterPaneTabs = useCenterPaneTabsStore((state) => state.closeTabs)
  const closeAllCenterPaneTabs = useCenterPaneTabsStore((state) => state.closeAll)

  const leftPaneTabs = useLeftPaneTabsStore((state) => state.tabs)
  const leftPaneActiveKeyStore = useLeftPaneTabsStore((state) => state.activeKey)
  const upsertLeftPaneTab = useLeftPaneTabsStore((state) => state.upsertTab)
  const closeLeftPaneTab = useLeftPaneTabsStore((state) => state.closeTab)
  const closeLeftPaneTabs = useLeftPaneTabsStore((state) => state.closeTabs)
  const closeAllLeftPaneTabs = useLeftPaneTabsStore((state) => state.closeAll)

  // Seed left pane from URL (`leftPaneView`; default homepage = AI) and keep tabs in sync.
  React.useEffect(() => {
    const live =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(params.toString())
    const active = getActiveLeftWorkspaceTab(live)
    if (!active) return

    const existing = useLeftPaneTabsStore
      .getState()
      .tabs.find((tab) => tab.key === `${active.type}:${active.id}`)
    const needsUpsert =
      !existing ||
      useLeftPaneTabsStore.getState().activeKey !== `${active.type}:${active.id}` ||
      (active.title && existing.title !== active.title)
    if (needsUpsert) {
      upsertLeftPaneTab({
        kind: active.type,
        id: active.id,
        title: active.title,
        activate: true,
      })
    }

    // Persist `leftPaneView` for the active left tab (lists + AI homepage).
    if (isListWorkspaceViewType(active.type) || active.type === "ai") {
      const next = new URLSearchParams(live.toString())
      let changed = false
      if (!live.get(LEFT_PANE_VIEW_PARAM)) {
        next.set(LEFT_PANE_VIEW_PARAM, active.type === "ai" ? "ai" : active.type)
        changed = true
      }
      if (isListWorkspaceViewType(active.type)) {
        // Prefer SearchObjectRoute values in `object=` (task/project/…) for shared routing.
        // Templates are not a search object route — leave `object=` alone.
        if (active.type !== "template-list") {
          const expectedSearchObject = listViewToSearchObjectRoute(active.type)
          if (live.get("object") !== expectedSearchObject) {
            next.set("object", expectedSearchObject)
            changed = true
          }
        }
      }
      if (changed && next.toString() !== live.toString()) {
        shallowReplaceSearchParams(effectivePathname, next, "left-pane-view-migrate")
      }
    }
  }, [effectivePathname, params, tasksShallowUrlEpoch, upsertLeftPaneTab])

  const clearCenterPaneUrlSelection = useCallback(() => {
    isClosingDetailsRef.current = true
    setSelectedTaskId(null)
    setSelectedTaskSeed(null)
    globalSearch?.closeDetailTarget()
    const newParams = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : params.toString(),
    )
    newParams.delete("id")
    newParams.delete("entity")
    newParams.delete("rightTaskId")
    newParams.delete("rightProjectId")
    newParams.delete("rightUserId")
    newParams.delete("rightTeamId")
    newParams.delete("rightThreadId")
    newParams.delete("rightMentionId")
    newParams.delete("rightTab")
    newParams.delete("centerTaskId")
    newParams.delete("centerSuggestionId")
    newParams.delete("centerProjectId")
    newParams.delete("centerUserId")
    newParams.delete("centerTeamId")
    newParams.delete("centerThreadId")
    newParams.delete("centerMentionId")
    newParams.delete("centerTab")
    newParams.delete("centerView")
    newParams.delete("centerArtifactId")
    newParams.delete("centerSourceId")
    newParams.delete("centerTemplateId")
    newParams.delete("version")
    newParams.delete(KEYWORD_RESEARCH_QUERY_PARAM)
    newParams.delete(PROMPT_RESEARCH_QUERY_PARAM)
    newParams.delete(RESEARCH_QUERY_PARAM)
    newParams.delete(RESEARCH_TAB_PARAM)
    newParams.delete(CREATE_TYPE_PARAM)
    newParams.delete("itemKind")
    newParams.delete("detailType")
    newParams.delete("detailId")
    newParams.delete("tab")
    newParams.delete("briefingTypeId")
    newParams.delete("stackTeamId")
    if (newParams.get("rightView") === "details") {
      newParams.delete("rightView")
    }
    shallowReplaceSearchParams(effectivePathname, newParams, "task-close-details")
    if (onCloseDetails) onCloseDetails()
  }, [effectivePathname, globalSearch, onCloseDetails, params, setSelectedTaskId, setSelectedTaskSeed])

  const activateCenterPaneTab = useCallback(
    (tab: CenterPaneTab) => {
      if (
        tab.kind === "ai" ||
        tab.kind === "browser" ||
        tab.kind === "start" ||
        tab.kind === "task-list" ||
        tab.kind === "project-list" ||
        tab.kind === "mention-list" ||
        tab.kind === "user-list" ||
        tab.kind === "ai-thread-list" ||
        tab.kind === "artifact-list" ||
        tab.kind === "template-list" ||
        tab.kind === "search-results"
      ) {
        const liveParams =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search)
            : new URLSearchParams(params.toString())
        openWorkspaceView(
          {
            type: tab.kind as WorkspaceViewType,
            id: tab.id,
            title: tab.title,
            aiThreadId: tab.kind === "ai" && tab.id !== "main" ? tab.id : undefined,
            params:
              tab.kind === "browser"
                ? { browserTabId: tab.id }
                : tab.kind === "ai" && tab.id !== "main"
                  ? { aiThreadId: tab.id }
                  : tab.kind === "search-results"
                    ? {
                        searchQuery:
                          liveParams.get("centerSearchQuery")?.trim() || tab.title || "",
                      }
                    : undefined,
          },
          {
            pane: "middle",
            pathname: effectivePathname,
            source: "center-pane-tab-activate",
          },
        )
        setSelectedTaskId(null)
        setSelectedTaskSeed(null)
        return
      }
      const baseParams =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams(params.toString())
      const next = buildCenterPaneTabSelectionSearchParams({
        currentSearchParams: baseParams,
        kind: tab.kind,
        id: tab.id,
        createType:
          tab.kind === "create" ? getCreateCenterTypeFromParams(baseParams) : null,
      })
      if (tab.kind === "task" || tab.kind === "suggestion") {
        setSelectedTaskId(tab.id)
        setSelectedTaskSeed(null)
        globalSearch?.closeDetailTarget()
      } else {
        setSelectedTaskId(null)
        setSelectedTaskSeed(null)
      }
      shallowReplaceSearchParams(effectivePathname, next, "center-pane-tab-activate")
    },
    [effectivePathname, globalSearch, params, setSelectedTaskId, setSelectedTaskSeed],
  )

  const handleCloseDetails = () => {
    if (isMobile) {
      clearCenterPaneUrlSelection()
      return
    }

    const stackTeamIdRaw =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("stackTeamId")
        : params.get("stackTeamId")
    const activeTab = resolveActiveCenterPaneTab({
      selectedTaskId,
      isSuggestion: isSuggestionSelected,
      selectedTaskTitle:
        (isSuggestionSelected
          ? (selectedSuggestionAsTask as any)?.title
          : (selectedTaskData as any)?.title) ?? null,
      selectedDetailTarget: globalSearch?.selectedDetailTarget ?? null,
      stackTeamId: stackTeamIdRaw,
      centerView:
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("centerView")
          : params.get("centerView"),
        centerArtifactId:
          typeof window !== "undefined"
            ? getCenterArtifactIdFromParams(new URLSearchParams(window.location.search))
            : getCenterArtifactIdFromParams(params),
        centerSourceId:
          typeof window !== "undefined"
            ? getCenterSourceIdFromParams(new URLSearchParams(window.location.search))
            : getCenterSourceIdFromParams(params),
        centerTemplateId:
          typeof window !== "undefined"
            ? getCenterTemplateIdFromParams(new URLSearchParams(window.location.search))
            : getCenterTemplateIdFromParams(params),
      })

    if (!activeTab) {
      clearCenterPaneUrlSelection()
      return
    }

    const nextTab = closeCenterPaneTab(activeTab.key)
    if (nextTab) {
      activateCenterPaneTab(nextTab)
      return
    }
    clearCenterPaneUrlSelection()
  }

  /** Chrome X: hide the entire middle pane (not just the active tab). */
  const handleCloseMiddlePane = useCallback(() => {
    closeAllCenterPaneTabs()
    isClosingDetailsRef.current = true
    setSelectedTaskId(null)
    setSelectedTaskSeed(null)
    globalSearch?.closeDetailTarget()
    const nextParams = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : params.toString(),
    )
    // Clear middle selection only — leave right pane (AI / entities) intact.
    nextParams.delete("id")
    nextParams.delete("entity")
    nextParams.delete("centerTaskId")
    nextParams.delete("centerSuggestionId")
    nextParams.delete("centerProjectId")
    nextParams.delete("centerUserId")
    nextParams.delete("centerTeamId")
    nextParams.delete("centerThreadId")
    nextParams.delete("centerMentionId")
    nextParams.delete("centerTab")
    nextParams.delete("centerView")
    nextParams.delete("centerArtifactId")
    nextParams.delete("centerSourceId")
    nextParams.delete("centerTemplateId")
    nextParams.delete("version")
    nextParams.delete(KEYWORD_RESEARCH_QUERY_PARAM)
    nextParams.delete(PROMPT_RESEARCH_QUERY_PARAM)
    nextParams.delete(RESEARCH_QUERY_PARAM)
    nextParams.delete(RESEARCH_TAB_PARAM)
    nextParams.delete(CREATE_TYPE_PARAM)
    nextParams.delete("itemKind")
    nextParams.delete("detailType")
    nextParams.delete("detailId")
    nextParams.delete("tab")
    nextParams.delete("briefingTypeId")
    nextParams.delete("stackTeamId")
    nextParams.delete("focus")
    detailsPaneExpandedLayoutBackupRef.current = null
    setIsDetailsPaneExpandedMax(false)
    shallowReplaceSearchParams(effectivePathname, nextParams, "middle-pane-close")
    if (onCloseDetails) onCloseDetails()
  }, [
    closeAllCenterPaneTabs,
    effectivePathname,
    globalSearch,
    onCloseDetails,
    params,
    setSelectedTaskId,
    setSelectedTaskSeed,
  ])

  const handleCenterPaneTabSelect = useCallback(
    (key: string) => {
      const tab = useCenterPaneTabsStore.getState().tabs.find((entry) => entry.key === key)
      if (!tab) return
      activateCenterPaneTab(tab)
    },
    [activateCenterPaneTab],
  )

  const handleCenterPaneTabClose = useCallback(
    (keyOrKeys: string | string[]) => {
      const keys = Array.isArray(keyOrKeys) ? keyOrKeys.filter(Boolean) : [keyOrKeys]
      if (keys.length === 0) return
      const stackTeamIdRaw =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("stackTeamId")
          : params.get("stackTeamId")
      const activeTab = resolveActiveCenterPaneTab({
        selectedTaskId,
        isSuggestion: isSuggestionSelected,
        selectedDetailTarget: globalSearch?.selectedDetailTarget ?? null,
        stackTeamId: stackTeamIdRaw,
        centerView:
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("centerView")
            : params.get("centerView"),
        centerArtifactId:
          typeof window !== "undefined"
            ? getCenterArtifactIdFromParams(new URLSearchParams(window.location.search))
            : getCenterArtifactIdFromParams(params),
        centerSourceId:
          typeof window !== "undefined"
            ? getCenterSourceIdFromParams(new URLSearchParams(window.location.search))
            : getCenterSourceIdFromParams(params),
        centerTemplateId:
          typeof window !== "undefined"
            ? getCenterTemplateIdFromParams(new URLSearchParams(window.location.search))
            : getCenterTemplateIdFromParams(params),
      })
      const closedActive = Boolean(activeTab && keys.includes(activeTab.key))
      const nextTab =
        keys.length === 1 ? closeCenterPaneTab(keys[0]!) : closeCenterPaneTabs(keys)
      if (closedActive) {
        if (nextTab) activateCenterPaneTab(nextTab)
        else clearCenterPaneUrlSelection()
      }
    },
    [
      activateCenterPaneTab,
      clearCenterPaneUrlSelection,
      closeCenterPaneTab,
      closeCenterPaneTabs,
      globalSearch?.selectedDetailTarget,
      isSuggestionSelected,
      params,
      selectedTaskId,
    ],
  )

  const handleCenterPaneCloseAllTabs = useCallback(() => {
    closeAllCenterPaneTabs()
    clearCenterPaneUrlSelection()
  }, [clearCenterPaneUrlSelection, closeAllCenterPaneTabs])

  const handleCenterPaneResolvedTitle = useCallback(
    (title: string) => {
      const trimmed = title.trim()
      if (!trimmed) return
      const stackTeamIdRaw =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("stackTeamId")
          : params.get("stackTeamId")
      const activeTab = resolveActiveCenterPaneTab({
        selectedTaskId,
        isSuggestion: isSuggestionSelected,
        selectedTaskTitle:
          (isSuggestionSelected
            ? (selectedSuggestionAsTask as any)?.title
            : (selectedTaskData as any)?.title) ?? null,
        selectedDetailTarget: globalSearch?.selectedDetailTarget ?? null,
        stackTeamId: stackTeamIdRaw,
        centerView:
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("centerView")
            : params.get("centerView"),
        centerArtifactId:
          typeof window !== "undefined"
            ? getCenterArtifactIdFromParams(new URLSearchParams(window.location.search))
            : getCenterArtifactIdFromParams(params),
        centerSourceId:
          typeof window !== "undefined"
            ? getCenterSourceIdFromParams(new URLSearchParams(window.location.search))
            : getCenterSourceIdFromParams(params),
        centerTemplateId:
          typeof window !== "undefined"
            ? getCenterTemplateIdFromParams(new URLSearchParams(window.location.search))
            : getCenterTemplateIdFromParams(params),
      })
      if (!activeTab) return
      updateCenterPaneTabTitle(activeTab.key, trimmed)
    },
    [
      globalSearch?.selectedDetailTarget,
      isSuggestionSelected,
      params,
      selectedSuggestionAsTask,
      selectedTaskData,
      selectedTaskId,
      updateCenterPaneTabTitle,
    ],
  )

  // Desktop: keep open-tab set in sync with the active middle-pane workspace view from URL.
  // Prefer URL over React selection state — otherwise moving a task to the right
  // (selectedTaskId still set via rightTaskId) re-upserts the tab in the middle strip.
  useEffect(() => {
    if (isMobile) return
    const liveParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(params.toString())
    const active = getActiveMiddleWorkspaceTab(liveParams)
    if (!active || active.type === "details") return
    upsertCenterPaneTab({
      kind: active.type as CenterPaneTabKind,
      id: active.id,
      title: active.title,
    })
  }, [isMobile, params, tasksShallowUrlEpoch, upsertCenterPaneTab])

  // Resolve placeholder labels for inactive tabs (detail pages only mount for the active tab).
  useResolveCenterPaneTabTitles(!isMobile)

  const handleDuplicateTask = useCallback((initialValues: any, options?: { onSuccess?: (task: any) => void | Promise<void> }) => {
    setDuplicateInitialValues(initialValues);
    setDuplicateOnSuccess(() => options?.onSuccess ?? null);
    setIsDuplicateTaskOpen(true);
  }, []);

  // Collapsed state for each panel
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isCenterCollapsed, setIsCenterCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);

  // Control whether the center pane is rendered at all
  const [shouldShowCenterPane, setShouldShowCenterPane] = useState(true);

  // Add state to control right pane visibility
  const [isRightPaneVisible, setIsRightPaneVisible] = useState(true);

  // Add local state for details panel collapsed state
  const [isDetailsCollapsed, setIsDetailsCollapsed] = useState(true);
  const [isTaskAiPaneOpen, setIsTaskAiPaneOpen] = useState(() => {
    const raw = params.get("taskAiOpen")
    // Default open unless the user explicitly closed it.
    return raw !== "false"
  })
  const [searchOpenedAiThreadId, setSearchOpenedAiThreadId] = useState<string | null>(null)
  const forceNewAiThread = params.get("newAiThread") === "true"
  const [taskDetailsPanePercent, setTaskDetailsPanePercent] = useState(58)
  const [activeFieldContext, setActiveFieldContext] = useState<AiActiveFieldContext>({
    fieldType: 'task',
    label: 'Task',
    instructions: null,
  })
  const [aiPaneContext, setAiPaneContext] = useState<{
    scope: "task" | "project" | "global";
    taskId?: number;
    projectId?: number;
  }>({ scope: "global" });
  const setAiPaneContextSafe = useCallback(
    (next: { scope: "task" | "project" | "global"; taskId?: number; projectId?: number }) => {
      setAiPaneContext((prev) => {
        const sameScope = prev.scope === next.scope
        const sameTask = (prev.taskId ?? null) === (next.taskId ?? null)
        const sameProject = (prev.projectId ?? null) === (next.projectId ?? null)
        return sameScope && sameTask && sameProject ? prev : next
      })
    },
    [],
  )
  const updateTaskAiOpenInUrl = useCallback((isOpen: boolean) => {
    if (isOpen) {
      // Default: AI opens in the right pane (established UX), via shared workspace API.
      const live =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams(params.toString())
      // AI already lives in left or middle — never steal it into the right pane
      // (that demotes left AI → Tasks and wipes the open thread host).
      // Absent leftPaneView = homepage left AI.
      const leftPaneView = live.get(LEFT_PANE_VIEW_PARAM)
      if (!leftPaneView || leftPaneView === "ai" || live.get("centerView") === "ai") {
        return
      }
      const existingThread = live.get("aiThreadId")
      openWorkspaceView(
        {
          type: "ai",
          aiThreadId: existingThread || undefined,
        },
        { pane: "right", pathname: effectivePathname, source: "task-ai-pane-open-change" },
      )
      // Preserve details+AI split focus when already in task-details focus context.
      if (isTaskDetailsFocusContext(live)) {
        const next = preserveTaskDetailsFocusWhenOpeningAi(
          new URLSearchParams(window.location.search),
        )
        shallowReplaceSearchParams(effectivePathname, next, "task-ai-pane-open-focus")
      }
      return
    }
    const newParams = new URLSearchParams(params.toString())
    const nextLayout = new Set((newParams.get('layout') || 'left,middle').split(',').filter(Boolean))
    nextLayout.add('right')
    newParams.set('layout', Array.from(nextLayout).join(','))
    // Persist explicit close so the default-open seed does not reopen the pane.
    newParams.set('taskAiOpen', 'false')
    newParams.delete('aiFocus')
    newParams.delete('aiThreadId')
    newParams.delete('chatMode')
    newParams.delete('chatPreFill')
    newParams.delete('chatComponentId')
    if (newParams.get('rightView') === 'ai') {
      newParams.set('rightView', 'details')
    }
    if (newParams.get("centerView") === "ai") {
      newParams.delete("centerView")
    }
    shallowReplaceSearchParams(effectivePathname, newParams, "task-ai-pane-open-change")
  }, [params, pathname, effectivePathname])

  const handleTaskAiPaneOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      setSearchOpenedAiThreadId(null)
    }
    if (isOpen) {
      const selectedId = selectedTaskId ? Number(selectedTaskId) : null
      // Open-pane task is ambient context only. New chats stay global unless the user
      // explicitly switches the AI pane to task/project scope.
      if (selectedId && Number.isFinite(selectedId)) {
        setAiPaneContextSafe({ scope: "global", taskId: selectedId })
      } else if (resolvedStandaloneAiProjectId) {
        setAiPaneContextSafe({ scope: "project", projectId: resolvedStandaloneAiProjectId })
      } else {
        setAiPaneContextSafe({ scope: "global" })
      }
    }
    setIsTaskAiPaneOpen(isOpen)
    updateTaskAiOpenInUrl(isOpen)
  }, [selectedTaskId, resolvedStandaloneAiProjectId, setAiPaneContextSafe, updateTaskAiOpenInUrl])

  const liveCenterView =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("centerView")
      : params.get("centerView")
  // Shallow URL updates bump this epoch so centerView is re-read without a full navigation.
  void tasksShallowUrlEpoch
  const liveCenterParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : params
  const isResearchCenterOpen =
    liveCenterView === RESEARCH_CENTER_VIEW ||
    liveCenterView === KEYWORD_RESEARCH_CENTER_VIEW ||
    liveCenterView === PROMPT_RESEARCH_CENTER_VIEW
  const isCreateCenterOpen = liveCenterView === CREATE_CENTER_VIEW
  const liveCreateType = getCreateCenterTypeFromParams(liveCenterParams)
  const liveResearchTab: ResearchTab = getResearchTabFromParams(liveCenterParams)
  const liveCenterArtifactId = getCenterArtifactIdFromParams(liveCenterParams)
  const liveCenterArtifactVersion = getArtifactVersionFromParams(liveCenterParams)
  const isArtifactCenterOpen = Boolean(liveCenterArtifactId)
  const liveCenterSourceId = getCenterSourceIdFromParams(liveCenterParams)
  const isSourceCenterOpen = Boolean(liveCenterSourceId)
  const liveCenterTemplateId = getCenterTemplateIdFromParams(liveCenterParams)
  const isTemplateCenterOpen = Boolean(liveCenterTemplateId)

  const openResearchCenterTab = useCallback(
    (options?: {
      query?: string | null
      tab?: ResearchTab | null
      forceOpen?: boolean
      pane?: "middle" | "right"
    }) => {
      const query = typeof options?.query === "string" ? options.query.trim() : ""
      const tab = options?.tab === "prompts" ? "prompts" : options?.tab === "keywords" ? "keywords" : null
      const forceOpen = options?.forceOpen === true || query.length > 0 || tab != null
      const pane = options?.pane ?? "middle"
      const baseParams =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams(params.toString())
      const currentView = baseParams.get("centerView")
      const isCurrentlyOpenInMiddle =
        currentView === RESEARCH_CENTER_VIEW ||
        currentView === KEYWORD_RESEARCH_CENTER_VIEW ||
        currentView === PROMPT_RESEARCH_CENTER_VIEW
      const isCurrentlyOpenInRight = baseParams.get("rightView") === "research"
      if (
        !forceOpen &&
        ((pane === "middle" && isCurrentlyOpenInMiddle) ||
          (pane === "right" && isCurrentlyOpenInRight))
      ) {
        if (pane === "middle") {
          handleCenterPaneTabClose(buildCenterPaneTabKey("research", RESEARCH_TAB_ID))
        }
        return
      }
      setSelectedTaskId(null)
      setSelectedTaskSeed(null)
      globalSearch?.closeDetailTarget()
      openWorkspaceView(
        {
          type: "research",
          title: "Research",
          params: {
            researchQuery: query || null,
            researchTab: tab ?? getResearchTabFromParams(baseParams),
          },
        },
        { pane, pathname: effectivePathname, source: "research-center-open" },
      )
    },
    [
      effectivePathname,
      globalSearch,
      handleCenterPaneTabClose,
      params,
      setSelectedTaskId,
      setSelectedTaskSeed,
    ],
  )

  // Sidebar Tools category → same handlers as the former header/toolbar buttons.
  useEffect(() => {
    const onToggleAi = () => {
      handleTaskAiPaneOpenChange(!isTaskAiPaneOpen)
    }
    const openResearchMobile = (query: string, tab: ResearchTab) => {
      setIsResearchOpen(true)
      const baseParams =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams(params.toString())
      baseParams.set(RESEARCH_TAB_PARAM, tab)
      if (query) baseParams.set(RESEARCH_QUERY_PARAM, query)
      shallowReplaceSearchParams(effectivePathname, baseParams, "research-seed")
    }
    const onToggleResearch = () => {
      if (isMobile) {
        setIsResearchOpen((open) => !open)
        return
      }
      openResearchCenterTab()
    }
    const onOpenResearch = (event: Event) => {
      const detail = (event as CustomEvent<{ query?: string | null; tab?: ResearchTab | null }>).detail
      const query = typeof detail?.query === "string" ? detail.query.trim() : ""
      const tab = detail?.tab === "prompts" ? "prompts" : "keywords"
      if (isMobile) {
        openResearchMobile(query, tab)
        return
      }
      openResearchCenterTab({ query, tab, forceOpen: true })
    }
    const onToggleKeyword = () => {
      if (isMobile) {
        setIsResearchOpen((open) => !open)
        return
      }
      openResearchCenterTab({ tab: "keywords" })
    }
    const onOpenKeyword = (event: Event) => {
      const detail = (event as CustomEvent<{ query?: string | null }>).detail
      const query = typeof detail?.query === "string" ? detail.query.trim() : ""
      if (isMobile) {
        openResearchMobile(query, "keywords")
        return
      }
      openResearchCenterTab({ query, tab: "keywords", forceOpen: true })
    }
    const onTogglePrompt = () => {
      if (isMobile) {
        setIsResearchOpen((open) => !open)
        return
      }
      openResearchCenterTab({ tab: "prompts" })
    }
    const onOpenPrompt = (event: Event) => {
      const detail = (event as CustomEvent<{ query?: string | null }>).detail
      const query = typeof detail?.query === "string" ? detail.query.trim() : ""
      if (isMobile) {
        openResearchMobile(query, "prompts")
        return
      }
      openResearchCenterTab({ query, tab: "prompts", forceOpen: true })
    }
    // Desktop create is owned by HeaderCreatePopupHost; mobile still needs this for sidebar "+".
    const onOpenCreate = (event: Event) => {
      if (!isMobile) return
      const detail = (event as CustomEvent<OpenHeaderCreateDetail>).detail
      const type = detail?.type
      if (!type || type === "ai") {
        const next = buildNewAiThreadParams(new URLSearchParams(params.toString()))
        next.delete("focus")
        setSearchOpenedAiThreadId(null)
        setAiPaneContextSafe({ scope: "global" })
        setIsTaskAiPaneOpen(true)
        shallowReplaceSearchParams(effectivePathname, next, "mobile-create-ai-thread")
        dispatchTasksShallowNavigation()
        return
      }
      setMobileCreateOpen(true)
    }
    window.addEventListener(TOGGLE_AI_PANE_EVENT, onToggleAi)
    window.addEventListener(OPEN_HEADER_CREATE_EVENT, onOpenCreate)
    window.addEventListener(TOGGLE_RESEARCH_EVENT, onToggleResearch)
    window.addEventListener(OPEN_RESEARCH_EVENT, onOpenResearch)
    window.addEventListener(TOGGLE_KEYWORD_RESEARCH_EVENT, onToggleKeyword)
    window.addEventListener(OPEN_KEYWORD_RESEARCH_EVENT, onOpenKeyword)
    window.addEventListener(TOGGLE_PROMPT_RESEARCH_EVENT, onTogglePrompt)
    window.addEventListener(OPEN_PROMPT_RESEARCH_EVENT, onOpenPrompt)
    return () => {
      window.removeEventListener(TOGGLE_AI_PANE_EVENT, onToggleAi)
      window.removeEventListener(OPEN_HEADER_CREATE_EVENT, onOpenCreate)
      window.removeEventListener(TOGGLE_RESEARCH_EVENT, onToggleResearch)
      window.removeEventListener(OPEN_RESEARCH_EVENT, onOpenResearch)
      window.removeEventListener(TOGGLE_KEYWORD_RESEARCH_EVENT, onToggleKeyword)
      window.removeEventListener(OPEN_KEYWORD_RESEARCH_EVENT, onOpenKeyword)
      window.removeEventListener(TOGGLE_PROMPT_RESEARCH_EVENT, onTogglePrompt)
      window.removeEventListener(OPEN_PROMPT_RESEARCH_EVENT, onOpenPrompt)
    }
  }, [
    effectivePathname,
    handleTaskAiPaneOpenChange,
    isMobile,
    isTaskAiPaneOpen,
    openResearchCenterTab,
    params,
    setAiPaneContextSafe,
  ])

  useEffect(() => {
    const open = isMobile ? isResearchOpen : isResearchCenterOpen
    window.dispatchEvent(
      new CustomEvent("app:research-state", {
        detail: { open },
      }),
    )
    window.dispatchEvent(
      new CustomEvent("app:keyword-research-state", {
        detail: { open },
      }),
    )
    window.dispatchEvent(
      new CustomEvent("app:prompt-research-state", {
        detail: { open },
      }),
    )
  }, [isResearchCenterOpen, isResearchOpen, isMobile, tasksShallowUrlEpoch])

  // AI pane open by default unless the user explicitly closed it (`taskAiOpen=false`).
  // Never steal focus from a first-class Browser/Publishing tab — Publish ▾ sets
  // rightView=browser while keeping taskAiOpen=true; overwriting that caused URL thrash
  // and cancelled remote browser provisioning mid-flight.
  // When AI is hosted in the middle or left pane, do not also seed the right pane.
  // Homepage: absent `leftPaneView` means left AI — same as `leftPaneView=ai`.
  useEffect(() => {
    const nextParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(params.toString())
    if (nextParams.get("taskAiOpen") === "false") return
    if (nextParams.get("centerView") === "ai") return
    const leftPaneView = nextParams.get(LEFT_PANE_VIEW_PARAM)
    if (!leftPaneView || leftPaneView === "ai") return
    const rightView = nextParams.get("rightView")
    // Progressive-open chooser / lists / entities already own the right pane.
    if (rightView && rightView !== "details" && rightView !== "ai") return
    if (nextParams.get("taskAiOpen") === "true" && (rightView === "ai" || rightView === "browser" || rightView === "publishing")) {
      return
    }
    const seeded = preserveTaskDetailsFocusWhenOpeningAi(nextParams)
    if (seeded.toString() === nextParams.toString()) {
      setIsTaskAiPaneOpen((prev) => (prev ? prev : true))
      return
    }
    shallowReplaceSearchParams(effectivePathname, seeded, "ai-pane-default-open")
    setIsTaskAiPaneOpen(true)
  }, [effectivePathname, params.toString(), shallowReplaceSearchParams, tasksShallowUrlEpoch])

  const handleConsumeForceNewAiThread = useCallback(() => {
    if (params.get("newAiThread") !== "true") return
    const nextParams = new URLSearchParams(params.toString())
    nextParams.delete("newAiThread")
    shallowReplaceSearchParams(effectivePathname, nextParams, "task-ai-consume-new-thread")
  }, [params, pathname])

  const handleMobileNewAiThreadClick = useCallback(() => {
    const next = buildNewAiThreadParams(new URLSearchParams(params.toString()))
    next.delete("focus")
    setSearchOpenedAiThreadId(null)
    setAiPaneContextSafe({ scope: "global" })
    setIsTaskAiPaneOpen(true)
    shallowReplaceSearchParams(effectivePathname, next, "mobile-create-ai-thread")
    dispatchTasksShallowNavigation()
  }, [params, effectivePathname, setAiPaneContextSafe])

  useEffect(() => {
    if (!globalSearch?.registerAiThreadOpener) return
    const openAiThreadFromSearch = (threadId: string) => {
      setSearchOpenedAiThreadId(threadId)
      setAiPaneContextSafe({ scope: "global" })
      setIsTaskAiPaneOpen(true)
      setIsRightPaneVisible(true)
      setCoreLayoutConfig((current) => ({
        ...current,
        layout: current.layout.includes('right') ? current.layout : [...current.layout, 'right'],
        rightView: 'ai',
      }))
      // Prefer the live address bar so shallow-only params are not dropped.
      const nextParams = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : params.toString(),
      )
      const nextLayout = new Set((nextParams.get('layout') || coreLayoutConfig.layout.join(',') || 'left,middle').split(',').filter(Boolean))
      nextLayout.add('right')
      nextParams.set('layout', Array.from(nextLayout).join(','))
      nextParams.set('rightView', 'ai')
      nextParams.set('taskAiOpen', 'true')
      nextParams.set('aiThreadId', threadId)
      shallowReplaceSearchParams(effectivePathname, nextParams, "task-ai-open-thread-from-search")
    }
    globalSearch.registerAiThreadOpener(openAiThreadFromSearch)
    return () => globalSearch.registerAiThreadOpener(null)
  }, [coreLayoutConfig.layout, globalSearch, params, pathname])

  // Consume the one-shot search opener once the address bar reflects it, so a stale
  // externalThreadId cannot steal selection after the user switches threads later.
  useEffect(() => {
    if (!searchOpenedAiThreadId) return
    const liveThreadId =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("aiThreadId")
        : params.get("aiThreadId")
    if (liveThreadId === searchOpenedAiThreadId) {
      setSearchOpenedAiThreadId(null)
    }
  }, [searchOpenedAiThreadId, params, tasksShallowUrlEpoch])

  const handleTaskDetailsAiDividerMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const container = e.currentTarget.parentElement
    if (!container) return
    const MIN_PERCENT = 35
    const MAX_PERCENT = 75
    const onMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      if (rect.width <= 0) return
      const rawPercent = ((event.clientX - rect.left) / rect.width) * 100
      const clamped = Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, rawPercent))
      setTaskDetailsPanePercent(clamped)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // Auto-expand details panel when a task is selected
  useEffect(() => {
    if (selectedTaskId) {
      setIsDetailsCollapsed(false);
      const urlWantsOpen = params.get('taskAiOpen')
      // During shallow URL sync, Next's `useSearchParams` can briefly lag and omit `taskAiOpen`.
      // Only apply explicit URL intents so we do not close an already-open AI pane.
      if (urlWantsOpen === 'true' || urlWantsOpen === 'false') {
        setIsTaskAiPaneOpen(urlWantsOpen === 'true')
      }
      setActiveFieldContext((prev) => {
        if (prev.fieldType === 'task' && prev.label === 'Task' && prev.instructions == null) {
          return prev
        }
        return {
          fieldType: 'task',
          label: 'Task',
          instructions: null,
        }
      })
    } else {
      setIsDetailsCollapsed(true);
    }
  }, [selectedTaskId, params.get('taskAiOpen')]);

  useEffect(() => {
    if (middleView === 'ai-build' && selectedTaskId) {
      handleTaskAiPaneOpenChange(true)
    }
  }, [middleView, selectedTaskId, handleTaskAiPaneOpenChange])

  useEffect(() => {
    const sourceParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(params.toString())
    const isAiFocus = isAiPaneFocusMode(sourceParams)
    const taskAiOpenRaw = sourceParams.get("taskAiOpen")
    const leftPaneView = sourceParams.get(LEFT_PANE_VIEW_PARAM)
    // Absent leftPaneView = homepage left AI; do not force the right AI flag on.
    const aiHostedElsewhere =
      sourceParams.get("centerView") === "ai" || !leftPaneView || leftPaneView === "ai"
    // Explicit close only. Missing/true keeps the right pane open when AI is not elsewhere.
    if (taskAiOpenRaw === "false") {
      setIsTaskAiPaneOpen((prev) => {
        const next = isAiFocus
        return prev === next ? prev : next
      })
      return
    }
    if (aiHostedElsewhere) {
      setIsTaskAiPaneOpen((prev) => (prev ? false : prev))
      return
    }
    setIsTaskAiPaneOpen((prev) => (prev ? prev : true))
  }, [params.toString(), tasksShallowUrlEpoch])

  useEffect(() => {
    const taskAiOpenParam = params.get('taskAiOpen')
    if (taskAiOpenParam !== 'true') return
    const centerTaskId = params.get('centerTaskId')
    const centerSuggestionId = params.get('centerSuggestionId')
    const rightTaskId = params.get('rightTaskId')
    const selectedId = params.get('id')
    const itemKind = params.get('itemKind')
    const nextTaskId = centerTaskId && Number.isFinite(Number(centerTaskId))
      ? Number(centerTaskId)
      : itemKind === 'suggestion' && centerSuggestionId && Number.isFinite(Number(centerSuggestionId))
      ? Number(centerSuggestionId)
      : rightTaskId && Number.isFinite(Number(rightTaskId))
      ? Number(rightTaskId)
      : selectedId && Number.isFinite(Number(selectedId))
        ? Number(selectedId)
        : null
    if (nextTaskId != null) {
      setAiPaneContextSafe({ scope: "task", taskId: nextTaskId })
      return
    }
    if (resolvedStandaloneAiProjectId) {
      setAiPaneContextSafe({ scope: "project", projectId: resolvedStandaloneAiProjectId })
      return
    }
    setAiPaneContextSafe({ scope: "global" })
  }, [
    params.get('taskAiOpen'),
    params.get('centerTaskId'),
    params.get('centerSuggestionId'),
    params.get('rightTaskId'),
    params.get('id'),
    params.get('itemKind'),
    resolvedStandaloneAiProjectId,
    setAiPaneContextSafe,
  ])

  // Show right pane based on layout configuration and selected task
  useEffect(() => {
    const live =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(params.toString())
    const leftPaneView = live.get(LEFT_PANE_VIEW_PARAM)
    const aiHostedElsewhere =
      live.get("centerView") === "ai" || !leftPaneView || leftPaneView === "ai"
    // Standalone right AI only when AI is not already hosted left/middle.
    const wantsStandaloneAi = !selectedTaskId && isTaskAiPaneOpen && !aiHostedElsewhere
    const hasRightPaneSelection = Boolean(
      rightTaskIdParam ||
      rightThreadIdParam ||
      rightProjectIdParam ||
      rightUserIdParam ||
      rightTeamIdParam,
    )
    const liveRightView = live.get("rightView")
    // start / lists / research / entities on the right must keep the pane visible
    // even without a selected task (progressive open → chooser).
    const hasRightWorkspaceView = Boolean(
      liveRightView && liveRightView !== "details",
    )
    const shouldShowRightPane =
      wantsStandaloneAi ||
      hasRightWorkspaceView ||
      (isRightVisible && (Boolean(selectedTaskId) || hasRightPaneSelection || Boolean(globalSearch?.selectedDetailTarget)));
    setIsRightPaneVisible((prev) => (prev === shouldShowRightPane ? prev : shouldShowRightPane))
  }, [
    globalSearch?.selectedDetailTarget,
    isRightVisible,
    selectedTaskId,
    coreLayoutConfig.layout,
    isTaskAiPaneOpen,
    rightTaskIdParam,
    rightThreadIdParam,
    rightProjectIdParam,
    rightUserIdParam,
    rightTeamIdParam,
    params.toString(),
    tasksShallowUrlEpoch,
  ]);

  // Mobile handlers — view change is defined after `applyViewState` (see below).
  const handleMobileTaskSelect = (task: any) => {
    const resolved = resolveSelectedRowKindAndId(task)
    if (!resolved.id || !Number.isFinite(resolved.id)) return
    setSelectedTaskSeed(task ?? null);
    setSelectedTaskId(String(resolved.id));
    // Open the mobile detail view (same flow as a normal task). Suggestions render the suggestion
    // detail via MobileTaskDetail mode="suggestion".
    setMobileTaskDetailOpen(true);
    // Build a single canonical query: clear all conflicting center/detail selection params, then set
    // the one that matches the clicked item. List/filter params (object, mode, groupBy, ...) are kept.
    const newParams = new URLSearchParams(params.toString());
    clearActiveCenterSelectionParams(newParams);
    if (resolved.kind === 'suggestion') {
      newParams.set('itemKind', 'suggestion')
      newParams.set('centerSuggestionId', String(resolved.id))
      newParams.delete('stackTeamId')
    } else {
      newParams.set('id', String(resolved.id));
    }
    newParams.delete('focusOutputs')
    router.push(`${effectivePathname}?${newParams.toString()}`, { scroll: false });
  };

  const handleMobileTaskDetailBack = () => {
    setMobileTaskDetailOpen(false);
    setSelectedTaskId(null);
    setSelectedTaskSeed(null);
    // Remove every center/detail selection param (incl. itemKind + centerSuggestionId) so the mobile
    // view returns to the task list while preserving list/filter params.
    const newParams = new URLSearchParams(params.toString());
    clearActiveCenterSelectionParams(newParams);
    router.push(`${effectivePathname}?${newParams.toString()}`, { scroll: false });
  };

  const handleMobileFilterClick = () => {
    setMobileFilterOpen(true);
  };

  const [splitViewState, setSplitViewState] = useState<TasksSplitViewState>(() =>
    parseTasksSplitViewState(new URLSearchParams(params.toString()))
  );
  const { ref: splitLayoutContainerRef, width: splitLayoutContainerWidth } =
    useElementWidth<HTMLDivElement>();

  useEffect(() => {
    // Keep URL as canonical source for deep links/back-forward and shallow toolbar writes.
    const sp =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(params.toString())
    const next = parseTasksSplitViewState(sp)
    setSplitViewState((prev) =>
      prev.isSplit === next.isSplit &&
      prev.splitOrientation === next.splitOrientation &&
      prev.primaryView === next.primaryView &&
      prev.secondaryView === next.secondaryView
        ? prev
        : next,
    )
  }, [params.toString(), tasksShallowUrlEpoch])

  useEffect(() => {
    if (isMobile || !splitViewState.isSplit) return;
    if (splitLayoutContainerWidth == null) return;

    const preferred = getPreferredSplitOrientation(splitLayoutContainerWidth);
    if (preferred === splitViewState.splitOrientation) return;

    setSplitViewState((prev) => {
      if (!prev.isSplit || prev.splitOrientation === preferred) return prev;
      const next: TasksSplitViewState = { ...prev, splitOrientation: preferred };
      const baseParams =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams(params.toString());
      const updatedParams = applyTasksSplitViewState(baseParams, next);
      shallowReplaceSearchParams(effectivePathname, updatedParams, "task-split-orientation-responsive");
      return next;
    });
  }, [
    isMobile,
    splitViewState.isSplit,
    splitViewState.splitOrientation,
    splitLayoutContainerWidth,
    effectivePathname,
    params,
  ]);

  useEffect(() => {
    const parseStandaloneProjectFromParams = (sp: URLSearchParams) => {
      const projectCandidates = [
        sp.get("project"),
        sp.get("projectId"),
      ]
        .filter(Boolean)
        .flatMap((value) => String(value).split(","))
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value))
      return projectCandidates[0] ?? null
    }

    const syncTasksRouteFromShallowUrl = () => {
      if (typeof window === "undefined") return
      const search = window.location.search
      // Avoid epoch thrash when multiple listeners handle the same event or a no-op write still
      // dispatched — only re-render subscribers when the address bar actually changed.
      if (shallowUrlSearchRef.current === search) {
        return
      }
      shallowUrlSearchRef.current = search
      setTasksShallowUrlEpoch((e) => e + 1)
      const sp = new URLSearchParams(search)

      syncFromUrl(sp)
      setSplitViewState((prev) => {
        const next = parseTasksSplitViewState(sp)
        return prev.isSplit === next.isSplit &&
          prev.splitOrientation === next.splitOrientation &&
          prev.primaryView === next.primaryView &&
          prev.secondaryView === next.secondaryView
          ? prev
          : next
      })

      const itemKind = sp.get("itemKind")
      const taskIdFromQuery =
        itemKind === "suggestion"
          ? (sp.get("centerSuggestionId") ?? null)
          : sp.get("centerTaskId") ??
            sp.get("rightTaskId") ??
            sp.get("id")
      if (taskIdFromQuery) {
        isClosingDetailsRef.current = false
        if (!selectedTaskId || String(selectedTaskId) !== String(taskIdFromQuery)) {
          setSelectedTaskId(taskIdFromQuery)
        }
      } else {
        isClosingDetailsRef.current = false
      }
      // Omit clearing selection when ?id= is absent: shallow updates (e.g. AI pane only) keep prior task in URL or intentionally omit id without closing details.

      const taskAiOpenRaw = sp.get("taskAiOpen")
      const leftPaneView = sp.get(LEFT_PANE_VIEW_PARAM)
      const aiHostedElsewhere =
        sp.get("centerView") === "ai" || !leftPaneView || leftPaneView === "ai"
      // Right-pane AI flag only; left/middle AI hosts must not keep this true.
      const nextAiOpen = taskAiOpenRaw !== "false" && !aiHostedElsewhere
      setIsTaskAiPaneOpen((prev) => (prev === nextAiOpen ? prev : nextAiOpen))
      if (taskAiOpenRaw === "false") return
      const selectedId = sp.get("id")
      if (selectedId && Number.isFinite(Number(selectedId))) {
        setAiPaneContextSafe({ scope: "task", taskId: Number(selectedId) })
        return
      }
      const standalonePid = parseStandaloneProjectFromParams(sp)
      if (standalonePid) {
        setAiPaneContextSafe({ scope: "project", projectId: standalonePid })
        return
      }
      setAiPaneContextSafe({ scope: "global" })
    }

    window.addEventListener(TASKS_SHALLOW_NAV_EVENT, syncTasksRouteFromShallowUrl as EventListener)
    return () => window.removeEventListener(TASKS_SHALLOW_NAV_EVENT, syncTasksRouteFromShallowUrl as EventListener)
  }, [syncFromUrl, selectedTaskId, setAiPaneContextSafe])

  const primaryView = splitViewState.primaryView;
  const secondaryView = splitViewState.secondaryView;
  const isSplitEnabled = splitViewState.isSplit;
  const splitOrientation = getEffectiveSplitOrientation({
    isMobile,
    isSplitEnabled,
    containerWidth: splitLayoutContainerWidth,
    storedOrientation: splitViewState.splitOrientation,
  });
  const topView = primaryView;
  const secondaryPaneView = isSplitEnabled ? secondaryView : null;
  const secondaryPane = splitOrientation === 'horizontal' ? 'right' : 'bottom';

  const showPlannerBulkChrome =
    isMultiselectMode &&
    (topView === 'calendar' ||
      topView === 'kanban' ||
      (!!secondaryPaneView && (secondaryPaneView === 'calendar' || secondaryPaneView === 'kanban')));

  const plannerBulkChrome =
    showPlannerBulkChrome ? (
      <>
        <BulkActionBar
          selectedCount={plannerBulkSelectedIds.size}
          onClearSelection={clearPlannerBulkSelection}
          entityName="task"
          actions={
            [
              {
                label: 'Delete',
                onClick: () => setPlannerBulkDeleteOpen(true),
                variant: 'destructive',
              },
            ] satisfies BulkAction[]
          }
        />
        <AlertDialog
          open={plannerBulkDeleteOpen}
          onOpenChange={(open) => {
            if (plannerBulkDeleting) return;
            setPlannerBulkDeleteOpen(open);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete tasks</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {plannerBulkSelectedIds.size} task
                {plannerBulkSelectedIds.size !== 1 ? 's' : ''}? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={plannerBulkDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={plannerBulkDeleting}
                className="bg-red-600 hover:bg-red-700"
                onClick={() => void handleConfirmPlannerBulkDelete()}
              >
                {plannerBulkDeleting ? 'Deleting…' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    ) : null;

  const applyViewState = useCallback(
    (patch: Partial<TasksSplitViewState>) => {
      setSplitViewState((prev) => {
        const next: TasksSplitViewState = {
          ...prev,
          ...patch,
        };
        if (next.isSplit && !prev.isSplit && !patch.splitOrientation) {
          next.splitOrientation = isMobile ? "vertical" : getPreferredSplitOrientation(splitLayoutContainerWidth);
        }
        next.secondaryView = normalizeSecondaryView(next.primaryView, next.secondaryView);
        const baseParams =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search)
            : new URLSearchParams(params.toString());
        const updatedParams = applyTasksSplitViewState(baseParams, next);
        shallowReplaceSearchParams(effectivePathname, updatedParams, "task-apply-view-state");
        setViewMode(next.primaryView as ViewMode);
        return next;
      });
    },
    [effectivePathname, isMobile, params.toString(), setViewMode, splitLayoutContainerWidth]
  );

  const handlePrimaryViewChange = useCallback(
    (view: MainViewMode) => {
      // Main selector should not force split mode.
      applyViewState({ primaryView: view, isSplit: false });
    },
    [applyViewState]
  );
  const exitTaskSplitScreen = useCallback(() => {
    setSplitViewState((prev) => {
      const baseParams =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams(params.toString())
      const nextParams = new URLSearchParams(baseParams.toString())
      nextParams.set("tasksView", prev.primaryView)
      nextParams.delete("split")
      nextParams.delete("splitView")
      nextParams.delete("rightSplitView")
      nextParams.delete("splitOrientation")
      nextParams.delete("leftView")
      nextParams.delete("topView")
      nextParams.delete("bottomView")
      const currentLayout = (baseParams.get("layout") || "").split(",").filter(Boolean)
      const layoutKey = currentLayout.join(",")
      if (layoutKey === "top,bottom" || layoutKey === "left,right") {
        const keepRight =
          nextParams.get("taskAiOpen") === "true" ||
          Boolean(nextParams.get("rightView") && nextParams.get("rightView") !== "details")
        nextParams.set("layout", keepRight ? "left,middle,right" : "left,middle")
      }
      shallowReplaceSearchParams(effectivePathname, nextParams, "task-split-exit")
      setViewMode(prev.primaryView as ViewMode)
      return {
        ...prev,
        isSplit: false,
      }
    })
  }, [effectivePathname, params.toString(), setViewMode])

  const handleMobileViewChange = useCallback(
    (view: MobileViewMode) => {
      setMobileView(view)
      setMiddleView(view)
      applyViewState({ primaryView: view, isSplit: isSplitEnabled })
    },
    [applyViewState, isSplitEnabled],
  )

  useEffect(() => {
    if (!isMobile) return
    setMobileView(primaryView)
    setMiddleView(primaryView)
  }, [isMobile, primaryView])

  const topCalendarToolbarRef = useRef<HTMLDivElement | null>(null);
  const bottomCalendarToolbarRef = useRef<HTMLDivElement | null>(null);
  const calOverflowSingle = useTasksOverflowMenuSlot();
  const calOverflowTop = useTasksOverflowMenuSlot();
  const calOverflowBottom = useTasksOverflowMenuSlot();
  const kanOverflowSingle = useTasksOverflowMenuSlot();
  const kanOverflowTop = useTasksOverflowMenuSlot();
  const kanOverflowBottom = useTasksOverflowMenuSlot();
  const inlineOptSingle = useTasksOverflowMenuSlot();
  const inlineOptTop = useTasksOverflowMenuSlot();
  const inlineOptBottom = useTasksOverflowMenuSlot();
  const [toolbarPlacementByPane, setToolbarPlacementByPane] = useState<Record<string, "inline" | "overflow">>({});
  const handleToolbarOptionalPlacement = useCallback((key: string, p: "inline" | "overflow") => {
    setToolbarPlacementByPane((prev) => (prev[key] === p ? prev : { ...prev, [key]: p }));
  }, []);

  const [toolbarFitByPane, setToolbarFitByPane] = useState<Record<string, TasksToolbarFitSnapshot>>({});
  const onPaneFitChange = useCallback((paneKey: string, fit: TasksToolbarFitSnapshot) => {
    setToolbarFitByPane((prev) => {
      const cur = prev[paneKey];
      if (
        cur &&
        cur.listOptionalVisible === fit.listOptionalVisible &&
        cur.kanbanInlineCount === fit.kanbanInlineCount &&
        cur.calendarInlineCount === fit.calendarInlineCount
      ) {
        return prev;
      }
      return { ...prev, [paneKey]: fit };
    });
  }, []);

  const overflowMenuFnsRef = useRef<Record<string, (() => React.ReactNode) | null>>({});
  const overflowMenuRegistrarsRef = useRef<Record<string, (fn: (() => React.ReactNode) | null) => void>>(
    {},
  );
  const [overflowMenuTick, setOverflowMenuTick] = useState(0);
  const getRegisterPaneOverflowMenu = useCallback((paneKey: string) => {
    if (!overflowMenuRegistrarsRef.current[paneKey]) {
      overflowMenuRegistrarsRef.current[paneKey] = (fn) => {
        const prevFn = overflowMenuFnsRef.current[paneKey];
        overflowMenuFnsRef.current[paneKey] = fn;
        if (prevFn !== fn) setOverflowMenuTick((t) => t + 1);
      };
    }
    return overflowMenuRegistrarsRef.current[paneKey];
  }, []);
  const [mainPanelPercent, setMainPanelPercent] = useState(34);
  const [detailsPanelPercent, setDetailsPanelPercent] = useState(33);
  const [aiPanelPercent, setAiPanelPercent] = useState(33);

  const handleExpandAiPane = useCallback(() => {
    const latestParams = getLatestSearchParams()
    const currentlyFocused = isAiPaneFocusMode(latestParams)
    const nextParams = buildAiPaneFocusParams(latestParams, !currentlyFocused)
    setHasMountedSplitLayout((prev) =>
      nextSplitLayoutMountStateOnToggle({
        isAiFocusModeEnabled: currentlyFocused,
        hasMountedSplitLayout: prev,
      })
    )
    shallowReplaceSearchParams(effectivePathname, nextParams, "task-ai-focus-toggle")
    // Collapse the app sidebar while focused so only the AI pane remains.
    if (!currentlyFocused) {
      if (effectiveSidebarCollapsed === false && typeof effectiveOnSidebarToggle === "function") {
        aiFocusCollapsedSidebarRef.current = true
        effectiveOnSidebarToggle()
      }
      const group = newLayoutDesktopPanelGroupRef.current
      if (group) {
        const layout = group.getLayout()
        if (layout.length >= 3 && !aiPaneExpandedLayoutBackupRef.current) {
          aiPaneExpandedLayoutBackupRef.current = [...layout]
        }
        group.setLayout([0, 0, 100])
        setMainPanelPercent(0)
        setDetailsPanelPercent(0)
        setAiPanelPercent(100)
      }
      if (detailsPaneExpandedLayoutBackupRef.current) {
        detailsPaneExpandedLayoutBackupRef.current = null
        setIsDetailsPaneExpandedMax(false)
      }
      setIsAiPaneExpandedMax(true)
      return
    }

    // Leaving focus: restore sidebar if we collapsed it for focus.
    if (aiFocusCollapsedSidebarRef.current && effectiveSidebarCollapsed === true && typeof effectiveOnSidebarToggle === "function") {
      aiFocusCollapsedSidebarRef.current = false
      effectiveOnSidebarToggle()
    } else {
      aiFocusCollapsedSidebarRef.current = false
    }

    const group = newLayoutDesktopPanelGroupRef.current
    const hadBackup = Boolean(aiPaneExpandedLayoutBackupRef.current)
    if (group && aiPaneExpandedLayoutBackupRef.current) {
      const restored = aiPaneExpandedLayoutBackupRef.current
      group.setLayout(restored)
      if (restored[0] != null) setMainPanelPercent(restored[0])
      if (restored[1] != null) setDetailsPanelPercent(restored[1])
      if (restored[2] != null) setAiPanelPercent(restored[2])
    }
    aiPaneExpandedLayoutBackupRef.current = null
    setIsAiPaneExpandedMax(false)
    if (group && !hadBackup) {
      const fallbackLayout = [34, 33, 33]
      group.setLayout(fallbackLayout)
      setMainPanelPercent(fallbackLayout[0])
      setDetailsPanelPercent(fallbackLayout[1])
      setAiPanelPercent(fallbackLayout[2])
    }
  }, [effectiveOnSidebarToggle, effectivePathname, effectiveSidebarCollapsed, getLatestSearchParams])

  const handleExpandDetailsPane = useCallback(() => {
    const latestParams = getLatestSearchParams()
    const currentlyFocused = isMiddlePaneFocusMode(latestParams)
    const nextParams = buildMiddlePaneFocusParams(latestParams, !currentlyFocused)
    if (currentlyFocused) {
      const group = newLayoutDesktopPanelGroupRef.current
      if (group && detailsPaneExpandedLayoutBackupRef.current) {
        const restored = detailsPaneExpandedLayoutBackupRef.current
        group.setLayout(restored)
        if (restored[0] != null) setMainPanelPercent(restored[0])
        if (restored[1] != null) setDetailsPanelPercent(restored[1])
        if (restored[2] != null) setAiPanelPercent(restored[2])
      }
      detailsPaneExpandedLayoutBackupRef.current = null
      setIsDetailsPaneExpandedMax(false)
    } else {
      const group = newLayoutDesktopPanelGroupRef.current
      if (group && !detailsPaneExpandedLayoutBackupRef.current) {
        const layout = group.getLayout()
        if (layout.length >= 3) {
          detailsPaneExpandedLayoutBackupRef.current = [...layout]
        }
      }
      setIsDetailsPaneExpandedMax(true)
      setIsAiPaneExpandedMax(false)
      aiPaneExpandedLayoutBackupRef.current = null
      if (group) {
        group.setLayout([0, 100, 0])
        setMainPanelPercent(0)
        setDetailsPanelPercent(100)
        setAiPanelPercent(0)
      }
    }
    shallowReplaceSearchParams(effectivePathname, nextParams, "middle-pane-focus-toggle")
  }, [effectivePathname, getLatestSearchParams])

  const handleExpandRightPane = useCallback(() => {
    const latestParams = getLatestSearchParams()
    const rightView = latestParams.get("rightView")
    const isEntityOrBrowser =
      isRightViewEntityType(rightView) ||
      rightView === "browser" ||
      rightView === "publishing"
    // AI already has a dedicated shareable focus mode.
    if (!isEntityOrBrowser) {
      handleExpandAiPane()
      return
    }
    const currentlyFocused =
      latestParams.get("layout") === "right" && !isAiPaneFocusMode(latestParams)
    const nextParams = new URLSearchParams(latestParams.toString())
    if (currentlyFocused) {
      nextParams.set("layout", "left,middle,right")
      const group = newLayoutDesktopPanelGroupRef.current
      if (group && aiPaneExpandedLayoutBackupRef.current) {
        const restored = aiPaneExpandedLayoutBackupRef.current
        group.setLayout(restored)
        if (restored[0] != null) setMainPanelPercent(restored[0])
        if (restored[1] != null) setDetailsPanelPercent(restored[1])
        if (restored[2] != null) setAiPanelPercent(restored[2])
      }
      aiPaneExpandedLayoutBackupRef.current = null
      setIsAiPaneExpandedMax(false)
    } else {
      nextParams.set("layout", "right")
      nextParams.delete("focus")
      nextParams.delete("aiFocus")
      const group = newLayoutDesktopPanelGroupRef.current
      if (group) {
        const layout = group.getLayout()
        if (layout.length >= 3 && !aiPaneExpandedLayoutBackupRef.current) {
          aiPaneExpandedLayoutBackupRef.current = [...layout]
        }
        group.setLayout([0, 0, 100])
        setMainPanelPercent(0)
        setDetailsPanelPercent(0)
        setAiPanelPercent(100)
      }
      if (detailsPaneExpandedLayoutBackupRef.current) {
        detailsPaneExpandedLayoutBackupRef.current = null
        setIsDetailsPaneExpandedMax(false)
      }
      setIsAiPaneExpandedMax(true)
    }
    shallowReplaceSearchParams(effectivePathname, nextParams, "right-pane-focus-toggle")
  }, [effectivePathname, getLatestSearchParams, handleExpandAiPane])

  const handleCloseRightPane = useCallback(() => {
    const nextParams = new URLSearchParams(getLatestSearchParams().toString())
    // Fully hide the right column — do not fall back to another entity/AI tab.
    nextParams.set("taskAiOpen", "false")
    nextParams.delete("aiFocus")
    nextParams.delete("chatMode")
    nextParams.delete("chatPreFill")
    nextParams.delete("chatComponentId")
    nextParams.delete("newAiThread")
    nextParams.delete("rightView")
    nextParams.delete("rightTaskId")
    nextParams.delete("rightProjectId")
    nextParams.delete("rightUserId")
    nextParams.delete("rightTeamId")
    nextParams.delete("rightThreadId")
    nextParams.delete("rightMentionId")
    nextParams.delete("rightTab")
    nextParams.delete("rightArtifactId")
    nextParams.delete("rightSourceId")
    nextParams.delete("rightSuggestionId")
    nextParams.delete("browserTabId")
    nextParams.delete("publicationRunId")
    const layout = new Set((nextParams.get("layout") || "left,middle").split(",").filter(Boolean))
    layout.delete("right")
    if (layout.size === 0) layout.add("left")
    nextParams.set("layout", Array.from(layout).join(","))
    setIsTaskAiPaneOpen(false)
    setIsAiPaneExpandedMax(false)
    aiPaneExpandedLayoutBackupRef.current = null
    // Drop non-AI right tabs so a residual entity tab cannot reopen the pane.
    const rightTabs = useRightPaneTabsStore.getState().tabs
    for (const tab of rightTabs) {
      if (tab.kind !== "ai") closeRightPaneTab(tab.key)
    }
    setRightPaneActiveKey(AI_RIGHT_TAB_KEY)
    shallowReplaceSearchParams(effectivePathname, nextParams, "right-pane-close")
  }, [closeRightPaneTab, effectivePathname, getLatestSearchParams, setRightPaneActiveKey])

  // Sync mobile task detail state with URL
  useEffect(() => {
    if (isMobile && selectedTaskId) {
      setMobileTaskDetailOpen(true);
    } else if (isMobile && !selectedTaskId) {
      setMobileTaskDetailOpen(false);
    }
  }, [isMobile, selectedTaskId]);



  // Helper: pill button style
  const pillButton =
    'inline-flex h-7 items-center gap-1 rounded-full border border-gray-300 px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition';
  // Helper: collapse button style
  const collapseButton =
    'inline-flex items-center justify-center w-6 h-6 text-gray-500 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-blue-400';
  // Helper: expand/restore button style
  const expandButton =
    'inline-flex items-center justify-center w-6 h-6 text-gray-500 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-blue-400 ml-auto';

  // CSS class helpers for pane states (disabled - using imperative resizing instead)
  function getPaneClass(pane: 'left' | 'middle' | 'right') {
    // These classes don't exist in CSS, so return empty to avoid conflicts
    // Panel sizing is handled imperatively via refs
    return '';
  }

  // Read focus flags from the live window URL — shallowReplaceSearchParams does not
  // update Next.js useSearchParams, so params.toString() would miss aiFocus.
  void tasksShallowUrlEpoch
  const liveFocusParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams(params.toString())
  const isAiFocusModeEnabled = isAiPaneFocusMode(liveFocusParams)
  const isDetailsFocusModeEnabled = isMiddlePaneFocusMode(liveFocusParams)
  const isTaskDetailsAiSplitModeEnabled = isTaskDetailsAiSplitMode(liveFocusParams)
  const isRightPaneSoloLayout =
    liveFocusParams.get("layout") === "right" && !isAiFocusModeEnabled
  const isLeftPaneHiddenInDesktopSplit =
    isAiFocusModeEnabled || isDetailsFocusModeEnabled || isTaskDetailsAiSplitModeEnabled || isRightPaneSoloLayout
  useEffect(() => {
    if (!isAiFocusModeEnabled) {
      setHasMountedSplitLayout(true)
      return
    }
    // Deep-link / restored focus: keep sidebar collapsed while solo AI is on.
    if (effectiveSidebarCollapsed === false && typeof effectiveOnSidebarToggle === "function") {
      aiFocusCollapsedSidebarRef.current = true
      effectiveOnSidebarToggle()
    }
  }, [effectiveOnSidebarToggle, effectiveSidebarCollapsed, isAiFocusModeEnabled])
  useEffect(() => {
    if (!isAiFocusModeEnabled && !isRightPaneSoloLayout) return
    const group = newLayoutDesktopPanelGroupRef.current
    if (!group) return
    const current = group.getLayout()
    if (current.length < 3) return
    if (current[0] === 0 && current[1] === 0 && current[2] === 100) return
    group.setLayout([0, 0, 100])
    setMainPanelPercent(0)
    setDetailsPanelPercent(0)
    setAiPanelPercent(100)
  }, [isAiFocusModeEnabled, isRightPaneSoloLayout])
  useEffect(() => {
    if (!isDetailsFocusModeEnabled) return
    const group = newLayoutDesktopPanelGroupRef.current
    if (!group) return
    const current = group.getLayout()
    if (current.length < 3) return
    if (!detailsPaneExpandedLayoutBackupRef.current) {
      detailsPaneExpandedLayoutBackupRef.current = [...current]
    }
    if (current[0] === 0 && current[1] === 100 && current[2] === 0) return
    group.setLayout([0, 100, 0])
    setMainPanelPercent(0)
    setDetailsPanelPercent(100)
    setAiPanelPercent(0)
    setIsDetailsPaneExpandedMax(true)
  }, [isDetailsFocusModeEnabled])
  useEffect(() => {
    if (!isTaskDetailsAiSplitModeEnabled) return
    const group = newLayoutDesktopPanelGroupRef.current
    if (!group) return
    const current = group.getLayout()
    if (current.length < 3) return
    if (!detailsPaneExpandedLayoutBackupRef.current) {
      detailsPaneExpandedLayoutBackupRef.current = [...current]
    }
    const nextDetails = Math.max(35, Math.min(75, detailsPanelPercent || 55))
    const nextAi = 100 - nextDetails
    const nearlyEqual = (a: number, b: number) => Math.abs(a - b) < 0.5
    if (
      nearlyEqual(current[0] ?? -1, 0) &&
      nearlyEqual(current[1] ?? -1, nextDetails) &&
      nearlyEqual(current[2] ?? -1, nextAi)
    ) {
      return
    }
    group.setLayout([0, nextDetails, nextAi])
    setMainPanelPercent(0)
    setDetailsPanelPercent(nextDetails)
    setAiPanelPercent(nextAi)
    setIsDetailsPaneExpandedMax(true)
    setIsAiPaneExpandedMax(false)
    // Intentionally omit detailsPanelPercent: onResize already updates it; depending on it
    // re-enters setLayout and can infinite-loop on float drift from the panel group.
  }, [isTaskDetailsAiSplitModeEnabled])
  useEffect(() => {
    if (isDetailsFocusModeEnabled || !isDetailsPaneExpandedMax) return
    const group = newLayoutDesktopPanelGroupRef.current
    if (!group) {
      setIsDetailsPaneExpandedMax(false)
      detailsPaneExpandedLayoutBackupRef.current = null
      return
    }
    if (detailsPaneExpandedLayoutBackupRef.current) {
      const restored = detailsPaneExpandedLayoutBackupRef.current
      group.setLayout(restored)
      if (restored[0] != null) setMainPanelPercent(restored[0])
      if (restored[1] != null) setDetailsPanelPercent(restored[1])
      if (restored[2] != null) setAiPanelPercent(restored[2])
    }
    detailsPaneExpandedLayoutBackupRef.current = null
    setIsDetailsPaneExpandedMax(false)
  }, [isDetailsFocusModeEnabled, isDetailsPaneExpandedMax])

  // Keep the right-pane tab store in sync with entity workspace views (pane-neutral).
  // Must run before any early return so hook order stays stable across loading → ready.
  useEffect(() => {
    const live =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(params.toString())
    const active = getActiveRightWorkspaceTab(live)
    if (!active) return
    if (active.type === "ai" || active.type === "browser" || active.type === "details") return
    upsertRightPaneTab({
      kind: active.type,
      id: active.id,
      title: active.title,
      activate: true,
    })
  }, [params, tasksShallowUrlEpoch, upsertRightPaneTab])

  // Guard: If not hydrated and synced, show loading spinner (but do not return early before hooks)
  let shouldShowLoading = !isHydratedAndSynced;

  // NOTE: Global search (?q=) URL sync is now handled in app/tasks/layout.tsx,
  // which keeps the TaskHeaderBar input, Zustand searchValue, and URL in sync.

  // Layout system handles its own URL sync, no need for old view sync

  if (shouldShowLoading) {
    // eslint-disable-next-line no-console
    return (
      <div className="flex items-center justify-center h-full w-full text-gray-400">Loading…</div>
    );
  }

  const currentFocusParam =
    typeof window !== "undefined"
      ? (() => {
          void tasksShallowUrlEpoch
          return new URLSearchParams(window.location.search).get("focus")
        })()
      : params.get("focus")
  const focusedPane: 'top' | 'bottom' | null =
    currentFocusParam === 'bottom'
      ? 'bottom'
      : currentFocusParam === 'left' || currentFocusParam === 'main'
      ? 'top'
      : null;
  const isGlobalSearchFullResults = Boolean(globalSearch?.isFullResultsMode);

  const setFocusInUrl = (nextFocus: 'top' | 'bottom' | null) => {
    const next = new URLSearchParams(params.toString());
    if (!nextFocus) next.delete('focus');
    else next.set('focus', nextFocus === 'top' ? 'left' : 'bottom');
    router.replace(`${effectivePathname}?${next.toString()}`, { scroll: false });
  };

  const getBadgeHelpers = () => {
    return getActiveFilterBadges(
      filters,
      setFilters,
      router,
      pathname,
      new URLSearchParams(params.toString()),
      mergedListFilterOptions
    );
  };

  const getFilterOptionsForToolbar = (): FilterOptions | undefined => mergedListFilterOptions;

  const renderPaneToolbar = (
    view: MainViewMode,
    pane: 'single' | 'top' | 'bottom' | 'right',
    compactMode?: 'mobile-split-bottom',
    options?: { forceTaskRoute?: boolean },
  ) => {
    const isFocused = focusedPane === (pane === 'bottom' || pane === 'right' ? 'bottom' : 'top');
    const calendarSlot = pickPaneOverflowSlot(pane, calOverflowSingle, calOverflowTop, calOverflowBottom);
    const kanbanSlot = pickPaneOverflowSlot(pane, kanOverflowSingle, kanOverflowTop, kanOverflowBottom);
    const inlineOpt = pickPaneOverflowSlot(pane, inlineOptSingle, inlineOptTop, inlineOptBottom);
    const paneFitKey = `${view}-${pane}`;
    void overflowMenuTick;
    const paneOverflowFn = overflowMenuFnsRef.current[paneFitKey] ?? null;
    const isDiscoveryAllTab = Boolean(
      isRootGlobalShellMode &&
      isGlobalSearchFullResults &&
      globalSearch?.isDiscoveryMode &&
      globalSearch?.activeResultTab === 'all' &&
      pane !== 'bottom' &&
      pane !== 'right',
    )
    const isTasksRoute = options?.forceTaskRoute === true || isLeftObjectTasks

    return (
      <TasksPaneToolbar
        compactMode={compactMode}
        minimalMode={isDiscoveryAllTab}
        isTaskRoute={isTasksRoute}
        leftObject={leftObject}
        onLeftObjectSelect={navigateToLeftObject}
        view={view}
        pane={pane}
        paneFitKey={paneFitKey}
        paneOverflowMenuContent={paneOverflowFn}
        onPaneFitChange={onPaneFitChange}
        pillButton={pillButton}
        primaryView={primaryView}
        isFocused={isFocused}
        setFocusInUrl={setFocusInUrl}
        handlePrimaryViewChange={handlePrimaryViewChange}
        applyViewState={applyViewState}
        isSplitEnabled={isSplitEnabled}
        onExitSplit={exitTaskSplitScreen}
        topCalendarToolbarRef={topCalendarToolbarRef}
        bottomCalendarToolbarRef={bottomCalendarToolbarRef}
        calendarSlot={calendarSlot}
        kanbanSlot={kanbanSlot}
        inlineOptionalSlot={inlineOpt}
        editFields={editFields}
        filterOptions={getFilterOptionsForToolbar()}
        filters={filters}
        setFilters={setFilters}
        router={router}
        pathname={pathname}
        params={params}
        isMultiselectMode={isMultiselectMode}
        setIsMultiselectMode={setIsMultiselectMode}
        handleToggleMultiselect={handleToggleMultiselect}
        isInlineSearchOpen={isInlineSearchOpen}
        setIsInlineSearchOpen={setIsInlineSearchOpen}
        inlineSearchValue={inlineSearchValue}
        setInlineSearchValue={setInlineSearchValue}
        setSearchValue={setSearchValue}
        shallowReplaceUrl={shallowReplaceUrl}
        onOptionalPlacementChange={handleToolbarOptionalPlacement}
        plannerVisibility={plannerVisibility}
        setPlannerVisibility={setPlannerVisibility}
        onOpenNextPane={
          (pane === "single" || pane === "top") && openNextPaneFromListRef.current.show
            ? () => openNextPaneFromListRef.current.run()
            : undefined
        }
        openNextPaneLabel="Open middle pane"
        hideObjectSwitcher
        hidePaneChrome
      />
    );
  };

  // Mobile layout (Sidebar overlay is rendered by layout.tsx)
  if (isMobile) {
    // URL-derived detail selection for non-task objects (project/user/team/mention). Tasks &
    // suggestions keep their dedicated MobileTaskDetail path below; `selectedDetailTarget` is only
    // ever a non-task entity (see readDetailTargetFromSearchParams), so guarding on `!selectedTaskId`
    // keeps a task open over a stacked detail target from being clobbered.
    const mobileObjectDetailTarget =
      !selectedTaskId && globalSearch?.selectedDetailTarget ? globalSearch.selectedDetailTarget : null
    const mobileTaskSplitActive =
      isLeftObjectTasks &&
      isSplitEnabled &&
      Boolean(secondaryPaneView) &&
      !mobileTaskDetailOpen &&
      !mobileObjectDetailTarget
    const mobileSplitPlannerViews: MainViewMode[] = []
    if (primaryView === "calendar" || primaryView === "kanban") {
      mobileSplitPlannerViews.push(primaryView)
    }
    if (
      mobileTaskSplitActive &&
      secondaryPaneView &&
      secondaryPaneView !== primaryView &&
      (secondaryPaneView === "calendar" || secondaryPaneView === "kanban") &&
      !mobileSplitPlannerViews.includes(secondaryPaneView)
    ) {
      mobileSplitPlannerViews.push(secondaryPaneView)
    }
    const mobileSharedSubtasksOn = mobileSplitPlannerViews.some((view) =>
      view === "calendar"
        ? params.get("calendar_show_subtasks") === "true"
        : params.get("kanban_show_subtasks") === "true",
    )
    const handleToggleMobileSharedSubtasks = () => {
      const nextShow = !mobileSharedSubtasksOn
      const next = new URLSearchParams(params.toString())
      if (mobileSplitPlannerViews.includes("calendar")) {
        next.set("calendar_show_subtasks", String(nextShow))
      }
      if (mobileSplitPlannerViews.includes("kanban")) {
        next.set("kanban_show_subtasks", String(nextShow))
      }
      shallowReplaceUrl(`${effectivePathname}?${next.toString()}`)
      dispatchTasksShallowNavigation()
    }
    const renderMobileTasksPane = (view: MobileViewMode, splitBottom = false) => (
      <MobileTasksPaneContent
        variant={splitBottom ? "split-bottom" : "default"}
        view={view}
        toolbarPaneKey={splitBottom ? `${view}-bottom` : undefined}
        registerPaneOverflowMenu={
          splitBottom ? getRegisterPaneOverflowMenu(`${view}-bottom`) : undefined
        }
        taskList={
          <MemoizedTaskList
            onTaskSelect={handleMobileTaskSelect}
            selectedTaskId={selectedTaskId !== undefined && selectedTaskId !== null ? String(selectedTaskId) : undefined}
            editFields={memoizedEditFields}
            isMultiselectMode={isMultiselectMode}
            onToggleMultiselect={handleToggleMultiselect}
          />
        }
        searchValue={searchValue}
        setSearchValue={setSearchValue}
        selectedTaskId={selectedTaskId}
        selectedTaskData={selectedTaskData}
        onTaskSelect={handleMobileTaskSelect}
        onTaskUpdate={onTaskUpdate}
      />
    )
    return (
      <div className="flex h-dvh min-h-0 w-full flex-col bg-white">
        {/* Mobile Content */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {mobileObjectDetailTarget ? (
            <div className="h-full overflow-auto">
              <GlobalSearchDetailsPane
                target={mobileObjectDetailTarget}
                paneId="middle"
                onClose={handleCloseDetails}
                onOpenTask={(taskId: number) => handleTaskSelect({ id: taskId })}
                onOpenTaskKeepingDetail={handleOpenTaskKeepingDetailContext}
                onOpenTeamKeepingDetail={handleOpenTeamKeepingDetailContext}
                onOpenProject={handleOpenProjectSelect}
                onResolvedTitle={handleCenterPaneResolvedTitle}
              />
            </div>
          ) : isLeftObjectTasks && mobileTaskDetailOpen && (isSuggestionDetailSelection ? !!selectedTaskId : !!selectedTaskData) ? (
            <MobileTaskDetail
              task={isSuggestionDetailSelection ? (selectedSuggestionAsTask as any) : selectedTaskData}
              mode={isSuggestionDetailSelection ? "suggestion" : "task"}
              onBack={handleMobileTaskDetailBack}
              onTaskUpdate={onTaskUpdate}
              onAddSubtask={onAddSubtask}
            />
          ) : (
            <div className="h-full flex flex-col">
                                                                  {/* Mobile Task List Header */}
                         <div className="flex items-center justify-between p-4 bg-white">
                           <div className="flex items-center gap-1">
                             <button
                               onClick={effectiveOnSidebarToggle}
                               className="inline-flex items-center justify-center w-8 h-8 text-gray-600 hover:bg-gray-100 rounded-md transition"
                               aria-label="Toggle sidebar"
                             >
                               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                               </svg>
                             </button>
                             <button
                               type="button"
                               onClick={() => setMobileCreateOpen(true)}
                               className="inline-flex items-center justify-center w-8 h-8 text-gray-600 hover:bg-gray-100 rounded-md transition"
                               aria-label="Create"
                             >
                               <Plus className="w-5 h-5" />
                             </button>
                           </div>
                           
                           {/* Object heading/switcher — stays in the same position across object types.
                               View mode, group by, filters, AI suggestions, etc. live in the "..." drawer
                               so they never crowd the header. */}
                           <div className="flex min-w-0 flex-1 items-baseline justify-center gap-2 px-2">
                             <LeftObjectSwitcher
                               value={leftObject}
                              onChange={navigateToLeftObject}
                               className="h-7 px-2.5 text-xs font-normal"
                               forceCompact
                             />
                           </div>

                          <MobileGlobalHeaderActions
                            onOpenAiPane={() => handleTaskAiPaneOpenChange(true)}
                            onOpenKeywordResearch={() => setIsResearchOpen(true)}
                            onOpenMoreOptions={() => setMobileOptionsOpen(true)}
                            isKeywordResearchOpen={isResearchOpen}
                          />
                         </div>

                           {/* Mobile global search — reuses the exact desktop GlobalSearchBox (same q/committed
                               state, preview results, and result selection) for every object type. On tasks,
                               the inline filter icon opens the same Filter Tasks sheet as "..." > Filters;
                               other view/group controls stay in the options drawer. */}
                           {globalSearch ? (
                           <div className="px-4 py-3 bg-white">
                             <GlobalSearchBox
                               searchValue={globalSearch.committedQuery}
                               onSearchChange={globalSearch.setDraftQuery}
                               onSearchCommit={(value) => globalSearch.commitSearch({ nextQuery: value })}
                               onClearSearch={globalSearch.clearSearch}
                               isSearchOpen={globalSearch.isOpen}
                               onSearchOpenChange={globalSearch.setIsOpen}
                               selectedTypeFilters={globalSearch.pendingSelectedTypes}
                               onToggleTypeFilter={globalSearch.togglePendingTypeFilter}
                               onPreviewResultSelect={globalSearch.openSearchResult}
                               onShowAll={globalSearch.handleShowAll}
                               onFilterClick={
                                 isLeftObjectTasks
                                   ? () => {
                                       globalSearch.setIsOpen(false)
                                       handleMobileFilterClick()
                                     }
                                   : undefined
                               }
                               enableShortcut={false}
                               placeholder="Search all"
                             />
                           </div>
                           ) : null}

                           {/* Active filter badges (controls themselves now live in the "..." drawer to keep
                               the header title stable and avoid duplicating toolbar controls in the header). */}
                           {isLeftObjectTasks && mobileView === 'list' && (
                             (() => {
                               const { badges, onClearAll } = getActiveFilterBadges(
                                 filters,
                                 setFilters,
                                 router,
                                 pathname,
                                 new URLSearchParams(params.toString()),
                                 mergedListFilterOptions
                               );
                               if (badges.length === 0) return null;
                               return (
                                 <FilterBadges
                                   badges={badges}
                                   onClearAll={onClearAll}
                                   className="mt-1 mb-2 px-4 shrink-0"
                                 />
                               );
                             })()
                           )}

              {/* Mobile View Content — `object` URL param is the source of truth. `all` renders the desktop
                  mixed-results pane (so it never falls back to the AI-chats tab/empty state); other non-task
                  objects render the shared per-entity full-results pane. */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {!isLeftObjectTasks ? (
                  <div className="h-full min-h-0 overflow-hidden">
                    {globalSearch ? (
                      <GlobalSearchFullResultsPane
                        query={globalSearch.committedQuery}
                        activeTab={leftObjectSearchTab}
                        viewScope={effectiveObjectRoute}
                        onResultSelect={globalSearch.openSearchResult}
                        getQueryKey={globalSearch.getFullResultsQueryKey}
                        fetchPage={globalSearch.fetchFullResultsPage}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-4 text-xs text-gray-500">
                        Unable to load {leftPaneObjectLabel(leftObject).toLowerCase()}.
                      </div>
                    )}
                  </div>
                ) : mobileTaskSplitActive && secondaryPaneView ? (
                  <MobileVerticalSplitLayout
                    className="min-h-0 flex-1"
                    initialTopPercent={mobileSplitTopPercentRef.current}
                    onTopPercentChange={(topPercent) => {
                      mobileSplitTopPercentRef.current = topPercent
                    }}
                    top={renderMobileTasksPane(primaryView as MobileViewMode)}
                    bottom={
                      <div key={secondaryPaneView} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        {renderMobileTasksPane(secondaryPaneView as MobileViewMode, true)}
                      </div>
                    }
                  />
                ) : (
                  renderMobileTasksPane(mobileView)
                )}
              </div>
            </div>
          )}
        </div>

        {/* AI pane — full-screen overlay on mobile. Reuses the same AiPane component and AI thread
            URL/state (rightView/taskAiOpen/aiThreadId) so context is preserved behind the sheet. */}
        <MobileFullScreenSheet
          open={isTaskAiPaneOpen}
          onOpenChange={(open) => {
            if (!open) handleTaskAiPaneOpenChange(false)
          }}
          ariaLabel="AI Assistant"
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-hidden">
              <AiPane
                isOpen={true}
                onClose={() => handleTaskAiPaneOpenChange(false)}
                initialScope={aiPaneContext.scope}
                taskId={aiPaneContext.taskId}
                projectId={aiPaneContext.scope === "project" ? aiPaneContext.projectId : undefined}
                inline={true}
                activeFieldContext={activeFieldContext}
                externalThreadId={searchOpenedAiThreadId}
                forceNewThread={forceNewAiThread}
                onForceNewThreadConsumed={handleConsumeForceNewAiThread}
              />
            </div>
          </div>
        </MobileFullScreenSheet>

        <MobileCreateDrawer
          isOpen={mobileCreateOpen}
          onClose={() => setMobileCreateOpen(false)}
          onNewAiThreadClick={handleMobileNewAiThreadClick}
        />

        {/* Research — unified Keywords + Prompts tool. */}
        {isResearchOpen && (
          <ResearchPane
            isOpen={isResearchOpen}
            onClose={() => setIsResearchOpen(false)}
          />
        )}

        {/* Mobile Modals - Filter only (Add Task uses composer tray) */}
        {mobileFilterOpen && (
          <ResizableBottomSheet
            isOpen={mobileFilterOpen}
            onClose={() => setMobileFilterOpen(false)}
            initialHeight={0.9}
            minHeight={0.5}
            maxHeight={0.95}
            title="Filter Tasks"
          >
            {mobileFilterOpen && (
              <div className="h-full flex flex-col">
                <TaskFilters
                  isOpen={mobileFilterOpen}
                  onClose={() => setMobileFilterOpen(false)}
                  onApplyFilters={(mappedFilters: TaskFiltersType) => {
                    setFilters(mappedFilters);
                    setMobileFilterOpen(false);
                  }}
                  activeFilters={filters}
                  filterOptions={mergedListFilterOptions}
                  noWrapper={true}
                  commitFilters={commitFilters}
                />
              </div>
            )}
          </ResizableBottomSheet>
        )}

        {/* Mobile object options "..." drawer — surfaces the same desktop toolbar controls
            (view mode, group by, filters, AI suggestions, date field, multiselect) for the active object. */}
        <MobileObjectOptionsDrawer
          isOpen={mobileOptionsOpen}
          onClose={() => setMobileOptionsOpen(false)}
          object={leftObject}
          mobileView={mobileView}
          onViewChange={handleMobileViewChange}
          isMobileSplitActive={mobileTaskSplitActive}
          secondaryPaneView={secondaryPaneView as MainViewMode | null}
          onExitSplit={mobileTaskSplitActive ? exitTaskSplitScreen : undefined}
          splitOverflowMenuContent={
            mobileTaskSplitActive && secondaryPaneView
              ? () => overflowMenuFnsRef.current[`${secondaryPaneView}-bottom`]?.() ?? null
              : null
          }
          splitOverflowVersion={overflowMenuTick}
          editFields={editFields}
          filterOptions={mergedListFilterOptions}
          filters={filters}
          setFilters={setFilters as (filters: unknown) => void}
          onOpenAllFilters={handleMobileFilterClick}
          pillButton={pillButton}
          router={router}
          pathname={pathname}
          params={new URLSearchParams(params.toString())}
          dateField={params.get("calendar_date_field") === "publication" ? "publication" : "delivery"}
          onDateFieldChange={(field) => {
            const next = new URLSearchParams(params.toString())
            next.set("calendar_date_field", field)
            shallowReplaceUrl(`${effectivePathname}?${next.toString()}`)
            dispatchTasksShallowNavigation()
          }}
          showSubtasks={mobileSharedSubtasksOn}
          onToggleSubtasks={
            mobileTaskSplitActive && mobileSplitPlannerViews.length > 0
              ? handleToggleMobileSharedSubtasks
              : undefined
          }
          isMultiselectMode={isMultiselectMode}
          onToggleMultiselect={handleToggleMultiselect}
          primaryView={primaryView}
          onSplitView={(view) =>
            applyViewState({ isSplit: true, secondaryView: view, splitOrientation: "vertical" })
          }
          mentionsTab={mentionsTab}
          onMentionsTabChange={handleMentionsTabChange}
        />
      </div>
    );
  }

  const hasTaskData = Boolean(selectedTaskId || selectedTask)
  const hasGlobalResults = Boolean(
    (globalSearch?.allTabSections?.length ?? 0) > 0 || globalSearch?.isFullResultsMode,
  )
  console.log("[left pane render]", {
    effectivePathname,
    q: effectiveQuery,
    renderMode,
    isTasksMode,
    hasTaskData,
    hasGlobalResults,
  })
  const hasCenterPaneSelectionFromParams = Boolean(
    params.get("centerTaskId") ||
      params.get("centerProjectId") ||
      params.get("centerUserId") ||
      params.get("centerTeamId") ||
      params.get("centerThreadId") ||
      params.get("centerArtifactId") ||
      params.get("centerSourceId") ||
      params.get("centerTemplateId") ||
      params.get("centerView") === RESEARCH_CENTER_VIEW ||
      params.get("centerView") === KEYWORD_RESEARCH_CENTER_VIEW ||
      params.get("centerView") === PROMPT_RESEARCH_CENTER_VIEW ||
      params.get("centerView") === CREATE_CENTER_VIEW ||
      params.get("centerView") === "task-list" ||
      params.get("centerView") === "tasks" ||
      isArtifactCenterOpen ||
      isSourceCenterOpen ||
      isTemplateCenterOpen ||
      isCreateCenterOpen ||
      (typeof window !== "undefined" &&
        (() => {
          const view = new URLSearchParams(window.location.search).get("centerView")
          return (
            view === RESEARCH_CENTER_VIEW ||
            view === KEYWORD_RESEARCH_CENTER_VIEW ||
            view === PROMPT_RESEARCH_CENTER_VIEW ||
            view === CREATE_CENTER_VIEW ||
            view === "task-list" ||
            view === "tasks"
          )
        })()),
  )
  const rightViewParamResolved = params.get("rightView")
  const taskAiOpenParamResolved = params.get("taskAiOpen")
  const liveSearchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams(params.toString())
  const showBrowserPanelFromUrl = isBrowserPaneOpen(liveSearchParams)
  const hasOpenBrowserTabs = rightPaneTabs.some((tab) => tab.kind === "browser")
  const activeMiddleWorkspaceTab = getActiveMiddleWorkspaceTab(liveSearchParams)
  const activeRightWorkspaceTab = getActiveRightWorkspaceTab(liveSearchParams)
  const activeLeftWorkspaceTab = getActiveLeftWorkspaceTab(liveSearchParams)
  const isLeftListWorkspaceView =
    !!activeLeftWorkspaceTab && isListWorkspaceViewType(activeLeftWorkspaceTab.type)
  const isAiInMiddle = activeMiddleWorkspaceTab?.type === "ai"
  const isBrowserInMiddle = activeMiddleWorkspaceTab?.type === "browser"
  const isTaskListInMiddle = activeMiddleWorkspaceTab?.type === "task-list"
  const isListInMiddle =
    !!activeMiddleWorkspaceTab && isListWorkspaceViewType(activeMiddleWorkspaceTab.type)
  const isAiInLeft = activeLeftWorkspaceTab?.type === "ai"
  const isBrowserInLeft = activeLeftWorkspaceTab?.type === "browser"
  const isAiInRight = activeRightWorkspaceTab?.type === "ai"
  const isBrowserInRight =
    activeRightWorkspaceTab?.type === "browser" || showBrowserPanelFromUrl
  const isEntityInRight =
    !!activeRightWorkspaceTab &&
    activeRightWorkspaceTab.type !== "ai" &&
    activeRightWorkspaceTab.type !== "browser" &&
    activeRightWorkspaceTab.type !== "details"
  const showAiPanelFromUrl =
    (rightViewParamResolved === "ai" && taskAiOpenParamResolved === "true") ||
    isAiInMiddle
  // Shallow URL updates do not refresh Next's useSearchParams — read live location
  // (same pattern as stackTeamId) so Preferences/Teams open without a full RSC navigation.
  void tasksShallowUrlEpoch
  const isSettingsOpen =
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("settings")
      : params.get("settings")) === "open"
  const closeSettings = () => {
    mergeWorkspaceUrlState(
      { settings: null, settingsCategory: null },
      { source: "settings-close", mode: "replace" },
    )
  }
  const hasTaskSelectionInUrlParams = Boolean(
    params.get("id") || params.get("centerTaskId")
  )
  // Any resolved middle tab (task, thread/new-message, AI, list, start, …) must show
  // the middle pane — including after shallow URL writes that Next `params` lag behind.
  const showDetailsPanel =
    (!!activeMiddleWorkspaceTab ||
      isThreadChatRequested ||
      isDetailsFocusModeEnabled ||
      isTaskDetailsAiSplitModeEnabled ||
      !!selectedTaskId ||
      !!globalSearch?.selectedDetailTarget ||
      hasCenterPaneSelectionFromParams ||
      hasTaskSelectionInUrlParams ||
      isResearchCenterOpen ||
      isCreateCenterOpen ||
      isArtifactCenterOpen ||
      isSourceCenterOpen ||
      isTemplateCenterOpen ||
      isAiInMiddle ||
      isBrowserInMiddle ||
      isListInMiddle) &&
    !focusedPane;
  // Browser / AI are first-class workspace views — may live in either pane.
  const showBrowserPanel =
    (isBrowserInRight || (hasOpenBrowserTabs && !isBrowserInMiddle && !isBrowserInLeft)) && !focusedPane
  const showAiPanel =
    (isAiInRight ||
      ((isTaskAiPaneOpen || showAiPanelFromUrl || isAiFocusModeEnabled) &&
        !isAiInMiddle &&
        !isAiInLeft)) &&
    !focusedPane &&
    !isDetailsFocusModeEnabled
  const showPublishingPanel = showBrowserPanel
  const showRightToolPanel =
    showBrowserPanel || showAiPanel || isEntityInRight
  // Progressive open-next: left opens middle; middle opens right; all three → no icon.
  openNextPaneFromListRef.current = {
    show: !showDetailsPanel,
    run: () => {
      openWorkspaceView(
        { type: "start", title: "New" },
        { pane: "middle", source: "left-open-middle-pane" },
      )
    },
  }
  const activeRightPaneKind: WorkspaceViewType = (() => {
    if (activeRightWorkspaceTab?.type) return activeRightWorkspaceTab.type
    if (rightPaneActiveKey === DETAILS_RIGHT_TAB_KEY) return "details"
    if (rightPaneActiveKey?.startsWith("ai:") && showAiPanel) return "ai"
    if (rightPaneActiveKey?.startsWith("browser:") && showBrowserPanel) return "browser"
    if (showBrowserPanelFromUrl && showBrowserPanel) return "browser"
    if (showAiPanel) return "ai"
    if (showBrowserPanel) return "browser"
    return "ai"
  })()
  const aiPaneFocusChrome = getAiPaneFocusLayoutChrome({
    isAiFocusModeEnabled: isAiFocusModeEnabled || isDetailsFocusModeEnabled,
    isTaskDetailsAiSplitMode: isTaskDetailsAiSplitModeEnabled,
    showDetailsPanel,
    showAiPanel: showRightToolPanel,
  })

  const renderPaneContent = (
    view: MainViewMode,
    pane: 'single' | 'top' | 'bottom' | 'right',
    options?: { forceTasks?: boolean },
  ) => {
    const { badges, onClearAll } = getBadgeHelpers();
    const filterRow = (
      <FilterBadges badges={badges} onClearAll={onClearAll} className="mt-1 mb-2 shrink-0 px-4" />
    );
    const searchChipRow = (
      <ActiveSearchChip
        query={effectiveQuery}
        onClear={clearActiveSearchQuery}
        className={OBJECT_PANE_CHIP_ROW_CLASS}
      />
    )
    const inlineOpt = pickPaneOverflowSlot(pane, inlineOptSingle, inlineOptTop, inlineOptBottom);
    const paneKey = `${view}-${pane}`;
    const tasksToolbarOptionalPlacement = toolbarPlacementByPane[paneKey] ?? 'inline';
    const showTasksList = options?.forceTasks === true || isLeftObjectTasks

    if (view === 'list') {
      const renderLeftPaneObjectList = () => {
        console.log("[left-pane] rendering", leftObject);
        if (showTasksList) {
          return (
            <MemoizedTaskList
              onTaskSelect={handleTaskSelect}
              selectedTaskId={selectedTaskId !== undefined && selectedTaskId !== null ? String(selectedTaskId) : undefined}
              editFields={memoizedEditFields}
              isMultiselectMode={isMultiselectMode}
              onToggleMultiselect={handleToggleMultiselect}
            />
          );
        }
        switch (leftObject) {
          case "projects":
          case "users":
          case "mentions":
          case "ai_chats":
          case "artifacts":
            return globalSearch ? (
              <GlobalSearchFullResultsPane
                query={globalSearch.committedQuery}
                activeTab={leftObjectSearchTab}
                viewScope={effectiveObjectRoute}
                onResultSelect={globalSearch.openSearchResult}
                getQueryKey={globalSearch.getFullResultsQueryKey}
                fetchPage={globalSearch.fetchFullResultsPage}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-4 text-xs text-gray-500">
                Unable to load {leftPaneObjectLabel(leftObject).toLowerCase()}.
              </div>
            );
          default:
            return (
              <MemoizedTaskList
                onTaskSelect={handleTaskSelect}
                selectedTaskId={selectedTaskId !== undefined && selectedTaskId !== null ? String(selectedTaskId) : undefined}
                editFields={memoizedEditFields}
                isMultiselectMode={isMultiselectMode}
                onToggleMultiselect={handleToggleMultiselect}
              />
            );
        }
      };
      return (
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          {showTasksList ? filterRow : null}
          {searchChipRow}
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {renderLeftPaneObjectList()}
          </div>
        </div>
      );
    }

    if (view === 'kanban') {
      return (
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          {filterRow}
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <KanbanView
              searchValue={searchValue}
              filters={filters}
              selectedTaskId={selectedTaskId}
              onTaskSelect={handleTaskSelect}
              onOptimisticUpdate={onTaskUpdate}
              enabled={true}
              hideToolbar={true}
              toolbarContainerRef={undefined}
              inlineOptionalToolbarRef={inlineOpt.containerRef}
              inlineOptionalToolbarSlotVersion={inlineOpt.slotVersion}
              tasksToolbarOptionalPlacement={tasksToolbarOptionalPlacement}
              toolbarPaneKey={paneKey}
              registerPaneOverflowMenu={getRegisterPaneOverflowMenu(paneKey)}
              isMultiselectMode={isMultiselectMode}
              bulkSelectedTaskKey={plannerBulkSelectedKey}
              onKanbanBulkTaskToggle={togglePlannerBulkTask}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        {filterRow}
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <CalendarView
            onTaskClick={handleTaskSelect}
            selectedTaskId={selectedTaskId != null ? String(selectedTaskId) : undefined}
            selectedTask={selectedTask ? normalizeTask(selectedTask) : null}
            searchValue={searchValue}
            onOptimisticUpdate={onTaskUpdate}
            enabled={true}
            hideToolbar={true}
            hideViewToggle={true}
            toolbarMode="today-only"
            toolbarContainerRef={pane === 'bottom' ? bottomCalendarToolbarRef : topCalendarToolbarRef}
            inlineOptionalToolbarRef={inlineOpt.containerRef}
            inlineOptionalToolbarSlotVersion={inlineOpt.slotVersion}
            tasksToolbarOptionalPlacement={tasksToolbarOptionalPlacement}
            toolbarPaneKey={paneKey}
            registerPaneOverflowMenu={getRegisterPaneOverflowMenu(paneKey)}
            isMultiselectMode={isMultiselectMode}
            bulkSelectedTaskIds={plannerBulkSelectedIds}
            onCalendarBulkTaskToggle={togglePlannerBulkTask}
          />
        </div>
      </div>
    );
  };

  const renderMainSurface = () => {
    if (isRootGlobalShellMode) {
      if (!globalSearch) {
        return (
          <div className="flex h-full min-h-0 flex-col">
            {renderPaneToolbar(topView, 'single')}
            <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-sm text-gray-500">
              Unable to load global search.
            </div>
          </div>
        )
      }
      const rootActiveTab = globalSearch.activeResultTab === "task" ? "all" : globalSearch.activeResultTab
      if (rootActiveTab === 'all') {
        return (
          <div className="flex h-full min-h-0 flex-col">
            {renderPaneToolbar(topView, 'single')}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ActiveSearchChip
                query={effectiveQuery}
                onClear={clearActiveSearchQuery}
                className={OBJECT_PANE_CHIP_ROW_CLASS}
              />
              <div className="min-h-0 flex-1 overflow-hidden">
                <GlobalSearchAllTabPane
                  sections={globalSearch.allTabSections}
                  viewScope={effectiveObjectRoute}
                  visibleEntityTypes={globalSearch.visibleEntityTypes}
                  isLoading={globalSearch.isAllTabLoading}
                  sectionCounts={globalSearch.allTabCounts}
                  isDiscoveryMode={globalSearch.isDiscoveryMode}
                  hasCommittedTypeFilter={globalSearch.committedSelectedTypes.length > 0}
                  onResultSelect={globalSearch.openSearchResult}
                  onShowMore={globalSearch.handleAllTabShowMore}
                  onSeeMoreTasks={globalSearch.handleHomeTasksSeeMore}
                />
              </div>
            </div>
          </div>
        )
      }

      return (
        <div className="flex h-full min-h-0 flex-col">
          {renderPaneToolbar(topView, 'single')}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ActiveSearchChip
              query={effectiveQuery}
              onClear={clearActiveSearchQuery}
              className={OBJECT_PANE_CHIP_ROW_CLASS}
            />
            <div className="min-h-0 flex-1 overflow-hidden">
              <GlobalSearchFullResultsPane
                query={globalSearch.committedQuery}
                activeTab={rootActiveTab}
                viewScope={effectiveObjectRoute}
                onResultSelect={globalSearch.openSearchResult}
                getQueryKey={globalSearch.getFullResultsQueryKey}
                fetchPage={globalSearch.fetchFullResultsPage}
              />
            </div>
          </div>
        </div>
      )
    }

    // Mentions / projects / users / ai chats / artifacts: always show the object list.
    // Never fall through to tasksView calendar/kanban (that was swapping the left pane on mention open).
    if (!isLeftObjectTasks) {
      // Prefer the inline draft so filtering is instant while typing (no URL/RPC round-trip).
      const objectListQuery = isInlineSearchOpen ? inlineSearchValue : ""
      return (
        <div className="flex h-full min-h-0 flex-col">
          {renderPaneToolbar("list", "single")}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-hidden">
              {globalSearch ? (
                <GlobalSearchFullResultsPane
                  query={objectListQuery}
                  activeTab={leftObjectSearchTab}
                  viewScope={effectiveObjectRoute}
                  onResultSelect={globalSearch.openSearchResult}
                  getQueryKey={globalSearch.getFullResultsQueryKey}
                  fetchPage={globalSearch.fetchFullResultsPage}
                />
              ) : (
                <div className="flex h-full items-center justify-center px-4 text-xs text-gray-500">
                  Unable to load {leftPaneObjectLabel(leftObject).toLowerCase()}.
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div ref={splitLayoutContainerRef} className="flex h-full min-h-0 flex-col">
        {plannerBulkChrome}
        <PanelGroup
          key={splitOrientation}
          direction={splitOrientation === 'horizontal' ? "horizontal" : "vertical"}
          className="min-h-0 flex-1"
          autoSaveId={null}
        >
        <Panel defaultSize={55} minSize={20} className="min-h-0">
          <div className="flex flex-col h-full min-h-0">
            {renderPaneToolbar(topView, 'top')}
            <div className="flex-1 min-h-0 overflow-hidden">{renderPaneContent(topView, 'top')}</div>
          </div>
        </Panel>
        {isSplitEnabled && secondaryPaneView ? (
          <>
            <PanelResizeHandle
              className={cn(
                "relative bg-transparent transition-colors",
                splitOrientation === 'horizontal'
                  ? "w-3 -mx-1.5 cursor-col-resize"
                  : "h-3 -my-1.5 cursor-row-resize",
              )}
            >
              {splitOrientation === 'horizontal' ? (
                <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200" />
              ) : (
                <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gray-200" />
              )}
            </PanelResizeHandle>
            <Panel defaultSize={45} minSize={20} className="min-h-0">
              <div className="flex flex-col h-full min-h-0">
                {renderPaneToolbar(secondaryPaneView, secondaryPane)}
                <div
                  key={`${secondaryPane}-${secondaryPaneView}`}
                  className="flex-1 min-h-0 overflow-hidden"
                >
                  {renderPaneContent(secondaryPaneView, secondaryPane)}
                </div>
              </div>
            </Panel>
          </>
        ) : null}
      </PanelGroup>
      </div>
    );
  };

  const selectedDetailTarget = globalSearch?.selectedDetailTarget
  // Read stackTeamId from the live URL so the stacked team reacts to shallow history updates
  // (history.replaceState does not refresh Next's useSearchParams). tasksShallowUrlEpoch bumps on
  // TASKS_SHALLOW_NAV_EVENT, forcing this render to re-read window.location.
  void tasksShallowUrlEpoch
  const stackTeamIdRaw =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("stackTeamId")
      : params.get("stackTeamId")
  const parsedStackTeamId = Number(stackTeamIdRaw)
  const hasValidStackTeam =
    Number.isFinite(parsedStackTeamId) && parsedStackTeamId > 0
  const isUserDetailStack = selectedDetailTarget?.entityType === "user"
  const taskDetailStackBack =
    isUserDetailStack && selectedTaskId ? handleDetailStackBackFromTask : undefined

  // AI + browser content are pane-neutral — defined before either pane so both can mount them.
  const aiPane = (
    <AiPane
      isOpen={true}
      onClose={() => handleTaskAiPaneOpenChange(false)}
      onExpand={handleExpandAiPane}
      isExpanded={isAiFocusModeEnabled}
      initialScope={aiPaneContext.scope}
      taskId={aiPaneContext.taskId}
      projectId={aiPaneContext.scope === "project" ? aiPaneContext.projectId : undefined}
      inline={true}
      // One AI tab strip only: peer pane chrome owns thread tabs whenever AI is hosted.
      hideOuterTabStrip={isAiInMiddle || isAiInLeft || Boolean(showAiPanel && !isAiInMiddle && !isAiInLeft)}
      activeFieldContext={activeFieldContext}
      externalThreadId={searchOpenedAiThreadId}
      forceNewThread={forceNewAiThread}
      onForceNewThreadConsumed={handleConsumeForceNewAiThread}
      isActiveWorkspaceView={isAiInMiddle || isAiInLeft || isAiInRight || showAiPanelFromUrl}
    />
  )

  const livePublicationRunId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("publicationRunId")
      : params.get("publicationRunId")
  const liveBrowserTabId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("browserTabId")
      : params.get("browserTabId")
  const publishingArtifactId =
    liveCenterArtifactId ||
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("centerArtifactId")
      : params.get("centerArtifactId"))

  const activeBrowserTab =
    rightPaneTabs.find((tab) => tab.key === `browser:${liveBrowserTabId}`) ||
    rightPaneTabs.find((tab) => tab.key === rightPaneActiveKey && tab.kind === "browser") ||
    findBrowserTabForPublication(rightPaneTabs, { publicationRunId: livePublicationRunId }) ||
    rightPaneTabs.find((tab) => tab.kind === "browser") ||
    null

  const handleBrowserSessionFromPublish = (session: {
    destinationId: string
    destinationName: string
    liveViewUrl: string | null
    sessionId?: string | null
    publicationRunId?: string | null
    connectMessage?: string | null
    phase?: string | null
    artifactId?: string | null
  }) => {
    const artifactId = session.artifactId ?? publishingArtifactId
    const existing = findBrowserTabForPublication(rightPaneTabs, {
      publicationRunId: session.publicationRunId,
      destinationId: session.destinationId,
      artifactId,
    })
    const id =
      existing?.key.replace(/^browser:/, "") ||
      liveBrowserTabId ||
      (artifactId && session.destinationId
        ? `pub-${artifactId.slice(0, 8)}-${session.destinationId.slice(0, 8)}`
        : artifactId
          ? `pub-artifact-${artifactId}`
          : `pub-dest-${session.destinationId}`)
    if (artifactId) {
      for (const tab of rightPaneTabs) {
        if (
          tab.kind === "browser" &&
          tab.key !== `browser:${id}` &&
          tab.browser?.artifactId === artifactId &&
          !tab.browser?.publicationRunId
        ) {
          closeRightPaneTab(tab.key)
        }
      }
    }
    const key = upsertRightPaneTab({
      kind: "browser",
      id,
      title: session.destinationName || existing?.title || "Browser",
      browser: {
        destinationId: session.destinationId,
        destinationName: session.destinationName,
        liveViewUrl: session.liveViewUrl,
        sessionId: session.sessionId ?? null,
        publicationRunId: session.publicationRunId ?? null,
        connectMessage: session.connectMessage ?? null,
        phase: session.phase ?? null,
        artifactId,
        intentionallyStopped: false,
      },
      activate: true,
    })
    const next = buildOpenBrowserPaneParams(new URLSearchParams(window.location.search), {
      browserTabId: key.replace(/^browser:/, ""),
      publicationRunId: session.publicationRunId ?? livePublicationRunId,
      artifactId,
      keepAiOpen: true,
    })
    shallowReplaceSearchParams(effectivePathname, next, "browser-session-sync")
  }

  const browserContent = (() => {
    const browser = activeBrowserTab?.browser
    const phase = browser?.phase ?? null
    if (phase === "add_destination") {
      return (
        <PublishingPane
          artifactId={browser?.artifactId ?? publishingArtifactId}
          publicationRunId={browser?.publicationRunId ?? livePublicationRunId}
          initialStep="create"
          onPublicationRunIdChange={(runId) => {
            const next = setPublicationRunIdInBrowserParams(
              new URLSearchParams(window.location.search),
              runId,
              activeBrowserTab?.key.replace(/^browser:/, "") ?? liveBrowserTabId,
            )
            shallowReplaceSearchParams(effectivePathname, next, "publishing-run-id")
          }}
          onBrowserSession={handleBrowserSessionFromPublish}
          onClose={() => {
            if (activeBrowserTab) closeRightPaneTab(activeBrowserTab.key)
            const next = buildCloseBrowserPaneParams(new URLSearchParams(window.location.search))
            shallowReplaceSearchParams(effectivePathname, next, "browser-close")
          }}
        />
      )
    }
    if (!activeBrowserTab) return null
    return (
      <BrowserSessionPane
        title={activeBrowserTab.title}
        tabId={activeBrowserTab.key.replace(/^browser:/, "")}
        browser={browser ?? {}}
        onBrowserChange={(patch) => {
          const titleFromPage =
            typeof patch.pageTitle === "string" && patch.pageTitle.trim()
              ? patch.pageTitle.trim()
              : undefined
          updateRightPaneTab(activeBrowserTab.key, {
            browser: patch,
            ...(titleFromPage ? { title: titleFromPage } : {}),
          })
        }}
        onClose={() => {
          const associations = activeBrowserTab.browser
          if (
            associations?.provider === "articulate_desktop" ||
            associations?.provider === "browser_use_local" ||
            associations?.bridgeSessionId
          ) {
            void import("../../lib/open-browser-session").then(({ stopOpenedBrowserSession }) =>
              stopOpenedBrowserSession({
                provider: associations.provider,
                bridgeSessionId: associations.bridgeSessionId ?? associations.sessionId,
                browserId: associations.browserId,
              }),
            )
          }
          const nextKey = closeRightPaneTab(activeBrowserTab.key)
          const next = buildCloseBrowserPaneParams(new URLSearchParams(window.location.search))
          if (nextKey?.startsWith("browser:")) {
            next.set("rightView", "browser")
            next.set("browserTabId", nextKey.replace(/^browser:/, ""))
          }
          shallowReplaceSearchParams(effectivePathname, next, "browser-tab-close")
        }}
      />
    )
  })()

  const middlePaneStripTabs = (() => {
    const nonAiCenter = toPaneTabStripItems(
      centerPaneTabs.filter((tab) => tab.kind !== "ai"),
    )
    if (!isAiInMiddle) return nonAiCenter
    // When AI is hosted in middle, surface AiPane thread tabs on the outer strip
    // (same pattern as the right pane) — never nest AiPane's own strip underneath.
    const aiItems = aiChromeTabs.map((tab) => ({
      key: buildAiRightTabKey(tab.id),
      label: tab.title?.trim() || "New chat",
    }))
    return [...nonAiCenter, ...aiItems]
  })()
  const middlePaneActiveKey = (() => {
    if (isAiInMiddle && aiChromeActiveId) return buildAiRightTabKey(aiChromeActiveId)
    // Prefer URL-resolved workspace tab so list views (user-list, project-list, …) stay active.
    if (activeMiddleWorkspaceTab?.key) return activeMiddleWorkspaceTab.key
    return (
      resolveActiveCenterPaneTab({
        selectedTaskId,
        isSuggestion: isSuggestionSelected,
        selectedTaskTitle:
          (isSuggestionSelected
            ? (selectedSuggestionAsTask as any)?.title
            : (selectedTaskData as any)?.title) ?? null,
        selectedDetailTarget: selectedDetailTarget ?? null,
        stackTeamId: stackTeamIdRaw,
        centerView:
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("centerView")
            : params.get("centerView"),
        centerArtifactId: liveCenterArtifactId,
        centerSourceId: liveCenterSourceId,
        centerTemplateId: liveCenterTemplateId,
        aiThreadId:
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("aiThreadId")
            : params.get("aiThreadId"),
        browserTabId:
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("browserTabId")
            : params.get("browserTabId"),
      })?.key ?? null
    )
  })()

  const detailsPane = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <CenterPaneTabBar
        tabs={middlePaneStripTabs}
        activeKey={middlePaneActiveKey}
        onSelect={(key) => {
          if (key.startsWith("ai:")) {
            aiChromeHandlers?.selectThread(key.slice(3))
            return
          }
          handleCenterPaneTabSelect(key)
        }}
        onClose={(keyOrKeys) => {
          const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys]
          const aiKeys = keys.filter((key) => key.startsWith("ai:"))
          const otherKeys = keys.filter((key) => !key.startsWith("ai:"))
          for (const key of aiKeys) {
            aiChromeHandlers?.closeThread(key.slice(3))
          }
          if (otherKeys.length === 1) handleCenterPaneTabClose(otherKeys[0]!)
          else if (otherKeys.length > 1) handleCenterPaneTabClose(otherKeys)
        }}
        onCloseAll={handleCenterPaneCloseAllTabs}
        isExpanded={isDetailsFocusModeEnabled || isDetailsPaneExpandedMax}
        onExpand={handleExpandDetailsPane}
        onClosePane={handleCloseMiddlePane}
        onOpenActiveInOtherPane={() => {
          openActiveWorkspaceTabInOtherPane("middle", {
            pathname: effectivePathname,
            source: "center-tab-open-other",
          })
        }}
        onDropTabFromOtherPane={(tabKey, fromPane, meta) => {
          moveWorkspaceTabByKey(fromPane, tabKey, {
            toPane: "middle",
            pathname: effectivePathname,
            source: "center-tab-drop",
            title: meta?.title,
            beforeKey: meta?.beforeKey,
          })
        }}
        onReorderTab={(tabKey, meta) => {
          reorderWorkspaceTabInPane("middle", tabKey, meta?.beforeKey)
        }}
        onOpenRightPane={
          !showRightToolPanel && !isMobile
            ? () => {
                openWorkspaceView(
                  { type: "start", title: "New" },
                  {
                    pane: "right",
                    pathname: effectivePathname,
                    source: "center-tab-open-right-pane",
                  },
                )
              }
            : undefined
        }
        pathname={effectivePathname}
        searchValue={globalSearch?.committedQuery ?? ""}
        onSearchChange={globalSearch?.setDraftQuery}
        onSearchCommit={(value) => globalSearch?.commitSearch({ nextQuery: value })}
        onClearSearch={globalSearch?.clearSearch}
        selectedTypeFilters={globalSearch?.pendingSelectedTypes ?? []}
        onToggleTypeFilter={globalSearch?.togglePendingTypeFilter}
        onShowAll={globalSearch?.handleShowAll}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
      {(() => {
        console.log("middle pane params", {
          rightView: rightViewParam,
          rightThreadId: rightThreadIdParam,
          rightMentionId: rightMentionIdParam,
          detailType: detailTypeParam,
          detailId: detailIdParam,
          taskAiOpen: taskAiOpenParam,
          aiThreadId: aiThreadIdParam,
        })
        return null
      })()}
      {isAiInMiddle ? (
        <WorkspaceViewRenderer
          tab={activeMiddleWorkspaceTab}
          paneId="middle"
          slots={{ ai: aiPane }}
        />
      ) : isBrowserInMiddle ? (
        <WorkspaceViewRenderer
          tab={activeMiddleWorkspaceTab}
          paneId="middle"
          slots={{ browser: browserContent }}
        />
      ) : isListInMiddle || activeMiddleWorkspaceTab?.type === "search-results" ? (
        <WorkspaceViewRenderer
          tab={activeMiddleWorkspaceTab}
          paneId="middle"
        />
      ) : activeMiddleWorkspaceTab?.type === "start" ? (
        <WorkspaceViewRenderer
          tab={activeMiddleWorkspaceTab}
          paneId="middle"
          onCloseTab={() => {
            handleCenterPaneTabClose(
              buildCenterPaneTabKey("start", START_WORKSPACE_TAB_ID),
            )
          }}
        />
      ) : activeMiddleWorkspaceTab?.type === "thread" ? (
        <WorkspaceViewRenderer
          tab={activeMiddleWorkspaceTab}
          paneId="middle"
          onCloseTab={() => {
            if (activeMiddleWorkspaceTab) {
              handleCenterPaneTabClose(
                buildCenterPaneTabKey("thread", activeMiddleWorkspaceTab.id),
              )
            }
          }}
        />
      ) : isThreadChatRequested && publicUserId && rightThreadIdNum ? (
        <CenterPaneThreadChat
          key={`${rightThreadIdNum}-${rightMentionIdParam ?? ""}`}
          threadId={rightThreadIdNum}
          focusedMentionId={Number.isFinite(rightMentionIdNum) ? rightMentionIdNum : null}
          onThreadCreated={(nextThreadId) => {
            const next = new URLSearchParams(params.toString())
            // Prefer center-pane thread selection so AI can keep the right column.
            next.set("centerThreadId", String(nextThreadId))
            next.delete("centerMentionId")
            next.delete("rightThreadId")
            next.delete("rightMentionId")
            if (!next.get("rightView")) next.set("rightView", "details")
            shallowReplaceSearchParams(effectivePathname, next, "task-thread-created")
          }}
        />
      ) : isArtifactCenterOpen && liveCenterArtifactId ? (
        <div className="h-full min-h-0 overflow-hidden">
          <ArtifactPane
            artifactId={liveCenterArtifactId}
            version={liveCenterArtifactVersion}
            onClose={() =>
              handleCenterPaneTabClose(
                buildCenterPaneTabKey("artifact", liveCenterArtifactId),
              )
            }
          />
        </div>
      ) : isSourceCenterOpen && liveCenterSourceId ? (
        <div className="h-full min-h-0 overflow-hidden">
          <SourcePane
            sourceId={liveCenterSourceId}
            onClose={() =>
              handleCenterPaneTabClose(
                buildCenterPaneTabKey("source", liveCenterSourceId),
              )
            }
          />
        </div>
      ) : isTemplateCenterOpen && liveCenterTemplateId ? (
        <div className="h-full min-h-0 overflow-hidden">
          <WorkspaceViewRenderer
            tab={activeMiddleWorkspaceTab}
            paneId="middle"
            onCloseTab={() =>
              handleCenterPaneTabClose(
                buildCenterPaneTabKey("template", liveCenterTemplateId),
              )
            }
            onResolvedTitle={handleCenterPaneResolvedTitle}
          />
        </div>
      ) : isResearchCenterOpen ? (
        <div className="h-full min-h-0 overflow-hidden">
          <ResearchPane
            isOpen
            variant="inline"
            initialTab={liveResearchTab}
            onTabChange={(tab) => {
              const baseParams =
                typeof window !== "undefined"
                  ? new URLSearchParams(window.location.search)
                  : new URLSearchParams(params.toString())
              baseParams.set(RESEARCH_TAB_PARAM, tab)
              baseParams.set("centerView", RESEARCH_CENTER_VIEW)
              shallowReplaceSearchParams(effectivePathname, baseParams, "research-tab")
            }}
            onClose={() =>
              handleCenterPaneTabClose(
                buildCenterPaneTabKey("research", RESEARCH_TAB_ID),
              )
            }
          />
        </div>
      ) : isCreateCenterOpen ? (
        <div className="h-full min-h-0 overflow-hidden">
          <CreateCenterPane
            createType={liveCreateType}
            onCreateTypeChange={(nextType) => {
              const baseParams =
                typeof window !== "undefined"
                  ? new URLSearchParams(window.location.search)
                  : new URLSearchParams(params.toString())
              baseParams.set("centerView", CREATE_CENTER_VIEW)
              baseParams.set(CREATE_TYPE_PARAM, nextType)
              upsertCenterPaneTab({
                kind: "create",
                id: CREATE_TAB_ID,
                title: CREATE_MODAL_TITLES[nextType],
              })
              shallowReplaceSearchParams(effectivePathname, baseParams, "create-type")
            }}
            onClose={() =>
              handleCenterPaneTabClose(buildCenterPaneTabKey("create", CREATE_TAB_ID))
            }
            onSuccess={() =>
              handleCenterPaneTabClose(buildCenterPaneTabKey("create", CREATE_TAB_ID))
            }
            onAiPillSelect={() => {
              openWorkspaceView(
                { type: "ai", title: "New chat", params: { forceNewAiThread: true } },
                { pane: "right", pathname: effectivePathname, source: "create-ai-from-pills" },
              )
            }}
          />
        </div>
      ) : selectedDetailTarget && selectedTaskId ? (
        // Stacked navigation: a task was opened on top of an existing detail target (e.g. a user
        // pane). Render ONLY the task detail full-height with a back chevron (onDetailStackBack ->
        // handleDetailStackBackFromTask). The parent detail target stays in the URL as back-history
        // and is NOT rendered underneath; the chevron clears the task and returns to it.
        <div className="h-full overflow-hidden">
          <TaskDetails
            isCollapsed={isDetailsCollapsed}
            selectedTask={isSuggestionSelected ? (selectedSuggestionAsTask as any) : selectedTaskData}
            onClose={handleCloseDetails}
            onTaskUpdate={(updatedFields) => {
              const sanitized = {
                ...updatedFields,
                project_id_int: updatedFields.project_id_int === null ? undefined : updatedFields.project_id_int,
                parent_task_id_int:
                  updatedFields.parent_task_id_int == null ? undefined : updatedFields.parent_task_id_int,
              }
              if (selectedTaskData && selectedTaskId && accessToken) {
                queryClient.setQueryData(["task", selectedTaskId, accessToken], (old: any) => ({
                  ...old,
                  task: { ...old?.task, ...sanitized },
                }))
              }
              if (onTaskUpdate) onTaskUpdate(sanitized)
            }}
            onAddSubtask={onAddSubtask}
            onDuplicateTask={handleDuplicateTask}
            attachments={isSuggestionSelected ? [] : attachments}
            threadId={isSuggestionSelected ? null : threadId}
            mentions={isSuggestionSelected ? EMPTY_LIST : mentions || EMPTY_LIST}
            watchers={isSuggestionSelected ? EMPTY_LIST : watchers || EMPTY_LIST}
            currentUser={null}
            subtasks={isSuggestionSelected ? EMPTY_LIST : subtasks || EMPTY_LIST}
            project_watchers={isSuggestionSelected ? EMPTY_LIST : project_watchers || EMPTY_LIST}
            accessToken={accessToken}
            mode={isSuggestionSelected ? "suggestion" : "task"}
            isBootstrapLoaded={isBootstrapLoadedForSelectedTask}
            onActiveFieldContextChange={setActiveFieldContext}
            onAiPaneOpenChange={handleTaskAiPaneOpenChange}
            onDetailStackBack={taskDetailStackBack}
          />
        </div>
      ) : selectedDetailTarget &&
        isUserDetailStack &&
        hasValidStackTeam &&
        !selectedTaskId ? (
        // Stacked navigation: a team was opened on top of an existing user detail. Render ONLY the
        // team detail full-height with a back chevron (onStackBack -> handleTeamStackBack). The user
        // detail target stays in the URL as back-history and is NOT rendered underneath; the chevron
        // clears stackTeamId and returns to the user.
        <div className="h-full overflow-auto">
          <TeamDetailsPage
            teamId={parsedStackTeamId}
            onStackBack={handleTeamStackBack}
            onResolvedTitle={handleCenterPaneResolvedTitle}
          />
        </div>
      ) : selectedDetailTarget && !selectedTaskId ? (
        <div className="h-full overflow-auto">
          <GlobalSearchDetailsPane
            target={selectedDetailTarget}
            paneId="middle"
            onOpenTask={(taskId: number) => handleTaskSelect({ id: taskId })}
            onOpenTaskKeepingDetail={handleOpenTaskKeepingDetailContext}
            onOpenTeamKeepingDetail={handleOpenTeamKeepingDetailContext}
            onOpenProject={handleOpenProjectSelect}
            onResolvedTitle={handleCenterPaneResolvedTitle}
          />
        </div>
      ) : (
        <div className="h-full overflow-auto">
          <TaskDetails
            isCollapsed={isDetailsCollapsed}
            selectedTask={isSuggestionSelected ? (selectedSuggestionAsTask as any) : selectedTaskData}
            onClose={handleCloseDetails}
            onTaskUpdate={(updatedFields) => {
              const sanitized = {
                ...updatedFields,
                project_id_int: updatedFields.project_id_int === null ? undefined : updatedFields.project_id_int,
                parent_task_id_int:
                  updatedFields.parent_task_id_int == null ? undefined : updatedFields.parent_task_id_int,
              }
              if (selectedTaskData && selectedTaskId && accessToken) {
                queryClient.setQueryData(["task", selectedTaskId, accessToken], (old: any) => ({
                  ...old,
                  task: { ...old?.task, ...sanitized },
                }))
              }
              if (onTaskUpdate) onTaskUpdate(sanitized)
            }}
            onAddSubtask={onAddSubtask}
            onDuplicateTask={handleDuplicateTask}
            attachments={isSuggestionSelected ? [] : attachments}
            threadId={isSuggestionSelected ? null : threadId}
            mentions={isSuggestionSelected ? EMPTY_LIST : mentions || EMPTY_LIST}
            watchers={isSuggestionSelected ? EMPTY_LIST : watchers || EMPTY_LIST}
            currentUser={null}
            subtasks={isSuggestionSelected ? EMPTY_LIST : subtasks || EMPTY_LIST}
            project_watchers={isSuggestionSelected ? EMPTY_LIST : project_watchers || EMPTY_LIST}
            accessToken={accessToken}
            mode={isSuggestionSelected ? "suggestion" : "task"}
            isBootstrapLoaded={isBootstrapLoadedForSelectedTask}
            onActiveFieldContextChange={setActiveFieldContext}
            onAiPaneOpenChange={handleTaskAiPaneOpenChange}
          />
        </div>
      )}
      </div>
    </div>
  )

  const handleRightPaneSelect = (key: string) => {
    setRightPaneActiveKey(key)
    const aiThreadId = parseAiRightTabKey(key)
    if (aiThreadId || key === "ai:pending" || key === AI_RIGHT_TAB_KEY) {
      openWorkspaceView(
        {
          type: "ai",
          aiThreadId: aiThreadId && aiThreadId !== "pending" ? aiThreadId : undefined,
        },
        { pane: "right", source: "right-tab-ai" },
      )
      return
    }
    if (key === DETAILS_RIGHT_TAB_KEY) {
      openWorkspaceView({ type: "details" }, { pane: "right", source: "right-tab-details" })
      return
    }
    if (key.startsWith("browser:")) {
      const tab = rightPaneTabs.find((item) => item.key === key)
      openWorkspaceView(
        {
          type: "browser",
          id: key.replace(/^browser:/, ""),
          params: {
            browserTabId: key.replace(/^browser:/, ""),
            publicationRunId: tab?.browser?.publicationRunId ?? null,
            keepAiOpen: true,
          },
        },
        { pane: "right", source: "right-tab-browser" },
      )
      return
    }
    // Entity workspace tabs on the right (`task:123`, `project:1`, …).
    const colon = key.indexOf(":")
    if (colon > 0) {
      const kind = key.slice(0, colon) as WorkspaceViewType
      const id = key.slice(colon + 1)
      if (
        kind === "task" ||
        kind === "task-list" ||
        kind === "project-list" ||
        kind === "mention-list" ||
        kind === "user-list" ||
        kind === "ai-thread-list" ||
        kind === "artifact-list" ||
        kind === "template-list" ||
        kind === "suggestion" ||
        kind === "project" ||
        kind === "user" ||
        kind === "team" ||
        kind === "thread" ||
        kind === "artifact" ||
        kind === "source" ||
        kind === "template" ||
        kind === "research" ||
        kind === "create" ||
        kind === "search-results" ||
        kind === "start"
      ) {
        openWorkspaceView(
          {
            type: kind,
            id: isListWorkspaceViewType(kind) ? undefined : id,
            title: isListWorkspaceViewType(kind)
              ? workspaceListViewLabel(kind)
              : kind === "search-results"
                ? "Search"
                : kind === "start"
                  ? "New"
                  : undefined,
          },
          { pane: "right", source: `right-tab-${kind}` },
        )
      }
    }
  }

  const hostedBrowserTabId =
    isBrowserInMiddle && activeMiddleWorkspaceTab?.type === "browser"
      ? activeMiddleWorkspaceTab.id
      : isBrowserInLeft && activeLeftWorkspaceTab?.type === "browser"
        ? activeLeftWorkspaceTab.id
        : null
  // Store order (entities + browsers interleaved) so same-pane DnD reorder is visible.
  const contentRightPaneTabs = rightPaneTabs.filter((tab) => {
    if (tab.kind === "ai" || tab.kind === "details") return false
    if (tab.kind === "browser") {
      if (hostedBrowserTabId && tab.key === `browser:${hostedBrowserTabId}`) return false
    }
    return true
  })
  const entityRightPaneTabs = contentRightPaneTabs

  const rightToolPane = showRightToolPanel ? (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      <RightPaneTabBar
        browserTabs={[]}
        entityTabs={entityRightPaneTabs}
        includeAiTabs={Boolean(showAiPanel && !isAiInMiddle)}
        activeKey={
          isEntityInRight
            ? // Prefer store activeKey so a tab opened via "+" highlights gray immediately.
              (rightPaneActiveKey &&
              entityRightPaneTabs.some((tab) => tab.key === rightPaneActiveKey)
                ? rightPaneActiveKey
                : activeRightWorkspaceTab?.key ?? rightPaneActiveKey)
            : activeRightPaneKind === "browser"
              ? activeBrowserTab?.key ?? rightPaneActiveKey
              : activeRightPaneKind === "details"
                ? DETAILS_RIGHT_TAB_KEY
                : aiChromeActiveId
                  ? buildAiRightTabKey(aiChromeActiveId)
                  : rightPaneActiveKey?.startsWith("ai:")
                    ? rightPaneActiveKey
                    : null
        }
        onSelect={handleRightPaneSelect}
        onClose={(key) => {
          if (key.startsWith("ai:")) {
            // AI tab close is handled by AiPane chrome handlers via the tab strip.
            return
          }
          if (key.startsWith("browser:")) {
            const closing = rightPaneTabs.find((tab) => tab.key === key)
            const associations = closing?.browser
            if (
              associations?.provider === "browser_use_local" ||
              associations?.bridgeSessionId
            ) {
              void import("../../lib/open-browser-session").then(({ stopOpenedBrowserSession }) =>
                stopOpenedBrowserSession({
                  provider: associations.provider,
                  bridgeSessionId: associations.bridgeSessionId ?? associations.sessionId,
                  browserId: associations.browserId,
                }),
              )
            }
          }
          const nextKey = closeRightPaneTab(key)
          if (key.startsWith("browser:")) {
            const next = buildCloseBrowserPaneParams(new URLSearchParams(window.location.search))
            if (nextKey?.startsWith("browser:")) {
              next.set("rightView", "browser")
              next.set("browserTabId", nextKey.replace(/^browser:/, ""))
            } else {
              next.set("rightView", "ai")
              next.set("taskAiOpen", "true")
            }
            shallowReplaceSearchParams(effectivePathname, next, "right-tab-close-browser")
            return
          }
          // Closing an entity tab — activate next remaining workspace tab or AI.
          if (nextKey?.startsWith("browser:")) {
            handleRightPaneSelect(nextKey)
          } else if (nextKey?.startsWith("ai:") || nextKey === AI_RIGHT_TAB_KEY) {
            handleRightPaneSelect(nextKey || AI_RIGHT_TAB_KEY)
          } else if (nextKey) {
            handleRightPaneSelect(nextKey)
          } else {
            openWorkspaceView({ type: "ai" }, { pane: "right", source: "right-tab-close-entity" })
          }
        }}
        isExpanded={isAiFocusModeEnabled || isRightPaneSoloLayout || isAiPaneExpandedMax}
        onExpand={handleExpandRightPane}
        onClosePane={handleCloseRightPane}
        pathname={effectivePathname}
        searchValue={globalSearch?.committedQuery ?? ""}
        onSearchChange={globalSearch?.setDraftQuery}
        onSearchCommit={(value) => globalSearch?.commitSearch({ nextQuery: value })}
        onClearSearch={globalSearch?.clearSearch}
        selectedTypeFilters={globalSearch?.pendingSelectedTypes ?? []}
        onToggleTypeFilter={globalSearch?.togglePendingTypeFilter}
        onShowAll={globalSearch?.handleShowAll}
        onOpenActiveInOtherPane={() => {
          openActiveWorkspaceTabInOtherPane("right", {
            pathname: effectivePathname,
            source: "right-tab-open-other",
          })
        }}
        onDropTabFromOtherPane={(tabKey, fromPane, meta) => {
          moveWorkspaceTabByKey(fromPane, tabKey, {
            toPane: "right",
            pathname: effectivePathname,
            source: "right-tab-drop",
            title: meta?.title,
            beforeKey: meta?.beforeKey,
          })
        }}
        onReorderTab={(tabKey, meta) => {
          reorderWorkspaceTabInPane("right", tabKey, meta?.beforeKey)
        }}
      />
      <div className="relative min-h-0 flex-1">
        {isEntityInRight ? (
          <div
            className={cn(
              "absolute inset-0 min-h-0 min-w-0",
              activeRightPaneKind === "ai" || activeRightPaneKind === "browser"
                ? "invisible pointer-events-none"
                : "visible",
            )}
          >
            <WorkspaceViewRenderer
              tab={activeRightWorkspaceTab}
              paneId="right"
              onCloseTab={() => {
                if (activeRightWorkspaceTab) {
                  const nextKey = closeRightPaneTab(activeRightWorkspaceTab.key)
                  if (nextKey) handleRightPaneSelect(nextKey)
                  else openWorkspaceView({ type: "ai" }, { pane: "right", source: "right-entity-close" })
                }
              }}
            />
          </div>
        ) : null}
        <div
          className={cn(
            "absolute inset-0",
            activeRightPaneKind === "ai" ? "visible" : "invisible pointer-events-none",
          )}
        >
          {/* Keep AI mounted while peer tabs (Research / lists / entities) are active —
              same keep-alive pattern as Browser — so the open thread does not vanish. */}
          {showAiPanel || isAiInRight ? aiPane : null}
        </div>
        {activeRightPaneKind === "browser" || isBrowserInRight ? (
          <div className="absolute inset-0 min-h-0 min-w-0">{browserContent}</div>
        ) : null}
      </div>
    </div>
  ) : null;

  const useLegacyDesktopLayout = false;
  if (!useLegacyDesktopLayout) {
    const shouldRenderDesktopSplitLayout = shouldRenderSplitLayout({
      isAiFocusModeEnabled,
      hasMountedSplitLayout,
    })
    const leftPaneStripTabs = toLeftPaneTabStripItems(leftPaneTabs)
    const leftPaneActiveKey =
      leftPaneActiveKeyStore ??
      (activeLeftWorkspaceTab
        ? `${activeLeftWorkspaceTab.type}:${activeLeftWorkspaceTab.id}`
        : leftPaneTabs[0]?.key ?? null)

    const handleLeftPaneTabSelect = (key: string) => {
      const tab = leftPaneTabs.find((entry) => entry.key === key)
      if (!tab) return
      openWorkspaceView(
        {
          type: tab.kind as WorkspaceViewType,
          id: tab.id,
          title: tab.title,
          aiThreadId: tab.kind === "ai" && tab.id !== "main" ? tab.id : undefined,
          params:
            tab.kind === "browser"
              ? { browserTabId: tab.id }
              : tab.kind === "ai" && tab.id !== "main"
                ? { aiThreadId: tab.id }
                : undefined,
        },
        {
          pane: "left",
          pathname: effectivePathname,
          source: "left-pane-tab-activate",
        },
      )
    }

    const handleLeftPaneTabClose = (keyOrKeys: string | string[]) => {
      const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys]
      let nextKey: string | null = null
      if (keys.length === 1) nextKey = closeLeftPaneTab(keys[0]!)
      else nextKey = closeLeftPaneTabs(keys)
      if (nextKey) {
        handleLeftPaneTabSelect(nextKey)
        return
      }
      ensureLeftPaneHasDefaultListTab()
      openWorkspaceView(
        { type: "ai", title: "AI", id: AI_WORKSPACE_TAB_ID },
        { pane: "left", pathname: effectivePathname, source: "left-pane-tab-close-fallback" },
      )
    }

    const leftWorkspacePane = (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <LeftPaneTabBar
          tabs={leftPaneStripTabs}
          activeKey={leftPaneActiveKey}
          onSelect={handleLeftPaneTabSelect}
          onClose={handleLeftPaneTabClose}
          onCloseAll={() => {
            closeAllLeftPaneTabs()
            ensureLeftPaneHasDefaultListTab()
            openWorkspaceView(
              { type: "ai", title: "AI", id: AI_WORKSPACE_TAB_ID },
              { pane: "left", pathname: effectivePathname, source: "left-pane-close-all" },
            )
          }}
          onOpenActiveInOtherPane={() => {
            openActiveWorkspaceTabInOtherPane("left", {
              pathname: effectivePathname,
              source: "left-tab-open-other",
            })
          }}
          onDropTabFromOtherPane={(tabKey, fromPane, meta) => {
            moveWorkspaceTabByKey(fromPane, tabKey, {
              toPane: "left",
              pathname: effectivePathname,
              source: "left-tab-drop",
              title: meta?.title,
              beforeKey: meta?.beforeKey,
            })
          }}
          onReorderTab={(tabKey, meta) => {
            reorderWorkspaceTabInPane("left", tabKey, meta?.beforeKey)
          }}
          isExpanded={focus === "left"}
          onExpand={() => {
            if (focus === "left") {
              const hasSelectedTask = !!selectedTaskId
              handleLayoutChange({
                layout: hasSelectedTask ? ["left", "middle", "right"] : ["left", "middle"],
                focus: null,
              })
            } else {
              handleLayoutChange({ focus: "left" })
            }
          }}
          onOpenMiddlePane={
            !showDetailsPanel
              ? () => {
                  openWorkspaceView(
                    { type: "start", title: "New" },
                    {
                      pane: "middle",
                      pathname: effectivePathname,
                      source: "left-tab-open-middle-pane",
                    },
                  )
                }
              : undefined
          }
          pathname={effectivePathname}
          searchValue={globalSearch?.committedQuery ?? ""}
          onSearchChange={globalSearch?.setDraftQuery}
          onSearchCommit={(value) => globalSearch?.commitSearch({ nextQuery: value })}
          onClearSearch={globalSearch?.clearSearch}
          selectedTypeFilters={globalSearch?.pendingSelectedTypes ?? []}
          onToggleTypeFilter={globalSearch?.togglePendingTypeFilter}
          onShowAll={globalSearch?.handleShowAll}
        />
        <div className="min-h-0 flex-1 overflow-hidden">
          {isLeftListWorkspaceView ? (
            <WorkspaceViewRenderer tab={activeLeftWorkspaceTab} paneId="left" />
          ) : (
            <WorkspaceViewRenderer
              tab={activeLeftWorkspaceTab}
              paneId="left"
              slots={{
                ai: isAiInLeft ? aiPane : undefined,
                browser: isBrowserInLeft ? browserContent : undefined,
              }}
              onCloseTab={() => {
                if (leftPaneActiveKey) handleLeftPaneTabClose(leftPaneActiveKey)
              }}
            />
          )}
        </div>
      </div>
    )

    const mainNode = (
      <TasksToolbarFitProvider byPane={toolbarFitByPane}>
        <div className="h-full min-h-0">{leftWorkspacePane}</div>
      </TasksToolbarFitProvider>
    );
    const desktopBody = !shouldRenderDesktopSplitLayout ? (
      <div className={cn("h-full min-h-0", isAiFocusModeEnabled ? "" : "border-l border-gray-200")}>
        {rightToolPane ?? aiPane}
      </div>
    ) : (
      <PanelGroup ref={newLayoutDesktopPanelGroupRef} direction="horizontal" className="h-full min-h-0" autoSaveId={null}>
        <Panel
          defaultSize={isLeftPaneHiddenInDesktopSplit ? 0 : mainPanelPercent}
          minSize={isLeftPaneHiddenInDesktopSplit ? 0 : (isAiPaneExpandedMax || isDetailsPaneExpandedMax ? 12 : 25)}
          onResize={setMainPanelPercent}
          className={cn(
            // Border on the scrolling pane so the scrollbar sits flush against it (not inset from a sibling border-l).
            aiPaneFocusChrome.showPrimaryDivider && "border-r border-gray-200",
          )}
        >
          <div className={cn("h-full min-h-0", isLeftPaneHiddenInDesktopSplit ? "pointer-events-none invisible" : "visible")}>
            {mainNode}
          </div>
        </Panel>
        <PanelResizeHandle
          className={cn(
            "w-px bg-transparent hover:bg-gray-300 transition-colors",
            aiPaneFocusChrome.showPrimaryDivider ? "block" : "hidden",
          )}
        />
        <Panel
          defaultSize={isDetailsFocusModeEnabled ? 100 : detailsPanelPercent}
          minSize={
            showDetailsPanel
              ? isAiFocusModeEnabled || isLeftPaneHiddenInDesktopSplit
                ? isTaskDetailsAiSplitModeEnabled
                  ? 25
                  : 0
                : (isAiPaneExpandedMax ? 8 : isDetailsPaneExpandedMax ? 18 : 15)
              : 0
          }
          onResize={setDetailsPanelPercent}
          className={cn(
            (aiPaneFocusChrome.showSecondaryDivider || showPublishingPanel) && "border-r border-gray-200",
            showDetailsPanel ? "block" : "hidden",
            isAiFocusModeEnabled ? "pointer-events-none invisible" : "visible"
          )}
        >
          {showDetailsPanel ? detailsPane : <div className="h-full w-full" />}
        </Panel>
        <PanelResizeHandle
          className={cn(
            "w-px bg-transparent hover:bg-gray-300 transition-colors",
            (aiPaneFocusChrome.showSecondaryDivider || showPublishingPanel) ? "block" : "hidden",
          )}
        />
        <Panel
          ref={newLayoutAiPanelRef}
          defaultSize={isAiFocusModeEnabled || isRightPaneSoloLayout ? 100 : isDetailsFocusModeEnabled ? 0 : aiPanelPercent}
          minSize={
            showRightToolPanel
              ? isAiFocusModeEnabled || isRightPaneSoloLayout
                ? 0
                : isDetailsFocusModeEnabled
                  ? 0
                  : isTaskDetailsAiSplitModeEnabled
                    ? 25
                    : isAiPaneExpandedMax
                      ? 50
                      : isDetailsPaneExpandedMax
                        ? 12
                        : 15
              : 0
          }
          onResize={setAiPanelPercent}
          className={cn(
            showRightToolPanel && !isDetailsFocusModeEnabled ? "block" : "hidden",
          )}
        >
          {rightToolPane ?? <div className="h-full w-full" />}
        </Panel>
      </PanelGroup>
    );

    return (
      <div className="flex h-full w-full max-w-full overflow-hidden bg-white">
        <div className="flex-1 min-w-0 min-h-0">{desktopBody}</div>

        <TaskFilters
          isOpen={isFilterPaneOpen}
          onClose={() => setIsFilterPaneOpen(false)}
          onApplyFilters={(mappedFilters: TaskFiltersType) => {
            setFilters(mappedFilters);
            setIsFilterPaneOpen(false);
          }}
          activeFilters={filters}
          filterOptions={mergedListFilterOptions}
          commitFilters={commitFilters}
        />

        <SettingsPanel open={isSettingsOpen} onClose={closeSettings} />

      </div>
    );
  }

  // Desktop layout
  return (
    <div className="flex h-full w-full max-w-full overflow-x-hidden bg-white">
      {/* Sidebar is now rendered at layout level */}
      {/* Always render all three panels, use CSS for fullscreen/collapse */}
      <PanelGroup 
        ref={panelGroupRef}
        direction="horizontal" 
        className="flex-1 h-full" 
        autoSaveId={null}
      >
        {/* Left Pane: Task List - PRESERVE USER RESIZE */}
        <Panel
          ref={leftPanelRef}
          id="left-pane"
          order={1}
          defaultSize={(() => {
            // **FIX: Preserve user's preferred width, only change for focus**
            if (focus === 'left') {
              return 100; // Full width when focused
            } else if (focus === 'middle' || focus === 'right') {
              return 0; // Hidden when other panes focused
            }
            // **USER PREFERENCE**: Use user's resized width if available, otherwise current size
            if (hasUserResized && userPreferredLeftWidth !== null) {
              return userPreferredLeftWidth;
            }
            // **CURRENT SIZE**: Use the tracked current size to maintain stability
            return currentPanelSizes.current.left;
          })()}
          minSize={(() => {
            // Allow complete collapse when not focused OR when layout doesn't include this pane
            if (focus === 'left') return 20;
            if (focus === 'middle' || focus === 'right') return 0;
            if (!layout.includes('left')) return 0;
            return 20;
          })()} // Allow complete collapse when not focused
          maxSize={100}
          collapsible
          onResize={handleLeftPaneResize}
          className={cn(
            'border-r border-gray-200 bg-white flex flex-col transition-all duration-200',
            // **FIX: Dynamic width constraints based on focus state**
            focus === 'left' ? 'min-w-[300px]' : 'min-w-0', // Only apply min-width when focused
            (() => {
              const cssCondition = isLeftCollapsed && focus !== 'left';
              // Remove width constraints that conflict with imperative resizing
              const cssClass = cssCondition ? 'p-0 items-center justify-start' : '';
              return cssClass;
            })(),
            getPaneClass('left')
          )}
        >
          {/* **FIX: Expanded View - Always Visible */}
          <div 
            className={cn(
              "flex flex-col h-full transition-all duration-200",
              (() => {
                const shouldHide = isLeftCollapsed && focus !== 'left';
                const visibility = !shouldHide ? 'block' : 'hidden';
                return visibility;
              })()
            )}
          >
            {/* Single chrome row: object chips + optional group-by · search / … / expand on the right */}
            {(() => {
              const isLeftFocused =
                focus === "left"
                || (layout.length === 2 && layout.includes("left") && layout.includes("right"))
              const showChromeActions = focus !== "middle"
              const listGroupBySummary = getListGroupByLabelFromParams(params.get("groupBy"))
              const { badges: activeFilterBadges, onClearAll: clearActiveFilters } =
                isLeftObjectTasks
                  ? getActiveFilterBadges(
                      filters,
                      setFilters,
                      router,
                      pathname,
                      new URLSearchParams(params.toString()),
                      mergedListFilterOptions,
                    )
                  : { badges: [] as ReturnType<typeof getActiveFilterBadges>["badges"], onClearAll: undefined }

              return (
                <>
                  <div className="flex h-10 min-h-10 max-h-10 w-full shrink-0 items-center gap-1 overflow-hidden border-b border-gray-200/80 bg-white pl-2 pr-1.5">
                    {isInlineSearchOpen ? (
                      <InlineSearchInput
                        isOpen
                        fullWidth
                        value={inlineSearchValue}
                        onChange={(value) => {
                          setInlineSearchValue(value)
                          const newParams = new URLSearchParams(params.toString())
                          if (value) newParams.set("q", value)
                          else newParams.delete("q")
                          shallowReplaceUrl(`${effectivePathname}?${newParams.toString()}`)
                        }}
                        onClose={() => {
                          setIsInlineSearchOpen(false)
                          setInlineSearchValue("")
                          const newParams = new URLSearchParams(params.toString())
                          newParams.delete("q")
                          shallowReplaceUrl(`${effectivePathname}?${newParams.toString()}`)
                        }}
                        placeholder={`Search ${leftPaneObjectLabel(leftObject).toLowerCase()}...`}
                        leading={
                          <LeftObjectSwitcher
                            value={leftObject}
                            onChange={navigateToLeftObject}
                            forceCompact
                            isTaskView={isLeftObjectTasks}
                            className="h-6"
                          />
                        }
                      />
                    ) : (
                      <div
                        ref={leftToolbarScrollRef}
                        className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden whitespace-nowrap pl-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
                        style={{ WebkitOverflowScrolling: "touch" }}
                      >
                        <LeftObjectSwitcher
                          value={leftObject}
                          onChange={navigateToLeftObject}
                          containerWidth={leftToolbarWidth}
                          isTaskView={isLeftObjectTasks}
                        />
                      </div>
                    )}

                    {showChromeActions ? (
                      <div className="flex shrink-0 items-center gap-0.5">
                        {isLeftObjectTasks ? (
                          <FilterCascadingDropdown
                            editFields={editFields}
                            filterOptions={mergedListFilterOptions}
                            filters={filters}
                            setFilters={setFilters}
                            router={router}
                            pathname={pathname}
                            params={new URLSearchParams(params.toString())}
                            variant="icon"
                            className="shrink-0"
                          />
                        ) : null}
                        {!isInlineSearchOpen ? (
                        <button
                          type="button"
                          className={cn(expandButton, "ml-0 shrink-0")}
                          aria-label={`Search ${leftPaneObjectLabel(leftObject).toLowerCase()}`}
                          title={`Search ${leftPaneObjectLabel(leftObject).toLowerCase()}`}
                          onClick={() => {
                            setIsInlineSearchOpen(true)
                            setInlineSearchValue("")
                          }}
                        >
                          <Search className="h-3.5 w-3.5" />
                        </button>
                        ) : null}
                        <TasksPaneMoreMenu
                          visible
                          ariaLabel="More list options"
                          triggerClassName="h-7 w-7"
                        >
                          {leftObject === "mentions" ? (
                            <>
                              <DropdownMenuItem onClick={() => handleMentionsTabChange("received")}>
                                Received
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleMentionsTabChange("sent")}>
                                Sent
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleMentionsTabChange("unseen")}>
                                Unseen
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          ) : null}
                          {isLeftObjectTasks ? (
                            <>
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger className="gap-2">
                                  <span className="min-w-0 truncate">Group by</span>
                                  <span className="ml-auto max-w-[7rem] truncate text-xs text-muted-foreground">
                                    {listGroupBySummary}
                                  </span>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="min-w-[220px]">
                                  <GroupingMenuItems />
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              <DropdownMenuItem
                                className="justify-between gap-2"
                                onSelect={(e) => {
                                  e.preventDefault()
                                  handleToggleMultiselect()
                                }}
                              >
                                <span>Multiselect</span>
                                <span className="text-xs text-muted-foreground">
                                  {isMultiselectMode ? "On" : "Off"}
                                </span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <div className="px-2 py-1.5">
                                <FrequentFilterPills
                                  editFields={editFields as any}
                                  className={cn(pillButton, "shrink-0")}
                                />
                              </div>
                            </>
                          ) : null}
                        </TasksPaneMoreMenu>
                        <button
                          type="button"
                          className={cn(expandButton, "ml-0 shrink-0")}
                          aria-label={
                            isLeftFocused
                              ? "Restore layout"
                              : `Focus on ${leftPaneObjectLabel(leftObject).toLowerCase()} list`
                          }
                          title={
                            isLeftFocused
                              ? "Restore layout"
                              : `Focus on ${leftPaneObjectLabel(leftObject).toLowerCase()} list`
                          }
                          onClick={() => {
                            if (isLeftFocused) {
                              const currentMiddleView = params.get("middleView") || "calendar"
                              const hasSelectedTask = !!selectedTaskId
                              handleLayoutChange({
                                layout: hasSelectedTask ? ["left", "middle", "right"] : ["left", "middle"],
                                leftView: "list",
                                middleView: currentMiddleView,
                                rightView: "details",
                                focus: null,
                              })
                            } else {
                              handleLayoutChange({ focus: "left" })
                            }
                          }}
                        >
                          {isLeftFocused ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                        </button>
                        {!showRightToolPanel && !showDetailsPanel && !isMobile ? (
                          <button
                            type="button"
                            className={cn(expandButton, "ml-0 shrink-0")}
                            title="Open right pane"
                            aria-label="Open right pane"
                            onClick={() => {
                              openWorkspaceView(
                                { type: "start", title: "New" },
                                {
                                  pane: "right",
                                  pathname: effectivePathname,
                                  source: "legacy-chrome-open-right-pane",
                                },
                              )
                            }}
                          >
                            <PanelRightOpen className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {activeFilterBadges.length > 0 ? (
                    <div className="flex h-9 min-h-9 max-h-9 w-full shrink-0 items-center overflow-x-auto border-b border-gray-200/80 bg-white px-4">
                      <FilterBadges
                        badges={activeFilterBadges}
                        onClearAll={clearActiveFilters}
                        className="flex-nowrap gap-1.5"
                      />
                    </div>
                  ) : null}
                </>
              )
            })()}
            
            {/* Left list content */}
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              {isLeftObjectTasks ? (
                <MemoizedTaskList 
                  onTaskSelect={handleTaskSelect}
                  selectedTaskId={selectedTaskId !== undefined && selectedTaskId !== null ? String(selectedTaskId) : undefined}
                  editFields={memoizedEditFields}
                  isMultiselectMode={isMultiselectMode}
                  onToggleMultiselect={handleToggleMultiselect}
                />
              ) : globalSearch ? (
                <GlobalSearchFullResultsPane
                  query={globalSearch.committedQuery}
                  activeTab={leftObjectSearchTab}
                  viewScope={effectiveObjectRoute}
                  onResultSelect={globalSearch.openSearchResult}
                  getQueryKey={globalSearch.getFullResultsQueryKey}
                  fetchPage={globalSearch.fetchFullResultsPage}
                />
              ) : (
                <div className="flex h-full items-center justify-center px-4 text-xs text-gray-500">
                  Unable to load {leftPaneObjectLabel(leftObject).toLowerCase()}.
                </div>
              )}
            </div>
          </div>
          {isDuplicateTaskOpen && (
            <SlidePanel
              isOpen={isDuplicateTaskOpen}
              onClose={() => {
                setIsDuplicateTaskOpen(false);
                setDuplicateInitialValues(null);
                setDuplicateOnSuccess(null);
              }}
              position="right"
              className="w-[400px]"
              title="Duplicate Task"
            >
              <AddTaskForm 
                initialValues={duplicateInitialValues ?? undefined}
                onSuccess={async (newTask: { id?: number } | null) => {
                  if (duplicateOnSuccess) {
                    await duplicateOnSuccess(newTask);
                  }
                  setIsDuplicateTaskOpen(false);
                  setDuplicateInitialValues(null);
                  setDuplicateOnSuccess(null);
                  // Navigate to the new task
                  if (newTask?.id) {
                    handleTaskSelect(newTask.id);
                  }
                }} 
                onClose={() => {
                  setIsDuplicateTaskOpen(false);
                  setDuplicateInitialValues(null);
                  setDuplicateOnSuccess(null);
                }} 
                isModal={true} 
              />
            </SlidePanel>
          )}
        </Panel>
        <PanelResizeHandle
          className={cn(
            'transition cursor-col-resize',
            !focus && isLeftVisible && isCenterVisible ? 'block' : 'hidden',
          )}
          style={{ width: '0.5px', minWidth: '0.5px', background: '#e5e7eb' }}
        />
        {/* Center Pane: Calendar/Kanban - PRESERVE USER RESIZE */}
        <Panel
          ref={centerPanelRef}
          id="center-pane"
          order={2}
          onPointerDownCapture={() => {
            useFocusedWorkspacePaneStore.getState().setFocusedPane("middle")
          }}
          defaultSize={(() => {
            // If the middle pane isn't part of the layout, it must not reserve space (prevents "blank middle pane")
            if (!isCenterPaneVisible) return 0;
            // **FIX: Preserve user's preferred width, only change for focus**
            if (focus === 'middle') {
              return 100; // Full width when focused
            } else if (focus === 'left' || focus === 'right') {
              return 0; // Hidden when other panes focused
            }
            // **USER PREFERENCE**: Use user's resized width if available, otherwise current size
            if (hasUserResizedMiddle && userPreferredMiddleWidth !== null) {
              return userPreferredMiddleWidth;
            }
            // **CURRENT SIZE**: Use the tracked current size to maintain stability
            return currentPanelSizes.current.middle;
          })()}
          minSize={(() => {
            if (!isCenterPaneVisible) return 0;
            // Allow complete collapse when not focused OR when layout doesn't include this pane
            if (focus === 'middle') return 20;
            if (focus === 'left' || focus === 'right') return 0;
            if (!layout.includes('middle')) return 0;
            return 20;
          })()} // Allow complete collapse when not focused
          maxSize={100}
          collapsible={false}
          onResize={handleMiddlePaneResize}
          className={cn(
            'bg-white flex flex-col min-w-0 transition-all duration-200',
            getPaneClass('middle')
          )}
          style={{
            // Defensive: if middle is not in the active layout, force it to take no space even if panel resizing fails
            width: isCenterPaneVisible ? undefined : '0px',
            minWidth: isCenterPaneVisible ? undefined : '0px',
            overflow: isCenterPaneVisible ? undefined : 'hidden',
            pointerEvents: isCenterPaneVisible ? undefined : 'none',
          }}

        >
          <div
            className={cn(
              'flex-1 min-h-0',
              isCenterPaneVisible && middleView === 'calendar'
                ? 'overflow-hidden'
                : 'overflow-y-auto'
            )}
          >
            {/* **FIX: Always render both views to prevent mount/unmount, use enabled prop for API calls** */}
            <div 
              className={cn(
                "h-full w-full",
                (isCenterPaneVisible && middleView === 'calendar') ? 'block' : 'hidden'
              )}

            >
              <CalendarView
                onTaskClick={handleTaskSelect}
                selectedTaskId={selectedTaskId != null ? String(selectedTaskId) : undefined}
                searchValue={searchValue}
                selectedTask={selectedTask}
                onOptimisticUpdate={onTaskUpdate}
                enabled={isCenterPaneVisible && middleView === 'calendar'} // Only enable when calendar view is active
                expandButton={
                  focus !== 'left' && (
                    <button
                      className={expandButton}
                      aria-label={focus === 'middle' ? 'Restore layout' : `Focus on ${middleView}`}
                      title={focus === 'middle' ? 'Restore layout' : `Focus on ${middleView}`}
                      onClick={() => {
                        setShouldShowCenterPane(true);
                        if (focus === 'middle') {
                          // Restore to 2-pane layout (left + middle)
                          handleLayoutChange({ 
                            layout: ['left', 'middle'],
                            leftView: 'list',
                            middleView: middleView,
                            focus: null 
                          });
                        } else {
                          // Focus on middle pane only
                          handleLayoutChange({ focus: 'middle' });
                        }
                      }}
                      type="button"
                    >
                      {focus === 'middle' ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                    </button>
                  )
                }
              />
            </div>
            <div 
              className={cn(
                "h-full w-full",
                (isCenterPaneVisible && middleView === 'kanban') ? 'block' : 'hidden'
              )}
            >
              <KanbanView
                searchValue={searchValue}
                filters={filters}
                selectedTaskId={selectedTaskId}
                onTaskSelect={handleTaskSelect}
                onOptimisticUpdate={onTaskUpdate}
                enabled={isCenterPaneVisible && middleView === 'kanban'} // Only enable when kanban view is active
                expandButton={
                  focus !== 'left' && (
                    <button
                      className={expandButton}
                      aria-label={focus === 'middle' ? 'Restore layout' : `Focus on ${middleView}`}
                      title={focus === 'middle' ? 'Restore layout' : `Focus on ${middleView}`}
                      onClick={() => {
                        setShouldShowCenterPane(true);
                        if (focus === 'middle') {
                          // Restore to 2-pane layout (left + middle)
                          handleLayoutChange({ 
                            layout: ['left', 'middle'],
                            leftView: 'list',
                            middleView: middleView,
                            focus: null 
                          });
                        } else {
                          // Focus on middle pane only
                          handleLayoutChange({ focus: 'middle' });
                        }
                      }}
                      type="button"
                    >
                      {focus === 'middle' ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                    </button>
                  )
                }
              />
            </div>
            
            {/* Project SEO Settings View */}
            {middleView === 'project-seo' && (
              <div className="h-full w-full overflow-y-auto">
                <ProjectSEOSettings 
                  projectId={Number(params.get('projectId') || '0')}
                />
              </div>
            )}

      </div>
        </Panel>
                {/* Always render right pane and resize handle, but control visibility with CSS */}
        <PanelResizeHandle className={cn(
          'transition cursor-col-resize',
          isRightPaneVisible ? 'block' : 'hidden'
        )} style={{ width: '0.5px', minWidth: '0.5px', background: '#e5e7eb', borderLeft: '1px solid #e5e7eb', zIndex: 20 }} />
        {/* Right Pane: Task Details - Always rendered but hidden when not visible */}
        <Panel
          ref={rightPanelRef}
          id="right-pane"
          order={3}
          onPointerDownCapture={() => {
            useFocusedWorkspacePaneStore.getState().setFocusedPane("right")
          }}
          defaultSize={focus === 'right' ? 100 : 30}
          minSize={(() => {
            // Allow complete collapse when not focused OR when layout doesn't include this pane
            if (focus === 'right') return 20;
            if (focus === 'left' || focus === 'middle') return 0;
            if (!layout.includes('right')) return 0;
            return 20;
          })()}
          maxSize={100}
          className={cn(
            'bg-white flex-shrink-0 h-full transition-all duration-200',
            // **FIX: Dynamic width constraints based on focus state**
            focus === 'right' ? 'min-w-[450px]' : 'min-w-0 max-w-none', // Remove max-width constraint when focused to allow full expansion
            getPaneClass('right'),
            // **FIX: Use CSS to completely remove from layout when hidden**
            isRightPaneVisible ? 'block' : 'hidden'
          )}
          style={{ 
            minWidth: focus === 'right' ? '450px' : '0px', 
            maxWidth: focus === 'right' ? 'none' : 'none', // Remove max-width constraint when focused
            // **FIX: When hidden, set width to 0 to remove from layout**
            width: isRightPaneVisible ? undefined : '0px'
          }}
        >
          {/* Standalone AI pane: available without task details. */}
          {!selectedTaskId && isTaskAiPaneOpen ? (
            <div className="h-full w-full">
              <AiPane
                isOpen={true}
                onClose={() => handleTaskAiPaneOpenChange(false)}
                initialScope={resolvedStandaloneAiProjectId ? "project" : "global"}
                projectId={resolvedStandaloneAiProjectId ?? undefined}
                inline={true}
                externalThreadId={searchOpenedAiThreadId}
              />
            </div>
          ) : focus === 'right' && middleView === 'ai-build' ? (
            <div className="h-full flex">
              <div className="flex-1 overflow-hidden border-r">
                <TaskDetails
                    isCollapsed={isDetailsCollapsed}
                    selectedTask={isSuggestionSelected ? (selectedSuggestionAsTask as any) : selectedTaskData}
                    onClose={handleCloseDetails}
                    onCollapse={handleCloseDetails}
                    isExpanded={focus === 'right'}
                    onExpand={() => handleLayoutChange({ focus: 'right' })}
                    onRestore={() => {
                      // Restore to previous layout based on whether a task is selected
                      const hasSelectedTask = !!selectedTaskId;
                      handleLayoutChange({ 
                        layout: hasSelectedTask ? ['left', 'middle', 'right'] : ['left', 'middle'],
                        leftView: 'list',
                        middleView: middleView,
                        rightView: 'details',
                        focus: null 
                      });
                    }}
                    onTaskUpdate={onTaskUpdate}
                    onAddSubtask={onAddSubtask}
                    onDuplicateTask={handleDuplicateTask}
                    attachments={isSuggestionSelected ? [] : (selectedTaskData?.attachments || [])}
                    threadId={isSuggestionSelected ? null : (selectedTaskData?.thread_id || null)}
                    mentions={isSuggestionSelected ? EMPTY_LIST : (selectedTaskData?.mentions || EMPTY_LIST)}
                    watchers={isSuggestionSelected ? EMPTY_LIST : (selectedTaskData?.watchers || EMPTY_LIST)}
                    currentUser={null}
                    subtasks={isSuggestionSelected ? EMPTY_LIST : (selectedTaskData?.subtasks || EMPTY_LIST)}
                    project_watchers={isSuggestionSelected ? EMPTY_LIST : (selectedTaskData?.project_watchers || EMPTY_LIST)}
                    accessToken={accessToken}
                    onOptimisticUpdate={onTaskUpdate}
                    mode={isSuggestionSelected ? 'suggestion' : 'task'}
                    isBootstrapLoaded={isBootstrapLoadedForSelectedTask}
                    onActiveFieldContextChange={setActiveFieldContext}
                    onAiPaneOpenChange={handleTaskAiPaneOpenChange}
                    onDetailStackBack={taskDetailStackBack}
                  />
              </div>
              <div className="flex-1 overflow-hidden">
                {!isSuggestionSelected ? (
                  <AiPane 
                    isOpen={true} 
                    onClose={() => handleTaskAiPaneOpenChange(false)} 
                    initialScope="task" 
                    taskId={selectedTaskId ? Number(selectedTaskId) : undefined}
                    inline={true}
                    activeFieldContext={activeFieldContext}
                    externalThreadId={searchOpenedAiThreadId}
                  />
                ) : null}
              </div>
            </div>
          ) : focus !== 'right' ? (
            <div className="h-full flex">
              <div
                className={cn("h-full overflow-hidden", !isSuggestionSelected && isTaskAiPaneOpen ? "border-r" : "flex-1")}
                style={!isSuggestionSelected && isTaskAiPaneOpen ? { flex: `0 0 ${taskDetailsPanePercent}%` } : undefined}
              >
                <TaskDetails
                    isCollapsed={isDetailsCollapsed}
                    selectedTask={isSuggestionSelected ? (selectedSuggestionAsTask as any) : selectedTaskData}
                    onClose={handleCloseDetails}
                    onCollapse={handleCloseDetails}
                    isExpanded={false}
                    onExpand={() => handleLayoutChange({ focus: 'right' })}
                    onRestore={() => {
                      const hasSelectedTask = !!selectedTaskId;
                      handleLayoutChange({
                        layout: hasSelectedTask ? ['left', 'middle', 'right'] : ['left', 'middle'],
                        leftView: 'list',
                        middleView: middleView,
                        rightView: 'details',
                        focus: null,
                      });
                    }}
                    onTaskUpdate={updatedFields => {
                      const sanitized = {
                        ...updatedFields,
                        project_id_int: updatedFields.project_id_int === null ? undefined : updatedFields.project_id_int,
                        parent_task_id_int: updatedFields.parent_task_id_int == null ? undefined : updatedFields.parent_task_id_int,
                      };
                      if (selectedTaskData && selectedTaskId && accessToken) {
                        queryClient.setQueryData(['task', selectedTaskId, accessToken], (old: any) => ({
                          ...old,
                          task: { ...old?.task, ...sanitized },
                        }));
                      }
                      if (onTaskUpdate) onTaskUpdate(sanitized);
                    }}
                    onAddSubtask={onAddSubtask}
                    onDuplicateTask={handleDuplicateTask}
                    attachments={isSuggestionSelected ? [] : attachments}
                    threadId={isSuggestionSelected ? null : threadId}
                    mentions={isSuggestionSelected ? EMPTY_LIST : (mentions || EMPTY_LIST)}
                    watchers={isSuggestionSelected ? EMPTY_LIST : (watchers || EMPTY_LIST)}
                    currentUser={null}
                    subtasks={isSuggestionSelected ? EMPTY_LIST : (subtasks || EMPTY_LIST)}
                    project_watchers={isSuggestionSelected ? EMPTY_LIST : (project_watchers || EMPTY_LIST)}
                    accessToken={accessToken}
                    mode={isSuggestionSelected ? 'suggestion' : 'task'}
                    isBootstrapLoaded={isBootstrapLoadedForSelectedTask}
                    onActiveFieldContextChange={setActiveFieldContext}
                    onAiPaneOpenChange={setIsTaskAiPaneOpen}
                    onDetailStackBack={taskDetailStackBack}
                  />
              </div>
              {!isSuggestionSelected && isTaskAiPaneOpen ? (
                <>
                  <div
                    className="w-px shrink-0 cursor-col-resize bg-gray-200 transition-colors hover:bg-gray-300"
                    onMouseDown={handleTaskDetailsAiDividerMouseDown}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize Task Details and AI pane"
                  />
                  <div className="h-full overflow-hidden" style={{ flex: `0 0 ${100 - taskDetailsPanePercent}%` }}>
                    <AiPane
                      isOpen={true}
                      onClose={() => handleTaskAiPaneOpenChange(false)}
                      initialScope="task"
                      taskId={selectedTaskId ? Number(selectedTaskId) : undefined}
                      inline={true}
                      activeFieldContext={activeFieldContext}
                      externalThreadId={searchOpenedAiThreadId}
                    />
                  </div>
                </>
              ) : null}
              {!isSuggestionSelected && !isTaskAiPaneOpen ? (
                <div className="w-10 border-l bg-white flex items-start justify-center pt-3">
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    onClick={() => handleTaskAiPaneOpenChange(true)}
                    aria-label="Open AI chat pane"
                    title="Open AI chat pane"
                  >
                    <PanelRight className="w-4 h-4" />
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </Panel>
      </PanelGroup>

      {/* Expanded detail overlay: full width/height below global header (same behavior as Project Tasks) */}
      {focus === 'right' && middleView !== 'ai-build' && isRightPaneVisible && selectedTaskId && (
        <div
          className="fixed left-0 right-0 bottom-0 z-[25] bg-white border-l border-gray-200 flex flex-col"
          style={{ top: '64px' }}
          aria-label="Expanded task details"
        >
          <div className="h-full flex">
            <div
              className={cn("h-full overflow-hidden", !isSuggestionSelected && isTaskAiPaneOpen ? "border-r" : "flex-1")}
              style={!isSuggestionSelected && isTaskAiPaneOpen ? { flex: `0 0 ${taskDetailsPanePercent}%` } : undefined}
            >
              <TaskDetails
                  isCollapsed={isDetailsCollapsed}
                  selectedTask={isSuggestionSelected ? (selectedSuggestionAsTask as any) : selectedTaskData}
                  onClose={handleCloseDetails}
                  onCollapse={handleCloseDetails}
                  isExpanded={true}
                  onExpand={() => handleLayoutChange({ focus: 'right' })}
                  onRestore={() => {
                    const hasSelectedTask = !!selectedTaskId;
                    handleLayoutChange({
                      layout: hasSelectedTask ? ['left', 'middle', 'right'] : ['left', 'middle'],
                      leftView: 'list',
                      middleView: middleView,
                      rightView: 'details',
                      focus: null,
                    });
                  }}
                  onTaskUpdate={updatedFields => {
                    const sanitized = {
                      ...updatedFields,
                      project_id_int: updatedFields.project_id_int === null ? undefined : updatedFields.project_id_int,
                      parent_task_id_int: updatedFields.parent_task_id_int == null ? undefined : updatedFields.parent_task_id_int,
                    };
                    if (selectedTaskData && selectedTaskId && accessToken) {
                      queryClient.setQueryData(['task', selectedTaskId, accessToken], (old: any) => ({
                        ...old,
                        task: { ...old?.task, ...sanitized },
                      }));
                    }
                    if (onTaskUpdate) onTaskUpdate(sanitized);
                  }}
                  onAddSubtask={onAddSubtask}
                  onDuplicateTask={handleDuplicateTask}
                  attachments={isSuggestionSelected ? [] : attachments}
                  threadId={isSuggestionSelected ? null : threadId}
                  mentions={isSuggestionSelected ? EMPTY_LIST : (mentions || EMPTY_LIST)}
                  watchers={isSuggestionSelected ? EMPTY_LIST : (watchers || EMPTY_LIST)}
                  currentUser={null}
                  subtasks={isSuggestionSelected ? EMPTY_LIST : (subtasks || EMPTY_LIST)}
                  project_watchers={isSuggestionSelected ? EMPTY_LIST : (project_watchers || EMPTY_LIST)}
                  accessToken={accessToken}
                  mode={isSuggestionSelected ? 'suggestion' : 'task'}
                  isBootstrapLoaded={isBootstrapLoadedForSelectedTask}
                  onActiveFieldContextChange={setActiveFieldContext}
                  onAiPaneOpenChange={handleTaskAiPaneOpenChange}
                  onDetailStackBack={taskDetailStackBack}
                />
            </div>
            {!isSuggestionSelected && isTaskAiPaneOpen ? (
              <>
                <div
                  className="w-px shrink-0 cursor-col-resize bg-gray-200 transition-colors hover:bg-gray-300"
                  onMouseDown={handleTaskDetailsAiDividerMouseDown}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Task Details and AI pane"
                />
                <div className="h-full overflow-hidden" style={{ flex: `0 0 ${100 - taskDetailsPanePercent}%` }}>
                  <AiPane
                    isOpen={true}
                    onClose={() => handleTaskAiPaneOpenChange(false)}
                    initialScope="task"
                    taskId={selectedTaskId ? Number(selectedTaskId) : undefined}
                    inline={true}
                    activeFieldContext={activeFieldContext}
                    externalThreadId={searchOpenedAiThreadId}
                  />
                </div>
              </>
            ) : null}
            {!isSuggestionSelected && !isTaskAiPaneOpen ? (
              <div className="w-10 border-l bg-white flex items-start justify-center pt-3">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  onClick={() => handleTaskAiPaneOpenChange(true)}
                  aria-label="Open AI chat pane"
                  title="Open AI chat pane"
                >
                  <PanelRight className="w-4 h-4" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

    </div>
  );
}
