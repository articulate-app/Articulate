"use client"

import { useEffect, useState } from "react"
import { Task, getTasks } from "@/lib/services/tasks"
import { format } from "date-fns"

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadTasks() {
      try {
        console.log("Loading tasks...")
        const result = await getTasks({})
        console.log("Tasks loaded:", result)
        if (!result.tasks) {
          throw new Error("No tasks returned from the server")
        }
        setTasks(result.tasks)
      } catch (err) {
        console.error("Error loading tasks:", err)
        setError(err instanceof Error ? err.message : "Failed to load tasks")
      } finally {
        setLoading(false)
      }
    }

    loadTasks()
  }, [])

  if (loading) {
    return <div className="p-4">Loading tasks...</div>
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-red-500 mb-2">Error: {error}</div>
        <div className="text-sm text-gray-500 mb-4">
          Make sure you're connected to the internet and the Supabase service is running.
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    )
  }

  if (tasks.length === 0) {
    return <div className="p-4 text-gray-500">No tasks found</div>
  }

  return (
    <div className="space-y-4">
      {tasks.map((task) => (
        <div
          key={task.id}
          className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
        >
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-medium">{task.title}</h3>
              <p className="text-sm text-gray-500">
                {task.project?.name} • {task.content_type}
              </p>
            </div>
            <div className="text-sm text-gray-500">
              {task.due_date ? format(new Date(task.due_date), "MMM d, yyyy") : "No due date"}
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
              {task.status || "No status"}
            </span>
            <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">
              {task.language || "No language"}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
} 