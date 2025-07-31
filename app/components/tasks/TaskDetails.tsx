"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import { cn } from "@/lib/utils"
import { useEffect, useState, useRef, useCallback, useMemo, Dispatch, SetStateAction } from "react"
import { Thread } from '../../types/task'
import { Button } from "../ui/button"
import { Trash2, Copy, Wand2, Upload, Image as ImageIcon, X, ChevronLeft, ChevronsLeft, Maximize2, Minimize2, ChevronRight, PanelRight, ExternalLink } from "lucide-react"
import { RichTextEditor } from "../ui/rich-text-editor"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { ThreadedRealtimeChat } from "../threaded-realtime-chat"
import { getFilterOptions } from "../../lib/services/filters"
import dynamic from "next/dynamic"
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover"
import { Button as UIButton } from "../ui/button"
// import { getUsersForProject } from '../../lib/services/users'
import { ThreadSwitcherPopover } from "../comments-section/thread-switcher-popover"
import { ThreadParticipantsInline } from "../comments-section/thread-participants-inline"
import { AddCommentInput } from "../comments-section/add-comment-input"
import { getTaskById } from '../../../lib/services/tasks'
import type { Task as BaseTask } from '../../lib/types/tasks'
import { updateItemInStore } from '../../../hooks/use-infinite-query'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { flushSync } from 'react-dom'
import { Dropzone } from '../dropzone'
import { useTaskAttachmentsUpload } from '../../hooks/use-task-attachments-upload'
import { AddTaskForm } from './AddTaskForm'
import { Dialog, DialogContent, DialogTitle, DialogTrigger, DialogFooter } from '../ui/dialog'
import { MultiSelect } from '../ui/multi-select'
import { toast } from '../ui/use-toast'
import { removeTaskFromAllStores, updateTaskInAllStores, updateTaskInCaches, normalizeTask } from './task-cache-utils'
import { ShareButton } from '../ui/share-button'
import { useRouter, useSearchParams } from 'next/navigation';
import { ParentTaskSelect } from './ParentTaskSelect';
import debounce from 'lodash.debounce';
import { StickyAddCommentInput } from "../comments-section/sticky-add-comment-input"
import { useTaskEditFields } from '../../hooks/use-task-edit-fields';
import { useTypesenseInfiniteQuery } from '../../hooks/use-typesense-infinite-query';
import { getTypesenseUpdater } from '../../store/typesense-tasks';
import { useMobileDetection } from '../../hooks/use-mobile-detection';

