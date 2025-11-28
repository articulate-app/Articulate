import { storeRegistry, removeItemFromStore, updateItemInStore } from '../../../hooks/use-infinite-query'
import { QueryClient } from '@tanstack/react-query'
import { removeTaskFromTypesenseStore } from '../../store/typesense-tasks'

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

/**
 * Remove a task from all InfiniteList caches (all filters/pagination).
 * Ensures the task disappears instantly regardless of filters or pagination.
 */
export function removeTaskFromAllStores(taskId: number) {
  if (typeof window === 'undefined') return;
  
  // Remove from InfiniteList stores
  Object.keys(storeRegistry).forEach(key => {
    if (key.startsWith('tasks')) {
      removeItemFromStore('tasks', key.includes('::') ? key.split('::')[1] : undefined, taskId)
    }
  })
  
  // Remove from Typesense store
  removeTaskFromTypesenseStore(taskId);
}

/**
 * Update a task in all InfiniteList caches (all filters/pagination).
 * Ensures the task is updated instantly regardless of filters or pagination.
 * Updates both flat and joined fields for compatibility with list row structure.
 * Adds logging and always creates new object references for patched task and data array.
 */
export function updateTaskInAllStores(updatedTask: any) {
  if (typeof window === 'undefined') return;
  Object.keys(storeRegistry).forEach(key => {
    if (key.startsWith('tasks')) {
      const store = storeRegistry[key];
      if (!store) return;
      const state = store.getState();
      const idx = state.data.findIndex((item: any) => String(item.id) === String(updatedTask.id));
      if (idx === -1) return;
      const oldTask = state.data[idx];
      // Patch both flat and joined fields
      const patchedTask = {
        ...oldTask,
        ...updatedTask,
        assigned_user: updatedTask.assigned_to_id
          ? { id: updatedTask.assigned_to_id, full_name: updatedTask.assigned_to_name }
          : oldTask.assigned_user,
        projects: updatedTask.project_id_int
          ? { id: updatedTask.project_id_int, name: updatedTask.project_name, color: updatedTask.project_color }
          : oldTask.projects,
        project_statuses: updatedTask.project_status_id
          ? { id: updatedTask.project_status_id, name: updatedTask.project_status_name, color: updatedTask.project_status_color }
          : oldTask.project_statuses,
        content_type_title: updatedTask.content_type_title ?? oldTask.content_type_title,
        production_type_title: updatedTask.production_type_title ?? oldTask.production_type_title,
        language_code: updatedTask.language_code ?? oldTask.language_code,
        delivery_date: updatedTask.delivery_date ?? oldTask.delivery_date,
        publication_date: updatedTask.publication_date ?? oldTask.publication_date,
        updated_at: updatedTask.updated_at ?? oldTask.updated_at,
        copy_post: updatedTask.copy_post ?? oldTask.copy_post,
        briefing: updatedTask.briefing ?? oldTask.briefing,
        notes: updatedTask.notes ?? oldTask.notes,
        is_overdue: updatedTask.is_overdue ?? oldTask.is_overdue,
        is_publication_overdue: updatedTask.is_publication_overdue ?? oldTask.is_publication_overdue,
        // Add more fields as needed
      };
      const newData = [...state.data];
      newData[idx] = patchedTask;
      if (process.env.NODE_ENV === 'development') {
        console.log('[updateTaskInAllStores] Patching task in store', { key, patchedTask });
      }
      store.setState({ data: newData });
    }
  })
}

/**
 * Update a task in all InfiniteList caches and the React Query detail cache.
 * Ensures both the list and the details pane are updated optimistically.
 * Pass the queryClient from useQueryClient.
 */
