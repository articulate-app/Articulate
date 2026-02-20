'use client'
import * as React from "react"
import { useForm, FormProvider, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { addTask } from '../../../lib/services/tasks'
import { getUsersForProject } from '../../lib/services/users'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useEffect, useState, useRef } from 'react'
import { addItemToStore, removeItemFromStore } from '../../../hooks/use-infinite-query'
import { useFilterOptions } from '../../hooks/use-filter-options'
import { useQueryClient } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { Dropzone } from '../dropzone'
import { addTaskToGroupedTaskCaches, normalizeTask, updateTaskInCaches, addTaskToCalendarCaches, addTaskToKanbanCaches } from './task-cache-utils'
import { getTypesenseUpdater } from '../../store/typesense-tasks'
import { OccupationAwarenessDisplay } from './occupation-awareness-display'
import { OccupationAwareDatePicker } from '../ui/occupation-aware-date-picker'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, Calendar, Tag, Paperclip, Check, Plus } from 'lucide-react'
import { getImageUrl } from '@/lib/public-media'
import { UserAvatar } from '../UserAvatar'
import { ProjectBadge } from '../ProjectBadge'

const RichTextEditor = dynamic(() => import('../ui/rich-text-editor').then(mod => ({ default: mod.RichTextEditor })), {
  ssr: false,
  loading: () => <div className="h-32 border rounded-md bg-gray-50 animate-pulse flex items-center justify-center">Loading editor...</div>
});

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  briefing: z.string().optional(),
  assigned_to_id: z.string().optional(),
  project_id_int: z.string().optional(),
  content_type_id: z.string().optional(),
  production_type_id: z.string().optional(),
  language_id: z.string().optional(),
  project_status_id: z.string().optional(),
  channels: z.array(z.string()).optional(),
  watchers: z.array(z.string()).optional(),
  parent_task_id_int: z.string().optional(),
  delivery_date: z.string().optional(),
  publication_date: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

type Option = { value: string; label: string; active?: boolean; photo?: string | null; color?: string | null; logo?: string | null }

type StatusOption = { value: string; label: string; color: string; order_priority?: number };
type ProjectWatcherOption = { value: string; label: string; photo?: string | null; photoUrl?: string | null };

type AddTaskFormProps = {
  onSuccess?: (task: any) => void
  /** When provided, form calls this instead of onSuccess and stays open (for Create & add another) */
  onCreateAndAddAnother?: (task: any) => void
  defaultProjectId?: number
  /** Pre-fill form fields (e.g. from Kanban group context when opening composer from "+ Add task") */
  initialValues?: Partial<FormValues>
  parentTaskId?: string
  onMainTaskCreated?: (mainTaskId: string | number) => void
  parentTaskTitle?: string
  parentProjectName?: string
  parentProjectId?: string | number
  onClose?: () => void
  children?: React.ReactNode
  isModal?: boolean // New prop to indicate if used in modal context
  /** Composer variant: staged layout with Stage 1 always visible, Stage 2 in expandable section */
  variant?: 'default' | 'composer'
  /** Sync form values and dirty state for composer minimized bar */
  onFormChange?: (values: Partial<FormValues>, dirty: boolean) => void
}

