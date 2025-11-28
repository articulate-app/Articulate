export interface Task {
  id: string
  title: string
  notes?: string
  briefing?: string
  delivery_date?: string
  publication_date?: string
  assigned_to_id?: string | null
  project_id_int?: number | null
  project_name?: string
  content_type_id?: string
  production_type_id?: string
  language_id?: string
  project_status_id?: string
  project_status_name?: string
  project_status_color?: string
  parent_task_id_int?: number | null
  users?: {
    id: string
    full_name: string
  }
  projects?: { id: number; name: string; color?: string } | null;
  project_statuses?: { id: number; name: string; color?: string } | null;
  content_types?: {
    title: string
  }[]
  production_types?: {
    title: string
  }[]
  languages?: {
    code: string
  }[]
}

export interface TaskFilters {
  assignedTo?: string[]
  status?: string[]
  project?: string[]
  contentType?: string[]
  productionType?: string[]
  language?: string[]
  deliveryDate?: {
    from?: string
    to?: string
  }
  publicationDate?: {
    from?: string
    to?: string
  }
}

export interface TasksResponse {
  tasks: Task[]
  nextCursor: number | null
  hasMore: boolean
}

export type ReviewData = {
  avg_seo_score: number | null;
  avg_relevance_score: number | null;
  avg_grammar_score: number | null;
  avg_delays_score: number | null;
  global_score: number | null;
  review_count: number | null;
};

export type Review = {
  id: number;
  task_id: number;
  created_by: number;
  score_seo: number | null;
  score_relevance: number | null;
  score_grammar: number | null;
  score_delays: number | null;
  review_score: number | null;
  positive_feedback: string | null;
  negative_feedback: string | null;
  created_at: string;
  updated_at: string;
  review_title: string;
  author?: { id: number; full_name: string | null; photo: string | null };
};

export type NewReviewPayload = {
  task_id: number;
  review_title: string | null;
  score_seo: number | null;
  score_relevance: number | null;
  score_grammar: number | null;
  score_delays: number | null;
  positive_feedback: string | null;
  negative_feedback: string | null;
  // created_by is set by trigger
}; 