export function updateTaskInCaches(queryClient: QueryClient, updatedTask: any) {
  updateTaskInAllStores(updatedTask);
  if (queryClient && updatedTask && updatedTask.id) {
    // Patch the detail cache (['task', String(taskId)])
    queryClient.setQueryData(['task', String(updatedTask.id)], (old: any) => {
      if (!old) return updatedTask;
      // Patch both flat and joined fields for details view
      return {
        ...old,
        ...updatedTask,
        assigned_user: updatedTask.assigned_to_id
          ? { id: updatedTask.assigned_to_id, full_name: updatedTask.assigned_to_name }
          : old.assigned_user,
        projects: updatedTask.project_id_int
          ? { id: updatedTask.project_id_int, name: updatedTask.project_name, color: updatedTask.project_color }
          : old.projects,
        project_statuses: updatedTask.project_status_id
          ? { id: updatedTask.project_status_id, name: updatedTask.project_status_name, color: updatedTask.project_status_color }
          : old.project_statuses,
        content_type_title: updatedTask.content_type_title ?? old.content_type_title,
        production_type_title: updatedTask.production_type_title ?? old.production_type_title,
        language_code: updatedTask.language_code ?? old.language_code,
        delivery_date: updatedTask.delivery_date ?? old.delivery_date,
        publication_date: updatedTask.publication_date ?? old.publication_date,
        updated_at: updatedTask.updated_at ?? old.updated_at,
        copy_post: updatedTask.copy_post ?? old.copy_post,
        briefing: updatedTask.briefing ?? old.briefing,
        notes: updatedTask.notes ?? old.notes,
        is_overdue: updatedTask.is_overdue ?? old.is_overdue,
        is_publication_overdue: updatedTask.is_publication_overdue ?? old.is_publication_overdue,
        // Add more fields as needed
      };
    });
    // --- Patch all ['tasks', ...] caches (calendar months, etc) ---
    const queries = queryClient.getQueryCache().findAll({ queryKey: ['tasks'] });
    for (const q of queries) {
      const oldData = q.state.data;
      if (!Array.isArray(oldData)) continue;
      const idx = oldData.findIndex((t: any) => String(t.id) === String(updatedTask.id));
      if (idx === -1) continue;
      const oldTask = oldData[idx];
      const patchedTask = {
        ...oldTask,
        ...updatedTask,
        assigned_user: updatedTask.assigned_to_id
          ? { id: updatedTask.assigned_to_id, full_name: updatedTask.assigned_to_name }
          : oldTask.assigned_user,
        projects: updatedTask.project_id_int
          ? { id: updatedTask.project_id_int, name: updatedTask.project_name, color: updatedTask.project_color }
          : oldTask.projects,
        project_statuses: updatedTask.project_status_id
          ? { id: updatedTask.project_status_id, name: updatedTask.project_status_name, color: updatedTask.project_status_color }
          : oldTask.project_statuses,
        content_type_title: updatedTask.content_type_title ?? oldTask.content_type_title,
        production_type_title: updatedTask.production_type_title ?? oldTask.production_type_title,
        language_code: updatedTask.language_code ?? oldTask.language_code,
        delivery_date: updatedTask.delivery_date ?? oldTask.delivery_date,
        publication_date: updatedTask.publication_date ?? oldTask.publication_date,
        updated_at: updatedTask.updated_at ?? oldTask.updated_at,
        copy_post: updatedTask.copy_post ?? oldTask.copy_post,
        briefing: updatedTask.briefing ?? oldTask.briefing,
        notes: updatedTask.notes ?? oldTask.notes,
        is_overdue: updatedTask.is_overdue ?? oldTask.is_overdue,
        is_publication_overdue: updatedTask.is_publication_overdue ?? oldTask.is_publication_overdue,
      };
      // Ensure we're creating completely new objects to trigger re-renders
      const newData = oldData.map((task, index) => 
        index === idx ? { ...patchedTask } : task
      );
      
      // Force update by ensuring we have a new array reference
      q.setData([...newData]);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[updateTaskInCaches] Patched tasks cache for task', updatedTask.id, 'in query', q.queryKey);
        console.log('[updateTaskInCaches] Task reference equality check:', 
          oldData[idx] === newData[idx] ? 'SAME REFERENCE (BAD)' : 'NEW REFERENCE (GOOD)');
        console.log('[updateTaskInCaches] Array reference equality check:', 
          oldData === newData ? 'SAME ARRAY (BAD)' : 'NEW ARRAY (GOOD)');
      }
    }

    // --- Patch calendar-specific caches (['tasks', month, dateField, filters, search]) ---
    // Find all queries that start with 'tasks' and have additional parameters
    const allQueries = queryClient.getQueryCache().getAll();
    console.log('[updateTaskInCaches] Found', allQueries.length, 'total queries in cache');
    
    for (const q of allQueries) {
      const queryKey = q.queryKey;
      if (!Array.isArray(queryKey) || queryKey[0] !== 'tasks' || queryKey.length <= 1) continue;
      
      console.log('[updateTaskInCaches] Processing task query:', queryKey);
      
      const oldData = q.state.data;
      if (!Array.isArray(oldData)) continue;
      
      const idx = oldData.findIndex((t: any) => String(t.id) === String(updatedTask.id));
      console.log('[updateTaskInCaches] Looking for task', updatedTask.id, 'in calendar query', queryKey, 'found at index:', idx, 'data length:', oldData.length);
      if (idx === -1) continue;
      
      const oldTask = oldData[idx];
      const patchedTask = {
        ...oldTask,
        ...updatedTask,
        assigned_user: updatedTask.assigned_to_id
          ? { id: updatedTask.assigned_to_id, full_name: updatedTask.assigned_to_name }
          : oldTask.assigned_user,
        projects: updatedTask.project_id_int
          ? { id: updatedTask.project_id_int, name: updatedTask.project_name, color: updatedTask.project_color }
          : oldTask.projects,
        project_statuses: updatedTask.project_status_id
          ? { id: updatedTask.project_status_id, name: updatedTask.project_status_name, color: updatedTask.project_status_color }
          : oldTask.project_statuses,
        content_type_title: updatedTask.content_type_title ?? oldTask.content_type_title,
        production_type_title: updatedTask.production_type_title ?? oldTask.production_type_title,
        language_code: updatedTask.language_code ?? oldTask.language_code,
        delivery_date: updatedTask.delivery_date ?? oldTask.delivery_date,
        publication_date: updatedTask.publication_date ?? oldTask.publication_date,
        updated_at: updatedTask.updated_at ?? oldTask.updated_at,
        copy_post: updatedTask.copy_post ?? oldTask.copy_post,
        briefing: updatedTask.briefing ?? oldTask.briefing,
        notes: updatedTask.notes ?? oldTask.notes,
        is_overdue: updatedTask.is_overdue ?? oldTask.is_overdue,
        is_publication_overdue: updatedTask.is_publication_overdue ?? oldTask.is_publication_overdue,
      };
      
      // Ensure we're creating completely new objects to trigger re-renders
      const newData = oldData.map((task, index) => 
        index === idx ? { ...patchedTask } : task
      );
      
      // Force update by ensuring we have a new array reference
      q.setData([...newData]);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[updateTaskInCaches] Patched calendar/task cache for task', updatedTask.id, 'in query', q.queryKey, 'old data length:', oldData.length, 'new data length:', newData.length);
        console.log('[updateTaskInCaches] Updated task data:', { old: oldTask, new: patchedTask });
        console.log('[updateTaskInCaches] Task reference equality check:', 
          oldData[idx] === newData[idx] ? 'SAME REFERENCE (BAD)' : 'NEW REFERENCE (GOOD)');
        console.log('[updateTaskInCaches] Array reference equality check:', 
          oldData === newData ? 'SAME ARRAY (BAD)' : 'NEW ARRAY (GOOD)');
      }
      
      // Only invalidate if the cache update didn't work (as a last resort)
      // This prevents interfering with optimistic updates
      if (process.env.NODE_ENV === 'development') {
        console.log('[updateTaskInCaches] Cache update completed for query:', queryKey);
      }
    }
    // --- Patch Kanban view cache ---
    const kanbanQueries = queryClient.getQueryCache().findAll({ queryKey: ['kanban-bootstrap'] });
    for (const q of kanbanQueries) {
      const oldData = q.state.data as any;
      if (!oldData || !oldData.tasks) continue;
      
      // Update the task in all groups within the Kanban data
      const newTasks = { ...oldData.tasks };
      for (const [groupKey, tasks] of Object.entries(newTasks)) {
        if (Array.isArray(tasks)) {
          const idx = tasks.findIndex((t: any) => String(t.id) === String(updatedTask.id));
          if (idx !== -1) {
            const oldTask = tasks[idx];
            const patchedTask = {
              ...oldTask,
              ...updatedTask,
              assigned_user: updatedTask.assigned_to_id
                ? { id: updatedTask.assigned_to_id, full_name: updatedTask.assigned_to_name }
                : oldTask.assigned_user,
              projects: updatedTask.project_id_int
                ? { id: updatedTask.project_id_int, name: updatedTask.project_name, color: updatedTask.project_color }
                : oldTask.projects,
              project_statuses: updatedTask.project_status_id
                ? { id: updatedTask.project_status_id, name: updatedTask.project_status_name, color: updatedTask.project_status_color }
                : oldTask.project_statuses,
              content_type_title: updatedTask.content_type_title ?? oldTask.content_type_title,
              production_type_title: updatedTask.production_type_title ?? oldTask.production_type_title,
              language_code: updatedTask.language_code ?? oldTask.language_code,
              delivery_date: updatedTask.delivery_date ?? oldTask.delivery_date,
              publication_date: updatedTask.publication_date ?? oldTask.publication_date,
              updated_at: updatedTask.updated_at ?? oldTask.updated_at,
              is_overdue: updatedTask.is_overdue ?? oldTask.is_overdue,
              is_publication_overdue: updatedTask.is_publication_overdue ?? oldTask.is_publication_overdue,
            };
            const newTasksArray = [...tasks];
            newTasksArray[idx] = patchedTask;
            newTasks[groupKey] = newTasksArray;
          }
        }
      }
      
      // Update the entire Kanban cache
      q.setData({
        ...oldData,
        tasks: newTasks
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[updateTaskInCaches] Patched Kanban cache for task', updatedTask.id, 'in query', q.queryKey);
      }
    }
    
    // --- Patch TaskDetails Edge Function cache ---
    const taskDetailsQueries = queryClient.getQueryCache().findAll({ queryKey: ['task'] });
    for (const q of taskDetailsQueries) {
      const oldData = q.state.data as any;
      if (!oldData || !oldData.id || String(oldData.id) !== String(updatedTask.id)) continue;
      
      // Patch the task details data with the updated fields
      const patchedData = {
        ...oldData,
        ...updatedTask,
        // Preserve Edge Function specific fields
        thread_id: oldData.thread_id,
        mentions: oldData.mentions,
        watchers: oldData.watchers,
        attachments: oldData.attachments,
        subtasks: oldData.subtasks,
        project_watchers: oldData.project_watchers,
      };
      
      q.setData(patchedData);
      if (process.env.NODE_ENV === 'development') {
        console.log('[updateTaskInCaches] Patched TaskDetails cache for task', updatedTask.id);
      }
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[updateTaskInCaches] Patched detail cache for task', updatedTask.id);
    }
    
    // Only invalidate as a last resort if cache updates didn't work
    // This prevents interfering with optimistic updates
    if (process.env.NODE_ENV === 'development') {
      console.log('[updateTaskInCaches] Cache updates completed for all queries');
    }
  }
}

