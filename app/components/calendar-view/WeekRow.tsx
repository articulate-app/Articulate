import React from 'react'
import type { Task } from '../../lib/types/tasks'
import { DayCell } from './DayCell'
import { toLocalDayKey } from './calendarDates'

type CalendarTask = Task & {
  kind?: 'task' | 'suggestion'
  entity_type?: 'task' | 'suggestion'
  entity_id?: string | number
}

interface WeekRowProps {
  weekKey: string
  dayKeys: string[]
  tasksByDayKey: Map<string, CalendarTask[]>
  weekExpandedLimit: number
  collapsedLimit: number
  selectedEntityType: 'task' | 'suggestion'
  selectedTaskId?: string | number | null
  activeMonth: Date
  viewMode: 'month' | 'week'
  measureRef?: (el: HTMLElement | null) => void
  onTaskClick?: (task: CalendarTask) => void
  onExpandWeek: (weekKey: string, desiredLimit: number) => void
  onCollapseWeek: (weekKey: string) => void
  getColorClass: (task: CalendarTask) => string
  getInlineStyle: (task: CalendarTask) => React.CSSProperties | undefined
  inlineDraftDayKey?: string | null
  inlineDraftTitle?: string | null
  onBeginInlineCreate?: (dayKey: string) => void
  isInlineCreateBlocked?: boolean
  isMultiselectMode?: boolean
  bulkSelectedTaskIds?: ReadonlySet<number>
  onBulkTaskToggle?: (taskId: number) => void
}

export function WeekRow({
  weekKey,
  dayKeys,
  tasksByDayKey,
  weekExpandedLimit,
  collapsedLimit,
  selectedEntityType,
  selectedTaskId,
  activeMonth,
  viewMode,
  measureRef,
  onTaskClick,
  onExpandWeek,
  onCollapseWeek,
  getColorClass,
  getInlineStyle,
  inlineDraftDayKey,
  inlineDraftTitle,
  onBeginInlineCreate,
  isInlineCreateBlocked = false,
  isMultiselectMode = false,
  bulkSelectedTaskIds,
  onBulkTaskToggle,
}: WeekRowProps) {
  const isExpandedWeek = weekExpandedLimit > collapsedLimit
  const todayKey = toLocalDayKey(new Date())

  return (
    <div
      ref={measureRef}
      data-week-key={weekKey}
      className={viewMode === 'week' ? 'min-h-[calc(100dvh-230px)]' : 'h-full'}
    >
      <div className="grid h-full grid-cols-7 border-l border-gray-200">
        {dayKeys.map((dayKey) => {
          const tasks = tasksByDayKey.get(dayKey) ?? []
          const parsed = dayKey.split('-')
          const month = Number.parseInt(parsed[1] ?? '', 10) - 1
          const year = Number.parseInt(parsed[0] ?? '', 10)
          const isCurrentMonth =
            Number.isFinite(month) &&
            Number.isFinite(year) &&
            month === activeMonth.getMonth() &&
            year === activeMonth.getFullYear()
          const isMonthStart = Number.parseInt(parsed[2] ?? '', 10) === 1
          const isToday = todayKey === dayKey

          return (
            <DayCell
              key={dayKey}
              dayKey={dayKey}
              weekKey={weekKey}
              tasks={tasks}
              visibleLimit={weekExpandedLimit}
              collapsedLimit={collapsedLimit}
              isExpandedWeek={isExpandedWeek}
              isCurrentMonth={isCurrentMonth}
              isToday={isToday}
              isMonthStart={isMonthStart}
              selectedEntityType={selectedEntityType}
              selectedTaskId={selectedTaskId}
              onTaskClick={onTaskClick}
              onExpandWeek={onExpandWeek}
              onCollapseWeek={onCollapseWeek}
              getColorClass={getColorClass}
              getInlineStyle={getInlineStyle}
              inlineDraftTitle={inlineDraftDayKey === dayKey ? inlineDraftTitle : null}
              onBeginInlineCreate={onBeginInlineCreate}
              isInlineCreateBlocked={isInlineCreateBlocked}
              isMultiselectMode={isMultiselectMode}
              bulkSelectedTaskIds={bulkSelectedTaskIds}
              onBulkTaskToggle={onBulkTaskToggle}
            />
          )
        })}
      </div>
    </div>
  )
}
