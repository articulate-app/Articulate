import typesenseSearchClient from './typesenseSearchClient';

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
    // Add other fields as needed
  };
}

interface FetchTasksParams {
  q: string;
  project?: string;
  filters?: { [key: string]: string | string[] };
  page?: number;
  perPage?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Fetch tasks from Typesense with search, filters, and pagination.
 */
export async function fetchTasksFromTypesense({ q, project, filters = {}, page = 1, perPage = 25, sortBy = 'publication_timestamp', sortOrder = 'desc' }: FetchTasksParams) {
  // Build filter_by string
  const filterParts: string[] = [];
  if (project) filterParts.push(`project_id_int:=${project}`);
  // Add other filters
  const filterFields = [
    'assigned_to_name',
    'channel_names',
    'content_type_title',
    'project_name',
    'project_id_int',
    'project_status_name', // Add project_status_name to supported filter fields
    'production_type_title',
    'language_code',
  ];
  for (const field of filterFields) {
    if (filters[field]) {
      // Support array or string
      const value = Array.isArray(filters[field]) ? filters[field].join(',') : filters[field];
      filterParts.push(`${field}:=[${value}]`);
    }
  }
  const filter_by = filterParts.length > 0 ? filterParts.join(' && ') : undefined;

  // Map frontend field names to Typesense field names
  const fieldMapping: Record<string, string> = {
    'title': 'title',
    'assigned_user': 'assigned_to_name',
    'projects': 'project_name',
    'project_statuses': 'project_status_name',
    'delivery_date': 'delivery_date',
    'publication_date': 'publication_timestamp',
    'updated_at': 'updated_at',
    'content_type_title': 'content_type_title',
    'production_type_title': 'production_type_title',
    'language_code': 'language_code',
  };

  console.log('[Typesense] Sorting by:', { sortBy, sortOrder, fieldMapping });
  const typesenseField = fieldMapping[sortBy] || 'publication_timestamp';
  
  // Fallback to publication_timestamp if the field doesn't exist in Typesense
  const safeSortBy = typesenseField === 'project_status_name' ? 'publication_timestamp' : typesenseField;
  const sort_by = `${safeSortBy}:${sortOrder}`;
  console.log('[Typesense] Final sort_by:', sort_by);

  const searchParams: any = {
    q: q || '*',
    query_by: 'title,briefing,notes,assigned_to_name,project_name',
    sort_by,
    page,
    per_page: perPage,
  };
  if (filter_by) searchParams.filter_by = filter_by;

  const result = await typesenseSearchClient
    .collections('tasks')
    .documents()
    .search(searchParams);

  return {
    tasks: Array.isArray(result.hits) ? result.hits.map(mapTypesenseTask) : [],
    found: result.found,
    out_of: result.out_of,
    page: result.page,
    per_page: result.request_params.per_page,
    next_page: result.found > (page * perPage),
  };
} 