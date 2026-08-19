"use client"

import { ChevronDown, ChevronRight, Folder } from 'lucide-react'
import { useMobileDetection } from '../../hooks/use-mobile-detection'
import { flexRender, type ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/UserAvatar'
import { getImageUrl } from '../../lib/public-media'
import { formatCompactDateDisplay } from '../../lib/utils'

/** Secondary metadata size for compact row dates (title uses text-sm). */
export const COMPACT_DATE_TEXT_CLASS = 'text-sm'

/**
 * Shared trigger/display styling for compact inline dates. Uses a permanent 1px border
 * (transparent at rest) so switching to edit mode never changes box width.
 */
export const COMPACT_DATE_TRIGGER_CLASS =
  'whitespace-nowrap text-sm shrink-0 cursor-pointer border border-transparent hover:bg-white hover:border-gray-300 px-1 py-0.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400'

/** Active/hover/edit affordance — same visual, no width change vs transparent border. */
export const COMPACT_DATE_TRIGGER_ACTIVE_CLASS = 'bg-white border-gray-300'

/**
 * Project identity marker — folder in a rounded square (directory / ChatGPT list style).
 * Tints the folder with the project color; suggestions use a violet fallback.
 */
export function CompactProjectMarker({ task, isSuggestion }: { task: any; isSuggestion: boolean }) {
  const color = (task as any)?.project_color ?? (task as any)?.projects?.color ?? null
  const projectName =
    (task as any)?.project_name ?? (task as any)?.projects?.name ?? (isSuggestion ? 'Suggestion' : 'Project')
  const folderColor = color || (isSuggestion ? '#a78bfa' : '#9ca3af')

  return (
    <span
      title={projectName}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white"
    >
      <Folder
        className="h-3 w-3"
        style={{ color: folderColor }}
        strokeWidth={1.75}
        aria-hidden
      />
    </span>
  )
}

/**
 * Compact (narrow left-pane) row contents: project marker + title left-aligned & truncated; assignee
 * avatar and the selected date dimension right-aligned. Overdue dates stay red. Main tasks render a
 * minimal subtask toggle (icon-only) when `onToggleSubtasks` is provided. Works for tasks + suggestions.
 */
export function CompactRowContent({
  task,
  dateField,
  isMainTask = false,
  isExpanded = false,
  onToggleSubtasks,
}: {
  task: any
  dateField: 'delivery_date' | 'publication_date'
  isMainTask?: boolean
  isExpanded?: boolean
  onToggleSubtasks?: (taskId: number) => void
}) {
  const isSuggestion = (task as any)?.kind === 'suggestion'
  const title =
    (task as any)?.title ??
    (task as any)?.proposed_title ??
    (task as any)?.ai_title ??
    'Untitled'

  // Suggestions: honor the selected date dimension first, then fall back to the planned/other date.
  const rawDate = isSuggestion
    ? ((task as any)?.[dateField] ??
      (task as any)?.planned_for_date ??
      (task as any)?.delivery_date ??
      (task as any)?.publication_date ??
      null)
    : (task as any)?.[dateField]
  const displayDate = formatCompactDateDisplay(rawDate)

  const isOverdue =
    !isSuggestion &&
    (dateField === 'publication_date'
      ? !!(task as any)?.is_publication_overdue
      : !!(task as any)?.is_overdue)

  const displayName =
    (task as any)?.assigned_user?.full_name ?? (task as any)?.assigned_to_name ?? ''
  const photoUrl =
    (task as any)?.assignedToPhotoUrl ??
    getImageUrl((task as any)?.assigned_to_photo ?? (task as any)?.assigned_user?.photo) ??
    null
  const hasAssignee = !!((task as any)?.assigned_to_id || displayName || photoUrl)

  const showToggle = isMainTask && !isSuggestion && !!onToggleSubtasks

  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="block min-w-0 flex-1 truncate text-sm font-normal text-gray-900">{title}</span>
        {showToggle ? (
          <button
            type="button"
            aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
            onClick={(e) => {
              e.stopPropagation()
              onToggleSubtasks?.(Number((task as any)?.id ?? (task as any)?.entity_id))
            }}
            onMouseDown={(e) => e.stopPropagation()}
            tabIndex={0}
            className={cn(
              'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition',
              isExpanded ? 'text-blue-600' : 'text-gray-400 hover:bg-gray-100 hover:text-blue-600',
            )}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
      <div className="ml-2 flex shrink-0 items-center justify-end gap-2">
        {hasAssignee ? (
          <UserAvatar name={displayName || null} photoUrl={photoUrl} size="xs" className="!h-5 !w-5 !min-h-5 !min-w-5" />
        ) : null}
        {displayDate ? (
          <span
            className={cn(
              COMPACT_DATE_TEXT_CLASS,
              'whitespace-nowrap',
              isOverdue ? 'text-red-600' : 'text-gray-500',
            )}
          >
            {displayDate}
          </span>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Render a single expanded/full-list column `cell` renderer for the given row. Reuses the exact same
 * inline-edit closures (editing state, validation, optimistic save, hover-vs-click, keyboard) defined
 * in `TaskList`, so compact editing behaves identically to the expanded list by construction. This is
 * the same invocation shape `UnifiedGroupedTaskList` uses for its non-table fallback path.
 */
function renderColumnCell(columns: ColumnDef<any>[], colKey: string, task: any) {
  const col = (columns as any[]).find((c) => (c.id ?? (c as any).accessorKey) === colKey)
  if (!col || !col.cell) return null
  return flexRender(col.cell as any, {
    // `compact` lets the shared date cells render the short current-year format (dd/mmm) for compact
    // rows without affecting the expanded list or the inline date editor.
    compact: true,
    getValue: () => (task as any)[(col as any).accessorKey],
    row: { original: task },
    column: col,
  } as any)
}

/**
 * Compact (narrow left-pane) row contents WITH inline editing. Instead of static text, it mounts the
 * real expanded-list column cells for the editable fields visible in compact mode:
 *   - title (left, flex-1) — includes the same subtask expand/collapse toggle as the expanded list
 *   - assignee (right)
 *   - the selected date dimension (delivery_date | publication_date) (right)
 *
 * Behavior (edit/save/cancel/keyboard, calendar-opens-on-click-only, optimistic updates, permission
 * and suggestion gating) is inherited verbatim from those cells — no compact-only editing flow. The
 * project identity stays a static marker (compact shows project as a logo/color dot, not a labeled
 * field). Row click-to-open vs inline-edit is handled by the cells themselves: editable controls
 * stopPropagation / mark `data-inline-editor`, so clicking a field edits it while clicking the
 * surrounding (non-editable) row area still opens the detail pane.
 */
export function CompactEditableRowContent({
  task,
  columns,
  dateField,
  isMultiselectMode = false,
  isTaskSelected = false,
  onTaskToggle,
  dragHandle,
  readOnly = false,
}: {
  task: any
  columns: ColumnDef<any>[]
  dateField: 'delivery_date' | 'publication_date'
  /** When true, render the same far-left selection checkbox the expanded list shows in multiselect mode. */
  isMultiselectMode?: boolean
  isTaskSelected?: boolean
  onTaskToggle?: (taskId: number) => void
  dragHandle?: React.ReactNode
  /** Mobile: show static cells so a tap opens detail instead of inline editors. */
  readOnly?: boolean
}) {
  const isSuggestion = (task as any)?.kind === 'suggestion'
  const taskId = Number((task as any)?.id ?? (task as any)?.entity_id)
  const isMobile = useMobileDetection()
  const isReadOnly = readOnly || isMobile

  if (isReadOnly) {
    return (
      <div className="flex w-full min-w-0 items-center gap-2 overflow-hidden">
        {isMobile ? null : dragHandle}
        <div className="min-w-0 flex-1">
          <CompactRowContent task={task} dateField={dateField} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full min-w-0 items-center gap-2 overflow-hidden">
      {isMultiselectMode ? (
        // Mirror the expanded list: a checkbox per selectable row, suggestions are not selectable
        // (empty spacer keeps the project marker / title aligned across rows). stopPropagation so the
        // checkbox toggles selection without triggering row click-to-open.
        isSuggestion ? (
          <span className="w-4 shrink-0" aria-hidden />
        ) : (
          <input
            type="checkbox"
            checked={!!isTaskSelected}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation()
              if (Number.isFinite(taskId)) onTaskToggle?.(taskId)
            }}
            className="h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            aria-label="Select task"
          />
        )
      ) : null}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-left">
        {dragHandle}
        <div className="min-w-0 flex-1 overflow-hidden">{renderColumnCell(columns, 'title', task)}</div>
      </div>
      <div className="ml-2 flex shrink-0 items-center justify-end gap-1.5">
        <div className="flex shrink-0 items-center">{renderColumnCell(columns, 'users', task)}</div>
        <div className="flex max-w-[120px] shrink-0 items-center">
          {renderColumnCell(columns, dateField, task)}
        </div>
      </div>
    </div>
  )
}
