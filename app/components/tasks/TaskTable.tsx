import { Suspense } from "react"
import { TaskTableBody } from "./TaskTableBody"
import type { TaskWithJoins } from "./task-types"

interface TaskTableProps {
  onTaskSelect?: (task: TaskWithJoins) => void
  trailingQuery: any
}

export default function TaskTable({ onTaskSelect, trailingQuery }: TaskTableProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="relative h-full min-h-0 flex-1">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-20 bg-white border-b shadow-sm">
            <tr>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 min-w-[120px]">Title</th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 min-w-[120px]">Assignee</th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 min-w-[120px]">Project</th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 min-w-[120px]">Status</th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 min-w-[120px]">Delivery Date</th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 min-w-[120px]">Publication Date</th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-500 min-w-[120px]">Last Update</th>
            </tr>
          </thead>
          <Suspense fallback={<tbody><tr><td colSpan={7}>Loading…</td></tr></tbody>}>
            <TaskTableBody onTaskSelect={onTaskSelect} trailingQuery={trailingQuery} />
          </Suspense>
        </table>
      </div>
    </div>
  )
} 