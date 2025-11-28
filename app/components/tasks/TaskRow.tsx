import React from "react"
import type { TaskWithJoins } from "./task-types"

interface TaskRowProps {
  task: TaskWithJoins
  onClick?: (task: TaskWithJoins) => void
}

export function TaskRow({ task, onClick }: TaskRowProps) {
  const formatDate = (dateString: string | null, isOverdue: boolean = false) => {
    if (!dateString) return ""
    const date = new Date(dateString).toLocaleDateString()
    return (
      <span className={isOverdue ? "text-red-600 font-medium" : ""}>
        {date}
      </span>
    )
  }

  return (
    <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => onClick?.(task)}>
      <td className="px-3 py-2 text-sm border-b border-gray-100">{task.title}</td>
      <td className="px-3 py-2 text-sm border-b border-gray-100">
        {formatDate(task.delivery_date, task.is_overdue)}
      </td>
      <td className="px-3 py-2 text-sm border-b border-gray-100">
        {formatDate(task.publication_date, task.is_publication_overdue)}
      </td>
      <td className="px-3 py-2 text-sm border-b border-gray-100">{task.updated_at ? new Date(task.updated_at).toLocaleDateString() : ""}</td>
      <td className="px-3 py-2 text-sm border-b border-gray-100">{task.users?.full_name || ""}</td>
      <td className="px-3 py-2 text-sm border-b border-gray-100">{task.projects?.name || ""}</td>
      <td className="px-3 py-2 text-sm border-b border-gray-100">{task.project_statuses?.name || ""}</td>
    </tr>
  )
} 
 
 
 
 