import { storeRegistry, removeItemFromStore, updateItemInStore } from '../../../hooks/use-infinite-query'
import { QueryClient } from '@tanstack/react-query'

/**
 * Remove a task from all InfiniteList caches (all filters/pagination).
 * Ensures the task disappears instantly regardless of filters or pagination.
 */
export function removeTaskFromAllStores(taskId: number) {
  if (typeof window === 'undefined') return;
  Object.keys(storeRegistry).forEach(key => {
    if (key.startsWith('tasks')) {
      removeItemFromStore('tasks', key.includes('::') ? key.split('::')[1] : undefined, taskId)
    }
  })
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
        // Add more fields as needed
      };
    });
    if (process.env.NODE_ENV === 'development') {
      console.log('[updateTaskInCaches] Patched detail cache for task', updatedTask.id);
    }
  }
} 