/**
 * Update a task in all caches with overdue status calculation.
 * This function should be called when dates or statuses change to immediately update overdue status.
 */
export function updateTaskInCachesWithOverdue(
  queryClient: QueryClient, 
  updatedTask: any, 
  projectStatuses: any[]
) {
  // Calculate overdue status
  const { isOverdue, isPublicationOverdue } = calculateOverdueStatus(
    updatedTask.delivery_date,
    updatedTask.publication_date,
    updatedTask.project_status_id,
    projectStatuses
  );

  // Add overdue status to the updated task
  const taskWithOverdue = {
    ...updatedTask,
    is_overdue: isOverdue,
    is_publication_overdue: isPublicationOverdue
  };

  // Update all caches with the task including overdue status
  updateTaskInCaches(queryClient, taskWithOverdue);
}

/**
 * Normalize a task object to ensure all fields (flat and joined) are present and typed consistently.
 * Use this for optimistic updates and cache hydration.
 */
export function normalizeTask(apiTask: any): any {
  return {
    ...apiTask,
    id: String(apiTask.id),
    assigned_to_id: apiTask.assigned_to_id != null ? String(apiTask.assigned_to_id) : '',
    project_id_int: apiTask.project_id_int != null ? Number(apiTask.project_id_int) : null,
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

/**
 * Add a new task to calendar caches if it matches the current month's date range.
 * This ensures new tasks appear optimistically in calendar views.
 */
export function addTaskToCalendarCaches(queryClient: QueryClient, newTask: any) {
  if (!queryClient || !newTask || !newTask.id) return;

  // Find all calendar queries (they have the pattern ['tasks', month, dateField, filters, search])
  const allQueries = queryClient.getQueryCache().getAll();
  
  for (const q of allQueries) {
    const queryKey = q.queryKey;
    if (!Array.isArray(queryKey) || queryKey[0] !== 'tasks' || queryKey.length < 4) continue;
    
    // Check if this is a calendar query (has month, dateField, filters, search)
    const [_, monthStr, dateField, filterKey, searchValue] = queryKey;
    if (!monthStr || !dateField || !filterKey) continue;
    
    // Parse the month to get the date range
    const monthDate = new Date(monthStr);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0, 23, 59, 59, 999);
    
    // Check if the task's date falls within this month
    const taskDate = newTask[dateField];
    if (!taskDate) continue;
    
    const taskDateObj = new Date(taskDate);
    if (taskDateObj < firstDay || taskDateObj > lastDay) continue;
    
    // Check if task matches the filters
    const filters = JSON.parse(filterKey);
    const matchesFilters = checkTaskMatchesFilters(newTask, filters, searchValue);
    if (!matchesFilters) continue;
    
    // Add the task to this calendar cache
    const oldData = q.state.data;
    if (Array.isArray(oldData)) {
      // Check if task already exists
      const existingIndex = oldData.findIndex((t: any) => String(t.id) === String(newTask.id));
      if (existingIndex === -1) {
        // Add new task at the beginning (new tasks typically appear at the top)
        const newData = [newTask, ...oldData];
        q.setData([...newData]);
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[addTaskToCalendarCaches] Added new task to calendar cache:', {
            taskId: newTask.id,
            queryKey,
            oldDataLength: oldData.length,
            newDataLength: newData.length
          });
        }
      }
    }
  }
}

