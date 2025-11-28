import { supabase } from './supabase';

// Map Typesense hit to your existing task format, including nested objects for table compatibility
function mapTypesenseTask(hit: any) {
  const doc = hit.document;
  return {
    ...doc,
    id: doc.id,
    title: doc.title || '',
    assigned_user: doc.assigned_to_name
      ? { id: doc.assigned_to_id || '', full_name: doc.assigned_to_name }
      : null,
    projects: doc.project_name
      ? { id: doc.project_id_int || '', name: doc.project_name, color: doc.project_color || undefined }
      : null,
    project_statuses: doc.project_status_name
      ? { id: doc.project_status_id || '', name: doc.project_status_name, color: doc.project_status_color || undefined }
      : null,
    content_type_title: doc.content_type_title || '',
    production_type_title: doc.production_type_title || '',
    language_code: doc.language_code || '',
    delivery_date: doc.delivery_date || null,
    // Convert Unix timestamp to JavaScript Date
    publication_date: doc.publication_timestamp
      ? new Date(doc.publication_timestamp)
      : null,
    updated_at: doc.updated_at || null,
    // Add overdue fields
    is_overdue: doc.is_overdue || false,
    is_publication_overdue: doc.is_publication_overdue || false,
    // Add other fields as needed
  };
}

interface FetchTasksParams {
  q: string;
  project?: string;
  filters?: { 
    [key: string]: string | string[] | undefined;
  };
  page?: number;
  perPage?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Fetch tasks from Supabase Edge Function with search, filters, and pagination.
 * This replaces direct Typesense calls with secure, authenticated requests.
 */
export async function fetchTasksFromTypesense({ q, project, filters = {}, page = 1, perPage = 25, sortBy = 'publication_timestamp', sortOrder = 'desc' }: FetchTasksParams) {
  console.log('[Supabase Edge Function] fetchTasksFromTypesense called with:', { q, project, filters, page, perPage, sortBy, sortOrder });
  
  try {
    // Get the current session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      console.error('[Supabase Edge Function] No access token available');
      return {
        tasks: [],
        found: 0,
        out_of: 0,
        page: page,
        per_page: perPage,
        next_page: false,
      };
    }

    // Build query parameters for the Edge Function
    const searchParams = new URLSearchParams({
      q: q || '*',
      page: page.toString(),
      per_page: perPage.toString(),
      sort_by: sortBy,
      sort_order: sortOrder,
    });

    // Add project filter if specified
    if (project) {
      searchParams.append('project_id', project);
    }

    // Add filters
    if (filters.overdueStatus) {
      const overdueFilters = Array.isArray(filters.overdueStatus) ? filters.overdueStatus : [filters.overdueStatus];
      overdueFilters.forEach(status => {
        if (status === 'delivery_overdue') {
          searchParams.append('is_overdue', 'true');
        } else if (status === 'publication_overdue') {
          searchParams.append('is_publication_overdue', 'true');
        }
      });
    }

    // Add other filters
    const filterFields = [
      'assigned_to_name',
      'channel_names',
      'content_type_title',
      'project_name',
      'project_id_int',
      'project_status_name',
      'production_type_title',
      'language_code',
      'is_overdue',
      'is_publication_overdue',
    ];

    for (const field of filterFields) {
      if (filters[field]) {
        const value = Array.isArray(filters[field]) ? filters[field].join(',') : filters[field];
        searchParams.append(field, value);
      }
    }

    // Get the Supabase URL from environment
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      console.error('[Supabase Edge Function] Missing NEXT_PUBLIC_SUPABASE_URL');
      return {
        tasks: [],
        found: 0,
        out_of: 0,
        page: page,
        per_page: perPage,
        next_page: false,
      };
    }

    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/search_tasks_with_acl?${searchParams.toString()}`;
    
    console.log('[Supabase Edge Function] Making request to:', edgeFunctionUrl);
    
    const response = await fetch(edgeFunctionUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Supabase Edge Function] Error response:', response.status, errorText);
      throw new Error(`Edge Function error: ${response.status} ${errorText}`);
    }

    const { search_result } = await response.json();
    
    console.log('[Supabase Edge Function] Search result:', { 
      found: search_result.found, 
      hits: search_result.hits?.length || 0 
    });

    // Map the response to match the expected format
    const tasks = Array.isArray(search_result.hits) 
      ? search_result.hits.map(mapTypesenseTask) 
      : [];

    return {
      tasks,
      found: search_result.found,
      out_of: search_result.found, // Typesense out_of field
      page: page,
      per_page: perPage,
      next_page: search_result.found > (page * perPage),
    };
  } catch (error: any) {
    console.error('[Supabase Edge Function] Error in fetchTasksFromTypesense:', error);
    // Return empty result instead of throwing
    return {
      tasks: [],
      found: 0,
      out_of: 0,
      page: page,
      per_page: perPage,
      next_page: false,
    };
  }
} 