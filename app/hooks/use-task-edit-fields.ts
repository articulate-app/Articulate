import { useQuery } from '@tanstack/react-query';

// Updated type for the new task-edit-fields response
export type TaskEditFields = {
  project_statuses: { 
    id: number; 
    name: string; 
    color: string; 
    order_priority: number; 
    project_id: number;
    is_closed: boolean;
    is_publication_closed: boolean;
  }[];
  content_types: { id: number; title: string }[];
  production_types: { id: number; title: string }[];
  languages: { id: number; code: string; long_name: string }[];
  channels: { id: number; name: string; project_id?: number }[];
  project_watchers: { user_id: number; project_id: number; users: { id: number; email: string; photo: string; full_name: string } }[];
  projects: { id: number; name: string; active?: boolean }[];
  costs: { user_id: number; content_type_id: number; production_type_id: number; language_id: number }[];
};

const SUPABASE_EDGE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/task-edit-fields`;

/**
 * Fetches all task edit metadata (e.g., project statuses, content types, production types, languages, channels, project watchers, projects, costs) 
 * in a single call. Uses POST with Authorization header only - no query parameters needed.
 * The function returns all available options, filtered by Supabase RLS using the current authenticated user.
 *
 * @param accessToken - The access token for authentication
 */
export function useTaskEditFields(accessToken?: string | null) {
  console.log('useTaskEditFields called with accessToken:', !!accessToken);
  return useQuery<TaskEditFields | undefined>({
    queryKey: ['task-edit-fields'],
    queryFn: async () => {
      if (!accessToken) throw new Error('No access token');
      console.log('Fetching task-edit-fields with token:', accessToken);
      const res = await fetch(SUPABASE_EDGE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      console.log('Fetch response:', res);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch task edit fields: ${errorText}`);
      }
      const data = await res.json();
      console.log('Fetched data:', data);
      return data as TaskEditFields;
    },
    enabled: !!accessToken,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
} 