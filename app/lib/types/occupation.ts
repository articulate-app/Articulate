// TypeScript types for the Real-Time Occupation Awareness System

export interface Duration {
  id: number;
  content_type_id: number;
  production_type_id: number;
  duration_hours: number;
  created_at: string;
  updated_at: string;
}

export interface UserWorkloadSettings {
  id: number;
  user_id: number;
  hours_per_day: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DailyUserOccupation {
  id: number;
  user_id: number;
  date: string;
  total_hours: number;
  occupation_ratio: number;
  created_at: string;
  updated_at: string;
}

export interface OOH {
  id: number;
  user_id: number;
  start_date: string;
  end_date: string;
  ooh_type: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OccupationData {
  existing_hours: number;
  new_task_duration: number;
  adjusted_hours: number;
  capacity: number;
  occupation_ratio: number;
  adjusted_occupation_ratio: number;
  is_ooh: boolean;
  ooh_type: string | null;
  suggested_alternative_dates?: string[];
}

// Edge Function response interfaces
export interface EdgeFunctionOccupationResponse {
  is_ooh: boolean;
  ooh_type: string | null;
  existing_total_hours: number;
  new_task_duration: number;
  capacity: number;
  adjusted_occupation: number;
  suggested_alternative_dates: string[];
}

// Calendar mode response
export interface EdgeFunctionCalendarResponse {
  dates: Array<{
    date: string;
    adjusted_occupation: number;
    color: 'green' | 'yellow' | 'red';
  }>;
}

// Single date mode response
export interface EdgeFunctionSingleDateResponse {
  adjusted_occupation: number;
  existing_total_hours: number;
  new_task_duration: number;
  capacity: number;
  is_ooh: boolean;
  ooh_type: string | null;
  suggested_alternative_dates: string[];
}

// Edge Function request interfaces
export interface EdgeFunctionCalendarRequest {
  user_id: number;
  content_type_id: number;
  production_type_id: number;
  range_start: string;
  range_end: string;
}

export interface EdgeFunctionSingleDateRequest {
  user_id: number;
  content_type_id: number;
  production_type_id: number;
  delivery_date: string;
}

export interface SuggestedDate {
  suggested_date: string;
  occupation_ratio: number;
  is_ooh: boolean;
}

export interface OccupationStatus {
  status: 'available' | 'nearly_full' | 'overbooked' | 'unavailable' | 'unknown';
  color: 'green' | 'yellow' | 'red' | 'gray';
}

export interface OccupationAwarenessParams {
  userId?: string;
  contentTypeId?: string;
  productionTypeId?: string;
  deliveryDate?: string;
}

// Database function parameter types
export interface GetUserOccupationParams {
  p_user_id: number;
  p_date: string;
  p_content_type_id?: number;
  p_production_type_id?: number;
}

export interface SuggestAvailableDatesParams {
  p_user_id: number;
  p_start_date: string;
  p_content_type_id?: number;
  p_production_type_id?: number;
  p_max_days?: number;
  p_max_occupation?: number;
}

// API response types
export interface OccupationAPIResponse {
  data: OccupationData;
  error?: string;
}

export interface SuggestedDatesAPIResponse {
  data: SuggestedDate[];
  error?: string;
}

// Component props types
export interface OccupationAwarenessDisplayProps {
  userId?: string;
  contentTypeId?: string;
  productionTypeId?: string;
  deliveryDate?: string;
  onDateSelect?: (date: string) => void;
}

// Hook return types
export interface UseOccupationAwarenessReturn {
  occupationData: OccupationData | undefined;
  isOccupationLoading: boolean;
  occupationError: Error | null;
  suggestedDates: SuggestedDate[] | undefined;
  isSuggestedDatesLoading: boolean;
  suggestedDatesError: Error | null;
  getOccupationStatus: () => OccupationStatus;
  getOccupationMessage: () => string;
  refetchOccupation: () => void;
  refetchSuggestedDates: () => void;
  isEnabled: boolean;
} 