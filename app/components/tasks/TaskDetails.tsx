"use client"

import { cn } from "@/lib/utils"
import { useEffect, useState, useRef, useCallback, useMemo, Dispatch, SetStateAction } from "react"
import { Thread } from '../../types/task'
import { Button } from "../ui/button"
import { Trash2, Copy, Upload, Image as ImageIcon, X, ChevronLeft, ChevronsLeft, Maximize2, Minimize2, ChevronRight, ChevronDown, PanelRight, ExternalLink, Bot, MoreHorizontal, Plus, Loader2, Check, Star, RefreshCw, Share2, Download, ClipboardCopy, History } from "lucide-react"
import { RichTextEditor } from "../ui/rich-text-editor"
import {
  COMPONENT_OUTPUT_EDITOR_CLASS,
  COMPONENT_OUTPUT_FONT_SIZE_PX,
} from "../../../features/tasks/components/component-output-body-shared"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import type { AiActiveFieldContext } from "../../../features/ai-chat/active-field-context"
import dynamic from "next/dynamic"
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover"
import { Button as UIButton } from "../ui/button"
// import { getUsersForProject } from '../../lib/services/users'
import { AddCommentInput } from "../comments-section/add-comment-input"
import { getTaskById } from '../../../lib/services/tasks'
import type { Task as BaseTask, ReviewData } from '../../lib/types/tasks'
import { updateItemInStore } from '../../../hooks/use-infinite-query'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { bumpAndInvalidateHomeSidebarRecent } from '../../lib/home-sidebar-recents-cache'
import { trackGlobalObjectOpen } from '../../lib/services/global-search'
import { flushSync } from 'react-dom'
import { Dropzone, type DropzoneHandle } from '../dropzone'
import { useTaskAttachmentsUpload } from '../../hooks/use-task-attachments-upload'
import { useTaskWatchers } from '../../hooks/use-task-watchers'
import {
  normalizeBootstrapRelatedIdeas,
  type TaskBootstrapTaskWatcher,
} from '@/lib/types/task-details-bootstrap'
import { AddTaskForm } from './AddTaskForm'
import { Dialog, DialogContent, DialogTitle, DialogTrigger, DialogFooter } from '../ui/dialog'
import { MultiSelect } from '../ui/multi-select'
import { toast } from '../ui/use-toast'
import {
  removeTaskFromAllStores,
  removeTaskIdFromTasksQueryArrays,
  updateTaskInAllStores,
  updateTaskInCaches,
  normalizeTask,
} from './task-cache-utils'
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ParentTaskSelect } from './ParentTaskSelect';
import debounce from 'lodash.debounce';
import { TaskCommentsListPart, TaskCommentsInputPart, TaskCommentsFooterPart } from "../comments-section/task-comments-panel"
import { useTaskEditFields } from '../../hooks/use-task-edit-fields';
import { useTypesenseInfiniteQuery } from '../../hooks/use-typesense-infinite-query';
import { getTypesenseUpdater, removeTaskFromTypesenseStore } from '../../store/typesense-tasks';
import { useTaskGrouping } from '../../store/task-grouping'
import { useMobileDetection } from '../../hooks/use-mobile-detection';
import { TaskReviewSummary } from './TaskReviewSummary';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { TaskContentTab } from '../../../features/tasks/components/TaskContentTab'
import { ArtifactWorkspace } from '../../../features/artifacts/ArtifactWorkspace'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { UserAvatar } from "@/components/UserAvatar";
import { ProjectBadge } from "@/components/ProjectBadge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command"
import { getImageUrl } from "../../lib/public-media"
import { flushPendingEdits } from "../../lib/task-suggestions/pending-edits"
import { usePlannerOptimisticTasks } from "../../store/planner-optimistic-tasks"
import { useTaskComposerStore } from "../../store/task-composer-store"
import { submitTaskReview } from "./review-submit"
import { useTasksScope } from "../../contexts/tasks-scope-context"
import { buildCenterPaneSelectionSearchParams, type CenterPaneEntity } from "../../lib/center-pane-selection-url"
import { shallowReplaceSearchParams } from "../../lib/tasks-shallow-nav"
import { buildGenericTaskPrompt } from "../../../features/ai-chat/ai-utils"
import { TASK_PANE_HEADER_ROW_CLASS, TASK_PANE_HEADER_SHELL_CLASS } from "./pane-header-tokens"
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs"
import { TaskOverviewPreviews } from "./task-overview-previews"

const EMPTY_ARR: any[] = []
const NONE_OPTION = "__none__"
const TASK_TABS = ["overview", "attachments", "content", "artifacts", "activity", "reviews", "comments"] as const

type TaskTab = (typeof TASK_TABS)[number]

interface TaskDetailsProps {
  isCollapsed: boolean
  selectedTask: Task & {
    threads?: any[];
    mentions?: any[];
    thread_watchers?: any[];
    review_data?: ReviewData | null;
  };
  /**
   * Render TaskDetails for a suggestion (AI-generated), in read-only mode.
   * Uses the same UI but avoids task-only behaviors (mutations, watchers, attachments, comments).
   */
  mode?: 'task' | 'suggestion'
  onClose: () => void
  onCollapse?: () => void
  isExpanded?: boolean
  onExpand?: () => void
  onRestore?: () => void
  onTaskUpdate?: (updatedFields: Partial<Task>) => void
  onAddSubtask?: (parentTaskId: number, projectId: number) => void
  onDuplicateTask?: (initialValues: any, options?: { onSuccess?: (task: any) => void | Promise<void> }) => void
  attachments?: any[]
  threadId?: number | null
  mentions?: any[]
  watchers?: any[]
  currentUser?: any
  subtasks?: any[]
  project_watchers?: any[]
  accessToken?: string | null
  onOptimisticUpdate?: (task: any) => void;
  pathname?: string
  /**
   * When true, TaskDetails will NOT read/write tab state into the URL.
   * This is important when TaskDetails is embedded inside other pages (e.g. Inbox 3rd pane),
   * so changing tabs doesn't trigger unrelated page rerenders.
   */
  disableUrlSync?: boolean
  isBootstrapLoaded?: boolean
  onActiveFieldContextChange?: (context: AiActiveFieldContext) => void
  onAiPaneOpenChange?: (isOpen: boolean) => void
  /** Shown when drilling into a task from another entity (e.g. user detail stack); clears task selection only. */
  onDetailStackBack?: () => void
  /** Mobile-only: renders a back chevron in the header so the embedding shell does not need its own header. */
  onMobileBack?: () => void
}

const TaskActivityTimeline = dynamic(() => import("../task-activity/task-activity-timeline").then(m => m.TaskActivityTimeline), { ssr: false })

// Extend Task type locally to include denormalized fields if missing
// id should be string for compatibility with main Task type

type Task = Omit<BaseTask, 'id' | 'assigned_to_id' | 'project_id_int' | 'content_type_id' | 'production_type_id' | 'language_id' | 'project_status_id'> & {
  id: string;
  assigned_to_id: string;
  project_id_int: number | null;
  content_type_id: string;
  production_type_id: string;
  language_id: string;
  project_status_id: string;
  assigned_to_name: string | null;
  project_name: string | null;
  project_color: string | null;
  project_status_name: string | null;
  project_status_color: string | null;
  content_type_title: string | null;
  production_type_title: string | null;
  language_code: string | null;
  meta_title?: string;
  meta_description?: string;
  keyword?: string;
  channel_names: string[];
  parent_task_id_int?: number | null;
  copy_post?: string | null;
  briefing?: string | null;
  notes?: string | null;
  key_visual_attachment_id?: string | null;
  is_overdue?: boolean;
  is_publication_overdue?: boolean;
};

type TaskActiveFieldContext = AiActiveFieldContext

type TaskRelatedIdeaRow = {
  id: string
  task_id: number
  project_id: number | null
  title: string | null
  description: string | null
  content_type_id: number | null
  status: string
}

// Helper to attach abortSignal if available
function withAbortSignal(query: any, signal: AbortSignal) {
  if (query && typeof query.abortSignal === 'function') {
    return query.abortSignal(signal);
  }
  return query;
}

// Canonical editable source fields. These are the ONLY fields ever persisted to
// the tasks table via autosave. Everything else (denormalized display fields,
// computed columns like is_overdue/search_vector, and channel_names) is derived
// by DB triggers, so the client must never send it. Using an allowlist keeps the
// PATCH payload minimal and avoids trigger-heavy work that can cause timeouts.
const TASK_EDITABLE_SOURCE_FIELDS = new Set<string>([
  'title',
  'notes',
  'briefing',
  'project_id_int',
  'assigned_to_id',
  'delivery_date',
  'publication_date',
  'project_status_id',
  'content_type_id',
  'production_type_id',
  'language_id',
]);

// Denormalized/computed fields recomputed by DB triggers. Never sent from the
// client. Kept for documentation and defensive reference.
const TASK_DISPLAY_ONLY_FIELDS = new Set<string>([
  'project_name',
  'project_color',
  'project_logo',
  'assigned_to_name',
  'assigned_to_photo',
  'project_status_name',
  'project_status_color',
  'content_type_title',
  'production_type_title',
  'language_code',
  'is_overdue',
  'is_publication_overdue',
  'search_vector',
  'channel_names',
]);

// Longer idle debounce so a real editing session (open a dropdown, choose an
// option, move to the next field) coalesces into a SINGLE PATCH. The timer is
// reset on every field change and only flushes once the user goes idle.
const TASK_AUTOSAVE_DEBOUNCE_MS = 1500;

// Keep ONLY canonical editable source fields (allowlist) and drop undefined
// values. Display/computed fields are derived by the DB trigger from the ids.
function buildCanonicalTaskPatch(fields: Record<string, any>): Record<string, any> {
  const canonical: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!TASK_EDITABLE_SOURCE_FIELDS.has(key)) continue;
    if (value === undefined) continue;
    canonical[key] = value;
  }
  return canonical;
}

// --- Module-level task autosave queue ----------------------------------------
// The queue lives at MODULE scope (not component state) so it survives
// TaskDetails remounts that can happen between field edits — e.g. optimistic
// cache updates, tab/channel changes, or URL param changes that re-key the pane.
// This is what guarantees sequential edits coalesce into one PATCH regardless of
// re-renders/remounts. Keyed by task id.
type TaskAutosaveEntry = {
  pending: Record<string, any>;
  needsListInvalidation: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  supabase: any;
  queryClient: QueryClient;
};

const taskAutosaveQueue = new Map<string, TaskAutosaveEntry>();

async function runTaskAutosaveLoop(taskId: string): Promise<void> {
  const entry = taskAutosaveQueue.get(taskId);
  if (!entry || entry.inFlight) return;
  if (Object.keys(entry.pending).length === 0) return;

  const queryClient = entry.queryClient;
  entry.inFlight = true;
  let sawError = false;
  let listInvalidationNeeded = false;
  try {
    // Drain the queue: edits that arrive while a save is in flight are queued
    // and sent as a follow-up patch on the next loop iteration.
    while (Object.keys(entry.pending).length > 0) {
      const payload = entry.pending;
      listInvalidationNeeded = listInvalidationNeeded || entry.needsListInvalidation;
      entry.pending = {};
      entry.needsListInvalidation = false;
      try {
        // Return minimal — no `.select('*')`. Optimistic cache already applied.
        const { error } = await entry.supabase
          .from('tasks')
          .update(payload)
          .eq('id', taskId);
        if (error) throw error;
      } catch (err) {
        sawError = true;
        toast({
          title: 'Failed to save changes',
          description: (err as Error)?.message || 'An error occurred while saving.',
          variant: 'destructive',
        });
      }
    }
  } finally {
    entry.inFlight = false;
  }

  if (!sawError && queryClient) {
    // Refetch once, after the batch settles (not after every field change).
    queryClient.invalidateQueries({ queryKey: ['task', String(taskId)] });
    if (listInvalidationNeeded) {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-bootstrap'] });
    }
  }
}

function enqueueTaskPatch(
  taskId: string,
  canonicalFields: Record<string, any>,
  requiresListInvalidation: boolean,
  deps: { supabase: any; queryClient: QueryClient }
): void {
  if (Object.keys(canonicalFields).length === 0) return;
  let entry = taskAutosaveQueue.get(taskId);
  if (!entry) {
    entry = {
      pending: {},
      needsListInvalidation: false,
      timer: null,
      inFlight: false,
      supabase: deps.supabase,
      queryClient: deps.queryClient,
    };
    taskAutosaveQueue.set(taskId, entry);
  }
  // Always refresh to the latest client instances for the in-flight flush.
  entry.supabase = deps.supabase;
  entry.queryClient = deps.queryClient;
  Object.assign(entry.pending, canonicalFields);
  if (requiresListInvalidation) entry.needsListInvalidation = true;
  // Reset the idle debounce on every field change.
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    const current = taskAutosaveQueue.get(taskId);
    if (current) current.timer = null;
    void runTaskAutosaveLoop(taskId);
  }, TASK_AUTOSAVE_DEBOUNCE_MS);
}

// Flush a specific task's pending patch immediately (best-effort). Used on hard
// page unload. Normal in-app navigation relies on the debounce timer, which
// keeps running because the queue lives at module scope.
function flushTaskAutosave(taskId: string): void {
  const entry = taskAutosaveQueue.get(taskId);
  if (!entry) return;
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  if (Object.keys(entry.pending).length > 0) {
    void runTaskAutosaveLoop(taskId);
  }
}

function flushAllTaskAutosaves(): void {
  taskAutosaveQueue.forEach((_entry, taskId) => flushTaskAutosave(taskId));
}

// Register a single global handler so pending edits are flushed on page unload
// (hard navigation / tab close). Bound once per window.
if (typeof window !== 'undefined' && !(window as any).__taskAutosaveUnloadBound) {
  (window as any).__taskAutosaveUnloadBound = true;
  window.addEventListener('pagehide', flushAllTaskAutosaves);
  window.addEventListener('beforeunload', flushAllTaskAutosaves);
}

// Helper to update nested fields for optimistic updates
function applyNestedOptimisticFields(task: any, updatedFields: any): any {
  let patch: any = {};
  if ('assigned_to_id' in updatedFields || 'assigned_to_name' in updatedFields) {
    patch.assigned_user = updatedFields.assigned_to_id || updatedFields.assigned_to_name
      ? {
          id: updatedFields.assigned_to_id ?? task.assigned_to_id,
          full_name: updatedFields.assigned_to_name ?? task.assigned_to_name,
        }
      : null;
  }
  if ('project_id_int' in updatedFields || 'project_name' in updatedFields || 'project_color' in updatedFields) {
    patch.projects = updatedFields.project_id_int || updatedFields.project_name
      ? {
          id: updatedFields.project_id_int ?? task.project_id_int,
          name: updatedFields.project_name ?? task.project_name,
          color: updatedFields.project_color ?? task.project_color,
        }
      : null;
  }
  if ('project_status_id' in updatedFields || 'project_status_name' in updatedFields || 'project_status_color' in updatedFields) {
    patch.project_statuses = updatedFields.project_status_id || updatedFields.project_status_name
      ? {
          id: updatedFields.project_status_id ?? task.project_status_id,
          name: updatedFields.project_status_name ?? task.project_status_name,
          color: updatedFields.project_status_color ?? task.project_status_color,
        }
      : null;
  }
  return { ...updatedFields, ...patch };
}

