/**
 * Shared reading column for AI chat and human thread chat.
 * Keeps messages + composer from stretching on ultra-wide panes
 * (same idea as project/user directory `max-w-2xl` and artifact `max-w-3xl`).
 */
export const CHAT_CONTENT_COLUMN_CLASS = "mx-auto w-full max-w-3xl"

/**
 * Task list needs more horizontal room than directory lists (multiple columns),
 * but still caps on ultra-wide monitors so the table doesn't stretch edge-to-edge.
 */
export const TASK_LIST_CONTENT_COLUMN_CLASS = "mx-auto w-full max-w-5xl px-8"

/** Overview meta fields: label left, control column right (settings-panel style). */
export const TASK_DETAILS_FIELDS_GRID_CLASS =
  "grid grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)] items-center gap-x-4 gap-y-3"

export const TASK_DETAILS_FIELD_LABEL_CLASS =
  "self-center justify-self-start text-left text-sm font-medium text-gray-800"

export const TASK_DETAILS_FIELD_CONTROL_CLASS =
  "h-9 min-h-9 w-full min-w-0 rounded-md border border-gray-200 bg-white px-3 text-sm font-normal leading-none text-gray-900 outline-none focus:ring-2 focus:ring-gray-200"

export const TASK_DETAILS_SELECT_TRIGGER_CLASS =
  "h-9 min-h-9 w-full min-w-0 rounded-md border border-gray-200 bg-white text-sm leading-none shadow-none focus:ring-1 focus:ring-gray-200 focus:ring-offset-0"
