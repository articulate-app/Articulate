"use client";

import React, { createContext, useContext } from "react";

interface TasksSidebarContextValue {
  isMobileMenuOpen: boolean;
  onSidebarToggle: () => void;
}

const TasksSidebarContext = createContext<TasksSidebarContextValue | null>(null);

export function TasksSidebarProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: TasksSidebarContextValue;
}) {
  return (
    <TasksSidebarContext.Provider value={value}>
      {children}
    </TasksSidebarContext.Provider>
  );
}

export function useTasksSidebar() {
  const ctx = useContext(TasksSidebarContext);
  return ctx;
}
