import { TASK_LIST_COLUMNS_STRING, TASK_LIST_COLUMNS, TaskListRow } from "./task-list-columns"
import { InfiniteList } from "../ui/infinite-list"
import React from "react"

interface TaskListProps {
  onTaskSelect?: (task: TaskListRow) => void
  trailingQuery?: any
  pageSize?: number
}

export function TaskList({ onTaskSelect, trailingQuery, pageSize = 25 }: TaskListProps) {
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-sm md:text-base w-full" style={{ tableLayout: 'fixed' }}>
        <thead className="sticky top-0 z-20 bg-white border-b shadow-sm">
          <tr>
            {TASK_LIST_COLUMNS.map(col => (
              <th key={col.key} className="px-3 py-2 text-left font-medium text-gray-500 border-r border-gray-200 select-none">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <InfiniteList<'tasks', TaskListRow>
          tableName="tasks"
          columns={TASK_LIST_COLUMNS_STRING}
          pageSize={pageSize}
          trailingQuery={trailingQuery}
          renderNoResults={() => (
            <tr>
              <td colSpan={TASK_LIST_COLUMNS.length} className="text-center text-gray-500 py-8">No tasks found</td>
            </tr>
          )}
          renderEndMessage={() => null}
          renderSkeleton={count => (
            <>
              {Array.from({ length: count }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={TASK_LIST_COLUMNS.length} className="py-4 animate-pulse bg-muted" />
                </tr>
              ))}
            </>
          )}
        >
          {(data, { isFetching, hasMore }) => (
            <>
              {data.length === 0 && !isFetching && (
                <tr>
                  <td colSpan={TASK_LIST_COLUMNS.length} className="text-center text-gray-500 py-8">No tasks found</td>
                </tr>
              )}
              {data.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onTaskSelect?.(row)}>
                  {TASK_LIST_COLUMNS.map(col => (
                    <td key={col.key} className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle">
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
              {isFetching && (
                <tr>
                  <td colSpan={TASK_LIST_COLUMNS.length} className="text-center text-gray-400 py-4">Loading...</td>
                </tr>
              )}
            </>
          )}
        </InfiniteList>
      </table>
    </div>
  )
}

// Use TASK_LIST_COLUMNS_STRING in your Supabase query
// Use TASK_LIST_COLUMNS for rendering columns
// Use TaskListRow for typing rows 