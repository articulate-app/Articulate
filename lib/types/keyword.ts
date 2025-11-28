export interface KeywordList {
  id: number;
  name: string;
  notes?: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface Keyword {
  id: number;
  list_id: number;
  name: string;
  volume: number;
  competition_index: number;
  region_id?: number;
  language_id?: number;
  added_by: number;
  notes?: string;
  added_at: string;
  updated_at: string;
  // View fields (from v_keywords_with_list)
  list_name?: string;
  list_created_by?: number;
  list_created_at?: string;
  list_updated_at?: string;
}

export interface KeywordSearchHistory {
  id: number;
  term: string;
  region_id?: string;
  language_id?: string;
  searched_by: number;
  searched_at: string;
}

export interface CreateKeywordListRequest {
  name: string;
  notes?: string;
}

export interface CreateKeywordRequest {
  list_id: number;
  keyword: string;
  avg_monthly_searches?: number;
  competition_index: number;
  region_id?: number;
  language_id?: number;
  notes?: string;
}

export interface CreateSearchHistoryRequest {
  term: string;
  region?: string;
  language?: string;
}

// API Response types
export interface KeywordListsResponse {
  lists: KeywordList[];
}

export interface KeywordsResponse {
  keywords: Keyword[];
}

export interface SearchHistoryResponse {
  history: KeywordSearchHistory[];
} 