/**
 * Check if a task matches the given filters and search value.
 */
function checkTaskMatchesFilters(task: any, filters: any, searchValue?: string): boolean {
  // Check search value
  if (searchValue && searchValue !== '*') {
    const searchLower = searchValue.toLowerCase();
    const searchableFields = [
      task.title,
      task.briefing,
      task.notes,
      task.assigned_user?.full_name,
      task.projects?.name
    ].filter(Boolean);
    
    if (!searchableFields.some(field => 
      typeof field === 'string' && field.toLowerCase().includes(searchLower)
    )) {
      return false;
    }
  }
  
  // Check filters
  if (filters.assignedTo?.length > 0) {
    if (!filters.assignedTo.includes(String(task.assigned_to_id))) {
      return false;
    }
  }
  
  if (filters.status?.length > 0) {
    if (!filters.status.includes(task.project_status_name)) {
      return false;
    }
  }
  
  if (filters.project?.length > 0) {
    if (!filters.project.includes(String(task.project_id_int))) {
      return false;
    }
  }
  
  if (filters.contentType?.length > 0) {
    if (!filters.contentType.includes(String(task.content_type_id))) {
      return false;
    }
  }
  
  if (filters.productionType?.length > 0) {
    if (!filters.productionType.includes(String(task.production_type_id))) {
      return false;
    }
  }
  
  if (filters.language?.length > 0) {
    if (!filters.language.includes(String(task.language_id))) {
      return false;
    }
  }
  
  // Check parent task filter
  if (filters.parentTaskNull === true) {
    if (task.parent_task_id_int) {
      return false;
    }
  }
  
  return true;
}

