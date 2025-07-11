"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import { cn } from "@/lib/utils"
import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { Thread } from '../../types/task'
import { Button } from "../ui/button"
import { Trash2, Copy, Wand2, Upload, Image as ImageIcon, X, ChevronLeft, ChevronsLeft, Maximize2, Minimize2, ChevronRight, PanelRight } from "lucide-react"
import { RichTextEditor } from "../ui/rich-text-editor"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { ThreadedRealtimeChat } from "../threaded-realtime-chat"
import { getFilterOptions } from "../../lib/services/filters"
import dynamic from "next/dynamic"
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover"
import { Button as UIButton } from "../ui/button"
import { getUsersForProject } from '../../lib/services/users'
import { ThreadSwitcherPopover } from "../comments-section/thread-switcher-popover"
import { ThreadParticipantsInline } from "../comments-section/thread-participants-inline"
import { AddCommentInput } from "../comments-section/add-comment-input"
import { getTaskById } from '../../../lib/services/tasks'
import type { Task as BaseTask } from '../../lib/types/tasks'
import { updateItemInStore } from '../../../hooks/use-infinite-query'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { flushSync } from 'react-dom'
import { useFilterOptions } from '../../hooks/use-filter-options'
import { Dropzone } from '../dropzone'
import { useTaskAttachmentsUpload } from '../../hooks/use-task-attachments-upload'
import { AddTaskForm } from './AddTaskForm'
import { Dialog, DialogContent, DialogTitle, DialogTrigger, DialogFooter } from '../ui/dialog'
import { MultiSelect } from '../ui/multi-select'
import { toast } from '../ui/use-toast'
import { removeTaskFromAllStores, updateTaskInAllStores, updateTaskInCaches } from './task-cache-utils'
import { ShareButton } from '../ui/share-button'
import { useRouter, useSearchParams } from 'next/navigation';
import { ParentTaskSelect } from './ParentTaskSelect';
import debounce from 'lodash.debounce';

interface TaskDetailsProps {
  isCollapsed: boolean
  selectedTask: Task
  onClose: () => void
  onCollapse?: () => void
  isExpanded?: boolean
  onExpand?: () => void
  onRestore?: () => void
  onTaskUpdate?: (updatedFields: Partial<Task>) => void
  onAddSubtask?: (parentTaskId: number, projectId: number) => void
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
};

// Helper to attach abortSignal if available
function withAbortSignal(query: any, signal: AbortSignal) {
  if (query && typeof query.abortSignal === 'function') {
    return query.abortSignal(signal);
  }
  return query;
}

