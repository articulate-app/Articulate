import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useDebounce } from './use-debounce';
import type {
  OccupationData,
  SuggestedDate,
  OccupationAwarenessParams,
  OccupationStatus,
  UseOccupationAwarenessReturn,
  EdgeFunctionSingleDateResponse,
  EdgeFunctionSingleDateRequest,
} from '../lib/types/occupation';

export function useOccupationAwareness({
  userId,
  contentTypeId,
  productionTypeId,
  deliveryDate,
}: OccupationAwarenessParams) {
  const [isEnabled, setIsEnabled] = useState(false);
  const queryClient = useQueryClient();
  const supabase = createClientComponentClient();

  // Debounce the parameters to avoid spamming the API
  const debouncedUserId = useDebounce(userId, 300);
  const debouncedContentTypeId = useDebounce(contentTypeId, 300);
  const debouncedProductionTypeId = useDebounce(productionTypeId, 300);
  const debouncedDeliveryDate = useDebounce(deliveryDate, 300);

  // Enable the query when all required fields are present
  useEffect(() => {
    const hasAllRequiredFields = debouncedUserId && debouncedContentTypeId && debouncedProductionTypeId && debouncedDeliveryDate;
    setIsEnabled(!!hasAllRequiredFields);
  }, [debouncedUserId, debouncedContentTypeId, debouncedProductionTypeId, debouncedDeliveryDate]);

  // Fetch occupation data from Edge Function
  const {
    data: occupationData,
    isLoading: isOccupationLoading,
    error: occupationError,
    refetch: refetchOccupation,
  } = useQuery({
    queryKey: ['occupation', debouncedUserId, debouncedContentTypeId, debouncedProductionTypeId, debouncedDeliveryDate],
    queryFn: async (): Promise<OccupationData> => {
      const response = await supabase.functions.invoke('user-occupation-preview', {
        body: {
          user_id: parseInt(debouncedUserId!),
          content_type_id: parseInt(debouncedContentTypeId!),
          production_type_id: parseInt(debouncedProductionTypeId!),
          delivery_date: debouncedDeliveryDate!,
        },
      });

      if (response.error) {
        throw new Error(`Failed to fetch occupation data: ${response.error.message}`);
      }

      const data = response.data as EdgeFunctionSingleDateResponse;
      
      // Transform the Edge Function response to match our OccupationData interface
      return {
        existing_hours: data.existing_total_hours || 0,
        new_task_duration: data.new_task_duration || 4.0,
        adjusted_hours: (data.existing_total_hours || 0) + (data.new_task_duration || 4.0),
        capacity: data.capacity || 8.0,
        occupation_ratio: (data.existing_total_hours || 0) / (data.capacity || 8.0),
        adjusted_occupation_ratio: data.adjusted_occupation || 0,
        is_ooh: data.is_ooh || false,
        ooh_type: data.ooh_type || null,
        suggested_alternative_dates: data.suggested_alternative_dates || [],
      };
    },
    enabled: isEnabled,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // 1 minute
  });

  // Extract suggested dates from occupation data
  const suggestedDates = occupationData?.suggested_alternative_dates?.map((date: string) => ({
    suggested_date: date,
    occupation_ratio: 0.5, // Default value since Edge Function doesn't provide this
    is_ooh: false,
  })) || [];

  const isSuggestedDatesLoading = false; // No separate loading state needed
  const suggestedDatesError = null; // No separate error state needed
  const refetchSuggestedDates = () => refetchOccupation(); // Refetch occupation data to get updated suggestions

  // Subscribe to real-time updates for daily_user_occupation
  useEffect(() => {
    if (!isEnabled || !debouncedUserId || !debouncedDeliveryDate) return;

    const channel = supabase
      .channel(`occupation-${debouncedUserId}-${debouncedDeliveryDate}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_user_occupation',
          filter: `user_id=eq.${debouncedUserId}`,
        },
        () => {
          // Refetch occupation data when it changes
          refetchOccupation();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isEnabled, debouncedUserId, debouncedDeliveryDate, supabase, refetchOccupation]);

  // Get occupation status and color
  const getOccupationStatus = useCallback((): OccupationStatus => {
    if (!occupationData) return { status: 'unknown', color: 'gray' };

    const { adjusted_occupation_ratio, is_ooh } = occupationData;

    if (is_ooh) {
      return { status: 'unavailable', color: 'red' };
    }

    if (adjusted_occupation_ratio >= 1.0) {
      return { status: 'overbooked', color: 'red' };
    }

    if (adjusted_occupation_ratio >= 0.7) {
      return { status: 'nearly_full', color: 'yellow' };
    }

    return { status: 'available', color: 'green' };
  }, [occupationData]);

  // Get occupation message
  const getOccupationMessage = useCallback(() => {
    if (!occupationData) return '';

    const { adjusted_occupation_ratio, is_ooh, ooh_type, existing_hours, new_task_duration, capacity } = occupationData;

    if (is_ooh) {
      return `User is on ${ooh_type || 'leave'} this day and cannot be assigned tasks.`;
    }

    if (adjusted_occupation_ratio >= 1.0) {
      return `User is fully booked (${Math.round(adjusted_occupation_ratio * 100)}%). Consider a different date.`;
    }

    if (adjusted_occupation_ratio >= 0.7) {
      return `User is nearly full (${Math.round(adjusted_occupation_ratio * 100)}%). ${existing_hours}h existing + ${new_task_duration}h new = ${adjusted_occupation_ratio * capacity}h total.`;
    }

    return `User is available (${Math.round(adjusted_occupation_ratio * 100)}%). ${existing_hours}h existing + ${new_task_duration}h new = ${adjusted_occupation_ratio * capacity}h total.`;
  }, [occupationData]);

  return {
    occupationData,
    isOccupationLoading,
    occupationError,
    suggestedDates,
    isSuggestedDatesLoading,
    suggestedDatesError,
    getOccupationStatus,
    getOccupationMessage,
    refetchOccupation,
    refetchSuggestedDates,
    isEnabled,
  } satisfies UseOccupationAwarenessReturn;
} 