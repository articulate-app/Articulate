"use client"

import { useEffect, useState } from "react"
import { TaskDetails } from "../components/tasks/TaskDetails"
import { TasksLayout } from "../components/tasks/TasksLayout"
import { Task, getTasks } from "../../lib/services/tasks"

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchTasks() {
      try {
        setIsLoading(true)
        const { tasks: fetchedTasks } = await getTasks({
          page: 1,
          pageSize: 50,
          sortBy: 'created_at',
          sortOrder: 'desc'
        })
        console.log('Fetched tasks:', fetchedTasks)
        setTasks(fetchedTasks)
      } catch (err) {
        console.error('Error fetching tasks:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch tasks')
      } finally {
        setIsLoading(false)
      }
    }

    fetchTasks()
  }, [])

  if (isLoading) {
    return (
      <TasksLayout>
        <div className="flex items-center justify-center h-full">
          <p>Loading tasks...</p>
        </div>
      </TasksLayout>
    )
  }

  if (error) {
    return (
      <TasksLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-red-500">{error}</p>
        </div>
      </TasksLayout>
    )
  }

  return (
    <TasksLayout>
      <div className="flex h-full">
        <div className="w-1/3 border-r p-4 overflow-y-auto">
          <h1 className="text-2xl font-bold mb-4">Tasks</h1>
          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`p-3 rounded-lg cursor-pointer ${
                  selectedTask?.id === task.id
                    ? "bg-blue-100"
                    : "hover:bg-gray-100"
                }`}
                onClick={() => setSelectedTask(task)}
              >
                <h3 className="font-medium">{task.title}</h3>
                <p className="text-sm text-gray-500">
                  {new Date(task.last_update).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="w-2/3">
          <TaskDetails task={selectedTask} />
        </div>
      </div>
    </TasksLayout>
  )
} 