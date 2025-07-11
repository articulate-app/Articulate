import React from "react"
import type { TaskWithJoins } from "./task-types"

interface TaskRowProps {
  task: TaskWithJoins
  onClick?: (task: TaskWithJoins) => void
}

export function TaskRow({ task, onClick }: TaskRowProps) {
  return (
    <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => onClick?.(task)}>
      <td className="px-3 py-2 text-sm border-b border-gray-100">{task.title}</td>
      <td className="px-3 py-2 text-sm border-b border-gray-100">{task.delivery_date ? new Date(task.delivery_date).toLocaleDateString() : ""}</td>
      <td className="px-3 py-2 text-sm border-b border-gray-100">{task.publication_date ? new Date(task.publication_date).toLocaleDateString() : ""}</td>
      <td className="px-3 py-2 text-sm border-b border-gray-100">{task.updated_at ? new Date(task.updated_at).toLocaleDateString() : ""}</td>
      <td className="px-3 py-2 text-sm border-b border-gray-100">{task.users?.full_name || ""}</td>
      <td className="px-3 py-2 text-sm border-b border-gray-100">{task.projects?.name || ""}</td>
      <td className="px-3 py-2 text-sm border-b border-gray-100">{task.project_statuses?.name || ""}</td>
    </tr>
  )
} 
 
 
 
 