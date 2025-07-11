import * as React from 'react'
import { flexRender, Table } from '@tanstack/react-table'
import { cn } from '@/lib/utils'

interface TaskTableRowProps<T> {
  table: Table<T>
  columns: any[]
  onTaskSelect?: (task: T) => void
  isFetching?: boolean
  hasMore?: boolean
}

export function TaskTableRow<T>({ table, columns, onTaskSelect, isFetching, hasMore }: TaskTableRowProps<T>) {
  const data = table.getRowModel().rows.map(row => row.original)
  return (
    <tbody>
      {data.length === 0 && !isFetching && (
        <tr>
          <td colSpan={columns.length} className="text-center text-gray-500 py-8">No tasks found</td>
        </tr>
      )}
      {table.getRowModel().rows.map(row => (
        <tr key={row.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onTaskSelect?.(row.original)}>
          {row.getVisibleCells().map(cell => (
            <td
              key={cell.id}
              style={{
                width: cell.column.getSize(),
                minWidth: cell.column.getSize(),
                maxWidth: cell.column.getSize(),
              }}
              className="px-3 py-2 text-sm border-b border-gray-100 truncate align-middle"
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </td>
          ))}
        </tr>
      ))}
      {isFetching && (
        <tr>
          <td colSpan={columns.length} className="text-center text-gray-400 py-4">Loading...</td>
        </tr>
      )}
      {!hasMore && data.length > 0 && (
        <tr>
          <td colSpan={columns.length} className="text-center text-muted-foreground py-4 text-sm">You&apos;ve reached the end.</td>
        </tr>
      )}
    </tbody>
  )
} 