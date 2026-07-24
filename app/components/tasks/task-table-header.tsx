"use client"

import * as React from 'react'
import { flexRender, Table } from '@tanstack/react-table'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ObjectListColumnHeaderContent } from '../search/object-list-column-header'

/** Column id -> display label for DragOverlay */
export const COLUMN_LABELS: Record<string, string> = {
  list_color: 'Color',
  users: 'Assignee',
  projects: 'Project',
  project_statuses: 'Status',
  delivery_date: 'Due date',
  publication_date: 'Publish date',
  updated_at: 'Last Update',
  content_type_title: 'Content Type',
  production_type_title: 'Production Type',
  language_code: 'Language',
}

export function getColumnLabel(colId: string): string {
  return COLUMN_LABELS[colId] ?? colId
}

/** Prevents pointer events from initiating column DnD; use on resize handles and sort buttons */
export function stopDnd(e: React.PointerEvent | React.MouseEvent | React.TouchEvent) {
  e.stopPropagation()
  ;(e as any).nativeEvent?.stopImmediatePropagation?.()
}

interface TaskTableHeaderProps<T> {
  table: Table<T>
  columns: any[]
  gridTemplateColumns: string
  onColumnOrderChange?: (fromId: string, toIndex: number) => void
  /** Column id we're currently dragging over (for drop indicator) */
  overColId?: string | null
  /** True while a column is being dragged; freezes non-active header cells to prevent visual shift */
  isColumnDragging?: boolean
  /** Double-click on resize handle resets column to this width */
  onResizeHandleDoubleClick?: (columnId: string) => void
  /** Default widths for reset; keyed by column id */
  defaultWidthsRef?: React.MutableRefObject<Record<string, number>>
}

interface SortableHeaderCellProps {
  header: any
  colId: string
  isSpacer: boolean
  isLastRealBeforeSpacer: boolean
  isDraggable: boolean
  dropIndex: number | null
  idx: number
  gridTemplateColumns: string
  isColumnDragging?: boolean
  onResizeHandleDoubleClick?: (columnId: string) => void
  defaultWidthsRef?: React.MutableRefObject<Record<string, number>>
}

function SortableHeaderCell({
  header,
  colId,
  isSpacer,
  isLastRealBeforeSpacer,
  isDraggable,
  dropIndex,
  idx,
  gridTemplateColumns,
  isColumnDragging = false,
  onResizeHandleDoubleClick,
  defaultWidthsRef,
}: SortableHeaderCellProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: String(colId),
    disabled: !isDraggable,
  })

  const style = React.useMemo((): React.CSSProperties | undefined => {
    // While dragging: freeze ALL header cells (including active) so headers don't shift; DragOverlay shows the label
    if (isColumnDragging) {
      return {
        transform: 'none',
        transition: 'none',
        ...(isDragging ? { opacity: 0.2 } : {}),
      }
    }
    if (transform) {
      return {
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
        opacity: isDragging ? 0.5 : 1,
      }
    }
    return undefined
  }, [transform, transition, isDragging, isColumnDragging])

  const handleResizePointerDown = React.useCallback(
    (e: React.PointerEvent | React.MouseEvent | React.TouchEvent) => {
      stopDnd(e)
      header.getResizeHandler()(e as any)
    },
    [header],
  )

  const handleResizeDoubleClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      ;(e as any).nativeEvent?.stopImmediatePropagation?.()
      onResizeHandleDoubleClick?.(colId)
    },
    [colId, onResizeHandleDoubleClick],
  )

  return (
    <th
      ref={setNodeRef}
      style={{ ...style, gridTemplateColumns: undefined }}
      colSpan={header.colSpan}
      data-col={colId}
      data-col-id={colId}
      className={cn(
        'task-cell',
        isSpacer && 'task-spacer-cell p-0 border-transparent',
        !isSpacer && 'task-header-cell px-3 py-1.5 text-left text-xs font-medium text-gray-500 group select-none relative',
        !isSpacer && !isLastRealBeforeSpacer && 'border-r border-gray-200',
        colId === 'title' && 'task-cell--sticky',
        isDraggable && 'cursor-grab active:cursor-grabbing',
      )}
      {...(isDraggable ? attributes : {})}
      {...(isDraggable ? listeners : {})}
    >
      {dropIndex === idx && (
        <div className="task-header-drop-indicator" style={{ left: 0 }} />
      )}
      {!isSpacer && (
        <div className="flex items-center w-full h-full gap-1">
          {isDraggable && (
            <div
              className={cn(
                'task-header-draggable flex shrink-0 p-0.5 rounded cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600',
                isDragging && 'task-header-dragging opacity-60',
              )}
            >
              <GripVertical size={12} />
            </div>
          )}
          <div className="flex-1 min-w-0 flex items-center">
            {flexRender(header.column.columnDef.header, header.getContext())}
          </div>
          {header.column.getCanResize?.() && (
            <div
              data-no-dnd
              data-resize-handle
              draggable={false}
              onPointerDown={handleResizePointerDown}
              onMouseDown={handleResizePointerDown}
              onTouchStart={handleResizePointerDown}
              onDoubleClick={handleResizeDoubleClick}
              className="absolute right-0 top-0 h-full w-2 cursor-col-resize z-50 transition-colors resize-handle"
              style={{ userSelect: 'none' }}
            />
          )}
        </div>
      )}
    </th>
  )
}