function PendingParticipantsRow({ participants, setParticipants, currentUserId, allProjectUsers }: {
  participants: any[]
  setParticipants: (p: any[]) => void
  currentUserId: number | null
  allProjectUsers: any[]
}) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [error, setError] = useState<string | null>(null)
  // Remove participant
  const handleRemove = (userId: string | number) => {
    setParticipants(participants.filter((u: any) => String(u.value) !== String(userId)))
  }
  // Add participant
  const handleAdd = (user: any) => {
    if (!participants.some((u: any) => String(u.value) === String(user.value))) {
      setParticipants([...participants, user])
    }
    setPopoverOpen(false)
    setSearch("")
  }
  // Filter users for add popover
  const filteredUsers = allProjectUsers.filter(
    (u: any) =>
      (u.label?.toLowerCase().includes(search.toLowerCase()) || u.value?.toString().includes(search)) &&
      !participants.some((p: any) => String(p.value) === String(u.value)) &&
      String(u.value) !== String(currentUserId)
  )
  return (
    <div className="flex items-center gap-1 px-2 pt-2">
      {participants.map((user: any) => (
        <div key={user.value} className="relative group flex flex-col items-center">
          <div
            className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold uppercase text-gray-900 border border-gray-300 shadow"
            title={user.label}
          >
            {user.label?.split(" ").map((n: string) => n[0]).join("").toUpperCase()}
          </div>
          {String(user.value) !== String(currentUserId) && (
            <button
              type="button"
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
              onClick={() => handleRemove(user.value)}
              title="Remove participant"
              aria-label="Remove participant"
            >×</button>
          )}
        </div>
      ))}
      {/* Add participant popover */}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            size="icon"
            variant="outline"
            className="w-7 h-7 rounded-full flex items-center justify-center text-xl border border-gray-300 text-gray-900 bg-white shadow"
            aria-label="Add participant"
            title="Add participant"
          >+
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2">
          <input
            type="text"
            className="w-full border rounded px-2 py-1 text-xs mb-2"
            placeholder="Search users..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div className="max-h-40 overflow-y-auto">
            {filteredUsers.length > 0 ? filteredUsers.slice(0, 8).map((u: any) => (
              <div
                key={u.value}
                className="flex items-center gap-2 px-2 py-1 hover:bg-accent cursor-pointer text-xs rounded"
                onClick={() => handleAdd(u)}
                title={`Add ${u.label}`}
              >
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold uppercase text-gray-900 border border-gray-300">
                  {u.label?.split(" ").map((n: string) => n[0]).join("").toUpperCase()}
                </div>
                <span>{u.label}</span>
              </div>
            )) : (
              <div className="text-xs text-muted-foreground px-2 py-1">No users found</div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {error && <div className="text-xs text-destructive mt-1">{error}</div>}
    </div>
  )
}

// Add a helper to normalize the fetched task
export function normalizeTask(apiTask: any): Task {
  return {
    ...apiTask,
    id: String(apiTask.id),
    assigned_to_id: apiTask.assigned_to_id != null ? String(apiTask.assigned_to_id) : '',
    project_id_int: apiTask.project_id_int != null ? Number(apiTask.project_id_int) : null, // Ensure number
    content_type_id: apiTask.content_type_id != null ? String(apiTask.content_type_id) : '',
    production_type_id: apiTask.production_type_id != null ? String(apiTask.production_type_id) : '',
    language_id: apiTask.language_id != null ? String(apiTask.language_id) : '',
    project_status_id: apiTask.project_status_id != null ? String(apiTask.project_status_id) : '',
    assigned_to_name: apiTask.assigned_to_name ?? null,
    project_name: apiTask.project_name ?? null,
    project_color: apiTask.project_color ?? null,
    project_status_name: apiTask.project_status_name ?? null,
    project_status_color: apiTask.project_status_color ?? null,
    content_type_title: apiTask.content_type_title ?? null,
    production_type_title: apiTask.production_type_title ?? null,
    language_code: apiTask.language_code ?? null,
    meta_title: apiTask.meta_title ?? apiTask.metaTitle ?? '',
    meta_description: apiTask.meta_description ?? apiTask.metaDescription ?? '',
    keyword: apiTask.keyword ?? apiTask.keywords ?? '',
    channel_names: Array.isArray(apiTask.channel_names) ? apiTask.channel_names : [],
    copy_post: apiTask.copy_post ?? null,
    briefing: apiTask.briefing ?? null,
    notes: apiTask.notes ?? null,
    key_visual_attachment_id: apiTask.key_visual_attachment_id ?? null,
  };
}

// Helper to update the joined/nested task in the ['tasks'] cache
function updateJoinedTaskInCache(queryClient: any, updatedTask: any) {
  queryClient.setQueryData(['tasks'], (old: any[] = []) =>
    Array.isArray(old)
      ? old.map((t: any) => {
          if (t.id !== updatedTask.id) return t;
          return {
            ...t,
            title: updatedTask.title !== undefined ? updatedTask.title : t.title,
            assigned_user: updatedTask.assigned_to_id
              ? { ...(t.assigned_user || {}), id: updatedTask.assigned_to_id, full_name: updatedTask.assigned_to_name }
              : t.assigned_user,
            content_type_title: updatedTask.content_type_title ?? t.content_type_title,
            production_type_title: updatedTask.production_type_title ?? t.production_type_title,
            language_code: updatedTask.language_code ?? t.language_code,
            project_statuses: updatedTask.project_status_id
              ? { ...(t.project_statuses || {}), id: updatedTask.project_status_id, name: updatedTask.project_status_name, color: updatedTask.project_status_color }
              : t.project_statuses,
            projects: updatedTask.project_id_int
              ? { ...(t.projects || {}), id: updatedTask.project_id_int, name: updatedTask.project_name, color: updatedTask.project_color }
              : t.projects,
            delivery_date: updatedTask.delivery_date ?? t.delivery_date,
            publication_date: updatedTask.publication_date ?? t.publication_date,
            updated_at: updatedTask.updated_at ?? t.updated_at,
            copy_post: updatedTask.copy_post ?? t.copy_post,
            briefing: updatedTask.briefing ?? t.briefing,
            notes: updatedTask.notes ?? t.notes,
            // Add more fields as needed
          };
        })
      : old
  );
}

export function TaskDetails({ isCollapsed, selectedTask, onClose, onCollapse, isExpanded = false, onExpand, onRestore, onTaskUpdate, onAddSubtask }: TaskDetailsProps) {
  const contextOnClose = onClose;
  const router = useRouter();
  const queryClient = useQueryClient();
  const supabase = createClientComponentClient(); // <-- Move here for all usages
  const searchParams = useSearchParams();
  // Guard: if selectedTask is null, show loading state
  if (!selectedTask) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <span className="text-gray-400">Loading...</span>
      </div>
    );
  }
  const [currentThreadId, setCurrentThreadId] = useState<number | null>(null)
  const [isEditingProject, setIsEditingProject] = useState(false)
  const [isEditingContentType, setIsEditingContentType] = useState(false)
  const [isEditingProductionType, setIsEditingProductionType] = useState(false)
  const [isEditingLanguage, setIsEditingLanguage] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Inline edit states
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isEditingStatus, setIsEditingStatus] = useState(false)
  const [isEditingDueDate, setIsEditingDueDate] = useState(false)
  const [isEditingMetaTitle, setIsEditingMetaTitle] = useState(false)
  const [isEditingMetaDescription, setIsEditingMetaDescription] = useState(false)
  const [isEditingKeyword, setIsEditingKeyword] = useState(false)

  // Add missing state for publication date inline edit
  const [isEditingPublicationDate, setIsEditingPublicationDate] = useState(false)

  const titleInputRef = useRef<HTMLTextAreaElement>(null)
  const metaTitleInputRef = useRef<HTMLInputElement>(null)
  const metaDescriptionInputRef = useRef<HTMLTextAreaElement>(null)
  const keywordInputRef = useRef<HTMLInputElement>(null)

  const [currentUserId, setCurrentUserId] = useState<number | null>(null)
  const [currentUserName, setCurrentUserName] = useState<string | null>(null)
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null)
  const [firstThreadId, setFirstThreadId] = useState<number | null>(null)
  const [threads, setThreads] = useState<Thread[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null)
  const [isCreatingThread, setIsCreatingThread] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  // Participants state for the selected thread
  const [participants, setParticipants] = useState<any[]>([])
  const [allProjectUsers, setAllProjectUsers] = useState<any[]>([])
  const [isParticipantsLoading, setIsParticipantsLoading] = useState(false)
  const [showAddPopover, setShowAddPopover] = useState(false)

  // ... existing code ...

  const [isEditingAssignee, setIsEditingAssignee] = useState(false)
  const [projectUsers, setProjectUsers] = useState<any[]>([])
  const [isProjectUsersLoading, setIsProjectUsersLoading] = useState(false)

  // Pending participants for new thread (if no threads exist)
  const [pendingParticipants, setPendingParticipants] = useState<any[]>([])
  useEffect(() => {
    // If there are no threads, fetch all project watchers (except current user)
    if (selectedTask && (!threads || threads.length === 0) && currentUserId && selectedTask.project_id_int) {
      getUsersForProject(String(selectedTask.project_id_int)).then(users => {
        // users: [{ value, label }]
        const filtered = users.filter(u => String(u.value) !== String(currentUserId))
        setPendingParticipants(filtered)
      })
    }
  }, [selectedTask, threads, currentUserId])

  // Fetch filter options only when details panel is open
  const { data: filterOptions, isLoading: isFilterOptionsLoading } = useFilterOptions();

  // Fetch current user id, name, and avatar
  useEffect(() => {
    const controller = new AbortController();
   
    async function fetchUserId() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user?.id) return;
      let query = supabase
        .from('users')
        .select('id, full_name, photo')
        .eq('auth_user_id', authData.user.id)
        .maybeSingle();
      query = withAbortSignal(query, controller.signal);
      const { data: userRow } = await query;
      if (userRow?.id) setCurrentUserId(userRow.id);
      if (userRow?.full_name) setCurrentUserName(userRow.full_name);
      if (userRow?.photo) setCurrentUserAvatar(userRow.photo);
    }
    fetchUserId();
    return () => {
      controller.abort();
    };
  }, []);

  // Fetch first thread for the task
  useEffect(() => {
    const controller = new AbortController();
    async function fetchFirstThread() {
      if (!selectedTask?.id) return;
      let query = supabase
        .from('threads')
        .select('id')
        .eq('task_id', selectedTask.id)
        .order('created_at', { ascending: true })
        .limit(1);
      query = withAbortSignal(query, controller.signal);
      const { data: threads } = await query;
      if (!controller.signal.aborted && threads && threads.length > 0) setFirstThreadId(threads[0].id);
      else if (!controller.signal.aborted) setFirstThreadId(null);
    }
    fetchFirstThread();
    return () => {
      controller.abort();
    };
  }, [selectedTask?.id]);

  // Fetch threads when task changes
  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;
    async function fetchThreads() {
      if (!selectedTask?.id) return;
      let query = supabase
        .from('threads')
        .select('id, title, created_at, task_id')
        .eq('task_id', selectedTask.id)
        .order('created_at', { ascending: true });
      query = withAbortSignal(query, controller.signal);
      const { data } = await query;
      if (isMounted && !controller.signal.aborted) {
        if (Array.isArray(data) && data.length > 0) {
          setThreads(data.map(thread => ({
            id: thread.id,
            title: thread.title,
            created_at: thread.created_at,
            task_id: thread.task_id
          })));
          setSelectedThreadId(data[0].id);
        } else {
          setThreads([]);
          setSelectedThreadId(null);
        }
      }
    }
    fetchThreads();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [selectedTask?.id]);

  // In the effect that sets selectedThreadId when threads change
  useEffect(() => {
    if (threads.length > 0) {
      if (!selectedThreadId || !threads.some(t => t.id === selectedThreadId)) {
        const firstThread = threads[0];
        if (typeof firstThread.id === 'number') {
          setSelectedThreadId(firstThread.id);
        }
      }
    } else {
      if (selectedThreadId !== null) setSelectedThreadId(null)
    }
  }, [threads, selectedThreadId])

  // Fetch participants for the selected thread - with debounce
  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;
    const fetchParticipants = async () => {
      if (!selectedThreadId) {
        setParticipants([]);
        return;
      }
      setIsParticipantsLoading(true);
      try {
        let query = supabase
          .from('thread_watchers')
          .select('id, watcher_id, users:watcher_id(id, full_name, email, photo)')
          .eq('thread_id', selectedThreadId);
        query = withAbortSignal(query, controller.signal);
        const { data, error } = await query;
        if (isMounted && !controller.signal.aborted && !error) {
          setParticipants(data || []);
        }
      } catch (err) {
        if (isMounted) console.error('Error fetching participants:', err);
      } finally {
        if (isMounted) {
          setIsParticipantsLoading(false);
        }
      }
    };
    const timeoutId = setTimeout(fetchParticipants, 100); // Debounce 100ms
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [selectedThreadId]);

  // Helper to fetch users for a given project and update projectUsers state
  const fetchProjectUsersForProject = async (projectId: string | number) => {
    const controller = new AbortController();
    let query = supabase
      .from('project_watchers')
      .select('user_id, users(id, full_name, email, photo)')
      .eq('project_id', projectId);
    query = withAbortSignal(query, controller.signal);
    const { data, error } = await query;
    const mappedUsers = (data || []).map(d => d.users).filter(Boolean);
    setProjectUsers(mappedUsers);
  };

  // Create a new thread
  const handleCreateThread = useCallback(async () => {
    const projectId = selectedTask?.project_id_int;
    if (!selectedTask?.id || !currentUserId || !projectId) return
    setIsCreatingThread(true)
    setChatError(null)
    try {
      const now = new Date().toISOString()
      // 1. Create the thread
      const { data: threadData, error: threadError } = await supabase
        .from('threads')
        .insert({ 
          task_id: selectedTask.id, 
          created_by: currentUserId,
          created_at: now,
          title: null 
        })
        .select('id, title, created_at, task_id')
        .single()
      if (threadError || !threadData) throw threadError || new Error('No data returned')

      // 2. Fetch all project watchers for the current project
      const { data: projectWatchers, error: watchersError } = await supabase
        .from('project_watchers')
        .select('user_id')
        .eq('project_id', projectId)
      if (watchersError) throw watchersError

      // 3. Prepare watcher inserts (exclude current user, handled by trigger)
      const watcherInserts = (projectWatchers || [])
        .filter((w: any) => Number(w.user_id) !== Number(currentUserId))
        .map((w: any) => ({
          thread_id: threadData.id,
          watcher_id: w.user_id,
          added_by: currentUserId,
        }))
      if (watcherInserts.length > 0) {
        const { error: insertError } = await supabase
          .from('thread_watchers')
          .insert(watcherInserts)
        if (insertError) throw insertError
      }

      // 4. Update threads state with properly typed data
      setThreads(prev => [...prev, threadData as Thread])
      setSelectedThreadId(threadData.id)
    } catch (err: any) {
      setChatError('Failed to create thread')
      console.error('Failed to create thread or add watchers:', err)
    } finally {
      setIsCreatingThread(false)
    }
  }, [selectedTask, currentUserId])

  // Fetch the task using React Query
  const { data: taskData, isLoading, error, refetch } = useQuery<Task | null>({
    queryKey: ['task', String(selectedTask?.id)],
    queryFn: ({ signal }) => {
      if (!selectedTask?.id) return null;
      return getTaskById({ signal, id: selectedTask.id.toString() }).then(normalizeTask);
    },
    enabled: !!selectedTask?.id,
    staleTime: 0,
    refetchOnMount: true,
  });

  // Explicitly refetch when selectedTask?.id changes
  useEffect(() => {
    if (selectedTask?.id) {
      refetch();
    }
  }, [selectedTask?.id, refetch]);

  const lastTaskIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (selectedTask?.id && selectedTask.id !== lastTaskIdRef.current) {
      const normalized = normalizeTask(selectedTask);
      lastTaskIdRef.current = selectedTask.id;
    }
  }, [selectedTask?.id]);

  // Use taskData from React Query as the main source of truth for the UI, always normalized to Task
  const task: Task | null = taskData
    ? normalizeTask(taskData)
    : selectedTask
      ? normalizeTask(selectedTask)
      : null;

  // Optimistic update logic
  const handleFieldChange = (field: keyof Task, value: any, extraFields: Partial<Task> = {}) => {
    if (!task) return;
    const prevTask = { ...task };
    const updatedTask = { ...task, [field]: value, ...extraFields };
   
    updateTaskInCaches(queryClient, updatedTask); // Patch both list and detail cache
  
    // Instantly update server (no debounce)
    const updateServer = async () => {
      try {
        // Only send the updated field(s), never undefined or client-only fields
        const updateObj: Record<string, any> = { [field]: value, ...extraFields };
        // Remove undefined fields
        Object.keys(updateObj).forEach(k => updateObj[k] === undefined && delete updateObj[k]);
        // Log the update object for debugging
        if (process.env.NODE_ENV === 'development') {
          console.log('[TaskDetails] Updating task', task.id, 'with', updateObj);
        }
        const { error } = await supabase
          .from('tasks')
          .update(updateObj)
          .eq('id', task.id);
        if (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[TaskDetails] Failed to update task', task.id, error);
          }
          updateTaskInCaches(queryClient, prevTask); // Rollback all caches
        } else {
          queryClient.invalidateQueries({ queryKey: ['task', task.id] });
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[TaskDetails] Exception updating task', task.id, error);
        }
        updateTaskInCaches(queryClient, prevTask); // Rollback all caches
      }
    };
    updateServer();
  };

  // Effect: update the infinite list cache after task changes
  useEffect(() => {
    if (task) {
      updateItemInStore('tasks', undefined, task)
    }
  }, [task])

  // Add participant
  const handleAddParticipant = async (userId: number) => {
    if (!selectedThreadId) return
    await supabase.from('thread_watchers').insert({ thread_id: selectedThreadId, watcher_id: userId, added_by: currentUserId })
    setShowAddPopover(false)
    // Refetch participants
    const { data } = await supabase
      .from('thread_watchers')
      .select('id, watcher_id, users:watcher_id(id, full_name, email, photo)')
      .eq('thread_id', selectedThreadId)
    setParticipants(data || [])
  }

  // Remove participant
  const handleRemoveParticipant = async (userId: number) => {
    if (!selectedThreadId) return
    await supabase.from('thread_watchers').delete().eq('thread_id', selectedThreadId).eq('watcher_id', userId)
    // Refetch participants
    const { data } = await supabase
      .from('thread_watchers')
      .select('id, watcher_id, users:watcher_id(id, full_name, email, photo)')
      .eq('thread_id', selectedThreadId)
    setParticipants(data || [])
  }

  // Delete thread
  const handleDeleteThread = async () => {
    if (!selectedThreadId) return
    if (!window.confirm("Are you sure you want to delete this thread? This cannot be undone.")) return
    await supabase.from('threads').delete().eq('id', selectedThreadId)
    // Refetch threads
    if (!task || !task.id) return;
    const { data } = await supabase
      .from('threads')
      .select('id, title, created_at, task_id')
      .eq('task_id', task.id)
      .order('created_at', { ascending: true })
    if (Array.isArray(data) && data.length > 0) {
      setThreads(data.map(thread => ({
        id: thread.id,
        title: thread.title,
        created_at: thread.created_at,
        task_id: thread.task_id
      })))
      setSelectedThreadId(data[0].id)
    } else {
      setThreads([])
      setSelectedThreadId(null)
    }
  }

  // Helper for initials
  function getInitials(name: string | undefined | null) {
    if (!name || typeof name !== 'string') return "?"
    const parts = name.trim().split(" ").filter(Boolean)
    if (parts.length === 0) return "?"
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  

  // Fetch project users when project changes
  useEffect(() => {
    if (!task || !task.project_id_int || isNaN(Number(task.project_id_int))) {
      return;
    }
    const controller = new AbortController();
    setIsProjectUsersLoading(true);
    
    let query = supabase
      .from('project_watchers')
      .select('user_id, users(id, full_name, email, photo)')
      .eq('project_id', task.project_id_int);
    query = withAbortSignal(query, controller.signal);
    
    query.then(({ data }: any) => {
      const flatUsers = Array.isArray(data)
        ? data.filter(Boolean).map((u: any) => ({
            id: u.users?.id != null ? String(u.users.id) : '',
            full_name: u.users?.full_name,
            email: u.users?.email || '',
          }))
        : [];
      setProjectUsers(flatUsers);
      setIsProjectUsersLoading(false);
    });
    return () => {
      controller.abort();
      
    };
  }, [task?.project_id_int]);

  // Fetch project users when entering assignee edit mode if not loaded or project changed
  const handleEditAssignee = () => {
    if (!task || !task.project_id_int || String(task.project_id_int) === 'unknown') return;
    getUsersForProject(String(task.project_id_int)).then(users => {
      const flatUsers = Array.isArray(users)
        ? users.filter(Boolean).map((u: any) => ({
            id: u.value != null ? String(u.value) : '',
            full_name: u.label,
            email: u.email || '',
          }))
        : [];
      setProjectUsers(flatUsers);
      setIsEditingAssignee(true);
    });
  };

 

  // Optimistic Project Change
  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const projectId = e.target.value;
    const projectOption = filterOptions?.projects?.find((opt: any) => String(opt.value) === projectId);
    const projectName = projectOption ? projectOption.label : null;
    // projectOption.color may not exist, so fallback to task.project_color
    const projectColor = (projectOption && 'color' in projectOption) ? (projectOption as any).color as string | null | undefined : (task ? task.project_color : null);
    // Patch both foreign key and denormalized fields, including project_color
    handleFieldChange('project_id_int', projectId || '', { project_name: projectName, project_color: projectColor });
    setIsEditingProject(false);
  };

  // Optimistic Assignee Change
  const handleAssigneeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    let selectedName = null;
    const selectedUser = projectUsers.find((u: any) => String(u.id) === selectedId);
    if (selectedUser) {
      selectedName = selectedUser.full_name;
    } else {
      const option = e.target.selectedOptions[0];
      selectedName = option ? option.textContent : null;
    }
    const assigneeId = selectedId === '' ? undefined : selectedId;
    setTimeout(() => setIsEditingAssignee(false), 0);
    handleFieldChange('assigned_to_id', assigneeId || '', { assigned_to_name: selectedName });
    if (onTaskUpdate) {
      onTaskUpdate({ assigned_to_id: assigneeId, assigned_to_name: selectedName });
    }
  };

  // Optimistic Content Type Change
  const handleContentTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const contentTypeId = e.target.value === '' ? undefined : e.target.value;
    const contentTypeOption = filterOptions?.contentTypes?.find((opt: any) => String(opt.value) === String(contentTypeId));
    const contentTypeTitle = contentTypeOption ? contentTypeOption.label : null;
    handleFieldChange('content_type_id', contentTypeId || '', { content_type_title: contentTypeTitle });
    setIsEditingContentType(false);
  };

  // Optimistic Production Type Change
  const handleProductionTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const productionTypeId = e.target.value === '' ? undefined : e.target.value;
    const productionTypeOption = filterOptions?.productionTypes?.find((opt: any) => String(opt.value) === String(productionTypeId));
    const productionTypeTitle = productionTypeOption ? productionTypeOption.label : null;
    handleFieldChange('production_type_id', productionTypeId || '', { production_type_title: productionTypeTitle });
    setIsEditingProductionType(false);
  };

  // Optimistic Language Change
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const languageId = e.target.value === '' ? undefined : e.target.value;
    const languageOption = filterOptions?.languages?.find((opt: any) => String(opt.value) === String(languageId));
    const languageCode = languageOption ? languageOption.label : null;
    handleFieldChange('language_id', languageId || '', { language_code: languageCode });
    setIsEditingLanguage(false);
  };

  // Optimistic Status Change
  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const statusId = e.target.value === '' ? undefined : e.target.value;
    const statusOption = filterOptions?.statuses?.find((opt: any) => String(opt.value) === String(statusId));
    const statusName = statusOption ? statusOption.label : null;
    const statusColor = statusOption ? statusOption.color : null;
    handleFieldChange('project_status_id', statusId || '', { project_status_name: statusName, project_status_color: statusColor });
    setIsEditingStatus(false);
  };

  const [allowedContentTypeIds, setAllowedContentTypeIds] = useState<number[] | null>(null);
  const [allowedProductionTypeIds, setAllowedProductionTypeIds] = useState<number[] | null>(null);
  const [allowedLanguageIds, setAllowedLanguageIds] = useState<number[] | null>(null);

  // Fetch allowed options for the selected assignee
  useEffect(() => {
    const fetchAllowedOptions = async () => {
      if (!task?.assigned_to_id) {
        setAllowedContentTypeIds(null);
        setAllowedProductionTypeIds(null);
        setAllowedLanguageIds(null);
        return;
      }
      const supabase = createClientComponentClient();
      const { data, error } = await supabase
        .from('costs')
        .select('content_type_id, production_type_id, language_id')
        .eq('user_id', task.assigned_to_id)
        .eq('is_deleted', false);
      if (error) {
        setAllowedContentTypeIds(null);
        setAllowedProductionTypeIds(null);
        setAllowedLanguageIds(null);
        return;
      }
      setAllowedContentTypeIds(
        Array.from(new Set(data.map((row: any) => row.content_type_id).filter(Boolean)))
      );
      setAllowedProductionTypeIds(
        Array.from(new Set(data.map((row: any) => row.production_type_id).filter(Boolean)))
      );
      setAllowedLanguageIds(
        Array.from(new Set(data.map((row: any) => row.language_id).filter(Boolean)))
      );
    };
    fetchAllowedOptions();
  }, [task?.assigned_to_id]);

  // Add state for editing channels
  const [isEditingChannels, setIsEditingChannels] = useState(false);
  const [optimisticChannels, setOptimisticChannels] = useState<string[]>(task?.channel_names || []);

  // Sync optimisticChannels with task.channel_names when task changes
  useEffect(() => {
    setOptimisticChannels(task?.channel_names || []);
  }, [task?.channel_names]);

  // Add channel to task
  const handleAddChannel = async (channelId: number, channelName: string) => {
    if (!task) return;
    // Optimistically add channel
    const newChannels = [...(task.channel_names || []), channelName];
    updateTaskInCaches(queryClient, { ...task, channel_names: newChannels });
    // Insert into task_channels
    await supabase.from('task_channels').insert({ task_id: task.id, channel_id: channelId });
  };
  // Remove channel from task
  const handleRemoveChannel = async (channelId: number, channelName: string) => {
    if (!task) return;
    // Optimistically remove channel
    const newChannels = (task.channel_names || []).filter(name => name !== channelName);
    updateTaskInCaches(queryClient, { ...task, channel_names: newChannels });
    // Delete from task_channels
    await supabase.from('task_channels').delete().eq('task_id', task.id).eq('channel_id', channelId);
  };

  // Add state for channel search
  const [channelSearch, setChannelSearch] = useState('');

  // Add this handler inside TaskDetails
  const handleOptimisticThreadCreated = (thread: { id: number | string, isOptimistic?: boolean }) => {
    if (thread.isOptimistic) {
      setThreads(prev => [
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
      setThreads(prev => prev.map(t =>
        t.isOptimistic ? { ...t, id: thread.id, isOptimistic: false } : t
      ));
      setSelectedThreadId(thread.id);
    } else if (thread.isOptimistic === false && typeof thread.id === 'string') {
      setThreads(prev => prev.filter(t => t.id !== thread.id));
      setSelectedThreadId(null);
    }
  };

  // Add global drag-and-drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const taskDetailsRef = useRef<HTMLDivElement>(null)
  const commentInputRef = useRef<HTMLDivElement>(null)

  // Use upload hook for global drag-and-drop and Dropzone
  const attachmentsUpload = useTaskAttachmentsUpload({
    tableName: 'tasks',
    recordId: selectedTask?.id ?? '',
    bucketName: 'attachments',
  });

  // Drag event handlers
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      // If dragging over comment input, ignore
      if (commentInputRef.current && commentInputRef.current.contains(e.target as Node)) return
      e.preventDefault()
      setIsDraggingOver(true)
    }
    const handleDragLeave = (e: DragEvent) => {
      if (commentInputRef.current && commentInputRef.current.contains(e.target as Node)) return
      setIsDraggingOver(false)
    }
    const handleDrop = async (e: DragEvent) => {
      if (commentInputRef.current && commentInputRef.current.contains(e.target as Node)) return
      e.preventDefault()
      setIsDraggingOver(false)
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0 && task) {
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
  }, [task])

  // Remove local subtasks state and useQuery for subtasks
  const { data: subtasks = [], isLoading: isSubtasksLoading } = useQuery({
    queryKey: ['subtasks', task?.id],
    queryFn: async ({ signal }) => {
      if (!task) return [];
      const supabase = createClientComponentClient();
      let query = supabase
        .from('tasks')
        .select(`id, title, content_type_id, delivery_date, publication_date, updated_at,
          assigned_user:users!fk_tasks_assigned_to_id(id,full_name),
          projects:projects!project_id_int(id,name,color),
          project_statuses:project_statuses!project_status_id(id,name,color),
          content_type_title, production_type_title, language_code, parent_task_id_int`)
        .eq('parent_task_id_int', task.id)
        .order('id', { ascending: true });
      query = withAbortSignal(query, signal);
    
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!task && String(task.content_type_id) === '39',
    staleTime: 10000,
  });

  // Add Back to Parent button if this is a subtask
  const handleBackToParent = async () => {
    if (!task) return;
    const supabase = createClientComponentClient()
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', task.parent_task_id_int)
      .single()
    if (!error && data && onTaskUpdate) {
      onTaskUpdate(data)
    }
  }

  // Handle parent change (fully optimistic)
  const handleParentChange = async (ids: string[], selectedTask?: Task) => {
    if (!task) return;
    const newParentId = ids[0] ? Number(ids[0]) : null;
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
  const showParentField = !!task && (task.parent_task_id_int || String(task.content_type_id) !== '39');

  // Add Subtask handler for regular tasks
  const handleAddSubtaskForRegular = () => {
    if (!task) return;
    router.push(`/tasks/${task.id}/add-subtask`);
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
  const handleDeleteTask = async () => {
    if (!task) return;
    setIsDeleteDialogOpen(false); // Close dialog immediately for better UX
    const t = task; // non-null assertion for linter
    // Remove from all InfiniteList caches immediately for true optimistic UI
    if (typeof t.id === 'number') {
      removeTaskFromAllStores(t.id)
    }
    setIsDeleting(true);
    // Always close details pane after delete (desktop and mobile)
    if (typeof onClose === 'function') onClose();
    try {
      // Optimistically update cache
      // Remove the task from the main list
      queryClient.setQueryData(['tasks'], (old: any) => {
        if (!old) return old;
        if (Array.isArray(old)) {
          return old.filter((x: any) => x.id !== t.id);
        }
        return old;
      });
      // If main task, promote all subtasks to regular tasks
      if (String(t.content_type_id) === '39') {
        queryClient.setQueryData(['tasks'], (old: any) => {
          if (!old) return old;
          if (Array.isArray(old)) {
            return old.map((x: any) => x.parent_task_id_int === t.id ? { ...x, parent_task_id_int: null } : x);
          }
          return old;
        });
        // Also update subtasks query cache for this main task
        queryClient.setQueryData(['subtasks', t.id], []);
      }
      // Backend: promote subtasks, then delete main task
      const supabase = createClientComponentClient();
      if (String(t.content_type_id) === '39') {
        await supabase.from('tasks').update({ parent_task_id_int: null }).eq('parent_task_id_int', t.id);
      }
      await supabase.from('tasks').delete().eq('id', t.id);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['subtasks'] });
    } catch (err: any) {
      toast({
        title: 'Failed to delete task',
        description: err?.message || 'An error occurred while deleting the task.',
        variant: 'destructive',
      });
      // Rollback: refetch tasks
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['subtasks'] });
    }
    setIsDeleting(false);
  }

  useEffect(() => {
    if (!isDeleteDialogOpen) {
      setIsDeleting(false);
    }
  }, [isDeleteDialogOpen, selectedTask]);

  

  if (isCollapsed) {
    return (
      <div className="h-full p-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-gray-500">Click to expand</p>
        </div>
      </div>
    )
  }

  if (!task) {
    return (
      <div className="h-full p-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-gray-500">Select a task to view details</p>
        </div>
      </div>
    )
  }


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

  // Fetch attachments using React Query (shared for all Dropzone instances)
  const { data: attachments = [], refetch: refetchAttachments } = useQuery({
    queryKey: ['attachments', selectedTask?.id],
    queryFn: async ({ signal }) => {
      if (!selectedTask?.id) return [];
      const supabase = createClientComponentClient();
      let query = supabase
        .from('attachments')
        .select('*')
        .eq('table_name', 'tasks')
        .eq('record_id', String(selectedTask.id))
        .order('uploaded_at', { ascending: false });
      // @ts-ignore
      if (typeof query.abortSignal === 'function') {
        query = query.abortSignal(signal);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedTask?.id,
    staleTime: 60000,
  });

  // Stable debounced field change for meta fields
  const debouncedFieldChangeRef = useRef(
    debounce((field: keyof Task, value: any) => {
      handleFieldChange(field, value);
    }, 500)
  );

  // Stable project_id_int for watchers query
  const projectIdRef = useRef(task?.project_id_int);
  useEffect(() => {
    if (task?.project_id_int !== projectIdRef.current) {
      projectIdRef.current = task?.project_id_int;
    }
  }, [task?.project_id_int]);

  const { data: projectWatchers = [] } = useQuery({
    queryKey: ['project_watchers', projectIdRef.current],
    queryFn: async ({ signal }) => {
      if (!projectIdRef.current) return [];
      const supabase = createClientComponentClient();
      let query = supabase
        .from('project_watchers')
        .select('user_id, users(id, full_name, email, photo)')
        .eq('project_id', projectIdRef.current);
      query = withAbortSignal(query, signal);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(d => d.users).filter(Boolean);
    },
    enabled: !!projectIdRef.current,
    staleTime: 60000,
  });

  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [isSeoOpen, setIsSeoOpen] = useState(false);

  // Add state for key visual attachment
  const [keyVisualId, setKeyVisualId] = useState<string | null>(task?.key_visual_attachment_id ?? null);

  // Sync keyVisualId with task when task changes
  useEffect(() => {
    setKeyVisualId(task?.key_visual_attachment_id ?? null);
  }, [task?.key_visual_attachment_id]);

  // Handler to set key visual
  const handleSetKeyVisual = async (attachmentId: string) => {
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

  // Local state for SEO fields
  const [metaTitle, setMetaTitle] = useState(task?.meta_title ?? '');
  const [metaDescription, setMetaDescription] = useState(task?.meta_description ?? '');
  const [keyword, setKeyword] = useState(task?.keyword ?? '');

  // Sync local state when task changes
  useEffect(() => {
    setMetaTitle(task?.meta_title ?? '');
    setMetaDescription(task?.meta_description ?? '');
    setKeyword(task?.keyword ?? '');
  }, [task?.meta_title, task?.meta_description, task?.keyword]);



  return (
    <div ref={taskDetailsRef} className="h-full flex flex-col relative">
      {/* Back to Parent button */}
      {task?.parent_task_id_int && (
        <div className="p-2 bg-gray-50 border-b flex items-center">
          <button
            className="text-sm text-blue-600 hover:underline flex items-center gap-1"
            onClick={handleBackToParent}
          >
            ← Back to Parent Task
          </button>
        </div>
      )}
      <div className="p-4 bg-white sticky top-0 z-10">
        {/* Action bar: left-aligned, expand/collapse right-aligned */}
        <div className="flex items-center mb-2">
          <div className="flex items-center gap-2 flex-1">
            {/* Folder tree icon for regular tasks (not main or subtask) */}
            {task && task.content_type_id !== '39' && !task.parent_task_id_int && (
              <button
                type="button"
                className="text-gray-500 hover:text-blue-600 focus:outline-none"
                onClick={handleAddSubtaskForRegular}
                title="Add Subtask"
                aria-label="Add Subtask"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <circle cx="6" cy="18" r="2" />
                  <circle cx="6" cy="6" r="2" />
                  <circle cx="18" cy="18" r="2" />
                  <path d="M6 8v8" />
                  <path d="M8 6h8a2 2 0 0 1 2 2v8" />
                </svg>
              </button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {/* Implement duplicate */}}
              title="Duplicate Task"
              aria-label="Duplicate Task"
            >
              <Copy className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsDeleteDialogOpen(true)}
              title="Delete Task"
              aria-label="Delete Task"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {/* Implement AI build */}}
              title="AI Build"
              aria-label="AI Build"
            >
              <Wand2 className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 flex-1 justify-end">
            {/* Collapse button */}
            {onCollapse && (
              <button
                className="inline-flex items-center justify-center w-7 h-7 text-gray-500 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-blue-400"
                aria-label="Collapse details pane"
                onClick={onCollapse}
                type="button"
              >
                <PanelRight className="w-5 h-5" />
              </button>
            )}
            {/* Expand/restore button */}
            {(onExpand || onRestore) && (
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
        {/* Always-editable task title */}
        <div>
          <label className="text-sm font-medium text-gray-400 self-start justify-self-start text-left sr-only" htmlFor="task-title">Title</label>
          <textarea
            ref={titleInputRef}
            id="task-title"
            value={task?.title ?? ''}
            onChange={(e) => handleFieldChange('title', e.target.value)}
            rows={1}
            className="w-full resize-none text-2xl font-semibold self-start bg-transparent focus:ring-0 outline-none border-none shadow-none p-0 mb-2"
            aria-label="Task title"
            style={{ minHeight: '2.5rem', overflow: 'hidden' }}
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = '2.5rem';
              el.style.height = el.scrollHeight + 'px';
            }}
          />
        </div>
      </div>
      {/* Main scrollable content */}
      <div className="flex-1 overflow-auto relative">
        <div className="p-4 pb-0">
          <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 items-start">
            {/* Project */}
            <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left" htmlFor="task-project">Project</label>
            {isEditingProject ? (
              <select
                id="task-project"
                value={String(task.project_id_int || '')}
                onChange={handleProjectChange}
                onBlur={() => setIsEditingProject(false)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
                disabled={isFilterOptionsLoading}
              >
                <option value="">Select project</option>
                {/* If the current value is not in the options, show it as a disabled option */}
                {filterOptions?.projects && !filterOptions.projects.some((opt: any) => String(opt.value) === String(task.project_id_int)) && task.project_id_int && (
                  <option value={String(task.project_id_int)} disabled>
                    {task.project_name || `Project #${task.project_id_int}`}
                  </option>
                )}
                {filterOptions?.projects
                  ?.filter((opt: any) => opt.active === undefined || opt.active === true)
                  .map((opt: any) => (
                    <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
                  ))}
              </select>
            ) : (
              <div
                className="w-full px-3 py-2 rounded-md cursor-pointer hover:bg-gray-50 truncate"
                tabIndex={0}
                onClick={() => setIsEditingProject(true)}
                onKeyDown={e => { if (e.key === 'Enter') setIsEditingProject(true) }}
                aria-label="Edit project"
                title={task.project_name || ''}
              >
                {task.project_name || <span className="text-gray-400">Click to set project</span>}
              </div>
            )}
            {/* Assigned to (with avatar) */}
            <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left" htmlFor="task-assignee">Assigned to</label>
            {isEditingAssignee ? (
              <select
                id="task-assignee"
                value={String(task.assigned_to_id || '')}
                onChange={handleAssigneeChange}
                onBlur={() => setIsEditingAssignee(false)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
                disabled={isProjectUsersLoading && projectUsers.length === 0}
              >
                <option value="">Select assignee</option>
                {isProjectUsersLoading && projectUsers.length === 0 && (
                  <option disabled>Loading users...</option>
                )}
                {/* Always include the current value as a disabled option if not present in projectUsers */}
                {task.assigned_to_id && !projectUsers.some((user: any) => String(user.id) === String(task.assigned_to_id)) && (
                  <option value={String(task.assigned_to_id)} disabled>
                    {task.assigned_to_name || `User #${task.assigned_to_id}`}
                  </option>
                )}
                {projectUsers.filter((user: any) => user && (user.full_name || user.email)).map((user: any) => (
                  <option key={String(user.id)} value={String(user.id)}>{user.full_name || user.email}</option>
                ))}
              </select>
            ) : (
              <div
                className="w-full px-3 py-2 rounded-md cursor-pointer hover:bg-gray-50 truncate flex items-center gap-2"
                tabIndex={0}
                onClick={handleEditAssignee}
                onKeyDown={e => { if (e.key === 'Enter') handleEditAssignee() }}
                aria-label="Edit assignee"
                title={task.assigned_to_name || ''}
              >
                {task.assigned_to_name ? (
                  <>
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted text-xs font-bold uppercase text-gray-900 border border-gray-300 mr-2">
                      {getInitials(task.assigned_to_name)}
                    </span>
                    <span>{task.assigned_to_name}</span>
                  </>
                ) : <span className="text-gray-400">Click to set assignee</span>}
              </div>
            )}
            {/* Due Date */}
            <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left" htmlFor="task-due-date">Due Date</label>
            {isEditingDueDate ? (
              <input
                id="task-due-date"
                type="date"
                value={task?.delivery_date ?? ''}
                onChange={(e) => handleFieldChange('delivery_date', e.target.value)}
                onBlur={() => setIsEditingDueDate(false)}
                onKeyDown={e => { if (e.key === 'Enter') setIsEditingDueDate(false) }}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
                autoFocus
              />
            ) : (
              <div
                className="w-full px-3 py-2 rounded-md cursor-pointer hover:bg-gray-50 truncate"
                tabIndex={0}
                onClick={() => setIsEditingDueDate(true)}
                onKeyDown={e => { if (e.key === 'Enter') setIsEditingDueDate(true) }}
                aria-label="Edit due date"
                title={task?.delivery_date ? new Date(task.delivery_date).toLocaleDateString() : ''}
              >
                {task?.delivery_date ? new Date(task.delivery_date).toLocaleDateString() : <span className="text-gray-400">Click to set due date</span>}
              </div>
            )}
            {/* Publication Date (as editable date) */}
            <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left" htmlFor="task-publication-date">Publication Date</label>
            {isEditingPublicationDate ? (
              <input
                id="task-publication-date"
                type="date"
                value={task?.publication_date ?? ''}
                onChange={(e) => handleFieldChange('publication_date', e.target.value)}
                onBlur={() => setIsEditingPublicationDate(false)}
                onKeyDown={e => { if (e.key === 'Enter') setIsEditingPublicationDate(false) }}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
                autoFocus
              />
            ) : (
              <div
                className="w-full px-3 py-2 rounded-md cursor-pointer hover:bg-gray-50 truncate"
                tabIndex={0}
                onClick={() => setIsEditingPublicationDate(true)}
                onKeyDown={e => { if (e.key === 'Enter') setIsEditingPublicationDate(true) }}
                aria-label="Edit publication date"
                title={task?.publication_date ? new Date(task.publication_date).toLocaleDateString() : ''}
              >
                {task?.publication_date ? new Date(task.publication_date).toLocaleDateString() : <span className="text-gray-400">Click to set publication date</span>}
              </div>
            )}
            {/* Status (as pill) */}
            <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left" htmlFor="task-status">Status</label>
            {isEditingStatus ? (
              <select
                id="task-status"
                value={task.project_status_id || ''}
                onChange={handleStatusChange}
                onBlur={() => setIsEditingStatus(false)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                <option value="">Select status</option>
                {filterOptions?.statuses
                  ?.filter((opt: any) =>
                    task.project_id_int != null &&
                    Number(opt.project_id) === Number(task.project_id_int)
                  )
                  .map((opt: any) => (
                    <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
                  ))}
              </select>
            ) : (
              <div
                className="w-full px-3 py-2 rounded-md cursor-pointer hover:bg-gray-50 truncate"
                tabIndex={0}
                onClick={() => setIsEditingStatus(true)}
                onKeyDown={e => { if (e.key === 'Enter') setIsEditingStatus(true) }}
                aria-label="Edit status"
                title={task?.project_status_name || ''}
              >
                {task?.project_status_name ? (
                  <span
                    className="inline-block px-3 py-1 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: task.project_status_color || '#e5e7eb',
                      color: task.project_status_color ? '#fff' : '#374151',
                    }}
                  >
                    {task.project_status_name}
                  </span>
                ) : <span className="text-gray-400">Click to set status</span>}
              </div>
            )}
            {/* Content Type */}
            <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left" htmlFor="task-content-type">Content Type</label>
            {isEditingContentType ? (
              <select
                id="task-content-type"
                value={String(task.content_type_id || '')}
                onChange={handleContentTypeChange}
                onBlur={() => setIsEditingContentType(false)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                <option value="">Select content type</option>
                {filterOptions?.contentTypes
                  ?.filter((opt: any) => !allowedContentTypeIds || allowedContentTypeIds.includes(Number(opt.value)))
                  .map((opt: any) => (
                  <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <div
                className="w-full px-3 py-2 rounded-md cursor-pointer hover:bg-gray-50 truncate"
                tabIndex={0}
                onClick={() => setIsEditingContentType(true)}
                onKeyDown={e => { if (e.key === 'Enter') setIsEditingContentType(true) }}
                aria-label="Edit content type"
                title={task.content_type_title || ''}
              >
                {task.content_type_title || <span className="text-gray-400">Click to set content type</span>}
              </div>
            )}
            {/* Production Type */}
            <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left" htmlFor="task-production-type">Production Type</label>
            {isEditingProductionType ? (
              <select
                id="task-production-type"
                value={String(task.production_type_id || '')}
                onChange={handleProductionTypeChange}
                onBlur={() => setIsEditingProductionType(false)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                <option value="">Select production type</option>
                {filterOptions?.productionTypes
                  ?.filter((opt: any) => !allowedProductionTypeIds || allowedProductionTypeIds.includes(Number(opt.value)))
                  .map((opt: any) => (
                  <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <div
                className="w-full px-3 py-2 rounded-md cursor-pointer hover:bg-gray-50 truncate"
                tabIndex={0}
                onClick={() => setIsEditingProductionType(true)}
                onKeyDown={e => { if (e.key === 'Enter') setIsEditingProductionType(true) }}
                aria-label="Edit production type"
                title={task.production_type_title || ''}
              >
                {task.production_type_title || <span className="text-gray-400">Click to set production type</span>}
              </div>
            )}
            {/* Language */}
            <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left" htmlFor="task-language">Language</label>
            {isEditingLanguage ? (
              <select
                id="task-language"
                value={String(task.language_id || '')}
                onChange={handleLanguageChange}
                onBlur={() => setIsEditingLanguage(false)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                <option value="">Select language</option>
                {filterOptions?.languages
                  ?.filter((opt: any) => !allowedLanguageIds || allowedLanguageIds.includes(Number(opt.value)))
                  .map((opt: any) => (
                  <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <div
                className="w-full px-3 py-2 rounded-md cursor-pointer hover:bg-gray-50 truncate"
                tabIndex={0}
                onClick={() => setIsEditingLanguage(true)}
                onKeyDown={e => { if (e.key === 'Enter') setIsEditingLanguage(true) }}
                aria-label="Edit language"
                title={task.language_code || ''}
              >
                {task.language_code || <span className="text-gray-400">Click to set language</span>}
              </div>
            )}
            {/* Channels (editable pill UI) */}
            <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left">Channels</label>
            <div className="w-full flex flex-wrap gap-2 min-h-[40px] items-center overflow-x-auto">
              {optimisticChannels.length > 0 ? (
                optimisticChannels.map((channel, idx) => {
                  // Find channel id by name
                  const channelObj = filterOptions?.channels?.find((c: any) => c.label === channel);
                  return (
                    <span key={channel} className="inline-flex items-center bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mr-1 mb-1 truncate max-w-[120px]">
                    {channel}
                      {channelObj && (
                        <button
                          type="button"
                          className="ml-1 text-blue-800 hover:text-red-600 focus:outline-none"
                          onClick={() => handleRemoveChannel(Number(channelObj.value), channel)}
                          aria-label="Remove channel"
                        >×</button>
                      )}
                  </span>
                  );
                })
              ) : (
                <span className="text-gray-400 ml-0">No channels</span>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="icon" variant="outline" className="w-7 h-7 rounded-full flex items-center justify-center text-xl border border-gray-300 text-gray-900 bg-white shadow" aria-label="Add channel" title="Add channel">+</Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2">
                  <input
                    type="text"
                    className="w-full border rounded px-2 py-1 text-xs mb-2"
                    placeholder="Search channels..."
                    onChange={e => setChannelSearch(e.target.value)}
                    value={channelSearch}
                    autoFocus
                  />
                  <div className="max-h-40 overflow-y-auto">
                    {filterOptions?.channels
                      ?.filter((c: any) => c.label.toLowerCase().includes(channelSearch.toLowerCase()) && !optimisticChannels.includes(c.label))
                      .slice(0, 8)
                      .map((c: any) => (
                        <div
                          key={c.value}
                          className="flex items-center gap-2 px-2 py-1 hover:bg-accent cursor-pointer text-xs rounded"
                          onClick={() => handleAddChannel(Number(c.value), c.label)}
                          title={`Add ${c.label}`}
                        >
                          <span>{c.label}</span>
                        </div>
                      ))}
                    {filterOptions?.channels && filterOptions.channels.filter((c: any) => c.label.toLowerCase().includes(channelSearch.toLowerCase()) && !optimisticChannels.includes(c.label)).length === 0 && (
                      <div className="text-xs text-muted-foreground px-2 py-1">No channels found</div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            {showParentField && (
              <>
                <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left">Parent Task</label>
                <div className="w-full">
                  <ParentTaskSelect
                    currentParentId={task.parent_task_id_int ? String(task.parent_task_id_int) : null}
                    onChange={(id, selectedTask) => handleParentChange(id ? [id] : [], selectedTask)}
                    disabledIds={[String(task.id)]}
                    projectId={String(task.project_id_int)}
                  />
                </div>
              </>
            )}
          </div>
          {/* Subtasks section (full width, only once) */}
          {task && String(task.content_type_id) === '39' && (
            <div className="mt-6">
              <label className="text-sm font-medium text-gray-400 text-left mb-1 block">Subtasks</label>
              {isSubtasksLoading ? (
                <div className="text-gray-400 text-sm">Loading subtasks...</div>
              ) : subtasks.length === 0 ? (
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
                            const paramsStr = searchParams.toString();
                            const url = paramsStr ? `/tasks/${st.id}?${paramsStr}` : `/tasks/${st.id}`;
                            router.push(url);
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
                            <td className="py-2 px-2 text-xs text-gray-500 text-right whitespace-nowrap min-w-[80px]">{st.delivery_date ? new Date(st.delivery_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</td>
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
          {/* Attachments section (full width) */}
          <div className="mt-6">
            <label className="text-sm font-medium text-gray-400 text-left mb-1 block">Attachments</label>
            {/* Key Visual Preview */}
            {keyVisualId && attachmentsUpload.attachments.length > 0 && attachmentsUpload.signedUrls[keyVisualId] && (
              <div className="mb-2">
                <div className="text-xs text-muted-foreground mb-1">Key Visual</div>
                <img
                  src={attachmentsUpload.signedUrls[keyVisualId]}
                  alt="Key Visual"
                  className="max-w-xs rounded shadow"
                  style={{ maxHeight: '180px' }}
                />
              </div>
            )}
            {task && (
              <Dropzone
                tableName="tasks"
                recordId={task.id}
                bucketName="attachments"
                attachments={attachmentsUpload.attachments}
                signedUrls={attachmentsUpload.signedUrls}
                isUploading={attachmentsUpload.isUploading}
                uploadError={attachmentsUpload.uploadError}
                uploadFiles={attachmentsUpload.uploadFiles}
                deleteAttachment={attachmentsUpload.deleteAttachment}
                onChange={() => refetchAttachments()}
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
          </div>
          {/* Copy Post section (rich text, always editable) */}
          <div className="mt-6">
            <label className="text-sm font-medium text-gray-400 text-left mb-1 block">Copy Post</label>
            <RichTextEditor
              value={task?.copy_post ?? ''}
              onChange={(value) => handleFieldChange('copy_post', value)}
              readOnly={false}
              toolbarId="ql-toolbar-rich-copy-post"
            />
          </div>
          {/* Briefing section (rich text, always editable) */}
          <div className="mt-6">
            <label className="text-sm font-medium text-gray-400 text-left mb-1 block">Briefing</label>
            <RichTextEditor
              value={task?.briefing ?? ''}
              onChange={(value) => handleFieldChange('briefing', value)}
              readOnly={false}
              toolbarId="ql-toolbar-rich-briefing"
            />
          </div>
          {/* Notes section (rich text, always editable) */}
          <div className="mt-6">
            <label className="text-sm font-medium text-gray-400 text-left mb-1 block">Notes</label>
            <RichTextEditor
              value={task?.notes ?? ''}
              onChange={(value) => handleFieldChange('notes', value)}
              readOnly={false}
              toolbarId="ql-toolbar-rich-notes"
            />
          </div>
          {/* SEO section (collapsible) */}
          <div className="mt-6">
            <button
              className="flex items-center w-full text-left text-sm font-medium text-gray-400 mb-1 focus:outline-none"
              onClick={() => setIsSeoOpen((open) => !open)}
              aria-expanded={isSeoOpen}
              aria-controls="seo-panel"
              type="button"
            >
              <ChevronRight className={`transition-transform mr-2 ${isSeoOpen ? 'rotate-90' : ''}`} />
              SEO
            </button>
            {isSeoOpen && (
              <div id="seo-panel">
                <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 items-start">
                  {/* Meta Title */}
                  <label className="text-sm font-medium text-gray-400 self-start justify-self-start text-left" htmlFor="task-meta-title">Meta Title</label>
                  <input
                    ref={metaTitleInputRef}
                    id="task-meta-title"
                    type="text"
                    value={metaTitle}
                    onChange={e => setMetaTitle(e.target.value)}
                    onBlur={() => handleFieldChange('meta_title', metaTitle)}
                    onKeyDown={e => { if (e.key === 'Enter') { handleFieldChange('meta_title', metaTitle); setIsEditingMetaTitle(false); } }}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                  {/* Meta Description */}
                  <label className="text-sm font-medium text-gray-400 self-start justify-self-start text-left" htmlFor="task-meta-description">Meta Description</label>
                  <textarea
                    ref={metaDescriptionInputRef}
                    id="task-meta-description"
                    value={metaDescription}
                    onChange={e => setMetaDescription(e.target.value)}
                    onBlur={() => handleFieldChange('meta_description', metaDescription)}
                    onKeyDown={e => { if (e.key === 'Enter') { handleFieldChange('meta_description', metaDescription); setIsEditingMetaDescription(false); } }}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200 max-h-32 overflow-y-auto"
                    rows={3}
                  />
                  {/* Keywords */}
                  <label className="text-sm font-medium text-gray-400 self-start justify-self-start text-left" htmlFor="task-keyword">Keywords</label>
                  <input
                    ref={keywordInputRef}
                    id="task-keyword"
                    type="text"
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    onBlur={() => handleFieldChange('keyword', keyword)}
                    onKeyDown={e => { if (e.key === 'Enter') { handleFieldChange('keyword', keyword); setIsEditingKeyword(false); } }}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                </div>
              </div>
            )}
          </div>
          {/* Activity section (collapsible) */}
          <div className="mt-6">
            <button
              className="flex items-center w-full text-left text-sm font-medium text-gray-400 mb-1 focus:outline-none"
              onClick={() => setIsActivityOpen((open) => !open)}
              aria-expanded={isActivityOpen}
              aria-controls="activity-panel"
              type="button"
            >
              <ChevronRight className={`transition-transform mr-2 ${isActivityOpen ? 'rotate-90' : ''}`} />
              Activity
            </button>
            {isActivityOpen && (
              <div id="activity-panel">
                <TaskActivityTimeline taskId={Number(task.id)} />
              </div>
            )}
          </div>
          {/* Chat history (now flows with the rest of the content) */}
          <div className="mt-6">
            <label className="text-sm font-medium text-gray-400 text-left mb-1 block">Comments</label>
            {typeof selectedThreadId === 'number' && currentUserId != null ? (
              <ThreadedRealtimeChat
                key={String(selectedThreadId)}
                threadId={selectedThreadId}
                currentUserId={currentUserId}
                currentUserName={currentUserName || undefined}
                currentUserAvatar={currentUserAvatar || undefined}
                hideInput={true}
              />
            ) : (
              threads.length === 0
                ? <div className="p-4 text-muted-foreground">No thread or user found for this task.</div>
                : <div className="p-4 text-muted-foreground">Creating thread...</div>
            )}
          </div>
        </div>
        {/* Chat input sticky at the bottom */}
        {task && (
          <div className="sticky bottom-0 left-0 right-0 bg-white border-t z-30 flex flex-col" style={{ boxShadow: '0 -2px 8px rgba(0,0,0,0.03)' }}>
            {/* Pending participant row if no threads */}
            {threads.length === 0 && pendingParticipants.length > 0 && (
              <PendingParticipantsRow
                participants={pendingParticipants}
                setParticipants={setPendingParticipants}
                currentUserId={currentUserId}
                allProjectUsers={projectUsers}
              />
            )}
            {/* Chat input only (sticky) */}
            <AddCommentInput
              taskId={Number(task.id)}
              threadId={typeof selectedThreadId === 'number' ? selectedThreadId : null}
              onCommentAdded={() => {}}
              onThreadCreated={handleOptimisticThreadCreated}
              pendingParticipants={threads.length === 0 ? pendingParticipants || [] : []}
              setPendingParticipants={threads.length === 0 ? setPendingParticipants : undefined}
              currentUserId={currentUserId}
            />
            {/* Thread selector, participants, new thread (compact row) */}
            <div className="border-t bg-white px-2 py-1 flex items-center gap-2">
              <ThreadSwitcherPopover
                taskId={Number(task.id)}
                threads={threads}
                activeThreadId={selectedThreadId}
                onSelectThread={setSelectedThreadId}
              />
              {typeof selectedThreadId === 'number' && (
                <div className="flex-1 overflow-hidden">
                  <ThreadParticipantsInline 
                    threadId={selectedThreadId} 
                    projectId={Number(task.project_id_int)}
                    allowRemove={true}
                    key={selectedThreadId}
                  />
                </div>
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="ml-1 shrink-0"
                onClick={handleCreateThread}
                disabled={isCreatingThread}
                aria-label="Add new thread"
                title="Add new thread"
              >
                +
              </Button>
              {selectedThreadId && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="ml-1 shrink-0"
                  onClick={async () => {
                    if (!window.confirm("Are you sure you want to delete this thread? This cannot be undone.")) return;
                    await supabase.from('threads').delete().eq('id', selectedThreadId);
                    // Refetch threads and update selectedThreadId
                    const { data } = await supabase
                      .from('threads')
                      .select('id, title, created_at, task_id')
                      .eq('task_id', task.id)
                      .order('created_at', { ascending: true });
                    if (Array.isArray(data) && data.length > 0) {
                      setThreads(data.map(thread => ({
                        id: thread.id,
                        title: thread.title,
                        created_at: thread.created_at,
                        task_id: thread.task_id
                      })));
                      setSelectedThreadId(data[0].id);
                    } else {
                      setThreads([]);
                      setSelectedThreadId(null);
                    }
                  }}
                  aria-label="Delete thread"
                  title="Delete thread"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        )}
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
  )
} 