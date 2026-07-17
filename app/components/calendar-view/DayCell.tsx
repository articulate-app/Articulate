import React, { useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Task } from '../../lib/types/tasks'
import { cn } from '../../lib/utils'
import { parseLocalDayKey } from './calendarDates'
import { DraftTaskCard } from './DraftTaskCard'
import { TaskCard } from './TaskCard'

type CalendarTask = Task & {
  kind?: 'task' | 'suggestion'
  entity_type?: 'task' | 'suggestion'
  entity_id?: string | number
}

interface DayCellProps {
  dayKey: string
  weekKey: string
  tasks: CalendarTask[]
  visibleLimit: number
  collapsedLimit: number
  isExpandedWeek: boolean
  isCurrentMonth: boolean
  isToday: boolean
  isMonthStart: boolean
  selectedEntityType: 'task' | 'suggestion'
  selectedTaskId?: string | number | null
  onTaskClick?: (task: CalendarTask) => void
  onExpandWeek: (weekKey: string, desiredLimit: number) => void
  onCollapseWeek: (weekKey: string) => void
  getColorClass: (task: CalendarTask) => string
  getInlineStyle: (task: CalendarTask) => React.CSSProperties | undefined
  inlineDraftTitle?: string | null
  onBeginInlineCreate?: (dayKey: string) => void
  isInlineCreateBlocked?: boolean
  isMultiselectMode?: boolean
  bulkSelectedTaskIds?: ReadonlySet<number>
  onBulkTaskToggle?: (taskId: number) => void
}

export function DayCell({
  dayKey,
  weekKey,
  tasks,
  visibleLimit,
  collapsedLimit,
  isExpandedWeek,
  isCurrentMonth,
  isToday,
  isMonthStart,
  selectedEntityType,
  selectedTaskId,
  onTaskClick,
  onExpandWeek,
  onCollapseWeek,
  getColorClass,
  getInlineStyle,
  inlineDraftTitle,
  onBeginInlineCreate,
  isInlineCreateBlocked = false,
  isMultiselectMode = false,
  bulkSelectedTaskIds,
  onBulkTaskToggle,
}: DayCellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day:${dayKey}`,
    data: { type: 'calendar-day-cell', dayKey, weekKey },
  })

  const dayDate = parseLocalDayKey(dayKey)
  const dayNumber = dayDate ? dayDate.getDate() : Number(dayKey.split('-')[2] ?? 0)
  const monthBoundaryLabel = dayDate
    ? dayDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : dayKey

  const visibleTasks = useMemo(() => tasks.slice(0, visibleLimit), [tasks, visibleLimit])
  const remaining = Math.max(0, tasks.length - visibleLimit)
  const canExpand = remaining > 0
  const canCollapse = isExpandedWeek && tasks.length > collapsedLimit
  const hasInlineDraft = typeof inlineDraftTitle === 'string'

  return (
    <div
      ref={setNodeRef}
      data-day-key={dayKey}
      className={cn(
        'h-full min-w-0 border-r border-b border-gray-200 bg-white px-1 py-1 flex flex-col',
        !isCurrentMonth && 'text-gray-400',
        isOver && 'bg-blue-50',
      )}
      onClick={(event) => {
        if (isInlineCreateBlocked) return
        const target = event.target as HTMLElement
        if (target.closest('[data-task-card="true"]')) return
        if (target.closest('[data-calendar-action="true"]')) return
        if (hasInlineDraft) return
        onBeginInlineCreate?.(dayKey)
      }}
    >
      <div className="h-9 flex items-center justify-center gap-1">
        <span
          className={cn(
            isMonthStart
              ? 'text-sm font-medium'
              : 'inline-flex h-6 min-w-6 items-center justify-center rounded-full text-xs',
            isMonthStart
              ? isCurrentMonth
                ? 'text-gray-900'
                : 'text-gray-600'
              : isCurrentMonth
                ? 'text-gray-700'
                : 'text-gray-400',
            !isMonthStart && isToday && 'bg-black text-white',
          )}
        >
          {isMonthStart ? monthBoundaryLabel : dayNumber}
        </span>
      </div>
      <div className={cn('flex-1 min-h-0', isExpandedWeek ? 'overflow-visible' : 'overflow-hidden')}>
        <div className="space-y-1">
          {hasInlineDraft && <DraftTaskCard title={inlineDraftTitle || 'New task'} />}
          {visibleTasks.map((task) => {
            const entityType = String(task.entity_type ?? (task.kind === 'suggestion' ? 'suggestion' : 'task'))
            const entityId = String(task.entity_id ?? task.id)
            const isSelected = Boolean(
              selectedTaskId != null &&
                selectedEntityType === (entityType === 'suggestion' ? 'suggestion' : 'task') &&
                String(selectedTaskId) === entityId,
            )
            const isSuggestion = entityType === 'suggestion' || task.kind === 'suggestion'
            const numericId = Number(task.id)
            const isBulkSelected = Boolean(
              isMultiselectMode && bulkSelectedTaskIds && Number.isFinite(numericId) && bulkSelectedTaskIds.has(numericId),
            )

            return (
              <TaskCard
                key={`${entityType}:${entityId}`}
                task={task}
                isSelected={isSelected}
                isBulkSelected={isBulkSelected}
                colorClass={getColorClass(task)}
                style={getInlineStyle(task)}
                isMultiselectMode={isMultiselectMode}
                isSuggestion={Boolean(isSuggestion)}
                onBulkTaskToggle={onBulkTaskToggle}
                onTaskClick={onTaskClick}
              />
            )
          })}
        </div>
      </div>

      <div className="h-[18px] shrink-0 flex items-start">
        {canExpand && (
          <button
            type="button"
            data-calendar-action="true"
            className="text-[11px] text-gray-500 underline hover:text-gray-700"
            onClick={() => onExpandWeek(weekKey, tasks.length)}
          >
            +{remaining} more
          </button>
        )}
        {!canExpand && canCollapse && (
          <button
            type="button"
            data-calendar-action="true"
            className="text-[11px] text-gray-500 underline hover:text-gray-700"
            onClick={() => onCollapseWeek(weekKey)}
          >
            Show less
          </button>
        )}
      </div>
    </div>
  )
}
