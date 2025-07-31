"use client"
import { InfiniteList } from "../ui/infinite-list"
import { TaskRow } from "./TaskRow"
import type { TaskWithJoins } from "./task-types"
import React from "react"

interface TaskTableBodyProps {
  onTaskSelect?: (task: TaskWithJoins) => void
  trailingQuery: any
}

export function TaskTableBody({ onTaskSelect, trailingQuery }: TaskTableBodyProps) {
  return (
    <InfiniteList<'tasks'>
      tableName="tasks"
      columns={`id, title, delivery_date, publication_date, updated_at, users!assigned_to_id(full_name), projects!project_id_int(name,color), project_statuses!project_status_id(name,color)`}
      pageSize={50}
      trailingQuery={trailingQuery}
      renderNoResults={() => (
        <tr>
          <td colSpan={7} className="text-center text-gray-500 py-8">No tasks found</td>
        </tr>
      )}
      renderEndMessage={() => (
        <tr>
          <td colSpan={7} className="text-center text-gray-400 py-4">No more tasks</td>
        </tr>
      )}
      renderSkeleton={(count) => (
        <>
          {Array.from({ length: count }).map((_, i) => (
            <tr key={i}>
              <td colSpan={7} className="py-4 animate-pulse bg-muted" />
            </tr>
          ))}
        </>
      )}
    >
      {(tasks) => (
        <>
          {tasks.map((task, idx) => (
            <TaskRow key={task.id || idx} task={task as unknown as TaskWithJoins} onClick={onTaskSelect} />
          ))}
        </>
      )}
    </InfiniteList>
  )
} 