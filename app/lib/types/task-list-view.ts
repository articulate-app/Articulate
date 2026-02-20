/**
 * TypeScript type for a row in the task_list_view Postgres view.
 * This matches the structure defined in the database view.
 */
export type TaskListRow = {
  id: number;
  title: string;

  // Assignee
  assigned_to_id: number | null;
  assigned_to_name: string | null;
  assigned_to_photo: string | null;       // URL to assignee photo (may be null)

  // Project
  project_id_int: number;
  project_name: string | null;
  project_color: string | null;
  project_logo: string | null;            // URL to project logo (may be null)

  // Project status
  project_status_id: number | null;
  project_status_name: string | null;
  project_status_color: string | null;

  // Dates / flags
  delivery_date: string | null;       // date (YYYY-MM-DD)
  publication_date: string | null;    // date (YYYY-MM-DD)
  is_overdue: boolean | null;
  is_publication_overdue: boolean | null;
  updated_at: string;                 // timestamp

  // Types
  content_type_id: number | null;
  content_type_title: string | null;
  production_type_id: number | null;
  production_type_title: string | null;

  // Language
  language_id: number | null;
  language_code: string | null;

  // Optional: minimal RPC response may include these
  delivery_month?: string | null;
  publication_month?: string | null;
  channel_names?: string[] | null;
  _group_key?: string;

  search_vector?: any; // tsvector for full-text search
};

/** Cursor from task_group_tasks_filtered. Store and pass as-is; do not parse or transform rok. */
export type TaskCursor = { rok: string; id: number } | null;

/**
 * Filters for fetching tasks from the view
 */
export type RowSortColumn =
  | "publication_date"
  | "delivery_date"
  | "updated_at"
  | "assigned_to_name"
  | "project_name"
  | "project_status_name"
  | "title"
  | "content_type_title"
  | "production_type_title"
  | "language_code";

export type TaskListFilters = {
  q?: string;
  projectIds?: number[];
  statusNames?: string[]; // Changed from statusIds to statusNames - filter by name, not ID
  assigneeIds?: number[];
  contentTypeIds?: number[];
  productionTypeIds?: number[];
  languageIds?: number[];
  isOverdue?: boolean;
  isPublicationOverdue?: boolean;

  // Legacy row-level sort (for backward compatibility)
  sortBy?: RowSortColumn;
  sortOrder?: "asc" | "desc";

  // New explicit grouping + row-level sort model
  groupBy?: string | null;            // e.g. 'delivery_date', 'project_status', 'assigned_to', 'project', etc.
  groupOrder?: "asc" | "desc";        // direction for the group key
  rowSortBy?: RowSortColumn;          // row sort inside groups or in ungrouped mode
  rowSortOrder?: "asc" | "desc";      // direction for rowSortBy
  mode?: "grouped" | "list";          // grouped vs ungrouped mode (optional convenience flag)

  page?: number;
  perPage?: number;
};

/**
 * Response from fetchTasksFromView
 */
export type TaskListResponse = {
  tasks: TaskListRow[];
  total: number;
  page: number;
  perPage: number;
};

