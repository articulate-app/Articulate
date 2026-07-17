"use client"

import TasksRouteLayout from "../../tasks/layout"
import TasksPageClient from "../../tasks/TasksPageClient"

export function UnifiedShellPage() {
  return (
    <TasksRouteLayout modal={null}>
      <TasksPageClient />
    </TasksRouteLayout>
  )
}
