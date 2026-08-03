import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { KeywordMonthlySearchVolume } from '../lib/keyword-ideas-metrics';

export type { KeywordMonthlySearchVolume };

export interface KeywordIdea {
  keyword: string;
  avgMonthlySearches: number;
  competitionIndex: number;
  monthlySearchVolumes?: KeywordMonthlySearchVolume[];
}

export interface KeywordIdeasResponse {
  elapsedMs: number;
  results: KeywordIdea[];
  nextPageToken?: string | null;
  phase?: 'primary' | 'full';
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

function normalizeKeywordIdeasRegionId(regionId: unknown): string | undefined {
  if (regionId == null) return undefined;

  const value = typeof regionId === "string" ? regionId.trim() : String(regionId).trim();

  if (!value || value === "0" || value.toLowerCase() === "all") {
    return undefined;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined;
  }

  return String(numeric);
}

function buildQueryKey(
  keyword: string,
  regionId: string,
  languageId: string,
  pageSize: number,
) {
  return ['keyword-ideas', keyword, regionId, languageId, pageSize] as const;
}

async function fetchKeywordIdeasPhase(args: {
  keyword: string;
  languageId?: string;
  regionId?: string;
  pageSize: number;
  phase: 'primary' | 'full';
  signal: AbortSignal;
}): Promise<KeywordIdeasResponse> {
  const response = await fetch('/api/keyword-ideas', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      keyword: args.keyword,
      languageId: args.languageId || undefined,
      ...(args.regionId ? { regionId: args.regionId } : {}),
      pageSize: args.pageSize,
      phase: args.phase,
    }),
    signal: args.signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export function useKeywordPlanner(
  filters: KeywordPlannerFilters,
  options: UseKeywordPlannerOptions = {}
) {
  const { enabled = true, pageSize = 40 } = options;
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);
  const enrichAbortRef = useRef<AbortController | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [activeKeyword, setActiveKeyword] = useState(filters.keyword);
  const liveKeywordRef = useRef(filters.keyword);
  liveKeywordRef.current = filters.keyword;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      setActiveKeyword(filters.keyword);
    }, 350);
    return () => clearTimeout(timer);
  }, [enabled, filters.keyword]);

  const queryKey = buildQueryKey(
    activeKeyword,
    filters.regionId,
    filters.languageId,
    pageSize,
  );

  const runSearch = useCallback(
    async (keywordForSearch: string) => {
      const currentFilters = filtersRef.current;
      const key = buildQueryKey(
        keywordForSearch,
        currentFilters.regionId,
        currentFilters.languageId,
        pageSize,
      );

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (enrichAbortRef.current) {
        enrichAbortRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      const normalizedRegionId = normalizeKeywordIdeasRegionId(currentFilters.regionId);

      const primary = await fetchKeywordIdeasPhase({
        keyword: keywordForSearch,
        languageId: currentFilters.languageId || undefined,
        regionId: normalizedRegionId,
        pageSize,
        phase: 'primary',
        signal: abortControllerRef.current.signal,
      });

      queryClient.setQueryData<KeywordIdeasResponse>(key, primary);

      const enrichController = new AbortController();
      enrichAbortRef.current = enrichController;
      setIsEnriching(true);
      void fetchKeywordIdeasPhase({
        keyword: keywordForSearch,
        languageId: currentFilters.languageId || undefined,
        regionId: normalizedRegionId,
        pageSize,
        phase: 'full',
        signal: enrichController.signal,
      })
        .then((full) => {
          queryClient.setQueryData<KeywordIdeasResponse>(key, full);
        })
        .catch((err) => {
          if ((err as Error)?.name === 'AbortError') return;
          console.warn('Keyword ideas enrichment failed:', err);
        })
        .finally(() => {
          if (enrichAbortRef.current === enrichController) {
            setIsEnriching(false);
          }
        });

      return primary;
    },
    [pageSize, queryClient],
  );

  const {
    data,
    isLoading,
    error,
    isFetching,
  } = useQuery<KeywordIdeasResponse>({
    queryKey,
    queryFn: async () => {
      const keywordForSearch = liveKeywordRef.current.trim() || activeKeyword;
      return runSearch(keywordForSearch);
    },
    enabled: enabled && activeKeyword.trim().length > 0,
    staleTime: 2 * 60 * 1000,
    retry: (failureCount, err: any) => {
      if (failureCount >= 1) return false;
      const status = err.message?.includes('429')
        ? 429
        : err.message?.includes('5')
          ? 500
          : 0;
      return status === 429 || status >= 500;
    },
    retryDelay: (attemptIndex) =>
      Math.min(1000 * 2 ** attemptIndex + Math.random() * 1000, 30000),
  });

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (enrichAbortRef.current) enrichAbortRef.current.abort();
    };
  }, []);

  // Warm OAuth token as soon as the planner mounts (skips token RTT on first search).
  useEffect(() => {
    void fetch('/api/keyword-ideas/warm', { method: 'POST' }).catch(() => {});
  }, []);

  const triggerSearch = useCallback(
    (keywordOverride?: string) => {
      const nextKeyword = (keywordOverride ?? liveKeywordRef.current).trim();
      if (!nextKeyword) return;
      liveKeywordRef.current = nextKeyword;
      setActiveKeyword(nextKeyword);
      void queryClient.fetchQuery({
        queryKey: buildQueryKey(
          nextKeyword,
          filtersRef.current.regionId,
          filtersRef.current.languageId,
          pageSize,
        ),
        queryFn: () => runSearch(nextKeyword),
        staleTime: 2 * 60 * 1000,
      });
    },
    [pageSize, queryClient, runSearch],
  );

  const canSearch = filters.keyword.trim().length > 0;

  const getCompetitionLevel = useCallback((competitionIndex: number): string => {
    if (competitionIndex >= 80) return 'High';
    if (competitionIndex >= 50) return 'Medium';
    if (competitionIndex >= 20) return 'Low';
    return 'Very Low';
  }, []);

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
    isEnriching,
    triggerSearch,
    canSearch,
    getCompetitionLevel,
    getCompetitionColor,
    hasResults: data?.results && data.results.length > 0,
    resultCount: data?.results?.length || 0,
    elapsedMs: data?.elapsedMs || 0,
  };
}
