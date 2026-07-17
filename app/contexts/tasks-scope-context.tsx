"use client";

import React, { createContext, useContext, useMemo } from "react";

export type TasksScope =
  | { type: "global" }
  | { type: "project"; projectId: number };

export interface TasksScopeContextValue {
  scope: TasksScope;
  /**
   * Base path for task links and URL updates (e.g. /tasks or /projects/5).
   * When scope is project, this should be /projects/{projectId}.
   */
  basePath: string;
  /**
   * Query params to preserve when updating URL from TaskDetails (e.g. { tab: "tasks" }).
   * Used when embedded in project tab so we don't drop tab=tasks.
   */
  preserveQueryKeys?: Record<string, string>;
}

const TasksScopeContext = createContext<TasksScopeContextValue | null>(null);

const DEFAULT_VALUE: TasksScopeContextValue = {
  scope: { type: "global" },
  basePath: "/tasks",
};

export function TasksScopeProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: TasksScopeContextValue;
}) {
  const stable = useMemo(() => value, [value.scope.type, value.basePath, JSON.stringify(value.preserveQueryKeys ?? {})]);
  return (
    <TasksScopeContext.Provider value={stable}>
      {children}
    </TasksScopeContext.Provider>
  );
}

export function useTasksScope(): TasksScopeContextValue {
  const ctx = useContext(TasksScopeContext);
  return ctx ?? DEFAULT_VALUE;
}

/** Resolve project filter: from scope when project-scoped, else from URL param. */
export function useTasksScopeProjectParam(urlProject: string | undefined): string | undefined {
  const { scope } = useTasksScope();
  if (scope.type === "project") return String(scope.projectId);
  return urlProject;
}
