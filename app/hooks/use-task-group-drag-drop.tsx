'use client'

import * as React from 'react'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useQueryClient } from '@tanstack/react-query'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GroupByField } from '@/store/task-grouping'
import {
  getGroupDropId,
  getGroupEdgeDropId,
  getRowInsertDropId,
  getTaskDragId,
  isGroupKeyDroppable,
  isTaskDraggableForGroupDrop,
  normalizeCanonicalGroupKey,
  resolveTaskDropTarget,
  supportsTaskGroupDragDrop,
  type TaskDropTarget,
  type TaskGroupingEditFields,
} from '@/lib/task-grouping-drop-config'
import {
  applyTaskGroupDropOptimistic,
  rollbackTaskGroupDropOptimistic,
} from '@/lib/apply-task-group-drop'
import { repositionTaskInGroupCaches } from '../../src/hooks/use-task-group-tasks-query'
import { toast } from '@/components/ui/use-toast'

export type TaskGroupDragDropContextValue = {
  groupBy: GroupByField | null
  enabled: boolean
  isTaskPending: (taskId: number | string) => boolean
}

const TaskGroupDragDropContext = React.createContext<TaskGroupDragDropContextValue>({
  groupBy: null,
  enabled: false,
  isTaskPending: () => false,
})

const TaskGroupDropIndicatorContext = React.createContext<string | null>(null)

export function useTaskGroupDragDropContext() {
  return React.useContext(TaskGroupDragDropContext)
}

function useTaskGroupDropIndicatorId() {
  return React.useContext(TaskGroupDropIndicatorContext)
}

type UseTaskGroupDragDropOptions = {
  groupBy: GroupByField | null
  editFields?: TaskGroupingEditFields | null
  enabled?: boolean
  isMultiselectMode?: boolean
  updateTaskInList?: (task: Record<string, unknown>) => void
}

export function useTaskGroupDragDrop(options: UseTaskGroupDragDropOptions) {
  const {
    groupBy,
    editFields,
    enabled = true,
    isMultiselectMode = false,
    updateTaskInList,
  } = options

  const queryClient = useQueryClient()
  const supabase = React.useMemo(() => createClientComponentClient(), [])

  const dragEnabled =
    enabled && !!groupBy && supportsTaskGroupDragDrop(groupBy) && !isMultiselectMode

  const [activeTask, setActiveTask] = React.useState<Record<string, unknown> | null>(null)
  const [activeSourceGroupKey, setActiveSourceGroupKey] = React.useState<string | null>(null)
  const [activeDropIndicatorId, setActiveDropIndicatorId] = React.useState<string | null>(null)
  const pendingTaskIdsRef = React.useRef<Set<string>>(new Set())

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 8 } }),
  )

  const isTaskPending = React.useCallback((taskId: number | string) => {
    return pendingTaskIdsRef.current.has(String(taskId))
  }, [])

  const resetDragState = React.useCallback(() => {
    setActiveTask(null)
    setActiveSourceGroupKey(null)
    setActiveDropIndicatorId(null)
  }, [])

  const resolveDropIndicatorId = React.useCallback(
    (target: TaskDropTarget | null) => {
      if (!target) return null
      if (target.kind === 'row-insert') {
        return getRowInsertDropId(target.groupKey, target.beforeTaskId, groupBy)
      }
      return getGroupEdgeDropId(target.groupKey, target.edge, groupBy)
    },
    [groupBy],
  )

  const handleDragStart = React.useCallback(
    (event: DragStartEvent) => {
      if (!dragEnabled) return
      const data = event.active.data.current as
        | { task?: Record<string, unknown>; sourceGroupKey?: string }
        | undefined
      if (!data?.task || !data.sourceGroupKey) return
      const normalizedSource = normalizeCanonicalGroupKey(data.sourceGroupKey, groupBy) ?? data.sourceGroupKey
      setActiveTask(data.task)
      setActiveSourceGroupKey(normalizedSource)
    },
    [dragEnabled, groupBy],
  )

  const handleDragOver = React.useCallback(
    (event: DragOverEvent) => {
      if (!dragEnabled) return
      const target = resolveTaskDropTarget(event.over, groupBy)
      if (!target || !groupBy || !isGroupKeyDroppable(groupBy, target.groupKey)) {
        setActiveDropIndicatorId(null)
        return
      }
      setActiveDropIndicatorId(resolveDropIndicatorId(target))
    },
    [dragEnabled, groupBy, resolveDropIndicatorId],
  )

  const handleDragEnd = React.useCallback(
    async (event: DragEndEvent) => {
      const previousTask = activeTask
      const sourceGroupKey = activeSourceGroupKey
        ? normalizeCanonicalGroupKey(activeSourceGroupKey, groupBy)
        : null
      const target = resolveTaskDropTarget(event.over, groupBy)
      resetDragState()

      if (!dragEnabled || !groupBy || !previousTask || !sourceGroupKey || !target) return
      if (!isGroupKeyDroppable(groupBy, target.groupKey)) return

      const destinationGroupKey = target.groupKey
      const taskId = Number(previousTask.entity_id ?? previousTask.id)
      if (!Number.isFinite(taskId)) return
      const taskIdStr = String(taskId)

      if (pendingTaskIdsRef.current.has(taskIdStr)) return

      const beforeTaskId =
        target.kind === 'row-insert'
          ? target.beforeTaskId
          : target.edge === 'start'
            ? null
            : null

      if (destinationGroupKey === sourceGroupKey) {
        repositionTaskInGroupCaches({
          taskId,
          groupKey: destinationGroupKey,
          beforeTaskId,
        })
        return
      }

      const dropArgs = {
        groupBy,
        sourceGroupKey,
        destinationGroupKey,
        task: previousTask,
        editFields,
        queryClient,
        updateTaskInList,
      }

      const optimistic = applyTaskGroupDropOptimistic(dropArgs)
      if (!optimistic.ok) return

      pendingTaskIdsRef.current.add(taskIdStr)
      try {
        const { error } = await supabase
          .from('tasks')
          .update(optimistic.updatePayload)
          .eq('id', taskId)

        if (error) throw error
      } catch (err: unknown) {
        rollbackTaskGroupDropOptimistic(dropArgs, previousTask)
        const message = err instanceof Error ? err.message : 'Unknown error'
        toast({
          title: 'Failed to update task',
          description: message,
          variant: 'destructive',
        })
      } finally {
        pendingTaskIdsRef.current.delete(taskIdStr)
      }
    },
    [
      activeSourceGroupKey,
      activeTask,
      dragEnabled,
      editFields,
      groupBy,
      queryClient,
      resetDragState,
      supabase,
      updateTaskInList,
    ],
  )

  const contextValue = React.useMemo<TaskGroupDragDropContextValue>(
    () => ({
      groupBy,
      enabled: dragEnabled,
      isTaskPending,
    }),
    [dragEnabled, groupBy, isTaskPending],
  )

  const providerProps = dragEnabled
    ? {
        sensors,
        onDragStart: handleDragStart,
        onDragOver: handleDragOver,
        onDragEnd: handleDragEnd,
        onDragCancel: resetDragState,
      }
    : null

  return {
    dragEnabled,
    contextValue,
    providerProps,
    activeTask,
    activeDropIndicatorId,
  }
}