export function TaskDetails({
  isCollapsed,
  selectedTask,
  mode = 'task',
  onClose,
  onCollapse,
  isExpanded = false,
  onExpand,
  onRestore,
  onTaskUpdate,
  onAddSubtask,
  onDuplicateTask,
  attachments = [],
  threadId,
  mentions,
  watchers,
  currentUser,
  subtasks = [],
  project_watchers,
  accessToken,
  onOptimisticUpdate,
  pathname: customPathname,
  disableUrlSync = false,
  isBootstrapLoaded = true,
  onActiveFieldContextChange,
  onAiPaneOpenChange,
  onDetailStackBack,
  onMobileBack,
}: TaskDetailsProps) {
  const isMobile = useMobileDetection();
  const isSuggestionMode = mode === 'suggestion' || (selectedTask as any)?.kind === 'suggestion'
  // Keep suggestion mode on the same overview layout; heavy controls are still selectively gated below.
  const canEdit = !!selectedTask && !isSuggestionMode
  
  console.log('TaskDetails props:', { selectedTask, attachments });
  console.log('DEBUG: selectedTask', selectedTask);
  console.log('DEBUG: selectedTask keys', selectedTask ? Object.keys(selectedTask) : null);
  console.log('DEBUG: selectedTask.thread_id', (selectedTask as any)?.thread_id);

  // Do not return early if !selectedTask. Always render the component and call all hooks unconditionally.

  // Always render the static UI. Use isLoading to control value rendering.
  const isLoading = !selectedTask;
  const task = selectedTask ? normalizeTask(selectedTask) : undefined;
  console.log('TaskDetails task:', task);
  const taskBuildInstructions = useMemo(() => {
    if (!task) return ""
    return buildGenericTaskPrompt({
      projectTitle: task.project_name || null,
      contentTypeTitle: task.content_type_title || null,
      taskTitle: task.title,
      taskNotes: task.notes || null,
      taskBriefing: task.briefing || null,
      languageCode: task.language_code || null,
    })
  }, [
    task?.project_name,
    task?.content_type_title,
    task?.title,
    task?.notes,
    task?.briefing,
    task?.language_code,
  ])

  // Derived media URLs (storage path -> public URL) for rendering.
  const projectLogoUrl = useMemo(
    () => getImageUrl((task as any)?.project?.logo ?? (task as any)?.project_logo ?? null),
    [(task as any)?.project?.logo, (task as any)?.project_logo],
  )
  const assignedUserPhotoUrl = useMemo(
    () => getImageUrl((task as any)?.assigned_user?.photo ?? (task as any)?.assigned_to_photo ?? null),
    [(task as any)?.assigned_user?.photo, (task as any)?.assigned_to_photo],
  )

  const taskIdNum = isSuggestionMode
    ? undefined
    : (task ? (typeof task.id === 'number' ? task.id : Number(task.id)) : undefined);

  /** Prefer non-empty merged task payload, then explicit `attachments` prop (some callers put files only on bootstrap root). */
  const displayAttachments = useMemo(() => {
    const fromTask = (selectedTask as { attachments?: unknown } | null)?.attachments
    const fromProp = attachments
    const a = Array.isArray(fromTask) ? fromTask : null
    const b = Array.isArray(fromProp) ? fromProp : null
    if (a && a.length > 0) return a
    if (b && b.length > 0) return b
    if (a) return a
    if (b) return b
    return []
  }, [selectedTask, attachments])

  const contextOnClose = onClose;
  const router = useRouter();
  const queryClient = useQueryClient();
  const supabase = createClientComponentClient(); // <-- Move here for all usages
  const upsertOptimisticPlannerTask = usePlannerOptimisticTasks((s) => s.upsert)
  const openComposer = useTaskComposerStore((s) => s.openComposer)
  const searchParams = useSearchParams();
  const actualPathname = usePathname();
  const { basePath, preserveQueryKeys } = useTasksScope();
  const pathname = customPathname || actualPathname || basePath;
  const commentThreadIdFromUrl = searchParams.get("commentThreadId");
  const tasksBasePath = basePath;
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  useEffect(() => {
    async function fetchCurrentUserId() {
      const { data: authData } = await supabase.auth.getUser();
      const authUserId = authData?.user?.id;
      if (!authUserId) return;
      const { data: userRows } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', authUserId)
        .maybeSingle();
      if (userRows?.id) setCurrentUserId(userRows.id);
    }
    fetchCurrentUserId();
  }, []);

  const mergePreserveParams = useCallback((params: URLSearchParams) => {
    const next = new URLSearchParams(params.toString());
    if (preserveQueryKeys) {
      Object.entries(preserveQueryKeys).forEach(([k, v]) => next.set(k, v));
    }
    return next;
  }, [preserveQueryKeys]);

  /**
   * Open a related entity (project/user) in the center pane while preserving the
   * 3-pane layout + right AI pane + list/group/filter params. Clears any stale
   * center/detail/stack selection so no old task detail remains underneath.
   */
  const openCenterEntity = useCallback(
    (entity: CenterPaneEntity, id: string | number) => {
      if (id == null || String(id).trim().length === 0) return;
      const base = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : searchParams.toString(),
      );
      const next = buildCenterPaneSelectionSearchParams({ currentSearchParams: base, entity, id });
      // Drop stacked-detail params so the previous center object is fully replaced.
      next.delete("stackTaskId");
      next.delete("stackUserId");
      next.delete("stackTeamId");
      shallowReplaceSearchParams(pathname, next, "task-header-entity-open");
    },
    [pathname, searchParams],
  );
  const canLoadFollowups = isSuggestionMode || isBootstrapLoaded
  const tabFromUrlRaw = searchParams.get("taskTab") ?? searchParams.get("detailsTab")
  const initialTaskTab: TaskTab =
    tabFromUrlRaw === "details"
      ? "overview"
      : TASK_TABS.includes(tabFromUrlRaw as TaskTab)
      ? (tabFromUrlRaw as TaskTab)
      : "overview"
  const [localTaskTab, setLocalTaskTab] = useState<TaskTab>(initialTaskTab)
  const visibleTaskTabs: readonly TaskTab[] = isSuggestionMode ? (["overview"] as const) : TASK_TABS
  const urlTaskTab = visibleTaskTabs.includes(initialTaskTab) ? initialTaskTab : "overview"
  const activeTaskTab = visibleTaskTabs.includes(localTaskTab) ? localTaskTab : "overview"
  const isCommentsTabActive = activeTaskTab === "comments"

  const setTaskTab = useCallback(
    (nextTab: TaskTab) => {
      const normalizedTab = visibleTaskTabs.includes(nextTab) ? nextTab : "overview"
      setLocalTaskTab((prev) => (prev === normalizedTab ? prev : normalizedTab))
      if (disableUrlSync) {
        return
      }
      const currentParams = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : searchParams.toString()
      )
      const nextParams = new URLSearchParams(currentParams.toString())
      const centerTaskId = nextParams.get("centerTaskId")
      const rightTaskId = nextParams.get("rightTaskId")
      if (centerTaskId && rightTaskId) {
        nextParams.delete("rightTaskId")
      } else if (!centerTaskId && rightTaskId) {
        nextParams.set("centerTaskId", rightTaskId)
        nextParams.delete("rightTaskId")
      }
      nextParams.set("taskTab", normalizedTab)
      if (normalizedTab === "content") {
        nextParams.delete("focusOutputs")
      }
      nextParams.delete("detailsTab")
      const current = currentParams.toString()
      const next = nextParams.toString()
      if (current === next) return
      const nextUrl = next ? `${pathname}?${next}` : pathname
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", nextUrl)
      }
    },
    [disableUrlSync, pathname, searchParams, visibleTaskTabs]
  )

  useEffect(() => {
    setLocalTaskTab((prev) => (prev === urlTaskTab ? prev : urlTaskTab))
  }, [urlTaskTab])

  const [isTabsHovered, setIsTabsHovered] = useState(false)
  const tabsScrollRef = useRef<HTMLDivElement | null>(null)
  const [isContentSectionExpanded, setIsContentSectionExpanded] = useState(false);
  
  const rawTaskWatchersBootstrap = (selectedTask as { task_watchers?: TaskBootstrapTaskWatcher[] } | null)
    ?.task_watchers
  const rawEligibleTaskWatchersBootstrap = (
    selectedTask as { eligible_task_watchers?: TaskBootstrapTaskWatcher[] } | null
  )?.eligible_task_watchers

  const {
    watchers: taskWatchers,
    eligible: eligibleTaskWatchers,
    isWatchersLoading: isTaskWatchersLoading,
    isMutating: isTaskWatchersMutating,
    watchersError: taskWatchersError,
    mutationError: taskWatchersMutationError,
    addWatchers,
    removeWatcher,
  } = useTaskWatchers(taskIdNum, {
    seedFromBootstrap: !isSuggestionMode && !!taskIdNum,
    initialTaskWatchers: rawTaskWatchersBootstrap,
    initialEligibleTaskWatchers: rawEligibleTaskWatchersBootstrap,
  });
  const [isAddWatcherOpen, setIsAddWatcherOpen] = useState(false);
  const [isRefreshingRelatedIdeas, setIsRefreshingRelatedIdeas] = useState(false);
  const [ideaActionById, setIdeaActionById] = useState<Record<string, "accepted" | "dismissed" | null>>({});
  
  // Handle AI build state from URL
  useEffect(() => {
    const middleView = searchParams.get('middleView');
    setIsAiBuildOpen(middleView === 'ai-build');
  }, [searchParams]);
  // Guard: if selectedTask is null, show loading state

  // Use threads, mentions, and thread_watchers from props (Edge Function response)
  // Map the Edge Function response to the UI structure for the first thread
  const firstThreadId = selectedTask ? (selectedTask as any)['thread_id'] : undefined;
  // Use a stable empty-array fallback (EMPTY_ARR) instead of a fresh `[]` literal: this value feeds
  // the dependency array of the "reset thread state when task changes" effect below. In suggestion
  // mode `selectedTask.mentions` is undefined, so a new `[]` every render would re-run that effect
  // and re-set state on every render -> "Maximum update depth exceeded".
  const firstThreadMentions = selectedTask && Array.isArray(selectedTask.mentions) ? selectedTask.mentions : EMPTY_ARR;
  const firstThreadWatchers = selectedTask && Array.isArray((selectedTask as any)['watchers']) ? (selectedTask as any)['watchers'] : [];
  
  // Extract parent task data from the selectedTask if available
  const parentTaskData = selectedTask ? (selectedTask as any)['parent_task'] : null;
  
  // Debug log for parent task data
  console.log('DEBUG: parentTaskData', parentTaskData);
  
  const firstThread = firstThreadId
    ? {
        id: firstThreadId,
        // Optionally add title, created_at, etc if available from selectedTask
        thread_watchers: firstThreadWatchers.map((w: any) => ({
          watcher_id: w.watcher_id,
          users: w.users,
        })),
      }
    : null;

  // Use this mapped thread for initial state
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);

  // Debug log for selectedTask.thread_id
  console.log('DEBUG: selectedTask.thread_id', (selectedTask as any)?.thread_id);

  const [allTaskMentions, setAllTaskMentions] = useState<any[]>(firstThreadMentions)
  const [commentsStatusFilter, setCommentsStatusFilter] = useState<"all" | "open" | "resolved">("all")
  const [isThreadView, setIsThreadView] = useState(false)
  
  // Add useEffect to reset all thread-related state when task changes
  useEffect(() => {
    if (!selectedTask) return;
    
    // Reset thread-related state when task changes
    const taskThreadId = (selectedTask as any)?.thread_id;
    
    // Reset pending participants state
    setPendingParticipants([]);
    setRemovedParticipants([]);
    setIsAddingThread(false);
    
    // Default comments panel mode is all-thread/all-mentions.
    setIsThreadView(false)
    setSelectedThreadId(null);
    setCommentsStatusFilter("all");
    setAllTaskMentions(firstThreadMentions);
    if (taskThreadId) {
      const seededFirstThread = {
        id: taskThreadId,
        title: 'Thread',
        created_at: new Date().toISOString(),
        thread_watchers: Array.isArray(watchers) ? watchers.map((w: any) => ({
          watcher_id: w.watcher_id,
          users: w.users
        })) : [],
        mention_count: firstThreadMentions.length,
        latest_activity_at: firstThreadMentions[firstThreadMentions.length - 1]?.created_at ?? new Date().toISOString(),
        is_resolved: false,
        thread_type: "general",
      };
      setThreadsList([seededFirstThread]);
    } else {
      setThreadsList([]);
    }
  }, [selectedTask?.id, (selectedTask as any)?.thread_id, watchers, firstThreadMentions]);

  const [threadsList, setThreadsList] = useState<any[]>([]);
  const [isThreadListLoading, setIsThreadListLoading] = useState(false);
  const [threadListError, setThreadListError] = useState<string | null>(null);
  const threadHistoryLoadedTaskIdRef = useRef<number | null>(null);
  const threadHistoryInFlightRef = useRef(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState("")
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [resolvingThreadIds, setResolvingThreadIds] = useState<Set<number>>(new Set())
  const [isAiBuildOpen, setIsAiBuildOpen] = useState(false)
  const [canCopyAllChannelContent, setCanCopyAllChannelContent] = useState(false)
  const [copyExportDiagnostics, setCopyExportDiagnostics] = useState({
    channelId: null as number | null,
    componentCount: 0,
    copyableComponentCount: 0,
  })
  const [pendingOutputAnchor, setPendingOutputAnchor] = useState<{
    taskComponentOutputId: string
    attachmentId: string | null
    anchorType: "image_point"
    anchorX: number
    anchorY: number
    anchorData?: unknown
  } | null>(null)
  const [commentsComposerFocusToken, setCommentsComposerFocusToken] = useState(0)
  const taskDetailsLayoutRef = useRef<HTMLDivElement | null>(null)
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null)

  useEffect(() => {
    setActiveChannelId(null)
  }, [task?.id])

  useEffect(() => {
    console.log("[task-details-copy-debug-version]", "2026-06-24-copy-debug-v1")
  }, [])

  useEffect(() => {
    const onExportActionsState = (event: Event) => {
      const customEvent = event as CustomEvent<{
        taskId?: number
        canCopyAllChannelContent?: boolean
        channelId?: number | null
        componentCount?: number
        copyableComponentCount?: number
      }>
      if (customEvent.detail?.taskId !== taskIdNum) return
      setCanCopyAllChannelContent(!!customEvent.detail?.canCopyAllChannelContent)
      setCopyExportDiagnostics({
        channelId: customEvent.detail?.channelId ?? null,
        componentCount: customEvent.detail?.componentCount ?? 0,
        copyableComponentCount: customEvent.detail?.copyableComponentCount ?? 0,
      })
    }
    window.addEventListener("task-details:export-actions-state", onExportActionsState as EventListener)
    return () => {
      window.removeEventListener("task-details:export-actions-state", onExportActionsState as EventListener)
    }
  }, [taskIdNum])

  useEffect(() => {
    if (!taskIdNum) return
    console.log("[copy-content-render-header]", {
      taskId: taskIdNum,
      channelId: activeChannelId ?? copyExportDiagnostics.channelId,
      hasComponents: copyExportDiagnostics.componentCount,
      hasRenderableOutputs: copyExportDiagnostics.copyableComponentCount,
      canCopyAllChannelContent,
    })
  }, [
    taskIdNum,
    activeChannelId,
    copyExportDiagnostics,
    canCopyAllChannelContent,
  ])

  useEffect(() => {
    if (!commentThreadIdFromUrl) return
    const parsedThreadId = Number(commentThreadIdFromUrl)
    if (!Number.isFinite(parsedThreadId)) return
    setTaskTab("comments")
    setIsThreadView(true)
    setIsAddingThread(false)
    setSelectedThreadId((prev) => (prev === parsedThreadId ? prev : parsedThreadId))
  }, [commentThreadIdFromUrl, setTaskTab])

  const replaceCommentThreadInUrl = useCallback((threadId: number | null) => {
    const nextParams = new URLSearchParams(searchParams.toString())
    if (threadId != null && Number.isFinite(threadId)) {
      nextParams.set("commentsView", "thread")
      nextParams.set("commentThreadId", String(threadId))
    } else {
      nextParams.delete("commentsView")
      nextParams.delete("commentThreadId")
    }
    const nextSearch = nextParams.toString()
    const currentSearch = searchParams.toString()
    if (nextSearch === currentSearch) return
    router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname, { scroll: false })
  }, [pathname, router, searchParams])

  const openCommentThreadView = useCallback((threadId: number) => {
    if (!Number.isFinite(threadId)) return
    setIsThreadView(true)
    setIsAddingThread(false)
    setSelectedThreadId(threadId)
    replaceCommentThreadInUrl(threadId)
  }, [replaceCommentThreadInUrl])

  const showAllCommentThreadsView = useCallback(() => {
    setIsThreadView(false)
    setIsAddingThread(false)
    replaceCommentThreadInUrl(null)
  }, [replaceCommentThreadInUrl])

  useEffect(() => {
    const handleOpenComments = (event: Event) => {
      const customEvent = event as CustomEvent<{
        taskId?: number | null
        threadId?: number | null
        focusComposer?: boolean
        mode?: "compose" | "view"
        anchor?: {
          type?: "image_point"
          task_component_output_id?: string
          attachment_id?: string | null
          anchor_x?: number | null
          anchor_y?: number | null
          anchor_data?: unknown
        } | null
      }>
      const targetTaskId = Number(customEvent.detail?.taskId)
      const currentTaskId = Number(selectedTask?.id)
      if (Number.isFinite(targetTaskId) && Number.isFinite(currentTaskId) && targetTaskId !== currentTaskId) return
      const incomingThreadId = Number(customEvent.detail?.threadId)
      setTaskTab("comments")
      const anchor = customEvent.detail?.anchor
      if (anchor?.type === "image_point" && typeof anchor.task_component_output_id === "string") {
        const anchorX = Number(anchor.anchor_x)
        const anchorY = Number(anchor.anchor_y)
        const clampedX = Number.isFinite(anchorX) ? Math.max(0, Math.min(1, anchorX)) : 0.5
        const clampedY = Number.isFinite(anchorY) ? Math.max(0, Math.min(1, anchorY)) : 0.5
        const nextAnchor = {
          taskComponentOutputId: anchor.task_component_output_id,
          attachmentId: typeof anchor.attachment_id === "string" ? anchor.attachment_id : null,
          anchorType: "image_point" as const,
          anchorX: clampedX,
          anchorY: clampedY,
          anchorData: anchor.anchor_data ?? null,
        }
        setPendingOutputAnchor(nextAnchor)
        const layout = (typeof window !== "undefined" && window.innerWidth >= 1200) ? "right" : "bottom"
        console.log("[comments pane] open for image anchor", {
          layout,
          pendingAnchor: nextAnchor,
          focusComposer: Boolean(customEvent.detail?.focusComposer),
        })
      }
      if (!(anchor?.type === "image_point")) {
        setPendingOutputAnchor(null)
      }
      if (customEvent.detail?.focusComposer) {
        setCommentsComposerFocusToken((prev) => prev + 1)
      }
      if (Number.isFinite(incomingThreadId)) {
        openCommentThreadView(incomingThreadId)
      } else {
        showAllCommentThreadsView()
      }
    }

    window.addEventListener("task-details:open-comments", handleOpenComments as EventListener)
    return () => {
      window.removeEventListener("task-details:open-comments", handleOpenComments as EventListener)
    }
  }, [openCommentThreadView, selectedTask?.id, showAllCommentThreadsView, setTaskTab])

  useEffect(() => {
    if (!isCommentsTabActive || !task) return
    const placement = (typeof window !== "undefined" && window.innerWidth >= 1200) ? "right" : "bottom"
    console.log("[comments tab] mounted", {
      paneId: "task-comments-tab",
      placement,
      taskId: task.id,
    })
  }, [isCommentsTabActive, task])

  // Inline edit states (title and meta only; dropdowns/date are always interactive when canEdit)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isEditingMetaTitle, setIsEditingMetaTitle] = useState(false)
  const [isEditingMetaDescription, setIsEditingMetaDescription] = useState(false)
  const [isEditingKeyword, setIsEditingKeyword] = useState(false)

  const titleInputRef = useRef<HTMLTextAreaElement>(null)

  // Use currentUser prop for chat
  const currentUserName = currentUser?.user_metadata?.full_name || currentUser?.email || '';
  const currentUserEmail = currentUser?.email || '';

  // Remove local user state and effect
  // const [currentUserId, setCurrentUserId] = useState<number | null>(null)
  // const [currentUserName, setCurrentUserName] = useState<string | null>(null)
  // const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null)
  // Remove all local thread fetching logic and state
  // const [threads, setThreads] = useState<Thread[]>([])
  // const [isCreatingThread, setIsCreatingThread] = useState(false)
  // const [chatError, setChatError] = useState<string | null>(null)

  // Remove old local state for participants
  // const [participants, setParticipants] = useState<any[]>([])
  const [isParticipantsLoading, setIsParticipantsLoading] = useState(false)
  const [showAddPopover, setShowAddPopover] = useState(false)

  // Restore local state for optimisticChannels
  const [optimisticChannels, setOptimisticChannels] = useState<string[]>(task?.channel_names || []);

  // Keep optimisticChannels in sync with task.channel_names
  useEffect(() => {
    if (!task) return;
    if (
      !Array.isArray(optimisticChannels) ||
      optimisticChannels.length !== (task.channel_names?.length || 0) ||
      !optimisticChannels.every((v, i) => v === task.channel_names?.[i])
    ) {
      setOptimisticChannels(task.channel_names || []);
    }
  }, [task?.channel_names]);

  // Handler to add a channel optimistically
  const handleAddChannel = (channelName: string) => {
    if (!optimisticChannels.includes(channelName)) {
      const next = [...optimisticChannels, channelName]
      setOptimisticChannels(next);
      if (isSuggestionMode) {
        // Meaningful edit → implicit approval. Best-effort persist to the new task if the column exists.
        void ensureSuggestionApproved('channel_names').then((taskId) => {
          if (!taskId) return
          void supabase.from('tasks').update({ channel_names: next }).eq('id', taskId)
        })
      } else {
        // Best-effort persist for tasks (if supported by schema)
        void supabase.from('tasks').update({ channel_names: next }).eq('id', task.id)
      }
    }
  };

  // Handler to remove a channel optimistically
  const handleRemoveChannel = (channelName: string) => {
    const next = optimisticChannels.filter(name => name !== channelName)
    setOptimisticChannels(next);
    if (isSuggestionMode) {
      void ensureSuggestionApproved('channel_names').then((taskId) => {
        if (!taskId) return
        void supabase.from('tasks').update({ channel_names: next }).eq('id', taskId)
      })
    } else {
      void supabase.from('tasks').update({ channel_names: next }).eq('id', task.id)
    }
  };

  // Pending participants for new thread (if no threads exist)
  const [pendingParticipants, setPendingParticipants] = useState<any[]>([]);
  const [removedParticipants, setRemovedParticipants] = useState<any[]>([]);
  const [isAddingThread, setIsAddingThread] = useState(false);

  useEffect(() => {
    if (isAddingThread || isThreadView) return
    if (typeof selectedThreadId === "number" && Number.isFinite(selectedThreadId)) return
    const mostRecentThreadId = (threadsList ?? [])
      .map((thread: any) => ({
        id: Number(thread?.id),
        ts: new Date(thread?.latest_activity_at ?? thread?.created_at ?? 0).getTime(),
      }))
      .filter((row: any) => Number.isFinite(row.id))
      .sort((a: any, b: any) => b.ts - a.ts)?.[0]?.id
    if (Number.isFinite(mostRecentThreadId)) {
      setSelectedThreadId(mostRecentThreadId)
    }
  }, [isAddingThread, isThreadView, selectedThreadId, threadsList])

  useEffect(() => {
    onActiveFieldContextChange?.({
      fieldType: "task",
      label: task?.title?.trim() || "Task",
      entityId: task?.id ?? null,
      instructions: taskBuildInstructions || null,
    })
  }, [task?.id, taskBuildInstructions, onActiveFieldContextChange])

  const setTaskFieldContext = useCallback((next: TaskActiveFieldContext) => {
    onActiveFieldContextChange?.({
      fieldType: next.fieldType || "task",
      label: next.label || "Task",
      entityId: next.entityId ?? null,
      componentId: next.componentId ?? null,
      instructions: next.instructions ?? null,
      taskId: next.taskId ?? null,
      channelId: next.channelId ?? null,
      taskComponentId: next.taskComponentId ?? null,
      taskComponentOutputId: next.taskComponentOutputId ?? null,
      componentTitle: next.componentTitle ?? null,
      taskTitle: next.taskTitle ?? null,
      channelName: next.channelName ?? null,
      selectedContextType: next.selectedContextType ?? null,
      componentSelectionSource: next.componentSelectionSource ?? null,
    })
  }, [onActiveFieldContextChange])

  const handleTaskDetailsFocusCapture = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    if (!target) return

    const explicitContextNode = target.closest<HTMLElement>("[data-ai-field-type]")
    if (explicitContextNode) {
      setTaskFieldContext({
        fieldType: explicitContextNode.dataset.aiFieldType || "task",
        label: explicitContextNode.dataset.aiFieldLabel || "Task",
        entityId: explicitContextNode.dataset.aiEntityId || null,
        componentId: explicitContextNode.dataset.aiComponentId || null,
        instructions: explicitContextNode.dataset.aiInstructions || null,
      })
      return
    }

    const isEditable =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable ||
      !!target.closest(".ql-editor")

    if (!isEditable) return

    setTaskFieldContext({
      fieldType: "task",
      label: task?.title?.trim() || "Task",
      entityId: task?.id ?? null,
      instructions: taskBuildInstructions || null,
    })
  }, [setTaskFieldContext, task?.id, task?.title, taskBuildInstructions])
  
  // Track optimistic assigned user for immediate filtering updates
  const [optimisticAssignedUserId, setOptimisticAssignedUserId] = useState<string | null>(null);
  const [optimisticAssignedUserName, setOptimisticAssignedUserName] = useState<string | null>(null);
  
  // Track optimistic project for immediate filtering updates
  const [optimisticProjectId, setOptimisticProjectId] = useState<string | null>(null);
  const [optimisticProjectName, setOptimisticProjectName] = useState<string | null>(null);
  const [optimisticProjectColor, setOptimisticProjectColor] = useState<string | null>(null);
  
  // Track optimistic status for immediate display updates
  const [optimisticStatusId, setOptimisticStatusId] = useState<string | null>(null);
  const [optimisticStatusName, setOptimisticStatusName] = useState<string | null>(null);
  const [optimisticStatusColor, setOptimisticStatusColor] = useState<string | null>(null);
  
  // Track optimistic dates for immediate display updates
  const [optimisticDueDate, setOptimisticDueDate] = useState<string | null>(null);
  const [optimisticPublicationDate, setOptimisticPublicationDate] = useState<string | null>(null);
  
  // Track optimistic content fields for immediate display updates
  const [optimisticContentTypeId, setOptimisticContentTypeId] = useState<string | null>(null);
  const [optimisticContentTypeTitle, setOptimisticContentTypeTitle] = useState<string | null>(null);
  const [optimisticProductionTypeId, setOptimisticProductionTypeId] = useState<string | null>(null);
  const [optimisticProductionTypeTitle, setOptimisticProductionTypeTitle] = useState<string | null>(null);
  const [optimisticLanguageId, setOptimisticLanguageId] = useState<string | null>(null);
  const [optimisticLanguageCode, setOptimisticLanguageCode] = useState<string | null>(null);
  
  // Track pending date changes for debounced updates
  const [pendingDueDate, setPendingDueDate] = useState<string | null>(null);
  const [pendingPublicationDate, setPendingPublicationDate] = useState<string | null>(null);

  // Optimistic Project Change
  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const projectId = e.target.value;
    const projectOption = editFields?.projects?.find((opt: any) => String(opt.id) === projectId);
    const projectName = projectOption && typeof projectOption.name === 'string' ? projectOption.name : undefined;
    // projectOption.color may not exist, so fallback to task.project_color
    const projectColor = (projectOption && 'color' in projectOption && typeof (projectOption as any).color === 'string')
      ? (projectOption as any).color
      : (task && typeof task.project_color === 'string' ? task.project_color : undefined);
    
    // Set optimistic state immediately for instant display updates
    setOptimisticProjectId(projectId || null);
    setOptimisticProjectName(projectName || null);
    setOptimisticProjectColor(projectColor || null);
    
    // Patch both foreign key and denormalized fields, including project_color
    handleFieldChange('project_id_int', projectId || undefined, { project_name: projectName, project_color: projectColor });
  };

  // Optimistic Assignee Change
  const handleAssigneeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    let selectedName = null;
    const selectedUser = filteredWatchers?.find((w: any) => String(w.user_id) === selectedId);
    if (selectedUser) {
      selectedName = selectedUser.users.full_name;
    } else {
      const option = e.target.selectedOptions[0];
      selectedName = option ? option.textContent : null;
    }
    const assigneeId = selectedId === '' ? undefined : selectedId;
    
    // Set optimistic state immediately for instant filtering updates
    setOptimisticAssignedUserId(assigneeId || null);
    setOptimisticAssignedUserName(selectedName);
    
    handleFieldChange('assigned_to_id', assigneeId || '', { assigned_to_name: selectedName });
    if (onTaskUpdate) {
      onTaskUpdate({ assigned_to_id: assigneeId, assigned_to_name: selectedName });
    }
  };

  // Optimistic Content Type Change
  const handleContentTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const contentTypeId = e.target.value === '' ? undefined : e.target.value;
    const contentTypeOption = filteredContentTypes?.find((opt: any) => String(opt.id) === String(contentTypeId));
    const contentTypeTitle = contentTypeOption ? contentTypeOption.title : null;
    
    // Set optimistic state immediately for instant display updates
    setOptimisticContentTypeId(contentTypeId || null);
    setOptimisticContentTypeTitle(contentTypeTitle || null);
    
    handleFieldChange('content_type_id', contentTypeId || '', { content_type_title: contentTypeTitle });
  };

  // Optimistic Production Type Change
  const handleProductionTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const productionTypeId = e.target.value === '' ? undefined : e.target.value;
    const productionTypeOption = filteredProductionTypes?.find((opt: any) => String(opt.id) === String(productionTypeId));
    const productionTypeTitle = productionTypeOption ? productionTypeOption.title : null;
    
    // Set optimistic state immediately for instant display updates
    setOptimisticProductionTypeId(productionTypeId || null);
    setOptimisticProductionTypeTitle(productionTypeTitle || null);
    
    handleFieldChange('production_type_id', productionTypeId || '', { production_type_title: productionTypeTitle });
  };

  // Optimistic Language Change
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const languageId = e.target.value === '' ? undefined : e.target.value;
    const languageOption = filteredLanguages?.find((opt: any) => String(opt.id) === String(languageId));
    const languageCode = languageOption ? languageOption.long_name : null;
    
    // Set optimistic state immediately for instant display updates
    setOptimisticLanguageId(languageId || null);
    setOptimisticLanguageCode(languageCode || null);
    
    handleFieldChange('language_id', languageId || '', { language_code: languageCode });
  };

  // Optimistic Status Change
  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const statusId = e.target.value === '' ? undefined : e.target.value;
    const statusOption = filteredStatuses?.find((opt: any) => String(opt.id) === String(statusId));
    const statusName = statusOption ? statusOption.name : undefined;
    const statusColor = statusOption ? statusOption.color : undefined;
    
    // Set optimistic state immediately for instant display updates
    setOptimisticStatusId(statusId || null);
    setOptimisticStatusName(statusName || null);
    setOptimisticStatusColor(statusColor || null);
    
    handleFieldChange('project_status_id', statusId || '', { project_status_name: statusName, project_status_color: statusColor });
  };

  // Add state for channel search
  const [channelSearch, setChannelSearch] = useState('');
  
  // Debounced date change handlers
  const handleDueDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setOptimisticDueDate(newDate);
    setPendingDueDate(newDate);
  };
  
  const handlePublicationDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setOptimisticPublicationDate(newDate);
    setPendingPublicationDate(newDate);
  };
  
  const handleDueDateBlur = () => {
    if (pendingDueDate !== null) {
      handleFieldChange('delivery_date', pendingDueDate);
      setPendingDueDate(null);
    }
  };
  
  const handlePublicationDateBlur = () => {
    if (pendingPublicationDate !== null) {
      handleFieldChange('publication_date', pendingPublicationDate);
      setPendingPublicationDate(null);
    }
  };
  
  const handleDueDateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (pendingDueDate !== null) {
        handleFieldChange('delivery_date', pendingDueDate);
        setPendingDueDate(null);
      }
    }
  };
  
  const handlePublicationDateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (pendingPublicationDate !== null) {
        handleFieldChange('publication_date', pendingPublicationDate);
        setPendingPublicationDate(null);
      }
    }
  };

  // Add this handler inside TaskDetails
  const handleOptimisticThreadCreated = (thread: { id: number | string, isOptimistic?: boolean }) => {
    if (thread.isOptimistic) {
      setThreadsList(prev => [
        ...prev,
        {
          id: thread.id,
          title: null,
          created_at: new Date().toISOString(),
          task_id: Number(task!.id),
          isOptimistic: true,
        } as Thread,
      ]);
      // Do not setSelectedThreadId for temp (string) id
    } else if (typeof thread.id === 'number') {
      setThreadsList(prev => prev.map(t =>
        t.isOptimistic ? { ...t, id: thread.id, isOptimistic: false } : t
      ));
      setSelectedThreadId(thread.id);
    } else if (thread.isOptimistic === false && typeof thread.id === 'string') {
      setThreadsList(prev => prev.filter(t => t.id !== thread.id));
      setSelectedThreadId(null);
    }
  };

  // Add global drag-and-drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [isAddingReview, setIsAddingReview] = useState(false)
  const taskDetailsRef = useRef<HTMLDivElement | null>(null)
  const dropzoneRef = useRef<DropzoneHandle>(null)
  const dueDateInputRef = useRef<HTMLInputElement>(null)
  const publicationDateInputRef = useRef<HTMLInputElement>(null)
  const commentInputRef = useRef<HTMLDivElement>(null)
  const [briefingEditorHeight, setBriefingEditorHeight] = useState(220)
  const briefingResizeStartYRef = useRef(0)
  const briefingResizeStartHeightRef = useRef(220)
  const [hasMountedSuggestionBriefingEditor, setHasMountedSuggestionBriefingEditor] = useState(false)
  const [hasMountedSuggestionControls, setHasMountedSuggestionControls] = useState(false)
  const setTaskDetailsContainerRef = useCallback((node: HTMLDivElement | null) => {
    taskDetailsRef.current = node
    taskDetailsLayoutRef.current = node
  }, [])

  useEffect(() => {
    if (!isSuggestionMode) {
      setHasMountedSuggestionBriefingEditor(false)
      setHasMountedSuggestionControls(false)
      return
    }
    const raf = window.requestAnimationFrame(() => {
      setHasMountedSuggestionBriefingEditor(true)
      setHasMountedSuggestionControls(true)
    })
    return () => {
      window.cancelAnimationFrame(raf)
    }
  }, [isSuggestionMode])

  useEffect(() => {
    setIsContentSectionExpanded(false)
  }, [task?.id])

  useEffect(() => {
    if (activeTaskTab !== "content") {
      setIsContentSectionExpanded(false)
    }
  }, [activeTaskTab])

  // Task query key for cache updates (must match useTaskDetails in TasksLayout)
  const taskQueryKey =
    task && accessToken && !isSuggestionMode
      ? (['task', String(task.id), accessToken] as const)
      : null;

  const onAttachmentUploadSuccess = useCallback(
    (newAttachments: { id: string; file_name: string; file_path: string; uploaded_at: string; uploaded_by: string | null; mime_type: string | null; size: number | null }[], recordId: string | number) => {
      if (!taskQueryKey || !queryClient) return;
      queryClient.setQueryData(taskQueryKey, (old: unknown) => {
        if (!old || typeof old !== 'object') return old;
        const o = old as { attachments?: unknown[] };
        const prev = o.attachments ?? [];
        return { ...o, attachments: [...prev, ...newAttachments] };
      });
    },
    [taskQueryKey, queryClient]
  );

  const onAttachmentDeleteSuccess = useCallback(
    (attachmentId: string, recordId: string | number) => {
      if (!taskQueryKey || !queryClient) return;
      queryClient.setQueryData(taskQueryKey, (old: unknown) => {
        if (!old || typeof old !== 'object') return old;
        const o = old as { attachments?: { id: string }[] };
        const prev = o.attachments ?? [];
        return { ...o, attachments: prev.filter((a) => a.id !== attachmentId) };
      });
    },
    [taskQueryKey, queryClient]
  );

  // Attachments: seed from task-details-bootstrap (no initial `attachments` table read); upload/delete still refetches as needed.
  const attachmentsUpload = useTaskAttachmentsUpload({
    tableName: 'tasks',
    recordId: selectedTask?.id ?? '',
    bucketName: 'attachments',
    onUploadSuccess: taskQueryKey ? onAttachmentUploadSuccess : undefined,
    onDeleteSuccess: taskQueryKey ? onAttachmentDeleteSuccess : undefined,
    seedFromBootstrap: !isSuggestionMode && !!taskIdNum,
    bootstrapAttachments: displayAttachments,
    enabled: !isSuggestionMode && activeTaskTab === "attachments",
  });

  // Drag event handlers
  useEffect(() => {
    const isOutputEditorTarget = (target: EventTarget | null): boolean => {
      if (!target) return false
      if (target instanceof Element) return !!target.closest('[data-output-editor="true"]')
      if (target instanceof Node) return !!target.parentElement?.closest('[data-output-editor="true"]')
      return false
    }

    const routeCommentFileDrop = (files: FileList) => {
      const fileInput = document.getElementById('add-comment-file') as HTMLInputElement | null
      if (!fileInput || files.length === 0) return false
      const dt = new DataTransfer()
      dt.items.add(files[0])
      fileInput.files = dt.files
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    }

    const handleDragOver = (e: DragEvent) => {
      if (isOutputEditorTarget(e.target)) return
      e.preventDefault()
      setIsDraggingOver(true)
    }
    const handleDragLeave = (e: DragEvent) => {
      if (isOutputEditorTarget(e.target)) return
      setIsDraggingOver(false)
    }
    const handleDrop = async (e: DragEvent) => {
      if (isOutputEditorTarget(e.target)) return
      e.preventDefault()
      setIsDraggingOver(false)
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0 && task) {
        if (commentInputRef.current && commentInputRef.current.contains(e.target as Node)) {
          if (routeCommentFileDrop(e.dataTransfer.files)) return
        }
        if (activeTaskTab !== "attachments") return
        await attachmentsUpload.uploadFiles(e.dataTransfer.files)
      }
    }
    const node = taskDetailsRef.current
    if (node) {
      node.addEventListener('dragover', handleDragOver)
      node.addEventListener('dragleave', handleDragLeave)
      node.addEventListener('drop', handleDrop)
    }
    return () => {
      if (node) {
        node.removeEventListener('dragover', handleDragOver)
        node.removeEventListener('dragleave', handleDragLeave)
        node.removeEventListener('drop', handleDrop)
      }
    }
  }, [activeTaskTab, task, attachmentsUpload])

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

  useEffect(() => {
    const currentTaskId = task?.id ? Number(task.id) : null
    return () => {
      if (!currentTaskId) return
      queryClient.cancelQueries({ queryKey: ['taskComponents', currentTaskId] })
      queryClient.cancelQueries({ queryKey: ['taskAvailableComponents', currentTaskId] })
      // Do not cancel ['task', id, accessToken]: that query is owned by TasksLayout / project tab.
      // Canceling it on TaskDetails unmount aborts task-details-bootstrap during router transitions / RSC.
    }
  }, [task?.id, accessToken, queryClient])

  const handleBriefingResizeMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    briefingResizeStartYRef.current = e.clientY
    briefingResizeStartHeightRef.current = briefingEditorHeight

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - briefingResizeStartYRef.current
      const next = Math.max(160, Math.min(520, briefingResizeStartHeightRef.current + delta))
      setBriefingEditorHeight(next)
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [briefingEditorHeight])

  // Navigate to parent task
  const handleBackToParent = async () => {
    if (!task?.parent_task_id_int) return;
    
    // Immediately update the UI with the data we already have
    if (parentTaskData && onTaskUpdate) {
      const immediateTaskData = {
        ...task,
        // Override with parent task data
        id: parentTaskData.id,
        title: parentTaskData.title,
        project_id_int: task.project_id_int, // Parent and child share the same project
        project_name: task.project_name,
        project_color: task.project_color,
        parent_task_id_int: null, // Parent tasks don't have parents
      };
      
      // Optimistically update the UI immediately
      onTaskUpdate(immediateTaskData);
      
      // Update URL immediately
      const newParams = mergePreserveParams(new URLSearchParams(searchParams.toString()));
      newParams.set('id', task.parent_task_id_int.toString());
      router.replace(`${tasksBasePath}?${newParams.toString()}`, { scroll: false });
    }
    
    // Then fetch the full parent task data in the background
    try {
      const supabase = createClientComponentClient()
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          assigned_user:users!fk_tasks_assigned_to_id(id,full_name),
          projects:projects!project_id_int(id,name,color),
          project_statuses:project_statuses!project_status_id(id,name,color)
        `)
        .eq('id', task.parent_task_id_int)
        .single()
      
      if (!error && data && onTaskUpdate) {
        // Transform the nested data to flat structure for compatibility
        const denormalizedTask = {
          ...data,
          assigned_to_id: data.assigned_user?.id?.toString() || '',
          assigned_to_name: data.assigned_user?.full_name || null,
          project_id_int: data.projects?.id || null,
          project_name: data.projects?.name || null,
          project_color: data.projects?.color || null,
          project_status_id: data.project_statuses?.id?.toString() || '',
          project_status_name: data.project_statuses?.name || null,
          project_status_color: data.project_statuses?.color || null,
        }
        // Update with full data when it arrives
        onTaskUpdate(denormalizedTask)
      }
    } catch (err) {
      console.error('Failed to fetch full parent task data:', err);
    }
  }

  // Handle parent change (fully optimistic)
  const handleParentChange = async (ids: string[], selectedTask?: Task) => {
    if (!task) return;
    const newParentId = ids[0] && ids[0] !== 'null' ? Number(ids[0]) : undefined;
    const prevParentId = task.parent_task_id_int;
    // Optimistically update parent_task_id_int
    updateTaskInCaches(queryClient, { ...task, parent_task_id_int: newParentId });
    // Server update
    try {
      await supabase.from('tasks').update({ parent_task_id_int: newParentId }).eq('id', task.id);
      queryClient.invalidateQueries({ queryKey: ['subtasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err) {
      // Rollback
      updateTaskInCaches(queryClient, { ...task, parent_task_id_int: prevParentId });
    }
  };

  // Only show parent task field for subtasks or regular tasks (not for parent tasks)
  const showParentField = !isSuggestionMode && !!task && (task.parent_task_id_int || String(task.content_type_id) !== '39');

  // Add Subtask handler for regular tasks
  const handleAddSubtaskForRegular = () => {
    if (!task) return;
    router.push(`/tasks/${task.id}/add-subtask`);
  };

  const handleQuickFiveStarReview = useCallback(async () => {
    if (!taskIdNum) return
    try {
      const { error } = await submitTaskReview(supabase, {
        task_id: taskIdNum,
        review_title: null,
        score_seo: 5,
        score_relevance: 5,
        score_grammar: 5,
        score_delays: 5,
        positive_feedback: null,
        negative_feedback: null,
      })
      if (error) throw error
      toast({
        title: 'Review added',
        description: '5-star review submitted.',
      })
      queryClient.invalidateQueries({ queryKey: ['task', String(task?.id), accessToken] })
      queryClient.invalidateQueries({ queryKey: ['task', String(task?.id)] })
    } catch (error: any) {
      toast({
        title: 'Failed to add review',
        description: error?.message || 'Could not submit 5-star review.',
        variant: 'destructive',
      })
    }
  }, [taskIdNum, supabase, queryClient, task?.id, accessToken])

  // Handle Build with AI from content type editor
  const handleBuildWithAI = (contentTypeTitle: string, taskId: number) => {
    // Set AI build state and pass content type context
    const currentParams = new URLSearchParams(searchParams.toString());
    currentParams.set('taskAiOpen', 'true');
    currentParams.set('aiContentType', contentTypeTitle);
    currentParams.set('aiTaskId', taskId.toString());
    const merged = mergePreserveParams(currentParams);
    const newUrl = merged.toString() ? `?${merged.toString()}` : '';
    router.replace(`${tasksBasePath}${newUrl}`, { scroll: false });
  };

  // Called when subtask form is cancelled (no subtask created)
  const handleSubtaskFormCancel = async () => {
    if (!task /*|| !pendingMainConversion*/) return;
    // Revert optimistic update
    // setOptimisticTask(prev => prev ? { ...prev, content_type_id: pendingMainConversion.prevContentTypeId } : prev);
    // queryClient.setQueryData(['tasks', task.id], (old: any) => ({ ...old, content_type_id: pendingMainConversion.prevContentTypeId }));
    // if (onTaskUpdate) onTaskUpdate({ content_type_id: pendingMainConversion.prevContentTypeId });
    // Revert on server
    try {
      const supabase = createClientComponentClient();
      // await supabase
      //   .from('tasks')
      //   .update({ content_type_id: pendingMainConversion.prevContentTypeId })
      //   .eq('id', task.id);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err) {
      // Optionally show error toast
    }
    // setPendingMainConversion(null);
  };

  // Called when subtask is actually created (confirm conversion)
  const handleSubtaskCreated = async () => {
    if (!task) return;
    // Persist conversion on server
    try {
      const supabase = createClientComponentClient();
      await supabase
        .from('tasks')
        .update({ content_type_id: 39 })
        .eq('id', task.id);
      // Update details pane cache
      // setOptimisticTask(prev => prev ? { ...prev, content_type_id: '39' } : prev);
      // Also update selectedTask if present (to trigger re-render in parent)
      if (typeof onTaskUpdate === 'function') {
        onTaskUpdate({ content_type_id: '39' });
      }
      queryClient.setQueryData(['tasks', task.id], (old: any) => ({ ...old, content_type_id: 39 }));
      // Update task list cache (array or paginated)
      queryClient.setQueryData(['tasks'], (old: any) => {
        if (!old) return old;
        if (Array.isArray(old)) {
          return old.map((t: any) => t.id === task.id ? { ...t, content_type_id: 39 } : t);
        }
        // If paginated, adjust as needed
        return old;
      });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      // Invalidate subtasks query to ensure it is enabled and refetched
      queryClient.invalidateQueries({ queryKey: ['subtasks', Number(task.id)] });
    } catch (err) {
      // Optionally show error toast
    }
  };

  // --- Task Delete Logic ---
  const { selectedGroupBy } = useTaskGrouping()

  const computeOptimisticGroupKey = useCallback(
    (t: any): string | undefined => {
      const groupBy = (selectedGroupBy as any) === 'none' ? null : (selectedGroupBy as any);
      if (!groupBy) return undefined;

      switch (groupBy) {
        case 'assigned_to': {
          const id = t?.assigned_to_id ?? t?.assigned_user?.id;
          return id != null ? String(id) : '__unassigned__';
        }
        case 'status': {
          const name = t?.project_status_name ?? t?.project_statuses?.name;
          return name ? String(name) : '__unassigned__';
        }
        case 'project': {
          const id = t?.project_id_int ?? t?.projects?.id;
          return id != null ? String(id) : '__no_project__';
        }
        case 'content_type': {
          const id = t?.content_type_id;
          return id != null ? String(id) : '__unassigned__';
        }
        case 'production_type': {
          const id = t?.production_type_id;
          return id != null ? String(id) : '__unassigned__';
        }
        case 'language': {
          const id = t?.language_id;
          return id != null ? String(id) : '__unassigned__';
        }
        case 'delivery_date': {
          if (!t?.delivery_date) return '__no_date__';
          const d = new Date(t.delivery_date);
          if (Number.isNaN(d.getTime())) return '__no_date__';
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }
        case 'publication_date': {
          if (!t?.publication_date) return '__no_date__';
          const d = new Date(t.publication_date);
          if (Number.isNaN(d.getTime())) return '__no_date__';
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }
        default:
          return undefined;
      }
    },
    [selectedGroupBy],
  )

  const handleDeleteTask = async () => {
    if (!task) return;
    // Close dialog synchronously before potentially unmounting this component.
    // If we unmount while Radix Dialog is still "open", it can leave the document
    // in a state where pointer events are disabled (app feels frozen).
    flushSync(() => {
      setIsDeleteDialogOpen(false);
      setIsDeleting(true);
    });
    const t = task; // non-null assertion for linter
    const taskIdNum = Number((t as any).id)
    const taskIdStr = String((t as any).id)
    
    // Optimistically remove from all caches immediately
    if (Number.isFinite(taskIdNum)) {
      removeTaskFromAllStores(taskIdNum, { groupKey: computeOptimisticGroupKey(t) });
    }
    
    // Optimistically remove from all React Query caches
    removeTaskIdFromTasksQueryArrays(queryClient, taskIdStr);
    
    // Remove from Kanban caches
    const kanbanQueries = queryClient.getQueryCache().findAll({ queryKey: ['kanban-bootstrap'] });
    for (const q of kanbanQueries) {
      const oldData = q.state.data as any;
      if (!oldData || !oldData.tasks) continue;
      
      const newTasks = { ...oldData.tasks };
      for (const [groupKey, tasks] of Object.entries(newTasks)) {
        if (Array.isArray(tasks)) {
          const filteredTasks = tasks.filter((task: any) => String(task.id) !== taskIdStr);
          if (filteredTasks.length !== tasks.length) {
            newTasks[groupKey] = filteredTasks;
          }
        }
      }
      
      q.setData({
        ...oldData,
        tasks: newTasks
      });
    }
    
    // Remove from task details cache
    queryClient.removeQueries({ queryKey: ['task', taskIdStr] });
    
    // Remove from Typesense store
    if (Number.isFinite(taskIdNum)) {
      removeTaskFromTypesenseStore(taskIdNum);
    }
    
    // If main task, promote all subtasks to regular tasks optimistically
    if (String(t.content_type_id) === '39') {
      queryClient.setQueryData(['tasks'], (old: any) => {
        if (!old) return old;
        if (Array.isArray(old)) {
          return old.map((x: any) => String(x.parent_task_id_int) === taskIdStr ? { ...x, parent_task_id_int: null } : x);
        }
        return old;
      });
      // Also update subtasks query cache for this main task
      queryClient.setQueryData(['subtasks', taskIdNum], []);
    }
    
    // Always close details pane after delete (desktop and mobile).
    // Defer to a microtask so the Dialog close state above has a chance to commit.
    queueMicrotask(() => {
      if (typeof onClose === 'function') onClose();
    });
    
    try {
      // Backend: promote subtasks, then delete main task
      const supabase = createClientComponentClient();
      if (String(t.content_type_id) === '39') {
        await supabase.from('tasks').update({ parent_task_id_int: null }).eq('parent_task_id_int', t.id);
      }
      await supabase.from('tasks').delete().eq('id', t.id);
      
      // Update Typesense if available
      const typesenseUpdater = getTypesenseUpdater();
      if (typesenseUpdater) {
        typesenseUpdater({ ...t, deleted: true });
      }
      
      // Show success message
      toast({
        title: 'Task deleted',
        description: 'The task has been successfully deleted.',
      });
      
    } catch (err: any) {
      console.error('Failed to delete task:', err);
      
      toast({
        title: 'Failed to delete task',
        description: err?.message || 'An error occurred while deleting the task.',
        variant: 'destructive',
      });
      
      // Rollback: refetch all data to restore the task
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['subtasks'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-bootstrap'] });
      queryClient.invalidateQueries({ queryKey: ['task'] });
    } finally {
      setIsDeleting(false);

      // Safety net: if a dialog unmount left the page with pointer events disabled,
      // restore them so the app remains usable.
      if (typeof document !== 'undefined' && document.body?.style?.pointerEvents === 'none') {
        document.body.style.pointerEvents = '';
      }
    }
  }

  // NOTE: do not couple isDeleting to dialog open state; deletion continues after dialog closes.



  // Helper to get assignee full name from subtask
  function getSubtaskAssigneeName(assigned_user: any): string | undefined {
    if (!assigned_user) return undefined;
    if (Array.isArray(assigned_user)) {
      return assigned_user[0]?.full_name;
    }
    if (typeof assigned_user === 'object' && 'full_name' in assigned_user) {
      return assigned_user.full_name;
    }
    return undefined;
  }

  // Helper to get status name and color from subtask
  function getSubtaskStatus(project_statuses: any): { name?: string, color?: string } {
    if (!project_statuses) return {};
    if (Array.isArray(project_statuses)) {
      return { name: project_statuses[0]?.name, color: project_statuses[0]?.color };
    }
    if (typeof project_statuses === 'object' && 'name' in project_statuses) {
      return { name: project_statuses.name, color: project_statuses.color };
    }
    return {};
  }

  // Stable debounced field change for meta fields
  const debouncedFieldChangeRef = useRef(
    debounce((field: keyof Task, value: any) => {
      handleFieldChange(field, value);
    }, 500)
  );

  // Stable project_id_int for watchers query
  const stableProjectId = useRef(task?.project_id_int);
  useEffect(() => {
    if (task?.project_id_int !== stableProjectId.current) {
      stableProjectId.current = task?.project_id_int;
    }
  }, [task?.project_id_int]);

  // Remove the useQuery for project_watchers and all references to projectUsers and isProjectUsersLoading. Use only project_watchers from props (Edge Function/task-edit-fields).
  // Find the public user ID for the current user using project_watchers
  const projectWatchers = project_watchers || [];
  const currentAuthUserId = currentUser?.id;
  const currentPublicUserId = useMemo(() => {
    const watcher = projectWatchers.find((w: any) => w.users?.auth_user_id === currentAuthUserId);
    return watcher?.user_id ?? null;
  }, [projectWatchers, currentAuthUserId]);

  const [replyTo, setReplyTo] = useState<{ id: number; author?: string; preview: string } | null>(null)

  // Add state for key visual attachment
  const [keyVisualId, setKeyVisualId] = useState<string | null>(task?.key_visual_attachment_id ?? null);

  // Sync keyVisualId with task when task changes
  useEffect(() => {
    setKeyVisualId(task?.key_visual_attachment_id ?? null);
  }, [task?.key_visual_attachment_id]);

  // Handler to set key visual
  const handleSetKeyVisual = async (attachmentId: string) => {
    if (isSuggestionMode) return
    setKeyVisualId(attachmentId);
    // Persist to DB
    await supabase.from('tasks').update({ key_visual_attachment_id: attachmentId }).eq('id', task.id);
    queryClient.invalidateQueries({ queryKey: ['task', task.id] });
  };

  // Helper to check if an attachment is an image or video
  function isImageOrVideo(attachment: { mime_type: string | null }) {
    if (!attachment.mime_type) return false;
    return attachment.mime_type.startsWith('image/') || attachment.mime_type.startsWith('video/');
  }



  // --- Task detail autosave wiring ----------------------------------------
  // The autosave queue itself lives at module scope (see top of file) so it
  // survives remounts between field edits. This ref only exposes the latest
  // supabase/queryClient instances to the module-level queue.
  const autosaveDepsRef = useRef({ supabase, queryClient });
  autosaveDepsRef.current = { supabase, queryClient };

  // Local wrapper: enqueue a canonical patch into the shared module-level queue.
  const enqueueTaskPatchLocal = useCallback(
    (taskId: string, canonicalFields: Record<string, any>, requiresListInvalidation: boolean) => {
      enqueueTaskPatch(taskId, canonicalFields, requiresListInvalidation, autosaveDepsRef.current);
    },
    []
  );

  // Define handleFieldChange before any usage
  // Only these fields should trigger list/kanban/calendar refetches:
  const FIELDS_THAT_REQUIRE_LIST_INVALIDATION = [
    'title', 'delivery_date', 'publication_date', 'assigned_to_id', 'project_id_int',
    'project_status_id', 'content_type_id', 'production_type_id', 'language_id'
  ];

  /**
   * Handles updating a field for the task.
   * - Always updates the detail cache for the task (details pane stays in sync).
   * - Only triggers a refetch of the task list/calendar/kanban if the field is in FIELDS_THAT_REQUIRE_LIST_INVALIDATION.
   * - Fields like copy_post, briefing, and notes will NOT trigger a list/kanban/calendar refetch.
   */
  const handleFieldChange = async (field: keyof Task, value: any, extraFields: Partial<Task> = {}) => {
    if (!task) return;
    if (isSuggestionMode) {
      // Implicit approval: first meaningful edit converts suggestion -> task, then we persist the edit on the created task.
      const taskId = await ensureSuggestionApproved(String(field))
      if (!taskId) return
      try {
        // Only persist canonical source fields; the DB trigger recomputes the
        // denormalized display fields (titles, names, colors, overdue flags).
        const updatePayload: any = buildCanonicalTaskPatch({ [field]: value, ...extraFields })
        const { data, error } = await supabase
          .from('tasks')
          .update(updatePayload)
          .eq('id', taskId)
          .select()
          .single()
        if (error) throw error
        if (data) {
          updateTaskInCaches(queryClient, data)
          getTypesenseUpdater()?.(data)
          bumpAndInvalidateHomeSidebarRecent(queryClient, "tasks", {
            id: String(taskId),
            title:
              (typeof data.title === "string" && data.title.trim()) ||
              `Task ${taskId}`,
          })
          void trackGlobalObjectOpen({ entityType: "task", entityId: String(taskId) }).catch(() => {})
        }
      } catch (err) {
        toast({
          title: 'Failed to save changes',
          description: (err as Error)?.message || 'An error occurred while saving.',
          variant: 'destructive',
        })
      }
      return
    }
    
    // Calculate overdue status if this field affects it
    let overdueFields = {};
    if (['delivery_date', 'publication_date', 'project_status_id'].includes(field) && editFields?.project_statuses) {
      const newDeliveryDate = field === 'delivery_date' ? value : currentDueDate;
      const newPublicationDate = field === 'publication_date' ? value : currentPublicationDate;
      const newStatusId = field === 'project_status_id' ? value : currentStatusId;
      
      const { isOverdue, isPublicationOverdue } = calculateOverdueStatus(
        newDeliveryDate,
        newPublicationDate,
        newStatusId,
        editFields.project_statuses
      );
      
      overdueFields = {
        is_overdue: isOverdue,
        is_publication_overdue: isPublicationOverdue
      };
    }
    
    const requiresListInvalidation = FIELDS_THAT_REQUIRE_LIST_INVALIDATION.includes(field);
    if (requiresListInvalidation) {
      // Optimistic UI: apply the full change (including denormalized display
      // fields) to local caches so the details/list update instantly.
      let updatedFields = { ...task, [field]: value, ...extraFields, ...overdueFields };
      updatedFields = applyNestedOptimisticFields(task, updatedFields);
      updateTaskInCaches(queryClient, updatedFields);
      getTypesenseUpdater()?.(updatedFields);
      if (onTaskUpdate) onTaskUpdate({ ...updatedFields });
    }

    // Persist canonical source fields only, batched into a single debounced
    // PATCH per task. Denormalized display fields (titles/names/colors/overdue)
    // are recomputed by the DB trigger, so they are stripped from the payload.
    const canonicalPatch = buildCanonicalTaskPatch({ [field]: value, ...extraFields, ...overdueFields });
    enqueueTaskPatchLocal(String(task.id), canonicalPatch, requiresListInvalidation);

    // Keep the home sidebar Recents list in sync with field edits (delivery date, briefing, etc.).
    const sidebarTitle =
      (typeof (field === "title" ? value : task.title) === "string" &&
        String(field === "title" ? value : task.title).trim()) ||
      `Task ${task.id}`
    bumpAndInvalidateHomeSidebarRecent(queryClient, "tasks", {
      id: String(task.id),
      title: sidebarTitle,
    })
    void trackGlobalObjectOpen({ entityType: "task", entityId: String(task.id) }).catch(() => {})
  };

  // Add this after imports
  function getInitials(name?: string | null): string {
    if (!name) return '';
    return name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  }

  // Canonical task-level mentions for the global comments panel.
  const allMentions = allTaskMentions;

  const { data: editFields, isLoading: isEditFieldsLoading, error: editFieldsError } = useTaskEditFields(accessToken);
  const allContentTypes = useMemo(() => editFields?.content_types ?? [], [editFields?.content_types])
  const contentTypeLabelById = useMemo(() => {
    const entries = allContentTypes.map((ct) => [String(ct.id), ct.title] as const)
    return new Map(entries)
  }, [allContentTypes])

  const relatedIdeasQueryKey = useMemo(() => ['task-related-ideas', String(taskIdNum ?? '')], [taskIdNum])

  const bootstrapRelatedIdeasRaw = (selectedTask as { related_ideas?: unknown } | null)?.related_ideas
  const bootstrapRelatedIdeasProposed = useMemo((): TaskRelatedIdeaRow[] | null => {
    if (!Array.isArray(bootstrapRelatedIdeasRaw)) return null
    return normalizeBootstrapRelatedIdeas(bootstrapRelatedIdeasRaw).filter((r) => r.status === 'proposed')
  }, [bootstrapRelatedIdeasRaw, selectedTask?.id])

  const fetchRelatedIdeasProposed = useCallback(async (): Promise<TaskRelatedIdeaRow[]> => {
    if (!taskIdNum) return []
    const { data, error } = await supabase
      .from("task_related_ideas")
      .select("id, task_id, project_id, title, description, content_type_id, status")
      .eq("task_id", taskIdNum)
      .eq("status", "proposed")
      .order("created_at", { ascending: false })
    if (error) throw error
    return (data ?? []) as TaskRelatedIdeaRow[]
  }, [supabase, taskIdNum])

  const relatedIdeasSeededFromBootstrap = Array.isArray(bootstrapRelatedIdeasRaw)
  const {
    data: relatedIdeas = [],
    isLoading: isFetchedRelatedIdeasLoading,
    isFetching: isFetchedRelatedIdeasFetching,
  } = useQuery<TaskRelatedIdeaRow[]>({
    queryKey: relatedIdeasQueryKey,
    enabled: false,
    queryFn: fetchRelatedIdeasProposed,
    initialData: bootstrapRelatedIdeasProposed ?? undefined,
    staleTime: relatedIdeasSeededFromBootstrap ? 1000 * 60 * 60 : Number.POSITIVE_INFINITY,
    refetchOnMount: false,
  })

  useEffect(() => {
    if (!taskIdNum || isSuggestionMode) return
    if (bootstrapRelatedIdeasProposed == null) return
    queryClient.setQueryData<TaskRelatedIdeaRow[]>(relatedIdeasQueryKey, bootstrapRelatedIdeasProposed)
  }, [
    bootstrapRelatedIdeasProposed,
    taskIdNum,
    isSuggestionMode,
    relatedIdeasQueryKey,
    queryClient,
  ])

  const isRelatedIdeasLoading =
    !isSuggestionMode && !!taskIdNum && isFetchedRelatedIdeasLoading
  const isRelatedIdeasFetching = !isSuggestionMode && !!taskIdNum && isFetchedRelatedIdeasFetching

  const refetchRelatedIdeas = useCallback(async () => {
    return await queryClient.fetchQuery({
      queryKey: relatedIdeasQueryKey,
      queryFn: fetchRelatedIdeasProposed,
    })
  }, [fetchRelatedIdeasProposed, queryClient, relatedIdeasQueryKey])

  // Reset optimistic states when task changes
  useEffect(() => {
    setOptimisticAssignedUserId(null);
    setOptimisticAssignedUserName(null);
    setOptimisticProjectId(null);
    setOptimisticProjectName(null);
    setOptimisticProjectColor(null);
    setOptimisticStatusId(null);
    setOptimisticStatusName(null);
    setOptimisticStatusColor(null);
    setOptimisticDueDate(null);
    setOptimisticPublicationDate(null);
    setOptimisticContentTypeId(null);
    setOptimisticContentTypeTitle(null);
    setOptimisticProductionTypeId(null);
    setOptimisticProductionTypeTitle(null);
    setOptimisticLanguageId(null);
    setOptimisticLanguageCode(null);
    setPendingDueDate(null);
    setPendingPublicationDate(null);
  }, [task?.id]);

  // --- Step 1: Memoized selectors for dropdown datasets ---
  const currentProjectId = useMemo(() => optimisticProjectId ?? task?.project_id_int ?? null, [optimisticProjectId, task?.project_id_int]);
  const currentUserIdMemo = useMemo(() => optimisticAssignedUserId ?? task?.assigned_to_id ?? null, [optimisticAssignedUserId, task?.assigned_to_id]);

  const filteredStatuses = useMemo(() => {
    if (!editFields?.project_statuses || currentProjectId == null) return [];
    // Deduplicate by name+color (for cross-project statuses with same label)
    const seen = new Map();
    return editFields.project_statuses
      .filter(s => s.project_id === currentProjectId)
      .filter(s => {
        const key = `${s.name}|${s.color}`;
        if (seen.has(key)) return false;
        seen.set(key, true);
        return true;
      });
  }, [editFields?.project_statuses, currentProjectId]);

  const filteredWatchers = useMemo(() => {
    if (!editFields?.project_watchers || currentProjectId == null) return [];
    return editFields.project_watchers.filter(w => w.project_id === currentProjectId);
  }, [editFields?.project_watchers, currentProjectId]);

  const filteredCostsForUser = useMemo(() => {
    if (!editFields?.costs || currentUserIdMemo == null) return [];
    return editFields.costs.filter(c => c.user_id === Number(currentUserIdMemo));
  }, [editFields?.costs, currentUserIdMemo]);

  const filteredContentTypes = useMemo(() => {
    if (!editFields?.content_types) return [];
    if (filteredCostsForUser.length === 0) return editFields.content_types;
    const allowed = new Set(filteredCostsForUser.map(c => c.content_type_id));
    return editFields.content_types.filter(ct => allowed.has(ct.id));
  }, [editFields?.content_types, filteredCostsForUser]);

  const filteredProductionTypes = useMemo(() => {
    if (!editFields?.production_types) return [];
    if (filteredCostsForUser.length === 0) return editFields.production_types;
    const allowed = new Set(filteredCostsForUser.map(c => c.production_type_id));
    return editFields.production_types.filter(pt => allowed.has(pt.id));
  }, [editFields?.production_types, filteredCostsForUser]);

  const filteredLanguages = useMemo(() => {
    if (!editFields?.languages) return [];
    if (filteredCostsForUser.length === 0) return editFields.languages;
    const allowed = new Set(filteredCostsForUser.map(c => c.language_id));
    return editFields.languages.filter(l => allowed.has(l.id));
  }, [editFields?.languages, filteredCostsForUser]);

  const filteredChannels = useMemo(() => {
    if (!editFields?.channels || currentProjectId == null) return [];
    return editFields.channels.filter((channel) => {
      if (channel.project_id !== undefined) {
        return channel.project_id === currentProjectId;
      }
      return true;
    });
  }, [editFields?.channels, currentProjectId]);

  const handleRefreshRelatedIdeas = useCallback(async () => {
    if (!taskIdNum || isRefreshingRelatedIdeas) return
    setIsRefreshingRelatedIdeas(true)
    try {
      const { error } = await supabase.functions.invoke("ai-task-related-ideas-run", {
        body: {
          task_id: taskIdNum,
          force: true,
          trigger_source: "manual_refresh",
        },
      })
      if (error) throw error
      await refetchRelatedIdeas()
      toast({ title: "Related ideas refreshed" })
    } catch (err: any) {
      toast({
        title: "Failed to refresh ideas",
        description: err?.message || "Could not refresh related ideas.",
        variant: "destructive",
      })
    } finally {
      setIsRefreshingRelatedIdeas(false)
    }
  }, [taskIdNum, isRefreshingRelatedIdeas, supabase, refetchRelatedIdeas])

  const handleSetRelatedIdeaStatus = useCallback(
    async (ideaId: string, nextStatus: "accepted" | "dismissed") => {
      if (!ideaId || !taskIdNum) return
      if (!currentUserId) {
        toast({
          title: "Missing user",
          description: "Could not determine current user id.",
          variant: "destructive",
        })
        return
      }

      const previousRows = queryClient.getQueryData<TaskRelatedIdeaRow[]>(relatedIdeasQueryKey) ?? []
      setIdeaActionById((prev) => ({ ...prev, [ideaId]: nextStatus }))
      queryClient.setQueryData<TaskRelatedIdeaRow[]>(
        relatedIdeasQueryKey,
        previousRows.filter((row) => row.id !== ideaId),
      )

      try {
        const { data, error } = await supabase.rpc("set_task_related_idea_status", {
          p_idea_id: ideaId,
          p_status: nextStatus,
          p_user_id: currentUserId,
        })
        if (error) throw error
        const payload = data as any
        if (payload && typeof payload === "object" && payload.ok === false) {
          throw new Error(typeof payload.message === "string" ? payload.message : "Status update failed")
        }
        toast({ title: nextStatus === "accepted" ? "Idea accepted" : "Idea dismissed" })
      } catch (err: any) {
        queryClient.setQueryData<TaskRelatedIdeaRow[]>(relatedIdeasQueryKey, previousRows)
        toast({
          title: `Failed to ${nextStatus === "accepted" ? "accept" : "dismiss"} idea`,
          description: err?.message || "Update failed",
          variant: "destructive",
        })
      } finally {
        setIdeaActionById((prev) => ({ ...prev, [ideaId]: null }))
      }
    },
    [taskIdNum, currentUserId, queryClient, relatedIdeasQueryKey, supabase],
  )

  const handleAcceptRelatedIdea = useCallback(
    (idea: TaskRelatedIdeaRow) => {
      if (!task) return

      const composerInitialValues = {
        title: idea.title || "",
        briefing: idea.description || "",
        content_type_id: idea.content_type_id != null ? String(idea.content_type_id) : "",
        project_id_int: task.project_id_int != null ? String(task.project_id_int) : "",
        language_id: task.language_id || "",
        production_type_id: task.production_type_id || "",
        onSuccess: async (newTask: any) => {
          const createdTaskIdRaw = newTask?.id
          const createdTaskIdNum = Number(createdTaskIdRaw)
          if (!Number.isFinite(createdTaskIdNum)) {
            toast({
              title: "Task created, but idea was not linked",
              description: "Could not resolve the new task id to accept this idea.",
              variant: "destructive",
            })
            return
          }
          if (!currentUserId) {
            toast({
              title: "Task created, but idea was not accepted",
              description: "Could not determine current user id.",
              variant: "destructive",
            })
            return
          }

          setIdeaActionById((prev) => ({ ...prev, [idea.id]: "accepted" }))
          try {
            const { data, error } = await supabase.rpc("set_task_related_idea_status", {
              p_idea_id: idea.id,
              p_status: "accepted",
              p_user_id: currentUserId,
            })
            if (error) throw error
            const payload = data as any
            if (payload && typeof payload === "object" && payload.ok === false) {
              throw new Error(typeof payload.message === "string" ? payload.message : "Status update failed")
            }

            const { error: updateIdeaError } = await supabase
              .from("task_related_ideas")
              .update({ accepted_task_id: createdTaskIdNum })
              .eq("id", idea.id)
            if (updateIdeaError) throw updateIdeaError

            await refetchRelatedIdeas()
            toast({ title: "Idea accepted" })
          } catch (err: any) {
            toast({
              title: "Task created, but failed to accept idea",
              description: err?.message || "Could not update related idea status.",
              variant: "destructive",
            })
          } finally {
            setIdeaActionById((prev) => ({ ...prev, [idea.id]: null }))
          }
        },
      }
      openComposer(composerInitialValues)
    },
    [task, currentUserId, supabase, refetchRelatedIdeas, openComposer],
  )

  useEffect(() => {
    threadHistoryLoadedTaskIdRef.current = null;
    threadHistoryInFlightRef.current = false;
  }, [selectedTask?.id]);

  // --- Thread history state and fetch logic ---
  const handleViewThreadHistory = useCallback(async (options?: { force?: boolean }) => {
    const taskId = Number(task?.id);
    if (!Number.isFinite(taskId)) return;
    if (threadHistoryInFlightRef.current) return;
    if (!options?.force && threadHistoryLoadedTaskIdRef.current === taskId) return;

    threadHistoryInFlightRef.current = true;
    setIsThreadListLoading(true);
    setThreadListError(null);
    try {
      const baseSelect = `
          id,
          title,
          created_at,
          thread_watchers (
            watcher_id,
            users!thread_watchers_watcher_id_fkey (
              id,
              full_name,
              photo
            )
          )
        `
      const enrichedSelect = `
          id,
          title,
          created_at,
          updated_at,
          resolved_at,
          object_type,
          task_component_output_id,
          thread_watchers (
            watcher_id,
            users!thread_watchers_watcher_id_fkey (
              id,
              full_name,
              photo
            )
          )
        `
      let data: any[] | null = null
      let error: any = null

      const enrichedQuery = await supabase
        .from('threads')
        .select(enrichedSelect)
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });

      data = enrichedQuery.data as any[] | null
      error = enrichedQuery.error

      if (error) {
        const fallbackQuery = await supabase
          .from('threads')
          .select(baseSelect)
          .eq('task_id', taskId)
          .order('created_at', { ascending: false })
        data = fallbackQuery.data as any[] | null
        error = fallbackQuery.error
      }

      if (error) throw error;

      const threadsWithUsers = (data || []).map((thread: any) => ({
        ...thread,
        thread_watchers: Array.isArray(thread.thread_watchers)
          ? thread.thread_watchers.filter((tw: any) => !!tw.users)
          : [],
      }));

      const threadIds = threadsWithUsers
        .map((thread: any) => Number(thread.id))
        .filter((id: number) => Number.isFinite(id))

      let mentionsRows: any[] = []
      if (threadIds.length > 0) {
        const { data: mentionsData, error: mentionsError } = await supabase
          .from("mentions")
          .select("id, thread_id, comment, attachment, created_at, created_by, reply_to_id, users:created_by(id, full_name, email, photo)")
          .in("thread_id", threadIds)
          .order("created_at", { ascending: true })
        if (mentionsError) throw mentionsError
        mentionsRows = mentionsData ?? []
      }

      setAllTaskMentions(mentionsRows)

      const mentionsByThread = new Map<number, any[]>()
      for (const mention of mentionsRows) {
        const threadId = Number(mention?.thread_id)
        if (!Number.isFinite(threadId)) continue
        const current = mentionsByThread.get(threadId) ?? []
        current.push(mention)
        mentionsByThread.set(threadId, current)
      }

      const threadsWithMeta = threadsWithUsers.map((thread: any) => {
        const threadId = Number(thread.id)
        const threadMentions = Number.isFinite(threadId) ? (mentionsByThread.get(threadId) ?? []) : []
        const latestMention = threadMentions.length > 0 ? threadMentions[threadMentions.length - 1] : null
        const mentionCount = threadMentions.length
        const latestActivityAt =
          latestMention?.created_at
          ?? thread.updated_at
          ?? thread.created_at
          ?? null
        const isResolved = !!thread.resolved_at
        const threadType =
          thread.object_type
          ?? (thread.task_component_output_id ? "output_comment" : "general")
        return {
          ...thread,
          mention_count: mentionCount,
          latest_activity_at: latestActivityAt,
          latest_preview: latestMention?.comment ?? thread.title ?? "Thread",
          is_resolved: isResolved,
          thread_type: threadType,
          related_component_label: thread.task_component_output_id
            ? `Output ${String(thread.task_component_output_id).slice(0, 8)}`
            : null,
        }
      }).sort((a: any, b: any) => {
        const aTs = new Date(a.latest_activity_at ?? a.created_at ?? 0).getTime()
        const bTs = new Date(b.latest_activity_at ?? b.created_at ?? 0).getTime()
        return bTs - aTs
      })

      const outputIdsForThreads = Array.from(
        new Set(
          threadsWithMeta
            .map((thread: any) => (typeof thread.task_component_output_id === "string" ? thread.task_component_output_id : null))
            .filter((value): value is string => typeof value === "string" && value.length > 0)
        )
      )
      if (outputIdsForThreads.length > 0) {
        const { data: outputThreadRows } = await supabase.rpc("get_output_comment_threads_batch", {
          p_output_ids: outputIdsForThreads,
        })
        const targetByThreadId = new Map<number, any>()
        for (const row of (outputThreadRows ?? []) as any[]) {
          const threadId = Number(row?.thread_id ?? row?.id)
          if (!Number.isFinite(threadId)) continue
          targetByThreadId.set(threadId, {
            thread_type: row?.thread_type ?? null,
            resolved_at: row?.resolved_at ?? null,
            attachment_id: typeof row?.attachment_id === "string" ? row.attachment_id : null,
            anchor_type: row?.anchor_type ?? null,
            anchor_start: Number.isFinite(Number(row?.anchor_start)) ? Number(row.anchor_start) : null,
            anchor_end: Number.isFinite(Number(row?.anchor_end)) ? Number(row.anchor_end) : null,
            anchor_quote: row?.anchor_quote ?? null,
            anchor_x: Number.isFinite(Number(row?.anchor_x)) ? Number(row.anchor_x) : null,
            anchor_y: Number.isFinite(Number(row?.anchor_y)) ? Number(row.anchor_y) : null,
            anchor_width: Number.isFinite(Number(row?.anchor_width)) ? Number(row.anchor_width) : null,
            anchor_height: Number.isFinite(Number(row?.anchor_height)) ? Number(row.anchor_height) : null,
            anchor_time_start: Number.isFinite(Number(row?.anchor_time_start)) ? Number(row.anchor_time_start) : null,
            anchor_time_end: Number.isFinite(Number(row?.anchor_time_end)) ? Number(row.anchor_time_end) : null,
            anchor_data: row?.anchor_data ?? null,
          })
        }
        for (const thread of threadsWithMeta) {
          const threadId = Number(thread.id)
          const target = targetByThreadId.get(threadId)
          if (!target) continue
          Object.assign(thread, target)
          thread.is_resolved = !!(target.resolved_at ?? thread.resolved_at ?? thread.is_resolved)
        }
      }

      if (Number(task?.id) !== taskId) return

      setThreadsList(threadsWithMeta);
      threadHistoryLoadedTaskIdRef.current = taskId;
    } catch (err: any) {
      setThreadListError(err.message || 'Failed to load threads');
    } finally {
      threadHistoryInFlightRef.current = false;
      setIsThreadListLoading(false);
    }
  }, [task?.id, supabase]);

  // --- Thread/Participants/Mentions wiring ---
  // threadsList: array of all threads (initially just the first thread, then all after thread history is loaded)
  // selectedThreadId: the currently selected thread
  // allMentions: all mentions from Edge Function (initial load) or from thread history fetch (if you fetch mentions for all threads)
  // For each thread, thread_watchers is an array of participants (user IDs)
  // For participants bar, need to map watcher IDs to user objects (from project_watchers or projectUsers)

  // Get all project users from the filtered project watchers
  const allProjectUsers = useMemo(() => {
    if (Array.isArray(filteredWatchers) && filteredWatchers.length > 0) {
      return filteredWatchers
        .filter((pw: any) => pw.users && pw.user_id)
        .map((pw: any) => ({ ...pw.users, id: pw.user_id }));
    }
    // fallback: use project_watchers from props if available
    if (Array.isArray(project_watchers) && project_watchers.length > 0) {
      return project_watchers
        .filter((pw: any) => pw.users && pw.user_id)
        .map((pw: any) => ({ ...pw.users, id: pw.user_id }));
    }
    return [];
  }, [filteredWatchers, project_watchers]);

  const currentUserPhotoUrl = useMemo(() => {
    const authMeta = currentUser?.user_metadata
    const authPhoto = authMeta?.avatar_url || authMeta?.photo || null
    if (authPhoto) {
      const resolved = getImageUrl(String(authPhoto))
      if (resolved) return resolved
      if (String(authPhoto).startsWith("http")) return String(authPhoto)
    }
    const projectUser = (allProjectUsers || []).find(
      (u: any) =>
        Number(u.id) === Number(currentUserId)
        || (currentPublicUserId != null && Number(u.id) === Number(currentPublicUserId)),
    )
    if (projectUser?.photo) {
      const resolved = getImageUrl(projectUser.photo)
      if (resolved) return resolved
    }
    const watcher = (project_watchers || []).find(
      (pw: any) =>
        Number(pw.user_id) === Number(currentUserId)
        || (currentPublicUserId != null && Number(pw.user_id) === Number(currentPublicUserId)),
    )
    if (watcher?.users?.photo) {
      const resolved = getImageUrl(watcher.users.photo)
      if (resolved) return resolved
    }
    return null
  }, [currentUser, allProjectUsers, currentUserId, currentPublicUserId, project_watchers])

  // Get participants for the selected thread (array of user objects), enriched with photo from project users on initial load
  const selectedThread = threadsList.find(t => t.id === selectedThreadId);
  const projectWatchersForPhoto = project_watchers || [];
  let participants: any[] = [];
  if (selectedThread && Array.isArray(selectedThread.thread_watchers)) {
    const userMap = Object.fromEntries((allProjectUsers || []).map((u: any) => [u.id, u]));
    participants = selectedThread.thread_watchers
      .map((tw: any) => {
        const u = tw.users || userMap[tw.watcher_id];
        if (!u) return null;
        const fromProject = (allProjectUsers || []).find(
          (pu: any) => Number(pu.id) === Number(u.id) || (pu.auth_user_id && u.auth_user_id && String(pu.auth_user_id) === String(u.auth_user_id))
        );
        // Fallback photo from project_watchers prop when allProjectUsers not yet loaded (initial task load)
        const photoFromWatchers = projectWatchersForPhoto.find((pw: any) => Number(pw.user_id) === Number(u.id))?.users?.photo;
        const photo = u.photo ?? fromProject?.photo ?? photoFromWatchers ?? null;
        return { ...fromProject, ...u, photo };
      })
      .filter(Boolean);
  }

  // Get mentions for the selected thread
  const mentionsForSelectedThread = allMentions.filter((m: any) => m.thread_id === selectedThreadId);

  // For StickyAddCommentInput: build latestMentions map (threadId -> latest mention)
  const latestMentions = useMemo(() => {
    const map: Record<number, any> = {};
    for (const m of allMentions) {
      if (!map[m.thread_id] || new Date(m.created_at) > new Date(map[m.thread_id].created_at)) {
        map[m.thread_id] = m;
      }
    }
    return map;
  }, [allMentions]);

  // Add this handler inside TaskDetails if not present
  const handleDeleteThread = async (threadId: number) => {
    // Optimistically remove the thread from the list
    const prevThreads = threadsList;
    setThreadsList(prev => prev.filter(t => Number(t.id) !== Number(threadId)));
    // If the deleted thread is selected, select another or fallback to 0
    setSelectedThreadId(prev => {
      if (prev === threadId) {
        const remaining = threadsList.filter(t => Number(t.id) !== Number(threadId));
        return remaining.length > 0 ? Number(remaining[0].id) : 0;
      }
      return prev;
    });
    // Call Supabase to delete the thread
    const { error } = await supabase.from('threads').delete().eq('id', threadId);
    if (error) {
      // Restore previous state and show error
      setThreadsList(prevThreads);
      toast({
        title: 'Failed to delete thread',
        description: error.message,
        variant: 'destructive',
      });
    }
  };
  const handleToggleThreadResolved = useCallback(async (thread: any) => {
    const threadId = Number(thread?.id)
    if (!Number.isFinite(threadId)) return
    const threadType = String(thread?.thread_type ?? thread?.object_type ?? "")
    if (threadType !== "output_comment") return
    const nextResolvedAt = thread?.is_resolved || thread?.resolved_at ? null : new Date().toISOString()
    setResolvingThreadIds((prev) => {
      const next = new Set(prev)
      next.add(threadId)
      return next
    })
    const previousThreads = threadsList
    setThreadsList((prev) =>
      prev.map((item) =>
        Number(item?.id) === threadId
          ? { ...item, resolved_at: nextResolvedAt, is_resolved: !!nextResolvedAt }
          : item
      )
    )
    try {
      const { error } = await supabase
        .from("threads")
        .update({
          resolved_at: nextResolvedAt,
          resolved_by: nextResolvedAt ? currentPublicUserId : null,
        })
        .eq("id", threadId)
      if (error) throw error
    } catch (error: any) {
      setThreadsList(previousThreads)
      toast({
        title: "Failed to update thread",
        description: error?.message || "Could not update resolved state.",
        variant: "destructive",
      })
    } finally {
      setResolvingThreadIds((prev) => {
        const next = new Set(prev)
        next.delete(threadId)
        return next
      })
    }
  }, [threadsList, supabase, currentPublicUserId])

  // Add state for delete thread dialog
  const [showDeleteThreadDialog, setShowDeleteThreadDialog] = useState(false);


  // Handler for add thread button
  const handleAddThread = () => {
    setIsAddingThread(true);
    setSelectedThreadId(null);
    const initial = Array.isArray(project_watchers)
      ? project_watchers.filter((pw: any) => pw.users && pw.user_id)
        .map((pw: any) => ({ ...pw.users, id: pw.user_id }))
      : [];
    setPendingParticipants(initial);
    setRemovedParticipants([]);
  };

  useEffect(() => {
    console.log('PARENT DEBUG: isAddingThread', isAddingThread);
    console.log('PARENT DEBUG: pendingParticipants', pendingParticipants);
  }, [isAddingThread, pendingParticipants]);

  // Handler for when a new thread is created
  const handleThreadCreated = (thread: { id: number | string, isOptimistic?: boolean }) => {
    setIsAddingThread(false);
    if (typeof thread.id === 'number') {
      setSelectedThreadId(thread.id);
    }
    // Optionally update threadsList if needed
    handleOptimisticThreadCreated(thread);
  };

  useEffect(() => {
    if (
      !isAddingThread &&
      !(selectedTask as any)?.thread_id &&
      Array.isArray(project_watchers) &&
      project_watchers.length > 0 &&
      pendingParticipants.length === 0
    ) {
      const initial = project_watchers
        .filter((pw: any) => pw.users && pw.user_id)
        .map((pw: any) => ({ ...pw.users, id: pw.user_id }));
      console.log('INITIALIZE pendingParticipants for task with no threads:', initial);
      setPendingParticipants(initial);
    }
  }, [selectedTask?.id, isAddingThread]);

  // Add a function to refetch the selected thread and update threadsList
  const refetchSelectedThread = async () => {
    if (!selectedThreadId) return;
    try {
      const { data, error } = await supabase
        .from('threads')
        .select(`
          id,
          title,
          created_at,
          thread_watchers (
            watcher_id,
            users!thread_watchers_watcher_id_fkey (
              id,
              full_name,
              email,
              auth_user_id
            )
          )
        `)
        .eq('id', selectedThreadId)
        .single();
      if (error) throw error;
      setThreadsList(prev => prev.map(t => t.id === data.id ? {
        ...t,
        thread_watchers: Array.isArray(data.thread_watchers)
          ? data.thread_watchers.filter((tw: any) => !!tw.users)
          : [],
      } : t));
    } catch (err) {
      console.error('Failed to refetch thread after participant change', err);
    }
  };

  const handleNavigateToThread = useCallback((thread: any) => {
    if (!thread) return
    const outputId = typeof thread?.task_component_output_id === "string" ? thread.task_component_output_id : null
    if (!outputId) return
    const threadId = Number(thread?.id)
    const anchorType = typeof thread?.anchor_type === "string" ? thread.anchor_type : null
    const attachmentId = typeof thread?.attachment_id === "string" ? thread.attachment_id : null
    const anchorStart = Number.isFinite(Number(thread?.anchor_start)) ? Number(thread.anchor_start) : null
    const anchorEnd = Number.isFinite(Number(thread?.anchor_end)) ? Number(thread.anchor_end) : null
    const anchorX = Number.isFinite(Number(thread?.anchor_x)) ? Number(thread.anchor_x) : null
    const anchorY = Number.isFinite(Number(thread?.anchor_y)) ? Number(thread.anchor_y) : null
    const anchorQuote = typeof thread?.anchor_quote === "string" ? thread.anchor_quote : null
    window.dispatchEvent(
      new CustomEvent("task-details:navigate-comment-thread", {
        detail: {
          taskId: taskIdNum,
          threadId: Number.isFinite(threadId) ? threadId : null,
          outputId,
          attachmentId,
          anchorType,
          anchorStart,
          anchorEnd,
          anchorX,
          anchorY,
          anchorQuote,
        },
      })
    )
    if (taskIdNum) {
      window.dispatchEvent(
        new CustomEvent("task-details:focus-outputs", {
          detail: {
            taskId: taskIdNum,
            outputId,
          },
        })
      )
    }
    setTaskTab("content")
  }, [setTaskTab, taskIdNum])

  // Shared props for comments panel (in-pane or modal/drawer). Single source for list/input/footer parts.
  const commentsPanelProps = useMemo(
    () =>
      task && !isSuggestionMode
        ? {
            taskIdNum,
            task,
            isSuggestionMode,
            currentUserId,
            isThreadView,
            openThreadView: openCommentThreadView,
            showAllThreadsView: showAllCommentThreadsView,
            selectedThreadId,
            setSelectedThreadId,
            isAddingThread,
            setIsAddingThread,
            threadsList,
            allMentions,
            commentsStatusFilter,
            setCommentsStatusFilter,
            latestMentions,
            participants,
            project_watchers: project_watchers ?? [],
            allProjectUsers: allProjectUsers ?? [],
            refetchSelectedThread,
            handleViewThreadHistory,
            onThreadNavigate: handleNavigateToThread,
            onToggleThreadResolved: handleToggleThreadResolved,
            isThreadResolving: (threadId: number) => resolvingThreadIds.has(Number(threadId)),
            isThreadListLoading,
            pendingParticipants,
            setPendingParticipants,
            removedParticipants,
            setRemovedParticipants,
            replyTo,
            setReplyTo,
            onClearReply: () => setReplyTo(null),
            handleDeleteThread,
            handleAddThread,
            showDeleteThreadDialog,
            setShowDeleteThreadDialog,
            isDeleting,
            currentUserName,
            currentUserAvatar: currentUserPhotoUrl ?? '',
            currentUserEmail,
            currentPublicUserId,
            pendingOutputAnchor,
            onConsumePendingOutputAnchor: () => setPendingOutputAnchor(null),
            composerFocusToken: commentsComposerFocusToken,
          }
        : null,
    [
      task,
      isSuggestionMode,
      taskIdNum,
      currentUserId,
      isThreadView,
      selectedThreadId,
      openCommentThreadView,
      showAllCommentThreadsView,
      isAddingThread,
      threadsList,
      allMentions,
      commentsStatusFilter,
      latestMentions,
      participants,
      project_watchers,
      allProjectUsers,
      isThreadListLoading,
      handleNavigateToThread,
      handleToggleThreadResolved,
      resolvingThreadIds,
      pendingParticipants,
      removedParticipants,
      replyTo,
      showDeleteThreadDialog,
      isDeleting,
      currentUserName,
      currentUserPhotoUrl,
      currentUserEmail,
      currentPublicUserId,
      pendingOutputAnchor,
      commentsComposerFocusToken,
      handleViewThreadHistory,
    ]
  );

  const handleOpenTaskCommentsPanel = useCallback((threadId?: number | null) => {
    setTaskTab("comments")
    void handleViewThreadHistory()
    if (typeof threadId === "number" && Number.isFinite(threadId)) {
      openCommentThreadView(threadId)
      return
    }
    showAllCommentThreadsView()
  }, [handleViewThreadHistory, openCommentThreadView, showAllCommentThreadsView, setTaskTab])

  useEffect(() => {
    if (!isCommentsTabActive || !selectedTask || isSuggestionMode) return
    void handleViewThreadHistory()
  }, [isCommentsTabActive, selectedTask?.id, isSuggestionMode, handleViewThreadHistory])

  const ENABLE_EMBED_REFRESH_ON_DECISION = true
  const [isApprovingSuggestion, setIsApprovingSuggestion] = useState(false)
  const [isDismissingSuggestion, setIsDismissingSuggestion] = useState(false)
  const implicitApprovedTaskIdRef = useRef<number | null>(null)

  const suggestionIdNum = useMemo(() => {
    if (!isSuggestionMode) return null
    const n = Number((selectedTask as any)?.id)
    return Number.isFinite(n) ? n : null
  }, [isSuggestionMode, (selectedTask as any)?.id])

  const suggestionStatus = (selectedTask as any)?.status ?? 'pending'
  const suggestionSourceKey = (selectedTask as any)?.source_key ?? null
  // Suggestion mode reuses TaskDetails UI; we do not render additional fields beyond the existing ones.

  const removeSuggestionFromPlannerCaches = useCallback(
    (suggestionId: number) => {
      // Remove from suggestion lists (planner surface)
      queryClient.setQueriesData(
        {
          predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'task-suggestions',
        },
        (old: any) => {
          if (!Array.isArray(old)) return old
          return old.filter((s: any) => String(s?.id) !== String(suggestionId))
        },
      )
      // Remove from suggestion details cache
      queryClient.setQueryData(['task-suggestion', String(suggestionId)], null)
      queryClient.setQueryData(['task-suggestion', suggestionId], null)
    },
    [queryClient],
  )

  const refreshEmbeddingsBestEffort = useCallback(
    async (projectId: number | null) => {
      if (!ENABLE_EMBED_REFRESH_ON_DECISION) return
      if (projectId == null) return
      try {
        await supabase.functions.invoke("ai-embed-planner-memory", {
          body: {
            project_id: projectId,
            lookback_days: 7,
            max_items: 200,
            include_pending: false,
          },
        })
      } catch {
        // ignore
      }
    },
    [supabase],
  )

  const approveSuggestionCore = useCallback(async (opts?: { reason?: string }) => {
    if (!isSuggestionMode) return
    if (!suggestionIdNum) return
    if (!currentUserId) {
      toast({
        title: "Missing user",
        description: "Could not determine current user id.",
        variant: "destructive",
      })
      return
    }
    if (isApprovingSuggestion || isDismissingSuggestion) return

    setIsApprovingSuggestion(true)
    try {
      await flushPendingEdits(suggestionSourceKey)

      const { data, error } = await supabase.rpc("approve_task_suggestion", {
        p_suggestion_id: suggestionIdNum,
        p_approved_by: currentUserId,
      })
      if (error) throw error
      const payload = data as any
      if (payload && typeof payload === 'object' && payload.ok === false) {
        throw new Error(typeof payload.message === 'string' ? payload.message : 'Approval failed')
      }

      const taskId =
        (typeof payload?.task_id === 'number' && Number.isFinite(payload.task_id) ? payload.task_id : null) ??
        (typeof payload?.created_task_id === 'number' && Number.isFinite(payload.created_task_id) ? payload.created_task_id : null) ??
        (typeof payload?.taskId === 'number' && Number.isFinite(payload.taskId) ? payload.taskId : null)

      if (!taskId) throw new Error("Approve succeeded but no task_id was returned")

      const planned = (selectedTask as any)?.publication_date ?? (selectedTask as any)?.delivery_date ?? null
      const nextTask: any = {
        kind: 'task',
        id: taskId,
        title: (selectedTask as any)?.title ?? 'Planned task',
        assigned_to_id: null,
        assigned_to_name: null,
        assigned_to_photo: null,
        project_id_int: (selectedTask as any)?.project_id_int ?? 0,
        project_name: (selectedTask as any)?.project_name ?? null,
        project_color: (selectedTask as any)?.project_color ?? null,
        project_logo: (selectedTask as any)?.project_logo ?? null,
        project_status_id: null,
        project_status_name: null,
        project_status_color: null,
        delivery_date: planned,
        publication_date: planned,
        is_overdue: null,
        is_publication_overdue: null,
        updated_at: new Date().toISOString(),
        content_type_id: (selectedTask as any)?.content_type_id != null ? Number((selectedTask as any).content_type_id) : null,
        content_type_title: (selectedTask as any)?.content_type_title ?? null,
        production_type_id: null,
        production_type_title: null,
        language_id: null,
        language_code: null,
        briefing: (selectedTask as any)?.briefing ?? null,
        source_key: suggestionSourceKey,
      }

      removeSuggestionFromPlannerCaches(suggestionIdNum)
      upsertOptimisticPlannerTask(nextTask)
      void queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'task-suggestions',
      })
      void queryClient.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          (q.queryKey[0] === 'task-group-meta-paged' || q.queryKey[0] === 'task-group-tasks'),
      })
      toast({ title: opts?.reason ? "Suggestion approved — now a task" : "Task created" })

      // Switch the right pane to the newly created task.
      try {
        const p = new URLSearchParams(searchParams.toString())
        p.set('id', String(taskId))
        p.delete('itemKind')
        router.push(`${pathname}?${p.toString()}`, { scroll: false })
      } catch {
        // ignore
      }

      void refreshEmbeddingsBestEffort((selectedTask as any)?.project_id_int ?? null)
      return taskId as number
    } catch (err: any) {
      toast({
        title: "Failed to approve",
        description: err?.message || "Approval failed",
        variant: "destructive",
      })
      return undefined
    } finally {
      setIsApprovingSuggestion(false)
    }
  }, [
    isSuggestionMode,
    suggestionIdNum,
    currentUserId,
    isApprovingSuggestion,
    isDismissingSuggestion,
    supabase,
    suggestionSourceKey,
    selectedTask,
    removeSuggestionFromPlannerCaches,
    upsertOptimisticPlannerTask,
    router,
    pathname,
    searchParams,
    refreshEmbeddingsBestEffort,
  ])

  const ensureSuggestionApproved = useCallback(
    async (reason: string) => {
      const already = implicitApprovedTaskIdRef.current
      if (already) return already
      const taskId = await approveSuggestionCore({ reason })
      if (typeof taskId === 'number' && Number.isFinite(taskId)) {
        implicitApprovedTaskIdRef.current = taskId
        return taskId
      }
      return null
    },
    [approveSuggestionCore],
  )

  const handleApproveSuggestion = useCallback(async () => {
    await approveSuggestionCore()
  }, [approveSuggestionCore])
  const handleDismissSuggestion = useCallback(async () => {
    if (!isSuggestionMode) return
    if (!suggestionIdNum) return
    if (isApprovingSuggestion || isDismissingSuggestion) return

    setIsDismissingSuggestion(true)
    try {
      const { data, error } = await supabase.rpc("set_task_suggestion_status", {
        p_suggestion_id: suggestionIdNum,
        p_status: "dismissed",
      })
      if (error) throw error
      const payload = data as any
      if (payload && typeof payload === 'object' && payload.ok === false) {
        throw new Error(typeof payload.message === 'string' ? payload.message : 'Dismiss failed')
      }

      removeSuggestionFromPlannerCaches(suggestionIdNum)
      void queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'task-suggestions',
      })
      toast({ title: "Suggestion dismissed" })
      onClose()

      void refreshEmbeddingsBestEffort((selectedTask as any)?.project_id_int ?? null)
    } catch (err: any) {
      toast({
        title: "Failed to dismiss",
        description: err?.message || "Dismiss failed",
        variant: "destructive",
      })
    } finally {
      setIsDismissingSuggestion(false)
    }
  }, [
    isSuggestionMode,
    suggestionIdNum,
    isApprovingSuggestion,
    isDismissingSuggestion,
    supabase,
    removeSuggestionFromPlannerCaches,
    onClose,
    refreshEmbeddingsBestEffort,
    selectedTask,
  ])

  // Add local state for each field
  const [title, setTitle] = useState(task?.title ?? '');
  const [copyPost, setCopyPost] = useState(task?.copy_post ?? '');
  const [briefing, setBriefing] = useState(task?.briefing ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');

  // Keep local state in sync with task changes
  useEffect(() => { if (!isEditingTitle) setTitle(task?.title ?? ''); }, [task?.title, isEditingTitle]);
  useEffect(() => { setCopyPost(task?.copy_post ?? ''); }, [task?.copy_post]);
  useEffect(() => { setBriefing(task?.briefing ?? ''); }, [task?.briefing]);
  useEffect(() => { setNotes(task?.notes ?? ''); }, [task?.notes]);

  // Helper functions to get current display values (optimistic or actual)
  const filteredUserId = useMemo(() => optimisticAssignedUserId ?? task?.assigned_to_id ?? null, [optimisticAssignedUserId, task?.assigned_to_id]);

  const currentAssignedUserName = useMemo(() => {
    return optimisticAssignedUserName !== null ? optimisticAssignedUserName : task?.assigned_to_name;
  }, [optimisticAssignedUserName, task?.assigned_to_name]);

  const currentProjectName = useMemo(() => {
    return optimisticProjectName !== null ? optimisticProjectName : task?.project_name;
  }, [optimisticProjectName, task?.project_name]);
  const currentProjectColor = useMemo(() => {
    return optimisticProjectColor !== null ? optimisticProjectColor : task?.project_color;
  }, [optimisticProjectColor, task?.project_color]);

  // Helper functions for optimistic dates
  const currentDueDate = useMemo(() => {
    return optimisticDueDate !== null ? optimisticDueDate : task?.delivery_date;
  }, [optimisticDueDate, task?.delivery_date]);

  const currentPublicationDate = useMemo(() => {
    return optimisticPublicationDate !== null ? optimisticPublicationDate : task?.publication_date;
  }, [optimisticPublicationDate, task?.publication_date]);

  // Helper functions for optimistic content fields
  const currentContentTypeId = useMemo(() => {
    return optimisticContentTypeId !== null ? optimisticContentTypeId : task?.content_type_id;
  }, [optimisticContentTypeId, task?.content_type_id]);

  const currentContentTypeTitle = useMemo(() => {
    return optimisticContentTypeTitle !== null ? optimisticContentTypeTitle : task?.content_type_title;
  }, [optimisticContentTypeTitle, task?.content_type_title]);

  const currentProductionTypeId = useMemo(() => {
    return optimisticProductionTypeId !== null ? optimisticProductionTypeId : task?.production_type_id;
  }, [optimisticProductionTypeId, task?.production_type_id]);

  const currentProductionTypeTitle = useMemo(() => {
    return optimisticProductionTypeTitle !== null ? optimisticProductionTypeTitle : task?.production_type_title;
  }, [optimisticProductionTypeTitle, task?.production_type_title]);

  const currentLanguageId = useMemo(() => {
    return optimisticLanguageId !== null ? optimisticLanguageId : task?.language_id;
  }, [optimisticLanguageId, task?.language_id]);

  const currentLanguageCode = useMemo(() => {
    return optimisticLanguageCode !== null ? optimisticLanguageCode : task?.language_code;
  }, [optimisticLanguageCode, task?.language_code]);

  const currentStatusId = useMemo(() => {
    return optimisticStatusId !== null ? optimisticStatusId : task?.project_status_id;
  }, [optimisticStatusId, task?.project_status_id]);

  const currentStatusName = useMemo(() => {
    return optimisticStatusName !== null ? optimisticStatusName : task?.project_status_name;
  }, [optimisticStatusName, task?.project_status_name]);

  const currentStatusColor = useMemo(() => {
    return optimisticStatusColor !== null ? optimisticStatusColor : task?.project_status_color;
  }, [optimisticStatusColor, task?.project_status_color]);

  // --- Step 2: Memoize label/value transforms for dropdowns ---
  const statusOptions = useMemo(
    () => filteredStatuses.map(s => ({ value: String(s.id), label: s.name, color: s.color })),
    [filteredStatuses]
  );
  const assigneeOptions = useMemo(
    () => filteredWatchers.map(w => ({
      value: String(w.user_id),
      label: w.users.full_name,
      photo: w.users.photo || null,
    })),
    [filteredWatchers]
  );
  const contentTypeOptions = useMemo(
    () => filteredContentTypes.map(ct => ({ value: String(ct.id), label: ct.title })),
    [filteredContentTypes]
  );
  const productionTypeOptions = useMemo(
    () => filteredProductionTypes.map(pt => ({ value: String(pt.id), label: pt.title })),
    [filteredProductionTypes]
  );
  const languageOptions = useMemo(
    () => filteredLanguages.map(l => ({ value: String(l.id), label: l.long_name })),
    [filteredLanguages]
  );
  const projectOptions = useMemo(() => {
    const activeProjects = (editFields?.projects ?? [])
      .filter((opt: any) => opt.active === undefined || opt.active === true)
      .map((opt: any) => ({
        value: String(opt.id),
        label: opt.name,
        logo: opt.logo ?? opt.logo_url ?? null,
      }))
    if (currentProjectId && !activeProjects.some((opt) => String(opt.value) === String(currentProjectId))) {
      activeProjects.unshift({
        value: String(currentProjectId),
        label: currentProjectName || `Project #${currentProjectId}`,
        logo: (task as any)?.project?.logo ?? null,
      })
    }
    return activeProjects
  }, [editFields?.projects, currentProjectId, currentProjectName, task]);
  const currentProjectOption = useMemo(
    () => projectOptions.find((opt) => String(opt.value) === String(currentProjectId ?? '')) ?? null,
    [projectOptions, currentProjectId]
  )
  const filteredProjectOptions = useMemo(() => {
    const q = projectSearchQuery.trim().toLowerCase()
    if (!q) return projectOptions
    return projectOptions.filter((opt) => String(opt.label || "").toLowerCase().includes(q))
  }, [projectOptions, projectSearchQuery])
  const channelOptions = useMemo(
    () => filteredChannels.map(c => ({ value: String(c.id), label: c.name })),
    [filteredChannels]
  );
  const selectedTaskWatcherIds = useMemo(
    () => new Set(taskWatchers.map((w) => w.watcher_user_id)),
    [taskWatchers]
  )
  const watcherDropdownOptions = useMemo(() => {
    const byId = new Map<number, { watcher_user_id: number; full_name: string | null; photo: string | null }>()
    for (const w of taskWatchers) {
      byId.set(w.watcher_user_id, w)
    }
    for (const w of eligibleTaskWatchers) {
      if (!byId.has(w.watcher_user_id)) byId.set(w.watcher_user_id, w)
    }
    const options = Array.from(byId.values())
    return options.sort((a, b) => {
      const aSelected = selectedTaskWatcherIds.has(a.watcher_user_id) ? 0 : 1
      const bSelected = selectedTaskWatcherIds.has(b.watcher_user_id) ? 0 : 1
      if (aSelected !== bSelected) return aSelected - bSelected
      return (a.full_name || '').localeCompare(b.full_name || '')
    })
  }, [taskWatchers, eligibleTaskWatchers, selectedTaskWatcherIds])

  const handleToggleTaskWatcher = useCallback(
    async (watcherUserId: number) => {
      if (isTaskWatchersMutating || !taskIdNum) return
      if (selectedTaskWatcherIds.has(watcherUserId)) {
        await removeWatcher(watcherUserId)
      } else {
        await addWatchers([watcherUserId])
      }
    },
    [isTaskWatchersMutating, taskIdNum, selectedTaskWatcherIds, removeWatcher, addWatchers],
  )

  const handleOpenWatcherProfile = useCallback(
    (watcherUserId: number) => {
      setIsAddWatcherOpen(false)
      openCenterEntity("user", watcherUserId)
    },
    [openCenterEntity],
  )

  // Add Typesense updater
  const typesenseQuery = useTypesenseInfiniteQuery({ q: '', pageSize: 25, enabled: false });

  // Helper to calculate overdue status based on dates and project status
  function calculateOverdueStatus(
    deliveryDate: string | null,
    publicationDate: string | null,
    projectStatusId: string | null,
    projectStatuses: any[]
  ): { isOverdue: boolean; isPublicationOverdue: boolean } {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Compare only dates, not time

    // Find the current project status
    const currentStatus = projectStatuses.find(s => String(s.id) === String(projectStatusId));
    
    // Calculate delivery overdue
    let isOverdue = false;
    if (deliveryDate && !currentStatus?.is_closed) {
      const deliveryDateObj = new Date(deliveryDate);
      deliveryDateObj.setHours(0, 0, 0, 0);
      isOverdue = deliveryDateObj < now;
    }

    // Calculate publication overdue
    let isPublicationOverdue = false;
    if (publicationDate && !currentStatus?.is_publication_closed) {
      const publicationDateObj = new Date(publicationDate);
      publicationDateObj.setHours(0, 0, 0, 0);
      isPublicationOverdue = publicationDateObj < now;
    }

    return { isOverdue, isPublicationOverdue };
  }

  // Friendly date labels: "Jul 16" (current year) / "Jul 16, 2025" (other years)
  function formatDateWithYear(dateString: string | null | undefined): string {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) return "—";
      const currentYear = new Date().getFullYear();
      if (date.getFullYear() === currentYear) {
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return "Invalid date";
    }
  }

  // --- Task Duplicate Logic ---
  const handleDuplicateTask = () => {
    if (!task) return;
    
    // Prepare initial values for the AddTaskForm
    const initialValues = {
      title: `${task.title} (Copy)`,
      notes: task.notes || "",
      briefing: task.briefing || "",
      assigned_to_id: task.assigned_to_id || "",
      project_id_int: task.project_id_int ? String(task.project_id_int) : "",
      content_type_id: task.content_type_id || "",
      production_type_id: task.production_type_id || "",
      language_id: task.language_id || "",
      project_status_id: task.project_status_id || "",
      channels: task.channel_names || [],
      delivery_date: task.delivery_date || "",
      publication_date: task.publication_date || "",
    };
    
    // Call parent's onDuplicateTask handler
    if (onDuplicateTask) {
      onDuplicateTask(initialValues);
    }
  };
  const tabTriggerClassName =
    "-mb-px rounded-none border-b-0 data-[state=active]:bg-transparent data-[state=active]:shadow-[inset_0_-2px_0_0_#111827]"

  return (
    <>
    <div
        ref={setTaskDetailsContainerRef}
        onFocusCapture={handleTaskDetailsFocusCapture}
        className={cn(
          'relative flex h-full flex-col overflow-x-hidden transition-colors duration-150',
          isDraggingOver && 'bg-gray-100/80'
        )}
      >
      <div className="flex min-h-0 flex-1 flex-col">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={cn(TASK_PANE_HEADER_SHELL_CLASS, "border-b-0")}>
        {/* Header: title and actions */}
        <div className={TASK_PANE_HEADER_ROW_CLASS}>
          {onDetailStackBack ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 shrink-0 p-0 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              onClick={onDetailStackBack}
              aria-label="Back to profile"
              title="Back to profile"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          ) : isMobile && onMobileBack ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 shrink-0 p-0 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              onClick={onMobileBack}
              aria-label="Go back"
              title="Go back"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          ) : null}
          {/* Task Title */}
          <div className="mr-4 min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-gray-900">
              {isLoading ? "Loading..." : (task?.title || "Untitled Task")}
            </h1>
            <div className="mt-1 flex flex-nowrap items-center gap-2 text-xs text-gray-500">
              {(() => {
                const projectName = task?.project?.name ?? currentProjectName ?? "No project"
                const projectVisual = projectLogoUrl ? (
                  <img src={projectLogoUrl} alt="" className="h-4 w-4 shrink-0 rounded-sm object-cover" />
                ) : (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-gray-300"
                    style={currentProjectColor ? { backgroundColor: currentProjectColor } : undefined}
                  />
                )
                if (!isSuggestionMode && currentProjectId != null) {
                  return (
                    <button
                      type="button"
                      onClick={() => openCenterEntity("project", currentProjectId)}
                      className="flex min-w-0 items-center gap-2 rounded transition-colors hover:text-gray-700 hover:underline"
                      title={`Open ${projectName}`}
                    >
                      {projectVisual}
                      <span className="truncate">{projectName}</span>
                    </button>
                  )
                }
                return (
                  <>
                    {projectVisual}
                    <span className="truncate">{projectName}</span>
                  </>
                )
              })()}
              {!isSuggestionMode ? (
                <>
                  <span className="shrink-0 text-gray-300" aria-hidden>·</span>
                  {canEdit ? (
                    <span className="inline-flex h-5 max-w-[12rem] shrink-0 items-center">
                      <Select
                        value={isLoading ? NONE_OPTION : (currentStatusId || NONE_OPTION)}
                        onValueChange={
                          isLoading
                            ? undefined
                            : (value) =>
                                handleStatusChange({
                                  target: { value: value === NONE_OPTION ? "" : value },
                                } as React.ChangeEvent<HTMLSelectElement>)
                        }
                      >
                        <SelectTrigger
                          hideDropdownIcon
                          className="!flex h-5 w-fit max-w-[12rem] shrink-0 flex-row flex-nowrap items-center gap-0 overflow-hidden whitespace-nowrap border-0 bg-transparent p-0 shadow-none focus:ring-0 focus:ring-offset-0 [&>span]:line-clamp-none [&>span]:inline-flex [&>span]:max-w-full [&>span]:items-center [&>span]:overflow-hidden [&>span]:whitespace-nowrap"
                          aria-label="Change task status"
                        >
                          {currentStatusName ? (
                            <span
                              className="inline-flex h-5 max-w-[12rem] items-center gap-0.5 overflow-hidden whitespace-nowrap rounded-full px-2 text-[10px] font-medium leading-none"
                              style={{
                                backgroundColor: currentStatusColor || "#e5e7eb",
                                color: currentStatusColor ? "#fff" : "#374151",
                              }}
                            >
                              <span className="min-w-0 truncate">{currentStatusName}</span>
                              <ChevronDown className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                            </span>
                          ) : (
                            <span className="inline-flex h-5 items-center gap-0.5 whitespace-nowrap rounded-full bg-gray-100 px-2 text-[10px] font-medium leading-none text-gray-600">
                              <span className="min-w-0 truncate">
                                {isEditFieldsLoading
                                  ? "Loading..."
                                  : editFieldsError
                                    ? "Error"
                                    : "Status"}
                              </span>
                              <ChevronDown className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                            </span>
                          )}
                        </SelectTrigger>
                        <SelectContent className="w-[min(90vw,16rem)] max-w-full">
                          <SelectItem value={NONE_OPTION}>Select status</SelectItem>
                          {statusOptions.map((opt) => (
                            <SelectItem key={String(opt.value)} value={String(opt.value)}>
                              <span
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                                style={{
                                  backgroundColor: opt.color || "#e5e7eb",
                                  color: opt.color ? "#fff" : "#374151",
                                }}
                              >
                                {opt.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </span>
                  ) : currentStatusName ? (
                    <span
                      className="inline-flex h-5 max-w-[12rem] shrink-0 items-center overflow-hidden whitespace-nowrap rounded-full px-2 text-[10px] font-medium leading-none"
                      style={{
                        backgroundColor: currentStatusColor || "#e5e7eb",
                        color: currentStatusColor ? "#fff" : "#374151",
                      }}
                      title={currentStatusName}
                    >
                      <span className="min-w-0 truncate">{currentStatusName}</span>
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10px] text-gray-400">No status</span>
                  )}
                </>
              ) : null}
              {!isSuggestionMode ? (
                <Popover
                  open={isAddWatcherOpen}
                  onOpenChange={(open) => {
                    setIsAddWatcherOpen(open);
                  }}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="ml-1 inline-flex max-w-[140px] items-center gap-1 overflow-hidden rounded-full border border-gray-200 bg-white px-1.5 py-0.5"
                      title="Manage watchers"
                      aria-label="Manage watchers"
                    >
                      <div className="flex items-center -space-x-1">
                        {taskWatchers.slice(0, 3).map((u) => (
                          <UserAvatar
                            key={u.watcher_user_id}
                            name={u.full_name ?? `User #${u.watcher_user_id}`}
                            photoUrl={getImageUrl(u.photo)}
                            size="xs"
                            className="h-5 w-5 min-h-5 min-w-5"
                          />
                        ))}
                      </div>
                      {taskWatchers.length > 3 ? (
                        <span className="text-[10px] text-gray-500">+{taskWatchers.length - 3}</span>
                      ) : null}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[min(90vw,20rem)] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search project users…"
                        disabled={isTaskWatchersMutating}
                      />
                      <CommandList className="max-h-[260px]">
                        <CommandEmpty>
                          No users found
                        </CommandEmpty>
                        <CommandGroup>
                          {watcherDropdownOptions.map((u) => {
                            const isWatcher = selectedTaskWatcherIds.has(u.watcher_user_id)
                            const displayName = u.full_name ?? `User #${u.watcher_user_id}`
                            return (
                              <CommandItem
                                key={u.watcher_user_id}
                                value={`${u.full_name ?? ""} ${u.watcher_user_id}`}
                                className={cn(
                                  "group cursor-pointer",
                                  isTaskWatchersMutating && "pointer-events-none opacity-50",
                                )}
                                onSelect={() => {
                                  void handleToggleTaskWatcher(u.watcher_user_id)
                                }}
                              >
                                <div className="flex w-full min-w-0 items-center gap-2">
                                  <UserAvatar
                                    name={displayName}
                                    photoUrl={getImageUrl(u.photo)}
                                    size="xs"
                                  />
                                  <span className="min-w-0 flex-1 truncate" title={displayName}>
                                    {displayName}
                                  </span>
                                  <button
                                    type="button"
                                    title={`Open ${displayName}`}
                                    aria-label={`Open ${displayName}`}
                                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-700 group-hover:opacity-100"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      handleOpenWatcherProfile(u.watcher_user_id)
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </button>
                                  <span
                                    className={cn(
                                      "shrink-0 text-[10px] font-medium",
                                      isWatcher ? "text-gray-700" : "text-gray-400",
                                    )}
                                  >
                                    {isWatcher ? "Watching" : "Add"}
                                  </span>
                                </div>
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>
          </div>
          
          {/* Actions - right aligned */}
          <div className="flex items-center gap-2">
            {/* Actions dropdown menu */}
            {!isSuggestionMode ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                {/* Add subtask - only for regular tasks (not main or subtask) */}
                {!isLoading && task && task.content_type_id !== '39' && !task.parent_task_id_int && (
                  <DropdownMenuItem onClick={handleAddSubtaskForRegular}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Subtask
                  </DropdownMenuItem>
                )}
                {!isSuggestionMode && (
                  <DropdownMenuItem onClick={handleDuplicateTask}>
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicate Task
                  </DropdownMenuItem>
                )}
                {!isSuggestionMode && taskIdNum ? (
                  <DropdownMenuItem
                    onClick={() => {
                      setTaskTab("content")
                      window.dispatchEvent(new CustomEvent("task-details:focus-outputs", { detail: { taskId: taskIdNum } }))
                    }}
                  >
                    <Maximize2 className="w-4 h-4 mr-2" />
                    Focus outputs
                  </DropdownMenuItem>
                ) : null}
                {!isSuggestionMode && taskIdNum ? (
                  <DropdownMenuItem
                    onClick={() => {
                      if (activeTaskTab !== "content" && activeTaskTab !== "overview") {
                        setTaskTab("content")
                      }
                      window.setTimeout(() => {
                        window.dispatchEvent(
                          new CustomEvent("task-details:open-content-history", {
                            detail: { taskId: taskIdNum },
                          }),
                        )
                      }, 0)
                    }}
                  >
                    <History className="w-4 h-4 mr-2" />
                    Content history
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2">
                    <Share2 className="w-4 h-4" />
                    Share
                    <ChevronRight className="ml-auto h-4 w-4 shrink-0 opacity-60" />
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {taskIdNum ? (
                      <DropdownMenuItem
                        onClick={() => {
                          setTaskTab("content")
                          window.dispatchEvent(new CustomEvent("task-details:download-outputs", { detail: { taskId: taskIdNum } }))
                        }}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onClick={() => {
                      if (typeof window !== 'undefined') {
                        navigator.clipboard.writeText(window.location.href);
                        toast({
                          title: 'Link copied',
                          description: 'Task link copied to clipboard',
                        });
                      }
                    }}>
                      <Share2 className="w-4 h-4 mr-2" />
                      Copy Link
                    </DropdownMenuItem>
                    {taskIdNum ? (
                      <DropdownMenuItem
                        disabled={!canCopyAllChannelContent}
                        onClick={() => {
                          if (!canCopyAllChannelContent) return
                          setTaskTab("content")
                          window.dispatchEvent(new CustomEvent("task-details:copy-outputs", { detail: { taskId: taskIdNum } }))
                        }}
                      >
                        <ClipboardCopy className="w-4 h-4 mr-2" />
                        Copy all content
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {!isSuggestionMode && taskIdNum ? (
                  <DropdownMenuItem onClick={handleQuickFiveStarReview}>
                    <Star className="w-4 h-4 mr-2" />
                    Quick 5-star review
                  </DropdownMenuItem>
                ) : null}
                {!isSuggestionMode && (
                  <DropdownMenuItem onClick={() => setIsDeleteDialogOpen(true)} className="text-red-600">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Task
                  </DropdownMenuItem>
                )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            {/* Suggestion actions are shown in a pinned bottom bar (see below) */}
            
            {/* Close button - hidden on mobile */}
            {onCollapse && !isMobile && (
              <button
                className="inline-flex items-center justify-center w-7 h-7 text-gray-500 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-blue-400"
                aria-label="Close details pane"
                onClick={onCollapse}
                type="button"
              >
                <X className="w-5 h-5" />
              </button>
            )}
            
            {/* Expand/restore button - hidden on mobile */}
            {(onExpand || onRestore) && !isMobile && (
              <button
                className="inline-flex items-center justify-center w-7 h-7 text-gray-500 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-blue-400"
                aria-label={isExpanded ? 'Restore details pane' : 'Expand details pane'}
                title={isExpanded ? 'Restore details pane' : 'Expand details pane'}
                onClick={isExpanded ? onRestore : onExpand}
                type="button"
              >
                {isExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </button>
            )}
          </div>
        </div>

      </div>
      {/* Suggestions only ever have the single Overview tab, so the tab bar is pure noise there — hide
          it and render the overview content directly. Normal tasks keep the full tab system. */}
      {!isSuggestionMode && (
      <Tabs
        value={activeTaskTab}
        onValueChange={(value) => setTaskTab(value as TaskTab)}
        className="flex-none"
      >
        <div
          ref={tabsScrollRef}
          className="ai-chat-tabs-scroll min-h-0 min-w-0 overflow-x-auto overflow-y-visible border-b border-gray-200"
          onMouseEnter={() => setIsTabsHovered(true)}
          onMouseLeave={() => setIsTabsHovered(false)}
        >
          <TabsList className="h-auto flex-nowrap justify-start rounded-none border-t-0 bg-transparent p-0 px-4 whitespace-nowrap">
            <TabsTrigger value="overview" className={tabTriggerClassName}>
              Overview
            </TabsTrigger>
            {!isSuggestionMode ? (
              <>
                <TabsTrigger value="attachments" className={tabTriggerClassName}>
                  Attachments
                </TabsTrigger>
                <TabsTrigger value="content" className={tabTriggerClassName}>
                  Content
                </TabsTrigger>
                <TabsTrigger value="artifacts" className={tabTriggerClassName}>
                  Artifacts
                </TabsTrigger>
                <TabsTrigger value="activity" className={tabTriggerClassName}>
                  Activity
                </TabsTrigger>
                <TabsTrigger value="reviews" className={tabTriggerClassName}>
                  Reviews
                </TabsTrigger>
                <TabsTrigger value="comments" className={tabTriggerClassName}>
                  Comments
                </TabsTrigger>
              </>
            ) : null}
          </TabsList>
        </div>
      </Tabs>
      )}
      {/* Main content (task-details body). The comments pane is a sibling <aside> below, so this
          column and the comments column share the same parent height via the top-level flex split. */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex-1 min-h-0 overflow-auto overflow-x-hidden">
          {activeTaskTab === "overview" && (
          <section className="p-4 pb-0">
              {/* Banner is rendered in the header for suggestion mode */}
          {!isSuggestionMode && (
            <h3 className="text-base font-medium text-gray-900 mb-3">Overview</h3>
          )}
          <div className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-2 items-start">
            {/* Task Title */}
            <label className="text-sm font-normal text-gray-400 self-center justify-self-start text-left" htmlFor="task-title">Title</label>
            {isEditingTitle && canEdit ? (
              <textarea
                ref={titleInputRef}
                id="task-title"
                data-ai-field-type="task_title"
                data-ai-field-label="Title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                onFocus={() =>
                  setTaskFieldContext({
                    fieldType: "task_title",
                    label: `${task?.title?.trim() || "Task"} - Title`,
                    entityId: task?.id ?? null,
                    instructions: taskBuildInstructions || null,
                  })
                }
                onBlur={() => {
                  if (title !== task?.title) handleFieldChange('title', title);
                  setIsEditingTitle(false);
                }}
                onKeyDown={e => { 
                  if (e.key === 'Enter' && !e.shiftKey) { 
                    if (title !== task?.title) handleFieldChange('title', title);
                    setIsEditingTitle(false); 
                  } else if (e.key === 'Escape') {
                    setTitle(task?.title ?? '');
                    setIsEditingTitle(false);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200 text-sm font-normal leading-normal resize-none min-h-[40px]"
                rows={1}
                autoFocus
                disabled={isLoading}
              />
            ) : (
              <div
                className="w-full px-3 py-2 rounded-md border border-gray-200 cursor-pointer hover:border-gray-300 min-h-[40px] flex items-center min-w-0 overflow-hidden"
                tabIndex={0}
                onClick={!canEdit ? undefined : (e) => {
                  const selection = window.getSelection()
                  if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) return
                  setIsEditingTitle(true)
                }}
                onKeyDown={!canEdit ? undefined : (e => { if (e.key === 'Enter') setIsEditingTitle(true) })}
                aria-label="Edit title"
                title={title || ''}
                style={isLoading ? { pointerEvents: 'none', opacity: 0.5 } : {}}
              >
                <span className="text-sm font-normal text-gray-900 truncate block min-w-0 whitespace-nowrap select-text">{title || <span className="text-gray-400">Click to set title</span>}</span>
              </div>
            )}
            {/* Project */}
            <label className="text-sm font-normal text-gray-400 self-center justify-self-start text-left" htmlFor="task-project">Project</label>
            {isSuggestionMode ? (
              hasMountedSuggestionControls ? (
                <Select
                  value={isLoading ? NONE_OPTION : (String(currentProjectId || '') || NONE_OPTION)}
                  onValueChange={
                    isLoading || isApprovingSuggestion || isDismissingSuggestion
                      ? undefined
                      : (value) => handleProjectChange({ target: { value: value === NONE_OPTION ? '' : value } } as React.ChangeEvent<HTMLSelectElement>)
                  }
                  onOpenChange={(open) => { if (open) setProjectSearchQuery("") }}
                >
                  <SelectTrigger className="h-10 min-h-10 w-full min-w-0 border-gray-200 rounded-md text-sm leading-none">
                    <div className="flex min-w-0 items-center gap-2">
                      {currentProjectOption?.logo ? (
                        <img
                          src={getImageUrl(currentProjectOption.logo || undefined) || undefined}
                          alt=""
                          className="h-4 w-4 shrink-0 rounded-sm object-cover"
                        />
                      ) : (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-gray-300" />
                      )}
                      <span className="truncate">
                        {currentProjectOption?.label || "Select project"}
                      </span>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="w-[min(90vw,28rem)] max-w-full">
                    <div className="px-2 pb-2 pt-1">
                      <input
                        type="text"
                        value={projectSearchQuery}
                        onChange={(e) => setProjectSearchQuery(e.target.value)}
                        placeholder="Search projects..."
                        className="h-8 w-full rounded border border-gray-200 px-2 text-xs"
                      />
                    </div>
                    <SelectItem value={NONE_OPTION}>Select project</SelectItem>
                    {filteredProjectOptions.map((opt) => (
                      <SelectItem key={String(opt.value)} value={String(opt.value)}>
                        <div className="flex items-center gap-2">
                          {opt.logo ? (
                            <img src={getImageUrl(opt.logo || undefined) || undefined} alt="" className="h-4 w-4 rounded-sm object-cover" />
                          ) : (
                            <span className="h-2 w-2 rounded-full bg-gray-300" />
                          )}
                          <span className="truncate">{opt.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="h-10 min-h-10 w-full rounded-md border border-gray-200 bg-white" />
              )
            ) : canEdit ? (
              <Select
                value={isLoading ? NONE_OPTION : (String(currentProjectId || '') || NONE_OPTION)}
                onValueChange={isLoading ? undefined : (value) => handleProjectChange({ target: { value: value === NONE_OPTION ? '' : value } } as React.ChangeEvent<HTMLSelectElement>)}
                onOpenChange={(open) => { if (open) setProjectSearchQuery("") }}
              >
                <SelectTrigger className="h-10 min-h-10 w-full min-w-0 border-gray-200 rounded-md text-sm leading-none">
                  <div className="flex min-w-0 items-center gap-2">
                    {currentProjectOption?.logo ? (
                      <img
                        src={getImageUrl(currentProjectOption.logo || undefined) || undefined}
                        alt=""
                        className="h-4 w-4 shrink-0 rounded-sm object-cover"
                      />
                    ) : (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-gray-300" />
                    )}
                    <span className="truncate">
                      {currentProjectOption?.label || "Select project"}
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent className="w-[min(90vw,28rem)] max-w-full">
                  <div className="px-2 pb-2 pt-1">
                    <input
                      type="text"
                      value={projectSearchQuery}
                      onChange={(e) => setProjectSearchQuery(e.target.value)}
                      placeholder="Search projects..."
                      className="h-8 w-full rounded border border-gray-200 px-2 text-xs"
                    />
                  </div>
                  <SelectItem value={NONE_OPTION}>Select project</SelectItem>
                  {filteredProjectOptions.map((opt) => (
                    <SelectItem key={String(opt.value)} value={String(opt.value)}>
                      <div className="flex items-center gap-2">
                        {opt.logo ? (
                          <img src={getImageUrl(opt.logo || undefined) || undefined} alt="" className="h-4 w-4 rounded-sm object-cover" />
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-gray-300" />
                        )}
                        <span className="truncate">{opt.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="w-full h-10 px-3 py-2 rounded-md border border-gray-200 truncate text-sm font-normal text-gray-900 min-w-0" title={currentProjectName || ''}>
                {task?.project || currentProjectName ? (
                  <ProjectBadge
                    name={task?.project?.name ?? currentProjectName}
                    logoUrl={projectLogoUrl}
                    color={task?.project?.color ?? task?.project_color ?? undefined}
                    size="sm"
                  />
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </div>
            )}
            {/* Assigned to (with avatar) */}
            <label className="text-sm font-normal text-gray-400 self-center justify-self-start text-left" htmlFor="task-assignee">Assigned to</label>
            {isSuggestionMode ? (
              hasMountedSuggestionControls ? (
                <Select
                  value={isLoading ? NONE_OPTION : (filteredUserId || NONE_OPTION)}
                  onValueChange={
                    isLoading || isApprovingSuggestion || isDismissingSuggestion
                      ? undefined
                      : (value) => handleAssigneeChange({ target: { value: value === NONE_OPTION ? '' : value } } as React.ChangeEvent<HTMLSelectElement>)
                  }
                >
                  <SelectTrigger className="h-10 min-h-10 w-full min-w-0 border-gray-200 rounded-md text-sm leading-none">
                    <SelectValue placeholder="Select assignee" />
                  </SelectTrigger>
                  <SelectContent className="w-[min(90vw,24rem)] max-w-full">
                    <SelectItem value={NONE_OPTION}>Select assignee</SelectItem>
                    {assigneeOptions.map((opt) => (
                      <SelectItem key={String(opt.value)} value={String(opt.value)}>
                        <div className="flex items-center gap-2">
                          <UserAvatar
                            name={opt.label}
                            photoUrl={getImageUrl(opt.photo)}
                            size="xs"
                          />
                          <span className="truncate">{opt.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="h-10 min-h-10 w-full rounded-md border border-gray-200 bg-white" />
              )
            ) : canEdit ? (
              <Select
                value={isLoading ? NONE_OPTION : (filteredUserId || NONE_OPTION)}
                onValueChange={isLoading ? undefined : (value) => handleAssigneeChange({ target: { value: value === NONE_OPTION ? '' : value } } as React.ChangeEvent<HTMLSelectElement>)}
              >
                <SelectTrigger className="h-10 min-h-10 w-full min-w-0 border-gray-200 rounded-md text-sm leading-none">
                  <SelectValue placeholder="Select assignee" />
                </SelectTrigger>
                <SelectContent className="w-[min(90vw,24rem)] max-w-full">
                  <SelectItem value={NONE_OPTION}>Select assignee</SelectItem>
                  {assigneeOptions.map((opt) => (
                    <SelectItem key={String(opt.value)} value={String(opt.value)}>
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          name={opt.label}
                          photoUrl={getImageUrl(opt.photo)}
                          size="xs"
                        />
                        <span className="truncate">{opt.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="w-full h-10 px-3 py-2 rounded-md border border-gray-200 truncate flex items-center gap-2 text-sm font-normal text-gray-900 min-w-0" title={currentAssignedUserName || ''}>
                {currentAssignedUserName ? (
                  <>
                    <UserAvatar name={currentAssignedUserName} photoUrl={assignedUserPhotoUrl} size="xs" />
                    <span className="truncate text-sm font-normal text-gray-900">{currentAssignedUserName}</span>
                  </>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </div>
            )}
            {/* Due date */}
            <label className="text-sm font-normal text-gray-400 self-center justify-self-start text-left" htmlFor="task-due-date">Due date</label>
            {canEdit || isSuggestionMode ? (
              <div className="relative w-full min-h-[40px] px-3 py-2 rounded-md border border-gray-200 flex items-center text-sm font-normal text-gray-900 min-w-0">
                <span className={`pointer-events-none truncate ${task?.is_overdue ? "text-red-600 font-medium" : ""}`}>
                  {currentDueDate ? formatDateWithYear(currentDueDate) : <span className="text-gray-400">Set due date</span>}
                </span>
                <input
                  ref={dueDateInputRef}
                  id="task-due-date"
                  type="date"
                  value={isLoading ? '' : currentDueDate ?? ''}
                  onChange={isLoading ? undefined : handleDueDateChange}
                  onBlur={isLoading ? undefined : handleDueDateBlur}
                  onKeyDown={isLoading ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dueDateInputRef.current?.showPicker?.(); } handleDueDateKeyDown(e); }}
                  onClick={isLoading ? undefined : () => dueDateInputRef.current?.showPicker?.()}
                  className="absolute inset-0 h-full w-full opacity-0 cursor-pointer z-[1]"
                  disabled={isLoading || isApprovingSuggestion || isDismissingSuggestion}
                  aria-label="Due date"
                />
              </div>
            ) : (
              <div className="w-full min-h-[40px] px-3 py-2 rounded-md border border-gray-200 truncate text-sm font-normal text-gray-900 min-w-0" title={currentDueDate ? formatDateWithYear(currentDueDate) : ''}>
                <span className={task?.is_overdue ? "text-red-600 font-medium" : ""}>
                  {currentDueDate ? formatDateWithYear(currentDueDate) : <span className="text-gray-400">—</span>}
                </span>
              </div>
            )}
            {/* Publish date */}
            <label className="text-sm font-normal text-gray-400 self-center justify-self-start text-left" htmlFor="task-publication-date">Publish date</label>
            {canEdit ? (
              <div className="relative w-full min-h-[40px] px-3 py-2 rounded-md border border-gray-200 flex items-center text-sm font-normal text-gray-900 min-w-0">
                <span className={`pointer-events-none truncate ${task?.is_publication_overdue ? "text-red-600 font-medium" : ""}`}>
                  {currentPublicationDate ? formatDateWithYear(currentPublicationDate) : <span className="text-gray-400">Set publish date</span>}
                </span>
                <input
                  ref={publicationDateInputRef}
                  id="task-publication-date"
                  type="date"
                  value={isLoading ? '' : currentPublicationDate ?? ''}
                  onChange={isLoading ? undefined : handlePublicationDateChange}
                  onBlur={isLoading ? undefined : handlePublicationDateBlur}
                  onKeyDown={isLoading ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); publicationDateInputRef.current?.showPicker?.(); } handlePublicationDateKeyDown(e); }}
                  onClick={isLoading ? undefined : () => publicationDateInputRef.current?.showPicker?.()}
                  className="absolute inset-0 h-full w-full opacity-0 cursor-pointer z-[1]"
                  disabled={isLoading}
                  aria-label="Publication date"
                />
              </div>
            ) : (
              <div className="w-full min-h-[40px] px-3 py-2 rounded-md border border-gray-200 truncate text-sm font-normal text-gray-900 min-w-0" title={currentPublicationDate ? formatDateWithYear(currentPublicationDate) : ''}>
                <span className={task?.is_publication_overdue ? "text-red-600 font-medium" : ""}>
                  {currentPublicationDate ? formatDateWithYear(currentPublicationDate) : <span className="text-gray-400">—</span>}
                </span>
              </div>
            )}
            {/* Status (as pill) */}
            <label className="text-sm font-normal text-gray-400 self-center justify-self-start text-left" htmlFor="task-status">Status</label>
            {canEdit ? (
              <Select
                value={isLoading ? NONE_OPTION : (currentStatusId || NONE_OPTION)}
                onValueChange={isLoading ? undefined : (value) => handleStatusChange({ target: { value: value === NONE_OPTION ? '' : value } } as React.ChangeEvent<HTMLSelectElement>)}
              >
                <SelectTrigger className="h-10 min-h-10 w-full min-w-0 border-gray-200 rounded-md text-sm leading-none">
                  {currentStatusName ? (
                    <span
                      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium truncate max-w-full"
                      style={{
                        backgroundColor: currentStatusColor || '#e5e7eb',
                        color: currentStatusColor ? '#fff' : '#374151',
                      }}
                    >
                      {currentStatusName}
                    </span>
                  ) : (
                    <SelectValue placeholder={isEditFieldsLoading ? 'Loading...' : editFieldsError ? 'Error loading statuses' : 'Select status'} />
                  )}
                </SelectTrigger>
                <SelectContent className="w-[min(90vw,24rem)] max-w-full">
                  <SelectItem value={NONE_OPTION}>Select status</SelectItem>
                  {statusOptions.map((opt) => (
                    <SelectItem key={String(opt.value)} value={String(opt.value)}>
                      <span
                        className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: opt.color || '#e5e7eb',
                          color: opt.color ? '#fff' : '#374151',
                        }}
                      >
                        {opt.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="w-full h-10 px-3 py-2 rounded-md border border-gray-200 truncate text-sm font-normal text-gray-900 min-w-0" title={currentStatusName || ''}>
                {currentStatusName ? (
                  <span
                    className="inline-block px-3 py-1 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: currentStatusColor || '#e5e7eb',
                      color: currentStatusColor ? '#fff' : '#374151',
                    }}
                  >
                    {currentStatusName}
                  </span>
                ) : <span className="text-gray-400">—</span>}
              </div>
            )}
            {/* Content Type */}
            <label className="text-sm font-normal text-gray-400 self-center justify-self-start text-left" htmlFor="task-content-type">Content Type</label>
            {isSuggestionMode ? (
              hasMountedSuggestionControls ? (
                <Select
                  value={isLoading ? NONE_OPTION : (currentContentTypeId || NONE_OPTION)}
                  onValueChange={
                    isLoading || isApprovingSuggestion || isDismissingSuggestion
                      ? undefined
                      : (value) => handleContentTypeChange({ target: { value: value === NONE_OPTION ? '' : value } } as React.ChangeEvent<HTMLSelectElement>)
                  }
                >
                  <SelectTrigger className="h-10 min-h-10 w-full min-w-0 border-gray-200 rounded-md text-sm leading-none">
                    <SelectValue placeholder="Select content type" />
                  </SelectTrigger>
                  <SelectContent className="w-[min(90vw,24rem)] max-w-full">
                    <SelectItem value={NONE_OPTION}>Select content type</SelectItem>
                    {contentTypeOptions.map((opt) => (
                      <SelectItem key={String(opt.value)} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="h-10 min-h-10 w-full rounded-md border border-gray-200 bg-white" />
              )
            ) : canEdit ? (
              <Select
                value={isLoading ? NONE_OPTION : (currentContentTypeId || NONE_OPTION)}
                onValueChange={isLoading ? undefined : (value) => handleContentTypeChange({ target: { value: value === NONE_OPTION ? '' : value } } as React.ChangeEvent<HTMLSelectElement>)}
              >
                <SelectTrigger className="h-10 min-h-10 w-full min-w-0 border-gray-200 rounded-md text-sm leading-none">
                  <SelectValue placeholder="Select content type" />
                </SelectTrigger>
                <SelectContent className="w-[min(90vw,24rem)] max-w-full">
                  <SelectItem value={NONE_OPTION}>Select content type</SelectItem>
                  {contentTypeOptions.map((opt) => (
                    <SelectItem key={String(opt.value)} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="w-full h-10 px-3 py-2 rounded-md border border-gray-200 truncate text-sm font-normal text-gray-900 min-w-0" title={currentContentTypeTitle || ''}>
                {currentContentTypeTitle || <span className="text-gray-400">—</span>}
              </div>
            )}

            {/* Production Type */}
            <label className="text-sm font-normal text-gray-400 self-center justify-self-start text-left" htmlFor="task-production-type">Production Type</label>
            {isSuggestionMode ? (
              hasMountedSuggestionControls ? (
                <Select
                  value={currentProductionTypeId || NONE_OPTION}
                  onValueChange={
                    isLoading || isApprovingSuggestion || isDismissingSuggestion
                      ? undefined
                      : (value) => handleProductionTypeChange({ target: { value: value === NONE_OPTION ? '' : value } } as React.ChangeEvent<HTMLSelectElement>)
                  }
                >
                  <SelectTrigger className="h-10 min-h-10 w-full min-w-0 border-gray-200 rounded-md text-sm leading-none">
                    <SelectValue placeholder="Select production type" />
                  </SelectTrigger>
                  <SelectContent className="w-[min(90vw,24rem)] max-w-full">
                    <SelectItem value={NONE_OPTION}>Select production type</SelectItem>
                    {productionTypeOptions.map((opt) => (
                      <SelectItem key={String(opt.value)} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="h-10 min-h-10 w-full rounded-md border border-gray-200 bg-white" />
              )
            ) : canEdit ? (
              <Select
                value={currentProductionTypeId || NONE_OPTION}
                onValueChange={(value) => handleProductionTypeChange({ target: { value: value === NONE_OPTION ? '' : value } } as React.ChangeEvent<HTMLSelectElement>)}
              >
                <SelectTrigger className="h-10 min-h-10 w-full min-w-0 border-gray-200 rounded-md text-sm leading-none">
                  <SelectValue placeholder="Select production type" />
                </SelectTrigger>
                <SelectContent className="w-[min(90vw,24rem)] max-w-full">
                  <SelectItem value={NONE_OPTION}>Select production type</SelectItem>
                  {productionTypeOptions.map((opt) => (
                    <SelectItem key={String(opt.value)} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="w-full h-10 px-3 py-2 rounded-md border border-gray-200 truncate text-sm font-normal text-gray-900 min-w-0" title={currentProductionTypeTitle || ''}>
                {currentProductionTypeTitle || <span className="text-gray-400">—</span>}
              </div>
            )}
            {/* Language */}
            <label className="text-sm font-normal text-gray-400 self-center justify-self-start text-left" htmlFor="task-language">Language</label>
            {isSuggestionMode ? (
              hasMountedSuggestionControls ? (
                <Select
                  value={currentLanguageId || NONE_OPTION}
                  onValueChange={
                    isLoading || isApprovingSuggestion || isDismissingSuggestion
                      ? undefined
                      : (value) => handleLanguageChange({ target: { value: value === NONE_OPTION ? '' : value } } as React.ChangeEvent<HTMLSelectElement>)
                  }
                >
                  <SelectTrigger className="h-10 min-h-10 w-full min-w-0 border-gray-200 rounded-md text-sm leading-none">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent className="w-[min(90vw,24rem)] max-w-full">
                    <SelectItem value={NONE_OPTION}>Select language</SelectItem>
                    {languageOptions.map((opt) => (
                      <SelectItem key={String(opt.value)} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="h-10 min-h-10 w-full rounded-md border border-gray-200 bg-white" />
              )
            ) : canEdit ? (
              <Select
                value={currentLanguageId || NONE_OPTION}
                onValueChange={(value) => handleLanguageChange({ target: { value: value === NONE_OPTION ? '' : value } } as React.ChangeEvent<HTMLSelectElement>)}
              >
                <SelectTrigger className="h-10 min-h-10 w-full min-w-0 border-gray-200 rounded-md text-sm leading-none">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent className="w-[min(90vw,24rem)] max-w-full">
                  <SelectItem value={NONE_OPTION}>Select language</SelectItem>
                  {languageOptions.map((opt) => (
                    <SelectItem key={String(opt.value)} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="w-full h-10 px-3 py-2 rounded-md border border-gray-200 truncate text-sm font-normal text-gray-900 min-w-0" title={currentLanguageCode || ''}>
                {currentLanguageCode || <span className="text-gray-400">—</span>}
              </div>
            )}

            {showParentField && (
              <>
                <label className="text-sm font-normal text-gray-400 self-center justify-self-start text-left">Parent Task</label>
                <div className="w-full min-w-0 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <ParentTaskSelect
                      currentParentId={task.parent_task_id_int ? String(task.parent_task_id_int) : null}
                      onChange={(id, selectedTask) => handleParentChange(id ? [id] : [], selectedTask)}
                      disabledIds={[String(task.id)]}
                      projectId={String(task.project_id_int)}
                      parentTaskData={parentTaskData}
                    />
                  </div>
                  {task.parent_task_id_int && (
                    <button
                      type="button"
                      className="text-gray-400 hover:text-blue-600 transition-colors p-1 flex-shrink-0"
                      onClick={handleBackToParent}
                      title="Go to parent task"
                      aria-label="Go to parent task"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </>
            )}

            {/* Briefing (rich text) - last in overview; label above, value below */}
            <div className="col-span-2 space-y-1">
              <label className="text-sm font-normal text-gray-400 block text-left">Briefing</label>
              <div className="relative min-h-[120px] w-full min-w-0 overflow-hidden rounded-md border border-gray-200 bg-white">
                {isSuggestionMode && !hasMountedSuggestionBriefingEditor ? (
                  <div className="min-h-[120px] w-full bg-white" />
                ) : (
                  <RichTextEditor
                    value={briefing}
                    onChange={value => setBriefing(value)}
                    onFocus={
                      isSuggestionMode
                        ? undefined
                        : () =>
                            setTaskFieldContext({
                              fieldType: "briefing",
                              label: `${task?.title?.trim() || "Task"} - Briefing`,
                              entityId: task?.id ?? null,
                              instructions: typeof briefing === "string" ? briefing : null,
                            })
                    }
                    onBlur={
                      isSuggestionMode
                        ? undefined
                        : () => {
                            if (briefing !== task?.briefing) handleFieldChange('briefing', briefing);
                          }
                    }
                    readOnly={false}
                    toolbarId="ql-toolbar-rich-briefing"
                    toolbarVariant="compact"
                    toolbarVisibility={isSuggestionMode ? "hidden" : "always"}
                    showBubbleToolbar={!isSuggestionMode}
                    flatSurface
                    fontSize={COMPONENT_OUTPUT_FONT_SIZE_PX}
                    editorWrapperClassName={COMPONENT_OUTPUT_EDITOR_CLASS}
                    height={briefingEditorHeight}
                  />
                )}
                <div
                  onMouseDown={handleBriefingResizeMouseDown}
                  className="absolute bottom-0 right-0 z-10 flex h-5 w-5 cursor-nwse-resize items-center justify-center rounded-tl transition-colors hover:bg-gray-100"
                  style={{ cursor: 'nwse-resize' }}
                  title="Drag to resize"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-gray-400" aria-hidden>
                    <path d="M0 12 L12 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    <path d="M4 12 L12 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          {/* Subtasks section (full width, only once) */}
          {task && String(task.content_type_id) === '39' && (
            <div className="mt-6">
              <label className="text-sm font-normal text-gray-400 text-left mb-1 block">Subtasks</label>
              {subtasks.length === 0 ? (
                <div className="text-gray-400 text-sm">No subtasks</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {subtasks.map(st => {
                        const fullName = getSubtaskAssigneeName(st.assigned_user);
                        const { name: statusName, color: statusColor } = getSubtaskStatus(st.project_statuses);
                        return (
                          <tr key={st.id} className="group border-b last:border-b-0 hover:bg-gray-50 cursor-pointer" onClick={() => {
                            const p = mergePreserveParams(new URLSearchParams(searchParams.toString()));
                            p.set('id', String(st.id));
                            router.push(`${pathname}?${p.toString()}`, { scroll: false });
                          }}>
                            {/* Task name (truncated) */}
                            <td className="py-2 pl-2 pr-2 min-w-[120px]">
                              <span className="truncate font-medium max-w-[180px] block" title={st.title}>{st.title}</span>
                            </td>
                            {/* Status badge (vertically aligned) */}
                            <td className="py-2 px-2 text-left min-w-[90px]">
                              {statusName && (
                                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: statusColor || '#e5e7eb', color: statusColor ? '#fff' : '#374151' }} title={statusName}>
                                  {statusName}
                                </span>
                              )}
                            </td>
                            {/* Due date */}
                            <td className="py-2 px-2 text-xs text-right whitespace-nowrap min-w-[80px]">
                              <span className={st.is_overdue ? "text-red-600 font-medium" : "text-gray-500"}>
                                {st.delivery_date ? formatDateWithYear(st.delivery_date) : ''}
                              </span>
                            </td>
                            {/* Assignee initials */}
                            <td className="py-2 px-2 text-right">
                              {fullName && (
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full font-bold uppercase text-xs" style={{ background: '#E5E7EB', color: '#555' }} title={fullName}>
                                  {fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Add Subtask button, right-aligned below the table, ghost/underline style */}
              <div className="flex justify-end mt-1">
                <Button size="sm" variant="ghost" className="text-blue-600 hover:underline px-2 py-1 h-auto" onClick={() => {
                  const paramsStr = searchParams.toString();
                  const url = paramsStr ? `/tasks/${task.id}/add-subtask?${paramsStr}` : `/tasks/${task.id}/add-subtask`;
                  router.push(url);
                }}>
                  + Add Subtask
                </Button>
              </div>
            </div>
            )}
          </section>
          )}

          {activeTaskTab === "overview" && !isSuggestionMode && taskIdNum && commentsPanelProps ? (
            <TaskOverviewPreviews
              taskId={taskIdNum}
              projectId={task?.project_id_int || undefined}
              contentTypeId={task?.content_type_id ? Number(task.content_type_id) : undefined}
              languageId={task?.language_id ? Number(task.language_id) : undefined}
              taskTitle={task?.title || undefined}
              contentTypeTitle={task?.content_type_title || undefined}
              taskMetaTitle={task?.meta_title || undefined}
              taskMetaDescription={task?.meta_description || undefined}
              taskKeyword={task?.keyword || undefined}
              taskSlug={(task as any)?.slug || undefined}
              projectLogoUrl={projectLogoUrl}
              taskSourceUrls={(task as any)?.source_urls ?? null}
              taskBuildInstructions={taskBuildInstructions}
              canLoad={canLoadFollowups}
              bootstrapTaskChannels={(selectedTask as { task_channels?: unknown } | null)?.task_channels}
              bootstrapAttachments={displayAttachments}
              reviewData={selectedTask?.review_data}
              preferredChannelId={activeChannelId}
              onChannelChange={setActiveChannelId}
              onActiveFieldChange={setTaskFieldContext}
              onNavigateTab={setTaskTab}
              commentsPanelProps={commentsPanelProps}
              accessToken={accessToken}
              relatedIdeas={relatedIdeas}
              isRelatedIdeasLoading={isRelatedIdeasLoading || isRelatedIdeasFetching}
              isRelatedIdeasRefreshing={isRefreshingRelatedIdeas}
              ideaActionById={ideaActionById}
              contentTypeLabelById={contentTypeLabelById}
              onDismissRelatedIdea={(ideaId) => void handleSetRelatedIdeaStatus(ideaId, "dismissed")}
              onAcceptRelatedIdea={(idea) => handleAcceptRelatedIdea(idea as TaskRelatedIdeaRow)}
              onRefreshRelatedIdeas={() => void handleRefreshRelatedIdeas()}
            />
          ) : null}

          {/* Attachments section */}
          {!isSuggestionMode && activeTaskTab === "attachments" && (
          <section className="p-4 pb-0 min-h-0">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-base font-medium text-gray-900">Attachments</h3>
              {task && !isSuggestionMode && (
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  onClick={() => dropzoneRef.current?.openFilePicker()}
                  title="Add attachment"
                  aria-label="Add attachment"
                >
                  +
                </button>
              )}
            </div>
            {/* Key Visual Preview */}
            {keyVisualId && displayAttachments.length > 0 && displayAttachments.find(a => a.id === keyVisualId) && (
              <div className="mb-2">
                <div className="text-xs text-muted-foreground mb-1">Key Visual</div>
                <img
                  src={
                    attachmentsUpload.signedUrls[keyVisualId] ||
                    (displayAttachments.find((a) => a.id === keyVisualId) as { url?: string } | undefined)?.url ||
                    ''
                  }
                  alt="Key Visual"
                  className="max-w-xs rounded shadow"
                  style={{ maxHeight: '180px' }}
                />
              </div>
            )}
            {task && !isSuggestionMode && (
              <Dropzone
                ref={dropzoneRef}
                minimal
                tableName="tasks"
                recordId={task.id}
                bucketName="attachments"
                attachments={displayAttachments as any}
                signedUrls={attachmentsUpload.signedUrls}
                isUploading={attachmentsUpload.isUploading}
                uploadError={attachmentsUpload.uploadError}
                uploadFiles={attachmentsUpload.uploadFiles}
                deleteAttachment={attachmentsUpload.deleteAttachment}
                renderAttachmentActions={(attachment) => (
                  isImageOrVideo(attachment) ? (
                    <button
                      type="button"
                      className={`ml-2 text-xs px-1 py-0.5 rounded-full ${keyVisualId === attachment.id ? 'bg-yellow-400 text-white' : 'bg-gray-200 text-gray-700'} hover:bg-yellow-300`}
                      onClick={() => handleSetKeyVisual(attachment.id)}
                      title={keyVisualId === attachment.id ? 'This is the Key Visual' : 'Set as Key Visual'}
                      style={{ fontSize: '1rem', lineHeight: 1, verticalAlign: 'middle' }}
                    >
                      <span role="img" aria-label="Key Visual">★</span>
                    </button>
                  ) : null
                )}
              />
            )}
          </section>

          )}

          {!isSuggestionMode && activeTaskTab === "content" ? (
            <section className={cn("p-4 pb-0 min-h-0", isContentSectionExpanded && "min-h-full h-full flex flex-col pt-0")}>
                {/* Content Tab renders "Content" title + channel pills + rest */}
                {taskIdNum && canLoadFollowups && (
                  <div className={cn("min-h-0", isContentSectionExpanded && "flex-1 min-h-0")}>
                    <TaskContentTab
                      taskId={taskIdNum}
                      projectId={task?.project_id_int || undefined}
                      contentTypeId={task?.content_type_id ? Number(task.content_type_id) : undefined}
                      languageId={task?.language_id ? Number(task.language_id) : undefined}
                      taskTitle={task?.title || undefined}
                      contentTypeTitle={task?.content_type_title || undefined}
                      taskMetaTitle={task?.meta_title || undefined}
                      taskMetaDescription={task?.meta_description || undefined}
                      taskKeyword={task?.keyword || undefined}
                      taskSlug={(task as any)?.slug || undefined}
                      projectLogoUrl={projectLogoUrl}
                      taskSourceUrls={(task as any)?.source_urls ?? null}
                      canLoad={canLoadFollowups}
                      onChannelChange={setActiveChannelId}
                      onActiveFieldChange={setTaskFieldContext}
                      taskBuildInstructions={taskBuildInstructions}
                      isSectionExpanded={isContentSectionExpanded}
                      onToggleSectionExpand={() => setIsContentSectionExpanded((prev) => !prev)}
                      skipInitialTaskChannelsFetch={!!taskIdNum}
                      bootstrapTaskChannels={(selectedTask as { task_channels?: unknown } | null)?.task_channels}
                      accessToken={accessToken}
                      preferredChannelId={activeChannelId}
                    />
                  </div>
                )}
            </section>
          ) : null}

          {!isSuggestionMode && activeTaskTab === "artifacts" && taskIdNum ? (
            <section className="p-4 pb-0">
              <ArtifactWorkspace
                taskId={taskIdNum}
                defaultChannelId={activeChannelId}
                defaultLanguageId={task?.language_id ? Number(task.language_id) : null}
                projectId={task?.project_id_int ?? null}
              />
            </section>
          ) : null}

          {!isSuggestionMode && activeTaskTab === "reviews" && (
          <section className="p-4 pb-0">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-base font-medium text-gray-900">Reviews</h3>
                {selectedTask?.review_data?.review_count != null && (
                  <span className="text-sm text-gray-500">({selectedTask.review_data.review_count})</span>
                )}
                {taskIdNum && !isSuggestionMode && (
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    onClick={() => setIsAddingReview(true)}
                    title="Add review"
                    aria-label="Add review"
                  >
                    +
                  </button>
                )}
              </div>
              {activeTaskTab === "reviews" ? (
                <TaskReviewSummary 
                  reviewData={selectedTask?.review_data}
                  taskId={taskIdNum}
                  autoOpenAllReviews={activeTaskTab === "reviews"}
                  showAddForm={isAddingReview}
                  onCloseAddForm={() => setIsAddingReview(false)}
                  onReviewsChanged={() => {
                    queryClient.invalidateQueries({ queryKey: ['task', String(task?.id), accessToken] });
                  }}
                />
              ) : null}
          </section>
          )}

          {!isSuggestionMode && activeTaskTab === "activity" ? (
            <section
              className={cn("p-4 pb-0", isContentSectionExpanded && "hidden")}
            >
                <h3 className="text-base font-medium text-gray-900 mb-3">Activity</h3>
                {task ? (
                  <TaskActivityTimeline taskId={Number(task.id)} />
                ) : null}
            </section>
          ) : null}

          {!isSuggestionMode && activeTaskTab === "comments" && commentsPanelProps ? (
            <section className="flex min-h-0 flex-1 flex-col p-4 pb-0">
              <h3 className="mb-3 text-base font-medium text-gray-900">Comments</h3>
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <TaskCommentsListPart {...commentsPanelProps} focusOnly />
                </div>
                <div
                  ref={commentInputRef}
                  data-ai-field-type="comment_input"
                  data-ai-field-label="Comment"
                  onFocusCapture={() =>
                    setTaskFieldContext({
                      fieldType: "comment_input",
                      label: `${task?.title?.trim() || "Task"} - Comment`,
                      entityId: task?.id ?? null,
                      instructions: null,
                    })
                  }
                >
                  <TaskCommentsInputPart
                    {...commentsPanelProps}
                    onCommentAdded={() => {
                      void handleViewThreadHistory({ force: true })
                    }}
                  />
                </div>
                <TaskCommentsFooterPart {...commentsPanelProps} />
              </div>
            </section>
          ) : null}

        </div>

        {/* Suggestion actions pinned at the bottom */}
        {isSuggestionMode && suggestionStatus === 'pending' ? (
          <div className="sticky bottom-0 left-0 right-0 z-30 border-t bg-white p-3">
            <div className="flex w-full items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 flex-1"
                disabled={isApprovingSuggestion || isDismissingSuggestion}
                onClick={() => void handleDismissSuggestion()}
              >
                {isDismissingSuggestion ? 'Dismissing…' : 'Disapprove'}
              </Button>
              <Button
                type="button"
                className="h-9 flex-1"
                disabled={isApprovingSuggestion || isDismissingSuggestion}
                onClick={() => void handleApproveSuggestion()}
              >
                {isApprovingSuggestion ? 'Approving…' : 'Approve'}
              </Button>
            </div>
          </div>
        ) : null}
          </div>
        </section>
        </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogTitle>Delete Task</DialogTitle>
          <div className="py-2">Are you sure you want to delete this task? This cannot be undone.</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteTask} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      

      
    </div>
    </>
  )
} 