export function AddTaskForm({
  onSuccess,
  onCreateAndAddAnother,
  defaultProjectId,
  initialValues,
  parentTaskId,
  onMainTaskCreated,
  parentTaskTitle,
  parentProjectName,
  parentProjectId,
  onClose,
  children,
  isModal = false,
  variant = 'default',
  onFormChange,
}: AddTaskFormProps) {
  const baseDefaults: FormValues = {
    title: "",
    briefing: "",
    assigned_to_id: "",
    project_id_int: defaultProjectId !== undefined ? String(defaultProjectId) : "",
    content_type_id: "",
    production_type_id: "",
    language_id: "",
    project_status_id: "",
    channels: [],
    watchers: [],
    delivery_date: new Date().toISOString().slice(0, 10),
    publication_date: new Date(new Date().getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  };
  const mergedDefaults: FormValues = initialValues
    ? {
        ...baseDefaults,
        project_id_int: (initialValues.project_id_int != null && String(initialValues.project_id_int).trim() !== "")
          ? String(initialValues.project_id_int)
          : baseDefaults.project_id_int,
        project_status_id: (initialValues.project_status_id != null && String(initialValues.project_status_id).trim() !== "")
          ? String(initialValues.project_status_id)
          : baseDefaults.project_status_id,
        assigned_to_id: (initialValues.assigned_to_id != null && String(initialValues.assigned_to_id).trim() !== "")
          ? String(initialValues.assigned_to_id)
          : baseDefaults.assigned_to_id,
        content_type_id: (initialValues.content_type_id != null && String(initialValues.content_type_id).trim() !== "")
          ? String(initialValues.content_type_id)
          : baseDefaults.content_type_id,
        production_type_id: (initialValues.production_type_id != null && String(initialValues.production_type_id).trim() !== "")
          ? String(initialValues.production_type_id)
          : baseDefaults.production_type_id,
        language_id: (initialValues.language_id != null && String(initialValues.language_id).trim() !== "")
          ? String(initialValues.language_id)
          : baseDefaults.language_id,
      }
    : baseDefaults;
  const methods = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: mergedDefaults,
  })
  const { handleSubmit, register, setValue, watch, formState: { errors, isSubmitting, isDirty } } = methods
  const createAndAddAnotherRef = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)

  // Sync form state to composer for minimized bar (use subscription to avoid infinite loop)
  useEffect(() => {
    if (variant !== 'composer' || !onFormChange) return
    const subscription = watch((values, meta) => {
      // Ignore initial subscription fire to avoid store feedback loops
      if (!meta?.name) return
      onFormChange(values as Partial<FormValues>, methods.formState.isDirty)
    })
    return () => subscription.unsubscribe()
  }, [variant, onFormChange, watch])

  // Fetch filter options only when form is rendered
  const { data: options, isLoading: isOptionsLoading } = useFilterOptions()

  // State for filtered users
  const [filteredUsers, setFilteredUsers] = useState<Option[]>([])
  // State for filtered content types, languages, production types
  const [filteredContentTypes, setFilteredContentTypes] = useState<Option[]>([])
  const [filteredLanguages, setFilteredLanguages] = useState<Option[]>([])
  const [filteredProductionTypes, setFilteredProductionTypes] = useState<Option[]>([])
  const [projectWatchers, setProjectWatchers] = useState<ProjectWatcherOption[]>([])
  const [projectChannels, setProjectChannels] = useState<{ id: string; label: string; isDefault: boolean }[]>([])
  const [watchersExpanded, setWatchersExpanded] = useState(false)
  const [watcherSearch, setWatcherSearch] = useState('')
  const [projectExpanded, setProjectExpanded] = useState(false)
  const [statusExpanded, setStatusExpanded] = useState(false)
  const [assigneeExpanded, setAssigneeExpanded] = useState(false)
  const [channelsExpanded, setChannelsExpanded] = useState(false)
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(false)

  // State for parent task info
  const [parentTaskInfo, setParentTaskInfo] = useState<{ title: string; projectName: string } | null>(
    parentTaskId && parentTaskTitle && parentProjectName
      ? { title: parentTaskTitle, projectName: parentProjectName }
      : null
  )

  // Ensure all dropdown option values are strings
  const safeContentTypeOptions = (options?.contentTypes || []).map(opt => ({ ...opt, value: String(opt.value) }))
  const safeLanguageOptions = (options?.languages || []).map(opt => ({ ...opt, value: String(opt.value) }))
  const safeProductionTypeOptions = (options?.productionTypes || []).map(opt => ({ ...opt, value: String(opt.value) }))

  // Watch selected project and fetch users for it
  const selectedProjectId = watch('project_id_int')
  const selectedWatchers = watch('watchers') || []

  // Add this near the top of the component, after options is available
  const channelOptions = React.useMemo(
    () =>
      (options?.channels || []).map(opt => ({
        id: String(opt.value),
        label: opt.label,
      })),
    [options?.channels]
  )
  const effectiveChannelOptions = projectChannels.length > 0
    ? projectChannels.map(ch => ({ id: ch.id, label: ch.label }))
    : channelOptions

  useEffect(() => {
    if (isOptionsLoading) return
    if (selectedProjectId && !(options?.projects || []).some(opt => String(opt.value) === String(selectedProjectId))) {
      if (watch('project_id_int') !== '') setValue('project_id_int', '')
      return
    }
    if (!selectedProjectId) {
      if (filteredUsers.length !== 0) setFilteredUsers([])
      if (watch('assigned_to_id') !== '') setValue('assigned_to_id', '')
      return
    }
    getUsersForProject(selectedProjectId)
      .then(users => {
        if (JSON.stringify(filteredUsers) !== JSON.stringify(users)) setFilteredUsers(users)
      })
    if (watch('assigned_to_id') !== '') setValue('assigned_to_id', '')
  }, [selectedProjectId, options?.projects, isOptionsLoading])

  // Load project watchers (default: all selected as task watchers)
  useEffect(() => {
    if (!selectedProjectId) {
      setProjectWatchers([])
      setValue('watchers', [], { shouldDirty: false })
      return
    }
    let isMounted = true
    const loadProjectWatchers = async () => {
      const supabase = createClientComponentClient()
      const { data, error } = await supabase
        .from('v_project_watchers_with_user')
        .select('user_id, full_name, photo')
        .eq('project_id', selectedProjectId)
        .order('full_name')
      if (error || !isMounted) return
      const mapped = (data || [])
        .filter((w: any) => w.user_id && w.full_name)
        .map((w: any) => ({
          value: String(w.user_id),
          label: w.full_name,
          photo: w.photo ?? null,
          photoUrl: getImageUrl(w.photo ?? null),
        }))
      setProjectWatchers(mapped)
      setValue('watchers', mapped.map(w => w.value), { shouldDirty: false })
    }
    loadProjectWatchers()
    return () => {
      isMounted = false
    }
  }, [selectedProjectId, setValue])

  // Load project channels from v_project_channels_resolved (defaults preselected).
  // If the project has no rows (or view is unavailable), fallback to global channels.
  useEffect(() => {
    if (!selectedProjectId) {
      setProjectChannels([])
      setValue('channels', channelOptions.map((ch) => ch.id), { shouldDirty: false })
      return
    }
    let isMounted = true
    const loadProjectChannels = async () => {
      const supabase = createClientComponentClient()
      const { data, error } = await supabase
        .from('v_project_channels_resolved')
        .select('channel_id, name, is_enabled, is_default, position')
        .eq('project_id', selectedProjectId)
        .order('position', { ascending: true, nullsFirst: false })
      if (!isMounted) return
      if (error) {
        // Keep form usable even if view is missing/unavailable.
        setProjectChannels([])
        setValue('channels', channelOptions.map((ch) => ch.id), { shouldDirty: false })
        return
      }

      const projectDefined = (data || [])
        .map((ch: any) => ({
          id: String(ch.channel_id),
          label: ch.name,
          isDefault: Boolean(ch.is_default),
        }))
      setProjectChannels(projectDefined)
      const defaultIds = projectDefined.length > 0
        ? projectDefined.map((ch) => ch.id)
        : channelOptions.map((ch) => ch.id)
      setValue('channels', defaultIds, { shouldDirty: false })
    }
    loadProjectChannels()
    return () => {
      isMounted = false
    }
  }, [selectedProjectId, setValue, channelOptions])

  // Watch selected user and filter content types, languages, production types
  const selectedUserId = watch('assigned_to_id')
  const selectedContentTypeId = watch('content_type_id');
  const selectedLanguageId = watch('language_id');
  const selectedProductionTypeId = watch('production_type_id');
  const safeContentTypeIdValue = selectedContentTypeId === undefined ? '' : selectedContentTypeId;
  const safeProductionTypeIdValue = selectedProductionTypeId === undefined ? '' : selectedProductionTypeId;

  useEffect(() => {
    if (!parentTaskId) return
    if (parentTaskTitle && parentProjectName && parentProjectId) {
      setParentTaskInfo({ title: parentTaskTitle, projectName: parentProjectName })
      setValue('project_id_int', String(parentProjectId))
      return
    }
    // Fallback: fetch from Supabase if not provided
    const fetchParentTask = async () => {
      const supabase = createClientComponentClient()
      const { data, error } = await supabase
        .from('tasks')
        .select('title, project_id_int, projects:projects!project_id_int(id, name)')
        .eq('id', parentTaskId)
        .single()
      if (data) {
         let projectName = ''
         if (Array.isArray(data.projects)) {
           const firstProject: any = data.projects[0]
           if (firstProject && typeof firstProject === 'object' && 'name' in firstProject) {
             projectName = firstProject.name || ''
           }
         } else if (data.projects && typeof data.projects === 'object' && 'name' in (data.projects as any)) {
           projectName = (data.projects as any).name || ''
         }
         setParentTaskInfo({
           title: data.title,
           projectName,
         })
         // Lock project_id_int to parent's project
         setValue('project_id_int', String(data.project_id_int))
      }
    }
    fetchParentTask()
  }, [parentTaskId, parentTaskTitle, parentProjectName, parentProjectId, setValue])

  const queryClient = useQueryClient()

  const projectIdValue = watch('project_id_int');
  const contentTypeIdValue = watch('content_type_id');
  const productionTypeIdValue = watch('production_type_id');
  const languageIdValue = watch('language_id');
  const projectStatusIdValue = watch('project_status_id');
  const safeLanguageIdValue = typeof languageIdValue === 'string' ? languageIdValue : '';
  const safeProjectStatusIdValue = typeof projectStatusIdValue === 'string' ? projectStatusIdValue : '';

  useEffect(() => {
    if (options?.statuses && options.statuses.length > 0) {
      const minStatus = (options.statuses as StatusOption[]).reduce((min, s) =>
        min === null || (Number(s.order_priority ?? 9999) < Number(min.order_priority ?? 9999)) ? s : min, null as any)
      if (minStatus && minStatus.value) {
        setValue('project_status_id', String(minStatus.value))
      }
    }
  }, [options?.statuses, setValue])

  // 1. Set default title and project logic
  const [hasSetInitialProject, setHasSetInitialProject] = useState(false);
  const [hasSetInitialAssignee, setHasSetInitialAssignee] = useState(false);
  const [hasSetInitialStatus, setHasSetInitialStatus] = useState(false);
  const [hasSetInitialTypes, setHasSetInitialTypes] = useState(false);
  const lastApiCallRef = useRef<string>('');

  // Set default title
  useEffect(() => {
    setValue('title', 'Write an exciting title');
  }, [setValue]);

  // Set default project: last used or first in list
  useEffect(() => {
    if (hasSetInitialProject || isOptionsLoading || !options?.projects?.length) return;
    let lastUsedProject = '';
    if (typeof window !== 'undefined') {
      lastUsedProject = localStorage.getItem('lastUsedProjectId') || '';
    }
    const found = options.projects.find(p => String(p.value) === lastUsedProject);
    if (found) {
      setValue('project_id_int', String(found.value));
    } else {
      setValue('project_id_int', String(options.projects[0].value));
    }
    setHasSetInitialProject(true);
  }, [hasSetInitialProject, isOptionsLoading, options?.projects, setValue]);

  // Save last used project on change
  useEffect(() => {
    if (selectedProjectId && typeof window !== 'undefined') {
      localStorage.setItem('lastUsedProjectId', String(selectedProjectId));
    }
  }, [selectedProjectId]);

  // Set default assignee: user with most tasks in last 30 days for selected project
  useEffect(() => {
    if (!selectedProjectId || hasSetInitialAssignee || !filteredUsers.length) return;
    async function fetchMostActiveAssignee() {
      try {
        const supabase = createClientComponentClient();
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from('tasks')
          .select('assigned_to_id')
          .eq('project_id_int', selectedProjectId)
          .gte('created_at', since)
          .not('assigned_to_id', 'is', null);
        if (data && data.length) {
          // Aggregate in JS
          const countMap: Record<string, number> = {};
          data.forEach((row: { assigned_to_id: string }) => {
            if (row.assigned_to_id) {
              countMap[row.assigned_to_id] = (countMap[row.assigned_to_id] || 0) + 1;
            }
          });
          const mostActive = Object.entries(countMap).sort((a, b) => b[1] - a[1])[0];
          if (mostActive && mostActive[0]) {
            setValue('assigned_to_id', String(mostActive[0]));
          } else if (filteredUsers.length) {
            setValue('assigned_to_id', filteredUsers[0].value);
          }
        } else if (filteredUsers.length) {
          setValue('assigned_to_id', filteredUsers[0].value);
        }
        setHasSetInitialAssignee(true);
      } catch {
        if (filteredUsers.length) setValue('assigned_to_id', filteredUsers[0].value);
        setHasSetInitialAssignee(true);
      }
    }
    fetchMostActiveAssignee();
  }, [selectedProjectId, filteredUsers, setValue, hasSetInitialAssignee]);

  // Reset initial assignee flag on project change
  useEffect(() => {
    setHasSetInitialAssignee(false);
  }, [selectedProjectId]);

  // Reset initial status flag on project change
  useEffect(() => {
    setHasSetInitialStatus(false);
  }, [selectedProjectId]);

  // --- COMBINED USER CAPABILITIES AND DEFAULT TYPES LOGIC ---
  useEffect(() => {
    if (!selectedUserId) {
      if (filteredContentTypes.length !== 0) setFilteredContentTypes([])
      if (filteredLanguages.length !== 0) setFilteredLanguages([])
      if (filteredProductionTypes.length !== 0) setFilteredProductionTypes([])
      if (watch('content_type_id') !== '') setValue('content_type_id', '')
      if (watch('language_id') !== '') setValue('language_id', '')
      if (watch('production_type_id') !== '') setValue('production_type_id', '')
      return
    }
    
    // Create a unique key for this user
    const userKey = `user-${selectedUserId}`;
    
    // Prevent duplicate API calls for the same user
    if (lastApiCallRef.current === userKey) return;
    
    // Faster response with shorter debounce
    const timeoutId = setTimeout(async () => {
      // Double-check the key hasn't changed during the timeout
      if (lastApiCallRef.current === userKey) return;
      
      lastApiCallRef.current = userKey;
      let isMounted = true;
      
      try {
        const supabase = createClientComponentClient();
        
        // Single API call to get all user capabilities
        const { data: costsData, error } = await supabase
          .from('costs')
          .select('*')
          .eq('user_id', selectedUserId);
          
        if (error) throw error;
        
        if (!isMounted) return;
        
        // Process user capabilities
        const contentTypeIds = Array.from(new Set((costsData || []).map((row: any) => String(row.content_type_id)).filter(Boolean)));
        const languageIds = Array.from(new Set((costsData || []).map((row: any) => String(row.language_id)).filter(Boolean)));
        const productionTypeIds = Array.from(new Set((costsData || []).map((row: any) => String(row.production_type_id)).filter(Boolean)));
        
        // Filter options based on user capabilities
        const filteredCT = safeContentTypeOptions.filter(opt => contentTypeIds.includes(String(opt.value)));
        const filteredLang = safeLanguageOptions.filter(opt => languageIds.includes(String(opt.value)));
        const filteredPT = safeProductionTypeOptions.filter(opt => productionTypeIds.includes(String(opt.value)));
        
        if (JSON.stringify(filteredContentTypes) !== JSON.stringify(filteredCT)) setFilteredContentTypes(filteredCT);
        if (JSON.stringify(filteredLanguages) !== JSON.stringify(filteredLang)) setFilteredLanguages(filteredLang);
        if (JSON.stringify(filteredProductionTypes) !== JSON.stringify(filteredPT)) setFilteredProductionTypes(filteredPT);
        
        // Only reset if current value is not in filtered options
        if (!filteredCT.some(opt => opt.value === selectedContentTypeId) && watch('content_type_id') !== '') {
          setValue('content_type_id', '');
        }
        if (!filteredLang.some(opt => opt.value === selectedLanguageId) && watch('language_id') !== '') {
          setValue('language_id', '');
        }
        if (!filteredPT.some(opt => opt.value === selectedProductionTypeId) && watch('production_type_id') !== '') {
          setValue('production_type_id', '');
        }
        
        // Set default types if we have a project and haven't set them yet
        if (selectedProjectId && !hasSetInitialTypes) {
          // Check for content_type_id='1' in costs data
          const hasContentType1 = costsData?.some((row: any) => String(row.content_type_id) === '1');
          if (hasContentType1) {
            setValue('content_type_id', '1');
            console.log('Set default content_type_id to 1');
          } else {
            // Fallback: most common content type in last 30 days for user/project
            const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const { data: tasks } = await supabase
              .from('tasks')
              .select('content_type_id')
              .eq('assigned_to_id', selectedUserId)
              .eq('project_id_int', selectedProjectId)
              .gte('created_at', since);
            if (isMounted && tasks && tasks.length) {
              const countMap: Record<string, number> = {};
              tasks.forEach((row: { content_type_id: string }) => {
                if (row.content_type_id) {
                  countMap[row.content_type_id] = (countMap[row.content_type_id] || 0) + 1;
                }
              });
              const mostCommon = Object.entries(countMap).sort((a, b) => b[1] - a[1])[0];
              if (mostCommon && mostCommon[0]) {
                setValue('content_type_id', String(mostCommon[0]));
              }
            }
          }
          
          // Check for production_type_id='1' in costs data
          const hasProductionType1 = costsData?.some((row: any) => String(row.production_type_id) === '1');
          if (hasProductionType1) {
            setValue('production_type_id', '1');
            console.log('Set default production_type_id to 1');
          } else {
            // Fallback: most common production type in last 30 days for user/project
            const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const { data: tasks } = await supabase
              .from('tasks')
              .select('production_type_id')
              .eq('assigned_to_id', selectedUserId)
              .eq('project_id_int', selectedProjectId)
              .gte('created_at', since);
            if (isMounted && tasks && tasks.length) {
              const countMap: Record<string, number> = {};
              tasks.forEach((row: { production_type_id: string }) => {
                if (row.production_type_id) {
                  countMap[row.production_type_id] = (countMap[row.production_type_id] || 0) + 1;
                }
              });
              const mostCommon = Object.entries(countMap).sort((a, b) => b[1] - a[1])[0];
              if (mostCommon && mostCommon[0]) {
                setValue('production_type_id', String(mostCommon[0]));
              }
            }
          }
          
          // Set default language if not already set
          if (!watch('language_id')) {
            const hasLanguage1 = costsData?.some((row: any) => String(row.language_id) === '1');
            if (hasLanguage1) {
              setValue('language_id', '1');
              console.log('Set default language_id to 1');
            }
          }
          
          setHasSetInitialTypes(true);
        }
      } catch (error) {
        console.error('Error fetching user capabilities:', error);
      }
    }, 100); // Reduced to 100ms for faster response

    return () => {
      clearTimeout(timeoutId);
    };
  }, [selectedUserId, selectedProjectId, safeContentTypeOptions, safeLanguageOptions, safeProductionTypeOptions, selectedContentTypeId, selectedLanguageId, selectedProductionTypeId, hasSetInitialTypes]);

  // Default Channel - REMOVED: This was causing duplicate API calls since channels are already fetched in options

  // Deduplicate options for selects
  const uniqueProjects = Array.from(
    new Map((options?.projects || []).map(opt => [String(opt.value), opt])).values()
  ).filter(opt => !('active' in opt) || opt.active !== false);
  const uniqueAssignees = Array.from(new Map((filteredUsers || []).map(opt => [String(opt.value), opt])).values());
  const uniqueContentTypes = Array.from(new Map((filteredContentTypes || []).map(opt => [String(opt.value), opt])).values());
  const uniqueProductionTypes = Array.from(new Map((filteredProductionTypes || []).map(opt => [String(opt.value), opt])).values());
  const uniqueLanguages = Array.from(new Map((filteredLanguages || []).map(opt => [String(opt.value), opt])).values());

  // State for project-specific statuses
  const [projectStatuses, setProjectStatuses] = useState<{ value: string; label: string; color: string; order_priority?: number }[]>([]);

  // Fetch project-specific statuses
  useEffect(() => {
    if (!selectedProjectId) {
      setProjectStatuses([]);
      return;
    }

    const fetchProjectStatuses = async () => {
      const supabase = createClientComponentClient();
      const { data: statuses, error } = await supabase
        .from('project_statuses')
        .select('id, name, color, order_priority')
        .eq('project_id', selectedProjectId)
        .order('order_priority', { ascending: true });

      if (error) {
        console.error('Error fetching project statuses:', error);
        return;
      }

      const mappedStatuses = (statuses || [])
        .filter(status => status.name !== 'Overdue')
        .map(status => ({
          value: String(status.id),
          label: status.name,
          color: status.color,
          order_priority: status.order_priority
        }));

      setProjectStatuses(mappedStatuses);
    };

    fetchProjectStatuses();
  }, [selectedProjectId]);

  // Filter only project-specific statuses and exclude 'Overdue'
  const filteredStatuses = projectStatuses;

  // Set default status: 'Not started' if present, else lowest order_priority (not 'Overdue')
  useEffect(() => {
    if (filteredStatuses.length > 0) {
      const current = watch('project_status_id');
      const found = filteredStatuses.find(s => String(s.value) === String(current));
      if (!found) {
        // Try to find 'Not started'
        const notStarted = filteredStatuses.find(s => s.label === 'Not started');
        if (notStarted) {
          setValue('project_status_id', String(notStarted.value), { shouldDirty: false });
        } else {
          // Fallback: lowest order_priority
          const sorted = filteredStatuses
            .filter(s => s.label !== 'Overdue')
            .sort((a, b) => Number(a.order_priority ?? 9999) - Number(b.order_priority ?? 9999));
          if (sorted.length > 0) {
            setValue('project_status_id', String(sorted[0].value), { shouldDirty: false });
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, filteredStatuses]);

  // Set default status with smallest order_priority on project change
  useEffect(() => {
    if (!projectStatuses?.length || !selectedProjectId || hasSetInitialStatus) return;
    // Remove project-specific filtering, just use all statuses
    const minStatus = projectStatuses.reduce((min, s) =>
      min === null || (Number(s.order_priority ?? 9999) < Number(min.order_priority ?? 9999)) ? s : min, null as any);
    if (minStatus && minStatus.value) {
      setValue('project_status_id', String(minStatus.value));
      setHasSetInitialStatus(true);
    }
  }, [projectStatuses, selectedProjectId, setValue, hasSetInitialStatus]);


  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [activeDetailPanel, setActiveDetailPanel] = useState<null | 'project' | 'assignee' | 'dates' | 'types' | 'language' | 'channels' | 'attachments' | 'watchers'>(null);
  const [datePanelMode, setDatePanelMode] = useState<'delivery' | 'publication'>('delivery')
  const detailPanelRef = useRef<HTMLDivElement | null>(null)
  const iconRowRef = useRef<HTMLDivElement | null>(null)
  const statusPanelRef = useRef<HTMLDivElement | null>(null)

  const handleDropzoneFiles = async (files: FileList | File[]) => {
    setPendingFiles(prev => [...prev, ...Array.from(files)]);
    return Promise.resolve();
  };
  const handleRemoveFile = async (file: File) => {
    setPendingFiles(prev => prev.filter(f => f !== file));
    return Promise.resolve();
  };

  function cleanPayload(obj: Record<string, any>) {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === "" || value === undefined) {
        cleaned[key] = null;
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const handleSuccess = (task: any) => {
      if (createAndAddAnotherRef.current && onCreateAndAddAnother) {
        createAndAddAnotherRef.current = false;
        onCreateAndAddAnother(task);
        // Keep project for "add another" flow; reset title and briefing
        const current = methods.getValues();
        methods.reset({
          ...current,
          title: "",
          briefing: "",
        });
      } else {
        onSuccess?.(task);
      }
    };
    console.log('Submitting task', values);
    try {
      // Debug: log Supabase client, user, session
      const supabase = createClientComponentClient()
      console.log('Supabase client (AddTaskForm):', supabase)
      const { data: authData, error: authError } = await supabase.auth.getUser()
      console.log('Auth user (AddTaskForm):', authData.user, 'Auth error:', authError)
      if (typeof supabase.auth.getSession === 'function') {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        console.log('Session (AddTaskForm):', sessionData, 'Session error:', sessionError)
      }
      if (parentTaskId) {
        // Fetch the parent task to check if it's a main task
        const { data: parentTask, error: parentError } = await supabase
          .from('tasks')
          .select('id, title, content_type_id, project_id_int, assigned_to_id, production_type_id, language_id, project_status_id')
          .eq('id', parentTaskId)
          .single()
        if (parentError || !parentTask) throw parentError || new Error('Parent task not found')
        const isMainTask = String(parentTask.content_type_id) === '39'
        if (!isMainTask) {
          // 1. Create an optimistic main task with a temporary ID
          const optimisticMainTaskId = 'optimistic-main-' + Date.now()
          const optimisticMainTask = {
            id: optimisticMainTaskId,
            title: parentTask.title + ' - Main Task',
            content_type_id: 39,
            project_id_int: parentTask.project_id_int,
            parent_task_id_int: null,
          }
          addItemToStore('tasks', undefined, optimisticMainTask)
                  // --- Patch Typesense store for main task optimistic updates ---
        getTypesenseUpdater()?.(optimisticMainTask)
          // Expand the new main task immediately
          onMainTaskCreated?.(optimisticMainTaskId)
          // 2. Optimistically update the original task (hydrate with joined fields)
          const optimisticRegularTask = {
            ...parentTask,
            parent_task_id_int: optimisticMainTaskId,
            // Hydrate joined fields for instant UI
            assigned_user: options?.users?.find(u => String(u.value) === String(parentTask.assigned_to_id))
              ? { id: parentTask.assigned_to_id, full_name: options.users.find(u => String(u.value) === String(parentTask.assigned_to_id))?.label }
              : null,
            projects: options?.projects?.find(p => String(p.value) === String(parentTask.project_id_int))
              ? { id: parentTask.project_id_int, name: options.projects.find(p => String(p.value) === String(parentTask.project_id_int))?.label }
              : null,
            project_statuses: options?.statuses?.find(s => String(s.value) === String(parentTask.project_status_id))
              ? { id: parentTask.project_status_id, name: options.statuses.find(s => String(s.value) === String(parentTask.project_status_id))?.label, color: options.statuses.find(s => String(s.value) === String(parentTask.project_status_id))?.color }
              : null,
            content_type_title: options?.contentTypes?.find(ct => String(ct.value) === String(parentTask.content_type_id))?.label,
            production_type_title: options?.productionTypes?.find(pt => String(pt.value) === String(parentTask.production_type_id))?.label,
            language_code: options?.languages?.find(l => String(l.value) === String(parentTask.language_id))?.label,
          }
          addItemToStore('subtasks', String(optimisticMainTaskId), optimisticRegularTask)
                  // --- Patch Typesense store for regular task optimistic updates ---
        getTypesenseUpdater()?.(optimisticRegularTask)
          removeItemFromStore('tasks', undefined, parentTaskId)
          // 3. Optimistically add a placeholder for the new subtask (hydrate with joined fields)
          const payload = cleanPayload({
            ...values,
            delivery_date: values.delivery_date || null,
            publication_date: values.publication_date || null,
          });
          let subtaskPayload = cleanPayload({
            ...payload,
            assigned_to_id: String(values.assigned_to_id),
            project_id_int: String(values.project_id_int),
            content_type_id: String(values.content_type_id),
            production_type_id: String(values.production_type_id),
            language_id: String(values.language_id),
            project_status_id: String(values.project_status_id),
            parent_task_id_int: String(optimisticMainTaskId),
          });
          const optimisticSubtask = {
            ...subtaskPayload,
            id: 'optimistic-' + Date.now(),
            assigned_user: options?.users?.find(u => String(u.value) === String(subtaskPayload.assigned_to_id))
              ? { id: subtaskPayload.assigned_to_id, full_name: options.users.find(u => String(u.value) === String(subtaskPayload.assigned_to_id))?.label }
              : null,
            projects: options?.projects?.find(p => String(p.value) === String(subtaskPayload.project_id_int))
              ? { id: subtaskPayload.project_id_int, name: options.projects.find(p => String(p.value) === String(subtaskPayload.project_id_int))?.label }
              : null,
            project_statuses: options?.statuses?.find(s => String(s.value) === String(subtaskPayload.project_status_id))
              ? { id: subtaskPayload.project_status_id, name: options.statuses.find(s => String(s.value) === String(subtaskPayload.project_status_id))?.label, color: options.statuses.find(s => String(s.value) === String(subtaskPayload.project_status_id))?.color }
              : null,
            content_type_title: options?.contentTypes?.find(ct => String(ct.value) === String(subtaskPayload.content_type_id))?.label,
            production_type_title: options?.productionTypes?.find(pt => String(pt.value) === String(subtaskPayload.production_type_id))?.label,
            language_code: options?.languages?.find(l => String(l.value) === String(subtaskPayload.language_id))?.label,
          }
          addItemToStore('subtasks', String(optimisticMainTaskId), optimisticSubtask)
                  // --- Patch Typesense store for subtask optimistic updates ---
        getTypesenseUpdater()?.(optimisticSubtask)
          // Set the subtasks query data for the optimistic main task ID for instant UI
          queryClient.setQueryData(['subtasks', optimisticMainTaskId], [optimisticRegularTask, optimisticSubtask])
          // Call onSuccess and close the form immediately after optimistic update
          handleSuccess(optimisticSubtask)
          // 4. Now do the real network requests in parallel
          // Create the real main task (no assignee/status)
          const { data: newMainTask, error: mainTaskError } = await supabase
            .from('tasks')
            .insert({
              title: optimisticMainTask.title,
              content_type_id: 39,
              project_id_int: parentTask.project_id_int,
            })
            .select('id, title, content_type_id, project_id_int')
            .single()
          if (mainTaskError || !newMainTask) throw mainTaskError || new Error('Failed to create main task')
          const newMainTaskId = newMainTask.id
          // Expand the real main task
          onMainTaskCreated?.(newMainTaskId)
          // Update the regular task and create the new subtask in parallel
          const [_, newTask] = await Promise.all([
            supabase
              .from('tasks')
              .update({ parent_task_id_int: newMainTaskId })
              .eq('id', parentTaskId),
            addTask(subtaskPayload as any)
          ])
          // Fetch the real joined data for the new main, regular, and subtask
          const [{ data: joinedMain }, { data: joinedRegular }, { data: joinedSubtask }] = await Promise.all([
            supabase
              .from('tasks')
              .select(`id, title, content_type_id, delivery_date, publication_date, updated_at,
                assigned_user:users!fk_tasks_assigned_to_id(id,full_name),
                projects:projects!project_id_int(id,name,color),
                project_statuses:project_statuses!project_status_id(id,name,color),
                content_type_title, production_type_title, language_code, parent_task_id_int`)
              .eq('id', newMainTaskId)
              .single(),
            supabase
              .from('tasks')
              .select(`id, title, content_type_id, delivery_date, publication_date, updated_at,
                assigned_user:users!fk_tasks_assigned_to_id(id,full_name),
                projects:projects!project_id_int(id,name,color),
                project_statuses:project_statuses!project_status_id(id,name,color),
                content_type_title, production_type_title, language_code, parent_task_id_int`)
              .eq('id', parentTaskId)
              .single(),
            supabase
              .from('tasks')
              .select(`id, title, content_type_id, delivery_date, publication_date, updated_at,
                assigned_user:users!fk_tasks_assigned_to_id(id,full_name),
                projects:projects!project_id_int(id,name,color),
                project_statuses:project_statuses!project_status_id(id,name,color),
                content_type_title, production_type_title, language_code, parent_task_id_int`)
              .eq('id', newTask.id)
              .single(),
          ])
          // 5. Replace the optimistic main task with the real one
          removeItemFromStore('tasks', undefined, optimisticMainTaskId)
          if (joinedMain) addItemToStore('tasks', undefined, joinedMain)
          // Move the regular task to the real main task's subtasks
          removeItemFromStore('subtasks', String(optimisticMainTaskId), parentTaskId)
          if (joinedRegular) addItemToStore('subtasks', String(newMainTaskId), joinedRegular)
          // Move the subtask to the real main task's subtasks
          removeItemFromStore('subtasks', String(optimisticMainTaskId), optimisticSubtask.id)
          if (joinedSubtask) addItemToStore('subtasks', String(newMainTaskId), joinedSubtask)
          // Set the subtasks query data for the real main task ID for instant UI
          if (joinedRegular && joinedSubtask) {
            queryClient.setQueryData(['subtasks', newMainTaskId], [joinedRegular, joinedSubtask])
          }
          // Invalidate the subtasks query for the new main task to force re-render
          queryClient.invalidateQueries({ queryKey: ['subtasks', newMainTaskId] })
          handleSuccess(joinedSubtask)
          return
        }
        // If already a main task, fall through to normal logic
      }
      // If adding a subtask to an existing main task, hydrate optimistic subtask for instant UI
      const payload = cleanPayload({
        ...values,
        delivery_date: values.delivery_date || null,
        publication_date: values.publication_date || null,
      });
      let newTask: any;
      let subtaskPayload = cleanPayload({
        ...payload,
        assigned_to_id: values.assigned_to_id,
        project_id_int: values.project_id_int,
        content_type_id: values.content_type_id,
        production_type_id: values.production_type_id,
        language_id: values.language_id,
        project_status_id: values.project_status_id,
      });
      if (parentTaskId) {
        subtaskPayload = { ...subtaskPayload, parent_task_id_int: String(parentTaskId) }
        newTask = await addTask(subtaskPayload as any)
        const hydratedOptimisticSubtask = {
          ...newTask,
          assigned_user: options?.users?.find(u => String(u.value) === String(newTask.assigned_to_id))
            ? { id: newTask.assigned_to_id, full_name: options.users.find(u => String(u.value) === String(newTask.assigned_to_id))?.label }
            : null,
          projects: options?.projects?.find(p => String(p.value) === String(newTask.project_id_int))
            ? { id: newTask.project_id_int, name: options.projects.find(p => String(p.value) === String(newTask.project_id_int))?.label }
            : null,
          project_statuses: projectStatuses?.find(s => String(s.value) === String(newTask.project_status_id))
            ? { id: newTask.project_status_id, name: projectStatuses.find(s => String(s.value) === String(newTask.project_status_id))?.label, color: projectStatuses.find(s => String(s.value) === String(newTask.project_status_id))?.color }
            : null,
          content_type_title: options?.contentTypes?.find(ct => String(ct.value) === String(newTask.content_type_id))?.label,
          production_type_title: options?.productionTypes?.find(pt => String(pt.value) === String(newTask.production_type_id))?.label,
          language_code: options?.languages?.find(l => String(l.value) === String(newTask.language_id))?.label,
        }
        addItemToStore('subtasks', String(parentTaskId), hydratedOptimisticSubtask)
        // --- Patch all caches for subtasks ---
        updateTaskInCaches(queryClient, normalizeTask(hydratedOptimisticSubtask))
        // --- Patch Typesense store for subtask list optimistic updates ---
        getTypesenseUpdater()?.(hydratedOptimisticSubtask)
        queryClient.invalidateQueries({ queryKey: ['subtasks', parentTaskId] })
        handleSuccess(hydratedOptimisticSubtask) // Open details pane for the new task
      } else {
        newTask = await addTask(subtaskPayload as any)
        // --- Hydrate all fields for optimistic update ---
        const hydratedOptimisticTask = {
          ...newTask,
          assigned_user: options?.users?.find(u => String(u.value) === String(newTask.assigned_to_id))
            ? { id: newTask.assigned_to_id, full_name: options.users.find(u => String(u.value) === String(newTask.assigned_to_id))?.label }
            : null,
          projects: options?.projects?.find(p => String(p.value) === String(newTask.project_id_int))
            ? { id: newTask.project_id_int, name: options.projects.find(p => String(p.value) === String(newTask.project_id_int))?.label }
            : null,
          project_statuses: projectStatuses?.find(s => String(s.value) === String(newTask.project_status_id))
            ? { id: newTask.project_status_id, name: projectStatuses.find(s => String(s.value) === String(newTask.project_status_id))?.label, color: projectStatuses.find(s => String(s.value) === String(newTask.project_status_id))?.color }
            : null,
          content_type_title: options?.contentTypes?.find(ct => String(ct.value) === String(newTask.content_type_id))?.label,
          production_type_title: options?.productionTypes?.find(pt => String(pt.value) === String(newTask.production_type_id))?.label,
          language_code: options?.languages?.find(l => String(l.value) === String(newTask.language_id))?.label,
        }
        addItemToStore('tasks', undefined, hydratedOptimisticTask)
        // --- Patch all caches for tasks (list, kanban, calendar) ---
        updateTaskInCaches(queryClient, normalizeTask(hydratedOptimisticTask))
        // --- Patch grouped (left pane) caches so grouped list updates instantly ---
        addTaskToGroupedTaskCaches(hydratedOptimisticTask)
        // --- Patch calendar caches for new task optimistic updates ---
        addTaskToCalendarCaches(queryClient, hydratedOptimisticTask)
        // --- Patch Kanban caches for new task optimistic updates ---
        addTaskToKanbanCaches(queryClient, hydratedOptimisticTask)
        // --- Patch Typesense store for task list optimistic updates ---
        getTypesenseUpdater()?.(hydratedOptimisticTask)
        // --- Patch Kanban infinite query cache for all groupBy/sortField/sortOrder combinations ---
        const kanbanKeys = [
          'project_status_name', 'assigned_to_name', 'project_name', 'delivery_date', 'publication_date', 'content_type_title', 'production_type_title', 'channel_names'
        ];
        const sortFields = ['updated_at', 'publication_date', 'delivery_date', 'created_at'];
        const sortOrders = ['asc', 'desc'];
        kanbanKeys.forEach(gb => {
          sortFields.forEach(sf => {
            sortOrders.forEach(so => {
              queryClient.setQueryData(['kanban-tasks', gb, undefined, undefined, sf, so], (old: any) => {
                if (!old) return { pages: [[hydratedOptimisticTask]], pageParams: [0] };
                if ('pages' in old && Array.isArray(old.pages)) {
                  // If already present, update in-place; else insert at top
                  const firstPage = old.pages[0] || [];
                  const idx = firstPage.findIndex((t: any) => String(t.id) === String(hydratedOptimisticTask.id));
                  let newFirstPage;
                  if (idx === -1) {
                    newFirstPage = [hydratedOptimisticTask, ...firstPage];
                  } else {
                    newFirstPage = [...firstPage];
                    newFirstPage[idx] = hydratedOptimisticTask;
                  }
                  return {
                    ...old,
                    pages: [
                      newFirstPage,
                      ...old.pages.slice(1)
                    ],
                  };
                }
                return old;
              });
            });
          });
        });
        handleSuccess(hydratedOptimisticTask)
      }

      if (pendingFiles.length > 0 && newTask?.id) {
        setUploading(true);
        setUploadError(null);
        try {
          const supabase = createClientComponentClient();
          for (const file of pendingFiles) {
            const filePath = `${newTask.id}/${Date.now()}-${file.name}`;
            const { error: uploadError } = await supabase.storage.from('attachments').upload(filePath, file);
            if (uploadError) throw uploadError;
            const { error: dbError } = await supabase.from('attachments').insert({
              table_name: 'tasks',
              record_id: String(newTask.id),
              file_name: file.name,
              file_path: filePath,
              mime_type: file.type,
              size: file.size,
            });
            if (dbError) throw dbError;
          }
          setPendingFiles([]);
        } catch (err: any) {
          setUploadError(err.message || 'Attachment upload failed');
        } finally {
          setUploading(false);
        }
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to add task');
    }
  }

  // Reset tracking state when form is reset
  useEffect(() => {
    return () => {
      // Reset tracking state on unmount
      setHasSetInitialTypes(false);
      lastApiCallRef.current = '';
    };
  }, []);

  // Show a minimal loading state only if absolutely necessary
  if (!options) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-32"></div>
          <div className="h-4 bg-gray-200 rounded w-24"></div>
          <div className="h-4 bg-gray-200 rounded w-28"></div>
        </div>
      </div>
    )
  }

  const selectedWatcherItems = projectWatchers.filter(w => (selectedWatchers || []).includes(w.value))
  const filteredWatcherItems = projectWatchers.filter((w) =>
    w.label.toLowerCase().includes(watcherSearch.toLowerCase())
  )
  const selectedProject = uniqueProjects.find((p) => String(p.value) === String(watch('project_id_int')))
  const selectedStatus = filteredStatuses.find((s) => String(s.value) === String(watch('project_status_id')))
  const selectedAssignee = uniqueAssignees.find((u) => String(u.value) === String(watch('assigned_to_id')))
  const selectedLanguage = uniqueLanguages.find((l) => String(l.value) === String(watch('language_id')))
  const selectedChannels = effectiveChannelOptions.filter((opt) => (watch('channels') || []).includes(opt.id))
  const languageCode = (() => {
    if (!selectedLanguage?.label) return 'LA'
    const words = selectedLanguage.label.trim().split(/\s+/).filter(Boolean)
    if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase()
    return selectedLanguage.label.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || 'LA'
  })()
  const dateChip = (() => {
    const fallback = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
    const source = watch('publication_date') || fallback.toISOString().slice(0, 10)
    const d = new Date(source)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).replace(' ', '/')
  })()
  const getInitials = (name: string) =>
    name
      .split(' ')
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()

  const toggleWatcher = (watcherId: string) => {
    const current = new Set(selectedWatchers || [])
    if (current.has(watcherId)) current.delete(watcherId)
    else current.add(watcherId)
    setValue('watchers', Array.from(current), { shouldDirty: true })
  }

  const toggleChannel = (channelId: string) => {
    const current = new Set((watch('channels') || []) as string[])
    if (current.has(channelId)) current.delete(channelId)
    else current.add(channelId)
    setValue('channels', Array.from(current), { shouldDirty: true })
  }

  useEffect(() => {
    if (variant !== 'composer' || (!activeDetailPanel && !statusExpanded)) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      const panel = detailPanelRef.current
      const icons = iconRowRef.current
      const statusPanel = statusPanelRef.current
      if (panel?.contains(target) || icons?.contains(target) || statusPanel?.contains(target)) return
      setActiveDetailPanel(null)
      setAssigneeExpanded(false)
      setChannelsExpanded(false)
      setAttachmentsExpanded(false)
      setProjectExpanded(false)
      setStatusExpanded(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [variant, activeDetailPanel, statusExpanded])

  return (
    <FormProvider {...methods}>
      <div
        className={cn(
          "min-w-0 flex flex-col bg-white",
          isModal ? "h-full" : "h-screen"
        )}
        style={{ boxSizing: 'border-box' }}
      >
        {/* Show header only when not in modal context and not in composer (composer has its own header) */}
        {!isModal && variant !== 'composer' && (
          <div className="sticky top-0 z-10 bg-white py-4 px-6 flex items-center justify-between relative min-w-0 w-full">
            <h2 className="text-lg font-semibold">Add Task</h2>
            {onClose && (
              <button
                className="text-gray-500 hover:text-black text-2xl font-bold"
                onClick={onClose}
                aria-label="Close"
                type="button"
              >
                ×
              </button>
            )}
          </div>
        )}
        {children}
        <div className={cn("flex-1 min-h-0", isModal ? "" : "overflow-y-auto")}>
          <form ref={formRef} onSubmit={handleSubmit(onSubmit)} className={cn("space-y-4 px-6 w-full min-w-0 flex flex-col h-full", isModal ? "pt-4 pb-4" : "pt-2 pb-4 overflow-y-auto", variant === 'composer' && "relative")}>
            {/* Stage 1: Title, Project, Status, Briefing (composer) or full form (default) */}
            {/* Title */}
            <div className="w-full">
              {variant !== 'composer' && <label className="block text-sm font-medium mb-1">Title *</label>}
              <Input {...register("title")}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                placeholder="Write an exciting title"
              />
              {errors.title && <div className="text-red-500 text-xs mt-1">{errors.title.message}</div>}
            </div>
            {/* Project */}
            {variant !== 'composer' && <div className="w-full">
              <label className="block text-sm font-medium mb-1">Project</label>
              <button
                type="button"
                disabled={!!parentTaskId}
                onClick={() => !parentTaskId && setProjectExpanded((v) => !v)}
                className="w-full min-h-[40px] px-3 py-2 border rounded-md text-left hover:bg-gray-50 transition flex items-center justify-between disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="min-w-0">
                  {selectedProject ? (
                    <ProjectBadge
                      name={selectedProject.label}
                      logoUrl={getImageUrl((selectedProject as any).logo)}
                      color={(selectedProject as any).color ?? null}
                      size="sm"
                    />
                  ) : (
                    <span className="text-sm text-gray-500">Select project</span>
                  )}
                </div>
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>
              {projectExpanded && !parentTaskId && (
                <div className="mt-2 border rounded-md max-h-52 overflow-y-auto">
                  {uniqueProjects.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setValue('project_id_int', String(opt.value), { shouldDirty: true })
                        setProjectExpanded(false)
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                    >
                      <ProjectBadge
                        name={opt.label}
                        logoUrl={getImageUrl((opt as any).logo)}
                        color={(opt as any).color ?? null}
                        size="sm"
                      />
                      {String(opt.value) === String(watch('project_id_int')) && <Check className="w-4 h-4 text-gray-700" />}
                    </button>
                  ))}
                </div>
              )}
            </div>}
            {/* Task Watchers */}
            {variant !== 'composer' && <div className="w-full">
              <label className="block text-sm font-medium mb-1">Task Watchers</label>
              <button
                type="button"
                onClick={() => setWatchersExpanded((v) => !v)}
                className="w-full min-h-[40px] px-3 py-2 border rounded-md text-left hover:bg-gray-50 transition flex items-center justify-between"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  {selectedWatcherItems.length === 0 ? (
                    <span className="text-sm text-gray-500">No watchers selected</span>
                  ) : (
                    <div className="flex items-center gap-1">
                      {selectedWatcherItems.slice(0, 6).map((watcher) => (
                        <span
                          key={watcher.value}
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-[10px] text-gray-700 overflow-hidden"
                          title={watcher.label}
                        >
                          {watcher.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={watcher.photoUrl} alt={watcher.label} className="w-full h-full object-cover" />
                          ) : (
                            getInitials(watcher.label)
                          )}
                        </span>
                      ))}
                      {selectedWatcherItems.length > 6 && (
                        <span className="text-xs text-gray-500">+{selectedWatcherItems.length - 6}</span>
                      )}
                    </div>
                  )}
                </div>
                {watchersExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
              </button>
              {watchersExpanded && (
                <div className="mt-2 border rounded-md max-h-48 overflow-y-auto">
                  {projectWatchers.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">No project watchers available.</div>
                  ) : (
                    projectWatchers.map((watcher) => {
                      const isSelected = (selectedWatchers || []).includes(watcher.value)
                      return (
                        <button
                          key={watcher.value}
                          type="button"
                          onClick={() => toggleWatcher(watcher.value)}
                          className={cn(
                            "w-full px-3 py-2 text-left flex items-center justify-between hover:bg-gray-50",
                            isSelected && "bg-gray-50"
                          )}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-[10px] text-gray-700 overflow-hidden">
                              {watcher.photoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={watcher.photoUrl} alt={watcher.label} className="w-full h-full object-cover" />
                              ) : (
                                getInitials(watcher.label)
                              )}
                            </span>
                            <span className="text-sm text-gray-700 truncate">{watcher.label}</span>
                          </span>
                          <span className={cn("text-xs", isSelected ? "text-gray-900" : "text-gray-400")}>
                            {isSelected ? "Selected" : "Add"}
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </div>}
            {/* Status - moved up for composer Stage 1 */}
            {variant === 'composer' && (
              <div ref={statusPanelRef} className="w-full">
                <button
                  type="button"
                  onClick={() => setStatusExpanded((v) => !v)}
                  className="w-full min-h-[40px] px-3 py-2 border rounded-md text-left hover:bg-gray-50 transition flex items-center justify-between"
                >
                  {selectedStatus ? (
                    <span
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                      style={{ backgroundColor: `${selectedStatus.color || '#e5e7eb'}22`, color: selectedStatus.color || '#374151' }}
                    >
                      {selectedStatus.label}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-500">Select status</span>
                  )}
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                </button>
                {statusExpanded && (
                  <div className="mt-2 border rounded-md max-h-52 overflow-y-auto">
                    {filteredStatuses.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setValue('project_status_id', String(opt.value), { shouldDirty: true })
                          setStatusExpanded(false)
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                      >
                        <span
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                          style={{ backgroundColor: `${opt.color || '#e5e7eb'}22`, color: opt.color || '#374151' }}
                        >
                          {opt.label}
                        </span>
                        {String(opt.value) === String(watch('project_status_id')) && <Check className="w-4 h-4 text-gray-700" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Briefing - Stage 1 for composer */}
            {variant === 'composer' && (
              <div className="w-full">
                <Controller
                  control={methods.control}
                  name="briefing"
                  render={({ field }) => (
                    <RichTextEditor
                      value={field.value || ''}
                      onChange={field.onChange}
                      placeholder="Add briefing..."
                      height={220}
                      fontSize={16}
                      toolbarId="ql-toolbar-rich-briefing-composer"
                    />
                  )}
                />
              </div>
            )}
            {/* Composer details area controlled by footer icon row */}
            {variant === 'composer' && activeDetailPanel && (
              <div ref={detailPanelRef} className="absolute bottom-[118px] left-6 right-6 z-20">
                <div className="px-3 pb-3 pt-3 space-y-4 border rounded-md bg-white shadow-lg">
                    {activeDetailPanel === 'project' && <div className="w-full border rounded-md max-h-52 overflow-y-auto">
                      {uniqueProjects.map((opt) => (
                        <button
                          key={`overlay-project-${opt.value}`}
                          type="button"
                          onClick={() => {
                            setValue('project_id_int', String(opt.value), { shouldDirty: true })
                            setActiveDetailPanel(null)
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                        >
                          <ProjectBadge
                            name={opt.label}
                            logoUrl={getImageUrl((opt as any).logo)}
                            color={(opt as any).color ?? null}
                            size="sm"
                          />
                          {String(opt.value) === String(watch('project_id_int')) && <Check className="w-4 h-4 text-gray-700" />}
                        </button>
                      ))}
                    </div>}
                    {activeDetailPanel === 'assignee' && <div className="w-full border rounded-md max-h-52 overflow-y-auto">
                      {uniqueAssignees.map((opt) => (
                        <button
                          key={`overlay-assignee-${opt.value}`}
                          type="button"
                          onClick={() => {
                            setValue('assigned_to_id', String(opt.value), { shouldDirty: true })
                            setActiveDetailPanel(null)
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                        >
                          <span className="inline-flex items-center gap-2">
                            <UserAvatar name={opt.label} photoUrl={getImageUrl((opt as any).photo)} size="sm" />
                            <span className="text-sm text-gray-800">{opt.label}</span>
                          </span>
                          {String(opt.value) === String(watch('assigned_to_id')) && <Check className="w-4 h-4 text-gray-700" />}
                        </button>
                      ))}
                    </div>}
                    {activeDetailPanel === 'dates' && <div className="w-full space-y-3">
                      <div className="inline-flex rounded-md border p-0.5">
                        <button
                          type="button"
                          onClick={() => setDatePanelMode('delivery')}
                          className={cn(
                            "px-2 py-1 text-xs rounded",
                            datePanelMode === 'delivery' ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50"
                          )}
                        >
                          Delivery
                        </button>
                        <button
                          type="button"
                          onClick={() => setDatePanelMode('publication')}
                          className={cn(
                            "px-2 py-1 text-xs rounded",
                            datePanelMode === 'publication' ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50"
                          )}
                        >
                          Publication
                        </button>
                      </div>
                      {datePanelMode === 'delivery' ? (
                        <div className="w-full">
                          <label className="block text-sm font-medium mb-1">Delivery Date</label>
                          <Controller
                            control={methods.control}
                            name="delivery_date"
                            render={({ field }) => (
                              <OccupationAwareDatePicker
                                value={field.value ?? ''}
                                onChange={field.onChange}
                                userId={watch('assigned_to_id')}
                                contentTypeId={watch('content_type_id')}
                                productionTypeId={watch('production_type_id')}
                                placeholder="Select delivery date"
                                className="w-full text-sm"
                              />
                            )}
                          />
                          <div className="mt-2">
                            <OccupationAwarenessDisplay
                              userId={watch('assigned_to_id')}
                              contentTypeId={watch('content_type_id')}
                              productionTypeId={watch('production_type_id')}
                              deliveryDate={watch('delivery_date')}
                              onDateSelect={(date) => setValue('delivery_date', date)}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="w-full">
                          <label className="block text-sm font-medium mb-1">Publication Date</label>
                          <Controller
                            control={methods.control}
                            name="publication_date"
                            render={({ field }) => (
                              <input
                                type="date"
                                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                                value={field.value ?? ''}
                                min={new Date().toISOString().slice(0, 10)}
                                onChange={e => field.onChange(e.target.value)}
                              />
                            )}
                          />
                        </div>
                      )}
                    </div>}
                    {activeDetailPanel === 'types' && <div className="w-full">
                      <label className="block text-sm font-medium mb-1">Content Type</label>
                      <select {...register("content_type_id")} className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-200">
                        <option value="">Select content type</option>
                        {uniqueContentTypes.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>}
                    {activeDetailPanel === 'types' && <div className="w-full">
                      <label className="block text-sm font-medium mb-1">Production Type</label>
                      <select {...register("production_type_id")} className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-200">
                        <option value="">Select production type</option>
                        {uniqueProductionTypes.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>}
                    {activeDetailPanel === 'language' && <div className="w-full border rounded-md max-h-52 overflow-y-auto">
                      {uniqueLanguages.map((opt) => (
                        <button
                          key={`overlay-language-${opt.value}`}
                          type="button"
                          onClick={() => setValue('language_id', String(opt.value), { shouldDirty: true })}
                          className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                        >
                          <span className="text-sm text-gray-800">{opt.label}</span>
                          {String(opt.value) === String(watch('language_id')) && <Check className="w-4 h-4 text-gray-700" />}
                        </button>
                      ))}
                    </div>}
                    {activeDetailPanel === 'channels' && <div className="w-full border rounded-md max-h-52 overflow-y-auto">
                      {effectiveChannelOptions.map((opt) => {
                        const active = (watch('channels') || []).includes(opt.id)
                        return (
                          <button
                            key={`overlay-channel-${opt.id}`}
                            type="button"
                            onClick={() => toggleChannel(opt.id)}
                            className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                          >
                            <span className="text-sm text-gray-800">{opt.label}</span>
                            {active && <Check className="w-4 h-4 text-gray-700" />}
                          </button>
                        )
                      })}
                    </div>}
                    {activeDetailPanel === 'attachments' && <div className="w-full">
                      <button
                        type="button"
                        onClick={() => setAttachmentsExpanded((v) => !v)}
                        className="inline-flex items-center gap-2 px-3 py-2 border rounded-md hover:bg-gray-50"
                      >
                        <Paperclip className="w-4 h-4 text-gray-600" />
                        <span className="text-sm text-gray-700">
                          {pendingFiles.length > 0 ? `Attachments (${pendingFiles.length})` : "Add attachments"}
                        </span>
                      </button>
                      {attachmentsExpanded && (
                        <div className="mt-2">
                          <Dropzone
                            tableName="tasks"
                            recordId={''}
                            attachments={[]}
                            signedUrls={{}}
                            isUploading={uploading}
                            uploadError={uploadError}
                            uploadFiles={handleDropzoneFiles}
                            deleteAttachment={att => handleRemoveFile(att as unknown as File)}
                            onChange={() => {}}
                          />
                          {pendingFiles.length > 0 && (
                            <ul className="mt-2 space-y-1 text-sm">
                              {pendingFiles.map((file, idx) => (
                                <li key={file.name + idx} className="flex items-center gap-2">
                                  <span>{file.name}</span>
                                  <button type="button" className="ml-2 text-xs text-red-500" onClick={() => handleRemoveFile(file)}>Remove</button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>}
                    {activeDetailPanel === 'watchers' && <div className="w-full">
                      <div className="border rounded-md max-h-44 overflow-y-auto">
                        <div className="p-2 border-b">
                          <Input
                            value={watcherSearch}
                            onChange={(e) => setWatcherSearch(e.target.value)}
                            placeholder="Search watchers"
                            className="h-8"
                          />
                        </div>
                        {filteredWatcherItems.map((watcher) => {
                          const isSelected = (selectedWatchers || []).includes(watcher.value)
                          return (
                            <button
                              key={`overlay-watcher-${watcher.value}`}
                              type="button"
                              onClick={() => toggleWatcher(watcher.value)}
                              className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                            >
                              <span className="inline-flex items-center gap-2">
                                <UserAvatar name={watcher.label} photoUrl={watcher.photoUrl ?? null} size="sm" />
                                <span className="text-sm text-gray-800">{watcher.label}</span>
                              </span>
                              {isSelected && <Check className="w-4 h-4 text-gray-700" />}
                            </button>
                          )
                        })}
                      </div>
                    </div>}
                  </div>
              </div>
            )}
            {/* Default variant: full form fields */}
            {variant === 'default' && (
              <>
                <div className="w-full">
                  <label className="block text-sm font-medium mb-1">Assignee</label>
                  <button
                    type="button"
                    onClick={() => setAssigneeExpanded((v) => !v)}
                    className="w-full min-h-[40px] px-3 py-2 border rounded-md text-left hover:bg-gray-50 transition flex items-center justify-between"
                  >
                    {selectedAssignee ? (
                      <span className="inline-flex items-center gap-2">
                        <UserAvatar name={selectedAssignee.label} photoUrl={getImageUrl((selectedAssignee as any).photo)} size="sm" />
                        <span className="text-sm text-gray-800">{selectedAssignee.label}</span>
                      </span>
                    ) : (
                      <span className="text-sm text-gray-500">Select assignee</span>
                    )}
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  </button>
                  {assigneeExpanded && (
                    <div className="mt-2 border rounded-md max-h-52 overflow-y-auto">
                      {uniqueAssignees.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setValue('assigned_to_id', String(opt.value), { shouldDirty: true })
                            setAssigneeExpanded(false)
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                        >
                          <span className="inline-flex items-center gap-2">
                            <UserAvatar name={opt.label} photoUrl={getImageUrl((opt as any).photo)} size="sm" />
                            <span className="text-sm text-gray-800">{opt.label}</span>
                          </span>
                          {String(opt.value) === String(watch('assigned_to_id')) && <Check className="w-4 h-4 text-gray-700" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="w-full">
                  <label className="block text-sm font-medium mb-1">Delivery Date</label>
                  <Controller
                    control={methods.control}
                    name="delivery_date"
                    render={({ field }) => (
                      <OccupationAwareDatePicker
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        userId={watch('assigned_to_id')}
                        contentTypeId={watch('content_type_id')}
                        productionTypeId={watch('production_type_id')}
                        placeholder="Select delivery date"
                        className="w-full"
                      />
                    )}
                  />
                  <div className="mt-2">
                    <OccupationAwarenessDisplay
                      userId={watch('assigned_to_id')}
                      contentTypeId={watch('content_type_id')}
                      productionTypeId={watch('production_type_id')}
                      deliveryDate={watch('delivery_date')}
                      onDateSelect={(date) => setValue('delivery_date', date)}
                    />
                  </div>
                </div>
                <div className="w-full">
                  <label className="block text-sm font-medium mb-1">Publication Date</label>
                  <Controller
                    control={methods.control}
                    name="publication_date"
                    render={({ field }) => (
                      <input
                        type="date"
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
                        value={field.value ?? ''}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={e => field.onChange(e.target.value)}
                      />
                    )}
                  />
                </div>
                <div className="w-full">
                  <label className="block text-sm font-medium mb-1">Content Type</label>
                  <select {...register("content_type_id")} className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200">
                    <option value="">Select content type</option>
                    {uniqueContentTypes.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="w-full">
                  <label className="block text-sm font-medium mb-1">Production Type</label>
                  <select {...register("production_type_id")} className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200">
                    <option value="">Select production type</option>
                    {uniqueProductionTypes.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="w-full">
                  <label className="block text-sm font-medium mb-1">Language</label>
                  <select {...register("language_id")} className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200">
                    <option value="">Select language</option>
                    {uniqueLanguages.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="w-full">
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <button
                    type="button"
                    onClick={() => setStatusExpanded((v) => !v)}
                    className="w-full min-h-[40px] px-3 py-2 border rounded-md text-left hover:bg-gray-50 transition flex items-center justify-between"
                  >
                    {selectedStatus ? (
                      <span
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                        style={{ backgroundColor: `${selectedStatus.color || '#e5e7eb'}22`, color: selectedStatus.color || '#374151' }}
                      >
                        {selectedStatus.label}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-500">Select status</span>
                    )}
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  </button>
                  {statusExpanded && (
                    <div className="mt-2 border rounded-md max-h-52 overflow-y-auto">
                      {filteredStatuses.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setValue('project_status_id', String(opt.value), { shouldDirty: true })
                            setStatusExpanded(false)
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                        >
                          <span
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                            style={{ backgroundColor: `${opt.color || '#e5e7eb'}22`, color: opt.color || '#374151' }}
                          >
                            {opt.label}
                          </span>
                          {String(opt.value) === String(watch('project_status_id')) && <Check className="w-4 h-4 text-gray-700" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="w-full">
                  <label className="block text-sm font-medium mb-1">Channels</label>
                  <button
                    type="button"
                    onClick={() => setChannelsExpanded((v) => !v)}
                    className="w-full min-h-[40px] px-3 py-2 border rounded-md text-left hover:bg-gray-50 transition flex items-center justify-between"
                  >
                    <span className="text-sm text-gray-700">
                      {selectedChannels.length > 0 ? `${selectedChannels.length} selected` : "Select channels"}
                    </span>
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  </button>
                  {channelsExpanded && (
                    <div className="mt-2 border rounded-md max-h-52 overflow-y-auto">
                      {effectiveChannelOptions.map((opt) => {
                        const active = (watch('channels') || []).includes(opt.id)
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggleChannel(opt.id)}
                            className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                          >
                            <span className="text-sm text-gray-800">{opt.label}</span>
                            {active && <Check className="w-4 h-4 text-gray-700" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div className="w-full">
                  <label className="block text-sm font-medium mb-1">Briefing</label>
                  <Controller
                    control={methods.control}
                    name="briefing"
                    render={({ field }) => (
                      <RichTextEditor
                        value={field.value || ''}
                        onChange={field.onChange}
                        placeholder="Add briefing..."
                        fontSize={16}
                        toolbarId="ql-toolbar-rich-briefing"
                      />
                    )}
                  />
                </div>
                <div className="w-full">
                  <button
                    type="button"
                    onClick={() => setAttachmentsExpanded((v) => !v)}
                    className="inline-flex items-center gap-2 px-3 py-2 border rounded-md hover:bg-gray-50"
                  >
                    <Paperclip className="w-4 h-4 text-gray-600" />
                    <span className="text-sm text-gray-700">
                      {pendingFiles.length > 0 ? `Attachments (${pendingFiles.length})` : "Add attachments"}
                    </span>
                  </button>
                  {attachmentsExpanded && (
                    <div className="mt-2">
                      <Dropzone
                        tableName="tasks"
                        recordId={''}
                        attachments={[]}
                        signedUrls={{}}
                        isUploading={uploading}
                        uploadError={uploadError}
                        uploadFiles={handleDropzoneFiles}
                        deleteAttachment={att => handleRemoveFile(att as unknown as File)}
                        onChange={() => {}}
                      />
                      {pendingFiles.length > 0 && (
                        <ul className="mt-2 space-y-1 text-sm">
                          {pendingFiles.map((file, idx) => (
                            <li key={file.name + idx} className="flex items-center gap-2">
                              <span>{file.name}</span>
                              <button type="button" className="ml-2 text-xs text-red-500" onClick={() => handleRemoveFile(file)}>Remove</button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
            {variant === 'composer' && (
              <div className="pt-2 space-y-2">
                <div ref={iconRowRef} className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={!!parentTaskId}
                      onClick={() => !parentTaskId && setActiveDetailPanel((p) => (p === 'project' ? null : 'project'))}
                      className={cn("h-6 w-6 inline-flex items-center justify-center rounded hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed", activeDetailPanel === 'project' && "bg-gray-100")}
                      title="Project"
                    >
                      {selectedProject ? (
                        <span
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 overflow-hidden text-[10px] text-gray-700"
                          title={selectedProject.label}
                        >
                          {getImageUrl((selectedProject as any).logo) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={getImageUrl((selectedProject as any).logo)!} alt={selectedProject.label} className="w-full h-full object-cover" />
                          ) : (
                            getInitials(selectedProject.label)
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border text-[10px] text-gray-500">P</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDetailPanel((p) => (p === 'assignee' ? null : 'assignee'))}
                      className={cn("h-6 w-6 inline-flex items-center justify-center rounded hover:bg-gray-100", activeDetailPanel === 'assignee' && "bg-gray-100")}
                      title="Assignee"
                    >
                      {selectedAssignee ? (
                        <span
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 overflow-hidden text-[10px] text-gray-700"
                          title={selectedAssignee.label}
                        >
                          {getImageUrl((selectedAssignee as any).photo) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={getImageUrl((selectedAssignee as any).photo)!}
                              alt={selectedAssignee.label}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            getInitials(selectedAssignee.label)
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border text-[10px] text-gray-500">A</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDatePanelMode('delivery')
                        setActiveDetailPanel((p) => (p === 'dates' ? null : 'dates'))
                      }}
                      className={cn("h-6 inline-flex items-center gap-1 px-2 rounded hover:bg-gray-100 text-xs text-gray-700", activeDetailPanel === 'dates' && "bg-gray-100")}
                      title="Dates"
                    >
                      <Calendar className="w-3.5 h-3.5 text-gray-600" />
                      <span>{dateChip || '--/---'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDetailPanel((p) => (p === 'types' ? null : 'types'))}
                      className={cn("h-6 w-6 inline-flex items-center justify-center rounded hover:bg-gray-100", activeDetailPanel === 'types' && "bg-gray-100")}
                      title="Types"
                    >
                      <Tag className="w-4 h-4 text-gray-600" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDetailPanel((p) => (p === 'language' ? null : 'language'))}
                      className={cn("h-6 min-w-6 px-1 inline-flex items-center justify-center rounded hover:bg-gray-100 text-[10px] font-semibold text-gray-700", activeDetailPanel === 'language' && "bg-gray-100")}
                      title="Language"
                    >
                      {languageCode}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDetailPanel((p) => (p === 'channels' ? null : 'channels'))}
                      className={cn("h-6 w-6 inline-flex items-center justify-center rounded hover:bg-gray-100", activeDetailPanel === 'channels' && "bg-gray-100")}
                      title="Channels"
                    >
                      <Check className="w-4 h-4 text-gray-600" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDetailPanel((p) => (p === 'attachments' ? null : 'attachments'))}
                      className={cn("h-6 w-6 inline-flex items-center justify-center rounded hover:bg-gray-100", activeDetailPanel === 'attachments' && "bg-gray-100")}
                      title="Attachments"
                    >
                      <Paperclip className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>

                  <div className="flex min-w-0 flex-shrink-0 items-center gap-1">
                    <span className="px-1 text-gray-300 select-none" aria-hidden="true">|</span>
                    {selectedWatcherItems.slice(0, 2).map((watcher) => (
                      <span
                        key={`footer-watcher-${watcher.value}`}
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 overflow-hidden"
                        title={watcher.label}
                      >
                        {watcher.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={watcher.photoUrl} alt={watcher.label} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] text-gray-700">{getInitials(watcher.label)}</span>
                        )}
                      </span>
                    ))}
                    {selectedWatcherItems.length > 2 && (
                      <span
                        className="inline-flex items-center justify-center h-6 min-w-6 px-1 rounded-full border text-[10px] text-gray-600"
                        title={`${selectedWatcherItems.length - 2} more watchers`}
                      >
                        +{selectedWatcherItems.length - 2}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveDetailPanel((p) => (p === 'watchers' ? null : 'watchers'))}
                      className="inline-flex items-center justify-center w-6 h-6 rounded-full border hover:bg-gray-50"
                      title="Add/remove task watchers"
                    >
                      <Plus className="w-3.5 h-3.5 text-gray-600" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className={cn("flex gap-2 justify-end pt-4", variant === 'composer' && "flex-wrap")}>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Adding..." : variant === 'composer' ? "Create" : "Add Task"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </FormProvider>
  )
} 