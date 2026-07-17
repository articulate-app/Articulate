import React from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Task } from '../../lib/types/tasks'
import { CalendarTaskCard } from './calendar-task-card'

type CalendarTask = Task & {
  kind?: 'task' | 'suggestion'
  entity_type?: 'task' | 'suggestion'
  entity_id?: string | number
}

interface TaskCardProps {
  task: CalendarTask
  isSelected: boolean
  isBulkSelected?: boolean
  colorClass: string
  style?: React.CSSProperties
  isMultiselectMode?: boolean
  isSuggestion?: boolean
  onBulkTaskToggle?: (taskId: number) => void
  onTaskClick?: (task: CalendarTask) => void
}

export function TaskCard({
  task,
  isSelected,
  isBulkSelected = false,
  colorClass,
  style,
  isMultiselectMode = false,
  isSuggestion = false,
  onBulkTaskToggle,
  onTaskClick,
}: TaskCardProps) {
  const entityType = String(task.entity_type ?? (task.kind === 'suggestion' ? 'suggestion' : 'task'))
  const entityId = String(task.entity_id ?? task.id)
  const draggableId = `${entityType}:${entityId}`
  const isSuggestionEntity = isSuggestion || entityType === 'suggestion' || task.kind === 'suggestion'

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draggableId,
    disabled: isSuggestionEntity,
    data: {
      type: 'calendar-task-card',
      task,
    },
  })

  const transformStyle = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined

  return (
    <div
      ref={setNodeRef}
      data-task-card="true"
      style={{
        ...transformStyle,
        opacity: isDragging ? 0.65 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <CalendarTaskCard
        task={task as any}
        colorClass={colorClass}
        style={style}
        isSelected={isSelected}
        isBulkSelected={isBulkSelected}
        onClick={() => {
          if (isMultiselectMode && !isSuggestionEntity && onBulkTaskToggle) {
            const id = Number(task.entity_id ?? task.id)
            if (Number.isFinite(id)) onBulkTaskToggle(id)
            return
          }
          onTaskClick?.(task)
        }}
      />
    </div>
  )
}