/**
 * Add a new task to Kanban caches if it matches the current grouping and filters.
 * This ensures new tasks appear optimistically in Kanban views.
 */
export function addTaskToKanbanCaches(queryClient: QueryClient, newTask: any) {
  if (!queryClient || !newTask || !newTask.id) return;

  // Find all Kanban queries (they have the pattern ['kanban-bootstrap', groupBy, limit, accessToken, searchValue, filters])
  const allQueries = queryClient.getQueryCache().getAll();
  
  for (const q of allQueries) {
    const queryKey = q.queryKey;
    if (!Array.isArray(queryKey) || queryKey[0] !== 'kanban-bootstrap' || queryKey.length < 2) continue;
    
    // Check if this is a Kanban query
    const [_, groupBy, limit, accessToken, searchValue, filtersStr] = queryKey;
    if (!groupBy) continue;
    
    // Parse filters if they exist
    let filters = {};
    if (filtersStr) {
      try {
        filters = JSON.parse(decodeURIComponent(filtersStr));
      } catch (e) {
        console.warn('[addTaskToKanbanCaches] Failed to parse filters:', e);
        continue;
      }
    }
    
    // Check if task matches the filters and search
    const matchesFilters = checkTaskMatchesKanbanFilters(newTask, filters, searchValue);
    if (!matchesFilters) continue;
    
    // Get the current Kanban data
    const oldData = q.state.data as any;
    if (!oldData || !oldData.tasks || typeof oldData.tasks !== 'object') continue;
    
    // Determine which group the new task should be added to
    const groupKey = getKanbanGroupKey(newTask, groupBy);
    if (!groupKey) continue;
    
    // Check if task already exists in this group
    const existingGroup = oldData.tasks[groupKey] || [];
    const existingIndex = existingGroup.findIndex((t: any) => String(t.id) === String(newTask.id));
    if (existingIndex !== -1) continue;
    
    // Add the task to the appropriate group
    const newGroup = [newTask, ...existingGroup];
    const newTasks = {
      ...oldData.tasks,
      [groupKey]: newGroup
    };
    
    // Update the cache with the new task
    const newData = {
      ...oldData,
      tasks: newTasks
    };
    
    q.setData(newData);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[addTaskToKanbanCaches] Added new task to Kanban cache:', {
        taskId: newTask.id,
        groupBy,
        groupKey,
        queryKey,
        oldGroupLength: existingGroup.length,
        newGroupLength: newGroup.length
      });
    }
  }
}

