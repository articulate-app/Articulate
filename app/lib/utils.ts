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

/** UI locale for date display (Europe/Lisbon → dd/mm/yyyy) */
const DATE_DISPLAY_LOCALE = 'pt-PT'

/**
 * Parse a calendar date without UTC day-shift for `yyyy-mm-dd` strings.
 */
function parseCalendarDateInput(date: string | Date): Date | null {
  if (date instanceof Date) return Number.isNaN(date.getTime()) ? null : date
  const s = String(date).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(`${s.slice(0, 10)}T12:00:00`)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Local calendar `yyyy-mm-dd` (never UTC `toISOString` day). */
export function toLocalISODate(value: string | Date | null | undefined): string {
  if (!value) return ''
  if (typeof value === 'string') {
    const s = value.trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  }
  const d = parseCalendarDateInput(value as string | Date)
  if (!d) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Format a date for display in dd/mm/yyyy (pt-PT locale).
 * Use for both hover display and edit mode to avoid format flipping.
 */
export function formatDateDisplay(date: string | Date | null | undefined): string {
  if (!date) return ''
  try {
    const d = parseCalendarDateInput(date)
    if (!d) return ''
    return d.toLocaleDateString(DATE_DISPLAY_LOCALE, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

/**
 * Compact date display for task/suggestion list rows.
 * - Current-year dates render as `dd/mmm` without year (e.g. `08/Jun`, `23/May`).
 * - Dates in any other year fall back to the standard `formatDateDisplay` (dd/mm/yyyy).
 */
export function formatCompactDateDisplay(date: string | Date | null | undefined): string {
  if (!date) return ''
  try {
    const d = parseCalendarDateInput(date)
    if (!d) return ''
    if (d.getFullYear() !== new Date().getFullYear()) return formatDateDisplay(d)
    const day = String(d.getDate()).padStart(2, '0')
    const month = d.toLocaleDateString('en-US', { month: 'short' })
    return `${day}/${month}`
  } catch {
    return ''
  }
}

/**
 * Parse dd/mm/yyyy or dd-mm-yyyy (or Date / ISO) to local ISO yyyy-mm-dd.
 * Returns empty string if invalid.
 */
export function toISODate(value: string | Date | null | undefined): string {
  if (!value) return ''
  if (value instanceof Date) return toLocalISODate(value)
  const s = String(value).trim()
  if (!s) return ''
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // dd/mm/yyyy or dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (m) {
    const [, d, mo, y] = m
    const day = d!.padStart(2, '0')
    const month = mo!.padStart(2, '0')
    return `${y}-${month}-${day}`
  }
  return toLocalISODate(s)
}

/**
 * Convert ISO yyyy-mm-dd to dd/mm/yyyy for display.
 */
export function fromISOToDisplay(iso: string | null | undefined): string {
  if (!iso) return ''
  return formatDateDisplay(iso)
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

export type KanbanTaskSortKey = 'delivery_date' | 'publication_date' | 'title' | 'assigned_to_name' | 'project_status_name' | 'updated_at';
export type KanbanTaskSortDir = 'asc' | 'desc';

export type KanbanOptions = { 
  groupBy: 'assignee' | 'project' | 'status' | 'priority' | 'content_type' | 'production_type' | 'language' | 'delivery_date' | 'publication_date' | 'channel'; 
  showSubtasks: boolean;
  taskSort?: KanbanTaskSortKey;
  taskSortDir?: KanbanTaskSortDir;
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
const VALID_TASK_SORT: KanbanTaskSortKey[] = ['delivery_date', 'publication_date', 'title', 'assigned_to_name', 'project_status_name', 'updated_at'];
const VALID_TASK_SORT_DIR: KanbanTaskSortDir[] = ['asc', 'desc'];

export function readKanbanOptions(sp: URLSearchParams): KanbanOptions {
  const groupByParam = sp.get('kanban_group_by');
  const showSubtasksParam = sp.get('kanban_show_subtasks');
  const taskSortParam = sp.get('kanban_task_sort');
  const taskSortDirParam = sp.get('kanban_task_sort_dir');
  
  // Validate groupBy - must be one of the allowed values
  const validGroupByValues = ['assignee', 'project', 'status', 'priority', 'content_type', 'production_type', 'language', 'delivery_date', 'publication_date', 'channel'] as const;
  const groupBy = validGroupByValues.includes(groupByParam as any) 
    ? (groupByParam as 'assignee' | 'project' | 'status' | 'priority' | 'content_type' | 'production_type' | 'language' | 'delivery_date' | 'publication_date' | 'channel')
    : 'status';
  
  // Validate showSubtasks - must be 'true' or 'false'
  const showSubtasks = showSubtasksParam === 'true';
  
  const taskSort = VALID_TASK_SORT.includes(taskSortParam as KanbanTaskSortKey) ? (taskSortParam as KanbanTaskSortKey) : undefined;
  const taskSortDir = VALID_TASK_SORT_DIR.includes(taskSortDirParam as KanbanTaskSortDir) ? (taskSortDirParam as KanbanTaskSortDir) : undefined;
  
  return { groupBy, showSubtasks, taskSort, taskSortDir };
}

/**
 * Write a parameter to URL search params without affecting other params
 */
export function writeParam(sp: URLSearchParams, key: string, value: string | boolean): URLSearchParams {
  const next = new URLSearchParams(sp);
  next.set(key, String(value));
  return next;
} 