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
    staleTime: 1000 * 60 * 30, // 30 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (previousData) => previousData,
    enabled: options?.enabled !== undefined ? options.enabled : true,
  });
} 