export function TaskTableHeader<T>({ table, columns, gridTemplateColumns, onColumnOrderChange, overColId, isColumnDragging, onResizeHandleDoubleClick, defaultWidthsRef }: TaskTableHeaderProps<T>) {
  // Single source of truth: iterate columns prop (orderedColumns from TaskList) to match body row order
  const orderedHeaders = React.useMemo(() => {
    const headerGroup = table.getHeaderGroups()[0]
    const headerMap = new Map((headerGroup?.headers ?? []).map((h) => [h.column.id, h]))
    const result: typeof headerGroup.headers = []
    for (const col of columns) {
      const id = (col as any).id ?? (col as any).accessorKey
      if (!id) continue
      const header = headerMap.get(id)
      if (header) result.push(header)
    }
    return result
  }, [table, columns])

  const dropIndex = React.useMemo(() => {
    if (!overColId) return null
    const idx = orderedHeaders.findIndex((h) => h.column.id === overColId)
    return idx >= 0 ? idx : null
  }, [overColId, orderedHeaders])

  return (
    <thead className="task-header sticky top-0 z-40 bg-white border-b shadow-sm">
      {table.getHeaderGroups().map((headerGroup) => (
        <tr key={headerGroup.id} data-row-type="header" className="task-row" style={{ gridTemplateColumns }}>
          {orderedHeaders.map((header, idx) => {
            const isSpacer = header.column.id === '__spacer'
            const colId = header.column.id
            const isDraggable =
              !!onColumnOrderChange && !isSpacer && colId !== 'title' && colId !== 'select' && colId !== 'list_color'
            const isLastRealBeforeSpacer =
              !isSpacer &&
              orderedHeaders.some((h) => h.column.id === '__spacer') &&
              idx === orderedHeaders.filter((h) => h.column.id !== '__spacer').length - 1

            return (
              <SortableHeaderCell
                key={header.id}
                header={header}
                colId={colId}
                isSpacer={isSpacer}
                isLastRealBeforeSpacer={isLastRealBeforeSpacer}
                isDraggable={isDraggable}
                dropIndex={dropIndex}
                idx={idx}
                gridTemplateColumns={gridTemplateColumns}
                isColumnDragging={isColumnDragging}
                onResizeHandleDoubleClick={onResizeHandleDoubleClick}
                defaultWidthsRef={defaultWidthsRef}
              />
            )
          })}
        </tr>
      ))}
    </thead>
  )
}

/** Sticky header for compact (single-column) task list — mirrors compact row fields. */
export function CompactTaskTableHeader({
  dateField = 'delivery_date',
}: {
  dateField?: 'delivery_date' | 'publication_date'
}) {
  const dateLabel = dateField === 'publication_date' ? 'Publish date' : 'Due date'
  return (
    <thead className="task-header sticky top-0 z-40 border-b bg-white shadow-sm">
      <tr data-row-type="header" className="task-row" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <th className="task-cell task-cell-span-full task-header-cell px-3 py-1.5 text-left text-xs font-medium text-gray-500">
          <ObjectListColumnHeaderContent
            primary="Title"
            secondary="Assignee"
            tertiary={dateLabel}
          />
        </th>
      </tr>
    </thead>
  )
}
