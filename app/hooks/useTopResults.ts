import { useState, useCallback, useRef } from 'react';

export interface TopResult {
  title: string;
  link: string;
  displayLink: string;
}

export interface TopResultsData {
  results: TopResult[];
  params: {
    lr?: string;
    cr?: string;
  };
  q: string;
  paramsUsed: string;
  serpKey: string;
}

interface TopResultsRequest {
  q: string;
  languageId?: string | number;
  regionId?: string | number;
}

export function useTopResults() {
  const [topResultsByKey, setTopResultsByKey] = useState<Map<string, TopResultsData>>(new Map());
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
  const [errorKeys, setErrorKeys] = useState<Map<string, string>>(new Map());
  const [lastClickTime, setLastClickTime] = useState<Map<string, number>>(new Map());
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const getSerpKey = useCallback((keyword: string, languageId?: string | number, regionId?: string | number): string => {
    return `${keyword.toLowerCase().trim()}|${languageId || 'any'}|${regionId || 'any'}`;
  }, []);

  const fetchTopResults = useCallback(async (
    keyword: string, 
    languageId?: string | number, 
    regionId?: string | number
  ): Promise<TopResultsData | null> => {
    const serpKey = getSerpKey(keyword, languageId, regionId);
    
    // Rate limiting: 1 request per second per keyword
    const now = Date.now();
    const lastClick = lastClickTime.get(serpKey) || 0;
    if (now - lastClick < 1000) {
      throw new Error('Please wait a moment before requesting top results again');
    }
    
    // Check cache first
    const cached = topResultsByKey.get(serpKey);
    if (cached) {
      return cached;
    }

    // Set loading state
    setLoadingKeys(prev => new Set(prev).add(serpKey));
    setErrorKeys(prev => {
      const newMap = new Map(prev);
      newMap.delete(serpKey);
      return newMap;
    });
    setLastClickTime(prev => new Map(prev).set(serpKey, now));

    // Abort previous request if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();

    try {
      const requestBody: TopResultsRequest = {
        q: keyword,
        languageId,
        regionId,
      };

      const response = await fetch('/api/top-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch top results');
      }

      const data: TopResultsData = await response.json();
      
      // Store results
      setTopResultsByKey(prev => new Map(prev).set(serpKey, data));
      
      return data;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return null; // Request was cancelled
      }
      
      const errorMessage = error.message || 'Failed to fetch top results';
      setErrorKeys(prev => new Map(prev).set(serpKey, errorMessage));
      throw error;
    } finally {
      setLoadingKeys(prev => {
        const newSet = new Set(prev);
        newSet.delete(serpKey);
        return newSet;
      });
      abortControllerRef.current = null;
    }
  }, [topResultsByKey, lastClickTime, getSerpKey]);

  const getTopResults = useCallback((keyword: string, languageId?: string | number, regionId?: string | number): TopResultsData | undefined => {
    const serpKey = getSerpKey(keyword, languageId, regionId);
    return topResultsByKey.get(serpKey);
  }, [topResultsByKey, getSerpKey]);

  const isLoading = useCallback((keyword: string, languageId?: string | number, regionId?: string | number): boolean => {
    const serpKey = getSerpKey(keyword, languageId, regionId);
    return loadingKeys.has(serpKey);
  }, [loadingKeys, getSerpKey]);

  const getError = useCallback((keyword: string, languageId?: string | number, regionId?: string | number): string | undefined => {
    const serpKey = getSerpKey(keyword, languageId, regionId);
    return errorKeys.get(serpKey);
  }, [errorKeys, getSerpKey]);

  const retryTopResults = useCallback((keyword: string, languageId?: string | number, regionId?: string | number) => {
    const serpKey = getSerpKey(keyword, languageId, regionId);
    setErrorKeys(prev => {
      const newMap = new Map(prev);
      newMap.delete(serpKey);
      return newMap;
    });
    return fetchTopResults(keyword, languageId, regionId);
  }, [fetchTopResults, getSerpKey]);

  return {
    fetchTopResults,
    getTopResults,
    isLoading,
    getError,
    retryTopResults,
  };
} 