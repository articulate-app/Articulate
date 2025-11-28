import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

export interface KeywordIdea {
  keyword: string;
  avgMonthlySearches: number;
  competitionIndex: number;
}

export interface KeywordIdeasResponse {
  elapsedMs: number;
  results: KeywordIdea[];
  nextPageToken?: string | null;
}

export interface KeywordPlannerFilters {
  keyword: string;
  regionId: string;
  languageId: string;
}

interface UseKeywordPlannerOptions {
  enabled?: boolean;
  pageSize?: number;
}

export function useKeywordPlanner(
  filters: KeywordPlannerFilters,
  options: UseKeywordPlannerOptions = {}
) {
  const { enabled = true, pageSize = 15 } = options;
  const abortControllerRef = useRef<AbortController | null>(null);

  // Debounce the keyword input
  const [debouncedKeyword, setDebouncedKeyword] = useState(filters.keyword);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(filters.keyword);
    }, 350); // 350ms debounce

    return () => clearTimeout(timer);
  }, [filters.keyword]);

  // Create query key that includes all filter parameters
  const queryKey = [
    'keyword-ideas',
    debouncedKeyword,
    filters.regionId,
    filters.languageId,
    pageSize,
  ];

  // Fetch keyword ideas
  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery<KeywordIdeasResponse>({
    queryKey,
    queryFn: async () => {
      // Cancel previous request if it exists
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      const response = await fetch('/api/keyword-ideas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keyword: debouncedKeyword,
          regionId: filters.regionId || undefined,
          languageId: filters.languageId || undefined,
          pageSize,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
      }

      return response.json();
    },
    enabled: enabled && debouncedKeyword.trim().length > 0,
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: (failureCount, error: any) => {
      // Retry once on 429/5xx errors with jittered backoff
      if (failureCount >= 1) return false;
      
      const status = error.message?.includes('429') ? 429 : 
                    error.message?.includes('5') ? 500 : 0;
      
      return status === 429 || status >= 500;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex + Math.random() * 1000, 30000),
  });

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Manual trigger function
  const triggerSearch = useCallback(() => {
    refetch();
  }, [refetch]);

  // Check if we have valid filters for search
  const canSearch = debouncedKeyword.trim().length > 0;

  // Get competition level as human-readable string
  const getCompetitionLevel = useCallback((competitionIndex: number): string => {
    if (competitionIndex >= 80) return 'High';
    if (competitionIndex >= 50) return 'Medium';
    if (competitionIndex >= 20) return 'Low';
    return 'Very Low';
  }, []);

  // Get competition level color
  const getCompetitionColor = useCallback((competitionIndex: number): string => {
    if (competitionIndex >= 80) return 'text-red-600';
    if (competitionIndex >= 50) return 'text-orange-600';
    if (competitionIndex >= 20) return 'text-yellow-600';
    return 'text-green-600';
  }, []);

  return {
    data,
    isLoading,
    error,
    isFetching,
    triggerSearch,
    canSearch,
    getCompetitionLevel,
    getCompetitionColor,
    hasResults: data?.results && data.results.length > 0,
    resultCount: data?.results?.length || 0,
    elapsedMs: data?.elapsedMs || 0,
  };
} 