type TaskGroupDragDropProviderProps = {
  providerProps: ReturnType<typeof useTaskGroupDragDrop>['providerProps']
  contextValue: TaskGroupDragDropContextValue
  activeDropIndicatorId: string | null
  children: React.ReactNode
  dragOverlay?: React.ReactNode
}

export function TaskGroupDragDropProvider({
  providerProps,
  contextValue,
  activeDropIndicatorId,
  children,
  dragOverlay,
}: TaskGroupDragDropProviderProps) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 8 } }),
  )

  return (
    <TaskGroupDragDropContext.Provider value={contextValue}>
      <TaskGroupDropIndicatorContext.Provider value={activeDropIndicatorId}>
        <DndContext
          sensors={providerProps?.sensors ?? sensors}
          collisionDetection={pointerWithin}
          onDragStart={providerProps?.onDragStart}
          onDragOver={providerProps?.onDragOver}
          onDragEnd={providerProps?.onDragEnd}
          onDragCancel={providerProps?.onDragCancel}
        >
          {children}
          {providerProps ? (
            <DragOverlay dropAnimation={null}>{dragOverlay ?? null}</DragOverlay>
          ) : null}
        </DndContext>
      </TaskGroupDropIndicatorContext.Provider>
    </TaskGroupDragDropContext.Provider>
  )
}

type TaskDragHandleProps = {
  task: Record<string, unknown>
  sourceGroupKey: string
  className?: string
}

export function TaskDragHandle({ task, sourceGroupKey, className }: TaskDragHandleProps) {
  const { groupBy, enabled, isTaskPending } = useTaskGroupDragDropContext()
  const taskId = Number(task.entity_id ?? task.id)
  const dragId = getTaskDragId(task)
  const draggable =
    enabled &&
    isTaskDraggableForGroupDrop(task, groupBy, { isPending: isTaskPending(taskId) })

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId ?? 'task-drag:invalid',
    disabled: !draggable || !dragId,
    data: { type: 'task', task, sourceGroupKey, taskId },
  })

  if (!draggable) {
    return <span className={cn('inline-block h-5 w-5 shrink-0', className)} aria-hidden />
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-label="Drag task to another group"
      className={cn(
        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded',
        'text-muted-foreground opacity-0',
        '[@media(hover:hover)]:group-hover/task-row:opacity-100',
        'cursor-grab active:cursor-grabbing hover:bg-gray-100',
        isDragging && 'opacity-100',
        className,
      )}
      onClick={e => {
        e.preventDefault()
        e.stopPropagation()
      }}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  )
}

type DraggableTaskRowProps = {
  className?: string
  style?: React.CSSProperties
  onClick?: React.MouseEventHandler<HTMLTableRowElement>
  measureRef?: (node: HTMLElement | null) => void
  children: React.ReactNode
  dataIndex?: number
  dataRowType?: string
  rowProps?: React.HTMLAttributes<HTMLTableRowElement>
  insertDropEdges?: React.ReactNode
}

