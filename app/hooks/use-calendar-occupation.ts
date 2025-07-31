import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useDebounce } from './use-debounce';
import type {
  EdgeFunctionCalendarRequest,
  EdgeFunctionCalendarResponse,
} from '../lib/types/occupation';

interface UseCalendarOccupationParams {
  userId?: string;
  contentTypeId?: string;
  productionTypeId?: string;
  rangeStart?: string;
  rangeEnd?: string;
}

export function useCalendarOccupation({
  userId,
  contentTypeId,
  productionTypeId,
  rangeStart,
  rangeEnd,
}: UseCalendarOccupationParams) {
  const [isEnabled, setIsEnabled] = useState(false);
  const supabase = createClientComponentClient();

  // Debounce the parameters to avoid spamming the API
  const debouncedUserId = useDebounce(userId, 300);
  const debouncedContentTypeId = useDebounce(contentTypeId, 300);
  const debouncedProductionTypeId = useDebounce(productionTypeId, 300);
  const debouncedRangeStart = useDebounce(rangeStart, 300);
  const debouncedRangeEnd = useDebounce(rangeEnd, 300);

  // Enable the query when all required fields are present
  useEffect(() => {
    const hasAllRequiredFields = debouncedUserId && 
      debouncedContentTypeId && 
      debouncedProductionTypeId && 
      debouncedRangeStart && 
      debouncedRangeEnd;
    setIsEnabled(!!hasAllRequiredFields);
  }, [debouncedUserId, debouncedContentTypeId, debouncedProductionTypeId, debouncedRangeStart, debouncedRangeEnd]);

  // Fetch calendar occupation data
  const {
    data: calendarData,
    isLoading: isCalendarLoading,
    error: calendarError,
    refetch: refetchCalendar,
  } = useQuery({
    queryKey: ['calendar-occupation', debouncedUserId, debouncedContentTypeId, debouncedProductionTypeId, debouncedRangeStart, debouncedRangeEnd],
    queryFn: async (): Promise<EdgeFunctionCalendarResponse> => {
      const response = await supabase.functions.invoke('user-occupation-preview', {
        body: {
          user_id: parseInt(debouncedUserId!),
          content_type_id: parseInt(debouncedContentTypeId!),
          production_type_id: parseInt(debouncedProductionTypeId!),
          range_start: debouncedRangeStart!,
          range_end: debouncedRangeEnd!,
        } as EdgeFunctionCalendarRequest,
      });

      if (response.error) {
        throw new Error(`Failed to fetch calendar occupation data: ${response.error.message}`);
      }

      return response.data as EdgeFunctionCalendarResponse;
    },
    enabled: isEnabled,
    staleTime: 300000, // 5 minutes
    refetchInterval: 600000, // 10 minutes
  });

  // Create a map for quick date lookup
  const dateOccupationMap = new Map(
    calendarData?.dates?.map(date => [date.date, date]) || []
  );

  return {
    calendarData,
    isCalendarLoading,
    calendarError,
    refetchCalendar,
    dateOccupationMap,
    isEnabled,
  };
} 