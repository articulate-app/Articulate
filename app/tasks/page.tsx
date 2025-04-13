"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { TaskDetails } from "@/components/tasks/TaskDetails"

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([])
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const supabase = createClient()

  useEffect(() => {
    async function fetchTasks() {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) {
        console.error("Error fetching tasks:", error)
        return
      }

      setTasks(data || [])
    }

    fetchTasks()
  }, [])

  return (
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
                {new Date(task.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      </div>
      <div className="w-2/3">
        <TaskDetails task={selectedTask} />
      </div>
    </div>
  )
} 