"use client"

import React, { createContext, useContext, useMemo } from "react"

export type TasksToolbarFitSnapshot = {
  /** List toolbar: how many optional pills show inline (group, multiselect, color, legend) — max 4. */
  listOptionalVisible: number
  /** Kanban: greedy count — first 5 are portal segments, 6th is multiselect when it fits. */
  kanbanInlineCount: number
  /** Calendar: greedy count — first 4 are portal segments, 5th is multiselect when it fits. */
  calendarInlineCount: number
}

export const defaultTasksToolbarFit: TasksToolbarFitSnapshot = {
  listOptionalVisible: 0,
  kanbanInlineCount: 0,
  calendarInlineCount: 0,
}

type Ctx = {
  byPane: Record<string, TasksToolbarFitSnapshot>
}

const TasksToolbarFitContext = createContext<Ctx>({ byPane: {} })

export function TasksToolbarFitProvider({
  byPane,
  children,
}: {
  byPane: Record<string, TasksToolbarFitSnapshot>
  children: React.ReactNode
}) {
  const v = useMemo(() => ({ byPane }), [byPane])
  return <TasksToolbarFitContext.Provider value={v}>{children}</TasksToolbarFitContext.Provider>
}

export function useTasksToolbarFitForPane(paneKey: string): TasksToolbarFitSnapshot {
  const { byPane } = useContext(TasksToolbarFitContext)
  return byPane[paneKey] ?? defaultTasksToolbarFit
}
