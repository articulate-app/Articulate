import * as React from 'react'
import { flexRender, Table } from '@tanstack/react-table'
import { cn } from '@/lib/utils'

interface TaskTableRowProps<T> {
  table: Table<T>
  columns: any[]
  onTaskSelect?: (task: T) => void
  isFetching?: boolean
  hasMore?: boolean
  selectedTaskId?: string | number | null
}

export function TaskTableRow<T>({ table, columns, onTaskSelect, isFetching, hasMore, selectedTaskId }: TaskTableRowProps<T>) {
  console.log('[TaskTableRow] columns:', columns, 'type:', typeof columns, 'isArray:', Array.isArray(columns));
  const safeColumns = columns || [];
  const data = table.getRowModel().rows.map(row => row.original)
  const rows = table.getRowModel().rows
  return (
    <>
      {rows.map(row => {
        const task = row.original as any;
        const isSelected = selectedTaskId && String(task.id) === String(selectedTaskId);
        
        return (
          <tr 
            key={row.id} 
            className={cn(
              "hover:bg-gray-50 cursor-pointer",
              isSelected && "bg-gray-100"
            )} 
            onClick={() => onTaskSelect?.(row.original)}
          >
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
        );
      })}

      {isFetching && (
        <tr>
          <td colSpan={safeColumns.length} className="text-center text-gray-400 py-4">Loading...</td>
        </tr>
      )}

      {rows.length === 0 && !isFetching && (
        <tr>
          <td colSpan={safeColumns.length} className="text-center text-gray-500 py-8">No tasks found</td>
        </tr>
      )}
      
      {!hasMore && data.length > 0 && (
        <tr>
          <td colSpan={safeColumns.length} className="text-center text-muted-foreground py-4 text-sm">You&apos;ve reached the end.</td>
        </tr>
      )}
    </>
  )
} 