export function DraggableTaskRow({
  className,
  style,
  onClick,
  measureRef,
  children,
  dataIndex,
  dataRowType,
  rowProps,
  insertDropEdges,
}: DraggableTaskRowProps) {
  return (
    <tr
      ref={measureRef as React.Ref<HTMLTableRowElement>}
      className={cn(className, 'group/task-row relative')}
      style={style}
      data-index={dataIndex}
      data-row-type={dataRowType}
      onClick={onClick}
      {...rowProps}
    >
      {insertDropEdges}
      {children}
    </tr>
  )
}

type GroupDropZoneProps = {
  groupKey: string
  slot: string
  edge?: 'start' | 'end'
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
  as?: 'tr' | 'td'
  dataIndex?: number
  dataRowType?: string
  trProps?: React.HTMLAttributes<HTMLTableRowElement>
  tdProps?: React.TdHTMLAttributes<HTMLTableCellElement>
  measureRef?: (node: HTMLElement | null) => void
  colSpan?: number
}

export function GroupDropZone({
  groupKey,
  slot,
  edge = 'start',
  className,
  style,
  children,
  as = 'tr',
  dataIndex,
  dataRowType,
  trProps,
  tdProps,
  measureRef,
  colSpan,
}: GroupDropZoneProps) {
  const { groupBy, enabled } = useTaskGroupDragDropContext()
  const activeDropIndicatorId = useTaskGroupDropIndicatorId()
  const canonicalGroupKey = normalizeCanonicalGroupKey(groupKey, groupBy) ?? groupKey
  const droppable = isGroupKeyDroppable(groupBy, canonicalGroupKey)
  const dropId = getGroupEdgeDropId(canonicalGroupKey, edge, groupBy)

  const { setNodeRef } = useDroppable({
    id: getGroupDropId(canonicalGroupKey, slot, groupBy),
    disabled: !enabled || !droppable,
    data: { type: 'group-edge', groupKey: canonicalGroupKey, edge },
  })

  const isActive = enabled && droppable && activeDropIndicatorId === dropId

  const setRefs = React.useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node)
      measureRef?.(node)
    },
    [measureRef, setNodeRef],
  )

  const activeLineClass = isActive
    ? edge === 'start'
      ? 'shadow-[inset_0_2px_0_0_#3b82f6]'
      : 'shadow-[inset_0_-2px_0_0_#3b82f6]'
    : undefined

  if (as === 'td') {
    return (
      <td
        ref={setRefs as React.Ref<HTMLTableCellElement>}
        className={cn('relative', className, activeLineClass)}
        {...tdProps}
      >
        {children}
      </td>
    )
  }

  return (
    <tr
      ref={setRefs as React.Ref<HTMLTableRowElement>}
      className={cn('relative', className, activeLineClass)}
      style={style}
      data-index={dataIndex}
      data-row-type={dataRowType}
      {...trProps}
    >
      {colSpan != null ? (
        <td colSpan={colSpan} className="relative p-0">
          {children}
        </td>
      ) : (
        children
      )}
    </tr>
  )
}

type TaskRowInsertDropEdgeProps = {
  groupKey: string
  beforeTaskId: number | null
  edge: 'top' | 'bottom'
}

/** Zero-height droppable overlay on an existing task row boundary (no extra layout rows). */
export function TaskRowInsertDropEdge({
  groupKey,
  beforeTaskId,
  edge,
}: TaskRowInsertDropEdgeProps) {
  const { groupBy, enabled } = useTaskGroupDragDropContext()
  const activeDropIndicatorId = useTaskGroupDropIndicatorId()
  const canonicalGroupKey = normalizeCanonicalGroupKey(groupKey, groupBy) ?? groupKey
  const droppable = isGroupKeyDroppable(groupBy, canonicalGroupKey)
  const dropId = getRowInsertDropId(canonicalGroupKey, beforeTaskId, groupBy)

  const { setNodeRef } = useDroppable({
    id: dropId,
    disabled: !enabled || !droppable,
    data: { type: 'row-insert', groupKey: canonicalGroupKey, beforeTaskId },
  })

  const isActive = enabled && droppable && activeDropIndicatorId === dropId

  return (
    <div
      ref={setNodeRef}
      aria-hidden
      className={cn(
        'absolute inset-x-0 z-20',
        edge === 'top' ? 'top-0 -translate-y-1/2' : 'bottom-0 translate-y-1/2',
      )}
      style={{ height: 8 }}
    >
      {isActive ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-3 top-1/2 z-30 h-0.5 -translate-y-1/2 rounded-full bg-blue-500"
        />
      ) : null}
    </div>
  )
}

export function TaskGroupDragOverlayRow({
  task,
  className,
}: {
  task: Record<string, unknown> | null
  className?: string
}) {
  if (!task) return null
  const title = typeof task.title === 'string' ? task.title : 'Task'
  return (
    <div
      className={cn(
        'rounded-md border border-blue-300 bg-white px-3 py-2 text-sm shadow-lg',
        className,
      )}
    >
      {title}
    </div>
  )
}