/**
 * Check if a task matches the given Kanban filters and search value.
 */
function checkTaskMatchesKanbanFilters(task: any, filters: any, searchValue?: string): boolean {
  // Check search value
  if (searchValue && searchValue !== '*') {
    const searchLower = searchValue.toLowerCase();
    const searchableFields = [
      task.title,
      task.briefing,
      task.notes,
      task.assigned_user?.full_name,
      task.projects?.name
    ].filter(Boolean);
    
    if (!searchableFields.some(field => 
      typeof field === 'string' && field.toLowerCase().includes(searchLower)
    )) {
      return false;
    }
  }
  
  // Check filters (similar to calendar filters but adapted for Kanban)
  if (filters.assignedTo?.length > 0) {
    if (!filters.assignedTo.includes(String(task.assigned_to_id))) {
      return false;
    }
  }
  
  if (filters.status?.length > 0) {
    if (!filters.status.includes(task.project_status_name)) {
      return false;
    }
  }
  
  if (filters.project?.length > 0) {
    if (!filters.project.includes(String(task.project_id_int))) {
      return false;
    }
  }
  
  if (filters.contentType?.length > 0) {
    if (!filters.contentType.includes(String(task.content_type_id))) {
      return false;
    }
  }
  
  if (filters.productionType?.length > 0) {
    if (!filters.productionType.includes(String(task.production_type_id))) {
      return false;
    }
  }
  
  if (filters.language?.length > 0) {
    if (!filters.language.includes(String(task.language_id))) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get the group key for a task based on the grouping field.
 */
function getKanbanGroupKey(task: any, groupBy: string): string | null {
  switch (groupBy) {
    case 'project_status_name':
      return task.project_status_name || '__unassigned__';
    
    case 'assigned_to_name':
      return task.assigned_user?.full_name || '__unassigned__';
    
    case 'project_name':
      return task.projects?.name || '__unassigned__';
    
    case 'content_type_title':
      return task.content_type_title || '__unassigned__';
    
    case 'production_type_title':
      return task.production_type_title || '__unassigned__';
    
    case 'language_code':
      return task.language_code || '__unassigned__';
    
    case 'delivery_date':
    case 'publication_date': {
      const dateValue = task[groupBy];
      if (!dateValue) return '__unassigned__';
      
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return '__unassigned__';
      
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    
    case 'channel_names':
      // For channel grouping, we need to check if the task has any of the channels
      // This is more complex and might need special handling
      return '__unassigned__';
    
    default:
      return '__unassigned__';
  }
} 