interface TaskDetailsProps {
  isCollapsed: boolean
  selectedTask: Task & {
    threads?: any[];
    mentions?: any[];
    thread_watchers?: any[];
  };
  onClose: () => void
  onCollapse?: () => void
  isExpanded?: boolean
  onExpand?: () => void
  onRestore?: () => void
  onTaskUpdate?: (updatedFields: Partial<Task>) => void
  onAddSubtask?: (parentTaskId: number, projectId: number) => void
  attachments?: any[]
  threadId?: number | null
  mentions?: any[]
  watchers?: any[]
  currentUser?: any
  subtasks?: any[]
  project_watchers?: any[]
  accessToken?: string | null
  onOptimisticUpdate?: (task: any) => void;
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

export function TaskDetails({ isCollapsed, selectedTask, onClose, onCollapse, isExpanded = false, onExpand, onRestore, onTaskUpdate, onAddSubtask, attachments = [], threadId, mentions, watchers, currentUser, subtasks = [], project_watchers, accessToken, onOptimisticUpdate }: TaskDetailsProps) {
  const isMobile = useMobileDetection();
  
  console.log('TaskDetails props:', { selectedTask, attachments });
  console.log('DEBUG: selectedTask', selectedTask);
  console.log('DEBUG: selectedTask keys', selectedTask ? Object.keys(selectedTask) : null);
  console.log('DEBUG: selectedTask.thread_id', (selectedTask as any)?.thread_id);

  // Do not return early if !selectedTask. Always render the component and call all hooks unconditionally.

  // Always render the static UI. Use isLoading to control value rendering.
  const isLoading = !selectedTask;
  const task = selectedTask ? normalizeTask(selectedTask) : undefined;
  console.log('TaskDetails task:', task);

  const taskIdNum = task ? (typeof task.id === 'number' ? task.id : Number(task.id)) : undefined;
  const contextOnClose = onClose;
  const router = useRouter();
  const queryClient = useQueryClient();
  const supabase = createClientComponentClient(); // <-- Move here for all usages
  const searchParams = useSearchParams();
  // Guard: if selectedTask is null, show loading state

  // Use threads, mentions, and thread_watchers from props (Edge Function response)
  // Map the Edge Function response to the UI structure for the first thread
  const firstThreadId = selectedTask ? (selectedTask as any)['thread_id'] : undefined;
  const firstThreadMentions = selectedTask && Array.isArray(selectedTask.mentions) ? selectedTask.mentions : [];
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

  // Set selectedThreadId as soon as selectedTask.thread_id is available
  useEffect(() => {
    if ((selectedTask as any)?.thread_id) {
      setSelectedThreadId((selectedTask as any).thread_id);
    }
  }, [(selectedTask as any)?.thread_id]);
  
  // Add useEffect to reset all thread-related state when task changes
  useEffect(() => {
    if (!selectedTask) return;
    
    // Reset thread-related state when task changes
    const taskThreadId = (selectedTask as any)?.thread_id;
    
    // Reset pending participants state
    setPendingParticipants([]);
    setRemovedParticipants([]);
    setIsAddingThread(false);
    
    if (taskThreadId) {
      // Task has an existing thread - initialize threadsList with that thread
      setSelectedThreadId(taskThreadId);
      // Create a minimal thread object for the threadsList
      const firstThread = {
        id: taskThreadId,
        title: 'Thread',
        created_at: new Date().toISOString(),
        thread_watchers: Array.isArray(watchers) ? watchers.map((w: any) => ({
          watcher_id: w.watcher_id,
          users: w.users
        })) : []
      };
      setThreadsList([firstThread]);
    } else {
      // Task has no thread - reset to empty state
      setSelectedThreadId(null);
      setThreadsList([]);
    }
  }, [selectedTask?.id, (selectedTask as any)?.thread_id, watchers]);

  const [threadsList, setThreadsList] = useState<any[]>([]);
  const [isThreadListLoading, setIsThreadListLoading] = useState(false);
  const [threadListError, setThreadListError] = useState<string | null>(null);
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

  // Use currentUser prop for chat
  const currentUserName = currentUser?.user_metadata?.full_name || currentUser?.email || '';
  const currentUserAvatar = currentUser?.user_metadata?.avatar_url || '';
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
      setOptimisticChannels([...optimisticChannels, channelName]);
      // Optionally, trigger a mutation or update the backend here
    }
  };

  // Handler to remove a channel optimistically
  const handleRemoveChannel = (channelName: string) => {
    setOptimisticChannels(optimisticChannels.filter(name => name !== channelName));
    // Optionally, trigger a mutation or update the backend here
  };

  const [isEditingAssignee, setIsEditingAssignee] = useState(false)

  // Pending participants for new thread (if no threads exist)
  const [pendingParticipants, setPendingParticipants] = useState<any[]>([]);
  const [removedParticipants, setRemovedParticipants] = useState<any[]>([]);
  const [isAddingThread, setIsAddingThread] = useState(false);
  
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

  // Fetch project users when entering assignee edit mode if not loaded or project changed
  const handleEditAssignee = () => {
    if (!task || !task.project_id_int || String(task.project_id_int) === 'unknown') return;
    setIsEditingAssignee(true);
  };

 

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
    setIsEditingProject(false);
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
    
    setTimeout(() => setIsEditingAssignee(false), 0);
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
    setIsEditingContentType(false);
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
    setIsEditingProductionType(false);
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
    setIsEditingLanguage(false);
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
    setIsEditingStatus(false);
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
    setIsEditingDueDate(false);
  };
  
  const handlePublicationDateBlur = () => {
    if (pendingPublicationDate !== null) {
      handleFieldChange('publication_date', pendingPublicationDate);
      setPendingPublicationDate(null);
    }
    setIsEditingPublicationDate(false);
  };
  
  const handleDueDateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (pendingDueDate !== null) {
        handleFieldChange('delivery_date', pendingDueDate);
        setPendingDueDate(null);
      }
      setIsEditingDueDate(false);
    }
  };
  
  const handlePublicationDateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (pendingPublicationDate !== null) {
        handleFieldChange('publication_date', pendingPublicationDate);
        setPendingPublicationDate(null);
      }
      setIsEditingPublicationDate(false);
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
  const taskDetailsRef = useRef<HTMLDivElement>(null)
  const commentInputRef = useRef<HTMLDivElement>(null)

  // Refactor attachments upload logic: only use attachments prop for display, and useTaskAttachmentsUpload for upload/delete only
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
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.set('id', task.parent_task_id_int.toString());
      router.replace(`/tasks?${newParams.toString()}`, { scroll: false });
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
    if (FIELDS_THAT_REQUIRE_LIST_INVALIDATION.includes(field)) {
      let updatedFields = { ...task, [field]: value, ...extraFields };
      updatedFields = applyNestedOptimisticFields(task, updatedFields);
      updateTaskInCaches(queryClient, updatedFields); // Optimistic update
      console.log('[TaskDetails] Calling Typesense updater with:', updatedFields);
      getTypesenseUpdater()?.(updatedFields);
      if (onTaskUpdate) onTaskUpdate({ ...updatedFields });
    }
    try {
      const updatePayload: any = { [field]: value, ...extraFields };
      const { data, error } = await supabase
        .from('tasks')
        .update(updatePayload)
        .eq('id', task.id)
        .select()
        .single();
      if (error) throw error;
      // Use the returned row to update the cache (authoritative)
      if (data) updateTaskInCaches(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ['task', String(task.id)] });
      // Only invalidate the list/kanban/calendar for specific fields
      if (FIELDS_THAT_REQUIRE_LIST_INVALIDATION.includes(field)) {
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          queryClient.invalidateQueries({ queryKey: ['kanban-bootstrap'] });
        }, 500);
      }
    } catch (err) {
      toast({
        title: 'Failed to save changes',
        description: (err as Error)?.message || 'An error occurred while saving.',
        variant: 'destructive',
      });
    }
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

  // allMentions: all mentions from Edge Function (initial load) or from thread history fetch (if you fetch mentions for all threads)
  const allMentions = firstThreadMentions;

  const filteredMentions = typeof selectedThreadId === 'number'
    ? allMentions.filter((m: any) => m.thread_id === selectedThreadId)
    : [];
  console.log('DEBUG: selectedThreadId', selectedThreadId, 'filteredMentions', filteredMentions);

  const { data: editFields, isLoading: isEditFieldsLoading, error: editFieldsError } = useTaskEditFields(accessToken);

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

  // --- Thread history state and fetch logic ---
  // Remove all local thread fetching logic and state
  // const [threadsList, setThreadsList] = useState<any[]>([]);
  // const [isThreadListLoading, setIsThreadListLoading] = useState(false);
  // const [threadListError, setThreadListError] = useState<string | null>(null);
  const handleViewThreadHistory = async () => {
    setIsThreadListLoading(true);
    setThreadListError(null);
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
              photo
            )
          )
        `)
        .eq('task_id', task.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      // No mapping needed, just filter out null users
      const threadsWithUsers = (data || []).map((thread: any) => ({
        ...thread,
        thread_watchers: Array.isArray(thread.thread_watchers)
          ? thread.thread_watchers.filter((tw: any) => !!tw.users)
          : [],
      }));
      setThreadsList(threadsWithUsers);
    } catch (err: any) {
      setThreadListError(err.message || 'Failed to load threads');
    } finally {
      setIsThreadListLoading(false);
    }
  };

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

  // Get participants for the selected thread (array of user objects)
  const selectedThread = threadsList.find(t => t.id === selectedThreadId);
  let participants: any[] = [];
  if (selectedThread && Array.isArray(selectedThread.thread_watchers)) {
    const userMap = Object.fromEntries((allProjectUsers || []).map((u: any) => [u.id, u]));
    participants = selectedThread.thread_watchers
      .map((tw: any) => tw.users || userMap[tw.watcher_id])
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

  // For currentUserId, use the public user id if available
  // (Assume you have currentUserId from props or context)




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

  // Fetch the current user's public user id from the users table using the session's auth_user_id
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

  // Add local state for each field
  const [title, setTitle] = useState(task?.title ?? '');
  const [copyPost, setCopyPost] = useState(task?.copy_post ?? '');
  const [briefing, setBriefing] = useState(task?.briefing ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');

  // Keep local state in sync with task changes
  useEffect(() => { setTitle(task?.title ?? ''); }, [task?.title]);
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
      label: w.users.full_name
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
  const channelOptions = useMemo(
    () => filteredChannels.map(c => ({ value: String(c.id), label: c.name })),
    [filteredChannels]
  );

  // Add Typesense updater
  const typesenseQuery = useTypesenseInfiniteQuery({ q: '', pageSize: 25, enabled: false });

  return (
    <div ref={taskDetailsRef} className="h-full flex flex-col relative">
      <div className="p-4 bg-white sticky top-0 z-10">
        {/* Action bar: left-aligned, expand/collapse right-aligned */}
        <div className="flex items-center mb-2">
          <div className="flex items-center gap-2 flex-1">
            {/* Folder tree icon for regular tasks (not main or subtask) */}
            {!isLoading && task && task.content_type_id !== '39' && !task.parent_task_id_int && (
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
            <ShareButton 
              url={typeof window !== 'undefined' ? window.location.href : ''} 
              className="text-gray-500 hover:text-blue-600"
            />
          </div>
          <div className="flex items-center gap-2 flex-1 justify-end">
            {/* Collapse button - hidden on mobile */}
            {onCollapse && !isMobile && (
              <button
                className="inline-flex items-center justify-center w-7 h-7 text-gray-500 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-blue-400"
                aria-label="Collapse details pane"
                onClick={onCollapse}
                type="button"
              >
                <PanelRight className="w-5 h-5" />
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
        {/* Always-editable task title */}
        <div>
          <label className="text-sm font-medium text-gray-400 self-start justify-self-start text-left sr-only" htmlFor="task-title">Title</label>
          <textarea
            ref={titleInputRef}
            id="task-title"
            value={isLoading ? '' : title}
            onChange={isLoading ? undefined : (e => setTitle(e.target.value))}
            onBlur={isLoading ? undefined : (() => { if (title !== task?.title) handleFieldChange('title', title); })}
            rows={1}
            className="w-full resize-none text-2xl font-semibold self-start bg-transparent focus:ring-0 outline-none border-none shadow-none p-0 mb-2"
            aria-label="Task title"
            style={{ minHeight: '2.5rem', overflow: 'hidden' }}
            onInput={isLoading ? undefined : (e => { const el = e.currentTarget; el.style.height = '2.5rem'; el.style.height = el.scrollHeight + 'px'; })}
            onKeyDown={isLoading ? undefined : (e => { if (e.key === 'Enter') { e.preventDefault(); if (title !== task?.title) handleFieldChange('title', title); (e.target as HTMLTextAreaElement).blur(); } })}
            disabled={isLoading}
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
                value={isLoading ? '' : String(currentProjectId || '')}
                onChange={isLoading ? undefined : handleProjectChange}
                onBlur={isLoading ? undefined : (() => setIsEditingProject(false))}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
                disabled={isLoading}
              >
                <option value="">Select project</option>
                {editFields?.projects && !editFields.projects.some((opt: any) => String(opt.id) === String(currentProjectId)) && currentProjectId && (
                  <option value={String(currentProjectId)} disabled>
                    {currentProjectName || `Project #${currentProjectId}`}
                  </option>
                )}
                {editFields?.projects
                  ?.filter((opt: any) => opt.active === undefined || opt.active === true)
                  .map((opt: any) => (
                    <option key={String(opt.id)} value={String(opt.id)}>{opt.name}</option>
                  ))}
              </select>
            ) : (
              <div
                className="w-full px-3 py-2 rounded-md cursor-pointer hover:bg-gray-50 truncate"
                tabIndex={0}
                onClick={isLoading ? undefined : () => setIsEditingProject(true)}
                onKeyDown={isLoading ? undefined : (e => { if (e.key === 'Enter') setIsEditingProject(true) })}
                aria-label="Edit project"
                title={currentProjectName || ''}
                style={isLoading ? { pointerEvents: 'none', opacity: 0.5 } : {}}
              >
                {currentProjectName || <span className="text-gray-400">Click to set project</span>}
              </div>
            )}
            {/* Assigned to (with avatar) */}
            <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left" htmlFor="task-assignee">Assigned to</label>
            {isEditingAssignee ? (
              <select
                id="task-assignee"
                value={isLoading ? '' : filteredUserId || ''}
                onChange={isLoading ? undefined : handleAssigneeChange}
                onBlur={isLoading ? undefined : (() => setIsEditingAssignee(false))}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
                disabled={isLoading}
              >
                <option value="">Select assignee</option>
                {assigneeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <div
                className="w-full px-3 py-2 rounded-md cursor-pointer hover:bg-gray-50 truncate flex items-center gap-2"
                tabIndex={0}
                onClick={isLoading ? undefined : handleEditAssignee}
                onKeyDown={isLoading ? undefined : (e => { if (e.key === 'Enter') handleEditAssignee() })}
                aria-label="Edit assignee"
                title={currentAssignedUserName || ''}
                style={isLoading ? { pointerEvents: 'none', opacity: 0.5 } : {}}
              >
                {currentAssignedUserName ? (
                  <>
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted text-xs font-bold uppercase text-gray-900 border border-gray-300 mr-2">
                      {getInitials(currentAssignedUserName)}
                    </span>
                    <span>{currentAssignedUserName}</span>
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
                value={isLoading ? '' : currentDueDate ?? ''}
                onChange={isLoading ? undefined : handleDueDateChange}
                onBlur={isLoading ? undefined : handleDueDateBlur}
                onKeyDown={isLoading ? undefined : handleDueDateKeyDown}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
                autoFocus
                disabled={isLoading}
              />
            ) : (
              <div
                className="w-full px-3 py-2 rounded-md cursor-pointer hover:bg-gray-50 truncate"
                tabIndex={0}
                onClick={isLoading ? undefined : (() => setIsEditingDueDate(true))}
                onKeyDown={isLoading ? undefined : (e => { if (e.key === 'Enter') setIsEditingDueDate(true) })}
                aria-label="Edit due date"
                title={currentDueDate ? new Date(currentDueDate).toLocaleDateString() : ''}
                style={isLoading ? { pointerEvents: 'none', opacity: 0.5 } : {}}
              >
                {currentDueDate ? new Date(currentDueDate).toLocaleDateString() : <span className="text-gray-400">Click to set due date</span>}
              </div>
            )}
            {/* Publication Date (as editable date) */}
            <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left" htmlFor="task-publication-date">Publication Date</label>
            {isEditingPublicationDate ? (
              <input
                id="task-publication-date"
                type="date"
                value={isLoading ? '' : currentPublicationDate ?? ''}
                onChange={isLoading ? undefined : handlePublicationDateChange}
                onBlur={isLoading ? undefined : handlePublicationDateBlur}
                onKeyDown={isLoading ? undefined : handlePublicationDateKeyDown}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
                autoFocus
                disabled={isLoading}
              />
            ) : (
              <div
                className="w-full px-3 py-2 rounded-md cursor-pointer hover:bg-gray-50 truncate"
                tabIndex={0}
                onClick={isLoading ? undefined : (() => setIsEditingPublicationDate(true))}
                onKeyDown={isLoading ? undefined : (e => { if (e.key === 'Enter') setIsEditingPublicationDate(true) })}
                aria-label="Edit publication date"
                title={currentPublicationDate ? new Date(currentPublicationDate).toLocaleDateString() : ''}
                style={isLoading ? { pointerEvents: 'none', opacity: 0.5 } : {}}
              >
                {currentPublicationDate ? new Date(currentPublicationDate).toLocaleDateString() : <span className="text-gray-400">Click to set publication date</span>}
              </div>
            )}
            {/* Status (as pill) */}
            <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left" htmlFor="task-status">Status</label>
            {isEditingStatus ? (
              <select
                id="task-status"
                value={isLoading ? '' : currentStatusId || ''}
                onChange={isLoading ? undefined : handleStatusChange}
                onBlur={isLoading ? undefined : (() => setIsEditingStatus(false))}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
                disabled={isLoading || isEditFieldsLoading}
              >
                <option value="">Select status</option>
                {isEditFieldsLoading && <option disabled>Loading...</option>}
                {editFieldsError && <option disabled>Error loading statuses</option>}
                {statusOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <div
                className="w-full px-3 py-2 rounded-md cursor-pointer hover:bg-gray-50 truncate"
                tabIndex={0}
                onClick={isLoading ? undefined : (() => setIsEditingStatus(true))}
                onKeyDown={isLoading ? undefined : (e => { if (e.key === 'Enter') setIsEditingStatus(true) })}
                aria-label="Edit status"
                title={currentStatusName || ''}
                style={isLoading ? { pointerEvents: 'none', opacity: 0.5 } : {}}
              >
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
                ) : <span className="text-gray-400">Click to set status</span>}
              </div>
            )}
            {/* Content Type */}
            <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left" htmlFor="task-content-type">Content Type</label>
            {isEditingContentType ? (
              <select
                id="task-content-type"
                value={isLoading ? '' : currentContentTypeId || ''}
                onChange={isLoading ? undefined : handleContentTypeChange}
                onBlur={isLoading ? undefined : (() => setIsEditingContentType(false))}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
                disabled={isLoading}
              >
                <option value="">Select content type</option>
                {contentTypeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <div
                className="w-full px-3 py-2 rounded-md cursor-pointer hover:bg-gray-50 truncate"
                tabIndex={0}
                onClick={isLoading ? undefined : (() => setIsEditingContentType(true))}
                onKeyDown={isLoading ? undefined : (e => { if (e.key === 'Enter') setIsEditingContentType(true) })}
                aria-label="Edit content type"
                title={currentContentTypeTitle || ''}
                style={isLoading ? { pointerEvents: 'none', opacity: 0.5 } : {}}
              >
                {currentContentTypeTitle || <span className="text-gray-400">Click to set content type</span>}
              </div>
            )}
            {/* Production Type */}
            <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left" htmlFor="task-production-type">Production Type</label>
            {isEditingProductionType ? (
              <select
                id="task-production-type"
                value={currentProductionTypeId || ''}
                onChange={handleProductionTypeChange}
                onBlur={() => setIsEditingProductionType(false)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                <option value="">Select production type</option>
                {productionTypeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <div
                className="w-full px-3 py-2 rounded-md cursor-pointer hover:bg-gray-50 truncate"
                tabIndex={0}
                onClick={() => setIsEditingProductionType(true)}
                onKeyDown={e => { if (e.key === 'Enter') setIsEditingProductionType(true) }}
                aria-label="Edit production type"
                title={currentProductionTypeTitle || ''}
              >
                {currentProductionTypeTitle || <span className="text-gray-400">Click to set production type</span>}
              </div>
            )}
            {/* Language */}
            <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left" htmlFor="task-language">Language</label>
            {isEditingLanguage ? (
              <select
                id="task-language"
                value={currentLanguageId || ''}
                onChange={handleLanguageChange}
                onBlur={() => setIsEditingLanguage(false)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                <option value="">Select language</option>
                {languageOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <div
                className="w-full px-3 py-2 rounded-md cursor-pointer hover:bg-gray-50 truncate"
                tabIndex={0}
                onClick={() => setIsEditingLanguage(true)}
                onKeyDown={e => { if (e.key === 'Enter') setIsEditingLanguage(true) }}
                aria-label="Edit language"
                title={currentLanguageCode || ''}
              >
                {currentLanguageCode || <span className="text-gray-400">Click to set language</span>}
              </div>
            )}
            {/* Channels (editable pill UI) */}
            <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left">Channels</label>
            <div className="w-full px-3 py-2 flex flex-wrap gap-2 min-h-[40px] items-center overflow-x-auto">
              {optimisticChannels.length > 0 ? (
                optimisticChannels.map((channel, idx) => {
                  // Find channel id by name
                  const channelObj = editFields?.channels?.find((c: any) => c.label === channel);
                  return (
                    <span key={channel} className="inline-flex items-center bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mr-1 mb-1 truncate max-w-[120px]">
                    {channel}
                      {channelObj && (
                        <button
                          type="button"
                          className="ml-1 text-blue-800 hover:text-red-600 focus:outline-none"
                          onClick={() => handleRemoveChannel(channel)}
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
                    {channelOptions
                      ?.filter((c: any) => typeof c.label === 'string' && c.label.toLowerCase().includes(channelSearch.toLowerCase()) && !optimisticChannels.includes(c.label))
                      .slice(0, 8)
                      .map((c: any) => (
                        <div
                          key={c.value}
                          className="flex items-center gap-2 px-2 py-1 hover:bg-accent cursor-pointer text-xs rounded"
                          onClick={() => handleAddChannel(c.label)}
                          title={`Add ${c.label}`}
                        >
                          <span>{c.label}</span>
                        </div>
                      ))}
                    {channelOptions && channelOptions.filter((c: any) => typeof c.label === 'string' && c.label.toLowerCase().includes(channelSearch.toLowerCase()) && !optimisticChannels.includes(c.label)).length === 0 && (
                      <div className="text-xs text-muted-foreground px-2 py-1">No channels found</div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            {showParentField && (
              <>
                <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left">Parent Task</label>
                <div className="w-full flex items-center gap-2">
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
          </div>
          {/* Subtasks section (full width, only once) */}
          {task && String(task.content_type_id) === '39' && (
            <div className="mt-6">
              <label className="text-sm font-medium text-gray-400 text-left mb-1 block">Subtasks</label>
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
            {keyVisualId && attachments.length > 0 && attachments.find(a => a.id === keyVisualId) && (
              <div className="mb-2">
                <div className="text-xs text-muted-foreground mb-1">Key Visual</div>
                <img
                  src={attachments.find(a => a.id === keyVisualId)?.url || ''}
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
                attachments={attachments}
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
          </div>
          {/* Copy Post section (rich text, always editable) */}
          <div className="mt-6">
            <label className="text-sm font-medium text-gray-400 text-left mb-1 block">Copy Post</label>
            <RichTextEditor
              value={copyPost}
              onChange={value => setCopyPost(value)}
              onBlur={() => {
                if (copyPost !== task?.copy_post) handleFieldChange('copy_post', copyPost);
              }}
              readOnly={false}
              toolbarId="ql-toolbar-rich-copy-post"
            />
          </div>
          {/* Briefing section (rich text, always editable) */}
          <div className="mt-6">
            <label className="text-sm font-medium text-gray-400 text-left mb-1 block">Briefing</label>
            <RichTextEditor
              value={briefing}
              onChange={value => setBriefing(value)}
              onBlur={() => {
                if (briefing !== task?.briefing) handleFieldChange('briefing', briefing);
              }}
              readOnly={false}
              toolbarId="ql-toolbar-rich-briefing"
            />
          </div>
          {/* Notes section (rich text, always editable) */}
          <div className="mt-6">
            <label className="text-sm font-medium text-gray-400 text-left mb-1 block">Notes</label>
            <RichTextEditor
              value={notes}
              onChange={value => setNotes(value)}
              onBlur={() => {
                if (notes !== task?.notes) handleFieldChange('notes', notes);
              }}
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
            {/* Thread history dropdown, always visible, initially with only the first thread */}
            
            {selectedThreadId && currentUserId !== null && (
              <ThreadedRealtimeChat
                key={String(selectedThreadId)}
                threadId={selectedThreadId}
                currentUserId={currentUserId}
                currentUserName={currentUserName || undefined}
                currentUserAvatar={currentUserAvatar || undefined}
                currentUserEmail={currentUserEmail}
                currentPublicUserId={currentPublicUserId}
                hideInput={true}
                initialMessages={
                  Array.isArray(allMentions) && selectedThreadId
                    ? allMentions.filter(m => m.thread_id === selectedThreadId)
                    : []
                }
              />
            )}
          </div>
        </div>
        {/* Chat input sticky at the bottom */}
        {task && (
          <div className="sticky bottom-0 left-0 right-0 bg-white border-t z-30 flex flex-col" style={{ boxShadow: '0 -2px 8px rgba(0,0,0,0.03)' }}>
            {/* Pending participant row if no threads */}
            
            {/* Chat input only (sticky) */}
            <StickyAddCommentInput
              taskId={taskIdNum}
              onCommentAdded={() => {}}
              pendingParticipants={pendingParticipants}
              setPendingParticipants={setPendingParticipants}
              removedParticipants={removedParticipants}
              setRemovedParticipants={setRemovedParticipants}
              activeThreadId={isAddingThread ? null : selectedThreadId}
              threads={threadsList}
              latestMentions={latestMentions}
              handleDeleteThread={handleDeleteThread}
            />
            {/* Thread selector, participants, new thread (compact row) */}
            <div className="border-t bg-white px-2 py-1 flex items-center gap-2">
              {/* Thread history button (leftmost) */}
              <ThreadSwitcherPopover
                taskId={taskIdNum}
                threads={threadsList}
                activeThreadId={selectedThreadId}
                onSelectThread={id => {
                  setSelectedThreadId(id);
                  setIsAddingThread(false);
                }}
                onOpenChange={(open: boolean) => {
                  if (open && threadsList.length === 1 && !isThreadListLoading) {
                    handleViewThreadHistory();
                  }
                }}
              />
              {/* Avatars/participants: always in the same place, flex-1 */}
              <div className="flex-1 overflow-hidden">
                {isAddingThread || !(selectedTask as any)?.thread_id ? (
                  <ThreadParticipantsInline
                    pendingMode
                    pendingParticipants={pendingParticipants}
                    setPendingParticipants={setPendingParticipants}
                    removedParticipants={removedParticipants}
                    setRemovedParticipants={setRemovedParticipants}
                    participants={Array.isArray(project_watchers) ? project_watchers.map((pw: any) => pw.users).filter(Boolean) : []}
                    allProjectUsers={allProjectUsers}
                    currentUserId={currentUserId}
                    projectId={Number(task?.project_id_int) || 0}
                  />
                ) : (
                  typeof selectedThreadId === 'number' && (
                    <ThreadParticipantsInline 
                      threadId={selectedThreadId}
                      projectId={Number(task?.project_id_int) || 0}
                      allowRemove={true}
                      key={selectedThreadId}
                      participants={participants}
                      allProjectUsers={allProjectUsers}
                      currentUserId={currentUserId}
                      onParticipantsChanged={refetchSelectedThread}
                    />
                  )
                )}
              </div>
              {/* Delete thread icon (with confirmation dialog) */}
              {selectedThreadId && (
                <>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="ml-1 shrink-0 text-destructive"
                    aria-label="Delete thread"
                    title="Delete thread"
                    onClick={() => setShowDeleteThreadDialog(true)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Dialog open={showDeleteThreadDialog} onOpenChange={setShowDeleteThreadDialog}>
                    <DialogContent>
                      <DialogTitle>Delete Thread</DialogTitle>
                      <div className="py-2">Are you sure you want to delete this thread? This cannot be undone.</div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDeleteThreadDialog(false)} disabled={isDeleting}>Cancel</Button>
                        <Button variant="destructive" onClick={() => { handleDeleteThread(selectedThreadId); setShowDeleteThreadDialog(false); }} disabled={isDeleting}>
                          {isDeleting ? 'Deleting...' : 'Delete'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              )}
              {/* Add thread button: always at the end, never moves */}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="ml-1 shrink-0"
                aria-label="Add new thread"
                title="Add new thread"
                onClick={handleAddThread}
              >
                +
              </Button>
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