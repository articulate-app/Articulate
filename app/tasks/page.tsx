"use client"

import { TasksLayout } from "../components/tasks/TasksLayout"
import { TaskList } from "../components/tasks/TaskList"

export default function TasksPage() {
  return (
    <TasksLayout>
      <div className="flex-1 p-4">
        <h1 className="text-2xl font-semibold mb-4">Tasks</h1>
        <TaskList />
      </div>
    </TasksLayout>
  )
} 