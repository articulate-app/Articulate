"use client"

import { useEffect, useState } from "react"
import { Task, getTasks } from "@/lib/services/tasks"

// Helper function to format date
function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "No due date"
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  } catch (error) {
    console.error('Error formatting date:', error)
    return "Invalid date"
  }
}

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
        
        if (!result) {
          throw new Error("No response from server")
        }
        
        if (!result.tasks) {
          throw new Error("No tasks returned from the server")
        }
        
        if (result.tasks.length === 0) {
          console.log("No tasks found in the database")
        }
        
        setTasks(result.tasks)
      } catch (err) {
        console.error("Error loading tasks:", err)
        const errorMessage = err instanceof Error 
          ? err.message 
          : "Failed to load tasks. Please check your connection and try again."
        setError(errorMessage)
      } finally {
        setLoading(false)
      }
    }

    loadTasks()
  }, [])

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg"></div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-red-500 mb-2">Error: {error}</div>
        <div className="text-sm text-gray-500 mb-4">
          This could be due to:
          <ul className="list-disc list-inside mt-2">
            <li>No internet connection</li>
            <li>Supabase service being down</li>
            <li>Database permissions issues</li>
            <li>Table structure mismatch</li>
          </ul>
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
    return (
      <div className="p-4 text-center">
        <div className="text-gray-500 mb-2">No tasks found</div>
        <p className="text-sm text-gray-400">
          Create your first task to get started
        </p>
      </div>
    )
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
              <h3 className="font-medium">{task.title || "Untitled Task"}</h3>
              <p className="text-sm text-gray-500">
                {task.project?.name ? `${task.project.name} • ` : ""}
                {task.content_type?.name || "No type specified"}
              </p>
            </div>
            <div className="text-sm text-gray-500">
              {formatDate(task.delivery_date)}
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
              {task.status?.name || "No status"}
            </span>
            <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">
              {task.language?.name || "No language"}
            </span>
            <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
              {task.production_type?.name || "No production type"}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
} 