import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "No date"
  try {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (error) {
    console.error('Error formatting date:', error)
    return "Invalid date"
  }
}

export function isDateInRange(date: Date, from?: Date, to?: Date): boolean {
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

export function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'draft':
      return 'bg-gray-100 text-gray-800'
    case 'in progress':
      return 'bg-blue-100 text-blue-800'
    case 'review':
      return 'bg-yellow-100 text-yellow-800'
    case 'approved':
      return 'bg-green-100 text-green-800'
    case 'published':
      return 'bg-purple-100 text-purple-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

export interface DateRangeValue {
  from: string | null
  to: string | null
}

export interface ArrayFilterValue {
  [key: string]: number[]
}

export function isDateRange(value: unknown): value is DateRangeValue {
  return typeof value === 'object' && value !== null && 'from' in value && 'to' in value
}

export function isArrayFilter(value: unknown): value is number[] {
  return Array.isArray(value)
}

export function getSearchKey(field: string): string {
  // Convert from plural to singular and handle special cases
  switch (field) {
    case 'projects':
      return 'project'
    case 'contentTypes':
      return 'contentType'
    case 'productionTypes':
      return 'productionType'
    case 'languages':
      return 'language'
    default:
      return field.toLowerCase().replace(/s$/, '')
  }
}

// View-scoped URL parameter helpers for middle pane
export type CalendarOptions = { 
  dateField: 'delivery' | 'publication'; 
  showSubtasks: boolean 
};

export type KanbanOptions = { 
  groupBy: 'assignee' | 'project' | 'status' | 'priority' | 'content_type' | 'production_type' | 'language' | 'delivery_date' | 'publication_date' | 'channel'; 
  showSubtasks: boolean 
};

/**
 * Read calendar options from URL search params with defaults and validation
 */
export function readCalendarOptions(sp: URLSearchParams): CalendarOptions {
  const dateFieldParam = sp.get('calendar_date_field');
  const showSubtasksParam = sp.get('calendar_show_subtasks');
  
  // Validate dateField - must be 'delivery' or 'publication'
  const dateField = (dateFieldParam === 'delivery' || dateFieldParam === 'publication') 
    ? dateFieldParam 
    : 'delivery';
  
  // Validate showSubtasks - must be 'true' or 'false'
  const showSubtasks = showSubtasksParam === 'true';
  
  return { dateField, showSubtasks };
}

/**
 * Read kanban options from URL search params with defaults and validation
 */
export function readKanbanOptions(sp: URLSearchParams): KanbanOptions {
  const groupByParam = sp.get('kanban_group_by');
  const showSubtasksParam = sp.get('kanban_show_subtasks');
  
  // Validate groupBy - must be one of the allowed values
  const validGroupByValues = ['assignee', 'project', 'status', 'priority', 'content_type', 'production_type', 'language', 'delivery_date', 'publication_date', 'channel'] as const;
  const groupBy = validGroupByValues.includes(groupByParam as any) 
    ? (groupByParam as 'assignee' | 'project' | 'status' | 'priority' | 'content_type' | 'production_type' | 'language' | 'delivery_date' | 'publication_date' | 'channel')
    : 'status';
  
  // Validate showSubtasks - must be 'true' or 'false'
  const showSubtasks = showSubtasksParam === 'true';
  
  return { groupBy, showSubtasks };
}

/**
 * Write a parameter to URL search params without affecting other params
 */
export function writeParam(sp: URLSearchParams, key: string, value: string | boolean): URLSearchParams {
  const next = new URLSearchParams(sp);
  next.set(key, String(value));
  return next;
} 