import { useQuery } from '@tanstack/react-query';
import { getFilterOptions } from '../lib/services/filters';

/**
 * useFilterOptions - React Query hook to fetch and cache filter options for dropdowns/filters.
 * Fetches only when called, and caches the result for all consumers.
 * @param options Optional options object. Pass { enabled: boolean } to control when the query runs.
 */
export function useFilterOptions(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['filterOptions'],
    queryFn: getFilterOptions,
    staleTime: 1000 * 60 * 10, // 10 minutes
    refetchOnWindowFocus: false,
    enabled: options?.enabled !== undefined ? options.enabled : true,
  });
} 